/**
 * Tiny fetch wrapper with auth header, JSON parsing, and unified error.
 *
 *   GH.api.get('/api/games')
 *   GH.api.post('/api/admin/login', { username, password })
 *   GH.api.delete('/api/games/foo')
 *   GH.api.upload('/api/upload', formData, onProgress) // XHR for progress
 */
window.GH = window.GH || {};
window.GH.api = (function () {
  function authHeaders() {
    const t = window.GH.Auth && window.GH.Auth.getToken();
    return t ? { 'x-admin-token': t } : {};
  }

  async function request(method, path, body, opts = {}) {
    const headers = { ...authHeaders(), ...(opts.headers || {}) };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (err) {
      throw new Error('Tarmoq xatosi: ' + (err.message || 'noma\'lum'));
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { /* ignore */ }
    }
    if (!res.ok) {
      const msg = (data && data.error) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  /** XHR-based upload so we get progress events. */
  function upload(path, formData, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', path);
      const t = window.GH.Auth && window.GH.Auth.getToken();
      if (t) xhr.setRequestHeader('x-admin-token', t);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
          resolve(data);
        } else {
          const msg = (data && data.error) || `HTTP ${xhr.status}`;
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('Tarmoq xatosi'));
      xhr.send(formData);
    });
  }

  /** Authenticated blob fetch — returns Response for blob/buffer use. */
  async function fetchBlob(path) {
    const res = await fetch(path, { headers: authHeaders() });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch {}
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return res.blob();
  }

  return {
    get:    (p) => request('GET', p),
    post:   (p, b) => request('POST', p, b),
    patch:  (p, b) => request('PATCH', p, b),
    delete: (p, b) => request('DELETE', p, b),
    upload,
    fetchBlob,
  };
})();
