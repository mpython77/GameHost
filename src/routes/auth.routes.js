'use strict';

const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const limits = require('../middleware/rate-limits');
const { adminAuth } = require('../middleware/auth');
const { validate, loginSchema } = require('../validators/schemas');
const { UnauthorizedError } = require('../lib/errors');
const logger = require('../lib/logger');

function hash(input) {
  return crypto
    .createHash('sha256')
    .update(input + '_gh_salt')
    .digest();
}

function buildAuthRouter({ tokens }) {
  const router = express.Router();

  // Pre-compute admin hashes once
  const ADMIN_USER_HASH = hash(config.ADMIN_USERNAME);
  const ADMIN_PASS_HASH = hash(config.ADMIN_PASSWORD);

  router.post('/login', limits.adminLogin, (req, res, next) => {
    try {
      const { username, password } = validate(loginSchema, req.body);
      const userHash = hash(username);
      const passHash = hash(password);

      // timingSafeEqual requires equal length; sha256 always produces 32 bytes
      const userOk = crypto.timingSafeEqual(userHash, ADMIN_USER_HASH);
      const passOk = crypto.timingSafeEqual(passHash, ADMIN_PASS_HASH);

      if (!userOk || !passOk) {
        logger.warn('admin.login.failed', { username });
        throw new UnauthorizedError("Login yoki parol noto'g'ri");
      }

      const token = tokens.create();
      logger.info('admin.login.success');
      res.json({ token, expiresIn: config.ADMIN_TOKEN_TTL_MS });
    } catch (err) {
      next(err);
    }
  });

  // Logout — properly invalidates the current token (denylist)
  router.post('/logout', adminAuth(tokens), (req, res, next) => {
    try {
      tokens.revoke(req.adminToken);
      logger.info('admin.logout');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildAuthRouter };
