'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('shared/timers.js');
const T = global.Timers;

test('parseDuration reads Québec French durations', () => {
  assert.equal(T.parseDuration('45 min'), 45);
  assert.equal(T.parseDuration('2 h 30'), 150);
  assert.equal(T.parseDuration('2h30'), 150);
  assert.equal(T.parseDuration('1 heure 15 minutes'), 75);
  assert.equal(T.parseDuration('1,5 h'), 90);
  assert.equal(T.parseDuration('1 j'), 1440);
  assert.equal(T.parseDuration('90'), 90);
  assert.equal(T.parseDuration('1:30'), 90);
});

test('parseDuration rejects garbage and non positive values', () => {
  ['', null, 'bientôt', '0', '-5', 'abc 2', '10 min foo'].forEach((v) => assert.equal(T.parseDuration(v), null, String(v)));
});

test('formatRemaining stays short', () => {
  assert.equal(T.formatRemaining(30000), '30 s');
  assert.equal(T.formatRemaining(12 * 60000), '12 min');
  assert.equal(T.formatRemaining(125 * 60000), '2 h 05');
  assert.equal(T.formatRemaining(26 * 3600000), '1 j 2 h');
  assert.equal(T.formatRemaining(-5), '0 s');
});

test('dueTimers only returns ended, unannounced timers', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const map = {
    a: { id: 'a:1', cardId: 'a', endsAt: '2026-11-02T11:59:00Z' },
    b: { id: 'b:1', cardId: 'b', endsAt: '2026-11-02T12:01:00Z' },
    c: { id: 'c:1', cardId: 'c', endsAt: '2026-11-02T11:00:00Z', firedAt: '2026-11-02T11:00:05Z' },
  };
  assert.deepEqual(T.dueTimers(map, now).map((x) => x.cardId), ['a']);
});

test('upsert replaces the card timer and without removes it', () => {
  const one = T.upsert({}, { id: '1', cardId: 'a', endsAt: 'x' });
  const two = T.upsert(one, { id: '2', cardId: 'a', endsAt: 'y' });
  assert.equal(Object.keys(two).length, 1);
  assert.equal(two.a.id, '2');
  assert.deepEqual(T.without(two, 'a'), {});
  assert.equal(Object.keys(two).length, 1);
});

function fakeTrello() {
  const store = {};
  return {
    get: async (s, v, k) => store[k],
    set: async (s, v, k, val) => { store[k] = val; },
  };
}

test('set, list and cancel round trip through plugin data', async () => {
  const t = fakeTrello();
  const timer = await T.set(t, { id: 'c1', name: 'Colle' }, 30, 'sécher');
  assert.equal(timer.cardId, 'c1');
  assert.ok(Date.parse(timer.endsAt) > Date.now() + 29 * 60000);
  assert.equal((await T.list(t)).length, 1);
  await T.cancel(t, 'c1');
  assert.equal((await T.list(t)).length, 0);
});

test('start fires a due timer once and marks it fired', async () => {
  const t = fakeTrello();
  await t.set('board', 'shared', T.KEY, { c1: { id: 'c1:1', cardId: 'c1', title: 'Colle', endsAt: new Date(Date.now() - 1000).toISOString() } });
  const fired = [];
  const stop = T.start(t, { onFire: (x) => fired.push(x.id) });
  await new Promise((r) => setTimeout(r, 50));
  stop();
  assert.deepEqual(fired, ['c1:1']);
  const [saved] = await T.list(t);
  assert.ok(saved.firedAt);
});

test('running(cardId) stays a function (the ticker flag must not overwrite it)', () => {
  assert.equal(typeof T.running, 'function');
  assert.equal(typeof T.ensure, 'function');
});
