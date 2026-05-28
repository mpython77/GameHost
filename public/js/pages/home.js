/**
 * Home page (index.html) — game catalog grid + filter + search.
 *
 * Depends on globals: I18N, GAMES_CONFIG, GAME_CATEGORIES, GH.{$, $$, escapeHTML, debounce, Auth, api}
 */

(function () {
  const { $, $$, escapeHTML, debounce, Auth } = window.GH;

  const Home = {
    state: { filter: 'all', search: '' },

    async init() {
      I18N.init();
      this.setupHeader();
      this.setupSearch();
      this.setupLangSwitcher();
      this.setupFilters();
      this.setupMobileMenu();
      await this.loadGames();
      this.render();
      this.updateStats();
      I18N.applyTranslations();
      I18N.onChange(() => { this.render(); this.updateStats(); });
      this.setupAuthHeader();
      this.setupHeroParticles();
      this.setupCardTilt();
    },

    setupHeader() {
      const header = $('.header');
      if (!header) return;
      window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 20);
      }, { passive: true });
    },

    setupSearch() {
      const handler = debounce((e) => {
        this.state.search = e.target.value.toLowerCase().trim();
        const main = $('#search-input');
        const mob  = $('#mobile-search-input');
        if (main && main !== e.target) main.value = e.target.value;
        if (mob && mob !== e.target) mob.value = e.target.value;
        this.render();
      }, 200);
      const main = $('#search-input');
      const mob  = $('#mobile-search-input');
      if (main) main.addEventListener('input', handler);
      if (mob) mob.addEventListener('input', handler);
    },

    setupLangSwitcher() {
      $$('.lang-btn').forEach((btn) => {
        btn.addEventListener('click', () => I18N.setLang(btn.dataset.lang));
      });
    },

    setupFilters() {
      const container = $('#filter-tabs');
      if (!container) return;
      this.renderFilters(container);
      I18N.onChange(() => this.renderFilters(container));
    },

    renderFilters(container) {
      container.innerHTML = (window.GAME_CATEGORIES || []).map((cat) => {
        const label = cat === 'all' ? I18N.t('filter.all') : I18N.t('filter.' + cat);
        return `<button class="filter-tab ${cat === this.state.filter ? 'active' : ''}"
                       data-category="${cat}">${label}</button>`;
      }).join('');
      container.querySelectorAll('.filter-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          this.state.filter = tab.dataset.category;
          container.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          this.render();
        });
      });
    },

    setupMobileMenu() {
      const btn = $('#mobile-menu-btn');
      const menu = $('#mobile-menu');
      if (!btn || !menu) return;
      btn.addEventListener('click', () => {
        menu.classList.toggle('open');
        btn.innerHTML = menu.classList.contains('open') ? '✕' : '☰';
      });
      menu.addEventListener('click', (e) => {
        if (e.target === menu) {
          menu.classList.remove('open');
          btn.innerHTML = '☰';
        }
      });
    },

    async loadGames() {
      try {
        const data = await window.GH.api.get('/api/games?_t=' + Date.now());
        if (Array.isArray(data)) window.GAMES_CONFIG = data;
      } catch {
        // fall back to static config
      }
    },

    render() {
      const grid = $('#games-grid');
      if (!grid) return;
      const games = (window.GAMES_CONFIG || []).filter((g) => {
        const matchCat = this.state.filter === 'all' || g.category === this.state.filter;
        const q = this.state.search;
        const matchSearch = q === ''
          || I18N.localize(g.name).toLowerCase().includes(q)
          || I18N.localize(g.description).toLowerCase().includes(q)
          || (g.category || '').toLowerCase().includes(q);
        return matchCat && matchSearch;
      });

      if (games.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state-icon">🎮</div>
            <div class="empty-state-title" data-i18n="empty.title">${I18N.t('empty.title')}</div>
            <div class="empty-state-text" data-i18n="empty.text">${I18N.t('empty.text')}</div>
          </div>`;
        return;
      }

      grid.innerHTML = games.map((g, i) => this.cardHtml(g, i)).join('');
      grid.querySelectorAll('.game-card').forEach((card) => {
        card.addEventListener('click', () => {
          window.location.href = 'play.html?game=' + card.dataset.gameId;
        });
      });
    },

    cardHtml(game, index) {
      const name = escapeHTML(I18N.localize(game.name));
      const desc = escapeHTML(I18N.localize(game.description));
      const cat = escapeHTML(I18N.t('category.' + game.category));
      const id = escapeHTML(game.id);
      const thumb = game.thumbnail
        ? `<img src="games/${escapeHTML(game.folder)}/${escapeHTML(game.thumbnail)}" alt="${name}" loading="lazy">`
        : this.placeholder(game, name);

      return `
        <article class="game-card" data-game-id="${id}" style="animation-delay:${index * 0.06}s">
          <div class="game-card-thumbnail">
            ${thumb}
            <div class="game-card-overlay">
              <div class="play-btn-overlay">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <span class="game-card-category">${cat}</span>
          </div>
          <div class="game-card-body">
            <h3 class="game-card-title">${name}</h3>
            <p class="game-card-description">${desc}</p>
            <div class="game-card-footer">
              <div class="game-card-meta">
                <span class="game-card-meta-item">▶ ${game.playCount || 0}</span>
                <span class="game-card-meta-item">v${escapeHTML(game.version || '1.0')}</span>
              </div>
              <div class="card-actions">
                <a class="play-btn" href="play.html?game=${id}" onclick="event.stopPropagation()">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  ${I18N.t('card.play')}
                </a>
                <button class="share-btn" data-share-id="${id}" data-share-name="${name}" title="Share">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </button>
              </div>
            </div>
          </div>
        </article>`;
    },

    placeholder(game, name) {
      const colors = {
        arcade:   ['#7c3aed', '#a78bfa'],
        action:   ['#dc2626', '#f87171'],
        puzzle:   ['#059669', '#34d399'],
        casual:   ['#d97706', '#fbbf24'],
        strategy: ['#2563eb', '#60a5fa'],
      };
      const [c1, c2] = colors[game.category] || colors.arcade;
      const initials = (name || '?').split(' ').filter(Boolean)
        .map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
      const safeId = escapeHTML(game.id);
      return `
        <svg width="100%" height="100%" viewBox="0 0 480 300" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad-${safeId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:${c1}"/><stop offset="100%" style="stop-color:${c2}"/>
            </linearGradient>
          </defs>
          <rect width="480" height="300" fill="url(#grad-${safeId})"/>
          <text x="240" y="160" text-anchor="middle" fill="rgba(255,255,255,0.9)"
                font-family="Inter,sans-serif" font-size="64" font-weight="800">${initials}</text>
          <text x="240" y="200" text-anchor="middle" fill="rgba(255,255,255,0.5)"
                font-family="Inter,sans-serif" font-size="16">${escapeHTML(name)}</text>
        </svg>`;
    },

    updateStats() {
      const el = $('#stat-games-count');
      if (el) el.textContent = (window.GAMES_CONFIG || []).length;
    },

    async setupAuthHeader() {
      const ok = await Auth.check();
      const loginLink = $('#login-link');
      const uploadLink = $('#upload-link');
      const adminLink  = $('#admin-link');
      const logoutLink = $('#logout-link');
      if (ok) {
        if (uploadLink) uploadLink.style.display = '';
        if (adminLink)  adminLink.style.display = '';
        if (logoutLink) {
          logoutLink.style.display = '';
          logoutLink.addEventListener('click', async () => {
            await Auth.logout();
            location.reload();
          });
        }
      } else if (loginLink) {
        loginLink.style.display = '';
      }
    },

    setupHeroParticles() {
      const canvas = $('#hero-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const hero = canvas.closest('.hero');
      const resize = () => {
        canvas.width = hero.offsetWidth;
        canvas.height = hero.offsetHeight;
      };
      resize();
      window.addEventListener('resize', resize);

      const dots = Array.from({ length: 50 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
      }));

      const tick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dots.forEach((d) => {
          d.x += d.vx; d.y += d.vy;
          if (d.x < 0 || d.x > canvas.width) d.vx *= -1;
          if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(124,58,237,0.4)';
          ctx.fill();
        });
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 100) {
              ctx.beginPath();
              ctx.moveTo(dots[i].x, dots[i].y);
              ctx.lineTo(dots[j].x, dots[j].y);
              ctx.strokeStyle = `rgba(124,58,237,${(1 - d / 100) * 0.2})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    },

    setupCardTilt() {
      // Skip on touch / coarse pointers
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      document.addEventListener('mousemove', (e) => {
        $$('.game-card').forEach((card) => {
          const r = card.getBoundingClientRect();
          const x = e.clientX - r.left - r.width / 2;
          const y = e.clientY - r.top - r.height / 2;
          const dist = Math.sqrt(x * x + y * y);
          if (dist < 250) {
            const tx = (y / r.height) * 6;
            const ty = -(x / r.width) * 6;
            card.style.transform = `perspective(1000px) rotateX(${tx}deg) rotateY(${ty}deg) translateY(-6px)`;
          }
        });
      });
      document.addEventListener('mouseleave', () => {
        $$('.game-card').forEach((c) => { c.style.transform = ''; });
      });
    },
  };

  // Share button delegation
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.share-btn');
    if (!btn) return;
    e.stopPropagation();
    const url = `${location.origin}/play.html?game=${btn.dataset.shareId}`;
    const name = btn.dataset.shareName;
    if (navigator.share) {
      navigator.share({ title: name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        window.GH.toast('🔗 Havola nusxalandi!', 'info');
      }).catch(() => prompt('Havolani nusxalang:', url));
    }
  });

  document.addEventListener('DOMContentLoaded', () => Home.init());
})();
