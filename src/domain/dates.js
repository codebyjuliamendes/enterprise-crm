'use strict';

/**
 * SQLite's CURRENT_TIMESTAMP is UTC but formatted without a zone ("2024-05-01 13:45:00"),
 * which browsers parse as local time. Convert it to an unambiguous ISO-8601 UTC string.
 * @param {unknown} value
 * @returns {string | null}
 */
function sqliteUtcToIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return `${text.replace(' ', 'T')}Z`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

module.exports = { sqliteUtcToIso };
