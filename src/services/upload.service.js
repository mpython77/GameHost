/**
 * Upload service — handles HTML/ZIP intake, slug generation, extraction,
 * thumbnail processing, and DB persistence.
 *
 * Cleans up temp files and partial directories on failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../lib/logger');
const { ensureDir, rmRecursive } = require('../lib/files');
const { extractSafe, ensureIndexHtmlAtRoot } = require('../lib/zip');
const { slugify } = require('../lib/slugify');
const { ValidationError } = require('../lib/errors');

class UploadService {
  constructor(gamesService) {
    this.games = gamesService;
  }

  /**
   * Process an upload.
   *
   * @param {object} input
   * @param {object} input.fields  Validated text fields from the form
   * @param {object} input.gameFile  Multer file { path, originalname, ... }
   * @param {object|null} input.thumbnailFile
   * @returns {object}  Persisted game record (privateToken stripped on caller side)
   */
  async process({ fields, gameFile, thumbnailFile }) {
    if (!gameFile) {
      throw new ValidationError('Fayl yuklanmadi');
    }

    const ext = path.extname(gameFile.originalname).toLowerCase();
    if (!config.ALLOWED_GAME_EXTS.includes(ext)) {
      this._cleanupFile(gameFile.path);
      throw new ValidationError("Faqat .html yoki .zip fayllar qabul qilinadi");
    }

    const folder = slugify(fields.gameName_en || fields.gameName_uz);
    const gameDir = path.join(config.GAMES_DIR, folder);

    // Clean any existing folder (replace upload semantics)
    rmRecursive(gameDir);
    ensureDir(gameDir);

    try {
      if (ext === '.zip') {
        extractSafe(gameFile.path, gameDir);
        ensureIndexHtmlAtRoot(gameDir);
      } else {
        // Plain HTML — copy as index.html
        fs.copyFileSync(gameFile.path, path.join(gameDir, 'index.html'));
      }
    } catch (err) {
      rmRecursive(gameDir);
      this._cleanupFile(gameFile.path);
      this._cleanupFile(thumbnailFile?.path);
      throw err;
    } finally {
      this._cleanupFile(gameFile.path);
    }

    // Thumbnail (optional)
    let thumbnailName = null;
    if (thumbnailFile) {
      try {
        const thumbExt = (path.extname(thumbnailFile.originalname).toLowerCase()) || '.jpg';
        if (!config.ALLOWED_IMAGE_EXTS.includes(thumbExt)) {
          throw new ValidationError('Thumbnail formati noto\'g\'ri');
        }
        thumbnailName = `thumbnail${thumbExt}`;
        fs.copyFileSync(thumbnailFile.path, path.join(gameDir, thumbnailName));
      } catch (err) {
        // Thumbnail xatolik — game qabul qilinadi, faqat thumbnailsiz
        logger.warn('Thumbnail saqlanmadi', { error: err.message });
        thumbnailName = null;
      } finally {
        this._cleanupFile(thumbnailFile.path);
      }
    }

    // Persist
    const privateToken = fields.isPrivate
      ? crypto.randomBytes(16).toString('hex')
      : null;

    const record = {
      id: folder,
      folder,
      uploadedAt: Date.now(),
      thumbnail: thumbnailName,
      category: fields.category,
      version: fields.version,
      isPrivate: fields.isPrivate,
      privateToken,
      playCount: 0,
      lastPlayedAt: null,
      name: {
        uz: fields.gameName_uz || folder,
        ru: fields.gameName_ru || fields.gameName_uz || folder,
        en: fields.gameName_en || fields.gameName_uz || folder,
      },
      description: {
        uz: fields.gameDesc_uz || '',
        ru: fields.gameDesc_ru || fields.gameDesc_uz || '',
        en: fields.gameDesc_en || fields.gameDesc_uz || '',
      },
    };

    this.games.add(record);
    logger.info('game.uploaded', {
      id: record.id,
      isPrivate: record.isPrivate,
      ext,
    });
    return record;
  }

  _cleanupFile(p) {
    if (!p) return;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
      logger.warn('Temp fayl tozalash xatolik', { path: p, error: err.message });
    }
  }
}

module.exports = { UploadService };
