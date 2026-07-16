'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Card history labels', () => {
  let CH;

  before(() => {
    clearComponentCache();
    loadComponent('history/card-history.js');
    CH = global.CardHistory;
    assert.ok(CH);
  });

  it('exports label helpers', () => {
    assert.equal(typeof CH.buildLabel, 'function');
    assert.equal(typeof CH.collectChangeParts, 'function');
    assert.equal(typeof CH.describeEntry, 'function');
  });

  it('describes axis changes instead of bare Priorité', () => {
    const before = { priority: { urgency: 1, impact: 2, ease: 3 } };
    const after = { priority: { urgency: 5, impact: 2, ease: 3 } };
    const label = CH.buildLabel(before, after, ['priority']);
    assert.match(label, /Urgence/i);
    assert.doesNotMatch(label, /^Priorit[ée]$/);
  });

  it('describes priorityEnabled toggles', () => {
    const before = {
      priority: { urgency: 2, impact: 2, ease: 2, priorityEnabled: true }
    };
    const after = {
      priority: { urgency: 2, impact: 2, ease: 2, priorityEnabled: false }
    };
    const label = CH.buildLabel(before, after, ['priority']);
    assert.match(label, /d[ée]sactiv/i);
  });

  it('keeps due-date wording after record slim', () => {
    const history = CH.create({});
    const before = {
      priority: {
        urgency: 2,
        impact: 2,
        ease: 2,
        dueDate: '2026-07-16',
        dueTime: '13:00'
      }
    };
    const after = {
      priority: {
        urgency: 2,
        impact: 2,
        ease: 2,
        dueDate: '2026-07-20',
        dueTime: '13:00'
      }
    };
    history.record(before, after);
    const entries = history.list();
    assert.equal(entries.length, 1);
    assert.match(entries[0].label, /[Éé]ch[ée]ance|20 juil|16 juil/i);
    assert.doesNotMatch(entries[0].label, /^Priorit[ée]/);
    assert.ok(entries[0].details);
    assert.ok(entries[0].details.lines.length >= 1);
    assert.doesNotMatch(entries[0].details.lines[0], /^Priorit[ée]$/);
  });

  it('uses Priorité modifiée as fallback, not bare Priorité', () => {
    const parts = CH.collectChangeParts(
      { priority: { urgency: 2, impact: 2, ease: 2, _x: 1 } },
      { priority: { urgency: 2, impact: 2, ease: 2, _x: 2 } },
      ['priority'],
      { detail: true }
    );
    assert.deepEqual(parts, ['Priorité modifiée']);
  });

  it('describeEntry names enable toggles instead of Priorité', () => {
    const entry = {
      id: 'e1',
      at: '2026-07-16T17:25:00.000Z',
      label: 'Priorité',
      domains: ['priority'],
      before: {
        priority: { urgency: 1, impact: 1, ease: 1, priorityEnabled: false }
      },
      after: {
        priority: { urgency: 1, impact: 1, ease: 1, priorityEnabled: true }
      }
    };
    const details = CH.describeEntry(entry);
    assert.ok(details);
    assert.deepEqual(details.domainLabels, ['Priorité']);
    assert.ok(details.lines.length >= 1);
    assert.notEqual(details.lines[0], 'Priorité');
    assert.match(details.lines[0], /activ/i);
  });

  it('describes enabling daily recurrence', () => {
    const label = CH.buildLabel(
      {
        priority: {
          urgency: 2,
          impact: 2,
          ease: 2,
          dueDate: '2026-07-16',
          dueTime: '08:00',
        },
      },
      {
        priority: {
          urgency: 2,
          impact: 2,
          ease: 2,
          dueDate: '2026-07-16',
          dueTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1 },
        },
      },
      ['priority']
    );
    assert.match(label, /[Rr][ée]p[ée]tition/i);
    assert.match(label, /chaque jour/i);
  });

  it('describes clearing recurrence', () => {
    const label = CH.buildLabel(
      {
        priority: {
          urgency: 2,
          impact: 2,
          ease: 2,
          dueDate: '2026-07-16',
          dueTime: '08:00',
          recurrence: { frequency: 'weekly', interval: 1, weekdays: [1] },
        },
      },
      {
        priority: {
          urgency: 2,
          impact: 2,
          ease: 2,
          dueDate: '2026-07-16',
          dueTime: '08:00',
        },
      },
      ['priority']
    );
    assert.match(label, /[Rr][ée]p[ée]tition d[ée]sactiv/i);
  });

  it('records recurrence change through history slim', () => {
    const history = CH.create({});
    const recorded = history.record(
      {
        priority: {
          urgency: 2,
          impact: 2,
          ease: 2,
          dueDate: '2026-07-16',
          dueTime: '08:00',
        },
      },
      {
        priority: {
          urgency: 2,
          impact: 2,
          ease: 2,
          dueDate: '2026-07-16',
          dueTime: '08:00',
          recurrence: { frequency: 'daily', interval: 2 },
        },
      }
    );
    assert.ok(recorded);
    const entries = history.list();
    assert.equal(entries.length, 1);
    assert.match(entries[0].label, /[Rr][ée]p[ée]tition|tous les 2 jours/i);
    const entry = history.getEntry(recorded.id);
    assert.ok(entry);
    assert.ok(entry.after.priority.recurrence);
    assert.equal(entry.after.priority.recurrence.frequency, 'daily');
    assert.equal(entry.after.priority.recurrence.interval, 2);
  });
});
