'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const COMPONENTS = path.join(ROOT, 'components');

let shimInstalled = false;

/**
 * Minimal browser globals so IIFE Power-Up scripts attach to `global`
 * (and so V8 coverage can instrument `require()`d files).
 */
function installBrowserShim() {
  if (shimInstalled) return;
  shimInstalled = true;

  global.window = global;
  global.self = global;

  if (!global.navigator) {
    global.navigator = { userAgent: 'node-test' };
  }

  if (!global.document) {
    const noop = () => {};
    const el = () => ({
      style: {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      setAttribute: noop,
      getAttribute: () => null,
      appendChild: noop,
      removeChild: noop,
      addEventListener: noop,
      removeEventListener: noop,
      querySelector: () => null,
      querySelectorAll: () => [],
      textContent: '',
      innerHTML: '',
      children: [],
    });
    global.document = {
      createElement: el,
      createTextNode: (t) => ({ textContent: t }),
      createDocumentFragment: () => ({ appendChild: noop }),
      body: el(),
      head: el(),
      documentElement: el(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      removeEventListener: noop,
    };
  }

  if (typeof global.HTMLElement === 'undefined') {
    global.HTMLElement = function HTMLElement() {};
  }
  if (typeof global.customElements === 'undefined') {
    global.customElements = { define() {}, get() { return undefined; } };
  }
  if (typeof global.matchMedia === 'undefined') {
    global.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
  }
  if (typeof global.requestAnimationFrame === 'undefined') {
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  if (typeof global.localStorage === 'undefined') {
    const store = new Map();
    global.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(String(k), String(v)); },
      removeItem: (k) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
  }
}

/**
 * Load a component script relative to `components/` (e.g. `priority/priority-matrix.js`).
 * Returns `global` after the script runs.
 */
function loadComponent(relPath) {
  installBrowserShim();
  const abs = path.join(COMPONENTS, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Component not found: ${abs}`);
  }
  // Fresh require each time the cache was cleared; otherwise reuse.
  require(abs);
  return global;
}

/**
 * Clear require cache for component modules so a later load picks up edits.
 */
function clearComponentCache() {
  const prefix = COMPONENTS + path.sep;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(prefix) || key.replace(/\//g, path.sep).startsWith(prefix)) {
      delete require.cache[key];
    }
  }
}

module.exports = {
  ROOT,
  COMPONENTS,
  installBrowserShim,
  loadComponent,
  clearComponentCache,
};
