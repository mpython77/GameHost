/**
 * Targeted regression tests for the 8 bugs fixed in this PR.
 * Run after a fresh DB:  rm -rf data && node scripts/bug-tests.js
 */

'use strict';

process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.LOG_LEVEL = 'error';

const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');

const app = createApp();
const server = app.listen(0, '127.0.0.1', async () => {
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

  // ===== Summary =====
  console.log(`\n  ${pass} pass, ${fail} fail\n`);
  server.close(() => process.exit(fail === 0 ? 0 : 1));
});

setTimeout(() => { console.error('timeout'); process.exit(2); }, 30000).unref();
