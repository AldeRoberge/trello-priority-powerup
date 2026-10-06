// Sync engine: reads Trello + the Sheet, runs planSync(), applies the result to both sides.
//
// Tabs (all state lives in the Sheet, so the Worker needs no KV/D1):
//   Tasks       visible   the cards
//   Logs        visible   what the engine did / refused to do, by severity (newest first)
//   Activities  visible   who changed what, in Trello or in the Sheet (newest first)
//   _SyncState  hidden    baseline per card (3-way merge reference)
//   _Config     hidden    settings, layout, lease lock, drive version, recent writes
//   _Queue      hidden    Trello webhook activities waiting to be flushed
//
// No collisions: one lease (a lock cell verified after writing) serializes passes across
// Worker instances; every pass re-reads the Sheet right before writing and skips any cell a person
// changed in the meantime (the next pass merges it properly); a pass that saw a collision or a
// request that arrived while it ran simply runs again.

import { COLUMNS, DEFAULT_COLUMNS, normalizeColumns, headerRow } from './columns.js';
import { planSync } from './plan.js';
import { statutLabelForList } from './statut.js';
import { checkHeader, describeChange } from './integrity.js';
import { LOG_HEADERS, ACTIVITY_HEADERS, LEVELS, createJournal, parseLevel, logRow, activityRow, stamp } from './journal.js';
import { isEcho } from './webhook.js';
import * as sheets from './googleSheets.js';
import * as trello from './trello.js';

export const TASKS = 'Tasks';
export const LOGS = 'Logs';
export const ACTIVITIES = 'Activities';
const STATE = '_SyncState';
const CONFIG = '_Config';
const QUEUE = '_Queue';
const ALL_TABS = [TASKS, LOGS, ACTIVITIES, STATE, CONFIG, QUEUE];
const HIDDEN_TABS = [STATE, CONFIG, QUEUE];
const CFG_KEYS = ['columns', 'logLevel', 'layout', 'lock', 'dirty', 'driveVersion', 'recentWrites', 'alertsAckAt', 'sheetTheme'];
const MAX_JOURNAL_ROWS = 3000;
const LEASE_MS = 90_000;
const MAX_PASSES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v) => (v == null ? '' : String(v));

let running = false;
export let lastSync = null;

/* ── _Config ─────────────────────────────────────────────────────── */

export async function loadConfig(env) {
  let rows = [];
  try {
    rows = await sheets.readRange(env, `${CONFIG}!A:B`);
  } catch {
    /* tab missing yet: ensureTabs creates it */
  }
  const data = {};
  for (const r of rows) if (CFG_KEYS.includes(r[0])) data[r[0]] = r[1] == null ? '' : String(r[1]);
  return data;
}

export async function setConfig(env, key, value) {
  const row = CFG_KEYS.indexOf(key) + 1;
  await sheets.writeRange(env, `${CONFIG}!A${row}:B${row}`, [[key, value]]);
}

export async function readColumns(env) {
  return normalizeColumns((await loadConfig(env)).columns || DEFAULT_COLUMNS);
}

export async function saveSettings(env, { columns, logLevel, sheetTheme }) {
  await ensureTabs(env);
  const out = {};
  if (columns) {
    out.columns = normalizeColumns(columns);
    await setConfig(env, 'columns', out.columns.join(','));
  }
  if (logLevel) {
    out.logLevel = parseLevel(logLevel);
    await setConfig(env, 'logLevel', out.logLevel);
  }
  if (sheetTheme) {
    out.sheetTheme = parseTheme(sheetTheme);
    await setConfig(env, 'sheetTheme', out.sheetTheme);
  }
  return out;
}

/* ── Lease (cross-instance lock) ─────────────────────────────────── */

