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

  it('systemPrompt admits missing build info instead of guessing', () => {
    const prompt = Agent.systemPrompt({ today: '2026-10-06', nowTime: '12:00' });
    assert.match(prompt, /pas pu .{1,3}tre charg/);
  });
});
