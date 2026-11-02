/**
 * completion-ui: mountCompletionUI() part 4 of 4.
 * The body of mountCompletionUI runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see completion-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});
  var P = (global.CompletionUiPartsMountMountCompletionUI = global.CompletionUiPartsMountMountCompletionUI || { list: [] });

  P.list.push({
    define: function (M) {
    M.promoteItemToCard = function promoteItemToCard(item) {
      if (!item || M.CT.isLinkedItem(item)) return Promise.resolve(null);
      var promoteFn = M.onPromoteSubtask;
      if (!promoteFn && M.trelloT && typeof M.CT.promoteSubtaskToCard === 'function') {
        promoteFn = function (itemId) {
          return M.CT.promoteSubtaskToCard(M.trelloT, itemId);
        };
      }
      if (!promoteFn) {
        console.error('Completion promote: no promote handler');
        return Promise.resolve({ ok: false, reason: 'no-promote' });
      }
      return Promise.resolve()
        .then(function () {
          return promoteFn(item.id, item);
        })
        .then(function (result) {
          if (!result || !result.ok) {
            console.error('Completion promote failed', result);
            return result;
          }
          if (result.data) {
            M.data = M.CT.normalizeCompletionData(result.data);
          }
          M.emitChange();
          M.refreshLinkedTree({ skipPersist: true });
          if (result.cardId && M.onOpenLinkedCard) {
            try {
              M.onOpenLinkedCard(result.cardId);
            } catch (err) {
              console.error('Completion open promoted card failed', err);
            }
          }
          M.onResize();
          return result;
        })
        .catch(function (err) {
          console.error('Completion promote failed', err);
          return { ok: false, reason: 'threw', error: err };
        });
    };
    M.renderList = function renderList() {
      M.beginSuppressEmptyDraftDiscard();
      try {
        M.pruneSelection();
        M.listEl.replaceChildren();
        M.doneListEl.replaceChildren();
        M.listSection.classList.toggle('is-empty', !M.data.items.length);
        M.updateToolsUi();
        M.syncSelectAllUi();
        M.renderBulkBar();

        if (!M.data.items.length) {
          M.filterEmptyEl.hidden = true;
          M.updateDoneSectionUi(0);
          return;
        }

        var activeItems = [];
        var doneItems = [];
        M.data.items.forEach(function (item) {
          if (!M.itemMatchesQuery(item)) return;
          if (item.done) doneItems.push(item);
          else activeItems.push(item);
        });

        var showActive = M.shouldShowActiveList();
        var showDone = M.shouldShowDoneList(
          M.data.items.filter(function (item) {
            return item.done;
          }).length
        );

        function appendItemWithNest(target, item) {
          target.appendChild(M.renderItem(item));
          M.appendNestedChildren(target, item, M.linkedTreeByItemId[item.id]);
        }

        if (showActive) {
          activeItems.forEach(function (item) {
            appendItemWithNest(M.listEl, item);
          });
        }
        if (showDone) {
          doneItems.forEach(function (item) {
            appendItemWithNest(M.doneListEl, item);
          });
        }

        var visibleCount =
          (showActive ? activeItems.length : 0) +
          (showDone ? doneItems.length : 0);
        var filtering =
          M.toolsVisible() &&
          (!!M.searchQuery || M.effectiveStatusFilter() !== 'all');
        var emptyVisible = filtering && visibleCount === 0 && M.data.items.length > 0;
        M.filterEmptyEl.hidden = !emptyVisible;
        if (emptyVisible) {
          var hiddenDoneMatches =
            !showDone && doneItems.length > 0 && showActive && !!M.searchQuery;
          M.filterEmptyEl.textContent = hiddenDoneMatches
            ? 'Des t\u00e2ches termin\u00e9es correspondent \u2014 activez \u00ab Afficher les t\u00e2ches termin\u00e9es \u00bb.'
            : 'Aucune sous-t\u00e2che ne correspond.';
        }

        M.updateDoneSectionUi(
          M.data.items.filter(function (item) {
            return item.done;
          }).length
        );
      } finally {
        M.endSuppressEmptyDraftDiscard();
        if (global.InsertGap && M.listEl) {
          global.InsertGap.watch(M.listEl, {
            item: '.tp-completion-item--depth1',
            placeholder: 'Sous-tâche…',
            wrap: function (input) {
              var li = document.createElement('li');
              li.className = 'ig-compose';
              li.appendChild(input);
              return li;
            },
            onCreate: function (title, info) {
              var aboveId = info.above && info.above.getAttribute('data-id');
              var idx = M.data.items.length;
              if (aboveId) {
                for (var ii = 0; ii < M.data.items.length; ii++) {
                  if (M.data.items[ii].id === aboveId) { idx = ii + 1; break; }
                }
              }
              M.addItem(title, { index: idx });
            },
          });
        }
      }
    };
    M.removeItem = function removeItem(id, opts) {
      opts = opts || {};
      delete M.itemSpellReverts[id];
      delete M.spellcheckingItemIds[id];
      delete M.itemSpellTokens[id];
      delete M.estimatingItemIds[id];
      M.clearSplitRevertTracking([id]);
      var nextItems = M.data.items.filter(function (item) {
        return item.id !== id;
      });
      if (!nextItems.length && M.data.items.length) {
        M.data.progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots).percent;
      }
      M.data.items = nextItems;
      delete M.linkedTreeByItemId[id];
      if (!opts.silent) S.playCompletionUiSound('trash');
      M.emitChange();
      M.refreshLinkedTree({ skipPersist: true });
      M.onResize();
    };
    M.addItem = function addItem(text, estimateOpts) {
      estimateOpts = estimateOpts || {};
      var trimmed = (text || '').trim();
      if (!trimmed) return null;
      var rawItem = {
        id: M.CT.generateId(),
        text: trimmed,
        progress: 0,
      };
      var est = M.CT.clampEstimatedMinutes(estimateOpts.estimatedMinutes);
      if (est != null) {
        rawItem.estimatedMinutes = est;
        if (estimateOpts.lock) rawItem.estimatedMinutesLocked = true;
      }
      if (estimateOpts.blocked === true) rawItem.blocked = true;
      var item = M.CT.normalizeItem(rawItem);
      if (!item) return null;
      if (typeof estimateOpts.index === 'number') {
        M.data.items.splice(Math.max(0, Math.min(M.data.items.length, estimateOpts.index)), 0, item);
      } else {
        M.data.items.push(item);
      }
      M.removeSuggestionMatch(trimmed);
      S.playCompletionUiSound(estimateOpts.blocked === true ? 'block' : 'add');
      M.emitChange();
      if (estimateOpts.blocked === true) M.notifyBlockedChange('add');
      M.onResize();
      return item;
    };
    M.addDraftItem = function addDraftItem() {
      var item = {
        id: M.CT.generateId(),
        text: '',
        progress: 0,
        done: false
      };
      M.data.items.push(item);
      S.playCompletionUiSound('add');
      M.renderList();
      M.updateProgressUi();
      M.onResize();
      M.focusItemTextInput(item.id);
      return item;
    };
    M.addLinkedCard = function addLinkedCard(card) {
      if (!card || !card.id) return null;
      var cardId = String(card.id).trim();
      if (!cardId || (M.currentCardId && cardId === M.currentCardId)) return null;
      if (M.linkedIdsAlreadyUsed()[cardId]) return null;
      var name =
        typeof card.name === 'string' && card.name.trim()
          ? card.name.trim()
          : 'Carte li\u00e9e';
      var progress =
        typeof card.progress === 'number' && isFinite(card.progress)
          ? M.CT.clampProgress(card.progress)
          : 0;
      var item = M.CT.normalizeItem({
        id: M.CT.generateId(),
        text: name,
        progress: progress,
        linkedCardId: cardId,
      });
      if (!item) return null;
      M.data.items.push(item);
      S.playCompletionUiSound('add');
      M.closeLinkPicker();
      M.emitChange();
      M.refreshLinkedTree();
      M.onResize();
      return item;
    };
    M.setSuggestStatus = function setSuggestStatus(text, visible) {
      if (!M.suggestStatusEl) return;
      if (!visible || !text) {
        M.suggestStatusEl.hidden = true;
        M.suggestStatusEl.textContent = '';
        return;
      }
      M.suggestStatusEl.hidden = false;
      M.suggestStatusEl.textContent = text;
    };
    M.normalizeSuggestionRow = function normalizeSuggestionRow(raw) {
      if (typeof raw === 'string') {
        var textOnly = raw.trim();
        return textOnly ? { type: 'text', text: textOnly } : null;
      }
      if (!raw || typeof raw !== 'object') return null;
      var text =
        typeof raw.text === 'string'
          ? raw.text.trim()
          : typeof raw.label === 'string'
            ? raw.label.trim()
            : '';
      var cardId =
        raw.cardId != null
          ? String(raw.cardId).trim()
          : raw.linkedCardId != null
            ? String(raw.linkedCardId).trim()
            : '';
      var type =
        raw.type === 'link' || raw.kind === 'link' || cardId ? 'link' : 'text';
      var estMins = M.CT.clampEstimatedMinutes(
        raw.estimatedMinutes != null
          ? raw.estimatedMinutes
          : raw.minutes != null
            ? raw.minutes
            : raw.durationMinutes
      );
      if (type === 'link') {
        if (!cardId || (M.currentCardId && cardId === M.currentCardId)) return null;
        if (M.linkedIdsAlreadyUsed()[cardId]) return null;
        var linkRow = {
          type: 'link',
          text: text || 'Carte li\u00e9e',
          cardId: cardId,
          list: typeof raw.list === 'string' ? raw.list : ''
        };
        if (estMins != null) linkRow.estimatedMinutes = estMins;
        return linkRow;
      }
      if (!text) return null;
      var textRow = { type: 'text', text: text };
      if (estMins != null) textRow.estimatedMinutes = estMins;
      return textRow;
    };
    M.suggestionKey = function suggestionKey(row) {
      if (!row) return '';
      if (row.type === 'link' && row.cardId) return 'link:' + row.cardId;
      return 'text:' + String(row.text || '').trim().toLocaleLowerCase('fr-FR');
    };
    M.removeSuggestionMatch = function removeSuggestionMatch(match) {
      var dropKey = '';
      if (typeof match === 'string') {
        dropKey = 'text:' + match.trim().toLocaleLowerCase('fr-FR');
      } else if (match && typeof match === 'object') {
        dropKey = M.suggestionKey(M.normalizeSuggestionRow(match) || match);
      }
      if (!dropKey) return;
      M.currentSuggestions = M.currentSuggestions.filter(function (s) {
        return M.suggestionKey(s) !== dropKey;
      });
      M.renderSuggestions();
    };
    M.renderSuggestions = function renderSuggestions() {
      if (!M.suggestListEl || !M.suggestionsSection) return;
      M.suggestListEl.replaceChildren();
      if (!M.suggestSubtasksFn) {
        M.suggestionsSection.hidden = true;
        return;
      }
      M.suggestionsSection.hidden = false;
      if (M.suggestionsLoading) {
        M.setSuggestStatus('G\u00e9n\u00e9ration des suggestions\u2026', true);
        return;
      }
      if (!M.currentSuggestions.length) {
        M.setSuggestStatus('Aucune suggestion pour le moment.', true);
        return;
      }
      M.setSuggestStatus('', false);
      M.currentSuggestions.forEach(function (suggestion) {
        var row = M.normalizeSuggestionRow(suggestion);
        if (!row || !row.text) return;
        var isLink = row.type === 'link' && row.cardId;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'tp-completion-suggestion' + (isLink ? ' is-link' : '');
        btn.setAttribute('role', 'listitem');
        btn.setAttribute('data-suggestion', row.text);
        if (isLink) btn.setAttribute('data-linked-card-id', row.cardId);
        if (isLink) {
          var icon = document.createElement('i');
          icon.className = 'ti ti-link';
          icon.setAttribute('aria-hidden', 'true');
          var labelEl = document.createElement('span');
          labelEl.className = 'tp-completion-suggestion-label';
          labelEl.textContent = row.text;
          btn.appendChild(icon);
          btn.appendChild(labelEl);
          if (row.list) {
            var listEl = document.createElement('span');
            listEl.className = 'tp-completion-suggestion-list';
            listEl.textContent = row.list;
            btn.appendChild(listEl);
          }
          btn.title =
            'Lier la carte\u00a0: ' +
            row.text +
            (row.list ? ' (' + row.list + ')' : '');
        } else {
          var sugLabel = row.text;
          if (row.estimatedMinutes != null) {
            var sugEst =
              M.CT.formatEstimateForScales
                ? M.CT.formatEstimateForScales(
                    row.estimatedMinutes,
                    M.currentEstimateScales()
                  )
                : M.CT.formatEstimateForScale
                  ? M.CT.formatEstimateForScale(
                      row.estimatedMinutes,
                      M.currentEstimateScales()[0]
                    )
                  : '';
            sugLabel += ' · ' + (sugEst || '');
          }
          btn.textContent = sugLabel;
          btn.title =
            'Ajouter\u00a0: ' +
            row.text +
            (row.estimatedMinutes != null
              ? ' (' +
                (M.CT.formatEstimateForScales
                  ? M.CT.formatEstimateForScales(
                      row.estimatedMinutes,
                      M.currentEstimateScales()
                    )
                  : M.CT.formatEstimateForScale(
                      row.estimatedMinutes,
                      M.currentEstimateScales()[0]
                    )) +
                ')'
              : '');
        }
        btn.addEventListener('click', function () {
          if (isLink) {
            btn.disabled = true;
            var added = M.addLinkedCard({
              id: row.cardId,
              name: row.text,
              list: row.list || ''
            });
            if (added) {
              M.removeSuggestionMatch(row);
            } else {
              btn.disabled = false;
              M.removeSuggestionMatch(row);
            }
            return;
          }
          var typed = row.text;
          var item = M.addItem(typed, {
            estimatedMinutes: row.estimatedMinutes
          });
          M.removeSuggestionMatch(row);
          if (item) M.refineItemAfterCommit(item.id, typed);
        });
        M.suggestListEl.appendChild(btn);
      });
      if (M.addTabComplete) M.addTabComplete.refresh();
      M.onResize();
    };
    M.refreshSuggestions = function refreshSuggestions(force) {
      if (!M.suggestSubtasksFn) {
        M.suggestionsSection.hidden = true;
        return Promise.resolve();
      }
      var seq = ++M.suggestionsSeq;
      M.suggestionsLoading = true;
      M.renderSuggestions();
      return Promise.resolve()
        .then(function () {
          return M.suggestSubtasksFn({
            force: !!force,
            items: (M.data.items || []).map(function (it) {
              return {
                text: it.text,
                linkedCardId: M.CT.itemLinkedCardId(it) || undefined
              };
            })
          });
        })
        .then(function (list) {
          if (seq !== M.suggestionsSeq) return;
          var seen = Object.create(null);
          M.currentSuggestions = Array.isArray(list)
            ? list
                .map(M.normalizeSuggestionRow)
                .filter(Boolean)
                .filter(function (row) {
                  var key = M.suggestionKey(row);
                  if (!key || seen[key]) return false;
                  seen[key] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          M.suggestionsLoading = false;
          M.renderSuggestions();
        })
        .catch(function (err) {
          console.error('CompletionUI suggestions failed', err);
          if (seq !== M.suggestionsSeq) return;
          M.suggestionsLoading = false;
          M.currentSuggestions = [];
          M.setSuggestStatus(
            'Impossible de g\u00e9n\u00e9rer des suggestions (IA indisponible).',
            true
          );
          M.suggestionsSection.hidden = false;
          M.onResize();
        });
    };
    M.findLiveItem = function findLiveItem(id) {
      for (var i = 0; i < M.data.items.length; i++) {
        if (M.data.items[i].id === id) return M.data.items[i];
      }
      return null;
    };
    M.showItemSpellRevert = function showItemSpellRevert(itemId, originalText) {
      var live = M.findLiveItem(itemId);
      if (
        !live ||
        !originalText ||
        live.text === originalText ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        if (M.itemSpellReverts[itemId] === originalText) {
          delete M.itemSpellReverts[itemId];
        }
        return;
      }
      var li = M.findItemRow(itemId);
      if (!li) return;
      var mainRow = li.querySelector('.tp-completion-item-main');
      var del = li.querySelector('.tp-completion-delete');
      var textInput = li.querySelector('.tp-completion-text');
      if (!mainRow || !textInput) return;
      M.itemSpellReverts[itemId] = originalText;
      global.Spellcheck.attachRevert(mainRow, {
        className: 'tp-completion-spell-revert',
        before: del,
        previous: originalText,
        onRevert: function () {
          if (M.itemSpellReverts[itemId] !== originalText) return;
          var current = M.findLiveItem(itemId);
          if (!current) return;
          textInput.value = originalText;
          current.text = originalText;
          delete M.itemSpellReverts[itemId];
          S.playCompletionUiSound('undo');
          var persisted = M.applyNormalizedKeepingDrafts(M.data);
          M.updateProgressUi();
          M.onChange(persisted);
        },
        onDismiss: function () {
          if (M.itemSpellReverts[itemId] === originalText) {
            delete M.itemSpellReverts[itemId];
          }
        }
      });
    };
    M.addFromInput = function addFromInput() {
      var original = (M.addInput.value || '').trim();
      if (!original) {
        M.addDraftItem();
        return;
      }
      // Commit immediately — split / spellcheck / estimate refine asynchronously.
      M.addInput.value = '';
      var item = M.addItem(original);
      M.addInput.focus();
      if (item) M.refineItemAfterCommit(item.id, original);
    };
    },
    run: function (M) {
    M.showDoneToggle.addEventListener('click', function () {
      M.showCompleted = !M.showCompleted;
      S.saveShowDonePreference(M.showCompleted);
      M.renderList();
      M.onResize();
    });
    M.searchInput.addEventListener('input', function () {
      M.searchQuery = String(M.searchInput.value || '')
        .trim()
        .toLowerCase();
      M.renderList();
      M.onResize();
    });
    M.filterSelect.addEventListener('change', function () {
      M.statusFilter = M.filterSelect.value || 'all';
      if (M.statusFilter !== 'all' && M.statusFilter !== 'active' && M.statusFilter !== 'done') {
        M.statusFilter = 'all';
      }
      M.renderList();
      M.onResize();
    });
    if (M.suggestRefreshBtn) {
      M.suggestRefreshBtn.addEventListener('click', function () {
        M.refreshSuggestions(true);
      });
    }
    if (M.suggestSubtasksFn) {
      // Defer so mount returns before first network call.
      setTimeout(function () {
        M.refreshSuggestions(false);
      }, 0);
    } else {
      M.suggestionsSection.hidden = true;
    }
    M.addBtn.addEventListener('click', M.addFromInput);
    M.addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        M.addFromInput();
      }
    });
    M.renderList();
    M.updateProgressUi();
    M.refreshLinkedTree({ skipPersist: false });
    return { v: {
      setCardName: function (name, options) {
        options = options || {};
        var next = typeof name === 'string' ? name.trim() : '';
        if (
          !options.force &&
          M.onTitleChange &&
          (M.masterTitleDirty || document.activeElement === M.masterTitleEl)
        ) {
          return;
        }
        M.masterTitle = next;
        M.masterTitleDirty = false;
        M.syncMasterTitleUi({ force: !!options.force });
        if (M.cardNameEl) {
          var label = M.masterTitle || 'Carte';
          M.cardNameEl.textContent = label;
          M.cardNameEl.title = M.masterTitle ? M.masterTitle : '';
          M.cardNameEl.classList.remove('is-loading');
        }
        M.onResize();
      },
      getData: function () {
        return M.CT.normalizeCompletionData(M.data);
      },
      setData: function (next) {
        M.data = M.CT.normalizeCompletionData(next);
        M.renderList();
        M.updateProgressUi();
        M.refreshLinkedTree({ skipPersist: true });
        M.onResize();
      },
      addItem: function (text, estimateOpts) {
        return M.addItem(text, estimateOpts);
      },
      setMasterBlocked: function (blocked, opts) {
        opts = opts || {};
        M.data = M.CT.setMasterBlocked(M.data, !!blocked, {
          origin: opts.origin === 'status' ? 'status' : 'user'
        });
        M.syncMasterBlockedBtn();
        M.updateProgressUi();
        M.emitChange();
        M.notifyBlockedChange('api');
        M.onResize();
        return M.CT.normalizeCompletionData(M.data);
      },
      setMasterBlockedReasons: function (reasons, opts) {
        M.data = M.CT.setMasterBlockedReasons(M.data, reasons, opts);
        M.syncMasterBlockedBtn();
        M.updateProgressUi();
        M.emitChange();
        M.notifyBlockedChange('api');
        M.onResize();
        return M.CT.normalizeCompletionData(M.data);
      },
      isMasterBlockedByUser: function () {
        return M.CT.isMasterBlockedByUser(M.data);
      },
      hasBlockedSubtasks: function () {
        return M.CT.hasBlockedSubtasks(M.data);
      },
      masterBlockedOrigin: function () {
        return M.CT.masterBlockedOrigin(M.data);
      },
      setItemBlocked: function (itemId, blocked) {
        M.data = M.CT.setItemBlocked(M.data, itemId, !!blocked);
        M.emitChange();
        M.notifyBlockedChange('api');
        M.onResize();
        return M.CT.normalizeCompletionData(M.data);
      },
      setItemBlockedReasons: function (itemId, reasons) {
        M.data = M.CT.setItemBlockedReasons(M.data, itemId, reasons);
        M.emitChange();
        M.notifyBlockedChange('api');
        M.onResize();
        return M.CT.normalizeCompletionData(M.data);
      },
      clearAllBlocked: function () {
        M.data = M.CT.clearAllBlocked(M.data);
        M.syncMasterBlockedBtn();
        M.emitChange();
        M.notifyBlockedChange('api');
        M.onResize();
        return M.CT.normalizeCompletionData(M.data);
      },
      hasAnyBlocked: function () {
        return M.CT.hasAnyBlocked(M.data);
      },
      aggregateBlockedReasons: function () {
        return M.CT.aggregateBlockedReasons(M.data);
      },
      seedBlockedReasonsFromPriority: function (priorityReasons) {
        M.data = M.CT.seedBlockedReasonsFromPriority(M.data, priorityReasons);
        M.syncMasterBlockedBtn();
        M.emitChange();
        M.notifyBlockedChange('api');
        M.onResize();
        return M.CT.normalizeCompletionData(M.data);
      },
      applyItemEstimates: function (estimates, options) {
        var next = M.CT.applyItemEstimates(M.data, estimates, options || {});
        var prev = JSON.stringify(M.CT.normalizeCompletionData(M.data));
        var persisted = M.applyNormalizedKeepingDrafts(next);
        if (JSON.stringify(persisted) === prev) return persisted;
        // Clear estimating flags for items that now have a duration.
        if (persisted.items) {
          for (var i = 0; i < persisted.items.length; i++) {
            var row = persisted.items[i];
            if (
              row &&
              row.id &&
              M.CT.clampEstimatedMinutes(row.estimatedMinutes) != null
            ) {
              delete M.estimatingItemIds[row.id];
            }
          }
        }
        M.renderList();
        M.updateProgressUi();
        M.onChange(persisted);
        M.onResize();
        return persisted;
      },
      setEstimatingItemIds: function (ids) {
        var next = Object.create(null);
        if (Array.isArray(ids)) {
          for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (typeof id === 'string' && id) next[id] = true;
          }
        }
        M.estimatingItemIds = next;
        var wraps = M.containerEl.querySelectorAll('[data-estimate-item-id]');
        for (var w = 0; w < wraps.length; w++) {
          var wrap = wraps[w];
          var itemId = wrap.getAttribute('data-estimate-item-id');
          var chipApi = wrap._tpEstimateChip;
          if (!chipApi || typeof chipApi.setEstimating !== 'function') continue;
          chipApi.setEstimating(!!(itemId && M.estimatingItemIds[itemId]));
        }
      },
      getEstimateSummary: function () {
        var progress = M.CT.computeCardProgress(M.data, M.linkedSnapshots);
        return {
          percent: progress.percent,
          totalMinutes: M.CT.computeEstimatedTotal(M.data, M.linkedSnapshots),
          remainingMinutes: M.CT.computeEstimatedRemaining(M.data, M.linkedSnapshots),
          needingEstimate: M.CT.itemsNeedingEstimate(M.data),
          hasOffset: !!(
            M.data.items.length &&
            typeof M.data.estimatedMinutesOffset === 'number' &&
            M.data.estimatedMinutesOffset !== 0
          ),
          scales: M.currentEstimateScales(),
        };
      },
      getEstimateScales: function () {
        return M.currentEstimateScales();
      },
      setEstimateScales: function (nextScales) {
        M.applyEstimateScales(nextScales, { rerender: true });
      },
      addItem: M.addItem,
      toggleMasterComplete: M.toggleMasterComplete,
      toggleItemDoneById: function (itemId) {
        var id = itemId != null ? String(itemId) : '';
        if (!id) return;
        var live = null;
        for (var ti = 0; ti < M.data.items.length; ti++) {
          if (M.data.items[ti] && String(M.data.items[ti].id) === id) {
            live = M.data.items[ti];
            break;
          }
        }
        if (!live) return;
        if (M.CT.isItemBlocked(live)) {
          M.data = M.CT.setItemBlocked(M.data, live.id, false);
          S.playCompletionUiSound('unblock');
          M.emitChange();
          M.notifyBlockedChange('overview-check');
          M.onResize();
          return;
        }
        var wasDone = !!live.done;
        M.setItemProgress(live, live.done ? 0 : 100);
        M.emitChange({
          animateItemId: live.id,
          flipWasDone: wasDone,
          focusTextItemId: live.id
        });
        if (!wasDone && live.done) {
          S.playSubtaskCompletePop(null, { sound: true });
        } else if (wasDone && !live.done) {
          S.playCompletionUiSound('uncomplete');
        }
        M.onResize();
      },
      addLinkedCard: M.addLinkedCard,
      refreshLinkedTree: M.refreshLinkedTree,
      /** Compact linked-tree map for AI Progrès summary (itemId → node). */
      getLinkedTreeByItemId: function () {
        var out = Object.create(null);
        Object.keys(M.linkedTreeByItemId).forEach(function (id) {
          var node = M.linkedTreeByItemId[id];
          if (!node) return;
          out[id] = node;
        });
        return out;
      },
      getLinkedSnapshots: function () {
        return M.linkedSnapshots || Object.create(null);
      },
      refreshSuggestions: M.refreshSuggestions,
      focusAddInput: function () {
        M.addInput.focus();
      },
      completeAllTasks: M.completeAllTasks,
      resetAllTasks: M.resetAllTasks,
      el: M.containerEl,
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