async function acquireLease(env) {
  const boot = await ensureTabs(env); // every tab (incl. _Config) must exist before we can lock
  const token = crypto.randomUUID();
  const before = await loadConfig(env);
  const [holder, expires] = str(before.lock).split('|');
  if (holder && Number(expires) > Date.now()) return null;
  await setConfig(env, 'lock', `${token}|${Date.now() + LEASE_MS}`);
  await sleep(250);
  const after = await loadConfig(env); // verify we really own it (another instance may have raced us)
  return str(after.lock).startsWith(token) ? { token, cfg: after, boot } : null;
}

async function releaseLease(env) {
  try {
    await setConfig(env, 'lock', '');
  } catch {
    /* the lease expires on its own */
  }
}

async function markDirty(env) {
  try {
    await setConfig(env, 'dirty', String(Date.now()));
  } catch {
    /* best effort */
  }
}

/* ── Tabs, layout, formatting ────────────────────────────────────── */

async function ensureTabs(env) {
  let meta = await sheets.getMeta(env);
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = ALL_TABS.filter((t) => !have.has(t));
  if (missing.length) {
    await sheets.batchUpdate(
      env,
      missing.map((title) => ({ addSheet: { properties: { title, hidden: HIDDEN_TABS.includes(title) } } })),
    );
    meta = await sheets.getMeta(env);
    if (missing.includes(LOGS)) await sheets.writeRange(env, `${LOGS}!A1`, [LOG_HEADERS]);
    if (missing.includes(ACTIVITIES)) await sheets.writeRange(env, `${ACTIVITIES}!A1`, [ACTIVITY_HEADERS]);
  }
  return { meta, missing };
}

const sheetOf = (meta, title) => meta.sheets.find((s) => s.properties.title === title);
const idOf = (meta, title) => (sheetOf(meta, title) ? sheetOf(meta, title).properties.sheetId : null);

/** Rewrites the Tasks grid to the configured columns, carrying each value to its new column. */
async function relayout(env, columns, oldKeys, oldRows) {
  const rows = oldRows
    .filter((r) => str(r[0]).trim())
    .map((r) => [r[0], ...columns.map((k) => (oldKeys.indexOf(k) >= 0 ? r[oldKeys.indexOf(k) + 1] ?? '' : ''))]);
  await sheets.clearRange(env, `${TASKS}!A:ZZ`);
  await sheets.writeRange(env, `${TASKS}!A1`, [headerRow(columns), ...rows]);
  return rows;
}

const rgb = (r, g, b) => ({ red: r, green: g, blue: b });
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export const parseTheme = (v) => (str(v).toLowerCase() === 'dark' ? 'dark' : 'light');

// The dark palette is the Power-Up's own (components/shared/trello-theme.css, Trello dark mode).
const PALETTES = {
  light: {
    font: 'Arial',
    bg: hex('#ffffff'),
    text: hex('#000000'),
    headers: { tasks: rgb(0.95, 0.95, 0.96), logs: rgb(0.9, 0.93, 0.98), acts: rgb(0.9, 0.96, 0.92) },
    gradient: [rgb(1, 1, 1), rgb(0.34, 0.73, 0.55)],
    levels: {
      CRITICAL: [rgb(0.75, 0.12, 0.1), rgb(1, 1, 1)],
      ERROR: [rgb(0.96, 0.8, 0.78), rgb(0.55, 0.08, 0.05)],
      WARNING: [rgb(1, 0.93, 0.7), rgb(0.5, 0.33, 0)],
      INFO: [rgb(0.85, 0.92, 1), rgb(0.05, 0.3, 0.7)],
      DEBUG: [rgb(0.95, 0.95, 0.95), rgb(0.4, 0.4, 0.4)],
      VERBOSE: [rgb(1, 1, 1), rgb(0.6, 0.6, 0.6)],
    },
  },
  dark: {
    font: 'Lexend',
    bg: hex('#1d2125'),
    text: hex('#f7f8f9'),
    line: hex('#38414a'),
    tab: hex('#579dff'),
    headers: { tasks: hex('#2c333a'), logs: hex('#2c333a'), acts: hex('#2c333a') },
    gradient: [hex('#22272b'), hex('#1f7a68')],
    levels: {
      CRITICAL: [hex('#c9372c'), hex('#ffffff')],
      ERROR: [hex('#5d1f1a'), hex('#fd9891')],
      WARNING: [hex('#533f04'), hex('#f5cd47')],
      INFO: [hex('#09326c'), hex('#85b8ff')],
      DEBUG: [hex('#2c333a'), hex('#9fadbc')],
      VERBOSE: [hex('#1d2125'), hex('#8c9bab')],
    },
  },
};

