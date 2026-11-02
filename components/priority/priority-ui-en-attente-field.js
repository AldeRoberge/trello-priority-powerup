/**
 * priority-ui: part 9 of 12 (createEnAttenteField).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var BLOCKED_LABEL = S.BLOCKED_LABEL;
  var BLOCKED_LINK_TYPE_SUBTASK = S.BLOCKED_LINK_TYPE_SUBTASK;
  var BLOCKED_REASON_ADD_LABEL = S.BLOCKED_REASON_ADD_LABEL;
  var BLOCKED_REASON_CLEAR_LABEL = S.BLOCKED_REASON_CLEAR_LABEL;
  var BLOCKED_REASON_DONE_LABEL = S.BLOCKED_REASON_DONE_LABEL;
  var BLOCKED_REASON_EDIT_LABEL = S.BLOCKED_REASON_EDIT_LABEL;
  var BLOCKED_REASON_PLACEHOLDER = S.BLOCKED_REASON_PLACEHOLDER;
  var BLOCKED_REASON_SUGGESTIONS_LABEL = S.BLOCKED_REASON_SUGGESTIONS_LABEL;
  var BLOCKED_REASON_WAITING_OTHER_TASK = S.BLOCKED_REASON_WAITING_OTHER_TASK;
  var BLOCKED_SUBTASK_CLEAR_LABEL = S.BLOCKED_SUBTASK_CLEAR_LABEL;
  var BLOCKED_SUBTASK_EMPTY = S.BLOCKED_SUBTASK_EMPTY;
  var BLOCKED_SUBTASK_PICKER_LABEL = S.BLOCKED_SUBTASK_PICKER_LABEL;

  // from other parts (functions, resolved at call time)
  function bindCollapsibleEnable() { return S.bindCollapsibleEnable.apply(this, arguments); }
  function blockedReasonStorageKey() { return S.blockedReasonStorageKey.apply(this, arguments); }
  function bumpBlockedReasonFreq() { return S.bumpBlockedReasonFreq.apply(this, arguments); }
  function capitalizeCountdownPhrase() { return S.capitalizeCountdownPhrase.apply(this, arguments); }
  function createCollapsibleEnableChrome() { return S.createCollapsibleEnableChrome.apply(this, arguments); }
  function findSubtaskById() { return S.findSubtaskById.apply(this, arguments); }
  function formatBlockedReasonsSummary() { return S.formatBlockedReasonsSummary.apply(this, arguments); }
  function formatBlockedWaitingOnLabel() { return S.formatBlockedWaitingOnLabel.apply(this, arguments); }
  function isBlockedWaitingOtherTask() { return S.isBlockedWaitingOtherTask.apply(this, arguments); }
  function normalizeBlockedLink() { return S.normalizeBlockedLink.apply(this, arguments); }
  function normalizeBlockedLinks() { return S.normalizeBlockedLinks.apply(this, arguments); }
  function normalizeBlockedReason() { return S.normalizeBlockedReason.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function playPriorityUiSound() { return S.playPriorityUiSound.apply(this, arguments); }
  function rankBlockedReasonSuggestions() { return S.rankBlockedReasonSuggestions.apply(this, arguments); }
  function resolveBlockedLinkLabel() { return S.resolveBlockedLinkLabel.apply(this, arguments); }

  // En attente / Bloqué: toggle + motif composer (reasons, waiting-on links).

  function createEnAttenteField(config) {
    var el = config.el;
    var checked = !!config.value;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var onBlockedReasonAdded =
      typeof config.onBlockedReasonAdded === 'function'
        ? config.onBlockedReasonAdded
        : null;
    var getSubtasks =
      typeof config.getSubtasks === 'function' ? config.getSubtasks : function () { return []; };
    // Nested under Progrès (via Statut): no collapse chrome / enable checkbox.
    var embedded = !!config.embedded;
    // Per-subtask Motif editors: no "waiting on another task" link picker.
    var hideSubtaskPicker = !!config.hideSubtaskPicker;
    var bodyId = 'blocked-section-body-' + Math.random().toString(36).slice(2, 9);
    var currentReasons = normalizeBlockedReasons(
      config.blockedReasons != null ? config.blockedReasons : config
    );
    var currentLinks =
      isBlockedWaitingOtherTask(currentReasons) ||
      (config.blockedLinks && config.blockedLinks.length) ||
      config.blockedLink
        ? normalizeBlockedLinks(
            config.blockedLinks != null
              ? config.blockedLinks
              : config.blockedLink != null
                ? config
                : []
          )
        : [];
    // reasonKey → generation; stale AI responses are ignored when gen no longer matches.
    var reasonSpellcheckPending = Object.create(null);
    var reasonSpellcheckGen = 0;
    // reasonKey(corrected) → { original } kept until popup closes / revert / edit
    var reasonSpellReverts = Object.create(null);
    // reasonKey(first split chip) → { original, reasons: string[] }
    var reasonSplitReverts = Object.create(null);
    var splitBlockedReasonFn =
      typeof config.splitBlockedReason === 'function'
        ? config.splitBlockedReason
        : null;

    function spellcheckReasonText(text) {
      var trimmed = normalizeBlockedReason(text);
      if (!trimmed) return Promise.resolve('');
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return normalizeBlockedReason(
            typeof corrected === 'string' ? corrected : trimmed
          );
        },
        function () {
          return trimmed;
        }
      );
    }

    function emptyBlockedSplitResult(original) {
      var text = normalizeBlockedReason(original);
      return { shouldSplit: false, reasons: text ? [text] : [] };
    }

    function callSplitBlockedReason(text) {
      var original = normalizeBlockedReason(text);
      var empty = emptyBlockedSplitResult(original);
      if (!original) return Promise.resolve(empty);
      if (splitBlockedReasonFn) {
        return Promise.resolve()
          .then(function () {
            return splitBlockedReasonFn(original);
          })
          .catch(function (err) {
            console.error('splitBlockedReason failed', err);
            return empty;
          });
      }
      var Agent = global.PriorityAgent;
      if (
        !Agent ||
        typeof Agent.splitBlockedReason !== 'function' ||
        typeof Agent.getProvider !== 'function'
      ) {
        return Promise.resolve(empty);
      }
      var t =
        global.Spellcheck && typeof global.Spellcheck.getT === 'function'
          ? global.Spellcheck.getT()
          : null;
      if (!t) return Promise.resolve(empty);
      return Agent.getProvider(t)
        .then(function (provider) {
          if (
            typeof Agent.isConfigured === 'function' &&
            !Agent.isConfigured(provider)
          ) {
            return empty;
          }
          return Agent.splitBlockedReason(provider, original);
        })
        .catch(function (err) {
          console.error('splitBlockedReason failed', err);
          return empty;
        });
    }

    function reasonMayBeCompound(text) {
      return (
        typeof global.PriorityAgent !== 'undefined' &&
        typeof global.PriorityAgent.titleMayBeCompound === 'function' &&
        global.PriorityAgent.titleMayBeCompound(text)
      );
    }

    function isReasonSpellchecking(reason) {
      var key = reasonKey(reason);
      return !!(key && reasonSpellcheckPending[key]);
    }

    function markReasonSpellchecking(reason) {
      var key = reasonKey(reason);
      if (!key) return 0;
      reasonSpellcheckGen += 1;
      reasonSpellcheckPending[key] = reasonSpellcheckGen;
      return reasonSpellcheckGen;
    }

    function clearReasonSpellchecking(reason, gen) {
      var key = reasonKey(reason);
      if (!key) return;
      if (gen != null && reasonSpellcheckPending[key] !== gen) return;
      delete reasonSpellcheckPending[key];
    }

    function clearReasonSpellRevert(corrected) {
      var key = reasonKey(corrected);
      if (!key || !reasonSpellReverts[key]) return;
      delete reasonSpellReverts[key];
    }

    function rememberReasonSpellRevert(corrected, original) {
      var key = reasonKey(corrected);
      var originalNorm = normalizeBlockedReason(original);
      if (!key || !originalNorm || reasonKey(originalNorm) === key) return;
      reasonSpellReverts[key] = { original: originalNorm };
    }

    function clearReasonSplitRevert(reason) {
      var key = reasonKey(reason);
      if (!key) return;
      Object.keys(reasonSplitReverts).forEach(function (anchorKey) {
        var entry = reasonSplitReverts[anchorKey];
        if (!entry || !Array.isArray(entry.reasons)) return;
        var overlap =
          anchorKey === key ||
          entry.reasons.some(function (r) {
            return reasonKey(r) === key;
          });
        if (overlap) delete reasonSplitReverts[anchorKey];
      });
    }

    function fireBlockedReasonAdded(reason) {
      var next = normalizeBlockedReason(reason);
      if (
        !next ||
        !onBlockedReasonAdded ||
        next === BLOCKED_REASON_WAITING_OTHER_TASK
      ) {
        return;
      }
      try {
        onBlockedReasonAdded(next);
      } catch (err) {
        console.error('onBlockedReasonAdded failed', err);
      }
    }

    /**
     * Replace one committed Motif with several polished Motifs from AI split.
     * @returns {string[]|null} added reasons
     */
    function applyReasonSplitReplace(originalText, reasons) {
      var original = normalizeBlockedReason(originalText);
      if (!original || !reasons || reasons.length < 2 || !hasReason(original)) {
        return null;
      }
      var polished = [];
      var seen = Object.create(null);
      for (var i = 0; i < reasons.length; i++) {
        var text = normalizeBlockedReason(reasons[i]);
        if (!text) continue;
        var key = reasonKey(text);
        if (!key || seen[key]) continue;
        seen[key] = true;
        polished.push(text);
      }
      if (polished.length < 2) return null;

      clearReasonSpellchecking(original);
      clearReasonSpellRevert(original);
      clearReasonSplitRevert(original);

      // Drop the provisional compound chip without notifying (batch below).
      var nextReasons = [];
      var originalKey = reasonKey(original);
      for (var r = 0; r < currentReasons.length; r++) {
        if (reasonKey(currentReasons[r]) !== originalKey) {
          nextReasons.push(currentReasons[r]);
        }
      }
      currentReasons = nextReasons;
      if (!isBlockedWaitingOtherTask(currentReasons)) {
        currentLinks = [];
      }

      var added = [];
      for (var p = 0; p < polished.length; p++) {
        var piece = polished[p];
        if (hasReason(piece)) continue;
        bumpBlockedReasonFreq(piece);
        currentReasons = currentReasons.concat([piece]);
        added.push(piece);
        fireBlockedReasonAdded(piece);
      }
      if (added.length < 2) {
        // Restore original if we somehow collapsed to <2 new chips.
        if (!hasReason(original)) {
          currentReasons = currentReasons.concat([original]);
        }
        refreshSelected();
        refreshSuggestions();
        refreshSubtaskUi();
        notifyReasonChange();
        onLayoutChange();
        return null;
      }

      reasonSplitReverts[reasonKey(added[0])] = {
        original: original,
        reasons: added.slice()
      };
      if (embedded && !checked) {
        checked = true;
        field.classList.add('is-enabled');
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
      return added;
    }

    function applySpellcheckCorrection(original, corrected, gen, opts) {
      opts = opts || {};
      var key = reasonKey(original);
      if (!key || reasonSpellcheckPending[key] !== gen) return;
      clearReasonSpellchecking(original, gen);
      var finalText = normalizeBlockedReason(corrected) || original;
      if (finalText !== original && hasReason(original)) {
        var hadFinalBefore = hasReason(finalText);
        var renamed = renameReason(original, finalText);
        if (renamed && !hadFinalBefore && hasReason(finalText)) {
          rememberReasonSpellRevert(finalText, original);
        }
        if (opts.deferredTaskCreate) {
          fireBlockedReasonAdded(hasReason(finalText) ? finalText : original);
        }
        refreshSelected();
        onLayoutChange();
      } else {
        if (opts.deferredTaskCreate && hasReason(original)) {
          fireBlockedReasonAdded(original);
        }
        refreshSelected();
        onLayoutChange();
      }
    }

    /**
     * After commit: ask AI whether the Motif is several causes; else spellcheck.
     * Enter must never wait on AI.
     */
    function refineReasonAfterCommit(original, opts) {
      opts = opts || {};
      var typed = normalizeBlockedReason(original);
      if (!typed || !hasReason(typed)) return;
      var gen = markReasonSpellchecking(typed);
      refreshSelected();
      onLayoutChange();

      var splitPromise = reasonMayBeCompound(typed)
        ? callSplitBlockedReason(typed)
        : Promise.resolve(null);

      splitPromise.then(function (splitResult) {
        if (reasonSpellcheckPending[reasonKey(typed)] !== gen) return;
        if (!hasReason(typed)) {
          clearReasonSpellchecking(typed, gen);
          return;
        }
        if (
          splitResult &&
          splitResult.shouldSplit === true &&
          Array.isArray(splitResult.reasons) &&
          splitResult.reasons.length >= 2
        ) {
          clearReasonSpellchecking(typed, gen);
          var added = applyReasonSplitReplace(typed, splitResult.reasons);
          if (added) return;
        }
        // No split (or failed replace): continue with orthography polish.
        spellcheckReasonText(typed).then(
          function (corrected) {
            applySpellcheckCorrection(typed, corrected, gen, opts);
          },
          function () {
            applySpellcheckCorrection(typed, typed, gen, opts);
          }
        );
      });
    }

    var field = document.createElement('div');
    field.className = embedded
      ? 'field field--en-attente field--en-attente-embedded is-enabled'
      : 'field field--en-attente';

    var chrome = null;
    if (!embedded) {
      chrome = createCollapsibleEnableChrome({
        title: BLOCKED_LABEL,
        bodyId: bodyId,
        checkboxClass: 'en-attente-checkbox',
        labelClass: 'en-attente-label',
        leadingIcon: 'ti-barrier-block',
        iconClass: 'blocked-leading-icon',
        titleClass: 'en-attente-title',
        collapseLabel: 'Replier Bloqu\u00e9',
        expandLabel: 'D\u00e9velopper Bloqu\u00e9'
      });
      field.appendChild(chrome.head);
    }

    var reasonWrap = document.createElement('div');
    reasonWrap.className = embedded
      ? 'blocked-reason-wrap'
      : 'blocked-reason-wrap section-toggle-body';
    reasonWrap.id = bodyId;

    var selectedWrap = document.createElement('div');
    selectedWrap.className = 'blocked-reason-selected';
    selectedWrap.hidden = !(currentReasons.length || currentLinks.length);

    var subtaskWrap = document.createElement('div');
    subtaskWrap.className = 'blocked-subtask-wrap';
    subtaskWrap.hidden = true;

    var subtaskPicker = document.createElement('div');
    subtaskPicker.className = 'blocked-subtask-picker';

    var subtaskPickerLabel = document.createElement('div');
    subtaskPickerLabel.className = 'blocked-reason-suggestions-label';
    subtaskPickerLabel.textContent = BLOCKED_SUBTASK_PICKER_LABEL;

    var subtaskEmpty = document.createElement('div');
    subtaskEmpty.className = 'blocked-subtask-empty';
    subtaskEmpty.textContent = BLOCKED_SUBTASK_EMPTY;

    var subtaskList = document.createElement('div');
    subtaskList.className = 'blocked-reason-suggestions-list blocked-subtask-list';
    subtaskList.setAttribute('role', 'list');

    subtaskPicker.appendChild(subtaskPickerLabel);
    subtaskPicker.appendChild(subtaskEmpty);
    subtaskPicker.appendChild(subtaskList);
    subtaskWrap.appendChild(subtaskPicker);

    var reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.className = 'blocked-reason-input';
    reasonInput.placeholder = BLOCKED_REASON_PLACEHOLDER;
    reasonInput.setAttribute('aria-label', 'Cause du blocage');
    reasonInput.setAttribute('autocomplete', 'off');
    reasonInput.setAttribute('spellcheck', 'false');

    // Compact "+" once at least one cause exists; expands the full input to add another.
    var reasonComposerOpen = false;
    var reasonAddBtn = document.createElement('button');
    reasonAddBtn.type = 'button';
    reasonAddBtn.className = 'blocked-reason-add-btn';
    reasonAddBtn.setAttribute('aria-label', BLOCKED_REASON_ADD_LABEL);
    reasonAddBtn.title = BLOCKED_REASON_ADD_LABEL;
    reasonAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
    reasonAddBtn.hidden = !(currentReasons.length || currentLinks.length);

    // Build suggestions DOM before TabAutocomplete.bind — bind() calls
    // onProposal synchronously during init, so suggestionsList must exist.
    var suggestions = document.createElement('div');
    suggestions.className = 'blocked-reason-suggestions';
    // Shown only while the user is typing a filter query.
    suggestions.hidden = true;

    var suggestionsLabel = document.createElement('div');
    suggestionsLabel.className = 'blocked-reason-suggestions-label';
    suggestionsLabel.textContent = BLOCKED_REASON_SUGGESTIONS_LABEL;

    var suggestionsList = document.createElement('div');
    suggestionsList.className = 'blocked-reason-suggestions-list';
    suggestionsList.setAttribute('role', 'list');

    suggestions.appendChild(suggestionsLabel);
    suggestions.appendChild(suggestionsList);

    var reasonTabCandidates = [];
    var reasonTabComplete = null;
    var reasonInputMount = reasonInput;
    if (global.TabAutocomplete && typeof global.TabAutocomplete.wrapField === 'function') {
      var reasonWrapped = global.TabAutocomplete.wrapField(reasonInput);
      reasonInputMount = reasonWrapped.wrap;
      reasonTabComplete = global.TabAutocomplete.bind({
        field: reasonInput,
        wrapEl: reasonWrapped.wrap,
        ghostEl: reasonWrapped.ghost,
        getCandidates: function () {
          return reasonTabCandidates.slice();
        },
        isEnabled: function () {
          return !reasonInput.disabled && !reasonInputMount.hidden;
        },
        onProposal: function (proposal) {
          var target =
            proposal && proposal.candidate ? String(proposal.candidate.text || '') : '';
          if (!suggestionsList) return;
          Array.prototype.forEach.call(
            suggestionsList.querySelectorAll('.blocked-reason-suggestion'),
            function (btn) {
              var label = String(btn.dataset.reason || btn.textContent || '');
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

    reasonWrap.appendChild(selectedWrap);
    reasonWrap.appendChild(subtaskWrap);
    reasonWrap.appendChild(reasonInputMount);
    reasonWrap.appendChild(suggestions);
    field.appendChild(reasonWrap);
    el.appendChild(field);

    function readReasons() {
      return currentReasons.slice();
    }

    function readLinks() {
      return currentLinks.slice();
    }

    function reasonKey(reason) {
      return blockedReasonStorageKey(reason);
    }

    function hasReason(reason) {
      var key = reasonKey(reason);
      if (!key) return false;
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) === key) return true;
      }
      return false;
    }

    function hasProvidedReasons() {
      return currentReasons.length > 0 || currentLinks.length > 0;
    }

    function syncReasonComposer() {
      var has = hasProvidedReasons();
      if (!has) reasonComposerOpen = false;
      var showInput = !has || reasonComposerOpen;
      var wasHidden = !!reasonInputMount.hidden;
      reasonInputMount.hidden = !showInput;
      reasonAddBtn.hidden = !has || reasonComposerOpen;
      reasonWrap.classList.toggle('has-blocked-reasons', has);
      reasonWrap.classList.toggle('is-composing-reason', showInput && has);
      if (!showInput) {
        suggestions.hidden = true;
        if (reasonTabComplete) reasonTabComplete.refresh();
      }
      if (wasHidden !== !!reasonInputMount.hidden) onLayoutChange();
    }

    function openReasonComposer() {
      reasonComposerOpen = true;
      syncReasonComposer();
      try {
        reasonInput.focus();
      } catch (err) {
        /* ignore */
      }
    }

    function closeReasonComposer() {
      reasonComposerOpen = false;
      if ((reasonInput.value || '').trim()) {
        reasonInput.value = '';
        refreshSuggestions();
      }
      syncReasonComposer();
    }

    function hasLinkId(id) {
      if (!id) return false;
      for (var i = 0; i < currentLinks.length; i++) {
        if (currentLinks[i] && currentLinks[i].id === id) return true;
      }
      return false;
    }

    function isWaitingOnTasks() {
      return isBlockedWaitingOtherTask(currentReasons) || currentLinks.length > 0;
    }

    function notifyReasonChange() {
      if (collapse) collapse.refreshSummary();
      onChange(getValue());
    }

    function ensureWaitingReason(options) {
      if (!hasReason(BLOCKED_REASON_WAITING_OTHER_TASK)) {
        if (!(options && options.trackFreq === false)) {
          bumpBlockedReasonFreq(BLOCKED_REASON_WAITING_OTHER_TASK);
        }
        currentReasons = currentReasons.concat([BLOCKED_REASON_WAITING_OTHER_TASK]);
      }
    }

    function addLink(nextLink) {
      var items = getSubtasks() || [];
      var next = normalizeBlockedLink(nextLink);
      if (!next) return;
      if (hasLinkId(next.id)) {
        refreshSelected();
        refreshSubtaskUi();
        return;
      }
      var item = findSubtaskById(items, next.id);
      if (item && item.text && !next.label) {
        next = Object.assign({}, next, { label: String(item.text).trim() });
      }
      ensureWaitingReason();
      currentLinks = currentLinks.concat([next]);
      // Linking a blocking subtask implies the card is blocked.
      if (embedded && !checked) {
        checked = true;
        field.classList.add('is-enabled');
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function removeLink(id) {
      if (!id) return;
      var next = [];
      for (var i = 0; i < currentLinks.length; i++) {
        if (currentLinks[i].id !== id) next.push(currentLinks[i]);
      }
      if (next.length === currentLinks.length) return;
      currentLinks = next;
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function syncLinksWithReasons() {
      if (!isBlockedWaitingOtherTask(currentReasons) && currentLinks.length) {
        // Keep links only while the waiting-other reason (or residual links) applies.
        // Links alone still count as waiting; clearing the reason clears links.
        if (!hasReason(BLOCKED_REASON_WAITING_OTHER_TASK)) {
          currentLinks = [];
        }
      }
    }

    function addReason(value, options) {
      var next = normalizeBlockedReason(value);
      var trackFreq = !(options && options.trackFreq === false);
      var skipTaskCreate = !!(options && options.skipTaskCreate);
      if (!next || hasReason(next)) {
        refreshSelected();
        refreshSuggestions();
        refreshSubtaskUi();
        return;
      }
      if (trackFreq) bumpBlockedReasonFreq(next);
      currentReasons = currentReasons.concat([next]);
      // Motif implies the card is blocked (embedded Statut panel has no enable switch).
      if (embedded && !checked) {
        checked = true;
        field.classList.add('is-enabled');
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
      // Waiting-on-another-task links existing Progrès items — do not invent a new one.
      if (
        !skipTaskCreate &&
        onBlockedReasonAdded &&
        next !== BLOCKED_REASON_WAITING_OTHER_TASK
      ) {
        try {
          onBlockedReasonAdded(next);
        } catch (err) {
          console.error('onBlockedReasonAdded failed', err);
        }
      }
    }

    function removeReason(value) {
      var key = reasonKey(value);
      if (!key) return;
      clearReasonSpellchecking(value);
      clearReasonSpellRevert(value);
      clearReasonSplitRevert(value);
      var next = [];
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) !== key) next.push(currentReasons[i]);
      }
      if (next.length === currentReasons.length) return;
      currentReasons = next;
      if (!isBlockedWaitingOtherTask(currentReasons)) {
        currentLinks = [];
      }
      playPriorityUiSound('trash');
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
    }

    function renameReason(oldValue, newValue) {
      var oldKey = reasonKey(oldValue);
      if (!oldKey) return false;
      clearReasonSpellRevert(oldValue);
      var next = normalizeBlockedReason(newValue);
      if (!next) {
        refreshSelected();
        return false;
      }
      var newKey = reasonKey(next);
      var index = -1;
      for (var i = 0; i < currentReasons.length; i++) {
        if (reasonKey(currentReasons[i]) === oldKey) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        refreshSelected();
        return false;
      }
      if (oldKey === newKey) {
        if (currentReasons[index] === next) {
          refreshSelected();
          return false;
        }
        currentReasons = currentReasons.slice();
        currentReasons[index] = next;
      } else {
        var duplicate = false;
        for (var j = 0; j < currentReasons.length; j++) {
          if (j !== index && reasonKey(currentReasons[j]) === newKey) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) {
          // Renaming onto an existing chip: drop the edited one, keep the other.
          removeReason(oldValue);
          return true;
        }
        bumpBlockedReasonFreq(next);
        currentReasons = currentReasons.slice();
        currentReasons[index] = next;
        if (!isBlockedWaitingOtherTask(currentReasons)) {
          currentLinks = [];
        }
      }
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      notifyReasonChange();
      onLayoutChange();
      return true;
    }

    var finishReasonEdit = null;

    function beginEditReasonChip(reason) {
      if (typeof finishReasonEdit === 'function') {
        finishReasonEdit(true);
      }

      clearReasonSpellchecking(reason);
      clearReasonSpellRevert(reason);
      clearReasonSplitRevert(reason);

      var chip = null;
      var chips = selectedWrap.querySelectorAll('.blocked-reason-chip:not(.blocked-subtask-chip)');
      for (var c = 0; c < chips.length; c++) {
        if (chips[c].dataset.reason === reason) {
          chip = chips[c];
          break;
        }
      }
      if (!chip || chip.classList.contains('is-editing')) return;

      var textEl = chip.querySelector('.blocked-reason-chip-text');
      var editBtn = chip.querySelector('.blocked-reason-chip-edit');
      var clearBtn = chip.querySelector('.blocked-reason-chip-clear');
      if (!textEl || !clearBtn) return;

      chip.classList.remove('is-spellchecking');
      chip.removeAttribute('aria-busy');
      chip.classList.add('is-editing');
      textEl.hidden = true;
      if (editBtn) editBtn.hidden = true;
      var pendingSpinner = chip.querySelector('.blocked-reason-chip-spinner');
      if (pendingSpinner) pendingSpinner.remove();

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'blocked-reason-chip-input';
      input.value = reason;
      input.setAttribute('aria-label', BLOCKED_REASON_EDIT_LABEL);
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');

      var doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'blocked-reason-chip-done';
      doneBtn.setAttribute('aria-label', BLOCKED_REASON_DONE_LABEL);
      doneBtn.title = BLOCKED_REASON_DONE_LABEL;
      doneBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';

      chip.insertBefore(input, clearBtn);
      chip.insertBefore(doneBtn, clearBtn);
      input.focus();
      input.select();
      onLayoutChange();

      var finished = false;
      function finish(commit) {
        if (finished) return;
        finished = true;
        if (finishReasonEdit === finish) finishReasonEdit = null;
        if (!commit) {
          refreshSelected();
          onLayoutChange();
          return;
        }
        var rawValue = input.value;
        var pending = normalizeBlockedReason(rawValue);
        if (!pending) {
          refreshSelected();
          onLayoutChange();
          return;
        }
        // Commit immediately; split / spellcheck may refine asynchronously.
        // Skip refine when renaming onto an existing chip (merge/drop).
        // Do not defer/create unblock subtasks on rename — only fresh adds do.
        var mergingIntoExisting =
          reasonKey(pending) !== reasonKey(reason) && hasReason(pending);
        renameReason(reason, pending);
        if (!mergingIntoExisting && hasReason(pending)) {
          refineReasonAfterCommit(pending);
        }
      }
      finishReasonEdit = finish;

      doneBtn.addEventListener('mousedown', function (event) {
        event.preventDefault();
      });
      doneBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      });

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      });
      input.addEventListener('blur', function () {
        setTimeout(function () {
          if (finished) return;
          finish(true);
        }, 0);
      });
    }

    function setReasons(value) {
      currentReasons = normalizeBlockedReasons(value);
      syncLinksWithReasons();
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      if (collapse) collapse.refreshSummary();
    }

    function refreshSelected() {
      while (selectedWrap.firstChild) selectedWrap.removeChild(selectedWrap.firstChild);
      var items = getSubtasks() || [];
      var hasAny = false;

      for (var i = 0; i < currentReasons.length; i++) {
        (function (reason) {
          // When linked tasks exist, their named chips replace the generic waiting reason.
          if (
            reason === BLOCKED_REASON_WAITING_OTHER_TASK &&
            currentLinks.length > 0
          ) {
            return;
          }
          hasAny = true;
          var chip = document.createElement('span');
          chip.className = 'blocked-reason-chip';
          chip.dataset.reason = reason;

          var text = document.createElement('span');
          text.className = 'blocked-reason-chip-text';
          text.textContent = reason;
          text.title = reason;

          var editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'blocked-reason-chip-edit';
          editBtn.setAttribute('aria-label', BLOCKED_REASON_EDIT_LABEL + ' : ' + reason);
          editBtn.title = BLOCKED_REASON_EDIT_LABEL;
          editBtn.innerHTML = '<i class="ti ti-pencil" aria-hidden="true"></i>';
          editBtn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            beginEditReasonChip(reason);
          });

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'blocked-reason-chip-clear';
          clearBtn.setAttribute('aria-label', BLOCKED_REASON_CLEAR_LABEL + ' : ' + reason);
          clearBtn.textContent = '\u00d7';
          clearBtn.addEventListener('click', function () {
            if (typeof finishReasonEdit === 'function') finishReasonEdit(false);
            removeReason(reason);
            if (!hasProvidedReasons()) {
              try {
                reasonInput.focus();
              } catch (err) {
                /* ignore */
              }
            }
          });

          chip.appendChild(text);
          if (isReasonSpellchecking(reason)) {
            chip.classList.add('is-spellchecking');
            chip.setAttribute('aria-busy', 'true');
            var spinner = document.createElement('span');
            spinner.className = 'blocked-reason-chip-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            spinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
            chip.appendChild(spinner);
          } else {
            var splitInfo = null;
            var splitAnchorKey = null;
            var splitKeys = Object.keys(reasonSplitReverts);
            for (var sk = 0; sk < splitKeys.length; sk++) {
              var splitEntry = reasonSplitReverts[splitKeys[sk]];
              if (
                splitEntry &&
                Array.isArray(splitEntry.reasons) &&
                reasonKey(splitEntry.reasons[0]) === reasonKey(reason)
              ) {
                splitInfo = splitEntry;
                splitAnchorKey = splitKeys[sk];
                break;
              }
            }
            var revertInfo =
              !splitInfo && reasonSpellReverts[reasonKey(reason)]
                ? reasonSpellReverts[reasonKey(reason)]
                : null;
            if (
              splitInfo &&
              splitAnchorKey &&
              splitInfo.original &&
              Array.isArray(splitInfo.reasons)
            ) {
              var splitCount = splitInfo.reasons.length;
              var splitPrevious = splitInfo.original;
              var splitTitle =
                'Annuler la s\u00e9paration \u2014 restaurer\u00a0: ' +
                (global.Spellcheck && typeof global.Spellcheck.revertLabel === 'function'
                  ? global.Spellcheck.revertLabel(splitPrevious)
                  : splitPrevious);
              var splitRevertBtn = document.createElement('button');
              splitRevertBtn.type = 'button';
              splitRevertBtn.className =
                'blocked-reason-chip-revert tp-spell-revert blocked-reason-chip-split-revert';
              splitRevertBtn.setAttribute(
                'aria-label',
                'Annuler la s\u00e9paration en ' + splitCount + ' causes'
              );
              splitRevertBtn.title = splitTitle;
              splitRevertBtn.innerHTML =
                '<i class="ti ti-arrow-back-up" aria-hidden="true"></i>';
              splitRevertBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                var still = (splitInfo.reasons || []).filter(function (r) {
                  return hasReason(r);
                });
                if (reasonSplitReverts[splitAnchorKey] === splitInfo) {
                  delete reasonSplitReverts[splitAnchorKey];
                }
                if (!still.length) {
                  refreshSelected();
                  onLayoutChange();
                  return;
                }
                for (var si = 0; si < still.length; si++) {
                  var stillKey = reasonKey(still[si]);
                  currentReasons = currentReasons.filter(function (r) {
                    return reasonKey(r) !== stillKey;
                  });
                }
                if (!hasReason(splitPrevious)) {
                  bumpBlockedReasonFreq(splitPrevious);
                  currentReasons = currentReasons.concat([splitPrevious]);
                }
                if (!isBlockedWaitingOtherTask(currentReasons)) {
                  currentLinks = [];
                }
                refreshSelected();
                refreshSuggestions();
                refreshSubtaskUi();
                notifyReasonChange();
                onLayoutChange();
              });
              chip.appendChild(splitRevertBtn);
            } else if (revertInfo && revertInfo.original) {
              var previousText = revertInfo.original;
              var revertTitle =
                global.Spellcheck && typeof global.Spellcheck.revertLabel === 'function'
                  ? global.Spellcheck.revertLabel(previousText)
                  : previousText;
              var revertBtn = document.createElement('button');
              revertBtn.type = 'button';
              revertBtn.className = 'blocked-reason-chip-revert tp-spell-revert';
              revertBtn.setAttribute(
                'aria-label',
                'Annuler la correction\u00a0: ' + revertTitle
              );
              revertBtn.title = revertTitle;
              revertBtn.innerHTML =
                '<i class="ti ti-arrow-back-up" aria-hidden="true"></i>';
              revertBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                clearReasonSpellRevert(reason);
                playPriorityUiSound('undo');
                if (hasReason(reason)) {
                  renameReason(reason, previousText);
                } else {
                  refreshSelected();
                  onLayoutChange();
                }
              });
              chip.appendChild(revertBtn);
            }
          }
          chip.appendChild(editBtn);
          chip.appendChild(clearBtn);
          selectedWrap.appendChild(chip);
        })(currentReasons[i]);
      }

      // Link chips double typed motifs (reason create → blocked subtask → link).
      // Show them only when Motif has no explicit cause beyond waiting-other.
      var hasExplicitReasonChip = false;
      for (var er = 0; er < currentReasons.length; er++) {
        if (currentReasons[er] !== BLOCKED_REASON_WAITING_OTHER_TASK) {
          hasExplicitReasonChip = true;
          break;
        }
      }

      for (var li = 0; li < currentLinks.length; li++) {
        if (hasExplicitReasonChip) break;
        (function (link) {
          hasAny = true;
          var taskName = resolveBlockedLinkLabel(link, items);
          var chipLabel = formatBlockedWaitingOnLabel(taskName);
          var chip = document.createElement('span');
          chip.className = 'blocked-reason-chip blocked-subtask-chip';
          chip.dataset.subtaskId = link.id;

          var text = document.createElement('span');
          text.className = 'blocked-reason-chip-text';
          text.textContent = chipLabel;
          text.title = chipLabel;

          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'blocked-reason-chip-clear';
          clearBtn.setAttribute('aria-label', BLOCKED_SUBTASK_CLEAR_LABEL + ' : ' + taskName);
          clearBtn.textContent = '\u00d7';
          clearBtn.addEventListener('click', function () {
            removeLink(link.id);
            if (!hasProvidedReasons()) {
              try {
                reasonInput.focus();
              } catch (err) {
                /* ignore */
              }
            }
          });

          chip.appendChild(text);
          chip.appendChild(clearBtn);
          selectedWrap.appendChild(chip);
        })(currentLinks[li]);
      }

      selectedWrap.hidden = !hasAny;
      if (hasAny) selectedWrap.appendChild(reasonAddBtn);
      field.classList.toggle('has-blocked-reason', hasAny);
      field.classList.toggle('has-blocked-subtask-link', currentLinks.length > 0);
      syncReasonComposer();
    }

    function refreshSuggestions() {
      var query = (reasonInput.value || '').trim();
      // Keep the list hidden until the user types — including when a reason
      // is already selected under Statut (no idle preset chips).
      var ranked = query
        ? rankBlockedReasonSuggestions({
            query: query,
            selected: currentReasons
          })
        : [];
      while (suggestionsList.firstChild) {
        suggestionsList.removeChild(suggestionsList.firstChild);
      }
      reasonTabCandidates = ranked.slice();
      for (var i = 0; i < ranked.length; i++) {
        (function (optionLabel) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'blocked-reason-suggestion';
          btn.setAttribute('role', 'listitem');
          btn.textContent = optionLabel;
          btn.dataset.reason = optionLabel;
          btn.addEventListener('mousedown', function (event) {
            // Keep focus long enough for click to commit before blur closes the composer.
            event.preventDefault();
          });
          btn.addEventListener('click', function () {
            addReason(optionLabel);
            reasonInput.value = '';
            refreshSuggestions();
            closeReasonComposer();
          });
          suggestionsList.appendChild(btn);
        })(ranked[i]);
      }
      if (reasonTabComplete) reasonTabComplete.refresh();
      var wasHidden = suggestions.hidden;
      suggestions.hidden = ranked.length === 0;
      if (wasHidden !== suggestions.hidden) onLayoutChange();
    }

    function refreshSubtaskUi() {
      if (hideSubtaskPicker) {
        subtaskWrap.hidden = true;
        subtaskPicker.hidden = true;
        field.classList.remove('has-blocked-subtask-link');
        return;
      }
      var waiting = isWaitingOnTasks();
      var wasHidden = subtaskWrap.hidden;
      subtaskWrap.hidden = !waiting;
      if (!waiting) {
        subtaskPicker.hidden = true;
        field.classList.remove('has-blocked-subtask-link');
        if (wasHidden !== subtaskWrap.hidden) onLayoutChange();
        return;
      }

      var items = getSubtasks() || [];
      field.classList.toggle('has-blocked-subtask-link', currentLinks.length > 0);

      while (subtaskList.firstChild) subtaskList.removeChild(subtaskList.firstChild);
      var visibleCount = 0;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.id || !item.text) continue;
        if (hasLinkId(item.id)) continue;
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'blocked-reason-suggestion blocked-subtask-option';
        opt.setAttribute('role', 'listitem');
        opt.textContent = item.text;
        opt.dataset.subtaskId = item.id;
        opt.title = item.text;
        (function (subtaskId, subtaskText) {
          opt.addEventListener('click', function () {
            addLink({
              type: BLOCKED_LINK_TYPE_SUBTASK,
              id: subtaskId,
              label: subtaskText
            });
          });
        })(item.id, item.text);
        subtaskList.appendChild(opt);
        visibleCount += 1;
      }

      var empty = items.length === 0;
      subtaskEmpty.hidden = !empty;
      subtaskList.hidden = empty || visibleCount === 0;
      // Keep picker open for multi-select while waiting and options (or empty state) remain.
      subtaskPicker.hidden = !empty && visibleCount === 0;

      if (wasHidden !== subtaskWrap.hidden) onLayoutChange();
    }

    // Keep blockedReasons when disabling — only enAttente (enabled) drives badges.
    var collapse = null;
    var enableAllowed = true;
    if (!embedded) {
      collapse = bindCollapsibleEnable({
        field: field,
        body: reasonWrap,
        chrome: chrome,
        enabled: checked,
        expanded: config.expanded != null ? !!config.expanded : checked,
        getSummary: function () {
          var summary = capitalizeCountdownPhrase(
            formatBlockedReasonsSummary(currentReasons, {
              empty: BLOCKED_LABEL,
              links: currentLinks,
              items: getSubtasks() || []
            })
          );
          return summary + '\u2026';
        },
        onLayoutChange: onLayoutChange,
        onExpandChange: config.onExpandChange || null,
        onEnableChange: function () {
          onChange(collapse.isEnabled());
        }
      });
    }

    function setValue(value, options) {
      options = options || {};
      if (collapse) {
        var enableOpts = { notifyLayout: false };
        if (options.preserveCollapse) enableOpts.preserveCollapse = true;
        else enableOpts.expand = !!value;
        collapse.setEnabled(!!value, enableOpts);
        return;
      }
      var next = !!value;
      var changed = next !== checked;
      checked = next;
      field.classList.toggle('is-enabled', checked);
      if (changed) onChange(checked);
    }

    function getValue() {
      return collapse ? collapse.isEnabled() : checked;
    }

    function setBlockedReasons(value) {
      setReasons(value);
    }

    function getBlockedReasons() {
      // Always return draft reasons so disable does not wipe persistence.
      return readReasons();
    }

    // Legacy single-reason accessors (first reason / replace-all).
    function setBlockedReason(value) {
      if (value == null || value === '') {
        setReasons([]);
        return;
      }
      setReasons([value]);
    }

    function getBlockedReason() {
      return currentReasons.length ? currentReasons[0] : '';
    }

    function setBlockedLinks(value) {
      currentLinks = isWaitingOnTasks() || (Array.isArray(value) && value.length)
        ? normalizeBlockedLinks(value)
        : [];
      if (currentLinks.length) ensureWaitingReason({ trackFreq: false });
      if (!isBlockedWaitingOtherTask(currentReasons)) currentLinks = [];
      refreshSelected();
      refreshSuggestions();
      refreshSubtaskUi();
      if (collapse) collapse.refreshSummary();
    }

    function getBlockedLinks() {
      return isWaitingOnTasks() ? readLinks() : [];
    }

    // Legacy single-link accessors (first link / replace-all).
    function setBlockedLink(value) {
      if (value == null) {
        setBlockedLinks([]);
        return;
      }
      setBlockedLinks([value]);
    }

    function getBlockedLink() {
      var links = getBlockedLinks();
      return links.length ? links[0] : null;
    }

    function refreshSubtasks() {
      // Refresh stored labels from live subtask text when available.
      var items = getSubtasks() || [];
      var refreshed = [];
      for (var i = 0; i < currentLinks.length; i++) {
        var link = currentLinks[i];
        var item = findSubtaskById(items, link.id);
        if (item && item.text) {
          refreshed.push(
            Object.assign({}, link, { label: String(item.text).trim() })
          );
        } else {
          refreshed.push(link);
        }
      }
      currentLinks = refreshed;
      refreshSelected();
      refreshSubtaskUi();
      if (collapse) collapse.refreshSummary();
    }

    reasonAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openReasonComposer();
    });

    reasonInput.addEventListener('input', function () {
      refreshSuggestions();
    });

    reasonInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && hasProvidedReasons()) {
        event.preventDefault();
        closeReasonComposer();
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var typed = normalizeBlockedReason(reasonInput.value);
      if (!typed) return;
      // Ingest immediately so Enter never freezes on AI refine.
      reasonInput.value = '';
      refreshSuggestions();
      if (!hasReason(typed)) {
        var deferTask = reasonMayBeCompound(typed);
        addReason(typed, { skipTaskCreate: deferTask });
        refineReasonAfterCommit(typed, { deferredTaskCreate: deferTask });
      }
      closeReasonComposer();
    });

    reasonInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (document.activeElement === reasonInput) return;
        if (suggestions.contains(document.activeElement)) return;
        if (!(reasonInput.value || '').trim() && hasProvidedReasons()) {
          closeReasonComposer();
        }
      }, 0);
    });

    setBlockedReasons(
      config.blockedReasons != null ? config.blockedReasons : config.blockedReason
    );
    if (config.blockedLinks != null) {
      setBlockedLinks(config.blockedLinks);
    } else if (config.blockedLink) {
      setBlockedLink(config.blockedLink);
    }

    return {
      el: field,
      getValue: getValue,
      setValue: setValue,
      getBlockedReasons: getBlockedReasons,
      setBlockedReasons: setBlockedReasons,
      getBlockedReason: getBlockedReason,
      setBlockedReason: setBlockedReason,
      getBlockedLinks: getBlockedLinks,
      setBlockedLinks: setBlockedLinks,
      getBlockedLink: getBlockedLink,
      setBlockedLink: setBlockedLink,
      refreshSubtasks: refreshSubtasks,
      setEnabled: function (next) {
        setValue(next);
      },
      setEnableAllowed: collapse
        ? collapse.setEnableAllowed
        : function (allowed) {
            enableAllowed = allowed !== false;
          },
      isEnableAllowed: collapse
        ? collapse.isEnableAllowed
        : function () {
            return enableAllowed;
          },
      isEnabled: getValue,
      setExpanded: collapse
        ? collapse.setExpanded
        : function () {
            /* embedded: always open when visible */
          },
      isExpanded: collapse
        ? collapse.isExpanded
        : function () {
            return true;
          }
    };
  }

  // exports
  S.createEnAttenteField = createEnAttenteField;
})(typeof window !== 'undefined' ? window : this);
