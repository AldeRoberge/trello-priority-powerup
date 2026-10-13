/**
 * Ghost text while typing. A short continuation from the assistant, accepted with Tab.
 * Knows the field (document, task name, document name, person, label) and a slim
 * snapshot of the board (tasks, documents, people, labels) plus whatever is on screen.
 *
 * Exposes window.AiComplete. UI modules stay free of fetch: this file calls PriorityAgent.
 *
 * Contents
 *   1. kinds + pure prompt / parse
 *   2. caret + field classification
 *   3. session (debounce, ghost, Tab)
 */
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 420;
  var HINT_TTL_MS = 60000;
  var KINDS = {
    document: true,
    'doc-name': true,
    'task-name': true,
    'person-name': true,
    tag: true,
    name: true
  };
  var KIND_GUIDE = {
    document:
      'Tu continues une phrase dans un document. Quelques mots, le même ton, la même langue.',
    'doc-name': 'Tu complètes le titre d\'un document. Court, comme un titre, pas une phrase.',
    'task-name':
      'Tu complètes le nom d\'une tâche. Court et concret, comme les autres tâches. Pas de point final.',
    'person-name':
      'Tu complètes un nom de personne. Si le début correspond à quelqu\'un du contexte, finis ce nom. Sinon, seulement la suite naturelle du prénom ou du nom, pas une phrase.',
    tag: 'Tu complètes le nom d\'une étiquette. Un ou deux mots, comme les autres étiquettes.',
    name: 'Tu complètes un nom court, dans le même style que les noms du contexte. Pas une phrase.'
  };
  var KIND_WORDS = {
    document: 12,
    'doc-name': 8,
    'task-name': 8,
    'person-name': 4,
    tag: 3,
    name: 6
  };
  var KIND_MAX = {
    document: 90,
    'doc-name': 60,
    'task-name': 70,
    'person-name': 40,
    tag: 24,
    name: 48
  };

  function fold(s) {
    return String(s || '').toLocaleLowerCase('fr-FR');
  }

  function isWordChar(ch) {
    return /[0-9A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(ch || '');
  }

  function clipList(list, n) {
    var out = [];
    var seen = Object.create(null);
    (list || []).forEach(function (item) {
      if (out.length >= n) return;
      var t = String(item || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (t.length > 80) t = t.slice(0, 80);
      var k = fold(t);
      if (seen[k]) return;
      seen[k] = true;
      out.push(t);
    });
    return out;
  }

  /**
   * @param {{kind:string, prefix?:string, before?:string, lineAfter?:string, after?:string}} snap
   * @param {{tasks?:string[], docs?:string[], people?:string[], tags?:string[], note?:string}} hints
   */
  function buildMessages(snap, hints) {
    hints = hints || {};
    var kind = snap && snap.kind;
    var guide = KIND_GUIDE[kind] || KIND_GUIDE.name;
    var system = [
      'Tu proposes la suite immédiate d\'un texte en cours de frappe.',
      guide,
      'Réponds uniquement par les caractères à insérer au curseur.',
      'Pas de guillemets, pas d\'explication, pas de préambule.',
      'Si le mot n\'est pas fini, complète-le sans espace devant.',
      'Si le mot est fini, commence par un espace quand il en faut un.',
      'Si rien d\'utile ne vient, réponds exactement: .',
      'N\'invente pas de faits. Préfère les noms déjà donnés dans le contexte.'
    ].join(' ');
    var lines = [];
    function add(label, list) {
      var items = clipList(list, 24);
      if (items.length) lines.push(label + ': ' + items.join(' | '));
    }
    add('Tâches', hints.tasks);
    add('Documents', hints.docs);
    add('Personnes', hints.people);
    add('Étiquettes', hints.tags);
    if (hints.note) lines.push(String(hints.note).replace(/\s+/g, ' ').trim().slice(0, 200));
    var prefix = String((snap && (snap.prefix || snap.before)) || '').slice(-1400);
    var user = (lines.length ? lines.join('\n') + '\n\n' : '') + 'Avant le curseur:\n' + prefix;
    var after = String((snap && (snap.lineAfter || snap.after)) || '');
    if (after.trim()) user += '\n\nAprès le curseur:\n' + after.slice(0, 280);
    return [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
  }

  function dropOverlap(before, suggestion) {
    var b = String(before || '');
    var s = String(suggestion || '');
    var lead = /^\s+/.exec(s);
    var leadStr = lead ? lead[0] : '';
    var body = s.slice(leadStr.length);
    var max = Math.min(b.length, body.length, 80);
    var i;
    for (i = max; i >= 3; i--) {
      if (fold(b.slice(-i)) === fold(body.slice(0, i))) return leadStr + body.slice(i);
    }
    return s;
  }

  /**
   * Model text -> characters to insert, or ''.
   * Keeps one leading space when the word before the caret is finished.
   */
  function parseCompletion(raw, before, kind) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (s.charAt(0) === '{') {
      try {
        var parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') {
          s = String(parsed.text || parsed.suite || parsed.completion || '').trim();
        }
      } catch (e) {
        /* not JSON */
      }
    }
    s = s.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
    if (
      (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
      (s.charAt(0) === '\u00ab' && s.charAt(s.length - 1) === '\u00bb')
    ) {
      s = s.slice(1, -1).trim();
    }
    s = s.split(/\r?\n/)[0];
    if (!s || s === '.' || s === '\u2026' || /^aucun\.?$/i.test(s) || /^rien\.?$/i.test(s)) return '';
    if (/^(je |voici |suggestion|compl[eé]tion|r[eé]ponse)/i.test(s)) return '';
    s = dropOverlap(before, s).replace(/\s+/g, ' ');
    var wantsSpace = /^\s/.test(s);
    s = s.trim();
    if (!s) return '';
    var ended = /\s$/.test(String(before || ''));
    if (ended) wantsSpace = false;
    if (wantsSpace) s = ' ' + s;
    var maxWords = KIND_WORDS[kind] || 8;
    var maxChars = KIND_MAX[kind] || 80;
    var lead = s.charAt(0) === ' ' ? ' ' : '';
    var body = lead ? s.slice(1) : s;
    var words = body.split(' ');
    if (words.length > maxWords) body = words.slice(0, maxWords).join(' ');
    s = lead + body;
    if (s.length > maxChars) s = s.slice(0, maxChars).replace(/\s+\S*$/, '');
    return s.trim() ? s : '';
  }

  function shouldRequest(snap) {
    if (!snap || !KINDS[snap.kind]) return false;
    if (snap.menuOpen) return false;
    var line = String(snap.lineBefore != null ? snap.lineBefore : snap.before || '');
    var after = String(snap.lineAfter != null ? snap.lineAfter : '');
    if (/\S/.test(after.replace(/[\u00a0\u200b]/g, ' '))) return false;
    if (/[@/][^\s]*$/.test(line)) return false;
    var trimmed = line.replace(/\u00a0/g, ' ').replace(/\s+$/, '');
    if (!trimmed) return false;
    if (snap.kind === 'document') return trimmed.length >= 6;
    return trimmed.length >= 2;
  }

  /* ── 2. Field + caret ────────────────────────────────────────────── */

  function classHas(el, name) {
    return !!(el && el.classList && typeof el.classList.contains === 'function' && el.classList.contains(name));
  }

  function attr(el, name) {
    if (!el || typeof el.getAttribute !== 'function') return '';
    return el.getAttribute(name) || '';
  }

  function closest(el, sel) {
    if (!el || typeof el.closest !== 'function') return null;
    try {
      return el.closest(sel);
    } catch (e) {
      return null;
    }
  }

  function fieldType(el) {
    return String((el && (el.type || attr(el, 'type'))) || '').toLowerCase();
  }

  function isEditableHost(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var c = attr(el, 'contenteditable');
    return c === 'true' || c === '';
  }

  function classifyField(el) {
    if (!el || el.disabled || el.readOnly) return '';
    if (attr(el, 'data-ai') === 'off') return '';
    var type = fieldType(el);
    if (
      type &&
      'hidden,password,checkbox,radio,file,color,range,date,time,datetime-local,number,button,submit'.indexOf(type) >= 0
    ) {
      return '';
    }
    if (
      classHas(el, 'agent-composer-input') ||
      classHas(el, 'dc-search-input') ||
      classHas(el, 'mm-filter') ||
      classHas(el, 'tb-filter')
    ) {
      return '';
    }
    var explicit = attr(el, 'data-ai-kind');
    if (KINDS[explicit]) return explicit;
    if (classHas(el, 'dc-editor')) return 'document';
    if (classHas(el, 'dc-title')) return 'doc-name';
    if (classHas(el, 'db-capture')) return 'task-name';
    if (
      classHas(el, 'nc-title') ||
      classHas(el, 'info-title-input') ||
      classHas(el, 'cq-title-input') ||
      classHas(el, 'gantt-rename-input') ||
      classHas(el, 'mm-newtask') ||
      (classHas(el, 'tb-input') && closest(el, 'td[data-key="name"]')) ||
      (classHas(el, 'mm-input') && attr(el, 'aria-label') === 'Nom')
    ) {
      return 'task-name';
    }
    if (
      classHas(el, 'tg-editor-label') ||
      classHas(el, 'dc-people-input') ||
      attr(el, 'id') === 'peopleEditName' ||
      attr(el, 'id') === 'profileDisplayName' ||
      closest(el, '.dc-people, [data-dc-field="people"]')
    ) {
      return 'person-name';
    }
    if (
      classHas(el, 'info-labels-color-picker-name-input') ||
      classHas(el, 'info-labels-search') ||
      classHas(el, 'dc-tag-input') ||
      classHas(el, 'en-alias-input') ||
      closest(el, '.dc-tags, [data-dc-field="tags"]')
    ) {
      return 'tag';
    }
    if (classHas(el, 'en-name') || attr(el, 'data-name') === '1') return 'name';
    var blob = fold(attr(el, 'aria-label') + ' ' + attr(el, 'placeholder'));
    if (/etiquette/.test(blob) || /\btag\b/.test(blob)) return 'tag';
    if (/personne/.test(blob) && /nom|ajouter/.test(blob)) return 'person-name';
    return '';
  }

  function menuOpen() {
    var box = global.document && document.querySelector && document.querySelector('.dc-suggest');
    return !!(box && !box.hidden);
  }

  function inCode(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return !!(el && el.closest && el.closest('pre, code'));
  }

  function blockOf(node, root) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    if (!el || !el.closest) return root;
    var block = el.closest('p, h1, h2, h3, li, pre, blockquote, div');
    if (!block || (root && root.contains && !root.contains(block))) return root;
    return block;
  }

  function rangeText(startNode, startOff, endNode, endOff) {
    var range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    return range.toString();
  }

  function readCaret(field) {
    if (!field) return null;
    if (!isEditableHost(field)) {
      var value = String(field.value || '');
      var start = field.selectionStart;
      var end = field.selectionEnd;
      if (start == null) start = value.length;
      if (end == null) end = start;
      if (start !== end) return null;
      var lineStart = value.lastIndexOf('\n', start - 1) + 1;
      var lineEnd = value.indexOf('\n', end);
      if (lineEnd < 0) lineEnd = value.length;
      return {
        before: value.slice(0, start),
        lineBefore: value.slice(lineStart, start),
        lineAfter: value.slice(end, lineEnd),
        prefix: value.slice(Math.max(0, start - 1400), start)
      };
    }
    var sel = global.getSelection && global.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    if (field.contains && !field.contains(range.endContainer)) return null;
    if (inCode(range.endContainer)) return null;
    var block = blockOf(range.endContainer, field);
    var lineBefore = '';
    var lineAfter = '';
    var before = '';
    try {
      lineBefore = rangeText(block, 0, range.endContainer, range.endOffset);
      var afterRange = document.createRange();
      afterRange.selectNodeContents(block);
      afterRange.setStart(range.endContainer, range.endOffset);
      lineAfter = afterRange.toString();
      before = rangeText(field, 0, range.endContainer, range.endOffset);
    } catch (e) {
      return null;
    }
    return {
      before: before,
      lineBefore: lineBefore,
      lineAfter: lineAfter,
      prefix: before.slice(-1400)
    };
  }

  function snapshot(field) {
    var kind = classifyField(field);
    if (!kind) return null;
    var caret = readCaret(field);
    if (!caret) return null;
    return {
      kind: kind,
      before: caret.before,
      prefix: caret.prefix,
      lineBefore: caret.lineBefore,
      lineAfter: caret.lineAfter,
      menuOpen: menuOpen()
    };
  }

  /* ── 3. Session ──────────────────────────────────────────────────── */

  var installed = false;
  var ghost = null;
  var bridge = null;
  var providerCache = { at: 0, value: null };
  var boardHints = { at: 0, tasks: [], docs: [], people: [], tags: [] };
  var providers = [];
  var cache = Object.create(null);
  var cacheOrder = [];
  var session = {
    el: null,
    gen: 0,
    suggestion: '',
    forLine: '',
    timer: 0,
    composing: false,
    pending: false
  };

  function addHints(fn, id) {
    if (typeof fn !== 'function') return;
    if (id) providers = providers.filter(function (p) { return p.id !== id; });
    providers.push({ id: id || '', fn: fn });
  }

  function texts(sel, limit) {
    var out = [];
    if (!global.document || !document.querySelectorAll) return out;
    var nodes;
    try {
      nodes = document.querySelectorAll(sel);
    } catch (e) {
      return out;
    }
    var i;
    for (i = 0; i < nodes.length && out.length < limit; i++) {
      var t = String(nodes[i].textContent || nodes[i].value || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 80) out.push(t);
    }
    return out;
  }

  function domHints() {
    var title = global.document && document.querySelector && document.querySelector('.dc-title');
    var note = title && title.value ? 'Document ouvert: ' + String(title.value).slice(0, 120) : '';
    return {
      tasks: texts('.gantt-task-name, .kb-title, td[data-key="name"], .mm-label, .dc-mention[data-m="task"]', 24),
      docs: texts('.dc-item-title, .dc-mention[data-m="doc"]', 24),
      people: texts('.tp-people-name, .tg-node-name, .dc-mention[data-m="person"]', 24),
      tags: texts('.info-label-name, .dc-tag, .en-typepill', 24),
      note: note
    };
  }

  function mergeHints() {
    var bag = { tasks: [], docs: [], people: [], tags: [], note: '' };
    function take(src) {
      if (!src) return;
      bag.tasks = bag.tasks.concat(src.tasks || []);
      bag.docs = bag.docs.concat(src.docs || []);
      bag.people = bag.people.concat(src.people || []);
      bag.tags = bag.tags.concat(src.tags || []);
      if (!bag.note && src.note) bag.note = src.note;
    }
    take(boardHints);
    providers.forEach(function (p) {
      try {
        take(p.fn());
      } catch (e) {
        /* a hint source must not block typing */
      }
    });
    take(domHints());
    bag.tasks = clipList(bag.tasks, 24);
    bag.docs = clipList(bag.docs, 24);
    bag.people = clipList(bag.people, 24);
    bag.tags = clipList(bag.tags, 24);
    return bag;
  }

  function getBridge() {
    return bridge;
  }

  /** Remember the page's Trello client without opening a second iframe. */
  function hookBridge() {
    var PT = global.PriorityTrello;
    if (!PT || PT.__aiBridge || typeof PT.initIframePage !== 'function') return;
    var orig = PT.initIframePage;
    PT.initIframePage = function (onReady) {
      return orig.call(this, function (t) {
        if (t) bridge = t;
        if (typeof onReady === 'function') return onReady(t);
      });
    };
    PT.__aiBridge = true;
  }

  function rememberList(key, list) {
    boardHints[key] = clipList(list, 40);
  }

  function refreshBoardHints() {
    if (Date.now() - boardHints.at < HINT_TTL_MS) return;
    var t = getBridge();
    if (!t) return;
    boardHints.at = Date.now();
    if (typeof t.cards === 'function') {
      Promise.resolve()
        .then(function () { return t.cards('name'); })
        .then(function (cards) {
          rememberList(
            'tasks',
            (cards || []).map(function (c) { return c && c.name; }).filter(function (n) {
              return n && n.indexOf('\uD83D\uDCC4') !== 0;
            })
          );
          rememberList(
            'docs',
            (cards || []).map(function (c) {
              var n = c && c.name;
              return n && n.indexOf('\uD83D\uDCC4') === 0 ? n.replace(/^\uD83D\uDCC4\s*/, '') : '';
            })
          );
        })
        .catch(function () {});
    }
    if (typeof t.board === 'function') {
      Promise.resolve()
        .then(function () { return t.board('members', 'labels'); })
        .then(function (b) {
          if (!b) return;
          rememberList('people', (b.members || []).map(function (m) { return m && (m.fullName || m.username); }));
          rememberList('tags', (b.labels || []).map(function (l) { return l && l.name; }));
        })
        .catch(function () {});
    }
    if (global.People && typeof global.People.load === 'function') {
      Promise.resolve()
        .then(function () { return global.People.load(t); })
        .then(function (dir) {
          var extra = ((dir && dir.people) || []).map(function (p) { return p && p.name; });
          boardHints.people = clipList(boardHints.people.concat(extra), 40);
        })
        .catch(function () {});
    }
  }

  function loadProvider() {
    var Agent = global.PriorityAgent;
    if (!Agent || typeof Agent.getProvider !== 'function') return Promise.resolve(null);
    if (providerCache.value && Date.now() - providerCache.at < HINT_TTL_MS) {
      return Promise.resolve(providerCache.value);
    }
    return Promise.resolve()
      .then(function () { return Agent.getProvider(getBridge()); })
      .then(function (p) {
        providerCache = { at: Date.now(), value: p };
        return p;
      })
      .catch(function () { return null; });
  }

  function cacheGet(key) {
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : undefined;
  }

  function cacheSet(key, value) {
    if (!Object.prototype.hasOwnProperty.call(cache, key)) cacheOrder.push(key);
    cache[key] = value;
    while (cacheOrder.length > 40) {
      var old = cacheOrder.shift();
      delete cache[old];
    }
  }

  function ensureGhost() {
    if (ghost || !global.document || !document.body) return ghost;
    ghost = document.createElement('div');
    ghost.className = 'ai-complete-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.hidden = true;
    document.body.appendChild(ghost);
    return ghost;
  }

  function hideGhost() {
    session.suggestion = '';
    session.forLine = '';
    if (ghost) {
      ghost.hidden = true;
      ghost.textContent = '';
    }
  }

  function caretPoint(el) {
    if (isEditableHost(el)) {
      var sel = global.getSelection && global.getSelection();
      if (!sel || !sel.rangeCount) return null;
      var range = sel.getRangeAt(0).cloneRange();
      range.collapse(false);
      var rects = range.getClientRects();
      var rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (!rect || (!rect.height && !rect.width)) return null;
      return { left: rect.left, top: rect.top, height: rect.height || 18 };
    }
    if (!global.getComputedStyle || !document.body) return null;
    var cs = global.getComputedStyle(el);
    var host = el.getBoundingClientRect();
    var mirror = document.createElement('div');
    [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
      'textTransform', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'boxSizing', 'lineHeight'
    ].forEach(function (p) {
      mirror.style[p] = cs[p];
    });
    mirror.style.position = 'fixed';
    mirror.style.left = host.left + 'px';
    mirror.style.top = host.top + 'px';
    mirror.style.width = el.clientWidth + 'px';
    mirror.style.height = el.clientHeight + 'px';
    mirror.style.overflow = 'hidden';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.whiteSpace = el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
    mirror.style.wordWrap = 'break-word';
    var start = el.selectionStart || 0;
    mirror.textContent = String(el.value || '').slice(0, start);
    var mark = document.createElement('span');
    mark.textContent = '\u200b';
    mirror.appendChild(mark);
    document.body.appendChild(mirror);
    mirror.scrollLeft = el.scrollLeft || 0;
    mirror.scrollTop = el.scrollTop || 0;
    var m = mark.getBoundingClientRect();
    document.body.removeChild(mirror);
    return { left: m.left, top: m.top, height: m.height || parseFloat(cs.lineHeight) || 18 };
  }

  function placeGhost(el, text) {
    var node = ensureGhost();
    if (!node || !text) {
      hideGhost();
      return;
    }
    var pt = caretPoint(el);
    if (!pt) {
      hideGhost();
      return;
    }
    var cs = global.getComputedStyle ? global.getComputedStyle(el) : null;
    if (cs) {
      node.style.fontFamily = cs.fontFamily;
      node.style.fontSize = cs.fontSize;
      node.style.fontWeight = cs.fontWeight;
      node.style.fontStyle = cs.fontStyle;
      node.style.letterSpacing = cs.letterSpacing;
    }
    node.style.left = pt.left + 'px';
    node.style.top = pt.top + 'px';
    node.style.lineHeight = pt.height + 'px';
    node.textContent = text;
    node.hidden = false;
  }

  function activeField() {
    var el = session.el;
    if (!el || !el.isConnected) return null;
    var active = document.activeElement;
    if (active === el) return el;
    if (el.contains && active && el.contains(active)) return el;
    return null;
  }

  function insertText(el, text) {
    if (!text) return;
    if (!isEditableHost(el)) {
      var start = el.selectionStart == null ? String(el.value || '').length : el.selectionStart;
      var end = el.selectionEnd == null ? start : el.selectionEnd;
      var max = el.maxLength;
      var chunk = text;
      if (max > 0) {
        var room = max - (String(el.value || '').length - (end - start));
        if (room <= 0) return;
        if (chunk.length > room) chunk = chunk.slice(0, room);
      }
      var next = String(el.value || '').slice(0, start) + chunk + String(el.value || '').slice(end);
      el.value = next;
      var pos = start + chunk.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch (e) {
        /* some input types */
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    el.focus();
    var ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch (e2) {
      ok = false;
    }
    if (ok) return;
    var sel = global.getSelection && global.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function accept() {
    var el = activeField();
    if (!el || !session.suggestion) return false;
    var snap = snapshot(el);
    if (!snap || snap.lineBefore !== session.forLine) return false;
    var text = session.suggestion;
    hideGhost();
    insertText(el, text);
    return true;
  }

  function applySuggestion(gen, forLine, text) {
    if (gen !== session.gen) return;
    var el = activeField();
    if (!el) return;
    var snap = snapshot(el);
    if (!snap || snap.lineBefore !== forLine || !shouldRequest(snap)) return;
    if (!text) {
      hideGhost();
      return;
    }
    session.suggestion = text;
    session.forLine = forLine;
    placeGhost(el, text);
  }

  function ask(gen, snap) {
    var key = snap.kind + '\n' + snap.lineBefore;
    var hit = cacheGet(key);
    if (hit !== undefined) {
      applySuggestion(gen, snap.lineBefore, hit);
      return;
    }
    var Agent = global.PriorityAgent;
    if (!Agent || typeof Agent.chatCompletions !== 'function') return;
    session.pending = true;
    loadProvider().then(function (provider) {
      if (gen !== session.gen) return;
      if (!provider || (typeof Agent.isConfigured === 'function' && !Agent.isConfigured(provider))) return;
      var messages = buildMessages(snap, mergeHints());
      return Agent.chatCompletions(provider, messages, {
        jsonMode: false,
        temperature: 0.2,
        max_tokens: 48
      }).then(function (res) {
        if (gen !== session.gen) return;
        var text = parseCompletion(res && res.content, snap.lineBefore, snap.kind);
        cacheSet(key, text);
        applySuggestion(gen, snap.lineBefore, text);
      });
    }).catch(function () {
      /* stay quiet while typing */
    }).then(function () {
      if (gen === session.gen) session.pending = false;
    });
  }

  function schedule() {
    clearTimeout(session.timer);
    hideGhost();
    var gen = ++session.gen;
    var el = activeField();
    if (!el || session.composing) return;
    session.el = el;
    var snap = snapshot(el);
    if (!snap || !shouldRequest(snap)) return;
    var forLine = snap.lineBefore;
    session.timer = setTimeout(function () {
      if (gen !== session.gen) return;
      var now = snapshot(activeField());
      if (!now || now.lineBefore !== forLine || !shouldRequest(now)) return;
      refreshBoardHints();
      ask(gen, now);
    }, DEBOUNCE_MS);
  }

  function onFocusIn(e) {
    var el = e.target;
    if (!classifyField(el)) {
      if (!session.el || (el !== session.el && !(session.el.contains && session.el.contains(el)))) {
        session.el = null;
        hideGhost();
      }
      return;
    }
    session.el = el;
    schedule();
  }

  function onFocusOut() {
    setTimeout(function () {
      if (!activeField()) hideGhost();
    }, 0);
  }

  function onKeyDown(e) {
    if (session.composing) return;
    if (e.key === 'Escape' && session.suggestion) {
      hideGhost();
      session.gen += 1;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (menuOpen() || !session.suggestion) return;
    if (accept()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onSelectionChange() {
    var el = activeField();
    if (!el || !session.suggestion) return;
    var snap = snapshot(el);
    if (!snap || snap.lineBefore !== session.forLine) hideGhost();
    else placeGhost(el, session.suggestion);
  }

  function install() {
    if (installed || !global.document || typeof document.addEventListener !== 'function') return;
    if (typeof global.getComputedStyle !== 'function') return;
    installed = true;
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('input', function (e) {
      if (session.composing) return;
      var el = e.target;
      if (el !== session.el && !(session.el && session.el.contains && session.el.contains(el))) {
        if (!classifyField(el)) return;
        session.el = el;
      }
      schedule();
    }, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('compositionstart', function () {
      session.composing = true;
      hideGhost();
    }, true);
    document.addEventListener('compositionend', function () {
      session.composing = false;
      schedule();
    }, true);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('scroll', function () {
      if (session.suggestion && session.el) placeGhost(session.el, session.suggestion);
    }, true);
    global.addEventListener('resize', function () {
      if (session.suggestion && session.el) placeGhost(session.el, session.suggestion);
    });
  }

  hookBridge();
  install();

  global.AiComplete = {
    KINDS: KINDS,
    DEBOUNCE_MS: DEBOUNCE_MS,
    classifyField: classifyField,
    shouldRequest: shouldRequest,
    buildMessages: buildMessages,
    parseCompletion: parseCompletion,
    dropOverlap: dropOverlap,
    addHints: addHints,
    setBridge: function (t) { bridge = t || null; },
    install: install,
    accept: accept
  };
})(typeof window !== 'undefined' ? window : this);