async function applyFormatting(env, columns, lists, meta, themeName) {
  const pal = PALETTES[parseTheme(themeName)];
  const dark = pal === PALETTES.dark;
  const req = [];
  const tasks = sheetOf(meta, TASKS);
  const logs = sheetOf(meta, LOGS);
  const acts = sheetOf(meta, ACTIVITIES);
  const baseText = { foregroundColor: pal.text, fontFamily: pal.font, fontSize: 10 };
  const headerFmt = (sheetId, color) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { ...baseText, bold: true }, backgroundColor: color, verticalAlignment: 'MIDDLE' } },
      fields: 'userEnteredFormat(textFormat,backgroundColor,verticalAlignment)',
    },
  });
  // Whole tab (rows and columns beyond the data too): background, text color, font, row lines.
  const baseFmt = (sheetId) => [
    {
      repeatCell: {
        range: { sheetId },
        cell: { userEnteredFormat: { backgroundColor: pal.bg, textFormat: baseText, verticalAlignment: 'MIDDLE' } },
        fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor,textFormat.fontFamily,textFormat.fontSize,verticalAlignment)',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { hideGridlines: dark }, ...(dark ? { tabColorStyle: { rgbColor: pal.tab } } : {}) },
        fields: 'gridProperties.hideGridlines,tabColorStyle', // light: tabColorStyle omitted = cleared
      },
    },
    {
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 6000, startColumnIndex: 0, endColumnIndex: 26 },
        ...(dark
          ? { innerHorizontal: { style: 'SOLID', colorStyle: { rgbColor: pal.line } }, bottom: { style: 'SOLID', colorStyle: { rgbColor: pal.line } } }
          : { innerHorizontal: { style: 'NONE' }, bottom: { style: 'NONE' } }),
      },
    },
  ];
  const freeze = (sheetId) => ({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
  const width = (sheetId, col, px) => ({
    updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
  });
  // Old conditional formats / protections are rebuilt from scratch.
  for (const s of meta.sheets) {
    for (let i = (s.conditionalFormats || []).length - 1; i >= 0; i--) req.push({ deleteConditionalFormatRule: { sheetId: s.properties.sheetId, index: i } });
    for (const p of s.protectedRanges || []) req.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } });
  }

  if (tasks) {
    const sheetId = tasks.properties.sheetId;
    const at = (key) => columns.indexOf(key) + 1; // 0-based sheet column index
    const range = (key) => ({ sheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: at(key), endColumnIndex: at(key) + 1 });
    req.push(...baseFmt(sheetId), freeze(sheetId), headerFmt(sheetId, pal.headers.tasks));
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
    for (const [key, px] of [['name', 420], ['desc', 420], ['category', 220], ['statut', 130]]) if (at(key) > 0) req.push(width(sheetId, at(key), px));
    for (const [key, max] of [['priority', 10], ['progress', 100]]) {
      if (at(key) > 0) {
        req.push({
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [range(key)],
              gradientRule: {
                minpoint: { color: pal.gradient[0], type: 'NUMBER', value: '0' },
                maxpoint: { color: pal.gradient[1], type: 'NUMBER', value: String(max) },
              },
            },
          },
        });
      }
    }
    if (at('statut') > 0) {
      // Completed tasks (Statut "✅ Terminé"): whole row grayed out and not bold.
      let n = at('statut') + 1;
      let letter = '';
      for (; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
      req.push({
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: 1, endColumnIndex: columns.length + 1 }],
            booleanRule: {
              condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=ISNUMBER(SEARCH("✅",$${letter}2))` }] },
              format: { textFormat: { foregroundColor: dark ? hex('#8c9bab') : rgb(0.6, 0.6, 0.6), bold: false } },
            },
          },
        },
      });
      const labels = [...new Set(lists.map((l) => statutLabelForList(l.name)))];
      req.push({
        setDataValidation: {
          range: range('statut'),
          rule: { condition: { type: 'ONE_OF_LIST', values: labels.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
        },
      });
    }
    // Native "you are about to edit a protected range" warning on everything people must not touch.
    req.push({ addProtectedRange: { protectedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, warningOnly: true, description: 'En-têtes gérés par la synchronisation : ne pas modifier.' } } });
    req.push({ addProtectedRange: { protectedRange: { range: { sheetId, startColumnIndex: 0, endColumnIndex: 1 }, warningOnly: true, description: 'Identifiant de carte : ne pas modifier.' } } });
    columns.forEach((key, i) => {
      if (COLUMNS[key].dir === 'both') {
        // Editable, but a stray keystroke changes the real Trello card: ask first.
        req.push({
          addProtectedRange: {
            protectedRange: { range: { sheetId, startRowIndex: 1, startColumnIndex: i + 1, endColumnIndex: i + 2 }, warningOnly: true, description: `Modifier « ${COLUMNS[key].header} » modifie aussi la carte Trello. Continuer seulement si c’est voulu.` },
          },
        });
        return;
      }
      req.push({
        addProtectedRange: {
          protectedRange: { range: { sheetId, startRowIndex: 1, startColumnIndex: i + 1, endColumnIndex: i + 2 }, warningOnly: true, description: `« ${COLUMNS[key].header} » est en lecture seule.` },
        },
      });
    });
  }

  const levelRule = (sheetId, text, bold, italic) => ({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 6000, startColumnIndex: 1, endColumnIndex: 2 }],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: text }] },
          format: { backgroundColor: pal.levels[text][0], textFormat: { foregroundColor: pal.levels[text][1], bold, italic } },
        },
      },
    },
  });
  if (logs) {
    const id = logs.properties.sheetId;
    req.push(...baseFmt(id), freeze(id), headerFmt(id, pal.headers.logs));
    [[0, 130], [1, 90], [2, 160], [3, 520], [4, 220], [5, 110], [6, 220], [7, 220], [8, 150]].forEach(([c, px]) => req.push(width(id, c, px)));
    req.push(
      levelRule(id, 'CRITICAL', true, false),
      levelRule(id, 'ERROR', true, false),
      levelRule(id, 'WARNING', true, false),
      levelRule(id, 'INFO', false, false),
      levelRule(id, 'DEBUG', false, false),
      levelRule(id, 'VERBOSE', false, true),
    );
    req.push({ addProtectedRange: { protectedRange: { range: { sheetId: id }, warningOnly: true, description: 'Journal généré automatiquement.' } } });
  }
  if (acts) {
    const id = acts.properties.sheetId;
    req.push(...baseFmt(id), freeze(id), headerFmt(id, pal.headers.acts));
    [[0, 130], [1, 170], [2, 110], [3, 130], [4, 260], [5, 110], [6, 240], [7, 240], [8, 90]].forEach(([c, px]) => req.push(width(id, c, px)));
    req.push({ addProtectedRange: { protectedRange: { range: { sheetId: id }, warningOnly: true, description: "Historique généré automatiquement." } } });
  }
  await sheets.batchUpdate(env, req);
}

/* ── State + queue ───────────────────────────────────────────────── */

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

/** Trello webhook activities waiting to be written (appended atomically by the webhook handler). */
export async function enqueueActivities(env, activities) {
  if (!activities.length) return;
  await sheets.appendRows(env, `${QUEUE}!A1`, activities.map((a) => [JSON.stringify({ ...a, at: a.at instanceof Date ? a.at.toISOString() : a.at })]));
}

async function drainQueue(env, journal, recentWrites) {
  const rows = await sheets.readRange(env, `${QUEUE}!A:A`);
  if (!rows.length) return 0;
  const recent = await sheets.readRange(env, `${ACTIVITIES}!I2:I200`).catch(() => []);
  const seen = new Set(recent.map((r) => str(r[0])).filter(Boolean));
  for (const [json] of rows) {
    let a;
    try {
      a = JSON.parse(json);
    } catch {
      continue;
    }
    if (a.ref && seen.has(a.ref)) continue; // Trello retried the webhook
    seen.add(a.ref);
    if (isEcho(a, recentWrites, Date.parse(a.at) || Date.now())) {
      journal.log('VERBOSE', 'ECHO_IGNORED', 'Activité Trello ignorée : écho d’une modification du Sheet', { card: a.card, field: a.field });
      continue;
    }
    journal.activities.push({ ...a, at: new Date(a.at) });
  }
  return rows.length;
}

async function dropQueueRows(env, meta, count) {
  const id = idOf(meta, QUEUE);
  if (!count || id == null) return;
  await sheets.batchUpdate(env, [{ deleteDimension: { range: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: count } } }]);
}

function parseRecent(value, nowMs) {
  try {
    return (JSON.parse(value || '[]') || []).filter((w) => nowMs - w.at < 120_000);
  } catch {
    return [];
  }
}

/* ── One pass ────────────────────────────────────────────────────── */

function sheetUserFrom(env, driveMeta) {
  const u = driveMeta && driveMeta.lastModifyingUser;
  if (!u) return 'Google Sheets';
  if (u.emailAddress && u.emailAddress === env.GOOGLE_SERVICE_ACCOUNT_EMAIL) return 'Google Sheets (synchronisation)';
  return u.displayName ? (u.emailAddress ? `${u.displayName} (${u.emailAddress})` : u.displayName) : u.emailAddress || 'Google Sheets';
}

async function flushJournal(env, meta, journal, tz) {
  const logsId = idOf(meta, LOGS);
  const actsId = idOf(meta, ACTIVITIES);
  // Newest first: reverse so the latest entry ends up on row 2.
  if (journal.logs.length && logsId != null) {
    await sheets.prependRows(env, logsId, LOGS, journal.logs.slice().reverse().map((e) => logRow(e, tz)));
  }
  if (journal.activities.length && actsId != null) {
    const sorted = journal.activities.slice().sort((a, b) => a.at - b.at);
    await sheets.prependRows(env, actsId, ACTIVITIES, sorted.map((a) => activityRow(a, tz)));
  }
  // Keep the journals bounded.
  const trims = [];
  for (const [title, added] of [[LOGS, journal.logs.length], [ACTIVITIES, journal.activities.length]]) {
    const s = sheetOf(meta, title);
    if (!s || !added) continue;
    const rowCount = (s.properties.gridProperties && s.properties.gridProperties.rowCount) || 0;
    if (rowCount + added > MAX_JOURNAL_ROWS + 500) {
      trims.push({ deleteDimension: { range: { sheetId: s.properties.sheetId, dimension: 'ROWS', startIndex: MAX_JOURNAL_ROWS, endIndex: rowCount + added } } });
    }
  }
  await sheets.batchUpdate(env, trims);
}

async function syncOnce(env, cfg, opts, journal, boot) {
  const t0 = Date.now();
  const tz = env.TIMEZONE;
  const columns = normalizeColumns(cfg.columns || DEFAULT_COLUMNS);
  const layout = cfg.layout ? JSON.parse(cfg.layout) : null;
  const wanted = headerRow(columns);

  const { meta, missing } = boot || (await ensureTabs(env));
  let needFormat = !!opts.forceFormat || missing.length > 0;
  if (missing.length) {
    if (!layout) journal.log('INFO', 'SETUP', `Onglets créés : ${missing.join(', ')}`);
    else {
      for (const tab of missing) {
        journal.log(tab === TASKS ? 'CRITICAL' : 'WARNING', 'TAB_MISSING', `L'onglet « ${tab} » avait disparu (supprimé ou renommé) : il a été recréé`);
      }
    }
  }

  const driveMeta = opts.driveMeta || (await sheets.getFileMeta(env).catch(() => null));
  const sheetUser = sheetUserFrom(env, driveMeta);

  let grid = await sheets.readRange(env, TASKS);
  let header = (grid[0] || []).map(String);
  let rows = grid.slice(1);

  const check = checkHeader(header, layout, wanted);
  if (check.tampered) {
    for (const c of check.changes) {
      journal.log('CRITICAL', 'HEADER_TAMPERED', `Modification non permise : ${describeChange(c)}. Les colonnes ont été restaurées.`, {
        field: c.from || c.to,
        before: c.to,
        after: c.from,
        user: sheetUser,
      });
    }
  }
  if (check.relayout || !layout) {
    rows = await relayout(env, columns, check.keys, rows);
    await setConfig(env, 'layout', JSON.stringify(wanted));
    needFormat = true;
  }

  const [lists, categoryField] = await Promise.all([
    trello.getLists(env),
    columns.includes('category') ? trello.getCategoryField(env, true) : Promise.resolve(null),
  ]);
  const cards = await trello.getCards(env, categoryField && categoryField.id);
  if (needFormat) await applyFormatting(env, columns, lists, meta, cfg.sheetTheme);

  const state = await readState(env);
  const plan = planSync({ keys: columns, cards, lists, rows, state, timeZone: tz, sheetUser });
  for (const l of plan.logs) journal.log(l.level, l.code, l.message, l);
  plan.activities.forEach((a) => journal.activity(a));

  // Collision guard: only write cells that are still exactly as we read them.
  let collisions = 0;
  const fresh = await sheets.readRange(env, TASKS);
  const relayouted = check.relayout || !layout; // grid rebuilt in this pass: `rows` is the snapshot
  const snapshot = relayouted ? [wanted, ...rows] : grid;
  const cellNow = (r, c) => str((fresh[r - 1] || [])[c - 1]);
  const cellSnap = (r, c) => str((snapshot[r - 1] || [])[c - 1]);
  const cellWrites = plan.cellWrites.filter((w) => {
    const ok = w.col === 1 || cellNow(w.row, w.col) === cellSnap(w.row, w.col);
    if (!ok) collisions++;
    return ok;
  });
  const deleteRows = plan.deleteRows.filter((r) => {
    const ok = str((fresh[r - 1] || [])[0]) === str((snapshot[r - 1] || [])[0]);
    if (!ok) collisions++;
    return ok;
  });
  const creates = plan.trelloCreates.filter((c) => {
    const ok = str((fresh[c.rowNum - 1] || [])[0]).trim() === '' && str((fresh[c.rowNum - 1] || [])[columns.indexOf('name') + 1]).trim() === c.name;
    if (!ok) collisions++;
    return ok;
  });
  if (collisions) journal.log('DEBUG', 'COLLISION_AVOIDED', `${collisions} écriture(s) reportée(s) : le Sheet a changé pendant la synchronisation`);

  const nowMs = Date.now();
  const recent = parseRecent(cfg.recentWrites, nowMs);
  const writes = [];

  // Sheet rows without an id become new cards; the id goes back to the row right away.
  for (const c of creates) {
    const card = await trello.createCard(env, { idList: c.listId, name: c.name, desc: c.desc, pos: 'bottom' });
    await sheets.writeCells(env, [{ range: `${TASKS}!A${c.rowNum}`, value: card.id }]);
    if (c.category && categoryField) await trello.setCategory(env, card.id, categoryField.id, c.category);
    plan.newState[card.id] = c.baseline;
    recent.push({ cardId: card.id, field: '*', at: nowMs });
  }
  for (const u of plan.trelloUpdates) {
    if (Object.keys(u.fields).length) await trello.updateCard(env, u.cardId, u.fields);
    if (u.category !== undefined && categoryField) await trello.setCategory(env, u.cardId, categoryField.id, u.category);
    if ('name' in u.fields) recent.push({ cardId: u.cardId, field: 'name', at: nowMs });
    if ('desc' in u.fields) recent.push({ cardId: u.cardId, field: 'desc', at: nowMs });
    if ('idList' in u.fields) recent.push({ cardId: u.cardId, field: 'statut', at: nowMs });
    if (u.category !== undefined) recent.push({ cardId: u.cardId, field: 'category', at: nowMs });
  }
  if (recent.length) await setConfig(env, 'recentWrites', JSON.stringify(recent));

  await sheets.writeCells(env, cellWrites.filter((w) => w.col !== 1).map((w) => ({ range: `${TASKS}!${sheets.colLetter(w.col)}${w.row}`, value: w.value })));
  const tasksId = idOf(meta, TASKS);
  await sheets.batchUpdate(
    env,
    [...deleteRows].sort((a, b) => b - a).map((r) => ({ deleteDimension: { range: { sheetId: tasksId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } })),
  );
  await sheets.appendRowsToSheet(env, tasksId, plan.appendRows); // always below the last card, never above the header

  const live = new Set([...cards.map((c) => c.id), ...Object.keys(plan.newState)]);
  const nextState = {};
  for (const [id, b] of Object.entries({ ...state, ...plan.newState })) if (live.has(id)) nextState[id] = b;
  if (Object.keys(plan.newState).length || Object.keys(nextState).length !== Object.keys(state).length) await writeState(env, nextState);

  const drained = await drainQueue(env, journal, recent);

  const summary = {
    at: new Date().toISOString(),
    ms: Date.now() - t0,
    cards: cards.length,
    created: creates.length,
    updated: plan.trelloUpdates.length,
    cells: cellWrites.length,
    appended: plan.appendRows.length,
    deleted: deleteRows.length,
    collisions,
  };
  journal.log('DEBUG', 'SYNC_DONE', `Synchronisation : ${summary.cards} cartes, ${summary.updated} mises à jour Trello, ${summary.cells} cellules, ${summary.ms} ms`);
  if (journal.wants('VERBOSE')) journal.log('VERBOSE', 'SYNC_PLAN', JSON.stringify({ ...summary, at: undefined }));

  await flushJournal(env, meta, journal, tz);
  await dropQueueRows(env, meta, drained);
  if (driveMeta && driveMeta.version != null) await setConfig(env, 'driveVersion', String(driveMeta.version));
  return { summary, retry: collisions > 0 };
}

