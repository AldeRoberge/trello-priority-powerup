'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('SetupI18n', () => {
  let I;
  beforeEach(() => {
    clearComponentCache();
    delete global.SetupI18n;
    I = loadComponent('shared/setup-i18n.js').SetupI18n;
  });

  it('fr and en define exactly the same keys', () => {
    assert.deepEqual(Object.keys(I.en).sort(), Object.keys(I.fr).sort());
  });

  it('no translation is empty', () => {
    for (const lang of ['fr', 'en']) {
      for (const [k, v] of Object.entries(I[lang])) assert.ok(v && v.trim(), `${lang}.${k}`);
    }
  });

  it('every data-i18n key used in index.html exists', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-title|-aria|-tip)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 20);
    for (const k of new Set(keys)) assert.ok(k in I.fr, `missing key ${k}`);
  });

  it('detects language from navigator', () => {
    assert.equal(I.detect({ language: 'fr-CA' }), 'fr');
    assert.equal(I.detect({ language: 'en-US' }), 'en');
    assert.equal(I.detect({ language: 'de' }), 'en');
    assert.equal(I.detect(null), 'en');
  });
});
