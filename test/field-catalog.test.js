'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('FieldCatalog', () => {
  let FC;

  before(() => {
    loadComponent('shared/field-catalog.js');
    FC = global.FieldCatalog;
    assert.ok(FC);
  });

  const labels = [
    { id: 'p1', name: 'Priority-Low', color: 'green' },
    { id: 'p2', name: 'Priority-VeryLow', color: 'blue' },
    { id: 'p3', name: 'Priority-High', color: 'red' },
    { id: 'l1', name: 'Location-Home', color: 'yellow' },
    { id: 'l2', name: 'Location-Work', color: 'orange' },
    { id: 'c1', name: 'Category-Maintenance', color: 'purple' },
    { id: 'm1', name: 'Money-Expense', color: 'pink' },
    { id: 'plain', name: 'Maison', color: 'sky' },
    { id: 'hyphen', name: 'follow-up', color: '' },
  ];

  it('splits a prefixed label into a field and a value', () => {
    assert.deepEqual(FC.splitName('Priority-Low'), { field: 'Priority', value: 'Low', kind: FC.KINDS[0] });
    assert.equal(FC.splitName('Maison'), null);
    assert.equal(FC.splitName('follow-up'), null);
    assert.equal(FC.pretty('VeryLow'), 'Very Low');
  });

  it('groups the bag into Priorité, Lieu, Catégorie and Argent', () => {
    const fields = FC.catalog(labels);
    assert.deepEqual(fields.map((f) => f.id), ['priority', 'place', 'category', 'money']);
    assert.deepEqual(fields.map((f) => f.label), ['Priorité', 'Lieu', 'Catégorie', 'Argent']);
    const priority = fields[0];
    assert.deepEqual(priority.options.map((o) => o.value), ['High', 'Low', 'VeryLow']);
    assert.deepEqual(FC.loose(labels).map((l) => l.name), ['Maison', 'follow-up']);
  });

  it('reads the value on the card and drops only that field', () => {
    const fields = FC.catalog(labels);
    const priority = fields[0];
    const onCard = [
      { id: 'p1', name: 'Priority-Low' },
      { id: 'l1', name: 'Location-Home' },
      { id: 'plain', name: 'Maison' },
    ];
    assert.deepEqual(FC.valueOn(priority, onCard), { id: 'p1', value: 'Low' });
    assert.deepEqual(FC.without(labels, ['p1', 'p3', 'l1', 'plain'], 'priority'), ['l1', 'plain']);
    assert.equal(FC.metaKey(fields[3]), 'money');
    assert.equal(FC.metaKey(priority), '');
  });

  it('merges Location and Lieu into one place field', () => {
    const fields = FC.catalog([
      { id: 'a', name: 'Location-Home' },
      { id: 'b', name: 'Lieu-Bureau' },
    ]);
    assert.equal(fields.length, 1);
    assert.equal(fields[0].id, 'place');
    assert.deepEqual(fields[0].options.map((o) => o.value).sort(), ['Bureau', 'Home']);
  });

  it('keeps an unknown Title-Value pair as its own choice field', () => {
    const fields = FC.catalog([{ id: 'e', name: 'Energy-High' }]);
    assert.equal(fields[0].kind, 'choice');
    assert.equal(fields[0].label, 'Energy');
    assert.equal(fields[0].options[0].value, 'High');
    assert.equal(FC.metaKey(fields[0]), 'f-energy');
  });
});
