'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src', 'timers.js')).href);

const NOW = Date.parse('2026-11-02T12:00:00Z');
const entries = [
  { scope: 'board', value: JSON.stringify({ other: 1, cardTimers: {
    a: { id: 'a:1', cardId: 'a', title: 'Colle', endsAt: '2026-11-02T11:55:00Z' },
    b: { id: 'b:1', cardId: 'b', title: 'Vite', endsAt: '2026-11-02T11:59:50Z' },
    c: { id: 'c:1', cardId: 'c', title: 'Vu', endsAt: '2026-11-02T11:00:00Z', firedAt: '2026-11-02T11:00:02Z' },
    d: { id: 'd:1', cardId: 'd', title: 'Futur', endsAt: '2026-11-02T13:00:00Z' },
  } }) },
  { scope: 'board', value: 'not json' },
  { scope: 'board', value: '{}' },
];

test('timersFromPluginData reads cardTimers and skips bad entries', async () => {
  const { timersFromPluginData } = await load();
  assert.equal(timersFromPluginData(entries).length, 4);
  assert.deepEqual(timersFromPluginData(null), []);
});

test('pickUnannounced waits for the grace period and skips announced or emailed timers', async () => {
  const { timersFromPluginData, pickUnannounced } = await load();
  const all = timersFromPluginData(entries);
  assert.deepEqual(pickUnannounced(all, NOW, new Set()).map((x) => x.id), ['a:1']);
  assert.deepEqual(pickUnannounced(all, NOW, new Set(['a:1'])), []);
});

test('notifyDueTimers does nothing without email settings or KV', async () => {
  const { notifyDueTimers } = await load();
  assert.equal(await notifyDueTimers({}, NOW), 0);
});

test('emailFor names the card', async () => {
  const { emailFor } = await load();
  assert.match(emailFor({ title: 'Colle', label: 'sécher' }).subject, /Colle/);
});
