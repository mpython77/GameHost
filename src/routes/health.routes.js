'use strict';

const express = require('express');
const config = require('../config');

function buildHealthRouter({ games }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      games: games.db.count(),
      env: config.NODE_ENV,
      version: require('../../package.json').version,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

module.exports = { buildHealthRouter };
