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

// Accept an upstream request id only if it has a sane shape. Otherwise an
// attacker could inject huge / weird values that bloat logs or get echoed
// back verbatim in the X-Request-Id response header.
const REQ_ID_RE = /^[\w.\-]{1,64}$/;

/**
 * Strip secrets from a path before it lands in access logs.
 *   - private-game tokens:  /api/games/private/<token>
 *   - unguessable folder suffix used for private games: /games/slug__<hex>/…
 * (Mirrors why SSE uses one-time tickets instead of tokens-in-URL.)
 */
function safePath(p) {
  if (!p) return p;
  return String(p)
    .replace(/(\/api\/games\/private\/)[^/?]+/i, '$1<redacted>')
    .replace(/__[a-f0-9]{16,}/gi, '__<redacted>');
}

function requestContext(req, res, next) {
  // Use upstream request id when available (Railway, Cloudflare, etc.),
  // but only when it matches a safe pattern.
  const rawUpstream =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    null;
  const upstream = typeof rawUpstream === 'string' && REQ_ID_RE.test(rawUpstream)
    ? rawUpstream
    : null;
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
      path: safePath(req.path),
      status: res.statusCode,
      durMs: +durMs.toFixed(1),
      ip: req.ip,
    });
  });

  next();
}

module.exports = { requestContext, safePath };
