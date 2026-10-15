'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'card-entities.js'), 'utf8'), { window: win });
const CE = win.CardEntities;

test('CardEntities exposes the three pickers', () => {
  assert.deepEqual(Array.from(CE.KINDS).sort(), ['labels', 'people', 'places']);
  assert.equal(CE.open('nope', {}), false);
  assert.equal(CE.open('people', { t: {}, rec: { id: 'c1' } }), false, 'no anchor, no popover');
});

test('toggleId adds once and removes cleanly', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(CE.toggleId(['a'], 'b', true))), ['a', 'b']);
  assert.deepEqual(JSON.parse(JSON.stringify(CE.toggleId(['a', 'b'], 'b', true))), ['a', 'b']);
  assert.deepEqual(JSON.parse(JSON.stringify(CE.toggleId(['a', 'b'], 'a', false))), ['b']);
  assert.deepEqual(JSON.parse(JSON.stringify(CE.toggleId(null, 'x', false))), []);
});

test('filterItems ignores accents and case, and needs every word', () => {
  const items = [{ name: 'Aldé Roberge' }, { name: 'Bureau', sub: 'Montréal' }, { name: 'Maison' }];
  assert.deepEqual(JSON.parse(JSON.stringify(CE.filterItems(items, 'alde').map((i) => i.name))), ['Aldé Roberge']);
  assert.deepEqual(JSON.parse(JSON.stringify(CE.filterItems(items, 'montreal bur').map((i) => i.name))), ['Bureau']);
  assert.equal(CE.filterItems(items, '').length, 3);
  assert.equal(CE.filterItems(items, 'zzz').length, 0);
});

test('nextPlaces sets or clears one slot without touching the others', () => {
  const base = { at: { id: 'p1', name: 'Bureau' }, via: [{ id: 'p9', name: 'Gare' }] };
  const set = CE.nextPlaces(base, 'from', { id: 'p2', name: 'Maison', extra: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(set.from)), { id: 'p2', name: 'Maison' });
  assert.deepEqual(JSON.parse(JSON.stringify(set.at)), base.at);
  assert.deepEqual(JSON.parse(JSON.stringify(set.via)), base.via);
  assert.equal(base.from, undefined, 'the input is not mutated');
  assert.equal(CE.nextPlaces(set, 'at', null).at, undefined);
});

test('placeChips lists Où, De, Vers in that order and skips empty slots', () => {
  const chips = CE.placeChips({ to: { name: 'Gare' }, at: { name: 'Bureau' }, from: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(chips.map((c) => c.slot + ':' + c.name))), ['at:Bureau', 'to:Gare']);
  assert.deepEqual(JSON.parse(JSON.stringify(CE.placeChips(null))), []);
});

test('samePerson matches a contact linked to a Trello member', () => {
  assert.equal(CE.samePerson({ id: 'm1' }, { id: 'm1' }), true);
  assert.equal(CE.samePerson({ id: 'c1', trelloId: 'm1' }, { id: 'm1' }), true);
  assert.equal(CE.samePerson({ id: 'c1' }, { id: 'c2' }), false);
});
