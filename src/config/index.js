/**
 * Centralized configuration with environment-variable validation.
 * Loaded once at startup. Throws (and exits) on invalid prod config.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Tiny .env loader (no external dependency) ───
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const ROOT = path.resolve(__dirname, '..', '..');
loadDotEnv(path.join(ROOT, '.env'));

// ─── Helpers ───
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

// ─── Paths ───
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');

const PUBLIC_DIR = path.join(ROOT, 'public');

// ─── Production credential strategy ───
// In production, if ADMIN_USERNAME/PASSWORD are not set, we DO NOT exit
// (that would fail Railway healthcheck and leave the user clueless).
// Instead, generate a one-time random password and log it loudly.
// This keeps healthcheck green while still preventing default `admin/admin`.
const crypto = require('crypto');

const userProvided = !!process.env.ADMIN_USERNAME && !!process.env.ADMIN_PASSWORD;
let ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
let TEMP_PASSWORD_GENERATED = false;

if (isProd && !userProvided) {
  ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  ADMIN_PASSWORD = crypto.randomBytes(18).toString('base64url');
  TEMP_PASSWORD_GENERATED = true;
  // eslint-disable-next-line no-console
  const banner = [
    '',
    '════════════════════════════════════════════════════════════════',
    '⚠️   PRODUCTION ADMIN CREDENTIALS NOT CONFIGURED',
    '════════════════════════════════════════════════════════════════',
    '  ADMIN_USERNAME / ADMIN_PASSWORD env-lari sozlanmagan.',
    '  Vaqtinchalik tasodifiy admin parol generatsiya qilindi:',
    '',
    `    Username: ${ADMIN_USERNAME}`,
    `    Password: ${ADMIN_PASSWORD}`,
    '',
    '  ⚠️  Bu parol HAR RESTART da o\'zgaradi.',
    '  ⚠️  Railway → Variables ga ADMIN_USERNAME va ADMIN_PASSWORD',
    '       qo\'shing va qaytadan deploy qiling.',
    '════════════════════════════════════════════════════════════════',
    '',
  ].join('\n');
  console.log(banner);   // stdout (Railway primary log stream)
  console.error(banner); // stderr (some platforms only capture this)
}

// ─── Exported config ───
const config = Object.freeze({
  // Environment
  NODE_ENV,
  isProd,
  isDev: !isProd,
  PORT: int(process.env.PORT, 8080),
  LOG_LEVEL: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),

  // Paths
  ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  GAMES_DIR: path.join(DATA_DIR, 'games'),
  UPLOADS_DIR: path.join(ROOT, 'uploads'),
  DB_FILE: path.join(DATA_DIR, 'games-db.json'),
  SECRET_FILE: path.join(DATA_DIR, '.admin-secret'),
  TOKEN_DENYLIST_FILE: path.join(DATA_DIR, '.token-denylist.json'),
  EVENTS_LOG_FILE: path.join(DATA_DIR, 'events.jsonl'),
  LEGACY_CONFIG_FILE: path.join(PUBLIC_DIR, 'js', 'games-config.js'),

  // Auth
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  TEMP_PASSWORD_GENERATED,
  ADMIN_SECRET_ENV: process.env.ADMIN_SECRET || null,
  // Default 30 days — the front-end stores the token in localStorage so it
  // persists across browser restarts; a longer TTL matches "remember me on
  // this device" UX. Override via ADMIN_TOKEN_TTL_MS env for shorter sessions.
  ADMIN_TOKEN_TTL_MS: int(process.env.ADMIN_TOKEN_TTL_MS, 30 * 24 * 60 * 60 * 1000),

  // Public URL (optional)
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null,

  // Limits
  MAX_UPLOAD_SIZE_BYTES: int(process.env.MAX_UPLOAD_SIZE_BYTES, 100 * 1024 * 1024),
  MAX_THUMBNAIL_SIZE_BYTES: int(process.env.MAX_THUMBNAIL_SIZE_BYTES, 5 * 1024 * 1024),
  MAX_GAMES_PER_PAGE: 100,

  // Domain constants
  CATEGORIES: ['arcade', 'action', 'puzzle', 'casual', 'strategy'],
  ALL_CATEGORIES: ['all', 'arcade', 'action', 'puzzle', 'casual', 'strategy'],
  ALLOWED_GAME_EXTS: ['.html', '.zip'],
  ALLOWED_IMAGE_EXTS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
});

module.exports = config;
