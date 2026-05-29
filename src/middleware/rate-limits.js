/**
 * Rate-limit middlewares.
 * `express-rate-limit@^7` no longer exports `ipKeyGenerator`; we
 * write our own minimal IP extractor for compound keys.
 */

'use strict';

const { rateLimit } = require('express-rate-limit');
const config = require('../config');

function clientIp(req) {
  // trust-proxy must be set for x-forwarded-for to work upstream
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

const upload = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: process.env.GH_DISABLE_RATE_LIMIT === '1' ? 0 : 10,
  skip: () => process.env.GH_DISABLE_RATE_LIMIT === '1',
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Juda ko'p fayl yukladingiz. 5 daqiqa kuting." },
});

const api = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const adminLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Login urinishlari ko'p. Keyinroq urinib ko'ring." },
});

const privateToken = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Juda ko'p urinish. Keyinroq qayta urinib ko'ring." },
});

const play = rateLimit({
  windowMs: 60 * 60 * 1000,
  // Per IP+game cap. 5 was too aggressive — a single player reloading a
  // level or a QA pass would silently stop counting. Default 30/hour still
  // blocks gross inflation while allowing legitimate replays. Tune via the
  // PLAY_RATE_LIMIT env.
  limit: config.PLAY_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Compound key per IP+gameId so different games don't share counters
  keyGenerator: (req) => `${clientIp(req)}-${req.params.id}`,
});

module.exports = { upload, api, adminLogin, privateToken, play, clientIp };
