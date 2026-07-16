'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('task types catalog', () => {
  let PriorityUI;

  before(() => {
    clearComponentCache();
    loadComponent('priority/priority-ui.js');
    PriorityUI = global.PriorityUI;
    assert.ok(PriorityUI);
  });

  afterEach(() => {
    PriorityUI.setCustomTaskTypes([]);
  });

  it('includes Matériel and other built-in types', () => {
    const ids = PriorityUI.TASK_TYPES.map((e) => e.id);
    assert.ok(ids.includes('material'));
    assert.ok(ids.includes('learning'));
    assert.ok(ids.includes('admin'));
    assert.ok(ids.includes('creative'));
    assert.ok(ids.includes('finance'));
    const material = PriorityUI.TASK_TYPES.find((e) => e.id === 'material');
    assert.equal(material.label, 'Matériel');
  });

  it('exposes SVG icons for every built-in type', () => {
    for (const entry of PriorityUI.TASK_TYPES) {
      const svg = PriorityUI.taskTypeIconSvg(entry.id);
      assert.ok(svg.includes('<svg'), `missing svg for ${entry.id}`);
      assert.ok(svg.includes('viewBox="0 0 16 16"'));
    }
  });

  it('normalizes known ids and drops unknowns', () => {
    assert.deepEqual(
      PriorityUI.normalizeTaskTypes(['action', 'bogus', 'material', 'action']),
      ['action', 'material']
    );
  });

  it('keeps orphan custom-* ids until catalog loads', () => {
    assert.deepEqual(
      PriorityUI.normalizeTaskTypes(['custom-outils-ab12', 'nope']),
      ['custom-outils-ab12']
    );
    assert.equal(PriorityUI.isCustomTaskTypeId('custom-outils-ab12'), true);
  });

  it('creates and merges board custom types', () => {
    const created = PriorityUI.createCustomTaskType(
      { label: 'Outils', icon: 'material' },
      { apply: true }
    );
    assert.ok(created);
    assert.ok(created.id.startsWith('custom-outils-'));
    assert.equal(created.icon, 'material');
    assert.ok(PriorityUI.isValidTaskTypeId(created.id));
    assert.equal(PriorityUI.taskTypeLabel(created.id), 'Outils');

    const catalog = PriorityUI.getTaskTypeCatalog();
    assert.ok(catalog.some((e) => e.id === created.id));
    assert.deepEqual(PriorityUI.normalizeTaskTypes([created.id, 'action']), [
      created.id,
      'action',
    ]);
  });

  it('rejects duplicate custom labels (case-insensitive)', () => {
    PriorityUI.createCustomTaskType({ label: 'Atelier' }, { apply: true });
    const dup = PriorityUI.createCustomTaskType(
      { label: 'atelier' },
      { apply: false }
    );
    assert.equal(dup, null);
  });

  it('normalizeCustomTaskTypes de-dupes and caps structure', () => {
    const list = PriorityUI.normalizeCustomTaskTypes([
      { id: 'custom-a-aaaa', label: 'Alpha', icon: 'finance' },
      { id: 'custom-a-aaaa', label: 'Alpha again' },
      { label: 'Beta', icon: 'not-a-real-icon' },
      { label: '' },
      null,
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0].label, 'Alpha');
    assert.equal(list[0].icon, 'finance');
    assert.equal(list[1].label, 'Beta');
    assert.equal(list[1].icon, 'custom');
  });
});
