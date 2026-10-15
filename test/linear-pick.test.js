'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file) {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', file), 'utf8'), { window: win });
  return win;
}

const LP = load('linear-pick.js').LinearPick;
const NC = load('new-card.js').NewCard;
const LK = load('linear-keys.js').LinearKeys;

const items = [{ id: '1', label: 'Backlog' }, { id: '2', label: 'À faire' }, { id: '3', label: 'En cours' }, { id: '4', label: 'Terminé' }];

test('filterItems is accent and case blind and needs every word', () => {
  assert.deepEqual(LP.filterItems(items, '').map((i) => i.id), ['1', '2', '3', '4']);
  assert.deepEqual(LP.filterItems(items, 'a faire').map((i) => i.id), ['2']);
  assert.deepEqual(LP.filterItems(items, 'TERMINE').map((i) => i.id), ['4']);
  assert.deepEqual(LP.filterItems(items, 'en co').map((i) => i.id), ['3']);
  assert.deepEqual(LP.filterItems(items, 'zzz'), []);
});

test('withCreate adds one row for text that matches no choice exactly', () => {
  const names = [{ id: 'Paul', label: 'Paul' }, { id: 'Pauline', label: 'Pauline' }];
  const create = (q) => ({ id: 'new:' + q, label: 'En attente de « ' + q + ' »' });
  assert.deepEqual(LP.withCreate(LP.filterItems(names, 'pau'), 'pau', create).map((i) => i.id), ['Paul', 'Pauline', 'new:pau']);
  assert.deepEqual(LP.withCreate(LP.filterItems(names, 'zoé'), 'zoé', create).map((i) => i.id), ['new:zoé']);
  assert.deepEqual(LP.withCreate(LP.filterItems(names, 'PAUL'), 'PAUL', create).map((i) => i.id), ['Paul', 'Pauline'], 'an exact name is not offered again');
  assert.deepEqual(LP.withCreate(names, '', create).map((i) => i.id), ['Paul', 'Pauline'], 'nothing typed, nothing to create');
  assert.deepEqual(LP.withCreate(names, '   ', create).map((i) => i.id), ['Paul', 'Pauline']);
  assert.deepEqual(LP.withCreate(names, 'x', undefined).map((i) => i.id), ['Paul', 'Pauline'], 'no create option, no extra row');
  assert.deepEqual(LP.withCreate(names, 'x', () => null).map((i) => i.id), ['Paul', 'Pauline']);
  assert.equal(names.length, 2, 'the list is not changed');
});

test('digitIndex maps 1-9 to 0-8 only', () => {
  assert.equal(LP.digitIndex('1'), 0);
  assert.equal(LP.digitIndex('9'), 8);
  assert.equal(LP.digitIndex('0'), -1);
  assert.equal(LP.digitIndex('a'), -1);
  assert.equal(LP.digitIndex('12'), -1);
});

test('NewCard.buildPlan needs a title, lifts a trailing date and drops "aucun" urgency', () => {
  assert.equal(NC.buildPlan({ title: '   ' }), null);
  const qp = { parse: (s) => (/ demain$/.test(s) ? { name: s.replace(/ demain$/, ''), dueDate: '2026-10-08' } : { name: s, dueDate: '' }) };
  const a = NC.buildPlan({ title: 'Appeler Paul demain', desc: ' x ', listId: 'L', urgency: 'aucun', dueDate: '' }, qp);
  assert.deepEqual({ ...a }, { name: 'Appeler Paul', desc: 'x', listId: 'L', dueDate: '2026-10-08', urgency: '' });
  const b = NC.buildPlan({ title: 'Appeler Paul demain', listId: 'L', urgency: 'vite', dueDate: '2026-11-01' }, qp);
  assert.equal(b.dueDate, '2026-11-01', 'a picked date wins over the typed one');
  assert.equal(b.urgency, 'vite');
});

test('LinearKeys.actionFor maps S P D C and ignores modified keys', () => {
  assert.equal(LK.actionFor({ key: 's' }), 'status');
  assert.equal(LK.actionFor({ key: 'P' }), 'urgency');
  assert.equal(LK.actionFor({ key: 'd' }), 'due');
  assert.equal(LK.actionFor({ key: 'c' }), 'new');
  assert.equal(LK.actionFor({ key: 's', ctrlKey: true }), null);
  assert.equal(LK.actionFor({ key: 'x' }), null);
  assert.equal(LK.LABEL_TO_ID['Au plus vite'], 'au-plus-vite');
});
