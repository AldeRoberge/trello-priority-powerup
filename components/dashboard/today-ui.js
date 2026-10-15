/*
 * Role: the Aujourd'hui page of the Dashboard.
 *   Hero      greeting, how the day stands, and the weather (sky, now, next hours, next days)
 *   À faire   what to do now, late work, today's tasks, quick add, work worth pulling in, the revue
 *   Planning  the day on a clock: tasks with a time sit at that time, the others are laid out from now
 *             (dashed) and become real with "Planifier ma journée". Drag to move, drag the bottom edge to
 *             resize, click an empty hour to add a task there.
 * Logic is in TodayModel (pure); the weather in Weather / WeatherUI. Every write goes through the helpers
 * dashboard-ui.js hands over (`api`), so the right-click menu, undo and Trello writes stay in one place.
 * Exposes window.TodayUI.create(api) → { render(container) }. Styles: today-ui.css (prefix td-).
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ZOOMS = [44, 56, 72, 96, 128]; // pixels per hour of the timeline
  var DEFAULT_ZOOM = 2;
  var MIN_BLOCK_PX = 26;
  var DROP_STEP = 5; // minutes: where a drop or a resize lands
  var CLICK_STEP = 15; // minutes: where a click on an empty hour lands
  var PRIO_COLORS = ['#c9372c', '#e2740b', '#b38600', '#5e6ad2'];
  var KEYS = { zoom: 'tp-today-zoom', week: 'tp-today-week', sugg: 'tp-today-sugg' };

  function TM() { return global.TodayModel; }
  function DM() { return global.DashboardModel; }
  function WX() { return global.Weather; }
  function WUI() { return global.WeatherUI; }
  function WO() { return global.WorkOS; }

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

  function text(s) {
    return document.createTextNode(s);
  }

  function remember(key, value) {
    try { global.localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable: kept for this session only */ }
  }

  function recall(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  function plural(n, one, many) {
    return n + ' ' + (n > 1 ? many : one);
  }

  /** Ring of the day in the hero: how much of today's work is done. */
  function doneRing(done, total) {
    var c = 2 * Math.PI * 14;
    var pct = total ? Math.min(1, done / total) : 0;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('class', 'td-donering');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="4"/>' +
      '<circle cx="18" cy="18" r="14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" transform="rotate(-90 18 18)" ' +
      'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - pct)).toFixed(2) + '"/>';
    return svg;
  }

  function accentOf(row) {
    return row && row.tierI != null ? PRIO_COLORS[Math.min(row.tierI, PRIO_COLORS.length - 1)] : '';
  }

  function create(api) {
    var ui = {
      zoom: Math.max(0, Math.min(ZOOMS.length - 1, parseInt(recall(KEYS.zoom), 10) || DEFAULT_ZOOM)),
      week: recall(KEYS.week) === '1',
      sugg: recall(KEYS.sugg), // '1' open, '0' closed, null: open only when the day is light
      listScroll: 0,
      planScroll: null, // null: scroll to the clock on the next render
      compose: null, // { at, text } while a task is typed on the timeline
      refocusAdd: false,
      drag: null,
      resizing: false,
      root: null,
      heroEl: null,
      wxLayer: null,
      day: null,
      now: new Date(),
      nowMin: 0,
      today: '',
      scale: null,
      flowKey: -1,
      prevOpen: null,
      name: '',
      nameAsked: false,
      started: false,
      blockById: {},
    };

    /* ── Things that live longer than one render ──────────────────── */

    function isBusy() {
      var a = document.activeElement;
      var typing = a && ui.root && ui.root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      var menu = document.querySelector('.tp-context-menu, .wx-pop');
      var fields = global.CardFields && typeof global.CardFields.isOpen === 'function' && global.CardFields.isOpen();
      return !!(typing || ui.drag || ui.resizing || menu || fields);
    }

    function start() {
      if (ui.started) return;
      ui.started = true;
      WX().subscribe(function () {
        repaintHero();
        repaintGutter();
      });
      setInterval(tick, 30000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) tick();
      });
      if (global.HideDone && typeof global.HideDone.subscribe === 'function') {
        global.HideDone.subscribe(function () {
          if (api.section() === 'today') api.rerender();
        });
      }
    }

    function askName() {
      if (ui.nameAsked) return;
      ui.nameAsked = true;
      var profile = global.UserProfile && typeof global.UserProfile.load === 'function'
        ? Promise.resolve(global.UserProfile.load(api.t)).catch(function () { return null; })
        : Promise.resolve(null);
      profile.then(function (p) {
        var n = TM().firstName(p && p.displayName);
        if (n) return n;
        var PT = global.PriorityTrello;
        if (!PT || typeof PT.getCurrentMember !== 'function') return '';
        return Promise.resolve(PT.getCurrentMember(api.t)).then(function (m) { return TM().firstName(m && m.fullName); });
      }).then(function (n) {
        if (n && n !== ui.name) {
          ui.name = n;
          repaintHero();
        }
      }, function () { /* the greeting works without a name */ });
    }

    /** Every 30 s: slide the clock line; every 5 min (when nothing is being edited) refresh the projected plan. */
    function tick() {
      if (!ui.root || !ui.root.isConnected || api.section() !== 'today') return;
      var d = new Date();
      var nowMin = d.getHours() * 60 + d.getMinutes();
      var key = Math.floor(nowMin / TM().STEP);
      var dayChanged = DM().isoOf(d) !== ui.today;
      if ((dayChanged || key !== ui.flowKey) && !isBusy()) {
        api.rerender();
        return;
      }
      ui.nowMin = nowMin;
      moveClock();
      WX().refresh();
    }

    function moveClock() {
      if (!ui.root || !ui.scale) return;
      var line = ui.root.querySelector('.td-now');
      var past = ui.root.querySelector('.td-past');
      var inside = ui.nowMin >= ui.scale.from && ui.nowMin <= ui.scale.to;
      if (line) {
        line.style.top = ui.scale.yOf(ui.nowMin) + 'px';
        line.hidden = !inside;
        var label = line.querySelector('.td-now-t');
        if (label) label.textContent = TM().fmtClock(ui.nowMin);
      }
      if (past) past.style.height = ui.scale.yOf(ui.nowMin) + 'px';
    }

    function findRow(id) {
      var rows = api.state().rows;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
      return null;
    }

    function nextMonday(today) {
      var d = new Date(today + 'T00:00:00');
      return DM().addDays(today, (8 - d.getDay()) % 7 || 7);
    }

    /* ── Hero: greeting, how the day stands, weather ──────────────── */

    function buildPills(day) {
      var s = day.stats;
      var pills = [];
      if (s.total) {
        pills.push(h('span', { class: 'td-pill', title: s.done + ' sur ' + s.total + ' faites aujourd’hui' }, [
          doneRing(s.done, s.total),
          h('b', { text: s.done + ' sur ' + s.total }),
          h('small', { text: 'faites' }),
        ]));
      }
      var cap = api.capChip(s.minutes);
      cap.classList.add('td-pill', 'td-pill--btn');
      cap.insertBefore(icon('clock'), cap.firstChild);
      pills.push(cap);
      if (s.overdue) {
        pills.push(h('button', {
          class: 'td-pill td-pill--btn td-pill--late',
          type: 'button',
          title: 'Aller aux tâches en retard',
          onclick: function () {
            var g = ui.root && ui.root.querySelector('.td-group--late');
            if (g && g.scrollIntoView) g.scrollIntoView({ block: 'start', behavior: 'smooth' });
          },
        }, [icon('alert-circle'), h('b', { text: String(s.overdue) }), h('small', { text: 'en retard' })]));
      }
      return h('div', { class: 'td-pills' }, pills);
    }

    function buildHello() {
      var title = TM().hello(ui.now) + (ui.name ? ', ' + ui.name : '');
      return h('div', { class: 'td-hello' }, [
        h('div', { class: 'td-date', text: 'Aujourd’hui · ' + TM().dayTitle(ui.today) }),
        h('h1', { class: 'td-title', text: title }),
        h('p', { class: 'td-line', text: TM().headline(ui.day.stats) }),
        buildPills(ui.day),
      ]);
    }

    function openPlacePicker(anchor) {
      WUI().placePicker(anchor, { onPick: function (p) { WX().setPlace(p); } });
    }

    function buildHero() {
      var live = WX().current();
      var model = live.model;
      var d = model ? WX().describe(model.now.code, model.now.isDay) : null;
      var hr = ui.now.getHours();
      var isDay = model ? model.now.isDay : hr >= 7 && hr < 19;
      var scene = d ? d.scene : isDay ? 'clear-day' : 'clear-night';
      return h('header', { class: 'td-hero', 'data-scene': scene }, [
        WUI().sky(scene, isDay),
        h('div', { class: 'td-hero-in' }, [
          buildHello(),
          WUI().panel(live, {
            expanded: ui.week,
            onPlace: openPlacePicker,
            onToggle: function () {
              ui.week = !ui.week;
              remember(KEYS.week, ui.week ? '1' : '0');
              repaintHero();
            },
            onRefresh: function () { WX().refresh({ force: true }); },
          }),
        ]),
      ]);
    }

    function repaintHero() {
      if (!ui.heroEl || !ui.heroEl.isConnected || !ui.day) return;
      var fresh = buildHero();
      ui.heroEl.replaceWith(fresh);
      ui.heroEl = fresh;
    }

    /* ── Rows ─────────────────────────────────────────────────────── */

    function ringButton(row, kind) {
      var done = kind === 'done';
      var blocked = !!row.blocked && !done;
      var pct = done ? 100 : typeof row.progress === 'number' ? Math.max(0, Math.min(100, row.progress)) : 0;
      var title = done ? 'Terminée : cliquer pour rouvrir' : blocked ? 'Bloquée : cliquer pour débloquer' : 'Terminer';
      var inner = global.ProgressRing ? global.ProgressRing.create(pct, blocked) : icon('circle-check');
      return h('button', {
        class: 'td-check',
        type: 'button',
        title: title,
        'aria-label': title + ' « ' + row.name + ' »',
        onclick: function (e) {
          e.stopPropagation();
          if (done) api.reopen(row);
          else if (blocked) api.unblock(row);
          else api.complete(row);
        },
      }, [inner]);
    }

    function timeItems(row) {
      var items = [];
      var timed = !!(row.startTime || row.dueTime);
      if (timed) {
        items.push({ id: 'time:none', label: 'Sans heure', icon: 'clock-off', action: function () { api.plan(row, ui.today, '', ''); } });
      }
      var next = TM().ceilTo(ui.nowMin, DROP_STEP);
      if (next < 22 * 60) {
        items.push({ id: 'time:now', label: 'Maintenant · ' + TM().fmtClock(next), icon: 'player-play', action: function () { api.plan(row, ui.today, '', TM().toClock(next)); } });
      }
      TM().timeSlots().forEach(function (slot) {
        items.push({
          id: 'time:' + slot.hour,
          label: slot.label,
          icon: 'clock',
          children: slot.children.map(function (c) {
            return { id: 'time:' + c.time, label: c.label, icon: 'clock', action: function () { api.plan(row, ui.today, '', c.time); } };
          }),
        });
      });
      return items;
    }

    /** The "heure" column: the hour the card is planned at, or a quiet invitation to set one. */
    function timeChip(row, range) {
      var cls = 'td-timechip' + (range ? ' is-set' : '');
      return api.menuChip(range ? cls : cls + ' is-empty', 'Cliquer pour choisir l’heure', 'calendar-time', range ? TM().fmtClock(range.start) : 'Heure…', function () { return timeItems(row); });
    }

    function prop(name, node) {
      return h('span', { class: 'td-prop td-prop--' + name }, [node]);
    }

    function draggable(el, row, durationOf, explicit) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', function (e) {
        var r = el.getBoundingClientRect();
        ui.drag = { id: row.id, offset: el.classList.contains('td-block') ? e.clientY - r.top : 0, duration: durationOf(), explicit: !!explicit };
        try {
          e.dataTransfer.setData('text/plain', row.id);
          e.dataTransfer.effectAllowed = 'move';
        } catch (err) { /* some browsers refuse; the drag state above is enough */ }
        setTimeout(function () { el.classList.add('is-drag'); }, 0);
        if (ui.root) ui.root.classList.add('is-dragging');
      });
      el.addEventListener('dragend', function () {
        ui.drag = null;
        el.classList.remove('is-drag');
        if (ui.root) ui.root.classList.remove('is-dragging');
        hideDrop();
        var over = ui.root && ui.root.querySelector('.td-scroll.is-drop');
        if (over) over.classList.remove('is-drop');
      });
    }

    /**
     * One task of the list. kind: 'late' | 'today' | 'done' | 'sugg'.
     * Score, hour, estimate, day and the arrow are columns: a missing value keeps its place.
     */
    function taskRow(row, kind) {
      var done = kind === 'done';
      var sugg = kind === 'sugg';
      var blocked = !!row.blocked && !done;
      var range = done || sugg ? null : TM().rowRange(row, ui.today);
      var focus = ui.day.focus && ui.day.focus.row && ui.day.focus.row.id === row.id && !sugg && !done;
      var step = api.stepLine(row);
      var tomorrow = DM().addDays(ui.today, 1);
      var el = h('div', {
        class: 'td-task' + (kind === 'late' ? ' is-late' : '') + (blocked ? ' is-blocked' : '') + (done ? ' is-done' : '') + (focus ? ' is-focus' : ''),
        'data-card': row.id,
      }, [
        sugg ? h('span', { class: 'td-check td-check--none' }) : ringButton(row, kind),
        h('span', { class: 'td-task-main' }, [
          h('span', { class: 'td-task-name', text: row.name, onclick: function () { api.openCard(row); } }),
          step,
          api.placeLine(row),
        ]),
        h('span', { class: 'td-props' }, [
          prop('time', done || sugg ? null : timeChip(row, range)),
          prop('prio', api.prioBadge(row)),
          prop('est', done ? null : api.estChip(row)),
          prop('due', done ? null : sugg
            ? h('button', { class: 'td-btn td-btn--chip', type: 'button', title: 'Faire aujourd’hui', onclick: function () { api.plan(row, ui.today); } }, [icon('sun'), text('Aujourd’hui')])
            : api.dueChip(row)),
          prop('go', done || sugg ? null : h('button', {
            class: 'td-icon',
            type: 'button',
            title: 'Reporter à demain',
            'aria-label': 'Reporter « ' + row.name + ' » à demain',
            onclick: function () { api.plan(row, tomorrow); },
          }, [icon('arrow-curve-right')])),
        ]),
      ]);
      if (!done) draggable(el, row, function () { return DM().estimateOf(row); }, !!(range && range.explicit));
      return el;
    }

    function group(cls, iconName, title, count, rows, extra) {
      var head = h('div', { class: 'td-group-h' }, [
        icon(iconName),
        h('span', { class: 'td-group-t', text: title }),
        h('span', { class: 'td-count', text: String(count) }),
        h('span', { class: 'td-spacer' }),
        extra || null,
      ]);
      var body = h('div', { class: 'td-rows' }, rows);
      return h('section', { class: 'td-group ' + cls }, [head, body]);
    }

    /* ── Now / next ───────────────────────────────────────────────── */

    function focusCard(day) {
      var f = day.focus;
      if (!f) return null;
      var row = f.row;
      var step = WO() && WO().stepState(row);
      var action = step && step.text ? step.text : row.name;
      var tomorrow = DM().addDays(ui.today, 1);
      var label;
      var iconName = 'target-arrow';
      if (f.state === 'now') {
        label = f.block && f.block.kind === 'fixed' ? 'En ce moment · ' + TM().fmtRange(f.block.start, f.block.end) : 'À faire maintenant';
        iconName = 'player-play';
      } else if (f.state === 'soon') {
        label = f.block ? 'Prochaine · ' + TM().fmtClock(f.block.start) + ' (' + TM().inWords(f.minutesTo) + ')' : 'Prochaine action';
      } else if (f.state === 'late') {
        label = 'À rattraper';
      } else {
        label = 'Rien de prévu : je suggère';
        iconName = 'bulb';
      }
      var late = row.due && row.due < ui.today && DM().isOpen(row);
      var kids = [
        h('div', { class: 'td-focus-k' }, [icon(iconName), text(' ' + label)]),
        h('div', { class: 'td-focus-name', text: action, onclick: function () { api.openCard(row); } }),
        step && step.text ? h('div', { class: 'td-focus-card', text: row.name }) : null,
        api.placeLine(row),
        h('div', { class: 'td-focus-meta' }, [
          late ? h('span', { class: 'db-chip is-late' }, [icon('alert-circle'), text('En retard')]) : null,
          api.prioBadge(row),
          api.estChip(row),
          api.dueChip(row),
        ]),
      ];
      if (f.state === 'now' && f.block && f.block.kind === 'fixed') {
        kids.push(h('div', { class: 'td-focus-bar', title: Math.round(f.progress * 100) + ' % du temps prévu écoulé' }, [h('i', { style: 'width:' + Math.round(f.progress * 100) + '%' })]));
      }
      var actions = [];
      if (f.state === 'backlog') {
        actions.push(h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { api.plan(row, ui.today); } }, [icon('sun'), text('Faire aujourd’hui')]));
      } else {
        actions.push(h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { api.complete(row); } }, [icon('circle-check'), text('Terminer')]));
      }
      actions.push(h('button', { class: 'db-btn', type: 'button', onclick: function () { api.openCard(row); } }, [icon('external-link'), text('Ouvrir')]));
      if (f.state !== 'backlog') {
        actions.push(h('button', { class: 'db-btn', type: 'button', title: 'Reporter à demain', onclick: function () { api.plan(row, tomorrow); } }, [icon('arrow-curve-right'), text('Demain')]));
      }
      kids.push(h('div', { class: 'td-focus-actions' }, actions));
      return h('section', { class: 'td-focus is-' + f.state, 'data-card': row.id }, kids);
    }

    /* ── Quick add (list) ─────────────────────────────────────────── */

    function createFromText(raw, time, atDay) {
      var clean = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
      if (!clean) return false;
      var split = TM().splitClock(clean);
      var name = split ? split.name : clean;
      var at = time || (split ? split.time : '');
      var draft = DM().taskDraft(name, atDay || ui.today, api.parse, '', at);
      if (!draft) return false;
      if (at && !draft.time && !draft.vague) draft.time = at;
      api.createHere(draft);
      return true;
    }

    function addLine() {
      var onSubmit = function (title, input) {
        input.value = '';
        ui.refocusAdd = true;
        createFromText(title);
      };
      if (global.AddRow && typeof global.AddRow.line === 'function') {
        var line = global.AddRow.line({ label: global.AddRow.LABEL, onSubmit: onSubmit });
        line.classList.add('td-add');
        return line;
      }
      var input = h('input', { class: 'td-add-input', type: 'text', placeholder: 'Nouvelle carte…', 'aria-label': 'Nouvelle carte', autocomplete: 'off' });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); var v = input.value; input.value = ''; onSubmit(v, input); }
      });
      return h('div', { class: 'td-add' }, [icon('plus'), input]);
    }

    /* ── À planifier ──────────────────────────────────────────────── */

    function suggestions(day) {
      var skip = day.focus && day.focus.state === 'backlog' ? day.focus.row.id : null;
      var list = TM().suggest(api.state().rows, ui.today, 6, skip);
      if (!list.length) return null;
      var open = ui.sugg == null ? day.stats.open < 3 : ui.sugg === '1';
      var head = h('button', {
        class: 'td-group-h td-group-h--btn',
        type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        onclick: function () {
          ui.sugg = open ? '0' : '1';
          remember(KEYS.sugg, ui.sugg);
          api.rerender();
        },
      }, [
        icon('bulb'),
        h('span', { class: 'td-group-t', text: 'À planifier' }),
        h('span', { class: 'td-count', text: String(list.length) }),
        h('span', { class: 'td-spacer' }),
        icon(open ? 'chevron-up' : 'chevron-down', 'td-caret'),
      ]);
      var kids = [head];
      if (open) kids.push(h('div', { class: 'td-rows' }, list.map(function (r) { return taskRow(r, 'sugg'); })));
      return h('section', { class: 'td-group td-group--sugg' }, kids);
    }

    /* ── Left column ──────────────────────────────────────────────── */

    function hideDoneButton(count) {
      var HD = global.HideDone;
      if (!HD) return null;
      var hidden = HD.get();
      return h('button', {
        class: 'td-btn td-btn--quiet' + (hidden ? ' is-on' : '') + (count ? '' : ' is-idle'),
        type: 'button',
        title: HD.title(hidden),
        onclick: function () { HD.set(!hidden); },
      }, [icon(HD.icon(hidden)), h('span', { text: HD.label(hidden, count) })]);
    }

    function buildList(day) {
      var s = day.stats;
      var scroll = h('div', { class: 'td-scroll' });
      var focus = focusCard(day);
      if (focus) scroll.appendChild(focus);

      if (day.overdue.length) {
        var replan = api.menuChip('td-replan', 'Replanifier les tâches en retard', 'calendar-event', 'Replanifier', function () {
          var rows = day.overdue;
          function go(iso, label) {
            return function () {
              api.planMany(rows.map(function (r) { return { id: r.id, date: iso, time: '' }; }), plural(rows.length, 'tâche replanifiée', 'tâches replanifiées') + ' : ' + label);
            };
          }
          var tomorrow = DM().addDays(ui.today, 1);
          return [
            { id: 'rep:today', label: 'À aujourd’hui', icon: 'sun', action: go(ui.today, 'aujourd’hui') },
            { id: 'rep:tomorrow', label: 'À demain', icon: 'arrow-curve-right', action: go(tomorrow, 'demain') },
            { id: 'rep:monday', label: 'À lundi', icon: 'calendar-event', action: go(nextMonday(ui.today), 'lundi') },
          ];
        });
        scroll.appendChild(group('td-group--late', 'alert-circle', 'En retard', day.overdue.length, day.overdue.map(function (r) { return taskRow(r, 'late'); }), replan));
      }

      var todayRows = day.planned.map(function (r) { return taskRow(r, 'today'); });
      if (ui.showDone) day.done.forEach(function (r) { todayRows.push(taskRow(r, 'done')); });
      var body;
      if (!todayRows.length) {
        body = h('div', { class: 'td-empty' }, [
          icon(s.total ? 'circle-check' : 'sun'),
          h('p', { text: s.total ? 'Tout est fait.' : 'Rien de prévu aujourd’hui.' }),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { api.go('orchestrator'); } }, [icon('calendar-event'), text('Ouvrir l’orchestrateur')]),
        ]);
      }
      var g = group('td-group--today', 'sun', 'Aujourd’hui', day.planned.length, todayRows);
      if (body) g.querySelector('.td-rows').appendChild(body);
      g.appendChild(addLine());
      if (global.InsertGap && todayRows.length) {
        global.InsertGap.watch(g.querySelector('.td-rows'), {
          item: '.td-task',
          placeholder: 'Titre…',
          onCreate: function (title) { createFromText(title); },
        });
      }
      scroll.appendChild(g);

      var sugg = suggestions(day);
      if (sugg) scroll.appendChild(sugg);
      var review = api.review();
      if (review) {
        review.classList.add('td-review');
        scroll.appendChild(review);
      }

      scroll.addEventListener('scroll', function () { ui.listScroll = scroll.scrollTop; }, { passive: true });
      // Dropping a card here plans it for today without an hour (it also takes the hour off a block).
      scroll.addEventListener('dragover', function (e) {
        if (!ui.drag) return;
        e.preventDefault();
        scroll.classList.add('is-drop');
      });
      scroll.addEventListener('dragleave', function (e) {
        if (!scroll.contains(e.relatedTarget)) scroll.classList.remove('is-drop');
      });
      scroll.addEventListener('drop', function (e) {
        if (!ui.drag) return;
        e.preventDefault();
        scroll.classList.remove('is-drop');
        var row = findRow(ui.drag.id);
        ui.drag = null;
        if (row && !(DM().plannedDay(row) === ui.today && !TM().rowRange(row, ui.today))) api.plan(row, ui.today, '', '');
      });

      var col = h('section', { class: 'td-col td-col--list', 'aria-label': 'À faire' }, [
        h('div', { class: 'td-col-head' }, [
          h('h2', { class: 'td-h', text: 'À faire' }),
          h('span', { class: 'td-count', text: String(s.open) }),
          h('span', { class: 'td-spacer' }),
          hideDoneButton(s.done),
        ]),
        scroll,
      ]);
      ui.listEl = scroll;
      return col;
    }

    /* ── Timeline ─────────────────────────────────────────────────── */

    function hideDrop() {
      var d = ui.root && ui.root.querySelector('.td-drop');
      if (d) d.hidden = true;
    }

    function blockTitle(b) {
      var row = b.row;
      var when = TM().fmtRange(b.start, b.end);
      return row.name + ' · ' + when + (b.kind === 'flow' ? ' (proposé)' : '');
    }

    function blockEl(b, scale, grid) {
      var row = b.row;
      var top = scale.yOf(b.start);
      var height = Math.max(MIN_BLOCK_PX - 3, scale.yOf(b.end) - top - 3);
      var lanes = b.lanes || 1;
      var lane = b.lane || 0;
      var done = b.kind === 'done';
      var past = !done && b.kind === 'fixed' && b.end <= ui.nowMin;
      var current = b.kind === 'fixed' && b.start <= ui.nowMin && ui.nowMin < b.end;
      var step = !done && WO() && WO().stepText ? WO().stepText(row) : '';
      var cls = 'td-block td-block--' + b.kind + (past ? ' is-past' : '') + (current ? ' is-current' : '') +
        (b.late ? ' is-late' : '') + (row.blocked && !done ? ' is-blocked' : '') + (height < 34 ? ' is-short' : '');
      var accent = accentOf(row);
      var kids = [];
      if (height >= 22) kids.push(ringButton(row, done ? 'done' : 'today'));
      var text1 = [h('span', { class: 'td-block-name', text: row.name })];
      if (height >= 46 && step) text1.push(h('span', { class: 'td-block-step', text: step }));
      kids.push(h('span', { class: 'td-block-text' }, text1));
      kids.push(h('span', { class: 'td-block-when', text: height >= 46 || lanes === 1 ? TM().fmtRange(b.start, b.end) : '' }));
      if (b.kind === 'flow') {
        kids.push(h('button', {
          class: 'td-pin',
          type: 'button',
          title: 'Fixer à ' + TM().fmtClock(b.start),
          'aria-label': 'Fixer « ' + row.name + ' » à ' + TM().fmtClock(b.start),
          onclick: function (e) {
            e.stopPropagation();
            api.plan(row, ui.today, '', TM().toClock(b.start));
          },
        }, [icon('pin')]));
      }
      var resizable = !done && !b.explicit;
      if (resizable) kids.push(h('span', { class: 'td-grip', title: 'Changer la durée' }));
      var el = h('div', {
        class: cls,
        'data-card': row.id,
        title: blockTitle(b),
        style: 'top:' + top + 'px;height:' + height + 'px;left:calc(' + (lane * 100 / lanes) + '% + 2px);width:calc(' + (100 / lanes) + '% - 4px)' + (accent ? ';--ac:' + accent : ''),
      }, kids);
      el.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button, .td-grip')) return;
        api.openCard(row);
      });
      if (!done) draggable(el, row, function () { return b.end - b.start; }, b.explicit);
      if (resizable) bindResize(el, el.querySelector('.td-grip'), b, scale);
      return el;
    }

    /** Drag the bottom edge: the duration (estimate) follows the pointer, on a 5-minute grid. */
    function bindResize(el, grip, b, scale) {
      grip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        ui.resizing = true;
        el.setAttribute('draggable', 'false');
        el.classList.add('is-resizing');
        var y0 = e.clientY;
        var endY = scale.yOf(b.end);
        var top = scale.yOf(b.start);
        var end = b.end;
        var when = el.querySelector('.td-block-when');
        try { grip.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners below still follow the pointer */ }
        function move(ev) {
          var m = TM().snap(scale.minOf(endY + (ev.clientY - y0)), DROP_STEP);
          end = Math.max(b.start + DROP_STEP, Math.min(scale.to, m));
          el.style.height = Math.max(MIN_BLOCK_PX - 3, scale.yOf(end) - top - 3) + 'px';
          if (when) when.textContent = TM().fmtDuration(end - b.start);
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          ui.resizing = false;
          el.classList.remove('is-resizing');
          el.setAttribute('draggable', 'true');
          if (end !== b.end) api.setEstimate(b.row, end - b.start);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
    }

    function buildGutterWeather(scale) {
      var layer = h('div', { class: 'td-wx' });
      var model = WX().current().model;
      if (!model) return layer;
      var px = ZOOMS[ui.zoom];
      var every = px >= 72 ? 1 : px >= 56 ? 2 : 0;
      if (every) {
        scale.ticks(60).forEach(function (tk) {
          var hr = tk.minute / 60;
          if (hr % every || hr > 23) return;
          var hourly = WX().hourAt(model, ui.today, hr);
          if (!hourly) return;
          var d = WX().describe(hourly.code, hourly.isDay);
          var wet = hourly.pop != null && hourly.pop >= 40;
          layer.appendChild(h('span', { class: 'td-wx-h' + (wet ? ' is-wet' : ''), style: 'top:' + (tk.y + 15) + 'px', title: d.label + (hourly.pop != null && hourly.pop >= 20 ? ' · ' + WX().fmtPop(hourly.pop) : '') }, [
            WUI().glyph(d.kind, hourly.isDay, 16),
            h('span', { text: WX().fmtTemp(hourly.temp) }),
          ]));
        });
      }
      var today = WX().dayOf(model, ui.today);
      [['sunrise', today && today.sunrise, 'Lever du soleil'], ['sunset', today && today.sunset, 'Coucher du soleil']].forEach(function (s) {
        var m = WX().minutesOf(s[1]);
        if (m == null || m < scale.from || m > scale.to) return;
        layer.appendChild(h('div', { class: 'td-sun', style: 'top:' + scale.yOf(m) + 'px', title: s[2] + ' · ' + WUI().clock(s[1]) }, [
          icon(s[0]),
          h('span', { text: WUI().clock(s[1]) }),
        ]));
      });
      return layer;
    }

    function repaintGutter() {
      if (!ui.wxLayer || !ui.wxLayer.isConnected || !ui.scale) return;
      var fresh = buildGutterWeather(ui.scale);
      ui.wxLayer.replaceWith(fresh);
      ui.wxLayer = fresh;
    }

    function composer(grid, scale) {
      var c = ui.compose;
      var input = h('input', {
        class: 'td-compose-input',
        type: 'text',
        placeholder: 'Nouvelle carte…',
        'aria-label': 'Nouvelle carte à ' + TM().fmtClock(c.at),
        autocomplete: 'off',
        value: c.text || '',
      });
      var closed = false;
      function close() {
        if (closed) return;
        closed = true;
        ui.compose = null;
      }
      function finish(fromBlur) {
        if (closed) return;
        var value = input.value;
        if (!value.replace(/\s+/g, ' ').trim()) {
          close();
          if (fromBlur) api.rerender();
          return;
        }
        var at = c.at;
        close();
        createFromText(value, TM().toClock(at));
      }
      input.addEventListener('input', function () { c.text = input.value; });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(false); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); api.rerender(); }
      });
      input.addEventListener('blur', function () { setTimeout(function () { finish(true); }, 0); });
      var box = h('div', { class: 'td-compose', style: 'top:' + scale.yOf(c.at) + 'px' }, [
        h('span', { class: 'td-compose-t', text: TM().fmtClock(c.at) }),
        input,
      ]);
      ui.composeInput = input;
      return box;
    }

    function buildPlan(day) {
      var showDone = !!ui.showDone;
      var blocks = day.blocks.slice();
      if (showDone) blocks = blocks.concat(day.doneBlocks);
      TM().layoutLanes(blocks);
      var scale = TM().elasticScale(blocks, { from: day.window.from, to: day.window.to, pxPerHour: ZOOMS[ui.zoom], minBlockPx: MIN_BLOCK_PX });
      ui.scale = scale;
      var grid = h('div', { class: 'td-grid', style: 'height:' + Math.ceil(scale.height) + 'px' });

      scale.ticks(30).forEach(function (tk) {
        var hour = tk.minute % 60 === 0;
        grid.appendChild(h('div', { class: 'td-hr' + (hour ? '' : ' td-hr--half'), style: 'top:' + tk.y + 'px' }, hour ? [h('span', { class: 'td-hr-t', text: TM().fmtClock(tk.minute) })] : []));
      });
      grid.appendChild(h('div', { class: 'td-past', style: 'height:' + scale.yOf(ui.nowMin) + 'px' }));
      ui.wxLayer = buildGutterWeather(scale);
      grid.appendChild(ui.wxLayer);
      blocks.forEach(function (b) { grid.appendChild(blockEl(b, scale, grid)); });

      var now = h('div', { class: 'td-now', style: 'top:' + scale.yOf(ui.nowMin) + 'px' }, [h('span', { class: 'td-now-t', text: TM().fmtClock(ui.nowMin) })]);
      now.hidden = ui.nowMin < scale.from || ui.nowMin > scale.to;
      grid.appendChild(now);
      var drop = h('div', { class: 'td-drop', hidden: true }, [h('span', { class: 'td-drop-t' })]);
      grid.appendChild(drop);
      var hint = h('div', { class: 'td-hint', hidden: true }, [h('span', { class: 'td-hint-t' })]);
      grid.appendChild(hint);
      if (ui.compose) grid.appendChild(composer(grid, scale));

      function minuteAt(clientY, step) {
        var rect = grid.getBoundingClientRect();
        var m = TM().snap(scale.minOf(clientY - rect.top), step);
        return Math.max(scale.from, Math.min(scale.to - step, m));
      }

      grid.addEventListener('dragover', function (e) {
        if (!ui.drag) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (err) { /* ignore */ }
        var m = minuteAt(e.clientY - ui.drag.offset, DROP_STEP);
        var top = scale.yOf(m);
        drop.hidden = false;
        drop.style.top = top + 'px';
        drop.style.height = Math.max(MIN_BLOCK_PX - 3, scale.yOf(Math.min(scale.to, m + ui.drag.duration)) - top - 3) + 'px';
        drop.firstChild.textContent = TM().fmtRange(m, m + ui.drag.duration);
        hint.hidden = true;
      });
      grid.addEventListener('dragleave', function (e) {
        if (!grid.contains(e.relatedTarget)) hideDrop();
      });
      grid.addEventListener('drop', function (e) {
        if (!ui.drag) return;
        e.preventDefault();
        var info = ui.drag;
        var m = minuteAt(e.clientY - info.offset, DROP_STEP);
        hideDrop();
        ui.drag = null;
        var row = findRow(info.id);
        if (!row) return;
        if (info.explicit) api.plan(row, ui.today, '', TM().toClock(m), TM().toClock(Math.min(1439, m + info.duration)));
        else api.plan(row, ui.today, '', TM().toClock(m));
      });

      function overEmpty(e) {
        return !ui.drag && !ui.resizing && !ui.compose && e.target.closest && !e.target.closest('.td-block, .td-compose');
      }
      grid.addEventListener('pointermove', function (e) {
        if (!overEmpty(e) || e.pointerType === 'touch') { hint.hidden = true; return; }
        var m = minuteAt(e.clientY, CLICK_STEP);
        hint.hidden = false;
        hint.style.top = scale.yOf(m) + 'px';
        hint.firstChild.textContent = TM().fmtClock(m);
      });
      grid.addEventListener('pointerleave', function () { hint.hidden = true; });
      grid.addEventListener('click', function (e) {
        if (!overEmpty(e)) return;
        ui.compose = { at: minuteAt(e.clientY, CLICK_STEP), text: '' };
        api.rerender();
      });

      var scroller = h('div', { class: 'td-plan-scroll' }, [grid]);
      scroller.addEventListener('scroll', function () { ui.planScroll = scroller.scrollTop; }, { passive: true });
      ui.planEl = scroller;

      var late = day.flow.filter(function (b) { return b.late; }).map(function (b) { return b.row; }).concat(day.overflow);
      var warn = null;
      if (late.length) {
        var tomorrow = DM().addDays(ui.today, 1);
        warn = h('div', { class: 'td-warn' }, [
          icon('alert-triangle'),
          h('span', { text: plural(late.length, 'tâche dépasse', 'tâches dépassent') + ' ' + TM().fmtClock(TM().WORK_END) }),
          h('button', {
            class: 'td-btn td-btn--chip',
            type: 'button',
            onclick: function () {
              api.planMany(late.map(function (r) { return { id: r.id, date: tomorrow, time: '' }; }), plural(late.length, 'tâche reportée', 'tâches reportées') + ' à demain');
            },
          }, [icon('arrow-curve-right'), text('Reporter à demain')]),
        ]);
      }

      var tools = [];
      if (day.flow.length) {
        tools.push(h('button', {
          class: 'td-btn td-btn--primary',
          type: 'button',
          title: 'Écrire ces heures dans les cartes',
          onclick: function () {
            api.planMany(day.flow.map(function (b) { return { id: b.id, date: ui.today, time: TM().toClock(b.start) }; }), plural(day.flow.length, 'tâche planifiée', 'tâches planifiées'));
          },
        }, [icon('wand'), text('Planifier ma journée')]));
      }
      tools.push(h('button', { class: 'td-icon', type: 'button', title: 'Aller à maintenant', 'aria-label': 'Aller à maintenant', onclick: function () { scrollToNow(true); } }, [icon('current-location')]));
      tools.push(h('button', {
        class: 'td-icon',
        type: 'button',
        title: 'Resserrer les heures',
        'aria-label': 'Resserrer les heures',
        disabled: ui.zoom <= 0,
        onclick: function () { setZoom(ui.zoom - 1); },
      }, [icon('zoom-out')]));
      tools.push(h('button', {
        class: 'td-icon',
        type: 'button',
        title: 'Étirer les heures',
        'aria-label': 'Étirer les heures',
        disabled: ui.zoom >= ZOOMS.length - 1,
        onclick: function () { setZoom(ui.zoom + 1); },
      }, [icon('zoom-in')]));

      return h('section', { class: 'td-col td-col--plan', 'aria-label': 'Planning' }, [
        h('div', { class: 'td-col-head' }, [h('h2', { class: 'td-h', text: 'Planning' }), h('span', { class: 'td-spacer' })].concat(tools)),
        warn,
        scroller,
      ]);
    }

    function setZoom(i) {
      ui.zoom = Math.max(0, Math.min(ZOOMS.length - 1, i));
      remember(KEYS.zoom, ui.zoom);
      // Keep the clock where it is on screen when the hours stretch.
      ui.planScroll = null;
      api.rerender();
    }

    function scrollToNow(smooth) {
      var el = ui.planEl;
      if (!el || !ui.scale) return;
      var focusMin = ui.nowMin >= ui.scale.from && ui.nowMin <= ui.scale.to ? ui.nowMin : ui.day && ui.day.blocks[0] ? ui.day.blocks[0].start : ui.scale.from;
      var y = Math.max(0, ui.scale.yOf(focusMin) - el.clientHeight * 0.3);
      if (smooth && el.scrollTo) el.scrollTo({ top: y, behavior: 'smooth' });
      else el.scrollTop = y;
    }

    /* ── Page ─────────────────────────────────────────────────────── */

    function celebrate(day) {
      var open = day.stats.open;
      var was = ui.prevOpen;
      ui.prevOpen = open;
      if (was != null && was > 0 && open === 0 && day.stats.done > 0 && global.CelebrationEffects && typeof global.CelebrationEffects.play === 'function') {
        try { global.CelebrationEffects.play('confetti', { sound: false }); } catch (e) { /* a celebration never blocks the page */ }
      }
    }

    function render(container) {
      start();
      askName();
      var st = api.state();
      var now = new Date();
      ui.now = now;
      ui.nowMin = now.getHours() * 60 + now.getMinutes();
      ui.today = api.today();
      ui.showDone = global.HideDone ? !global.HideDone.get() : false;
      var day = TM().buildDay(st.rows, { today: ui.today, nowMin: ui.nowMin, capacity: st.capacity });
      ui.day = day;
      ui.flowKey = Math.floor(ui.nowMin / TM().STEP);
      ui.blockById = {};
      day.blocks.forEach(function (b) { ui.blockById[b.id] = b; });

      var page = h('div', { class: 'td-page' });
      ui.heroEl = buildHero();
      page.appendChild(ui.heroEl);
      page.appendChild(h('div', { class: 'td-body' }, [buildList(day), buildPlan(day)]));
      container.appendChild(page);
      ui.root = page;

      ui.listEl.scrollTop = ui.listScroll;
      if (ui.planScroll == null) scrollToNow(false);
      else ui.planEl.scrollTop = ui.planScroll;
      if (ui.compose && ui.composeInput && ui.composeInput.isConnected) ui.composeInput.focus({ preventScroll: true });
      else if (ui.refocusAdd) {
        ui.refocusAdd = false;
        var add = page.querySelector('.td-add input');
        if (add) add.focus({ preventScroll: true });
      }
      celebrate(day);
      setTimeout(function () { WX().refresh(); }, 0);
    }

    return { render: render };
  }

  global.TodayUI = { create: create };
})(typeof window !== 'undefined' ? window : this);
