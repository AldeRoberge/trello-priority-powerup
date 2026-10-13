'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent app build awareness', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('systemPrompt gives the build timestamp when known', () => {
    const prompt = Agent.systemPrompt({
      today: '2026-10-06',
      nowTime: '12:00',
      appBuiltAt: '2026-10-06T14:00:00.000Z'
    });
    assert.match(prompt, /2026-10-06T14:00:00\.000Z/);
    assert.match(prompt, /JAMAIS que tu ne peux pas/);
  });

  it('systemPrompt gives the build age and recent changes from the changelog', () => {
    const builtAt = new Date(Date.now() - 3 * 86400000).toISOString();
    const prompt = Agent.systemPrompt({
      today: '2026-10-06',
      nowTime: '12:00',
      appBuiltAt: builtAt,
      appReleases: [
        { date: '2026-10-13', items: ['Nouveauté A', 'Nouveauté B'] },
        { date: '2026-10-06', items: ['Ancienne'] },
        { date: '2026-09-01', items: ['Trop vieille'] }
      ]
    });
    assert.match(prompt, /il y a 3 jours/);
    assert.match(prompt, /2026-10-13 :/);
    assert.match(prompt, /Nouveauté A/);
    assert.match(prompt, /Ancienne/);
    assert.doesNotMatch(prompt, /Trop vieille/);
  });

  it('systemPrompt age label uses singular and hour units', () => {
    const oneHourAgo = new Date(Date.now() - 90 * 60000).toISOString();
    assert.match(
      Agent.systemPrompt({ today: '2026-10-06', nowTime: '12:00', appBuiltAt: oneHourAgo }),
      /il y a 1 heure/
    );
  });

  it('systemPrompt admits missing build info instead of guessing', () => {
    const prompt = Agent.systemPrompt({ today: '2026-10-06', nowTime: '12:00' });
    assert.match(prompt, /pas pu .{1,3}tre charg/);
  });
});
