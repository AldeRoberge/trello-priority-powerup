'use strict';
const { test } = require('../fixtures');

test('scratch table', async ({ app, page }) => {
  await app.open('table');
  const rows = await page.$$eval('tr[data-id]', (trs) => trs.map((tr) => tr.getAttribute('data-id') + ' | ' + Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim().replace(/\s+/g, ' ')).join(' | ')));
  console.log(rows.join('\n'));
  console.log('HEADERS', await page.$$eval('th[data-key]', (ths) => ths.map((t) => t.getAttribute('data-key') + ':' + t.textContent.trim())));
  console.log('BAR', await page.$eval('.tb-bar', (b) => b.innerText.replace(/\s+/g, ' ')));
  console.log('BTNS', await page.$$eval('.tb-bar button', (bs) => bs.map((b) => b.title + '|' + b.textContent.trim())));
  console.log('model lists', JSON.stringify(app.model.pluginData['board:b1|shared'] || {}).slice(0, 800));
});

test('scratch kanban', async ({ app, page }) => {
  await app.open('kanban');
  const cols = await page.$$eval('.kb-col', (cs) => cs.map((c) => c.getAttribute('data-list') + ' :: ' + c.querySelector('.kb-col-name').textContent + ' :: ' + c.querySelector('.kb-col-count').textContent + ' :: ' + Array.from(c.querySelectorAll('.kb-card')).map((k) => k.getAttribute('data-id') + '=' + k.querySelector('.kb-title').textContent.slice(0, 20)).join(', ')));
  console.log(cols.join('\n'));
  console.log('BAR', await page.$eval('.kb-bar', (b) => b.innerText.replace(/\s+/g, ' ')));
  console.log('BTNS', await page.$$eval('.kb-bar button', (bs) => bs.map((b) => b.title + '|' + b.textContent.trim())));
});
