'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const { parse } = require('./helpers/mini-dom');

describe('table extras in Markdown', () => {
  let DM;
  before(() => {
    loadComponent('docs/docs-model.js');
    DM = global.DocsModel;
  });

  const roundTrip = (md) => DM.domToMd(parse(DM.mdToHtml(md)));
  const META = '<!--tbl:{"w":[30,70],"cf":[{"c":1,"op":"gt","v":"10","bg":"red","fg":"","row":false}],"c":{"0,0":{"bg":"blue"},"2,1":{"fg":"green","fmt":"pct","f":"=B2*2"}}}-->';
  const TABLE = '| a | b |\n| --- | --- |\n| 1 | 5 |\n| 2 | 10 |';

  it('keeps colors, formulas, widths and rules through a round trip', () => {
    const md = TABLE + '\n' + META;
    assert.equal(roundTrip(md), md);
  });

  it('puts them on the cells and the table as attributes', () => {
    const html = DM.mdToHtml(TABLE + '\n' + META);
    assert.match(html, /<table class="dc-table" data-w="30,70" data-cf="/);
    assert.match(html, /<th data-bg="blue">a<\/th>/);
    assert.match(html, /<td data-fg="green" data-fmt="pct" data-f="=B2\*2">10<\/td>/);
  });

  it('writes nothing for a plain table', () => {
    assert.equal(roundTrip(TABLE), TABLE);
  });

  it('ignores a broken or hostile meta line and never lets it end the comment early', () => {
    assert.match(DM.mdToHtml(TABLE + '\n<!--tbl:{nope-->'), /<\/table><p>/);
    const hostile = TABLE + '\n<!--tbl:{"c":{"1,0":{"bg":"javascript:x","f":"=1\\"><img onerror=x>"},"9999999,1":{"bg":"red"}},"w":[1,2]}-->';
    const html = DM.mdToHtml(hostile);
    assert.doesNotMatch(html, /javascript:/);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /data-w/);
    assert.match(html, /data-f="=1&quot;&gt;&lt;img onerror=x&gt;"/);
    const out = roundTrip(hostile);
    assert.ok(!/-->.*-->/s.test(out.replace(/<!--tbl:.*?-->/, '')));
    assert.ok(out.indexOf('<!--tbl:') > 0);
    assert.ok(!/<img/.test(out));
  });

  it('does not eat the paragraph that follows the table', () => {
    const md = TABLE + '\n' + META + '\n\nsuite';
    assert.equal(roundTrip(md), TABLE + '\n' + META + '\n\nsuite');
  });
});
