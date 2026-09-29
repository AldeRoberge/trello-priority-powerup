'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function node(tag) {
  return {
    tag, children: [], className: '', _text: '',
    appendChild(c) { this.children.push(c); return c; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; }
  };
}
function render(text) {
  const win = {};
  const document = {
    createElement: node,
    createTextNode: (t) => ({ tag: '#text', text: t })
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'markdown-dom.js'), 'utf8'),
    { window: win, document }
  );
  const root = node('root');
  win.MarkdownDom.append(root, text);
  return root;
}
const tags = (n) => n.children.map((c) => c.tag);

test('MarkdownDom renders headings, lists, quotes and links', () => {
  const r = render('# Notes\n## Today\n- a\n- **b**\n\n> q\n1. x\n2. y [l](https://e.com)');
  assert.deepStrictEqual(tags(r), ['div', 'div', 'ul', 'blockquote', 'ol']);
  assert.strictEqual(r.children[2].children.length, 2);
  assert.strictEqual(r.children[2].children[1].children[0].tag, 'strong');
});

test('MarkdownDom leaves plain text alone and rejects non-http links', () => {
  assert.deepStrictEqual(tags(render('just text, 3 * 4')), ['#text']);
  const r = render('[x](javascript:alert(1))');
  assert.ok(!JSON.stringify(r).includes('"a"'));
});
