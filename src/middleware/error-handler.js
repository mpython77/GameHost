'use strict';

const config = require('../config');
const logger = require('../lib/logger');
const { AppError } = require('../lib/errors');

/** 404 fallback for unmatched routes. */
function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Sahifa topilmadi' });
  }
  // For pages, redirect to home
  return res.status(404).redirect('/');
}

/** Central error handler. Maps domain errors to HTTP responses. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Multer / busboy errors
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'Fayl juda katta',
      code: 'FILE_TOO_LARGE',
    });
  }

  // Domain errors
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error('app_error', { msg: err.message, stack: err.stack });
    } else {
      logger.warn('client_error', { msg: err.message, code: err.code, status: err.status });
    }
    return res.status(err.status).json({
      error: err.expose ? err.message : 'Serverda xatolik',
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Unknown — log full
  logger.error('unhandled_error', {
    msg: err && err.message,
    stack: err && err.stack,
  });
  res.status(500).json({
    error: config.isProd ? 'Serverda xatolik yuz berdi' : (err && err.message),
  });
}

module.exports = { notFound, errorHandler };
