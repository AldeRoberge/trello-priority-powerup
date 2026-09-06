'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent reply language mirroring', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('detectMessageLanguage spots English vs French', () => {
    assert.equal(Agent.detectMessageLanguage('Please add these tasks tomorrow'), 'en');
    assert.equal(Agent.detectMessageLanguage('Can you set the due date?'), 'en');
    assert.equal(
      Agent.detectMessageLanguage('Ajoute ces tâches pour demain s\'il te plaît'),
      'fr'
    );
    assert.equal(Agent.detectMessageLanguage('Buddy poop\nChicken feed\nDishes'), 'en');
    assert.equal(Agent.detectMessageLanguage(''), null);
  });

  it('systemPrompt forces English voice when the user wrote in English', () => {
    const frProfile = { language: 'fr', dialect: 'qc' };
    const prompt = Agent.systemPrompt(
      { profile: frProfile, today: '2026-09-06', nowTime: '12:00' },
      { userText: 'Please add laundry and dishes as subtasks' }
    );
    assert.match(prompt, /wrote in English|OBLIGATORY.*English/i);
    assert.match(prompt, /Talk like a close friend/);
    assert.doesNotMatch(prompt, /Voix \(TOUJOURS, non négociable\)/);
  });

  it('systemPrompt keeps French voice for French user text', () => {
    const prompt = Agent.systemPrompt(
      { profile: { language: 'fr', dialect: 'qc' }, today: '2026-09-06', nowTime: '12:00' },
      { userText: 'Ajoute la lessive et la vaisselle' }
    );
    assert.match(prompt, /OBLIGATOIRE pour ce tour|écrit en français/i);
    assert.match(prompt, /Voix \(TOUJOURS, non n/);
  });
});
