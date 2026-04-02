/* ============================================
   🎮 MAIN APPLICATION — GAME HOSTING PLATFORM
   ============================================ */

const App = (() => {
  // ─── State ───
  let currentFilter = 'all';
  let searchQuery = '';
  let filteredGames = [];

  // ─── DOM Refs ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Initialize ───
  function init() {
    // Init i18n
    I18N.init();

    // Setup event listeners
    setupHeader();
    setupSearch();
    setupLangSwitcher();
    setupFilters();
    setupMobileMenu();

    // Render
    renderGames();
    updateStats();

    // Apply translations
    I18N.applyTranslations();

    // Listen for language changes to re-render
    I18N.onChange(() => {
      renderGames();
      updateStats();
    });

    // Animate on scroll
    setupScrollAnimations();
  }

  // ─── Header Scroll Effect ───
  function setupHeader() {
    const header = $('.header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // ─── Search ───
  function setupSearch() {
    const searchInput = $('#search-input');
    const mobileSearchInput = $('#mobile-search-input');

    const handleSearch = (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      // Sync both inputs
      if (searchInput && searchInput !== e.target) searchInput.value = e.target.value;
      if (mobileSearchInput && mobileSearchInput !== e.target) mobileSearchInput.value = e.target.value;
      renderGames();
    };

    if (searchInput) {
      searchInput.addEventListener('input', debounce(handleSearch, 200));
    }
    if (mobileSearchInput) {
      mobileSearchInput.addEventListener('input', debounce(handleSearch, 200));
    }
  }

  // ─── Language Switcher ───
  function setupLangSwitcher() {
    $$('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        I18N.setLang(btn.dataset.lang);
      });
    });
  }

  // ─── Category Filters ───
  function setupFilters() {
    const filterContainer = $('#filter-tabs');
    if (!filterContainer) return;

    // Render filter buttons
    renderFilters(filterContainer);

    // Re-render on language change
    I18N.onChange(() => renderFilters(filterContainer));
  }

  function renderFilters(container) {
    container.innerHTML = GAME_CATEGORIES.map(cat => {
      const label = cat === 'all'
        ? I18N.t('filter.all')
        : I18N.t(`filter.${cat}`);
      return `
        <button class="filter-tab ${cat === currentFilter ? 'active' : ''}"
                data-category="${cat}"
                id="filter-${cat}">
          ${label}
        </button>
      `;
    }).join('');

    // Attach click events
    container.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentFilter = tab.dataset.category;
        container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderGames();
      });
    });
  }

  // ─── Mobile Menu ───
  function setupMobileMenu() {
    const menuBtn = $('#mobile-menu-btn');
    const menu = $('#mobile-menu');
    if (!menuBtn || !menu) return;

    menuBtn.addEventListener('click', () => {
      menu.classList.toggle('open');
      menuBtn.innerHTML = menu.classList.contains('open') ? '✕' : '☰';
    });

    // Close on outside click
    menu.addEventListener('click', (e) => {
      if (e.target === menu) {
        menu.classList.remove('open');
        menuBtn.innerHTML = '☰';
      }
    });
  }

  // ─── Render Games Grid ───
  function renderGames() {
    const grid = $('#games-grid');
    if (!grid) return;

    // Filter games
    filteredGames = GAMES_CONFIG.filter(game => {
      const matchCategory = currentFilter === 'all' || game.category === currentFilter;
      const matchSearch = searchQuery === '' ||
        I18N.localize(game.name).toLowerCase().includes(searchQuery) ||
        I18N.localize(game.description).toLowerCase().includes(searchQuery) ||
        game.category.toLowerCase().includes(searchQuery);
      return matchCategory && matchSearch;
    });

    if (filteredGames.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">🎮</div>
          <div class="empty-state-title" data-i18n="empty.title">${I18N.t('empty.title')}</div>
          <div class="empty-state-text" data-i18n="empty.text">${I18N.t('empty.text')}</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = filteredGames.map((game, index) => createGameCard(game, index)).join('');

    // Attach card click events
    grid.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        const gameId = card.dataset.gameId;
        navigateToGame(gameId);
      });
    });
  }

  // ─── Create Game Card HTML ───
  function createGameCard(game, index) {
    const name = escapeHTML(I18N.localize(game.name));
    const description = escapeHTML(I18N.localize(game.description));
    const categoryLabel = escapeHTML(I18N.t(`category.${game.category}`));
    const thumbnailSrc = game.thumbnail
      ? `games/${game.folder}/${game.thumbnail}`
      : null;

    const thumbnailHTML = thumbnailSrc
      ? `<img src="${escapeHTML(thumbnailSrc)}" alt="${name}" loading="lazy">`
      : generatePlaceholderThumbnail(game, name);

    return `
      <article class="game-card" data-game-id="${escapeHTML(game.id)}" id="game-card-${escapeHTML(game.id)}"
               style="animation-delay: ${index * 0.06}s">
        <div class="game-card-thumbnail">
          ${thumbnailHTML}
          <div class="game-card-overlay">
            <div class="play-btn-overlay">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <span class="game-card-category">${categoryLabel}</span>
        </div>
        <div class="game-card-body">
          <h3 class="game-card-title">${name}</h3>
          <p class="game-card-description">${description}</p>
          <div class="game-card-footer">
            <div class="game-card-meta">
              <span class="game-card-meta-item">
                <span>v${escapeHTML(game.version || '1.0')}</span>
              </span>
            </div>
            <button class="play-btn" onclick="event.stopPropagation(); App.navigateToGame('${escapeHTML(game.id)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              ${I18N.t('card.play')}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // ─── Placeholder Thumbnail (SVG) ───
  function generatePlaceholderThumbnail(game, name) {
    const colors = {
      arcade: ['#7c3aed', '#a78bfa'],
      action: ['#dc2626', '#f87171'],
      puzzle: ['#059669', '#34d399'],
      casual: ['#d97706', '#fbbf24'],
      strategy: ['#2563eb', '#60a5fa'],
    };
    const [c1, c2] = colors[game.category] || colors.arcade;
    const initials = (name || '?').split(' ').filter(w => w.length > 0).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

    return `
      <svg width="100%" height="100%" viewBox="0 0 480 300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-${game.id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${c1};stop-opacity:1"/>
            <stop offset="100%" style="stop-color:${c2};stop-opacity:1"/>
          </linearGradient>
          <pattern id="dots-${game.id}" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.1)"/>
          </pattern>
        </defs>
        <rect width="480" height="300" fill="url(#grad-${game.id})"/>
        <rect width="480" height="300" fill="url(#dots-${game.id})"/>
        <text x="240" y="140" text-anchor="middle" fill="rgba(255,255,255,0.9)"
              font-family="Inter, sans-serif" font-size="64" font-weight="800">${initials}</text>
        <text x="240" y="180" text-anchor="middle" fill="rgba(255,255,255,0.5)"
              font-family="Inter, sans-serif" font-size="16" font-weight="500">${name}</text>
        <text x="240" y="210" text-anchor="middle" fill="rgba(255,255,255,0.3)"
              font-family="Inter, sans-serif" font-size="12">COCOS CREATOR</text>
      </svg>
    `;
  }

  // ─── Navigate to Game ───
  function navigateToGame(gameId) {
    const game = GAMES_CONFIG.find(g => g.id === gameId);
    if (!game) return;
    window.location.href = `play.html?game=${gameId}`;
  }

  // ─── Update Hero Stats ───
  function updateStats() {
    const statValue = $('#stat-games-count');
    if (statValue) {
      statValue.textContent = GAMES_CONFIG.length;
    }
  }

  // ─── Scroll Animations ───
  function setupScrollAnimations() {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animationPlayState = 'running';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    // Observe game cards when available
    setTimeout(() => {
      $$('.game-card').forEach(card => {
        card.style.animationPlayState = 'paused';
        observer.observe(card);
      });
    }, 100);
  }

  // ─── Utility: Debounce ───
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ─── Utility: Escape HTML (XSS prevention) ───
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Public API ───
  return {
    init,
    navigateToGame
  };
})();

// ─── Boot ───
document.addEventListener('DOMContentLoaded', App.init);