/* ── Public entry points ─────────────────────────────────────────── */

export async function runSync(env, opts = {}) {
  if (running) {
    await markDirty(env);
    return { skipped: true, reason: 'busy' };
  }
  running = true;
  let lease = null;
  try {
    lease = await acquireLease(env);
    if (!lease) {
      await markDirty(env);
      return { skipped: true, reason: 'lease' };
    }
    let cfg = lease.cfg;
    let result = null;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const startedAt = Date.now();
      const journal = createJournal({ level: parseLevel(cfg.logLevel) });
      try {
        result = await syncOnce(env, cfg, pass === 0 ? opts : {}, journal, pass === 0 ? lease.boot : null);
      } catch (err) {
        journal.log('ERROR', 'SYNC_FAILED', String(err && err.message ? err.message : err));
        try {
          const { meta } = await ensureTabs(env);
          await flushJournal(env, meta, journal, env.TIMEZONE);
        } catch {
          /* nothing more we can do */
        }
        throw err;
      }
      cfg = await loadConfig(env);
      const dirtyAt = Number(cfg.dirty || 0);
      if (!result.retry && !(dirtyAt > startedAt)) break;
    }
    lastSync = result.summary;
    return { sync: result.summary };
  } finally {
    if (lease) await releaseLease(env);
    running = false;
  }
}

