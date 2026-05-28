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

  function getToken() {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  }
  function setToken(t) {
    try { sessionStorage.setItem(KEY, t); } catch {}
  }
  function clearToken() {
    try { sessionStorage.removeItem(KEY); } catch {}
  }

  async function check() {
    const t = getToken();
    if (!t) return false;
    try {
      const r = await fetch('/api/admin/stats', {
        headers: { 'x-admin-token': t },
      });
      if (!r.ok) clearToken();
      return r.ok;
    } catch {
      return false;
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
