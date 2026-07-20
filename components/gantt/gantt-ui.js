/* Gantt chart UI — toolbar, rows, bars, drag/resize. */
(function (global) {
  'use strict';

  var ROW_H = 36;
  var LABEL_W = 240;
  var EDGE_PX = 6;
  var MIN_TIMELINE_W = 640;

  function GM() {
    return global.GanttModel;
  }

  function GT() {
    return global.GanttTrello;
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function mountGantt(mount, t, options) {
    options = options || {};
    var model = GM();
    var ganttTrello = GT();
    if (!model || !ganttTrello) {
      mount.textContent = 'Gantt modules missing.';
      return { destroy: function () {} };
    }

    var state = {
      viewMode: 'week',
      anchor: model.toIsoDate(new Date()),
      tree: [],
      cardsById: Object.create(null),
      expanded: Object.create(null),
      hideCompleted: false,
      hideUndated: false,
      loading: true,
      error: '',
      authHint: '',
      timelineWidth: MIN_TIMELINE_W,
      widthMeasured: false,
      drag: null,
      saving: false,
    };

    var root = el('div', 'gantt-root');
    var toolbar = el('div', 'gantt-toolbar');
    var body = el('div', 'gantt-body');
    var statusBar = el('div', 'gantt-status');
    root.appendChild(toolbar);
    root.appendChild(statusBar);
    root.appendChild(body);
    mount.innerHTML = '';
    mount.appendChild(root);

    function setStatus(msg, isError) {
      statusBar.textContent = msg || '';
      statusBar.classList.toggle('is-error', !!isError);
    }

    function range() {
      return model.viewRange(state.viewMode, state.anchor);
    }

    function visibleRows() {
      var flat = model.flattenVisible(state.tree, state.expanded);
      return model.filterRows(flat, {
        hideCompleted: state.hideCompleted,
        hideUndated: state.hideUndated,
      });
    }

    function renderToolbar() {
      toolbar.innerHTML = '';

      var zoom = el('div', 'gantt-zoom');
      ['week', 'month', 'year'].forEach(function (mode) {
        var labels = { week: 'Semaine', month: 'Mois', year: 'Ann\u00e9e' };
        var btn = el('button', 'gantt-btn' + (state.viewMode === mode ? ' is-active' : ''), {
          type: 'button',
          text: labels[mode],
        });
        btn.addEventListener('click', function () {
          state.viewMode = mode;
          render();
        });
        zoom.appendChild(btn);
      });
      toolbar.appendChild(zoom);

      var nav = el('div', 'gantt-nav');
      var prev = el('button', 'gantt-btn', { type: 'button', text: '\u2039' });
      prev.title = 'Pr\u00e9c\u00e9dent';
      prev.addEventListener('click', function () {
        state.anchor = model.toIsoDate(
          model.shiftAnchor(state.viewMode, state.anchor, -1)
        );
        render();
      });
      var today = el('button', 'gantt-btn', { type: 'button', text: "Aujourd'hui" });
      today.addEventListener('click', function () {
        state.anchor = model.toIsoDate(new Date());
        render();
      });
      var next = el('button', 'gantt-btn', { type: 'button', text: '\u203a' });
      next.title = 'Suivant';
      next.addEventListener('click', function () {
        state.anchor = model.toIsoDate(
          model.shiftAnchor(state.viewMode, state.anchor, 1)
        );
        render();
      });
      nav.appendChild(prev);
      nav.appendChild(today);
      nav.appendChild(next);
      toolbar.appendChild(nav);

      var title = el('div', 'gantt-title');
      var r = range();
      if (state.viewMode === 'year') {
        title.textContent = String(r.start.getFullYear());
      } else if (state.viewMode === 'month') {
        title.textContent =
          r.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      } else {
        title.textContent =
          model.toIsoDate(r.start) + ' \u2192 ' + model.toIsoDate(r.end);
      }
      toolbar.appendChild(title);

      var filters = el('div', 'gantt-filters');
      var hideDone = el('label', 'gantt-check');
      var doneCb = el('input', '', { type: 'checkbox' });
      doneCb.checked = state.hideCompleted;
      doneCb.addEventListener('change', function () {
        state.hideCompleted = !!doneCb.checked;
        renderChart();
      });
      hideDone.appendChild(doneCb);
      hideDone.appendChild(document.createTextNode(' Masquer termin\u00e9s'));
      filters.appendChild(hideDone);

      var hideUndated = el('label', 'gantt-check');
      var undatedCb = el('input', '', { type: 'checkbox' });
      undatedCb.checked = state.hideUndated;
      undatedCb.addEventListener('change', function () {
        state.hideUndated = !!undatedCb.checked;
        renderChart();
      });
      hideUndated.appendChild(undatedCb);
      hideUndated.appendChild(document.createTextNode(' Masquer sans date'));
      filters.appendChild(hideUndated);

      var authBtn = el('button', 'gantt-btn', {
        type: 'button',
        text: 'Autoriser Trello',
      });
      authBtn.title =
        'Requis pour enregistrer les dates (glisser les barres)';
      authBtn.addEventListener('click', function () {
        ganttTrello.ensureRestAuthorized(t).then(function (res) {
          if (res && res.ok) {
            state.authHint = '';
            setStatus('Autorisation OK \u2014 vous pouvez glisser les barres');
          } else {
            setStatus(
              'Autorisation refus\u00e9e' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
          }
        });
      });
      filters.appendChild(authBtn);

      var refresh = el('button', 'gantt-btn', { type: 'button', text: 'Actualiser' });
      refresh.addEventListener('click', function () {
        reload();
      });
      filters.appendChild(refresh);
      toolbar.appendChild(filters);
    }

    function toggleExpand(nodeId) {
      if (state.expanded[nodeId] == null) {
        // Default roots open: first toggle closes
        state.expanded[nodeId] = false;
      } else {
        state.expanded[nodeId] = !state.expanded[nodeId];
      }
      renderChart();
    }

    function openCard(cardId) {
      if (!cardId || !t) return;
      if (typeof t.showCard === 'function') {
        try {
          t.showCard(cardId);
          return;
        } catch (e) {
          /* fall through */
        }
      }
      if (typeof t.navigate === 'function') {
        try {
          t.navigate({ card: cardId });
        } catch (e2) {
          /* ignore */
        }
      }
    }

    function applyIntervalToRow(row, interval) {
      var parts = model.intervalToParts(interval);
      row.startDate = parts.startDate;
      row.dueDate = parts.dueDate;
      if (row.cardId && state.cardsById[row.cardId]) {
        state.cardsById[row.cardId].startDate = parts.startDate;
        state.cardsById[row.cardId].dueDate = parts.dueDate;
      }
    }

    function persistRow(row) {
      if (!row || row.kind !== 'card' || !row.cardId) return Promise.resolve();
      state.saving = true;
      setStatus('Enregistrement\u2026');
      return ganttTrello
        .saveCardDates(t, row.cardId, {
          startDate: row.startDate,
          dueDate: row.dueDate,
          dueTime:
            (state.cardsById[row.cardId] &&
              state.cardsById[row.cardId].dueTime) ||
            '',
        })
        .then(function (res) {
          state.saving = false;
          if (!res || !res.ok) {
            var reason = (res && res.reason) || 'error';
            if (reason === 'auth-failed' || reason === 'not-authorized') {
              state.authHint =
                'Autorisez l\u2019acc\u00e8s Trello pour enregistrer les dates.';
              setStatus(state.authHint, true);
            } else {
              setStatus('\u00c9chec enregistrement (' + reason + ')', true);
            }
            return reload();
          }
          setStatus('Dates enregistr\u00e9es');
          setTimeout(function () {
            if (!state.saving) setStatus('');
          }, 1500);
          return res;
        })
        .catch(function (err) {
          state.saving = false;
          setStatus(
            'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
            true
          );
          return reload();
        });
    }

    function bindBarDrag(barEl, row, interval) {
      if (row.kind !== 'card' || !row.cardId) return;

      function onPointerDown(ev) {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();

        var rect = barEl.getBoundingClientRect();
        var localX = ev.clientX - rect.left;
        var mode = 'move';
        if (localX <= EDGE_PX) mode = 'start';
        else if (localX >= rect.width - EDGE_PX) mode = 'end';

        var r = range();
        var startX = ev.clientX;
        var origin = {
          start: interval.start,
          end: interval.end,
        };
        state.drag = {
          row: row,
          mode: mode,
          origin: origin,
          startX: startX,
          range: r,
          width: state.timelineWidth,
          pointerId: ev.pointerId,
        };
        barEl.classList.add('is-dragging');
        barEl.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!state.drag) return;
          var dx = e.clientX - state.drag.startX;
          var dayDelta = Math.round(
            (dx / state.drag.width) * model.rangeDayCount(state.drag.range)
          );
          var next;
          if (state.drag.mode === 'move') {
            next = model.shiftInterval(state.drag.origin, dayDelta);
          } else {
            next = model.resizeInterval(
              state.drag.origin,
              state.drag.mode === 'start' ? 'start' : 'end',
              dayDelta
            );
          }
          if (!next) return;
          next = {
            start: model.snapDate(next.start, state.viewMode),
            end: model.snapDate(next.end, state.viewMode),
          };
          if (next.end.getTime() < next.start.getTime()) {
            if (state.drag.mode === 'start') next.start = next.end;
            else next.end = next.start;
          }
          applyIntervalToRow(row, next);
          updateBarEl(barEl, row, next);
        }

        function onUp() {
          barEl.releasePointerCapture(ev.pointerId);
          barEl.removeEventListener('pointermove', onMove);
          barEl.removeEventListener('pointerup', onUp);
          barEl.removeEventListener('pointercancel', onUp);
          barEl.classList.remove('is-dragging');
          var drag = state.drag;
          state.drag = null;
          if (!drag) return;
          var finalInterval = model.resolveBarInterval(row);
          if (
            finalInterval &&
            (model.toIsoDate(finalInterval.start) !==
              model.toIsoDate(drag.origin.start) ||
              model.toIsoDate(finalInterval.end) !==
                model.toIsoDate(drag.origin.end))
          ) {
            persistRow(row);
          }
        }

        barEl.addEventListener('pointermove', onMove);
        barEl.addEventListener('pointerup', onUp);
        barEl.addEventListener('pointercancel', onUp);
      }

      barEl.addEventListener('pointerdown', onPointerDown);
    }

    function updateBarEl(barEl, row, interval) {
      var r = range();
      var geo = model.barGeometry(interval, r, state.timelineWidth);
      if (!geo || !geo.visible) {
        barEl.style.display = 'none';
        return;
      }
      barEl.style.display = '';
      barEl.style.left = geo.left + 'px';
      barEl.style.width = geo.width + 'px';
      var fill = barEl.querySelector('.gantt-bar-fill');
      if (fill) {
        fill.style.width = Math.max(0, Math.min(100, row.progress || 0)) + '%';
      }
    }

    function renderChart() {
      body.innerHTML = '';
      if (state.loading) {
        body.appendChild(el('div', 'gantt-empty', { text: 'Chargement\u2026' }));
        return;
      }
      if (state.error) {
        body.appendChild(el('div', 'gantt-empty is-error', { text: state.error }));
        return;
      }

      var r = range();
      var rows = visibleRows();
      var chart = el('div', 'gantt-chart');
      var labelsCol = el('div', 'gantt-labels');
      var timelineCol = el('div', 'gantt-timeline');

      var headerLabels = el('div', 'gantt-row gantt-row--header');
      headerLabels.appendChild(el('div', 'gantt-label-cell', { text: 'T\u00e2ches' }));
      labelsCol.appendChild(headerLabels);

      var headerTimeline = el('div', 'gantt-row gantt-row--header gantt-timeline-header');
      headerTimeline.style.width = state.timelineWidth + 'px';
      r.columns.forEach(function (col) {
        var cell = el('div', 'gantt-col-head', { text: col.label });
        cell.style.width = 100 / r.columns.length + '%';
        headerTimeline.appendChild(cell);
      });
      timelineCol.appendChild(headerTimeline);

      // Today marker
      var todayDate = model.startOfDay(new Date());
      if (
        todayDate.getTime() >= r.start.getTime() &&
        todayDate.getTime() <= r.end.getTime()
      ) {
        var todayX = model.dateToX(todayDate, r, state.timelineWidth);
        var marker = el('div', 'gantt-today-line');
        marker.style.left = todayX + 'px';
        timelineCol.appendChild(marker);
      }

      if (!rows.length) {
        var empty = el('div', 'gantt-empty', {
          text: 'Aucune t\u00e2che \u00e0 afficher.',
        });
        body.appendChild(empty);
        return;
      }

      rows.forEach(function (row) {
        var labelRow = el('div', 'gantt-row');
        labelRow.style.height = ROW_H + 'px';
        var labelCell = el('div', 'gantt-label-cell');
        labelCell.style.paddingLeft = 8 + row.depth * 14 + 'px';

        if (row.expandable) {
          var isOpen =
            state.expanded[row.id] === true ||
            (state.expanded[row.id] == null && row.depth === 0);
          var twist = el('button', 'gantt-twist', {
            type: 'button',
            text: isOpen ? '\u25be' : '\u25b8',
          });
          twist.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleExpand(row.id);
          });
          labelCell.appendChild(twist);
        } else {
          labelCell.appendChild(el('span', 'gantt-twist-spacer'));
        }

        var nameBtn = el(
          'button',
          'gantt-task-name' + (row.kind === 'card' ? ' is-card' : ''),
          { type: 'button', text: row.name }
        );
        if (row.kind === 'card' && row.cardId) {
          nameBtn.addEventListener('click', function () {
            openCard(row.cardId);
          });
        }
        labelCell.appendChild(nameBtn);

        if (row.kind !== 'card' || !model.resolveBarInterval(row)) {
          var chip = el('span', 'gantt-progress-chip', {
            text: Math.round(row.progress || 0) + '%',
          });
          labelCell.appendChild(chip);
        }

        labelRow.appendChild(labelCell);
        labelsCol.appendChild(labelRow);

        var timeRow = el('div', 'gantt-row gantt-timeline-row');
        timeRow.style.height = ROW_H + 'px';
        timeRow.style.width = state.timelineWidth + 'px';

        var interval = model.resolveBarInterval(row);
        if (interval) {
          var geo = model.barGeometry(interval, r, state.timelineWidth);
          if (geo && geo.visible) {
            var bar = el('div', 'gantt-bar');
            if (row.kind === 'card') bar.classList.add('is-editable');
            bar.style.left = geo.left + 'px';
            bar.style.width = geo.width + 'px';
            bar.style.backgroundColor = row.color || 'var(--tp-primary, #0c66e4)';
            if (row.category) bar.setAttribute('data-category', row.category);
            bar.title =
              (row.name || '') +
              ' \u00b7 ' +
              model.toIsoDate(interval.start) +
              ' \u2192 ' +
              model.toIsoDate(interval.end);

            var fill = el('div', 'gantt-bar-fill');
            fill.style.width = Math.max(0, Math.min(100, row.progress || 0)) + '%';
            bar.appendChild(fill);

            var label = el('span', 'gantt-bar-label', {
              text: Math.round(row.progress || 0) + '%',
            });
            bar.appendChild(label);

            if (row.kind === 'card') {
              bar.appendChild(el('span', 'gantt-bar-edge gantt-bar-edge--start'));
              bar.appendChild(el('span', 'gantt-bar-edge gantt-bar-edge--end'));
              bindBarDrag(bar, row, interval);
            }

            timeRow.appendChild(bar);
          }
        }

        timelineCol.appendChild(timeRow);
      });

      chart.appendChild(labelsCol);
      var scroll = el('div', 'gantt-timeline-scroll');
      scroll.appendChild(timelineCol);
      chart.appendChild(scroll);
      body.appendChild(chart);

      // Measure available width once (or when viewport changed a lot).
      requestAnimationFrame(function () {
        var avail = scroll.clientWidth || MIN_TIMELINE_W;
        var nextW = Math.max(MIN_TIMELINE_W, avail);
        if (!state.widthMeasured || Math.abs(nextW - state.timelineWidth) > 48) {
          state.widthMeasured = true;
          if (Math.abs(nextW - state.timelineWidth) > 8) {
            state.timelineWidth = nextW;
            renderChart();
          }
        }
      });
    }

    function render() {
      renderToolbar();
      renderChart();
      if (typeof t.sizeTo === 'function') {
        try {
          t.sizeTo(document.body);
        } catch (e) {
          /* ignore */
        }
      }
    }

    function reload() {
      state.loading = true;
      state.error = '';
      setStatus('Chargement du tableau\u2026');
      render();
      return ganttTrello
        .loadBoard(t)
        .then(function (data) {
          state.loading = false;
          state.tree = (data && data.tree) || [];
          state.cardsById = Object.create(null);
          var cards = (data && data.cards) || [];
          for (var i = 0; i < cards.length; i++) {
            if (cards[i] && cards[i].id) {
              state.cardsById[cards[i].id] = cards[i];
            }
          }
          setStatus(cards.length + ' carte(s)');
          render();
        })
        .catch(function (err) {
          state.loading = false;
          state.error =
            'Impossible de charger le Gantt\u00a0: ' +
            (err && err.message ? err.message : String(err));
          setStatus(state.error, true);
          render();
        });
    }

    // Auth button in status when needed
    statusBar.addEventListener('click', function () {
      if (!state.authHint) return;
      ganttTrello.ensureRestAuthorized(t).then(function (res) {
        if (res && res.ok) {
          state.authHint = '';
          setStatus('Autorisation OK');
        }
      });
    });

    reload();

    return {
      destroy: function () {
        mount.innerHTML = '';
      },
      reload: reload,
      getState: function () {
        return state;
      },
    };
  }

  global.GanttUI = {
    mountGantt: mountGantt,
  };
})(typeof window !== 'undefined' ? window : this);
