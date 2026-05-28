'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { ValidationError } = require('./errors');

/**
 * Validate a single ZIP entry name for path-traversal / null-byte / drive-letter attacks.
 * Returns true if the entry is safe.
 */
function isSafeEntryName(entryName) {
  if (path.isAbsolute(entryName)) return false;
  if (entryName.includes('..')) return false;
  if (entryName.includes('\0')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(entryName)) return false; // Windows drive letter
  return true;
}

/**
 * Detect a symlink entry in a ZIP. Symlinks allow attacks where the link
 * points to a sensitive file (e.g. /etc/passwd) and a later read follows it.
 *
 * In ZIP, symlinks are encoded by setting the upper 4 bits of the Unix
 * file mode (in the high 16 bits of the external attribute) to 0xA (S_IFLNK).
 */
function isSymlinkEntry(entry) {
  // adm-zip stores `attr` as a 32-bit external attribute. Top 16 bits are
  // the Unix file mode. 0xA000 == S_IFLNK.
  const attr = entry && (entry.attr || (entry.header && entry.header.attr));
  if (typeof attr !== 'number') return false;
  const mode = (attr >>> 16) & 0xFFFF;
  return (mode & 0xF000) === 0xA000;
}

/**
 * Safely extract a ZIP archive into a directory.
 * Performs a full ZIP-Slip + symlink pre-scan before any extraction.
 *
 * @throws {ValidationError} if the archive is malicious or invalid.
 */
function extractSafe(zipPath, destDir) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err) {
    throw new ValidationError('ZIP faylni ochib bo\'lmadi: ' + err.message);
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new ValidationError('ZIP fayl bo\'sh');
  }

  for (const entry of entries) {
    if (!isSafeEntryName(entry.entryName)) {
      throw new ValidationError(
        'ZIP fayl xavfsiz emas (path traversal aniqlandi): ' + entry.entryName
      );
    }
    if (isSymlinkEntry(entry)) {
      throw new ValidationError(
        'ZIP fayl symlink ichida — xavfsizlik uchun rad etildi: ' + entry.entryName
      );
    }
  }

  zip.extractAllTo(destDir, true);
}

/**
 * After extraction, verify there is an index.html. If not but exactly one
 * subfolder exists with index.html inside, hoist its contents up one level.
 *
 * @throws {ValidationError} if no index.html can be found.
 */
function ensureIndexHtmlAtRoot(gameDir) {
  if (fs.existsSync(path.join(gameDir, 'index.html'))) return;

  const entries = fs.readdirSync(gameDir);
  if (entries.length === 1) {
    const subDir = path.join(gameDir, entries[0]);
    const stat = fs.statSync(subDir);
    if (stat.isDirectory() && fs.existsSync(path.join(subDir, 'index.html'))) {
      // Hoist contents up
      for (const f of fs.readdirSync(subDir)) {
        fs.renameSync(path.join(subDir, f), path.join(gameDir, f));
      }
      fs.rmdirSync(subDir);
      return;
    }
  }
  throw new ValidationError('ZIP ichida index.html fayli topilmadi');
}

/** Create a ZIP buffer from a directory's contents. */
function zipDirectoryToBuffer(dir) {
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  return zip.toBuffer();
}

module.exports = {
  isSafeEntryName,
  isSymlinkEntry,
  extractSafe,
  ensureIndexHtmlAtRoot,
  zipDirectoryToBuffer,
};
