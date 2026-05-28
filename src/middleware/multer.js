'use strict';

const path = require('path');
const multer = require('multer');
const config = require('../config');
const { ensureDir } = require('../lib/files');

ensureDir(config.UPLOADS_DIR);

const upload = multer({
  dest: config.UPLOADS_DIR,
  limits: { fileSize: config.MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'thumbnail') {
      const ok = config.ALLOWED_IMAGE_EXTS.includes(ext)
        || (file.mimetype && file.mimetype.startsWith('image/'));
      if (!ok) return cb(new Error('Thumbnail uchun faqat rasm fayllari'), false);
    } else {
      const ok = config.ALLOWED_GAME_EXTS.includes(ext)
        || file.mimetype === 'text/html'
        || file.mimetype === 'application/zip';
      if (!ok) return cb(new Error('Faqat HTML yoki ZIP fayllar qabul qilinadi'), false);
    }
    cb(null, true);
  },
});

const uploadGameAndThumb = upload.fields([
  { name: 'gameFile', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

module.exports = { upload, uploadGameAndThumb };
