'use strict';

/** Disable caching for API responses (proxy + browser). */
function noCacheApi(req, res, next) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}

module.exports = { noCacheApi };
