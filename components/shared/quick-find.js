/*
 * Role: Ctrl+F / Cmd+F search. Names are normalized once into an index; each keystroke only scores
 * that index and paints a short list, so a project or a task opens without waiting on the network.
 * The last row sends the same words to the assistant dock (a question, no board edit).
 *
 *   QuickFind.collect(cards, extra) -> records
 *   QuickFind.buildIndex(records) -> index
 *   QuickFind.search(index, query, limit, recent) -> [{ id, name, kind, hint }]
 *     kind: 'project' | 'task' | 'doc' | 'entity'
 *     recent: [{ id, kind }] floated first when the query is empty
 *
 * Cards come from the command palette already mounted by the view. Projects, documents and entities
 * are read from the page (data-iso-project, data-project, .dc-item, .en-row).
 */
(function (global) {
  'use strict';

  var LIMIT = 12;
  var RECENT_KEY = 'tp-quick-find-recent';
  var KIND_LABEL = { project: 'Projet', task: 'Tâche', doc: 'Document', entity: 'Entité' };
  var KIND_ICON = { project: 'stack-2', task: 'checkbox', doc: 'file-text', entity: 'puzzle' };
  var KIND_ORDER = { project: 0, task: 1, doc: 2, entity: 3 };

  var bound = null;
  var ui = null;

  function norm(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    return typeof t.normalize === 'function' ? t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : t;
  }

  function wordsOf(s) {
    return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  }

  function keyOf(kind, id) {
    return kind + '\0' + id;
  }

  /** Cards from the view, plus projects carried on them, plus anything already collected (the page). */
  function collect(cards, extra) {
    var out = [];
    var seen = Object.create(null);
    function add(r) {
      if (!r || r.id == null || r.id === '') return;
      var kind = r.kind === 'project' || r.kind === 'doc' || r.kind === 'entity' ? r.kind : 'task';
      var name = String(r.name == null ? '' : r.name).replace(/\s+/g, ' ').trim();
      if (!name) name = kind === 'task' ? 'Sans titre' : '';
      if (!name || (kind === 'project' && norm(name) === 'sans projet')) return;
      var id = String(r.id);
      var k = keyOf(kind, id);
      if (seen[k]) return;
      seen[k] = true;
      out.push({ id: id, name: name, kind: kind, hint: r.hint ? String(r.hint) : '' });
    }
    (cards || []).forEach(function (c) {
      if (!c) return;
      add({ id: c.id, name: c.name, kind: c.kind || 'task', hint: c.hint || '' });
      if (c.projectId && c.project) add({ id: c.projectId, name: c.project, kind: 'project' });
    });
    (extra || []).forEach(add);
    return out;
  }

  function buildIndex(records) {
    var items = [];
    (records || []).forEach(function (r) {
      if (!r || !r.id || !r.name) return;
      var name = String(r.name).replace(/\s+/g, ' ').trim();
      if (!name) return;
      items.push({
        id: String(r.id),
        name: name,
        kind: r.kind || 'task',
        hint: r.hint ? String(r.hint) : '',
        norm: norm(name),
        hintNorm: norm(r.hint || ''),
        tokens: wordsOf(name).concat(wordsOf(r.hint || '')),
      });
    });
    return { items: items };
  }

  /** Query characters appear in order, with at most two extra letters in the span. */
  function loose(name, q) {
    if (!q || q.length < 3) return false;
    var i = 0;
    var j = 0;
    var start = -1;
    while (i < name.length && j < q.length) {
      if (name.charAt(i) === q.charAt(j)) {
        if (start < 0) start = i;
        j++;
      }
      i++;
    }
    return j === q.length && start >= 0 && (i - start) <= q.length + 2;
  }

  function hitOf(it) {
    return { id: it.id, name: it.name, kind: it.kind, hint: it.hint };
  }

  function findItem(items, rec) {
    var i;
    for (i = 0; i < items.length; i++) {
      if (items[i].id === rec.id && items[i].kind === (rec.kind || 'task')) return items[i];
    }
    return null;
  }

  function scoreItem(it, q, words) {
    var name = it.norm;
    var tokens = it.tokens;
    var w;
    var t;
    for (w = 0; w < words.length; w++) {
      var word = words[w];
      var ok = name.indexOf(word) !== -1 || it.hintNorm.indexOf(word) !== -1;
      if (!ok) {
        for (t = 0; t < tokens.length; t++) {
          if (tokens[t].indexOf(word) !== -1) { ok = true; break; }
        }
      }
      if (!ok) return 0;
    }
    var score = 100 - Math.min(name.length, 40);
    if (name === q) score += 800;
    else if (name.indexOf(q) === 0) score += 500;
    else if (name.indexOf(q) !== -1) score += 200;
    for (w = 0; w < words.length; w++) {
      for (t = 0; t < tokens.length; t++) {
        if (tokens[t] === words[w]) score += 120;
        else if (tokens[t].indexOf(words[w]) === 0) score += 80;
      }
    }
    if (it.kind === 'project') score += 8;
    return score;
  }

  function search(index, query, limit, recent) {
    var items = (index && index.items) || [];
    var cap = limit || LIMIT;
    var q = norm(query).trim();
    var i;
    if (!q) {
      var used = Object.create(null);
      var ordered = [];
      (recent || []).forEach(function (r) {
        if (!r) return;
        var it = findItem(items, r);
        if (!it || used[keyOf(it.kind, it.id)]) return;
        used[keyOf(it.kind, it.id)] = true;
        ordered.push(it);
      });
      items.forEach(function (it) {
        if (it.kind === 'project' && !used[keyOf(it.kind, it.id)]) ordered.push(it);
      });
      items.forEach(function (it) {
        if (it.kind !== 'project' && !used[keyOf(it.kind, it.id)]) ordered.push(it);
      });
      return ordered.slice(0, cap).map(hitOf);
    }
    var words = wordsOf(q);
    if (!words.length) return [];
    var recentBoost = Object.create(null);
    (recent || []).forEach(function (r) {
      if (r && r.id) recentBoost[keyOf(r.kind || 'task', r.id)] = 40;
    });
    var scored = [];
    for (i = 0; i < items.length; i++) {
      var s = scoreItem(items[i], q, words);
      if (!s && loose(items[i].norm, q.replace(/[^a-z0-9]+/g, ''))) s = 30;
      if (!s) continue;
      s += recentBoost[keyOf(items[i].kind, items[i].id)] || 0;
      scored.push({ it: items[i], s: s });
    }
    scored.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      var ka = KIND_ORDER[a.it.kind] == null ? 9 : KIND_ORDER[a.it.kind];
      var kb = KIND_ORDER[b.it.kind] == null ? 9 : KIND_ORDER[b.it.kind];
      if (ka !== kb) return ka - kb;
      return a.it.name < b.it.name ? -1 : a.it.name > b.it.name ? 1 : 0;
    });
    var out = [];
    var seen = Object.create(null);
    for (i = 0; i < scored.length && out.length < cap; i++) {
      var k = keyOf(scored[i].it.kind, scored[i].it.id);
      if (seen[k]) continue;
      seen[k] = true;
      out.push(hitOf(scored[i].it));
    }
    return out;
  }

  function textIn(el, sel) {
    var n = el.querySelector && el.querySelector(sel);
    return n && n.textContent ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function domRecords() {
    var doc = global.document;
    if (!doc || !doc.querySelectorAll) return [];
    var out = [];
    function take(list, kind, nameOf) {
      Array.prototype.forEach.call(list, function (el) {
        if (!el || (el.classList && el.classList.contains('is-free'))) return;
        var id = el.getAttribute('data-iso-project') || el.getAttribute('data-project') || el.getAttribute('data-id');
        var name = nameOf(el);
        if (kind === 'project' && norm(name) === 'sans projet') return;
        if (id && name) out.push({ id: id, name: name, kind: kind });
      });
    }
    take(doc.querySelectorAll('[data-iso-project], [data-project]'), 'project', function (el) {
      return el.getAttribute('data-iso-label') || textIn(el, '.kb-proj-name, .tb-section-name, .tt-name');
    });
    take(doc.querySelectorAll('.dc-item[data-id]'), 'doc', function (el) {
      return textIn(el, '.dc-item-title');
    });
    take(doc.querySelectorAll('.en-row[data-id]'), 'entity', function (el) {
      return textIn(el, '.en-row-name');
    });
    return out;
  }

  function recent() {
    try {
      var raw = global.sessionStorage && sessionStorage.getItem(RECENT_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function remember(hit) {
    if (!hit || !global.sessionStorage) return;
    var list = recent().filter(function (r) { return !(r && r.id === hit.id && r.kind === hit.kind); });
    list.unshift({ id: hit.id, kind: hit.kind });
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ }
  }

  function escapeAttr(id) {
    return String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function icon(name) {
    var i = el('i', 'ti ti-' + name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function close() {
    if (!ui) return;
    var root = ui.root;
    ui = null;
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  function openHit(hit) {
    remember(hit);
    close();
    var id = escapeAttr(hit.id);
    if (hit.kind === 'doc') {
      var doc = document.querySelector('.dc-item[data-id="' + id + '"]');
      if (doc) doc.click();
      return;
    }
    if (hit.kind === 'entity') {
      var row = document.querySelector('.en-row[data-id="' + id + '"]');
      if (row) row.click();
      return;
    }
    if (hit.kind === 'project') {
      var sel = '[data-iso-project="' + id + '"]';
      var node = document.querySelector(sel) || document.querySelector('[data-project="' + id + '"]');
      if (node) {
        if (node.classList.contains('tt-project')) node.click();
        else if (node.getAttribute('aria-expanded') === 'false') node.click();
        else if (node.classList.contains('is-folded')) {
          var fold = node.querySelector('.kb-proj-fold');
          if (fold) fold.click();
        }
        node = document.querySelector(sel) || document.querySelector('[data-project="' + id + '"]');
        if (node && global.CommandPalette && global.CommandPalette.reveal) {
          global.CommandPalette.reveal(node.hasAttribute('data-iso-project') ? sel : '[data-project="' + id + '"]');
        } else if (node && node.scrollIntoView) node.scrollIntoView({ block: 'center', inline: 'nearest' });
        return;
      }
    }
    if (bound && typeof bound.onCard === 'function') bound.onCard(hit.id);
  }

  function askAI(query) {
    var Dock = global.AssistantDock;
    var q = String(query || '').trim();
    if (!q || !Dock || typeof Dock.ask !== 'function') return false;
    return !!Dock.ask(q);
  }

  function open() {
    if (ui || !global.document || !document.body) return;
    if (global.LinearPick && global.LinearPick.isOpen && global.LinearPick.isOpen()) global.LinearPick.close();
    var cards = bound && typeof bound.cards === 'function' ? bound.cards() : [];
    var index = buildIndex(collect(cards, domRecords()));
    var root = el('div', 'qf-scrim');
    var card = el('div', 'qf-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Recherche');
    var input = el('input', 'qf-input');
    input.type = 'text';
    input.placeholder = 'Projet ou tâche…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Recherche');
    var list = el('div', 'qf-list');
    list.setAttribute('role', 'listbox');
    card.appendChild(input);
    card.appendChild(list);
    root.appendChild(card);
    document.body.appendChild(root);
    var hits = [];
    var showAsk = false;
    var active = 0;
    ui = { root: root };

    function count() { return hits.length + (showAsk ? 1 : 0); }

    function paint() {
      hits = search(index, input.value, LIMIT, recent());
      showAsk = !!input.value.trim();
      if (active >= count()) active = Math.max(0, count() - 1);
      list.textContent = '';
      hits.forEach(function (h, i) {
        var btn = el('button', 'qf-hit' + (i === active ? ' is-active' : ''));
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', i === active ? 'true' : 'false');
        btn.appendChild(icon(KIND_ICON[h.kind] || 'checkbox'));
        var name = el('span', 'qf-name');
        name.textContent = h.name;
        btn.title = h.name;
        btn.appendChild(name);
        var kind = el('span', 'qf-kind');
        kind.textContent = KIND_LABEL[h.kind] || '';
        btn.appendChild(kind);
        var hint = el('span', 'qf-hint');
        hint.textContent = h.hint || '';
        btn.appendChild(hint);
        btn.addEventListener('mouseenter', function () { if (active !== i) { active = i; paint(); } });
        btn.addEventListener('click', function () { openHit(h); });
        list.appendChild(btn);
      });
      if (showAsk) {
        var ai = el('button', 'qf-hit qf-ask' + (active === hits.length ? ' is-active' : ''));
        ai.type = 'button';
        ai.setAttribute('role', 'option');
        ai.appendChild(icon('sparkles'));
        var label = el('span', 'qf-name');
        label.textContent = 'Demander à l’IA';
        ai.appendChild(label);
        ai.addEventListener('mouseenter', function () {
          if (active !== hits.length) { active = hits.length; paint(); }
        });
        ai.addEventListener('click', function () {
          var q = input.value.trim();
          if (askAI(q)) close();
        });
        list.appendChild(ai);
      }
      var on = list.querySelector('.is-active');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }

    function choose() {
      if (showAsk && active === hits.length) {
        if (askAI(input.value.trim())) close();
        return;
      }
      if (hits[active]) openHit(hits[active]);
    }

    input.addEventListener('input', function () { active = 0; paint(); });
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      var n = count();
      if (e.key === 'ArrowDown') { e.preventDefault(); if (n) { active = (active + 1) % n; paint(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) { active = (active - 1 + n) % n; paint(); } }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (askAI(input.value.trim())) close();
      }
      else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); choose(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    root.addEventListener('mousedown', function (e) {
      if (e.target === root) close();
    });
    paint();
    try { input.focus(); } catch (err) { /* ignore */ }
  }

  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (String(e.key || '').toLowerCase() !== 'f') return;
    if (e.repeat && !ui) return;
    if (ui) {
      e.preventDefault();
      var field = ui.root && ui.root.querySelector('.qf-input');
      if (field) try { field.focus(); } catch (err) { /* ignore */ }
      return;
    }
    if (bound && typeof bound.isBusy === 'function' && bound.isBusy()) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  }

  function hookPalette() {
    var CP = global.CommandPalette;
    if (!CP || !CP.attach || CP.attach.__qf) return;
    var orig = CP.attach;
    function wrapped(o) {
      bound = o || bound;
      return orig.apply(this, arguments);
    }
    wrapped.__qf = true;
    CP.attach = wrapped;
  }

  function install() {
    hookPalette();
    if (global.document && document.addEventListener && !install.done) {
      install.done = true;
      document.addEventListener('keydown', onKey, true);
    }
  }

  install();
  global.QuickFind = {
    collect: collect,
    buildIndex: buildIndex,
    search: search,
    loose: loose,
    install: install,
  };
})(typeof window !== 'undefined' ? window : global);
