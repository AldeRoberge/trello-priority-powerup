/**
 * gantt-ui: mountGantt() part 4 of 5.
 * The body of mountGantt runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see gantt-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.GanttUiParts = global.GanttUiParts || {});
  var P = (global.GanttUiPartsMountMountGantt = global.GanttUiPartsMountMountGantt || { list: [] });

  P.list.push({
    define: function (M) {
    M.persistRow = function persistRow(row) {
      if (!M.isDatable(row)) return Promise.resolve();
      var isCard = row.kind === 'card';
      var key = isCard ? row.cardId : row.id;
      M.state.saving = true;
      var clearing = !row.startDate && !row.dueDate;
      M.setStatus(clearing ? 'Effacement des dates\u2026' : 'Enregistrement\u2026');
      var cached = (isCard && M.state.cardsById[row.cardId]) || null;
      var parts = {
        startDate: row.startDate || '',
        dueDate: row.dueDate || '',
        startTime: clearing ? '' : row.startTime || (cached && cached.startTime) || '',
        dueTime: clearing ? '' : row.dueTime || (cached && cached.dueTime) || '',
      };
      var prevDates = M.baseDates[key];
      var saving = isCard
        ? M.ganttTrello.saveCardDates(M.t, row.cardId, parts)
        : M.ganttTrello.saveSubtaskDates(M.t, M.subtaskMeta(row), parts);
      return saving
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            var reason = (res && res.reason) || 'error';
            if (reason === 'auth-failed' || reason === 'not-authorized') {
              M.state.authHint =
                'Autorisez l\u2019acc\u00e8s Trello pour enregistrer les dates.';
              M.setStatus(M.state.authHint, true);
            } else {
              M.setStatus('\u00c9chec enregistrement (' + reason + ')', true);
            }
            return M.reload();
          }
          if (isCard && prevDates && JSON.stringify(prevDates) !== JSON.stringify(parts)) {
            M.record({
              type: 'dates',
              targetId: row.cardId,
              title: row.name,
              before: M.datesLabel(prevDates),
              after: M.datesLabel(parts),
              beforeVal: prevDates,
              afterVal: parts,
            });
          }
          M.baseDates[key] = parts;
          M.setStatus(clearing ? 'Dates effac\u00e9es' : 'Dates enregistr\u00e9es');
          var outlookSync = S.OS();
          if (
            isCard &&
            M.state.outlookConnected &&
            outlookSync &&
            typeof outlookSync.scheduleSyncCard === 'function'
          ) {
            outlookSync.scheduleSyncCard(M.t, row.cardId);
          }
          if (clearing) {
            M.renderChart();
          } else {
            setTimeout(function () {
              if (!M.state.saving) M.setStatus('');
            }, 1500);
          }
          return res;
        })
        .catch(function (err) {
          M.state.saving = false;
          M.setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return M.reload();
        });
    };
    M.clearRowDates = function clearRowDates(row) {
      if (M.state.saving || !M.isDatable(row)) return;
      row.startDate = '';
      row.dueDate = '';
      row.startTime = '';
      row.dueTime = '';
      if (M.state.cardsById[row.cardId]) {
        M.state.cardsById[row.cardId].startDate = '';
        M.state.cardsById[row.cardId].dueDate = '';
        M.state.cardsById[row.cardId].startTime = '';
        M.state.cardsById[row.cardId].dueTime = '';
      }
      M.persistRow(row);
    };
    M.openScheduleEditor = function openScheduleEditor(row, anchor) {
      if (!M.isDatable(row) || !anchor) return;
      var iv = M.model.resolveBarInterval(row, M.intervalOptions());
      var today = M.model.toIsoDate(new Date());
      var startD = row.startDate || (iv ? M.model.toIsoDate(iv.start) : '') || today;
      var dueD = row.dueDate || (iv ? M.model.toIsoDate(iv.end) : '') || startD;
      var hadTime = !!(row.startTime || row.dueTime);
      var defStart = M.state.ganttSettings.dayStart || '09:00';
      var defEnd = M.state.ganttSettings.dayEnd || '17:00';

      M.openMiniEditor({
        anchor: anchor,
        title: 'Dates et horaires',
        cardId: row.cardId,
        cardName: row.name,
        hideFull: true,
        mount: function (bodyEl) {
          var form = S.el('form', 'gantt-sched');
          function field(labelText, type, value) {
            var wrap = S.el('label', 'gantt-sched-field');
            wrap.appendChild(S.el('span', 'gantt-sched-label', { text: labelText }));
            var input = S.el('input', 'gantt-sched-input', { type: type });
            input.value = value || '';
            wrap.appendChild(input);
            return { wrap: wrap, input: input };
          }
          function pair(caption, dateVal, timeVal) {
            var line = S.el('div', 'gantt-sched-row');
            line.appendChild(S.el('div', 'gantt-sched-caption', { text: caption }));
            var d = field('Date', 'date', dateVal);
            var tm = field('Heure', 'time', timeVal);
            line.appendChild(d.wrap);
            line.appendChild(tm.wrap);
            form.appendChild(line);
            return { date: d.input, time: tm.input, timeWrap: tm.wrap };
          }
          var s = pair('Début', startD, row.startTime || (hadTime ? defStart : ''));
          var e = pair('Fin', dueD, row.dueTime || (hadTime ? defEnd : ''));

          var useTimeLab = S.el('label', 'gantt-check gantt-sched-toggle');
          var useTime = S.el('input', '', { type: 'checkbox' });
          useTime.checked = hadTime;
          useTimeLab.appendChild(useTime);
          useTimeLab.appendChild(document.createTextNode(' Ajouter des heures'));
          form.insertBefore(useTimeLab, form.firstChild);

          function syncTimeUi() {
            [s, e].forEach(function (p) {
              p.timeWrap.classList.toggle('is-off', !useTime.checked);
              p.time.disabled = !useTime.checked;
            });
          }
          useTime.addEventListener('change', function () {
            if (useTime.checked) {
              if (!s.time.value) s.time.value = defStart;
              if (!e.time.value) e.time.value = defEnd;
            }
            syncTimeUi();
          });
          // Moving the start drags the end along until the user edits the end.
          s.date.addEventListener('change', function () {
            if (!e.date.value || e.date.value < s.date.value) {
              e.date.value = s.date.value;
            }
          });
          syncTimeUi();

          var err = S.el('div', 'gantt-sched-error');
          err.hidden = true;
          form.appendChild(err);

          var actions = S.el('div', 'gantt-sched-actions');
          var clearBtn = S.el('button', 'gantt-btn gantt-btn--danger', {
            type: 'button',
            text: 'Effacer',
          });
          var saveBtn = S.el('button', 'gantt-btn is-active', {
            type: 'submit',
            text: 'Enregistrer',
          });
          actions.appendChild(clearBtn);
          actions.appendChild(saveBtn);
          form.appendChild(actions);

          clearBtn.addEventListener('click', function () {
            M.closeMiniPopover();
            M.clearRowDates(row);
          });
          form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var sd = s.date.value;
            var ed = e.date.value || sd;
            if (!sd) {
              err.textContent = 'Choisissez une date de début.';
              err.hidden = false;
              return;
            }
            var withTime = useTime.checked;
            var st = withTime ? s.time.value || defStart : '';
            var et = withTime ? e.time.value || st : '';
            var a = sd + (withTime ? 'T' + st : '');
            var b = ed + (withTime ? 'T' + et : '');
            if (b < a) {
              err.textContent = 'La fin doit être après le début.';
              err.hidden = false;
              return;
            }
            row.startDate = sd;
            row.dueDate = ed;
            row.startTime = st;
            row.dueTime = et;
            var card = row.cardId ? M.state.cardsById[row.cardId] : null;
            if (card) {
              card.startDate = sd;
              card.dueDate = ed;
              card.startTime = st;
              card.dueTime = et;
            }
            M.closeMiniPopover();
            M.applySort();
            M.renderChart();
            M.persistRow(row);
          });

          bodyEl.appendChild(form);
          setTimeout(function () {
            s.date.focus();
          }, 0);
          return { destroy: function () {} };
        },
      });
    };
    M.dateAtTimelineX = function dateAtTimelineX(timeRow, clientX) {
      var rect = timeRow.getBoundingClientRect();
      // Use the laid-out row width when it differs slightly from state.timelineWidth
      // (subpixel / scrollbars), so hover lines up with the day grid.
      var width =
        rect.width > 0 ? rect.width : M.state.timelineWidth || S.MIN_TIMELINE_W;
      var x = clientX - rect.left;
      var r = M.range();
      if (M.usesTimedTimeline() && typeof M.model.xToDateTime === 'function') {
        var dt = M.model.xToDateTime(x, r, width, M.timelineMapOptions());
        return M.model.snapDateTime
          ? M.model.snapDateTime(
              dt,
              M.state.viewMode,
              M.model.AGENDA_SNAP_MINUTES || 30
            )
          : dt;
      }
      var d = M.model.xToDate(x, r, width);
      return M.model.snapDate(d, M.state.viewMode);
    };
    M.placeGhost = function placeGhost(ghostEl, interval) {
      var geo = M.model.barGeometry(
        interval,
        M.range(),
        M.state.timelineWidth,
        M.timelineMapOptions()
      );
      if (!geo || !geo.visible) {
        ghostEl.hidden = true;
        return;
      }
      ghostEl.hidden = false;
      ghostEl.style.left = geo.left + 'px';
      ghostEl.style.width = geo.width + 'px';
    };
    M.bindTimelinePaint = function bindTimelinePaint(timeRow, row) {
      if (!M.isDatable(row)) return;
      timeRow.classList.add('is-paintable');
      timeRow.title =
        'Cliquer pour planifier (date et heure) \u00b7 glisser pour d\u00e9finir une dur\u00e9e';

      var ghost = S.el('div', 'gantt-paint-ghost');
      ghost.hidden = true;
      timeRow.appendChild(ghost);

      timeRow.addEventListener('pointermove', function (ev) {
        if (M.state.paint || M.state.drag || M.state.saving) return;
        var d = M.dateAtTimelineX(timeRow, ev.clientX);
        if (!d) {
          ghost.hidden = true;
          return;
        }
        M.placeGhost(ghost, {
          start: d,
          end: d,
          hasTime: M.usesTimedTimeline(),
        });
      });

      timeRow.addEventListener('pointerleave', function () {
        if (M.state.paint) return;
        ghost.hidden = true;
      });

      timeRow.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (M.state.saving || M.state.drag || M.state.paint) return;
        if (ev.target && ev.target.closest && ev.target.closest('.gantt-bar')) {
          return;
        }
        var origin = M.dateAtTimelineX(timeRow, ev.clientX);
        if (!origin) return;
        ev.preventDefault();
        ev.stopPropagation();

        M.state.paint = {
          row: row,
          origin: origin,
          current: origin,
          pointerId: ev.pointerId,
        };
        timeRow.classList.add('is-painting');
        M.placeGhost(ghost, {
          start: origin,
          end: origin,
          hasTime: M.usesTimedTimeline(),
        });
        timeRow.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!M.state.paint) return;
          var cur = M.dateAtTimelineX(timeRow, e.clientX);
          if (!cur) return;
          M.state.paint.current = cur;
          var iv = M.model.orderedInterval(M.state.paint.origin, cur, {
            keepTime: M.usesTimedTimeline(),
          });
          if (iv) M.placeGhost(ghost, iv);
        }

        function onUp(upEv) {
          timeRow.releasePointerCapture(ev.pointerId);
          timeRow.removeEventListener('pointermove', onMove);
          timeRow.removeEventListener('pointerup', onUp);
          timeRow.removeEventListener('pointercancel', onUp);
          timeRow.classList.remove('is-painting');
          var paint = M.state.paint;
          M.state.paint = null;
          ghost.hidden = true;
          if (!paint || (upEv && upEv.type === 'pointercancel')) return; // a cancel is a scroll taking the swipe: plan nothing
          var iv = M.model.orderedInterval(paint.origin, paint.current, {
            keepTime: M.usesTimedTimeline(),
          });
          if (!iv) return;
          if (
            paint.origin.getTime() === paint.current.getTime() &&
            M.usesTimedTimeline()
          ) {
            // A click in Jour/Semaine would otherwise create a 0-minute bar.
            iv = {
              start: iv.start,
              end: new Date(iv.start.getTime() + 60 * (M.model.MS_MINUTE || 60000)),
              hasTime: true,
            };
          }
          M.applyIntervalToRow(row, iv);
          // A simple click adds a one-slot bar; offer the editor right away.
          if (paint.origin.getTime() === paint.current.getTime()) {
            M.state.editAfterRender = row.id;
          }
          M.applySort();
          M.renderChart();
          M.persistRow(row);
        }

        timeRow.addEventListener('pointermove', onMove);
        timeRow.addEventListener('pointerup', onUp);
        timeRow.addEventListener('pointercancel', onUp);
      });
    };
    M.bindBarDrag = function bindBarDrag(barEl, row, interval) {
      if (!M.isDatable(row)) return;

      function onPointerDown(ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (
          ev.target &&
          ev.target.closest &&
          ev.target.closest('.gantt-bar-clear')
        ) {
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();

        var mode = 'move';
        if (ev.target && ev.target.closest) {
          if (ev.target.closest('.' + S.EDGE_HANDLE_CLASS_START)) mode = 'start';
          else if (ev.target.closest('.' + S.EDGE_HANDLE_CLASS_END)) mode = 'end';
        }

        var r = M.range();
        var mapOpts = M.timelineMapOptions();
        var startX = ev.clientX;
        var moved = false;
        var origin = {
          start: interval.start,
          end: interval.end,
          hasTime: !!interval.hasTime,
        };
        // Off-hours are squeezed in Jour/Semaine, so the same duration is drawn
        // narrower there: keep the grabbed width while a bar is being moved.
        var startGeo =
          mode === 'move' && M.usesTimedTimeline()
            ? M.model.barGeometry(origin, r, M.state.timelineWidth, mapOpts)
            : null;
        M.state.drag = {
          row: row,
          mode: mode,
          origin: origin,
          startX: startX,
          range: r,
          width: M.state.timelineWidth,
          pointerId: ev.pointerId,
          agenda: M.usesTimedTimeline(),
          mapOpts: mapOpts,
          fixedWidth: startGeo && startGeo.visible ? startGeo.width : null,
          originLeft: M.usesTimedTimeline()
            ? M.model.dateTimeToX(
                interval.start,
                r,
                M.state.timelineWidth,
                mapOpts
              )
            : 0,
          originRight: M.usesTimedTimeline()
            ? M.model.dateTimeToX(
                interval.end,
                r,
                M.state.timelineWidth,
                mapOpts
              )
            : 0,
        };
        barEl.classList.add('is-dragging');
        barEl.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!M.state.drag) return;
          var dx = e.clientX - M.state.drag.startX;
          if (Math.abs(dx) > 3) moved = true;
          var next;
          if (M.state.drag.agenda) {
            // Map through warped X space so dx in morning ≠ dx in work hours.
            var leftX = M.state.drag.originLeft + dx;
            var rightX = M.state.drag.originRight + dx;
            if (M.state.drag.mode === 'start') {
              leftX = M.state.drag.originLeft + dx;
              rightX = M.state.drag.originRight;
            } else if (M.state.drag.mode === 'end') {
              leftX = M.state.drag.originLeft;
              rightX = M.state.drag.originRight + dx;
            }
            var nextStart = M.model.xToDateTime(
              leftX,
              M.state.drag.range,
              M.state.drag.width,
              M.state.drag.mapOpts
            );
            var nextEnd = M.model.xToDateTime(
              rightX,
              M.state.drag.range,
              M.state.drag.width,
              M.state.drag.mapOpts
            );
            if (!nextStart || !nextEnd) return;
            if (M.state.drag.mode === 'move') {
              // Snap only the start, then re-apply the original duration —
              // snapping start/end independently could round both into the
              // same bucket for short tasks and collapse the bar to 0 min.
              var snappedStart = M.model.snapDateTime(nextStart, M.state.viewMode);
              if (!snappedStart) return;
              var durMs =
                M.state.drag.origin.end.getTime() -
                M.state.drag.origin.start.getTime();
              var startMs = snappedStart.getTime();
              // A bar that began inside the range stays inside it, so dropping
              // at the edge doesn't push it onto an invisible day.
              var rangeStartMs = M.model.startOfDay(M.state.drag.range.start).getTime();
              var rangeEndMs = M.model
                .addDays(
                  M.state.drag.range.start,
                  M.model.rangeDayCount(M.state.drag.range)
                )
                .getTime();
              if (
                M.state.drag.origin.start.getTime() >= rangeStartMs &&
                M.state.drag.origin.end.getTime() <= rangeEndMs
              ) {
                startMs = Math.max(
                  rangeStartMs,
                  Math.min(startMs, rangeEndMs - durMs)
                );
              }
              next = {
                start: new Date(startMs),
                end: new Date(startMs + durMs),
                hasTime: true,
              };
            } else {
              next = {
                start: M.model.snapDateTime(nextStart, M.state.viewMode),
                end: M.model.snapDateTime(nextEnd, M.state.viewMode),
                hasTime: true,
              };
            }
          } else {
            var dayDelta = Math.round(
              (dx / M.state.drag.width) * M.model.rangeDayCount(M.state.drag.range)
            );
            if (M.state.drag.mode === 'move') {
              next = M.model.shiftInterval(M.state.drag.origin, dayDelta);
            } else {
              next = M.model.resizeInterval(
                M.state.drag.origin,
                M.state.drag.mode === 'start' ? 'start' : 'end',
                dayDelta
              );
            }
            if (!next) return;
            next = {
              start: M.model.snapDate(next.start, M.state.viewMode),
              end: M.model.snapDate(next.end, M.state.viewMode),
              hasTime: !!M.state.drag.origin.hasTime,
            };
          }
          if (
            M.state.drag.mode !== 'move' &&
            next.end.getTime() < next.start.getTime()
          ) {
            if (M.state.drag.mode === 'start') next.start = next.end;
            else next.end = next.start;
          }
          M.applyIntervalToRow(row, next);
          M.updateBarEl(barEl, row, next, M.state.drag.mode, M.state.drag.fixedWidth);
          M.showDragTip(e.clientX, e.clientY, M.formatIntervalTitle(next));
        }

        function onUp(upEv) {
          barEl.releasePointerCapture(ev.pointerId);
          barEl.removeEventListener('pointermove', onMove);
          barEl.removeEventListener('pointerup', onUp);
          barEl.removeEventListener('pointercancel', onUp);
          barEl.classList.remove('is-dragging');
          M.hideDragTip();
          var startEdge = barEl.querySelector('.gantt-bar-edge--start');
          var endEdge = barEl.querySelector('.gantt-bar-edge--end');
          if (startEdge) startEdge.classList.remove('is-active');
          if (endEdge) endEdge.classList.remove('is-active');
          var drag = M.state.drag;
          M.state.drag = null;
          if (!drag) return;
          if (!moved && drag.mode === 'move') {
            // A plain click (no drag) opens the date/time editor; a pointercancel (a scroll) is not a click.
            if (!(upEv && upEv.type === 'pointercancel')) M.openScheduleEditor(row, barEl);
            return;
          }
          var finalInterval = M.model.resolveBarInterval(row, M.intervalOptions());
          if (finalInterval) M.updateBarEl(barEl, row, finalInterval, null);
          if (
            finalInterval &&
            (finalInterval.start.getTime() !== drag.origin.start.getTime() ||
              finalInterval.end.getTime() !== drag.origin.end.getTime())
          ) {
            M.persistRow(row);
          }
        }

        barEl.addEventListener('pointermove', onMove);
        barEl.addEventListener('pointerup', onUp);
        barEl.addEventListener('pointercancel', onUp);
      }

      barEl.addEventListener('pointerdown', onPointerDown);
    };
    M.updateBarEl = function updateBarEl(barEl, row, interval, dragMode, fixedWidth) {
      var r = M.range();
      var geo = M.model.barGeometry(
        interval,
        r,
        M.state.timelineWidth,
        M.timelineMapOptions()
      );
      var pinned = typeof fixedWidth === 'number' && fixedWidth > 0;
      if (!geo || (!geo.visible && !pinned)) {
        barEl.style.display = 'none';
        return;
      }
      var left = geo.left;
      var width = geo.width;
      if (pinned) {
        width = fixedWidth;
        left = Math.max(0, Math.min(left, M.state.timelineWidth - width));
      }
      barEl.style.display = '';
      barEl.style.left = left + 'px';
      barEl.style.width = width + 'px';
      barEl.title =
        (row.name || '') + ' \u00b7 ' + M.formatIntervalTitle(interval);
      var labelEl = barEl.querySelector('.gantt-bar-label');
      if (labelEl) {
        labelEl.textContent = M.formatBarLabel(row, interval);
      }
      var startEdge = barEl.querySelector('.gantt-bar-edge--start');
      var endEdge = barEl.querySelector('.gantt-bar-edge--end');
      var startTimeEl = startEdge && startEdge.querySelector('.gantt-bar-edge-time');
      var endTimeEl = endEdge && endEdge.querySelector('.gantt-bar-edge-time');
      if (interval && interval.hasTime && typeof M.model.toIsoTime === 'function') {
        if (startTimeEl) startTimeEl.textContent = M.model.toIsoTime(interval.start);
        if (endTimeEl) endTimeEl.textContent = M.model.toIsoTime(interval.end);
      }
      if (startEdge) {
        startEdge.classList.toggle('is-active', dragMode === 'start');
      }
      if (endEdge) {
        endEdge.classList.toggle('is-active', dragMode === 'end');
      }
    };
    M.buildEmptyState = function buildEmptyState() {
      var box = S.el('div', 'gantt-empty');
      if (!M.filtersActive()) {
        box.textContent = 'Aucune tâche sur ce tableau.';
        var first = M.buildAddRow();
        if (first) {
          first.label.classList.add('gantt-row--solo');
          box.appendChild(first.label);
        }
        return box;
      }
      box.appendChild(S.el('div', 'gantt-empty-title', { text: 'Aucune tâche ne correspond aux filtres.' }));
      var actions = S.el('div', 'gantt-empty-actions');
      [
        { flag: 'hideCompleted', label: 'Afficher les tâches terminées' },
        { flag: 'hideBlocked', label: 'Afficher les tâches bloquées' },
        { flag: 'hideUndated', label: 'Afficher les tâches sans date' },
      ].forEach(function (spec) {
        if (!M.state[spec.flag]) return;
        var b = S.el('button', 'gantt-btn', { type: 'button', text: spec.label });
        b.addEventListener('click', function () {
          M.state[spec.flag] = false;
          M.onFiltersChanged();
        });
        actions.appendChild(b);
      });
      var reset = S.el('button', 'gantt-btn is-active', { type: 'button', text: 'Tout réinitialiser' });
      reset.addEventListener('click', M.resetAllFilters);
      actions.appendChild(reset);
      box.appendChild(actions);
      return box;
    };
    },
    run: function (M) {

    }
  });
})(typeof window !== 'undefined' ? window : this);
