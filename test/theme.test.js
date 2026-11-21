'use strict';

// Theme: the saved style and mode drive data-theme / data-color-mode, and a forced mode beats Trello's.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(saved) {
  const store = Object.assign({}, saved);
  const attrs = {};
  const root = {
    style: {},
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    removeAttribute: (k) => { delete attrs[k]; },
  };
  const win = {
    document: { documentElement: root },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  };
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'theme.js'), 'utf8'),
    vm.createContext({ window: win })
  );
  return { Theme: win.Theme, attrs, root, store };
}

const STYLE = 'trello-priority-powerup/theme-style';
const MODE = 'trello-priority-powerup/theme-mode';

test('default: classic style, no data-theme, mode follows Trello', () => {
  const { Theme, attrs } = load();
  assert.equal(Theme.style(), 'classique');
  assert.equal(attrs['data-theme'], undefined);
  assert.equal(Theme.mode(), 'auto');
  assert.equal(Theme.resolveMode('dark'), 'dark');
  assert.equal(Theme.resolveMode(null), null);
});

test('a saved style sets data-theme; an unknown one falls back to classic', () => {
  assert.equal(load({ [STYLE]: 'tonal' }).attrs['data-theme'], 'tonal');
  const bad = load({ [STYLE]: 'nope' });
  assert.equal(bad.Theme.style(), 'classique');
  assert.equal(bad.attrs['data-theme'], undefined);
});

test('a forced mode wins over Trello and is remembered for the next page', () => {
  const { Theme, attrs, store } = load({ [MODE]: 'dark' });
  assert.equal(attrs['data-color-mode'], 'dark');
  assert.equal(Theme.resolveMode('light'), 'dark');
  assert.equal(store['trello-priority-powerup/color-mode'], 'dark');
  Theme.setMode('auto');
  assert.equal(Theme.resolveMode('light'), 'light');
});

test('setStyle applies at once; only classic dark keeps the inline page background', () => {
  const { Theme, attrs, root } = load({ [MODE]: 'dark' });
  assert.equal(root.style.backgroundColor, '#1d2125');
  Theme.setStyle('sauge');
  assert.equal(attrs['data-theme'], 'sauge');
  assert.equal(root.style.backgroundColor, '');
  assert.ok(Theme.THEMES.length >= 4);
});
