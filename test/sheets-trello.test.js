'use strict';

// The Sheets sync secret is private to each member, but the Worker URL is shared by the whole board. Any member can
// change the shared URL, so a member's secret must only ever go to the URL it was issued for.

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const GOOD = 'https://sync.example.com';
const EVIL = 'https://evil.example.org';
const SECRET = 's3cret-value';

const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const codeFor = (workerUrl, secret) => b64({ v: 1, workerUrl, secret, sheetUrl: 'https://docs.google.com/spreadsheets/d/x' });

describe('SheetsTrello: the secret goes only to the URL it was issued for', () => {
  let ST;
  let store; // `${scope}/${visibility}/${key}` -> value
  let fetched;
  let t;

  before(() => {
    loadComponent('table/table-model.js');
    loadComponent('sheets/sheets-trello.js');
    ST = global.SheetsTrello;
    assert.ok(ST);
  });

  beforeEach(() => {
    store = {};
    fetched = [];
    t = {
      get: async (scope, vis, key) => (`${scope}/${vis}/${key}` in store ? store[`${scope}/${vis}/${key}`] : undefined),
      set: async (scope, vis, key, value) => { store[`${scope}/${vis}/${key}`] = value; },
    };
    global.fetch = async (url, init) => {
      fetched.push({ url, secret: init && init.headers && init.headers['x-sync-secret'] });
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    };
  });

  const sharedKey = 'board/shared/googleSheetsSettings';
  const secretKey = 'board/private/googleSheetsSecret';
  const boundKey = 'board/private/googleSheetsSecretUrl';

  it('connecting with a code ties the secret to that URL, and calls go to it with the secret', async () => {
    const res = await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    assert.equal(res.ok, true);
    assert.equal(store[secretKey], SECRET);
    assert.equal(store[boundKey], GOOD);
    const settings = await ST.getSettings(t);
    assert.equal(ST.isConnected(settings), true);
    const call = await ST.info(settings);
    assert.equal(call.ok, true);
    assert.deepEqual(fetched, [{ url: GOOD + '/info', secret: SECRET }]);
  });

  it('the secret and its tie never go into the shared settings', async () => {
    await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    const shared = store[sharedKey];
    assert.equal(shared.workerUrl, GOOD);
    assert.equal('secret' in shared, false);
    assert.equal('secretUrl' in shared, false);
    assert.equal('urlChanged' in shared, false);
  });

  it('another member changes the shared URL: this member is not connected, and nothing is sent', async () => {
    await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    store[sharedKey] = Object.assign({}, store[sharedKey], { workerUrl: EVIL }); // the attacker's write
    const settings = await ST.getSettings(t);
    assert.equal(settings.urlChanged, true);
    assert.equal(ST.isConnected(settings), false);
    const res = await ST.info(settings);
    assert.deepEqual({ ok: res.ok, reason: res.reason }, { ok: false, reason: 'url-changed' });
    assert.equal(fetched.length, 0, 'the secret was not sent anywhere');
  });

  it('saving other settings after the change does not drag the secret to the new URL', async () => {
    await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    store[sharedKey] = Object.assign({}, store[sharedKey], { workerUrl: EVIL });
    const settings = await ST.getSettings(t);
    settings.sheetUrl = 'https://docs.google.com/spreadsheets/d/other'; // e.g. the UI saving the Sheet link
    await ST.saveSettings(t, settings);
    assert.equal(store[boundKey], GOOD, 'the tie is unchanged');
    const again = await ST.getSettings(t);
    assert.equal(ST.isConnected(again), false);
    await ST.syncNow(again);
    assert.equal(fetched.length, 0);
  });

  it('reconnecting with a code on purpose ties the secret to the new URL', async () => {
    await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    store[sharedKey] = Object.assign({}, store[sharedKey], { workerUrl: EVIL });
    const res = await ST.connectWithCode(t, codeFor(GOOD, 'new-secret'));
    assert.equal(res.ok, true);
    assert.equal(store[boundKey], GOOD);
    assert.equal(ST.isConnected(await ST.getSettings(t)), true);
  });

  it('a connection made before secrets were tied to a URL keeps working, and is tied to the URL shared today', async () => {
    store[sharedKey] = { workerUrl: GOOD + '/', sheetUrl: '', columns: [] };
    store[secretKey] = SECRET; // no tie yet
    const settings = await ST.getSettings(t);
    assert.equal(ST.isConnected(settings), true, 'nobody is disconnected by the update');
    assert.equal(store[boundKey], GOOD, 'the tie is written once, without the trailing slash');
    store[sharedKey] = Object.assign({}, store[sharedKey], { workerUrl: EVIL });
    assert.equal(ST.isConnected(await ST.getSettings(t)), false, 'and a later change is caught');
  });

  it('a trailing slash on the shared URL is not a change', async () => {
    await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    store[sharedKey] = Object.assign({}, store[sharedKey], { workerUrl: GOOD + '//' });
    assert.equal(ST.isConnected(await ST.getSettings(t)), true);
  });

  it('disconnecting clears the secret and its tie', async () => {
    await ST.connectWithCode(t, codeFor(GOOD, SECRET));
    const settings = await ST.getSettings(t);
    settings.workerUrl = '';
    settings.secret = '';
    settings.sheetUrl = '';
    settings.connectedAt = null;
    await ST.saveSettings(t, settings);
    assert.equal(store[secretKey], '');
    assert.equal(store[boundKey], '');
    const after = await ST.getSettings(t);
    assert.equal(after.urlChanged, false);
    assert.equal(ST.isConnected(after), false);
    assert.equal((await ST.info(after)).reason, 'not-connected');
  });

  it('hostOf gives a readable host for the message, and survives a non-URL', () => {
    assert.equal(ST.hostOf('https://evil.example.org/path'), 'evil.example.org');
    assert.equal(ST.hostOf('not a url'), 'not a url');
    assert.equal(ST.hostOf(''), '');
  });
});

