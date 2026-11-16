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

  function mount(root, deps) {
    var sync = deps.sync;
    var store = deps.store;
    var ui = {
      notes: [], query: '', archive: false, status: 'idle', composing: null, dialog: null,
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
    var clear = btn('x', 'Effacer la recherche', function () {
      search.value = '';
      ui.query = '';
      clear.hidden = true;
      drawGrid();
      search.focus();
    }, 'k-clear');
    clear.hidden = true;
    var statusEl = el('span', 'k-status');
    pill.appendChild(search);
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
    var gridArea = el('div', 'k-grid-area');
    main.appendChild(composerSlot);
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
      clear.hidden = !ui.query;
      drawGrid();
    });

    /* clicking outside an open composer saves it and folds it back, like Keep */
    document.addEventListener('click', function (e) {
      var d = ui.composing;
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

    function drawGrid() {
      gridArea.textContent = '';
      var list = KM().sortNotes(ui.notes.filter(function (n) { return !!n.arch === ui.archive && KM().matches(n, ui.query); }));
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

    function section(label, notes) {
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
        cols[at].appendChild(card(n));
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

    function card(n) {
      var c = el('article', 'k-card', { 'data-color': n.color || '', tabindex: '0' });
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
      c.addEventListener('click', function () { openDialog(n); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === c) openDialog(n); });
      return c;
    }

    /* hover actions under the card: colour and archive */
    function cardFoot(n) {
      var foot = el('div', 'k-card-foot');
      var host = el('span', 'k-palette-host');
      host.appendChild(btn('palette', 'Couleur', function () {
        togglePalette(host, n.color, function (c) { saveNote(Object.assign({}, n, { color: c })); });
      }));
      foot.appendChild(host);
      foot.appendChild(btn(n.arch ? 'archive-off' : 'archive', n.arch ? 'Désarchiver' : 'Archiver', function () {
        saveNote(Object.assign({}, n, { arch: !n.arch }));
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
        saveNote(Object.assign({}, ed.getNote(), { arch: !original.arch }));
      }));
      bar.appendChild(btn('trash', 'Supprimer', function () {
        if (!global.confirm('Supprimer cette note ?')) return;
        ui.dialog = null;
        shade.remove();
        sync.remove(original.id).then(reload).then(queueSync);
      }));
      var close = el('button', 'k-close', { type: 'button', text: 'Fermer' });
      close.addEventListener('click', function () { closeDialog(true); });
      bar.appendChild(close);
      box.appendChild(bar);

      shade.appendChild(box);
      shade.addEventListener('click', function (e) { if (e.target === shade) closeDialog(true); });
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
