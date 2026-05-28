/**
 * Storage service — admin file-tree introspection and safe deletion
 * inside the data directory.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../lib/logger');
const { walkTree, humanSize, resolveSafe, rmRecursive } = require('../lib/files');
const { ForbiddenError, NotFoundError, ValidationError } = require('../lib/errors');

// Files/directories the admin must NEVER be able to delete via the UI
// (deleting them would corrupt the running app or wipe all metadata).
const PROTECTED_BASENAMES = new Set([
  'games-db.json',
  '.admin-secret',
  '.token-denylist.json',
]);

class StorageService {
  /** Build a tree of the data directory with sizes. */
  inspect() {
    const result = walkTree(config.DATA_DIR);
    return {
      dataDir: config.DATA_DIR,
      totalSize: result.size,
      totalSizeHuman: humanSize(result.size),
      tree: result.items,
    };
  }

  /**
   * Delete a path, but only inside the data directory.
   * Refuses to delete:
   *   - the data directory itself
   *   - the games root directory (data/games)
   *   - any of the protected system files (DB, secrets)
   */
  deletePath(target) {
    if (!target) throw new ValidationError('target majburiy');

    let fullPath;
    try {
      fullPath = resolveSafe(config.DATA_DIR, target);
    } catch {
      throw new ForbiddenError("Faqat data papkasi ichidagi fayllarni o'chirish mumkin");
    }
    if (fullPath === path.resolve(config.DATA_DIR)) {
      throw new ForbiddenError("Asosiy data papkasini o'chirib bo'lmaydi");
    }
    if (fullPath === path.resolve(config.GAMES_DIR)) {
      throw new ForbiddenError("Games root papkasini o'chirib bo'lmaydi");
    }
    const basename = path.basename(fullPath);
    if (PROTECTED_BASENAMES.has(basename)) {
      throw new ForbiddenError(
        `"${basename}" — tizim fayli, o'chirib bo'lmaydi`
      );
    }
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundError('Topilmadi');
    }
    rmRecursive(fullPath);
    logger.warn('storage.deleted', { path: fullPath });
    return { deleted: fullPath };
  }
}

module.exports = { StorageService };
