'use strict';

// Every card view that attaches the shared S/P/D/C keys must load the scripts those keys depend on,
// and every view that opens the shared composer must load it too. Guards against a view that wires
// LinearKeys in its JS but whose page never loads linear-keys.js (the hook then silently does nothing).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const VIEWS = [
  { name: 'kanban', page: 'kanban.html', js: 'components/kanban/kanban-ui.js' },
  { name: 'table', page: 'table.html', js: 'components/table/table-ui.js' },
  { name: 'gantt', page: 'gantt.html', js: 'components/gantt/gantt-ui.js' },
  { name: 'mindmap', page: 'mindmap.html', js: 'components/mindmap/mindmap-ui.js' },
  { name: 'dashboard', page: 'dashboard.html', js: 'components/dashboard/dashboard-ui.js' },
];

for (const view of VIEWS) {
  test(`${view.name}: LinearKeys is loaded by its page when the view attaches it`, () => {
    const js = read(view.js);
    const html = read(view.page);
    if (!/LinearKeys\.attach\(/.test(js)) return;
    for (const dep of ['linear-pick.js', 'linear-keys.js']) {
      assert.ok(html.includes(dep), `${view.page} must load ${dep}`);
    }
    // linear-keys.js opens the picker and the composer, so its shared styles must be on the page.
    assert.ok(html.includes('linear-pick.css'), `${view.page} must load linear-pick.css`);
  });

  test(`${view.name}: the composer is loaded when the view opens it`, () => {
    const js = read(view.js);
    const html = read(view.page);
    if (!/NewCard\.open\(/.test(js)) return;
    assert.ok(html.includes('new-card.js'), `${view.page} must load new-card.js`);
    assert.ok(html.includes('quick-parse.js'), `${view.page} must load quick-parse.js so "demain" becomes a due date`);
  });

  test(`${view.name}: LinearKeys gets a newCard handler when the composer exists`, () => {
    const js = read(view.js);
    if (!/LinearKeys\.attach\(/.test(js)) return;
    assert.ok(/newCard\s*:/.test(js), `${view.name} must pass newCard to LinearKeys.attach`);
  });
}

test('Entités and Documents do not attach card status keys (no status or urgency on their records)', () => {
  for (const rel of ['components/entities/entities-ui.js', 'components/docs/docs-ui.js']) {
    assert.ok(!/LinearKeys\.attach\(/.test(read(rel)), `${rel} should not attach LinearKeys`);
  }
});
