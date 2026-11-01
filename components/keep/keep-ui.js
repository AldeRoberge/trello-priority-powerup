/*
 * Role: screen of the Notes app (Google Keep clone). Grid of notes, quick composer, editor, search,
 * archive, sync status. Everything is written to the device first (KeepSync.save) and sent to Trello
 * in the background, so it works offline. DOM only, no Trello calls except through KeepSync / KeepAuth.
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

  /** Title + body of one note, as a list of rows or a text area. getNote() returns the edited note. */
  function buildEditor(note, onChange) {
    var state = { note: Object.assign({}, note) };
    var root = el('div', 'k-editor');
    var title = el('input', 'k-title', { type: 'text', placeholder: 'Titre', value: note.title || '' });
    var body = el('div', 'k-body');
    root.appendChild(title);
    root.appendChild(body);

    function changed() {
      state.note.title = title.value;
      if (onChange) onChange(state.note);
    }
    title.addEventListener('input', changed);

    function renderBody() {
      body.textContent = '';
      body.classList.toggle('is-list', KM().isList(state.note.body));
      if (KM().isList(state.note.body)) renderList();
      else renderText();
    }

    function renderText() {
      var ta = el('textarea', 'k-text', { placeholder: 'Créer une note…', rows: '3' });
      ta.value = state.note.body || '';
      function fit() { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 60) + 'px'; }
      ta.addEventListener('input', function () { state.note.body = ta.value; fit(); changed(); });
      body.appendChild(ta);
      global.setTimeout(fit, 0);
    }

    function renderList(focusIndex) {
      var lines = KM().parseLines(state.note.body);
      function commit() { state.note.body = KM().serializeLines(lines); changed(); }
      lines.forEach(function (l, i) {
        var row = el('div', 'k-row' + (l.t === 'item' && l.checked ? ' is-done' : ''));
        if (l.t === 'item') {
          var cb = el('input', 'k-check', { type: 'checkbox', 'aria-label': 'Terminé' });
          cb.checked = l.checked;
          cb.addEventListener('change', function () {
            l.checked = cb.checked;
            commit();
            state.note.body = KM().sinkDone(state.note.body);
            renderBody();
            changed();
          });
          row.appendChild(cb);
        } else row.appendChild(el('span', 'k-check-gap'));
        var inp = el('input', 'k-item', { type: 'text', placeholder: 'Élément' });
        inp.value = l.text;
        inp.addEventListener('input', function () { l.text = inp.value; commit(); });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            lines.splice(i + 1, 0, { t: 'item', text: '', checked: false });
            commit();
            renderList(i + 1);
          } else if (e.key === 'Backspace' && !inp.value && lines.length > 1) {
            e.preventDefault();
            lines.splice(i, 1);
            commit();
            renderList(Math.max(0, i - 1));
          }
        });
        row.appendChild(inp);
        row.appendChild(btn('x', 'Supprimer', function () { lines.splice(i, 1); commit(); renderList(); }, 'k-row-x'));
        body.appendChild(row);
        if (focusIndex === i) global.setTimeout(function () { inp.focus(); }, 0);
      });
      var add = el('button', 'k-add', { type: 'button' });
      add.appendChild(icon('plus'));
      add.appendChild(el('span', '', { text: 'Élément' }));
      add.addEventListener('click', function () {
        lines.push({ t: 'item', text: '', checked: false });
        commit();
        renderList(lines.length - 1);
      });
      body.appendChild(add);
    }

    renderBody();
    return {
      el: root,
      focusTitle: function () { title.focus(); },
      getNote: function () { state.note.title = title.value; return state.note; },
      setBody: function (b) { state.note.body = b; renderBody(); changed(); },
      patch: function (p) { Object.assign(state.note, p); changed(); },
      isList: function () { return KM().isList(state.note.body); },
    };
  }

  /** Switches a note between text and checklist; the icon always shows what a click will do. */
  function modeButton(ed) {
    var b = btn('checkbox', 'Liste', function () {
      var cur = ed.getNote();
      if (ed.isList()) ed.setBody(KM().toText(cur.body));
      else ed.setBody(KM().toList(cur.body) || '- [ ] ');
      paint();
    });
    function paint() {
      var next = ed.isList() ? 'Texte' : 'Liste';
      b.title = next;
      b.setAttribute('aria-label', next);
      b.textContent = '';
      b.appendChild(icon(ed.isList() ? 'align-left' : 'checkbox'));
    }
    paint();
    return b;
  }

  /* ── App ──────────────────────────────────────────────────────────── */

  function mount(root, deps) {
    var sync = deps.sync;
    var store = deps.store;
    var ui = { notes: [], query: '', archive: false, status: 'idle', composing: null, dialog: null };
    var syncTimer = null;

    root.textContent = '';
    var header = el('header', 'k-header');
    var search = el('input', 'k-search', { type: 'search', placeholder: 'Rechercher', 'aria-label': 'Rechercher' });
    var statusEl = el('span', 'k-status');
    var archiveBtn = btn('archive', 'Archives', function () { ui.archive = !ui.archive; draw(); }, 'k-archive');
    var outBtn = btn('logout', 'Se déconnecter', function () { deps.onSignOut(); });
    header.appendChild(search);
    header.appendChild(statusEl);
    header.appendChild(archiveBtn);
    header.appendChild(outBtn);
    var composerHost = el('div', 'k-composer-host');
    var main = el('main', 'k-main');
    root.appendChild(header);
    root.appendChild(composerHost);
    root.appendChild(main);

    search.addEventListener('input', function () { ui.query = search.value; drawGrid(); });

    function setStatus(s, pending) {
      ui.status = s;
      statusEl.className = 'k-status is-' + s;
      statusEl.textContent = '';
      var name = s === 'offline' ? 'cloud-off' : s === 'syncing' || pending ? 'refresh' : 'cloud-check';
      statusEl.appendChild(icon(name));
      if (pending) statusEl.appendChild(el('span', 'k-pending', { text: String(pending) }));
      statusEl.title = s === 'offline' ? 'Hors ligne' : pending ? 'En attente d’envoi' : 'À jour';
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
      archiveBtn.classList.toggle('is-on', ui.archive);
      composerHost.hidden = ui.archive;
      drawComposer();
      drawGrid();
    }

    /* composer */
    function drawComposer() {
      composerHost.textContent = '';
      if (!ui.composing) {
        var closed = el('div', 'k-composer is-closed');
        var hint = el('span', 'k-composer-hint', { text: 'Créer une note…' });
        closed.appendChild(hint);
        closed.appendChild(btn('checkbox', 'Nouvelle liste', function () { openComposer(true); }));
        closed.addEventListener('click', function () { openComposer(false); });
        composerHost.appendChild(closed);
        return;
      }
      var box = el('div', 'k-composer');
      var ed = ui.composing;
      box.appendChild(ed.el);
      var bar = el('div', 'k-bar');
      bar.appendChild(modeButton(ed));
      bar.appendChild(colorPicker(function (c) { ed.patch({ color: c }); box.setAttribute('data-color', c || ''); }));
      var close = el('button', 'k-close', { type: 'button', text: 'Fermer' });
      close.addEventListener('click', closeComposer);
      bar.appendChild(close);
      box.appendChild(bar);
      box.setAttribute('data-color', ed.getNote().color || '');
      composerHost.appendChild(box);
    }

    function openComposer(asList) {
      var n = KM().blank('');
      n.id = '';
      ui.composing = buildEditor(n, null);
      if (asList) ui.composing.setBody('- [ ] ');
      drawComposer();
      global.setTimeout(function () {
        var f = composerHost.querySelector(asList ? '.k-item' : '.k-text');
        if (f) f.focus();
      }, 0);
    }

    async function closeComposer() {
      var note = ui.composing && ui.composing.getNote();
      ui.composing = null;
      drawComposer();
      if (note && !KM().isEmpty(note) && KM().serializeLines(KM().parseLines(note.body)) !== '- [ ]') {
        delete note.id;
        await saveNote(note);
      }
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
      var lines = KM().parseLines(n.body);
      var body = el('div', 'k-card-body');
      var index = -1;
      lines.forEach(function (l) {
        if (l.t === 'item') {
          index++;
          var at = index;
          var row = el('label', 'k-row' + (l.checked ? ' is-done' : ''));
          var cb = el('input', 'k-check', { type: 'checkbox' });
          cb.checked = l.checked;
          cb.addEventListener('click', function (e) { e.stopPropagation(); });
          cb.addEventListener('change', function () {
            saveNote(Object.assign({}, n, { body: KM().sinkDone(KM().toggleItem(n.body, at)) }));
          });
          row.appendChild(cb);
          row.appendChild(el('span', 'k-item-text', { text: l.text }));
          body.appendChild(row);
        } else if (l.text.trim()) body.appendChild(el('p', 'k-line', { text: l.text }));
      });
      c.appendChild(body);
      var actions = el('div', 'k-actions');
      actions.appendChild(btn('pin', n.pin ? 'Désépingler' : 'Épingler', function () { saveNote(Object.assign({}, n, { pin: !n.pin })); }, n.pin ? 'is-on' : ''));
      actions.appendChild(btn(n.arch ? 'archive-off' : 'archive', n.arch ? 'Désarchiver' : 'Archiver', function () { saveNote(Object.assign({}, n, { arch: !n.arch })); }));
      c.appendChild(actions);
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

    function openDialog(n) {
      closeDialog();
      var ed = buildEditor(n, null);
      var shade = el('div', 'k-shade');
      var box = el('div', 'k-dialog', { role: 'dialog', 'aria-modal': 'true', 'data-color': n.color || '' });
      box.appendChild(ed.el);
      var bar = el('div', 'k-bar');
      bar.appendChild(modeButton(ed));
      bar.appendChild(colorPicker(function (c) { ed.patch({ color: c }); box.setAttribute('data-color', c || ''); }));
      bar.appendChild(btn('trash', 'Supprimer', function () {
        if (!global.confirm('Supprimer cette note ?')) return;
        ui.dialog = null;
        shade.remove();
        sync.remove(n.id).then(reload).then(queueSync);
      }));
      var close = el('button', 'k-close', { type: 'button', text: 'Fermer' });
      close.addEventListener('click', function () { closeDialog(true); });
      bar.appendChild(close);
      box.appendChild(bar);
      shade.appendChild(box);
      shade.addEventListener('click', function (e) { if (e.target === shade) closeDialog(true); });
      document.body.appendChild(shade);
      ui.dialog = { shade: shade, ed: ed, original: n };
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
