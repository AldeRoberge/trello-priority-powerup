'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Agent card labels context', () => {
  let Agent;
  let AgentUI;

  before(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    delete global.AgentUI;
    delete global.PriorityUI;
    // AgentUI.mount needs PriorityUI, but attachOptionalBridgeFns does not.
    global.PriorityUI = {
      createCollapsibleEnableChrome() {
        return { head: global.document.createElement('div'), label: null };
      }
    };
    loadComponent('agent/agent.js');
    loadComponent('agent/agent-ui.js');
    Agent = global.PriorityAgent;
    AgentUI = global.AgentUI;
    assert.ok(Agent);
    assert.ok(AgentUI);
  });

  it('buildContext includes Trello labels from bridge.getCardLabels', () => {
    const ctx = Agent.buildContext({
      getCardLabels() {
        return [
          { id: 'lab1', name: 'Urgent', color: 'red' },
          { id: 'lab2', name: 'Backend', color: 'blue' }
        ];
      },
      getBoardLabels() {
        return [
          { id: 'lab1', name: 'Urgent', color: 'red' },
          { id: 'lab2', name: 'Backend', color: 'blue' },
          { id: 'lab3', name: 'Nice', color: 'green' }
        ];
      }
    });
    assert.ok(Array.isArray(ctx.labels));
    assert.equal(ctx.labels.length, 2);
    assert.equal(ctx.labels[0].name, 'Urgent');
    assert.ok(Array.isArray(ctx.boardLabels));
    assert.equal(ctx.boardLabels.length, 3);
  });

  it('buildContext omits labels when bridge helper is missing', () => {
    const ctx = Agent.buildContext({
      getCardName() {
        return 'Sans labels bridge';
      }
    });
    assert.equal(ctx.labels, undefined);
    assert.equal(ctx.boardLabels, undefined);
  });

  it('AgentUI forwards getCardLabels from mount options onto the bridge', () => {
    assert.equal(typeof AgentUI.attachOptionalBridgeFns, 'function');
    const labels = [{ id: 'x', name: 'QA', color: 'purple' }];
    const bridge = AgentUI.attachOptionalBridgeFns(
      {},
      {
        getCardLabels() {
          return labels;
        },
        getBoardLabels() {
          return labels;
        },
        addLabel() {
          return Promise.resolve({ ok: true });
        }
      }
    );
    assert.equal(typeof bridge.getCardLabels, 'function');
    assert.deepEqual(bridge.getCardLabels(), labels);
    assert.equal(typeof bridge.getBoardLabels, 'function');
    assert.equal(typeof bridge.addLabel, 'function');
    const ctx = Agent.buildContext(bridge);
    assert.equal(ctx.labels.length, 1);
    assert.equal(ctx.labels[0].name, 'QA');
  });
});
