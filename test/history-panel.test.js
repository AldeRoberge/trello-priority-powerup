'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('HistoryPanel', () => {
  let HP;
  let store;

  before(() => {
    loadComponent('shared/history-panel.js');
    HP = global.HistoryPanel;
    assert.ok(HP);
  });

  beforeEach(() => {
    store = {};
    global.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  });

  function make(extra) {
    const calls = [];
    const panel = HP.create(Object.assign({
      key: 'k',
      verb: (e) => e.type,
      apply: (e, back) => { calls.push([e.id, back]); return Promise.resolve(); },
    }, extra));
    return { panel, calls };
  }

  it('records newest first and persists plain data', () => {
    const { panel } = make();
    panel.record({ type: 'edit', title: 'A', key: 'name' });
    panel.record({ type: 'archive', title: 'B' });
    assert.equal(panel.count(), 2);
    assert.equal(panel.items()[0].title, 'B');
    const saved = JSON.parse(store.k);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].state, 'done');
    assert.equal(make().panel.count(), 2, 'reloads from storage');
  });

  it('caps the number of entries', () => {
    const { panel } = make({ max: 3 });
    for (let i = 0; i < 5; i++) panel.record({ type: 'edit', title: 'n' + i });
    assert.equal(panel.count(), 3);
    assert.equal(panel.items()[0].title, 'n4');
  });

  it('toggle undoes then redoes and runs after()', async () => {
    let afters = 0;
    const { panel, calls } = make({ after: () => { afters += 1; } });
    const e = panel.record({ type: 'archive', title: 'A' });
    await panel.toggle(e);
    assert.equal(e.state, 'undone');
    await panel.toggle(e);
    assert.equal(e.state, 'done');
    assert.deepEqual(calls.map((c) => c[1]), [true, false]);
    assert.equal(afters, 2);
  });

  it('keeps the state and reports when the write fails', async () => {
    const errors = [];
    const { panel } = make({ apply: () => Promise.reject(new Error('boom')), onError: (err) => errors.push(err.message) });
    const e = panel.record({ type: 'move', title: 'A' });
    await panel.toggle(e);
    assert.equal(e.state, 'done');
    assert.deepEqual(errors, ['boom']);
  });

  it('does not toggle "field" entries and drops unknown stored types', async () => {
    const { panel, calls } = make();
    const e = panel.record({ type: 'field', title: 'A' });
    await panel.toggle(e);
    assert.equal(calls.length, 0);
    store.k = JSON.stringify([{ id: 'x', type: 'nope' }, { id: 'y', type: 'edit', title: 'ok', state: 'done', ts: 1 }]);
    assert.equal(make().panel.count(), 1);
  });

  it('survives corrupted storage', () => {
    store.k = '{not json';
    assert.equal(make().panel.count(), 0);
  });

  it('formats relative times and day labels', () => {
    const now = new Date(2026, 9, 5, 12, 0, 0).getTime();
    assert.equal(HP._relTime(now - 10000, now), 'à l’instant');
    assert.equal(HP._relTime(now - 5 * 60000, now), 'il y a 5 min');
    assert.equal(HP._relTime(now - 3 * 3600000, now), 'il y a 3 h');
    assert.equal(HP._relTime(now - 2 * 86400000, now), '');
    assert.equal(HP._dayLabel(now - 3600000, now), 'Aujourd’hui');
    assert.equal(HP._dayLabel(now - 86400000, now), 'Hier');
  });
});
