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

  it('deleteSubtask archives a top-level board card via REST', async () => {
    const previousPT = global.PriorityTrello;
    const puts = [];
    global.PriorityTrello = {
      isRestAuthorized: async () => true,
      restPutCard: async (_t, cardId, body) => {
        puts.push({ cardId, body });
        return { ok: true };
      },
    };
    try {
      const res = await GanttTrello.deleteSubtask(fakeT({}), {
        kind: 'card',
        cardId: 'root-card',
      });
      assert.equal(res.ok, true);
      assert.equal(res.archived, true);
      assert.equal(puts.length, 1);
      assert.equal(puts[0].cardId, 'root-card');
      assert.deepEqual(puts[0].body, { closed: true });
    } finally {
      global.PriorityTrello = previousPT;
    }
  });

  it('renameSubtask renames a top-level board card via REST', async () => {
    const previousPT = global.PriorityTrello;
    const puts = [];
    global.PriorityTrello = {
      isRestAuthorized: async () => true,
      restPutCard: async (_t, cardId, body) => {
        puts.push({ cardId, body });
        return { ok: true };
      },
    };
    try {
      const res = await GanttTrello.renameSubtask(
        fakeT({}),
        { kind: 'card', cardId: 'root-card' },
        'Renamed root'
      );
      assert.equal(res.ok, true);
      assert.equal(res.name, 'Renamed root');
      assert.equal(res.cardNameUpdated, true);
      assert.equal(puts.length, 1);
      assert.deepEqual(puts[0].body, { name: 'Renamed root' });
    } finally {
      global.PriorityTrello = previousPT;
    }
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

  it('renameSubtask updates local item text', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [{ id: 's1', text: 'Old', progress: 0 }],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.renameSubtask(
      t,
      { kind: 'local', parentCardId: 'parent', itemId: 's1' },
      '  New title  '
    );
    assert.equal(res.ok, true);
    assert.equal(res.name, 'New title');
    assert.equal(store.parent.cardCompletion.items[0].text, 'New title');
  });

  it('renameSubtask updates checklist item text', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [
            {
              id: 'sub',
              text: 'Sub',
              progress: 0,
              items: [{ id: 'c1', text: 'Old check', progress: 0 }],
            },
          ],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.renameSubtask(
      t,
      {
        kind: 'checklist',
        parentCardId: 'parent',
        parentItemId: 'sub',
        itemId: 'c1',
      },
      'Renamed check'
    );
    assert.equal(res.ok, true);
    assert.equal(
      store.parent.cardCompletion.items[0].items[0].text,
      'Renamed check'
    );
  });

  it('renameSubtask rejects empty names', async () => {
    const store = {
      parent: {
        cardCompletion: {
          items: [{ id: 's1', text: 'Keep', progress: 0 }],
        },
      },
    };
    const t = fakeT(store);
    const res = await GanttTrello.renameSubtask(
      t,
      { kind: 'local', parentCardId: 'parent', itemId: 's1' },
      '   '
    );
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'empty');
    assert.equal(store.parent.cardCompletion.items[0].text, 'Keep');
  });
});

