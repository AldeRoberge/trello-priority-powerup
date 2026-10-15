'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SP = require('../components/shared/side-panel.js');
const root = path.join(__dirname, '..');

describe('SidePanel', () => {
  it('keeps the width between the minimum and the maximum', () => {
    assert.equal(SP.clampWidth(100), SP.MIN);
    assert.equal(SP.clampWidth(9999), SP.MAX);
    assert.equal(SP.clampWidth(300.4), 300);
  });

  it('never leaves less than the room the page needs next to it', () => {
    assert.equal(SP.clampWidth(500, 380), 380);
    assert.equal(SP.clampWidth(500, 120), SP.MIN);
  });

  it('falls back to the default for a bad saved value', () => {
    assert.equal(SP.clampWidth('abc'), SP.DEFAULT);
    assert.equal(SP.clampWidth(undefined), SP.DEFAULT);
  });

  it('is loaded by every page that has a left panel', () => {
    for (const page of ['dashboard.html', 'docs.html', 'entities.html', 'sandbox/e2e/dashboard.html', 'sandbox/e2e/docs.html', 'sandbox/e2e/entities.html']) {
      const html = fs.readFileSync(path.join(root, page), 'utf8');
      assert.match(html, /components\/shared\/side-panel\.js/, page);
    }
  });
});
