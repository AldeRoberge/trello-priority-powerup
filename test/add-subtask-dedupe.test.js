'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function createBridge(initialItems) {
  var completion = { items: (initialItems || []).slice() };
  return {
    getCompletion: function () {
      return JSON.parse(JSON.stringify(completion));
    },
    applyCompletion: function (next) {
      completion = JSON.parse(JSON.stringify(next));
    }
  };
}

describe('add_subtask dedupe', () => {
  var Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
    assert.equal(typeof Agent.executeAction, 'function');
    assert.equal(typeof Agent.findExistingSubtaskByText, 'function');
  });

  it('findExistingSubtaskByText matches exact titles case-insensitively', () => {
    var items = [{ id: 'a', text: 'Poncer le plâtre' }];
    assert.ok(Agent.findExistingSubtaskByText(items, 'Poncer le plâtre'));
    assert.ok(Agent.findExistingSubtaskByText(items, 'Poncer le Plâtre'));
    assert.equal(Agent.findExistingSubtaskByText(items, 'Peindre'), null);
  });

  it('adds a new subtask when title is absent', async () => {
    var bridge = createBridge();
    var result = await Agent.executeAction(bridge, {
      tool: 'add_subtask',
      args: { text: 'Poncer le plâtre' }
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, undefined);
    assert.equal(bridge.getCompletion().items.length, 1);
    assert.equal(bridge.getCompletion().items[0].text, 'Poncer le plâtre');
  });

  it('skips duplicate add_subtask across turns', async () => {
    var bridge = createBridge();
    await Agent.executeAction(bridge, {
      tool: 'add_subtask',
      args: { text: 'Poncer le plâtre' }
    });
    var dup = await Agent.executeAction(bridge, {
      tool: 'add_subtask',
      args: { text: 'Poncer le plâtre' }
    });
    assert.equal(dup.ok, true);
    assert.equal(dup.skipped, true);
    assert.equal(bridge.getCompletion().items.length, 1);
  });

  it('skips case-variant duplicates', async () => {
    var bridge = createBridge([
      { id: 'x', text: 'Poncer le plâtre', done: false, progress: 0 }
    ]);
    var dup = await Agent.executeAction(bridge, {
      tool: 'add_subtask',
      args: { text: 'Poncer le Plâtre' }
    });
    assert.equal(dup.skipped, true);
    assert.equal(bridge.getCompletion().items.length, 1);
  });

  it('dedupes within a single executeActions batch', async () => {
    var bridge = createBridge();
    var applied = await Agent.executeActions(bridge, [
      { tool: 'add_subtask', args: { text: 'Poncer le plâtre' } },
      { tool: 'add_subtask', args: { text: 'Peindre la salle de bain' } },
      { tool: 'add_subtask', args: { text: 'Installer les crochets' } },
      { tool: 'add_subtask', args: { text: 'Poncer le plâtre' } },
      { tool: 'add_subtask', args: { text: 'Peindre la salle de bain' } },
      { tool: 'add_subtask', args: { text: 'Installer les crochets' } }
    ]);
    assert.equal(bridge.getCompletion().items.length, 3);
    var skipped = applied.results.filter(function (r) {
      return r && r.skipped;
    });
    assert.equal(skipped.length, 3);
  });

  it('marks existing item done instead of duplicating when done:true', async () => {
    var bridge = createBridge([
      { id: 'x', text: 'Poncer le plâtre', done: false, progress: 0 }
    ]);
    var result = await Agent.executeAction(bridge, {
      tool: 'add_subtask',
      args: { text: 'Poncer le plâtre', done: true }
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, undefined);
    assert.equal(bridge.getCompletion().items.length, 1);
    assert.equal(bridge.getCompletion().items[0].done, true);
    assert.equal(bridge.getCompletion().items[0].progress, 100);
  });

  it('formatChangeRecap omits skipped duplicate adds', async () => {
    var bridge = createBridge([
      { id: 'x', text: 'Poncer le plâtre', done: false, progress: 0 }
    ]);
    var applied = await Agent.executeActions(bridge, [
      { tool: 'add_subtask', args: { text: 'Poncer le plâtre' } }
    ]);
    var recap = Agent.formatChangeRecap(applied);
    assert.equal(recap, '');
  });
});
