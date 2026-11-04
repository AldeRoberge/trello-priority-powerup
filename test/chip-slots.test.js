'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { node, createDocument } = require('./helpers/fake-dom');

function load() {
  const win = { document: createDocument() };
  win.document.createElement = (tag) => node(tag);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'chip-slots.js'), 'utf8'), { window: win });
  return win.ChipSlots;
}

function chip(width) {
  const c = node('button');
  c.rect = { left: 0, top: 0, width, height: 20 };
  return c;
}

describe('ChipSlots (table-aligned card chips)', () => {
  it('keeps an empty slot for a missing value, in the given order', () => {
    const CS = load();
    const s = CS.slots([['prio', chip(30)], ['est', null], ['due', chip(60)]]);
    assert.deepEqual(s.map((x) => x.getAttribute('data-slot')), ['prio', 'est', 'due']);
    assert.equal(s[1].children.length, 0);
    assert.equal(s[0].className, 'cs-slot');
  });

  it('gives every slot the width of the widest chip with the same name', () => {
    const CS = load();
    const root = node('div');
    const a = CS.slots([['u', chip(50)], ['due', chip(78)]]);
    const b = CS.slots([['u', chip(93)], ['due', null]]);
    a.concat(b).forEach((x) => root.appendChild(x));
    const max = CS.align(root);
    assert.equal(JSON.stringify(max), JSON.stringify({ u: 93, due: 78 }));
    assert.equal(a[0].style.minWidth, '93px');
    assert.equal(b[1].style.minWidth, '78px'); // the empty slot keeps the column
  });

  it('ignores a missing root', () => {
    assert.equal(JSON.stringify(load().align(null)), '{}');
  });
});
