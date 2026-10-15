/*
 * Role: UI of the Dashboard view, a Linear-style workspace:
 *   Ingest        type tasks (one per line) → cards land in the triage list; optional "Demander à l'IA"
 *   Triage        what the item is, then priority / estimate / date: accept, backlog, reference, waiting, someday, cancel
 *   Orchestrateur zoom glides from minutes to Vague (wheel eases, columns stretch, the instant under the cursor stays). Each column creates a task in place.
 *   Aujourd'hui   focus list, the hour-by-hour timeline, and the revue (triage, next step, waiting, work in progress, project outcome).
 * Data and writes: DashboardTrello (Trello is the source of truth); logic: DashboardModel + WorkOS (pure).
 * Keys: 1-4 section · C capture · J/K move · A accept · B backlog · X cancel (Triage).
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
    { key: 'ingest', label: 'Capture', icon: 'inbox', hint: '1' },
    { key: 'triage', label: 'Triage', icon: 'circle-arrow-down', hint: '2' },
    { key: 'orchestrator', label: 'Orchestrateur', icon: 'calendar-event', hint: '3' },
    { key: 'today', label: 'Aujourd’hui', icon: 'sun', hint: '4' },
  ];
  var URGENCIES = [
    ['aucun', 'Aucune'],
    ['bientot', 'Bientôt'],
    ['assez-vite', 'Assez vite'],
    ['vite', 'Vite'],
    ['au-plus-vite', 'Au plus vite'],
  ];
  var ESTIMATES = [0, 15, 30, 60, 120, 240];
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

  function skeleton() {
    var rows = '';
    for (var i = 0; i < 5; i++) rows += '<div class="db-skel db-skel--row"></div>';
    return '<div class="db-root" aria-busy="true"><div class="db-side"></div><div class="db-main">' + rows + '</div></div>';
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

    if (triage) {
      items.push({ id: 'accept', label: 'Accepter', icon: 'check', group: 'Trier', hint: 'A' });
      items.push({ id: 'backlog', label: 'Backlog', icon: 'circle-dashed', group: 'Trier', hint: 'B' });
    }
    if (open) {
      items.push({ id: 'reference', label: 'Référence', icon: 'bookmark', group: 'Trier' });
      var names = ctx.waitingNames || [];
      var waitKids = names.map(function (n) {
        return { id: 'wait:' + n, label: n, icon: 'user', checked: row.waiting === n };
      });
      if (triage) waitKids.push({ id: 'wait:', label: names.length ? 'Autre…' : 'Choisir…', icon: 'pencil' });
      if (waitKids.length) items.push({ id: 'waiting', label: 'En attente', icon: 'hourglass', group: 'Trier', children: waitKids });
      items.push({ id: 'someday', label: 'Un jour', icon: 'calendar-off', group: 'Trier' });
    }
    if (triage) items.push({ id: 'cancel', label: 'Annuler', icon: 'circle-x', group: 'Trier', hint: 'X', danger: true });
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
      section: 'ingest',
      lists: [],
      rows: [],
      projects: [],
      places: {},
      selected: null, // triage selection (card id)
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
      draftHtml: '', // capture editor content, kept across section switches
      files: {}, // pending attachments of the capture editor: id → { file, thumb }
      authOk: true,
      landed: false, // first load decides the landing section once
      composer: null, // orchestrator column open for a new task ('pool', 'cal:ISO', 'vague:id')
      composerText: '',
    };
    var statusTimer = null;
    var reloadTimer = null;
    var today = todayIso();

    root.innerHTML = '';
    var els = {
      side: h('nav', { class: 'db-side', 'aria-label': 'Dashboard' }),
      main: h('main', { class: 'db-main' }),
      status: h('div', { class: 'db-status' }),
    };
    var shell = h('div', { class: 'db-root', tabindex: '-1' }, [els.side, h('div', { class: 'db-col' }, [els.main, els.status])]);
    root.appendChild(shell);

    /* ── Status ────────────────────────────────────────────────────── */
    function setStatus(msg, kind, keepMs) {
      state.status = msg || '';
      state.statusKind = kind || '';
      els.status.className = 'db-status' + (kind ? ' is-' + kind : '');
      els.status.textContent = '';
      if (kind === 'ok') els.status.appendChild(icon('check'));
      if (kind === 'busy') els.status.appendChild(icon('refresh', 'db-spin'));
      if (kind === 'error') els.status.appendChild(icon('alert-triangle'));
      els.status.appendChild(document.createTextNode(msg || ''));
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
      var c = DM().counts(state.rows, today);
      els.side.textContent = '';
      SECTIONS.forEach(function (s) {
        var n = s.key === 'triage' ? c.triage : s.key === 'orchestrator' ? c.orchestrator : s.key === 'today' ? c.today : 0;
        els.side.appendChild(h('button', {
          class: 'db-nav' + (state.section === s.key ? ' is-on' : ''),
          type: 'button',
          title: s.label + ' (' + s.hint + ')',
          onclick: function () { go(s.key); },
        }, [
          icon(s.icon),
          h('span', { class: 'db-nav-label', text: s.label }),
          n ? h('span', { class: 'db-badge', text: String(n) }) : null,
        ]));
      });
      els.side.appendChild(h('div', { class: 'db-side-foot' }, [
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
      ]));
    }

    function go(key) {
      state.section = key;
      render();
      if (key === 'ingest') {
        var ta = els.main.querySelector('.db-capture');
        if (ta) ta.focus();
      }
    }

    /* ── Shared row pieces ─────────────────────────────────────────── */
    function statusIcon(row) {
      var l = state.lists.filter(function (x) { return x.id === row.listId; })[0];
      var i = icon(l ? l.icon : 'circle-dotted', 'db-st');
      if (l) i.style.color = l.color;
      return i;
    }

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
      write(DT().saveEstimate(t, row.id, minutes));
      render();
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
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function') return;
          var r = chip.getBoundingClientRect();
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

    function typedField(label) {
      var el = els.main.querySelector('[aria-label="' + label + '"]');
      return el ? String(el.value || '').replace(/\s+/g, ' ').trim() : '';
    }

    function advanceSelection(row) {
      if (!row || state.selected !== row.id) return;
      var q = DM().triageQueue(state.rows);
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

    function exitMove(row, cats, label, withStep) {
      var list = DT().listFor(state.lists, cats);
      if (!list) return setStatus('Aucune liste « ' + label + ' » : définissez les Statuts du tableau.', 'error');
      var step = withStep && state.selected === row.id ? typedField('Prochaine action') : '';
      advanceSelection(row);
      applyList(row, list);
      var job = step && DT().saveNextStep ? DT().saveNextStep(t, row.id, step) : Promise.resolve();
      write(Promise.resolve(job).then(function () { return DT().moveToCategory(t, row, state.lists, cats); }));
      setStatus('« ' + row.name + ' » → ' + list.name, 'ok');
      render();
    }

    function exitCancel(row) {
      advanceSelection(row);
      state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
      write(DT().cancel(t, row, state.lists));
      setStatus('« ' + row.name + ' » annulée', 'ok');
      render();
    }

    function exitReference(row) {
      advanceSelection(row);
      state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
      write(DT().fileReference(t, row).then(function () { return DT().cancel(t, row, state.lists); }));
      setStatus('« ' + row.name + ' » dans Références', 'ok');
      render();
    }

    function exitWait(row, name) {
      var list = DT().listFor(state.lists, ['backlog', 'unstarted']);
      if (!list) return setStatus('Aucune liste « Backlog » : définissez les Statuts du tableau.', 'error');
      advanceSelection(row);
      row.waiting = name;
      applyList(row, list);
      write(DT().setWaiting(t, row, state.lists, name));
      setStatus('En attente de ' + name, 'ok');
      render();
    }

    function exitSomeday(row) {
      var list = DT().listFor(state.lists, ['backlog', 'unstarted']);
      if (!list) return setStatus('Aucune liste « Backlog » : définissez les Statuts du tableau.', 'error');
      advanceSelection(row);
      row.dueVague = 'eventuellement';
      row.due = '';
      row.start = '';
      row.dueMode = 'vague';
      applyList(row, list);
      write(DT().setSomeday(t, row, state.lists));
      setStatus('Un jour', 'ok');
      render();
    }

    function exitComplete(row, done) {
      row.dueDone = !!done;
      write(DT().complete(t, row, state.lists, !!done));
      setStatus(done ? '« ' + row.name + ' » terminée' : '« ' + row.name + ' » rouverte', 'ok');
      render();
    }

    function exitArchive(row) {
      advanceSelection(row);
      state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
      write(global.TableTrello.archiveCard(t, row.id));
      setStatus('« ' + row.name + ' » archivée', 'ok');
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

    function focusWho(row) {
      state.selected = row.id;
      state.section = 'triage';
      render();
      setTimeout(function () {
        var input = els.main.querySelector('[aria-label="En attente de"]');
        if (input) input.focus();
      }, 0);
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
      if (id === 'accept') return exitMove(row, ['unstarted', 'backlog'], 'À faire', true);
      if (id === 'backlog') return exitMove(row, ['backlog', 'unstarted'], 'Backlog', true);
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
      if (id === 'waiting-go' || id === 'wait:') {
        var typed = id === 'waiting-go' ? typedField('En attente de') : '';
        if (!typed) {
          var input = els.main.querySelector('[aria-label="En attente de"]');
          if (input && row && state.section === 'triage' && state.selected === row.id) { input.focus(); return; }
          if (row) focusWho(row);
          return;
        }
        return exitWait(row, typed);
      }
      if (id.indexOf('wait:') === 0) return exitWait(row, id.slice(5));
      if (id.indexOf('plan:') === 0) return plan(row, id.slice(5));
      if (id.indexOf('vague:') === 0) return plan(row, '', id.slice(6));
      if (id.indexOf('urg:') === 0) {
        var uid = id.slice(4);
        var lab = uid;
        URGENCIES.forEach(function (u) { if (u[0] === uid) lab = u[1]; });
        row.urgency = lab;
        write(DT().savePriority(t, row.id, { empressement: uid }));
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

    /* ── 1. Ingest (rich capture) ──────────────────────────────────── */
    var attSeq = 0;

    function escHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function sizeLabel(n) {
      return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
    }

    /** Inline chip for a pasted / dropped file; `data-aid` links it to state.files. */
    function chipHtml(aid, att) {
      var visual = att.thumb
        ? '<img class="db-att-img" alt="" src="' + escHtml(att.thumb) + '">'
        : '<i class="ti ti-' + (att.file.type === 'application/pdf' ? 'file-type-pdf' : 'file') + '"></i>';
      return (
        '<span class="db-att" contenteditable="false" data-aid="' + aid + '" title="' + escHtml(att.file.name) + '">' +
        visual +
        '<span class="db-att-name">' + escHtml(att.file.name) + '</span>' +
        '<span class="db-att-size">' + sizeLabel(att.file.size) + '</span>' +
        '<button class="db-att-x" type="button" tabindex="-1" aria-label="Retirer">×</button></span>'
      );
    }

    function addFile(file) {
      if (file.size > DM().MAX_FILE_BYTES) {
        setStatus('« ' + file.name + ' » dépasse 10 Mo (limite de Trello).', 'error', 5000);
        return null;
      }
      var aid = 'a' + ++attSeq;
      var isImg = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(file.type);
      var att = { file: file, thumb: isImg && global.URL && URL.createObjectURL ? URL.createObjectURL(file) : '' };
      if (!file.name || file.name === 'image.png') {
        var d = new Date();
        var stamp = ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2);
        var ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        try { att.file = new File([file], 'Capture ' + stamp + '.' + ext, { type: file.type }); } catch (e) { /* keep the original name */ }
      }
      state.files[aid] = att;
      return chipHtml(aid, att);
    }

    function dropFile(aid) {
      var att = state.files[aid];
      if (att && att.thumb) try { URL.revokeObjectURL(att.thumb); } catch (e) { /* ignore */ }
      delete state.files[aid];
    }

    /** Editor content → Markdown, each chip replaced by its ⟦id⟧ token (DocsModel.domToMd does the formatting). */
    function editorMarkdown(ed) {
      var clone = ed.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('.db-att'), function (c) {
        c.replaceWith(document.createTextNode(' ' + DM().captureToken(c.getAttribute('data-aid')) + ' '));
      });
      return global.DocsModel.domToMd(clone);
    }

    function captureTasks(ed) {
      var names = {};
      Object.keys(state.files).forEach(function (k) { names[k] = state.files[k].file.name; });
      return DM().parseCapture(editorMarkdown(ed), names).map(function (task) {
        task.files = task.aids.map(function (id) { return state.files[id] && state.files[id].file; }).filter(Boolean);
        return task;
      });
    }

    function renderIngest() {
      var recent = DM().triageQueue(state.rows).slice(-5).reverse();
      var DOCS = global.DocsModel;
      var ed = h('div', {
        class: 'db-capture',
        contenteditable: 'true',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Capture',
        'data-placeholder': 'Une tâche par ligne…',
        spellcheck: 'true',
      });
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* browser default separator */ }
      ed.innerHTML = state.draftHtml || '';
      var count = h('span', { class: 'db-muted' });
      function refresh() {
        var empty = !ed.textContent.trim() && !ed.querySelector('.db-att, img');
        ed.classList.toggle('is-empty', empty);
        state.draftHtml = empty ? '' : ed.innerHTML;
        var found = empty ? [] : captureTasks(ed);
        var n = found.length;
        var dated = found.filter(function (x) { return x.due; }).length;
        count.textContent = n ? n + (n > 1 ? ' tâches' : ' tâche') + (dated ? ' · ' + dated + ' avec échéance' : '') : '';
      }
      function insertHtml(html) {
        ed.focus();
        document.execCommand('insertHTML', false, html);
        refresh();
      }
      function paste(e) {
        var cd = e.clipboardData;
        if (!cd) return;
        var files = Array.prototype.slice.call(cd.files || []);
        if (files.length) {
          e.preventDefault();
          insertHtml(files.map(addFile).filter(Boolean).join(''));
          return;
        }
        var html = cd.getData('text/html');
        var text = cd.getData('text/plain');
        if (!html && !text) return;
        e.preventDefault();
        var out;
        if (html && DOCS) {
          // Same sanitizer as the Documents editor: HTML → Markdown → whitelisted HTML (bold, italic, links, lists...).
          out = DOCS.mdToHtml(DOCS.domToMd(new DOMParser().parseFromString(html, 'text/html').body));
          var single = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/.exec(out);
          if (single) out = single[1];
        } else {
          var lines = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
          // One line stays inline (the caret remains on it, so a file pasted next joins this task).
          out = lines.length === 1 ? escHtml(lines[0]) : lines.map(function (l) { return '<p>' + escHtml(l) + '</p>'; }).join('');
        }
        insertHtml(out);
      }
      function submit() {
        var tasks = captureTasks(ed);
        if (!tasks.length || state.busy) return;
        if (!hasTriage()) return setStatus('Créez d’abord la boîte de triage (bandeau ci-dessus).', 'error', 5000);
        state.busy = true;
        var nFiles = tasks.reduce(function (n, x) { return n + x.files.length; }, 0);
        setStatus(nFiles ? 'Création et envoi des pièces jointes…' : 'Création…', 'busy');
        DT().ingest(t, tasks, state.lists).then(function (res) {
          state.busy = false;
          Object.keys(state.files).forEach(dropFile);
          state.draftHtml = '';
          var msg = tasks.length + (tasks.length > 1 ? ' tâches ajoutées' : ' tâche ajoutée') + ' dans « ' + res.list.name + ' »';
          if (res.failed && res.failed.length) setStatus(msg + ' (échec : ' + res.failed.join(', ') + ')', 'error');
          else setStatus(msg, 'ok');
          return reload({ quiet: true });
        }, function (err) { state.busy = false; fail(err); });
      }
      function askAI() {
        var text = ed.innerText.trim();
        var AI = global.KanbanAI;
        if (!text || state.busy) return;
        if (!AI) return setStatus('IA indisponible', 'error');
        state.busy = true;
        setStatus('IA en cours…', 'busy');
        AI.run(t, { text: 'Crée une tâche par élément (sépare le texte en tâches distinctes), dans la liste de triage : ' + text, rows: state.rows, lists: state.lists }).then(function (res) {
          state.busy = false;
          if (res.applied.length) { state.draftHtml = ''; Object.keys(state.files).forEach(dropFile); }
          setStatus(res.applied.length ? 'IA : ' + res.applied.join(', ') : res.message || 'Rien à créer.', res.applied.length ? 'ok' : 'error', 6000);
          return reload({ quiet: true });
        }, function (err) { state.busy = false; fail(err); });
      }
      function format(cmd) {
        ed.focus();
        document.execCommand(cmd);
        refresh();
      }
      var picker = h('input', {
        type: 'file',
        multiple: true,
        hidden: true,
        onchange: function (e) {
          var html = Array.prototype.map.call(e.target.files, addFile).filter(Boolean).join('');
          e.target.value = '';
          if (html) insertHtml(html);
        },
      });

      ed.addEventListener('input', refresh);
      ed.addEventListener('paste', paste);
      ed.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
      });
      ed.addEventListener('click', function (e) {
        var x = e.target.closest && e.target.closest('.db-att-x');
        if (!x) return;
        var chip = x.closest('.db-att');
        dropFile(chip.getAttribute('data-aid'));
        chip.remove();
        refresh();
      });
      ed.addEventListener('dragover', function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); ed.classList.add('is-drop'); }
      });
      ed.addEventListener('dragleave', function () { ed.classList.remove('is-drop'); });
      ed.addEventListener('drop', function (e) {
        ed.classList.remove('is-drop');
        var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
        if (!files.length) return;
        e.preventDefault();
        insertHtml(files.map(addFile).filter(Boolean).join(''));
      });

      function tool(iconName, title, fn) {
        return h('button', { class: 'db-icon-btn', type: 'button', title: title, 'aria-label': title, onmousedown: function (e) { e.preventDefault(); }, onclick: fn }, [icon(iconName)]);
      }
      refresh();
      els.main.appendChild(h('div', { class: 'db-page' }, [
        pageHead('Capture'),
        hasTriage() ? null : inboxBanner(),
        h('div', { class: 'db-card' }, [
          ed,
          h('div', { class: 'db-actions' }, [
            tool('bold', 'Gras (Ctrl+B)', function () { format('bold'); }),
            tool('italic', 'Italique (Ctrl+I)', function () { format('italic'); }),
            tool('paperclip', 'Joindre des fichiers', function () { picker.click(); }),
            picker,
            count,
            h('span', { class: 'db-spacer' }),
            h('button', { class: 'db-btn', type: 'button', onclick: askAI }, [icon('sparkles'), document.createTextNode('Demander à l’IA')]),
            h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: submit }, [icon('plus'), document.createTextNode('Ajouter'), h('kbd', { text: 'Ctrl+↵' })]),
          ]),
        ]),
        recent.length ? h('div', { class: 'db-section-title', text: 'Derniers ajouts' }) : null,
        recent.length ? h('div', { class: 'db-list' }, recent.map(function (r) {
          return h('div', { class: 'db-row', 'data-card': r.id, onclick: function () { state.selected = r.id; go('triage'); } }, [statusIcon(r), h('span', { class: 'db-row-name', text: r.name })]);
        })) : null,
      ]));
      setTimeout(function () { ed.focus(); }, 0);
    }

    function pageHead(title, sub, right) {
      return h('header', { class: 'db-head' }, [
        h('div', {}, [h('h1', { class: 'db-title', text: title }), sub ? h('p', { class: 'db-sub', text: sub }) : null]),
        right || null,
      ]);
    }

    /* ── 2. Triage ─────────────────────────────────────────────────── */
    function renderTriage() {
      var q = DM().triageQueue(state.rows);
      if (!q.length) {
        els.main.appendChild(h('div', { class: 'db-page' }, [
          pageHead('Triage', 'Rien à trier.'),
          hasTriage() ? null : inboxBanner(),
          h('div', { class: 'db-empty' }, [icon('inbox'), h('p', { text: hasTriage() ? 'Boîte de triage vide. Bien joué.' : 'Aucune liste de triage sur ce tableau.' }),
            h('button', { class: 'db-btn', type: 'button', onclick: function () { go('ingest'); } }, [icon('plus'), document.createTextNode('Capturer des tâches')])]),
        ]));
        return;
      }
      var sel = q.filter(function (r) { return r.id === state.selected; })[0] || q[0];
      state.selected = sel.id;
      var list = h('div', { class: 'db-list db-triage-list' }, q.map(function (r) {
        return h('div', { class: 'db-row' + (r.id === sel.id ? ' is-sel' : ''), 'data-id': r.id, 'data-card': r.id, onclick: function () { state.selected = r.id; render(); } }, [
          statusIcon(r), h('span', { class: 'db-row-name', text: r.name }), prioBadge(r),
        ]);
      }));
      els.main.appendChild(h('div', { class: 'db-page db-page--split' }, [
        h('div', { class: 'db-split-l' }, [pageHead('Triage', q.length + (q.length > 1 ? ' cartes à définir' : ' carte à définir')), list]),
        h('div', { class: 'db-split-r' }, [triageDetail(sel)]),
      ]));
    }

    function triageDetail(row) {
      var nextStep = h('input', {
        class: 'db-input',
        type: 'text',
        placeholder: 'Prochaine action',
        'aria-label': 'Prochaine action',
        onkeydown: function (e) { e.stopPropagation(); },
      });
      var who = h('input', {
        class: 'db-input',
        type: 'text',
        placeholder: 'Qui ?',
        'aria-label': 'En attente de',
        onkeydown: function (e) { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
      });
      var impact = h('input', { type: 'range', min: '0', max: '10', step: '1', value: String(row.impact == null ? 5 : row.impact), 'aria-label': 'Impact' });
      var impactVal = h('span', { class: 'db-muted', text: impact.value });
      impact.addEventListener('input', function () { impactVal.textContent = impact.value; });
      impact.addEventListener('change', function () {
        row.impact = Number(impact.value);
        write(DT().savePriority(t, row.id, { impact: row.impact }));
      });
      var urgency = h('select', {
        class: 'db-select',
        'aria-label': 'Urgence',
        onchange: function (e) { row.urgency = e.target.selectedOptions[0].textContent; write(DT().savePriority(t, row.id, { empressement: e.target.value })); },
      }, URGENCIES.map(function (u) { return h('option', { value: u[0], selected: row.urgency === u[1], text: u[1] }); }));
      var est = h('select', {
        class: 'db-select',
        'aria-label': 'Estimation',
        onchange: function (e) { row.estimate = Number(e.target.value); write(DT().saveEstimate(t, row.id, row.estimate)); },
      }, ESTIMATES.map(function (m) { return h('option', { value: String(m), selected: (row.estimate || 0) === m, text: m ? DM().formatMinutes(m) : 'Non estimée' }); }));
      var date = h('input', {
        class: 'db-date',
        type: 'date',
        value: row.due || '',
        'aria-label': 'Jour prévu',
        onchange: function (e) {
          var iso = e.target.value;
          row.due = iso; row.start = iso;
          write(DT().planDay(t, row.id, iso));
          renderSide();
        },
      });
      return h('div', { class: 'db-detail', 'data-card': row.id }, [
        h('div', { class: 'db-detail-head' }, [
          statusIcon(row),
          h('input', {
            class: 'db-name',
            type: 'text',
            value: row.name,
            'aria-label': 'Titre',
            onkeydown: function (e) { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
            onchange: function (e) {
              var v = e.target.value.trim();
              if (!v) { e.target.value = row.name; return; }
              row.name = v;
              write(global.TableTrello.saveName(t, row.id, v));
            },
          }),
          h('button', { class: 'db-icon-btn', type: 'button', title: 'Ouvrir la carte', onclick: function () { openCard(row); } }, [icon('external-link')]),
        ]),
        field('Impact', h('div', { class: 'db-range' }, [impact, impactVal])),
        field('Urgence', urgency),
        field('Estimation', est),
        field('Jour prévu', date),
        h('div', { class: 'db-actions db-actions--exits' }, [nextStep, who]),
        h('div', { class: 'db-actions db-actions--detail' }, [
          h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { perform(row, 'accept'); } }, [icon('check'), document.createTextNode('Accepter'), h('kbd', { text: 'A' })]),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { perform(row, 'backlog'); } }, [icon('circle-dashed'), document.createTextNode('Backlog'), h('kbd', { text: 'B' })]),
          h('button', { class: 'db-btn db-btn--danger', type: 'button', onclick: function () { perform(row, 'cancel'); } }, [icon('circle-x'), document.createTextNode('Annuler'), h('kbd', { text: 'X' })]),
        ]),
        h('div', { class: 'db-actions db-actions--exits' }, [
          h('button', { class: 'db-btn', type: 'button', onclick: function () { perform(row, 'reference'); } }, [icon('file-text'), document.createTextNode('Référence')]),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { perform(row, 'waiting-go'); } }, [icon('hourglass'), document.createTextNode('En attente')]),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { perform(row, 'someday'); } }, [icon('calendar-off'), document.createTextNode('Un jour')]),
        ]),
      ]);
    }

    function field(label, control) {
      return h('label', { class: 'db-field' }, [h('span', { class: 'db-field-l', text: label }), control]);
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
      var writePlan = DT().planAt
        ? DT().planAt(t, row.id, iso, vague || '', hhmm)
        : DT().planDay(t, row.id, iso);
      write(writePlan);
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
      var buckets = DM().horizonPlan(state.rows, planFrom, scale, state.capacity, vagueOptions(), nowM);
      var pool = DM().unplanned(state.rows);
      if (manual && scale !== 'vague' && DM().untimed) pool = pool.concat(DM().untimed(state.rows, today));
      var moves = manual ? [] : (scale === 'day'
        ? DM().autoPlan(state.rows, today, HORIZON, state.capacity)
        : DM().placeAuto(state.rows, today, scale, state.capacity, vagueOptions()));
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
            placeholder: 'Nouvelle tâche…',
            'aria-label': 'Nouvelle tâche',
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
        }, [icon('plus'), h('span', { text: 'Nouvelle tâche' })]);
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
      var tasks = DM().todayList(state.rows, today);
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
      var next = DM().nextAction(state.rows, today);
      var sugg = DM().suggestions(state.rows, today, 5);
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
        ? WO().review(state.rows, { today: today, wipCap: WO().DEFAULT_WIP, projects: state.projects || [] })
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
      els.main.textContent = '';
      renderSide();
      if (state.section === 'ingest') renderIngest();
      else if (state.section === 'triage') renderTriage();
      else if (state.section === 'orchestrator') renderOrchestrator();
      else renderToday();
      els.main.scrollTop = keepScroll;
      var bodies = els.main.querySelectorAll('.db-col-body');
      for (var i = 0; i < bodies.length && i < colScroll.length; i++) bodies[i].scrollTop = colScroll[i];
      var daysNow = els.main.querySelector('.db-board-days');
      if (holdDays && daysNow) daysNow.scrollLeft = daysScroll;
      if (state.section === 'orchestrator' && state.composer != null) {
        var addInput = els.main.querySelector('.db-add-input');
        if (addInput && document.activeElement !== addInput) addInput.focus({ preventScroll: true });
      }
    }

    shell.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var k = e.key.toLowerCase();
      var idx = '1234'.indexOf(k);
      if (idx >= 0 && k.length === 1) { e.preventDefault(); return go(SECTIONS[idx].key); }
      if (k === 'c') { e.preventDefault(); return go('ingest'); }
      if (state.section !== 'triage') return;
      var q = DM().triageQueue(state.rows);
      var i = q.map(function (r) { return r.id; }).indexOf(state.selected);
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (q[i + 1]) { state.selected = q[i + 1].id; render(); } }
      else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (q[i - 1]) { state.selected = q[i - 1].id; render(); } }
      else if (k === 'a' || k === 'b' || k === 'x') {
        e.preventDefault();
        var cls = k === 'a' ? '.db-btn--primary' : k === 'x' ? '.db-btn--danger' : '.db-actions--detail .db-btn:nth-child(2)';
        var btn = els.main.querySelector('.db-actions--detail ' + cls) || els.main.querySelector(cls);
        if (btn) btn.click();
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
        root.innerHTML = skeleton();
      }
      return Promise.all([DT().load(t), loadChain()]).then(function (res) {
        if (!root.contains(shell)) { root.innerHTML = ''; root.appendChild(shell); }
        state.lists = res[0].lists;
        state.rows = res[0].rows;
        var goals = res[1][0] || { nodes: [], links: [] };
        var objectifs = (res[1][1] && res[1][1][0]) || [];
        var metrics = (res[1][1] && res[1][1][1]) || [];
        state.projects = WO() ? WO().projectChain(goals, state.rows, metrics, objectifs) : [];
        state.places = WO() ? WO().places(goals) : {};
        // Opening the Dashboard with work due answers "what now?" straight away; otherwise stay on Capture.
        if (!state.landed) {
          state.landed = true;
          if (DM().todayList(state.rows, today).length) state.section = 'today';
        }
        render();
      }).catch(function (err) {
        root.innerHTML = '';
        root.appendChild(h('div', { class: 'db-loading', text: 'Impossible de charger le Dashboard : ' + (err && err.message) }));
      });
    }

    // Linear-style keys on a triage row: S statut, P urgence, D échéance, C nouvelle carte (shared with Tableau and Kanban).
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: t,
        hoverSelector: '.db-row[data-id]',
        idOf: function (el) { return el.getAttribute('data-id'); },
        selectedId: function () { return state.selected || ''; },
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
          setStatus('Enregistrement…', 'busy');
          global.LinearKeys.saveUrgency(t, row.id, urgencyId).then(function () {
            setStatus('Urgence modifiée', 'ok');
            return reload({ quiet: true });
          }, fail);
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

  global.DashboardUI = { mount: mount, skeleton: skeleton, menuEntries: menuEntries, pageEntries: pageEntries };
})(typeof window !== 'undefined' ? window : this);
