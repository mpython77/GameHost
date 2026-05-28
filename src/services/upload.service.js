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
const { Mutex } = require('../lib/mutex');

class UploadService {
  constructor(gamesService, bus) {
    this.games = gamesService;
    this.bus = bus; // optional EventBus for live updates / analytics
    // Serialize uploads so concurrent ones don't race on the slug allocator
    // or clobber each other's intermediate folder state.
    this._mutex = new Mutex();
  }

  /**
   * Process an upload (mutex-protected — concurrent uploads serialize).
   */
  process(input) {
    return this._mutex.run(() => this._processInner(input));
  }

  async _processInner({ fields, gameFile, thumbnailFile }) {
    if (!gameFile) {
      throw new ValidationError('Fayl yuklanmadi');
    }

    // Reject zero-byte uploads — they slip through fileFilter (which only
    // checks ext/mimetype) and would create a broken game directory.
    if (!gameFile.size || gameFile.size === 0) {
      this._cleanupFile(gameFile.path);
      this._cleanupFile(thumbnailFile?.path);
      throw new ValidationError("Fayl bo'sh — ma'noli kontent yuklang");
    }

    const ext = path.extname(gameFile.originalname).toLowerCase();
    if (!config.ALLOWED_GAME_EXTS.includes(ext)) {
      this._cleanupFile(gameFile.path);
      throw new ValidationError("Faqat .html yoki .zip fayllar qabul qilinadi");
    }

    // ─── Slug + uniqueness ───
    // `id` is the public identifier (clean slug). On collision with an
    // existing PUBLIC game, suffix with -2, -3, ...
    // For PRIVATE games, the on-disk `folder` gets an unguessable suffix
    // derived from the privateToken, so direct URL access (e.g. guessing
    // /games/<slug>/index.html) is no longer possible.
    const baseSlug = slugify(fields.gameName_en || fields.gameName_uz);
    const id = this._allocateUniqueId(baseSlug);

    // Pre-generate privateToken so we can use it in the folder name
    const privateToken = fields.isPrivate
      ? crypto.randomBytes(24).toString('hex')
      : null;

    // Folder layout:
    //   public:  <id>                    (e.g. "qora-tuynuk")
    //   private: <id>__<token-prefix>    (e.g. "qora-tuynuk__a1b2c3d4...")
    const folder = privateToken
      ? `${id}__${privateToken.slice(0, 24)}`
      : id;

    const gameDir = path.join(config.GAMES_DIR, folder);

    // Clean any existing folder (defensive — should not exist after _allocateUniqueId)
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
    const record = {
      id,
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
        uz: fields.gameName_uz || id,
        ru: fields.gameName_ru || fields.gameName_uz || id,
        en: fields.gameName_en || fields.gameName_uz || id,
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
      folder: record.folder,
      isPrivate: record.isPrivate,
      ext,
    });

    // Publish for live admin updates + analytics. Strip privateToken so
    // it never lands in the SSE wire (SSE consumers might log events).
    if (this.bus) {
      const { EVENTS } = require('../lib/event-bus');
      this.bus.publish(EVENTS.GAME_UPLOADED, {
        gameId: record.id,
        name: record.name,
        category: record.category,
        isPrivate: record.isPrivate,
        thumbnail: record.thumbnail,
        folder: record.folder,
        createdAt: record.createdAt,
      });
    }
    return record;
  }

  /**
   * Find an unused id by appending -2, -3, ... to the base slug if needed.
   * Checks both the DB (in case folder was manually deleted but DB row remains)
   * and the on-disk games directory.
   */
  _allocateUniqueId(baseSlug) {
    let candidate = baseSlug;
    let suffix = 1;
    const taken = (slug) =>
      this.games.db.getById(slug) !== null ||
      fs.existsSync(path.join(config.GAMES_DIR, slug));
    while (taken(candidate)) {
      suffix += 1;
      candidate = `${baseSlug}-${suffix}`;
      if (suffix > 1000) {
        // Defensive: avoid pathological loops
        candidate = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
        break;
      }
    }
    return candidate;
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
