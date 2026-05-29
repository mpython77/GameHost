'use strict';

const express = require('express');
const config = require('../config');
const { adminAuth } = require('../middleware/auth');

function buildHealthRouter({ games, tokens }) {
  const router = express.Router();

  // Lightweight health: must NOT depend on file IO / DB / external state.
  // Railway hits this every few seconds; should always return 200 fast.
  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      env: config.NODE_ENV,
      version: require('../../package.json').version,
      timestamp: new Date().toISOString(),
    });
  });

  // Richer, stateful info for monitoring. ADMIN-ONLY: it exposes internal
  // counts and whether a temporary admin password is active — that is a
  // security-posture hint that must not be public.
  router.get('/full', adminAuth(tokens), (req, res) => {
    let gamesCount = 0;
    try { gamesCount = games.db.count(); } catch { /* ignore */ }
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      games: gamesCount,
      env: config.NODE_ENV,
      version: require('../../package.json').version,
      timestamp: new Date().toISOString(),
      tempPasswordActive: !!config.TEMP_PASSWORD_GENERATED,
    });
  });

  return router;
}

module.exports = { buildHealthRouter };
