/**
 * Admin token service — HMAC-signed, stateless tokens with optional
 * server-side denylist for true logout invalidation.
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { writeFileAtomic } = require('../lib/files');
const logger = require('../lib/logger');

class TokenService {
  /**
   * @param {object} opts
   * @param {string} opts.secret      HMAC signing key
   * @param {number} opts.ttlMs       Token lifetime in ms
   * @param {string} opts.denylistFile  Path to JSON file persisting revoked token jti's
   * @param {number} [opts.cleanupIntervalMs]  How often to GC expired entries
   */
  constructor({ secret, ttlMs, denylistFile, cleanupIntervalMs = 60 * 60 * 1000 }) {
    if (!secret || secret.length < 16) {
      throw new Error('TokenService: secret too short');
    }
    this.secret = secret;
    this.ttlMs = ttlMs;
    this.denylistFile = denylistFile;
    this.denylist = this._loadDenylist();
    this._dirty = false;

    // Periodic cleanup so the denylist Map doesn't grow unbounded over
    // weeks of uptime (every revoke before was the only trigger).
    if (cleanupIntervalMs > 0) {
      this._gcTimer = setInterval(() => this._gc(), cleanupIntervalMs);
      // Don't keep the process alive just for this timer.
      if (typeof this._gcTimer.unref === 'function') this._gcTimer.unref();
    }
  }

  /** Stop the GC timer (mainly for tests). */
  close() {
    if (this._gcTimer) {
      clearInterval(this._gcTimer);
      this._gcTimer = null;
    }
  }

  _gc() {
    const before = this.denylist.size;
    this._cleanup();
    if (this.denylist.size !== before || this._dirty) {
      this._persistDenylist();
      this._dirty = false;
      logger.debug('denylist.gc', { before, after: this.denylist.size });
    }
  }

  _loadDenylist() {
    try {
      if (fs.existsSync(this.denylistFile)) {
        const raw = fs.readFileSync(this.denylistFile, 'utf8');
        const arr = JSON.parse(raw);
        // Each entry: { jti, exp } — drop expired
        const now = Date.now();
        const live = arr.filter((e) => e && e.exp > now);
        return new Map(live.map((e) => [e.jti, e.exp]));
      }
    } catch (err) {
      logger.warn('Denylist o\'qishda xatolik', { error: err.message });
    }
    return new Map();
  }

  _persistDenylist() {
    try {
      const arr = [...this.denylist.entries()].map(([jti, exp]) => ({ jti, exp }));
      writeFileAtomic(this.denylistFile, JSON.stringify(arr));
    } catch (err) {
      logger.warn('Denylist saqlashda xatolik', { error: err.message });
    }
  }

  /** Issue a new admin token. */
  create(payload = {}) {
    const jti = crypto.randomBytes(8).toString('hex');
    const fullPayload = {
      role: 'admin',
      jti,
      iat: Date.now(),
      exp: Date.now() + this.ttlMs,
      ...payload,
    };
    const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');
    return `${data}.${sig}`;
  }

  /**
   * Verify a token. Returns the payload if valid; null otherwise.
   * Checks: signature, expiry, role, denylist.
   */
  verify(token) {
    if (!token || typeof token !== 'string') return null;
    const dot = token.indexOf('.');
    if (dot === -1) return null;

    const data = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');

    let sigBuf, expBuf;
    try {
      sigBuf = Buffer.from(sig, 'base64url');
      expBuf = Buffer.from(expected, 'base64url');
    } catch {
      return null;
    }
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    let payload;
    try {
      payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    } catch {
      return null;
    }
    if (payload.role !== 'admin') return null;
    if (!payload.exp || payload.exp <= Date.now()) return null;
    if (payload.jti && this.denylist.has(payload.jti)) return null;

    return payload;
  }

  /** Add a token's jti to the denylist (effective immediately). */
  revoke(token) {
    const dot = token.indexOf('.');
    if (dot === -1) return false;
    const data = token.slice(0, dot);
    let payload;
    try {
      payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    } catch {
      return false;
    }
    if (!payload.jti || !payload.exp) return false;

    // Don't bother denylisting already-expired tokens
    if (payload.exp <= Date.now()) return true;
    this.denylist.set(payload.jti, payload.exp);
    this._cleanup();
    this._persistDenylist();
    return true;
  }

  _cleanup() {
    const now = Date.now();
    for (const [jti, exp] of this.denylist) {
      if (exp <= now) this.denylist.delete(jti);
    }
  }
}

module.exports = { TokenService };
