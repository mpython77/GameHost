'use strict';

/**
 * Convert an arbitrary string to a safe URL/folder slug.
 * Strips diacritics, lowercases, replaces non [a-z0-9] with `-`.
 */
function slugify(input, fallbackPrefix = 'game') {
  if (!input) return `${fallbackPrefix}-${Date.now()}`;
  const normalized = String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `${fallbackPrefix}-${Date.now()}`;
}

module.exports = { slugify };
