/**
 * Analytics endpoint — drives the admin dashboard charts.
 *
 *   GET /api/admin/analytics?days=30
 */

'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');

function buildAnalyticsRouter({ tokens, analytics }) {
  const router = express.Router();
  router.use(adminAuth(tokens));

  router.get('/', (req, res, next) => {
    try {
      let days = parseInt(req.query.days, 10);
      if (!Number.isFinite(days) || days < 1) days = 30;
      if (days > 365) days = 365;
      res.json(analytics.summary({ days }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAnalyticsRouter };
