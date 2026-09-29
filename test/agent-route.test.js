'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent.routeMessage', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('routes to main when nothing is in flight', () => {
    assert.equal(Agent.routeMessage('Bonjour tout le monde ici', { busy: false }).route, 'main');
  });

  it('sends independent requests to a parallel lane while busy', () => {
    const r = Agent.routeMessage('Ajoute une sous-tâche pour appeler le client', { busy: true });
    assert.equal(r.route, 'lane');
    assert.equal(r.tier, 'balanced');
  });

  it('uses the efficient tier for short questions', () => {
    const r = Agent.routeMessage('Quelle est la date limite actuelle ?', { busy: true });
    assert.equal(r.route, 'lane');
    assert.equal(r.tier, 'efficient');
  });

  it('folds short follow-ups into the queue', () => {
    assert.equal(Agent.routeMessage('non plutôt demain', { busy: true }).route, 'queue');
    assert.equal(Agent.routeMessage('et aussi le budget du projet', { busy: true }).route, 'queue');
  });

  it('honours the explicit parallel prefix and strips it', () => {
    const r = Agent.routeMessage('// ok', { busy: true });
    assert.equal(r.route, 'lane');
    assert.equal(r.text, 'ok');
    assert.equal(Agent.routeMessage('en parallèle: résume la carte', { busy: true }).text, 'résume la carte');
  });

  it('queues when the lane cap is reached', () => {
    const r = Agent.routeMessage('Ajoute une sous-tâche pour appeler le client', {
      busy: true,
      activeLanes: Agent.PARALLEL_LANE_MAX
    });
    assert.equal(r.route, 'queue');
  });
});
