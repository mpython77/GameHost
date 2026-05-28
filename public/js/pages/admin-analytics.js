/**
 * Admin analytics dashboard — Chart.js graphs + SSE live updates.
 *
 * Wires:
 *   - GET /api/admin/analytics?days=N
 *   - SSE /api/admin/events  (game.uploaded/deleted/played → refresh)
 *
 * Charts are recreated on data refresh (simpler than partial updates;
 * Chart.js handles 4 small charts faster than 60 frames per second).
 */

(function () {
  const { $, $$, escapeHTML, api, toast, Charts, SSE } = window.GH;

  const Analytics = {
    currentDays: 30,
    charts: {},
    sse: null,
    refreshDebounce: null,

    /** Initialize after admin login is confirmed. */
    init() {
      // Range selector
      $$('.range-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          $$('.range-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentDays = parseInt(btn.dataset.days, 10) || 30;
          this.refresh();
        });
      });

      // Re-render on language change so labels translate
      I18N.onChange(() => {
        if (this._lastData) this.renderCharts(this._lastData);
      });

      this.refresh();
      this.startLive();
    },

    /** Stop live + destroy charts (for logout). */
    teardown() {
      if (this.sse) { this.sse.stop(); this.sse = null; }
      Object.values(this.charts).forEach((c) => { try { c.destroy(); } catch {} });
      this.charts = {};
      this._setSseStatus(false);
    },

    async refresh() {
      try {
        const data = await api.get('/api/admin/analytics?days=' + this.currentDays);
        this._lastData = data;
        this.renderSummary(data);
        await this.renderCharts(data);
      } catch (err) {
        toast(err.message, 'error');
      }
    },

    renderSummary(data) {
      const s = data.summary || {};
      $('#an-range-plays').textContent   = (s.rangePlays   || 0).toLocaleString();
      $('#an-range-uploads').textContent = (s.rangeUploads || 0).toLocaleString();
      $('#an-all-plays').textContent     = (s.allTimePlays || 0).toLocaleString();
    },

    async renderCharts(data) {
      // Destroy previous instances
      Object.values(this.charts).forEach((c) => { try { c.destroy(); } catch {} });

      // 1) Activity line
      this.charts.activity = await Charts.lineActivity(
        $('#chart-activity'),
        data.series || [],
        { plays: I18N.t('analytics.plays'), uploads: I18N.t('analytics.uploads') }
      );

      // 2) Public/Private donut
      this.charts.privacy = await Charts.donutPrivacy(
        $('#chart-privacy'),
        data.summary.publicCount, data.summary.privateCount,
        { public: I18N.t('admin.publicLabel'), private: I18N.t('admin.privateLabel') }
      );

      // 3) Categories donut
      const catLabels = {
        arcade: I18N.t('category.arcade'),
        action: I18N.t('category.action'),
        puzzle: I18N.t('category.puzzle'),
        casual: I18N.t('category.casual'),
        strategy: I18N.t('category.strategy'),
      };
      this.charts.category = await Charts.donutCategory(
        $('#chart-category'),
        data.byCategory || {},
        catLabels
      );

      // 4) Top games horizontal bar
      const top = (data.topGames || []).slice(0, 8);
      this.charts.top = await Charts.barTopGames(
        $('#chart-top'),
        top,
        (g) => {
          const name = g.name ? (I18N.localize(g.name) || g.id) : g.id;
          return name.length > 22 ? name.slice(0, 21) + '…' : name;
        }
      );
    },

    // ─── SSE live updates ───
    startLive() {
      if (this.sse) return;
      this.sse = new window.GH.SSE({
        url: '/api/admin/events',
        ticketUrl: '/api/admin/sse-ticket',
      });

      this.sse.on('open', () => this._setSseStatus(true));
      this.sse.on('error', () => this._setSseStatus(false));

      // Domain events → toast + debounced refresh
      const debouncedRefresh = () => {
        clearTimeout(this.refreshDebounce);
        this.refreshDebounce = setTimeout(() => {
          this.refresh();
          // Also refresh the games table & basic stats from the parent module
          if (window.Admin && typeof window.Admin.loadGames === 'function') {
            window.Admin.loadGames();
            window.Admin.loadStats();
          }
        }, 600); // burst-friendly
      };

      this.sse.on('game.uploaded', (data) => {
        const name = data && data.name ? (I18N.localize(data.name) || data.gameId) : (data && data.gameId);
        toast(I18N.t('analytics.toastUploaded', { name }), 'success', 4000);
        debouncedRefresh();
      });

      this.sse.on('game.deleted', (data) => {
        toast(I18N.t('analytics.toastDeleted', { name: data && data.gameId }), 'info', 3000);
        debouncedRefresh();
      });

      this.sse.on('game.privacy_changed', () => debouncedRefresh());
      this.sse.on('games.cleared', () => debouncedRefresh());
      // Plays are noisy — don't toast, just refresh
      this.sse.on('game.played', () => debouncedRefresh());

      this.sse.start();

      // Stop when the tab is closing
      window.addEventListener('beforeunload', () => this.teardown());
    },

    _setSseStatus(connected) {
      const dot = $('#sse-dot');
      const label = $('#sse-label');
      if (!dot || !label) return;
      dot.classList.toggle('connected', !!connected);
      dot.classList.toggle('disconnected', !connected);
      label.textContent = I18N.t(connected ? 'analytics.sseConnected' : 'analytics.sseDisconnected');
    },
  };

  // Boot when admin dashboard is shown.
  // We piggyback on the existing Admin.showDashboard sequence by checking
  // visibility every 200ms until shown, then init once.
  function bootWhenReady() {
    if ($('#admin-dashboard') && $('#admin-dashboard').classList.contains('visible')) {
      Analytics.init();
      return;
    }
    setTimeout(bootWhenReady, 200);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(bootWhenReady, 300);
  });

  window.AdminAnalytics = Analytics;
})();
