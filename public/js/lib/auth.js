/**
 * Frontend admin-token storage and helpers.
 *
 * Storage strategy (persistent — survives tab close & browser restart):
 *   - Primary store: localStorage   (writes go here)
 *   - Backward-compat read: localStorage first, then sessionStorage
 *     (so older tabs still logged in via sessionStorage keep working
 *     until they re-login, at which point they upgrade to localStorage)
 *   - clearToken() / logout() wipe BOTH storages.
 *
 * check() failure-handling:
 *   - HTTP 401  → token is genuinely invalid → clear it.
 *   - HTTP 5xx, other 4xx, network errors → server is unreachable
 *     or misbehaving, but the token may still be valid. Keep it.
 *     Return cached _lastCheck.ok if any, else optimistic `true`.
 *     This prevents false logouts on transient blips.
 */
window.GH = window.GH || {};
window.GH.Auth = (function () {
  const KEY = 'gamehost_admin_token';
  // Cache the result of /api/admin/stats for a short window so multiple
  // page-init callers don't each pay a network round-trip.
  const CHECK_TTL_MS = 30 * 1000;
  let _lastCheck = { ts: 0, ok: false };

  function getToken() {
    // Read from localStorage first (new persistent location), fall back
    // to sessionStorage for backward-compat with already-logged-in tabs.
    try {
      const v = localStorage.getItem(KEY);
      if (v) return v;
    } catch {}
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  }

  function setToken(t) {
    // Write only to localStorage so login persists across tab/browser close.
    try { localStorage.setItem(KEY, t); } catch {}
    // Best-effort: also clean any old sessionStorage copy so we have a
    // single source of truth going forward.
    try { sessionStorage.removeItem(KEY); } catch {}
    _lastCheck = { ts: Date.now(), ok: true };
  }

  function clearToken() {
    // Clear from BOTH storages so logout is complete regardless of where
    // the token originally landed.
    try { localStorage.removeItem(KEY); } catch {}
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
      if (r.ok) {
        _lastCheck = { ts: now, ok: true };
        return true;
      }
      if (r.status === 401) {
        // Token is genuinely invalid — wipe it.
        clearToken();
        return false;
      }
      // 5xx, 403, 404, etc. — server is up but weird. Don't punish the
      // user with a logout for a transient backend issue. Keep the
      // token; report the last known good state if we have one,
      // otherwise be optimistic (we still have a token).
      return _lastCheck.ts > 0 ? _lastCheck.ok : true;
    } catch {
      // Network error — server unreachable. Keep token; stay optimistic
      // if no cached state.
      return _lastCheck.ts > 0 ? _lastCheck.ok : true;
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
