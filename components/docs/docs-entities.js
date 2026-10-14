/*
 * Role: link known entities inside a document, without asking.
 * A name, an alias, or a way of referring to someone ("mon boss" once the text
 * or the entity says Sylviane Mailhot is the boss) becomes a faint mark.
 * The words stay as typed. Hover shows which entity it is.
 *
 * Pure (tested in Node): catalogOf, phrasesOf, linksIn, parseAiLinks, aiMessages.
 * Browser: watch(editor) loads the entity catalog, links locally, then asks the
 * model in the background for the references the rules missed.
 *
 * Contents
 *   1. Folding + word boundaries
 *   2. Phrases the catalog and the text already justify
 *   3. Spans
 *   4. Model prompt
 *   5. Editor (caret-safe wrap, hover, background pass)
 */
(function (global) {
  'use strict';

  var POSSESS = { mon: 1, ma: 1, mes: 1, my: 1, notre: 1, our: 1 };
  var COPULA = { est: 1, is: 1, "c'est": 1 };
  var STOP = {
    le: 1, la: 1, les: 1, de: 1, du: 1, des: 1, un: 1, une: 1, et: 1, ou: 1,
    au: 1, aux: 1, en: 1, y: 1, a: 1, the: 1, of: 1, and: 1, or: 1,
    je: 1, tu: 1, il: 1, elle: 1, on: 1, nous: 1, vous: 1, ils: 1, elles: 1,
    ce: 1, ça: 1, ca: 1, son: 1, sa: 1, ses: 1, leur: 1, leurs: 1,
    qui: 1, que: 1, dont: 1, pour: 1, avec: 1, dans: 1, sur: 1, par: 1,
    pas: 1, ne: 1, plus: 1, tout: 1, toute: 1, cette: 1, cet: 1, ces: 1,
    est: 1, suis: 1, es: 1, sont: 1, is: 1, am: 1, are: 1, was: 1, were: 1,
    mon: 1, ma: 1, mes: 1, my: 1, notre: 1, our: 1, nos: 1, your: 1, ton: 1, ta: 1, tes: 1,
  };

  /* ── 1. Folding ──────────────────────────────────────────────────── */

  function foldChar(ch) {
    if (ch === '\u00a0') return ' ';
    if (ch === '\u2019' || ch === '\u2018' || ch === '`') ch = "'";
    var t = ch.toLowerCase();
    try {
      t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) { /* keep the character */ }
    return t;
  }

  /** Folded text plus the original index of each folded character. */
  function foldParts(s) {
    var folded = '';
    var starts = [];
    var src = String(s == null ? '' : s);
    var i, k, f;
    for (i = 0; i < src.length; i++) {
      f = foldChar(src.charAt(i));
      for (k = 0; k < f.length; k++) {
        starts.push(i);
        folded += f.charAt(k);
      }
    }
    return { folded: folded, starts: starts };
  }

  function foldKey(s) {
    return foldParts(s).folded.replace(/\s+/g, ' ').trim();
  }

  function isWord(ch) {
    return !!ch && /[A-Za-z0-9À-ÿ-]/.test(ch);
  }

  function boundary(text, start, end) {
    var before = start > 0 ? text.charAt(start - 1) : '';
    var after = end < text.length ? text.charAt(end) : '';
    if (before && isWord(before) && isWord(text.charAt(start))) return false;
    if (after && isWord(after) && isWord(text.charAt(end - 1))) return false;
    return true;
  }

  function originalSlice(text, starts, foldStart, foldEnd) {
    if (foldEnd <= foldStart || foldStart < 0 || foldStart >= starts.length) return '';
    var a = starts[foldStart];
    var b = foldEnd >= starts.length ? text.length : starts[foldEnd];
    return text.slice(a, b);
  }

  function skipSpace(folded, i) {
    while (i < folded.length && /\s/.test(folded.charAt(i))) i++;
    return i;
  }

  function readWord(folded, i) {
    var s = i;
    while (i < folded.length && /[a-z0-9'-]/.test(folded.charAt(i))) i++;
    return i > s ? { word: folded.slice(s, i), start: s, end: i } : null;
  }

  function readWords(folded, i, max) {
    var out = [];
    var n = 0;
    while (n < max) {
      i = skipSpace(folded, i);
      var w = readWord(folded, i);
      if (!w) break;
      out.push(w);
      i = w.end;
      n++;
    }
    return out;
  }

  /* ── 2. Phrases ──────────────────────────────────────────────────── */

  /**
   * Compact catalog: id, name, aliases, roles (relation roles), type names.
   * @param {object} schema
   * @param {object[]} entities
   */
  function catalogOf(schema, entities) {
    var typeName = {};
    ((schema && schema.types) || []).forEach(function (t) {
      if (t && t.id) typeName[t.id] = t.name || t.id;
    });
    var out = [];
    (entities || []).forEach(function (e) {
      if (!e || e.id == null || !e.name) return;
      var roles = [];
      (e.relations || []).forEach(function (r) {
        if (r && r.role) roles.push(String(r.role));
      });
      (e.roles || []).forEach(function (r) {
        if (r) roles.push(String(r));
      });
      var types = [];
      (e.types || []).forEach(function (id) {
        if (typeName[id]) types.push(typeName[id]);
      });
      out.push({
        id: String(e.id),
        name: String(e.name).replace(/\s+/g, ' ').trim(),
        aliases: (e.aliases || []).map(function (a) { return String(a).replace(/\s+/g, ' ').trim(); }).filter(Boolean),
        roles: roles.map(function (r) { return r.replace(/\s+/g, ' ').trim(); }).filter(Boolean),
        types: types,
      });
    });
    return out;
  }

  /** "mon boss" / "my boss" when exactly one entity carries that role or alias. */
  function rolePhrases(catalog) {
    var bag = {};
    (catalog || []).forEach(function (e) {
      if (!e || !e.id) return;
      (e.aliases || []).concat(e.roles || []).forEach(function (raw) {
        var key = foldKey(raw);
        var parts = key.split(' ').filter(Boolean);
        if (!key || parts.length > 3 || key === foldKey(e.name)) return;
        if (parts.some(function (w) { return w.length < 2 || STOP[w]; })) return;
        if (!bag[key]) bag[key] = {};
        bag[key][e.id] = true;
      });
    });
    var out = [];
    Object.keys(bag).forEach(function (key) {
      var ids = Object.keys(bag[key]);
      if (ids.length !== 1) return;
      ['mon ', 'ma ', 'mes ', 'my ', 'notre ', 'our '].forEach(function (pre) {
        out.push({ id: ids[0], phrase: pre + key });
      });
    });
    return out;
  }

  /**
   * "Sylviane Mailhot est mon boss", "mon boss est Sylviane Mailhot",
   * "Sylviane Mailhot, mon boss", "Sylviane Mailhot is my boss".
   * The phrase kept is the referring expression ("mon boss"), not the name.
   */
  function learn(text, catalog) {
    var src = String(text == null ? '' : text);
    var fm = foldParts(src);
    var folded = fm.folded;
    var labels = [];
    (catalog || []).forEach(function (e) {
      if (!e || !e.id) return;
      [e.name].concat(e.aliases || []).forEach(function (label) {
        var f = foldKey(label);
        if (f.length >= 2) labels.push({ id: String(e.id), folded: f });
      });
    });
    labels.sort(function (a, b) { return b.folded.length - a.folded.length; });
    var out = [];
    labels.forEach(function (lab) {
      var from = 0;
      while (from <= folded.length - lab.folded.length) {
        var at = folded.indexOf(lab.folded, from);
        if (at < 0) break;
        from = at + lab.folded.length;
        var start = fm.starts[at];
        var end = at + lab.folded.length >= fm.starts.length ? src.length : fm.starts[at + lab.folded.length];
        if (!boundary(src, start, end)) continue;
        var after = phraseAfter(src, fm, at + lab.folded.length);
        var before = phraseBefore(src, fm, at);
        if (after) out.push({ id: lab.id, phrase: after });
        if (before) out.push({ id: lab.id, phrase: before });
      }
    });
    return out;
  }

  function phraseAfter(text, fm, i) {
    var folded = fm.folded;
    var j = skipSpace(folded, i);
    var bridge = false;
    if (folded.charAt(j) === ',') {
      bridge = true;
      j = skipSpace(folded, j + 1);
    }
    var w = readWord(folded, j);
    if (w && COPULA[w.word]) {
      bridge = true;
      j = skipSpace(folded, w.end);
    }
    if (!bridge) return '';
    var ws = readWords(folded, j, 4);
    if (!ws.length || !POSSESS[ws[0].word]) return '';
    var last = null;
    var n = 0;
    var k;
    for (k = 1; k < ws.length; k++) {
      if (STOP[ws[k].word] || COPULA[ws[k].word] || POSSESS[ws[k].word] || ws[k].word.length < 2) break;
      last = ws[k];
      n++;
      if (n >= 3) break;
    }
    if (!last) return '';
    var phrase = originalSlice(text, fm.starts, ws[0].start, last.end);
    return phrase.length >= 3 && phrase.length <= 40 ? phrase : '';
  }

  function phraseBefore(text, fm, nameAt) {
    var folded = fm.folded;
    var windowStart = Math.max(0, nameAt - 60);
    var before = folded.slice(windowStart, nameAt);
    var m = /(mon|ma|mes|my|notre|our) ([a-z0-9'-]{2,24}(?: [a-z0-9'-]{2,24}){0,2})(?:, | est | is | c'est )$/.exec(before);
    if (!m) return '';
    var roles = m[2].split(' ');
    if (roles.some(function (w) { return STOP[w] || w.length < 2; })) return '';
    var foldStart = windowStart + m.index;
    var foldEnd = foldStart + m[1].length + 1 + m[2].length;
    var phrase = originalSlice(text, fm.starts, foldStart, foldEnd);
    return phrase.length >= 3 && phrase.length <= 40 ? phrase : '';
  }

  function phrasesOf(catalog, text, extra) {
    var raw = [];
    (catalog || []).forEach(function (e) {
      if (!e || e.id == null || !e.name) return;
      raw.push({ id: String(e.id), phrase: e.name });
      (e.aliases || []).forEach(function (a) { raw.push({ id: String(e.id), phrase: a }); });
    });
    rolePhrases(catalog).forEach(function (p) { raw.push(p); });
    learn(text, catalog).forEach(function (p) { raw.push(p); });
    (extra || []).forEach(function (p) {
      if (p && p.id != null && p.phrase) raw.push({ id: String(p.id), phrase: p.phrase });
    });
    var owners = {};
    var clean = [];
    raw.forEach(function (p) {
      var phrase = String(p.phrase == null ? '' : p.phrase).replace(/\s+/g, ' ').trim();
      var key = foldKey(phrase);
      if (key.length < 2 || STOP[key]) return;
      if (!owners[key]) owners[key] = {};
      owners[key][p.id] = true;
      clean.push({ id: String(p.id), phrase: phrase, key: key });
    });
    var out = [];
    var seen = {};
    clean.forEach(function (p) {
      if (Object.keys(owners[p.key]).length !== 1) return;
      var slot = p.id + '\0' + p.key;
      if (seen[slot]) return;
      seen[slot] = true;
      out.push({ id: p.id, phrase: p.phrase });
    });
    out.sort(function (a, b) {
      return b.phrase.length - a.phrase.length || (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0);
    });
    return out;
  }

  function matchId(catalog, name) {
    var key = foldKey(name);
    if (key.length < 2) return '';
    var hit = null;
    (catalog || []).some(function (e) {
      if (!e) return false;
      if (foldKey(e.name) === key) {
        hit = e;
        return true;
      }
      return (e.aliases || []).some(function (a) {
        if (foldKey(a) !== key) return false;
        hit = e;
        return true;
      });
    });
    return hit ? String(hit.id) : '';
  }

  /** First line of a selection, capped like an entity name. Blank returns "". */
  function nameFromSelection(text) {
    var raw = String(text == null ? '' : text).replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ');
    var line = raw.split(/\r?\n/).map(function (l) {
      return l.replace(/[ \t]+/g, ' ').trim();
    }).filter(Boolean)[0] || '';
    return line.slice(0, 80).trim();
  }

  /* ── 3. Spans ────────────────────────────────────────────────────── */

  function overlaps(taken, start, end) {
    return taken.some(function (t) { return start < t[1] && end > t[0]; });
  }

  /**
   * @param {string} text
   * @param {object[]} catalog normalized, or raw entities with name/aliases/roles
   * @param {number} [caret] skip a match the caret is still inside
   * @param {object[]} [extra] phrases the model added ({phrase, id})
   * @returns {{start:number, end:number, id:string, phrase:string}[]}
   */
  function linksIn(text, catalog, caret, extra) {
    var src = String(text == null ? '' : text);
    var phrases = phrasesOf(catalog, src, extra);
    var fm = foldParts(src);
    var taken = [];
    var spans = [];
    phrases.forEach(function (p) {
      var pf = foldKey(p.phrase);
      if (pf.length < 2) return;
      var from = 0;
      while (from <= fm.folded.length - pf.length) {
        var at = fm.folded.indexOf(pf, from);
        if (at < 0) break;
        from = at + pf.length;
        var start = fm.starts[at];
        var foldEnd = at + pf.length;
        var end = foldEnd >= fm.starts.length ? src.length : fm.starts[foldEnd];
        if (end <= start) continue;
        if (!boundary(src, start, end)) continue;
        if (overlaps(taken, start, end)) continue;
        if (typeof caret === 'number' && caret > start && caret < end) continue;
        taken.push([start, end]);
        spans.push({ start: start, end: end, id: p.id, phrase: src.slice(start, end) });
      }
    });
    spans.sort(function (a, b) { return a.start - b.start; });
    return spans;
  }

  /* ── 4. Model ────────────────────────────────────────────────────── */

  function parseAiLinks(raw, catalog) {
    var obj = raw;
    if (typeof raw === 'string') {
      var s = raw.trim();
      var fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(s);
      if (fence) s = fence[1];
      try { obj = JSON.parse(s); } catch (e) { return []; }
    }
    var links = obj && (obj.links || obj.mentions);
    if (!Array.isArray(links)) return [];
    var ids = {};
    (catalog || []).forEach(function (e) { if (e && e.id != null) ids[String(e.id)] = true; });
    var out = [];
    links.forEach(function (l) {
      if (!l) return;
      var id = String(l.id || l.entity || l.entityId || '');
      var phrase = String(l.phrase || l.text || '').replace(/\s+/g, ' ').trim();
      var key = foldKey(phrase);
      if (!ids[id] || phrase.length < 3 || phrase.length > 48 || STOP[key]) return;
      out.push({ id: id, phrase: phrase });
    });
    return out.slice(0, 12);
  }

  function aiMessages(catalog, text) {
    var lines = [];
    var budget = 3500;
    (catalog || []).forEach(function (e) {
      if (!e || !e.name) return;
      var bits = [e.name + ' #' + e.id];
      if (e.types && e.types.length) bits.push(e.types.join('/'));
      if (e.aliases && e.aliases.length) bits.push('alias: ' + e.aliases.slice(0, 8).join(', '));
      if (e.roles && e.roles.length) bits.push('rôles: ' + e.roles.slice(0, 6).join(', '));
      var line = '- ' + bits.join(' | ');
      if (budget - line.length < 0) return;
      budget -= line.length + 1;
      lines.push(line);
    });
    var sample = String(text == null ? '' : text).slice(0, 6000);
    return [
      {
        role: 'system',
        content:
          'Tu relies des bouts de texte à des entités déjà connues. ' +
          'Réponds uniquement en JSON: {"links":[{"phrase":"texte exact","id":"id"}]}. ' +
          'La phrase est copiée du texte, sans la changer. ' +
          'Relie un nom, un alias, ou une façon de désigner l\'entité (comme « mon boss » quand cette personne est le boss). ' +
          'Une seule entité par phrase. Pas de pronom (elle, il, ça). Pas de mot vide. ' +
          'Si rien ne correspond: {"links":[]}.',
      },
      { role: 'user', content: 'Entités:\n' + lines.join('\n') + '\n\nTexte:\n' + sample },
    ];
  }

  /* ── 5. Editor ───────────────────────────────────────────────────── */

  var session = null;

  function plainText(editor) {
    var parts = [];
    eachText(editor, false, function (n) {
      parts.push(String(n.nodeValue || '').replace(/\u00a0/g, ' '));
    });
    return parts.join('\n');
  }

  function eachText(root, skipLinked, fn) {
    if (!root || !global.document || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n = walker.nextNode();
    while (n) {
      var skip = false;
      var p = n.parentNode;
      while (p && p !== root) {
        var tag = p.tagName;
        if (tag === 'PRE' || tag === 'CODE' || tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE') {
          skip = true;
          break;
        }
        if (skipLinked && p.classList && (p.classList.contains('dc-ent') || p.classList.contains('dc-mention'))) {
          skip = true;
          break;
        }
        p = p.parentNode;
      }
      if (!skip && n.nodeValue) fn(n);
      n = walker.nextNode();
    }
  }

  function caretOf(editor) {
    var sel = global.getSelection && global.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    if (!editor.contains(sel.anchorNode)) return null;
    return { node: sel.anchorNode, offset: sel.anchorOffset };
  }

  function selectionBusy(editor) {
    var sel = global.getSelection && global.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    return !!(editor && editor.contains(sel.anchorNode));
  }

  function restoreCaret(mark) {
    if (!mark || !mark.node || !mark.node.parentNode) return;
    var sel = global.getSelection && global.getSelection();
    if (!sel) return;
    var off = mark.offset;
    if (mark.node.nodeType === 3) off = Math.min(off, mark.node.nodeValue.length);
    try {
      var range = document.createRange();
      range.setStart(mark.node, off);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* the node moved */ }
  }

  function applyPhrases(editor, phrases) {
    if (!editor || !phrases || !phrases.length || selectionBusy(editor)) return false;
    var caret = caretOf(editor);
    var jobs = [];
    eachText(editor, true, function (node) {
      var local = caret && caret.node === node ? caret.offset : null;
      var spans = linksIn(String(node.nodeValue || '').replace(/\u00a0/g, ' '), [], local, phrases);
      if (spans.length) jobs.push({ node: node, spans: spans });
    });
    if (!jobs.length) return false;
    var changed = false;
    jobs.forEach(function (job) {
      if (rewriteNode(job.node, job.spans, caret)) changed = true;
    });
    restoreCaret(caret);
    return changed;
  }

  /**
   * phrases here are already concrete {id, phrase}. linksIn with an empty catalog
   * still matches `extra`, which is how a text node is scanned.
   */
  function rewriteNode(node, spans, caret) {
    var parent = node.parentNode;
    if (!parent) return false;
    var text = String(node.nodeValue || '').replace(/\u00a0/g, ' ');
    var caretAt = caret && caret.node === node ? caret.offset : -1;
    var frag = document.createDocumentFragment();
    var cursor = 0;
    var caretNode = null;
    var caretOff = 0;
    function addText(from, to) {
      if (to < from) return;
      if (to === from) {
        if (caretAt === from && !caretNode) {
          var pad = document.createTextNode('');
          frag.appendChild(pad);
          caretNode = pad;
          caretOff = 0;
        }
        return;
      }
      var tn = document.createTextNode(text.slice(from, to));
      frag.appendChild(tn);
      if (caretAt >= from && caretAt <= to) {
        caretNode = tn;
        caretOff = caretAt - from;
      }
    }
    if (caretAt === 0 && spans[0].start === 0) addText(0, 0);
    spans.forEach(function (sp) {
      addText(cursor, sp.start);
      var span = document.createElement('span');
      span.className = 'dc-ent';
      span.setAttribute('data-m', 'entity');
      span.setAttribute('data-id', sp.id);
      span.setAttribute('data-label', text.slice(sp.start, sp.end));
      span.setAttribute('contenteditable', 'false');
      span.textContent = text.slice(sp.start, sp.end);
      frag.appendChild(span);
      cursor = sp.end;
    });
    addText(cursor, text.length);
    if (caretAt === text.length && !caretNode) addText(text.length, text.length);
    parent.insertBefore(frag, node);
    parent.removeChild(node);
    if (caret && caret.node === node && caretNode) {
      caret.node = caretNode;
      caret.offset = caretOff;
    }
    return true;
  }

  function tipEl() {
    if (!document.body) return null;
    var tip = document.querySelector('.dc-ent-tip');
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'dc-ent-tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  function placeTip(tip, el, catalog) {
    var id = el.getAttribute('data-id') || '';
    var ent = null;
    var i;
    for (i = 0; i < catalog.length; i++) {
      if (catalog[i].id === id) ent = catalog[i];
    }
    var name = ent ? ent.name : (el.getAttribute('data-label') || el.textContent || '');
    tip.textContent = '';
    var ic = document.createElement('i');
    ic.className = 'ti ti-stack-2';
    ic.setAttribute('aria-hidden', 'true');
    var lab = document.createElement('span');
    lab.textContent = name;
    tip.appendChild(ic);
    tip.appendChild(lab);
    if (ent && ent.types && ent.types[0]) {
      var sub = document.createElement('span');
      sub.className = 'dc-ent-tip-sub';
      sub.textContent = ent.types[0];
      tip.appendChild(sub);
    }
    tip.hidden = false;
    var r = el.getBoundingClientRect();
    var left = Math.max(8, r.left);
    var top = r.bottom + 4;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    var box = tip.getBoundingClientRect();
    if (box.right > global.innerWidth - 8) tip.style.left = Math.max(8, global.innerWidth - box.width - 8) + 'px';
    if (box.bottom > global.innerHeight - 8) tip.style.top = Math.max(8, r.top - box.height - 4) + 'px';
  }

  function openEntity(id) {
    if (!id || !global.location) return;
    var VT = global.ViewTabs;
    if (VT && typeof VT.hrefForSubject === 'function') {
      global.location.assign(VT.hrefForSubject('./entities.html', global.location, 'entity', id));
    }
  }

  function watch(editor, opts) {
    if (session) session.stop();
    opts = opts || {};
    if (!editor || !global.document) {
      session = { stop: function () {} };
      return session;
    }
    var catalog = [];
    var stopped = false;
    var applying = false;
    var gen = 0;
    var localTimer = 0;
    var aiTimer = 0;
    var tip = tipEl();

    function runLocal() {
      if (stopped || applying) return;
      if (opts.paused && opts.paused()) {
        clearTimeout(localTimer);
        localTimer = setTimeout(runLocal, 500);
        return;
      }
      if (!catalog.length) return;
      applying = true;
      var changed = false;
      try {
        changed = applyPhrases(editor, phrasesOf(catalog, plainText(editor)));
      } catch (e) { changed = false; }
      applying = false;
      if (changed && opts.onChange) opts.onChange();
    }

    function schedule() {
      if (stopped) return;
      clearTimeout(localTimer);
      clearTimeout(aiTimer);
      var token = ++gen;
      localTimer = setTimeout(function () {
        if (token === gen) runLocal();
      }, 450);
      aiTimer = setTimeout(function () {
        if (token === gen) runAi(token);
      }, 1400);
    }

    function runAi(token) {
      if (stopped || !catalog.length) return;
      if (opts.paused && opts.paused()) return;
      var agent = global.PriorityAgent;
      if (!agent || !opts.t || typeof agent.getProvider !== 'function' || typeof agent.chatCompletions !== 'function') return;
      var text = plainText(editor);
      if (!/\S/.test(text)) return;
      agent.getProvider(opts.t).then(function (p) {
        if (stopped || token !== gen) return null;
        if (typeof agent.isConfigured === 'function' && !agent.isConfigured(p)) return null;
        return agent.chatCompletions(p, aiMessages(catalog, text), {
          temperature: 0,
          jsonMode: true,
          max_tokens: 400,
          stream: false,
          reasoningEffort: 'minimal',
        });
      }).then(function (res) {
        if (!res || stopped || token !== gen) return;
        if (plainText(editor) !== text) return;
        var extra = parseAiLinks(res.content, catalog);
        if (!extra.length) return;
        applying = true;
        var changed = false;
        try {
          changed = applyPhrases(editor, phrasesOf(catalog, text, extra));
        } catch (e) { changed = false; }
        applying = false;
        if (changed && opts.onChange) opts.onChange();
      }).catch(function () {});
    }

    function setCatalog(pack) {
      if (stopped || !pack) return;
      catalog = catalogOf(pack.schema, pack.entities);
      if (opts.onCatalog) {
        try { opts.onCatalog(pack); } catch (e) { /* the index can catch up later */ }
      }
      runLocal();
    }

    function onInput() {
      if (!applying) schedule();
    }
    function onClick(e) {
      var el = e.target && e.target.closest && e.target.closest('.dc-ent');
      if (!el || !editor.contains(el)) return;
      e.preventDefault();
      openEntity(el.getAttribute('data-id'));
    }
    function onOver(e) {
      var el = e.target && e.target.closest && e.target.closest('.dc-ent');
      if (!el || !editor.contains(el) || !tip) return;
      placeTip(tip, el, catalog);
    }
    function onOut(e) {
      var el = e.target && e.target.closest && e.target.closest('.dc-ent');
      if (!el || !tip) return;
      var next = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.dc-ent');
      if (next === el) return;
      tip.hidden = true;
    }

    editor.addEventListener('input', onInput);
    editor.addEventListener('click', onClick);
    editor.addEventListener('mouseover', onOver);
    editor.addEventListener('mouseout', onOut);

    var ET = global.EntitiesTrello;
    if (ET && typeof ET.peek === 'function' && ET.peek()) setCatalog(ET.peek());
    if (ET && opts.t && typeof ET.load === 'function') {
      ET.load(opts.t).then(function (pack) { setCatalog(pack); }, function () {});
    }

    session = {
      stop: function () {
        stopped = true;
        gen++;
        clearTimeout(localTimer);
        clearTimeout(aiTimer);
        editor.removeEventListener('input', onInput);
        editor.removeEventListener('click', onClick);
        editor.removeEventListener('mouseover', onOver);
        editor.removeEventListener('mouseout', onOut);
        if (tip) tip.hidden = true;
      },
    };
    return session;
  }

  global.DocsEntities = {
    catalogOf: catalogOf,
    phrasesOf: phrasesOf,
    linksIn: linksIn,
    matchId: matchId,
    nameFromSelection: nameFromSelection,
    parseAiLinks: parseAiLinks,
    aiMessages: aiMessages,
    watch: watch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
