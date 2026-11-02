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

  describe('setMeta leaves the user\'s text alone', () => {
    const KEEP = 'Line with a hard break  \nnext line\n\n\n\nafter three blank lines\r\nCRLF line\t\n  indented';

    it('keeps trailing spaces, blank lines and CRLF byte for byte', () => {
      const out = DescMeta.setMeta(KEEP, 'waiting', 'Kate');
      assert.ok(out.startsWith(KEEP), 'the text is untouched, the block comes after it');
      assert.equal(DescMeta.splitDesc(out).meta.waiting, 'Kate');
      assert.equal(out.slice(KEEP.length), '\n\n<!--cerveau-meta\nwaiting: Kate\n-->');
    });

    it('a second write replaces the block and still leaves the text alone', () => {
      let out = DescMeta.setMeta(KEEP, 'waiting', 'Kate');
      out = DescMeta.setMeta(out, 'waiting-since', '2026-11-02');
      out = DescMeta.setMeta(out, 'waiting', 'Marc');
      assert.ok(out.startsWith(KEEP));
      assert.equal((out.match(/cerveau-meta/g) || []).length, 1);
      const meta = DescMeta.splitDesc(out).meta;
      assert.deepEqual({ waiting: meta.waiting, since: meta['waiting-since'] }, { waiting: 'Marc', since: '2026-11-02' });
    });

    it('clearing the last key removes the block and its separator, and nothing else', () => {
      const withMeta = DescMeta.setMeta(KEEP, 'waiting', 'Kate');
      assert.equal(DescMeta.setMeta(withMeta, 'waiting', ''), KEEP);
    });

    it('a write that changes nothing returns the very same string', () => {
      assert.equal(DescMeta.setMeta(KEEP, 'waiting', ''), KEEP, 'clearing a key that is not there');
      const withMeta = DescMeta.setMeta(KEEP, 'waiting', 'Kate');
      assert.equal(DescMeta.setMeta(withMeta, 'waiting', 'Kate'), withMeta, 'same value again');
      assert.equal(DescMeta.setMeta(KEEP, '', 'x'), KEEP, 'no key');
      assert.equal(DescMeta.setMeta(null, 'waiting', ''), '');
    });

    it('a legacy [outlook-event-id] line still moves into the block, and the rest of the text is kept', () => {
      const legacy = 'Meeting notes  \nsecond line\n\n[outlook-event-id]: evt-1';
      const out = DescMeta.setMeta(legacy, 'waiting', 'Kate');
      assert.ok(out.startsWith('Meeting notes  \nsecond line'), 'the hard break in the middle is kept');
      assert.equal(out.indexOf('[outlook-event-id]'), -1);
      const meta = DescMeta.splitDesc(out).meta;
      assert.deepEqual({ ev: meta['outlook-event-id'], w: meta.waiting }, { ev: 'evt-1', w: 'Kate' });
    });

    it('a description that is only metadata, and an empty one, still work', () => {
      assert.equal(DescMeta.setMeta('', 'waiting', 'Kate'), '<!--cerveau-meta\nwaiting: Kate\n-->');
      assert.equal(DescMeta.setMeta(DescMeta.setMeta('', 'waiting', 'Kate'), 'waiting', ''), '');
    });
  });

  it('stripVisibleOnly leaves plain text unchanged', () => {
    assert.equal(DescMeta.stripVisibleOnly('just text'), 'just text');
  });
});
