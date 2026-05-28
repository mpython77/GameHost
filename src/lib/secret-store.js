/**
 * Persistent secret storage. Solves the "ADMIN_SECRET regenerates
 * on each restart, invalidating tokens" problem.
 *
 * Order of resolution:
 *   1. process.env.ADMIN_SECRET (if set)
 *   2. data/.admin-secret file (if exists)
 *   3. Generate random, persist to file (mode 0600)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

function loadOrCreateSecret(filePath, envSecret = null) {
  if (envSecret && envSecret.length >= 16) {
    logger.debug('Using ADMIN_SECRET from environment');
    return envSecret;
  }

  // Try to read existing
  try {
    if (fs.existsSync(filePath)) {
      const secret = fs.readFileSync(filePath, 'utf8').trim();
      if (secret.length >= 32) {
        logger.debug('Loaded persistent admin secret', { file: filePath });
        return secret;
      }
      logger.warn('Existing secret file is malformed, regenerating', { file: filePath });
    }
  } catch (err) {
    logger.warn('Could not read secret file, regenerating', { error: err.message });
  }

  // Generate and persist
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, secret, { encoding: 'utf8', mode: 0o600 });
    logger.info('Generated new admin secret', { file: filePath });
  } catch (err) {
    logger.error('Could not persist admin secret — tokens will not survive restart', {
      error: err.message,
    });
  }
  return secret;
}

module.exports = { loadOrCreateSecret };
