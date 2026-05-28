'use strict';

const { UnauthorizedError } = require('../lib/errors');

/**
 * Build an admin-auth middleware bound to a TokenService.
 * On success, stores `req.adminPayload` and `req.adminToken`.
 */
function adminAuth(tokenService) {
  return (req, res, next) => {
    const token = req.headers['x-admin-token'];
    const payload = tokenService.verify(token);
    if (!payload) {
      return next(new UnauthorizedError('Admin autentifikatsiyasi kerak'));
    }
    req.adminToken = token;
    req.adminPayload = payload;
    next();
  };
}

/**
 * Optional admin: doesn't fail if no token; sets req.isAdmin based on validity.
 * Useful for endpoints with admin-bonus behavior (e.g. include private items).
 */
function optionalAdmin(tokenService) {
  return (req, res, next) => {
    const token = req.headers['x-admin-token'];
    const payload = tokenService.verify(token);
    req.isAdmin = !!payload;
    if (payload) {
      req.adminToken = token;
      req.adminPayload = payload;
    }
    next();
  };
}

module.exports = { adminAuth, optionalAdmin };
