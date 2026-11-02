/**
 * completion-ui: mountCompletionUI() part 3 of 4.
 * The body of mountCompletionUI runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see completion-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});
  var P = (global.CompletionUiPartsMountMountCompletionUI = global.CompletionUiPartsMountMountCompletionUI || { list: [] });

  P.list.push({
    define: function (M) {
    M.bindItemRow = function bindItemRow(li, item, opts) {
      opts = opts || {};
      var readOnly = !!opts.readOnly;
      var checkBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-check, :scope > .tp-completion-item-slider-row .tp-completion-check'
      );
      var checkWrap =
        (checkBtn && checkBtn.closest && checkBtn.closest('.tp-completion-check-wrap')) ||
        (checkBtn && checkBtn.parentNode) ||
        null;
      var textInput = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-text'
      );
      var textLink = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-text-link'
      );
      var deleteBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-delete'
      );
      var directSliderRow =
        li.querySelector(':scope > .tp-completion-item-slider-row') ||
        li.querySelector(
          ':scope > .tp-completion-checklist-details .tp-completion-item-slider-row'
        );
      var itemSlider = directSliderRow
        ? directSliderRow.querySelector('.tp-completion-item-slider')
        : null;
      var itemValEl = directSliderRow
        ? directSliderRow.querySelector('.tp-completion-item-val')
        : null;
      var promoteBtn =
        opts.promoteBtn || li.querySelector('.tp-completion-promote');
      var completeBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-item-complete'
      );
      var isLinked = M.CT.isLinkedItem(item);

      var blockedBtn = li.querySelector(
        ':scope > .tp-completion-item-main .tp-completion-blocked-btn'
      );

      function syncItemProgressUi() {
        var p = M.CT.itemProgress(item);
        var itemBlocked = M.CT.isItemBlocked(item);
        if (itemSlider) S.applySliderProgressTrack(itemSlider, p, { blocked: itemBlocked });
        if (itemValEl) {
          itemValEl.textContent = p + '\u00a0%';
          itemValEl.style.color = itemBlocked ? M.BLOCKED_ACCENT : '';
        }
        M.syncCheckButton(checkBtn, item.done, p, { blocked: itemBlocked });
        li.classList.toggle('is-done', item.done);
        li.classList.toggle('is-blocked', itemBlocked);
        if (blockedBtn) {
          blockedBtn.classList.toggle('is-blocked', itemBlocked);
          blockedBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
          blockedBtn.setAttribute(
            'aria-label',
            itemBlocked
              ? 'D\u00e9bloquer la sous-t\u00e2che'
              : 'Marquer la sous-t\u00e2che comme bloqu\u00e9e'
          );
          blockedBtn.title = itemBlocked ? 'D\u00e9bloquer' : 'Bloqu\u00e9';
          blockedBtn.disabled = !!item.done;
        }
        if (completeBtn) {
          completeBtn.classList.toggle('is-complete', !!item.done);
          completeBtn.setAttribute('aria-pressed', item.done ? 'true' : 'false');
          completeBtn.setAttribute(
            'aria-label',
            item.done
              ? 'Marquer comme non termin\u00e9'
              : 'Marquer comme termin\u00e9'
          );
          completeBtn.title = item.done
            ? 'Non termin\u00e9 \u2014 maintenir + glisser pour ajuster'
            : 'Terminer \u2014 maintenir + glisser pour ajuster';
          completeBtn.disabled = !!itemBlocked;
        }
        if (!isLinked) {
          M.syncBlockedMotifMount(
            li,
            itemBlocked,
            item.blockedReasons || [],
            function (reasons) {
              M.data = M.CT.setItemBlockedReasons(M.data, item.id, reasons);
              var live = M.findLiveItem(item.id);
              if (live) item.blockedReasons = live.blockedReasons;
              M.emitChange();
              M.notifyBlockedChange('item-reason');
              M.onResize();
            },
            'tp-completion-item-motif'
          );
        }
      }

      if (readOnly) {
        if (checkBtn) checkBtn.disabled = true;
        if (itemSlider) itemSlider.disabled = true;
        if (deleteBtn) deleteBtn.hidden = true;
        if (blockedBtn) blockedBtn.disabled = true;
        if (promoteBtn) promoteBtn.hidden = true;
        if (completeBtn) completeBtn.disabled = true;
        if (textLink) {
          textLink.addEventListener('click', function (e) {
            e.preventDefault();
            M.openLinkedCard(M.CT.itemLinkedCardId(item));
          });
        }
        syncItemProgressUi();
        return;
      }

      if (promoteBtn && !isLinked) {
        promoteBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (promoteBtn.disabled) return;
          promoteBtn.disabled = true;
          promoteBtn.classList.add('is-busy');
          M.promoteItemToCard(item).finally(function () {
            promoteBtn.disabled = false;
            promoteBtn.classList.remove('is-busy');
          });
        });
      }

      function toggleItemDone(originBtn) {
        if (isLinked) {
          M.openLinkedCard(M.CT.itemLinkedCardId(item));
          return;
        }
        // Pause icon on circular check means blocked — unblock instead of completing.
        if (M.CT.isItemBlocked(item)) {
          M.data = M.CT.setItemBlocked(M.data, item.id, false);
          M.emitChange();
          M.notifyBlockedChange('item-check');
          M.onResize();
          return;
        }
        var wasDone = !!item.done;
        M.setItemProgress(item, item.done ? 0 : 100);
        if (itemSlider) itemSlider.value = String(item.progress);
        syncItemProgressUi();
        var becomingDone = !wasDone && !!item.done;
        var becomingUndone = wasDone && !item.done;
        var popOrigin = null;
        var origin = originBtn || checkBtn;
        if (becomingDone && origin && origin.getBoundingClientRect) {
          var checkRect = origin.getBoundingClientRect();
          popOrigin = {
            x: checkRect.left + checkRect.width / 2,
            y: checkRect.top + checkRect.height / 2
          };
        }
        M.emitChange({
          animateItemId: item.id,
          flipWasDone: wasDone,
          focusTextItemId: item.id,
        });
        if (becomingDone) {
          // Prefer the rebuilt checkbox so the scale pop lands on the new node.
          var nextRow = M.findItemRow(item.id);
          var nextCheck = nextRow && nextRow.querySelector('.tp-completion-check');
          S.playSubtaskCompletePop(nextCheck || popOrigin, { sound: true });
        } else if (becomingUndone) {
          S.playCompletionUiSound('uncomplete');
        }
        M.onResize();
      }

      checkBtn.addEventListener('click', function () {
        toggleItemDone(checkBtn);
      });

      function setItemProgressFromFader(p, meta) {
        M.setItemProgress(item, p);
        if (itemSlider) itemSlider.value = String(item.progress);
        S.playSliderProgressTick(p);
        syncItemProgressUi();
        M.updateProgressUi({ deferDoneListReveal: true });
        M.onChange(M.CT.normalizeCompletionData(M.data));
        if (!meta.commit) return;
        var wasDone = meta.startProgress >= 100;
        var nowDone = !!item.done;
        if (wasDone !== nowDone) {
          var becomingDone = !wasDone && nowDone;
          M.emitChange({
            animateItemId: item.id,
            flipWasDone: wasDone,
            focusTextItemId: item.id,
          });
          if (becomingDone) {
            var nextRow = M.findItemRow(item.id);
            var nextCheck =
              nextRow && nextRow.querySelector('.tp-completion-check');
            S.playSubtaskCompletePop(nextCheck || checkBtn, { sound: true });
          } else {
            S.playCompletionUiSound('uncomplete');
          }
        } else {
          M.renderList();
        }
        M.onResize();
      }

      S.bindProgressFader(checkBtn, {
        getProgress: function () {
          return M.CT.itemProgress(item);
        },
        setProgress: setItemProgressFromFader,
        isEnabled: function () {
          return !isLinked && !M.CT.isItemBlocked(item);
        },
        visualEls: completeBtn ? [completeBtn] : null,
        hudAnchor: checkWrap,
      });

      if (completeBtn) {
        completeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (completeBtn.disabled) return;
          toggleItemDone(completeBtn);
        });
        S.bindProgressFader(completeBtn, {
          getProgress: function () {
            return M.CT.itemProgress(item);
          },
          setProgress: setItemProgressFromFader,
          isEnabled: function () {
            return !completeBtn.disabled && !M.CT.isItemBlocked(item);
          },
          visualEls: [checkBtn],
          hudAnchor: checkWrap,
        });
      }

      if (itemSlider && !isLinked) {
        function handleItemSlider() {
          var v = Number(itemSlider.value);
          M.setItemProgress(item, v);
          S.playSliderProgressTick(v);
          syncItemProgressUi();
          M.updateProgressUi({ deferDoneListReveal: true });
          M.onChange(M.CT.normalizeCompletionData(M.data));
        }

        itemSlider.addEventListener('input', handleItemSlider);
        itemSlider.addEventListener('change', function () {
          var wasDone = li.classList.contains('is-done');
          handleItemSlider();
          var nowDone = !!item.done;
          if (wasDone !== nowDone) {
            var becomingDone = !wasDone && nowDone;
            var popOrigin = null;
            if (becomingDone && checkBtn.getBoundingClientRect) {
              var sliderCheckRect = checkBtn.getBoundingClientRect();
              popOrigin = {
                x: sliderCheckRect.left + sliderCheckRect.width / 2,
                y: sliderCheckRect.top + sliderCheckRect.height / 2
              };
            }
            M.emitChange({
              animateItemId: item.id,
              flipWasDone: wasDone,
              focusTextItemId: item.id,
            });
            if (becomingDone) {
              var nextRow = M.findItemRow(item.id);
              var nextCheck = nextRow && nextRow.querySelector('.tp-completion-check');
              // Slider already played the 100% tick — silent visual pop only.
              S.playSubtaskCompletePop(nextCheck || popOrigin, { sound: false });
            } else if (wasDone && !nowDone) {
              S.playCompletionUiSound('uncomplete');
            }
          } else {
            M.renderList();
          }
          M.onResize();
        });
      }

      if (textLink) {
        textLink.addEventListener('click', function (e) {
          e.preventDefault();
          M.openLinkedCard(M.CT.itemLinkedCardId(item));
        });
      }

      if (textInput && !isLinked) {
        textInput.addEventListener('change', function () {
          var trimmed = textInput.value.trim();
          if (!trimmed) {
            M.removeItem(item.id, { silent: true });
            return;
          }
          item.text = trimmed;
          delete M.itemSpellReverts[item.id];
          M.clearSplitRevertTracking([item.id]);
          var persisted = M.applyNormalizedKeepingDrafts(M.data);
          M.updateProgressUi();
          M.onChange(persisted);
          M.refineItemAfterCommit(item.id, trimmed);
        });

        // Discard untitled drafts when focus leaves without a name
        // (change does not fire if the field stayed empty).
        textInput.addEventListener('blur', function () {
          if (M.suppressEmptyDraftDiscard) return;
          if (!(textInput.value || '').trim()) {
            M.removeItem(item.id, { silent: true });
          }
        });

        textInput.addEventListener('input', function () {
          delete M.itemSpellReverts[item.id];
          M.clearSplitRevertTracking([item.id]);
          if (M.spellcheckingItemIds[item.id]) {
            M.itemSpellTokens[item.id] = (M.itemSpellTokens[item.id] || 0) + 1;
            delete M.spellcheckingItemIds[item.id];
            M.paintItemSpellchecking(item.id);
          }
          var existing = li.querySelector('.tp-spell-revert');
          if (existing && typeof existing._spellRevertDismiss === 'function') {
            existing._spellRevertDismiss();
          }
        });

        textInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            textInput.blur();
          }
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
          M.removeItem(item.id);
        });
      }

      if (blockedBtn) {
        blockedBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (item.done) return;
          M.toggleItemBlocked(item.id);
        });
      }

      syncItemProgressUi();

      if (
        !isLinked &&
        M.itemSpellReverts[item.id] &&
        M.itemSpellReverts[item.id] !== (item.text || '').trim()
      ) {
        M.showItemSpellRevert(item.id, M.itemSpellReverts[item.id]);
      } else if (M.itemSpellReverts[item.id]) {
        delete M.itemSpellReverts[item.id];
      }
      if (!isLinked && M.itemSplitReverts[item.id]) {
        M.showItemSplitRevert(item.id);
      }

      if (
        !readOnly &&
        global.ContextMenu &&
        typeof global.ContextMenu.bind === 'function' &&
        typeof global.ContextMenu.buildCompletionItemItems === 'function'
      ) {
        ContextMenu.bind(li, function () {
          var detailsBtn = li.querySelector('.tp-completion-checklist-details-btn');
          var checklistAddBtn = li.querySelector(
            '.tp-completion-checklist-add-btn'
          );
          return ContextMenu.buildCompletionItemItems({
            done: !!item.done,
            blocked: M.CT.isItemBlocked(item),
            linked: isLinked,
            canPromote: !!(promoteBtn && !promoteBtn.disabled),
            toggleDisabled: false,
            onToggleDone: function () {
              toggleItemDone(checkBtn);
            },
            onToggleBlocked: function () {
              if (item.done) return;
              M.toggleItemBlocked(item.id);
            },
            onShowProgress: function () {
              if (detailsBtn) detailsBtn.click();
            },
            onAddChecklist: function () {
              if (checklistAddBtn) checklistAddBtn.click();
            },
            onPromote: function () {
              if (promoteBtn) promoteBtn.click();
            },
            onOpenLinked: function () {
              M.openLinkedCard(M.CT.itemLinkedCardId(item));
            },
            onDelete: function () {
              M.removeItem(item.id);
            },
          });
        });
      }
    };
    M.renderNestedNode = function renderNestedNode(node, depth) {
      var li = document.createElement('li');
      li.className =
        'tp-completion-item tp-completion-item--nested' +
        (node.done ? ' is-done' : '') +
        (node.linkedCardId ? ' is-linked' : '') +
        (node.isCycle ? ' is-cycle' : '');
      li.dataset.depth = String(depth);
      if (node.id) li.dataset.id = 'nested-' + node.id;
      if (node.linkedCardId) li.dataset.linkedCardId = node.linkedCardId;

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main';

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className =
        'tp-completion-check' + (node.done ? ' is-checked' : '');
      checkBtn.innerHTML = M.CHECK_ICON_SVG;
      checkBtn.disabled = true;
      M.syncCheckButton(checkBtn, !!node.done, node.progress);
      checkWrap.appendChild(checkBtn);

      var titleEl;
      if (node.linkedCardId && !node.isCycle) {
        titleEl = document.createElement('button');
        titleEl.type = 'button';
        titleEl.className = 'tp-completion-text-link';
        titleEl.textContent = node.text || 'Carte li\u00e9e';
        titleEl.title = 'Ouvrir la carte';
        titleEl.addEventListener('click', function () {
          M.openLinkedCard(node.linkedCardId);
        });
      } else {
        titleEl = document.createElement('span');
        titleEl.className = 'tp-completion-text tp-completion-text--readonly';
        titleEl.textContent = node.text || '';
        if (node.isCycle) {
          titleEl.title = 'Lien circulaire \u2014 d\u00e9j\u00e0 affich\u00e9 plus haut';
        }
      }

      var pctEl = document.createElement('span');
      pctEl.className = 'tp-completion-nested-pct';
      pctEl.textContent = M.CT.clampProgress(node.progress) + '\u00a0%';
      pctEl.style.color = S.completionColorForProgress(node.progress);

      mainRow.appendChild(checkWrap);
      mainRow.appendChild(titleEl);
      mainRow.appendChild(pctEl);
      li.appendChild(mainRow);

      if (node.isCycle) {
        var cycleHint = document.createElement('p');
        cycleHint.className = 'tp-completion-cycle-hint';
        cycleHint.textContent = 'Lien circulaire';
        li.appendChild(cycleHint);
      }

      return li;
    };
    M.appendNestedChildren = function appendNestedChildren(listTarget, parentItem, treeNode) {
      if (!treeNode || !Array.isArray(treeNode.children) || !treeNode.children.length) {
        return;
      }
      treeNode.children.forEach(function (child) {
        listTarget.appendChild(M.renderNestedNode(child, 2));
      });
    };
    M.renderItem = function renderItem(item, opts) {
      opts = opts || {};
      var isLinked = M.CT.isLinkedItem(item);
      var treeNode = M.linkedTreeByItemId[item.id] || null;
      var itemBlocked = M.CT.isItemBlocked(item);
      var li = document.createElement('li');
      li.className =
        'tp-completion-item tp-completion-item--depth1' +
        (item.done ? ' is-done' : '') +
        (itemBlocked ? ' is-blocked' : '') +
        (isLinked ? ' is-linked' : '') +
        (M.selected[S.selectionKeyForItem(item.id)] ? ' is-selected' : '');
      li.dataset.id = item.id;
      li.dataset.depth = '1';
      if (isLinked) li.dataset.linkedCardId = M.CT.itemLinkedCardId(item);

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main';

      var selectBox = M.createSelectCheckbox(S.selectionKeyForItem(item.id), true);
      mainRow.appendChild(selectBox);

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'tp-completion-check' + (item.done ? ' is-checked' : '');
      checkBtn.innerHTML = M.CHECK_ICON_SVG;
      M.syncCheckButton(checkBtn, item.done, M.CT.itemProgress(item), {
        blocked: itemBlocked
      });
      checkWrap.appendChild(checkBtn);

      var titleEl;
      if (isLinked) {
        titleEl = document.createElement('button');
        titleEl.type = 'button';
        titleEl.className = 'tp-completion-text-link';
        titleEl.textContent = item.text;
        titleEl.title = 'Ouvrir la carte li\u00e9e';
        titleEl.setAttribute('aria-label', 'Ouvrir\u00a0: ' + item.text);
      } else {
        titleEl = document.createElement('input');
        titleEl.type = 'text';
        titleEl.className = 'tp-input tp-completion-text';
        titleEl.value = item.text;
        titleEl.placeholder = 'Nouvelle sous-t\u00e2che\u2026';
        titleEl.setAttribute('aria-label', 'Texte de la sous-t\u00e2che');
        if (M.spellcheckingItemIds[item.id]) {
          titleEl.classList.add('is-spellchecking');
          titleEl.setAttribute('aria-busy', 'true');
        }
      }

      var blockedBtn = document.createElement('button');
      blockedBtn.type = 'button';
      blockedBtn.className =
        'tp-completion-blocked-btn' + (itemBlocked ? ' is-blocked' : '');
      blockedBtn.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
      blockedBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
      blockedBtn.setAttribute(
        'aria-label',
        itemBlocked
          ? 'D\u00e9bloquer la sous-t\u00e2che'
          : 'Marquer la sous-t\u00e2che comme bloqu\u00e9e'
      );
      blockedBtn.title = itemBlocked ? 'D\u00e9bloquer' : 'Bloqu\u00e9';
      if (item.done) blockedBtn.disabled = true;

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', isLinked ? 'Retirer le lien' : 'Supprimer');
      deleteBtn.title = isLinked ? 'Retirer le lien' : 'Supprimer';
      deleteBtn.innerHTML = M.TRASH_ICON_SVG;

      var completeBtn = null;
      if (!isLinked) {
        completeBtn = document.createElement('button');
        completeBtn.type = 'button';
        completeBtn.className =
          'tp-completion-item-complete' + (item.done ? ' is-complete' : '');
        completeBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
        completeBtn.setAttribute('aria-pressed', item.done ? 'true' : 'false');
        completeBtn.setAttribute(
          'aria-label',
          item.done
            ? 'Marquer comme non termin\u00e9'
            : 'Marquer comme termin\u00e9'
        );
        completeBtn.title = item.done
          ? 'Non termin\u00e9 \u2014 maintenir + glisser pour ajuster'
          : 'Terminer \u2014 maintenir + glisser pour ajuster';
        if (itemBlocked) completeBtn.disabled = true;
      }

      var promoteBtn = null;
      if (!isLinked && M.CT.itemHasChecklist(item)) {
        promoteBtn = document.createElement('button');
        promoteBtn.type = 'button';
        promoteBtn.className = 'tp-completion-promote';
        promoteBtn.innerHTML =
          '<i class="ti ti-square-arrow-up" aria-hidden="true"></i>';
        promoteBtn.setAttribute('aria-label', 'Convertir en carte');
        promoteBtn.title = 'Convertir en carte';
      }

      mainRow.appendChild(titleEl);
      if (!isLinked && M.spellcheckingItemIds[item.id]) {
        var spellSpinner = document.createElement('span');
        spellSpinner.className = 'tp-completion-spell-spinner';
        spellSpinner.setAttribute('aria-hidden', 'true');
        spellSpinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        mainRow.appendChild(spellSpinner);
      }

      var detailsBtn = null;
      if (!isLinked) {
        detailsBtn = document.createElement('button');
        detailsBtn.type = 'button';
        detailsBtn.className = 'tp-completion-checklist-details-btn';
        detailsBtn.innerHTML =
          '<i class="ti ti-chevron-down" aria-hidden="true"></i>';
        detailsBtn.setAttribute('aria-expanded', 'false');
        detailsBtn.setAttribute('aria-label', 'Progr\u00e8s');
        detailsBtn.title = 'Progr\u00e8s';
        mainRow.appendChild(detailsBtn);

        var itemEstimate = S.createEstimateChip(M.CT, {
          t: M.trelloT,
          scales: M.currentEstimateScales(),
          minutes: M.CT.itemEstimatedMinutes(item, M.linkedSnapshots),
          compact: true,
          estimating: !!M.estimatingItemIds[item.id],
          ariaLabel: 'Estimation de la sous-t\u00e2che',
          onChange: function (mins) {
            delete M.estimatingItemIds[item.id];
            M.data = M.CT.applyItemEstimate(M.data, item.id, mins, { lock: true });
            var live = M.findLiveItem(item.id);
            if (live) {
              item.estimatedMinutes = live.estimatedMinutes;
              item.estimatedMinutesLocked = live.estimatedMinutesLocked;
            }
            M.updateProgressUi();
            M.emitChange();
            M.onResize();
          }
        });
        itemEstimate.el.dataset.estimateItemId = item.id;
        itemEstimate.el.classList.add('tp-completion-item-estimate');
        mainRow.appendChild(itemEstimate.el);
      }

      if (promoteBtn) mainRow.appendChild(promoteBtn);
      mainRow.appendChild(blockedBtn);
      if (completeBtn) mainRow.appendChild(completeBtn);
      mainRow.appendChild(deleteBtn);

      // Progress circle stays on the title row (after the selection checkbox).
      mainRow.insertBefore(checkWrap, selectBox.nextSibling);

      li.appendChild(mainRow);

      var checklistUi = null;
      if (!isLinked) {
        checklistUi = M.renderChecklistSection(item);
        // Nested-add sits immediately right of the checkmark (Terminer) control.
        if (checklistUi.addBtn) {
          if (completeBtn) {
            mainRow.insertBefore(checklistUi.addBtn, completeBtn.nextSibling);
          } else {
            mainRow.insertBefore(checklistUi.addBtn, deleteBtn);
          }
        }

        var details = document.createElement('div');
        details.className = 'tp-completion-checklist-details';
        details.hidden = true;

        var sliderRow = document.createElement('div');
        sliderRow.className = 'tp-completion-item-slider-row';

        var itemProgressVal = M.CT.itemProgress(item);

        var sliderWrap = document.createElement('div');
        sliderWrap.className = 'field-slider';

        var itemSlider = document.createElement('input');
        itemSlider.type = 'range';
        itemSlider.className = 'field-range tp-completion-item-slider';
        itemSlider.min = '0';
        itemSlider.max = '100';
        itemSlider.step = '1';
        itemSlider.value = String(itemProgressVal);
        itemSlider.setAttribute('aria-label', 'Progr\u00e8s de la sous-t\u00e2che');
        S.applySliderProgressTrack(itemSlider, itemProgressVal, {
          blocked: itemBlocked
        });

        var itemValEl = document.createElement('span');
        itemValEl.className = 'tp-completion-item-val tp-completion-field-val';
        itemValEl.textContent = itemProgressVal + '\u00a0%';
        if (itemBlocked) itemValEl.style.color = M.BLOCKED_ACCENT;

        // Complete and pause act through the circle's own buttons, so the
        // rules (unblock first, reasons, sounds) stay in one place.
        var checkMiniBtn = document.createElement('button');
        checkMiniBtn.type = 'button';
        checkMiniBtn.className = 'tp-completion-item-row-check';
        checkMiniBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
        checkMiniBtn.setAttribute('aria-label', 'Marquer comme terminée');
        checkMiniBtn.title = 'Terminer';
        checkMiniBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (completeBtn && !completeBtn.disabled) completeBtn.click();
        });

        var pauseMiniBtn = document.createElement('button');
        pauseMiniBtn.type = 'button';
        pauseMiniBtn.className = 'tp-completion-item-row-pause' + (itemBlocked ? ' is-blocked' : '');
        pauseMiniBtn.innerHTML = '<i class="ti ti-player-pause" aria-hidden="true"></i>';
        pauseMiniBtn.setAttribute('aria-pressed', itemBlocked ? 'true' : 'false');
        pauseMiniBtn.setAttribute('aria-label', itemBlocked ? 'Débloquer la sous-tâche' : 'Bloquer la sous-tâche');
        pauseMiniBtn.title = itemBlocked ? 'Débloquer' : 'Bloquer';
        pauseMiniBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (blockedBtn && !blockedBtn.disabled) blockedBtn.click();
        });

        var addSubBtn = document.createElement('button');
        addSubBtn.type = 'button';
        addSubBtn.className = 'tp-completion-item-row-add';
        addSubBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i><span>Ajouter une sous-tâche</span>';
        addSubBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (checklistUi && checklistUi.addBtn) checklistUi.addBtn.click();
        });

        sliderWrap.appendChild(itemSlider);
        sliderRow.appendChild(checkMiniBtn);
        sliderRow.appendChild(sliderWrap);
        sliderRow.appendChild(itemValEl);
        sliderRow.appendChild(pauseMiniBtn);
        details.appendChild(sliderRow);
        details.appendChild(addSubBtn);
        li.appendChild(details);

        // Remember which progress panels are open so a rebuild (after a drag)
        // does not fold them back.
        var detailsOpen = !!M.openItemDetailIds[item.id];
        details.hidden = !detailsOpen;
        if (detailsBtn) {
          detailsBtn.setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
          detailsBtn.classList.toggle('is-open', detailsOpen);
          detailsBtn.addEventListener('click', function (e) {
            e.preventDefault();
            var open = details.hidden;
            details.hidden = !open;
            if (open) M.openItemDetailIds[item.id] = true;
            else delete M.openItemDetailIds[item.id];
            detailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            detailsBtn.classList.toggle('is-open', open);
            M.onResize();
          });
        }

        if (itemBlocked) {
          var motif = M.createBlockedMotifField({
            className: 'tp-completion-item-motif',
            blockedReasons: item.blockedReasons || [],
            onChange: function (reasons) {
              M.data = M.CT.setItemBlockedReasons(M.data, item.id, reasons);
              var live = M.findLiveItem(item.id);
              if (live) item.blockedReasons = live.blockedReasons;
              M.emitChange();
              M.notifyBlockedChange('item-reason');
              M.onResize();
            }
          });
          if (motif) li.appendChild(motif.el);
        }

        li.appendChild(checklistUi.section);
      } else {
        var linkMeta = document.createElement('div');
        linkMeta.className = 'tp-completion-link-meta';
        var linkHint = document.createElement('span');
        linkHint.className = 'tp-completion-link-hint';
        linkHint.textContent =
          treeNode && treeNode.isCycle
            ? 'Lien circulaire'
            : 'Carte li\u00e9e';
        var linkPct = document.createElement('span');
        linkPct.className = 'tp-completion-link-pct';
        linkPct.textContent = M.CT.itemProgress(item) + '\u00a0%';
        linkPct.style.color = S.completionColorForProgress(M.CT.itemProgress(item));
        linkMeta.appendChild(linkHint);
        linkMeta.appendChild(linkPct);
        var linkMins = M.CT.itemEstimatedMinutes(item, M.linkedSnapshots);
        if (linkMins != null) {
          var linkEstimate = S.createEstimateChip(M.CT, {
            scales: M.currentEstimateScales(),
            minutes: linkMins,
            compact: true,
            readOnly: true,
            ariaLabel: 'Estimation de la carte li\u00e9e'
          });
          linkMeta.appendChild(linkEstimate.el);
        }
        li.appendChild(linkMeta);
      }

      M.bindItemRow(li, item, { readOnly: !!opts.readOnly, promoteBtn: promoteBtn });
      return li;
    };
    M.renderChecklistSection = function renderChecklistSection(parentItem) {
      var section = document.createElement('div');
      section.className = 'tp-completion-checklist';
      section.dataset.parentId = parentItem.id;

      var checklist = Array.isArray(parentItem.items) ? parentItem.items : [];

      var list = document.createElement('ul');
      list.className = 'tp-completion-checklist-list';
      checklist.forEach(function (nested) {
        list.appendChild(M.renderChecklistItem(parentItem, nested));
      });
      section.appendChild(list);

      var addRow = document.createElement('div');
      addRow.className = 'tp-completion-checklist-add';
      var addInput = document.createElement('input');
      addInput.type = 'text';
      addInput.className = 'tp-input tp-completion-checklist-add-input';
      addInput.placeholder = 'Ajouter une sous-sous-t\u00e2che\u2026';
      addInput.setAttribute('aria-label', 'Nouvelle sous-sous-t\u00e2che');
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'tp-completion-checklist-add-btn';
      addBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
      addBtn.setAttribute('aria-label', 'Ajouter une sous-sous-t\u00e2che');
      addBtn.setAttribute('aria-expanded', 'false');
      addBtn.title = 'Ajouter une sous-sous-t\u00e2che';

      function setChecklistAddOpen(open) {
        var nextOpen = !!open;
        addRow.classList.toggle('is-open', nextOpen);
        addBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        if (nextOpen) {
          setTimeout(function () {
            addInput.focus();
          }, 0);
        }
        M.onResize();
      }

      function submitChecklistAdd() {
        var text = addInput.value.trim();
        if (!text) {
          setChecklistAddOpen(true);
          return;
        }
        var result = M.CT.addChecklistItem(M.data, parentItem.id, text);
        if (!result || !result.item) return;
        M.data = result.data;
        addInput.value = '';
        S.playCompletionUiSound('add');
        M.emitChange({ focusTextItemId: parentItem.id });
        M.onResize();
      }

      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!addRow.classList.contains('is-open')) {
          setChecklistAddOpen(true);
          return;
        }
        submitChecklistAdd();
      });
      addInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitChecklistAdd();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          addInput.value = '';
          setChecklistAddOpen(false);
        }
      });
      addInput.addEventListener('blur', function () {
        setTimeout(function () {
          if (!addInput.value.trim() && document.activeElement !== addBtn) {
            setChecklistAddOpen(false);
          }
        }, 0);
      });

      addRow.appendChild(addInput);
      section.appendChild(addRow);
      return { section: section, addBtn: addBtn };
    };
    M.renderChecklistItem = function renderChecklistItem(parentItem, nested) {
      var li = document.createElement('li');
      var nestedProgress = M.CT.itemProgress(nested);
      li.className =
        'tp-completion-checklist-item tp-completion-item--depth2' +
        (nested.done ? ' is-done' : '') +
        (M.selected[S.selectionKeyForChecklist(parentItem.id, nested.id)]
          ? ' is-selected'
          : '');
      li.dataset.id = nested.id;
      li.dataset.parentId = parentItem.id;
      li.dataset.depth = '2';

      var mainRow = document.createElement('div');
      mainRow.className = 'tp-completion-item-main tp-completion-checklist-main';

      var selectBox = M.createSelectCheckbox(
        S.selectionKeyForChecklist(parentItem.id, nested.id),
        false
      );
      mainRow.appendChild(selectBox);

      var checkWrap = document.createElement('div');
      checkWrap.className = 'tp-completion-check-wrap';
      var checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className =
        'tp-completion-check' + (nested.done ? ' is-checked' : '');
      checkBtn.innerHTML = M.CHECK_ICON_SVG;
      M.syncCheckButton(checkBtn, !!nested.done, nestedProgress);
      checkWrap.appendChild(checkBtn);

      var titleEl = document.createElement('input');
      titleEl.type = 'text';
      titleEl.className = 'tp-input tp-completion-text tp-completion-checklist-text';
      titleEl.value = nested.text || '';
      titleEl.placeholder = 'Sous-sous-t\u00e2che\u2026';
      titleEl.setAttribute('aria-label', 'Texte de la sous-sous-t\u00e2che');

      var detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'tp-completion-checklist-details-btn';
      detailsBtn.innerHTML =
        '<i class="ti ti-chevron-down" aria-hidden="true"></i>';
      detailsBtn.setAttribute('aria-expanded', 'false');
      detailsBtn.setAttribute('aria-label', 'Progr\u00e8s');
      detailsBtn.title = 'Progr\u00e8s';

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tp-completion-delete';
      deleteBtn.setAttribute('aria-label', 'Supprimer');
      deleteBtn.title = 'Supprimer';
      deleteBtn.innerHTML = M.TRASH_ICON_SVG;

      var nestedEstimate = S.createEstimateChip(M.CT, {
        t: M.trelloT,
        scales: M.currentEstimateScales(),
        minutes: M.CT.clampEstimatedMinutes(nested.estimatedMinutes),
        compact: true,
        ariaLabel: 'Estimation de la sous-sous-t\u00e2che',
        onChange: function (mins) {
          M.data = M.CT.applyChecklistItemEstimate(
            M.data,
            parentItem.id,
            nested.id,
            mins,
            { lock: true }
          );
          M.emitChange();
          M.onResize();
        }
      });
      nestedEstimate.el.classList.add('tp-completion-item-estimate');

      mainRow.appendChild(checkWrap);
      mainRow.appendChild(titleEl);
      mainRow.appendChild(detailsBtn);
      mainRow.appendChild(nestedEstimate.el);
      mainRow.appendChild(deleteBtn);
      li.appendChild(mainRow);

      var details = document.createElement('div');
      details.className = 'tp-completion-checklist-details';
      details.hidden = true;

      var sliderRow = document.createElement('div');
      sliderRow.className = 'tp-completion-item-slider-row';

      var sliderWrap = document.createElement('div');
      sliderWrap.className = 'field-slider';
      var itemSlider = document.createElement('input');
      itemSlider.type = 'range';
      itemSlider.className = 'field-range tp-completion-item-slider';
      itemSlider.min = '0';
      itemSlider.max = '100';
      itemSlider.step = '1';
      itemSlider.value = String(nestedProgress);
      itemSlider.setAttribute('aria-label', 'Progr\u00e8s de la sous-sous-t\u00e2che');
      S.applySliderProgressTrack(itemSlider, nestedProgress);

      var itemValEl = document.createElement('span');
      itemValEl.className = 'tp-completion-item-val tp-completion-field-val';
      itemValEl.textContent = nestedProgress + '\u00a0%';

      sliderWrap.appendChild(itemSlider);
      sliderRow.appendChild(sliderWrap);
      sliderRow.appendChild(itemValEl);
      details.appendChild(sliderRow);
      li.appendChild(details);

      function syncNestedUi() {
        var liveParent = M.findLiveItem(parentItem.id);
        var liveNested = null;
        if (liveParent && Array.isArray(liveParent.items)) {
          for (var i = 0; i < liveParent.items.length; i++) {
            if (liveParent.items[i].id === nested.id) {
              liveNested = liveParent.items[i];
              break;
            }
          }
        }
        var p = liveNested ? M.CT.itemProgress(liveNested) : M.CT.itemProgress(nested);
        var done = liveNested ? !!liveNested.done : !!nested.done;
        if (liveNested) {
          nested.progress = liveNested.progress;
          nested.done = liveNested.done;
        }
        itemSlider.value = String(p);
        S.applySliderProgressTrack(itemSlider, p);
        itemValEl.textContent = p + '\u00a0%';
        M.syncCheckButton(checkBtn, done, p);
        li.classList.toggle('is-done', done);
      }

      detailsBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var open = details.hidden;
        details.hidden = !open;
        detailsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        detailsBtn.classList.toggle('is-open', open);
        M.onResize();
      });

      checkBtn.addEventListener('click', function () {
        var next = nested.done ? 0 : 100;
        M.data = M.CT.applyChecklistItemProgress(
          M.data,
          parentItem.id,
          nested.id,
          next
        );
        syncNestedUi();
        M.emitChange({
          animateItemId: parentItem.id,
          flipWasDone: !!parentItem.done,
        });
        if (next >= 100) {
          S.playSubtaskCompletePop(checkBtn, { sound: true });
        } else {
          S.playCompletionUiSound('uncomplete');
        }
        M.onResize();
      });

      S.bindProgressFader(checkBtn, {
        getProgress: function () {
          return M.CT.itemProgress(nested);
        },
        setProgress: function (p, meta) {
          M.data = M.CT.applyChecklistItemProgress(
            M.data,
            parentItem.id,
            nested.id,
            p
          );
          S.playSliderProgressTick(p);
          syncNestedUi();
          M.updateProgressUi({ deferDoneListReveal: true });
          M.onChange(M.CT.normalizeCompletionData(M.data));
          if (!meta.commit) return;
          var wasDone = meta.startProgress >= 100;
          var nowDone = !!nested.done;
          if (wasDone !== nowDone) {
            M.emitChange({
              animateItemId: parentItem.id,
              flipWasDone: wasDone,
            });
            if (nowDone) {
              S.playSubtaskCompletePop(checkBtn, { sound: true });
            } else {
              S.playCompletionUiSound('uncomplete');
            }
          } else {
            M.renderList();
          }
          M.onResize();
        },
        hudAnchor: checkWrap,
      });

      function handleNestedSlider() {
        var v = Number(itemSlider.value);
        M.data = M.CT.applyChecklistItemProgress(
          M.data,
          parentItem.id,
          nested.id,
          v
        );
        S.playSliderProgressTick(v);
        syncNestedUi();
        M.updateProgressUi({ deferDoneListReveal: true });
        M.onChange(M.CT.normalizeCompletionData(M.data));
      }

      itemSlider.addEventListener('input', handleNestedSlider);
      itemSlider.addEventListener('change', function () {
        handleNestedSlider();
        M.emitChange();
        M.onResize();
      });

      titleEl.addEventListener('change', function () {
        var trimmed = titleEl.value.trim();
        if (!trimmed) {
          M.data = M.CT.removeChecklistItem(M.data, parentItem.id, nested.id);
          S.playCompletionUiSound('trash');
          M.emitChange();
          M.onResize();
          return;
        }
        M.data = M.CT.applyChecklistItemText(
          M.data,
          parentItem.id,
          nested.id,
          trimmed
        );
        M.emitChange();
      });
      titleEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          titleEl.blur();
        }
      });

      deleteBtn.addEventListener('click', function () {
        M.data = M.CT.removeChecklistItem(M.data, parentItem.id, nested.id);
        S.playCompletionUiSound('trash');
        M.emitChange();
        M.onResize();
      });

      if (
        global.ContextMenu &&
        typeof global.ContextMenu.bind === 'function' &&
        typeof global.ContextMenu.buildChecklistItemItems === 'function'
      ) {
        ContextMenu.bind(li, function () {
          return ContextMenu.buildChecklistItemItems({
            done: !!nested.done,
            onToggleDone: function () {
              checkBtn.click();
            },
            onShowProgress: function () {
              detailsBtn.click();
            },
            onDelete: function () {
              M.data = M.CT.removeChecklistItem(M.data, parentItem.id, nested.id);
              S.playCompletionUiSound('trash');
              M.emitChange();
              M.onResize();
            },
          });
        });
      }

      return li;
    };
    },
    run: function (M) {

    }
  });
})(typeof window !== 'undefined' ? window : this);
