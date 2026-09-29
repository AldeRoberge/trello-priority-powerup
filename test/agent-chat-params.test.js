'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

function reply(status, payload) {
  const text = JSON.stringify(payload);
  return { ok: status < 400, status, text: async () => text };
}

const OK = { choices: [{ message: { content: '{"ok":true}' } }] };

describe('PriorityAgent.chatCompletions token parameter', () => {
  let Agent;
  let realFetch;
  let bodies;

  beforeEach(() => {
    clearComponentCache();
    delete global.PriorityAgent;
    Agent = loadComponent('agent/agent.js').PriorityAgent;
    realFetch = global.fetch;
    bodies = [];
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function stubFetch(responder) {
    global.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return responder(body, bodies.length);
    };
  }

  const openai = { preset: 'openai', apiKey: 'sk-test', model: 'gpt-5.4-mini' };

  it('sends max_completion_tokens (with a floor) to OpenAI GPT-5 models', async () => {
    stubFetch(() => reply(200, OK));
    await Agent.chatCompletions(openai, [{ role: 'user', content: 'hi' }], { max_tokens: 80 });
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].max_tokens, undefined);
    assert.equal(bodies[0].max_completion_tokens, 256);
  });

  it('keeps max_tokens for models that still accept it', async () => {
    stubFetch(() => reply(200, OK));
    await Agent.chatCompletions(
      { preset: 'openai', apiKey: 'sk-test', model: 'gpt-4.1-mini' },
      [{ role: 'user', content: 'hi' }],
      { max_tokens: 80 }
    );
    assert.equal(bodies[0].max_tokens, 80);
    assert.equal(bodies[0].max_completion_tokens, undefined);
  });

  it('retries once with max_completion_tokens when the API rejects max_tokens', async () => {
    stubFetch((body, n) =>
      n === 1
        ? reply(400, {
            error: {
              message:
                "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."
            }
          })
        : reply(200, OK)
    );
    const provider = { preset: 'openai', apiKey: 'sk-test', model: 'gpt-4.1-mini' };
    const result = await Agent.chatCompletions(provider, [{ role: 'user', content: 'hi' }], {
      max_tokens: 500
    });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].max_tokens, 500);
    assert.equal(bodies[1].max_tokens, undefined);
    assert.equal(bodies[1].max_completion_tokens, 500);
    assert.equal(result.content, '{"ok":true}');
  });

  it('drops a rejected temperature and retries', async () => {
    stubFetch((body, n) =>
      n === 1
        ? reply(400, {
            error: {
              message:
                "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported."
            }
          })
        : reply(200, OK)
    );
    await Agent.chatCompletions(openai, [{ role: 'user', content: 'hi' }], {
      temperature: 0,
      max_tokens: 300
    });
    assert.equal(bodies.length, 2);
    assert.equal('temperature' in bodies[0], true);
    assert.equal('temperature' in bodies[1], false);
  });

  it('does not loop on unrelated 400s', async () => {
    stubFetch(() => reply(400, { error: { message: 'Invalid schema for response_format' } }));
    await assert.rejects(
      Agent.chatCompletions(openai, [{ role: 'user', content: 'hi' }], { max_tokens: 100 }),
      /Invalid schema/
    );
    assert.equal(bodies.length, 1);
  });
});
