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
const { cleanOrphans } = require('./lib/cleanup');

const { GamesDB } = require('./db/games-db');
const { TokenService } = require('./services/token.service');
const { GamesService } = require('./services/games.service');
const { UploadService } = require('./services/upload.service');
const { QRService } = require('./services/qr.service');
const { StorageService } = require('./services/storage.service');
const { AnalyticsService } = require('./services/analytics.service');
const { SseTicketService } = require('./services/sse-ticket.service');
const { EventBus } = require('./lib/event-bus');
const { Mutex } = require('./lib/mutex');

const { cors } = require('./middleware/cors');
const { noCacheApi } = require('./middleware/no-cache');
const { notFound, errorHandler } = require('./middleware/error-handler');
const { requestContext } = require('./middleware/request-context');

const { buildApiRouter } = require('./routes');
const migrations = require('./migrations/legacy');

function createApp() {
  // ─── Bootstrap directories ───
  ensureDir(config.DATA_DIR);
  ensureDir(config.GAMES_DIR);
  ensureDir(config.UPLOADS_DIR);
  ensureDir(path.join(config.PUBLIC_DIR, 'js'));

  // Clean orphan temp files left behind by a crash mid-upload
  cleanOrphans(config.UPLOADS_DIR);

  // ─── Service container ───
  const adminSecret = loadOrCreateSecret(config.SECRET_FILE, config.ADMIN_SECRET_ENV);
  const db = new GamesDB(config.DB_FILE, config.LEGACY_CONFIG_FILE);

  // Run migrations BEFORE building services that depend on DB state
  migrations.runAll(db);
  // Re-sync legacy config (in case migrations changed DB contents)
  db._syncLegacyConfig();

  // Central event bus — published to by services, consumed by analytics
  // and the SSE route. Construct BEFORE services so they can take a ref.
  const bus = new EventBus();

  const tokens = new TokenService({
    secret: adminSecret,
    ttlMs: config.ADMIN_TOKEN_TTL_MS,
    denylistFile: config.TOKEN_DENYLIST_FILE,
  });
  const sseTickets = new SseTicketService();
  // Single write-mutex shared by GamesService and UploadService. Upload,
  // setPrivacy and delete all touch the same on-disk games dir + DB; a
  // shared lock prevents an in-flight upload's folder allocation from
  // racing a concurrent privacy-rename or delete.
  const writeMutex = new Mutex();
  const games = new GamesService(db, bus, writeMutex);
  const uploads = new UploadService(games, bus, writeMutex);
  const qr = new QRService();
  const storage = new StorageService();
  const analytics = new AnalyticsService({
    logFile: config.EVENTS_LOG_FILE,
    bus,
    games,
    maxBytes: config.EVENTS_LOG_MAX_BYTES,
    maxFiles: config.EVENTS_LOG_MAX_FILES,
  });

  // ─── Express app ───
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Middleware (global)
  app.use(requestContext);

  // Compression — skip already-compressed binary types AND text/event-stream
  // (SSE must NOT be buffered/compressed; the threshold accumulator would
  // delay real-time event delivery to subscribers).
  app.use(compression({
    filter: (req, res) => {
      const type = res.getHeader('Content-Type') || '';
      const tStr = Array.isArray(type) ? type.join(' ') : String(type);
      if (/^text\/event-stream/i.test(tStr)) return false;
      if (/^(image|audio|video)\//i.test(tStr)) return false;
      if (/application\/(zip|wasm|octet-stream|x-protobuf)/i.test(tStr)) return false;
      return compression.filter(req, res);
    },
    threshold: 1024, // skip tiny responses
  }));
  // Helmet — but skipped for /games/* because uploaded Cocos Creator
  // games legitimately need eval(), Google Fonts, and other external
  // resources that our strict CSP would block. The /games/* iframe is
  // still security-isolated by the sandbox attribute on play.html and
  // by unguessable folder names for private games.
  //
  // When GAMES_BASE_URL points games at a separate origin, that origin
  // must be whitelisted in frame-src so the play page can embed it.
  const gamesFrameSrc = ["'self'"];
  if (config.GAMES_BASE_URL) gamesFrameSrc.push(config.GAMES_BASE_URL);
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        // Inline <style> and <script> are used heavily by the page-level
        // anti-flash gates; keep them allowed.
        // Chart.js is loaded on-demand from cdn.jsdelivr.net (admin only).
        'script-src':  ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        // style.css @imports the Inter webfont stylesheet from Google Fonts;
        // the previous policy blocked it, so every page silently fell back to
        // system fonts. Allow the stylesheet host here and the font-file host
        // (fonts.gstatic.com) in font-src below.
        'style-src':   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'img-src':     ["'self'", 'data:', 'blob:'],
        'font-src':    ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'connect-src': ["'self'"],
        'frame-src':   gamesFrameSrc,
        'frame-ancestors': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer-when-downgrade' },
    // Origin-Agent-Cluster was being applied inconsistently across pages
    // (caused a console warning). Disable so all routes stay in a single
    // agent cluster.
    originAgentCluster: false,
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/games/')) return next();
    return helmetMiddleware(req, res, next);
  });
  app.use(express.json({ limit: '256kb' }));

  // CORS only for API
  app.use('/api', cors);
  app.use('/api', noCacheApi);

  // Mount API routes
  const deps = { games, uploads, tokens, qr, storage, bus, sseTickets, analytics };
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

  // Runtime config exposed to the browser. Currently only the games origin,
  // used by play.js to build the iframe src. Kept tiny and dependency-free
  // so it can be inlined/cached aggressively if needed.
  app.get('/js/runtime-config.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const gamesBaseUrl = config.GAMES_BASE_URL || '';
    res.send(
      `/* AUTO-GENERATED runtime config. */\n` +
      `window.GH_RUNTIME = Object.freeze(${JSON.stringify({ gamesBaseUrl })});\n`
    );
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
