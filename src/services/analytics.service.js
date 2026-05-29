/**
 * AnalyticsService — append-only event log + on-demand aggregation.
 *
 *   data/events.jsonl   ←  {type, gameId, ts}\n   per line
 *
 * On startup it scans the log (and any rotated archives) into in-memory
 * daily buckets. New events arriving via the EventBus are both appended to
 * disk (durable) and folded into the live aggregate (cheap reads).
 *
 * Keeping the file in JSONL keeps the format human-readable, line-safe
 * (a partial trailing write is dropped, not corrupted) and trivial to
 * rotate: once the live file passes `maxBytes` it is rolled over to
 * events.jsonl.1 (shifting older archives up to events.jsonl.N), bounding
 * disk usage while preserving recent history across restarts.
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
  constructor({ logFile, bus, games, maxBytes, maxFiles }) {
    this.logFile = logFile;
    this.bus = bus;
    this.games = games;
    // Rotation knobs. Defaults are defensive in case the caller omits them.
    this.maxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 10 * 1024 * 1024;
    this.maxFiles = Number.isFinite(maxFiles) && maxFiles >= 0 ? maxFiles : 3;
    this._bytesWritten = 0;
    this._daily = new Map(); // "YYYY-MM-DD" → { plays, uploads, deletes }
    this._init();
  }

  _init() {
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    this._loadHistorical();
    this._seedSize();

    // Subscribe to bus
    this._unsubscribe = this.bus.subscribe((event) => {
      if (TRACKED_TYPES.has(event.type)) this._record(event);
    });
  }

  /** Seed the byte counter from the current live file so an already-large
   *  log rotates on the next append. */
  _seedSize() {
    let size = 0;
    try {
      if (fs.existsSync(this.logFile)) size = fs.statSync(this.logFile).size;
    } catch { /* size stays 0 */ }
    this._bytesWritten = size;
  }

  _archiveName(n) {
    return `${this.logFile}.${n}`;
  }

  _loadHistorical() {
    // Read oldest archive → newest → live file. Folding is additive so the
    // order only matters for completeness, not correctness.
    const files = [];
    for (let i = this.maxFiles; i >= 1; i--) {
      const f = this._archiveName(i);
      if (fs.existsSync(f)) files.push(f);
    }
    files.push(this.logFile);

    let parsed = 0;
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      try {
        const raw = fs.readFileSync(file, 'utf8');
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          let evt;
          try { evt = JSON.parse(line); } catch { continue; }
          if (!evt || !evt.type || !evt.ts) continue;
          this._fold(evt);
          parsed++;
        }
      } catch (err) {
        logger.warn('analytics.load_failed', { file, error: err.message });
      }
    }
    logger.info('analytics.loaded', { events: parsed, daysTracked: this._daily.size });
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
    const bytes = Buffer.byteLength(line);
    this._maybeRotate(bytes);
    // Synchronous append: analytics events are low-frequency (human-scale),
    // and a sync write keeps size-tracking + rotation race-free (an async
    // stream's lazy file open collides with the synchronous renames).
    try {
      fs.appendFileSync(this.logFile, line);
      this._bytesWritten += bytes;
    } catch (err) {
      logger.error('analytics.write_failed', { error: err.message });
    }
  }

  /**
   * Roll the live log over once it would exceed maxBytes. Keeps up to
   * maxFiles archives (events.jsonl.1 .. .N); the oldest is discarded.
   * In-memory aggregates are untouched, so reads are unaffected.
   */
  _maybeRotate(incomingBytes) {
    if (this.maxBytes <= 0) return;
    if (this._bytesWritten + incomingBytes <= this.maxBytes) return;

    try {
      if (this.maxFiles <= 0) {
        // No archives kept — just truncate by removing the live file.
        if (fs.existsSync(this.logFile)) fs.unlinkSync(this.logFile);
      } else {
        // Discard the oldest archive, then shift .(N-1)→.N ... .1→.2.
        const oldest = this._archiveName(this.maxFiles);
        if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
        for (let i = this.maxFiles - 1; i >= 1; i--) {
          const src = this._archiveName(i);
          if (fs.existsSync(src)) fs.renameSync(src, this._archiveName(i + 1));
        }
        if (fs.existsSync(this.logFile)) fs.renameSync(this.logFile, this._archiveName(1));
      }
      logger.info('analytics.rotated', { maxBytes: this.maxBytes, maxFiles: this.maxFiles });
    } catch (err) {
      logger.warn('analytics.rotate_failed', { error: err.message });
    }

    // Live file is now gone — next append recreates it from zero.
    this._bytesWritten = 0;
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
    // Writes are synchronous (appendFileSync), so nothing to flush.
  }
}

module.exports = { AnalyticsService };
