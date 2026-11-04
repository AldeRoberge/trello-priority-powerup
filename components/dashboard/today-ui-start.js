/**
 * today-ui: create() part 1 of 1.
 * The body of create runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see today-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.TodayUiParts = global.TodayUiParts || {});
  var P = (global.TodayUiPartsMountCreate = global.TodayUiPartsMountCreate || { list: [] });

  P.list.push({
    define: function (M) {
    M.isBusy = function isBusy() {
      var a = document.activeElement;
      var typing = a && M.ui.root && M.ui.root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      var menu = document.querySelector('.tp-context-menu, .wx-pop');
      var fields = global.CardFields && typeof global.CardFields.isOpen === 'function' && global.CardFields.isOpen();
      return !!(typing || M.ui.drag || M.ui.resizing || M.ui.widgetGesture || M.ui.editing || menu || fields || M.ui.preview);
    };
    M.start = function start() {
      if (M.ui.started) return;
      M.ui.started = true;
      S.WX().subscribe(function () {
        M.repaintSky();
        M.repaintGutter();
      });
      setInterval(M.tick, 30000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) M.tick();
      });
      if (global.HideDone && typeof global.HideDone.subscribe === 'function') {
        global.HideDone.subscribe(function () {
          if (M.api.section() === 'today') M.api.rerender();
        });
      }
      document.addEventListener('mousedown', function (e) {
        if (!M.ui.preview || M.ui.preview.hold) return;
        var t = e.target;
        if (M.ui.preview.el.contains(t)) return;
        if (t.closest && t.closest('.td-block, .tp-context-menu, .cf-pop')) return;
        M.closePreview();
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (global.CardFields && typeof global.CardFields.isOpen === 'function' && global.CardFields.isOpen()) return;
        if (M.ui.preview && !M.ui.preview.hold) { M.closePreview(); return; }
        if (M.ui.editing || M.ui.widgetGesture || M.ui.compose) return;
        if (document.querySelector('.tp-context-menu, .wx-pop')) return;
        if (!M.ui.arrange) return;
        M.ui.arrange = false;
        if (M.api.section() === 'today') M.api.rerender();
      });
    };
    M.askName = function askName() {
      if (M.ui.nameAsked) return;
      M.ui.nameAsked = true;
      var profile = global.UserProfile && typeof global.UserProfile.load === 'function'
        ? Promise.resolve(global.UserProfile.load(M.api.t)).catch(function () { return null; })
        : Promise.resolve(null);
      profile.then(function (p) {
        var n = S.TM().firstName(p && p.displayName);
        if (n) return n;
        var PT = global.PriorityTrello;
        if (!PT || typeof PT.getCurrentMember !== 'function') return '';
        return Promise.resolve(PT.getCurrentMember(M.api.t)).then(function (m) { return S.TM().firstName(m && m.fullName); });
      }).then(function (n) {
        if (n && n !== M.ui.name) {
          M.ui.name = n;
          M.repaintSky();
        }
      }, function () { /* the greeting works without a name */ });
    };
    M.tick = function tick() {
      if (!M.ui.root || !M.ui.root.isConnected || M.api.section() !== 'today') return;
      var d = new Date();
      var nowMin = d.getHours() * 60 + d.getMinutes();
      var key = Math.floor(nowMin / S.TM().STEP);
      var dayChanged = S.DM().isoOf(d) !== M.ui.today;
      if ((dayChanged || key !== M.ui.flowKey) && !M.isBusy()) {
        M.api.rerender();
        return;
      }
      M.ui.nowMin = nowMin;
      M.moveClock();
      S.WX().refresh();
    };
    M.moveClock = function moveClock() {
      if (!M.ui.root || !M.ui.scale) return;
      var line = M.ui.root.querySelector('.td-now');
      var past = M.ui.root.querySelector('.td-past');
      var inside = M.ui.nowMin >= M.ui.scale.from && M.ui.nowMin <= M.ui.scale.to;
      if (line) {
        line.style.top = M.ui.scale.yOf(M.ui.nowMin) + 'px';
        line.hidden = !inside;
        var label = line.querySelector('.td-now-t');
        if (label) label.textContent = S.TM().fmtClock(M.ui.nowMin);
      }
      if (past) past.style.height = M.ui.scale.yOf(M.ui.nowMin) + 'px';
    };
    M.findRow = function findRow(id) {
      var rows = M.api.state().rows;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
      return null;
    };
    M.nextMonday = function nextMonday(today) {
      var d = new Date(today + 'T00:00:00');
      return S.DM().addDays(today, (8 - d.getDay()) % 7 || 7);
    };
    M.buildPills = function buildPills(day) {
      var s = day.stats;
      var pills = [];
      if (s.total) {
        pills.push(S.h('span', { class: 'td-pill', title: s.done + ' sur ' + s.total + ' faites aujourd’hui' }, [
          S.doneRing(s.done, s.total),
          S.h('b', { text: s.done + ' sur ' + s.total }),
          S.h('small', { text: 'faites' }),
        ]));
      }
      var cap = M.api.capChip(s.minutes);
      cap.classList.add('td-pill');
      cap.insertBefore(S.icon('clock'), cap.firstChild);
      pills.push(cap);
      if (s.overdue) {
        pills.push(S.h('button', {
          class: 'td-pill td-pill--btn td-pill--late',
          type: 'button',
          title: 'Aller aux tâches en retard',
          onclick: function () {
            var g = M.ui.root && M.ui.root.querySelector('.td-widget--late');
            if (g && g.scrollIntoView) g.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            else M.commitLayout(S.TM().layout.open(M.ui.layout, 'late'));
          },
        }, [S.icon('alert-circle'), S.h('b', { text: String(s.overdue) }), S.h('small', { text: 'en retard' })]));
      }
      return S.h('div', { class: 'td-pills' }, pills);
    };
    M.helloTasks = function helloTasks(day) {
      var late = {};
      (day.overdue || []).forEach(function (r) { late[r.id] = true; });
      var rows = (day.overdue || []).concat(day.planned || []);
      if (!rows.length) return null;
      return S.h('div', { class: 'td-hello-tasks' }, rows.map(function (r) {
        var range = late[r.id] ? null : S.TM().rowRange(r, M.ui.today);
        return S.h('button', {
          class: 'td-hello-task' + (late[r.id] ? ' is-late' : '') + (r.blocked ? ' is-blocked' : ''),
          type: 'button',
          onclick: function () { M.api.openCard(r); },
        }, [
          S.h('span', { class: 'td-hello-mark' }, [
            r.blocked ? S.icon('player-pause') : (late[r.id] ? S.icon('alert-circle') : null),
          ]),
          S.h('span', { class: 'td-hello-name', text: r.name || '' }),
          S.h('span', { class: 'td-hello-when', text: range ? S.TM().fmtClock(range.start) : '' }),
        ]);
      }));
    };
    M.buildHello = function buildHello() {
      var title = S.TM().hello(M.ui.now) + (M.ui.name ? ', ' + M.ui.name : '');
      return S.h('div', { class: 'td-hello' }, [
        S.h('div', { class: 'td-date', text: 'Aujourd’hui · ' + S.TM().dayTitle(M.ui.today) }),
        S.h('h1', { class: 'td-title', text: title }),
        S.h('p', { class: 'td-line', text: S.TM().headline(M.ui.day.stats) }),
        M.helloTasks(M.ui.day),
        M.buildPills(M.ui.day),
      ]);
    };
    M.openPlacePicker = function openPlacePicker(anchor) {
      S.WUI().placePicker(anchor, { onPick: function (p) { S.WX().setPlace(p); } });
    };
    M.skyScene = function skyScene() {
      var live = S.WX().current();
      var model = live.model;
      var d = model ? S.WX().describe(model.now.code, model.now.isDay) : null;
      var hr = M.ui.now.getHours();
      var isDay = model ? model.now.isDay : hr >= 7 && hr < 19;
      return { live: live, scene: d ? d.scene : isDay ? 'clear-day' : 'clear-night', isDay: isDay };
    };
    M.buildWeatherPanel = function buildWeatherPanel(info) {
      var panel = S.WUI().panel(info.live, {
        expanded: M.ui.week,
        onPlace: M.openPlacePicker,
        onToggle: function () {
          M.ui.week = !M.ui.week;
          S.remember(S.KEYS.week, M.ui.week ? '1' : '0');
          M.repaintSky();
        },
        onRefresh: function () { S.WX().refresh({ force: true }); },
      });
      if (M.ui.week && panel) panel.classList.add('is-open');
      return panel;
    };
    M.repaintSky = function repaintSky() {
      if (!M.ui.root || !M.ui.root.isConnected || !M.ui.day || M.ui.editing) return;
      var info = M.skyScene();
      ['hello', 'weather'].forEach(function (id) {
        var el = M.ui.root.querySelector('.td-widget--' + id);
        if (!el) return;
        el.setAttribute('data-scene', info.scene);
        var sky = S.WUI().sky(info.scene, info.isDay);
        var oldSky = el.querySelector(':scope > .wx-sky');
        if (oldSky) oldSky.replaceWith(sky);
        else el.insertBefore(sky, el.firstChild);
        if (id === 'hello') {
          var hello = el.querySelector('.td-hello');
          if (hello) {
            var freshHello = M.buildHello();
            freshHello.classList.add('td-widget-body');
            hello.replaceWith(freshHello);
          }
        } else {
          var panel = el.querySelector('.wx');
          if (panel) {
            var freshWx = M.buildWeatherPanel(info);
            freshWx.classList.add('td-widget-body');
            panel.replaceWith(freshWx);
          }
        }
      });
    };
    M.ringButton = function ringButton(row, kind) {
      var done = kind === 'done';
      var blocked = !!row.blocked && !done;
      var pct = done ? 100 : typeof row.progress === 'number' ? Math.max(0, Math.min(100, row.progress)) : 0;
      var title = done ? 'Terminée : cliquer pour rouvrir' : blocked ? 'Bloquée : cliquer pour débloquer' : 'Terminer';
      var inner = global.ProgressRing ? global.ProgressRing.create(pct, blocked) : S.icon('circle-check');
      return S.h('button', {
        class: 'td-check',
        type: 'button',
        title: title,
        'aria-label': title + ' « ' + row.name + ' »',
        onclick: function (e) {
          e.stopPropagation();
          if (done) M.api.reopen(row);
          else if (blocked) M.api.unblock(row);
          else M.api.complete(row);
        },
      }, [inner]);
    };
    M.timeItems = function timeItems(row) {
      var items = [];
      var timed = !!(row.startTime || row.dueTime);
      if (timed) {
        items.push({ id: 'time:none', label: 'Sans heure', icon: 'clock-off', action: function () { M.api.plan(row, M.ui.today, '', ''); } });
      }
      var next = S.TM().ceilTo(M.ui.nowMin, S.DROP_STEP);
      if (next < 22 * 60) {
        items.push({ id: 'time:now', label: 'Maintenant · ' + S.TM().fmtClock(next), icon: 'player-play', action: function () { M.api.plan(row, M.ui.today, '', S.TM().toClock(next)); } });
      }
      var current = S.TM().rowRange(row, M.ui.today);
      S.TM().timeSlots().forEach(function (slot) {
        items.push({
          id: 'time:' + slot.time,
          label: slot.label,
          icon: 'clock',
          checked: !!current && current.start === slot.minute,
          action: function () { M.api.plan(row, M.ui.today, '', slot.time); },
        });
      });
      return items;
    };
    M.timeChip = function timeChip(row, range) {
      var cls = 'td-timechip' + (range ? ' is-set' : '');
      return M.api.menuChip(range ? cls : cls + ' is-empty', 'Cliquer pour choisir l’heure', 'calendar-time', range ? S.TM().fmtClock(range.start) : 'Heure…', function () { return M.timeItems(row); });
    };
    M.prop = function prop(name, node) {
      return S.h('span', { class: 'td-prop td-prop--' + name }, [node]);
    };
    M.draggable = function draggable(el, row, durationOf, explicit) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', function (e) {
        var r = el.getBoundingClientRect();
        M.ui.drag = { id: row.id, offset: el.classList.contains('td-block') ? e.clientY - r.top : 0, duration: durationOf(), explicit: !!explicit };
        try {
          e.dataTransfer.setData('text/plain', row.id);
          e.dataTransfer.effectAllowed = 'move';
        } catch (err) { /* some browsers refuse; the drag state above is enough */ }
        setTimeout(function () { el.classList.add('is-drag'); }, 0);
        if (M.ui.root) M.ui.root.classList.add('is-dragging');
      });
      el.addEventListener('dragend', function () {
        M.ui.drag = null;
        el.classList.remove('is-drag');
        if (M.ui.root) M.ui.root.classList.remove('is-dragging');
        M.hideDrop();
        var over = M.ui.root && M.ui.root.querySelector('.td-scroll.is-drop');
        if (over) over.classList.remove('is-drop');
      });
    };
    M.taskRow = function taskRow(row, kind) {
      var done = kind === 'done' || kind === 'week';
      var sugg = kind === 'sugg';
      var blocked = !!row.blocked && !done;
      var range = done || sugg ? null : S.TM().rowRange(row, M.ui.today);
      var focus = M.ui.day.focus && M.ui.day.focus.row && M.ui.day.focus.row.id === row.id && !sugg && !done;
      var step = M.api.stepLine(row);
      var tomorrow = S.DM().addDays(M.ui.today, 1);
      var el = S.h('div', {
        class: 'td-task' + (kind === 'late' ? ' is-late' : '') + (blocked ? ' is-blocked' : '') + (done ? ' is-done' : '') + (focus ? ' is-focus' : ''),
        'data-card': row.id,
      }, [
        sugg ? S.h('span', { class: 'td-check td-check--none' }) : M.ringButton(row, done ? 'done' : kind),
        S.h('span', { class: 'td-task-main' }, [
          S.h('span', { class: 'td-task-name', text: row.name, onclick: function () { M.api.openCard(row); } }),
          step,
          M.api.placeLine(row),
        ]),
        S.h('span', { class: 'td-props' }, [
          M.prop('time', done || sugg ? null : M.timeChip(row, range)),
          M.prop('prio', M.api.prioBadge(row)),
          M.prop('est', kind === 'done' ? null : M.api.estChip(row)),
          M.prop('due', done ? null : sugg
            ? S.h('button', { class: 'td-btn td-btn--chip', type: 'button', title: 'Faire aujourd’hui', onclick: function () { M.api.plan(row, M.ui.today); } }, [S.icon('sun'), S.text('Aujourd’hui')])
            : M.api.dueChip(row)),
          M.prop('go', done || sugg ? null : S.h('button', {
            class: 'td-icon',
            type: 'button',
            title: 'Reporter à demain',
            'aria-label': 'Reporter « ' + row.name + ' » à demain',
            onclick: function () { M.api.plan(row, tomorrow); },
          }, [S.icon('arrow-curve-right')])),
        ]),
      ]);
      if (!done) M.draggable(el, row, function () { return S.DM().estimateOf(row); }, !!(range && range.explicit));
      return el;
    };
    M.focusCard = function focusCard(day) {
      var f = day.focus;
      if (!f) return null;
      var row = f.row;
      var step = S.WO() && S.WO().stepState(row);
      var action = step && step.text ? step.text : row.name;
      var tomorrow = S.DM().addDays(M.ui.today, 1);
      var label;
      var iconName = 'target-arrow';
      if (f.state === 'now') {
        label = f.block && f.block.kind === 'fixed' ? 'En ce moment · ' + S.TM().fmtRange(f.block.start, f.block.end) : 'À faire maintenant';
        iconName = 'player-play';
      } else if (f.state === 'soon') {
        label = f.block ? 'Prochaine · ' + S.TM().fmtClock(f.block.start) + ' (' + S.TM().inWords(f.minutesTo) + ')' : 'Prochaine action';
      } else if (f.state === 'late') {
        label = 'À rattraper';
      } else {
        label = 'Rien de prévu : je suggère';
        iconName = 'bulb';
      }
      var late = row.due && row.due < M.ui.today && S.DM().isOpen(row);
      var kids = [
        S.h('div', { class: 'td-focus-k' }, [S.icon(iconName), S.text(' ' + label)]),
        S.h('div', { class: 'td-focus-name', text: action, onclick: function () { M.api.openCard(row); } }),
        step && step.text ? S.h('div', { class: 'td-focus-card', text: row.name }) : null,
        M.api.placeLine(row),
        S.h('div', { class: 'td-focus-meta' }, [
          late ? S.h('span', { class: 'db-chip is-late' }, [S.icon('alert-circle'), S.text('En retard')]) : null,
          M.api.prioBadge(row),
          M.api.estChip(row),
          M.api.dueChip(row),
        ]),
      ];
      if (f.state === 'now' && f.block && f.block.kind === 'fixed') {
        kids.push(S.h('div', { class: 'td-focus-bar', title: Math.round(f.progress * 100) + ' % du temps prévu écoulé' }, [S.h('i', { style: 'width:' + Math.round(f.progress * 100) + '%' })]));
      }
      var actions = [];
      if (f.state === 'backlog') {
        actions.push(S.h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { M.api.plan(row, M.ui.today); } }, [S.icon('sun'), S.text('Faire aujourd’hui')]));
      } else {
        actions.push(S.h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { M.api.complete(row); } }, [S.icon('circle-check'), S.text('Terminer')]));
      }
      actions.push(S.h('button', { class: 'db-btn', type: 'button', onclick: function () { M.api.openCard(row); } }, [S.icon('external-link'), S.text('Ouvrir')]));
      if (f.state !== 'backlog') {
        actions.push(S.h('button', { class: 'db-btn', type: 'button', title: 'Reporter à demain', onclick: function () { M.api.plan(row, tomorrow); } }, [S.icon('arrow-curve-right'), S.text('Demain')]));
      }
      kids.push(S.h('div', { class: 'td-focus-actions' }, actions));
      return S.h('section', { class: 'td-focus is-' + f.state, 'data-card': row.id }, kids);
    };
    M.createFromText = function createFromText(raw, time, atDay) {
      var clean = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
      if (!clean) return false;
      var split = S.TM().splitClock(clean);
      var name = split ? split.name : clean;
      var at = time || (split ? split.time : '');
      var draft = S.DM().taskDraft(name, atDay || M.ui.today, M.api.parse, '', at);
      if (!draft) return false;
      if (at && !draft.time && !draft.vague) draft.time = at;
      M.api.createHere(draft);
      return true;
    };
    M.addLine = function addLine() {
      var onSubmit = function (title, input) {
        input.value = '';
        M.ui.refocusAdd = true;
        M.createFromText(title);
      };
      if (global.AddRow && typeof global.AddRow.line === 'function') {
        var line = global.AddRow.line({ label: global.AddRow.LABEL, onSubmit: onSubmit });
        line.classList.add('td-add');
        return line;
      }
      var input = S.h('input', { class: 'td-add-input', type: 'text', placeholder: 'Nouvelle carte…', 'aria-label': 'Nouvelle carte', autocomplete: 'off' });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); var v = input.value; input.value = ''; onSubmit(v, input); }
      });
      return S.h('div', { class: 'td-add' }, [S.icon('plus'), input]);
    };
    M.suggestionRows = function suggestionRows(day) {
      var skip = day.focus && day.focus.state === 'backlog' ? day.focus.row.id : null;
      return S.TM().suggest(M.api.rows(), M.ui.today, 6, skip);
    };
    M.buildWeek = function buildWeek(recap) {
      if (!recap.count) {
        return S.h('div', { class: 'td-empty' }, [
          S.icon('circle-check'),
          S.h('p', { text: 'Rien cette semaine.' }),
        ]);
      }
      var scroll = S.h('div', { class: 'td-scroll' });
      recap.days.forEach(function (day) {
        scroll.appendChild(S.h('div', { class: 'td-group' }, [
          S.h('div', { class: 'td-group-h' }, [
            S.h('span', { text: day.label }),
            day.minutes ? S.h('span', { class: 'td-day-min', text: S.TM().fmtDuration(day.minutes) }) : null,
          ]),
        ].concat(day.rows.map(function (r) { return M.taskRow(r, 'week'); }))));
      });
      scroll.addEventListener('scroll', function () { M.ui.scrolls.week = scroll.scrollTop; }, { passive: true });
      return scroll;
    };
    M.hideDoneButton = function hideDoneButton(count) {
      var HD = global.HideDone;
      if (!HD) return null;
      var hidden = HD.get();
      if (HD.decorate) {
        return HD.decorate(S.h('button', {
          class: 'td-btn td-btn--quiet' + (hidden ? ' is-on' : '') + (count ? '' : ' is-idle'),
          type: 'button',
          onclick: function () { HD.set(!hidden); },
        }), hidden, count);
      }
      return S.h('button', {
        class: 'td-btn td-btn--quiet' + (hidden ? ' is-on' : '') + (count ? '' : ' is-idle'),
        type: 'button',
        title: HD.title(hidden),
        onclick: function () { HD.set(!hidden); },
      }, [S.icon(HD.icon(hidden)), S.h('span', { text: HD.label(hidden, count) })]);
    };
    M.replanChip = function replanChip(rows) {
      return M.api.menuChip('td-replan', 'Replanifier les tâches en retard', 'calendar-event', 'Replanifier', function () {
        function go(iso, label) {
          return function () {
            M.api.planMany(rows.map(function (r) { return { id: r.id, date: iso, time: '' }; }), S.plural(rows.length, 'tâche replanifiée', 'tâches replanifiées') + ' : ' + label);
          };
        }
        var tomorrow = S.DM().addDays(M.ui.today, 1);
        return [
          { id: 'rep:today', label: 'À aujourd’hui', icon: 'sun', action: go(M.ui.today, 'aujourd’hui') },
          { id: 'rep:tomorrow', label: 'À demain', icon: 'arrow-curve-right', action: go(tomorrow, 'demain') },
          { id: 'rep:monday', label: 'À lundi', icon: 'calendar-event', action: go(M.nextMonday(M.ui.today), 'lundi') },
        ];
      });
    };
    M.buildTasksBody = function buildTasksBody(day) {
      var s = day.stats;
      var scroll = S.h('div', { class: 'td-scroll' });
      var todayRows = day.planned.map(function (r) { return M.taskRow(r, 'today'); });
      if (M.ui.showDone) day.done.forEach(function (r) { todayRows.push(M.taskRow(r, 'done')); });
      var rows = S.h('div', { class: 'td-rows' }, todayRows);
      if (!todayRows.length) {
        rows.appendChild(S.h('div', { class: 'td-empty' }, [
          S.icon(s.total ? 'circle-check' : 'sun'),
          S.h('p', { text: s.total ? 'Tout est fait.' : 'Rien de prévu aujourd’hui.' }),
          S.h('button', { class: 'db-btn', type: 'button', onclick: function () { M.api.go('orchestrator'); } }, [S.icon('calendar-event'), S.text('Ouvrir l’orchestrateur')]),
        ]));
      }
      scroll.appendChild(rows);
      scroll.appendChild(M.addLine());
      if (global.InsertGap && todayRows.length) {
        global.InsertGap.watch(rows, {
          item: '.td-task',
          placeholder: 'Titre…',
          onCreate: function (title) { M.createFromText(title); },
        });
      }
      scroll.addEventListener('scroll', function () { M.ui.scrolls.tasks = scroll.scrollTop; }, { passive: true });
      // Dropping a card here plans it for today without an hour (it also takes the hour off a block).
      scroll.addEventListener('dragover', function (e) {
        if (!M.ui.drag) return;
        e.preventDefault();
        scroll.classList.add('is-drop');
      });
      scroll.addEventListener('dragleave', function (e) {
        if (!scroll.contains(e.relatedTarget)) scroll.classList.remove('is-drop');
      });
      scroll.addEventListener('drop', function (e) {
        if (!M.ui.drag) return;
        e.preventDefault();
        scroll.classList.remove('is-drop');
        var row = M.findRow(M.ui.drag.id);
        M.ui.drag = null;
        if (row && !(S.DM().plannedDay(row) === M.ui.today && !S.TM().rowRange(row, M.ui.today))) M.api.plan(row, M.ui.today, '', '');
      });
      M.ui.listEl = scroll;
      return scroll;
    };
    M.hideDrop = function hideDrop() {
      var d = M.ui.root && M.ui.root.querySelector('.td-drop');
      if (d) d.hidden = true;
    };
    M.closePreview = function closePreview() {
      var p = M.ui.preview;
      if (!p) return;
      var id = p.id;
      M.ui.preview = null;
      if (p.ro) p.ro.disconnect();
      if (p.quick && typeof p.quick.destroy === 'function') p.quick.destroy();
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
      var Iso = global.Isolation;
      if (id && Iso && typeof Iso.read === 'function' && typeof Iso.clear === 'function') {
        var cur = Iso.read();
        if (cur && cur.kind === 'task' && cur.id === id && !(global.TaskFocus && global.TaskFocus.currentId && global.TaskFocus.currentId() === id)) Iso.clear();
      }
    };
    M.openPreview = function openPreview(row, anchor) {
      if (!row) return;
      if (M.ui.preview && M.ui.preview.id === row.id) { M.closePreview(); return; }
      M.closePreview();
      if (global.Isolation && typeof global.Isolation.set === 'function') {
        global.Isolation.set({ kind: 'task', id: row.id, label: row.name || '' });
      }
      var el = S.h('div', { class: 'td-pop', role: 'dialog', 'aria-label': row.name || 'Carte' });
      document.body.appendChild(el);
      var box = { id: row.id, el: el, quick: null, hold: false, anchor: anchor };
      M.ui.preview = box;
      function place() {
        if (M.ui.preview !== box || !anchor.isConnected) return;
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
        el.appendChild(S.h('div', { class: 'td-pop-name', text: row.name || 'Carte' }));
        place();
        return;
      }
      box.quick = global.CardQuick.mount(el, {
        t: M.api.t,
        cardId: row.id,
        name: row.name || '',
        onOpen: function () { M.closePreview(); M.api.openCard(M.findRow(row.id) || row); },
        onChange: function () { M.api.rerender(); },
        onHold: function (on) { if (M.ui.preview === box) box.hold = !!on; },
        onToast: function (m, kind) { if (M.api.setStatus) M.api.setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
        onGone: function () { M.closePreview(); M.api.rerender(); },
      });
      place();
      if (global.ResizeObserver) {
        var ro = new global.ResizeObserver(function () { place(); });
        ro.observe(el);
        box.ro = ro;
      }
    };
    M.blockTitle = function blockTitle(b) {
      var row = b.row;
      var when = S.TM().fmtRange(b.start, b.end);
      return row.name + ' · ' + when + (b.kind === 'flow' ? ' (proposé)' : '');
    };
    M.blockEl = function blockEl(b, scale, grid) {
      var row = b.row;
      var top = scale.yOf(b.start);
      var height = Math.max(S.MIN_BLOCK_PX - 3, scale.yOf(b.end) - top - 3);
      var lanes = b.lanes || 1;
      var lane = b.lane || 0;
      var done = b.kind === 'done';
      var past = !done && b.kind === 'fixed' && b.end <= M.ui.nowMin;
      var current = b.kind === 'fixed' && b.start <= M.ui.nowMin && M.ui.nowMin < b.end;
      var step = !done && S.WO() && S.WO().stepText ? S.WO().stepText(row) : '';
      var cls = 'td-block td-block--' + b.kind + (past ? ' is-past' : '') + (current ? ' is-current' : '') +
        (b.late ? ' is-late' : '') + (row.blocked && !done ? ' is-blocked' : '') + (height < 34 ? ' is-short' : '');
      var accent = S.accentOf(row);
      var kids = [];
      if (height >= 22) kids.push(M.ringButton(row, done ? 'done' : 'today'));
      var text1 = [S.h('span', { class: 'td-block-name', text: row.name })];
      if (height >= 46 && step) text1.push(S.h('span', { class: 'td-block-step', text: step }));
      kids.push(S.h('span', { class: 'td-block-text' }, text1));
      kids.push(S.h('span', { class: 'td-block-when', text: height >= 46 || lanes === 1 ? S.TM().fmtRange(b.start, b.end) : '' }));
      if (b.kind === 'flow') {
        kids.push(S.h('button', {
          class: 'td-pin',
          type: 'button',
          title: 'Fixer à ' + S.TM().fmtClock(b.start),
          'aria-label': 'Fixer « ' + row.name + ' » à ' + S.TM().fmtClock(b.start),
          onclick: function (e) {
            e.stopPropagation();
            M.api.plan(row, M.ui.today, '', S.TM().toClock(b.start));
          },
        }, [S.icon('pin')]));
      }
      var resizable = !done && !b.explicit;
      if (resizable) kids.push(S.h('span', { class: 'td-grip', title: 'Changer la durée' }));
      var el = S.h('div', {
        class: cls,
        'data-card': row.id,
        title: M.blockTitle(b),
        style: 'top:' + top + 'px;height:' + height + 'px;left:calc(' + (lane * 100 / lanes) + '% + 2px);width:calc(' + (100 / lanes) + '% - 4px)' + (accent ? ';--ac:' + accent : ''),
      }, kids);
      el.addEventListener('pointerdown', function (e) { el._py = e.clientY; });
      el.addEventListener('click', function (e) {
        if (Math.abs(e.clientY - el._py) > 4) return;
        if (e.target.closest && e.target.closest('button, .td-grip')) return;
        e.stopPropagation();
        M.openPreview(row, el);
      });
      if (!done) M.draggable(el, row, function () { return b.end - b.start; }, b.explicit);
      if (resizable) M.bindResize(el, el.querySelector('.td-grip'), b, scale);
      return el;
    };
    M.bindResize = function bindResize(el, grip, b, scale) {
      grip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        M.ui.resizing = true;
        el.setAttribute('draggable', 'false');
        el.classList.add('is-resizing');
        var y0 = e.clientY;
        var endY = scale.yOf(b.end);
        var top = scale.yOf(b.start);
        var end = b.end;
        var when = el.querySelector('.td-block-when');
        try { grip.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners below still follow the pointer */ }
        function move(ev) {
          var m = S.TM().snap(scale.minOf(endY + (ev.clientY - y0)), S.DROP_STEP);
          end = Math.max(b.start + S.DROP_STEP, Math.min(scale.to, m));
          el.style.height = Math.max(S.MIN_BLOCK_PX - 3, scale.yOf(end) - top - 3) + 'px';
          if (when) when.textContent = S.TM().fmtDuration(end - b.start);
        }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          M.ui.resizing = false;
          el.classList.remove('is-resizing');
          el.setAttribute('draggable', 'true');
          if (end !== b.end) M.api.setEstimate(b.row, end - b.start);
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
    };
    M.buildGutterWeather = function buildGutterWeather(scale) {
      var layer = S.h('div', { class: 'td-wx' });
      var model = S.WX().current().model;
      if (!model) return layer;
      var px = S.ZOOMS[M.ui.zoom];
      var every = px >= 72 ? 1 : px >= 56 ? 2 : 0;
      if (every) {
        scale.ticks(60).forEach(function (tk) {
          var hr = tk.minute / 60;
          if (hr % every || hr > 23) return;
          var hourly = S.WX().hourAt(model, M.ui.today, hr);
          if (!hourly) return;
          var d = S.WX().describe(hourly.code, hourly.isDay);
          var wet = hourly.pop != null && hourly.pop >= 40;
          layer.appendChild(S.h('span', { class: 'td-wx-h' + (wet ? ' is-wet' : ''), style: 'top:' + (tk.y + 15) + 'px', title: d.label + (hourly.pop != null && hourly.pop >= 20 ? ' · ' + S.WX().fmtPop(hourly.pop) : '') }, [
            S.WUI().glyph(d.kind, hourly.isDay, 16),
            S.h('span', { text: S.WX().fmtTemp(hourly.temp) }),
          ]));
        });
      }
      var today = S.WX().dayOf(model, M.ui.today);
      [['sunrise', today && today.sunrise, 'Lever du soleil'], ['sunset', today && today.sunset, 'Coucher du soleil']].forEach(function (s) {
        var m = S.WX().minutesOf(s[1]);
        if (m == null || m < scale.from || m > scale.to) return;
        layer.appendChild(S.h('div', { class: 'td-sun', style: 'top:' + scale.yOf(m) + 'px', title: s[2] + ' · ' + S.WUI().clock(s[1]) }, [
          S.icon(s[0]),
          S.h('span', { text: S.WUI().clock(s[1]) }),
        ]));
      });
      return layer;
    };
    M.repaintGutter = function repaintGutter() {
      if (!M.ui.wxLayer || !M.ui.wxLayer.isConnected || !M.ui.scale) return;
      var fresh = M.buildGutterWeather(M.ui.scale);
      M.ui.wxLayer.replaceWith(fresh);
      M.ui.wxLayer = fresh;
    };
    M.composer = function composer(grid, scale) {
      var c = M.ui.compose;
      var input = S.h('input', {
        class: 'td-compose-input',
        type: 'text',
        placeholder: 'Nouvelle carte…',
        'aria-label': 'Nouvelle carte à ' + S.TM().fmtClock(c.at),
        autocomplete: 'off',
        value: c.text || '',
      });
      var closed = false;
      function close() {
        if (closed) return;
        closed = true;
        M.ui.compose = null;
      }
      function finish(fromBlur) {
        if (closed) return;
        var value = input.value;
        if (!value.replace(/\s+/g, ' ').trim()) {
          close();
          if (fromBlur) M.api.rerender();
          return;
        }
        var at = c.at;
        close();
        M.createFromText(value, S.TM().toClock(at));
      }
      input.addEventListener('input', function () { c.text = input.value; });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(false); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); M.api.rerender(); }
      });
      input.addEventListener('blur', function () { setTimeout(function () { finish(true); }, 0); });
      var box = S.h('div', { class: 'td-compose', style: 'top:' + scale.yOf(c.at) + 'px' }, [
        S.h('span', { class: 'td-compose-t', text: S.TM().fmtClock(c.at) }),
        input,
      ]);
      M.ui.composeInput = input;
      return box;
    };
    M.buildPlan = function buildPlan(day) {
      var showDone = !!M.ui.showDone;
      var blocks = day.blocks.slice();
      if (showDone) blocks = blocks.concat(day.doneBlocks);
      S.TM().layoutLanes(blocks);
      var scale = S.TM().elasticScale(blocks, { from: day.window.from, to: day.window.to, pxPerHour: S.ZOOMS[M.ui.zoom], minBlockPx: S.MIN_BLOCK_PX });
      M.ui.scale = scale;
      var grid = S.h('div', { class: 'td-grid', style: 'height:' + Math.ceil(scale.height) + 'px' });

      var off = S.TM().offRanges(day.today, scale.from, scale.to);
      function minuteOff(minute) {
        for (var i = 0; i < off.length; i++) {
          if (minute >= off[i].start && minute < off[i].end) return true;
          if (minute === scale.to && minute === off[i].end) return true;
        }
        return false;
      }
      grid.appendChild(S.h('div', { class: 'td-past', style: 'height:' + scale.yOf(M.ui.nowMin) + 'px' }));
      off.forEach(function (iv) {
        var top = scale.yOf(iv.start);
        var height = scale.yOf(iv.end) - top;
        if (height < 1) return;
        grid.appendChild(S.h('div', { class: 'td-off', style: 'top:' + top + 'px;height:' + height + 'px' }));
      });
      scale.ticks(30).forEach(function (tk) {
        var hour = tk.minute % 60 === 0;
        var cls = 'td-hr' + (hour ? '' : ' td-hr--half') + (minuteOff(tk.minute) ? ' td-hr--off' : '');
        grid.appendChild(S.h('div', { class: cls, style: 'top:' + tk.y + 'px' }, hour ? [S.h('span', { class: 'td-hr-t', text: S.TM().fmtClock(tk.minute) })] : []));
      });
      M.ui.wxLayer = M.buildGutterWeather(scale);
      grid.appendChild(M.ui.wxLayer);
      blocks.forEach(function (b) { grid.appendChild(M.blockEl(b, scale, grid)); });

      var now = S.h('div', { class: 'td-now', style: 'top:' + scale.yOf(M.ui.nowMin) + 'px' }, [S.h('span', { class: 'td-now-t', text: S.TM().fmtClock(M.ui.nowMin) })]);
      now.hidden = M.ui.nowMin < scale.from || M.ui.nowMin > scale.to;
      grid.appendChild(now);
      var drop = S.h('div', { class: 'td-drop', hidden: true }, [S.h('span', { class: 'td-drop-t' })]);
      grid.appendChild(drop);
      var hint = S.h('div', { class: 'td-hint', hidden: true }, [S.h('span', { class: 'td-hint-t' })]);
      grid.appendChild(hint);
      if (M.ui.compose) grid.appendChild(M.composer(grid, scale));

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
        return M.ui.compose ? scale.yOf(M.ui.compose.at) + 17 : null;
      }
      function hideHint() {
        hint.hidden = true;
        coverGutter(composeY());
      }
      if (M.ui.compose) window.requestAnimationFrame(function () { if (grid.isConnected) coverGutter(composeY()); });

      function minuteAt(clientY, step) {
        var rect = grid.getBoundingClientRect();
        var m = S.TM().snap(scale.minOf(clientY - rect.top), step);
        return Math.max(scale.from, Math.min(scale.to - step, m));
      }

      grid.addEventListener('dragover', function (e) {
        if (!M.ui.drag) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (err) { /* ignore */ }
        var m = minuteAt(e.clientY - M.ui.drag.offset, S.DROP_STEP);
        var top = scale.yOf(m);
        drop.hidden = false;
        drop.style.top = top + 'px';
        drop.style.height = Math.max(S.MIN_BLOCK_PX - 3, scale.yOf(Math.min(scale.to, m + M.ui.drag.duration)) - top - 3) + 'px';
        drop.firstChild.textContent = S.TM().fmtRange(m, m + M.ui.drag.duration);
        hideHint();
      });
      grid.addEventListener('dragleave', function (e) {
        if (!grid.contains(e.relatedTarget)) M.hideDrop();
      });
      grid.addEventListener('drop', function (e) {
        if (!M.ui.drag) return;
        e.preventDefault();
        var info = M.ui.drag;
        var m = minuteAt(e.clientY - info.offset, S.DROP_STEP);
        M.hideDrop();
        M.ui.drag = null;
        var row = M.findRow(info.id);
        if (!row) return;
        if (info.explicit) M.api.plan(row, M.ui.today, '', S.TM().toClock(m), S.TM().toClock(Math.min(1439, m + info.duration)));
        else M.api.plan(row, M.ui.today, '', S.TM().toClock(m));
      });

      function overEmpty(e) {
        return !M.ui.drag && !M.ui.resizing && !M.ui.compose && e.target.closest && !e.target.closest('.td-block, .td-compose');
      }
      grid.addEventListener('pointermove', function (e) {
        if (!overEmpty(e) || e.pointerType === 'touch') { hideHint(); return; }
        var m = minuteAt(e.clientY, S.CLICK_STEP);
        hint.hidden = false;
        hint.style.top = scale.yOf(m) + 'px';
        hint.firstChild.textContent = S.TM().fmtOffset(m - M.ui.nowMin);
        coverGutter(scale.yOf(m));
      });
      grid.addEventListener('pointerleave', hideHint);
      grid.addEventListener('click', function (e) {
        if (!overEmpty(e)) return;
        M.ui.compose = { at: minuteAt(e.clientY, S.CLICK_STEP), text: '' };
        M.api.rerender();
      });

      var scroller = S.h('div', { class: 'td-plan-scroll' }, [grid]);
      scroller.addEventListener('scroll', function () { M.ui.planScroll = scroller.scrollTop; }, { passive: true });
      M.ui.planEl = scroller;

      var late = day.flow.filter(function (b) { return b.late; }).map(function (b) { return b.row; }).concat(day.overflow);
      var warn = null;
      if (late.length) {
        var tomorrow = S.DM().addDays(M.ui.today, 1);
        warn = S.h('div', { class: 'td-warn' }, [
          S.icon('alert-triangle'),
          S.h('span', { text: S.plural(late.length, 'tâche dépasse', 'tâches dépassent') + ' ' + S.TM().fmtClock(S.TM().WORK_END) }),
          S.h('button', {
            class: 'td-btn td-btn--chip',
            type: 'button',
            onclick: function () {
              M.api.planMany(late.map(function (r) { return { id: r.id, date: tomorrow, time: '' }; }), S.plural(late.length, 'tâche reportée', 'tâches reportées') + ' à demain');
            },
          }, [S.icon('arrow-curve-right'), S.text('Reporter à demain')]),
        ]);
      }

      var tools = [];
      var ready = day.flow.filter(function (b) { return !b.late; });
      if (ready.length) {
        tools.push(S.h('button', {
          class: 'td-btn td-btn--primary',
          type: 'button',
          title: 'Écrire ces heures dans les cartes',
          onclick: function () {
            M.api.planMany(ready.map(function (b) { return { id: b.id, date: M.ui.today, time: S.TM().toClock(b.start) }; }), S.plural(ready.length, 'tâche planifiée', 'tâches planifiées'));
          },
        }, [S.icon('wand'), S.text('Planifier ma journée')]));
      }
      tools.push(S.h('button', { class: 'td-icon', type: 'button', title: 'Aller à maintenant', 'aria-label': 'Aller à maintenant', onclick: function () { M.scrollToNow(true); } }, [S.icon('current-location')]));
      tools.push(S.h('button', {
        class: 'td-icon',
        type: 'button',
        title: 'Resserrer les heures',
        'aria-label': 'Resserrer les heures',
        disabled: M.ui.zoom <= 0,
        onclick: function () { M.setZoom(M.ui.zoom - 1); },
      }, [S.icon('zoom-out')]));
      tools.push(S.h('button', {
        class: 'td-icon',
        type: 'button',
        title: 'Étirer les heures',
        'aria-label': 'Étirer les heures',
        disabled: M.ui.zoom >= S.ZOOMS.length - 1,
        onclick: function () { M.setZoom(M.ui.zoom + 1); },
      }, [S.icon('zoom-in')]));

      M.ui.planTools = tools;
      var wrap = S.h('div', { class: 'td-plan-wrap' });
      if (warn) wrap.appendChild(warn);
      wrap.appendChild(scroller);
      return wrap;
    };
    M.setZoom = function setZoom(i) {
      M.ui.zoom = Math.max(0, Math.min(S.ZOOMS.length - 1, i));
      S.remember(S.KEYS.zoom, M.ui.zoom);
      // Keep the clock where it is on screen when the hours stretch.
      M.ui.planScroll = null;
      M.api.rerender();
    };
    M.scrollToNow = function scrollToNow(smooth) {
      var el = M.ui.planEl;
      if (!el || !M.ui.scale) return;
      var focusMin = M.ui.nowMin >= M.ui.scale.from && M.ui.nowMin <= M.ui.scale.to ? M.ui.nowMin : M.ui.day && M.ui.day.blocks[0] ? M.ui.day.blocks[0].start : M.ui.scale.from;
      var y = Math.max(0, M.ui.scale.yOf(focusMin) - el.clientHeight * 0.3);
      if (smooth && el.scrollTo) el.scrollTo({ top: y, behavior: 'smooth' });
      else el.scrollTop = y;
    };
    M.loadLayout = function loadLayout() {
      if (M.ui.layout) return M.ui.layout;
      var parsed = null;
      var raw = S.recall(S.KEYS.layout);
      if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      }
      M.ui.layout = S.TM().layout.normalize(parsed);
      return M.ui.layout;
    };
    M.commitLayout = function commitLayout(next) {
      M.ui.layout = S.TM().layout.normalize(next);
      S.remember(S.KEYS.layout, JSON.stringify(M.ui.layout));
      M.api.rerender();
    };
    M.placed = function placed(id) {
      var items = M.ui.layout && M.ui.layout.items;
      if (!items) return null;
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
      return null;
    };
    M.gridStyle = function gridStyle(it) {
      return 'grid-column:' + (it.c + 1) + ' / span ' + it.w + ';grid-row:' + (it.r + 1) + ' / span ' + it.h;
    };
    M.cellAt = function cellAt(board, clientX, clientY, w) {
      var rect = board.getBoundingClientRect();
      var x = clientX - rect.left + board.scrollLeft;
      var y = clientY - rect.top + board.scrollTop;
      var cols = S.TM().layout.COLS;
      var colW = Math.max(1, board.clientWidth / cols);
      var c = Math.round(x / colW);
      var r = Math.round(y / S.TM().layout.ROW);
      return { c: Math.max(0, Math.min(cols - (w || 1), c)), r: Math.max(0, r) };
    };
    M.placeSlot = function placeSlot(c, r, w, hh) {
      if (!M.ui.boardEl) return;
      if (!M.ui.slot) {
        M.ui.slot = S.h('div', { class: 'td-slot' });
        M.ui.boardEl.appendChild(M.ui.slot);
      }
      M.ui.slot.hidden = false;
      M.ui.slot.style.gridColumn = (c + 1) + ' / span ' + w;
      M.ui.slot.style.gridRow = (r + 1) + ' / span ' + hh;
    };
    M.clearSlot = function clearSlot() {
      if (M.ui.slot && M.ui.slot.parentNode) M.ui.slot.parentNode.removeChild(M.ui.slot);
      M.ui.slot = null;
    };
    M.beginRename = function beginRename(id) {
      if (!M.ui.arrange || M.ui.editing || !M.ui.root) return;
      var el = M.ui.root.querySelector('.td-widget--' + id);
      if (!el) return;
      M.ui.editing = id;
      var input = S.h('input', {
        class: 'td-widget-name',
        type: 'text',
        value: S.TM().layout.label(M.ui.layout, id),
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
        M.ui.editing = null;
        if (save) M.commitLayout(S.TM().layout.rename(M.ui.layout, id, input.value));
        else M.api.rerender();
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', function () { finish(true); });
    };
    M.startMove = function startMove(e, id, grip) {
      if (!M.ui.arrange || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var el = grip.closest('.td-widget');
      var board = M.ui.boardEl;
      var geom = (el && el._geom) || M.placed(id);
      if (!el || !board || !geom) return;
      var x0 = e.clientX;
      var y0 = e.clientY;
      var started = false;
      var cell = { c: geom.c, r: geom.r };
      var span = M.ui.narrow ? S.TM().layout.COLS : geom.w;
      M.ui.widgetGesture = true;
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
        cell = M.cellAt(board, box.left, box.top, span);
        M.placeSlot(cell.c, cell.r, span, geom.h);
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        M.ui.widgetGesture = false;
        M.clearSlot();
        board.classList.remove('is-gesturing');
        if (!started) {
          el.classList.remove('is-lifting');
          el.style.transform = '';
          el.style.zIndex = '';
          return;
        }
        M.commitLayout(S.TM().layout.move(M.ui.layout, id, cell.c, cell.r));
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    };
    M.startResize = function startResize(e, id, axis, handle) {
      if (!M.ui.arrange || e.button !== 0 || (M.ui.narrow && axis !== 's')) return;
      e.preventDefault();
      e.stopPropagation();
      var el = handle.closest('.td-widget');
      var board = M.ui.boardEl;
      var geom = (el && el._geom) || M.placed(id);
      if (!el || !board || !geom) return;
      var x0 = e.clientX;
      var y0 = e.clientY;
      var rect = el.getBoundingClientRect();
      var preview = { w: geom.w, h: geom.h };
      M.ui.widgetGesture = true;
      el.classList.add('is-resizing-widget');
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners still follow the pointer */ }
      function onMove(ev) {
        var colW = Math.max(1, board.clientWidth / S.TM().layout.COLS);
        var w = geom.w;
        var hh = geom.h;
        if (axis !== 's') w = Math.round((rect.width + 12 + (ev.clientX - x0)) / colW);
        if (axis !== 'e') hh = Math.round((rect.height + 12 + (ev.clientY - y0)) / S.TM().layout.ROW);
        w = Math.max(S.TM().layout.MIN_W, Math.min(S.TM().layout.COLS - geom.c, w));
        hh = Math.max(S.TM().layout.MIN_H, Math.min(S.TM().layout.MAX_H, hh));
        preview = { w: w, h: hh };
        el.style.gridColumn = (geom.c + 1) + ' / span ' + (M.ui.narrow ? S.TM().layout.COLS : w);
        el.style.gridRow = (geom.r + 1) + ' / span ' + hh;
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        M.ui.widgetGesture = false;
        el.classList.remove('is-resizing-widget');
        if (preview.w === geom.w && preview.h === geom.h) return;
        M.commitLayout(S.TM().layout.resize(M.ui.layout, id, M.ui.narrow ? null : preview.w, preview.h));
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    };
    M.widgetTools = function widgetTools(id) {
      var label = S.TM().layout.label(M.ui.layout, id);
      var grip = S.h('button', { class: 'td-icon td-widget-grip', type: 'button', title: 'Déplacer', 'aria-label': 'Déplacer ' + label }, [S.icon('grip-vertical')]);
      var edit = S.h('button', { class: 'td-icon td-widget-edit', type: 'button', title: 'Renommer', 'aria-label': 'Renommer ' + label }, [S.icon('pencil')]);
      var close = S.h('button', { class: 'td-icon td-widget-close', type: 'button', title: 'Fermer', 'aria-label': 'Fermer ' + label }, [S.icon('x')]);
      grip.addEventListener('pointerdown', function (e) { M.startMove(e, id, grip); });
      edit.addEventListener('click', function (e) { e.stopPropagation(); M.beginRename(id); });
      close.addEventListener('click', function (e) {
        e.stopPropagation();
        M.commitLayout(S.TM().layout.close(M.ui.layout, id));
      });
      return S.h('div', { class: 'td-widget-tools' }, [grip, edit, close]);
    };
    M.widget = function widget(id, geom, body, opts) {
      opts = opts || {};
      var label = S.TM().layout.label(M.ui.layout, id);
      var info = opts.sky ? M.skyScene() : null;
      var tools = M.ui.arrange ? M.widgetTools(id) : null;
      var head = null;
      if (opts.head !== false) {
        var title = S.h('h2', { class: 'td-h td-widget-title', text: label });
        title.addEventListener('dblclick', function (e) {
          e.preventDefault();
          e.stopPropagation();
          M.beginRename(id);
        });
        var kids = [title];
        if (opts.count != null) kids.push(S.h('span', { class: 'td-count', text: String(opts.count) }));
        kids.push(S.h('span', { class: 'td-spacer' }));
        (opts.extra || []).forEach(function (n) { if (n) kids.push(n); });
        if (tools) kids.push(tools);
        head = S.h('div', { class: 'td-col-head' }, kids);
      }
      if (body) body.classList.add('td-widget-body');
      var el = S.h('section', {
        class: 'td-widget td-widget--' + id + (opts.sky ? ' td-widget--sky' : ''),
        'data-widget': id,
        'aria-label': label,
        style: M.gridStyle(geom),
      }, [
        info ? S.WUI().sky(info.scene, info.isDay) : null,
        opts.head === false ? tools : null,
        head,
        body,
        M.ui.arrange && !M.ui.narrow ? S.h('span', { class: 'td-resize td-resize-e' }) : null,
        M.ui.arrange ? S.h('span', { class: 'td-resize td-resize-s' }) : null,
        M.ui.arrange && !M.ui.narrow ? S.h('span', { class: 'td-resize td-resize-se' }) : null,
      ]);
      if (info) el.setAttribute('data-scene', info.scene);
      el._geom = geom;
      Array.prototype.forEach.call(el.querySelectorAll('.td-resize'), function (handle) {
        var axis = handle.classList.contains('td-resize-e') ? 'e' : handle.classList.contains('td-resize-s') ? 's' : 'se';
        handle.addEventListener('pointerdown', function (e) { M.startResize(e, id, axis, handle); });
      });
      return el;
    };
    M.openWidgetMenu = function openWidgetMenu(btn) {
      var L = S.TM().layout;
      var have = {};
      M.ui.layout.items.forEach(function (it) { have[it.id] = true; });
      var items = L.widgets().map(function (w) {
        return {
          id: 'widget:' + w.id,
          label: w.label,
          icon: w.icon,
          checked: !!have[w.id],
          action: function () {
            M.commitLayout(have[w.id] ? L.close(M.ui.layout, w.id) : L.open(M.ui.layout, w.id));
          },
        };
      });
      if (!L.same(M.ui.layout, L.defaults())) {
        items.push({ sep: true });
        items.push({
          id: 'layout:reset',
          label: 'Disposition d’origine',
          icon: 'rotate',
          action: function () { M.commitLayout(L.defaults()); },
        });
      }
      if (!global.ContextMenu) return;
      var rect = btn.getBoundingClientRect();
      global.ContextMenu.show({ clientX: rect.left, clientY: rect.top }, items);
    };
    M.buildBoard = function buildBoard(day) {
      var geoms = {};
      S.TM().layout.present(M.loadLayout(), M.ui.narrow).forEach(function (it) { geoms[it.id] = it; });
      var board = S.h('div', { class: 'td-board' });
      M.ui.boardEl = board;
      var s = day.stats;
      if (geoms.hello) board.appendChild(M.widget('hello', geoms.hello, M.buildHello(), { head: false, sky: true }));
      if (geoms.weather) board.appendChild(M.widget('weather', geoms.weather, M.buildWeatherPanel(M.skyScene()), { head: false, sky: true }));
      if (geoms.focus) board.appendChild(M.widget('focus', geoms.focus, M.focusCard(day), { head: false }));
      if (geoms.late) {
        board.appendChild(M.widget('late', geoms.late, S.h('div', { class: 'td-rows td-group--late' }, day.overdue.map(function (r) { return M.taskRow(r, 'late'); })), {
          count: day.overdue.length,
          extra: day.overdue.length ? [M.replanChip(day.overdue)] : [],
        }));
      }
      if (geoms.tasks) {
        board.appendChild(M.widget('tasks', geoms.tasks, M.buildTasksBody(day), {
          count: s.open,
          extra: [M.hideDoneButton(s.done)],
        }));
      }
      if (geoms.sugg) {
        var sugg = M.suggestionRows(day);
        board.appendChild(M.widget('sugg', geoms.sugg, S.h('div', { class: 'td-rows' }, sugg.map(function (r) { return M.taskRow(r, 'sugg'); })), {
          count: sugg.length,
        }));
      }
      if (geoms.review) {
        var review = M.api.review();
        if (review) review.classList.add('td-review');
        board.appendChild(M.widget('review', geoms.review, review, {}));
      }
      if (geoms.week) {
        var recap = S.TM().weekRecap(M.api.rows(), M.ui.today);
        board.appendChild(M.widget('week', geoms.week, M.buildWeek(recap), {
          count: recap.count,
          extra: recap.minutes ? [S.h('span', { class: 'td-week-min', text: S.TM().fmtDuration(recap.minutes) })] : [],
        }));
      }
      if (geoms.plan) board.appendChild(M.widget('plan', geoms.plan, M.buildPlan(day), { extra: M.ui.planTools || [] }));
      return board;
    };
    M.captureScrolls = function captureScrolls() {
      if (!M.ui.root) return;
      Array.prototype.forEach.call(M.ui.root.querySelectorAll('[data-widget]'), function (w) {
        var sc = w.querySelector('.td-scroll, .td-plan-scroll');
        if (sc) M.ui.scrolls[w.getAttribute('data-widget')] = sc.scrollTop;
      });
      if (M.ui.planEl && M.ui.planScroll != null) M.ui.planScroll = M.ui.planEl.scrollTop;
    };
    M.watchWidth = function watchWidth(container) {
      if (M.ui.watched || !global.ResizeObserver) return;
      M.ui.watched = true;
      var ro = new ResizeObserver(function () {
        var w = container.clientWidth || 0;
        var narrow = w > 0 && w < 900;
        if (narrow === M.ui.narrow || M.ui.widgetGesture || M.ui.editing) return;
        M.ui.narrow = narrow;
        if (M.ui.root && M.ui.root.isConnected && M.api.section() === 'today') M.api.rerender();
      });
      ro.observe(container);
    };
    M.celebrate = function celebrate(day) {
      var open = day.stats.open;
      var was = M.ui.prevOpen;
      M.ui.prevOpen = open;
      if (was != null && was > 0 && open === 0 && day.stats.done > 0 && global.CelebrationEffects && typeof global.CelebrationEffects.play === 'function') {
        try { global.CelebrationEffects.play('confetti', { sound: false }); } catch (e) { /* a celebration never blocks the page */ }
      }
    };
    M.render = function render(container) {
      M.start();
      M.askName();
      M.captureScrolls();
      M.loadLayout();
      var width = container.clientWidth || 0;
      if (width > 0) M.ui.narrow = width < 900;
      var st = M.api.state();
      var now = new Date();
      M.ui.now = now;
      M.ui.nowMin = now.getHours() * 60 + now.getMinutes();
      M.ui.today = M.api.today();
      M.ui.showDone = global.HideDone ? !global.HideDone.get() : false;
      M.ui.listEl = null;
      M.ui.planEl = null;
      M.ui.planTools = null;
      var day = S.TM().buildDay(M.api.rows(), { today: M.ui.today, nowMin: M.ui.nowMin, capacity: st.capacity });
      M.ui.day = day;
      M.ui.flowKey = Math.floor(M.ui.nowMin / S.TM().STEP);
      M.ui.blockById = {};
      day.blocks.forEach(function (b) { M.ui.blockById[b.id] = b; });

      var page = S.h('div', { class: 'td-page' + (M.ui.narrow ? ' is-narrow' : '') + (M.ui.arrange ? ' is-arrange' : '') });
      page.appendChild(M.buildBoard(day));
      page.appendChild(S.h('div', { class: 'td-board-tools' }, [
        S.h('button', {
          class: 'td-icon td-arrange' + (M.ui.arrange ? ' is-on' : ''),
          type: 'button',
          title: M.ui.arrange ? 'Terminé' : 'Modifier',
          'aria-label': M.ui.arrange ? 'Terminé' : 'Modifier',
          'aria-pressed': M.ui.arrange ? 'true' : 'false',
          onclick: function (e) {
            e.stopPropagation();
            M.ui.arrange = !M.ui.arrange;
            M.api.rerender();
          },
        }, [S.icon('layout-grid')]),
        S.h('button', {
          class: 'td-icon td-widgets-add',
          type: 'button',
          title: 'Widgets',
          'aria-label': 'Widgets',
          onclick: function (e) { e.stopPropagation(); M.openWidgetMenu(e.currentTarget); },
        }, [S.icon('plus')]),
      ]));
      container.appendChild(page);
      M.ui.root = page;
      M.watchWidth(container);

      if (M.ui.listEl) M.ui.listEl.scrollTop = M.ui.scrolls.tasks || 0;
      var weekScroll = page.querySelector('.td-widget--week .td-scroll');
      if (weekScroll) weekScroll.scrollTop = M.ui.scrolls.week || 0;
      if (M.ui.planEl) {
        if (M.ui.planScroll == null) M.scrollToNow(false);
        else M.ui.planEl.scrollTop = M.ui.planScroll;
      }
      if (M.ui.compose && M.ui.composeInput && M.ui.composeInput.isConnected) M.ui.composeInput.focus({ preventScroll: true });
      else if (M.ui.refocusAdd) {
        M.ui.refocusAdd = false;
        var add = page.querySelector('.td-add input');
        if (add) add.focus({ preventScroll: true });
      }
      M.celebrate(day);
      setTimeout(function () { S.WX().refresh(); }, 0);
    };
    },
    run: function (M) {
    M.ui = {
      zoom: Math.max(0, Math.min(S.ZOOMS.length - 1, parseInt(S.recall(S.KEYS.zoom), 10) || S.DEFAULT_ZOOM)),
      week: S.recall(S.KEYS.week) === '1',
      sugg: S.recall(S.KEYS.sugg), // '1' open, '0' closed, null: open only when the day is light
      layout: null,
      scrolls: {},
      narrow: false,
      widgetGesture: false,
      arrange: false, // Modifier: resize, move, rename, close. Off until the visitor turns it on.
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
    return { v: { render: M.render } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
