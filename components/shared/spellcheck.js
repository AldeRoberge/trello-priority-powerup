/**
 * Spellcheck module — automatic orthography fixes via the configured AI provider.
 * Only applies corrections when the model is certain the change is a spelling
 * typo (not an unknown word, proper noun, jargon, or stylistic rewrite).
 * Exposes window.Spellcheck (no bundler).
 */
(function (global) {
  'use strict';

  var context = { t: null };

  var SYSTEM_PROMPT = [
    'Tu es un correcteur orthographique strict pour du fran\u00e7ais.',
    'On te donne un texte saisi par un utilisateur (sous-t\u00e2che, motif, description, message).',
    'Il peut faire une ligne ou plusieurs\u00a0; pr\u00e9serve les retours \u00e0 la ligne.',
    'R\u00e9ponds UNIQUEMENT avec un objet JSON\u00a0:',
    '{"corrected":"<texte>","changed":true|false,"certain":true|false}',
    '',
    'R\u00e8gles ABSOLUES\u00a0:',
    '- Corrige seulement les fautes d\u2019orthographe \u00e9videntes\u00a0: accents manquants,',
    '  apostrophes, lettres doubl\u00e9es/oubli\u00e9es, typos claires (ex. \u00ab\u00a0letat\u00a0\u00bb \u2192 \u00ab\u00a0l\'\u00e9tat\u00a0\u00bb,',
    '  \u00ab\u00a0Evaluation\u00a0\u00bb \u2192 \u00ab\u00a0\u00c9valuation\u00a0\u00bb).',
    '- Si tu n\u2019es pas \u00e0 100\u00a0% s\u00fbr qu\u2019un mot est une faute (mot inconnu, nom propre,',
    '  sigle, jargon, n\u00e9ologisme, anglicisme intentionnel)\u00a0: NE CHANGE PAS ce mot',
    '  et mets certain=false (ou changed=false).',
    '- Ne reformule jamais, ne change pas le sens, le style ni le choix des mots.',
    '- Ne corrige pas la grammaire hors orthographe \u00e9vidente, ni la ponctuation',
    '  sauf apostrophes d\u2019\u00e9lision manquantes.',
    '- Pr\u00e9serve la casse volontaire sauf majuscule initiale fr apparemment oubli\u00e9e',
    '  pour un mot qui l\u2019exige (\u00c9valuation, etc.).',
    '- Si aucune correction certaine\u00a0: {"corrected":"<texte d\'origine>","changed":false,"certain":true}',
    '- Mets changed=true UNIQUEMENT si chaque modification est une faute d\u2019orthographe',
    '  dont tu es certain (certain doit alors \u00eatre true).'
  ].join('\n');

  function configure(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(opts, 't')) {
      context.t = opts.t || null;
    }
  }

  function wordCount(text) {
    var parts = String(text || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts.length;
  }

  /**
   * Safety net: reject model "rewrites" that go beyond local spelling fixes.
   */
  function isPlausibleSpellingFix(original, corrected) {
    if (typeof corrected !== 'string') return false;
    var a = original.trim();
    var b = corrected.trim();
    if (!b || a === b) return false;
    var words = wordCount(a);
    // Allow a few more word-count shifts on longer texts (apostrophe splits, etc.).
    var maxWordDelta = Math.max(1, Math.min(8, Math.floor(words / 20)));
    if (Math.abs(words - wordCount(b)) > maxWordDelta) return false;
    var ratio = b.length / Math.max(a.length, 1);
    if (ratio < 0.7 || ratio > 1.45) return false;
    return true;
  }

  function maxTokensFor(text) {
    // JSON wraps the full corrected string — scale with input length.
    return Math.min(2500, Math.max(180, Math.ceil(String(text || '').length * 0.65) + 100));
  }

  function parsePayload(rawContent, original) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return original;
    }
    var text = rawContent.trim();
    // Tolerate accidental markdown fences.
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start < 0 || end <= start) return original;
      try {
        data = JSON.parse(text.slice(start, end + 1));
      } catch (err2) {
        return original;
      }
    }
    if (!data || typeof data !== 'object') return original;
    if (data.changed !== true || data.certain !== true) return original;
    var corrected = typeof data.corrected === 'string' ? data.corrected.trim() : '';
    if (!isPlausibleSpellingFix(original, corrected)) return original;
    return corrected;
  }

  /**
   * @param {string} text
   * @returns {Promise<string>} original or certain spelling-corrected text
   */
  async function correct(text) {
    var original = typeof text === 'string' ? text.trim() : '';
    if (!original) return original;

    var Agent = global.PriorityAgent;
    if (!Agent || typeof Agent.getProvider !== 'function' || typeof Agent.chatCompletions !== 'function') {
      return original;
    }

    var provider;
    try {
      provider = await Agent.getProvider(context.t);
    } catch (err) {
      console.error('Spellcheck.getProvider failed', err);
      return original;
    }

    if (typeof Agent.isConfigured === 'function' && !Agent.isConfigured(provider)) {
      return original;
    }

    try {
      var response = await Agent.chatCompletions(
        provider,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: original }
        ],
        {
          temperature: 0,
          jsonMode: true,
          max_tokens: maxTokensFor(original),
          stream: false
        }
      );
      var content =
        response && typeof response.content === 'string' ? response.content : '';
      return parsePayload(content, original);
    } catch (err) {
      console.error('Spellcheck.correct failed', err);
      return original;
    }
  }

  var REVERT_TIMEOUT_MS = 10000;

  /**
   * Temporary undo control after an AI spelling fix was applied in the UI.
   * @param {HTMLElement} hostEl
   * @param {{
   *   onRevert: function(): void,
   *   onDismiss?: function(): void,
   *   before?: HTMLElement|null,
   *   timeoutMs?: number,
   *   className?: string,
   *   ariaLabel?: string,
   *   title?: string
   * }} options
   * @returns {{ dismiss: function(): void, el: HTMLButtonElement }|null}
   */
  function attachRevert(hostEl, options) {
    options = options || {};
    if (!hostEl || typeof document === 'undefined') return null;

    var prior = hostEl.querySelectorAll('.tp-spell-revert');
    for (var i = 0; i < prior.length; i++) {
      if (typeof prior[i]._spellRevertDismiss === 'function') {
        prior[i]._spellRevertDismiss();
      } else if (prior[i].parentNode) {
        prior[i].parentNode.removeChild(prior[i]);
      }
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'tp-spell-revert' + (options.className ? ' ' + options.className : '');
    btn.setAttribute(
      'aria-label',
      options.ariaLabel || 'Annuler la correction orthographique'
    );
    btn.title = options.title || 'Annuler la correction';
    btn.innerHTML = '<i class="ti ti-arrow-back-up" aria-hidden="true"></i>';

    var ctrl = { el: btn, _timer: null, _dismissed: false };

    function dismiss() {
      if (ctrl._dismissed) return;
      ctrl._dismissed = true;
      if (ctrl._timer) {
        clearTimeout(ctrl._timer);
        ctrl._timer = null;
      }
      if (btn.parentNode) btn.parentNode.removeChild(btn);
      btn._spellRevertDismiss = null;
      if (typeof options.onDismiss === 'function') {
        try {
          options.onDismiss();
        } catch (err) {
          console.error('Spellcheck.attachRevert onDismiss failed', err);
        }
      }
    }

    btn._spellRevertDismiss = dismiss;
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      try {
        if (typeof options.onRevert === 'function') options.onRevert();
      } catch (err) {
        console.error('Spellcheck.attachRevert onRevert failed', err);
      } finally {
        dismiss();
      }
    });

    if (options.before && options.before.parentNode === hostEl) {
      hostEl.insertBefore(btn, options.before);
    } else {
      hostEl.appendChild(btn);
    }

    var timeoutMs =
      options.timeoutMs != null ? Number(options.timeoutMs) : REVERT_TIMEOUT_MS;
    if (timeoutMs > 0 && isFinite(timeoutMs)) {
      ctrl._timer = setTimeout(dismiss, timeoutMs);
    }

    return { dismiss: dismiss, el: btn };
  }

  global.Spellcheck = {
    configure: configure,
    correct: correct,
    attachRevert: attachRevert,
    REVERT_TIMEOUT_MS: REVERT_TIMEOUT_MS
  };
})(typeof window !== 'undefined' ? window : this);
