'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

loadComponent('shared/insert-gap.js');

const gapAt = global.InsertGap.gapAt;
const underAt = global.InsertGap.underAt;
const splitAt = global.InsertGap.splitAt;

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

describe('InsertGap.splitAt', function () {
  it('inserts before a row from its top half and the space above it', function () {
    var hit = splitAt(col, 40, 10);
    assert.equal(hit.index, 0);
    assert.equal(hit.below, col[0]);
    assert.equal(hit.above, null);
    assert.equal(hit.anchor, 'below');
    var over = splitAt(col, 40, -10);
    assert.equal(over.index, 0);
    assert.equal(over.anchor, 'below');
  });

  it('inserts after a row from its middle, its bottom half, and the gap under it', function () {
    var mid = splitAt(col, 40, 20);
    assert.equal(mid.index, 1);
    assert.equal(mid.above, col[0]);
    assert.equal(mid.anchor, 'above');
    var gap = splitAt(col, 40, 42);
    assert.equal(gap.index, 1);
    assert.equal(gap.above, col[0]);
    assert.equal(gap.below, col[1]);
    assert.equal(gap.anchor, 'above');
  });

  it('inserts before the next row once the pointer is closer to it', function () {
    var hit = splitAt(col, 40, 46);
    assert.equal(hit.index, 1);
    assert.equal(hit.below, col[1]);
    assert.equal(hit.anchor, 'below');
  });

  it('ignores a pointer outside the column', function () {
    assert.equal(splitAt(col, 400, 20), null);
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

describe('InsertGap.watch', function () {
  it('keeps the plus hidden, and drops it when its column is gone', async function () {
    var savedDoc = global.document;
    var savedAdd = global.addEventListener;
    var ids = {};
    function node(tag) {
      return {
        tagName: tag,
        id: '',
        hidden: false,
        style: {},
        className: '',
        title: '',
        type: '',
        innerHTML: '',
        isConnected: true,
        parentNode: null,
        children: [],
        attrs: {},
        listeners: {},
        setAttribute: function (k, v) { this.attrs[k] = v; },
        getAttribute: function (k) { return this.attrs[k] || null; },
        addEventListener: function (type, fn) { this.listeners[type] = fn; },
        appendChild: function (child) {
          child.parentNode = this;
          this.children.push(child);
          if (child.id) ids[child.id] = child;
        },
        removeChild: function (child) {
          this.children = this.children.filter(function (c) { return c !== child; });
          if (child.parentNode === this) child.parentNode = null;
        },
        contains: function () { return false; },
      };
    }
    var body = node('body');
    global.document = {
      head: node('head'),
      body: body,
      getElementById: function (id) { return ids[id] || null; },
      getElementsByTagName: function () { return []; },
      createElement: function (tag) { return node(tag); },
    };
    global.addEventListener = function () {};
    try {
      var col = node('div');
      global.InsertGap.watch(col, { item: '.db-task', onCreate: function () {} });
      assert.equal(body.children.length, 1);
      var btn = body.children[0];
      assert.equal(btn.hidden, true);
      assert.equal(btn.style.display, 'none');
      btn.hidden = false;
      btn.style.display = '';
      col.listeners.pointerleave({ relatedTarget: null });
      assert.equal(btn.hidden, true);
      assert.equal(btn.style.display, 'none');

      var built = [node('div'), node('div')];
      built[0].isConnected = false;
      built[1].isConnected = false;
      global.InsertGap.watch(built[0], { item: '.db-task', onCreate: function () {} });
      global.InsertGap.watch(built[1], { item: '.db-task', onCreate: function () {} });
      assert.equal(body.children.length, 3);
      built[0].isConnected = true;
      built[1].isConnected = true;
      await new Promise(function (resolve) { setTimeout(resolve, 30); });
      assert.equal(body.children.length, 3);

      col.isConnected = false;
      var col2 = node('div');
      global.InsertGap.watch(col2, { item: '.db-task', onCreate: function () {} });
      assert.equal(btn.parentNode, null);
      assert.equal(body.children.length, 3);
    } finally {
      global.document = savedDoc;
      if (savedAdd) global.addEventListener = savedAdd;
      else delete global.addEventListener;
    }
  });
});
