/**
 * Admin dashboard — login + games table + stats + storage manager.
 */

(function () {
  const { $, $$, escapeHTML, Auth, api, toast } = window.GH;

  const Admin = {
    state: { games: [], filter: 'all', search: '', pendingDeleteId: null },
    _storageCache: null,

    async init() {
      this.initParticles();
      // i18n init must run before showing anything
      I18N.init();
      I18N.applyTranslations();

      // Lang switcher (works on both login and dashboard screens)
      $$('.lang-btn').forEach((btn) => {
        btn.addEventListener('click', () => I18N.setLang(btn.dataset.lang));
      });
      I18N.onChange(() => {
        // Re-render dynamic content (table headers, stats labels, etc.)
        if ($('#admin-dashboard').classList.contains('visible')) {
          this.renderTable();
          this.loadStats();
          this.rerenderStorage();
        }
      });

      // If we already have a valid token, skip login
      if (await Auth.check()) {
        document.documentElement.classList.remove('gh-auth-loading');
        return this.showDashboard();
      }
      // Token absent or invalid — show login screen
      document.documentElement.classList.remove('gh-auth-loading');
      $('#login-screen').style.display = 'flex';
      $('#login-form').addEventListener('submit', (e) => this.handleLogin(e));
    },

    async handleLogin(e) {
      e.preventDefault();
      const username = $('#admin-username').value.trim();
      const password = $('#admin-password').value;
      const btn = $('#login-btn');
      const errEl = $('#login-error');

      errEl.classList.remove('visible');
      btn.disabled = true;
      $('#login-btn-text').textContent = I18N.t('admin.checking');

      try {
        const { token } = await api.post('/api/admin/login', { username, password });
        Auth.setToken(token);
        const redirect = sessionStorage.getItem('gamehost_redirect');
        if (redirect) {
          sessionStorage.removeItem('gamehost_redirect');
          window.location.href = redirect;
          return;
        }
        this.showDashboard();
      } catch (err) {
        errEl.textContent = err.status === 401 ? I18N.t('admin.wrongCredentials') : err.message;
        errEl.classList.add('visible');
      } finally {
        btn.disabled = false;
        $('#login-btn-text').textContent = I18N.t('admin.loginBtn');
      }
    },

    showDashboard() {
      $('#login-screen').style.display = 'none';
      $('#admin-dashboard').classList.add('visible');
      this.loadStats();
      this.loadGames();
      this.loadStorage();
      this.setupTableControls();
      $('#delete-all-btn').addEventListener('click', () => this.deleteAll());
      $('#logout-btn').addEventListener('click', () => this.handleLogout());
    },

    async handleLogout() {
      await Auth.logout();
      $('#admin-dashboard').classList.remove('visible');
      $('#login-screen').style.display = 'flex';
      $('#admin-username').value = '';
      $('#admin-password').value = '';
      toast(I18N.t('admin.toastLoggedOut'), 'success');
    },

    // ─── Stats ───
    async loadStats() {
      try {
        const stats = await api.get('/api/admin/stats');
        $('#stat-total').textContent = stats.total;
        $('#stat-public').textContent = stats.public;
        $('#stat-private').textContent = stats.private;
        $('#stat-plays').textContent = stats.totalPlays;

        const top = $('#top-games-list');
        const ranks = ['🥇','🥈','🥉','4','5'];
        const cls = ['gold','silver','bronze','',''];
        top.innerHTML = (stats.topGames || []).map((g, i) => {
          const name = g.name ? (g.name.uz || g.name.en || g.id) : g.id;
          return `<div class="top-item">
            <div class="top-rank ${cls[i]}">${ranks[i]}</div>
            <div class="top-name">${escapeHTML(name)}</div>
            <div class="top-plays">▶ ${g.playCount || 0}</div>
          </div>`;
        }).join('') || `<div style="color:var(--text-muted);font-size:var(--font-sm);padding:8px 0;">${escapeHTML(I18N.t('admin.noData'))}</div>`;

        const qs = $('#quick-stats');
        const avg = stats.total > 0 ? (stats.totalPlays / stats.total).toFixed(1) : 0;
        const pubPct = stats.total > 0 ? Math.round(stats.public / stats.total * 100) : 0;
        const prvPct = stats.total > 0 ? Math.round(stats.private / stats.total * 100) : 0;
        qs.innerHTML = `
          <div class="top-item"><div class="top-name" style="color:var(--text-secondary);">${escapeHTML(I18N.t('admin.avgPlays'))}</div><div class="top-plays">${avg}</div></div>
          <div class="top-item"><div class="top-name" style="color:var(--text-secondary);">${escapeHTML(I18N.t('admin.publicShare'))}</div><div class="top-plays">${pubPct}%</div></div>
          <div class="top-item"><div class="top-name" style="color:var(--text-secondary);">${escapeHTML(I18N.t('admin.privateShare'))}</div><div class="top-plays">${prvPct}%</div></div>`;
        $('#top-section').style.display = 'grid';
      } catch (err) {
        console.error('Stats xatolik:', err.message);
      }
    },

    // ─── Games table ───
    async loadGames() {
      $('#table-body').innerHTML = `
        <div class="table-loading">
          <div class="loading-spinner"></div>
          <div>${escapeHTML(I18N.t('admin.loading'))}</div>
        </div>`;
      try {
        this.state.games = await api.get('/api/admin/games');
        this.renderTable();
      } catch (err) {
        $('#table-body').innerHTML = `<div class="table-empty">${escapeHTML(I18N.t('admin.errorPrefix'))}: ${escapeHTML(err.message)}</div>`;
      }
    },

    renderTable() {
      let games = this.state.games;
      if (this.state.filter === 'public')  games = games.filter((g) => !g.isPrivate);
      if (this.state.filter === 'private') games = games.filter((g) => g.isPrivate);
      if (this.state.search) {
        const q = this.state.search;
        games = games.filter((g) => {
          const name = g.name ? (g.name.uz || g.name.en || g.id) : g.id;
          return name.toLowerCase().includes(q)
            || g.id.toLowerCase().includes(q)
            || (g.category || '').includes(q);
        });
      }

      const tbody = $('#table-body');
      if (games.length === 0) {
        tbody.innerHTML = `<div class="table-empty">${escapeHTML(I18N.t('admin.gameNotFound'))}</div>`;
        return;
      }

      tbody.innerHTML = `
        <div class="games-table-row header-row">
          <div></div>
          <div>${escapeHTML(I18N.t('admin.tableName'))}</div>
          <div>${escapeHTML(I18N.t('admin.tableStatus'))}</div>
          <div class="col-plays">${escapeHTML(I18N.t('admin.tablePlays'))}</div>
          <div class="col-date">${escapeHTML(I18N.t('admin.tableDate'))}</div>
          <div></div>
          <div style="text-align:right;">${escapeHTML(I18N.t('admin.tableActions'))}</div>
        </div>
        ${games.map((g) => this.rowHtml(g)).join('')}`;
    },

    rowHtml(g) {
      const name = I18N.localize(g.name) || g.id;
      const date = g.createdAt ? new Date(g.createdAt).toLocaleDateString(I18N.getLang() === 'uz' ? 'uz-UZ' : I18N.getLang()) : '—';
      const thumb = g.thumbnail ? `<img src="games/${escapeHTML(g.folder)}/${escapeHTML(g.thumbnail)}" alt="">` : '🎮';
      const playLink = g.isPrivate && g.privateToken
        ? `play.html?token=${escapeHTML(g.privateToken)}`
        : `play.html?game=${escapeHTML(g.id)}`;
      const statusLabel = g.isPrivate ? I18N.t('admin.privateLabel') : I18N.t('admin.publicLabel');
      const toggleLabel = g.isPrivate ? I18N.t('admin.makePublic') : I18N.t('admin.makePrivate');
      return `
        <div class="games-table-row" data-id="${escapeHTML(g.id)}">
          <div class="row-thumb">${thumb}</div>
          <div class="row-name">
            <div class="row-name-text">${escapeHTML(name)}</div>
            <div class="row-name-sub">${escapeHTML(g.folder)} · ${escapeHTML(g.category || '')}</div>
          </div>
          <div>
            <span class="row-badge ${g.isPrivate ? 'private' : 'public'}">
              ${escapeHTML(statusLabel)}
            </span>
          </div>
          <div class="row-plays">▶ ${g.playCount || 0}</div>
          <div class="row-date">${escapeHTML(date)}</div>
          <div></div>
          <div class="row-actions">
            <a href="${playLink}" target="_blank" class="row-action-btn play">${escapeHTML(I18N.t('admin.tablePlay'))}</a>
            <button class="row-action-btn toggle" data-action="toggle" data-id="${escapeHTML(g.id)}" data-private="${g.isPrivate}">
              ${escapeHTML(toggleLabel)}
            </button>
            <button class="row-action-btn del" data-action="delete" data-id="${escapeHTML(g.id)}" data-name="${escapeHTML(name)}">🗑️</button>
          </div>
        </div>`;
    },

    setupTableControls() {
      $('#table-body').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id, name, private: isPrivate } = btn.dataset;
        if (action === 'delete') {
          this.state.pendingDeleteId = id;
          $('#confirm-text').textContent = I18N.t('admin.deleteSpecConfirm', { name });
          $('#confirm-overlay').classList.add('visible');
        } else if (action === 'toggle') {
          this.togglePrivacy(id, isPrivate === 'true');
        }
      });

      let timer;
      $('#table-search').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.state.search = e.target.value.toLowerCase().trim();
          this.renderTable();
        }, 200);
      });

      $$('.table-filter-btn').forEach((b) => {
        b.addEventListener('click', () => {
          this.state.filter = b.dataset.filter;
          $$('.table-filter-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          this.renderTable();
        });
      });

      $('#confirm-cancel').addEventListener('click', () => {
        $('#confirm-overlay').classList.remove('visible');
        this.state.pendingDeleteId = null;
      });
      $('#confirm-ok').addEventListener('click', async () => {
        if (!this.state.pendingDeleteId) return;
        const id = this.state.pendingDeleteId;
        this.state.pendingDeleteId = null;
        $('#confirm-overlay').classList.remove('visible');
        try {
          await api.delete('/api/admin/games/' + id);
          toast(I18N.t('admin.toastDeleted'), 'success');
          await this.loadGames();
          await this.loadStats();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },

    async togglePrivacy(id, currentlyPrivate) {
      try {
        await api.patch('/api/admin/games/' + id, { isPrivate: !currentlyPrivate });
        toast(currentlyPrivate ? I18N.t('admin.toastMadePublic') : I18N.t('admin.toastMadePrivate'));
        await this.loadGames();
        await this.loadStats();
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    async deleteAll() {
      const count = this.state.games.length;
      if (count === 0) return toast(I18N.t('admin.deleteAllNoGames'), 'error');
      if (!confirm(I18N.t('admin.deleteAllConfirm1', { n: count }))) return;
      if (!confirm(I18N.t('admin.deleteAllConfirm2', { n: count }))) return;
      try {
        const data = await api.delete('/api/admin/games');
        toast(I18N.t('admin.deleteAllSuccess', { n: data.deleted }), 'success');
        this.loadStats();
        this.loadGames();
        this.loadStorage();
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    // ─── Storage ───
    async loadStorage() {
      const el = $('#storage-body');
      el.innerHTML = `<div class="table-loading"><div class="loading-spinner"></div><div>${escapeHTML(I18N.t('admin.loading'))}</div></div>`;
      try {
        const data = await api.get('/api/admin/storage');
        this._storageCache = data;
        el.innerHTML = `
          <div class="storage-info">
            <span class="storage-total">💾 ${escapeHTML(data.totalSizeHuman)}</span>
            <span class="storage-path">${escapeHTML(data.dataDir)}</span>
          </div>
          <div class="storage-tree">${this.renderTree(data.tree, data.dataDir)}</div>`;
      } catch (err) {
        el.innerHTML = `<div style="color:#ef4444;padding:8px;">${escapeHTML(I18N.t('admin.errorPrefix'))}: ${escapeHTML(err.message)}</div>`;
      }
    },

    rerenderStorage() {
      if (!this._storageCache) return;
      const el = $('#storage-body');
      const data = this._storageCache;
      el.innerHTML = `
        <div class="storage-info">
          <span class="storage-total">💾 ${escapeHTML(data.totalSizeHuman)}</span>
          <span class="storage-path">${escapeHTML(data.dataDir)}</span>
        </div>
        <div class="storage-tree">${this.renderTree(data.tree, data.dataDir)}</div>`;
    },

    renderTree(nodes, base) {
      if (!nodes || nodes.length === 0) {
        return `<div style="color:var(--text-muted);font-size:var(--font-xs);">${escapeHTML(I18N.t('admin.empty'))}</div>`;
      }
      return nodes.map((node) => {
        const fullPath = base + '/' + node.name;
        const isDir = node.type === 'dir';
        return `
          <div class="storage-row">
            <span class="storage-icon">${isDir ? '📁' : '📄'}</span>
            <span class="storage-name ${isDir ? 'dir' : ''}">${escapeHTML(node.name)}</span>
            <span class="storage-size">${escapeHTML(node.sizeHuman)}</span>
            <button class="storage-del" data-storage-target="${escapeHTML(fullPath)}" data-storage-name="${escapeHTML(node.name)}">${escapeHTML(I18N.t('admin.deleteFile'))}</button>
          </div>
          ${isDir && node.children && node.children.length
            ? `<div class="storage-children">${this.renderTree(node.children, fullPath)}</div>`
            : ''}`;
      }).join('');
    },

    // Particles canvas (admin background)
    initParticles() {
      const canvas = $('#admin-particles');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let W = canvas.width = window.innerWidth;
      let H = canvas.height = window.innerHeight;
      const ps = Array.from({ length: 60 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5, a: Math.random(),
      }));
      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        ps.forEach((p) => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(124,58,237,${p.a * 0.6})`;
          ctx.fill();
        });
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const dx = ps[i].x - ps[j].x;
            const dy = ps[i].y - ps[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 120) {
              ctx.beginPath();
              ctx.moveTo(ps[i].x, ps[i].y);
              ctx.lineTo(ps[j].x, ps[j].y);
              ctx.strokeStyle = `rgba(124,58,237,${(1 - d / 120) * 0.15})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(draw);
      };
      draw();
      window.addEventListener('resize', () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
      });
    },
  };

  // Storage delete delegation
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.storage-del');
    if (!btn) return;
    const target = btn.dataset.storageTarget;
    const name = btn.dataset.storageName;
    if (!confirm(I18N.t('admin.confirmDeleteFile', { name }))) return;
    try {
      await api.delete('/api/admin/storage', { target });
      toast(I18N.t('admin.toastDeletedFile', { name }), 'success');
      Admin.loadStorage();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Refresh button
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'storage-refresh-btn') {
      Admin.loadStorage();
    }
  });

  window.Admin = Admin;
  document.addEventListener('DOMContentLoaded', () => Admin.init());
})();
