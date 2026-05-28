'use strict';

const express = require('express');
const limits = require('../middleware/rate-limits');
const { adminAuth } = require('../middleware/auth');
const { uploadGameAndThumb } = require('../middleware/multer');
const { validate, uploadSchema } = require('../validators/schemas');

function buildUploadRouter({ tokens, uploads, games }) {
  const router = express.Router();

  router.post(
    '/',
    limits.upload,
    adminAuth(tokens),
    uploadGameAndThumb,
    async (req, res, next) => {
      try {
        const fields = validate(uploadSchema, req.body);
        const gameFile = req.files?.gameFile?.[0];
        const thumbnailFile = req.files?.thumbnail?.[0] || null;

        const record = await uploads.process({ fields, gameFile, thumbnailFile });

        const baseUrl = require('../config').PUBLIC_BASE_URL
          || `${req.protocol}://${req.get('host')}`;
        const privateLink = record.isPrivate && record.privateToken
          ? `/play.html?token=${record.privateToken}`
          : null;

        const safe = games.adminView(record);
        delete safe.privateToken;

        res.json({
          success: true,
          message: `"${record.name.uz}" muvaffaqiyatli yuklandi!`,
          game: safe,
          privateLink,
          baseUrl,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { buildUploadRouter };
