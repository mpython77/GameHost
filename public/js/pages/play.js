/**
 * Player page (play.html) — iframe + aspect ratio tester + reload + fullscreen.
 *
 * Loads game by ?game=<id> or ?token=<privateToken>.
 */

(function () {
  const { $, $$ } = window.GH;
  const { api } = window.GH;

  const Player = {
    current: null,

    async init() {
      I18N.init();
      I18N.applyTranslations();

      $$('.lang-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          I18N.setLang(btn.dataset.lang);
          if (this.current) this.updateTitle();
        });
      });

      const params = new URLSearchParams(window.location.search);
      const gameId = params.get('game');
      const privateToken = params.get('token');

      if (privateToken) {
        await this.loadPrivate(privateToken);
        return;
      }
      if (!gameId) {
        window.location.href = 'index.html';
        return;
      }
      await this.loadPublic(gameId);
    },

    async loadPublic(gameId) {
      try {
        const list = await api.get('/api/games?_t=' + Date.now());
        if (Array.isArray(list)) this.current = list.find((g) => g.id === gameId);
      } catch { /* fall through */ }

      if (!this.current && Array.isArray(window.GAMES_CONFIG)) {
        this.current = window.GAMES_CONFIG.find((g) => g.id === gameId);
      }

      if (!this.current) {
        // No fallback to "folder == id". Doing that exposed any private game
        // whose slug an attacker could guess. Show a clean error instead.
        return this.showLoadError('notFound');
      }
      this.start();
    },

    async loadPrivate(token) {
      try {
        this.current = await api.get('/api/games/private/' + token + '?_t=' + Date.now());
      } catch (err) {
        return this.showLoadError(err.status === 404 ? 'notFound' : 'networkError');
      }
      this.start();
    },

    /**
     * Render an error in place of the loading spinner with a "back" link
     * so the user is never stuck on a dead page.
     */
    showLoadError(kind) {
      const loading = $('#player-loading');
      if (!loading) return;
      const msg = kind === 'notFound'
        ? I18N.t('player.notFound')
        : I18N.t('player.networkError');
      loading.classList.remove('hidden');
      loading.innerHTML = `
        <div style="text-align:center;max-width:320px;">
          <div style="font-size:48px;margin-bottom:1rem;">😕</div>
          <div class="loading-text" style="color:#ef4444;margin-bottom:1.25rem;">${msg}</div>
          <a href="index.html" style="
            display:inline-block;padding:8px 22px;border-radius:999px;
            background:rgba(124,58,237,0.15);color:#a78bfa;
            text-decoration:none;font-weight:600;">
            ← ${I18N.t('player.back') || 'Orqaga'}
          </a>
        </div>`;
    },

    start() {
      this.updateTitle();
      this.loadIframe();
      this.setupControls();
      this.setupKeyboard();
    },

    updateTitle() {
      const t = I18N.localize(this.current.name);
      $('#player-game-title').textContent = t;
      document.title = `🎮 ${t} — Game Host`;
    },

    loadIframe() {
      const iframe = $('#game-iframe');
      const loading = $('#player-loading');
      const v = this.current.uploadedAt || this.current.createdAt || Date.now();
      const src = `games/${this.current.folder}/index.html?v=${v}`;
      let tracked = false;

      iframe.src = src;
      iframe.addEventListener('load', () => {
        setTimeout(() => loading.classList.add('hidden'), 500);
        if (!tracked && this.current.id) {
          tracked = true;
          fetch('/api/games/' + this.current.id + '/play', { method: 'POST' }).catch(() => {});
        }
      });
      iframe.addEventListener('error', () => {
        loading.innerHTML = `<div class="loading-text" style="color:#ef4444;">${I18N.t('player.gameError')}</div>`;
      });
      setTimeout(() => {
        if (!loading.classList.contains('hidden')) {
          loading.innerHTML = `<div class="loading-text" style="color:#fbbf24;">${I18N.t('player.loadSlow')}</div>`;
          setTimeout(() => loading.classList.add('hidden'), 5000);
        }
      }, 15000);
    },

    setupControls() {
      $('#btn-reload').addEventListener('click', () => {
        const iframe = $('#game-iframe');
        const loading = $('#player-loading');
        loading.classList.remove('hidden');
        loading.innerHTML = `
          <div class="loading-spinner"></div>
          <div class="loading-text">${I18N.t('player.loading')}</div>`;
        const src = iframe.src;
        iframe.src = 'about:blank';
        setTimeout(() => { iframe.src = src; }, 50);
      });
      $('#btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
      this.setupResolutionSelector();
    },

    setupResolutionSelector() {
      const ratios = {
        'auto': null, '16:9': 16 / 9, '9:16': 9 / 16,
        '4:3': 4 / 3, '3:4': 3 / 4, '1:1': 1, '21:9': 21 / 9,
      };
      const labels = {
        'auto': 'Auto', '16:9': '16:9 Landscape', '9:16': '9:16 Portrait',
        '4:3': '4:3 Tablet', '3:4': '3:4 Portrait', '1:1': '1:1 Square', '21:9': '21:9 Ultrawide',
      };
      const buttons = $$('.res-btn');

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = btn.dataset.ratio;
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.applyResolution(r, ratios[r]);
          const info = $('#resolution-info');
          info.textContent = labels[r] || r;
          info.classList.add('visible');
          clearTimeout(info._t);
          info._t = setTimeout(() => info.classList.remove('visible'), 2000);
        });
      });

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const active = $('.res-btn.active');
          if (active && active.dataset.ratio !== 'auto') {
            this.applyResolution(active.dataset.ratio, ratios[active.dataset.ratio]);
          }
        }, 100);
      });
    },

    applyResolution(name, ratio) {
      const c = $('#iframe-container');
      const w = $('#player-frame-wrapper');
      c.style.width = c.style.height = c.style.maxWidth = c.style.maxHeight = c.style.aspectRatio = '';
      c.classList.remove('resolution-active');
      if (name === 'auto' || !ratio) return;

      c.classList.add('resolution-active');
      const r = w.getBoundingClientRect();
      let width, height;
      height = r.height * 0.95;
      width = height * ratio;
      if (width > r.width * 0.95) {
        width = r.width * 0.95;
        height = width / ratio;
      }
      c.style.width = Math.round(width) + 'px';
      c.style.height = Math.round(height) + 'px';
    },

    toggleFullscreen() {
      const w = $('#player-frame-wrapper');
      if (!document.fullscreenElement) {
        (w.requestFullscreen || w.webkitRequestFullscreen || w.msRequestFullscreen).call(w);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
      }
    },

    setupKeyboard() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const page = $('#player-page');
          if (page && page.classList.contains('fullscreen')) this.toggleFullscreen();
          else window.location.href = 'index.html';
        } else if (e.key === 'f' || e.key === 'F') {
          this.toggleFullscreen();
        }
      });
    },
  };

  document.addEventListener('DOMContentLoaded', () => Player.init());
})();
