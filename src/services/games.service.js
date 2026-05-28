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

  /** Toggle privacy of a game. Generates token when going private. */
  setPrivacy(id, isPrivate) {
    const game = this.getById(id);
    const patch = { isPrivate };
    if (!isPrivate) {
      patch.privateToken = null;
    } else if (!game.privateToken) {
      patch.privateToken = crypto.randomBytes(16).toString('hex');
    }
    return this.db.update(id, patch);
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
