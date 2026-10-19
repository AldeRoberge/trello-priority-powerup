'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent.buildChatDebugExport', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  function requestFor(system, user) {
    return {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-5.4-mini',
      stream: false,
      jsonMode: true,
      temperature: 0.4,
      max_tokens: 700,
      messageCount: 2,
      status: 200,
      body: {
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }
    };
  }

  it('lists the conversation then the calls under the hood', () => {
    const text = Agent.buildChatDebugExport({
      provider: { preset: 'openai', model: 'gpt-5.4-mini', apiKey: 'sk-test-secret' },
      statusLevel: 'full',
      history: [
        { role: 'user', content: 'Bonjour' },
        {
          role: 'assistant',
          content: 'Salut !',
          rawJson: '{"message":"Salut !","actions":[]}'
        }
      ],
      debugLog: [
        {
          id: 'chat-1',
          kind: 'chatTurn',
          label: 'Tour de conversation',
          startedAt: Date.UTC(2026, 9, 19, 12, 0, 0),
          latencyMs: 812,
          ok: true,
          request: requestFor('SYSTEM CONTEXT', 'Bonjour'),
          response: {
            status: 200,
            content: '{"message":"Salut !"}',
            raw: { id: 'r1' },
            parsed: { message: 'Salut !', actions: [] }
          },
          usage: { totalTokens: 42 },
          attempts: [{ label: 'non-stream + json', status: 200 }]
        }
      ]
    });

    assert.match(text, /## 1\. Conversation \(2 message\(s\)\)/);
    assert.match(text, /### 1\. Utilisateur\nBonjour/);
    assert.match(text, /### 2\. Assistant\nSalut !/);
    assert.match(text, /JSON brut :/);
    assert.match(text, /## 2\. Sous le capot \(1 appel\(s\)\)/);
    assert.match(text, /### Appel 1 — Tour de conversation/);
    assert.match(text, /mode JSON oui/);
    assert.match(text, /Dernier message envoy/);
    assert.match(text, /Tentatives :\n- non-stream \+ json · HTTP 200/);
    assert.match(text, /Réponse brute du modèle :/);
    assert.match(text, /"totalTokens": 42/);
    assert.ok(text.indexOf('## 1.') < text.indexOf('## 2.'));
    assert.ok(text.indexOf('## 2.') < text.indexOf('## 3.'));
  });

  it('never includes the API key', () => {
    const text = Agent.buildChatDebugExport({
      provider: { preset: 'openai', model: 'gpt-5.4-mini', apiKey: 'sk-test-secret' },
      history: [{ role: 'user', content: 'Test' }],
      debugLog: [{ kind: 'chatTurn', request: requestFor('ctx', 'Test') }]
    });
    assert.equal(text.includes('sk-test-secret'), false);
  });

  it('writes each distinct system context once and points to it', () => {
    const text = Agent.buildChatDebugExport({
      provider: null,
      history: [],
      debugLog: [
        { kind: 'chatTurn', request: requestFor('CTX A', 'un') },
        { kind: 'chatTurn', request: requestFor('CTX A', 'deux') },
        { kind: 'chatTurn', request: requestFor('CTX B', 'trois') }
      ]
    });
    assert.match(text, /## 3\. Contexte système envoyé au modèle \(2 version\(s\)\)/);
    assert.equal(text.split('CTX A').length - 1, 1);
    assert.equal(text.split('CTX B').length - 1, 1);
    assert.match(text, /Version 1 \(appels 1, 2\)/);
    assert.match(text, /Version 2 \(appels 3\)/);
  });

  it('keeps a fence intact when the content contains backticks', () => {
    const text = Agent.buildChatDebugExport({
      history: [{ role: 'user', content: 'avant ``` après' }],
      debugLog: []
    });
    assert.match(text, /### 1\. Utilisateur\navant ``` après/);
    const sample = Agent.buildChatDebugExport({
      history: [],
      debugLog: [
        {
          kind: 'chatTurn',
          response: { content: 'code:\n```js\nx\n```' }
        }
      ]
    });
    assert.match(sample, /````\ncode:\n```js\nx\n```\n````/);
  });

  it('handles empty input and a failed call without a request', () => {
    const text = Agent.buildChatDebugExport({});
    assert.match(text, /## 1\. Conversation \(0 message\(s\)\)/);
    assert.match(text, /## 2\. Sous le capot \(0 appel\(s\)\)/);
    assert.match(text, /Aucun appel avec contexte\./);

    const failed = Agent.buildChatDebugExport({
      debugLog: [{ kind: 'chatTurn', ok: false, error: 'Timeout', attempts: [] }]
    });
    assert.match(failed, /Résultat : erreur/);
    assert.match(failed, /Erreur : Timeout/);
  });
});
