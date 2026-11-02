/**
 * agent-ui: mount() part 6 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.runActionsWithPanel = function runActionsWithPanel(actions) {
      var incoming = Array.isArray(actions) ? actions : [];
      var guides = [];
      var list = [];
      incoming.forEach(function (a) {
        if (a && (a.tool === 'show_guide' || a.tool === 'schedule_check')) guides.push(a);
        else if (a) list.push(a);
      });
      var guidePromise = guides.length
        ? M.Agent.executeActions(M.bridge, guides).then(function (g) {
            M.consumeGuideResults(g);
            return g;
          })
        : Promise.resolve(null);
      function mergeApplied(applied, g) {
        if (!g) return applied;
        if (!applied || !applied.results || !applied.results.length) return g;
        return {
          ok: !!(applied.ok && g.ok),
          results: (g.results || []).concat(applied.results || []),
          summary: [g.summary, applied.summary].filter(Boolean).join(' '),
          errors: (g.errors || []).concat(applied.errors || []),
          recap: applied.recap || g.recap || ''
        };
      }
      if (!list.length) {
        return guidePromise.then(function (g) {
          return g || M.Agent.executeActions(M.bridge, []);
        });
      }
      var panel = S.el('div', 'agent-work-panel is-running');
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      var head = S.el('div', 'agent-work-head');
      var headIcon = S.el('span', 'agent-work-head-icon');
      headIcon.textContent = '✦';
      var headText = S.el('span', 'agent-work-head-text');
      headText.textContent = 'Je travaille sur la carte…';
      head.appendChild(headIcon);
      head.appendChild(headText);
      panel.appendChild(head);
      var steps = S.el('ol', 'agent-work-steps');
      var rows = list.map(function (action) {
        var li = S.el('li', 'agent-work-step is-pending');
        var mark = S.el('span', 'agent-work-mark');
        var label = S.el('span', 'agent-work-label');
        label.textContent =
          typeof M.Agent.describeActionStep === 'function'
            ? M.Agent.describeActionStep(action)
            : 'J\'applique une modification';
        var detail = S.el('span', 'agent-work-detail');
        li.appendChild(mark);
        li.appendChild(label);
        li.appendChild(detail);
        steps.appendChild(li);
        return { li: li, detail: detail };
      });
      panel.appendChild(steps);
      M.messagesEl.appendChild(panel);
      M.scrollMessagesToBottom();
      M.notifyLayout();
      return guidePromise.then(function (g) {
        return M.Agent.executeActions(M.bridge, list, {
        onStart: function (i) {
          if (!rows[i]) return;
          rows[i].li.className = 'agent-work-step is-running';
          M.scrollMessagesToBottom();
        },
        onDone: function (i, result) {
          if (!rows[i]) return;
          var ok = !result || result.ok !== false;
          rows[i].li.className = 'agent-work-step ' + (ok ? 'is-done' : 'is-failed');
          var text = ok
            ? (result && result.summary) || ''
            : (result && result.error) || 'Échec';
          rows[i].detail.textContent = text;
        }
      }).then(
        function (applied) {
          var okAll = !!(applied && applied.ok);
          panel.classList.remove('is-running');
          panel.classList.add(okAll ? 'is-done' : 'is-failed');
          headIcon.textContent = okAll ? '✓' : '!';
          headText.textContent = okAll
            ? list.length > 1
              ? 'Terminé — ' + list.length + ' modifications appliquées'
              : 'Modification appliquée'
            : 'Terminé avec des erreurs';
          M.notifyLayout();
          return mergeApplied(applied, g);
        },
        function (err) {
          panel.classList.remove('is-running');
          panel.classList.add('is-failed');
          headIcon.textContent = '!';
          headText.textContent = 'Échec';
          throw err;
        }
      );
      });
    };
    M.appendActionResultBlocks = function appendActionResultBlocks(applied, context) {
      if (
        typeof AgentBlocks === 'undefined' ||
        typeof AgentBlocks.synthesizeBlocksFromResults !== 'function' ||
        typeof AgentBlocks.appendResultBlocks !== 'function'
      ) {
        return null;
      }
      var blocks = AgentBlocks.synthesizeBlocksFromResults(applied, context);
      if (!blocks.length) return null;
      var host = null;
      var kids = M.messagesEl.children;
      for (var i = kids.length - 1; i >= 0; i--) {
        if (
          kids[i].classList &&
          kids[i].classList.contains('agent-msg--assistant')
        ) {
          host = kids[i];
          break;
        }
      }
      if (!host) return null;
      return AgentBlocks.appendResultBlocks(host, blocks);
    };
    M.appendChatError = function appendChatError(text) {
      return M.appendMessage('assistant', text || 'Erreur de l\'assistant', {
        note: 'Erreur',
        error: true
      });
    };
    M.closeToolVerifyTips = function closeToolVerifyTips(exceptWrap) {
      Array.prototype.forEach.call(
        M.messagesEl.querySelectorAll('.agent-tool-verify.is-open'),
        function (wrap) {
          if (exceptWrap && wrap === exceptWrap) return;
          wrap.classList.remove('is-open');
          var btn = wrap.querySelector('.agent-tool-verify-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      );
    };
    M.positionToolVerifyTip = function positionToolVerifyTip(wrap) {
      var btn = wrap.querySelector('.agent-tool-verify-btn');
      var tip = wrap.querySelector('.agent-tool-verify-tip');
      if (!btn || !tip) return;
      var anchor = btn.getBoundingClientRect();
      var gap = 6;
      var margin = 8;
      var tipW = tip.offsetWidth || 200;
      var tipH = tip.offsetHeight || 40;
      var top = anchor.bottom + gap;
      var left = anchor.left;
      if (top + tipH > window.innerHeight - margin && anchor.top - gap - tipH >= margin) {
        top = anchor.top - gap - tipH;
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    };
    M.appendChangeRecap = function appendChangeRecap(applied, options) {
      options = options || {};
      var recap = M.Agent.formatChangeRecap
        ? M.Agent.formatChangeRecap(applied || { results: [] }, options)
        : (applied && applied.recap) || '';
      if (!recap) return null;
      var hasFailures =
        options.ok === false ||
        !!(options.droppedActions && options.droppedActions.length) ||
        !!(
          applied &&
          Array.isArray(applied.results) &&
          applied.results.some(function (r) {
            return r && r.ok === false;
          })
        );
      var note = options.emptyClaim
        ? 'V\u00e9rification'
        : hasFailures
          ? 'Erreur'
          : 'Modifications techniques';
      var tipId =
        'agent-tool-verify-tip-' + Math.random().toString(36).slice(2, 9);

      var wrap = S.el(
        'div',
        'agent-tool-verify' + (hasFailures ? ' is-error' : '')
      );
      var btn = S.el('button', 'agent-tool-verify-btn', {
        type: 'button',
        'aria-label': note,
        title: note,
        'aria-expanded': 'false',
        'aria-controls': tipId
      });
      btn.textContent = 'i';
      var tip = S.el('div', 'agent-tool-verify-tip', {
        id: tipId,
        role: 'tooltip'
      });
      tip.textContent = recap;

      function openTip() {
        M.closeToolVerifyTips(wrap);
        M.positionToolVerifyTip(wrap);
        wrap.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
      function closeTip() {
        wrap.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (wrap.classList.contains('is-open')) closeTip();
        else openTip();
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeTip();
          btn.blur();
        }
      });

      wrap.appendChild(btn);
      wrap.appendChild(tip);

      var host = null;
      var kids = M.messagesEl.children;
      for (var i = kids.length - 1; i >= 0; i--) {
        if (kids[i].classList && kids[i].classList.contains('agent-msg--assistant')) {
          host = kids[i];
          break;
        }
      }
      if (host) {
        var hostBubble = host.querySelector('.agent-msg-bubble');
        if (hostBubble) {
          host.insertBefore(wrap, hostBubble.nextSibling);
        } else {
          host.appendChild(wrap);
        }
        if (options.emptyClaim) M.setAssistantFaceEmotion(host, 'surprised');
        else if (hasFailures) M.setAssistantFaceEmotion(host, 'sad');
        else M.setAssistantFaceEmotion(host, 'happy');
      } else {
        var row = S.el('div', 'agent-msg agent-msg--assistant agent-msg--recap');
        row.appendChild(wrap);
        M.attachAssistantFace(
          row,
          options.emptyClaim ? 'surprised' : hasFailures ? 'sad' : 'happy'
        );
        M.messagesEl.appendChild(row);
      }
      M.scrollMessagesToBottom();
      M.notifyLayout();
      if (hasFailures) {
        var errText = M.Agent.formatActionErrors
          ? M.Agent.formatActionErrors(applied || { results: [] }, options)
          : '';
        if (!errText && recap) errText = recap;
        if (errText) M.appendChatError(errText);
      }
      return wrap;
    };
    M.clearFollowUps = function clearFollowUps() {
      M.followUpsEl.replaceChildren();
      M.followUpsEl.hidden = true;
      M.notifyLayout();
    };
    M.clearPrompts = function clearPrompts() {
      M.promptsEl.replaceChildren();
      M.promptsEl.hidden = true;
      M.notifyLayout();
    };
    M.axisWordLabel = function axisWordLabel(key, value) {
      if (
        typeof PriorityUI !== 'undefined' &&
        typeof PriorityUI.wordFor === 'function'
      ) {
        try {
          return PriorityUI.wordFor(key, value) || String(value);
        } catch (e) {
          return String(value);
        }
      }
      return String(value);
    };
    M.renderPriorityAxesPrompt = function renderPriorityAxesPrompt(prompt) {
      var card = S.el('div', 'agent-prompt agent-prompt--priority-axes');
      var title = S.el('div', 'agent-prompt-title', {
        text: prompt.title || 'Affiner urgence, impact et facilit\u00e9'
      });
      card.appendChild(title);

      var dims =
        (global.PriorityTrello && global.PriorityTrello.PRIORITY_DIMENSIONS) ||
        [
          { key: 'urgency', label: 'Urgence', min: 0, max: 4 },
          { key: 'impact', label: 'Impact', min: 0, max: 4 },
          { key: 'ease', label: 'Facilit\u00e9', min: 1, max: 5 }
        ];

      var values = {
        urgency: prompt.urgency,
        impact: prompt.impact,
        ease: prompt.ease
      };
      var valueEls = {};

      dims.forEach(function (dim) {
        var key = dim.key;
        var row = S.el('div', 'agent-prompt-slider-row');
        var head = S.el('div', 'agent-prompt-slider-head');
        head.appendChild(
          S.el('span', 'agent-prompt-slider-label', { text: dim.label })
        );
        var valEl = S.el('span', 'agent-prompt-slider-value', {
          text: M.axisWordLabel(key, values[key])
        });
        head.appendChild(valEl);
        valueEls[key] = valEl;

        var sliderWrap = S.el('div', 'field-slider agent-prompt-slider');
        var input = S.el('input', 'field-range', {
          type: 'range',
          min: String(dim.min),
          max: String(dim.max),
          step: '1',
          value: String(values[key]),
          'aria-label': dim.label
        });
        input.addEventListener('input', function () {
          values[key] = Number(input.value);
          valEl.textContent = M.axisWordLabel(key, values[key]);
        });
        sliderWrap.appendChild(input);
        row.appendChild(head);
        row.appendChild(sliderWrap);
        card.appendChild(row);
      });

      var actionsRow = S.el('div', 'agent-prompt-actions');
      var applyBtn = S.el('button', 'tp-button agent-prompt-apply', {
        type: 'button',
        text: prompt.submitLabel || 'Appliquer'
      });
      var skipBtn = S.el('button', 'agent-prompt-skip', {
        type: 'button',
        text: 'C\'est bon'
      });
      applyBtn.addEventListener('click', function () {
        if (M.pending) return;
        M.onPromptApplyPriorityAxes(values);
      });
      skipBtn.addEventListener('click', function () {
        M.clearPrompts();
      });
      actionsRow.appendChild(applyBtn);
      actionsRow.appendChild(skipBtn);
      card.appendChild(actionsRow);
      return card;
    };
    M.renderPrompts = function renderPrompts(prompts) {
      M.clearPrompts();
      if (!prompts || !prompts.length) return;
      var rendered = 0;
      prompts.forEach(function (p) {
        if (!p || p.type !== 'priority_axes') return;
        M.promptsEl.appendChild(M.renderPriorityAxesPrompt(p));
        rendered += 1;
      });
      if (!rendered) return;
      M.promptsEl.hidden = false;
      M.notifyLayout();
    };
    M.onPromptApplyPriorityAxes = async function onPromptApplyPriorityAxes(values) {
      if (M.pending) return;
      M.pending = true;
      M.updateComposerEnabled();
      try {
        M.muteListening();
        var result = await M.Agent.executeActions(M.bridge, [
          {
            tool: 'set_priority',
            args: {
              urgency: values.urgency,
              impact: values.impact,
              ease: values.ease,
              priorityEnabled: true
            }
          }
        ]);
        M.clearPrompts();
        M.appendMessage('assistant', 'Okay, c\'est mis \u00e0 jour.', {
          note: 'Affinage priorit\u00e9'
        });
        M.appendChangeRecap(result, { ok: result.ok });
        M.appendActionResultBlocks(result);
        M.history.push({
          role: 'assistant',
          content: 'Okay, c\'est mis \u00e0 jour.'
        });
        M.schedulePersistChatHistory();
        if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
        M.muteListening();
        M.refreshSuggestions({ animate: true });
        M.refreshApplySuggestions({ animate: true });
      } catch (err) {
        M.appendChatError((err && err.message) || 'Erreur lors de l\'affinage');
      } finally {
        M.releasePendingAndDrain();
      }
    };
    M.renderFollowUps = function renderFollowUps(followUps) {
      M.clearFollowUps();
      if (!followUps || !followUps.length) return;
      // Action chips only — question-style follow-ups live in suggestions.
      var actionsOnly = followUps.filter(function (fu) {
        return fu && fu.actions && fu.actions.length;
      });
      if (!actionsOnly.length) return;
      M.followUpsEl.hidden = false;
      actionsOnly.forEach(function (fu) {
        var chip = S.el('button', 'agent-followup-chip agent-followup-chip--action', {
          type: 'button'
        });
        chip.textContent = fu.label;
        chip.addEventListener('click', function () {
          M.onFollowUp(fu);
        });
        if (
          global.ContextMenu &&
          typeof global.ContextMenu.bind === 'function'
        ) {
          ContextMenu.bind(chip, function () {
            return [
              {
                id: 'followup',
                label: fu.label || 'Appliquer',
                action: function () {
                  M.onFollowUp(fu);
                },
              },
            ];
          });
        }
        M.followUpsEl.appendChild(chip);
      });
      M.notifyLayout();
    };
    M.clearSendConfirmCountdown = function clearSendConfirmCountdown() {
      M.sendConfirmCount.textContent = '';
      M.sendConfirmCount.hidden = true;
      M.sendBtn.classList.remove('is-confirming');
      M.sendBtn.setAttribute('aria-label', 'Envoyer');
    };
    M.stopSuggestionConfirmTimer = function stopSuggestionConfirmTimer() {
      if (M.suggestionConfirmTimer) {
        clearInterval(M.suggestionConfirmTimer);
        M.suggestionConfirmTimer = null;
      }
      M.suggestionConfirmDeadline = 0;
    };
    M.clearSuggestions = function clearSuggestions() {
      M.stopSuggestionConfirmTimer();
      M.clearSendConfirmCountdown();
      M.suggestionsMultiSelect = false;
      M.composerSuggestions = [];
      M.suggestionsEl.replaceChildren();
      M.suggestionsEl.hidden = true;
      M.suggestionsEl.classList.remove('is-multi');
      if (M.tabComplete) M.tabComplete.refresh();
      M.notifyLayout();
    };
    M.suggestionsPayloadFromHistoryEntry = function suggestionsPayloadFromHistoryEntry(entry) {
      if (!entry || entry.role !== 'assistant') return null;
      if (Array.isArray(entry.suggestions) && entry.suggestions.length) {
        return {
          suggestions: entry.suggestions,
          suggestionsMulti: !!entry.suggestionsMulti
        };
      }
      var parsed = entry.rawJson;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          return null;
        }
      }
      if (!parsed || typeof parsed !== 'object') return null;
      var list = parsed.suggestions;
      if (!Array.isArray(list) || !list.length) return null;
      if (typeof M.Agent.normalizeSuggestionEntries === 'function') {
        list = M.Agent.normalizeSuggestionEntries(list, 4, {
          scale: !!parsed.suggestionScale,
          message: entry.content || parsed.message || ''
        });
      }
      if (!list.length) return null;
      return {
        suggestions: list,
        suggestionsMulti: !!parsed.suggestionsMulti
      };
    };
    M.restoreSuggestionsFromHistoryEntry = function restoreSuggestionsFromHistoryEntry(entry) {
      var payload = M.suggestionsPayloadFromHistoryEntry(entry);
      if (!payload) return false;
      M.suggestionsSeq += 1;
      M.renderSuggestions(payload.suggestions, {
        animate: true,
        multi: payload.suggestionsMulti,
        answering: true
      });
      return true;
    };
    M.assistantEntryBeforeIndex = function assistantEntryBeforeIndex(idx) {
      var end =
        typeof idx === 'number' && idx >= 0 ? idx - 1 : M.history.length - 1;
      for (var i = end; i >= 0; i--) {
        if (M.history[i] && M.history[i].role === 'assistant') return M.history[i];
      }
      return null;
    };
    M.lastAssistantAsksQuestion = function lastAssistantAsksQuestion() {
      for (var i = M.history.length - 1; i >= 0; i--) {
        var turn = M.history[i];
        if (turn && turn.role === 'assistant') {
          return /\?/.test(String(turn.content || ''));
        }
      }
      return false;
    };
    M.shouldPlaceSuggestionsAbove = function shouldPlaceSuggestionsAbove(options) {
      options = options || {};
      if (options.answering === true) return true;
      if (options.answering === false) return false;
      if (M.interviewActive) return true;
      if (options.multi === true) return true;
      return M.lastAssistantAsksQuestion();
    };
    M.syncSuggestionsPlacement = function syncSuggestionsPlacement(placeAbove) {
      M.suggestionsEl.classList.toggle('is-below-composer', !placeAbove);
      if (placeAbove) {
        if (M.composer.previousSibling !== M.suggestionsEl) {
          M.chatPanel.insertBefore(M.suggestionsEl, M.composer);
        }
      } else if (M.composer.nextSibling !== M.suggestionsEl) {
        M.chatPanel.insertBefore(M.suggestionsEl, M.composer.nextSibling);
      }
    };
    M.clearApplySuggestions = function clearApplySuggestions() {
      M.applySuggestions = [];
      M.applySuggestionsLoading = false;
      M.applyListEl.replaceChildren();
      M.applySection.hidden = true;
      M.applyStatusEl.hidden = true;
      M.applyStatusEl.textContent = '';
      M.syncApplySummary();
      M.notifyLayout();
    };
    M.setApplyStatus = function setApplyStatus(msg, show) {
      if (!msg) {
        M.applyStatusEl.hidden = true;
        M.applyStatusEl.textContent = '';
        return;
      }
      M.applyStatusEl.hidden = !show;
      M.applyStatusEl.textContent = msg;
    };
    M.renderApplySuggestions = function renderApplySuggestions(list, options) {
      options = options || {};
      M.applySuggestions = (list || [])
        .filter(function (item) {
          return (
            item &&
            typeof item.label === 'string' &&
            item.label.trim() &&
            Array.isArray(item.actions) &&
            item.actions.length
          );
        })
        .slice(0, 3);
      M.applyListEl.replaceChildren();
      if (!M.applySuggestions.length || !M.Agent.isConfigured(M.provider)) {
        M.applySection.hidden = true;
        M.setApplyStatus('', false);
        M.syncApplySummary();
        M.notifyLayout();
        return;
      }
      M.applySection.hidden = false;
      M.setApplyStatus('', false);
      M.applySuggestions.forEach(function (item, index) {
        var chip = S.el('button', 'agent-apply-suggestion-chip', {
          type: 'button',
          role: 'listitem'
        });
        chip.textContent = item.label;
        chip.disabled = M.pending;
        if (options.animate !== false) {
          chip.style.animationDelay = index * 40 + 'ms';
        }
        chip.addEventListener('click', function () {
          M.onApplySuggestion(item, index);
        });
        if (
          global.ContextMenu &&
          typeof global.ContextMenu.bind === 'function'
        ) {
          ContextMenu.bind(chip, function () {
            return [
              {
                id: 'apply-suggestion',
                label: 'Appliquer',
                disabled: !!M.pending,
                action: function () {
                  M.onApplySuggestion(item, index);
                },
              },
            ];
          });
        }
        M.applyListEl.appendChild(chip);
      });
      M.syncApplySummary();
      M.notifyLayout();
    };
    M.setApplySuggestionsBusy = function setApplySuggestionsBusy(isBusy) {
      M.applyRefreshBtn.disabled = !!isBusy || M.pending;
      Array.prototype.forEach.call(
        M.applyListEl.querySelectorAll('.agent-apply-suggestion-chip'),
        function (chip) {
          chip.disabled = !!isBusy || M.pending;
        }
      );
    };
    M.refreshApplySuggestions = async function refreshApplySuggestions(options) {
      options = options || {};
      if (M.isProjectScope) {
        M.clearApplySuggestions();
        M.applySection.hidden = true;
        return;
      }
      if (!M.Agent.isConfigured(M.provider) || M.pending) return;
      if (typeof M.Agent.suggestCardImprovements !== 'function') return;
      var seq = ++M.applySuggestionsSeq;
      M.applySuggestionsLoading = true;
      M.setApplySuggestionsBusy(true);
      M.applySection.hidden = false;
      M.setApplyStatus('Analyse de la carte\u2026', true);
      M.applyListEl.replaceChildren();
      M.syncApplySummary();
      M.notifyLayout();
      try {
        var list = await M.Agent.suggestCardImprovements(M.provider, M.bridge, {
          onDebug: function (entry) {
            M.pushDebugEntry(entry);
          }
        });
        if (seq !== M.applySuggestionsSeq) return;
        M.applySuggestionsLoading = false;
        M.renderApplySuggestions(list, { animate: options.animate !== false });
        if (!list || !list.length) {
          M.applySection.hidden = true;
          M.setApplyStatus('', false);
          M.syncApplySummary();
        }
      } catch (err) {
        if (seq !== M.applySuggestionsSeq) return;
        console.error('AgentUI suggestCardImprovements failed', err);
        if (err && err.debug) M.pushDebugEntry(err.debug);
        M.applySuggestionsLoading = false;
        M.applySuggestions = [];
        M.applyListEl.replaceChildren();
        M.applySection.hidden = true;
        M.setApplyStatus('', false);
        M.syncApplySummary();
      } finally {
        if (seq === M.applySuggestionsSeq) {
          M.applySuggestionsLoading = false;
          M.setApplySuggestionsBusy(false);
          M.syncApplySummary();
        }
        M.notifyLayout();
      }
    };
    M.onApplySuggestion = async function onApplySuggestion(item, index) {
      if (M.pending || !item || !item.actions || !item.actions.length) return;
      M.muteListening();
      M.appendAnsweredOffer(item.label, 'yes');
      var result = await M.runActionsWithPanel(item.actions);
      M.appendMessage('assistant', result.summary || 'Okay, c\'est appliqu\u00e9.');
      M.appendChangeRecap(result, { ok: result.ok });
      M.appendActionResultBlocks(result);
      M.history.push({
        role: 'assistant',
        content: result.summary || result.recap || 'Okay, c\'est appliqu\u00e9.'
      });
      M.schedulePersistChatHistory();
      M.applySuggestions = M.applySuggestions.filter(function (_s, i) {
        return i !== index;
      });
      M.renderApplySuggestions(M.applySuggestions, { animate: false });
      if (!M.applySuggestions.length) {
        // Re-scan for follow-up improvements after applying.
        M.refreshApplySuggestions({ animate: true });
      }
      M.muteListening();
      M.notifyLayout();
    };
    M.markSuggestionTabTarget = function markSuggestionTabTarget(text) {
      if (!M.suggestionsEl) return;
      var target = String(text || '').trim();
      Array.prototype.forEach.call(
        M.suggestionsEl.querySelectorAll('.agent-suggestion-chip'),
        function (chip) {
          var label = String(chip.getAttribute('data-suggestion') || chip.textContent || '').trim();
          var isTarget = !!(target && label === target);
          chip.classList.toggle('is-tab-target', isTarget);
          var hint = chip.querySelector('.tp-tab-hint');
          if (isTarget && !hint) {
            chip.appendChild(S.el('kbd', 'tp-tab-hint', { text: 'Tab' }));
          } else if (!isTarget && hint) {
            hint.remove();
          }
        }
      );
    };
    M.suggestionNeedsVariableInput = function suggestionNeedsVariableInput(text) {
      return M.SUGGESTION_HOLE_RE.test(String(text || ''));
    };
    M.focusComposerInput = function focusComposerInput() {
      if (!M.input || M.input.disabled) return;
      try {
        M.input.focus({ preventScroll: true });
      } catch (e) {
        try {
          M.input.focus();
        } catch (e2) {
          /* ignore */
        }
      }
    };
    M.openAndFocusComposer = function openAndFocusComposer() {
      if (M.collapse) {
        if (!M.collapse.isEnabled()) {
          M.collapse.setEnabled(true, { expand: true });
        } else if (!M.collapse.isExpanded()) {
          M.collapse.setExpanded(true);
        }
      }
      M.scrollMessagesToBottom();
      setTimeout(function () {
        try {
          M.section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (e) {
          /* ignore */
        }
        M.scrollMessagesToBottom();
        M.focusComposerInput();
        M.notifyLayout();
      }, 0);
    };
    M.insertComposerSuggestion = function insertComposerSuggestion(text) {
      M.input.value = String(text || '');
      M.focusComposerInput();
      // Place caret at the first hole so the user can fill the variable.
      var raw = M.input.value;
      var holeMatch = M.SUGGESTION_HOLE_RE.exec(raw);
      try {
        if (holeMatch) {
          M.input.setSelectionRange(holeMatch.index, holeMatch.index + holeMatch[0].length);
        } else {
          var len = raw.length;
          M.input.setSelectionRange(len, len);
        }
      } catch (e2) {
        /* ignore */
      }
      if (M.tabComplete) M.tabComplete.refresh();
      M.notifyLayout();
    };
    M.suggestionsAllowMultiSelect = function suggestionsAllowMultiSelect(explicit) {
      // AI decides via suggestionsMulti; default is single-choice.
      return explicit === true;
    };
    M.pickSuggestionConfirmPrompt = function pickSuggestionConfirmPrompt() {
      return M.SUGGESTION_CONFIRM_PROMPTS[
        Math.floor(Math.random() * M.SUGGESTION_CONFIRM_PROMPTS.length)
      ];
    };
    M.getSelectedSuggestionTexts = function getSelectedSuggestionTexts() {
      var selected = [];
      Array.prototype.forEach.call(
        M.suggestionsEl.querySelectorAll('.agent-suggestion-chip.is-selected'),
        function (chip) {
          var label = String(
            chip.getAttribute('data-suggestion') || chip.textContent || ''
          ).trim();
          if (label) selected.push(label);
        }
      );
      return selected;
    };
    M.formatSelectedSuggestions = function formatSelectedSuggestions(labels) {
      return (labels || [])
        .map(function (label) {
          return String(label || '').trim();
        })
        .filter(Boolean)
        .join('. ');
    };
    M.syncSuggestionConfirmUi = function syncSuggestionConfirmUi() {
      var confirmEl = M.suggestionsEl.querySelector('.agent-suggestion-confirm');
      var selected = M.getSelectedSuggestionTexts();
      var composerHasText = !!(M.input.value || '').trim();
      if (!selected.length || composerHasText) {
        if (confirmEl) confirmEl.hidden = true;
        M.stopSuggestionConfirmTimer();
        M.clearSendConfirmCountdown();
        M.notifyLayout();
        return;
      }
      if (confirmEl) {
        confirmEl.hidden = false;
        var promptText =
          (confirmEl.querySelector('.agent-suggestion-confirm-prompt') || {})
            .textContent || 'C\'est tout?';
        confirmEl.setAttribute('aria-label', promptText);
      }
      if (M.suggestionConfirmDeadline) {
        var leftMs = Math.max(0, M.suggestionConfirmDeadline - Date.now());
        var leftSec = Math.max(1, Math.ceil(leftMs / 1000));
        M.sendConfirmCount.textContent = String(leftSec);
        M.sendConfirmCount.hidden = false;
        M.sendBtn.classList.add('is-confirming');
        M.sendBtn.setAttribute(
          'aria-label',
          'Envoyer' + ' (' + leftSec + ' s)'
        );
      } else {
        M.clearSendConfirmCountdown();
      }
      M.notifyLayout();
    };
    M.cancelSuggestionConfirmOnComposerInput = function cancelSuggestionConfirmOnComposerInput() {
      M.stopSuggestionConfirmTimer();
      M.syncSuggestionConfirmUi();
    };
    M.startSuggestionConfirmTimer = function startSuggestionConfirmTimer() {
      M.stopSuggestionConfirmTimer();
      M.suggestionConfirmDeadline = Date.now() + M.SUGGESTION_CONFIRM_MS;
      M.syncSuggestionConfirmUi();
      M.suggestionConfirmTimer = setInterval(function () {
        if (M.pending) {
          M.stopSuggestionConfirmTimer();
          return;
        }
        if (!M.getSelectedSuggestionTexts().length) {
          M.stopSuggestionConfirmTimer();
          M.syncSuggestionConfirmUi();
          return;
        }
        if (Date.now() >= M.suggestionConfirmDeadline) {
          M.stopSuggestionConfirmTimer();
          M.commitSelectedSuggestions();
          return;
        }
        M.syncSuggestionConfirmUi();
      }, 200);
    };
    M.commitSelectedSuggestions = function commitSelectedSuggestions() {
      if (M.pending) return;
      var labels = M.getSelectedSuggestionTexts();
      if (!labels.length) return;
      var msg = M.formatSelectedSuggestions(labels);
      M.stopSuggestionConfirmTimer();
      M.clearSendConfirmCountdown();
      M.clearSuggestions();
      M.sendUserMessage(msg);
    };
    M.toggleSuggestionChip = function toggleSuggestionChip(chip, text) {
      if (M.pending || !chip) return;
      var label = String(text || '').trim();
      if (!label) return;
      var wasSelected = chip.classList.contains('is-selected');
      chip.classList.toggle('is-selected', !wasSelected);
      chip.setAttribute('aria-pressed', wasSelected ? 'false' : 'true');
      var selected = M.getSelectedSuggestionTexts();
      if (!selected.length) {
        M.stopSuggestionConfirmTimer();
        M.syncSuggestionConfirmUi();
        return;
      }
      var promptEl = M.suggestionsEl.querySelector('.agent-suggestion-confirm-prompt');
      if (promptEl && !wasSelected) {
        promptEl.textContent = M.pickSuggestionConfirmPrompt();
      }
      M.startSuggestionConfirmTimer();
    };
    M.onSuggestionChip = function onSuggestionChip(text, chip) {
      if (M.pending) return;
      var label = String(text || '').trim();
      if (!label) return;
      if (M.suggestionNeedsVariableInput(label)) {
        M.insertComposerSuggestion(label);
        return;
      }
      if (M.suggestionsMultiSelect && chip) {
        M.toggleSuggestionChip(chip, label);
        return;
      }
      M.clearSuggestions();
      M.sendUserMessage(label);
    };
    M.suggestionIconMarkup = function suggestionIconMarkup(iconKey) {
      var key = String(iconKey || '')
        .trim()
        .toLowerCase();
      var aliases = {
        'small-circle': 'circle-xs',
        'circle-small': 'circle-xs',
        small: 'circle-xs',
        'medium-circle': 'circle-md',
        'circle-medium': 'circle-md',
        medium: 'circle-md',
        'big-circle': 'circle-lg',
        'circle-big': 'circle-lg',
        big: 'circle-lg',
        'huge-circle': 'circle-xl',
        'circle-huge': 'circle-xl',
        huge: 'circle-xl',
        'three-dots': 'dots',
        '3-dots': 'dots',
        ellipsis: 'dots',
        calm: 'calm-face',
        'face-calm': 'calm-face',
        smile: 'calm-face',
        relaxed: 'calm-face',
        '!!': 'exclaim',
        bangs: 'exclaim',
        'double-exclaim': 'exclaim',
        'exclamation-marks': 'exclaim',
        'exclamations': 'exclaim'
      };
      if (aliases[key]) key = aliases[key];
      var inner = M.SUGGESTION_ICON_SVG[key];
      if (!inner) return '';
      return (
        '<svg class="agent-suggestion-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        inner +
        '</svg>'
      );
    };
    M.normalizeSuggestionColorName = function normalizeSuggestionColorName(raw) {
      if (typeof raw !== 'string') return null;
      var key = raw.trim().toLowerCase();
      if (!key) return null;
      var mapped = M.SUGGESTION_NAMED_COLORS[key];
      if (mapped === true) return key;
      if (typeof mapped === 'string') return mapped;
      return null;
    };
    M.normalizeImpactReachKey = function normalizeImpactReachKey(text) {
      var raw = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      if (!raw) return null;
      // "0 (Personnel)", "3 — Population", "impact: Équipe"
      var numbered = raw.match(
        /^(?:impact\s*[=:]?\s*)?([0-4])\s*[\-–—:(]\s*(.+?)\s*\)?$/
      );
      if (numbered) raw = numbered[2].trim();
      raw = raw.replace(/^(portee|impact)\s*[=:]?\s*/, '').trim();
      raw = raw.replace(/^sur\s+/, '').trim();
      if (/^(personnel|moi|individuel|individual|me)$/.test(raw)) return 'personnel';
      if (/^(l['\u2019]?equipe|equipe|team|squad)$/.test(raw)) return 'equipe';
      if (/^(interne|l['\u2019]?org(anisation)?|entreprise|company)$/.test(raw)) {
        return 'interne';
      }
      if (
        /^(les?\s+)?(population|clients?|usagers?|utilisateurs?|communaute|users?)$/.test(
          raw
        )
      ) {
        return 'population';
      }
      if (/^(global|mondial|world|planet)$/.test(raw)) return 'global';
      return null;
    };
    M.urgencyChipIconFromText = function urgencyChipIconFromText(text) {
      var raw = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      if (!raw) return null;
      if (
        /pas\s+(du\s+tout\s+)?urgent|aucune?\s+(urgence|pression)|not\s+urgent|no\s+rush|zero\s+urgen/.test(
          raw
        ) ||
        /^(calme|tranquille|relaxed|aucune)$/.test(raw)
      ) {
        return 'calm-face';
      }
      if (
        /(tres|vraiment|super)\s+urgent|urgentes?\b|critique\b|asap|immediate/.test(raw) &&
        !/pas\s+|peu\s+|assez\s+|moyenne?|faible|legere?/.test(raw)
      ) {
        return 'exclaim';
      }
      return null;
    };
    M.enrichSuggestionChipItems = function enrichSuggestionChipItems(items) {
      var reachKeys = items.map(function (item) {
        return M.normalizeImpactReachKey(item.text);
      });
      var reachCount = reachKeys.filter(Boolean).length;
      var treatAsReach =
        reachCount >= 2 && reachCount >= Math.ceil(items.length * 0.6);
      // Conversational personal chip: "Impact sur Alex" among reach options.
      if (treatAsReach) {
        items.forEach(function (item, index) {
          if (reachKeys[index]) return;
          var raw = String(item.text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
          if (/^(impact\s+sur|sur)\s+\S+/.test(raw)) {
            reachKeys[index] = 'personnel';
          }
        });
      }
      return items.map(function (item, index) {
        var next = {
          text: item.text,
          heat: item.heat,
          icon: item.icon || null,
          color: item.color || null,
          hl: item.hl || null
        };
        var reachKey = reachKeys[index];
        if (treatAsReach && reachKey && M.IMPACT_REACH_CHIP[reachKey]) {
          var meta = M.IMPACT_REACH_CHIP[reachKey];
          var conversational = /^(impact\s+sur|sur)\s+/i.test(String(item.text || ''));
          // Keep "Impact sur …" phrasing and personalized names.
          var keepLabel =
            conversational ||
            (reachKey === 'personnel' &&
              item.text &&
              !/^(personnel|moi)$/i.test(String(item.text).trim()));
          next.text = keepLabel ? item.text : meta.label;
          if (!next.icon) next.icon = meta.icon;
          if (!next.color) next.color = meta.color;
          next.heat = null;
        }
        var urgencyIcon = M.urgencyChipIconFromText(next.text);
        if (urgencyIcon) next.icon = urgencyIcon;
        if (next.color) next.color = M.normalizeSuggestionColorName(next.color);
        if (next.icon && !M.suggestionIconMarkup(next.icon)) next.icon = null;
        return next;
      });
    };
    },
    run: function (M) {
    M.SUGGESTION_HOLE_RE = /(\u2026|\.{3,}|\[([^\]]*)\])/;
    M.SUGGESTION_ICON_STROKE =
      'stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    M.SUGGESTION_ICON_SVG = {
      'circle-xs':
        '<circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>',
      'circle-sm':
        '<circle cx="8" cy="8" r="3.2" ' + M.SUGGESTION_ICON_STROKE + '/>',
      'circle-md':
        '<circle cx="8" cy="8" r="4.6" ' + M.SUGGESTION_ICON_STROKE + '/>',
      'circle-lg':
        '<circle cx="8" cy="8" r="5.6" ' + M.SUGGESTION_ICON_STROKE + '/>',
      'circle-xl':
        '<circle cx="8" cy="8" r="6.4" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<circle cx="8" cy="8" r="3.2" ' + M.SUGGESTION_ICON_STROKE + '/>',
      dots:
        '<circle cx="3.5" cy="8" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="8" cy="8" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="12.5" cy="8" r="1.35" fill="currentColor" stroke="none"/>',
      hammer:
        '<path d="M6.8 7.6 L12.8 13.6" ' +
        M.SUGGESTION_ICON_STROKE +
        ' stroke-width="2"/>' +
        '<path d="M2.4 5.2 L8.2 2.8 L9.6 5.8 L3.8 8.2 Z" fill="currentColor" stroke="none"/>' +
        '<path d="M8.2 2.8 L10.4 1.8 L12 5.2 L9.6 5.8 Z" fill="currentColor" stroke="none"/>',
      'calm-face':
        '<circle cx="8" cy="8" r="5.6" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<circle cx="5.8" cy="7" r="0.85" fill="currentColor" stroke="none"/>' +
        '<circle cx="10.2" cy="7" r="0.85" fill="currentColor" stroke="none"/>' +
        '<path d="M5.6 10.1c.9 1.1 2.1 1.6 2.4 1.6s1.5-.5 2.4-1.6" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>',
      exclaim:
        '<path d="M5.2 3.2v6.2M10.8 3.2v6.2" ' +
        M.SUGGESTION_ICON_STROKE +
        ' stroke-width="1.7"/>' +
        '<circle cx="5.2" cy="12.4" r="1" fill="currentColor" stroke="none"/>' +
        '<circle cx="10.8" cy="12.4" r="1" fill="currentColor" stroke="none"/>',
      user:
        '<circle cx="8" cy="5.2" r="2.2" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M3.5 13.2c.7-2.4 2.3-3.6 4.5-3.6s3.8 1.2 4.5 3.6" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>',
      users:
        '<circle cx="6" cy="5.4" r="2" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M2.2 13c.6-2.1 1.9-3.1 3.8-3.1s3.2 1 3.8 3.1" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>' +
        '<circle cx="11" cy="5.8" r="1.7" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M9.2 13c.4-1.5 1.3-2.2 2.6-2.2 1.4 0 2.4.8 2.8 2.2" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>',
      building:
        '<path d="M3.5 13.5V4.5h9v9M6 7h1.2M8.8 7H10M6 9.5h1.2M8.8 9.5H10M6.8 13.5V11h2.4v2.5" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>',
      globe:
        '<circle cx="8" cy="8" r="5.5" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<ellipse cx="8" cy="8" rx="2.4" ry="5.5" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M2.5 8h11M3.8 5h8.4M3.8 11h8.4" ' +
        M.SUGGESTION_ICON_STROKE +
        ' stroke-width="1.2"/>',
      flame:
        '<path d="M8 13.5c2-2.5 3.5-4.5 3.5-6.5a3.5 3.5 0 1 0-7 0c0 2 1.5 4 3.5 6.5z" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>' +
        '<path d="M8 10v-1.5M6.5 8.5h3" ' + M.SUGGESTION_ICON_STROKE + '/>',
      check:
        '<path d="M3.2 8.2l3.3 3.2 6.3-7" ' + M.SUGGESTION_ICON_STROKE + '/>',
      ban:
        '<circle cx="8" cy="8" r="5.5" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M4.2 4.2l7.6 7.6" ' + M.SUGGESTION_ICON_STROKE + '/>',
      clock:
        '<circle cx="8" cy="8.5" r="5" ' + M.SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M8 8.5V5.5M8 8.5l2.5 1.5" ' + M.SUGGESTION_ICON_STROKE + '/>',
      bolt:
        '<path d="M9.2 2.5L4.5 9h3.2l-.9 4.5 5.2-7H8.8z" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>',
      layers:
        '<path d="M2.5 10.5L8 13.5l5.5-3M2.5 7.5L8 10.5l5.5-3M2.5 4.5L8 7.5l5.5-3L8 1.5z" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>',
      hourglass:
        '<path d="M4.5 2.5h7M4.5 13.5h7M5.5 3.5L8 8 5.5 12.5M10.5 3.5L8 8l2.5 4.5" ' +
        M.SUGGESTION_ICON_STROKE +
        '/>'
    };
    M.IMPACT_REACH_CHIP = {
      personnel: { icon: 'circle-xs', color: 'blue', label: 'Personnel' },
      equipe: { icon: 'circle-sm', color: 'teal', label: '\u00c9quipe' },
      interne: { icon: 'circle-md', color: 'yellow', label: 'Interne' },
      population: { icon: 'circle-lg', color: 'green', label: 'Population' },
      global: { icon: 'circle-xl', color: 'green', label: 'Global' }
    };
    M.SUGGESTION_NAMED_COLORS = {
      blue: true,
      bleu: 'blue',
      teal: true,
      cyan: 'teal',
      yellow: true,
      jaune: 'yellow',
      lime: true,
      green: true,
      vert: 'green',
      orange: true,
      red: true,
      rouge: 'red',
      gray: true,
      grey: 'gray',
      gris: 'gray'
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
