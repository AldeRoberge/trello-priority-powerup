/**
 * completion-ui: mountCompletionUI() part 1 of 4.
 * The body of mountCompletionUI runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see completion-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});
  var P = (global.CompletionUiPartsMountMountCompletionUI = global.CompletionUiPartsMountMountCompletionUI || { list: [] });

  P.list.push({
    define: function (M) {
    M.spellcheckText = function spellcheckText(text) {
      var trimmed = (text || '').trim();
      if (!trimmed) return Promise.resolve('');
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    };
    M.currentEstimateScales = function currentEstimateScales() {
      return M.estimateScales.slice();
    };
    M.applyEstimateScales = function applyEstimateScales(nextScales, opts) {
      opts = opts || {};
      M.estimateScales =
        typeof M.CT.normalizeEstimateScales === 'function'
          ? M.CT.normalizeEstimateScales(nextScales)
          : Array.isArray(nextScales)
            ? nextScales.slice()
            : ['time'];
      if (M.progressPanel) {
        M.progressPanel.dataset.estimateScales = M.estimateScales.join(',');
      }
      if (M.masterEstimateChip && typeof M.masterEstimateChip.setScales === 'function') {
        M.masterEstimateChip.setScales(M.estimateScales);
      } else if (M.masterEstimateChip && typeof M.masterEstimateChip.setScale === 'function') {
        M.masterEstimateChip.setScale(M.estimateScales[0]);
      }
      if (opts.rerender !== false) M.renderList();
      M.updateProgressUi();
      M.onResize();
    };
    M.showEncouragementBubble = function showEncouragementBubble(clientX, clientY, percent) {
      if (percent != null) S.applyProgressEncouragement(M.encouragementEl, percent);
      M.encouragementEl.hidden = false;
      M.encouragementEl.setAttribute('aria-hidden', 'false');
      M.encouragementBubbleVisible = true;
      if (clientX != null && clientY != null) {
        S.positionEncouragementBubble(M.encouragementEl, clientX, clientY);
      }
    };
    M.moveEncouragementBubble = function moveEncouragementBubble(clientX, clientY, percent) {
      if (!M.encouragementBubbleVisible) return;
      if (percent != null) S.applyProgressEncouragement(M.encouragementEl, percent);
      S.positionEncouragementBubble(M.encouragementEl, clientX, clientY);
    };
    M.hideEncouragementBubble = function hideEncouragementBubble() {
      M.encouragementBubbleVisible = false;
      M.encouragementPointerId = null;
      M.encouragementEl.hidden = true;
      M.encouragementEl.setAttribute('aria-hidden', 'true');
    };
    M.onEncouragementPointerMove = function onEncouragementPointerMove(event) {
      if (
        M.encouragementPointerId != null &&
        event.pointerId !== M.encouragementPointerId
      ) {
        return;
      }
      // Prefer the live range value so the label tracks the handle even when
      // weighted progress lags behind the pointer during scrubbing.
      var livePct =
        M.masterSlider && M.masterSlider.input
          ? Number(M.masterSlider.input.value)
          : null;
      M.moveEncouragementBubble(event.clientX, event.clientY, livePct);
    };
    M.onEncouragementPointerEnd = function onEncouragementPointerEnd(event) {
      if (
        M.encouragementPointerId != null &&
        event.pointerId !== M.encouragementPointerId
      ) {
        return;
      }
      M.hideEncouragementBubble();
      window.removeEventListener('pointermove', M.onEncouragementPointerMove, true);
      window.removeEventListener('pointerup', M.onEncouragementPointerEnd, true);
      window.removeEventListener('pointercancel', M.onEncouragementPointerEnd, true);
    };
    M.armEncouragementBubbleFollow = function armEncouragementBubbleFollow(event, percent) {
      window.removeEventListener('pointermove', M.onEncouragementPointerMove, true);
      window.removeEventListener('pointerup', M.onEncouragementPointerEnd, true);
      window.removeEventListener('pointercancel', M.onEncouragementPointerEnd, true);
      M.encouragementPointerId =
        event && event.pointerId != null ? event.pointerId : null;
      S.resetSliderProgressSoundTier(percent);
      M.showEncouragementBubble(
        event ? event.clientX : null,
        event ? event.clientY : null,
        percent
      );
      window.addEventListener('pointermove', M.onEncouragementPointerMove, true);
      window.addEventListener('pointerup', M.onEncouragementPointerEnd, true);
      window.addEventListener('pointercancel', M.onEncouragementPointerEnd, true);
    };
    M.syncMasterTitleUi = function syncMasterTitleUi(options) {
      options = options || {};
      if (!M.masterTitleEl) return;
      var editable = !!M.onTitleChange;
      var show = !!(M.masterTitle || editable);
      M.masterTitleEl.hidden = !show;
      if (!show) return;
      if (
        editable &&
        !options.force &&
        (M.masterTitleDirty || document.activeElement === M.masterTitleEl)
      ) {
        return;
      }
      if (editable) {
        M.masterTitleEl.value = M.masterTitle;
        M.masterTitleEl.title = M.masterTitle
          ? 'Cliquer pour modifier le titre'
          : 'Cliquer pour d\u00e9finir le titre';
        M.masterTitleEl.classList.toggle('is-empty', !M.masterTitle);
      } else {
        M.masterTitleEl.textContent = M.masterTitle;
        if (M.masterTitle) M.masterTitleEl.title = M.masterTitle;
        else M.masterTitleEl.removeAttribute('title');
      }
    };
    M.flushMasterTitleSave = function flushMasterTitleSave() {
      if (!M.onTitleChange || !M.masterTitleDirty || M.masterTitleBusy) {
        return Promise.resolve();
      }
      var next = (M.masterTitleEl.value || '').trim();
      if (!next) {
        M.masterTitleEl.value = M.masterTitle || '';
        M.masterTitleDirty = false;
        M.masterTitleEl.classList.toggle('is-empty', !M.masterTitle);
        M.masterTitleEl.title = 'Le titre ne peut pas \u00eatre vide';
        M.onResize();
        return Promise.resolve({ ok: false, reason: 'empty-name', changed: false });
      }
      if (next === M.masterTitle) {
        M.masterTitleDirty = false;
        M.masterTitleEl.value = next;
        M.masterTitleEl.classList.remove('is-empty');
        return Promise.resolve({ ok: true, changed: false, name: next });
      }
      var previous = M.masterTitle;
      M.masterTitleBusy = true;
      M.masterTitleDirty = false;
      M.masterTitleEl.classList.add('is-saving');
      M.masterTitleEl.title = 'Enregistrement\u2026';
      return Promise.resolve(M.onTitleChange(next))
        .then(function (result) {
          M.masterTitleBusy = false;
          M.masterTitleEl.classList.remove('is-saving');
          if (result && result.ok === false) {
            M.masterTitle = previous;
            M.masterTitleEl.value = previous || '';
            if (result.reason === 'empty-name') {
              M.masterTitleEl.title = 'Le titre ne peut pas \u00eatre vide';
            } else if (
              result.reason === 'not-authorized' ||
              result.reason === 'no-app-key'
            ) {
              M.masterTitleEl.title =
                'Autorisez Trello dans Infos pour enregistrer le titre';
            } else {
              M.masterTitleEl.title = '\u00c9chec de l\u2019enregistrement';
            }
            M.masterTitleEl.classList.toggle('is-empty', !M.masterTitle);
            return result;
          }
          M.masterTitle = next;
          M.masterTitleEl.value = next;
          M.masterTitleEl.classList.remove('is-empty');
          M.masterTitleEl.title = 'Cliquer pour modifier le titre';
          M.onResize();
          return result;
        })
        .catch(function (err) {
          M.masterTitleBusy = false;
          M.masterTitleDirty = false;
          M.masterTitle = previous;
          M.masterTitleEl.value = previous || '';
          M.masterTitleEl.classList.remove('is-saving');
          M.masterTitleEl.classList.toggle('is-empty', !M.masterTitle);
          console.error('Completion master title save failed', err);
          M.masterTitleEl.title = '\u00c9chec de l\u2019enregistrement';
          return { ok: false, reason: 'error', changed: false };
        });
    };
    M.createBlockedMotifField = function createBlockedMotifField(opts) {
      opts = opts || {};
      if (
        !global.PriorityUI ||
        typeof global.PriorityUI.createEnAttenteField !== 'function'
      ) {
        return null;
      }
      var mount = document.createElement('div');
      mount.className = opts.className || 'tp-completion-item-motif';
      var fieldApi = global.PriorityUI.createEnAttenteField({
        el: mount,
        embedded: true,
        hideSubtaskPicker: true,
        value: true,
        blockedReasons: opts.blockedReasons || [],
        blockedLinks: [],
        getSubtasks: function () {
          return [];
        },
        onChange: function () {
          if (typeof opts.onChange !== 'function') return;
          opts.onChange(fieldApi.getBlockedReasons());
        },
        onLayoutChange: function () {
          M.onResize();
        }
      });
      mount._motifField = fieldApi;
      return { el: mount, api: fieldApi };
    };
    M.syncBlockedMotifMount = function syncBlockedMotifMount(host, visible, reasons, onReasonsChange, className) {
      if (!host) return;
      var existing = host.querySelector(
        className === 'tp-completion-master-motif'
          ? '.tp-completion-master-motif'
          : '.tp-completion-item-motif'
      );
      if (!visible) {
        if (existing) existing.remove();
        return;
      }
      if (existing && existing._motifField) {
        existing._motifField.setBlockedReasons(reasons || []);
        return;
      }
      if (existing) existing.remove();
      var created = M.createBlockedMotifField({
        className: className || 'tp-completion-item-motif',
        blockedReasons: reasons || [],
        onChange: onReasonsChange
      });
      if (created) host.appendChild(created.el);
    };
    M.findItemRow = function findItemRow(id) {
      return M.containerEl.querySelector('.tp-completion-item[data-id="' + id + '"]');
    };
    M.focusItemTextInput = function focusItemTextInput(id) {
      var row = M.findItemRow(id);
      if (!row) return;
      var input = row.querySelector('.tp-completion-text');
      if (!input || typeof input.focus !== 'function') return;
      input.focus();
      var len = String(input.value || '').length;
      if (typeof input.setSelectionRange === 'function') {
        try {
          input.setSelectionRange(len, len);
        } catch (err) {
          /* ignore — some input types reject selection */
        }
      }
    };
    M.paintItemSpellchecking = function paintItemSpellchecking(itemId) {
      var li = M.findItemRow(itemId);
      if (!li) return;
      var on = !!M.spellcheckingItemIds[itemId];
      var textInput = li.querySelector('.tp-completion-text');
      if (textInput) {
        textInput.classList.toggle('is-spellchecking', on);
        textInput.setAttribute('aria-busy', on ? 'true' : 'false');
      }
      var mainRow = li.querySelector('.tp-completion-item-main');
      var spinner = li.querySelector('.tp-completion-spell-spinner');
      if (on) {
        if (!spinner && mainRow) {
          spinner = document.createElement('span');
          spinner.className = 'tp-completion-spell-spinner';
          spinner.setAttribute('aria-hidden', 'true');
          spinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
          var insertBefore =
            li.querySelector('.tp-completion-item-estimate') ||
            li.querySelector('.tp-completion-promote') ||
            li.querySelector('.tp-completion-blocked-btn') ||
            li.querySelector('.tp-completion-delete');
          mainRow.insertBefore(spinner, insertBefore || null);
        }
      } else if (spinner && spinner.parentNode) {
        spinner.parentNode.removeChild(spinner);
      }
    };
    M.spellcheckItemAfterCommit = function spellcheckItemAfterCommit(itemId, originalText, token) {
      var original = typeof originalText === 'string' ? originalText.trim() : '';
      if (!itemId || !original) return;
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        if (M.itemSpellTokens[itemId] === token) {
          delete M.spellcheckingItemIds[itemId];
          delete M.itemSpellTokens[itemId];
          M.paintItemSpellchecking(itemId);
          M.onResize();
        }
        return;
      }
      M.spellcheckText(original).then(function (corrected) {
        if (token != null && M.itemSpellTokens[itemId] !== token) return;
        delete M.spellcheckingItemIds[itemId];
        delete M.itemSpellTokens[itemId];
        var live = M.findLiveItem(itemId);
        if (!live) return;
        var next = (corrected || '').trim() || original;
        if (next === live.text) {
          M.paintItemSpellchecking(itemId);
          M.onResize();
          return;
        }
        live.text = next;
        var persisted = M.applyNormalizedKeepingDrafts(M.data);
        M.renderList();
        M.updateProgressUi();
        M.onChange(persisted);
        M.onResize();
        if (next !== original) {
          M.itemSpellReverts[itemId] = original;
          M.showItemSpellRevert(itemId, original);
        }
      });
    };
    M.clearSplitRevertTracking = function clearSplitRevertTracking(itemIds) {
      Object.keys(M.itemSplitReverts).forEach(function (key) {
        var entry = M.itemSplitReverts[key];
        if (!entry || !Array.isArray(entry.itemIds)) return;
        var overlap = (itemIds || []).some(function (id) {
          return entry.itemIds.indexOf(id) >= 0 || key === id;
        });
        if (overlap) delete M.itemSplitReverts[key];
      });
    };
    M.applySplitReplace = function applySplitReplace(sourceItemId, originalText, titles) {
      var idx = -1;
      for (var i = 0; i < M.data.items.length; i++) {
        if (M.data.items[i].id === sourceItemId) {
          idx = i;
          break;
        }
      }
      if (idx < 0 || !titles || titles.length < 2) return null;
      var newItems = [];
      for (var t = 0; t < titles.length; t++) {
        var text = String(titles[t] || '').trim();
        if (!text) continue;
        var rawItem = {
          id: M.CT.generateId(),
          text: text,
          progress: 0
        };
        var item = M.CT.normalizeItem(rawItem);
        if (item) newItems.push(item);
      }
      if (newItems.length < 2) return null;
      delete M.itemSpellReverts[sourceItemId];
      delete M.spellcheckingItemIds[sourceItemId];
      delete M.itemSpellTokens[sourceItemId];
      delete M.estimatingItemIds[sourceItemId];
      delete M.linkedTreeByItemId[sourceItemId];
      M.clearSplitRevertTracking([sourceItemId]);
      M.data.items.splice.apply(M.data.items, [idx, 1].concat(newItems));
      newItems.forEach(function (row) {
        M.removeSuggestionMatch(row.text);
      });
      var newIds = newItems.map(function (row) {
        return row.id;
      });
      M.itemSplitReverts[newIds[0]] = {
        originalText: originalText,
        itemIds: newIds.slice()
      };
      S.playCompletionUiSound('add');
      M.emitChange();
      M.onResize();
      return newIds;
    };
    M.showItemSplitRevert = function showItemSplitRevert(anchorItemId) {
      var entry = M.itemSplitReverts[anchorItemId];
      if (
        !entry ||
        !entry.originalText ||
        !Array.isArray(entry.itemIds) ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        return;
      }
      var li = M.findItemRow(anchorItemId);
      if (!li) return;
      var mainRow = li.querySelector('.tp-completion-item-main');
      var del = li.querySelector('.tp-completion-delete');
      if (!mainRow) return;
      var count = entry.itemIds.length;
      global.Spellcheck.attachRevert(mainRow, {
        className: 'tp-completion-spell-revert tp-completion-split-revert',
        before: del,
        previous: entry.originalText,
        ariaLabel:
          'Annuler la s\u00e9paration en ' +
          count +
          ' t\u00e2ches',
        title:
          'Annuler la s\u00e9paration \u2014 restaurer\u00a0: ' +
          (typeof global.Spellcheck.revertLabel === 'function'
            ? global.Spellcheck.revertLabel(entry.originalText)
            : entry.originalText),
        onRevert: function () {
          if (M.itemSplitReverts[anchorItemId] !== entry) return;
          var still = entry.itemIds.filter(function (id) {
            return !!M.findLiveItem(id);
          });
          if (!still.length) {
            delete M.itemSplitReverts[anchorItemId];
            return;
          }
          var insertAt = M.data.items.length;
          for (var i = 0; i < M.data.items.length; i++) {
            if (still.indexOf(M.data.items[i].id) >= 0) {
              insertAt = i;
              break;
            }
          }
          M.data.items = M.data.items.filter(function (row) {
            return still.indexOf(row.id) < 0;
          });
          var restored = M.CT.normalizeItem({
            id: M.CT.generateId(),
            text: entry.originalText,
            progress: 0
          });
          if (restored) {
            M.data.items.splice(insertAt, 0, restored);
          }
          delete M.itemSplitReverts[anchorItemId];
          S.playCompletionUiSound('undo');
          M.emitChange();
          M.onResize();
        },
        onDismiss: function () {
          if (M.itemSplitReverts[anchorItemId] === entry) {
            delete M.itemSplitReverts[anchorItemId];
          }
        }
      });
    };
    M.refineItemAfterCommit = function refineItemAfterCommit(itemId, originalText) {
      var original = typeof originalText === 'string' ? originalText.trim() : '';
      if (!itemId || !original) return;
      var token = (M.itemSpellTokens[itemId] || 0) + 1;
      M.itemSpellTokens[itemId] = token;
      M.spellcheckingItemIds[itemId] = true;
      M.paintItemSpellchecking(itemId);
      M.onResize();

      var splitPromise =
        M.splitTaskTitleFn &&
        (typeof global.PriorityAgent === 'undefined' ||
          typeof global.PriorityAgent.titleMayBeCompound !== 'function' ||
          global.PriorityAgent.titleMayBeCompound(original))
          ? Promise.resolve()
              .then(function () {
                return M.splitTaskTitleFn(original);
              })
              .catch(function (err) {
                console.error('splitTaskTitle failed', err);
                return null;
              })
          : Promise.resolve(null);

      splitPromise.then(function (splitResult) {
        if (M.itemSpellTokens[itemId] !== token) return;
        var live = M.findLiveItem(itemId);
        if (!live) {
          delete M.spellcheckingItemIds[itemId];
          delete M.itemSpellTokens[itemId];
          return;
        }
        // User already edited away from the committed text — don't split.
        if ((live.text || '').trim() !== original) {
          delete M.spellcheckingItemIds[itemId];
          delete M.itemSpellTokens[itemId];
          M.paintItemSpellchecking(itemId);
          M.onResize();
          return;
        }
        if (
          splitResult &&
          splitResult.shouldSplit === true &&
          Array.isArray(splitResult.tasks) &&
          splitResult.tasks.length >= 2
        ) {
          delete M.spellcheckingItemIds[itemId];
          delete M.itemSpellTokens[itemId];
          M.applySplitReplace(itemId, original, splitResult.tasks);
          return;
        }
        M.spellcheckItemAfterCommit(itemId, original, token);
      });
    };
    M.syncCheckButton = function syncCheckButton(btn, done, progress, opts) {
      if (!btn) return;
      opts = opts || {};
      var blocked = !!opts.blocked && !done;
      var p =
        typeof progress === 'number' && isFinite(progress)
          ? M.CT.clampProgress(progress)
          : done
            ? 100
            : 0;
      var fill = blocked
        ? M.BLOCKED_ACCENT
        : p > 0
          ? S.completionColorForProgress(p)
          : '';
      btn.style.setProperty('--completion-progress', String(p));
      if (fill) {
        btn.style.setProperty('--completion-check-fill', fill);
      } else {
        btn.style.removeProperty('--completion-check-fill');
      }
      var iconMode = blocked ? 'pause' : 'check';
      if (btn.getAttribute('data-icon-mode') !== iconMode) {
        btn.setAttribute('data-icon-mode', iconMode);
        btn.innerHTML = blocked ? M.PAUSE_ICON_SVG : M.CHECK_ICON_SVG;
      }
      btn.classList.toggle('is-checked', done);
      btn.classList.toggle('has-progress', p > 0 && !done);
      btn.classList.toggle('is-blocked', blocked);
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        blocked
          ? p > 0
            ? 'D\u00e9bloquer — ' + p + '\u00a0%'
            : 'D\u00e9bloquer'
          : done
            ? 'Marquer comme non termin\u00e9'
            : p > 0
              ? 'Marquer comme termin\u00e9 (100\u00a0%) — ' + p + '\u00a0%'
              : 'Marquer comme termin\u00e9 (100\u00a0%)'
      );
      btn.title = blocked
        ? 'D\u00e9bloquer'
        : done
          ? 'Marquer comme non termin\u00e9 \u2014 maintenir + glisser pour ajuster'
          : 'Marquer comme termin\u00e9 \u2014 maintenir + glisser pour ajuster';
    };
    M.syncItemSlidersFromData = function syncItemSlidersFromData() {
      M.data.items.forEach(function (item) {
        var li = M.findItemRow(item.id);
        if (!li) return;
        var p = M.CT.itemProgress(item);
        var itemBlocked = M.CT.isItemBlocked(item);
        var slider = li.querySelector('.tp-completion-item-slider');
        var valEl = li.querySelector('.tp-completion-item-val');
        var checkBtn = li.querySelector('.tp-completion-check');
        if (slider) {
          slider.value = String(p);
          S.applySliderProgressTrack(slider, p, { blocked: itemBlocked });
        }
        if (valEl) {
          valEl.textContent = p + '\u00a0%';
          valEl.style.color = itemBlocked ? M.BLOCKED_ACCENT : '';
        }
        M.syncCheckButton(checkBtn, item.done, p, { blocked: itemBlocked });
        li.classList.toggle('is-done', item.done);
        li.classList.toggle('is-blocked', itemBlocked);
        var blockedBtn = li.querySelector('.tp-completion-blocked-btn');
        if (blockedBtn) {
          blockedBtn.classList.toggle('is-blocked', itemBlocked);
          blockedBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
          blockedBtn.disabled = !!item.done;
        }
        M.syncBlockedMotifMount(
          li,
          itemBlocked && !M.CT.isLinkedItem(item),
          item.blockedReasons || [],
          function (reasons) {
            M.data = M.CT.setItemBlockedReasons(M.data, item.id, reasons);
            M.emitChange();
            M.notifyBlockedChange('item-reason');
            M.onResize();
          },
          'tp-completion-item-motif'
        );
      });
    };
    M.itemMatchesQuery = function itemMatchesQuery(item) {
      if (!M.searchQuery) return true;
      return String(item.text || '')
        .toLowerCase()
        .indexOf(M.searchQuery) !== -1;
    };
    M.toolsVisible = function toolsVisible() {
      return M.data.items.length > S.FILTER_THRESHOLD;
    };
    M.effectiveStatusFilter = function effectiveStatusFilter() {
      return M.toolsVisible() ? M.statusFilter : 'all';
    };
    M.shouldShowDoneList = function shouldShowDoneList(doneCount) {
      if (doneCount <= 0) return false;
      var filter = M.effectiveStatusFilter();
      if (filter === 'active') return false;
      if (filter === 'done') return true;
      return M.showCompleted;
    };
    M.shouldShowActiveList = function shouldShowActiveList() {
      return M.effectiveStatusFilter() !== 'done';
    };
    M.updateDoneSectionUi = function updateDoneSectionUi(doneCount) {
      var hasDone = doneCount > 0;
      var showList = M.shouldShowDoneList(doneCount);
      M.doneSection.classList.toggle('is-empty', !hasDone);
      M.doneSection.classList.toggle('is-showing', showList);
      M.showDoneToggle.hidden = !hasDone;
      M.showDoneToggle.setAttribute('aria-expanded', showList ? 'true' : 'false');
      M.doneListEl.hidden = !showList;
    };
    M.updateToolsUi = function updateToolsUi() {
      var show = M.toolsVisible();
      M.toolsEl.hidden = !show;
      if (!show) {
        if (M.searchQuery || M.statusFilter !== 'all') {
          M.searchQuery = '';
          M.statusFilter = 'all';
          M.searchInput.value = '';
          M.filterSelect.value = 'all';
        }
      }
    };
    M.visibleSelectionEntries = function visibleSelectionEntries() {
      var out = [];
      var showActive = M.shouldShowActiveList();
      var showDone = M.shouldShowDoneList(
        M.data.items.filter(function (item) {
          return item.done;
        }).length
      );
      M.data.items.forEach(function (item) {
        if (!M.itemMatchesQuery(item)) return;
        if (item.done) {
          if (!showDone) return;
        } else if (!showActive) {
          return;
        }
        out.push({
          key: S.selectionKeyForItem(item.id),
          kind: 'item',
          itemId: item.id,
          linked: M.CT.isLinkedItem(item),
          done: !!item.done,
        });
        var nested = Array.isArray(item.items) ? item.items : [];
        for (var n = 0; n < nested.length; n++) {
          if (!nested[n] || !nested[n].id) continue;
          out.push({
            key: S.selectionKeyForChecklist(item.id, nested[n].id),
            kind: 'check',
            parentId: item.id,
            nestedId: nested[n].id,
            linked: false,
            done: !!nested[n].done,
          });
        }
      });
      return out;
    };
    M.pruneSelection = function pruneSelection() {
      var valid = Object.create(null);
      M.data.items.forEach(function (item) {
        if (!item || !item.id) return;
        valid[S.selectionKeyForItem(item.id)] = true;
        var nested = Array.isArray(item.items) ? item.items : [];
        for (var i = 0; i < nested.length; i++) {
          if (nested[i] && nested[i].id) {
            valid[S.selectionKeyForChecklist(item.id, nested[i].id)] = true;
          }
        }
      });
      Object.keys(M.selected).forEach(function (key) {
        if (!valid[key]) delete M.selected[key];
      });
    };
    M.selectedEntries = function selectedEntries() {
      var visible = M.visibleSelectionEntries();
      var out = [];
      for (var i = 0; i < visible.length; i++) {
        if (M.selected[visible[i].key]) out.push(visible[i]);
      }
      return out;
    };
    M.selectedCount = function selectedCount() {
      return M.selectedEntries().length;
    };
    M.clearSelection = function clearSelection() {
      M.selected = Object.create(null);
      M.renderBulkBar();
      M.renderList();
    };
    M.toggleSelected = function toggleSelected(key, on, cascadeItem) {
      var parsed = S.parseSelectionKey(key);
      var ids = [key];
      if (cascadeItem && parsed && parsed.kind === 'item') {
        var item = M.findLiveItem(parsed.itemId);
        if (item) ids = S.collectItemSelectionIds(item);
      }
      for (var i = 0; i < ids.length; i++) {
        if (on) M.selected[ids[i]] = true;
        else delete M.selected[ids[i]];
      }
      M.renderBulkBar();
      M.renderList();
    };
    M.setBulkBtnEnabled = function setBulkBtnEnabled(btn, enabled) {
      if (!btn) return;
      btn.disabled = !enabled;
    };
    },
    run: function (M) {
    if (!M.containerEl) throw new Error('mountCompletionUI: container required');
    M.CT = S.getCompletionTrello();
    if (!M.CT || typeof M.CT.normalizeCompletionData !== 'function') {
      throw new Error('CompletionTrello must be loaded before CompletionUI');
    }
    M.options = M.options || {};
    M.data = M.CT.normalizeCompletionData(M.options.data || { items: [] });
    M.onChange = typeof M.options.onChange === 'function' ? M.options.onChange : function () {};
    M.onResize = typeof M.options.onResize === 'function' ? M.options.onResize : function () {};
    M.onAllCompleteChange =
      typeof M.options.onAllCompleteChange === 'function' ? M.options.onAllCompleteChange : null;
    M.onOpenLinkedCard =
      typeof M.options.onOpenLinkedCard === 'function' ? M.options.onOpenLinkedCard : null;
    M.onPromoteSubtask =
      typeof M.options.onPromoteSubtask === 'function' ? M.options.onPromoteSubtask : null;
    M.onBlockedChange =
      typeof M.options.onBlockedChange === 'function' ? M.options.onBlockedChange : null;
    M.onLinkedTreeChange =
      typeof M.options.onLinkedTreeChange === 'function'
        ? M.options.onLinkedTreeChange
        : null;
    M.getBoardCards =
      typeof M.options.getBoardCards === 'function' ? M.options.getBoardCards : null;
    M.resolveLinkedTree =
      typeof M.options.resolveLinkedTree === 'function' ? M.options.resolveLinkedTree : null;
    M.trelloT = M.options.t || null;
    M.progressShellEl = M.options.shellEl || null;
    M.celebrateRootEl = M.options.celebrateRoot || null;
    M.showCardHeader = M.options.showCardHeader !== false;
    M.onTitleChange =
      typeof M.options.onTitleChange === 'function' ? M.options.onTitleChange : null;
    M.masterTitle =
      typeof M.options.cardName === 'string' && M.options.cardName.trim()
        ? M.options.cardName.trim()
        : '';
    M.currentCardId =
      typeof M.options.currentCardId === 'string' ? M.options.currentCardId.trim() : '';
    M.masterDragging = false;
    M.masterTitleDirty = false;
    M.masterTitleBusy = false;
    M.flipAnimToken = 0;
    M.lastAllComplete = null;
    M.itemSpellReverts = Object.create(null);
    M.itemSplitReverts = Object.create(null);
    M.spellcheckingItemIds = Object.create(null);
    M.itemSpellTokens = Object.create(null);
    M.estimatingItemIds = Object.create(null);
    M.linkedTreeByItemId = Object.create(null);
    M.linkedResolveSeq = 0;
    M.boardCardsCache = null;
    M.linkPickerOpen = false;
    M.selected = Object.create(null);
    M.bulkBusy = false;
    M.containerEl.innerHTML = '';
    M.containerEl.className = 'tp-completion';
    M.cardNameEl = null;
    if (M.showCardHeader) {
      M.header = document.createElement('header');
      M.header.className = 'tp-priority-card-header';
      M.cardNameEl = document.createElement('p');
      M.cardNameEl.className = 'tp-priority-card-name is-loading';
      M.cardNameEl.id = 'cardName';
      M.cardNameEl.setAttribute('aria-live', 'polite');
      M.cardNameEl.textContent = 'Chargement\u2026';
      M.header.appendChild(M.cardNameEl);
      M.containerEl.appendChild(M.header);
    }
    M.progressSection = document.createElement('section');
    M.progressSection.className = 'tp-completion-progress';
    M.progressSection.setAttribute('aria-label', 'Progr\u00e8s');
    M.progressPanel = document.createElement('div');
    M.progressPanel.className = 'tp-completion-progress-panel';
    M.progressHead = document.createElement('div');
    M.progressHead.className = 'tp-completion-progress-head';
    M.masterTitleEl = document.createElement(M.onTitleChange ? 'input' : 'p');
    M.masterTitleEl.className = 'tp-completion-master-title';
    M.masterTitleEl.id = 'completionMasterTitle';
    M.masterTitleEl.hidden = true;
    if (M.onTitleChange) {
      M.masterTitleEl.type = 'text';
      M.masterTitleEl.maxLength = 16384;
      M.masterTitleEl.autocomplete = 'off';
      M.masterTitleEl.spellcheck = true;
      M.masterTitleEl.setAttribute('aria-label', 'Titre de la carte');
      M.masterTitleEl.placeholder = 'Titre de la carte';
      M.masterTitleEl.title = 'Cliquer pour modifier le titre';
    }
    M.masterCheckWrap = document.createElement('div');
    M.masterCheckWrap.className = 'tp-completion-check-wrap tp-completion-master-check-wrap';
    M.masterCheckBtn = document.createElement('button');
    M.masterCheckBtn.type = 'button';
    M.masterCheckBtn.className = 'tp-completion-check tp-completion-master-check';
    M.masterCheckBtn.id = 'completionMasterCheck';
    M.masterCheckWrap.appendChild(M.masterCheckBtn);
    M.linkedSnapshots = Object.create(null);
    M.estimateScales =
      typeof M.CT.normalizeEstimateScales === 'function'
        ? M.CT.normalizeEstimateScales(
            M.options.estimateScales != null
              ? M.options.estimateScales
              : typeof M.CT.getCachedBoardEstimateScales === 'function'
                ? M.CT.getCachedBoardEstimateScales()
                : M.CT.DEFAULT_ESTIMATE_SCALES
          )
        : ['time'];
    M.masterEstimateChip = S.createEstimateChip(M.CT, {
      t: M.trelloT,
      scales: M.currentEstimateScales(),
      minutes: M.CT.computeEstimatedTotal(M.data),
      clearable: !M.data.items.length,
      adjusted:
        M.data.items.length &&
        typeof M.data.estimatedMinutesOffset === 'number' &&
        M.data.estimatedMinutesOffset !== 0,
      ariaLabel: 'Estimation totale',
      onChange: function (mins) {
        M.data = M.CT.applyMasterEstimate(M.data, mins, {
          lock: true,
          snapshotsByCardId: M.linkedSnapshots
        });
        M.updateProgressUi();
        M.emitChange();
        M.onResize();
      }
    });
    M.masterEstimateChip.el.classList.add('tp-completion-master-estimate');
    if (M.progressPanel) {
      M.progressPanel.dataset.estimateScales = M.estimateScales.join(',');
    }
    M.existingEncouragementBubble = document.getElementById(
      'completionEncouragementBubble'
    );
    if (M.existingEncouragementBubble && M.existingEncouragementBubble.parentNode) {
      M.existingEncouragementBubble.parentNode.removeChild(M.existingEncouragementBubble);
    }
    M.encouragementEl = document.createElement('div');
    M.encouragementEl.className = 'tp-completion-encouragement-bubble';
    M.encouragementEl.id = 'completionEncouragementBubble';
    M.encouragementEl.setAttribute('role', 'status');
    M.encouragementEl.setAttribute('aria-live', 'polite');
    M.encouragementEl.hidden = true;
    M.encouragementEl.setAttribute('aria-hidden', 'true');
    S.applyProgressEncouragement(M.encouragementEl, 0);
    document.body.appendChild(M.encouragementEl);
    M.encouragementBubbleVisible = false;
    M.encouragementPointerId = null;
    M.completeAllBtn = document.createElement('button');
    M.completeAllBtn.type = 'button';
    M.completeAllBtn.className = 'tp-completion-complete-all';
    M.completeAllBtn.id = 'completionCompleteAll';
    M.completeAllBtn.innerHTML = '<i class="ti ti-checks" aria-hidden="true"></i>';
    M.completeAllBtn.setAttribute(
      'aria-label',
      'Tout compl\u00e9ter \u2014 mettre le progr\u00e8s \u00e0 100\u00a0%'
    );
    M.completeAllBtn.title = 'Tout compl\u00e9ter';
    M.completeAllBtn.hidden = false;
    M.resetAllBtn = document.createElement('button');
    M.resetAllBtn.type = 'button';
    M.resetAllBtn.className = 'tp-completion-reset-all';
    M.resetAllBtn.id = 'completionResetAll';
    M.resetAllBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
    M.resetAllBtn.setAttribute(
      'aria-label',
      'Remettre le progr\u00e8s \u00e0 0\u00a0% (conserve les t\u00e2ches termin\u00e9es)'
    );
    M.resetAllBtn.title = 'Tout invalider';
    M.resetAllBtn.hidden = true;
    M.masterBlockedBtn = document.createElement('button');
    M.masterBlockedBtn.type = 'button';
    M.masterBlockedBtn.className = 'tp-completion-blocked-btn';
    M.masterBlockedBtn.id = 'completionMasterBlocked';
    M.masterBlockedBtn.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
    M.masterBlockedBtn.setAttribute('aria-pressed', 'false');
    M.masterBlockedBtn.setAttribute('aria-label', 'Marquer la t\u00e2che comme bloqu\u00e9e');
    M.masterBlockedBtn.title = 'Bloqu\u00e9';
    M.progressActions = document.createElement('div');
    M.progressActions.className = 'tp-completion-progress-actions';
    M.progressActions.appendChild(M.masterEstimateChip.el);
    M.progressActions.appendChild(M.masterBlockedBtn);
    M.progressActions.appendChild(M.completeAllBtn);
    M.progressActions.appendChild(M.resetAllBtn);
    M.progressHead.appendChild(M.masterTitleEl);
    M.progressHead.appendChild(M.progressActions);
    M.progressPanel.appendChild(M.progressHead);
    M.masterSlider = S.createProgressSlider(
      'Ajuster le progr\u00e8s',
      0,
      function (v) {
        M.masterDragging = true;
        var blockedBefore = M.CT.hasAnyBlocked(M.data);
        if (blockedBefore) {
          console.debug('[tp-blocked] masterSlider input', {
            value: v,
            hasItems: M.data.items.length > 0,
            blockedBefore: blockedBefore,
            masterBlocked: !!M.data.blocked,
            blockedItems: (M.data.items || []).filter(function (it) {
              return it && it.blocked === true;
            }).length,
          });
        }
        if (M.data.items.length) {
          M.data.items = M.CT.applyMasterProgress(M.data.items, v, M.linkedSnapshots);
          M.syncItemSlidersFromData();
        } else {
          M.data.progress = v;
        }
        var blockedAfter = M.CT.hasAnyBlocked(M.data);
        if (blockedBefore !== blockedAfter) {
          console.debug('[tp-blocked] masterSlider blocked changed', {
            value: v,
            blockedBefore: blockedBefore,
            blockedAfter: blockedAfter,
            masterBlocked: !!M.data.blocked,
            blockedItems: (M.data.items || []).filter(function (it) {
              return it && it.blocked === true;
            }).length,
          });
        }
        if (M.encouragementBubbleVisible) {
          S.applyProgressEncouragement(M.encouragementEl, v);
        }
        M.updateProgressUi({
          skipMasterSync: true,
          scrubPercent: v,
          deferDoneListReveal: true,
        });
        M.onChange(M.CT.normalizeCompletionData(M.data));
      },
      'completionMasterSlider'
    );
    M.masterSlider.el.classList.add('tp-completion-master-slider');
    M.masterFieldHead = M.masterSlider.el.querySelector('.tp-completion-field-head');
    if (M.masterFieldHead) {
      M.masterFieldHead.insertBefore(M.masterCheckWrap, M.masterFieldHead.firstChild);
    }
    M.masterSlider.input.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      M.armEncouragementBubbleFollow(event, Number(M.masterSlider.input.value));
    });
    M.masterSlider.input.addEventListener('change', function () {
      M.hideEncouragementBubble();
      if (M.data.items.length) {
        M.renderList();
        M.onResize();
      }
    });
    M.progressPanel.appendChild(M.masterSlider.el);
    M.masterMotifHost = document.createElement('div');
    M.masterMotifHost.className = 'tp-completion-master-motif-host';
    M.progressPanel.appendChild(M.masterMotifHost);
    M.progressSection.appendChild(M.progressPanel);
    M.bulkBarMount = document.createElement('div');
    M.bulkBarMount.innerHTML =
      '<div class="tp-completion-bulk is-idle" id="completionBulkBar" role="toolbar" ' +
      'aria-label="Actions de s\u00e9lection">' +
      '<label class="tp-completion-select-all-label" title="Tout s\u00e9lectionner">' +
      '<input type="checkbox" class="tp-completion-select-box" id="completionSelectAll" ' +
      'aria-label="Tout s\u00e9lectionner" />' +
      '</label>' +
      '<span class="tp-completion-bulk-count" id="completionBulkCount" aria-live="polite">0</span>' +
      '<button type="button" class="tp-btn tp-btn--secondary tp-completion-bulk-btn" id="completionBulkDone" ' +
      'disabled title="Terminer" aria-label="Terminer">' +
      '<i class="ti ti-circle-check" aria-hidden="true"></i></button>' +
      '<button type="button" class="tp-btn tp-btn--secondary tp-completion-bulk-btn" id="completionBulkReopen" ' +
      'disabled title="Rouvrir" aria-label="Rouvrir">' +
      '<i class="ti ti-reload" aria-hidden="true"></i></button>' +
      '<button type="button" class="tp-btn tp-btn--secondary tp-completion-bulk-btn tp-completion-bulk-btn--danger" ' +
      'id="completionBulkDelete" disabled title="Supprimer" aria-label="Supprimer">' +
      '<i class="ti ti-trash" aria-hidden="true"></i></button>' +
      '<button type="button" class="tp-btn tp-btn--secondary tp-completion-bulk-btn" id="completionBulkClear" ' +
      'disabled title="Tout d\u00e9s\u00e9lectionner" aria-label="Tout d\u00e9s\u00e9lectionner">' +
      '<i class="ti ti-deselect" aria-hidden="true"></i></button>' +
      '</div>';
    M.containerEl.appendChild(M.bulkBarMount.firstChild);
    M.containerEl.appendChild(M.progressSection);
    M.listSection = document.createElement('section');
    M.listSection.className = 'tp-completion-list-section';
    M.listSection.innerHTML =
      '<div class="tp-completion-tools" id="completionTools" hidden>' +
      '<input type="search" class="tp-input tp-completion-search" id="completionSearch" ' +
      'placeholder="Rechercher une sous-t\u00e2che\u2026" maxlength="200" autocomplete="off" ' +
      'aria-label="Rechercher une sous-t\u00e2che" />' +
      '<select class="tp-input tp-completion-filter" id="completionFilter" aria-label="Filtrer les sous-t\u00e2ches">' +
      '<option value="all">Toutes</option>' +
      '<option value="active">En cours</option>' +
      '<option value="done">Termin\u00e9es</option>' +
      '</select>' +
      '</div>' +
      '<ul class="tp-completion-list" id="completionList" aria-label="Sous-t\u00e2ches"></ul>' +
      '<p class="tp-completion-filter-empty" id="completionFilterEmpty" hidden>' +
      'Aucune sous-t\u00e2che ne correspond.</p>';
    M.containerEl.appendChild(M.listSection);
    M.doneSection = document.createElement('section');
    M.doneSection.className = 'tp-completion-done-section is-empty';
    M.doneSection.innerHTML =
      '<button type="button" class="tp-completion-show-done" id="completionShowDone" ' +
      'aria-expanded="false" aria-controls="completionDoneList">' +
      '<i class="ti ti-chevron-down tp-completion-show-done-chevron" aria-hidden="true"></i>' +
      '<span class="tp-completion-show-done-text">Afficher les t\u00e2ches termin\u00e9es</span>' +
      '</button>' +
      '<ul class="tp-completion-list tp-completion-done-list" id="completionDoneList" ' +
      'aria-label="T\u00e2ches termin\u00e9es" hidden></ul>';
    M.containerEl.appendChild(M.doneSection);
    M.addSection = document.createElement('section');
    M.addSection.className = 'tp-completion-add';
    M.addSection.innerHTML =
      '<div class="tp-completion-add-row">' +
      '<input type="text" class="tp-input tp-completion-add-input" id="completionAddInput" ' +
      'placeholder="Ajouter une sous-t\u00e2che\u2026" maxlength="500" autocomplete="off" />' +
      '<button type="button" class="tp-btn tp-btn--primary tp-completion-add-btn" id="completionAddBtn">' +
      '<i class="ti ti-plus" aria-hidden="true"></i>' +
      '<span class="tp-completion-add-btn-label">Ajouter</span>' +
      '</button>' +
      '<button type="button" class="tp-btn tp-btn--secondary tp-completion-link-btn" id="completionLinkBtn" ' +
      'aria-expanded="false" aria-controls="completionLinkPicker" title="Lier une carte du tableau">' +
      '<i class="ti ti-link" aria-hidden="true"></i>' +
      '<span class="tp-completion-link-btn-label">Lier</span>' +
      '</button>' +
      '</div>' +
      '<div class="tp-completion-link-picker" id="completionLinkPicker" hidden>' +
      '<input type="search" class="tp-input tp-completion-link-search" id="completionLinkSearch" ' +
      'placeholder="Rechercher une carte\u2026" maxlength="200" autocomplete="off" ' +
      'aria-label="Rechercher une carte du tableau" />' +
      '<p class="tp-completion-link-status" id="completionLinkStatus" hidden></p>' +
      '<div class="tp-completion-link-list" id="completionLinkList" role="list"></div>' +
      '</div>';
    M.containerEl.appendChild(M.addSection);
    M.suggestionsSection = document.createElement('section');
    M.suggestionsSection.className = 'tp-completion-suggestions';
    M.suggestionsSection.hidden = true;
    M.suggestionsSection.innerHTML =
      '<div class="tp-completion-suggestions-head">' +
      '<button type="button" class="tp-completion-suggestions-refresh" id="completionSuggestRefresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">\u21bb</button>' +
      '</div>' +
      '<p class="tp-completion-suggestions-status" id="completionSuggestStatus" hidden></p>' +
      '<div class="tp-completion-suggestions-list" id="completionSuggestList" role="list"></div>';
    M.containerEl.appendChild(M.suggestionsSection);
    M.listEl = M.containerEl.querySelector('#completionList');
    M.doneListEl = M.containerEl.querySelector('#completionDoneList');
    M.toolsEl = M.containerEl.querySelector('#completionTools');
    M.selectAllCheckbox = M.containerEl.querySelector('#completionSelectAll');
    M.bulkBarEl = M.containerEl.querySelector('#completionBulkBar');
    M.bulkCountEl = M.containerEl.querySelector('#completionBulkCount');
    M.bulkDoneBtn = M.containerEl.querySelector('#completionBulkDone');
    M.bulkReopenBtn = M.containerEl.querySelector('#completionBulkReopen');
    M.bulkDeleteBtn = M.containerEl.querySelector('#completionBulkDelete');
    M.bulkClearBtn = M.containerEl.querySelector('#completionBulkClear');
    M.searchInput = M.containerEl.querySelector('#completionSearch');
    M.filterSelect = M.containerEl.querySelector('#completionFilter');
    M.filterEmptyEl = M.containerEl.querySelector('#completionFilterEmpty');
    M.showDoneToggle = M.containerEl.querySelector('#completionShowDone');
    M.addInput = M.containerEl.querySelector('#completionAddInput');
    M.addBtn = M.containerEl.querySelector('#completionAddBtn');
    M.linkBtn = M.containerEl.querySelector('#completionLinkBtn');
    M.linkPickerEl = M.containerEl.querySelector('#completionLinkPicker');
    M.linkSearchInput = M.containerEl.querySelector('#completionLinkSearch');
    M.linkStatusEl = M.containerEl.querySelector('#completionLinkStatus');
    M.linkListEl = M.containerEl.querySelector('#completionLinkList');
    M.suggestStatusEl = M.containerEl.querySelector('#completionSuggestStatus');
    M.suggestListEl = M.containerEl.querySelector('#completionSuggestList');
    M.suggestRefreshBtn = M.containerEl.querySelector('#completionSuggestRefresh');
    M.suggestSubtasksFn =
      typeof M.options.suggestSubtasks === 'function' ? M.options.suggestSubtasks : null;
    M.splitTaskTitleFn =
      typeof M.options.splitTaskTitle === 'function' ? M.options.splitTaskTitle : null;
    M.currentSuggestions = [];
    M.suggestionsLoading = false;
    M.suggestionsSeq = 0;
    M.showCompleted = S.loadShowDonePreference();
    M.openItemDetailIds = Object.create(null);
    M.searchQuery = '';
    M.statusFilter = 'all';
    if (M.onTitleChange) {
      M.masterTitleEl.addEventListener('input', function () {
        M.masterTitleDirty = true;
        M.masterTitleEl.classList.toggle(
          'is-empty',
          !(M.masterTitleEl.value || '').trim()
        );
        M.onResize();
      });
      M.masterTitleEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          M.masterTitleEl.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          M.masterTitleDirty = false;
          M.masterTitleEl.value = M.masterTitle || '';
          M.masterTitleEl.classList.toggle('is-empty', !M.masterTitle);
          M.masterTitleEl.blur();
        }
      });
      M.masterTitleEl.addEventListener('blur', function () {
        M.flushMasterTitleSave();
      });
    }
    M.syncMasterTitleUi();
    M.addTabComplete = null;
    if (
      M.addInput &&
      global.TabAutocomplete &&
      typeof global.TabAutocomplete.wrapField === 'function'
    ) {
      M.addWrapped = global.TabAutocomplete.wrapField(M.addInput);
      M.addTabComplete = global.TabAutocomplete.bind({
        field: M.addInput,
        wrapEl: M.addWrapped.wrap,
        ghostEl: M.addWrapped.ghost,
        getCandidates: function () {
          return M.currentSuggestions
            .filter(function (s) {
              return !(s && typeof s === 'object' && s.type === 'link');
            })
            .map(function (s) {
              return typeof s === 'string' ? s : s && s.text ? s.text : '';
            })
            .filter(Boolean);
        },
        isEnabled: function () {
          return !M.addInput.disabled;
        },
        onProposal: function (proposal) {
          var target =
            proposal && proposal.candidate ? String(proposal.candidate.text || '') : '';
          if (!M.suggestListEl) return;
          Array.prototype.forEach.call(
            M.suggestListEl.querySelectorAll('.tp-completion-suggestion'),
            function (btn) {
              if (btn.classList.contains('is-link')) {
                btn.classList.remove('is-tab-target');
                var linkHint = btn.querySelector('.tp-tab-hint');
                if (linkHint) linkHint.remove();
                return;
              }
              var label = String(btn.getAttribute('data-suggestion') || btn.textContent || '');
              var on = !!(target && label === target);
              btn.classList.toggle('is-tab-target', on);
              var hint = btn.querySelector('.tp-tab-hint');
              if (on && !hint) {
                var kbd = document.createElement('kbd');
                kbd.className = 'tp-tab-hint';
                kbd.textContent = 'Tab';
                btn.appendChild(kbd);
              } else if (!on && hint) {
                hint.remove();
              }
            }
          );
        }
      });
    }
    M.CHECK_ICON_SVG =
      '<svg class="tp-completion-check-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M13.2 4.3 6.5 11 2.8 7.3l1.1-1.1 2.6 2.6 5.6-5.6z"/>' +
      '</svg>';
    M.PAUSE_ICON_SVG =
      '<svg class="tp-completion-check-icon tp-completion-pause-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
      '<rect x="3.75" y="3" width="2.75" height="10" rx="0.6" fill="currentColor"/>' +
      '<rect x="9.5" y="3" width="2.75" height="10" rx="0.6" fill="currentColor"/>' +
      '</svg>';
    M.BLOCKED_ACCENT = 'var(--blocked-accent, #ae2e24)';
    M.TRASH_ICON_SVG =
      '<svg class="tp-completion-delete-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M6 2.25A.75.75 0 0 1 6.75 1.5h2.5a.75.75 0 0 1 .75.75V3.5h3.25a.75.75 0 0 1 0 1.5h-.46l-.54 8.05A1.75 1.75 0 0 1 10.51 14.5H5.49a1.75 1.75 0 0 1-1.74-1.45L3.21 5H2.75a.75.75 0 0 1 0-1.5H6V2.25zM7.5 3.5h1V3h-1v.5zM4.72 5l.52 7.8a.25.25 0 0 0 .25.2h5.02a.25.25 0 0 0 .25-.2L11.28 5H4.72zM6.5 6.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75zm3 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75z"/>' +
      '</svg>';
    }
  });
})(typeof window !== 'undefined' ? window : this);
