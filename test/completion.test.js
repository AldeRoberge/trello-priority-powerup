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

  it('restoreProgressLeavingComplete restores prior incomplete progress', () => {
    assert.equal(typeof CT.restoreProgressLeavingComplete, 'function');
    const previous = CT.normalizeCompletionData({
      items: [
        { id: 'a', text: 'A', progress: 40 },
        { id: 'b', text: 'B', progress: 80 },
      ],
    });
    const done = CT.markFullyComplete(previous);
    const restored = CT.restoreProgressLeavingComplete(done, previous);
    assert.equal(restored.items[0].progress, 40);
    assert.equal(restored.items[1].progress, 80);
    assert.equal(CT.isAllSubtasksComplete(restored), false);
  });

  it('restoreProgressLeavingComplete falls back to 99% when prior was complete', () => {
    const done = CT.markFullyComplete({ items: [], progress: 100 });
    const restored = CT.restoreProgressLeavingComplete(done, done);
    assert.equal(restored.progress, CT.PROGRESS_NEAR_COMPLETE);
    assert.equal(CT.isAllSubtasksComplete(restored), false);

    const noPrevious = CT.restoreProgressLeavingComplete(
      { items: [{ id: 'a', text: 'A', progress: 100 }] },
      null
    );
    assert.equal(noPrevious.items[0].progress, 99);
    assert.equal(CT.isAllSubtasksComplete(noPrevious), false);
  });

  it('restoreProgressLeavingComplete is a no-op when already incomplete', () => {
    const mid = CT.normalizeCompletionData({ items: [], progress: 55 });
    const out = CT.restoreProgressLeavingComplete(mid, null);
    assert.equal(out.progress, 55);
  });

  it('applyMasterProgress preserves item blocked flags (not done)', () => {
    const scaled = CT.applyMasterProgress(
      [
        {
          id: 'pb1',
          text: 'Bloquée',
          progress: 20,
          blocked: true,
          blockedReasons: ["En attente d'un câble"],
        },
        { id: 'pb2', text: 'Libre', progress: 40 },
      ],
      50
    );
    assert.equal(scaled[0].blocked, true);
    assert.deepEqual(scaled[0].blockedReasons, ["En attente d'un câble"]);
    assert.equal(!!scaled[1].blocked, false);
  });

  it('applyMasterProgress clears blocked when scaling to 100%', () => {
    const atMax = CT.applyMasterProgress(
      [{ id: 'done-block', text: 'X', progress: 50, blocked: true }],
      100
    );
    assert.equal(atMax[0].done, true);
    assert.equal(!!atMax[0].blocked, false);
  });

  it('formatMasterReasonsSummary compact Motifs line', () => {
    assert.equal(typeof CUI.formatMasterReasonsSummary, 'function');
    assert.equal(CUI.formatMasterReasonsSummary([]), 'Bloqué');
    assert.equal(
      CUI.formatMasterReasonsSummary(["En attente d'une réponse"]),
      "En attente d'une réponse"
    );
    assert.equal(
      CUI.formatMasterReasonsSummary(['Court A', 'Court B']),
      'Court A, Court B'
    );
    const long = CUI.formatMasterReasonsSummary([
      'Une raison assez longue pour dépasser',
      'Deuxième',
      'Troisième',
    ]);
    assert.match(long, /^Une raison assez longue pour dépasser \+2$/);
  });

  it('master details expand preference persists', () => {
    assert.equal(typeof CUI.loadMasterDetailsExpanded, 'function');
    assert.equal(typeof CUI.saveMasterDetailsExpanded, 'function');
    const key = CUI.MASTER_DETAILS_STORAGE_KEY;
    assert.ok(key);
    localStorage.removeItem(key);
    assert.equal(CUI.loadMasterDetailsExpanded(), true);
    CUI.saveMasterDetailsExpanded(false);
    assert.equal(CUI.loadMasterDetailsExpanded(), false);
    CUI.saveMasterDetailsExpanded(true);
    assert.equal(CUI.loadMasterDetailsExpanded(), true);
  });
});
