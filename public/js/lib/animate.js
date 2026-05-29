/**
 * animate.js — lightweight motion helpers (no dependencies).
 *
 *   1) Count-up: any element matching a stat selector whose text becomes a
 *      plain number animates from its previous value to the new one. This
 *      is fully DECOUPLED — page code keeps doing `el.textContent = '1,234'`
 *      and the number rolls up smoothly. Driven by a MutationObserver.
 *
 *   2) reveal(selector): fade/slide elements in as they scroll into view
 *      (IntersectionObserver). Adds `.gh-in` to `.gh-reveal` elements.
 *
 * Honors prefers-reduced-motion: values snap instantly, reveals show at once.
 *
 * Exposed as window.GH.animate.
 */
(function () {
  window.GH = window.GH || {};

  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Elements whose numeric text should roll up.
  var COUNT_SELECTOR = '.stat-value, .analytics-stat-value, .hero-stat-value';
  // Text that is "just a number" (digits, spaces, thousands separators).
  var NUMERIC_RE = /^\s*[\d][\d\s.,\u00a0]*\s*$/;

  function parseNum(text) {
    if (!NUMERIC_RE.test(text)) return null;
    var n = parseInt(String(text).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  function format(n) {
    try { return Math.round(n).toLocaleString(); }
    catch (e) { return String(Math.round(n)); }
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /** Animate a single element's text from `from` to `to`. */
  function runCount(el, from, to) {
    var duration = Math.min(1100, 380 + Math.abs(to - from) * 6);
    var start = null;
    el._ghAnimating = true;

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var val = from + (to - from) * easeOutCubic(p);
      el.textContent = format(val);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = format(to);
        el._ghValue = to;
        // Clear the flag on the next frame so the trailing mutation record
        // (from the final textContent set) is still ignored.
        requestAnimationFrame(function () { el._ghAnimating = false; });
      }
    }
    requestAnimationFrame(step);
  }

  /** Evaluate an element's current text and animate if it's a new number. */
  function evaluate(el) {
    if (el._ghAnimating) return;
    // Skip composite cells (e.g. the SSE status that holds dot + label).
    if (el.querySelector && el.querySelector('*')) return;
    var target = parseNum(el.textContent);
    if (target === null) return;
    var prev = typeof el._ghValue === 'number' ? el._ghValue : 0;
    if (target === prev) return;
    if (REDUCED) { el.textContent = format(target); el._ghValue = target; return; }
    runCount(el, prev, target);
  }

  function attach(el) {
    if (el._ghCountBound) { evaluate(el); return; }
    el._ghCountBound = true;
    var mo = new MutationObserver(function () { evaluate(el); });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    evaluate(el);
  }

  function scanCounters(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll(COUNT_SELECTOR);
    for (var i = 0; i < nodes.length; i++) attach(nodes[i]);
  }

  // Watch for stat elements added after initial load.
  function watchNewCounters() {
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches(COUNT_SELECTOR)) attach(n);
          if (n.querySelectorAll) scanCounters(n);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /** Scroll-reveal: observe `.gh-reveal` elements and reveal on enter. */
  function reveal(selector) {
    var els = typeof selector === 'string'
      ? document.querySelectorAll(selector)
      : selector;
    if (!els || !els.length) return;

    if (REDUCED || !('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) {
        els[i].classList.add('gh-reveal', 'gh-in');
      }
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('gh-in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    for (var k = 0; k < els.length; k++) {
      els[k].classList.add('gh-reveal');
      io.observe(els[k]);
    }
  }

  function init() {
    scanCounters(document);
    watchNewCounters();
    // Opt-in scroll reveal for anything tagged in markup.
    reveal('[data-gh-reveal]');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.GH.animate = { reveal: reveal, countUp: runCount };
})();
