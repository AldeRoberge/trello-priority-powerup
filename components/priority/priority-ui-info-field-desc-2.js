/**
 * priority-ui-info-field: createInfoField() part 8 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.applyParentChange = function applyParentChange(nextParent, removeParentId) {
      if (!M.onParentChange || M.parentBusy) return;
      M.parentBusy = true;
      M.renderParent();
      var payload =
        nextParent && nextParent.id
          ? nextParent
          : removeParentId
            ? { removeParentId: String(removeParentId) }
            : null;
      Promise.resolve(M.onParentChange(payload))
        .then(function (result) {
          if (result && result.ok === false) {
            var reason = result.reason || 'error';
            var msg =
              reason === 'self'
                ? 'Impossible de lier la carte \u00e0 elle-m\u00eame'
                : reason === 'cycle'
                  ? 'Ce lien cr\u00e9erait une boucle'
                  : 'Impossible de mettre \u00e0 jour la t\u00e2che parente';
            M.setParentStatus(msg, true);
            return;
          }
          if (result && Array.isArray(result.parents)) {
            M.parentCards = S.normalizeParentCards(result.parents);
          } else if (nextParent && nextParent.id) {
            M.parentCards = S.normalizeParentCards(
              M.parentCards.concat([
                {
                  id: String(nextParent.id),
                  name:
                    typeof nextParent.name === 'string' ? nextParent.name : '',
                  list:
                    typeof nextParent.list === 'string' ? nextParent.list : '',
                },
              ])
            );
          } else if (removeParentId) {
            var rid = String(removeParentId);
            M.parentCards = M.parentCards.filter(function (p) {
              return !(p && String(p.id) === rid);
            });
          } else {
            M.parentCards = [];
          }
          M.setParentPickerOpen(false);
          M.setParentStatus('', false);
          M.parentBoardCardsCache = null;
        })
        .catch(function (err) {
          console.error('Info parent change failed', err);
          M.setParentStatus('Impossible de mettre \u00e0 jour la t\u00e2che parente', true);
        })
        .then(function () {
          M.parentBusy = false;
          M.renderParent();
          M.onLayoutChange();
        });
    };
    M.summaryText = function summaryText() {
      if (M.titleText && !M.titleInput.classList.contains('is-loading')) {
        return M.titleText;
      }
      var bits = [];
      if (M.impactReachLabel) bits.push(M.impactReachLabel);
      return bits.join(' \u00b7 ');
    };
    M.flushTitleSave = function flushTitleSave() {
      if (M.titleSaveTimer) {
        clearTimeout(M.titleSaveTimer);
        M.titleSaveTimer = null;
      }
      if (!M.onTitleChange || !M.titleDirty || M.titleBusy) return Promise.resolve();
      var next = (M.titleInput.value || '').trim();
      if (!next) {
        // Trello titles cannot be empty — restore last saved value.
        M.titleInput.value = M.titleText || '';
        M.titleDirty = false;
        M.setTitleStatus('Le titre ne peut pas \u00eatre vide', 'error');
        M.syncTitleInputSize();
        M.onLayoutChange();
        return Promise.resolve({ ok: false, reason: 'empty-name', changed: false });
      }
      if (next === M.titleText) {
        M.titleDirty = false;
        M.titleInput.value = next;
        M.syncTitleInputSize();
        return Promise.resolve({ ok: true, changed: false, name: next });
      }
      M.titleBusy = true;
      M.setTitleStatus('', 'saving');
      return Promise.resolve(M.onTitleChange(next))
        .then(function (result) {
          M.titleBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setTitleStatus('', 'error');
            } else if (result.reason === 'empty-name') {
              M.setTitleStatus('Le titre ne peut pas \u00eatre vide', 'error');
            } else {
              M.setTitleStatus('\u00c9chec de l\u2019enregistrement', 'error');
            }
            return result;
          }
          M.titleDirty = false;
          M.titleText = next;
          M.titleInput.value = next;
          M.setAuthHint('');
          M.setTitleStatus('', 'ok');
          M.collapse.refreshSummary();
          M.scheduleLabelSuggestions(false);
          M.scheduleTaskTypeSuggestions(false);
          setTimeout(function () {
            if (M.titleStatus.classList.contains('is-ok')) M.setTitleStatus('');
          }, 1400);
          M.syncTitleInputSize();
          M.onLayoutChange();
          return result;
        })
        .catch(function (err) {
          M.titleBusy = false;
          console.error('Info title save failed', err);
          M.setTitleStatus('\u00c9chec de l\u2019enregistrement', 'error');
        });
    };
    M.scheduleTitleSave = function scheduleTitleSave() {
      M.titleDirty = true;
      M.setTitleStatus('');
      if (M.titleSaveTimer) clearTimeout(M.titleSaveTimer);
      M.titleSaveTimer = setTimeout(function () {
        M.titleSaveTimer = null;
        M.flushTitleSave();
      }, M.FIELD_SAVE_MS);
    };
    M.setDescSpellchecking = function setDescSpellchecking(on) {
      M.descSpellSpinner.hidden = !on;
      M.descInput.classList.toggle('is-spellchecking', !!on);
      M.descRich.classList.toggle('is-spellchecking', !!on);
      if (on) M.descInput.setAttribute('aria-busy', 'true');
      else M.descInput.removeAttribute('aria-busy');
      if (on) M.descRich.setAttribute('aria-busy', 'true');
      else M.descRich.removeAttribute('aria-busy');
    };
    M.clearDescSpellRevert = function clearDescSpellRevert() {
      if (M.descSpellRevert && typeof M.descSpellRevert.dismiss === 'function') {
        M.descSpellRevert.dismiss();
      }
      M.descSpellRevert = null;
    };
    M.showDescSpellRevert = function showDescSpellRevert(original, corrected) {
      M.clearDescSpellRevert();
      if (
        !original ||
        !corrected ||
        original === corrected ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        return;
      }
      M.descSpellRevert = global.Spellcheck.attachRevert(M.descMeta, {
        before: M.descStatus,
        previous: original,
        onRevert: function () {
          M.descSpellRevert = null;
          if (M.descInput.value !== corrected && M.descInput.value.trim() !== corrected.trim()) {
            return;
          }
          M.descInput.value = original;
          if (M.descMode === 'rich') M.renderDescRich();
          M.descSpellcheckedText = original.trim() || null;
          M.descDirty = true;
          if (M.descMode === 'markdown') M.syncDescInputSize();
          else M.syncDescRichSize();
          M.onLayoutChange();
          M.flushDescSave();
        },
        onDismiss: function () {
          M.descSpellRevert = null;
          M.onLayoutChange();
        }
      });
      M.onLayoutChange();
    };
    M.spellcheckDescText = function spellcheckDescText(text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
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
    M.spellcheckDescAfterCommit = function spellcheckDescAfterCommit() {
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return;
      }
      var snapshot = M.descInput.value;
      var trimmed = snapshot.trim();
      if (!trimmed) {
        M.descSpellcheckedText = snapshot;
        M.setDescSpellchecking(false);
        return;
      }
      if (trimmed === M.descSpellcheckedText) return;
      var gen = ++M.descSpellcheckGen;
      M.setDescSpellchecking(true);
      M.onLayoutChange();
      M.spellcheckDescText(snapshot).then(function (corrected) {
        if (gen !== M.descSpellcheckGen) return;
        M.setDescSpellchecking(false);
        if (!corrected || corrected === trimmed) {
          M.descSpellcheckedText = trimmed;
          M.onLayoutChange();
          return;
        }
        // User edited again while we were checking — discard this correction.
        if (M.descInput.value !== snapshot) {
          M.onLayoutChange();
          return;
        }
        M.descInput.value = corrected;
        if (M.descMode === 'rich') M.renderDescRich();
        M.descSpellcheckedText = corrected.trim();
        M.descDirty = true;
        M.showDescSpellRevert(snapshot, corrected);
        if (M.descMode === 'markdown') M.syncDescInputSize();
        else M.syncDescRichSize();
        M.onLayoutChange();
        M.flushDescSave();
      }).catch(function () {
        if (gen !== M.descSpellcheckGen) return;
        M.setDescSpellchecking(false);
        M.onLayoutChange();
      });
    };
    M.flushDescSave = function flushDescSave() {
      M.syncDescSourceFromRich();
      if (M.descSaveTimer) {
        clearTimeout(M.descSaveTimer);
        M.descSaveTimer = null;
      }
      if (!M.onDescChange || !M.descDirty || M.descBusy) return Promise.resolve();
      var next = M.fullDescFromEditor();
      M.descBusy = true;
      M.setDescStatus('', 'saving');
      return Promise.resolve(M.onDescChange(next))
        .then(function (result) {
          M.descBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              M.setAuthHint(result.reason);
              M.setDescStatus('', 'error');
            } else {
              M.setDescStatus('\u00c9chec de l\u2019enregistrement', 'error');
            }
            return result;
          }
          // Spellcheck (or typing) may have changed the field while this save ran.
          var currentFull = M.fullDescFromEditor();
          if (currentFull !== next) {
            M.descText = next;
            M.descDirty = true;
            M.scheduleDescSave();
            return result;
          }
          M.descDirty = false;
          M.descText = next;
          M.syncDescMetaToggle();
          M.setAuthHint('');
          M.setDescStatus('', 'ok');
          M.scheduleLabelSuggestions(false);
          M.scheduleTaskTypeSuggestions(false);
          setTimeout(function () {
            if (M.descStatus.classList.contains('is-ok')) M.setDescStatus('');
          }, 1400);
          return result;
        })
        .catch(function (err) {
          M.descBusy = false;
          console.error('Info description save failed', err);
          M.setDescStatus('\u00c9chec de l\u2019enregistrement', 'error');
        });
    };
    M.scheduleDescSave = function scheduleDescSave() {
      M.descDirty = true;
      M.setDescStatus('');
      if (M.descSaveTimer) clearTimeout(M.descSaveTimer);
      M.descSaveTimer = setTimeout(function () {
        M.descSaveTimer = null;
        M.flushDescSave();
      }, M.FIELD_SAVE_MS);
    };
    M.moreDetailsSummaryNode = function moreDetailsSummaryNode() {
      var nodes = [];
      var crumbs = M.objectifRow.row.hidden ? [] : M.objectifCrumbNames();
      if (crumbs.length) {
        nodes.push(
          M.irsChip({
            className: 'irs-objectif is-last',
            lead: M.irsIcon('target-arrow'),
            text: crumbs[crumbs.length - 1],
            title: crumbs.join(' \u2192 ')
          })
        );
      }
      if (M.parentCards.length === 1) {
        nodes.push(M.irsParentChip(M.parentCards[0], false));
      } else if (M.parentCards.length > 1) {
        nodes.push(
          M.irsChip({
            className: 'irs-parent',
            lead: M.irsIcon('hierarchy-3'),
            text: M.parentCards.length + ' parents',
            title: M.parentCards
              .map(function (p) {
                return p.name || 'Carte sans titre';
              })
              .join(', ')
          })
        );
      }
      nodes = nodes.concat(M.irsCapped(M.taskTypes.map(M.irsTypeChip), 2));
      nodes = nodes.concat(M.irsCapped(M.labels.map(M.irsLabelChip), 3));
      return nodes.length ? M.irsFragment(nodes) : '';
    };
    M.paintMoreDetailsSummary = function paintMoreDetailsSummary() {
      if (M.moreDetailsExpanded) {
        M.moreSummaryEl.replaceChildren();
        M.moreSummaryEl.hidden = true;
        return;
      }
      var node = M.moreDetailsSummaryNode();
      M.moreSummaryEl.classList.toggle('is-empty', !node);
      if (node) M.moreSummaryEl.replaceChildren(node);
      else M.moreSummaryEl.textContent = 'Objectif, parents, types, \u00e9tiquettes\u2026';
      M.moreSummaryEl.hidden = !M.moreSummaryEl.textContent;
    };
    M.applyMoreDetailsExpanded = function applyMoreDetailsExpanded(next, options) {
      options = options || {};
      var was = M.moreDetailsExpanded;
      M.moreDetailsExpanded = !!next;
      M.moreBody.hidden = !M.moreDetailsExpanded;
      M.moreRow.row.classList.toggle('is-expanded', M.moreDetailsExpanded);
      M.moreToggle.setAttribute(
        'aria-expanded',
        M.moreDetailsExpanded ? 'true' : 'false'
      );
      M.moreToggle.setAttribute(
        'aria-label',
        M.moreDetailsExpanded
          ? 'Replier Plus de d\u00e9tails'
          : 'D\u00e9velopper Plus de d\u00e9tails'
      );
      M.paintMoreDetailsSummary();
      if (was !== M.moreDetailsExpanded && !options.silent) {
        M.onMoreDetailsExpandChange(M.moreDetailsExpanded, options);
      }
      if (!options.silent) M.onLayoutChange();
    };
    },
    run: function (M) {
    M.titleInput.addEventListener('input', function () {
      if (M.titleInput.classList.contains('is-loading')) return;
      M.scheduleTitleSave();
      M.syncTitleInputSize();
      M.onLayoutChange();
    });
    M.titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        M.titleInput.blur();
      }
    });
    M.titleInput.addEventListener('blur', function () {
      M.flushTitleSave();
    });
    M.descInput.addEventListener('input', function () {
      // Invalidate in-flight spellcheck so a stale correction cannot overwrite new typing.
      M.descSpellcheckGen += 1;
      M.setDescSpellchecking(false);
      M.clearDescSpellRevert();
      M.scheduleDescSave();
      M.syncDescInputSize();
      M.syncDescFormatMenuSelection();
      M.onLayoutChange();
    });
    M.descInput.addEventListener('keyup', function () {
      M.syncDescFormatMenuSelection();
    });
    M.descInput.addEventListener('click', function () {
      M.syncDescFormatMenuSelection();
    });
    M.descInput.addEventListener('keydown', function (e) {
      var key = e.key;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        M.applyDescMarkdownInline('**');
        return;
      }
      if (key === 'i' || key === 'I') {
        e.preventDefault();
        M.applyDescMarkdownInline('*');
        return;
      }
      if (key === 'k' || key === 'K') {
        e.preventDefault();
        M.promptDescLinkUrl();
        return;
      }
    });
    M.descInput.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var state = M.getDescEditState();
      if (state.start === state.end) return;
      var url = S.normalizePasteableMarkdownUrl(e.clipboardData.getData('text/plain'));
      if (!url) return;
      e.preventDefault();
      M.applyDescMarkdownLink(url);
    });
    M.descInput.addEventListener('blur', function () {
      // Persist immediately; spellcheck runs async with a small spinner.
      M.flushDescSave();
      M.spellcheckDescAfterCommit();
    });
    M.descRich.addEventListener('input', function () {
      M.descSpellcheckGen += 1;
      M.setDescSpellchecking(false);
      M.clearDescSpellRevert();
      M.syncDescSourceFromRich();
      M.scheduleDescSave();
      M.syncDescRichSize();
      M.syncDescFormatMenuSelection();
      M.onLayoutChange();
    });
    M.descRich.addEventListener('change', function (e) {
      if (!e.target || S.richNodeName(e.target) !== 'INPUT') return;
      M.syncDescSourceFromRich();
      M.scheduleDescSave();
    });
    M.descRich.addEventListener('keyup', M.syncDescFormatMenuSelection);
    M.descRich.addEventListener('mouseup', M.syncDescFormatMenuSelection);
    M.descRich.addEventListener('keydown', function (e) {
      var key = e.key;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        M.execDescRichCommand('bold');
      } else if (key === 'i' || key === 'I') {
        e.preventDefault();
        M.execDescRichCommand('italic');
      } else if (key === 'k' || key === 'K') {
        e.preventDefault();
        M.promptDescLinkUrl();
      }
    });
    M.descRich.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var plain = e.clipboardData.getData('text/plain');
      var pasteUrl = S.normalizePasteableMarkdownUrl(plain);
      var sel = M.getDescRichSelection();
      if (pasteUrl && sel && !sel.isCollapsed) {
        e.preventDefault();
        M.applyDescRichLink(pasteUrl);
        return;
      }
      e.preventDefault();
      var temp = document.createElement('div');
      var html = e.clipboardData.getData('text/html');
      if (html) temp.innerHTML = html;
      else temp.textContent = plain;
      var safeMarkdown = S.markdownFromRichRoot(temp);
      var safeHtml = S.renderMarkdownToHtml(safeMarkdown);
      try {
        document.execCommand('insertHTML', false, safeHtml);
      } catch (err) {
        document.execCommand('insertText', false, plain);
      }
      M.syncDescSourceFromRich();
      M.scheduleDescSave();
      M.syncDescRichSize();
    });
    M.descRich.addEventListener('blur', function () {
      M.syncDescSourceFromRich();
      M.flushDescSave();
      M.spellcheckDescAfterCommit();
    });
    M.descToolbar.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    M.descFormatBtn.addEventListener('click', function () {
      if (M.descFormatMenu.hidden) M.openDescFormatMenu();
      else M.closeDescFormatMenu();
      M.focusDescEditor(false);
    });
    M.descFormatMenu.addEventListener('click', function (e) {
      var opt =
        e.target && e.target.closest
          ? e.target.closest('[data-md-kind]')
          : null;
      if (!opt) return;
      var kind = opt.getAttribute('data-md-kind');
      M.closeDescFormatMenu();
      if (M.descMode === 'rich') M.applyDescRichBlock(kind);
      else M.applyDescMarkdownBlock(kind);
    });
    M.descBoldBtn.addEventListener('click', function () {
      if (M.descMode === 'rich') M.execDescRichCommand('bold');
      else M.applyDescMarkdownInline('**');
    });
    M.descItalicBtn.addEventListener('click', function () {
      if (M.descMode === 'rich') M.execDescRichCommand('italic');
      else M.applyDescMarkdownInline('*');
    });
    M.descStrikeBtn.addEventListener('click', function () {
      if (M.descMode === 'rich') M.execDescRichCommand('strikeThrough');
      else M.applyDescMarkdownInline('~~');
    });
    M.descLinkBtn.addEventListener('click', function () {
      M.promptDescLinkUrl();
    });
    M.descChecklistBtn.addEventListener('click', function () {
      if (M.descMode === 'rich') M.applyDescRichBlock('checklist');
      else M.applyDescMarkdownBlock('checklist');
    });
    M.descModeSwitch.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest
        ? e.target.closest('[data-desc-mode]')
        : null;
      if (!btn) return;
      M.setDescMode(btn.getAttribute('data-desc-mode'));
    });
    document.addEventListener('mousedown', function (e) {
      if (!M.descFormatMenu.hidden && !M.descFormatWrap.contains(e.target)) {
        M.closeDescFormatMenu();
      }
    });
    M.authBtn.addEventListener('click', function () {
      if (!M.onAuthorize || M.authBusy) return;
      M.authBusy = true;
      M.authBtn.disabled = true;
      Promise.resolve(M.onAuthorize())
        .then(function () {
          M.setAuthHint('');
          return M.flushTitleSave();
        })
        .then(function () {
          return M.flushDescSave();
        })
        .catch(function (err) {
          console.error('Info REST authorize failed', err);
          M.setAuthHint('not-authorized');
        })
        .then(function () {
          M.authBusy = false;
          M.authBtn.disabled = false;
          M.onLayoutChange();
        });
    });
    M.membersAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (M.membersAddBtn.disabled) return;
      M.setMembersPickerOpen(!M.membersPickerOpen);
    });
    M.labelsAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (M.labelsAddBtn.disabled) return;
      M.setLabelsPickerOpen(!M.labelsPickerOpen);
    });
    M.taskTypesAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (M.taskTypesAddBtn.disabled) return;
      M.setTaskTypesPickerOpen(!M.taskTypesPickerOpen);
    });
    M.taskTypesCreateIconBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (M.taskTypesBusy) return;
      M.setTaskTypesIconPickerOpen(!M.taskTypesIconPickerOpen);
    });
    M.taskTypesCreateInput.addEventListener('input', function () {
      if (!M.taskTypesPickerOpen) {
        M.syncTaskTypesCreateBtn();
        return;
      }
      M.renderTaskTypesPicker();
      M.onLayoutChange();
      requestAnimationFrame(M.positionTaskTypesPicker);
    });
    M.taskTypesCreateInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    M.taskTypesCreateInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        M.setTaskTypesPickerOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      var q = String(M.taskTypesCreateInput.value || '').trim();
      var matches = M.filteredAvailableTaskTypeEntries(q);
      if (matches.length === 1) {
        M.addTaskType(matches[0].id);
        return;
      }
      if (matches.length > 1 && q) {
        var exact = null;
        var qKey = q.toLocaleLowerCase('fr-FR');
        for (var i = 0; i < matches.length; i++) {
          if (
            String(matches[i].label || '')
              .toLocaleLowerCase('fr-FR') === qKey
          ) {
            exact = matches[i];
            break;
          }
        }
        if (exact) {
          M.addTaskType(exact.id);
          return;
        }
      }
      M.submitCreateTaskType();
    });
    M.taskTypesCreateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      M.submitCreateTaskType();
    });
    window.addEventListener('resize', function () {
      if (M.taskTypesPickerOpen) M.positionTaskTypesPicker();
    });
    document.addEventListener(
      'scroll',
      function () {
        if (M.taskTypesPickerOpen) M.positionTaskTypesPicker();
      },
      true
    );
    M.labelsSearchInput.addEventListener('input', function () {
      if (!M.labelsPickerOpen) return;
      M.renderLabelsPicker();
      M.onLayoutChange();
    });
    M.labelsSearchInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    M.labelsSearchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        M.setLabelsPickerOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var q = String(M.labelsSearchInput.value || '').trim();
      var matches = M.filteredAvailableBoardLabels(q);
      if (matches.length === 1) {
        M.addLabelFromPicker(matches[0]);
        return;
      }
      if (matches.length > 1 && q) {
        var exact = null;
        for (var i = 0; i < matches.length; i++) {
          if (M.labelDisplayName(matches[i]).toLowerCase() === q.toLowerCase()) {
            exact = matches[i];
            break;
          }
        }
        if (exact) {
          M.addLabelFromPicker(exact);
          return;
        }
      }
      if (M.onLabelCreate && q && !M.boardHasLabelName(q)) {
        M.createLabelFromPicker();
      }
    });
    M.labelsCreateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (M.labelsCreateBtn.disabled) {
        try {
          M.labelsSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      if (!String(M.labelsSearchInput.value || '').trim()) {
        try {
          M.labelsSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      M.createLabelFromPicker();
    });
    if (M.labelsSuggestRefreshBtn) {
      M.labelsSuggestRefreshBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        M.refreshLabelSuggestions(true);
      });
    }
    if (M.taskTypesSuggestRefreshBtn) {
      M.taskTypesSuggestRefreshBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        M.refreshTaskTypeSuggestions(true);
      });
    }
    M.parentPickBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (M.parentPickBtn.disabled || !M.getBoardCards) return;
      if (M.parentPickerOpen) M.setParentPickerOpen(false);
      else M.openParentPicker();
    });
    M.parentSearchInput.addEventListener('input', function () {
      M.ensureParentBoardCards().then(function (cards) {
        if (!M.parentPickerOpen) return;
        M.renderParentPickerList(cards, M.parentSearchInput.value);
        M.onLayoutChange();
      });
    });
    M.parentSearchInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    document.addEventListener('click', function (event) {
      if (M.membersPickerOpen && !M.membersAddWrap.contains(event.target)) {
        M.setMembersPickerOpen(false);
      }
      if (!M.tgHost.contains(event.target)) M.tgCloseEditor();
      if (
        M.memberRolesPickerMemberId &&
        !M.membersWrap.contains(event.target)
      ) {
        M.setMemberRolesPickerOpen('');
      }
      if (M.placesPickerSlot && !M.placesWrap.contains(event.target)) {
        M.setPlacesPickerOpen('');
      }
      if (M.labelsPickerOpen && !M.labelsAddWrap.contains(event.target)) {
        M.setLabelsPickerOpen(false);
      }
      if (M.taskTypesPickerOpen && !M.taskTypesAddWrap.contains(event.target)) {
        M.setTaskTypesPickerOpen(false);
      } else if (
        M.taskTypesIconPickerOpen &&
        !M.taskTypesCreateWrap.contains(event.target)
      ) {
        M.setTaskTypesIconPickerOpen(false);
      }
      if (
        M.labelsColorEditId &&
        !M.labelsWrap.contains(event.target)
      ) {
        M.setLabelsColorPickerOpen('');
      }
      if (M.parentPickerOpen && !M.parentPickWrap.contains(event.target)) {
        M.setParentPickerOpen(false);
      }
    });
    if (typeof global.MutationObserver === 'function') {
      M.moreSummaryTimer = null;
      new global.MutationObserver(function () {
        if (M.moreDetailsExpanded) return;
        clearTimeout(M.moreSummaryTimer);
        M.moreSummaryTimer = setTimeout(M.paintMoreDetailsSummary, 80);
      }).observe(M.moreBody, { childList: true, subtree: true, characterData: true });
    }
    M.moreToggle.addEventListener('click', function (event) {
      event.preventDefault();
      M.applyMoreDetailsExpanded(!M.moreDetailsExpanded);
    });
    if (
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildInfoItems === 'function'
    ) {
      ContextMenu.bind(M.moreRow.row, function () {
        return ContextMenu.buildInfoItems({
          isExpanded: function () {
            return M.moreDetailsExpanded;
          },
          setExpanded: function (on) {
            M.applyMoreDetailsExpanded(!!on);
          },
          openGoals:
            typeof M.config.onOpenGoals === 'function'
              ? function () {
                  M.config.onOpenGoals();
                }
              : null,
        });
      });
    }
    M.moreCollapse = {
      refreshSummary: M.paintMoreDetailsSummary,
      setExpanded: function (on, opts) {
        M.applyMoreDetailsExpanded(!!on, opts);
      },
      isExpanded: function () {
        return M.moreDetailsExpanded;
      },
    };
    M.collapse = {
      refreshSummary: function () {
        if (M.moreCollapse && typeof M.moreCollapse.refreshSummary === 'function') {
          M.moreCollapse.refreshSummary();
        }
      },
      setExpanded: function () {
        return true;
      },
      isExpanded: function () {
        return true;
      },
    };
    M.renderMembers();
    M.renderLabels();
    M.renderTaskTypes();
    M.renderParent();
    M.setAuthHint(M.authReason);
    M.syncTitleInputSize();
    M.setDescMode('rich', { focus: false });
    M.applyMoreDetailsExpanded(M.moreDetailsExpanded, { silent: true });
    M.sortEmptyRowsDown(M.body);
    M.sortEmptyRowsDown(M.moreBody);
    M.scheduleLabelSuggestions(false);
    M.scheduleTaskTypeSuggestions(false);
    return { v: {
      field: M.field,
      moreDetailsEl: M.moreRow.row,
      getMoreDetailsEl: function () {
        return M.moreRow.row;
      },
      getHistoriqueMount: function () {
        return M.historiqueMount;
      },
      getPriorityMount: function () {
        return M.priorityInline.mount;
      },
      getProgressMount: function () {
        return M.progressInline.mount;
      },
      getDueMount: function () {
        return M.dueInline.mount;
      },
      setInlineFeatureVisible: function (key, visible) {
        var row =
          key === 'priority'
            ? M.priorityInline.row
            : key === 'progress'
              ? M.progressInline.row
              : key === 'due'
                ? M.dueInline.row
                : null;
        if (!row) return;
        row.hidden = !visible;
        M.onLayoutChange();
      },
      setMoreDetailsExpanded: function (on, opts) {
        return M.moreCollapse.setExpanded(on, opts);
      },
      isMoreDetailsExpanded: function () {
        return M.moreCollapse.isExpanded();
      },
      setTitle: function (name, options) {
        options = options || {};
        var value = typeof name === 'string' ? name : '';
        if (M.titleDirty && !options.force) return;
        if (document.activeElement === M.titleInput && !options.force) return;
        M.titleText = value;
        M.titleInput.readOnly = false;
        M.titleInput.classList.remove('is-loading');
        if (M.titleText) {
          M.titleInput.value = M.titleText;
          M.titleInput.title = M.titleText;
        } else {
          M.titleInput.value = '';
          M.titleInput.title = '';
          M.titleInput.placeholder = 'Titre de la carte';
        }
        M.titleDirty = false;
        M.syncTitleInputSize();
        M.collapse.refreshSummary();
        M.scheduleLabelSuggestions(false);
        M.scheduleTaskTypeSuggestions(false);
      },
      getTitle: function () {
        if (M.titleInput.classList.contains('is-loading')) return M.titleText || '';
        return (M.titleInput.value || '').trim() || M.titleText || '';
      },
      setDesc: function (next, options) {
        options = options || {};
        var value = typeof next === 'string' ? next : '';
        if (M.descDirty && !options.force) return;
        if (
          (document.activeElement === M.descInput || document.activeElement === M.descRich) &&
          !options.force
        ) {
          return;
        }
        M.descSpellcheckGen += 1;
        M.setDescSpellchecking(false);
        M.clearDescSpellRevert();
        M.applyFullDescToEditor(value);
        M.descDirty = false;
        M.descSpellcheckedText = M.splitFullDesc(value).visible.trim() || null;
        M.scheduleLabelSuggestions(false);
        M.scheduleTaskTypeSuggestions(false);
      },
      getDesc: function () {
        return M.fullDescFromEditor();
      },
      getDescVisible: function () {
        M.syncDescSourceFromRich();
        return M.visibleFromEditorValue(M.descInput.value);
      },
      getDescMeta: function () {
        M.fullDescFromEditor();
        return M.cloneMetaMap(M.descMetaMap);
      },
      setShowDescMeta: function (on) {
        var want = !!on;
        if (want === M.showDescMeta) return;
        M.syncDescSourceFromRich();
        if (M.showDescMeta) {
          var split = M.splitFullDesc(M.descInput.value);
          M.descMetaMap = M.cloneMetaMap(split.meta);
          M.showDescMeta = false;
          M.descInput.value = split.visible;
        } else {
          M.showDescMeta = true;
          M.descInput.value = M.joinFullDesc(M.descInput.value, M.descMetaMap);
        }
        if (M.descMode === 'rich') M.renderDescRich();
        else M.syncDescInputSize();
        M.syncDescMetaToggle();
        M.onLayoutChange();
      },
      setMembers: function (list) {
        M.members = Array.isArray(list) ? list.slice() : [];
        M.renderMembers();
        M.onLayoutChange();
      },
      setCustomAssignees: function (list) {
        M.customAssignees = S.normalizeCustomAssignees(list);
        M.renderMembers();
        M.onLayoutChange();
      },
      setTeamLinks: function (list) {
        M.teamLinks = S.normalizeTeamLinks(list);
        M.renderTeamGraph();
        M.onLayoutChange();
      },
      getTeamLinks: function () {
        return S.normalizeTeamLinks(M.teamLinks);
      },
      getCustomAssignees: function () {
        return S.normalizeCustomAssignees(M.customAssignees);
      },
      setCustomAssigneeCatalog: function (list) {
        S.setCustomAssigneeCatalog(list);
        if (M.membersPickerOpen) M.renderMembersPicker();
        M.onLayoutChange();
      },
      getCustomAssigneeCatalog: function () {
        return S.getCustomAssigneeCatalog();
      },
      setPlaces: function (next) {
        M.cardPlaces = S.normalizePlaces(next);
        M.renderPlaces();
        M.onLayoutChange();
      },
      getPlaces: function () {
        return S.normalizePlaces(M.cardPlaces);
      },
      setPlaceCatalog: function (list) {
        S.setPlaceCatalog(list);
        if (M.placesPickerSlot) M.renderPlacesPicker();
        M.onLayoutChange();
      },
      getPlaceCatalog: function () {
        return S.getPlaceCatalog();
      },
      setMemberRoles: function (map) {
        M.memberRoles = S.normalizeMemberRoles(map);
        M.renderMembers();
        M.onLayoutChange();
      },
      getMemberRoles: function () {
        return S.normalizeMemberRoles(M.memberRoles);
      },
      setMemberRoleCustoms: function (list) {
        S.setMemberRoleCustoms(list);
        M.renderMembers();
        M.onLayoutChange();
      },
      getMemberRoleCustoms: function () {
        return S.getMemberRoleCustoms();
      },
      setMemberRoleCatalog: function (list) {
        S.setMemberRoleCatalog(list);
        M.renderMembers();
        if (M.memberRolesPickerMemberId) {
          M.renderMemberRolesPicker(M.memberRolesPickerMemberId);
        }
        M.onLayoutChange();
      },
      setCreator: function (member) {
        M.creatorMember =
          member && typeof member === 'object' && member.id ? member : null;
        M.renderCreator();
        M.onLayoutChange();
      },
      setBoardMembers: function (list) {
        M.boardMembers = Array.isArray(list) ? list.slice() : [];
        M.renderMembers();
        M.renderCreator();
        M.onLayoutChange();
      },
      setLabels: function (list) {
        M.labels = Array.isArray(list) ? list.slice() : [];
        if (M.labelsRenameId && !M.findLabelById(M.labels, M.labelsRenameId)) {
          M.cancelLabelRename({ render: false });
        }
        M.renderLabels();
        M.scheduleLabelSuggestions(false);
        M.onLayoutChange();
      },
      setBoardLabels: function (list) {
        M.boardLabels = Array.isArray(list) ? list.slice() : [];
        M.renderLabels();
        M.scheduleLabelSuggestions(false);
        M.onLayoutChange();
      },
      setTaskTypes: function (list) {
        M.taskTypes = S.normalizeTaskTypes(list);
        M.renderTaskTypes();
        M.scheduleTaskTypeSuggestions(false);
        M.onLayoutChange();
      },
      getTaskTypes: function () {
        return M.taskTypes.slice();
      },
      setCustomTaskTypes: function (list) {
        S.setCustomTaskTypes(list);
        M.renderTaskTypes();
        M.scheduleTaskTypeSuggestions(false);
        M.onLayoutChange();
      },
      getCustomTaskTypes: function () {
        return S.getCustomTaskTypes();
      },
      setDismissedTaskTypeSuggestions: function (list) {
        M.dismissedTaskTypeSuggestions = S.normalizeTaskTypes(list);
        M.pruneTaskTypeSuggestions();
        M.renderTaskTypeSuggestions();
        M.onLayoutChange();
      },
      getDismissedTaskTypeSuggestions: function () {
        return M.dismissedTaskTypeSuggestions.slice();
      },
      setRecap: function (next) {
        if (!next) return;
        if (next.priorityLabel != null) M.priorityLabel = String(next.priorityLabel || '');
        if (next.impactReach != null) M.impactReachLabel = String(next.impactReach || '');
        M.collapse.refreshSummary();
      },
      setAuthReason: function (reason) {
        M.setAuthHint(reason || '');
        M.onLayoutChange();
      },
      setParents: function (next) {
        M.parentCards = S.normalizeParentCards(next);
        M.renderParent();
        M.onLayoutChange();
      },
      setParent: function (next) {
        M.parentCards = S.normalizeParentCards(next ? [next] : []);
        M.renderParent();
        M.onLayoutChange();
      },
      getParents: function () {
        return M.parentCards.map(function (p) {
          return {
            id: p.id,
            name: p.name || '',
            list: p.list || '',
          };
        });
      },
      getParent: function () {
        return M.parentCards.length
          ? {
              id: M.parentCards[0].id,
              name: M.parentCards[0].name || '',
              list: M.parentCards[0].list || '',
            }
          : null;
      },
      getObjectifMount: function () {
        return M.objectifMount;
      },
      setObjectifVisible: function (visible) {
        M.objectifRow.row.hidden = !visible;
        if (M.moreCollapse && typeof M.moreCollapse.refreshSummary === 'function') {
          M.moreCollapse.refreshSummary();
        }
        M.onLayoutChange();
      },
      flushTitle: M.flushTitleSave,
      flushDesc: M.flushDescSave,
      refreshSummary: function () {
        M.collapse.refreshSummary();
      },
      setExpanded: function () {
        return true;
      },
      isExpanded: function () {
        return true;
      }
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
