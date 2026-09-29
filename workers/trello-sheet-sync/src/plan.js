// Pure sync planner: given the current Trello board and the Sheet rows, decides which cells /
// cards to write. No I/O here so the merge rules can be unit-tested (test/sheet-sync-plan.test.js).
//
// Merge rule (same as the Outlook sync): 3-way merge against the baseline saved after the last
// sync; when both sides changed a field to different values, Trello wins and the loss is logged.

import { COLUMNS } from './columns.js';
import { splitDesc, joinDesc } from './descMeta.js';
import { statutLabelForList, findListForStatut } from './statut.js';

const BOTH_KEYS = Object.keys(COLUMNS).filter((k) => COLUMNS[k].dir === 'both');

const str = (v) => (v == null ? '' : String(v).replace(/\r\n/g, '\n'));

export function mergeField(baseline, trello, sheet) {
  const b = str(baseline);
  const t = str(trello);
  const s = str(sheet);
  const tChanged = t !== b;
  const sChanged = s !== b;
  if (!tChanged && !sChanged) return { next: b, writeSheet: false, writeTrello: false };
  if (tChanged && !sChanged) return { next: t, writeSheet: true, writeTrello: false };
  if (!tChanged && sChanged) return { next: s, writeSheet: false, writeTrello: true };
  if (t === s) return { next: t, writeSheet: false, writeTrello: false };
  return { next: t, writeSheet: true, writeTrello: false, conflict: true };
}

/** ISO due date -> YYYY-MM-DD in the board's timezone. */
export function formatDue(iso, timeZone) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Trello-side values of one card, keyed by column key. */
export function trelloValues(card, listById, timeZone) {
  const list = listById.get(card.idList);
  return {
    name: str(card.name),
    desc: splitDesc(card.desc).visible,
    statut: list ? statutLabelForList(list.name) : '',
    category: str(card.category),
    due: formatDue(card.due, timeZone),
    link: str(card.shortUrl),
  };
}

/**
 * @param {object} p
 * @param {(string|null)[]} p.keys   column keys of the actual sheet header (without column A)
 * @param {object[]} p.cards         open Trello cards {id,name,desc,idList,due,shortUrl,pos,category}
 * @param {object[]} p.lists         [{id,name}]
 * @param {any[][]}  p.rows          sheet data rows (row 2 onward); column 0 is the card id
 * @param {Record<string,object>} p.state  baseline per card id
 */
export function planSync({ keys, cards, lists, rows, state, timeZone }) {
  const out = { cellWrites: [], appendRows: [], deleteRows: [], trelloUpdates: [], trelloCreates: [], newState: {}, log: [] };
  const col = (key) => {
    const i = keys.indexOf(key);
    return i < 0 ? -1 : i + 1; // index into a row array (0 is the id)
  };
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const seen = new Set();

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const id = str(row[0]).trim();
    const cell = (key) => (col(key) < 0 ? '' : str(row[col(key)]));

    if (!id) {
      const name = cell('name').trim();
      if (!name) return;
      const list = findListForStatut(lists, cell('statut')) || lists[0] || null;
      const statut = list ? statutLabelForList(list.name) : '';
      out.trelloCreates.push({
        rowNum,
        name,
        desc: cell('desc'),
        category: cell('category'),
        listId: list ? list.id : null,
        baseline: { name, desc: cell('desc'), statut, category: cell('category') },
      });
      if (col('statut') >= 0 && statut !== cell('statut')) {
        out.cellWrites.push({ row: rowNum, col: col('statut') + 1, value: statut });
      }
      return;
    }

    if (seen.has(id)) return; // duplicated row: first one wins
    seen.add(id);
    const card = cardById.get(id);
    if (!card) {
      out.deleteRows.push(rowNum); // archived / deleted in Trello
      return;
    }

    const tv = trelloValues(card, listById, timeZone);
    const prev = state[id];
    const baseline = { ...(prev || {}) };
    const fields = {};
    let categoryWrite;

    for (const key of BOTH_KEYS) {
      if (col(key) < 0) continue;
      const base = prev && key in prev ? prev[key] : tv[key];
      const sheetVal = cell(key);
      const m = mergeField(base, tv[key], sheetVal);
      let next = m.next;
      if (m.conflict) out.log.push({ cardId: id, field: key, trello: tv[key], sheet: sheetVal, note: 'conflit — valeur Trello conservée' });

      if (m.writeTrello) {
        if (key === 'name') {
          if (next.trim()) fields.name = next;
          else next = tv.name;
        } else if (key === 'desc') {
          fields.desc = joinDesc(next, splitDesc(card.desc).hidden);
        } else if (key === 'statut') {
          const list = findListForStatut(lists, next);
          if (list) {
            if (list.id !== card.idList) fields.idList = list.id;
            next = statutLabelForList(list.name);
          } else {
            out.log.push({ cardId: id, field: 'statut', trello: tv.statut, sheet: sheetVal, note: 'statut inconnu — restauré' });
            next = tv.statut;
          }
        } else if (key === 'category') {
          categoryWrite = next;
        }
      }
      if (m.writeSheet || next !== sheetVal) {
        if (next !== sheetVal) out.cellWrites.push({ row: rowNum, col: col(key) + 1, value: next });
      }
      baseline[key] = next;
    }

    for (const key of ['due', 'link']) {
      if (col(key) >= 0 && tv[key] !== cell(key)) out.cellWrites.push({ row: rowNum, col: col(key) + 1, value: tv[key] });
    }

    if (Object.keys(fields).length || categoryWrite !== undefined) {
      out.trelloUpdates.push({ cardId: id, fields, category: categoryWrite });
    }
    if (!prev || JSON.stringify(prev) !== JSON.stringify(baseline)) out.newState[id] = baseline;
  });

  const missing = cards.filter((c) => !seen.has(c.id)).sort((a, b) => (a.pos || 0) - (b.pos || 0));
  for (const card of missing) {
    const tv = trelloValues(card, listById, timeZone);
    out.appendRows.push([card.id, ...keys.map((k) => (k && k in tv ? tv[k] : ''))]);
    out.newState[card.id] = { name: tv.name, desc: tv.desc, statut: tv.statut, category: tv.category };
  }
  return out;
}
