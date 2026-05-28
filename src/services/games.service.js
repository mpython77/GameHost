/**
 * Games service — business logic on top of GamesDB.
 * Routes call this, never the DB directly.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../lib/logger');
const { rmRecursive } = require('../lib/files');
const { NotFoundError } = require('../lib/errors');

class GamesService {
  constructor(db) {
    this.db = db;
  }

  // ─── Read ───
  list(opts) { return this.db.query(opts); }
  publicList() { return this.db.getPublicView(); }
  adminList() { return this.db.getAdminView(); }

  getById(id) {
    const game = this.db.getById(id);
    if (!game) throw new NotFoundError("O'yin topilmadi");
    return game;
  }

  /** Strip secrets for public consumption. */
  publicView(game) {
    const { ownerToken, privateToken, ...safe } = game;
    return safe;
  }

  /** Strip ownerToken only (admin can see privateToken). */
  adminView(game) {
    const { ownerToken, ...rest } = game;
    return rest;
  }

  getByPrivateToken(token) {
    const game = this.db.getByToken(token);
    if (!game) throw new NotFoundError("Maxfiy o'yin topilmadi yoki token noto'g'ri");
    return game;
  }

  // ─── Write ───
  add(game) {
    return this.db.add(game);
  }

  /** Increment play counter (called on iframe load). */
  trackPlay(id, meta = {}) {
    const game = this.db.incrementPlay(id);
    if (!game) throw new NotFoundError("O'yin topilmadi");
    logger.info('play.tracked', {
      gameId: id,
      playCount: game.playCount,
      ip: meta.ip,
    });
    return game;
  }

  /**
   * Toggle privacy of a game.
   *
   * Going PRIVATE: generate a new token, rename the on-disk folder to
   *   "<id>__<token-prefix>" so the URL becomes unguessable.
   * Going PUBLIC: clear the token and rename the folder back to "<id>".
   *
   * If the rename fails, the DB is not updated (stays consistent with disk).
   */
  setPrivacy(id, isPrivate) {
    const game = this.getById(id);
    if (!!game.isPrivate === !!isPrivate) return game; // no-op

    const oldFolder = game.folder;
    const oldDir = path.join(config.GAMES_DIR, oldFolder);
    let newFolder;
    let newToken = null;

    if (isPrivate) {
      newToken = crypto.randomBytes(24).toString('hex');
      newFolder = `${id}__${newToken.slice(0, 24)}`;
    } else {
      newFolder = id;
    }

    // Same folder? Skip rename. Otherwise rename safely.
    if (newFolder !== oldFolder) {
      const newDir = path.join(config.GAMES_DIR, newFolder);
      if (fs.existsSync(newDir)) {
        // Should not happen — newDir collides. Avoid clobbering.
        rmRecursive(newDir);
      }
      try {
        fs.renameSync(oldDir, newDir);
      } catch (err) {
        logger.error('privacy.rename_failed', { id, oldFolder, newFolder, error: err.message });
        throw new Error("Folder qayta nomlashda xatolik — privacy o'zgartirilmadi");
      }
    }

    return this.db.update(id, {
      isPrivate: !!isPrivate,
      privateToken: newToken,
      folder: newFolder,
    });
  }

  /** Delete a game (DB row + on-disk files). */
  delete(id) {
    const game = this.getById(id);
    rmRecursive(path.join(config.GAMES_DIR, game.folder));
    this.db.remove(id);
    logger.info('game.deleted', { gameId: id, folder: game.folder });
    return game;
  }

  /** Delete every game and its files. */
  deleteAll() {
    const games = this.db.getAll();
    let deleted = 0;
    for (const game of games) {
      rmRecursive(path.join(config.GAMES_DIR, game.folder));
      deleted++;
    }
    this.db.removeAll();
    logger.warn('games.delete_all', { count: deleted });
    return deleted;
  }

  /** Aggregated stats for the admin dashboard. */
  stats() {
    const games = this.db.getAll();
    return {
      total: games.length,
      public: games.filter((g) => !g.isPrivate).length,
      private: games.filter((g) => g.isPrivate).length,
      totalPlays: games.reduce((sum, g) => sum + (g.playCount || 0), 0),
      topGames: games
        .slice()
        .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
        .slice(0, 5)
        .map((g) => this.publicView(g)),
    };
  }

  /** Read game files into a ZIP buffer for download. */
  getGameDir(id) {
    const game = this.getById(id);
    const dir = path.join(config.GAMES_DIR, game.folder);
    if (!fs.existsSync(dir)) {
      throw new NotFoundError("O'yin fayllari topilmadi");
    }
    return { game, dir };
  }
}

module.exports = { GamesService };
