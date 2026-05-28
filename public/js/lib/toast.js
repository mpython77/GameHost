/* Tiny toast notifications. */
window.GH = window.GH || {};
window.GH.toast = (function () {
  let el = null;
  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'gh-toast';
    el.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'padding:10px 22px;border-radius:999px;font-size:14px;font-weight:600;' +
      'z-index:9999;pointer-events:none;opacity:0;transition:opacity .3s;' +
      'max-width:90%;text-align:center;color:#fff;';
    document.body.appendChild(el);
    return el;
  }
  return function toast(msg, type = 'info', durationMs = 2500) {
    const el = ensureEl();
    const palette = {
      info:    'rgba(124,58,237,0.95)',
      success: 'rgba(5,150,105,0.95)',
      error:   'rgba(185,28,28,0.95)',
      warn:    'rgba(217,119,6,0.95)',
    };
    el.style.background = palette[type] || palette.info;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, durationMs);
  };
})();
