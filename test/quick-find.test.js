'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const QF = loadComponent('shared/quick-find.js').QuickFind;

function index(records) {
  return QF.buildIndex(QF.collect(records, []));
}

test('collect keeps tasks, lifts a project, and drops Sans projet', () => {
  const rows = QF.collect([
    { id: 'c1', name: 'Écrire', project: 'Alpha', projectId: 'p1', hint: 'À faire' },
    { id: 'c2', name: '', project: 'Sans projet', projectId: 'p0' },
    { id: 'c1', name: 'Écrire' },
  ], [{ id: 'p1', name: 'Alpha', kind: 'project' }]);
  assert.deepEqual(rows.map((r) => r.kind + ':' + r.id), ['task:c1', 'project:p1', 'task:c2']);
  assert.equal(rows[2].name, 'Sans titre');
  assert.equal(rows[0].hint, 'À faire');
});

test('search ignores accents and ranks an exact project above a longer task', () => {
  const idx = QF.buildIndex(QF.collect([
    { id: 't1', name: 'Rapport annuel' },
    { id: 'p1', name: 'Rapport', kind: 'project' },
    { id: 't2', name: 'Été au chalet' },
  ], []));
  const hits = QF.search(idx, 'rapport', 12, []);
  assert.equal(hits[0].id, 'p1');
  assert.equal(hits[0].kind, 'project');
  assert.equal(hits[1].id, 't1');
  assert.equal(QF.search(idx, 'ete', 12, [])[0].id, 't2');
});

test('every word must match, and a short gap still finds the name', () => {
  const idx = index([{ id: 't1', name: 'Projet Alpha' }, { id: 't2', name: 'Alpha' }]);
  assert.deepEqual(QF.search(idx, 'alpha beta', 12, []).map((h) => h.id), []);
  assert.equal(QF.search(idx, 'prjt', 12, [])[0].id, 't1');
  assert.equal(QF.loose('projet', 'prjt'), true);
  assert.equal(QF.loose('alphabet', 'prjt'), false);
});

test('an empty query shows recent opens, then projects, then tasks', () => {
  const idx = index([
    { id: 't1', name: 'Zèbre' },
    { id: 'p1', name: 'Alpha', kind: 'project' },
    { id: 't2', name: 'Note' },
  ]);
  const hits = QF.search(idx, '', 12, [{ id: 't2', kind: 'task' }]);
  assert.deepEqual(hits.map((h) => h.id), ['t2', 'p1', 't1']);
});

test('a recent task wins a tie, and the list stays capped', () => {
  const idx = index([
    { id: 'a', name: 'Note' },
    { id: 'b', name: 'Note' },
    { id: 'c', name: 'Note' },
  ]);
  assert.equal(QF.search(idx, 'note', 12, [{ id: 'b', kind: 'task' }])[0].id, 'b');
  assert.equal(QF.search(idx, 'note', 2, []).length, 2);
});
