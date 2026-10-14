/*
 * Live Preview for the document editor (Obsidian-style), pure helpers.
 * Typing a closing pair renders the mark; DocsUI shows the signs again only
 * while the caret is inside that word. [[ opens the document list.
 * Underscore italics are intentionally absent (too many false hits in French).
 * No nesting, no *** , no heading links.
 */
(function (global) {
  'use strict';

  var SYNTAX = {
    STRONG: '**', B: '**',
    EM: '*', I: '*',
    S: '~~', STRIKE: '~~', DEL: '~~',
    U: '++',
    MARK: '==',
    CODE: '`',
  };

  function syntaxOf(tag) {
    return SYNTAX[String(tag || '').toUpperCase()] || '';
  }

  function escaped(text, i) {
    var n = 0;
    var k = i - 1;
    while (k >= 0 && text.charAt(k) === '\\') {
      n++;
      k--;
    }
    return n % 2 === 1;
  }

  /** Empty, spaced, or still touching the delimiter: not a finished mark. */
  function badInner(inner, ch) {
    if (!inner || /^\s|\s$/.test(inner) || inner.indexOf('\n') >= 0) return true;
    if (inner.charAt(0) === ch || inner.charAt(inner.length - 1) === ch) return true;
    return false;
  }

  /**
   * A finished inline mark ending at `caret` inside one text node.
   * @returns {{start:number, end:number, tag:string, text:string}|null}
   */
  function closingMark(raw, caret) {
    var text = String(raw == null ? '' : raw).replace(/\u00a0/g, ' ');
    caret = caret | 0;
    if (caret < 2 || caret > text.length) return null;
    var pairs = [
      { d: '**', tag: 'strong' },
      { d: '~~', tag: 's' },
      { d: '==', tag: 'mark' },
      { d: '++', tag: 'u' },
    ];
    var p;
    for (p = 0; p < pairs.length; p++) {
      var d = pairs[p].d;
      if (text.slice(caret - d.length, caret) !== d) continue;
      var hit = matchPair(text, caret, d, pairs[p].tag);
      if (hit) return hit;
    }
    if (text.charAt(caret - 1) === '*' && text.charAt(caret - 2) !== '*') {
      var em = matchStar(text, caret);
      if (em) return em;
    }
    if (text.charAt(caret - 1) === '`') return matchTick(text, caret);
    return null;
  }

  function matchPair(text, caret, delim, tag) {
    var m = delim.length;
    var closeAt = caret - m;
    if (escaped(text, closeAt)) return null;
    var ch = delim.charAt(0);
    var i = closeAt - m;
    while (i >= 0) {
      if (text.substr(i, m) === delim && !escaped(text, i)) {
        var inner = text.slice(i + m, closeAt);
        if (!badInner(inner, ch)) return { start: i, end: caret, tag: tag, text: inner };
      }
      i--;
    }
    return null;
  }

  function matchStar(text, caret) {
    var closeAt = caret - 1;
    if (text.charAt(closeAt) !== '*' || escaped(text, closeAt)) return null;
    var i = closeAt - 1;
    while (i >= 0) {
      if (text.charAt(i) === '*' && !escaped(text, i) && text.charAt(i - 1) !== '*' && text.charAt(i + 1) !== '*') {
        var inner = text.slice(i + 1, closeAt);
        if (!badInner(inner, '*')) return { start: i, end: caret, tag: 'em', text: inner };
      }
      i--;
    }
    return null;
  }

  function matchTick(text, caret) {
    var closeAt = caret - 1;
    if (text.charAt(closeAt) !== '`' || text.charAt(closeAt - 1) === '`' || escaped(text, closeAt)) return null;
    var i = closeAt - 1;
    while (i >= 0) {
      if (text.charAt(i) !== '`' || escaped(text, i)) {
        i--;
        continue;
      }
      var run = 1;
      var j = i - 1;
      while (j >= 0 && text.charAt(j) === '`' && !escaped(text, j)) {
        run++;
        j--;
      }
      if (run === 1) {
        var inner = text.slice(i + 1, closeAt);
        if (inner.indexOf('\n') < 0 && /\S/.test(inner)) return { start: i, end: caret, tag: 'code', text: inner };
      }
      i = j;
    }
    return null;
  }

  /** Open `[[query` at the end of the text before the caret. Closed `]]` is not a query. */
  function wikiQuery(before) {
    var s = String(before == null ? '' : before).replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '');
    var m = /\[\[([^\[\]\n|]{0,64})$/.exec(s);
    if (!m) return null;
    return { query: m[1], length: m[0].length };
  }

  /** A just-typed `[[Title]]` ending at the caret, or null. */
  function wikiClose(raw, caret) {
    var text = String(raw == null ? '' : raw);
    caret = caret | 0;
    if (caret < 5 || caret > text.length) return null;
    var head = text.slice(0, caret).replace(/[\u200b\ufeff]/g, '');
    var m = /\[\[([^\[\]\n|]{1,80})\]\]$/.exec(head);
    if (!m) return null;
    var title = m[1].replace(/\s+/g, ' ').trim();
    if (!title) return null;
    var start = caret - (text.slice(0, caret).length - head.length + m[0].length);
    if (start < 0) start = caret - m[0].length;
    return { start: start, end: caret, title: title };
  }

  /**
   * Plain pasted text that should go through the Markdown parser.
   * A normal paragraph (no marks, no list, no heading) stays on the plain path.
   */
  function looksLikeMarkdown(raw) {
    var s = String(raw == null ? '' : raw);
    if (/\*\*|~~|==|\+\+|`[^`\n]+`/.test(s)) return true;
    if (/(^|\n) {0,3}#{1,3} /.test(s)) return true;
    if (/(^|\n) {0,3}[-*+] /.test(s)) return true;
    if (/(^|\n) {0,3}\d+[.)] /.test(s)) return true;
    if (/(^|\n) {0,3}>/.test(s)) return true;
    if (/(^|\n) {0,3}```/.test(s)) return true;
    if (/(^|\n) {0,3}([-_*])\1{2,}\s*(\n|$)/.test(s)) return true;
    if (/\[[^\]\n]{1,80}\]\(https?:\/\//.test(s)) return true;
    return false;
  }

  global.DocsLive = {
    syntaxOf: syntaxOf,
    closingMark: closingMark,
    wikiQuery: wikiQuery,
    wikiClose: wikiClose,
    looksLikeMarkdown: looksLikeMarkdown,
  };
})(typeof window !== 'undefined' ? window : globalThis);
