'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('docs/docs-pins.js');
const P = global.DocsPins;

const chip = { left: 10, top: 30, width: 100, height: 20 };

describe('DocsPins anchors', () => {
  it('puts parent on the top edge, sibling on the right, person on the left', () => {
    assert.deepEqual(P.anchor(chip, 'parent'), { x: 60, y: 30, role: 'parent' });
    assert.deepEqual(P.anchor(chip, 'sibling'), { x: 110, y: 40, role: 'sibling' });
    assert.deepEqual(P.anchor(chip, 'person'), { x: 10, y: 40, role: 'person' });
  });

  it('shows a pin only when the pointer is close to that edge', () => {
    const top = P.visible(chip, 60, 26, 30, 14);
    assert.deepEqual(top.map((p) => p.role), ['parent']);
    assert.equal(top[0].hot, true);
    assert.equal(P.visible(chip, 200, 200, 30, 14).length, 0);
    assert.equal(P.nearest(chip, 112, 40, 30, 14).role, 'sibling');
    assert.equal(P.nearest(chip, 8, 40, 30, 14).role, 'person');
  });
});

describe('DocsPins links', () => {
  it('stores a parent on the other card and a sibling on this card', () => {
    assert.deepEqual(P.taskWrite('parent', 'child', 'dad'), { cardId: 'dad', addId: 'child', depType: 'parts' });
    assert.deepEqual(P.taskWrite('sibling', 'a', 'b'), { cardId: 'a', addId: 'b', depType: 'after' });
    assert.equal(P.taskWrite('parent', 'a', 'a'), null);
    assert.equal(P.taskWrite('person', 'a', 'b'), null);
  });

  it('appends a dependency once and keeps an existing type', () => {
    const first = P.appendDep(['x'], { x: 'needs' }, 'dad', 'parts', 'child');
    assert.equal(first.changed, true);
    assert.deepEqual(first.dependsOn, ['x', 'dad']);
    assert.equal(first.depTypes.dad, 'parts');
    assert.equal(first.depTypes.x, 'needs');
    const again = P.appendDep(first.dependsOn, first.depTypes, 'dad', 'parts', 'child');
    assert.equal(again.changed, false);
    assert.equal(P.appendDep([], {}, 'child', 'parts', 'child'), null);
  });

  it('appends a member once', () => {
    const added = P.appendMember(['m1'], 'm2');
    assert.equal(added.changed, true);
    assert.deepEqual(added.ids, ['m1', 'm2']);
    assert.equal(P.appendMember(added.ids, 'm2').changed, false);
    assert.equal(P.appendMember([], ''), null);
  });
});
