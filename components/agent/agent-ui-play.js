/**
 * agent-ui: mount() part 3 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.enqueueUserMessage = function enqueueUserMessage(text, options) {
      var opts = options || {};
      var msg = (text || '').trim();
      if (!msg) return false;
      if (opts.fromComposer) {
        M.input.value = '';
        M.refreshComposerTypingGaze();
      }
      if (opts.isSelfPrompt || opts.silentUser) {
        M.messageQueue.push({
          text: msg,
          isSelfPrompt: !!opts.isSelfPrompt,
          silent: true
        });
        S.dbgLog('agentUi', 'queue.queued', { queueLength: M.messageQueue.length, silent: true });
        return true;
      }
      // While a turn is in flight, fold extra sends into one pending bubble / request.
      var lastVisible = M.findLastVisibleQueuedEntry();
      if (lastVisible) {
        lastVisible.text = String(lastVisible.text || '').trim()
          ? String(lastVisible.text).replace(/\s+$/, '') + '\n\n' + msg
          : msg;
        M.setQueuedRowText(lastVisible.row, lastVisible.text);
        S.dbgLog('agentUi', 'queue.combined', { queueLength: M.messageQueue.length });
        M.scrollMessagesToBottom();
        M.notifyLayout();
        return true;
      }
      var row = M.appendMessage('user', msg, { note: 'En attente' });
      row.classList.add('is-queued');
      row.setAttribute('aria-label', 'Message en attente');
      M.messageQueue.push({
        text: msg,
        row: row
      });
      S.dbgLog('agentUi', 'queue.queued', { queueLength: M.messageQueue.length });
      M.scrollMessagesToBottom();
      M.notifyLayout();
      return true;
    };
    M.drainMessageQueue = function drainMessageQueue() {
      if (M.pending || !M.messageQueue.length) return;
      var next = M.messageQueue.shift();
      if (!next || !next.text) return;
      // Coalesce any leftover visible user entries into one turn (safety net).
      if (next.row && !next.silent && !next.isSelfPrompt) {
        while (
          M.messageQueue.length &&
          M.messageQueue[0] &&
          M.messageQueue[0].row &&
          !M.messageQueue[0].silent &&
          !M.messageQueue[0].isSelfPrompt
        ) {
          var extra = M.messageQueue.shift();
          next.text =
            String(next.text || '').replace(/\s+$/, '') +
            '\n\n' +
            String(extra.text || '').trim();
          if (extra.row && extra.row.parentNode) {
            extra.row.parentNode.removeChild(extra.row);
          }
        }
        M.setQueuedRowText(next.row, next.text);
      }
      S.dbgLog('agentUi', 'queue.processing', { queueLength: M.messageQueue.length });
      M.sendUserMessage(next.text, {
        queuedRow: next.row,
        isSelfPrompt: !!next.isSelfPrompt,
        silentUser: !!next.silent || !!next.isSelfPrompt
      });
    };
    M.releasePendingAndDrain = function releasePendingAndDrain() {
      M.pending = false;
      M.flushLaneHistory();
      M.updateComposerEnabled();
      M.setSuggestionsBusy(false);
      M.notifyLayout();
      M.scheduleFaceSleep();
      if (!M.messageQueue.length) {
        S.dbgLog('agentUi', 'queue.drained', { queueLength: 0 });
      }
      M.drainMessageQueue();
      // After the chat settles, Dream consolidates learnings in the background.
      // tryRunCardDream reschedules itself if another turn is still in flight.
      if (!M.interviewActive && (M.dreamDirty || M.cardMemoryNeedsDream())) {
        M.scheduleCardDream({ delay: 2500 });
      }
    };
    M.isSelfPromptHistoryText = function isSelfPromptHistoryText(text) {
      return /^\[Auto-revue\b/i.test(String(text || '').trim());
    };
    M.buildSelfPromptUserText = function buildSelfPromptUserText(focus) {
      var lines = [
        '[Auto-revue]',
        'Tu viens de terminer un cycle de travail sur cette carte. Le contexte syst\u00e8me est \u00e0 jour.',
        'Mission de ce tour\u00a0:',
        '1) Revue rapide\u00a0: incoh\u00e9rence ou oubli apr\u00e8s tes derni\u00e8res actions?',
        '2) Surtout\u00a0: trouve UNE nouvelle opportunit\u00e9 concr\u00e8te d\'aider (prochaine \u00e9tape, sous-t\u00e2che manquante, \u00e9ch\u00e9ance, coh\u00e9rence, offrande utile).',
        'Si opportunit\u00e9 utile\u00a0: message court + suggestions/followUps et/ou actions.',
        'Si rien d\'utile\u00a0: 1 phrase courte + 2\u20133 suggestions utiles; actions=[].',
        'selfPrompt:false OBLIGATOIRE (pas de boucle). Ne r\u00e9capitule pas longuement ce que tu as d\u00e9j\u00e0 fait.'
      ];
      var f = String(focus || '').trim();
      if (f) lines.push('Focus\u00a0: ' + f.slice(0, 240));
      return lines.join('\n');
    };
    M.queueSelfPromptReview = function queueSelfPromptReview(focus) {
      if (M.interviewActive) return;
      M.enqueueUserMessage(M.buildSelfPromptUserText(focus), {
        isSelfPrompt: true,
        silentUser: true
      });
    };
    M.scheduleCardDream = function scheduleCardDream(options) {
      options = options || {};
      if (M.isProjectScope) return;
      if (!M.Agent.isConfigured(M.provider) || typeof M.Agent.cardDreamTurn !== 'function') {
        return;
      }
      if (options.force) M.dreamDirty = true;
      var delay = options.delay != null ? options.delay : 4500;
      if (M.dreamDebounceTimer) {
        clearTimeout(M.dreamDebounceTimer);
        M.dreamDebounceTimer = null;
      }
      M.dreamDebounceTimer = setTimeout(function () {
        M.dreamDebounceTimer = null;
        M.tryRunCardDream();
      }, Math.max(0, delay));
    };
    M.cardDescNeedsDreamRewrite = function cardDescNeedsDreamRewrite() {
      if (M.verboseDescRewriteTried) return false;
      if (typeof M.Agent.isVerboseStructuredDesc !== 'function') return false;
      var desc =
        typeof M.bridge.getCardDesc === 'function' ? M.bridge.getCardDesc() || '' : '';
      return !!M.Agent.isVerboseStructuredDesc(desc);
    };
    M.cardMemoryNeedsDream = function cardMemoryNeedsDream() {
      if (M.cardDescNeedsDreamRewrite()) return true;
      var Mem = global.AgentMemory;
      if (!Mem || typeof Mem.cardDreamNeedsRefresh !== 'function') return false;
      var mem =
        (typeof M.bridge.getCardMemory === 'function' && M.bridge.getCardMemory()) ||
        null;
      return !!Mem.cardDreamNeedsRefresh(mem);
    };
    M.tryRunCardDream = async function tryRunCardDream() {
      if (M.isProjectScope || M.dreamInFlight) return;
      if (M.interviewActive || M.pending || M.messageQueue.length || M.activeLaneCount) {
        M.scheduleCardDream({ delay: 3500 });
        return;
      }
      if (!M.dreamDirty && !M.cardMemoryNeedsDream()) return;
      if (!M.Agent.isConfigured(M.provider) || typeof M.Agent.cardDreamTurn !== 'function') {
        return;
      }
      if (typeof M.bridge.setCardDesc !== 'function') return;

      var rewritingVerbose = M.cardDescNeedsDreamRewrite();
      M.dreamInFlight = true;
      M.dreamDirty = false;
      if (rewritingVerbose) M.verboseDescRewriteTried = true;
      var myDream = ++M.dreamGen;
      try {
        var result = await M.Agent.cardDreamTurn(M.provider, M.bridge, {
          history: M.history,
          onDebug: function (entry) {
            M.pushDebugEntry(entry);
          }
        });
        if (myDream !== M.dreamGen) return;
        if (result && result.usage) M.updateSessionStats(result.usage);

        var Mem = global.AgentMemory;
        if (
          result &&
          result.ok &&
          Mem &&
          typeof Mem.markCardDreamed === 'function' &&
          M.t &&
          // Mark dreamed on successful apply OR deliberate skip (already good / unchanged).
          (result.updated || result.skipped)
        ) {
          try {
            var current =
              (typeof M.bridge.getCardMemory === 'function' && M.bridge.getCardMemory()) ||
              Mem.emptyCardMemory();
            var updated = await Mem.markCardDreamed(M.t, current);
            if (M.onCardMemoryUpdate) M.onCardMemoryUpdate(updated);
            else {
              M.bridge.getCardMemory = function () {
                return updated;
              };
            }
          } catch (markErr) {
            console.error('AgentUI markCardDreamed failed', markErr);
          }
        }

        if (result && result.updated && result.applied) {
          M.muteListening();
          M.appendChangeRecap(result.applied, {
            ok: true
          });
          M.appendActionResultBlocks(result.applied);
          M.notifyLayout();
        }
      } catch (err) {
        console.error('AgentUI cardDream failed', err);
        // Retry later if facts still need consolidation.
        M.dreamDirty = true;
        if (rewritingVerbose) M.verboseDescRewriteTried = false;
        M.scheduleCardDream({ delay: 12000 });
      } finally {
        if (myDream === M.dreamGen) M.dreamInFlight = false;
      }
    };
    M.audioGestureOk = function audioGestureOk() {
      try {
        var ua = global.navigator && global.navigator.userActivation;
        if (ua && typeof ua.hasBeenActive === 'boolean') return ua.hasBeenActive;
      } catch (e) {
        /* ignore */
      }
      return true;
    };
    M.ensureAudioCtx = function ensureAudioCtx() {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx || !M.audioGestureOk()) return null;
      if (!M.audioCtx) M.audioCtx = new Ctx();
      if (M.audioCtx.state === 'suspended' && typeof M.audioCtx.resume === 'function') {
        var resume = M.audioCtx.resume();
        if (resume && typeof resume.catch === 'function') resume.catch(function () {});
      }
      return M.audioCtx;
    };
    M.pickOne = function pickOne(items) {
      if (!items || !items.length) return null;
      return items[Math.floor(Math.random() * items.length)];
    };
    M.randBetween = function randBetween(min, max) {
      return min + Math.random() * (max - min);
    };
    M.playToneChord = function playToneChord(tones, options) {
      options = options || {};
      try {
        var ctx = M.ensureAudioCtx();
        if (!ctx) return;
        var t0 = ctx.currentTime;
        var dest = ctx.destination;
        var freqJitter = options.freqJitter != null ? options.freqJitter : 0.04;
        var timeJitter = options.timeJitter != null ? options.timeJitter : 0.08;
        var fMul = 1 + M.randBetween(-freqJitter, freqJitter);
        var tMul = 1 + M.randBetween(-timeJitter, timeJitter);
        if (options.lowpass) {
          var filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(
            options.lowpass * (1 + M.randBetween(-0.08, 0.08)),
            t0
          );
          filter.Q.setValueAtTime(options.q != null ? options.q : 0.7, t0);
          filter.connect(ctx.destination);
          dest = filter;
        }
        tones.forEach(function (tone) {
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          var delay = (tone.delay || 0) * tMul;
          var dur = tone.dur * tMul;
          var peak = (tone.peak != null ? tone.peak : 0.05) * M.randBetween(0.88, 1.12);
          osc.type = tone.type || 'sine';
          osc.frequency.setValueAtTime(tone.freq * fMul, t0 + delay);
          gain.gain.setValueAtTime(0.0001, t0 + delay);
          gain.gain.exponentialRampToValueAtTime(
            Math.max(0.0002, peak),
            t0 + delay + (tone.attack != null ? tone.attack : 0.02)
          );
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t0 + delay);
          osc.stop(t0 + delay + dur + 0.05);
        });
      } catch (e) {
        /* ignore audio failures */
      }
    };
    M.playRandomChord = function playRandomChord(variants, options) {
      var tones = typeof variants[0] === 'function'
        ? M.pickOne(variants)()
        : M.pickOne(variants);
      M.playToneChord(tones, options);
    };
    M.playHappySound = function playHappySound() {
      M.playRandomChord([
        [
          { freq: 587.33, delay: 0, dur: 0.28, peak: 0.055 },
          { freq: 880, delay: 0.09, dur: 0.34, peak: 0.055 }
        ],
        [
          { freq: 659.25, delay: 0, dur: 0.2, peak: 0.048, type: 'triangle' },
          { freq: 783.99, delay: 0.08, dur: 0.22, peak: 0.05 },
          { freq: 1046.5, delay: 0.16, dur: 0.32, peak: 0.042 }
        ],
        [
          { freq: 523.25, delay: 0, dur: 0.16, peak: 0.045 },
          { freq: 659.25, delay: 0.06, dur: 0.18, peak: 0.048 },
          { freq: 783.99, delay: 0.12, dur: 0.2, peak: 0.05 },
          { freq: 987.77, delay: 0.2, dur: 0.28, peak: 0.04 }
        ],
        [
          { freq: 698.46, delay: 0, dur: 0.14, peak: 0.05, type: 'triangle', attack: 0.01 },
          { freq: 880, delay: 0.11, dur: 0.14, peak: 0.05, type: 'triangle', attack: 0.01 },
          { freq: 698.46, delay: 0.22, dur: 0.14, peak: 0.045, type: 'triangle', attack: 0.01 },
          { freq: 1046.5, delay: 0.34, dur: 0.3, peak: 0.052 }
        ],
        [
          { freq: 440, delay: 0, dur: 0.18, peak: 0.04, type: 'triangle' },
          { freq: 554.37, delay: 0.07, dur: 0.2, peak: 0.045 },
          { freq: 659.25, delay: 0.15, dur: 0.36, peak: 0.05 }
        ]
      ]);
    };
    M.playSadSound = function playSadSound() {
      M.playRandomChord(
        [
          [
            { freq: 392.0, delay: 0, dur: 0.55, peak: 0.032, type: 'triangle', attack: 0.06 },
            { freq: 466.16, delay: 0.08, dur: 0.6, peak: 0.024, type: 'triangle', attack: 0.08 },
            { freq: 587.33, delay: 0.18, dur: 0.7, peak: 0.018, type: 'sine', attack: 0.1 }
          ],
          [
            { freq: 349.23, delay: 0, dur: 0.65, peak: 0.03, type: 'triangle', attack: 0.08 },
            { freq: 415.3, delay: 0.12, dur: 0.72, peak: 0.022, type: 'sine', attack: 0.1 },
            { freq: 523.25, delay: 0.28, dur: 0.8, peak: 0.016, type: 'sine', attack: 0.12 }
          ],
          [
            { freq: 311.13, delay: 0, dur: 0.5, peak: 0.028, type: 'triangle', attack: 0.07 },
            { freq: 369.99, delay: 0.16, dur: 0.55, peak: 0.02, type: 'triangle', attack: 0.09 },
            { freq: 466.16, delay: 0.32, dur: 0.7, peak: 0.014, type: 'sine', attack: 0.12 }
          ],
          [
            { freq: 440, delay: 0, dur: 0.4, peak: 0.03, type: 'sine', attack: 0.05 },
            { freq: 415.3, delay: 0.2, dur: 0.55, peak: 0.024, type: 'triangle', attack: 0.08 },
            { freq: 349.23, delay: 0.4, dur: 0.75, peak: 0.018, type: 'sine', attack: 0.12 }
          ]
        ],
        { lowpass: 1100 }
      );
    };
    M.playSurprisedSound = function playSurprisedSound() {
      M.playRandomChord([
        [
          { freq: 523.25, delay: 0, dur: 0.14, peak: 0.04, attack: 0.01 },
          { freq: 784.0, delay: 0.07, dur: 0.18, peak: 0.038, attack: 0.01 },
          { freq: 1046.5, delay: 0.14, dur: 0.28, peak: 0.03, attack: 0.015 }
        ],
        [
          { freq: 659.25, delay: 0, dur: 0.1, peak: 0.045, attack: 0.008 },
          { freq: 987.77, delay: 0.05, dur: 0.12, peak: 0.04, attack: 0.008 },
          { freq: 1318.5, delay: 0.11, dur: 0.22, peak: 0.032, attack: 0.01 }
        ],
        [
          { freq: 392.0, delay: 0, dur: 0.12, peak: 0.035, type: 'triangle', attack: 0.01 },
          { freq: 587.33, delay: 0.06, dur: 0.14, peak: 0.04, attack: 0.01 },
          { freq: 880, delay: 0.13, dur: 0.16, peak: 0.038, attack: 0.01 },
          { freq: 1174.7, delay: 0.22, dur: 0.26, peak: 0.03, attack: 0.012 }
        ],
        [
          { freq: 880, delay: 0, dur: 0.08, peak: 0.05, attack: 0.005 },
          { freq: 660, delay: 0.09, dur: 0.1, peak: 0.038, attack: 0.008 },
          { freq: 1100, delay: 0.18, dur: 0.28, peak: 0.042, attack: 0.01 }
        ]
      ]);
    };
    M.playCuriousSound = function playCuriousSound() {
      M.playRandomChord(
        [
          [
            { freq: 246.94, delay: 0, dur: 1.05, peak: 0.018, type: 'triangle', attack: 0.18 },
            { freq: 369.99, delay: 0.12, dur: 1.15, peak: 0.014, type: 'triangle', attack: 0.18 },
            { freq: 493.88, delay: 0.28, dur: 1.25, peak: 0.01, type: 'triangle', attack: 0.2 }
          ],
          [
            { freq: 277.18, delay: 0, dur: 0.9, peak: 0.02, type: 'triangle', attack: 0.15 },
            { freq: 415.3, delay: 0.18, dur: 1.0, peak: 0.014, type: 'sine', attack: 0.16 },
            { freq: 554.37, delay: 0.4, dur: 1.1, peak: 0.01, type: 'triangle', attack: 0.18 }
          ],
          [
            { freq: 220, delay: 0, dur: 0.7, peak: 0.016, type: 'triangle', attack: 0.2 },
            { freq: 329.63, delay: 0.2, dur: 0.85, peak: 0.014, type: 'triangle', attack: 0.18 },
            { freq: 440, delay: 0.45, dur: 0.55, peak: 0.012, type: 'sine', attack: 0.1 },
            { freq: 554.37, delay: 0.7, dur: 0.65, peak: 0.01, type: 'sine', attack: 0.12 }
          ],
          [
            { freq: 311.13, delay: 0, dur: 0.45, peak: 0.02, type: 'sine', attack: 0.08 },
            { freq: 466.16, delay: 0.22, dur: 0.5, peak: 0.016, type: 'triangle', attack: 0.1 },
            { freq: 622.25, delay: 0.48, dur: 0.7, peak: 0.012, type: 'sine', attack: 0.12 }
          ]
        ],
        { lowpass: 920 }
      );
    };
    M.playThinkingSound = function playThinkingSound() {
      M.playRandomChord(
        [
          [
            { freq: 196.0, delay: 0, dur: 0.85, peak: 0.016, type: 'triangle', attack: 0.2 },
            { freq: 246.94, delay: 0.25, dur: 0.9, peak: 0.014, type: 'triangle', attack: 0.18 },
            { freq: 293.66, delay: 0.55, dur: 0.75, peak: 0.011, type: 'sine', attack: 0.16 }
          ],
          [
            { freq: 233.08, delay: 0, dur: 0.6, peak: 0.018, type: 'sine', attack: 0.12 },
            { freq: 277.18, delay: 0.28, dur: 0.55, peak: 0.014, type: 'triangle', attack: 0.1 },
            { freq: 233.08, delay: 0.55, dur: 0.7, peak: 0.012, type: 'sine', attack: 0.14 }
          ],
          [
            { freq: 174.61, delay: 0, dur: 1.1, peak: 0.015, type: 'triangle', attack: 0.22 },
            { freq: 261.63, delay: 0.35, dur: 1.0, peak: 0.012, type: 'triangle', attack: 0.2 }
          ]
        ],
        { lowpass: 780 }
      );
    };
    M.playNeutralSound = function playNeutralSound() {
      M.playRandomChord([
        [
          { freq: 523.25, delay: 0, dur: 0.32, peak: 0.036, type: 'sine', attack: 0.04 },
          { freq: 659.25, delay: 0.1, dur: 0.36, peak: 0.028, type: 'sine', attack: 0.05 }
        ],
        [
          { freq: 493.88, delay: 0, dur: 0.28, peak: 0.034, type: 'triangle', attack: 0.05 },
          { freq: 587.33, delay: 0.12, dur: 0.34, peak: 0.026, type: 'sine', attack: 0.05 }
        ],
        [
          { freq: 440, delay: 0, dur: 0.4, peak: 0.03, type: 'sine', attack: 0.06 },
          { freq: 554.37, delay: 0.14, dur: 0.42, peak: 0.024, type: 'triangle', attack: 0.06 }
        ],
        [{ freq: 587.33, delay: 0, dur: 0.45, peak: 0.032, type: 'sine', attack: 0.05 }]
      ]);
    };
    M.playTongueSound = function playTongueSound() {
      M.playRandomChord([
        [
          { freq: 720, delay: 0, dur: 0.1, peak: 0.045, type: 'triangle', attack: 0.008 },
          { freq: 540, delay: 0.09, dur: 0.12, peak: 0.04, type: 'triangle', attack: 0.01 },
          { freq: 860, delay: 0.2, dur: 0.22, peak: 0.048, type: 'sine', attack: 0.01 }
        ],
        [
          { freq: 640, delay: 0, dur: 0.08, peak: 0.05, attack: 0.005 },
          { freq: 800, delay: 0.07, dur: 0.08, peak: 0.045, attack: 0.005 },
          { freq: 640, delay: 0.14, dur: 0.08, peak: 0.04, attack: 0.005 },
          { freq: 960, delay: 0.24, dur: 0.2, peak: 0.042, attack: 0.01 }
        ],
        [
          { freq: 500, delay: 0, dur: 0.15, peak: 0.04, type: 'triangle' },
          { freq: 750, delay: 0.1, dur: 0.12, peak: 0.045, type: 'triangle' },
          { freq: 1000, delay: 0.2, dur: 0.12, peak: 0.035, type: 'sine' },
          { freq: 750, delay: 0.3, dur: 0.18, peak: 0.04, type: 'triangle' }
        ]
      ]);
    };
    M.playExcitedSound = function playExcitedSound() {
      M.playRandomChord([
        [
          { freq: 523.25, delay: 0, dur: 0.12, peak: 0.045, attack: 0.01 },
          { freq: 659.25, delay: 0.1, dur: 0.12, peak: 0.048, attack: 0.01 },
          { freq: 783.99, delay: 0.2, dur: 0.12, peak: 0.05, attack: 0.01 },
          { freq: 1046.5, delay: 0.3, dur: 0.28, peak: 0.05, attack: 0.012 },
          { freq: 783.99, delay: 0.48, dur: 0.18, peak: 0.035, attack: 0.01 }
        ],
        [
          { freq: 587.33, delay: 0, dur: 0.1, peak: 0.048, type: 'triangle', attack: 0.008 },
          { freq: 740, delay: 0.09, dur: 0.1, peak: 0.05, type: 'triangle', attack: 0.008 },
          { freq: 880, delay: 0.18, dur: 0.1, peak: 0.05, type: 'triangle', attack: 0.008 },
          { freq: 1175, delay: 0.28, dur: 0.24, peak: 0.048, attack: 0.01 }
        ],
        [
          { freq: 440, delay: 0, dur: 0.1, peak: 0.04, attack: 0.01 },
          { freq: 554.37, delay: 0.08, dur: 0.1, peak: 0.045, attack: 0.01 },
          { freq: 659.25, delay: 0.16, dur: 0.1, peak: 0.05, attack: 0.01 },
          { freq: 880, delay: 0.24, dur: 0.1, peak: 0.048, attack: 0.01 },
          { freq: 1108.7, delay: 0.34, dur: 0.26, peak: 0.045, attack: 0.012 }
        ]
      ]);
    };
    M.playWinkSound = function playWinkSound() {
      M.playRandomChord([
        [
          { freq: 698.46, delay: 0, dur: 0.12, peak: 0.04, attack: 0.01 },
          { freq: 880, delay: 0.14, dur: 0.28, peak: 0.036, type: 'triangle', attack: 0.04 }
        ],
        [
          { freq: 783.99, delay: 0, dur: 0.18, peak: 0.042, type: 'sine', attack: 0.02 },
          { freq: 987.77, delay: 0.16, dur: 0.22, peak: 0.03, type: 'triangle', attack: 0.03 }
        ],
        [
          { freq: 659.25, delay: 0, dur: 0.1, peak: 0.038, attack: 0.008 },
          { freq: 523.25, delay: 0.1, dur: 0.12, peak: 0.03, attack: 0.01 },
          { freq: 880, delay: 0.22, dur: 0.26, peak: 0.04, attack: 0.015 }
        ]
      ]);
    };
    M.playEmotionSound = function playEmotionSound(emotion) {
      var mood = emotion || 'happy';
      if (mood === 'sad') M.playSadSound();
      else if (mood === 'surprised' || mood === 'wideEyed') M.playSurprisedSound();
      else if (
        mood === 'curious' ||
        mood === 'lookUp' ||
        mood === 'lookDown' ||
        mood === 'lookLeft' ||
        mood === 'lookRight'
      ) {
        M.playCuriousSound();
      } else if (mood === 'thinking') M.playThinkingSound();
      else if (mood === 'neutral') M.playNeutralSound();
      else if (mood === 'tongue') M.playTongueSound();
      else if (mood === 'excited') M.playExcitedSound();
      else if (mood === 'wink') M.playWinkSound();
      else if (mood === 'happy') M.playHappySound();
      else M.playHappySound();
    };
    M.playSuggestionSound = function playSuggestionSound() {
      M.playRandomChord(
        [
          function () {
            return [
              { freq: 246.94, delay: 0, dur: 1.05, peak: 0.018, type: 'triangle', attack: 0.18 },
              { freq: 369.99, delay: 0.12, dur: 1.15, peak: 0.014, type: 'triangle', attack: 0.18 },
              { freq: 493.88, delay: 0.28, dur: 1.25, peak: 0.01, type: 'triangle', attack: 0.2 }
            ];
          },
          function () {
            return [
              { freq: 261.63, delay: 0, dur: 0.8, peak: 0.02, type: 'triangle', attack: 0.14 },
              { freq: 392.0, delay: 0.15, dur: 0.9, peak: 0.015, type: 'sine', attack: 0.14 },
              { freq: 523.25, delay: 0.35, dur: 0.85, peak: 0.012, type: 'triangle', attack: 0.16 }
            ];
          },
          function () {
            return [
              { freq: 329.63, delay: 0, dur: 0.55, peak: 0.02, type: 'sine', attack: 0.1 },
              { freq: 493.88, delay: 0.2, dur: 0.65, peak: 0.016, type: 'triangle', attack: 0.12 },
              { freq: 659.25, delay: 0.42, dur: 0.7, peak: 0.012, type: 'sine', attack: 0.12 }
            ];
          }
        ],
        { lowpass: 960 }
      );
    };
    M.playSwooshSound = function playSwooshSound() {
      try {
        var ctx = M.ensureAudioCtx();
        if (!ctx) return;
        var t0 = ctx.currentTime;
        var dur = 0.45 * M.randBetween(0.92, 1.08);
        var peak = 0.052 * M.randBetween(0.9, 1.12);

        if (typeof ctx.createBuffer === 'function') {
          var buffer = ctx.createBuffer(
            1,
            Math.max(1, Math.floor(ctx.sampleRate * dur)),
            ctx.sampleRate
          );
          var data = buffer.getChannelData(0);
          for (var i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.4);
          }
          var src = ctx.createBufferSource();
          src.buffer = buffer;
          var bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.setValueAtTime(0.85, t0);
          bp.frequency.setValueAtTime(2600 * M.randBetween(0.9, 1.1), t0);
          bp.frequency.exponentialRampToValueAtTime(
            220 * M.randBetween(0.85, 1.1),
            t0 + dur
          );
          var ng = ctx.createGain();
          ng.gain.setValueAtTime(0.0001, t0);
          ng.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.02);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(ctx.destination);
          src.start(t0);
          src.stop(t0 + dur + 0.03);
        }

        var osc = ctx.createOscillator();
        var og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(920 * M.randBetween(0.92, 1.08), t0);
        osc.frequency.exponentialRampToValueAtTime(
          160 * M.randBetween(0.9, 1.1),
          t0 + dur * 0.92
        );
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(0.028 * M.randBetween(0.9, 1.1), t0 + 0.012);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.95);
        osc.connect(og);
        og.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.04);
      } catch (e) {
        /* ignore audio failures */
      }
    };
    M.playBarfSound = function playBarfSound() {
      try {
        var ctx = M.ensureAudioCtx();
        if (!ctx) return;
        var t0 = ctx.currentTime;
        var dur = 0.85;

        if (typeof ctx.createBuffer === 'function') {
          var buffer = ctx.createBuffer(
            1,
            Math.max(1, Math.floor(ctx.sampleRate * dur)),
            ctx.sampleRate
          );
          var data = buffer.getChannelData(0);
          for (var i = 0; i < data.length; i++) {
            var env = Math.pow(1 - i / data.length, 0.55);
            data[i] = (Math.random() * 2 - 1) * env;
          }
          var src = ctx.createBufferSource();
          src.buffer = buffer;
          var lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.Q.setValueAtTime(0.7, t0);
          lp.frequency.setValueAtTime(900, t0);
          lp.frequency.exponentialRampToValueAtTime(140, t0 + dur);
          var ng = ctx.createGain();
          ng.gain.setValueAtTime(0.0001, t0);
          ng.gain.exponentialRampToValueAtTime(0.085, t0 + 0.04);
          ng.gain.exponentialRampToValueAtTime(0.04, t0 + 0.28);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          src.connect(lp);
          lp.connect(ng);
          ng.connect(ctx.destination);
          src.start(t0);
          src.stop(t0 + dur + 0.04);
        }

        var osc = ctx.createOscillator();
        var og = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, t0);
        osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.55);
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(0.03, t0 + 0.03);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
        osc.connect(og);
        og.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.75);
      } catch (e) {
        /* ignore audio failures */
      }
    };
    M.isAssistantExpanded = function isAssistantExpanded() {
      return !!(M.collapse && typeof M.collapse.isExpanded === 'function' && M.collapse.isExpanded());
    };
    M.announceAssistantArrival = function announceAssistantArrival(options) {
      options = options || {};
      if (!M.settleReady) return;
      if (options.sound !== false) {
        if (options.soundKind === 'suggestion') M.playSuggestionSound();
        else M.playEmotionSound(options.emotion || 'happy');
      }
      if (options.unread === false) return;
      if (!M.isAssistantExpanded()) {
        M.unreadAssistant += 1;
        M.syncApplySummary();
      }
    };
    M.lastUserMessageText = function lastUserMessageText() {
      for (var i = M.history.length - 1; i >= 0; i--) {
        if (M.history[i] && M.history[i].role === 'user') {
          return String(M.history[i].content || '');
        }
      }
      return '';
    };
    M.isMeanUserText = function isMeanUserText(text) {
      var t = String(text || '').toLowerCase();
      if (!t) return false;
      return /\b(idiot|stupide|nuls?|merde|connards?|connasses?|cons?\b|abruti|d[eé]bile|inutile|ferme[- ]?la|tais[- ]?toi|shut\s?up|fuck|hate|d[eé]teste|nique|fdp|nul\s+à\s+chier)\b/i.test(
        t
      );
    };
    M.paletteForAura = function paletteForAura(aura) {
      if (global.UserProfile && typeof global.UserProfile.agentColorPalette === 'function') {
        return global.UserProfile.agentColorPalette(aura);
      }
      var tone = M.normalizeFaceAura(aura) || 'orange';
      if (tone.charAt(0) === '#') {
        return M.FACE_AURAS.orange;
      }
      return M.FACE_AURAS[tone] || M.FACE_AURAS.orange;
    };
    M.auraToken = function auraToken(tone) {
      var t = String(tone || '');
      return t.charAt(0) === '#' ? 'custom' : t || 'orange';
    };
    M.applyAuraCssVars = function applyAuraCssVars(el, tone, palette) {
      if (!el) return;
      var token = M.auraToken(tone);
      el.setAttribute('data-aura', token);
      if (token === 'custom' && palette) {
        el.style.setProperty('--agent-face-hi', palette.hi);
        el.style.setProperty('--agent-face-mid', palette.mid);
        el.style.setProperty('--agent-face-lo', palette.lo);
        el.style.setProperty('--agent-face-glow', palette.glow || palette.lo);
        el.style.setProperty('--agent-hl-accent', palette.mid);
      } else {
        el.style.removeProperty('--agent-face-hi');
        el.style.removeProperty('--agent-face-mid');
        el.style.removeProperty('--agent-face-lo');
        el.style.removeProperty('--agent-face-glow');
        el.style.removeProperty('--agent-hl-accent');
      }
    };
    M.normalizeFaceAura = function normalizeFaceAura(value) {
      var raw = String(value || '')
        .trim()
        .toLowerCase();
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentColor === 'function') {
        var fromProfile = global.UserProfile.normalizeAgentColor(raw);
        if (fromProfile) return fromProfile;
      }
      if (M.FACE_AURAS[raw]) return raw;
      if (raw === 'jaune' || raw === 'gold' || raw === 'amber' || raw === 'dore') return 'yellow';
      if (raw === 'peach' || raw === 'warm') return 'orange';
      if (raw === 'vert' || raw === 'lime') return 'green';
      if (raw === 'violet' || raw === 'lavender') return 'purple';
      if (raw === 'bleu') return 'blue';
      if (raw === 'rose') return 'pink';
      if (raw === 'rouge') return 'red';
      if (raw === 'turquoise' || raw === 'cyan' || raw === 'mint') return 'teal';
      if (raw === 'ciel') return 'sky';
      if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) return raw;
      return null;
    };
    M.identityAura = function identityAura() {
      return M.normalizeFaceAura(M.agentIdentity.agentColor) || 'orange';
    };
    M.normalizeAgentFace = function normalizeAgentFace(value) {
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentFace === 'function') {
        return global.UserProfile.normalizeAgentFace(value) || 'classic';
      }
      var raw = String(value || '')
        .trim()
        .toLowerCase();
      var keys =
        (global.UserProfile && global.UserProfile.AGENT_FACE_KEYS) || [
          'classic',
          'soft',
          'bold',
          'sly',
          'calm',
          'spark'
        ];
      return keys.indexOf(raw) !== -1 ? raw : 'classic';
    };
    M.identityFace = function identityFace() {
      return M.normalizeAgentFace(M.agentIdentity.agentFace);
    };
    M.setEllipseAttrs = function setEllipseAttrs(node, attrs) {
      if (!node || !attrs) return;
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, String(attrs[key]));
      });
    };
    M.applyFaceStyle = function applyFaceStyle(face, styleKey) {
      if (!face) return;
      var style = M.normalizeAgentFace(styleKey);
      var feats = M.FACE_STYLE_FEATURES[style] || M.FACE_STYLE_FEATURES.classic;
      face.setAttribute('data-face', style);

      var head = feats.head || { rx: 19.2, ry: 19.2 };
      M.setEllipseAttrs(face.querySelector('.agent-face-bg'), head);
      M.setEllipseAttrs(face.querySelector('.agent-face-ring'), head);

      var features = face.querySelector('.agent-face-features');
      if (features) {
        if (feats.featuresTransform) {
          features.setAttribute('transform', feats.featuresTransform);
        } else {
          features.removeAttribute('transform');
        }
      }

      M.setEllipseAttrs(face.querySelector('.agent-face-eye--l'), feats.eyeL);
      M.setEllipseAttrs(face.querySelector('.agent-face-eye--r'), feats.eyeR);
      M.setEllipseAttrs(face.querySelector('.agent-face-shine--l'), feats.shineL);
      M.setEllipseAttrs(face.querySelector('.agent-face-shine--r'), feats.shineR);
      M.setEllipseAttrs(face.querySelector('.agent-face-cheek--l'), feats.cheekL);
      M.setEllipseAttrs(face.querySelector('.agent-face-cheek--r'), feats.cheekR);

      var eyeFill = feats.eyeFill || '#2a211c';
      var eyeL = face.querySelector('.agent-face-eye--l');
      var eyeR = face.querySelector('.agent-face-eye--r');
      if (eyeL) eyeL.setAttribute('fill', eyeFill);
      if (eyeR) eyeR.setAttribute('fill', eyeFill);

      var cheekFill = feats.cheekFill || '#f07a7a';
      var cheekL = face.querySelector('.agent-face-cheek--l');
      var cheekR = face.querySelector('.agent-face-cheek--r');
      if (cheekL) cheekL.setAttribute('fill', cheekFill);
      if (cheekR) cheekR.setAttribute('fill', cheekFill);

      var browStroke = feats.browStroke || '#6b3f2a';
      var browL = face.querySelector('.agent-face-brow--l');
      var browR = face.querySelector('.agent-face-brow--r');
      if (browL) {
        browL.setAttribute('d', feats.browL);
        browL.setAttribute('stroke-width', feats.browWidth);
        browL.setAttribute('stroke', browStroke);
      }
      if (browR) {
        browR.setAttribute('d', feats.browR);
        browR.setAttribute('stroke-width', feats.browWidth);
        browR.setAttribute('stroke', browStroke);
      }

      var mouthStroke = feats.mouthStroke || browStroke;
      var mouthWidth = feats.mouthWidth || '1.5';
      var mouths = feats.mouths || {};
      var mouthKeys = [
        'neutral',
        'happy',
        'sad',
        'curious',
        'thinking',
        'tongue',
        'wink',
        'excited'
      ];
      for (var mi = 0; mi < mouthKeys.length; mi++) {
        var mKey = mouthKeys[mi];
        var mouthNode = face.querySelector('.agent-face-mouth--' + mKey);
        if (!mouthNode) continue;
        if (mouths[mKey]) mouthNode.setAttribute('d', mouths[mKey]);
        mouthNode.setAttribute('stroke', mouthStroke);
        mouthNode.setAttribute('stroke-width', mouthWidth);
      }
      var surprised = face.querySelector('.agent-face-mouth--surprised');
      if (surprised) {
        M.setEllipseAttrs(surprised, feats.surprised || { cx: 20, cy: 25.6, rx: 2.1, ry: 2.5 });
        surprised.setAttribute('fill', mouthStroke);
      }
    };
    M.refreshAssistantFacesStyle = function refreshAssistantFacesStyle() {
      var style = M.identityFace();
      var rows = M.messagesEl.querySelectorAll('.agent-msg--assistant');
      for (var i = 0; i < rows.length; i++) {
        var face = rows[i].querySelector('.agent-face');
        if (!face) continue;
        M.applyFaceStyle(face, style);
      }
    };
    M.auraForEmotion = function auraForEmotion(emotion, explicit) {
      // Identity color is the stable face hue; mood only tweaks expression.
      // Honor an explicit color when it matches identity (model echo) — and also
      // right after set_agent_color, when identity was just updated to that hue.
      var identity = M.identityAura();
      var forced = M.normalizeFaceAura(explicit);
      if (forced && forced === identity) return forced;
      // Brief mood accents for happy faces on warm-identity agents only.
      var mood = emotion || 'neutral';
      if (
        (mood === 'happy' ||
          mood === 'excited' ||
          mood === 'tongue' ||
          mood === 'wink') &&
        (identity === 'orange' || identity === 'yellow' || identity === 'coral')
      ) {
        return 'yellow';
      }
      return identity;
    };
    M.applyFacePalette = function applyFacePalette(face, tone, palette) {
      if (!face || !palette) return;
      M.applyAuraCssVars(face, tone, palette);
      var stops = face.querySelectorAll('.agent-face-skin-stop');
      if (stops.length < 3) {
        stops = face.querySelectorAll('radialGradient stop');
      }
      if (stops.length >= 3) {
        stops[0].setAttribute('stop-color', palette.hi);
        stops[1].setAttribute('stop-color', palette.mid);
        stops[2].setAttribute('stop-color', palette.lo);
        if (!stops[0].classList.contains('agent-face-skin-stop')) {
          stops[0].classList.add('agent-face-skin-stop');
          stops[1].classList.add('agent-face-skin-stop');
          stops[2].classList.add('agent-face-skin-stop');
        }
      }
    };
    M.applyFaceAura = function applyFaceAura(face, aura) {
      if (!face) return;
      var tone = M.normalizeFaceAura(aura) || M.identityAura();
      M.applyFacePalette(face, tone, M.paletteForAura(tone));
    };
    M.refreshAssistantFacesAura = function refreshAssistantFacesAura() {
      var rows = M.messagesEl.querySelectorAll('.agent-msg--assistant');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var face = row.querySelector('.agent-face');
        if (!face || face.classList.contains('is-sick')) continue;
        var mood = face.getAttribute('data-emotion') || 'neutral';
        var aura = M.auraForEmotion(mood);
        M.applyFaceAura(face, aura);
        M.applyAuraCssVars(row, aura, M.paletteForAura(aura));
      }
    };
    M.spiceEmotion = function spiceEmotion(base) {
      var mood = base || 'neutral';
      var roll = Math.random();
      if (mood === 'happy') {
        if (roll < 0.12) return 'excited';
        if (roll < 0.18) return 'tongue';
        return 'happy';
      }
      if (mood === 'surprised') {
        if (roll < 0.35) return 'wideEyed';
        if (roll < 0.45) return 'excited';
        return 'surprised';
      }
      if (mood === 'curious') {
        if (roll < 0.2) return 'lookUp';
        return 'curious';
      }
      if (mood === 'thinking') {
        if (roll < 0.15) return 'lookUp';
        return 'thinking';
      }
      if (mood === 'neutral') {
        if (roll < 0.12) return 'lookDown';
        if (roll < 0.2) return 'lookUp';
        return 'neutral';
      }
      if (mood === 'sad') {
        if (roll < 0.2) return 'lookDown';
        return 'sad';
      }
      return mood;
    };
    M.pickFaceEnterMotion = function pickFaceEnterMotion(emotion) {
      var mood = emotion || 'neutral';
      if (mood === 'excited') {
        return M.pickOne(['roll', 'bounce', 'jump', 'jump', 'pop']);
      }
      if (mood === 'happy' || mood === 'tongue' || mood === 'wink') {
        return M.pickOne(['roll', 'bounce', 'pop', 'jump', null, null]);
      }
      if (mood === 'surprised' || mood === 'wideEyed') {
        return M.pickOne(['pop', 'bounce', 'roll', null]);
      }
      if (
        mood === 'curious' ||
        mood === 'lookUp' ||
        mood === 'lookDown' ||
        mood === 'lookLeft' ||
        mood === 'lookRight'
      ) {
        return M.pickOne(['roll', 'bounce', null, null]);
      }
      if (mood === 'thinking') {
        return M.pickOne(['roll', 'bounce', 'pop', null]);
      }
      return M.pickOne(['roll', 'pop', null, null, null]);
    };
    },
    run: function (M) {
    M.FACE_EMOTIONS = [
      'neutral',
      'happy',
      'sad',
      'surprised',
      'curious',
      'thinking',
      'tongue',
      'wideEyed',
      'lookUp',
      'lookDown',
      'lookLeft',
      'lookRight',
      'excited',
      'wink'
    ];
    M.FACE_IDLE_ELIGIBLE = {
      neutral: true,
      happy: true,
      curious: true,
      tongue: true,
      lookUp: true,
      lookDown: true,
      lookLeft: true,
      lookRight: true,
      excited: true,
      wink: true
    };
    M.FACE_AURAS = {
      orange: { hi: '#ffe0c2', mid: '#f5b58a', lo: '#e8956a', glow: '#c4794a' },
      yellow: { hi: '#fff6c8', mid: '#f5d76e', lo: '#e0b83a', glow: '#d4a017' },
      green: { hi: '#d8f5c8', mid: '#8fd86a', lo: '#5aa843', glow: '#4a8f38' },
      purple: { hi: '#e8d4ff', mid: '#b48ae0', lo: '#8a5cbf', glow: '#6f3fa8' },
      blue: { hi: '#cfe4ff', mid: '#7eb2f0', lo: '#4a86d4', glow: '#3a6fb3' },
      pink: { hi: '#ffd6e8', mid: '#f095b8', lo: '#d96a94', glow: '#c24f7c' },
      red: { hi: '#ffd0c8', mid: '#f08070', lo: '#d14a3a', glow: '#b9382a' },
      teal: { hi: '#c8f5ee', mid: '#5ecfb8', lo: '#2fa892', glow: '#1f8a78' },
      coral: { hi: '#ffd8c8', mid: '#f0a078', lo: '#e07850', glow: '#c45f38' },
      sky: { hi: '#dff4ff', mid: '#8ec8e8', lo: '#5aa8d0', glow: '#3f8ab3' }
    };
    M.FACE_STYLE_FEATURES = {
      classic: {
        head: { rx: 19.2, ry: 19.2 },
        featuresTransform: '',
        eyeFill: '#2a211c',
        browStroke: '#6b3f2a',
        cheekFill: '#f07a7a',
        mouthStroke: '#6b3f2a',
        mouthWidth: '1.5',
        eyeL: { cx: 14.2, cy: 17.6, rx: 2.35, ry: 2.7 },
        eyeR: { cx: 25.8, cy: 17.6, rx: 2.35, ry: 2.7 },
        shineL: { cx: 15, cy: 16.7, r: 0.7 },
        shineR: { cx: 26.6, cy: 16.7, r: 0.7 },
        browL: 'M11.5 14.2c1.4-.9 3.2-.9 4.6 0',
        browR: 'M23.9 14.2c1.4-.9 3.2-.9 4.6 0',
        browWidth: '1.35',
        cheekL: { cx: 11.2, cy: 22.4, rx: 2.4, ry: 1.4, opacity: '0.35' },
        cheekR: { cx: 28.8, cy: 22.4, rx: 2.4, ry: 1.4, opacity: '0.35' },
        mouths: {
          neutral: 'M15.6 25.2c1.4.9 3.2 1.3 4.4 1.3s3-.4 4.4-1.3',
          happy: 'M14.4 24.4c1.8 2.4 4.2 3.5 5.6 3.5s3.8-1.1 5.6-3.5',
          sad: 'M15.4 26.8c1.5-1.2 3.3-1.7 4.6-1.7s3.1.5 4.6 1.7',
          curious: 'M16.2 25c1.2 1.35 2.8 2 3.8 2s2.6-.65 3.8-2',
          thinking: 'M17.5 25.4c1.1.35 2.4.5 3.4.35',
          tongue: 'M14.6 24.6c1.7 2.2 3.9 3.2 5.4 3.2s3.7-1 5.4-3.2',
          wink: 'M15.8 25.2c1.2 1.1 2.8 1.6 4.2 1.5 1.2-.1 2.4-.5 3.4-1.2',
          excited: 'M14 24.2c2 2.8 4.4 4 6 4s4-1.2 6-4'
        },
        surprised: { cx: 20, cy: 25.6, rx: 2.1, ry: 2.5 }
      },
      /* Big round eyes, high soft brows, heavy blush — babyish / gentle. */
      soft: {
        head: { rx: 19.5, ry: 18.4 },
        featuresTransform: 'translate(0 -0.4)',
        eyeFill: '#3a2a24',
        browStroke: '#a07058',
        cheekFill: '#ff8aa0',
        mouthStroke: '#8a5540',
        mouthWidth: '1.35',
        eyeL: { cx: 13.6, cy: 17.2, rx: 3.35, ry: 3.55 },
        eyeR: { cx: 26.4, cy: 17.2, rx: 3.35, ry: 3.55 },
        shineL: { cx: 14.7, cy: 16.1, r: 1.15 },
        shineR: { cx: 27.5, cy: 16.1, r: 1.15 },
        browL: 'M10.2 13.2c1.8-.35 4.2-.35 6.2 0',
        browR: 'M23.6 13.2c1.8-.35 4.2-.35 6.2 0',
        browWidth: '1.05',
        cheekL: { cx: 10.2, cy: 23.2, rx: 3.6, ry: 2.2, opacity: '0.62' },
        cheekR: { cx: 29.8, cy: 23.2, rx: 3.6, ry: 2.2, opacity: '0.62' },
        mouths: {
          neutral: 'M15.2 25.6c1.6.7 3.4 1 4.8 1s3.2-.3 4.8-1',
          happy: 'M13.6 24.8c2.2 2.8 4.8 4.2 6.4 4.2s4.2-1.4 6.4-4.2',
          sad: 'M15.2 27.2c1.6-1 3.4-1.4 4.8-1.4s3.2.4 4.8 1.4',
          curious: 'M15.8 25.4c1.4 1.5 3.1 2.2 4.2 2.2s2.8-.7 4.2-2.2',
          thinking: 'M17.2 25.8c1.2.3 2.6.4 3.6.25',
          tongue: 'M13.8 25c2 2.6 4.4 3.8 6.2 3.8s4.2-1.2 6.2-3.8',
          wink: 'M15.2 25.6c1.4 1.2 3.1 1.7 4.6 1.6 1.3-.1 2.6-.55 3.8-1.3',
          excited: 'M13.2 24.6c2.4 3.2 5 4.6 6.8 4.6s4.4-1.4 6.8-4.6'
        },
        surprised: { cx: 20, cy: 26.0, rx: 2.5, ry: 2.9 }
      },
      /* Close-set intense eyes, heavy low brows, almost no blush — stern. */
      bold: {
        head: { rx: 18.6, ry: 19.6 },
        featuresTransform: 'translate(0 0.6)',
        eyeFill: '#1a120e',
        browStroke: '#2a1810',
        cheekFill: '#d06050',
        mouthStroke: '#3a2218',
        mouthWidth: '1.85',
        eyeL: { cx: 15.6, cy: 18.2, rx: 1.85, ry: 2.55 },
        eyeR: { cx: 24.4, cy: 18.2, rx: 1.85, ry: 2.55 },
        shineL: { cx: 16.15, cy: 17.35, r: 0.4 },
        shineR: { cx: 24.95, cy: 17.35, r: 0.4 },
        browL: 'M11.4 13.0c1.8-1.55 4.2-1.55 6.0 0.15',
        browR: 'M22.6 13.15c1.8-1.55 4.2-1.55 6.0 0.15',
        browWidth: '2.35',
        cheekL: { cx: 11.4, cy: 22.8, rx: 1.6, ry: 1.0, opacity: '0.12' },
        cheekR: { cx: 28.6, cy: 22.8, rx: 1.6, ry: 1.0, opacity: '0.12' },
        mouths: {
          neutral: 'M16.4 25.6c1.1.45 2.4.65 3.6.65s2.5-.2 3.6-.65',
          happy: 'M15.2 24.8c1.4 1.6 3.2 2.3 4.8 2.3s3.4-.7 4.8-2.3',
          sad: 'M15.8 26.4c1.3-.9 2.9-1.25 4.2-1.25s2.9.35 4.2 1.25',
          curious: 'M16.6 25.2c1.0 1.0 2.3 1.5 3.4 1.5s2.4-.5 3.4-1.5',
          thinking: 'M17.8 25.6c0.9.2 2.0.3 2.8.15',
          tongue: 'M15.4 24.8c1.4 1.6 3.1 2.4 4.6 2.4s3.2-.8 4.6-2.4',
          wink: 'M16.2 25.4c1.0.85 2.3 1.2 3.6 1.15 1.1-.05 2.1-.4 3.0-.95',
          excited: 'M14.8 24.4c1.8 2.2 3.8 3.1 5.2 3.1s3.4-.9 5.2-3.1'
        },
        surprised: { cx: 20, cy: 25.8, rx: 1.7, ry: 2.1 }
      },
      /* Asymmetric almond eyes, angled brows, crooked smirk — mischievous. */
      sly: {
        head: { rx: 19.0, ry: 18.8 },
        featuresTransform: 'rotate(-3 20 20)',
        eyeFill: '#241810',
        browStroke: '#4a2e1c',
        cheekFill: '#e87868',
        mouthStroke: '#5a3824',
        mouthWidth: '1.55',
        eyeL: { cx: 13.8, cy: 18.4, rx: 3.1, ry: 1.55 },
        eyeR: { cx: 26.2, cy: 16.9, rx: 2.7, ry: 2.05 },
        shineL: { cx: 14.9, cy: 17.9, r: 0.45 },
        shineR: { cx: 27.0, cy: 16.2, r: 0.65 },
        browL: 'M10.4 16.2c1.6-.15 3.6-.95 5.4-1.7',
        browR: 'M23.2 12.6c1.7.55 3.6 1.35 5.2 2.35',
        browWidth: '1.65',
        cheekL: { cx: 10.8, cy: 23.0, rx: 1.8, ry: 1.1, opacity: '0.15' },
        cheekR: { cx: 29.4, cy: 21.8, rx: 3.2, ry: 1.8, opacity: '0.5' },
        mouths: {
          neutral: 'M15.0 25.4c1.6.4 3.4.55 5.0.2 1.4-.3 2.8-.95 4.0-1.7',
          happy: 'M14.2 24.6c1.6 1.4 3.6 2.0 5.4 1.7 1.6-.25 3.2-1.1 4.6-2.2',
          sad: 'M15.2 26.6c1.4-.7 3.0-1.0 4.6-.7 1.4.25 2.8.9 4.0 1.7',
          curious: 'M15.6 24.8c1.3.9 2.9 1.3 4.2 1.1 1.2-.15 2.4-.7 3.6-1.5',
          thinking: 'M18.2 25.2c1.0.15 2.2.05 3.2-.35',
          tongue: 'M14.4 24.6c1.6 1.6 3.6 2.3 5.4 2.0 1.6-.25 3.2-1.1 4.6-2.2',
          wink: 'M15.0 25.2c1.3.7 2.9.95 4.4.7 1.3-.2 2.6-.75 3.8-1.5',
          excited: 'M13.8 24.2c1.8 2.0 4.0 2.8 6.0 2.4 1.8-.35 3.6-1.4 5.2-2.8'
        },
        surprised: { cx: 21.2, cy: 25.4, rx: 2.0, ry: 2.3 }
      },
      /* Wide-set tiny sleepy eyes, flat high brows, no blush — serene. */
      calm: {
        head: { rx: 18.2, ry: 19.8 },
        featuresTransform:
          'translate(20 20) scale(0.94) translate(-20 -20) translate(0 0.4)',
        eyeFill: '#3a342e',
        browStroke: '#8a7a6a',
        cheekFill: '#d0a090',
        mouthStroke: '#7a6a5a',
        mouthWidth: '1.15',
        eyeL: { cx: 12.4, cy: 18.6, rx: 1.55, ry: 1.35 },
        eyeR: { cx: 27.6, cy: 18.6, rx: 1.55, ry: 1.35 },
        shineL: { cx: 12.9, cy: 18.15, r: 0.35 },
        shineR: { cx: 28.1, cy: 18.15, r: 0.35 },
        browL: 'M10.0 14.6c1.5-.05 3.4-.05 4.9 0',
        browR: 'M25.1 14.6c1.5-.05 3.4-.05 4.9 0',
        browWidth: '0.95',
        cheekL: { cx: 11.0, cy: 22.8, rx: 1.4, ry: 0.8, opacity: '0.06' },
        cheekR: { cx: 29.0, cy: 22.8, rx: 1.4, ry: 0.8, opacity: '0.06' },
        mouths: {
          neutral: 'M16.8 25.6c1.0.35 2.2.5 3.2.5s2.2-.15 3.2-.5',
          happy: 'M15.8 25.0c1.3 1.2 2.9 1.7 4.2 1.7s2.9-.5 4.2-1.7',
          sad: 'M16.4 26.4c1.1-.7 2.4-.95 3.6-.95s2.5.25 3.6.95',
          curious: 'M16.6 25.2c1.0.85 2.2 1.2 3.4 1.2s2.4-.35 3.4-1.2',
          thinking: 'M18.0 25.4c0.8.15 1.8.2 2.6.1',
          tongue: 'M15.8 25.0c1.3 1.2 2.9 1.7 4.2 1.7s2.9-.5 4.2-1.7',
          wink: 'M16.4 25.4c1.0.7 2.2 1.0 3.4.95 1.0-.05 2.0-.35 2.9-.85',
          excited: 'M15.4 24.8c1.5 1.6 3.2 2.2 4.6 2.2s3.1-.6 4.6-2.2'
        },
        surprised: { cx: 20, cy: 25.8, rx: 1.5, ry: 1.8 }
      },
      /* Huge sparkly eyes, high arched brows, big smile — energetic. */
      spark: {
        head: { rx: 19.6, ry: 18.6 },
        featuresTransform: 'translate(0 -0.8)',
        eyeFill: '#1e1410',
        browStroke: '#5a3018',
        cheekFill: '#ff6a88',
        mouthStroke: '#5a3018',
        mouthWidth: '1.7',
        eyeL: { cx: 13.4, cy: 16.4, rx: 3.6, ry: 3.9 },
        eyeR: { cx: 26.6, cy: 16.4, rx: 3.6, ry: 3.9 },
        shineL: { cx: 14.7, cy: 15.0, r: 1.45 },
        shineR: { cx: 27.9, cy: 15.0, r: 1.45 },
        browL: 'M9.8 12.0c2.0-1.55 4.8-1.7 7.0-.15',
        browR: 'M23.2 11.85c2.0-1.55 4.8-1.7 7.0-.15',
        browWidth: '1.55',
        cheekL: { cx: 10.0, cy: 22.0, rx: 3.0, ry: 1.7, opacity: '0.55' },
        cheekR: { cx: 30.0, cy: 22.0, rx: 3.0, ry: 1.7, opacity: '0.55' },
        mouths: {
          neutral: 'M14.8 24.8c1.6 1.2 3.6 1.7 5.2 1.7s3.6-.5 5.2-1.7',
          happy: 'M13.0 23.6c2.4 3.4 5.2 5.0 7.0 5.0s4.6-1.6 7.0-5.0',
          sad: 'M14.8 27.0c1.7-1.4 3.7-2.0 5.2-2.0s3.5.6 5.2 2.0',
          curious: 'M15.2 24.6c1.5 1.7 3.4 2.5 4.8 2.5s3.3-.8 4.8-2.5',
          thinking: 'M16.8 25.0c1.3.45 2.8.6 4.0.4',
          tongue: 'M13.4 23.8c2.2 3.0 5.0 4.4 6.6 4.4s4.4-1.4 6.6-4.4',
          wink: 'M14.6 24.6c1.6 1.5 3.6 2.1 5.2 2.0 1.5-.1 3.0-.7 4.4-1.6',
          excited: 'M12.6 23.2c2.6 3.8 5.6 5.4 7.4 5.4s4.8-1.6 7.4-5.4'
        },
        surprised: { cx: 20, cy: 25.2, rx: 2.8, ry: 3.2 }
      }
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
