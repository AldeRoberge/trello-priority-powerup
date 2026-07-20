'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('UserProfile.load cache', () => {
  let UserProfile;

  beforeEach(() => {
    clearComponentCache();
    delete global.UserProfile;
    UserProfile = loadComponent('profile/user-profile.js').UserProfile;
  });

  function mockT(store) {
    let gets = 0;
    return {
      gets: () => gets,
      get: async () => {
        gets += 1;
        return store;
      },
      set: async (_scope, _vis, _key, value) => {
        store = value;
        return value;
      },
    };
  }

  it('coalesces concurrent loads into one t.get', async () => {
    const t = mockT({
      language: 'fr',
      dialect: 'qc',
      agentName: 'Ada',
      agentColor: 'blue',
    });
    const [a, b, c] = await Promise.all([
      UserProfile.load(t),
      UserProfile.load(t),
      UserProfile.load(t),
    ]);
    assert.equal(t.gets(), 1);
    assert.equal(a.language, 'fr');
    assert.equal(b.language, 'fr');
    assert.equal(c.language, 'fr');
  });

  it('serves subsequent loads from TTL cache', async () => {
    const t = mockT({
      language: 'en',
      dialect: 'us',
      agentName: 'Ada',
      agentColor: 'blue',
    });
    await UserProfile.load(t);
    await UserProfile.load(t);
    await UserProfile.load(t);
    assert.equal(t.gets(), 1);
  });

  it('save refreshes the cache', async () => {
    const t = mockT({
      language: 'fr',
      dialect: 'qc',
      agentName: 'Ada',
      agentColor: 'blue',
    });
    await UserProfile.load(t);
    await UserProfile.save(t, {
      language: 'en',
      dialect: 'uk',
      agentName: 'Ada',
      agentColor: 'blue',
    });
    const again = await UserProfile.load(t);
    assert.equal(again.language, 'en');
    assert.equal(again.dialect, 'uk');
    // Still one get — save updated the in-memory cache.
    assert.equal(t.gets(), 1);
  });
});
