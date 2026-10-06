/*
 * Role: UI of the Kanban view — the board's lists as columns, cards as tiles, like Trello but in the
 * app's own look (kanban-ui.css). Same data and writes as the Table (TableTrello / TableModel):
 *  - drag a card to another column or to a new position (saved to Trello as list + pos)
 *  - "+ Ajouter une carte" at the bottom of each column; click a tile to open the card
 *  - urgency / due / progress chips open the shared CardFields editors; right-click: card menu
 *  - "Demander à l'IA…" input on every tile (and one for the board in the toolbar): free text → KanbanAI
 *    creates / defines tasks, updates progress, puts a card on hold
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var TM = function () { return global.TableModel; };
  var TT = function () { return global.TableTrello; };
  var KM = function () { return global.KanbanModel; };
  var MENU = function () { return global.TableMenu; };
  var AI = function () { return global.KanbanAI; };

  var URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };

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
    var HD = global.HideDone;
    var state = {
      lists: [],
      rows: [],
      filter: '',
      hideDone: HD.get(),
      authOk: true,
      dragId: null,
      composer: null, // list id with the open "add card" composer
      aiBusy: false,
      swallowClick: false, // true for one tick after a progress-bar drag so the release does not open the card
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
      if (e.type === 'progress') return writeProgress(e.targetId, val);
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
        h('span', { class: 'kb-status' }),
        AI() ? boardAsk() : null,
        h('span', { class: 'kb-spacer' }),
        h('span', { class: 'kb-count', 'aria-live': 'polite' }),
        btn(HD.icon(state.hideDone), HD.label(state.hideDone, done), {
          active: state.hideDone,
          title: HD.title(state.hideDone),
          onclick: function () { HD.set(!state.hideDone); },
        }),
        HP ? HP.button(document.body) : null,
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

    /* ── Ask the AI ────────────────────────────────────────────────── */
    /**
     * Free-text instruction → KanbanAI → writes. `target` is the card the input sits on (null = board level).
     * `input` is disabled while the call runs; the board is reloaded once it is done.
     */
    function askAI(text, target, input) {
      text = String(text || '').trim();
      if (!text || state.aiBusy) return;
      state.aiBusy = true;
      if (input) input.disabled = true;
      setStatus('IA en cours…', 'busy');
      AI().run(t, { text: text, target: target, rows: state.rows, lists: state.lists, record: record }).then(function (res) {
        state.aiBusy = false;
        var ok = res.applied.length > 0;
        var msg = ok ? 'IA : ' + res.applied.join(', ') : res.message || 'Rien à modifier.';
        if (res.failed.length) msg += ' (échec : ' + res.failed.join(' ; ') + ')';
        setStatus(msg, res.failed.length && !ok ? 'error' : 'ok', 8000);
        return reload({ quiet: true });
      }, function (err) {
        state.aiBusy = false;
        if (input) { input.disabled = false; input.focus(); }
        fail(err);
      });
    }

    /** `getSuggestion` (optional): Tab on an empty field fills that sentence in and sends it. */
    function askInput(cls, placeholder, target, getSuggestion) {
      var input = h('input', {
        class: cls,
        type: 'text',
        placeholder: placeholder,
        autocomplete: 'off',
        spellcheck: 'false',
        onkeydown: function (e) {
          e.stopPropagation();
          var sug = getSuggestion && !input.value ? getSuggestion() : '';
          if (e.key === 'Tab' && !e.shiftKey && sug) { e.preventDefault(); input.value = sug; askAI(sug, target, input); }
          else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); askAI(input.value, target, input); }
          else if (e.key === 'Escape') { input.value = ''; input.blur(); }
        },
        onclick: function (e) { e.stopPropagation(); },
      });
      return input;
    }

    function askBox(row) {
      var sug = AI().cachedSuggestion(row);
      var input = askInput('kb-ai-input', sug, row, function () { return sug; });
      var box = h('div', { class: 'kb-ai', onclick: function (e) { e.stopPropagation(); } }, [
        icon('sparkles'),
        input,
        h('kbd', { class: 'kb-ai-hint', text: 'Tab' }),
      ]);
      // A draggable ancestor would turn text selection in the input into a card drag.
      input.addEventListener('focus', function () {
        var c = box.closest('.kb-card');
        if (c) c.draggable = false;
        // Upgrade the instant suggestion with a model-written one (cached per card state).
        AI().suggest(t, row).then(function (better) {
          if (better && better !== sug) { sug = better; input.placeholder = better; }
        });
      });
      input.addEventListener('blur', function () { var c = box.closest('.kb-card'); if (c) c.draggable = true; });
      return box;
    }

    function boardAsk() {
      var input = askInput('kb-ai-input', 'Demander à l’IA : créer une tâche…', null);
      return h('label', { class: 'kb-ai kb-ai--bar', title: 'Créer ou mettre à jour des tâches en langage naturel' }, [icon('sparkles'), input]);
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
      var estLabel = row.estimate > 0 && global.CardFields ? global.CardFields.formatMinutes(row.estimate) : '';
      badges.push(chip('kb-chip--est' + (estLabel ? '' : ' kb-chip--empty'), 'clock', estLabel, 'Estimation · cliquer pour modifier', function (e) {
        e.stopPropagation();
        if (!global.CardFields) return;
        global.CardFields.open('estimate', {
          t: t,
          cardId: row.id,
          minutes: row.estimate || 0,
          anchor: e.currentTarget,
          onSaved: function () { setStatus('Enregistré', 'ok'); record({ type: 'field', label: 'Estimation', targetId: row.id, title: row.name }); },
          onError: function (m) { setStatus(m, 'error'); },
          onClose: function (changed) { if (changed) reload({ quiet: true }); },
        });
      }));
      var kids = [];
      if (row.category) kids.push(h('div', { class: 'kb-cat', text: row.category }));
      kids.push(h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
      if (badges.length) kids.push(h('div', { class: 'kb-badges' }, badges));
      var prog = null;
      if (typeof row.progress === 'number') {
        var p = Math.max(0, Math.min(100, row.progress));
        var ring = global.ProgressRing ? global.ProgressRing.create(p, row.blocked) : null;
        // Ring: one click marks the card complete (100 %) or reopens it (0 %); on a blocked card it unblocks.
        var ringBtn = h('button', {
          class: 'kb-prog-ring',
          type: 'button',
          title: row.blocked ? 'Bloqué — cliquer pour débloquer' : p >= 100 ? 'Terminé — cliquer pour rouvrir (0 %)' : 'Cliquer pour marquer comme terminé',
          onclick: function (e) {
            e.stopPropagation();
            if (row.blocked) return unblockRow(row);
            saveProgress(row, row.progress >= 100 ? 0 : 100);
          },
        }, [ring]);
        prog = h('div', {
          class: 'kb-prog' + (p >= 100 ? ' is-done' : ''),
          onclick: function (e) { e.stopPropagation(); },
        }, [
          ringBtn,
          h('span', { class: 'kb-prog-bar', title: 'Cliquer ou glisser pour régler le progrès' }, [h('i', { style: 'width:' + p + '%' })]),
          h('button', {
            class: 'kb-prog-num',
            type: 'button',
            title: 'Détail du progrès · cliquer pour modifier',
            text: p + '%',
            onclick: function (e) {
              e.stopPropagation();
              openEditor(row, 'progress', e.currentTarget.parentNode);
            },
          }),
        ]);
        kids.push(prog);
      }
      if (AI()) kids.push(askBox(row));
      var accent = row.statutColor || (list && list.color) || '#626f86';
      // Blocked (flag or "Bloqué" status) yet complete: striped red/green accent instead of the plain status colour.
      var blockedDone = !!(row.blocked || row.statutKey === 'blocked') && typeof row.progress === 'number' && row.progress >= 100;
      var el = h('div', {
        class: 'kb-card' + (blockedDone ? ' is-blocked-done' : ''),
        draggable: 'true',
        tabindex: '0',
        'data-id': row.id,
        style: '--kb-accent:' + accent + (blockedDone ? ';--kb-blocked:' + (row.statutKey === 'blocked' ? accent : '#e34935') : ''),
        onclick: function () { if (!state.swallowClick) openCard(row); },
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
      if (prog) bindProgressDrag(el, prog, row);
      return el;
    }

    /**
     * Clicking or dragging on the progress bar sets the % in place, without opening the card (same as the Table).
     * The tile is draggable, so that is switched off for the gesture. Saved on release.
     */
    function bindProgressDrag(card, prog, row) {
      var bar = prog.querySelector('.kb-prog-bar');
      var fill = bar && bar.firstChild;
      var num = prog.querySelector('.kb-prog-num');
      var ring = prog.querySelector('.pg-ring');
      if (!bar || !fill || !num) return;
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (global.CardFields) global.CardFields.close();
        var pct = row.progress;
        function pctAt(x) {
          var r = bar.getBoundingClientRect();
          return r.width ? Math.max(0, Math.min(100, Math.round(((x - r.left) / r.width) * 100))) : pct;
        }
        function paint() {
          fill.style.width = pct + '%';
          num.textContent = pct + '%';
          if (ring && global.ProgressRing) global.ProgressRing.set(ring, pct);
          prog.classList.toggle('is-done', pct >= 100);
        }
        function move(ev) { pct = pctAt(ev.clientX); paint(); }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          card.draggable = true;
          prog.classList.remove('is-dragging');
          state.swallowClick = true;
          setTimeout(function () { state.swallowClick = false; }, 0);
          if (pct !== row.progress) saveProgress(row, pct);
        }
        card.draggable = false;
        prog.classList.add('is-dragging');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* no capture: the document listeners still follow the pointer */ }
        move(e);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
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
      // An empty column shows no placeholder: the "+ Ajouter une carte" button below is also a drop target (the whole column accepts drops).
      if (!col.cards.length && (col.hidden || state.filter)) {
        body.appendChild(h('div', { class: 'kb-empty', text: col.hidden ? col.total + ' masquée' + (col.total > 1 ? 's' : '') : 'Aucune carte' }));
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
      var input = h('textarea', { class: 'kb-add-input', rows: '2', placeholder: 'Titre de la carte… (ex. « Appeler Paul demain »)' });
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
      // Dropped into a hidden (completed) column: dissolve the tile instead of making it vanish.
      var tile = state.hideDone && !state.filter ? els.board.querySelector('.kb-card[data-id="' + id + '"]') : null;
      var target = columns().filter(function (c) { return c.list.id === listId; })[0];
      if (tile && target && target.hidden) {
        tile.classList.remove('is-dragging');
        tile.classList.add('is-dissolving');
        setTimeout(renderBoard, 450);
      } else renderBoard();
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

    function createIn(list, typed) {
      var QP = global.QuickParse;
      var q = QP ? QP.parse(typed) : { name: typed, dueDate: '' };
      var name = q.name;
      return TT().createRow(t, name, list.id).then(function (res) {
        var cardId = res && res.cardId;
        // "… demain": the date is lifted out of the title into the card's due date.
        if (cardId && q.dueDate && global.GanttTrello) global.GanttTrello.saveCardDates(t, cardId, { dueDate: q.dueDate }).catch(function () { /* the card exists; the date can be set by hand */ });
        if (cardId) record({ type: 'create', targetId: cardId, title: name, after: list.name });
        // Trello's client-side card cache can lag right after a REST create: retry before giving up.
        function present() { return !cardId || state.rows.some(function (r) { return r.id === cardId; }); }
        function again(attempt) {
          return reload({ quiet: true }).then(function () {
            if (present() || attempt >= 4) return;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(attempt + 1); });
          });
        }
        return again(0).then(function () { setStatus('Carte créée dans « ' + list.name + ' »' + (q.dueDate ? ' · échéance ' + q.dueDate : ''), 'ok'); });
      });
    }

    /** Master progress over subtasks, else the card's own progress (same write as the Table). Rejects if the editor is unavailable. */
    function writeProgress(cardId, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletionById !== 'function') return Promise.reject(new Error('Éditeur de progrès indisponible'));
      return CT.getCardCompletionById(t, cardId).then(function (data) {
        data = CT.normalizeCompletionData(data || { items: [] });
        var next = data.items && data.items.length
          ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
          : Object.assign({}, data, { progress: pct });
        return CT.saveCardCompletionById(t, cardId, CT.normalizeCompletionData(next));
      });
    }

    /** Sets a card's progress in place; reaching 100 % also moves it to the board's completed list (like the Table). */
    function saveProgress(row, pct) {
      var prev = row.progress;
      var from = { listId: row.listId, statut: row.statut, pos: row.pos };
      row.progress = pct;
      setStatus('Enregistrement…', 'busy');
      writeProgress(row.id, pct)
        .then(function () {
          var done = pct >= 100 && row.statutKey !== 'completed'
            ? state.lists.filter(function (l) { return l.category === 'completed'; })[0]
            : null;
          return done ? TT().moveCard(t, row.id, done.id, 'bottom').then(function () { return done; }) : null;
        })
        .then(function (done) {
          var known = typeof prev === 'number';
          if (prev !== pct) {
            record({
              type: known ? 'progress' : 'field', label: 'Progrès', targetId: row.id, title: row.name,
              before: known ? prev + ' %' : '', after: pct + ' %', beforeVal: prev, afterVal: pct,
            });
          }
          if (done) {
            record({ type: 'move', targetId: row.id, title: row.name, key: 'statut', before: from.statut, after: done.name, beforeVal: from.listId, afterVal: done.id, beforePos: from.pos, afterPos: 'bottom' });
          }
          setStatus(done ? 'Carte terminée — déplacée dans « ' + done.name + ' »' : 'Enregistré', 'ok');
          return reload({ quiet: true });
        }, function (err) {
          row.progress = prev;
          renderBoard();
          fail(err);
          // The progress write may have landed before the move failed: show what Trello really has.
          reload({ quiet: true });
        });
    }

    /** Clears Bloqué on a card (the red II on its progress ring). */
    function unblockRow(row) {
      setStatus('Déblocage…');
      return global.GanttTrello.setCardBlocked(t, row.id, false).then(function (res) {
        if (!res || !res.ok) {
          setStatus('Échec du déblocage' + (res && res.reason ? ' (' + res.reason + ')' : ''), 'error');
        } else {
          record({ type: 'edit', key: 'blocked', label: 'Blocage', targetId: row.id, title: row.name, before: 'Bloqué', after: 'Non', beforeVal: true, afterVal: false });
          setStatus('Carte débloquée', 'ok');
        }
        return reload({ quiet: true });
      }, fail);
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

    HD.subscribe(function (on) {
      state.hideDone = on;
      renderBar();
      renderBoard();
    });
    // "C" = capture: opens the add-card composer in the first "À faire" (else first open) column.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'c' && e.key !== 'C') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      var a = document.activeElement;
      if (a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable)) return;
      var cols = state.lists.filter(function (l) { return l.category !== 'completed' && l.category !== 'canceled' && l.category !== 'blocked'; });
      var target = cols.filter(function (l) { return l.category === 'unstarted'; })[0] || cols[0];
      if (!target) return;
      e.preventDefault();
      openComposer(target.id);
    });
    renderBar();
    els.board.innerHTML = skeletonCols();
    if (global.AssistantDock) {
      global.AssistantDock.mount({ t: t, after: root, onRefresh: function () { reload({ quiet: true }); }, isBusy: function () { return global.CardFields && global.CardFields.isOpen(); } });
    }
    return reload({ quiet: true });
  }

  global.KanbanUI = { mount: mount, skeletonCols: skeletonCols };
})(typeof window !== 'undefined' ? window : this);
