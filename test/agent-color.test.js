'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('UserProfile agent colors', () => {
  let UserProfile;

  beforeEach(() => {
    clearComponentCache();
    delete global.UserProfile;
    UserProfile = loadComponent('profile/user-profile.js').UserProfile;
  });

  it('normalizes named colors and aliases', () => {
    assert.equal(UserProfile.normalizeAgentColor('orange'), 'orange');
    assert.equal(UserProfile.normalizeAgentColor('Jaune'), 'yellow');
    assert.equal(UserProfile.normalizeAgentColor('doré'), 'yellow');
  });

  it('accepts custom hex and snaps exact preset mids to keys', () => {
    assert.equal(UserProfile.normalizeAgentColor('#a1b2c3'), '#a1b2c3');
    assert.equal(UserProfile.normalizeAgentColor('#ABC'), '#aabbcc');
    assert.equal(UserProfile.normalizeAgentColor('#f5b58a'), 'orange');
    assert.equal(UserProfile.isCustomAgentColor('#3366ff'), true);
    assert.equal(UserProfile.isCustomAgentColor('blue'), false);
  });

  it('builds a palette for custom hex', () => {
    const pal = UserProfile.agentColorPalette('#3366ff');
    assert.equal(pal.mid, '#3366ff');
    assert.match(pal.hi, /^#[0-9a-f]{6}$/);
    assert.match(pal.lo, /^#[0-9a-f]{6}$/);
    assert.match(pal.glow, /^#[0-9a-f]{6}$/);
    assert.notEqual(pal.hi, pal.mid);
  });

  it('keeps custom hex through normalizeProfile', () => {
    const p = UserProfile.normalizeProfile({ agentColor: '#112233' });
    assert.equal(p.agentColor, '#112233');
  });

  it('picks a stock name from the nearest named color for custom hex', () => {
    const name = UserProfile.pickAgentNameForColor('#7eb2f0');
    assert.ok(UserProfile.isStockAgentName(name));
  });

  it('picks a random personality and avoids repeating the current one', () => {
    assert.ok(UserProfile.AGENT_PERSONALITIES.length > 5);
    const first = UserProfile.pickRandomAgentPersonality();
    assert.ok(typeof first === 'string' && first.length > 10);
    assert.ok(UserProfile.AGENT_PERSONALITIES.includes(first));
    const second = UserProfile.pickRandomAgentPersonality(first);
    assert.notEqual(second, first);
    assert.ok(second.length <= UserProfile.MAX_AGENT_PERSONALITY);
  });
});
