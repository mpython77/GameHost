/**
 * Admin dashboard — login + games table + stats + storage manager.
 */

(function () {
  const { $, $$, escapeHTML, Auth, api, toast } = window.GH;

  const Admin = {
    state: { games: [], filter: 'all', search: '', pendingDeleteId: null },

    async init() {
      this.initParticles();

      // If we already have a valid token, skip login
      if (await Auth.check()) {
        return this.showDashboard();
      }
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
      $('#login-btn-text').textContent = 'Tekshirilmoqda...';

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
        errEl.textContent = err.message;
        errEl.classList.add('visible');
      } finally {
        btn.disabled = false;
        $('#login-btn-text').textContent = 'Kirish';
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
      toast('Chiqildi', 'success');
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
        }).join('') || '<div style="color:var(--text-muted);font-size:var(--font-sm);padding:8px 0;">Ma\'lumot yo\'q</div>';

        const qs = $('#quick-stats');
        const avg = stats.total > 0 ? (stats.totalPlays / stats.total).toFixed(1) : 0;
        const pubPct = stats.total > 0 ? Math.round(stats.public / stats.total * 100) : 0;
        const prvPct = stats.total > 0 ? Math.round(stats.private / stats.total * 100) : 0;
        qs.innerHTML = `
          <div class="top-item"><div class="top-name" style="color:var(--text-secondary);">O'rtacha o'ynash</div><div class="top-plays">${avg}</div></div>
          <div class="top-item"><div class="top-name" style="color:var(--text-secondary);">Public ulushi</div><div class="top-plays">${pubPct}%</div></div>
          <div class="top-item"><div class="top-name" style="color:var(--text-secondary);">Private ulushi</div><div class="top-plays">${prvPct}%</div></div>`;
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
          <div>Yuklanmoqda...</div>
        </div>`;
      try {
        this.state.games = await api.get('/api/admin/games');
        this.renderTable();
      } catch (err) {
        $('#table-body').innerHTML = `<div class="table-empty">Xatolik: ${escapeHTML(err.message)}</div>`;
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
        tbody.innerHTML = `<div class="table-empty">O'yin topilmadi</div>`;
        return;
      }

      tbody.innerHTML = `
        <div class="games-table-row header-row">
          <div></div>
          <div>Nomi</div>
          <div>Status</div>
          <div class="col-plays">O'ynash</div>
          <div class="col-date">Sana</div>
          <div></div>
          <div style="text-align:right;">Amallar</div>
        </div>
        ${games.map((g) => this.rowHtml(g)).join('')}`;
    },

    rowHtml(g) {
      const name = g.name ? (g.name.uz || g.name.en || g.id) : g.id;
      const date = g.createdAt ? new Date(g.createdAt).toLocaleDateString('uz-UZ') : '—';
      const thumb = g.thumbnail ? `<img src="games/${escapeHTML(g.folder)}/${escapeHTML(g.thumbnail)}" alt="">` : '🎮';
      const playLink = g.isPrivate && g.privateToken
        ? `play.html?token=${escapeHTML(g.privateToken)}`
        : `play.html?game=${escapeHTML(g.id)}`;
      return `
        <div class="games-table-row" data-id="${escapeHTML(g.id)}">
          <div class="row-thumb">${thumb}</div>
          <div class="row-name">
            <div class="row-name-text">${escapeHTML(name)}</div>
            <div class="row-name-sub">${escapeHTML(g.folder)} · ${escapeHTML(g.category || '')}</div>
          </div>
          <div>
            <span class="row-badge ${g.isPrivate ? 'private' : 'public'}">
              ${g.isPrivate ? '🔒 Private' : '🌐 Public'}
            </span>
          </div>
          <div class="row-plays">▶ ${g.playCount || 0}</div>
          <div class="row-date">${date}</div>
          <div></div>
          <div class="row-actions">
            <a href="${playLink}" target="_blank" class="row-action-btn play">▶ O'ynash</a>
            <button class="row-action-btn toggle" data-action="toggle" data-id="${escapeHTML(g.id)}" data-private="${g.isPrivate}">
              ${g.isPrivate ? '🌐 Public' : '🔒 Private'}
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
          $('#confirm-text').textContent = `"${name}" o'yinini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.`;
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
          toast("O'yin o'chirildi", 'success');
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
        toast(currentlyPrivate ? 'Public qilindi' : 'Private qilindi');
        await this.loadGames();
        await this.loadStats();
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    async deleteAll() {
      const count = this.state.games.length;
      if (count === 0) return toast("O'yinlar yo'q", 'error');
      if (!confirm(`⚠️ BARCHA ${count} ta o'yinni o'chirasizmi? Bu amalni qaytarib bo'lmaydi!`)) return;
      if (!confirm(`🔴 Tasdiqlang: ${count} ta o'yin va barcha fayllar O'CHIRILADI!`)) return;
      try {
        const data = await api.delete('/api/admin/games');
        toast(`✅ ${data.deleted} ta o'yin o'chirildi`, 'success');
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
      el.innerHTML = '<div class="table-loading"><div class="loading-spinner"></div><div>Yuklanmoqda...</div></div>';
      try {
        const data = await api.get('/api/admin/storage');
        el.innerHTML = `
          <div class="storage-info">
            <span class="storage-total">💾 ${escapeHTML(data.totalSizeHuman)}</span>
            <span class="storage-path">${escapeHTML(data.dataDir)}</span>
          </div>
          <div class="storage-tree">${this.renderTree(data.tree, data.dataDir)}</div>`;
      } catch (err) {
        el.innerHTML = `<div style="color:#ef4444;padding:8px;">Xatolik: ${escapeHTML(err.message)}</div>`;
      }
    },

    renderTree(nodes, base) {
      if (!nodes || nodes.length === 0) {
        return '<div style="color:var(--text-muted);font-size:var(--font-xs);">Bo\'sh</div>';
      }
      return nodes.map((node) => {
        const fullPath = base + '/' + node.name;
        const isDir = node.type === 'dir';
        return `
          <div class="storage-row">
            <span class="storage-icon">${isDir ? '📁' : '📄'}</span>
            <span class="storage-name ${isDir ? 'dir' : ''}">${escapeHTML(node.name)}</span>
            <span class="storage-size">${escapeHTML(node.sizeHuman)}</span>
            <button class="storage-del" data-storage-target="${escapeHTML(fullPath)}" data-storage-name="${escapeHTML(node.name)}">🗑️ O'chir</button>
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
    if (!confirm(`"${name}" ni o'chirishni xohlaysizmi?`)) return;
    try {
      await api.delete('/api/admin/storage', { target });
      toast(`"${name}" o'chirildi`, 'success');
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
