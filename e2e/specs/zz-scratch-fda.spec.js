'use strict';
const { test, expect } = require('../fixtures');
const fs = require('fs');

const OUT = 'C:/Users/demersa/AppData/Local/Temp/claude/C--Users-demersa-Documents-GitHub-trello-priority-powerup/43be8548-eff0-4823-8e59-7aa0fa0595ab/scratchpad/';

async function dump(page, name) {
  fs.writeFileSync(OUT + name + '.txt', await page.locator('body').ariaSnapshot());
  await page.screenshot({ path: OUT + name + '.png' });
}

test('dump dashboard sections', async ({ app, page }) => {
  await app.open('dashboard');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Triage/ }).click();
  await page.waitForTimeout(500);
  await dump(page, 'dash-triage');
  await page.getByRole('button', { name: /Orchestrateur/ }).click();
  await page.waitForTimeout(500);
  await dump(page, 'dash-orch');
  await page.getByRole('button', { name: 'Nouvelle carte', exact: true }).first().click();
  await page.waitForTimeout(500);
  await dump(page, 'dash-plus');
});

test('dump assistant', async ({ app, page }) => {
  await app.open('assistant');
  await page.waitForTimeout(1500);
  await dump(page, 'assistant');
});
