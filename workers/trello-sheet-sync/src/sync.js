// Sync engine: reads Trello + the Sheet, runs planSync(), applies the result to both sides.
// State lives in hidden tabs of the Sheet itself, so the Worker needs no KV/D1 binding:
//   Tasks (visible) · _SyncState (baseline per card) · _Config (column set) · _SyncLog (conflicts)

import { COLUMNS, DEFAULT_COLUMNS, normalizeColumns, headerRow, keysFromHeader } from './columns.js';
import { planSync } from './plan.js';
import { statutLabelForList } from './statut.js';
import * as sheets from './googleSheets.js';
import * as trello from './trello.js';

const TASKS = 'Tasks';
const STATE = '_SyncState';
const CONFIG = '_Config';
const LOG = '_SyncLog';
const HIDDEN_TABS = [STATE, CONFIG, LOG];

let running = false;
export let lastSync = null;

export async function readColumns(env) {
  try {
    const rows = await sheets.readRange(env, `${CONFIG}!A:B`);
    const row = rows.find((r) => r[0] === 'columns');
    return row ? normalizeColumns(row[1]) : DEFAULT_COLUMNS.slice();
  } catch {
    return DEFAULT_COLUMNS.slice();
  }
}

export async function saveColumns(env, columns) {
  const cols = normalizeColumns(columns);
  await ensureTabs(env);
  await sheets.writeRange(env, `${CONFIG}!A1:B1`, [['columns', cols.join(',')]]);
  return cols;
}

async function ensureTabs(env) {
  const meta = await sheets.getMeta(env);
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const requests = [TASKS, ...HIDDEN_TABS]
    .filter((t) => !have.has(t))
    .map((title) => ({ addSheet: { properties: { title, hidden: title !== TASKS } } }));
  await sheets.batchUpdate(env, requests);
  return requests.length ? sheets.getMeta(env) : meta;
}

/** Rewrites the Tasks grid to the wanted column set, keeping every value that has a column. */
async function relayout(env, columns, oldHeader, oldRows) {
  const oldKeys = keysFromHeader(oldHeader);
  const rows = oldRows
    .filter((r) => String(r[0] ?? '').trim())
    .map((r) => [r[0], ...columns.map((k) => (oldKeys.indexOf(k) >= 0 ? r[oldKeys.indexOf(k) + 1] ?? '' : ''))]);
  await sheets.clearRange(env, `${TASKS}!A:ZZ`);
  await sheets.writeRange(env, `${TASKS}!A1`, [headerRow(columns), ...rows]);
  return rows;
}

