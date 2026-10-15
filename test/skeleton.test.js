'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function count(html, re) {
  return (html.match(re) || []).length;
}

describe('Skeleton', () => {
  let S;
  let VIEWS;
  before(() => {
    loadComponent('shared/skeleton.js');
    loadComponent('shared/view-tabs.js');
    S = global.Skeleton;
    VIEWS = global.ViewTabs.VIEWS;
    assert.ok(S);
  });

  it('has a full-page skeleton for every tab, in tab order', () => {
    assert.deepEqual(S.VIEWS, VIEWS.map((v) => v.key));
    VIEWS.forEach((v) => {
      const html = S.html(v.key);
      assert.ok(html.length > 500, v.key + ' is empty');
      assert.match(html, /aria-busy="true"/, v.key + ' is not announced as busy');
      assert.match(html, /class="sk /, v.key + ' has no shimmering block');
    });
  });

  it('is the same every time (no randomness, so nothing jumps when the view mounts)', () => {
    S.names().forEach((n) => assert.equal(S.html(n), S.html(n), n));
  });

  it('closes every tag it opens', () => {
    S.names().forEach((n) => {
      const html = S.html(n);
      assert.equal(count(html, /<div[\s>]/g), count(html, /<\/div>/g), n + ' div');
      assert.equal(count(html, /<span[\s>]/g), count(html, /<\/span>/g), n + ' span');
      assert.equal(count(html, /<aside[\s>]/g), count(html, /<\/aside>/g), n + ' aside');
    });
  });

  it('gives the parts a mounted view repaints while it loads', () => {
    ['gantt.body', 'table.grid', 'kanban.cols', 'mindmap.canvas', 'docs.list', 'docs.main', 'entities.list', 'entities.main'].forEach((n) => {
      assert.ok(S.html(n).length > 200, n);
    });
    assert.equal(S.html('nope'), '');
  });

  it('keeps the table properties in columns: every row has the same cells', () => {
    const rows = S.html('table.grid').split('<div class="sk-grid-row').slice(1);
    assert.ok(rows.length > 10);
    const sizes = rows.map((r) => count(r, /class="sk-grid-cell/g));
    assert.equal(new Set(sizes).size, 1);
    assert.equal(sizes[0], 10);
  });

  it('mount() fills an element', () => {
    const el = { innerHTML: '' };
    assert.equal(S.mount(el, 'kanban'), el);
    assert.equal(el.innerHTML, S.html('kanban'));
  });
});
