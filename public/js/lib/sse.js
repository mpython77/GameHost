/**
 * Frontend SSE client — auto-reconnect, ticket-based auth.
 *
 *   const sse = new GH.SSE({ url: '/api/admin/events',
 *                            ticketUrl: '/api/admin/sse-ticket' });
 *   sse.on('game.uploaded', (data) => { ... });
 *   sse.on('connected',     ()      => { ... });
 *   sse.on('error',         (err)   => { ... });   // disconnected
 *   sse.start();
 *   sse.stop();
 *
 * Reconnect strategy: exponential backoff, capped at 30s. The browser
 * EventSource auto-reconnects on transport errors but we cancel and
 * re-open it manually because each connection consumes a ticket.
 */
window.GH = window.GH || {};

window.GH.SSE = (function () {
  function SSE({ url, ticketUrl, debug = false }) {
    this.url = url;
    this.ticketUrl = ticketUrl;
    this.debug = debug;
    this._es = null;
    this._stopped = false;
    this._handlers = {};
    this._lastEventId = 0;
    this._backoff = 1000;
  }

  SSE.prototype.on = function (type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
    return this;
  };

  SSE.prototype._emit = function (type, payload) {
    const list = this._handlers[type] || [];
    for (const fn of list) {
      try { fn(payload); } catch (e) { /* don't break the stream */ }
    }
  };

  SSE.prototype._log = function (msg, extra) {
    if (this.debug) console.log('[SSE]', msg, extra || '');
  };

  SSE.prototype.start = async function () {
    if (this._stopped) this._stopped = false;
    await this._connect();
  };

  SSE.prototype.stop = function () {
    this._stopped = true;
    if (this._es) {
      try { this._es.close(); } catch {}
      this._es = null;
    }
  };

  SSE.prototype._connect = async function () {
    if (this._stopped) return;

    // 1) Get a ticket (uses x-admin-token header).
    let ticket;
    try {
      const r = await fetch(this.ticketUrl, {
        method: 'POST',
        headers: {
          'x-admin-token': (window.GH.Auth && window.GH.Auth.getToken()) || '',
        },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || ('HTTP ' + r.status));
      }
      const body = await r.json();
      ticket = body.ticket;
    } catch (err) {
      this._log('ticket_failed', err.message);
      this._emit('error', err);
      return this._scheduleReconnect();
    }

    // 2) Open EventSource with the ticket.
    const url = this.url + (this.url.includes('?') ? '&' : '?') + 'ticket=' + encodeURIComponent(ticket);
    let es;
    try {
      es = new EventSource(url);
    } catch (err) {
      this._emit('error', err);
      return this._scheduleReconnect();
    }
    this._es = es;

    es.onopen = () => {
      this._log('open');
      this._backoff = 1000; // reset on success
      this._emit('open');
    };

    es.onerror = (err) => {
      this._log('error', err);
      this._emit('error', err);
      // Browser will auto-retry, but our ticket is single-use → close and
      // request a new ticket via _scheduleReconnect.
      try { es.close(); } catch {}
      if (this._es === es) this._es = null;
      this._scheduleReconnect();
    };

    // Each domain event becomes a named event on the wire.
    const NAMED_EVENTS = [
      'connected',
      'game.uploaded',
      'game.deleted',
      'game.privacy_changed',
      'game.played',
      'games.cleared',
    ];
    for (const type of NAMED_EVENTS) {
      es.addEventListener(type, (msgEvent) => {
        let payload;
        try { payload = JSON.parse(msgEvent.data); } catch { return; }
        if (msgEvent.lastEventId) {
          const n = parseInt(msgEvent.lastEventId, 10);
          if (Number.isFinite(n)) this._lastEventId = n;
        }
        this._emit(type, payload && payload.data);
        this._emit('any', { type, payload });
      });
    }
  };

  SSE.prototype._scheduleReconnect = function () {
    if (this._stopped) return;
    const delay = Math.min(this._backoff, 30 * 1000);
    this._backoff = Math.min(this._backoff * 2, 30 * 1000);
    this._log('reconnect_in', delay + 'ms');
    setTimeout(() => this._connect(), delay);
  };

  return SSE;
})();
