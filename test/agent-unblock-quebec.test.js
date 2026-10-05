'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('Agent unblock intent (Québec French)', () => {
  let Agent;

  before(() => {
    clearComponentCache();
    loadComponent('agent/agent.js');
    Agent = global.PriorityAgent;
    assert.ok(Agent);
  });

  it('understands "pu bloqué" as no longer blocked', () => {
    ['pu bloqué', "c'est pu bloqué", 'ça bloque pu', 'Chu pu bloqué', 'débloque la tâche'].forEach((t) => {
      assert.equal(Agent.looksLikeUnblockedPhrase(t), true, t);
    });
  });

  it('does not treat blocking phrases as unblocking', () => {
    ['bloqué', 'pas débloqué', "En attente d'un câble"].forEach((t) => {
      assert.equal(Agent.looksLikeUnblockedPhrase(t), false, t);
    });
  });

  it('turns a "Pu bloqué" blocking reason into an unblock action', () => {
    const out = Agent.ensureUnblockedIntent(
      [{ tool: 'set_blocked', args: { enAttente: true, blockedReasons: ['Pu bloqué'] } }],
      'pu bloqué'
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].args.enAttente, false);
    assert.deepEqual(out[0].args.blockedReasons, []);
  });

  it('adds an unblock action when the model emitted none', () => {
    const out = Agent.ensureUnblockedIntent([], "c'est pu bloqué");
    assert.equal(out[0].tool, 'set_blocked');
    assert.equal(out[0].args.enAttente, false);
  });

  it('describes the unblock step in plain French', () => {
    assert.equal(
      Agent.describeActionStep({ tool: 'set_blocked', args: { enAttente: false } }),
      'Je débloque la tâche'
    );
  });
});
