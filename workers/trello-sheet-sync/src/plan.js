// Pure sync planner: given the current Trello board and the Sheet rows, decides which cells /
// cards to write and what to log. No I/O here so the merge rules can be unit-tested
// (test/sheet-sync-plan.test.js).
//
// Merge rule (same as the Outlook sync): 3-way merge against the baseline saved after the last
// sync; when both sides changed a field to different values, Trello wins and the loss is logged.
// Read-only columns (Échéance, Carte, and the computed Priorité/Progrès/...) are restored when a
// person edits them in the Sheet.

import { COLUMNS } from './columns.js';
import { splitDesc, joinDesc } from './descMeta.js';
import { statutLabelForList, findListForStatut } from './statut.js';

const BOTH_KEYS = Object.keys(COLUMNS).filter((k) => COLUMNS[k].dir === 'both');
const PUSH_KEYS = Object.keys(COLUMNS).filter((k) => COLUMNS[k].dir === 'push');
const TRELLO_KEYS = Object.keys(COLUMNS).filter((k) => COLUMNS[k].dir === 'trello');

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
 * @param {(string|null)[]} p.keys   column keys of the Sheet's data columns (without column A)
 * @param {object[]} p.cards         open Trello cards {id,name,desc,idList,due,shortUrl,pos,category}
 * @param {object[]} p.lists         [{id,name}]
 * @param {any[][]}  p.rows          sheet data rows (row 2 onward); column 0 is the card id
 * @param {Record<string,object>} p.state  baseline per card id
 * @param {string} [p.sheetUser]     who last edited the Sheet (for Activities)
 */
export function planSync({ keys, cards, lists, rows, state, timeZone, sheetUser = 'Google Sheets' }) {
  const out = {
    cellWrites: [],
    appendRows: [],
    deleteRows: [],
    trelloUpdates: [],
    trelloCreates: [],
    newState: {},
    logs: [],
    activities: [],
  };
  const col = (key) => {
    const i = keys.indexOf(key);
    return i < 0 ? -1 : i + 1; // index into a row array (0 is the id)
  };
  const label = (key) => COLUMNS[key].header;
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const seen = new Set();
  // A cleared cell is never a deliberate edit (blank rows, a wiped range): restore it quietly.
  const blank = (v) => (str(v).trim() ? 'WARNING' : 'DEBUG');
  const log = (level, code, message, extra = {}) => out.logs.push({ level, code, message, user: sheetUser, ...extra });

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
      log('INFO', 'CARD_CREATED', `Carte créée depuis le Sheet dans « ${list ? list.name : '?'} »`, { card: name });
      out.activities.push({ user: sheetUser, origin: 'Google Sheets', action: 'créée', card: name, field: label('statut'), after: list ? list.name : '' });
      return;
    }

    if (seen.has(id)) {
      log('WARNING', 'DUPLICATE_ROW', `Ligne ${rowNum} ignorée : l'identifiant de carte apparaît déjà plus haut`, { card: cell('name') });
      return; // duplicated row: first one wins
    }
    seen.add(id);
    const card = cardById.get(id);
    if (!card) {
      out.deleteRows.push(rowNum); // archived / deleted in Trello, or an id typed by hand
      if (state[id]) log('DEBUG', 'ROW_REMOVED', `Ligne retirée : la carte n'est plus ouverte dans Trello`, { card: cell('name') });
      else log('WARNING', 'UNKNOWN_ID', `Ligne ${rowNum} retirée : identifiant de carte inconnu`, { card: cell('name') });
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
      let rejected = false;

      if (m.conflict) {
        log('WARNING', 'CONFLICT', `Modification écrasée : le Sheet avait « ${sheetVal} », Trello a « ${tv[key]} » (Trello gagne)`, {
          card: tv.name,
          field: label(key),
          before: sheetVal,
          after: tv[key],
        });
      }

      if (m.writeTrello) {
        if (key === 'name') {
          if (next.trim()) fields.name = next;
          else {
            next = tv.name;
            rejected = true;
            log(blank(sheetVal), 'NAME_EMPTY', `Le titre ne peut pas être vide : valeur restaurée`, { card: tv.name, field: label(key), before: sheetVal, after: tv.name });
          }
        } else if (key === 'desc') {
          fields.desc = joinDesc(next, splitDesc(card.desc).hidden);
        } else if (key === 'statut') {
          const list = findListForStatut(lists, next);
          if (list) {
            if (list.id !== card.idList) fields.idList = list.id;
            next = statutLabelForList(list.name);
          } else {
            rejected = true;
            log(blank(sheetVal), 'STATUT_REVERTED', `Statut « ${sheetVal} » non valide : valeur restaurée`, { card: tv.name, field: label(key), before: sheetVal, after: tv.statut });
            next = tv.statut;
          }
        } else if (key === 'category') {
          categoryWrite = next;
        }
        if (!rejected) {
          log('INFO', 'SHEET_EDIT', `Modification du Sheet appliquée à Trello`, { card: tv.name, field: label(key), before: tv[key], after: next });
          out.activities.push({ user: sheetUser, origin: 'Google Sheets', action: 'modifiée', card: tv.name, field: label(key), before: tv[key], after: next });
        }
      }
      if (next !== sheetVal) out.cellWrites.push({ row: rowNum, col: col(key) + 1, value: next });
      baseline[key] = next;
    }

    // Read-only columns fed by Trello: put the value back if someone typed over it.
    for (const key of TRELLO_KEYS) {
      if (col(key) < 0) continue;
      const sheetVal = cell(key);
      if (sheetVal !== tv[key]) {
        const known = prev && key in prev ? prev[key] : undefined;
        if (known !== undefined && sheetVal !== known) {
          log('WARNING', 'READONLY_REVERTED', `Colonne en lecture seule modifiée dans le Sheet : valeur restaurée`, { card: tv.name, field: label(key), before: sheetVal, after: tv[key] });
        }
        out.cellWrites.push({ row: rowNum, col: col(key) + 1, value: tv[key] });
      }
      baseline[key] = tv[key];
    }

    // Read-only columns computed by the Power-Up (pushed): restore the last pushed value.
    const pushed = (prev && prev.pushed) || {};
    for (const key of PUSH_KEYS) {
      if (col(key) < 0 || !(key in pushed)) continue;
      if (cell(key) !== str(pushed[key])) {
        log('WARNING', 'READONLY_REVERTED', `Colonne calculée modifiée dans le Sheet : valeur restaurée`, { card: tv.name, field: label(key), before: cell(key), after: str(pushed[key]) });
        out.cellWrites.push({ row: rowNum, col: col(key) + 1, value: pushed[key] });
      }
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
    out.newState[card.id] = { name: tv.name, desc: tv.desc, statut: tv.statut, category: tv.category, due: tv.due, link: tv.link };
  }
  if (missing.length) log('DEBUG', 'ROWS_APPENDED', `${missing.length} carte(s) ajoutée(s) au Sheet`);
  return out;
}
