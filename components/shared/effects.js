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
    banner: { label: 'Banni\u00e8re', ms: 2400 }
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
    title_card: 'banner'
  };

  var COLORS = {
    party: ['#22a06b', '#4bce97', '#f5cd47', '#ff8f73', '#579dff', '#9f8fef', '#fff'],
    hearts: ['#ff8f73', '#ff5c8a', '#e5688f', '#ffb3c7', '#f87171'],
    flowers: ['#ff8f73', '#ff5c8a', '#f5cd47', '#9f8fef', '#579dff', '#fda4af', '#fbcfe8'],
    cool: ['#579dff', '#4bce97', '#9f8fef', '#6ee7b7', '#93c5fd'],
    warm: ['#f5cd47', '#ff8f73', '#fb923c', '#fbbf24', '#fff'],
    neon: ['#39ff14', '#00f0ff', '#ff2bd6', '#ffe600', '#ffffff']
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

  function soundBonk() {
    playMelodySet([
      [{ freq: FS.Fs3, delay: 0, dur: 0.22, peak: 0.07, type: 'sine', freqEnd: FS.Fs2, attack: 0.005 }],
      [{ freq: FS.As3, delay: 0, dur: 0.18, peak: 0.065, type: 'triangle', freqEnd: FS.Fs2, attack: 0.004 }],
      [
        { freq: FS.Gs3, delay: 0, dur: 0.14, peak: 0.07, type: 'sine', freqEnd: FS.Cs3 },
        { freq: FS.Fs2, delay: 0.08, dur: 0.2, peak: 0.04, type: 'triangle', freqEnd: 46.25 }
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

  function playEffectSound(id) {
    switch (id) {
      case 'fireworks':
        playNoiseBurst({ delay: 0.05, dur: 0.16, freq: 2200, peak: 0.05 });
        playNoiseBurst({ delay: 0.28, dur: 0.2, freq: 1400, peak: 0.045 });
        playNoiseBurst({ delay: 0.55, dur: 0.22, freq: 900, peak: 0.04 });
        playRandomToneSet([
          [
            { freq: 740, delay: 0.08, dur: 0.35, peak: 0.035, type: 'triangle' },
            { freq: 988, delay: 0.32, dur: 0.4, peak: 0.032, type: 'triangle' },
            { freq: 1175, delay: 0.6, dur: 0.45, peak: 0.028, type: 'sine' }
          ],
          [
            { freq: 659, delay: 0.05, dur: 0.3, peak: 0.03, type: 'triangle' },
            { freq: 880, delay: 0.25, dur: 0.35, peak: 0.034 },
            { freq: 1318, delay: 0.5, dur: 0.4, peak: 0.028, type: 'sine' }
          ],
          [
            { freq: 523, delay: 0.1, dur: 0.25, peak: 0.032 },
            { freq: 784, delay: 0.3, dur: 0.3, peak: 0.03, type: 'triangle' },
            { freq: 1046, delay: 0.55, dur: 0.42, peak: 0.03 }
          ]
        ]);
        break;
      case 'confetti':
        playRandomToneSet(
          [
            [
              { freq: 523.25, delay: 0, dur: 0.14, peak: 0.04, type: 'triangle' },
              { freq: 659.25, delay: 0.07, dur: 0.14, peak: 0.042 },
              { freq: 783.99, delay: 0.14, dur: 0.16, peak: 0.045 },
              { freq: 1046.5, delay: 0.22, dur: 0.28, peak: 0.04 },
              { freq: 1318.5, delay: 0.34, dur: 0.32, peak: 0.03, type: 'triangle' }
            ],
            [
              { freq: 587, delay: 0, dur: 0.12, peak: 0.04, type: 'triangle' },
              { freq: 740, delay: 0.08, dur: 0.12, peak: 0.042 },
              { freq: 880, delay: 0.16, dur: 0.14, peak: 0.044 },
              { freq: 1175, delay: 0.28, dur: 0.3, peak: 0.038 }
            ],
            [
              { freq: 659, delay: 0, dur: 0.1, peak: 0.042 },
              { freq: 784, delay: 0.06, dur: 0.1, peak: 0.04 },
              { freq: 988, delay: 0.12, dur: 0.12, peak: 0.042 },
              { freq: 1318, delay: 0.22, dur: 0.28, peak: 0.036, type: 'triangle' },
              { freq: 1568, delay: 0.38, dur: 0.24, peak: 0.028 }
            ]
          ],
          { lowpass: 4200 }
        );
        break;
      case 'hearts':
        playRandomToneSet(
          [
            [
              { freq: 349.23, delay: 0, dur: 0.45, peak: 0.04, type: 'sine' },
              { freq: 440, delay: 0.08, dur: 0.5, peak: 0.038 },
              { freq: 523.25, delay: 0.18, dur: 0.55, peak: 0.035 },
              { freq: 659.25, delay: 0.42, dur: 0.5, peak: 0.028, type: 'triangle' }
            ],
            [
              { freq: 392, delay: 0, dur: 0.4, peak: 0.038, type: 'sine' },
              { freq: 494, delay: 0.12, dur: 0.45, peak: 0.034 },
              { freq: 587, delay: 0.28, dur: 0.55, peak: 0.03, type: 'triangle' }
            ],
            [
              { freq: 330, delay: 0, dur: 0.5, peak: 0.036, type: 'triangle' },
              { freq: 415, delay: 0.15, dur: 0.55, peak: 0.032 },
              { freq: 554, delay: 0.35, dur: 0.6, peak: 0.028 }
            ]
          ],
          { lowpass: 2800 }
        );
        break;
      case 'sparkles':
        playRandomToneSet([
          [
            { freq: 1760, delay: 0, dur: 0.18, peak: 0.028, type: 'sine', attack: 0.005 },
            { freq: 2093, delay: 0.1, dur: 0.16, peak: 0.026, attack: 0.005 },
            { freq: 2637, delay: 0.2, dur: 0.2, peak: 0.024, attack: 0.005 },
            { freq: 3136, delay: 0.34, dur: 0.22, peak: 0.02, attack: 0.005 },
            { freq: 2349, delay: 0.5, dur: 0.18, peak: 0.022, attack: 0.005 }
          ],
          [
            { freq: 2093, delay: 0, dur: 0.12, peak: 0.026, attack: 0.004 },
            { freq: 2637, delay: 0.08, dur: 0.12, peak: 0.024, attack: 0.004 },
            { freq: 3136, delay: 0.18, dur: 0.14, peak: 0.022, attack: 0.004 },
            { freq: 3520, delay: 0.32, dur: 0.18, peak: 0.018, attack: 0.004 }
          ],
          [
            { freq: 1568, delay: 0, dur: 0.14, peak: 0.03, attack: 0.005 },
            { freq: 1976, delay: 0.12, dur: 0.14, peak: 0.028, attack: 0.005 },
            { freq: 2489, delay: 0.26, dur: 0.2, peak: 0.024, attack: 0.005 }
          ]
        ]);
        break;
      case 'shooting_stars':
        playRandomToneSet([
          [
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
          ],
          [
            {
              freq: 2200,
              freqEnd: 360,
              delay: 0,
              dur: 0.6,
              peak: 0.032,
              type: 'sine',
              attack: 0.008
            },
            { freq: 1568, delay: 0.5, dur: 0.3, peak: 0.024, type: 'triangle' }
          ]
        ]);
        break;
      case 'bubbles':
        playRandomToneSet(
          [
            [
              { freq: 420, delay: 0, dur: 0.16, peak: 0.03, type: 'sine', freqEnd: 620 },
              { freq: 380, delay: 0.22, dur: 0.18, peak: 0.028, freqEnd: 560 },
              { freq: 460, delay: 0.48, dur: 0.2, peak: 0.03, freqEnd: 700 },
              { freq: 340, delay: 0.78, dur: 0.22, peak: 0.026, freqEnd: 520 }
            ],
            [
              { freq: 500, delay: 0, dur: 0.14, peak: 0.028, type: 'sine', freqEnd: 720 },
              { freq: 360, delay: 0.2, dur: 0.16, peak: 0.026, freqEnd: 540 },
              { freq: 480, delay: 0.42, dur: 0.18, peak: 0.028, freqEnd: 680 }
            ]
          ],
          { lowpass: 1600 }
        );
        break;
      case 'aurora':
        playRandomToneSet(
          [
            [
              { freq: 196, delay: 0, dur: 1.4, peak: 0.03, type: 'sine' },
              { freq: 246.94, delay: 0.2, dur: 1.5, peak: 0.025, type: 'triangle' },
              { freq: 293.66, delay: 0.45, dur: 1.6, peak: 0.022 },
              { freq: 392, delay: 0.9, dur: 1.2, peak: 0.018 }
            ],
            [
              { freq: 174, delay: 0, dur: 1.5, peak: 0.028, type: 'sine' },
              { freq: 220, delay: 0.3, dur: 1.4, peak: 0.022, type: 'triangle' },
              { freq: 329, delay: 0.7, dur: 1.3, peak: 0.018 }
            ]
          ],
          { lowpass: 1200, q: 0.4 }
        );
        break;
      case 'balloons':
        playRandomToneSet([
          [
            { freq: 392, delay: 0, dur: 0.18, peak: 0.04, type: 'triangle' },
            { freq: 494, delay: 0.2, dur: 0.18, peak: 0.038, type: 'triangle' },
            { freq: 587, delay: 0.42, dur: 0.2, peak: 0.036, type: 'triangle' },
            { freq: 740, delay: 0.68, dur: 0.28, peak: 0.03 }
          ],
          [
            { freq: 349, delay: 0, dur: 0.16, peak: 0.038, type: 'triangle' },
            { freq: 440, delay: 0.18, dur: 0.16, peak: 0.036, type: 'triangle' },
            { freq: 523, delay: 0.36, dur: 0.18, peak: 0.034, type: 'triangle' },
            { freq: 698, delay: 0.58, dur: 0.3, peak: 0.03 }
          ]
        ]);
        break;
      case 'petals':
        playRandomToneSet(
          [
            [
              { freq: 523.25, delay: 0, dur: 0.5, peak: 0.03, type: 'sine' },
              { freq: 587.33, delay: 0.25, dur: 0.55, peak: 0.028 },
              { freq: 698.46, delay: 0.55, dur: 0.6, peak: 0.026, type: 'triangle' },
              { freq: 880, delay: 0.95, dur: 0.7, peak: 0.022 }
            ],
            [
              { freq: 494, delay: 0, dur: 0.55, peak: 0.028, type: 'sine' },
              { freq: 622, delay: 0.3, dur: 0.6, peak: 0.024, type: 'triangle' },
              { freq: 784, delay: 0.7, dur: 0.7, peak: 0.02 }
            ]
          ],
          { lowpass: 2400 }
        );
        break;
      case 'flowers':
        playRandomToneSet(
          [
            [
              { freq: 392, delay: 0, dur: 0.35, peak: 0.032, type: 'sine' },
              { freq: 523.25, delay: 0.12, dur: 0.4, peak: 0.03 },
              { freq: 659.25, delay: 0.28, dur: 0.45, peak: 0.028, type: 'triangle' },
              { freq: 783.99, delay: 0.5, dur: 0.5, peak: 0.024 },
              { freq: 987.77, delay: 0.78, dur: 0.55, peak: 0.02, type: 'sine' }
            ],
            [
              { freq: 349.23, delay: 0, dur: 0.4, peak: 0.03, type: 'sine' },
              { freq: 440, delay: 0.15, dur: 0.4, peak: 0.028 },
              { freq: 554.37, delay: 0.32, dur: 0.45, peak: 0.026, type: 'triangle' },
              { freq: 698.46, delay: 0.55, dur: 0.55, peak: 0.022 }
            ]
          ],
          { lowpass: 2600 }
        );
        break;
      case 'rainbow':
        playRandomToneSet([
          [
            { freq: 261.63, delay: 0, dur: 0.22, peak: 0.038 },
            { freq: 293.66, delay: 0.12, dur: 0.22, peak: 0.038 },
            { freq: 329.63, delay: 0.24, dur: 0.22, peak: 0.038 },
            { freq: 349.23, delay: 0.36, dur: 0.22, peak: 0.038 },
            { freq: 392, delay: 0.48, dur: 0.22, peak: 0.038 },
            { freq: 440, delay: 0.6, dur: 0.22, peak: 0.038 },
            { freq: 493.88, delay: 0.72, dur: 0.28, peak: 0.036 },
            { freq: 523.25, delay: 0.9, dur: 0.45, peak: 0.034, type: 'triangle' }
          ],
          [
            { freq: 293.66, delay: 0, dur: 0.18, peak: 0.036 },
            { freq: 329.63, delay: 0.1, dur: 0.18, peak: 0.036 },
            { freq: 369.99, delay: 0.2, dur: 0.18, peak: 0.036 },
            { freq: 415.3, delay: 0.3, dur: 0.18, peak: 0.036 },
            { freq: 466.16, delay: 0.4, dur: 0.18, peak: 0.036 },
            { freq: 523.25, delay: 0.5, dur: 0.18, peak: 0.036 },
            { freq: 587.33, delay: 0.6, dur: 0.18, peak: 0.034 },
            { freq: 659.25, delay: 0.72, dur: 0.4, peak: 0.032, type: 'triangle' }
          ]
        ]);
        break;
      case 'disco':
        playRandomToneSet([
          [
            { freq: 110, delay: 0, dur: 0.12, peak: 0.05, type: 'square', attack: 0.005 },
            { freq: 146.83, delay: 0.18, dur: 0.12, peak: 0.045, type: 'square', attack: 0.005 },
            { freq: 110, delay: 0.36, dur: 0.12, peak: 0.05, type: 'square', attack: 0.005 },
            { freq: 174.61, delay: 0.54, dur: 0.14, peak: 0.042, type: 'square', attack: 0.005 },
            { freq: 659.25, delay: 0.1, dur: 0.1, peak: 0.022, type: 'triangle' },
            { freq: 783.99, delay: 0.4, dur: 0.1, peak: 0.022, type: 'triangle' },
            { freq: 987.77, delay: 0.7, dur: 0.16, peak: 0.02, type: 'triangle' }
          ],
          [
            { freq: 98, delay: 0, dur: 0.1, peak: 0.05, type: 'square', attack: 0.004 },
            { freq: 130, delay: 0.14, dur: 0.1, peak: 0.048, type: 'square', attack: 0.004 },
            { freq: 98, delay: 0.28, dur: 0.1, peak: 0.05, type: 'square', attack: 0.004 },
            { freq: 164, delay: 0.42, dur: 0.12, peak: 0.045, type: 'square', attack: 0.004 },
            { freq: 740, delay: 0.2, dur: 0.08, peak: 0.02, type: 'triangle' },
            { freq: 880, delay: 0.5, dur: 0.1, peak: 0.022, type: 'triangle' }
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
    list: listEffects,
    normalize: normalizeEffectId,
    label: effectLabel,
    play: play,
    clear: clearEffects,
    playSound: playEffectSound
  };
})(typeof window !== 'undefined' ? window : this);
