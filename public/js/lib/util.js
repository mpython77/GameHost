/* Tiny utilities: $, $$, debounce, formatSize. */
window.GH = window.GH || {};

window.GH.$ = (sel, root) => (root || document).querySelector(sel);
window.GH.$$ = (sel, root) => (root || document).querySelectorAll(sel);

window.GH.debounce = function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

window.GH.formatSize = function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};
