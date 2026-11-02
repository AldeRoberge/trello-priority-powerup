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
