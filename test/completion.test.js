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

  it('syncCardDueCompleteFromProgress reopens rolled recurring tasks', async () => {
    const previousPT = global.PriorityTrello;
    const previousStatut = global.StatutTrello;
    const store = new Map();
    const t = {
      async get(_scope, _vis, key) {
        return store.get(key);
      },
      async set(_scope, _vis, key, value) {
        store.set(key, value);
      },
    };

    global.PriorityTrello = {
      setCardDueComplete: async () => ({
        ok: true,
        changed: true,
        rolled: true,
        dueComplete: false,
        inputs: { dueDate: '2026-07-17', dueTime: '08:00' },
      }),
    };
    global.StatutTrello = {
      restorePreviousStatutFromIncomplete: async () => ({ ok: true, restored: true }),
    };

    try {
      const result = await CT.syncCardDueCompleteFromProgress(t, { items: [], progress: 100 });
      assert.equal(result.rolled, true);
      assert.equal(result.dueComplete, false);
      assert.equal(result.completion.progress, 0);
      assert.equal(store.get(CT.CARD_COMPLETION_KEY).progress, 0);
      assert.equal(store.get(CT.COMPLETION_MARKED_DUE_COMPLETE_KEY), false);
    } finally {
      global.PriorityTrello = previousPT;
      global.StatutTrello = previousStatut;
    }
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

  it('normalizeItem derives subtask progress from nested checklist', () => {
    const item = CT.normalizeItem({
      id: 'parent',
      text: 'Parent',
      progress: 0,
      items: [
        { id: 'c1', text: 'Check A', progress: 100 },
        { id: 'c2', text: 'Check B', progress: 0 },
      ],
    });
    assert.ok(item);
    assert.equal(item.items.length, 2);
    assert.equal(item.progress, 50);
    assert.equal(item.done, false);
  });

  it('normalizeItem strips checklist nesting and links on depth-2 items', () => {
    const item = CT.normalizeItem({
      id: 'parent',
      text: 'Parent',
      items: [
        {
          id: 'c1',
          text: 'Nested',
          progress: 0,
          linkedCardId: 'should-strip',
          blocked: true,
          items: [{ id: 'too-deep', text: 'No', progress: 100 }],
        },
      ],
    });
    assert.equal(item.items.length, 1);
    assert.equal(!!item.items[0].linkedCardId, false);
    assert.equal(!!item.items[0].blocked, false);
    assert.equal(Array.isArray(item.items[0].items), false);
  });

  it('checklist weights roll up into card progress', () => {
    const data = CT.normalizeCompletionData({
      items: [
        {
          id: 's1',
          text: 'Sub',
          items: [
            { id: 'a', text: 'A', progress: 100, estimatedMinutes: 60 },
            { id: 'b', text: 'B', progress: 0, estimatedMinutes: 60 },
          ],
        },
        { id: 's2', text: 'Other', progress: 0, estimatedMinutes: 120 },
      ],
    });
    // s1 derived 50% weight 120; s2 0% weight 120 → overall 25%
    const progress = CT.computeCardProgress(data);
    assert.equal(data.items[0].progress, 50);
    assert.equal(progress.percent, 25);
  });

  it('applyMasterProgress scales nested checklist and preserves structure', () => {
    const scaled = CT.applyMasterProgress(
      [
        {
          id: 's1',
          text: 'With checklist',
          progress: 50,
          items: [
            { id: 'a', text: 'A', progress: 100 },
            { id: 'b', text: 'B', progress: 0 },
          ],
        },
      ],
      100
    );
    assert.equal(scaled[0].items.length, 2);
    assert.equal(scaled[0].items[0].progress, 100);
    assert.equal(scaled[0].items[1].progress, 100);
    assert.equal(scaled[0].progress, 100);
    assert.equal(scaled[0].done, true);
  });

  it('applyItemProgress scales checklist when parent slider moves', () => {
    const start = CT.normalizeCompletionData({
      items: [
        {
          id: 's1',
          text: 'Sub',
          items: [
            { id: 'a', text: 'A', progress: 0 },
            { id: 'b', text: 'B', progress: 0 },
          ],
        },
      ],
    });
    const next = CT.applyItemProgress(start, 's1', 100);
    assert.equal(next.items[0].progress, 100);
    assert.equal(next.items[0].items[0].progress, 100);
    assert.equal(next.items[0].items[1].progress, 100);
  });

  it('addChecklistItem and removeChecklistItem update derived progress', () => {
    let data = CT.normalizeCompletionData({
      items: [{ id: 's1', text: 'Sub', progress: 0 }],
    });
    const added = CT.addChecklistItem(data, 's1', 'Step one');
    data = added.data;
    assert.ok(added.item);
    assert.equal(data.items[0].items.length, 1);
    assert.equal(data.items[0].progress, 0);

    data = CT.applyChecklistItemProgress(data, 's1', added.item.id, 100);
    assert.equal(data.items[0].progress, 100);
    assert.equal(data.items[0].done, true);

    data = CT.removeChecklistItem(data, 's1', added.item.id);
    assert.equal(Array.isArray(data.items[0].items), false);
    assert.equal(data.items[0].progress, 100);
  });

  it('buildChildCompletionFromSubtask and replaceSubtaskWithLinkedCard', () => {
    const withChecklist = CT.normalizeItem({
      id: 's1',
      text: 'Promote me',
      items: [
        { id: 'a', text: 'A', progress: 100 },
        { id: 'b', text: 'B', progress: 0 },
      ],
    });
    const child = CT.buildChildCompletionFromSubtask(withChecklist);
    assert.equal(child.items.length, 2);
    assert.equal(child.items[0].text, 'A');

    const leaf = CT.normalizeItem({
      id: 's2',
      text: 'Leaf',
      progress: 40,
      estimatedMinutes: 30,
    });
    const leafChild = CT.buildChildCompletionFromSubtask(leaf);
    assert.equal(leafChild.items.length, 0);
    assert.equal(leafChild.progress, 40);
    assert.equal(leafChild.estimatedMinutes, 30);

    const parentData = CT.normalizeCompletionData({
      items: [withChecklist, { id: 'keep', text: 'Keep', progress: 10 }],
    });
    const replaced = CT.replaceSubtaskWithLinkedCard(
      parentData,
      's1',
      'card-new-1'
    );
    assert.equal(replaced.ok, true);
    assert.equal(CT.itemLinkedCardId(replaced.data.items[0]), 'card-new-1');
    assert.equal(Array.isArray(replaced.data.items[0].items), false);
    assert.equal(replaced.data.items[1].id, 'keep');
  });

  it('itemEstimatedMinutes prefers checklist sum unless parent estimate locked', () => {
    const unlocked = CT.normalizeItem({
      id: 's1',
      text: 'Sub',
      estimatedMinutes: 999,
      items: [
        { id: 'a', text: 'A', progress: 0, estimatedMinutes: 30 },
        { id: 'b', text: 'B', progress: 0, estimatedMinutes: 30 },
      ],
    });
    assert.equal(CT.itemEstimatedMinutes(unlocked), 60);

    const locked = CT.normalizeItem({
      id: 's2',
      text: 'Sub',
      estimatedMinutes: 999,
      estimatedMinutesLocked: true,
      items: [
        { id: 'a', text: 'A', progress: 0, estimatedMinutes: 30 },
        { id: 'b', text: 'B', progress: 0, estimatedMinutes: 30 },
      ],
    });
    assert.equal(CT.itemEstimatedMinutes(locked), 999);
  });
});
