'use strict';
/* The explorer uses every page like a person would (clicks, typing, menus, drag, keys) and fails
 * on any uncaught error, console error, failed request, frozen page or unsupported Trello call. */
const { test } = require('../fixtures');
const { explore } = require('../explorer');

const PAGES = [
  { name: 'dashboard' },
  { name: 'assistant' },
  { name: 'gantt' },
  { name: 'table' },
  { name: 'kanban' },
  { name: 'mindmap' },
  { name: 'journey' },
  { name: 'docs' },
  { name: 'entities' },
  { name: 'settings' },
  { name: 'profile' },
  { name: 'popup', opts: { query: { cardId: 'c2' }, card: 'c2' } },
  { name: 'card-open', opts: { card: 'c2' } },
  { name: 'welcome' },
  { name: 'memory-align' },
  { name: 'memory-chat' },
  { name: 'google-sheets-sync' },
  { name: 'outlook-power-automate' },
];

test.describe('explore', () => {
  for (const p of PAGES) {
    test(p.name, async ({ app }) => {
      await app.open(p.name, p.opts);
      await explore(app, { seed: p.name });
    });
  }

  test('fake board (buttons, card badges, card back)', async ({ app }) => {
    await app.openBoard();
    await explore(app, { seed: 'board', steps: 60 });
  });
});
