'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('PeopleBoardModel', () => {
  let PB;
  let me;

  const members = [
    { id: 'm1', fullName: 'Paul Tremblay', username: 'paul' },
    { id: 'm2', fullName: 'Marie Gagnon', username: 'marie' },
    { id: 'm3', fullName: 'Étienne Morin', username: 'etienne' },
  ];
  const catalog = [
    { id: 'person-nadia', name: 'Nadia Pelletier' },
    { id: 'person-link', name: 'Marie (hors Trello)', trelloMemberId: 'm2' },
    { id: 'person-me', name: 'Paul', trelloMemberId: 'm1' },
  ];
  const marie = { id: 'm2', name: 'Marie Gagnon', custom: false, trelloId: 'm2' };
  const nadia = { id: 'person-nadia', name: 'Nadia Pelletier', custom: true, trelloId: '' };
  const row = (id, assignees, customs) => ({ id, assignees: assignees || [], inputs: { customAssignees: customs || [] } });

  before(() => {
    loadComponent('dashboard/people-board-model.js');
    PB = global.PeopleBoardModel;
    me = PB.meOf({ id: 'm1', fullName: 'Paul Tremblay', initials: 'PT' });
  });

  it('meOf needs a member id', () => {
    assert.equal(PB.meOf(null), null);
    assert.equal(PB.meOf({ fullName: 'Sans id' }), null);
    assert.equal(me.key, 'me');
    assert.equal(me.trelloId, 'm1');
  });

  describe('people', () => {
    it('lists the others A to Z, accents ignored, never me', () => {
      const list = PB.people({ members, catalog, me });
      assert.deepEqual(list.map((p) => p.name), ['Étienne Morin', 'Marie Gagnon', 'Nadia Pelletier']);
    });

    it('a contact linked to a member counts once, as the member', () => {
      const list = PB.people({ members, catalog, me });
      assert.equal(list.filter((p) => /Marie/.test(p.name)).length, 1);
      assert.equal(list.filter((p) => p.custom).length, 1);
      assert.equal(list.filter((p) => p.custom)[0].key, 'c:person-nadia');
    });

    it('someone only seen on a card still gets a row', () => {
      const ghost = { id: 'm9', name: 'Ancien Membre', custom: false, trelloId: 'm9' };
      const list = PB.people({ members, catalog, me, rows: [row('a', [ghost]), row('b', [marie])] });
      assert.ok(list.some((p) => p.key === 'm:m9'));
      assert.equal(list.filter((p) => p.id === 'm2').length, 1);
    });

    it('is empty when alone on the board', () => {
      assert.deepEqual(PB.people({ members: [members[0]], catalog: [], me }), []);
    });
  });

  describe('rows', () => {
    const rows = [
      row('free', []),
      row('mine', [{ id: 'm1', name: 'Paul', custom: false, trelloId: 'm1' }]),
      row('hers', [marie]),
      row('both', [marie, { id: 'm1', name: 'Paul', custom: false, trelloId: 'm1' }]),
      row('linked', [{ id: 'person-me', name: 'Paul', custom: true, trelloId: 'm1' }]),
    ];

    it('my row is what is mine or nobody\'s', () => {
      assert.deepEqual(PB.mineRows(rows, me).map((r) => r.id), ['free', 'mine', 'both', 'linked']);
    });

    it('without a known viewer nothing is filtered', () => {
      assert.equal(PB.mineRows(rows, null).length, rows.length);
    });

    it('a person has the cards they are on, a shared card is on both rows', () => {
      const p = PB.people({ members, catalog, me }).filter((x) => x.id === 'm2')[0];
      assert.deepEqual(PB.personRows(rows, p).map((r) => r.id), ['hers', 'both']);
    });

    it('a contact linked to a member is that member', () => {
      const linkedRow = row('x', [{ id: 'person-link', name: 'Marie (hors Trello)', custom: true, trelloId: 'm2' }]);
      assert.ok(PB.isOn(linkedRow, marie));
    });
  });

  describe('handover', () => {
    it('takes the source off and puts the target on, the others stay', () => {
      const bob = { id: 'm5', name: 'Bob', custom: false, trelloId: 'm5' };
      const plan = PB.handover(row('c', [marie, bob]), PB.people({ members, catalog, me }).filter((p) => p.id === 'm2')[0], { key: 'me', id: 'm1', name: 'Paul', initials: 'P', custom: false, trelloId: 'm1' });
      assert.deepEqual(plan.memberIds.sort(), ['m1', 'm5']);
      assert.deepEqual(plan.members.sort(), ['m1', 'm5']);
      assert.equal(plan.contacts, null);
    });

    it('an unassigned card handed to a member writes that member only', () => {
      const to = PB.people({ members, catalog, me }).filter((p) => p.id === 'm2')[0];
      const plan = PB.handover(row('c', []), me, to);
      assert.deepEqual(plan.members, ['m2']);
      assert.equal(plan.contacts, null);
      assert.deepEqual(plan.assignees.map((a) => a.id), ['m2']);
    });

    it('a Hors Trello contact is stored in the inputs, not sent to Trello', () => {
      const to = PB.people({ members, catalog, me }).filter((p) => p.custom)[0];
      const plan = PB.handover(row('c', [marie]), PB.people({ members, catalog, me }).filter((p) => p.id === 'm2')[0], to);
      assert.deepEqual(plan.members, []);
      assert.deepEqual(plan.contacts.map((c) => c.id), ['person-nadia']);
      assert.equal(plan.contacts[0].name, 'Nadia Pelletier');
    });

    it('from a contact to a member clears the stored contact', () => {
      const from = PB.people({ members, catalog, me }).filter((p) => p.custom)[0];
      const to = PB.people({ members, catalog, me }).filter((p) => p.id === 'm3')[0];
      const plan = PB.handover(row('c', [nadia], [{ id: 'person-nadia', name: 'Nadia Pelletier' }]), from, to);
      assert.deepEqual(plan.members, ['m3']);
      assert.deepEqual(plan.contacts, []);
    });

    it('never puts the same person twice', () => {
      const plan = PB.handover(row('c', [marie]), me, { key: 'm:m2', id: 'm2', name: 'Marie Gagnon', initials: 'MG', custom: false, trelloId: 'm2' });
      assert.deepEqual(plan.memberIds, ['m2']);
      assert.equal(plan.members, null);
      assert.equal(PB.needsHandover(row('c', [marie]), me, marie), false);
    });

    it('"all" (the card menu) leaves the target alone with the card', () => {
      const bob = { id: 'm5', name: 'Bob', custom: false, trelloId: 'm5' };
      const to = PB.people({ members, catalog, me }).filter((p) => p.id === 'm3')[0];
      const plan = PB.handover(row('c', [marie, bob, nadia], [{ id: 'person-nadia', name: 'Nadia Pelletier' }]), 'all', to);
      assert.deepEqual(plan.memberIds, ['m3']);
      assert.deepEqual(plan.contacts, []);
    });

    it('applyHandover updates what a view shows', () => {
      const r = row('c', [marie]);
      const to = PB.people({ members, catalog, me }).filter((p) => p.custom)[0];
      PB.applyHandover(r, PB.handover(r, marie, to));
      assert.deepEqual(r.assignees.map((a) => a.id), ['person-nadia']);
      assert.deepEqual(r.inputs.customAssignees.map((c) => c.id), ['person-nadia']);
    });
  });

  describe('menu and keys', () => {
    it('menuPeople lists me first, ticks who has the card', () => {
      const list = PB.people({ members, catalog, me });
      const items = PB.menuPeople(row('c', [marie]), list, me);
      assert.equal(items[0].key, 'me');
      assert.equal(items[0].on, false);
      assert.equal(items.filter((i) => i.on).map((i) => i.key)[0], 'm:m2');
      assert.equal(PB.menuPeople(row('free', []), list, me)[0].on, true);
    });

    it('byKey finds me and the others', () => {
      const list = PB.people({ members, catalog, me });
      assert.equal(PB.byKey(list, me, 'me'), me);
      assert.equal(PB.byKey(list, me, 'm:m3').name, 'Étienne Morin');
      assert.equal(PB.byKey(list, me, 'nope'), null);
    });
  });
});
