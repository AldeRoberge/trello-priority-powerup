/**
 * Chat UI for the Priority Power-Up assistant.
 * Exposes window.AgentUI.mount(cardEl, options).
 */
(function (global) {
  'use strict';

  function dbg() {
    return global.TpDebug || null;
  }
  function dbgLog(domain, event, meta) {
    var d = dbg();
    if (d && d.log) d.log(domain, event, meta);
  }
  function dbgError(domain, event, err, meta) {
    var d = dbg();
    if (d && d.error) d.error(domain, event, err, meta);
    else if (err) console.error(domain + '.' + event, err);
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'text') node.textContent = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  /** French count words for short UI labels (1–16); falls back to digits. */
  var FR_COUNT_WORDS = [
    '',
    'Une',
    'Deux',
    'Trois',
    'Quatre',
    'Cinq',
    'Six',
    'Sept',
    'Huit',
    'Neuf',
    'Dix',
    'Onze',
    'Douze',
    'Treize',
    'Quatorze',
    'Quinze',
    'Seize'
  ];

  function formatFrCountLabel(n, singular, plural) {
    var count = Math.max(0, Number(n) || 0);
    var word = FR_COUNT_WORDS[count] || String(count);
    return word + ' ' + (count === 1 ? singular : plural);
  }

  /**
   * Repair common model typos before rendering:
   * whitespace around [[g:…]], uppercase colors, single closing ].
   */
  function normalizeHighlightMarkup(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text
      .replace(
        /\[\[\s*([grya])\s*:\s*([^\]]{1,120}?)\s*\]\]/gi,
        function (_m, color, phrase) {
          return '[[' + String(color).toLowerCase() + ':' + phrase + ']]';
        }
      )
      .replace(
        /\[\[\s*([grya])\s*:\s*([^\]]{1,120}?)\s*\](?!\])/gi,
        function (_m, color, phrase) {
          return '[[' + String(color).toLowerCase() + ':' + phrase + ']]';
        }
      );
  }

  /** Hide a trailing unfinished [[g:… / [[a:… marker so streaming does not flash raw syntax. */
  function hideIncompleteHighlightMarker(text) {
    if (typeof text !== 'string' || !text) return text || '';
    var lastOpen = text.lastIndexOf('[[');
    if (lastOpen === -1) {
      if (text.charAt(text.length - 1) === '[') return text.slice(0, -1);
      return text;
    }
    var after = text.slice(lastOpen);
    // Complete [[color:phrase]] — keep (even if more text follows).
    if (/^\[\[[grya]:[^\]]{1,120}\]\]/i.test(after)) return text;
    // Highlight-shaped but unfinished (incl. single ]) — hide until closed.
    if (
      after === '[[' ||
      /^\[\[[grya]?(?::[^\]]*)?\]?$/i.test(after) ||
      /^\[\[[grya]:/i.test(after)
    ) {
      return text.slice(0, lastOpen);
    }
    return text;
  }

  /** Strip leftover highlight syntax so users never see [[g:…]]. */
  function stripLeftoverHighlightMarkup(text) {
    if (typeof text !== 'string' || !text) return text || '';
    return text
      .replace(/\[\[\s*[grya]\s*:\s*([^\]]{0,120}?)\s*\]\]?/gi, '$1')
      .replace(/\[\[\s*[grya]?\s*:?\s*[^\]]{0,120}$/gi, '')
      .replace(/\[\[[^\]]*$/g, '');
  }

  /**
   * Render assistant text with optional highlights:
   * [[g:/r:/y:]] = semantic priority colors; [[a:]] = agent identity accent.
   * Safe: every phrase is textContent; no HTML from the model.
   */
  function fillHighlightedBubble(bubble, text) {
    if (!bubble) return;
    bubble.replaceChildren();
    var raw = typeof text === 'string' ? text : '';
    var display = hideIncompleteHighlightMarker(normalizeHighlightMarkup(raw));
    if (!display) return;
    var re = /\[\[([grya]):([^\]]{1,120})\]\]/gi;
    var last = 0;
    var m;
    var hasHighlight = false;
    while ((m = re.exec(display)) !== null) {
      hasHighlight = true;
      if (m.index > last) {
        bubble.appendChild(
          document.createTextNode(
            stripLeftoverHighlightMarkup(display.slice(last, m.index))
          )
        );
      }
      var span = document.createElement('span');
      span.className = 'agent-hl agent-hl--' + String(m[1]).toLowerCase();
      span.textContent = m[2];
      bubble.appendChild(span);
      last = m.index + m[0].length;
    }
    if (!hasHighlight) {
      bubble.textContent = stripLeftoverHighlightMarkup(display);
      return;
    }
    if (last < display.length) {
      bubble.appendChild(
        document.createTextNode(stripLeftoverHighlightMarkup(display.slice(last)))
      );
    }
  }

    function statusIcon(status) {
      if (status === 'pass') return '\u2713';
      if (status === 'fail') return '\u2717';
      if (status === 'warn') return '!';
      if (status === 'running') return '\u2026';
      return '\u2013';
    }

  function mount(cardEl, options) {
    if (!cardEl) throw new Error('AgentUI.mount: cardEl required');
    options = options || {};
    var t = options.t;
    var Agent = global.PriorityAgent;
    if (!Agent) throw new Error('PriorityAgent is required');
    if (!global.PriorityUI) throw new Error('PriorityUI is required');

    var assistantScope = Agent.normalizeAssistantScope
      ? Agent.normalizeAssistantScope(options.scope)
      : options.scope === 'project'
        ? 'project'
        : 'task';
    var isProjectScope = assistantScope === 'project';
    var standalone = !!options.standalone || isProjectScope;
    dbgLog('agentUi', 'mount.start', { scope: assistantScope, standalone: standalone });

    var bridge = {
      getScope: options.getScope || function () { return assistantScope; },
      getCardName: options.getCardName || function () { return ''; },
      getCardDesc: options.getCardDesc || function () { return ''; },
      getFormulaKey: options.getFormulaKey || function () { return 'baseline'; },
      getPriorityState: options.getPriorityState || function () { return {}; },
      getCompletion: options.getCompletion || function () { return { items: [] }; },
      getMemory: options.getMemory || function () { return null; },
      getCardMemory: options.getCardMemory || function () { return null; },
      getProfile: options.getProfile || function () { return null; },
      getBoardDigest: options.getBoardDigest || function () { return ''; },
      refreshBoardDigest:
        typeof options.refreshBoardDigest === 'function'
          ? options.refreshBoardDigest
          : null,
      getGoals: options.getGoals || function () { return null; },
      setProject: options.setProject || function () {
        return Promise.resolve({ ok: false, reason: 'no-setProject' });
      },
      applyPriority: options.applyPriority || function () {},
      applyCompletion: options.applyCompletion || function () {},
      playEffect: options.playEffect || function (name, opts) {
        if (
          global.CelebrationEffects &&
          typeof global.CelebrationEffects.play === 'function'
        ) {
          return global.CelebrationEffects.play(name, opts || {});
        }
        return { ok: false, error: 'CelebrationEffects indisponible' };
      },
      openSection: options.openSection || null,
      resolvePointTarget: options.resolvePointTarget || null,
      setFormulaKey: options.setFormulaKey || function () {},
      setCardName: options.setCardName || function () {
        return Promise.resolve({ ok: false, reason: 'no-setCardName' });
      },
      setCardDesc: options.setCardDesc || function () {
        return Promise.resolve({ ok: false, reason: 'no-setCardDesc' });
      },
      getStatut: options.getStatut || function () { return null; },
      selectStatut: options.selectStatut || function () {
        return Promise.resolve({ ok: false, reason: 'no-selectStatut' });
      }
    };
    var onMemoryUpdate =
      typeof options.onMemoryUpdate === 'function' ? options.onMemoryUpdate : null;
    var onCardMemoryUpdate =
      typeof options.onCardMemoryUpdate === 'function' ? options.onCardMemoryUpdate : null;
    var onLayoutChange = options.onLayoutChange || function () {};
    var initiallyOpen = standalone ? true : !!options.initiallyOpen;
    var shouldFocusComposer = options.focusComposer != null
      ? !!options.focusComposer
      : initiallyOpen;
    var openMemoryOnSettings =
      options.openMemoryOnSettings != null
        ? !!options.openMemoryOnSettings
        : false;

    var provider = Agent.normalizeProvider(null);
    var savedProvider = Agent.normalizeProvider(null);
    var history = [];
    var chatRestored = false;
    var chatPersistTimer = null;
    var pending = false;
    /** Bumped to invalidate in-flight turns when the user resumes from an earlier message. */
    var chatTurnGen = 0;
    /** User messages typed while a turn is in flight; drained FIFO after pending clears. */
    var messageQueue = [];
    var settingsOpen = false;
    var testing = false;
    var suggestionsSeq = 0;
    var suggestionsMultiSelect = false;
    var suggestionConfirmTimer = null;
    var suggestionConfirmDeadline = 0;
    var SUGGESTION_CONFIRM_MS = 5000;
    var SUGGESTION_CONFIRM_PROMPTS = [
      'C\'est tout?',
      'Rien d\'autre?'
    ];
    var applySuggestionsSeq = 0;
    var applySuggestions = [];
    var applySuggestionsLoading = false;
    var interviewActive = false;
    var interviewState = Agent.emptyCardInterview
      ? Agent.emptyCardInterview()
      : { complete: false, asked: [], startedAt: '', completedAt: '' };
    var interviewSurrounding = [];
    var interviewRecentCards = [];
    var interviewPriorityTrusted = false;
    var interviewBootstrapped = false;
    var sanityBootstrapped = false;
    var dreamDebounceTimer = null;
    var dreamInFlight = false;
    var dreamGen = 0;
    var dreamDirty = false;
    /** One attempt per popup session to rewrite legacy structured Description dumps. */
    var verboseDescRewriteTried = false;
    var unreadAssistant = 0;
    var settleReady = false;
    var listeningActive = false;
    var listeningAnalyzing = false;
    var listenTimer = null;
    var listenDebounceTimer = null;
    var listenFingerprint = '';
    /** buildContext snapshot at last fingerprint sync — used to detect what the user just changed. */
    var listenBaselineContext = null;
    /** Context before the change that triggered the pending listen scan. */
    var listenScanPreviousContext = null;
    var listenMutedUntil = 0;
    var listenCooldownUntil = 0;
    var listenScanSeq = 0;
    var activeOffer = null;
    var dismissedOffers = {};
    /** Last Coup de pouce candidates from listen scan (for alternate after Non). */
    var lastListenSuggestions = [];
    /** @type {{ row: Element, content: string }|null} */
    var awaitingFeedback = null;
    var audioCtx = null;
    var LISTEN_POLL_MS = 2000;
    var LISTEN_DEBOUNCE_MS = 1400;
    var LISTEN_COOLDOWN_MS = 14000;
    var LISTEN_MUTE_MS = 1800;
    var sessionStats = {
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      estimated: false,
      lastUsage: null
    };

    var section = el('div', 'variant-chat-section' + (standalone ? ' variant-chat-section--standalone' : ''));
    var field = el('div', 'field field--chat');

    var agentIdentity = {
      agentName: '',
      agentPersonality: '',
      agentColor: 'orange',
      agentFace: 'classic'
    };

    var chrome = PriorityUI.createCollapsibleEnableChrome({
      title: 'Assistant',
      bodyId: 'agent-chat-body',
      hideEnable: true,
      leadingIcon: 'ti-message-chatbot',
      iconClass: 'chat-leading-icon',
      titleClass: 'chat-enable-title',
      collapseLabel: 'Replier Assistant',
      expandLabel: 'D\u00e9velopper Assistant'
    });
    field.appendChild(chrome.head);

    var settingsBtn = el('button', 'agent-settings-btn', {
      type: 'button',
      'aria-label': 'Param\u00e8tres de l\'assistant',
      title: 'Param\u00e8tres'
    });
    var settingsIcon = el('i', 'ti ti-settings');
    settingsIcon.setAttribute('aria-hidden', 'true');
    settingsBtn.appendChild(settingsIcon);
    // Gear left of the enable checkbox (checkbox stays on the far right).
    if (chrome.label) {
      chrome.head.insertBefore(settingsBtn, chrome.label);
    } else {
      chrome.head.appendChild(settingsBtn);
    }

    var body = el('div', 'agent-chat-body section-toggle-body');
    body.id = 'agent-chat-body';
    body.hidden = true;

    // ── Settings panel ──────────────────────────────────────────────────
    var settingsPanel = el('div', 'agent-settings');
    settingsPanel.hidden = true;

    var charTitle = el('h4', 'agent-settings-title', { text: 'Caract\u00e8re' });
    settingsPanel.appendChild(charTitle);
    var charHint = el('p', 'agent-settings-hint', {
      text:
        'Nom, visage, couleur et personnalit\u00e9 de l\'assistant. Par d\u00e9faut, un nom al\u00e9atoire inspir\u00e9 de sa couleur.'
    });
    settingsPanel.appendChild(charHint);

    var agentAvatarPreview = el('div', 'agent-avatar-preview', {
      'aria-label': 'Aper\u00e7u de l\'avatar'
    });
    var agentAvatarPreviewFaceHost = el('div', 'agent-avatar-preview-face');
    var agentAvatarPreviewMeta = el('div', 'agent-avatar-preview-meta');
    var agentAvatarPreviewName = el('span', 'agent-avatar-preview-name');
    var agentAvatarPreviewCaption = el('span', 'agent-avatar-preview-caption', {
      text: 'Aper\u00e7u'
    });
    agentAvatarPreviewMeta.appendChild(agentAvatarPreviewName);
    agentAvatarPreviewMeta.appendChild(agentAvatarPreviewCaption);
    agentAvatarPreview.appendChild(agentAvatarPreviewFaceHost);
    agentAvatarPreview.appendChild(agentAvatarPreviewMeta);
    settingsPanel.appendChild(agentAvatarPreview);

    function labeledInput(labelText, inputEl) {
      var wrap = el('label', 'agent-field');
      wrap.appendChild(el('span', 'agent-field-label', { text: labelText }));
      wrap.appendChild(inputEl);
      return wrap;
    }

    var agentNameInput = el('input', 'agent-input', {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'true',
      maxlength: '40',
      placeholder: 'ex. Clementine'
    });
    var agentColorSelect = el('select', 'agent-input agent-color-select', {
      'aria-label': 'Couleur de l\'assistant'
    });
    var agentFacePicker = el('div', 'agent-face-picker', {
      role: 'radiogroup',
      'aria-label': 'Visage de l\'assistant'
    });
    var agentPersonalityInput = el('textarea', 'agent-input agent-personality-input', {
      rows: '3',
      maxlength: '400',
      placeholder: 'ex. Pote attentionn\u00e9, peu fan de productivit\u00e9\u2026'
    });
    settingsPanel.appendChild(labeledInput('Nom', agentNameInput));
    var faceField = el('div', 'agent-field');
    faceField.appendChild(el('span', 'agent-field-label', { text: 'Visage' }));
    faceField.appendChild(agentFacePicker);
    settingsPanel.appendChild(faceField);
    settingsPanel.appendChild(labeledInput('Couleur', agentColorSelect));
    settingsPanel.appendChild(labeledInput('Personnalit\u00e9', agentPersonalityInput));

    var charActions = el('div', 'agent-settings-actions agent-char-actions');
    var rerollNameBtn = el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Nouveau nom'
    });
    var rerollColorBtn = el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Couleur al\u00e9atoire'
    });
    charActions.appendChild(rerollNameBtn);
    charActions.appendChild(rerollColorBtn);
    settingsPanel.appendChild(charActions);

    var settingsTitle = el('h4', 'agent-settings-title', { text: 'Fournisseur IA' });
    settingsPanel.appendChild(settingsTitle);

    var settingsHint = el('p', 'agent-settings-hint', {
      text:
        'Cl\u00e9 OpenAI ou endpoint compatible (OpenRouter, proxy CORS\u2026). Stock\u00e9e en priv\u00e9 sur votre compte Trello.'
    });
    settingsPanel.appendChild(settingsHint);

    var presetRow = el('div', 'agent-preset-row', { role: 'group', 'aria-label': 'Pr\u00e9r\u00e9glages' });
    var presetButtons = {};
    ['openai', 'openrouter', 'custom'].forEach(function (id) {
      var preset = Agent.PRESETS[id];
      var btn = el('button', 'agent-preset-btn', { type: 'button', 'data-preset': id });
      btn.textContent = preset.label;
      btn.addEventListener('click', function () {
        applyPreset(id);
      });
      presetButtons[id] = btn;
      presetRow.appendChild(btn);
    });
    settingsPanel.appendChild(presetRow);

    var apiKeyInput = el('input', 'agent-input', {
      type: 'password',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'sk-…'
    });
    var baseUrlInput = el('input', 'agent-input', {
      type: 'url',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'https://api.openai.com/v1'
    });
    var modelSelect = el('select', 'agent-input agent-model-select', {
      'aria-label': 'Mod\u00e8le OpenAI'
    });
    (Agent.OPENAI_MODELS || []).forEach(function (m) {
      var opt = el('option', null, { value: m.id, text: m.label || m.id });
      modelSelect.appendChild(opt);
    });
    var modelInput = el('input', 'agent-input', {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'gpt-4o-mini'
    });

    var modelSelectField = labeledInput('Mod\u00e8le', modelSelect);
    var modelInputField = labeledInput('Mod\u00e8le', modelInput);

    settingsPanel.appendChild(labeledInput('Cl\u00e9 API', apiKeyInput));
    settingsPanel.appendChild(labeledInput('URL de base', baseUrlInput));
    settingsPanel.appendChild(modelSelectField);
    settingsPanel.appendChild(modelInputField);

    var STATUS_PREF_STORAGE_KEY = 'trello-priority-powerup/agent-status';
    var LEGACY_DEBUG_PREF_STORAGE_KEY = 'trello-priority-powerup/agent-debug-enabled';
    var STATUS_LEVELS = ['none', 'standard', 'full'];
    var STATUS_LABELS = {
      none: 'Aucun',
      standard: 'Standard',
      full: 'Complet'
    };

    function normalizeStatusLevel(raw) {
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentStatus === 'function') {
        return global.UserProfile.normalizeAgentStatus(raw);
      }
      var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return STATUS_LEVELS.indexOf(s) !== -1 ? s : 'standard';
    }

    function loadStatusLevel() {
      try {
        if (typeof localStorage !== 'undefined') {
          var raw = localStorage.getItem(STATUS_PREF_STORAGE_KEY);
          if (raw != null) return normalizeStatusLevel(raw);
          var legacy = localStorage.getItem(LEGACY_DEBUG_PREF_STORAGE_KEY);
          if (legacy != null) {
            return legacy === '0' || legacy === 'false' ? 'standard' : 'full';
          }
        }
      } catch (e) {
        /* ignore */
      }
      return 'standard';
    }

    function saveStatusLevel(level) {
      var next = normalizeStatusLevel(level);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STATUS_PREF_STORAGE_KEY, next);
        }
      } catch (e) {
        /* ignore quota / private mode */
      }
      if (t && global.UserProfile && typeof global.UserProfile.load === 'function') {
        global.UserProfile.load(t)
          .then(function (profile) {
            if (!profile || profile.agentStatus === next) return null;
            profile.agentStatus = next;
            return global.UserProfile.save(t, profile);
          })
          .catch(function (err) {
            console.error('AgentUI: profile agentStatus sync failed', err);
          });
      }
    }

    var statusLevel = loadStatusLevel();
    var statusSelect = el('select', 'agent-input agent-status-select', {
      'aria-label': 'Afficher le statut'
    });
    STATUS_LEVELS.forEach(function (id) {
      statusSelect.appendChild(
        el('option', null, { value: id, text: STATUS_LABELS[id] || id })
      );
    });
    statusSelect.value = statusLevel;
    settingsPanel.appendChild(labeledInput('Afficher le statut', statusSelect));

    // ── Mémoire (settings submenu) ───────────────────────────────────────
    var memoryDetails = el('details', 'agent-settings-memory');
    var memorySummary = el('summary', 'agent-settings-memory-summary');
    memorySummary.appendChild(el('span', 'agent-settings-memory-title', { text: 'M\u00e9moire' }));
    var memoryBadge = el('span', 'agent-settings-memory-badge');
    memoryBadge.hidden = true;
    memorySummary.appendChild(memoryBadge);
    memoryDetails.appendChild(memorySummary);

    var memoryBody = el('div', 'agent-settings-memory-body');
    memoryBody.appendChild(
      el('p', 'agent-settings-hint', {
        text:
          'Faits durables et notes de tableau partag\u00e9s entre toutes les fen\u00eatres Assistant. Alignement guid\u00e9 ou conversation libre.'
      })
    );
    var memoryActions = el('div', 'agent-settings-actions agent-memory-actions');
    var memoryAlignBtn = el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Aligner la m\u00e9moire'
    });
    var memoryChatBtn = el('button', 'tp-button agent-btn', {
      type: 'button',
      text: 'Ouvrir la m\u00e9moire'
    });
    memoryActions.appendChild(memoryAlignBtn);
    memoryActions.appendChild(memoryChatBtn);
    memoryBody.appendChild(memoryActions);
    var memoryMountEl = el('div', 'agent-settings-memory-mount');
    memoryMountEl.hidden = true;
    memoryBody.appendChild(memoryMountEl);
    memoryDetails.appendChild(memoryBody);
    settingsPanel.appendChild(memoryDetails);

    var memoryUiMounted = false;
    var memoryUiBusy = false;

    function syncMemoryBadge() {
      var Mem = global.AgentMemory;
      var mem =
        typeof bridge.getMemory === 'function' ? bridge.getMemory() : null;
      var needs =
        Mem && typeof Mem.needsOnboarding === 'function' && Mem.needsOnboarding(mem);
      if (needs) {
        memoryBadge.hidden = false;
        memoryBadge.textContent = '\u00c0 aligner';
      } else {
        memoryBadge.hidden = true;
        memoryBadge.textContent = '';
      }
    }

    function needsMemoryAlign() {
      var Mem = global.AgentMemory;
      var mem =
        typeof bridge.getMemory === 'function' ? bridge.getMemory() : null;
      return !!(
        Mem &&
        typeof Mem.needsOnboarding === 'function' &&
        Mem.needsOnboarding(mem)
      );
    }

    function mountMemoryUi(mode) {
      if (memoryUiBusy) return;
      var MemUI = global.MemoryUI;
      if (!MemUI || typeof MemUI.mount !== 'function') {
        setSettingsStatus(
          'Module m\u00e9moire indisponible sur cette page.',
          'fail'
        );
        return;
      }
      memoryUiBusy = true;
      memoryMountEl.hidden = false;
      memoryMountEl.innerHTML = '';
      memoryDetails.open = true;
      try {
        MemUI.mount(memoryMountEl, {
          t: t,
          mode: mode === 'onboarding' ? 'onboarding' : 'ongoing',
          showSkip: mode === 'onboarding',
          showSummary: true,
          embedded: true,
          onLayoutChange: notifyLayout,
          onSkip: function () {
            memoryMountEl.hidden = true;
            memoryMountEl.innerHTML = '';
            memoryUiMounted = false;
            syncMemoryBadge();
            notifyLayout();
          },
          onComplete: function (updated) {
            if (updated && onMemoryUpdate) onMemoryUpdate(updated);
            else if (updated) {
              bridge.getMemory = function () {
                return updated;
              };
            }
            memoryMountEl.hidden = true;
            memoryMountEl.innerHTML = '';
            memoryUiMounted = false;
            syncMemoryBadge();
            notifyLayout();
          }
        });
        memoryUiMounted = true;
      } catch (err) {
        console.error('AgentUI memory mount failed', err);
        setSettingsStatus('Impossible d\'ouvrir la m\u00e9moire.', 'fail');
      }
      memoryUiBusy = false;
      notifyLayout();
    }

    memoryAlignBtn.addEventListener('click', function (e) {
      e.preventDefault();
      mountMemoryUi('onboarding');
    });
    memoryChatBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var Mem = global.AgentMemory;
      var mem =
        typeof bridge.getMemory === 'function' ? bridge.getMemory() : null;
      var needs =
        Mem && typeof Mem.needsOnboarding === 'function' && Mem.needsOnboarding(mem);
      mountMemoryUi(needs ? 'onboarding' : 'ongoing');
    });
    memoryDetails.addEventListener('toggle', function () {
      syncMemoryBadge();
      notifyLayout();
    });
    syncMemoryBadge();

    var settingsActions = el('div', 'agent-settings-actions');
    var saveBtn = el('button', 'tp-button agent-btn', { type: 'button', text: 'Enregistrer' });
    var testBtn = el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Tester le fournisseur'
    });
    settingsActions.appendChild(saveBtn);
    settingsActions.appendChild(testBtn);
    settingsPanel.appendChild(settingsActions);

    var settingsStatus = el('p', 'agent-settings-status');
    settingsStatus.hidden = true;
    settingsPanel.appendChild(settingsStatus);

    var testResultsEl = el('ul', 'agent-test-results');
    testResultsEl.hidden = true;
    settingsPanel.appendChild(testResultsEl);

    var doneWrap = el('div', 'agent-settings-done');
    var doneBtn = el('button', 'tp-button agent-btn', {
      type: 'button',
      text: 'Termin\u00e9'
    });
    doneWrap.appendChild(doneBtn);
    settingsPanel.appendChild(doneWrap);

    body.appendChild(settingsPanel);

    // ── Chat panel ──────────────────────────────────────────────────────
    var chatPanel = el('div', 'agent-chat-panel');
    /** Listening / analyzing status badge rides on the live chat face. */
    var listenFaceMode = null;

    var emptyState = el('div', 'agent-empty');
    var emptyConfigBtn = el('button', 'tp-link agent-empty-config', {
      type: 'button',
      text: 'Configurer le fournisseur'
    });
    emptyState.appendChild(emptyConfigBtn);
    chatPanel.appendChild(emptyState);

    var messagesEl = el('div', 'agent-messages', { role: 'log', 'aria-live': 'polite' });
    chatPanel.appendChild(messagesEl);

    var followUpsEl = el('div', 'agent-followups', { role: 'group', 'aria-label': 'Actions rapides' });
    followUpsEl.hidden = true;
    chatPanel.appendChild(followUpsEl);

    var promptsEl = el('div', 'agent-prompts', {
      role: 'group',
      'aria-label': 'Contr\u00f4les interactifs'
    });
    promptsEl.hidden = true;
    chatPanel.appendChild(promptsEl);

    // Create before TabAutocomplete.bind — its initial refresh() calls onProposal
    // → markSuggestionTabTarget, which needs suggestionsEl.
    var suggestionsEl = el('div', 'agent-suggestions', {
      role: 'group',
      'aria-label': 'Questions sugg\u00e9r\u00e9es'
    });
    suggestionsEl.hidden = true;

    var composer = el('div', 'agent-composer');
    var input = el('textarea', 'agent-composer-input', {
      rows: '2',
      placeholder: 'Demandez ce que vous voulez',
      'aria-label': 'Message \u00e0 l\'assistant'
    });
    var sendBtn = el('button', 'tp-button agent-send-btn', {
      type: 'button',
      'aria-label': 'Envoyer'
    });
    var sendBtnLabel = el('span', 'agent-send-btn-label');
    sendBtnLabel.textContent = 'Envoyer';
    var sendConfirmCount = el('span', 'agent-send-btn-count');
    sendConfirmCount.hidden = true;
    sendBtn.appendChild(sendBtnLabel);
    sendBtn.appendChild(sendConfirmCount);
    var composerSuggestions = [];
    var tabComplete = null;
    if (global.TabAutocomplete && typeof global.TabAutocomplete.wrapField === 'function') {
      var wrappedComposer = global.TabAutocomplete.wrapField(input);
      composer.appendChild(wrappedComposer.wrap);
      tabComplete = global.TabAutocomplete.bind({
        field: input,
        wrapEl: wrappedComposer.wrap,
        ghostEl: wrappedComposer.ghost,
        getCandidates: function () {
          return composerSuggestions.slice();
        },
        isEnabled: function () {
          return !input.disabled;
        },
        onProposal: function (proposal) {
          markSuggestionTabTarget(
            proposal && proposal.candidate ? proposal.candidate.text : ''
          );
        }
      });
    } else {
      composer.appendChild(input);
    }
    composer.appendChild(sendBtn);
    chatPanel.appendChild(suggestionsEl);
    chatPanel.appendChild(composer);

    var interviewBar = el('div', 'agent-interview-bar');
    interviewBar.hidden = true;
    var interviewSkipBtn = el('button', 'agent-interview-skip', {
      type: 'button',
      'aria-label': 'Ignorer la configuration initiale',
      title: 'Ignorer la configuration initiale'
    });
    var interviewSkipIcon = el('i', 'ti ti-x');
    interviewSkipIcon.setAttribute('aria-hidden', 'true');
    interviewSkipBtn.appendChild(interviewSkipIcon);
    interviewBar.appendChild(interviewSkipBtn);
    chatPanel.appendChild(interviewBar);

    var applySection = el('div', 'agent-apply-suggestions');
    applySection.hidden = true;
    if (isProjectScope) {
      applySection.style.display = 'none';
    }
    var applyHead = el('div', 'agent-apply-suggestions-head');
    var applyRefreshBtn = el('button', 'agent-apply-suggestions-refresh', {
      type: 'button',
      'aria-label': 'Rafra\u00eechir les suggestions',
      title: 'Rafra\u00eechir'
    });
    applyRefreshBtn.textContent = '\u21bb';
    applyHead.appendChild(applyRefreshBtn);
    applySection.appendChild(applyHead);
    var applyListEl = el('div', 'agent-apply-suggestions-list', {
      role: 'list',
      'aria-label': 'Suggestions applicables'
    });
    applySection.appendChild(applyListEl);
    var applyStatusEl = el('p', 'agent-apply-suggestions-status');
    applyStatusEl.hidden = true;
    applySection.appendChild(applyStatusEl);
    chatPanel.appendChild(applySection);

    var infoEl = el('div', 'agent-chat-info', {
      'aria-label': 'Informations de la conversation'
    });

    var infoHead = el('div', 'agent-chat-info-head');
    var statsEl = el('div', 'agent-chat-stats', {
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Statistiques de la conversation'
    });
    infoHead.appendChild(statsEl);

    var debugBtn = el('button', 'agent-debug-btn', {
      type: 'button',
      'aria-label': 'Panneau de d\u00e9bogage',
      title: 'D\u00e9bogage',
      'aria-expanded': 'false'
    });
    debugBtn.hidden = statusLevel !== 'full';
    var debugIcon = el('i', 'ti ti-bug');
    debugIcon.setAttribute('aria-hidden', 'true');
    debugBtn.appendChild(debugIcon);
    infoHead.appendChild(debugBtn);
    infoEl.appendChild(infoHead);

    var debugPanel = el('div', 'agent-debug-panel', {
      role: 'region',
      'aria-label': 'Panneau de d\u00e9bogage'
    });
    debugPanel.hidden = true;
    infoEl.appendChild(debugPanel);

    chatPanel.appendChild(infoEl);

    var errorEl = el('p', 'agent-error');
    errorEl.hidden = true;
    chatPanel.appendChild(errorEl);

    body.appendChild(chatPanel);
    field.appendChild(body);
    section.appendChild(field);
    cardEl.appendChild(section);

    var debugOpen = false;
    var debugLog = [];
    var selectedDebugId = null;

    var expandFallback = false;
    var expandChat = initiallyOpen
      ? true
      : typeof PriorityUI.resolveSectionExpanded === 'function'
        ? PriorityUI.resolveSectionExpanded('chat', expandFallback)
        : expandFallback;

    var collapse = PriorityUI.bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: expandChat,
      getSummary: function () {
        if (applySuggestionsLoading || listeningAnalyzing) return 'Analyse\u2026';
        if (activeOffer) return 'Suggestion';
        if (applySuggestions.length) {
          return formatFrCountLabel(
            applySuggestions.length,
            'suggestion',
            'suggestions'
          );
        }
        if (unreadAssistant > 0) {
          return unreadAssistant === 1
            ? 'Nouveau message'
            : formatFrCountLabel(unreadAssistant, 'nouveau', 'nouveaux');
        }
        if (!Agent.isConfigured(provider)) return 'Non configur\u00e9';
        if (!Agent.isVerified(provider)) return 'Non v\u00e9rifi\u00e9';
        if (listeningActive) return 'À l\u2019écoute';
        if (isProjectScope) return 'Projet';
        return '';
      },
      onLayoutChange: onLayoutChange,
      onEnableChange: function (on) {
        if (!on && settingsOpen) setSettingsOpen(false);
      },
      onExpandChange: function (isExpanded) {
        if (isExpanded && unreadAssistant) {
          unreadAssistant = 0;
          syncApplySummary();
        }
        if (isExpanded && messagesEl) {
          // Body was just unhidden — wait a frame so scrollHeight is correct.
          requestAnimationFrame(function () {
            messagesEl.scrollTop = messagesEl.scrollHeight;
          });
        }
        if (!standalone && typeof PriorityUI.saveSectionCollapseState === 'function') {
          PriorityUI.saveSectionCollapseState({ chat: !!isExpanded });
        }
      }
    });

    function syncApplySummary() {
      field.classList.toggle(
        'has-ai-suggestions',
        applySuggestions.length > 0 || applySuggestionsLoading || !!activeOffer
      );
      field.classList.toggle('is-ai-suggestions-loading', applySuggestionsLoading || listeningAnalyzing);
      field.classList.toggle('has-new-message', unreadAssistant > 0 && !activeOffer);
      field.classList.toggle(
        'is-listening',
        listeningActive && Agent.isConfigured(provider) && !interviewActive
      );
      if (collapse && collapse.refreshSummary) collapse.refreshSummary();
    }

    function notifyLayout() {
      onLayoutChange();
    }

    function formatTokenCount(n) {
      if (n == null || !isFinite(n)) return '\u2014';
      var v = Math.round(n);
      if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (v >= 10000) return Math.round(v / 1000) + 'k';
      if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(v);
    }

    function formatCostUsd(n) {
      if (n == null || !isFinite(n)) return '\u2014';
      if (n < 0.0001) return '<\u00a0$0.0001';
      if (n < 0.01) return '$' + n.toFixed(4);
      if (n < 1) return '$' + n.toFixed(3);
      return '$' + n.toFixed(2);
    }

    function formatLatency(ms) {
      if (ms == null || !isFinite(ms)) return '\u2014';
      if (ms < 1000) return Math.round(ms) + '\u00a0ms';
      return (ms / 1000).toFixed(1).replace(/\.0$/, '') + '\u00a0s';
    }

    function formatWindow(n) {
      if (n == null || !isFinite(n)) return '\u2014';
      if (n >= 1000000) return Math.round(n / 1000000) + 'M';
      if (n >= 1000) return Math.round(n / 1000) + 'k';
      return String(n);
    }

    function finishReasonLabel(reason) {
      if (!reason) return '';
      var map = {
        stop: 'termin\u00e9',
        length: 'tronqu\u00e9',
        content_filter: 'filtr\u00e9',
        tool_calls: 'outils',
        function_call: 'fonction'
      };
      return map[reason] || reason;
    }

    /** ok (white) → warn (yellow) → caution (orange) → bad (red) */
    function toneFromThresholds(value, warnAt, cautionAt, badAt) {
      if (value == null || !isFinite(value)) return 'ok';
      if (value >= badAt) return 'bad';
      if (value >= cautionAt) return 'caution';
      if (value >= warnAt) return 'warn';
      return 'ok';
    }

    function latencyTone(ms) {
      return toneFromThresholds(ms, 2000, 3500, 5000);
    }

    function contextTone(fillPercent) {
      return toneFromThresholds(fillPercent, 50, 65, 80);
    }

    function costTone(usd) {
      return toneFromThresholds(usd, 0.01, 0.02, 0.05);
    }

    function tokensTone(totalTokens, fillPercent) {
      if (fillPercent != null && isFinite(fillPercent)) {
        return contextTone(fillPercent);
      }
      return toneFromThresholds(totalTokens, 6000, 12000, 20000);
    }

    function memoryTone(messageCount) {
      return toneFromThresholds(messageCount, 12, 24, 40);
    }

    function finishTone(reason) {
      if (reason === 'length' || reason === 'content_filter') return 'bad';
      return 'ok';
    }

    function updateSessionStats(usage) {
      if (!usage) return;
      sessionStats.turns += 1;
      sessionStats.promptTokens += usage.promptTokens || 0;
      sessionStats.completionTokens += usage.completionTokens || 0;
      sessionStats.totalTokens += usage.totalTokens || 0;
      sessionStats.costUsd += usage.costUsd || 0;
      if (usage.estimated) sessionStats.estimated = true;
      sessionStats.lastUsage = usage;
      renderChatStats();
    }

    function syncStatusControls() {
      var showInfo = statusLevel !== 'none';
      var showDebug = statusLevel === 'full';
      infoEl.hidden = !showInfo;
      statsEl.hidden = !showInfo;
      debugBtn.hidden = !showDebug;
      if (!showDebug && debugOpen) {
        setDebugOpen(false);
      } else {
        debugPanel.hidden = !debugOpen;
      }
      if (showInfo) renderChatStats();
      else statsEl.replaceChildren();
      notifyLayout();
    }

    function prettyJson(value) {
      if (value == null) return '';
      if (typeof value === 'string') {
        try {
          return JSON.stringify(JSON.parse(value), null, 2);
        } catch (e) {
          return value;
        }
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }

    function pushDebugEntry(entry) {
      if (!entry) return;
      debugLog.push(entry);
      if (debugLog.length > 40) debugLog.shift();
      selectedDebugId = entry.id || selectedDebugId;
      if (statusLevel === 'full' && debugOpen) renderDebugPanel();
      notifyLayout();
    }

    function setDebugOpen(open) {
      debugOpen = !!open && statusLevel === 'full';
      debugPanel.hidden = !debugOpen;
      debugBtn.classList.toggle('is-active', debugOpen);
      debugBtn.setAttribute('aria-expanded', debugOpen ? 'true' : 'false');
      if (debugOpen) renderDebugPanel();
      notifyLayout();
    }

    function renderMetricsBlock(usage) {
      var wrap = el('div', 'agent-debug-metrics');
      if (!usage) {
        wrap.appendChild(el('p', 'agent-debug-empty', { text: 'Aucune m\u00e9trique.' }));
        return wrap;
      }
      var rows = [
        ['Tokens prompt', formatTokenCount(usage.promptTokens)],
        ['Tokens compl\u00e9tion', formatTokenCount(usage.completionTokens)],
        ['Tokens total', formatTokenCount(usage.totalTokens)],
        ['Co\u00fbt estim\u00e9', '\u2248' + formatCostUsd(usage.costUsd)],
        ['Latence', formatLatency(usage.latencyMs)],
        ['Mod\u00e8le', usage.model || '\u2014'],
        ['Fin', finishReasonLabel(usage.finishReason) || usage.finishReason || '\u2014'],
        ['Estim\u00e9', usage.estimated ? 'oui' : 'non']
      ];
      if (usage.cachedTokens != null) {
        rows.push(['Cache', formatTokenCount(usage.cachedTokens)]);
      }
      if (usage.reasoningTokens != null) {
        rows.push(['Raisonnement', formatTokenCount(usage.reasoningTokens)]);
      }
      if (usage.historyTurns != null) {
        rows.push(['Historique (tours)', String(usage.historyTurns)]);
      }
      var ctx = usage.context || {};
      if (ctx.requestTokens != null || ctx.windowTokens != null) {
        rows.push([
          'Contexte',
          formatTokenCount(ctx.requestTokens) +
            ' / ' +
            formatWindow(ctx.windowTokens) +
            (ctx.fillPercent != null ? ' (' + ctx.fillPercent + '%)' : '')
        ]);
      }
      if (ctx.messageCount != null) {
        rows.push(['Messages envoy\u00e9s', String(ctx.messageCount)]);
      }
      if (ctx.systemChars != null) {
        rows.push([
          'Caract\u00e8res',
          'sys ' +
            formatTokenCount(ctx.systemChars) +
            ' \u00b7 hist ' +
            formatTokenCount(ctx.historyChars) +
            ' \u00b7 user ' +
            formatTokenCount(ctx.userChars)
        ]);
      }
      var dl = el('dl', 'agent-debug-metric-list');
      rows.forEach(function (pair) {
        var row = el('div', 'agent-debug-metric-row');
        row.appendChild(el('dt', null, { text: pair[0] }));
        row.appendChild(el('dd', null, { text: pair[1] }));
        dl.appendChild(row);
      });
      wrap.appendChild(dl);
      return wrap;
    }

    function renderDebugPanel() {
      debugPanel.replaceChildren();

      var toolbar = el('div', 'agent-debug-toolbar');
      toolbar.appendChild(
        el('span', 'agent-debug-toolbar-title', { text: 'D\u00e9bogage' })
      );
      var clearBtn = el('button', 'agent-debug-clear', {
        type: 'button',
        text: 'Effacer'
      });
      clearBtn.disabled = !debugLog.length;
      clearBtn.addEventListener('click', function () {
        debugLog = [];
        selectedDebugId = null;
        renderDebugPanel();
        notifyLayout();
      });
      toolbar.appendChild(clearBtn);
      debugPanel.appendChild(toolbar);

      if (!debugLog.length) {
        debugPanel.appendChild(
          el('p', 'agent-debug-empty', {
            text: 'Aucun \u00e9change r\u00e9seau pour l\u2019instant. Envoyez un message ou rechargez les suggestions.'
          })
        );
        return;
      }

      var list = el('div', 'agent-debug-list', { role: 'list' });
      var selected = null;
      for (var i = 0; i < debugLog.length; i++) {
        if (debugLog[i].id === selectedDebugId) {
          selected = debugLog[i];
          break;
        }
      }
      if (!selected) selected = debugLog[debugLog.length - 1];
      selectedDebugId = selected && selected.id;

      debugLog
        .slice()
        .reverse()
        .forEach(function (entry) {
          var item = el('button', 'agent-debug-list-item', { type: 'button', role: 'listitem' });
          if (entry.id === selectedDebugId) item.classList.add('is-active');
          if (entry.ok === false) item.classList.add('is-fail');
          var when = entry.startedAt
            ? new Date(entry.startedAt).toLocaleTimeString()
            : '';
          item.appendChild(
            el('span', 'agent-debug-list-label', {
              text: (entry.label || entry.kind || 'requ\u00eate') + (when ? ' · ' + when : '')
            })
          );
          var metaBits = [];
          if (entry.latencyMs != null) metaBits.push(formatLatency(entry.latencyMs));
          if (entry.ok === false) metaBits.push('erreur');
          else if (entry.usage && entry.usage.totalTokens != null) {
            metaBits.push(formatTokenCount(entry.usage.totalTokens) + ' tok');
          }
          if (metaBits.length) {
            item.appendChild(
              el('span', 'agent-debug-list-meta', { text: metaBits.join(' · ') })
            );
          }
          item.addEventListener('click', function () {
            selectedDebugId = entry.id;
            renderDebugPanel();
            notifyLayout();
          });
          list.appendChild(item);
        });
      debugPanel.appendChild(list);

      if (!selected) return;

      var detail = el('div', 'agent-debug-detail');
      if (selected.error) {
        detail.appendChild(
          el('p', 'agent-debug-error', { text: selected.error })
        );
      }

      function addSection(title, contentNode) {
        var sectionNode = el('details', 'agent-debug-section');
        sectionNode.open = true;
        sectionNode.appendChild(el('summary', null, { text: title }));
        var bodyNode = el('div', 'agent-debug-section-body');
        bodyNode.appendChild(contentNode);
        sectionNode.appendChild(bodyNode);
        detail.appendChild(sectionNode);
      }

      addSection('M\u00e9triques', renderMetricsBlock(selected.usage));

      var req = selected.request || null;
      var reqPre = el('pre', 'agent-debug-pre');
      reqPre.textContent = prettyJson(
        req
          ? {
              url: req.url,
              method: req.method,
              status: req.status,
              model: req.model,
              stream: req.stream,
              jsonMode: req.jsonMode,
              temperature: req.temperature,
              max_tokens: req.max_tokens,
              messageCount: req.messageCount,
              note: req.note,
              error: req.error,
              body: req.body
            }
          : null
      ) || '(aucune requ\u00eate)';
      addSection('Requ\u00eate sortante', reqPre);

      var res = selected.response || null;
      var resPre = el('pre', 'agent-debug-pre');
      resPre.textContent = prettyJson(
        res
          ? {
              status: res.status,
              content: res.content,
              raw: res.raw,
              parsed: res.parsed,
              suggestions: res.suggestions
            }
          : null
      ) || '(aucune r\u00e9ponse)';
      addSection('R\u00e9ponse / sortie brute', resPre);

      if (selected.attempts && selected.attempts.length) {
        var attemptsPre = el('pre', 'agent-debug-pre');
        attemptsPre.textContent = prettyJson(selected.attempts);
        addSection('Tentatives (' + selected.attempts.length + ')', attemptsPre);
      }

      debugPanel.appendChild(detail);
    }

    function renderChatStats() {
      if (statusLevel === 'none') {
        statsEl.replaceChildren();
        notifyLayout();
        return;
      }

      var usage = sessionStats.lastUsage;
      var isFull = statusLevel === 'full';
      statsEl.replaceChildren();

      function addRow(className, parts) {
        var row = el('div', 'agent-chat-stats-row' + (className ? ' ' + className : ''));
        parts.forEach(function (part, idx) {
          if (idx > 0) {
            row.appendChild(el('span', 'agent-chat-stats-sep', { text: '\u00b7' }));
          }
          var tone = part.tone || 'ok';
          var cell = el('span', 'agent-chat-stats-item is-' + tone);
          if (part.label) {
            cell.appendChild(el('span', 'agent-chat-stats-label', { text: part.label }));
            cell.appendChild(document.createTextNode('\u00a0'));
          }
          cell.appendChild(
            el('span', 'agent-chat-stats-value is-' + tone, { text: part.value })
          );
          if (part.title) cell.title = part.title;
          row.appendChild(cell);
        });
        statsEl.appendChild(row);
      }

      if (!usage || sessionStats.turns < 1) {
        addRow(
          '',
          [
            { label: 'Tokens', value: '\u2014', title: 'Aucun \u00e9change pour l\u2019instant' },
            { label: 'Co\u00fbt', value: '\u2014' },
            { label: 'Contexte', value: '\u2014' },
            {
              label: 'M\u00e9moire',
              value: history.length + ' msg',
              title: 'Messages conserv\u00e9s dans cette session',
              tone: memoryTone(history.length)
            }
          ].concat(
            isFull
              ? [
                  { label: 'Latence', value: '\u2014' },
                  {
                    label: 'Session',
                    value: '0 tour',
                    title: 'Totaux de cette conversation'
                  }
                ]
              : []
          )
        );
        notifyLayout();
        return;
      }

      var tokenApprox = usage.estimated || sessionStats.estimated ? '\u2248' : '';
      var tokenTitle = usage.estimated
        ? 'Estimation (le fournisseur n\'a pas renvoy\u00e9 usage)'
        : 'Tokens du dernier \u00e9change';
      var lastTokenValue =
        tokenApprox +
        formatTokenCount(usage.totalTokens) +
        ' (' +
        formatTokenCount(usage.promptTokens) +
        '\u2191 ' +
        formatTokenCount(usage.completionTokens) +
        '\u2193)';

      var ctx = usage.context || {};
      var fill = typeof ctx.fillPercent === 'number' ? ctx.fillPercent : null;
      var compressionHint =
        fill != null && fill >= 50
          ? 'Contexte charg\u00e9 \u2014 l\'historique allonge les requ\u00eates'
          : 'Part du contexte utilis\u00e9e par le prompt + l\'historique';

      var parts = [
        {
          label: 'Tokens',
          value: lastTokenValue,
          title: tokenTitle,
          tone: tokensTone(usage.totalTokens, fill)
        },
        {
          label: 'Co\u00fbt',
          value: '\u2248' + formatCostUsd(usage.costUsd),
          title: 'Estimation selon le tarif publique du mod\u00e8le (non facturation)',
          tone: costTone(usage.costUsd)
        },
        {
          label: 'Contexte',
          value:
            fill != null
              ? fill + '% (' + formatTokenCount(ctx.requestTokens) + '/' + formatWindow(ctx.windowTokens) + ')'
              : formatTokenCount(ctx.requestTokens),
          title: compressionHint,
          tone: contextTone(fill)
        },
        {
          label: 'M\u00e9moire',
          value: history.length + ' msg',
          title: 'Messages conserv\u00e9s dans cette session',
          tone: memoryTone(history.length)
        }
      ];
      if (isFull) {
        parts.push({
          label: 'Latence',
          value: formatLatency(usage.latencyMs),
          tone: latencyTone(usage.latencyMs)
        });
        if (usage.cachedTokens != null && usage.cachedTokens > 0) {
          parts.push({
            label: 'Cache',
            value: formatTokenCount(usage.cachedTokens),
            title: 'Tokens d\'entr\u00e9e en cache',
            tone: 'ok'
          });
        }
        if (usage.reasoningTokens != null && usage.reasoningTokens > 0) {
          parts.push({
            label: 'Raisonnement',
            value: formatTokenCount(usage.reasoningTokens),
            tone: toneFromThresholds(usage.reasoningTokens, 2000, 5000, 10000)
          });
        }
        parts.push(
          {
            label: 'Compression',
            value: 'aucune',
            title:
              'L\'historique est renvoy\u00e9 en entier \u00e0 chaque tour (pas de r\u00e9sum\u00e9 ni troncature)',
            tone: fill != null && fill >= 65 ? 'warn' : 'ok'
          },
          {
            label: 'Session',
            value:
              formatTokenCount(sessionStats.totalTokens) +
              ' \u00b7 \u2248' +
              formatCostUsd(sessionStats.costUsd) +
              ' \u00b7 ' +
              sessionStats.turns +
              ' tour' +
              (sessionStats.turns > 1 ? 's' : ''),
            title: 'Totaux de cette conversation',
            tone: costTone(sessionStats.costUsd)
          }
        );
        if (usage.model) {
          parts.push({
            label: 'Mod\u00e8le',
            value: usage.model,
            title: usage.model,
            tone: 'ok'
          });
        }
        var fr = finishReasonLabel(usage.finishReason);
        if (fr) {
          parts.push({
            label: 'Fin',
            value: fr,
            tone: finishTone(usage.finishReason)
          });
        }
      }
      addRow('', parts);
      notifyLayout();
    }

    function setError(msg) {
      if (!msg) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = msg;
      notifyLayout();
    }

    function setSettingsStatus(msg, tone) {
      if (!msg) {
        settingsStatus.hidden = true;
        settingsStatus.textContent = '';
        settingsStatus.className = 'agent-settings-status';
        return;
      }
      settingsStatus.hidden = false;
      settingsStatus.textContent = msg;
      settingsStatus.className =
        'agent-settings-status' + (tone ? ' is-' + tone : '');
      notifyLayout();
    }

    function syncPresetButtons() {
      Object.keys(presetButtons).forEach(function (id) {
        presetButtons[id].classList.toggle('is-active', provider.preset === id);
      });
    }

    function ensureModelSelectValue(modelId) {
      var id = modelId || '';
      if (!id) return;
      var exists = Array.prototype.some.call(modelSelect.options, function (opt) {
        return opt.value === id;
      });
      if (!exists) {
        modelSelect.appendChild(el('option', null, { value: id, text: id }));
      }
      modelSelect.value = id;
    }

    function syncModelControls() {
      var isOpenAI = provider.preset === 'openai';
      modelSelectField.hidden = !isOpenAI;
      modelInputField.hidden = isOpenAI;
      if (isOpenAI) {
        ensureModelSelectValue(provider.model || Agent.PRESETS.openai.model);
      } else {
        modelInput.value = provider.model || '';
      }
    }

    function fillAgentColorSelect(selected) {
      var keys =
        (global.UserProfile && global.UserProfile.AGENT_COLOR_KEYS) || [
          'orange',
          'yellow',
          'green',
          'purple',
          'blue',
          'pink',
          'red',
          'teal',
          'coral',
          'sky'
        ];
      var labels =
        (global.UserProfile && global.UserProfile.AGENT_COLOR_LABELS) || {};
      var current = selected || agentIdentity.agentColor || 'orange';
      agentColorSelect.replaceChildren();
      keys.forEach(function (key) {
        agentColorSelect.appendChild(
          el('option', null, { value: key, text: labels[key] || key })
        );
      });
      if (keys.indexOf(current) === -1) current = keys[0] || 'orange';
      agentColorSelect.value = current;
    }

    function fillAgentFacePicker(selected) {
      var keys =
        (global.UserProfile && global.UserProfile.AGENT_FACE_KEYS) || [
          'classic',
          'soft',
          'bold',
          'sly',
          'calm',
          'spark'
        ];
      var labels =
        (global.UserProfile && global.UserProfile.AGENT_FACE_LABELS) || {};
      var current = normalizeAgentFace(selected || agentIdentity.agentFace);
      var color =
        (agentColorSelect && agentColorSelect.value) ||
        agentIdentity.agentColor ||
        'orange';
      var aura = normalizeFaceAura(color) || 'orange';
      agentFacePicker.replaceChildren();
      keys.forEach(function (key) {
        var label = labels[key] || key;
        var btn = el('button', 'agent-face-pick', {
          type: 'button',
          'data-face': key,
          'aria-label': label,
          title: label
        });
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', key === current ? 'true' : 'false');
        btn.classList.toggle('is-selected', key === current);
        var thumb = createAssistantFace('happy', aura, key);
        thumb.classList.add('agent-face--pick-thumb');
        // Picker thumbs are decorative; disable spin/puke interactions.
        thumb.style.pointerEvents = 'none';
        btn.appendChild(thumb);
        btn.appendChild(el('span', 'agent-face-pick-label', { text: label }));
        btn.addEventListener('click', function () {
          if (normalizeAgentFace(agentIdentity.agentFace) === key) {
            syncAgentAvatarPreview();
            return;
          }
          persistAgentIdentity({
            agentName: (agentNameInput.value || '').trim() || agentIdentity.agentName,
            agentPersonality:
              (agentPersonalityInput.value || '').trim() ||
              agentIdentity.agentPersonality,
            agentColor:
              (agentColorSelect && agentColorSelect.value) ||
              agentIdentity.agentColor,
            agentFace: key
          }).catch(function (err) {
            console.error('AgentUI face pick failed', err);
          });
        });
        agentFacePicker.appendChild(btn);
      });
    }

    function syncAgentAvatarPreview() {
      if (!agentAvatarPreviewFaceHost) return;
      var color =
        (agentColorSelect && agentColorSelect.value) ||
        agentIdentity.agentColor ||
        'orange';
      var aura = normalizeFaceAura(color) || 'orange';
      var style = normalizeAgentFace(agentIdentity.agentFace);
      var name =
        (agentNameInput && String(agentNameInput.value || '').trim()) ||
        agentIdentity.agentName ||
        'Assistant';
      var face = agentAvatarPreviewFaceHost.querySelector('.agent-face');
      var needNew =
        !face ||
        face.getAttribute('data-face') !== style ||
        face.getAttribute('data-aura') !== aura;
      if (needNew) {
        face = createAssistantFace('happy', aura, style);
        face.classList.add('agent-face--preview');
        agentAvatarPreviewFaceHost.replaceChildren(face);
      } else {
        applyFaceAura(face, aura);
        applyFaceStyle(face, style);
        if (face.getAttribute('data-emotion') !== 'happy') {
          face.setAttribute('data-emotion', 'happy');
          face.className =
            'agent-face agent-face--happy agent-face--preview';
          applyFaceStyle(face, style);
        }
      }
      if (agentAvatarPreviewName) {
        agentAvatarPreviewName.textContent = name;
      }
      var styleLabel =
        (global.UserProfile &&
          global.UserProfile.AGENT_FACE_LABELS &&
          global.UserProfile.AGENT_FACE_LABELS[style]) ||
        style;
      if (agentAvatarPreviewCaption) {
        agentAvatarPreviewCaption.textContent = 'Aper\u00e7u \u00b7 ' + styleLabel;
      }
      // Keep picker selection + thumb colors in sync without full rebuild when possible.
      var picks = agentFacePicker.querySelectorAll('.agent-face-pick');
      if (!picks.length) {
        fillAgentFacePicker(style);
      } else {
        for (var i = 0; i < picks.length; i++) {
          var pick = picks[i];
          var key = pick.getAttribute('data-face');
          var selected = key === style;
          pick.classList.toggle('is-selected', selected);
          pick.setAttribute('aria-checked', selected ? 'true' : 'false');
          var thumb = pick.querySelector('.agent-face');
          if (thumb) applyFaceAura(thumb, aura);
        }
      }
    }

    function applyAgentIdentity(profile) {
      var ensured =
        global.UserProfile && typeof global.UserProfile.ensureAgentIdentity === 'function'
          ? global.UserProfile.ensureAgentIdentity(profile || {})
          : { profile: profile || {} };
      var p = ensured.profile || {};
      agentIdentity = {
        agentName: p.agentName || '',
        agentPersonality: p.agentPersonality || '',
        agentColor: p.agentColor || 'orange',
        agentFace: normalizeAgentFace(p.agentFace)
      };
      agentNameInput.value = agentIdentity.agentName;
      agentPersonalityInput.value = agentIdentity.agentPersonality || '';
      fillAgentColorSelect(agentIdentity.agentColor);
      fillAgentFacePicker(agentIdentity.agentFace);
      updateAgentSectionTitle();
      syncAgentAvatarPreview();
    }

    function readAgentIdentityForm() {
      var color = agentColorSelect.value || agentIdentity.agentColor || 'orange';
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentColor === 'function') {
        color = global.UserProfile.normalizeAgentColor(color) || color;
      }
      var face = agentIdentity.agentFace || 'classic';
      var selectedPick = agentFacePicker.querySelector('.agent-face-pick.is-selected');
      if (selectedPick) {
        face = selectedPick.getAttribute('data-face') || face;
      }
      return {
        agentName: (agentNameInput.value || '').trim(),
        agentPersonality: (agentPersonalityInput.value || '').trim(),
        agentColor: color,
        agentFace: normalizeAgentFace(face)
      };
    }

    function updateAgentSectionTitle() {
      var name = 'Assistant';
      if (chrome.title) chrome.title.textContent = name;
      chrome.collapseLabel = 'Replier ' + name;
      chrome.expandLabel = 'D\u00e9velopper ' + name;
      chrome.enableLabel = 'Activer ' + name;
      if (chrome.checkbox) {
        chrome.checkbox.setAttribute('aria-label', chrome.enableLabel);
      }
      if (chrome.collapseBtn) {
        var expanded =
          chrome.collapseBtn.getAttribute('aria-expanded') === 'true';
        chrome.collapseBtn.setAttribute(
          'aria-label',
          expanded ? chrome.collapseLabel : chrome.expandLabel
        );
      }
    }

    async function persistAgentIdentity(nextIdentity) {
      var next = nextIdentity || readAgentIdentityForm();
      if (!next.agentName && global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        next.agentName = global.UserProfile.pickAgentNameForColor(next.agentColor);
      }
      var prevColor = agentIdentity.agentColor;
      var prevFace = agentIdentity.agentFace;
      agentIdentity = {
        agentName: next.agentName || '',
        agentPersonality: next.agentPersonality || '',
        agentColor: next.agentColor || 'orange',
        agentFace: normalizeAgentFace(next.agentFace)
      };
      agentNameInput.value = agentIdentity.agentName;
      agentPersonalityInput.value = agentIdentity.agentPersonality;
      fillAgentColorSelect(agentIdentity.agentColor);
      fillAgentFacePicker(agentIdentity.agentFace);
      updateAgentSectionTitle();
      syncAgentAvatarPreview();
      if (prevColor !== agentIdentity.agentColor) {
        refreshAssistantFacesAura();
      }
      if (prevFace !== agentIdentity.agentFace) {
        refreshAssistantFacesStyle();
      }
      if (!t || !global.UserProfile || typeof global.UserProfile.load !== 'function') {
        return agentIdentity;
      }
      var profile = await global.UserProfile.load(t);
      profile.agentName = agentIdentity.agentName;
      profile.agentPersonality = agentIdentity.agentPersonality;
      profile.agentColor = agentIdentity.agentColor;
      profile.agentFace = agentIdentity.agentFace;
      await global.UserProfile.save(t, profile);
      // Keep popup's live profile cache in sync for the next chat turn.
      if (typeof bridge.getProfile === 'function') {
        var live = bridge.getProfile();
        if (live && typeof live === 'object') {
          live.agentName = profile.agentName;
          live.agentPersonality = profile.agentPersonality;
          live.agentColor = profile.agentColor;
          live.agentFace = profile.agentFace;
        }
      }
      return agentIdentity;
    }

    bridge.setAgentName = async function (name) {
      var trimmed = String(name || '').trim();
      if (!trimmed) return { ok: false, reason: 'empty-name' };
      var maxLen =
        (global.UserProfile && global.UserProfile.MAX_AGENT_NAME) || 40;
      if (trimmed.length > maxLen) trimmed = trimmed.slice(0, maxLen);
      await persistAgentIdentity({
        agentName: trimmed,
        agentPersonality: agentIdentity.agentPersonality,
        agentColor: agentIdentity.agentColor,
        agentFace: agentIdentity.agentFace
      });
      return { ok: true, name: agentIdentity.agentName };
    };

    bridge.setAgentColor = async function (color) {
      var normalized = normalizeFaceAura(color);
      if (!normalized) return { ok: false, reason: 'invalid-color' };
      await persistAgentIdentity({
        agentName: agentIdentity.agentName,
        agentPersonality: agentIdentity.agentPersonality,
        agentColor: normalized,
        agentFace: agentIdentity.agentFace
      });
      return { ok: true, color: agentIdentity.agentColor };
    };

    bridge.setAgentPersonality = async function (personality) {
      var trimmed = String(personality || '').trim();
      if (!trimmed) return { ok: false, reason: 'empty-personality' };
      var maxLen =
        (global.UserProfile && global.UserProfile.MAX_AGENT_PERSONALITY) || 400;
      if (trimmed.length > maxLen) trimmed = trimmed.slice(0, maxLen);
      await persistAgentIdentity({
        agentName: agentIdentity.agentName,
        agentPersonality: trimmed,
        agentColor: agentIdentity.agentColor,
        agentFace: agentIdentity.agentFace
      });
      return { ok: true, personality: agentIdentity.agentPersonality };
    };

    function fillSettingsForm() {
      apiKeyInput.value = provider.apiKey || '';
      baseUrlInput.value = provider.baseUrl || '';
      // OpenAI / OpenRouter presets lock URL; custom unlocks.
      if (provider.preset === 'openai' || provider.preset === 'openrouter') {
        baseUrlInput.readOnly = true;
      } else {
        baseUrlInput.readOnly = false;
      }
      syncModelControls();
      syncPresetButtons();
      if (collapse && collapse.refreshSummary) collapse.refreshSummary();
      updateComposerEnabled();
      // Empty CTA only for unset providers; chat history or a configured provider hide it.
      // (.tp-link { display:inline-block } would otherwise override the hidden attribute.)
      var configured = Agent.isConfigured(provider);
      emptyState.classList.toggle('is-hidden', history.length > 0 || configured);
      emptyConfigBtn.hidden = configured;
      settingsBtn.title = configured ? 'Param\u00e8tres' : 'Configurer l\'assistant';
      settingsBtn.setAttribute(
        'aria-label',
        configured ? 'Param\u00e8tres de l\'assistant' : 'Configurer l\'assistant'
      );
    }

    function readSettingsForm() {
      var isOpenAI = provider.preset === 'openai';
      var next = Agent.normalizeProvider({
        preset: provider.preset || 'openai',
        apiKey: apiKeyInput.value,
        baseUrl: baseUrlInput.value,
        model: isOpenAI ? modelSelect.value : modelInput.value,
        verifiedFingerprint: provider.verifiedFingerprint || ''
      });
      // Config changed vs last verified fingerprint → not verified anymore.
      if (!Agent.isVerified(next)) {
        next = Agent.clearVerified(next);
      }
      return next;
    }

    function applyPreset(id) {
      var preset = Agent.PRESETS[id] || Agent.PRESETS.openai;
      var currentModel =
        (provider.preset === 'openai' ? modelSelect.value : modelInput.value) ||
        provider.model ||
        '';
      var next = {
        preset: preset.id,
        apiKey: apiKeyInput.value,
        baseUrl: preset.baseUrl || baseUrlInput.value,
        model: provider.preset === preset.id ? currentModel : preset.model || currentModel
      };
      if (preset.id === 'custom') {
        next.baseUrl = baseUrlInput.value || provider.baseUrl || '';
        next.model = modelInput.value || currentModel || '';
      }
      provider = Agent.normalizeProvider(next);
      fillSettingsForm();
    }

    function setSettingsOpen(open) {
      settingsOpen = !!open;
      settingsPanel.hidden = !settingsOpen;
      settingsBtn.classList.toggle('is-active', settingsOpen);
      settingsBtn.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
      notifyLayout();
    }

    function updateComposerEnabled() {
      var configured = Agent.isConfigured(provider);
      // Keep composer typable during in-flight turns; extra sends go to messageQueue.
      composer.hidden = !configured;
      sendBtn.disabled = !configured;
      input.disabled = !configured;
      if (!configured) {
        clearSuggestions();
        clearApplySuggestions();
        stopListening();
      } else {
        setSuggestionsBusy(pending);
        setApplySuggestionsBusy(pending);
        if (settleReady && !interviewActive && !isProjectScope) startListening();
      }
    }

    function activateQueuedUserRow(row) {
      if (!row) return;
      row.classList.remove('is-queued');
      row.removeAttribute('aria-label');
      var note = row.querySelector('.agent-msg-note');
      if (note && note.parentNode) note.parentNode.removeChild(note);
    }

    function enqueueUserMessage(text, options) {
      var opts = options || {};
      var msg = (text || '').trim();
      if (!msg) return false;
      if (opts.fromComposer) {
        input.value = '';
        refreshComposerTypingGaze();
      }
      if (opts.isSelfPrompt || opts.silentUser) {
        messageQueue.push({
          text: msg,
          isSelfPrompt: !!opts.isSelfPrompt,
          silent: true
        });
        dbgLog('agentUi', 'queue.queued', { queueLength: messageQueue.length, silent: true });
        return true;
      }
      var row = appendMessage('user', msg, { note: 'En attente' });
      row.classList.add('is-queued');
      row.setAttribute('aria-label', 'Message en attente');
      messageQueue.push({
        text: msg,
        row: row
      });
      dbgLog('agentUi', 'queue.queued', { queueLength: messageQueue.length });
      messagesEl.scrollTop = messagesEl.scrollHeight;
      notifyLayout();
      return true;
    }

    function drainMessageQueue() {
      if (pending || !messageQueue.length) return;
      var next = messageQueue.shift();
      if (!next || !next.text) return;
      dbgLog('agentUi', 'queue.processing', { queueLength: messageQueue.length });
      sendUserMessage(next.text, {
        queuedRow: next.row,
        isSelfPrompt: !!next.isSelfPrompt,
        silentUser: !!next.silent || !!next.isSelfPrompt
      });
    }

    function releasePendingAndDrain() {
      pending = false;
      updateComposerEnabled();
      setSuggestionsBusy(false);
      notifyLayout();
      scheduleFaceSleep();
      if (!messageQueue.length) {
        dbgLog('agentUi', 'queue.drained', { queueLength: 0 });
      }
      drainMessageQueue();
      // After the chat settles, Dream consolidates learnings in the background.
      // tryRunCardDream reschedules itself if another turn is still in flight.
      if (!interviewActive && (dreamDirty || cardMemoryNeedsDream())) {
        scheduleCardDream({ delay: 2500 });
      }
    }

    function isSelfPromptHistoryText(text) {
      return /^\[Auto-revue\b/i.test(String(text || '').trim());
    }

    function buildSelfPromptUserText(focus) {
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
    }

    function queueSelfPromptReview(focus) {
      if (interviewActive) return;
      enqueueUserMessage(buildSelfPromptUserText(focus), {
        isSelfPrompt: true,
        silentUser: true
      });
    }

    /**
     * Dream stage — async consolidation between chats.
     * Keeps Description as a short summary + misc notes when idle.
     */
    function scheduleCardDream(options) {
      options = options || {};
      if (isProjectScope) return;
      if (!Agent.isConfigured(provider) || typeof Agent.cardDreamTurn !== 'function') {
        return;
      }
      if (options.force) dreamDirty = true;
      var delay = options.delay != null ? options.delay : 4500;
      if (dreamDebounceTimer) {
        clearTimeout(dreamDebounceTimer);
        dreamDebounceTimer = null;
      }
      dreamDebounceTimer = setTimeout(function () {
        dreamDebounceTimer = null;
        tryRunCardDream();
      }, Math.max(0, delay));
    }

    function cardDescNeedsDreamRewrite() {
      if (verboseDescRewriteTried) return false;
      if (typeof Agent.isVerboseStructuredDesc !== 'function') return false;
      var desc =
        typeof bridge.getCardDesc === 'function' ? bridge.getCardDesc() || '' : '';
      return !!Agent.isVerboseStructuredDesc(desc);
    }

    function cardMemoryNeedsDream() {
      if (cardDescNeedsDreamRewrite()) return true;
      var Mem = global.AgentMemory;
      if (!Mem || typeof Mem.cardDreamNeedsRefresh !== 'function') return false;
      var mem =
        (typeof bridge.getCardMemory === 'function' && bridge.getCardMemory()) ||
        null;
      return !!Mem.cardDreamNeedsRefresh(mem);
    }

    async function tryRunCardDream() {
      if (isProjectScope || dreamInFlight) return;
      if (interviewActive || pending || messageQueue.length) {
        scheduleCardDream({ delay: 3500 });
        return;
      }
      if (!dreamDirty && !cardMemoryNeedsDream()) return;
      if (!Agent.isConfigured(provider) || typeof Agent.cardDreamTurn !== 'function') {
        return;
      }
      if (typeof bridge.setCardDesc !== 'function') return;

      var rewritingVerbose = cardDescNeedsDreamRewrite();
      dreamInFlight = true;
      dreamDirty = false;
      if (rewritingVerbose) verboseDescRewriteTried = true;
      var myDream = ++dreamGen;
      try {
        var result = await Agent.cardDreamTurn(provider, bridge, {
          history: history,
          onDebug: function (entry) {
            pushDebugEntry(entry);
          }
        });
        if (myDream !== dreamGen) return;
        if (result && result.usage) updateSessionStats(result.usage);

        var Mem = global.AgentMemory;
        if (
          result &&
          result.ok &&
          Mem &&
          typeof Mem.markCardDreamed === 'function' &&
          t &&
          // Mark dreamed on successful apply OR deliberate skip (already good / unchanged).
          (result.updated || result.skipped)
        ) {
          try {
            var current =
              (typeof bridge.getCardMemory === 'function' && bridge.getCardMemory()) ||
              Mem.emptyCardMemory();
            var updated = await Mem.markCardDreamed(t, current);
            if (onCardMemoryUpdate) onCardMemoryUpdate(updated);
            else {
              bridge.getCardMemory = function () {
                return updated;
              };
            }
          } catch (markErr) {
            console.error('AgentUI markCardDreamed failed', markErr);
          }
        }

        if (result && result.updated && result.applied) {
          muteListening();
          appendChangeRecap(result.applied, {
            ok: true
          });
          notifyLayout();
        }
      } catch (err) {
        console.error('AgentUI cardDream failed', err);
        // Retry later if facts still need consolidation.
        dreamDirty = true;
        if (rewritingVerbose) verboseDescRewriteTried = false;
        scheduleCardDream({ delay: 12000 });
      } finally {
        if (myDream === dreamGen) dreamInFlight = false;
      }
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

    function pickOne(items) {
      if (!items || !items.length) return null;
      return items[Math.floor(Math.random() * items.length)];
    }

    function randBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function playToneChord(tones, options) {
      options = options || {};
      try {
        var ctx = ensureAudioCtx();
        if (!ctx) return;
        var t0 = ctx.currentTime;
        var dest = ctx.destination;
        var freqJitter = options.freqJitter != null ? options.freqJitter : 0.04;
        var timeJitter = options.timeJitter != null ? options.timeJitter : 0.08;
        var fMul = 1 + randBetween(-freqJitter, freqJitter);
        var tMul = 1 + randBetween(-timeJitter, timeJitter);
        if (options.lowpass) {
          var filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(
            options.lowpass * (1 + randBetween(-0.08, 0.08)),
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
          var peak = (tone.peak != null ? tone.peak : 0.05) * randBetween(0.88, 1.12);
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
    }

    function playRandomChord(variants, options) {
      var tones = typeof variants[0] === 'function'
        ? pickOne(variants)()
        : pickOne(variants);
      playToneChord(tones, options);
    }

    /** Bright / playful — success, happy, tongue, wink, excited. */
    function playHappySound() {
      playRandomChord([
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
    }

    /** Soft minor — sad / apologetic. */
    function playSadSound() {
      playRandomChord(
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
    }

    /** Rising spark — surprised / wide-eyed. */
    function playSurprisedSound() {
      playRandomChord([
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
    }

    /** Soft pad — curious / look-around / suggestion. */
    function playCuriousSound() {
      playRandomChord(
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
    }

    /** Contemplative wobble — thinking. */
    function playThinkingSound() {
      playRandomChord(
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
    }

    /** Gentle mid chime — neutral. */
    function playNeutralSound() {
      playRandomChord([
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
    }

    /** Silly blip — tongue-out / cheeky. */
    function playTongueSound() {
      playRandomChord([
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
    }

    /** Bouncy arpeggio — excited / jump. */
    function playExcitedSound() {
      playRandomChord([
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
    }

    /** Soft wink — one-sided chime. */
    function playWinkSound() {
      playRandomChord([
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
    }

    function playEmotionSound(emotion) {
      var mood = emotion || 'happy';
      if (mood === 'sad') playSadSound();
      else if (mood === 'surprised' || mood === 'wideEyed') playSurprisedSound();
      else if (
        mood === 'curious' ||
        mood === 'lookUp' ||
        mood === 'lookDown' ||
        mood === 'lookLeft' ||
        mood === 'lookRight'
      ) {
        playCuriousSound();
      } else if (mood === 'thinking') playThinkingSound();
      else if (mood === 'neutral') playNeutralSound();
      else if (mood === 'tongue') playTongueSound();
      else if (mood === 'excited') playExcitedSound();
      else if (mood === 'wink') playWinkSound();
      else if (mood === 'happy') playHappySound();
      else playHappySound();
    }

    function playSuggestionSound() {
      playRandomChord(
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
    }

    /** Airy whoosh for the face click-spin. */
    function playSwooshSound() {
      try {
        var ctx = ensureAudioCtx();
        if (!ctx) return;
        var t0 = ctx.currentTime;
        var dur = 0.45 * randBetween(0.92, 1.08);
        var peak = 0.052 * randBetween(0.9, 1.12);

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
          bp.frequency.setValueAtTime(2600 * randBetween(0.9, 1.1), t0);
          bp.frequency.exponentialRampToValueAtTime(
            220 * randBetween(0.85, 1.1),
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
        osc.frequency.setValueAtTime(920 * randBetween(0.92, 1.08), t0);
        osc.frequency.exponentialRampToValueAtTime(
          160 * randBetween(0.9, 1.1),
          t0 + dur * 0.92
        );
        og.gain.setValueAtTime(0.0001, t0);
        og.gain.exponentialRampToValueAtTime(0.028 * randBetween(0.9, 1.1), t0 + 0.012);
        og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.95);
        osc.connect(og);
        og.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.04);
      } catch (e) {
        /* ignore audio failures */
      }
    }

    /** Wet retch for the over-spun face easter egg. */
    function playBarfSound() {
      try {
        var ctx = ensureAudioCtx();
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
    }

    function isAssistantExpanded() {
      return !!(collapse && typeof collapse.isExpanded === 'function' && collapse.isExpanded());
    }

    function announceAssistantArrival(options) {
      options = options || {};
      if (!settleReady) return;
      if (options.sound !== false) {
        if (options.soundKind === 'suggestion') playSuggestionSound();
        else playEmotionSound(options.emotion || 'happy');
      }
      if (options.unread === false) return;
      if (!isAssistantExpanded()) {
        unreadAssistant += 1;
        syncApplySummary();
      }
    }

    function lastUserMessageText() {
      for (var i = history.length - 1; i >= 0; i--) {
        if (history[i] && history[i].role === 'user') {
          return String(history[i].content || '');
        }
      }
      return '';
    }

    function isMeanUserText(text) {
      var t = String(text || '').toLowerCase();
      if (!t) return false;
      return /\b(idiot|stupide|nuls?|merde|connards?|connasses?|cons?\b|abruti|d[eé]bile|inutile|ferme[- ]?la|tais[- ]?toi|shut\s?up|fuck|hate|d[eé]teste|nique|fdp|nul\s+à\s+chier)\b/i.test(
        t
      );
    }

    var FACE_EMOTIONS = [
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

    /** Emotions that hand off to the idle choreography state machine. */
    var FACE_IDLE_ELIGIBLE = {
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

    var FACE_AURAS = {
      orange: { hi: '#ffe0c2', mid: '#f5b58a', lo: '#e8956a' },
      yellow: { hi: '#fff6c8', mid: '#f5d76e', lo: '#e0b83a' },
      green: { hi: '#d8f5c8', mid: '#8fd86a', lo: '#5aa843' },
      purple: { hi: '#e8d4ff', mid: '#b48ae0', lo: '#8a5cbf' },
      blue: { hi: '#cfe4ff', mid: '#7eb2f0', lo: '#4a86d4' },
      pink: { hi: '#ffd6e8', mid: '#f095b8', lo: '#d96a94' },
      red: { hi: '#ffd0c8', mid: '#f08070', lo: '#d14a3a' },
      teal: { hi: '#c8f5ee', mid: '#5ecfb8', lo: '#2fa892' },
      coral: { hi: '#ffd8c8', mid: '#f0a078', lo: '#e07850' },
      sky: { hi: '#dff4ff', mid: '#8ec8e8', lo: '#5aa8d0' }
    };

    function normalizeFaceAura(value) {
      var raw = String(value || '')
        .trim()
        .toLowerCase();
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentColor === 'function') {
        var fromProfile = global.UserProfile.normalizeAgentColor(raw);
        if (fromProfile && FACE_AURAS[fromProfile]) return fromProfile;
      }
      if (FACE_AURAS[raw]) return raw;
      if (raw === 'jaune' || raw === 'gold' || raw === 'amber' || raw === 'dore') return 'yellow';
      if (raw === 'peach' || raw === 'warm') return 'orange';
      if (raw === 'vert' || raw === 'lime') return 'green';
      if (raw === 'violet' || raw === 'lavender') return 'purple';
      if (raw === 'bleu') return 'blue';
      if (raw === 'rose') return 'pink';
      if (raw === 'rouge') return 'red';
      if (raw === 'turquoise' || raw === 'cyan' || raw === 'mint') return 'teal';
      if (raw === 'ciel') return 'sky';
      return null;
    }

    function identityAura() {
      return normalizeFaceAura(agentIdentity.agentColor) || 'orange';
    }

    function normalizeAgentFace(value) {
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
    }

    function identityFace() {
      return normalizeAgentFace(agentIdentity.agentFace);
    }

    /** Geometry overrides per face style (applied on top of the shared SVG). */
    var FACE_STYLE_FEATURES = {
      classic: {
        eyeL: { cx: 14.2, cy: 17.6, rx: 2.35, ry: 2.7 },
        eyeR: { cx: 25.8, cy: 17.6, rx: 2.35, ry: 2.7 },
        shineL: { cx: 15, cy: 16.7, r: 0.7 },
        shineR: { cx: 26.6, cy: 16.7, r: 0.7 },
        browL: 'M11.5 14.2c1.4-.9 3.2-.9 4.6 0',
        browR: 'M23.9 14.2c1.4-.9 3.2-.9 4.6 0',
        browWidth: '1.35',
        cheekL: { cx: 11.2, cy: 22.4, rx: 2.4, ry: 1.4, opacity: '0.35' },
        cheekR: { cx: 28.8, cy: 22.4, rx: 2.4, ry: 1.4, opacity: '0.35' }
      },
      soft: {
        eyeL: { cx: 14.2, cy: 17.8, rx: 2.7, ry: 3.0 },
        eyeR: { cx: 25.8, cy: 17.8, rx: 2.7, ry: 3.0 },
        shineL: { cx: 15.1, cy: 16.8, r: 0.85 },
        shineR: { cx: 26.7, cy: 16.8, r: 0.85 },
        browL: 'M11.2 14.6c1.5-.55 3.4-.55 4.9 0',
        browR: 'M23.9 14.6c1.5-.55 3.4-.55 4.9 0',
        browWidth: '1.2',
        cheekL: { cx: 11.0, cy: 22.6, rx: 2.9, ry: 1.7, opacity: '0.48' },
        cheekR: { cx: 29.0, cy: 22.6, rx: 2.9, ry: 1.7, opacity: '0.48' }
      },
      bold: {
        eyeL: { cx: 14.0, cy: 17.5, rx: 2.55, ry: 2.85 },
        eyeR: { cx: 26.0, cy: 17.5, rx: 2.55, ry: 2.85 },
        shineL: { cx: 14.85, cy: 16.55, r: 0.65 },
        shineR: { cx: 26.85, cy: 16.55, r: 0.65 },
        browL: 'M10.8 13.6c1.6-1.15 3.6-1.15 5.2 0',
        browR: 'M24.0 13.6c1.6-1.15 3.6-1.15 5.2 0',
        browWidth: '1.85',
        cheekL: { cx: 11.0, cy: 22.3, rx: 2.2, ry: 1.3, opacity: '0.28' },
        cheekR: { cx: 29.0, cy: 22.3, rx: 2.2, ry: 1.3, opacity: '0.28' }
      },
      sly: {
        eyeL: { cx: 14.4, cy: 17.9, rx: 2.5, ry: 2.15 },
        eyeR: { cx: 25.6, cy: 17.5, rx: 2.5, ry: 2.15 },
        shineL: { cx: 15.2, cy: 17.1, r: 0.55 },
        shineR: { cx: 26.3, cy: 16.7, r: 0.55 },
        browL: 'M11.2 15.0c1.5-.35 3.3-.85 4.8-1.15',
        browR: 'M24.0 13.4c1.5.2 3.2.55 4.6 1.15',
        browWidth: '1.45',
        cheekL: { cx: 11.4, cy: 22.5, rx: 2.1, ry: 1.2, opacity: '0.22' },
        cheekR: { cx: 28.6, cy: 22.2, rx: 2.5, ry: 1.45, opacity: '0.4' }
      },
      calm: {
        eyeL: { cx: 14.3, cy: 18.0, rx: 2.1, ry: 2.25 },
        eyeR: { cx: 25.7, cy: 18.0, rx: 2.1, ry: 2.25 },
        shineL: { cx: 15.0, cy: 17.2, r: 0.5 },
        shineR: { cx: 26.4, cy: 17.2, r: 0.5 },
        browL: 'M11.6 14.8c1.4-.25 3.1-.25 4.5 0',
        browR: 'M23.9 14.8c1.4-.25 3.1-.25 4.5 0',
        browWidth: '1.15',
        cheekL: { cx: 11.4, cy: 22.5, rx: 2.0, ry: 1.15, opacity: '0.18' },
        cheekR: { cx: 28.6, cy: 22.5, rx: 2.0, ry: 1.15, opacity: '0.18' }
      },
      spark: {
        eyeL: { cx: 14.1, cy: 17.3, rx: 2.75, ry: 3.05 },
        eyeR: { cx: 25.9, cy: 17.3, rx: 2.75, ry: 3.05 },
        shineL: { cx: 15.15, cy: 16.35, r: 1.05 },
        shineR: { cx: 26.95, cy: 16.35, r: 1.05 },
        browL: 'M11.0 13.8c1.55-1.05 3.5-1.05 5.1 0',
        browR: 'M23.9 13.8c1.55-1.05 3.5-1.05 5.1 0',
        browWidth: '1.4',
        cheekL: { cx: 11.1, cy: 22.3, rx: 2.55, ry: 1.5, opacity: '0.42' },
        cheekR: { cx: 28.9, cy: 22.3, rx: 2.55, ry: 1.5, opacity: '0.42' }
      }
    };

    function setEllipseAttrs(node, attrs) {
      if (!node || !attrs) return;
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, String(attrs[key]));
      });
    }

    function applyFaceStyle(face, styleKey) {
      if (!face) return;
      var style = normalizeAgentFace(styleKey);
      var feats = FACE_STYLE_FEATURES[style] || FACE_STYLE_FEATURES.classic;
      face.setAttribute('data-face', style);
      setEllipseAttrs(face.querySelector('.agent-face-eye--l'), feats.eyeL);
      setEllipseAttrs(face.querySelector('.agent-face-eye--r'), feats.eyeR);
      setEllipseAttrs(face.querySelector('.agent-face-shine--l'), feats.shineL);
      setEllipseAttrs(face.querySelector('.agent-face-shine--r'), feats.shineR);
      setEllipseAttrs(face.querySelector('.agent-face-cheek--l'), feats.cheekL);
      setEllipseAttrs(face.querySelector('.agent-face-cheek--r'), feats.cheekR);
      var browL = face.querySelector('.agent-face-brow--l');
      var browR = face.querySelector('.agent-face-brow--r');
      if (browL) {
        browL.setAttribute('d', feats.browL);
        browL.setAttribute('stroke-width', feats.browWidth);
      }
      if (browR) {
        browR.setAttribute('d', feats.browR);
        browR.setAttribute('stroke-width', feats.browWidth);
      }
    }

    function refreshAssistantFacesStyle() {
      var style = identityFace();
      var rows = messagesEl.querySelectorAll('.agent-msg--assistant');
      for (var i = 0; i < rows.length; i++) {
        var face = rows[i].querySelector('.agent-face');
        if (!face) continue;
        applyFaceStyle(face, style);
      }
    }

    function auraForEmotion(emotion, explicit) {
      // Identity color is the stable face hue; mood only tweaks expression.
      // Honor an explicit color when it matches identity (model echo) — and also
      // right after set_agent_color, when identity was just updated to that hue.
      var identity = identityAura();
      var forced = normalizeFaceAura(explicit);
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
    }

    function applyFacePalette(face, tone, palette) {
      if (!face || !palette) return;
      face.setAttribute('data-aura', tone || 'orange');
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
    }

    function applyFaceAura(face, aura) {
      if (!face) return;
      var tone = normalizeFaceAura(aura) || identityAura();
      applyFacePalette(face, tone, FACE_AURAS[tone] || FACE_AURAS.orange);
    }

    function refreshAssistantFacesAura() {
      var rows = messagesEl.querySelectorAll('.agent-msg--assistant');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var face = row.querySelector('.agent-face');
        if (!face || face.classList.contains('is-sick')) continue;
        var mood = face.getAttribute('data-emotion') || 'neutral';
        var aura = auraForEmotion(mood);
        applyFaceAura(face, aura);
        row.setAttribute('data-aura', aura);
      }
    }

    function spiceEmotion(base) {
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
    }

    function pickFaceEnterMotion(emotion) {
      var mood = emotion || 'neutral';
      if (mood === 'excited') {
        return pickOne(['roll', 'bounce', 'jump', 'jump', 'pop']);
      }
      if (mood === 'happy' || mood === 'tongue' || mood === 'wink') {
        return pickOne(['roll', 'bounce', 'pop', 'jump', null, null]);
      }
      if (mood === 'surprised' || mood === 'wideEyed') {
        return pickOne(['pop', 'bounce', 'roll', null]);
      }
      if (
        mood === 'curious' ||
        mood === 'lookUp' ||
        mood === 'lookDown' ||
        mood === 'lookLeft' ||
        mood === 'lookRight'
      ) {
        return pickOne(['roll', 'bounce', null, null]);
      }
      if (mood === 'thinking') {
        return pickOne(['roll', 'bounce', 'pop', null]);
      }
      return pickOne(['roll', 'pop', null, null, null]);
    }

    function inferAssistantEmotion(text, meta, context) {
      meta = meta || {};
      context = context || {};
      if (meta.emotion) return meta.emotion;
      if (context.thinking) return spiceEmotion('thinking');
      if (meta.error) return 'sad';
      if (meta.offer) return spiceEmotion('curious');
      if (meta.ok === false) return 'sad';
      if (meta.surprised) return spiceEmotion('surprised');

      var userText =
        context.userText != null ? context.userText : lastUserMessageText();
      if (isMeanUserText(userText)) return 'sad';

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
        return spiceEmotion('excited');
      }
      if (
        meta.ok === true ||
        /\b(c['']est fait|appliqu[eé]|parfait|tr[eè]s bien|voil[aà]|mis à jour|mis a jour|bravo|super|nickel|impeccable)\b/i.test(
          lower
        )
      ) {
        return spiceEmotion('happy');
      }
      if (
        /\b(oh+|tiens|inattendu|surprise|étrange|etrange|intéressant|interessant|wow|hein\b|waouh)\b/i.test(
          lower
        ) ||
        meta.emptyClaim
      ) {
        return spiceEmotion('surprised');
      }
      if (/\?/.test(t) && t.length < 160) return spiceEmotion('curious');
      if (meta.recap) return meta.ok === false ? 'sad' : spiceEmotion('happy');
      return spiceEmotion('neutral');
    }

    var faceGradientSeq = 0;

    function createAssistantFace(emotion, color, faceStyle) {
      var mood = emotion || 'neutral';
      if (FACE_EMOTIONS.indexOf(mood) === -1) mood = 'neutral';
      var aura = auraForEmotion(mood, color);
      var palette = FACE_AURAS[aura] || FACE_AURAS.orange;
      var style = normalizeAgentFace(
        faceStyle != null ? faceStyle : identityFace()
      );
      var face = el('span', 'agent-face agent-face--' + mood);
      face.setAttribute('aria-hidden', 'true');
      face.setAttribute('data-emotion', mood);
      face.setAttribute('data-aura', aura);
      face.setAttribute('data-face', style);
      var gradId = 'agentFaceSkin' + ++faceGradientSeq;
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
        '<circle class="agent-face-bg" cx="20" cy="20" r="19.2" fill="url(#' +
        gradId +
        ')"/>' +
        '<circle class="agent-face-ring" cx="20" cy="20" r="19.2" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.4"/>' +
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
      applyFaceStyle(face, style);
      face.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (face.classList.contains('is-frozen') || face.classList.contains('is-sick')) {
          return;
        }
        if (face.classList.contains('is-asleep')) {
          wakeFaceFromSleep({ resume: true });
          return;
        }
        var clicks = noteFaceSpinClick(face);
        if (clicks >= FACE_SPIN_PUKE_AT) {
          makeAssistantFaceSick(face);
          return;
        }
        spinAssistantFace(face);
      });
      return face;
    }

    var FACE_SPIN_PUKE_AT = 5;
    var FACE_SPIN_CLICK_WINDOW_MS = 3500;
    var FACE_SICK_RECOVER_MS = 5000;
    /** Blank orb + zzzz after the chat goes quiet. */
    var FACE_SLEEP_IDLE_MS = 60000;
    var faceSleepTimer = null;
    /** Bile / vomit yellow-green (not identity green). */
    var FACE_SICK_PALETTE = { hi: '#f2f6a8', mid: '#c9d83a', lo: '#9aa820' };
    var FACE_PUKE_COLORS = [
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

    function noteFaceSpinClick(face) {
      var now = Date.now();
      if (!face._spinClickAt || now - face._spinClickAt > FACE_SPIN_CLICK_WINDOW_MS) {
        face._spinClicks = 0;
      }
      face._spinClickAt = now;
      face._spinClicks = (face._spinClicks || 0) + 1;
      return face._spinClicks;
    }

    function prefersFaceReducedMotion() {
      try {
        return !!(
          global.matchMedia &&
          global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
      } catch (e) {
        return false;
      }
    }

    function pukeAllOverScreen(face) {
      var rect = face && face.getBoundingClientRect ? face.getBoundingClientRect() : null;
      var ox = rect ? rect.left + rect.width / 2 : global.innerWidth / 2;
      var oy = rect ? rect.top + rect.height * 0.72 : global.innerHeight / 2;
      var layer = el('div', 'agent-face-puke-layer');
      layer.setAttribute('aria-hidden', 'true');
      var reduced = prefersFaceReducedMotion();
      var count = reduced ? 18 : 96;
      var vw = global.innerWidth || 800;
      var vh = global.innerHeight || 600;
      var reach = Math.sqrt(vw * vw + vh * vh);
      for (var i = 0; i < count; i++) {
        var blob = el('span', 'agent-face-puke-blob');
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
          FACE_PUKE_COLORS[Math.floor(Math.random() * FACE_PUKE_COLORS.length)];
        if (Math.random() > 0.45) {
          blob.classList.add('agent-face-puke-blob--splatter');
        }
        layer.appendChild(blob);
      }
      document.body.appendChild(layer);
      global.setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }, reduced ? 2000 : 3200);
    }

    function clearSickRecoverTimer(face) {
      if (face && face._sickRecoverTimer != null) {
        clearTimeout(face._sickRecoverTimer);
        face._sickRecoverTimer = null;
      }
    }

    function recoverAssistantFaceFromSick(face) {
      if (!face || !face.classList || !face.classList.contains('is-sick')) return;
      clearSickRecoverTimer(face);
      face.classList.remove('is-sick');
      face._spinClicks = 0;
      face._spinClickAt = 0;
      face.removeAttribute('title');
      var resume = face._preSickEmotion || 'happy';
      face._preSickEmotion = null;
      var row = face.closest('.agent-msg--assistant');
      if (!row || !row.isConnected || face.classList.contains('is-frozen')) {
        applyFaceAura(face, identityAura());
        return;
      }
      setAssistantFaceEmotion(row, resume, {
        animate: false,
        smooth: true
      });
    }

    function makeAssistantFaceSick(face) {
      if (!face || !face.classList || face.classList.contains('is-sick')) return;
      clearSickRecoverTimer(face);
      clearFaceAsleepVisual(face);
      cancelFaceMorph(face);
      clearFaceMotionClasses(face);
      suppressFaceIdleMachine();
      face._preSickEmotion = face.getAttribute('data-emotion') || 'happy';
      face._spinClicks = FACE_SPIN_PUKE_AT;
      swapFaceEmotionClass(face, 'surprised');
      face.classList.add('is-sick');
      face.setAttribute('data-emotion', 'surprised');
      applyFacePalette(face, 'yellow', FACE_SICK_PALETTE);
      face.removeAttribute('data-think');
      face.removeAttribute('data-listen');
      face.setAttribute('title', 'Beurk\u2026');
      var badge = face.querySelector('.agent-face-status');
      if (badge) badge.remove();
      var row = face.closest('.agent-msg--assistant');
      if (row) {
        row.setAttribute('data-emotion', 'surprised');
        row.setAttribute('data-aura', 'yellow');
      }
      playBarfSound();
      pukeAllOverScreen(face);
      face._sickRecoverTimer = global.setTimeout(function () {
        face._sickRecoverTimer = null;
        recoverAssistantFaceFromSick(face);
      }, FACE_SICK_RECOVER_MS);
    }

    function clearFaceSleepTimer() {
      if (faceSleepTimer != null) {
        clearTimeout(faceSleepTimer);
        faceSleepTimer = null;
      }
    }

    function removeFaceZzz(face) {
      if (!face) return;
      var layer = face.querySelector('.agent-face-zzz-layer');
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    }

    function clearFaceAsleepVisual(face) {
      if (!face || !face.classList) return;
      if (!face.classList.contains('is-asleep')) {
        removeFaceZzz(face);
        return;
      }
      face.classList.remove('is-asleep');
      if (face.getAttribute('title') === 'Zzz\u2026') {
        face.removeAttribute('title');
      }
      removeFaceZzz(face);
    }

    function ensureFaceZzz(face) {
      if (!face) return null;
      var layer = face.querySelector('.agent-face-zzz-layer');
      if (layer) return layer;
      layer = el('span', 'agent-face-zzz-layer');
      layer.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 4; i++) {
        var z = el('span', 'agent-face-zzz', { text: 'z' });
        z.style.setProperty('--i', String(i));
        layer.appendChild(z);
      }
      face.appendChild(layer);
      return layer;
    }

    function canLiveFaceSleep() {
      if (pending || faceSm.typing || interviewActive || listeningAnalyzing) {
        return false;
      }
      if (
        thinkingMotionRow &&
        thinkingMotionRow.isConnected &&
        thinkingMotionRow.classList.contains('is-pending')
      ) {
        return false;
      }
      var face = getLiveAssistantFace();
      if (!face || face.classList.contains('is-sick')) return false;
      return true;
    }

    function putLiveFaceToSleep() {
      var face = getLiveAssistantFace();
      if (!face) return;
      if (face.classList.contains('is-asleep')) return;
      if (!canLiveFaceSleep()) {
        scheduleFaceSleep();
        return;
      }
      cancelFaceMorph(face);
      clearFaceMotionClasses(face);
      faceSmClearFx();
      suppressFaceIdleMachine();
      face.classList.add('is-asleep');
      face.setAttribute('title', 'Zzz\u2026');
      face.removeAttribute('data-listen');
      face.removeAttribute('data-think');
      var badge = face.querySelector('.agent-face-status');
      if (badge) badge.remove();
      ensureFaceZzz(face);
    }

    function wakeFaceFromSleep(options) {
      options = options || {};
      clearFaceSleepTimer();
      var asleep = messagesEl.querySelector(
        '.agent-msg--assistant .agent-face.is-asleep'
      );
      if (asleep) {
        clearFaceAsleepVisual(asleep);
        if (
          options.resume !== false &&
          !faceSm.typing &&
          !pending &&
          !asleep.classList.contains('is-frozen') &&
          !asleep.classList.contains('is-sick')
        ) {
          var row = asleep.closest('.agent-msg--assistant');
          var mood = asleep.getAttribute('data-emotion') || 'happy';
          if (row && FACE_IDLE_ELIGIBLE[mood]) {
            handOffToFaceIdleMachine(row, mood, { enter: false });
          }
        }
        if (
          listeningActive &&
          listenFaceMode &&
          listenFaceMode !== 'offer' &&
          !pending &&
          !interviewActive
        ) {
          setListenBarState(listenFaceMode);
        }
      }
      if (options.reschedule !== false) {
        scheduleFaceSleep();
      }
    }

    function scheduleFaceSleep() {
      clearFaceSleepTimer();
      faceSleepTimer = global.setTimeout(function () {
        faceSleepTimer = null;
        putLiveFaceToSleep();
      }, FACE_SLEEP_IDLE_MS);
    }

    /** Reset the quiet timer; wake if the face already dozed off. */
    function noteFaceChatActivity(options) {
      wakeFaceFromSleep(options || { resume: true });
    }

    function spinAssistantFace(face) {
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
      playSwooshSound();
      var onEnd = function (ev) {
        if (ev && ev.target !== face) return;
        face.classList.remove('agent-face--spin');
        face.removeEventListener('animationend', onEnd);
        face._agentSpinEnd = null;
      };
      face._agentSpinEnd = onEnd;
      face.addEventListener('animationend', onEnd);
    }

    function clearFaceMotionClasses(face) {
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
    }

    var THINK_MOTIONS = ['glance', 'nod', 'sway', 'search', 'ponder', 'squint', 'bob'];
    var thinkingMotionTimer = null;
    var thinkingMotionRow = null;
    var thinkingMotionLast = '';

    function stopThinkingMotions() {
      if (thinkingMotionTimer != null) {
        clearInterval(thinkingMotionTimer);
        thinkingMotionTimer = null;
      }
      if (thinkingMotionRow) {
        var face = thinkingMotionRow.querySelector('.agent-face');
        if (face) face.removeAttribute('data-think');
      }
      thinkingMotionRow = null;
      thinkingMotionLast = '';
    }

    function pickNextThinkMotion() {
      var choices = THINK_MOTIONS.filter(function (m) {
        return m !== thinkingMotionLast;
      });
      if (!choices.length) choices = THINK_MOTIONS.slice();
      return pickOne(choices);
    }

    function applyThinkMotion(face, motion) {
      if (!face) return;
      face.setAttribute('data-think', motion || 'glance');
    }

    function startThinkingMotions(row) {
      stopThinkingMotions();
      if (!row) return;
      suppressFaceIdleMachine();
      thinkingMotionRow = row;
      // Keep the thinking mouth; only swap body/eye loops.
      setAssistantFaceEmotion(row, 'thinking', {
        animate: true,
        forceEnter: true,
        fromIdleMachine: true
      });
      var tick = function () {
        if (!thinkingMotionRow || !thinkingMotionRow.classList.contains('is-pending')) {
          stopThinkingMotions();
          return;
        }
        var face = thinkingMotionRow.querySelector('.agent-face');
        if (!face) {
          stopThinkingMotions();
          return;
        }
        // Typing takes over: glance at the composer instead of thinking loops.
        if (faceSm.typing) {
          if (face.getAttribute('data-emotion') !== 'lookDown') {
            setAssistantFaceEmotion(thinkingMotionRow, 'lookDown', {
              fromIdleMachine: true,
              smooth: true
            });
          }
          return;
        }
        // Stay on thinking emotion if something else changed it.
        if (face.getAttribute('data-emotion') !== 'thinking') {
          cancelFaceMorph(face);
          swapFaceEmotionClass(face, 'thinking');
          applyFaceAura(face, auraForEmotion('thinking'));
        }
        thinkingMotionLast = pickNextThinkMotion();
        applyThinkMotion(face, thinkingMotionLast);
      };
      tick();
      thinkingMotionTimer = setInterval(tick, 2100 + Math.floor(Math.random() * 900));
    }

    /**
     * Idle face choreography state machine.
     *
     * Stay on smile most of the time. Prefer same-emotion micro-fx
     * (nod/bounce/breathe) over emotion swaps — morphing faces is what
     * reads as jitter. Digressions are rare and always return to smile.
     * Typing forces lookDown until the draft clears.
     */
    var FACE_SM_MAX_AWAY = 1;
    var FACE_MORPH_SETTLE_MS = 160;
    var FACE_POSE_TWEEN_MS = 260;
    var FACE_POSE_TWEEN_FAST_MS = 90;
    /** Never advance mid-morph; digressions need time on-screen after settle. */
    var FACE_SM_MIN_HOLD_MS = FACE_MORPH_SETTLE_MS + FACE_POSE_TWEEN_MS + 280;
    var FACE_FEATURE_SEL =
      '.agent-face-eyes, .agent-face-eye, .agent-face-brow, .agent-face-cheek, .agent-face-shine';

    var FACE_SM_STATES = {
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

    /** Weighted edges — digressions are soft & rare; most weight is stay/smile-fx. */
    var FACE_SM_TRANSITIONS = {
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

    /** Arrival flourishes only when a new reply lands (enter: true). */
    var FACE_SM_ARRIVALS = [
      ['smile'],
      ['smile'],
      ['smile'],
      ['nod', 'smile'],
      ['bounce', 'smile'],
      ['sparkle', 'smile'],
      ['wink', 'smile']
    ];

    var faceSm = {
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

    function faceSmRand(min, max) {
      return min + Math.floor(Math.random() * (max - min + 1));
    }

    function clearFaceIdleTimer() {
      if (faceSm.timer != null) {
        clearTimeout(faceSm.timer);
        faceSm.timer = null;
      }
    }

    function stopFaceIdleMachine() {
      clearFaceIdleTimer();
      faceSmClearFx();
      cancelFaceMorph(faceSmFace());
      faceSm.state = null;
      faceSm.row = null;
      faceSm.suppressed = false;
      faceSm.resumeEmotion = null;
      faceSm.queue = null;
      faceSm.awayCount = 0;
      faceSm.lastState = null;
      faceSm.seq += 1;
    }

    function suppressFaceIdleMachine() {
      faceSm.suppressed = true;
      clearFaceIdleTimer();
      faceSmClearFx();
      cancelFaceMorph(faceSmFace());
      faceSm.state = null;
      faceSm.queue = null;
      faceSm.awayCount = 0;
    }

    function faceSmLiveRow() {
      if (faceSm.row && faceSm.row.isConnected) {
        var live = faceSm.row.querySelector(
          '.agent-face:not(.is-frozen):not(.is-sick)'
        );
        if (live) return faceSm.row;
      }
      var face = getLiveAssistantFace();
      return face ? face.closest('.agent-msg--assistant') : null;
    }

    function faceSmFace() {
      var row = faceSm.row;
      if (!row) return null;
      return row.querySelector('.agent-face:not(.is-frozen):not(.is-sick)');
    }

    function faceSmClearFx() {
      var face = faceSmFace();
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
    }

    function faceSmPlayFx(fx) {
      var face = faceSmFace();
      if (!face || !fx) return;
      faceSmClearFx();
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
        faceSmSpawnSparkles(face);
      }
    }

    function faceSmSpawnSparkles(face) {
      if (!face) return;
      // Anchor to the face (not viewport coords). getBoundingClientRect can be
      // 0×0 at top-left when the face was just mounted / not laid out yet.
      var stale = face.querySelectorAll('.agent-face-sparkle-layer');
      for (var s = 0; s < stale.length; s++) {
        if (stale[s].parentNode) stale[s].parentNode.removeChild(stale[s]);
      }
      var layer = el('span', 'agent-face-sparkle-layer');
      layer.setAttribute('aria-hidden', 'true');
      var count = 5 + Math.floor(Math.random() * 3);
      for (var i = 0; i < count; i++) {
        var speck = el('span', 'agent-face-sparkle');
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
    }

    function faceSmPickWeighted(edges) {
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
    }

    function faceSmApply(stateName, options) {
      options = options || {};
      var def = FACE_SM_STATES[stateName];
      var row = faceSm.row;
      if (!def || !row) return;
      faceSm.lastState = faceSm.state;
      faceSm.state = stateName;
      if (stateName === 'smile' || stateName === 'lookDown') {
        faceSm.awayCount = 0;
      } else {
        faceSm.awayCount += 1;
      }
      var face = row.querySelector('.agent-face');
      var prevMood = face && face.getAttribute('data-emotion');
      var sameMood = prevMood === def.emotion;
      // Same emotion (smile → nod / arrival smile): never re-commit the emotion
      // class — that restarts bob/glow and read as jitter.
      if (sameMood && face && !face.classList.contains('is-frozen')) {
        if (options.enter) {
          applyFaceEnterMotion(face, def.emotion);
        }
        if (def.fx) faceSmPlayFx(def.fx);
        else if (!options.enter) faceSmClearFx();
        return;
      }
      var fastPose =
        def.emotion === 'wink' || prevMood === 'wink';
      setAssistantFaceEmotion(row, def.emotion, {
        animate: !!options.enter,
        forceEnter: !!options.enter,
        fromIdleMachine: true,
        smooth: !options.enter,
        fast: fastPose,
        onApplied: function () {
          if (def.fx) faceSmPlayFx(def.fx);
          else faceSmClearFx();
        }
      });
    }

    function faceSmScheduleNext(fromState) {
      clearFaceIdleTimer();
      if (faceSm.suppressed || faceSm.typing || !faceSm.row) return;
      var def = FACE_SM_STATES[fromState];
      if (!def || !def.holdMax) return;
      var delay = faceSmRand(def.holdMin, def.holdMax);
      // Never cut a pose short of the morph window — that was the jitter.
      delay = Math.max(FACE_SM_MIN_HOLD_MS, delay);
      var seq = faceSm.seq;
      faceSm.timer = setTimeout(function () {
        if (seq !== faceSm.seq) return;
        faceSmAdvance(fromState);
      }, delay);
    }

    function faceSmEnqueue(states) {
      if (!states || !states.length) return;
      faceSm.queue = (faceSm.queue || []).concat(states);
    }

    function faceSmPickNext(fromState) {
      if (faceSm.queue && faceSm.queue.length) {
        return faceSm.queue.shift();
      }
      if (faceSm.awayCount >= FACE_SM_MAX_AWAY && fromState !== 'smile') {
        return 'smile';
      }
      var edges = FACE_SM_TRANSITIONS[fromState];
      if (!edges || !edges.length) return 'smile';
      // Avoid immediate repeat of the same digression when smiling.
      var filtered = edges;
      if (fromState === 'smile' && faceSm.lastState) {
        var noRepeat = edges.filter(function (e) {
          if (e.seq) return e.seq[0] !== faceSm.lastState;
          return e.to !== faceSm.lastState;
        });
        if (noRepeat.length) filtered = noRepeat;
      }
      var pick = faceSmPickWeighted(filtered);
      if (!pick) return 'smile';
      if (pick.seq && pick.seq.length) {
        faceSmEnqueue(pick.seq.slice(1));
        return pick.seq[0];
      }
      return pick.to || 'smile';
    }

    function faceSmAdvance(fromState) {
      if (faceSm.suppressed || faceSm.typing || !faceSm.row) return;
      var next = faceSmPickNext(fromState);
      if (!FACE_SM_STATES[next]) next = 'smile';
      faceSmApply(next);
      faceSmScheduleNext(next);
    }

    function faceSmPickArrival() {
      var script = pickOne(FACE_SM_ARRIVALS) || ['smile'];
      return script.slice();
    }

    function startFaceIdleMachine(row, options) {
      options = options || {};
      clearFaceIdleTimer();
      faceSmClearFx();
      faceSm.seq += 1;
      faceSm.suppressed = false;
      faceSm.row = row || null;
      faceSm.state = null;
      faceSm.lastState = null;
      faceSm.awayCount = 0;
      faceSm.queue = null;
      if (!faceSm.row) return;

      if (faceSm.typing) {
        faceSmApply('lookDown');
        return;
      }

      // Explicit start, or quiet resume (wake / typing end): settle on smile.
      // Flashy arrivals only when a new reply just landed (enter: true).
      if (options.startState) {
        faceSmApply(options.startState, { enter: options.enter !== false });
        faceSmScheduleNext(options.startState);
        scheduleFaceSleep();
        return;
      }
      if (options.enter === false) {
        faceSmApply('smile', { enter: false });
        faceSmScheduleNext('smile');
        scheduleFaceSleep();
        return;
      }
      var arrival = faceSmPickArrival();
      var first = arrival.shift();
      if (arrival.length) faceSmEnqueue(arrival);
      faceSmApply(first, { enter: true });
      faceSmScheduleNext(first);
      scheduleFaceSleep();
    }

    function setFaceIdleTyping(isTyping) {
      var next = !!isTyping;
      if (faceSm.typing === next) {
        // Still refresh lookDown if a new live face appeared while drafting.
        if (next) {
          var rowFresh = faceSmLiveRow() || thinkingMotionRow;
          if (rowFresh && faceSm.state !== 'lookDown') {
            faceSm.row = rowFresh;
            clearFaceIdleTimer();
            faceSmClearFx();
            setAssistantFaceEmotion(rowFresh, 'lookDown', {
              fromIdleMachine: true,
              smooth: true
            });
            faceSm.state = 'lookDown';
          }
        }
        return;
      }
      faceSm.typing = next;

      var row = faceSmLiveRow() || thinkingMotionRow;
      if (!row) return;
      faceSm.row = row;

      if (faceSm.typing) {
        wakeFaceFromSleep({ resume: false, reschedule: false });
        clearFaceIdleTimer();
        faceSm.queue = null;
        faceSmClearFx();
        var faceNow = row.querySelector('.agent-face');
        var current = faceNow && faceNow.getAttribute('data-emotion');
        if (current && current !== 'lookDown') {
          faceSm.resumeEmotion = current;
        }
        setAssistantFaceEmotion(row, 'lookDown', {
          fromIdleMachine: true,
          smooth: true
        });
        faceSm.state = 'lookDown';
        return;
      }

      // Draft cleared — resume choreography unless thinking/sad hold the face.
      if (faceSm.suppressed) {
        if (
          thinkingMotionRow &&
          thinkingMotionRow === row &&
          thinkingMotionRow.classList.contains('is-pending')
        ) {
          setAssistantFaceEmotion(row, 'thinking', {
            fromIdleMachine: true,
            smooth: true
          });
          var face = row.querySelector('.agent-face');
          if (face) applyThinkMotion(face, thinkingMotionLast || 'glance');
        } else if (faceSm.resumeEmotion) {
          setAssistantFaceEmotion(row, faceSm.resumeEmotion, {
            fromIdleMachine: true,
            smooth: true
          });
        }
        faceSm.resumeEmotion = null;
        scheduleFaceSleep();
        return;
      }

      faceSm.resumeEmotion = null;
      faceSm.queue = null;
      faceSm.awayCount = 0;
      faceSmApply('smile');
      faceSmScheduleNext('smile');
      scheduleFaceSleep();
    }

    function refreshComposerTypingGaze() {
      var hasText = !!(input.value && String(input.value).replace(/\s+/g, ''));
      setFaceIdleTyping(hasText);
    }

    function handOffToFaceIdleMachine(row, emotion, options) {
      options = options || {};
      if (!row) return;
      var mood = emotion || 'happy';
      if (!FACE_IDLE_ELIGIBLE[mood]) {
        suppressFaceIdleMachine();
        faceSm.row = row;
        return;
      }
      // Prefer varied arrival scripts; honor an explicit start when provided.
      startFaceIdleMachine(row, {
        startState: options.startState || null,
        enter: options.enter !== false
      });
    }

    function applyFaceEnterMotion(face, emotion) {
      if (!face) return;
      clearFaceMotionClasses(face);
      var motion = pickFaceEnterMotion(emotion);
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
    }

    function clearFaceInlineMorph(face) {
      if (!face || !face.style) return;
      face.style.transition = '';
      face.style.transform = '';
      face.style.animation = '';
    }

    function clearFaceFeatureInline(face) {
      if (!face || !face.querySelectorAll) return;
      var nodes = face.querySelectorAll(FACE_FEATURE_SEL);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!node.style) continue;
        node.style.transition = '';
        node.style.animation = '';
        node.style.transform = '';
        node.style.opacity = '';
      }
    }

    /**
     * Capture animated computed transforms as inline styles, then kill
     * keyframe animations so a CSS pose-tween can take over without a snap.
     */
    function freezeFaceFeatures(face) {
      if (!face || !face.querySelectorAll) return;
      var nodes = face.querySelectorAll(FACE_FEATURE_SEL);
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
    }

    function cancelFaceMorph(face) {
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
      clearFaceInlineMorph(face);
      clearFaceFeatureInline(face);
    }

    function prefersReducedFaceMotion() {
      try {
        return !!(
          global.matchMedia &&
          global.matchMedia('(prefers-reduced-motion: reduce)').matches
        );
      } catch (e) {
        return false;
      }
    }

    function swapFaceEmotionClass(face, mood) {
      if (!face) return;
      for (var i = 0; i < FACE_EMOTIONS.length; i++) {
        face.classList.remove('agent-face--' + FACE_EMOTIONS[i]);
      }
      face.classList.add('agent-face');
      face.classList.add('agent-face--' + mood);
      face.setAttribute('data-emotion', mood);
    }

    function setAssistantFaceEmotion(row, emotion, options) {
      if (!row) return;
      options = options || {};
      var mood = emotion || 'neutral';
      if (FACE_EMOTIONS.indexOf(mood) === -1) mood = 'neutral';
      var aura = auraForEmotion(
        mood,
        options.color != null ? options.color : options.aura
      );
      var face = row.querySelector('.agent-face');
      var isNew = !face;
      if (face && face.classList.contains('is-sick')) return;
      if (!face) {
        face = createAssistantFace(mood, aura);
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
        !prefersReducedFaceMotion();

      function commitEmotion(applyEnter) {
        clearFaceMotionClasses(face);
        swapFaceEmotionClass(face, mood);
        applyFaceAura(face, aura);
        face.classList.remove('is-frozen');
        face.classList.remove('is-sick');
        clearFaceAsleepVisual(face);
        row.setAttribute('data-emotion', mood);
        row.setAttribute('data-aura', aura);
        if (mood !== 'thinking') {
          face.removeAttribute('data-think');
        }
        if (applyEnter && options.animate !== false && (isNew || options.forceEnter)) {
          applyFaceEnterMotion(face, mood);
        } else if (mood === 'excited' && !canSmooth) {
          face.classList.add('agent-face--motion-jump');
        }
        if (typeof options.onApplied === 'function') {
          options.onApplied(face);
        }
      }

      function finishExternalHandoff() {
        if (!options.fromIdleMachine) {
          if (mood === 'thinking' || !FACE_IDLE_ELIGIBLE[mood]) {
            suppressFaceIdleMachine();
            faceSm.row = row;
          } else if (options.idleHandOff !== false) {
            handOffToFaceIdleMachine(row, mood, {
              startState: options.idleStart || null,
              enter: false
            });
          }
        }
      }

      if (!canSmooth) {
        cancelFaceMorph(face);
        commitEmotion(true);
        finishExternalHandoff();
        return;
      }

      // Smooth path: freeze animated features → tween to rest → swap pose →
      // tween into the new static pose → release animations together.
      cancelFaceMorph(face);
      var settleMs = options.fast ? FACE_POSE_TWEEN_FAST_MS : FACE_MORPH_SETTLE_MS;
      var tweenMs = options.fast ? FACE_POSE_TWEEN_FAST_MS : FACE_POSE_TWEEN_MS;
      face.classList.add('is-morphing', 'is-pose-tween');
      freezeFaceFeatures(face);
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
        var frozen = face.querySelectorAll(FACE_FEATURE_SEL);
        for (var fi = 0; fi < frozen.length; fi++) {
          frozen[fi].style.transition = '';
          frozen[fi].style.animation = '';
          frozen[fi].style.transform = '';
        }
      } catch (e) {
        /* ignore style freeze failures */
      }

      var morphSeq = faceSm.seq;
      face._morphTimer = setTimeout(function () {
        face._morphTimer = null;
        if (morphSeq !== faceSm.seq) {
          cancelFaceMorph(face);
          return;
        }
        clearFaceInlineMorph(face);
        commitEmotion(false);
        face.classList.remove('is-morphing');
        face.classList.add('is-settling');
        // Stay in is-pose-tween so the new emotion's static transforms ease in
        // before blink / bob loops restart — keeps lids synchronized.
        face._settleTimer = setTimeout(function () {
          face._settleTimer = null;
          if (morphSeq !== faceSm.seq) return;
          face.classList.remove('is-settling', 'is-pose-tween');
          clearFaceFeatureInline(face);
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
    }

    // ── Point at page sections (lean + white glove + blink) ─────────────
    var POINT_HOLD_MS = 2800;
    var POINT_BLINK_MS = 2600;
    var pointAtState = {
      seq: 0,
      clearTimer: null,
      faceTimer: null,
      targetEl: null,
      gloveEl: null
    };

    function clearAgentPointTarget() {
      var prev = document.querySelectorAll('.is-agent-point-target');
      for (var i = 0; i < prev.length; i++) {
        prev[i].classList.remove('is-agent-point-target');
      }
      pointAtState.targetEl = null;
    }

    function clearAgentPointGlove() {
      if (pointAtState.gloveEl && pointAtState.gloveEl.parentNode) {
        pointAtState.gloveEl.parentNode.removeChild(pointAtState.gloveEl);
      }
      pointAtState.gloveEl = null;
      Array.prototype.forEach.call(
        document.querySelectorAll('.agent-point-glove'),
        function (node) {
          if (node && node.parentNode) node.parentNode.removeChild(node);
        }
      );
    }

    function clearAgentPointing() {
      pointAtState.seq += 1;
      if (pointAtState.clearTimer != null) {
        clearTimeout(pointAtState.clearTimer);
        pointAtState.clearTimer = null;
      }
      if (pointAtState.faceTimer != null) {
        clearTimeout(pointAtState.faceTimer);
        pointAtState.faceTimer = null;
      }
      clearAgentPointGlove();
      clearAgentPointTarget();
      Array.prototype.forEach.call(
        document.querySelectorAll('.agent-face.is-pointing'),
        function (face) {
          face.classList.remove('is-pointing');
          face.style.removeProperty('--agent-point-angle');
        }
      );
    }

    function sectionSelector(section) {
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
    }

    function defaultResolvePointTarget(args) {
      args = args || {};
      var section =
        typeof Agent.normalizePointSection === 'function'
          ? Agent.normalizePointSection(args.section)
          : args.section || null;
      var field =
        typeof Agent.normalizePointField === 'function'
          ? Agent.normalizePointField(args.field)
          : args.field || null;
      var level =
        typeof Agent.normalizePointLevel === 'function'
          ? Agent.normalizePointLevel(args.level)
          : args.level != null
            ? Number(args.level)
            : null;
      if (field && !section) section = 'priority';

      if (typeof bridge.openSection === 'function' && section) {
        try {
          bridge.openSection(section, { expand: true });
        } catch (e) {
          /* ignore */
        }
      }

      var root = cardEl || document;
      var target = null;

      if (field === 'impact' && level != null) {
        target = root.querySelector(
          '.impact-reach-chip[data-level="' + level + '"]'
        );
      }
      if (!target && field) {
        target =
          root.querySelector('[data-field-id$="-' + field + '"]') ||
          root.querySelector('[data-field-id="' + field + '"]');
      }
      if (!target && section) {
        var sel = sectionSelector(section);
        if (sel) target = root.querySelector(sel);
      }
      if (
        target &&
        field === 'impact' &&
        level == null &&
        target.querySelector
      ) {
        var activeChip = target.querySelector(
          '.impact-reach-chip.is-active, .impact-reach-chip[aria-pressed="true"]'
        );
        if (activeChip) target = activeChip;
      }
      return {
        ok: !!target,
        el: target,
        section: section || null,
        field: field || null,
        level: level != null && isFinite(level) ? level : null,
        error: target ? null : 'Cible introuvable'
      };
    }

    function leanFaceToward(targetEl) {
      var face = faceSmFace() || getLiveAssistantFace();
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

      suppressFaceIdleMachine();
      faceSm.row = row;
      setAssistantFaceEmotion(row, emotion, {
        animate: true,
        forceEnter: true,
        fromIdleMachine: true,
        idleHandOff: false
      });
      face.classList.add('is-pointing');
      face.style.setProperty('--agent-point-angle', angleDeg.toFixed(1) + 'deg');
      return { face: face, row: row, emotion: emotion, dx: dx, dy: dy };
    }

    function placePointGlove(face, targetEl) {
      clearAgentPointGlove();
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
      pointAtState.gloveEl = glove;
      void glove.offsetWidth;
      glove.classList.add('is-visible');
      return glove;
    }

    function blinkPointTarget(targetEl) {
      if (!targetEl) return;
      clearAgentPointTarget();
      targetEl.classList.remove('is-agent-point-target');
      void targetEl.offsetWidth;
      targetEl.classList.add('is-agent-point-target');
      pointAtState.targetEl = targetEl;
    }

    function pointAtOnPage(args) {
      clearAgentPointing();
      var seq = pointAtState.seq;
      args = args && typeof args === 'object' ? args : {};

      if (
        collapse &&
        typeof collapse.setExpanded === 'function' &&
        typeof collapse.isExpanded === 'function' &&
        !collapse.isExpanded()
      ) {
        try {
          collapse.setExpanded(true);
        } catch (e) {
          /* ignore */
        }
      }

      var resolved;
      if (typeof bridge.resolvePointTarget === 'function') {
        try {
          resolved = bridge.resolvePointTarget(args);
        } catch (e) {
          resolved = null;
        }
      }
      if (!resolved || !resolved.el) {
        resolved = defaultResolvePointTarget(args);
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
        onLayoutChange();
      } catch (layoutErr) {
        /* ignore */
      }

      function runPointVisuals() {
        if (seq !== pointAtState.seq) return;
        var lean = leanFaceToward(targetEl);
        blinkPointTarget(targetEl);
        if (lean && lean.face) {
          placePointGlove(lean.face, targetEl);
        } else {
          placePointGlove(getLiveAssistantFace(), targetEl);
        }
        try {
          onLayoutChange();
        } catch (e3) {
          /* ignore */
        }

        pointAtState.faceTimer = setTimeout(function () {
          if (seq !== pointAtState.seq) return;
          var row = lean && lean.row;
          if (row && row.isConnected) {
            handOffToFaceIdleMachine(row, 'curious', {
              startState: 'curious',
              enter: false
            });
          }
        }, POINT_HOLD_MS);

        pointAtState.clearTimer = setTimeout(function () {
          if (seq !== pointAtState.seq) return;
          clearAgentPointGlove();
          clearAgentPointTarget();
          Array.prototype.forEach.call(
            document.querySelectorAll('.agent-face.is-pointing'),
            function (face) {
              face.classList.remove('is-pointing');
              face.style.removeProperty('--agent-point-angle');
            }
          );
        }, POINT_BLINK_MS);
      }

      // Allow collapse/expand layout to settle before measuring.
      setTimeout(runPointVisuals, 90);

      return {
        ok: true,
        section: resolved.section || undefined,
        field: resolved.field || undefined,
        level: resolved.level != null ? resolved.level : undefined
      };
    }

    bridge.pointAt = typeof options.pointAt === 'function'
      ? options.pointAt
      : pointAtOnPage;

    function freezeOlderAssistantFaces(currentRow) {
      Array.prototype.forEach.call(
        messagesEl.querySelectorAll('.agent-msg--assistant .agent-face'),
        function (face) {
          if (currentRow && currentRow.contains(face)) return;
          cancelFaceMorph(face);
          clearFaceMotionClasses(face);
          clearSickRecoverTimer(face);
          clearFaceAsleepVisual(face);
          face.removeAttribute('data-listen');
          face.removeAttribute('title');
          var badge = face.querySelector('.agent-face-status');
          if (badge) badge.remove();
          face.classList.remove('is-sick');
          face._preSickEmotion = null;
          face.classList.add('is-frozen');
        }
      );
    }

    function attachAssistantFace(row, emotion, color) {
      var mood = emotion || 'happy';
      freezeOlderAssistantFaces(row);
      if (FACE_IDLE_ELIGIBLE[mood]) {
        // Seed aura/color, then run a varied arrival script.
        setAssistantFaceEmotion(row, 'happy', {
          animate: false,
          color: color,
          idleHandOff: false,
          fromIdleMachine: true
        });
        handOffToFaceIdleMachine(row, mood, { enter: true });
      } else {
        setAssistantFaceEmotion(row, mood, {
          animate: true,
          forceEnter: true,
          color: color,
          idleHandOff: false
        });
        suppressFaceIdleMachine();
        faceSm.row = row;
      }
      if (
        listeningActive &&
        listenFaceMode &&
        listenFaceMode !== 'offer' &&
        !pending &&
        !interviewActive
      ) {
        setListenBarState(listenFaceMode);
      }
    }

    function muteListening(ms) {
      listenMutedUntil = Date.now() + (ms != null ? ms : LISTEN_MUTE_MS);
      syncListenBaseline();
    }

    function fingerprintFromContext(ctx) {
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
    }

    function fingerprintCard() {
      if (!Agent || typeof Agent.buildContext !== 'function') return '';
      return fingerprintFromContext(Agent.buildContext(bridge) || {});
    }

    function syncListenBaseline() {
      if (!Agent || typeof Agent.buildContext !== 'function') {
        listenFingerprint = '';
        listenBaselineContext = null;
        return;
      }
      try {
        listenBaselineContext = Agent.buildContext(bridge) || {};
        listenFingerprint = fingerprintFromContext(listenBaselineContext);
      } catch (e) {
        listenFingerprint = '';
        listenBaselineContext = null;
      }
    }

    /** Drop stale Coup de pouce candidates against the live card + recent edit. */
    function filterListenSuggestionsLive(list, previousContext) {
      var items = Array.isArray(list) ? list.slice() : [];
      if (!items.length || !Agent) return [];
      var live = null;
      try {
        live = Agent.buildContext(bridge);
      } catch (e) {
        return items;
      }
      if (typeof Agent.filterNoOpImprovementSuggestions === 'function') {
        items = Agent.filterNoOpImprovementSuggestions(items, live);
      }
      if (
        previousContext &&
        typeof Agent.filterImprovementsAgainstRecentChanges === 'function'
      ) {
        items = Agent.filterImprovementsAgainstRecentChanges(
          items,
          previousContext,
          live
        );
      }
      return items;
    }

    function clearListenStatusFromFaces() {
      Array.prototype.forEach.call(
        messagesEl.querySelectorAll('.agent-face[data-listen]'),
        function (face) {
          face.removeAttribute('data-listen');
          face.removeAttribute('title');
          var badge = face.querySelector('.agent-face-status');
          if (badge) badge.remove();
        }
      );
    }

    function getLiveAssistantFace() {
      var faces = messagesEl.querySelectorAll(
        '.agent-msg--assistant .agent-face:not(.is-frozen):not(.is-sick)'
      );
      if (!faces.length) return null;
      return faces[faces.length - 1];
    }

    function ensureFaceStatusBadge(face) {
      if (!face) return null;
      var badge = face.querySelector('.agent-face-status');
      if (!badge) {
        badge = el('span', 'agent-face-status');
        badge.setAttribute('aria-hidden', 'true');
        face.appendChild(badge);
      }
      return badge;
    }

    function setListenBarState(mode) {
      var configured = Agent.isConfigured(provider);
      // Offer / pending reply: no listening badge (the live face is busy).
      var show =
        configured &&
        listeningActive &&
        !interviewActive &&
        !pending &&
        mode !== 'offer';
      var label =
        mode === 'analyzing'
          ? 'Analyse des changements'
          : mode === 'offer'
            ? 'Suggestion en attente'
            : 'À l\u2019écoute des changements';
      listenFaceMode = mode;
      clearListenStatusFromFaces();
      if (show) {
        if (mode === 'analyzing') {
          wakeFaceFromSleep({ resume: true, reschedule: false });
        }
        var face = getLiveAssistantFace();
        if (face && !face.classList.contains('is-asleep')) {
          var listenKind = mode === 'analyzing' ? 'analyzing' : 'listening';
          face.setAttribute('data-listen', listenKind);
          face.title = label;
          ensureFaceStatusBadge(face);
        }
      }
      syncApplySummary();
      notifyLayout();
    }

    function phraseOfferLabel(label) {
      var L = String(label || '').trim();
      if (!L) return 'faire un petit ajustement';
      return L.charAt(0).toLowerCase() + L.slice(1);
    }

    /** Turn an infinitive suggestion label into a friendly yes/no offer. */
    function phraseOfferQuestion(label) {
      var L = phraseOfferLabel(label);
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
    }

    function clearActiveOffer(row) {
      if (row && row.parentNode) {
        row.classList.add('is-resolved');
        row.remove();
      }
      activeOffer = null;
      setListenBarState('idle');
      syncApplySummary();
    }

    function appendOfferMessage(item) {
      emptyState.classList.add('is-hidden');
      clearApplySuggestions();
      var row = el('div', 'agent-msg agent-msg--assistant agent-msg--offer');
      var bubble = el('div', 'agent-msg-bubble agent-msg-bubble--offer');
      bubble.appendChild(
        el('div', 'agent-offer-eyebrow', { text: 'Coup de pouce' })
      );
      bubble.appendChild(
        el('div', 'agent-offer-text', {
          text: phraseOfferQuestion(item.label)
        })
      );
      var actions = el('div', 'agent-offer-actions');
      var yesBtn = el('button', 'agent-offer-btn agent-offer-btn--yes', {
        type: 'button',
        text: 'Oui'
      });
      var noBtn = el('button', 'agent-offer-btn agent-offer-btn--no', {
        type: 'button',
        text: 'Non'
      });
      actions.appendChild(yesBtn);
      actions.appendChild(noBtn);
      bubble.appendChild(actions);
      row.appendChild(bubble);
      var offerEmotion = spiceEmotion('curious');
      attachAssistantFace(row, offerEmotion);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      activeOffer = { item: item, row: row };
      setListenBarState('offer');

      yesBtn.addEventListener('click', function () {
        if (pending || !activeOffer || activeOffer.row !== row) return;
        onOfferAccept(item, row);
      });
      noBtn.addEventListener('click', function () {
        if (!activeOffer || activeOffer.row !== row) return;
        onOfferDecline(item, row);
      });

      announceAssistantArrival({
        sound: true,
        soundKind: 'suggestion',
        emotion: offerEmotion
      });
      notifyLayout();
      return row;
    }

    async function onOfferAccept(item, row) {
      clearActiveOffer(row);
      muteListening();
      var result = await Agent.executeActions(bridge, item.actions || []);
      appendMessage('assistant', result.summary || 'Okay, c\'est fait.', {
        note: item.label
      });
      appendChangeRecap(result, { ok: result.ok });
      history.push({
        role: 'assistant',
        content: result.summary || result.recap || 'Okay, c\'est fait.'
      });
      schedulePersistChatHistory();
      muteListening();
      notifyLayout();
    }

    function onOfferDecline(item, row) {
      dismissedOffers[String(item.label || '').trim()] = Date.now();
      clearActiveOffer(row);

      var softReplies = [
        'Pas de souci\u00a0!',
        'Ok, no worries.',
        'Tranquille, on laisse \u00e7a.',
        'Ok, on passe.'
      ];
      var soft = softReplies[Math.floor(Math.random() * softReplies.length)];
      lastListenSuggestions = filterListenSuggestionsLive(
        lastListenSuggestions,
        listenScanPreviousContext
      );
      var next = pickListenSuggestion(lastListenSuggestions);

      if (next) {
        appendMessage('assistant', soft + ' Autre id\u00e9e?', {
          emotion: spiceEmotion('happy'),
          noUnread: true,
          noSound: true
        });
        history.push({
          role: 'assistant',
          content: soft + ' Autre id\u00e9e?'
        });
        schedulePersistChatHistory();
        appendOfferMessage(next);
      } else {
        appendMessage(
          'assistant',
          soft + ' Dis-moi si tu veux autre chose.',
          { emotion: spiceEmotion('happy') }
        );
        history.push({
          role: 'assistant',
          content: soft + ' Dis-moi si tu veux autre chose.'
        });
        schedulePersistChatHistory();
        renderSuggestions(
          [
            'Quelle est la priorit\u00e9?',
            'D\u00e9finir une \u00e9ch\u00e9ance',
            'Ajouter une sous-t\u00e2che'
          ],
          { animate: true, answering: false }
        );
        refreshApplySuggestions({ animate: true });
      }

      muteListening(800);
      notifyLayout();
    }

    function pickListenSuggestion(list) {
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
        var dismissedAt = dismissedOffers[key];
        if (dismissedAt && now - dismissedAt < 10 * 60 * 1000) return false;
        return true;
      });
      return candidates[0] || null;
    }

    async function runListenScan() {
      if (!Agent.isConfigured(provider) || pending || interviewActive) return;
      if (activeOffer) return;
      if (typeof Agent.suggestCardImprovements !== 'function') return;
      var seq = ++listenScanSeq;
      var previousContext = listenScanPreviousContext;
      listeningAnalyzing = true;
      setListenBarState('analyzing');
      try {
        var list = await Agent.suggestCardImprovements(provider, bridge, {
          previousContext: previousContext,
          onDebug: function (entry) {
            pushDebugEntry(entry);
          }
        });
        if (seq !== listenScanSeq) return;
        lastListenSuggestions = filterListenSuggestionsLive(
          Array.isArray(list) ? list : [],
          previousContext
        );
        var pick = pickListenSuggestion(lastListenSuggestions);
        if (pick) {
          appendOfferMessage(pick);
        } else {
          setListenBarState('idle');
        }
      } catch (err) {
        if (seq !== listenScanSeq) return;
        console.error('AgentUI listen scan failed', err);
        if (err && err.debug) pushDebugEntry(err.debug);
        setListenBarState('idle');
      } finally {
        if (seq === listenScanSeq) {
          listeningAnalyzing = false;
          listenCooldownUntil = Date.now() + LISTEN_COOLDOWN_MS;
          syncListenBaseline();
          syncApplySummary();
        }
      }
    }

    function scheduleListenScan() {
      if (listenDebounceTimer) {
        clearTimeout(listenDebounceTimer);
        listenDebounceTimer = null;
      }
      listenDebounceTimer = setTimeout(function () {
        listenDebounceTimer = null;
        runListenScan();
      }, LISTEN_DEBOUNCE_MS);
    }

    function tickListen() {
      if (!listeningActive || !settleReady) return;
      if (!Agent.isConfigured(provider) || pending || interviewActive) {
        setListenBarState(activeOffer ? 'offer' : 'idle');
        return;
      }
      if (activeOffer || listeningAnalyzing) return;
      if (Date.now() < listenMutedUntil) return;
      if (Date.now() < listenCooldownUntil) return;
      var nextCtx;
      var nextFp;
      try {
        nextCtx = Agent.buildContext(bridge) || {};
        nextFp = fingerprintFromContext(nextCtx);
      } catch (e) {
        return;
      }
      if (!listenFingerprint) {
        listenBaselineContext = nextCtx;
        listenFingerprint = nextFp;
        setListenBarState('idle');
        return;
      }
      if (nextFp === listenFingerprint) {
        setListenBarState('idle');
        return;
      }
      // Snapshot what the card looked like before this edit.
      listenScanPreviousContext = listenBaselineContext;
      listenBaselineContext = nextCtx;
      listenFingerprint = nextFp;
      scheduleListenScan();
    }

    function startListening() {
      if (isProjectScope) return;
      if (listeningActive) {
        setListenBarState(activeOffer ? 'offer' : listeningAnalyzing ? 'analyzing' : 'idle');
        return;
      }
      if (!Agent.isConfigured(provider)) return;
      listeningActive = true;
      syncListenBaseline();
      setListenBarState('idle');
      if (listenTimer) clearInterval(listenTimer);
      listenTimer = setInterval(tickListen, LISTEN_POLL_MS);
    }

    function stopListening() {
      listeningActive = false;
      listenFaceMode = null;
      if (listenTimer) {
        clearInterval(listenTimer);
        listenTimer = null;
      }
      if (listenDebounceTimer) {
        clearTimeout(listenDebounceTimer);
        listenDebounceTimer = null;
      }
      clearListenStatusFromFaces();
      syncApplySummary();
    }

    function markSettleReady() {
      if (settleReady) return;
      settleReady = true;
      syncListenBaseline();
      if (Agent.isConfigured(provider) && !interviewActive) {
        startListening();
      }
    }

    function appendMessage(role, text, meta) {
      noteFaceChatActivity({ resume: role !== 'assistant' });
      emptyState.classList.add('is-hidden');
      var row = el('div', 'agent-msg agent-msg--' + role);
      if (meta && meta.recap) {
        row.classList.add('agent-msg--recap');
      }
      if (meta && meta.error) {
        row.classList.add('agent-msg--error');
      }
      var bubble = el(
        'div',
        'agent-msg-bubble' +
          (meta && meta.recap ? ' agent-msg-bubble--recap' : '') +
          (meta && meta.error ? ' agent-msg-bubble--error' : '')
      );
      if (role === 'assistant' && !(meta && meta.error)) {
        // Seed aura before highlights so [[a:]] uses identity / turn color on first paint.
        row.setAttribute(
          'data-aura',
          auraForEmotion(
            (meta && meta.emotion) || 'neutral',
            meta && (meta.color != null ? meta.color : meta.aura)
          )
        );
        fillHighlightedBubble(bubble, text);
      } else {
        bubble.textContent = text;
      }
      row.appendChild(bubble);
      if (meta && meta.note) {
        row.appendChild(el('div', 'agent-msg-note', { text: meta.note }));
      }
      var emotion = null;
      if (role === 'user') {
        attachUserResumeControl(row);
        attachMessageCopyControl(row);
      } else if (role === 'assistant') {
        emotion =
          (meta && meta.emotion) ||
          inferAssistantEmotion(text, meta, {
            userText: lastUserMessageText()
          });
        attachAssistantFace(
          row,
          emotion,
          meta && (meta.color != null ? meta.color : meta.aura)
        );
        if (
          !(meta && (meta.error || meta.recap || meta.noFeedback || meta.offer))
        ) {
          attachFeedbackControls(row);
        }
        if (!(meta && meta.offer)) {
          attachMessageCopyControl(row);
        }
      }
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (role === 'assistant' && !(meta && meta.silent)) {
        announceAssistantArrival({
          sound: !(meta && meta.noSound),
          unread: !(meta && meta.noUnread),
          emotion: emotion || (meta && meta.error ? 'sad' : 'happy')
        });
      }
      notifyLayout();
      return row;
    }

    function appendPendingMessage() {
      noteFaceChatActivity({ resume: false, reschedule: false });
      emptyState.classList.add('is-hidden');
      var row = el('div', 'agent-msg agent-msg--assistant is-pending is-streaming');
      row.setAttribute('aria-busy', 'true');
      row.setAttribute('aria-label', 'R\u00e9ponse en cours');
      // Seed identity aura so [[a:…]] accents paint correctly during stream.
      row.setAttribute('data-aura', identityAura());
      // Face + thinking clouds while waiting; bubble swaps to text when streaming starts.
      var bubble = el('div', 'agent-msg-bubble agent-msg-bubble--pending');
      var clouds = el('div', 'agent-think-clouds');
      clouds.setAttribute('aria-hidden', 'true');
      clouds.appendChild(el('span', 'agent-think-puff agent-think-puff--1'));
      clouds.appendChild(el('span', 'agent-think-puff agent-think-puff--2'));
      var cloud = el('span', 'agent-think-cloud');
      cloud.appendChild(el('span', 'agent-think-dot'));
      cloud.appendChild(el('span', 'agent-think-dot'));
      cloud.appendChild(el('span', 'agent-think-dot'));
      clouds.appendChild(cloud);
      bubble.appendChild(clouds);
      row.appendChild(bubble);
      messagesEl.appendChild(row);
      startThinkingMotions(row);
      freezeOlderAssistantFaces(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      notifyLayout();
      return row;
    }

    function finalizeAssistantRow(row, text, meta) {
      meta = meta || {};
      stopThinkingMotions();
      var emotion = inferAssistantEmotion(text, meta, {
        userText: lastUserMessageText()
      });
      var color = meta.color != null ? meta.color : meta.aura;
      freezeOlderAssistantFaces(row);
      if (FACE_IDLE_ELIGIBLE[emotion]) {
        setAssistantFaceEmotion(row, 'happy', {
          animate: false,
          color: color,
          idleHandOff: false,
          fromIdleMachine: true
        });
        handOffToFaceIdleMachine(row, emotion, { enter: true });
      } else {
        setAssistantFaceEmotion(row, emotion, {
          animate: true,
          forceEnter: true,
          color: color,
          idleHandOff: false
        });
        suppressFaceIdleMachine();
        faceSm.row = row;
      }
      if (
        listeningActive &&
        listenFaceMode &&
        listenFaceMode !== 'offer' &&
        !pending &&
        !interviewActive
      ) {
        setListenBarState(listenFaceMode);
      }
      scheduleFaceSleep();
      return emotion;
    }

    function revealPendingBubble(bubble, text) {
      if (!bubble) return;
      bubble.classList.remove('agent-msg-bubble--pending');
      fillHighlightedBubble(bubble, text || '');
    }

    function appendChatError(text) {
      return appendMessage('assistant', text || 'Erreur de l\'assistant', {
        note: 'Erreur',
        error: true
      });
    }

    function closeToolVerifyTips(exceptWrap) {
      Array.prototype.forEach.call(
        messagesEl.querySelectorAll('.agent-tool-verify.is-open'),
        function (wrap) {
          if (exceptWrap && wrap === exceptWrap) return;
          wrap.classList.remove('is-open');
          var btn = wrap.querySelector('.agent-tool-verify-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      );
    }

    function positionToolVerifyTip(wrap) {
      var btn = wrap.querySelector('.agent-tool-verify-btn');
      var tip = wrap.querySelector('.agent-tool-verify-tip');
      if (!btn || !tip) return;
      var anchor = btn.getBoundingClientRect();
      var gap = 6;
      var margin = 8;
      var tipW = tip.offsetWidth || 200;
      var tipH = tip.offsetHeight || 40;
      var top = anchor.bottom + gap;
      var left = anchor.left;
      if (top + tipH > window.innerHeight - margin && anchor.top - gap - tipH >= margin) {
        top = anchor.top - gap - tipH;
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    function appendChangeRecap(applied, options) {
      options = options || {};
      var recap = Agent.formatChangeRecap
        ? Agent.formatChangeRecap(applied || { results: [] }, options)
        : (applied && applied.recap) || '';
      if (!recap) return null;
      var hasFailures =
        options.ok === false ||
        !!(options.droppedActions && options.droppedActions.length) ||
        !!(
          applied &&
          Array.isArray(applied.results) &&
          applied.results.some(function (r) {
            return r && r.ok === false;
          })
        );
      var note = options.emptyClaim
        ? 'V\u00e9rification'
        : hasFailures
          ? 'Erreur'
          : 'Modifications techniques';
      var tipId =
        'agent-tool-verify-tip-' + Math.random().toString(36).slice(2, 9);

      var wrap = el(
        'div',
        'agent-tool-verify' + (hasFailures ? ' is-error' : '')
      );
      var btn = el('button', 'agent-tool-verify-btn', {
        type: 'button',
        'aria-label': note,
        title: note,
        'aria-expanded': 'false',
        'aria-controls': tipId
      });
      btn.textContent = 'i';
      var tip = el('div', 'agent-tool-verify-tip', {
        id: tipId,
        role: 'tooltip'
      });
      tip.textContent = recap;

      function openTip() {
        closeToolVerifyTips(wrap);
        positionToolVerifyTip(wrap);
        wrap.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
      function closeTip() {
        wrap.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (wrap.classList.contains('is-open')) closeTip();
        else openTip();
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeTip();
          btn.blur();
        }
      });

      wrap.appendChild(btn);
      wrap.appendChild(tip);

      var host = null;
      var kids = messagesEl.children;
      for (var i = kids.length - 1; i >= 0; i--) {
        if (kids[i].classList && kids[i].classList.contains('agent-msg--assistant')) {
          host = kids[i];
          break;
        }
      }
      if (host) {
        var hostBubble = host.querySelector('.agent-msg-bubble');
        if (hostBubble) {
          host.insertBefore(wrap, hostBubble.nextSibling);
        } else {
          host.appendChild(wrap);
        }
        if (options.emptyClaim) setAssistantFaceEmotion(host, 'surprised');
        else if (hasFailures) setAssistantFaceEmotion(host, 'sad');
        else setAssistantFaceEmotion(host, 'happy');
      } else {
        var row = el('div', 'agent-msg agent-msg--assistant agent-msg--recap');
        row.appendChild(wrap);
        attachAssistantFace(
          row,
          options.emptyClaim ? 'surprised' : hasFailures ? 'sad' : 'happy'
        );
        messagesEl.appendChild(row);
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
      notifyLayout();
      return wrap;
    }

    function clearFollowUps() {
      followUpsEl.replaceChildren();
      followUpsEl.hidden = true;
      notifyLayout();
    }

    function clearPrompts() {
      promptsEl.replaceChildren();
      promptsEl.hidden = true;
      notifyLayout();
    }

    function axisWordLabel(key, value) {
      if (
        typeof PriorityUI !== 'undefined' &&
        typeof PriorityUI.wordFor === 'function'
      ) {
        try {
          return PriorityUI.wordFor(key, value) || String(value);
        } catch (e) {
          return String(value);
        }
      }
      return String(value);
    }

    function renderPriorityAxesPrompt(prompt) {
      var card = el('div', 'agent-prompt agent-prompt--priority-axes');
      var title = el('div', 'agent-prompt-title', {
        text: prompt.title || 'Affiner urgence, impact et facilit\u00e9'
      });
      card.appendChild(title);

      var dims =
        (global.PriorityTrello && global.PriorityTrello.PRIORITY_DIMENSIONS) ||
        [
          { key: 'urgency', label: 'Urgence', min: 0, max: 4 },
          { key: 'impact', label: 'Impact', min: 0, max: 4 },
          { key: 'ease', label: 'Facilit\u00e9', min: 1, max: 5 }
        ];

      var values = {
        urgency: prompt.urgency,
        impact: prompt.impact,
        ease: prompt.ease
      };
      var valueEls = {};

      dims.forEach(function (dim) {
        var key = dim.key;
        var row = el('div', 'agent-prompt-slider-row');
        var head = el('div', 'agent-prompt-slider-head');
        head.appendChild(
          el('span', 'agent-prompt-slider-label', { text: dim.label })
        );
        var valEl = el('span', 'agent-prompt-slider-value', {
          text: axisWordLabel(key, values[key])
        });
        head.appendChild(valEl);
        valueEls[key] = valEl;

        var sliderWrap = el('div', 'field-slider agent-prompt-slider');
        var input = el('input', 'field-range', {
          type: 'range',
          min: String(dim.min),
          max: String(dim.max),
          step: '1',
          value: String(values[key]),
          'aria-label': dim.label
        });
        input.addEventListener('input', function () {
          values[key] = Number(input.value);
          valEl.textContent = axisWordLabel(key, values[key]);
        });
        sliderWrap.appendChild(input);
        row.appendChild(head);
        row.appendChild(sliderWrap);
        card.appendChild(row);
      });

      var actionsRow = el('div', 'agent-prompt-actions');
      var applyBtn = el('button', 'tp-button agent-prompt-apply', {
        type: 'button',
        text: prompt.submitLabel || 'Appliquer'
      });
      var skipBtn = el('button', 'agent-prompt-skip', {
        type: 'button',
        text: 'C\'est bon'
      });
      applyBtn.addEventListener('click', function () {
        if (pending) return;
        onPromptApplyPriorityAxes(values);
      });
      skipBtn.addEventListener('click', function () {
        clearPrompts();
      });
      actionsRow.appendChild(applyBtn);
      actionsRow.appendChild(skipBtn);
      card.appendChild(actionsRow);
      return card;
    }

    function renderPrompts(prompts) {
      clearPrompts();
      if (!prompts || !prompts.length) return;
      var rendered = 0;
      prompts.forEach(function (p) {
        if (!p || p.type !== 'priority_axes') return;
        promptsEl.appendChild(renderPriorityAxesPrompt(p));
        rendered += 1;
      });
      if (!rendered) return;
      promptsEl.hidden = false;
      notifyLayout();
    }

    async function onPromptApplyPriorityAxes(values) {
      if (pending) return;
      pending = true;
      updateComposerEnabled();
      try {
        muteListening();
        var result = await Agent.executeActions(bridge, [
          {
            tool: 'set_priority',
            args: {
              urgency: values.urgency,
              impact: values.impact,
              ease: values.ease,
              priorityEnabled: true
            }
          }
        ]);
        clearPrompts();
        appendMessage('assistant', 'Okay, c\'est mis \u00e0 jour.', {
          note: 'Affinage priorit\u00e9'
        });
        appendChangeRecap(result, { ok: result.ok });
        history.push({
          role: 'assistant',
          content: 'Okay, c\'est mis \u00e0 jour.'
        });
        schedulePersistChatHistory();
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        muteListening();
        refreshSuggestions({ animate: true });
        refreshApplySuggestions({ animate: true });
      } catch (err) {
        appendChatError((err && err.message) || 'Erreur lors de l\'affinage');
      } finally {
        releasePendingAndDrain();
      }
    }

    function renderFollowUps(followUps) {
      clearFollowUps();
      if (!followUps || !followUps.length) return;
      // Action chips only — question-style follow-ups live in suggestions.
      var actionsOnly = followUps.filter(function (fu) {
        return fu && fu.actions && fu.actions.length;
      });
      if (!actionsOnly.length) return;
      followUpsEl.hidden = false;
      actionsOnly.forEach(function (fu) {
        var chip = el('button', 'agent-followup-chip agent-followup-chip--action', {
          type: 'button'
        });
        chip.textContent = fu.label;
        chip.addEventListener('click', function () {
          onFollowUp(fu);
        });
        followUpsEl.appendChild(chip);
      });
      notifyLayout();
    }

    function clearSendConfirmCountdown() {
      sendConfirmCount.textContent = '';
      sendConfirmCount.hidden = true;
      sendBtn.classList.remove('is-confirming');
      sendBtn.setAttribute('aria-label', 'Envoyer');
    }

    function stopSuggestionConfirmTimer() {
      if (suggestionConfirmTimer) {
        clearInterval(suggestionConfirmTimer);
        suggestionConfirmTimer = null;
      }
      suggestionConfirmDeadline = 0;
    }

    function clearSuggestions() {
      stopSuggestionConfirmTimer();
      clearSendConfirmCountdown();
      suggestionsMultiSelect = false;
      composerSuggestions = [];
      suggestionsEl.replaceChildren();
      suggestionsEl.hidden = true;
      suggestionsEl.classList.remove('is-multi');
      if (tabComplete) tabComplete.refresh();
      notifyLayout();
    }

    /**
     * Pull suggestion chips from an assistant history entry (stored list or rawJson).
     * Used when editing a prior user message so chips from that turn come back.
     */
    function suggestionsPayloadFromHistoryEntry(entry) {
      if (!entry || entry.role !== 'assistant') return null;
      if (Array.isArray(entry.suggestions) && entry.suggestions.length) {
        return {
          suggestions: entry.suggestions,
          suggestionsMulti: !!entry.suggestionsMulti
        };
      }
      var parsed = entry.rawJson;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          return null;
        }
      }
      if (!parsed || typeof parsed !== 'object') return null;
      var list = parsed.suggestions;
      if (!Array.isArray(list) || !list.length) return null;
      if (typeof Agent.normalizeSuggestionEntries === 'function') {
        list = Agent.normalizeSuggestionEntries(list, 4, {
          scale: !!parsed.suggestionScale,
          message: entry.content || parsed.message || ''
        });
      }
      if (!list.length) return null;
      return {
        suggestions: list,
        suggestionsMulti: !!parsed.suggestionsMulti
      };
    }

    function restoreSuggestionsFromHistoryEntry(entry) {
      var payload = suggestionsPayloadFromHistoryEntry(entry);
      if (!payload) return false;
      suggestionsSeq += 1;
      renderSuggestions(payload.suggestions, {
        animate: true,
        multi: payload.suggestionsMulti,
        answering: true
      });
      return true;
    }

    /** Assistant turn immediately before history index (or last assistant if idx omitted). */
    function assistantEntryBeforeIndex(idx) {
      var end =
        typeof idx === 'number' && idx >= 0 ? idx - 1 : history.length - 1;
      for (var i = end; i >= 0; i--) {
        if (history[i] && history[i].role === 'assistant') return history[i];
      }
      return null;
    }

    /** Last assistant turn text that looks like a clarifying question. */
    function lastAssistantAsksQuestion() {
      for (var i = history.length - 1; i >= 0; i--) {
        var turn = history[i];
        if (turn && turn.role === 'assistant') {
          return /\?/.test(String(turn.content || ''));
        }
      }
      return false;
    }

    /**
     * Answer chips stay above the input; next-intent / starter chips go below.
     * options.answering forces the mode when known (e.g. suggestQuestions → false).
     */
    function shouldPlaceSuggestionsAbove(options) {
      options = options || {};
      if (options.answering === true) return true;
      if (options.answering === false) return false;
      if (interviewActive) return true;
      if (options.multi === true) return true;
      return lastAssistantAsksQuestion();
    }

    function syncSuggestionsPlacement(placeAbove) {
      suggestionsEl.classList.toggle('is-below-composer', !placeAbove);
      if (placeAbove) {
        if (composer.previousSibling !== suggestionsEl) {
          chatPanel.insertBefore(suggestionsEl, composer);
        }
      } else if (composer.nextSibling !== suggestionsEl) {
        chatPanel.insertBefore(suggestionsEl, composer.nextSibling);
      }
    }

    function clearApplySuggestions() {
      applySuggestions = [];
      applySuggestionsLoading = false;
      applyListEl.replaceChildren();
      applySection.hidden = true;
      applyStatusEl.hidden = true;
      applyStatusEl.textContent = '';
      syncApplySummary();
      notifyLayout();
    }

    function setApplyStatus(msg, show) {
      if (!msg) {
        applyStatusEl.hidden = true;
        applyStatusEl.textContent = '';
        return;
      }
      applyStatusEl.hidden = !show;
      applyStatusEl.textContent = msg;
    }

    function renderApplySuggestions(list, options) {
      options = options || {};
      applySuggestions = (list || [])
        .filter(function (item) {
          return (
            item &&
            typeof item.label === 'string' &&
            item.label.trim() &&
            Array.isArray(item.actions) &&
            item.actions.length
          );
        })
        .slice(0, 3);
      applyListEl.replaceChildren();
      if (!applySuggestions.length || !Agent.isConfigured(provider)) {
        applySection.hidden = true;
        setApplyStatus('', false);
        syncApplySummary();
        notifyLayout();
        return;
      }
      applySection.hidden = false;
      setApplyStatus('', false);
      applySuggestions.forEach(function (item, index) {
        var chip = el('button', 'agent-apply-suggestion-chip', {
          type: 'button',
          role: 'listitem'
        });
        chip.textContent = item.label;
        chip.disabled = pending;
        if (options.animate !== false) {
          chip.style.animationDelay = index * 40 + 'ms';
        }
        chip.addEventListener('click', function () {
          onApplySuggestion(item, index);
        });
        applyListEl.appendChild(chip);
      });
      syncApplySummary();
      notifyLayout();
    }

    function setApplySuggestionsBusy(isBusy) {
      applyRefreshBtn.disabled = !!isBusy || pending;
      Array.prototype.forEach.call(
        applyListEl.querySelectorAll('.agent-apply-suggestion-chip'),
        function (chip) {
          chip.disabled = !!isBusy || pending;
        }
      );
    }

    async function refreshApplySuggestions(options) {
      options = options || {};
      if (isProjectScope) {
        clearApplySuggestions();
        applySection.hidden = true;
        return;
      }
      if (!Agent.isConfigured(provider) || pending) return;
      if (typeof Agent.suggestCardImprovements !== 'function') return;
      var seq = ++applySuggestionsSeq;
      applySuggestionsLoading = true;
      setApplySuggestionsBusy(true);
      applySection.hidden = false;
      setApplyStatus('Analyse de la carte\u2026', true);
      applyListEl.replaceChildren();
      syncApplySummary();
      notifyLayout();
      try {
        var list = await Agent.suggestCardImprovements(provider, bridge, {
          onDebug: function (entry) {
            pushDebugEntry(entry);
          }
        });
        if (seq !== applySuggestionsSeq) return;
        applySuggestionsLoading = false;
        renderApplySuggestions(list, { animate: options.animate !== false });
        if (!list || !list.length) {
          applySection.hidden = true;
          setApplyStatus('', false);
          syncApplySummary();
        }
      } catch (err) {
        if (seq !== applySuggestionsSeq) return;
        console.error('AgentUI suggestCardImprovements failed', err);
        if (err && err.debug) pushDebugEntry(err.debug);
        applySuggestionsLoading = false;
        applySuggestions = [];
        applyListEl.replaceChildren();
        applySection.hidden = true;
        setApplyStatus('', false);
        syncApplySummary();
      } finally {
        if (seq === applySuggestionsSeq) {
          applySuggestionsLoading = false;
          setApplySuggestionsBusy(false);
          syncApplySummary();
        }
        notifyLayout();
      }
    }

    async function onApplySuggestion(item, index) {
      if (pending || !item || !item.actions || !item.actions.length) return;
      muteListening();
      var result = await Agent.executeActions(bridge, item.actions);
      appendMessage('assistant', result.summary || 'Okay, c\'est appliqu\u00e9.', {
        note: item.label
      });
      appendChangeRecap(result, { ok: result.ok });
      history.push({
        role: 'assistant',
        content: result.summary || result.recap || 'Okay, c\'est appliqu\u00e9.'
      });
      schedulePersistChatHistory();
      applySuggestions = applySuggestions.filter(function (_s, i) {
        return i !== index;
      });
      renderApplySuggestions(applySuggestions, { animate: false });
      if (!applySuggestions.length) {
        // Re-scan for follow-up improvements after applying.
        refreshApplySuggestions({ animate: true });
      }
      muteListening();
      notifyLayout();
    }

    function markSuggestionTabTarget(text) {
      if (!suggestionsEl) return;
      var target = String(text || '').trim();
      Array.prototype.forEach.call(
        suggestionsEl.querySelectorAll('.agent-suggestion-chip'),
        function (chip) {
          var label = String(chip.getAttribute('data-suggestion') || chip.textContent || '').trim();
          var isTarget = !!(target && label === target);
          chip.classList.toggle('is-tab-target', isTarget);
          var hint = chip.querySelector('.tp-tab-hint');
          if (isTarget && !hint) {
            chip.appendChild(el('kbd', 'tp-tab-hint', { text: 'Tab' }));
          } else if (!isTarget && hint) {
            hint.remove();
          }
        }
      );
    }

    /** Holes needing user fill-in: …, ..., or [label] */
    var SUGGESTION_HOLE_RE = /(\u2026|\.{3,}|\[([^\]]*)\])/;

    function suggestionNeedsVariableInput(text) {
      return SUGGESTION_HOLE_RE.test(String(text || ''));
    }

    function focusComposerInput() {
      if (!input || input.disabled) return;
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        try {
          input.focus();
        } catch (e2) {
          /* ignore */
        }
      }
    }

    function openAndFocusComposer() {
      if (collapse) {
        if (!collapse.isEnabled()) {
          collapse.setEnabled(true, { expand: true });
        } else if (!collapse.isExpanded()) {
          collapse.setExpanded(true);
        }
      }
      setTimeout(function () {
        try {
          section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (e) {
          /* ignore */
        }
        focusComposerInput();
        notifyLayout();
      }, 0);
    }

    function insertComposerSuggestion(text) {
      input.value = String(text || '');
      focusComposerInput();
      // Place caret at the first hole so the user can fill the variable.
      var raw = input.value;
      var holeMatch = SUGGESTION_HOLE_RE.exec(raw);
      try {
        if (holeMatch) {
          input.setSelectionRange(holeMatch.index, holeMatch.index + holeMatch[0].length);
        } else {
          var len = raw.length;
          input.setSelectionRange(len, len);
        }
      } catch (e2) {
        /* ignore */
      }
      if (tabComplete) tabComplete.refresh();
      notifyLayout();
    }

    function suggestionsAllowMultiSelect(explicit) {
      // AI decides via suggestionsMulti; default is single-choice.
      return explicit === true;
    }

    function pickSuggestionConfirmPrompt() {
      return SUGGESTION_CONFIRM_PROMPTS[
        Math.floor(Math.random() * SUGGESTION_CONFIRM_PROMPTS.length)
      ];
    }

    function getSelectedSuggestionTexts() {
      var selected = [];
      Array.prototype.forEach.call(
        suggestionsEl.querySelectorAll('.agent-suggestion-chip.is-selected'),
        function (chip) {
          var label = String(
            chip.getAttribute('data-suggestion') || chip.textContent || ''
          ).trim();
          if (label) selected.push(label);
        }
      );
      return selected;
    }

    function formatSelectedSuggestions(labels) {
      return (labels || [])
        .map(function (label) {
          return String(label || '').trim();
        })
        .filter(Boolean)
        .join('. ');
    }

    function syncSuggestionConfirmUi() {
      var confirmEl = suggestionsEl.querySelector('.agent-suggestion-confirm');
      var selected = getSelectedSuggestionTexts();
      var composerHasText = !!(input.value || '').trim();
      if (!selected.length || composerHasText) {
        if (confirmEl) confirmEl.hidden = true;
        stopSuggestionConfirmTimer();
        clearSendConfirmCountdown();
        notifyLayout();
        return;
      }
      if (confirmEl) {
        confirmEl.hidden = false;
        var promptText =
          (confirmEl.querySelector('.agent-suggestion-confirm-prompt') || {})
            .textContent || 'C\'est tout?';
        confirmEl.setAttribute('aria-label', promptText);
      }
      if (suggestionConfirmDeadline) {
        var leftMs = Math.max(0, suggestionConfirmDeadline - Date.now());
        var leftSec = Math.max(1, Math.ceil(leftMs / 1000));
        sendConfirmCount.textContent = String(leftSec);
        sendConfirmCount.hidden = false;
        sendBtn.classList.add('is-confirming');
        sendBtn.setAttribute(
          'aria-label',
          'Envoyer' + ' (' + leftSec + ' s)'
        );
      } else {
        clearSendConfirmCountdown();
      }
      notifyLayout();
    }

    function cancelSuggestionConfirmOnComposerInput() {
      stopSuggestionConfirmTimer();
      syncSuggestionConfirmUi();
    }

    function startSuggestionConfirmTimer() {
      stopSuggestionConfirmTimer();
      suggestionConfirmDeadline = Date.now() + SUGGESTION_CONFIRM_MS;
      syncSuggestionConfirmUi();
      suggestionConfirmTimer = setInterval(function () {
        if (pending) {
          stopSuggestionConfirmTimer();
          return;
        }
        if (!getSelectedSuggestionTexts().length) {
          stopSuggestionConfirmTimer();
          syncSuggestionConfirmUi();
          return;
        }
        if (Date.now() >= suggestionConfirmDeadline) {
          stopSuggestionConfirmTimer();
          commitSelectedSuggestions();
          return;
        }
        syncSuggestionConfirmUi();
      }, 200);
    }

    function commitSelectedSuggestions() {
      if (pending) return;
      var labels = getSelectedSuggestionTexts();
      if (!labels.length) return;
      var msg = formatSelectedSuggestions(labels);
      stopSuggestionConfirmTimer();
      clearSendConfirmCountdown();
      clearSuggestions();
      sendUserMessage(msg);
    }

    function toggleSuggestionChip(chip, text) {
      if (pending || !chip) return;
      var label = String(text || '').trim();
      if (!label) return;
      var wasSelected = chip.classList.contains('is-selected');
      chip.classList.toggle('is-selected', !wasSelected);
      chip.setAttribute('aria-pressed', wasSelected ? 'false' : 'true');
      var selected = getSelectedSuggestionTexts();
      if (!selected.length) {
        stopSuggestionConfirmTimer();
        syncSuggestionConfirmUi();
        return;
      }
      var promptEl = suggestionsEl.querySelector('.agent-suggestion-confirm-prompt');
      if (promptEl && !wasSelected) {
        promptEl.textContent = pickSuggestionConfirmPrompt();
      }
      startSuggestionConfirmTimer();
    }

    function onSuggestionChip(text, chip) {
      if (pending) return;
      var label = String(text || '').trim();
      if (!label) return;
      if (suggestionNeedsVariableInput(label)) {
        insertComposerSuggestion(label);
        return;
      }
      if (suggestionsMultiSelect && chip) {
        toggleSuggestionChip(chip, label);
        return;
      }
      clearSuggestions();
      sendUserMessage(label);
    }

    /** Inline SVG paths for suggestion chips (16×16 viewBox). */
    var SUGGESTION_ICON_STROKE =
      'stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

    var SUGGESTION_ICON_SVG = {
      'circle-xs':
        '<circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>',
      'circle-sm':
        '<circle cx="8" cy="8" r="3.2" ' + SUGGESTION_ICON_STROKE + '/>',
      'circle-md':
        '<circle cx="8" cy="8" r="4.6" ' + SUGGESTION_ICON_STROKE + '/>',
      'circle-lg':
        '<circle cx="8" cy="8" r="5.6" ' + SUGGESTION_ICON_STROKE + '/>',
      'circle-xl':
        '<circle cx="8" cy="8" r="6.4" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<circle cx="8" cy="8" r="3.2" ' + SUGGESTION_ICON_STROKE + '/>',
      dots:
        '<circle cx="3.5" cy="8" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="8" cy="8" r="1.35" fill="currentColor" stroke="none"/>' +
        '<circle cx="12.5" cy="8" r="1.35" fill="currentColor" stroke="none"/>',
      hammer:
        '<path d="M6.8 7.6 L12.8 13.6" ' +
        SUGGESTION_ICON_STROKE +
        ' stroke-width="2"/>' +
        '<path d="M2.4 5.2 L8.2 2.8 L9.6 5.8 L3.8 8.2 Z" fill="currentColor" stroke="none"/>' +
        '<path d="M8.2 2.8 L10.4 1.8 L12 5.2 L9.6 5.8 Z" fill="currentColor" stroke="none"/>',
      'calm-face':
        '<circle cx="8" cy="8" r="5.6" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<circle cx="5.8" cy="7" r="0.85" fill="currentColor" stroke="none"/>' +
        '<circle cx="10.2" cy="7" r="0.85" fill="currentColor" stroke="none"/>' +
        '<path d="M5.6 10.1c.9 1.1 2.1 1.6 2.4 1.6s1.5-.5 2.4-1.6" ' +
        SUGGESTION_ICON_STROKE +
        '/>',
      exclaim:
        '<path d="M5.2 3.2v6.2M10.8 3.2v6.2" ' +
        SUGGESTION_ICON_STROKE +
        ' stroke-width="1.7"/>' +
        '<circle cx="5.2" cy="12.4" r="1" fill="currentColor" stroke="none"/>' +
        '<circle cx="10.8" cy="12.4" r="1" fill="currentColor" stroke="none"/>',
      user:
        '<circle cx="8" cy="5.2" r="2.2" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M3.5 13.2c.7-2.4 2.3-3.6 4.5-3.6s3.8 1.2 4.5 3.6" ' +
        SUGGESTION_ICON_STROKE +
        '/>',
      users:
        '<circle cx="6" cy="5.4" r="2" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M2.2 13c.6-2.1 1.9-3.1 3.8-3.1s3.2 1 3.8 3.1" ' +
        SUGGESTION_ICON_STROKE +
        '/>' +
        '<circle cx="11" cy="5.8" r="1.7" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M9.2 13c.4-1.5 1.3-2.2 2.6-2.2 1.4 0 2.4.8 2.8 2.2" ' +
        SUGGESTION_ICON_STROKE +
        '/>',
      building:
        '<path d="M3.5 13.5V4.5h9v9M6 7h1.2M8.8 7H10M6 9.5h1.2M8.8 9.5H10M6.8 13.5V11h2.4v2.5" ' +
        SUGGESTION_ICON_STROKE +
        '/>',
      globe:
        '<circle cx="8" cy="8" r="5.5" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<ellipse cx="8" cy="8" rx="2.4" ry="5.5" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M2.5 8h11M3.8 5h8.4M3.8 11h8.4" ' +
        SUGGESTION_ICON_STROKE +
        ' stroke-width="1.2"/>',
      flame:
        '<path d="M8 13.5c2-2.5 3.5-4.5 3.5-6.5a3.5 3.5 0 1 0-7 0c0 2 1.5 4 3.5 6.5z" ' +
        SUGGESTION_ICON_STROKE +
        '/>' +
        '<path d="M8 10v-1.5M6.5 8.5h3" ' + SUGGESTION_ICON_STROKE + '/>',
      check:
        '<path d="M3.2 8.2l3.3 3.2 6.3-7" ' + SUGGESTION_ICON_STROKE + '/>',
      ban:
        '<circle cx="8" cy="8" r="5.5" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M4.2 4.2l7.6 7.6" ' + SUGGESTION_ICON_STROKE + '/>',
      clock:
        '<circle cx="8" cy="8.5" r="5" ' + SUGGESTION_ICON_STROKE + '/>' +
        '<path d="M8 8.5V5.5M8 8.5l2.5 1.5" ' + SUGGESTION_ICON_STROKE + '/>',
      bolt:
        '<path d="M9.2 2.5L4.5 9h3.2l-.9 4.5 5.2-7H8.8z" ' +
        SUGGESTION_ICON_STROKE +
        '/>',
      layers:
        '<path d="M2.5 10.5L8 13.5l5.5-3M2.5 7.5L8 10.5l5.5-3M2.5 4.5L8 7.5l5.5-3L8 1.5z" ' +
        SUGGESTION_ICON_STROKE +
        '/>',
      hourglass:
        '<path d="M4.5 2.5h7M4.5 13.5h7M5.5 3.5L8 8 5.5 12.5M10.5 3.5L8 8l2.5 4.5" ' +
        SUGGESTION_ICON_STROKE +
        '/>'
    };

    /** Impact reach (Personnel → Global): growing circles, blue → green. */
    var IMPACT_REACH_CHIP = {
      personnel: { icon: 'circle-xs', color: 'blue', label: 'Personnel' },
      equipe: { icon: 'circle-sm', color: 'teal', label: '\u00c9quipe' },
      interne: { icon: 'circle-md', color: 'yellow', label: 'Interne' },
      population: { icon: 'circle-lg', color: 'green', label: 'Population' },
      global: { icon: 'circle-xl', color: 'green', label: 'Global' }
    };

    var SUGGESTION_NAMED_COLORS = {
      blue: true,
      bleu: 'blue',
      teal: true,
      cyan: 'teal',
      yellow: true,
      jaune: 'yellow',
      lime: true,
      green: true,
      vert: 'green',
      orange: true,
      red: true,
      rouge: 'red',
      gray: true,
      grey: 'gray',
      gris: 'gray'
    };

    function suggestionIconMarkup(iconKey) {
      var key = String(iconKey || '')
        .trim()
        .toLowerCase();
      var aliases = {
        'small-circle': 'circle-xs',
        'circle-small': 'circle-xs',
        small: 'circle-xs',
        'medium-circle': 'circle-md',
        'circle-medium': 'circle-md',
        medium: 'circle-md',
        'big-circle': 'circle-lg',
        'circle-big': 'circle-lg',
        big: 'circle-lg',
        'huge-circle': 'circle-xl',
        'circle-huge': 'circle-xl',
        huge: 'circle-xl',
        'three-dots': 'dots',
        '3-dots': 'dots',
        ellipsis: 'dots',
        calm: 'calm-face',
        'face-calm': 'calm-face',
        smile: 'calm-face',
        relaxed: 'calm-face',
        '!!': 'exclaim',
        bangs: 'exclaim',
        'double-exclaim': 'exclaim',
        'exclamation-marks': 'exclaim',
        'exclamations': 'exclaim'
      };
      if (aliases[key]) key = aliases[key];
      var inner = SUGGESTION_ICON_SVG[key];
      if (!inner) return '';
      return (
        '<svg class="agent-suggestion-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        inner +
        '</svg>'
      );
    }

    function normalizeSuggestionColorName(raw) {
      if (typeof raw !== 'string') return null;
      var key = raw.trim().toLowerCase();
      if (!key) return null;
      var mapped = SUGGESTION_NAMED_COLORS[key];
      if (mapped === true) return key;
      if (typeof mapped === 'string') return mapped;
      return null;
    }

    function normalizeImpactReachKey(text) {
      var raw = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      if (!raw) return null;
      // "0 (Personnel)", "3 — Population", "impact: Équipe"
      var numbered = raw.match(
        /^(?:impact\s*[=:]?\s*)?([0-4])\s*[\-–—:(]\s*(.+?)\s*\)?$/
      );
      if (numbered) raw = numbered[2].trim();
      raw = raw.replace(/^(portee|impact)\s*[=:]?\s*/, '').trim();
      raw = raw.replace(/^sur\s+/, '').trim();
      if (/^(personnel|moi|individuel|individual|me)$/.test(raw)) return 'personnel';
      if (/^(l['\u2019]?equipe|equipe|team|squad)$/.test(raw)) return 'equipe';
      if (/^(interne|l['\u2019]?org(anisation)?|entreprise|company)$/.test(raw)) {
        return 'interne';
      }
      if (
        /^(les?\s+)?(population|clients?|usagers?|utilisateurs?|communaute|users?)$/.test(
          raw
        )
      ) {
        return 'population';
      }
      if (/^(global|mondial|world|planet)$/.test(raw)) return 'global';
      return null;
    }

    /** Map urgency wording → calm face (low) / !! (high). */
    function urgencyChipIconFromText(text) {
      var raw = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      if (!raw) return null;
      if (
        /pas\s+(du\s+tout\s+)?urgent|aucune?\s+(urgence|pression)|not\s+urgent|no\s+rush|zero\s+urgen/.test(
          raw
        ) ||
        /^(calme|tranquille|relaxed|aucune)$/.test(raw)
      ) {
        return 'calm-face';
      }
      if (
        /(tres|vraiment|super)\s+urgent|urgentes?\b|critique\b|asap|immediate/.test(raw) &&
        !/pas\s+|peu\s+|assez\s+|moyenne?|faible|legere?/.test(raw)
      ) {
        return 'exclaim';
      }
      return null;
    }

    /** Enrich chips: strip "0 (Personnel)" → icon + blue→green color. */
    function enrichSuggestionChipItems(items) {
      var reachKeys = items.map(function (item) {
        return normalizeImpactReachKey(item.text);
      });
      var reachCount = reachKeys.filter(Boolean).length;
      var treatAsReach =
        reachCount >= 2 && reachCount >= Math.ceil(items.length * 0.6);
      // Conversational personal chip: "Impact sur Alex" among reach options.
      if (treatAsReach) {
        items.forEach(function (item, index) {
          if (reachKeys[index]) return;
          var raw = String(item.text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
          if (/^(impact\s+sur|sur)\s+\S+/.test(raw)) {
            reachKeys[index] = 'personnel';
          }
        });
      }
      return items.map(function (item, index) {
        var next = {
          text: item.text,
          heat: item.heat,
          icon: item.icon || null,
          color: item.color || null
        };
        var reachKey = reachKeys[index];
        if (treatAsReach && reachKey && IMPACT_REACH_CHIP[reachKey]) {
          var meta = IMPACT_REACH_CHIP[reachKey];
          var conversational = /^(impact\s+sur|sur)\s+/i.test(String(item.text || ''));
          // Keep "Impact sur …" phrasing and personalized names.
          var keepLabel =
            conversational ||
            (reachKey === 'personnel' &&
              item.text &&
              !/^(personnel|moi)$/i.test(String(item.text).trim()));
          next.text = keepLabel ? item.text : meta.label;
          if (!next.icon) next.icon = meta.icon;
          if (!next.color) next.color = meta.color;
          next.heat = null;
        }
        var urgencyIcon = urgencyChipIconFromText(next.text);
        if (urgencyIcon) next.icon = urgencyIcon;
        if (next.color) next.color = normalizeSuggestionColorName(next.color);
        if (next.icon && !suggestionIconMarkup(next.icon)) next.icon = null;
        return next;
      });
    }

    /** When suggestions are a full 0–4 or 1–5 axis scale, return heat step 0–4 per item. */
    function scaleHeatSteps(items) {
      var nums = items.map(function (text) {
        return /^(?:[0-4]|[1-5])$/.test(text) ? parseInt(text, 10) : NaN;
      });
      if (nums.some(function (n) { return !isFinite(n); })) return null;
      var sorted = nums.slice().sort(function (a, b) { return a - b; });
      var key = sorted.join(',');
      var min;
      var max;
      if (key === '0,1,2,3,4') {
        min = 0;
        max = 4;
      } else if (key === '1,2,3,4,5') {
        min = 1;
        max = 5;
      } else {
        return null;
      }
      var span = max - min;
      return nums.map(function (n) {
        return Math.round(((n - min) / span) * 4);
      });
    }

    function normalizeSuggestionChipItems(list) {
      var out = [];
      (list || []).forEach(function (s) {
        var text = '';
        var heat = null;
        var icon = null;
        var color = null;
        if (typeof s === 'string') {
          text = s.trim();
        } else if (s && typeof s === 'object') {
          if (typeof s.text === 'string') text = s.text.trim();
          else if (typeof s.label === 'string') text = s.label.trim();
          if (s.heat != null && isFinite(Number(s.heat))) {
            heat = Math.max(0, Math.min(4, Math.round(Number(s.heat))));
          }
          if (typeof s.icon === 'string' && s.icon.trim()) {
            icon = s.icon.trim().toLowerCase();
          }
          if (typeof s.color === 'string' && s.color.trim()) {
            color = normalizeSuggestionColorName(s.color);
          }
        }
        if (!text) return;
        out.push({ text: text, heat: heat, icon: icon, color: color });
      });
      // Allow up to 6 answer chips so existing subtasks can all be offered.
      return enrichSuggestionChipItems(out.slice(0, interviewActive ? 5 : 6));
    }

    function resolveSuggestionHeatSteps(items) {
      if (
        items.some(function (item) {
          return item.color;
        })
      ) {
        // Named colors (e.g. impact reach blue→green) win over green→red heat.
        return null;
      }
      var texts = items.map(function (item) {
        return item.text;
      });
      var numeric = scaleHeatSteps(texts);
      if (numeric) return numeric;
      if (
        items.some(function (item) {
          return item.heat != null;
        })
      ) {
        return items.map(function (item) {
          return item.heat;
        });
      }
      return null;
    }

    function fillSuggestionChip(chip, item) {
      chip.replaceChildren();
      var iconHtml = item.icon ? suggestionIconMarkup(item.icon) : '';
      if (iconHtml) {
        var iconWrap = el('span', 'agent-suggestion-chip-icon');
        iconWrap.setAttribute('aria-hidden', 'true');
        iconWrap.innerHTML = iconHtml;
        chip.appendChild(iconWrap);
      }
      var labelEl = el('span', 'agent-suggestion-chip-label');
      labelEl.textContent = item.text;
      chip.appendChild(labelEl);
    }

    function renderSuggestions(list, options) {
      options = options || {};
      var items = normalizeSuggestionChipItems(list);
      composerSuggestions = items.map(function (item) {
        return item.text;
      });
      stopSuggestionConfirmTimer();
      clearSendConfirmCountdown();
      suggestionsEl.replaceChildren();
      suggestionsMultiSelect = false;
      suggestionsEl.classList.remove('is-multi');
      if (!items.length || !Agent.isConfigured(provider)) {
        suggestionsEl.hidden = true;
        if (tabComplete) tabComplete.refresh();
        notifyLayout();
        return;
      }
      suggestionsEl.hidden = false;
      var placeAbove = shouldPlaceSuggestionsAbove(options);
      syncSuggestionsPlacement(placeAbove);
      suggestionsMultiSelect = suggestionsAllowMultiSelect(options.multi);
      if (suggestionsMultiSelect) suggestionsEl.classList.add('is-multi');
      suggestionsEl.setAttribute(
        'aria-label',
        placeAbove
          ? suggestionsMultiSelect
            ? 'R\u00e9ponses sugg\u00e9r\u00e9es (plusieurs possibles)'
            : 'R\u00e9ponses sugg\u00e9r\u00e9es'
          : 'Questions sugg\u00e9r\u00e9es'
      );
      var heatSteps = resolveSuggestionHeatSteps(items);
      items.forEach(function (item, index) {
        var text = item.text;
        var chip = el('button', 'agent-suggestion-chip', { type: 'button' });
        fillSuggestionChip(chip, item);
        chip.setAttribute('data-suggestion', text);
        chip.disabled = pending;
        if (suggestionsMultiSelect) {
          chip.setAttribute('aria-pressed', 'false');
        }
        var colorName = item.color;
        var heat = heatSteps ? heatSteps[index] : null;
        if (colorName) {
          chip.classList.add('agent-suggestion-chip--scale');
          chip.classList.add('agent-suggestion-chip--color-' + colorName);
        } else if (heat != null && isFinite(heat)) {
          chip.classList.add('agent-suggestion-chip--scale');
          chip.classList.add('agent-suggestion-chip--heat-' + heat);
        }
        if (options.animate !== false) {
          chip.style.animationDelay = index * 40 + 'ms';
        }
        chip.addEventListener('click', function () {
          onSuggestionChip(text, chip);
        });
        suggestionsEl.appendChild(chip);
      });
      if (suggestionsMultiSelect) {
        var confirmEl = el('div', 'agent-suggestion-confirm');
        confirmEl.hidden = true;
        var promptEl = el('span', 'agent-suggestion-confirm-prompt');
        promptEl.textContent = SUGGESTION_CONFIRM_PROMPTS[0];
        confirmEl.appendChild(promptEl);
        suggestionsEl.appendChild(confirmEl);
      }
      if (tabComplete) tabComplete.refresh();
      notifyLayout();
    }

    function setSuggestionsBusy(isBusy) {
      Array.prototype.forEach.call(
        suggestionsEl.querySelectorAll('.agent-suggestion-chip'),
        function (chip) {
          chip.disabled = !!isBusy || pending;
        }
      );
      if (isBusy || pending) {
        stopSuggestionConfirmTimer();
        clearSendConfirmCountdown();
      } else {
        syncSuggestionConfirmUi();
      }
    }

    async function refreshSuggestions(options) {
      options = options || {};
      if (!Agent.isConfigured(provider) || pending) return;
      var seq = ++suggestionsSeq;
      setSuggestionsBusy(true);
      try {
        var list = await Agent.suggestQuestions(provider, bridge, {
          history: history,
          onDebug: function (entry) {
            pushDebugEntry(entry);
          }
        });
        if (seq !== suggestionsSeq) return;
        renderSuggestions(list, {
          animate: options.animate !== false,
          answering: false
        });
      } catch (err) {
        if (seq !== suggestionsSeq) return;
        console.error('AgentUI suggestQuestions failed', err);
        if (err && err.debug) pushDebugEntry(err.debug);
        if (!suggestionsEl.childNodes.length) clearSuggestions();
      } finally {
        if (seq === suggestionsSeq) setSuggestionsBusy(false);
      }
    }

    function buildTestItem(r) {
      var li = el('li', 'agent-test-item is-' + r.status);
      li.setAttribute('data-test-id', r.id);
      var mark = el('span', 'agent-test-mark', { text: statusIcon(r.status) });
      var bodyWrap = el('span', 'agent-test-body');
      bodyWrap.appendChild(el('span', 'agent-test-label', { text: r.label }));
      var detail = r.detail || '';
      if (r.ms != null) detail = (detail ? detail + ' \u00b7 ' : '') + r.ms + ' ms';
      if (detail) bodyWrap.appendChild(el('span', 'agent-test-detail', { text: detail }));
      li.appendChild(mark);
      li.appendChild(bodyWrap);
      return li;
    }

    function clearTestResults() {
      testResultsEl.replaceChildren();
      testResultsEl.hidden = true;
    }

    function upsertTestResult(r) {
      if (!r || !r.id) return;
      testResultsEl.hidden = false;
      var next = buildTestItem(r);
      var existing = testResultsEl.querySelector('[data-test-id="' + r.id + '"]');
      if (existing) existing.replaceWith(next);
      else testResultsEl.appendChild(next);
      notifyLayout();
    }

    function setInterviewMode(active) {
      interviewActive = !!active;
      if (!interviewActive) scheduleFaceSleep();
      interviewBar.hidden = !interviewActive;
      if (interviewActive) {
        applySection.hidden = true;
        setListenBarState('idle');
      } else if (settleReady && Agent.isConfigured(provider)) {
        startListening();
      } else {
        setListenBarState('idle');
      }
      syncComposerPlaceholder();
      notifyLayout();
    }

    function expandAssistant() {
      if (collapse && !collapse.isEnabled()) {
        collapse.setEnabled(true, { expand: true });
      } else if (collapse && !collapse.isExpanded()) {
        collapse.setExpanded(true);
      }
    }

    async function persistInterviewState(next) {
      interviewState = Agent.normalizeCardInterview
        ? Agent.normalizeCardInterview(next)
        : next;
      if (!t || typeof Agent.saveCardInterview !== 'function') return interviewState;
      try {
        interviewState = await Agent.saveCardInterview(t, interviewState);
      } catch (err) {
        console.error('AgentUI saveCardInterview failed', err);
      }
      return interviewState;
    }

    async function persistChatHistory() {
      if (!t) return null;
      try {
        if (isProjectScope && typeof Agent.saveBoardChat === 'function') {
          return await Agent.saveBoardChat(t, { messages: history });
        }
        if (typeof Agent.saveCardChat === 'function') {
          return await Agent.saveCardChat(t, { messages: history });
        }
        return null;
      } catch (err) {
        console.error('AgentUI saveChat failed', err);
        return null;
      }
    }

    function schedulePersistChatHistory() {
      if (!t) return;
      if (
        !(isProjectScope
          ? typeof Agent.saveBoardChat === 'function'
          : typeof Agent.saveCardChat === 'function')
      ) {
        return;
      }
      if (chatPersistTimer) clearTimeout(chatPersistTimer);
      chatPersistTimer = setTimeout(function () {
        chatPersistTimer = null;
        persistChatHistory();
      }, 250);
    }

    async function restoreChatHistory() {
      if (!t) return false;
      var loader = isProjectScope ? Agent.loadBoardChat : Agent.loadCardChat;
      if (typeof loader !== 'function') return false;
      try {
        var stored = await loader.call(Agent, t);
        var msgs = (stored && stored.messages) || [];
        if (!msgs.length) return false;
        history.length = 0;
        for (var i = 0; i < msgs.length; i++) {
          var entry = msgs[i];
          if (!entry || !entry.role || !entry.content) continue;
          var selfPromptEntry =
            !!entry.selfPrompt || isSelfPromptHistoryText(entry.content);
          history.push({
            role: entry.role,
            content: entry.content,
            selfPrompt: selfPromptEntry
          });
          if (selfPromptEntry && entry.role === 'user') continue;
          appendMessage(entry.role, entry.content, {
            silent: true,
            noSound: true,
            noUnread: true
          });
        }
        if (!history.length) return false;
        chatRestored = true;
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        notifyLayout();
        return true;
      } catch (err) {
        console.error('AgentUI loadChat failed', err);
        return false;
      }
    }

    async function applyCardPatchesFromTurn(patches) {
      if (isProjectScope) return null;
      if (!patches || !patches.length || !t) return null;
      var Mem = global.AgentMemory;
      if (!Mem || typeof Mem.applyCardPatches !== 'function') return null;
      try {
        var current =
          (typeof bridge.getCardMemory === 'function' && bridge.getCardMemory()) ||
          Mem.emptyCardMemory();
        var updated = await Mem.applyCardPatches(t, current, patches);
        if (onCardMemoryUpdate) onCardMemoryUpdate(updated);
        else {
          bridge.getCardMemory = function () {
            return updated;
          };
        }
        // New learnings → schedule Dream to distill into Description between chats.
        dreamDirty = true;
        if (!interviewActive) {
          scheduleCardDream({ delay: pending ? 6000 : 4500 });
        }
        return updated;
      } catch (err) {
        console.error('AgentUI applyCardPatches failed', err);
        return null;
      }
    }

    async function applyBoardMemoryPatches(patches) {
      if (!patches || !patches.length || !t) return null;
      var Mem = global.AgentMemory;
      if (!Mem || typeof Mem.applyPatches !== 'function') return null;
      try {
        var current =
          (typeof bridge.getMemory === 'function' && bridge.getMemory()) ||
          (typeof Mem.emptyMemory === 'function' ? Mem.emptyMemory() : null);
        if (!current) return null;
        var updated = await Mem.applyPatches(t, current, patches);
        if (onMemoryUpdate) onMemoryUpdate(updated);
        else {
          bridge.getMemory = function () {
            return updated;
          };
        }
        return updated;
      } catch (err) {
        console.error('AgentUI applyBoardMemoryPatches failed', err);
        return null;
      }
    }

    function syncComposerPlaceholder() {
      if (awaitingFeedback) {
        input.placeholder = 'Expliquez ce qui n\'allait pas\u2026';
      } else if (interviewActive) {
        input.placeholder = 'R\u00e9pondez \u00e0 la question\u2026';
      } else {
        input.placeholder = 'Demandez ce que vous voulez';
      }
    }

    function clearAwaitingFeedback(options) {
      options = options || {};
      if (!awaitingFeedback) return;
      var promptRow = awaitingFeedback.promptRow;
      var ask = awaitingFeedback.ask;
      awaitingFeedback = null;
      syncComposerPlaceholder();
      if (options.removePrompt && promptRow) {
        if (promptRow.parentNode) promptRow.parentNode.removeChild(promptRow);
        if (ask && history.length) {
          var last = history[history.length - 1];
          if (last && last.role === 'assistant' && last.content === ask) {
            history.pop();
            schedulePersistChatHistory();
          }
        }
        notifyLayout();
      }
    }

    function assistantBubbleText(row) {
      if (!row) return '';
      var bubble = row.querySelector('.agent-msg-bubble');
      return bubble ? String(bubble.textContent || '').trim() : '';
    }

    function markFeedbackRated(row, kind) {
      if (!row) return;
      var bar = row.querySelector('.agent-msg-feedback');
      if (!bar) return;
      bar.classList.add('is-rated');
      bar.classList.toggle('is-rated-up', kind === 'up');
      bar.classList.toggle('is-rated-down', kind === 'down');
      row.setAttribute('data-feedback', kind);
      var upBtn = bar.querySelector('.agent-msg-feedback-btn--up');
      var downBtn = bar.querySelector('.agent-msg-feedback-btn--down');
      if (upBtn) upBtn.setAttribute('aria-pressed', kind === 'up' ? 'true' : 'false');
      if (downBtn) {
        downBtn.setAttribute('aria-pressed', kind === 'down' ? 'true' : 'false');
      }
    }

    function clearFeedbackRated(row) {
      if (!row) return;
      var bar = row.querySelector('.agent-msg-feedback');
      if (!bar) return;
      bar.classList.remove('is-rated', 'is-rated-up', 'is-rated-down');
      row.removeAttribute('data-feedback');
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (btn) {
        btn.setAttribute('aria-pressed', 'false');
      });
    }

    async function persistUserCorrection(feedbackText, priorAssistant) {
      var cleaned = String(feedbackText || '').trim();
      if (!cleaned) return;
      var pref = ('Pr\u00e9f\u00e9rence: ' + cleaned).slice(0, 160);
      var note = (
        'Pr\u00e9f\u00e9rence / correction: ' +
        cleaned +
        (priorAssistant
          ? ' (suite \u00e0: ' + String(priorAssistant).slice(0, 80) + ')'
          : '')
      ).slice(0, 200);
      var cardFact = ('Correction: ' + cleaned).slice(0, 160);
      await applyBoardMemoryPatches([
        { op: 'note', text: note },
        { op: 'remember', text: pref }
      ]);
      await applyCardPatchesFromTurn([{ op: 'remember', text: cardFact }]);
    }

    function buildCorrectionUserPayload(userFeedback, priorAssistant) {
      return [
        '[Retour n\u00e9gatif \u2014 auto-correction]',
        'Ma r\u00e9ponse pr\u00e9c\u00e9dente n\'\u00e9tait pas correcte.',
        priorAssistant
          ? 'R\u00e9ponse concern\u00e9e\u00a0: \u00ab' +
            String(priorAssistant).slice(0, 280) +
            '\u00bb'
          : '',
        'Ce qui n\'allait pas selon l\'utilisateur\u00a0: \u00ab' +
          String(userFeedback || '').trim() +
          '\u00bb',
        'Retiens la le\u00e7on (patches board si pr\u00e9f\u00e9rence g\u00e9n\u00e9rale, cardPatches si li\u00e9e \u00e0 la carte) et corrige-toi bri\u00e8vement.',
        'Si une action \u00e9tait fausse, propose de la r\u00e9parer via outils. Ne r\u00e9p\u00e8te pas l\'erreur.'
      ]
        .filter(Boolean)
        .join('\n');
    }

    /** Map a committed user DOM row to its index in `history` (nth user message). */
    function historyIndexForUserRow(row) {
      if (!row || !messagesEl) return -1;
      var userOrdinal = 0;
      var kids = messagesEl.children;
      for (var i = 0; i < kids.length; i++) {
        var kid = kids[i];
        if (kid === row) break;
        if (
          kid.classList &&
          kid.classList.contains('agent-msg--user') &&
          !kid.classList.contains('is-queued')
        ) {
          userOrdinal++;
        }
      }
      var seen = 0;
      for (var j = 0; j < history.length; j++) {
        if (history[j] && history[j].role === 'user') {
          if (seen === userOrdinal) return j;
          seen++;
        }
      }
      return -1;
    }

    function removeMessageRowsFrom(row) {
      if (!row) return;
      var next = row;
      while (next) {
        var remove = next;
        next = next.nextSibling;
        if (remove.parentNode) remove.parentNode.removeChild(remove);
      }
    }

    /**
     * Pencil on a user bubble: drop that message and everything after,
     * put the text back in the composer to edit / re-send.
     */
    function resumeFromUserMessage(row) {
      if (!row || !row.classList.contains('agent-msg--user')) return;
      var bubble = row.querySelector('.agent-msg-bubble');
      var text = bubble ? String(bubble.textContent || '') : '';

      // Invalidate any in-flight turn so its completion is ignored.
      chatTurnGen += 1;
      stopThinkingMotions();
      clearSuggestions();
      clearFollowUps();
      clearPrompts();
      clearApplySuggestions();
      if (awaitingFeedback) {
        awaitingFeedback = null;
        syncComposerPlaceholder();
      }
      if (activeOffer) {
        activeOffer = null;
        setListenBarState('idle');
        syncApplySummary();
      }

      if (row.classList.contains('is-queued')) {
        var dropQueued = false;
        var keptQueue = [];
        for (var q = 0; q < messageQueue.length; q++) {
          if (messageQueue[q] && messageQueue[q].row === row) dropQueued = true;
          if (!dropQueued) keptQueue.push(messageQueue[q]);
        }
        messageQueue = keptQueue;
        removeMessageRowsFrom(row);
        pending = false;
        updateComposerEnabled();
        insertComposerSuggestion(text);
        restoreSuggestionsFromHistoryEntry(assistantEntryBeforeIndex());
        openAndFocusComposer();
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        notifyLayout();
        return;
      }

      var histIdx = historyIndexForUserRow(row);
      var prevAssistant =
        histIdx >= 0 ? assistantEntryBeforeIndex(histIdx) : null;
      messageQueue = [];
      removeMessageRowsFrom(row);
      if (histIdx >= 0) {
        history.splice(histIdx);
      }
      pending = false;
      updateComposerEnabled();
      schedulePersistChatHistory();
      insertComposerSuggestion(text);
      restoreSuggestionsFromHistoryEntry(prevAssistant);
      openAndFocusComposer();
      if (collapse && collapse.refreshSummary) collapse.refreshSummary();
      emptyState.classList.toggle(
        'is-hidden',
        history.length > 0 || Agent.isConfigured(provider)
      );
      notifyLayout();
    }

    function copyTextFallback(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.setAttribute('aria-hidden', 'true');
      ta.tabIndex = -1;
      // Keep the node in-document for execCommand, but avoid scroll-into-view.
      ta.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;' +
        'border:0;outline:none;opacity:0;pointer-events:none;';
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var messagesScroll =
        messagesEl && typeof messagesEl.scrollTop === 'number'
          ? messagesEl.scrollTop
          : null;
      document.body.appendChild(ta);
      var ok = false;
      try {
        try {
          ta.focus({ preventScroll: true });
        } catch (focusErr) {
          ta.focus();
        }
        ta.select();
        if (typeof ta.setSelectionRange === 'function') {
          ta.setSelectionRange(0, ta.value.length);
        }
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      if (typeof window.scrollTo === 'function') {
        window.scrollTo(scrollX, scrollY);
      }
      if (messagesEl && messagesScroll != null) {
        messagesEl.scrollTop = messagesScroll;
      }
      return ok;
    }

    function copyTextToClipboard(text) {
      var value = String(text || '');
      if (!value) return Promise.resolve(false);
      if (
        global.navigator &&
        global.navigator.clipboard &&
        typeof global.navigator.clipboard.writeText === 'function'
      ) {
        return global.navigator.clipboard.writeText(value).then(
          function () {
            return true;
          },
          function () {
            return copyTextFallback(value);
          }
        );
      }
      return Promise.resolve(copyTextFallback(value));
    }

    function messageBubblePlainText(row) {
      if (!row) return '';
      var bubble = row.querySelector('.agent-msg-bubble');
      if (!bubble || bubble.classList.contains('agent-msg-bubble--pending')) {
        return '';
      }
      return String(bubble.textContent || '').trim();
    }

    function flashCopyButton(btn) {
      if (!btn) return;
      var icon = btn.querySelector('i');
      if (!icon) return;
      var prevClass = icon.className;
      var prevTitle = btn.getAttribute('title') || 'Copier';
      icon.className = 'ti ti-check';
      btn.classList.add('is-copied');
      btn.setAttribute('title', 'Copi\u00e9');
      btn.setAttribute('aria-label', 'Copi\u00e9');
      if (btn._copyReset) clearTimeout(btn._copyReset);
      btn._copyReset = setTimeout(function () {
        icon.className = prevClass;
        btn.classList.remove('is-copied');
        btn.setAttribute('title', prevTitle);
        btn.setAttribute('aria-label', 'Copier le message');
        btn._copyReset = null;
      }, 1400);
    }

    function attachMessageCopyControl(row) {
      if (!row || row.querySelector('.agent-msg-copy')) return;
      if (
        row.classList.contains('is-pending') ||
        row.classList.contains('agent-msg--offer') ||
        row.classList.contains('agent-msg--recap')
      ) {
        return;
      }
      var btn = el('button', 'agent-msg-copy', {
        type: 'button',
        title: 'Copier',
        'aria-label': 'Copier le message'
      });
      btn.appendChild(el('i', 'ti ti-copy', { 'aria-hidden': 'true' }));
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var text = messageBubblePlainText(row);
        if (!text) return;
        copyTextToClipboard(text).then(function (ok) {
          if (ok) flashCopyButton(btn);
        });
      });

      var bubble = row.querySelector('.agent-msg-bubble');
      if (row.classList.contains('agent-msg--user')) {
        if (bubble && bubble.parentNode === row) {
          row.insertBefore(btn, bubble);
        } else {
          row.appendChild(btn);
        }
        return;
      }

      var feedback = row.querySelector('.agent-msg-feedback');
      var verify = row.querySelector('.agent-tool-verify');
      if (feedback && feedback.parentNode === row) {
        row.insertBefore(btn, feedback.nextSibling);
      } else if (verify && verify.parentNode === row) {
        row.insertBefore(btn, verify.nextSibling);
      } else if (bubble && bubble.parentNode === row) {
        row.insertBefore(btn, bubble.nextSibling);
      } else {
        row.appendChild(btn);
      }
    }

    function attachUserResumeControl(row) {
      if (!row || row.querySelector('.agent-msg-edit')) return;
      var btn = el('button', 'agent-msg-edit', {
        type: 'button',
        title: 'Modifier et reprendre',
        'aria-label': 'Modifier ce message et reprendre depuis ici'
      });
      btn.appendChild(el('i', 'ti ti-pencil', { 'aria-hidden': 'true' }));
      var bubble = row.querySelector('.agent-msg-bubble');
      if (bubble && bubble.parentNode === row) {
        row.insertBefore(btn, bubble);
      } else {
        row.insertBefore(btn, row.firstChild);
      }
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        resumeFromUserMessage(row);
      });
    }

    function attachFeedbackControls(row) {
      if (!row || row.querySelector('.agent-msg-feedback')) return;
      if (
        row.classList.contains('agent-msg--error') ||
        row.classList.contains('agent-msg--offer') ||
        row.classList.contains('agent-msg--recap') ||
        row.classList.contains('is-pending')
      ) {
        return;
      }
      var bar = el('div', 'agent-msg-feedback', {
        role: 'group',
        'aria-label': 'Noter cette r\u00e9ponse'
      });
      var upBtn = el('button', 'agent-msg-feedback-btn agent-msg-feedback-btn--up', {
        type: 'button',
        title: 'Bonne r\u00e9ponse',
        'aria-label': 'Bonne r\u00e9ponse'
      });
      upBtn.appendChild(el('i', 'ti ti-thumb-up'));
      var downBtn = el(
        'button',
        'agent-msg-feedback-btn agent-msg-feedback-btn--down',
        {
          type: 'button',
          title: 'Mauvaise r\u00e9ponse',
          'aria-label': 'Mauvaise r\u00e9ponse'
        }
      );
      downBtn.appendChild(el('i', 'ti ti-thumb-down'));
      bar.appendChild(upBtn);
      bar.appendChild(downBtn);
      var bubble = row.querySelector('.agent-msg-bubble');
      var verify = row.querySelector('.agent-tool-verify');
      if (verify && verify.parentNode === row) {
        row.insertBefore(bar, verify.nextSibling);
      } else if (bubble && bubble.parentNode === row) {
        row.insertBefore(bar, bubble.nextSibling);
      } else {
        row.appendChild(bar);
      }

      upBtn.setAttribute('aria-pressed', 'false');
      downBtn.setAttribute('aria-pressed', 'false');

      upBtn.addEventListener('click', function () {
        if (pending) return;
        var current = row.getAttribute('data-feedback');
        if (current === 'up') {
          clearFeedbackRated(row);
          setAssistantFaceEmotion(row, 'neutral', { animate: true });
          notifyLayout();
          return;
        }
        if (awaitingFeedback) {
          clearAwaitingFeedback({ removePrompt: true });
        }
        markFeedbackRated(row, 'up');
        setAssistantFaceEmotion(row, 'happy', { animate: true });
        notifyLayout();
      });

      downBtn.addEventListener('click', function () {
        if (pending) return;
        var current = row.getAttribute('data-feedback');
        if (current === 'down') {
          if (awaitingFeedback && awaitingFeedback.row === row) {
            clearAwaitingFeedback({ removePrompt: true });
          }
          clearFeedbackRated(row);
          setAssistantFaceEmotion(row, 'neutral', { animate: true });
          notifyLayout();
          return;
        }
        if (awaitingFeedback) {
          clearAwaitingFeedback({ removePrompt: true });
        }
        markFeedbackRated(row, 'down');
        setAssistantFaceEmotion(row, 'sad', { animate: true });
        var content = assistantBubbleText(row);
        var ask =
          'Qu\'est-ce que j\'ai mal fait? Je peux m\'am\u00e9liorer.';
        var promptRow = appendMessage('assistant', ask, {
          noFeedback: true,
          emotion: 'curious',
          noUnread: true
        });
        awaitingFeedback = {
          row: row,
          content: content,
          ask: ask,
          promptRow: promptRow
        };
        syncComposerPlaceholder();
        history.push({ role: 'assistant', content: ask });
        schedulePersistChatHistory();
        expandAssistant();
        try {
          input.focus();
        } catch (e) {
          /* ignore */
        }
        notifyLayout();
      });
    }

    async function finishInterview(options) {
      options = options || {};
      if (interviewState.complete && !interviewActive) return;
      interviewState = Agent.markInterviewComplete
        ? Agent.markInterviewComplete(interviewState)
        : Object.assign({}, interviewState, {
            complete: true,
            completedAt: new Date().toISOString()
          });
      await persistInterviewState(interviewState);
      setInterviewMode(false);
      markSettleReady();
      if (options.announce !== false) {
        appendMessage(
          'assistant',
          options.message ||
            'Okay, on a le cadre. Tu peux me demander d\'ajuster la priorit\u00e9, la date limite ou les sous-t\u00e2ches quand tu veux.'
        );
        history.push({
          role: 'assistant',
          content:
            options.message ||
            'Okay, on a le cadre. Tu peux me demander d\'ajuster la priorit\u00e9, la date limite ou les sous-t\u00e2ches quand tu veux.'
        });
        schedulePersistChatHistory();
      }
      refreshSuggestions({ animate: true });
      await runOpenSanityThenSuggestions({ animate: true });
      // Post-interview: Dream consolidates learnings into the Description between chats.
      scheduleCardDream({ delay: 3500, force: true });
      notifyLayout();
    }

    /**
     * On settle after interview (or returning to a known card): surface coherence issues
     * before the usual applyable improvement chips.
     */
    async function bootstrapSanityCheck() {
      if (sanityBootstrapped || pending || interviewActive) return null;
      if (typeof Agent.cardSanityCheck !== 'function') return null;
      sanityBootstrapped = true;
      dbgLog('agentUi', 'bootstrap.sanity.start', {});
      try {
        var result = await Agent.cardSanityCheck(provider, bridge, {
          onDebug: function (entry) {
            pushDebugEntry(entry);
          }
        });
        if (!result || !result.message) return null;
        expandAssistant();
        appendMessage('assistant', result.message, {
          note: 'Coh\u00e9rence'
        });
        history.push({
          role: 'assistant',
          content: result.message,
          suggestions: result.suggestions || [],
          suggestionsMulti: !!result.suggestionsMulti
        });
        schedulePersistChatHistory();
        if (result.suggestions && result.suggestions.length) {
          suggestionsSeq += 1;
          renderSuggestions(result.suggestions, {
            animate: true,
            multi: result.suggestionsMulti
          });
        }
        if (result.followUps && result.followUps.length) {
          renderFollowUps(result.followUps);
        }
        notifyLayout();
        return result;
      } catch (err) {
        console.error('AgentUI bootstrapSanityCheck failed', err);
        return null;
      }
    }

    async function runOpenSanityThenSuggestions(options) {
      options = options || {};
      await bootstrapSanityCheck();
      // Between sessions: if facts changed since last Dream, consolidate Description.
      scheduleCardDream({ delay: 4000 });
      if (options.skipApplySuggestions) return;
      refreshApplySuggestions({ animate: options.animate !== false });
    }

    async function bootstrapCardInterview() {
      if (isProjectScope) {
        interviewBootstrapped = true;
        markSettleReady();
        dbgLog('agentUi', 'bootstrap.interview.skip', { reason: 'project-scope' });
        refreshSuggestions({ animate: true });
        return;
      }
      if (!t || interviewBootstrapped || pending) return;
      dbgLog('agentUi', 'bootstrap.interview.start', {});
      if (!Agent.isConfigured(provider) || typeof Agent.cardInterviewTurn !== 'function') {
        markSettleReady();
        await runOpenSanityThenSuggestions({
          animate: true,
          skipApplySuggestions: !Agent.isConfigured(provider)
        });
        return;
      }
      interviewBootstrapped = true;
      try {
        interviewState = await Agent.loadCardInterview(t);
      } catch (err) {
        console.error('AgentUI loadCardInterview failed', err);
        interviewState = Agent.emptyCardInterview
          ? Agent.emptyCardInterview()
          : { complete: false, asked: [] };
      }
      if (interviewState.complete) {
        refreshSuggestions({ animate: true });
        markSettleReady();
        if (chatRestored) {
          refreshApplySuggestions({ animate: true });
          scheduleCardDream({ delay: 4000 });
        } else {
          await runOpenSanityThenSuggestions({ animate: true });
        }
        return;
      }

      if (history.length) {
        // Resume an in-progress interview with restored messages (no second opening).
        setInterviewMode(true);
        expandAssistant();
        refreshSuggestions({ animate: true });
        markSettleReady();
        notifyLayout();
        focusComposerInput();
        return;
      }

      setInterviewMode(true);
      expandAssistant();
      pending = true;
      updateComposerEnabled();
      setSuggestionsBusy(true);
      var thinking = appendPendingMessage();
      var bubble = thinking.querySelector('.agent-msg-bubble');

      try {
        var PT = global.PriorityTrello;
        var Mem = global.AgentMemory;
        var neighborhood = { surrounding: [], recentCreated: [], current: null };
        if (PT && typeof PT.getCardNeighborhood === 'function') {
          neighborhood = await PT.getCardNeighborhood(t, {
            neighborRadius: 4,
            recentMax: 8,
            includePriority: false
          });
        }
        interviewSurrounding = neighborhood.surrounding || [];
        interviewRecentCards = neighborhood.recentCreated || [];

        var toRecord = [];
        if (neighborhood.current) {
          toRecord.push({
            id: neighborhood.current.id,
            name: neighborhood.current.name,
            list: neighborhood.current.list,
            at:
              (Mem && Mem.cardIdCreatedAt && Mem.cardIdCreatedAt(neighborhood.current.id)) ||
              new Date().toISOString()
          });
        }
        (neighborhood.recentCreated || []).forEach(function (c) {
          toRecord.push({
            id: c.id,
            name: c.name,
            list: c.list,
            at: c.at
          });
        });
        if (Mem && typeof Mem.recordRecentCards === 'function' && toRecord.length) {
          try {
            var updatedMem = await Mem.recordRecentCards(t, toRecord);
            if (onMemoryUpdate) onMemoryUpdate(updatedMem);
            else {
              var prevGet = bridge.getMemory;
              bridge.getMemory = function () {
                return updatedMem || (prevGet && prevGet());
              };
            }
            if (updatedMem && updatedMem.shortTerm && updatedMem.shortTerm.recentCards) {
              interviewRecentCards = updatedMem.shortTerm.recentCards.slice();
            }
          } catch (memErr) {
            console.error('AgentUI recordRecentCards failed', memErr);
          }
        }

        if (!interviewState.startedAt) {
          interviewState.startedAt = new Date().toISOString();
          await persistInterviewState(interviewState);
        }

        var cardTitle = String(
          (bridge.getCardName && bridge.getCardName()) || ''
        ).trim();
        var startPrompt = cardTitle
          ? 'Commence l\'interview. Titre de la carte\u00a0: «\u00a0' +
            cardTitle +
            '\u00a0». Premi\u00e8re r\u00e9ponse = UNE question POURQUOI courte et naturelle, ancr\u00e9e au titre (noyau utile, pas le titre entier recopié). Pas de tease, pas de «\u00a0Ooh\u00a0», pas de «\u00a0je juge pas\u00a0», pas de clin d\'oeil forc\u00e9. Suggestions = meilleures raisons possibles.'
          : 'Commence l\'interview de cette carte. Premi\u00e8re r\u00e9ponse = UNE question POURQUOI courte et naturelle. Pas de tease ni de th\u00e9\u00e2tre.';
        var fallbackSubject = cardTitle
          ? /^(faire|mettre|cr[eé]er|r[eé]diger|pr[eé]parer|lancer|acheter|obtenir|installer)\b/i.test(
              cardTitle
            )
            ? cardTitle.charAt(0).toLocaleLowerCase('fr-FR') + cardTitle.slice(1)
            : 'faire ' +
              cardTitle.charAt(0).toLocaleLowerCase('fr-FR') +
              cardTitle.slice(1)
          : 'faire cette carte';
        var fallbackOpening = cardTitle
          ? 'Pourquoi tu veux ' + fallbackSubject + '?'
          : 'Pourquoi tu veux faire cette carte?';

        var turn = await Agent.cardInterviewTurn(
          provider,
          [],
          bridge,
          startPrompt,
          {
            asked: interviewState.asked || [],
            surrounding: interviewSurrounding,
            recentCards: interviewRecentCards,
            priorityAxesTrusted: interviewPriorityTrusted
          }
        );

        stopThinkingMotions();
        thinking.classList.remove('is-pending', 'is-streaming');
        thinking.removeAttribute('aria-busy');
        thinking.removeAttribute('aria-label');
        if (bubble) {
          revealPendingBubble(bubble, turn.message || fallbackOpening);
        }
        var opening = turn.message || fallbackOpening;
        history.push({
          role: 'assistant',
          content: opening,
          rawJson: turn.rawJson,
          suggestions: turn.suggestions || [],
          suggestionsMulti: !!turn.suggestionsMulti
        });
        schedulePersistChatHistory();
        if (/\?/.test(opening)) {
          interviewState = Agent.markInterviewQuestionAsked
            ? Agent.markInterviewQuestionAsked(interviewState, opening)
            : interviewState;
          await persistInterviewState(interviewState);
        }
        if (turn.actions && turn.actions.length) {
          var applied = await Agent.executeActions(bridge, turn.actions);
          appendChangeRecap(applied, {
            droppedActions: turn.droppedActions,
            ok: applied.ok
          });
          interviewPriorityTrusted = true;
          muteListening();
        }
        if (turn.cardPatches && turn.cardPatches.length) {
          await applyCardPatchesFromTurn(turn.cardPatches);
        }
        if (turn.patches && turn.patches.length) {
          await applyBoardMemoryPatches(turn.patches);
        }
        if (turn.usage) updateSessionStats(turn.usage);
        renderPrompts(turn.prompts);
        if (turn.suggestions && turn.suggestions.length) {
          suggestionsSeq += 1;
          renderSuggestions(turn.suggestions, {
            animate: true,
            multi: turn.suggestionsMulti
          });
        }
        markSettleReady();
        var openingEmotion = finalizeAssistantRow(thinking, opening, {});
        if (typeof applied !== 'undefined') {
          openingEmotion = applied.ok ? 'happy' : 'sad';
          setAssistantFaceEmotion(thinking, openingEmotion);
        }
        announceAssistantArrival({ emotion: openingEmotion });
        dbgLog('agentUi', 'bootstrap.interview.end', { ok: true });
      } catch (err) {
        dbgError('agentUi', 'bootstrap.interview.end', err, { ok: false });
        console.error('AgentUI bootstrapCardInterview failed', err);
        stopThinkingMotions();
        thinking.classList.remove('is-pending', 'is-streaming');
        if (thinking && thinking.parentNode) thinking.remove();
        appendMessage(
          'assistant',
          'Je n\'ai pas pu d\u00e9marrer l\'interview. Posez-moi une question sur cette carte.'
        );
        setInterviewMode(false);
        refreshSuggestions({ animate: true });
        markSettleReady();
      } finally {
        releasePendingAndDrain();
        focusComposerInput();
      }
    }

    async function ensureProviderLoaded() {
      if (!t) return;
      dbgLog('agentUi', 'bootstrap.provider.start', {});
      try {
        provider = await Agent.getProvider(t);
        savedProvider = Agent.normalizeProvider(provider);
        fillSettingsForm();
        if (global.UserProfile && typeof global.UserProfile.load === 'function') {
          try {
            var profile = await global.UserProfile.load(t);
            applyAgentIdentity(profile);
            if (profile && profile.agentStatus) {
              var fromProfile = normalizeStatusLevel(profile.agentStatus);
              if (fromProfile !== statusLevel) {
                statusLevel = fromProfile;
                statusSelect.value = statusLevel;
                try {
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STATUS_PREF_STORAGE_KEY, statusLevel);
                  }
                } catch (lsErr) {
                  /* ignore */
                }
                syncStatusControls();
              }
            }
          } catch (profErr) {
            console.error('AgentUI load profile failed', profErr);
          }
        }
        if (Agent.isConfigured(provider)) {
          await restoreChatHistory();
          if (isProjectScope) {
            interviewBootstrapped = true;
            markSettleReady();
            if (chatRestored) {
              refreshSuggestions({ animate: true });
            } else {
              refreshSuggestions({ animate: true });
            }
          } else if (!interviewBootstrapped) {
            await bootstrapCardInterview();
          } else {
            markSettleReady();
            if (chatRestored) {
              refreshSuggestions({ animate: true });
              refreshApplySuggestions({ animate: true });
            } else {
              await runOpenSanityThenSuggestions({ animate: true });
            }
          }
        } else {
          markSettleReady();
          await runOpenSanityThenSuggestions({
            animate: true,
            skipApplySuggestions: true
          });
        }
        if (openMemoryOnSettings || (isProjectScope && needsMemoryAlign())) {
          setSettingsOpen(true);
          memoryDetails.open = true;
          syncMemoryBadge();
          if (needsMemoryAlign()) {
            mountMemoryUi('onboarding');
          }
        }
        dbgLog('agentUi', 'bootstrap.provider.end', {
          configured: Agent.isConfigured(provider),
          interviewBootstrapped: interviewBootstrapped
        });
      } catch (err) {
        dbgError('agentUi', 'bootstrap.provider.end', err, { ok: false });
        console.error('AgentUI load provider failed', err);
      }
    }

    async function persistProvider(next) {
      provider = Agent.normalizeProvider(next);
      if (!t) return provider;
      provider = await Agent.saveProvider(t, provider);
      savedProvider = Agent.normalizeProvider(provider);
      fillSettingsForm();
      return provider;
    }

    async function saveSettings() {
      var next = readSettingsForm();
      fillSettingsForm();
      if (!t) {
        setSettingsStatus('Client Trello indisponible', 'fail');
        return;
      }
      var changed = !Agent.providersEqual(next, savedProvider);
      try {
        await persistAgentIdentity(readAgentIdentityForm());
        await persistProvider(next);
        if (changed) {
          setSettingsStatus('Enregistr\u00e9 \u2014 tests en cours\u2026');
          await runTests({ fromSave: true });
        } else {
          setSettingsStatus('Enregistr\u00e9.', 'pass');
        }
        if (Agent.isConfigured(provider) && !history.length && !interviewBootstrapped) {
          await bootstrapCardInterview();
        }
      } catch (err) {
        console.error('AgentUI save settings failed', err);
        setSettingsStatus(
          (err && err.message) || 'Enregistrement impossible',
          'fail'
        );
      }
    }

    async function runTests(options) {
      options = options || {};
      if (testing) return;
      provider = readSettingsForm();
      fillSettingsForm();
      testing = true;
      testBtn.disabled = true;
      saveBtn.disabled = true;
      setSettingsStatus('Tests en cours\u2026');
      clearTestResults();
      try {
        var results = await Agent.runProviderTests(provider, function (item) {
          upsertTestResult(item);
        });
        var failed = results.some(function (r) {
          return r.status === 'fail';
        });
        var warned = results.some(function (r) {
          return r.status === 'warn';
        });
        if (failed) {
          provider = Agent.clearVerified(provider);
          if (t) {
            try {
              await persistProvider(provider);
            } catch (persistErr) {
              console.error('AgentUI clear verified failed', persistErr);
            }
          } else {
            fillSettingsForm();
          }
          setSettingsStatus('Des tests ont \u00e9chou\u00e9.', 'fail');
        } else {
          provider = Agent.markVerified(provider);
          if (t) {
            try {
              await persistProvider(provider);
            } catch (persistErr) {
              console.error('AgentUI mark verified failed', persistErr);
              fillSettingsForm();
            }
          } else {
            fillSettingsForm();
          }
          if (warned) {
            setSettingsStatus(
              options.fromSave
                ? 'Enregistr\u00e9 \u2014 fournisseur joignable avec avertissements.'
                : 'Fournisseur joignable avec avertissements.',
              'warn'
            );
          } else {
            setSettingsStatus(
              options.fromSave
                ? 'Enregistr\u00e9 \u2014 tous les tests sont pass\u00e9s.'
                : 'Tous les tests sont pass\u00e9s.',
              'pass'
            );
          }
          if (!history.length) {
            refreshSuggestions({ animate: true });
            refreshApplySuggestions({ animate: true });
          }
        }
      } catch (err) {
        setSettingsStatus((err && err.message) || 'Tests interrompus', 'fail');
      } finally {
        testing = false;
        testBtn.disabled = false;
        saveBtn.disabled = false;
        notifyLayout();
      }
    }

    async function sendUserMessage(text, options) {
      var opts = options || {};
      var msg = (text || '').trim();
      if (!msg) return;
      if (!Agent.isConfigured(provider)) {
        setSettingsOpen(true);
        setError('Configurez d\'abord un fournisseur IA.');
        return;
      }
      // Typed send (and any other commit) drops stale answer chips immediately —
      // same as tapping a suggestion. New ones arrive with the next turn.
      clearSuggestions();
      if (pending) {
        enqueueUserMessage(msg, opts);
        return;
      }
      // Ingest immediately so Enter never freezes on the composer.
      if (opts.fromComposer) {
        input.value = '';
        refreshComposerTypingGaze();
      }
      var feedbackContext = null;
      if (awaitingFeedback) {
        feedbackContext = awaitingFeedback;
        awaitingFeedback = null;
        syncComposerPlaceholder();
      }
      setError('');
      clearFollowUps();
      clearPrompts();
      var silentUser = !!(opts.silentUser || opts.isSelfPrompt);
      var userRow = opts.queuedRow;
      if (userRow) {
        activateQueuedUserRow(userRow);
      } else if (!silentUser) {
        userRow = appendMessage('user', msg);
      }
      history.push({
        role: 'user',
        content: msg,
        selfPrompt: !!opts.isSelfPrompt || isSelfPromptHistoryText(msg)
      });
      schedulePersistChatHistory();
      pending = true;
      updateComposerEnabled();
      var myGen = ++chatTurnGen;
      var turnKind =
        interviewActive && typeof Agent.cardInterviewTurn === 'function'
          ? 'cardInterviewTurn'
          : 'chatTurn';
      dbgLog('agentUi', 'turn.start', { kind: turnKind });
      var thinking = appendPendingMessage();
      var bubble = thinking.querySelector('.agent-msg-bubble');
      var streamed = false;
      var queuedSelfPromptFocus = null;
      try {
        var apiMsg = msg;
        if (feedbackContext) {
          await persistUserCorrection(msg, feedbackContext.content);
          if (myGen !== chatTurnGen) return;
          apiMsg = buildCorrectionUserPayload(msg, feedbackContext.content);
        }
        var turn;
        if (interviewActive && typeof Agent.cardInterviewTurn === 'function') {
          turn = await Agent.cardInterviewTurn(
            provider,
            history.slice(0, -1),
            bridge,
            apiMsg,
            {
              onDelta: function (visible) {
                if (myGen !== chatTurnGen) return;
                if (!bubble || !visible) return;
                if (!streamed) {
                  streamed = true;
                  stopThinkingMotions();
                  thinking.classList.remove('is-pending');
                  thinking.removeAttribute('aria-busy');
                  thinking.removeAttribute('aria-label');
                  revealPendingBubble(bubble, visible);
                } else {
                  fillHighlightedBubble(bubble, visible);
                }
                messagesEl.scrollTop = messagesEl.scrollHeight;
                notifyLayout();
              },
              asked: interviewState.asked || [],
              surrounding: interviewSurrounding,
              recentCards: interviewRecentCards,
              priorityAxesTrusted: interviewPriorityTrusted
            }
          );
        } else {
          if (
            isProjectScope &&
            typeof bridge.refreshBoardDigest === 'function'
          ) {
            try {
              await bridge.refreshBoardDigest();
            } catch (digestErr) {
              /* keep cached digest */
            }
            if (myGen !== chatTurnGen) return;
          }
          turn = await Agent.chatTurn(
            provider,
            history.slice(0, -1),
            bridge,
            apiMsg,
            {
              onDelta: function (visible) {
                if (myGen !== chatTurnGen) return;
                if (!bubble || !visible) return;
                if (!streamed) {
                  streamed = true;
                  stopThinkingMotions();
                  thinking.classList.remove('is-pending');
                  thinking.removeAttribute('aria-busy');
                  thinking.removeAttribute('aria-label');
                  revealPendingBubble(bubble, visible);
                } else {
                  fillHighlightedBubble(bubble, visible);
                }
                messagesEl.scrollTop = messagesEl.scrollHeight;
                notifyLayout();
              }
            }
          );
        }
        // Capture exchange even if this turn is superseded (edit/resume).
        if (turn && turn.debug) pushDebugEntry(turn.debug);
        if (myGen !== chatTurnGen) return;
        if (bubble) {
          if (!streamed) revealPendingBubble(bubble, turn.message);
          else fillHighlightedBubble(bubble, turn.message);
        }
        thinking.classList.remove('is-pending', 'is-streaming');
        thinking.removeAttribute('aria-busy');
        thinking.removeAttribute('aria-label');
        history.push({
          role: 'assistant',
          content: turn.message,
          rawJson: turn.rawJson,
          suggestions: turn.suggestions || [],
          suggestionsMulti: !!turn.suggestionsMulti
        });
        schedulePersistChatHistory();
        var identityTools = {
          set_agent_color: true,
          set_agent_name: true,
          set_agent_personality: true
        };
        var identityActions = [];
        var otherActions = [];
        (turn.actions || []).forEach(function (a) {
          if (a && identityTools[a.tool]) identityActions.push(a);
          else if (a) otherActions.push(a);
        });
        var identityApplied = null;
        if (identityActions.length) {
          identityApplied = await Agent.executeActions(bridge, identityActions);
          if (identityApplied && identityApplied.ok && turn.color) {
            // Keep reply color aligned with the persisted identity.
            var appliedColor = null;
            (identityApplied.results || []).forEach(function (r) {
              if (r && r.ok && r.tool === 'set_agent_color' && r.args) {
                appliedColor =
                  (typeof r.args.color === 'string' && r.args.color) || appliedColor;
              }
            });
            if (appliedColor) turn.color = appliedColor;
          }
        }
        var replyEmotion = finalizeAssistantRow(thinking, turn.message, {
          emotion: turn.emotion,
          color: turn.color
        });
        attachFeedbackControls(thinking);
        attachMessageCopyControl(thinking);
        announceAssistantArrival({ emotion: replyEmotion });
        if (collapse && collapse.refreshSummary) {
          collapse.refreshSummary();
        }
        // Auto-apply tools when the assistant has enough info (e.g. after a clarifying answer).
        // Executor result is source of truth — always show a technical recap.
        var applied = identityApplied;
        if (otherActions.length) {
          muteListening();
          var restApplied = await Agent.executeActions(bridge, otherActions);
          if (!applied) {
            applied = restApplied;
          } else {
            applied = {
              ok: !!(applied.ok && restApplied.ok),
              results: (applied.results || []).concat(restApplied.results || [])
            };
          }
        }
        if (applied || (turn.actions && turn.actions.length)) {
          muteListening();
          appendChangeRecap(applied || { results: [] }, {
            droppedActions: turn.droppedActions,
            ok: applied ? applied.ok : false
          });
          setAssistantFaceEmotion(thinking, applied && applied.ok ? 'happy' : 'sad', {
            color: turn.color || (applied && applied.ok ? 'yellow' : 'orange')
          });
          if (interviewActive) interviewPriorityTrusted = true;
          muteListening();
          // Defer until after pending clears in finally.
          setTimeout(function () {
            if (!interviewActive) refreshApplySuggestions({ animate: true });
          }, 0);
        } else {
          var emptyClaim =
            Agent.looksLikeAppliedClaim &&
            Agent.looksLikeAppliedClaim(turn.message);
          var hasDropped =
            turn.droppedActions && turn.droppedActions.length;
          if (emptyClaim || hasDropped) {
            if (emptyClaim && !hasDropped) {
              setAssistantFaceEmotion(thinking, 'surprised', {
                color: turn.color || 'orange'
              });
            }
            appendChangeRecap(
              { results: [] },
              {
                droppedActions: turn.droppedActions || [],
                emptyClaim: emptyClaim && !hasDropped
              }
            );
          }
        }
        if (turn.cardPatches && turn.cardPatches.length) {
          await applyCardPatchesFromTurn(turn.cardPatches);
        }
        if (turn.patches && turn.patches.length) {
          await applyBoardMemoryPatches(turn.patches);
        }
        var didCardWork =
          !!(otherActions.length && applied && applied.ok) ||
          !!(turn.cardPatches && turn.cardPatches.length) ||
          !!(turn.patches && turn.patches.length);
        if (
          turn.selfPrompt &&
          didCardWork &&
          !opts.isSelfPrompt &&
          !interviewActive &&
          !isSelfPromptHistoryText(msg)
        ) {
          queuedSelfPromptFocus = turn.selfPromptFocus || '';
        }
        if (interviewActive && turn.message && /\?/.test(turn.message)) {
          interviewState = Agent.markInterviewQuestionAsked
            ? Agent.markInterviewQuestionAsked(interviewState, turn.message)
            : interviewState;
          await persistInterviewState(interviewState);
        }
        // Successful chat proves the provider works — persist verified + hide configure CTA.
        if (!Agent.isVerified(provider)) {
          try {
            await persistProvider(Agent.markVerified(provider));
          } catch (verifyErr) {
            console.error('AgentUI mark verified after chat failed', verifyErr);
            provider = Agent.markVerified(provider);
            fillSettingsForm();
          }
        }
        if (turn.usage) updateSessionStats(turn.usage);
        else renderChatStats();
        renderFollowUps(interviewActive ? [] : turn.followUps);
        renderPrompts(turn.prompts);
        if (interviewActive && turn.completeInterview) {
          await finishInterview({ announce: false });
          if (turn.suggestions && turn.suggestions.length) {
            suggestionsSeq += 1;
            renderSuggestions(turn.suggestions, {
              animate: true,
              multi: turn.suggestionsMulti
            });
          } else {
            refreshSuggestions({ animate: true });
          }
        } else if (turn.suggestions && turn.suggestions.length) {
          suggestionsSeq += 1;
          renderSuggestions(turn.suggestions, {
            animate: true,
            multi: turn.suggestionsMulti
          });
        } else if (!interviewActive) {
          refreshSuggestions({ animate: true });
        }
        dbgLog('agentUi', 'turn.end', {
          ok: true,
          kind: turnKind,
          actionCount: (turn.actions || []).length,
          droppedCount: (turn.droppedActions || []).length
        });
      } catch (err) {
        if (err && err.debug) pushDebugEntry(err.debug);
        if (myGen !== chatTurnGen) return;
        dbgError('agentUi', 'turn.end', err, { ok: false, kind: turnKind });
        stopThinkingMotions();
        thinking.classList.remove('is-pending', 'is-streaming');
        var errText = (err && err.message) || 'Erreur de l\'assistant';
        if (thinking && thinking.parentNode) thinking.remove();
        appendChatError(errText);
        setError('');
        refreshSuggestions({ animate: true });
      } finally {
        if (myGen === chatTurnGen) {
          if (queuedSelfPromptFocus != null) {
            queueSelfPromptReview(queuedSelfPromptFocus);
          }
          releasePendingAndDrain();
        }
      }
    }

    async function onFollowUp(fu) {
      if (pending) return;
      clearFollowUps();
      clearPrompts();
      var actions = (fu && fu.actions) || [];
      if (actions.length) {
        muteListening();
        var result = await Agent.executeActions(bridge, actions);
        appendMessage('assistant', result.summary || 'Okay, c\'est fait.', {
          note: fu.label
        });
        appendChangeRecap(result, { ok: result.ok });
        history.push({
          role: 'assistant',
          content: result.summary || result.recap || 'Okay, c\'est fait.'
        });
        schedulePersistChatHistory();
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        muteListening();
        refreshSuggestions({ animate: true });
        refreshApplySuggestions({ animate: true });
        notifyLayout();
        return;
      }
      sendUserMessage(fu.label);
    }

    function onSend() {
      var typed = (input.value || '').trim();
      var selected = getSelectedSuggestionTexts();
      var msg = selected.length
        ? formatSelectedSuggestions(typed ? selected.concat([typed]) : selected)
        : typed;
      stopSuggestionConfirmTimer();
      clearSendConfirmCountdown();
      sendUserMessage(msg, { fromComposer: true });
    }

    applyRefreshBtn.addEventListener('click', function () {
      if (pending) return;
      refreshApplySuggestions({ animate: true });
    });
    settingsBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (collapse && !collapse.isEnabled()) {
        collapse.setEnabled(true, { expand: true });
      } else if (collapse && !collapse.isExpanded()) {
        collapse.setExpanded(true);
      }
      setSettingsOpen(!settingsOpen);
    });
    debugBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (statusLevel !== 'full') return;
      setDebugOpen(!debugOpen);
    });
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.agent-tool-verify')) {
        return;
      }
      closeToolVerifyTips();
    });
    window.addEventListener('resize', function () {
      Array.prototype.forEach.call(
        messagesEl.querySelectorAll('.agent-tool-verify.is-open'),
        positionToolVerifyTip
      );
    });
    statusSelect.addEventListener('change', function () {
      statusLevel = normalizeStatusLevel(statusSelect.value);
      statusSelect.value = statusLevel;
      saveStatusLevel(statusLevel);
      syncStatusControls();
    });
    emptyConfigBtn.addEventListener('click', function () {
      if (collapse && !collapse.isEnabled()) {
        collapse.setEnabled(true, { expand: true });
      } else if (collapse && !collapse.isExpanded()) {
        collapse.setExpanded(true);
      }
      setSettingsOpen(true);
    });
    saveBtn.addEventListener('click', function () {
      saveSettings();
    });
    testBtn.addEventListener('click', function () {
      runTests();
    });
    doneBtn.addEventListener('click', function () {
      setSettingsOpen(false);
    });
    agentColorSelect.addEventListener('change', function () {
      var nextColor = agentColorSelect.value;
      var curName = (agentNameInput.value || '').trim();
      var isStock =
        !curName ||
        (global.UserProfile &&
          global.UserProfile.isStockAgentName &&
          global.UserProfile.isStockAgentName(curName));
      if (isStock && global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        agentNameInput.value = global.UserProfile.pickAgentNameForColor(nextColor);
      }
      // Rebuild picker thumbs so each face style previews the new color.
      fillAgentFacePicker(agentIdentity.agentFace);
      syncAgentAvatarPreview();
    });
    agentNameInput.addEventListener('input', function () {
      syncAgentAvatarPreview();
    });
    rerollNameBtn.addEventListener('click', function () {
      var color = agentColorSelect.value || agentIdentity.agentColor;
      if (global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        agentNameInput.value = global.UserProfile.pickAgentNameForColor(color);
      }
      syncAgentAvatarPreview();
      persistAgentIdentity(readAgentIdentityForm()).catch(function (err) {
        console.error('AgentUI reroll name failed', err);
      });
    });
    rerollColorBtn.addEventListener('click', function () {
      var nextColor =
        global.UserProfile && global.UserProfile.pickRandomAgentColor
          ? global.UserProfile.pickRandomAgentColor()
          : 'orange';
      agentColorSelect.value = nextColor;
      if (global.UserProfile && global.UserProfile.pickAgentNameForColor) {
        agentNameInput.value = global.UserProfile.pickAgentNameForColor(nextColor);
      }
      syncAgentAvatarPreview();
      persistAgentIdentity(readAgentIdentityForm()).catch(function (err) {
        console.error('AgentUI reroll color failed', err);
      });
    });
    sendBtn.addEventListener('click', onSend);
    interviewSkipBtn.addEventListener('click', function () {
      if (pending || !interviewActive) return;
      finishInterview({
        message:
          'Okay, on passe. Tu pourras reprendre la config quand tu veux.'
      });
    });
    input.addEventListener('input', function () {
      refreshComposerTypingGaze();
      cancelSuggestionConfirmOnComposerInput();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
        return;
      }
      // Glance down as soon as the user starts typing (before value updates).
      if (!faceSm.typing && e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setFaceIdleTyping(true);
      }
    });

    fillAgentColorSelect(agentIdentity.agentColor);
    syncAgentAvatarPreview();
    fillSettingsForm();
    ensureProviderLoaded();
    updateComposerEnabled();
    syncStatusControls();
    notifyLayout();
    dbgLog('agentUi', 'mount.ready', { scope: assistantScope });

    if (initiallyOpen || shouldFocusComposer) {
      openAndFocusComposer();
    }

    return {
      el: section,
      scope: assistantScope,
      refreshProvider: ensureProviderLoaded,
      collapse: collapse,
      focusComposer: openAndFocusComposer,
      openSettings: function (opts) {
        setSettingsOpen(true);
        if (opts && opts.memory) {
          memoryDetails.open = true;
          syncMemoryBadge();
          if (opts.mountMemory) {
            mountMemoryUi(opts.mountMemory === 'onboarding' ? 'onboarding' : 'ongoing');
          }
        }
      }
    };
  }

  global.AgentUI = {
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
