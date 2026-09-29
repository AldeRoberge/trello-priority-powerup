// Condensed port of components/statut/statut-match.js (list name <-> Statut label).

export const STATUT_CATEGORIES = [
  { key: 'triage', label: 'Triage', emoji: '📥', aliases: ['triage', 'a trier', 'inbox', 'incoming', 'nouveautes', 'new'] },
  { key: 'backlog', label: 'Backlog', emoji: '⏳', aliases: ['backlog', 'icebox', 'en attente', 'someday', 'later', 'ideas', 'idees'] },
  { key: 'unstarted', label: 'Non démarré', emoji: '⚪', aliases: ['unstarted', 'a faire', 'todo', 'to do', 'ready', 'next', 'up next', 'ouvert', 'open', 'pending'] },
  { key: 'started', label: 'En cours', emoji: '▶️', aliases: ['started', 'en cours', 'in progress', 'doing', 'wip', 'working', 'in review', 'review', 'qa', 'testing'] },
  { key: 'blocked', label: 'Bloqué', emoji: '🚫', aliases: ['blocked', 'bloque', 'on hold', 'en pause', 'paused', 'waiting', 'stuck'] },
  { key: 'completed', label: 'Terminé', emoji: '✅', aliases: ['completed', 'complete', 'termine', 'terminee', 'done', 'fini', 'finished', 'closed'] },
  { key: 'canceled', label: 'Annulé', emoji: '❌', aliases: ['canceled', 'cancelled', 'annule', 'wont do', 'wontfix', 'abandoned', 'dropped', 'rejected'] },
];

export function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[_/\|]+/g, ' ')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryOf(norm) {
  if (!norm) return null;
  for (const cat of STATUT_CATEGORIES) {
    if (norm === normalizeName(cat.label) || norm === cat.key) return cat;
    for (const alias of cat.aliases) {
      if (norm === alias || norm.includes(alias) || alias.includes(norm)) return cat;
    }
  }
  return null;
}

/** Trello list name -> Sheet label ("▶️ En cours"), or the raw list name when it maps to nothing. */
export function statutLabelForList(listName) {
  const cat = categoryOf(normalizeName(listName));
  return cat ? `${cat.emoji} ${cat.label}` : String(listName || '');
}

/** Sheet label -> Trello list: exact list name first, then same-category list. Null if none. */
export function findListForStatut(lists, value) {
  const wanted = normalizeName(String(value || '').replace(/^[^\p{L}\p{N}]+/u, ''));
  if (!wanted) return null;
  const exact = lists.find((l) => normalizeName(l.name) === wanted);
  if (exact) return exact;
  const cat = categoryOf(wanted);
  if (!cat) return null;
  return lists.find((l) => categoryOf(normalizeName(l.name))?.key === cat.key) || null;
}
