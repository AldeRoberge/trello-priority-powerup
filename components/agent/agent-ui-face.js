/**
 * agent-ui: mount() part 4 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.inferAssistantEmotion = function inferAssistantEmotion(text, meta, context) {
      meta = meta || {};
      context = context || {};
      if (meta.emotion) return meta.emotion;
      if (context.thinking) return M.spiceEmotion('thinking');
      if (meta.error) return 'sad';
      if (meta.offer) return M.spiceEmotion('curious');
      if (meta.ok === false) return 'sad';
      if (meta.surprised) return M.spiceEmotion('surprised');

      var userText =
        context.userText != null ? context.userText : M.lastUserMessageText();
      if (M.isMeanUserText(userText)) return 'sad';

      var t = String(text || '');
      var lower = t.toLowerCase();

      if (
        /\b(erreur|échou|echou|impossible|d[eé]sol[eé]|navr[eé]|n['']ai pas pu|n['']ai pas r[eé]ussi|échec|fail)\b/i.test(
          lower
        )
      ) {
        return 'sad';
      }
      if (
        /\b(haha|hihi|lol|mdr|ptdr|:p|;p|tongue|langue)\b/i.test(lower) ||
        /:p|;p|😛|😜/.test(t)
      ) {
        return 'tongue';
      }
      if (
        /\b(youhou|hourra|g[eé]nial|incroyable|let'?s go|allez|top\b)\b/i.test(lower) ||
        /🎉|🥳|✨/.test(t)
      ) {
        return M.spiceEmotion('excited');
      }
      if (
        meta.ok === true ||
        /\b(c['']est fait|appliqu[eé]|parfait|tr[eè]s bien|voil[aà]|mis à jour|mis a jour|bravo|super|nickel|impeccable)\b/i.test(
          lower
        )
      ) {
        return M.spiceEmotion('happy');
      }
      if (
        /\b(oh+|tiens|inattendu|surprise|étrange|etrange|intéressant|interessant|wow|hein\b|waouh)\b/i.test(
          lower
        ) ||
        meta.emptyClaim
      ) {
        return M.spiceEmotion('surprised');
      }
      if (/\?/.test(t) && t.length < 160) return M.spiceEmotion('curious');
      if (meta.recap) return meta.ok === false ? 'sad' : M.spiceEmotion('happy');
      return M.spiceEmotion('neutral');
    };
    M.createAssistantFace = function createAssistantFace(emotion, color, faceStyle) {
      var mood = emotion || 'neutral';
      if (M.FACE_EMOTIONS.indexOf(mood) === -1) mood = 'neutral';
      var aura = M.auraForEmotion(mood, color);
      var palette = M.paletteForAura(aura);
      var style = M.normalizeAgentFace(
        faceStyle != null ? faceStyle : M.identityFace()
      );
      var face = S.el('span', 'agent-face agent-face--' + mood);
      face.setAttribute('aria-hidden', 'true');
      face.setAttribute('data-emotion', mood);
      face.setAttribute('data-face', style);
      M.applyAuraCssVars(face, aura, palette);
      var gradId = 'agentFaceSkin' + ++M.faceGradientSeq;
      face.innerHTML =
        '<svg class="agent-face-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40" focusable="false">' +
        '<defs>' +
        '<radialGradient id="' +
        gradId +
        '" cx="35%" cy="30%" r="70%">' +
        '<stop class="agent-face-skin-stop" offset="0%" stop-color="' +
        palette.hi +
        '"/>' +
        '<stop class="agent-face-skin-stop" offset="55%" stop-color="' +
        palette.mid +
        '"/>' +
        '<stop class="agent-face-skin-stop" offset="100%" stop-color="' +
        palette.lo +
        '"/>' +
        '</radialGradient>' +
        '</defs>' +
        '<ellipse class="agent-face-bg" cx="20" cy="20" rx="19.2" ry="19.2" fill="url(#' +
        gradId +
        ')"/>' +
        '<ellipse class="agent-face-ring" cx="20" cy="20" rx="19.2" ry="19.2" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.4"/>' +
        '<g class="agent-face-features">' +
        '<g class="agent-face-brows">' +
        '<path class="agent-face-brow agent-face-brow--l" d="M11.5 14.2c1.4-.9 3.2-.9 4.6 0" fill="none" stroke="#6b3f2a" stroke-width="1.35" stroke-linecap="round"/>' +
        '<path class="agent-face-brow agent-face-brow--r" d="M23.9 14.2c1.4-.9 3.2-.9 4.6 0" fill="none" stroke="#6b3f2a" stroke-width="1.35" stroke-linecap="round"/>' +
        '</g>' +
        '<g class="agent-face-eyes">' +
        '<ellipse class="agent-face-eye agent-face-eye--l" cx="14.2" cy="17.6" rx="2.35" ry="2.7" fill="#2a211c"/>' +
        '<ellipse class="agent-face-eye agent-face-eye--r" cx="25.8" cy="17.6" rx="2.35" ry="2.7" fill="#2a211c"/>' +
        '<circle class="agent-face-shine agent-face-shine--l" cx="15" cy="16.7" r="0.7" fill="#fff"/>' +
        '<circle class="agent-face-shine agent-face-shine--r" cx="26.6" cy="16.7" r="0.7" fill="#fff"/>' +
        '</g>' +
        '<g class="agent-face-cheeks">' +
        '<ellipse class="agent-face-cheek agent-face-cheek--l" cx="11.2" cy="22.4" rx="2.4" ry="1.4" fill="#f07a7a" opacity="0.35"/>' +
        '<ellipse class="agent-face-cheek agent-face-cheek--r" cx="28.8" cy="22.4" rx="2.4" ry="1.4" fill="#f07a7a" opacity="0.35"/>' +
        '</g>' +
        '<g class="agent-face-mouths">' +
        '<path class="agent-face-mouth agent-face-mouth--neutral" d="M15.6 25.2c1.4.9 3.2 1.3 4.4 1.3s3-.4 4.4-1.3" fill="none" stroke="#6b3f2a" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path class="agent-face-mouth agent-face-mouth--happy" d="M14.4 24.4c1.8 2.4 4.2 3.5 5.6 3.5s3.8-1.1 5.6-3.5" fill="none" stroke="#6b3f2a" stroke-width="1.55" stroke-linecap="round"/>' +
        '<path class="agent-face-mouth agent-face-mouth--sad" d="M15.4 26.8c1.5-1.2 3.3-1.7 4.6-1.7s3.1.5 4.6 1.7" fill="none" stroke="#6b3f2a" stroke-width="1.5" stroke-linecap="round"/>' +
        '<ellipse class="agent-face-mouth agent-face-mouth--surprised" cx="20" cy="25.6" rx="2.1" ry="2.5" fill="#6b3f2a"/>' +
        '<path class="agent-face-mouth agent-face-mouth--curious" d="M16.2 25c1.2 1.35 2.8 2 3.8 2s2.6-.65 3.8-2" fill="none" stroke="#6b3f2a" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path class="agent-face-mouth agent-face-mouth--thinking" d="M17.5 25.4c1.1.35 2.4.5 3.4.35" fill="none" stroke="#6b3f2a" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path class="agent-face-mouth agent-face-mouth--tongue" d="M14.6 24.6c1.7 2.2 3.9 3.2 5.4 3.2s3.7-1 5.4-3.2" fill="none" stroke="#6b3f2a" stroke-width="1.55" stroke-linecap="round"/>' +
        '<path class="agent-face-mouth agent-face-mouth--wink" d="M15.8 25.2c1.2 1.1 2.8 1.6 4.2 1.5 1.2-.1 2.4-.5 3.4-1.2" fill="none" stroke="#6b3f2a" stroke-width="1.5" stroke-linecap="round"/>' +
        '<path class="agent-face-mouth agent-face-mouth--excited" d="M14 24.2c2 2.8 4.4 4 6 4s4-1.2 6-4" fill="none" stroke="#6b3f2a" stroke-width="1.65" stroke-linecap="round"/>' +
        '</g>' +
        '</g>' +
        '</svg>';
      M.applyFaceStyle(face, style);
      face.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (face.classList.contains('is-frozen') || face.classList.contains('is-sick')) {
          return;
        }
        if (face.classList.contains('is-asleep')) {
          M.wakeFaceFromSleep({ resume: true });
          return;
        }
        var clicks = M.noteFaceSpinClick(face);
        if (clicks >= M.FACE_SPIN_PUKE_AT) {
          M.makeAssistantFaceSick(face);
          return;
        }
        M.spinAssistantFace(face);
      });
      return face;
    };
    M.noteFaceSpinClick = function noteFaceSpinClick(face) {
      var now = Date.now();
      if (!face._spinClickAt || now - face._spinClickAt > M.FACE_SPIN_CLICK_WINDOW_MS) {
        face._spinClicks = 0;
      }
      face._spinClickAt = now;
      face._spinClicks = (face._spinClicks || 0) + 1;
      return face._spinClicks;
    };
    M.prefersFaceReducedMotion = function prefersFaceReducedMotion() {
      try {
        return !!(
          global.matchMedia &&
          global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
      } catch (e) {
        return false;
      }
    };
    M.pukeAllOverScreen = function pukeAllOverScreen(face) {
      var rect = face && face.getBoundingClientRect ? face.getBoundingClientRect() : null;
      var ox = rect ? rect.left + rect.width / 2 : global.innerWidth / 2;
      var oy = rect ? rect.top + rect.height * 0.72 : global.innerHeight / 2;
      var layer = S.el('div', 'agent-face-puke-layer');
      layer.setAttribute('aria-hidden', 'true');
      var reduced = M.prefersFaceReducedMotion();
      var count = reduced ? 18 : 96;
      var vw = global.innerWidth || 800;
      var vh = global.innerHeight || 600;
      var reach = Math.sqrt(vw * vw + vh * vh);
      for (var i = 0; i < count; i++) {
        var blob = S.el('span', 'agent-face-puke-blob');
        var ang = Math.random() * Math.PI * 2;
        // Fling past viewport corners so spray reads fullscreen.
        var dist = reach * (reduced ? 0.35 + Math.random() * 0.45 : 0.55 + Math.random() * 0.7);
        var dx = Math.cos(ang) * dist;
        var dy = Math.sin(ang) * dist * 0.95 + 80 + Math.random() * 220;
        var size = reduced
          ? 14 + Math.random() * 28
          : 18 + Math.random() * 52;
        blob.style.setProperty('--px', ox + 'px');
        blob.style.setProperty('--py', oy + 'px');
        blob.style.setProperty('--dx', dx + 'px');
        blob.style.setProperty('--dy', dy + 'px');
        blob.style.setProperty('--size', size + 'px');
        blob.style.setProperty('--rot', Math.floor(Math.random() * 360) + 'deg');
        blob.style.animationDelay = Math.random() * 0.18 + 's';
        blob.style.animationDuration = 1.05 + Math.random() * 1.15 + 's';
        blob.style.background =
          M.FACE_PUKE_COLORS[Math.floor(Math.random() * M.FACE_PUKE_COLORS.length)];
        if (Math.random() > 0.45) {
          blob.classList.add('agent-face-puke-blob--splatter');
        }
        layer.appendChild(blob);
      }
      document.body.appendChild(layer);
      global.setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }, reduced ? 2000 : 3200);
    };
    M.clearSickRecoverTimer = function clearSickRecoverTimer(face) {
      if (face && face._sickRecoverTimer != null) {
        clearTimeout(face._sickRecoverTimer);
        face._sickRecoverTimer = null;
      }
    };
    M.recoverAssistantFaceFromSick = function recoverAssistantFaceFromSick(face) {
      if (!face || !face.classList || !face.classList.contains('is-sick')) return;
      M.clearSickRecoverTimer(face);
      face.classList.remove('is-sick');
      face._spinClicks = 0;
      face._spinClickAt = 0;
      face.removeAttribute('title');
      var resume = face._preSickEmotion || 'happy';
      face._preSickEmotion = null;
      var row = face.closest('.agent-msg--assistant');
      if (!row || !row.isConnected || face.classList.contains('is-frozen')) {
        M.applyFaceAura(face, M.identityAura());
        return;
      }
      M.setAssistantFaceEmotion(row, resume, {
        animate: false,
        smooth: true
      });
    };
    M.makeAssistantFaceSick = function makeAssistantFaceSick(face) {
      if (!face || !face.classList || face.classList.contains('is-sick')) return;
      M.clearSickRecoverTimer(face);
      M.clearFaceAsleepVisual(face);
      M.cancelFaceMorph(face);
      M.clearFaceMotionClasses(face);
      M.suppressFaceIdleMachine();
      face._preSickEmotion = face.getAttribute('data-emotion') || 'happy';
      face._spinClicks = M.FACE_SPIN_PUKE_AT;
      M.swapFaceEmotionClass(face, 'surprised');
      face.classList.add('is-sick');
      face.setAttribute('data-emotion', 'surprised');
      M.applyFacePalette(face, 'yellow', M.FACE_SICK_PALETTE);
      face.removeAttribute('data-think');
      face.removeAttribute('data-listen');
      face.setAttribute('title', 'Beurk\u2026');
      var badge = face.querySelector('.agent-face-status');
      if (badge) badge.remove();
      var row = face.closest('.agent-msg--assistant');
      if (row) {
        row.setAttribute('data-emotion', 'surprised');
        M.applyAuraCssVars(row, 'yellow', M.paletteForAura('yellow'));
      }
      M.playBarfSound();
      M.pukeAllOverScreen(face);
      face._sickRecoverTimer = global.setTimeout(function () {
        face._sickRecoverTimer = null;
        M.recoverAssistantFaceFromSick(face);
      }, M.FACE_SICK_RECOVER_MS);
    };
    M.clearFaceSleepTimer = function clearFaceSleepTimer() {
      if (M.faceSleepTimer != null) {
        clearTimeout(M.faceSleepTimer);
        M.faceSleepTimer = null;
      }
    };
    M.removeFaceZzz = function removeFaceZzz(face) {
      if (!face) return;
      var layer = face.querySelector('.agent-face-zzz-layer');
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    };
    M.clearFaceAsleepVisual = function clearFaceAsleepVisual(face) {
      if (!face || !face.classList) return;
      if (!face.classList.contains('is-asleep')) {
        M.removeFaceZzz(face);
        return;
      }
      face.classList.remove('is-asleep');
      if (face.getAttribute('title') === 'Zzz\u2026') {
        face.removeAttribute('title');
      }
      M.removeFaceZzz(face);
    };
    M.ensureFaceZzz = function ensureFaceZzz(face) {
      if (!face) return null;
      var layer = face.querySelector('.agent-face-zzz-layer');
      if (layer) return layer;
      layer = S.el('span', 'agent-face-zzz-layer');
      layer.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 4; i++) {
        var z = S.el('span', 'agent-face-zzz', { text: 'z' });
        z.style.setProperty('--i', String(i));
        layer.appendChild(z);
      }
      face.appendChild(layer);
      return layer;
    };
    M.canLiveFaceSleep = function canLiveFaceSleep() {
      if (M.pending || M.faceSm.typing || M.interviewActive || M.listeningAnalyzing) {
        return false;
      }
      if (
        M.thinkingMotionRow &&
        M.thinkingMotionRow.isConnected &&
        M.thinkingMotionRow.classList.contains('is-pending')
      ) {
        return false;
      }
      var face = M.getLiveAssistantFace();
      if (!face || face.classList.contains('is-sick')) return false;
      return true;
    };
    M.putLiveFaceToSleep = function putLiveFaceToSleep() {
      var face = M.getLiveAssistantFace();
      if (!face) return;
      if (face.classList.contains('is-asleep')) return;
      if (!M.canLiveFaceSleep()) {
        M.scheduleFaceSleep();
        return;
      }
      M.cancelFaceMorph(face);
      M.clearFaceMotionClasses(face);
      M.faceSmClearFx();
      M.suppressFaceIdleMachine();
      face.classList.add('is-asleep');
      face.setAttribute('title', 'Zzz\u2026');
      face.removeAttribute('data-listen');
      face.removeAttribute('data-think');
      var badge = face.querySelector('.agent-face-status');
      if (badge) badge.remove();
      M.ensureFaceZzz(face);
    };
    M.wakeFaceFromSleep = function wakeFaceFromSleep(options) {
      options = options || {};
      M.clearFaceSleepTimer();
      var asleep = M.messagesEl.querySelector(
        '.agent-msg--assistant .agent-face.is-asleep'
      );
      if (asleep) {
        M.clearFaceAsleepVisual(asleep);
        if (
          options.resume !== false &&
          !M.faceSm.typing &&
          !M.pending &&
          !asleep.classList.contains('is-frozen') &&
          !asleep.classList.contains('is-sick')
        ) {
          var row = asleep.closest('.agent-msg--assistant');
          var mood = asleep.getAttribute('data-emotion') || 'happy';
          if (row && M.FACE_IDLE_ELIGIBLE[mood]) {
            M.handOffToFaceIdleMachine(row, mood, { enter: false });
          }
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
      }
      if (options.reschedule !== false) {
        M.scheduleFaceSleep();
      }
    };
    M.scheduleFaceSleep = function scheduleFaceSleep() {
      M.clearFaceSleepTimer();
      M.faceSleepTimer = global.setTimeout(function () {
        M.faceSleepTimer = null;
        M.putLiveFaceToSleep();
      }, M.FACE_SLEEP_IDLE_MS);
    };
    M.noteFaceChatActivity = function noteFaceChatActivity(options) {
      M.wakeFaceFromSleep(options || { resume: true });
    };
    M.spinAssistantFace = function spinAssistantFace(face) {
      if (
        !face ||
        !face.classList ||
        face.classList.contains('is-frozen') ||
        face.classList.contains('is-sick') ||
        face.classList.contains('is-asleep')
      ) {
        return;
      }
      if (face._agentSpinEnd) {
        face.removeEventListener('animationend', face._agentSpinEnd);
        face._agentSpinEnd = null;
      }
      face.classList.remove('agent-face--spin');
      // Force restart if clicked mid-spin.
      void face.offsetWidth;
      face.classList.add('agent-face--spin');
      M.playSwooshSound();
      var onEnd = function (ev) {
        if (ev && ev.target !== face) return;
        face.classList.remove('agent-face--spin');
        face.removeEventListener('animationend', onEnd);
        face._agentSpinEnd = null;
      };
      face._agentSpinEnd = onEnd;
      face.addEventListener('animationend', onEnd);
    };
    M.clearFaceMotionClasses = function clearFaceMotionClasses(face) {
      if (!face || !face.classList) return;
      [
        'agent-face--spin',
        'agent-face--enter-roll',
        'agent-face--enter-bounce',
        'agent-face--enter-pop',
        'agent-face--enter-jump',
        'agent-face--motion-jump',
        'agent-face--fx-bounce',
        'agent-face--fx-nod',
        'agent-face--fx-tip',
        'agent-face--fx-pop',
        'agent-face--fx-shake',
        'agent-face--fx-sparkle',
        'agent-face--fx-wiggle',
        'agent-face--fx-squint',
        'agent-face--fx-breathe'
      ].forEach(function (cls) {
        face.classList.remove(cls);
      });
      face.removeAttribute('data-think');
      face.removeAttribute('data-idle-fx');
    };
    M.stopThinkingMotions = function stopThinkingMotions() {
      if (M.thinkingMotionTimer != null) {
        clearInterval(M.thinkingMotionTimer);
        M.thinkingMotionTimer = null;
      }
      if (M.thinkingMotionRow) {
        var face = M.thinkingMotionRow.querySelector('.agent-face');
        if (face) face.removeAttribute('data-think');
      }
      M.thinkingMotionRow = null;
      M.thinkingMotionLast = '';
    };
    M.pickNextThinkMotion = function pickNextThinkMotion() {
      var choices = M.THINK_MOTIONS.filter(function (m) {
        return m !== M.thinkingMotionLast;
      });
      if (!choices.length) choices = M.THINK_MOTIONS.slice();
      return M.pickOne(choices);
    };
    M.applyThinkMotion = function applyThinkMotion(face, motion) {
      if (!face) return;
      face.setAttribute('data-think', motion || 'glance');
    };
    M.startThinkingMotions = function startThinkingMotions(row) {
      M.stopThinkingMotions();
      if (!row) return;
      M.suppressFaceIdleMachine();
      M.thinkingMotionRow = row;
      // Keep the thinking mouth; only swap body/eye loops.
      M.setAssistantFaceEmotion(row, 'thinking', {
        animate: true,
        forceEnter: true,
        fromIdleMachine: true
      });
      var tick = function () {
        if (!M.thinkingMotionRow || !M.thinkingMotionRow.classList.contains('is-pending')) {
          M.stopThinkingMotions();
          return;
        }
        var face = M.thinkingMotionRow.querySelector('.agent-face');
        if (!face) {
          M.stopThinkingMotions();
          return;
        }
        // Typing takes over: glance at the composer instead of thinking loops.
        if (M.faceSm.typing) {
          if (face.getAttribute('data-emotion') !== 'lookDown') {
            M.setAssistantFaceEmotion(M.thinkingMotionRow, 'lookDown', {
              fromIdleMachine: true,
              smooth: true
            });
          }
          return;
        }
        // Stay on thinking emotion if something else changed it.
        if (face.getAttribute('data-emotion') !== 'thinking') {
          M.cancelFaceMorph(face);
          M.swapFaceEmotionClass(face, 'thinking');
          M.applyFaceAura(face, M.auraForEmotion('thinking'));
        }
        M.thinkingMotionLast = M.pickNextThinkMotion();
        M.applyThinkMotion(face, M.thinkingMotionLast);
      };
      tick();
      M.thinkingMotionTimer = setInterval(tick, 2100 + Math.floor(Math.random() * 900));
    };
    M.faceSmRand = function faceSmRand(min, max) {
      return min + Math.floor(Math.random() * (max - min + 1));
    };
    M.clearFaceIdleTimer = function clearFaceIdleTimer() {
      if (M.faceSm.timer != null) {
        clearTimeout(M.faceSm.timer);
        M.faceSm.timer = null;
      }
    };
    M.stopFaceIdleMachine = function stopFaceIdleMachine() {
      M.clearFaceIdleTimer();
      M.faceSmClearFx();
      M.cancelFaceMorph(M.faceSmFace());
      M.faceSm.state = null;
      M.faceSm.row = null;
      M.faceSm.suppressed = false;
      M.faceSm.resumeEmotion = null;
      M.faceSm.queue = null;
      M.faceSm.awayCount = 0;
      M.faceSm.lastState = null;
      M.faceSm.seq += 1;
    };
    M.suppressFaceIdleMachine = function suppressFaceIdleMachine() {
      M.faceSm.suppressed = true;
      M.clearFaceIdleTimer();
      M.faceSmClearFx();
      M.cancelFaceMorph(M.faceSmFace());
      M.faceSm.state = null;
      M.faceSm.queue = null;
      M.faceSm.awayCount = 0;
    };
    M.faceSmLiveRow = function faceSmLiveRow() {
      if (M.faceSm.row && M.faceSm.row.isConnected) {
        var live = M.faceSm.row.querySelector(
          '.agent-face:not(.is-frozen):not(.is-sick)'
        );
        if (live) return M.faceSm.row;
      }
      var face = M.getLiveAssistantFace();
      return face ? face.closest('.agent-msg--assistant') : null;
    };
    M.faceSmFace = function faceSmFace() {
      var row = M.faceSm.row;
      if (!row) return null;
      return row.querySelector('.agent-face:not(.is-frozen):not(.is-sick)');
    };
    M.faceSmClearFx = function faceSmClearFx() {
      var face = M.faceSmFace();
      if (!face) return;
      face.removeAttribute('data-idle-fx');
      face.classList.remove(
        'agent-face--fx-bounce',
        'agent-face--fx-nod',
        'agent-face--fx-tip',
        'agent-face--fx-pop',
        'agent-face--fx-shake',
        'agent-face--fx-sparkle',
        'agent-face--fx-wiggle',
        'agent-face--fx-squint',
        'agent-face--fx-breathe'
      );
    };
    M.faceSmPlayFx = function faceSmPlayFx(fx) {
      var face = M.faceSmFace();
      if (!face || !fx) return;
      M.faceSmClearFx();
      face.setAttribute('data-idle-fx', fx);
      var cls = 'agent-face--fx-' + fx;
      if (
        [
          'bounce',
          'nod',
          'tip',
          'pop',
          'shake',
          'sparkle',
          'wiggle',
          'squint',
          'breathe'
        ].indexOf(fx) !== -1
      ) {
        // Restart one-shot / loop class animations.
        void face.offsetWidth;
        face.classList.add(cls);
      }
      if (fx === 'sparkle') {
        M.faceSmSpawnSparkles(face);
      }
    };
    M.faceSmSpawnSparkles = function faceSmSpawnSparkles(face) {
      if (!face) return;
      // Anchor to the face (not viewport coords). getBoundingClientRect can be
      // 0×0 at top-left when the face was just mounted / not laid out yet.
      var stale = face.querySelectorAll('.agent-face-sparkle-layer');
      for (var s = 0; s < stale.length; s++) {
        if (stale[s].parentNode) stale[s].parentNode.removeChild(stale[s]);
      }
      var layer = S.el('span', 'agent-face-sparkle-layer');
      layer.setAttribute('aria-hidden', 'true');
      var count = 5 + Math.floor(Math.random() * 3);
      for (var i = 0; i < count; i++) {
        var speck = S.el('span', 'agent-face-sparkle');
        var ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        var dist = 14 + Math.random() * 18;
        speck.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        speck.style.setProperty('--dy', Math.sin(ang) * dist - 6 + 'px');
        speck.style.animationDelay = Math.random() * 0.12 + 's';
        layer.appendChild(speck);
      }
      face.appendChild(layer);
      global.setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }, 900);
    };
    M.faceSmPickWeighted = function faceSmPickWeighted(edges) {
      if (!edges || !edges.length) return null;
      var total = 0;
      for (var i = 0; i < edges.length; i++) total += edges[i].w || 0;
      if (total <= 0) return edges[0];
      var roll = Math.random() * total;
      var acc = 0;
      for (var j = 0; j < edges.length; j++) {
        acc += edges[j].w || 0;
        if (roll <= acc) return edges[j];
      }
      return edges[edges.length - 1];
    };
    M.faceSmApply = function faceSmApply(stateName, options) {
      options = options || {};
      var def = M.FACE_SM_STATES[stateName];
      var row = M.faceSm.row;
      if (!def || !row) return;
      M.faceSm.lastState = M.faceSm.state;
      M.faceSm.state = stateName;
      if (stateName === 'smile' || stateName === 'lookDown') {
        M.faceSm.awayCount = 0;
      } else {
        M.faceSm.awayCount += 1;
      }
      var face = row.querySelector('.agent-face');
      var prevMood = face && face.getAttribute('data-emotion');
      var sameMood = prevMood === def.emotion;
      // Same emotion (smile → nod / arrival smile): never re-commit the emotion
      // class — that restarts bob/glow and read as jitter.
      if (sameMood && face && !face.classList.contains('is-frozen')) {
        if (options.enter) {
          M.applyFaceEnterMotion(face, def.emotion);
        }
        if (def.fx) M.faceSmPlayFx(def.fx);
        else if (!options.enter) M.faceSmClearFx();
        return;
      }
      var fastPose =
        def.emotion === 'wink' || prevMood === 'wink';
      M.setAssistantFaceEmotion(row, def.emotion, {
        animate: !!options.enter,
        forceEnter: !!options.enter,
        fromIdleMachine: true,
        smooth: !options.enter,
        fast: fastPose,
        onApplied: function () {
          if (def.fx) M.faceSmPlayFx(def.fx);
          else M.faceSmClearFx();
        }
      });
    };
    M.faceSmScheduleNext = function faceSmScheduleNext(fromState) {
      M.clearFaceIdleTimer();
      if (M.faceSm.suppressed || M.faceSm.typing || !M.faceSm.row) return;
      var def = M.FACE_SM_STATES[fromState];
      if (!def || !def.holdMax) return;
      var delay = M.faceSmRand(def.holdMin, def.holdMax);
      // Never cut a pose short of the morph window — that was the jitter.
      delay = Math.max(M.FACE_SM_MIN_HOLD_MS, delay);
      var seq = M.faceSm.seq;
      M.faceSm.timer = setTimeout(function () {
        if (seq !== M.faceSm.seq) return;
        M.faceSmAdvance(fromState);
      }, delay);
    };
    M.faceSmEnqueue = function faceSmEnqueue(states) {
      if (!states || !states.length) return;
      M.faceSm.queue = (M.faceSm.queue || []).concat(states);
    };
    M.faceSmPickNext = function faceSmPickNext(fromState) {
      if (M.faceSm.queue && M.faceSm.queue.length) {
        return M.faceSm.queue.shift();
      }
      if (M.faceSm.awayCount >= M.FACE_SM_MAX_AWAY && fromState !== 'smile') {
        return 'smile';
      }
      var edges = M.FACE_SM_TRANSITIONS[fromState];
      if (!edges || !edges.length) return 'smile';
      // Avoid immediate repeat of the same digression when smiling.
      var filtered = edges;
      if (fromState === 'smile' && M.faceSm.lastState) {
        var noRepeat = edges.filter(function (e) {
          if (e.seq) return e.seq[0] !== M.faceSm.lastState;
          return e.to !== M.faceSm.lastState;
        });
        if (noRepeat.length) filtered = noRepeat;
      }
      var pick = M.faceSmPickWeighted(filtered);
      if (!pick) return 'smile';
      if (pick.seq && pick.seq.length) {
        M.faceSmEnqueue(pick.seq.slice(1));
        return pick.seq[0];
      }
      return pick.to || 'smile';
    };
    M.faceSmAdvance = function faceSmAdvance(fromState) {
      if (M.faceSm.suppressed || M.faceSm.typing || !M.faceSm.row) return;
      var next = M.faceSmPickNext(fromState);
      if (!M.FACE_SM_STATES[next]) next = 'smile';
      M.faceSmApply(next);
      M.faceSmScheduleNext(next);
    };
    M.faceSmPickArrival = function faceSmPickArrival() {
      var script = M.pickOne(M.FACE_SM_ARRIVALS) || ['smile'];
      return script.slice();
    };
    M.startFaceIdleMachine = function startFaceIdleMachine(row, options) {
      options = options || {};
      M.clearFaceIdleTimer();
      M.faceSmClearFx();
      M.faceSm.seq += 1;
      M.faceSm.suppressed = false;
      M.faceSm.row = row || null;
      M.faceSm.state = null;
      M.faceSm.lastState = null;
      M.faceSm.awayCount = 0;
      M.faceSm.queue = null;
      if (!M.faceSm.row) return;

      if (M.faceSm.typing) {
        M.faceSmApply('lookDown');
        return;
      }

      // Explicit start, or quiet resume (wake / typing end): settle on smile.
      // Flashy arrivals only when a new reply just landed (enter: true).
      if (options.startState) {
        M.faceSmApply(options.startState, { enter: options.enter !== false });
        M.faceSmScheduleNext(options.startState);
        M.scheduleFaceSleep();
        return;
      }
      if (options.enter === false) {
        M.faceSmApply('smile', { enter: false });
        M.faceSmScheduleNext('smile');
        M.scheduleFaceSleep();
        return;
      }
      var arrival = M.faceSmPickArrival();
      var first = arrival.shift();
      if (arrival.length) M.faceSmEnqueue(arrival);
      M.faceSmApply(first, { enter: true });
      M.faceSmScheduleNext(first);
      M.scheduleFaceSleep();
    };
    M.setFaceIdleTyping = function setFaceIdleTyping(isTyping) {
      var next = !!isTyping;
      if (M.faceSm.typing === next) {
        // Still refresh lookDown if a new live face appeared while drafting.
        if (next) {
          var rowFresh = M.faceSmLiveRow() || M.thinkingMotionRow;
          if (rowFresh && M.faceSm.state !== 'lookDown') {
            M.faceSm.row = rowFresh;
            M.clearFaceIdleTimer();
            M.faceSmClearFx();
            M.setAssistantFaceEmotion(rowFresh, 'lookDown', {
              fromIdleMachine: true,
              smooth: true
            });
            M.faceSm.state = 'lookDown';
          }
        }
        return;
      }
      M.faceSm.typing = next;

      var row = M.faceSmLiveRow() || M.thinkingMotionRow;
      if (!row) return;
      M.faceSm.row = row;

      if (M.faceSm.typing) {
        M.wakeFaceFromSleep({ resume: false, reschedule: false });
        M.clearFaceIdleTimer();
        M.faceSm.queue = null;
        M.faceSmClearFx();
        var faceNow = row.querySelector('.agent-face');
        var current = faceNow && faceNow.getAttribute('data-emotion');
        if (current && current !== 'lookDown') {
          M.faceSm.resumeEmotion = current;
        }
        M.setAssistantFaceEmotion(row, 'lookDown', {
          fromIdleMachine: true,
          smooth: true
        });
        M.faceSm.state = 'lookDown';
        return;
      }

      // Draft cleared — resume choreography unless thinking/sad hold the face.
      if (M.faceSm.suppressed) {
        if (
          M.thinkingMotionRow &&
          M.thinkingMotionRow === row &&
          M.thinkingMotionRow.classList.contains('is-pending')
        ) {
          M.setAssistantFaceEmotion(row, 'thinking', {
            fromIdleMachine: true,
            smooth: true
          });
          var face = row.querySelector('.agent-face');
          if (face) M.applyThinkMotion(face, M.thinkingMotionLast || 'glance');
        } else if (M.faceSm.resumeEmotion) {
          M.setAssistantFaceEmotion(row, M.faceSm.resumeEmotion, {
            fromIdleMachine: true,
            smooth: true
          });
        }
        M.faceSm.resumeEmotion = null;
        M.scheduleFaceSleep();
        return;
      }

      M.faceSm.resumeEmotion = null;
      M.faceSm.queue = null;
      M.faceSm.awayCount = 0;
      M.faceSmApply('smile');
      M.faceSmScheduleNext('smile');
      M.scheduleFaceSleep();
    };
    M.refreshComposerTypingGaze = function refreshComposerTypingGaze() {
      var hasText = !!(M.input.value && String(M.input.value).replace(/\s+/g, ''));
      M.setFaceIdleTyping(hasText);
    };
    M.handOffToFaceIdleMachine = function handOffToFaceIdleMachine(row, emotion, options) {
      options = options || {};
      if (!row) return;
      var mood = emotion || 'happy';
      if (!M.FACE_IDLE_ELIGIBLE[mood]) {
        M.suppressFaceIdleMachine();
        M.faceSm.row = row;
        return;
      }
      // Prefer varied arrival scripts; honor an explicit start when provided.
      M.startFaceIdleMachine(row, {
        startState: options.startState || null,
        enter: options.enter !== false
      });
    };
    M.applyFaceEnterMotion = function applyFaceEnterMotion(face, emotion) {
      if (!face) return;
      M.clearFaceMotionClasses(face);
      var motion = M.pickFaceEnterMotion(emotion);
      if (!motion) {
        if (emotion === 'excited' || (emotion === 'happy' && Math.random() < 0.35)) {
          face.classList.add('agent-face--motion-jump');
        }
        return;
      }
      var enterCls = 'agent-face--enter-' + motion;
      face.classList.add(enterCls);
      if (motion === 'jump' || emotion === 'excited') {
        face.classList.add('agent-face--motion-jump');
      }
      var onEnd = function (ev) {
        if (ev && ev.target !== face) return;
        face.classList.remove(enterCls);
        face.removeEventListener('animationend', onEnd);
      };
      face.addEventListener('animationend', onEnd);
    };
    M.clearFaceInlineMorph = function clearFaceInlineMorph(face) {
      if (!face || !face.style) return;
      face.style.transition = '';
      face.style.transform = '';
      face.style.animation = '';
    };
    M.clearFaceFeatureInline = function clearFaceFeatureInline(face) {
      if (!face || !face.querySelectorAll) return;
      var nodes = face.querySelectorAll(M.FACE_FEATURE_SEL);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!node.style) continue;
        node.style.transition = '';
        node.style.animation = '';
        node.style.transform = '';
        node.style.opacity = '';
      }
    };
    M.freezeFaceFeatures = function freezeFaceFeatures(face) {
      if (!face || !face.querySelectorAll) return;
      var nodes = face.querySelectorAll(M.FACE_FEATURE_SEL);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        try {
          var cs = global.getComputedStyle(node);
          var t = cs.transform;
          node.style.transition = 'none';
          node.style.animation = 'none';
          node.style.transform = t && t !== 'none' ? t : 'none';
        } catch (e) {
          /* ignore */
        }
      }
    };
    M.cancelFaceMorph = function cancelFaceMorph(face) {
      if (!face) return;
      if (face._morphTimer != null) {
        clearTimeout(face._morphTimer);
        face._morphTimer = null;
      }
      if (face._settleTimer != null) {
        clearTimeout(face._settleTimer);
        face._settleTimer = null;
      }
      if (face._winkSnapTimer != null) {
        clearTimeout(face._winkSnapTimer);
        face._winkSnapTimer = null;
      }
      face.classList.remove('is-morphing', 'is-settling', 'is-pose-tween', 'is-wink-snap');
      M.clearFaceInlineMorph(face);
      M.clearFaceFeatureInline(face);
    };
    M.prefersReducedFaceMotion = function prefersReducedFaceMotion() {
      try {
        return !!(
          global.matchMedia &&
          global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
      } catch (e) {
        return false;
      }
    };
    M.swapFaceEmotionClass = function swapFaceEmotionClass(face, mood) {
      if (!face) return;
      for (var i = 0; i < M.FACE_EMOTIONS.length; i++) {
        face.classList.remove('agent-face--' + M.FACE_EMOTIONS[i]);
      }
      face.classList.add('agent-face');
      face.classList.add('agent-face--' + mood);
      face.setAttribute('data-emotion', mood);
    };
    M.setAssistantFaceEmotion = function setAssistantFaceEmotion(row, emotion, options) {
      if (!row) return;
      options = options || {};
      var mood = emotion || 'neutral';
      if (M.FACE_EMOTIONS.indexOf(mood) === -1) mood = 'neutral';
      var aura = M.auraForEmotion(
        mood,
        options.color != null ? options.color : options.aura
      );
      var face = row.querySelector('.agent-face');
      var isNew = !face;
      if (face && face.classList.contains('is-sick')) return;
      if (!face) {
        face = M.createAssistantFace(mood, aura);
        row.insertBefore(face, row.firstChild);
      }

      var prevMood = face.getAttribute('data-emotion');
      var canSmooth =
        options.smooth === true &&
        !isNew &&
        !options.forceEnter &&
        prevMood &&
        prevMood !== mood &&
        !face.classList.contains('agent-face--spin') &&
        !M.prefersReducedFaceMotion();

      function commitEmotion(applyEnter) {
        M.clearFaceMotionClasses(face);
        M.swapFaceEmotionClass(face, mood);
        M.applyFaceAura(face, aura);
        face.classList.remove('is-frozen');
        face.classList.remove('is-sick');
        M.clearFaceAsleepVisual(face);
        row.setAttribute('data-emotion', mood);
        M.applyAuraCssVars(row, aura, M.paletteForAura(aura));
        if (mood !== 'thinking') {
          face.removeAttribute('data-think');
        }
        if (applyEnter && options.animate !== false && (isNew || options.forceEnter)) {
          M.applyFaceEnterMotion(face, mood);
        } else if (mood === 'excited' && !canSmooth) {
          face.classList.add('agent-face--motion-jump');
        }
        if (typeof options.onApplied === 'function') {
          options.onApplied(face);
        }
      }

      function finishExternalHandoff() {
        if (!options.fromIdleMachine) {
          if (mood === 'thinking' || !M.FACE_IDLE_ELIGIBLE[mood]) {
            M.suppressFaceIdleMachine();
            M.faceSm.row = row;
          } else if (options.idleHandOff !== false) {
            M.handOffToFaceIdleMachine(row, mood, {
              startState: options.idleStart || null,
              enter: false
            });
          }
        }
      }

      if (!canSmooth) {
        M.cancelFaceMorph(face);
        commitEmotion(true);
        finishExternalHandoff();
        return;
      }

      // Smooth path: freeze animated features → tween to rest → swap pose →
      // tween into the new static pose → release animations together.
      M.cancelFaceMorph(face);
      var settleMs = options.fast ? M.FACE_POSE_TWEEN_FAST_MS : M.FACE_MORPH_SETTLE_MS;
      var tweenMs = options.fast ? M.FACE_POSE_TWEEN_FAST_MS : M.FACE_POSE_TWEEN_MS;
      face.classList.add('is-morphing', 'is-pose-tween');
      M.freezeFaceFeatures(face);
      try {
        var cs = global.getComputedStyle(face);
        face.style.animation = 'none';
        face.style.transition = 'none';
        face.style.transform =
          cs.transform && cs.transform !== 'none' ? cs.transform : 'none';
        void face.offsetWidth;
        face.style.transition =
          'transform ' +
          settleMs / 1000 +
          's cubic-bezier(0.33, 1, 0.68, 1)';
        face.style.transform = 'translateY(0) scale(1) rotate(0deg)';
        // After a frame lock, release frozen feature transforms so they ease
        // toward the current emotion's static pose (no keyframe fight).
        void face.offsetWidth;
        var frozen = face.querySelectorAll(M.FACE_FEATURE_SEL);
        for (var fi = 0; fi < frozen.length; fi++) {
          frozen[fi].style.transition = '';
          frozen[fi].style.animation = '';
          frozen[fi].style.transform = '';
        }
      } catch (e) {
        /* ignore style freeze failures */
      }

      var morphSeq = M.faceSm.seq;
      face._morphTimer = setTimeout(function () {
        face._morphTimer = null;
        if (morphSeq !== M.faceSm.seq) {
          M.cancelFaceMorph(face);
          return;
        }
        M.clearFaceInlineMorph(face);
        commitEmotion(false);
        face.classList.remove('is-morphing');
        face.classList.add('is-settling');
        // Stay in is-pose-tween so the new emotion's static transforms ease in
        // before blink / bob loops restart — keeps lids synchronized.
        face._settleTimer = setTimeout(function () {
          face._settleTimer = null;
          if (morphSeq !== M.faceSm.seq) return;
          face.classList.remove('is-settling', 'is-pose-tween');
          M.clearFaceFeatureInline(face);
          // Restart one-shot fx that were applied while bob loops were suppressed.
          var fx = face.getAttribute('data-idle-fx');
          if (
            fx &&
            [
              'bounce',
              'nod',
              'tip',
              'pop',
              'shake',
              'sparkle',
              'wiggle',
              'squint',
              'breathe'
            ].indexOf(fx) !== -1
          ) {
            var fxCls = 'agent-face--fx-' + fx;
            face.classList.remove(fxCls);
            void face.offsetWidth;
            face.classList.add(fxCls);
          }
        }, tweenMs);
        finishExternalHandoff();
      }, settleMs);
    };
    M.clearAgentPointTarget = function clearAgentPointTarget() {
      var prev = document.querySelectorAll('.is-agent-point-target');
      for (var i = 0; i < prev.length; i++) {
        prev[i].classList.remove('is-agent-point-target');
      }
      M.pointAtState.targetEl = null;
    };
    },
    run: function (M) {
    M.faceGradientSeq = 0;
    M.FACE_SPIN_PUKE_AT = 5;
    M.FACE_SPIN_CLICK_WINDOW_MS = 3500;
    M.FACE_SICK_RECOVER_MS = 5000;
    M.FACE_SLEEP_IDLE_MS = 60000;
    M.faceSleepTimer = null;
    M.FACE_SICK_PALETTE = { hi: '#f2f6a8', mid: '#c9d83a', lo: '#9aa820' };
    M.FACE_PUKE_COLORS = [
      '#d4e040',
      '#c5d63a',
      '#e8e060',
      '#b8c92a',
      '#cfd84a',
      '#a8b830',
      '#dce86a',
      '#9cb82a',
      '#b0c038'
    ];
    M.THINK_MOTIONS = ['glance', 'nod', 'sway', 'search', 'ponder', 'squint', 'bob'];
    M.thinkingMotionTimer = null;
    M.thinkingMotionRow = null;
    M.thinkingMotionLast = '';
    M.FACE_SM_MAX_AWAY = 1;
    M.FACE_MORPH_SETTLE_MS = 160;
    M.FACE_POSE_TWEEN_MS = 260;
    M.FACE_POSE_TWEEN_FAST_MS = 90;
    M.FACE_SM_MIN_HOLD_MS = M.FACE_MORPH_SETTLE_MS + M.FACE_POSE_TWEEN_MS + 280;
    M.FACE_FEATURE_SEL =
      '.agent-face-eyes, .agent-face-eye, .agent-face-brow, .agent-face-cheek, .agent-face-shine';
    M.FACE_SM_STATES = {
      wink: { emotion: 'wink', holdMin: 700, holdMax: 950 },
      winkAlt: { emotion: 'wink', holdMin: 700, holdMax: 950, fx: 'winkRight' },
      smile: { emotion: 'happy', holdMin: 5200, holdMax: 11000 },
      grin: { emotion: 'excited', holdMin: 900, holdMax: 1400, fx: 'bounce' },
      tongue: { emotion: 'tongue', holdMin: 1100, holdMax: 1600, fx: 'wiggle' },
      curious: { emotion: 'curious', holdMin: 1400, holdMax: 2200, fx: 'tip' },
      lookLeft: { emotion: 'lookLeft', holdMin: 1100, holdMax: 1800 },
      lookRight: { emotion: 'lookRight', holdMin: 1100, holdMax: 1800 },
      lookUp: { emotion: 'lookUp', holdMin: 1200, holdMax: 1900 },
      bounce: { emotion: 'happy', holdMin: 700, holdMax: 1100, fx: 'bounce' },
      nod: { emotion: 'happy', holdMin: 800, holdMax: 1200, fx: 'nod' },
      sparkle: { emotion: 'happy', holdMin: 900, holdMax: 1300, fx: 'sparkle' },
      rest: { emotion: 'happy', holdMin: 1800, holdMax: 2800, fx: 'breathe' },
      lookDown: { emotion: 'lookDown', holdMin: 0, holdMax: 0 }
    };
    M.FACE_SM_TRANSITIONS = {
      smile: [
        { to: 'smile', w: 40 },
        { to: 'nod', w: 14 },
        { to: 'rest', w: 12 },
        { to: 'bounce', w: 8 },
        { to: 'lookLeft', w: 6 },
        { to: 'lookRight', w: 6 },
        { to: 'lookUp', w: 5 },
        { to: 'sparkle', w: 3 },
        { to: 'curious', w: 2 },
        { to: 'wink', w: 1 },
        { to: 'tongue', w: 1 },
        { to: 'grin', w: 1 }
      ],
      wink: [{ to: 'smile', w: 1 }],
      winkAlt: [{ to: 'smile', w: 1 }],
      grin: [{ to: 'smile', w: 1 }],
      tongue: [{ to: 'smile', w: 1 }],
      curious: [{ to: 'smile', w: 1 }],
      lookLeft: [{ to: 'smile', w: 1 }],
      lookRight: [{ to: 'smile', w: 1 }],
      lookUp: [{ to: 'smile', w: 1 }],
      bounce: [{ to: 'smile', w: 1 }],
      nod: [{ to: 'smile', w: 1 }],
      sparkle: [{ to: 'smile', w: 1 }],
      rest: [{ to: 'smile', w: 1 }]
    };
    M.FACE_SM_ARRIVALS = [
      ['smile'],
      ['smile'],
      ['smile'],
      ['nod', 'smile'],
      ['bounce', 'smile'],
      ['sparkle', 'smile'],
      ['wink', 'smile']
    ];
    M.faceSm = {
      state: null,
      timer: null,
      row: null,
      typing: false,
      suppressed: false,
      seq: 0,
      queue: null,
      awayCount: 0,
      lastState: null,
      /** Emotion to restore after lookDown when idle machine is suppressed. */
      resumeEmotion: null
    };
    M.POINT_HOLD_MS = 2800;
    M.POINT_BLINK_MS = 2600;
    M.pointAtState = {
      seq: 0,
      clearTimer: null,
      faceTimer: null,
      targetEl: null,
      gloveEl: null
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
