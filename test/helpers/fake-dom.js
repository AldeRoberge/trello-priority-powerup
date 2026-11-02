'use strict';

// A tiny event DOM for node:test (no jsdom): elements with children, classes, attributes and listeners, a document
// with a body, and fake timers. Enough to drive the Power-Up widgets that build their own DOM and listen for pointer,
// click and focus events. Run a component in it with vm.runInNewContext(code, { window: win, document: doc }).

function node(tag) {
  const n = {
    tag,
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    style: {},
    attrs: {},
    listeners: {},
    textContent: '',
    rect: null,
    value: '',
    _class: '',
    get className() { return this._class; },
    set className(v) { this._class = String(v); },
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this._class = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    contains(other) {
      if (other === this) return true;
      return this.children.some((c) => c && c.contains && c.contains(other));
    },
    focus() {},
    scrollIntoView() {},
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 100, height: 0 }; },
    /** Calls the listeners of `type` the way the browser would (target defaults to this node). */
    fire(type, evt) {
      (this.listeners[type] || []).slice().forEach((fn) => fn(Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, evt)));
    },
    /** `.class` or `tag` selector over the subtree (enough for these widgets). */
    querySelector(sel) { return findAll(this, matcher(sel))[0] || null; },
    querySelectorAll(sel) { return findAll(this, matcher(sel)); },
  };
  const tokens = () => n._class.split(/\s+/).filter(Boolean);
  n.classList = {
    add: (...cls) => { const s = new Set(tokens()); cls.forEach((c) => s.add(c)); n._class = Array.from(s).join(' '); },
    remove: (...cls) => { const s = new Set(tokens()); cls.forEach((c) => s.delete(c)); n._class = Array.from(s).join(' '); },
    toggle: (c, force) => {
      const on = force === undefined ? !tokens().includes(c) : !!force;
      if (on) n.classList.add(c); else n.classList.remove(c);
      return on;
    },
    contains: (c) => tokens().includes(c),
  };
  return n;
}

function matcher(sel) {
  if (sel[0] === '.') return (n) => n.classList && n.classList.contains(sel.slice(1));
  return (n) => n.tag === sel;
}

function findAll(root, pred) {
  const out = [];
  (root.children || []).forEach((c) => {
    if (c && c.tag && pred(c)) out.push(c);
    if (c && c.children) out.push(...findAll(c, pred));
  });
  return out;
}

/** All the text under a node, in order. */
function textOf(n) {
  if (!n) return '';
  if (!n.children || !n.children.length) return n.textContent || '';
  return n.children.map(textOf).join('');
}

/** document with a body and a viewport height; `createElement` makes the nodes above. */
function createDocument(opts) {
  const doc = node('document');
  doc.createElement = node;
  doc.createTextNode = (t) => ({ textContent: String(t), children: [] });
  doc.body = node('body');
  doc.documentElement = { clientHeight: (opts && opts.height) || 700 };
  // A query from the document looks in the body, like the real one.
  doc.querySelector = (sel) => doc.body.querySelector(sel);
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  return doc;
}

/** setTimeout / clearTimeout that only run when the test says so. */
function createTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    count: () => pending.size,
    /** Runs (and removes) every pending timer whose delay is at most `ms`. */
    run(ms) {
      Array.from(pending.entries()).forEach(([id, t]) => {
        if (t.ms <= ms) { pending.delete(id); t.fn(); }
      });
    },
  };
}

module.exports = { node, findAll, textOf, createDocument, createTimers };
