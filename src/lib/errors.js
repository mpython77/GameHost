/**
 * Domain error hierarchy. Routes throw these; the central error
 * handler converts them to HTTP responses.
 */

'use strict';

class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.expose = status < 500; // safe to send message to client
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION');
    this.name = 'ValidationError';
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Topilmadi') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Autentifikatsiya kerak') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Ruxsat berilmagan') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Konflikt') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Juda ko\'p so\'rov') {
    super(message, 429, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
};
