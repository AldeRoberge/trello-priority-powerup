/*
 * Role: UI of the Kanban view — the board's lists as columns, cards as tiles, like Trello but in the
 * app's own look (kanban-ui.css). Same data and writes as the Table (TableTrello / TableModel):
 *  - drag a card to another column or to a new position (saved to Trello as list + pos)
 *  - "+ Ajouter une carte" at the bottom of each column; click a tile to open it beside the board
 *  - urgency / due / progress chips open the shared CardFields editors; right-click: card menu
 *  - a sparkle on a tile (and one field for the board in the toolbar) asks KanbanAI; the tile
 *    field stays closed until asked, so a board does not prefetch one suggestion per card
 *  - "En retard" and "Bloquées" filter the board; arrow keys move between cards
 *  - "Par priorité" cuts the board into rows, one per priority tier (Critique on top, "Sans priorité" last):
 *    same tiles, same columns, a card can only be dragged along its own row (KanbanModel.buildLanes)
 *  - "Projets" nests each project's tasks and subtasks in the column the project occupies. Dragging the
 *    project moves the project; dragging a task still moves that task.
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

  var LANES_KEY = 'tp-kanban-lanes';
  var SORT_KEY = 'tp-kanban-sort';
  var SORTS = [['manual', 'Ordre manuel'], ['priority', 'Priorité'], ['progress', 'Avancement'], ['place', 'Lieu']];
  var LANES_FOLDED_KEY = 'tp-kanban-lanes-folded';
  var PROJECTS_KEY = 'tp-kanban-projects';
  var PROJ_FOLDED_KEY = 'tp-kanban-projects-folded';

  function readStored(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function writeStored(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: the choice just is not remembered */ }
  }

  /** Name, index and colour of each priority tier, from the Priority module when it is loaded. */
  function tierDefs() {
    var tiers = (global.PriorityUI && global.PriorityUI.TIERS) || [];
    return tiers.map(function (x) { return { i: x.i, label: x.label, color: x.seg }; });
  }

  function mount(root, t) {
    var HD = global.HideDone;
    var state = {
      lists: [],
      rows: [],
      places: {},
      goals: { nodes: [], links: [] },
      filter: '',
      facets: { blocked: false, overdue: false },
      lanes: readStored(LANES_KEY, false) === true, // rows = priority tiers (Y axis), columns stay the board's lists
      lanesFolded: readStored(LANES_FOLDED_KEY, {}) || {}, // lane key -> true when its row is folded
      projects: readStored(PROJECTS_KEY, false) === true, // project shells in the columns, tasks and subtasks inside
      projFolded: readStored(PROJ_FOLDED_KEY, {}) || {},
      goals: { nodes: [], links: [] },
      sort: readStored(SORT_KEY, 'manual'),
      hideDone: HD.get(),
      authOk: true,
      detailId: null,
      quick: null,
      quickId: null,
      dragId: null,
      dragProjectId: null, // project shell being dragged to another column
      dragListId: null, // list id of the column being dragged by its header
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
      detailBody: h('div', { class: 'kb-detail-body' }),
    };
    els.detail = h('aside', { class: 'kb-detail', hidden: true, 'aria-label': 'Détail de la carte' }, [
      h('button', {
        class: 'kb-iconbtn kb-detail-close',
        type: 'button',
        title: 'Fermer',
        'aria-label': 'Fermer',
        onclick: function () { closeDetail(); },
      }, [icon('x')]),
      els.detailBody,
    ]);
    els.stage = h('div', { class: 'kb-stage' }, [els.board, els.detail]);
    els.root = h('div', { class: 'kb-root', tabindex: '-1' }, [els.bar, els.banner, els.stage]);
    root.appendChild(els.root);

    /* ── Status + errors ───────────────────────────────────────────── */
    function setStatus(msg, kind, keepMs, openHistory) {
      state.status = msg || '';
      state.statusKind = kind || '';
      state.statusOpen = kind === 'ok' ? openHistory || null : null;
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
      if (state.statusOpen) {
        s.appendChild(h('button', { class: 'hp-status-link', title: 'Ouvrir l’historique', onclick: state.statusOpen }, [document.createTextNode(state.status)]));
      } else {
        s.appendChild(document.createTextNode(state.status));
      }
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
        onStatus: function (m, kind, openHistory) { setStatus(m, kind, undefined, openHistory); },
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
    function viewOpts() {
      return {
        filter: state.filter,
        hideDone: state.hideDone,
        blocked: state.facets.blocked,
        overdue: state.facets.overdue,
        today: todayIso(),
        tiers: tierDefs(),
        sort: state.sort,
        placeOf: function (r) { return state.places && global.WorkOS ? global.WorkOS.placeLabel(state.places[r.id]) : ''; },
      };
    }
    function columns() {
      return KM().buildColumns(state.rows, state.lists, viewOpts());
    }
    function filtering() {
      return !!(state.filter || state.facets.blocked || state.facets.overdue);
    }

    function closeDetail() {
      var id = state.detailId;
      state.detailId = null;
      state.quickId = null;
      if (state.quick) {
        state.quick.destroy();
        state.quick = null;
      }
      els.detail.hidden = true;
      els.detailBody.textContent = '';
      els.board.querySelectorAll('.kb-card.is-selected').forEach(function (n) {
        n.classList.remove('is-selected');
        n.setAttribute('aria-selected', 'false');
      });
      var Iso = global.Isolation;
      if (id && Iso && typeof Iso.read === 'function' && typeof Iso.clear === 'function') {
        var cur = Iso.read();
        if (cur && cur.kind === 'task' && cur.id === id && !(global.TaskFocus && global.TaskFocus.currentId && global.TaskFocus.currentId() === id)) Iso.clear();
      }
    }

    /** Card beside the board. Other tasks fade; the editor stays on this page. */
    function openDetail(row) {
      if (!row) return;
      if (global.Isolation && typeof global.Isolation.set === 'function') {
        global.Isolation.set({ kind: 'task', id: row.id, label: row.name || '' });
      }
      state.detailId = row.id;
      els.detail.hidden = false;
      els.board.querySelectorAll('.kb-card').forEach(function (n) {
        var on = n.getAttribute('data-id') === row.id;
        n.classList.toggle('is-selected', on);
        n.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (state.quick && state.quickId === row.id) return;
      if (state.quick) state.quick.destroy();
      state.quick = null;
      state.quickId = row.id;
      els.detailBody.textContent = '';
      if (!global.CardQuick) {
        els.detailBody.appendChild(h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
        return;
      }
      state.quick = global.CardQuick.mount(els.detailBody, {
        t: t,
        cardId: row.id,
        name: row.name || '',
        onChange: function () { reload({ quiet: true }); },
        onToast: function (m, kind) { setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
        onGone: function () {
          closeDetail();
          reload({ quiet: true });
        },
      });
    }

    function openCard(row) {
      openDetail(row);
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
        class: 'kb-btn' + (opts.active ? ' is-active' : '') + (label ? '' : ' kb-btn--icon') + (opts.cls ? ' ' + opts.cls : ''),
        title: opts.title || label || null,
        onclick: opts.onclick,
      }, [icon(iconName), label ? h('span', { text: label }) : null]);
    }

    function renderBar() {
      els.bar.textContent = '';
      var filter = h('input', {
        class: 'kb-filter tp-search-input',
        type: 'search',
        placeholder: 'Rechercher…',
        'aria-label': 'Rechercher',
        value: state.filter,
        oninput: function (e) {
          state.filter = e.target.value;
          renderBoard();
          paintCount();
        },
      });
      var done = state.rows.filter(function (r) { return r.statutKey === 'completed' || r.statutKey === 'canceled'; }).length;
      var viewed = KM().rowsInView(state.rows, state.lists, { filter: state.filter, hideDone: state.hideDone });
      var counts = KM().facetCounts(viewed, todayIso());
      function facetButton(key, iconName, label, count) {
        if (!count && !state.facets[key]) return null;
        return h('button', {
          class: 'kb-facet' + (state.facets[key] ? ' is-active' : ''),
          type: 'button',
          'data-facet': key,
          'aria-pressed': state.facets[key] ? 'true' : 'false',
          title: label,
          onclick: function () {
            state.facets[key] = !state.facets[key];
            renderBar();
            renderBoard();
            paintCount();
          },
        }, [icon(iconName), h('span', { text: label }), h('span', { class: 'kb-facet-n', text: String(count) })]);
      }
      [
        h('label', { class: 'kb-search tp-search' }, [icon('search'), filter]),
        facetButton('overdue', 'calendar-exclamation', 'En retard', counts.overdue),
        facetButton('blocked', 'player-pause', 'Bloquées', counts.blocked),
        btn('refresh', null, { title: 'Actualiser', onclick: function () { reload(); } }),
        h('span', { class: 'kb-status' }),
        AI() ? boardAsk() : null,
        h('span', { class: 'kb-spacer' }),
        h('span', { class: 'kb-count', 'aria-live': 'polite' }),
        h('label', { class: 'kb-sort', title: 'Trier les cartes' }, [
          icon('arrows-sort'),
          h('select', {
            'aria-label': 'Trier les cartes',
            onchange: function (e) {
              state.sort = e.target.value;
              writeStored(SORT_KEY, state.sort);
              renderBoard();
            },
          }, SORTS.map(function (o) { return h('option', { value: o[0], text: o[1], selected: state.sort === o[0] }); })),
        ]),
        btn('layout-rows', 'Par priorité', {
          cls: 'kb-btn--lanes',
          active: state.lanes,
          title: state.lanes ? 'Revenir au tableau simple' : 'Grouper les cartes par priorité, les plus urgentes en haut',
          onclick: function () {
            state.lanes = !state.lanes;
            if (state.lanes) state.projects = false;
            writeStored(LANES_KEY, state.lanes);
            writeStored(PROJECTS_KEY, state.projects);
            renderBar();
            renderBoard();
          },
        }),
        btn('stack-2', 'Projets', {
          cls: 'kb-btn--lanes',
          active: state.projects,
          title: state.projects ? 'Revenir au tableau simple' : 'Voir les projets, leurs tâches et leurs sous-tâches',
          onclick: function () {
            state.projects = !state.projects;
            if (state.projects) state.lanes = false;
            writeStored(PROJECTS_KEY, state.projects);
            writeStored(LANES_KEY, state.lanes);
            renderBar();
            renderBoard();
          },
        }),
        btn(HD.icon(state.hideDone), HD.label(state.hideDone, done), {
          active: state.hideDone,
          title: HD.title(state.hideDone),
          onclick: function () { HD.set(!state.hideDone); },
        }),
        HP ? HP.button(document.body) : null,
      ].forEach(function (c) { if (c) els.bar.appendChild(c); });
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

    /** Sparkle stays quiet until asked, then the same free-text field as the toolbar. */
    function askBox(row) {
      var wrap = h('div', { class: 'kb-ask' });
      var btn = h('button', {
        class: 'kb-ai-toggle',
        type: 'button',
        title: 'Demander à l’IA',
        'aria-label': 'Demander à l’IA',
        onclick: function (e) {
          e.stopPropagation();
          if (wrap.classList.contains('is-open')) return;
          wrap.classList.add('is-open');
          btn.hidden = true;
          var sug = AI().cachedSuggestion(row);
          var input = askInput('kb-ai-input', sug || 'Demander à l’IA…', row, function () { return sug; });
          var box = h('div', { class: 'kb-ai', onclick: function (ev) { ev.stopPropagation(); } }, [icon('sparkles'), input]);
          wrap.appendChild(box);
          var card = wrap.closest('.kb-card');
          input.addEventListener('focus', function () { if (card) card.draggable = false; });
          input.addEventListener('blur', function () {
            if (card) card.draggable = true;
            if (!input.value) {
              wrap.classList.remove('is-open');
              box.remove();
              btn.hidden = false;
            }
          });
          AI().suggest(t, row).then(function (better) {
            if (better && better !== sug && document.body.contains(input) && !input.value) {
              sug = better;
              input.placeholder = better;
            }
          });
          input.focus();
        },
      }, [icon('sparkles')]);
      wrap.appendChild(btn);
      return wrap;
    }

    function boardAsk() {
      var input = askInput('kb-ai-input', 'Demander à l’IA : créer une tâche…', null);
      return h('label', { class: 'kb-ai kb-ai--bar', title: 'Créer ou mettre à jour des tâches en langage naturel' }, [icon('sparkles'), input]);
    }

    /* ── Card tile ─────────────────────────────────────────────────── */
    function chip(cls, iconName, text, title, onclick) {
      return h('button', { class: 'kb-chip ' + cls, title: title || null, onclick: onclick }, [icon(iconName), text ? h('span', { text: text }) : null]);
    }

    /** Checklist lines under a task, only in the project view. Nested items follow their parent. */
    function subList(row) {
      var lines = [];
      function walk(items) {
        (items || []).forEach(function (it) {
          if (!it || typeof it.text !== 'string' || !it.text.trim()) return;
          var done = it.done === true || Number(it.progress) >= 100;
          var blocked = it.blocked === true && !done;
          lines.push(h('li', { class: 'kb-sub' + (done ? ' is-done' : '') + (blocked ? ' is-blocked' : '') }, [
            icon(done ? 'circle-check' : blocked ? 'player-pause' : 'circle'),
            h('span', { text: it.text }),
          ]));
          if (Array.isArray(it.items) && it.items.length) walk(it.items);
        });
      }
      walk(row.items);
      if (!lines.length) return null;
      return h('ul', { class: 'kb-subs' }, lines);
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
        var hard = global.WorkOS && global.WorkOS.dateKind(row) === 'hard';
        badges.push(chip('kb-chip--due' + (overdue ? ' is-overdue' : '') + (hard ? ' is-hard' : ''), overdue ? 'calendar-exclamation' : 'calendar-event', TM().formatDay(row.due), (overdue ? 'En retard · ' : (hard ? 'Échéance · ' : '')) + row.due, function (e) {
          e.stopPropagation();
          openEditor(row, 'due', e.currentTarget);
        }));
      }
      if (typeof row.priority === 'number') {
        badges.push(chip('kb-chip--prio', 'flag', TM().formatPriority(row.priority), 'Priorité' + (row.tier ? ' · ' + row.tier : ''), function (e) {
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
      var stepText = global.WorkOS && global.WorkOS.stepText(row);
      if (stepText) kids.push(h('div', { class: 'kb-step', text: stepText }));
      var place = state.places && global.WorkOS ? global.WorkOS.placeLabel(state.places[row.id]) : '';
      if (place) {
        var pl = state.places[row.id];
        var placeKids = [h('span', { text: place })];
        if (pl && pl.projectId && global.ProjectIcon) {
          var placeGlyph = global.ProjectIcon.button({
            t: t,
            id: pl.projectId,
            icon: pl.icon,
            goals: function () { return state.goals; },
            onSaved: function () { reload({ quiet: true }); },
          });
          if (placeGlyph) placeKids.unshift(placeGlyph);
        }
        kids.push(h('div', { class: 'kb-place' }, placeKids));
      }
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
      if (state.projects) kids.push(subList(row));
      var accent = row.statutColor || (list && list.color) || '#626f86';
      // Blocked (flag or "Bloqué" status) yet complete: striped red/green accent instead of the plain status colour.
      var blockedDone = !!(row.blocked || row.statutKey === 'blocked') && typeof row.progress === 'number' && row.progress >= 100;
      // Completed / canceled (status, list or 100 %): the tile is grayed out, color returns on hover.
      var closedCard = !blockedDone && (KM().isClosedKey(row.statutKey) || KM().isClosedKey(list && list.category) || (typeof row.progress === 'number' && row.progress >= 100));
      var el = h('div', {
        class: 'kb-card' + (blockedDone ? ' is-blocked-done' : '') + (closedCard ? ' is-complete' : '') + (state.detailId === row.id ? ' is-selected' : ''),
        draggable: 'true',
        tabindex: '0',
        'data-id': row.id,
        'aria-selected': state.detailId === row.id ? 'true' : 'false',
        style: '--kb-accent:' + accent + (blockedDone ? ';--kb-blocked:' + (row.statutKey === 'blocked' ? accent : '#e34935') : ''),
        onclick: function () { if (!state.swallowClick) openDetail(row); },
        onkeydown: function (e) {
          if (e.key === 'Enter' && e.target === el) {
            e.preventDefault();
            openDetail(row);
          }
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
          // Priority rows: a card only moves along its own row (its priority is computed, not dropped), so other rows go quiet.
          var own = KM().laneKey(row);
          els.board.querySelectorAll('.kb-cell').forEach(function (c) {
            c.classList.toggle('is-foreign', c.getAttribute('data-lane') !== own);
          });
        },
        ondragend: function () {
          state.dragId = null;
          els.board.classList.remove('is-dragging');
          els.board.querySelectorAll('.kb-cell.is-foreign').forEach(function (c) { c.classList.remove('is-foreign'); });
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
      var current = null;
      state.lists.forEach(function (l) { if (l.id === row.listId) current = l; });
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
        { icon: 'archive', label: 'Archiver', danger: true, action: function () { archiveRow(row); } },
        { sep: true },
        { icon: 'external-link', label: 'Ouvrir la carte', action: function () { openCard(row); } },
        {
          icon: 'external-link',
          label: 'Ouvrir dans',
          children: (global.ViewTabs ? global.ViewTabs.OPEN_IN : []).map(function (v) {
            return { icon: v.icon, label: v.label, action: function () { global.ViewTabs.openIn(v.key, row.id); } };
          }),
        },
        { sep: true },
        {
          icon: (current && current.icon) || 'progress-check',
          color: current && current.color,
          label: 'Statut',
          hint: (current && current.name) || row.statut || '',
          children: moveItems,
        },
      ].concat(global.Isolation ? global.Isolation.menuItems({
        cardId: row.id,
        cardName: row.name,
        projectId: row.projectId || '',
        projectName: row.project || '',
        people: global.Isolation.peopleOf(row),
      }) : []));
    }

    function archiveRow(row) {
      TT().archiveCard(t, row.id).then(function () {
        record({ type: 'archive', targetId: row.id, title: row.name, after: row.statut || '' });
        state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
        if (state.detailId === row.id) closeDetail();
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
      els.board.querySelectorAll('.is-drop-before, .is-drop-after, .is-drop-on').forEach(function (n) {
        n.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-on');
      });
    }

    /** Where a dragged column would land at `x`: its index among the other columns, plus the neighbour to mark. */
    function columnDropAt(x) {
      var cols = [].slice.call(els.board.querySelectorAll('.kb-col:not(.is-dragging-col), .kb-colhead:not(.is-dragging-col)'));
      var rects = cols.map(function (n) { return n.getBoundingClientRect(); });
      var index = KM().columnInsertIndex(rects, x);
      return { index: index, before: cols[index] || null, after: index > 0 ? cols[index - 1] : null };
    }

    // Column reordering: dragging a column header over the board moves a marker; dropping saves the list's new position.
    els.board.addEventListener('dragover', function (e) {
      if (!state.dragListId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      var at = columnDropAt(e.clientX);
      if (at.before) at.before.classList.add('is-drop-before');
      else if (at.after) at.after.classList.add('is-drop-after');
    });
    els.board.addEventListener('drop', function (e) {
      if (!state.dragListId) return;
      e.preventDefault();
      var id = state.dragListId;
      var index = columnDropAt(e.clientX).index;
      clearDropMarks();
      dropList(id, index);
    });

    /** Index among the column's tiles (without the dragged one) where a drop at `y` lands. */
    function dropIndex(body, y) {
      var rects = [].slice.call(body.querySelectorAll('.kb-card:not(.is-dragging)')).map(function (n) {
        var r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, node: n };
      });
      return { index: KM().insertIndex(rects, y), rects: rects };
    }

    /**
     * Column header (icon, name, count, "+"): also the handle that reorders the board's lists.
     * `host` is the element that dims while the header is dragged and serves as the drag image.
     */
    function colHead(col, host) {
      var list = col.list;
      return h('header', {
        class: 'kb-col-head',
        draggable: 'true',
        title: 'Glisser pour réorganiser les colonnes',
        ondragstart: function (e) {
          state.dragListId = list.id;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', 'list:' + list.id); } catch (err) { /* ignore */ }
          try { e.dataTransfer.setDragImage(host, 20, 20); } catch (err) { /* default drag image */ }
          setTimeout(function () { host.classList.add('is-dragging-col'); }, 0);
          els.board.classList.add('is-dragging-list');
        },
        ondragend: function () {
          state.dragListId = null;
          els.board.classList.remove('is-dragging-list');
          host.classList.remove('is-dragging-col');
          clearDropMarks();
        },
      }, [
        h('span', { class: 'kb-col-icon' }, [icon(list.icon)]),
        h('span', { class: 'kb-col-name', text: list.name, title: list.name }),
        (function () {
          var over = list.category === 'started' && global.WorkOS && global.WorkOS.wip(state.rows, global.WorkOS.DEFAULT_WIP);
          if (over && over.over) {
            return h('button', {
              class: 'kb-col-count is-over',
              type: 'button',
              title: 'Ranger la moins prioritaire',
              text: over.count + '/' + over.cap,
              onclick: function (e) {
                e.stopPropagation();
                e.preventDefault();
                var park = over.park;
                var dest = state.lists.filter(function (l) { return l.category === 'unstarted'; })[0]
                  || state.lists.filter(function (l) { return l.category === 'backlog'; })[0];
                if (park && dest) dropCard(park.id, dest.id, null);
              },
            });
          }
          return h('span', { class: 'kb-col-count', text: String(filtering() ? col.cards.length : col.total) });
        })(),
        h('button', {
          class: 'kb-iconbtn',
          title: 'Nouvelle carte',
          onclick: function () { openComposer(list.id); },
        }, [icon('plus')]),
      ]);
    }

    /**
     * Makes `zone` accept dragged cards, marking the landing spot among `body`'s tiles. `lane` (priority view only)
     * limits the zone to cards of that row: moving to another row would need a different priority, which is computed.
     */
    function bindDropZone(zone, body, list, lane) {
      function accepts() {
        if (state.dragProjectId) return !lane;
        if (!state.dragId) return false;
        if (!lane) return true;
        var dragged = findRow(state.dragId);
        return !!dragged && KM().laneKey(dragged) === lane;
      }
      zone.addEventListener('dragover', function (e) {
        if (!accepts()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDropMarks();
        zone.classList.add('is-over');
        if (state.dragProjectId) return;
        var at = dropIndex(body, e.clientY);
        var marker = h('div', { class: 'kb-drop' });
        var ref = at.rects[at.index];
        var empty = body.querySelector('.kb-empty');
        if (ref) body.insertBefore(marker, ref.node);
        else if (empty) body.insertBefore(marker, empty);
        else body.appendChild(marker);
      });
      zone.addEventListener('dragleave', function (e) {
        if (!zone.contains(e.relatedTarget)) clearDropMarks();
      });
      zone.addEventListener('drop', function (e) {
        if (!accepts()) return;
        e.preventDefault();
        clearDropMarks();
        if (state.dragProjectId) {
          var projectId = state.dragProjectId;
          state.dragProjectId = null;
          moveProject(projectId, list.id);
          return;
        }
        var at = dropIndex(body, e.clientY).index;
        var id = state.dragId;
        dropCard(id, list.id, at, lane, state.projects && !lane ? '' : null);
      });
    }

    function projectNodes() {
      return ((state.goals && state.goals.nodes) || []).filter(function (n) { return n && n.level === 'project'; });
    }

    function projectGlyph(project) {
      var name = project.icon && project.icon.i ? project.icon.i : 'stack-2';
      var color = project.icon && project.icon.c ? project.icon.c : '';
      return h('i', { class: 'ti ti-' + name + ' kb-proj-glyph', style: color ? 'color:' + color : '' });
    }

    function projectTaskRows(projectId) {
      return (state.rows || []).filter(function (r) { return r && r.projectId === projectId; });
    }

    function saveProjectPriority(id, score) {
      var os = global.WorkOS;
      var GG = global.MindmapGoalsTrello;
      if (!id || !os || typeof os.withNodeEdit !== 'function' || !GG || typeof GG.save !== 'function') {
        return setStatus('Projets indisponibles', 'error');
      }
      var next = os.withNodeEdit(state.goals, id, { priority: score });
      state.goals = next;
      renderBoard();
      setStatus('Enregistrement…', 'busy');
      GG.save(t, next).then(function (saved) {
        state.goals = saved || next;
        renderBoard();
        setStatus(score == null ? 'Priorité retirée' : 'Priorité enregistrée', 'ok');
      }, function () {
        setStatus('Échec de l’enregistrement du projet', 'error');
        reload({ quiet: true });
      });
    }

    function projectPriorityButton(project) {
      if (!project || !project.id) return h('span', { class: 'kb-proj-pri is-empty', text: '-', 'aria-hidden': 'true' });
      var has = typeof project.priority === 'number';
      var btn = h('button', {
        class: 'kb-proj-pri' + (has ? '' : ' is-empty'),
        type: 'button',
        title: 'Priorité',
        text: has && global.TableModel ? global.TableModel.formatPriority(project.priority) : (has ? Number(project.priority).toFixed(1) : '-'),
      });
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!global.TableModel || !MENU()) return;
        var rect = btn.getBoundingClientRect();
        MENU().show({ x: rect.left, y: rect.bottom + 4 }, [{ title: 'Priorité' }].concat(
          global.TableModel.projectPriorityItems(project.priority, function (score) { saveProjectPriority(project.id, score); })
        ));
      });
      btn.addEventListener('dragstart', function (e) { e.preventDefault(); e.stopPropagation(); });
      return btn;
    }

    function projectProgress(projectId) {
      var stats = global.TableModel && global.TableModel.sectionStats
        ? global.TableModel.sectionStats(projectTaskRows(projectId))
        : { progress: null, subs: 0 };
      var prog = stats.progress;
      if (stats.blocked && prog == null) prog = 0;
      var box = h('span', {
        class: 'kb-proj-prog' + (prog == null ? ' is-empty' : '') + (stats.blocked ? ' is-blocked' : ''),
        title: stats.blocked ? 'Une tâche est bloquée' : ((prog != null && prog >= 100) ? 'Rouvrir les tâches' : 'Terminer les tâches'),
        text: prog == null ? '-' : prog + '%',
      });
      var rows = projectTaskRows(projectId);
      if (rows.length) {
        box.style.cursor = 'pointer';
        box.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        box.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var CT = global.CompletionTrello;
          var next = CT && typeof CT.parentClickPercent === 'function' ? CT.parentClickPercent(prog) : ((prog != null && prog >= 100) ? 0 : 100);
          saveProjectProgress(projectId, rows, next);
        });
        box.addEventListener('dragstart', function (e) { e.preventDefault(); e.stopPropagation(); });
      }
      return box;
    }

    /** Project header: the same percent on every task of the project, then the header follows. */
    function saveProjectProgress(projectId, rows, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.saveProgressTree !== 'function') return setStatus('Éditeur de progrès indisponible', 'error');
      var wasDone = {};
      (rows || []).forEach(function (r) { wasDone[r.id] = r.statutKey === 'completed'; });
      var name = '';
      projectNodes().forEach(function (n) { if (n.id === projectId) name = n.name || ''; });
      setStatus('Enregistrement…', 'busy');
      CT.saveProgressTree(t, rows, pct).then(function (ids) {
        if (pct < 100) return null;
        var list = state.lists.filter(function (l) { return l.category === 'completed'; })[0];
        if (!list || !global.TableTrello) return null;
        var chain = Promise.resolve();
        (ids || []).forEach(function (id) {
          if (wasDone[id]) return;
          chain = chain.then(function () { return global.TableTrello.moveCard(t, id, list.id, 'bottom'); });
        });
        return chain;
      }).then(function () {
        setStatus(pct >= 100 ? '« ' + (name || 'Projet') + ' » terminé' : 'Enregistré', 'ok');
        return reload({ quiet: true });
      }, function (err) {
        setStatus((err && err.message) || 'Erreur progrès', 'error');
        reload({ quiet: true });
      });
    }

    /** One project shell: its tasks in this column, and their subtasks on each tile. A guest is the same name in another column, not a second project to drag. */
    function projectBlock(block, list, body) {
      var id = block.project.id;
      var folded = !!state.projFolded[id];
      var guest = !!block.guest;
      var shell = h('div', {
        class: 'kb-proj' + (guest ? ' is-guest' : '') + (folded ? ' is-folded' : ''),
        'data-project': id,
      });
      var head = h('div', {
        class: 'kb-proj-head',
        draggable: guest ? 'false' : 'true',
        title: guest ? (block.project.name || 'Projet') : 'Glisser le projet vers une autre colonne',
        'aria-label': block.project.name || 'Projet',
      }, [
        h('button', {
          class: 'kb-proj-fold',
          type: 'button',
          title: folded ? 'Déplier' : 'Replier',
          onclick: function (e) {
            e.stopPropagation();
            if (folded) delete state.projFolded[id];
            else state.projFolded[id] = true;
            writeStored(PROJ_FOLDED_KEY, state.projFolded);
            renderBoard();
          },
        }, [icon(folded ? 'chevron-right' : 'chevron-down')]),
        projectGlyph(block.project),
        h('span', { class: 'kb-proj-name', text: block.project.name || 'Projet' }),
        projectPriorityButton(block.project),
        projectProgress(block.project.id),
        h('span', {
          class: 'kb-proj-n',
          text: block.tasks.length === block.total ? String(block.total) : block.tasks.length + '/' + block.total,
        }),
      ]);
      if (!guest) {
        head.ondragstart = function (e) {
          if (e.target && e.target.closest && e.target.closest('.kb-proj-pri, .kb-proj-prog')) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          state.dragProjectId = id;
          state.dragId = null;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', 'project:' + id); } catch (err) { /* ignore */ }
          setTimeout(function () { shell.classList.add('is-dragging'); }, 0);
          els.board.classList.add('is-dragging');
        };
        head.ondragend = function () {
          state.dragProjectId = null;
          els.board.classList.remove('is-dragging');
          shell.classList.remove('is-dragging');
          clearDropMarks();
        };
      }
      head.addEventListener('dragstart', function (e) {
        if (e.target && e.target.closest && e.target.closest('.kb-proj-pri, .kb-proj-prog')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
      shell.appendChild(head);
      shell.addEventListener('dragover', function (e) {
        if (state.dragProjectId || !state.dragId) return;
        e.preventDefault();
        shell.classList.add('is-drop-on');
      });
      shell.addEventListener('dragleave', function (e) {
        if (e.relatedTarget && shell.contains(e.relatedTarget)) return;
        shell.classList.remove('is-drop-on');
      });
      shell.addEventListener('drop', function (e) {
        if (state.dragProjectId || !state.dragId || !body) return;
        e.preventDefault();
        e.stopPropagation();
        clearDropMarks();
        var at = dropIndex(body, e.clientY).index;
        dropCard(state.dragId, list.id, at, null, block.project.id);
      });
      if (!folded) block.tasks.forEach(function (row) { shell.appendChild(tile(row, list)); });
      return shell;
    }

    function column(col) {
      var list = col.list;
      var body = h('div', { class: 'kb-cards' });
      if (state.projects && col.blocks) {
        col.blocks.forEach(function (block) { body.appendChild(projectBlock(block, list, body)); });
        col.guests.forEach(function (block) { body.appendChild(projectBlock(block, list, body)); });
        col.loose.forEach(function (row) { body.appendChild(tile(row, list)); });
      } else {
        col.cards.forEach(function (row) { body.appendChild(tile(row, list)); });
      }
      var shown = state.projects && col.blocks ? col.blocks.length + col.guests.length + col.loose.length : col.cards.length;
      // An empty column shows no placeholder: the "+ Ajouter une carte" button below is also a drop target (the whole column accepts drops).
      if (!shown && (col.hidden || filtering())) {
        body.appendChild(h('div', { class: 'kb-empty', text: col.hidden ? col.total + ' masquée' + (col.total > 1 ? 's' : '') : 'Aucune carte' }));
      }
      var colEl = h('section', {
        class: 'kb-col' + (KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        style: '--kb-accent:' + list.color,
      });
      colEl.appendChild(colHead(col, colEl));
      colEl.appendChild(h('div', { class: 'kb-col-scroll' }, [body, composer(list)]));
      bindDropZone(colEl, body, list, null);
      if (global.InsertGap) {
        global.InsertGap.watch(body, {
          item: '.kb-card',
          placeholder: 'Titre…',
          enabled: function () {
            return !els.board.classList.contains('is-dragging') && !els.board.classList.contains('is-dragging-list');
          },
          onCreate: function (title, info) {
            var aboveId = info.above && info.above.getAttribute('data-id');
            var belowId = info.below && info.below.getAttribute('data-id');
            return createIn(list, title, posAt(list.id, aboveId, belowId));
          },
        });
      }
      return colEl;
    }

    function composer(list) {
      if (state.composer !== list.id) {
        return h('button', { class: 'kb-add', onclick: function () { openComposer(list.id); } }, [icon('plus'), h('span', { text: 'Nouvelle carte' })]);
      }
      var input = h('textarea', { class: 'kb-add-input', rows: '2', placeholder: 'Nouvelle carte…' });
      var busy = false;
      function submit(fromBlur) {
        var name = input.value.trim();
        if (!name || busy) return;
        busy = true;
        input.disabled = true;
        createIn(list, name).then(function () {
          state.composer = fromBlur === true ? null : list.id;
          renderBoard();
          var next = fromBlur === true ? null : els.board.querySelector('.kb-add-input');
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
      // Clicking away keeps what was typed: the card is created (the composer's own buttons handle themselves).
      input.addEventListener('blur', function (e) {
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.kb-composer')) return;
        submit(true);
      });
      return h('div', { class: 'kb-composer' }, [
        input,
        h('div', { class: 'kb-composer-actions' }, [
          h('button', { class: 'kb-btn kb-btn--primary', onclick: function () { submit(); } }, [h('span', { text: 'Ajouter' })]),
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

    /* ── Priority rows (Y axis) ────────────────────────────────────── */
    /** Sticky column header of the priority view: the same header as a column, plus the composer when open. */
    function laneColHead(col) {
      var list = col.list;
      var box = h('div', {
        class: 'kb-colhead' + (KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        style: '--kb-accent:' + list.color,
      });
      var inner = h('div', { class: 'kb-colhead-box' });
      inner.appendChild(colHead(col, box));
      if (col.hidden && !col.cards.length) {
        inner.appendChild(h('div', { class: 'kb-empty', text: col.total + ' masquée' + (col.total > 1 ? 's' : '') }));
      }
      if (state.composer === list.id) inner.appendChild(composer(list));
      box.appendChild(inner);
      return box;
    }

    /** Row title ("Critique 3"): click folds the row. The chevron swaps in place, nothing around it moves. */
    function laneHead(lane) {
      var folded = !!state.lanesFolded[lane.key];
      return h('div', {
        class: 'kb-lane-head' + (lane.count ? '' : ' is-empty'),
        'data-lane': lane.key,
        style: lane.color ? '--kb-lane:' + lane.color : null,
      }, [
        h('button', {
          class: 'kb-lane-toggle',
          type: 'button',
          'aria-expanded': folded ? 'false' : 'true',
          title: folded ? 'Déplier' : 'Replier',
          onclick: function () {
            if (folded) delete state.lanesFolded[lane.key];
            else state.lanesFolded[lane.key] = true;
            writeStored(LANES_FOLDED_KEY, state.lanesFolded);
            renderBoard();
          },
        }, [
          icon(folded ? 'chevron-right' : 'chevron-down'),
          h('span', { class: 'kb-lane-dot' }),
          h('span', { class: 'kb-lane-name', text: lane.label }),
          h('span', { class: 'kb-lane-count', text: String(lane.count) }),
        ]),
      ]);
    }

    /** One list's cards inside one priority row. */
    function laneCell(lane, cell) {
      var list = cell.list;
      var body = h('div', { class: 'kb-cards' });
      cell.cards.forEach(function (row) { body.appendChild(tile(row, list)); });
      var el = h('div', {
        class: 'kb-cell' + (KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        'data-lane': lane.key,
        style: '--kb-accent:' + list.color,
      }, [body]);
      bindDropZone(el, body, list, lane.key);
      return el;
    }

    function lanesBoard(model) {
      var grid = h('div', { class: 'kb-lanes', style: '--kb-n:' + model.columns.length });
      var heads = h('div', { class: 'kb-lanes-heads' });
      model.columns.forEach(function (col) { heads.appendChild(laneColHead(col)); });
      grid.appendChild(heads);
      model.lanes.forEach(function (lane) {
        grid.appendChild(laneHead(lane));
        // An empty or folded row is just its title: there is nothing to drop into (a card only moves along its own row).
        if (!lane.count || state.lanesFolded[lane.key]) return;
        lane.cells.forEach(function (cell) { grid.appendChild(laneCell(lane, cell)); });
      });
      return grid;
    }

    function renderBoard() {
      if (global.Isolation) global.Isolation.adopt(t, state.rows);
      var scrollX = els.board.scrollLeft;
      var scrollY = els.board.scrollTop;
      var scrolls = {};
      var focusId = '';
      var active = document.activeElement;
      if (active && active.closest && els.board.contains(active)) {
        var focusedCard = active.closest('.kb-card');
        if (focusedCard) focusId = focusedCard.getAttribute('data-id') || '';
      }
      els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-col-scroll');
        if (b) scrolls[c.getAttribute('data-list')] = b.scrollTop;
      });
      els.board.textContent = '';
      els.board.classList.toggle('is-lanes', state.lanes);
      els.board.classList.toggle('is-projects', !!state.projects && !state.lanes);
      var model = state.lanes ? KM().buildLanes(state.rows, state.lists, viewOpts()) : null;
      var cols = state.projects && !state.lanes
        ? KM().buildProjectColumns(state.rows, state.lists, projectNodes(), viewOpts())
        : (model ? model.columns : columns());
      if (!cols.length) {
        els.board.appendChild(h('div', { class: 'kb-loading', text: 'Aucune liste dans ce tableau.' }));
        return;
      }
      if (model) els.board.appendChild(lanesBoard(model));
      else cols.forEach(function (c) { els.board.appendChild(column(c)); });
      global.Skeleton.remember('kanban', { cols: cols.map(function (c) { return c.cards.length; }) });
      els.board.scrollLeft = scrollX;
      if (model) els.board.scrollTop = scrollY;
      els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-col-scroll');
        var s = scrolls[c.getAttribute('data-list')];
        if (b && s) b.scrollTop = s;
      });
      if (focusId) {
        var again = els.board.querySelector('.kb-card[data-id="' + focusId + '"]');
        if (again) again.focus({ preventScroll: true });
      }
    }

    /* ── Writes ────────────────────────────────────────────────────── */
    /** Moves a project shell into a column. Tasks stay where they are. */
    function moveProject(projectId, listId) {
      state.dragProjectId = null;
      var os = global.WorkOS;
      var GG = global.MindmapGoalsTrello;
      var cur = projectNodes().filter(function (n) { return n.id === projectId; })[0];
      if (!cur || !listId || cur.listId === listId) return renderBoard();
      if (!os || typeof os.withProjectList !== 'function' || !GG || typeof GG.save !== 'function') {
        setStatus('Enregistrement impossible', 'error');
        return renderBoard();
      }
      var next = os.withProjectList(state.goals, projectId, listId);
      state.goals = next;
      renderBoard();
      setStatus('Déplacement…');
      GG.save(t, next).then(function (saved) {
        state.goals = saved || next;
        setStatus('Projet déplacé', 'ok');
      }, function () {
        setStatus('Échec du déplacement', 'error');
        reload({ quiet: true });
      });
    }

    /**
     * Moves a card into `listId` at `index` among that list's other cards (null = bottom).
     * `lane` (priority view): `index` counts the tiles of that row only.
     */
    function dropCard(id, listId, index, lane, projectId) {
      state.dragId = null;
      var moved = findRow(id);
      var list = listById(listId);
      if (!moved || !list) return renderBoard();
      var wantProject = projectId == null ? null : String(projectId);
      var siblings = KM().siblingsFor(state.rows, listId, id);
      var at = index == null ? siblings.length : index;
      // `index` counts the *visible* tiles; map it onto the full list so hidden cards keep their place.
      var visible = siblings.filter(function (r) {
        if (lane && KM().laneKey(r) !== lane) return false;
        return columns().some(function (c) { return c.list.id === listId && c.cards.indexOf(r) !== -1; });
      });
      if (visible.length !== siblings.length && at < visible.length) at = siblings.indexOf(visible[at]);
      else if (visible.length !== siblings.length) at = siblings.length;
      var pos = TM().dropPos(siblings, at);
      var listChanged = moved.listId !== listId;
      var from = { listId: moved.listId, statut: moved.statut, pos: moved.pos };
      var projectChanged = wantProject != null && (moved.projectId || '') !== wantProject;
      var nextGoals = null;
      if (projectChanged) {
        var os = global.WorkOS;
        var GG = global.MindmapGoalsTrello;
        if (!os || typeof os.withTaskProject !== 'function' || !GG || typeof GG.save !== 'function') {
          setStatus('Projets indisponibles', 'error');
          projectChanged = false;
        } else {
          nextGoals = os.withTaskProject(state.goals, id, wantProject || null);
          state.goals = nextGoals;
          if (typeof os.places === 'function') state.places = os.places(nextGoals);
          moved.projectId = wantProject;
        }
      }
      var orderChanged = listChanged || from.pos !== pos;
      if (!orderChanged && !projectChanged) return renderBoard();
      if (orderChanged) {
        moved.pos = pos;
        moved.listId = listId;
        moved.statut = list.name;
        moved.statutKey = list.category;
        moved.statutColor = list.color;
      }
      // Dropped into a hidden (completed) column: dissolve the tile instead of making it vanish.
      var tile = state.hideDone && !filtering() ? els.board.querySelector('.kb-card[data-id="' + id + '"]') : null;
      var target = columns().filter(function (c) { return c.list.id === listId; })[0];
      if (tile && target && target.hidden && orderChanged) {
        tile.classList.remove('is-dragging');
        tile.classList.add('is-dissolving');
        setTimeout(renderBoard, 450);
      } else renderBoard();
      paintCount();
      setStatus('Enregistrement…', 'busy');
      var jobs = [];
      if (orderChanged) {
        var op = listChanged ? TT().moveCard(t, id, listId, pos) : TT().reorderCard(t, id, pos);
        jobs.push(op.then(function () {
          if (listChanged) record({ type: 'move', targetId: id, title: moved.name, key: 'statut', before: from.statut, after: list.name, beforeVal: from.listId, afterVal: listId, beforePos: from.pos, afterPos: pos });
          else record({ type: 'reorder', targetId: id, title: moved.name, after: list.name, beforeVal: from.pos, afterVal: pos });
        }));
      }
      if (nextGoals) {
        jobs.push(global.MindmapGoalsTrello.save(t, nextGoals).then(function (saved) {
          state.goals = saved || nextGoals;
        }));
      }
      Promise.all(jobs).then(function () {
        var load = list.category === 'started' && global.WorkOS ? global.WorkOS.wip(state.rows, global.WorkOS.DEFAULT_WIP) : null;
        var note = load && load.over ? ' · En cours ' + load.count + '/' + load.cap : '';
        var msg = projectChanged
          ? (wantProject ? 'Projet enregistré' : 'Projet retiré')
          : (listChanged ? 'Carte déplacée dans « ' + list.name + ' »' : 'Ordre enregistré');
        setStatus(msg + note, 'ok');
        renderBoard();
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    /** Moves column `listId` to `index` among the other columns (saved to Trello as the list's pos). */
    function dropList(listId, index) {
      state.dragListId = null;
      var from = state.lists.map(function (l) { return l.id; });
      var next = KM().reorderLists(state.lists, listId, index);
      var changed = next.some(function (l, i) { return l.id !== from[i]; });
      els.board.classList.remove('is-dragging-list');
      if (!changed) return renderBoard();
      var list = listById(listId);
      state.lists = next;
      renderBoard();
      setStatus('Enregistrement…', 'busy');
      TT().moveList(t, listId, index).then(function () {
        setStatus('Colonne « ' + (list ? list.name : '') + ' » déplacée', 'ok');
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    /** Trello `pos` so a card created under another lands between its neighbours. */
    function posAt(listId, aboveId, belowId) {
      var siblings = state.rows.filter(function (r) { return r.listId === listId; }).sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
      var index = siblings.length;
      if (belowId) {
        var bi = siblings.findIndex(function (r) { return r.id === belowId; });
        if (bi >= 0) index = bi;
      } else if (aboveId) {
        var ai = siblings.findIndex(function (r) { return r.id === aboveId; });
        if (ai >= 0) index = ai + 1;
      }
      return TM().dropPos ? TM().dropPos(siblings, index) : 'bottom';
    }

    function createIn(list, typed, pos) {
      var QP = global.QuickParse;
      var q = QP ? QP.parse(typed) : { name: typed, dueDate: '' };
      var name = q.name;
      return TT().createRow(t, name, list.id, pos).then(function (res) {
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
      if (typeof CT.saveProgressTree === 'function') return CT.saveProgressTree(t, [{ id: cardId }], pct);
      return CT.getCardCompletionById(t, cardId).then(function (data) {
        data = CT.normalizeCompletionData(data || { items: [] });
        var next = data.items && data.items.length
          ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
          : Object.assign({}, data, { progress: pct });
        return CT.saveCardCompletionById(t, cardId, CT.normalizeCompletionData(next)).then(function () { return [cardId]; });
      });
    }

    /** Sets a card's progress in place; reaching 100 % also moves it to the board's completed list (like the Table). */
    function saveProgress(row, pct) {
      var prev = row.progress;
      var from = { listId: row.listId, statut: row.statut, pos: row.pos };
      var wasDone = row.statutKey === 'completed';
      row.progress = pct;
      setStatus('Enregistrement…', 'busy');
      writeProgress(row.id, pct)
        .then(function (ids) {
          var done = pct >= 100
            ? state.lists.filter(function (l) { return l.category === 'completed'; })[0]
            : null;
          if (!done) return null;
          var chain = Promise.resolve(null);
          (ids || [row.id]).forEach(function (id) {
            if (id === row.id && wasDone) return;
            chain = chain.then(function () { return TT().moveCard(t, id, done.id, 'bottom').then(function () { return done; }); });
          });
          return chain;
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
    function goalPlaces() {
      var goals = global.MindmapGoalsTrello;
      var os = global.WorkOS;
      if (!goals || typeof goals.load !== 'function' || !os || typeof os.places !== 'function') return Promise.resolve({});
      return goals.load(t).then(function (g) {
        state.goals = g || { nodes: [], links: [] };
        if (global.ProjectIcon && typeof global.ProjectIcon.remember === 'function') global.ProjectIcon.remember(state.goals);
        return os.places(state.goals);
      }).catch(function () { return {}; });
    }

    function reload(opts) {
      if (!opts || !opts.quiet) els.board.innerHTML = global.Skeleton.html('kanban.cols');
      return Promise.all([
        TT().load(t),
        global.PriorityTrello.isRestAuthorized(t).catch(function () { return false; }),
        goalPlaces(),
      ]).then(function (res) {
        state.lists = res[0].lists;
        state.rows = res[0].rows;
        state.authOk = !!res[1];
        state.places = res[2] || {};
        (state.rows || []).forEach(function (row) {
          var place = state.places[row.id];
          row.projectId = place && place.projectId ? place.projectId : '';
        });
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
    // Linear-style keys on the hovered card: S statut, P urgence, D échéance, C nouvelle carte (shared composer).
    function openNewCard() {
      var cols = state.lists.filter(function (l) { return l.category !== 'completed' && l.category !== 'canceled' && l.category !== 'blocked'; });
      var target = cols.filter(function (l) { return l.category === 'unstarted'; })[0] || cols[0];
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: t,
        lists: state.lists,
        listId: target.id,
        onError: fail,
        onCreated: function (c) {
          if (c.cardId) record({ type: 'create', targetId: c.cardId, title: c.name, after: c.list.name });
          function present() { return !c.cardId || state.rows.some(function (r) { return r.id === c.cardId; }); }
          (function again(n) {
            return reload({ quiet: true }).then(function () {
              if (present() || n >= 4) return setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok');
              return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(n + 1); });
            });
          })(0);
        },
      });
    }
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: t,
        hoverSelector: '.kb-card',
        idOf: function (el) { return el.getAttribute('data-id'); },
        row: findRow,
        lists: function () { return state.lists; },
        selectedId: function () {
          var active = document.activeElement && document.activeElement.closest && document.activeElement.closest('.kb-card');
          if (active && els.board.contains(active)) return active.getAttribute('data-id');
          return state.detailId || '';
        },
        anchorFor: function (id) {
          return els.board.querySelector('.kb-card[data-id="' + id + '"]') || els.detailBody;
        },
        setStatus: function (row, list) { dropCard(row.id, list.id, null); },
        setUrgency: function (row, urgencyId) {
          setStatus('Enregistrement…', 'busy');
          global.LinearKeys.saveUrgency(t, row.id, urgencyId).then(function () {
            record({ type: 'field', label: 'Urgence', targetId: row.id, title: row.name });
            return reload({ quiet: true });
          }).then(function () { setStatus('Enregistré', 'ok'); }, fail);
        },
        openDue: function (row, anchor) { openEditor(row, 'due', anchor); },
        newCard: openNewCard,
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () {
          return state.rows.map(function (r) { var l = listById(r.listId); return { id: r.id, name: r.name, hint: l ? l.name : '' }; });
        },
        onCard: function (id) {
          var row = findRow(id);
          if (!row) return;
          openDetail(row);
          var n = els.board.querySelector('.kb-card[data-id="' + id + '"]');
          if (n) { n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); n.focus({ preventScroll: true }); }
        },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: openNewCard }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }
    function typingTarget(node) {
      if (!node || !node.tagName) return false;
      var tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    }
    /** Arrow keys in the priority view: up/down walk one list's cards from row to row, left/right hop to the neighbouring list in the same row. */
    function moveLaneFocus(cur, dx, dy) {
      var cell = cur.closest('.kb-cell');
      if (!cell) return null;
      var listId = cell.getAttribute('data-list');
      if (dy) {
        var inList = [].slice.call(els.board.querySelectorAll('.kb-cell[data-list="' + listId + '"] .kb-card'));
        return inList[inList.indexOf(cur) + dy] || null;
      }
      var ids = [].slice.call(els.board.querySelectorAll('.kb-colhead')).map(function (n) { return n.getAttribute('data-list'); });
      var lane = cell.getAttribute('data-lane');
      var inCell = [].slice.call(cell.querySelectorAll('.kb-card'));
      var i = inCell.indexOf(cur);
      for (var k = ids.indexOf(listId) + dx; k >= 0 && k < ids.length; k += dx) {
        var there = [].slice.call(els.board.querySelectorAll('.kb-cell[data-list="' + ids[k] + '"][data-lane="' + lane + '"] .kb-card'));
        if (there.length) return there[Math.min(i, there.length - 1)];
      }
      return null;
    }
    function moveCardFocus(dx, dy) {
      var cols = [].slice.call(els.board.querySelectorAll('.kb-col'));
      var cur = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.kb-card') : null;
      if (!cur || !els.board.contains(cur)) {
        var first = els.board.querySelector('.kb-card');
        if (first) first.focus();
        return;
      }
      if (state.lanes) {
        var hop = moveLaneFocus(cur, dx, dy);
        if (!hop) return;
        hop.focus({ preventScroll: true });
        hop.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      var col = cur.closest('.kb-col');
      var inCol = [].slice.call(col.querySelectorAll('.kb-card'));
      var i = inCol.indexOf(cur);
      var next = null;
      if (dy) next = inCol[i + dy] || null;
      else if (dx) {
        var dest = cols[cols.indexOf(col) + dx];
        if (!dest) return;
        var there = [].slice.call(dest.querySelectorAll('.kb-card'));
        next = there.length ? there[Math.min(i, there.length - 1)] : null;
      }
      if (!next) return;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    document.addEventListener('keydown', function (e) {
      if (!els.root || !document.body.contains(els.root)) return;
      if (typingTarget(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('.kb-detail')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((global.LinearPick && global.LinearPick.isOpen()) || (global.NewCard && global.NewCard.isOpen()) || (global.CardFields && global.CardFields.isOpen())) return;
      if (document.querySelector('.tp-context-menu')) return;
      if (e.key === 'Escape') {
        if (!state.detailId) return;
        e.preventDefault();
        closeDetail();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCardFocus(0, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCardFocus(0, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCardFocus(1, 0); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCardFocus(-1, 0); }
    });
    renderBar();
    els.board.innerHTML = global.Skeleton.html('kanban.cols');
    if (global.AssistantDock) {
      global.AssistantDock.mount({ t: t, after: root, onRefresh: function () { reload({ quiet: true }); }, isBusy: function () { return global.CardFields && global.CardFields.isOpen(); } });
    }
    return reload({ quiet: true });
  }

  global.KanbanUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
