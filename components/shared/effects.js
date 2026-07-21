/**
 * CelebrationEffects — brief visual overlays + Web Audio stingers.
 * Used by completion UI (fireworks) and the agent (trigger_effect).
 * Supports optional fullscreen text via play(name, { text: 'DEUX' }).
 */
(function (global) {
  'use strict';

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

  /**
   * Short UI stingers for completion chrome (trash, block, bulk actions…).
   * Kept in F# major so they sit well beside progress ticks / fireworks.
   *
   * @param {string} name
   * @param {{ tierI?: number, tier?: number, direction?: 'up'|'down' }} [opts]
   * @returns {{ ok: boolean, sound?: string, error?: string, tierI?: number }}
   */
  function playUiSound(name, opts) {
    opts = opts || {};
    var raw = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    var id = raw;
    var aliases = {
      delete: 'trash',
      remove: 'trash',
      crumble: 'trash',
      blocked: 'block',
      lock: 'block',
      unblocked: 'unblock',
      unlock: 'unblock',
      clear_blocked: 'unblock',
      complete_all: 'complete_all',
      mark_all: 'complete_all',
      resolve_all: 'complete_all',
      tout_completer: 'complete_all',
      reset: 'reset',
      invalidate: 'reset',
      reset_arm: 'reset_arm',
      arm_reset: 'reset_arm',
      reset_all: 'reset_all',
      wipe: 'reset_all',
      uncheck: 'uncomplete',
      undo_done: 'uncomplete',
      incomplete: 'uncomplete',
      new_item: 'add',
      draft: 'add',
      subtask_done: 'done',
      check: 'done',
      priority_up: 'priority',
      priority_down: 'priority',
      tier: 'priority',
      heat: 'priority',
      revert: 'undo',
      undelete: 'undo',
      untrash: 'undo',
      restore: 'undo',
      paper: 'undo',
      reapply: 'redo'
    };
    if (aliases[id]) id = aliases[id];
    if (raw === 'priority_down') {
      opts = Object.assign({}, opts, { direction: 'down' });
    } else if (raw === 'priority_up') {
      opts = Object.assign({}, opts, { direction: 'up' });
    }
    switch (id) {
      case 'done':
        playTones(
          [
            {
              freq: FS.As5,
              delay: 0,
              dur: 0.045,
              peak: 0.034,
              type: 'triangle',
              attack: 0.002
            },
            {
              freq: FS.Cs6,
              delay: 0.028,
              dur: 0.1,
              peak: 0.03,
              type: 'sine',
              attack: 0.003
            }
          ],
          { lowpass: 4800 }
        );
        return { ok: true, sound: id };

      case 'uncomplete':
        playTones(
          [
            {
              freq: FS.Cs6,
              delay: 0,
              dur: 0.05,
              peak: 0.028,
              type: 'triangle',
              attack: 0.002,
              freqEnd: FS.Gs5
            },
            {
              freq: FS.Fs5,
              delay: 0.04,
              dur: 0.09,
              peak: 0.024,
              type: 'sine',
              attack: 0.003,
              freqEnd: FS.Cs5
            }
          ],
          { lowpass: 3600 }
        );
        return { ok: true, sound: id };

      case 'trash':
        playNoiseBurst({
          delay: 0,
          dur: 0.09,
          freq: 1400,
          freqEnd: 280,
          peak: 0.038,
          filterType: 'bandpass',
          q: 1.4,
          power: 0.75,
          attack: 0.004
        });
        playNoiseBurst({
          delay: 0.03,
          dur: 0.12,
          freq: 520,
          freqEnd: 90,
          peak: 0.03,
          filterType: 'lowpass',
          q: 0.8,
          power: 0.9
        });
        playTones(
          [
            {
              freq: FS.As4,
              delay: 0.01,
              dur: 0.12,
              peak: 0.028,
              type: 'triangle',
              freqEnd: FS.Fs3,
              attack: 0.004
            }
          ],
          { lowpass: 1800 }
        );
        return { ok: true, sound: id };

      case 'block':
        playNoiseBurst({
          delay: 0,
          dur: 0.07,
          freq: 240,
          peak: 0.04,
          filterType: 'lowpass',
          q: 1.1,
          power: 0.7,
          attack: 0.003
        });
        playTones(
          [
            {
              freq: FS.Cs4,
              delay: 0,
              dur: 0.08,
              peak: 0.036,
              type: 'triangle',
              attack: 0.003
            },
            {
              freq: FS.Fs3,
              delay: 0.07,
              dur: 0.14,
              peak: 0.032,
              type: 'sine',
              attack: 0.004,
              freqEnd: FS.Cs3
            }
          ],
          { lowpass: 1600 }
        );
        return { ok: true, sound: id };

      case 'unblock':
        playTones(
          [
            {
              freq: FS.Fs4,
              delay: 0,
              dur: 0.06,
              peak: 0.03,
              type: 'triangle',
              attack: 0.003,
              freqEnd: FS.As4
            },
            {
              freq: FS.Cs5,
              delay: 0.05,
              dur: 0.12,
              peak: 0.034,
              type: 'sine',
              attack: 0.004
            }
          ],
          { lowpass: 4200 }
        );
        return { ok: true, sound: id };

      case 'complete_all':
        // Quick rising cascade — sits under the full fireworks stinger.
        playTones(
          [
            { freq: FS.Fs5, delay: 0, dur: 0.05, peak: 0.03, type: 'triangle', attack: 0.002 },
            { freq: FS.As5, delay: 0.05, dur: 0.05, peak: 0.032, type: 'triangle', attack: 0.002 },
            { freq: FS.Cs6, delay: 0.1, dur: 0.05, peak: 0.034, type: 'triangle', attack: 0.002 },
            { freq: FS.Fs6, delay: 0.15, dur: 0.14, peak: 0.036, type: 'sine', attack: 0.003 }
          ],
          { lowpass: 5400 }
        );
        return { ok: true, sound: id };

      case 'reset':
        playTones(
          [
            {
              freq: FS.As5,
              delay: 0,
              dur: 0.05,
              peak: 0.03,
              type: 'triangle',
              attack: 0.002,
              freqEnd: FS.Fs5
            },
            {
              freq: FS.Cs5,
              delay: 0.045,
              dur: 0.1,
              peak: 0.028,
              type: 'sine',
              attack: 0.003,
              freqEnd: FS.Fs4
            }
          ],
          { lowpass: 3200 }
        );
        playNoiseBurst({
          delay: 0.02,
          dur: 0.08,
          freq: 700,
          freqEnd: 180,
          peak: 0.022,
          filterType: 'lowpass',
          q: 0.9,
          power: 0.8
        });
        return { ok: true, sound: id };

      case 'reset_arm':
        playTones(
          [
            {
              freq: FS.Fs5,
              delay: 0,
              dur: 0.045,
              peak: 0.03,
              type: 'square',
              attack: 0.002
            },
            {
              freq: FS.Fs5,
              delay: 0.09,
              dur: 0.08,
              peak: 0.034,
              type: 'square',
              attack: 0.002
            }
          ],
          { lowpass: 3800 }
        );
        return { ok: true, sound: id };

      case 'reset_all':
        playNoiseBurst({
          delay: 0,
          dur: 0.1,
          freq: 900,
          freqEnd: 120,
          peak: 0.036,
          filterType: 'lowpass',
          q: 0.85,
          power: 0.85
        });
        playTones(
          [
            {
              freq: FS.Cs6,
              delay: 0,
              dur: 0.05,
              peak: 0.03,
              type: 'triangle',
              attack: 0.002,
              freqEnd: FS.As4
            },
            {
              freq: FS.Fs4,
              delay: 0.06,
              dur: 0.14,
              peak: 0.028,
              type: 'sine',
              attack: 0.004,
              freqEnd: FS.Cs3
            }
          ],
          { lowpass: 2400 }
        );
        return { ok: true, sound: id };

      case 'add':
        playTones(
          [
            {
              freq: FS.Cs5,
              delay: 0,
              dur: 0.04,
              peak: 0.024,
              type: 'triangle',
              attack: 0.002
            },
            {
              freq: FS.Fs5,
              delay: 0.03,
              dur: 0.08,
              peak: 0.026,
              type: 'sine',
              attack: 0.002
            }
          ],
          { lowpass: 4000 }
        );
        return { ok: true, sound: id };

      case 'priority': {
        // Soft F# major chime — warm bells, no brass/drums.
        // Intensity grows gently with priority heat (Critique richest).
        // opts.tierI: 0=Critique … 6=Optionnelle; opts.direction: 'up'|'down'.
        var tierMax = 6;
        var tierI =
          typeof opts.tierI === 'number' && isFinite(opts.tierI)
            ? Math.max(0, Math.min(tierMax, Math.round(opts.tierI)))
            : typeof opts.tier === 'number' && isFinite(opts.tier)
              ? Math.max(0, Math.min(tierMax, Math.round(opts.tier)))
              : 3;
        var heat = (tierMax - tierI) / tierMax; // 0 = Optionnelle, 1 = Critique
        var ascending = opts.direction !== 'down';
        // Mid register stays sweet; heat lifts color, not volume aggression.
        var scale = [
          FS.Fs4,
          FS.Gs4,
          FS.As4,
          FS.B4,
          FS.Cs5,
          FS.Ds5,
          FS.Fs5,
        ];
        var rootIdx = Math.round(heat * (scale.length - 1));
        var root = scale[rootIdx];
        var third = root * (FS.As4 / FS.Fs4);
        var fifth = root * (FS.Cs5 / FS.Fs4);
        var sparkle = root * (FS.Fs5 / FS.Fs4);
        var peak = 0.018 + heat * 0.016;
        var bloom = 0.1 + heat * 0.08;
        var step = 0.055 + heat * 0.02;

        if (ascending) {
          playTones(
            [
              {
                freq: root,
                delay: 0,
                dur: 0.22 + bloom,
                peak: peak,
                type: 'sine',
                attack: 0.02
              },
              {
                freq: third,
                delay: step,
                dur: 0.24 + bloom,
                peak: peak * 0.85,
                type: 'triangle',
                attack: 0.025
              },
              {
                freq: fifth,
                delay: step * 2,
                dur: 0.28 + bloom,
                peak: peak * 0.75,
                type: 'sine',
                attack: 0.03
              },
              {
                freq: sparkle,
                delay: step * 2.6,
                dur: 0.32 + bloom,
                peak: peak * (0.35 + heat * 0.25),
                type: 'sine',
                attack: 0.04
              }
            ],
            { lowpass: 2200 + heat * 900, q: 0.55 }
          );
        } else {
          playTones(
            [
              {
                freq: sparkle,
                delay: 0,
                dur: 0.18 + bloom * 0.6,
                peak: peak * 0.55,
                type: 'sine',
                attack: 0.025
              },
              {
                freq: fifth,
                delay: step * 0.9,
                dur: 0.22 + bloom,
                peak: peak * 0.7,
                type: 'triangle',
                attack: 0.03
              },
              {
                freq: third,
                delay: step * 1.8,
                dur: 0.26 + bloom,
                peak: peak * 0.8,
                type: 'sine',
                attack: 0.035
              },
              {
                freq: root,
                delay: step * 2.5,
                dur: 0.34 + bloom,
                peak: peak,
                type: 'sine',
                attack: 0.04
              }
            ],
            { lowpass: 1800 + heat * 700, q: 0.5 }
          );
        }
        return { ok: true, sound: id, tierI: tierI };
      }

      case 'undo': {
        // Paper sliding back out of a trash can — dry rustle + soft lift.
        playNoiseBurst({
          delay: 0,
          dur: 0.07,
          freq: 2200,
          freqEnd: 900,
          peak: 0.03,
          filterType: 'bandpass',
          q: 1.8,
          power: 0.55,
          attack: 0.002
        });
        playNoiseBurst({
          delay: 0.04,
          dur: 0.11,
          freq: 1600,
          freqEnd: 420,
          peak: 0.028,
          filterType: 'bandpass',
          q: 1.2,
          power: 0.7,
          attack: 0.003
        });
        playNoiseBurst({
          delay: 0.09,
          dur: 0.14,
          freq: 900,
          freqEnd: 180,
          peak: 0.022,
          filterType: 'highpass',
          q: 0.7,
          power: 0.85
        });
        playTones(
          [
            {
              freq: FS.As4,
              delay: 0.05,
              dur: 0.1,
              peak: 0.022,
              type: 'triangle',
              attack: 0.004,
              freqEnd: FS.Cs5
            },
            {
              freq: FS.Fs5,
              delay: 0.12,
              dur: 0.16,
              peak: 0.026,
              type: 'sine',
              attack: 0.005
            }
          ],
          { lowpass: 3600 }
        );
        return { ok: true, sound: id };
      }

      case 'redo':
        playNoiseBurst({
          delay: 0,
          dur: 0.05,
          freq: 1400,
          freqEnd: 700,
          peak: 0.02,
          filterType: 'bandpass',
          q: 1.4,
          power: 0.65,
          attack: 0.002
        });
        playTones(
          [
            {
              freq: FS.Cs5,
              delay: 0.02,
              dur: 0.07,
              peak: 0.026,
              type: 'triangle',
              attack: 0.003
            },
            {
              freq: FS.Fs5,
              delay: 0.07,
              dur: 0.12,
              peak: 0.028,
              type: 'sine',
              attack: 0.004
            }
          ],
          { lowpass: 4000 }
        );
        return { ok: true, sound: id };

      default:
        return { ok: false, error: 'Son UI inconnu' };
    }
  }

  /**
   * Tiny fireworks-style pop anchored to a checkbox / point.
   * Uses data-tp-fx-local so full-screen clearEffects() does not wipe it.
   *
   * @param {Element|{x:number,y:number}|null} anchor
   * @param {{ sound?: boolean, root?: Element }} [options]
   * @returns {{ ok: boolean, error?: string }}
   */
  function playSubtaskPop(anchor, options) {
    options = options || {};
    if (typeof document === 'undefined') {
      return { ok: false, error: 'DOM indisponible' };
    }

    var cx = null;
    var cy = null;
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      var rect = anchor.getBoundingClientRect();
      if (rect && (rect.width || rect.height || rect.left || rect.top)) {
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      }
    } else if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
      cx = anchor.x;
      cy = anchor.y;
    }

    if (cx == null || cy == null || !isFinite(cx) || !isFinite(cy)) {
      return { ok: false, error: 'Ancre invalide' };
    }

    if (options.sound !== false) {
      try {
        playSubtaskPopSound();
      } catch (e) {
        /* ignore */
      }
    }

    if (prefersReducedMotion()) {
      return { ok: true, reducedMotion: true };
    }

    var mount = options.root || document.body;
    if (!mount || !mount.appendChild) {
      return { ok: false, error: 'Root invalide' };
    }

    var overlay = document.createElement('div');
    overlay.className = 'tp-fx-root tp-fx--subtask-pop is-local';
    overlay.setAttribute('data-tp-fx-local', 'subtask-pop');
    overlay.setAttribute('aria-hidden', 'true');
    mount.appendChild(overlay);

    var colors = ['#2a9b82', '#4bce97', '#f5cd47', '#579dff', '#fff'];
    var burst = document.createElement('div');
    burst.className = 'tp-fx-firework-burst tp-fx-subtask-burst';
    burst.style.left = Math.round(cx) + 'px';
    burst.style.top = Math.round(cy) + 'px';
    burst.style.setProperty('--burst-delay', '0s');

    var sparks = 10;
    for (var s = 0; s < sparks; s++) {
      var spark = document.createElement('span');
      spark.className = 'tp-fx-firework-spark tp-fx-subtask-spark';
      spark.style.setProperty('--spark-angle', (360 / sparks) * s + 8 + 'deg');
      spark.style.setProperty('--spark-dist', 22 + (s % 3) * 8 + 'px');
      spark.style.setProperty('--spark-color', pick(colors, s));
      spark.style.setProperty('--spark-delay', s * 0.008 + 's');
      burst.appendChild(spark);
    }
    overlay.appendChild(burst);

    if (anchor && anchor.classList && anchor.classList.contains('tp-completion-check')) {
      anchor.classList.remove('is-pop');
      // Retrigger CSS animation if the class was already present.
      void anchor.offsetWidth;
      anchor.classList.add('is-pop');
      setTimeout(function () {
        try {
          anchor.classList.remove('is-pop');
        } catch (e2) {
          /* ignore */
        }
      }, 480);
    }

    scheduleClear(overlay, 900);
    return { ok: true };
  }

  /**
   * Master-complete fireworks motifs — 10 short F# major phrases.
   * Soft sine/triangle, ~0.7–1.1s; picked at random via playMelodySet.
   */
  var FIREWORKS_MOTIFS = [
    // I–III–V–I arpeggio flourish
    [
      { freq: FS.Fs4, delay: 0.06, dur: 0.18, peak: 0.032, type: 'triangle' },
      { freq: FS.As4, delay: 0.2, dur: 0.18, peak: 0.034, type: 'triangle' },
      { freq: FS.Cs5, delay: 0.34, dur: 0.2, peak: 0.036, type: 'sine' },
      { freq: FS.Fs5, delay: 0.52, dur: 0.42, peak: 0.03, type: 'sine' },
      { freq: FS.Cs5, delay: 0.54, dur: 0.38, peak: 0.018, type: 'triangle' }
    ],
    // Rising scale with resolving cadence
    [
      { freq: FS.Fs4, delay: 0.05, dur: 0.14, peak: 0.03, type: 'triangle' },
      { freq: FS.Gs4, delay: 0.16, dur: 0.14, peak: 0.032, type: 'triangle' },
      { freq: FS.As4, delay: 0.28, dur: 0.14, peak: 0.034, type: 'sine' },
      { freq: FS.Cs5, delay: 0.4, dur: 0.16, peak: 0.036, type: 'sine' },
      { freq: FS.Ds5, delay: 0.54, dur: 0.16, peak: 0.034, type: 'triangle' },
      { freq: FS.Fs5, delay: 0.7, dur: 0.38, peak: 0.03, type: 'sine' }
    ],
    // I–V–I–III leap then settle
    [
      { freq: FS.Fs5, delay: 0.06, dur: 0.2, peak: 0.034, type: 'triangle' },
      { freq: FS.Cs5, delay: 0.22, dur: 0.18, peak: 0.03, type: 'sine' },
      { freq: FS.Fs5, delay: 0.38, dur: 0.16, peak: 0.032, type: 'triangle' },
      { freq: FS.As5, delay: 0.52, dur: 0.2, peak: 0.034, type: 'sine' },
      { freq: FS.Cs6, delay: 0.72, dur: 0.36, peak: 0.028, type: 'sine' }
    ],
    // Call–response: low then bright answer
    [
      { freq: FS.Cs4, delay: 0.05, dur: 0.22, peak: 0.032, type: 'triangle' },
      { freq: FS.Fs4, delay: 0.18, dur: 0.2, peak: 0.03, type: 'sine' },
      { freq: FS.As5, delay: 0.42, dur: 0.16, peak: 0.034, type: 'triangle' },
      { freq: FS.Cs6, delay: 0.56, dur: 0.16, peak: 0.032, type: 'sine' },
      { freq: FS.Fs6, delay: 0.72, dur: 0.34, peak: 0.026, type: 'sine' }
    ],
    // Descending cascade into tonic
    [
      { freq: FS.Cs6, delay: 0.05, dur: 0.16, peak: 0.034, type: 'triangle' },
      { freq: FS.As5, delay: 0.18, dur: 0.16, peak: 0.032, type: 'triangle' },
      { freq: FS.Fs5, delay: 0.32, dur: 0.16, peak: 0.03, type: 'sine' },
      { freq: FS.Cs5, delay: 0.46, dur: 0.18, peak: 0.03, type: 'sine' },
      { freq: FS.As4, delay: 0.62, dur: 0.18, peak: 0.028, type: 'triangle' },
      { freq: FS.Fs4, delay: 0.8, dur: 0.32, peak: 0.03, type: 'sine' }
    ],
    // Soft triad stack with melody on top
    [
      { freq: FS.Fs4, delay: 0.06, dur: 0.7, peak: 0.02, type: 'sine' },
      { freq: FS.As4, delay: 0.08, dur: 0.68, peak: 0.018, type: 'sine' },
      { freq: FS.Cs5, delay: 0.1, dur: 0.66, peak: 0.016, type: 'triangle' },
      { freq: FS.Fs5, delay: 0.28, dur: 0.18, peak: 0.034, type: 'triangle' },
      { freq: FS.Gs5, delay: 0.44, dur: 0.16, peak: 0.032, type: 'sine' },
      { freq: FS.As5, delay: 0.58, dur: 0.36, peak: 0.03, type: 'sine' }
    ],
    // Pentatonic skip (I–II–III–V–VI–I)
    [
      { freq: FS.Fs4, delay: 0.05, dur: 0.14, peak: 0.03, type: 'triangle' },
      { freq: FS.Gs4, delay: 0.16, dur: 0.12, peak: 0.032, type: 'triangle' },
      { freq: FS.As4, delay: 0.26, dur: 0.12, peak: 0.034, type: 'sine' },
      { freq: FS.Cs5, delay: 0.38, dur: 0.14, peak: 0.036, type: 'sine' },
      { freq: FS.Ds5, delay: 0.5, dur: 0.14, peak: 0.034, type: 'triangle' },
      { freq: FS.Fs5, delay: 0.64, dur: 0.4, peak: 0.03, type: 'sine' }
    ],
    // Syncopated lift then hold
    [
      { freq: FS.As4, delay: 0.05, dur: 0.12, peak: 0.032, type: 'triangle' },
      { freq: FS.Cs5, delay: 0.14, dur: 0.22, peak: 0.034, type: 'sine' },
      { freq: FS.Fs5, delay: 0.4, dur: 0.14, peak: 0.036, type: 'triangle' },
      { freq: FS.As5, delay: 0.52, dur: 0.14, peak: 0.034, type: 'sine' },
      { freq: FS.Cs6, delay: 0.66, dur: 0.42, peak: 0.028, type: 'sine' },
      { freq: FS.Fs5, delay: 0.68, dur: 0.38, peak: 0.016, type: 'triangle' }
    ],
    // Gentle turnaround (V–VI–V–I)
    [
      { freq: FS.Cs5, delay: 0.06, dur: 0.18, peak: 0.032, type: 'triangle' },
      { freq: FS.Ds5, delay: 0.22, dur: 0.16, peak: 0.034, type: 'sine' },
      { freq: FS.Cs5, delay: 0.38, dur: 0.16, peak: 0.03, type: 'triangle' },
      { freq: FS.As4, delay: 0.52, dur: 0.16, peak: 0.03, type: 'sine' },
      { freq: FS.Fs5, delay: 0.68, dur: 0.4, peak: 0.032, type: 'sine' },
      { freq: FS.Cs5, delay: 0.7, dur: 0.36, peak: 0.016, type: 'triangle' }
    ],
    // Bright close: arpeggio up, octave resolve
    [
      { freq: FS.Fs5, delay: 0.05, dur: 0.14, peak: 0.032, type: 'triangle' },
      { freq: FS.As5, delay: 0.16, dur: 0.14, peak: 0.034, type: 'triangle' },
      { freq: FS.Cs6, delay: 0.28, dur: 0.16, peak: 0.036, type: 'sine' },
      { freq: FS.Fs6, delay: 0.44, dur: 0.2, peak: 0.03, type: 'sine' },
      { freq: FS.Cs6, delay: 0.62, dur: 0.16, peak: 0.028, type: 'triangle' },
      { freq: FS.Fs5, delay: 0.76, dur: 0.36, peak: 0.03, type: 'sine' }
    ]
  ];

  function playEffectSound(id) {
    switch (id) {
      case 'fireworks':
        playNoiseBurst({ delay: 0.05, dur: 0.16, freq: 2200, peak: 0.05 });
        playNoiseBurst({ delay: 0.28, dur: 0.2, freq: 1400, peak: 0.045 });
        playNoiseBurst({ delay: 0.55, dur: 0.22, freq: 900, peak: 0.04 });
        playMelodySet(FIREWORKS_MOTIFS, { lowpass: 4800 });
        break;
      case 'confetti':
        playMelodySet(
          [
            [
              { freq: FS.Cs5, delay: 0, dur: 0.14, peak: 0.04, type: 'triangle' },
              { freq: FS.Ds5, delay: 0.07, dur: 0.14, peak: 0.042 },
              { freq: FS.Fs5, delay: 0.14, dur: 0.16, peak: 0.045 },
              { freq: FS.As5, delay: 0.22, dur: 0.28, peak: 0.04 },
              { freq: FS.Cs6, delay: 0.34, dur: 0.32, peak: 0.03, type: 'triangle' }
            ],
            [
              { freq: FS.Ds5, delay: 0, dur: 0.12, peak: 0.04, type: 'triangle' },
              { freq: FS.Fs5, delay: 0.08, dur: 0.12, peak: 0.042 },
              { freq: FS.Gs5, delay: 0.16, dur: 0.14, peak: 0.044 },
              { freq: FS.Cs6, delay: 0.28, dur: 0.3, peak: 0.038 }
            ],
            [
              { freq: FS.Fs5, delay: 0, dur: 0.1, peak: 0.042 },
              { freq: FS.As5, delay: 0.06, dur: 0.1, peak: 0.04 },
              { freq: FS.Cs6, delay: 0.12, dur: 0.12, peak: 0.042 },
              { freq: FS.Fs6, delay: 0.22, dur: 0.28, peak: 0.036, type: 'triangle' },
              { freq: FS.As6, delay: 0.38, dur: 0.24, peak: 0.028 }
            ]
          ],
          { lowpass: 4200 }
        );
        break;
      case 'hearts':
        playMelodySet(
          [
            [
              { freq: FS.Fs4, delay: 0, dur: 0.45, peak: 0.04, type: 'sine' },
              { freq: FS.As4, delay: 0.08, dur: 0.5, peak: 0.038 },
              { freq: FS.Cs5, delay: 0.18, dur: 0.55, peak: 0.035 },
              { freq: FS.Fs5, delay: 0.42, dur: 0.5, peak: 0.028, type: 'triangle' }
            ],
            [
              { freq: FS.Gs4, delay: 0, dur: 0.4, peak: 0.038, type: 'sine' },
              { freq: FS.B4, delay: 0.12, dur: 0.45, peak: 0.034 },
              { freq: FS.Ds5, delay: 0.28, dur: 0.55, peak: 0.03, type: 'triangle' }
            ],
            [
              { freq: FS.Cs4, delay: 0, dur: 0.5, peak: 0.036, type: 'triangle' },
              { freq: FS.Fs4, delay: 0.15, dur: 0.55, peak: 0.032 },
              { freq: FS.As4, delay: 0.35, dur: 0.6, peak: 0.028 }
            ]
          ],
          { lowpass: 2800 }
        );
        break;
      case 'sparkles':
        playMelodySet([
          [
            { freq: FS.As6, delay: 0, dur: 0.18, peak: 0.028, type: 'sine', attack: 0.005 },
            { freq: FS.Cs7, delay: 0.1, dur: 0.16, peak: 0.026, attack: 0.005 },
            { freq: FS.Fs7, delay: 0.2, dur: 0.2, peak: 0.024, attack: 0.005 },
            { freq: FS.Fs7, delay: 0.34, dur: 0.22, peak: 0.02, attack: 0.005 },
            { freq: FS.Ds7, delay: 0.5, dur: 0.18, peak: 0.022, attack: 0.005 }
          ],
          [
            { freq: FS.Cs7, delay: 0, dur: 0.12, peak: 0.026, attack: 0.004 },
            { freq: FS.Ds7, delay: 0.08, dur: 0.12, peak: 0.024, attack: 0.004 },
            { freq: FS.Fs7, delay: 0.18, dur: 0.14, peak: 0.022, attack: 0.004 },
            { freq: FS.As6, delay: 0.32, dur: 0.18, peak: 0.018, attack: 0.004 }
          ],
          [
            { freq: FS.Fs6, delay: 0, dur: 0.14, peak: 0.03, attack: 0.005 },
            { freq: FS.As6, delay: 0.12, dur: 0.14, peak: 0.028, attack: 0.005 },
            { freq: FS.Cs7, delay: 0.26, dur: 0.2, peak: 0.024, attack: 0.005 }
          ]
        ]);
        break;
      case 'shooting_stars':
        playMelodySet([
          [
            {
              freq: FS.As6,
              freqEnd: FS.Gs4,
              delay: 0.05,
              dur: 0.55,
              peak: 0.03,
              type: 'sine',
              attack: 0.01
            },
            { freq: FS.Cs6, delay: 0.45, dur: 0.35, peak: 0.028, type: 'triangle' },
            { freq: FS.Fs6, delay: 0.7, dur: 0.4, peak: 0.022 }
          ],
          [
            {
              freq: FS.Cs7,
              freqEnd: FS.Fs4,
              delay: 0,
              dur: 0.6,
              peak: 0.032,
              type: 'sine',
              attack: 0.008
            },
            { freq: FS.As5, delay: 0.5, dur: 0.3, peak: 0.024, type: 'triangle' }
          ]
        ]);
        break;
      case 'bubbles':
        playMelodySet(
          [
            [
              { freq: FS.Gs4, delay: 0, dur: 0.16, peak: 0.03, type: 'sine', freqEnd: FS.Ds5 },
              { freq: FS.Fs4, delay: 0.22, dur: 0.18, peak: 0.028, freqEnd: FS.Cs5 },
              { freq: FS.As4, delay: 0.48, dur: 0.2, peak: 0.03, freqEnd: FS.F5 },
              { freq: FS.Ds4, delay: 0.78, dur: 0.22, peak: 0.026, freqEnd: FS.B4 }
            ],
            [
              { freq: FS.Cs5, delay: 0, dur: 0.14, peak: 0.028, type: 'sine', freqEnd: FS.Fs5 },
              { freq: FS.Fs4, delay: 0.2, dur: 0.16, peak: 0.026, freqEnd: FS.Cs5 },
              { freq: FS.As4, delay: 0.42, dur: 0.18, peak: 0.028, freqEnd: FS.Ds5 }
            ]
          ],
          { lowpass: 1600 }
        );
        break;
      case 'aurora':
        playMelodySet(
          [
            [
              { freq: FS.Fs3, delay: 0, dur: 1.4, peak: 0.03, type: 'sine' },
              { freq: FS.As3, delay: 0.2, dur: 1.5, peak: 0.025, type: 'triangle' },
              { freq: FS.Cs4, delay: 0.45, dur: 1.6, peak: 0.022 },
              { freq: FS.Fs4, delay: 0.9, dur: 1.2, peak: 0.018 }
            ],
            [
              { freq: FS.Cs3, delay: 0, dur: 1.5, peak: 0.028, type: 'sine' },
              { freq: FS.Fs3, delay: 0.3, dur: 1.4, peak: 0.022, type: 'triangle' },
              { freq: FS.As3, delay: 0.7, dur: 1.3, peak: 0.018 }
            ]
          ],
          { lowpass: 1200, q: 0.4 }
        );
        break;
      case 'balloons':
        playMelodySet([
          [
            { freq: FS.Fs4, delay: 0, dur: 0.18, peak: 0.04, type: 'triangle' },
            { freq: FS.As4, delay: 0.2, dur: 0.18, peak: 0.038, type: 'triangle' },
            { freq: FS.Cs5, delay: 0.42, dur: 0.2, peak: 0.036, type: 'triangle' },
            { freq: FS.Fs5, delay: 0.68, dur: 0.28, peak: 0.03 }
          ],
          [
            { freq: FS.Gs4, delay: 0, dur: 0.16, peak: 0.038, type: 'triangle' },
            { freq: FS.B4, delay: 0.18, dur: 0.16, peak: 0.036, type: 'triangle' },
            { freq: FS.Ds5, delay: 0.36, dur: 0.18, peak: 0.034, type: 'triangle' },
            { freq: FS.Gs5, delay: 0.58, dur: 0.3, peak: 0.03 }
          ]
        ]);
        break;
      case 'petals':
        playMelodySet(
          [
            [
              { freq: FS.Cs5, delay: 0, dur: 0.5, peak: 0.03, type: 'sine' },
              { freq: FS.Ds5, delay: 0.25, dur: 0.55, peak: 0.028 },
              { freq: FS.Fs5, delay: 0.55, dur: 0.6, peak: 0.026, type: 'triangle' },
              { freq: FS.As5, delay: 0.95, dur: 0.7, peak: 0.022 }
            ],
            [
              { freq: FS.B4, delay: 0, dur: 0.55, peak: 0.028, type: 'sine' },
              { freq: FS.Ds5, delay: 0.3, dur: 0.6, peak: 0.024, type: 'triangle' },
              { freq: FS.Fs5, delay: 0.7, dur: 0.7, peak: 0.02 }
            ]
          ],
          { lowpass: 2400 }
        );
        break;
      case 'flowers':
        playMelodySet(
          [
            [
              { freq: FS.Fs4, delay: 0, dur: 0.35, peak: 0.032, type: 'sine' },
              { freq: FS.As4, delay: 0.12, dur: 0.4, peak: 0.03 },
              { freq: FS.Cs5, delay: 0.28, dur: 0.45, peak: 0.028, type: 'triangle' },
              { freq: FS.Fs5, delay: 0.5, dur: 0.5, peak: 0.024 },
              { freq: FS.As5, delay: 0.78, dur: 0.55, peak: 0.02, type: 'sine' }
            ],
            [
              { freq: FS.Cs4, delay: 0, dur: 0.4, peak: 0.03, type: 'sine' },
              { freq: FS.Fs4, delay: 0.15, dur: 0.4, peak: 0.028 },
              { freq: FS.As4, delay: 0.32, dur: 0.45, peak: 0.026, type: 'triangle' },
              { freq: FS.Cs5, delay: 0.55, dur: 0.55, peak: 0.022 }
            ]
          ],
          { lowpass: 2600 }
        );
        break;
      case 'rainbow':
        playMelodySet([
          [
            { freq: FS.Fs3, delay: 0, dur: 0.22, peak: 0.038 },
            { freq: FS.Gs3, delay: 0.12, dur: 0.22, peak: 0.038 },
            { freq: FS.As3, delay: 0.24, dur: 0.22, peak: 0.038 },
            { freq: FS.B3, delay: 0.36, dur: 0.22, peak: 0.038 },
            { freq: FS.Cs4, delay: 0.48, dur: 0.22, peak: 0.038 },
            { freq: FS.Ds4, delay: 0.6, dur: 0.22, peak: 0.038 },
            { freq: FS.F4, delay: 0.72, dur: 0.28, peak: 0.036 },
            { freq: FS.Fs4, delay: 0.9, dur: 0.45, peak: 0.034, type: 'triangle' }
          ],
          [
            { freq: FS.Cs4, delay: 0, dur: 0.18, peak: 0.036 },
            { freq: FS.Ds4, delay: 0.1, dur: 0.18, peak: 0.036 },
            { freq: FS.F4, delay: 0.2, dur: 0.18, peak: 0.036 },
            { freq: FS.Fs4, delay: 0.3, dur: 0.18, peak: 0.036 },
            { freq: FS.Gs4, delay: 0.4, dur: 0.18, peak: 0.036 },
            { freq: FS.As4, delay: 0.5, dur: 0.18, peak: 0.036 },
            { freq: FS.B4, delay: 0.6, dur: 0.18, peak: 0.034 },
            { freq: FS.Cs5, delay: 0.72, dur: 0.4, peak: 0.032, type: 'triangle' }
          ]
        ]);
        break;
      case 'disco':
        playMelodySet([
          [
            { freq: FS.Fs3, delay: 0, dur: 0.12, peak: 0.05, type: 'square', attack: 0.005 },
            { freq: FS.Cs4, delay: 0.18, dur: 0.12, peak: 0.045, type: 'square', attack: 0.005 },
            { freq: FS.Fs3, delay: 0.36, dur: 0.12, peak: 0.05, type: 'square', attack: 0.005 },
            { freq: FS.As3, delay: 0.54, dur: 0.14, peak: 0.042, type: 'square', attack: 0.005 },
            { freq: FS.Cs5, delay: 0.1, dur: 0.1, peak: 0.022, type: 'triangle' },
            { freq: FS.Fs5, delay: 0.4, dur: 0.1, peak: 0.022, type: 'triangle' },
            { freq: FS.As5, delay: 0.7, dur: 0.16, peak: 0.02, type: 'triangle' }
          ],
          [
            { freq: FS.Cs3, delay: 0, dur: 0.1, peak: 0.05, type: 'square', attack: 0.004 },
            { freq: FS.Fs3, delay: 0.14, dur: 0.1, peak: 0.048, type: 'square', attack: 0.004 },
            { freq: FS.Cs3, delay: 0.28, dur: 0.1, peak: 0.05, type: 'square', attack: 0.004 },
            { freq: FS.Gs3, delay: 0.42, dur: 0.12, peak: 0.045, type: 'square', attack: 0.004 },
            { freq: FS.Fs5, delay: 0.2, dur: 0.08, peak: 0.02, type: 'triangle' },
            { freq: FS.As5, delay: 0.5, dur: 0.1, peak: 0.022, type: 'triangle' }
          ]
        ]);
        playNoiseBurst({ delay: 0.05, dur: 0.08, freq: 3000, peak: 0.025, filterType: 'highpass' });
        playNoiseBurst({ delay: 0.4, dur: 0.08, freq: 2800, peak: 0.022, filterType: 'highpass' });
        break;
      case 'beep':
        soundBeep();
        break;
      case 'boop':
        soundBoop();
        break;
      case 'zap':
        soundZap();
        break;
      case 'thunder':
        soundThunder();
        break;
      case 'fanfare':
        soundFanfare();
        break;
      case 'fleur_de_lys':
        soundGensDuPays();
        break;
      case 'bonk':
        soundBonk();
        break;
      case 'laser':
        soundLaser();
        break;
      case 'coin':
        soundCoin();
        break;
      case 'drumroll':
        soundDrumroll();
        break;
      case 'banner':
        soundFanfare();
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

  function sanitizeBannerText(raw) {
    if (raw == null) return '';
    var text = String(raw).replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length > 48) text = text.slice(0, 48);
    return text;
  }

  function appendFlash(overlay) {
    var flash = document.createElement('div');
    flash.className = 'tp-fx-flash';
    overlay.appendChild(flash);
  }

  function appendBannerText(overlay, text, themeId) {
    var clean = sanitizeBannerText(text);
    if (!clean) return null;
    var theme = BANNER_THEMES[themeId] || BANNER_THEMES.banner;
    if (theme.flash) appendFlash(overlay);
    var wrap = document.createElement('div');
    wrap.className = 'tp-fx-banner ' + (theme.className || 'is-banner');
    var label = document.createElement('span');
    label.className = 'tp-fx-banner-text';
    label.textContent = clean;
    wrap.appendChild(label);
    overlay.appendChild(wrap);
    return wrap;
  }

  function buildPulseBlips(overlay, count, colorSet) {
    var colors = colorSet || COLORS.neon;
    for (var i = 0; i < count; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-blip';
      el.style.setProperty('--x', rand(12, 88) + '%');
      el.style.setProperty('--y', rand(18, 78) + '%');
      el.style.setProperty('--size', rand(10, 28) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 0.35) + 's');
      overlay.appendChild(el);
    }
  }

  function buildBeep(overlay) {
    appendFlash(overlay);
    buildPulseBlips(overlay, 8, ['#39ff14', '#00f0ff', '#fff']);
  }

  function buildBoop(overlay) {
    buildPulseBlips(overlay, 5, COLORS.cool);
  }

  function buildZap(overlay) {
    appendFlash(overlay);
    for (var i = 0; i < 6; i++) {
      var bolt = document.createElement('span');
      bolt.className = 'tp-fx-bolt';
      bolt.style.setProperty('--x', rand(15, 85) + '%');
      bolt.style.setProperty('--delay', i * 0.05 + 's');
      bolt.style.setProperty('--rot', rand(-25, 25) + 'deg');
      overlay.appendChild(bolt);
    }
  }

  function buildThunder(overlay) {
    appendFlash(overlay);
    var storm = document.createElement('div');
    storm.className = 'tp-fx-storm';
    overlay.appendChild(storm);
    for (var i = 0; i < 4; i++) {
      var bolt = document.createElement('span');
      bolt.className = 'tp-fx-bolt is-heavy';
      bolt.style.setProperty('--x', rand(20, 80) + '%');
      bolt.style.setProperty('--delay', i * 0.08 + 's');
      bolt.style.setProperty('--rot', rand(-18, 18) + 'deg');
      overlay.appendChild(bolt);
    }
  }

  function buildFanfare(overlay) {
    buildPulseBlips(overlay, 14, COLORS.warm);
  }

  function buildBonk(overlay) {
    var star = document.createElement('div');
    star.className = 'tp-fx-bonk-star';
    star.textContent = '*';
    overlay.appendChild(star);
  }

  function buildLaser(overlay) {
    for (var i = 0; i < 5; i++) {
      var beam = document.createElement('span');
      beam.className = 'tp-fx-laser-beam';
      beam.style.setProperty('--y', rand(20, 80) + '%');
      beam.style.setProperty('--delay', i * 0.06 + 's');
      beam.style.setProperty('--c', pick(COLORS.neon, i));
      overlay.appendChild(beam);
    }
  }

  function buildCoin(overlay) {
    buildPulseBlips(overlay, 10, ['#f5cd47', '#ffb347', '#fff']);
  }

  function buildDrumroll(overlay) {
    buildPulseBlips(overlay, 12, COLORS.party);
  }

  function buildBanner(overlay, text, themeId) {
    appendBannerText(overlay, text || '!', themeId || 'banner');
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

  function buildFlowers(overlay) {
    var colors = COLORS.flowers;
    var centers = ['#f5cd47', '#fff7ae', '#ffe8a3', '#fff'];
    for (var i = 0; i < 20; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-flower';
      el.style.setProperty('--x', rand(6, 94) + '%');
      el.style.setProperty('--size', rand(18, 34) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--center', pick(centers, i));
      el.style.setProperty('--delay', rand(0, 0.85) + 's');
      el.style.setProperty('--dur', rand(2.4, 3.2) + 's');
      el.style.setProperty('--drift', rand(-55, 55) + 'px');
      el.style.setProperty('--spin', rand(-40, 40) + 'deg');
      overlay.appendChild(el);
    }
  }

  function buildFleurDeLys(overlay) {
    var wash = document.createElement('div');
    wash.className = 'tp-fx-quebec-wash';
    overlay.appendChild(wash);

    var cross = document.createElement('div');
    cross.className = 'tp-fx-quebec-cross';
    overlay.appendChild(cross);

    var colors = COLORS.quebec;
    for (var i = 0; i < 24; i++) {
      var el = document.createElement('span');
      el.className = 'tp-fx-fleur';
      el.textContent = '\u269C';
      el.style.setProperty('--x', rand(4, 96) + '%');
      el.style.setProperty('--size', rand(44, 88) + 'px');
      el.style.setProperty('--c', pick(colors, i));
      el.style.setProperty('--delay', rand(0, 1.1) + 's');
      el.style.setProperty('--dur', rand(3.2, 4.4) + 's');
      el.style.setProperty('--drift', rand(-70, 70) + 'px');
      el.style.setProperty('--spin', rand(-50, 50) + 'deg');
      overlay.appendChild(el);
    }
    for (var j = 0; j < 14; j++) {
      var spark = document.createElement('span');
      spark.className = 'tp-fx-sparkle';
      spark.style.setProperty('--x', rand(8, 92) + '%');
      spark.style.setProperty('--y', rand(10, 78) + '%');
      spark.style.setProperty('--size', rand(6, 14) + 'px');
      spark.style.setProperty('--c', j % 2 === 0 ? '#ffffff' : '#003399');
      spark.style.setProperty('--delay', rand(0.2, 1.6) + 's');
      spark.style.setProperty('--dur', rand(1.1, 1.8) + 's');
      overlay.appendChild(spark);
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
    flowers: buildFlowers,
    fleur_de_lys: buildFleurDeLys,
    rainbow: buildRainbow,
    disco: buildDisco,
    beep: buildBeep,
    boop: buildBoop,
    zap: buildZap,
    thunder: buildThunder,
    fanfare: buildFanfare,
    bonk: buildBonk,
    laser: buildLaser,
    coin: buildCoin,
    drumroll: buildDrumroll,
    banner: buildBanner
  };

  /**
   * @param {string} name
   * @param {{ root?: Element, sound?: boolean|string, text?: string, clearOthers?: boolean }|Element} [options]
   * @returns {{ ok: boolean, effect?: string, error?: string, text?: string }}
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

    var bannerText = sanitizeBannerText(
      opts.text != null ? opts.text : opts.label != null ? opts.label : opts.message
    );
    if (id === 'banner' && !bannerText) {
      return { ok: false, effect: id, error: 'Texte requis pour banner' };
    }

    if (opts.clearOthers !== false) {
      clearEffects(mount);
    }

    var soundId = id;
    if (typeof opts.sound === 'string') {
      soundId = normalizeEffectId(opts.sound) || id;
    } else if (typeof opts.soundEffect === 'string') {
      soundId = normalizeEffectId(opts.soundEffect) || id;
    } else if (typeof opts.sfx === 'string') {
      soundId = normalizeEffectId(opts.sfx) || id;
    }

    var playSound = opts.sound !== false;
    if (playSound) playEffectSound(soundId);

    if (prefersReducedMotion()) {
      return { ok: true, effect: id, text: bannerText || undefined, reducedMotion: true };
    }

    var overlay = makeRoot(id, mount);
    var duration = EFFECT_META[id].ms;

    if (id === 'banner') {
      buildBanner(overlay, bannerText, soundId);
      duration = Math.max(duration, 1800 + Math.min(bannerText.length, 24) * 20);
    } else {
      var builder = BUILDERS[id];
      if (!builder) return { ok: false, effect: id, error: 'Builder manquant' };
      builder(overlay);
      if (bannerText) {
        appendBannerText(overlay, bannerText, id);
        duration = Math.max(duration, 2000);
      }
    }

    scheduleClear(overlay, duration + 200);
    return { ok: true, effect: id, text: bannerText || undefined, sound: soundId };
  }

  global.CelebrationEffects = {
    EFFECTS: listEffects(),
    META: EFFECT_META,
    FIREWORKS_MOTIFS: FIREWORKS_MOTIFS,
    list: listEffects,
    normalize: normalizeEffectId,
    label: effectLabel,
    play: play,
    clear: clearEffects,
    playSound: playEffectSound,
    playProgressTick: playProgressTick,
    playProgressMilestone: playProgressMilestone,
    playSubtaskPop: playSubtaskPop,
    playUiSound: playUiSound,
  };
})(typeof window !== 'undefined' ? window : this);
