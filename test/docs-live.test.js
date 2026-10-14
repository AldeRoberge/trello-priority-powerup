'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadComponent } = require('./helpers/load');

describe('DocsLive', () => {
  let DL;
  before(() => {
    loadComponent('docs/docs-live.js');
    DL = global.DocsLive;
  });

  function at(text) {
    return DL.closingMark(text, text.length);
  }

  it('closes bold, strike, highlight, underline and italic', () => {
    assert.deepEqual(at('**gras**'), { start: 0, end: 8, tag: 'strong', text: 'gras' });
    assert.deepEqual(at('voir **gras**'), { start: 5, end: 13, tag: 'strong', text: 'gras' });
    assert.deepEqual(at('~~non~~'), { start: 0, end: 7, tag: 's', text: 'non' });
    assert.deepEqual(at('==mot=='), { start: 0, end: 7, tag: 'mark', text: 'mot' });
    assert.deepEqual(at('++oui++'), { start: 0, end: 7, tag: 'u', text: 'oui' });
    assert.deepEqual(at('*mot*'), { start: 0, end: 5, tag: 'em', text: 'mot' });
    assert.deepEqual(at('un *mot*'), { start: 3, end: 8, tag: 'em', text: 'mot' });
  });

  it('leaves unfinished, spaced, escaped and fenced marks alone', () => {
    assert.equal(at('**gras'), null);
    assert.equal(at('**'), null);
    assert.equal(at('a ** b **'), null);
    assert.equal(at('2 * 3 * 4'), null);
    assert.equal(at('_mot_'), null);
    assert.equal(at('\\*pas\\*'), null);
    assert.equal(at('\\**gras**'), null);
    assert.equal(at('```'), null);
    assert.equal(at('```js'), null);
    assert.equal(at('***gras***'), null);
    assert.deepEqual(at('`code`'), { start: 0, end: 6, tag: 'code', text: 'code' });
  });

  it('reads an open wiki query and a closed title', () => {
    assert.deepEqual(DL.wikiQuery('voir [['), { query: '', length: 2 });
    assert.deepEqual(DL.wikiQuery('voir [[Plan de'), { query: 'Plan de', length: 9 });
    assert.equal(DL.wikiQuery('voir [[Plan]]'), null);
    assert.equal(DL.wikiQuery('un [lien'), null);
    const closed = 'Lire [[Plan de projet]]';
    assert.deepEqual(DL.wikiClose(closed, closed.length), {
      start: 5,
      end: closed.length,
      title: 'Plan de projet',
    });
    assert.equal(DL.wikiClose('[[Plan', 6), null);
  });

  it('detects pasted Markdown and ignores a plain paragraph', () => {
    assert.equal(DL.looksLikeMarkdown('un\ndeux\n\ntrois'), false);
    assert.equal(DL.looksLikeMarkdown('bonjour'), false);
    assert.equal(DL.looksLikeMarkdown('voir **gras** et *reste*'), true);
    assert.equal(DL.looksLikeMarkdown('# Titre\n\ntexte'), true);
    assert.equal(DL.looksLikeMarkdown('- une\n- deux'), true);
    assert.equal(DL.syntaxOf('STRONG'), '**');
    assert.equal(DL.syntaxOf('EM'), '*');
    assert.equal(DL.syntaxOf('CODE'), '`');
    assert.equal(DL.syntaxOf('SPAN'), '');
  });
});