/** Power-Up -> Sheet: writes the columns only the browser can compute (score, progress...). */
export async function pushComputed(env, pushedCards) {
  const lease = await acquireLease(env);
  if (!lease) {
    await markDirty(env);
    return { written: 0, busy: true };
  }
  try {
    const columns = normalizeColumns(lease.cfg.columns || DEFAULT_COLUMNS);
    const grid = await sheets.readRange(env, TASKS);
    const header = (grid[0] || []).map(String);
    if (JSON.stringify(header) !== JSON.stringify(headerRow(columns))) return { written: 0, busy: true }; // layout is being repaired
    const rowById = new Map();
    grid.slice(1).forEach((r, i) => {
      const id = str(r[0]).trim();
      if (id && !rowById.has(id)) rowById.set(id, { n: i + 2, r });
    });
    const state = await readState(env);
    const writes = [];
    for (const card of pushedCards) {
      const hit = rowById.get(card.id);
      if (!hit) continue;
      const entry = state[card.id] || (state[card.id] = {});
      entry.pushed = entry.pushed || {};
      columns.forEach((key, i) => {
        if (COLUMNS[key].dir !== 'push' || !(key in card)) return;
        const next = card[key] == null ? '' : card[key];
        entry.pushed[key] = next;
        if (str(hit.r[i + 1]) !== str(next)) writes.push({ range: `${TASKS}!${sheets.colLetter(i + 2)}${hit.n}`, value: next });
      });
    }
    await sheets.writeCells(env, writes);
    await writeState(env, state);
    return { written: writes.length, columns };
  } finally {
    await releaseLease(env);
  }
}

