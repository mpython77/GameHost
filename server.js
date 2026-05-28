/**
 * GameHost — entry point.
 *
 * Thin wrapper: builds the Express app via the factory and starts it.
 * Handles graceful shutdown on SIGINT/SIGTERM.
 */

'use strict';

const config = require('./src/config');
const logger = require('./src/lib/logger');
const { createApp } = require('./src/app');

const app = createApp();

const server = app.listen(config.PORT, '0.0.0.0', () => {
  const banner = [
    '',
    '  🚀 ══════════════════════════════════════',
    '  🚀  GAME HOST v3.0  (modular architecture)',
    '  🚀 ══════════════════════════════════════',
    `  🌐  Listen: 0.0.0.0:${config.PORT}`,
    `  🔧  Env:    ${config.NODE_ENV}`,
    `  📂  Data:   ${config.DATA_DIR}`,
    `  🎮  Games:  ${app.locals.deps.games.db.count()}`,
    `  ❤️   Health: GET /api/health`,
    '  🛡️   helmet · compression · rate-limit · denylist',
    '  🚀 ══════════════════════════════════════',
    '',
  ].join('\n');
  // eslint-disable-next-line no-console
  console.log(banner);
});

// Mitigate slow-loris and hung-connection style attacks. Default Node
// HTTP server has no timeout — a single TCP socket can stay open
// indefinitely consuming resources.
//   keepAliveTimeout — close idle keep-alive sockets after 65s
//   headersTimeout   — must be > keepAliveTimeout (Node guidance)
//   requestTimeout   — full-request budget (uploads can be slow → 5min)
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 70 * 1000;
server.requestTimeout = 5 * 60 * 1000;

// In rare cases the listen callback never fires (port in use). Surface that.
server.on('error', (err) => {
  logger.fatal('listen.error', { error: err.message, code: err.code, port: config.PORT });
  process.exit(1);
});

// ─── Graceful shutdown ───
function shutdown(signal) {
  logger.info('shutdown.start', { signal });
  // Flush any buffered DB writes before exit.
  try {
    if (app.locals.deps && app.locals.deps.games && app.locals.deps.games.db) {
      app.locals.deps.games.db.close();
    }
    if (app.locals.deps && app.locals.deps.tokens && typeof app.locals.deps.tokens.close === 'function') {
      app.locals.deps.tokens.close();
    }
  } catch (err) {
    logger.warn('shutdown.flush_failed', { error: err.message });
  }
  server.close((err) => {
    if (err) {
      logger.error('shutdown.error', { error: err.message });
      process.exit(1);
    }
    logger.info('shutdown.done');
    process.exit(0);
  });
  // Hard exit after 10s
  setTimeout(() => {
    logger.warn('shutdown.forced');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.error('unhandledRejection', { error: err && err.message, stack: err && err.stack });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { error: err && err.message, stack: err && err.stack });
});
