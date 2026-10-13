'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');
const { parse } = require('./helpers/mini-dom');

describe('DocsModel rich text', () => {
  let DM;
  before(() => {
    loadComponent('docs/docs-model.js');
    DM = global.DocsModel;
  });

  const toMd = (html) => DM.domToMd(parse(html));
  const roundTrip = (md) => toMd(DM.mdToHtml(md));

  it('renders and round-trips highlight, text color and colored highlight', () => {
    assert.equal(DM.inlineToHtml('==mot=='), '<mark>mot</mark>');
    assert.equal(DM.inlineToHtml('a == b'), 'a == b');
    assert.equal(DM.inlineToHtml('{c:red}rouge{/c}'), '<span class="dc-ink" data-c="red">rouge</span>');
    assert.equal(DM.inlineToHtml('{h:green}vert{/h}'), '<mark data-c="green">vert</mark>');
    assert.equal(DM.inlineToHtml('{c:nope}x{/c}'), '{c:nope}x{/c}');
    assert.equal(DM.inlineToHtml('==**gras**=='), '<mark><strong>gras</strong></mark>');
    assert.equal(roundTrip('voir ==ceci== et {c:blue}cela{/c}'), 'voir ==ceci== et {c:blue}cela{/c}');
    assert.equal(roundTrip('{h:yellow}jaune{/h}'), '==jaune==');
    assert.equal(roundTrip('{h:pink}rose{/h}'), '{h:pink}rose{/h}');
    assert.equal(toMd('<p>a == b</p>'), 'a \\=\\= b');
    assert.equal(DM.inlineToHtml('a \\=\\= b'), 'a == b');
  });

  it('reads color and highlight from pasted styles', () => {
    assert.equal(toMd('<p><span style="color:#c9372c">rouge</span></p>'), '{c:red}rouge{/c}');
    assert.equal(toMd('<p><span style="background-color:#fff3bf">jaune</span></p>'), '==jaune==');
    assert.equal(toMd('<p><span style="background-color:#d3f9d8">vert</span></p>'), '{h:green}vert{/h}');
    assert.equal(toMd('<p><span style="color:#000000">texte</span></p>'), 'texte');
    assert.equal(toMd('<p><mark>jaune</mark></p>'), '==jaune==');
    assert.equal(toMd('<p><font color="blue">lien</font></p>'), '{c:blue}lien{/c}');
  });

  it('round-trips callouts and leaves ordinary quotes alone', () => {
    assert.equal(
      DM.mdToHtml('> [!note]\n> Bonjour'),
      '<blockquote class="dc-callout" data-callout="note"><p>Bonjour</p></blockquote>'
    );
    assert.equal(roundTrip('> [!tip]\n> Un conseil'), '> [!tip]\n> Un conseil');
    assert.equal(roundTrip('> [!warning]\n> Attention'), '> [!warning]\n> Attention');
    assert.equal(DM.mdToHtml('> cité\n> encore'), '<blockquote><p>cité<br>encore</p></blockquote>');
    assert.equal(DM.mdToHtml('> [!script]\n> x'), '<blockquote><p>[!script]<br>x</p></blockquote>');
  });

  it('round-trips tables, column alignment and escaped pipes', () => {
    const md = '| **A** | B |\n| --- | ---: |\n| 1 | a \\| b |';
    assert.equal(
      DM.mdToHtml(md),
      '<table class="dc-table"><thead><tr><th><strong>A</strong></th><th data-align="right">B</th></tr></thead>' +
        '<tbody><tr><td>1</td><td data-align="right">a | b</td></tr></tbody></table>'
    );
    assert.equal(roundTrip(md), md);
    assert.equal(
      roundTrip('| seul |\n| --- |\n| ligne |'),
      '| seul |\n| --- |\n| ligne |'
    );
  });

  it('round-trips centered and right-aligned blocks', () => {
    assert.equal(DM.mdToHtml('Bonjour\n<!--align:center-->'), '<p data-align="center">Bonjour</p>');
    assert.equal(roundTrip('Bonjour\n<!--align:center-->'), 'Bonjour\n<!--align:center-->');
    assert.equal(DM.mdToHtml('# Titre\n<!--align:right-->'), '<h1 data-align="right">Titre</h1>');
    assert.equal(roundTrip('# Titre\n<!--align:right-->'), '# Titre\n<!--align:right-->');
    assert.match(DM.mdToHtml('<!--align:center-->'), /&lt;!--align:center--&gt;/);
  });
});
