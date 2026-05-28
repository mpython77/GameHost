/**
 * Express app factory.
 *
 * Wires:
 *   config -> services -> middleware -> routes -> static -> error handlers
 *
 * Pure: returns an Express app; doesn't `listen()` itself.
 */

'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./config');
const logger = require('./lib/logger');
const { ensureDir } = require('./lib/files');
const { loadOrCreateSecret } = require('./lib/secret-store');

const { GamesDB } = require('./db/games-db');
const { TokenService } = require('./services/token.service');
const { GamesService } = require('./services/games.service');
const { UploadService } = require('./services/upload.service');
const { QRService } = require('./services/qr.service');
const { StorageService } = require('./services/storage.service');

const { cors } = require('./middleware/cors');
const { noCacheApi } = require('./middleware/no-cache');
const { notFound, errorHandler } = require('./middleware/error-handler');

const { buildApiRouter } = require('./routes');
const migrations = require('./migrations/legacy');

function createApp() {
  // ─── Bootstrap directories ───
  ensureDir(config.DATA_DIR);
  ensureDir(config.GAMES_DIR);
  ensureDir(config.UPLOADS_DIR);
  ensureDir(path.join(config.PUBLIC_DIR, 'js'));

  // ─── Service container ───
  const adminSecret = loadOrCreateSecret(config.SECRET_FILE, config.ADMIN_SECRET_ENV);
  const db = new GamesDB(config.DB_FILE, config.LEGACY_CONFIG_FILE);

  // Run migrations BEFORE building services that depend on DB state
  migrations.runAll(db);
  // Re-sync legacy config (in case migrations changed DB contents)
  db._syncLegacyConfig();

  const tokens = new TokenService({
    secret: adminSecret,
    ttlMs: config.ADMIN_TOKEN_TTL_MS,
    denylistFile: config.TOKEN_DENYLIST_FILE,
  });
  const games = new GamesService(db);
  const uploads = new UploadService(games);
  const qr = new QRService();
  const storage = new StorageService();

  // ─── Express app ───
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Middleware (global)
  app.use(compression());
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(express.json({ limit: '256kb' }));

  // CORS only for API
  app.use('/api', cors);
  app.use('/api', noCacheApi);

  // Mount API routes
  const deps = { games, uploads, tokens, qr, storage };
  app.use('/api', buildApiRouter(deps));

  // Static: game files (cache disabled — uploads can be replaced)
  app.use('/games', express.static(config.GAMES_DIR, {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  }));

  // Static: frontend (public/) with sane caching
  const staticOpts = {
    maxAge: config.isProd ? '1d' : '0',
    etag: true,
  };
  app.use('/css', express.static(path.join(config.PUBLIC_DIR, 'css'), staticOpts));
  app.use('/images', express.static(path.join(config.PUBLIC_DIR, 'images'), staticOpts));

  // games-config.js must always be fresh
  app.get('/js/games-config.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(config.LEGACY_CONFIG_FILE, (err) => {
      if (err) res.status(404).send('// games-config.js not yet generated');
    });
  });
  app.use('/js', express.static(path.join(config.PUBLIC_DIR, 'js'), staticOpts));

  // HTML pages — no cache so updates are immediate
  const PAGES = ['index.html', 'play.html', 'upload.html', 'admin.html'];
  for (const page of PAGES) {
    app.get(`/${page}`, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(config.PUBLIC_DIR, page));
    });
  }
  app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
  });

  // 404 + error handler last
  app.use(notFound);
  app.use(errorHandler);

  // Expose deps for tests
  app.locals.deps = deps;
  app.locals.config = config;
  app.locals.logger = logger;

  return app;
}

module.exports = { createApp };
