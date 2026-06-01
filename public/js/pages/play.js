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
      const base = (window.GH_RUNTIME && window.GH_RUNTIME.gamesBaseUrl) || '';
      const src = `${base}/games/${this.current.folder}/index.html?v=${v}`;
      let tracked = false;

      iframe.src = src;
      iframe.addEventListener('load', () => {
        setTimeout(() => loading.classList.add('hidden'), 500);
        if (!tracked && this.current.id) {
          tracked = true;
          fetch('/api/games/' + this.current.id + '/play', { method: 'POST' }).catch(() => {});
        }
        // Let the game settle, then tell it the viewport size.
        this.notifyGameResize();
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

    /* ──────────────────────────────────────────────────────────────────
     *  Resolution selector — complete rewrite
     * ────────────────────────────────────────────────────────────────── */
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

      // Track what's selected (null = auto).
      this._activeRatioName = 'auto';
      this._activeRatioValue = null;

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = btn.dataset.ratio;
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this._activeRatioName = r;
          this._activeRatioValue = ratios[r] || null;
          this.applyResolution();

          const info = $('#resolution-info');
          info.textContent = labels[r] || r;
          info.classList.add('visible');
          clearTimeout(info._t);
          info._t = setTimeout(() => info.classList.remove('visible'), 2000);
        });
      });

      // Re-apply on window resize (e.g. browser window resized, orientation change).
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this.applyResolution(), 80);
      });

      // Re-apply when entering/leaving fullscreen.
      ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
        document.addEventListener(ev, () => {
          setTimeout(() => this.applyResolution(), 100);
        });
      });
    },

    /* ──────────────────────────────────────────────────────────────────
     *  applyResolution — complete rewrite
     *
     *  How it works:
     *    Auto mode:
     *      - Container has CSS `inset: 0` → fills the wrapper 100%.
     *      - Remove inline styles + resolution-active class.
     *
     *    Ratio mode:
     *      - Calculate the largest box at the requested aspect ratio
     *        that fits within the wrapper (letterbox, never crop).
     *      - Set explicit px width/height on the container.
     *      - Add .resolution-active class → CSS centers it via
     *        absolute + translate(-50%, -50%).
     *      - Iframe fills the container 100% (CSS rule).
     *
     *    After any mode change, fire resize into the iframe so the game
     *    engine (Cocos, etc.) knows its viewport changed.
     * ────────────────────────────────────────────────────────────────── */
    applyResolution() {
      const container = $('#iframe-container');
      const wrapper = $('#player-frame-wrapper');
      const ratio = this._activeRatioValue;

      // ── Reset all inline styles first ──
      container.style.cssText = '';
      container.classList.remove('resolution-active');

      if (!ratio) {
        // Auto mode — CSS `inset: 0` makes the container fill the wrapper.
        this.notifyGameResize();
        return;
      }

      // ── Ratio mode ──
      // Measure available space (the wrapper's actual rendered size).
      const rect = wrapper.getBoundingClientRect();
      const availW = rect.width;
      const availH = rect.height;
      if (availW < 1 || availH < 1) return;

      // Calculate largest box at the requested ratio (letterbox fit).
      let boxW, boxH;
      if (availW / availH > ratio) {
        // Wrapper is wider than requested ratio → height-constrained.
        boxH = availH;
        boxW = boxH * ratio;
      } else {
        // Wrapper is taller → width-constrained.
        boxW = availW;
        boxH = boxW / ratio;
      }
      boxW = Math.round(boxW);
      boxH = Math.round(boxH);

      // Apply explicit size on the container. CSS .resolution-active
      // positions it centered via absolute + translate.
      container.classList.add('resolution-active');
      container.style.width  = boxW + 'px';
      container.style.height = boxH + 'px';

      this.notifyGameResize();
    },

    /* ──────────────────────────────────────────────────────────────────
     *  notifyGameResize — complete rewrite
     *
     *  Fires `resize` event into the iframe's window so canvas-based
     *  games (Cocos Creator, Phaser, etc.) re-measure their viewport.
     *  We fire multiple times at staggered intervals because some game
     *  engines initialize late.
     * ────────────────────────────────────────────────────────────────── */
    notifyGameResize() {
      const iframe = $('#game-iframe');
      if (!iframe) return;

      const fire = () => {
        try {
          const win = iframe.contentWindow;
          if (win) win.dispatchEvent(new Event('resize'));
        } catch { /* cross-origin — nothing we can do */ }
      };

      // Immediate + staggered fires to catch late-initializing engines.
      fire();
      setTimeout(fire, 50);
      setTimeout(fire, 200);
      setTimeout(fire, 600);
      setTimeout(fire, 1200);
    },

    /** Current fullscreen element across vendor prefixes (null if not fullscreen). */
    fullscreenElement() {
      return document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement ||
        null;
    },

    toggleFullscreen() {
      const w = $('#player-frame-wrapper');
      if (!this.fullscreenElement()) {
        // Some browsers (notably iOS Safari) don't implement the Fullscreen
        // API on arbitrary elements — the request fn is simply absent. Guard
        // against calling `undefined` (which threw an uncaught TypeError and
        // left the button dead). Fall back to fullscreen on the <iframe> if
        // the wrapper can't go fullscreen.
        const req = w.requestFullscreen || w.webkitRequestFullscreen || w.msRequestFullscreen;
        if (req) {
          try { Promise.resolve(req.call(w)).catch(() => {}); } catch { /* unsupported */ }
        } else {
          const iframe = $('#game-iframe');
          const ireq = iframe && (iframe.requestFullscreen || iframe.webkitRequestFullscreen ||
            iframe.webkitEnterFullscreen);
          if (ireq) { try { ireq.call(iframe); } catch { /* unsupported */ } }
        }
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (exit) {
          try { Promise.resolve(exit.call(document)).catch(() => {}); } catch { /* unsupported */ }
        }
      }
    },

    setupKeyboard() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          // If the browser is in fullscreen, let it exit (the browser also
          // handles Escape natively, but being explicit avoids navigating
          // away mid-exit). Otherwise go back to the catalog.
          if (this.fullscreenElement()) this.toggleFullscreen();
          else window.location.href = 'index.html';
        } else if (e.key === 'f' || e.key === 'F') {
          this.toggleFullscreen();
        }
      });
    },
  };

  document.addEventListener('DOMContentLoaded', () => Player.init());
})();
