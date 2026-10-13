/**
 * Ghost text while typing. The next few words of the same sentence, accepted with Tab.
 * Knows the field (document, task name, document name, person, label, or any other
 * text you are writing) and a slim snapshot of the board plus whatever is on screen.
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

  var DEBOUNCE_MS = 280;
  var HINT_TTL_MS = 60000;
  var KINDS = {
    document: true,
    'doc-name': true,
    'task-name': true,
    'person-name': true,
    tag: true,
    name: true,
    text: true
  };
  var KIND_GUIDE = {
    document:
      'Tu continues la phrase dans un document. Quelques mots, le même sujet, le même ton, la même langue.',
    'doc-name': 'Tu complètes le titre d\'un document. Court, comme un titre, pas une phrase.',
    'task-name':
      'Tu complètes le nom d\'une tâche. Court et concret, comme les autres tâches. Pas de point final.',
    'person-name':
      'Tu complètes un nom de personne. Si le début correspond à quelqu\'un du contexte, finis ce nom. Sinon, seulement la suite naturelle du prénom ou du nom, pas une phrase.',
    tag: 'Tu complètes le nom d\'une étiquette. Un ou deux mots, comme les autres étiquettes.',
    name: 'Tu complètes un nom court, dans le même style que les noms du contexte. Pas une phrase.',
    text: 'Tu continues la phrase en cours. Quelques mots, le même sujet, le même ton, la même langue.'
  };
  var KIND_WORDS = {
    document: 8,
    'doc-name': 8,
    'task-name': 8,
    'person-name': 4,
    tag: 3,
    name: 6,
    text: 12
  };
  var KIND_MAX = {
    document: 90,
    'doc-name': 60,
    'task-name': 70,
    'person-name': 40,
    tag: 24,
    name: 48,
    text: 140
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
      'Tu continues les mots déjà tapés, comme une saisie automatique.',
      'Tu ne réponds pas à une question écrite dans le texte.',
      'Tu n\'ajoutes pas une réponse, ni le mot réponse, ni answer.',
      guide,
      'Réponds uniquement par les caractères à insérer au curseur.',
      'Pas de guillemets, pas d\'explication, pas de préambule.',
      'Si le mot n\'est pas fini, complète-le sans espace devant.',
      'Si le mot est fini, commence par un espace quand il en faut un.',
      'Si la suite n\'est pas naturelle, réponds exactement: .',
      'N\'invente pas de faits. Un nom du contexte ne s\'ajoute que s\'il a déjà sa place dans la phrase.',
      'Donne jusqu\'à 4 suites, une par ligne, sans numéro ni puce.',
      'La première est la plus probable. Les autres continuent la même phrase avec d\'autres mots, pas un autre sujet.'
    ].join(' ');
    var lines = [];
    function add(label, list) {
      var items = clipList(list, 8);
      if (items.length) lines.push(label + ': ' + items.join(' | '));
    }
    add('Tâches', hints.tasks);
    add('Documents', hints.docs);
    add('Personnes', hints.people);
    add('Étiquettes', hints.tags);
    if (hints.note) lines.push(String(hints.note).replace(/\s+/g, ' ').trim().slice(0, 200));
    var prefix = String((snap && (snap.prefix || snap.before)) || '').slice(-500);
    var user = 'Avant le curseur:\n' + prefix;
    var after = String((snap && (snap.lineAfter || snap.after)) || '');
    if (after.trim()) user += '\n\nAprès le curseur:\n' + after.slice(0, 280);
    if (lines.length) {
      user += '\n\nNoms déjà connus, seulement s\'ils continuent cette phrase:\n' + lines.join('\n');
    }
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

  /** Words that start a new word, never the tail of the one before the caret. */
  var CLOSED_WORD = {
    a: 1, an: 1, and: 1, as: 1, at: 1, by: 1, for: 1, from: 1, he: 1, her: 1, his: 1,
    in: 1, it: 1, of: 1, on: 1, or: 1, she: 1, that: 1, the: 1, their: 1, they: 1,
    to: 1, we: 1, with: 1,
    '\u00e0': 1, au: 1, aux: 1, car: 1, ce: 1, ces: 1, cette: 1, dans: 1, de: 1, des: 1,
    donc: 1, du: 1, elle: 1, en: 1, et: 1, est: 1, il: 1, ils: 1, je: 1, la: 1,
    le: 1, les: 1, mais: 1, nous: 1, on: 1, ou: 1, pas: 1, pour: 1, que: 1, qui: 1,
    sont: 1, sur: 1, tu: 1, un: 1, une: 1, vous: 1, avec: 1
  };

  /** First word of a continuation that is still about the same sentence. */
  var CONTINUE_CUE = {
    because: 1, since: 1, which: 1, that: 1, where: 1, when: 1, if: 1, so: 1,
    for: 1, to: 1, while: 1, whose: 1, until: 1, unless: 1, although: 1, though: 1,
    after: 1, before: 1, without: 1, within: 1, including: 1, especially: 1,
    car: 1, parce: 1, qui: 1, que: 1, dont: 1, 'o\u00f9': 1, pour: 1, afin: 1,
    donc: 1, lorsque: 1, si: 1, quand: 1, comme: 1
  };

  function firstToken(text) {
    return fold(String(text || '').trim().split(/[\s,.;:!?]+/)[0] || '');
  }

  function contentWords(text) {
    return fold(text).split(/[^0-9a-z\u00c0-\u024f]+/).filter(function (w) {
      return w.length >= 4 && !CLOSED_WORD[w];
    });
  }

  function tongue(text) {
    var s = ' ' + fold(text) + ' ';
    var fr = (s.match(/\b(le|la|les|des|une|est|dans|pour|avec|pas|que|qui|sur|nous|vous|cette|sont)\b/g) || []).length;
    var en = (s.match(/\b(the|and|of|to|is|in|for|with|on|that|this|are|was|be|an|from)\b/g) || []).length;
    if (/[\u00e0\u00e2\u00e4\u00e9\u00e8\u00ea\u00eb\u00ef\u00ee\u00f4\u00f9\u00fb\u00fc\u00e7\u0153\u00e6]/i.test(String(text || ''))) fr += 2;
    if (fr >= 2 && fr > en) return 'fr';
    if (en >= 2 && en > fr) return 'en';
    return '';
  }

  /** Another story, no shared word with the sentence already typed. */
  function driftsOff(before, suggestion) {
    var left = contentWords(before);
    var right = contentWords(suggestion);
    if (left.length < 2 || right.length < 2) return false;
    var i;
    var j;
    for (i = 0; i < right.length; i++) {
      for (j = 0; j < left.length; j++) {
        if (right[i] === left[j]) return false;
      }
    }
    if (CONTINUE_CUE[firstToken(suggestion)]) return false;
    return /\b(he|she|they|il|elle|ils|elles)\b/i.test(' ' + suggestion + ' ');
  }

  function needsLeadingSpace(before, body) {
    if (!before || !body) return false;
    if (/\s$/.test(before)) return false;
    if (!isWordChar(before.slice(-1)) || !isWordChar(body.charAt(0))) return false;
    var parts = body.split(' ');
    var word = fold(parts[0]);
    if (!CLOSED_WORD[word]) return false;
    if (parts.length > 1 && parts[1]) return true;
    return word.length >= 3;
  }

  /**
   * Model text -> characters to insert, or ''.
   * Keeps one leading space when the word before the caret is finished.
   */
  function parseCompletion(raw, before, kind) {
    var s = String(raw == null ? '' : raw).replace(/^\uFEFF/, '').replace(/\s+$/, '');
    var trimmed = s.trim();
    if (!trimmed) return '';
    if (trimmed.charAt(0) === '{') {
      try {
        var parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          s = String(parsed.text || parsed.suite || parsed.completion || '');
        }
      } catch (e) {
        s = trimmed;
      }
    }
    s = s.replace(/^\s*```[a-z]*\s*/i, '').replace(/```\s*$/, '');
    if (
      (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
      (s.charAt(0) === '\u00ab' && s.charAt(s.length - 1) === '\u00bb')
    ) {
      s = s.slice(1, -1).trim();
    }
    s = s.split(/\r?\n/)[0];
    if (!s || s === '.' || s === '\u2026' || /^aucun\.?$/i.test(s) || /^rien\.?$/i.test(s)) return '';
    if (/^(je |voici |suggestion|compl[eé]tion|r[eé]ponse|answer)\b/i.test(s.trim())) return '';
    s = dropOverlap(before, s).replace(/\s+/g, ' ');
    var wantsSpace = /^\s/.test(s);
    s = s.trim();
    if (!s) return '';
    var ended = /\s$/.test(String(before || ''));
    if (ended) wantsSpace = false;
    if (!wantsSpace && needsLeadingSpace(before, s)) wantsSpace = true;
    if (wantsSpace) s = ' ' + s;
    var maxWords = KIND_WORDS[kind] || 8;
    var maxChars = KIND_MAX[kind] || 80;
    var lead = s.charAt(0) === ' ' ? ' ' : '';
    var body = lead ? s.slice(1) : s;
    var words = body.split(' ');
    if (words.length > maxWords) body = words.slice(0, maxWords).join(' ');
    s = lead + body;
    if (s.length > maxChars) s = s.slice(0, maxChars).replace(/\s+\S*$/, '');
    if (!s.trim()) return '';
    if (driftsOff(before, s)) return '';
    var fromTongue = tongue(before);
    var toTongue = tongue(s);
    if (fromTongue && toTongue && fromTongue !== toTongue) return '';
    return s;
  }

  var BRANCH_COUNT = 4;

  /**
   * One model reply -> up to 4 different continuations.
   * Each entry is text to insert at the caret (may start with a space).
   */
  function parseBranches(raw, before, kind) {
    var text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '').replace(/\s+$/, '');
    if (!text.trim()) return [];
    var probe = text.trim();
    if (probe.charAt(0) === '{' || probe.charAt(0) === '[') {
      try {
        var parsed = JSON.parse(probe);
        if (Array.isArray(parsed)) text = parsed.join('\n');
        else if (parsed && Array.isArray(parsed.suites)) text = parsed.suites.join('\n');
        else if (parsed && Array.isArray(parsed.suggestions)) text = parsed.suggestions.join('\n');
      } catch (e) {
        /* keep the raw text */
      }
    }
    var lines = text.split(/\r?\n/);
    if (lines.length === 1 && /\s\|\s/.test(lines[0])) lines = lines[0].split(/\s\|\s/);
    var out = [];
    var seen = Object.create(null);
    lines.forEach(function (line) {
      if (out.length >= BRANCH_COUNT) return;
      var cleaned = String(line || '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');
      var one = parseCompletion(cleaned, before, kind);
      if (!one) return;
      var k = fold(one);
      if (seen[k]) return;
      seen[k] = true;
      out.push(one);
    });
    return out;
  }

  /**
   * Remainder of the first branch that still starts with `typed`, or ''.
   * Empty means the letters left every branch, or the branch is fully typed.
   */
  function matchBranch(branches, typed) {
    typed = String(typed || '');
    var i;
    for (i = 0; i < (branches || []).length; i++) {
      var branch = String(branches[i] || '');
      if (!branch || branch.indexOf(typed) !== 0) continue;
      var rest = branch.slice(typed.length);
      if (rest) return rest;
    }
    return '';
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
    if (snap.kind === 'document' || snap.kind === 'text') return trimmed.length >= 6;
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

  function isTextControl(el) {
    var tag = el && el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  function isEditableHost(el) {
    if (!el || isTextControl(el)) return false;
    if (el.isContentEditable) return true;
    if (typeof el.getAttribute !== 'function') return false;
    var c = el.getAttribute('contenteditable');
    if (c == null) return false;
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
      classHas(el, 'memory-ui-input') ||
      classHas(el, 'kb-ai-input') ||
      classHas(el, 'dc-search-input') ||
      classHas(el, 'en-search-input') ||
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
      attr(el, 'id') === 'settingsProfileDisplayName' ||
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
    if (
      classHas(el, 'kb-add-input') ||
      classHas(el, 'db-add-input') ||
      classHas(el, 'tb-add') ||
      classHas(el, 'mm-card-title')
    ) {
      return 'task-name';
    }
    if (
      classHas(el, 'info-desc-input') ||
      classHas(el, 'info-desc-rich') ||
      classHas(el, 'cf-textarea') ||
      classHas(el, 'en-area') ||
      classHas(el, 'blocked-reason-input')
    ) {
      return 'text';
    }
    var blob = fold(attr(el, 'aria-label') + ' ' + attr(el, 'placeholder'));
    if (/etiquette/.test(blob) || /\btag\b/.test(blob)) return 'tag';
    if (/personne/.test(blob) && /nom|ajouter/.test(blob)) return 'person-name';
    return fallbackKind(el);
  }

  /** Search, secrets and addresses stay quiet. Everything else you type gets a ghost. */
  function notWriting(el) {
    var type = fieldType(el);
    if (type === 'search' || type === 'email' || type === 'url' || type === 'tel') return true;
    var blob = fold(
      attr(el, 'placeholder') + ' ' + attr(el, 'aria-label') + ' ' + attr(el, 'id') + ' ' +
      attr(el, 'name') + ' ' + (typeof el.className === 'string' ? el.className : '')
    );
    if (/recherch|filtrer|\bcherch|\bsearch\b|\bfilter\b/.test(blob)) return true;
    if (/\b(token|secret|apikey|api-key|password|mot de passe)\b/.test(blob)) return true;
    if (/https?:|adresse du lien|adresse de l|unit[eé]\b|latitude|longitude/.test(blob)) return true;
    return false;
  }

  function fallbackKind(el) {
    if (!isTextControl(el) && !isEditableHost(el)) return '';
    if (notWriting(el)) return '';
    var blob = fold(attr(el, 'aria-label') + ' ' + attr(el, 'placeholder'));
    if (/personne/.test(blob) && /nom|ajout/.test(blob)) return 'person-name';
    if (/etiquette|étiquette|\btag\b|\balias\b/.test(blob)) return 'tag';
    if (/t[aâ]che|titre de la carte|nouvelle carte/.test(blob)) return 'task-name';
    if (closest(el, 'td[data-key="desc"]')) return 'text';
    if (closest(el, 'td[data-key="category"]')) return 'tag';
    if (el.tagName === 'TEXTAREA' || isEditableHost(el)) return 'text';
    if (/description|commentaire|\bnote\b|r[eè]gle|phrase|blocage|cause/.test(blob)) return 'text';
    return 'name';
  }

  function menuOpen(field) {
    if (!classHas(field, 'dc-editor')) return false;
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

  /**
   * The last `limit` characters before the caret, walking backward.
   * Avoids serializing the whole document on every keystroke.
   */
  function tailBefore(endNode, endOff, root, limit) {
    var parts = [];
    var left = limit;
    function take(text) {
      if (!text || left <= 0) return;
      if (text.length > left) text = text.slice(text.length - left);
      parts.push(text);
      left -= text.length;
    }
    function collectBack(node) {
      if (!node || left <= 0) return;
      if (node.nodeType === 3) {
        take(node.nodeValue || '');
        return;
      }
      if (node.nodeType !== 1) return;
      var kids = node.childNodes;
      var i;
      for (i = kids.length - 1; i >= 0 && left > 0; i--) collectBack(kids[i]);
    }
    if (!endNode || !root) return '';
    if (endNode.nodeType === 3) take(String(endNode.nodeValue || '').slice(0, endOff));
    else if (endNode.nodeType === 1) {
      var startKids = endNode.childNodes;
      var k = Math.min(endOff, startKids.length) - 1;
      while (k >= 0 && left > 0) {
        collectBack(startKids[k]);
        k--;
      }
    }
    var n = endNode;
    while (left > 0 && n && n !== root) {
      var prev = n.previousSibling;
      while (prev && left > 0) {
        collectBack(prev);
        prev = prev.previousSibling;
      }
      n = n.parentNode;
    }
    return parts.reverse().join('');
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
      before = tailBefore(range.endContainer, range.endOffset, field, 600);
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
      menuOpen: menuOpen(field)
    };
  }

  /* ── 3. Session ──────────────────────────────────────────────────── */

  var installed = false;
  var ghost = null;
  var ghostFontFor = null;
  var placeQueued = false;
  var mirrorHost = null;
  var mirrorMark = null;
  var mirrorText = null;
  var mirrorFor = null;
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
    pending: false,
    anchor: '',
    kind: '',
    branches: [],
    pendingAnchor: '',
    pendingKind: '',
    fresh: false,
    freshTimer: 0
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
    var host = el.getBoundingClientRect();
    if (!mirrorHost) {
      mirrorHost = document.createElement('div');
      mirrorText = document.createTextNode('');
      mirrorMark = document.createElement('span');
      mirrorMark.textContent = '\u200b';
      mirrorHost.appendChild(mirrorText);
      mirrorHost.appendChild(mirrorMark);
      mirrorHost.style.position = 'fixed';
      mirrorHost.style.overflow = 'hidden';
      mirrorHost.style.visibility = 'hidden';
      mirrorHost.style.pointerEvents = 'none';
      mirrorHost.style.wordWrap = 'break-word';
      document.body.appendChild(mirrorHost);
    }
    if (mirrorFor !== el) {
      mirrorFor = el;
      var cs = global.getComputedStyle(el);
      [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
        'textTransform', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'boxSizing', 'lineHeight'
      ].forEach(function (p) {
        mirrorHost.style[p] = cs[p];
      });
    }
    mirrorHost.style.left = host.left + 'px';
    mirrorHost.style.top = host.top + 'px';
    mirrorHost.style.width = el.clientWidth + 'px';
    mirrorHost.style.height = el.clientHeight + 'px';
    mirrorHost.style.whiteSpace = el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre';
    var start = el.selectionStart || 0;
    var typed = String(el.value || '').slice(0, start);
    if (mirrorText.nodeValue !== typed) mirrorText.nodeValue = typed;
    mirrorHost.scrollLeft = el.scrollLeft || 0;
    mirrorHost.scrollTop = el.scrollTop || 0;
    var m = mirrorMark.getBoundingClientRect();
    var lh = mirrorHost.style.lineHeight;
    return { left: m.left, top: m.top, height: m.height || parseFloat(lh) || 18 };
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
    if (ghostFontFor !== el && global.getComputedStyle) {
      ghostFontFor = el;
      var cs = global.getComputedStyle(el);
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

  function predictionRest(snap) {
    if (!snap || !session.branches || !session.branches.length) return '';
    if (session.kind !== snap.kind || !session.anchor) return '';
    if (snap.lineBefore.indexOf(session.anchor) !== 0) return '';
    return matchBranch(session.branches, snap.lineBefore.slice(session.anchor.length));
  }

  function queuePlace() {
    if (placeQueued || !session.suggestion || !session.el) return;
    placeQueued = true;
    var raf = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () {
      placeQueued = false;
      var el = activeField();
      if (!el || !session.suggestion) return;
      placeGhost(el, session.suggestion);
    });
  }

  function markFresh() {
    session.fresh = true;
    clearTimeout(session.freshTimer);
    session.freshTimer = setTimeout(function () { session.fresh = false; }, 0);
  }

  function showRest(el, snap, rest) {
    session.suggestion = rest;
    session.forLine = snap.lineBefore;
    markFresh();
    queuePlace();
  }

  function adoptBranches(kind, anchor, branches) {
    session.kind = kind;
    session.anchor = anchor;
    session.branches = branches.slice();
    cacheSet(kind + '\n' + anchor, session.branches);
  }

  function recallBranches(kind, line) {
    var best = null;
    var bestLen = -1;
    var i;
    for (i = 0; i < cacheOrder.length; i++) {
      var key = cacheOrder[i];
      var prefix = kind + '\n';
      if (key.indexOf(prefix) !== 0) continue;
      var anchor = key.slice(prefix.length);
      if (!anchor || line.indexOf(anchor) !== 0 || anchor.length <= bestLen) continue;
      var branches = cache[key];
      if (!branches || !branches.length) continue;
      var rest = matchBranch(branches, line.slice(anchor.length));
      if (!rest) continue;
      bestLen = anchor.length;
      best = { anchor: anchor, branches: branches, rest: rest };
    }
    return best;
  }

  function applyBranches(gen, kind, anchor, branches) {
    if (gen !== session.gen) return;
    session.pending = false;
    session.pendingAnchor = '';
    if (!branches || !branches.length) {
      hideGhost();
      return;
    }
    adoptBranches(kind, anchor, branches);
    var el = activeField();
    if (!el) return;
    var snap = snapshot(el);
    if (!snap || snap.kind !== kind || !shouldRequest(snap)) return;
    if (snap.lineBefore.indexOf(anchor) !== 0) {
      schedule();
      return;
    }
    var rest = matchBranch(branches, snap.lineBefore.slice(anchor.length));
    if (!rest) {
      if (snap.lineBefore !== anchor) {
        session.branches = [];
        session.anchor = '';
        schedule();
      }
      return;
    }
    showRest(el, snap, rest);
  }

  function ask(gen, snap) {
    var key = snap.kind + '\n' + snap.lineBefore;
    var hit = cacheGet(key);
    if (hit && hit.length) {
      applyBranches(gen, snap.kind, snap.lineBefore, hit);
      return;
    }
    if (hit) return;
    var Agent = global.PriorityAgent;
    if (!Agent || typeof Agent.chatCompletions !== 'function') return;
    session.pending = true;
    session.pendingAnchor = snap.lineBefore;
    session.pendingKind = snap.kind;
    loadProvider().then(function (provider) {
      if (gen !== session.gen) return;
      if (!provider || (typeof Agent.isConfigured === 'function' && !Agent.isConfigured(provider))) return;
      var messages = buildMessages(snap, mergeHints());
      var model =
        typeof Agent.modelForTier === 'function'
          ? Agent.modelForTier(provider, 'balanced')
          : provider.model;
      var tuned = Object.assign({}, provider, { model: model || provider.model });
      var call = {
        model: model || provider.model,
        jsonMode: false,
        max_tokens: 128,
        reasoningEffort: 'none',
        temperature: 0
      };
      var modelId = String(call.model || '').toLowerCase().replace(/^.*\//, '');
      if (/^(gpt-5|o\d)/.test(modelId)) call._drop = ['temperature'];
      return Agent.chatCompletions(tuned, messages, call).then(function (res) {
        if (gen !== session.gen) return;
        var branches = parseBranches(res && res.content, snap.lineBefore, snap.kind);
        cacheSet(key, branches);
        applyBranches(gen, snap.kind, snap.lineBefore, branches);
      });
    }).catch(function () {
      /* stay quiet while typing */
    }).then(function () {
      if (gen === session.gen) {
        session.pending = false;
        session.pendingAnchor = '';
      }
    });
  }

  function forgetField() {
    session.branches = [];
    session.anchor = '';
    session.pending = false;
    session.pendingAnchor = '';
  }

  function schedule() {
    clearTimeout(session.timer);
    var el = activeField();
    if (!el || session.composing) {
      hideGhost();
      return;
    }
    session.el = el;
    var snap = snapshot(el);
    if (!snap || !shouldRequest(snap)) {
      hideGhost();
      return;
    }
    var line = snap.lineBefore;
    var rest = '';
    var onTree =
      session.branches.length &&
      session.kind === snap.kind &&
      session.anchor &&
      line.indexOf(session.anchor) === 0;
    if (onTree) rest = matchBranch(session.branches, line.slice(session.anchor.length));
    if (rest) {
      showRest(el, snap, rest);
      return;
    }
    if (!onTree) {
      var remembered = recallBranches(snap.kind, line);
      if (remembered) {
        session.kind = snap.kind;
        session.anchor = remembered.anchor;
        session.branches = remembered.branches;
        showRest(el, snap, remembered.rest);
        return;
      }
    }
    if (
      session.pending &&
      session.pendingKind === snap.kind &&
      session.pendingAnchor &&
      line.indexOf(session.pendingAnchor) === 0
    ) {
      return;
    }
    hideGhost();
    session.branches = [];
    session.anchor = '';
    var gen = ++session.gen;
    session.timer = setTimeout(function () {
      if (gen !== session.gen) return;
      var now = snapshot(activeField());
      if (!now || now.lineBefore !== line || !shouldRequest(now)) return;
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
    if (el !== session.el) forgetField();
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
      session.branches = [];
      session.anchor = '';
      session.gen += 1;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (menuOpen(activeField() || session.el) || !session.suggestion) return;
    if (accept()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onSelectionChange() {
    if (session.fresh) {
      session.fresh = false;
      queuePlace();
      return;
    }
    if (!session.suggestion && !(session.branches && session.branches.length)) return;
    var el = activeField();
    if (!el) return;
    var snap = snapshot(el);
    if (!snap || !shouldRequest(snap)) {
      if (session.suggestion) hideGhost();
      return;
    }
    var rest = predictionRest(snap);
    if (rest) {
      showRest(el, snap, rest);
      return;
    }
    if (session.suggestion && snap.lineBefore !== session.forLine) hideGhost();
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
        forgetField();
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
      queuePlace();
    }, true);
    global.addEventListener('resize', function () {
      queuePlace();
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
    parseBranches: parseBranches,
    matchBranch: matchBranch,
    dropOverlap: dropOverlap,
    addHints: addHints,
    setBridge: function (t) { bridge = t || null; },
    install: install,
    accept: accept
  };
})(typeof window !== 'undefined' ? window : this);
