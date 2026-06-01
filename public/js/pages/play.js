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
      // Build the game URL. When GH_RUNTIME.gamesBaseUrl is set (a separate
      // origin), the iframe loads cross-origin and is fully isolated from
      // this page. When empty, games are served from this same origin.
      // gamesBaseUrl has no trailing slash (server strips it).
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
        // Fire resize after load so the game fills the iframe from the start.
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
          } else {
            // Auto mode: the wrapper changed size (e.g. rotation / fullscreen),
            // so make the game refit to the full area too.
            this.notifyGameResize();
          }
        }, 100);
      });

      // Entering/leaving fullscreen changes the available area; refit the game
      // (and re-apply any active aspect-ratio box) once the layout settles.
      ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
        document.addEventListener(ev, () => {
          setTimeout(() => {
            const active = $('.res-btn.active');
            if (active && active.dataset.ratio !== 'auto') {
              this.applyResolution(active.dataset.ratio, ratios[active.dataset.ratio]);
            } else {
              this.notifyGameResize();
            }
          }, 120);
        });
      });
    },

    applyResolution(name, ratio) {
      const c = $('#iframe-container');
      const w = $('#player-frame-wrapper');
      const iframe = $('#game-iframe');

      // Clear all inline overrides from any previous selection.
      c.style.width = '';
      c.style.height = '';
      iframe.style.width = '';
      iframe.style.height = '';
      iframe.style.transform = '';
      iframe.style.transformOrigin = '';
      c.classList.remove('resolution-active');
      this._activeRatio = (name === 'auto' || !ratio) ? null : ratio;

      if (!this._activeRatio) {
        // Auto — iframe fills the whole wrapper via CSS (width/height 100%).
        // Fire resize so Cocos/canvas games re-fit to the full area.
        this.notifyGameResize();
        return;
      }

      // ── Fixed aspect-ratio mode ──────────────────────────────────────────
      // 1. Calculate the largest box that fits the available area at the
      //    requested ratio (letterboxed, never cropped, 8px gutter).
      const r = w.getBoundingClientRect();
      const availW = Math.max(1, r.width  - 8);
      const availH = Math.max(1, r.height - 8);

      let boxW, boxH;
      if (availW / availH > ratio) {
        boxH = availH;
        boxW = boxH * ratio;
      } else {
        boxW = availW;
        boxH = boxW / ratio;
      }
      boxW = Math.round(boxW);
      boxH = Math.round(boxH);

      // 2. Size the container to the box. CSS keeps it centered via
      //    flex + margin:auto on .resolution-active.
      c.classList.add('resolution-active');
      c.style.width  = boxW + 'px';
      c.style.height = boxH + 'px';

      // 3. The iframe element is always exactly the box size (width/height
      //    100% of the container via CSS). No transform, no scaling.
      //    Cocos Creator and other canvas games listen for window.resize and
      //    re-fit their canvas to the new iframe dimensions automatically.
      //    Fire the event now and again after the CSS transition settles.
      this.notifyGameResize();
    },

    /**
     * Force the embedded game to recompute its canvas size.
     * Cocos Creator and other canvas games listen for window.resize.
     * We fire it multiple times to catch games that initialize late.
     */
    notifyGameResize() {
      const iframe = $('#game-iframe');
      if (!iframe) return;
      const fire = () => {
        try {
          const win = iframe.contentWindow;
          if (win) {
            win.dispatchEvent(new Event('resize'));
            // Some Cocos versions also listen on document
            if (win.document) {
              win.document.dispatchEvent(new Event('resize'));
            }
          }
        } catch { /* cross-origin — browser fires its own resize */ }
      };
      fire();
      setTimeout(fire, 50);
      setTimeout(fire, 200);
      setTimeout(fire, 500);
      setTimeout(fire, 1000); // catch late-initializing games
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
