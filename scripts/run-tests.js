'use strict';

/**
 * Cross-platform test entrypoint (Windows shells do not expand globs the same way).
 * Usage: node scripts/run-tests.js [--coverage] [--unit]
 * --unit is kept so `npm run test:unit` keeps working; unit and full runs now list the same files (every test/*.test.js).
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'test');

const args = process.argv.slice(2);
const coverage = args.includes('--coverage');

/** Every test/*.test.js, so a new test file is never silently left out of the run. */
function listTests() {
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(TEST_DIR, f))
    .sort();
}

const nodeArgs = ['--test'];
if (coverage) {
  nodeArgs.push(
    '--experimental-test-coverage',
    '--test-coverage-include=components/**/*.js',
    '--test-coverage-exclude=**/node_modules/**'
  );
}
nodeArgs.push(...listTests());

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status == null ? 1 : result.status);
