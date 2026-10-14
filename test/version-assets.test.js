'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { commitToken, versionUrl, rewriteHtml } = require('../scripts/version-assets');

describe('version-assets', () => {
  it('keeps a 10-character commit token', () => {
    assert.equal(commitToken('1234567890abcdef'), '1234567890');
    assert.equal(commitToken(''), '');
  });

  it('versions local assets and leaves remote ones', () => {
    assert.equal(versionUrl('./a.js?v=old&x=1', 'abc'), './a.js?v=abc&x=1');
    assert.equal(versionUrl('https://cdn.example/x.js', 'abc'), 'https://cdn.example/x.js');
    assert.equal(versionUrl('./build-info.json', 'abc'), './build-info.json');
    assert.equal(
      versionUrl('/components/shared/trello-theme.css', 'abc'),
      '/components/shared/trello-theme.css?v=abc'
    );
    assert.equal(versionUrl('./docs.html#part', 'abc'), './docs.html?v=abc#part');
  });

  it('stamps every page with the build and one watcher', () => {
    const html = [
      '<head>',
      '<script src="./a.js?v=old"></script>',
      '<link rel="stylesheet" href="./b.css">',
      '<script src="https://cdn.example/x.js"></script>',
      '<link rel="icon" href="./assets/icon.png">',
      '</head>',
    ].join('\n');
    const out = rewriteHtml(html, 'abc1234567');
    assert.match(out, /src="\.\/a\.js\?v=abc1234567"/);
    assert.match(out, /href="\.\/b\.css\?v=abc1234567"/);
    assert.match(out, /src="https:\/\/cdn\.example\/x\.js"/);
    assert.match(out, /href="\.\/assets\/icon\.png\?v=abc1234567"/);
    assert.match(out, /name="cerveau-build" content="abc1234567"/);
    assert.equal((out.match(/version\.js/g) || []).length, 1);
    const again = rewriteHtml(out, 'abc1234567');
    assert.equal((again.match(/version\.js/g) || []).length, 1);
    assert.equal((again.match(/\?v=abc1234567\?v=/g) || []).length, 0);
  });

  it('does not add a second watcher when the page already loads version.js', () => {
    const html = '<head><script src="./components/shared/version.js?v=old"></script></head>';
    const out = rewriteHtml(html, 'abc1234567');
    assert.equal((out.match(/version\.js/g) || []).length, 1);
    assert.match(out, /version\.js\?v=abc1234567"/);
    assert.match(out, /content="abc1234567"/);
  });
});
