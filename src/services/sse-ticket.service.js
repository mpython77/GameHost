/**
 * SSE ticket service.
 *
 * EventSource API doesn't allow custom headers — so we cannot send our
 * `x-admin-token` on the SSE connection itself. Putting the admin token
 * in the URL would risk it being logged by upstream proxies.
 *
 * Solution: admin POSTs once with their token to obtain a short-lived,
 * single-use TICKET, then opens EventSource with the ticket as a query
 * param. The ticket is consumed on connect and discarded.
 */

'use strict';

const crypto = require('crypto');
const logger = require('../lib/logger');

class SseTicketService {
  constructor({ ttlMs = 60 * 1000, maxOutstanding = 200 } = {}) {
    this.ttlMs = ttlMs;
    this.maxOutstanding = maxOutstanding;
    this._tickets = new Map(); // ticket → { exp }
    this._gcTimer = setInterval(() => this._gc(), 60 * 1000);
    if (this._gcTimer.unref) this._gcTimer.unref();
  }

  issue(meta = {}) {
    if (this._tickets.size > this.maxOutstanding) {
      this._gc();
      if (this._tickets.size > this.maxOutstanding) {
        logger.warn('sse_ticket.overflow', { size: this._tickets.size });
        throw new Error('Too many outstanding tickets');
      }
    }
    const ticket = crypto.randomBytes(16).toString('hex');
    this._tickets.set(ticket, { exp: Date.now() + this.ttlMs, ...meta });
    return ticket;
  }

  /** Validate AND remove the ticket. Returns true if valid. */
  consume(ticket) {
    if (!ticket || typeof ticket !== 'string') return false;
    const entry = this._tickets.get(ticket);
    if (!entry) return false;
    this._tickets.delete(ticket); // single-use
    return entry.exp > Date.now();
  }

  _gc() {
    const now = Date.now();
    for (const [k, v] of this._tickets) {
      if (v.exp <= now) this._tickets.delete(k);
    }
  }

  close() {
    if (this._gcTimer) clearInterval(this._gcTimer);
  }
}

module.exports = { SseTicketService };
