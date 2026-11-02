/**
 * docs-model-core: part 2 of 2 (inlineToHtml).
 * Names are shared with the other parts through window.DocsModelParts (see docs-model-core.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.DocsModelParts = global.DocsModelParts || {});

  // from earlier parts (values)
  var ESCAPABLE = S.ESCAPABLE;
  var MENTION_TYPES = S.MENTION_TYPES;

  // from other parts (functions, resolved at call time)
  function alignAttr() { return S.alignAttr.apply(this, arguments); }
  function alignName() { return S.alignName.apply(this, arguments); }
  function cleanId() { return S.cleanId.apply(this, arguments); }
  function docLinkId() { return S.docLinkId.apply(this, arguments); }
  function esc() { return S.esc.apply(this, arguments); }
  function findBacktickRun() { return S.findBacktickRun.apply(this, arguments); }
  function findCloser() { return S.findCloser.apply(this, arguments); }
  function firstName() { return S.firstName.apply(this, arguments); }
  function isAlignLine() { return S.isAlignLine.apply(this, arguments); }
  function isInk() { return S.isInk.apply(this, arguments); }
  function isWordChar() { return S.isWordChar.apply(this, arguments); }
  function nearestInk() { return S.nearestInk.apply(this, arguments); }
  function parseColorSpan() { return S.parseColorSpan.apply(this, arguments); }
  function parseCssColor() { return S.parseCssColor.apply(this, arguments); }
  function parseLink() { return S.parseLink.apply(this, arguments); }
  function runLength() { return S.runLength.apply(this, arguments); }
  function safeHref() { return S.safeHref.apply(this, arguments); }

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
      if (c === '{') {
        var span = parseColorSpan(s, i);
        if (span) {
          var painted = inlineToHtml(span.inner);
          out += span.kind === 'h'
            ? '<mark data-c="' + span.color + '">' + painted + '</mark>'
            : '<span class="dc-ink" data-c="' + span.color + '">' + painted + '</span>';
          i = span.end;
          continue;
        }
      }
      if (c === '=') {
        var eq = runLength(s, i, '=');
        if (eq === 2 && s.charAt(i + 2) && !/\s/.test(s.charAt(i + 2))) {
          var hl = findCloser(s, i + 2, '==');
          if (hl > 0) {
            out += '<mark>' + inlineToHtml(s.slice(i + 2, hl)) + '</mark>';
            i = hl + 2;
            continue;
          }
        }
        out += esc(s.substr(i, eq));
        i += eq;
        continue;
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

  /**
   * A picture is its own line. `https` (or `http`) URLs are stored as-is; an uploaded file is a short
   * pointer at a Trello attachment, `upload:cardId/attId/file.jpg`, so the description stays small.
   * javascript:, data: and broken ids are not pictures.
   */
  function imageSrc(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s.indexOf('upload:') === 0) {
      var parts = s.slice(7).split('/');
      if (parts.length !== 3 || !cleanId(parts[0]) || !cleanId(parts[1])) return '';
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(parts[2])) return '';
      return 'upload:' + parts[0] + '/' + parts[1] + '/' + parts[2];
    }
    var href = safeHref(s);
    if (!href || !/^https?:\/\//i.test(href) || /[()\s<>"]/.test(href)) return '';
    return href;
  }

  function parseImageLine(line) {
    var s = String(line == null ? '' : line);
    if (/^ {4,}/.test(s)) return null;
    s = s.replace(/^ {0,3}/, '');
    if (s.slice(0, 2) !== '![') return null;
    var i = 2;
    var alt = '';
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\') {
        if (i + 1 >= s.length) return null;
        alt += s.charAt(i + 1);
        i += 2;
        continue;
      }
      if (c === ']') break;
      if (c === '\n' || c === '[') return null;
      alt += c;
      i++;
    }
    if (s.charAt(i) !== ']' || s.charAt(i + 1) !== '(') return null;
    var end = s.indexOf(')', i + 2);
    if (end < 0 || s.slice(end + 1).trim() !== '') return null;
    var src = imageSrc(s.slice(i + 2, end).trim());
    if (!src) return null;
    return { alt: alt.replace(/\s+/g, ' ').trim().slice(0, 200), src: src };
  }

  function imageMd(alt, src) {
    var a = String(alt || '').replace(/[\\\[\]]/g, '\\$&').replace(/\s+/g, ' ').trim().slice(0, 200);
    return '![' + a + '](' + src + ')';
  }

  function imageHtml(img) {
    var src = esc(img.src);
    var alt = esc(img.alt || '');
    var show = img.src.indexOf('upload:') === 0 ? '' : ' src="' + src + '"';
    return '<figure class="dc-image" contenteditable="false" data-src="' + src + '" data-alt="' + alt + '"><img alt="' + alt + '" draggable="false"' + show + '></figure>';
  }

  function indentOf(ws) {
    return ws.replace(/\t/g, '    ').length;
  }

  function isTableRow(line) {
    var s = String(line).replace(/^ {0,3}/, '');
    if (s.charAt(0) !== '|') return false;
    var pipes = 0;
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) === '\\') i++;
      else if (s.charAt(i) === '|') pipes++;
    }
    return pipes >= 2;
  }

  function splitCells(line) {
    var s = String(line).trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    var cells = [];
    var cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '\\' && s.charAt(i + 1) === '|') {
        cur += '|';
        i++;
        continue;
      }
      if (c === '|') {
        cells.push(cur.trim());
        cur = '';
        continue;
      }
      cur += c;
    }
    cells.push(cur.trim());
    return cells;
  }

  function isSepRow(line) {
    if (!isTableRow(line)) return false;
    var cells = splitCells(line);
    return cells.length > 0 && cells.every(function (p) { return /^:?-{3,}:?$/.test(p.trim()); });
  }

  function alignOfSep(cell) {
    var s = String(cell || '').trim();
    var left = s.charAt(0) === ':';
    var right = s.charAt(s.length - 1) === ':';
    if (left && right) return 'center';
    if (right) return 'right';
    return '';
  }

  function tableHtml(header, aligns, body) {
    var width = header.length;
    body.forEach(function (row) { if (row.length > width) width = row.length; });
    function cell(tag, text, align) {
      var inner = inlineToHtml(text || '');
      if (!inner) inner = '<br>';
      return '<' + tag + alignAttr(align) + '>' + inner + '</' + tag + '>';
    }
    function rowHtml(tag, row) {
      var cells = '';
      for (var i = 0; i < width; i++) cells += cell(tag, row[i] || '', aligns[i] || '');
      return '<tr>' + cells + '</tr>';
    }
    var bodyRows = body.length ? body : [[]];
    return '<table class="dc-table"><thead>' + rowHtml('th', header) + '</thead><tbody>' +
      bodyRows.map(function (row) { return rowHtml('td', row); }).join('') + '</tbody></table>';
  }

  function startsBlock(line) {
    return (
      RE_FENCE.test(line) ||
      RE_HR.test(line) ||
      RE_HEADING.test(line) ||
      RE_QUOTE.test(line) ||
      RE_LIST.test(line) ||
      isTableRow(line) ||
      line.trim() === BLANK_MARK ||
      !!parseImageLine(line)
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
      var imgLine = parseImageLine(line);
      if (imgLine) {
        out += imageHtml(imgLine);
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
        i++;
        var hAlign = i < lines.length && isAlignLine(lines[i]) ? alignName(lines[i++]) : '';
        out += '<h' + lvl + alignAttr(hAlign) + '>' + (htext || '<br>') + '</h' + lvl + '>';
        continue;
      }
      if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
        var header = splitCells(line);
        var aligns = splitCells(lines[i + 1]).map(alignOfSep);
        i += 2;
        var body = [];
        while (i < lines.length && isTableRow(lines[i]) && !isSepRow(lines[i])) body.push(splitCells(lines[i++]));
        out += tableHtml(header, aligns, body);
        continue;
      }
      if (RE_QUOTE.test(line)) {
        var q = [];
        while (i < lines.length && RE_QUOTE.test(lines[i])) {
          q.push(lines[i].replace(/^ {0,3}> ?/, ''));
          i++;
        }
        var callout = /^\[!(note|tip|warning)\]$/.exec((q[0] || '').trim());
        if (callout) q.shift();
        var qAttr = callout ? ' class="dc-callout" data-callout="' + callout[1] + '"' : '';
        out += '<blockquote' + qAttr + '>' + (blocksToHtml(q) || '<p><br></p>') + '</blockquote>';
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
      var pAlign = '';
      if (para.length > 1 && isAlignLine(para[para.length - 1])) pAlign = alignName(para.pop());
      out += '<p' + alignAttr(pAlign) + '>' + para.map(function (l) { return inlineToHtml(l.trim()); }).join('<br>') + '</p>';
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
    return s
      .replace(/[\\`*_\[\]~<+]/g, '\\$&')
      .replace(/==/g, '\\=\\=')
      .replace(/\{(?:c|h):|\{\/(?:c|h)\}/g, function (m) { return '\\' + m; });
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

  function styleColor(style, prop) {
    var re = prop === 'bg' ? /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/ : /(?:^|;)\s*color\s*:\s*([^;]+)/;
    var m = re.exec(style);
    return m ? m[1].trim() : '';
  }

  function marksOf(node, tag) {
    var style = (attr(node, 'style') || '').toLowerCase();
    var bold = tag === 'B' || tag === 'STRONG';
    var italic = tag === 'I' || tag === 'EM';
    var underline = tag === 'U';
    var strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL';
    var hi = '';
    var ink = '';
    if (tag === 'MARK') hi = isInk(attr(node, 'data-c')) ? attr(node, 'data-c') : 'yellow';
    if (hasClass(node, 'dc-ink') && isInk(attr(node, 'data-c'))) ink = attr(node, 'data-c');
    if (style) {
      if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(style)) bold = true;
      else if (/font-weight\s*:\s*(normal|lighter|[1-5]00)/.test(style)) bold = false;
      if (/font-style\s*:\s*(italic|oblique)/.test(style)) italic = true;
      else if (/font-style\s*:\s*normal/.test(style)) italic = false;
      if (tag !== 'A' && /text-decoration[^;]*underline/.test(style)) underline = true;
      if (/text-decoration[^;]*line-through/.test(style)) strike = true;
      if (!hi) hi = nearestInk(parseCssColor(styleColor(style, 'bg')), 'hi');
      if (!ink) ink = nearestInk(parseCssColor(styleColor(style, 'fg')), 'ink');
    }
    if (tag === 'FONT' && !ink) ink = nearestInk(parseCssColor(attr(node, 'color')), 'ink');
    return { bold: bold, italic: italic, underline: underline, strike: strike, hi: hi, ink: ink };
  }

  function wrapSpan(inner, kind, color) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    if (!m[2]) return inner;
    return m[1] + '{' + kind + ':' + color + '}' + m[2] + '{/' + kind + '}' + m[3];
  }

  function joinInline(parts) {
    var s = '';
    parts.forEach(function (p) {
      if (!p) return;
      // adjacent delimiter runs ("**a**" + "*b*") would fuse: a comment separator keeps them apart
      if (s && /[*~+_=]$/.test(s) && /^[*~+_=]/.test(p)) s += '<!---->';
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
      var full = String(attr(node, 'data-label') || textOf(node)).replace(/\s+/g, ' ').trim() || '?';
      var short = mtype === 'person' && attr(node, 'data-short') === '1';
      var label = short ? (firstName(full) || full) : full;
      if (id) return '[@' + label.replace(/[\\\[\]]/g, '\\$&') + '](' + mtype + ':' + id + (short ? ':short' : '') + ')';
      return escText(textOf(node));
    }
    var marks = marksOf(node, tag);
    var inner;
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') inner = codeSpan(textOf(node));
    else inner = inlineMd(kids(node));
    if (tag === 'A') {
      var lbl = inner.replace(/\s*\n\s*/g, ' ');
      var did = cleanId(attr(node, 'data-doc')) || docLinkId(attr(node, 'href'));
      if (did && lbl.trim()) inner = '[' + lbl + '](doc:' + did + ')';
      else {
        var href = safeHref(attr(node, 'href'));
        if (href && lbl.trim()) inner = '[' + lbl + '](' + encodeHref(href) + ')';
      }
    }
    if (marks.underline) inner = wrapMark(inner, '++');
    if (marks.strike) inner = wrapMark(inner, '~~');
    if (marks.italic) inner = wrapMark(inner, '*');
    if (marks.bold) inner = wrapMark(inner, '**');
    if (marks.hi) inner = marks.hi === 'yellow' ? wrapMark(inner, '==') : wrapSpan(inner, 'h', marks.hi);
    if (marks.ink) inner = wrapSpan(inner, 'c', marks.ink);
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

  function alignSuffix(node) {
    var a = attr(node, 'data-align');
    return a === 'center' || a === 'right' ? '\n<!--align:' + a + '-->' : '';
  }

  function cellText(cell) {
    var text = inlineMd(kids(cell)).replace(/\s*\n\s*/g, ' ').trim();
    if (text === BLANK_MARK) text = '';
    return text.replace(/\|/g, '\\|');
  }

  function tableMd(node, out) {
    var rows = [];
    function walk(n) {
      kids(n).forEach(function (k) {
        var t = tagOf(k);
        if (t === 'TR') {
          var cells = [];
          var aligns = [];
          kids(k).forEach(function (c) {
            if (tagOf(c) !== 'TD' && tagOf(c) !== 'TH') return;
            cells.push(cellText(c));
            var a = attr(c, 'data-align');
            aligns.push(a === 'center' || a === 'right' ? a : '');
          });
          if (cells.length) rows.push({ cells: cells, aligns: aligns });
        } else if (t === 'THEAD' || t === 'TBODY' || t === 'TFOOT') walk(k);
      });
    }
    walk(node);
    if (!rows.length) return;
    var width = 0;
    rows.forEach(function (r) { if (r.cells.length > width) width = r.cells.length; });
    function line(cells) {
      var c = cells.slice();
      while (c.length < width) c.push('');
      return '| ' + c.join(' | ') + ' |';
    }
    var parts = [];
    for (var i = 0; i < width; i++) {
      var a = rows[0].aligns[i];
      parts.push(a === 'center' ? ':---:' : a === 'right' ? '---:' : '---');
    }
    var lines = [line(rows[0].cells), '| ' + parts.join(' | ') + ' |'];
    for (var r = 1; r < rows.length; r++) lines.push(line(rows[r].cells));
    out.push(lines.join('\n'));
  }

  function blockMd(node, out) {
    var tag = tagOf(node);
    if (/^H[1-6]$/.test(tag)) {
      var level = Math.min(3, parseInt(tag.charAt(1), 10));
      var text = inlineMd(kids(node)).replace(/\s*\n\s*/g, ' ').trim();
      out.push(new Array(level + 1).join('#') + (text ? ' ' + text : '') + alignSuffix(node));
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
      var quoted = md ? md.split('\n').map(function (l) { return l ? '> ' + l : '>'; }) : ['>'];
      var kind = attr(node, 'data-callout');
      if (kind === 'note' || kind === 'tip' || kind === 'warning') quoted.unshift('> [!' + kind + ']');
      out.push(quoted.join('\n'));
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
    if (tag === 'FIGURE' && hasClass(node, 'dc-image')) {
      var figSrc = imageSrc(attr(node, 'data-src'));
      if (figSrc) out.push(imageMd(attr(node, 'data-alt') || '', figSrc));
      return;
    }
    if (tag === 'TABLE') {
      tableMd(node, out);
      return;
    }
    if ((tag === 'P' || tag === 'DIV' || tag === 'LI' || tag === 'TD' || tag === 'TH' || tag === 'DT' || tag === 'DD') && !hasBlockChild(node)) {
      var imgs = [];
      var rest = [];
      kids(node).forEach(function (k) {
        if (tagOf(k) === 'IMG') imgs.push(k);
        else rest.push(k);
      });
      var para = paragraphMd(rest);
      if (para !== null) out.push(para + ((tag === 'P' || tag === 'DIV') && para !== BLANK_MARK ? alignSuffix(node) : ''));
      else if (tag === 'P' && !imgs.length) out.push(BLANK_MARK);
      imgs.forEach(function (img) {
        var isrc = imageSrc(attr(img, 'src'));
        if (isrc) out.push(imageMd(attr(img, 'alt') || '', isrc));
      });
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
      if (node.nodeType === 1 && tagOf(node) === 'IMG') {
        flush();
        var imgSrc = imageSrc(attr(node, 'src'));
        if (imgSrc) out.push(imageMd(attr(node, 'alt') || '', imgSrc));
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

  var TASK_NAME_MAX = 200;
  var CLOSED_LIST = { completed: true, canceled: true, blocked: true };

  // exports
  S.BLANK_MARK = BLANK_MARK;
  S.BLOCK_TAGS = BLOCK_TAGS;
  S.CLOSED_LIST = CLOSED_LIST;
  S.RE_FENCE = RE_FENCE;
  S.RE_HEADING = RE_HEADING;
  S.RE_HR = RE_HR;
  S.RE_LIST = RE_LIST;
  S.RE_QUOTE = RE_QUOTE;
  S.SKIP_TAGS = SKIP_TAGS;
  S.SLASH_RE = SLASH_RE;
  S.TASK_NAME_MAX = TASK_NAME_MAX;
  S.TRIGGER_RE = TRIGGER_RE;
  S.alignOfSep = alignOfSep;
  S.alignSuffix = alignSuffix;
  S.attr = attr;
  S.blockMd = blockMd;
  S.blocksOf = blocksOf;
  S.blocksToHtml = blocksToHtml;
  S.cellText = cellText;
  S.codeSpan = codeSpan;
  S.detectSlash = detectSlash;
  S.detectTrigger = detectTrigger;
  S.domToMd = domToMd;
  S.encodeHref = encodeHref;
  S.escLineStart = escLineStart;
  S.escText = escText;
  S.hasBlockChild = hasBlockChild;
  S.hasClass = hasClass;
  S.imageHtml = imageHtml;
  S.imageMd = imageMd;
  S.imageSrc = imageSrc;
  S.indentOf = indentOf;
  S.inlineMd = inlineMd;
  S.inlineOne = inlineOne;
  S.inlineToHtml = inlineToHtml;
  S.isBlock = isBlock;
  S.isSepRow = isSepRow;
  S.isTableRow = isTableRow;
  S.joinInline = joinInline;
  S.kids = kids;
  S.listItem = listItem;
  S.listLines = listLines;
  S.marksOf = marksOf;
  S.mdToHtml = mdToHtml;
  S.paragraphMd = paragraphMd;
  S.parseImageLine = parseImageLine;
  S.preText = preText;
  S.renderListTree = renderListTree;
  S.splitCells = splitCells;
  S.startsBlock = startsBlock;
  S.styleColor = styleColor;
  S.tableHtml = tableHtml;
  S.tableMd = tableMd;
  S.tagOf = tagOf;
  S.textOf = textOf;
  S.wrapMark = wrapMark;
  S.wrapSpan = wrapSpan;
})(typeof window !== 'undefined' ? window : this);
