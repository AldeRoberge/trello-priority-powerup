'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Recurrence (Échéance)', () => {
  let PriorityUI;
  let PriorityTrello;

  before(() => {
    clearComponentCache();
    loadComponent('priority/priority-ui.js');
    loadComponent('priority/priority-trello.js');
    PriorityUI = global.PriorityUI;
    PriorityTrello = global.PriorityTrello;
    assert.ok(PriorityUI);
    assert.ok(PriorityTrello);
  });

  it('exports recurrence helpers used by popup / connector / settings', () => {
    for (const name of [
      'normalizeRecurrence',
      'advanceDateByRecurrence',
      'nextOccurrenceParts',
      'formatRecurrenceLabelFr',
      'normalizeDueDate',
      'normalizeDueTime',
      'RECURRENCE_FREQUENCIES',
    ]) {
      assert.ok(PriorityUI[name] != null, name);
    }
    assert.deepEqual(PriorityUI.RECURRENCE_FREQUENCIES, [
      'daily',
      'weekly',
      'monthly',
      'yearly',
    ]);
  });

  it('normalizeRecurrence clamps interval and weekly weekdays', () => {
    assert.equal(PriorityUI.normalizeRecurrence(null), null);
    assert.equal(PriorityUI.normalizeRecurrence({ frequency: 'hourly' }), null);

    const daily = PriorityUI.normalizeRecurrence({
      frequency: 'daily',
      interval: 0,
    });
    assert.deepEqual(daily, { frequency: 'daily', interval: 1 });

    const capped = PriorityUI.normalizeRecurrence({
      frequency: 'monthly',
      interval: 200,
    });
    assert.equal(capped.interval, 99);

    const weekly = PriorityUI.normalizeRecurrence({
      frequency: 'weekly',
      interval: 2,
      weekdays: [1, 1, 8, 3, 'x'],
    });
    assert.equal(weekly.frequency, 'weekly');
    assert.equal(weekly.interval, 2);
    assert.deepEqual(weekly.weekdays, [1, 3]);
  });

  it('advanceDateByRecurrence covers daily / weekly / monthly / yearly', () => {
    assert.equal(
      PriorityUI.advanceDateByRecurrence('2026-07-16', {
        frequency: 'daily',
        interval: 1,
      }),
      '2026-07-17'
    );
    assert.equal(
      PriorityUI.advanceDateByRecurrence('2026-07-16', {
        frequency: 'daily',
        interval: 3,
      }),
      '2026-07-19'
    );
    // Thursday 2026-07-16 → next Monday (1) in weekdays
    assert.equal(
      PriorityUI.advanceDateByRecurrence('2026-07-16', {
        frequency: 'weekly',
        interval: 1,
        weekdays: [1, 3],
      }),
      '2026-07-20'
    );
    assert.equal(
      PriorityUI.advanceDateByRecurrence('2026-01-31', {
        frequency: 'monthly',
        interval: 1,
      }),
      '2026-02-28'
    );
    assert.equal(
      PriorityUI.advanceDateByRecurrence('2024-02-29', {
        frequency: 'yearly',
        interval: 1,
      }),
      '2025-02-28'
    );
  });

  it('nextOccurrenceParts keeps dueTime and shifts startDate by the same delta', () => {
    const next = PriorityUI.nextOccurrenceParts(
      {
        dueDate: '2026-07-16',
        dueTime: '08:00',
        startDate: '2026-07-14',
      },
      { frequency: 'daily', interval: 1 },
      { now: new Date(2026, 6, 16, 7, 0, 0) }
    );
    assert.equal(next.dueDate, '2026-07-17');
    assert.equal(next.dueTime, '08:00');
    assert.equal(next.startDate, '2026-07-15');
  });

  it('rolls overdue daily recurrence past now to the next future time', () => {
    // Completed after 8 AM on the 16th with a stale due of the 14th → land on the 17th at 8 AM
    const next = PriorityUI.nextOccurrenceParts(
      { dueDate: '2026-07-14', dueTime: '08:00' },
      { frequency: 'daily', interval: 1 },
      { now: new Date(2026, 6, 16, 9, 0, 0) }
    );
    assert.equal(next.dueDate, '2026-07-17');
    assert.equal(next.dueTime, '08:00');
  });

  it('does not skip a same-day next occurrence still ahead of now', () => {
    const next = PriorityUI.nextOccurrenceParts(
      { dueDate: '2026-07-15', dueTime: '08:00' },
      { frequency: 'daily', interval: 1 },
      { now: new Date(2026, 6, 15, 20, 0, 0) }
    );
    assert.equal(next.dueDate, '2026-07-16');
    assert.equal(next.dueTime, '08:00');
  });

  it('formats recurrence labels with and without a concrete time', () => {
    assert.equal(
      PriorityUI.formatRecurrenceLabelFr({ frequency: 'daily', interval: 1 }),
      'Chaque jour'
    );
    assert.equal(
      PriorityUI.formatRecurrenceLabelFr(
        { frequency: 'daily', interval: 1 },
        '08:00'
      ),
      'Chaque jour \u00e0 08:00'
    );
    assert.equal(
      PriorityUI.formatRecurrenceLabelFr({ frequency: 'weekly', interval: 2 }),
      'Toutes les 2 semaines'
    );
    assert.equal(
      PriorityUI.formatRecurrenceLabelFr(null),
      'Ne pas r\u00e9p\u00e9ter'
    );
  });

  it('PriorityTrello.normalizeInputs persists recurrence + dueTime', () => {
    const normalized = PriorityTrello.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      dueDate: '2026-07-16',
      dueTime: '8:00',
      recurrence: { frequency: 'daily', interval: 1 },
    });
    assert.equal(normalized.dueDate, '2026-07-16');
    assert.equal(normalized.dueTime, '08:00');
    assert.deepEqual(normalized.recurrence, {
      frequency: 'daily',
      interval: 1,
    });
  });

  it('clearBlockedFromInputs keeps recurrence and dueTime', () => {
    const cleared = PriorityTrello.clearBlockedFromInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      enAttente: true,
      dueDate: '2026-07-16',
      dueTime: '08:00',
      recurrence: { frequency: 'daily', interval: 1 },
      blockedReasons: ['En attente'],
    });
    assert.equal(!!cleared.enAttente, false);
    assert.equal(cleared.dueDate, '2026-07-16');
    assert.equal(cleared.dueTime, '08:00');
    assert.deepEqual(cleared.recurrence, {
      frequency: 'daily',
      interval: 1,
    });
  });
});

