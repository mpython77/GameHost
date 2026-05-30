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
      // Backward compat: when no explicit pagination is requested, return
      // the FULL public list as a plain array — this is the shape the
      // catalog (home.js) and player (play.js) rely on. Previously this
      // path reused the default perPage (30), so once more than 30 public
      // games existed the older ones silently disappeared from the catalog
      // and could no longer be found via /api/games.
      if (!req.query.page && !req.query.perPage) {
        const full = games.list({
          ...opts,
          page: 1,
          perPage: Number.MAX_SAFE_INTEGER,
          isPrivate: false,
        });
        return res.json(full.items.map((g) => games.publicView(g)));
      }
      // Public list (paginated)
      const result = games.list({ ...opts, isPrivate: false });
      // Strip secrets
      const items = result.items.map((g) => games.publicView(g));
      res.json({ ...result, items });
    } catch (err) { next(err); }
  });

  // ─── Private game by token ───
  router.get('/private/:token', limits.privateToken, (req, res, next) => {
    try {
      // Reject obviously malformed tokens before doing a Map lookup.
      // Tokens are 48 hex chars; pretend any other shape is "not found".
      const t = req.params.token;
      if (!/^[a-f0-9]{32,128}$/i.test(t)) {
        return next(new (require('../lib/errors').NotFoundError)("Maxfiy o'yin topilmadi yoki token noto'g'ri"));
      }
      const game = games.getByPrivateToken(t);
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
      // Look up first; if not found OR is private without admin,
      // return the SAME 404 to avoid leaking which private games exist.
      // (Previously returned 401 for private, 404 for missing — that
      // distinction let attackers probe for private slug names.)
      const game = games.db.getById(req.params.id);
      if (!game || (game.isPrivate && !req.isAdmin)) {
        return next(new (require('../lib/errors').NotFoundError)("O'yin topilmadi"));
      }
      const baseUrl = config.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const url = game.isPrivate && game.privateToken
        ? `${baseUrl}/play.html?token=${game.privateToken}`
        : `${baseUrl}/play.html?game=${game.id}`;

      // Clamp the requested pixel size to a sane range. The endpoint is
      // public (no admin required) and was previously unbounded, so a
      // request like ?size=999999 could force a huge allocation, and a
      // non-positive size (?size=0 / ?size=-5) produced a 500. QR codes
      // are small by nature — 64..1000px covers every legitimate use.
      const requested = parseInt(req.query.size, 10);
      const size = Number.isFinite(requested)
        ? Math.min(1000, Math.max(64, requested))
        : 300;
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
      // RFC 5987 — ASCII-only `filename` for safety + UTF-8 `filename*`.
      // Strip CR/LF/quotes from the slug as a defence-in-depth (slug should
      // already be safe, but `Content-Disposition` is sensitive).
      const safeName = String(game.folder).replace(/[\r\n"\\]/g, '_');
      const ascii = safeName.replace(/[^\x20-\x7E]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${ascii}.zip"; filename*=UTF-8''${encodeURIComponent(safeName)}.zip`
      );
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', buf.length);
      res.send(buf);
    } catch (err) { next(err); }
  });

  // ─── Delete (admin) ───
  router.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const game = await games.delete(req.params.id);
      res.json({ success: true, message: `"${game.id}" o'chirildi` });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { buildGamesRouter };
