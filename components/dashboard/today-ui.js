/*
 * Role: the Aujourd'hui page of the Dashboard.
 *   Hero      greeting, how the day stands, and the weather (sky, now, next hours, next days)
 *   À faire   what to do now, late work, today's tasks, quick add, work worth pulling in, the revue
 *   Planning  the day on a clock: tasks with a time sit at that time, the others are laid out from now
 *             (dashed) and become real with "Planifier ma journée". Drag to move, drag the bottom edge to
 *             resize, click an empty hour to add a task there.
 * Logic is in TodayModel (pure); the weather in Weather / WeatherUI. Every write goes through the helpers
 * dashboard-ui.js hands over (`api`), so the right-click menu, undo and Trello writes stay in one place.
 * The page is a board of widgets (TodayModel.layout): move, resize, close, reopen, rename.
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
  var KEYS = { zoom: 'tp-today-zoom', week: 'tp-today-week', sugg: 'tp-today-sugg', layout: 'tp-today-layout' };

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
      layout: null,
      scrolls: {},
      narrow: false,
      widgetGesture: false,
      editing: null,
      boardEl: null,
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
      preview: null,
    };

    /* ── Things that live longer than one render ──────────────────── */

    function isBusy() {
      var a = document.activeElement;
      var typing = a && ui.root && ui.root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      var menu = document.querySelector('.tp-context-menu, .wx-pop');
      var fields = global.CardFields && typeof global.CardFields.isOpen === 'function' && global.CardFields.isOpen();
      return !!(typing || ui.drag || ui.resizing || ui.widgetGesture || ui.editing || menu || fields || ui.preview);
    }

    function start() {
      if (ui.started) return;
      ui.started = true;
      WX().subscribe(function () {
        repaintSky();
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
      document.addEventListener('mousedown', function (e) {
        if (!ui.preview || ui.preview.hold) return;
        var t = e.target;
        if (ui.preview.el.contains(t)) return;
        if (t.closest && t.closest('.td-block, .tp-context-menu, .cf-pop')) return;
        closePreview();
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !ui.preview || ui.preview.hold) return;
        if (global.CardFields && typeof global.CardFields.isOpen === 'function' && global.CardFields.isOpen()) return;
        closePreview();
      });
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
          repaintSky();
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
      cap.classList.add('td-pill');
      cap.insertBefore(icon('clock'), cap.firstChild);
      pills.push(cap);
      if (s.overdue) {
        pills.push(h('button', {
          class: 'td-pill td-pill--btn td-pill--late',
          type: 'button',
          title: 'Aller aux tâches en retard',
          onclick: function () {
            var g = ui.root && ui.root.querySelector('.td-widget--late');
            if (g && g.scrollIntoView) g.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            else commitLayout(TM().layout.open(ui.layout, 'late'));
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

    function skyScene() {
      var live = WX().current();
      var model = live.model;
      var d = model ? WX().describe(model.now.code, model.now.isDay) : null;
      var hr = ui.now.getHours();
      var isDay = model ? model.now.isDay : hr >= 7 && hr < 19;
      return { live: live, scene: d ? d.scene : isDay ? 'clear-day' : 'clear-night', isDay: isDay };
    }

    function buildWeatherPanel(info) {
      return WUI().panel(info.live, {
        expanded: ui.week,
        onPlace: openPlacePicker,
        onToggle: function () {
          ui.week = !ui.week;
          remember(KEYS.week, ui.week ? '1' : '0');
          repaintSky();
        },
        onRefresh: function () { WX().refresh({ force: true }); },
      });
    }

    /** Greeting and weather keep their sky when the forecast or the name arrives. */
    function repaintSky() {
      if (!ui.root || !ui.root.isConnected || !ui.day || ui.editing) return;
      var info = skyScene();
      ['hello', 'weather'].forEach(function (id) {
        var el = ui.root.querySelector('.td-widget--' + id);
        if (!el) return;
        el.setAttribute('data-scene', info.scene);
        var sky = WUI().sky(info.scene, info.isDay);
        var oldSky = el.querySelector(':scope > .wx-sky');
        if (oldSky) oldSky.replaceWith(sky);
        else el.insertBefore(sky, el.firstChild);
        if (id === 'hello') {
          var hello = el.querySelector('.td-hello');
          if (hello) {
            var freshHello = buildHello();
            freshHello.classList.add('td-widget-body');
            hello.replaceWith(freshHello);
          }
        } else {
          var panel = el.querySelector('.wx');
          if (panel) {
            var freshWx = buildWeatherPanel(info);
            freshWx.classList.add('td-widget-body');
            panel.replaceWith(freshWx);
          }
        }
      });
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
      var current = TM().rowRange(row, ui.today);
      TM().timeSlots().forEach(function (slot) {
        items.push({
          id: 'time:' + slot.time,
          label: slot.label,
          icon: 'clock',
          checked: !!current && current.start === slot.minute,
          action: function () { api.plan(row, ui.today, '', slot.time); },
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

    function suggestionRows(day) {
      var skip = day.focus && day.focus.state === 'backlog' ? day.focus.row.id : null;
      return TM().suggest(api.rows(), ui.today, 6, skip);
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

    function replanChip(rows) {
      return api.menuChip('td-replan', 'Replanifier les tâches en retard', 'calendar-event', 'Replanifier', function () {
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
    }

    function buildTasksBody(day) {
      var s = day.stats;
      var scroll = h('div', { class: 'td-scroll' });
      var todayRows = day.planned.map(function (r) { return taskRow(r, 'today'); });
      if (ui.showDone) day.done.forEach(function (r) { todayRows.push(taskRow(r, 'done')); });
      var rows = h('div', { class: 'td-rows' }, todayRows);
      if (!todayRows.length) {
        rows.appendChild(h('div', { class: 'td-empty' }, [
          icon(s.total ? 'circle-check' : 'sun'),
          h('p', { text: s.total ? 'Tout est fait.' : 'Rien de prévu aujourd’hui.' }),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { api.go('orchestrator'); } }, [icon('calendar-event'), text('Ouvrir l’orchestrateur')]),
        ]));
      }
      scroll.appendChild(rows);
      scroll.appendChild(addLine());
      if (global.InsertGap && todayRows.length) {
        global.InsertGap.watch(rows, {
          item: '.td-task',
          placeholder: 'Titre…',
          onCreate: function (title) { createFromText(title); },
        });
      }
      scroll.addEventListener('scroll', function () { ui.scrolls.tasks = scroll.scrollTop; }, { passive: true });
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
      ui.listEl = scroll;
      return scroll;
    }

    /* ── Timeline ─────────────────────────────────────────────────── */

    function hideDrop() {
      var d = ui.root && ui.root.querySelector('.td-drop');
      if (d) d.hidden = true;
    }

    function closePreview() {
      var p = ui.preview;
      if (!p) return;
      var id = p.id;
      ui.preview = null;
      if (p.ro) p.ro.disconnect();
      if (p.quick && typeof p.quick.destroy === 'function') p.quick.destroy();
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
      var Iso = global.Isolation;
      if (id && Iso && typeof Iso.read === 'function' && typeof Iso.clear === 'function') {
        var cur = Iso.read();
        if (cur && cur.kind === 'task' && cur.id === id && !(global.TaskFocus && global.TaskFocus.currentId && global.TaskFocus.currentId() === id)) Iso.clear();
      }
    }

    /** The task stays on this page: the same quick card as the Kanban, beside the block. */
    function openPreview(row, anchor) {
      if (!row) return;
      if (ui.preview && ui.preview.id === row.id) { closePreview(); return; }
      closePreview();
      if (global.Isolation && typeof global.Isolation.set === 'function') {
        global.Isolation.set({ kind: 'task', id: row.id, label: row.name || '' });
      }
      var el = h('div', { class: 'td-pop', role: 'dialog', 'aria-label': row.name || 'Carte' });
      document.body.appendChild(el);
      var box = { id: row.id, el: el, quick: null, hold: false, anchor: anchor };
      ui.preview = box;
      function place() {
        if (ui.preview !== box || !anchor.isConnected) return;
        var rect = anchor.getBoundingClientRect();
        if (!(rect.width > 0)) return;
        var w = el.offsetWidth || 320;
        var hh = el.offsetHeight || 120;
        var left = rect.right + 8;
        if (left + w > window.innerWidth - 8) left = Math.max(8, rect.left - w - 8);
        var top = rect.top;
        if (top + hh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - hh - 8);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
      }
      if (!global.CardQuick) {
        el.appendChild(h('div', { class: 'td-pop-name', text: row.name || 'Carte' }));
        place();
        return;
      }
      box.quick = global.CardQuick.mount(el, {
        t: api.t,
        cardId: row.id,
        name: row.name || '',
        onOpen: function () { closePreview(); api.openCard(findRow(row.id) || row); },
        onChange: function () { api.rerender(); },
        onHold: function (on) { if (ui.preview === box) box.hold = !!on; },
        onToast: function (m, kind) { if (api.setStatus) api.setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
        onGone: function () { closePreview(); api.rerender(); },
      });
      place();
      if (global.ResizeObserver) {
        var ro = new global.ResizeObserver(function () { place(); });
        ro.observe(el);
        box.ro = ro;
      }
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
      el.addEventListener('pointerdown', function (e) { el._py = e.clientY; });
      el.addEventListener('click', function (e) {
        if (Math.abs(e.clientY - el._py) > 4) return;
        if (e.target.closest && e.target.closest('button, .td-grip')) return;
        e.stopPropagation();
        openPreview(row, el);
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

      var off = TM().offRanges(day.today, scale.from, scale.to);
      function minuteOff(minute) {
        for (var i = 0; i < off.length; i++) {
          if (minute >= off[i].start && minute < off[i].end) return true;
          if (minute === scale.to && minute === off[i].end) return true;
        }
        return false;
      }
      grid.appendChild(h('div', { class: 'td-past', style: 'height:' + scale.yOf(ui.nowMin) + 'px' }));
      off.forEach(function (iv) {
        var top = scale.yOf(iv.start);
        var height = scale.yOf(iv.end) - top;
        if (height < 1) return;
        grid.appendChild(h('div', { class: 'td-off', style: 'top:' + top + 'px;height:' + height + 'px' }));
      });
      scale.ticks(30).forEach(function (tk) {
        var hour = tk.minute % 60 === 0;
        var cls = 'td-hr' + (hour ? '' : ' td-hr--half') + (minuteOff(tk.minute) ? ' td-hr--off' : '');
        grid.appendChild(h('div', { class: cls, style: 'top:' + tk.y + 'px' }, hour ? [h('span', { class: 'td-hr-t', text: TM().fmtClock(tk.minute) })] : []));
      });
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

      /* The hint and the compose label sit in the gutter on top of the hour and weather text: hide what they would overlap, even by a few pixels. */
      var coverKey = null;
      var covered = [];
      function coverGutter(y) {
        if (y === coverKey) return;
        coverKey = y;
        covered.forEach(function (el) { el.classList.remove('is-covered'); });
        covered = [];
        if (y == null) return;
        var top = grid.getBoundingClientRect().top;
        Array.prototype.forEach.call(grid.querySelectorAll('.td-hr-t, .td-wx-h, .td-sun > .ti, .td-sun > span'), function (el) {
          var r = el.getBoundingClientRect();
          if (!r.height || Math.abs(r.top + r.height / 2 - top - y) >= 16) return;
          el.classList.add('is-covered');
          covered.push(el);
        });
      }
      function composeY() {
        return ui.compose ? scale.yOf(ui.compose.at) + 17 : null;
      }
      function hideHint() {
        hint.hidden = true;
        coverGutter(composeY());
      }
      if (ui.compose) window.requestAnimationFrame(function () { if (grid.isConnected) coverGutter(composeY()); });

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
        hideHint();
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
        if (!overEmpty(e) || e.pointerType === 'touch') { hideHint(); return; }
        var m = minuteAt(e.clientY, CLICK_STEP);
        hint.hidden = false;
        hint.style.top = scale.yOf(m) + 'px';
        hint.firstChild.textContent = TM().fmtOffset(m - ui.nowMin);
        coverGutter(scale.yOf(m));
      });
      grid.addEventListener('pointerleave', hideHint);
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
      var ready = day.flow.filter(function (b) { return !b.late; });
      if (ready.length) {
        tools.push(h('button', {
          class: 'td-btn td-btn--primary',
          type: 'button',
          title: 'Écrire ces heures dans les cartes',
          onclick: function () {
            api.planMany(ready.map(function (b) { return { id: b.id, date: ui.today, time: TM().toClock(b.start) }; }), plural(ready.length, 'tâche planifiée', 'tâches planifiées'));
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

      ui.planTools = tools;
      var wrap = h('div', { class: 'td-plan-wrap' });
      if (warn) wrap.appendChild(warn);
      wrap.appendChild(scroller);
      return wrap;
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

    /* ── Widget board ─────────────────────────────────────────────── */

    function loadLayout() {
      if (ui.layout) return ui.layout;
      var parsed = null;
      var raw = recall(KEYS.layout);
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      ui.layout = TM().layout.normalize(parsed);
      return ui.layout;
    }

    function commitLayout(next) {
      ui.layout = TM().layout.normalize(next);
      remember(KEYS.layout, JSON.stringify(ui.layout));
      api.rerender();
    }

    function placed(id) {
      var items = ui.layout && ui.layout.items;
      if (!items) return null;
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
      return null;
    }

    function gridStyle(it) {
      return 'grid-column:' + (it.c + 1) + ' / span ' + it.w + ';grid-row:' + (it.r + 1) + ' / span ' + it.h;
    }

    function cellAt(board, clientX, clientY, w) {
      var rect = board.getBoundingClientRect();
      var x = clientX - rect.left + board.scrollLeft;
      var y = clientY - rect.top + board.scrollTop;
      var cols = TM().layout.COLS;
      var colW = Math.max(1, board.clientWidth / cols);
      var c = Math.round(x / colW);
      var r = Math.round(y / TM().layout.ROW);
      return { c: Math.max(0, Math.min(cols - (w || 1), c)), r: Math.max(0, r) };
    }

    function placeSlot(c, r, w, hh) {
      if (!ui.boardEl) return;
      if (!ui.slot) {
        ui.slot = h('div', { class: 'td-slot' });
        ui.boardEl.appendChild(ui.slot);
      }
      ui.slot.hidden = false;
      ui.slot.style.gridColumn = (c + 1) + ' / span ' + w;
      ui.slot.style.gridRow = (r + 1) + ' / span ' + hh;
    }

    function clearSlot() {
      if (ui.slot && ui.slot.parentNode) ui.slot.parentNode.removeChild(ui.slot);
      ui.slot = null;
    }

    function beginRename(id) {
      if (ui.editing || !ui.root) return;
      var el = ui.root.querySelector('.td-widget--' + id);
      if (!el) return;
      ui.editing = id;
      var input = h('input', {
        class: 'td-widget-name',
        type: 'text',
        value: TM().layout.label(ui.layout, id),
        maxlength: '40',
        'aria-label': 'Nom',
      });
      var title = el.querySelector('.td-widget-title');
      if (title) title.replaceWith(input);
      else {
        input.classList.add('td-widget-name--float');
        el.appendChild(input);
      }
      input.focus();
      input.select();
      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        ui.editing = null;
        if (save) commitLayout(TM().layout.rename(ui.layout, id, input.value));
        else api.rerender();
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
    }

    function startMove(e, id, grip) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var el = grip.closest('.td-widget');
      var board = ui.boardEl;
      var geom = (el && el._geom) || placed(id);
      if (!el || !board || !geom) return;
      var x0 = e.clientX;
      var y0 = e.clientY;
      var started = false;
      var cell = { c: geom.c, r: geom.r };
      var span = ui.narrow ? TM().layout.COLS : geom.w;
      ui.widgetGesture = true;
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners still follow the pointer */ }
      function onMove(ev) {
        var dx = ev.clientX - x0;
        var dy = ev.clientY - y0;
        if (!started && Math.abs(dx) + Math.abs(dy) < 4) return;
        started = true;
        el.classList.add('is-lifting');
        el.style.zIndex = '30';
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        board.classList.add('is-gesturing');
        var box = el.getBoundingClientRect();
        cell = cellAt(board, box.left, box.top, span);
        placeSlot(cell.c, cell.r, span, geom.h);
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        ui.widgetGesture = false;
        clearSlot();
        board.classList.remove('is-gesturing');
        if (!started) {
          el.classList.remove('is-lifting');
          el.style.transform = '';
          el.style.zIndex = '';
          return;
        }
        commitLayout(TM().layout.move(ui.layout, id, cell.c, cell.r));
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }

    function startResize(e, id, axis, handle) {
      if (e.button !== 0 || (ui.narrow && axis !== 's')) return;
      e.preventDefault();
      e.stopPropagation();
      var el = handle.closest('.td-widget');
      var board = ui.boardEl;
      var geom = (el && el._geom) || placed(id);
      if (!el || !board || !geom) return;
      var x0 = e.clientX;
      var y0 = e.clientY;
      var rect = el.getBoundingClientRect();
      var preview = { w: geom.w, h: geom.h };
      ui.widgetGesture = true;
      el.classList.add('is-resizing-widget');
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners still follow the pointer */ }
      function onMove(ev) {
        var colW = Math.max(1, board.clientWidth / TM().layout.COLS);
        var w = geom.w;
        var hh = geom.h;
        if (axis !== 's') w = Math.round((rect.width + 12 + (ev.clientX - x0)) / colW);
        if (axis !== 'e') hh = Math.round((rect.height + 12 + (ev.clientY - y0)) / TM().layout.ROW);
        w = Math.max(TM().layout.MIN_W, Math.min(TM().layout.COLS - geom.c, w));
        hh = Math.max(TM().layout.MIN_H, Math.min(TM().layout.MAX_H, hh));
        preview = { w: w, h: hh };
        el.style.gridColumn = (geom.c + 1) + ' / span ' + (ui.narrow ? TM().layout.COLS : w);
        el.style.gridRow = (geom.r + 1) + ' / span ' + hh;
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        ui.widgetGesture = false;
        el.classList.remove('is-resizing-widget');
        if (preview.w === geom.w && preview.h === geom.h) return;
        commitLayout(TM().layout.resize(ui.layout, id, ui.narrow ? null : preview.w, preview.h));
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }

    function widgetTools(id) {
      var label = TM().layout.label(ui.layout, id);
      var grip = h('button', { class: 'td-icon td-widget-grip', type: 'button', title: 'Déplacer', 'aria-label': 'Déplacer ' + label }, [icon('grip-vertical')]);
      var edit = h('button', { class: 'td-icon td-widget-edit', type: 'button', title: 'Renommer', 'aria-label': 'Renommer ' + label }, [icon('pencil')]);
      var close = h('button', { class: 'td-icon td-widget-close', type: 'button', title: 'Fermer', 'aria-label': 'Fermer ' + label }, [icon('x')]);
      grip.addEventListener('pointerdown', function (e) { startMove(e, id, grip); });
      edit.addEventListener('click', function (e) { e.stopPropagation(); beginRename(id); });
      close.addEventListener('click', function (e) {
        e.stopPropagation();
        commitLayout(TM().layout.close(ui.layout, id));
      });
      return h('div', { class: 'td-widget-tools' }, [grip, edit, close]);
    }

    function widget(id, geom, body, opts) {
      opts = opts || {};
      var label = TM().layout.label(ui.layout, id);
      var info = opts.sky ? skyScene() : null;
      var tools = widgetTools(id);
      var head = null;
      if (opts.head !== false) {
        var title = h('h2', { class: 'td-h td-widget-title', text: label });
        title.addEventListener('dblclick', function (e) {
          e.preventDefault();
          e.stopPropagation();
          beginRename(id);
        });
        var kids = [title];
        if (opts.count != null) kids.push(h('span', { class: 'td-count', text: String(opts.count) }));
        kids.push(h('span', { class: 'td-spacer' }));
        (opts.extra || []).forEach(function (n) { if (n) kids.push(n); });
        kids.push(tools);
        head = h('div', { class: 'td-col-head' }, kids);
      }
      if (body) body.classList.add('td-widget-body');
      var el = h('section', {
        class: 'td-widget td-widget--' + id + (opts.sky ? ' td-widget--sky' : ''),
        'data-widget': id,
        'aria-label': label,
        style: gridStyle(geom),
      }, [
        info ? WUI().sky(info.scene, info.isDay) : null,
        opts.head === false ? tools : null,
        head,
        body,
        ui.narrow ? null : h('span', { class: 'td-resize td-resize-e' }),
        h('span', { class: 'td-resize td-resize-s' }),
        ui.narrow ? null : h('span', { class: 'td-resize td-resize-se' }),
      ]);
      if (info) el.setAttribute('data-scene', info.scene);
      el._geom = geom;
      Array.prototype.forEach.call(el.querySelectorAll('.td-resize'), function (handle) {
        var axis = handle.classList.contains('td-resize-e') ? 'e' : handle.classList.contains('td-resize-s') ? 's' : 'se';
        handle.addEventListener('pointerdown', function (e) { startResize(e, id, axis, handle); });
      });
      return el;
    }

    function openWidgetMenu(btn) {
      var L = TM().layout;
      var have = {};
      ui.layout.items.forEach(function (it) { have[it.id] = true; });
      var items = L.widgets().map(function (w) {
        return {
          id: 'widget:' + w.id,
          label: w.label,
          icon: w.icon,
          checked: !!have[w.id],
          action: function () {
            commitLayout(have[w.id] ? L.close(ui.layout, w.id) : L.open(ui.layout, w.id));
          },
        };
      });
      if (!L.same(ui.layout, L.defaults())) {
        items.push({ sep: true });
        items.push({
          id: 'layout:reset',
          label: 'Disposition d’origine',
          icon: 'rotate',
          action: function () { commitLayout(L.defaults()); },
        });
      }
      if (!global.ContextMenu) return;
      var rect = btn.getBoundingClientRect();
      global.ContextMenu.show({ clientX: rect.left, clientY: rect.top }, items);
    }

    function buildBoard(day) {
      var geoms = {};
      TM().layout.present(loadLayout(), ui.narrow).forEach(function (it) { geoms[it.id] = it; });
      var board = h('div', { class: 'td-board' });
      ui.boardEl = board;
      var s = day.stats;
      if (geoms.hello) board.appendChild(widget('hello', geoms.hello, buildHello(), { head: false, sky: true }));
      if (geoms.weather) board.appendChild(widget('weather', geoms.weather, buildWeatherPanel(skyScene()), { head: false, sky: true }));
      if (geoms.focus) board.appendChild(widget('focus', geoms.focus, focusCard(day), { head: false }));
      if (geoms.late) {
        board.appendChild(widget('late', geoms.late, h('div', { class: 'td-rows td-group--late' }, day.overdue.map(function (r) { return taskRow(r, 'late'); })), {
          count: day.overdue.length,
          extra: day.overdue.length ? [replanChip(day.overdue)] : [],
        }));
      }
      if (geoms.tasks) {
        board.appendChild(widget('tasks', geoms.tasks, buildTasksBody(day), {
          count: s.open,
          extra: [hideDoneButton(s.done)],
        }));
      }
      if (geoms.sugg) {
        var sugg = suggestionRows(day);
        board.appendChild(widget('sugg', geoms.sugg, h('div', { class: 'td-rows' }, sugg.map(function (r) { return taskRow(r, 'sugg'); })), {
          count: sugg.length,
        }));
      }
      if (geoms.review) {
        var review = api.review();
        if (review) review.classList.add('td-review');
        board.appendChild(widget('review', geoms.review, review, {}));
      }
      if (geoms.plan) board.appendChild(widget('plan', geoms.plan, buildPlan(day), { extra: ui.planTools || [] }));
      return board;
    }

    function captureScrolls() {
      if (!ui.root) return;
      Array.prototype.forEach.call(ui.root.querySelectorAll('[data-widget]'), function (w) {
        var sc = w.querySelector('.td-scroll, .td-plan-scroll');
        if (sc) ui.scrolls[w.getAttribute('data-widget')] = sc.scrollTop;
      });
      if (ui.planEl && ui.planScroll != null) ui.planScroll = ui.planEl.scrollTop;
    }

    function watchWidth(container) {
      if (ui.watched || !global.ResizeObserver) return;
      ui.watched = true;
      var ro = new ResizeObserver(function () {
        var w = container.clientWidth || 0;
        var narrow = w > 0 && w < 900;
        if (narrow === ui.narrow || ui.widgetGesture || ui.editing) return;
        ui.narrow = narrow;
        if (ui.root && ui.root.isConnected && api.section() === 'today') api.rerender();
      });
      ro.observe(container);
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
      captureScrolls();
      loadLayout();
      var width = container.clientWidth || 0;
      if (width > 0) ui.narrow = width < 900;
      var st = api.state();
      var now = new Date();
      ui.now = now;
      ui.nowMin = now.getHours() * 60 + now.getMinutes();
      ui.today = api.today();
      ui.showDone = global.HideDone ? !global.HideDone.get() : false;
      ui.listEl = null;
      ui.planEl = null;
      ui.planTools = null;
      var day = TM().buildDay(api.rows(), { today: ui.today, nowMin: ui.nowMin, capacity: st.capacity });
      ui.day = day;
      ui.flowKey = Math.floor(ui.nowMin / TM().STEP);
      ui.blockById = {};
      day.blocks.forEach(function (b) { ui.blockById[b.id] = b; });

      var page = h('div', { class: 'td-page' + (ui.narrow ? ' is-narrow' : '') });
      page.appendChild(buildBoard(day));
      page.appendChild(h('button', {
        class: 'td-icon td-widgets-add',
        type: 'button',
        title: 'Widgets',
        'aria-label': 'Widgets',
        onclick: function (e) { e.stopPropagation(); openWidgetMenu(e.currentTarget); },
      }, [icon('plus')]));
      container.appendChild(page);
      ui.root = page;
      watchWidth(container);

      if (ui.listEl) ui.listEl.scrollTop = ui.scrolls.tasks || 0;
      if (ui.planEl) {
        if (ui.planScroll == null) scrollToNow(false);
        else ui.planEl.scrollTop = ui.planScroll;
      }
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