async function applyFormatting(env, columns, lists, meta) {
  const tasks = meta.sheets.find((s) => s.properties.title === TASKS);
  if (!tasks) return;
  const sheetId = tasks.properties.sheetId;
  const at = (key) => columns.indexOf(key) + 1; // 0-based sheet column index
  const range = (key) => ({ sheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: at(key), endColumnIndex: at(key) + 1 });
  const req = [];

  for (let i = (tasks.conditionalFormats || []).length - 1; i >= 0; i--) {
    req.push({ deleteConditionalFormatRule: { sheetId, index: i } });
  }
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
  req.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.96 } } },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  });
  req.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
      properties: { hiddenByUser: true },
      fields: 'hiddenByUser',
    },
  });
  for (const [key, px] of [['name', 420], ['desc', 420], ['category', 220], ['statut', 130]]) {
    if (at(key) > 0) {
      req.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: at(key), endIndex: at(key) + 1 },
          properties: { pixelSize: px },
          fields: 'pixelSize',
        },
      });
    }
  }
  for (const [key, max] of [['priority', 10], ['progress', 100]]) {
    if (at(key) > 0) {
      req.push({
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [range(key)],
            gradientRule: {
              minpoint: { color: { red: 1, green: 1, blue: 1 }, type: 'NUMBER', value: '0' },
              maxpoint: { color: { red: 0.34, green: 0.73, blue: 0.55 }, type: 'NUMBER', value: String(max) },
            },
          },
        },
      });
    }
  }
  if (at('statut') > 0) {
    const labels = [...new Set(lists.map((l) => statutLabelForList(l.name)))];
    req.push({
      setDataValidation: {
        range: range('statut'),
        rule: { condition: { type: 'ONE_OF_LIST', values: labels.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
      },
    });
  }
  await sheets.batchUpdate(env, req);
}

async function readState(env) {
  const rows = await sheets.readRange(env, `${STATE}!A:B`);
  const state = {};
  for (const [id, json] of rows) {
    if (!id) continue;
    try {
      state[id] = JSON.parse(json);
    } catch {
      /* skip corrupt row */
    }
  }
  return state;
}

async function writeState(env, state) {
  const rows = Object.entries(state).map(([id, b]) => [id, JSON.stringify(b)]);
  await sheets.clearRange(env, `${STATE}!A:B`);
  if (rows.length) await sheets.writeRange(env, `${STATE}!A1`, rows);
}

export async function runSync(env, { forceFormat = false } = {}) {
  if (running) return { skipped: true };
  running = true;
  try {
    const columns = await readColumns(env);
    let meta = await ensureTabs(env);
    let grid = await sheets.readRange(env, TASKS);
    let header = (grid[0] || []).map(String);
    let rows = grid.slice(1);
    let formatted = false;

    const wanted = headerRow(columns);
    if (JSON.stringify(header) !== JSON.stringify(wanted)) {
      rows = await relayout(env, columns, header, rows);
      header = wanted;
      formatted = true;
    }
    const keys = keysFromHeader(header);

    const [lists, categoryField] = await Promise.all([
      trello.getLists(env),
      columns.includes('category') ? trello.getCategoryField(env, true) : Promise.resolve(null),
    ]);
    const cards = await trello.getCards(env, categoryField && categoryField.id);
    if (formatted || forceFormat) await applyFormatting(env, columns, lists, meta);

    const state = await readState(env);
    const plan = planSync({ keys, cards, lists, rows, state, timeZone: env.TIMEZONE });

    // Sheet rows without an id become new cards.
    for (const c of plan.trelloCreates) {
      const card = await trello.createCard(env, { idList: c.listId, name: c.name, desc: c.desc, pos: 'bottom' });
      if (c.category && categoryField) await trello.setCategory(env, card.id, categoryField.id, c.category);
      plan.cellWrites.push({ row: c.rowNum, col: 1, value: card.id });
      plan.newState[card.id] = c.baseline;
    }
    for (const u of plan.trelloUpdates) {
      if (Object.keys(u.fields).length) await trello.updateCard(env, u.cardId, u.fields);
      if (u.category !== undefined && categoryField) await trello.setCategory(env, u.cardId, categoryField.id, u.category);
    }

    await sheets.writeCells(
      env,
      plan.cellWrites.map((w) => ({ range: `${TASKS}!${sheets.colLetter(w.col)}${w.row}`, value: w.value })),
    );
    const tasksId = meta.sheets.find((s) => s.properties.title === TASKS).properties.sheetId;
    await sheets.batchUpdate(
      env,
      [...plan.deleteRows]
        .sort((a, b) => b - a)
        .map((r) => ({ deleteDimension: { range: { sheetId: tasksId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })),
    );
    await sheets.appendRows(env, `${TASKS}!A1`, plan.appendRows);

    const live = new Set([...cards.map((c) => c.id), ...Object.keys(plan.newState)]);
    const nextState = {};
    for (const [id, b] of Object.entries({ ...state, ...plan.newState })) {
      if (live.has(id)) nextState[id] = b;
    }
    if (Object.keys(plan.newState).length || Object.keys(nextState).length !== Object.keys(state).length) {
      await writeState(env, nextState);
    }
    if (plan.log.length) {
      const ts = new Date().toISOString();
      await sheets.appendRows(env, `${LOG}!A1`, plan.log.map((l) => [ts, l.cardId, l.field, l.trello, l.sheet, l.note]));
    }

    lastSync = {
      at: new Date().toISOString(),
      cards: cards.length,
      created: plan.trelloCreates.length,
      updated: plan.trelloUpdates.length,
      cells: plan.cellWrites.length,
      appended: plan.appendRows.length,
      deleted: plan.deleteRows.length,
    };
    return lastSync;
  } finally {
    running = false;
  }
}

/** Power-Up -> Sheet: writes the columns only the browser can compute (score, progress...). */
export async function pushComputed(env, cards) {
  const columns = await readColumns(env);
  const grid = await sheets.readRange(env, TASKS);
  const keys = keysFromHeader((grid[0] || []).map(String));
  const rowById = new Map();
  grid.slice(1).forEach((r, i) => {
    const id = String(r[0] ?? '').trim();
    if (id && !rowById.has(id)) rowById.set(id, { n: i + 2, r });
  });
  const writes = [];
  for (const card of cards) {
    const hit = rowById.get(card.id);
    if (!hit) continue;
    keys.forEach((key, i) => {
      if (!key || COLUMNS[key].dir !== 'push' || !(key in card)) return;
      const next = card[key] == null ? '' : card[key];
      if (String(hit.r[i + 1] ?? '') !== String(next)) {
        writes.push({ range: `${TASKS}!${sheets.colLetter(i + 2)}${hit.n}`, value: next });
      }
    });
  }
  await sheets.writeCells(env, writes);
  return { written: writes.length, columns };
}
