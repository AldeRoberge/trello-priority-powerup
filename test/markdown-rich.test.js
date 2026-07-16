'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

function text(value) {
  return { nodeType: 3, nodeName: '#text', nodeValue: value, textContent: value };
}

function el(name, attrs, children) {
  attrs = attrs || {};
  children = children || [];
  const node = {
    nodeType: 1,
    nodeName: String(name).toUpperCase(),
    childNodes: children,
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(attrs, key) ? String(attrs[key]) : null;
    },
    classList: {
      contains(className) {
        return String(attrs.class || '').split(/\s+/).includes(className);
      },
    },
  };
  if (attrs.checked != null) node.checked = !!attrs.checked;
  for (const child of children) child.parentNode = node;
  Object.defineProperty(node, 'textContent', {
    get() {
      return children.map((child) => child.textContent || child.nodeValue || '').join('');
    },
  });
  return node;
}

describe('PriorityUI rich description conversion', () => {
  let ui;

  before(() => {
    loadComponent('priority/priority-ui.js');
    ui = global.PriorityUI;
    assert.equal(typeof ui.markdownFromRichRoot, 'function');
  });

  it('serializes supported inline formatting and safe links', () => {
    const root = el('div', {}, [
      el('p', {}, [
        text('Hello '),
        el('strong', {}, [text('bold')]),
        text(' '),
        el('em', {}, [text('italic')]),
        text(' '),
        el('del', {}, [text('gone')]),
        text(' '),
        el('a', { href: 'https://example.com' }, [text('site')]),
        el('br'),
        el('code', {}, [text('value')]),
      ]),
    ]);

    assert.equal(
      ui.markdownFromRichRoot(root),
      'Hello **bold** *italic* ~~gone~~ [site](https://example.com)\n`value`'
    );
  });

  it('serializes blocks, task lists, images, and smart cards', () => {
    const root = el('div', {}, [
      el('h2', {}, [text('Heading')]),
      el('ul', {}, [
        el('li', {}, [text('First')]),
        el('li', {}, [
          el('input', { type: 'checkbox', checked: true }),
          text(' Done'),
        ]),
      ]),
      el('blockquote', {}, [text('Quoted'), el('br'), text('line')]),
      el('pre', {}, [el('code', {}, [text('const x = 1;')])]),
      el('hr'),
      el('p', {}, [
        el('img', { src: 'https://example.com/image.png', alt: 'Example' }),
      ]),
      el(
        'a',
        {
          href: 'https://example.com/doc',
          'data-smart-url': 'https://example.com/doc',
          'data-smart-mode': 'block',
        },
        [text('decorated preview')]
      ),
    ]);

    assert.equal(
      ui.markdownFromRichRoot(root),
      [
        '## Heading',
        '- First\n- [x] Done',
        '> Quoted\n> line',
        '```\nconst x = 1;\n```',
        '---',
        '![Example](https://example.com/image.png)',
        '[https://example.com/doc](https://example.com/doc "smartCard-block")',
      ].join('\n\n')
    );
  });

  it('drops unsafe elements and URL schemes from pasted content', () => {
    const root = el('div', {}, [
      el('script', {}, [text('alert(1)')]),
      el('p', {}, [
        el('a', { href: 'javascript:alert(1)' }, [text('unsafe')]),
        text(' '),
        el('img', { src: 'data:text/html,bad', alt: 'bad' }),
      ]),
    ]);

    assert.equal(ui.markdownFromRichRoot(root), 'unsafe');
  });

  it('round-trips literal Markdown punctuation without formatting it', () => {
    const root = el('div', {}, [
      el('p', {}, [
        text('Use * and [brackets] with `ticks`'),
        el('br'),
        text('# literal heading'),
        el('br'),
        text('1. literal list'),
      ]),
    ]);
    const markdown = ui.markdownFromRichRoot(root);
    assert.equal(
      markdown,
      'Use \\* and \\[brackets\\] with \\`ticks\\`\n\\# literal heading\n1\\. literal list'
    );
    const rendered = ui.renderMarkdownToHtml(markdown);
    assert.match(rendered, /Use \* and \[brackets\] with `ticks`/);
    assert.match(rendered, /# literal heading<br>1\. literal list/);
  });
});
