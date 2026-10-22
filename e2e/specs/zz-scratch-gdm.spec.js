'use strict';
const fs = require('fs');
const { test, expect } = require('../fixtures');
const OUT = 'C:/Users/demersa/AppData/Local/Temp/claude/C--Users-demersa-Documents-GitHub-trello-priority-powerup/43be8548-eff0-4823-8e59-7aa0fa0595ab/scratchpad/gdm-';
const log = (...a) => console.log('[S]', ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));

test('scratch gantt create', async ({ app, page }) => {
  await app.open('gantt');
  const input = page.getByRole('textbox', { name: 'Nouvelle carte' });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.type('Appeler le client demain');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  log(app.model.restLog.map((r) => r.method + ' ' + r.path + ' ' + JSON.stringify(r.body || r.query).slice(0, 200)).slice(-8));
  log(app.model.cards.slice(-1));
  await page.screenshot({ path: OUT + 'g-create.png' });
});

test('scratch gantt month drag', async ({ app, page }) => {
  await app.open('gantt');
  await page.getByRole('button', { name: 'Mois', exact: true }).click();
  await page.waitForTimeout(500);
  const bar = page.locator('.gantt-bar[title^="Publier la version 2"]');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  log('bar', box);
  await page.screenshot({ path: OUT + 'g-month.png' });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  log(app.card('c3'));
  log(app.model.restLog.map((r) => r.method + ' ' + r.path + ' ' + JSON.stringify(r.body || r.query).slice(0, 200)).slice(-4));
  await page.screenshot({ path: OUT + 'g-month2.png' });
});
