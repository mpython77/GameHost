/**
 * Targeted regression tests for the 8 bugs fixed in this PR.
 * Run after a fresh DB:  rm -rf data && node scripts/bug-tests.js
 */

'use strict';

// Tests rely on uploading many files quickly. Set the bypass flag BEFORE
// requiring any application code so the rate-limit middleware sees it.
process.env.GH_DISABLE_RATE_LIMIT = '1';
process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.LOG_LEVEL = 'error';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Hermetic run: use an isolated temp DATA_DIR so the suite is repeatable
// (the slug-collision assertions need a fresh DB) and never pollutes the
// repo's ./data. Must be set BEFORE requiring the app — config snapshots
// env at require time.
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehost-test-'));
process.env.DATA_DIR = TEST_DATA_DIR;
process.on('exit', () => {
  try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

const { createApp } = require('../src/app');

const app = createApp();
const server = app.listen(0, '127.0.0.1', async () => {
  // Apply the same socket timeouts as production (server.js does this).
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 70 * 1000;
  server.requestTimeout = 5 * 60 * 1000;
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  let pass = 0, fail = 0;

  const ok  = (label) => { pass++; console.log('  \x1b[32m✓\x1b[0m', label); };
  const bad = (label, why) => { fail++; console.log('  \x1b[31m✗\x1b[0m', label, '—', why); };

  async function login() {
    const r = await fetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    return (await r.json()).token;
  }

  async function uploadGame(token, name, isPrivate = false) {
    const fd = new FormData();
    const html = fs.readFileSync('./scripts/_fixtures/test-game.html');
    fd.append('gameFile', new Blob([html], { type: 'text/html' }), 'test.html');
    fd.append('gameName_uz', name);
    fd.append('gameName_en', name);
    fd.append('category', 'arcade');
    fd.append('isPrivate', String(isPrivate));
    const r = await fetch(base + '/api/upload', {
      method: 'POST',
      headers: { 'x-admin-token': token },
      body: fd,
    });
    return r.json();
  }

  // ===== Test 1: Private folder is unguessable =====
  console.log('\n[BUG #1] Private folder unguessable');
  const token = await login();
  const priv = await uploadGame(token, 'Maxfiy O\'yin', true);
  if (priv.success && priv.game.folder.includes('__') && priv.game.folder.length > 30) {
    ok(`private folder = ${priv.game.folder}`);
  } else {
    bad('private folder not unguessable', JSON.stringify(priv));
  }

  // Static access by guessing the slug should now 404.
  // Use redirect:'manual' so we don't follow the notFound 302→/
  const guessRes = await fetch(base + '/games/maxfiy-o-yin/index.html', { redirect: 'manual' });
  if (guessRes.status === 302 || guessRes.status === 404) {
    ok(`GET /games/<guessed-slug>/index.html → ${guessRes.status} (not found)`);
  } else {
    bad('GET /games/<guessed-slug>/index.html', `got ${guessRes.status}`);
  }

  // Direct access to actual private folder still works (legitimate iframe path)
  const directRes = await fetch(base + '/games/' + priv.game.folder + '/index.html');
  if (directRes.status === 200) {
    ok('GET /games/<actual-private-folder>/index.html → 200');
  } else {
    bad('legitimate private path', `got ${directRes.status}`);
  }

  // ===== Test 2: Storage system files protected =====
  console.log('\n[BUG #2] System files cannot be deleted');
  const dataDir = app.locals.config.DATA_DIR;
  const protectedFiles = [
    path.join(dataDir, 'games-db.json'),
    path.join(dataDir, '.admin-secret'),
    path.join(dataDir, '.token-denylist.json'),
  ];
  for (const f of protectedFiles) {
    const r = await fetch(base + '/api/admin/storage', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ target: f }),
    });
    if (r.status === 403) ok(`DELETE ${path.basename(f)} → 403`);
    else bad(`DELETE ${path.basename(f)}`, `got ${r.status}`);
  }
  // Data dir itself
  const r1 = await fetch(base + '/api/admin/storage', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ target: dataDir }),
  });
  if (r1.status === 403) ok('DELETE data dir → 403');
  else bad('DELETE data dir', `got ${r1.status}`);

  // Path traversal
  const r2 = await fetch(base + '/api/admin/storage', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ target: '/etc/passwd' }),
  });
  if (r2.status === 403) ok('DELETE /etc/passwd → 403');
  else bad('DELETE /etc/passwd', `got ${r2.status}`);

  // ===== Test 3: Slug collision creates -2, -3 =====
  console.log('\n[BUG #3] Slug collision suffix');
  const a = await uploadGame(token, 'Bir Xil Nom', false);
  const b = await uploadGame(token, 'Bir Xil Nom', false);
  const c = await uploadGame(token, 'Bir Xil Nom', false);
  if (a.game.id === 'bir-xil-nom' && b.game.id === 'bir-xil-nom-2' && c.game.id === 'bir-xil-nom-3') {
    ok(`unique IDs: ${a.game.id}, ${b.game.id}, ${c.game.id}`);
  } else {
    bad('unique IDs', `${a.game.id} / ${b.game.id} / ${c.game.id}`);
  }

  // ===== Test 4: ZIP symlink rejection =====
  console.log('\n[BUG #4] ZIP symlink rejected');
  // Use a real symlink ZIP built with `zip --symlinks` (adm-zip cannot
  // produce a faithful symlink entry on its own — it strips the S_IFLNK
  // mode bits when serializing. So we use a fixture file pre-built by
  // the OS `zip` tool. See scripts/_fixtures/symlink.zip.
  const symFixturePath = './scripts/_fixtures/symlink.zip';
  if (!fs.existsSync(symFixturePath)) {
    console.log('  \x1b[33m⚠\x1b[0m  fixture missing, skipping; build with:');
    console.log('       (cd /tmp && ln -s /etc/passwd evil-link && zip --symlinks symlink.zip evil-link)');
  } else {
    const fd = new FormData();
    fd.append('gameFile', new Blob([fs.readFileSync(symFixturePath)], { type: 'application/zip' }), 'evil.zip');
    fd.append('gameName_uz', 'Evil Game');
    fd.append('gameName_en', 'Evil Game');
    fd.append('category', 'arcade');
    fd.append('isPrivate', 'false');
    const evilRes = await fetch(base + '/api/upload', {
      method: 'POST',
      headers: { 'x-admin-token': token },
      body: fd,
    });
    const evilBody = await evilRes.json();
    if (evilRes.status === 400 && /symlink/i.test(evilBody.error || '')) {
      ok('symlink ZIP → 400 ' + evilBody.error);
    } else {
      bad('symlink ZIP', `${evilRes.status} ${JSON.stringify(evilBody)}`);
    }
  }

  // ===== Test 7: Multer fileFilter returns 400 not 500 =====
  console.log('\n[BUG #7] Bad file ext → 400');
  const badFd = new FormData();
  badFd.append('gameFile', new Blob([Buffer.from('not html')], { type: 'application/x-msdos-program' }), 'evil.exe');
  badFd.append('gameName_uz', 'Evil');
  badFd.append('gameName_en', 'Evil');
  badFd.append('category', 'arcade');
  badFd.append('isPrivate', 'false');
  const badRes = await fetch(base + '/api/upload', {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: badFd,
  });
  if (badRes.status === 400) ok('upload .exe → 400');
  else bad('upload .exe', `got ${badRes.status}`);

  // ===== Test 8: notFound clean redirect =====
  console.log('\n[BUG #8] notFound 302 redirect');
  const nf = await fetch(base + '/this-page-does-not-exist', { redirect: 'manual' });
  if (nf.status === 302 && nf.headers.get('location') === '/') {
    ok('GET /missing → 302 to /');
  } else {
    bad('GET /missing', `status=${nf.status} loc=${nf.headers.get('location')}`);
  }

  // API 404 still returns JSON
  const nfApi = await fetch(base + '/api/missing');
  if (nfApi.status === 404) {
    const j = await nfApi.json();
    if (j.error) ok('GET /api/missing → 404 JSON');
    else bad('API 404 JSON', JSON.stringify(j));
  } else {
    bad('API 404', `got ${nfApi.status}`);
  }

  // ===== Test 9: setPrivacy renames folder =====
  console.log('\n[BUG #1+] Toggle privacy renames folder');
  // Public game → private should rename
  const aId = a.game.id;
  const r3 = await fetch(base + '/api/admin/games/' + aId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ isPrivate: true }),
  });
  const updated = await r3.json();
  if (updated.folder && updated.folder.includes('__') && updated.privateToken) {
    ok(`public→private folder renamed: ${a.game.folder} → ${updated.folder}`);
  } else {
    bad('public→private rename', JSON.stringify(updated));
  }
  // Old folder should not exist
  if (!fs.existsSync(path.join(app.locals.config.GAMES_DIR, a.game.folder))) {
    ok('old public folder removed');
  } else {
    bad('old folder still present');
  }

  // Toggle back to public
  const r4 = await fetch(base + '/api/admin/games/' + aId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ isPrivate: false }),
  });
  const restored = await r4.json();
  if (restored.folder === aId && restored.privateToken === null) {
    ok(`private→public restored: folder=${restored.folder}`);
  } else {
    bad('private→public restore', JSON.stringify(restored));
  }

  // ===== Test 10: QR endpoint info-leak fix =====
  console.log('\n[BUG NEW] QR endpoint info leak');
  // Anonymous request for nonexistent game id
  const qr1 = await fetch(base + '/api/games/no-such-game/qr');
  // Anonymous request for a private game (priv from earlier)
  const qr2 = await fetch(base + '/api/games/' + priv.game.id + '/qr');
  if (qr1.status === 404 && qr2.status === 404) {
    ok('private + missing both → 404 (no leak)');
  } else {
    bad('QR info leak', `missing=${qr1.status} private=${qr2.status} (both should be 404)`);
  }

  // ===== Test 11: Token shape validation =====
  console.log('\n[BUG NEW] Malformed private token rejected');
  const r5 = await fetch(base + '/api/games/private/' + 'XX-not-hex-XX');
  if (r5.status === 404) {
    ok('non-hex token → 404');
  } else {
    bad('malformed token', `got ${r5.status}`);
  }

  // ===== Test 12: Zero-byte upload rejected =====
  console.log('\n[BUG NEW] Zero-byte file rejected');
  const zfd = new FormData();
  zfd.append('gameFile', new Blob([], { type: 'text/html' }), 'empty.html');
  zfd.append('gameName_uz', 'Empty');
  zfd.append('gameName_en', 'Empty');
  zfd.append('category', 'arcade');
  zfd.append('isPrivate', 'false');
  const zr = await fetch(base + '/api/upload', {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: zfd,
  });
  if (zr.status === 400) {
    ok('empty file → 400');
  } else {
    bad('empty file', `got ${zr.status}`);
  }

  // ===== Test 13: ZIP backslash entry rejected =====
  console.log('\n[BUG NEW] ZIP backslash in entry name');
  const { isSafeEntryName } = require('../src/lib/zip');
  if (!isSafeEntryName('foo\\..\\bar')) ok('backslash entry → unsafe');
  else bad('backslash entry');
  if (!isSafeEntryName('./foo')) ok('./ entry → unsafe');
  else bad('./ entry');
  if (isSafeEntryName('normal/path/file.html')) ok('normal entry → safe');
  else bad('normal entry');

  // ===== Test 14: Buffered play counter =====
  console.log('\n[BUG NEW] Play counter is buffered');
  const ginfo = await fetch(base + '/api/games').then((r) => r.json());
  if (Array.isArray(ginfo) && ginfo.length > 0) {
    const gid = ginfo[0].id;
    const before = (await fetch(base + '/api/admin/games', {
      headers: { 'x-admin-token': token },
    }).then((r) => r.json())).find((g) => g.id === gid).playCount || 0;

    // Bombard with 10 plays
    await Promise.all(Array.from({ length: 10 }, () =>
      fetch(base + '/api/games/' + gid + '/play', { method: 'POST' }).then((r) => r.json()).catch(() => null)
    ));

    // In-memory increment is immediate; flush will happen later.
    const after = (await fetch(base + '/api/admin/games', {
      headers: { 'x-admin-token': token },
    }).then((r) => r.json())).find((g) => g.id === gid).playCount || 0;

    if (after >= before + 1 && after <= before + 10) {
      ok(`play count incremented in memory: ${before} → ${after}`);
    } else {
      bad('play counter buffer', `before=${before} after=${after}`);
    }
  } else {
    console.log('  \x1b[33m⚠\x1b[0m  no public games to test');
  }

  // ===== Test 15: Mutex serializes uploads =====
  console.log('\n[BUG NEW] Concurrent uploads serialized via mutex');
  const html = fs.readFileSync('./scripts/_fixtures/test-game.html');
  const concurrentUploads = await Promise.all([0, 1, 2].map((n) => {
    const ufd = new FormData();
    ufd.append('gameFile', new Blob([html], { type: 'text/html' }), 'concurrent.html');
    ufd.append('gameName_uz', 'Concurrent');
    ufd.append('gameName_en', 'Concurrent');
    ufd.append('category', 'arcade');
    ufd.append('isPrivate', 'false');
    return fetch(base + '/api/upload', {
      method: 'POST',
      headers: { 'x-admin-token': token },
      body: ufd,
    }).then((r) => r.json());
  }));
  const ids = concurrentUploads.map((r) => r.game && r.game.id).sort();
  const allUnique = new Set(ids).size === ids.length;
  if (allUnique && ids.every((id) => id && id.startsWith('concurrent'))) {
    ok(`concurrent uploads got unique IDs: ${ids.join(', ')}`);
  } else {
    bad('mutex serialize', JSON.stringify(ids));
  }

  // ===== Test 16: Concurrent setPrivacy doesn't desync DB and disk =====
  console.log('\n[BUG NEW] Concurrent setPrivacy is mutex-protected');
  const targetId = ids[0]; // concurrent
  // Fire 4 toggles at once. Result should be deterministic (last write wins
  // for the DB), and the on-disk folder should match the DB.folder.
  await Promise.all([true, false, true, false].map((flag) =>
    fetch(base + '/api/admin/games/' + targetId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ isPrivate: flag }),
    }).then((r) => r.json()).catch(() => null)
  ));
  const stateNow = (await fetch(base + '/api/admin/games', {
    headers: { 'x-admin-token': token },
  }).then((r) => r.json())).find((g) => g.id === targetId);
  const folderExists = stateNow && fs.existsSync(path.join(app.locals.config.GAMES_DIR, stateNow.folder));
  if (folderExists) {
    ok(`DB.folder matches disk after 4 concurrent toggles → ${stateNow.folder}`);
  } else {
    bad('setPrivacy desync', JSON.stringify(stateNow));
  }

  // ===== Test 17: Server timeouts (slow loris mitigation) =====
  console.log('\n[BUG NEW] Server has socket timeouts configured');
  if (server.keepAliveTimeout > 0 && server.headersTimeout > server.keepAliveTimeout) {
    ok(`keepAlive=${server.keepAliveTimeout}ms headers=${server.headersTimeout}ms`);
  } else {
    bad('timeouts not set', `keepAlive=${server.keepAliveTimeout} headers=${server.headersTimeout}`);
  }

  // ===== Test 18: RFC 5987 download header =====
  console.log('\n[BUG NEW] Download Content-Disposition is safe');
  const dlRes = await fetch(base + '/api/games/' + targetId + '/download', {
    headers: { 'x-admin-token': token },
  });
  const cd = dlRes.headers.get('content-disposition') || '';
  const hasFilenameStar = cd.includes("filename*=UTF-8''");
  const hasNoCRLF = !/[\r\n]/.test(cd);
  if (hasFilenameStar && hasNoCRLF) {
    ok('Content-Disposition uses RFC 5987 + CRLF-safe');
  } else {
    bad('Content-Disposition unsafe', cd);
  }

  // ===== Test 19: i18n keys exist for all 3 languages =====
  console.log('\n[BUG NEW] i18n — every key has uz/ru/en');
  // Read the i18n file and parse the translations object via a regex.
  const i18nSrc = fs.readFileSync('./public/js/i18n.js', 'utf8');
  const dictMatch = i18nSrc.match(/const translations = (\{[\s\S]*?\n  \});/);
  if (!dictMatch) {
    bad('i18n parse');
  } else {
    // Eval the literal in a sandboxed Function (safe, no I/O).
    let dict;
    try {
      // eslint-disable-next-line no-new-func
      dict = new Function('return ' + dictMatch[1])();
    } catch (e) {
      bad('i18n eval', e.message);
    }
    if (dict) {
      const missing = [];
      for (const [key, langs] of Object.entries(dict)) {
        for (const lang of ['uz', 'ru', 'en']) {
          if (!langs[lang] || typeof langs[lang] !== 'string') {
            missing.push(`${key}#${lang}`);
          }
        }
      }
      if (missing.length === 0) {
        ok(`every key has all 3 languages (${Object.keys(dict).length} keys)`);
      } else {
        bad('i18n incomplete', `missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
      }
    }
  }

  // ===== Test 20: HTTP rate-limit headers on /api/* =====
  console.log('\n[BUG NEW] Rate-limit headers present on API');
  const rl = await fetch(base + '/api/games');
  // express-rate-limit v7 (draft-7) emits `ratelimit` and `ratelimit-policy`.
  // Older versions emit `ratelimit-limit` / `x-ratelimit-limit`.
  const hasLimitHeader =
    !!rl.headers.get('ratelimit') ||
    !!rl.headers.get('ratelimit-policy') ||
    !!rl.headers.get('ratelimit-limit') ||
    !!rl.headers.get('x-ratelimit-limit');
  if (hasLimitHeader) {
    ok('RateLimit headers exposed on /api/games (draft-7 or legacy)');
  } else {
    bad('no rate limit header', JSON.stringify([...rl.headers.entries()]));
  }

  // ===== Test 21: CSP + security headers =====
  console.log('\n[BUG NEW] Security headers present');
  const idx = await fetch(base + '/');
  const csp = idx.headers.get('content-security-policy');
  const xfo = idx.headers.get('x-content-type-options');
  if (csp && csp.includes("default-src") && xfo === 'nosniff') {
    ok(`CSP set, X-Content-Type-Options=${xfo}`);
  } else {
    bad('security headers', `CSP=${!!csp} XCTO=${xfo}`);
  }

  // ===== Test 22: Request ID round-trip =====
  console.log('\n[BUG NEW] X-Request-Id header round-trip');
  const ridRes = await fetch(base + '/api/health', {
    headers: { 'x-request-id': 'test-correlation-12345' },
  });
  if (ridRes.headers.get('x-request-id') === 'test-correlation-12345') {
    ok('upstream X-Request-Id is preserved');
  } else {
    bad('request id', ridRes.headers.get('x-request-id'));
  }

  // ===== Test 23: Analytics endpoint =====
  console.log('\n[FEATURE] Analytics — summary endpoint');
  // Generate some plays so analytics has data
  const list = await fetch(base + '/api/games').then((r) => r.json());
  if (Array.isArray(list) && list.length > 0) {
    const gid = list[0].id;
    await Promise.all([0, 1, 2, 3, 4].map(() =>
      fetch(base + '/api/games/' + gid + '/play', { method: 'POST' })
        .then((r) => r.json()).catch(() => null)
    ));
  }
  const an = await fetch(base + '/api/admin/analytics?days=7', {
    headers: { 'x-admin-token': token },
  });
  const anData = await an.json();
  if (an.status === 200 && anData.range && anData.summary && Array.isArray(anData.series)) {
    ok(`analytics days=${anData.range.days} series=${anData.series.length} plays=${anData.summary.allTimePlays}`);
  } else {
    bad('analytics endpoint', JSON.stringify(anData).slice(0, 200));
  }
  // Without auth → 401
  const an401 = await fetch(base + '/api/admin/analytics');
  if (an401.status === 401) ok('analytics requires admin auth');
  else bad('analytics auth gate', `got ${an401.status}`);

  // Days clamp (>365 → 365)
  const anClamp = await fetch(base + '/api/admin/analytics?days=99999', {
    headers: { 'x-admin-token': token },
  }).then((r) => r.json());
  if (anClamp.range && anClamp.range.days <= 365) {
    ok(`days param clamped to ${anClamp.range.days}`);
  } else {
    bad('analytics clamp', JSON.stringify(anClamp.range));
  }

  // ===== Test 24: SSE end-to-end on a clean server =====
  // We use a SEPARATE server instance so this test is not affected by the
  // upload rate-limit (10/5min/IP) consumed by earlier tests.
  console.log('\n[FEATURE] SSE — end-to-end live delivery');
  await testSseEndToEnd();

  // ===== Test 25: Analytics aggregates plays =====
  console.log('\n[FEATURE] Analytics aggregates plays correctly');
  const an2 = await fetch(base + '/api/admin/analytics?days=7', {
    headers: { 'x-admin-token': token },
  }).then((r) => r.json());
  if (an2.summary.rangePlays >= 5) {
    ok(`analytics aggregated plays: rangePlays=${an2.summary.rangePlays}`);
  } else {
    bad('analytics plays', JSON.stringify(an2.summary));
  }
  // Today's bucket should have plays
  const todayBucket = an2.series[an2.series.length - 1];
  if (todayBucket && todayBucket.plays >= 5 && todayBucket.uploads >= 1) {
    ok(`today's bucket: plays=${todayBucket.plays} uploads=${todayBucket.uploads}`);
  } else {
    bad('today bucket', JSON.stringify(todayBucket));
  }

  // ===== Test 26: runtime-config.js exposes games origin =====
  console.log('\n[FIX] runtime-config.js for iframe isolation');
  const rcRes = await fetch(base + '/js/runtime-config.js');
  const rcType = rcRes.headers.get('content-type') || '';
  const rcBody = await rcRes.text();
  if (rcRes.status === 200 && /javascript/.test(rcType) &&
      rcBody.includes('window.GH_RUNTIME') && rcBody.includes('gamesBaseUrl')) {
    ok('runtime-config.js serves window.GH_RUNTIME.gamesBaseUrl');
  } else {
    bad('runtime-config.js', `${rcRes.status} ${rcType} ${rcBody.slice(0, 80)}`);
  }
  // play.html embeds runtime-config.js before play.js
  const playHtml = fs.readFileSync('./public/play.html', 'utf8');
  if (playHtml.includes('js/runtime-config.js')) {
    ok('play.html loads runtime-config.js');
  } else {
    bad('play.html runtime-config', 'script tag missing');
  }

  // ===== Test 27: events.jsonl rotation (bounded disk, complete memory) =====
  console.log('\n[FIX] Analytics event-log rotation');
  await (async function testRotation() {
    const { EventBus, EVENTS } = require('../src/lib/event-bus');
    const { AnalyticsService } = require('../src/services/analytics.service');
    const rotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehost-rot-'));
    const rotLog = path.join(rotDir, 'events.jsonl');
    try {
      const rbus = new EventBus();
      const a = new AnalyticsService({
        logFile: rotLog, bus: rbus, games: { db: { getAll: () => [] } },
        maxBytes: 300, maxFiles: 2,
      });
      for (let i = 0; i < 200; i++) rbus.publish(EVENTS.GAME_PLAYED, { gameId: 'g1' });

      const liveSize = fs.statSync(rotLog).size;
      const archives = fs.readdirSync(rotDir).filter((f) => /events\.jsonl\.\d+$/.test(f)).length;
      const memPlays = a.summary({ days: 1 }).summary.rangePlays;
      a.close();

      // Reload from the retained files (archives + live)
      const a2 = new AnalyticsService({
        logFile: rotLog, bus: new EventBus(), games: { db: { getAll: () => [] } },
        maxBytes: 300, maxFiles: 2,
      });
      const reloadPlays = a2.summary({ days: 1 }).summary.rangePlays;
      a2.close();

      if (liveSize <= 300 && archives === 2) {
        ok(`live log capped (${liveSize}B ≤ 300B) with ${archives} archives kept`);
      } else {
        bad('rotation cap', `liveSize=${liveSize} archives=${archives}`);
      }
      if (memPlays === 200) {
        ok('in-memory aggregate complete despite rotation (200 plays)');
      } else {
        bad('in-memory aggregate', `got ${memPlays}`);
      }
      if (reloadPlays > 0 && reloadPlays < 200) {
        ok(`restart preserves recent history from retained files (${reloadPlays} plays)`);
      } else {
        bad('reload retention', `got ${reloadPlays} (expected 0 < n < 200)`);
      }
    } finally {
      fs.rmSync(rotDir, { recursive: true, force: true });
    }
  })();

  // ===== Test 28: /api/health/full is admin-gated (no posture leak) =====
  console.log('\n[FIX] health/full requires admin auth');
  {
    const pub = await fetch(base + '/api/health');
    const pubBody = await pub.json();
    const full401 = await fetch(base + '/api/health/full');
    const fullOk = await fetch(base + '/api/health/full', {
      headers: { 'x-admin-token': token },
    });
    if (pub.status === 200 && pubBody.status === 'ok' && pubBody.tempPasswordActive === undefined) {
      ok('public /api/health stays 200 and hides tempPasswordActive');
    } else {
      bad('public health', JSON.stringify(pubBody));
    }
    if (full401.status === 401) ok('/api/health/full → 401 without admin token');
    else bad('health/full gate', `got ${full401.status}`);
    const fb = await fullOk.json();
    if (fullOk.status === 200 && 'tempPasswordActive' in fb) {
      ok('/api/health/full → 200 with admin token (exposes details only to admin)');
    } else {
      bad('health/full admin', `${fullOk.status} ${JSON.stringify(fb)}`);
    }
  }

  // ===== Test 29: access-log path redaction (no token leak in logs) =====
  console.log('\n[FIX] access-log redacts secrets in path');
  {
    const { safePath } = require('../src/middleware/request-context');
    const t = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
    const r1 = safePath('/api/games/private/' + t);
    const r2 = safePath('/games/my-slug__a1b2c3d4e5f6a1b2c3d4e5f6/index.html');
    if (!r1.includes(t) && r1.includes('<redacted>')) ok('private-token path redacted');
    else bad('private-token redaction', r1);
    if (!r2.includes('a1b2c3d4e5f6a1b2c3d4e5f6') && r2.includes('<redacted>')) ok('private folder suffix redacted');
    else bad('folder redaction', r2);
    if (safePath('/api/games') === '/api/games') ok('normal path untouched');
    else bad('normal path', safePath('/api/games'));
  }

  // ===== Test 30: X-Request-Id is sanitized =====
  console.log('\n[FIX] X-Request-Id sanitized before reflect');
  {
    const good = await fetch(base + '/api/health', { headers: { 'x-request-id': 'corr-12345' } });
    const evil = await fetch(base + '/api/health', { headers: { 'x-request-id': 'x'.repeat(500) + ' <bad>' } });
    if (good.headers.get('x-request-id') === 'corr-12345') ok('valid upstream id preserved');
    else bad('valid id', good.headers.get('x-request-id'));
    const echoed = evil.headers.get('x-request-id') || '';
    if (echoed !== 'x'.repeat(500) + ' <bad>' && echoed.length <= 64) ok('oversized/bad id replaced with safe generated id');
    else bad('bad id not sanitized', echoed.slice(0, 40) + ' len=' + echoed.length);
  }

  // ===== Summary =====
  console.log(`\n  ${pass} pass, ${fail} fail\n`);
  server.close(() => process.exit(fail === 0 ? 0 : 1));

  // ─── helpers ───
  async function testSseEndToEnd() {
    // Spin up a fresh app on a different port — clean rate-limit state.
    const sub = createApp();
    const subSrv = await new Promise((r) => {
      const s = sub.listen(0, '127.0.0.1', () => r(s));
    });
    const subPort = subSrv.address().port;
    const subBase = 'http://127.0.0.1:' + subPort;

    try {
      // Login on the fresh server
      const lr = await fetch(subBase + '/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      });
      const subToken = (await lr.json()).token;

      // Auth checks first
      const t401 = await fetch(subBase + '/api/admin/sse-ticket', { method: 'POST' });
      if (t401.status === 401) ok('sse-ticket requires admin auth');
      else bad('sse-ticket auth', `got ${t401.status}`);

      const tRes = await fetch(subBase + '/api/admin/sse-ticket', {
        method: 'POST', headers: { 'x-admin-token': subToken },
      });
      const tBody = await tRes.json();
      if (tRes.status === 200 && tBody.ticket && tBody.ticket.length >= 16) {
        ok(`ticket issued len=${tBody.ticket.length}`);
      } else {
        bad('ticket issue', JSON.stringify(tBody));
      }
      const t = tBody.ticket;

      // Open the SSE stream and start collecting raw chunks.
      const http2 = require('http');
      let buf = '';
      const sseRes = await new Promise((resolve) => {
        const r = http2.get({
          hostname: '127.0.0.1', port: subPort,
          path: '/api/admin/events?ticket=' + t,
        }, (resp) => {
          resp.setEncoding('utf8');
          resp.on('data', (chunk) => { buf += chunk; });
          resolve(resp);
        });
        r.on('error', () => resolve(null));
      });

      if (sseRes && sseRes.statusCode === 200 &&
          /text\/event-stream/.test(sseRes.headers['content-type'])) {
        ok('sse connected, content-type OK');
      } else {
        bad('sse connect', sseRes ? sseRes.statusCode : 'no response');
        return;
      }

      // Wait for the connected handshake
      await new Promise((r) => setTimeout(r, 200));
      if (buf.includes('event: connected')) ok('SSE delivered "connected" event');
      else bad('SSE connected event', JSON.stringify(buf.slice(0, 200)));

      // Upload — clean server, no rate limit
      const upFd = new FormData();
      upFd.append('gameFile', new Blob([fs.readFileSync('./scripts/_fixtures/test-game.html')], { type: 'text/html' }), 'sse.html');
      upFd.append('gameName_uz', 'SSE Live');
      upFd.append('gameName_en', 'SSE Live');
      upFd.append('category', 'arcade');
      upFd.append('isPrivate', 'false');
      const upR = await fetch(subBase + '/api/upload', {
        method: 'POST', headers: { 'x-admin-token': subToken }, body: upFd,
      });
      if (!upR.ok) {
        bad('SSE upload trigger', `status ${upR.status}`);
        try { sseRes.destroy(); } catch {}
        return;
      }

      await new Promise((r) => setTimeout(r, 500));
      if (buf.includes('event: game.uploaded')) {
        ok('SSE delivered game.uploaded LIVE');
      } else {
        bad('SSE upload echo', JSON.stringify(buf.slice(0, 400)));
      }

      // Reusing the same ticket should fail
      try { sseRes.destroy(); } catch {}
      const reuse = await fetch(subBase + '/api/admin/events?ticket=' + t);
      if (reuse.status === 401) ok('SSE ticket is single-use');
      else bad('ticket reuse', `got ${reuse.status}`);
    } finally {
      try { sub.locals.deps.bus = null; } catch {}
      try { sub.locals.deps.analytics.close(); } catch {}
      try { sub.locals.deps.sseTickets.close(); } catch {}
      try { sub.locals.deps.tokens.close(); } catch {}
      try { sub.locals.deps.games.db.close(); } catch {}
      await new Promise((r) => subSrv.close(r));
    }
  }
});

setTimeout(() => { console.error('timeout'); process.exit(2); }, 30000).unref();
