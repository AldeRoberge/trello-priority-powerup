/**
 * CelebrationEffects — brief visual overlays + Web Audio stingers.
 * Used by completion UI (fireworks) and the agent (trigger_effect).
 */
(function (global) {
  'use strict';

  var ROOT_ATTR = 'data-tp-fx';
  var audioCtx = null;

  var EFFECT_META = {
    fireworks: { label: 'Feux d\'artifice', ms: 1900 },
    confetti: { label: 'Confettis', ms: 2600 },
    hearts: { label: 'C\u0153urs', ms: 2800 },
    sparkles: { label: '\u00c9tincelles', ms: 1800 },
    shooting_stars: { label: '\u00c9toiles filantes', ms: 2000 },
    bubbles: { label: 'Bulles', ms: 3000 },
    aurora: { label: 'Aurore', ms: 3000 },
    balloons: { label: 'Ballons', ms: 3200 },
    petals: { label: 'P\u00e9tales', ms: 3400 },
    rainbow: { label: 'Arc-en-ciel', ms: 2600 },
    disco: { label: 'Disco', ms: 2400 }
  };

  var EFFECT_ALIASES = {
    firework: 'fireworks',
    feux: 'fireworks',
    confettis: 'confetti',
    heart: 'hearts',
    coeurs: 'hearts',
    coeur: 'hearts',
    sparkle: 'sparkles',
    etincelles: 'sparkles',
    stars: 'shooting_stars',
    star: 'shooting_stars',
    etoiles: 'shooting_stars',
    bubble: 'bubbles',
    bulles: 'bubbles',
    aurore: 'aurora',
    balloon: 'balloons',
    ballons: 'balloons',
    petal: 'petals',
    petales: 'petals',
    cherry_blossoms: 'petals',
    arc_en_ciel: 'rainbow',
    party: 'disco',
    laser: 'disco'
  };

  var COLORS = {
    party: ['#22a06b', '#4bce97', '#f5cd47', '#ff8f73', '#579dff', '#9f8fef', '#fff'],
    hearts: ['#ff8f73', '#ff5c8a', '#e5688f', '#ffb3c7', '#f87171'],
    cool: ['#579dff', '#4bce97', '#9f8fef', '#6ee7b7', '#93c5fd'],
    warm: ['#f5cd47', '#ff8f73', '#fb923c', '#fbbf24', '#fff']
  };

  function prefersReducedMotion() {
    try {
      return !!(
        global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    } catch (e) {
      return false;
    }
  }

  function listEffects() {
    return Object.keys(EFFECT_META);
  }

  function normalizeEffectId(raw) {
    if (raw == null) return null;
    var key = String(raw)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (!key) return null;
    if (EFFECT_META[key]) return key;
    if (EFFECT_ALIASES[key]) return EFFECT_ALIASES[key];
    return null;
  }

  function effectLabel(id) {
    var meta = EFFECT_META[id];
    return meta ? meta.label : id;
  }

  function ensureAudioCtx() {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function playTones(tones, options) {
    options = options || {};
    try {
      var ctx = ensureAudioCtx();
      if (!ctx) return;
      var t0 = ctx.currentTime;
      var dest = ctx.destination;
      if (options.lowpass) {
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(options.lowpass, t0);
        filter.Q.setValueAtTime(options.q != null ? options.q : 0.7, t0);
        filter.connect(ctx.destination);
        dest = filter;
      }
      tones.forEach(function (tone) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var delay = tone.delay || 0;
        var dur = tone.dur || 0.2;
        var peak = tone.peak != null ? tone.peak : 0.045;
        osc.type = tone.type || 'sine';
        osc.frequency.setValueAtTime(tone.freq, t0 + delay);
        if (tone.freqEnd != null) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(20, tone.freqEnd),
            t0 + delay + dur
          );
        }
        gain.gain.setValueAtTime(0.0001, t0 + delay);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0002, peak),
          t0 + delay + (tone.attack != null ? tone.attack : 0.02)
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t0 + delay);
        osc.stop(t0 + delay + dur + 0.04);
      });
    } catch (e) {
      /* ignore audio failures */
    }
  }

  function playNoiseBurst(options) {
    options = options || {};
    try {
      var ctx = ensureAudioCtx();
      if (!ctx || typeof ctx.createBuffer !== 'function') return;
      var dur = options.dur != null ? options.dur : 0.18;
      var buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = options.filterType || 'bandpass';
      filter.frequency.value = options.freq != null ? options.freq : 1800;
      filter.Q.value = options.q != null ? options.q : 1.2;
      var gain = ctx.createGain();
      var t0 = ctx.currentTime + (options.delay || 0);
      var peak = options.peak != null ? options.peak : 0.04;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) {
      /* ignore */
    }
  }

  function playEffectSound(id) {
    switch (id) {
      case 'fireworks':
        playNoiseBurst({ delay: 0.05, dur: 0.16, freq: 2200, peak: 0.05 });
        playNoiseBurst({ delay: 0.28, dur: 0.2, freq: 1400, peak: 0.045 });
        playNoiseBurst({ delay: 0.55, dur: 0.22, freq: 900, peak: 0.04 });
        playTones([
          { freq: 740, delay: 0.08, dur: 0.35, peak: 0.035, type: 'triangle' },
          { freq: 988, delay: 0.32, dur: 0.4, peak: 0.032, type: 'triangle' },
          { freq: 1175, delay: 0.6, dur: 0.45, peak: 0.028, type: 'sine' }
        ]);
        break;
      case 'confetti':
        playTones(
          [
            { freq: 523.25, delay: 0, dur: 0.14, peak: 0.04, type: 'triangle' },
            { freq: 659.25, delay: 0.07, dur: 0.14, peak: 0.042 },
            { freq: 783.99, delay: 0.14, dur: 0.16, peak: 0.045 },
            { freq: 1046.5, delay: 0.22, dur: 0.28, peak: 0.04 },
            { freq: 1318.5, delay: 0.34, dur: 0.32, peak: 0.03, type: 'triangle' }
          ],
          { lowpass: 4200 }
        );
        break;
      case 'hearts':
        playTones(
          [
            { freq: 349.23, delay: 0, dur: 0.45, peak: 0.04, type: 'sine' },
            { freq: 440, delay: 0.08, dur: 0.5, peak: 0.038 },
            { freq: 523.25, delay: 0.18, dur: 0.55, peak: 0.035 },
            { freq: 659.25, delay: 0.42, dur: 0.5, peak: 0.028, type: 'triangle' }
          ],
          { lowpass: 2800 }
        );
        break;
      case 'sparkles':
        playTones([
          { freq: 1760, delay: 0, dur: 0.18, peak: 0.028, type: 'sine', attack: 0.005 },
          { freq: 2093, delay: 0.1, dur: 0.16, peak: 0.026, attack: 0.005 },
          { freq: 2637, delay: 0.2, dur: 0.2, peak: 0.024, attack: 0.005 },
          { freq: 3136, delay: 0.34, dur: 0.22, peak: 0.02, attack: 0.005 },
          { freq: 2349, delay: 0.5, dur: 0.18, peak: 0.022, attack: 0.005 }
        ]);
        break;
      case 'shooting_stars':
        playTones([
          {
            freq: 1880,
            freqEnd: 420,
            delay: 0.05,
            dur: 0.55,
            peak: 0.03,
            type: 'sine',
            attack: 0.01
          },
          { freq: 1318.5, delay: 0.45, dur: 0.35, peak: 0.028, type: 'triangle' },
          { freq: 1760, delay: 0.7, dur: 0.4, peak: 0.022 }
        ]);
        break;
      case 'bubbles':
        playTones(
          [
            { freq: 420, delay: 0, dur: 0.16, peak: 0.03, type: 'sine', freqEnd: 620 },
            { freq: 380, delay: 0.22, dur: 0.18, peak: 0.028, freqEnd: 560 },
            { freq: 460, delay: 0.48, dur: 0.2, peak: 0.03, freqEnd: 700 },
            { freq: 340, delay: 0.78, dur: 0.22, peak: 0.026, freqEnd: 520 }
          ],
          { lowpass: 1600 }
        );
        break;
      case 'aurora':
        playTones(
          [
            { freq: 196, delay: 0, dur: 1.4, peak: 0.03, type: 'sine' },
            { freq: 246.94, delay: 0.2, dur: 1.5, peak: 0.025, type: 'triangle' },
            { freq: 293.66, delay: 0.45, dur: 1.6, peak: 0.022 },
            { freq: 392, delay: 0.9, dur: 1.2, peak: 0.018 }
          ],
          { lowpass: 1200, q: 0.4 }
        );
        break;
      case 'balloons':
        playTones([
          { freq: 392, delay: 0, dur: 0.18, peak: 0.04, type: 'triangle' },
          { freq: 494, delay: 0.2, dur: 0.18, peak: 0.038, type: 'triangle' },
          { freq: 587, delay: 0.42, dur: 0.2, peak: 0.036, type: 'triangle' },
          { freq: 740, delay: 0.68, dur: 0.28, peak: 0.03 }
        ]);
        break;
      case 'petals':
        playTones(
          [
            { freq: 523.25, delay: 0, dur: 0.5, peak: 0.03, type: 'sine' },
            { freq: 587.33, delay: 0.25, dur: 0.55, peak: 0.028 },
            { freq: 698.46, delay: 0.55, dur: 0.6, peak: 0.026, type: 'triangle' },
            { freq: 880, delay: 0.95, dur: 0.7, peak: 0.022 }
          ],
          { lowpass: 2400 }
        );
        break;
      case 'rainbow':
        playTones([
          { freq: 261.63, delay: 0, dur: 0.22, peak: 0.038 },
          { freq: 293.66, delay: 0.12, dur: 0.22, peak: 0.038 },
          { freq: 329.63, delay: 0.24, dur: 0.22, peak: 0.038 },
          { freq: 349.23, delay: 0.36, dur: 0.22, peak: 0.038 },
          { freq: 392, delay: 0.48, dur: 0.22, peak: 0.038 },
          { freq: 440, delay: 0.6, dur: 0.22, peak: 0.038 },
          { freq: 493.88, delay: 0.72, dur: 0.28, peak: 0.036 },
          { freq: 523.25, delay: 0.9, dur: 0.45, peak: 0.034, type: 'triangle' }
        ]);
        break;
      case 'disco':
        playTones([
          { freq: 110, delay: 0, dur: 0.12, peak: 0.05, type: 'square', attack: 0.005 },
          { freq: 146.83, delay: 0.18, dur: 0.12, peak: 0.045, type: 'square', attack: 0.005 },
          { freq: 110, delay: 0.36, dur: 0.12, peak: 0.05, type: 'square', attack: 0.005 },
          { freq: 174.61, delay: 0.54, dur: 0.14, peak: 0.042, type: 'square', attack: 0.005 },
          { freq: 659.25, delay: 0.1, dur: 0.1, peak: 0.022, type: 'triangle' },
          { freq: 783.99, delay: 0.4, dur: 0.1, peak: 0.022, type: 'triangle' },
          { freq: 987.77, delay: 0.7, dur: 0.16, peak: 0.02, type: 'triangle' }
        ]);
        playNoiseBurst({ delay: 0.05, dur: 0.08, freq: 3000, peak: 0.025, filterType: 'highpass' });
        playNoiseBurst({ delay: 0.4, dur: 0.08, freq: 2800, peak: 0.022, filterType: 'highpass' });
        break;
      default:
        break;
    }
  }

  function clearEffects(rootEl) {
    try {
      var root = rootEl || (typeof document !== 'undefined' ? document.body : null);
      if (!root || !root.querySelectorAll) return;
      var nodes = root.querySelectorAll('[' + ROOT_ATTR + ']');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function makeRoot(effectId, mount) {
    var overlay = document.createElement('div');
    overlay.className = 'tp-fx-root tp-fx--' + effectId;
    overlay.setAttribute(ROOT_ATTR, effectId);
    overlay.setAttribute('aria-hidden', 'true');
    mount.appendChild(overlay);
    return overlay;
  }

  function scheduleClear(overlay, ms) {
    setTimeout(function () {
      try {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      } catch (e) {
        /* ignore */
      }
    }, ms);
  }

  function pick(arr, i) {
    return arr[i % arr.length];
  }

  function buildFireworks(overlay) {
    var burstCount = 6;
    var sparks = 14;
    var colors = COLORS.party;
    for (var b = 0; b < burstCount; b++) {
      var burst = document.createElement('div');
      burst.className = 'tp-fx-firework-burst';
      burst.style.setProperty('--burst-x', 14 + (b % 3) * 32 + ((b % 3) === 1 ? 4 : 0) + '%');
      burst.style.setProperty('--burst-y', 18 + Math.floor(b / 3) * 34 + (b % 2) * 10 + '%');
      burst.style.setProperty('--burst-delay', b * 0.1 + 's');
      for (var s = 0; s < sparks; s++) {
        var spark = document.createElement('span');
        spark.className = 'tp-fx-firework-spark';
        spark.style.setProperty('--spark-angle', (360 / sparks) * s + b * 11 + 'deg');
        spark.style.setProperty('--spark-dist', 52 + ((s + b) % 4) * 16 + 'px');
        spark.style.setProperty('--spark-color', pick(colors, s + b));
        spark.style.setProperty('--spark-delay', b * 0.1 + s * 0.01 + 's');
        burst.appendChild(spark);
      }
      overlay.appendChild(burst);
    }
  }

  function buildConfetti(overlay) {
    var colors = COLORS.party;
    for (var i = 0; i < 48; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-confetti-piece' + (i % 4 === 0 ? ' is-round' : '');
      el.style.setProperty('--x', rand(2, 98) + '%');
      el.style.setProperty('--w', rand(5, 11) + 'px');
      el.style.setProperty('--h', rand(8, 16) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.65) + 's');
      el.style.setProperty('--dur', rand(1.8, 2.7) + 's');
      el.style.setProperty('--drift', rand(-70, 70) + 'px');
      el.style.setProperty('--rot', rand(0, 360) + 'deg');
      overlay.appendChild(el);
    }
  }

  function buildHearts(overlay) {
    var colors = COLORS.hearts;
    for (var i = 0; i < 22; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-heart';
      el.style.setProperty('--x', rand(8, 92) + '%');
      el.style.setProperty('--size', rand(14, 28) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.8) + 's');
      el.style.setProperty('--dur', rand(2.1, 2.9) + 's');
      el.style.setProperty('--drift', rand(-50, 50) + 'px');
      overlay.appendChild(el);
    }
  }

  function buildSparkles(overlay) {
    var colors = ['#fff', '#f5cd47', '#4bce97', '#93c5fd', '#ffb3c7'];
    for (var i = 0; i < 36; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-sparkle';
      el.style.setProperty('--x', rand(5, 95) + '%');
      el.style.setProperty('--y', rand(8, 88) + '%');
      el.style.setProperty('--size', rand(8, 18) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.9) + 's');
      el.style.setProperty('--dur', rand(0.9, 1.5) + 's');
      overlay.appendChild(el);
    }
  }

  function buildShootingStars(overlay) {
    var colors = COLORS.warm;
    for (var i = 0; i < 7; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-shooting-star';
      el.style.setProperty('--x', rand(0, 55) + '%');
      el.style.setProperty('--y', rand(4, 45) + '%');
      el.style.setProperty('--len', rand(70, 130) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--angle', rand(18, 38) + 'deg');
      el.style.setProperty('--travel', rand(260, 420) + 'px');
      el.style.setProperty('--drop', rand(80, 180) + 'px');
      el.style.setProperty('--delay', i * 0.16 + rand(0, 0.08) + 's');
      overlay.appendChild(el);
    }
  }

  function buildBubbles(overlay) {
    var colors = COLORS.cool;
    for (var i = 0; i < 28; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-bubble';
      el.style.setProperty('--x', rand(5, 95) + '%');
      el.style.setProperty('--size', rand(10, 34) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.9) + 's');
      el.style.setProperty('--dur', rand(2.2, 3.2) + 's');
      el.style.setProperty('--drift', rand(-40, 40) + 'px');
      overlay.appendChild(el);
    }
  }

  function buildAurora(overlay) {
    var bands = [
      { y: '12%', h: '32%', c1: '#22a06b', c2: '#4bce97', c3: '#579dff', delay: 0 },
      { y: '28%', h: '26%', c1: '#579dff', c2: '#9f8fef', c3: '#4bce97', delay: 0.25 },
      { y: '42%', h: '22%', c1: '#9f8fef', c2: '#22a06b', c3: '#93c5fd', delay: 0.5 }
    ];
    bands.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'tp-fx-aurora-band';
      el.style.setProperty('--y', b.y);
      el.style.setProperty('--h', b.h);
      el.style.setProperty('--c1', b.c1);
      el.style.setProperty('--c2', b.c2);
      el.style.setProperty('--c3', b.c3);
      el.style.setProperty('--delay', b.delay + 's');
      overlay.appendChild(el);
    });
  }

  function buildBalloons(overlay) {
    var colors = ['#ff8f73', '#579dff', '#f5cd47', '#9f8fef', '#4bce97', '#ff5c8a'];
    for (var i = 0; i < 14; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-balloon';
      el.style.setProperty('--x', rand(6, 94) + '%');
      el.style.setProperty('--size', rand(22, 38) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.7) + 's');
      el.style.setProperty('--dur', rand(2.6, 3.4) + 's');
      el.style.setProperty('--drift', rand(-36, 36) + 'px');
      el.style.setProperty('--tilt', rand(-10, 10) + 'deg');
      overlay.appendChild(el);
    }
  }

  function buildPetals(overlay) {
    var colors = ['#ffb3c7', '#ff8f73', '#fbcfe8', '#fda4af', '#fecdd3'];
    for (var i = 0; i < 34; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-petal';
      el.style.setProperty('--x', rand(0, 100) + '%');
      el.style.setProperty('--size', rand(10, 18) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.9) + 's');
      el.style.setProperty('--dur', rand(2.6, 3.6) + 's');
      el.style.setProperty('--drift', rand(-90, 90) + 'px');
      el.style.setProperty('--spin', rand(280, 540) + 'deg');
      overlay.appendChild(el);
    }
  }

  function buildRainbow(overlay) {
    var el = document.createElement('div');
    el.className = 'tp-fx-rainbow';
    overlay.appendChild(el);
  }

  function buildDisco(overlay) {
    var beams = [
      { angle: -34, c: '#9f8fef', swing: 40, delay: 0 },
      { angle: -8, c: '#579dff', swing: -32, delay: 0.1 },
      { angle: 16, c: '#4bce97', swing: 36, delay: 0.18 },
      { angle: 38, c: '#ff8f73', swing: -28, delay: 0.28 }
    ];
    beams.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'tp-fx-disco-beam';
      el.style.setProperty('--angle', b.angle + 'deg');
      el.style.setProperty('--c', b.c);
      el.style.setProperty('--swing', b.swing + 'deg');
      el.style.setProperty('--delay', b.delay + 's');
      el.style.setProperty('--dur', '2.2s');
      overlay.appendChild(el);
    });
    var spots = COLORS.party;
    for (var i = 0; i < 16; i++) {
      var spot = document.createElement('span');
      spot.className = 'tp-fx-disco-spot';
      spot.style.setProperty('--x', rand(10, 90) + '%');
      spot.style.setProperty('--y', rand(15, 80) + '%');
      spot.style.setProperty('--size', rand(28, 70) + 'px');
      spot.style.setProperty('--c', pick(spots, i));
      spot.style.setProperty('--delay', rand(0.1, 1.4) + 's');
      overlay.appendChild(spot);
    }
  }

  var BUILDERS = {
    fireworks: buildFireworks,
    confetti: buildConfetti,
    hearts: buildHearts,
    sparkles: buildSparkles,
    shooting_stars: buildShootingStars,
    bubbles: buildBubbles,
    aurora: buildAurora,
    balloons: buildBalloons,
    petals: buildPetals,
    rainbow: buildRainbow,
    disco: buildDisco
  };

  /**
   * @param {string} name
   * @param {{ root?: Element, sound?: boolean, clearOthers?: boolean }|Element} [options]
   * @returns {{ ok: boolean, effect?: string, error?: string }}
   */
  function play(name, options) {
    var opts = options && typeof options === 'object' && !options.appendChild
      ? options
      : { root: options };
    var id = normalizeEffectId(name);
    if (!id || !EFFECT_META[id]) {
      return { ok: false, error: 'Effet inconnu' };
    }
    if (typeof document === 'undefined') {
      return { ok: false, effect: id, error: 'DOM indisponible' };
    }
    var mount = opts.root || document.body;
    if (!mount || !mount.appendChild) {
      return { ok: false, effect: id, error: 'Root invalide' };
    }

    if (opts.clearOthers !== false) {
      clearEffects(mount);
    }

    var playSound = opts.sound !== false;
    if (playSound) playEffectSound(id);

    if (prefersReducedMotion()) {
      return { ok: true, effect: id, reducedMotion: true };
    }

    var builder = BUILDERS[id];
    if (!builder) return { ok: false, effect: id, error: 'Builder manquant' };

    var overlay = makeRoot(id, mount);
    builder(overlay);
    scheduleClear(overlay, EFFECT_META[id].ms + 200);
    return { ok: true, effect: id };
  }

  global.CelebrationEffects = {
    EFFECTS: listEffects(),
    META: EFFECT_META,
    list: listEffects,
    normalize: normalizeEffectId,
    label: effectLabel,
    play: play,
    clear: clearEffects,
    playSound: playEffectSound
  };
})(typeof window !== 'undefined' ? window : this);
