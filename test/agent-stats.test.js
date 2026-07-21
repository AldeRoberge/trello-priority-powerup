'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('AgentStats', () => {
  let AgentStats;

  beforeEach(() => {
    clearComponentCache();
    delete global.AgentStats;
    AgentStats = loadComponent('agent/agent-stats.js').AgentStats;
  });

  it('exposes normalize, recordTurn, trim, load/save helpers', () => {
    assert.equal(typeof AgentStats.normalize, 'function');
    assert.equal(typeof AgentStats.recordTurn, 'function');
    assert.equal(typeof AgentStats.trimStore, 'function');
    assert.equal(typeof AgentStats.load, 'function');
    assert.equal(typeof AgentStats.save, 'function');
    assert.equal(typeof AgentStats.reset, 'function');
    assert.equal(typeof AgentStats.mountPanel, 'function');
    assert.equal(AgentStats.STORAGE_KEY, 'agentUsageStats');
  });

  it('normalize returns empty store for junk', () => {
    const store = AgentStats.normalize(null);
    assert.equal(store.v, 1);
    assert.equal(store.life.turns, 0);
    assert.deepEqual(store.days, []);
    assert.deepEqual(store.models, {});
  });

  it('recordTurn aggregates by day and lifetime', () => {
    let store = AgentStats.emptyStore();
    store = AgentStats.recordTurn(
      store,
      {
        promptTokens: 100,
        completionTokens: 40,
        totalTokens: 140,
        costUsd: 0.002,
        model: 'openai/gpt-5-mini'
      },
      { sent: 1, recv: 1, date: '2026-07-21' }
    );
    store = AgentStats.recordTurn(
      store,
      {
        promptTokens: 50,
        completionTokens: 20,
        totalTokens: 70,
        costUsd: 0.001,
        model: 'gpt-5-mini'
      },
      { sent: 1, recv: 1, date: '2026-07-21' }
    );
    store = AgentStats.recordTurn(
      store,
      {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        costUsd: 0.0005,
        model: 'gpt-4o-mini'
      },
      { sent: 1, recv: 1, date: '2026-07-20' }
    );

    assert.equal(store.life.turns, 3);
    assert.equal(store.life.pt, 160);
    assert.equal(store.life.ct, 65);
    assert.equal(store.life.tt, 225);
    assert.ok(Math.abs(store.life.cost - 0.0035) < 1e-9);
    assert.equal(store.life.sent, 3);
    assert.equal(store.life.recv, 3);

    assert.equal(store.days.length, 2);
    assert.equal(store.days[0].d, '2026-07-21');
    assert.equal(store.days[0].turns, 2);
    assert.equal(store.days[0].tt, 210);
    assert.equal(store.days[1].d, '2026-07-20');
    assert.equal(store.days[1].turns, 1);

    assert.equal(store.models['gpt-5-mini'].turns, 2);
    assert.ok(Math.abs(store.models['gpt-5-mini'].cost - 0.003) < 1e-9);
    assert.equal(store.models['gpt-4o-mini'].turns, 1);
  });

  it('trimStore caps days and serialized size', () => {
    let store = AgentStats.emptyStore();
    for (let i = 0; i < 40; i++) {
      const key = AgentStats.todayKey(new Date(2026, 0, 1 + i));
      store = AgentStats.recordTurn(
        store,
        {
          promptTokens: 1000 + i,
          completionTokens: 200,
          totalTokens: 1200 + i,
          costUsd: 0.01,
          model: 'model-' + (i % 8)
        },
        { date: key }
      );
    }
    const trimmed = AgentStats.trimStore(store);
    assert.ok(trimmed.days.length <= AgentStats.MAX_DAYS);
    assert.ok(Object.keys(trimmed.models).length <= AgentStats.MAX_MODELS);
    assert.ok(AgentStats.serializedSize(trimmed) <= AgentStats.MAX_SERIALIZED);
  });

  it('daySeries fills gaps oldest to newest', () => {
    let store = AgentStats.emptyStore();
    store = AgentStats.recordTurn(
      store,
      { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: 0.001, model: 'x' },
      { date: '2026-07-21' }
    );
    // Freeze "today" by passing series built from known end — daySeries uses todayKey()
    const series = AgentStats.daySeries(store, 3);
    assert.equal(series.length, 3);
    assert.ok(series[0].d < series[1].d || series[0].d === series[1].d);
    assert.equal(series[2].d, AgentStats.todayKey());
  });

  it('formatters handle small costs and large tokens', () => {
    assert.equal(AgentStats.formatCostUsd(0), '$0');
    assert.match(AgentStats.formatCostUsd(0.00005), /</);
    assert.equal(AgentStats.formatTokenCount(1500), '1.5k');
    assert.equal(AgentStats.formatTokenCount(12000), '12k');
  });

  it('load/save round-trip via mock t', async () => {
    const bag = {};
    const t = {
      get: async (scope, vis, key) => {
        assert.equal(scope, 'member');
        assert.equal(vis, 'private');
        assert.equal(key, 'agentUsageStats');
        return bag[key] || null;
      },
      set: async (scope, vis, key, value) => {
        bag[key] = value;
      }
    };
    let store = AgentStats.recordTurn(AgentStats.emptyStore(), {
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30,
      costUsd: 0.001,
      model: 'gpt-4o-mini'
    });
    await AgentStats.save(t, store);
    const loaded = await AgentStats.load(t);
    assert.equal(loaded.life.turns, 1);
    assert.equal(loaded.life.tt, 30);

    const blank = await AgentStats.reset(t);
    assert.equal(blank.life.turns, 0);
    const after = await AgentStats.load(t);
    assert.equal(after.life.turns, 0);
  });

  it('hasAnyActivity reflects lifetime usage', () => {
    assert.equal(AgentStats.hasAnyActivity(AgentStats.emptyStore()), false);
    const used = AgentStats.recordTurn(AgentStats.emptyStore(), {
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      costUsd: 0,
      model: 'x'
    });
    assert.equal(AgentStats.hasAnyActivity(used), true);
  });
});
