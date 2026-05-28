'use strict';

const express = require('express');
const { buildHealthRouter } = require('./health.routes');
const { buildAuthRouter } = require('./auth.routes');
const { buildGamesRouter } = require('./games.routes');
const { buildUploadRouter } = require('./upload.routes');
const { buildAdminRouter } = require('./admin.routes');
const { buildEventsRouter } = require('./events.routes');
const { buildAnalyticsRouter } = require('./analytics.routes');

/** Compose the full /api router from service container. */
function buildApiRouter(deps) {
  const router = express.Router();
  router.use('/health', buildHealthRouter(deps));
  router.use('/admin', buildAuthRouter(deps));      // /api/admin/login, /logout
  // SSE + sse-ticket — mounted under /admin so URLs are intuitive
  router.use('/admin', buildEventsRouter(deps));    // /api/admin/sse-ticket, /events
  router.use('/admin/analytics', buildAnalyticsRouter(deps));
  router.use('/admin', buildAdminRouter(deps));     // /api/admin/games, /stats, /storage
  router.use('/upload', buildUploadRouter(deps));   // /api/upload
  router.use('/games', buildGamesRouter(deps));     // /api/games/...
  return router;
}

module.exports = { buildApiRouter };
