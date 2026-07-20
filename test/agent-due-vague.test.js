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
    },
    initial || {}
  );
  return {
    getPriorityState: function () {
      return Object.assign({}, state);
    },
    applyPriority: function (partial) {
      Object.assign(state, partial || {});
    },
  };
}

describe('Agent set_due vague horizons', () => {
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

  it('resolveDueVagueArg maps catalog ids and natural phrases', () => {
    assert.equal(Agent.resolveDueVagueArg('eventuellement'), 'eventuellement');
    assert.equal(Agent.resolveDueVagueArg('todo eventually'), 'eventuellement');
    assert.equal(Agent.resolveDueVagueArg('À faire éventuellement'), 'eventuellement');
    assert.equal(Agent.resolveDueVagueArg('someday'), 'eventuellement');
    assert.equal(Agent.resolveDueVagueArg('proche'), 'proche');
    assert.equal(Agent.resolveDueVagueArg('dans un futur proche'), 'proche');
    assert.equal(Agent.resolveDueVagueArg('lointain'), 'lointain');
    assert.equal(Agent.resolveDueVagueArg('far future'), 'lointain');
    assert.equal(Agent.resolveDueVagueArg('nonsense'), '');
  });

  it('set_due applies dueVague eventuellement with proxy date', async () => {
    var bridge = createPriorityBridge();
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: { dueVague: 'eventuellement', dueEnabled: true },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.equal(state.dueMode, 'vague');
    assert.equal(state.dueVague, 'eventuellement');
    assert.equal(state.dueEnabled, true);
    assert.equal(state.dueTime, '');
    assert.equal(state.dueDate, PU.resolveDueVagueToDate('eventuellement'));
    assert.equal(
      PU.formatDueVagueCountdown(state.dueVague),
      'À faire éventuellement'
    );
  });

  it('set_due accepts natural-language dueVague', async () => {
    var bridge = createPriorityBridge();
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: { dueVague: 'todo eventually' },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.equal(state.dueVague, 'eventuellement');
    assert.equal(state.dueMode, 'vague');
    assert.equal(state.dueEnabled, true);
  });

  it('set_due rejects unknown dueVague', async () => {
    var bridge = createPriorityBridge();
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: { dueVague: 'next-millennium' },
    });
    assert.equal(result.ok, false);
    assert.match(result.error || '', /dueVague/i);
  });

  it('precise set_due clears prior vague mode', async () => {
    var bridge = createPriorityBridge({
      dueMode: 'vague',
      dueVague: 'eventuellement',
      dueDate: PU.resolveDueVagueToDate('eventuellement'),
      dueEnabled: true,
    });
    var result = await Agent.executeAction(bridge, {
      tool: 'set_due',
      args: { dueDate: '2026-08-01', dueEnabled: true },
    });
    assert.equal(result.ok, true);
    var state = bridge.getPriorityState();
    assert.equal(state.dueMode, 'precise');
    assert.equal(state.dueVague, '');
    assert.equal(state.dueDate, '2026-08-01');
  });

  it('isNoOpImprovementAction treats same vague horizon as no-op', () => {
    var context = {
      due: {
        enabled: true,
        dueDate: PU.resolveDueVagueToDate('eventuellement'),
        dueTime: null,
        dueMode: 'vague',
        dueVague: 'eventuellement',
      },
    };
    assert.equal(
      Agent.isNoOpImprovementAction(
        {
          tool: 'set_due',
          args: { dueVague: 'eventuellement', dueEnabled: true },
        },
        context
      ),
      true
    );
    assert.equal(
      Agent.isNoOpImprovementAction(
        { tool: 'set_due', args: { dueVague: 'proche', dueEnabled: true } },
        context
      ),
      false
    );
  });
});
