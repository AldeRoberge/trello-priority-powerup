'use strict';

/**
 * Cross-platform test entrypoint (Windows shells do not expand globs the same way).
 * Usage: node scripts/run-tests.js [--coverage] [--unit]
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'test');

const args = process.argv.slice(2);
const coverage = args.includes('--coverage');
const unitOnly = args.includes('--unit');

const UNIT_FILES = [
  'version.test.js',
  'priority-matrix.test.js',
  'priority-scoring.test.js',
  'recurrence.test.js',
  'statut.test.js',
  'effects.test.js',
  'completion.test.js',
  'blocked-motifs.test.js',
  'brand.test.js',
  'overview.test.js',
  'markdown-rich.test.js',
  'status-brief.test.js',
  'progress-summary.test.js',
  'task-types.test.js',
  'task-split.test.js',
  'history.test.js',
  'debug-log.test.js',
];

function listTests() {
  if (unitOnly || coverage) {
    return UNIT_FILES.map((f) => path.join(TEST_DIR, f));
  }
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
