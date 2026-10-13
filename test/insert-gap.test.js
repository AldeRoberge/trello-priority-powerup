'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('shared/insert-gap.js');

const gapAt = global.InsertGap.gapAt;
const underAt = global.InsertGap.underAt;

const col = [
  { top: 0, bottom: 40, left: 0, right: 200 },
  { top: 48, bottom: 90, left: 0, right: 200 },
  { top: 98, bottom: 140, left: 0, right: 200 },
];

describe('InsertGap.gapAt', function () {
  it('hits the seam under an item', function () {
    var hit = gapAt(col, 40, 44, 14);
    assert.equal(hit.index, 1);
    assert.equal(hit.above, col[0]);
    assert.equal(hit.below, col[1]);
  });

  it('ignores the middle of an item', function () {
    assert.equal(gapAt(col, 40, 20, 14), null);
  });

  it('hits under the last item', function () {
    var hit = gapAt(col, 80, 148, 14);
    assert.equal(hit.index, 3);
    assert.equal(hit.below, null);
  });

  it('ignores a pointer outside the column', function () {
    assert.equal(gapAt(col, 400, 44, 14), null);
  });
});

describe('InsertGap.underAt', function () {
  it('hits just below a free-positioned item', function () {
    var hit = underAt(col, 30, 46, 18);
    assert.equal(hit.above, col[0]);
    assert.equal(hit.below, null);
  });

  it('ignores a pointer on the item or beside it', function () {
    assert.equal(underAt(col, 30, 10, 18), null);
    assert.equal(underAt(col, 400, 46, 18), null);
  });
});
