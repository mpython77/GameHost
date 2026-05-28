/**
 * AnalyticsService — append-only event log + on-demand aggregation.
 *
 *   data/events.jsonl   ←  {type, gameId, ts}\n   per line
 *
 * On startup it scans the log into in-memory daily buckets. New events
 * arriving via the EventBus are both appended to disk (durable) and
 * folded into the live aggregate (cheap reads).
 *
 * Keeping the file in JSONL keeps the format human-readable, line-safe
 * (a partial trailing write is dropped, not corrupted), and easy to
 * archive/rotate later.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');
const { EVENTS } = require('../lib/event-bus');

const TRACKED_TYPES = new Set([
  EVENTS.GAME_UPLOADED,
  EVENTS.GAME_DELETED,
  EVENTS.GAME_PRIVACY,
  EVENTS.GAME_PLAYED,
]);

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

class AnalyticsService {
  constructor({ logFile, bus, games }) {
    this.logFile = logFile;
    this.bus = bus;
    this.games = games;
    this._writeStream = null;
    this._daily = new Map(); // "YYYY-MM-DD" → { plays, uploads, deletes }
    this._init();
  }

  _init() {
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    this._loadHistorical();

    // Subscribe to bus
    this._unsubscribe = this.bus.subscribe((event) => {
      if (TRACKED_TYPES.has(event.type)) this._record(event);
    });

    // Open append stream
    this._writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this._writeStream.on('error', (err) => {
      logger.error('analytics.write_stream_error', { error: err.message });
    });
  }

  _loadHistorical() {
    if (!fs.existsSync(this.logFile)) return;
    try {
      const raw = fs.readFileSync(this.logFile, 'utf8');
      const lines = raw.split('\n');
      let parsed = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (!evt || !evt.type || !evt.ts) continue;
        this._fold(evt);
        parsed++;
      }
      logger.info('analytics.loaded', { events: parsed, daysTracked: this._daily.size });
    } catch (err) {
      logger.warn('analytics.load_failed', { error: err.message });
    }
  }

  _fold(event) {
    const day = dayKey(event.ts);
    let bucket = this._daily.get(day);
    if (!bucket) {
      bucket = { plays: 0, uploads: 0, deletes: 0 };
      this._daily.set(day, bucket);
    }
    if (event.type === EVENTS.GAME_PLAYED) bucket.plays++;
    else if (event.type === EVENTS.GAME_UPLOADED) bucket.uploads++;
    else if (event.type === EVENTS.GAME_DELETED) bucket.deletes++;
  }

  _record(event) {
    this._fold(event);
    const line = JSON.stringify({
      type: event.type,
      gameId: event.data && event.data.gameId,
      ts: event.ts,
    }) + '\n';
    if (this._writeStream && !this._writeStream.destroyed) {
      this._writeStream.write(line);
    }
  }

  /**
   * Build a dashboard payload for the last `days` days.
   * Cheap: O(days), not O(events).
   */
  summary({ days = 30 } = {}) {
    const today = new Date();
    const series = [];
    let rangePlays = 0;
    let rangeUploads = 0;
    let rangeDeletes = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const b = this._daily.get(key) || { plays: 0, uploads: 0, deletes: 0 };
      series.push({ date: key, ...b });
      rangePlays    += b.plays;
      rangeUploads  += b.uploads;
      rangeDeletes  += b.deletes;
    }

    // Distributions from current DB state
    const all = this.games.db.getAll();
    const byCategory = {};
    let publicCount = 0;
    let privateCount = 0;
    let allTimePlays = 0;
    for (const g of all) {
      const cat = g.category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + (g.playCount || 0);
      if (g.isPrivate) privateCount++; else publicCount++;
      allTimePlays += g.playCount || 0;
    }

    const topGames = all.slice()
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 10)
      .map((g) => ({
        id: g.id,
        name: g.name,
        playCount: g.playCount || 0,
        category: g.category,
        isPrivate: !!g.isPrivate,
      }));

    return {
      range: { days, from: series[0] && series[0].date, to: series[series.length - 1] && series[series.length - 1].date },
      summary: {
        rangePlays,
        rangeUploads,
        rangeDeletes,
        allTimePlays,
        totalGames: all.length,
        publicCount,
        privateCount,
      },
      series,
      byCategory,
      topGames,
    };
  }

  close() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._writeStream && !this._writeStream.destroyed) {
      try { this._writeStream.end(); } catch { /* ignore */ }
    }
  }
}

module.exports = { AnalyticsService };
