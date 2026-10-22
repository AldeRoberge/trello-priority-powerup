'use strict';
/* Every page of the Power-Up loads inside the fake Trello without errors, in light and dark mode,
 * at desktop and phone width (the project decides the width), and passes the layout checks. */
const { test, expect } = require('../fixtures');

const PAGES = [
  { name: 'index', desc: 'connector / landing' },
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
  { name: 'welcome' },
  { name: 'memory-align' },
  { name: 'memory-chat' },
  { name: 'google-sheets-sync' },
  { name: 'outlook-power-automate' },
  { name: 'popup', opts: { query: { cardId: 'c2' }, card: 'c2' }, desc: 'task page of a card' },
  { name: 'card-open', opts: { card: 'c2' }, desc: 'card-back section' },
  { name: 'completion', desc: 'legacy page' },
  { name: 'auth-return', desc: 'OAuth return page' },
];

for (const theme of ['light', 'dark']) {
  test.describe('smoke · ' + theme, () => {
    test.use({ theme, colorScheme: theme });
    for (const p of PAGES) {
      test(p.name + (p.desc ? ' (' + p.desc + ')' : ''), async ({ app, page }, testInfo) => {
        await app.open(p.name, p.opts);
        const title = await page.title();
        expect(title, 'the page has a title').not.toBe('');
        await app.check(p.name);
        await testInfo.attach(p.name + '-' + theme, { body: await page.screenshot(), contentType: 'image/png' });
      });
    }
  });
}
