'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'workers', 'trello-sheet-sync', 'src', 'tasks.js')).href);

const lists = [
  { id: 'l1', name: 'En cours' },
  { id: 'l2', name: 'Bloqué' },
  { id: 'l3', name: 'Terminé' },
];
const cards = [
  { id: 'a', name: 'A', idList: 'l1', due: '2026-11-25T12:00:00Z', shortUrl: 'u/a', category: 'Alpha', labels: [{ name: 'Urgent' }, { name: '' }] },
  { id: 'b', name: 'B', idList: 'l1', due: '2026-11-10T12:00:00Z', shortUrl: 'u/b', category: 'Alpha', labels: [] },
  { id: 'c', name: 'C', idList: 'l2', due: null, shortUrl: 'u/c', category: 'Beta', labels: [] },
  { id: 'd', name: 'D', idList: 'l3', due: '2026-11-01T12:00:00Z', shortUrl: 'u/d', labels: [] },
  { id: 'e', name: 'E', idList: 'l1', dueComplete: true, shortUrl: 'u/e', labels: [] },
  { id: 'f', name: 'F', idList: 'l1', due: '2026-11-30T12:00:00Z', shortUrl: 'u/f', labels: [] },
];
const pushed = { a: { priority: 7.5, progress: 40 }, b: { priority: 7.5, progress: '' }, f: { priority: 9, progress: 250 } };
const base = { cards, lists, pushed, board: { id: 'B1', name: 'Mon tableau' }, now: '2026-11-19T00:00:00Z' };

test('formatTasks: shape, counts, open sorted by priority desc then due asc', async () => {
  const { formatTasks } = await load();
  const r = formatTasks(base);
  assert.equal(r.generatedAt, '2026-11-19T00:00:00.000Z');
  assert.deepEqual(r.board, { id: 'B1', name: 'Mon tableau' });
  assert.deepEqual(r.counts, { open: 4, overdue: 1, blocked: 1, done: 2 });
  assert.deepEqual(r.tasks.map((t) => t.id), ['f', 'b', 'a', 'c']);
  const a = r.tasks.find((t) => t.id === 'a');
  assert.deepEqual(a, {
    id: 'a', name: 'A', url: 'u/a', list: 'En cours', statut: a.statut, priority: 7.5, progress: 40,
    due: '2026-11-25T12:00:00.000Z', start: null, blocked: false, done: false, labels: ['Urgent'], project: 'Alpha', projectId: '',
  });
  assert.equal(r.tasks.find((t) => t.id === 'f').progress, 100);
  assert.equal(r.tasks.find((t) => t.id === 'b').progress, null);
  assert.equal(r.tasks.find((t) => t.id === 'c').priority, null);
  assert.equal(r.tasks.find((t) => t.id === 'c').blocked, true);
});

test('formatTasks: done only with includeDone, after the open ones', async () => {
  const { formatTasks } = await load();
  assert.equal(formatTasks(base).tasks.some((t) => t.done), false);
  const r = formatTasks({ ...base, includeDone: true });
  assert.deepEqual(r.tasks.map((t) => t.id).slice(0, 4), ['f', 'b', 'a', 'c']);
  assert.deepEqual(r.tasks.slice(4).map((t) => t.id).sort(), ['d', 'e']);
  assert.ok(r.tasks.slice(4).every((t) => t.done && !t.blocked));
});

test('formatTasks: project filter (accent and case insensitive) and limit clamp', async () => {
  const { formatTasks, clampLimit } = await load();
  assert.deepEqual(formatTasks({ ...base, project: 'alpha' }).tasks.map((t) => t.id), ['b', 'a']);
  assert.equal(formatTasks({ ...base, project: 'inconnu' }).tasks.length, 0);
  assert.equal(formatTasks({ ...base, limit: '2' }).tasks.length, 2);
  assert.equal(clampLimit(undefined), 500);
  assert.equal(clampLimit('abc'), 500);
  assert.equal(clampLimit(-3), 500);
  assert.equal(clampLimit(99999), 1000);
});

test('formatTasks: tolerates empty input and missing pushed data', async () => {
  const { formatTasks } = await load();
  const r = formatTasks({ cards: [], lists: [], board: null });
  assert.deepEqual(r.counts, { open: 0, overdue: 0, blocked: 0, done: 0 });
  assert.deepEqual(r.board, { id: '', name: '' });
  const r2 = formatTasks({ cards: [{ id: 'x', name: 'X', idList: 'zz' }], lists: [] });
  assert.equal(r2.tasks[0].priority, null);
  assert.equal(r2.tasks[0].list, '');
});
