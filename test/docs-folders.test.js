'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DocsModel folders and nested documents', () => {
  let DM;
  before(() => {
    loadComponent('docs/docs-model.js');
    DM = global.DocsModel;
  });

  const docs = [
    { id: 'a', title: 'A', updatedAt: '3', size: 5 },
    { id: 'b', title: 'B', updatedAt: '2', size: 50 },
    { id: 'c', title: 'C', updatedAt: '1', size: 1 },
  ];

  function labels(rows) {
    return rows.map((r) => r.type + r.depth + (r.folder ? r.folder.name : r.doc.title)).join(',');
  }

  it('heals cycles, dangling parents and unknown folders when parsing', () => {
    const idx = DM.parseFolderIndex(
      JSON.stringify({
        folders: [
          { id: 'x', name: 'X', parent: 'y' },
          { id: 'y', name: 'Y', parent: 'x' },
        ],
        docs: { a: 'x', b: 'nope' },
        parents: { a: 'a', b: 'c' },
      })
    );
    assert.equal(idx.folders.filter((f) => f.parent).length, 1);
    assert.deepEqual(idx.docs, { a: 'x' });
    assert.deepEqual(idx.parents, { b: 'c' });
  });

  it('survives garbage input', () => {
    assert.deepEqual(DM.parseFolderIndex('not json'), DM.emptyIndex());
  });

  it('nests documents under their parent, only when the parent row is open', () => {
    const idx = DM.emptyIndex();
    idx.parents = { b: 'a' };
    assert.equal(labels(DM.folderRows(docs, idx, {}, '', 'name')), 'doc0A,doc0C');
    const open = DM.folderRows(docs, idx, { 'doc:a': 1 }, '', 'name');
    assert.equal(labels(open), 'doc0A,doc1B,doc0C');
    assert.equal(open[0].childCount, 1);
  });

  it('ignores a parent loop instead of hiding the documents', () => {
    const idx = DM.emptyIndex();
    idx.parents = { a: 'b', b: 'a' };
    assert.equal(DM.folderRows(docs, idx, {}, '', 'name').length, 3);
  });

  it('refuses to nest a document inside itself or its own descendant', () => {
    const idx = DM.emptyIndex();
    idx.parents = { b: 'a', c: 'b' };
    assert.ok(DM.isDocInside(idx, 'a', 'c'));
    assert.ok(DM.isDocInside(idx, 'a', 'a'));
    assert.ok(!DM.isDocInside(idx, 'c', 'a'));
  });

  it('counts nested documents in their folder and keeps matches visible while searching', () => {
    const idx = DM.emptyIndex();
    idx.folders = [{ id: 'f', name: 'F', parent: null }];
    idx.docs = { a: 'f' };
    idx.parents = { b: 'a' };
    const rows = DM.folderRows(docs, idx, { f: 1 }, '', 'name');
    assert.equal(rows[0].count, 2);
    assert.equal(labels(DM.folderRows(docs, idx, {}, 'B', 'name')), 'folder0F,doc1A,doc2B');
  });

  it('sorts by size and name', () => {
    const idx = DM.emptyIndex();
    const order = (s) => DM.folderRows(docs, idx, {}, '', s).map((r) => r.doc.id).join('');
    assert.equal(order('size'), 'bac');
    assert.equal(order('size-asc'), 'cab');
    assert.equal(order('name-desc'), 'cba');
    assert.equal(order('date'), 'abc');
  });

  it('removing a folder moves its content up', () => {
    const idx = DM.emptyIndex();
    idx.folders = [
      { id: 'p', name: 'P', parent: null },
      { id: 'q', name: 'Q', parent: 'p' },
    ];
    idx.docs = { a: 'q' };
    DM.removeFolderFrom(idx, 'q');
    assert.deepEqual(idx.docs, { a: 'p' });
    DM.removeFolderFrom(idx, 'p');
    assert.deepEqual(idx.docs, {});
  });

  it('archives and restores documents and folders without deleting anything', () => {
    const idx = DM.emptyIndex();
    idx.folders.push({ id: 'p', name: 'P', parent: null }, { id: 'q', name: 'Q', parent: 'p' });
    idx.docs = { a: 'p', b: 'q' };
    idx.parents = { c: 'a' };
    const all = [...docs, { id: 'c', title: 'C2', updatedAt: '0', size: 1 }];
    DM.archiveDocIn(idx, 'a');
    assert.deepEqual(Object.keys(idx.archived).sort(), ['a', 'c']);
    assert.ok(!DM.folderRows(all, idx, { p: 1, q: 1 }, '', 'name').some((r) => r.doc && r.doc.id === 'a'));
    assert.ok(DM.folderRows(all, idx, { p: 1, q: 1 }, '', 'name', true).some((r) => r.doc && r.doc.id === 'a' && r.archived));
    DM.restoreDocIn(idx, 'a');
    assert.deepEqual(idx.archived, {});
    DM.archiveFolderIn(idx, 'p', true);
    assert.ok(idx.folders.every((f) => f.archived));
    assert.deepEqual(Object.keys(idx.archived).sort(), ['a', 'b', 'c']);
    const round = DM.parseFolderIndex(DM.packFolderIndex(idx));
    assert.ok(round.folders[0].archived && round.archived.b);
    DM.restoreFolderIn(idx, 'p');
    assert.deepEqual(idx.archived, {});
    DM.archiveFolderIn(idx, 'q', false);
    assert.equal(idx.docs.b, 'p');
    assert.ok(idx.folders.find((f) => f.id === 'q').archived);
  });
});
