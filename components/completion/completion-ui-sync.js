/**
 * completion-ui: mountCompletionUI() part 2 of 4.
 * The body of mountCompletionUI runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see completion-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});
  var P = (global.CompletionUiPartsMountMountCompletionUI = global.CompletionUiPartsMountMountCompletionUI || { list: [] });

  P.list.push({
    define: function (M) {
    M.renderBulkBar = function renderBulkBar() {
      if (!M.bulkBarEl) return;
      var n = M.selectedCount();
      var idle = n === 0;
      M.bulkBarEl.classList.toggle('is-idle', idle);
      if (M.bulkCountEl) {
        M.bulkCountEl.textContent = String(n);
        M.bulkCountEl.title = idle
          ? 'Aucune s\u00e9lection'
          : n + ' s\u00e9lectionn\u00e9e(s)';
      }
      M.setBulkBtnEnabled(M.bulkDoneBtn, !idle);
      M.setBulkBtnEnabled(M.bulkReopenBtn, !idle);
      M.setBulkBtnEnabled(M.bulkDeleteBtn, !idle);
      M.setBulkBtnEnabled(M.bulkClearBtn, !idle);
      M.syncSelectAllUi();
    };
    M.syncSelectAllUi = function syncSelectAllUi() {
      if (!M.selectAllCheckbox) return;
      var visible = M.visibleSelectionEntries();
      var hasVisible = visible.length > 0;
      M.selectAllCheckbox.disabled = !hasVisible;
      var selectedVisible = 0;
      for (var i = 0; i < visible.length; i++) {
        if (M.selected[visible[i].key]) selectedVisible += 1;
      }
      var state = S.selectAllCheckboxState(selectedVisible, visible.length);
      M.selectAllCheckbox.checked = state.checked;
      M.selectAllCheckbox.indeterminate = state.indeterminate;
    };
    M.createSelectCheckbox = function createSelectCheckbox(key, cascadeItem) {
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'tp-completion-select-box';
      box.title = 'S\u00e9lectionner';
      box.setAttribute('aria-label', 'S\u00e9lectionner');
      box.checked = !!M.selected[key];
      box.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      box.addEventListener('change', function () {
        M.toggleSelected(key, !!box.checked, cascadeItem !== false);
      });
      return box;
    };
    M.canBulkComplete = function canBulkComplete(entry) {
      if (!entry) return false;
      if (entry.kind === 'check') return true;
      if (entry.kind === 'item' && !entry.linked) return true;
      return false;
    };
    M.canBulkDelete = function canBulkDelete(entry) {
      return !!(entry && (entry.kind === 'item' || entry.kind === 'check'));
    };
    M.runBulk = function runBulk(op, mouseEvent) {
      if (M.bulkBusy) return;
      var entries = M.selectedEntries();
      if (op === 'delete') {
        entries = S.dedupeBulkEntries(entries).filter(M.canBulkDelete);
      } else {
        entries = S.dedupeBulkEntries(entries).filter(M.canBulkComplete);
      }
      if (!entries.length) return;

      var applyBulk = function () {
        M.bulkBusy = true;
        var targetProgress = op === 'done' ? 100 : 0;
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (op === 'delete') {
            if (entry.kind === 'item') {
              delete M.itemSpellReverts[entry.itemId];
              delete M.spellcheckingItemIds[entry.itemId];
              delete M.itemSpellTokens[entry.itemId];
              delete M.estimatingItemIds[entry.itemId];
              M.clearSplitRevertTracking([entry.itemId]);
              M.data.items = M.data.items.filter(function (item) {
                return item.id !== entry.itemId;
              });
              delete M.linkedTreeByItemId[entry.itemId];
            } else if (entry.kind === 'check') {
              M.data = M.CT.removeChecklistItem(M.data, entry.parentId, entry.nestedId);
            }
          } else if (entry.kind === 'item') {
            M.data = M.CT.applyItemProgress(M.data, entry.itemId, targetProgress);
          } else if (entry.kind === 'check') {
            M.data = M.CT.applyChecklistItemProgress(
              M.data,
              entry.parentId,
              entry.nestedId,
              targetProgress
            );
          }
        }
        if (op === 'delete' && !M.data.items.length) {
          M.data.progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots).percent;
        }
        if (op === 'delete') {
          S.playCompletionUiSound('trash');
        } else if (op === 'reopen') {
          S.playCompletionUiSound('uncomplete');
        } else if (entries.length > 1) {
          S.playCompletionUiSound('complete_all');
        }
        M.selected = Object.create(null);
        M.bulkBusy = false;
        M.emitChange();
        if (op === 'delete') {
          M.refreshLinkedTree({ skipPersist: true });
        }
        M.onResize();
      };

      if (op === 'delete') {
        var confirmApi = global.TpConfirm;
        var message =
          'Supprimer ' + entries.length + ' t\u00e2che(s)\u00a0?';
        var ask =
          confirmApi && typeof confirmApi.ask === 'function'
            ? confirmApi.ask(M.trelloT, {
                title: 'Supprimer',
                message: message,
                confirmText: 'Supprimer',
                cancelText: 'Annuler',
                confirmStyle: 'danger',
                mouseEvent: mouseEvent || null,
              })
            : Promise.resolve(
                global.confirm ? !!global.confirm(message) : true
              );
        ask.then(function (ok) {
          if (ok) applyBulk();
        });
        return;
      }

      applyBulk();
    };
    M.isEmptyDraftItem = function isEmptyDraftItem(item) {
      return (
        !!item &&
        !M.CT.isLinkedItem(item) &&
        !String(item.text || '').trim()
      );
    };
    M.beginSuppressEmptyDraftDiscard = function beginSuppressEmptyDraftDiscard() {
      M.suppressEmptyDraftDiscard = true;
      if (M.suppressEmptyDraftDiscardTimer) {
        clearTimeout(M.suppressEmptyDraftDiscardTimer);
        M.suppressEmptyDraftDiscardTimer = null;
      }
    };
    M.endSuppressEmptyDraftDiscard = function endSuppressEmptyDraftDiscard() {
      if (M.suppressEmptyDraftDiscardTimer) {
        clearTimeout(M.suppressEmptyDraftDiscardTimer);
      }
      M.suppressEmptyDraftDiscardTimer = setTimeout(function () {
        M.suppressEmptyDraftDiscard = false;
        M.suppressEmptyDraftDiscardTimer = null;
      }, 0);
    };
    M.captureEmptyDrafts = function captureEmptyDrafts(items) {
      var drafts = [];
      for (var i = 0; i < (items || []).length; i++) {
        if (M.isEmptyDraftItem(items[i])) drafts.push(items[i]);
      }
      return drafts;
    };
    M.applyNormalizedKeepingDrafts = function applyNormalizedKeepingDrafts(nextRaw) {
      var drafts = M.captureEmptyDrafts(M.data.items);
      var normalized = M.CT.normalizeCompletionData(nextRaw != null ? nextRaw : M.data);
      if (!drafts.length) {
        M.data = normalized;
        return normalized;
      }
      var seen = Object.create(null);
      var items = normalized.items.slice();
      for (var i = 0; i < items.length; i++) seen[items[i].id] = true;
      for (var d = 0; d < drafts.length; d++) {
        if (!seen[drafts[d].id]) items.push(drafts[d]);
      }
      M.data = { items: items };
      if (Object.prototype.hasOwnProperty.call(normalized, 'progress')) {
        M.data.progress = normalized.progress;
      }
      if (normalized.progressEnabled === false) M.data.progressEnabled = false;
      if (normalized.estimatedMinutes != null) {
        M.data.estimatedMinutes = normalized.estimatedMinutes;
      }
      if (
        typeof normalized.estimatedMinutesOffset === 'number' &&
        isFinite(normalized.estimatedMinutesOffset)
      ) {
        M.data.estimatedMinutesOffset = normalized.estimatedMinutesOffset;
      }
      if (normalized.estimatedMinutesLocked === true) {
        M.data.estimatedMinutesLocked = true;
      }
      if (normalized.blocked === true) {
        M.data.blocked = true;
        M.data.blockedOrigin =
          normalized.blockedOrigin === 'status' ? 'status' : 'user';
        if (
          Array.isArray(normalized.blockedReasons) &&
          normalized.blockedReasons.length
        ) {
          M.data.blockedReasons = normalized.blockedReasons.slice();
        } else {
          delete M.data.blockedReasons;
        }
      } else {
        delete M.data.blocked;
        delete M.data.blockedReasons;
        delete M.data.blockedOrigin;
      }
      return normalized;
    };
    M.syncMasterBlockedBtn = function syncMasterBlockedBtn() {
      var blocked = M.CT.isMasterBlocked(M.data);
      var anyBlocked = M.CT.hasAnyBlocked(M.data);
      M.masterBlockedBtn.classList.toggle('is-blocked', blocked);
      M.masterBlockedBtn.setAttribute('aria-pressed', blocked ? 'true' : 'false');
      M.masterBlockedBtn.setAttribute(
        'aria-label',
        blocked
          ? 'D\u00e9bloquer la t\u00e2che'
          : 'Marquer la t\u00e2che comme bloqu\u00e9e'
      );
      M.masterBlockedBtn.title = blocked ? 'D\u00e9bloquer' : 'Bloqu\u00e9';
      M.progressPanel.classList.toggle('is-master-blocked', blocked);
      M.containerEl.classList.toggle('has-blocked', anyBlocked);
      M.syncBlockedMotifMount(
        M.masterMotifHost,
        blocked,
        M.data.blockedReasons || [],
        function (reasons) {
          M.data = M.CT.setMasterBlockedReasons(M.data, reasons, { origin: 'user' });
          // Keep master blocked even if reasons cleared.
          if (!M.CT.isMasterBlocked(M.data)) {
            M.data = M.CT.setMasterBlocked(M.data, true, { origin: 'user' });
          }
          M.emitChange();
          M.notifyBlockedChange('master-reason');
          M.onResize();
        },
        'tp-completion-master-motif'
      );
    };
    M.syncMasterCheckButton = function syncMasterCheckButton(progress) {
      var pct =
        progress && typeof progress.percent === 'number' ? progress.percent : 0;
      var done = pct >= 100;
      var anyBlocked = M.CT.hasAnyBlocked(M.data);
      M.syncCheckButton(M.masterCheckBtn, done, pct, { blocked: anyBlocked });
      M.masterCheckBtn.setAttribute(
        'aria-label',
        anyBlocked
          ? done
            ? 'T\u00e2che bloqu\u00e9e'
            : 'T\u00e2che bloqu\u00e9e — ' + pct + '\u00a0%'
          : done
            ? 'Remettre le progr\u00e8s \u00e0 0\u00a0%'
            : 'Marquer comme termin\u00e9 (100\u00a0%)'
      );
    };
    M.toggleMasterComplete = function toggleMasterComplete() {
      // Pause icon means blocked — unblock instead of marking complete.
      if (M.CT.hasAnyBlocked(M.data)) {
        M.data = M.CT.clearAllBlocked(M.data);
        S.playCompletionUiSound('unblock');
        M.syncMasterBlockedBtn();
        M.updateProgressUi();
        M.emitChange();
        M.notifyBlockedChange('master-check');
        M.onResize();
        return;
      }
      var progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
      if (progress.percent >= 100) {
        if (M.data.items.length) {
          for (var i = 0; i < M.data.items.length; i++) {
            M.setItemProgress(M.data.items[i], 0);
          }
        } else {
          M.data.progress = 0;
        }
        M.resetAllClearsCompleted = false;
        S.playCompletionUiSound('uncomplete');
      } else {
        if (M.data.items.length) {
          M.data.items = M.CT.applyMasterProgress(M.data.items, 100, M.linkedSnapshots);
        } else {
          M.data.progress = 100;
        }
        M.resetAllClearsCompleted = false;
        S.playCompletionUiSound('complete_all');
      }
      M.emitChange();
      M.onResize();
    };
    M.notifyBlockedChange = function notifyBlockedChange(source) {
      console.debug('[tp-blocked] notifyBlockedChange', {
        source: source,
        masterBlocked: M.CT.isMasterBlocked(M.data),
        masterOrigin: M.CT.masterBlockedOrigin ? M.CT.masterBlockedOrigin(M.data) : null,
        hasAnyBlocked: M.CT.hasAnyBlocked(M.data),
        blockedItems: (M.data.items || [])
          .filter(function (it) {
            return M.CT.isItemBlocked(it);
          })
          .map(function (it) {
            return it.id;
          }),
      });
      if (!M.onBlockedChange) return;
      try {
        M.onBlockedChange(M.CT.normalizeCompletionData(M.data), {
          source: source || 'toggle',
          hasAnyBlocked: M.CT.hasAnyBlocked(M.data),
        });
      } catch (err) {
        console.error('Completion onBlockedChange failed', err);
      }
    };
    M.toggleMasterBlocked = function toggleMasterBlocked() {
      var nextBlocked = !M.CT.isMasterBlocked(M.data);
      console.debug('[tp-blocked] toggleMasterBlocked', {
        nextBlocked: nextBlocked,
        progress: M.CT.computeCardProgress(M.data).percent,
      });
      // Pause button is always an explicit user action.
      M.data = M.CT.setMasterBlocked(M.data, nextBlocked, { origin: 'user' });
      S.playCompletionUiSound(nextBlocked ? 'block' : 'unblock');
      M.syncMasterBlockedBtn();
      M.updateProgressUi();
      M.emitChange();
      M.notifyBlockedChange('master');
      M.onResize();
    };
    M.toggleItemBlocked = function toggleItemBlocked(itemId) {
      var live = null;
      for (var i = 0; i < M.data.items.length; i++) {
        if (M.data.items[i].id === itemId) {
          live = M.data.items[i];
          break;
        }
      }
      if (!live) return;
      var nextBlocked = !M.CT.isItemBlocked(live);
      M.data = M.CT.setItemBlocked(M.data, itemId, nextBlocked);
      S.playCompletionUiSound(nextBlocked ? 'block' : 'unblock');
      // Do not use done-list FLIP — blocked toggle is not a done transition.
      M.emitChange();
      M.notifyBlockedChange('item');
      M.onResize();
    };
    M.emitChange = function emitChange(opts) {
      opts = opts || {};
      var persisted = M.applyNormalizedKeepingDrafts(M.data);
      // Turn on show-done before paint when crossing into 100%, so the list
      // never flashes empty (syncAllCompleteSideEffects will see it already on).
      if (
        persisted.items.length &&
        !M.showCompleted &&
        M.lastAllComplete === false &&
        S.isAllCompleteProgress(M.CT.computeCardProgress(persisted, M.linkedSnapshots))
      ) {
        M.showCompleted = true;
        S.saveShowDonePreference(true);
        M.showDoneToggle.setAttribute('aria-expanded', 'true');
      }
      if (opts.animateItemId) {
        M.renderListWithFlip(opts.animateItemId, opts.flipWasDone);
      } else {
        M.renderList();
      }
      M.updateProgressUi();
      if (opts.focusTextItemId) {
        M.focusItemTextInput(opts.focusTextItemId);
      }
      M.onChange(persisted);
    };
    M.hasIncompleteItemProgress = function hasIncompleteItemProgress() {
      if (M.data.items.length) {
        for (var i = 0; i < M.data.items.length; i++) {
          var item = M.data.items[i];
          if (!item.done && M.CT.itemProgress(item) > 0) return true;
        }
        return false;
      }
      var cardProgress = M.CT.clampProgress(M.data.progress);
      return cardProgress > 0 && cardProgress < 100;
    };
    M.hasCompletedTasks = function hasCompletedTasks() {
      if (M.data.items.length) {
        for (var i = 0; i < M.data.items.length; i++) {
          if (M.data.items[i].done) return true;
        }
        return false;
      }
      return M.CT.clampProgress(M.data.progress) >= 100;
    };
    M.syncCompleteAllButton = function syncCompleteAllButton(progress) {
      var fullyComplete =
        progress.percent >= 100 || S.isAllCompleteProgress(progress);
      // Always visible on the Progrès header; only disabled at 100%.
      M.completeAllBtn.hidden = false;
      M.completeAllBtn.disabled = fullyComplete;
    };
    M.syncResetAllButton = function syncResetAllButton(progress) {
      if (progress.percent <= 0) {
        M.resetAllClearsCompleted = false;
      } else if (M.hasIncompleteItemProgress()) {
        // Incomplete progress returned — next × is pass 1 again.
        M.resetAllClearsCompleted = false;
      }
      var canReset = progress.percent > 0;
      M.resetAllBtn.hidden = !canReset;
      M.resetAllBtn.disabled = !canReset;
      M.resetAllBtn.classList.toggle('is-armed', !!M.resetAllClearsCompleted);
      if (M.resetAllClearsCompleted) {
        M.resetAllBtn.title = 'Invalider aussi les t\u00e2ches termin\u00e9es';
        M.resetAllBtn.setAttribute(
          'aria-label',
          'Remettre aussi les t\u00e2ches termin\u00e9es \u00e0 0\u00a0%'
        );
      } else {
        M.resetAllBtn.title = 'Tout invalider';
        M.resetAllBtn.setAttribute(
          'aria-label',
          'Remettre le progr\u00e8s \u00e0 0\u00a0% (conserve les t\u00e2ches termin\u00e9es)'
        );
      }
    };
    M.completeAllTasks = function completeAllTasks() {
      var progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
      if (progress.percent >= 100 || S.isAllCompleteProgress(progress)) {
        return;
      }
      M.resetAllClearsCompleted = false;
      if (typeof M.CT.markFullyComplete === 'function') {
        M.data = M.CT.markFullyComplete(M.data);
      } else if (M.data.items.length) {
        M.data.items = M.CT.applyMasterProgress(M.data.items, 100, M.linkedSnapshots);
        M.data.progress = 100;
      } else {
        M.data.progress = 100;
      }
      S.playCompletionUiSound('complete_all');
      M.emitChange();
      M.onResize();
    };
    M.resetAllTasks = function resetAllTasks() {
      var progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
      if (progress.percent <= 0) return;

      if (M.data.items.length) {
        if (!M.resetAllClearsCompleted) {
          // Pass 1: zero incomplete items only; leave done tasks alone.
          var changed = false;
          for (var i = 0; i < M.data.items.length; i++) {
            var item = M.data.items[i];
            if (!item.done && M.CT.itemProgress(item) > 0) {
              M.setItemProgress(item, 0);
              changed = true;
            }
          }
          M.resetAllClearsCompleted = M.hasCompletedTasks();
          if (!changed && !M.resetAllClearsCompleted) return;
          if (!changed && M.resetAllClearsCompleted) {
            // Armed for a second click; no data change yet.
            S.playCompletionUiSound('reset_arm');
            M.syncResetAllButton(M.CT.computeCardProgress(M.data, M.linkedSnapshots));
            return;
          }
          S.playCompletionUiSound('reset');
        } else {
          // Pass 2: also clear completed tasks.
          for (var j = 0; j < M.data.items.length; j++) {
            M.setItemProgress(M.data.items[j], 0);
          }
          M.resetAllClearsCompleted = false;
          S.playCompletionUiSound('reset_all');
        }
      } else {
        var cardProgress = M.CT.clampProgress(M.data.progress);
        if (!M.resetAllClearsCompleted) {
          if (cardProgress > 0 && cardProgress < 100) {
            M.data.progress = 0;
            M.resetAllClearsCompleted = false;
            S.playCompletionUiSound('reset');
          } else if (cardProgress >= 100) {
            M.resetAllClearsCompleted = true;
            S.playCompletionUiSound('reset_arm');
            M.syncResetAllButton(progress);
            return;
          } else {
            return;
          }
        } else {
          M.data.progress = 0;
          M.resetAllClearsCompleted = false;
          S.playCompletionUiSound('reset_all');
        }
      }

      M.emitChange();
      M.onResize();
    };
    M.syncMasterEstimateChip = function syncMasterEstimateChip() {
      var scales = M.currentEstimateScales();
      var progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
      var fullyComplete =
        progress &&
        (progress.percent >= 100 || S.isAllCompleteProgress(progress));
      // Hide Estimer once the task is done — no remaining effort to size.
      M.masterEstimateChip.el.hidden = !!fullyComplete;
      if (fullyComplete) {
        if (typeof M.masterEstimateChip.el._tpCloseEstimate === 'function') {
          M.masterEstimateChip.el._tpCloseEstimate();
        } else {
          S.closeOpenEstimatePopovers();
        }
        return;
      }
      var total = M.CT.computeEstimatedTotal(M.data, M.linkedSnapshots);
      var remaining = M.CT.computeEstimatedRemaining(M.data, M.linkedSnapshots);
      var chipScales =
        typeof M.masterEstimateChip.getScales === 'function'
          ? M.masterEstimateChip.getScales()
          : null;
      var scalesChanged =
        !chipScales ||
        chipScales.length !== scales.length ||
        scales.some(function (id, i) {
          return chipScales[i] !== id;
        });
      if (scalesChanged) {
        if (typeof M.masterEstimateChip.setScales === 'function') {
          M.masterEstimateChip.setScales(scales);
        } else if (typeof M.masterEstimateChip.setScale === 'function') {
          M.masterEstimateChip.setScale(scales[0]);
        }
      }
      M.masterEstimateChip.setMinutes(total);
      if (typeof M.masterEstimateChip.setClearable === 'function') {
        // With subtasks the total is a rollup — clear each row instead.
        M.masterEstimateChip.setClearable(!M.data.items.length);
      }
      M.masterEstimateChip.setAdjusted(
        !!(
          M.data.items.length &&
          typeof M.data.estimatedMinutesOffset === 'number' &&
          M.data.estimatedMinutesOffset !== 0
        )
      );
      var totalLabel =
        total == null
          ? ''
          : M.CT.formatEstimateForScales
            ? M.CT.formatEstimateForScales(total, scales)
            : M.CT.formatEstimateForScale
              ? M.CT.formatEstimateForScale(total, scales[0])
              : M.CT.formatEstimatedMinutesCompact(total);
      var emptyTitle =
        M.CT.getEstimateScale(scales[0]).emptyTitle || 'D\u00e9finir une dur\u00e9e estim\u00e9e';
      M.masterEstimateChip.chip.title =
        total == null
          ? emptyTitle
          : remaining != null && remaining !== total
            ? totalLabel +
              ' au total \u00b7 ' +
              M.CT.formatEstimatedRemainingLabel(remaining, scales)
            : totalLabel + ' au total';
    };
    M.updateProgressUi = function updateProgressUi(opts) {
      opts = opts || {};
      var progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
      var anyBlocked = M.CT.hasAnyBlocked(M.data);
      var accent = anyBlocked
        ? M.BLOCKED_ACCENT
        : S.completionColorForProgress(progress.percent);
      if (M.masterSlider.valEl) {
        M.masterSlider.valEl.style.color =
          anyBlocked || progress.percent > 0 ? accent : '';
      }
      var scrubbing = !!(opts.skipMasterSync || M.masterDragging);
      var encouragementPct =
        opts.scrubPercent != null && isFinite(Number(opts.scrubPercent))
          ? Number(opts.scrubPercent)
          : scrubbing
            ? Number(M.masterSlider.input.value)
            : progress.percent;
      if (M.encouragementBubbleVisible) {
        S.applyProgressEncouragement(M.encouragementEl, encouragementPct);
      }
      M.progressPanel.style.setProperty(
        '--completion-hero-accent',
        anyBlocked || progress.percent > 0
          ? accent
          : 'var(--tp-border-strong)'
      );
      M.progressPanel.classList.toggle('is-complete', progress.percent >= 100);
      M.progressPanel.classList.toggle('has-progress', progress.percent > 0);
      M.applyProgressSectionTint(
        M.progressShellEl,
        anyBlocked ? M.BLOCKED_ACCENT : accent
      );
      M.syncMasterEstimateChip();
      M.syncMasterBlockedBtn();
      M.syncMasterCheckButton(progress);
      M.syncCompleteAllButton(progress);
      M.syncResetAllButton(progress);
      if (!scrubbing) {
        M.masterSlider.setValue(progress.percent);
      } else {
        // Keep fill locked to the handle while dragging. Weighted average after
        // applyMasterProgress can round/clamp away from the pointer value.
        S.applySliderProgressTrack(
          M.masterSlider.input,
          Number(M.masterSlider.input.value),
          { blocked: anyBlocked }
        );
      }
      S.applySliderProgressTrack(M.masterSlider.input, Number(M.masterSlider.input.value), {
        blocked: anyBlocked
      });
      M.masterSlider.input.classList.toggle(
        'is-complete',
        Number(M.masterSlider.input.value) >= 100
      );
      // Only clear the drag flag when this refresh is not part of a scrub —
      // otherwise async onChange refreshes can fight the live handle value.
      if (!scrubbing) {
        M.masterDragging = false;
      }
      M.syncAllCompleteSideEffects(progress, opts);
    };
    M.applyProgressSectionTint = function applyProgressSectionTint(shellEl, accent) {
      if (!shellEl) return;
      var field =
        shellEl.classList && shellEl.classList.contains('field--progress')
          ? shellEl
          : shellEl.querySelector
            ? shellEl.querySelector('.field--progress')
            : null;
      var target = field || shellEl;
      if (accent) {
        target.style.setProperty('--section-glow', accent);
        target.classList.add('has-section-glow');
        shellEl.classList.add('has-progress-tint');
      } else {
        target.style.removeProperty('--section-glow');
        target.classList.remove('has-section-glow');
        shellEl.classList.remove('has-progress-tint');
      }
    };
    M.syncAllCompleteSideEffects = function syncAllCompleteSideEffects(progress, opts) {
      opts = opts || {};
      var allComplete = S.isAllCompleteProgress(progress);
      if (M.progressShellEl) {
        M.progressShellEl.classList.toggle('is-progress-complete', allComplete);
      }
      M.containerEl.classList.toggle('is-all-complete', allComplete);

      var edgeIntoComplete = M.lastAllComplete === false && allComplete;
      if (edgeIntoComplete) {
        S.playAllCompleteCelebration(M.celebrateRootEl || document.body);
        // Reveal completed subtasks so the list is not empty at 100%.
        if (M.data.items.length && !M.showCompleted) {
          M.showCompleted = true;
          S.saveShowDonePreference(true);
          M.showDoneToggle.setAttribute('aria-expanded', 'true');
          // Sliders defer rebuild until change/emitChange (avoid tearing mid-drag).
          if (!opts.deferDoneListReveal) {
            M.renderList();
            M.onResize();
          }
        }
      } else if (!allComplete) {
        S.clearAllCompleteCelebration(M.celebrateRootEl || document.body);
      }

      if (M.lastAllComplete !== allComplete) {
        M.lastAllComplete = allComplete;
        if (M.onAllCompleteChange) {
          try {
            M.onAllCompleteChange(allComplete, {
              justCompleted: edgeIntoComplete,
              progress: progress,
              data: M.CT.normalizeCompletionData(M.data),
            });
          } catch (err) {
            console.error('Completion onAllCompleteChange failed', err);
          }
        }
      }
    };
    M.clearFlipStyles = function clearFlipStyles(el) {
      if (!el) return;
      el.classList.remove('is-flipping');
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
      el.style.zIndex = '';
      el.style.willChange = '';
    };
    M.playFlipTo = function playFlipTo(el, firstRect) {
      if (!el || !firstRect || S.prefersReducedMotion()) return;
      var last = el.getBoundingClientRect();
      var dx = firstRect.left - last.left;
      var dy = firstRect.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      var token = ++M.flipAnimToken;
      el.classList.add('is-flipping');
      el.style.willChange = 'transform, opacity';
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      el.style.opacity = '0.92';
      el.style.zIndex = '2';
      // Force layout so the invert frame sticks before animating.
      void el.offsetWidth;
      el.style.transition =
        'transform ' + S.FLIP_MS + 'ms ' + S.FLIP_EASING +
        ', opacity ' + S.FLIP_MS + 'ms ' + S.FLIP_EASING;
      el.style.transform = 'translate(0, 0)';
      el.style.opacity = '1';

      var settled = false;
      function finish() {
        if (settled || token !== M.flipAnimToken) return;
        settled = true;
        el.removeEventListener('transitionend', onEnd);
        M.clearFlipStyles(el);
        M.onResize();
      }
      function onEnd(e) {
        if (e.target !== el || (e.propertyName && e.propertyName !== 'transform')) return;
        finish();
      }
      el.addEventListener('transitionend', onEnd);
      setTimeout(finish, S.FLIP_MS + 80);
    };
    M.captureItemRect = function captureItemRect(id) {
      var row = M.findItemRow(id);
      return row ? row.getBoundingClientRect() : null;
    };
    M.renderListWithFlip = function renderListWithFlip(itemId, wasDone) {
      var firstRect = M.captureItemRect(itemId);
      var becomingDone = !wasDone;
      var doneCount = M.data.items.filter(function (item) {
        return item.done;
      }).length;

      // Skip FLIP when the completed list is hidden (item simply leaves the active list).
      if (becomingDone && !M.shouldShowDoneList(doneCount)) {
        firstRect = null;
      }

      M.renderList();

      if (!itemId || !firstRect || S.prefersReducedMotion()) {
        M.onResize();
        return;
      }

      var nextRow = M.findItemRow(itemId);
      if (!nextRow) {
        M.onResize();
        return;
      }
      M.playFlipTo(nextRow, firstRect);
    };
    M.setItemProgress = function setItemProgress(item, progress) {
      if (!item || !item.id) return;
      if (typeof M.CT.applyItemProgress === 'function') {
        M.data = M.CT.applyItemProgress(M.data, item.id, progress);
        var live = M.findLiveItem(item.id);
        if (live) {
          item.progress = live.progress;
          item.done = live.done;
          if (live.items && live.items.length) item.items = live.items;
          else delete item.items;
          return;
        }
      }
      item.progress = M.CT.clampProgress(progress);
      M.CT.syncDoneFromProgress(item);
    };
    M.openLinkedCard = function openLinkedCard(cardId) {
      if (!cardId || !M.onOpenLinkedCard) return;
      try {
        M.onOpenLinkedCard(cardId);
      } catch (err) {
        console.error('Completion open linked card failed', err);
      }
    };
    M.linkedIdsAlreadyUsed = function linkedIdsAlreadyUsed() {
      var used = Object.create(null);
      if (M.currentCardId) used[M.currentCardId] = true;
      M.data.items.forEach(function (item) {
        var id = M.CT.itemLinkedCardId(item);
        if (id) used[id] = true;
      });
      return used;
    };
    M.setLinkStatus = function setLinkStatus(text, visible) {
      if (!M.linkStatusEl) return;
      if (!visible || !text) {
        M.linkStatusEl.hidden = true;
        M.linkStatusEl.textContent = '';
        return;
      }
      M.linkStatusEl.hidden = false;
      M.linkStatusEl.textContent = text;
    };
    M.renderLinkPickerList = function renderLinkPickerList(cards, query) {
      if (!M.linkListEl) return;
      M.linkListEl.replaceChildren();
      var used = M.linkedIdsAlreadyUsed();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      var matches = (cards || []).filter(function (card) {
        if (!card || !card.id || used[card.id]) return false;
        if (!q) return true;
        var name = String(card.name || '').toLowerCase();
        var list = String(card.list || '').toLowerCase();
        return name.indexOf(q) !== -1 || list.indexOf(q) !== -1;
      });
      if (!matches.length) {
        M.setLinkStatus(
          q ? 'Aucune carte ne correspond.' : 'Aucune autre carte disponible.',
          true
        );
        return;
      }
      M.setLinkStatus('', false);
      matches.slice(0, 40).forEach(function (card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tp-completion-link-option';
        btn.setAttribute('role', 'listitem');
        btn.dataset.cardId = card.id;
        var label = document.createElement('span');
        label.className = 'tp-completion-link-option-name';
        label.textContent = card.name || 'Carte';
        btn.appendChild(label);
        if (card.list) {
          var meta = document.createElement('span');
          meta.className = 'tp-completion-link-option-list';
          meta.textContent = card.list;
          btn.appendChild(meta);
        }
        btn.title = 'Lier\u00a0: ' + (card.name || 'Carte');
        btn.addEventListener('click', function () {
          M.addLinkedCard(card);
        });
        M.linkListEl.appendChild(btn);
      });
    };
    M.ensureBoardCards = function ensureBoardCards() {
      if (M.boardCardsCache) return Promise.resolve(M.boardCardsCache);
      if (!M.getBoardCards) return Promise.resolve([]);
      return Promise.resolve()
        .then(function () {
          return M.getBoardCards();
        })
        .then(function (cards) {
          M.boardCardsCache = Array.isArray(cards) ? cards : [];
          return M.boardCardsCache;
        })
        .catch(function (err) {
          console.error('Completion board cards load failed', err);
          M.boardCardsCache = [];
          return M.boardCardsCache;
        });
    };
    M.openLinkPicker = function openLinkPicker() {
      if (!M.linkPickerEl || !M.getBoardCards) return;
      M.linkPickerOpen = true;
      M.linkPickerEl.hidden = false;
      if (M.linkBtn) M.linkBtn.setAttribute('aria-expanded', 'true');
      M.setLinkStatus('Chargement des cartes\u2026', true);
      if (M.linkListEl) M.linkListEl.replaceChildren();
      M.ensureBoardCards().then(function (cards) {
        if (!M.linkPickerOpen) return;
        M.renderLinkPickerList(cards, M.linkSearchInput ? M.linkSearchInput.value : '');
        M.onResize();
        if (M.linkSearchInput) {
          try {
            M.linkSearchInput.focus();
          } catch (e) { /* ignore */ }
        }
      });
      M.onResize();
    };
    M.closeLinkPicker = function closeLinkPicker() {
      M.linkPickerOpen = false;
      if (M.linkPickerEl) M.linkPickerEl.hidden = true;
      if (M.linkBtn) M.linkBtn.setAttribute('aria-expanded', 'false');
      if (M.linkSearchInput) M.linkSearchInput.value = '';
      M.setLinkStatus('', false);
      if (M.linkListEl) M.linkListEl.replaceChildren();
      M.onResize();
    };
    M.toggleLinkPicker = function toggleLinkPicker() {
      if (M.linkPickerOpen) M.closeLinkPicker();
      else M.openLinkPicker();
    };
    M.refreshLinkedTree = function refreshLinkedTree(opts) {
      opts = opts || {};
      if (!M.resolveLinkedTree) {
        M.linkedTreeByItemId = Object.create(null);
        if (opts.rerender !== false) {
          M.renderList();
          M.updateProgressUi();
        }
        return Promise.resolve(null);
      }
      var seq = ++M.linkedResolveSeq;
      return Promise.resolve()
        .then(function () {
          return M.resolveLinkedTree(M.CT.normalizeCompletionData(M.data));
        })
        .then(function (resolved) {
          if (seq !== M.linkedResolveSeq) return null;
          M.linkedTreeByItemId =
            resolved && resolved.byItemId
              ? resolved.byItemId
              : Object.create(null);
          M.linkedSnapshots =
            resolved && resolved.snapshots
              ? resolved.snapshots
              : Object.create(null);
          // Always re-apply snapshots onto CURRENT data. resolved.data is a
          // snapshot from resolve start — using it would wipe estimates (or
          // other local edits) applied while the board scan was in flight.
          if (
            resolved &&
            typeof M.CT.applyLinkedSnapshots === 'function' &&
            M.linkedSnapshots
          ) {
            var prev = JSON.stringify(M.CT.normalizeCompletionData(M.data));
            var merged = M.CT.applyLinkedSnapshots(M.data, M.linkedSnapshots);
            var persisted = M.applyNormalizedKeepingDrafts(merged);
            if (JSON.stringify(persisted) !== prev && !opts.skipPersist) {
              M.onChange(persisted);
            }
          }
          if (opts.rerender !== false) {
            M.renderList();
            M.updateProgressUi();
            M.onResize();
          }
          if (M.onLinkedTreeChange) {
            try {
              M.onLinkedTreeChange(M.linkedTreeByItemId);
            } catch (cbErr) {
              console.error('Completion onLinkedTreeChange failed', cbErr);
            }
          }
          return resolved;
        })
        .catch(function (err) {
          console.error('Completion linked tree resolve failed', err);
          return null;
        });
    };
    },
    run: function (M) {
    if (M.selectAllCheckbox) {
      M.selectAllCheckbox.addEventListener('change', function () {
        var on = !!M.selectAllCheckbox.checked;
        var visible = M.visibleSelectionEntries();
        M.selected = Object.create(null);
        if (on) {
          for (var i = 0; i < visible.length; i++) {
            M.selected[visible[i].key] = true;
          }
        }
        M.renderBulkBar();
        M.renderList();
      });
    }
    if (M.bulkDoneBtn) {
      M.bulkDoneBtn.addEventListener('click', function () {
        M.runBulk('done');
      });
    }
    if (M.bulkReopenBtn) {
      M.bulkReopenBtn.addEventListener('click', function () {
        M.runBulk('reopen');
      });
    }
    if (M.bulkDeleteBtn) {
      M.bulkDeleteBtn.addEventListener('click', function (e) {
        M.runBulk('delete', e);
      });
    }
    if (M.bulkClearBtn) {
      M.bulkClearBtn.addEventListener('click', function () {
        M.clearSelection();
      });
    }
    M.bulkBarEl = M.containerEl.querySelector('#completionBulkBar');
    if (
      M.bulkBarEl &&
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildBulkActionItems === 'function'
    ) {
      ContextMenu.bind(M.bulkBarEl, function () {
        var n = Object.keys(M.selected).length;
        return ContextMenu.buildBulkActionItems({
          count: n,
          onDone: function () {
            M.runBulk('done');
          },
          onReopen: function () {
            M.runBulk('reopen');
          },
          onDelete: function () {
            M.runBulk('delete');
          },
          onClear: M.clearSelection,
          onSelectAll: function () {
            var visible = M.visibleSelectionEntries();
            M.selected = Object.create(null);
            for (var i = 0; i < visible.length; i++) {
              M.selected[visible[i].key] = true;
            }
            M.renderBulkBar();
            M.renderList();
          },
        });
      });
    }
    M.suppressEmptyDraftDiscard = false;
    M.suppressEmptyDraftDiscardTimer = null;
    M.resetAllClearsCompleted = false;
    M.completeAllBtn.addEventListener('click', M.completeAllTasks);
    M.resetAllBtn.addEventListener('click', M.resetAllTasks);
    M.masterBlockedBtn.addEventListener('click', M.toggleMasterBlocked);
    M.masterCheckBtn.addEventListener('click', M.toggleMasterComplete);
    if (
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildCompletionMasterItems === 'function'
    ) {
      ContextMenu.bind(M.progressPanel, function (e) {
        // Only chrome / head — not individual task rows (they have their own menus).
        var t = e && e.target;
        if (
          t &&
          typeof t.closest === 'function' &&
          t.closest('.tp-completion-item, .tp-completion-checklist-item')
        ) {
          return [];
        }
        var snap = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
        return ContextMenu.buildCompletionMasterItems({
          done: !!(snap && snap.percent >= 100),
          blocked: M.CT.hasAnyBlocked(M.data) || !!M.data.blocked,
          onToggleComplete: M.toggleMasterComplete,
          onToggleBlocked: M.toggleMasterBlocked,
          onCompleteAll: M.completeAllTasks,
          onResetAll: M.resetAllTasks,
          onFocusAdd: function () {
            try {
              M.addInput.focus();
            } catch (err) { /* ignore */ }
          },
        });
      });
    }
    S.bindProgressFader(M.masterCheckBtn, {
      getProgress: function () {
        return M.CT.computeCardProgress(M.data, M.linkedSnapshots).percent;
      },
      setProgress: function (p, meta) {
        M.masterDragging = !meta.commit;
        if (M.data.items.length) {
          M.data.items = M.CT.applyMasterProgress(M.data.items, p, M.linkedSnapshots);
          M.syncItemSlidersFromData();
        } else {
          M.data.progress = p;
        }
        S.playSliderProgressTick(p);
        if (M.encouragementBubbleVisible) {
          S.applyProgressEncouragement(M.encouragementEl, p);
        }
        M.updateProgressUi({
          skipMasterSync: true,
          scrubPercent: p,
          deferDoneListReveal: true,
        });
        M.onChange(M.CT.normalizeCompletionData(M.data));
        if (meta.commit) {
          M.masterDragging = false;
          M.hideEncouragementBubble();
          var start = meta.startProgress;
          if (p >= 100 && start < 100) {
            S.playCompletionUiSound('complete_all');
          } else if (p < 100 && start >= 100) {
            S.playCompletionUiSound('uncomplete');
          }
          if (M.data.items.length) {
            M.renderList();
            M.onResize();
          }
        }
      },
    });
    if (M.linkBtn) {
      if (!M.getBoardCards) {
        M.linkBtn.hidden = true;
      } else {
        M.linkBtn.addEventListener('click', function () {
          M.toggleLinkPicker();
        });
      }
    }
    if (M.linkSearchInput) {
      M.linkSearchInput.addEventListener('input', function () {
        M.ensureBoardCards().then(function (cards) {
          if (!M.linkPickerOpen) return;
          M.renderLinkPickerList(cards, M.linkSearchInput.value);
          M.onResize();
        });
      });
    }
    }
  });
})(typeof window !== 'undefined' ? window : this);
