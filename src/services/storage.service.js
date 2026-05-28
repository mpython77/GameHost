/**
 * Storage service — admin file-tree introspection and safe deletion
 * inside the data directory.
 */

'use strict';

const fs = require('fs');
const config = require('../config');
const logger = require('../lib/logger');
const { walkTree, humanSize, resolveSafe, rmRecursive } = require('../lib/files');
const { ForbiddenError, NotFoundError, ValidationError } = require('../lib/errors');

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
   * Refuses to delete the data directory itself.
   */
  deletePath(target) {
    if (!target) throw new ValidationError('target majburiy');

    let fullPath;
    try {
      fullPath = resolveSafe(config.DATA_DIR, target);
    } catch {
      throw new ForbiddenError("Faqat data papkasi ichidagi fayllarni o'chirish mumkin");
    }
    if (fullPath === require('path').resolve(config.DATA_DIR)) {
      throw new ForbiddenError("Asosiy data papkasini o'chirib bo'lmaydi");
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
