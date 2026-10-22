/*
 * Role: UI of the Dashboard view, a Linear-style workspace:
 *   Triage        the list of captured cards and, beside it, TriageUI: what the card is, its priority / estimate / day / place,
 *                 then the decision: accept, backlog, waiting, someday, reference, cancel (an undo stays one click away)
 *   Orchestrateur zoom glides from minutes to Vague (wheel eases, columns stretch, the instant under the cursor stays). Each column creates a task in place.
 *                 Under my row, one row per other person (PeopleBoardUI): drag a card onto theirs to hand it over; the wheel over them scrolls the list.
 *   Aujourd'hui   focus list, the hour-by-hour timeline, and the revue (triage, next step, waiting, work in progress, project outcome).
 * Data and writes: DashboardTrello (Trello is the source of truth); logic: DashboardModel + WorkOS (pure).
 * Keys: 1-3 section · J/K move · A accept · B backlog · E waiting · U someday · R reference · X cancel (Triage).
 * Right-click a card: triage exits, day, fields, open, move, archive (same menu in every section).
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var DM = function () { return global.DashboardModel; };
  var DT = function () { return global.DashboardTrello; };
  var TM = function () { return global.TableModel; };
  var WO = function () { return global.WorkOS; };
  var PB = function () { return global.PeopleBoardModel; };
  // What a dragged card carries besides its id: the row it left ('me' or a person key).
  var OWNER_TYPE = 'application/x-tp-owner';
  var ME = 'me'; // the key of my own row (PeopleBoardModel.ME)

  var SECTIONS = [
    { key: 'triage', label: 'Triage', icon: 'circle-arrow-down', hint: '1' },
    { key: 'orchestrator', label: 'Orchestrateur', icon: 'calendar-event', hint: '2' },
    { key: 'today', label: 'Aujourd’hui', icon: 'sun', hint: '3' },
  ];
  var URGENCIES = global.DashboardModel.URGENCIES;
  var QUICK_ESTIMATES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 0];
  var DAYS_FR =['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var HORIZON = 7;
  var SCALE_ICON = {
    minute: 'clock',
    hour: 'clock-hour-4',
    day: 'calendar-event',
    week: 'calendar-week',
    month: 'calendar-month',
    year: 'calendar',
    years: 'calendar-stats',
    vague: 'tilde',
  };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
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
    return DM().isoOf(new Date());
  }

  /** Icon for a day relative to today (circle-dot, jumping arrow, two arrows, calendars). */
  function dayIconName(iso, today) {
    var days = Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    var CM = global.ContextMenu;
    return CM && CM.dayIcon ? CM.dayIcon(days) : 'calendar-event';
  }

  function dayLabel(iso, today) {
    if (iso === today) return 'Aujourd’hui';
    if (iso === DM().addDays(today, 1)) return 'Demain';
    // The Monday the triage offers in one click ("Lundi"): spelled out instead of dated.
    if (today && iso === DM().quickDays(today)[2].iso) return 'Lundi prochain';
    var d = new Date(iso + 'T00:00:00');
    return DAYS_FR[d.getDay()] + ' ' + TM().formatDay(iso);
  }

  function isWeekend(iso) {
    var d = new Date(iso + 'T00:00:00').getDay();
    return d === 0 || d === 6;
  }

  /** "14:00" → "14 h", "14:15" → "14 h 15". */
  function clockLabel(hhmm) {
    var n = DM().parseClock ? DM().parseClock(hhmm) : null;
    if (n == null || n >= 1440) return '';
    var h = Math.floor(n / 60);
    var m = n % 60;
    return m ? h + ' h ' + ('0' + m).slice(-2) : h + ' h';
  }

  /**
   * What the day chip offers: the next eight days, then a "Plus tard" submenu with the vague horizons.
   * Ids are `plan:<iso>` and `vague:<id>`; the page attaches the actions.
   * vagues: [{ id, label }]
   */
  function dueChoices(row, today, vagues) {
    row = row || {};
    var vague = row.dueVague || '';
    var day = vague ? '' : row.due || '';
    var items = [];
    for (var n = 0; n <= 7; n++) {
      var iso = DM().addDays(today, n);
      items.push({
        id: 'plan:' + iso,
        label: dayLabel(iso, today),
        icon: dayIconName(iso, today),
        checked: day === iso,
      });
    }
    var later = (vagues || []).map(function (v) {
      return { id: 'vague:' + v.id, label: v.label, icon: 'calendar-time', checked: vague === v.id };
    });
    if (later.length) items.push({ id: 'later', label: 'Plus tard', icon: 'calendar-time', children: later });
    return items;
  }

  /**
   * Right-click entries for one card. Actions are attached by the page (`perform`);
   * this only decides labels, icons and submenus so the same menu can be tested.
   * ctx: { today, lists, waitingNames, canCreate, vagues: [{ id, label }] }
   */
  function menuEntries(row, ctx) {
    ctx = ctx || {};
    row = row || {};
    var today = ctx.today || '';
    var triage = row.statutKey === 'triage';
    var done = !!row.dueDone || row.statutKey === 'completed';
    var canceled = row.statutKey === 'canceled';
    var open = !done && !canceled;
    // Archiver is always the first entry of a card menu, in every view.
    var items = [{ id: 'archive', label: 'Archiver', icon: 'archive', group: 'Trier', danger: true }];

    // The decisions: words, icon and key come from DashboardModel.TRIAGE_EXITS, the keys only work in the triage.
    function exitEntry(id, extra) {
      var ex = DM().exitById(id);
      return Object.assign({ id: id, label: ex.label, icon: ex.icon, group: 'Trier', hint: triage ? ex.key.toUpperCase() : undefined, danger: !!ex.danger }, extra || {});
    }
    if (triage) {
      items.push(exitEntry('accept'));
      items.push(exitEntry('backlog'));
    }
    if (open) {
      items.push(exitEntry('reference'));
      var names = ctx.waitingNames || [];
      var waitKids = names.map(function (n) {
        return { id: 'wait:' + n, label: n, icon: 'user', checked: row.waiting === n };
      });
      if (triage) waitKids.push({ id: 'wait:', label: names.length ? 'Autre…' : 'Choisir…', icon: 'pencil' });
      if (waitKids.length) items.push(exitEntry('waiting', { children: waitKids }));
      items.push(exitEntry('someday'));
    }
    if (triage) items.push(exitEntry('cancel'));
    if (open && !triage) items.push({ id: 'complete', label: 'Terminer', icon: 'circle-check', group: 'Trier', success: true });
    if (done) items.push({ id: 'reopen', label: 'Rouvrir', icon: 'rotate', group: 'Trier' });

    var days = [];
    if (today && DM()) {
      for (var n = 0; n <= 7; n++) {
        var iso = DM().addDays(today, n);
        days.push({
          id: 'plan:' + iso,
          label: dayLabel(iso, today),
          icon: dayIconName(iso, today),
          checked: row.due === iso && !row.dueVague,
        });
      }
    }
    if (row.due && !row.dueVague && !days.some(function (d) { return d.checked; })) {
      days.unshift({ id: 'plan:' + row.due, label: dayLabel(row.due, today), icon: 'calendar-event', checked: true });
    }
    (ctx.vagues || []).forEach(function (v) {
      days.push({ id: 'vague:' + v.id, label: v.label, icon: 'calendar-time', checked: row.dueVague === v.id });
    });
    if (row.due || row.dueVague) days.push({ id: 'plan:', label: 'Effacer la date', icon: 'calendar-off', danger: true });
    if (days.length) items.push({ id: 'due', label: 'Jour prévu', icon: 'calendar-event', group: 'Échéance', children: days });

    items.push({ id: 'priority', label: 'Priorité…', icon: 'flag', group: 'Modifier' });
    items.push({
      id: 'urgency',
      label: 'Urgence',
      icon: 'flame',
      group: 'Modifier',
      children: URGENCIES.map(function (u) {
        return { id: 'urg:' + u[0], label: u[1], icon: 'flame', checked: row.urgency === u[1] || row.urgency === u[0] };
      }),
    });
    items.push({
      id: 'estimate',
      label: 'Estimation',
      icon: 'clock',
      group: 'Modifier',
      children: QUICK_ESTIMATES.map(function (m) {
        return {
          id: 'est:' + m,
          label: m && DM() ? DM().formatMinutes(m) : 'Non estimée',
          icon: m ? 'clock' : 'clock-off',
          checked: (row.estimate || 0) === m,
        };
      }),
    });
    items.push({ id: 'progress', label: 'Progrès…', icon: 'chart-donut', group: 'Modifier' });
    items.push({ id: 'desc', label: 'Description…', icon: 'align-left', group: 'Modifier' });
    items.push({
      id: 'blocked',
      label: row.blocked ? 'Débloquer' : 'Bloquer',
      icon: row.blocked ? 'player-play' : 'player-pause',
      group: 'Modifier',
    });
    // Hand the card to someone: the people of the board, "Moi" first (ctx.people = PeopleBoardModel.menuPeople).
    if (open && (ctx.people || []).length) {
      items.push({
        id: 'assign',
        label: 'Confier à',
        icon: 'user-share',
        group: 'Modifier',
        children: ctx.people.map(function (p) {
          return { id: 'assign:' + p.key, label: p.name, icon: p.key === 'me' ? 'user-check' : 'user', checked: !!p.on };
        }),
      });
    }

    items.push({ id: 'open-card', label: 'Ouvrir la carte', icon: 'external-link', group: 'Ouvrir' });
    items.push({
      id: 'open-in',
      label: 'Ouvrir dans',
      icon: 'external-link',
      group: 'Ouvrir',
      children: [
        { id: 'open-in:mindmap', label: 'Mindmap', icon: 'hierarchy-2' },
        { id: 'open-in:gantt', label: 'Gantt', icon: 'timeline' },
        { id: 'open-document', label: 'Documents', icon: 'file-text' },
      ],
    });
    items.push({ id: 'open-trello', label: 'Ouvrir dans Trello', icon: 'brand-trello', group: 'Ouvrir', disabled: !row.link });
    items.push({ id: 'copy-link', label: 'Copier le lien', icon: 'link', group: 'Ouvrir', disabled: !row.link });

    var lists = ctx.lists || [];
    if (lists.length) {
      items.push({
        id: 'move',
        label: 'Déplacer vers',
        icon: 'arrow-right',
        group: 'Statut',
        children: lists.map(function (l) {
          return { id: 'list:' + l.id, label: l.name, icon: l.icon || 'circle', checked: l.id === row.listId };
        }),
      });
    }

    items.push({ id: 'new-card', label: 'Nouvelle carte', icon: 'plus', group: 'Créer', hint: 'C', disabled: ctx.canCreate === false });
    return items;
  }

  /** Right-click on empty dashboard space (no card under the pointer). */
  function pageEntries(ctx) {
    ctx = ctx || {};
    var items = [{ id: 'new-card', label: 'Nouvelle carte', icon: 'plus', group: 'Créer', hint: 'C', disabled: ctx.canCreate === false }];
    items.push({ id: 'new-document', label: 'Nouveau document', icon: 'file-plus', group: 'Créer', disabled: ctx.canCreate === false });
    (ctx.sections || SECTIONS).forEach(function (s) {
      items.push({
        id: 'go:' + s.key,
        label: s.label,
        icon: s.icon,
        group: 'Aller à',
        hint: s.hint,
        checked: s.key === ctx.section,
      });
    });
    items.push({ id: 'reload', label: 'Recharger', icon: 'refresh', group: 'Affichage' });
    return items;
  }

  function mount(root, t) {
    var state = {
      section: 'triage',
      lists: [],
      rows: [],
      projects: [],
      places: {},
      selected: null, // triage selection (card id)
      undo: null, // takes back the last decision (a function while it can be)
      goals: { nodes: [], links: [] }, // the Mindmap goal map: projects and the tasks under them
      objectifs: [],
      metrics: [],
      capacity: DT().getCapacity(),
      scale: DT().getScale ? DT().getScale() : 'day',
      zoomP: 0, // pixels per day; 0 means "fit the saved scale" until the user zooms
      zoomTouched: false,
      zoomColPx: 0,
      zoomDay: '', // clock scales follow the day under the cursor
      zoomFocalMs: null,
      zoomFocalX: null,
      busy: false,
      status: '',
      statusKind: '',
      authOk: true,
      landed: false, // first load decides the landing section once
      composer: null, // orchestrator column open for a new task ('pool', 'cal:ISO', 'vague:id')
      composerText: '',
      me: null, // the viewer as a person (PeopleBoardModel.meOf): my row of the Orchestrateur
      teamRaw: null, // { members, catalog }: who can be handed a card (see teamList)
      teamAt: 0,
      filter: '', // side-panel search: narrows every section
      docOpen: false, // the Document pane (paste text and images, get tasks) replaces the card pane of the Triage
      triageTree: !global.TriageTree || global.TriageTree.prefs.treeOn(), // projects > tasks > subtasks, or the flat list
      triageFold: global.TriageTree ? global.TriageTree.prefs.collapsed() : {}, // folded lines of the tree (keys of TriageTree)
      subSel: null, // { taskId, itemId, parentId, key } when a subtask, not its card, is open in the pane
    };
    var docUI = null; // built on first use, kept so the draft survives opening a card
    var statusTimer = null;
    var reloadTimer = null;
    var today = todayIso();

    root.innerHTML = '';
    var els = {
      side: h('nav', { class: 'sp db-side', 'aria-label': 'Dashboard' }),
      nav: h('div', { class: 'db-nav-list' }),
      filter: h('input', { type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher les cartes', autocomplete: 'off' }),
      main: h('main', { class: 'db-main' }),
      status: h('div', { class: 'db-status' }),
    };
    var shell = h('div', { class: 'db-root', tabindex: '-1' }, [els.side, h('div', { class: 'db-col' }, [els.main, els.status])]);
    var filterTimer = null;
    els.filter.addEventListener('input', function () {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(function () {
        state.filter = els.filter.value;
        render();
      }, 120);
    });
    /** The cards the sections show: everything, or only what the side-panel search matches. */
    function viewRows() {
      return state.filter && TM() ? TM().filterRows(state.rows, state.filter) : state.rows;
    }
    root.appendChild(shell);

    /* ── Status ────────────────────────────────────────────────────── */
    /** action: { label, run } adds a button after the message (an undo). */
    function setStatus(msg, kind, keepMs, action) {
      state.status = msg || '';
      state.statusKind = kind || '';
      els.status.className = 'db-status' + (kind ? ' is-' + kind : '');
      els.status.textContent = '';
      if (kind === 'ok') els.status.appendChild(icon('check'));
      if (kind === 'busy') els.status.appendChild(icon('refresh', 'db-spin'));
      if (kind === 'error') els.status.appendChild(icon('alert-triangle'));
      els.status.appendChild(document.createTextNode(msg || ''));
      if (action && typeof action.run === 'function') {
        els.status.appendChild(h('button', { class: 'db-undo', type: 'button', onclick: function () { action.run(); } }, [icon('arrow-back-up'), document.createTextNode(action.label)]));
      }
      clearTimeout(statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        statusTimer = setTimeout(function () { setStatus('', ''); }, keepMs || 2500);
      }
    }

    /* ── Triage list (where Capture drops cards and Triage reads from) ── */
    function hasTriage() {
      return !!DT().listFor(state.lists, ['triage']);
    }

    function activateInbox() {
      if (state.busy) return;
      state.busy = true;
      setStatus('Préparation de la boîte de triage…', 'busy');
      DT().ensureInbox(t, state.lists).then(function (res) {
        // Trello's client cache can lag behind a REST list creation: reload until the list shows up.
        function again(n) {
          return reload({ quiet: true }).then(function () {
            if (hasTriage() || n >= 5) return;
            return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return again(n + 1); });
          });
        }
        return again(0).then(function () {
          state.busy = false;
          setStatus(res.created ? 'Liste « Inbox » créée.' : 'Liste de triage activée.', 'ok');
        });
      }, function (err) { state.busy = false; fail(err); });
    }

    function inboxBanner() {
      return h('div', { class: 'db-banner' }, [
        icon('alert-circle'),
        h('span', { text: 'Ce tableau n’a pas de liste de triage : les tâches capturées n’auraient nulle part où arriver.' }),
        h('button', { class: 'db-btn', type: 'button', onclick: activateInbox }, [icon('inbox'), document.createTextNode('Créer la boîte « Inbox »')]),
      ]);
    }

    function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        state.authOk = false;
        setStatus('Autorisez Trello (REST) pour enregistrer : ouvrez le Kanban ou le Tableau une fois.', 'error');
      } else {
        setStatus('Erreur : ' + (reason || 'inconnue'), 'error');
      }
    }

    /** Runs a write; on failure shows the error and reloads the truth from Trello. */
    function write(promise, okMsg) {
      return promise.then(function (r) {
        if (okMsg) setStatus(okMsg, 'ok');
        scheduleReload();
        return r;
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    // The writes of one card run one after the other: each reads the card's stored values and merges its own,
    // so two quick clicks (an impact, then an urgency) must not read the same old values.
    var queues = {};

    /** Queued write for a card: factory() starts the Trello call once the card's previous write is over. opts: { ok, then(result) }. */
    function save(row, factory, opts) {
      opts = opts || {};
      var prev = queues[row.id] || Promise.resolve();
      var run = prev.then(factory, factory);
      queues[row.id] = run.then(function () {}, function () {});
      return write(run.then(function (res) {
        if (typeof opts.then === 'function') {
          try { opts.then(res); } catch (e) { /* a view hook must not fail the write */ }
        }
        return res;
      }), opts.ok);
    }

    function scheduleReload() {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(function tick() {
        // A re-render would drop the caret of a field being edited: wait until the user leaves it.
        var a = document.activeElement;
        if (a && els.main.contains(a) && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) {
          reloadTimer = setTimeout(tick, 1500);
          return;
        }
        reload({ quiet: true });
      }, 2500);
    }

    /* ── Sidebar ───────────────────────────────────────────────────── */
    function renderSide() {
      var c = DM().counts(viewRows(), today);
      els.nav.textContent = '';
      SECTIONS.forEach(function (s) {
        var n = s.key === 'triage' ? c.triage : s.key === 'orchestrator' ? c.orchestrator : s.key === 'today' ? c.today : 0;
        els.nav.appendChild(h('button', {
          class: 'sp-row db-nav' + (state.section === s.key ? ' is-on' : ''),
          type: 'button',
          title: s.label + ' (' + s.hint + ')',
          onclick: function () { go(s.key); },
        }, [
          icon(s.icon),
          h('span', { class: 'db-nav-label', text: s.label }),
          n ? h('span', { class: 'sp-count db-badge', text: String(n) }) : null,
        ]));
      });
    }

    /** The panel frame is built once, so the search box keeps focus while the list under it repaints. */
    function buildSide() {
      els.side.appendChild(global.SidePanel.head({
        title: 'Dashboard',
        actions: [{ icon: 'plus', title: 'Nouvelle carte', accent: true, onclick: function () { createCard(); } }],
      }));
      els.side.appendChild(global.SidePanel.search(els.filter));
      els.side.appendChild(els.nav);
      global.SidePanel.resizable(els.side, 'dashboard');
    }
    buildSide();

    function go(key) {
      state.section = key;
      render();
    }

    /* ── Shared row pieces ─────────────────────────────────────────── */
    /** Clickable priority badge: opens the shared priority editor hanging from it. */
    function prioBadge(row, askIfEmpty) {
      var has = typeof row.priority === 'number';
      if (!has && askIfEmpty !== true) return null;
      var badge = h('button', {
        class: has ? 'db-prio db-prio--btn db-prio--' + (row.tierI == null ? 'n' : Math.min(row.tierI, 4)) : 'db-chip db-chip--btn is-empty',
        type: 'button',
        title: (has ? (row.tier || 'Priorité') + ' · ' : '') + 'Cliquer pour changer la priorité',
        onclick: function (e) {
          e.stopPropagation();
          if (!global.CardFields) return;
          global.CardFields.open('priority', {
            t: t,
            cardId: row.id,
            cardName: row.name,
            anchor: badge,
            onSaved: function () { setStatus('Enregistré', 'ok', 2500); },
            onError: function (m) { setStatus(m, 'error'); },
            onClose: function (changed) { if (changed) reload({ quiet: true }); },
          });
        },
      }, has ? [document.createTextNode('P' + String(row.priority))] : [icon('flag'), document.createTextNode('Prioriser…')]);
      return badge;
    }

    function setEstimate(row, minutes) {
      row.estimate = minutes;
      save(row, function () { return DT().saveEstimate(t, row.id, minutes); });
      render();
    }

    /** The duration menu (the same everywhere in the app) hanging from `anchor`. */
    function estimateMenu(row, anchor) {
      var CM = global.ContextMenu;
      if (!CM || typeof CM.show !== 'function' || !anchor) return;
      var r = anchor.getBoundingClientRect();
      var items = QUICK_ESTIMATES.map(function (m) {
        return {
          id: 'est:' + m,
          label: m ? DM().formatMinutes(m) : 'Non estimée',
          icon: m ? 'clock' : 'clock-off',
          checked: (row.estimate || 0) === m,
          action: function () { setEstimate(row, m); },
        };
      });
      CM.show({ clientX: r.left, clientY: r.bottom + 4 }, items);
    }

    /** Clickable estimate chip: opens a duration menu (same menu everywhere in the app). */
    function estChip(row) {
      var empty = !row.estimate;
      var chip = h('button', {
        class: 'db-chip db-chip--btn' + (empty ? ' is-empty' : ''),
        type: 'button',
        title: 'Cliquer pour changer l’estimation',
        onclick: function (e) {
          e.stopPropagation();
          estimateMenu(row, chip);
        },
      }, [icon('clock'), document.createTextNode(empty ? 'Estimer…' : DM().formatMinutes(row.estimate))]);
      return chip;
    }

    /** Chip that opens a menu next to itself (shared ContextMenu). */
    function menuChip(cls, title, iconName, text, buildItems) {
      var kids = [];
      if (iconName) kids.push(icon(iconName));
      kids.push(document.createTextNode(text));
      var chip = h('button', {
        class: 'db-chip db-chip--btn' + (cls ? ' ' + cls : ''),
        type: 'button',
        title: title,
        onclick: function (e) {
          e.stopPropagation();
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function') return;
          var r = chip.getBoundingClientRect();
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, buildItems());
        },
      }, kids);
      return chip;
    }

    /**
     * Clickable day chip: plans the card on the chosen day or on a vague horizon
     * (icons follow the day; "Plus tard" holds the horizons, like the card menu's "Jour prévu").
     */
    function dueChip(row) {
      var vague = row.dueVague || '';
      var day = vague ? '' : row.due || '';
      var late = !!day && day < today && DM().isOpen(row);
      var label = vague ? (VAGUE_SHORT[vague] || vague) : !day ? 'Planifier…' : dayLabel(day, today);
      var cls = (late ? 'is-late' : '') + (!vague && !day ? ' is-empty' : '');
      var iconName = vague ? 'calendar-time' : day ? dayIconName(day, today) : 'calendar-plus';
      return menuChip(cls.trim(), 'Cliquer pour changer le jour', iconName, label, function () {
        var vagues = vagueOptions().map(function (v) { return { id: v.id, label: VAGUE_SHORT[v.id] || v.label }; });
        function withAction(item) {
          if (item.children) {
            item.children.forEach(withAction);
            return item;
          }
          var id = String(item.id);
          item.action = function () {
            if (id.indexOf('vague:') === 0) plan(row, '', id.slice(6));
            else plan(row, id.slice(5));
          };
          return item;
        }
        return dueChoices(row, today, vagues).map(withAction);
      });
    }

    /** Used / capacity for the day. The value itself is set in Paramètres. */
    function capChip(used) {
      var over = used > state.capacity;
      var label = (used ? DM().formatMinutes(used) : '0') + ' / ' + DM().formatMinutes(state.capacity);
      return h('span', {
        class: 'db-chip' + (over ? ' is-late' : ''),
        title: label,
      }, [document.createTextNode(label)]);
    }

    function openCard(row) {
      if (!row || !global.TaskFocus) return;
      global.TaskFocus.open({
        t: t,
        cardId: row.id,
        name: row.name || '',
        onChange: function () { reload({ quiet: true }); },
        onToast: function (m, kind) { setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
      });
    }

    var people = [];

    function namesForWaiting() {
      var seen = {};
      var out = [];
      function add(n) {
        n = String(n || '').replace(/\s+/g, ' ').trim();
        var key = n.toLowerCase();
        if (!n || seen[key]) return;
        seen[key] = true;
        out.push(n);
      }
      people.forEach(add);
      state.rows.forEach(function (r) { add(r.waiting); });
      return out;
    }

    function menuCtx(row) {
      var team = teamList();
      return {
        today: today,
        lists: state.lists,
        waitingNames: namesForWaiting(),
        canCreate: !!(DT().listFor(state.lists, ['triage']) && global.NewCard),
        vagues: vagueOptions().map(function (v) { return { id: v.id, label: VAGUE_SHORT[v.id] || v.label }; }),
        people: row && team.length ? PB().menuPeople(row, team, state.me) : [],
      };
    }

    /** Everyone a card can be handed to besides me (empty when the viewer is unknown or alone on the board). */
    function teamList() {
      if (!PB() || !state.me || !state.teamRaw) return [];
      return PB().people({ members: state.teamRaw.members, catalog: state.teamRaw.catalog, me: state.me, rows: state.rows });
    }

    /** Who is on the board: me, its members and the "Hors Trello" contacts. Soft: a failure only hides the people rows. */
    function loadTeam() {
      var pt = global.PriorityTrello;
      if (!pt || !PB()) return Promise.resolve();
      if (state.teamRaw && Date.now() - state.teamAt < 30000) return Promise.resolve();
      function soft(fn, fallback) {
        try {
          return Promise.resolve(fn()).then(function (v) { return v; }, function () { return fallback; });
        } catch (e) {
          return Promise.resolve(fallback);
        }
      }
      return Promise.all([
        soft(function () { return pt.getCurrentMember(t); }, null),
        soft(function () { return pt.getBoardMembers(t); }, []),
        soft(function () { return pt.getCustomAssigneeCatalog(t); }, []),
      ]).then(function (r) {
        state.me = PB().meOf(r[0]);
        state.teamRaw = { members: r[1] || [], catalog: r[2] || [] };
        state.teamAt = Date.now();
      });
    }

    function advanceSelection(row) {
      if (!row || state.selected !== row.id) return;
      var q = DM().triageQueue(viewRows());
      var i = -1;
      for (var n = 0; n < q.length; n++) if (q[n].id === row.id) i = n;
      var nxt = i >= 0 ? (q[i + 1] || q[i - 1]) : null;
      state.selected = nxt && nxt.id !== row.id ? nxt.id : null;
    }

    function applyList(row, list) {
      if (!list) return;
      row.listId = list.id;
      row.statut = list.name;
      row.statutKey = list.category;
    }

    /* The decisions. Each one acts at once and can be taken back: a button in the status bar, or Ctrl+Z. */
    function snapshotOf(row, extra) {
      return Object.assign({
        id: row.id,
        name: row.name,
        listId: row.listId,
        pos: row.pos,
        triage: row.statutKey === 'triage',
        fullDesc: row.fullDesc || row.desc || '',
        local: {
          waiting: row.waiting || '',
          waitingSince: row.waitingSince || '',
          start: row.start || '',
          due: row.due || '',
          startTime: row.startTime || '',
          dueTime: row.dueTime || '',
          dueVague: row.dueVague || '',
          dueMode: row.dueMode || '',
        },
      }, extra || {});
    }

    function offerUndo(row, snap, message) {
      function undo() {
        if (state.undo !== undo) return;
        state.undo = null;
        // A reload may have replaced the card since: act on the current one.
        var cur = state.rows.filter(function (r) { return r.id === snap.id; })[0] || row;
        if (state.rows.indexOf(cur) < 0) state.rows.push(cur);
        applyList(cur, state.lists.filter(function (l) { return l.id === snap.listId; })[0]);
        cur.pos = snap.pos;
        cur.fullDesc = snap.fullDesc;
        Object.assign(cur, snap.local);
        if (snap.triage) {
          state.selected = snap.id;
          state.section = 'triage';
        }
        save(cur, function () { return DT().restoreTriage(t, snap); }, { ok: '« ' + snap.name + ' » ' + (snap.triage ? 'remise en triage' : 'remise en place') });
        render();
      }
      state.undo = undo;
      setStatus(message, 'ok', 8000, { label: snap.triage ? 'Remettre en triage' : 'Défaire', run: undo });
    }

    function exitMove(row, cats, label) {
      var list = DT().listFor(state.lists, cats);
      if (!list) return setStatus('Aucune liste « ' + label + ' » : définissez les Statuts du tableau.', 'error');
      var snap = snapshotOf(row);
      advanceSelection(row);
      applyList(row, list);
      save(row, function () { return DT().moveToCategory(t, row, state.lists, cats); });
      offerUndo(row, snap, '« ' + row.name + ' » → ' + list.name);
      render();
    }

    function exitCancel(row) {
      var snap = snapshotOf(row, { archived: !DT().listFor(state.lists, ['canceled']) });
      advanceSelection(row);
      state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
      save(row, function () { return DT().cancel(t, row, state.lists); });
      offerUndo(row, snap, '« ' + row.name + ' » annulée');
      render();
    }

    function exitReference(row) {
      var snap = snapshotOf(row, { archived: !DT().listFor(state.lists, ['canceled']) });
      advanceSelection(row);
      state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
      save(row, function () {
        return DT().fileReference(t, row).then(function (ref) {
          snap.reference = ref;
          return DT().cancel(t, row, state.lists);
        });
      });
      offerUndo(row, snap, '« ' + row.name + ' » dans Références');
      render();
    }

    function exitWait(row, name) {
      var list = DT().listFor(state.lists, ['backlog', 'unstarted']);
      if (!list) return setStatus('Aucune liste « Backlog » : définissez les Statuts du tableau.', 'error');
      var snap = snapshotOf(row, { restoreDesc: true });
      advanceSelection(row);
      row.waiting = name;
      applyList(row, list);
      save(row, function () { return DT().setWaiting(t, row, state.lists, name); });
      offerUndo(row, snap, 'En attente de ' + name);
      render();
    }

    function exitSomeday(row) {
      var list = DT().listFor(state.lists, ['backlog', 'unstarted']);
      if (!list) return setStatus('Aucune liste « Backlog » : définissez les Statuts du tableau.', 'error');
      var snap = snapshotOf(row, { restoreDates: true });
      advanceSelection(row);
      row.dueVague = 'eventuellement';
      row.due = '';
      row.start = '';
      row.dueMode = 'vague';
      applyList(row, list);
      save(row, function () { return DT().setSomeday(t, row, state.lists); });
      offerUndo(row, snap, '« ' + row.name + ' » → Un jour');
      render();
    }

    function exitComplete(row, done) {
      row.dueDone = !!done;
      write(DT().complete(t, row, state.lists, !!done));
      setStatus(done ? '« ' + row.name + ' » terminée' : '« ' + row.name + ' » rouverte', 'ok');
      render();
    }

    function exitArchive(row) {
      var snap = snapshotOf(row, { archived: true });
      advanceSelection(row);
      state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
      save(row, function () { return global.TableTrello.archiveCard(t, row.id); });
      offerUndo(row, snap, '« ' + row.name + ' » archivée');
      render();
    }

    /** Sets a card's progress from the list (master progress over subtasks, else its own); 100 % also completes it. */
    function setProgress(row, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletionById !== 'function') return setStatus('Éditeur de progrès indisponible', 'error');
      row.progress = pct;
      if (Array.isArray(row.items) && row.items.length && CT.applyMasterProgress) row.items = CT.applyMasterProgress(row.items, pct);
      if (state.selected === row.id) render(); // the pane on the right shows it too
      else refreshRow(row);
      var wasDone = !!row.dueDone || row.statutKey === 'completed';
      save(row, function () {
        var write = typeof CT.saveProgressTree === 'function'
          ? CT.saveProgressTree(t, [row], pct)
          : CT.getCardCompletionById(t, row.id).then(function (data) {
              data = CT.normalizeCompletionData(data || { items: [] });
              var next = data.items && data.items.length
                ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
                : Object.assign({}, data, { progress: pct });
              return CT.saveCardCompletionById(t, row.id, CT.normalizeCompletionData(next)).then(function () { return [row.id]; });
            });
        return write.then(function (ids) {
          if (pct < 100) return null;
          var chain = Promise.resolve();
          (ids || [row.id]).forEach(function (id) {
            if (id === row.id && wasDone) return;
            chain = chain.then(function () { return DT().complete(t, { id: id }, state.lists, true); });
          });
          return chain;
        });
      }, { ok: pct >= 100 ? '« ' + row.name + ' » terminée' : 'Enregistré', then: function () { if (pct >= 100) row.dueDone = true; } });
    }

    /** Tasks shown under this project line (the free group is the tasks with no project). */
    function rowsForProject(node) {
      var q = DM().triageQueue(viewRows());
      var want = node && node.id ? String(node.id) : '';
      return (q || []).filter(function (r) {
        if (!r || !r.id) return false;
        var p = WO() && typeof WO().projectOf === 'function' ? WO().projectOf(state.goals, r.id) : null;
        if (want) return !!(p && String(p.id) === want);
        return !p || !p.id;
      });
    }

    /** The project ring: every task under it, its subtasks, and the project average. */
    function setProjectProgress(node, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.saveProgressTree !== 'function') return setStatus('Éditeur de progrès indisponible', 'error');
      var rows = rowsForProject(node);
      if (!rows.length) return;
      var wasDone = {};
      rows.forEach(function (row) {
        wasDone[row.id] = !!row.dueDone || row.statutKey === 'completed';
        row.progress = pct;
        if (Array.isArray(row.items) && row.items.length && CT.applyMasterProgress) row.items = CT.applyMasterProgress(row.items, pct);
        if (pct >= 100) row.dueDone = true;
      });
      render();
      var name = (node && node.name) || 'Projet';
      write(CT.saveProgressTree(t, rows, pct).then(function (ids) {
        if (pct < 100) return null;
        var chain = Promise.resolve();
        (ids || []).forEach(function (id) {
          if (wasDone[id]) return;
          chain = chain.then(function () { return DT().complete(t, { id: id }, state.lists, true); });
        });
        return chain;
      }), pct >= 100 ? '« ' + name + ' » terminé' : 'Enregistré');
    }

    /** Ticks or unticks one subtask of a card; the card's progress follows (the list line and the pane are redrawn). */
    function toggleSubtask(row, itemId, done) {
      var CT = global.CompletionTrello;
      if (!CT || !CT.applyItemProgress) return setStatus('Éditeur de progrès indisponible', 'error');
      var local = CT.applyItemProgress({ items: row.items || [] }, itemId, done ? 100 : 0);
      row.items = local.items;
      if (CT.computeCardProgress) row.progress = Math.round(CT.computeCardProgress(local).percent);
      refreshRow(row);
      save(row, function () {
        return CT.getCardCompletionById(t, row.id).then(function (data) {
          return CT.saveCardCompletionById(t, row.id, CT.applyItemProgress(data || { items: [] }, itemId, done ? 100 : 0));
        });
      }, { ok: 'Enregistré' });
    }

    function exitBlocked(row) {
      var on = !row.blocked;
      row.blocked = on;
      var job = global.GanttTrello && global.GanttTrello.setCardBlocked
        ? global.GanttTrello.setCardBlocked(t, row.id, on)
        : Promise.resolve();
      write(Promise.resolve(job).then(function (res) {
        if (res && res.ok === false) throw new Error(res.reason || 'Échec du blocage');
      }));
      setStatus(on ? 'Carte bloquée' : 'Carte débloquée', 'ok');
      render();
    }

    function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return;
      var extra = {};
      if (kind === 'desc' && global.TableTrello && global.TableTrello.saveDesc) {
        extra.value = row.desc || '';
        extra.save = function (text) {
          var prev = row.desc;
          row.desc = text;
          return global.TableTrello.saveDesc(t, row, text).then(function (full) {
            row.fullDesc = full;
          }, function (err) { row.desc = prev; throw err; });
        };
        extra.uploadImage = function (file) {
          return attachNote(row.id, file).then(function () { render(); return null; });
        };
      }
      global.CardFields.open(kind, Object.assign({
        t: t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        onSaved: function () { setStatus('Enregistré', 'ok', 2500); },
        onError: function (m) { setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) reload({ quiet: true }); },
      }, extra));
    }

    function copyLink(url) {
      var clip = global.navigator && global.navigator.clipboard;
      if (!url || !clip || typeof clip.writeText !== 'function') return;
      clip.writeText(url).then(function () { setStatus('Lien copié', 'ok'); }, function () {});
    }

    /** "En attente de qui ?": one search box over the people of the board and the names already waited on; a new name is taken as typed. */
    function askWaiting(row, anchor) {
      if (!row || !global.LinearPick) return;
      var from = anchor && anchor.getBoundingClientRect ? anchor : els.main.querySelector('[data-exit="waiting"]') || els.main;
      global.LinearPick.open({
        anchor: from,
        placeholder: 'En attente de…',
        digits: false,
        current: row.waiting || '',
        items: namesForWaiting().map(function (n) { return { id: n, label: n, icon: 'user' }; }),
        create: function (q) { return { id: q, label: 'En attente de « ' + q + ' »', icon: 'user-plus' }; },
        onPick: function (it) { exitWait(row, it.id); },
      });
    }

    function byName(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
    }

    /** Rebuilds project rows and places from the goal map already in memory. */
    function applyGoals(next) {
      state.goals = next || { nodes: [], links: [] };
      state.projects = WO() ? WO().projectChain(state.goals, state.rows, state.metrics || [], state.objectifs || []) : [];
      state.places = WO() ? WO().places(state.goals) : {};
    }

    function goalsSaver() {
      var GG = global.MindmapGoalsTrello;
      if (!GG || typeof GG.save !== 'function' || !WO()) {
        setStatus('Projets indisponibles ici.', 'error');
        return null;
      }
      return GG;
    }

    /** Writes the goal map, shows it at once, and reloads if the save is refused. */
    function commitGoals(next, okMsg) {
      var GG = goalsSaver();
      if (!GG) return Promise.reject(new Error('Projets indisponibles ici.'));
      applyGoals(next);
      render();
      return GG.save(t, next).then(function (saved) {
        applyGoals(saved);
        setStatus(okMsg || 'Projet enregistré', 'ok');
        return saved;
      }, function (err) {
        if (err && err.reason === 'conflict') setStatus('Les projets ont changé ailleurs : rechargés.', 'error');
        else fail(err);
        reload({ quiet: true });
        throw err;
      });
    }

    /** The project of a card, as the Mindmap goal map has it: { text, title } for the chip of the pane, or null. */
    function projectOfRow(row) {
      var p = WO() && WO().projectOf ? WO().projectOf(state.goals, row.id) : null;
      if (!p) return null;
      var place = state.places && state.places[row.id];
      return { text: p.name, title: place ? WO().placeLabel(place) : p.name, glyph: (p.icon && p.icon.i) || '' };
    }

    /** The card joins a project (null: leaves it). It is saved in the goal map of the Mindmap; a card may also stay free. */
    function setProject(row, projectId) {
      if (!WO() || !WO().withTaskProject) return setStatus('Projets indisponibles ici.', 'error');
      commitGoals(WO().withTaskProject(state.goals, row.id, projectId), projectId ? 'Projet enregistré' : 'Projet retiré').catch(function () {});
    }

    function pickProject(row, anchor) {
      var projects = (state.projects || []).slice().sort(byName);
      if (!projects.length) return setStatus('Aucun projet pour l’instant : créez-en un dans la Mindmap.', '', 4500);
      if (!global.LinearPick) return;
      var cur = WO() && WO().projectOf ? WO().projectOf(state.goals, row.id) : null;
      var items = projects.map(function (p) { return { id: p.id, label: p.name + (p.outcome ? ' · ' + p.outcome : ''), icon: (p.icon && p.icon.i) || 'stack-2' }; });
      if (cur) items.unshift({ id: '', label: 'Aucun projet', icon: 'circle-x' });
      global.LinearPick.open({
        anchor: anchor,
        placeholder: 'Choisir un projet…',
        digits: false,
        current: cur ? cur.id : '',
        items: items,
        onPick: function (it) { setProject(row, it.id || null); },
      });
    }

    /** People, places and labels of a card: the shared picker; the board reloads once it closes. */
    function openEntities(row, kind, anchor) {
      var CE = global.CardEntities;
      if (!CE) return setStatus('Éditeur indisponible', 'error');
      CE.open(kind, {
        t: t,
        rec: row,
        anchor: anchor,
        onSaved: function () { setStatus('Enregistré', 'ok'); },
        onError: function (m) { setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) reload({ quiet: true }); },
      });
    }

    function createCard() {
      var target = DT().listFor(state.lists, ['triage']);
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: t,
        lists: state.lists,
        listId: target.id,
        onError: fail,
        onCreated: function (c) {
          setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok');
          reload({ quiet: true });
          setTimeout(function () { reload({ quiet: true }); }, 1200);
        },
      });
    }

    function perform(row, id, anchor) {
      if (id === 'accept') return exitMove(row, ['unstarted', 'backlog'], 'À faire');
      if (id === 'backlog') return exitMove(row, ['backlog', 'unstarted'], 'Backlog');
      if (id === 'cancel') return exitCancel(row);
      if (id === 'reference') return exitReference(row);
      if (id === 'someday') return exitSomeday(row);
      if (id === 'complete') return exitComplete(row, true);
      if (id === 'reopen') return exitComplete(row, false);
      if (id === 'archive') return exitArchive(row);
      if (id === 'blocked') return exitBlocked(row);
      if (id === 'priority' || id === 'progress') return openEditor(row, id, anchor);
      if (id === 'desc') {
        if (state.section === 'triage' && row && state.selected === row.id && !pickedProject()) {
          var descBox = els.main.querySelector('.tri-desc-rich[data-fk="desc"]');
          if (descBox) { descBox.focus(); return; }
        }
        return openEditor(row, id, anchor);
      }
      if (id === 'open-card') return openCard(row);
      if (id === 'open-document') {
        if (global.ViewTabs && typeof global.ViewTabs.openSubject === 'function') global.ViewTabs.openSubject('task', row.id);
        return;
      }
      if (id.indexOf('open-in:') === 0) {
        if (global.ViewTabs && typeof global.ViewTabs.openIn === 'function') global.ViewTabs.openIn(id.slice(8), row.id);
        return;
      }
      if (id === 'open-trello') {
        if (row && row.link) global.open(row.link, '_blank', 'noopener');
        return;
      }
      if (id === 'copy-link') return copyLink(row && row.link);
      if (id === 'new-card') return createCard();
      if (id === 'new-document') return openDoc();
      if (id === 'reload') return reload();
      if (id.indexOf('go:') === 0) return go(id.slice(3));
      if (id === 'waiting' || id === 'wait:') return askWaiting(row, anchor);
      if (id.indexOf('wait:') === 0) return exitWait(row, id.slice(5));
      if (id.indexOf('plan:') === 0) return plan(row, id.slice(5));
      if (id.indexOf('vague:') === 0) return plan(row, '', id.slice(6));
      if (id.indexOf('assign:') === 0) {
        var heir = PB().byKey(teamList(), state.me, id.slice(7));
        if (heir && PB().needsHandover(row, 'all', heir)) handOver(row, 'all', heir, null);
        return;
      }
      if (id.indexOf('urg:') === 0) {
        var uid = id.slice(4);
        var lab = uid;
        URGENCIES.forEach(function (u) { if (u[0] === uid) lab = u[1]; });
        row.urgency = lab;
        save(row, function () { return DT().savePriority(t, row.id, { empressement: uid }); }, {
          then: function (d) {
            if (!d) return;
            row.priority = d.priority;
            row.tier = d.tier;
            row.tierI = d.tierI;
            if (!renderUnlessTyping()) refreshRow(row);
          },
        });
        setStatus('Urgence modifiée', 'ok');
        render();
        return;
      }
      if (id.indexOf('est:') === 0) return setEstimate(row, Number(id.slice(4)) || 0);
      if (id.indexOf('list:') === 0) {
        var lid = id.slice(5);
        var list = state.lists.filter(function (l) { return l.id === lid; })[0];
        if (!list || list.id === row.listId) return;
        if (row.statutKey === 'triage') advanceSelection(row);
        applyList(row, list);
        write(global.TableTrello.moveCard(t, row.id, list.id, 'bottom'));
        setStatus('« ' + row.name + ' » → ' + list.name, 'ok');
        render();
      }
    }

    function withActions(row, entries, anchor) {
      return (entries || []).map(function (it) {
        var item = {
          id: it.id,
          label: it.label,
          icon: it.icon,
          group: it.group,
          hint: it.hint,
          checked: !!it.checked,
          disabled: !!it.disabled,
          danger: !!it.danger,
        };
        if (it.children) item.children = withActions(row, it.children, anchor);
        else item.action = function () { perform(row, it.id, anchor); };
        return item;
      });
    }

    function withIso(row, entries, anchor) {
      var items = withActions(row, entries, anchor);
      if (!row || !global.Isolation) return items;
      var proj = WO() && WO().projectOf ? WO().projectOf(state.goals, row.id) : null;
      return items.concat(global.Isolation.menuItems({
        cardId: row.id,
        cardName: row.name,
        projectId: proj && proj.id,
        projectName: (proj && proj.name) || row.project || '',
        people: global.Isolation.peopleOf(row),
      }));
    }

    function pageHead(title, sub, right) {
      return h('header', { class: 'db-head' }, [
        h('div', {}, [h('h1', { class: 'db-title', text: title }), sub ? h('p', { class: 'db-sub', text: sub }) : null]),
        right || null,
      ]);
    }

    /* ── 2. Triage ─────────────────────────────────────────────────── */
    /** The Triage list as a tree (projects, their tasks, their subtasks), or the flat list when the tree button is off. */
    function triageBuilt(q) {
      if (!global.TriageTree || !state.triageTree) return null;
      return global.TriageTree.build(q, {
        projectOf: function (r) {
          var p = WO() && WO().projectOf ? WO().projectOf(state.goals, r.id) : null;
          return p ? { id: p.id, name: p.name, icon: p.icon || null } : null;
        },
        collapsed: state.triageFold,
        adding: state.subAdding ? { key: state.subAdding, mode: state.addMode === 'task' ? 'task' : 'sub' } : '',
      });
    }

    /** Adds a subtask: the line shows at once, the card is saved in the background (queued with the card's other writes). */
    function addSubtask(taskId, parentId, text) {
      var row = (state.rows || []).filter(function (r) { return r.id === taskId; })[0];
      var CTm = global.CompletionTrello;
      if (!row || !CTm || !DT().addSubtask) return;
      var local = parentId ? CTm.addChecklistItem({ items: row.items || [] }, parentId, text) : CTm.addLocalItem({ items: row.items || [] }, text);
      if (!local || !local.item) return setStatus('Sous-tâche non ajoutée', 'error');
      row.items = local.data.items;
      render();
      save(row, function () { return DT().addSubtask(t, row.id, parentId, text); }, { ok: 'Sous-tâche ajoutée' });
    }

    /** Opens the inline title under a line. mode 'task' is a sibling card; anything else is a subtask. */
    function beginAdd(key, mode) {
      delete state.triageFold[key];
      state.subAdding = key;
      state.addMode = mode === 'task' ? 'task' : 'sub';
      render();
    }

    /** A new card just after this one, in the same list and the same project. The field stays open for the next. */
    function addSiblingTask(taskId, text) {
      var clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      var row = (state.rows || []).filter(function (r) { return r.id === taskId; })[0];
      var TT = global.TableTrello;
      if (!row || !TT || typeof TT.createRow !== 'function') return setStatus('Tâche non ajoutée', 'error');
      var list = (state.lists || []).filter(function (l) { return l.id === row.listId; })[0];
      if (!list && DT()) list = DT().listFor(state.lists, ['triage']);
      if (!list) return setStatus('Ce tableau n’a pas de liste de triage.', 'error');
      var siblings = (state.rows || []).filter(function (r) { return r.listId === list.id; }).slice().sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
      var index = siblings.length;
      for (var i = 0; i < siblings.length; i++) if (siblings[i].id === row.id) { index = i + 1; break; }
      var pos = global.TableModel && global.TableModel.dropPos ? global.TableModel.dropPos(siblings, index) : 'bottom';
      var project = WO() && WO().projectOf ? WO().projectOf(state.goals, row.id) : null;
      TT.createRow(t, clean, list.id, pos).then(function (res) {
        var cardId = res && res.cardId;
        if (!cardId) throw new Error('Tâche non ajoutée');
        state.rows.push({
          id: cardId,
          name: clean,
          listId: list.id,
          statut: list.name,
          statutKey: list.category || 'triage',
          pos: typeof pos === 'number' ? pos : ((row.pos || 0) + 1024),
          items: [],
          desc: '',
          progress: 0,
        });
        var placed = project && project.id && WO() && WO().withTaskProject
          ? commitGoals(WO().withTaskProject(state.goals, cardId, project.id), 'Tâche ajoutée')
          : Promise.resolve().then(function () {
            render();
            setStatus('Tâche ajoutée', 'ok');
          });
        return Promise.resolve(placed).then(function () {
          return reload({ quiet: true }).then(function () {
            if (state.rows.some(function (r) { return r.id === cardId; })) return null;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return reload({ quiet: true }); });
          });
        }, function () { /* commitGoals already reported the project save */ });
      }, function (err) { fail(err); });
    }

    /** The checklist item open in the pane, or null (a missing one drops the selection). */
    function locateItem(items, itemId, parentId) {
      items = items || [];
      var i;
      if (parentId) {
        for (i = 0; i < items.length; i++) {
          if (!items[i] || items[i].id !== parentId) continue;
          var kids = items[i].items || [];
          for (var k = 0; k < kids.length; k++) if (kids[k] && kids[k].id === itemId) return { item: kids[k], parent: items[i] };
        }
        return null;
      }
      for (i = 0; i < items.length; i++) if (items[i] && items[i].id === itemId) return { item: items[i], parent: null };
      return null;
    }

    function pickedSub(card) {
      var s = state.subSel;
      if (!s || !state.triageTree) return null;
      if (!card || s.taskId !== card.id) { state.subSel = null; return null; }
      var found = locateItem(card.items, s.itemId, s.parentId);
      if (!found) { state.subSel = null; return null; }
      var linkedId = found.item.linkedCardId ? String(found.item.linkedCardId) : '';
      var linkedRow = linkedId ? (state.rows.filter(function (r) { return r.id === linkedId; })[0] || null) : null;
      return { card: card, item: found.item, parent: found.parent, linkedRow: linkedRow };
    }

    /** Writes one checklist field, shows it at once, and rolls the card's progress up. */
    function mutateSub(row, fn, ok) {
      var CT = global.CompletionTrello;
      if (!CT) return setStatus('Éditeur de progrès indisponible', 'error');
      var local = fn(CT, { items: row.items || [] });
      if (!local || !local.items) return;
      row.items = local.items;
      if (CT.computeCardProgress) row.progress = Math.round(CT.computeCardProgress(local).percent);
      var finish = row.progress >= 100 && !row.dueDone;
      render();
      save(row, function () {
        return CT.getCardCompletionById(t, row.id).then(function (data) {
          var next = fn(CT, data || { items: [] });
          return CT.saveCardCompletionById(t, row.id, next).then(function () {
            if (!finish) return next;
            return DT().complete(t, row, state.lists, true).then(function () { return next; });
          });
        });
      }, {
        ok: finish ? '« ' + row.name + ' » terminée' : (ok || 'Enregistré'),
        then: function (next) {
          if (finish) row.dueDone = true;
          if (next && CT.computeEstimatedTotal) row.estimate = CT.computeEstimatedTotal(next) || 0;
        },
      });
    }

    function openSubEstimate(item, anchor, onPick) {
      var CM = global.ContextMenu;
      if (!CM || typeof CM.show !== 'function' || !anchor) return;
      var cur = item.estimatedMinutes || 0;
      var r = anchor.getBoundingClientRect();
      CM.show({ clientX: r.left, clientY: r.bottom + 4 }, QUICK_ESTIMATES.map(function (m) {
        return {
          id: 'est:' + m,
          label: m ? DM().formatMinutes(m) : 'Non estimée',
          icon: m ? 'clock' : 'clock-off',
          checked: cur === m,
          action: function () { onPick(m); },
        };
      }));
    }

    /** The native day picker, hung under the "Autre…" button. An empty day clears the schedule. */
    function openSubDay(anchor, iso, onPick) {
      if (!anchor) return;
      var input = document.createElement('input');
      input.type = 'date';
      input.value = iso || '';
      input.setAttribute('aria-label', 'Jour prévu');
      input.className = 'tri-day-pop';
      var box = anchor.getBoundingClientRect();
      input.style.position = 'fixed';
      input.style.left = box.left + 'px';
      input.style.top = box.bottom + 'px';
      input.style.opacity = '0';
      input.style.width = box.width + 'px';
      input.style.height = '1px';
      document.body.appendChild(input);
      function close() { if (input.parentNode) input.parentNode.removeChild(input); }
      input.addEventListener('change', function () { var v = input.value; close(); onPick(v); });
      input.addEventListener('blur', function () { setTimeout(close, 200); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.focus();
    }

    function subHost(spec) {
      var card = spec.card;
      var item = spec.item;
      var parentId = spec.parent ? spec.parent.id : '';
      function dates(iso) {
        return iso
          ? { startDate: iso, dueDate: iso }
          : { startDate: '', dueDate: '', startTime: '', dueTime: '' };
      }
      return {
        today: today,
        dayLabel: function (iso) { return dayLabel(iso, today); },
        showCard: function () { state.subSel = null; render(); },
        openCard: function () { openCard({ id: item.linkedCardId, name: item.text || '' }); },
        rename: function (text) {
          mutateSub(card, function (CT, data) {
            return parentId ? CT.applyChecklistItemText(data, parentId, item.id, text) : CT.applyItemText(data, item.id, text);
          });
        },
        setEstimate: function (minutes) {
          mutateSub(card, function (CT, data) {
            return parentId
              ? CT.applyChecklistItemEstimate(data, parentId, item.id, minutes)
              : CT.applyItemEstimate(data, item.id, minutes);
          });
        },
        openEstimate: function (anchor) {
          openSubEstimate(item, anchor, function (m) { subHost(spec).setEstimate(m); });
        },
        plan: function (iso) {
          mutateSub(card, function (CT, data) {
            return CT.applyItemDates(data, parentId || item.id, parentId ? item.id : '', dates(iso));
          });
        },
        openDay: function (anchor, iso) {
          openSubDay(anchor, iso, function (next) { subHost(spec).plan(next); });
        },
        setProgress: function (pct) {
          mutateSub(card, function (CT, data) {
            return parentId
              ? CT.applyChecklistItemProgress(data, parentId, item.id, pct)
              : CT.applyItemProgress(data, item.id, pct);
          });
        },
        toggleBlocked: function () {
          var on = item.blocked !== true;
          mutateSub(card, function (CT, data) { return CT.setItemBlocked(data, item.id, on); }, on ? 'Sous-tâche bloquée' : 'Sous-tâche débloquée');
        },
        toggleChild: function (childId, done) {
          mutateSub(card, function (CT, data) { return CT.applyChecklistItemProgress(data, item.id, childId, done ? 100 : 0); });
        },
        addChild: function (text) { addSubtask(card.id, item.id, text); },
      };
    }

    /** The cards in the order the list shows them (what J / K walk through; folded ones are skipped). */
    function triageOrder(q) {
      var built = triageBuilt(q);
      return built ? built.tasks : q;
    }

    /** Visible lines J / K walk: each task, and each open subtask under it. */
    function focusEntries(q) {
      var built = triageBuilt(q);
      if (!built) return q.map(function (r) { return { kind: 'task', taskId: r.id }; });
      var out = [];
      built.nodes.forEach(function (n) {
        if (n.kind === 'task') out.push({ kind: 'task', taskId: n.row.id });
        else if (n.kind === 'sub' && n.id) out.push({ kind: 'sub', taskId: n.taskId, itemId: n.id, parentId: n.parentId || '', key: n.key });
      });
      return out;
    }

    function focusAt(list) {
      var sub = state.subSel;
      var i;
      if (sub) {
        for (i = 0; i < list.length; i++) if (list[i].kind === 'sub' && list[i].key === sub.key) return i;
      }
      for (i = 0; i < list.length; i++) if (list[i].kind === 'task' && list[i].taskId === state.selected) return i;
      return -1;
    }

    function applyFocus(entry) {
      if (!entry) return;
      state.selected = entry.taskId;
      state.projectSel = null;
      state.docOpen = false;
      state.subSel = entry.kind === 'sub'
        ? { taskId: entry.taskId, itemId: entry.itemId, parentId: entry.parentId, key: entry.key }
        : null;
      render();
    }

    /** The project shown in the pane (clicked in the tree), with its note; null once another task is selected. */
    function pickedProject() {
      var ps = state.projectSel;
      if (!ps || ps.at !== state.selected) return null;
      var p = (state.projects || []).filter(function (x) { return x.id === ps.id; })[0];
      if (!p) return null;
      var node = ((state.goals && state.goals.nodes) || []).filter(function (n) { return n && n.id === p.id; })[0];
      return Object.assign({}, p, { desc: node && node.desc ? node.desc : '' });
    }

    /** Name or description of a project, saved in the goal map of the Mindmap (same path as setProject). */
    function saveProject(id, patch, okMsg) {
      if (!WO() || !WO().withNodeEdit) {
        setStatus('Projets indisponibles ici.', 'error');
        return Promise.reject(new Error('Projets indisponibles ici.'));
      }
      return commitGoals(WO().withNodeEdit(state.goals, id, patch), okMsg).then(function (saved) {
        return saved;
      }, function (err) {
        if (err) err.reported = true;
        throw err;
      });
    }

    var projectDocs = Object.create(null);
    var projectDocMiss = Object.create(null);
    var noteCache = Object.create(null); // card id -> [{ src, alt }]

    function imageExt(file) {
      var kind = String((file && file.type) || '').toLowerCase();
      if (kind === 'image/png') return 'png';
      if (kind === 'image/webp') return 'webp';
      if (kind === 'image/gif') return 'gif';
      return 'jpg';
    }

    /**
     * A description picture is an attachment named note-… on the card (the project document, or the
     * task card). The goal map and pluginData stay untouched: Trello's attachment list is the index.
     */
    function attachNote(cardId, file) {
      var docs = global.DocsTrello;
      var ui = global.TriageUI;
      if (!docs || typeof docs.uploadCover !== 'function') return Promise.reject(new Error('Image non ajoutée'));
      return docs.uploadCover(t, cardId, file, imageExt(file), 'note').then(function (cover) {
        if (!cover || !cover.c || !cover.a || !cover.n) throw new Error('upload-failed');
        var alt = ui && ui.imageAlt ? ui.imageAlt(file) : '';
        var list = noteCache[cardId] || (noteCache[cardId] = []);
        list.push({ src: 'upload:' + cover.c + '/' + cover.a + '/' + cover.n, alt: alt });
        return null;
      });
    }

    function shotsOf(cardId) {
      return noteCache[cardId] ? noteCache[cardId].slice() : [];
    }

    function loadNoteImages(cardId) {
      if (!cardId) return Promise.resolve([]);
      if (noteCache[cardId]) return Promise.resolve(shotsOf(cardId));
      var docs = global.DocsTrello;
      if (!docs || typeof docs.listNoteImages !== 'function') return Promise.resolve([]);
      return docs.listNoteImages(t, cardId).then(function (rows) {
        noteCache[cardId] = rows || [];
        return shotsOf(cardId);
      });
    }

    function resolveImage(src) {
      if (!src || src.indexOf('upload:') !== 0) return Promise.resolve(src || '');
      var parts = src.slice(7).split('/');
      var docs = global.DocsTrello;
      if (parts.length !== 3 || !docs || typeof docs.coverBlobUrl !== 'function') return Promise.resolve('');
      return docs.coverBlobUrl(t, { k: 'upload', c: parts[0], a: parts[1], n: parts[2] });
    }

    function imageError(msg) { setStatus(msg, 'error'); }

    /** The project's document, or '' when it has none yet. Does not create one. */
    function findProjectDocId(p) {
      if (projectDocs[p.id]) return Promise.resolve(projectDocs[p.id]);
      if (projectDocMiss[p.id]) return Promise.resolve('');
      var docs = global.DocsTrello;
      if (!docs || typeof docs.listDocs !== 'function') return Promise.resolve('');
      return docs.listDocs(t).then(function (list) {
        var found = (list || []).filter(function (d) {
          return d && d.subject && d.subject.k === 'project' && d.subject.id === p.id;
        })[0];
        if (found) { projectDocs[p.id] = found.id; return found.id; }
        projectDocMiss[p.id] = true;
        return '';
      }, function () { return ''; });
    }

    /** The document of this project, created when pasting a picture onto a project that has none. */
    function projectDocId(p) {
      return findProjectDocId(p).then(function (id) {
        if (id) return id;
        var docs = global.DocsTrello;
        if (!docs || typeof docs.createDoc !== 'function') return Promise.reject(new Error('Image non ajoutée'));
        var glyph = p.icon && (p.icon.i || p.icon.c) ? p.icon : { i: 'stack-2' };
        return docs.createDoc(t, p.name || 'Projet', '', { subject: { k: 'project', id: p.id }, icon: glyph }).then(function (doc) {
          if (!doc || !doc.id) throw new Error('Image non ajoutée');
          delete projectDocMiss[p.id];
          projectDocs[p.id] = doc.id;
          return doc.id;
        });
      });
    }

    function attachFiles(cardId, files) {
      var seq = Promise.resolve();
      (files || []).forEach(function (file) {
        seq = seq.then(function () { return attachNote(cardId, file); });
      });
      return seq;
    }

    function pasteProjectImages(p, files) {
      setStatus('Image…', 'busy');
      return projectDocId(p).then(function (docId) {
        return attachFiles(docId, files);
      }).then(function () {
        setStatus('Image ajoutée', 'ok');
        render();
      }, function (err) {
        fail(err);
        throw err;
      });
    }

    function pasteCardImages(row, files) {
      setStatus('Image…', 'busy');
      return attachFiles(row.id, files).then(function () {
        setStatus('Image ajoutée', 'ok');
        render();
      }, function (err) {
        fail(err);
        throw err;
      });
    }

    function loadCardShots(row, cb) {
      loadNoteImages(row && row.id).then(function (rows) { cb(rows); }, function () { cb([]); });
    }

    function loadProjectShots(p, cb) {
      findProjectDocId(p).then(function (id) {
        if (!id) { cb([]); return; }
        return loadNoteImages(id).then(function (rows) { cb(rows); });
      }, function () { cb([]); });
    }

    function foldName(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    }

    /** The objective this project serves: an existing one, a new name, or none. */
    function pickOutcome(p, anchor) {
      if (!global.LinearPick || !WO() || !WO().withProjectOutcome) return;
      var nodes = ((state.goals && state.goals.nodes) || []).filter(function (n) { return n && n.level === 'objective'; });
      var items = nodes.slice().sort(byName).map(function (n) { return { id: n.id, label: n.name, icon: 'flag' }; });
      if (p.outcomeId) items.unshift({ id: '', label: 'Aucun', icon: 'circle-x' });
      global.LinearPick.open({
        anchor: anchor,
        placeholder: 'Résultat…',
        digits: false,
        current: p.outcomeId || '',
        items: items,
        create: function (q) {
          q = String(q || '').replace(/\s+/g, ' ').trim();
          return q ? { id: 'new:' + q, label: 'Nouveau résultat « ' + q + ' »', icon: 'plus' } : null;
        },
        onPick: function (it) {
          var done;
          if (!it || !it.id) done = commitGoals(WO().withProjectOutcome(state.goals, p.id, null), 'Résultat retiré');
          else if (it.id.indexOf('new:') === 0) {
            var name = it.id.slice(4).replace(/\s+/g, ' ').trim().slice(0, 120);
            if (!name) return;
            var want = foldName(name);
            var existing = nodes.filter(function (n) { return foldName(n.name) === want; })[0];
            if (existing) done = commitGoals(WO().withProjectOutcome(state.goals, p.id, { id: existing.id }));
            else {
              var GG = global.MindmapGoalsTrello;
              if (!GG || typeof GG.newId !== 'function') return setStatus('Projets indisponibles ici.', 'error');
              done = commitGoals(WO().withProjectOutcome(state.goals, p.id, { id: GG.newId(), name: name }), 'Résultat enregistré');
            }
          } else done = commitGoals(WO().withProjectOutcome(state.goals, p.id, { id: it.id }), 'Résultat enregistré');
          if (done && done.catch) done.catch(function () {});
        },
      });
    }

    /** The project's next step lives on the card that currently carries it. */
    function saveProjectStep(p, text) {
      var id = p.step && p.step.cardId;
      var row = (state.rows || []).filter(function (r) { return r.id === id; })[0];
      if (!row || !DT()) return;
      row.items = DM().withNextStep(row.items, text);
      applyGoals(state.goals);
      render();
      save(row, function () { return DT().saveNextStep(t, row.id, text); }, { ok: 'Prochaine action enregistrée' });
    }

    function saveProjectMetric(p, n) {
      if (!p.metricId || !global.GoalsTrello || typeof global.GoalsTrello.updateMetric !== 'function') return;
      (state.projects || []).forEach(function (x) {
        if (x.id !== p.id) return;
        x.metricValue = n;
        var parts = String(x.metricLabel || '').split(' / ');
        x.metricLabel = parts.length > 1 ? n + ' / ' + parts[1] : String(n);
      });
      render();
      write(global.GoalsTrello.updateMetric(t, p.metricId, { currentValue: n }), 'Mesure enregistrée');
    }

    function treeCtx(selId) {
      var picked = pickedProject();
      return {
        selectedProject: picked ? picked.id : '',
        selectProject: function (id) {
          state.projectSel = { id: id, at: state.selected };
          state.subSel = null;
          state.docOpen = false;
          render();
        },
        pickIcon: function (node, icon) { saveProject(node.id, { icon: icon }); },
        setProgress: function (node, pct) { setProjectProgress(node, pct); },
        addingKey: state.subAdding || '',
        startAdd: function (key, mode) { beginAdd(key, mode); },
        chooseAdd: function (key, anchor) {
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function' || !anchor) return beginAdd(key, 'sub');
          var r = anchor.getBoundingClientRect();
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, [
            { id: 'add-task', label: 'Tâche', icon: 'checkbox', action: function () { beginAdd(key, 'task'); } },
            { id: 'add-sub', label: 'Sous-tâche', icon: 'subtask', action: function () { beginAdd(key, 'sub'); } },
          ]);
        },
        stopAdd: function () {
          if (!state.subAdding) return;
          state.subAdding = '';
          state.addMode = '';
          renderUnlessTyping();
        },
        addSub: addSubtask,
        addTask: addSiblingTask,
        taskEl: function (row) { return triageRow(row, !picked && !state.subSel && row.id === selId); },
        toggle: function (key) {
          if (state.triageFold[key]) delete state.triageFold[key];
          else state.triageFold[key] = true;
          global.TriageTree.prefs.setCollapsed(state.triageFold);
          render();
        },
        select: function (id) {
          state.selected = id;
          state.projectSel = null;
          state.subSel = null;
          state.docOpen = false;
          render();
        },
        selectSub: function (n) {
          if (!n || !n.id) {
            state.selected = n && n.taskId;
            state.subSel = null;
          } else {
            state.selected = n.taskId;
            state.subSel = { taskId: n.taskId, itemId: n.id, parentId: n.parentId || '', key: n.key };
          }
          state.projectSel = null;
          state.docOpen = false;
          render();
          if (global.matchMedia && global.matchMedia('(max-width: 760px)').matches) els.main.scrollTop = 0;
        },
        selectedKey: state.subSel && state.subSel.taskId === selId ? state.subSel.key : '',
      };
    }

    function triageListEl(q, selId) {
      var built = triageBuilt(q);
      if (!built) {
        var flat = h('div', { class: 'db-list db-triage-list' }, []);
        if (global.TriageTree && q.length) flat.appendChild(global.TriageTree.colHead());
        var flatCtx = global.TriageTree ? treeCtx(selId) : null;
        q.forEach(function (r) {
          flat.appendChild(triageRow(r, r.id === selId));
          if (!flatCtx || !global.TriageTree.addUnder) return;
          var key = 't:' + r.id;
          var extra = state.subAdding === key
            ? global.TriageTree.addField({
              key: 'a:' + key,
              taskId: r.id,
              parentId: '',
              depth: state.addMode === 'task' ? 0 : 1,
              mode: state.addMode === 'task' ? 'task' : 'sub',
            }, flatCtx)
            : global.TriageTree.addUnder(key, 0, flatCtx);
          if (extra) flat.appendChild(extra);
        });
        return flat;
      }
      var list = h('div', { class: 'db-list db-triage-list', role: 'tree', 'aria-label': 'Triage' }, []);
      list.appendChild(global.TriageTree.render(built, treeCtx(selId)));
      return list;
    }

    function treeToggle() {
      if (!global.TriageTree) return null;
      var label = state.triageTree ? 'Afficher en liste simple' : 'Afficher en arbre (projets, tâches, sous-tâches)';
      return h('button', {
        class: 'db-icon-btn' + (state.triageTree ? ' is-on' : ''),
        type: 'button',
        title: label,
        'aria-label': label,
        'aria-pressed': String(!!state.triageTree),
        'data-fk': 'triage-tree',
        onclick: function () {
          state.triageTree = !state.triageTree;
          if (!state.triageTree) state.subSel = null;
          global.TriageTree.prefs.setTreeOn(state.triageTree);
          render();
        },
      }, [icon('list-tree')]);
    }

    /** One card of the list on the left: its title, the line under it (next step, else the note) and its score. */
    function triageRow(r, selected) {
      var sub = (WO() && WO().stepText(r)) || DM().snippet(r.desc, 90);
      return h('div', {
        class: 'db-row tri-row' + (selected ? ' is-sel' : ''),
        'data-id': r.id,
        'data-card': r.id,
        onclick: function () {
          state.selected = r.id;
          state.projectSel = null;
          state.subSel = null;
          state.docOpen = false;
          render();
          // On a phone the pane is above the list: bring it into view.
          if (global.matchMedia && global.matchMedia('(max-width: 760px)').matches) els.main.scrollTop = 0;
        },
      }, [
        h('span', { class: 'db-row-main' }, [
          h('span', { class: 'db-row-name', text: r.name }),
          sub ? h('span', { class: 'db-step', text: sub }) : null,
        ]),
        global.TriageTree ? global.TriageTree.progressEl(r.progress, {
          blocked: !!r.blocked,
          onSet: function (pct) { setProgress(r, pct); },
          onUnblock: function () { exitBlocked(r); },
        }) : null,
        h('span', { class: 'tt-prio-col' }, [prioBadge(r)]),
      ]);
    }

    /** Draws the page again unless a text field has the caret (a redraw would drop it). Tells whether it did. */
    function renderUnlessTyping() {
      var a = document.activeElement;
      if (a && els.main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
      render();
      return true;
    }

    /** Draws one row of the list again (its title, next step or score changed) without touching the rest of the page. */
    function refreshRow(row) {
      var cur = els.main.querySelector('.db-triage-list .db-row[data-id="' + row.id + '"]');
      if (!cur) return;
      var fresh = triageRow(row, cur.classList.contains('is-sel'));
      if (global.TriageTree) global.TriageTree.carryOver(cur, fresh, treeCtx(state.selected));
      cur.replaceWith(fresh);
    }

    /** What a decision does, for its tooltip. */
    function exitHint(id) {
      var ex = DM().exitById(id);
      if (!ex) return '';
      function into(cats) {
        var l = DT().listFor(state.lists, cats);
        return l ? 'va dans « ' + l.name + ' »' : '';
      }
      var what = {
        accept: into(['unstarted', 'backlog']),
        backlog: into(['backlog', 'unstarted']),
        waiting: 'reste au backlog, avec le nom de la personne',
        someday: 'reste au backlog, sans date',
        reference: 'garde une ligne dans le document « Références »',
        cancel: 'annule la carte',
      }[id] || '';
      return ex.label + ' (' + ex.key.toUpperCase() + ')' + (what ? ' : ' + what : '');
    }

    /** Everything the pane on the right needs from this page (see triage-ui.js). */
    function triageHost() {
      return {
        t: t,
        today: today,
        save: save,
        perform: perform,
        openCard: openCard,
        openEditor: openEditor,
        pasteImages: pasteCardImages,
        resolveImage: resolveImage,
        imageError: imageError,
        shots: function (row) { return shotsOf(row && row.id); },
        loadImages: loadCardShots,
        openEntities: openEntities,
        pickProject: pickProject,
        estimateMenu: estimateMenu,
        plan: function (row, iso) { plan(row, iso); },
        projectOf: projectOfRow,
        refreshRow: refreshRow,
        setProgress: setProgress,
        toggleSub: toggleSubtask,
        addSub: addSubtask,
        hintOf: exitHint,
        dayLabel: function (iso) { return dayLabel(iso, today); },
        dayText: function (row) {
          return row.dueVague ? (VAGUE_SHORT[row.dueVague] || row.dueVague) : dayLabel(DM().plannedDay(row), today);
        },
        dayIcon: function (row) {
          return row.dueVague ? 'calendar-time' : dayIconName(DM().plannedDay(row), today);
        },
        cardMenu: function (row, anchor) {
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function' || !anchor) return;
          var r = anchor.getBoundingClientRect();
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, withIso(row, menuEntries(row, menuCtx(row)), anchor));
        },
      };
    }

    /** What the Document pane needs from this page (see triage-doc-ui.js). */
    function docHost() {
      return {
        t: t,
        today: function () { return today; },
        rows: function () { return state.rows; },
        lists: function () { return state.lists; },
        goals: function () { return state.goals; },
        projects: function () { return state.projects.map(function (p) { return { id: p.id, name: p.name }; }); },
        onClose: function () { closeDoc(); },
        onCreated: docCreated,
        status: setStatus,
      };
    }

    function openDoc() {
      if (!global.TriageDocUI || !global.TriageDocModel) return setStatus('Document indisponible ici.', 'error');
      if (!hasTriage()) return setStatus('Ce tableau n’a pas de liste de triage.', 'error');
      state.section = 'triage';
      state.docOpen = true;
      render();
      if (docUI) docUI.focus();
    }

    function closeDoc() {
      state.docOpen = false;
      render();
    }

    /** The cards of the document are written: show them in the list, one undo takes the whole batch back. */
    function docCreated(result, plan, finished) {
      var made = result.created.filter(function (c) { return plan.tasks.some(function (x) { return x.id === c.taskId && x.createdId === c.cardId; }); });
      var n = made.length;
      var msg = n === 1 ? '« ' + made[0].title + ' » créée dans le triage' : n + ' cartes créées dans le triage';
      var points = (result.failures || []).length;
      if (points) msg += ' · ' + points + (points === 1 ? ' point à revoir' : ' points à revoir') + ' (le détail est dans le document)';
      if (finished) {
        state.docOpen = false;
        if (made[0]) state.selected = made[0].cardId;
      }
      var undo = function () {
        if (state.undo !== undo) return;
        state.undo = null;
        setStatus('Annulation…', 'busy');
        global.TriageDocTrello.undo(t, result).then(function (out) {
          var failures = (out && out.failures) || [];
          if (failures.length && docUI) {
            // what could not be taken back is shown in the document, with all its details
            docUI.addProblems(failures);
            state.docOpen = true;
            render();
            setStatus('Annulation incomplète : ' + failures.length + (failures.length === 1 ? ' étape a échoué' : ' étapes ont échoué') + ' (le détail est dans le document)', 'error', 12000);
          } else {
            setStatus('Création annulée', 'ok');
          }
          reload({ quiet: true });
        }, fail);
      };
      state.undo = undo;
      setStatus(msg, result.failed.length ? 'error' : 'ok', 9000, { label: 'Annuler', run: undo });
      reload({ quiet: true });
      setTimeout(function () { reload({ quiet: true }); }, 1200);
    }

    function docButton() {
      return h('button', {
        class: 'db-icon-btn',
        type: 'button',
        title: 'Nouveau document',
        'aria-label': 'Nouveau document',
        'data-fk': 'new-document',
        onclick: openDoc,
      }, [icon('file-plus')]);
    }

    function docPane() {
      if (!docUI) docUI = global.TriageDocUI.create(docHost());
      return docUI.el;
    }

    /** Drag handle between the list and the detail pane; the list width is remembered. */
    function splitGrip(page) {
      var KEY = 'tp-split-width:triage';
      var MIN = 260;
      function room() { var w = page.getBoundingClientRect().width; return w ? Math.max(MIN, w - 360) : 4000; }
      function apply(w) { page.style.setProperty('--db-split-w', Math.max(MIN, Math.min(room(), w)) + 'px'); }
      function save(w) { try { global.localStorage.setItem(KEY, String(w)); } catch (e) {} }
      var left = function () { return page.querySelector('.db-split-l'); };
      try {
        var saved = parseInt(global.localStorage.getItem(KEY), 10);
        if (saved) apply(saved);
      } catch (e) {}
      var grip = h('div', { class: 'sp-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Redimensionner la liste', tabindex: '0' });
      function current() { return Math.round(left().getBoundingClientRect().width); }
      function set(w, persist) { apply(w); if (persist) save(current()); }
      grip.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        var startX = e.clientX;
        var startW = current();
        grip.classList.add('is-drag');
        document.documentElement.classList.add('sp-resizing');
        try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        function move(ev) { set(startW + (ev.clientX - startX), false); }
        function done() {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', done);
          grip.removeEventListener('pointercancel', done);
          grip.classList.remove('is-drag');
          document.documentElement.classList.remove('sp-resizing');
          save(current());
        }
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', done);
        grip.addEventListener('pointercancel', done);
      });
      grip.addEventListener('dblclick', function () {
        page.style.removeProperty('--db-split-w');
        try { global.localStorage.removeItem(KEY); } catch (e) {}
      });
      grip.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        set(current() + (e.key === 'ArrowRight' ? 16 : -16), true);
      });
      return h('div', { class: 'db-split-gripbox' }, [grip]);
    }

    function splitPage(l, r) {
      var page = h('div', { class: 'db-page db-page--split' }, [l, r]);
      page.insertBefore(splitGrip(page), r);
      return page;
    }

    function renderTriage() {
      var q = DM().triageQueue(viewRows());
      if (state.docOpen && global.TriageDocUI) {
        var open = triageListEl(q, null);
        els.main.appendChild(splitPage(
          h('div', { class: 'db-split-l', 'data-keep': 'list' }, [pageHead('Triage', '', h('div', { class: 'db-head-tools' }, [treeToggle(), docButton(), h('span', { class: 'db-badge', text: String(q.length) })])), open]),
          h('div', { class: 'db-split-r', 'data-keep': 'pane' }, [docPane()])
        ));
        return;
      }
      if (!q.length) {
        var none = !hasTriage() ? 'Aucune liste de triage sur ce tableau.' : state.filter ? 'Aucune carte ne correspond.' : 'Boîte de triage vide. Bien joué.';
        els.main.appendChild(h('div', { class: 'db-page' }, [
          pageHead('Triage', '', hasTriage() && global.TriageDocUI ? h('div', { class: 'db-head-tools' }, [docButton()]) : null),
          hasTriage() ? null : inboxBanner(),
          h('div', { class: 'db-empty' }, [icon('inbox'), h('p', { text: none })]),
        ]));
        return;
      }
      var sel = q.filter(function (r) { return r.id === state.selected; })[0] || triageOrder(q)[0] || q[0];
      state.selected = sel.id;
      var sub = pickedSub(sel);
      var pane = pickedProject() && global.TriageUI.projectDetail
        ? global.TriageUI.projectDetail(pickedProject(), {
          saveProject: saveProject,
          pickIcon: function (project, icon) { saveProject(project.id, { icon: icon }); },
          pasteImages: pasteProjectImages,
          resolveImage: resolveImage,
          imageError: imageError,
          shots: function (project) { return shotsOf(projectDocs[project.id]); },
          loadImages: loadProjectShots,
          pickOutcome: pickOutcome,
          saveStep: saveProjectStep,
          saveMetric: saveProjectMetric,
        })
        : sub && sub.linkedRow
          ? global.TriageUI.detail(sub.linkedRow, triageHost())
          : sub && global.TriageUI.subDetail
            ? global.TriageUI.subDetail(sub, subHost(sub))
            : global.TriageUI.detail(sel, triageHost());
      var list = triageListEl(q, sel.id);
      els.main.appendChild(splitPage(
        h('div', { class: 'db-split-l', 'data-keep': 'list' }, [pageHead('Triage', '', h('div', { class: 'db-head-tools' }, [treeToggle(), global.TriageDocUI ? docButton() : null, h('span', { class: 'db-badge', text: String(q.length) })])), list]),
        h('div', { class: 'db-split-r', 'data-keep': 'pane' }, [pane])
      ));
    }

    /** List a task created in the orchestrator lands in, so it shows on the board (not in triage). */
    function workList() {
      var lists = state.lists || [];
      var list = DT().listFor(lists, ['unstarted', 'backlog']);
      if (list) return list;
      for (var i = 0; i < lists.length; i++) {
        var c = lists[i].category;
        if (c !== 'triage' && c !== 'completed' && c !== 'canceled') return lists[i];
      }
      return null;
    }

    function createHere(draft) {
      var list = workList();
      var TT = global.TableTrello;
      if (!list || !TT || typeof TT.createRow !== 'function') {
        setStatus('Aucune liste « À faire » pour créer la tâche.', 'error');
        return;
      }
      var day = draft.date || '';
      var vague = draft.vague || '';
      var hhmm = vague ? '' : (draft.time || '');
      var row = {
        id: 'new-' + Date.now(),
        listId: list.id,
        pos: Date.now(),
        name: draft.name,
        statut: list.name,
        statutKey: list.category || 'unstarted',
        start: vague ? '' : day,
        due: vague ? '' : day,
        dueVague: vague,
        dueMode: vague ? 'vague' : (day ? 'precise' : ''),
        startTime: hhmm,
        dueTime: hhmm,
        estimate: 0,
        priority: null,
        items: [],
        dueDone: false,
        blocked: false,
        desc: '',
        fullDesc: '',
      };
      state.rows.push(row);
      render();
      var born = els.main.querySelector('.db-task[data-id="' + row.id + '"]');
      if (born && born.scrollIntoView) born.scrollIntoView({ block: 'nearest' });
      var job = TT.createRow(t, draft.name, list.id).then(function (res) {
        var id = res && res.cardId;
        if (!id) throw new Error('no-card');
        row.id = id;
        if (!day && !vague) return res;
        return DT().planAt ? DT().planAt(t, id, day, vague, hhmm) : DT().planDay(t, id, day);
      });
      write(job, '« ' + draft.name + ' » créée');
    }

    /* ── 3. Orchestrator ───────────────────────────────────────────── */
    // endTime: a card that is a span (a meeting) keeps its own end when it moves.
    function plan(row, iso, vague, time, endTime) {
      var hhmm = vague ? '' : (time || '');
      var until = vague ? '' : (endTime || hhmm);
      row.dueVague = vague || '';
      row.dueMode = vague ? 'vague' : (iso ? 'precise' : '');
      row.start = vague ? '' : iso;
      row.due = vague ? '' : iso;
      row.startTime = hhmm;
      row.dueTime = until;
      save(row, function () {
        return DT().planAt
          ? DT().planAt(t, row.id, iso, vague || '', hhmm, until)
          : DT().planDay(t, row.id, iso);
      });
      render();
    }

    /**
     * Plans several cards at once: moves = [{ id, date, time }]. One message, one undo (button or Ctrl+Z)
     * puts every card back on the day and hour it had.
     */
    function planMany(moves, message) {
      var done = [];
      (moves || []).forEach(function (m) {
        var row = state.rows.filter(function (r) { return r.id === m.id; })[0];
        if (!row) return;
        done.push({
          row: row,
          move: m,
          before: { due: row.due || '', start: row.start || '', startTime: row.startTime || '', dueTime: row.dueTime || '', dueVague: row.dueVague || '', dueMode: row.dueMode || '' },
        });
      });
      if (!done.length) return;
      done.forEach(function (x) {
        var hhmm = x.move.time || '';
        Object.assign(x.row, { dueVague: '', dueMode: 'precise', start: x.move.date, due: x.move.date, startTime: hhmm, dueTime: hhmm });
        save(x.row, function () { return DT().planAt(t, x.row.id, x.move.date, '', hhmm); });
      });
      function undo() {
        if (state.undo !== undo) return;
        state.undo = null;
        done.forEach(function (x) {
          // A reload may have replaced the card since: act on the current one.
          var cur = state.rows.filter(function (r) { return r.id === x.row.id; })[0] || x.row;
          Object.assign(cur, x.before);
          save(cur, function () { return DT().restoreDates(t, cur.id, x.before); });
        });
        setStatus('Remis comme avant', 'ok');
        render();
      }
      state.undo = undo;
      setStatus(message, 'ok', 9000, { label: 'Défaire', run: undo });
      render();
    }

    /**
     * Hands a card from the row `from` ('all' = every current person) to `to` (a person of PeopleBoardModel), and
     * plans it at the same time when `when` = { iso, vague, time } (a drop on another day). One message, one undo
     * (button or Ctrl+Z) puts the people and the day back.
     */
    function handOver(row, from, to, when) {
      var change = PB().handover(row, from, to);
      var was = {
        assignees: (row.assignees || []).map(function (a) { return Object.assign({}, a); }),
        customs: ((row.inputs && row.inputs.customAssignees) || []).map(function (c) { return Object.assign({}, c); }),
        dates: { due: row.due || '', start: row.start || '', startTime: row.startTime || '', dueTime: row.dueTime || '', dueVague: row.dueVague || '', dueMode: row.dueMode || '' },
      };
      var backMembers = was.assignees.filter(function (a) { return !a.custom; }).map(function (a) { return String(a.id); });
      PB().applyHandover(row, change);
      save(row, function () { return DT().setAssignees(t, row.id, { members: change.members, contacts: change.contacts }); });
      // plan() paints and writes the day after the people (the writes of one card run in order).
      if (when && when.vague) plan(row, '', when.vague);
      else if (when) plan(row, when.iso, '', when.time || '');
      function undo() {
        if (state.undo !== undo) return;
        state.undo = null;
        var cur = state.rows.filter(function (r) { return r.id === row.id; })[0] || row;
        cur.assignees = was.assignees.map(function (a) { return Object.assign({}, a); });
        cur.inputs = Object.assign({}, cur.inputs || {}, { customAssignees: was.customs.map(function (c) { return Object.assign({}, c); }) });
        save(cur, function () { return DT().setAssignees(t, cur.id, { members: change.members ? backMembers : null, contacts: change.contacts ? was.customs : null }); });
        if (when) {
          Object.assign(cur, was.dates);
          save(cur, function () { return DT().restoreDates(t, cur.id, was.dates); });
        }
        setStatus('Remis comme avant', 'ok');
        render();
      }
      state.undo = undo;
      setStatus('« ' + row.name + ' »' + (to.key === ME ? ' reprise' : ' confiée à ' + to.name), 'ok', 9000, { label: 'Défaire', run: undo });
      render();
    }

    function stepLine(row) {
      var text = WO() && WO().stepText ? WO().stepText(row) : '';
      if (!text) return null;
      return h('span', { class: 'db-step', text: text });
    }

    function placeLine(row) {
      var place = WO() && state.places ? state.places[row.id] : null;
      var label = place ? WO().placeLabel(place) : '';
      if (!label) return null;
      var kids = [h('span', { text: label })];
      if (place.projectId && global.ProjectIcon) {
        var glyph = global.ProjectIcon.button({
          t: t,
          id: place.projectId,
          icon: place.icon,
          goals: function () { return state.goals; },
          onSaved: function (saved) {
            if (saved) applyGoals(saved);
            render();
          },
        });
        if (glyph) kids.unshift(glyph);
      }
      return h('span', { class: 'db-place' }, kids);
    }

    // owner: the row the card is drawn on ('me' by default, a person key under the people rows).
    function taskCard(row, showDue, owner) {
      var late = !!(DM().plannedDay(row) && DM().plannedDay(row) < today);
      var hard = WO() && WO().dateKind(row) === 'hard';
      var el = h('div', { class: 'db-task' + (late ? ' is-late' : '') + (hard ? ' is-hard' : ''), draggable: 'true', title: row.name, 'data-id': row.id, 'data-card': row.id }, [
        h('div', { class: 'db-task-name', text: row.name }),
        stepLine(row),
        placeLine(row),
        h('div', { class: 'db-task-meta' }, [
          hard ? h('span', { class: 'db-chip', text: 'Échéance' }) : null,
          prioBadge(row, true),
          estChip(row),
          row.startTime ? h('span', { class: 'db-chip', text: clockLabel(row.startTime) }) : null,
          showDue === true ? dueChip(row) : null,
        ]),
      ]);
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', row.id);
        e.dataTransfer.setData(OWNER_TYPE, typeof owner === 'string' ? owner : ME);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-drag');
      });
      el.addEventListener('dragend', function () { el.classList.remove('is-drag'); });
      el.addEventListener('dblclick', function () { openCard(row); });
      return el;
    }

    function dropZone(el, spec) {
      var iso = typeof spec === 'string' ? spec : ((spec && spec.iso) || '');
      var vague = spec && spec.vague ? spec.vague : '';
      var owner = spec && spec.owner ? spec.owner : ME; // the row this zone belongs to
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('is-drop'); });
      el.addEventListener('dragleave', function () { el.classList.remove('is-drop'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('is-drop');
        var id = e.dataTransfer.getData('text/plain');
        var row = state.rows.filter(function (r) { return r.id === id; })[0];
        if (!row) return;
        var wantTime = spec && spec.time ? spec.time : '';
        var curDay = row.dueVague ? '' : (row.start || row.due || '');
        var moves = vague ? row.dueVague !== vague : (row.dueVague || curDay !== iso || (row.startTime || '') !== wantTime);
        // Dropped on another person's row: the card changes hands (and day, when the cell is another day's).
        var from = e.dataTransfer.getData(OWNER_TYPE) || ME;
        var team = from !== owner && PB() ? teamList() : [];
        var heir = team.length ? PB().byKey(team, state.me, owner) : null;
        var giver = heir ? PB().byKey(team, state.me, from) : null;
        if (heir && PB().needsHandover(row, giver, heir)) {
          handOver(row, giver, heir, moves ? { iso: iso, vague: vague, time: wantTime } : null);
          return;
        }
        if (vague) {
          if (moves) plan(row, '', vague);
          return;
        }
        if (moves) plan(row, iso, '', wantTime);
      });
      return el;
    }

    var VAGUE_SHORT = {
      'bientot': 'Bientôt',
      'sous-peu': 'Sous peu',
      'quelques-semaines': 'Quelques sem.',
      'proche': 'Proche',
      'prochain-mois': 'Mois prochain',
      'quelques-mois': 'Quelques mois',
      'semestre': 'Semestre',
      'long-terme': 'À long terme',
      'lointain': 'Lointain',
      'an-ou-deux': '1 ou 2 ans',
      'eventuellement': 'Éventuellement',
      'assez-lointain': 'Assez lointain',
      'tres-lointain': 'Très lointain',
    };
    var MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

    function vagueOptions() {
      var opts = global.PriorityUI && global.PriorityUI.DUE_DATE_VAGUE_OPTIONS;
      if (!opts || !opts.length) return [];
      return opts.map(function (o) { return { id: o.id, label: o.label, days: o.days }; });
    }

    /* Continuous zoom, same idea as the Gantt: a pixels-per-day value eased on
       the wheel. Columns stretch; the scale changes only when a column of the
       next level is wide enough, and the instant under the cursor stays put. */
    var zoomAnim = { raf: 0, cur: 0, target: 0, x: 0 };
    var ZOOM_COUNTS = { minute: 12, hour: 12, day: 7, week: 8, month: 12, year: 5, years: 12, vague: 8 };

    function isoFromMs(ms) {
      var d = new Date(ms);
      return isFinite(d.getTime()) ? DM().isoOf(d) : today;
    }

    function bucketRange(b) {
      if (!b || b.vague || !b.date) return null;
      var start = Date.parse(b.date + 'T' + (b.time || '00:00') + ':00');
      var end;
      if (b.endTime === '24:00') end = Date.parse(DM().addDays(b.date, 1) + 'T00:00:00');
      else if (b.endTime) end = Date.parse((b.end && b.end !== b.date ? b.end : b.date) + 'T' + b.endTime + ':00');
      else if (b.end) end = Date.parse(b.end + 'T00:00:00');
      if (!isFinite(start) || !isFinite(end) || end <= start) return null;
      return { start: start, end: end };
    }

    function ensureZoom() {
      if (!(state.zoomP > 0) && DM().zoomFit) {
        var avail = Math.max(320, (els.main.clientWidth || 960) - 280);
        state.zoomP = DM().zoomFit(state.scale || 'day', avail, ZOOM_COUNTS[state.scale] || 7);
      }
      var layout = DM().zoomLayout(state.zoomP || 180);
      state.zoomP = layout.pxPerDay;
      state.zoomColPx = layout.colPx;
      if (layout.scale !== state.scale) {
        state.scale = layout.scale;
        if (DT().setScale) DT().setScale(state.scale);
      }
      return layout;
    }

    function pointerOnStrip(clientX, strip) {
      if (!strip) return clientX;
      var rect = strip.getBoundingClientRect();
      if (clientX == null || clientX < rect.left || clientX > rect.right) return rect.left + rect.width / 2;
      return clientX;
    }

    function readFocalMs(clientX, colPx) {
      var strip = els.main.querySelector('.db-board-days');
      if (!strip) return null;
      var cols = strip.querySelectorAll('[data-zoom-start]');
      if (!cols.length) return null;
      var rect = strip.getBoundingClientRect();
      var local = (clientX == null ? rect.left + rect.width / 2 : clientX) - rect.left;
      var x = strip.scrollLeft + local;
      var col = colPx > 0 ? colPx : (state.zoomColPx || 160);
      var stride = col + 4;
      var i = Math.floor(x / stride);
      if (i < 0) i = 0;
      if (i >= cols.length) i = cols.length - 1;
      var frac = (x - i * stride) / col;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      var a = +cols[i].getAttribute('data-zoom-start');
      var b = +cols[i].getAttribute('data-zoom-end');
      if (!isFinite(a) || !isFinite(b) || b <= a) return null;
      return a + frac * (b - a);
    }

    function scrollStripTo(strip, ms, clientX) {
      if (!strip || ms == null) return;
      var cols = strip.querySelectorAll('[data-zoom-start]');
      if (!cols.length) return;
      var col = state.zoomColPx || 160;
      var x = 0;
      for (var i = 0; i < cols.length; i++) {
        var a = +cols[i].getAttribute('data-zoom-start');
        var b = +cols[i].getAttribute('data-zoom-end');
        if (ms < b || i === cols.length - 1) {
          var frac = b > a ? (ms - a) / (b - a) : 0;
          if (frac < 0) frac = 0;
          if (frac > 1) frac = 1;
          x += frac * col;
          break;
        }
        x += col + 4;
      }
      var rect = strip.getBoundingClientRect();
      var local = clientX == null ? rect.width / 2 : clientX - rect.left;
      if (local < 0) local = 0;
      if (rect.width > 0 && local > rect.width) local = rect.width;
      strip.scrollLeft = Math.max(0, x - local);
    }

    function anchorScroll(strip, clientX, oldCol, newCol) {
      if (!strip || !(oldCol > 0) || !(newCol > 0)) return;
      var rect = strip.getBoundingClientRect();
      var local = (clientX == null ? rect.left + rect.width / 2 : clientX) - rect.left;
      var x = strip.scrollLeft + local;
      var i = Math.floor(x / (oldCol + 4));
      var frac = (x - i * (oldCol + 4)) / oldCol;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      strip.scrollLeft = Math.max(0, i * (newCol + 4) + frac * newCol - local);
    }

    function paintZoom(layout) {
      var root = els.main.querySelector('.db-zoom');
      if (!root || !layout) return;
      var range = root.querySelector('.db-zoom-range');
      if (range && document.activeElement !== range) range.value = String(DM().zoomSlider(layout.pxPerDay));
      var bounds = DM().zoomBounds();
      var btns = root.querySelectorAll('.db-zoom-btn');
      if (btns[0]) btns[0].disabled = layout.pxPerDay >= bounds.max * 0.985;
      if (btns[1]) btns[1].disabled = layout.scale === 'vague';
    }

    function applyZoom(px, clientX) {
      if (!DM().zoomLayout) return;
      state.zoomTouched = true;
      var prevCol = state.zoomColPx;
      var prevScale = state.scale;
      var strip = els.main.querySelector('.db-board-days');
      var x = pointerOnStrip(clientX, strip);
      var focal = readFocalMs(x, prevCol);
      var layout = DM().zoomLayout(px);
      state.zoomP = layout.pxPerDay;
      state.zoomColPx = layout.colPx;
      if (layout.scale !== prevScale) {
        state.zoomFocalMs = focal;
        state.zoomFocalX = x;
        if (focal != null) state.zoomDay = isoFromMs(focal);
        state.scale = layout.scale;
        if (DT().setScale) DT().setScale(state.scale);
        render();
        return;
      }
      if (strip && layout.scale !== 'vague' && prevCol > 0) {
        strip.style.gridTemplateColumns = 'repeat(' + strip.children.length + ', ' + layout.colPx + 'px)';
        anchorScroll(strip, x, prevCol, layout.colPx);
        if (global.PeopleBoardUI) global.PeopleBoardUI.sync(els.main);
      }
      paintZoom(layout);
    }

    function zoomTick() {
      zoomAnim.raf = 0;
      var ratio = zoomAnim.target / zoomAnim.cur;
      if (!isFinite(ratio) || ratio <= 0) return;
      var done = Math.abs(Math.log(ratio)) < 0.004;
      var next = done ? zoomAnim.target : zoomAnim.cur * Math.pow(ratio, 0.3);
      applyZoom(next, zoomAnim.x);
      var applied = state.zoomP;
      if (Math.abs(applied - next) / Math.max(next, 1e-6) > 0.002) {
        zoomAnim.target = applied;
        done = true;
      }
      zoomAnim.cur = applied;
      if (!done) zoomAnim.raf = requestAnimationFrame(zoomTick);
    }

    function easeZoom(target, clientX) {
      var bounds = DM().zoomBounds ? DM().zoomBounds() : { min: 0.05, max: 30000 };
      if (target < bounds.min) target = bounds.min;
      if (target > bounds.max) target = bounds.max;
      if (!zoomAnim.raf) zoomAnim.cur = state.zoomP > 0 ? state.zoomP : target;
      zoomAnim.target = target;
      zoomAnim.x = clientX;
      if (!zoomAnim.raf) zoomAnim.raf = requestAnimationFrame(zoomTick);
    }

    els.main.addEventListener('wheel', function (e) {
      if (state.section !== 'orchestrator') return;
      if (e.ctrlKey || e.metaKey) return;
      var node = e.target;
      if (node && node.closest && node.closest('input, textarea, select, .db-zoom-range')) return;
      // Over the people rows the wheel scrolls through the people (sideways it moves the columns with my row).
      // Without more people than fit, it zooms like everywhere else on the board.
      var crowd = node && node.closest ? node.closest('.pb-people') : null;
      if (crowd) {
        var days = els.main.querySelector('.db-board-days');
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          if (days) days.scrollLeft += e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1);
          e.preventDefault();
          return;
        }
        if (crowd.scrollHeight > crowd.clientHeight + 1) return;
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (!e.deltaY || !(state.zoomP > 0)) return;
      e.preventDefault();
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
      var f = Math.exp(-e.deltaY * unit * 0.002);
      if (f < 0.6) f = 0.6;
      if (f > 1.6) f = 1.6;
      easeZoom((zoomAnim.raf ? zoomAnim.target : state.zoomP) * f, e.clientX);
    }, { passive: false });

    // Middle button pans the board, like the Gantt. Left button stays for moving a card.
    var MIDDLE = 1;
    els.main.addEventListener('mousedown', function (e) {
      if (e.button !== MIDDLE || state.section !== 'orchestrator') return;
      if (!e.target.closest || !e.target.closest('.db-board, .pb-people')) return;
      e.preventDefault();
    }, true);
    els.main.addEventListener('pointerdown', function (e) {
      if (e.button !== MIDDLE || state.section !== 'orchestrator') return;
      if (!e.target.closest) return;
      if (e.target.closest('input, textarea, select, .db-zoom')) return;
      var board = e.target.closest('.db-board, .pb-people');
      if (!board) return;
      var strip = els.main.querySelector('.db-board-days');
      if (!strip) return;
      e.preventDefault();
      e.stopPropagation();
      var body = e.target.closest('.db-col-body') || e.target.closest('.pb-people');
      var pan = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: strip.scrollLeft,
        top: body ? body.scrollTop : 0,
        body: body,
      };
      strip.classList.add('is-panning');
      try { strip.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      function onMove(ev) {
        if (ev.pointerId !== pan.id) return;
        strip.scrollLeft = pan.left - (ev.clientX - pan.x);
        if (pan.body) pan.body.scrollTop = pan.top - (ev.clientY - pan.y);
      }
      function onUp(ev) {
        if (ev.pointerId !== pan.id) return;
        strip.classList.remove('is-panning');
        strip.removeEventListener('pointermove', onMove);
        strip.removeEventListener('pointerup', onUp);
        strip.removeEventListener('pointercancel', onUp);
        try { strip.releasePointerCapture(pan.id); } catch (err2) { /* not captured */ }
      }
      strip.addEventListener('pointermove', onMove);
      strip.addEventListener('pointerup', onUp);
      strip.addEventListener('pointercancel', onUp);
    });
    els.main.addEventListener('auxclick', function (e) {
      if (e.button === MIDDLE && state.section === 'orchestrator') e.preventDefault();
    });

    function renderOrchestrator() {
      var layout = ensureZoom();
      var scale = layout.scale;
      var nowM = (function () {
        if (state.zoomFocalMs != null && state.zoomDay && state.zoomDay !== today) {
          var at = new Date(state.zoomFocalMs);
          return at.getHours() * 60 + at.getMinutes();
        }
        var d = new Date();
        return d.getHours() * 60 + d.getMinutes();
      })();
      var manual = scale === 'vague' || scale === 'hour' || scale === 'minute';
      var planFrom = (scale === 'hour' || scale === 'minute') ? (state.zoomDay || today) : today;
      // My row is what is mine or nobody's; with other people on the board they get a row each, below.
      var team = teamList();
      var everyRow = viewRows();
      var boardRows = team.length ? PB().mineRows(everyRow, state.me) : everyRow;
      var buckets = DM().horizonPlan(boardRows, planFrom, scale, state.capacity, vagueOptions(), nowM);
      var pool = DM().unplanned(boardRows);
      if (manual && scale !== 'vague' && DM().untimed) pool = pool.concat(DM().untimed(boardRows, today));
      var moves = manual ? [] : (scale === 'day'
        ? DM().autoPlan(boardRows, today, HORIZON, state.capacity)
        : DM().placeAuto(boardRows, today, scale, state.capacity, vagueOptions()));
      var autoBtn = moves.length ? h('button', {
        class: 'db-btn db-btn--primary db-auto',
        type: 'button',
        onclick: function () {
          moves.forEach(function (m) {
            var row = state.rows.filter(function (r) { return r.id === m.id; })[0];
            if (row) { row.start = m.date; row.due = m.date; row.dueVague = ''; row.dueMode = 'precise'; row.startTime = ''; row.dueTime = ''; }
          });
          render();
          var place = DT().planAt
            ? function (m) { return DT().planAt(t, m.id, m.date, '', ''); }
            : function (m) { return DT().planDay(t, m.id, m.date); };
          write(moves.reduce(function (p, m) { return p.then(function () { return place(m); }); }, Promise.resolve()), moves.length + (moves.length > 1 ? ' tâches planifiées' : ' tâche planifiée'));
        },
      }, [icon('wand'), document.createTextNode('Planifier auto')]) : null;
      var list = DM().SCALES || [];
      var label = '';
      for (var si = 0; si < list.length; si++) if (list[si].id === scale) label = list[si].label;
      var bounds = DM().zoomBounds();
      var range = h('input', {
        class: 'db-zoom-range',
        type: 'range',
        min: '0',
        max: '1000',
        step: '1',
        value: String(DM().zoomSlider(layout.pxPerDay)),
        'aria-label': 'Zoom',
        title: label,
      });
      range.addEventListener('input', function () {
        if (zoomAnim.raf) { cancelAnimationFrame(zoomAnim.raf); zoomAnim.raf = 0; }
        var p = DM().zoomFromSlider(range.value);
        zoomAnim.cur = p;
        zoomAnim.target = p;
        applyZoom(p, null);
      });
      function nudge(dir) {
        var base = zoomAnim.raf ? zoomAnim.target : state.zoomP;
        easeZoom(base * (dir < 0 ? 1.5 : 1 / 1.5), null);
      }
      var scales = h('div', { class: 'db-zoom' }, [
        h('button', {
          class: 'db-zoom-btn',
          type: 'button',
          title: 'Zoom avant',
          disabled: layout.pxPerDay >= bounds.max * 0.985,
          onclick: function () { nudge(-1); },
        }, [icon('zoom-in')]),
        range,
        h('button', {
          class: 'db-zoom-btn',
          type: 'button',
          title: 'Zoom arrière',
          disabled: scale === 'vague',
          onclick: function () { nudge(1); },
        }, [icon('zoom-out')]),
        h('span', { class: 'db-zoom-label' }, [
          icon(SCALE_ICON[scale] || 'calendar'),
          h('span', { class: 'db-zoom-name', text: label }),
        ]),
      ]);
      function dayBar(d) {
        var pct = d.capacity > 0 ? Math.min(100, Math.round((d.used / d.capacity) * 100)) : 0;
        var usedLabel = (d.used ? DM().formatMinutes(d.used) : '0') + ' / ' + DM().formatMinutes(d.capacity);
        var bar = h('div', {
          class: 'db-meter-hit',
          title: usedLabel,
        }, [
          h('span', { class: 'db-meter' + (d.over ? ' is-over' : ''), 'aria-hidden': 'true' }, [
            h('span', { class: 'db-meter-fill', style: 'width:' + pct + '%' }),
          ]),
        ]);
        return bar;
      }
      function columnKey(spec) {
        if (spec && spec.vague) return 'vague:' + spec.vague;
        var iso = typeof spec === 'string' ? spec : ((spec && spec.iso) || '');
        var time = spec && spec.time ? spec.time : '';
        if (time) return 'clock:' + iso + 'T' + time;
        return iso ? 'cal:' + iso : 'pool';
      }
      function columnPlace(spec) {
        if (spec && spec.vague) return { date: '', vague: spec.vague, time: '' };
        var iso = typeof spec === 'string' ? spec : ((spec && spec.iso) || '');
        return { date: iso, vague: '', time: (spec && spec.time) || '' };
      }
      function addSlot(spec) {
        var key = columnKey(spec);
        var place = columnPlace(spec);
        if (state.composer === key) {
          var input = h('input', {
            class: 'db-add-input',
            type: 'text',
            placeholder: 'Nouvelle carte…',
            'aria-label': 'Nouvelle carte',
            autocomplete: 'off',
            value: state.composerText || '',
          });
          var closed = false;
          function finish(fromBlur) {
            if (closed) return;
            var parse = global.QuickParse && global.QuickParse.parse;
            var draft = DM().taskDraft(input.value, place.date, parse, place.vague, place.time);
            if (!draft) {
              if (fromBlur && state.composer === key) {
                closed = true;
                state.composer = null;
                state.composerText = '';
                render();
              }
              return;
            }
            closed = true;
            state.composerText = '';
            if (fromBlur && state.composer === key) state.composer = null;
            createHere(draft);
          }
          input.addEventListener('input', function () { state.composerText = input.value; });
          input.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(false); }
            else if (e.key === 'Escape') {
              e.preventDefault();
              closed = true;
              state.composer = null;
              state.composerText = '';
              render();
            }
          });
          input.addEventListener('blur', function () { setTimeout(function () { finish(true); }, 0); });
          return input;
        }
        return h('button', {
          class: 'db-add',
          type: 'button',
          onclick: function () {
            if (state.composer !== key) state.composerText = '';
            state.composer = key;
            render();
          },
        }, [icon('plus'), h('span', { text: 'Nouvelle carte' })]);
      }
      function column(extra, head, bar, body, spec) {
        var cards = (body || []).slice();
        cards.push(addSlot(spec));
        var bodyEl = h('div', { class: 'db-col-body' }, cards);
        if (global.InsertGap) {
          global.InsertGap.watch(bodyEl, {
            item: '.db-task',
            tail: '.db-add, .db-add-input',
            placeholder: 'Titre…',
            onCreate: function (title) {
              var parse = global.QuickParse && global.QuickParse.parse;
              var place = columnPlace(spec);
              var draft = DM().taskDraft(title, place.date, parse, place.vague, place.time);
              if (draft) createHere(draft);
            },
          });
        }
        return dropZone(h('section', { class: 'db-col-card' + (extra ? ' ' + extra : '') }, [
          h('header', { class: 'db-col-head' }, head),
          bar,
          bodyEl,
        ]), spec);
      }
      function bucketLabel(b) {
        if (b.time) return clockLabel(b.time);
        if (scale === 'vague') return VAGUE_SHORT[b.vague] || b.label || b.key;
        if (scale === 'day') return dayLabel(b.date, today);
        if (scale === 'week') {
          if (today >= b.date && today < b.end) return 'Cette semaine';
          if (today >= DM().addDays(b.date, -7) && today < b.date) return 'Semaine prochaine';
          return TM() ? TM().formatDay(b.date) : b.date;
        }
        if (scale === 'month') {
          var d = new Date(b.date + 'T00:00:00');
          var y = d.getFullYear();
          var thisY = new Date(today + 'T00:00:00').getFullYear();
          return MONTHS_FR[d.getMonth()] + (y === thisY ? '' : ' ' + y);
        }
        return b.key;
      }
      function bucketIcon(b) {
        if (b.time) return 'clock';
        if (scale === 'day') return dayIconName(b.date, today);
        return SCALE_ICON[scale] || 'calendar';
      }
      var spacer = h('div', { class: 'db-meter-hit db-meter-hit--spacer', 'aria-hidden': 'true' }, [
        h('span', { class: 'db-meter' }),
      ]);
      var poolBody = pool.length
        ? pool.map(function (r) { return taskCard(r, true); })
        : [h('div', { class: 'db-col-empty', text: 'Tout est planifié.' })];
      if (autoBtn) poolBody.unshift(autoBtn);
      var poolCol = column('db-col-card--pool', [
        h('span', { class: 'db-col-name', text: 'À planifier' }),
        h('span', { class: 'db-col-count', text: String(pool.length) }),
      ], spacer, poolBody, '');
      function isCurrent(b) {
        var slotNow = b.time && b.date === today && DM().parseClock(b.time) <= nowM && nowM < DM().parseClock(b.endTime);
        return b.time ? slotNow : (b.date && today >= b.date && today < b.end);
      }
      function bucketSpec(b) {
        return scale === 'vague'
          ? { vague: b.vague }
          : b.time
            ? { iso: b.date, time: b.time }
            : { iso: b.date < today ? today : b.date };
      }
      var days = buckets.map(function (b) {
        var current = isCurrent(b);
        var extra = (current ? 'is-today' : '') + (scale === 'day' && isWeekend(b.date) ? ' is-weekend' : '');
        var head = [
          h('span', { class: 'db-col-name', title: scale === 'vague' ? (b.label || null) : null }, [
            icon(bucketIcon(b), 'db-day-icon'),
            document.createTextNode(bucketLabel(b)),
          ]),
        ];
        if (scale === 'vague') head.push(h('span', { class: 'db-col-count', text: String(b.tasks.length) }));
        else if (b.used) head.push(h('span', { class: 'db-cap-n' + (b.over ? ' is-over' : ''), text: DM().formatMinutes(b.used) }));
        var spec = bucketSpec(b);
        var node = column(extra.trim(), head, scale === 'vague' ? spacer.cloneNode(true) : dayBar(b), b.tasks.map(taskCard), spec);
        var span = bucketRange(b);
        if (span) {
          node.setAttribute('data-zoom-start', String(span.start));
          node.setAttribute('data-zoom-end', String(span.end));
        }
        return node;
      });
      var colTrack = scale === 'vague'
        ? 'repeat(' + days.length + ',minmax(168px,1fr))'
        : 'repeat(' + days.length + ',' + layout.colPx + 'px)';
      // One row per other person, on the same columns: what they have, cell by cell, and where a card is handed over.
      var crowd = team.length && global.PeopleBoardUI ? global.PeopleBoardUI.build({
        people: team,
        poolSpec: function (p) { return { iso: '', owner: p.key }; },
        card: function (r, p) { return taskCard(r, false, p.key); },
        zone: dropZone,
        plan: function (p) {
          var theirs = PB().personRows(everyRow, p);
          var theirBuckets = DM().horizonPlan(theirs, planFrom, scale, state.capacity, vagueOptions(), nowM);
          var theirPool = DM().unplanned(theirs);
          if (manual && scale !== 'vague' && DM().untimed) theirPool = theirPool.concat(DM().untimed(theirs, today));
          return {
            count: theirs.filter(function (r) { return DM().isOpen(r) && r.statutKey !== 'triage'; }).length,
            pool: theirPool,
            cells: theirBuckets.map(function (b) {
              var spec = bucketSpec(b);
              spec.owner = p.key;
              return { spec: spec, tasks: b.tasks, current: !!isCurrent(b), weekend: scale === 'day' && isWeekend(b.date) };
            }),
          };
        },
      }) : null;
      var page = h('div', { class: 'db-page db-page--board' }, [
        pageHead('Orchestrateur', null, h('div', { class: 'db-head-tools' }, [scales])),
        h('div', { class: 'db-board' }, [
          poolCol,
          h('div', { class: 'db-board-days', style: 'grid-template-columns:' + colTrack }, days),
        ]),
        crowd,
      ]);
      els.main.appendChild(page);
      if (crowd) {
        var lead = page.querySelector('.db-board-days');
        if (lead) lead.addEventListener('scroll', function () { global.PeopleBoardUI.sync(page); }, { passive: true });
      }
      if (!state.zoomTouched && scale !== 'vague') {
        var strip0 = page.querySelector('.db-board-days');
        var n0 = strip0 ? strip0.children.length : 0;
        if (strip0 && n0) {
          var inner = strip0.clientWidth - 10;
          var col0 = (inner - Math.max(0, n0 - 1) * 4) / n0;
          var days0 = DM().zoomSpanDays(scale);
          if (days0 && col0 > 80) {
            var fitted = DM().zoomLayout(col0 / days0);
            if (fitted.scale === scale) {
              state.zoomP = fitted.pxPerDay;
              state.zoomColPx = fitted.colPx;
              strip0.style.gridTemplateColumns = 'repeat(' + n0 + ', ' + fitted.colPx + 'px)';
              var extra = strip0.scrollWidth - strip0.clientWidth;
              if (extra > 0) {
                var tighter = Math.max(80, fitted.colPx - Math.ceil(extra / n0));
                var again = DM().zoomLayout(tighter / days0);
                if (again.scale === scale) {
                  state.zoomP = again.pxPerDay;
                  state.zoomColPx = again.colPx;
                  strip0.style.gridTemplateColumns = 'repeat(' + n0 + ', ' + again.colPx + 'px)';
                  fitted = again;
                }
              }
              var range0 = page.querySelector('.db-zoom-range');
              if (range0) range0.value = String(DM().zoomSlider(fitted.pxPerDay));
            }
          }
        }
      }
      if (state.zoomFocalMs != null) {
        scrollStripTo(page.querySelector('.db-board-days'), state.zoomFocalMs, state.zoomFocalX);
        state.zoomFocalMs = null;
        state.zoomFocalX = null;
      }
      if (crowd) global.PeopleBoardUI.sync(page);
    }

    /* ── 4. Today ──────────────────────────────────────────────────── */
    var todayView = null;

    // The page itself lives in today-ui.js; this hands it the helpers that write to Trello and draw the chips.
    function renderToday() {
      if (!todayView) {
        todayView = global.TodayUI.create({
          t: t,
          state: function () { return state; },
          rows: viewRows,
          section: function () { return state.section; },
          today: function () { return today; },
          rerender: render,
          go: go,
          parse: global.QuickParse && global.QuickParse.parse,
          prioBadge: prioBadge,
          estChip: estChip,
          dueChip: dueChip,
          capChip: capChip,
          menuChip: menuChip,
          stepLine: stepLine,
          placeLine: placeLine,
          plan: plan,
          planMany: planMany,
          setEstimate: setEstimate,
          complete: function (row) { exitComplete(row, true); },
          reopen: function (row) { exitComplete(row, false); },
          unblock: exitBlocked,
          openCard: openCard,
          setStatus: setStatus,
          createHere: createHere,
          review: reviewBlock,
        });
      }
      todayView.render(els.main);
    }

    function parkStarted(row) {
      var list = DT().listFor(state.lists, ['unstarted', 'backlog']);
      if (!list || !row) return;
      row.listId = list.id;
      row.statut = list.name;
      row.statutKey = list.category;
      write(DT().moveToCategory(t, row, state.lists, ['unstarted', 'backlog']), '« ' + row.name + ' » rangée');
      render();
    }

    function resultControl(p) {
      if (!p.metricLabel) {
        return p.missingMeasure ? h('span', { class: 'db-step is-missing', text: 'Sans mesure' }) : null;
      }
      var label = 'Résultat ' + p.metricLabel;
      if (!p.metricId || !global.GoalsTrello || typeof global.GoalsTrello.updateMetric !== 'function') {
        return h('span', { class: 'db-step' + (p.staleOutcome ? ' is-missing' : ''), text: label });
      }
      return h('button', {
        class: 'db-result' + (p.staleOutcome ? ' is-missing' : ''),
        type: 'button',
        onclick: function (e) { editResult(p, e.currentTarget); },
      }, [document.createTextNode(label)]);
    }

    function editResult(p, btn) {
      var input = h('input', {
        class: 'db-input',
        type: 'number',
        step: 'any',
        'aria-label': 'Résultat',
        value: p.metricValue == null ? '' : String(p.metricValue),
      });
      btn.replaceWith(input);
      input.focus();
      input.select();
      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        var n = Number(String(input.value).replace(',', '.'));
        if (!save || !isFinite(n)) { render(); return; }
        write(global.GoalsTrello.updateMetric(t, p.metricId, { currentValue: n }));
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); done = true; render(); }
      });
      input.addEventListener('blur', function () { finish(true); });
    }

    function reviewBlock() {
      var rep = WO()
        ? WO().review(viewRows(), { today: today, wipCap: WO().DEFAULT_WIP, projects: state.projects || [] })
        : { flags: [], steps: [], waiting: [], wip: { over: false }, projects: [] };
      var projects = rep.projects || [];
      var steps = rep.steps || [];
      var waiting = rep.waiting || [];
      if (!rep.flags.length && !steps.length && !waiting.length && !projects.length) return null;
      var kids = [h('h3', { class: 'db-sugg-h' }, [icon('list-check'), document.createTextNode(' Revue')])];
      rep.flags.forEach(function (f) {
        kids.push(h('div', { class: 'db-row' }, [
          h('span', { class: 'db-row-name', text: f.label }),
          h('span', { class: 'db-chip', text: f.detail }),
          f.id === 'triage' ? h('button', { class: 'db-btn', type: 'button', onclick: function () { go('triage'); } }, [document.createTextNode('Ouvrir')]) : null,
          f.id === 'wip' && rep.wip && rep.wip.park ? h('button', { class: 'db-btn', type: 'button', title: 'Ranger la moins prioritaire', onclick: function () { parkStarted(rep.wip.park); } }, [document.createTextNode('Ranger')]) : null,
        ]));
      });
      steps.forEach(function (r) {
        kids.push(h('div', { class: 'db-row', 'data-card': r.id }, [
          h('span', { class: 'db-row-name', text: r.name, onclick: function () { openCard(r); } }),
        ]));
      });
      waiting.forEach(function (r) {
        kids.push(h('div', { class: 'db-row', 'data-card': r.id }, [
          h('span', { class: 'db-row-name', text: r.name, onclick: function () { openCard(r); } }),
          h('span', { class: 'db-chip', text: r.waiting }),
        ]));
      });
      projects.forEach(function (p) {
        var stepText = p.step && p.step.text ? p.step.text : '';
        kids.push(h('div', { class: 'db-project' }, [
          h('div', { class: 'db-row-name', text: p.name }),
          p.outcome ? h('div', { class: 'db-step', text: p.outcome }) : null,
          stepText ? h('div', {
            class: 'db-step',
            'data-card': p.step && p.step.cardId ? p.step.cardId : null,
            text: stepText,
            onclick: p.step && p.step.cardId ? function () {
              var card = state.rows.filter(function (r) { return r.id === p.step.cardId; })[0];
              if (card) openCard(card);
            } : null,
          }) : null,
          h('div', { class: 'db-project-nums' }, [
            p.work == null ? null : h('span', { text: 'Travail ' + p.work + ' %' }),
            resultControl(p),
          ]),
        ]));
      });
      return h('section', { class: 'db-sugg' }, kids);
    }

    /* ── Render + keys ─────────────────────────────────────────────── */
    function render() {
      if (global.Isolation) global.Isolation.adopt(t, state.rows, state.goals);
      today = todayIso();
      if (state.section === 'review') state.section = 'today';
      var keepScroll = els.main.scrollTop;
      var holdDays = state.zoomFocalMs == null;
      var daysScroll = 0;
      var prevDays = els.main.querySelector('.db-board-days');
      if (prevDays) daysScroll = prevDays.scrollLeft;
      var colScroll = [];
      els.main.querySelectorAll('.db-col-body').forEach(function (b) { colScroll.push(b.scrollTop); });
      // The triage list and pane keep their scroll, and the control that had the focus gets it back:
      // a click must never feel like a reload.
      var kept = {};
      els.main.querySelectorAll('[data-keep]').forEach(function (n) { kept[n.getAttribute('data-keep')] = n.scrollTop; });
      var had = document.activeElement;
      var focusKey = had && had !== document.body && els.main.contains(had) ? had.getAttribute('data-fk') : null;
      if (docUI) docUI.park();
      els.main.textContent = '';
      renderSide();
      if (state.section === 'triage') renderTriage();
      else if (state.section === 'orchestrator') renderOrchestrator();
      else renderToday();
      els.main.scrollTop = keepScroll;
      els.main.querySelectorAll('[data-keep]').forEach(function (n) {
        var top = kept[n.getAttribute('data-keep')];
        if (top != null) n.scrollTop = top;
      });
      // Keep the selected card of the list in view, inside the list only (on a phone the list is under the pane).
      var sel = state.section === 'triage' ? els.main.querySelector('.db-triage-list .is-sel') : null;
      var box = sel ? els.main.querySelector('.db-split-l') : null;
      if (box) {
        var b = box.getBoundingClientRect();
        var r = sel.getBoundingClientRect();
        if (r.top < b.top) box.scrollTop -= b.top - r.top;
        else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
      }
      var bodies = els.main.querySelectorAll('.db-col-body');
      for (var i = 0; i < bodies.length && i < colScroll.length; i++) bodies[i].scrollTop = colScroll[i];
      var daysNow = els.main.querySelector('.db-board-days');
      if (holdDays && daysNow) daysNow.scrollLeft = daysScroll;
      if (state.section === 'orchestrator' && state.composer != null) {
        var addInput = els.main.querySelector('.db-add-input');
        if (addInput && document.activeElement !== addInput) addInput.focus({ preventScroll: true });
      }
      // A decision button is never given back (a held key would decide the next card too); the page takes
      // the focus then, so the keys keep working.
      var back = focusKey && focusKey.indexOf('exit:') !== 0 ? els.main.querySelector('[data-fk="' + focusKey + '"]') : null;
      var now = document.activeElement;
      if (back) back.focus({ preventScroll: true });
      else if (!now || now === document.body) shell.focus({ preventScroll: true });
      if (docUI) docUI.unpark();
    }

    shell.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(e.target && e.target.isContentEditable);
      // Ctrl+Z takes the last decision back (a text field keeps its own undo).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && state.undo) {
        e.preventDefault();
        return state.undo();
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing) return;
      var k = e.key.toLowerCase();
      var idx = '123'.indexOf(k);
      if (idx >= 0 && k.length === 1) { e.preventDefault(); return go(SECTIONS[idx].key); }
      if (state.section !== 'triage') return;
      var q = triageOrder(DM().triageQueue(viewRows()));
      var focus = focusEntries(DM().triageQueue(viewRows()));
      var i = focusAt(focus);
      // The Document pane shows no card: J / K go back to the list, the decision keys wait.
      if (state.docOpen) {
        if ((k === 'j' || k === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') && q.length) {
          e.preventDefault();
          state.docOpen = false;
          render();
        }
        return;
      }
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); applyFocus(focus[i + 1]); return; }
      if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); applyFocus(focus[i - 1]); return; }
      if (state.subSel) return;
      var ex = DM().exitForKey(e.key);
      var card = q.filter(function (r) { return r.id === state.selected; })[0];
      if (ex && card) {
        e.preventDefault();
        perform(card, ex.id, els.main.querySelector('[data-exit="' + ex.id + '"]'));
      }
    });

    function loadChain() {
      var goalsP = global.MindmapGoalsTrello && typeof global.MindmapGoalsTrello.load === 'function'
        ? global.MindmapGoalsTrello.load(t).catch(function () { return { nodes: [], links: [] }; })
        : Promise.resolve({ nodes: [], links: [] });
      var boardP = global.GoalsTrello
        ? Promise.all([
            global.GoalsTrello.getObjectifs(t).catch(function () { return []; }),
            global.GoalsTrello.getMetrics(t).catch(function () { return []; }),
          ]).catch(function () { return [[], []]; })
        : Promise.resolve([[], []]);
      return Promise.all([goalsP, boardP]);
    }

    function reload(opts) {
      opts = opts || {};
      if (!opts.quiet) {
        root.innerHTML = global.Skeleton.html('dashboard');
      }
      return Promise.all([DT().load(t), loadChain(), loadTeam()]).then(function (res) {
        if (!root.contains(shell)) { root.innerHTML = ''; root.appendChild(shell); }
        state.lists = res[0].lists;
        state.rows = res[0].rows;
        var goals = res[1][0] || { nodes: [], links: [] };
        state.objectifs = (res[1][1] && res[1][1][0]) || [];
        state.metrics = (res[1][1] && res[1][1][1]) || [];
        applyGoals(goals);
        // Opening the Dashboard with work due answers "what now?" straight away; otherwise stay on Triage.
        if (!state.landed) {
          state.landed = true;
          if (DM().todayList(state.rows, today).length) state.section = 'today';
        }
        global.Skeleton.remember('dashboard', { rows: DM().todayList(state.rows, today).length });
        render();
      }).catch(function (err) {
        root.innerHTML = '';
        root.appendChild(h('div', { class: 'db-loading', text: 'Impossible de charger le Dashboard : ' + (err && err.message) }));
      });
    }

    // Linear-style keys on the card of the pane: S statut, P urgence, D échéance, C nouvelle carte (shared with Tableau and Kanban).
    // The pane is the card that is selected, so the keys never act on a row the pointer merely rests on.
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: t,
        hoverSelector: '.tri[data-card]',
        idOf: function (el) { return el.getAttribute('data-card'); },
        selectedId: function () { return state.section === 'triage' ? state.selected || '' : ''; },
        anchorFor: function (id) { return els.main.querySelector('.tri[data-card="' + id + '"] .tri-top'); },
        row: function (id) { return state.rows.filter(function (r) { return r.id === id; })[0] || null; },
        lists: function () { return state.lists; },
        setStatus: function (row, list) {
          setStatus('Enregistrement…', 'busy');
          global.TableTrello.moveCard(t, row.id, list.id, 'bottom').then(function () {
            row.listId = list.id; row.statut = list.name; row.statutKey = list.category;
            setStatus('Statut modifié', 'ok');
            reload({ quiet: true });
          }, fail);
        },
        setUrgency: function (row, urgencyId) {
          perform(row, 'urg:' + urgencyId);
        },
        openDue: function (row, anchor) {
          if (!global.CardFields) return;
          global.CardFields.open('due', {
            t: t,
            cardId: row.id,
            cardName: row.name,
            anchor: anchor,
            onSaved: function () { setStatus('Échéance enregistrée', 'ok'); reload({ quiet: true }); },
            onError: function (m) { setStatus('Erreur échéance : ' + m, 'error'); },
          });
        },
        newCard: function () { createCard(); },
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () {
          return state.rows.map(function (r) {
            var l = state.lists.filter(function (x) { return x.id === r.listId; })[0];
            return { id: r.id, name: r.name, hint: l ? l.name : '' };
          });
        },
        onCard: function (id) {
          var row = state.rows.filter(function (r) { return r.id === id; })[0];
          if (!row) return;
          state.selected = id;
          render();
          global.CommandPalette.reveal('.db-row[data-id="' + id + '"]');
        },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: createCard }, { label: 'Nouveau document', icon: 'file-plus', run: openDoc }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }

    if (t && typeof t.board === 'function') {
      t.board('members').then(function (b) {
        var list = (b && b.members) || (Array.isArray(b) ? b : []);
        people = list.map(function (m) { return m && (m.fullName || m.username); }).filter(Boolean);
      }, function () {});
    }

    shell.addEventListener('contextmenu', function (e) {
      var CM = global.ContextMenu;
      if (!CM || !e) return;
      if (e.target && e.target.closest && e.target.closest('.tp-context-menu')) return;
      var cardEl = e.target && e.target.closest && e.target.closest('[data-card]');
      var editable = CM.isNativeEditableTarget && CM.isNativeEditableTarget(e.target);
      if (!cardEl && editable) return;
      var row = null;
      if (cardEl) {
        row = state.rows.filter(function (r) { return r.id === cardEl.getAttribute('data-card'); })[0] || null;
        if (!row) return;
      }
      e.preventDefault();
      var anchor = e.target && e.target.nodeType === 1 ? e.target : cardEl;
      // A text field keeps cut / copy / paste. The full card menu is for the row itself,
      // so "Annuler" (discard) does not sit next to "Annuler" (undo).
      if (row && editable && typeof CM.buildGenericItems === 'function') {
        var field = CM.buildGenericItems(e.target, document) || [];
        CM.show(e, [
          { id: 'open-card', label: 'Ouvrir la carte', icon: 'external-link', group: 'Ouvrir', action: function () { openCard(row); } },
          { id: 'open-document', label: 'Document', icon: 'file-text', group: 'Ouvrir', action: function () { if (global.ViewTabs && typeof global.ViewTabs.openSubject === 'function') global.ViewTabs.openSubject('task', row.id); } },
          { sep: true },
        ].concat(field));
        return;
      }
      var entries = row ? menuEntries(row, menuCtx(row)) : pageEntries({ section: state.section, canCreate: !!(DT().listFor(state.lists, ['triage']) && global.NewCard) });
      CM.show(e, withIso(row, entries, anchor || cardEl));
    });

    if (global.AssistantDock) {
      global.AssistantDock.mount({
        t: t,
        after: root,
        onRefresh: function () { reload({ quiet: true }); },
        isBusy: function () {
          var ae = document.activeElement;
          var typing = ae && root.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
          return state.busy || !!state.composer || typing || (global.CardFields && global.CardFields.isOpen());
        },
      });
    }

    reload();
  }

  global.DashboardUI = { mount: mount, menuEntries: menuEntries, pageEntries: pageEntries, dueChoices: dueChoices, dayLabel: dayLabel };
})(typeof window !== 'undefined' ? window : this);
