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

  var S = (global.DashboardUiParts = global.DashboardUiParts || {});

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
    var M = Object.create(null);
    M.root = root;
    M.t = t;
    var __parts = (global.DashboardUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.DashboardUI = { mount: mount, menuEntries: menuEntries, pageEntries: pageEntries, dueChoices: dueChoices, dayLabel: dayLabel };

  // shared with the mount parts
  S.DAYS_FR = DAYS_FR;
  S.DM = DM;
  S.DT = DT;
  S.HORIZON = HORIZON;
  S.ME = ME;
  S.OWNER_TYPE = OWNER_TYPE;
  S.PB = PB;
  S.QUICK_ESTIMATES = QUICK_ESTIMATES;
  S.SCALE_ICON = SCALE_ICON;
  S.SECTIONS = SECTIONS;
  S.TM = TM;
  S.URGENCIES = URGENCIES;
  S.WO = WO;
  S.clockLabel = clockLabel;
  S.dayIconName = dayIconName;
  S.dayLabel = dayLabel;
  S.dueChoices = dueChoices;
  S.h = h;
  S.icon = icon;
  S.isWeekend = isWeekend;
  S.menuEntries = menuEntries;
  S.mount = mount;
  S.pageEntries = pageEntries;
  S.todayIso = todayIso;
})(typeof window !== 'undefined' ? window : this);
