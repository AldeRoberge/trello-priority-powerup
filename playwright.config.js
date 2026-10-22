'use strict';
/*
 * Playwright: real-browser user tests of every Power-Up page against a fake Trello (see e2e/README.md).
 *   npm run test:pw                 all specs, desktop + phone width
 *   npm run test:pw:headed          watch the browser
 *   npm run test:pw:explore         only the click-everything explorer
 *   npm run test:pw:serve           start the fake Trello to click around by hand
 *   npm run test:pw -- table        one spec (any Playwright CLI option works after --)
 * Uses the installed Microsoft Edge on Windows (no download); set E2E_BROWSER_CHANNEL=chrome or empty
 * (then `npx playwright install chromium`) to change it.
 */
const { defineConfig } = require('@playwright/test');

const channel = process.env.E2E_BROWSER_CHANNEL !== undefined ? process.env.E2E_BROWSER_CHANNEL : process.platform === 'win32' ? 'msedge' : '';

module.exports = defineConfig({
  testDir: './e2e/specs',
  outputDir: './e2e/.out/results',
  timeout: 120000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  retries: 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4, // the explorer is CPU heavy and time-boxed
  reporter: [['list'], ['html', { outputFolder: 'e2e/.out/report', open: 'never' }], ['./e2e/problem-reporter.js']],
  use: Object.assign(
    {
      viewport: { width: 1280, height: 800 },
      locale: 'fr-CA',
      timezoneId: 'America/Toronto',
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure',
      actionTimeout: 8000,
    },
    channel ? { channel } : {}
  ),
  projects: [
    { name: 'desktop' },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: false }, testIgnore: /flows/ },
  ],
});