describe('GanttTrello dates', () => {
  let GanttTrello;
  let previousPT;

  before(() => {
    loadComponent('priority/priority-ui.js');
    loadComponent('completion/completion-trello.js');
    loadComponent('gantt/gantt-model.js');
    loadComponent('gantt/gantt-trello.js');
    GanttTrello = global.GanttTrello;
    previousPT = global.PriorityTrello;
  });

  function withPriorityTrello(mock, fn) {
    global.PriorityTrello = mock;
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        global.PriorityTrello = previousPT;
      });
  }

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

  it('resolveCardDates prefers plugin inputs then Trello fields', () => {
    assert.deepEqual(
      GanttTrello.resolveCardDates(
        { due: '2026-07-10T12:00:00.000Z', start: '2026-07-01T12:00:00.000Z' },
        { startDate: '2026-07-02', dueDate: '2026-07-09', dueTime: '15:30' }
      ),
      {
        startDate: '2026-07-02',
        dueDate: '2026-07-09',
        startTime: '',
        dueTime: '15:30',
      }
    );
    const fromTrello = GanttTrello.resolveCardDates(
      { due: '2026-07-10T12:00:00.000Z', start: '2026-07-01T12:00:00.000Z' },
      null
    );
    assert.equal(fromTrello.startDate, '2026-07-01');
    assert.equal(fromTrello.dueDate, '2026-07-10');
    assert.equal(typeof fromTrello.startTime, 'string');
    assert.equal(typeof fromTrello.dueTime, 'string');
  });

  it('buildInputsForDates sets and clears start/due times', async () => {
    await withPriorityTrello(
      {
        DEFAULT_INPUTS: { urgency: 2, impact: 2, ease: 3 },
        normalizeInputs: (x) => x,
      },
      () => {
        const withDates = GanttTrello.buildInputsForDates(
          { urgency: 3, impact: 2, ease: 3 },
          '2026-07-01',
          '2026-07-10',
          '09:00',
          '08:15'
        );
        assert.equal(withDates.startDate, '2026-07-01');
        assert.equal(withDates.dueDate, '2026-07-10');
        assert.equal(withDates.dueTime, '09:00');
        assert.equal(withDates.startTime, '08:15');

        const cleared = GanttTrello.buildInputsForDates(
          withDates,
          '',
          '',
          '',
          ''
        );
        assert.equal(cleared.startDate, undefined);
        assert.equal(cleared.dueDate, undefined);
        assert.equal(cleared.dueTime, undefined);
        assert.equal(cleared.startTime, undefined);
      }
    );
  });

  it('saveCardDates writes plugin keys and REST due/start', async () => {
    const store = {};
    const puts = [];
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        CARD_DUE_SYNCED_KEY: 'cardDueSyncedIso',
        CARD_START_SYNCED_KEY: 'cardStartSyncedIso',
        DEFAULT_INPUTS: { urgency: 2, impact: 2, ease: 3 },
        normalizeInputs: (x) => x,
        isRestAuthorized: async () => true,
        getCardInputsById: async () => ({ urgency: 2, impact: 2, ease: 3 }),
        restPutCard: async (_t, cardId, body) => {
          puts.push({ cardId, body });
          return { ok: true };
        },
      },
      async () => {
        const t = fakeT(store);
        const res = await GanttTrello.saveCardDates(t, 'card1', {
          startDate: '2026-07-01',
          dueDate: '2026-07-05',
        });
        assert.equal(res.ok, true);
        assert.equal(store.card1.cardPriority.startDate, '2026-07-01');
        assert.equal(store.card1.cardPriority.dueDate, '2026-07-05');
        assert.ok(store.card1.cardDueSyncedIso);
        assert.ok(store.card1.cardStartSyncedIso);
        assert.equal(puts.length, 1);
        assert.equal(puts[0].cardId, 'card1');
        assert.ok(puts[0].body.due);
        assert.ok(puts[0].body.start);
      }
    );
  });

  it('saveCardDates persists startTime and dueTime', async () => {
    const store = {};
    const puts = [];
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        CARD_DUE_SYNCED_KEY: 'cardDueSyncedIso',
        CARD_START_SYNCED_KEY: 'cardStartSyncedIso',
        DEFAULT_INPUTS: { urgency: 2, impact: 2, ease: 3 },
        normalizeInputs: (x) => x,
        isRestAuthorized: async () => true,
        getCardInputsById: async () => ({ urgency: 2, impact: 2, ease: 3 }),
        restPutCard: async (_t, cardId, body) => {
          puts.push({ cardId, body });
          return { ok: true };
        },
      },
      async () => {
        const t = fakeT(store);
        const res = await GanttTrello.saveCardDates(t, 'card1', {
          startDate: '2026-07-22',
          dueDate: '2026-07-22',
          startTime: '08:15',
          dueTime: '16:45',
        });
        assert.equal(res.ok, true);
        assert.equal(store.card1.cardPriority.startTime, '08:15');
        assert.equal(store.card1.cardPriority.dueTime, '16:45');
        assert.equal(res.startTime, '08:15');
        assert.equal(res.dueTime, '16:45');
        assert.ok(puts[0].body.start);
        assert.ok(puts[0].body.due);
      }
    );
  });

  it('normalizeGanttSettings defaults to 08:15–16:45', () => {
    assert.deepEqual(GanttTrello.normalizeGanttSettings(null), {
      dayStart: '08:15',
      dayEnd: '16:45',
    });
    assert.deepEqual(
      GanttTrello.normalizeGanttSettings({ dayStart: '9:00', dayEnd: '17:30' }),
      { dayStart: '09:00', dayEnd: '17:30' }
    );
  });

  it('saveCardDates clears start and due via REST nulls', async () => {
    const store = {
      card1: {
        cardPriority: {
          urgency: 2,
          impact: 2,
          ease: 3,
          startDate: '2026-07-01',
          dueDate: '2026-07-05',
          dueTime: '09:00',
        },
        cardDueSyncedIso: '2026-07-05T13:00:00.000Z',
        cardStartSyncedIso: '2026-07-01T12:00:00.000Z',
      },
    };
    const puts = [];
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        CARD_DUE_SYNCED_KEY: 'cardDueSyncedIso',
        CARD_START_SYNCED_KEY: 'cardStartSyncedIso',
        DEFAULT_INPUTS: { urgency: 2, impact: 2, ease: 3 },
        normalizeInputs: (x) => x,
        isRestAuthorized: async () => true,
        getCardInputsById: async () => store.card1.cardPriority,
        restPutCard: async (_t, cardId, body) => {
          puts.push({ cardId, body });
          return { ok: true };
        },
      },
      async () => {
        const t = fakeT(store);
        const res = await GanttTrello.saveCardDates(t, 'card1', {
          startDate: '',
          dueDate: '',
          dueTime: '',
        });
        assert.equal(res.ok, true);
        assert.equal(store.card1.cardPriority.startDate, undefined);
        assert.equal(store.card1.cardPriority.dueDate, undefined);
        assert.equal(store.card1.cardPriority.dueTime, undefined);
        assert.equal(store.card1.cardDueSyncedIso, '');
        assert.equal(store.card1.cardStartSyncedIso, '');
        assert.equal(puts.length, 1);
        assert.deepEqual(puts[0].body, { due: null, start: null });
      }
    );
  });

  it('saveCardDates rejects missing card id', async () => {
    const res = await GanttTrello.saveCardDates(fakeT({}), '', {
      startDate: '2026-07-01',
      dueDate: '2026-07-01',
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'no-card-id');
  });

  it('clearCardBlocked clears enAttente and persists', async () => {
    assert.equal(typeof GanttTrello.clearCardBlocked, 'function');
    const store = {};
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        getCardInputsById: async () => ({
          urgency: 2,
          impact: 2,
          ease: 3,
          enAttente: true,
          blockedReasons: ['Attente'],
        }),
        clearBlockedFromInputs: (inputs) => ({
          urgency: inputs.urgency,
          impact: inputs.impact,
          ease: inputs.ease,
        }),
        normalizeInputs: (inputs) => inputs,
      },
      async () => {
        const res = await GanttTrello.clearCardBlocked(fakeT(store), 'card1');
        assert.equal(res.ok, true);
        assert.equal(res.cardId, 'card1');
        assert.equal(store.card1.cardPriority.enAttente, undefined);
        assert.equal(store.card1.cardPriority.urgency, 2);
      }
    );
  });

  it('setCardBlocked enables enAttente without Motifs', async () => {
    assert.equal(typeof GanttTrello.setCardBlocked, 'function');
    const store = {};
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        getCardInputsById: async () => ({
          urgency: 2,
          impact: 2,
          ease: 3,
        }),
        normalizeInputs: (inputs) => inputs,
      },
      async () => {
        const res = await GanttTrello.setCardBlocked(fakeT(store), 'card1', true);
        assert.equal(res.ok, true);
        assert.equal(res.blocked, true);
        assert.equal(store.card1.cardPriority.enAttente, true);
        assert.equal(store.card1.cardPriority.urgency, 2);
      }
    );
  });

  it('setCardBlocked is a no-op when already in the requested state', async () => {
    const store = {};
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        getCardInputsById: async () => ({
          urgency: 1,
          impact: 1,
          ease: 1,
          enAttente: true,
        }),
        normalizeInputs: (inputs) => inputs,
      },
      async () => {
        const res = await GanttTrello.setCardBlocked(fakeT(store), 'card1', true);
        assert.equal(res.ok, true);
        assert.equal(res.already, true);
        assert.equal(store.card1, undefined);
      }
    );
  });

  it('setCardBlocked seeds DEFAULT_INPUTS when enabling with no stored inputs', async () => {
    const store = {};
    await withPriorityTrello(
      {
        CARD_PRIORITY_KEY: 'cardPriority',
        DEFAULT_INPUTS: { urgency: 2, impact: 2, ease: 3 },
        getCardInputsById: async () => null,
        normalizeInputs: (inputs) => inputs,
      },
      async () => {
        const res = await GanttTrello.setCardBlocked(fakeT(store), 'card1', true);
        assert.equal(res.ok, true);
        assert.equal(store.card1.cardPriority.enAttente, true);
        assert.equal(store.card1.cardPriority.urgency, 2);
        assert.equal(store.card1.cardPriority.priorityEnabled, false);
      }
    );
  });

  it('resolveStateSectionListId picks started, pending, and blocked lists', () => {
    const lists = [
      { id: 'l-triage', name: 'Inbox' },
      { id: 'l-start', name: 'Doing' },
      { id: 'l-wait', name: 'Todo' },
      { id: 'l-block', name: 'Blocked' },
    ];
    const settings = {
      listCategories: {
        'l-triage': 'triage',
        'l-start': 'started',
        'l-wait': 'unstarted',
        'l-block': 'blocked',
      },
      roleLists: { blocked: 'l-block' },
    };
    assert.equal(
      GanttTrello.resolveStateSectionListId(lists, settings, 'started'),
      'l-start'
    );
    assert.equal(
      GanttTrello.resolveStateSectionListId(lists, settings, 'pending'),
      'l-wait'
    );
    assert.equal(
      GanttTrello.resolveStateSectionListId(lists, settings, 'blocked'),
      'l-block'
    );
    assert.equal(
      GanttTrello.firstListIdForCategories(lists, settings, ['backlog', 'triage']),
      'l-triage'
    );
  });

  it('moveCardToStateSection clears blocked and moves to started list', async () => {
    const store = {};
    const puts = [];
    const previousST = global.StatutTrello;
    global.StatutTrello = {
      ensureStatutSettings: async () => ({
        settings: {
          listCategories: { 'list-started': 'started', 'list-todo': 'unstarted' },
          roleLists: { blocked: null },
        },
      }),
      getBoardLists: async () => [
        { id: 'list-started', name: 'Doing' },
        { id: 'list-todo', name: 'Todo' },
      ],
    };
    try {
      await withPriorityTrello(
        {
          CARD_PRIORITY_KEY: 'cardPriority',
          getCardInputsById: async () => ({
            urgency: 2,
            impact: 2,
            ease: 3,
            enAttente: true,
          }),
          clearBlockedFromInputs: (inputs) => ({
            urgency: inputs.urgency,
            impact: inputs.impact,
            ease: inputs.ease,
          }),
          normalizeInputs: (inputs) => inputs,
          restPutCard: async (_t, cardId, body) => {
            puts.push({ cardId, body });
            return { ok: true };
          },
        },
        async () => {
          const res = await GanttTrello.moveCardToStateSection(
            fakeT(store),
            'card1',
            'started'
          );
          assert.equal(res.ok, true);
          assert.equal(res.sectionKey, 'started');
          assert.equal(res.listId, 'list-started');
          assert.equal(res.moved, true);
          assert.equal(store.card1.cardPriority.enAttente, undefined);
          assert.equal(puts.length, 1);
          assert.equal(puts[0].cardId, 'card1');
          assert.equal(puts[0].body.idList, 'list-started');
        }
      );
    } finally {
      global.StatutTrello = previousST;
    }
  });

  it('moveCardToStateSection sets blocked and moves to blocked list', async () => {
    const store = {};
    const puts = [];
    const previousST = global.StatutTrello;
    global.StatutTrello = {
      ensureStatutSettings: async () => ({
        settings: {
          listCategories: { 'list-block': 'blocked' },
          roleLists: { blocked: 'list-block' },
        },
      }),
      getBoardLists: async () => [{ id: 'list-block', name: 'Blocked' }],
    };
    try {
      await withPriorityTrello(
        {
          CARD_PRIORITY_KEY: 'cardPriority',
          DEFAULT_INPUTS: { urgency: 2, impact: 2, ease: 3 },
          getCardInputsById: async () => ({
            urgency: 1,
            impact: 1,
            ease: 2,
          }),
          normalizeInputs: (inputs) => inputs,
          restPutCard: async (_t, cardId, body) => {
            puts.push({ cardId, body });
            return { ok: true };
          },
        },
        async () => {
          const res = await GanttTrello.moveCardToStateSection(
            fakeT(store),
            'card9',
            'blocked'
          );
          assert.equal(res.ok, true);
          assert.equal(res.sectionKey, 'blocked');
          assert.equal(res.listId, 'list-block');
          assert.equal(store.card9.cardPriority.enAttente, true);
          assert.equal(puts[0].body.idList, 'list-block');
        }
      );
    } finally {
      global.StatutTrello = previousST;
    }
  });

  it('loadBoard builds nest tree from board cards', async () => {
    await withPriorityTrello(
      {
        getCardInputsById: async (_t, id) =>
          id === 'parent'
            ? { dueDate: '2026-07-20' }
            : { startDate: '2026-07-18', dueDate: '2026-07-19' },
        ensureBoardPriorityContext: async () => ({}),
        computeDisplay: () => ({ score: 5, tierI: 2, label: 'Normal' }),
        prioritySortRank: () => ({ tier: 2, score: 5 }),
      },
      async () => {
        const t = {
          lists: async () => [{ id: 'L1', name: 'Doing' }],
          cards: async () => [
            {
              id: 'parent',
              name: 'Parent',
              idList: 'L1',
              due: '2026-07-20T12:00:00.000Z',
              pos: 1,
            },
            {
              id: 'child',
              name: 'Child',
              idList: 'L1',
              start: '2026-07-18T12:00:00.000Z',
              due: '2026-07-19T12:00:00.000Z',
              pos: 2,
            },
          ],
          get(scope, _v, key) {
            if (key === 'cardCompletion' && scope === 'parent') {
              return Promise.resolve({
                items: [
                  {
                    id: 'lk',
                    text: 'Child link',
                    linkedCardId: 'child',
                    progress: 0,
                  },
                ],
              });
            }
            if (key === 'cardCompletion') {
              return Promise.resolve({ items: [] });
            }
            return Promise.resolve(undefined);
          },
          set() {
            return Promise.resolve();
          },
        };

        const data = await GanttTrello.loadBoard(t);
        assert.equal(data.cards.length, 2);
        assert.equal(data.tree.length, 1);
        assert.equal(data.tree[0].cardId, 'parent');
        assert.equal(data.tree[0].children.length, 1);
        assert.equal(data.tree[0].children[0].cardId, 'child');
      }
    );
  });
});
