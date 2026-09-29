// Column registry for the Tasks tab. Column A is always the hidden TrelloCardId join key;
// the other columns follow the user's chosen order (stored in the _Config tab, editable from
// the Power-Up's Table view).
//   dir 'both'  : Trello <-> Sheet, 3-way merge (Trello wins on conflict)
//   dir 'push'  : computed by the Power-Up in the browser and pushed via POST /push
//   dir 'trello': read from Trello only, never written back

export const ID_HEADER = 'TrelloCardId';

export const COLUMNS = {
  category: { header: 'Catégorie', dir: 'both' },
  name: { header: 'Objet', dir: 'both' },
  statut: { header: 'Statut', dir: 'both' },
  urgency: { header: 'Urgence', dir: 'push' },
  impact: { header: 'Impact et besoin', dir: 'push' },
  priority: { header: 'Priorité', dir: 'push' },
  tier: { header: 'Palier', dir: 'push' },
  progress: { header: 'Progrès', dir: 'push' },
  desc: { header: 'Description', dir: 'both' },
  due: { header: 'Échéance', dir: 'trello' },
  link: { header: 'Carte', dir: 'trello' },
};

export const DEFAULT_COLUMNS = ['category', 'name', 'statut', 'urgency', 'impact', 'priority', 'progress', 'desc', 'due', 'link'];

/** Keeps known keys only, drops duplicates; falls back to the defaults when nothing is valid. */
export function normalizeColumns(input) {
  const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const key = String(raw).trim();
    if (COLUMNS[key] && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out.length ? out : DEFAULT_COLUMNS.slice();
}

export function headerRow(columns) {
  return [ID_HEADER, ...columns.map((k) => COLUMNS[k].header)];
}

/** Maps a sheet header row back to registry keys (unknown headers become null). */
export function keysFromHeader(header) {
  const byHeader = new Map(Object.entries(COLUMNS).map(([k, v]) => [v.header, k]));
  return (header || []).slice(1).map((h) => byHeader.get(String(h).trim()) || null);
}
