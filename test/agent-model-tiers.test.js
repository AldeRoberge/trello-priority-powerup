'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('PriorityAgent dynamic model tiers', () => {
  let Agent;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
  });

  it('normalizes modelTier values and aliases', () => {
    assert.equal(Agent.normalizeModelTier('efficient'), 'efficient');
    assert.equal(Agent.normalizeModelTier('BALANCED'), 'balanced');
    assert.equal(Agent.normalizeModelTier('capable'), 'capable');
    assert.equal(Agent.normalizeModelTier('cheap'), 'efficient');
    assert.equal(Agent.normalizeModelTier('smart'), 'capable');
    assert.equal(Agent.normalizeModelTier('Critique'), null);
    assert.equal(Agent.normalizeModelTier(''), null);
  });

  it('classifies model ids into efficient / balanced / capable', () => {
    assert.equal(Agent.classifyModelClass('gpt-5.4-nano'), 'efficient');
    assert.equal(Agent.classifyModelClass('openai/gpt-5-nano'), 'efficient');
    assert.equal(Agent.classifyModelClass('gpt-5.4-mini'), 'balanced');
    assert.equal(Agent.classifyModelClass('gpt-4o-mini'), 'balanced');
    assert.equal(Agent.classifyModelClass('o4-mini'), 'balanced');
    assert.equal(Agent.classifyModelClass('gpt-5.4'), 'capable');
    assert.equal(Agent.classifyModelClass('gpt-4o'), 'capable');
    assert.equal(Agent.classifyModelClass('some-custom-llama'), 'unknown');
  });

  it('maps tiers to models within the saved family', () => {
    const nano = Agent.normalizeProvider({
      preset: 'openai',
      model: 'gpt-5.4-nano',
      apiKey: 'sk-test'
    });
    assert.equal(Agent.modelForTier(nano, 'balanced'), 'gpt-5.4-mini');
    assert.equal(Agent.modelForTier(nano, 'capable'), 'gpt-5.4');
    assert.equal(Agent.modelForTier(nano, 'efficient'), 'gpt-5.4-nano');

    const or = Agent.normalizeProvider({
      preset: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKey: 'sk-test'
    });
    assert.equal(Agent.modelForTier(or, 'capable'), 'openai/gpt-4o');
    assert.equal(Agent.modelForTier(or, 'efficient'), 'openai/gpt-4o-mini');
  });

  it('keeps custom unknown models unchanged for tiers', () => {
    const custom = Agent.normalizeProvider({
      preset: 'custom',
      baseUrl: 'https://example.com/v1',
      model: 'acme/secret-llm',
      apiKey: 'sk-test'
    });
    assert.equal(Agent.modelForTier(custom, 'capable'), 'acme/secret-llm');
    assert.equal(Agent.resolveChatModel(custom, [], 'efficient'), 'acme/secret-llm');
  });

  it('warm-up floors nano to balanced for the first 4 user turns', () => {
    const p = Agent.normalizeProvider({
      preset: 'openai',
      model: 'gpt-5.4-nano',
      apiKey: 'sk-test'
    });
    assert.equal(Agent.resolveChatModel(p, [], null), 'gpt-5.4-mini');
    assert.equal(
      Agent.resolveChatModel(p, [{ role: 'user', content: 'a' }], null),
      'gpt-5.4-mini'
    );
    assert.equal(
      Agent.resolveChatModel(
        p,
        [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'b' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'c' }
        ],
        null
      ),
      'gpt-5.4-mini'
    );
    // 4 prior user turns → 5th turn leaves warm-up
    const afterWarmup = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: '2' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: '4' },
      { role: 'assistant', content: 'ok' }
    ];
    assert.equal(Agent.resolveChatModel(p, afterWarmup, null), 'gpt-5.4-nano');
  });

  it('warm-up does not downgrade a capable saved model', () => {
    const p = Agent.normalizeProvider({
      preset: 'openai',
      model: 'gpt-5.4',
      apiKey: 'sk-test'
    });
    assert.equal(Agent.resolveChatModel(p, [], null), 'gpt-5.4');
    assert.equal(Agent.resolveChatModel(p, [], 'efficient'), 'gpt-5.4');
  });

  it('after warm-up honors sticky efficient / capable tiers', () => {
    const p = Agent.normalizeProvider({
      preset: 'openai',
      model: 'gpt-5.4-nano',
      apiKey: 'sk-test'
    });
    const afterWarmup = [
      { role: 'user', content: '1' },
      { role: 'user', content: '2' },
      { role: 'user', content: '3' },
      { role: 'user', content: '4' }
    ];
    assert.equal(
      Agent.resolveChatModel(p, afterWarmup, 'efficient'),
      'gpt-5.4-nano'
    );
    assert.equal(
      Agent.resolveChatModel(p, afterWarmup, 'capable'),
      'gpt-5.4'
    );
    assert.equal(
      Agent.resolveChatModel(p, afterWarmup, 'balanced'),
      'gpt-5.4-mini'
    );
    assert.equal(Agent.resolveChatModel(p, afterWarmup, null), 'gpt-5.4-nano');
    assert.equal(
      Agent.resolveChatModel(p, afterWarmup, 'not-a-tier'),
      'gpt-5.4-nano'
    );
  });

  it('parseAssistantPayload accepts and rejects modelTier', () => {
    const ok = Agent.parseAssistantPayload(
      JSON.stringify({
        message: 'Allo!',
        modelTier: 'efficient',
        suggestions: [],
        followUps: [],
        actions: []
      })
    );
    assert.equal(ok.modelTier, 'efficient');
    assert.equal(ok.message, 'Allo!');

    const snake = Agent.parseAssistantPayload(
      JSON.stringify({
        message: 'Hmm',
        model_tier: 'capable',
        suggestions: [],
        followUps: [],
        actions: []
      })
    );
    assert.equal(snake.modelTier, 'capable');

    const bad = Agent.parseAssistantPayload(
      JSON.stringify({
        message: 'Nope',
        modelTier: 'ultra',
        suggestions: [],
        followUps: [],
        actions: []
      })
    );
    assert.equal(bad.modelTier, null);

    const empty = Agent.parseAssistantPayload('');
    assert.equal(empty.modelTier, null);
  });

  it('exposes warm-up constant of 4', () => {
    assert.equal(Agent.CHAT_WARMUP_USER_TURNS, 4);
    assert.deepEqual(Agent.MODEL_TIERS, {
      efficient: 'efficient',
      balanced: 'balanced',
      capable: 'capable'
    });
  });
});
