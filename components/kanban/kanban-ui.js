/*
 * Role: UI of the Kanban view — the board's lists as columns, cards as tiles, like Trello but in the
 * app's own look (kanban-ui.css). Same data and writes as the Table (TableTrello / TableModel):
 *  - drag a card to another column or to a new position (saved to Trello as list + pos)
 *  - "+ Ajouter une carte" at the bottom of each column; click a tile to open the card
 *  - urgency / due / progress chips open the shared CardFields editors; right-click: card menu
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var TM = function () { return global.TableModel; };
  var TT = function () { return global.TableTrello; };
  var KM = function () { return global.KanbanModel; };
  var MENU = function () { return global.TableMenu; };

  var URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };
  var HIDE_DONE_KEY = 'tp-kanban-hide-done';

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name, cls) {
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : '') });
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* Placeholder columns shown while data loads. */
  function skeletonCols() {
    var out = '';
    [3, 2, 4, 2].forEach(function (n) {
      out += '<div class="kb-col kb-col--skel"><div class="kb-skel kb-skel--head"></div>';
      for (var i = 0; i < n; i++) out += '<div class="kb-skel kb-skel--card"></div>';
      out += '</div>';
    });
    return out;
  }

  function mount(root, t) {
    function readHideDone() {
      try { return global.localStorage.getItem(HIDE_DONE_KEY) === '1'; } catch (e) { return false; }
    }
    var state = {
      lists: [],
      rows: [],
      filter: '',
      hideDone: readHideDone(),
      authOk: true,
      dragId: null,
      composer: null, // list id with the open "add card" composer
      status: '',
      statusKind: '',
    };
    var statusTimer = null;
    var HP = null;

    root.innerHTML = '';
    var els = {
      bar: h('div', { class: 'kb-bar' }),
      banner: h('div', { class: 'kb-banner', hidden: true }),
      board: h('div', { class: 'kb-board' }),
    };
    root.appendChild(h('div', { class: 'kb-root', tabindex: '-1' }, [els.bar, els.banner, els.board]));

    /* ── Status + errors ───────────────────────────────────────────── */
    function setStatus(msg, kind, keepMs) {
      state.status = msg || '';
      state.statusKind = kind || '';
      paintStatus();
      clearTimeout(statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        statusTimer = setTimeout(function () { setStatus('', ''); }, keepMs || 2500);
      }
    }

    function paintStatus() {
      var s = els.bar.querySelector('.kb-status');
      if (!s) return;
      s.className = 'kb-status' + (state.statusKind ? ' is-' + state.statusKind : '');
      s.textContent = '';
      if (state.statusKind === 'ok') s.appendChild(icon('check'));
      if (state.statusKind === 'busy') s.appendChild(icon('refresh', 'kb-spin'));
      if (state.statusKind === 'error') s.appendChild(icon('alert-triangle'));
      s.appendChild(document.createTextNode(state.status));
    }

    function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        state.authOk = false;
        renderBanner();
        setStatus('Autorisez Trello pour enregistrer les modifications.', 'error');
      } else {
        setStatus('Échec : ' + (reason || 'erreur inconnue'), 'error');
      }
    }

    function renderBanner() {
      els.banner.hidden = state.authOk;
      els.banner.textContent = '';
      if (state.authOk) return;
      els.banner.appendChild(h('span', { text: 'Autorisez Cerveau à écrire dans Trello pour déplacer et modifier les cartes.' }));
      els.banner.appendChild(h('button', {
        class: 'kb-btn kb-btn--primary',
        onclick: function () {
          global.GanttTrello.ensureRestAuthorized(t).then(function (r) { state.authOk = !!r.ok; renderBanner(); }, fail);
        },
      }, [icon('lock-open'), h('span', { text: 'Autoriser' })]));
    }

    /* ── History panel ─────────────────────────────────────────────── */
    function record(e) { return HP ? HP.record(e) : e; }

    /** Runs the write that moves an entry back to its "before" state (`back`) or forward to its "after" state. */
    function applyEntry(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      if (e.type === 'archive') return back ? TT().unarchiveCard(t, e.targetId) : TT().archiveCard(t, e.targetId);
      if (e.type === 'create') return back ? TT().archiveCard(t, e.targetId) : TT().unarchiveCard(t, e.targetId);
      if (e.type === 'move') return TT().moveCard(t, e.targetId, val, back ? e.beforePos : e.afterPos);
      if (e.type === 'reorder') return TT().reorderCard(t, e.targetId, val);
      return Promise.reject(new Error('Cette modification ne peut pas être annulée'));
    }

    function histVerb(e) {
      if (e.type === 'archive') return 'archivée';
      if (e.type === 'create') return 'créée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      if (e.type === 'move') return 'déplacée';
      if (e.type === 'reorder') return 'réordonnée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      return (e.label || 'Champ') + ' modifié';
    }

    var boardId = '';
    try { boardId = (t && typeof t.getContext === 'function' && t.getContext().board) || ''; } catch (e) { /* no context */ }
    if (global.HistoryPanel) {
      HP = global.HistoryPanel.create({
        key: 'tp-kanban-history:' + boardId,
        apply: applyEntry,
        verb: histVerb,
        after: function () { return reload({ quiet: true }); },
        onStatus: function (m, kind) { setStatus(m, kind); },
        onError: fail,
      });
    }

    /* ── Helpers ───────────────────────────────────────────────────── */
    function findRow(id) {
      return state.rows.filter(function (r) { return r.id === id; })[0] || null;
    }
    function listById(id) {
      return state.lists.filter(function (l) { return l.id === id; })[0] || null;
    }
    function columns() {
      return KM().buildColumns(state.rows, state.lists, { filter: state.filter, hideDone: state.hideDone });
    }

    function openCard(row) {
      if (!row || typeof t.modal !== 'function') return;
      t.modal({
        title: row.name || 'Carte',
        url: global.PriorityTrello.pageUrl('./popup.html'),
        args: { cardId: row.id, cardName: row.name || '', openSection: null },
        fullscreen: true,
        accentColor: '#22272B',
        callback: function () {
          return t.modal({
            title: 'Kanban',
            url: global.PriorityTrello.pageUrl('./kanban.html'),
            fullscreen: true,
            accentColor: '#22272B',
          });
        },
      });
    }

    /** Opens the shared CardFields editor (progress / priority / due) hanging from `anchor`. */
    function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return false;
      return global.CardFields.open(kind, {
        t: t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        onSaved: function () {
          setStatus('Enregistré', 'ok');
          record({ type: 'field', label: { priority: 'Urgence', due: 'Échéance', progress: 'Progrès' }[kind] || 'Champ', targetId: row.id, title: row.name });
        },
        onError: function (m) { setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) reload({ quiet: true }); },
      });
    }

    /* ── Toolbar ───────────────────────────────────────────────────── */
    function btn(iconName, label, opts) {
      opts = opts || {};
      return h('button', {
        class: 'kb-btn' + (opts.active ? ' is-active' : '') + (label ? '' : ' kb-btn--icon'),
        title: opts.title || label || null,
        onclick: opts.onclick,
      }, [icon(iconName), label ? h('span', { text: label }) : null]);
    }

    function renderBar() {
      els.bar.textContent = '';
      var filter = h('input', {
        class: 'kb-filter',
        type: 'search',
        placeholder: 'Filtrer…',
        value: state.filter,
        oninput: function (e) {
          state.filter = e.target.value;
          renderBoard();
          paintCount();
        },
      });
      var done = state.rows.filter(function (r) { return r.statutKey === 'completed' || r.statutKey === 'canceled'; }).length;
      [
        h('label', { class: 'kb-search' }, [icon('search'), filter]),
        btn('refresh', null, { title: 'Actualiser', onclick: function () { reload(); } }),
        btn(state.hideDone ? 'eye-off' : 'eye', state.hideDone ? 'Terminées masquées' + (done ? ' (' + done + ')' : '') : 'Terminées', {
          active: state.hideDone,
          title: state.hideDone ? 'Afficher les cartes terminées' : 'Masquer les cartes terminées',
          onclick: function () {
            state.hideDone = !state.hideDone;
            try { global.localStorage.setItem(HIDE_DONE_KEY, state.hideDone ? '1' : '0'); } catch (e) { /* ignore */ }
            renderBar();
            renderBoard();
          },
        }),
        HP ? HP.button(document.body) : null,
        h('span', { class: 'kb-status' }),
        h('span', { class: 'kb-spacer' }),
        h('span', { class: 'kb-count', 'aria-live': 'polite' }),
      ].forEach(function (c) { els.bar.appendChild(c); });
      paintStatus();
      paintCount();
    }

    function paintCount() {
      var c = els.bar.querySelector('.kb-count');
      if (!c) return;
      var shown = columns().reduce(function (n, col) { return n + col.cards.length; }, 0);
      var total = state.rows.length;
      c.textContent = (shown === total ? total : shown + ' / ' + total) + (total > 1 ? ' cartes' : ' carte');
    }

    /* ── Card tile ─────────────────────────────────────────────────── */
    function chip(cls, iconName, text, title, onclick) {
      return h('button', { class: 'kb-chip ' + cls, title: title || null, onclick: onclick }, [icon(iconName), text ? h('span', { text: text }) : null]);
    }

    function tile(row, list) {
      var badges = [];
      if (row.urgency) {
        var tone = URGENCY_TONE[row.urgency];
        badges.push(chip('kb-chip--u' + (tone == null ? 0 : tone), 'flame', row.urgency, 'Urgence · cliquer pour modifier', function (e) {
          e.stopPropagation();
          openEditor(row, 'priority', e.currentTarget);
        }));
      }
      if (row.due) {
        var closed = KM().isClosedKey(row.statutKey);
        var overdue = /^\d{4}-\d{2}-\d{2}/.test(row.due) && row.due.slice(0, 10) < todayIso() && !closed;
        badges.push(chip('kb-chip--due' + (overdue ? ' is-overdue' : ''), overdue ? 'calendar-exclamation' : 'calendar-event', TM().formatDay(row.due), (overdue ? 'En retard · ' : '') + row.due, function (e) {
          e.stopPropagation();
          openEditor(row, 'due', e.currentTarget);
        }));
      }
      if (typeof row.priority === 'number') {
        badges.push(chip('kb-chip--prio', 'flag', String(row.priority), 'Priorité' + (row.tier ? ' · ' + row.tier : ''), function (e) {
          e.stopPropagation();
          openEditor(row, 'priority', e.currentTarget);
        }));
      }
      var kids = [];
      if (row.category) kids.push(h('div', { class: 'kb-cat', text: row.category }));
      kids.push(h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
      if (badges.length) kids.push(h('div', { class: 'kb-badges' }, badges));
      if (typeof row.progress === 'number') {
        var p = Math.max(0, Math.min(100, row.progress));
        var prog = h('button', {
          class: 'kb-prog' + (p >= 100 ? ' is-done' : ''),
          title: 'Progrès · cliquer pour modifier',
          onclick: function (e) {
            e.stopPropagation();
            openEditor(row, 'progress', e.currentTarget);
          },
        }, [
          h('span', { class: 'kb-prog-bar' }, [h('i', { style: 'width:' + p + '%' })]),
          h('span', { class: 'kb-prog-num', text: p + '%' }),
        ]);
        kids.push(prog);
      }
      var el = h('div', {
        class: 'kb-card',
        draggable: 'true',
        tabindex: '0',
        'data-id': row.id,
        style: '--kb-accent:' + (row.statutColor || (list && list.color) || '#626f86'),
        onclick: function () { openCard(row); },
        onkeydown: function (e) {
          if (e.key === 'Enter' && e.target === el) openCard(row);
        },
        oncontextmenu: function (e) {
          e.preventDefault();
          cardMenu(row, e.clientX, e.clientY);
        },
        ondragstart: function (e) {
          state.dragId = row.id;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', row.id); } catch (err) { /* ignore */ }
          setTimeout(function () { el.classList.add('is-dragging'); }, 0);
          els.board.classList.add('is-dragging');
        },
        ondragend: function () {
          state.dragId = null;
          els.board.classList.remove('is-dragging');
          clearDropMarks();
          el.classList.remove('is-dragging');
        },
      }, kids);
      return el;
    }

    function cardMenu(row, x, y) {
      if (!MENU()) return;
      var moveItems = state.lists.map(function (l) {
        return {
          icon: l.icon,
          color: l.color,
          label: l.name,
          checked: l.id === row.listId,
          action: function () { if (l.id !== row.listId) dropCard(row.id, l.id, null); },
        };
      });
      MENU().show({ x: x, y: y }, [
        { title: row.name || 'Carte' },
        { icon: 'external-link', label: 'Ouvrir la carte', action: function () { openCard(row); } },
        { sep: true },
        { title: 'Déplacer vers' },
      ].concat(moveItems, [
        { sep: true },
        { icon: 'archive', label: 'Archiver', danger: true, action: function () { archiveRow(row); } },
      ]));
    }

    function archiveRow(row) {
      TT().archiveCard(t, row.id).then(function () {
        record({ type: 'archive', targetId: row.id, title: row.name, after: row.statut || '' });
        state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
        renderBoard();
        paintCount();
        setStatus('« ' + (row.name || 'Carte') + ' » archivée', 'ok');
      }, fail);
    }

    /* ── Columns ───────────────────────────────────────────────────── */
    function clearDropMarks() {
      els.board.querySelectorAll('.is-over').forEach(function (n) { n.classList.remove('is-over'); });
      var m = els.board.querySelector('.kb-drop');
      if (m && m.parentNode) m.parentNode.removeChild(m);
    }

    /** Index among the column's tiles (without the dragged one) where a drop at `y` lands. */
    function dropIndex(body, y) {
      var rects = [].slice.call(body.querySelectorAll('.kb-card:not(.is-dragging)')).map(function (n) {
        var r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, node: n };
      });
      return { index: KM().insertIndex(rects, y), rects: rects };
    }

    function column(col) {
      var list = col.list;
      var body = h('div', { class: 'kb-cards' });
      col.cards.forEach(function (row) { body.appendChild(tile(row, list)); });
      if (!col.cards.length) {
        body.appendChild(h('div', { class: 'kb-empty', text: col.hidden ? col.total + ' masquée' + (col.total > 1 ? 's' : '') : state.filter ? 'Aucune carte' : 'Déposer une carte ici' }));
      }
      var colEl = h('section', {
        class: 'kb-col' + (KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        style: '--kb-accent:' + list.color,
        ondragover: function (e) {
          if (!state.dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          clearDropMarks();
          colEl.classList.add('is-over');
          var at = dropIndex(body, e.clientY);
          var marker = h('div', { class: 'kb-drop' });
          var ref = at.rects[at.index];
          var empty = body.querySelector('.kb-empty');
          if (ref) body.insertBefore(marker, ref.node);
          else if (empty) body.insertBefore(marker, empty);
          else body.appendChild(marker);
        },
        ondragleave: function (e) {
          if (!colEl.contains(e.relatedTarget)) clearDropMarks();
        },
        ondrop: function (e) {
          if (!state.dragId) return;
          e.preventDefault();
          var at = dropIndex(body, e.clientY).index;
          var id = state.dragId;
          clearDropMarks();
          dropCard(id, list.id, at);
        },
      }, [
        h('header', { class: 'kb-col-head' }, [
          h('span', { class: 'kb-col-icon' }, [icon(list.icon)]),
          h('span', { class: 'kb-col-name', text: list.name, title: list.name }),
          h('span', { class: 'kb-col-count', text: String(col.total) }),
          h('button', {
            class: 'kb-iconbtn',
            title: 'Ajouter une carte',
            onclick: function () { openComposer(list.id); },
          }, [icon('plus')]),
        ]),
        body,
        composer(list),
      ]);
      return colEl;
    }

    function composer(list) {
      if (state.composer !== list.id) {
        return h('button', { class: 'kb-add', onclick: function () { openComposer(list.id); } }, [icon('plus'), h('span', { text: 'Ajouter une carte' })]);
      }
      var input = h('textarea', { class: 'kb-add-input', rows: '2', placeholder: 'Titre de la carte…' });
      var busy = false;
      function submit() {
        var name = input.value.trim();
        if (!name || busy) return;
        busy = true;
        input.disabled = true;
        createIn(list, name).then(function () {
          state.composer = list.id;
          renderBoard();
          var next = els.board.querySelector('.kb-add-input');
          if (next) next.focus({ preventScroll: true });
        }, function (err) {
          busy = false;
          input.disabled = false;
          fail(err);
        });
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { state.composer = null; renderBoard(); }
      });
      return h('div', { class: 'kb-composer' }, [
        input,
        h('div', { class: 'kb-composer-actions' }, [
          h('button', { class: 'kb-btn kb-btn--primary', onclick: submit }, [h('span', { text: 'Ajouter' })]),
          h('button', { class: 'kb-btn kb-btn--icon', title: 'Annuler', onclick: function () { state.composer = null; renderBoard(); } }, [icon('x')]),
        ]),
      ]);
    }

    function openComposer(listId) {
      state.composer = listId;
      renderBoard();
      var input = els.board.querySelector('.kb-add-input');
      if (input) {
        input.focus({ preventScroll: false });
        input.scrollIntoView({ block: 'nearest' });
      }
    }

    function renderBoard() {
      var scrollX = els.board.scrollLeft;
      var scrolls = {};
      els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-cards');
        if (b) scrolls[c.getAttribute('data-list')] = b.scrollTop;
      });
      els.board.textContent = '';
      var cols = columns();
      if (!cols.length) {
        els.board.appendChild(h('div', { class: 'kb-loading', text: 'Aucune liste dans ce tableau.' }));
        return;
      }
      cols.forEach(function (c) { els.board.appendChild(column(c)); });
      els.board.scrollLeft = scrollX;
      els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-cards');
        var s = scrolls[c.getAttribute('data-list')];
        if (b && s) b.scrollTop = s;
      });
    }

    /* ── Writes ────────────────────────────────────────────────────── */
    /** Moves a card into `listId` at `index` among that list's other cards (null = bottom). */
    function dropCard(id, listId, index) {
      state.dragId = null;
      var moved = findRow(id);
      var list = listById(listId);
      if (!moved || !list) return renderBoard();
      var siblings = KM().siblingsFor(state.rows, listId, id);
      var at = index == null ? siblings.length : index;
      // `index` counts the *visible* tiles; map it onto the full list so hidden cards keep their place.
      var visible = siblings.filter(function (r) { return columns().some(function (c) { return c.list.id === listId && c.cards.indexOf(r) !== -1; }); });
      if (visible.length !== siblings.length && at < visible.length) at = siblings.indexOf(visible[at]);
      else if (visible.length !== siblings.length) at = siblings.length;
      var pos = TM().dropPos(siblings, at);
      var listChanged = moved.listId !== listId;
      var from = { listId: moved.listId, statut: moved.statut, pos: moved.pos };
      if (!listChanged && moved.pos === pos) return renderBoard();
      moved.pos = pos;
      moved.listId = listId;
      moved.statut = list.name;
      moved.statutKey = list.category;
      moved.statutColor = list.color;
      renderBoard();
      paintCount();
      setStatus('Enregistrement…', 'busy');
      var op = listChanged ? TT().moveCard(t, id, listId, pos) : TT().reorderCard(t, id, pos);
      op.then(function () {
        if (listChanged) record({ type: 'move', targetId: id, title: moved.name, key: 'statut', before: from.statut, after: list.name, beforeVal: from.listId, afterVal: listId, beforePos: from.pos, afterPos: pos });
        else record({ type: 'reorder', targetId: id, title: moved.name, after: list.name, beforeVal: from.pos, afterVal: pos });
        setStatus(listChanged ? 'Carte déplacée dans « ' + list.name + ' »' : 'Ordre enregistré', 'ok');
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    function createIn(list, name) {
      return TT().createRow(t, name, list.id).then(function (res) {
        var cardId = res && res.cardId;
        if (cardId) record({ type: 'create', targetId: cardId, title: name, after: list.name });
        // Trello's client-side card cache can lag right after a REST create: retry before giving up.
        function present() { return !cardId || state.rows.some(function (r) { return r.id === cardId; }); }
        function again(attempt) {
          return reload({ quiet: true }).then(function () {
            if (present() || attempt >= 4) return;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(attempt + 1); });
          });
        }
        return again(0).then(function () { setStatus('Carte créée dans « ' + list.name + ' »', 'ok'); });
      });
    }

    /* ── Loading ───────────────────────────────────────────────────── */
    function reload(opts) {
      if (!opts || !opts.quiet) els.board.innerHTML = skeletonCols();
      return Promise.all([
        TT().load(t),
        global.PriorityTrello.isRestAuthorized(t).catch(function () { return false; }),
      ]).then(function (res) {
        state.lists = res[0].lists;
        state.rows = res[0].rows;
        state.authOk = !!res[1];
        renderBanner();
        renderBar();
        renderBoard();
      }).catch(function (err) {
        els.board.textContent = '';
        els.board.appendChild(h('div', { class: 'kb-loading', text: 'Impossible de charger le tableau : ' + (err && err.message) }));
      });
    }

    renderBar();
    els.board.innerHTML = skeletonCols();
    return reload({ quiet: true });
  }

  global.KanbanUI = { mount: mount, skeletonCols: skeletonCols };
})(typeof window !== 'undefined' ? window : this);
