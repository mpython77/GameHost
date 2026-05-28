/**
 * Public games routes (no admin auth required, except where noted).
 *
 *  GET  /api/games                       — public list (admin sees all when ?all=true)
 *  GET  /api/games/private/:token        — fetch private game by token
 *  POST /api/games/:id/play              — increment play counter
 *  GET  /api/games/:id/qr                — QR code (admin required for private)
 *  GET  /api/games/:id/download          — admin only
 *  DELETE /api/games/:id                 — admin only (kept for legacy compat)
 */

'use strict';

const express = require('express');
const limits = require('../middleware/rate-limits');
const { adminAuth, optionalAdmin } = require('../middleware/auth');
const { validate, listQuerySchema } = require('../validators/schemas');
const { UnauthorizedError } = require('../lib/errors');
const { zipDirectoryToBuffer } = require('../lib/zip');
const config = require('../config');

function buildGamesRouter({ games, qr, tokens }) {
  const router = express.Router();
  const requireAdmin = adminAuth(tokens);
  const maybeAdmin = optionalAdmin(tokens);

  // ─── List ───
  router.get('/', limits.api, maybeAdmin, (req, res, next) => {
    try {
      const opts = validate(listQuerySchema, req.query);
      // Admin can see everything (including private) with ?all=true
      if (req.query.all === 'true' && req.isAdmin) {
        return res.json(games.adminList());
      }
      // Public list
      const result = games.list({ ...opts, isPrivate: false });
      // Strip secrets
      const items = result.items.map((g) => games.publicView(g));
      // Backward compat: if no pagination requested, return plain array
      if (!req.query.page && !req.query.perPage) {
        return res.json(items);
      }
      res.json({ ...result, items });
    } catch (err) { next(err); }
  });

  // ─── Private game by token ───
  router.get('/private/:token', limits.privateToken, (req, res, next) => {
    try {
      const game = games.getByPrivateToken(req.params.token);
      // Hide privateToken in response
      const { privateToken, ownerToken, ...safe } = game;
      res.json(safe);
    } catch (err) { next(err); }
  });

  // ─── Track play ───
  router.post('/:id/play', limits.play, (req, res, next) => {
    try {
      const game = games.trackPlay(req.params.id, { ip: req.ip });
      res.json({ success: true, playCount: game.playCount });
    } catch (err) { next(err); }
  });

  // ─── QR code ───
  router.get('/:id/qr', maybeAdmin, async (req, res, next) => {
    try {
      const game = games.getById(req.params.id);
      if (game.isPrivate && !req.isAdmin) {
        throw new UnauthorizedError("Maxfiy o'yin QR kodi uchun admin login kerak");
      }
      const baseUrl = config.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const url = game.isPrivate && game.privateToken
        ? `${baseUrl}/play.html?token=${game.privateToken}`
        : `${baseUrl}/play.html?game=${game.id}`;

      const size = parseInt(req.query.size, 10) || 300;
      const format = req.query.format === 'svg' ? 'svg' : 'png';
      const { contentType, body } = await qr.render(url, { size, format });
      res.setHeader('Content-Type', contentType);
      if (format === 'png') res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(body);
    } catch (err) { next(err); }
  });

  // ─── Download (admin) ───
  router.get('/:id/download', requireAdmin, (req, res, next) => {
    try {
      const { game, dir } = games.getGameDir(req.params.id);
      const buf = zipDirectoryToBuffer(dir);
      res.setHeader('Content-Disposition', `attachment; filename="${game.folder}.zip"`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', buf.length);
      res.send(buf);
    } catch (err) { next(err); }
  });

  // ─── Delete (admin) ───
  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      const game = games.delete(req.params.id);
      res.json({ success: true, message: `"${game.id}" o'chirildi` });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { buildGamesRouter };
