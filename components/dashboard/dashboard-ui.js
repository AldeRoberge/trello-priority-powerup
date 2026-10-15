/*
 * Role: UI of the Dashboard view, a Linear-style workspace:
 *   Triage        the list of captured cards and, beside it, TriageUI: what the card is, its priority / estimate / day / place,
 *                 then the decision: accept, backlog, waiting, someday, reference, cancel (an undo stays one click away)
 *   Orchestrateur zoom glides from minutes to Vague (wheel eases, columns stretch, the instant under the cursor stays). Each column creates a task in place.
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
    var items = [];

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
    if (open && !triage) items.push({ id: 'complete', label: 'Terminer', icon: 'circle-check', group: 'Trier' });
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
    items.push({ id: 'archive', label: 'Archiver', icon: 'archive', group: 'Suppression', danger: true });
    return items;
  }

  /** Right-click on empty dashboard space (no card under the pointer). */
  function pageEntries(ctx) {
    ctx = ctx || {};
    var items = [{ id: 'new-card', label: 'Nouvelle carte', icon: 'plus', group: 'Créer', hint: 'C', disabled: ctx.canCreate === false }];
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
      filter: '', // side-panel search: narrows every section
    };
    var statusTimer = null;
    var reloadTimer = null;
    var today = todayIso();

    root.innerHTML = '';
    var els = {
      side: h('nav', { class: 'sp db-side', 'aria-label': 'Dashboard' }),
      nav: h('div', { class: 'db-nav-list' }),
      filter: h('input', { type: 'search', placeholder: 'Filtrer…', 'aria-label': 'Filtrer les cartes', autocomplete: 'off' }),
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
        if (a && els.main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
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
      els.side.appendChild(h('div', { class: 'db-side-foot sp-foot' }, [
        h('label', { class: 'db-side-cap' }, [
          h('span', { text: 'Capacité / jour' }),
          h('select', {
            class: 'db-select',
            'aria-label': 'Capacité par jour',
            onchange: function (e) {
              state.capacity = Number(e.target.value);
              DT().setCapacity(state.capacity);
              render();
            },
          }, [3, 4, 5, 6, 7, 8].map(function (hrs) {
            return h('option', { value: String(hrs * 60), selected: state.capacity === hrs * 60, text: hrs + ' h' });
          })),
        ]),
      ]));
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
      }, has ? [document.createTextNode(String(row.priority))] : [icon('flag'), document.createTextNode('Prioriser…')]);
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

    /** Clickable day chip: plans the card on the chosen day (icons follow the day). */
    function dueChip(row) {
      var late = !!row.due && row.due < today && DM().isOpen(row);
      var label = !row.due ? 'Planifier…' : row.due === today ? 'Aujourd’hui' : dayLabel(row.due, today);
      var cls = (late ? 'is-late' : '') + (!row.due ? ' is-empty' : '');
      return menuChip(cls.trim(), 'Cliquer pour changer le jour', row.due ? dayIconName(row.due, today) : 'calendar-plus', label, function () {
        var items = [];
        for (var n = 0; n <= 7; n++) {
          (function (iso) {
            items.push({
              id: 'plan:' + iso,
              label: dayLabel(iso, today),
              icon: dayIconName(iso, today),
              checked: row.due === iso,
              action: function () { plan(row, iso); },
            });
          })(DM().addDays(today, n));
        }
        return items;
      });
    }

    /** Clickable "used / capacity" chip: sets the daily capacity. */
    function capChip(used) {
      var over = used > state.capacity;
      var label = (used ? DM().formatMinutes(used) : '0') + ' / ' + DM().formatMinutes(state.capacity);
      return menuChip(over ? 'is-late' : '', 'Cliquer pour changer la capacité par jour', '', label, function () {
        return [3, 4, 5, 6, 7, 8].map(function (hrs) {
          return {
            id: 'cap:' + hrs,
            label: hrs + ' h par jour',
            icon: 'clock-hour-' + Math.min(hrs, 12),
            checked: state.capacity === hrs * 60,
            action: function () { state.capacity = hrs * 60; DT().setCapacity(state.capacity); render(); },
          };
        });
      });
    }

    function openCard(row) {
      if (!row) return;
      var id = row.id;
      if (row.link) {
        var part = String(row.link).split('/c/')[1];
        if (part) id = part.split('/')[0];
      }
      if (t && typeof t.showCard === 'function') {
        t.showCard(id).catch(function () {
          if (row.link) global.open(row.link, '_blank', 'noopener');
        });
        return;
      }
      if (row.link) global.open(row.link, '_blank', 'noopener');
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

    function menuCtx() {
      return {
        today: today,
        lists: state.lists,
        waitingNames: namesForWaiting(),
        canCreate: !!(DT().listFor(state.lists, ['triage']) && global.NewCard),
        vagues: vagueOptions().map(function (v) { return { id: v.id, label: VAGUE_SHORT[v.id] || v.label }; }),
      };
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

    /** The project of a card, as the Mindmap goal map has it: { text, title } for the chip of the pane, or null. */
    function projectOfRow(row) {
      var p = WO() && WO().projectOf ? WO().projectOf(state.goals, row.id) : null;
      if (!p) return null;
      var place = state.places && state.places[row.id];
      return { text: p.name, title: place ? WO().placeLabel(place) : p.name };
    }

    /** The card joins a project (null: leaves it). It is saved in the goal map of the Mindmap; a card may also stay free. */
    function setProject(row, projectId) {
      var GG = global.MindmapGoalsTrello;
      if (!GG || typeof GG.save !== 'function' || !WO() || !WO().withTaskProject) return setStatus('Projets indisponibles ici.', 'error');
      var next = WO().withTaskProject(state.goals, row.id, projectId);
      state.goals = next;
      state.places = WO().places(next);
      render();
      GG.save(t, next).then(function (saved) {
        state.goals = saved;
        state.places = WO().places(saved);
        setStatus(projectId ? 'Projet enregistré' : 'Projet retiré', 'ok');
      }, function (err) {
        if (err && err.reason === 'conflict') setStatus('Les projets ont changé ailleurs : rechargés.', 'error');
        else fail(err);
        reload({ quiet: true });
      });
    }

    function pickProject(row, anchor) {
      var projects = (state.projects || []).slice().sort(byName);
      if (!projects.length) return setStatus('Aucun projet pour l’instant : créez-en un dans la Mindmap.', '', 4500);
      if (!global.LinearPick) return;
      var cur = WO() && WO().projectOf ? WO().projectOf(state.goals, row.id) : null;
      var items = projects.map(function (p) { return { id: p.id, label: p.name + (p.outcome ? ' · ' + p.outcome : ''), icon: 'stack-2' }; });
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
      if (id === 'priority' || id === 'progress' || id === 'desc') return openEditor(row, id, anchor);
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
      if (id === 'reload') return reload();
      if (id.indexOf('go:') === 0) return go(id.slice(3));
      if (id === 'waiting' || id === 'wait:') return askWaiting(row, anchor);
      if (id.indexOf('wait:') === 0) return exitWait(row, id.slice(5));
      if (id.indexOf('plan:') === 0) return plan(row, id.slice(5));
      if (id.indexOf('vague:') === 0) return plan(row, '', id.slice(6));
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

    function pageHead(title, sub, right) {
      return h('header', { class: 'db-head' }, [
        h('div', {}, [h('h1', { class: 'db-title', text: title }), sub ? h('p', { class: 'db-sub', text: sub }) : null]),
        right || null,
      ]);
    }

    /* ── 2. Triage ─────────────────────────────────────────────────── */
    /** One card of the list on the left: its title, the line under it (next step, else the note) and its score. */
    function triageRow(r, selected) {
      var sub = (WO() && WO().stepText(r)) || DM().snippet(r.desc, 90);
      return h('div', {
        class: 'db-row tg-row' + (selected ? ' is-sel' : ''),
        'data-id': r.id,
        'data-card': r.id,
        onclick: function () { state.selected = r.id; render(); },
      }, [
        h('span', { class: 'db-row-main' }, [
          h('span', { class: 'db-row-name', text: r.name }),
          sub ? h('span', { class: 'db-step', text: sub }) : null,
        ]),
        prioBadge(r),
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
      if (cur) cur.replaceWith(triageRow(row, cur.classList.contains('is-sel')));
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
        openEntities: openEntities,
        pickProject: pickProject,
        estimateMenu: estimateMenu,
        plan: function (row, iso) { plan(row, iso); },
        projectOf: projectOfRow,
        refreshRow: refreshRow,
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
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, withActions(row, menuEntries(row, menuCtx()), anchor));
        },
      };
    }

    function renderTriage() {
      var q = DM().triageQueue(viewRows());
      if (!q.length) {
        var none = !hasTriage() ? 'Aucune liste de triage sur ce tableau.' : state.filter ? 'Aucune carte ne correspond.' : 'Boîte de triage vide. Bien joué.';
        els.main.appendChild(h('div', { class: 'db-page' }, [
          pageHead('Triage'),
          hasTriage() ? null : inboxBanner(),
          h('div', { class: 'db-empty' }, [icon('inbox'), h('p', { text: none })]),
        ]));
        return;
      }
      var sel = q.filter(function (r) { return r.id === state.selected; })[0] || q[0];
      state.selected = sel.id;
      var list = h('div', { class: 'db-list db-triage-list' }, q.map(function (r) { return triageRow(r, r.id === sel.id); }));
      els.main.appendChild(h('div', { class: 'db-page db-page--split' }, [
        h('div', { class: 'db-split-l', 'data-keep': 'list' }, [pageHead('Triage', '', h('span', { class: 'db-badge', text: String(q.length) })), list]),
        h('div', { class: 'db-split-r', 'data-keep': 'pane' }, [global.TriageUI.detail(sel, triageHost())]),
      ]));
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
    function plan(row, iso, vague, time) {
      var hhmm = vague ? '' : (time || '');
      row.dueVague = vague || '';
      row.dueMode = vague ? 'vague' : (iso ? 'precise' : '');
      row.start = vague ? '' : iso;
      row.due = vague ? '' : iso;
      row.startTime = hhmm;
      row.dueTime = hhmm;
      save(row, function () {
        return DT().planAt
          ? DT().planAt(t, row.id, iso, vague || '', hhmm)
          : DT().planDay(t, row.id, iso);
      });
      render();
    }

    function stepLine(row) {
      var text = WO() && WO().stepText ? WO().stepText(row) : '';
      if (!text) return null;
      return h('span', { class: 'db-step', text: text });
    }

    function placeLine(row) {
      var label = WO() && state.places ? WO().placeLabel(state.places[row.id]) : '';
      if (!label) return null;
      return h('span', { class: 'db-place', text: label });
    }

    function taskCard(row, showDue) {
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
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('is-drop'); });
      el.addEventListener('dragleave', function () { el.classList.remove('is-drop'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('is-drop');
        var id = e.dataTransfer.getData('text/plain');
        var row = state.rows.filter(function (r) { return r.id === id; })[0];
        if (!row) return;
        var wantTime = spec && spec.time ? spec.time : '';
        if (vague) {
          if (row.dueVague !== vague) plan(row, '', vague);
          return;
        }
        var curDay = row.dueVague ? '' : (row.start || row.due || '');
        if (row.dueVague || curDay !== iso || (row.startTime || '') !== wantTime) plan(row, iso, '', wantTime);
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
      if (!e.target.closest || !e.target.closest('.db-board')) return;
      e.preventDefault();
    }, true);
    els.main.addEventListener('pointerdown', function (e) {
      if (e.button !== MIDDLE || state.section !== 'orchestrator') return;
      if (!e.target.closest) return;
      if (e.target.closest('input, textarea, select, .db-zoom')) return;
      var board = e.target.closest('.db-board');
      if (!board) return;
      var strip = board.querySelector('.db-board-days');
      if (!strip) return;
      e.preventDefault();
      e.stopPropagation();
      var body = e.target.closest('.db-col-body');
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
      var buckets = DM().horizonPlan(viewRows(), planFrom, scale, state.capacity, vagueOptions(), nowM);
      var pool = DM().unplanned(viewRows());
      if (manual && scale !== 'vague' && DM().untimed) pool = pool.concat(DM().untimed(viewRows(), today));
      var moves = manual ? [] : (scale === 'day'
        ? DM().autoPlan(viewRows(), today, HORIZON, state.capacity)
        : DM().placeAuto(viewRows(), today, scale, state.capacity, vagueOptions()));
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
      function capacityMenu(anchor) {
        var CM = global.ContextMenu;
        if (!CM || typeof CM.show !== 'function') return;
        var r = anchor.getBoundingClientRect();
        CM.show({ clientX: r.left, clientY: r.bottom + 4 }, [3, 4, 5, 6, 7, 8].map(function (hrs) {
          return {
            id: 'cap:' + hrs,
            label: hrs + ' h par jour',
            icon: 'clock-hour-' + Math.min(hrs, 12),
            checked: state.capacity === hrs * 60,
            action: function () { state.capacity = hrs * 60; DT().setCapacity(state.capacity); render(); },
          };
        }));
      }
      function dayBar(d) {
        var pct = d.capacity > 0 ? Math.min(100, Math.round((d.used / d.capacity) * 100)) : 0;
        var bar = h('button', {
          class: 'db-meter-hit',
          type: 'button',
          title: (d.used ? DM().formatMinutes(d.used) : '0') + ' / ' + DM().formatMinutes(d.capacity),
          onclick: function (e) { e.stopPropagation(); capacityMenu(bar); },
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
      var days = buckets.map(function (b) {
        var slotNow = b.time && b.date === today && DM().parseClock(b.time) <= nowM && nowM < DM().parseClock(b.endTime);
        var current = b.time ? slotNow : (b.date && today >= b.date && today < b.end);
        var extra = (current ? 'is-today' : '') + (scale === 'day' && isWeekend(b.date) ? ' is-weekend' : '');
        var head = [
          h('span', { class: 'db-col-name', title: scale === 'vague' ? (b.label || null) : null }, [
            icon(bucketIcon(b), 'db-day-icon'),
            document.createTextNode(bucketLabel(b)),
          ]),
        ];
        if (scale === 'vague') head.push(h('span', { class: 'db-col-count', text: String(b.tasks.length) }));
        else if (b.used) head.push(h('span', { class: 'db-cap-n' + (b.over ? ' is-over' : ''), text: DM().formatMinutes(b.used) }));
        var spec = scale === 'vague'
          ? { vague: b.vague }
          : b.time
            ? { iso: b.date, time: b.time }
            : { iso: b.date < today ? today : b.date };
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
      var page = h('div', { class: 'db-page db-page--board' }, [
        pageHead('Orchestrateur', null, h('div', { class: 'db-head-tools' }, [scales])),
        h('div', { class: 'db-board' }, [
          poolCol,
          h('div', { class: 'db-board-days', style: 'grid-template-columns:' + colTrack }, days),
        ]),
      ]);
      els.main.appendChild(page);
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
    }

    /* ── 4. Today ──────────────────────────────────────────────────── */
    function renderToday() {
      var tasks = DM().todayList(viewRows(), today);
      var used = DM().minutesOf(tasks);
      var blocks = DM().timeline(tasks);
      var byId = {};
      tasks.forEach(function (r) { byId[r.id] = r; });
      var focus = h('div', { class: 'db-list' }, tasks.length ? tasks.map(function (r) {
        var late = r.due && r.due < today;
        return h('div', { class: 'db-row', 'data-card': r.id }, [
          h('button', {
            class: 'db-check',
            type: 'button',
            title: 'Terminer',
            'aria-label': 'Terminer « ' + r.name + ' »',
            onclick: function () {
              r.dueDone = true;
              write(DT().complete(t, r, state.lists, true), '« ' + r.name + ' » terminée');
              render();
            },
          }, [icon('circle-check')]),
          h('span', { class: 'db-row-main' }, [
            h('span', { class: 'db-row-line' }, [
              h('span', { class: 'db-row-name', text: r.name, onclick: function () { openCard(r); } }),
              late ? h('span', { class: 'db-chip is-late' }, [icon('alert-circle'), document.createTextNode('En retard')]) : null,
            ]),
            stepLine(r),
            placeLine(r),
          ]),
          h('span', { class: 'db-props' }, [
            h('span', { class: 'db-prop db-prop--prio' }, [prioBadge(r)]),
            h('span', { class: 'db-prop db-prop--est' }, [estChip(r)]),
            h('span', { class: 'db-prop db-prop--due' }, [dueChip(r)]),
            h('span', { class: 'db-prop db-prop--go' }, [
              h('button', { class: 'db-icon-btn', type: 'button', title: 'Reporter à demain', onclick: function () { plan(r, DM().addDays(today, 1)); } }, [icon('arrow-curve-right')]),
            ]),
          ]),
        ]);
      }) : [h('div', { class: 'db-empty' }, [icon('sun'), h('p', { text: 'Rien de prévu aujourd’hui.' }),
        h('button', { class: 'db-btn', type: 'button', onclick: function () { go('orchestrator'); } }, [icon('calendar-event'), document.createTextNode('Ouvrir l’orchestrateur')])])]);
      if (global.InsertGap) {
        global.InsertGap.watch(focus, {
          item: '.db-row',
          placeholder: 'Titre…',
          onCreate: function (title) {
            var parse = global.QuickParse && global.QuickParse.parse;
            var draft = DM().taskDraft(title, today, parse, '');
            if (draft) createHere(draft);
          },
        });
      }

      var first = DM().DAY_START;
      var last = Math.max(first + 8 * 60, blocks.length ? blocks[blocks.length - 1].end : 0);
      var lay = DM().timelineLayout
        ? DM().timelineLayout(blocks, first, { minPx: 22, gap: 3, hourPx: 56 })
        : { hourPx: 56, items: blocks.map(function (b) {
          return { id: b.id, top: ((b.start - first) / 60) * 56, height: Math.max(22, ((b.end - b.start) / 60) * 56 - 3) };
        }) };
      var hourPx = lay.hourPx;
      var boxOf = {};
      lay.items.forEach(function (item) { boxOf[item.id] = item; });
      var grid = h('div', { class: 'db-tl', style: 'height:' + Math.ceil(((last - first) / 60) * hourPx) + 'px' });
      for (var m = first; m <= last; m += 60) {
        grid.appendChild(h('div', { class: 'db-tl-hour', style: 'top:' + ((m - first) / 60) * hourPx + 'px' }, [h('span', { text: DM().hhmm(m) })]));
      }
      blocks.forEach(function (b) {
        var r = byId[b.id];
        var box = boxOf[b.id] || { top: 0, height: 22 };
        var when = DM().hhmm(b.start) + ' - ' + DM().hhmm(b.end);
        grid.appendChild(h('div', {
          class: 'db-tl-block',
          'data-card': r ? r.id : null,
          style: 'top:' + box.top + 'px;height:' + box.height + 'px',
          title: when,
        }, [h('b', { text: (function () { var s = WO() && WO().stepState(r); return s && s.text ? s.text : r.name; })() }), h('span', { text: when })]));
      });
      var pct = Math.min(100, Math.round((used / state.capacity) * 100));
      var next = DM().nextAction(viewRows(), today);
      var sugg = DM().suggestions(viewRows(), today, 5);
      var nextStep = next ? (WO() && WO().stepState(next.row)) : null;
      var actionText = nextStep && nextStep.text ? nextStep.text : (next ? next.row.name : '');
      var nowCard = next ? h('section', { class: 'db-now', 'data-card': next.row.id }, [
        h('div', { class: 'db-now-k' }, [icon('target-arrow'), document.createTextNode(next.from === 'today' ? ' Prochaine action' : ' Rien de prévu : je suggère')]),
        h('div', { class: 'db-now-name', text: actionText, onclick: function () { openCard(next.row); } }),
        nextStep && nextStep.text ? h('div', { class: 'db-now-card', text: next.row.name }) : null,
        placeLine(next.row),
        h('div', { class: 'db-now-meta' }, [
          next.row.due && next.row.due < today && DM().isOpen(next.row) ? h('span', { class: 'db-chip is-late' }, [icon('alert-circle'), document.createTextNode('En retard')]) : null,
          prioBadge(next.row),
          estChip(next.row),
          dueChip(next.row),
        ]),
        h('div', { class: 'db-now-actions' }, [
          next.from === 'backlog' ? h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { plan(next.row, today); } }, [icon('sun'), document.createTextNode('Faire aujourd’hui')]) : null,
          h('button', { class: 'db-btn', type: 'button', onclick: function () {
            next.row.dueDone = true;
            write(DT().complete(t, next.row, state.lists, true), '« ' + next.row.name + ' » terminée');
            render();
          } }, [icon('circle-check'), document.createTextNode('Terminer')]),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { openCard(next.row); } }, [icon('external-link'), document.createTextNode('Ouvrir')]),
        ]),
      ]) : null;
      var suggBox = sugg.length ? h('section', { class: 'db-sugg' }, [
        h('h3', { class: 'db-sugg-h' }, [icon('bulb'), document.createTextNode(' À planifier · par priorité')]),
        h('div', { class: 'db-list' }, sugg.map(function (r) {
          return h('div', { class: 'db-row', 'data-card': r.id }, [
            h('span', { class: 'db-row-name', text: r.name, onclick: function () { openCard(r); } }),
            prioBadge(r),
            estChip(r),
            h('button', { class: 'db-btn', type: 'button', title: 'Ajouter à aujourd’hui', onclick: function () { plan(r, today); } }, [icon('plus'), document.createTextNode('Aujourd’hui')]),
          ]);
        })),
      ]) : null;
      els.main.appendChild(h('div', { class: 'db-page db-page--wide' }, [
        pageHead('Aujourd’hui', DAYS_FR[new Date().getDay()] + ' ' + TM().formatDay(today),h('div', { class: 'db-load' }, [
          capChip(used),
          h('div', { class: 'db-meter' + (used > state.capacity ? ' is-over' : '') }, [h('div', { class: 'db-meter-fill', style: 'width:' + pct + '%' })]),
        ])),
        nowCard,
        h('div', { class: 'db-today' }, [h('div', { class: 'db-today-l' }, [focus]), h('div', { class: 'db-today-r' }, [grid])]),
        reviewBlock(),
        suggBox,
      ]));
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
      var sel = state.section === 'triage' ? els.main.querySelector('.db-triage-list .is-sel') : null;
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
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
    }

    shell.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
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
      var q = DM().triageQueue(viewRows());
      var i = q.map(function (r) { return r.id; }).indexOf(state.selected);
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (q[i + 1]) { state.selected = q[i + 1].id; render(); } return; }
      if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (q[i - 1]) { state.selected = q[i - 1].id; render(); } return; }
      var ex = DM().exitForKey(e.key);
      if (ex && q[i]) {
        e.preventDefault();
        perform(q[i], ex.id, els.main.querySelector('[data-exit="' + ex.id + '"]'));
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
      return Promise.all([DT().load(t), loadChain()]).then(function (res) {
        if (!root.contains(shell)) { root.innerHTML = ''; root.appendChild(shell); }
        state.lists = res[0].lists;
        state.rows = res[0].rows;
        var goals = res[1][0] || { nodes: [], links: [] };
        var objectifs = (res[1][1] && res[1][1][0]) || [];
        var metrics = (res[1][1] && res[1][1][1]) || [];
        state.goals = goals;
        state.projects = WO() ? WO().projectChain(goals, state.rows, metrics, objectifs) : [];
        state.places = WO() ? WO().places(goals) : {};
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
        hoverSelector: '.tg[data-card]',
        idOf: function (el) { return el.getAttribute('data-card'); },
        selectedId: function () { return state.section === 'triage' ? state.selected || '' : ''; },
        anchorFor: function (id) { return els.main.querySelector('.tg[data-card="' + id + '"] .tg-top'); },
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
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: createCard }]; },
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
      var entries = row ? menuEntries(row, menuCtx()) : pageEntries({ section: state.section, canCreate: !!(DT().listFor(state.lists, ['triage']) && global.NewCard) });
      CM.show(e, withActions(row, entries, anchor || cardEl));
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

  global.DashboardUI = { mount: mount, menuEntries: menuEntries, pageEntries: pageEntries };
})(typeof window !== 'undefined' ? window : this);
