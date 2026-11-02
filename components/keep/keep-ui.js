/*
 * Role: screen of the Notes app (Google Keep clone, rich content like Documents). Grid of notes, quick composer, editor, search,
 * archive, sync status. Everything is written to the device first (KeepSync.save) and sent to Trello
 * in the background, so it works offline. DOM only, no Trello calls except through KeepSync.
 * Exposes window.KeepUI.mount(root).
 */
(function (global) {
  'use strict';

  var KM = function () { return global.KeepModel; };
  var POLL_MS = 10000;
  var COLOR_LABEL = { yellow: 'Jaune', green: 'Vert', blue: 'Bleu', pink: 'Rose', purple: 'Violet', gray: 'Gris' };

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

  function btn(iconName, label, onClick, cls) {
    var b = el('button', 'k-btn' + (cls ? ' ' + cls : ''), { type: 'button', title: label, 'aria-label': label });
    b.appendChild(icon(iconName));
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(e); });
    return b;
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
    var ui = { notes: [], query: '', archive: false, status: 'idle', composing: null, dialog: null };
    var syncTimer = null;

    root.textContent = '';
    var header = el('header', 'k-header');
    var pill = el('div', 'k-pill');
    var menuBtn = btn('menu-2', 'Menu', function () { toggleMenu(); }, 'k-menu-btn');
    var search = el('input', 'k-search', { type: 'search', placeholder: 'Rechercher dans les notes', 'aria-label': 'Rechercher' });
    var statusEl = el('span', 'k-status');
    pill.appendChild(menuBtn);
    pill.appendChild(search);
    pill.appendChild(statusEl);
    header.appendChild(pill);
    var menuEl = el('div', 'k-menu');
    menuEl.hidden = true;
    pill.appendChild(menuEl);
    var main = el('main', 'k-main');
    var fab = el('button', 'k-fab', { type: 'button', title: 'Nouvelle note', 'aria-label': 'Nouvelle note' });
    fab.appendChild(icon('plus'));
    fab.addEventListener('click', function () { openComposer(false); });
    var dock = el('nav', 'k-dock');
    dock.appendChild(btn('checkbox', 'Nouvelle liste', function () { openComposer(true); }));
    root.appendChild(header);
    root.appendChild(main);
    root.appendChild(dock);
    root.appendChild(fab);

    function toggleMenu(force) {
      var open = force === undefined ? menuEl.hidden : force;
      menuEl.hidden = !open;
      if (!open) return;
      menuEl.textContent = '';
      [['notes', 'Notes', false], ['archive', 'Archives', true]].forEach(function (it) {
        var b = el('button', 'k-menu-item' + (ui.archive === it[2] ? ' is-on' : ''), { type: 'button' });
        b.appendChild(icon(it[0]));
        b.appendChild(el('span', '', { text: it[1] }));
        b.addEventListener('click', function () { ui.archive = it[2]; toggleMenu(false); draw(); });
        menuEl.appendChild(b);
      });
      if (deps.onSignOut) {
        var o = el('button', 'k-menu-item', { type: 'button' });
        o.appendChild(icon('logout'));
        o.appendChild(el('span', '', { text: 'Se déconnecter' }));
        o.addEventListener('click', function () { deps.onSignOut(); });
        menuEl.appendChild(o);
      }
    }
    document.addEventListener('click', function (e) { if (!menuEl.hidden && !pill.contains(e.target)) toggleMenu(false); });

    search.addEventListener('input', function () { ui.query = search.value; drawGrid(); });

    function setStatus(s, pending) {
      ui.status = s;
      statusEl.className = 'k-status is-' + s;
      statusEl.textContent = '';
      statusEl.hidden = s !== 'offline' && s !== 'syncing' && !pending;
      var name = s === 'offline' ? 'cloud-off' : 'refresh';
      statusEl.appendChild(icon(name));
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
      menuBtn.classList.toggle('is-on', ui.archive);
      fab.hidden = dock.hidden = ui.archive;
      drawGrid();
    }

    /* composer: a new note opens in the same sheet as an existing one */
    function openComposer(asList) {
      var n = KM().blank('');
      n.id = '';
      openDialog(n, true, asList);
    }

    /* grid */
    function drawGrid() {
      main.textContent = '';
      var list = KM().sortNotes(ui.notes.filter(function (n) { return !!n.arch === ui.archive && KM().matches(n, ui.query); }));
      if (!list.length) {
        main.appendChild(el('p', 'k-empty', { text: ui.archive ? 'Aucune note archivée' : ui.query ? 'Aucun résultat' : '' }));
        return;
      }
      var pinned = list.filter(function (n) { return n.pin; });
      var others = list.filter(function (n) { return !n.pin; });
      if (pinned.length && others.length) section('Épinglées', pinned);
      section(pinned.length && others.length ? 'Autres' : '', pinned.length && others.length ? others : list);
    }

    function section(label, notes) {
      if (label) main.appendChild(el('h2', 'k-section', { text: label }));
      var grid = el('div', 'k-grid');
      notes.forEach(function (n) { grid.appendChild(card(n)); });
      main.appendChild(grid);
    }

    function card(n) {
      var c = el('article', 'k-card', { 'data-color': n.color || '', tabindex: '0' });
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
      c.addEventListener('click', function () { openDialog(n); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target === c) openDialog(n); });
      return c;
    }

    /* dialog */
    function colorPicker(onPick) {
      var wrap = el('span', 'k-colors');
      [''].concat(KM().COLORS).forEach(function (c) {
        var b = el('button', 'k-dot', { type: 'button', 'data-color': c, title: c ? COLOR_LABEL[c] : 'Sans couleur', 'aria-label': c ? COLOR_LABEL[c] : 'Sans couleur' });
        b.addEventListener('click', function (e) { e.stopPropagation(); onPick(c); });
        wrap.appendChild(b);
      });
      return wrap;
    }

    function openDialog(n, isNew, asList) {
      closeDialog();
      var ed = buildEditor(n, null);
      if (asList) ed.setBody('- [ ] ');
      if (isNew) ui.composing = ed;
      var shade = el('div', 'k-shade');
      var box = el('div', 'k-dialog', { role: 'dialog', 'aria-modal': 'true', 'data-color': n.color || '' });
      if (!isNew) {
        var top = el('div', 'k-top');
        top.appendChild(btn('pin', n.pin ? 'Désépingler' : 'Épingler', function (e) {
          n.pin = !n.pin;
          ed.patch({ pin: n.pin });
          e.currentTarget.classList.toggle('is-on', n.pin);
        }, n.pin ? 'is-on' : ''));
        box.appendChild(top);
      }
      box.appendChild(ed.el);
      var bar = el('div', 'k-bar');
      bar.appendChild(colorPicker(function (c) { ed.patch({ color: c }); box.setAttribute('data-color', c || ''); }));
      if (!isNew) {
        bar.appendChild(btn(n.arch ? 'archive-off' : 'archive', n.arch ? 'Désarchiver' : 'Archiver', function () {
          ui.dialog = null;
          shade.remove();
          saveNote(Object.assign({}, ed.getNote(), { arch: !n.arch }));
        }));
        bar.appendChild(btn('trash', 'Supprimer', function () {
          if (!global.confirm('Supprimer cette note ?')) return;
          ui.dialog = null;
          shade.remove();
          sync.remove(n.id).then(reload).then(queueSync);
        }));
      }
      var close = el('button', 'k-close', { type: 'button', text: 'Fermer' });
      close.addEventListener('click', function () { closeDialog(true); });
      bar.appendChild(close);
      box.appendChild(bar);
      shade.appendChild(box);
      shade.addEventListener('click', function (e) { if (e.target === shade) closeDialog(true); });
      document.body.appendChild(shade);
      ui.dialog = { shade: shade, ed: ed, original: n, isNew: !!isNew };
      if (isNew) global.setTimeout(function () { ed.focusBody(); }, 0);
    }

    function closeDialog(save) {
      var d = ui.dialog;
      if (!d) return;
      ui.dialog = null;
      ui.composing = null;
      d.shade.remove();
      if (!save) return;
      var next = d.ed.getNote();
      if (d.isNew) {
        if (!KM().isEmpty(next) && KM().serializeLines(KM().parseLines(next.body)) !== '- [ ]') {
          delete next.id;
          saveNote(next);
        }
        return;
      }
      if (KM().snapshot(next) === KM().snapshot(d.original)) return;
      saveNote(next);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDialog(true);
    });

    /* sync triggers */
    global.addEventListener('online', function () { ui.status = 'idle'; runSync(); });
    global.addEventListener('offline', function () { setStatus('offline', 0); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) runSync(); });
    global.setInterval(function () {
      if (!document.hidden && !ui.dialog && !ui.composing && global.navigator.onLine !== false) runSync();
    }, POLL_MS);

    draw();
    reload().then(runSync);
    return { reload: reload, sync: runSync };
  }

  global.KeepUI = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
