/**
 * Smoke test — start the app, hit /api/health, exit non-zero on failure.
 *
 *   node scripts/smoke-test.js
 *
 * No external test framework needed.
 */

'use strict';

process.env.NODE_ENV = 'development';
process.env.PORT = process.env.PORT || '0';
process.env.LOG_LEVEL = 'warn';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Run against an isolated temp DATA_DIR so the smoke test leaves no
// artifacts in the repo. Must be set before requiring the app.
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehost-smoke-'));
process.env.DATA_DIR = TEST_DATA_DIR;
process.on('exit', () => {
  try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

const { createApp } = require('../src/app');

const app = createApp();
const server = app.listen(process.env.PORT, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`smoke: server listening on ${port}`);

  const cases = [
    { method: 'GET', path: '/api/health', expect: 200 },
    { method: 'GET', path: '/api/games',  expect: 200 },
    // private route: no token → 404
    { method: 'GET', path: '/api/games/private/nonexistent', expect: 404 },
    // protected route: no admin token → 401
    { method: 'GET', path: '/api/admin/games', expect: 401 },
    // bogus login
    { method: 'POST', path: '/api/admin/login', body: { username: 'x', password: 'y' }, expect: 401 },
  ];

  let pass = 0, fail = 0;
  let idx = 0;

  function next() {
    if (idx >= cases.length) {
      console.log(`\nsmoke: ${pass} pass, ${fail} fail`);
      server.close(() => process.exit(fail === 0 ? 0 : 1));
      return;
    }
    const c = cases[idx++];
    const opts = {
      method: c.method,
      hostname: '127.0.0.1',
      port,
      path: c.path,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      const ok = res.statusCode === c.expect;
      if (ok) {
        pass++;
        console.log(`  ✓ ${c.method} ${c.path} → ${res.statusCode}`);
      } else {
        fail++;
        console.log(`  ✗ ${c.method} ${c.path} → ${res.statusCode} (expected ${c.expect})`);
      }
      res.resume();
      res.on('end', next);
    });
    req.on('error', (err) => {
      fail++;
      console.log(`  ✗ ${c.method} ${c.path} → ERROR ${err.message}`);
      next();
    });
    if (c.body) req.write(JSON.stringify(c.body));
    req.end();
  }

  next();
});

setTimeout(() => {
  console.error('smoke: timeout');
  process.exit(2);
}, 15000).unref();
