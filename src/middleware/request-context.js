/**
 * Per-request context middleware:
 *   - Generates a short request id (8-hex)
 *   - Attaches a child logger bound to the request
 *   - Logs an access line on response finish
 *
 * Keeps overhead under ~50µs per request.
 */

'use strict';

const crypto = require('crypto');
const baseLogger = require('../lib/logger');

function requestContext(req, res, next) {
  // Use upstream request id when available (Railway, Cloudflare, etc.)
  const upstream =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    null;
  const reqId = upstream || crypto.randomBytes(4).toString('hex');

  req.id = reqId;
  req.log = baseLogger.child({ reqId });
  res.setHeader('X-Request-Id', reqId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    // Skip noisy /api/health pings unless slow or non-2xx.
    const isHealth = req.path === '/api/health';
    if (isHealth && res.statusCode < 300 && durMs < 100) return;

    req.log.info('http', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durMs: +durMs.toFixed(1),
      ip: req.ip,
    });
  });

  next();
}

module.exports = { requestContext };
