'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent, clearComponentCache } = require('./helpers/load');

describe('DescMeta', () => {
  let DescMeta;

  before(() => {
    clearComponentCache();
    loadComponent('shared/desc-meta.js');
    DescMeta = global.DescMeta;
    assert.ok(DescMeta);
  });

  it('splitDesc strips HTML comment meta block', () => {
    const full =
      'Hello world\n\n<!--cerveau-meta\noutlook-event-id: abc123\n-->';
    const split = DescMeta.splitDesc(full);
    assert.equal(split.visible, 'Hello world');
    assert.equal(split.meta['outlook-event-id'], 'abc123');
    assert.equal(split.hasMeta, true);
  });

  it('splitDesc strips legacy [outlook-event-id] lines', () => {
    const full = 'Notes\n\n[outlook-event-id]: evt-9\n';
    const split = DescMeta.splitDesc(full);
    assert.equal(split.visible, 'Notes');
    assert.equal(split.meta['outlook-event-id'], 'evt-9');
  });

  it('joinDesc appends comment block at end', () => {
    const joined = DescMeta.joinDesc('Body', {
      'outlook-event-id': 'xyz',
    });
    assert.match(joined, /^Body\n\n<!--cerveau-meta\n/);
    assert.match(joined, /outlook-event-id: xyz/);
    assert.match(joined, /-->$/);
  });

  it('setMeta round-trips without duplicating blocks', () => {
    let desc = 'Task details';
    desc = DescMeta.setMeta(desc, 'outlook-event-id', 'e1');
    desc = DescMeta.setMeta(desc, 'outlook-event-id', 'e2');
    const split = DescMeta.splitDesc(desc);
    assert.equal(split.visible, 'Task details');
    assert.equal(split.meta['outlook-event-id'], 'e2');
    assert.equal((desc.match(/cerveau-meta/g) || []).length, 1);
  });

  it('setMeta can clear a key', () => {
    let desc = DescMeta.setMeta('X', 'outlook-event-id', 'gone');
    desc = DescMeta.setMeta(desc, 'outlook-event-id', '');
    assert.equal(desc, 'X');
    assert.equal(DescMeta.splitDesc(desc).hasMeta, false);
  });

  it('stripVisibleOnly leaves plain text unchanged', () => {
    assert.equal(DescMeta.stripVisibleOnly('just text'), 'just text');
  });
});
