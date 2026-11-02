/**
 * effects-sounds: part 2 of 2 (playUiSound).
 * Names are shared with the other parts through window.EffectsParts (see effects-sounds.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.EffectsParts = global.EffectsParts || {});

  // from earlier parts (values)
  var FS = S.FS;

  // from other parts (functions, resolved at call time)
  function playNoiseBurst() { return S.playNoiseBurst.apply(this, arguments); }
  function playSubtaskPopSound() { return S.playSubtaskPopSound.apply(this, arguments); }
  function playTones() { return S.playTones.apply(this, arguments); }
  function prefersReducedMotion() { return S.prefersReducedMotion.apply(this, arguments); }
  function pick() { return S.pick.apply(this, arguments); }
  function scheduleClear() { return S.scheduleClear.apply(this, arguments); }

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

  // exports
  S.FIREWORKS_MOTIFS = FIREWORKS_MOTIFS;
  S.playSubtaskPop = playSubtaskPop;
  S.playUiSound = playUiSound;
})(typeof window !== 'undefined' ? window : this);
