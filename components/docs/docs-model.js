/*
 * Role: pure helpers for the Document view (a Google-Docs-like editor with @ mentions).
 * No Trello / DOM access (editor nodes are duck-typed) so it is unit-tested in Node
 * (test/docs-model.test.js).
 *
 * Contents
 *   1. Constants + card naming / description packing
 *   2. Markdown -> editor HTML   (mdToHtml, inlineToHtml)
 *   3. Editor DOM -> Markdown    (domToMd)
 *   4. @ mentions: trigger detection, index, search
 *   5. Small utilities (word count, relative time, export)
 *
 * Storage format. A document is an archived Trello card named "📄 Title" (see docs-trello.js) whose
 * description holds a Markdown subset + a hidden meta block:
 *   # / ## / ###   **bold** *italic* ++underline++ ~~strike~~ `code`   [text](https://url)
 *   - bullets (nested by 2 spaces)   1. numbers   - [ ] / - [x] checklist   > quote   ``` fence   ---
 *   mentions: [@Label](person:ID) [@Label](task:ID) [@Label](doc:ID)
 *   <!--blank-->  an intentionally empty paragraph
 */
(function (global) {
  'use strict';

  /* ── 1. Constants + naming / packing ─────────────────────────────── */

  var NAME_PREFIX = '📄 ';
  var MAX_DESC = 16384; // Trello card description limit
  var META_RESERVE = 120;
  var MAX_BODY = MAX_DESC - META_RESERVE;
  var MAX_TITLE = 120;
  var UNTITLED = 'Sans titre';

  var MENTION_TYPES = {
    person: { icon: 'user', group: 'Personnes' },
    task: { icon: 'checkbox', group: 'Tâches' },
    doc: { icon: 'file-text', group: 'Documents' },
  };

  function isDocName(name) {
    return typeof name === 'string' && name.indexOf('📄') === 0;
  }

  function titleFromName(name) {
    var t = String(name == null ? '' : name).replace(/^📄\s?/, '').trim();
    return t || UNTITLED;
  }

  function cleanTitle(title) {
    var t = String(title == null ? '' : title).replace(/\s+/g, ' ').trim();
    return t.slice(0, MAX_TITLE);
  }

  function nameFromTitle(title) {
    return NAME_PREFIX + (cleanTitle(title) || UNTITLED);
  }

  /** Description text of a document card: the body, then a hidden `type: document` + `rev: N` block. */
  function packDesc(body, meta) {
    var m = meta || {};
    var rev = Math.max(1, parseInt(m.rev, 10) || 1);
    var text = String(body == null ? '' : body).replace(/\s+$/, '');
    var block = '<!--cerveau-meta\ntype: document\nrev: ' + rev + '\n-->';
    return text ? text + '\n\n' + block : block;
  }

  /**
   * The meta block is always the very last thing in the description, so only the last
   * `<!--cerveau-meta ... -->` that runs to the end counts: text typed in the body can never forge it.
   * @returns {{body:string, rev:number, isDoc:boolean}} (does not trim: code blocks stay intact)
   */
  function unpackDesc(desc) {
    var full = String(desc == null ? '' : desc).replace(/\r\n?/g, '\n');
    var meta = {};
    var body = full;
    var start = -1;
    var finder = /<!--\s*cerveau-meta\b/gi;
    var hit;
    while ((hit = finder.exec(full))) start = hit.index;
    if (start >= 0) {
      var tail = /^<!--\s*cerveau-meta\b([\s\S]*?)-->\s*$/i.exec(full.slice(start));
      if (tail) {
        tail[1].split('\n').forEach(function (line) {
          var m = /^\s*([a-z0-9_-]+)\s*:\s*(.*?)\s*$/i.exec(line);
          if (m) meta[m[1].toLowerCase()] = m[2];
        });
        body = full.slice(0, start);
      }
    }
    return {
      body: body.replace(/\s+$/, ''),
      rev: Math.max(1, parseInt(meta.rev, 10) || 1),
      isDoc: meta.type === 'document',
    };
  }

  function cleanId(id) {
    var s = String(id == null ? '' : id).trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
  }

  /** Only http(s) / mailto links survive; "example.com/x" gets https://. */
  function safeHref(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u || /[\u0000-\u001f<>"]/.test(u)) return '';
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u.replace(/\s/g, '%20');
    if (/\s/.test(u)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
    if (/^[^\s\/@]+\.[a-z]{2,}(?:[\/?#:]|$)/i.test(u)) return 'https://' + u;
    return '';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 2. Markdown -> editor HTML ──────────────────────────────────── */

  var ESCAPABLE = '\\`*_{}[]()#+-.!~<>|';

  function runLength(s, i, ch) {
    var k = i;
    while (s.charAt(k) === ch) k++;
    return k - i;
  }

  function findBacktickRun(s, from, run) {
    var k = from;
    while (k < s.length) {
      if (s.charAt(k) === '`') {
        var r = runLength(s, k, '`');
        if (r === run) return k;
        k += r;
      } else k++;
    }
    return -1;
  }

  /** Index just after a valid code span starting at i, or -1. */
  function skipCode(s, i) {
    var run = runLength(s, i, '`');
    var close = findBacktickRun(s, i + run, run);
    return close < 0 ? -1 : close + run;
  }

  /**
   * Index of the closing `marker` for an emphasis opened just before `from`, or -1.
   * For a run longer than the marker ("***a***") the closer is the last marker-length chars.
   */
  function findCloser(s, from, marker) {
    var m = marker.length;
    var mc = marker.charAt(0);
    var k = from;
    while (k < s.length) {
      var ch = s.charAt(k);
      if (ch === '\\') {
        k += 2;
        continue;
      }
      if (ch === '`') {
        var after = skipCode(s, k);
        k = after > 0 ? after : k + runLength(s, k, '`');
        continue;
      }
      if (ch === mc && s.substr(k, m) === marker) {
        if (m === 1 && s.charAt(k + 1) === mc) {
          // a nested double marker while looking for a single one: step over the whole pair
          var inner = findCloser(s, k + 2, mc + mc);
          k = inner > 0 ? inner + 2 : k + 2;
          continue;
        }
        if (k > from && !/\s/.test(s.charAt(k - 1))) {
          var runEnd = k + runLength(s, k, mc);
          return runEnd - k > m ? runEnd - m : k;
        }
      }
      k++;
    }
    return -1;
  }

  function isWordChar(ch) {
    return !!ch && /[A-Za-z0-9À-￿]/.test(ch);
  }

  function mentionHtml(type, id, label) {
    var spec = MENTION_TYPES[type];
    var cid = cleanId(id);
    if (!spec || !cid) return esc(label || '');
    var text = String(label == null ? '' : label).replace(/\s+/g, ' ').trim() || '?';
    return (
      '<span class="dc-mention dc-mention--' + type + '" data-m="' + type + '" data-id="' + cid +
      '" data-label="' + esc(text) + '" contenteditable="false">' +
      '<i class="ti ti-' + spec.icon + '" aria-hidden="true"></i>' + esc(text) + '</span>'
    );
  }

  /** `[label](url)` starting at i: a mention chip, a link, or just the label text. */
  function parseLink(s, i) {
    var n = s.length;
    var j = i + 1;
    var depth = 1;
    while (j < n) {
      var ch = s.charAt(j);
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === '`') {
        var a = skipCode(s, j);
        if (a > 0) {
          j = a;
          continue;
        }
      }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (j >= n || s.charAt(j + 1) !== '(') return null;
    var k = j + 2;
    var pd = 1;
    while (k < n) {
      var c = s.charAt(k);
      if (c === '\\') {
        k += 2;
        continue;
      }
      if (c === '(') pd++;
      else if (c === ')') {
        pd--;
        if (!pd) break;
      }
      k++;
    }
    if (k >= n) return null;
    var label = s.slice(i + 1, j);
    var url = s.slice(j + 2, k).trim();
    var m = /^(person|task|doc):([A-Za-z0-9_-]{1,64})$/.exec(url);
    if (m && label.charAt(0) === '@') {
      return { html: mentionHtml(m[1], m[2], label.slice(1).replace(/\\(.)/g, '$1')), end: k + 1 };
    }
    var href = safeHref(url);
    if (!href) return { html: inlineToHtml(label), end: k + 1 };
    return {
      html: '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + inlineToHtml(label) + '</a>',
      end: k + 1,
    };
  }

  /** Inline Markdown -> sanitized HTML (every character is escaped; only whitelisted tags are emitted). */
  function inlineToHtml(src) {
    var s = String(src == null ? '' : src);
    var n = s.length;
    var out = '';
    var i = 0;
    while (i < n) {
      var c = s.charAt(i);
      if (c === '\\') {
        var nx = s.charAt(i + 1);
        if (nx && ESCAPABLE.indexOf(nx) >= 0) {
          out += esc(nx);
          i += 2;
        } else {
          out += '\\';
          i++;
        }
        continue;
      }
      if (c === '`') {
        var run = runLength(s, i, '`');
        var close = findBacktickRun(s, i + run, run);
        if (close >= 0) {
          var code = s.slice(i + run, close);
          if (/^ [\s\S]* $/.test(code) && /\S/.test(code)) code = code.slice(1, -1);
          out += '<code>' + esc(code) + '</code>';
          i = close + run;
        } else {
          out += s.substr(i, run);
          i += run;
        }
        continue;
      }
      if (c === '<' && s.substr(i, 7) === '<!---->') {
        i += 7;
        continue;
      }
      if (c === '[') {
        var link = parseLink(s, i);
        if (link) {
          out += link.html;
          i = link.end;
          continue;
        }
      }
      var two = s.substr(i, 2);
      if ((two === '**' || two === '~~' || two === '++') && s.charAt(i + 2) && !/\s/.test(s.charAt(i + 2))) {
        var cl = findCloser(s, i + 2, two);
        if (cl > 0) {
          var tag = two === '**' ? 'strong' : two === '~~' ? 's' : 'u';
          out += '<' + tag + '>' + inlineToHtml(s.slice(i + 2, cl)) + '</' + tag + '>';
          i = cl + 2;
          continue;
        }
      }
      if ((c === '*' || c === '_') && s.charAt(i + 1) !== c && s.charAt(i + 1) && !/\s/.test(s.charAt(i + 1))) {
        if (c === '_' && isWordChar(s.charAt(i - 1))) {
          out += '_';
          i++;
          continue;
        }
        var ci = findCloser(s, i + 1, c);
        if (ci > 0 && !(c === '_' && isWordChar(s.charAt(ci + 1)))) {
          out += '<em>' + inlineToHtml(s.slice(i + 1, ci)) + '</em>';
          i = ci + 1;
          continue;
        }
      }
      out += esc(c);
      i++;
    }
    return out;
  }

  var RE_FENCE = /^ {0,3}(`{3,})[^`]*$/;
  var RE_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  var RE_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+([\s\S]*))?$/;
  var RE_QUOTE = /^ {0,3}>/;
  var RE_LIST = /^([ \t]*)([-*+]|\d+[.)])(?:[ \t]+([\s\S]*))?$/;
  var BLANK_MARK = '<!--blank-->';

  function indentOf(ws) {
    return ws.replace(/\t/g, '    ').length;
  }

  function startsBlock(line) {
    return (
      RE_FENCE.test(line) ||
      RE_HR.test(line) ||
      RE_HEADING.test(line) ||
      RE_QUOTE.test(line) ||
      RE_LIST.test(line) ||
      line.trim() === BLANK_MARK
    );
  }

  function listItem(line) {
    var m = RE_LIST.exec(line);
    if (!m) return null;
    var text = m[3] == null ? '' : m[3];
    var item = { indent: indentOf(m[1]), kind: /^\d/.test(m[2]) ? 'ol' : 'ul', text: text, checked: false };
    var t = /^\[( |x|X)\](?:[ \t]+([\s\S]*))?$/.exec(text);
    if (t) {
      item.kind = 'todo';
      item.checked = t[1] !== ' ';
      item.text = t[2] || '';
    }
    return item;
  }

  function renderListTree(children) {
    var html = '';
    var i = 0;
    while (i < children.length) {
      var kind = children[i].item.kind;
      var lis = '';
      while (i < children.length && children[i].item.kind === kind) {
        var node = children[i];
        var inner = inlineToHtml(node.item.text);
        if (!inner) inner = '<br>';
        lis +=
          '<li' + (kind === 'todo' ? ' data-checked="' + (node.item.checked ? 'true' : 'false') + '"' : '') + '>' +
          inner + (node.children.length ? renderListTree(node.children) : '') + '</li>';
        i++;
      }
      html += kind === 'ol' ? '<ol>' + lis + '</ol>' : kind === 'todo' ? '<ul class="dc-todo">' + lis + '</ul>' : '<ul>' + lis + '</ul>';
    }
    return html;
  }

  function blocksToHtml(lines) {
    var out = '';
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }
      if (line.trim() === BLANK_MARK) {
        out += '<p><br></p>';
        i++;
        continue;
      }
      var fence = RE_FENCE.exec(line);
      if (fence) {
        var len = fence[1].length;
        var closeRe = new RegExp('^ {0,3}`{' + len + ',}[ \\t]*$');
        var code = [];
        i++;
        while (i < lines.length && !closeRe.test(lines[i])) code.push(lines[i++]);
        i++; // closing fence (or end of input)
        out += '<pre>' + (code.length ? esc(code.join('\n')) : '<br>') + '</pre>';
        continue;
      }
      if (RE_HR.test(line)) {
        out += '<hr>';
        i++;
        continue;
      }
      var hm = RE_HEADING.exec(line);
      if (hm) {
        var lvl = Math.min(3, hm[1].length);
        var htext = inlineToHtml((hm[2] || '').trim());
        out += '<h' + lvl + '>' + (htext || '<br>') + '</h' + lvl + '>';
        i++;
        continue;
      }
      if (RE_QUOTE.test(line)) {
        var q = [];
        while (i < lines.length && RE_QUOTE.test(lines[i])) {
          q.push(lines[i].replace(/^ {0,3}> ?/, ''));
          i++;
        }
        out += '<blockquote>' + (blocksToHtml(q) || '<p><br></p>') + '</blockquote>';
        continue;
      }
      if (RE_LIST.test(line)) {
        var root = { children: [] };
        var stack = [{ indent: -1, node: root }];
        while (i < lines.length) {
          var cur = lines[i];
          var item = RE_HR.test(cur) ? null : listItem(cur);
          if (!item) {
            // a single blank line between items keeps the list going
            if (/^\s*$/.test(cur) && i + 1 < lines.length && !RE_HR.test(lines[i + 1]) && listItem(lines[i + 1])) {
              i++;
              continue;
            }
            break;
          }
          while (stack.length > 1 && stack[stack.length - 1].indent >= item.indent) stack.pop();
          var node = { item: item, children: [] };
          stack[stack.length - 1].node.children.push(node);
          stack.push({ indent: item.indent, node: node });
          i++;
        }
        out += renderListTree(root.children);
        continue;
      }
      var para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !startsBlock(lines[i])) para.push(lines[i++]);
      out += '<p>' + para.map(function (l) { return inlineToHtml(l.trim()); }).join('<br>') + '</p>';
    }
    return out;
  }

  /** Document Markdown -> HTML for the contenteditable surface (always at least one paragraph). */
  function mdToHtml(md) {
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    return blocksToHtml(lines) || '<p><br></p>';
  }

  /* ── 3. Editor DOM -> Markdown ───────────────────────────────────── */

  var BLOCK_TAGS = {
    P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, HR: 1,
    TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1, SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1,
    FIGURE: 1, MAIN: 1, ASIDE: 1, NAV: 1, DL: 1, DT: 1, DD: 1, ADDRESS: 1, FIELDSET: 1, FORM: 1, CENTER: 1,
  };
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, HEAD: 1, TEMPLATE: 1, NOSCRIPT: 1, IMG: 1, SVG: 1, IFRAME: 1, CANVAS: 1 };

  function tagOf(node) {
    return node && node.nodeType === 1 ? String(node.nodeName || '').toUpperCase() : '';
  }
  function attr(node, name) {
    return node && typeof node.getAttribute === 'function' ? node.getAttribute(name) : null;
  }
  function kids(node) {
    return node && node.childNodes ? Array.prototype.slice.call(node.childNodes) : [];
  }
  function hasClass(node, cls) {
    return new RegExp('(^|\\s)' + cls + '(\\s|$)').test(attr(node, 'class') || '');
  }
  function isBlock(node) {
    return !!BLOCK_TAGS[tagOf(node)];
  }
  function hasBlockChild(node) {
    return kids(node).some(function (k) {
      return isBlock(k);
    });
  }

  function textOf(node) {
    if (!node) return '';
    if (node.nodeType === 3) return String(node.nodeValue || '');
    if (node.nodeType !== 1 || SKIP_TAGS[tagOf(node)]) return '';
    if (tagOf(node) === 'BR') return '\n';
    return kids(node).map(textOf).join('');
  }

  function escText(s) {
    return s.replace(/[\\`*_\[\]~<+]/g, '\\$&');
  }

  function escLineStart(line) {
    if (/^#{1,6}(\s|$)/.test(line) || /^>/.test(line) || /^-/.test(line)) return '\\' + line;
    if (/^\d+[.)](\s|$)/.test(line)) return line.replace(/^(\d+)([.)])/, '$1\\$2');
    return line;
  }

  function codeSpan(text) {
    var t = String(text).replace(/\s*[\r\n]+\s*/g, ' ');
    if (!t) return '';
    var longest = 0;
    (t.match(/`+/g) || []).forEach(function (r) {
      if (r.length > longest) longest = r.length;
    });
    var fence = new Array(longest + 2).join('`');
    var pad = t.charAt(0) === '`' || t.charAt(t.length - 1) === '`' || (/^ [\s\S]* $/.test(t) && /\S/.test(t)) ? ' ' : '';
    return fence + pad + t + pad + fence;
  }

  function wrapMark(inner, marker) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    if (!m[2]) return inner;
    return m[1] + marker + m[2] + marker + m[3];
  }

  function encodeHref(href) {
    return href.replace(/[()\s\\<>]/g, function (ch) {
      return '%' + ('0' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-2);
    });
  }

  function marksOf(node, tag) {
    var style = (attr(node, 'style') || '').toLowerCase();
    var bold = tag === 'B' || tag === 'STRONG';
    var italic = tag === 'I' || tag === 'EM';
    var underline = tag === 'U';
    var strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL';
    if (style) {
      if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(style)) bold = true;
      else if (/font-weight\s*:\s*(normal|lighter|[1-5]00)/.test(style)) bold = false;
      if (/font-style\s*:\s*(italic|oblique)/.test(style)) italic = true;
      else if (/font-style\s*:\s*normal/.test(style)) italic = false;
      if (tag !== 'A' && /text-decoration[^;]*underline/.test(style)) underline = true;
      if (/text-decoration[^;]*line-through/.test(style)) strike = true;
    }
    return { bold: bold, italic: italic, underline: underline, strike: strike };
  }

  function joinInline(parts) {
    var s = '';
    parts.forEach(function (p) {
      if (!p) return;
      // adjacent delimiter runs ("**a**" + "*b*") would fuse: a comment separator keeps them apart
      if (s && /[*~+_]$/.test(s) && /^[*~+_]/.test(p)) s += '<!---->';
      s += p;
    });
    return s;
  }

  function inlineOne(node) {
    if (node.nodeType === 3) {
      var raw = String(node.nodeValue || '')
        .replace(/[\u200b\ufeff]/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s*[\r\n]+\s*/g, ' ');
      return escText(raw);
    }
    if (node.nodeType !== 1) return '';
    var tag = tagOf(node);
    if (SKIP_TAGS[tag]) return '';
    if (tag === 'BR') return '\n';
    var mtype = attr(node, 'data-m');
    if (mtype && MENTION_TYPES[mtype]) {
      var id = cleanId(attr(node, 'data-id'));
      var label = String(attr(node, 'data-label') || textOf(node)).replace(/\s+/g, ' ').trim() || '?';
      if (id) return '[@' + label.replace(/[\\\[\]]/g, '\\$&') + '](' + mtype + ':' + id + ')';
      return escText(textOf(node));
    }
    var marks = marksOf(node, tag);
    var inner;
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') inner = codeSpan(textOf(node));
    else inner = inlineMd(kids(node));
    if (tag === 'A') {
      var href = safeHref(attr(node, 'href'));
      var lbl = inner.replace(/\s*\n\s*/g, ' ');
      if (href && lbl.trim()) inner = '[' + lbl + '](' + encodeHref(href) + ')';
    }
    if (marks.underline) inner = wrapMark(inner, '++');
    if (marks.strike) inner = wrapMark(inner, '~~');
    if (marks.italic) inner = wrapMark(inner, '*');
    if (marks.bold) inner = wrapMark(inner, '**');
    return inner;
  }

  function inlineMd(nodes) {
    return joinInline(
      nodes.map(function (n) {
        return inlineOne(n);
      })
    );
  }

  /** Paragraph Markdown for a run of inline nodes; null when there is nothing visible (and no <br>). */
  function paragraphMd(nodes) {
    var text = inlineMd(nodes).replace(/^\n+|\n+$/g, '');
    if (!/\S/.test(text)) {
      var hasBr = nodes.some(function (n) {
        return tagOf(n) === 'BR' || (n.nodeType === 1 && kids(n).some(function (k) { return tagOf(k) === 'BR'; }));
      });
      return hasBr ? BLANK_MARK : null;
    }
    return text
      .split('\n')
      .map(function (l) {
        return escLineStart(l.replace(/^\s+/, '').replace(/\s+$/, ''));
      })
      .filter(function (l) {
        return l !== '';
      })
      .join('\n');
  }

  function preText(node) {
    var text = '';
    kids(node).forEach(function (k, idx) {
      if (k.nodeType === 3) text += String(k.nodeValue || '').replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ');
      else if (tagOf(k) === 'BR') text += '\n';
      else if (k.nodeType === 1 && !SKIP_TAGS[tagOf(k)]) {
        var sub = preText(k);
        if (isBlock(k) && idx > 0 && text && text.charAt(text.length - 1) !== '\n') text += '\n';
        text += sub;
      }
    });
    return text;
  }

  function listLines(listEl, depth, lines) {
    var ordered = tagOf(listEl) === 'OL';
    var todo = hasClass(listEl, 'dc-todo');
    var indent = new Array(depth + 1).join('  ');
    var n = 0;
    kids(listEl).forEach(function (child) {
      var tag = tagOf(child);
      if (tag === 'UL' || tag === 'OL') {
        listLines(child, depth + 1, lines); // list placed directly in a list (Chrome's indent)
        return;
      }
      if (tag !== 'LI') return;
      var inline = [];
      var nested = [];
      kids(child).forEach(function (k) {
        var kt = tagOf(k);
        if (kt === 'UL' || kt === 'OL') nested.push(k);
        else if (isBlock(k) && !hasBlockChild(k)) {
          if (inline.length) inline.push({ nodeType: 3, nodeValue: ' ' });
          kids(k).forEach(function (kk) {
            inline.push(kk);
          });
        } else inline.push(k);
      });
      var text = inlineMd(inline).replace(/\s*\n\s*/g, ' ').trim();
      if (!text && nested.length) {
        nested.forEach(function (l) {
          listLines(l, depth + 1, lines); // wrapper <li> that only holds a nested list
        });
        return;
      }
      n++;
      var marker = todo ? '- [' + (attr(child, 'data-checked') === 'true' ? 'x' : ' ') + '] ' : ordered ? n + '. ' : '- ';
      lines.push((indent + marker + text).replace(/[ \t]+$/, ''));
      nested.forEach(function (l) {
        listLines(l, depth + 1, lines);
      });
    });
  }

  function blockMd(node, out) {
    var tag = tagOf(node);
    if (/^H[1-6]$/.test(tag)) {
      var level = Math.min(3, parseInt(tag.charAt(1), 10));
      var text = inlineMd(kids(node)).replace(/\s*\n\s*/g, ' ').trim();
      out.push(new Array(level + 1).join('#') + (text ? ' ' + text : ''));
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      var lines = [];
      listLines(node, 0, lines);
      if (lines.length) out.push(lines.join('\n'));
      return;
    }
    if (tag === 'BLOCKQUOTE') {
      var inner = [];
      blocksOf(node, inner);
      var md = inner.join('\n\n');
      out.push(
        md
          ? md.split('\n').map(function (l) { return l ? '> ' + l : '>'; }).join('\n')
          : '>'
      );
      return;
    }
    if (tag === 'PRE') {
      var code = preText(node).replace(/\n$/, '');
      var longest = 0;
      (code.match(/`+/g) || []).forEach(function (r) {
        if (r.length > longest) longest = r.length;
      });
      var fence = new Array(Math.max(3, longest + 1) + 1).join('`');
      out.push(fence + '\n' + (code ? code + '\n' : '') + fence);
      return;
    }
    if (tag === 'HR') {
      out.push('---');
      return;
    }
    if ((tag === 'P' || tag === 'DIV' || tag === 'LI' || tag === 'TD' || tag === 'TH' || tag === 'DT' || tag === 'DD') && !hasBlockChild(node)) {
      var para = paragraphMd(kids(node));
      if (para !== null) out.push(para);
      else if (tag === 'P') out.push(BLANK_MARK);
      return;
    }
    blocksOf(node, out);
  }

  function blocksOf(parent, out) {
    var run = [];
    function flush() {
      if (!run.length) return;
      var md = paragraphMd(run);
      run = [];
      if (md !== null) out.push(md);
    }
    kids(parent).forEach(function (node) {
      if (node.nodeType === 3) {
        run.push(node);
        return;
      }
      if (node.nodeType !== 1 || SKIP_TAGS[tagOf(node)]) return;
      if (isBlock(node)) {
        flush();
        blockMd(node, out);
        return;
      }
      run.push(node);
    });
    flush();
  }

  /** Editor root -> Markdown (leading / trailing empty paragraphs dropped). */
  function domToMd(root) {
    var blocks = [];
    blocksOf(root, blocks);
    while (blocks.length && blocks[0] === BLANK_MARK) blocks.shift();
    while (blocks.length && blocks[blocks.length - 1] === BLANK_MARK) blocks.pop();
    return blocks.join('\n\n');
  }

  /* ── 4. @ mentions ───────────────────────────────────────────────── */

  var TRIGGER_RE = /(^|[\s(«"'])(@{1,3})([^\s@]+(?: [^\s@]*)?)?$/;
  var SLASH_RE = /(^|\s)\/([A-Za-zÀ-ÿ0-9-]{0,20})$/;

  /**
   * "@" opens everything, "@@" tasks only, "@@@" documents only.
   * @param {string} before text of the current block up to the caret
   * @returns {{scope:'all'|'task'|'doc', query:string, length:number}|null} length = chars to replace
   */
  function detectTrigger(before) {
    var s = String(before == null ? '' : before).replace(/\u00a0/g, ' ');
    var m = TRIGGER_RE.exec(s);
    if (!m) return null;
    var ats = m[2].length;
    var query = m[3] || '';
    if (query.length > 32) return null;
    return { scope: ats === 1 ? 'all' : ats === 2 ? 'task' : 'doc', query: query, length: ats + query.length };
  }

  /** "/" menu trigger (start of a block or after a space). */
  function detectSlash(before) {
    var s = String(before == null ? '' : before).replace(/\u00a0/g, ' ');
    var m = SLASH_RE.exec(s);
    if (!m) return null;
    return { query: m[2], length: 1 + m[2].length };
  }

  function fold(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (e) {
      /* old engines: keep accents */
    }
    return t;
  }

  /**
   * Everything a mention can point to, plus a lookup for rendering existing chips.
   * @param {{members?:object[], contacts?:object[], cards?:object[], lists?:object[], docs?:object[], excludeDocId?:string}} src
   */
  function buildMentionIndex(src) {
    src = src || {};
    var person = [];
    var task = [];
    var doc = [];
    var by = Object.create(null);
    var seenMember = Object.create(null);
    function add(list, item) {
      var id = cleanId(item.id);
      if (!id) return;
      item.id = id;
      list.push(item);
      by[item.type + ':' + id] = item;
    }
    (Array.isArray(src.members) ? src.members : []).forEach(function (m) {
      if (!m || m.id == null) return;
      var label = String(m.fullName || m.username || '').trim() || String(m.id);
      seenMember[String(m.id)] = true;
      add(person, {
        type: 'person',
        id: m.id,
        label: label,
        sub: m.username ? '@' + m.username : '',
        kw: fold(m.username || ''),
        initials: String(m.initials || '').trim() || initialsOf(label),
        username: m.username || '',
      });
    });
    (Array.isArray(src.contacts) ? src.contacts : []).forEach(function (p) {
      if (!p || !p.id || !p.name) return;
      if (p.trelloMemberId && seenMember[String(p.trelloMemberId)]) {
        var linked = by['person:' + cleanId(p.trelloMemberId)];
        if (linked && !linked.sub) linked.sub = p.relation || '';
        if (linked) linked.kw += ' ' + fold((p.aliases || []).join(' '));
        return;
      }
      add(person, {
        type: 'person',
        id: p.id,
        label: String(p.name),
        sub: p.relation || (p.roles && p.roles[0]) || p.email || 'Contact',
        kw: fold((p.aliases || []).concat(p.roles || []).join(' ')),
        initials: initialsOf(p.name),
        contact: true,
        email: p.email || '',
        phone: p.phone || '',
      });
    });
    var listName = Object.create(null);
    (Array.isArray(src.lists) ? src.lists : []).forEach(function (l) {
      if (l && l.id) listName[String(l.id)] = l.name || '';
    });
    (Array.isArray(src.cards) ? src.cards : []).forEach(function (c) {
      if (!c || !c.id || isDocName(c.name)) return;
      add(task, {
        type: 'task',
        id: c.id,
        label: String(c.name || '').trim() || 'Sans titre',
        sub: listName[String(c.idList)] || '',
        kw: '',
        done: !!c.dueComplete,
        url: c.url || '',
      });
    });
    (Array.isArray(src.docs) ? src.docs : []).forEach(function (d) {
      if (!d || !d.id) return;
      var item = { type: 'doc', id: d.id, label: d.title || UNTITLED, sub: d.sub || '', kw: '' };
      if (d.id === src.excludeDocId) {
        // not offered in the picker (a document linking to itself is noise) but still resolvable
        var self = cleanId(d.id);
        if (self) by['doc:' + self] = item;
        return;
      }
      add(doc, item);
    });
    return { person: person, task: task, doc: doc, by: by };
  }

  function initialsOf(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function resolveMention(index, type, id) {
    return (index && index.by && index.by[type + ':' + id]) || null;
  }

  function rank(item, q) {
    var label = fold(item.label);
    if (label === q) return 0;
    if (label.indexOf(q) === 0) return 1;
    if (label.split(/[\s\-_/.,()]+/).some(function (w) { return w.indexOf(q) === 0; })) return 2;
    if (label.indexOf(q) >= 0) return 3;
    var extra = fold((item.sub || '') + ' ' + (item.kw || ''));
    if (extra.indexOf(q) >= 0) return 4;
    return -1;
  }

  /**
   * Grouped, ranked results for the picker.
   * @returns {{type:string, label:string, items:object[], total:number}[]} (empty groups omitted)
   */
  function searchMentions(index, scope, query, opts) {
    opts = opts || {};
    var q = fold(String(query || '').trim());
    var types = scope === 'task' ? ['task'] : scope === 'doc' ? ['doc'] : ['person', 'task', 'doc'];
    var per = opts.perGroup || (types.length === 1 ? 8 : q ? 5 : 3);
    var groups = [];
    types.forEach(function (type) {
      var source = (index && index[type]) || [];
      var hits;
      if (!q) hits = source.slice();
      else {
        hits = source
          .map(function (item, pos) {
            return { item: item, r: rank(item, q), pos: pos };
          })
          .filter(function (h) {
            return h.r >= 0;
          })
          .sort(function (a, b) {
            return a.r - b.r || a.pos - b.pos;
          })
          .map(function (h) {
            return h.item;
          });
      }
      if (hits.length) {
        groups.push({ type: type, label: MENTION_TYPES[type].group, items: hits.slice(0, per), total: hits.length });
      }
    });
    return groups;
  }

  /* ── 5. Utilities ────────────────────────────────────────────────── */

  function countWords(text) {
    var m = String(text == null ? '' : text).match(/[^\s]+/g);
    return m ? m.length : 0;
  }

  function sizeInfo(md) {
    var len = packDesc(md, { rev: 1 }).length;
    return { length: len, max: MAX_DESC, ratio: len / MAX_DESC, over: len > MAX_DESC };
  }

  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /** "à l'instant", "il y a 5 min", "il y a 3 h", "hier", "il y a 4 j", else "3 oct." */
  function relativeTime(iso, nowMs) {
    var then = Date.parse(iso);
    if (!isFinite(then)) return '';
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var sec = Math.max(0, Math.round((now - then) / 1000));
    if (sec < 45) return 'à l’instant';
    var min = Math.round(sec / 60);
    if (min < 60) return 'il y a ' + min + ' min';
    var hr = Math.round(min / 60);
    if (hr < 24) return 'il y a ' + hr + ' h';
    var day = Math.round(hr / 24);
    if (day === 1) return 'hier';
    if (day < 7) return 'il y a ' + day + ' j';
    var d = new Date(then);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date(now).getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /** Mentions become plain "@Label" so an exported file reads naturally. */
  function mentionsToPlain(md) {
    return String(md == null ? '' : md).replace(/\[@((?:\\.|[^\]\\])*)\]\((?:person|task|doc):[A-Za-z0-9_-]+\)/g, function (_a, label) {
      return '@' + label.replace(/\\(.)/g, '$1');
    });
  }

  function exportMarkdown(title, md) {
    return '# ' + (cleanTitle(title) || UNTITLED) + '\n\n' + mentionsToPlain(md) + '\n';
  }

  function filterDocs(docs, query) {
    var q = fold(String(query || '').trim());
    if (!q) return (docs || []).slice();
    return (docs || []).filter(function (d) {
      return fold(d.title).indexOf(q) >= 0;
    });
  }

  /* ── Folders ─────────────────────────────────────────────────────────
   * The tree lives in one hidden archived card ("📁 Dossiers"), as JSON:
   *   { v:1, folders:[{id,name,parent|null}], docs:{ <docCardId>: <folderId> } }
   * A doc absent from `docs` (or pointing to a missing folder) sits at the root. */

  var FOLDER_INDEX_NAME = '📁 Dossiers';
  var MAX_FOLDER_NAME = 60;

  function isFolderIndexName(name) {
    return typeof name === 'string' && name.indexOf('📁') === 0;
  }

  function cleanFolderName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);
  }

  function emptyIndex() {
    return { v: 1, folders: [], docs: {}, parents: {}, archived: {} };
  }

  /** Tolerant parse: anything unreadable gives an empty index; dangling parents / cycles are healed. */
  function parseFolderIndex(desc) {
    var idx = emptyIndex();
    var raw;
    try {
      raw = JSON.parse(String(desc == null ? '' : desc));
    } catch (e) {
      return idx;
    }
    if (!raw || typeof raw !== 'object') return idx;
    var seen = {};
    (Array.isArray(raw.folders) ? raw.folders : []).forEach(function (f) {
      if (!f || typeof f.id !== 'string' || !f.id || seen[f.id]) return;
      var name = cleanFolderName(f.name);
      if (!name) return;
      seen[f.id] = true;
      var nf = { id: f.id, name: name, parent: typeof f.parent === 'string' && f.parent ? f.parent : null };
      if (f.archived === true) nf.archived = true;
      idx.folders.push(nf);
    });
    idx.folders.forEach(function (f) {
      if (f.parent && (!seen[f.parent] || f.parent === f.id)) f.parent = null;
    });
    idx.folders.forEach(function (f) {
      // a parent chain that loops back on itself: cut it at this folder
      var hops = 0;
      var cur = f;
      while (cur && cur.parent && hops <= idx.folders.length) {
        cur = idx.folders.filter(function (x) { return x.id === cur.parent; })[0];
        hops++;
        if (cur === f) {
          f.parent = null;
          return;
        }
      }
    });
    var docs = raw.docs && typeof raw.docs === 'object' ? raw.docs : {};
    Object.keys(docs).forEach(function (k) {
      if (typeof docs[k] === 'string' && seen[docs[k]]) idx.docs[k] = docs[k];
    });
    var parents = raw.parents && typeof raw.parents === 'object' ? raw.parents : {};
    Object.keys(parents).forEach(function (k) {
      if (typeof parents[k] === 'string' && parents[k] && parents[k] !== k) idx.parents[k] = parents[k];
    });
    var arch = raw.archived && typeof raw.archived === 'object' ? raw.archived : {};
    Object.keys(arch).forEach(function (k) { if (arch[k] === true) idx.archived[k] = true; });
    return idx;
  }

  function packFolderIndex(idx) {
    return JSON.stringify({ v: 1, folders: idx.folders, docs: idx.docs, parents: idx.parents || {}, archived: idx.archived || {} });
  }

  function newFolderId() {
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function folderById(idx, id) {
    return idx.folders.filter(function (f) { return f.id === id; })[0] || null;
  }

  /** True when `target` is `id` itself or one of its descendants (moving `id` there would loop). */
  function isInsideFolder(idx, id, target) {
    var cur = target;
    var hops = 0;
    while (cur && hops++ <= idx.folders.length) {
      if (cur === id) return true;
      var f = folderById(idx, cur);
      cur = f && f.parent;
    }
    return false;
  }

  function folderPath(idx, id) {
    var out = [];
    var cur = folderById(idx, id);
    var hops = 0;
    while (cur && hops++ <= idx.folders.length) {
      out.unshift(cur.name);
      cur = cur.parent ? folderById(idx, cur.parent) : null;
    }
    return out.join(' / ');
  }

  /** Removes a folder; its sub-folders and documents move up to its parent (nothing is deleted). */
  function removeFolderFrom(idx, id) {
    var f = folderById(idx, id);
    if (!f) return idx;
    var up = f.parent || null;
    idx.folders = idx.folders.filter(function (x) { return x.id !== id; });
    idx.folders.forEach(function (x) { if (x.parent === id) x.parent = up; });
    Object.keys(idx.docs).forEach(function (k) {
      if (idx.docs[k] !== id) return;
      if (up) idx.docs[k] = up;
      else delete idx.docs[k];
    });
    return idx;
  }

  var SORTS = ['date', 'date-asc', 'name', 'name-desc', 'size', 'size-asc'];

  function docComparator(sort) {
    function byName(a, b) {
      var x = fold(a.title);
      var y = fold(b.title);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    function byDate(a, b) {
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    }
    function bySize(a, b) {
      return (a.size || 0) - (b.size || 0);
    }
    switch (sort) {
      case 'date-asc': return byDate;
      case 'name': return byName;
      case 'name-desc': return function (a, b) { return byName(b, a); };
      case 'size': return function (a, b) { return bySize(b, a) || byName(a, b); };
      case 'size-asc': return function (a, b) { return bySize(a, b) || byName(a, b); };
      default: return function (a, b) { return byDate(b, a); };
    }
  }

  /**
   * Flat list of sidebar rows, depth-first, folders before documents (A→Z), documents keeping their order.
   * With a query only matching documents show, inside their (force-opened) ancestor folders.
   * @param {Set|Object} open map/set of expanded folder ids
   * @param {string} [sort] one of SORTS (default 'date'); folders follow the name order, A→Z unless 'name-desc'
   * @returns {{type:'folder'|'doc', depth:number, folder?:object, doc?:object, count?:number, open?:boolean}[]}
   */
  /** True when `target` is `docId` itself or sits somewhere below it (nesting `docId` there would loop). */
  function isDocInside(idx, docId, target) {
    var cur = target;
    var hops = 0;
    var parents = idx.parents || {};
    while (cur && hops++ < 1000) {
      if (cur === docId) return true;
      cur = parents[cur];
    }
    return false;
  }

  /** `docId` plus every document nested (at any depth) under it. */
  function docWithKids(idx, docId) {
    var out = [docId];
    Object.keys(idx.parents || {}).forEach(function (k) {
      if (k !== docId && isDocInside(idx, docId, k)) out.push(k);
    });
    return out;
  }

  /** Folder `id` plus all its sub-folders (ids). */
  function folderWithSubs(idx, id) {
    return idx.folders.filter(function (f) { return isInsideFolder(idx, id, f.id); }).map(function (f) { return f.id; });
  }

  /** Documents (ids) filed in the given folders, with the documents nested under them. */
  function docsInFolders(idx, folderIds) {
    var set = {};
    folderIds.forEach(function (f) { set[f] = true; });
    var out = [];
    Object.keys(idx.docs).forEach(function (k) {
      if (set[idx.docs[k]]) docWithKids(idx, k).forEach(function (x) { out.push(x); });
    });
    return out;
  }

  /** Marks a document (and what is nested under it) archived: hidden from the list, nothing deleted. */
  function archiveDocIn(idx, docId) {
    idx.archived = idx.archived || {};
    docWithKids(idx, docId).forEach(function (k) { idx.archived[k] = true; });
    return idx;
  }

  function restoreDocIn(idx, docId) {
    idx.archived = idx.archived || {};
    docWithKids(idx, docId).forEach(function (k) { delete idx.archived[k]; });
    return idx;
  }

  /**
   * Archives a folder. With `withContent` its sub-folders, documents and nested documents are archived too;
   * otherwise they move up to its parent and stay visible.
   */
  function archiveFolderIn(idx, id, withContent) {
    var f = folderById(idx, id);
    if (!f) return idx;
    idx.archived = idx.archived || {};
    if (withContent) {
      var ids = folderWithSubs(idx, id);
      docsInFolders(idx, ids).forEach(function (k) { idx.archived[k] = true; });
      idx.folders.forEach(function (x) { if (ids.indexOf(x.id) >= 0) x.archived = true; });
      return idx;
    }
    var up = f.parent || null;
    idx.folders.forEach(function (x) { if (x.parent === id) x.parent = up; });
    Object.keys(idx.docs).forEach(function (k) {
      if (idx.docs[k] !== id) return;
      if (up) idx.docs[k] = up;
      else delete idx.docs[k];
    });
    f.archived = true;
    return idx;
  }

  /** Restores a folder with everything archived inside it. */
  function restoreFolderIn(idx, id) {
    var ids = folderWithSubs(idx, id);
    docsInFolders(idx, ids).forEach(function (k) { delete (idx.archived || {})[k]; });
    idx.folders.forEach(function (x) { if (ids.indexOf(x.id) >= 0) delete x.archived; });
    return idx;
  }

  function folderRows(docs, idx, open, query, sort, showArchived) {
    var arch = idx.archived || {};
    if (!showArchived) docs = (docs || []).filter(function (d) { return !arch[d.id]; });
    var q = fold(String(query || '').trim());
    var isOpen = function (key, force) { return force || q ? true : !!(open && (open.has ? open.has(key) : open[key])); };
    var parents = idx.parents || {};
    var byId = {};
    (docs || []).forEach(function (d) { byId[d.id] = d; });
    // a document nests under its parent only when that parent exists and the chain does not loop back
    function parentOf(d) {
      var p = parents[d.id];
      return p && byId[p] && !isDocInside(idx, d.id, p) ? p : '';
    }
    var kids = {};
    var byFolder = {};
    (docs || []).forEach(function (d) {
      var p = parentOf(d);
      if (p) {
        (kids[p] = kids[p] || []).push(d);
        return;
      }
      var fid = idx.docs[d.id] && folderById(idx, idx.docs[d.id]) ? idx.docs[d.id] : '';
      (byFolder[fid] = byFolder[fid] || []).push(d);
    });
    function docCount(d) {
      return (kids[d.id] || []).reduce(function (n, k) { return n + docCount(k); }, 1);
    }
    function docMatches(d) {
      return fold(d.title).indexOf(q) >= 0 || (kids[d.id] || []).some(docMatches);
    }
    function countIn(fid) {
      var n = (byFolder[fid] || []).reduce(function (m, d) { return m + docCount(d); }, 0);
      idx.folders.forEach(function (f) { if (f.parent === fid && (showArchived || !f.archived)) n += countIn(f.id); });
      return n;
    }
    function matchesIn(fid) {
      if ((byFolder[fid] || []).some(docMatches)) return true;
      return idx.folders.some(function (f) { return f.parent === fid && matchesIn(f.id); });
    }
    var cmp = docComparator(sort);
    var dir = sort === 'name-desc' ? -1 : 1;
    var rows = [];
    function pushDoc(d, depth) {
      var ch = kids[d.id] || [];
      var o = ch.length > 0 && isOpen('doc:' + d.id);
      rows.push({ type: 'doc', depth: depth, doc: d, childCount: ch.length, open: o, archived: !!arch[d.id] });
      if (o) ch.slice().sort(cmp).forEach(function (k) { if (!q || docMatches(k)) pushDoc(k, depth + 1); });
    }
    function walk(fid, depth) {
      idx.folders
        .filter(function (f) { return (f.parent || '') === fid && (showArchived || !f.archived); })
        .sort(function (a, b) { return dir * (fold(a.name) < fold(b.name) ? -1 : fold(a.name) > fold(b.name) ? 1 : 0); })
        .forEach(function (f) {
          if (q && !matchesIn(f.id)) return;
          var o = isOpen(f.id);
          rows.push({ type: 'folder', depth: depth, folder: f, count: countIn(f.id), open: o, archived: !!f.archived });
          if (o) walk(f.id, depth + 1);
        });
      (byFolder[fid] || []).slice().sort(cmp).forEach(function (d) {
        if (q && !docMatches(d)) return;
        pushDoc(d, depth);
      });
    }
    walk('', 0);
    return rows;
  }

  /** Created when the Documents view opens on a board that has no document yet. */
  var DEFAULT_TITLE = 'Bienvenue';
  var DEFAULT_BODY = [
    '# Bienvenue dans vos documents',
    '',
    'Ce document a été créé automatiquement. Modifiez-le, renommez-le ou supprimez-le (menu **…**).',
    '',
    '## Quelques idées',
    '',
    '- `@` pour mentionner une personne',
    '- `@@` pour lier une tâche du tableau',
    '- `@@@` pour lier un autre document',
    '- `/` pour insérer un titre, une liste, une citation…',
    '',
    '- [ ] Écrire mon premier compte rendu',
  ].join('\n');

  global.DocsModel = {
    FOLDER_INDEX_NAME: FOLDER_INDEX_NAME,
    MAX_FOLDER_NAME: MAX_FOLDER_NAME,
    isFolderIndexName: isFolderIndexName,
    cleanFolderName: cleanFolderName,
    emptyIndex: emptyIndex,
    parseFolderIndex: parseFolderIndex,
    packFolderIndex: packFolderIndex,
    newFolderId: newFolderId,
    folderById: folderById,
    isInsideFolder: isInsideFolder,
    folderPath: folderPath,
    removeFolderFrom: removeFolderFrom,
    folderRows: folderRows,
    archiveDocIn: archiveDocIn,
    restoreDocIn: restoreDocIn,
    archiveFolderIn: archiveFolderIn,
    restoreFolderIn: restoreFolderIn,
    isDocInside: isDocInside,
    SORTS: SORTS,
    DEFAULT_TITLE: DEFAULT_TITLE,
    DEFAULT_BODY: DEFAULT_BODY,
    NAME_PREFIX: NAME_PREFIX,
    MAX_DESC: MAX_DESC,
    MAX_BODY: MAX_BODY,
    MAX_TITLE: MAX_TITLE,
    UNTITLED: UNTITLED,
    MENTION_TYPES: MENTION_TYPES,
    BLANK_MARK: BLANK_MARK,
    isDocName: isDocName,
    titleFromName: titleFromName,
    nameFromTitle: nameFromTitle,
    cleanTitle: cleanTitle,
    packDesc: packDesc,
    unpackDesc: unpackDesc,
    cleanId: cleanId,
    safeHref: safeHref,
    mdToHtml: mdToHtml,
    inlineToHtml: inlineToHtml,
    mentionHtml: mentionHtml,
    domToMd: domToMd,
    detectTrigger: detectTrigger,
    detectSlash: detectSlash,
    buildMentionIndex: buildMentionIndex,
    resolveMention: resolveMention,
    searchMentions: searchMentions,
    initialsOf: initialsOf,
    countWords: countWords,
    sizeInfo: sizeInfo,
    relativeTime: relativeTime,
    mentionsToPlain: mentionsToPlain,
    exportMarkdown: exportMarkdown,
    filterDocs: filterDocs,
    fold: fold,
  };
})(typeof window !== 'undefined' ? window : this);
