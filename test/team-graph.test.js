'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('team graph', () => {
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

  it('normalizes links: drops self/duplicate pairs, defaults kind, trims label', () => {
    const links = PriorityUI.normalizeTeamLinks([
      { from: 'a', to: 'b', kind: 'asks', label: '  montage  ' },
      { from: 'b', to: 'a', kind: 'flow' },
      { from: 'a', to: 'a', kind: 'asks' },
      { from: 'a', to: 'c', kind: 'nonsense' },
      { from: '', to: 'c' },
      null,
    ]);
    assert.equal(links.length, 2);
    assert.deepEqual(links[0], { from: 'a', to: 'b', kind: 'asks', label: 'montage' });
    assert.deepEqual(links[1], { from: 'a', to: 'c', kind: 'flow' });
  });

  it('filters links to known people', () => {
    const links = PriorityUI.normalizeTeamLinks(
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'gone' }],
      ['a', 'b']
    );
    assert.equal(links.length, 1);
  });

  it('turns a hand-off dragged the other way into a back-and-forth', () => {
    let links = PriorityUI.connectTeamPeople([], 'me', 'cass', 'flow');
    assert.equal(links[0].kind, 'flow');
    links = PriorityUI.connectTeamPeople(links, 'cass', 'me', 'flow');
    assert.equal(links.length, 1);
    assert.equal(links[0].kind, 'both');
  });

  it('keeps the label when the relation is redrawn', () => {
    let links = PriorityUI.upsertTeamLink([], { from: 'a', to: 'b', kind: 'flow', label: 'x' });
    links = PriorityUI.connectTeamPeople(links, 'a', 'b', 'asks');
    assert.equal(links[0].kind, 'asks');
    assert.equal(links[0].label, 'x');
  });

  it('removes a link or every link of a person', () => {
    const base = [
      { from: 'a', to: 'b', kind: 'asks' },
      { from: 'b', to: 'c', kind: 'flow' },
    ];
    assert.equal(PriorityUI.removeTeamLink(base, 'b', 'a').length, 1);
    assert.equal(PriorityUI.removePersonFromTeamLinks(base, 'b').length, 0);
  });

  it('puts requesters above the people they ask', () => {
    const { nodes } = PriorityUI.layoutTeamGraph(
      ['me', 'boss', 'ceo'],
      [
        { from: 'boss', to: 'me', kind: 'asks' },
        { from: 'ceo', to: 'boss', kind: 'asks' },
      ]
    );
    assert.equal(nodes.ceo.row, 0);
    assert.equal(nodes.boss.row, 1);
    assert.equal(nodes.me.row, 2);
    assert.ok(nodes.ceo.y < nodes.boss.y && nodes.boss.y < nodes.me.y);
  });

  it('lays hand-offs out left to right on one row', () => {
    const { nodes } = PriorityUI.layoutTeamGraph(
      ['edit', 'shoot', 'mix'],
      [
        { from: 'shoot', to: 'edit', kind: 'flow' },
        { from: 'edit', to: 'mix', kind: 'flow' },
      ]
    );
    assert.equal(nodes.shoot.row, nodes.edit.row);
    assert.ok(nodes.shoot.x < nodes.edit.x && nodes.edit.x < nodes.mix.x);
  });

  it('keeps peers of a requested person on the same row', () => {
    const { nodes } = PriorityUI.layoutTeamGraph(
      ['boss', 'me', 'cass'],
      [
        { from: 'boss', to: 'me', kind: 'asks' },
        { from: 'me', to: 'cass', kind: 'both' },
      ]
    );
    assert.equal(nodes.me.row, 1);
    assert.equal(nodes.cass.row, 1);
    assert.equal(nodes.boss.row, 0);
  });

  it('survives request cycles', () => {
    const { nodes } = PriorityUI.layoutTeamGraph(
      ['a', 'b'],
      [
        { from: 'a', to: 'b', kind: 'asks' },
        { from: 'b', to: 'a', kind: 'asks' },
      ]
    );
    assert.ok(nodes.a && nodes.b);
  });

  it('routes wires vertically between rows, horizontally within a row, arcing over gaps', () => {
    const box = (row, col) => ({ x: col * 200, y: row * 100, w: 150, h: 60, row, col });
    const vertical = PriorityUI.routeTeamLink(box(0, 0), box(1, 0));
    assert.equal(vertical.x1, vertical.x2);
    assert.ok(vertical.y2 > vertical.y1);
    const side = PriorityUI.routeTeamLink(box(0, 0), box(0, 1));
    assert.equal(side.y1, side.y2);
    assert.ok(side.x2 > side.x1);
    const far = PriorityUI.routeTeamLink(box(0, 0), box(0, 3));
    assert.equal(far.arc, true);
    assert.ok(far.my < 0);
  });

  it('keeps teamLinks through card state normalization', () => {
    const state = PriorityTrello.normalizeInputs
      ? PriorityTrello.normalizeInputs({
          teamLinks: [{ from: 'a', to: 'b', kind: 'both', label: 'montage' }],
        })
      : null;
    if (!state) return;
    assert.equal(state.teamLinks.length, 1);
    assert.equal(state.teamLinks[0].kind, 'both');
  });
});
