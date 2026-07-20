'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('BuildVersion', () => {
  let BuildVersion;

  before(() => {
    loadComponent('shared/version.js');
    BuildVersion = global.BuildVersion;
    assert.ok(BuildVersion, 'BuildVersion should export on global');
  });

  it('relativeAgo reports minutes for a recent build', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const label = BuildVersion.relativeAgo(fiveMinAgo);
    assert.match(label, /minute/);
    assert.doesNotMatch(label, /heure/);
  });

  it('relativeAgo reports hours for an older build', () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const label = BuildVersion.relativeAgo(fourHoursAgo);
    assert.match(label, /heure/);
  });

  it('resolveBuiltAt prefers the newest timestamp', () => {
    const now = Date.now();
    const staleBuiltAt = new Date(now - 4 * 60 * 60 * 1000).toISOString();
    const freshProbeMs = now - 5 * 60 * 1000;
    const resolved = BuildVersion.resolveBuiltAt(staleBuiltAt, freshProbeMs);
    assert.equal(BuildVersion.parseTimestampMs(resolved), freshProbeMs);
  });

  it('resolveBuiltAt keeps stamped build-info when it is newest', () => {
    const now = Date.now();
    const freshBuiltAt = new Date(now - 5 * 60 * 1000).toISOString();
    const staleProbeMs = BuildVersion.parseTimestampMs(
      new Date(now - 4 * 60 * 60 * 1000).toISOString()
    );
    const resolved = BuildVersion.resolveBuiltAt(freshBuiltAt, staleProbeMs);
    assert.equal(resolved, freshBuiltAt);
  });

  it('parseTimestampMs returns NaN for invalid input', () => {
    assert.ok(Number.isNaN(BuildVersion.parseTimestampMs(null)));
    assert.ok(Number.isNaN(BuildVersion.parseTimestampMs('')));
    assert.ok(Number.isNaN(BuildVersion.parseTimestampMs('not-a-date')));
  });

  it('updatedLabel formats instant and past builds', () => {
    assert.equal(
      BuildVersion.updatedLabel(new Date().toISOString()),
      "Binaires de l'application Cerveau mis à jour à l'instant"
    );
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    assert.match(
      BuildVersion.updatedLabel(hourAgo),
      /^Binaires de l'application Cerveau mis à jour /
    );
  });
});
