/**
 * One-time migration helpers — make a v2.x install boot cleanly under v3.
 *
 *  1. Move legacy ./games/* into data/games/* (idempotent — only new entries)
 *  2. Import legacy public/js/games-config.js entries into the JSON DB
 *     (only when DB is empty)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../lib/logger');

function migrateLegacyGameFiles() {
  const oldGamesDir = path.join(config.ROOT, 'games');
  if (!fs.existsSync(oldGamesDir)) return 0;

  let migrated = 0;
  const entries = fs.readdirSync(oldGamesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = path.join(oldGamesDir, entry.name);
    const dest = path.join(config.GAMES_DIR, entry.name);
    if (!fs.existsSync(dest)) {
      fs.cpSync(src, dest, { recursive: true });
      migrated++;
    }
  }
  if (migrated > 0) {
    logger.info('legacy.files.migrated', { count: migrated });
  }
  return migrated;
}

function migrateLegacyConfig(db) {
  if (db.count() > 0) return 0;
  if (!fs.existsSync(config.LEGACY_CONFIG_FILE)) return 0;

  try {
    const content = fs.readFileSync(config.LEGACY_CONFIG_FILE, 'utf8');

    // Skip our own auto-generated file. This avoids "phantom resurrection":
    // if data/ is wiped but public/js/games-config.js (auto-written on every
    // save) is still around, we would otherwise re-import non-existent games.
    if (content.includes('AUTO-GENERATED')) {
      return 0;
    }

    const match = content.match(/const GAMES_CONFIG = (\[[\s\S]*?\]);/);
    if (!match) return 0;

    let oldGames;
    try {
      oldGames = JSON.parse(match[1]);
    } catch {
      logger.warn('legacy.config.parse_failed');
      return 0;
    }
    if (!Array.isArray(oldGames) || oldGames.length === 0) return 0;

    let imported = 0;
    for (const game of oldGames) {
      // Only import games whose on-disk folder actually exists. This avoids
      // importing stale entries for games whose files were deleted.
      const folder = game.folder || game.id;
      if (!folder) continue;
      if (!fs.existsSync(path.join(config.GAMES_DIR, folder))) {
        logger.debug('legacy.skip_missing_folder', { folder });
        continue;
      }
      if (!game.createdAt) game.createdAt = new Date().toISOString();
      db.add(game);
      imported++;
    }
    if (imported > 0) {
      logger.info('legacy.config.imported', { count: imported });
    }
    return imported;
  } catch (err) {
    logger.warn('legacy.config.error', { error: err.message });
    return 0;
  }
}

function runAll(db) {
  migrateLegacyGameFiles();
  migrateLegacyConfig(db);
}

module.exports = { runAll, migrateLegacyGameFiles, migrateLegacyConfig };
