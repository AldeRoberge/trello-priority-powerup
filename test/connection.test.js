'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('Connection', () => {
  let C;
  before(() => {
    const mem = new Map();
    global.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    loadComponent('shared/connection.js');
    C = global.Connection;
  });
  beforeEach(() => {
    global.navigator.onLine = true;
  });

  it('tells a failed request from an answer', () => {
    assert.equal(C.isNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(C.isNetworkError({ reason: 'network' }), true);
    assert.equal(C.isNetworkError({ reason: 'http-404' }), false);
    assert.equal(C.isNetworkError({ reason: 'conflict' }), false);
    assert.equal(C.isNetworkError(null), false);
  });

  it('counts any failure as network failure while the browser is offline', () => {
    global.navigator.onLine = false;
    assert.equal(C.offline(), true);
    assert.equal(C.isNetworkError(new Error('x')), true);
  });

  it('keeps and clears a draft', () => {
    assert.equal(C.readDraft('doc.1'), null);
    assert.equal(C.writeDraft('doc.1', { body: 'a', rev: 3 }), true);
    const d = C.readDraft('doc.1');
    assert.equal(d.body, 'a');
    assert.equal(d.rev, 3);
    C.clearDraft('doc.1');
    assert.equal(C.readDraft('doc.1'), null);
  });
});
