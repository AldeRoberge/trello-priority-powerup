/**
 * agent-ui: mount() part 7 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.scaleHeatSteps = function scaleHeatSteps(items) {
      var nums = items.map(function (text) {
        return /^(?:[0-4]|[1-5])$/.test(text) ? parseInt(text, 10) : NaN;
      });
      if (nums.some(function (n) { return !isFinite(n); })) return null;
      var sorted = nums.slice().sort(function (a, b) { return a - b; });
      var key = sorted.join(',');
      var min;
      var max;
      if (key === '0,1,2,3,4') {
        min = 0;
        max = 4;
      } else if (key === '1,2,3,4,5') {
        min = 1;
        max = 5;
      } else {
        return null;
      }
      var span = max - min;
      return nums.map(function (n) {
        return Math.round(((n - min) / span) * 4);
      });
    };
    M.normalizeSuggestionChipItems = function normalizeSuggestionChipItems(list) {
      var out = [];
      (list || []).forEach(function (s) {
        var text = '';
        var heat = null;
        var icon = null;
        var color = null;
        var hl = null;
        if (typeof s === 'string') {
          text = s.trim();
        } else if (s && typeof s === 'object') {
          if (typeof s.text === 'string') text = s.text.trim();
          else if (typeof s.label === 'string') text = s.label.trim();
          if (s.heat != null && isFinite(Number(s.heat))) {
            heat = Math.max(0, Math.min(4, Math.round(Number(s.heat))));
          }
          if (typeof s.icon === 'string' && s.icon.trim()) {
            icon = s.icon.trim().toLowerCase();
          }
          if (typeof s.color === 'string' && s.color.trim()) {
            color = M.normalizeSuggestionColorName(s.color);
          }
          if (typeof s.hl === 'string' && /^[grya]$/.test(s.hl)) hl = s.hl;
        }
        if (!text) return;
        out.push({ text: text, heat: heat, icon: icon, color: color, hl: hl });
      });
      // Allow up to 6 answer chips so existing subtasks can all be offered.
      return M.enrichSuggestionChipItems(out.slice(0, M.interviewActive ? 5 : 6));
    };
    M.resolveSuggestionHeatSteps = function resolveSuggestionHeatSteps(items) {
      if (
        items.some(function (item) {
          return item.color;
        })
      ) {
        // Named colors (e.g. impact reach blue→green) win over green→red heat.
        return null;
      }
      var texts = items.map(function (item) {
        return item.text;
      });
      var numeric = M.scaleHeatSteps(texts);
      if (numeric) return numeric;
      if (
        items.some(function (item) {
          return item.heat != null;
        })
      ) {
        return items.map(function (item) {
          return item.heat;
        });
      }
      return null;
    };
    M.fillSuggestionChip = function fillSuggestionChip(chip, item, index) {
      chip.replaceChildren();
      if (index < 9) {
        var num = S.el('kbd', 'agent-suggestion-num', {
          text: '⇧' + String(index + 1)
        });
        num.setAttribute('aria-hidden', 'true');
        chip.appendChild(num);
        chip.setAttribute('aria-keyshortcuts', 'Shift+' + String(index + 1));
      }
      var iconHtml = item.icon ? M.suggestionIconMarkup(item.icon) : '';
      if (iconHtml) {
        var iconWrap = S.el('span', 'agent-suggestion-chip-icon');
        iconWrap.setAttribute('aria-hidden', 'true');
        iconWrap.innerHTML = iconHtml;
        chip.appendChild(iconWrap);
      }
      var labelEl = S.el('span', 'agent-suggestion-chip-label');
      labelEl.textContent = item.text;
      chip.appendChild(labelEl);
    };
    M.renderSuggestions = function renderSuggestions(list, options) {
      options = options || {};
      var items = M.normalizeSuggestionChipItems(list);
      M.composerSuggestions = items.map(function (item) {
        return item.text;
      });
      M.stopSuggestionConfirmTimer();
      M.clearSendConfirmCountdown();
      M.suggestionsEl.replaceChildren();
      M.suggestionsMultiSelect = false;
      M.suggestionsEl.classList.remove('is-multi');
      if (!items.length || !M.Agent.isConfigured(M.provider)) {
        M.suggestionsEl.hidden = true;
        if (M.tabComplete) M.tabComplete.refresh();
        M.notifyLayout();
        return;
      }
      M.suggestionsEl.hidden = false;
      var placeAbove = M.shouldPlaceSuggestionsAbove(options);
      M.syncSuggestionsPlacement(placeAbove);
      M.suggestionsMultiSelect = M.suggestionsAllowMultiSelect(options.multi);
      if (M.suggestionsMultiSelect) M.suggestionsEl.classList.add('is-multi');
      M.suggestionsEl.setAttribute(
        'aria-label',
        placeAbove
          ? M.suggestionsMultiSelect
            ? 'R\u00e9ponses sugg\u00e9r\u00e9es (plusieurs possibles)'
            : 'R\u00e9ponses sugg\u00e9r\u00e9es'
          : 'Questions sugg\u00e9r\u00e9es'
      );
      var heatSteps = M.resolveSuggestionHeatSteps(items);
      items.forEach(function (item, index) {
        var text = item.text;
        var chip = S.el('button', 'agent-suggestion-chip', { type: 'button' });
        M.fillSuggestionChip(chip, item, index);
        chip.setAttribute('data-suggestion', text);
        chip.disabled = M.pending;
        if (M.suggestionsMultiSelect) {
          chip.setAttribute('aria-pressed', 'false');
        }
        var colorName = item.color;
        var heat = heatSteps ? heatSteps[index] : null;
        if (colorName) {
          chip.classList.add('agent-suggestion-chip--scale');
          chip.classList.add('agent-suggestion-chip--color-' + colorName);
        } else if (heat != null && isFinite(heat)) {
          chip.classList.add('agent-suggestion-chip--scale');
          chip.classList.add('agent-suggestion-chip--heat-' + heat);
        }
        if (item.hl) chip.classList.add('agent-suggestion-chip--hl-' + item.hl);
        if (options.animate !== false) {
          chip.style.animationDelay = index * 40 + 'ms';
        }
        chip.addEventListener('click', function () {
          M.onSuggestionChip(text, chip);
        });
        if (
          global.ContextMenu &&
          typeof global.ContextMenu.bind === 'function'
        ) {
          ContextMenu.bind(chip, function () {
            return [
              {
                id: 'use-suggestion',
                label: 'Utiliser cette suggestion',
                action: function () {
                  M.onSuggestionChip(text, chip);
                },
              },
            ];
          });
        }
        M.suggestionsEl.appendChild(chip);
      });
      if (M.suggestionsMultiSelect) {
        var confirmEl = S.el('div', 'agent-suggestion-confirm');
        confirmEl.hidden = true;
        var promptEl = S.el('span', 'agent-suggestion-confirm-prompt');
        promptEl.textContent = M.SUGGESTION_CONFIRM_PROMPTS[0];
        confirmEl.appendChild(promptEl);
        M.suggestionsEl.appendChild(confirmEl);
      }
      if (M.tabComplete) M.tabComplete.refresh();
      M.syncSuggestionHighlightAura();
      M.notifyLayout();
      if (options.pinScroll) M.scrollMessagesToBottom();
    };
    M.syncSuggestionHighlightAura = function syncSuggestionHighlightAura() {
      if (!M.suggestionsEl) return;
      var row = null;
      if (M.messagesEl) {
        var rows = M.messagesEl.querySelectorAll('.agent-msg--assistant');
        if (rows.length) row = rows[rows.length - 1];
      }
      if (!row) {
        M.suggestionsEl.removeAttribute('data-aura');
        M.suggestionsEl.style.removeProperty('--agent-hl-accent');
        return;
      }
      var aura = row.getAttribute('data-aura');
      if (aura) M.suggestionsEl.setAttribute('data-aura', aura);
      else M.suggestionsEl.removeAttribute('data-aura');
      var accent = row.style.getPropertyValue('--agent-hl-accent');
      if (accent) M.suggestionsEl.style.setProperty('--agent-hl-accent', accent.trim());
      else M.suggestionsEl.style.removeProperty('--agent-hl-accent');
    };
    M.setSuggestionsBusy = function setSuggestionsBusy(isBusy) {
      Array.prototype.forEach.call(
        M.suggestionsEl.querySelectorAll('.agent-suggestion-chip'),
        function (chip) {
          chip.disabled = !!isBusy || M.pending;
        }
      );
      if (isBusy || M.pending) {
        M.stopSuggestionConfirmTimer();
        M.clearSendConfirmCountdown();
      } else {
        M.syncSuggestionConfirmUi();
      }
    };
    M.refreshSuggestions = async function refreshSuggestions(options) {
      options = options || {};
      if (!M.Agent.isConfigured(M.provider) || M.pending) return;
      // The assistant just asked something: next-step intents would not answer it.
      if (M.lastAssistantAsksQuestion()) {
        M.suggestionsSeq += 1;
        M.clearSuggestions();
        return;
      }
      var seq = ++M.suggestionsSeq;
      M.setSuggestionsBusy(true);
      try {
        var list = await M.Agent.suggestQuestions(M.provider, M.bridge, {
          history: M.history,
          onDebug: function (entry) {
            M.pushDebugEntry(entry);
          }
        });
        if (seq !== M.suggestionsSeq) return;
        M.renderSuggestions(list, {
          animate: options.animate !== false,
          answering: false
        });
      } catch (err) {
        if (seq !== M.suggestionsSeq) return;
        console.error('AgentUI suggestQuestions failed', err);
        if (err && err.debug) M.pushDebugEntry(err.debug);
        if (!M.suggestionsEl.childNodes.length) M.clearSuggestions();
      } finally {
        if (seq === M.suggestionsSeq) M.setSuggestionsBusy(false);
      }
    };
    M.buildTestItem = function buildTestItem(r) {
      var li = S.el('li', 'agent-test-item is-' + r.status);
      li.setAttribute('data-test-id', r.id);
      var mark = S.el('span', 'agent-test-mark', { text: S.statusIcon(r.status) });
      var bodyWrap = S.el('span', 'agent-test-body');
      bodyWrap.appendChild(S.el('span', 'agent-test-label', { text: r.label }));
      var detail = r.detail || '';
      if (r.ms != null) detail = (detail ? detail + ' \u00b7 ' : '') + r.ms + ' ms';
      if (detail) bodyWrap.appendChild(S.el('span', 'agent-test-detail', { text: detail }));
      li.appendChild(mark);
      li.appendChild(bodyWrap);
      return li;
    };
    M.clearTestResults = function clearTestResults() {
      M.testResultsEl.replaceChildren();
      M.testResultsEl.hidden = true;
    };
    M.upsertTestResult = function upsertTestResult(r) {
      if (!r || !r.id) return;
      M.testResultsEl.hidden = false;
      var next = M.buildTestItem(r);
      var existing = M.testResultsEl.querySelector('[data-test-id="' + r.id + '"]');
      if (existing) existing.replaceWith(next);
      else M.testResultsEl.appendChild(next);
      M.notifyLayout();
    };
    M.setInterviewMode = function setInterviewMode() {
      // Card interview is retired: it blocked tools such as cardPatches.
      M.interviewActive = false;
      if (!M.interviewActive) M.scheduleFaceSleep();
      M.interviewBar.hidden = !M.interviewActive;
      if (M.interviewActive) {
        M.applySection.hidden = true;
        M.setListenBarState('idle');
      } else if (M.settleReady && M.Agent.isConfigured(M.provider)) {
        M.startListening();
      } else {
        M.setListenBarState('idle');
      }
      M.syncComposerPlaceholder();
      M.notifyLayout();
    };
    M.expandAssistant = function expandAssistant() {
      if (M.collapse && !M.collapse.isEnabled()) {
        M.collapse.setEnabled(true, { expand: true });
      } else if (M.collapse && !M.collapse.isExpanded()) {
        M.collapse.setExpanded(true);
      }
    };
    M.persistInterviewState = async function persistInterviewState(next) {
      M.interviewState = M.Agent.normalizeCardInterview
        ? M.Agent.normalizeCardInterview(next)
        : next;
      if (!M.t || typeof M.Agent.saveCardInterview !== 'function') return M.interviewState;
      try {
        M.interviewState = await M.Agent.saveCardInterview(M.t, M.interviewState);
      } catch (err) {
        console.error('AgentUI saveCardInterview failed', err);
      }
      return M.interviewState;
    };
    M.persistChatHistory = async function persistChatHistory() {
      if (M.chats) {
        M.chats.saveMessages(M.history);
        return null;
      }
      if (!M.t) return null;
      try {
        if (M.isProjectScope && typeof M.Agent.saveBoardChat === 'function') {
          return await M.Agent.saveBoardChat(M.t, { messages: M.history });
        }
        if (typeof M.Agent.saveCardChat === 'function') {
          return await M.Agent.saveCardChat(M.t, { messages: M.history });
        }
        return null;
      } catch (err) {
        console.error('AgentUI saveChat failed', err);
        return null;
      }
    };
    M.schedulePersistChatHistory = function schedulePersistChatHistory() {
      if (!M.chats) {
        if (!M.t) return;
        if (
          !(M.isProjectScope
            ? typeof M.Agent.saveBoardChat === 'function'
            : typeof M.Agent.saveCardChat === 'function')
        ) {
          return;
        }
      }
      if (M.chatPersistTimer) clearTimeout(M.chatPersistTimer);
      M.chatPersistTimer = setTimeout(function () {
        M.chatPersistTimer = null;
        M.persistChatHistory();
      }, 250);
    };
    M.replayMessages = function replayMessages(msgs) {
      M.history.length = 0;
      M.sessionModelTier = null;
      for (var i = 0; i < msgs.length; i++) {
        var entry = msgs[i];
        if (!entry || !entry.role || !entry.content) continue;
        var selfPromptEntry =
          !!entry.selfPrompt || M.isSelfPromptHistoryText(entry.content);
        M.history.push({
          role: entry.role,
          content: entry.content,
          selfPrompt: selfPromptEntry
        });
        if (selfPromptEntry && entry.role === 'user') continue;
        M.appendMessage(entry.role, entry.content, {
          silent: true,
          noSound: true,
          noUnread: true
        });
      }
      return M.history.length > 0;
    };
    M.restoreChatHistory = async function restoreChatHistory() {
      if (!M.t) return false;
      var loader = M.isProjectScope ? M.Agent.loadBoardChat : M.Agent.loadCardChat;
      if (typeof loader !== 'function') return false;
      try {
        var stored = await loader.call(M.Agent, M.t);
        var msgs = (stored && stored.messages) || [];
        if (!msgs.length) return false;
        if (!M.replayMessages(msgs)) return false;
        M.chatRestored = true;
        if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
        M.notifyLayout();
        M.scrollMessagesToBottom();
        return true;
      } catch (err) {
        console.error('AgentUI loadChat failed', err);
        return false;
      }
    };
    M.chatBusy = function chatBusy() {
      return !!(M.pending || M.messageQueue.length > 0 || M.activeLaneCount > 0 || M.interviewActive);
    };
    M.chatsNarrow = function chatsNarrow() {
      return !!(global.matchMedia && global.matchMedia('(max-width: 759px)').matches);
    };
    M.readChatsOpen = function readChatsOpen() {
      if (M.chatsNarrow()) return false; // narrow: the list floats over the chat, so it starts hidden
      try {
        if (global.localStorage.getItem(S.CHATS_OPEN_STORAGE_KEY) === '0') return false;
      } catch (e) {
        /* storage blocked: default */
      }
      return true;
    };
    M.setChatsOpen = function setChatsOpen(open, remember) {
      M.chatsLayout.classList.toggle('is-chats-open', !!open);
      M.chatsToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      M.chatsToggleBtn.classList.toggle('is-active', !!open);
      if (remember && !M.chatsNarrow()) {
        try {
          global.localStorage.setItem(S.CHATS_OPEN_STORAGE_KEY, open ? '1' : '0');
        } catch (e) {
          /* storage blocked: the choice lasts until reload */
        }
      }
      M.notifyLayout();
    };
    M.closeChatsOverlay = function closeChatsOverlay() {
      if (M.chatsNarrow()) M.setChatsOpen(false, false);
    };
    M.flushChatPersist = function flushChatPersist() {
      if (M.chatPersistTimer) {
        clearTimeout(M.chatPersistTimer);
        M.chatPersistTimer = null;
      }
      if (M.chats) M.chats.saveMessages(M.history);
    };
    M.resetChatView = function resetChatView() {
      M.chatTurnGen += 1;
      M.laneEpoch += 1;
      M.laneDeferred = [];
      M.messageQueue = [];
      M.pending = false;
      M.stopThinkingMotions();
      M.clearSuggestions();
      M.clearFollowUps();
      M.clearPrompts();
      M.clearApplySuggestions();
      M.awaitingFeedback = null;
      M.syncComposerPlaceholder();
      if (M.activeOffer) {
        M.activeOffer = null;
        M.setListenBarState('idle');
        M.syncApplySummary();
      }
      M.messagesEl.replaceChildren();
      M.history.length = 0;
      M.sessionModelTier = null;
      M.chatRestored = false;
      M.sessionStats = {
        turns: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        estimated: false,
        lastUsage: null
      };
      M.renderChatStats();
      M.setError('');
      M.input.value = '';
      M.refreshComposerTypingGaze();
      M.updateComposerEnabled();
      M.emptyState.classList.toggle('is-hidden', M.Agent.isConfigured(M.provider));
    };
    M.showConversation = function showConversation(chat) {
      if (M.settingsOpen) M.setSettingsOpen(false);
      M.resetChatView();
      if (chat && M.replayMessages(chat.messages)) {
        M.chatRestored = true;
        M.scrollMessagesToBottom();
      }
      M.emptyState.classList.toggle('is-hidden', M.history.length > 0 || M.Agent.isConfigured(M.provider));
      if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
      M.notifyLayout();
      M.refreshSuggestions({ animate: true });
      M.focusComposerInput();
    };
    M.newConversation = function newConversation() {
      if (!M.chats || M.chatBusy()) return;
      M.flushChatPersist();
      if (M.chats.view().isDraft && !M.history.length) {
        M.focusComposerInput(); // already on an empty conversation
      } else {
        M.chats.startNew();
        M.showConversation(null);
      }
      M.closeChatsOverlay();
    };
    M.openConversation = function openConversation(id) {
      if (!M.chats || M.chatBusy()) return;
      if (M.chats.current().id === id) {
        M.focusComposerInput();
        M.closeChatsOverlay();
        return;
      }
      M.flushChatPersist();
      var chat = M.chats.open(id);
      if (!chat) return;
      M.showConversation(chat);
      M.closeChatsOverlay();
    };
    M.archiveConversation = function archiveConversation(id) {
      if (!M.chats) return;
      var isCurrent = M.chats.current().id === id;
      if (isCurrent && M.chatBusy()) return;
      M.flushChatPersist();
      var res = M.chats.archive(id);
      if (res.wasCurrent) M.showConversation(null);
    };
    M.restoreConversation = function restoreConversation(arg) {
      if (!M.chats || !arg) return;
      if (arg.open && !M.chatBusy()) return M.openConversation(arg.id);
      M.chats.restore(arg.id);
    };
    M.bootChats = async function bootChats() {
      if (!M.chats || M.chatsBooted) return;
      M.chatsBooted = true;
      if (M.chats.legacyPending() && M.t && typeof M.Agent.loadBoardChat === 'function') {
        try {
          var made = M.chats.importLegacy(await M.Agent.loadBoardChat(M.t));
          // The old chat now lives in the list: free its room in Trello plugin data.
          if (made && M.chats.persisted() && typeof M.Agent.saveBoardChat === 'function') {
            await M.Agent.saveBoardChat(M.t, { messages: [] });
          }
        } catch (err) {
          console.error('AgentUI previous chat import failed', err);
        }
      }
      M.chatsUi.render();
    };
    M.applyCardPatchesFromTurn = async function applyCardPatchesFromTurn(patches) {
      if (M.isProjectScope) return null;
      if (!patches || !patches.length || !M.t) return null;
      var Mem = global.AgentMemory;
      if (!Mem || typeof Mem.applyCardPatches !== 'function') return null;
      try {
        var current =
          (typeof M.bridge.getCardMemory === 'function' && M.bridge.getCardMemory()) ||
          Mem.emptyCardMemory();
        var updated = await Mem.applyCardPatches(M.t, current, patches);
        if (M.onCardMemoryUpdate) M.onCardMemoryUpdate(updated);
        else {
          M.bridge.getCardMemory = function () {
            return updated;
          };
        }
        // New learnings → schedule Dream to distill into Description between chats.
        M.dreamDirty = true;
        if (!M.interviewActive) {
          M.scheduleCardDream({ delay: M.pending ? 6000 : 4500 });
        }
        return updated;
      } catch (err) {
        console.error('AgentUI applyCardPatches failed', err);
        return null;
      }
    };
    M.applyBoardMemoryPatches = async function applyBoardMemoryPatches(patches) {
      if (!patches || !patches.length || !M.t) return null;
      var Mem = global.AgentMemory;
      if (!Mem || typeof Mem.applyPatches !== 'function') return null;
      try {
        var current =
          (typeof M.bridge.getMemory === 'function' && M.bridge.getMemory()) ||
          (typeof Mem.emptyMemory === 'function' ? Mem.emptyMemory() : null);
        if (!current) return null;
        var updated = await Mem.applyPatches(M.t, current, patches);
        if (M.onMemoryUpdate) M.onMemoryUpdate(updated);
        else {
          M.bridge.getMemory = function () {
            return updated;
          };
        }
        return updated;
      } catch (err) {
        console.error('AgentUI applyBoardMemoryPatches failed', err);
        return null;
      }
    };
    M.syncComposerPlaceholder = function syncComposerPlaceholder() {
      if (M.awaitingFeedback) {
        M.input.placeholder = 'Expliquez ce qui n\'allait pas\u2026';
      } else if (M.interviewActive) {
        M.input.placeholder = 'R\u00e9pondez \u00e0 la question\u2026';
      } else {
        M.input.placeholder = 'Demandez ce que vous voulez';
      }
    };
    M.clearAwaitingFeedback = function clearAwaitingFeedback(options) {
      options = options || {};
      if (!M.awaitingFeedback) return;
      var promptRow = M.awaitingFeedback.promptRow;
      var ask = M.awaitingFeedback.ask;
      M.awaitingFeedback = null;
      M.syncComposerPlaceholder();
      if (options.removePrompt && promptRow) {
        if (promptRow.parentNode) promptRow.parentNode.removeChild(promptRow);
        if (ask && M.history.length) {
          var last = M.history[M.history.length - 1];
          if (last && last.role === 'assistant' && last.content === ask) {
            M.history.pop();
            M.schedulePersistChatHistory();
          }
        }
        M.notifyLayout();
      }
    };
    M.assistantBubbleText = function assistantBubbleText(row) {
      if (!row) return '';
      var bubble = row.querySelector('.agent-msg-bubble');
      return bubble ? String(bubble.textContent || '').trim() : '';
    };
    M.markFeedbackRated = function markFeedbackRated(row, kind) {
      if (!row) return;
      var bar = row.querySelector('.agent-msg-feedback');
      if (!bar) return;
      bar.classList.add('is-rated');
      bar.classList.toggle('is-rated-up', kind === 'up');
      bar.classList.toggle('is-rated-down', kind === 'down');
      row.setAttribute('data-feedback', kind);
      var upBtn = bar.querySelector('.agent-msg-feedback-btn--up');
      var downBtn = bar.querySelector('.agent-msg-feedback-btn--down');
      if (upBtn) upBtn.setAttribute('aria-pressed', kind === 'up' ? 'true' : 'false');
      if (downBtn) {
        downBtn.setAttribute('aria-pressed', kind === 'down' ? 'true' : 'false');
      }
    };
    M.clearFeedbackRated = function clearFeedbackRated(row) {
      if (!row) return;
      var bar = row.querySelector('.agent-msg-feedback');
      if (!bar) return;
      bar.classList.remove('is-rated', 'is-rated-up', 'is-rated-down');
      row.removeAttribute('data-feedback');
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (btn) {
        btn.setAttribute('aria-pressed', 'false');
      });
    };
    M.persistUserCorrection = async function persistUserCorrection(feedbackText, priorAssistant) {
      var cleaned = String(feedbackText || '').trim();
      if (!cleaned) return;
      var pref = ('Pr\u00e9f\u00e9rence: ' + cleaned).slice(0, 160);
      var note = (
        'Pr\u00e9f\u00e9rence / correction: ' +
        cleaned +
        (priorAssistant
          ? ' (suite \u00e0: ' + String(priorAssistant).slice(0, 80) + ')'
          : '')
      ).slice(0, 200);
      var cardFact = ('Correction: ' + cleaned).slice(0, 160);
      await M.applyBoardMemoryPatches([
        { op: 'note', text: note },
        { op: 'remember', text: pref }
      ]);
      await M.applyCardPatchesFromTurn([{ op: 'remember', text: cardFact }]);
    };
    M.buildCorrectionUserPayload = function buildCorrectionUserPayload(userFeedback, priorAssistant) {
      return [
        '[Retour n\u00e9gatif \u2014 auto-correction]',
        'Ma r\u00e9ponse pr\u00e9c\u00e9dente n\'\u00e9tait pas correcte.',
        priorAssistant
          ? 'R\u00e9ponse concern\u00e9e\u00a0: \u00ab' +
            String(priorAssistant).slice(0, 280) +
            '\u00bb'
          : '',
        'Ce qui n\'allait pas selon l\'utilisateur\u00a0: \u00ab' +
          String(userFeedback || '').trim() +
          '\u00bb',
        'Retiens la le\u00e7on (patches board si pr\u00e9f\u00e9rence g\u00e9n\u00e9rale, cardPatches si li\u00e9e \u00e0 la carte) et corrige-toi bri\u00e8vement.',
        'Si une action \u00e9tait fausse, propose de la r\u00e9parer via outils. Ne r\u00e9p\u00e8te pas l\'erreur.'
      ]
        .filter(Boolean)
        .join('\n');
    };
    M.historyIndexForUserRow = function historyIndexForUserRow(row) {
      if (!row || !M.messagesEl) return -1;
      var userOrdinal = 0;
      var kids = M.messagesEl.children;
      for (var i = 0; i < kids.length; i++) {
        var kid = kids[i];
        if (kid === row) break;
        if (
          kid.classList &&
          kid.classList.contains('agent-msg--user') &&
          !kid.classList.contains('is-queued')
        ) {
          userOrdinal++;
        }
      }
      var seen = 0;
      for (var j = 0; j < M.history.length; j++) {
        if (M.history[j] && M.history[j].role === 'user') {
          if (seen === userOrdinal) return j;
          seen++;
        }
      }
      return -1;
    };
    M.removeMessageRowsFrom = function removeMessageRowsFrom(row) {
      if (!row) return;
      var next = row;
      while (next) {
        var remove = next;
        next = next.nextSibling;
        if (remove.parentNode) remove.parentNode.removeChild(remove);
      }
    };
    M.resumeFromUserMessage = function resumeFromUserMessage(row) {
      if (!row || !row.classList.contains('agent-msg--user')) return;
      var bubble = row.querySelector('.agent-msg-bubble');
      var text = bubble ? String(bubble.textContent || '') : '';

      // Invalidate any in-flight turn so its completion is ignored.
      M.chatTurnGen += 1;
      M.laneEpoch += 1;
      M.laneDeferred = [];
      M.stopThinkingMotions();
      M.clearSuggestions();
      M.clearFollowUps();
      M.clearPrompts();
      M.clearApplySuggestions();
      if (M.awaitingFeedback) {
        M.awaitingFeedback = null;
        M.syncComposerPlaceholder();
      }
      if (M.activeOffer) {
        M.activeOffer = null;
        M.setListenBarState('idle');
        M.syncApplySummary();
      }

      if (row.classList.contains('is-queued')) {
        var dropQueued = false;
        var keptQueue = [];
        for (var q = 0; q < M.messageQueue.length; q++) {
          if (M.messageQueue[q] && M.messageQueue[q].row === row) dropQueued = true;
          if (!dropQueued) keptQueue.push(M.messageQueue[q]);
        }
        M.messageQueue = keptQueue;
        M.removeMessageRowsFrom(row);
        M.pending = false;
        M.updateComposerEnabled();
        M.insertComposerSuggestion(text);
        M.restoreSuggestionsFromHistoryEntry(M.assistantEntryBeforeIndex());
        M.openAndFocusComposer();
        if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
        M.notifyLayout();
        return;
      }

      var histIdx = M.historyIndexForUserRow(row);
      var prevAssistant =
        histIdx >= 0 ? M.assistantEntryBeforeIndex(histIdx) : null;
      M.messageQueue = [];
      M.removeMessageRowsFrom(row);
      if (histIdx >= 0) {
        M.history.splice(histIdx);
      }
      if (!M.history.length) M.sessionModelTier = null;
      M.pending = false;
      M.updateComposerEnabled();
      M.schedulePersistChatHistory();
      M.insertComposerSuggestion(text);
      M.restoreSuggestionsFromHistoryEntry(prevAssistant);
      M.openAndFocusComposer();
      if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
      M.emptyState.classList.toggle(
        'is-hidden',
        M.history.length > 0 || M.Agent.isConfigured(M.provider)
      );
      M.notifyLayout();
    };
    M.copyTextFallback = function copyTextFallback(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.setAttribute('aria-hidden', 'true');
      ta.tabIndex = -1;
      // Keep the node in-document for execCommand, but avoid scroll-into-view.
      ta.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;' +
        'border:0;outline:none;opacity:0;pointer-events:none;';
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var messagesScroll =
        M.messagesEl && typeof M.messagesEl.scrollTop === 'number'
          ? M.messagesEl.scrollTop
          : null;
      document.body.appendChild(ta);
      var ok = false;
      try {
        try {
          ta.focus({ preventScroll: true });
        } catch (focusErr) {
          ta.focus();
        }
        ta.select();
        if (typeof ta.setSelectionRange === 'function') {
          ta.setSelectionRange(0, ta.value.length);
        }
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      if (typeof window.scrollTo === 'function') {
        window.scrollTo(scrollX, scrollY);
      }
      if (M.messagesEl && messagesScroll != null) {
        M.messagesEl.scrollTop = messagesScroll;
      }
      return ok;
    };
    M.copyTextToClipboard = function copyTextToClipboard(text) {
      var value = String(text || '');
      if (!value) return Promise.resolve(false);
      if (
        global.navigator &&
        global.navigator.clipboard &&
        typeof global.navigator.clipboard.writeText === 'function'
      ) {
        return global.navigator.clipboard.writeText(value).then(
          function () {
            return true;
          },
          function () {
            return M.copyTextFallback(value);
          }
        );
      }
      return Promise.resolve(M.copyTextFallback(value));
    };
    M.messageBubblePlainText = function messageBubblePlainText(row) {
      if (!row) return '';
      var bubble = row.querySelector('.agent-msg-bubble');
      if (!bubble || bubble.classList.contains('agent-msg-bubble--pending')) {
        return '';
      }
      return String(bubble.textContent || '').trim();
    };
    M.flashCopyButton = function flashCopyButton(btn) {
      if (!btn) return;
      var icon = btn.querySelector('i');
      if (!icon) return;
      var prevClass = icon.className;
      var prevTitle = btn.getAttribute('title') || 'Copier';
      icon.className = 'ti ti-check';
      btn.classList.add('is-copied');
      btn.setAttribute('title', 'Copi\u00e9');
      btn.setAttribute('aria-label', 'Copi\u00e9');
      if (btn._copyReset) clearTimeout(btn._copyReset);
      btn._copyReset = setTimeout(function () {
        icon.className = prevClass;
        btn.classList.remove('is-copied');
        btn.setAttribute('title', prevTitle);
        btn.setAttribute('aria-label', 'Copier le message');
        btn._copyReset = null;
      }, 1400);
    };
    M.attachMessageCopyControl = function attachMessageCopyControl(row) {
      if (!row || row.querySelector('.agent-msg-copy')) return;
      if (
        row.classList.contains('is-pending') ||
        row.classList.contains('agent-msg--offer') ||
        row.classList.contains('agent-msg--recap')
      ) {
        return;
      }
      var btn = S.el('button', 'agent-msg-copy', {
        type: 'button',
        title: 'Copier',
        'aria-label': 'Copier le message'
      });
      btn.appendChild(S.el('i', 'ti ti-copy', { 'aria-hidden': 'true' }));
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var text = M.messageBubblePlainText(row);
        if (!text) return;
        M.copyTextToClipboard(text).then(function (ok) {
          if (ok) M.flashCopyButton(btn);
        });
      });

      var bubble = row.querySelector('.agent-msg-bubble');
      if (row.classList.contains('agent-msg--user')) {
        if (bubble && bubble.parentNode === row) {
          row.insertBefore(btn, bubble);
        } else {
          row.appendChild(btn);
        }
        return;
      }

      var feedback = row.querySelector('.agent-msg-feedback');
      var verify = row.querySelector('.agent-tool-verify');
      if (feedback && feedback.parentNode === row) {
        row.insertBefore(btn, feedback.nextSibling);
      } else if (verify && verify.parentNode === row) {
        row.insertBefore(btn, verify.nextSibling);
      } else if (bubble && bubble.parentNode === row) {
        row.insertBefore(btn, bubble.nextSibling);
      } else {
        row.appendChild(btn);
      }
    };
    M.attachUserResumeControl = function attachUserResumeControl(row) {
      if (!row || row.querySelector('.agent-msg-edit')) return;
      var btn = S.el('button', 'agent-msg-edit', {
        type: 'button',
        title: 'Modifier et reprendre',
        'aria-label': 'Modifier ce message et reprendre depuis ici'
      });
      btn.appendChild(S.el('i', 'ti ti-pencil', { 'aria-hidden': 'true' }));
      var bubble = row.querySelector('.agent-msg-bubble');
      if (bubble && bubble.parentNode === row) {
        row.insertBefore(btn, bubble);
      } else {
        row.insertBefore(btn, row.firstChild);
      }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        M.resumeFromUserMessage(row);
      });
    };
    M.attachFeedbackControls = function attachFeedbackControls(row) {
      if (!row || row.querySelector('.agent-msg-feedback')) return;
      if (
        row.classList.contains('agent-msg--error') ||
        row.classList.contains('agent-msg--offer') ||
        row.classList.contains('agent-msg--recap') ||
        row.classList.contains('is-pending')
      ) {
        return;
      }
      var bar = S.el('div', 'agent-msg-feedback', {
        role: 'group',
        'aria-label': 'Noter cette r\u00e9ponse'
      });
      var upBtn = S.el('button', 'agent-msg-feedback-btn agent-msg-feedback-btn--up', {
        type: 'button',
        title: 'Bonne r\u00e9ponse',
        'aria-label': 'Bonne r\u00e9ponse'
      });
      upBtn.appendChild(S.el('i', 'ti ti-thumb-up'));
      var downBtn = S.el(
        'button',
        'agent-msg-feedback-btn agent-msg-feedback-btn--down',
        {
          type: 'button',
          title: 'Mauvaise r\u00e9ponse',
          'aria-label': 'Mauvaise r\u00e9ponse'
        }
      );
      downBtn.appendChild(S.el('i', 'ti ti-thumb-down'));
      bar.appendChild(upBtn);
      bar.appendChild(downBtn);
      var bubble = row.querySelector('.agent-msg-bubble');
      var verify = row.querySelector('.agent-tool-verify');
      if (verify && verify.parentNode === row) {
        row.insertBefore(bar, verify.nextSibling);
      } else if (bubble && bubble.parentNode === row) {
        row.insertBefore(bar, bubble.nextSibling);
      } else {
        row.appendChild(bar);
      }

      upBtn.setAttribute('aria-pressed', 'false');
      downBtn.setAttribute('aria-pressed', 'false');

      upBtn.addEventListener('click', function () {
        if (M.pending) return;
        var current = row.getAttribute('data-feedback');
        if (current === 'up') {
          M.clearFeedbackRated(row);
          M.setAssistantFaceEmotion(row, 'neutral', { animate: true });
          M.notifyLayout();
          return;
        }
        if (M.awaitingFeedback) {
          M.clearAwaitingFeedback({ removePrompt: true });
        }
        M.markFeedbackRated(row, 'up');
        M.setAssistantFaceEmotion(row, 'happy', { animate: true });
        M.notifyLayout();
      });

      downBtn.addEventListener('click', function () {
        if (M.pending) return;
        var current = row.getAttribute('data-feedback');
        if (current === 'down') {
          if (M.awaitingFeedback && M.awaitingFeedback.row === row) {
            M.clearAwaitingFeedback({ removePrompt: true });
          }
          M.clearFeedbackRated(row);
          M.setAssistantFaceEmotion(row, 'neutral', { animate: true });
          M.notifyLayout();
          return;
        }
        if (M.awaitingFeedback) {
          M.clearAwaitingFeedback({ removePrompt: true });
        }
        M.markFeedbackRated(row, 'down');
        M.setAssistantFaceEmotion(row, 'sad', { animate: true });
        var content = M.assistantBubbleText(row);
        var ask =
          'Qu\'est-ce que j\'ai mal fait? Je peux m\'am\u00e9liorer.';
        var promptRow = M.appendMessage('assistant', ask, {
          noFeedback: true,
          emotion: 'curious',
          noUnread: true
        });
        M.awaitingFeedback = {
          row: row,
          content: content,
          ask: ask,
          promptRow: promptRow
        };
        M.syncComposerPlaceholder();
        M.history.push({ role: 'assistant', content: ask });
        M.schedulePersistChatHistory();
        M.expandAssistant();
        try {
          M.input.focus();
        } catch (e) {
          /* ignore */
        }
        M.notifyLayout();
      });
    };
    M.finishInterview = async function finishInterview(options) {
      options = options || {};
      if (M.interviewState.complete && !M.interviewActive) return;
      M.interviewState = M.Agent.markInterviewComplete
        ? M.Agent.markInterviewComplete(M.interviewState)
        : Object.assign({}, M.interviewState, {
            complete: true,
            completedAt: new Date().toISOString()
          });
      await M.persistInterviewState(M.interviewState);
      M.setInterviewMode(false);
      M.markSettleReady();
      if (options.announce !== false) {
        M.appendMessage(
          'assistant',
          options.message ||
            'Okay, on a le cadre. Tu peux me demander d\'ajuster la priorit\u00e9, la date limite ou les sous-t\u00e2ches quand tu veux.'
        );
        M.history.push({
          role: 'assistant',
          content:
            options.message ||
            'Okay, on a le cadre. Tu peux me demander d\'ajuster la priorit\u00e9, la date limite ou les sous-t\u00e2ches quand tu veux.'
        });
        M.schedulePersistChatHistory();
      }
      M.refreshSuggestions({ animate: true });
      await M.runOpenSanityThenSuggestions({ animate: true });
      // Post-interview: Dream consolidates learnings into the Description between chats.
      M.scheduleCardDream({ delay: 3500, force: true });
      M.notifyLayout();
    };
    M.bootstrapSanityCheck = async function bootstrapSanityCheck() {
      if (M.sanityBootstrapped || M.pending || M.interviewActive) return null;
      if (typeof M.Agent.cardSanityCheck !== 'function') return null;
      M.sanityBootstrapped = true;
      S.dbgLog('agentUi', 'bootstrap.sanity.start', {});
      try {
        var result = await M.Agent.cardSanityCheck(M.provider, M.bridge, {
          onDebug: function (entry) {
            M.pushDebugEntry(entry);
          }
        });
        if (!result || !result.message) return null;
        M.expandAssistant();
        M.appendMessage('assistant', result.message, {
          note: 'Coh\u00e9rence'
        });
        M.history.push({
          role: 'assistant',
          content: result.message,
          suggestions: result.suggestions || [],
          suggestionsMulti: !!result.suggestionsMulti
        });
        M.schedulePersistChatHistory();
        if (result.suggestions && result.suggestions.length) {
          M.suggestionsSeq += 1;
          M.renderSuggestions(result.suggestions, {
            animate: true,
            multi: result.suggestionsMulti
          });
        }
        if (result.followUps && result.followUps.length) {
          M.renderFollowUps(result.followUps);
        }
        M.notifyLayout();
        return result;
      } catch (err) {
        console.error('AgentUI bootstrapSanityCheck failed', err);
        return null;
      }
    };
    M.runOpenSanityThenSuggestions = async function runOpenSanityThenSuggestions(options) {
      options = options || {};
      await M.bootstrapSanityCheck();
      // Between sessions: if facts changed since last Dream, consolidate Description.
      M.scheduleCardDream({ delay: 4000 });
      if (options.skipApplySuggestions) return;
      M.refreshApplySuggestions({ animate: options.animate !== false });
    };
    M.bootstrapCardInterview = async function bootstrapCardInterview() {
      if (M.isProjectScope) {
        M.interviewBootstrapped = true;
        M.markSettleReady();
        S.dbgLog('agentUi', 'bootstrap.interview.skip', { reason: 'project-scope' });
        M.refreshSuggestions({ animate: true });
        return;
      }
      if (!M.t || M.interviewBootstrapped || M.pending) return;
      S.dbgLog('agentUi', 'bootstrap.interview.start', {});
      if (!M.Agent.isConfigured(M.provider) || typeof M.Agent.cardInterviewTurn !== 'function') {
        M.markSettleReady();
        await M.runOpenSanityThenSuggestions({
          animate: true,
          skipApplySuggestions: !M.Agent.isConfigured(M.provider)
        });
        return;
      }
      M.interviewBootstrapped = true;
      try {
        M.interviewState = await M.Agent.loadCardInterview(M.t);
      } catch (err) {
        console.error('AgentUI loadCardInterview failed', err);
        M.interviewState = M.Agent.emptyCardInterview
          ? M.Agent.emptyCardInterview()
          : { complete: false, asked: [] };
      }
      if (!M.interviewState.complete) {
        M.interviewState = M.Agent.markInterviewComplete
          ? M.Agent.markInterviewComplete(M.interviewState)
          : Object.assign({}, M.interviewState, {
              complete: true,
              completedAt: new Date().toISOString()
            });
        try {
          await M.persistInterviewState(M.interviewState);
        } catch (persistErr) {
          console.error('AgentUI close interview failed', persistErr);
        }
      }
      M.setInterviewMode(false);
      M.refreshSuggestions({ animate: true });
      M.markSettleReady();
      if (M.chatRestored) {
        M.refreshApplySuggestions({ animate: true });
        M.scheduleCardDream({ delay: 4000 });
      } else {
        await M.runOpenSanityThenSuggestions({ animate: true });
      }
      return;
    };
    },
    run: function (M) {

    }
  });
})(typeof window !== 'undefined' ? window : this);
