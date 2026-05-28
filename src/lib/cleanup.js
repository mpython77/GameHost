/**
 * Boot-time cleanup of orphan upload temp files.
 *
 * If the server crashed mid-upload, multer's temp files in `uploads/`
 * are never cleaned. Over time this fills the disk. We delete any file
 * older than `maxAgeMs` (default 1 hour) at startup.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function cleanOrphans(dir, maxAgeMs = 60 * 60 * 1000) {
  if (!fs.existsSync(dir)) return 0;
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  let bytes = 0;

  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      if (stat.mtimeMs < cutoff) {
        try {
          bytes += stat.size;
          fs.unlinkSync(full);
          removed++;
        } catch (err) {
          logger.warn('cleanup.failed', { file: full, error: err.message });
        }
      }
    }
  } catch (err) {
    logger.warn('cleanup.scan_failed', { dir, error: err.message });
  }

  if (removed > 0) {
    logger.info('cleanup.orphans_removed', { dir, count: removed, bytes });
  }
  return removed;
}

module.exports = { cleanOrphans };
