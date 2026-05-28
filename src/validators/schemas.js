/**
 * Lightweight schema-based validators (no zod dependency).
 * Each validator takes a value and returns a `{ ok, value, errors }` shape
 * or throws ValidationError when called via `validate()`.
 */

'use strict';

const config = require('../config');
const { ValidationError } = require('../lib/errors');

const NAME_MAX = 120;
const DESC_MAX = 2000;
const VERSION_MAX = 24;
const CATEGORY_FALLBACK = 'arcade';

function asString(v, max) {
  if (v == null) return '';
  const s = String(v).trim();
  return max ? s.slice(0, max) : s;
}

function asBool(v) {
  return v === true || v === 'true' || v === '1' || v === 'on' || v === 1;
}

function asCategory(v) {
  return config.CATEGORIES.includes(v) ? v : CATEGORY_FALLBACK;
}

/** Login body { username, password }. */
function loginSchema(body = {}) {
  const errors = [];
  const username = asString(body.username, 64);
  const password = asString(body.password, 256);
  if (!username) errors.push('username majburiy');
  if (!password) errors.push('password majburiy');
  return { ok: errors.length === 0, errors, value: { username, password } };
}

/** Upload body (multipart text fields — files validated separately). */
function uploadSchema(body = {}) {
  return {
    ok: true,
    errors: [],
    value: {
      gameName_uz: asString(body.gameName_uz, NAME_MAX),
      gameName_ru: asString(body.gameName_ru, NAME_MAX),
      gameName_en: asString(body.gameName_en, NAME_MAX),
      gameDesc_uz: asString(body.gameDesc_uz, DESC_MAX),
      gameDesc_ru: asString(body.gameDesc_ru, DESC_MAX),
      gameDesc_en: asString(body.gameDesc_en, DESC_MAX),
      category: asCategory(body.category),
      version: asString(body.version, VERSION_MAX) || '1.0',
      isPrivate: asBool(body.isPrivate),
    },
  };
}

/** PATCH /api/admin/games/:id body. */
function patchGameSchema(body = {}) {
  const value = {};
  if ('isPrivate' in body) value.isPrivate = asBool(body.isPrivate);
  return { ok: true, errors: [], value };
}

/** Pagination query: { page, perPage, search, category }. */
function listQuerySchema(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const perPage = Math.min(
    config.MAX_GAMES_PER_PAGE,
    Math.max(1, parseInt(query.perPage, 10) || 30)
  );
  return {
    ok: true,
    errors: [],
    value: {
      page,
      perPage,
      search: asString(query.search, 100) || undefined,
      category: query.category && config.ALL_CATEGORIES.includes(query.category)
        ? query.category
        : undefined,
    },
  };
}

/** DELETE /api/admin/storage body { target } — no inner check, the route enforces base-dir. */
function storageDeleteSchema(body = {}) {
  const target = asString(body.target, 1000);
  if (!target) {
    return { ok: false, errors: ['target majburiy'], value: {} };
  }
  return { ok: true, errors: [], value: { target } };
}

/** Helper: run a schema and throw ValidationError on failure. */
function validate(schema, payload) {
  const result = schema(payload);
  if (!result.ok) {
    throw new ValidationError(result.errors.join('; '), result.errors);
  }
  return result.value;
}

module.exports = {
  validate,
  loginSchema,
  uploadSchema,
  patchGameSchema,
  listQuerySchema,
  storageDeleteSchema,
};
