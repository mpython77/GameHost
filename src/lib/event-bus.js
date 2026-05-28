/**
 * EventBus — in-process Pub/Sub for live updates and analytics fan-out.
 *
 * Every domain mutation (upload, delete, privacy change, play) publishes
 * a typed event here. Subscribers — currently the SSE route and the
 * analytics service — receive events synchronously. The bus also keeps
 * a small ring buffer so SSE clients can replay missed events after a
 * reconnect via the `Last-Event-ID` header.
 *
 * Design notes:
 *   - Subscriber callbacks must NOT throw; we still wrap them in try/catch
 *     so a buggy listener can't break others.
 *   - Each event has a monotonic `id`. Persisted across restarts is NOT
 *     guaranteed (id resets to 0 on boot) — that is acceptable for SSE
 *     because clients always request id > lastSeen, and on restart all
 *     ids are tiny.
 *   - Subscribers are managed via the returned unsubscribe fn, not via
 *     a removeListener API, so leaks are easier to audit.
 */

'use strict';

class EventBus {
  /**
   * @param {object} [opts]
   * @param {number} [opts.historyLimit=200]  Ring buffer size for replays.
   */
  constructor({ historyLimit = 200 } = {}) {
    this._listeners = new Set();
    this._history = [];
    this._historyLimit = historyLimit;
    this._lastId = 0;
  }

  /**
   * Subscribe to all events. Returns an unsubscribe function.
   * @param {(event:{id,type,data,ts}) => void} fn
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /**
   * Publish an event of the given type. Returns the constructed event.
   */
  publish(type, data = {}) {
    const event = {
      id: ++this._lastId,
      type,
      data,
      ts: Date.now(),
    };
    // Push to history ring
    this._history.push(event);
    if (this._history.length > this._historyLimit) {
      this._history.shift();
    }
    // Fan out
    for (const fn of this._listeners) {
      try { fn(event); } catch { /* keep going */ }
    }
    return event;
  }

  /** Get events with id > sinceId (for SSE replay). */
  since(sinceId) {
    if (!Number.isFinite(sinceId) || sinceId <= 0) return [];
    return this._history.filter((e) => e.id > sinceId);
  }

  /** Snapshot of the most recent N events (for diagnostics). */
  recent(n = 20) {
    return this._history.slice(-n);
  }

  /** Number of active subscribers — useful for SSE health metrics. */
  subscriberCount() { return this._listeners.size; }
}

// Event type constants — single source of truth for both publishers
// and subscribers. Kept in one place so misspellings are caught at lint.
const EVENTS = Object.freeze({
  GAME_UPLOADED:    'game.uploaded',
  GAME_DELETED:     'game.deleted',
  GAME_PRIVACY:     'game.privacy_changed',
  GAME_PLAYED:      'game.played',
  GAMES_CLEARED:    'games.cleared',
});

module.exports = { EventBus, EVENTS };
