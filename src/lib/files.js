'use strict';

const fs = require('fs');
const path = require('path');

/** Recursively walk a directory; returns { size, items } tree. */
function walkTree(dirPath) {
  if (!fs.existsSync(dirPath)) return { size: 0, items: [] };

  let total = 0;
  const items = fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = walkTree(full);
      total += sub.size;
      return {
        name: entry.name,
        type: 'dir',
        size: sub.size,
        sizeHuman: humanSize(sub.size),
        children: sub.items,
      };
    }
    const stat = fs.statSync(full);
    total += stat.size;
    return {
      name: entry.name,
      type: 'file',
      size: stat.size,
      sizeHuman: humanSize(stat.size),
    };
  });
  return { size: total, items };
}

/** Format byte size as human-readable string. */
function humanSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Resolve a target path safely against a base directory.
 * Throws if the resolved path escapes the base (path traversal protection).
 *
 * Returns the absolute resolved path.
 */
function resolveSafe(baseDir, target) {
  const base = path.resolve(baseDir);
  const full = path.resolve(target);
  const rel = path.relative(base, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('Path traversal detected');
    err.code = 'EPATH';
    throw err;
  }
  return full;
}

/** Atomically write a file (write to .tmp then rename). */
function writeFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/** Ensure a directory exists. */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

/** Remove a file or directory recursively (no-op if missing). */
function rmRecursive(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

module.exports = {
  walkTree,
  humanSize,
  resolveSafe,
  writeFileAtomic,
  ensureDir,
  rmRecursive,
};
