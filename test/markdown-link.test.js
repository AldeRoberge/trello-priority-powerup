'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('PriorityUI pasteable link helpers', () => {
  let ui;

  before(() => {
    loadComponent('priority/priority-ui.js');
    ui = global.PriorityUI;
    assert.equal(typeof ui.normalizePasteableMarkdownUrl, 'function');
    assert.equal(typeof ui.linkMarkdownSelection, 'function');
  });

  it('normalizes pasteable URLs and rejects non-URLs', () => {
    assert.equal(ui.normalizePasteableMarkdownUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(ui.normalizePasteableMarkdownUrl('  <https://example.com>  '), 'https://example.com');
    assert.equal(ui.normalizePasteableMarkdownUrl('mailto:a@b.com'), 'mailto:a@b.com');
    assert.equal(ui.normalizePasteableMarkdownUrl('www.example.com/path'), 'https://www.example.com/path');
    assert.equal(ui.normalizePasteableMarkdownUrl('not a url'), '');
    assert.equal(ui.normalizePasteableMarkdownUrl('https://a.com and more'), '');
    assert.equal(ui.normalizePasteableMarkdownUrl('javascript:alert(1)'), '');
  });

  it('wraps a markdown selection as a link when pasting a URL', () => {
    const next = ui.linkMarkdownSelection(
      { value: 'See docs here please', start: 4, end: 8 },
      'https://example.com/docs'
    );
    assert.deepEqual(next, {
      value: 'See [docs](https://example.com/docs) here please',
      start: 5,
      end: 9,
    });
  });

  it('escapes brackets in the link label', () => {
    const next = ui.linkMarkdownSelection(
      { value: 'a [x] b', start: 2, end: 5 },
      'https://example.com'
    );
    assert.equal(next.value, 'a [\\[x\\]](https://example.com) b');
  });

  it('returns null without a selection or safe URL', () => {
    assert.equal(
      ui.linkMarkdownSelection({ value: 'hello', start: 1, end: 1 }, 'https://example.com'),
      null
    );
    assert.equal(
      ui.linkMarkdownSelection({ value: 'hello', start: 0, end: 5 }, 'not-a-url'),
      null
    );
  });
});