/**
 * Cron body: catches up once, then watches the file's Drive version for about a minute so a Sheet
 * edit reaches Trello within seconds instead of waiting for the next cron tick.
 */
export async function watchSheet(env, { seconds = 50, intervalMs = 6000 } = {}) {
  const end = Date.now() + seconds * 1000;
  await runSync(env);
  let known = (await loadConfig(env)).driveVersion;
  while (Date.now() + intervalMs < end) {
    await sleep(intervalMs);
    let meta;
    try {
      meta = await sheets.getFileMeta(env);
    } catch {
      continue;
    }
    if (String(meta.version) !== String(known)) {
      await runSync(env, { driveMeta: meta });
      known = meta.version;
    }
  }
}

/* ── Reading logs / activities for the Power-Up ─────────────────── */

function toObjects(rows, headers) {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, str(r[i])])));
}

export async function readLogs(env, { limit = 200, level = 'VERBOSE' } = {}) {
  const min = LEVELS[parseLevel(level, 'VERBOSE')];
  const rows = await sheets.readRange(env, `${LOGS}!A2:I${Math.max(2, limit + 1)}`).catch(() => []);
  return toObjects(rows, LOG_HEADERS).filter((r) => LEVELS[r['Niveau']] >= min);
}

export async function readActivities(env, { limit = 200 } = {}) {
  const rows = await sheets.readRange(env, `${ACTIVITIES}!A2:I${Math.max(2, limit + 1)}`).catch(() => []);
  return toObjects(rows, ACTIVITY_HEADERS);
}

/** CRITICAL log entries nobody has acknowledged yet. */
export async function readAlerts(env) {
  const cfg = await loadConfig(env);
  const since = str(cfg.alertsAckAt);
  const logs = await readLogs(env, { limit: 100, level: 'CRITICAL' });
  return logs.filter((l) => l['Niveau'] === 'CRITICAL' && l['Horodatage'] > since);
}

export async function ackAlerts(env) {
  await setConfig(env, 'alertsAckAt', stamp(new Date(), env.TIMEZONE));
}
