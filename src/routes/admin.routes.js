'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');
const { validate, patchGameSchema, storageDeleteSchema } = require('../validators/schemas');

function buildAdminRouter({ tokens, games, storage }) {
  const router = express.Router();
  const auth = adminAuth(tokens);

  router.use(auth);

  router.get('/stats', (req, res, next) => {
    try {
      res.json(games.stats());
    } catch (err) { next(err); }
  });

  router.get('/games', (req, res, next) => {
    try {
      res.json(games.adminList());
    } catch (err) { next(err); }
  });

  router.delete('/games', async (req, res, next) => {
    try {
      const deleted = await games.deleteAll();
      res.json({ success: true, deleted });
    } catch (err) { next(err); }
  });

  router.delete('/games/:id', async (req, res, next) => {
    try {
      await games.delete(req.params.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  router.patch('/games/:id', async (req, res, next) => {
    try {
      const patch = validate(patchGameSchema, req.body);
      let game = games.getById(req.params.id);
      if ('isPrivate' in patch) {
        game = await games.setPrivacy(req.params.id, patch.isPrivate);
      }
      res.json(games.adminView(game));
    } catch (err) { next(err); }
  });

  router.get('/storage', (req, res, next) => {
    try {
      res.json(storage.inspect());
    } catch (err) { next(err); }
  });

  router.delete('/storage', (req, res, next) => {
    try {
      const { target } = validate(storageDeleteSchema, req.body);
      const result = storage.deletePath(target);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { buildAdminRouter };
