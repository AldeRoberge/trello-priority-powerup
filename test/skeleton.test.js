'use strict';

const { describe, it, before, after } = require('node:test');
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

  describe('remembered sizes', () => {
    let saved;
    before(() => {
      saved = global.localStorage;
      const data = {};
      global.localStorage = {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
      };
    });
    after(() => { global.localStorage = saved; });

    it('draws as many rows, cards and groups as the view showed last time', () => {
      const rows = (html) => count(html, /<div class="sk-grid-row/g);
      assert.equal(rows(S.html('table.grid')), 28);
      S.remember('table', { rows: 5 });
      assert.equal(rows(S.html('table.grid')), 6);

      S.remember('kanban', { cols: [1, 0] });
      const cols = S.html('kanban.cols');
      assert.equal(count(cols, /<div class="kb-col"/g), 2);
      assert.equal(count(cols, /<div class="sk-card"/g), 1);

      S.remember('gantt', { groups: [2, 1] });
      const body = S.html('gantt.body');
      assert.equal(count(body, /sk-glabels-row--sec/g), 2);
      assert.equal(count(body, /class="sk-trow"/g), 3);

      S.remember('docs', { items: 3 });
      assert.equal(count(S.html('docs.list'), /class="sk-drow/g), 3);

      S.remember('entities', { groups: [2, 2, 1] });
      assert.equal(count(S.html('entities.list'), /class="sk-erow"/g), 5);

      S.remember('mindmap', { nodes: 2 });
      assert.equal(count(S.html('mindmap.canvas'), /class="sk-node /g), 2);

      S.remember('journey', { nodes: 3, now: 2, blocked: 0 });
      const jy = S.html('journey');
      assert.equal(count(jy, /class="sk-node /g), 3);
      assert.equal(count(jy, /class="sk-jrow"/g), 2);

      S.remember('dashboard', { rows: 2 });
      assert.equal(count(S.html('dashboard'), /class="sk-list-row"/g), 2);
    });

    it('keeps the default size for bad or huge values and never throws', () => {
      S.remember('table', { rows: 100000 });
      assert.equal(count(S.html('table.grid'), /<div class="sk-grid-row/g), 61);
      S.remember('table', { rows: 'x' });
      assert.equal(count(S.html('table.grid'), /<div class="sk-grid-row/g), 28);
      global.localStorage.setItem('tp-skeleton-counts', '{oops');
      assert.equal(count(S.html('table.grid'), /<div class="sk-grid-row/g), 28);
      global.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
      S.remember('table', { rows: 3 });
      assert.equal(count(S.html('table.grid'), /<div class="sk-grid-row/g), 28);
    });
  });

  it('mount() fills an element', () => {
    const el = { innerHTML: '' };
    assert.equal(S.mount(el, 'kanban'), el);
    assert.equal(el.innerHTML, S.html('kanban'));
  });
});
