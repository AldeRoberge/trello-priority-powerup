'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('GanttTrello subtask mutations', () => {
  let GanttTrello;
  let CompletionTrello;

  before(() => {
    loadComponent('completion/completion-trello.js');
    loadComponent('gantt/gantt-model.js');
    loadComponent('gantt/gantt-trello.js');
    CompletionTrello = global.CompletionTrello;
    GanttTrello = global.GanttTrello;
    assert.ok(CompletionTrello);
    assert.ok(GanttTrello);
  });

  function fakeT(store) {
    return {
      get(scope, visibility, key) {
        const bucket = store[scope] || {};
        return Promise.resolve(bucket[key]);
      },
      set(scope, visibility, key, value) {
        if (!store[scope]) store[scope] = {};
        store[scope][key] = value;
        return Promise.resolve();
      },
    };
  }

  it('removeTopLevelItem drops the matching item', () => {
    const data = CompletionTrello.normalizeCompletionData({
      items: [
        { id: 'a', text: 'Keep', progress: 0 },
        { id: 'b', text: 'Drop', progress: 50 },
      ],
    });
    const next = GanttTrello.removeTopLevelItem(data, 'b');
    assert.equal(next.items.length, 1);
    assert.equal(next.items[0].id, 'a');
  });

  it('setSubtaskDone marks a local item complete and persists', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [{ id: 's1', text: 'Sub', progress: 20 }],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.setSubtaskDone(
      t,
      { kind: 'local', parentCardId: 'parent', itemId: 's1' },
      true
    );
    assert.equal(res.ok, true);
    const saved = store.parent.cardCompletion;
    assert.equal(saved.items[0].progress, 100);
    assert.equal(saved.items[0].done, true);
  });

  it('deleteSubtask removes a local item', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [
            { id: 's1', text: 'Sub', progress: 0 },
            { id: 's2', text: 'Keep', progress: 10 },
          ],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.deleteSubtask(t, {
      kind: 'local',
      parentCardId: 'parent',
      itemId: 's1',
    });
    assert.equal(res.ok, true);
    assert.equal(store.parent.cardCompletion.items.length, 1);
    assert.equal(store.parent.cardCompletion.items[0].id, 's2');
  });

  it('deleteSubtask unlinks a nested linked card', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [
            { id: 'lk', text: 'Child', progress: 0, linkedCardId: 'child' },
            { id: 'loc', text: 'Local', progress: 0 },
          ],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.deleteSubtask(t, {
      kind: 'card',
      cardId: 'child',
      linkParentCardId: 'parent',
    });
    assert.equal(res.ok, true);
    assert.equal(store.parent.cardCompletion.items.length, 1);
    assert.equal(store.parent.cardCompletion.items[0].id, 'loc');
  });

  it('setSubtaskDone toggles checklist item progress', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [
            {
              id: 'sub',
              text: 'Sub',
              progress: 0,
              items: [{ id: 'c1', text: 'Check', progress: 0 }],
            },
          ],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.setSubtaskDone(
      t,
      {
        kind: 'checklist',
        parentCardId: 'parent',
        parentItemId: 'sub',
        itemId: 'c1',
      },
      true
    );
    assert.equal(res.ok, true);
    const nested = store.parent.cardCompletion.items[0].items[0];
    assert.equal(nested.progress, 100);
    assert.equal(nested.done, true);
  });
});
