/**
 * agent-ui: mount() part 5 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.clearAgentPointGlove = function clearAgentPointGlove() {
      if (M.pointAtState.gloveEl && M.pointAtState.gloveEl.parentNode) {
        M.pointAtState.gloveEl.parentNode.removeChild(M.pointAtState.gloveEl);
      }
      M.pointAtState.gloveEl = null;
      Array.prototype.forEach.call(
        document.querySelectorAll('.agent-point-glove'),
        function (node) {
          if (node && node.parentNode) node.parentNode.removeChild(node);
        }
      );
    };
    M.clearAgentPointing = function clearAgentPointing() {
      M.pointAtState.seq += 1;
      if (M.pointAtState.clearTimer != null) {
        clearTimeout(M.pointAtState.clearTimer);
        M.pointAtState.clearTimer = null;
      }
      if (M.pointAtState.faceTimer != null) {
        clearTimeout(M.pointAtState.faceTimer);
        M.pointAtState.faceTimer = null;
      }
      M.clearAgentPointGlove();
      M.clearAgentPointTarget();
      Array.prototype.forEach.call(
        document.querySelectorAll('.agent-face.is-pointing'),
        function (face) {
          face.classList.remove('is-pointing');
          face.style.removeProperty('--agent-point-angle');
        }
      );
    };
    M.sectionSelector = function sectionSelector(section) {
      if (section === 'priority') return '.variant-priority-section';
      if (section === 'due') return '.variant-due-section';
      if (section === 'blocked') {
        return '.statut-blocked-panel, .variant-blocked-section';
      }
      if (section === 'progress') return '.variant-progress-section';
      if (section === 'statut') {
        return '.statut-in-progress-mount, .field--statut-embedded, .variant-progress-section';
      }
      if (section === 'objectif') {
        return '.variant-objectif-section, .info-row--objectif';
      }
      if (section === 'info') return '.variant-info-section, .info-section-body';
      return null;
    };
    M.defaultResolvePointTarget = function defaultResolvePointTarget(args) {
      args = args || {};
      var section =
        typeof M.Agent.normalizePointSection === 'function'
          ? M.Agent.normalizePointSection(args.section)
          : args.section || null;
      var field =
        typeof M.Agent.normalizePointField === 'function'
          ? M.Agent.normalizePointField(args.field)
          : args.field || null;
      var level =
        typeof M.Agent.normalizePointLevel === 'function'
          ? M.Agent.normalizePointLevel(args.level)
          : args.level != null
            ? Number(args.level)
            : null;
      if (field && !section) section = 'priority';

      if (typeof M.bridge.openSection === 'function' && section) {
        try {
          M.bridge.openSection(section, { expand: true });
        } catch (e) {
          /* ignore */
        }
      }

      var root = M.cardEl || document;
      var target = null;

      if (field) {
        target =
          root.querySelector('[data-field-id$="-' + field + '"]') ||
          root.querySelector('[data-field-id="' + field + '"]');
      }
      if (!target && section) {
        var sel = M.sectionSelector(section);
        if (sel) target = root.querySelector(sel);
      }
      return {
        ok: !!target,
        el: target,
        section: section || null,
        field: field || null,
        level: level != null && isFinite(level) ? level : null,
        error: target ? null : 'Cible introuvable'
      };
    };
    M.leanFaceToward = function leanFaceToward(targetEl) {
      var face = M.faceSmFace() || M.getLiveAssistantFace();
      if (!face || !targetEl) return null;
      var row = face.closest('.agent-msg--assistant');
      if (!row) return null;

      var faceRect = face.getBoundingClientRect();
      var targetRect = targetEl.getBoundingClientRect();
      var fx = faceRect.left + faceRect.width / 2;
      var fy = faceRect.top + faceRect.height / 2;
      var tx = targetRect.left + targetRect.width / 2;
      var ty = targetRect.top + Math.min(targetRect.height * 0.35, 28);
      var dx = tx - fx;
      var dy = ty - fy;
      var emotion;
      if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
        emotion = dy < 0 ? 'lookUp' : 'lookDown';
      } else {
        emotion = dx < 0 ? 'lookLeft' : 'lookRight';
      }
      var angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      M.suppressFaceIdleMachine();
      M.faceSm.row = row;
      M.setAssistantFaceEmotion(row, emotion, {
        animate: true,
        forceEnter: true,
        fromIdleMachine: true,
        idleHandOff: false
      });
      face.classList.add('is-pointing');
      face.style.setProperty('--agent-point-angle', angleDeg.toFixed(1) + 'deg');
      return { face: face, row: row, emotion: emotion, dx: dx, dy: dy };
    };
    M.placePointGlove = function placePointGlove(face, targetEl) {
      M.clearAgentPointGlove();
      if (!face || !targetEl) return null;
      var faceRect = face.getBoundingClientRect();
      var targetRect = targetEl.getBoundingClientRect();
      var fx = faceRect.left + faceRect.width / 2;
      var fy = faceRect.top + faceRect.height / 2;
      var tipX = targetRect.left + targetRect.width * 0.72;
      var tipY = targetRect.top + Math.min(18, targetRect.height * 0.25);
      // Finger tip sits near the target; wrist trails back toward the face.
      var dx = tipX - fx;
      var dy = tipY - fy;
      var angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      // Glove art points roughly up-right; rotate so index tip faces the target.
      var rotate = angle + 55;

      var glove = document.createElement('div');
      glove.className = 'agent-point-glove';
      glove.setAttribute('aria-hidden', 'true');
      glove.innerHTML =
        '<svg class="agent-point-glove-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56" focusable="false">' +
        '<defs>' +
        '<linearGradient id="agentGloveShine" x1="20%" y1="5%" x2="80%" y2="95%">' +
        '<stop offset="0%" stop-color="#ffffff"/>' +
        '<stop offset="55%" stop-color="#f3f3f3"/>' +
        '<stop offset="100%" stop-color="#dedede"/>' +
        '</linearGradient>' +
        '</defs>' +
        '<path fill="url(#agentGloveShine)" stroke="#c8c8c8" stroke-width="1.5" stroke-linejoin="round" ' +
        'd="M38.2 28.5V11.6c0-3.8 2.7-6.6 6.1-6.6 3.3 0 5.9 2.7 5.9 6.4V29.2c1.1-2.9 3.4-4.2 5.8-3.5 2.6.7 4 3.1 3.4 6.1l-5.8 22.2C51.8 59.2 45.4 63 37.8 63c-7.8 0-14.2-3.6-16.6-11.2L16.4 36c-1.5-4.6 1.1-9.4 5.8-10.6 3.2-.8 6.4.4 8.4 2.8V17.8c0-3.5 2.5-6 5.6-6 3 0 5.4 2.5 5.4 5.8v11z"/>' +
        '<path fill="none" stroke="#d5d5d5" stroke-width="1.2" stroke-linecap="round" d="M24.5 44c3.5 1.6 7.6 2 11.4.7"/>' +
        '<circle cx="50.2" cy="7.2" r="1.6" fill="#fff" stroke="#d0d0d0" stroke-width="0.8"/>' +
        '</svg>';

      var size = 56;
      // Anchor near fingertip (upper-right of the glove art).
      var left = tipX - size * 0.72;
      var top = tipY - size * 0.18;
      glove.style.left = Math.round(left) + 'px';
      glove.style.top = Math.round(top) + 'px';
      glove.style.setProperty('--agent-glove-rotate', rotate.toFixed(1) + 'deg');

      (document.body || document.documentElement).appendChild(glove);
      M.pointAtState.gloveEl = glove;
      void glove.offsetWidth;
      glove.classList.add('is-visible');
      return glove;
    };
    M.blinkPointTarget = function blinkPointTarget(targetEl) {
      if (!targetEl) return;
      M.clearAgentPointTarget();
      targetEl.classList.remove('is-agent-point-target');
      void targetEl.offsetWidth;
      targetEl.classList.add('is-agent-point-target');
      M.pointAtState.targetEl = targetEl;
    };
    M.pointAtOnPage = function pointAtOnPage(args) {
      M.clearAgentPointing();
      var seq = M.pointAtState.seq;
      args = args && typeof args === 'object' ? args : {};

      if (
        M.collapse &&
        typeof M.collapse.setExpanded === 'function' &&
        typeof M.collapse.isExpanded === 'function' &&
        !M.collapse.isExpanded()
      ) {
        try {
          M.collapse.setExpanded(true);
        } catch (e) {
          /* ignore */
        }
      }

      var resolved;
      if (typeof M.bridge.resolvePointTarget === 'function') {
        try {
          resolved = M.bridge.resolvePointTarget(args);
        } catch (e) {
          resolved = null;
        }
      }
      if (!resolved || !resolved.el) {
        resolved = M.defaultResolvePointTarget(args);
      }
      if (!resolved || !resolved.el) {
        return {
          ok: false,
          error: (resolved && resolved.error) || 'Cible introuvable'
        };
      }

      var targetEl = resolved.el;
      try {
        targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (scrollErr) {
        try {
          targetEl.scrollIntoView(true);
        } catch (e2) {
          /* ignore */
        }
      }
      try {
        M.onLayoutChange();
      } catch (layoutErr) {
        /* ignore */
      }

      function runPointVisuals() {
        if (seq !== M.pointAtState.seq) return;
        var lean = M.leanFaceToward(targetEl);
        M.blinkPointTarget(targetEl);
        if (lean && lean.face) {
          M.placePointGlove(lean.face, targetEl);
        } else {
          M.placePointGlove(M.getLiveAssistantFace(), targetEl);
        }
        try {
          M.onLayoutChange();
        } catch (e3) {
          /* ignore */
        }

        M.pointAtState.faceTimer = setTimeout(function () {
          if (seq !== M.pointAtState.seq) return;
          var row = lean && lean.row;
          if (row && row.isConnected) {
            M.handOffToFaceIdleMachine(row, 'curious', {
              startState: 'curious',
              enter: false
            });
          }
        }, M.POINT_HOLD_MS);

        M.pointAtState.clearTimer = setTimeout(function () {
          if (seq !== M.pointAtState.seq) return;
          M.clearAgentPointGlove();
          M.clearAgentPointTarget();
          Array.prototype.forEach.call(
            document.querySelectorAll('.agent-face.is-pointing'),
            function (face) {
              face.classList.remove('is-pointing');
              face.style.removeProperty('--agent-point-angle');
            }
          );
        }, M.POINT_BLINK_MS);
      }

      // Allow collapse/expand layout to settle before measuring.
      setTimeout(runPointVisuals, 90);

      return {
        ok: true,
        section: resolved.section || undefined,
        field: resolved.field || undefined,
        level: resolved.level != null ? resolved.level : undefined
      };
    };
    M.freezeOlderAssistantFaces = function freezeOlderAssistantFaces(currentRow) {
      Array.prototype.forEach.call(
        M.messagesEl.querySelectorAll('.agent-msg--assistant .agent-face'),
        function (face) {
          if (currentRow && currentRow.contains(face)) return;
          M.cancelFaceMorph(face);
          M.clearFaceMotionClasses(face);
          M.clearSickRecoverTimer(face);
          M.clearFaceAsleepVisual(face);
          face.removeAttribute('data-listen');
          face.removeAttribute('title');
          var badge = face.querySelector('.agent-face-status');
          if (badge) badge.remove();
          face.classList.remove('is-sick');
          face._preSickEmotion = null;
          face.classList.add('is-frozen');
        }
      );
    };
    M.attachAssistantFace = function attachAssistantFace(row, emotion, color) {
      var mood = emotion || 'happy';
      M.freezeOlderAssistantFaces(row);
      if (M.FACE_IDLE_ELIGIBLE[mood]) {
        // Seed aura/color, then run a varied arrival script.
        M.setAssistantFaceEmotion(row, 'happy', {
          animate: false,
          color: color,
          idleHandOff: false,
          fromIdleMachine: true
        });
        M.handOffToFaceIdleMachine(row, mood, { enter: true });
      } else {
        M.setAssistantFaceEmotion(row, mood, {
          animate: true,
          forceEnter: true,
          color: color,
          idleHandOff: false
        });
        M.suppressFaceIdleMachine();
        M.faceSm.row = row;
      }
      if (
        M.listeningActive &&
        M.listenFaceMode &&
        M.listenFaceMode !== 'offer' &&
        !M.pending &&
        !M.interviewActive
      ) {
        M.setListenBarState(M.listenFaceMode);
      }
    };
    M.muteListening = function muteListening(ms) {
      M.listenMutedUntil = Date.now() + (ms != null ? ms : M.LISTEN_MUTE_MS);
      M.syncListenBaseline();
    };
    M.fingerprintFromContext = function fingerprintFromContext(ctx) {
      if (!ctx || typeof ctx !== 'object') return '';
      var slim = {
        cardName: ctx.cardName || '',
        cardDesc: ctx.cardDesc || '',
        formula: ctx.formula || '',
        priority: ctx.priority || null,
        due: ctx.due || null,
        blocked: ctx.blocked || null,
        progress: ctx.progress || null,
        statut: ctx.statut || null,
        goals: ctx.goals || null,
        cardMemory: ctx.cardMemory || null
      };
      try {
        return JSON.stringify(slim);
      } catch (e) {
        return String(Date.now());
      }
    };
    M.fingerprintCard = function fingerprintCard() {
      if (!M.Agent || typeof M.Agent.buildContext !== 'function') return '';
      return M.fingerprintFromContext(M.Agent.buildContext(M.bridge) || {});
    };
    M.syncListenBaseline = function syncListenBaseline() {
      if (!M.Agent || typeof M.Agent.buildContext !== 'function') {
        M.listenFingerprint = '';
        M.listenBaselineContext = null;
        return;
      }
      try {
        M.listenBaselineContext = M.Agent.buildContext(M.bridge) || {};
        M.listenFingerprint = M.fingerprintFromContext(M.listenBaselineContext);
      } catch (e) {
        M.listenFingerprint = '';
        M.listenBaselineContext = null;
      }
    };
    M.filterListenSuggestionsLive = function filterListenSuggestionsLive(list, previousContext) {
      var items = Array.isArray(list) ? list.slice() : [];
      if (!items.length || !M.Agent) return [];
      var live = null;
      try {
        live = M.Agent.buildContext(M.bridge);
      } catch (e) {
        return items;
      }
      if (typeof M.Agent.filterNoOpImprovementSuggestions === 'function') {
        items = M.Agent.filterNoOpImprovementSuggestions(items, live);
      }
      if (
        previousContext &&
        typeof M.Agent.filterImprovementsAgainstRecentChanges === 'function'
      ) {
        items = M.Agent.filterImprovementsAgainstRecentChanges(
          items,
          previousContext,
          live
        );
      }
      return items;
    };
    M.clearListenStatusFromFaces = function clearListenStatusFromFaces() {
      Array.prototype.forEach.call(
        M.messagesEl.querySelectorAll('.agent-face[data-listen]'),
        function (face) {
          face.removeAttribute('data-listen');
          face.removeAttribute('title');
          var badge = face.querySelector('.agent-face-status');
          if (badge) badge.remove();
        }
      );
    };
    M.getLiveAssistantFace = function getLiveAssistantFace() {
      var faces = M.messagesEl.querySelectorAll(
        '.agent-msg--assistant .agent-face:not(.is-frozen):not(.is-sick)'
      );
      if (!faces.length) return null;
      return faces[faces.length - 1];
    };
    M.ensureFaceStatusBadge = function ensureFaceStatusBadge(face) {
      if (!face) return null;
      var badge = face.querySelector('.agent-face-status');
      if (!badge) {
        badge = S.el('span', 'agent-face-status');
        badge.setAttribute('aria-hidden', 'true');
        face.appendChild(badge);
      }
      return badge;
    };
    M.setListenBarState = function setListenBarState(mode) {
      var configured = M.Agent.isConfigured(M.provider);
      // Offer / pending reply: no listening badge (the live face is busy).
      var show =
        configured &&
        M.listeningActive &&
        !M.interviewActive &&
        !M.pending &&
        mode !== 'offer';
      var label =
        mode === 'analyzing'
          ? 'Analyse des changements'
          : mode === 'offer'
            ? 'Suggestion en attente'
            : 'À l\u2019écoute des changements';
      M.listenFaceMode = mode;
      M.clearListenStatusFromFaces();
      if (show) {
        if (mode === 'analyzing') {
          M.wakeFaceFromSleep({ resume: true, reschedule: false });
        }
        var face = M.getLiveAssistantFace();
        if (face && !face.classList.contains('is-asleep')) {
          var listenKind = mode === 'analyzing' ? 'analyzing' : 'listening';
          face.setAttribute('data-listen', listenKind);
          face.title = label;
          M.ensureFaceStatusBadge(face);
        }
      }
      M.syncApplySummary();
      M.notifyLayout();
    };
    M.phraseOfferLabel = function phraseOfferLabel(label) {
      var L = String(label || '').trim();
      if (!L) return 'faire un petit ajustement';
      return L.charAt(0).toLowerCase() + L.slice(1);
    };
    M.phraseOfferQuestion = function phraseOfferQuestion(label) {
      var L = M.phraseOfferLabel(label);
      var conjugated = null;
      var rules = [
        [/^d[eé]finir\b/i, 'd\u00e9finisse'],
        [/^fixer\b/i, 'fixe'],
        [/^mettre\s+[aà]\s+jour\b/i, 'mette \u00e0 jour'],
        [/^mettre\b/i, 'mette'],
        [/^ajouter\b/i, 'ajoute'],
        [/^marquer\b/i, 'marque'],
        [/^renommer\b/i, 'renomme'],
        [/^modifier\b/i, 'modifie'],
        [/^supprimer\b/i, 'supprime'],
        [/^retirer\b/i, 'retire'],
        [/^changer\b/i, 'change'],
        [/^lier\b/i, 'lie'],
        [/^r[eé]initialiser\b/i, 'r\u00e9initialise'],
        [/^compl[eé]ter\b/i, 'compl\u00e8te'],
        [/^estimer\b/i, 'estime'],
        [/^lancer\b/i, 'lance'],
        [/^activer\b/i, 'active']
      ];
      for (var i = 0; i < rules.length; i++) {
        if (rules[i][0].test(L)) {
          conjugated = L.replace(rules[i][0], rules[i][1]);
          break;
        }
      }
      if (!conjugated) {
        var er = L.match(/^([A-Za-z\u00c0-\u017f]{2,})er\b([\s\S]*)$/i);
        if (er) conjugated = er[1].toLowerCase() + 'e' + er[2];
      }
      if (conjugated) {
        return 'Veux-tu que je ' + conjugated + '?';
      }
      return 'Veux-tu que je m\u2019occupe de ' + L + '?';
    };
    M.markOfferAnswered = function markOfferAnswered(row, answer) {
      if (!row || !row.parentNode) return;
      row.classList.add('is-resolved');
      var actions = row.querySelector('.agent-offer-actions');
      if (actions) {
        actions.replaceChildren(
          S.el('span', 'agent-offer-answer', {
            text: (answer === 'no' ? '✗ Non' : '✓ Oui')
          })
        );
      }
    };
    M.clearActiveOffer = function clearActiveOffer(row, answer) {
      M.markOfferAnswered(row, answer);
      M.activeOffer = null;
      M.setListenBarState('idle');
      M.syncApplySummary();
    };
    M.appendAnsweredOffer = function appendAnsweredOffer(label, answer) {
      if (!label) return null;
      M.emptyState.classList.add('is-hidden');
      var row = S.el('div', 'agent-msg agent-msg--assistant agent-msg--offer is-resolved');
      var bubble = S.el('div', 'agent-msg-bubble agent-msg-bubble--offer');
      bubble.appendChild(
        S.el('div', 'agent-offer-text', { text: M.phraseOfferQuestion(label) })
      );
      var answerWrap = S.el('div', 'agent-offer-actions');
      answerWrap.appendChild(
        S.el('span', 'agent-offer-answer', {
          text: answer === 'no' ? '✗ Non' : '✓ Oui'
        })
      );
      bubble.appendChild(answerWrap);
      row.appendChild(bubble);
      M.attachAssistantFace(row, M.spiceEmotion('curious'));
      M.messagesEl.appendChild(row);
      return row;
    };
    M.appendOfferMessage = function appendOfferMessage(item) {
      M.emptyState.classList.add('is-hidden');
      M.clearApplySuggestions();
      var row = S.el('div', 'agent-msg agent-msg--assistant agent-msg--offer');
      var bubble = S.el('div', 'agent-msg-bubble agent-msg-bubble--offer');
      bubble.appendChild(
        S.el('div', 'agent-offer-eyebrow', { text: 'Coup de pouce' })
      );
      bubble.appendChild(
        S.el('div', 'agent-offer-text', {
          text: M.phraseOfferQuestion(item.label)
        })
      );
      var actions = S.el('div', 'agent-offer-actions');
      var yesBtn = S.el('button', 'agent-offer-btn agent-offer-btn--yes', {
        type: 'button',
        text: 'Oui'
      });
      var noBtn = S.el('button', 'agent-offer-btn agent-offer-btn--no', {
        type: 'button',
        text: 'Non'
      });
      actions.appendChild(yesBtn);
      actions.appendChild(noBtn);
      bubble.appendChild(actions);
      row.appendChild(bubble);
      var offerEmotion = M.spiceEmotion('curious');
      M.attachAssistantFace(row, offerEmotion);
      M.messagesEl.appendChild(row);
      M.scrollMessagesToBottom();

      M.activeOffer = { item: item, row: row };
      M.setListenBarState('offer');

      yesBtn.addEventListener('click', function () {
        if (M.pending || !M.activeOffer || M.activeOffer.row !== row) return;
        M.onOfferAccept(item, row);
      });
      noBtn.addEventListener('click', function () {
        if (!M.activeOffer || M.activeOffer.row !== row) return;
        M.onOfferDecline(item, row);
      });

      M.announceAssistantArrival({
        sound: true,
        soundKind: 'suggestion',
        emotion: offerEmotion
      });
      M.notifyLayout();
      return row;
    };
    M.onOfferAccept = async function onOfferAccept(item, row) {
      M.clearActiveOffer(row, 'yes');
      M.muteListening();
      var result = await M.runActionsWithPanel(item.actions || []);
      M.appendMessage('assistant', result.summary || 'Okay, c\'est fait.');
      M.appendChangeRecap(result, { ok: result.ok });
      M.appendActionResultBlocks(result);
      M.history.push({
        role: 'assistant',
        content: result.summary || result.recap || 'Okay, c\'est fait.'
      });
      M.schedulePersistChatHistory();
      M.muteListening();
      M.notifyLayout();
    };
    M.onOfferDecline = function onOfferDecline(item, row) {
      M.dismissedOffers[String(item.label || '').trim()] = Date.now();
      M.clearActiveOffer(row, 'no');

      var softReplies = [
        'Pas de souci\u00a0!',
        'Ok, no worries.',
        'Tranquille, on laisse \u00e7a.',
        'Ok, on passe.'
      ];
      var soft = softReplies[Math.floor(Math.random() * softReplies.length)];
      M.lastListenSuggestions = M.filterListenSuggestionsLive(
        M.lastListenSuggestions,
        M.listenScanPreviousContext
      );
      var next = M.pickListenSuggestion(M.lastListenSuggestions);

      if (next) {
        M.appendMessage('assistant', soft + ' Autre id\u00e9e?', {
          emotion: M.spiceEmotion('happy'),
          noUnread: true,
          noSound: true
        });
        M.history.push({
          role: 'assistant',
          content: soft + ' Autre id\u00e9e?'
        });
        M.schedulePersistChatHistory();
        M.appendOfferMessage(next);
      } else {
        M.appendMessage(
          'assistant',
          soft + ' Dis-moi si tu veux autre chose.',
          { emotion: M.spiceEmotion('happy') }
        );
        M.history.push({
          role: 'assistant',
          content: soft + ' Dis-moi si tu veux autre chose.'
        });
        M.schedulePersistChatHistory();
        M.renderSuggestions(
          [
            'Quelle est la priorit\u00e9?',
            'D\u00e9finir une \u00e9ch\u00e9ance',
            'Ajouter une sous-t\u00e2che'
          ],
          { animate: true, answering: false }
        );
        M.refreshApplySuggestions({ animate: true });
      }

      M.muteListening(800);
      M.notifyLayout();
    };
    M.pickListenSuggestion = function pickListenSuggestion(list) {
      var now = Date.now();
      var candidates = (list || []).filter(function (item) {
        if (
          !item ||
          typeof item.label !== 'string' ||
          !item.label.trim() ||
          !Array.isArray(item.actions) ||
          !item.actions.length
        ) {
          return false;
        }
        var key = item.label.trim();
        var dismissedAt = M.dismissedOffers[key];
        if (dismissedAt && now - dismissedAt < 10 * 60 * 1000) return false;
        return true;
      });
      return candidates[0] || null;
    };
    M.runListenScan = async function runListenScan() {
      if (!M.Agent.isConfigured(M.provider) || M.pending || M.interviewActive) return;
      if (M.activeOffer) return;
      if (typeof M.Agent.suggestCardImprovements !== 'function') return;
      var seq = ++M.listenScanSeq;
      var previousContext = M.listenScanPreviousContext;
      M.listeningAnalyzing = true;
      M.setListenBarState('analyzing');
      try {
        var list = await M.Agent.suggestCardImprovements(M.provider, M.bridge, {
          previousContext: previousContext,
          onDebug: function (entry) {
            M.pushDebugEntry(entry);
          }
        });
        if (seq !== M.listenScanSeq) return;
        M.lastListenSuggestions = M.filterListenSuggestionsLive(
          Array.isArray(list) ? list : [],
          previousContext
        );
        var pick = M.pickListenSuggestion(M.lastListenSuggestions);
        if (pick) {
          M.appendOfferMessage(pick);
        } else {
          M.setListenBarState('idle');
        }
      } catch (err) {
        if (seq !== M.listenScanSeq) return;
        console.error('AgentUI listen scan failed', err);
        if (err && err.debug) M.pushDebugEntry(err.debug);
        M.setListenBarState('idle');
      } finally {
        if (seq === M.listenScanSeq) {
          M.listeningAnalyzing = false;
          M.listenCooldownUntil = Date.now() + M.LISTEN_COOLDOWN_MS;
          M.syncListenBaseline();
          M.syncApplySummary();
        }
      }
    };
    M.scheduleListenScan = function scheduleListenScan() {
      if (M.listenDebounceTimer) {
        clearTimeout(M.listenDebounceTimer);
        M.listenDebounceTimer = null;
      }
      M.listenDebounceTimer = setTimeout(function () {
        M.listenDebounceTimer = null;
        M.runListenScan();
      }, M.LISTEN_DEBOUNCE_MS);
    };
    M.tickListen = function tickListen() {
      if (!M.listeningActive || !M.settleReady) return;
      if (!M.Agent.isConfigured(M.provider) || M.pending || M.interviewActive) {
        M.setListenBarState(M.activeOffer ? 'offer' : 'idle');
        return;
      }
      if (M.activeOffer || M.listeningAnalyzing) return;
      if (Date.now() < M.listenMutedUntil) return;
      if (Date.now() < M.listenCooldownUntil) return;
      var nextCtx;
      var nextFp;
      try {
        nextCtx = M.Agent.buildContext(M.bridge) || {};
        nextFp = M.fingerprintFromContext(nextCtx);
      } catch (e) {
        return;
      }
      if (!M.listenFingerprint) {
        M.listenBaselineContext = nextCtx;
        M.listenFingerprint = nextFp;
        M.setListenBarState('idle');
        return;
      }
      if (nextFp === M.listenFingerprint) {
        M.setListenBarState('idle');
        return;
      }
      // Snapshot what the card looked like before this edit.
      M.listenScanPreviousContext = M.listenBaselineContext;
      M.listenBaselineContext = nextCtx;
      M.listenFingerprint = nextFp;
      M.scheduleListenScan();
    };
    M.startListening = function startListening() {
      if (M.isProjectScope) return;
      if (M.listeningActive) {
        M.setListenBarState(M.activeOffer ? 'offer' : M.listeningAnalyzing ? 'analyzing' : 'idle');
        return;
      }
      if (!M.Agent.isConfigured(M.provider)) return;
      M.listeningActive = true;
      M.syncListenBaseline();
      M.setListenBarState('idle');
      if (M.listenTimer) clearInterval(M.listenTimer);
      M.listenTimer = setInterval(M.tickListen, M.LISTEN_POLL_MS);
    };
    M.stopListening = function stopListening() {
      M.listeningActive = false;
      M.listenFaceMode = null;
      if (M.listenTimer) {
        clearInterval(M.listenTimer);
        M.listenTimer = null;
      }
      if (M.listenDebounceTimer) {
        clearTimeout(M.listenDebounceTimer);
        M.listenDebounceTimer = null;
      }
      M.clearListenStatusFromFaces();
      M.syncApplySummary();
    };
    M.markSettleReady = function markSettleReady() {
      if (M.settleReady) return;
      M.settleReady = true;
      M.syncListenBaseline();
      if (M.Agent.isConfigured(M.provider) && !M.interviewActive) {
        M.startListening();
      }
    };
    M.appendMessage = function appendMessage(role, text, meta) {
      M.noteFaceChatActivity({ resume: role !== 'assistant' });
      M.emptyState.classList.add('is-hidden');
      var row = S.el('div', 'agent-msg agent-msg--' + role);
      if (meta && meta.recap) {
        row.classList.add('agent-msg--recap');
      }
      if (meta && meta.error) {
        row.classList.add('agent-msg--error');
      }
      var bubble = S.el(
        'div',
        'agent-msg-bubble' +
          (meta && meta.recap ? ' agent-msg-bubble--recap' : '') +
          (meta && meta.error ? ' agent-msg-bubble--error' : '')
      );
      if (role === 'assistant' && !(meta && meta.error)) {
        // Seed aura before highlights so [[a:]] uses identity / turn color on first paint.
        var seedAura = M.auraForEmotion(
          (meta && meta.emotion) || 'neutral',
          meta && (meta.color != null ? meta.color : meta.aura)
        );
        M.applyAuraCssVars(row, seedAura, M.paletteForAura(seedAura));
        S.fillMessageContent(bubble, text, (meta && meta.blocks) || [], {
          streaming: !!(meta && meta.streaming)
        });
      } else {
        bubble.textContent = text;
      }
      row.appendChild(bubble);
      if (meta && meta.note) {
        row.appendChild(S.el('div', 'agent-msg-note', { text: meta.note }));
      }
      var emotion = null;
      if (role === 'user') {
        M.attachUserResumeControl(row);
        M.attachMessageCopyControl(row);
      } else if (role === 'assistant') {
        emotion =
          (meta && meta.emotion) ||
          M.inferAssistantEmotion(text, meta, {
            userText: M.lastUserMessageText()
          });
        M.attachAssistantFace(
          row,
          emotion,
          meta && (meta.color != null ? meta.color : meta.aura)
        );
        if (
          !(meta && (meta.error || meta.recap || meta.noFeedback || meta.offer))
        ) {
          M.attachFeedbackControls(row);
        }
        if (!(meta && meta.offer)) {
          M.attachMessageCopyControl(row);
        }
      }
      M.messagesEl.appendChild(row);
      M.scrollMessagesToBottom();
      if (
        global.ContextMenu &&
        typeof global.ContextMenu.bind === 'function' &&
        typeof global.ContextMenu.buildAgentMessageItems === 'function' &&
        !(meta && meta.offer)
      ) {
        ContextMenu.bind(row, function () {
          var canFeedback =
            role === 'assistant' &&
            !(meta && (meta.error || meta.recap || meta.noFeedback || meta.offer)) &&
            !!row.querySelector('.agent-msg-feedback');
          return ContextMenu.buildAgentMessageItems({
            role: role,
            canCopy: !!M.messageBubblePlainText(row),
            canFeedback: canFeedback,
            onEditResume: function () {
              M.resumeFromUserMessage(row);
            },
            onCopy: function () {
              var text = M.messageBubblePlainText(row);
              if (!text) return;
              var copyBtn = row.querySelector('.agent-msg-copy');
              M.copyTextToClipboard(text).then(function (ok) {
                if (ok && copyBtn) M.flashCopyButton(copyBtn);
              });
            },
            onFeedbackUp: function () {
              var up = row.querySelector('.agent-msg-feedback-btn--up');
              if (up) up.click();
            },
            onFeedbackDown: function () {
              var down = row.querySelector('.agent-msg-feedback-btn--down');
              if (down) down.click();
            },
          });
        });
      }
      if (role === 'assistant' && !(meta && meta.silent)) {
        M.announceAssistantArrival({
          sound: !(meta && meta.noSound),
          unread: !(meta && meta.noUnread),
          emotion: emotion || (meta && meta.error ? 'sad' : 'happy')
        });
      }
      M.notifyLayout();
      return row;
    };
    M.appendPendingMessage = function appendPendingMessage() {
      M.noteFaceChatActivity({ resume: false, reschedule: false });
      M.emptyState.classList.add('is-hidden');
      var row = S.el('div', 'agent-msg agent-msg--assistant is-pending is-streaming');
      row.setAttribute('aria-busy', 'true');
      row.setAttribute('aria-label', 'R\u00e9ponse en cours');
      // Seed identity aura so [[a:…]] accents paint correctly during stream.
      M.applyAuraCssVars(row, M.identityAura(), M.paletteForAura(M.identityAura()));
      // Face stays; the status panel shows the step, the bar and the estimate.
      var statusHost = S.el('div', 'agent-turn-status');
      row.appendChild(statusHost);
      var bubble = S.el('div', 'agent-msg-bubble agent-msg-bubble--pending');
      bubble.hidden = true;
      row.appendChild(bubble);
      M.messagesEl.appendChild(row);
      M.startThinkingMotions(row);
      row._turnStatus = S.mountLoading(statusHost, {
        estimateMs: M.turnEstimateMs,
        phases: ['prepare', 'send', 'read'],
        phase: 'prepare'
      });
      M.freezeOlderAssistantFaces(row);
      M.scrollMessagesToBottom();
      M.notifyLayout();
      return row;
    };
    M.finalizeAssistantRow = function finalizeAssistantRow(row, text, meta) {
      meta = meta || {};
      M.stopThinkingMotions();
      var emotion = M.inferAssistantEmotion(text, meta, {
        userText: M.lastUserMessageText()
      });
      var color = meta.color != null ? meta.color : meta.aura;
      M.freezeOlderAssistantFaces(row);
      if (M.FACE_IDLE_ELIGIBLE[emotion]) {
        M.setAssistantFaceEmotion(row, 'happy', {
          animate: false,
          color: color,
          idleHandOff: false,
          fromIdleMachine: true
        });
        M.handOffToFaceIdleMachine(row, emotion, { enter: true });
      } else {
        M.setAssistantFaceEmotion(row, emotion, {
          animate: true,
          forceEnter: true,
          color: color,
          idleHandOff: false
        });
        M.suppressFaceIdleMachine();
        M.faceSm.row = row;
      }
      if (
        M.listeningActive &&
        M.listenFaceMode &&
        M.listenFaceMode !== 'offer' &&
        !M.pending &&
        !M.interviewActive
      ) {
        M.setListenBarState(M.listenFaceMode);
      }
      M.scheduleFaceSleep();
      return emotion;
    };
    M.revealPendingBubble = function revealPendingBubble(bubble, text, blocks) {
      if (!bubble) return;
      bubble.hidden = false;
      bubble.classList.remove('agent-msg-bubble--pending');
      S.fillMessageContent(bubble, text || '', blocks || [], { streaming: false });
    };
    M.endTurnStatus = function endTurnStatus(row) {
      if (!row || !row._turnStatus) return;
      var waited = row._turnStatus.elapsed();
      if (waited > 400) {
        M.turnEstimateMs = Math.round(M.turnEstimateMs * 0.35 + waited * 0.65);
      }
      row._turnStatus.stop();
      row._turnStatus = null;
    };
    M.markTurnPhase = function markTurnPhase(row, phase) {
      if (row && row._turnStatus) row._turnStatus.setPhase(phase);
    };
    M.openGuide = function openGuide(spec) {
      if (!global.AgentGuides || typeof AgentGuides.mount !== 'function') return;
      AgentGuides.mount(M.guideHost, spec);
      if (typeof M.notifyLayout === 'function') M.notifyLayout();
    };
    M.renderSchedPop = function renderSchedPop() {
      M.schedPop.replaceChildren();
      var now = Date.now();
      M.schedTasks.forEach(function (task) {
        var row = S.el('div', 'agent-sched-row');
        var text = S.el('span', 'agent-sched-text');
        text.textContent = task.message;
        var time = S.el('span', 'agent-sched-time');
        time.textContent = AgentGuides
          ? AgentGuides.formatRemain(task.at - now)
          : '';
        var cancel = S.el('button', 'agent-sched-x');
        cancel.type = 'button';
        cancel.setAttribute('aria-label', 'Annuler');
        cancel.textContent = '\u00d7';
        cancel.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          M.schedTasks = M.schedTasks.filter(function (item) {
            return item.id !== task.id;
          });
          M.renderSchedButton();
        });
        row.appendChild(text);
        row.appendChild(time);
        row.appendChild(cancel);
        M.schedPop.appendChild(row);
      });
    };
    M.placeSchedPop = function placeSchedPop() {
      var rect = M.schedBtn.getBoundingClientRect();
      var width = 240;
      var left = Math.max(8, rect.right - width);
      M.schedPop.style.left = left + 'px';
      M.schedPop.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    };
    M.renderSchedButton = function renderSchedButton() {
      var n = M.schedTasks.length;
      M.schedWrap.hidden = n === 0;
      M.schedCount.textContent = n ? String(n) : '';
      if (!n) {
        M.schedPop.hidden = true;
        M.schedBtn.setAttribute('aria-expanded', 'false');
        return;
      }
      if (!M.schedPop.hidden) {
        M.renderSchedPop();
        M.placeSchedPop();
      }
    };
    M.ensureSchedTimer = function ensureSchedTimer() {
      if (M.schedTimer) return;
      M.schedTimer = setInterval(M.tickSchedules, 1000);
    };
    M.tickSchedules = function tickSchedules() {
      if (!global.AgentGuides) return;
      var split = AgentGuides.dueTasks(M.schedTasks, Date.now());
      split.due.forEach(function (task) {
        M.appendMessage('assistant', task.message);
        M.history.push({ role: 'assistant', content: task.message });
      });
      M.schedTasks = split.pending;
      if (split.due.length) {
        M.schedulePersistChatHistory();
        M.scrollMessagesToBottom();
      }
      M.renderSchedButton();
      if (!M.schedTasks.length && M.schedTimer) {
        clearInterval(M.schedTimer);
        M.schedTimer = null;
      }
    };
    M.addSchedule = function addSchedule(check) {
      if (!check || !check.message) return;
      var now = Date.now();
      M.schedTasks.push({
        id: 'c' + now + '-' + M.schedTasks.length,
        message: check.message,
        at: now + check.seconds * 1000
      });
      M.ensureSchedTimer();
      M.renderSchedButton();
    };
    M.consumeGuideResults = function consumeGuideResults(applied) {
      var results = applied && applied.results;
      if (!results || !results.length) return;
      results.forEach(function (r) {
        if (!r || r.ok === false) return;
        if (r.tool === 'show_guide' && r.guide) M.openGuide(r.guide);
        if (r.tool === 'schedule_check' && r.schedule) M.addSchedule(r.schedule);
      });
    };
    },
    run: function (M) {
    M.bridge.pointAt = typeof M.options.pointAt === 'function'
      ? M.options.pointAt
      : M.pointAtOnPage;
    M.messagesEl.addEventListener('click', function (ev) {
      var link = ev.target && ev.target.closest && ev.target.closest('[data-open-section]');
      if (!link || !M.messagesEl.contains(link)) return;
      ev.preventDefault();
      if (typeof M.bridge.openSection === 'function') {
        M.bridge.openSection(link.getAttribute('data-open-section'), { expand: true });
      }
    });
    M.schedBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!M.schedTasks.length) return;
      var open = M.schedPop.hidden;
      M.schedPop.hidden = !open;
      M.schedBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        M.renderSchedPop();
        M.placeSchedPop();
      }
    });
    document.addEventListener('mousedown', function (e) {
      if (M.schedPop.hidden) return;
      if (M.schedWrap.contains(e.target)) return;
      M.schedPop.hidden = true;
      M.schedBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (global.AgentGuides && M.guideHost && !M.guideHost.hidden) {
        AgentGuides.close(M.guideHost);
        if (typeof M.notifyLayout === 'function') M.notifyLayout();
      }
      if (!M.schedPop.hidden) {
        M.schedPop.hidden = true;
        M.schedBtn.setAttribute('aria-expanded', 'false');
      }
    });
    }
  });
})(typeof window !== 'undefined' ? window : this);
