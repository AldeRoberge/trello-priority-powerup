'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'command-palette.js'), 'utf8'), { window: win });
const CP = win.CommandPalette;

const VIEWS = [{ key: 'gantt', label: 'Gantt', icon: 'timeline' }, { key: 'kanban', label: 'Kanban', icon: 'layout-kanban' }];

test('buildItems lists the other views, then actions, then cards', () => {
  const items = CP.buildItems(VIEWS, [{ label: 'Nouvelle carte', icon: 'plus' }], [{ id: 'c1', name: 'Écrire', hint: 'À faire' }], 'kanban');
  assert.deepEqual(items.map((i) => i.id), ['view:gantt', 'act:0', 'card:c1']);
  assert.equal(items[2].hint, 'À faire');
});

test('buildItems tolerates untitled and invalid cards', () => {
  const items = CP.buildItems([], [], [{ id: 'c2', name: '' }, null, {}], '');
  assert.deepEqual(items.map((i) => i.label), ['Sans titre']);
});

test('activeViewKey reads the page name', () => {
  assert.equal(CP.activeViewKey({ pathname: '/x/kanban.html' }), 'kanban');
  assert.equal(CP.activeViewKey({ pathname: '/' }), '');
});

test('buildItems offers the Assistant and settings pages like any view, and none for the page you are on', () => {
  const utils = [{ key: 'assistant', label: 'Assistant', icon: 'message-chatbot' }, { key: 'settings', label: 'Paramètres du Cerveau', icon: 'settings' }];
  const items = CP.buildItems(VIEWS.concat(utils), [], [], 'assistant');
  assert.deepEqual(items.map((i) => i.id), ['view:gantt', 'view:kanban', 'view:settings']);
});

