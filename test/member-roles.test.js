'use strict';

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('member roles catalog', () => {
  let PriorityUI;
  let PriorityTrello;

  before(() => {
    clearComponentCache();
    loadComponent('priority/priority-ui.js');
    loadComponent('priority/priority-trello.js');
    PriorityUI = global.PriorityUI;
    PriorityTrello = global.PriorityTrello;
    assert.ok(PriorityUI);
    assert.ok(PriorityTrello);
  });

  afterEach(() => {
    PriorityUI.setMemberRoleCatalog(PriorityUI.defaultMemberRoleCatalog());
    PriorityUI.setMemberRoleCustoms([]);
  });

  it('seeds builtins with video-production roles', () => {
    const catalog = PriorityUI.defaultMemberRoleCatalog();
    const ids = catalog.map((e) => e.id);
    assert.ok(ids.includes('subtitles'));
    assert.ok(ids.includes('coloring'));
    assert.ok(ids.includes('editing'));
    assert.ok(ids.includes('music'));
    const editing = catalog.find((e) => e.id === 'editing');
    assert.equal(editing.label, 'Montage');
  });

  it('normalizes empty board catalog to builtins', () => {
    const catalog = PriorityUI.normalizeMemberRoleCatalog([]);
    assert.equal(catalog.length, 4);
    assert.equal(catalog[0].id, 'subtitles');
  });

  it('keeps custom board catalog entries', () => {
    const catalog = PriorityUI.normalizeMemberRoleCatalog([
      { id: 'editing', label: 'Montage', icon: 'scissors' },
      { id: 'custom-motion-ab12', label: 'Motion', icon: 'video' },
    ]);
    assert.equal(catalog.length, 2);
    assert.equal(catalog[1].id, 'custom-motion-ab12');
    assert.equal(catalog[1].label, 'Motion');
  });

  it('assigns multiple roles per member and dedupes', () => {
    const map = PriorityUI.normalizeMemberRoles({
      m1: ['editing', 'music', 'editing', 'bogus'],
      m2: ['subtitles'],
    });
    assert.deepEqual(map.m1, ['editing', 'music']);
    assert.deepEqual(map.m2, ['subtitles']);
  });

  it('keeps orphan custom-* role ids until customs load', () => {
    const map = PriorityUI.normalizeMemberRoles({
      m1: ['custom-foo-ab12', 'nope'],
    });
    assert.deepEqual(map.m1, ['custom-foo-ab12']);
  });

  it('creates card-local one-off roles without board catalog growth', () => {
    const before = PriorityUI.getMemberRoleCatalog().length;
    const draft = PriorityUI.createCustomMemberRole(
      { label: 'Motion design' },
      { apply: true }
    );
    assert.ok(draft);
    assert.ok(draft.id.startsWith('custom-'));
    assert.equal(draft.label, 'Motion design');
    assert.equal(PriorityUI.getMemberRoleCatalog().length, before);
    const customs = PriorityUI.getMemberRoleCustoms();
    assert.ok(customs.some((c) => c.id === draft.id));
  });

  it('prunes unused card customs', () => {
    const draft = PriorityUI.createCustomMemberRole(
      { label: 'Voice-over' },
      { apply: true }
    );
    assert.ok(draft);
    const pruned = PriorityUI.pruneMemberRoleCustoms(
      PriorityUI.getMemberRoleCustoms(),
      { m1: ['editing'] }
    );
    assert.equal(pruned.length, 0);

    const kept = PriorityUI.pruneMemberRoleCustoms(
      [{ id: draft.id, label: 'Voice-over', icon: 'microphone' }],
      { m1: [draft.id] }
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, draft.id);
  });

  it('removes a member from the roles map', () => {
    const next = PriorityUI.removeMemberFromRoles(
      { m1: ['editing', 'music'], m2: ['subtitles'] },
      'm1'
    );
    assert.equal(next.m1, undefined);
    assert.deepEqual(next.m2, ['subtitles']);
  });

  it('normalizeInputs persists memberRoles and customs', () => {
    const draft = PriorityUI.createCustomMemberRole(
      { label: 'Bruitage' },
      { apply: true }
    );
    const normalized = PriorityTrello.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      memberRoles: { abc: ['editing', draft.id] },
      memberRoleCustoms: [draft],
    });
    assert.deepEqual(normalized.memberRoles.abc, ['editing', draft.id]);
    assert.ok(
      normalized.memberRoleCustoms.some((c) => c.id === draft.id)
    );
  });

  it('clearBlockedFromInputs keeps memberRoles', () => {
    const cleared = PriorityTrello.clearBlockedFromInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReasons: ['x'],
      memberRoles: { m1: ['editing'] },
      memberRoleCustoms: [{ id: 'custom-x-ab12', label: 'X', icon: 'tag' }],
    });
    assert.deepEqual(cleared.memberRoles, { m1: ['editing'] });
    assert.equal(cleared.memberRoleCustoms.length, 1);
  });
});
