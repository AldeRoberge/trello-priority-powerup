'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent human profile job', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('humanProfileJobLines cover static + dynamic + never fabricate', () => {
    const fr = Agent.humanProfileJobLines(false).join('\n');
    assert.match(fr, /Profil humain/);
    assert.match(fr, /N'INVENTE JAMAIS|n'invente jamais/i);
    assert.match(fr, /Moi — Identit/);
    assert.match(fr, /\u00c9tat —/);
    assert.match(fr, /Comp\u00e9tence|rouill/);
    assert.match(fr, /\u00e9nergie|grit|Hydratation/i);

    const en = Agent.humanProfileJobLines(true).join('\n');
    assert.match(en, /Human profile|character sheet/i);
    assert.match(en, /NEVER fabricate/i);
    assert.match(en, /Moi —/);
    assert.match(en, /Energy \(physical\)|social battery|grit/i);
  });

  it('systemPrompt embeds the human profile job', () => {
    const prompt = Agent.systemPrompt(
      { profile: { language: 'fr', dialect: 'qc' }, today: '2026-09-06', nowTime: '12:00' },
      { userText: 'Salut, comment ça va aujourd\'hui?' }
    );
    assert.match(prompt, /Profil humain \(fiche personnage/);
    assert.match(prompt, /Moi — Identit/);
    assert.match(prompt, /op "note"/);
  });

  it('systemPrompt English voice still gets English human-profile job', () => {
    const prompt = Agent.systemPrompt(
      { profile: { language: 'fr', dialect: 'qc' }, today: '2026-09-06', nowTime: '12:00' },
      { userText: 'Hey how are you feeling today?' }
    );
    assert.match(prompt, /Human profile \(character sheet/);
    assert.match(prompt, /NEVER fabricate data/i);
    assert.match(prompt, /op "note"/);
  });
});
