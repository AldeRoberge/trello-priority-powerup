'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const V = require(path.join(__dirname, '..', 'components', 'shared', 'vvd-link.js'));

test('baseUrl: default, then localStorage override (bad values ignored)', () => {
  const store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  assert.equal(V.baseUrl(), 'http://127.0.0.1:4391');
  store['tp-vvd-url'] = 'http://localhost:5000/';
  assert.equal(V.baseUrl(), 'http://localhost:5000');
  store['tp-vvd-url'] = 'javascript:alert(1)';
  assert.equal(V.baseUrl(), 'http://127.0.0.1:4391');
  delete global.localStorage;
});

test('healthOf accepts string, boolean, object and a separate health payload', () => {
  assert.equal(V.healthOf({ id: 'a', health: 'ok' }), 'ok');
  assert.equal(V.healthOf({ id: 'a', health: false }), 'down');
  assert.equal(V.healthOf({ id: 'a', health: { ok: false } }), 'down');
  assert.equal(V.healthOf({ id: 'a', health: { status: 'unhealthy' } }), 'down');
  assert.equal(V.healthOf({ id: 'a' }), '');
  assert.equal(V.healthOf({ id: 'a' }, { apps: { a: 'down' } }), 'down');
  assert.equal(V.healthOf({ id: 'a' }, { apps: [{ id: 'a', ok: true }] }), 'ok');
});

test('buildSummary and describeSummary', () => {
  const s = V.buildSummary(true, [{ id: 'a', name: 'App A', status: 'running', health: 'ok' }, { id: 'b', status: 'stopped', health: 'down' }], null, [{ status: 'failed' }, { status: 'success' }, null]);
  assert.deepEqual(s, { up: true, apps: [{ id: 'a', name: 'App A', status: 'running', health: 'ok' }, { id: 'b', name: 'b', status: 'stopped', health: 'down' }], failingDeploys: 1 });
  assert.equal(V.describeSummary(s), '1 application sur 2 en marche. À surveiller : b. 1 déploiement en échec.');
  assert.match(V.describeSummary(null), /ne répond pas/);
  assert.match(V.describeSummary({ up: true, apps: [], failingDeploys: 0 }), /Aucune application/);
});

test('calls fail soft and are GET only', async () => {
  const realFetch = global.fetch;
  delete global.fetch;
  assert.equal(await V.apps(), null);
  global.fetch = () => Promise.reject(new Error('down'));
  assert.equal(await V.health(), null);
  assert.equal(await V.deploys(), null);
  assert.equal(await V.summary(), null);
  global.fetch = () => Promise.resolve({ ok: false });
  assert.equal(await V.apps(), null);
  const seen = [];
  global.fetch = (url, opts) => {
    seen.push([url, opts.method]);
    return Promise.resolve({ ok: true, json: async () => ({ apps: [{ id: 'a', name: 'A', status: 'running' }] }) });
  };
  const apps = await V.apps();
  assert.equal(apps.length, 1);
  assert.deepEqual(seen[0], ['http://127.0.0.1:4391/api/apps', 'GET']);
  global.fetch = realFetch;
});

test('ping caches the answer for 20 s', async () => {
  const realFetch = global.fetch;
  let n = 0;
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  V.setBaseUrl(''); // clears the cache
  global.fetch = () => {
    n += 1;
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  };
  assert.equal(await V.ping(), true);
  assert.equal(await V.ping(), true);
  assert.equal(n, 1);
  delete global.localStorage;
  global.fetch = realFetch;
});
