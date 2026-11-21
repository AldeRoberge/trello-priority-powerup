/*
 * Role: screen of the Notes app, laid out like Google Keep: header with logo and search pill, navigation drawer (Notes, Archive),
 * "Prendre une note…" composer above a masonry grid of cards, note editor dialog. Rich content like Documents. Everything is
 * written to the device first (KeepSync.save) and sent to Trello in the background, so it works offline. DOM only, no Trello
 * calls except through KeepSync. Exposes window.KeepUI.mount(root).
 */
(function (global) {
  'use strict';

  var KM = function () { return global.KeepModel; };
  var POLL_MS = 10000;
  var DRAWER_WIDE = 960;
  // Names and colours follow Google Keep's palette (values live in keep-ui.css).
  var COLOR_LABEL = { yellow: 'Sable', green: 'Menthe', blue: 'Brume', pink: 'Corail', purple: 'Crépuscule', gray: 'Argile' };

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    return n;
  }

  function icon(name) {
    return el('i', 'ti ti-' + name, { 'aria-hidden': 'true' });
  }

  function setIcon(b, name) {
    b.firstChild.className = 'ti ti-' + name;
  }

  function btn(iconName, label, onClick, cls) {
    var b = el('button', 'k-btn' + (cls ? ' ' + cls : ''), { type: 'button', title: label, 'aria-label': label });
    b.appendChild(icon(iconName));
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(e); });
    return b;
  }

  function navItem(iconName, label) {
    var b = el('button', 'k-nav-item', { type: 'button' });
    b.appendChild(icon(iconName));
    b.appendChild(el('span', '', { text: label }));
    return b;
  }

  /* ── Colour palette (Keep's round swatches in a popover) ─────────── */

  function palette(current, onPick) {
    var wrap = el('div', 'k-palette', { role: 'group', 'aria-label': 'Couleur' });
    [''].concat(KM().COLORS).forEach(function (c) {
      var label = c ? COLOR_LABEL[c] : 'Sans couleur';
      var b = el('button', 'k-dot' + (c === (current || '') ? ' is-on' : ''), { type: 'button', title: label, 'aria-label': label });
      b.setAttribute('data-color', c);
      b.addEventListener('click', function (e) { e.stopPropagation(); onPick(c); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /** Opens the palette above host (a position:relative wrapper), or closes it when already open. */
  function togglePalette(host, current, onPick) {
    if (host.querySelector('.k-palette')) { host.querySelector('.k-palette').remove(); return; }
    var pal = null;
    function close() {
      if (pal) pal.remove();
      document.removeEventListener('click', away);
    }
    function away(e) { if (!host.contains(e.target)) close(); }
    pal = palette(current, function (c) { close(); onPick(c); });
    host.appendChild(pal);
    document.addEventListener('click', away);
  }

  /* ── Editor (shared by the composer and the note dialog) ─────────── */

  /** Title + rich body (Markdown, same editor model as Documents). getNote() returns the edited note. */
  function buildEditor(note, onChange) {
    var state = { note: Object.assign({}, note) };
    var root = el('div', 'k-editor');
    var title = el('input', 'k-title', { type: 'text', placeholder: 'Titre', value: note.title || '' });
    root.appendChild(title);

    function changed() {
      state.note.title = title.value;
      if (onChange) onChange(state.note);
    }
    title.addEventListener('input', changed);

    var rich = global.KeepRich.create({
      md: note.body || '',
      onChange: function (md) { state.note.body = md; changed(); },
    });
    root.appendChild(rich.el);

    return {
      el: root,
      focusTitle: function () { title.focus(); },
      focusBody: function () { rich.focus(); },
      getNote: function () { state.note.title = title.value; return state.note; },
      setBody: function (b) { state.note.body = b; rich.setMd(b); },
      patch: function (p) { Object.assign(state.note, p); changed(); },
      destroy: function () { rich.destroy(); },
    };
  }

  /* ── App ──────────────────────────────────────────────────────────── */

  var SORT_KEY = 'keep-sort';

  function loadSort() {
    try {
      var v = global.localStorage.getItem(SORT_KEY);
      return KM().SORTS.some(function (s) { return s.id === v; }) ? v : 'manual';
    } catch (e) { return 'manual'; }
  }

  function mount(root, deps) {
    var sync = deps.sync;
    var store = deps.store;
    var ui = {
      notes: [], query: '', archive: false, status: 'idle', composing: null, dialog: null,
      ai: null, hidden: {}, dragId: null, undo: null, showHidden: false, sort: loadSort(),
      drawer: (global.innerWidth || 1200) >= DRAWER_WIDE,
    };
    var syncTimer = null;
    var lastCols = 0;

    root.textContent = '';

    /* header: menu, logo, search pill, sync status */
    var header = el('header', 'k-header');
    var menuBtn = btn('menu-2', 'Menu principal', function () { setDrawer(!ui.drawer); }, 'k-menu-btn');
    var logo = el('div', 'k-logo');
    logo.appendChild(el('i', 'ti ti-bulb-filled', { 'aria-hidden': 'true' }));
    logo.appendChild(el('span', 'k-logo-name', { text: 'Keep' }));
    var brand = el('div', 'k-brand');
    brand.appendChild(menuBtn);
    brand.appendChild(logo);
    var pill = el('div', 'k-pill');
    pill.appendChild(icon('search'));
    var search = el('input', 'k-search', { type: 'search', placeholder: 'Rechercher', 'aria-label': 'Rechercher' });
    var askBtn = btn('sparkles', 'Demander à l’assistant', function () { askAssistant(); }, 'k-ask');
    var clear = btn('x', 'Effacer la recherche', function () {
      search.value = '';
      ui.query = '';
      ui.ai = null;
      clear.hidden = true;
      askBtn.classList.remove('is-ready');
      drawAi();
      drawGrid();
      search.focus();
    }, 'k-clear');
    clear.hidden = true;
    var statusEl = el('span', 'k-status');
    pill.appendChild(search);
    pill.appendChild(askBtn);
    pill.appendChild(clear);
    pill.appendChild(statusEl);
    header.appendChild(brand);
    header.appendChild(pill);

    /* drawer: Notes and Archive (+ sign out) */
    var body = el('div', 'k-body');
    var drawer = el('nav', 'k-drawer', { 'aria-label': 'Navigation des notes' });
    var navs = [
      { archive: false, btn: navItem('bulb', 'Notes') },
      { archive: true, btn: navItem('archive', 'Archive') },
    ];
    navs.forEach(function (it) {
      it.btn.addEventListener('click', function () {
        ui.archive = it.archive;
        if ((global.innerWidth || 1200) < DRAWER_WIDE) setDrawer(false);
        draw();
      });
      drawer.appendChild(it.btn);
    });
    if (deps.onSignOut) {
      var out = navItem('logout', 'Se déconnecter');
      out.classList.add('k-nav-foot');
      out.addEventListener('click', function () { deps.onSignOut(); });
      drawer.appendChild(out);
    }
    // The grid changes width when the drawer slides: re-count the columns once it has moved.
    drawer.addEventListener('transitionend', function () { if (columnCount() !== lastCols) drawGrid(); });

    /* content: composer slot above the grid */
    var content = el('div', 'k-content');
    var main = el('main', 'k-main');
    var composerSlot = el('div', 'k-composer-slot');
    var aiSlot = el('div', 'k-ai-slot');
    aiSlot.hidden = true;
    var toolbar = el('div', 'k-toolbar');
    var sortBtn = el('button', 'k-tool', { type: 'button' });
    var eyeBtn = el('button', 'k-tool k-tool-eye', { type: 'button' });
    toolbar.appendChild(sortBtn);
    toolbar.appendChild(eyeBtn);
    sortBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!global.ContextMenu || typeof global.ContextMenu.show !== 'function') return;
      var r = sortBtn.getBoundingClientRect();
      global.ContextMenu.show({ clientX: r.left, clientY: r.bottom + 4 }, KM().SORTS.map(function (s) {
        return { id: 'sort-' + s.id, label: s.label, icon: s.icon, checked: ui.sort === s.id, action: function () { setSort(s.id); } };
      }));
    });
    eyeBtn.addEventListener('click', function () {
      ui.showHidden = !ui.showHidden;
      drawGrid();
    });
    var gridArea = el('div', 'k-grid-area');
    main.appendChild(composerSlot);
    main.appendChild(aiSlot);
    main.appendChild(toolbar);
    main.appendChild(gridArea);
    content.appendChild(main);
    body.appendChild(drawer);
    body.appendChild(content);
    root.appendChild(header);
    root.appendChild(body);

    function setDrawer(open) {
      ui.drawer = open;
      root.classList.toggle('k-drawer-open', open);
    }
    setDrawer(ui.drawer);

    search.addEventListener('input', function () {
      ui.query = search.value;
      ui.ai = null;
      clear.hidden = !ui.query;
      askBtn.classList.toggle('is-ready', !!ui.query.trim());
      drawAi();
      drawGrid();
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        askAssistant();
      } else if (e.key === 'Escape' && (ui.query || ui.ai)) {
        e.stopPropagation();
        clear.click();
      }
    });

    /* assistant: Enter asks, the answer strip sits above the ranked notes; typing or clearing goes back to the plain filter */
    function askAssistant() {
      var q = ui.query.trim();
      if (!q || !global.KeepAI) return;
      var mine = { q: q, status: 'busy', answer: '', ids: null };
      ui.ai = mine;
      drawAi();
      drawGrid();
      global.KeepAI.ask(deps.t, q, ui.notes.filter(function (n) { return !ui.hidden[n.id]; })).then(function (res) {
        if (ui.ai !== mine) return;
        mine.status = 'done';
        mine.answer = res.answer;
        mine.ids = res.ids;
      }, function (err) {
        if (ui.ai !== mine) return;
        mine.status = 'error';
        mine.answer = (err && err.message) || 'Assistant indisponible : recherche simple.';
      }).then(function () {
        if (ui.ai !== mine) return;
        drawAi();
        drawGrid();
      });
    }

    function drawAi() {
      var a = ui.ai;
      aiSlot.textContent = '';
      aiSlot.hidden = !a;
      if (!a) return;
      var strip = el('div', 'k-ai' + (a.status === 'error' ? ' is-quiet' : ''));
      strip.appendChild(icon(a.status === 'busy' ? 'loader-2' : 'sparkles'));
      if (a.status === 'busy') strip.firstChild.classList.add('k-spin');
      strip.appendChild(el('span', 'k-ai-text', { text: a.status === 'busy' ? 'Je cherche…' : a.answer || (a.ids && a.ids.length ? '' : 'Aucune note ne correspond.') }));
      strip.appendChild(btn('x', 'Fermer la réponse', function () { ui.ai = null; drawAi(); drawGrid(); }, 'k-ai-close'));
      aiSlot.appendChild(strip);
    }

    /* clicking outside an open composer saves it and folds it back, like Keep */
    var pressedInComposer = false;
    document.addEventListener('mousedown', function (e) {
      pressedInComposer = !!(ui.composing && ui.composing.box && ui.composing.box.contains(e.target));
    }, true);
    document.addEventListener('click', function (e) {
      var d = ui.composing;
      if (pressedInComposer) { pressedInComposer = false; return; } // selection drag released outside the composer
      // A target already removed by the re-render (the click that opened the composer) is not an outside click.
      if (d && d.box && e.target.isConnected && !d.box.contains(e.target) && !ui.dialog) closeComposer(true);
    });

    function setStatus(s, pending) {
      ui.status = s;
      statusEl.className = 'k-status is-' + s;
      statusEl.textContent = '';
      statusEl.hidden = s !== 'offline' && s !== 'syncing' && !pending;
      if (s === 'offline' && global.Connection) statusEl.appendChild(global.Connection.indicator());
      else statusEl.appendChild(icon(s === 'offline' ? 'cloud-off' : 'refresh'));
      if (pending) statusEl.appendChild(el('span', 'k-pending', { text: String(pending) }));
      statusEl.title = s === 'offline' ? 'Hors ligne' : 'En attente d’envoi';
    }

    async function reload() {
      ui.notes = await store.visible();
      drawGrid();
      setStatus(ui.status === 'offline' ? 'offline' : 'idle', await store.pending());
    }

    async function runSync() {
      if (ui.status === 'syncing') { sync.run(); return; }
      setStatus('syncing', await store.pending());
      var res = await sync.run();
      ui.status = res.offline ? 'offline' : 'idle';
      await reload();
    }

    function queueSync() {
      global.clearTimeout(syncTimer);
      syncTimer = global.setTimeout(runSync, 400);
    }

    async function saveNote(note) {
      await sync.save(note);
      await reload();
      queueSync();
    }

    function draw() {
      navs.forEach(function (it) { it.btn.classList.toggle('is-on', it.archive === ui.archive); });
      composerSlot.hidden = ui.archive;
      drawGrid();
    }

    /* composer: "Prendre une note…" folds open in place, into the same editor as a note */
    function renderComposer() {
      composerSlot.textContent = '';
      if (ui.composing) {
        composerSlot.appendChild(composingBox(ui.composing));
        return;
      }
      var bar = el('div', 'k-composer');
      var take = el('button', 'k-composer-take', { type: 'button', text: 'Prendre une note…' });
      take.addEventListener('click', function () { openComposer(false); });
      bar.appendChild(take);
      bar.appendChild(btn('checkbox', 'Nouvelle liste', function () { openComposer(true); }));
      composerSlot.appendChild(bar);
    }

    function openComposer(asList) {
      if (ui.composing) { ui.composing.ed.focusBody(); return; }
      var n = KM().blank('');
      n.id = '';
      var ed = buildEditor(n, null);
      if (asList) ed.setBody('- [ ] ');
      ui.composing = { ed: ed, box: null };
      renderComposer();
      global.setTimeout(function () { ed.focusBody(); }, 0);
    }

    function composingBox(d) {
      var box = el('div', 'k-composer is-open', { 'data-color': d.ed.getNote().color || '' });
      d.box = box;
      box.appendChild(d.ed.el);
      var bar = el('div', 'k-bar');
      var host = el('span', 'k-palette-host');
      host.appendChild(btn('palette', 'Couleur', function () {
        togglePalette(host, d.ed.getNote().color, function (c) {
          d.ed.patch({ color: c });
          box.setAttribute('data-color', c || '');
        });
      }));
      bar.appendChild(host);
      var close = el('button', 'k-close', { type: 'button', text: 'Fermer' });
      close.addEventListener('click', function () { closeComposer(true); });
      bar.appendChild(close);
      box.appendChild(bar);
      return box;
    }

    function closeComposer(save) {
      var d = ui.composing;
      if (!d) return;
      ui.composing = null;
      if (save) {
        var next = d.ed.getNote();
        // A titled list with no items yet is still a note: only a body that is just an empty "- [ ]" is nothing.
        var items = KM().serializeLines(KM().parseLines(next.body)).trim();
        if (String(next.title || '').trim() || (items && items !== '- [ ]')) {
          delete next.id;
          saveNote(next);
        }
      }
      renderComposer();
    }

    /* grid */
    function emptyState() {
      var e = el('div', 'k-empty');
      e.appendChild(icon(ui.archive ? 'archive' : ui.query ? 'search' : 'bulb'));
      var txt = ui.archive ? 'Aucune note archivée' : ui.query ? 'Aucun résultat' : '';
      if (txt) e.appendChild(el('p', '', { text: txt }));
      return e;
    }

    function setSort(id) {
      ui.sort = id;
      try { global.localStorage.setItem(SORT_KEY, id); } catch (e) { /* private mode: the choice lasts until reload */ }
      drawGrid();
    }

    /** Sort and eye buttons: always there, the eye is quieter when no note is hidden. */
    function drawToolbar() {
      var cur = KM().SORTS.filter(function (s) { return s.id === ui.sort; })[0] || KM().SORTS[0];
      sortBtn.textContent = '';
      sortBtn.appendChild(icon(cur.icon));
      sortBtn.appendChild(el('span', '', { text: cur.label }));
      sortBtn.title = 'Trier les notes';
      var count = ui.notes.filter(function (n) { return n.hide && !n.arch === !ui.archive; }).length;
      eyeBtn.textContent = '';
      eyeBtn.appendChild(icon(ui.showHidden ? 'eye' : 'eye-off'));
      if (count) eyeBtn.appendChild(el('span', '', { text: String(count) }));
      eyeBtn.title = ui.showHidden ? 'Masquer les notes masquées' : 'Afficher les notes masquées';
      eyeBtn.setAttribute('aria-label', eyeBtn.title);
      eyeBtn.setAttribute('aria-pressed', ui.showHidden ? 'true' : 'false');
      eyeBtn.classList.toggle('is-on', ui.showHidden);
      eyeBtn.classList.toggle('is-empty', !count);
    }

    function drawGrid() {
      gridArea.textContent = '';
      drawToolbar();
      var visible = ui.notes.filter(function (n) { return !ui.hidden[n.id] && (ui.showHidden || !n.hide); });
      var ranked = ui.ai && ui.ai.status === 'done' && ui.ai.ids && ui.ai.ids.length;
      if (ranked) {
        // The assistant's answer: its notes in its order (archived ones too), no groups, no drag.
        var byId = {};
        visible.forEach(function (n) { byId[n.id] = n; });
        lastCols = columnCount();
        section('', ui.ai.ids.map(function (id) { return byId[id]; }).filter(Boolean), true);
        return;
      }
      var list = KM().sortNotes(visible.filter(function (n) { return !!n.arch === ui.archive && KM().matches(n, ui.query); }), ui.sort);
      if (!list.length) {
        gridArea.appendChild(emptyState());
        return;
      }
      lastCols = columnCount();
      var pinned = list.filter(function (n) { return n.pin; });
      var others = list.filter(function (n) { return !n.pin; });
      if (pinned.length && others.length) section('Épinglées', pinned);
      section(pinned.length && others.length ? 'Autres' : '', pinned.length && others.length ? others : list);
    }

    function section(label, notes, noDrag) {
      if (label) gridArea.appendChild(el('h2', 'k-section', { text: label }));
      var grid = el('div', 'k-grid');
      // Real columns, not CSS multi-columns: iOS WebKit overlaps text when a card is split across them.
      var count = columnCount();
      var cols = [];
      var load = [];
      for (var i = 0; i < count; i++) {
        cols.push(grid.appendChild(el('div', 'k-col')));
        load.push(0);
      }
      notes.forEach(function (n) {
        var at = load.indexOf(Math.min.apply(null, load));
        cols[at].appendChild(card(n, !noDrag && !ui.query.trim() && ui.sort === 'manual'));
        load[at] += 2 + (n.title ? 1 : 0) + String(n.body || '').split('\n').length;
      });
      gridArea.appendChild(grid);
    }

    function columnCount() {
      var w = gridArea.clientWidth || global.innerWidth || 360;
      return w <= 520 ? 2 : Math.max(1, Math.floor((w + 12) / 252));
    }
    global.addEventListener('resize', function () {
      var n = columnCount();
      if (n !== lastCols && lastCols) { lastCols = n; drawGrid(); }
    });

    function card(n, canDrag) {
      var done = KM().isDone(n);
      var c = el('article', 'k-card' + (done ? ' is-done' : '') + (n.hide ? ' is-hidden' : ''), { 'data-color': n.color || '', tabindex: '0', 'data-id': n.id });
      if (canDrag) bindReorder(c, n);
      c.appendChild(btn(n.pin ? 'pin-filled' : 'pin', n.pin ? 'Désépingler' : 'Épingler', function () {
        saveNote(Object.assign({}, n, { pin: !n.pin }));
      }, 'k-pin' + (n.pin ? ' is-on' : '')));
      if (n.title) c.appendChild(el('h3', 'k-card-title', { text: n.title }));
      var body = el('div', 'k-card-body dc-editor k-rich-view');
      if (String(n.body || '').trim()) global.KeepRich.renderInto(body, n.body);
      body.addEventListener('click', function (e) {
        var li = e.target && e.target.tagName === 'LI' ? e.target : null;
        if (!li || !li.parentNode.classList.contains('dc-todo')) return;
        if (e.clientX - li.getBoundingClientRect().left > 26) return;
        e.stopPropagation();
        var at = Array.prototype.indexOf.call(body.querySelectorAll('ul.dc-todo > li'), li);
        var next = global.KeepRich.toggleTodoAt(n.body, at);
        saveNote(Object.assign({}, n, { body: KM().isFlatList(next) ? KM().sinkDone(next) : next }));
      });
      c.appendChild(body);
      c.appendChild(cardFoot(n));
      c.appendChild(ring(n));
      c.addEventListener('click', function () { openDialog(n); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === c) openDialog(n); });
      c.addEventListener('contextmenu', function (e) {
        if (!global.ContextMenu || typeof global.ContextMenu.show !== 'function') return;
        e.preventDefault();
        global.ContextMenu.show({ clientX: e.clientX, clientY: e.clientY }, noteMenuItems(n));
      });
      return c;
    }

    /* progress ring (bottom right, fixed spot): click completes or reopens, press and drag up or right sets a % */
    function ring(n) {
      var pct = KM().clampPct(n.pct);
      var b = el('button', 'k-ring' + (pct > 0 ? ' has-pct' : ''), { type: 'button' });
      var svg = global.ProgressRing.create(pct);
      b.appendChild(svg);
      b.title = pct >= 100 ? 'Terminé · cliquer pour rouvrir' : pct > 0 ? pct + ' % · cliquer pour terminer' : 'Cliquer pour terminer, glisser pour régler';
      b.setAttribute('aria-label', b.title);
      global.ProgressRing.bindDrag(b, {
        get: function () { return pct; },
        onPreview: function (p) {
          global.ProgressRing.set(svg, p);
          b.classList.toggle('has-pct', p > 0);
          b.title = p + ' %';
        },
        onCommit: function (p) { setProgress(n, p); },
        onClick: function () { setProgress(n, pct >= 100 ? 0 : 100); },
      });
      return b;
    }

    function setProgress(n, p) {
      saveNote(Object.assign({}, n, { pct: p }));
    }

    /* drag a card onto another card of the same group (pinned or not) to move it before or after it */
    function groupOf(n) {
      return KM().sortNotes(ui.notes.filter(function (x) { return !ui.hidden[x.id] && !!x.arch === !!n.arch && !!x.pin === !!n.pin; }));
    }

    function dropSide(card, e) {
      var r = card.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2 ? 'after' : 'before';
    }

    var mark = el('div', 'k-drop-mark');
    mark.hidden = true;

    function showMark(card, side) {
      var host = gridArea.getBoundingClientRect();
      var r = card.getBoundingClientRect();
      mark.style.left = (r.left - host.left) + 'px';
      mark.style.width = r.width + 'px';
      mark.style.top = ((side === 'after' ? r.bottom : r.top) - host.top - 6) + 'px';
      if (mark.parentNode !== gridArea) gridArea.appendChild(mark);
      mark.hidden = false;
    }

    function clearDrag() {
      ui.dragId = null;
      mark.hidden = true;
      gridArea.querySelectorAll('.k-card.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); });
    }

    function bindReorder(c, n) {
      c.draggable = true;
      c.addEventListener('dragstart', function (e) {
        ui.dragId = n.id;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', n.id); } catch (err) { /* ignore */ }
        global.setTimeout(function () { c.classList.add('is-dragging'); }, 0);
      });
      c.addEventListener('dragend', clearDrag);
    }

    function dragTarget(e) {
      if (!ui.dragId) return null;
      var c = e.target && e.target.closest ? e.target.closest('.k-card') : null;
      if (!c || c.getAttribute('data-id') === ui.dragId) return null;
      var dragged = ui.notes.filter(function (x) { return x.id === ui.dragId; })[0];
      var over = ui.notes.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
      // Pinned and other notes are separate groups: a drop across them is refused (the pin moves a note between groups).
      if (!dragged || !over || !!dragged.pin !== !!over.pin || !!dragged.arch !== !!over.arch) return null;
      return { el: c, note: over, dragged: dragged, side: dropSide(c, e) };
    }

    gridArea.addEventListener('dragover', function (e) {
      var t = dragTarget(e);
      if (!t) { mark.hidden = true; return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      showMark(t.el, t.side);
    });
    gridArea.addEventListener('drop', function (e) {
      var t = dragTarget(e);
      clearDrag();
      if (!t) return;
      e.preventDefault();
      var group = groupOf(t.dragged);
      var rest = group.filter(function (x) { return x.id !== t.dragged.id; });
      var at = rest.map(function (x) { return x.id; }).indexOf(t.note.id) + (t.side === 'after' ? 1 : 0);
      var plan = KM().reorderPlan(group, t.dragged.id, at);
      if (!plan.length) return;
      Promise.all(plan.map(function (ch) {
        return store.get(ch.id).then(function (rec) { return sync.save(Object.assign({}, rec, { ord: ch.ord })); });
      })).then(reload).then(queueSync);
    });

    /* undo toast (Ctrl+Z too): archive and delete act at once and can be taken back */
    var toast = null;
    var toastTimer = null;

    function showToast(text, undo) {
      if (toast) toast.remove();
      global.clearTimeout(toastTimer);
      toast = el('div', 'k-toast', { role: 'status' });
      toast.appendChild(el('span', '', { text: text }));
      var b = el('button', 'k-toast-undo', { type: 'button', text: 'Annuler' });
      b.addEventListener('click', function () { runUndo(); });
      toast.appendChild(b);
      document.body.appendChild(toast);
      ui.undo = undo;
      toastTimer = global.setTimeout(hideToast, 6000);
    }

    function hideToast() {
      if (toast) toast.remove();
      toast = null;
      ui.undo = null;
    }

    function runUndo() {
      var fn = ui.undo;
      hideToast();
      if (fn) fn();
    }

    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || String(e.key).toLowerCase() !== 'z' || !ui.undo) return;
      var tg = e.target;
      if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA)$/.test(tg.tagName))) return;
      e.preventDefault();
      runUndo();
    });

    /** Sets a note's archive flag at once; the toast takes it back. `next` is the note to save (it may carry unsaved edits). */
    function archiveNote(next, wasArchived) {
      saveNote(next);
      showToast(wasArchived ? 'Note désarchivée' : 'Note archivée', function () {
        store.get(next.id).then(function (rec) { return rec && saveNote(Object.assign({}, rec, { arch: wasArchived })); });
      });
    }

    /** Hides a note from the grid (or shows it again) at once; the toast takes it back. */
    function hideNote(n) {
      var was = !!n.hide;
      saveNote(Object.assign({}, n, { hide: !was }));
      showToast(was ? 'Note affichée' : 'Note masquée', function () {
        store.get(n.id).then(function (rec) { return rec && saveNote(Object.assign({}, rec, { hide: was })); });
      });
    }

    function deleteNote(n) {
      store.get(n.id).then(function (rec) {
        if (!rec) return;
        return sync.remove(n.id).then(reload).then(queueSync).then(function () {
          showToast('Note supprimée', function () {
            store.get(rec.id).then(function (cur) {
              // Still marked deleted here: bring it back. Already gone from Trello: recreate it from its content.
              if (cur) return store.put(Object.assign({}, rec, { deleted: false })).then(reload).then(queueSync);
              var copy = Object.assign({}, rec);
              delete copy.id;
              return saveNote(copy);
            });
          });
        });
      });
    }

    function duplicateNote(n) {
      var copy = Object.assign({}, n, { ord: null, rev: 1, props: null });
      delete copy.id;
      delete copy.updatedAt;
      saveNote(copy);
    }

    /* right-click menu of a note: the same actions as the card, plus open, finish, convert, duplicate and delete */
    function noteMenuItems(n) {
      var colors = [{ color: '', label: 'Sans couleur' }].concat(KM().COLORS.map(function (c) {
        return { color: c, label: COLOR_LABEL[c] };
      }));
      var done = KM().isDone(n);
      var list = KM().isList(n.body);
      return [
        { title: n.title || 'Note' },
        { id: 'open', label: 'Ouvrir', icon: 'arrows-maximize', action: function () { openDialog(n); } },
        {
          id: 'done',
          label: done ? 'Rouvrir' : 'Terminer',
          icon: done ? 'rotate' : 'circle-check',
          success: !done,
          action: function () { setProgress(n, done ? 0 : 100); },
        },
        { sep: true },
        { id: 'pin', label: n.pin ? 'Désépingler' : 'Épingler', icon: n.pin ? 'pin-filled' : 'pin', action: function () { saveNote(Object.assign({}, n, { pin: !n.pin })); } },
        {
          id: 'color',
          label: 'Couleur',
          icon: 'palette',
          children: colors.map(function (c) {
            return { id: 'color-' + (c.color || 'none'), label: c.label, checked: (n.color || '') === c.color, action: function () { saveNote(Object.assign({}, n, { color: c.color })); } };
          }),
        },
        {
          id: 'convert',
          label: list ? 'Convertir en texte' : 'Convertir en liste',
          icon: list ? 'align-left' : 'checkbox',
          action: function () { saveNote(Object.assign({}, n, { body: list ? KM().toText(n.body) : KM().toList(n.body) })); },
        },
        { id: 'duplicate', label: 'Dupliquer', icon: 'copy', action: function () { duplicateNote(n); } },
        { sep: true },
        { id: 'hide', label: n.hide ? 'Afficher' : 'Masquer', icon: n.hide ? 'eye' : 'eye-off', action: function () { hideNote(n); } },
        { id: 'archive', label: n.arch ? 'Désarchiver' : 'Archiver', icon: n.arch ? 'archive-off' : 'archive', action: function () { archiveNote(Object.assign({}, n, { arch: !n.arch }), !!n.arch); } },
        { id: 'delete', label: 'Supprimer', icon: 'trash', danger: true, action: function () { deleteNote(n); } },
      ];
    }

    /* hover actions under the card: colour and archive */
    function cardFoot(n) {
      var foot = el('div', 'k-card-foot');
      var host = el('span', 'k-palette-host');
      host.appendChild(btn('palette', 'Couleur', function () {
        togglePalette(host, n.color, function (c) { saveNote(Object.assign({}, n, { color: c })); });
      }));
      foot.appendChild(host);
      foot.appendChild(btn(n.hide ? 'eye' : 'eye-off', n.hide ? 'Afficher' : 'Masquer', function () { hideNote(n); }));
      foot.appendChild(btn(n.arch ? 'archive-off' : 'archive', n.arch ? 'Désarchiver' : 'Archiver', function () {
        archiveNote(Object.assign({}, n, { arch: !n.arch }), !!n.arch);
      }));
      return foot;
    }

    /* note dialog: edits a copy; closing saves what changed */
    function openDialog(n) {
      closeDialog(true);
      var original = Object.assign({}, n);
      var ed = buildEditor(n, null);
      var shade = el('div', 'k-shade');
      var box = el('div', 'k-dialog', { role: 'dialog', 'aria-modal': 'true', 'data-color': n.color || '' });

      var top = el('div', 'k-top');
      var pinBtn = btn(n.pin ? 'pin-filled' : 'pin', n.pin ? 'Désépingler' : 'Épingler', function () {
        var pinned = !ed.getNote().pin;
        ed.patch({ pin: pinned });
        setIcon(pinBtn, pinned ? 'pin-filled' : 'pin');
        pinBtn.classList.toggle('is-on', pinned);
      }, n.pin ? 'is-on' : '');
      top.appendChild(pinBtn);
      box.appendChild(top);
      box.appendChild(ed.el);

      var bar = el('div', 'k-bar');
      var host = el('span', 'k-palette-host');
      host.appendChild(btn('palette', 'Couleur', function () {
        togglePalette(host, ed.getNote().color, function (c) {
          ed.patch({ color: c });
          box.setAttribute('data-color', c || '');
        });
      }));
      bar.appendChild(host);
      bar.appendChild(btn(n.arch ? 'archive-off' : 'archive', n.arch ? 'Désarchiver' : 'Archiver', function () {
        ui.dialog = null;
        shade.remove();
        archiveNote(Object.assign({}, ed.getNote(), { arch: !original.arch }), !!original.arch);
      }));
      bar.appendChild(btn('trash', 'Supprimer', function () {
        ui.dialog = null;
        shade.remove();
        deleteNote(original);
      }));
      var close = el('button', 'k-close', { type: 'button', text: 'Fermer' });
      close.addEventListener('click', function () { closeDialog(true); });
      bar.appendChild(close);
      box.appendChild(bar);

      shade.appendChild(box);
      // Close only when the press AND the release are on the backdrop (a text-selection drag ending there is not a click).
      var pressedShade = false;
      shade.addEventListener('mousedown', function (e) { pressedShade = e.target === shade; });
      shade.addEventListener('click', function (e) { if (e.target === shade && pressedShade) closeDialog(true); pressedShade = false; });
      document.body.appendChild(shade);
      ui.dialog = { shade: shade, ed: ed, original: original };
    }

    function closeDialog(save) {
      var d = ui.dialog;
      if (!d) return;
      ui.dialog = null;
      d.shade.remove();
      if (!save) return;
      var next = d.ed.getNote();
      if (KM().snapshot(next) === KM().snapshot(d.original)) return;
      saveNote(next);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (ui.dialog) closeDialog(true);
      else closeComposer(true);
    });

    /* sync triggers */
    global.addEventListener('online', function () { ui.status = 'idle'; runSync(); });
    global.addEventListener('offline', function () { setStatus('offline', 0); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) runSync(); });
    global.setInterval(function () {
      if (!document.hidden && !ui.dialog && !ui.composing && global.navigator.onLine !== false) runSync();
    }, POLL_MS);

    draw();
    renderComposer();
    reload().then(runSync);
    return { reload: reload, sync: runSync };
  }

  global.KeepUI = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
