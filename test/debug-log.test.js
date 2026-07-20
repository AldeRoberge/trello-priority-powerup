'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('TpDebug', () => {
  let logs;
  let warns;
  let errors;
  let origLog;
  let origWarn;
  let origError;

  beforeEach(() => {
    clearComponentCache();
    delete global.TpDebug;
    logs = [];
    warns = [];
    errors = [];
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    console.log = function () {
      logs.push(Array.prototype.slice.call(arguments));
    };
    console.warn = function () {
      warns.push(Array.prototype.slice.call(arguments));
    };
    console.error = function () {
      errors.push(Array.prototype.slice.call(arguments));
    };
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    if (global.TpDebug) global.TpDebug.configure(false);
  });

  it('is off by default and gates routine logs', () => {
    const g = loadComponent('shared/debug-log.js');
    assert.equal(g.TpDebug.isEnabled(), false);
    g.TpDebug.log('test', 'should-not-appear', { ok: true });
    assert.equal(logs.length, 0);
  });

  it('emits structured logs when enabled', () => {
    const g = loadComponent('shared/debug-log.js');
    g.TpDebug.configure(true);
    assert.equal(g.TpDebug.isEnabled(), true);
    // configure(true) from off emits debug.enabled
    assert.ok(logs.length >= 1);
    logs.length = 0;
    g.TpDebug.log('priority', 'save.end', { autoSort: true, count: 2 });
    assert.equal(logs.length, 1);
    assert.match(String(logs[0][0]), /\[Cerveau\] priority\.save\.end/);
    assert.deepEqual(logs[0][1], { autoSort: true, count: 2 });
  });

  it('sanitizeMeta drops non-primitive and long free text', () => {
    const g = loadComponent('shared/debug-log.js');
    const clean = g.TpDebug.sanitizeMeta({
      ok: true,
      count: 3,
      reason: 'already-sorted',
      nested: { secret: true },
      arr: [1, 2],
      long: 'x'.repeat(120),
      empty: '',
      nil: null
    });
    assert.equal(clean.ok, true);
    assert.equal(clean.count, 3);
    assert.equal(clean.reason, 'already-sorted');
    assert.equal(clean.nested, undefined);
    assert.equal(clean.arr, undefined);
    assert.equal(clean.empty, undefined);
    assert.equal(clean.nil, undefined);
    assert.ok(clean.long.length <= 80);
    assert.match(clean.long, /\.\.\.$/);
  });

  it('error always logs sanitized name even when disabled', () => {
    const g = loadComponent('shared/debug-log.js');
    g.TpDebug.configure(false);
    const err = new Error('boom');
    err.name = 'TypeError';
    g.TpDebug.error('rest', 'put', err, { status: 500 });
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /\[Cerveau\] rest\.put/);
    // When disabled, only the error name is shown (no raw Error object / body).
    assert.equal(errors[0][1], 'TypeError');
  });

  it('error includes meta when enabled', () => {
    const g = loadComponent('shared/debug-log.js');
    g.TpDebug.configure(true);
    errors.length = 0;
    g.TpDebug.error('rest', 'put', { name: 'Error', status: 401 }, { reason: 'denied' });
    assert.equal(errors.length, 1);
    assert.equal(errors[0][1].error, 'Error');
    assert.equal(errors[0][1].code, 'http_401');
    assert.equal(errors[0][1].reason, 'denied');
  });

  it('start tracks durationMs on end', () => {
    const g = loadComponent('shared/debug-log.js');
    g.TpDebug.configure(true);
    logs.length = 0;
    const span = g.TpDebug.start('popup', 'init', { phase: 'mount' });
    span.end({ ok: true });
    assert.equal(logs.length, 2);
    assert.match(String(logs[0][0]), /popup\.init\.start/);
    assert.match(String(logs[1][0]), /popup\.init\.end/);
    assert.equal(logs[1][1].ok, true);
    assert.equal(typeof logs[1][1].durationMs, 'number');
  });
});

describe('UserProfile.debugLogging', () => {
  beforeEach(() => {
    clearComponentCache();
    delete global.UserProfile;
    delete global.TpDebug;
  });

  it('defaults debugLogging to false', () => {
    const g = loadComponent('profile/user-profile.js');
    const empty = g.UserProfile.emptyProfile();
    assert.equal(empty.debugLogging, false);
    assert.equal(g.UserProfile.isDebugLoggingEnabled(empty), false);
  });

  it('normalizes truthy debugLogging only for boolean true', () => {
    const g = loadComponent('profile/user-profile.js');
    assert.equal(g.UserProfile.normalizeProfile({ debugLogging: true }).debugLogging, true);
    assert.equal(g.UserProfile.normalizeProfile({ debugLogging: 'yes' }).debugLogging, false);
    assert.equal(g.UserProfile.normalizeProfile({ debugLogging: 1 }).debugLogging, false);
    assert.equal(g.UserProfile.isDebugLoggingEnabled({ debugLogging: true }), true);
  });

  it('excludes debugLogging from agent context', () => {
    const g = loadComponent('profile/user-profile.js');
    const ctx = g.UserProfile.toAgentContext({
      debugLogging: true,
      displayName: 'Alex',
      tone: 'friendly'
    });
    assert.equal('debugLogging' in ctx, false);
    assert.equal(ctx.displayName, 'Alex');
  });

  it('configureFromProfile enables TpDebug from member preference', async () => {
    loadComponent('shared/debug-log.js');
    const g = loadComponent('profile/user-profile.js');
    const t = {
      get: async () => ({ debugLogging: true, agentColor: 'orange', agentName: 'Orange' }),
      set: async () => {}
    };
    const on = await g.TpDebug.configureFromProfile(t);
    assert.equal(on, true);
    assert.equal(g.TpDebug.isEnabled(), true);
    g.TpDebug.configure(false);
  });
});

describe('UserProfile.autoOpenCerveau', () => {
  beforeEach(() => {
    clearComponentCache();
    delete global.UserProfile;
  });

  it('defaults autoOpenCerveau to true', () => {
    const g = loadComponent('profile/user-profile.js');
    const empty = g.UserProfile.emptyProfile();
    assert.equal(empty.autoOpenCerveau, true);
    assert.equal(g.UserProfile.isAutoOpenCerveauEnabled(empty), true);
    assert.equal(g.UserProfile.isAutoOpenCerveauEnabled({}), true);
  });

  it('only an explicit false disables auto-open', () => {
    const g = loadComponent('profile/user-profile.js');
    assert.equal(g.UserProfile.normalizeProfile({ autoOpenCerveau: false }).autoOpenCerveau, false);
    assert.equal(g.UserProfile.normalizeProfile({ autoOpenCerveau: true }).autoOpenCerveau, true);
    assert.equal(g.UserProfile.normalizeProfile({}).autoOpenCerveau, true);
    assert.equal(g.UserProfile.isAutoOpenCerveauEnabled({ autoOpenCerveau: false }), false);
  });

  it('excludes autoOpenCerveau from agent context', () => {
    const g = loadComponent('profile/user-profile.js');
    const ctx = g.UserProfile.toAgentContext({
      autoOpenCerveau: false,
      displayName: 'Alex',
    });
    assert.equal('autoOpenCerveau' in ctx, false);
    assert.equal(ctx.displayName, 'Alex');
  });
});
