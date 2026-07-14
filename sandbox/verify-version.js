/* eslint-disable no-console */
const assert = require('assert');

global.window = global;
require('../components/shared/version.js');

const { relativeAgo, resolveBuiltAt, parseTimestampMs } = global.BuildVersion;

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}:`, err.message);
    process.exitCode = 1;
  }
}

const now = Date.now();
const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
const fourHoursAgo = new Date(now - 4 * 60 * 60 * 1000).toISOString();

test('relativeAgo reports minutes for a recent build', () => {
  const label = relativeAgo(fiveMinAgo);
  assert.match(label, /minute/);
  assert.doesNotMatch(label, /heure/);
});

test('relativeAgo reports hours for an older build', () => {
  const label = relativeAgo(fourHoursAgo);
  assert.match(label, /heure/);
});

test('resolveBuiltAt prefers the newest timestamp', () => {
  const staleBuiltAt = fourHoursAgo;
  const freshProbeMs = now - 5 * 60 * 1000;
  const resolved = resolveBuiltAt(staleBuiltAt, freshProbeMs);
  assert.equal(parseTimestampMs(resolved), freshProbeMs);
});

test('resolveBuiltAt keeps stamped build-info when it is newest', () => {
  const freshBuiltAt = fiveMinAgo;
  const staleProbeMs = parseTimestampMs(fourHoursAgo);
  const resolved = resolveBuiltAt(freshBuiltAt, staleProbeMs);
  assert.equal(resolved, freshBuiltAt);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('verify-version: all checks passed');
