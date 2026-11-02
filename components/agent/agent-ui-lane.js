/**
 * agent-ui: mount() part 8 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.ensureProviderLoaded = async function ensureProviderLoaded() {
      if (!M.t) return;
      S.dbgLog('agentUi', 'bootstrap.provider.start', {});
      try {
        M.provider = await M.Agent.getProvider(M.t);
        M.savedProvider = M.Agent.normalizeProvider(M.provider);
        M.fillSettingsForm();
        if (global.UserProfile && typeof global.UserProfile.load === 'function') {
          try {
            var profile = await global.UserProfile.load(M.t);
            M.applyAgentIdentity(profile);
            if (profile && profile.agentStatus) {
              var fromProfile = M.normalizeStatusLevel(profile.agentStatus);
              if (fromProfile !== M.statusLevel) {
                M.statusLevel = fromProfile;
                M.statusSelect.value = M.statusLevel;
                try {
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(M.STATUS_PREF_STORAGE_KEY, M.statusLevel);
                  }
                } catch (lsErr) {
                  /* ignore */
                }
                M.syncStatusControls();
              }
            }
          } catch (profErr) {
            console.error('AgentUI load profile failed', profErr);
          }
        }
        if (M.chats) await M.bootChats();
        if (M.Agent.isConfigured(M.provider)) {
          // The Assistant page opens on a new conversation; the old ones wait in the list.
          if (!M.chats) await M.restoreChatHistory();
          if (M.isProjectScope) {
            M.interviewBootstrapped = true;
            M.markSettleReady();
            if (M.chatRestored) {
              M.refreshSuggestions({ animate: true });
            } else {
              M.refreshSuggestions({ animate: true });
            }
          } else if (!M.interviewBootstrapped) {
            await M.bootstrapCardInterview();
          } else {
            M.markSettleReady();
            if (M.chatRestored) {
              M.refreshSuggestions({ animate: true });
              M.refreshApplySuggestions({ animate: true });
            } else {
              await M.runOpenSanityThenSuggestions({ animate: true });
            }
          }
        } else {
          M.markSettleReady();
          await M.runOpenSanityThenSuggestions({
            animate: true,
            skipApplySuggestions: true
          });
        }
        var alignSettings = M.openMemoryOnSettings || (M.isProjectScope && M.needsMemoryAlign());
        if (M.preferComposer && M.Agent.isConfigured(M.provider)) alignSettings = false;
        if (alignSettings) {
          M.setSettingsOpen(true);
          M.memoryDetails.open = true;
          M.syncMemoryBadge();
          if (M.needsMemoryAlign()) {
            M.mountMemoryUi('onboarding');
          }
        } else if (M.preferComposer) {
          M.focusComposerInput();
        }
        S.dbgLog('agentUi', 'bootstrap.provider.end', {
          configured: M.Agent.isConfigured(M.provider),
          interviewBootstrapped: M.interviewBootstrapped
        });
      } catch (err) {
        S.dbgError('agentUi', 'bootstrap.provider.end', err, { ok: false });
        console.error('AgentUI load provider failed', err);
      }
    };
    M.persistProvider = async function persistProvider(next) {
      M.provider = M.Agent.normalizeProvider(next);
      if (!M.t) return M.provider;
      M.provider = await M.Agent.saveProvider(M.t, M.provider);
      M.savedProvider = M.Agent.normalizeProvider(M.provider);
      M.fillSettingsForm();
      return M.provider;
    };
    M.saveSettings = async function saveSettings() {
      var next = M.readSettingsForm();
      M.fillSettingsForm();
      if (!M.t) {
        M.setSettingsStatus('Client Trello indisponible', 'fail');
        return;
      }
      var changed = !M.Agent.providersEqual(next, M.savedProvider);
      try {
        await M.persistAgentIdentity(M.readAgentIdentityForm());
        await M.persistProvider(next);
        if (changed) {
          M.setSettingsStatus('Enregistr\u00e9 \u2014 tests en cours\u2026');
          await M.runTests({ fromSave: true });
        } else {
          M.setSettingsStatus('Enregistr\u00e9.', 'pass');
        }
        if (M.Agent.isConfigured(M.provider) && !M.history.length && !M.interviewBootstrapped) {
          await M.bootstrapCardInterview();
        }
      } catch (err) {
        console.error('AgentUI save settings failed', err);
        M.setSettingsStatus(
          (err && err.message) || 'Enregistrement impossible',
          'fail'
        );
      }
    };
    M.runTests = async function runTests(options) {
      options = options || {};
      if (M.testing) return;
      M.provider = M.readSettingsForm();
      M.fillSettingsForm();
      M.testing = true;
      M.testBtn.disabled = true;
      M.saveBtn.disabled = true;
      M.setSettingsStatus('Tests en cours\u2026');
      M.clearTestResults();
      try {
        var results = await M.Agent.runProviderTests(M.provider, function (item) {
          M.upsertTestResult(item);
        });
        var failed = results.some(function (r) {
          return r.status === 'fail';
        });
        var warned = results.some(function (r) {
          return r.status === 'warn';
        });
        if (failed) {
          M.provider = M.Agent.clearVerified(M.provider);
          if (M.t) {
            try {
              await M.persistProvider(M.provider);
            } catch (persistErr) {
              console.error('AgentUI clear verified failed', persistErr);
            }
          } else {
            M.fillSettingsForm();
          }
          M.setSettingsStatus('Des tests ont \u00e9chou\u00e9.', 'fail');
        } else {
          M.provider = M.Agent.markVerified(M.provider);
          if (M.t) {
            try {
              await M.persistProvider(M.provider);
            } catch (persistErr) {
              console.error('AgentUI mark verified failed', persistErr);
              M.fillSettingsForm();
            }
          } else {
            M.fillSettingsForm();
          }
          if (warned) {
            M.setSettingsStatus(
              options.fromSave
                ? 'Enregistr\u00e9 \u2014 fournisseur joignable avec avertissements.'
                : 'Fournisseur joignable avec avertissements.',
              'warn'
            );
          } else {
            M.setSettingsStatus(
              options.fromSave
                ? 'Enregistr\u00e9 \u2014 tous les tests sont pass\u00e9s.'
                : 'Tous les tests sont pass\u00e9s.',
              'pass'
            );
          }
          if (!M.history.length) {
            M.refreshSuggestions({ animate: true });
            M.refreshApplySuggestions({ animate: true });
          }
        }
      } catch (err) {
        M.setSettingsStatus((err && err.message) || 'Tests interrompus', 'fail');
      } finally {
        M.testing = false;
        M.testBtn.disabled = false;
        M.saveBtn.disabled = false;
        M.notifyLayout();
      }
    };
    M.flushLaneHistory = function flushLaneHistory() {
      if (M.pending || !M.laneDeferred.length) return;
      M.laneDeferred.forEach(function (pair) {
        M.history.push({ role: 'user', content: pair.user });
        M.history.push({
          role: 'assistant',
          content: pair.message,
          rawJson: pair.rawJson
        });
      });
      M.laneDeferred = [];
      M.schedulePersistChatHistory();
    };
    M.runParallelLane = async function runParallelLane(text, tier) {
      var epoch = M.laneEpoch;
      var laneNo = ++M.laneSeq;
      M.activeLaneCount += 1;
      var tag = 'Parallèle ' + laneNo;
      var userRow = M.appendMessage('user', text, { note: tag });
      var row = M.appendPendingMessage();
      row.classList.add('agent-msg--lane');
      row.setAttribute('data-lane', tag);
      var bubble = row.querySelector('.agent-msg-bubble');
      var streamed = false;
      var snapshot = M.history.slice();
      S.dbgLog('agentUi', 'lane.start', { lane: laneNo, tier: tier });
      try {
        try {
          await M.prepareTurnContext();
        } catch (prepErr) { /* keep cached context */ }
        M.markTurnPhase(row, 'send');
        var turn = await M.Agent.chatTurn(M.provider, snapshot, M.bridge, text, {
          modelTier: tier || M.sessionModelTier,
          onDelta: function (visible) {
            M.markTurnPhase(row, 'read');
            if (epoch !== M.laneEpoch || !bubble || !visible) return;
            if (!streamed) {
              streamed = true;
              row.classList.remove('is-pending');
              row.removeAttribute('aria-busy');
              row.removeAttribute('aria-label');
              M.revealPendingBubble(bubble, visible, []);
            } else {
              S.fillMessageContent(bubble, visible, [], { streaming: true });
            }
            M.scrollMessagesIfPinned(true);
            M.notifyLayout();
          }
        });
        if (turn && turn.debug) M.pushDebugEntry(turn.debug);
        if (epoch !== M.laneEpoch) return;
        if (!streamed) M.revealPendingBubble(bubble, turn.message, turn.blocks || []);
        else S.fillMessageContent(bubble, turn.message, turn.blocks || [], { streaming: false });
        M.endTurnStatus(row);
        row.classList.remove('is-pending', 'is-streaming');
        row.removeAttribute('aria-busy');
        row.removeAttribute('aria-label');
        M.finalizeAssistantRow(row, turn.message, { emotion: turn.emotion, color: turn.color });
        M.attachFeedbackControls(row);
        M.attachMessageCopyControl(row);
        M.laneDeferred.push({ user: text, message: turn.message, rawJson: turn.rawJson });
        M.flushLaneHistory();
        if (turn.usage) M.updateSessionStats(turn.usage);
        var acts = (turn.actions || []).filter(Boolean);
        if (acts.length) {
          var applied = await (M.actionChain = M.actionChain.then(
            function () {
              return M.Agent.executeActions(M.bridge, acts);
            },
            function () {
              return M.Agent.executeActions(M.bridge, acts);
            }
          ));
          if (epoch !== M.laneEpoch) return;
          M.appendChangeRecap(applied || { results: [] }, {
            droppedActions: turn.droppedActions,
            ok: applied ? applied.ok : false
          });
        }
        M.scrollMessagesToBottom();
        M.notifyLayout();
      } catch (err) {
        if (err && err.debug) M.pushDebugEntry(err.debug);
        if (epoch !== M.laneEpoch) return;
        S.dbgError('agentUi', 'lane.end', err, { lane: laneNo });
        if (row.parentNode) row.remove();
        M.appendChatError((err && err.message) || 'Erreur de l\'assistant');
      } finally {
        M.endTurnStatus(row);
        M.activeLaneCount = Math.max(0, M.activeLaneCount - 1);
        if (userRow) userRow.classList.remove('is-queued');
        M.notifyLayout();
      }
    };
    M.sendUserMessage = async function sendUserMessage(text, options) {
      var opts = options || {};
      var msg = (text || '').trim();
      if (!msg) return;
      if (global.AgentGuides && typeof AgentGuides.matchIntent === 'function') {
        var guideIntent = AgentGuides.matchIntent(msg);
        if (guideIntent) M.openGuide(guideIntent);
      }
      if (!M.Agent.isConfigured(M.provider)) {
        M.setSettingsOpen(true);
        M.setError('Configurez d\'abord un fournisseur IA.');
        return;
      }
      // Typed send (and any other commit) drops stale answer chips immediately —
      // same as tapping a suggestion. New ones arrive with the next turn.
      M.clearSuggestions();
      if (M.pending) {
        var routed =
          opts.isSelfPrompt || opts.silentUser || typeof M.Agent.routeMessage !== 'function'
            ? { route: 'queue', text: msg }
            : M.Agent.routeMessage(msg, { busy: true, activeLanes: M.activeLaneCount });
        if (routed.route === 'lane') {
          if (opts.fromComposer) {
            M.input.value = '';
            M.refreshComposerTypingGaze();
          }
          M.runParallelLane(routed.text, routed.tier);
          return;
        }
        M.enqueueUserMessage(routed.text || msg, opts);
        return;
      }
      // Ingest immediately so Enter never freezes on the composer.
      if (opts.fromComposer) {
        M.input.value = '';
        M.refreshComposerTypingGaze();
      }
      var feedbackContext = null;
      if (M.awaitingFeedback) {
        feedbackContext = M.awaitingFeedback;
        M.awaitingFeedback = null;
        M.syncComposerPlaceholder();
      }
      M.setError('');
      M.clearFollowUps();
      M.clearPrompts();
      var silentUser = !!(opts.silentUser || opts.isSelfPrompt);
      var userRow = opts.queuedRow;
      if (userRow) {
        M.activateQueuedUserRow(userRow);
      } else if (!silentUser) {
        userRow = M.appendMessage('user', msg);
      }
      M.history.push({
        role: 'user',
        content: msg,
        selfPrompt: !!opts.isSelfPrompt || M.isSelfPromptHistoryText(msg)
      });
      M.schedulePersistChatHistory();
      M.pending = true;
      M.updateComposerEnabled();
      var myGen = ++M.chatTurnGen;
      var turnKind = 'chatTurn';
      S.dbgLog('agentUi', 'turn.start', { kind: turnKind });
      var thinking = M.appendPendingMessage();
      var bubble = thinking.querySelector('.agent-msg-bubble');
      var streamed = false;
      var queuedSelfPromptFocus = null;
      try {
        var apiMsg = msg;
        if (feedbackContext) {
          await M.persistUserCorrection(msg, feedbackContext.content);
          if (myGen !== M.chatTurnGen) return;
          apiMsg = M.buildCorrectionUserPayload(msg, feedbackContext.content);
        }
        var turn;
        if (
          M.isProjectScope &&
          typeof M.bridge.refreshBoardDigest === 'function'
        ) {
            try {
              await M.bridge.refreshBoardDigest();
            } catch (digestErr) {
              /* keep cached digest */
            }
            if (myGen !== M.chatTurnGen) return;
          }
          try {
            await M.prepareTurnContext();
          } catch (prepErr) { /* keep cached context */ }
          if (myGen !== M.chatTurnGen) return;
          M.markTurnPhase(thinking, 'send');
          turn = await M.Agent.chatTurn(
            M.provider,
            M.history.slice(0, -1),
            M.bridge,
            apiMsg,
            {
              modelTier: M.sessionModelTier,
              onDelta: function (visible) {
                M.markTurnPhase(thinking, 'read');
                if (myGen !== M.chatTurnGen) return;
                if (!bubble || !visible) return;
                if (!streamed) {
                  streamed = true;
                  M.stopThinkingMotions();
                  thinking.classList.remove('is-pending');
                  thinking.removeAttribute('aria-busy');
                  thinking.removeAttribute('aria-label');
                  M.revealPendingBubble(bubble, visible, []);
                } else {
                  S.fillMessageContent(bubble, visible, [], { streaming: true });
                }
                M.scrollMessagesIfPinned(true);
                M.notifyLayout();
              }
            }
          );
        // Capture exchange even if this turn is superseded (edit/resume).
        if (turn && turn.debug) M.pushDebugEntry(turn.debug);
        if (myGen !== M.chatTurnGen) return;
        if (bubble) {
          if (!streamed) {
            M.revealPendingBubble(bubble, turn.message, turn.blocks || []);
          } else {
            S.fillMessageContent(bubble, turn.message, turn.blocks || [], {
              streaming: false
            });
          }
        }
        M.endTurnStatus(thinking);
        thinking.classList.remove('is-pending', 'is-streaming');
        thinking.removeAttribute('aria-busy');
        thinking.removeAttribute('aria-label');
        M.history.push({
          role: 'assistant',
          content: turn.message,
          rawJson: turn.rawJson,
          suggestions: turn.suggestions || [],
          suggestionsMulti: !!turn.suggestionsMulti
        });
        if (
          turn.modelTier &&
          (!M.provider.modelMode ||
            M.provider.modelMode === 'auto' ||
            (typeof M.Agent.normalizeModelMode === 'function' &&
              M.Agent.normalizeModelMode(M.provider.modelMode) === 'auto'))
        ) {
          M.sessionModelTier = turn.modelTier;
        }
        M.schedulePersistChatHistory();
        var identityTools = {
          set_agent_color: true,
          set_agent_name: true,
          set_agent_personality: true
        };
        var identityActions = [];
        var otherActions = [];
        (turn.actions || []).forEach(function (a) {
          if (a && identityTools[a.tool]) identityActions.push(a);
          else if (a) otherActions.push(a);
        });
        var identityApplied = null;
        if (identityActions.length) {
          identityApplied = await M.Agent.executeActions(M.bridge, identityActions);
          if (identityApplied && identityApplied.ok && turn.color) {
            // Keep reply color aligned with the persisted identity.
            var appliedColor = null;
            (identityApplied.results || []).forEach(function (r) {
              if (r && r.ok && r.tool === 'set_agent_color' && r.args) {
                appliedColor =
                  (typeof r.args.color === 'string' && r.args.color) || appliedColor;
              }
            });
            if (appliedColor) turn.color = appliedColor;
          }
        }
        var replyEmotion = M.finalizeAssistantRow(thinking, turn.message, {
          emotion: turn.emotion,
          color: turn.color
        });
        M.attachFeedbackControls(thinking);
        M.attachMessageCopyControl(thinking);
        M.announceAssistantArrival({ emotion: replyEmotion });
        if (M.collapse && M.collapse.refreshSummary) {
          M.collapse.refreshSummary();
        }
        // Auto-apply tools when the assistant has enough info (e.g. after a clarifying answer).
        // Executor result is source of truth — always show a technical recap.
        var applied = identityApplied;
        if (otherActions.length) {
          M.muteListening();
          var restApplied = await M.runActionsWithPanel(otherActions);
          if (!applied) {
            applied = restApplied;
          } else {
            applied = {
              ok: !!(applied.ok && restApplied.ok),
              results: (applied.results || []).concat(restApplied.results || [])
            };
          }
        }
        if (applied || (turn.actions && turn.actions.length)) {
          M.muteListening();
          M.appendChangeRecap(applied || { results: [] }, {
            droppedActions: turn.droppedActions,
            ok: applied ? applied.ok : false
          });
          M.appendActionResultBlocks(applied || { results: [] }, turn.context);
          M.setAssistantFaceEmotion(thinking, applied && applied.ok ? 'happy' : 'sad', {
            color: turn.color || (applied && applied.ok ? 'yellow' : 'orange')
          });
          if (M.interviewActive) M.interviewPriorityTrusted = true;
          M.muteListening();
          // Defer until after pending clears in finally.
          setTimeout(function () {
            if (!M.interviewActive) M.refreshApplySuggestions({ animate: true });
          }, 0);
        } else {
          var emptyClaim =
            M.Agent.looksLikeAppliedClaim &&
            M.Agent.looksLikeAppliedClaim(turn.message);
          var hasDropped =
            turn.droppedActions && turn.droppedActions.length;
          if (emptyClaim || hasDropped) {
            if (emptyClaim && !hasDropped) {
              M.setAssistantFaceEmotion(thinking, 'surprised', {
                color: turn.color || 'orange'
              });
            }
            M.appendChangeRecap(
              { results: [] },
              {
                droppedActions: turn.droppedActions || [],
                emptyClaim: emptyClaim && !hasDropped
              }
            );
          }
        }
        if (turn.cardPatches && turn.cardPatches.length) {
          await M.applyCardPatchesFromTurn(turn.cardPatches);
        }
        if (turn.patches && turn.patches.length) {
          await M.applyBoardMemoryPatches(turn.patches);
        }
        var didCardWork =
          !!(otherActions.length && applied && applied.ok) ||
          !!(turn.cardPatches && turn.cardPatches.length) ||
          !!(turn.patches && turn.patches.length);
        if (
          turn.selfPrompt &&
          didCardWork &&
          !opts.isSelfPrompt &&
          !M.interviewActive &&
          !M.isSelfPromptHistoryText(msg)
        ) {
          queuedSelfPromptFocus = turn.selfPromptFocus || '';
        }
        if (M.interviewActive && turn.message && /\?/.test(turn.message)) {
          M.interviewState = M.Agent.markInterviewQuestionAsked
            ? M.Agent.markInterviewQuestionAsked(M.interviewState, turn.message)
            : M.interviewState;
          await M.persistInterviewState(M.interviewState);
        }
        // Successful chat proves the provider works — persist verified + hide configure CTA.
        if (!M.Agent.isVerified(M.provider)) {
          try {
            await M.persistProvider(M.Agent.markVerified(M.provider));
          } catch (verifyErr) {
            console.error('AgentUI mark verified after chat failed', verifyErr);
            M.provider = M.Agent.markVerified(M.provider);
            M.fillSettingsForm();
          }
        }
        if (turn.usage) M.updateSessionStats(turn.usage);
        else M.renderChatStats();
        M.renderFollowUps(M.interviewActive ? [] : turn.followUps);
        M.renderPrompts(turn.prompts);
        if (M.interviewActive && turn.completeInterview) {
          await M.finishInterview({ announce: false });
          if (turn.suggestions && turn.suggestions.length) {
            M.suggestionsSeq += 1;
            M.renderSuggestions(turn.suggestions, {
              animate: true,
              multi: turn.suggestionsMulti,
              pinScroll: true
            });
          } else {
            M.refreshSuggestions({ animate: true });
          }
        } else if (turn.suggestions && turn.suggestions.length) {
          M.suggestionsSeq += 1;
          M.renderSuggestions(turn.suggestions, {
            animate: true,
            multi: turn.suggestionsMulti,
            pinScroll: true
          });
        } else if (!M.interviewActive) {
          M.refreshSuggestions({ animate: true });
        }
        M.scrollMessagesToBottom();
        M.notifyLayout();
        M.scrollMessagesToBottom();
        S.dbgLog('agentUi', 'turn.end', {
          ok: true,
          kind: turnKind,
          actionCount: (turn.actions || []).length,
          droppedCount: (turn.droppedActions || []).length
        });
      } catch (err) {
        if (err && err.debug) M.pushDebugEntry(err.debug);
        if (myGen !== M.chatTurnGen) return;
        S.dbgError('agentUi', 'turn.end', err, { ok: false, kind: turnKind });
        M.stopThinkingMotions();
        thinking.classList.remove('is-pending', 'is-streaming');
        var errText = (err && err.message) || 'Erreur de l\'assistant';
        if (thinking && thinking.parentNode) thinking.remove();
        M.appendChatError(errText);
        M.setError('');
        M.refreshSuggestions({ animate: true });
        M.scrollMessagesToBottom();
      } finally {
        M.endTurnStatus(thinking);
        if (myGen === M.chatTurnGen) {
          if (queuedSelfPromptFocus != null) {
            M.queueSelfPromptReview(queuedSelfPromptFocus);
          }
          M.releasePendingAndDrain();
          M.scrollMessagesToBottom();
        }
      }
    };
    M.onFollowUp = async function onFollowUp(fu) {
      if (M.pending) return;
      M.clearFollowUps();
      M.clearPrompts();
      var actions = (fu && fu.actions) || [];
      if (actions.length) {
        M.muteListening();
        M.appendAnsweredOffer(fu.label, 'yes');
        var result = await M.runActionsWithPanel(actions);
        M.appendMessage('assistant', result.summary || 'Okay, c\'est fait.');
        M.appendChangeRecap(result, { ok: result.ok });
        M.appendActionResultBlocks(result);
        M.history.push({
          role: 'assistant',
          content: result.summary || result.recap || 'Okay, c\'est fait.'
        });
        M.schedulePersistChatHistory();
        if (M.collapse && M.collapse.refreshSummary) M.collapse.refreshSummary();
        M.muteListening();
        M.refreshSuggestions({ animate: true });
        M.refreshApplySuggestions({ animate: true });
        M.notifyLayout();
        return;
      }
      M.sendUserMessage(fu.label);
    };
    M.onSend = function onSend() {
      var typed = (M.input.value || '').trim();
      var selected = M.getSelectedSuggestionTexts();
      var msg = selected.length
        ? M.formatSelectedSuggestions(typed ? selected.concat([typed]) : selected)
        : typed;
      M.stopSuggestionConfirmTimer();
      M.clearSendConfirmCountdown();
      M.sendUserMessage(msg, { fromComposer: true });
    };
    },
    run: function (M) {
    M.activeLaneCount = 0;
    M.laneSeq = 0;
    M.laneEpoch = 0;
    M.laneDeferred = [];
    M.actionChain = Promise.resolve();
    document.addEventListener('keydown', function (e) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      var codeMatch = /^Digit([1-9])$/.exec(e.code || '');
      if (!codeMatch) return;
      if (!M.section.isConnected || M.suggestionsEl.hidden || M.pending) return;
      var digit = codeMatch[1];
      var tgt = e.target;
      var inField =
        tgt &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName) || tgt.isContentEditable);
      // Shift+digit types ! @ # … — only intercept from an empty composer.
      if (inField && (tgt !== M.input || (M.input.value || '').length)) return;
      var chips = M.suggestionsEl.querySelectorAll('.agent-suggestion-chip');
      var chip = chips[Number(digit) - 1];
      if (!chip || chip.disabled) return;
      e.preventDefault();
      M.onSuggestionChip(
        String(chip.getAttribute('data-suggestion') || chip.textContent || '').trim(),
        chip
      );
    });
    M.applyRefreshBtn.addEventListener('click', function () {
      if (M.pending) return;
      M.refreshApplySuggestions({ animate: true });
    });
    M.settingsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (M.collapse && !M.collapse.isEnabled()) {
        M.collapse.setEnabled(true, { expand: true });
      } else if (M.collapse && !M.collapse.isExpanded()) {
        M.collapse.setExpanded(true);
      }
      M.setSettingsOpen(!M.settingsOpen);
    });
    M.debugBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (M.statusLevel !== 'full') return;
      M.setDebugOpen(!M.debugOpen);
    });
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.agent-tool-verify')) {
        return;
      }
      M.closeToolVerifyTips();
    });
    window.addEventListener('resize', function () {
      Array.prototype.forEach.call(
        M.messagesEl.querySelectorAll('.agent-tool-verify.is-open'),
        M.positionToolVerifyTip
      );
    });
    M.statusSelect.addEventListener('change', function () {
      M.statusLevel = M.normalizeStatusLevel(M.statusSelect.value);
      M.statusSelect.value = M.statusLevel;
      M.saveStatusLevel(M.statusLevel);
      M.syncStatusControls();
    });
    M.emptyConfigBtn.addEventListener('click', function () {
      if (M.collapse && !M.collapse.isEnabled()) {
        M.collapse.setEnabled(true, { expand: true });
      } else if (M.collapse && !M.collapse.isExpanded()) {
        M.collapse.setExpanded(true);
      }
      M.setSettingsOpen(true);
      M.openProviderFold();
    });
    M.saveBtn.addEventListener('click', function () {
      M.saveSettings();
    });
    M.testBtn.addEventListener('click', function () {
      M.runTests();
    });
    M.doneBtn.addEventListener('click', function () {
      M.setSettingsOpen(false);
    });
    M.agentNameInput.addEventListener('input', function () {
      M.syncAgentAvatarPreview();
    });
    M.rerollNameBtn.addEventListener('click', function () {
      var color = M.getAgentColorValue();
      if (global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        M.agentNameInput.value = global.UserProfile.pickAgentNameForColor(color);
      }
      M.syncAgentAvatarPreview();
      M.persistAgentIdentity(M.readAgentIdentityForm()).catch(function (err) {
        console.error('AgentUI reroll name failed', err);
      });
    });
    M.rerollPersonalityBtn.addEventListener('click', function () {
      var next =
        global.UserProfile && global.UserProfile.pickRandomAgentPersonality
          ? global.UserProfile.pickRandomAgentPersonality(M.agentPersonalityInput.value)
          : '';
      if (!next) return;
      M.agentPersonalityInput.value = next;
      M.persistAgentIdentity(M.readAgentIdentityForm()).catch(function (err) {
        console.error('AgentUI reroll personality failed', err);
      });
    });
    M.rerollColorBtn.addEventListener('click', function () {
      var nextColor =
        global.UserProfile && global.UserProfile.pickRandomAgentColor
          ? global.UserProfile.pickRandomAgentColor()
          : 'orange';
      M.setAgentColorValue(nextColor);
      if (global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        M.agentNameInput.value = global.UserProfile.pickAgentNameForColor(nextColor);
      }
      M.fillAgentFacePicker(M.agentIdentity.agentFace);
      M.syncAgentAvatarPreview();
      M.persistAgentIdentity(M.readAgentIdentityForm()).catch(function (err) {
        console.error('AgentUI reroll color failed', err);
      });
    });
    M.sendBtn.addEventListener('click', M.onSend);
    M.interviewSkipBtn.addEventListener('click', function () {
      if (M.pending || !M.interviewActive) return;
      M.finishInterview({
        message:
          'Okay, on passe. Tu pourras reprendre la config quand tu veux.'
      });
    });
    M.input.addEventListener('input', function () {
      M.refreshComposerTypingGaze();
      M.cancelSuggestionConfirmOnComposerInput();
    });
    M.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        M.onSend();
        return;
      }
      // Glance down as soon as the user starts typing (before value updates).
      if (!M.faceSm.typing && e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        M.setFaceIdleTyping(true);
      }
    });
    M.fillAgentColorSelect(M.agentIdentity.agentColor);
    M.syncAgentAvatarPreview();
    M.fillSettingsForm();
    M.ensureProviderLoaded();
    M.updateComposerEnabled();
    M.syncStatusControls();
    M.notifyLayout();
    S.dbgLog('agentUi', 'mount.ready', { scope: M.assistantScope });
    if (M.shouldFocusComposer) {
      M.openAndFocusComposer();
    }
    return { v: {
      el: M.section,
      scope: M.assistantScope,
      refreshProvider: M.ensureProviderLoaded,
      collapse: M.collapse,
      focusComposer: M.openAndFocusComposer,
      scrollMessagesToBottom: M.scrollMessagesToBottom,
      chats: M.chats,
      openSettings: function (opts) {
        M.setSettingsOpen(true);
        if (opts && opts.memory) {
          M.memoryDetails.open = true;
          M.syncMemoryBadge();
          if (opts.mountMemory) {
            M.mountMemoryUi(opts.mountMemory === 'onboarding' ? 'onboarding' : 'ongoing');
          }
        }
      }
    } };
    }
  });
})(typeof window !== 'undefined' ? window : this);
