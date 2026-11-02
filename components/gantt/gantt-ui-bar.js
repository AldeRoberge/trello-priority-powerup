/**
 * gantt-ui: mountGantt() part 1 of 5.
 * The body of mountGantt runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see gantt-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.GanttUiParts = global.GanttUiParts || {});
  var P = (global.GanttUiPartsMountMountGantt = global.GanttUiPartsMountMountGantt || { list: [] });

  P.list.push({
    define: function (M) {
    M.persistFilters = function persistFilters() {
      if (global.HideDone) global.HideDone.set(M.state.hideCompleted);
      S.storeFilters({
        hideCompleted: M.state.hideCompleted,
        hideUndated: M.state.hideUndated,
        hideBlocked: M.state.hideBlocked,
        sortKeys: M.state.sortKeys,
        groupByStatus: M.state.groupByStatus,
        groupByProject: M.state.groupByProject,
        criteria: M.state.criteria,
      });
    };
    M.meIds = function meIds() {
      return M.state.me && M.state.me.id ? [String(M.state.me.id)] : [];
    };
    M.filterOptions = function filterOptions() {
      return {
        hideCompleted: !!M.state.hideCompleted,
        hideBlocked: !!M.state.hideBlocked,
        hideUndated: !!M.state.hideUndated,
      };
    };
    M.taskCounts = function taskCounts() {
      var total = 0;
      (M.state.tree || []).forEach(function (n) {
        if (!n) return;
        if (n.kind === 'section') {
          (n.children || []).forEach(function (c) {
            if (c && c.kind === 'card') total++;
          });
        } else if (n.kind === 'card') {
          total++;
        }
      });
      var shown = 0;
      M.visibleRows().forEach(function (r) {
        if (r && r.kind === 'card' && r.depth === 0) shown++;
      });
      return { shown: shown, total: total };
    };
    M.currentFacets = function currentFacets() {
      if (!M.state.facets) {
        M.state.facets = M.model.collectFacets(M.state.tree, { meIds: M.meIds() });
      }
      return M.state.facets;
    };
    M.openPanelButton = function openPanelButton(panel) {
      var btn = panel && panel.wrap && panel.wrap.querySelector('button');
      if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
    };
    M.renderSummaryBar = function renderSummaryBar() {
      var GF = global.GanttFilters;
      if (!GF) return;
      if (!M.summaryBar) {
        M.summaryBar = GF.createSummaryBar({
          getKeys: function () {
            return M.state.sortKeys;
          },
          getGroup: function () {
            return M.state.groupByStatus;
          },
          getGroupProject: function () {
            return M.state.groupByProject;
          },
          getCriteria: function () {
            return M.state.criteria;
          },
          getFacets: M.currentFacets,
          getOptions: M.filterOptions,
          getCounts: M.taskCounts,
          onOpenSort: function () {
            M.openPanelButton(M.sortPanel);
          },
          onOpenFilter: function () {
            M.openPanelButton(M.filterPanel);
          },
          onCriteria: M.applyCriteria,
          onOption: function (name, on) {
            M.state[name] = !!on;
            M.onFiltersChanged();
          },
          onReset: M.resetAllFilters,
        });
        M.root.insertBefore(M.summaryBar.root, M.bulkBar);
      } else {
        M.summaryBar.refresh();
      }
    };
    M.refreshFilterUi = function refreshFilterUi() {
      if (M.filterPanel) M.filterPanel.refresh();
      if (M.sortPanel) M.sortPanel.refresh();
      if (M.summaryBar) M.summaryBar.refresh();
      M.refreshHideDoneBtn();
    };
    M.refreshHideDoneBtn = function refreshHideDoneBtn() {
      var HD = global.HideDone;
      if (!HD || !M.hideDoneBtn) return;
      var on = !!M.state.hideCompleted;
      M.hideDoneBtn.classList.toggle('is-active', on);
      M.hideDoneBtn.title = HD.title(on);
      M.hideDoneBtn.innerHTML = '';
      var i = document.createElement('i');
      i.className = 'ti ti-' + HD.icon(on);
      i.setAttribute('aria-hidden', 'true');
      M.hideDoneBtn.appendChild(i);
      var lab = document.createElement('span');
      lab.textContent = HD.label(on);
      M.hideDoneBtn.appendChild(lab);
    };
    M.onFiltersChanged = function onFiltersChanged() {
      M.persistFilters();
      M.renderChart();
      M.refreshFilterUi();
    };
    M.onSortChanged = function onSortChanged() {
      M.persistFilters();
      M.applySort();
      M.renderChart();
      M.refreshFilterUi();
    };
    M.resetAllFilters = function resetAllFilters() {
      M.state.criteria = S.normalizeCriteriaUi(null);
      M.state.hideCompleted = false;
      M.state.hideBlocked = false;
      M.state.hideUndated = false;
      M.onFiltersChanged();
    };
    M.showDragTip = function showDragTip(clientX, clientY, text) {
      if (!text) {
        M.dragTip.hidden = true;
        return;
      }
      M.dragTip.textContent = text;
      M.dragTip.hidden = false;
      var rootRect = M.root.getBoundingClientRect();
      var margin = 6;
      var left = clientX - rootRect.left + 14;
      var top = clientY - rootRect.top + 18;
      var tw = M.dragTip.offsetWidth || 80;
      var th = M.dragTip.offsetHeight || 24;
      if (left + tw > rootRect.width - margin) {
        left = clientX - rootRect.left - tw - 14;
      }
      if (top + th > rootRect.height - margin) {
        top = clientY - rootRect.top - th - 12;
      }
      M.dragTip.style.left = Math.max(margin, left) + 'px';
      M.dragTip.style.top = Math.max(margin, top) + 'px';
    };
    M.hideDragTip = function hideDragTip() {
      M.dragTip.hidden = true;
    };
    M.availableTimelineWidth = function availableTimelineWidth(scrollEl) {
      var chartEl = M.body.querySelector('.gantt-chart');
      if (chartEl && chartEl.clientWidth > 0) {
        // Measure from the chart shell so a horizontal scrollbar inside the
        // scrollport cannot shrink avail and fight the content width.
        return Math.max(0, chartEl.clientWidth - M.state.labelsWidth - 5);
      }
      return (scrollEl && scrollEl.clientWidth) || 0;
    };
    M.applyTimelineWidth = function applyTimelineWidth(nextW, scrollLeft) {
      var w = Math.round(Number(nextW) || 0);
      if (w < 1) return false;
      if (Math.abs(w - M.state.timelineWidth) <= 2 && M.state.widthMeasured) {
        return false;
      }
      if (typeof scrollLeft === 'number' && isFinite(scrollLeft)) {
        M.state.pendingScrollLeft = scrollLeft;
      }
      M.state.timelineWidth = w;
      M.state.widthMeasured = true;
      return true;
    };
    M.remeasureTimeline = function remeasureTimeline(force) {
      if (M.state.splitDrag || M.state.drag || M.state.paint) return;
      var scroll = M.body.querySelector('.gantt-timeline-scroll');
      if (!scroll) return;
      var avail = M.availableTimelineWidth(scroll);
      if (avail < 1) return;
      var nextW = M.chartTimelineWidth(avail);
      if (!force && Math.abs(nextW - M.state.timelineWidth) <= 2) {
        M.state.widthMeasured = true;
        return;
      }
      if (M.applyTimelineWidth(nextW, scroll.scrollLeft)) {
        M.renderChart();
      }
    };
    M.scheduleRemeasure = function scheduleRemeasure() {
      if (M.measureRaf) return;
      M.measureRaf = requestAnimationFrame(function () {
        M.measureRaf = 0;
        M.remeasureTimeline(false);
      });
    };
    M.bindLabelsSplitter = function bindLabelsSplitter(splitter, labelsCol, chartEl, scrollEl) {
      splitter.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) return;
        if (M.state.splitDrag || M.state.drag || M.state.paint) return;
        ev.preventDefault();
        ev.stopPropagation();
        M.state.splitDrag = {
          startX: ev.clientX,
          startW: labelsCol.getBoundingClientRect().width || M.state.labelsWidth,
          pointerId: ev.pointerId,
        };
        splitter.classList.add('is-dragging');
        M.root.classList.add('is-resizing');
        splitter.setPointerCapture(ev.pointerId);

        function onMove(e) {
          if (!M.state.splitDrag) return;
          var next = S.clampLabelsWidth(
            M.state.splitDrag.startW + (e.clientX - M.state.splitDrag.startX),
            chartEl
          );
          M.state.labelsWidth = next;
          labelsCol.style.width = next + 'px';
        }

        function onUp() {
          splitter.releasePointerCapture(ev.pointerId);
          splitter.removeEventListener('pointermove', onMove);
          splitter.removeEventListener('pointerup', onUp);
          splitter.removeEventListener('pointercancel', onUp);
          splitter.classList.remove('is-dragging');
          M.root.classList.remove('is-resizing');
          M.state.splitDrag = null;
          M.state.labelsWidth = S.clampLabelsWidth(M.state.labelsWidth, chartEl);
          S.storeLabelsWidth(M.state.labelsWidth);
          labelsCol.style.width = M.state.labelsWidth + 'px';
          // Remeasure timeline so the day grid matches the new calendar width.
          M.remeasureTimeline(true);
        }

        splitter.addEventListener('pointermove', onMove);
        splitter.addEventListener('pointerup', onUp);
        splitter.addEventListener('pointercancel', onUp);
      });
    };
    M.setStatus = function setStatus(msg, isError, openHistory) {
      clearTimeout(M.statusTimer);
      M.statusBar.textContent = '';
      if (openHistory && msg) {
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'hp-status-link';
        link.title = 'Ouvrir l’historique';
        link.textContent = msg;
        link.addEventListener('click', openHistory);
        M.statusBar.appendChild(link);
      } else {
        M.statusBar.textContent = msg || '';
      }
      M.statusBar.classList.toggle('is-error', !!isError);
      if (msg && !isError) {
        M.statusTimer = setTimeout(function () {
          M.statusBar.textContent = '';
        }, 4000);
      }
    };
    M.record = function record(e) {
      return M.HP ? M.HP.record(e) : e;
    };
    M.datesOf = function datesOf(src) {
      src = src || {};
      return {
        startDate: src.startDate || '',
        dueDate: src.dueDate || '',
        startTime: src.startTime || '',
        dueTime: src.dueTime || '',
      };
    };
    M.datesLabel = function datesLabel(d) {
      if (!d || (!d.startDate && !d.dueDate)) return 'Aucune date';
      function one(date, time) {
        return date ? date + (time ? ' ' + time : '') : '\u2026';
      }
      return one(d.startDate, d.startTime) + ' \u2192 ' + one(d.dueDate, d.dueTime);
    };
    M.histChk = function histChk(res, msg) {
      if (res && res.ok === false && res.reason !== 'no-inputs') {
        throw new Error(msg + (res.reason ? ' (' + res.reason + ')' : ''));
      }
      return res;
    };
    M.applyEntry = function applyEntry(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      var api = global.PriorityTrello;
      if (e.type === 'dates') {
        return M.ganttTrello.saveCardDates(M.t, e.targetId, val).then(function (r) {
          return M.histChk(r, 'Dates non enregistr\u00e9es');
        });
      }
      if (e.type === 'archive') {
        return api.restPutCard(M.t, e.targetId, { closed: !back }).then(function (r) {
          return M.histChk(r, 'Archivage impossible');
        });
      }
      if (e.type === 'move') {
        return M.ganttTrello
          .setCardBlocked(M.t, e.targetId, !!(val && val.blocked))
          .then(function (r) {
            M.histChk(r, 'Blocage impossible');
            if (!val || !val.listId) return null;
            return api
              .restPutCard(M.t, e.targetId, { idList: String(val.listId), pos: 'bottom' })
              .then(function (r2) {
                return M.histChk(r2, 'D\u00e9placement impossible');
              });
          });
      }
      if (e.type === 'progress') {
        return M.ganttTrello.setSubtaskDone(M.t, e.meta, !!val).then(function (r) {
          return M.histChk(r, '\u00c9chec');
        });
      }
      if (e.type === 'edit' && e.key === 'name') {
        return M.ganttTrello.renameSubtask(M.t, e.meta, val).then(function (r) {
          return M.histChk(r, '\u00c9chec renommage');
        });
      }
      if (e.type === 'edit' && e.key === 'blocked') {
        return M.ganttTrello.setCardBlocked(M.t, e.targetId, !!val).then(function (r) {
          return M.histChk(r, 'Blocage impossible');
        });
      }
      return Promise.reject(new Error('Cette modification ne peut pas \u00eatre annul\u00e9e'));
    };
    M.histVerb = function histVerb(e) {
      if (e.type === 'archive') return 'archiv\u00e9e';
      if (e.type === 'delete') return e.label || 'supprim\u00e9e';
      if (e.type === 'move') return 'd\u00e9plac\u00e9e';
      if (e.type === 'add') return 'sous-t\u00e2che ajout\u00e9e';
      if (e.type === 'dates') return 'dates modifi\u00e9es';
      if (e.type === 'progress') return 't\u00e2che ' + (e.afterVal ? 'termin\u00e9e' : 'rouverte');
      return (e.label || 'Champ') + ' modifi\u00e9';
    };
    M.recordRemoval = function recordRemoval(row, res) {
      if (!res) return;
      if (res.archived) {
        M.record({ type: 'archive', targetId: row.cardId, title: row.name });
      } else {
        M.record({
          type: 'delete',
          targetId: row.itemId || row.cardId || '',
          title: row.name,
          label: res.unlinked ? 'lien retir\u00e9' : 'sous-t\u00e2che supprim\u00e9e',
        });
      }
    };
    M.recordDone = function recordDone(row, nextDone) {
      M.record({
        type: 'progress',
        targetId: row.cardId || row.itemId || '',
        title: row.name,
        meta: M.subtaskMeta(row),
        before: nextDone ? '\u00c0 faire' : 'Termin\u00e9e',
        after: nextDone ? 'Termin\u00e9e' : '\u00c0 faire',
        beforeVal: !nextDone,
        afterVal: !!nextDone,
      });
    };
    M.range = function range() {
      if (typeof M.model.spanRange === 'function') {
        return M.model.spanRange(
          M.state.viewMode,
          M.state.anchor,
          M.state.spanBefore || 0,
          M.state.spanAfter || 0
        );
      }
      return M.model.viewRange(M.state.viewMode, M.state.anchor);
    };
    M.baseColumnCount = function baseColumnCount() {
      var base = M.model.viewRange(M.state.viewMode, M.state.anchor);
      var n = base && base.columns ? base.columns.length : 1;
      return Math.max(1, n);
    };
    M.chartTimelineWidth = function chartTimelineWidth(avail) {
      var cols = Math.max(1, (M.range().columns || []).length);
      var base = M.baseColumnCount();
      var one = S.computeTimelineWidth(avail, M.state.viewMode, base, M.state.zoom);
      return Math.max(1, Math.round((one / base) * cols));
    };
    M.extendSpan = function extendSpan(dir, where) {
      if (M.state.spanLock || M.state.drag || M.state.paint || M.state.loading) return false;
      var max = M.SPAN_MAX[M.state.viewMode] || 24;
      var before = M.state.spanBefore || 0;
      var after = M.state.spanAfter || 0;
      if (dir < 0) {
        if (before >= max) return false;
      } else if (after >= max) return false;
      var oldCols = (M.range().columns || []).length || 1;
      var scroll = M.body.querySelector('.gantt-timeline-scroll');
      var oldLeft = scroll ? scroll.scrollLeft : 0;
      var avail = scroll ? M.availableTimelineWidth(scroll) : 0;
      if (dir < 0) M.state.spanBefore = before + 1;
      else M.state.spanAfter = after + 1;
      var nextW = avail >= 1 ? M.chartTimelineWidth(avail) : M.state.timelineWidth;
      var newCols = (M.range().columns || []).length || oldCols;
      var addedPx = 0;
      if (dir < 0 && newCols > 0) {
        addedPx = nextW * ((newCols - oldCols) / newCols);
      }
      var left = oldLeft + addedPx;
      if (where === 'end') left = nextW;
      if (where === 'start') left = 0;
      if (where === 'page') {
        var view = scroll ? Math.round(scroll.clientWidth * 0.85) : 0;
        left = dir > 0 ? oldLeft + view : Math.max(0, oldLeft + addedPx - view);
      }
      M.state.pendingScrollLeft = left;
      M.state.timelineWidth = nextW;
      M.state.widthMeasured = true;
      M.state.scrollToToday = false;
      M.state.spanLock = true;
      M.render();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          M.state.spanLock = false;
        });
      });
      return true;
    };
    M.nudgePeriod = function nudgePeriod(dir) {
      var scroll = M.body.querySelector('.gantt-timeline-scroll');
      if (!scroll || M.state.loading) {
        M.state.spanBefore = 0;
        M.state.spanAfter = 0;
        M.state.anchor = M.model.toIsoDate(
          M.model.shiftAnchor(M.state.viewMode, M.state.anchor, dir < 0 ? -1 : 1)
        );
        M.state.scrollToToday = true;
        M.render();
        return;
      }
      var maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      var page = Math.max(80, Math.round(scroll.clientWidth * 0.85));
      if (dir > 0 && scroll.scrollLeft < maxScroll - 4) {
        scroll.scrollLeft = Math.min(maxScroll, scroll.scrollLeft + page);
        return;
      }
      if (dir < 0 && scroll.scrollLeft > 4) {
        scroll.scrollLeft = Math.max(0, scroll.scrollLeft - page);
        return;
      }
      M.extendSpan(dir, dir > 0 ? 'end' : 'start');
    };
    M.intervalOptions = function intervalOptions() {
      return {
        mode: M.state.viewMode,
        dayStart: M.state.ganttSettings.dayStart,
        dayEnd: M.state.ganttSettings.dayEnd,
      };
    };
    M.usesTimedTimeline = function usesTimedTimeline() {
      return M.state.viewMode === 'day' || M.state.viewMode === 'week';
    };
    M.timelineMapOptions = function timelineMapOptions() {
      if (!M.usesTimedTimeline()) return null;
      if (typeof M.model.buildTimeWarp !== 'function') return null;
      var warp = M.model.buildTimeWarp(
        M.state.ganttSettings.dayStart,
        M.state.ganttSettings.dayEnd
      );
      if (!warp) return null;
      return { timeWarp: warp };
    };
    M.clearNowTip = function clearNowTip() {
      if (M.nowTipTimer) {
        clearInterval(M.nowTipTimer);
        M.nowTipTimer = 0;
      }
    };
    M.bindNowLineTip = function bindNowLineTip(scroll, timelineCol, marker, range, mapOpts) {
      if (!marker || typeof M.model.formatNowLineTitle !== 'function') return;
      var tip = S.el('div', 'gantt-now-tip');
      tip.hidden = true;
      tip.setAttribute('role', 'tooltip');
      timelineCol.appendChild(tip);
      var offTitle = timelineCol.getAttribute('title') || '';
      var anchorX = 0;
      var anchorY = 0;

      function hide() {
        M.clearNowTip();
        tip.hidden = true;
        if (offTitle) timelineCol.setAttribute('title', offTitle);
      }

      function paint() {
        var width = M.state.timelineWidth;
        var colRect = timelineCol.getBoundingClientRect();
        var cursorX = anchorX - colRect.left;
        var drawn = parseFloat(marker.style.left);
        if (!isFinite(drawn)) drawn = cursorX;
        var live = new Date();
        var liveX =
          typeof M.model.dateTimeToX === 'function'
            ? M.model.dateTimeToX(live, range, width, mapOpts)
            : drawn;
        // Follow the clock only while that stays under the cursor. A stale
        // line keeps the instant it was drawn at, so the tip matches the pixel.
        var follow = Math.abs(liveX - cursorX) <= 14;
        var x = follow ? liveX : drawn;
        var when = follow
          ? live
          : (typeof M.model.xToDateTime === 'function' &&
              M.model.xToDateTime(x, range, width, mapOpts)) ||
            live;
        if (follow) marker.style.left = x + 'px';
        var px =
          typeof M.model.timelinePxPerSecond === 'function'
            ? M.model.timelinePxPerSecond(when, range, width, mapOpts)
            : 0;
        tip.textContent = M.model.formatNowLineTitle(when, px);
        var top = anchorY - colRect.top + 14;
        if (top < 36) top = 36;
        var maxTop = (timelineCol.offsetHeight || 0) - 28;
        if (maxTop > 36 && top > maxTop) top = maxTop;
        tip.style.top = top + 'px';
        tip.hidden = false;
        var tipW = tip.offsetWidth || 140;
        if (x + 12 + tipW > width) {
          tip.style.left = Math.max(0, x - 8) + 'px';
          tip.style.transform = 'translateX(-100%)';
        } else {
          tip.style.left = x + 12 + 'px';
          tip.style.transform = 'none';
        }
      }

      function blocked(ev) {
        var node = ev.target;
        if (!node || !node.closest) return false;
        return !!node.closest(
          '.gantt-bar, .gantt-col-head, .gantt-hour-label, .gantt-timeline-header'
        );
      }

      timelineCol.addEventListener('pointermove', function (ev) {
        if (M.state.paint || M.state.drag || M.state.saving || blocked(ev)) {
          hide();
          return;
        }
        var rect = marker.getBoundingClientRect();
        var lineX = rect.left + rect.width / 2;
        if (Math.abs(ev.clientX - lineX) > 10) {
          hide();
          return;
        }
        anchorX = ev.clientX;
        anchorY = ev.clientY;
        if (offTitle) timelineCol.removeAttribute('title');
        if (!M.nowTipTimer) {
          paint();
          M.nowTipTimer = setInterval(paint, 80);
        } else {
          var colRect = timelineCol.getBoundingClientRect();
          var top = anchorY - colRect.top + 14;
          if (top < 36) top = 36;
          tip.style.top = top + 'px';
        }
      });
      timelineCol.addEventListener('pointerleave', hide);
      scroll.addEventListener('scroll', hide);
    };
    M.levelInfo = function levelInfo(mode, anchorIso, avail, zoom) {
      var rr = M.model.viewRange(mode, anchorIso);
      var days = Math.max(1, M.model.rangeDayCount(rr));
      var cols = (rr.columns && rr.columns.length) || 1;
      return {
        range: rr,
        days: days,
        width: S.computeTimelineWidth(avail, mode, cols, zoom),
        natural: S.computeTimelineWidth(avail, mode, cols, 1) / days,
      };
    };
    M.currentPxPerDay = function currentPxPerDay() {
      return M.state.timelineWidth / Math.max(1, M.model.rangeDayCount(M.range()));
    };
    M.applyZoomPx = function applyZoomPx(targetP, clientX) {
      var scroll = M.body.querySelector('.gantt-timeline-scroll');
      var head = M.body.querySelector('.gantt-timeline-header');
      if (!scroll || !head || M.state.loading) return null;
      var avail = M.availableTimelineWidth(scroll);
      if (avail < 1) return null;

      var r = M.range();
      var headRect = head.getBoundingClientRect();
      var scrollRect = scroll.getBoundingClientRect();
      var focal = M.model.xToDateTime(
        clientX - headRect.left,
        r,
        M.state.timelineWidth,
        M.timelineMapOptions()
      );
      if (!focal) return null;
      var focalIso = M.model.toIsoDate(focal);

      var minP = M.levelInfo('year', focalIso, avail, 1).natural;
      var maxP = M.levelInfo('week', focalIso, avail, 1).natural * M.MAX_WEEK_ZOOM;
      var p = Math.max(minP, Math.min(maxP, targetP));
      var mode = M.ZOOM_LEVELS[0];
      for (var i = 0; i < M.ZOOM_LEVELS.length; i++) {
        if (M.levelInfo(M.ZOOM_LEVELS[i], focalIso, avail, 1).natural <= p * 1.0001) {
          mode = M.ZOOM_LEVELS[i];
        }
      }
      var modeChanged = mode !== M.state.viewMode;
      var anchorIso = modeChanged ? focalIso : M.state.anchor;
      if (modeChanged) {
        M.state.spanBefore = 0;
        M.state.spanAfter = 0;
      }
      var info = M.levelInfo(mode, anchorIso, avail, 1);
      var z = Math.max(1, p / info.natural);
      var fitted = M.levelInfo(mode, anchorIso, avail, z).width;
      var baseCols = (info.range.columns && info.range.columns.length) || 1;
      var spanCols = baseCols;
      if (!modeChanged && typeof M.model.spanRange === 'function') {
        var spanned = M.model.spanRange(
          mode,
          anchorIso,
          M.state.spanBefore || 0,
          M.state.spanAfter || 0
        );
        spanCols = (spanned.columns && spanned.columns.length) || baseCols;
      }
      var width = Math.round(fitted * (spanCols / baseCols));

      M.state.viewMode = mode;
      M.state.anchor = anchorIso;
      M.state.zoom = z;
      M.state.timelineWidth = width;
      M.state.widthMeasured = true;
      M.state.pendingFocal = {
        ms: focal.getTime(),
        vx: clientX - scrollRect.left,
        off: headRect.left - scrollRect.left + scroll.scrollLeft,
      };
      if (modeChanged) M.render();
      else M.renderChart();
      return p;
    };
    M.onWheelZoom = function onWheelZoom(ev) {
      var unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 120 : 1;
      var f = Math.exp(-ev.deltaY * unit * 0.002);
      f = Math.max(0.6, Math.min(1.6, f));
      if (!M.zoomAnim.raf) {
        M.zoomAnim.curP = M.currentPxPerDay();
        M.zoomAnim.targetP = M.zoomAnim.curP;
      }
      M.zoomAnim.targetP *= f;
      M.zoomAnim.clientX = ev.clientX;
      if (!M.zoomAnim.raf) M.zoomAnim.raf = requestAnimationFrame(M.zoomTick);
    };
    M.zoomTick = function zoomTick() {
      M.zoomAnim.raf = 0;
      var ratio = M.zoomAnim.targetP / M.zoomAnim.curP;
      if (!isFinite(ratio) || ratio <= 0) return;
      var done = Math.abs(Math.log(ratio)) < 0.004;
      var next = done ? M.zoomAnim.targetP : M.zoomAnim.curP * Math.pow(ratio, 0.3);
      var applied = M.applyZoomPx(next, M.zoomAnim.clientX);
      if (applied == null) return;
      if (Math.abs(applied - next) > 1e-6) {
        // Hit the closest / farthest zoom: stop pushing past it.
        M.zoomAnim.targetP = applied;
        done = true;
      }
      M.zoomAnim.curP = applied;
      if (!done) M.zoomAnim.raf = requestAnimationFrame(M.zoomTick);
    };
    M.hourStepFor = function hourStepFor(dayPx) {
      var step = 0;
      for (var i = 0; i < M.HOUR_STEPS.length; i++) {
        if ((dayPx * M.HOUR_STEPS[i]) / 1440 >= M.MIN_TICK_PX) step = M.HOUR_STEPS[i];
      }
      return step;
    };
    M.fmtTick = function fmtTick(minutes) {
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      return m ? h + 'h' + (m < 10 ? '0' : '') + m : h + 'h';
    };
    M.bindWeekScale = function bindWeekScale(scroll, timelineCol, headerTimeline, r) {
      var days = M.model.rangeDayCount(r);
      var dayPx = M.state.timelineWidth / days;
      if (M.state.viewMode !== 'year' || dayPx * 7 < M.MIN_WEEK_TICK_PX) return;
      var cols = r.columns;
      var cells = headerTimeline.children;
      var lines = S.el('div', 'gantt-hour-lines');
      var labels = S.el('div', 'gantt-hour-labels');
      timelineCol.appendChild(lines);
      headerTimeline.appendChild(labels);
      headerTimeline.classList.add('gantt-timeline-header--hours');
      var raf = 0;
      var drawnLeft = -1e9;
      var drawnRight = -1e9;
      var labelEvery = Math.max(1, Math.ceil(M.MIN_WEEK_LABEL_PX / (dayPx * 7)));
      var showMonth = dayPx * 7 * labelEvery >= 70;

      function draw() {
        raf = 0;
        var left = scroll.scrollLeft - 200;
        var right = scroll.scrollLeft + scroll.clientWidth + 200;
        var reuseTicks = Math.abs(left - drawnLeft) < 64 && Math.abs(right - drawnRight) < 64;
        if (!reuseTicks) {
          drawnLeft = left;
          drawnRight = right;
        }
        var linesFrag = document.createDocumentFragment();
        var labelsFrag = document.createDocumentFragment();
        for (var c = 0; c < cols.length; c++) {
          var x0 = M.model.dateToX(cols[c].start, r, M.state.timelineWidth);
          var x1 = M.model.dateToX(M.model.addDays(cols[c].end, 1), r, M.state.timelineWidth);
          var cell = cells[c];
          if (cell && cell.classList.contains('gantt-col-head')) {
            var shift = Math.max(0, Math.min(scroll.scrollLeft - x0, x1 - x0 - 60));
            var pad = shift + 8 + 'px';
            if (cell.style.paddingLeft !== pad) cell.style.paddingLeft = pad;
          }
          if (reuseTicks || x1 < left || x0 > right) continue;
          var d = M.model.startOfWeek(cols[c].start);
          if (d.getTime() < cols[c].start.getTime()) d = M.model.addDays(d, 7);
          for (; d.getTime() <= cols[c].end.getTime(); d = M.model.addDays(d, 7)) {
            var x = M.model.dateToX(d, r, M.state.timelineWidth);
            if (x === x0 || x < left || x > right) continue;
            var line = S.el('div', 'gantt-hour-line');
            line.style.left = x + 'px';
            linesFrag.appendChild(line);
            if (Math.round(d.getTime() / 604800000) % labelEvery) continue;
            var lab = S.el('span', 'gantt-hour-label', {
              text: showMonth && d.getDate() <= 7
                ? d.getDate() + ' ' + d.toLocaleDateString('fr-FR', { month: 'short' })
                : String(d.getDate()),
            });
            lab.style.left = x + 'px';
            labelsFrag.appendChild(lab);
          }
        }
        if (!reuseTicks) {
          lines.textContent = '';
          labels.textContent = '';
          lines.appendChild(linesFrag);
          labels.appendChild(labelsFrag);
        }
      }

      draw();
      scroll.addEventListener('scroll', function () {
        if (!raf) raf = requestAnimationFrame(draw);
      });
    };
    M.bindHourScale = function bindHourScale(scroll, timelineCol, headerTimeline, r, mapOpts) {
      var days = M.model.rangeDayCount(r);
      var dayPx = M.state.timelineWidth / days;
      if (M.state.viewMode !== 'week' || !M.hourStepFor(dayPx)) return;
      var step = M.hourStepFor(dayPx);
      var cells = headerTimeline.children;
      var first = M.model.startOfDay(r.start);
      var lines = S.el('div', 'gantt-hour-lines');
      var labels = S.el('div', 'gantt-hour-labels');
      timelineCol.appendChild(lines);
      headerTimeline.appendChild(labels);
      headerTimeline.classList.add('gantt-timeline-header--hours');
      var raf = 0;
      var drawnLeft = -1e9;
      var drawnRight = -1e9;

      function xOf(date) {
        return M.model.dateTimeToX(date, r, M.state.timelineWidth, mapOpts);
      }

      function dayAt(d, minutes) {
        return new Date(
          first.getFullYear(),
          first.getMonth(),
          first.getDate() + d,
          Math.floor(minutes / 60),
          minutes % 60
        );
      }

      function draw() {
        raf = 0;
        var left = scroll.scrollLeft - 200;
        var right = scroll.scrollLeft + scroll.clientWidth + 200;
        var reuseTicks = Math.abs(left - drawnLeft) < 64 && Math.abs(right - drawnRight) < 64;
        if (!reuseTicks) {
          drawnLeft = left;
          drawnRight = right;
        }
        var linesFrag = document.createDocumentFragment();
        var labelsFrag = document.createDocumentFragment();
        for (var d = 0; d < days; d++) {
          var x0 = xOf(dayAt(d, 0));
          var x1 = d === days - 1 ? M.state.timelineWidth : xOf(dayAt(d + 1, 0));
          // The day label follows the visible part of its (very wide) day.
          var cell = cells[d];
          if (cell && cell.classList.contains('gantt-col-head')) {
            var shift = Math.max(
              0,
              Math.min(scroll.scrollLeft - x0, x1 - x0 - 150)
            );
            var pad = shift + 8 + 'px';
            if (cell.style.paddingLeft !== pad) cell.style.paddingLeft = pad;
          }
          if (reuseTicks || x1 < left || x0 > right) continue;
          var lastX = x0;
          for (var m = step; m < 1440; m += step) {
            var x = xOf(dayAt(d, m));
            if (x < left || x > right) continue;
            var minor = m % 60 ? ' is-minor' : '';
            var line = S.el('div', 'gantt-hour-line' + minor);
            line.style.left = x + 'px';
            linesFrag.appendChild(line);
            if (x - lastX >= M.MIN_TICK_PX && x1 - x >= 24) {
              var lab = S.el('span', 'gantt-hour-label' + minor, {
                text: M.fmtTick(m),
              });
              lab.style.left = x + 'px';
              labelsFrag.appendChild(lab);
              lastX = x;
            }
          }
        }
        if (!reuseTicks) {
          lines.textContent = '';
          labels.textContent = '';
          lines.appendChild(linesFrag);
          labels.appendChild(labelsFrag);
        }
      }

      draw();
      scroll.addEventListener('scroll', function () {
        if (!raf) raf = requestAnimationFrame(draw);
      });
    };
    M.formatIntervalTitle = function formatIntervalTitle(interval) {
      if (!interval) return '';
      var start = M.model.toIsoDate(interval.start);
      var end = M.model.toIsoDate(interval.end);
      if (interval.hasTime && typeof M.model.toIsoTime === 'function') {
        start += ' ' + M.model.toIsoTime(interval.start);
        end += ' ' + M.model.toIsoTime(interval.end);
      }
      return start === end ? start : start + ' \u2192 ' + end;
    };
    M.formatDurationSummary = function formatDurationSummary(interval) {
      if (!interval || !interval.start || !interval.end) return '';
      var ms = interval.end.getTime() - interval.start.getTime();
      if (!isFinite(ms) || ms < 0) ms = 0;
      var mins = Math.round(ms / (M.model.MS_MINUTE || 60000));
      if (mins < 60) return mins + ' min';
      var days = Math.floor(mins / (24 * 60));
      var rem = mins - days * 24 * 60;
      var hours = Math.floor(rem / 60);
      var m = rem % 60;
      var parts = [];
      if (days > 0) parts.push(days + 'j');
      if (hours > 0) parts.push(hours + 'h');
      if (m > 0 && days === 0) parts.push(String(m));
      if (!parts.length) return '0 min';
      if (days === 0 && hours > 0 && m > 0) return hours + 'h ' + m;
      return parts.join(' ');
    };
    M.formatBarLabel = function formatBarLabel(row, interval) {
      var pct = Math.round((row && row.progress) || 0) + '%';
      if (interval && interval.hasTime && M.usesTimedTimeline()) {
        var dur = M.formatDurationSummary(interval);
        if (dur) return dur + ' \u00b7 ' + pct;
      }
      return pct;
    };
    M.makeBarEdge = function makeBarEdge(side, interval) {
      var edge = S.el(
        'span',
        'gantt-bar-edge gantt-bar-edge--' + side
      );
      var timeEl = S.el('span', 'gantt-bar-edge-time');
      if (
        interval &&
        interval.hasTime &&
        typeof M.model.toIsoTime === 'function'
      ) {
        timeEl.textContent = M.model.toIsoTime(
          side === 'start' ? interval.start : interval.end
        );
      }
      edge.appendChild(timeEl);
      return edge;
    };
    M.rowFilterOptions = function rowFilterOptions() {
      return {
        hideCompleted: M.state.hideCompleted,
        hideUndated: M.state.hideUndated,
        hideBlocked: M.state.hideBlocked,
        criteria: M.state.criteria,
        meIds: M.meIds(),
      };
    };
    M.visibleRows = function visibleRows() {
      var flat = M.model.flattenVisible(M.state.tree, M.state.expanded);
      var filtered = M.model.filterRows(flat, M.rowFilterOptions());
      if (typeof M.model.pruneEmptyStateSections === 'function') {
        return M.model.pruneEmptyStateSections(filtered, M.state.expanded);
      }
      return filtered;
    };
    M.sectionShownCount = function sectionShownCount(section) {
      return M.model.filterRows(section.children || [], M.rowFilterOptions()).length;
    };
    M.filtersActive = function filtersActive() {
      return !!(
        M.state.hideCompleted ||
        M.state.hideBlocked ||
        M.state.hideUndated ||
        (typeof M.model.criteriaCount === 'function' && M.model.criteriaCount(M.state.criteria) > 0)
      );
    };
    M.applyCriteria = function applyCriteria(next) {
      M.state.criteria = next;
      var st = (next && next.statuses) || [];
      if (st.indexOf('completed') !== -1) M.state.hideCompleted = false;
      if (st.indexOf('blocked') !== -1) M.state.hideBlocked = false;
      M.onFiltersChanged();
    };
    },
    run: function (M) {
    M.options = M.options || {};
    M.model = S.GM();
    M.ganttTrello = S.GT();
    if (!M.model || !M.ganttTrello) {
      M.mount.textContent = 'Gantt modules missing.';
      return { v: { destroy: function () {} } };
    }
    M.storedFilters = S.readStoredFilters();
    M.state = {
      viewMode: 'week',
      anchor: M.model.toIsoDate(new Date()),
      // Extra periods loaded by scrolling past the current day / week / month / year.
      spanBefore: 0,
      spanAfter: 0,
      spanLock: false,
      tree: [],
      cardsById: Object.create(null),
      expanded: Object.create(null),
      selected: Object.create(null),
      hideCompleted: global.HideDone ? global.HideDone.get() : M.storedFilters.hideCompleted,
      hideUndated: M.storedFilters.hideUndated,
      hideBlocked: M.storedFilters.hideBlocked,
      sortKeys: M.storedFilters.sortKeys,
      groupByStatus: M.storedFilters.groupByStatus,
      groupByProject: M.storedFilters.groupByProject,
      goals: { nodes: [], links: [] },
      criteria: M.storedFilters.criteria,
      me: null,
      facets: null,
      loading: true,
      error: '',
      authHint: '',
      restAuthorized: null, // null = not checked yet
      timelineWidth: S.MIN_TIMELINE_W,
      // Continuous zoom (mouse wheel): multiplier on the natural width of the
      // current view mode, 1 = the mode's own fit. See applyZoomPx().
      zoom: 1,
      pendingFocal: null,
      labelsWidth: S.readStoredLabelsWidth(),
      widthMeasured: false,
      pendingScrollLeft: null,
      scrollToToday: true, // bring "now" into view after the next draw (load, view or period change)
      drag: null,
      paint: null,
      splitDrag: null,
      saving: false,
      outlookConnected: false,
      outlookSyncing: false,
      cardOverlay: null,
      cardOverlayKeyHandler: null,
      miniPopover: null,
      miniPopoverKeyHandler: null,
      miniPopoverOutsideHandler: null,
      filterMenuOpen: false,
      filterMenuOutsideHandler: null,
      sectionDrag: null,
      suppressCardOpen: false,
      ganttSettings: {
        dayStart: M.model.DEFAULT_DAY_START || '08:15',
        dayEnd: M.model.DEFAULT_DAY_END || '16:45',
      },
    };
    M.sortPanel = null;
    M.filterPanel = null;
    M.summaryBar = null;
    M.hideDoneBtn = null;
    M.root = S.el('div', 'gantt-root');
    M.toolbar = S.el('div', 'gantt-toolbar');
    M.bulkBar = S.el('div', 'gantt-bulk');
    M.body = S.el('div', 'gantt-body');
    M.statusBar = S.el('div', 'gantt-status');
    M.dragTip = S.el('div', 'gantt-drag-tip');
    M.dragTip.hidden = true;
    M.root.appendChild(M.toolbar);
    M.root.appendChild(M.bulkBar);
    M.root.appendChild(M.statusBar);
    M.root.appendChild(M.body);
    M.root.appendChild(M.dragTip);
    M.mount.innerHTML = '';
    M.mount.appendChild(M.root);
    if (
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function'
    ) {
      if (typeof global.ContextMenu.buildGanttToolbarItems === 'function') {
        ContextMenu.bind(M.toolbar, function () {
          return ContextMenu.buildGanttToolbarItems({
            viewMode: M.state.viewMode,
            hideCompleted: !!M.state.hideCompleted,
            hideBlocked: !!M.state.hideBlocked,
            hideUndated: !!M.state.hideUndated,
            onViewMode: function (mode) {
              M.state.viewMode = mode;
              M.state.zoom = 1;
              M.state.spanBefore = 0;
              M.state.spanAfter = 0;
              M.state.scrollToToday = true;
              M.render();
            },
            onPrev: function () {
              M.nudgePeriod(-1);
            },
            onToday: function () {
              M.state.anchor = M.model.toIsoDate(new Date());
              M.state.spanBefore = 0;
              M.state.spanAfter = 0;
              M.state.scrollToToday = true;
              M.render();
            },
            onNext: function () {
              M.nudgePeriod(1);
            },
            onToggleHideCompleted: function (nextVal) {
              M.state.hideCompleted = !!nextVal;
              M.onFiltersChanged();
            },
            onToggleHideBlocked: function (nextVal) {
              M.state.hideBlocked = !!nextVal;
              M.onFiltersChanged();
            },
            onToggleHideUndated: function (nextVal) {
              M.state.hideUndated = !!nextVal;
              M.onFiltersChanged();
            },
          });
        });
      }
      if (typeof global.ContextMenu.buildBulkActionItems === 'function') {
        ContextMenu.bind(M.bulkBar, function () {
          return ContextMenu.buildBulkActionItems({
            count: M.selectedCount(),
            onDone: function () {
              M.runBulk('done');
            },
            onReopen: function () {
              M.runBulk('reopen');
            },
            onDelete: function (e) {
              M.runBulk('delete', e);
            },
            onClear: M.clearSelection,
          });
        });
      }
    }
    M.measureRaf = 0;
    M.resizeObserver = null;
    if (typeof global.ResizeObserver === 'function') {
      M.resizeObserver = new global.ResizeObserver(function () {
        M.scheduleRemeasure();
      });
      M.resizeObserver.observe(M.root);
    } else if (typeof global.addEventListener === 'function') {
      global.addEventListener('resize', M.scheduleRemeasure);
    }
    M.statusTimer = null;
    M.HP = null;
    M.baseDates = Object.create(null);
    M.boardId = '';
    try {
      M.boardId = (M.t && typeof M.t.getContext === 'function' && M.t.getContext().board) || '';
    } catch (ctxErr) {
      /* no context */
    }
    if (global.HistoryPanel) {
      M.HP = global.HistoryPanel.create({
        key: 'tp-gantt-history:' + M.boardId,
        apply: M.applyEntry,
        verb: M.histVerb,
        canToggle: function (e) {
          return e.type !== 'field' && e.type !== 'delete' && e.type !== 'add';
        },
        after: function () {
          return M.reload({ quiet: true });
        },
        onStatus: function (m, kind, openHistory) {
          M.setStatus(m, false, openHistory);
        },
        onError: function (err) {
          M.setStatus('Erreur\u00a0: ' + (err && err.message ? err.message : String(err)), true);
        },
      });
    }
    M.histBtn = M.HP ? M.HP.button(document.body) : null;
    if (global.HideDone) {
      global.HideDone.subscribe(function (on) {
        if (M.state.hideCompleted === on) return;
        M.state.hideCompleted = on;
        M.renderChart();
        M.refreshFilterUi();
      });
    }
    M.SPAN_MAX = { day: 90, week: 52, month: 36, year: 12 };
    M.ZOOM_LEVELS = ['year', 'month', 'week'];
    M.MAX_WEEK_ZOOM = 100;
    M.zoomAnim = { raf: 0, targetP: 0, curP: 0, clientX: 0 };
    M.nowTipTimer = 0;
    M.HOUR_STEPS = [360, 180, 60, 30, 15, 5];
    M.MIN_TICK_PX = 52;
    M.MIN_WEEK_TICK_PX = 8;
    M.MIN_WEEK_LABEL_PX = 40;
    }
  });
})(typeof window !== 'undefined' ? window : this);
