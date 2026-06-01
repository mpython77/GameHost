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

// Minimal style injected into every game's index.html.
// We only hide Cocos default chrome (header/footer) and set a black body
// background. We intentionally do NOT override canvas or container dimensions —
// Cocos Creator manages those itself and responds to window.resize events.
// Overriding canvas width/height with CSS breaks the resize logic and causes
// distorted/stretched layouts when the aspect-ratio box changes size.
const STYLE_TAG = `
<style id="gamehost-injected-style">
  /* Hide default Cocos Creator navigation chrome */
  #header, .header, #footer, .footer, nav, #nav {
    display: none !important;
  }
  /* Clean body reset — let the game fill its iframe */
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: #000 !important;
  }
</style>
`;

function injectStylesToAllGames() {
  const gamesDir = config.GAMES_DIR;
  if (!fs.existsSync(gamesDir)) return;

  try {
    const entries = fs.readdirSync(gamesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const indexPath = path.join(gamesDir, entry.name, 'index.html');
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf8');
        // Replace existing injected style (if any) so updated templates apply.
        // Also inject fresh if not yet present.
        if (html.includes('id="gamehost-injected-style"')) {
          // Remove the old tag entirely, then re-inject below.
          html = html.replace(/<style id="gamehost-injected-style">[\s\S]*?<\/style>/i, '');
        }
        if (html.includes('</head>')) {
          html = html.replace('</head>', `${STYLE_TAG}</head>`);
        } else if (html.includes('<body>')) {
          html = html.replace('<body>', `<body>${STYLE_TAG}`);
        } else {
          html = STYLE_TAG + html;
        }
        fs.writeFileSync(indexPath, html, 'utf8');
        logger.info('legacy.style_injected', { folder: entry.name });
      }
    }
  } catch (err) {
    logger.warn('legacy.style_injection_failed', { error: err.message });
  }
}

function runAll(db) {
  migrateLegacyGameFiles();
  migrateLegacyConfig(db);
  injectStylesToAllGames();
}

module.exports = { runAll, migrateLegacyGameFiles, migrateLegacyConfig, injectStylesToAllGames };
