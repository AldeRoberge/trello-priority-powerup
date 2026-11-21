'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const win = {};
['triage-dnd.js', 'triage-tree.js'].forEach((f) => {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard', f), 'utf8'), { window: win });
});

test('a manual order applies to a list without project lines', () => {
  const rows = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const built = win.TriageTree.build(rows, { order: { projects: [], tasks: { '': ['c', 'a', 'b'] } } });
  assert.equal(built.nodes.filter((n) => n.kind === 'task').map((n) => n.row.id).join(), 'c,a,b');
});
