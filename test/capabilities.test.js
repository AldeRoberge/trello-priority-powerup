'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PowerUpCapabilities', () => {
  beforeEach(() => {
    clearComponentCache();
    delete global.PowerUpCapabilities;
  });

  function load() {
    const g = loadComponent('shared/capabilities.js');
    g.PowerUpCapabilities._resetForTests();
    return g.PowerUpCapabilities;
  }

  it('lists required capabilities including card-back-section', () => {
    const Caps = load();
    const ids = Caps.requiredIds();
    assert.ok(ids.includes('card-badges'));
    assert.ok(ids.includes('card-detail-badges'));
    assert.ok(ids.includes('card-back-section'));
    assert.ok(ids.includes('board-buttons'));
    assert.ok(ids.includes('list-sorters'));
    assert.ok(ids.includes('on-enable'));
    assert.equal(ids.length, 6);
  });

  it('lists stub capabilities that must stay off', () => {
    const Caps = load();
    assert.deepEqual(Caps.stubIds(), [
      'card-buttons',
      'list-actions',
      'on-disable',
    ]);
  });

  it('does not overlap required and stub ids', () => {
    const Caps = load();
    const required = new Set(Caps.requiredIds());
    Caps.stubIds().forEach((id) => {
      assert.equal(required.has(id), false, id);
    });
  });

  it('evaluate marks missing required and idle stubs', () => {
    const Caps = load();
    const rows = Caps.evaluateAll({});
    const summary = Caps.summarize(rows);
    assert.equal(summary.requiredSeen, 0);
    assert.equal(summary.missing, 6);
    assert.equal(summary.stubHits, 0);
    assert.equal(summary.ok, false);

    const back = Caps.evaluate('card-back-section', {});
    assert.equal(back.expectedOn, true);
    assert.equal(back.status, 'missing');
    assert.equal(back.tone, 'warn');

    const stub = Caps.evaluate('card-buttons', {});
    assert.equal(stub.expectedOn, false);
    assert.equal(stub.status, 'idle-stub');
    assert.equal(stub.tone, 'ok');
  });

  it('evaluate treats stub hits as configuration errors', () => {
    const Caps = load();
    const probe = {
      'card-buttons': { at: '2026-07-20T15:00:00.000Z' },
      'board-buttons': { at: '2026-07-20T15:00:00.000Z' },
    };
    const stub = Caps.evaluate('card-buttons', probe, {
      nowMs: Date.parse('2026-07-20T15:05:00.000Z'),
    });
    assert.equal(stub.status, 'stub-hit');
    assert.equal(stub.tone, 'error');
    assert.match(stub.statusLabel, /décochez/i);

    const board = Caps.evaluate('board-buttons', probe, {
      nowMs: Date.parse('2026-07-20T15:05:00.000Z'),
    });
    assert.equal(board.status, 'ok');
    assert.equal(board.tone, 'ok');
  });

  it('markSeen persists once then debounces within the hour', async () => {
    const Caps = load();
    const store = {};
    let setCount = 0;
    const t = {
      get(scope, visibility, key) {
        assert.equal(scope, 'member');
        assert.equal(visibility, 'private');
        assert.equal(key, Caps.STORAGE_KEY);
        return Promise.resolve(store[key] || null);
      },
      set(scope, visibility, key, value) {
        setCount += 1;
        store[key] = value;
        return Promise.resolve();
      },
    };

    await Caps.markSeen(t, 'card-back-section');
    assert.equal(setCount, 1);
    assert.ok(store[Caps.STORAGE_KEY]['card-back-section'].at);

    await Caps.markSeen(t, 'card-back-section');
    assert.equal(setCount, 1, 'second mark within hour should not persist');

    await Caps.markSeen(t, 'card-badges');
    assert.equal(setCount, 2);
  });

  it('normalizeProbe drops invalid rows', () => {
    const Caps = load();
    assert.deepEqual(
      Caps.normalizeProbe({
        ok: { at: '2026-07-20T12:00:00.000Z' },
        bad: { at: 'nope' },
        empty: {},
        str: 'x',
      }),
      { ok: { at: '2026-07-20T12:00:00.000Z' } }
    );
  });
});
