'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('liftPatchTools', () => {
  let Agent;

  before(() => {
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.equal(typeof Agent.liftPatchTools, 'function');
  });

  it('folds a cardPatches action into card memory', () => {
    var lifted = Agent.liftPatchTools(
      [
        { tool: 'set_due', args: { due: '2026-10-21' } },
        { tool: 'cardPatches', args: { op: 'remember', text: 'Livrable : rapport' } }
      ],
      [],
      []
    );
    assert.equal(lifted.actions.length, 1);
    assert.equal(lifted.actions[0].tool, 'set_due');
    assert.deepEqual(lifted.cardPatches, [
      { op: 'remember', text: 'Livrable : rapport' }
    ]);
  });

  it('accepts a patch list passed as the tool args', () => {
    var lifted = Agent.liftPatchTools(
      [
        {
          tool: 'cardPatches',
          args: [{ op: 'note', text: 'Déjà fait : brouillon' }]
        }
      ],
      [{ op: 'remember', text: 'Pourquoi : démo' }],
      []
    );
    assert.equal(lifted.actions.length, 0);
    assert.equal(lifted.cardPatches.length, 2);
    assert.equal(lifted.cardPatches[1].text, 'Déjà fait : brouillon');
  });
});
