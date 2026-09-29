'use strict';

// End-to-end test of the Worker engine (src/sync.js) against in-memory fakes of the Google
// Sheets / Drive / Trello HTTP APIs, so the whole flow runs without any network.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src');
const load = (f) => import(pathToFileURL(path.join(SRC, f)).href);

/* ── fakes ─────────────────────────────────────────────────────────── */

function colNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRange(range) {
  const [tab, ref] = range.includes('!') ? range.split('!') : [range, ''];
  const m = ref.match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/);
  const c1 = m && m[1] ? colNum(m[1]) : 1;
  const r1 = m && m[2] ? Number(m[2]) : 1;
  const c2 = m && m[3] ? colNum(m[3]) : m && m[1] && !m[3] && m[2] ? c1 : Infinity;
  const r2 = m && m[4] ? Number(m[4]) : m && !m[3] && m[2] ? r1 : Infinity;
  return { tab, c1, r1, c2, r2 };
}

class FakeGoogle {
  constructor() {
    this.tabs = new Map(); // title -> { id, hidden, rows: any[][] }
    this.nextId = 1;
    this.lastUser = { displayName: 'Alex Roy', emailAddress: 'alex@example.com' };
    this.version = 1;
    this.requests = [];
  }
  addTab(title, hidden = false) {
    this.tabs.set(title, { id: this.nextId++, hidden, rows: [] });
  }
  bump() {
    this.version++;
  }
  get(title) {
    return this.tabs.get(title);
  }
  read({ tab, c1, r1, c2, r2 }) {
    const t = this.tabs.get(tab);
    if (!t) throw Object.assign(new Error('no tab ' + tab), { status: 400 });
    const out = [];
    for (let r = r1; r <= Math.min(r2, t.rows.length); r++) {
      const row = (t.rows[r - 1] || []).slice(c1 - 1, c2 === Infinity ? undefined : c2);
      while (row.length && (row[row.length - 1] === '' || row[row.length - 1] === undefined)) row.pop();
      out.push(row);
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }
  write({ tab, c1, r1 }, values) {
    const t = this.tabs.get(tab);
    values.forEach((vals, i) => {
      const r = r1 - 1 + i;
      t.rows[r] = t.rows[r] || [];
      vals.forEach((v, j) => {
        t.rows[r][c1 - 1 + j] = v;
      });
      for (let k = 0; k < t.rows[r].length; k++) if (t.rows[r][k] === undefined) t.rows[r][k] = '';
    });
    this.bump();
  }
  handle(url, init) {
    const u = new URL(url);
    const method = (init && init.method) || 'GET';
    const p = decodeURIComponent(u.pathname);
    if (u.hostname === 'oauth2.googleapis.com') return { access_token: 'tok', expires_in: 3600 };
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (u.hostname === 'www.googleapis.com') return { version: String(this.version), modifiedTime: 'x', lastModifyingUser: this.lastUser };
    const rest = p.replace('/v4/spreadsheets/SHEET', '');
    if (method === 'GET' && rest === '') {
      return {
        sheets: [...this.tabs].map(([title, t]) => ({
          properties: { sheetId: t.id, title, gridProperties: { rowCount: Math.max(1000, t.rows.length) } },
          conditionalFormats: [],
          protectedRanges: [],
        })),
      };
    }
    if (rest === ':batchUpdate') {
      for (const r of body.requests) {
        this.requests.push(r);
        if (r.addSheet) this.addTab(r.addSheet.properties.title, !!r.addSheet.properties.hidden);
        if (r.insertDimension) {
          const t = [...this.tabs.values()].find((x) => x.id === r.insertDimension.range.sheetId);
          const { startIndex, endIndex } = r.insertDimension.range;
          t.rows.splice(startIndex, 0, ...Array.from({ length: endIndex - startIndex }, () => []));
        }
        if (r.deleteDimension) {
          const t = [...this.tabs.values()].find((x) => x.id === r.deleteDimension.range.sheetId);
          const { startIndex, endIndex } = r.deleteDimension.range;
          t.rows.splice(startIndex, endIndex - startIndex);
        }
      }
      this.bump();
      return {};
    }
    if (rest === '/values:batchUpdate') {
      for (const d of body.data) this.write(parseRange(d.range), d.values);
      return {};
    }
    if (rest === '/values:batchGet') {
      return { valueRanges: u.searchParams.getAll('ranges').map((r) => ({ values: this.read(parseRange(r)) })) };
    }
    const m = rest.match(/^\/values\/(.+?)(:append|:clear)?$/);
    if (m) {
      const range = parseRange(m[1]);
      if (m[2] === ':clear') {
        const t = this.tabs.get(range.tab);
        t.rows = [];
        this.bump();
        return {};
      }
      if (m[2] === ':append') {
        const t = this.tabs.get(range.tab);
        body.values.forEach((v) => t.rows.push(v));
        this.bump();
        return {};
      }
      if (method === 'PUT') {
        this.write(range, body.values);
        return {};
      }
      return { values: this.read(range) };
    }
    throw new Error('unhandled sheets call ' + method + ' ' + url);
  }
}

class FakeTrello {
  constructor() {
    this.lists = [
      { id: 'l1', name: 'À faire' },
      { id: 'l2', name: 'En cours' },
      { id: 'l3', name: 'Terminé' },
    ];
    this.cards = [
      { id: 'c1', name: 'Première', desc: '', idList: 'l1', due: null, shortUrl: 'https://trello.com/c/1', pos: 1, customFieldItems: [] },
      { id: 'c2', name: 'Deuxième', desc: '', idList: 'l2', due: null, shortUrl: 'https://trello.com/c/2', pos: 2, customFieldItems: [] },
    ];
    this.writes = [];
    this.n = 10;
  }
  handle(url, init) {
    const u = new URL(url);
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : null;
    const p = u.pathname.replace('/1', '');
    if (p === '/boards/B1/lists') return this.lists;
    if (p === '/boards/B1/customFields') return [{ id: 'f1', name: 'Catégorie', type: 'text' }];
    if (p === '/boards/B1/cards') return this.cards;
    let m = p.match(/^\/cards\/(\w+)\/customField\/f1\/item$/);
    if (m) {
      const c = this.cards.find((x) => x.id === m[1]);
      c.customFieldItems = body.value && body.value.text ? [{ idCustomField: 'f1', value: { text: body.value.text } }] : [];
      this.writes.push(['category', m[1], body.value]);
      return {};
    }
    m = p.match(/^\/cards\/(\w+)$/);
    if (m && method === 'PUT') {
      Object.assign(this.cards.find((x) => x.id === m[1]), body);
      this.writes.push(['update', m[1], body]);
      return {};
    }
    if (p === '/cards' && method === 'POST') {
      const card = { id: 'c' + this.n++, shortUrl: 'https://trello.com/c/new', pos: 99, desc: '', due: null, customFieldItems: [], ...body };
      this.cards.push(card);
      this.writes.push(['create', card.id, body]);
      return card;
    }
    throw new Error('unhandled trello call ' + method + ' ' + url);
  }
}

/* ── tests ─────────────────────────────────────────────────────────── */

describe('trello-sheet-sync engine (fakes)', () => {
  let sync;
  let columns;
  let google;
  let trello;
  let env;
  const realFetch = global.fetch;

  before(async () => {
    sync = await load('sync.js');
    columns = await load('columns.js');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    env = {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@proj.iam.gserviceaccount.com',
      GOOGLE_SERVICE_ACCOUNT_KEY: privateKey,
      GOOGLE_SHEET_ID: 'SHEET',
      TRELLO_KEY: 'k',
      TRELLO_TOKEN: 't',
      TRELLO_BOARD_ID: 'B1',
      TIMEZONE: 'America/Toronto',
    };
  });

  beforeEach(() => {
    google = new FakeGoogle();
    trello = new FakeTrello();
    global.fetch = async (url, init) => {
      const target = String(url);
      try {
        const data = target.includes('trello.com') ? trello.handle(target, init) : google.handle(target, init);
        return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
      } catch (e) {
        return { ok: false, status: e.status || 500, json: async () => ({}), text: async () => String(e.message) };
      }
    };
  });

  const restore = () => {
    global.fetch = realFetch;
  };

  const tasks = () => google.get('Tasks').rows;
  const logs = () => google.get('Logs').rows.slice(1);
  const acts = () => google.get('Activities').rows.slice(1);
  const col = (key) => 1 + columns.DEFAULT_COLUMNS.indexOf(key);

  it('first run creates every tab, lays out the header and fills one row per card', async () => {
    const res = await sync.runSync(env);
    assert.equal(res.sync.cards, 2);
    for (const t of ['Tasks', 'Logs', 'Activities', '_SyncState', '_Config', '_Queue']) assert.ok(google.get(t), t);
    assert.deepEqual(tasks()[0], columns.headerRow(columns.DEFAULT_COLUMNS));
    assert.equal(tasks().length, 3);
    assert.equal(tasks()[1][col('name')], 'Première');
    assert.equal(tasks()[2][col('statut')], '▶️ En cours');
    assert.equal(google.get('_Queue').hidden, true);
  });

  it('a Sheet edit reaches Trello and is logged as an activity by the editor', async () => {
    await sync.runSync(env);
    google.get('Tasks').rows[1][col('name')] = 'Première v2';
    google.bump();
    await sync.runSync(env);
    assert.equal(trello.cards[0].name, 'Première v2');
    const a = acts();
    assert.equal(a.length, 1);
    assert.equal(a[0][1], 'Alex Roy (alex@example.com)');
    assert.equal(a[0][2], 'Google Sheets');
    assert.equal(a[0][5], 'Objet');
    assert.equal(a[0][6], 'Première');
    assert.equal(a[0][7], 'Première v2');
    assert.ok(logs().some((r) => r[1] === 'INFO' && r[2] === 'SHEET_EDIT'));
    restore();
  });

  it('a Trello edit reaches the Sheet', async () => {
    await sync.runSync(env);
    trello.cards[1].name = 'Renommée dans Trello';
    trello.cards[1].idList = 'l3';
    await sync.runSync(env);
    assert.equal(tasks()[2][col('name')], 'Renommée dans Trello');
    assert.equal(tasks()[2][col('statut')], '✅ Terminé');
    restore();
  });

  it('renaming a column header is reverted and logged as CRITICAL, data preserved', async () => {
    await sync.runSync(env);
    google.get('Tasks').rows[0][col('name')] = 'Titre saboté';
    google.bump();
    await sync.runSync(env);
    assert.deepEqual(tasks()[0], columns.headerRow(columns.DEFAULT_COLUMNS));
    assert.equal(tasks()[1][col('name')], 'Première');
    const critical = logs().filter((r) => r[1] === 'CRITICAL');
    assert.equal(critical.length, 1);
    assert.equal(critical[0][2], 'HEADER_TAMPERED');
    assert.match(critical[0][3], /renommée/);
    assert.match(critical[0][3], /restaurées/);
    assert.equal(critical[0][8], 'Alex Roy (alex@example.com)');
    const alerts = await sync.readAlerts(env);
    assert.equal(alerts.length, 1);
    await sync.ackAlerts(env);
    assert.equal((await sync.readAlerts(env)).length, 0);
    restore();
  });

  it('deleting a column is restored and logged, and Trello-backed data comes back', async () => {
    await sync.runSync(env);
    const t = google.get('Tasks');
    t.rows.forEach((r) => r.splice(col('statut'), 1));
    google.bump();
    await sync.runSync(env);
    assert.deepEqual(tasks()[0], columns.headerRow(columns.DEFAULT_COLUMNS));
    assert.equal(tasks()[1][col('statut')], '⚪ Non démarré');
    assert.ok(logs().some((r) => r[1] === 'CRITICAL' && /supprimée/.test(r[3])));
    restore();
  });

  it('a deleted Logs tab is recreated with a warning', async () => {
    await sync.runSync(env);
    google.tabs.delete('Logs');
    google.bump();
    await sync.runSync(env);
    assert.ok(google.get('Logs'));
    assert.ok(logs().some((r) => r[2] === 'TAB_MISSING' && r[1] === 'WARNING'));
    restore();
  });

  it('a deleted Tasks tab is a CRITICAL event and gets rebuilt', async () => {
    await sync.runSync(env);
    google.tabs.delete('Tasks');
    google.bump();
    await sync.runSync(env);
    assert.equal(tasks().length, 3);
    assert.ok(logs().some((r) => r[2] === 'TAB_MISSING' && r[1] === 'CRITICAL'));
    restore();
  });

  it('a new Sheet row creates a card and its id is written back once (no duplicate on the next pass)', async () => {
    await sync.runSync(env);
    google.get('Tasks').rows.push(['', '', 'Créée dans le Sheet', 'En cours', '', '', '', '', '', '', '']);
    google.bump();
    await sync.runSync(env);
    assert.equal(trello.cards.length, 3);
    assert.equal(trello.cards[2].idList, 'l2');
    assert.equal(tasks()[3][0], trello.cards[2].id);
    await sync.runSync(env);
    assert.equal(trello.cards.length, 3);
    restore();
  });

  it('typing over a read-only computed cell is put back', async () => {
    await sync.runSync(env);
    await sync.pushComputed(env, [{ id: 'c1', priority: 7.9, progress: 40, urgency: 'Vite', impact: 8, tier: 'Urgente' }]);
    assert.equal(tasks()[1][col('priority')], 7.9);
    google.get('Tasks').rows[1][col('priority')] = 1;
    google.bump();
    await sync.runSync(env);
    assert.equal(tasks()[1][col('priority')], 7.9);
    assert.ok(logs().some((r) => r[2] === 'READONLY_REVERTED'));
    restore();
  });

  it('Trello webhook activities are queued, attributed to their author, and echoes are ignored', async () => {
    await sync.runSync(env);
    await sync.enqueueActivities(env, [
      { user: 'Marie Tremblay', origin: 'Trello', action: 'modifiée', card: 'Première', cardId: 'c1', field: 'Objet', fieldKey: 'name', before: 'A', after: 'B', ref: 'act1', at: new Date() },
    ]);
    await sync.enqueueActivities(env, [
      { user: 'Marie Tremblay', origin: 'Trello', action: 'modifiée', card: 'Première', cardId: 'c1', field: 'Objet', fieldKey: 'name', before: 'A', after: 'B', ref: 'act1', at: new Date() },
    ]); // Trello retry: duplicate ref
    await sync.runSync(env);
    const a = acts();
    assert.equal(a.length, 1);
    assert.deepEqual([a[0][1], a[0][2], a[0][3]], ['Marie Tremblay', 'Trello', 'modifiée']);
    assert.equal(google.get('_Queue').rows.length, 0);

    // Sheet edit -> Worker writes to Trello -> Trello webhook echo must not be attributed to a Trello user.
    google.get('Tasks').rows[1][col('name')] = 'Edited in sheet';
    google.bump();
    await sync.runSync(env);
    await sync.enqueueActivities(env, [
      { user: 'Token Owner', origin: 'Trello', action: 'modifiée', card: 'Edited in sheet', cardId: 'c1', field: 'Objet', fieldKey: 'name', before: 'Première', after: 'Edited in sheet', ref: 'echo1', at: new Date() },
    ]);
    await sync.runSync(env);
    assert.equal(acts().filter((r) => r[1] === 'Token Owner').length, 0);
    assert.equal(acts().filter((r) => r[2] === 'Google Sheets').length, 1);
    restore();
  });

  it('newest journal entries are on top (row 2)', async () => {
    await sync.runSync(env);
    google.get('Tasks').rows[1][col('name')] = 'One';
    google.bump();
    await sync.runSync(env);
    google.get('Tasks').rows[1][col('name')] = 'Two';
    google.bump();
    await sync.runSync(env);
    assert.equal(acts()[0][7], 'Two');
    assert.equal(acts()[1][7], 'One');
    restore();
  });

  it('log level filters what is written (default INFO hides DEBUG, DEBUG shows sync summaries)', async () => {
    await sync.runSync(env);
    assert.equal(logs().some((r) => r[1] === 'DEBUG'), false);
    await sync.saveSettings(env, { logLevel: 'DEBUG' });
    await sync.runSync(env);
    assert.ok(logs().some((r) => r[2] === 'SYNC_DONE'));
    restore();
  });

  it('skips a pass while another instance holds the lease', async () => {
    await sync.runSync(env);
    const cfgRows = google.get('_Config').rows;
    const lockRow = cfgRows.findIndex((r) => (r || [])[0] === 'lock');
    cfgRows[lockRow][1] = `someone-else|${Date.now() + 60_000}`;
    const res = await sync.runSync(env);
    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'lease');
    cfgRows[lockRow][1] = `someone-else|${Date.now() - 1000}`; // expired lease is taken over
    const res2 = await sync.runSync(env);
    assert.ok(res2.sync);
    restore();
  });

  it('changing the configured columns relayouts without calling it tampering', async () => {
    await sync.runSync(env);
    await sync.saveSettings(env, { columns: ['name', 'statut'] });
    await sync.runSync(env);
    assert.deepEqual(tasks()[0], columns.headerRow(['name', 'statut']));
    assert.equal(tasks()[1][1], 'Première');
    assert.equal(logs().some((r) => r[1] === 'CRITICAL'), false);
    restore();
  });
});
