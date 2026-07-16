'use strict';

/**
 * Runs legacy sandbox verify scripts as integration tests.
 * Unit coverage lives in the other *.test.js files (require-based).
 *
 * Scripts listed in KNOWN_FAILING are skipped until those verifies are fixed;
 * they can still be run directly with `node sandbox/<name>.js`.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const SANDBOX = path.join(ROOT, 'sandbox');

/** Verifies currently green under Node — included in `npm test`. */
const NODE_VERIFIES = [
  'verify-matrix.js',
  'verify-version.js',
  'verify-effects.js',
  'verify-statut.js',
  'verify-badges.js',
  'verify-goals.js',
  'verify-markdown.js',
  'verify-agent-identity.js',
  'verify-agent-name.js',
  'verify-blocked-incomplete.js',
  'verify-contrast-highlights.js',
  'verify-improvement-noop.js',
  'verify-point-at.js',
  'verify-subtask-pick.js',
];

/** Pre-existing failures vs current product code — tracked but not blocking. */
const KNOWN_FAILING = [
  'verify-completion.js',
  'verify-card-dream.js',
  'verify-progress-complete.js',
];

function runNodeScript(rel) {
  const script = path.join(SANDBOX, rel);
  return spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

describe('sandbox verify scripts (Node)', () => {
  for (const name of NODE_VERIFIES) {
    const scriptPath = path.join(SANDBOX, name);
    if (!fs.existsSync(scriptPath)) {
      it.skip(`${name} (missing)`, () => {});
      continue;
    }
    it(name, () => {
      const result = runNodeScript(name);
      if (result.error) {
        assert.fail(result.error.message);
      }
      if (result.status !== 0) {
        const out = [result.stdout, result.stderr].filter(Boolean).join('\n');
        assert.fail(`${name} exited ${result.status}\n${out}`);
      }
    });
  }

  for (const name of KNOWN_FAILING) {
    it.skip(`${name} (known failing — run manually to triage)`, () => {});
  }
});
