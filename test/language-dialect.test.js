'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('UserProfile language & dialect', () => {
  let UserProfile;

  beforeEach(() => {
    clearComponentCache();
    delete global.UserProfile;
    UserProfile = loadComponent('profile/user-profile.js').UserProfile;
  });

  it('defaults to Français Québécois', () => {
    const empty = UserProfile.emptyProfile();
    assert.equal(empty.language, 'fr');
    assert.equal(empty.dialect, 'qc');

    const normalized = UserProfile.normalizeProfile({});
    assert.equal(normalized.language, 'fr');
    assert.equal(normalized.dialect, 'qc');
  });

  it('migrates legacy French profiles without dialect to qc', () => {
    const normalized = UserProfile.normalizeProfile({ language: 'fr' });
    assert.equal(normalized.language, 'fr');
    assert.equal(normalized.dialect, 'qc');
  });

  it('normalizes invalid dialects to the language default', () => {
    assert.equal(UserProfile.normalizeDialect('fr', 'nope'), 'qc');
    assert.equal(UserProfile.normalizeDialect('en', 'nope'), 'us');
    assert.equal(
      UserProfile.normalizeProfile({ language: 'en', dialect: 'qc' }).dialect,
      'us'
    );
    assert.equal(
      UserProfile.normalizeProfile({ language: 'fr', dialect: 'us' }).dialect,
      'qc'
    );
  });

  it('accepts aliases for dialects', () => {
    assert.equal(UserProfile.normalizeDialect('fr', 'quebecois'), 'qc');
    assert.equal(UserProfile.normalizeDialect('fr', 'fr-ca'), 'qc');
    assert.equal(UserProfile.normalizeDialect('fr', 'france'), 'fr');
    assert.equal(UserProfile.normalizeDialect('en', 'en-gb'), 'uk');
    assert.equal(UserProfile.normalizeDialect('en', 'en-ca'), 'ca');
  });

  it('lists dialects per language', () => {
    assert.deepEqual(UserProfile.dialectKeysFor('fr'), ['qc', 'fr', 'be', 'ch']);
    assert.deepEqual(UserProfile.dialectKeysFor('en'), ['us', 'uk', 'ca']);
    assert.equal(UserProfile.defaultDialectFor('fr'), 'qc');
    assert.equal(UserProfile.defaultDialectFor('en'), 'us');
  });

  it('exposes dialect in toAgentContext', () => {
    const ctx = UserProfile.toAgentContext({
      language: 'fr',
      dialect: 'qc',
      tone: 'concise'
    });
    assert.equal(ctx.language, 'fr');
    assert.equal(ctx.dialect, 'qc');
  });

  it('profilePromptLines include Québécois vocabulary guidance', () => {
    const lines = UserProfile.profilePromptLines({
      language: 'fr',
      dialect: 'qc'
    });
    const joined = lines.join('\n');
    assert.match(joined, /québécois/i);
    assert.match(joined, /sabler/);
    assert.match(joined, /poncer/);
  });

  it('languageInstruction covers regional variants', () => {
    assert.match(
      UserProfile.languageInstruction({ language: 'fr', dialect: 'qc' }),
      /sabler/
    );
    assert.match(
      UserProfile.languageInstruction({ language: 'fr', dialect: 'fr' }),
      /France/
    );
    assert.match(
      UserProfile.languageInstruction({ language: 'en', dialect: 'uk' }),
      /British|UK/
    );
    assert.match(
      UserProfile.languageInstruction({ language: 'en', dialect: 'us' }),
      /American|US/
    );
  });
});
