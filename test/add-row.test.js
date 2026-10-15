'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

/** Just enough DOM for AddRow.input: an element with attributes and listeners. */
function fakeElement() {
  const listeners = {};
  return {
    value: '',
    attrs: {},
    children: [],
    blurred: false,
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { listeners[type] = fn; },
    appendChild(c) { this.children.push(c); return c; },
    blur() { this.blurred = true; },
    fire(type, e) { listeners[type](e); },
  };
}

describe('AddRow', () => {
  let AR;
  before(() => {
    global.document = { createElement: fakeElement };
    loadComponent('shared/add-row.js');
    AR = global.AddRow;
    assert.ok(AR);
  });

  it('cleans a typed title to one trimmed line', () => {
    assert.equal(AR.cleanTitle('  Appeler   le\n plombier  '), 'Appeler le plombier');
    assert.equal(AR.cleanTitle('   '), '');
    assert.equal(AR.cleanTitle(null), '');
  });

  it('uses the shared label as a short placeholder', () => {
    const input = AR.input({ id: 'x' });
    assert.equal(input.placeholder, 'Nouvelle carte…');
    assert.equal(input.id, 'x');
    assert.equal(input.className, 'ar-input');
  });

  it('submits the cleaned title on Enter only', () => {
    const got = [];
    const input = AR.input({ onSubmit: (title) => got.push(title) });
    const key = (k, extra) => ({ key: k, stopPropagation() {}, preventDefault() {}, ...extra });
    input.value = '  Faire  les courses ';
    input.fire('keydown', key('a'));
    input.fire('keydown', key('Enter', { isComposing: true }));
    assert.deepEqual(got, []);
    input.fire('keydown', key('Enter'));
    assert.deepEqual(got, ['Faire les courses']);
    input.value = '   ';
    input.fire('keydown', key('Enter'));
    assert.deepEqual(got, ['Faire les courses']);
  });

  it('builds a line with a plus and a labelled input, floating on request', () => {
    const line = AR.line({ label: 'Nouveau document', float: true });
    assert.match(line.className, /ar-line ar-line--float/);
    assert.equal(line.children.length, 2);
    assert.match(line.children[0].className, /ar-plus/);
    assert.equal(line.children[1].placeholder, 'Nouveau document…');
    assert.equal(line.children[1].attrs['aria-label'], 'Nouveau document');
    assert.doesNotMatch(AR.line({}).className, /float/);
  });

  it('Escape clears and leaves the field', () => {
    const input = AR.input({});
    input.value = 'abc';
    input.fire('keydown', { key: 'Escape', stopPropagation() {}, preventDefault() {} });
    assert.equal(input.value, '');
    assert.equal(input.blurred, true);
  });
});
