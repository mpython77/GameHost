/**
 * Tiny structured logger. Supports levels and JSON-ish output.
 * Avoids heavy dependencies (pino/winston) for a small project.
 */

'use strict';

const config = require('../config');

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const minLevel = LEVELS[config.LOG_LEVEL] || LEVELS.info;

const COLOR = config.isDev && process.stdout.isTTY;
const COLORS = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info:  '\x1b[32m',
  warn:  '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
  reset: '\x1b[0m',
};

function fmt(level, msg, meta) {
  const ts = new Date().toISOString();
  if (config.isDev) {
    const prefix = COLOR
      ? `${COLORS[level]}${level.toUpperCase().padEnd(5)}${COLORS.reset}`
      : level.toUpperCase().padEnd(5);
    let line = `${ts} ${prefix} ${msg}`;
    if (meta && Object.keys(meta).length) {
      line += ' ' + JSON.stringify(meta);
    }
    return line;
  }
  // Production — JSON for log aggregators
  return JSON.stringify({ ts, level, msg, ...meta });
}

function log(level, msg, meta) {
  if (LEVELS[level] < minLevel) return;
  const out = fmt(level, msg, meta);
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(out + '\n');
  } else {
    process.stdout.write(out + '\n');
  }
}

const logger = {
  trace: (m, meta) => log('trace', m, meta),
  debug: (m, meta) => log('debug', m, meta),
  info:  (m, meta) => log('info', m, meta),
  warn:  (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
  fatal: (m, meta) => log('fatal', m, meta),

  /** Create a child logger with bound context. */
  child(context) {
    return {
      trace: (m, meta) => log('trace', m, { ...context, ...meta }),
      debug: (m, meta) => log('debug', m, { ...context, ...meta }),
      info:  (m, meta) => log('info', m, { ...context, ...meta }),
      warn:  (m, meta) => log('warn', m, { ...context, ...meta }),
      error: (m, meta) => log('error', m, { ...context, ...meta }),
      fatal: (m, meta) => log('fatal', m, { ...context, ...meta }),
    };
  },
};

module.exports = logger;
