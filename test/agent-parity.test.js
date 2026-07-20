'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function createPriorityBridge(initial) {
  var state = Object.assign(
    {
      dueDate: '',
      dueTime: '',
      dueEnabled: false,
      dueMode: 'precise',
      dueVague: '',
      startDate: '',
      startTime: '',
      recurrence: null,
    },
    initial || {}
  );
  return {
    getPriorityState: function () {
      return Object.assign({}, state);
    },
    applyPriority: function (partial) {
      Object.assign(state, partial || {});
      if (Object.prototype.hasOwnProperty.call(partial || {}, 'recurrence')) {
        state.recurrence = partial.recurrence;
      }
    },
  };
}

describe('Agent échéance parity (start / recurrence / clear)', () => {
  var Agent;
  var PU;

  before(() => {
    loadComponent('priority/priority-matrix.js');
    loadComponent('priority/priority-ui.js');
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    PU = global.PriorityUI;
    assert.ok(Agent);
    assert.ok(PU);
  });

  it('set_due sets startDate and startTime', async () => {
    var bridge = createPriorityBridge();
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: {
        dueDate: '2026-08-10',
        startDate: '2026-08-01',
        startTime: '09:30',
        dueEnabled: true,
      },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.equal(state.dueDate, '2026-08-10');
    assert.equal(state.startDate, '2026-08-01');
    assert.equal(state.startTime, '09:30');
    assert.equal(state.dueMode, 'precise');
  });

  it('set_due sets weekly recurrence', async () => {
    var bridge = createPriorityBridge({ dueDate: '2026-08-10', dueEnabled: true });
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: {
        recurrence: { frequency: 'weekly', interval: 1, weekdays: [1, 3] },
      },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.deepEqual(state.recurrence, {
      frequency: 'weekly',
      interval: 1,
      weekdays: [1, 3],
    });
  });

  it('set_due clear removes due fields', async () => {
    var bridge = createPriorityBridge({
      dueDate: '2026-08-10',
      dueTime: '14:00',
      dueEnabled: true,
      dueVague: 'eventuellement',
      dueMode: 'vague',
    });
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: { clear: true },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.equal(state.dueEnabled, false);
    assert.equal(state.dueDate, '');
    assert.equal(state.dueVague, '');
    assert.equal(state.dueMode, 'precise');
  });

  it('vague set_due clears start and recurrence', async () => {
    var bridge = createPriorityBridge({
      dueDate: '2026-08-10',
      dueEnabled: true,
      startDate: '2026-08-01',
      recurrence: { frequency: 'daily', interval: 1 },
    });
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: { dueVague: 'eventuellement', dueEnabled: true },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.equal(state.dueVague, 'eventuellement');
    assert.equal(state.startDate, '');
    assert.equal(state.recurrence, null);
  });
});

describe('Agent members and labels tools', () => {
  var Agent;

  before(() => {
    loadComponent('priority/priority-matrix.js');
    loadComponent('priority/priority-ui.js');
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
  });

  it('matchBoardMember matches by name and username', () => {
    var members = [
      { id: '1', fullName: 'Alice Dupont', username: 'alice' },
      { id: '2', fullName: 'Bob Martin', username: 'bob' },
    ];
    assert.equal(Agent.matchBoardMember(members, 'Alice').id, '1');
    assert.equal(Agent.matchBoardMember(members, { matchText: 'bob' }).id, '2');
    assert.equal(Agent.matchBoardMember(members, { id: '1' }).id, '1');
    assert.equal(Agent.matchBoardMember(members, 'zzz'), null);
  });

  it('matchBoardLabel matches by name', () => {
    var labels = [
      { id: 'l1', name: 'Urgent', color: 'red' },
      { id: 'l2', name: 'Backlog', color: 'blue' },
    ];
    assert.equal(Agent.matchBoardLabel(labels, 'urgent').id, 'l1');
    assert.equal(Agent.matchBoardLabel(labels, { name: 'Backlog' }).id, 'l2');
  });

  it('set_members adds and removes via bridge', async () => {
    var cardMembers = [];
    var bridge = {
      loadBoardMembers: function () {
        return [
          { id: '1', fullName: 'Alice Dupont', username: 'alice' },
          { id: '2', fullName: 'Bob Martin', username: 'bob' },
        ];
      },
      getOwnership: function () {
        return { members: cardMembers.slice() };
      },
      addMember: function (id) {
        cardMembers.push(
          id === '1'
            ? { id: '1', fullName: 'Alice Dupont', username: 'alice' }
            : { id: id, fullName: id, username: id }
        );
        return { ok: true, changed: true };
      },
      removeMember: function (id) {
        cardMembers = cardMembers.filter(function (m) {
          return m.id !== id;
        });
        return { ok: true, changed: true };
      },
    };
    var add = await Agent.executeAction(bridge, {
      tool: 'set_members',
      args: { add: ['Alice'] },
    });
    assert.equal(add.ok, true);
    assert.equal(cardMembers.length, 1);
    var rm = await Agent.executeAction(bridge, {
      tool: 'set_members',
      args: { remove: ['alice'] },
    });
    assert.equal(rm.ok, true);
    assert.equal(cardMembers.length, 0);
  });

  it('set_labels adds via bridge', async () => {
    var cardLabels = [];
    var bridge = {
      loadBoardLabels: function () {
        return [
          { id: 'l1', name: 'Urgent', color: 'red' },
          { id: 'l2', name: 'Backlog', color: 'blue' },
        ];
      },
      loadCardLabels: function () {
        return cardLabels.slice();
      },
      addLabel: function (id) {
        cardLabels.push({ id: id, name: id === 'l1' ? 'Urgent' : id });
        return { ok: true, changed: true };
      },
      removeLabel: function () {
        return { ok: true };
      },
    };
    var result = await Agent.executeAction(bridge, {
      tool: 'set_labels',
      args: { add: ['Urgent'] },
    });
    assert.equal(result.ok, true);
    assert.equal(cardLabels.length, 1);
    assert.equal(cardLabels[0].id, 'l1');
  });
});
