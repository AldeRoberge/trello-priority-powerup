'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { node, createDocument } = require('./helpers/fake-dom');

function load() {
  const store = {};
  const win = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    addEventListener() {},
  };
  win.document = createDocument();
  win.document.createElement = (tag) => node(tag);
  const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'hide-done.js'), 'utf8');
  vm.runInNewContext(code, { window: win });
  return win.HideDone;
}

describe('HideDone.decorate (same toggle in every view)', () => {
  it('shows the eye-off icon and the hidden count, with the words in the tooltip', () => {
    const HD = load();
    const btn = HD.decorate(node('button'), true, 3);
    assert.equal(btn.children[0].className, 'ti ti-eye-off');
    assert.equal(btn.children[1].className, 'hd-n');
    assert.equal(btn.children[1].textContent, '3');
    assert.match(btn.title, /Terminées masquées \(3\)/);
    assert.equal(btn.getAttribute('aria-pressed'), 'true');
    assert.ok(btn.className.includes('hd-btn') && btn.className.includes('is-hiding'));
  });

  it('keeps an empty count slot when completed tasks are shown, so the button keeps its place', () => {
    const HD = load();
    const btn = HD.decorate(node('button'), false, 3);
    assert.equal(btn.children[0].className, 'ti ti-eye');
    assert.equal(btn.children[1].textContent, '');
    assert.equal(btn.getAttribute('aria-pressed'), 'false');
    assert.ok(!btn.className.includes('is-hiding'));
  });

  it('caps the count at 99 and ignores a bad count', () => {
    const HD = load();
    assert.equal(HD.decorate(node('button'), true, 250).children[1].textContent, '99');
    assert.equal(HD.decorate(node('button'), true, 'x').children[1].textContent, '');
  });
});
