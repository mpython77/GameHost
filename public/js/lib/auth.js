/**
 * Frontend admin-token storage and helpers.
 *
 * - Token kept in sessionStorage (cleared on tab close).
 * - getToken / setToken / clearToken
 * - logout(): calls server /api/admin/logout to invalidate (denylist),
 *   then clears local storage.
 * - check(): asks server if current token is still valid.
 */
window.GH = window.GH || {};
window.GH.Auth = (function () {
  const KEY = 'gamehost_admin_token';
  // Cache the result of /api/admin/stats for a short window so multiple
  // page-init callers don't each pay a network round-trip.
  const CHECK_TTL_MS = 30 * 1000;
  let _lastCheck = { ts: 0, ok: false };

  function getToken() {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  }
  function setToken(t) {
    try { sessionStorage.setItem(KEY, t); } catch {}
    _lastCheck = { ts: Date.now(), ok: true };
  }
  function clearToken() {
    try { sessionStorage.removeItem(KEY); } catch {}
    _lastCheck = { ts: Date.now(), ok: false };
  }

  async function check(opts = {}) {
    const t = getToken();
    if (!t) return false;
    const now = Date.now();
    if (!opts.force && (now - _lastCheck.ts) < CHECK_TTL_MS) {
      return _lastCheck.ok;
    }
    try {
      const r = await fetch('/api/admin/stats', {
        headers: { 'x-admin-token': t },
      });
      _lastCheck = { ts: now, ok: r.ok };
      if (!r.ok) {
        try { sessionStorage.removeItem(KEY); } catch {}
      }
      return r.ok;
    } catch {
      // Network error — don't invalidate cached state.
      return _lastCheck.ok;
    }
  }

  async function logout() {
    const t = getToken();
    if (t) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'x-admin-token': t },
        });
      } catch { /* server might be down — still clear locally */ }
    }
    clearToken();
  }

  return { getToken, setToken, clearToken, check, logout };
})();