describe('Recurrence completion roll (popup progress path)', () => {
  let CT;

  before(() => {
    clearComponentCache();
    loadComponent('priority/priority-ui.js');
    loadComponent('priority/priority-trello.js');
    loadComponent('completion/completion-trello.js');
    CT = global.CompletionTrello;
    assert.ok(CT);
  });

  it('reopens progress when setCardDueComplete reports rolled', async () => {
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
        inputs: {
          dueDate: '2026-07-17',
          dueTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1 },
        },
      }),
    };
    global.StatutTrello = {
      restorePreviousStatutFromIncomplete: async () => ({
        ok: true,
        restored: true,
      }),
    };

    try {
      const result = await CT.syncCardDueCompleteFromProgress(t, {
        items: [],
        progress: 100,
      });
      assert.equal(result.rolled, true);
      assert.equal(result.dueComplete, false);
      assert.equal(result.allComplete, false);
      assert.equal(result.completion.progress, 0);
      assert.equal(store.get(CT.CARD_COMPLETION_KEY).progress, 0);
      assert.equal(store.get(CT.COMPLETION_MARKED_DUE_COMPLETE_KEY), false);
      assert.equal(result.inputs.dueTime, '08:00');
    } finally {
      global.PriorityTrello = previousPT;
      global.StatutTrello = previousStatut;
    }
  });
});