/* ── The shared REST helper waits and retries instead of hanging or failing at the first 429 ── */

describe('SheetsTrello.fetchWithRetry', () => {
  let ST;
  let calls;
  let waits;
  const sleep = async (ms) => { waits.push(ms); };
  const res = (status, headers) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => (headers || {})[String(k).toLowerCase()] ?? null }, text: async () => '{"ok":true}' });

  /** fetch that answers from a list (a function entry may reject or hang), recording each call. */
  function useFetch(plan) {
    calls = [];
    global.fetch = (url, init) => {
      calls.push({ url, method: init && init.method, signal: init && init.signal });
      const next = plan[Math.min(calls.length - 1, plan.length - 1)];
      return typeof next === 'function' ? next(init) : Promise.resolve(next);
    };
  }
  const hang = (init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
  });
  const dropped = () => Promise.reject(new TypeError('Failed to fetch'));

  before(() => {
    loadComponent('table/table-model.js');
    loadComponent('sheets/sheets-trello.js');
    ST = global.SheetsTrello;
  });
  beforeEach(() => { waits = []; });

  it('a normal answer is one call, no waiting', async () => {
    useFetch([res(200)]);
    const r = await ST.fetchWithRetry('https://x/a', { method: 'GET' }, { sleep });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(waits, []);
  });

  it('a 429 waits about a second and then succeeds', async () => {
    useFetch([res(429), res(200)]);
    const r = await ST.fetchWithRetry('https://x/a', { method: 'GET' }, { sleep });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 2);
    assert.ok(waits[0] >= 1000 && waits[0] <= 1250, 'waited ' + waits[0]);
  });

  it('Retry-After is honored, and capped at 10 s', async () => {
    useFetch([res(429, { 'retry-after': '3' }), res(429, { 'retry-after': '120' }), res(200)]);
    const r = await ST.fetchWithRetry('https://x/a', { method: 'PUT' }, { sleep });
    assert.equal(r.status, 200);
    assert.deepEqual(waits, [3000, 10000]);
  });

  it('after two retries a still-429 answer is handed back as it is (the caller reports http-429)', async () => {
    useFetch([res(429)]);
    const r = await ST.fetchWithRetry('https://x/a', { method: 'GET' }, { sleep });
    assert.equal(r.status, 429);
    assert.equal(calls.length, 3);
    assert.ok(waits[0] >= 1000 && waits[0] <= 1250 && waits[1] >= 2000 && waits[1] <= 2250, JSON.stringify(waits));
  });

  it('a POST is retried after a 429 (refused, not processed) but never after a 503 (it may have gone through)', async () => {
    useFetch([res(429), res(200)]);
    assert.equal((await ST.fetchWithRetry('https://x/a', { method: 'POST' }, { sleep })).status, 200);
    assert.equal(calls.length, 2);
    useFetch([res(503), res(200)]);
    assert.equal((await ST.fetchWithRetry('https://x/a', { method: 'POST' }, { sleep })).status, 503);
    assert.equal(calls.length, 1, 'no duplicate create');
    useFetch([res(503), res(200)]);
    assert.equal((await ST.fetchWithRetry('https://x/a', { method: 'DELETE' }, { sleep })).status, 503);
    assert.equal(calls.length, 1);
  });

  it('GET and PUT are retried after a 502, 503 or 504', async () => {
    for (const [method, status] of [['GET', 502], ['GET', 503], ['PUT', 504]]) {
      useFetch([res(status), res(200)]);
      assert.equal((await ST.fetchWithRetry('https://x/a', { method }, { sleep })).status, 200, method + ' ' + status);
      assert.equal(calls.length, 2);
    }
  });

  it('a dropped connection is retried for a read, and thrown at once for a write', async () => {
    useFetch([dropped, res(200)]);
    assert.equal((await ST.fetchWithRetry('https://x/a', { method: 'GET' }, { sleep })).status, 200);
    assert.equal(calls.length, 2);
    useFetch([dropped, res(200)]);
    await assert.rejects(ST.fetchWithRetry('https://x/a', { method: 'POST' }, { sleep }), /Failed to fetch/);
    assert.equal(calls.length, 1);
  });

  it('offline: a failed read is not retried (there is nobody to answer)', async () => {
    const original = Object.getOwnPropertyDescriptor(global, 'navigator'); // a getter-only global on recent Node
    Object.defineProperty(global, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
    try {
      useFetch([dropped, res(200)]);
      await assert.rejects(ST.fetchWithRetry('https://x/a', { method: 'GET' }, { sleep }), /Failed to fetch/);
      assert.equal(calls.length, 1);
    } finally {
      if (original) Object.defineProperty(global, 'navigator', original);
      else delete global.navigator;
    }
  });

  it('a request that never answers ends with a clear timeout error, shaped like a network failure', async () => {
    useFetch([hang]);
    await assert.rejects(
      ST.fetchWithRetry('https://x/a', { method: 'POST' }, { sleep, timeoutMs: 20 }),
      (err) => err.timeout === true && err.reason === 'network' && /ne répond pas/.test(err.message)
    );
    assert.equal(calls.length, 1, 'a write that may have landed is not sent again');
    useFetch([hang]);
    await assert.rejects(ST.fetchWithRetry('https://x/a', { method: 'GET' }, { sleep, timeoutMs: 20, retries: 1 }), (err) => err.timeout === true);
    assert.equal(calls.length, 2, 'a read is tried once more');
  });

  it('trelloRest goes through it: a 429 then a 200 returns the data', async () => {
    global.PriorityRestConfig = { appKey: 'app-key' };
    const t = { getRestApi: async () => ({ isAuthorized: async () => true, getToken: async () => 'tok' }) };
    useFetch([res(429, { 'retry-after': '0' }), res(200)]);
    const out = await ST.trelloRest(t, '/cards/c1', 'GET');
    assert.equal(out.ok, true);
    assert.deepEqual(out.data, { ok: true });
    assert.equal(calls.length, 2);
    delete global.PriorityRestConfig;
  });

  it('trelloRest still reports the final status when Trello keeps refusing', async () => {
    global.PriorityRestConfig = { appKey: 'app-key' };
    const t = { getRestApi: async () => ({ isAuthorized: async () => true, getToken: async () => 'tok' }) };
    useFetch([res(429, { 'retry-after': '0' })]);
    const out = await ST.trelloRest(t, '/cards/c1', 'PUT', { name: 'x' });
    assert.deepEqual({ ok: out.ok, reason: out.reason }, { ok: false, reason: 'http-429' });
    assert.equal(calls.length, 3);
    delete global.PriorityRestConfig;
  });
});
