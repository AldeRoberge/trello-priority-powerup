'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DashboardTrello.ensureInbox / ingest', () => {
  let DT;
  let store;
  let rest;
  const t = {
    board: async () => ({ id: 'b1' }),
    get: async (scope, vis, key) => (store[key] === undefined ? null : store[key]),
    set: async (scope, vis, key, val) => {
      store[key] = val;
    },
  };

  before(() => {
    loadComponent('statut/statut-match.js');
    loadComponent('statut/statut-trello.js');
    loadComponent('dashboard/dashboard-model.js');
    loadComponent('dashboard/dashboard-trello.js');
    DT = global.DashboardTrello;
    assert.ok(DT);
  });

  beforeEach(() => {
    store = {};
    rest = [];
    global.SheetsTrello = {
      trelloRest: async (tt, path, method) => {
        rest.push([method, path]);
        return { ok: true, data: { id: 'newlist' } };
      },
    };
  });

  const settingsOf = () => store[global.StatutTrello.STATUT_SETTINGS_KEY];

  it('assigns the triage Statut to an existing list that reads like an inbox, without creating anything', async () => {
    const res = await DT.ensureInbox(t, [{ id: 'l1', name: 'À faire' }, { id: 'l2', name: 'Inbox' }]);
    assert.deepEqual(res, { listId: 'l2', created: false });
    assert.equal(rest.length, 0);
    assert.equal(settingsOf().listCategories.l2, 'triage');
  });

  it('creates an Inbox list at the top of the board when none exists, and marks it triage', async () => {
    const res = await DT.ensureInbox(t, [{ id: 'l1', name: 'À faire' }, { id: 'l3', name: 'Terminé' }]);
    assert.deepEqual(res, { listId: 'newlist', created: true });
    assert.equal(rest.length, 1);
    assert.equal(rest[0][0], 'POST');
    assert.match(rest[0][1], /^\/lists\?name=Inbox&idBoard=b1&pos=top$/);
    assert.equal(settingsOf().listCategories.newlist, 'triage');
  });

  it('ingest refuses to drop cards in another list when the board has no triage list', async () => {
    await assert.rejects(
      DT.ingest(t, ['x'], [{ id: 'l1', name: 'À faire', category: 'unstarted' }]),
      (err) => err.reason === 'no-triage-list'
    );
  });
});
