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
      // Reset first
      c.style.width = c.style.height = c.style.maxWidth = c.style.maxHeight = c.style.aspectRatio = '';
      c.classList.remove('resolution-active');

      if (name === 'auto' || !ratio) {
        // Back to full-area: let the game refit to the whole wrapper.
        this.notifyGameResize();
        return;
      }

      c.classList.add('resolution-active');
      const r = w.getBoundingClientRect();
      const maxW = r.width * 0.95;
      const maxH = r.height * 0.95;
      let width, height;
      // Fit within available area while maintaining aspect ratio
      if (maxW / maxH > ratio) {
        // Height-constrained
        height = maxH;
        width = height * ratio;
      } else {
        // Width-constrained
        width = maxW;
        height = width / ratio;
      }
      c.style.width = Math.round(width) + 'px';
      c.style.height = Math.round(height) + 'px';

      // The container box resized, but many HTML5/Cocos playable ads only
      // refit their canvas when their OWN window receives a 'resize'. When we
      // change the iframe box via CSS the browser doesn't always deliver that
      // reliably (especially mid CSS-transition), so the game keeps its old
      // size and overflows the smaller box. Force it to refit.
      this.notifyGameResize();
    },

    /**
     * Force the embedded game to recompute its canvas size so it shrinks/grows
     * to fill the current iframe box instead of overflowing it.
     *
     * HTML5 playable ads (Cocos Creator, Construct, GameMaker, plain canvas)
     * listen for a 'resize' on their own window. We dispatch it ourselves
     * because a CSS-driven iframe resize isn't always delivered reliably.
     * Fires immediately and again after the 0.4s CSS size transition.
     * Same-origin only — cross-origin games fall back to the native resize.
     */
    notifyGameResize() {
      const iframe = $('#game-iframe');
      if (!iframe) return;
      const fire = () => {
        try {
          const win = iframe.contentWindow;
          if (win) win.dispatchEvent(new Event('resize'));
        } catch {
          /* cross-origin game: the browser's native resize event handles it */
        }
      };
      fire();
      setTimeout(fire, 80);
      setTimeout(fire, 460); // after the CSS width/height transition (~0.4s)
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
