'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('CompletionTree model', () => {
  let CT;
  let Tree;

  before(() => {
    loadComponent('completion/completion-trello.js');
    loadComponent('completion/completion-tree.js');
    CT = global.CompletionTrello;
    Tree = global.CompletionTree;
    assert.ok(CT);
    assert.ok(Tree);
  });

  const sample = () =>
    CT.normalizeCompletionData({
      items: [
        { id: 'a', text: 'Mesurer', progress: 100 },
        {
          id: 'b',
          text: 'Choisir',
          progress: 40,
          items: [
            { id: 'b1', text: 'Charge', progress: 100 },
            { id: 'b2', text: 'Style', progress: 0 },
          ],
        },
        { id: 'c', text: 'Comparer', blocked: true, blockedReasons: ['Budget'] },
        { id: 'd', text: 'Commander' },
      ],
    });

  it('keeps list order as step numbers', () => {
    const model = Tree.buildTreeModel(sample(), { CT });
    assert.deepEqual(
      model.children.map((n) => [n.id, n.order]),
      [['a', 1], ['b', 2], ['c', 3], ['d', 4]]
    );
    assert.deepEqual(model.children[1].children.map((n) => n.order), [1, 2]);
    assert.equal(model.children[1].children[0].parentId, 'b');
    assert.equal(model.children[1].children[0].depth, 2);
  });

  it('derives statuses and counts', () => {
    const model = Tree.buildTreeModel(sample(), { CT });
    assert.deepEqual(
      model.children.map((n) => n.status),
      ['done', 'active', 'blocked', 'todo']
    );
    assert.equal(model.counts.total, 4);
    assert.equal(model.counts.done, 1);
    assert.equal(model.counts.blocked, 1);
    assert.equal(model.blocked, true);
  });

  it('flags the first open, unblocked step as next', () => {
    const model = Tree.buildTreeModel(sample(), { CT });
    assert.deepEqual(
      model.children.map((n) => n.isNext),
      [false, true, false, false]
    );
  });

  it('skips a blocked step when picking next', () => {
    const data = CT.normalizeCompletionData({
      items: [
        { id: 'x', text: 'Bloquée', blocked: true },
        { id: 'y', text: 'Libre' },
      ],
    });
    const model = Tree.buildTreeModel(data, { CT });
    assert.equal(model.children[0].isNext, false);
    assert.equal(model.children[1].isNext, true);
  });

  it('sums remaining minutes only for unfinished steps', () => {
    const data = CT.normalizeCompletionData({
      items: [
        { id: 'a', text: 'Fini', progress: 100, estimatedMinutes: 60 },
        { id: 'b', text: 'Reste', progress: 0, estimatedMinutes: 30 },
        { id: 'c', text: 'Moitié', progress: 50, estimatedMinutes: 60 },
      ],
    });
    const model = Tree.buildTreeModel(data, { CT });
    assert.equal(model.minutesLeft, 60);
  });

  it('handles empty data', () => {
    const model = Tree.buildTreeModel({ items: [] }, { CT });
    assert.equal(model.children.length, 0);
    assert.equal(Tree.renderSummaryTree(model, { CT }), null);
  });
});
