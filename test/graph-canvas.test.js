'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('GraphCanvas helpers', () => {
  let GC;
  before(() => {
    loadComponent('shared/graph-canvas.js');
    GC = global.GraphCanvas;
    assert.ok(GC);
  });

  it('snaps to the grid', () => {
    assert.equal(GC.snap(25, 18), 18);
    assert.equal(GC.snap(28, 18), 36);
  });

  it('anchors sit on the border midpoint with the outward normal', () => {
    const n = { x: 100, y: 50, w: 200, h: 60 };
    assert.deepEqual(pick(GC.anchor(n, 'right')), { x: 300, y: 80, nx: 1, ny: 0 });
    assert.deepEqual(pick(GC.anchor(n, 'top')), { x: 200, y: 50, nx: 0, ny: -1 });
  });

  it('faces the sides that look at each other', () => {
    const a = { x: 0, y: 0, w: 100, h: 50 };
    assert.deepEqual(GC.facing(a, { x: 300, y: 0, w: 100, h: 50 }), ['right', 'left']);
    assert.deepEqual(GC.facing(a, { x: 0, y: 300, w: 100, h: 50 }), ['bottom', 'top']);
    assert.deepEqual(GC.facing({ x: 300, y: 0, w: 100, h: 50 }, a), ['left', 'right']);
  });

  it('wireBetween stops outside both borders', () => {
    const w = GC.wireBetween({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 0, w: 100, h: 50 }, 6);
    assert.equal(w.p1.x, 106);
    assert.equal(w.p2.x, 294);
    assert.match(w.d, /^M106\.0,25\.0 C/);
  });

  it('zooms around the pointer without moving the point under it', () => {
    const v = { x: 40, y: 30, k: 1 };
    const next = GC.zoomAt(v, 200, 100, 2);
    assert.equal(next.k, 2);
    const before = (200 - v.x) / v.k;
    const after = (200 - next.x) / next.k;
    assert.equal(before, after);
  });

  it('clamps the zoom', () => {
    assert.equal(GC.zoomAt({ x: 0, y: 0, k: 2.9 }, 0, 0, 10).k, GC.MAX_K);
    assert.equal(GC.zoomAt({ x: 0, y: 0, k: 0.2 }, 0, 0, 0.01).k, GC.MIN_K);
  });

  it('fits a box in the middle and never above maxFit', () => {
    const v = GC.fitView({ x0: 0, y0: 0, x1: 100, y1: 100 }, 800, 600, 40, 1);
    assert.equal(v.k, 1);
    assert.equal(v.x, 350);
    assert.equal(v.y, 250);
    const big = GC.fitView({ x0: 0, y0: 0, x1: 2000, y1: 100 }, 800, 600, 40, 1);
    assert.ok(big.k < 0.4);
  });

  it('centers a world point', () => {
    assert.deepEqual(GC.centerOn(100, 50, 800, 600, 2), { k: 2, x: 200, y: 200 });
  });

  function pick(a) { return { x: a.x, y: a.y, nx: a.nx, ny: a.ny }; }
});
