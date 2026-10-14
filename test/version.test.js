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

  it('reloads only when a newer build is waiting and the page is idle', () => {
    assert.equal(BuildVersion.needsReload('oldsha1234', 'newsha1234', false, ''), true);
    assert.equal(BuildVersion.needsReload('oldsha1234', 'newsha1234', true, ''), false);
    assert.equal(BuildVersion.needsReload('samesha123', 'samesha123', false, ''), false);
    assert.equal(BuildVersion.needsReload('', 'newsha1234', false, ''), false);
    assert.equal(BuildVersion.needsReload('oldsha1234', 'newsha1234', false, 'newsha1234'), false);
  });

  it('adds a cache-busting v to the page URL', () => {
    const next = BuildVersion.urlWithBuild('https://x.github.io/gantt.html?x=1#top', 'abc1234567');
    const u = new URL(next);
    assert.equal(u.searchParams.get('v'), 'abc1234567');
    assert.equal(u.searchParams.get('x'), '1');
    assert.equal(u.hash, '#top');
    assert.equal(
      BuildVersion.urlWithBuild('https://x.github.io/gantt.html?v=abc1234567', 'abc1234567'),
      ''
    );
  });
});
