/**
 * Chart wrappers around Chart.js.
 *
 * The library is loaded on-demand from a CDN (only the admin page needs
 * it). All charts share a dark-theme palette and respect the user's
 * `prefers-reduced-motion` setting.
 */
window.GH = window.GH || {};
window.GH.Charts = (function () {
  let chartLib = null; // cached promise

  function loadChartJs() {
    if (chartLib) return chartLib;
    chartLib = new Promise((resolve, reject) => {
      if (window.Chart) return resolve(window.Chart);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.Chart);
      s.onerror = () => reject(new Error('Chart.js CDN load failed'));
      document.head.appendChild(s);
    });
    return chartLib;
  }

  // Brand palette
  const PALETTE = {
    purple:    '#7c3aed',
    purpleSoft:'rgba(124,58,237,0.18)',
    cyan:      '#06b6d4',
    cyanSoft:  'rgba(6,182,212,0.18)',
    green:     '#10b981',
    orange:    '#f59e0b',
    red:       '#ef4444',
    pink:      '#ec4899',
    blue:      '#3b82f6',
    grid:      'rgba(255,255,255,0.06)',
    text:      '#a1a1aa',
    textBright:'#e4e4e7',
  };

  const PIE_PALETTE = [
    '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#3b82f6', '#a78bfa',
  ];

  function reducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function commonOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 400 },
      plugins: {
        legend: {
          labels: { color: PALETTE.text, font: { family: 'Inter, sans-serif' } },
        },
        tooltip: {
          backgroundColor: 'rgba(20,20,30,0.95)',
          titleColor: PALETTE.textBright,
          bodyColor: PALETTE.textBright,
          borderColor: 'rgba(124,58,237,0.4)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          ticks: { color: PALETTE.text, maxRotation: 0 },
          grid:  { color: PALETTE.grid },
        },
        y: {
          ticks: { color: PALETTE.text, precision: 0 },
          grid:  { color: PALETTE.grid },
          beginAtZero: true,
        },
      },
    };
  }

  /**
   * Time-series line chart for plays + uploads.
   * series: [{date:'YYYY-MM-DD', plays, uploads, deletes}]
   */
  async function lineActivity(canvas, series, labels = {}) {
    const Chart = await loadChartJs();
    const opts = commonOpts();
    const labelsArr = series.map((d) => d.date.slice(5)); // MM-DD
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: labelsArr,
        datasets: [
          {
            label: labels.plays || 'Plays',
            data: series.map((d) => d.plays),
            borderColor: PALETTE.purple,
            backgroundColor: PALETTE.purpleSoft,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 2,
            pointHoverRadius: 5,
          },
          {
            label: labels.uploads || 'Uploads',
            data: series.map((d) => d.uploads),
            borderColor: PALETTE.cyan,
            backgroundColor: PALETTE.cyanSoft,
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
          },
        ],
      },
      options: opts,
    });
  }

  /** Donut for category distribution. */
  async function donutCategory(canvas, dist, labels = {}) {
    const Chart = await loadChartJs();
    const entries = Object.entries(dist).filter(([, v]) => v > 0);
    const colors = entries.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]);
    const opts = commonOpts();
    delete opts.scales;
    opts.cutout = '62%';
    opts.plugins.legend.position = 'bottom';

    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => labels[k] || k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: colors,
          borderColor: 'rgba(0,0,0,0)',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: opts,
    });
  }

  /** Donut for public/private split. */
  async function donutPrivacy(canvas, publicCount, privateCount, labels = {}) {
    const Chart = await loadChartJs();
    const opts = commonOpts();
    delete opts.scales;
    opts.cutout = '62%';
    opts.plugins.legend.position = 'bottom';
    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: [labels.public || 'Public', labels.private || 'Private'],
        datasets: [{
          data: [publicCount, privateCount],
          backgroundColor: [PALETTE.green, PALETTE.red],
          borderColor: 'rgba(0,0,0,0)',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: opts,
    });
  }

  /** Horizontal bar for top games. */
  async function barTopGames(canvas, topGames, labelFn) {
    const Chart = await loadChartJs();
    const opts = commonOpts();
    opts.indexAxis = 'y';
    opts.plugins.legend.display = false;
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels: topGames.map(labelFn),
        datasets: [{
          data: topGames.map((g) => g.playCount),
          backgroundColor: topGames.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
          borderRadius: 6,
          barThickness: 16,
        }],
      },
      options: opts,
    });
  }

  return { lineActivity, donutCategory, donutPrivacy, barTopGames, PALETTE };
})();
