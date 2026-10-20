'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    style: {},
    children: [],
    parentNode: null,
    listeners: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    scrollIntoView() {},
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); c.parentNode = null; return c; },
    contains(n) { return n === this || this.children.some((c) => c.contains(n)); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    /** Dispatch like the browser: target first, then up through the ancestors until stopPropagation. */
    click(onBubbleToDocument) {
      let stopped = false;
      const evt = { type: 'click', target: this, stopPropagation() { stopped = true; }, preventDefault() {} };
      (this.listeners.click || []).forEach((fn) => fn(evt));
      if (!stopped && onBubbleToDocument) onBubbleToDocument(evt);
    },
  };
  return el;
}

function findRow(node, label) {
  for (const c of node.children) {
    if (c.className.indexOf('tbm-item') !== -1 && c.children.some((k) => k.textContent === label)) return c;
    const hit = findRow(c, label);
    if (hit) return hit;
  }
  return null;
}

describe('TableMenu', () => {
  let saved;

  beforeEach(() => {
    saved = {
      document: global.document,
      innerWidth: global.innerWidth,
      innerHeight: global.innerHeight,
      addEventListener: global.addEventListener,
      removeEventListener: global.removeEventListener,
    };
    global.addEventListener = () => {};
    global.removeEventListener = () => {};
    global.document = {
      body: makeEl('body'),
      createElement: makeEl,
      addEventListener() {},
      removeEventListener() {},
    };
    global.innerWidth = 1000;
    global.innerHeight = 800;
    clearComponentCache();
    loadComponent('table/table-menu.js');
  });

  afterEach(() => {
    global.TableMenu.hide();
    global.document = saved.document;
    global.innerWidth = saved.innerWidth;
    global.innerHeight = saved.innerHeight;
    global.addEventListener = saved.addEventListener;
    global.removeEventListener = saved.removeEventListener;
  });

  it('a row click runs its action and closes the menu', () => {
    let ran = 0;
    global.TableMenu.show({ x: 10, y: 10 }, [{ label: 'Colonnes…', action() { ran++; } }, { label: 'Autre' }]);
    const menu = global.document.body.children[0];
    assert.ok(menu, 'menu is in the page');
    findRow(menu, 'Colonnes…').click();
    assert.equal(ran, 1);
    assert.equal(global.document.body.children.length, 0);
  });

  it('a row click does not bubble to "click outside" handlers (Colonnes… must stay open)', () => {
    // The Tableau closes its Colonnes panel on any document click; the action opens it first, so a bubbling click closes it again.
    let panelOpen = false;
    const documentClick = () => { panelOpen = false; };
    global.TableMenu.show({ x: 10, y: 10 }, [{ label: 'Colonnes…', action() { panelOpen = true; } }, { label: 'Autre' }]);
    findRow(global.document.body.children[0], 'Colonnes…').click(documentClick);
    assert.equal(panelOpen, true);
  });
});
