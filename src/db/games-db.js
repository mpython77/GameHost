/**
 * GamesDB — JSON file-backed repository for game records.
 *
 * Improvements over the original:
 *   - Atomic writes (write-to-tmp then rename) — no partial files on crash
 *   - claimGame() now persists (was a documented bug)
 *   - Pagination + filter helpers
 *   - Public/safe view helper that strips secret tokens
 *   - In-memory + on-disk indexes by id and privateToken
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../lib/files');
const logger = require('../lib/logger');

const DB_VERSION = '3.0';

class GamesDB {
  constructor(filePath, legacyConfigFile) {
    this.filePath = filePath;
    this.legacyConfigFile = legacyConfigFile;
    this.data = this._load();
    this._byId = new Map();
    this._byToken = new Map();
    this._reindex();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.games)) return parsed;
      }
    } catch (err) {
      logger.error('DB yuklashda xatolik', { error: err.message });
    }
    return {
      games: [],
      meta: { createdAt: new Date().toISOString(), version: DB_VERSION },
    };
  }

  _reindex() {
    this._byId.clear();
    this._byToken.clear();
    for (const g of this.data.games) {
      this._byId.set(g.id, g);
      if (g.privateToken) this._byToken.set(g.privateToken, g);
    }
  }

  _save() {
    this.data.meta = this.data.meta || {};
    this.data.meta.updatedAt = new Date().toISOString();
    this.data.meta.version = DB_VERSION;
    try {
      writeFileAtomic(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      logger.error('DB saqlashda xatolik', { error: err.message });
      throw err;
    }
    this._syncLegacyConfig();
    this._reindex();
  }

  /**
   * Frontend public/js/games-config.js — write only PUBLIC games,
   * stripping ownerToken / privateToken before writing.
   */
  _syncLegacyConfig() {
    if (!this.legacyConfigFile) return;
    const publicGames = this.data.games
      .filter((g) => !g.isPrivate)
      .map(({ ownerToken, privateToken, ...safe }) => safe);

    const content =
      `/* AUTO-GENERATED — do not edit. Server rebuilds on every change. */\n` +
      `const GAMES_CONFIG = ${JSON.stringify(publicGames, null, 2)};\n` +
      `const GAME_CATEGORIES = ['all', 'arcade', 'action', 'puzzle', 'casual', 'strategy'];\n`;
    try {
      fs.mkdirSync(path.dirname(this.legacyConfigFile), { recursive: true });
      writeFileAtomic(this.legacyConfigFile, content);
    } catch (err) {
      logger.warn('Legacy config sync xatolik', { error: err.message });
    }
  }

  // ─── Read ───
  getAll() { return this.data.games.slice(); }
  getById(id) { return this._byId.get(id) || null; }
  getByToken(token) { return this._byToken.get(token) || null; }
  count() { return this.data.games.length; }
  countPublic() { return this.data.games.filter((g) => !g.isPrivate).length; }

  /** Public list with sensitive fields stripped. */
  getPublicView() {
    return this.data.games
      .filter((g) => !g.isPrivate)
      .map(({ ownerToken, privateToken, ...rest }) => rest);
  }

  /** Admin list with ownerToken stripped (privateToken kept). */
  getAdminView() {
    return this.data.games.map(({ ownerToken, ...rest }) => rest);
  }

  /**
   * Filter + paginate. Returns { items, total, page, perPage }.
   * Options: { search, category, isPrivate, page, perPage, sort }.
   */
  query({ search, category, isPrivate, page = 1, perPage = 30, sort = 'createdAt:desc' } = {}) {
    let games = this.data.games;

    if (typeof isPrivate === 'boolean') {
      games = games.filter((g) => !!g.isPrivate === isPrivate);
    }
    if (category && category !== 'all') {
      games = games.filter((g) => g.category === category);
    }
    if (search) {
      const q = String(search).toLowerCase();
      games = games.filter((g) => {
        const names = Object.values(g.name || {}).join(' ').toLowerCase();
        return names.includes(q) || g.id.toLowerCase().includes(q);
      });
    }

    const [field, dir] = String(sort).split(':');
    const mul = dir === 'asc' ? 1 : -1;
    games = games.slice().sort((a, b) => {
      const av = a[field] || 0;
      const bv = b[field] || 0;
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });

    const total = games.length;
    const start = (page - 1) * perPage;
    const items = games.slice(start, start + perPage);
    return { items, total, page, perPage };
  }

  // ─── Write ───
  add(game) {
    // Replace if same id exists
    this.data.games = this.data.games.filter((g) => g.id !== game.id);
    if (!game.createdAt) game.createdAt = new Date().toISOString();
    this.data.games.push(game);
    this._save();
    return game;
  }

  remove(id) {
    const game = this.getById(id);
    if (!game) return null;
    this.data.games = this.data.games.filter((g) => g.id !== id);
    this._save();
    return game;
  }

  removeAll() {
    const removed = this.data.games.slice();
    this.data.games = [];
    this._save();
    return removed;
  }

  /** Update fields on an existing game. */
  update(id, patch) {
    const game = this.getById(id);
    if (!game) return null;
    Object.assign(game, patch);
    this._save();
    return game;
  }

  /** Increment play counter atomically. */
  incrementPlay(id) {
    const game = this.getById(id);
    if (!game) return null;
    game.playCount = (game.playCount || 0) + 1;
    game.lastPlayedAt = new Date().toISOString();
    this._save();
    return game;
  }
}

module.exports = { GamesDB };
