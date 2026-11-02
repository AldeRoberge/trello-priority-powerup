/**
 * CelebrationEffects — brief visual overlays + Web Audio stingers.
 * Used by completion UI (fireworks) and the agent (trigger_effect).
 * Supports optional fullscreen text via play(name, { text: 'DEUX' }).
 * Exposes window.CelebrationEffects.
 *
 * Table of contents
 * ─────────────────
 *  1. Audio context + F# major tone helpers
 *  2. Named UI sounds (progress tick/milestone, subtask pop, …)
 *  3. playUiSound router
 *  4. DOM overlay builders (beep, zap, fanfare, fireworks, …)
 *  5. play(effectId) / clearEffects public API
 *
 * Respects prefers-reduced-motion (visuals skipped; sounds may still play).
 */

/**
 * effects: part 1 of 2 (sound).
 * Names are shared with the other parts through window.EffectsParts (see effects.parts.json for the load order).
 */

/**
 * effects-sounds: part 1 of 2 (sound).
 * Names are shared with the other parts through window.EffectsParts (see effects-sounds.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.EffectsParts = global.EffectsParts || {});

  // from other parts (functions, resolved at call time)
  function playUiSound() { return S.playUiSound.apply(this, arguments); }
  function pick() { return S.pick.apply(this, arguments); }
  function scheduleClear() { return S.scheduleClear.apply(this, arguments); }

var S = (global.EffectsParts = global.EffectsParts || {});
  function pick() { return S.pick.apply(this, arguments); }
  function scheduleClear() { return S.scheduleClear.apply(this, arguments); }

var ROOT_ATTR = 'data-tp-fx';
  var audioCtx = null;

  /**
   * Melodic SFX stay in F# major so layered / sequential stingers stay consonant.
   * Scale degrees: F# G# A# B C# D# E#(F) — A4 = 440 Hz.
   */
  var FS = {
    Fs2: 92.5,
    Cs3: 138.59,
    Ds3: 155.56,
    Fs3: 185.0,
    Gs3: 207.65,
    As3: 233.08,
    B3: 246.94,
    Cs4: 277.18,
    Ds4: 311.13,
    F4: 349.23,
    Fs4: 369.99,
    Gs4: 415.3,
    As4: 466.16,
    B4: 493.88,
    Cs5: 554.37,
    Ds5: 622.25,
    F5: 698.46,
    Fs5: 739.99,
    Gs5: 830.61,
    As5: 932.33,
    B5: 987.77,
    Cs6: 1108.73,
    Ds6: 1244.51,
    F6: 1396.91,
    Fs6: 1479.98,
    Gs6: 1661.22,
    As6: 1864.66,
    B6: 1975.53,
    Cs7: 2217.46,
    Ds7: 2489.02,
    F7: 2793.83,
    Fs7: 2959.96
  };

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
    flowers: { label: 'Fleurs', ms: 3200 },
    rainbow: { label: 'Arc-en-ciel', ms: 2600 },
    disco: { label: 'Disco', ms: 2400 },
    beep: { label: 'Beep beep', ms: 1200 },
    boop: { label: 'Boop', ms: 900 },
    zap: { label: 'Zap', ms: 1100 },
    thunder: { label: 'Tonnerre', ms: 2200 },
    fanfare: { label: 'Fanfare', ms: 2000 },
    bonk: { label: 'Bonk', ms: 1000 },
    laser: { label: 'Laser', ms: 1100 },
    coin: { label: 'Pi\u00e8ce', ms: 1000 },
    drumroll: { label: 'Roulement', ms: 1800 },
    banner: { label: 'Banni\u00e8re', ms: 2400 },
    fleur_de_lys: { label: 'Fleur de lys', ms: 4500 }
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
    flower: 'flowers',
    fleur: 'flowers',
    fleurs: 'flowers',
    bouquet: 'flowers',
    roses: 'flowers',
    rose: 'flowers',
    arc_en_ciel: 'rainbow',
    party: 'disco',
    laser_show: 'disco',
    beep_beep: 'beep',
    beeps: 'beep',
    bip: 'beep',
    bip_bip: 'beep',
    bleep: 'beep',
    boops: 'boop',
    electric: 'zap',
    shock: 'zap',
    lightning: 'thunder',
    thunderclap: 'thunder',
    tonnerre: 'thunder',
    eclair: 'thunder',
    trumpets: 'fanfare',
    victory: 'fanfare',
    trompette: 'fanfare',
    bonk_head: 'bonk',
    thud: 'bonk',
    pew: 'laser',
    blaster: 'laser',
    ring: 'coin',
    ping: 'coin',
    piece: 'coin',
    roll: 'drumroll',
    drums: 'drumroll',
    rumble: 'drumroll',
    text: 'banner',
    fullscreen_text: 'banner',
    fullscreen: 'banner',
    stinger: 'banner',
    flash_text: 'banner',
    title_card: 'banner',
    fleur_de_lis: 'fleur_de_lys',
    fleurdely: 'fleur_de_lys',
    fleurdelys: 'fleur_de_lys',
    quebec: 'fleur_de_lys',
    quebec_libre: 'fleur_de_lys',
    vive_quebec: 'fleur_de_lys',
    vive_le_quebec: 'fleur_de_lys',
    vive_le_quebec_libre: 'fleur_de_lys',
    gens_du_pays: 'fleur_de_lys',
    drapeau_quebec: 'fleur_de_lys'
  };

  var COLORS = {
    party: ['#22a06b', '#4bce97', '#f5cd47', '#ff8f73', '#579dff', '#9f8fef', '#fff'],
    hearts: ['#ff8f73', '#ff5c8a', '#e5688f', '#ffb3c7', '#f87171'],
    flowers: ['#ff8f73', '#ff5c8a', '#f5cd47', '#9f8fef', '#579dff', '#fda4af', '#fbcfe8'],
    cool: ['#579dff', '#4bce97', '#9f8fef', '#6ee7b7', '#93c5fd'],
    warm: ['#f5cd47', '#ff8f73', '#fb923c', '#fbbf24', '#fff'],
    neon: ['#39ff14', '#00f0ff', '#ff2bd6', '#ffe600', '#ffffff'],
    quebec: ['#003399', '#ffffff', '#1a4db3', '#e8f0ff', '#002266', '#f5f8ff']
  };

  var BANNER_THEMES = {
    thunder: { className: 'is-thunder', flash: true },
    beep: { className: 'is-beep', flash: false },
    zap: { className: 'is-zap', flash: true },
    fanfare: { className: 'is-fanfare', flash: false },
    bonk: { className: 'is-bonk', flash: false },
    laser: { className: 'is-laser', flash: false },
    coin: { className: 'is-coin', flash: false },
    drumroll: { className: 'is-drumroll', flash: false },
    fireworks: { className: 'is-party', flash: true },
    confetti: { className: 'is-party', flash: false },
    disco: { className: 'is-party', flash: true },
    fleur_de_lys: { className: 'is-quebec', flash: false },
    banner: { className: 'is-banner', flash: false }
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

  function audioGestureOk() {
    try {
      var ua = global.navigator && global.navigator.userActivation;
      if (ua && typeof ua.hasBeenActive === 'boolean') return ua.hasBeenActive;
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  function ensureAudioCtx() {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx || !audioGestureOk()) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      var resume = audioCtx.resume();
      if (resume && typeof resume.catch === 'function') resume.catch(function () {});
    }
    return audioCtx;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickOne(items) {
    if (!items || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
  }

  function playTones(tones, options) {
    options = options || {};
    try {
      var ctx = ensureAudioCtx();
      if (!ctx) return;
      var t0 = ctx.currentTime;
      var dest = ctx.destination;
      // Melodic tones: no pitch jitter (keeps F# major in tune across effects).
      // Non-melodic rumbles may still opt in via options.freqJitter.
      var freqJitter = options.freqJitter != null ? options.freqJitter : 0;
      var fMul = freqJitter
        ? 1 + rand(-freqJitter, freqJitter)
        : 1;
      var tMul = 1 + rand(-(options.timeJitter != null ? options.timeJitter : 0.05), options.timeJitter != null ? options.timeJitter : 0.05);
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
        var delay = (tone.delay || 0) * tMul;
        var dur = (tone.dur || 0.2) * tMul;
        var peak = (tone.peak != null ? tone.peak : 0.045) * rand(0.9, 1.1);
        osc.type = tone.type || 'sine';
        osc.frequency.setValueAtTime(tone.freq * fMul, t0 + delay);
        if (tone.freqEnd != null) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(20, tone.freqEnd * fMul),
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
      var power = options.power != null ? options.power : 1;
      for (var i = 0; i < data.length; i++) {
        var env = Math.pow(1 - i / data.length, power);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = options.filterType || 'bandpass';
      filter.frequency.value = options.freq != null ? options.freq : 1800;
      filter.Q.value = options.q != null ? options.q : 1.2;
      if (options.freqEnd != null) {
        var t0f = ctx.currentTime + (options.delay || 0);
        filter.frequency.setValueAtTime(filter.frequency.value, t0f);
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(40, options.freqEnd),
          t0f + dur
        );
      }
      var gain = ctx.createGain();
      var t0 = ctx.currentTime + (options.delay || 0);
      var peak = options.peak != null ? options.peak : 0.04;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (options.attack != null ? options.attack : 0.01));
      if (options.sustain != null) {
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * options.sustain), t0 + dur * 0.45);
      }
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

  function playRandomToneSet(variants, options) {
    var chosen = pickOne(variants);
    if (!chosen) return;
    playTones(typeof chosen === 'function' ? chosen() : chosen, options);
  }

  /** Random phrase variant, but always F# major and in tune (no pitch jitter). */
  function playMelodySet(variants, options) {
    options = options || {};
    if (options.freqJitter == null) options.freqJitter = 0;
    playRandomToneSet(variants, options);
  }

  function soundBeep() {
    var variants = [
      [
        { freq: FS.Cs6, delay: 0, dur: 0.11, peak: 0.07, type: 'square', attack: 0.004 },
        { freq: FS.Cs6, delay: 0.16, dur: 0.14, peak: 0.07, type: 'square', attack: 0.004 }
      ],
      [
        { freq: FS.B5, delay: 0, dur: 0.09, peak: 0.065, type: 'square', attack: 0.003 },
        { freq: FS.Ds6, delay: 0.13, dur: 0.12, peak: 0.06, type: 'square', attack: 0.003 }
      ],
      [
        { freq: FS.Fs5, delay: 0, dur: 0.1, peak: 0.068, type: 'triangle', attack: 0.004 },
        { freq: FS.Fs5, delay: 0.14, dur: 0.1, peak: 0.068, type: 'triangle', attack: 0.004 },
        { freq: FS.B5, delay: 0.28, dur: 0.16, peak: 0.055, type: 'square', attack: 0.004 }
      ],
      [
        { freq: FS.Cs6, delay: 0, dur: 0.08, peak: 0.06, type: 'square', attack: 0.003 },
        { freq: FS.Gs5, delay: 0.1, dur: 0.08, peak: 0.055, type: 'square', attack: 0.003 },
        { freq: FS.Cs6, delay: 0.2, dur: 0.12, peak: 0.062, type: 'square', attack: 0.003 }
      ],
      [
        { freq: FS.As5, delay: 0, dur: 0.12, peak: 0.06, type: 'square', attack: 0.005 },
        { freq: FS.Cs6, delay: 0.15, dur: 0.12, peak: 0.065, type: 'square', attack: 0.005 },
        { freq: FS.Fs6, delay: 0.3, dur: 0.1, peak: 0.05, type: 'triangle', attack: 0.004 }
      ]
    ];
    playMelodySet(variants, { timeJitter: 0.04 });
  }

  function soundBoop() {
    playMelodySet(
      [
        [{ freq: FS.Gs4, delay: 0, dur: 0.18, peak: 0.055, type: 'sine', freqEnd: FS.Cs4, attack: 0.01 }],
        [{ freq: FS.Cs5, delay: 0, dur: 0.14, peak: 0.05, type: 'triangle', freqEnd: FS.Fs4, attack: 0.008 }],
        [
          { freq: FS.Fs4, delay: 0, dur: 0.1, peak: 0.048, type: 'sine', freqEnd: FS.Ds4 },
          { freq: FS.Ds4, delay: 0.12, dur: 0.16, peak: 0.04, type: 'triangle', freqEnd: FS.As3 }
        ],
        [{ freq: FS.Ds5, delay: 0, dur: 0.2, peak: 0.05, type: 'sine', freqEnd: FS.Fs3, attack: 0.012 }]
      ],
      { lowpass: 2200 }
    );
  }

  function soundZap() {
    var n = Math.floor(rand(2, 5));
    for (var i = 0; i < n; i++) {
      playNoiseBurst({
        delay: i * 0.05,
        dur: rand(0.04, 0.09),
        freq: rand(1800, 4200),
        freqEnd: rand(400, 900),
        peak: 0.045,
        filterType: 'bandpass',
        q: 3.5,
        power: 0.7
      });
    }
    playMelodySet([
      [{ freq: FS.F6, delay: 0, dur: 0.18, peak: 0.035, type: 'sawtooth', freqEnd: FS.As3, attack: 0.005 }],
      [{ freq: FS.Cs7, delay: 0.02, dur: 0.14, peak: 0.03, type: 'square', freqEnd: FS.Fs3, attack: 0.004 }],
      [
        { freq: FS.Gs6, delay: 0, dur: 0.08, peak: 0.032, type: 'sawtooth', freqEnd: FS.Ds5 },
        { freq: FS.As5, delay: 0.1, dur: 0.12, peak: 0.028, type: 'triangle', freqEnd: FS.Fs3 }
      ]
    ]);
  }

  function soundThunder() {
    playNoiseBurst({
      delay: 0,
      dur: 0.12,
      freq: 4200,
      peak: 0.09,
      filterType: 'highpass',
      q: 0.7,
      attack: 0.002,
      power: 0.35
    });
    playNoiseBurst({
      delay: 0.04,
      dur: 0.9,
      freq: 180,
      freqEnd: 60,
      peak: 0.1,
      filterType: 'lowpass',
      q: 0.5,
      attack: 0.01,
      sustain: 0.55,
      power: 0.85
    });
    playNoiseBurst({
      delay: 0.2,
      dur: 0.55,
      freq: 120,
      freqEnd: 40,
      peak: 0.07,
      filterType: 'lowpass',
      q: 0.4,
      power: 1.1
    });
    playTones(
      [
        { freq: 70, delay: 0.05, dur: 0.85, peak: 0.05, type: 'sine', freqEnd: 45, attack: 0.02 },
        { freq: 55, delay: 0.18, dur: 1.0, peak: 0.04, type: 'triangle', freqEnd: 35, attack: 0.04 }
      ],
      { lowpass: 220, q: 0.3, freqJitter: 0.08 }
    );
  }

  function soundFanfare() {
    playMelodySet([
      [
        { freq: FS.Fs4, delay: 0, dur: 0.16, peak: 0.045, type: 'triangle' },
        { freq: FS.As4, delay: 0.14, dur: 0.16, peak: 0.048, type: 'triangle' },
        { freq: FS.Cs5, delay: 0.28, dur: 0.16, peak: 0.05, type: 'triangle' },
        { freq: FS.Fs5, delay: 0.42, dur: 0.35, peak: 0.055, type: 'triangle' },
        { freq: FS.Cs6, delay: 0.55, dur: 0.45, peak: 0.04, type: 'sine' }
      ],
      [
        { freq: FS.Gs4, delay: 0, dur: 0.12, peak: 0.045, type: 'square', attack: 0.01 },
        { freq: FS.As4, delay: 0.12, dur: 0.12, peak: 0.045, type: 'square', attack: 0.01 },
        { freq: FS.Cs5, delay: 0.24, dur: 0.12, peak: 0.048, type: 'square', attack: 0.01 },
        { freq: FS.Fs5, delay: 0.36, dur: 0.4, peak: 0.05, type: 'triangle' }
      ],
      [
        { freq: FS.Cs5, delay: 0, dur: 0.2, peak: 0.04 },
        { freq: FS.Ds5, delay: 0.1, dur: 0.2, peak: 0.04 },
        { freq: FS.Fs5, delay: 0.2, dur: 0.2, peak: 0.042 },
        { freq: FS.As5, delay: 0.35, dur: 0.5, peak: 0.048, type: 'triangle' },
        { freq: FS.Cs6, delay: 0.55, dur: 0.4, peak: 0.03 }
      ]
    ]);
  }

  /**
   * Orchestral chime approximating "Gens du pays" (opening motif),
   * transposed into the Power-Up's F# major colour.
   */
  function soundGensDuPays() {
    // Soft string-like pad under the melody
    playTones(
      [
        { freq: FS.Fs3, delay: 0, dur: 3.8, peak: 0.018, type: 'sine', attack: 0.18 },
        { freq: FS.Cs4, delay: 0.04, dur: 3.75, peak: 0.014, type: 'sine', attack: 0.22 },
        { freq: FS.As3, delay: 0.08, dur: 3.7, peak: 0.012, type: 'triangle', attack: 0.25 },
        { freq: FS.Fs4, delay: 0.12, dur: 3.6, peak: 0.01, type: 'sine', attack: 0.3 }
      ],
      { lowpass: 1800, q: 0.4, timeJitter: 0.01 }
    );
    // Melody + octave doubling (bell / winds colour)
    playTones(
      [
        // Gens du pays
        { freq: FS.As4, delay: 0.15, dur: 0.32, peak: 0.042, type: 'triangle', attack: 0.03 },
        { freq: FS.Gs4, delay: 0.42, dur: 0.28, peak: 0.04, type: 'triangle', attack: 0.025 },
        { freq: FS.Fs4, delay: 0.68, dur: 0.28, peak: 0.038, type: 'sine', attack: 0.025 },
        { freq: FS.As4, delay: 0.94, dur: 0.36, peak: 0.044, type: 'triangle', attack: 0.03 },
        // c'est votre tour
        { freq: FS.Cs5, delay: 1.3, dur: 0.32, peak: 0.042, type: 'triangle', attack: 0.03 },
        { freq: FS.B4, delay: 1.58, dur: 0.28, peak: 0.04, type: 'sine', attack: 0.025 },
        { freq: FS.As4, delay: 1.84, dur: 0.28, peak: 0.038, type: 'triangle', attack: 0.025 },
        { freq: FS.Gs4, delay: 2.1, dur: 0.4, peak: 0.04, type: 'sine', attack: 0.03 },
        // de vous laisser parler d'amour (resolve)
        { freq: FS.Fs4, delay: 2.55, dur: 0.28, peak: 0.038, type: 'triangle', attack: 0.03 },
        { freq: FS.Fs4, delay: 2.8, dur: 0.26, peak: 0.036, type: 'sine', attack: 0.025 },
        { freq: FS.Gs4, delay: 3.04, dur: 0.26, peak: 0.038, type: 'triangle', attack: 0.025 },
        { freq: FS.As4, delay: 3.28, dur: 0.32, peak: 0.042, type: 'triangle', attack: 0.03 },
        { freq: FS.As4, delay: 3.58, dur: 0.28, peak: 0.04, type: 'sine', attack: 0.03 },
        { freq: FS.Gs4, delay: 3.84, dur: 0.55, peak: 0.036, type: 'triangle', attack: 0.04 }
      ],
      { lowpass: 3200, q: 0.55, timeJitter: 0.012 }
    );
    // Soft high harmonics / chime sparkle
    playTones(
      [
        { freq: FS.As5, delay: 0.2, dur: 0.55, peak: 0.016, type: 'sine', attack: 0.05 },
        { freq: FS.Cs6, delay: 1.35, dur: 0.6, peak: 0.015, type: 'sine', attack: 0.06 },
        { freq: FS.Fs5, delay: 2.6, dur: 0.7, peak: 0.014, type: 'sine', attack: 0.08 },
        { freq: FS.Cs6, delay: 3.6, dur: 0.85, peak: 0.018, type: 'sine', attack: 0.1 },
        { freq: FS.Fs6, delay: 3.75, dur: 0.9, peak: 0.012, type: 'triangle', attack: 0.12 }
      ],
      { lowpass: 4800, q: 0.35, timeJitter: 0.01 }
    );
  }

  function soundBonk() {
    playMelodySet([
      [{ freq: FS.Fs3, delay: 0, dur: 0.22, peak: 0.07, type: 'sine', freqEnd: FS.Fs2, attack: 0.005 }],
      [{ freq: FS.As3, delay: 0, dur: 0.18, peak: 0.065, type: 'triangle', freqEnd: FS.Fs2, attack: 0.004 }],
      [
        { freq: FS.Gs3, delay: 0, dur: 0.14, peak: 0.07, type: 'sine', freqEnd: FS.Cs3 },
        { freq: FS.Fs2, delay: 0.08, dur: 0.2, peak: 0.04, type: 'triangle', freqEnd: FS.Fs2 }
      ]
    ]);
    playNoiseBurst({ delay: 0, dur: 0.08, freq: 400, peak: 0.035, filterType: 'lowpass', q: 1 });
  }

  function soundLaser() {
    playMelodySet([
      [{ freq: FS.Gs6, delay: 0, dur: 0.35, peak: 0.045, type: 'sawtooth', freqEnd: FS.As3, attack: 0.005 }],
      [{ freq: FS.Cs7, delay: 0, dur: 0.28, peak: 0.04, type: 'square', freqEnd: FS.Fs3, attack: 0.004 }],
      [
        { freq: FS.F6, delay: 0, dur: 0.2, peak: 0.042, type: 'sawtooth', freqEnd: FS.Gs4 },
        { freq: FS.As5, delay: 0.18, dur: 0.25, peak: 0.03, type: 'triangle', freqEnd: FS.Cs4 }
      ],
      [{ freq: FS.Fs7, delay: 0, dur: 0.22, peak: 0.038, type: 'sine', freqEnd: FS.Ds4, attack: 0.003 }]
    ]);
  }

  function soundCoin() {
    playMelodySet([
      [
        { freq: FS.B5, delay: 0, dur: 0.08, peak: 0.05, type: 'square', attack: 0.003 },
        { freq: FS.Cs6, delay: 0.08, dur: 0.28, peak: 0.045, type: 'square', attack: 0.003 }
      ],
      [
        { freq: FS.Cs6, delay: 0, dur: 0.07, peak: 0.048, type: 'square', attack: 0.003 },
        { freq: FS.Fs6, delay: 0.07, dur: 0.32, peak: 0.042, type: 'triangle', attack: 0.004 }
      ],
      [
        { freq: FS.As5, delay: 0, dur: 0.06, peak: 0.05, type: 'square', attack: 0.002 },
        { freq: FS.Ds6, delay: 0.06, dur: 0.08, peak: 0.045, type: 'square', attack: 0.002 },
        { freq: FS.As6, delay: 0.14, dur: 0.25, peak: 0.038, type: 'sine', attack: 0.003 }
      ]
    ]);
  }

  function soundDrumroll() {
    var hits = 10;
    for (var i = 0; i < hits; i++) {
      playNoiseBurst({
        delay: i * (0.07 - i * 0.003),
        dur: 0.05,
        freq: 180 + i * 12,
        peak: 0.03 + i * 0.004,
        filterType: 'bandpass',
        q: 2.2,
        power: 0.6
      });
    }
    playNoiseBurst({
      delay: 0.85,
      dur: 0.25,
      freq: 120,
      peak: 0.08,
      filterType: 'lowpass',
      q: 0.8,
      power: 0.5
    });
    playTones([{ freq: FS.Cs3, delay: 0.85, dur: 0.35, peak: 0.05, type: 'sine', freqEnd: FS.Fs2, attack: 0.01 }]);
  }

  var lastProgressTickAt = 0;
  var lastProgressTickPct = -1;

  /**
   * Short UI tick for progress scrubbing. Pitch rises with percent (0–100).
   * Throttled so fast drags stay crisp instead of muddy.
   */
  // ── 2. Named UI sounds (progress, subtask, chrome clicks) ───────────────

  function playProgressTick(percent) {
    percent = Math.max(0, Math.min(100, Number(percent) || 0));
    var now =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    if (percent === lastProgressTickPct) return;
    var jump = Math.abs(percent - lastProgressTickPct);
    var minGap = jump >= 4 ? 14 : jump >= 2 ? 22 : 30;
    if (now - lastProgressTickAt < minGap) return;
    lastProgressTickAt = now;
    lastProgressTickPct = percent;

    var t = percent / 100;
    // ~Fs4 → ~Fs6 — bright rise that stays consonant with other F# major SFX.
    var freq = FS.Fs4 * Math.pow(FS.Fs6 / FS.Fs4, t);
    var peak = 0.026 + t * 0.02;

    if (percent >= 100) {
      playTones(
        [
          {
            freq: FS.Cs6,
            delay: 0,
            dur: 0.06,
            peak: 0.042,
            type: 'triangle',
            attack: 0.002,
          },
          {
            freq: FS.Fs6,
            delay: 0.035,
            dur: 0.14,
            peak: 0.038,
            type: 'sine',
            attack: 0.004,
          },
        ],
        { lowpass: 5200 }
      );
      return;
    }

    playTones(
      [
        {
          freq: freq,
          delay: 0,
          dur: 0.038,
          peak: peak,
          type: 'triangle',
          attack: 0.0015,
        },
        {
          freq: Math.min(FS.Fs6 * 1.35, freq * 2),
          delay: 0,
          dur: 0.026,
          peak: peak * 0.32,
          type: 'sine',
          attack: 0.001,
        },
      ],
      { lowpass: 4800 + t * 800 }
    );
  }

  /**
   * Clearer chime when a Progrès encouragement stage changes (e.g. En cours →
   * Bon progrès). Distinct from the fine scrub tick so milestones read clearly.
   *
   * opts.direction: 'up' | 'down' (default 'up')
   * opts.tier: 0–n stage index (optional; derived from percent when omitted)
   */
  function playProgressMilestone(percent, opts) {
    opts = opts || {};
    percent = Math.max(0, Math.min(100, Number(percent) || 0));
    var ascending = opts.direction !== 'down';
    var roots = [
      FS.Fs4,
      FS.Gs4,
      FS.As4,
      FS.B4,
      FS.Cs5,
      FS.Ds5,
      FS.F5,
      FS.Fs5,
    ];
    var tier =
      typeof opts.tier === 'number' && isFinite(opts.tier)
        ? Math.max(0, Math.min(roots.length - 1, Math.round(opts.tier)))
        : Math.max(
            0,
            Math.min(
              roots.length - 1,
              Math.round((percent / 100) * (roots.length - 1))
            )
          );
    var root = roots[tier];
    var third = root * (FS.As4 / FS.Fs4); // major 3rd in F# colour
    var fifth = root * (FS.Cs5 / FS.Fs4);
    var peak = 0.04 + (tier / (roots.length - 1)) * 0.028;

    if (percent >= 100) {
      playTones(
        [
          {
            freq: FS.Fs5,
            delay: 0,
            dur: 0.07,
            peak: 0.05,
            type: 'triangle',
            attack: 0.002,
          },
          {
            freq: FS.As5,
            delay: 0.04,
            dur: 0.09,
            peak: 0.045,
            type: 'triangle',
            attack: 0.003,
          },
          {
            freq: FS.Cs6,
            delay: 0.085,
            dur: 0.16,
            peak: 0.042,
            type: 'sine',
            attack: 0.004,
          },
          {
            freq: FS.Fs6,
            delay: 0.12,
            dur: 0.22,
            peak: 0.038,
            type: 'sine',
            attack: 0.005,
          },
        ],
        { lowpass: 5600 }
      );
      lastProgressTickAt =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      lastProgressTickPct = percent;
      return { ok: true, sound: 'progress_milestone', tier: tier };
    }

    if (ascending) {
      playTones(
        [
          {
            freq: root,
            delay: 0,
            dur: 0.07,
            peak: peak,
            type: 'triangle',
            attack: 0.002,
          },
          {
            freq: third,
            delay: 0.045,
            dur: 0.09,
            peak: peak * 0.85,
            type: 'triangle',
            attack: 0.003,
          },
          {
            freq: fifth,
            delay: 0.09,
            dur: 0.14,
            peak: peak * 0.7,
            type: 'sine',
            attack: 0.004,
          },
        ],
        { lowpass: 5000 + tier * 80 }
      );
    } else {
      playTones(
        [
          {
            freq: fifth,
            delay: 0,
            dur: 0.06,
            peak: peak * 0.75,
            type: 'triangle',
            attack: 0.002,
          },
          {
            freq: third,
            delay: 0.04,
            dur: 0.08,
            peak: peak * 0.7,
            type: 'triangle',
            attack: 0.003,
          },
          {
            freq: root,
            delay: 0.08,
            dur: 0.12,
            peak: peak * 0.65,
            type: 'sine',
            attack: 0.004,
          },
        ],
        { lowpass: 4200 }
      );
    }

    lastProgressTickAt =
      typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
    lastProgressTickPct = percent;
    return { ok: true, sound: 'progress_milestone', tier: tier };
  }

  /** Soft F# tick used when a single subtask is checked (smaller than full fireworks). */
  function playSubtaskPopSound() {
    playUiSound('done');
  }

  // exports
  S.BANNER_THEMES = BANNER_THEMES;
  S.COLORS = COLORS;
  S.EFFECT_ALIASES = EFFECT_ALIASES;
  S.EFFECT_META = EFFECT_META;
  S.FS = FS;
  S.ROOT_ATTR = ROOT_ATTR;
  S.audioCtx = audioCtx;
  S.audioGestureOk = audioGestureOk;
  S.effectLabel = effectLabel;
  S.ensureAudioCtx = ensureAudioCtx;
  S.lastProgressTickAt = lastProgressTickAt;
  S.lastProgressTickPct = lastProgressTickPct;
  S.listEffects = listEffects;
  S.normalizeEffectId = normalizeEffectId;
  S.pickOne = pickOne;
  S.playMelodySet = playMelodySet;
  S.playNoiseBurst = playNoiseBurst;
  S.playProgressMilestone = playProgressMilestone;
  S.playProgressTick = playProgressTick;
  S.playRandomToneSet = playRandomToneSet;
  S.playSubtaskPopSound = playSubtaskPopSound;
  S.playTones = playTones;
  S.prefersReducedMotion = prefersReducedMotion;
  S.rand = rand;
  S.soundBeep = soundBeep;
  S.soundBonk = soundBonk;
  S.soundBoop = soundBoop;
  S.soundCoin = soundCoin;
  S.soundDrumroll = soundDrumroll;
  S.soundFanfare = soundFanfare;
  S.soundGensDuPays = soundGensDuPays;
  S.soundLaser = soundLaser;
  S.soundThunder = soundThunder;
  S.soundZap = soundZap;
})(typeof window !== 'undefined' ? window : this);
