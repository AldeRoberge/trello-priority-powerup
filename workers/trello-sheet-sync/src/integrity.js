// Header integrity: detects when someone renames, moves, inserts or deletes a column of the
// Tasks tab, and works out which data belongs to which column so it can be restored.

import { COLUMNS, ID_HEADER } from './columns.js';

const KEY_BY_HEADER = new Map(Object.entries(COLUMNS).map(([k, v]) => [v.header, k]));

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * @param {string[]} actual  header row as found in the Sheet
 * @param {string[]|null} layout  header row the Worker last wrote (null on the very first run)
 * @param {string[]} wanted  header row for the configured columns
 * @returns {{tampered:boolean, relayout:boolean, changes:object[], keys:(string|null)[]}}
 *   keys: registry key of each data column (without column A) as the Sheet holds it now
 */
export function checkHeader(actual, layout, wanted) {
  const a = (actual || []).map((v) => String(v ?? '').trim());
  const keys = resolveKeys(a, layout);
  const changes = [];

  if (layout && !same(a, layout)) {
    const max = Math.max(a.length, layout.length);
    for (let i = 0; i < max; i++) {
      const now = a[i];
      const was = layout[i];
      if (now === was) continue;
      if (i === 0) changes.push({ type: 'id', position: i, from: was, to: now });
      else if (now === undefined || now === '') changes.push({ type: 'removed', position: i, from: was, to: now || '' });
      else if (was === undefined) changes.push({ type: 'added', position: i, from: '', to: now });
      else if (layout.includes(now)) changes.push({ type: 'moved', position: i, from: was, to: now });
      else changes.push({ type: 'renamed', position: i, from: was, to: now });
    }
  }

  const tampered = changes.length > 0;
  return { tampered, relayout: tampered || !same(a, wanted), changes, keys };
}

/**
 * Registry key for every data column. Known header text wins (handles moved columns); an unknown
 * header is treated as a rename of whatever column sat at that position, unless that column is
 * still present elsewhere (an inserted column must not steal its neighbour's key).
 */
export function resolveKeys(actual, layout) {
  const data = actual.slice(1);
  const keys = data.map((h) => KEY_BY_HEADER.get(h) || null);
  const claimed = new Set();
  keys.forEach((k, i) => {
    if (k && claimed.has(k)) keys[i] = null; // duplicated column: the first one wins
    else if (k) claimed.add(k);
  });
  keys.forEach((k, i) => {
    if (k || !layout || !layout[i + 1]) return;
    const old = KEY_BY_HEADER.get(layout[i + 1]);
    if (old && !claimed.has(old)) {
      keys[i] = old;
      claimed.add(old);
    }
  });
  return keys;
}

/** Human sentence for a header change (used in the CRITICAL log). */
export function describeChange(c) {
  switch (c.type) {
    case 'id':
      return `la colonne clé « ${ID_HEADER} » a été modifiée (« ${c.from} » → « ${c.to} »)`;
    case 'renamed':
      return `colonne ${c.position + 1} renommée : « ${c.from} » → « ${c.to} »`;
    case 'moved':
      return `colonne déplacée : « ${c.to} » est maintenant en position ${c.position + 1}`;
    case 'removed':
      return `colonne ${c.position + 1} supprimée : « ${c.from} »`;
    case 'added':
      return `colonne ajoutée en position ${c.position + 1} : « ${c.to} »`;
    default:
      return c.type;
  }
}
