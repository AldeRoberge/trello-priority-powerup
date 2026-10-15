/*
 * Role: shared pickers for the entities around a card: people (Trello members + "Hors Trello"
 * contacts), places (Où / De / Vers) and labels. One searchable popover, the same for every view.
 *
 *   CardEntities.open('people' | 'places' | 'labels', {
 *     t, rec, anchor,                  // rec: a board record (id, assignees, labels, inputs)
 *     slot,                            // 'places' only: 'at' | 'from' | 'to'
 *     onSaved(), onError(message),     // optional
 *     onClose(changed),                // changed = something was saved: the host reloads the card
 *   })
 *   CardEntities.close()
 *
 * Writes: members and labels through the Trello REST API (SheetsTrello.trelloRest), places and
 * contacts through PriorityTrello.saveCardInputsById, the board catalogs through PriorityTrello.
 * Pure helpers are exported for unit tests.
 */
(function (global) {
  'use strict';

  var current = null;
  var SLOTS = [['at', 'Où'], ['from', 'De'], ['to', 'Vers']];

  function PT() { return global.PriorityTrello; }
  function PU() { return global.PriorityUI; }
  function ST() { return global.SheetsTrello; }

  /* ── Pure helpers ───────────────────────────────────────────────── */

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  /** The list with `id` added (on) or removed (off); never twice. */
  function toggleId(list, id, on) {
    var key = String(id);
    var rest = (list || []).map(String).filter(function (x) { return x !== key; });
    return on ? rest.concat([key]) : rest;
  }

  /** Items whose name contains every word of `q` (accents and case ignored). */
  function filterItems(items, q) {
    var words = fold(q).split(' ').filter(Boolean);
    if (!words.length) return items.slice();
    return items.filter(function (it) {
      var hay = fold(it.name + ' ' + (it.sub || ''));
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }

  /** The places map with one slot set to `ref` ({id, name}) or cleared when ref is null. */
  function nextPlaces(places, slot, ref) {
    var out = Object.assign({}, places || {});
    if (ref) out[slot] = { id: ref.id, name: ref.name };
    else delete out[slot];
    return out;
  }

  /** What a card shows for its places: [{ slot, label, name }] in Où / De / Vers order. */
  function placeChips(places) {
    var p = places || {};
    var out = [];
    SLOTS.forEach(function (s) {
      if (p[s[0]] && p[s[0]].name) out.push({ slot: s[0], label: s[1], name: p[s[0]].name });
    });
    return out;
  }

  /**
   * What a card shows for its people, places and labels, ready to draw:
   * { people, places, labels } each [{ text, title, dot? }]. A place in the Où slot shows its bare name.
   */
  function describe(rec) {
    rec = rec || {};
    return {
      people: (rec.assignees || []).map(function (a) {
        return { text: a.name, title: a.custom ? a.name + ' (hors Trello)' : a.name };
      }),
      places: placeChips(rec.inputs && rec.inputs.places).map(function (p) {
        return { text: (p.slot === 'at' ? '' : p.label + ' ') + p.name, title: p.label + ' · ' + p.name };
      }),
      labels: (rec.labels || []).map(function (l) {
        var name = l.name || l.color || '·';
        return { text: name, title: name, dot: COLORS[l.color] || '' };
      }),
    };
  }

  /** Same person on both lists (a contact linked to a board member counts once). */
  function samePerson(a, b) {
    return String(a.id) === String(b.id) || !!(a.trelloId && String(a.trelloId) === String(b.id));
  }

  /* ── DOM ────────────────────────────────────────────────────────── */

  function el(tag, cls, attrs, kids) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function msg(err) {
    return (err && (err.message || err.reason)) || String(err || 'erreur');
  }

  function place(pop, anchor) {
    var margin = 8;
    var r = anchor.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    pop.style.visibility = 'hidden';
    pop.style.left = '0px';
    pop.style.top = '0px';
    var pw = pop.offsetWidth || 280;
    var ph = pop.offsetHeight || 260;
    var left = Math.min(Math.max(margin, r.left), Math.max(margin, vw - pw - margin));
    var top = r.bottom + 6;
    if (top + ph > vh - margin) top = r.top - ph - 6 >= margin ? r.top - ph - 6 : Math.max(margin, vh - margin - ph);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
    pop.style.visibility = '';
  }

  function close() {
    if (!current) return;
    var c = current;
    current = null;
    document.removeEventListener('keydown', c.onKey, true);
    document.removeEventListener('pointerdown', c.onOutside, true);
    if (c.pop.parentNode) c.pop.parentNode.removeChild(c.pop);
    if (typeof c.opts.onClose === 'function') c.opts.onClose(c.changed);
  }

  /**
   * Searchable list popover. cfg: { title, placeholder, tabs?: [[id, label]], tab, items(): [{ id, name, sub?, color?, checked }],
   * onPick(item) -> Promise, create?(name) -> Promise, createLabel?(name) -> string }.
   * The list repaints after every pick, so several can be toggled without closing.
   */
  function pickerPopover(opts, cfg) {
    close();
    var pop = el('div', 'ce-pop', { role: 'dialog', 'aria-label': cfg.title });
    var c = { pop: pop, opts: opts, changed: false };
    var tab = cfg.tab;
    var input = el('input', 'ce-input', { type: 'text', placeholder: cfg.placeholder || 'Chercher…', 'aria-label': cfg.title, autocomplete: 'off' });
    var list = el('div', 'ce-list', { role: 'listbox' });
    var tabsEl = cfg.tabs ? el('div', 'ce-tabs', { role: 'tablist' }) : null;
    var busy = false;

    function fail(err) {
      if (typeof opts.onError === 'function') opts.onError(msg(err));
    }
    function act(fn) {
      if (busy) return;
      busy = true;
      list.classList.add('is-busy');
      Promise.resolve().then(fn).then(function () {
        c.changed = true;
        if (typeof opts.onSaved === 'function') opts.onSaved();
      }, fail).then(function () {
        busy = false;
        list.classList.remove('is-busy');
        paint();
        input.focus();
      });
    }

    function row(it) {
      var b = el('button', 'ce-row' + (it.checked ? ' is-on' : ''), { type: 'button', role: 'option', 'aria-selected': it.checked ? 'true' : 'false', title: it.name }, [
        el('span', 'ce-check', null, [el('i', 'ti ti-check', { 'aria-hidden': 'true' })]),
        it.color ? el('span', 'ce-dot', { style: 'background:' + it.color }) : null,
        el('span', 'ce-name', { text: it.name || '·' }),
        it.sub ? el('span', 'ce-sub', { text: it.sub }) : null,
      ]);
      b.addEventListener('click', function () { act(function () { return cfg.onPick(it); }); });
      return b;
    }

    function paint() {
      if (tabsEl) {
        tabsEl.textContent = '';
        cfg.tabs.forEach(function (d) {
          tabsEl.appendChild(el('button', 'ce-tab' + (tab === d[0] ? ' is-active' : ''), {
            type: 'button', role: 'tab', 'aria-selected': tab === d[0] ? 'true' : 'false', text: d[1],
            onclick: function () { tab = d[0]; cfg.onTab(tab); paint(); input.focus(); },
          }));
        });
      }
      var q = input.value.trim();
      var shown = filterItems(cfg.items(), q);
      list.textContent = '';
      shown.forEach(function (it) { list.appendChild(row(it)); });
      var exact = shown.some(function (it) { return fold(it.name) === fold(q); });
      if (q && cfg.create && !exact) {
        var add = el('button', 'ce-row ce-create', { type: 'button' }, [
          el('span', 'ce-check', null, [el('i', 'ti ti-plus', { 'aria-hidden': 'true' })]),
          el('span', 'ce-name', { text: cfg.createLabel ? cfg.createLabel(q) : 'Créer « ' + q + ' »' }),
        ]);
        add.addEventListener('click', function () { act(function () { input.value = ''; return cfg.create(q); }); });
        list.appendChild(add);
      }
      if (!list.children.length) list.appendChild(el('div', 'ce-empty', { text: 'Rien pour le moment' }));
      place(pop, opts.anchor);
    }

    input.addEventListener('input', paint);
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var first = list.querySelector('.ce-row');
        if (first) first.click();
      }
    });

    if (tabsEl) pop.appendChild(tabsEl);
    pop.appendChild(input);
    pop.appendChild(list);
    document.body.appendChild(pop);
    c.onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    c.onOutside = function (e) {
      if (pop.contains(e.target) || (opts.anchor && opts.anchor.contains(e.target))) return;
      close();
    };
    document.addEventListener('keydown', c.onKey, true);
    document.addEventListener('pointerdown', c.onOutside, true);
    current = c;
    paint();
    input.focus();
    return c;
  }

  /* ── Writes ─────────────────────────────────────────────────────── */

  function rest(t, path, body) {
    var st = ST();
    if (!st || typeof st.trelloRest !== 'function') return Promise.reject(new Error('Trello indisponible'));
    return st.trelloRest(t, path, 'PUT', body).then(function (res) {
      if (res && res.ok === false) throw new Error(res.reason === 'not-authorized' ? 'Trello n’est pas autorisé' : res.reason || 'échec');
      return res;
    });
  }

  function saveInputs(t, cardId, patch) {
    var pt = PT();
    if (!pt || typeof pt.saveCardInputsById !== 'function') return Promise.reject(new Error('Enregistrement indisponible'));
    return pt.saveCardInputsById(t, cardId, patch);
  }

  /* ── Pickers ────────────────────────────────────────────────────── */

  function openPeople(opts) {
    var t = opts.t;
    var rec = opts.rec;
    var pt = PT();
    var pu = PU();
    var people = (rec.assignees || []).map(function (a) { return Object.assign({}, a); });
    var customs = ((rec.inputs && rec.inputs.customAssignees) || []).map(function (x) { return Object.assign({}, x); });
    var members = [];
    var catalog = [];

    function isOn(it) { return people.some(function (p) { return samePerson(p, it) || samePerson(it, p); }); }
    function memberIds() { return people.filter(function (p) { return !p.custom; }).map(function (p) { return p.id; }); }

    function items() {
      var out = members.map(function (m) {
        var name = m.fullName || m.username || m.id;
        return { kind: 'member', id: String(m.id), name: name, sub: m.username && m.username !== name ? '@' + m.username : '', checked: isOn({ id: String(m.id) }) };
      });
      catalog.forEach(function (c) {
        if (c.trelloMemberId && members.some(function (m) { return String(m.id) === String(c.trelloMemberId); })) return;
        out.push({ kind: 'custom', id: String(c.id), name: c.name, sub: 'Hors Trello', entry: c, checked: isOn({ id: String(c.id) }) });
      });
      return out;
    }

    function toggle(it) {
      var on = !it.checked;
      if (it.kind === 'member') {
        var ids = toggleId(memberIds(), it.id, on);
        return rest(t, '/cards/' + encodeURIComponent(rec.id), { idMembers: ids.join(',') }).then(function () {
          people = on ? people.concat([{ id: it.id, name: it.name, custom: false, trelloId: it.id }]) : people.filter(function (p) { return p.custom || String(p.id) !== it.id; });
        });
      }
      var next = on ? customs.concat([it.entry]) : customs.filter(function (x) { return String(x.id) !== it.id; });
      return saveInputs(t, rec.id, { customAssignees: next }).then(function () {
        customs = next;
        people = on ? people.concat([{ id: it.id, name: it.name, custom: true, trelloId: '' }]) : people.filter(function (p) { return String(p.id) !== it.id; });
      });
    }

    function create(name) {
      var existing = catalog.filter(function (c) { return fold(c.name) === fold(name); })[0];
      var entry = existing || (pu && pu.createCustomAssignee ? pu.createCustomAssignee({ name: name }) : null);
      if (!entry) return Promise.reject(new Error('Nom invalide'));
      var saveCatalog = existing || !pt.saveCustomAssigneeCatalog
        ? Promise.resolve()
        : pt.saveCustomAssigneeCatalog(t, catalog.concat([entry])).then(function (saved) { if (saved) catalog = saved; });
      return saveCatalog.then(function () {
        if (!existing && !catalog.some(function (c) { return String(c.id) === String(entry.id); })) catalog = catalog.concat([entry]);
        return toggle({ kind: 'custom', id: String(entry.id), name: entry.name, entry: entry, checked: false });
      });
    }

    Promise.all([
      pt && pt.getBoardMembers ? pt.getBoardMembers(t) : [],
      pt && pt.getCustomAssigneeCatalog ? pt.getCustomAssigneeCatalog(t) : [],
    ]).then(function (res) {
      members = res[0] || [];
      catalog = res[1] || [];
      var c = current;
      if (c && c.pop) c.pop.dispatchEvent(new Event('ce-data'));
    }, function () {});

    var c = pickerPopover(opts, { title: 'Personnes', placeholder: 'Chercher ou ajouter une personne…', items: items, onPick: toggle, create: create, createLabel: function (q) { return 'Ajouter « ' + q + ' »'; } });
    c.pop.addEventListener('ce-data', function () { var i = c.pop.querySelector('.ce-input'); if (i) i.dispatchEvent(new Event('input')); });
  }

  function openPlaces(opts) {
    var t = opts.t;
    var rec = opts.rec;
    var pt = PT();
    var pu = PU();
    var places = Object.assign({}, (rec.inputs && rec.inputs.places) || {});
    var slot = opts.slot || 'at';
    var catalog = [];

    function items() {
      var seen = Object.create(null);
      var out = [];
      catalog.concat([places.at, places.from, places.to].filter(Boolean)).forEach(function (p) {
        if (!p || !p.name || seen[p.id || fold(p.name)]) return;
        seen[p.id || fold(p.name)] = true;
        out.push({ id: p.id, name: p.name, checked: !!(places[slot] && (places[slot].id === p.id || fold(places[slot].name) === fold(p.name))) });
      });
      return out;
    }

    function write(next) {
      return saveInputs(t, rec.id, { places: next }).then(function () { places = next; });
    }

    function pick(it) {
      return write(nextPlaces(places, slot, it.checked ? null : { id: it.id, name: it.name }));
    }

    function create(name) {
      var ref = pu && pu.createPlaceRef ? pu.createPlaceRef(name) : null;
      if (!ref) return Promise.reject(new Error('Nom invalide'));
      var found = catalog.filter(function (p) { return fold(p.name) === fold(name); })[0];
      if (found) return write(nextPlaces(places, slot, found));
      var next = catalog.concat([ref]);
      var save = pt && pt.savePlaceCatalog ? pt.savePlaceCatalog(t, next) : Promise.resolve(next);
      return save.then(function (saved) {
        catalog = saved || next;
        return write(nextPlaces(places, slot, ref));
      });
    }

    Promise.resolve(pt && pt.getPlaceCatalog ? pt.getPlaceCatalog(t) : []).then(function (list) {
      catalog = list || [];
      var c = current;
      if (c && c.pop) c.pop.dispatchEvent(new Event('ce-data'));
    }, function () {});

    var c = pickerPopover(opts, {
      title: 'Lieux',
      placeholder: 'Chercher ou ajouter un lieu…',
      tabs: SLOTS,
      tab: slot,
      onTab: function (s) { slot = s; },
      items: items,
      onPick: pick,
      create: create,
      createLabel: function (q) { return 'Ajouter « ' + q + ' »'; },
    });
    c.pop.addEventListener('ce-data', function () { var i = c.pop.querySelector('.ce-input'); if (i) i.dispatchEvent(new Event('input')); });
  }

  function openLabels(opts) {
    var t = opts.t;
    var rec = opts.rec;
    var pt = PT();
    var on = (rec.labels || []).map(function (l) { return String(l.id); });
    var board = [];

    function items() {
      var seen = Object.create(null);
      var out = [];
      board.concat(rec.labels || []).forEach(function (l) {
        var id = String(l.id);
        if (seen[id]) return;
        seen[id] = true;
        out.push({ id: id, name: l.name || l.color || '', color: COLORS[l.color] || '', checked: on.indexOf(id) >= 0 });
      });
      return out;
    }

    function pick(it) {
      var next = toggleId(on, it.id, !it.checked);
      return rest(t, '/cards/' + encodeURIComponent(rec.id), { idLabels: next.join(',') }).then(function () { on = next; });
    }

    Promise.resolve(pt && pt.getBoardLabels ? pt.getBoardLabels(t) : []).then(function (list) {
      board = list || [];
      var c = current;
      if (c && c.pop) c.pop.dispatchEvent(new Event('ce-data'));
    }, function () {});

    var c = pickerPopover(opts, { title: 'Étiquettes', placeholder: 'Chercher une étiquette…', items: items, onPick: pick });
    c.pop.addEventListener('ce-data', function () { var i = c.pop.querySelector('.ce-input'); if (i) i.dispatchEvent(new Event('input')); });
  }

  var COLORS = {
    green: '#4bce97', yellow: '#e2b203', orange: '#fea362', red: '#f87168', purple: '#9f8fef', blue: '#579dff',
    sky: '#6cc3e0', lime: '#94c748', pink: '#e774bb', black: '#8590a2',
  };

  var OPENERS = { people: openPeople, places: openPlaces, labels: openLabels };

  function open(kind, opts) {
    opts = opts || {};
    var fn = OPENERS[kind];
    if (!fn || !opts.anchor || !opts.t || !opts.rec || !opts.rec.id) return false;
    fn(opts);
    return true;
  }

  global.CardEntities = {
    open: open,
    close: close,
    KINDS: Object.keys(OPENERS),
    SLOTS: SLOTS,
    COLORS: COLORS,
    toggleId: toggleId,
    filterItems: filterItems,
    nextPlaces: nextPlaces,
    placeChips: placeChips,
    describe: describe,
    samePerson: samePerson,
  };
})(typeof window !== 'undefined' ? window : this);
