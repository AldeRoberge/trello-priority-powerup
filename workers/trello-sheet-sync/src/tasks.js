// Read-only task list for the VVD Control Center: GET /tasks (see index.js, docs/sheet-sync.md).
// Pure formatting only (no I/O) so it can be unit-tested (test/worker-tasks.test.js).
//
// Where each field comes from on the server:
//   priority, progress  the values the Power-Up pushed to the Sheet (state tab, `pushed`); null when never pushed
//   statut, blocked     the Trello list name (same mapping as the Sheet); blocked = list "Bloqué" category
//   done                list category Terminé/Annulé, or the card's dueComplete flag
//   project             NOT available server side (stored in Power-Up pluginData); we return the
//                       Catégorie custom field instead, projectId is always ''
//   start               the Trello card start date

import { statutLabelForList, STATUT_CATEGORIES, normalizeName } from './statut.js';

const catOf = (listName) => {
  const label = statutLabelForList(listName);
  return STATUT_CATEGORIES.find((c) => label === `${c.emoji} ${c.label}`) || null;
};

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isoOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function clampLimit(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 500;
  return Math.min(1000, n);
}

/**
 * @param {object} p
 * @param {object[]} p.cards   open cards {id,name,idList,due,start,dueComplete,shortUrl,category,labels:[{name,color}]}
 * @param {object[]} p.lists   [{id,name}]
 * @param {Record<string,object>} [p.pushed]  card id -> {priority, progress, ...} pushed by the Power-Up
 */
export function formatTasks({ cards, lists, pushed, board, now, project, limit, includeDone }) {
  const nowMs = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  const listById = new Map((lists || []).map((l) => [l.id, l]));
  const push = pushed || {};
  const wanted = normalizeName(project || '');
  const all = [];
  for (const c of cards || []) {
    const list = listById.get(c.idList);
    const cat = list ? catOf(list.name) : null;
    const done = !!c.dueComplete || (!!cat && (cat.key === 'completed' || cat.key === 'canceled'));
    const p = push[c.id] || {};
    const progress = num(p.progress);
    const name = c.category ? String(c.category) : '';
    all.push({
      id: c.id,
      name: String(c.name || ''),
      url: String(c.shortUrl || ''),
      list: list ? list.name : '',
      statut: list ? statutLabelForList(list.name) : '',
      priority: num(p.priority),
      progress: progress == null ? null : Math.max(0, Math.min(100, progress)),
      due: isoOrNull(c.due),
      start: isoOrNull(c.start),
      blocked: !done && !!cat && cat.key === 'blocked',
      done,
      labels: (c.labels || []).map((l) => String(l.name || '').trim()).filter(Boolean),
      project: name,
      projectId: '',
    });
  }
  const inProject = wanted ? all.filter((t) => normalizeName(t.project) === wanted || t.projectId === project) : all;
  const open = inProject.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && Date.parse(t.due) < nowMs).length;
  const counts = { open: open.length, overdue, blocked: open.filter((t) => t.blocked).length, done: inProject.length - open.length };
  open.sort((a, b) => {
    const pa = a.priority == null ? -Infinity : a.priority;
    const pb = b.priority == null ? -Infinity : b.priority;
    if (pa !== pb) return pb - pa;
    const da = a.due ? Date.parse(a.due) : Infinity;
    const db = b.due ? Date.parse(b.due) : Infinity;
    return da === db ? 0 : da < db ? -1 : 1;
  });
  const tasks = (includeDone ? open.concat(inProject.filter((t) => t.done)) : open).slice(0, clampLimit(limit));
  return {
    generatedAt: new Date(nowMs).toISOString(),
    board: { id: String((board && board.id) || ''), name: String((board && board.name) || '') },
    counts,
    tasks,
  };
}
