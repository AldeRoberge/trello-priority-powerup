/**
 * gantt-ui: mountGantt() part 3 of 5.
 * The body of mountGantt runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see gantt-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.GanttUiParts = global.GanttUiParts || {});
  var P = (global.GanttUiPartsMountMountGantt = global.GanttUiPartsMountMountGantt || { list: [] });

  P.list.push({
    define: function (M) {
    M.closeMiniPopover = function closeMiniPopover(opts) {
      opts = opts || {};
      var shouldRefresh = !!opts.reload;
      if (M.state.miniPopoverKeyHandler) {
        document.removeEventListener('keydown', M.state.miniPopoverKeyHandler, true);
        M.state.miniPopoverKeyHandler = null;
      }
      if (M.state.miniPopoverOutsideHandler) {
        document.removeEventListener(
          'pointerdown',
          M.state.miniPopoverOutsideHandler,
          true
        );
        M.state.miniPopoverOutsideHandler = null;
      }
      if (M.state.miniPopover) {
        if (
          M.state.miniPopover.mountApi &&
          typeof M.state.miniPopover.mountApi.destroy === 'function'
        ) {
          try {
            M.state.miniPopover.mountApi.destroy();
          } catch (e) {
            /* ignore */
          }
        }
        if (M.state.miniPopover.el && M.state.miniPopover.el.parentNode) {
          M.state.miniPopover.el.parentNode.removeChild(M.state.miniPopover.el);
        }
      }
      M.state.miniPopover = null;
      // Quiet refresh: update icons/bars without the full-page "Chargement…" blink.
      if (shouldRefresh) M.refreshBoardQuiet();
    };
    M.positionMiniPopover = function positionMiniPopover(popoverEl, anchorEl) {
      if (!popoverEl || !anchorEl) return;
      var margin = 8;
      var rect = anchorEl.getBoundingClientRect();
      var rootRect = M.root.getBoundingClientRect();
      popoverEl.style.visibility = 'hidden';
      popoverEl.style.left = '0px';
      popoverEl.style.top = '0px';
      var pw = popoverEl.offsetWidth || 320;
      var ph = popoverEl.offsetHeight || 200;
      var left = rect.left - rootRect.left;
      var top = rect.bottom - rootRect.top + 6;
      if (left + pw > rootRect.width - margin) {
        left = Math.max(margin, rootRect.width - pw - margin);
      }
      if (left < margin) left = margin;
      if (top + ph > rootRect.height - margin) {
        top = rect.top - rootRect.top - ph - 6;
      }
      if (top < margin) top = margin;
      popoverEl.style.left = Math.round(left) + 'px';
      popoverEl.style.top = Math.round(top) + 'px';
      popoverEl.style.visibility = '';
    };
    M.openMiniEditor = function openMiniEditor(opts) {
      opts = opts || {};
      if (!opts.anchor || typeof opts.mount !== 'function') return;
      M.closeMiniPopover();

      var popover = S.el('div', 'gantt-mini-popover');
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', opts.title || 'Modifier');

      var head = S.el('div', 'gantt-mini-popover-head');
      head.appendChild(
        S.el('div', 'gantt-mini-popover-title', { text: opts.title || '' })
      );
      var closeBtn = S.el('button', 'gantt-mini-popover-close', {
        type: 'button',
        title: 'Fermer',
        text: '\u00d7',
      });
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        M.closeMiniPopover({ reload: true });
      });
      head.appendChild(closeBtn);

      var bodyEl = S.el('div', 'gantt-mini-popover-body');
      var foot = S.el('div', 'gantt-mini-popover-foot');
      var openFullBtn = S.el('button', 'gantt-mini-popover-full', {
        type: 'button',
        text: 'Ouvrir la section',
      });
      openFullBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sectionKey = opts.sectionKey || 'priority';
        var cardId = opts.cardId;
        var cardName = opts.cardName || '';
        M.closeMiniPopover({ reload: false });
        M.openCard(cardId, cardName, { openSection: sectionKey });
      });
      foot.appendChild(openFullBtn);

      popover.appendChild(head);
      popover.appendChild(bodyEl);
      if (!opts.hideFull) popover.appendChild(foot);
      M.root.appendChild(popover);

      var mountApi = null;
      try {
        mountApi = opts.mount(bodyEl) || null;
      } catch (mountErr) {
        console.error('Gantt mini editor mount failed', mountErr);
        bodyEl.textContent = 'Impossible d\u2019ouvrir l\u2019\u00e9diteur.';
      }

      M.state.miniPopover = {
        el: popover,
        mountApi: mountApi,
        cardId: opts.cardId,
        sectionKey: opts.sectionKey,
      };

      M.positionMiniPopover(popover, opts.anchor);

      M.state.miniPopoverKeyHandler = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          M.closeMiniPopover({ reload: true });
        }
      };
      document.addEventListener('keydown', M.state.miniPopoverKeyHandler, true);

      M.state.miniPopoverOutsideHandler = function (e) {
        if (!M.state.miniPopover || !M.state.miniPopover.el) return;
        var target = e.target;
        if (M.state.miniPopover.el.contains(target)) return;
        if (opts.anchor && opts.anchor.contains && opts.anchor.contains(target)) {
          return;
        }
        M.closeMiniPopover({ reload: true });
      };
      // Defer so the opening click does not immediately close.
      setTimeout(function () {
        if (!M.state.miniPopover) return;
        document.addEventListener(
          'pointerdown',
          M.state.miniPopoverOutsideHandler,
          true
        );
      }, 0);

      closeBtn.focus();
    };
    M.openCardField = function openCardField(kind, row, anchor) {
      if (!row || !row.cardId || !anchor) return;
      if (!global.CardFields) {
        M.setStatus('\u00c9diteur indisponible', true);
        return;
      }
      M.closeMiniPopover();
      global.CardFields.open(kind, {
        t: M.t,
        cardId: row.cardId,
        cardName: row.name,
        anchor: anchor,
        onSaved: function () {
          M.record({
            type: 'field',
            label: M.FIELD_LABELS[kind][1].charAt(0).toUpperCase() + M.FIELD_LABELS[kind][1].slice(1),
            targetId: row.cardId,
            title: row.name,
          });
          M.setStatus(M.FIELD_LABELS[kind][0]);
        },
        onError: function (m) {
          M.setStatus('Erreur ' + M.FIELD_LABELS[kind][1] + '\u00a0: ' + m, true);
        },
        onClose: function (changed) {
          if (changed) M.refreshBoardQuiet();
        },
      });
    };
    M.openMiniPriority = function openMiniPriority(row, anchor) {
      M.openCardField('priority', row, anchor);
    };
    M.openMiniDue = function openMiniDue(row, anchor) {
      M.openCardField('due', row, anchor);
    };
    M.openMiniBlocked = function openMiniBlocked(row, anchor) {
      M.openCardField('blocked', row, anchor);
    };
    M.findRootOf = function findRootOf(rowId) {
      var roots = M.state.tree || [];
      for (var i = 0; i < roots.length; i++) {
        if (M.model.findNodeById([roots[i]], rowId)) return roots[i];
      }
      return null;
    };
    M.openMiniProgress = function openMiniProgress(row, anchor) {
      if (!row || !anchor) return;
      var rootNode = M.findRootOf(row.id);
      if (!rootNode) return;
      var focusId = row.id;
      var rootId = rootNode.id;
      var body = null;
      var dragging = false;
      var queue = Promise.resolve();

      function paint() {
        if (!body || dragging) return;
        var current = M.findRootOf(focusId) || M.model.findNodeById(M.state.tree, rootId);
        if (!current) return;
        body.textContent = '';
        M.model.flattenAll([current]).forEach(function (node) {
          var line = S.el(
            'div',
            'gantt-prog-row' + (node.id === focusId ? ' is-focus' : '')
          );
          line.style.paddingLeft = Math.max(0, node.depth - current.depth) * 14 + 'px';
          line.appendChild(S.el('span', 'gantt-prog-name', { text: node.name, title: node.name }));
          var pctEl = S.el('span', 'gantt-prog-pct', {
            text: Math.round(node.progress || 0) + ' %',
          });
          var range = S.el('input', 'gantt-prog-range', {
            type: 'range',
            min: '0',
            max: '100',
            step: '1',
          });
          range.value = String(Math.round(node.progress || 0));
          range.setAttribute('aria-label', 'Progrès ' + node.name);
          range.addEventListener('pointerdown', function () {
            dragging = true;
          });
          range.addEventListener('input', function () {
            pctEl.textContent = range.value + ' %';
          });
          range.addEventListener('change', function () {
            dragging = false;
            var meta = M.subtaskMeta(node);
            var pct = +range.value;
            queue = queue
              .then(function () {
                return M.ganttTrello.setSubtaskProgress(M.t, meta, pct);
              })
              .then(function (r) {
                if (!r || !r.ok) {
                  M.setStatus('Erreur progrès : ' + ((r && r.reason) || ''), true);
                  return;
                }
                M.record({
                  type: 'field',
                  label: 'Progrès',
                  targetId: node.cardId || node.parentCardId,
                  title: node.name,
                });
                M.setStatus('Progrès enregistré');
                return M.reload({ quiet: true });
              })
              .then(paint, function (err) {
                M.setStatus('Erreur progrès : ' + (err && err.message ? err.message : err), true);
                paint();
              });
          });
          range.addEventListener('pointerup', function () {
            dragging = false;
          });
          line.appendChild(pctEl);
          line.appendChild(range);
          body.appendChild(line);
        });
      }

      M.openMiniEditor({
        anchor: anchor,
        title: 'Progrès · ' + rootNode.name,
        hideFull: true,
        mount: function (bodyEl) {
          body = bodyEl;
          bodyEl.classList.add('gantt-prog-tree');
          paint();
          return { destroy: function () { body = null; } };
        },
      });
    };
    M.buildDetailIcons = function buildDetailIcons(row) {
      var icons = S.el('div', 'gantt-detail-icons');

      function slot(className, node) {
        var cell = S.el('span', 'gantt-detail-slot' + (className ? ' ' + className : ''));
        if (node) cell.appendChild(node);
        icons.appendChild(cell);
      }

      if (row.kind === 'card') {
        var isBlocked = !!row.blocked;
        var blockedBtn = S.iconButton(
          'ti-player-pause',
          isBlocked ? 'Bloqu\u00e9 \u2014 cliquer pour d\u00e9bloquer' : 'Bloquer',
          isBlocked ? 'is-blocked' : 'is-blocked-ghost'
        );
        blockedBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (isBlocked) M.toggleCardBlocked(row);
          else M.openMiniBlocked(row, blockedBtn);
        });
        slot('is-blocked', blockedBtn);

        var pTitle =
          (row.priorityLabel || 'Priorit\u00e9') +
          (row.priorityScore != null
            ? ' \u00b7 ' + Number(row.priorityScore).toFixed(1)
            : '');
        var showFire = S.shouldShowPriorityFire(row);
        var priorityBtn = S.priorityDotEl(
          pTitle,
          showFire ? row.priorityFill || null : null,
          !showFire
        );
        priorityBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          M.openMiniPriority(row, priorityBtn);
        });
        slot('is-priority', priorityBtn);

        var pct = Math.round(row.progress || 0);
        var progBtn = S.el('button', 'gantt-progress-text gantt-progress-text--btn', {
          type: 'button',
          title: 'Progr\u00e8s ' + pct + '%',
        });
        progBtn.setAttribute('aria-label', 'Progr\u00e8s ' + pct + '%');
        progBtn.appendChild(M.progressRingEl(pct));
        progBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          M.openMiniProgress(row, progBtn);
        });
        slot('is-progress', progBtn);

        var dueTitle =
          row.dueCountdown ||
          (row.dueDate
            ? '\u00c9ch\u00e9ance ' + row.dueDate
            : 'D\u00e9finir l\u2019\u00e9ch\u00e9ance');
        var dueBtn;
        if (row.duePast) {
          dueBtn = S.iconButton('ti-clock', dueTitle, 'is-overdue');
        } else if (row.dueCountdown || row.dueDate) {
          dueBtn = S.iconButton('ti-calendar-event', dueTitle, 'is-due');
        } else {
          dueBtn = S.iconButton(
            'ti-calendar-event',
            'D\u00e9finir l\u2019\u00e9ch\u00e9ance',
            'is-due-muted'
          );
        }
        dueBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          M.openMiniDue(row, dueBtn);
        });
        slot(row.duePast ? 'is-overdue' : 'is-due', dueBtn);
      } else {
        slot('is-blocked', null);
        slot('is-priority', null);
        var localPct = Math.round(row.progress || 0);
        slot(
          'is-progress',
          (function () {
            var span = S.el('button', 'gantt-progress-text gantt-progress-text--btn', {
              type: 'button',
              title: 'Progr\u00e8s ' + localPct + '%',
            });
            span.setAttribute('aria-label', 'Progr\u00e8s ' + localPct + '%');
            span.appendChild(M.progressRingEl(localPct));
            span.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              M.openMiniProgress(row, span);
            });
            return span;
          })()
        );
        slot('is-due', null);
      }

      return icons;
    };
    M.progressRingEl = function progressRingEl(pct) {
      if (global.ProgressRing) return global.ProgressRing.create(pct);
      return document.createTextNode(pct + '%');
    };
    M.buildSubtaskTitleBadge = function buildSubtaskTitleBadge(row) {
      if (!row || !(row.subtaskCount > 0)) return null;
      var sub = S.iconEl(
        'ti-list-check',
        row.subtaskCount + ' sous-t\u00e2che(s)',
        'is-subtasks'
      );
      sub.appendChild(
        S.el('span', 'gantt-icon-label', { text: String(row.subtaskCount) })
      );
      return sub;
    };
    M.toggleCardBlocked = function toggleCardBlocked(row) {
      if (!row || row.kind !== 'card' || !row.cardId || M.state.saving) return;
      if (typeof M.ganttTrello.setCardBlocked !== 'function') {
        M.setStatus('Blocage indisponible', true);
        return;
      }
      var nextBlocked = !row.blocked;
      M.state.saving = true;
      M.setStatus(nextBlocked ? 'Blocage\u2026' : 'D\u00e9blocage\u2026');
      M.ganttTrello
        .setCardBlocked(M.t, row.cardId, nextBlocked)
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            M.setStatus(
              (nextBlocked
                ? '\u00c9chec du blocage'
                : '\u00c9chec du d\u00e9blocage') +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return M.reload();
          }
          M.record({
            type: 'edit',
            key: 'blocked',
            label: 'Blocage',
            targetId: row.cardId,
            title: row.name,
            before: nextBlocked ? 'Non' : 'Bloqu\u00e9',
            after: nextBlocked ? 'Bloqu\u00e9' : 'Non',
            beforeVal: !nextBlocked,
            afterVal: nextBlocked,
          });
          M.setStatus(nextBlocked ? 'Carte bloqu\u00e9e' : 'Carte d\u00e9bloqu\u00e9e');
          return M.reload();
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
    M.selectedRows = function selectedRows() {
      // Walk the full nest tree so cascade-selected children count even if collapsed.
      var rows =
        typeof M.model.flattenAll === 'function'
          ? M.model.flattenAll(M.state.tree)
          : M.visibleRows();
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (
          rows[i] &&
          M.isSelectableGanttRow(rows[i]) &&
          M.state.selected[rows[i].id]
        ) {
          out.push(rows[i]);
        }
      }
      return out;
    };
    M.selectedCount = function selectedCount() {
      return M.selectedRows().length;
    };
    M.clearSelection = function clearSelection() {
      M.state.selected = Object.create(null);
      M.renderBulkBar();
      M.renderChart();
    };
    M.expandSubtreeForSelect = function expandSubtreeForSelect(node) {
      if (!node || typeof M.model.collectExpandableSubtreeIds !== 'function') {
        return;
      }
      var ids = M.model.collectExpandableSubtreeIds(node);
      for (var i = 0; i < ids.length; i++) {
        M.state.expanded[ids[i]] = true;
      }
    };
    M.toggleSelected = function toggleSelected(rowId, on) {
      var node =
        typeof M.model.findNodeById === 'function'
          ? M.model.findNodeById(M.state.tree, rowId)
          : null;
      var ids =
        node && typeof M.model.collectSubtreeIds === 'function'
          ? M.model.collectSubtreeIds(node)
          : rowId
            ? [String(rowId)]
            : [];
      for (var i = 0; i < ids.length; i++) {
        if (on) M.state.selected[ids[i]] = true;
        else delete M.state.selected[ids[i]];
      }
      // Reveal nested children so cascade selection is visible.
      if (on && node) M.expandSubtreeForSelect(node);
      M.renderBulkBar();
      M.renderChart();
    };
    M.confirmTrash = function confirmTrash(message, mouseEvent, verb) {
      var confirmApi = S.TC();
      verb = verb || 'Supprimer';
      if (confirmApi && typeof confirmApi.askActions === 'function') {
        return confirmApi.askActions(M.t, {
          title: message,
          mouseEvent: mouseEvent || null,
          actions: [
            { id: 'done', text: 'Marquer comme termin\u00e9' },
            { id: 'delete', text: verb },
            { id: 'cancel', text: 'Annuler' },
          ],
        });
      }
      if (confirmApi && typeof confirmApi.ask === 'function') {
        return confirmApi
          .ask(M.t, {
            title: verb,
            message: message,
            confirmText: verb,
            cancelText: 'Annuler',
            confirmStyle: 'danger',
            mouseEvent: mouseEvent || null,
          })
          .then(function (ok) {
            return ok ? 'delete' : 'cancel';
          });
      }
      return Promise.resolve(
        global.confirm && global.confirm(message) ? 'delete' : 'cancel'
      );
    };
    M.markSubtaskDone = function markSubtaskDone(row) {
      if (M.state.saving || !M.canEditSubtask(row)) return Promise.resolve();
      if (row.done) {
        M.setStatus('D\u00e9j\u00e0 termin\u00e9e');
        return Promise.resolve();
      }
      M.state.saving = true;
      M.setStatus('Marquage termin\u00e9\u2026');
      return M.ganttTrello
        .setSubtaskDone(M.t, M.subtaskMeta(row), true)
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            M.setStatus(
              '\u00c9chec' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return M.reload();
          }
          M.recordDone(row, true);
          S.playGanttUiSound('complete_all');
          M.setStatus('Sous-t\u00e2che termin\u00e9e');
          return M.reload();
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
    M.bulkRemoval = function bulkRemoval(rows) {
      var n = rows.length;
      var roots = rows.filter(M.isBoardRootCard).length;
      var plural = n > 1;
      if (n && roots === n) {
        return {
          verb: 'Archiver',
          icon: 'ti-archive',
          doing: 'Archivage\u2026',
          done: plural ? 'Cartes archiv\u00e9es' : 'Carte archiv\u00e9e',
          question: 'Archiver ' + n + (plural ? ' cartes' : ' carte') + '\u00a0?',
        };
      }
      var onlySubtasks = !roots && !rows.some(M.isLinkedCardRow);
      return {
        verb: 'Supprimer',
        icon: 'ti-trash',
        doing: 'Suppression\u2026',
        done: onlySubtasks ? (plural ? 'Sous-t\u00e2ches supprim\u00e9es' : 'Sous-t\u00e2che supprim\u00e9e') : 'T\u00e2ches retir\u00e9es',
        question:
          (onlySubtasks ? 'Supprimer ' : 'Supprimer ou archiver ') +
          n +
          (onlySubtasks ? (plural ? ' sous-t\u00e2ches' : ' sous-t\u00e2che') : plural ? ' t\u00e2ches' : ' t\u00e2che') +
          '\u00a0?',
      };
    };
    M.runBulk = function runBulk(op, mouseEvent) {
      var rows = M.selectedRows().filter(M.canEditSubtask);
      if (!rows.length) {
        M.setStatus('Aucune t\u00e2che modifiable dans la s\u00e9lection', true);
        return;
      }
      if (M.state.saving) return;
      var removal = M.bulkRemoval(rows);

      var start = function () {
        M.state.saving = true;
        M.setStatus(
          op === 'delete'
            ? removal.doing
            : op === 'done'
              ? 'Marquage termin\u00e9\u2026'
              : 'R\u00e9ouverture\u2026'
        );

        var chain = Promise.resolve();
        var failed = 0;
        rows.forEach(function (row) {
          chain = chain.then(function () {
            if (op === 'delete') {
              return M.ganttTrello.deleteSubtask(M.t, M.subtaskMeta(row)).then(function (res) {
                if (!res || !res.ok) failed += 1;
                else M.recordRemoval(row, res);
              });
            }
            return M.ganttTrello
              .setSubtaskDone(M.t, M.subtaskMeta(row), op === 'done')
              .then(function (res) {
                if (!res || !res.ok) failed += 1;
                else if (!!row.done !== (op === 'done')) M.recordDone(row, op === 'done');
              });
          });
        });

        chain
          .then(function () {
            M.state.saving = false;
            M.state.selected = Object.create(null);
            if (failed) {
              M.setStatus(failed + ' \u00e9chec(s)', true);
            } else {
              if (op === 'delete') S.playGanttUiSound('trash');
              else if (op === 'done') S.playGanttUiSound('complete_all');
              else S.playGanttUiSound('uncomplete');
              M.setStatus(
                op === 'delete'
                  ? removal.done
                  : op === 'done'
                    ? 'T\u00e2ches termin\u00e9es'
                    : 'T\u00e2ches rouvertes'
              );
            }
            return M.reload();
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

      if (op === 'delete') {
        M.confirmTrash(removal.question, mouseEvent, removal.verb).then(function (choice) {
          if (choice === 'done') {
            M.runBulk('done', mouseEvent);
            return;
          }
          if (choice === 'delete') start();
        });
        return;
      }
      start();
    };
    M.makeIconBtn = function makeIconBtn(className, iconClass, label, onClick) {
      var btn = S.el('button', className, { type: 'button', title: label });
      var icon = S.el('i', 'ti ' + iconClass);
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);
      if (/gantt-btn--icon/.test(className)) {
        btn.setAttribute('aria-label', label);
      } else {
        btn.appendChild(document.createTextNode(label));
      }
      btn.addEventListener('click', onClick);
      return btn;
    };
    M.renderBulkBar = function renderBulkBar() {
      M.bulkBar.innerHTML = '';
      var n = M.selectedCount();
      if (!n) {
        M.bulkBar.classList.remove('is-visible');
        return;
      }
      M.bulkBar.classList.add('is-visible');
      M.bulkBar.appendChild(
        S.el('span', 'gantt-bulk-count', {
          text: n + (n > 1 ? ' s\u00e9lectionn\u00e9es' : ' s\u00e9lectionn\u00e9e'),
        })
      );
      var removal = M.bulkRemoval(M.selectedRows().filter(M.canEditSubtask));

      M.bulkBar.appendChild(
        M.makeIconBtn('gantt-btn', 'ti-circle-check', 'Terminer', function () {
          M.runBulk('done');
        })
      );
      M.bulkBar.appendChild(
        M.makeIconBtn('gantt-btn', 'ti-reload', 'Rouvrir', function () {
          M.runBulk('reopen');
        })
      );
      M.bulkBar.appendChild(
        M.makeIconBtn(
          'gantt-btn gantt-btn--danger',
          removal.icon,
          removal.verb,
          function (e) {
            M.runBulk('delete', e);
          }
        )
      );
      M.bulkBar.appendChild(
        M.makeIconBtn(
          'gantt-btn',
          'ti-deselect',
          'Tout d\u00e9s\u00e9lectionner',
          function () {
            M.clearSelection();
          }
        )
      );
    };
    M.canEditSubtask = function canEditSubtask(row) {
      if (!row) return false;
      if (row.kind === 'local' && row.parentCardId && row.itemId) return true;
      if (
        row.kind === 'checklist' &&
        row.parentCardId &&
        row.parentItemId &&
        row.itemId
      ) {
        return true;
      }
      // Board cards (roots and linked children) — blocked or not.
      if (row.kind === 'card' && row.cardId) return true;
      return false;
    };
    M.isLinkedCardRow = function isLinkedCardRow(row) {
      return !!(row && row.kind === 'card' && row.linkParentCardId && row.cardId);
    };
    M.isBoardRootCard = function isBoardRootCard(row) {
      return !!(row && row.kind === 'card' && row.cardId && !row.linkParentCardId);
    };
    M.subtaskMeta = function subtaskMeta(row) {
      return {
        kind: row.kind,
        parentCardId: row.parentCardId || null,
        itemId: row.itemId || null,
        parentItemId: row.parentItemId || null,
        cardId: row.cardId || null,
        linkParentCardId: row.linkParentCardId || null,
        linkItemId: row.linkItemId || null,
      };
    };
    M.toggleSubtaskBlocked = function toggleSubtaskBlocked(row) {
      if (M.state.saving || !M.canEditSubtask(row)) return;
      M.state.saving = true;
      var nextBlocked = !row.blocked;
      M.setStatus(nextBlocked ? 'Blocage…' : 'Déblocage…');
      M.ganttTrello
        .setSubtaskBlocked(M.t, M.subtaskMeta(row), nextBlocked)
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            M.setStatus(
              'Échec' + (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return M.reload();
          }
          M.setStatus(nextBlocked ? 'Sous-tâche bloquée' : 'Sous-tâche débloquée');
          return M.reload();
        })
        .catch(function (err) {
          M.state.saving = false;
          M.setStatus(
            'Erreur : ' + (err && err.message ? err.message : String(err)),
            true
          );
          return M.reload();
        });
    };
    M.toggleSubtaskDone = function toggleSubtaskDone(row) {
      if (M.state.saving || !M.canEditSubtask(row)) return;
      M.state.saving = true;
      var nextDone = !row.done;
      M.setStatus(nextDone ? 'Marquage termin\u00e9\u2026' : 'R\u00e9ouverture\u2026');
      M.ganttTrello
        .setSubtaskDone(M.t, M.subtaskMeta(row), nextDone)
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            M.setStatus(
              '\u00c9chec' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return M.reload();
          }
          M.recordDone(row, nextDone);
          M.setStatus(nextDone ? 'Sous-t\u00e2che termin\u00e9e' : 'Sous-t\u00e2che rouverte');
          return M.reload();
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
    M.deleteSubtaskRow = function deleteSubtaskRow(row, mouseEvent) {
      if (M.state.saving || !M.canEditSubtask(row)) return;
      var label = row.name || 'cette t\u00e2che';
      var prompt = M.isBoardRootCard(row)
        ? 'Archiver \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?'
        : M.isLinkedCardRow(row)
          ? 'Retirer le lien vers \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?'
          : 'Supprimer \u00ab\u00a0' + label + '\u00a0\u00bb\u00a0?';
      var verb = M.isBoardRootCard(row) ? 'Archiver' : M.isLinkedCardRow(row) ? 'Retirer le lien' : 'Supprimer';
      // Archiving a board card is recoverable (history panel), so it goes straight through.
      var decision = M.isBoardRootCard(row)
        ? Promise.resolve('delete')
        : M.confirmTrash(prompt, mouseEvent, verb);
      decision.then(function (choice) {
        if (!choice || choice === 'cancel') return;
        if (choice === 'done') {
          M.markSubtaskDone(row);
          return;
        }
        M.state.saving = true;
        M.setStatus(M.isBoardRootCard(row) ? 'Archivage\u2026' : 'Suppression\u2026');
        M.ganttTrello
          .deleteSubtask(M.t, M.subtaskMeta(row))
          .then(function (res) {
            M.state.saving = false;
            if (!res || !res.ok) {
              M.setStatus(
                '\u00c9chec' +
                  (res && res.reason ? ' (' + res.reason + ')' : ''),
                true
              );
              return M.reload();
            }
            if (M.state.selected[row.id]) delete M.state.selected[row.id];
            M.recordRemoval(row, res);
            S.playGanttUiSound('trash');
            M.setStatus(
              res.archived
                ? 'Carte archiv\u00e9e'
                : res.unlinked
                  ? 'Lien retir\u00e9'
                  : 'Sous-t\u00e2che supprim\u00e9e'
            );
            return M.reload();
          })
          .catch(function (err) {
            M.state.saving = false;
            M.setStatus(
              'Erreur\u00a0: ' + (err && err.message ? err.message : String(err)),
              true
            );
            return M.reload();
          });
      });
    };
    M.commitRename = function commitRename(row, nextName) {
      var trimmed = typeof nextName === 'string' ? nextName.trim() : '';
      if (!trimmed || trimmed === row.name) {
        M.renderChart();
        return;
      }
      if (M.state.saving || !M.canEditSubtask(row)) return;
      var prevName = row.name || '';
      M.state.saving = true;
      M.setStatus('Renommage\u2026');
      M.ganttTrello
        .renameSubtask(M.t, M.subtaskMeta(row), trimmed)
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            M.setStatus(
              '\u00c9chec renommage' +
                (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return M.reload();
          }
          row.name = res.name || trimmed;
          M.record({
            type: 'edit',
            key: 'name',
            label: 'Nom',
            targetId: row.cardId || row.itemId || '',
            title: prevName,
            meta: M.subtaskMeta(row),
            before: prevName,
            after: row.name,
            beforeVal: prevName,
            afterVal: row.name,
          });
          M.setStatus('Sous-t\u00e2che renomm\u00e9e');
          return M.reload();
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
    M.startInlineRename = function startInlineRename(row, nameEl) {
      if (M.state.saving || !M.canEditSubtask(row) || !nameEl || !nameEl.parentNode) {
        return;
      }
      var input = S.el('input', 'gantt-rename-input', {
        type: 'text',
        maxlength: '500',
      });
      input.value = row.name || '';
      input.setAttribute('aria-label', 'Renommer la sous-t\u00e2che');
      var finished = false;

      function finish(save) {
        if (finished) return;
        finished = true;
        var value = input.value;
        if (save) M.commitRename(row, value);
        else M.renderChart();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', function () {
        finish(true);
      });

      nameEl.parentNode.replaceChild(input, nameEl);
      input.focus();
      input.select();
    };
    M.canAddSubtask = function canAddSubtask(row) {
      if (!row) return false;
      if (row.kind === 'card' && row.cardId) return true;
      return row.kind === 'local' && !!row.parentCardId && !!row.itemId;
    };
    M.commitAddSubtask = function commitAddSubtask(row, text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) {
        M.renderChart();
        return;
      }
      if (M.state.saving || !M.canAddSubtask(row)) return;
      M.state.saving = true;
      M.setStatus('Ajout…');
      M.ganttTrello
        .addSubtask(M.t, M.subtaskMeta(row), trimmed)
        .then(function (res) {
          M.state.saving = false;
          if (!res || !res.ok) {
            M.setStatus(
              'Échec ajout' + (res && res.reason ? ' (' + res.reason + ')' : ''),
              true
            );
            return M.reload();
          }
          M.state.expanded[row.id] = true;
          M.record({
            type: 'add',
            targetId: res.itemId || '',
            title: res.name || trimmed,
            label: 'sous-tâche ajoutée',
          });
          M.setStatus('Sous-tâche ajoutée');
          return M.reload();
        })
        .catch(function (err) {
          M.state.saving = false;
          M.setStatus('Erreur : ' + (err && err.message ? err.message : String(err)), true);
          return M.reload();
        });
    };
    M.startAddSubtask = function startAddSubtask(row, actionsEl) {
      var labelCell = actionsEl && actionsEl.closest ? actionsEl.closest('.gantt-label-cell, .gantt-row') : null;
      var nameEl = labelCell && labelCell.querySelector('.gantt-task-name');
      if (M.state.saving || !M.canAddSubtask(row) || !nameEl || !nameEl.parentNode) return;
      var input = S.el('input', 'gantt-rename-input', { type: 'text', maxlength: '500' });
      input.placeholder = 'Nouvelle sous-tâche…';
      input.setAttribute('aria-label', 'Nouvelle sous-tâche');
      var finished = false;
      function finish(save) {
        if (finished) return;
        finished = true;
        if (save) M.commitAddSubtask(row, input.value);
        else M.renderChart();
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', function () {
        finish(true);
      });
      nameEl.parentNode.replaceChild(input, nameEl);
      input.focus();
    };
    M.buildSubtaskActions = function buildSubtaskActions(row) {
      var actions = S.el('div', 'gantt-row-actions');
      var editable = M.canEditSubtask(row);

      var addBtn = S.el('button', 'gantt-action-btn gantt-action-btn--add', {
        type: 'button',
        title: 'Ajouter une sous-tâche',
      });
      addBtn.innerHTML = '<i class="ti ti-list-check" aria-hidden="true"></i>';
      if (!M.canAddSubtask(row)) {
        addBtn.disabled = true;
        addBtn.classList.add('is-disabled');
      } else {
        addBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          M.startAddSubtask(row, actions);
        });
      }
      actions.appendChild(addBtn);

      // Same pause glyph as the card row: a blocked subtask blocks its parent.
      var blockBtn = S.el(
        'button',
        'gantt-action-btn gantt-action-btn--block' + (row.blocked ? ' is-on' : ''),
        {
          type: 'button',
          title: row.blocked ? 'Débloquer' : 'Bloquer',
        }
      );
      blockBtn.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
      if (!editable || row.done || row.kind !== 'local') {
        blockBtn.disabled = true;
        blockBtn.classList.add('is-disabled');
      } else {
        blockBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          M.toggleSubtaskBlocked(row);
        });
      }
      actions.appendChild(blockBtn);

      var doneBtn = S.el(
        'button',
        'gantt-action-btn gantt-action-btn--done' + (row.done ? ' is-on' : ''),
        {
          type: 'button',
          title: row.done
            ? 'Marquer non termin\u00e9'
            : 'Marquer termin\u00e9',
        }
      );
      doneBtn.innerHTML =
        '<i class="ti ' +
        (row.done ? 'ti-circle-check' : 'ti-check') +
        '" aria-hidden="true"></i>';
      if (!editable) {
        doneBtn.disabled = true;
        doneBtn.classList.add('is-disabled');
      } else {
        doneBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          M.toggleSubtaskDone(row);
        });
      }
      actions.appendChild(doneBtn);

      var delBtn = S.el('button', 'gantt-action-btn gantt-action-btn--delete', {
        type: 'button',
        title: M.isBoardRootCard(row)
          ? 'Archiver la carte'
          : M.isLinkedCardRow(row)
            ? 'Retirer le lien'
            : 'Supprimer la sous-t\u00e2che',
      });
      // Same glyph as the Table: a board card is archived (recoverable), not trashed.
      delBtn.innerHTML =
        '<i class="ti ' + (M.isBoardRootCard(row) ? 'ti-archive' : 'ti-trash') + '" aria-hidden="true"></i>';
      if (!editable) {
        delBtn.disabled = true;
        delBtn.classList.add('is-disabled');
      } else {
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          M.deleteSubtaskRow(row, e);
        });
      }
      actions.appendChild(delBtn);

      return actions;
    };
    M.applyIntervalToRow = function applyIntervalToRow(row, interval) {
      var parts = M.model.intervalToParts(interval, {
        includeTime: M.usesTimedTimeline() || !!interval.hasTime,
      });
      row.startDate = parts.startDate;
      row.dueDate = parts.dueDate;
      row.startTime = parts.startTime || '';
      row.dueTime = parts.dueTime || '';
      if (row.cardId && M.state.cardsById[row.cardId]) {
        M.state.cardsById[row.cardId].startDate = parts.startDate;
        M.state.cardsById[row.cardId].dueDate = parts.dueDate;
        M.state.cardsById[row.cardId].startTime = parts.startTime || '';
        M.state.cardsById[row.cardId].dueTime = parts.dueTime || '';
      }
    };
    M.isDatable = function isDatable(row) {
      if (!row) return false;
      if (row.kind === 'card') return !!row.cardId;
      return (row.kind === 'local' || row.kind === 'checklist') && !!row.parentCardId && !!row.itemId;
    };
    },
    run: function (M) {
    M.FIELD_LABELS = {
      priority: ['Priorit\u00e9 enregistr\u00e9e', 'priorit\u00e9'],
      due: ['\u00c9ch\u00e9ance enregistr\u00e9e', '\u00e9ch\u00e9ance'],
      blocked: ['Blocage enregistr\u00e9', 'blocage'],
      progress: ['Progr\u00e8s enregistr\u00e9', 'progr\u00e8s'],
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
