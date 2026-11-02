/**
 * gantt-ui: mountGantt() part 5 of 5.
 * The body of mountGantt runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see gantt-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.GanttUiParts = global.GanttUiParts || {});
  var P = (global.GanttUiPartsMountMountGantt = global.GanttUiPartsMountMountGantt || { list: [] });

  P.list.push({
    define: function (M) {
    M.renderChart = function renderChart() {
      M.clearNowTip();
      var restoreLeft = M.state.pendingScrollLeft;
      M.state.pendingScrollLeft = null;
      if (M.state.pendingFocal) {
        // Zooming: put the instant that was under the cursor back under it.
        var pf = M.state.pendingFocal;
        M.state.pendingFocal = null;
        var fx = M.model.dateTimeToX(
          new Date(pf.ms),
          M.range(),
          M.state.timelineWidth,
          M.timelineMapOptions()
        );
        restoreLeft = Math.max(0, pf.off + fx - pf.vx);
      }
      if (restoreLeft == null) {
        var prevScroll = M.body.querySelector('.gantt-timeline-scroll');
        if (prevScroll) restoreLeft = prevScroll.scrollLeft;
      }

      M.body.innerHTML = '';
      if (M.state.loading) {
        M.body.innerHTML = global.Skeleton.html('gantt.body');
        return;
      }
      if (M.state.error) {
        M.body.appendChild(S.el('div', 'gantt-empty is-error', { text: M.state.error }));
        return;
      }

      var r = M.range();
      var rows = M.visibleRows();
      var chart = S.el('div', 'gantt-chart');
      var labelsCol = S.el('div', 'gantt-labels');
      var timelineCol = S.el('div', 'gantt-timeline');
      // Grid lines follow header columns (hours / days / months), not raw day count —
      // year view would otherwise paint hundreds of hairlines.
      var colCount = Math.max(1, (r.columns && r.columns.length) || 1);
      var colW = M.state.timelineWidth / colCount;
      timelineCol.style.setProperty('--gantt-day-w', colW + 'px');
      timelineCol.style.width = M.state.timelineWidth + 'px';
      timelineCol.classList.add('gantt-timeline--' + M.state.viewMode);

      // Paint morning / night on timed views via CSS (row backgrounds are opaque,
      // so absolute overlays behind them are invisible). Off-hours are time-warped
      // so they only take ~20% of each day column.
      var mapOpts = M.timelineMapOptions();
      var timeWarp = mapOpts && mapOpts.timeWarp;
      if (M.usesTimedTimeline() && timeWarp) {
        var dayCount =
          M.state.viewMode === 'day' ? Math.max(1, Math.round(colCount / 24)) : 1;
        var offUnit =
          M.state.viewMode === 'day' ? M.state.timelineWidth / dayCount : colW;
        timelineCol.classList.add('gantt-timeline--timed');
        timelineCol.style.setProperty('--gantt-off-unit-w', offUnit + 'px');
        timelineCol.style.setProperty(
          '--gantt-off-am-w',
          timeWarp.visualMorningEnd * offUnit + 'px'
        );
        timelineCol.style.setProperty(
          '--gantt-off-pm-w',
          timeWarp.visualNightStart * offUnit + 'px'
        );
        timelineCol.title =
          'Hors heures de travail \u00b7 avant ' +
          M.state.ganttSettings.dayStart +
          ' / apr\u00e8s ' +
          M.state.ganttSettings.dayEnd;
      }

      var headerLabels = S.el('div', 'gantt-row gantt-row--header');
      var headerCell = S.el('div', 'gantt-label-cell gantt-label-cell--header');
      var selectAll = S.el('input', 'gantt-select-box', { type: 'checkbox' });
      selectAll.title = 'Tout s\u00e9lectionner / d\u00e9s\u00e9lectionner';
      var visibleForSelect = [];
      for (var vs = 0; vs < rows.length; vs++) {
        if (M.isSelectableGanttRow(rows[vs])) visibleForSelect.push(rows[vs]);
      }
      var selectedVisible = 0;
      for (var vi = 0; vi < visibleForSelect.length; vi++) {
        if (
          visibleForSelect[vi] &&
          visibleForSelect[vi].id &&
          M.state.selected[visibleForSelect[vi].id]
        ) {
          selectedVisible++;
        }
      }
      var selectState = M.model.selectAllCheckboxState(
        selectedVisible,
        visibleForSelect.length
      );
      selectAll.checked = selectState.checked;
      selectAll.indeterminate = selectState.indeterminate;
      selectAll.addEventListener('change', function () {
        var on = !!selectAll.checked;
        var list = M.visibleRows();
        M.state.selected = Object.create(null);
        if (on) {
          for (var si = 0; si < list.length; si++) {
            if (M.isSelectableGanttRow(list[si])) {
              M.state.selected[list[si].id] = true;
            }
          }
        }
        M.renderBulkBar();
        M.renderChart();
      });
      headerCell.appendChild(selectAll);

      var headerNest = S.el('div', 'gantt-nest');
      headerNest.appendChild(S.el('span', 'gantt-twist-spacer'));

      var titleWrap = S.el('div', 'gantt-header-title-wrap');
      var titleSort = S.el('span', 'gantt-header-title');
      titleSort.appendChild(document.createTextNode('T\u00e2ches'));
      var nameInd = M.sortIndicator('name');
      if (nameInd) titleSort.appendChild(nameInd);
      M.bindSortableHeader(titleSort, 'name', 'nom');
      titleWrap.appendChild(titleSort);

      var subSort = S.el('span', 'gantt-header-subtasks-sort');
      subSort.appendChild(S.iconEl('ti-list-check', '', 'is-subtasks'));
      var subInd = M.sortIndicator('subtasks');
      if (subInd) subSort.appendChild(subInd);
      M.bindSortableHeader(subSort, 'subtasks', 'sous-t\u00e2ches');
      titleWrap.appendChild(subSort);
      headerNest.appendChild(titleWrap);
      headerCell.appendChild(headerNest);

      var headerIcons = S.el('div', 'gantt-detail-icons gantt-detail-icons--header');
      [
        { cls: 'is-blocked', sortable: false },
        {
          cls: 'is-priority',
          sortable: true,
          mode: 'priority',
          label: 'priorit\u00e9',
          content: function (slot) {
            slot.appendChild(S.priorityDotEl('', null));
            var ind = M.sortIndicator('priority');
            if (ind) slot.appendChild(ind);
          },
        },
        {
          cls: 'is-progress',
          sortable: true,
          mode: 'progress',
          label: 'progr\u00e8s',
          content: function (slot) {
            slot.appendChild(
              S.el('span', 'gantt-progress-text', { text: '%' })
            );
            var ind = M.sortIndicator('progress');
            if (ind) slot.appendChild(ind);
          },
        },
        { cls: 'is-due', sortable: false },
      ].forEach(function (spec) {
        var slot = S.el('span', 'gantt-detail-slot ' + spec.cls);
        if (spec.sortable) {
          if (typeof spec.content === 'function') spec.content(slot);
          M.bindSortableHeader(slot, spec.mode, spec.label);
        }
        headerIcons.appendChild(slot);
      });
      headerCell.appendChild(headerIcons);
      headerCell.appendChild(S.el('span', 'gantt-row-actions gantt-row-actions--header'));
      headerLabels.appendChild(headerCell);
      labelsCol.appendChild(headerLabels);

      var headerTimeline = S.el('div', 'gantt-row gantt-row--header gantt-timeline-header');
      if (M.state.viewMode === 'day') {
        headerTimeline.classList.add('gantt-timeline-header--day');
      }
      headerTimeline.style.width = M.state.timelineWidth + 'px';
      r.columns.forEach(function (col) {
        var headClass = 'gantt-col-head';
        if (col.relative === 'today') headClass += ' is-today';
        else if (col.relative === 'tomorrow') headClass += ' is-tomorrow';
        else if (col.relative === 'yesterday') headClass += ' is-yesterday';
        // Month columns are ~30px wide: "Aujourd'hui" would be cut to "Au…", so they keep the day
        // number (the tooltip and the highlight still say which one is today).
        var cell = S.el('div', headClass, {
          text:
            M.state.viewMode === 'month' && col.start instanceof Date
              ? String(col.start.getDate())
              : col.label,
        });
        if (M.state.viewMode === 'year' && col.start instanceof Date && col.start.getMonth() === 0) {
          cell.classList.add('gantt-col-head--year-start');
          cell.appendChild(S.el('span', 'gantt-col-date', { text: String(col.start.getFullYear()) }));
        }
        if (M.state.viewMode === 'week' && col.start instanceof Date) {
          // "Lundi 28": the weekday alone does not say which date it is ("1 oct." on a month's first day).
          var dom = col.start.getDate();
          cell.appendChild(
            S.el('span', 'gantt-col-date', {
              text:
                dom === 1 || col === r.columns[0]
                  ? dom + ' ' + col.start.toLocaleDateString('fr-FR', { month: 'short' })
                  : String(dom),
            })
          );
        }
        if (
          M.state.viewMode === 'day' &&
          timeWarp &&
          typeof col.hour === 'number' &&
          typeof M.model.realFracToVisual === 'function'
        ) {
          var v0 = M.model.realFracToVisual(col.hour / 24, timeWarp);
          var v1 = M.model.realFracToVisual((col.hour + 1) / 24, timeWarp);
          var hourDays = Math.max(1, Math.round(r.columns.length / 24));
          cell.style.width = Math.max(0, ((v1 - v0) / hourDays) * 100) + '%';
          cell.style.flex = '0 0 auto';
        } else {
          cell.style.width = 100 / r.columns.length + '%';
        }
        if (typeof col.hour === 'number') {
          cell.title = col.hour + ' h';
        } else if (col.relative === 'today') {
          cell.title = "Aujourd'hui";
        } else if (col.relative === 'tomorrow') {
          cell.title = 'Demain';
        } else if (col.relative === 'yesterday') {
          cell.title = 'Hier';
        } else if (col.key) {
          cell.title = col.key;
        }
        headerTimeline.appendChild(cell);
      });
      timelineCol.appendChild(headerTimeline);

      // Today marker — placed at the current time within today's column.
      // The line does not take the pointer (bars stay draggable). Hover text
      // is a tip opened from the timeline when the cursor is on the line.
      var now = new Date();
      var todayDate = M.model.startOfDay(now);
      var todayLineX = null;
      var nowMarker = null;
      if (
        todayDate.getTime() >= r.start.getTime() &&
        todayDate.getTime() <= r.end.getTime()
      ) {
        var todayX =
          typeof M.model.dateTimeToX === 'function'
            ? M.model.dateTimeToX(now, r, M.state.timelineWidth, mapOpts)
            : M.model.dateToX(todayDate, r, M.state.timelineWidth);
        todayLineX = todayX;
        nowMarker = S.el('div', 'gantt-today-line');
        nowMarker.style.left = todayX + 'px';
        nowMarker.setAttribute('data-now', String(now.getTime()));
        var markerLabel = S.el('span', 'gantt-today-label');
        var formatNowTime = function (date) {
          return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        };
        markerLabel.textContent = formatNowTime(now);
        nowMarker.appendChild(markerLabel);
        // Refresh the label on hover so it shows the current time, not the time of the last render.
        nowMarker.addEventListener('mouseenter', function () {
          markerLabel.textContent = formatNowTime(new Date());
        });
        timelineCol.appendChild(nowMarker);
      }

      // The three state sections always stay, so "no rows" means "no task row and no collapsed
      // section still holding tasks" (otherwise collapsed sections would hide their own headers
      // and leave no way to expand them).
      var hasTaskRows = rows.some(function (r) {
        if (!r) return false;
        if (r.kind !== 'section') return true;
        return M.sectionShownCount(r) > 0;
      });
      if (!hasTaskRows) {
        M.body.appendChild(M.buildEmptyState());
        return;
      }

      rows.forEach(function (row, rowIndex) {
        var oddClass = rowIndex % 2 === 1 ? ' is-odd' : '';

        if (row.kind === 'section') {
          var sectionOpen =
            typeof M.model.isNodeExpanded === 'function'
              ? M.model.isNodeExpanded(row, M.state.expanded)
              : M.state.expanded[row.id] !== false;
          var sectionLabelRow = S.el(
            'div',
            'gantt-row gantt-row--section is-' +
              M.sectionTone(row) +
              (sectionOpen ? '' : ' is-collapsed')
          );
          sectionLabelRow.style.height = S.ROW_H + 'px';
          sectionLabelRow.setAttribute('data-section-key', M.sectionDropKey(row));
          if (row.sectionKey === 'project' && row.projectId) {
            sectionLabelRow.setAttribute('data-iso-project', row.projectId);
            sectionLabelRow.setAttribute('data-iso-label', row.name || '');
          }
          var sectionCell = S.el('div', 'gantt-label-cell gantt-label-cell--section');
          var sectionTwist = S.el('button', 'gantt-twist gantt-section-twist', {
            type: 'button',
            text: sectionOpen ? '\u25be' : '\u25b8',
            title: sectionOpen
              ? 'Replier la section'
              : 'D\u00e9plier la section',
          });
          sectionTwist.setAttribute(
            'aria-expanded',
            sectionOpen ? 'true' : 'false'
          );
          sectionTwist.setAttribute('aria-label', row.name || 'Section');
          function toggleSection(e) {
            if (e) {
              e.preventDefault();
              e.stopPropagation();
            }
            M.toggleExpand(row.id);
          }
          sectionTwist.addEventListener('click', toggleSection);
          var sectionTitle = S.el('button', 'gantt-section-title', {
            type: 'button',
            text: row.name || '',
          });
          sectionTitle.title =
            (row.name || '') +
            (sectionOpen ? ' \u2014 Replier' : ' \u2014 D\u00e9plier');
          sectionTitle.addEventListener('click', toggleSection);
          sectionCell.appendChild(sectionTwist);
          if (row.sectionKey === 'project' && row.projectId && global.IconPick) {
            sectionCell.appendChild(global.IconPick.button({
              icon: row.icon,
              fallback: 'stack-2',
              className: 'ip-glyph',
              onChoose: function (next) { M.saveProjectIcon(row.projectId, next); },
            }));
          }
          sectionCell.appendChild(sectionTitle);
          M.projectSectionMeta(row).forEach(function (node) { sectionCell.appendChild(node); });
          if (row.children && row.children.length) {
            var shownInSection = M.sectionShownCount(row);
            var sectionCount = S.el('span', 'gantt-section-count', {
              text: String(shownInSection),
            });
            if (shownInSection !== row.children.length) {
              sectionCount.title =
                shownInSection + ' affichée(s) sur ' + row.children.length + ' (filtres actifs)';
            }
            sectionCell.appendChild(sectionCount);
          }
          sectionLabelRow.appendChild(sectionCell);
          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function' &&
            typeof global.ContextMenu.buildGanttSectionItems === 'function'
          ) {
            ContextMenu.bind(sectionLabelRow, function () {
              var selectedCardIds = M.selectedRows()
                .filter(function (r) {
                  return r && r.kind === 'card' && r.cardId;
                })
                .map(function (r) {
                  return r.cardId;
                });
              return ContextMenu.buildGanttSectionItems({
                sectionKey: row.sectionKey || 'pending',
                expanded: sectionOpen,
                selectedCount: selectedCardIds.length,
                hideBlocked: !!M.state.hideBlocked,
                onToggleExpand: function () {
                  M.toggleExpand(row.id);
                },
                onCollapseAll: function () {
                  M.setSectionsExpanded(false);
                },
                onExpandAll: function () {
                  M.setSectionsExpanded(true);
                },
                onMoveSelection: function () {
                  M.applySectionDrop(selectedCardIds, M.sectionDropKey(row));
                },
                onSelectCards: function () {
                  var kids = row.children || [];
                  M.state.selected = Object.create(null);
                  for (var ki = 0; ki < kids.length; ki++) {
                    if (kids[ki] && kids[ki].id) {
                      M.state.selected[kids[ki].id] = true;
                      if (typeof M.expandSubtreeForSelect === 'function') {
                        M.expandSubtreeForSelect(kids[ki]);
                      }
                    }
                  }
                  M.renderBulkBar();
                  M.renderChart();
                },
                onToggleHideBlocked: function (next) {
                  M.state.hideBlocked = !!next;
                  M.persistFilters();
                  var checks = M.root.querySelectorAll('.gantt-check');
                  for (var ci = 0; ci < checks.length; ci++) {
                    if (
                      checks[ci].textContent &&
                      /bloqu/i.test(checks[ci].textContent)
                    ) {
                      var inp = checks[ci].querySelector('input');
                      if (inp) inp.checked = !!next;
                      break;
                    }
                  }
                  M.renderChart();
                },
              });
            });
          }
          labelsCol.appendChild(sectionLabelRow);

          var sectionTimeRow = S.el(
            'div',
            'gantt-row gantt-row--section gantt-timeline-row is-' +
              M.sectionTone(row) +
              (sectionOpen ? '' : ' is-collapsed')
          );
          sectionTimeRow.style.height = S.ROW_H + 'px';
          sectionTimeRow.style.width = M.state.timelineWidth + 'px';
          sectionTimeRow.setAttribute('data-section-key', M.sectionDropKey(row));
          M.appendProjectSpan(sectionTimeRow, row);
          timelineCol.appendChild(sectionTimeRow);
          return;
        }

        var labelRow = S.el(
          'div',
          'gantt-row' +
            oddClass +
            (M.state.selected[row.id] ? ' is-selected' : '')
        );
        labelRow.style.height = S.ROW_H + 'px';
        if (row.kind === 'card' && row.cardId) {
          labelRow.setAttribute('data-card-id', row.cardId);
          labelRow.setAttribute('data-iso-card', row.cardId);
        } else if ((row.kind === 'local' || row.kind === 'checklist') && row.parentCardId && row.itemId) {
          labelRow.setAttribute('data-iso-sub', 'sub:' + row.parentCardId + ':' + row.itemId);
          labelRow.setAttribute('data-iso-label', row.name || '');
        }
        var labelCell = S.el('div', 'gantt-label-cell');
        labelCell.style.setProperty('--gantt-depth', String(row.depth || 0));

        var sel = S.el('input', 'gantt-select-box', { type: 'checkbox' });
        var selState =
          typeof M.model.rowSelectionState === 'function'
            ? M.model.rowSelectionState(row, M.state.selected)
            : {
                checked: !!M.state.selected[row.id],
                indeterminate: false,
              };
        sel.checked = !!selState.checked;
        sel.indeterminate = !!selState.indeterminate;
        sel.title = row.expandable
          ? 'S\u00e9lectionner (avec sous-t\u00e2ches)'
          : 'S\u00e9lectionner';
        sel.addEventListener('click', function (e) {
          e.stopPropagation();
        });
        sel.addEventListener('change', function () {
          // Indeterminate is cleared by the browser before `change`; read prior
          // cascade state so a partial parent click selects the whole subtree.
          var prior =
            typeof M.model.rowSelectionState === 'function'
              ? M.model.rowSelectionState(row, M.state.selected)
              : null;
          var wantOn = prior && prior.indeterminate ? true : !!sel.checked;
          M.toggleSelected(row.id, wantOn);
        });
        labelCell.appendChild(sel);

        var nest = S.el('div', 'gantt-nest');
        if (row.expandable) {
          var isOpen =
            M.state.expanded[row.id] === true ||
            (M.state.expanded[row.id] == null && row.depth === 0);
          var twist = S.el('button', 'gantt-twist', {
            type: 'button',
            text: isOpen ? '\u25be' : '\u25b8',
          });
          twist.addEventListener('click', function (e) {
            e.stopPropagation();
            M.toggleExpand(row.id);
          });
          nest.appendChild(twist);
        } else {
          nest.appendChild(S.el('span', 'gantt-twist-spacer'));
        }

        var nameWrap = S.el('div', 'gantt-task-title-wrap');
        var nameBtn = S.el(
          'button',
          'gantt-task-name' +
            (row.kind === 'card' ? ' is-card' : '') +
            (row.depth > 0 || row.kind === 'local' || row.kind === 'checklist'
              ? ' is-subtask'
              : '') +
            (M.canEditSubtask(row) ? ' is-renamable' : '') +
            (row.done ? ' is-done' : ''),
          { type: 'button', text: row.name }
        );
        nameBtn.title = row.name || '';
        if (M.canEditSubtask(row)) {
          nameBtn.title =
            (row.name || '') + ' \u2014 Double-clic pour renommer';
          nameBtn.addEventListener('dblclick', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (openClickTimer) {
              clearTimeout(openClickTimer);
              openClickTimer = null;
            }
            M.startInlineRename(row, nameBtn);
          });
        }
        var openClickTimer = null;
        if (row.kind === 'card' && row.cardId) {
          nameBtn.addEventListener('click', function () {
            if (M.state.suppressCardOpen) {
              M.state.suppressCardOpen = false;
              if (openClickTimer) {
                clearTimeout(openClickTimer);
                openClickTimer = null;
              }
              return;
            }
            if (openClickTimer) clearTimeout(openClickTimer);
            openClickTimer = setTimeout(function () {
              openClickTimer = null;
              if (M.state.suppressCardOpen) {
                M.state.suppressCardOpen = false;
                return;
              }
              M.openCard(row.cardId, row.name);
            }, 280);
          });
        }
        if (row.kind === 'card' && !(row.depth > 0) && !M.state.groupByProject) {
          var proj = M.projectOfNode(row);
          if (proj && global.IconPick) {
            nameWrap.appendChild(global.IconPick.button({
              icon: proj.icon,
              fallback: 'stack-2',
              className: 'ip-glyph',
              onChoose: function (next) { M.saveProjectIcon(proj.id, next); },
            }));
          }
        }
        nameWrap.appendChild(nameBtn);
        var subBadge = M.buildSubtaskTitleBadge(row);
        if (subBadge) nameWrap.appendChild(subBadge);
        nest.appendChild(nameWrap);
        labelCell.appendChild(nest);

        labelCell.appendChild(M.buildDetailIcons(row));
        labelCell.appendChild(M.buildSubtaskActions(row));

        labelRow.appendChild(labelCell);
        M.bindLabelSectionDrag(labelRow, row);
        if (
          global.ContextMenu &&
          typeof global.ContextMenu.bind === 'function' &&
          typeof global.ContextMenu.buildGanttCardItems === 'function'
        ) {
          ContextMenu.bind(labelRow, function () {
            var isOpen =
              M.state.expanded[row.id] === true ||
              (M.state.expanded[row.id] == null && row.depth === 0);
            var deleteLabel = M.isBoardRootCard(row)
              ? 'Archiver la carte'
              : M.isLinkedCardRow(row)
                ? 'Retirer le lien'
                : 'Supprimer';
            var detailRoot = labelCell.querySelector('.gantt-detail-icons');
            function clickDetail(sel) {
              var btn = detailRoot && detailRoot.querySelector(sel);
              if (btn) btn.click();
            }
            var built = ContextMenu.buildGanttCardItems({
              kind: row.kind,
              cardId: row.cardId,
              selected: !!M.state.selected[row.id],
              expandable: !!row.expandable,
              expanded: isOpen,
              editable: M.canEditSubtask(row),
              done: !!row.done,
              deleteLabel: deleteLabel,
              onOpen: function () {
                if (row.cardId) M.openCard(row.cardId, row.name);
              },
              onToggleSelect: function () {
                M.toggleSelected(row.id, !M.state.selected[row.id]);
              },
              onToggleExpand: function () {
                M.toggleExpand(row.id);
              },
              onMiniBlocked: function () {
                clickDetail('.gantt-detail-slot.is-blocked button');
              },
              onMiniPriority: function () {
                clickDetail('.gantt-detail-slot.is-priority button');
              },
              onMiniProgress: function () {
                clickDetail('.gantt-detail-slot.is-progress button');
              },
              onMiniTimer: function () {
                if (global.CardFields && row.cardId) {
                  global.CardFields.open('timer', { t: M.t, cardId: row.cardId, cardName: row.name, anchor: labelCell });
                }
              },
              onMiniDue: function () {
                clickDetail(
                  '.gantt-detail-slot.is-due button, .gantt-detail-slot.is-overdue button'
                );
              },
              onToggleDone: function () {
                M.toggleSubtaskDone(row);
              },
              onDelete: function () {
                M.deleteSubtaskRow(row);
              },
            });
            if (global.Isolation) {
              var subId = (row.kind === 'local' || row.kind === 'checklist') && row.parentCardId && row.itemId
                ? 'sub:' + row.parentCardId + ':' + row.itemId
                : '';
              built = built.concat(global.Isolation.menuItems({
                cardId: row.cardId || row.parentCardId || '',
                cardName: row.name || '',
                subId: subId,
                subName: subId ? (row.name || '') : '',
                people: global.Isolation.peopleOf(row),
              }));
            }
            return built;
          });
        }
        labelsCol.appendChild(labelRow);

        var timeRow = S.el(
          'div',
          'gantt-row gantt-timeline-row' + oddClass
        );
        timeRow.style.height = S.ROW_H + 'px';
        timeRow.style.width = M.state.timelineWidth + 'px';
        if (labelRow.getAttribute('data-iso-card')) timeRow.setAttribute('data-iso-card', labelRow.getAttribute('data-iso-card'));
        if (labelRow.getAttribute('data-iso-sub')) timeRow.setAttribute('data-iso-sub', labelRow.getAttribute('data-iso-sub'));

        var interval = M.model.resolveBarInterval(row, M.intervalOptions());
        var hasVisibleBar = false;
        if (interval) {
          var geo = M.model.barGeometry(
            interval,
            r,
            M.state.timelineWidth,
            mapOpts
          );
          if (geo && geo.visible) {
            hasVisibleBar = true;
            var bar = S.el('div', 'gantt-bar');
            if (M.isDatable(row)) bar.classList.add('is-editable');
            bar.style.left = geo.left + 'px';
            bar.style.width = geo.width + 'px';
            bar.style.backgroundColor = row.color || 'var(--tp-primary, #0c66e4)';
            var barText = S.barTextColor(row.color);
            if (barText) bar.style.color = barText;
            if (row.category) bar.setAttribute('data-category', row.category);
            bar.title =
              (row.name || '') +
              ' \u00b7 ' +
              M.formatIntervalTitle(interval) +
              (M.isDatable(row)
                ? '\nCliquer pour modifier \u00b7 glisser pour d\u00e9placer'
                : '');

            var label = S.el('span', 'gantt-bar-label', {
              text: M.formatBarLabel(row, interval),
            });
            bar.appendChild(label);

            if (M.isDatable(row)) {
              bar.appendChild(M.makeBarEdge('start', interval));
              bar.appendChild(M.makeBarEdge('end', interval));
              var clearBtn = S.el('button', 'gantt-bar-clear', {
                type: 'button',
                title: 'Effacer les dates',
                text: '\u00d7',
              });
              clearBtn.setAttribute('aria-label', 'Effacer d\u00e9but et \u00e9ch\u00e9ance');
              clearBtn.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                e.stopPropagation();
              });
              clearBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                M.clearRowDates(row);
              });
              bar.appendChild(clearBtn);
              M.bindBarDrag(bar, row, interval);
              if (
                global.ContextMenu &&
                typeof global.ContextMenu.bind === 'function' &&
                typeof global.ContextMenu.buildGanttBarItems === 'function'
              ) {
                ContextMenu.bind(bar, function () {
                  return ContextMenu.buildGanttBarItems({
                    kind: row.kind,
                    cardId: row.cardId,
                    clearDisabled: !row.startDate && !row.dueDate,
                    onOpen: function () {
                      if (row.cardId) M.openCard(row.cardId, row.name);
                    },
                    onClearDates: function () {
                      M.clearRowDates(row);
                    },
                  });
                });
              }
            }

            timeRow.appendChild(bar);
            if (M.state.editAfterRender === row.id && M.isDatable(row)) {
              M.state.editAfterRender = null;
              setTimeout(function () {
                M.openScheduleEditor(row, bar);
              }, 0);
            }
          }
        }

        if (M.isDatable(row) && !hasVisibleBar) {
          M.bindTimelinePaint(timeRow, row);
        }

        timelineCol.appendChild(timeRow);
      });

      var addRow = M.buildAddRow();
      if (addRow) {
        labelsCol.appendChild(addRow.label);
        timelineCol.appendChild(addRow.time);
      }

      chart.appendChild(labelsCol);
      M.bindLabelInsert(labelsCol);

      var splitter = S.el('div', 'gantt-splitter');
      splitter.title = 'Glisser pour redimensionner';
      splitter.setAttribute('role', 'separator');
      splitter.setAttribute('aria-orientation', 'vertical');
      splitter.setAttribute('aria-label', 'Redimensionner les colonnes');
      chart.appendChild(splitter);

      var scroll = S.el('div', 'gantt-timeline-scroll');
      scroll.appendChild(timelineCol);
      chart.appendChild(scroll);
      M.body.appendChild(chart);
      // Apply the restored scroll now (not only next frame) so a zoom does not flash.
      if (restoreLeft != null && isFinite(restoreLeft)) scroll.scrollLeft = restoreLeft;
      M.bindHourScale(scroll, timelineCol, headerTimeline, r, mapOpts);
      M.bindWeekScale(scroll, timelineCol, headerTimeline, r);
      if (nowMarker) M.bindNowLineTip(scroll, timelineCol, nowMarker, r, mapOpts);

      labelsCol.style.width = S.clampLabelsWidth(M.state.labelsWidth, chart) + 'px';
      M.state.labelsWidth = S.clampLabelsWidth(M.state.labelsWidth, chart);
      M.bindLabelsSplitter(splitter, labelsCol, chart, scroll);

      // Keep task list and calendar rows aligned while scrolling.
      var syncingScroll = false;
      function syncScroll(from, to) {
        if (syncingScroll) return;
        syncingScroll = true;
        to.scrollTop = from.scrollTop;
        syncingScroll = false;
      }
      labelsCol.addEventListener('scroll', function () {
        syncScroll(labelsCol, scroll);
      });
      scroll.addEventListener('scroll', function () {
        syncScroll(scroll, labelsCol);
      });

      // Middle-mouse-button drag to pan the timeline (past/future + rows),
      // like a map. Left button is reserved for bar dragging / date paint.
      var MIDDLE_BUTTON = 1;
      scroll.addEventListener('pointerdown', function (ev) {
        if (ev.button !== MIDDLE_BUTTON) return;
        if (M.state.splitDrag || M.state.drag || M.state.paint) return;
        ev.preventDefault();
        ev.stopPropagation();
        var pan = {
          pointerId: ev.pointerId,
          startX: ev.clientX,
          startY: ev.clientY,
          startScrollLeft: scroll.scrollLeft,
          startScrollTop: scroll.scrollTop,
        };
        scroll.setPointerCapture(ev.pointerId);
        scroll.classList.add('is-panning');

        function onMove(e) {
          scroll.scrollLeft = pan.startScrollLeft - (e.clientX - pan.startX);
          scroll.scrollTop = pan.startScrollTop - (e.clientY - pan.startY);
        }

        function onUp() {
          scroll.releasePointerCapture(pan.pointerId);
          scroll.removeEventListener('pointermove', onMove);
          scroll.removeEventListener('pointerup', onUp);
          scroll.removeEventListener('pointercancel', onUp);
          scroll.classList.remove('is-panning');
        }

        scroll.addEventListener('pointermove', onMove);
        scroll.addEventListener('pointerup', onUp);
        scroll.addEventListener('pointercancel', onUp);
      });
      // Mouse wheel over the timeline zooms continuously (year > month > week >
      // hours, see applyZoomPx); the task list on the left keeps scrolling rows,
      // and shift + wheel still pans sideways. Reaching either edge loads the
      // next or previous period instead of stopping at this day / week / month / year.
      function nearSpanEdge(dir) {
        var max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
        if (dir > 0) return max <= 8 || scroll.scrollLeft >= max - 64;
        return scroll.scrollLeft <= 64;
      }
      var spanReady = false;
      var spanLeft = scroll.scrollLeft;
      scroll.addEventListener('scroll', function () {
        var left = scroll.scrollLeft;
        var delta = left - spanLeft;
        spanLeft = left;
        if (!spanReady || M.state.spanLock || M.state.drag || M.state.paint) return;
        if (delta > 1 && nearSpanEdge(1)) M.extendSpan(1, 'keep');
        else if (delta < -1 && nearSpanEdge(-1)) M.extendSpan(-1, 'keep');
      });
      scroll.addEventListener(
        'wheel',
        function (ev) {
          var horizontal =
            ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
          if (horizontal) {
            if (M.state.splitDrag || M.state.drag || M.state.paint || M.state.spanLock) return;
            var pan = ev.shiftKey ? ev.deltaY : ev.deltaX;
            if (!pan) return;
            var room = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
            if (pan > 0 && nearSpanEdge(1)) {
              ev.preventDefault();
              M.extendSpan(1, room <= 8 ? 'page' : 'keep');
            } else if (pan < 0 && nearSpanEdge(-1)) {
              ev.preventDefault();
              M.extendSpan(-1, room <= 8 ? 'page' : 'keep');
            }
            return;
          }
          if (!ev.deltaY) return;
          if (M.state.splitDrag || M.state.drag || M.state.paint) return;
          ev.preventDefault();
          M.onWheelZoom(ev);
        },
        { passive: false }
      );
      // Prevent the browser's native middle-click autoscroll affordance
      // from also kicking in over the timeline.
      scroll.addEventListener('auxclick', function (ev) {
        if (ev.button === MIDDLE_BUTTON) ev.preventDefault();
      });

      requestAnimationFrame(function () {
        if (!scroll.isConnected) return; // superseded by a newer render, which has its own frame
        if (restoreLeft != null && isFinite(restoreLeft)) {
          scroll.scrollLeft = restoreLeft;
        }
        var avail = M.availableTimelineWidth(scroll);
        var nextW = M.chartTimelineWidth(avail);
        if (!M.state.widthMeasured || Math.abs(nextW - M.state.timelineWidth) > 2) {
          if (M.applyTimelineWidth(nextW, scroll.scrollLeft)) {
            M.renderChart(); // width changed: the next pass (stable width) does the centering
            return;
          }
        }
        if (M.state.scrollToToday) {
          M.state.scrollToToday = false;
          // Month / year views are wider than the pane: open on "now" (a bit left of centre so what
          // comes next stays visible), or at the start of a period that does not contain today.
          var overflows = M.state.timelineWidth > scroll.clientWidth + 8;
          var inViewAtStart = todayLineX != null && todayLineX < scroll.clientWidth - 24;
          scroll.scrollLeft =
            todayLineX == null || !overflows || inViewAtStart
              ? 0
              : Math.max(0, todayLineX - scroll.clientWidth * 0.3);
        }
        spanReady = true;
        spanLeft = scroll.scrollLeft;
      });
    };
    M.render = function render() {
      M.renderToolbar();
      M.renderChart();
      // Gantt is always opened as a fullscreen board modal — never call t.sizeTo.
    };
    M.appendProjectSpan = function appendProjectSpan(timeRow, row) {
      if (!row || row.sectionKey !== 'project' || !timeRow) return;
      var start = '';
      var due = '';
      (row.children || []).forEach(function (c) {
        if (!c) return;
        var s = c.startDate || c.dueDate || '';
        var d = c.dueDate || c.startDate || '';
        if (s && (!start || s < start)) start = s;
        if (d && (!due || d > due)) due = d;
      });
      if (!start || !due) return;
      var interval = M.model.resolveBarInterval(
        { startDate: start, dueDate: due },
        M.intervalOptions()
      );
      if (!interval) return;
      var geo = M.model.barGeometry(
        interval,
        M.range(),
        M.state.timelineWidth,
        M.timelineMapOptions()
      );
      if (!geo || !geo.visible) return;
      var span = S.el('div', 'gantt-project-span');
      span.style.left = geo.left + 'px';
      span.style.width = geo.width + 'px';
      timeRow.appendChild(span);
    };
    M.loadGoals = function loadGoals() {
      var GG = global.MindmapGoalsTrello;
      if (!GG || typeof GG.load !== 'function') return Promise.resolve(M.state.goals);
      return GG.load(M.t).then(
        function (g) {
          if (g && Array.isArray(g.nodes)) M.state.goals = g;
          return M.state.goals;
        },
        function () {
          return M.state.goals;
        }
      );
    };
    M.reload = function reload(options) {
      options = options || {};
      // Soft reloads (e.g. after mini editors) skip the empty "Chargement…" flash.
      var quiet = options.quiet === true;
      if (!quiet) {
        M.state.loading = true;
        M.state.error = '';
        M.setStatus('Chargement du tableau\u2026');
        M.render();
      }
      return Promise.all([M.ganttTrello.loadBoard(M.t), M.loadGoals()])
        .then(function (pair) {
          var data = pair[0];
          M.state.loading = false;
          M.state.error = '';
          M.state.tree = (data && data.tree) || [];
          if (data && data.ganttSettings) {
            M.state.ganttSettings = data.ganttSettings;
          }
          M.state.facets = null;
          M.state.boardLists = (data && data.lists) || [];
          M.state.me = (data && data.me) || null;
          M.applySort();
          M.state.cardsById = Object.create(null);
          var cards = (data && data.cards) || [];
          if (global.Isolation) global.Isolation.adopt(M.t, cards);
          for (var i = 0; i < cards.length; i++) {
            if (cards[i] && cards[i].id) {
              M.state.cardsById[cards[i].id] = cards[i];
              M.baseDates[cards[i].id] = M.datesOf(cards[i]);
            }
          }
          // Drop selections for rows that no longer exist.
          var still = Object.create(null);
          var flat = M.model.flattenVisible(M.state.tree, M.state.expanded);
          for (var fi = 0; fi < flat.length; fi++) {
            if (flat[fi] && M.state.selected[flat[fi].id]) {
              still[flat[fi].id] = true;
            }
          }
          M.state.selected = still;
          // The summary bar already counts tasks ("7 / 8 tâches"); only clear "Chargement…".
          if (!quiet) {
            M.setStatus(global.GanttFilters ? '' : cards.length + (cards.length > 1 ? ' tâches' : ' tâche'));
          }
          M.renderBulkBar();
          if (quiet) M.renderChart();
          else M.render();
          global.Skeleton.remember('gantt', { groups: (M.state.tree || []).map(function (s) { return (s.children || []).length; }) });
          M.refreshFilterUi();
          return Promise.all([M.refreshOutlookConnected(), M.refreshRestAuthorized()]).then(function (res) {
            var connected = res[0];
            M.renderToolbar();
            if (
              options.syncOutlook &&
              connected &&
              !M.state.outlookSyncing
            ) {
              return M.runOutlookSync();
            }
          });
        })
        .catch(function (err) {
          M.state.loading = false;
          M.state.error =
            'Impossible de charger le Gantt\u00a0: ' +
            (err && err.message ? err.message : String(err));
          M.setStatus(M.state.error, true);
          M.render();
        });
    };
    M.openNewCard = function openNewCard() {
      var lists = M.state.boardLists || [];
      var target = M.defaultNewCardList();
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: M.t,
        lists: lists,
        listId: target.id,
        onError: function (err) { M.setStatus('Erreur : ' + (err && err.message ? err.message : err), true); },
        onCreated: function (c) {
          if (c.cardId) M.record({ type: 'create', targetId: c.cardId, title: c.name, after: c.list.name });
          M.setStatus('Carte créée dans « ' + c.list.name + ' »');
          M.refreshBoardQuiet();
        },
      });
    };
    },
    run: function (M) {
    M.statusBar.addEventListener('click', function () {
      if (!M.state.authHint) return;
      M.ganttTrello.ensureRestAuthorized(M.t).then(function (res) {
        if (res && res.ok) {
          M.state.authHint = '';
          M.state.restAuthorized = true;
          M.setStatus('');
          M.renderToolbar();
        }
      });
    });
    M.refreshOutlookConnected().then(function () {
      M.renderToolbar();
      M.reload({ syncOutlook: true });
    });
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: M.t,
        hoverSelector: '.gantt-row[data-card-id]',
        idOf: function (el) { return el.getAttribute('data-card-id'); },
        row: function (id) {
          var n = M.model.flattenVisible(M.state.tree, M.state.expanded).filter(function (x) { return x.cardId === id; })[0];
          if (!n) return null;
          var rec = M.state.cardsById[id] || {};
          var TM = global.TableModel;
          var empressement = rec.inputs && rec.inputs.empressement;
          return {
            id: id,
            cardId: id,
            name: n.name,
            listId: n.listId,
            blocked: !!rec.blocked,
            urgency: TM && TM.urgencyLabel && empressement ? TM.urgencyLabel(empressement) : '',
          };
        },
        lists: function () { return M.state.boardLists || []; },
        isBusy: function () { return !!M.state.miniPopover || !!document.querySelector('.gantt-card-overlay'); },
        setStatus: function (row, list) {
          M.setStatus('Enregistrement…');
          var before = { listId: row.listId, blocked: !!row.blocked };
          var after = { listId: list.id, blocked: !!row.blocked };
          global.PriorityTrello.restPutCard(M.t, row.id, { idList: String(list.id), pos: 'bottom' }).then(function (r) {
            if (r && r.ok === false) throw new Error('Déplacement impossible');
            M.record({
              type: 'move',
              targetId: row.id,
              title: row.name,
              key: 'statut',
              before: row.listName || '',
              after: list.name || '',
              beforeVal: before,
              afterVal: after,
            });
            M.setStatus('Statut modifié');
            M.refreshBoardQuiet();
          }).catch(function (err) {
            M.setStatus('Erreur : ' + (err && err.message ? err.message : err), true);
          });
        },
        setUrgency: function (row, urgencyId) {
          M.setStatus('Enregistrement…');
          global.LinearKeys.saveUrgency(M.t, row.id, urgencyId).then(function () {
            M.record({ type: 'field', label: 'Urgence', targetId: row.id, title: row.name });
            M.setStatus('Urgence modifiée');
            M.refreshBoardQuiet();
          }).catch(function (err) {
            M.setStatus('Erreur urgence : ' + (err && err.message ? err.message : err), true);
          });
        },
        openDue: function (row, anchor) { M.openCardField('due', { cardId: row.id, name: row.name }, anchor); },
        newCard: M.openNewCard,
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () {
          return Object.keys(M.state.cardsById).map(function (id) {
            var c = M.state.cardsById[id];
            var l = (M.state.boardLists || []).filter(function (x) { return x.id === c.listId; })[0];
            return { id: id, name: c.name, hint: l ? l.name : '' };
          });
        },
        onCard: function (id) {
          if (!global.CommandPalette.reveal('.gantt-row[data-card-id="' + id + '"]')) M.openCard(id, (M.state.cardsById[id] || {}).name);
        },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: M.openNewCard }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }
    if (global.AssistantDock) {
      global.AssistantDock.mount({ t: M.t, after: M.mount, onRefresh: function () { M.reload({ quiet: true }); }, isBusy: function () { return M.state.miniPopover || !!document.querySelector('.gantt-card-overlay'); } });
    }
    return { v: {
      destroy: function () {
        M.clearNowTip();
        if (M.measureRaf) {
          cancelAnimationFrame(M.measureRaf);
          M.measureRaf = 0;
        }
        if (M.resizeObserver) {
          M.resizeObserver.disconnect();
          M.resizeObserver = null;
        } else if (typeof global.removeEventListener === 'function') {
          global.removeEventListener('resize', M.scheduleRemeasure);
        }
        M.closeMiniPopover({ reload: false });
        M.closeCardOverlay({ reload: false });
        M.mount.innerHTML = '';
      },
      reload: M.reload,
      getState: function () {
        return M.state;
      },
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
