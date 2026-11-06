/**
 * dashboard-ui: mount() part 3 of 3.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see dashboard-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.DashboardUiParts = global.DashboardUiParts || {});
  var P = (global.DashboardUiPartsMountMount = global.DashboardUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.renderOrchestrator = function renderOrchestrator() {
      var layout = M.ensureZoom();
      var scale = layout.scale;
      var nowM = (function () {
        if (M.state.zoomFocalMs != null && M.state.zoomDay && M.state.zoomDay !== M.today) {
          var at = new Date(M.state.zoomFocalMs);
          return at.getHours() * 60 + at.getMinutes();
        }
        var d = new Date();
        return d.getHours() * 60 + d.getMinutes();
      })();
      var manual = scale === 'vague' || scale === 'hour' || scale === 'minute';
      var planFrom = (scale === 'hour' || scale === 'minute') ? (M.state.zoomDay || M.today) : M.today;
      // My row is what is mine or nobody's; with other people on the board they get a row each, below.
      var team = M.teamList();
      var everyRow = M.viewRows();
      var boardRows = team.length ? S.PB().mineRows(everyRow, M.state.me) : everyRow;
      var buckets = S.DM().horizonPlan(boardRows, planFrom, scale, M.state.capacity, M.vagueOptions(), nowM);
      var pool = S.DM().unplanned(boardRows);
      if (manual && scale !== 'vague' && S.DM().untimed) pool = pool.concat(S.DM().untimed(boardRows, M.today));
      var moves = manual ? [] : (scale === 'day'
        ? S.DM().autoPlan(boardRows, M.today, S.HORIZON, M.state.capacity)
        : S.DM().placeAuto(boardRows, M.today, scale, M.state.capacity, M.vagueOptions()));
      var autoBtn = moves.length ? S.h('button', {
        class: 'db-btn db-btn--primary db-auto',
        type: 'button',
        onclick: function () {
          moves.forEach(function (m) {
            var row = M.state.rows.filter(function (r) { return r.id === m.id; })[0];
            if (row) { row.start = m.date; row.due = m.date; row.dueVague = ''; row.dueMode = 'precise'; row.startTime = ''; row.dueTime = ''; }
          });
          M.render();
          var place = S.DT().planAt
            ? function (m) { return S.DT().planAt(M.t, m.id, m.date, '', ''); }
            : function (m) { return S.DT().planDay(M.t, m.id, m.date); };
          M.write(moves.reduce(function (p, m) { return p.then(function () { return place(m); }); }, Promise.resolve()), moves.length + (moves.length > 1 ? ' tâches planifiées' : ' tâche planifiée'));
        },
      }, [S.icon('wand'), document.createTextNode('Planifier auto')]) : null;
      var list = S.DM().SCALES || [];
      var label = '';
      for (var si = 0; si < list.length; si++) if (list[si].id === scale) label = list[si].label;
      var bounds = S.DM().zoomBounds();
      var range = S.h('input', {
        class: 'db-zoom-range',
        type: 'range',
        min: '0',
        max: '1000',
        step: '1',
        value: String(S.DM().zoomSlider(layout.pxPerDay)),
        'aria-label': 'Zoom',
        title: label,
      });
      range.addEventListener('input', function () {
        if (M.zoomAnim.raf) { cancelAnimationFrame(M.zoomAnim.raf); M.zoomAnim.raf = 0; }
        var p = S.DM().zoomFromSlider(range.value);
        M.zoomAnim.cur = p;
        M.zoomAnim.target = p;
        M.applyZoom(p, null);
      });
      function nudge(dir) {
        var base = M.zoomAnim.raf ? M.zoomAnim.target : M.state.zoomP;
        M.easeZoom(base * (dir < 0 ? 1.5 : 1 / 1.5), null);
      }
      var scales = S.h('div', { class: 'db-zoom' }, [
        S.h('button', {
          class: 'db-zoom-btn',
          type: 'button',
          title: 'Zoom avant',
          disabled: layout.pxPerDay >= bounds.max * 0.985,
          onclick: function () { nudge(-1); },
        }, [S.icon('zoom-in')]),
        range,
        S.h('button', {
          class: 'db-zoom-btn',
          type: 'button',
          title: 'Zoom arrière',
          disabled: scale === 'vague',
          onclick: function () { nudge(1); },
        }, [S.icon('zoom-out')]),
        S.h('span', { class: 'db-zoom-label' }, [
          S.icon(S.SCALE_ICON[scale] || 'calendar'),
          S.h('span', { class: 'db-zoom-name', text: label }),
        ]),
      ]);
      function dayBar(d) {
        var pct = d.capacity > 0 ? Math.min(100, Math.round((d.used / d.capacity) * 100)) : 0;
        var usedLabel = (d.used ? S.DM().formatMinutes(d.used) : '0') + ' / ' + S.DM().formatMinutes(d.capacity);
        var bar = S.h('div', {
          class: 'db-meter-hit',
          title: usedLabel,
        }, [
          S.h('span', { class: 'db-meter' + (d.over ? ' is-over' : ''), 'aria-hidden': 'true' }, [
            S.h('span', { class: 'db-meter-fill', style: 'width:' + pct + '%' }),
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
        if (M.state.composer === key) {
          var input = S.h('input', {
            class: 'db-add-input',
            type: 'text',
            placeholder: 'Nouvelle carte…',
            'aria-label': 'Nouvelle carte',
            autocomplete: 'off',
            value: M.state.composerText || '',
          });
          var closed = false;
          function finish(fromBlur) {
            if (closed) return;
            var parse = global.QuickParse && global.QuickParse.parse;
            var draft = S.DM().taskDraft(input.value, place.date, parse, place.vague, place.time);
            if (!draft) {
              if (fromBlur && M.state.composer === key) {
                closed = true;
                M.state.composer = null;
                M.state.composerText = '';
                M.render();
              }
              return;
            }
            closed = true;
            M.state.composerText = '';
            if (fromBlur && M.state.composer === key) M.state.composer = null;
            M.createHere(draft);
          }
          input.addEventListener('input', function () { M.state.composerText = input.value; });
          input.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(false); }
            else if (e.key === 'Escape') {
              e.preventDefault();
              closed = true;
              M.state.composer = null;
              M.state.composerText = '';
              M.render();
            }
          });
          input.addEventListener('blur', function () { setTimeout(function () { finish(true); }, 0); });
          return input;
        }
        return S.h('button', {
          class: 'db-add',
          type: 'button',
          onclick: function () {
            if (M.state.composer !== key) M.state.composerText = '';
            M.state.composer = key;
            M.render();
          },
        }, [S.icon('plus'), S.h('span', { text: 'Nouvelle carte' })]);
      }
      function column(extra, head, bar, body, spec) {
        var cards = (body || []).slice();
        cards.push(addSlot(spec));
        var bodyEl = S.h('div', { class: 'db-col-body' }, cards);
        if (global.InsertGap) {
          global.InsertGap.watch(bodyEl, {
            item: '.db-task',
            tail: '.db-add, .db-add-input',
            placeholder: 'Titre…',
            onCreate: function (title) {
              var parse = global.QuickParse && global.QuickParse.parse;
              var place = columnPlace(spec);
              var draft = S.DM().taskDraft(title, place.date, parse, place.vague, place.time);
              if (draft) M.createHere(draft);
            },
          });
        }
        return M.dropZone(S.h('section', { class: 'db-col-card' + (extra ? ' ' + extra : '') }, [
          S.h('header', { class: 'db-col-head' }, head),
          bar,
          bodyEl,
        ]), spec);
      }
      function bucketLabel(b) {
        if (b.time) return S.clockLabel(b.time);
        if (scale === 'vague') return M.VAGUE_SHORT[b.vague] || b.label || b.key;
        if (scale === 'day') return S.dayLabel(b.date, M.today);
        if (scale === 'week') {
          if (M.today >= b.date && M.today < b.end) return 'Cette semaine';
          if (M.today >= S.DM().addDays(b.date, -7) && M.today < b.date) return 'Semaine prochaine';
          return S.TM() ? S.TM().formatDay(b.date) : b.date;
        }
        if (scale === 'month') {
          var d = new Date(b.date + 'T00:00:00');
          var y = d.getFullYear();
          var thisY = new Date(M.today + 'T00:00:00').getFullYear();
          return M.MONTHS_FR[d.getMonth()] + (y === thisY ? '' : ' ' + y);
        }
        return b.key;
      }
      function bucketIcon(b) {
        if (b.time) return 'clock';
        if (scale === 'day') return S.dayIconName(b.date, M.today);
        return S.SCALE_ICON[scale] || 'calendar';
      }
      var spacer = S.h('div', { class: 'db-meter-hit db-meter-hit--spacer', 'aria-hidden': 'true' }, [
        S.h('span', { class: 'db-meter' }),
      ]);
      var poolBody = pool.length
        ? pool.map(function (r) { return M.taskCard(r, true); })
        : [S.h('div', { class: 'db-col-empty', text: 'Tout est planifié.' })];
      if (autoBtn) poolBody.unshift(autoBtn);
      var poolCol = column('db-col-card--pool', [
        S.h('span', { class: 'db-col-name', text: 'À planifier' }),
        S.h('span', { class: 'db-col-count', text: String(pool.length) }),
      ], spacer, poolBody, '');
      function isCurrent(b) {
        var slotNow = b.time && b.date === M.today && S.DM().parseClock(b.time) <= nowM && nowM < S.DM().parseClock(b.endTime);
        return b.time ? slotNow : (b.date && M.today >= b.date && M.today < b.end);
      }
      function bucketSpec(b) {
        return scale === 'vague'
          ? { vague: b.vague }
          : b.time
            ? { iso: b.date, time: b.time }
            : { iso: b.date < M.today ? M.today : b.date };
      }
      var days = buckets.map(function (b) {
        var current = isCurrent(b);
        var extra = (current ? 'is-today' : '') + (scale === 'day' && S.isWeekend(b.date) ? ' is-weekend' : '');
        var head = [
          S.h('span', { class: 'db-col-name', title: scale === 'vague' ? (b.label || null) : null }, [
            S.icon(bucketIcon(b), 'db-day-icon'),
            document.createTextNode(bucketLabel(b)),
          ]),
        ];
        if (scale === 'vague') head.push(S.h('span', { class: 'db-col-count', text: String(b.tasks.length) }));
        else if (b.used) head.push(S.h('span', { class: 'db-cap-n' + (b.over ? ' is-over' : ''), text: S.DM().formatMinutes(b.used) }));
        var spec = bucketSpec(b);
        var node = column(extra.trim(), head, scale === 'vague' ? spacer.cloneNode(true) : dayBar(b), b.tasks.map(M.taskCard), spec);
        var span = M.bucketRange(b);
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
        card: function (r, p) { return M.taskCard(r, false, p.key); },
        zone: M.dropZone,
        plan: function (p) {
          var theirs = S.PB().personRows(everyRow, p);
          var theirBuckets = S.DM().horizonPlan(theirs, planFrom, scale, M.state.capacity, M.vagueOptions(), nowM);
          var theirPool = S.DM().unplanned(theirs);
          if (manual && scale !== 'vague' && S.DM().untimed) theirPool = theirPool.concat(S.DM().untimed(theirs, M.today));
          return {
            count: theirs.filter(function (r) { return S.DM().isOpen(r) && r.statutKey !== 'triage'; }).length,
            pool: theirPool,
            cells: theirBuckets.map(function (b) {
              var spec = bucketSpec(b);
              spec.owner = p.key;
              return { spec: spec, tasks: b.tasks, current: !!isCurrent(b), weekend: scale === 'day' && S.isWeekend(b.date) };
            }),
          };
        },
      }) : null;
      var page = S.h('div', { class: 'db-page db-page--board' }, [
        M.pageHead('Orchestrateur', null, S.h('div', { class: 'db-head-tools' }, [scales])),
        S.h('div', { class: 'db-board' }, [
          poolCol,
          S.h('div', { class: 'db-board-days', style: 'grid-template-columns:' + colTrack }, days),
        ]),
        crowd,
      ]);
      M.els.main.appendChild(page);
      if (crowd) {
        var lead = page.querySelector('.db-board-days');
        if (lead) lead.addEventListener('scroll', function () { global.PeopleBoardUI.sync(page); }, { passive: true });
      }
      if (!M.state.zoomTouched && scale !== 'vague') {
        var strip0 = page.querySelector('.db-board-days');
        var n0 = strip0 ? strip0.children.length : 0;
        if (strip0 && n0) {
          var inner = strip0.clientWidth - 10;
          var col0 = (inner - Math.max(0, n0 - 1) * 4) / n0;
          var days0 = S.DM().zoomSpanDays(scale);
          if (days0 && col0 > 80) {
            var fitted = S.DM().zoomLayout(col0 / days0);
            if (fitted.scale === scale) {
              M.state.zoomP = fitted.pxPerDay;
              M.state.zoomColPx = fitted.colPx;
              strip0.style.gridTemplateColumns = 'repeat(' + n0 + ', ' + fitted.colPx + 'px)';
              var extra = strip0.scrollWidth - strip0.clientWidth;
              if (extra > 0) {
                var tighter = Math.max(80, fitted.colPx - Math.ceil(extra / n0));
                var again = S.DM().zoomLayout(tighter / days0);
                if (again.scale === scale) {
                  M.state.zoomP = again.pxPerDay;
                  M.state.zoomColPx = again.colPx;
                  strip0.style.gridTemplateColumns = 'repeat(' + n0 + ', ' + again.colPx + 'px)';
                  fitted = again;
                }
              }
              var range0 = page.querySelector('.db-zoom-range');
              if (range0) range0.value = String(S.DM().zoomSlider(fitted.pxPerDay));
            }
          }
        }
      }
      if (M.state.zoomFocalMs != null) {
        M.scrollStripTo(page.querySelector('.db-board-days'), M.state.zoomFocalMs, M.state.zoomFocalX);
        M.state.zoomFocalMs = null;
        M.state.zoomFocalX = null;
      }
      if (crowd) global.PeopleBoardUI.sync(page);
    };
    M.renderToday = function renderToday() {
      if (!M.todayView) {
        M.todayView = global.TodayUI.create({
          t: M.t,
          state: function () { return M.state; },
          rows: M.viewRows,
          section: function () { return M.state.section; },
          today: function () { return M.today; },
          rerender: M.render,
          go: M.go,
          parse: global.QuickParse && global.QuickParse.parse,
          prioBadge: M.prioBadge,
          estChip: M.estChip,
          dueChip: M.dueChip,
          capChip: M.capChip,
          menuChip: M.menuChip,
          stepLine: M.stepLine,
          placeLine: M.placeLine,
          plan: M.plan,
          planMany: M.planMany,
          setEstimate: M.setEstimate,
          complete: function (row) { M.exitComplete(row, true); },
          reopen: function (row) { M.exitComplete(row, false); },
          unblock: M.exitBlocked,
          openCard: M.openCard,
          setStatus: M.setStatus,
          createHere: M.createHere,
          review: M.reviewBlock,
        });
      }
      M.todayView.render(M.els.main);
    };
    M.parkStarted = function parkStarted(row) {
      var list = S.DT().listFor(M.state.lists, ['unstarted', 'backlog']);
      if (!list || !row) return;
      row.listId = list.id;
      row.statut = list.name;
      row.statutKey = list.category;
      M.write(S.DT().moveToCategory(M.t, row, M.state.lists, ['unstarted', 'backlog']), '« ' + row.name + ' » rangée');
      M.render();
    };
    M.resultControl = function resultControl(p) {
      if (!p.metricLabel) {
        return p.missingMeasure ? S.h('span', { class: 'db-step is-missing', text: 'Sans mesure' }) : null;
      }
      var label = 'Résultat ' + p.metricLabel;
      if (!p.metricId || !global.GoalsTrello || typeof global.GoalsTrello.updateMetric !== 'function') {
        return S.h('span', { class: 'db-step' + (p.staleOutcome ? ' is-missing' : ''), text: label });
      }
      return S.h('button', {
        class: 'db-result' + (p.staleOutcome ? ' is-missing' : ''),
        type: 'button',
        onclick: function (e) { M.editResult(p, e.currentTarget); },
      }, [document.createTextNode(label)]);
    };
    M.editResult = function editResult(p, btn) {
      var input = S.h('input', {
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
        if (!save || !isFinite(n)) { M.render(); return; }
        M.write(global.GoalsTrello.updateMetric(M.t, p.metricId, { currentValue: n }));
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); done = true; M.render(); }
      });
      input.addEventListener('blur', function () { finish(true); });
    };
    M.reviewBlock = function reviewBlock() {
      var rep = S.WO()
        ? S.WO().review(M.viewRows(), { today: M.today, wipCap: S.WO().DEFAULT_WIP, projects: M.state.projects || [] })
        : { flags: [], steps: [], waiting: [], wip: { over: false }, projects: [] };
      var projects = rep.projects || [];
      var steps = rep.steps || [];
      var waiting = rep.waiting || [];
      if (!rep.flags.length && !steps.length && !waiting.length && !projects.length) return null;
      var kids = [S.h('h3', { class: 'db-sugg-h' }, [S.icon('list-check'), document.createTextNode(' Revue')])];
      rep.flags.forEach(function (f) {
        kids.push(S.h('div', { class: 'db-row' }, [
          S.h('span', { class: 'db-row-name', text: f.label }),
          S.h('span', { class: 'db-chip', text: f.detail }),
          f.id === 'triage' ? S.h('button', { class: 'db-btn', type: 'button', onclick: function () { M.go('triage'); } }, [document.createTextNode('Ouvrir')]) : null,
          f.id === 'wip' && rep.wip && rep.wip.park ? S.h('button', { class: 'db-btn', type: 'button', title: 'Ranger la moins prioritaire', onclick: function () { M.parkStarted(rep.wip.park); } }, [document.createTextNode('Ranger')]) : null,
        ]));
      });
      steps.forEach(function (r) {
        kids.push(S.h('div', { class: 'db-row', 'data-card': r.id }, [
          S.h('span', { class: 'db-row-name', text: r.name, onclick: function () { M.openCard(r); } }),
        ]));
      });
      waiting.forEach(function (r) {
        kids.push(S.h('div', { class: 'db-row', 'data-card': r.id }, [
          S.h('span', { class: 'db-row-name', text: r.name, onclick: function () { M.openCard(r); } }),
          S.h('span', { class: 'db-chip', text: r.waiting }),
        ]));
      });
      projects.forEach(function (p) {
        var stepText = p.step && p.step.text ? p.step.text : '';
        kids.push(S.h('div', { class: 'db-project' }, [
          S.h('div', { class: 'db-row-name', text: p.name }),
          p.outcome ? S.h('div', { class: 'db-step', text: p.outcome }) : null,
          stepText ? S.h('div', {
            class: 'db-step',
            'data-card': p.step && p.step.cardId ? p.step.cardId : null,
            text: stepText,
            onclick: p.step && p.step.cardId ? function () {
              var card = M.state.rows.filter(function (r) { return r.id === p.step.cardId; })[0];
              if (card) M.openCard(card);
            } : null,
          }) : null,
          S.h('div', { class: 'db-project-nums' }, [
            p.work == null ? null : S.h('span', { text: 'Travail ' + p.work + ' %' }),
            M.resultControl(p),
          ]),
        ]));
      });
      return S.h('section', { class: 'db-sugg' }, kids);
    };
    M.render = function render() {
      if (global.Isolation) global.Isolation.adopt(M.t, M.state.rows, M.state.goals);
      M.today = S.todayIso();
      if (M.state.section === 'review') M.state.section = 'today';
      var keepScroll = M.els.main.scrollTop;
      var holdDays = M.state.zoomFocalMs == null;
      var daysScroll = 0;
      var prevDays = M.els.main.querySelector('.db-board-days');
      if (prevDays) daysScroll = prevDays.scrollLeft;
      var colScroll = [];
      M.els.main.querySelectorAll('.db-col-body').forEach(function (b) { colScroll.push(b.scrollTop); });
      // The triage list and pane keep their scroll, and the control that had the focus gets it back:
      // a click must never feel like a reload.
      var kept = {};
      M.els.main.querySelectorAll('[data-keep]').forEach(function (n) { kept[n.getAttribute('data-keep')] = n.scrollTop; });
      var had = document.activeElement;
      var focusKey = had && had !== document.body && M.els.main.contains(had) ? had.getAttribute('data-fk') : null;
      if (M.docUI) M.docUI.park();
      M.els.main.textContent = '';
      M.renderSide();
      if (M.state.section === 'triage') M.renderTriage();
      else if (M.state.section === 'orchestrator') M.renderOrchestrator();
      else M.renderToday();
      if (global.ChipSlots) global.ChipSlots.align(M.els.main);
      M.els.main.scrollTop = keepScroll;
      M.els.main.querySelectorAll('[data-keep]').forEach(function (n) {
        var top = kept[n.getAttribute('data-keep')];
        if (top != null) n.scrollTop = top;
      });
      // Keep the selected card of the list in view, inside the list only (on a phone the list is under the pane).
      var sel = M.state.section === 'triage' ? M.els.main.querySelector('.db-triage-list .is-sel') : null;
      var box = sel ? M.els.main.querySelector('.db-split-l') : null;
      if (box) {
        var b = box.getBoundingClientRect();
        var r = sel.getBoundingClientRect();
        if (r.top < b.top) box.scrollTop -= b.top - r.top;
        else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
      }
      var bodies = M.els.main.querySelectorAll('.db-col-body');
      for (var i = 0; i < bodies.length && i < colScroll.length; i++) bodies[i].scrollTop = colScroll[i];
      var daysNow = M.els.main.querySelector('.db-board-days');
      if (holdDays && daysNow) daysNow.scrollLeft = daysScroll;
      if (M.state.section === 'orchestrator' && M.state.composer != null) {
        var addInput = M.els.main.querySelector('.db-add-input');
        if (addInput && document.activeElement !== addInput) addInput.focus({ preventScroll: true });
      }
      // A decision button is never given back (a held key would decide the next card too); the page takes
      // the focus then, so the keys keep working.
      var back = focusKey && focusKey.indexOf('exit:') !== 0 ? M.els.main.querySelector('[data-fk="' + focusKey + '"]') : null;
      var now = document.activeElement;
      if (back) back.focus({ preventScroll: true });
      else if (!now || now === document.body) M.shell.focus({ preventScroll: true });
      if (M.docUI) M.docUI.unpark();
    };
    M.loadChain = function loadChain() {
      var goalsP = global.MindmapGoalsTrello && typeof global.MindmapGoalsTrello.load === 'function'
        ? global.MindmapGoalsTrello.load(M.t).catch(function () { return { nodes: [], links: [] }; })
        : Promise.resolve({ nodes: [], links: [] });
      var boardP = global.GoalsTrello
        ? Promise.all([
            global.GoalsTrello.getObjectifs(M.t).catch(function () { return []; }),
            global.GoalsTrello.getMetrics(M.t).catch(function () { return []; }),
          ]).catch(function () { return [[], []]; })
        : Promise.resolve([[], []]);
      return Promise.all([goalsP, boardP]);
    };
    M.reload = function reload(opts) {
      opts = opts || {};
      if (!opts.quiet) {
        M.root.innerHTML = global.Skeleton.html('dashboard');
      }
      return Promise.all([S.DT().load(M.t), M.loadChain(), M.loadTeam()]).then(function (res) {
        if (!M.root.contains(M.shell)) { M.root.innerHTML = ''; M.root.appendChild(M.shell); }
        M.state.lists = res[0].lists;
        M.state.rows = res[0].rows;
        var goals = res[1][0] || { nodes: [], links: [] };
        M.state.objectifs = (res[1][1] && res[1][1][0]) || [];
        M.state.metrics = (res[1][1] && res[1][1][1]) || [];
        M.applyGoals(goals);
        // Opening the Dashboard with work due answers "what now?" straight away; otherwise stay on Triage.
        if (!M.state.landed) {
          M.state.landed = true;
          if (S.DM().todayList(M.state.rows, M.today).length) M.state.section = 'today';
        }
        global.Skeleton.remember('dashboard', { rows: S.DM().todayList(M.state.rows, M.today).length });
        M.render();
      }).catch(function (err) {
        M.root.innerHTML = '';
        M.root.appendChild(S.h('div', { class: 'db-loading', text: 'Impossible de charger le Dashboard : ' + (err && err.message) }));
      });
    };
    },
    run: function (M) {
    M.todayView = null;
    M.shell.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(e.target && e.target.isContentEditable);
      // Ctrl+Z takes the last decision back (a text field keeps its own undo).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && M.state.undo) {
        e.preventDefault();
        return M.state.undo();
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typing) return;
      var k = e.key.toLowerCase();
      var idx = '123'.indexOf(k);
      if (idx >= 0 && k.length === 1) { e.preventDefault(); return M.go(S.SECTIONS[idx].key); }
      if (M.state.section !== 'triage') return;
      var q = M.triageOrder(M.triageRows());
      var focus = M.focusEntries(M.triageRows());
      var i = M.focusAt(focus);
      // The Document pane shows no card: J / K go back to the list, the decision keys wait.
      if (M.state.docOpen) {
        if ((k === 'j' || k === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') && q.length) {
          e.preventDefault();
          M.state.docOpen = false;
          M.render();
        }
        return;
      }
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); M.applyFocus(focus[i + 1]); return; }
      if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); M.applyFocus(focus[i - 1]); return; }
      if (M.state.subSel) return;
      var ex = S.DM().exitForKey(e.key);
      var card = q.filter(function (r) { return r.id === M.state.selected; })[0];
      if (ex && card) {
        e.preventDefault();
        M.perform(card, ex.id, M.els.main.querySelector('[data-exit="' + ex.id + '"]'));
      }
    });
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: M.t,
        hoverSelector: '.tri[data-card]',
        idOf: function (el) { return el.getAttribute('data-card'); },
        selectedId: function () { return M.state.section === 'triage' ? M.state.selected || '' : ''; },
        anchorFor: function (id) { return M.els.main.querySelector('.tri[data-card="' + id + '"] .tri-top'); },
        row: function (id) { return M.state.rows.filter(function (r) { return r.id === id; })[0] || null; },
        lists: function () { return M.state.lists; },
        setStatus: function (row, list) {
          M.setStatus('Enregistrement…', 'busy');
          global.TableTrello.moveCard(M.t, row.id, list.id, 'bottom').then(function () {
            row.listId = list.id; row.statut = list.name; row.statutKey = list.category;
            M.setStatus('Statut modifié', 'ok');
            M.reload({ quiet: true });
          }, M.fail);
        },
        setUrgency: function (row, urgencyId) {
          M.perform(row, 'urg:' + urgencyId);
        },
        openDue: function (row, anchor) {
          if (!global.CardFields) return;
          global.CardFields.open('due', {
            t: M.t,
            cardId: row.id,
            cardName: row.name,
            anchor: anchor,
            onSaved: function () { M.setStatus('Échéance enregistrée', 'ok'); M.reload({ quiet: true }); },
            onError: function (m) { M.setStatus('Erreur échéance : ' + m, 'error'); },
          });
        },
        newCard: function () { M.createCard(); },
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () {
          return M.state.rows.map(function (r) {
            var l = M.state.lists.filter(function (x) { return x.id === r.listId; })[0];
            return { id: r.id, name: r.name, hint: l ? l.name : '' };
          });
        },
        onCard: function (id) {
          var row = M.state.rows.filter(function (r) { return r.id === id; })[0];
          if (!row) return;
          M.state.selected = id;
          M.render();
          global.CommandPalette.reveal('.db-row[data-id="' + id + '"]');
        },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: M.createCard }, { label: 'Nouveau document', icon: 'file-plus', run: M.openDoc }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }
    if (M.t && typeof M.t.board === 'function') {
      M.t.board('members').then(function (b) {
        var list = (b && b.members) || (Array.isArray(b) ? b : []);
        M.people = list.map(function (m) { return m && (m.fullName || m.username); }).filter(Boolean);
      }, function () {});
    }
    M.shell.addEventListener('contextmenu', function (e) {
      var CM = global.ContextMenu;
      if (!CM || !e) return;
      if (e.target && e.target.closest && e.target.closest('.tp-context-menu')) return;
      var cardEl = e.target && e.target.closest && e.target.closest('[data-card]');
      var editable = CM.isNativeEditableTarget && CM.isNativeEditableTarget(e.target);
      if (!cardEl && editable) return;
      var row = null;
      if (cardEl) {
        row = M.state.rows.filter(function (r) { return r.id === cardEl.getAttribute('data-card'); })[0] || null;
        if (!row) return;
      }
      e.preventDefault();
      var anchor = e.target && e.target.nodeType === 1 ? e.target : cardEl;
      // A text field keeps cut / copy / paste. The full card menu is for the row itself,
      // so "Annuler" (discard) does not sit next to "Annuler" (undo).
      if (row && editable && typeof CM.buildGenericItems === 'function') {
        var field = CM.buildGenericItems(e.target, document) || [];
        CM.show(e, [
          { id: 'open-card', label: 'Ouvrir la carte', icon: 'external-link', group: 'Ouvrir', action: function () { M.openCard(row); } },
          { id: 'open-document', label: 'Document', icon: 'file-text', group: 'Ouvrir', action: function () { if (global.ViewTabs && typeof global.ViewTabs.openSubject === 'function') global.ViewTabs.openSubject('task', row.id); } },
          { sep: true },
        ].concat(field));
        return;
      }
      var entries = row ? S.menuEntries(row, M.menuCtx(row)) : S.pageEntries({ section: M.state.section, canCreate: !!(S.DT().listFor(M.state.lists, ['triage']) && global.NewCard) });
      CM.show(e, M.withIso(row, entries, anchor || cardEl));
    });
    if (global.AssistantDock) {
      global.AssistantDock.mount({
        t: M.t,
        after: M.root,
        onRefresh: function () { M.reload({ quiet: true }); },
        isBusy: function () {
          var ae = document.activeElement;
          var typing = ae && M.root.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
          return M.state.busy || !!M.state.composer || typing || (global.CardFields && global.CardFields.isOpen());
        },
      });
    }
    M.reload();
    }
  });
})(typeof window !== 'undefined' ? window : this);
