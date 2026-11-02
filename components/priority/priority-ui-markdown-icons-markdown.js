/**
 * priority-ui-markdown-icons: part 2 of 2 (renderMarkdownInline).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-markdown-icons.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var INFO_DESC_MAX_HEIGHT_PX = S.INFO_DESC_MAX_HEIGHT_PX;
  var INFO_DESC_MIN_HEIGHT_PX = S.INFO_DESC_MIN_HEIGHT_PX;
  var LABELS = S.LABELS;
  var MD_LINK_TITLE = S.MD_LINK_TITLE;
  var TIER_I_MAX = S.TIER_I_MAX;
  var TIER_I_SCHEME_MAPPED_MAX = S.TIER_I_SCHEME_MAPPED_MAX;
  var TRELLO_BADGE_COLOR_MUTED = S.TRELLO_BADGE_COLOR_MUTED;
  var DEFAULT_COLOR_SCHEME_KEY = S.DEFAULT_COLOR_SCHEME_KEY;

  // from other parts (functions, resolved at call time)
  function escapeHtml() { return S.escapeHtml.apply(this, arguments); }
  function firstCapture() { return S.firstCapture.apply(this, arguments); }
  function normalizePasteableMarkdownUrl() { return S.normalizePasteableMarkdownUrl.apply(this, arguments); }
  function renderMarkdownLinkHtml() { return S.renderMarkdownLinkHtml.apply(this, arguments); }
  function renderSmartCardHtml() { return S.renderSmartCardHtml.apply(this, arguments); }
  function safeMarkdownHref() { return S.safeMarkdownHref.apply(this, arguments); }
  function unescapeHtml() { return S.unescapeHtml.apply(this, arguments); }
  function priorityRelativeLuminance() { return S.priorityRelativeLuminance.apply(this, arguments); }

  function renderMarkdownInline(escaped) {
    var s = String(escaped || '');
    var slots = [];
    function stash(html) {
      slots.push(html);
      return '\u0000MD' + (slots.length - 1) + '\u0000';
    }
    // Preserve punctuation escaped by the rich editor before applying Markdown rules.
    s = s.replace(/\\([\\`*_[\]~#>+.!-])/g, function (_, literal) {
      return stash(literal);
    });
    s = s.replace(/`([^`\n]+)`/g, function (_, code) {
      return stash('<code class="info-md-code">' + code + '</code>');
    });
    s = s.replace(
      new RegExp('!\\[([^\\]]*)\\]\\(([^)\\s]+)' + MD_LINK_TITLE + '\\)', 'g'),
      function (_, alt, href) {
        var url = safeMarkdownHref(unescapeHtml(href));
        if (!url) return _;
        return stash(
          '<img class="info-md-img" src="' +
            escapeHtml(url) +
            '" alt="' +
            alt +
            '" loading="lazy">'
        );
      }
    );
    s = s.replace(
      new RegExp('\\[([^\\]]+)\\]\\(([^)\\s]+)' + MD_LINK_TITLE + '\\)', 'g'),
      function (_, label, href, t1, t2, t3, t4) {
        var url = safeMarkdownHref(unescapeHtml(href));
        if (!url) return _;
        var title = firstCapture(t1, t2, t3, t4);
        return stash(renderMarkdownLinkHtml(label, url, title) || _);
      }
    );
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    s = s.replace(
      /(^|[\s(])((?:https?:\/\/)[^\s<]+[^\s<.,;:!?)])/gi,
      function (_, lead, url) {
        var href = unescapeHtml(url);
        var card = renderSmartCardHtml(href, 'block');
        if (card) return lead + stash(card);
        return (
          lead +
          '<a class="info-md-link" href="' +
          escapeHtml(href) +
          '" target="_blank" rel="noopener noreferrer">' +
          url +
          '</a>'
        );
      }
    );
    s = s.replace(/\u0000MD(\d+)\u0000/g, function (_, idx) {
      return slots[Number(idx)] || '';
    });
    return s;
  }

  /**
   * Lightweight Markdown → HTML for card descriptions (GFM-ish, HTML-escaped).
   * Supports headings, lists, checkboxes, quotes, code, links, emphasis, HR.
   */
  function renderMarkdownToHtml(md) {
    var src = String(md == null ? '' : md).replace(/\r\n?/g, '\n');
    if (!src.trim()) return '';

    var fences = [];
    src = src.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, function (_, _lang, body) {
      var code = escapeHtml(String(body || '').replace(/^\n/, '').replace(/\n$/, ''));
      fences.push('<pre class="info-md-pre"><code>' + code + '</code></pre>');
      return '\n\u0000FENCE' + (fences.length - 1) + '\u0000\n';
    });

    var lines = src.split('\n');
    var out = [];
    var i = 0;

    function flushParagraph(buf) {
      if (!buf.length) return;
      out.push(
        '<p class="info-md-p">' +
          renderMarkdownInline(escapeHtml(buf.join('\n')).replace(/\n/g, '<br>')) +
          '</p>'
      );
      buf.length = 0;
    }

    while (i < lines.length) {
      var line = lines[i];
      var fenceMatch = /^\u0000FENCE(\d+)\u0000$/.exec(line);
      if (fenceMatch) {
        out.push(fences[Number(fenceMatch[1])] || '');
        i += 1;
        continue;
      }
      if (/^\s*$/.test(line)) {
        i += 1;
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr class="info-md-hr">');
        i += 1;
        continue;
      }
      var heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        var level = Math.min(6, heading[1].length);
        out.push(
          '<h' +
            level +
            ' class="info-md-h">' +
            renderMarkdownInline(escapeHtml(heading[2])) +
            '</h' +
            level +
            '>'
        );
        i += 1;
        continue;
      }
      if (/^>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ''));
          i += 1;
        }
        out.push(
          '<blockquote class="info-md-quote">' +
            renderMarkdownInline(escapeHtml(quote.join('\n')).replace(/\n/g, '<br>')) +
            '</blockquote>'
        );
        continue;
      }
      var listMatch = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (listMatch) {
        var ordered = /^\d+\./.test(listMatch[2]);
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + ' class="info-md-list">');
        while (i < lines.length) {
          var item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (!item) break;
          if (/^\d+\./.test(item[2]) !== ordered) break;
          var itemBody = item[3];
          var check = /^\[([ xX])\]\s+(.*)$/.exec(itemBody);
          if (check) {
            var checked = check[1] !== ' ';
            out.push(
              '<li class="info-md-li info-md-li--check">' +
                '<input type="checkbox" disabled' +
                (checked ? ' checked' : '') +
                '> ' +
                renderMarkdownInline(escapeHtml(check[2])) +
                '</li>'
            );
          } else {
            out.push(
              '<li class="info-md-li">' +
                renderMarkdownInline(escapeHtml(itemBody)) +
                '</li>'
            );
          }
          i += 1;
        }
        out.push('</' + tag + '>');
        continue;
      }
      var para = [];
      while (i < lines.length) {
        var next = lines[i];
        if (/^\s*$/.test(next)) break;
        if (/^\u0000FENCE\d+\u0000$/.test(next)) break;
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(next)) break;
        if (/^#{1,6}\s+/.test(next)) break;
        if (/^>\s?/.test(next)) break;
        if (/^(\s*)([-*+]|\d+\.)\s+/.test(next)) break;
        para.push(next);
        i += 1;
      }
      flushParagraph(para);
    }

    return out.join('');
  }

  function escapeRichMarkdownText(value) {
    return String(value == null ? '' : value).replace(/([\\`*_[\]~])/g, '\\$1');
  }

  function protectRichParagraphOpenings(value) {
    return String(value || '')
      .split('\n')
      .map(function (line) {
        if (/^\s*#{1,6}\s/.test(line) || /^\s*>\s?/.test(line)) {
          return line.replace(/^(\s*)([#>])/, '$1\\$2');
        }
        if (/^\s*[-+*]\s/.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
          return line.replace(/^(\s*)([-+*])/, '$1\\$2');
        }
        if (/^\s*\d+\.\s/.test(line)) {
          return line.replace(/^(\s*\d+)(\.)/, '$1\\$2');
        }
        return line;
      })
      .join('\n');
  }

  function richNodeName(node) {
    return String((node && (node.nodeName || node.tagName)) || '').toUpperCase();
  }

  function richAttr(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return '';
    return String(node.getAttribute(name) || '');
  }

  function richChildren(node) {
    if (!node || !node.childNodes) return [];
    return Array.prototype.slice.call(node.childNodes);
  }

  function richClassContains(node, name) {
    if (node && node.classList && typeof node.classList.contains === 'function') {
      return node.classList.contains(name);
    }
    return (' ' + richAttr(node, 'class') + ' ').indexOf(' ' + name + ' ') !== -1;
  }

  function markdownFromRichInline(node) {
    if (!node) return '';
    if (node.nodeType === 3 || richNodeName(node) === '#TEXT') {
      return escapeRichMarkdownText(node.nodeValue != null ? node.nodeValue : node.textContent);
    }
    if (node.nodeType === 8) return '';
    var tag = richNodeName(node);
    if (tag === 'BR') return '\n';
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'IFRAME') return '';

    if (tag === 'IMG') {
      // Smart-card decoration is not description content.
      if (
        richClassContains(node, 'info-md-smartcard-favicon') ||
        richClassContains(node, 'info-md-smartcard-image')
      ) {
        return '';
      }
      var src = safeMarkdownHref(richAttr(node, 'src'));
      if (!src) return '';
      var alt = richAttr(node, 'alt').replace(/[\[\]]/g, '');
      return '![' + alt + '](' + src + ')';
    }

    var inner = richChildren(node).map(markdownFromRichInline).join('');
    if (tag === 'STRONG' || tag === 'B') return inner ? '**' + inner + '**' : '';
    if (tag === 'EM' || tag === 'I') return inner ? '*' + inner + '*' : '';
    if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') {
      return inner ? '~~' + inner + '~~' : '';
    }
    if (tag === 'CODE' && richNodeName(node.parentNode) !== 'PRE') {
      return inner ? '`' + inner.replace(/`/g, '\\`') + '`' : '';
    }
    if (tag === 'A') {
      var href = safeMarkdownHref(richAttr(node, 'data-smart-url') || richAttr(node, 'href'));
      if (!href) return inner;
      var mode = richAttr(node, 'data-smart-mode');
      if (mode === 'block' || mode === 'inline') {
        return '[' + href + '](' + href + ' "smartCard-' + mode + '")';
      }
      return '[' + (inner || href) + '](' + href + ')';
    }
    return inner;
  }

  function richListItemMarkdown(node, ordered) {
    var checked = null;
    var body = '';
    richChildren(node).forEach(function (child) {
      if (richNodeName(child) === 'INPUT' && richAttr(child, 'type').toLowerCase() === 'checkbox') {
        checked =
          !!child.checked ||
          richAttr(child, 'checked') === 'checked' ||
          richAttr(child, 'checked') === 'true';
        return;
      }
      if (richNodeName(child) === 'UL' || richNodeName(child) === 'OL') return;
      body += markdownFromRichInline(child);
    });
    body = body.replace(/^\s+|\s+$/g, '');
    var prefix = ordered ? '1. ' : '- ';
    if (checked !== null) prefix += checked ? '[x] ' : '[ ] ';
    return prefix + body;
  }

  function markdownFromRichBlock(node) {
    if (!node) return '';
    if (node.nodeType === 3 || richNodeName(node) === '#TEXT') {
      return escapeRichMarkdownText(node.nodeValue != null ? node.nodeValue : node.textContent);
    }
    var tag = richNodeName(node);
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'IFRAME') return '';
    if (/^H[1-6]$/.test(tag)) {
      return Array(Number(tag.charAt(1)) + 1).join('#') + ' ' + markdownFromRichInline(node);
    }
    if (tag === 'P' || tag === 'DIV') {
      return protectRichParagraphOpenings(markdownFromRichInline(node));
    }
    if (tag === 'BLOCKQUOTE') {
      return markdownFromRichInline(node)
        .split('\n')
        .map(function (line) {
          return '> ' + line;
        })
        .join('\n');
    }
    if (tag === 'PRE') {
      var code = node.textContent == null ? '' : String(node.textContent);
      return '```\n' + code.replace(/\n$/, '') + '\n```';
    }
    if (tag === 'HR') return '---';
    if (tag === 'UL' || tag === 'OL') {
      var ordered = tag === 'OL';
      return richChildren(node)
        .filter(function (child) {
          return richNodeName(child) === 'LI';
        })
        .map(function (child) {
          return richListItemMarkdown(child, ordered);
        })
        .join('\n');
    }
    return markdownFromRichInline(node);
  }

  /**
   * Convert the supported contenteditable DOM back to Trello Markdown.
   * Unknown wrappers are flattened; unsafe elements and URL schemes are dropped.
   */
  function markdownFromRichRoot(root) {
    if (!root) return '';
    return richChildren(root)
      .map(markdownFromRichBlock)
      .filter(function (part) {
        return String(part).trim().length > 0;
      })
      .join('\n\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  var MD_HEADING_PREFIX_RE = /^(#{1,6})\s+/;
  var MD_CHECKLIST_PREFIX_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;
  var MD_UL_PREFIX_RE = /^(\s*)([-*+])\s+(?!\[([ xX])\]\s)/;
  var MD_OL_PREFIX_RE = /^(\s*)(\d+)\.\s+/;

  function stripMarkdownLinePrefix(line) {
    var s = String(line == null ? '' : line);
    s = s.replace(MD_HEADING_PREFIX_RE, '');
    s = s.replace(MD_CHECKLIST_PREFIX_RE, '');
    s = s.replace(MD_OL_PREFIX_RE, '');
    s = s.replace(MD_UL_PREFIX_RE, '');
    return s;
  }

  function detectMarkdownLineFormat(line) {
    var s = String(line == null ? '' : line);
    var heading = /^(#{1,6})\s+/.exec(s);
    if (heading) return 'h' + heading[1].length;
    if (MD_CHECKLIST_PREFIX_RE.test(s)) return 'checklist';
    if (MD_OL_PREFIX_RE.test(s)) return 'ol';
    if (MD_UL_PREFIX_RE.test(s)) return 'ul';
    return 'normal';
  }

  /** True when flanking markers are a clean pair (avoids treating ** as italic *). */
  function markdownMarkersAreExclusive(value, start, end, open, close) {
    if (open !== '*' || close !== '*') return true;
    if (start > open.length && value.charAt(start - open.length - 1) === '*') return false;
    if (end + close.length < value.length && value.charAt(end + close.length) === '*') {
      return false;
    }
    return true;
  }

  /**
   * Wrap or unwrap a selection with inline markdown markers.
   * @returns {{ value: string, start: number, end: number }}
   */
  function wrapMarkdownInlineSelection(state, open, close) {
    close = close == null ? open : close;
    var value = String(state && state.value != null ? state.value : '');
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Number(state && state.end) || 0);
    if (end > value.length) end = value.length;
    if (start > value.length) start = value.length;
    var selected = value.slice(start, end);
    var openLen = open.length;
    var closeLen = close.length;

    if (
      start >= openLen &&
      value.slice(start - openLen, start) === open &&
      value.slice(end, end + closeLen) === close &&
      markdownMarkersAreExclusive(value, start, end, open, close)
    ) {
      return {
        value: value.slice(0, start - openLen) + selected + value.slice(end + closeLen),
        start: start - openLen,
        end: end - openLen
      };
    }

    if (
      selected.length >= openLen + closeLen &&
      selected.slice(0, openLen) === open &&
      selected.slice(selected.length - closeLen) === close &&
      !(
        open === '*' &&
        close === '*' &&
        selected.length >= 4 &&
        selected.charAt(1) === '*' &&
        selected.charAt(selected.length - 2) === '*'
      )
    ) {
      var inner = selected.slice(openLen, selected.length - closeLen);
      return {
        value: value.slice(0, start) + inner + value.slice(end),
        start: start,
        end: start + inner.length
      };
    }

    return {
      value: value.slice(0, start) + open + selected + close + value.slice(end),
      start: start + openLen,
      end: start + openLen + selected.length
    };
  }

  /**
   * Turn a non-empty markdown selection into [label](url).
   * @returns {{ value: string, start: number, end: number } | null}
   */
  function linkMarkdownSelection(state, url) {
    var href = normalizePasteableMarkdownUrl(url) || safeMarkdownHref(url);
    if (!href) return null;
    var value = String(state && state.value != null ? state.value : '');
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Number(state && state.end) || 0);
    if (end > value.length) end = value.length;
    if (start > value.length) start = value.length;
    if (start === end) return null;
    var label = value.slice(start, end).replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    var insertion = '[' + label + '](' + href + ')';
    return {
      value: value.slice(0, start) + insertion + value.slice(end),
      start: start + 1,
      end: start + 1 + label.length
    };
  }

  /**
   * Apply a block-level markdown format to the lines covering the selection.
   * kind: normal | h1..h6 | checklist | ul | ol
   * @returns {{ value: string, start: number, end: number }}
   */
  function applyMarkdownBlockFormat(state, kind) {
    var value = String(state && state.value != null ? state.value : '');
    var start = Math.max(0, Number(state && state.start) || 0);
    var end = Math.max(start, Number(state && state.end) || 0);
    if (end > value.length) end = value.length;
    if (start > value.length) start = value.length;

    var blockStart = value.lastIndexOf('\n', start - 1) + 1;
    var blockEnd = value.indexOf('\n', end);
    if (blockEnd === -1) blockEnd = value.length;

    var block = value.slice(blockStart, blockEnd);
    var lines = block.length ? block.split('\n') : [''];
    var target = String(kind || 'normal');

    var nonEmpty = lines.filter(function (line) {
      return String(line).trim().length > 0;
    });
    var allMatch =
      nonEmpty.length > 0 &&
      nonEmpty.every(function (line) {
        return detectMarkdownLineFormat(line) === target;
      });

    var nextLines = lines.map(function (line) {
      var body = stripMarkdownLinePrefix(line);
      if (allMatch && target !== 'normal') {
        return body;
      }
      if (target === 'normal') return body;
      if (/^h[1-6]$/.test(target)) {
        var level = Number(target.charAt(1));
        return Array(level + 1).join('#') + ' ' + body;
      }
      if (target === 'checklist') return '- [ ] ' + body;
      if (target === 'ul') return '- ' + body;
      if (target === 'ol') return '1. ' + body;
      return line;
    });

    var nextBlock = nextLines.join('\n');
    var nextValue = value.slice(0, blockStart) + nextBlock + value.slice(blockEnd);
    return {
      value: nextValue,
      start: blockStart,
      end: blockStart + nextBlock.length
    };
  }

  function applyMarkdownEditToTextarea(textarea, next) {
    if (!textarea || !next) return;
    textarea.value = next.value;
    try {
      textarea.setSelectionRange(next.start, next.end);
    } catch (e) {
      /* ignore */
    }
    if (typeof InputEvent === 'function') {
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } else {
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function syncExpandableSurfaceHeight(el, options) {
    if (!el) return;
    options = options || {};
    var maxHeight =
      typeof options.maxHeight === 'number' ? options.maxHeight : INFO_DESC_MAX_HEIGHT_PX;
    var minHeight =
      typeof options.minHeight === 'number' ? options.minHeight : INFO_DESC_MIN_HEIGHT_PX;
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    var next = Math.max(el.scrollHeight, minHeight);
    if (next > maxHeight) {
      el.style.height = maxHeight + 'px';
      el.style.overflowY = 'auto';
    } else {
      el.style.height = next + 'px';
      el.style.overflowY = 'hidden';
    }
  }

  var KEYWORDS = {
    time: 'Pression relative : blocages, dépendances et risque si repoussée.',
    blocking: 'Effet sur l\'équipe : blocages, dépendances et ralentissement du travail.',
    impact: 'Combien la t\u00e2che compte : valeur, port\u00e9e et levier (0\u201310).',
    ease: 'Co\u00fbt d\'ex\u00e9cution : temps, gens, argent, charge mentale (0\u201310, plus facile = plus haut).',
    empressement: 'Envie de terminer, ind\u00e9pendante de toute date.',
    urgency: 'Niveau d\'urgence d\u00e9riv\u00e9 (sortie) : Impact + \u00c9ch\u00e9ance + Empressement.'
  };

  var QUESTIONS = {
    time: 'Quelle pression pèse sur cette tâche?',
    blocking: 'Est-ce que quelque chose cesse de fonctionner si ce n\'est pas fait?',
    impact: 'Combien cette t\u00e2che compte-t-elle\u00a0?',
    ease: '\u00c0 quel point est-il facile de faire cette t\u00e2che\u00a0?',
    empressement: 'Quelle est votre envie de terminer cette t\u00e2che\u00a0?',
    urgency: 'À quel point est-ce urgent de faire cette tâche?'
  };

  function dimensionQuestion(key) {
    var entry = LABELS[key];
    if (entry && entry.popup && entry.popup.subtitle) return entry.popup.subtitle;
    return QUESTIONS[key] || '';
  }

  var PROPERTY_ICONS = {
    time: 'ti-clock',
    blocking: 'ti-barrier-block',
    impact: 'ti-target-arrow',
    ease: 'ti-gauge',
    empressement: 'ti-rocket',
    urgency: 'ti-flame'
  };

  // ── 3c. Color schemes (OKLab / OKLCH ramps) ─────────────────────────────
  // Perceptual helpers for Classique / Feu badge colors and heat matching.

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(1, v));
  }

  function rgbToOklab(rgb) {
    var r = srgbToLinear(rgb.r);
    var g = srgbToLinear(rgb.g);
    var b = srgbToLinear(rgb.b);
    var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    var l_ = Math.cbrt(l);
    var m_ = Math.cbrt(m);
    var s_ = Math.cbrt(s);
    return {
      L: 0.2104542553 * l_ + 0.7936177750 * m_ - 0.0040720468 * s_,
      a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    };
  }

  function oklabToRgb(oklab) {
    var l_ = oklab.L + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b;
    var m_ = oklab.L - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b;
    var s_ = oklab.L - 0.0894841775 * oklab.a - 1.2914855480 * oklab.b;
    var l = l_ * l_ * l_;
    var m = m_ * m_ * m_;
    var s = s_ * s_ * s_;
    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return {
      r: Math.round(linearToSrgb(r) * 255),
      g: Math.round(linearToSrgb(g) * 255),
      b: Math.round(linearToSrgb(b) * 255)
    };
  }

  function oklchToOklab(L, C, H) {
    var hr = H * Math.PI / 180;
    return { L: L, a: C * Math.cos(hr), b: C * Math.sin(hr) };
  }

  function oklchStopsToOklab(oklchStops) {
    return oklchStops.map(function (stop) {
      return oklchToOklab(stop[0], stop[1], stop[2]);
    });
  }

  function oklchStopsToHex(oklchStops) {
    return oklchStopsToOklab(oklchStops).map(function (lab) {
      return priorityRgbToHex(oklabToRgb(lab));
    });
  }

  function lerpOklab(a, b, t) {
    return {
      L: a.L + (b.L - a.L) * t,
      a: a.a + (b.a - a.a) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function oklabDistance(a, b) {
    var dL = a.L - b.L;
    var da = a.a - b.a;
    var db = a.b - b.b;
    return dL * dL + da * da + db * db;
  }

  function schemeTextOnLight(stops) {
    var darkest = stops[stops.length - 1];
    return priorityRelativeLuminance(priorityParseHex(darkest)) > 0.45 ? '#172B4D' : darkest;
  }

  function buildColorScheme(key, label, oklchStops, badgeColors) {
    var stops = oklchStopsToHex(oklchStops);
    return {
      key: key,
      label: label,
      oklchStops: oklchStops,
      oklabStops: oklchStopsToOklab(oklchStops),
      stops: stops,
      textOnLight: schemeTextOnLight(stops),
      badgeColors: badgeColors || null
    };
  }

  // Exact hex ramps (low → high priority). Classic restored from 4044ae3 / pre-multi-scheme era.
  function buildColorSchemeFromHex(key, label, hexStops, textOnLight, badgeColors) {
    var stops = hexStops.slice();
    var oklabStops = stops.map(function (hex) {
      return rgbToOklab(priorityParseHex(hex));
    });
    return {
      key: key,
      label: label,
      oklchStops: null,
      oklabStops: oklabStops,
      stops: stops,
      textOnLight: textOnLight || schemeTextOnLight(stops),
      badgeColors: badgeColors || null
    };
  }

  // Classic blue intensity map (tiers 0..6) — restored from single-palette era.
  var CLASSIC_TIER_TRELLO_BADGE_COLORS = {
    0: 'blue',
    1: 'blue',
    2: 'sky',
    3: 'sky',
    4: 'sky',
    5: TRELLO_BADGE_COLOR_MUTED,
    6: TRELLO_BADGE_COLOR_MUTED
  };

  // Feu: polychrome Trello colors (gray → yellow → orange → blue → red).
  var FIRE_TIER_TRELLO_BADGE_COLORS = {
    0: 'red',
    1: 'orange',
    2: 'yellow',
    3: 'blue',
    4: 'sky',
    5: TRELLO_BADGE_COLOR_MUTED,
    6: TRELLO_BADGE_COLOR_MUTED
  };

  // Exactly two schemes: Classique (default) + Feu.
  var COLOR_SCHEMES = {
    blue: buildColorSchemeFromHex(
      'blue',
      'Classique',
      ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#0C447C'],
      '#0C447C',
      CLASSIC_TIER_TRELLO_BADGE_COLORS
    ),
    fire: buildColorSchemeFromHex(
      'fire',
      'Feu',
      ['#E8EAED', '#F5E49A', '#FF9F1A', '#0079BF', '#EB5A46'],
      '#172B4D',
      FIRE_TIER_TRELLO_BADGE_COLORS
    )
  };

  var COLOR_SCHEME_OPTIONS = [
    { key: 'blue', label: COLOR_SCHEMES.blue.label, icon: 'ti-droplet' },
    { key: 'fire', label: COLOR_SCHEMES.fire.label, icon: 'ti-flame' }
  ];

  S.activeColorSchemeKey = DEFAULT_COLOR_SCHEME_KEY;
  S.activeColorStops = COLOR_SCHEMES.blue.stops.slice();
  S.activeOklabStops = COLOR_SCHEMES.blue.oklabStops.slice();
  S.activeTextOnLight = COLOR_SCHEMES.blue.textOnLight;
  var PRIORITY_TEXT_ON_DARK = '#ffffff';
  // Backward-compatible alias for the default classic palette.
  var PRIORITY_BLUE_STOPS = COLOR_SCHEMES.blue.stops;

  // Trello card badges accept named colors only — map tier seg colors to the nearest.
  var TRELLO_BADGE_COLOR_HEX = {
    blue: '#0079BF',
    green: '#61BD4F',
    orange: '#FF9F1A',
    red: '#EB5A46',
    yellow: '#F2D600',
    purple: '#C377E0',
    pink: '#FF78CB',
    sky: '#00C2E0',
    lime: '#51E898'
  };
  TRELLO_BADGE_COLOR_HEX[TRELLO_BADGE_COLOR_MUTED] = '#B3BAC5';
  var TRELLO_BADGE_COLOR_NAMES = Object.keys(TRELLO_BADGE_COLOR_HEX);

  function defaultTierTrelloBadgeColors() {
    return Object.assign({}, CLASSIC_TIER_TRELLO_BADGE_COLORS);
  }
  S.TIER_TRELLO_BADGE_COLORS = defaultTierTrelloBadgeColors();

  function nearestTrelloBadgeColorName(segHex, avoidName) {
    var target = rgbToOklab(priorityParseHex(segHex));
    var ranked = TRELLO_BADGE_COLOR_NAMES.map(function (name) {
      return {
        name: name,
        dist: oklabDistance(target, rgbToOklab(priorityParseHex(TRELLO_BADGE_COLOR_HEX[name])))
      };
    }).sort(function (a, b) {
      return a.dist - b.dist;
    });
    for (var i = 0; i < ranked.length; i++) {
      if (!avoidName || ranked[i].name !== avoidName) return ranked[i].name;
    }
    return ranked[0].name;
  }

  function copyTierBadgeColors(source) {
    var out = {};
    for (var i = 0; i <= TIER_I_MAX; i++) {
      out[i] = source[i] || TRELLO_BADGE_COLOR_MUTED;
    }
    return out;
  }

  function rebuildTrelloBadgeColors() {
    var scheme = COLOR_SCHEMES[S.activeColorSchemeKey];
    if (scheme && scheme.badgeColors) {
      S.TIER_TRELLO_BADGE_COLORS = copyTierBadgeColors(scheme.badgeColors);
      return;
    }
    if (!S.TIER_TRELLO_BADGE_COLORS || typeof S.TIER_TRELLO_BADGE_COLORS !== 'object') {
      S.TIER_TRELLO_BADGE_COLORS = defaultTierTrelloBadgeColors();
    }
    for (var i = 0; i <= TIER_I_SCHEME_MAPPED_MAX; i++) {
      var tier = S.TIERS[i];
      var avoid = i > 0 ? S.TIER_TRELLO_BADGE_COLORS[i - 1] : null;
      S.TIER_TRELLO_BADGE_COLORS[i] = nearestTrelloBadgeColorName(
        tier && tier.seg ? tier.seg : S.activeColorStops[0],
        avoid
      );
    }
    for (var j = TIER_I_SCHEME_MAPPED_MAX + 1; j <= TIER_I_MAX; j++) {
      S.TIER_TRELLO_BADGE_COLORS[j] = TRELLO_BADGE_COLOR_MUTED;
    }
  }

  function priorityParseHex(hex) {
    var h = String(hex).replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function priorityRgbToHex(rgb) {
    function byte(n) {
      var s = Math.max(0, Math.min(255, Math.round(n))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + byte(rgb.r) + byte(rgb.g) + byte(rgb.b);
  }

  // exports
  S.CLASSIC_TIER_TRELLO_BADGE_COLORS = CLASSIC_TIER_TRELLO_BADGE_COLORS;
  S.COLOR_SCHEMES = COLOR_SCHEMES;
  S.COLOR_SCHEME_OPTIONS = COLOR_SCHEME_OPTIONS;
  S.FIRE_TIER_TRELLO_BADGE_COLORS = FIRE_TIER_TRELLO_BADGE_COLORS;
  S.KEYWORDS = KEYWORDS;
  S.MD_CHECKLIST_PREFIX_RE = MD_CHECKLIST_PREFIX_RE;
  S.MD_HEADING_PREFIX_RE = MD_HEADING_PREFIX_RE;
  S.MD_OL_PREFIX_RE = MD_OL_PREFIX_RE;
  S.MD_UL_PREFIX_RE = MD_UL_PREFIX_RE;
  S.PRIORITY_BLUE_STOPS = PRIORITY_BLUE_STOPS;
  S.PRIORITY_TEXT_ON_DARK = PRIORITY_TEXT_ON_DARK;
  S.PROPERTY_ICONS = PROPERTY_ICONS;
  S.QUESTIONS = QUESTIONS;
  S.TRELLO_BADGE_COLOR_HEX = TRELLO_BADGE_COLOR_HEX;
  S.TRELLO_BADGE_COLOR_NAMES = TRELLO_BADGE_COLOR_NAMES;
  S.applyMarkdownBlockFormat = applyMarkdownBlockFormat;
  S.applyMarkdownEditToTextarea = applyMarkdownEditToTextarea;
  S.buildColorScheme = buildColorScheme;
  S.buildColorSchemeFromHex = buildColorSchemeFromHex;
  S.copyTierBadgeColors = copyTierBadgeColors;
  S.defaultTierTrelloBadgeColors = defaultTierTrelloBadgeColors;
  S.detectMarkdownLineFormat = detectMarkdownLineFormat;
  S.dimensionQuestion = dimensionQuestion;
  S.escapeRichMarkdownText = escapeRichMarkdownText;
  S.lerpOklab = lerpOklab;
  S.linearToSrgb = linearToSrgb;
  S.linkMarkdownSelection = linkMarkdownSelection;
  S.markdownFromRichBlock = markdownFromRichBlock;
  S.markdownFromRichInline = markdownFromRichInline;
  S.markdownFromRichRoot = markdownFromRichRoot;
  S.markdownMarkersAreExclusive = markdownMarkersAreExclusive;
  S.nearestTrelloBadgeColorName = nearestTrelloBadgeColorName;
  S.oklabDistance = oklabDistance;
  S.oklabToRgb = oklabToRgb;
  S.oklchStopsToHex = oklchStopsToHex;
  S.oklchStopsToOklab = oklchStopsToOklab;
  S.oklchToOklab = oklchToOklab;
  S.priorityParseHex = priorityParseHex;
  S.priorityRgbToHex = priorityRgbToHex;
  S.protectRichParagraphOpenings = protectRichParagraphOpenings;
  S.rebuildTrelloBadgeColors = rebuildTrelloBadgeColors;
  S.renderMarkdownInline = renderMarkdownInline;
  S.renderMarkdownToHtml = renderMarkdownToHtml;
  S.rgbToOklab = rgbToOklab;
  S.richAttr = richAttr;
  S.richChildren = richChildren;
  S.richClassContains = richClassContains;
  S.richListItemMarkdown = richListItemMarkdown;
  S.richNodeName = richNodeName;
  S.schemeTextOnLight = schemeTextOnLight;
  S.srgbToLinear = srgbToLinear;
  S.stripMarkdownLinePrefix = stripMarkdownLinePrefix;
  S.syncExpandableSurfaceHeight = syncExpandableSurfaceHeight;
  S.wrapMarkdownInlineSelection = wrapMarkdownInlineSelection;
})(typeof window !== 'undefined' ? window : this);
