'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Completion progress', () => {
  let CT;
  let CUI;

  before(() => {
    loadComponent('priority/priority-trello.js');
    loadComponent('completion/completion-ui.js');
    loadComponent('completion/completion-trello.js');
    CT = global.CompletionTrello;
    CUI = global.CompletionUI;
    assert.ok(CT);
    assert.ok(CUI);
  });

  it('exports core progress helpers', () => {
    for (const name of [
      'normalizeCompletionData',
      'computeWeightedProgress',
      'clampProgress',
      'itemProgress',
      'isAllSubtasksComplete',
      'computeCardProgress',
    ]) {
      assert.equal(typeof CT[name], 'function', name);
    }
    assert.equal(CT.CARD_COMPLETION_KEY, 'cardCompletion');
  });

  it('clampProgress bounds to 0–100', () => {
    assert.equal(CT.clampProgress(-10), 0);
    assert.equal(CT.clampProgress(150), 100);
    assert.equal(CT.clampProgress(42), 42);
  });

  it('computeWeightedProgress averages equal items', () => {
    const result = CT.computeWeightedProgress([
      { text: 'a', done: true, progress: 100 },
      { text: 'b', done: false, progress: 0 },
    ]);
    assert.equal(result.percent, 50);
    assert.equal(result.doneCount, 1);
    assert.equal(result.totalCount, 2);
    assert.equal(result.hasItems, true);
  });

  it('normalizeCompletionData fills defaults', () => {
    const data = CT.normalizeCompletionData(null);
    assert.ok(data);
    assert.ok(Array.isArray(data.items));
    assert.equal(data.items.length, 0);
  });

  it('completion color schemes and badge colors', () => {
    assert.equal(CUI.DEFAULT_COMPLETION_SCHEME_KEY, 'traffic');
    assert.equal(Object.keys(CUI.COMPLETION_COLOR_SCHEMES).length, 5);
    assert.equal(CUI.completionTrelloBadgeColor(100), 'green');
    assert.equal(CUI.completionTrelloBadgeColor(0), 'light-gray');
    assert.match(CUI.completionColorForProgress(50), /^#[0-9a-f]{6}$/i);
    assert.notEqual(
      CUI.colorAtProgress('traffic', 0).toLowerCase(),
      CUI.colorAtProgress('traffic', 100).toLowerCase()
    );
    assert.notEqual(
      CUI.colorAtProgress('traffic', 99).toLowerCase(),
      CUI.colorAtProgress('traffic', 100).toLowerCase()
    );
  });

  it('custom gradient apply / restore', () => {
    const customStops = CUI.normalizeGradientStops([
      { p: 0, color: '#ff0000' },
      { p: 50, color: '#0000ff' },
      { p: 100, color: '#00ff00' },
    ]);
    CUI.applyCompletionGradient(customStops, 'custom');
    assert.equal(CUI.getActiveCompletionSchemeKey(), 'custom');
    CUI.applyCompletionColorScheme('traffic');
    assert.equal(CUI.getActiveCompletionSchemeKey(), 'traffic');
  });
});
