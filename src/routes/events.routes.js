/**
 * SSE — server-sent events for live admin dashboard updates.
 *
 *   POST /api/admin/sse-ticket    → { ticket }       (admin auth)
 *   GET  /api/admin/events?ticket=…                  (consumes ticket)
 *
 * On a successful connect we replay any events with id > Last-Event-ID.
 */

'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');
const { UnauthorizedError } = require('../lib/errors');

const HEARTBEAT_MS = 30 * 1000;

function writeSseEvent(res, event) {
  // Per spec: id\n event\n data\n\n
  // If the socket is closed, write throws synchronously — caller cleans up.
  try {
    res.write(`id: ${event.id}\n`);
    if (event.type) res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify({
      id: event.id, type: event.type, data: event.data, ts: event.ts,
    })}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function buildEventsRouter({ tokens, sseTickets, bus }) {
  const router = express.Router();

  // 1) Issue a ticket — requires header-based admin auth
  router.post('/sse-ticket', adminAuth(tokens), (req, res, next) => {
    try {
      const ticket = sseTickets.issue();
      res.json({ ticket, expiresIn: 60 * 1000 });
    } catch (err) {
      next(err);
    }
  });

  // 2) Stream — accepts ?ticket=
  router.get('/events', (req, res, next) => {
    const ticket = req.query.ticket;
    if (!sseTickets.consume(ticket)) {
      return next(new UnauthorizedError("SSE ticket noto'g'ri yoki muddati o'tgan"));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // Tell the browser to retry quickly on disconnect
    res.write('retry: 5000\n\n');

    // Replay missed events
    const lastSeen = parseInt(req.headers['last-event-id'] || '0', 10);
    if (lastSeen > 0) {
      for (const evt of bus.since(lastSeen)) {
        if (!writeSseEvent(res, evt)) return;
      }
    }

    // Open marker
    writeSseEvent(res, { id: 0, type: 'connected', data: { ts: Date.now() }, ts: Date.now() });

    // Live subscription
    const unsubscribe = bus.subscribe((event) => writeSseEvent(res, event));

    // Heartbeat keeps proxies from closing the idle connection
    const hb = setInterval(() => {
      try { res.write(': hb\n\n'); } catch { /* socket closed */ }
    }, HEARTBEAT_MS);
    if (hb.unref) hb.unref();

    const close = () => {
      clearInterval(hb);
      unsubscribe();
      try { res.end(); } catch { /* already closed */ }
    };
    req.on('close', close);
    req.on('aborted', close);
  });

  return router;
}

module.exports = { buildEventsRouter };
