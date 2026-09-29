/**
 * Safe DOM-only markdown renderer (headings, lists, quotes, code, hr, bold,
 * italic, http(s) links). No HTML is ever injected.
 * MarkdownDom.append(parent, text, plainFn) — plainFn(parent, text) renders
 * non-markdown text runs (defaults to a text node).
 */
(function (global) {
  'use strict';

  function defaultPlain(parent, text) {
    parent.appendChild(document.createTextNode(text));
  }

  var MD_INLINE_RE =
    /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(^|[\s(])\*([^*\s][^*\n]*?)\*(?=$|[\s).,;:!?])|(^|[\s(])_([^_\s][^_\n]*?)_(?=$|[\s).,;:!?])/;

  /** Inline markdown (code, bold, italic, links) + highlights. DOM-only, no HTML. */
  function appendInlineMarkdown(parent, text, plain) {
    var rest = text;
    while (rest) {
      var m = MD_INLINE_RE.exec(rest);
      if (!m) {
        plain(parent, rest);
        return;
      }
      if (m.index > 0) plain(parent, rest.slice(0, m.index));
      var node;
      if (m[1] != null) {
        node = document.createElement('code');
        node.textContent = m[1];
      } else if (m[2] != null || m[3] != null) {
        node = document.createElement('strong');
        appendInlineMarkdown(node, m[2] != null ? m[2] : m[3], plain);
      } else if (m[4] != null) {
        node = document.createElement('a');
        node.href = m[5];
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
        appendInlineMarkdown(node, m[4], plain);
      } else {
        var lead = m[6] != null ? m[6] : m[8];
        if (lead) parent.appendChild(document.createTextNode(lead));
        node = document.createElement('em');
        appendInlineMarkdown(node, m[7] != null ? m[7] : m[9], plain);
      }
      parent.appendChild(node);
      rest = rest.slice(m.index + m[0].length);
    }
  }

  var MD_BLOCK_HINT_RE =
    /^ {0,3}(#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>|```|(?:-{3,}|\*{3,})[ \t]*$)|\*\*|__|`|\]\(|(^|[\s(])[*_][^*_\s]/m;

  /**
   * Render assistant text as markdown (headings, lists, quotes, code, hr,
   * inline styles) plus [[g:]] highlights. Falls back to plain highlights when
   * the text has no markdown syntax.
   */
  function append(parent, text, plain) {
    plain = plain || defaultPlain;
    if (!parent || typeof text !== 'string' || !text) return;
    if (!MD_BLOCK_HINT_RE.test(text)) {
      plain(parent, text);
      return;
    }
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var i = 0;
    var para = [];
    function flushPara() {
      if (!para.length) return;
      var p = document.createElement('div');
      p.className = 'agent-md-p';
      appendInlineMarkdown(p, para.join('\n'), plain);
      parent.appendChild(p);
      para = [];
    }
    while (i < lines.length) {
      var line = lines[i];
      var m;
      if (/^ {0,3}```/.test(line)) {
        flushPara();
        var code = [];
        i++;
        while (i < lines.length && !/^ {0,3}```/.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        i++;
        var pre = document.createElement('pre');
        pre.className = 'agent-md-pre';
        var c = document.createElement('code');
        c.textContent = code.join('\n');
        pre.appendChild(c);
        parent.appendChild(pre);
      } else if ((m = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(line))) {
        flushPara();
        var h = document.createElement('div');
        h.className = 'agent-md-h agent-md-h' + Math.min(m[1].length, 3);
        appendInlineMarkdown(h, m[2], plain);
        parent.appendChild(h);
        i++;
      } else if (/^ {0,3}(-{3,}|\*{3,})[ \t]*$/.test(line)) {
        flushPara();
        parent.appendChild(document.createElement('hr'));
        i++;
      } else if (/^ {0,3}>/.test(line)) {
        flushPara();
        var quote = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
          quote.push(lines[i].replace(/^ {0,3}> ?/, ''));
          i++;
        }
        var bq = document.createElement('blockquote');
        bq.className = 'agent-md-quote';
        appendInlineMarkdown(bq, quote.join('\n'), plain);
        parent.appendChild(bq);
      } else if (
        /^\s*[-*+][ \t]+\S/.test(line) ||
        /^\s*\d+[.)][ \t]+\S/.test(line)
      ) {
        flushPara();
        var ordered = /^\s*\d+[.)]/.test(line);
        var list = document.createElement(ordered ? 'ol' : 'ul');
        list.className = 'agent-md-list';
        var itemRe = ordered ? /^\s*\d+[.)][ \t]+(.*)$/ : /^\s*[-*+][ \t]+(.*)$/;
        while (i < lines.length && (m = itemRe.exec(lines[i]))) {
          if (ordered && list.children.length === 0) {
            var start = parseInt(lines[i], 10);
            if (start > 1) list.start = start;
          }
          var li = document.createElement('li');
          appendInlineMarkdown(li, m[1], plain);
          list.appendChild(li);
          i++;
        }
        parent.appendChild(list);
      } else if (!line.trim()) {
        flushPara();
        i++;
      } else {
        para.push(line);
        i++;
      }
    }
    flushPara();
  }


  global.MarkdownDom = { append: append };
})(typeof window !== 'undefined' ? window : this);
