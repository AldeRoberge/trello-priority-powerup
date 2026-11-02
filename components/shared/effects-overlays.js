/**
 * effects: part 2 of 2 (playEffectSound).
 * Names are shared with the other parts through window.EffectsParts (see effects.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.EffectsParts = global.EffectsParts || {});

  // from earlier parts (values)
  var BANNER_THEMES = S.BANNER_THEMES;
  var COLORS = S.COLORS;
  var EFFECT_META = S.EFFECT_META;
  var FIREWORKS_MOTIFS = S.FIREWORKS_MOTIFS;
  var FS = S.FS;
  var ROOT_ATTR = S.ROOT_ATTR;

  // from other parts (functions, resolved at call time)
  function effectLabel() { return S.effectLabel.apply(this, arguments); }
  function listEffects() { return S.listEffects.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function playMelodySet() { return S.playMelodySet.apply(this, arguments); }
  function playNoiseBurst() { return S.playNoiseBurst.apply(this, arguments); }
  function playProgressMilestone() { return S.playProgressMilestone.apply(this, arguments); }
  function playProgressTick() { return S.playProgressTick.apply(this, arguments); }
  function playSubtaskPop() { return S.playSubtaskPop.apply(this, arguments); }
  function playUiSound() { return S.playUiSound.apply(this, arguments); }
  function prefersReducedMotion() { return S.prefersReducedMotion.apply(this, arguments); }
  function rand() { return S.rand.apply(this, arguments); }
  function soundBeep() { return S.soundBeep.apply(this, arguments); }
  function soundBonk() { return S.soundBonk.apply(this, arguments); }
  function soundBoop() { return S.soundBoop.apply(this, arguments); }
  function soundCoin() { return S.soundCoin.apply(this, arguments); }
  function soundDrumroll() { return S.soundDrumroll.apply(this, arguments); }
  function soundFanfare() { return S.soundFanfare.apply(this, arguments); }
  function soundGensDuPays() { return S.soundGensDuPays.apply(this, arguments); }
  function soundLaser() { return S.soundLaser.apply(this, arguments); }
  function soundThunder() { return S.soundThunder.apply(this, arguments); }
  function soundZap() { return S.soundZap.apply(this, arguments); }

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

  // ── 4. DOM overlay builders (one build* per effect id) ──────────────────

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

  // exports
  S.BUILDERS = BUILDERS;
  S.appendBannerText = appendBannerText;
  S.appendFlash = appendFlash;
  S.buildAurora = buildAurora;
  S.buildBalloons = buildBalloons;
  S.buildBanner = buildBanner;
  S.buildBeep = buildBeep;
  S.buildBonk = buildBonk;
  S.buildBoop = buildBoop;
  S.buildBubbles = buildBubbles;
  S.buildCoin = buildCoin;
  S.buildConfetti = buildConfetti;
  S.buildDisco = buildDisco;
  S.buildDrumroll = buildDrumroll;
  S.buildFanfare = buildFanfare;
  S.buildFireworks = buildFireworks;
  S.buildFleurDeLys = buildFleurDeLys;
  S.buildFlowers = buildFlowers;
  S.buildHearts = buildHearts;
  S.buildLaser = buildLaser;
  S.buildPetals = buildPetals;
  S.buildPulseBlips = buildPulseBlips;
  S.buildRainbow = buildRainbow;
  S.buildShootingStars = buildShootingStars;
  S.buildSparkles = buildSparkles;
  S.buildThunder = buildThunder;
  S.buildZap = buildZap;
  S.clearEffects = clearEffects;
  S.makeRoot = makeRoot;
  S.pick = pick;
  S.play = play;
  S.playEffectSound = playEffectSound;
  S.sanitizeBannerText = sanitizeBannerText;
  S.scheduleClear = scheduleClear;
})(typeof window !== 'undefined' ? window : this);
