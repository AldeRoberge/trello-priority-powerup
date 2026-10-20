'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

const g = loadComponent('shared/task-focus.js');
const TF = g.TaskFocus;

test('a click opens the task; the same click again closes it', () => {
  assert.deepEqual(TF.next('', 'abc'), { action: 'open', id: 'abc' });
  assert.deepEqual(TF.next('abc', 'abc'), { action: 'close', id: 'abc' });
  assert.deepEqual(TF.next('abc', 'other'), { action: 'open', id: 'other' });
  assert.deepEqual(TF.next('abc', ''), { action: 'noop', id: '' });
});

test('opening a task isolates it and stays on this page', () => {
  const made = [];
  function el() {
    return {
      style: {},
      children: [],
      setAttribute: function () {},
      appendChild: function (c) { this.children.push(c); },
      addEventListener: function () {},
    };
  }
  g.document.createElement = function () {
    const node = el();
    made.push(node);
    return node;
  };
  g.document.body = {
    appendChild: function (c) { c.parentNode = this; this.kid = c; },
    removeChild: function () { this.kid = null; },
  };
  g.document.addEventListener = function () {};
  let scope = null;
  let navigated = false;
  g.Isolation = {
    set: function (s) { scope = s; },
    read: function () { return scope; },
    clear: function () { scope = null; },
  };
  g.location = { assign: function () { navigated = true; } };
  g.CardQuick = { mount: function () { return { destroy: function () {} }; } };

  TF.open({ t: {}, cardId: 'c1', name: 'Capsule' });
  assert.equal(navigated, false);
  assert.deepEqual(scope, { kind: 'task', id: 'c1', label: 'Capsule' });
  assert.equal(TF.currentId(), 'c1');
  assert.ok(g.document.body.kid);

  TF.open({ t: {}, cardId: 'c1', name: 'Capsule' });
  assert.equal(scope, null);
  assert.equal(TF.currentId(), '');
  assert.equal(navigated, false);
});
