/**
 * Chat UI for the Priority Power-Up assistant.
 * Exposes window.AgentUI.mount(cardEl, options).
 */
(function (global) {
  'use strict';

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
    var bridge = {
      getCardName: options.getCardName || function () { return ''; },
      getCardDesc: options.getCardDesc || function () { return ''; },
      getFormulaKey: options.getFormulaKey || function () { return 'baseline'; },
      getPriorityState: options.getPriorityState || function () { return {}; },
      getCompletion: options.getCompletion || function () { return { items: [] }; },
      getMemory: options.getMemory || function () { return null; },
      getCardMemory: options.getCardMemory || function () { return null; },
      getProfile: options.getProfile || function () { return null; },
      getBoardDigest: options.getBoardDigest || function () { return ''; },
      getGoals: options.getGoals || function () { return null; },
      setProject: options.setProject || function () {
        return Promise.resolve({ ok: false, reason: 'no-setProject' });
      },
      applyPriority: options.applyPriority || function () {},
      applyCompletion: options.applyCompletion || function () {},
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
    var initiallyOpen = !!options.initiallyOpen;
    var shouldFocusComposer = options.focusComposer != null
      ? !!options.focusComposer
      : initiallyOpen;
    var Agent = global.PriorityAgent;
    if (!Agent) throw new Error('PriorityAgent is required');
    if (!global.PriorityUI) throw new Error('PriorityUI is required');

    var provider = Agent.normalizeProvider(null);
    var savedProvider = Agent.normalizeProvider(null);
    var history = [];
    var pending = false;
    var settingsOpen = false;
    var testing = false;
    var suggestionsSeq = 0;
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
    var sessionStats = {
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      estimated: false,
      lastUsage: null
    };

    var section = el('div', 'variant-chat-section');
    var field = el('div', 'field field--chat');

    var chrome = PriorityUI.createCollapsibleEnableChrome({
      title: 'Assistant',
      bodyId: 'agent-chat-body',
      checkboxClass: 'chat-enable-checkbox',
      labelClass: 'chat-enable-label',
      leadingIcon: 'ti-message-chatbot',
      iconClass: 'chat-leading-icon',
      titleClass: 'chat-enable-title',
      collapseLabel: 'Replier Assistant',
      expandLabel: 'D\u00e9velopper Assistant'
    });
    field.appendChild(chrome.head);

    var settingsBtn = el('button', 'agent-settings-btn', {
      type: 'button',
      'aria-label': 'Configurer le fournisseur IA',
      title: 'Configurer le fournisseur'
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

    function labeledInput(labelText, inputEl) {
      var wrap = el('label', 'agent-field');
      wrap.appendChild(el('span', 'agent-field-label', { text: labelText }));
      wrap.appendChild(inputEl);
      return wrap;
    }

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
      text: 'Envoyer'
    });
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
          return !input.disabled && !pending;
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
    chatPanel.appendChild(composer);
    chatPanel.appendChild(suggestionsEl);

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
    var applyHead = el('div', 'agent-apply-suggestions-head');
    applyHead.appendChild(
      el('span', 'agent-apply-suggestions-label', { text: 'Suggestions IA' })
    );
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
      enabled: true,
      expanded: expandChat,
      getSummary: function () {
        if (applySuggestionsLoading) return 'Analyse\u2026';
        if (applySuggestions.length) {
          return applySuggestions.length === 1
            ? '1 suggestion'
            : applySuggestions.length + ' suggestions';
        }
        if (!Agent.isConfigured(provider)) return 'Non configur\u00e9';
        if (!Agent.isVerified(provider)) return 'Non v\u00e9rifi\u00e9';
        var n = history.length;
        if (!n) return '';
        return n === 1 ? '1 message' : n + ' messages';
      },
      onLayoutChange: onLayoutChange,
      onEnableChange: function (on) {
        if (!on && settingsOpen) setSettingsOpen(false);
      },
      onExpandChange: function (isExpanded) {
        if (typeof PriorityUI.saveSectionCollapseState === 'function') {
          PriorityUI.saveSectionCollapseState({ chat: !!isExpanded });
        }
      }
    });

    function syncApplySummary() {
      field.classList.toggle(
        'has-ai-suggestions',
        applySuggestions.length > 0 || applySuggestionsLoading
      );
      field.classList.toggle('is-ai-suggestions-loading', applySuggestionsLoading);
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
          var cell = el('span', 'agent-chat-stats-item');
          if (part.label) {
            cell.appendChild(el('span', 'agent-chat-stats-label', { text: part.label }));
            cell.appendChild(document.createTextNode('\u00a0'));
          }
          cell.appendChild(el('span', 'agent-chat-stats-value', { text: part.value }));
          if (part.title) cell.title = part.title;
          row.appendChild(cell);
        });
        statsEl.appendChild(row);
      }

      if (!usage || sessionStats.turns < 1) {
        addRow('agent-chat-stats-row--last', [
          { label: 'Tokens', value: '\u2014', title: 'Aucun \u00e9change pour l\u2019instant' },
          { label: 'Co\u00fbt', value: '\u2014' }
        ].concat(
          isFull ? [{ label: 'Latence', value: '\u2014' }] : []
        ));
        addRow(
          'agent-chat-stats-row--session',
          [
            {
              label: 'Contexte',
              value: '\u2014'
            },
            {
              label: 'M\u00e9moire',
              value: history.length + ' msg',
              title: 'Messages conserv\u00e9s dans cette session'
            }
          ].concat(
            isFull
              ? [
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

      var lastParts = [
        {
          label: 'Tokens',
          value: lastTokenValue,
          title: tokenTitle
        },
        {
          label: 'Co\u00fbt',
          value: '\u2248' + formatCostUsd(usage.costUsd),
          title: 'Estimation selon le tarif publique du mod\u00e8le (non facturation)'
        }
      ];
      if (isFull) {
        lastParts.push({
          label: 'Latence',
          value: formatLatency(usage.latencyMs)
        });
        if (usage.cachedTokens != null && usage.cachedTokens > 0) {
          lastParts.push({
            label: 'Cache',
            value: formatTokenCount(usage.cachedTokens),
            title: 'Tokens d\'entr\u00e9e en cache'
          });
        }
        if (usage.reasoningTokens != null && usage.reasoningTokens > 0) {
          lastParts.push({
            label: 'Raisonnement',
            value: formatTokenCount(usage.reasoningTokens)
          });
        }
      }
      addRow('agent-chat-stats-row--last', lastParts);

      var ctx = usage.context || {};
      var fill = typeof ctx.fillPercent === 'number' ? ctx.fillPercent : null;
      var compressionHint =
        fill != null && fill >= 50
          ? 'Contexte charg\u00e9 \u2014 l\'historique allonge les requ\u00eates'
          : 'Part du contexte utilis\u00e9e par le prompt + l\'historique';
      var memoryParts = [
        {
          label: 'Contexte',
          value:
            fill != null
              ? fill + '% (' + formatTokenCount(ctx.requestTokens) + '/' + formatWindow(ctx.windowTokens) + ')'
              : formatTokenCount(ctx.requestTokens),
          title: compressionHint
        },
        {
          label: 'M\u00e9moire',
          value: history.length + ' msg',
          title: 'Messages conserv\u00e9s dans cette session'
        }
      ];
      if (isFull) {
        memoryParts.push(
          {
            label: 'Compression',
            value: 'aucune',
            title:
              'L\'historique est renvoy\u00e9 en entier \u00e0 chaque tour (pas de r\u00e9sum\u00e9 ni troncature)'
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
            title: 'Totaux de cette conversation'
          }
        );
        if (usage.model) {
          memoryParts.push({
            label: 'Mod\u00e8le',
            value: usage.model,
            title: usage.model
          });
        }
        var fr = finishReasonLabel(usage.finishReason);
        if (fr) {
          memoryParts.push({
            label: 'Fin',
            value: fr
          });
        }
      }
      addRow('agent-chat-stats-row--session', memoryParts);
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
      settingsBtn.title = configured
        ? 'Paramètres du fournisseur'
        : 'Configurer le fournisseur';
      settingsBtn.setAttribute(
        'aria-label',
        configured ? 'Paramètres du fournisseur IA' : 'Configurer le fournisseur IA'
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
      var ok = configured && !pending;
      composer.hidden = !configured;
      sendBtn.disabled = !ok;
      input.disabled = !configured || pending;
      if (!configured) {
        clearSuggestions();
        clearApplySuggestions();
      } else {
        setSuggestionsBusy(pending);
        setApplySuggestionsBusy(pending);
      }
    }

    function appendMessage(role, text, meta) {
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
      bubble.textContent = text;
      row.appendChild(bubble);
      if (meta && meta.note) {
        row.appendChild(el('div', 'agent-msg-note', { text: meta.note }));
      }
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      notifyLayout();
      return row;
    }

    function appendPendingMessage() {
      emptyState.classList.add('is-hidden');
      var row = el('div', 'agent-msg agent-msg--assistant is-pending is-streaming');
      row.setAttribute('aria-busy', 'true');
      row.setAttribute('aria-label', 'R\u00e9ponse en cours');
      var bubble = el('div', 'agent-msg-bubble agent-msg-bubble--pending');
      var spinner = el('span', 'agent-msg-spinner');
      spinner.setAttribute('aria-hidden', 'true');
      var spinnerIcon = el('i', 'ti ti-loader-2');
      spinnerIcon.setAttribute('aria-hidden', 'true');
      spinner.appendChild(spinnerIcon);
      var skeleton = el('div', 'agent-msg-skeleton');
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.appendChild(el('span', 'agent-msg-skeleton-line'));
      skeleton.appendChild(
        el('span', 'agent-msg-skeleton-line agent-msg-skeleton-line--short')
      );
      bubble.appendChild(spinner);
      bubble.appendChild(skeleton);
      row.appendChild(bubble);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      notifyLayout();
      return row;
    }

    function revealPendingBubble(bubble, text) {
      if (!bubble) return;
      bubble.classList.remove('agent-msg-bubble--pending');
      bubble.replaceChildren();
      bubble.textContent = text || '';
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
        host.appendChild(wrap);
      } else {
        var row = el('div', 'agent-msg agent-msg--assistant agent-msg--recap');
        row.appendChild(wrap);
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
        appendMessage('assistant', 'Axes mis \u00e0 jour.', {
          note: 'Affinage priorit\u00e9'
        });
        appendChangeRecap(result, { ok: result.ok });
        history.push({
          role: 'assistant',
          content: 'Axes mis \u00e0 jour.'
        });
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        refreshSuggestions({ animate: true });
        refreshApplySuggestions({ animate: true });
      } catch (err) {
        appendChatError((err && err.message) || 'Erreur lors de l\'affinage');
      } finally {
        pending = false;
        updateComposerEnabled();
        notifyLayout();
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

    function clearSuggestions() {
      composerSuggestions = [];
      suggestionsEl.replaceChildren();
      suggestionsEl.hidden = true;
      if (tabComplete) tabComplete.refresh();
      notifyLayout();
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
      var result = await Agent.executeActions(bridge, item.actions);
      appendMessage('assistant', result.summary || 'Suggestion appliqu\u00e9e.', {
        note: item.label
      });
      appendChangeRecap(result, { ok: result.ok });
      history.push({
        role: 'assistant',
        content: result.summary || result.recap || 'Suggestion appliqu\u00e9e.'
      });
      applySuggestions = applySuggestions.filter(function (_s, i) {
        return i !== index;
      });
      renderApplySuggestions(applySuggestions, { animate: false });
      if (!applySuggestions.length) {
        // Re-scan for follow-up improvements after applying.
        refreshApplySuggestions({ animate: true });
      }
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
      if (pending) return;
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

    function onSuggestionChip(text) {
      if (pending) return;
      var label = String(text || '').trim();
      if (!label) return;
      if (suggestionNeedsVariableInput(label)) {
        insertComposerSuggestion(label);
        return;
      }
      clearSuggestions();
      sendUserMessage(label, { skipSpellcheck: true });
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

    function renderSuggestions(list, options) {
      options = options || {};
      var items = (list || [])
        .map(function (s) {
          return typeof s === 'string' ? s.trim() : '';
        })
        .filter(Boolean)
        .slice(0, interviewActive ? 5 : 4);
      composerSuggestions = items.slice();
      suggestionsEl.replaceChildren();
      if (!items.length || !Agent.isConfigured(provider)) {
        suggestionsEl.hidden = true;
        if (tabComplete) tabComplete.refresh();
        notifyLayout();
        return;
      }
      suggestionsEl.hidden = false;
      var heatSteps = scaleHeatSteps(items);
      items.forEach(function (text, index) {
        var chip = el('button', 'agent-suggestion-chip', { type: 'button' });
        chip.textContent = text;
        chip.setAttribute('data-suggestion', text);
        chip.disabled = pending;
        if (heatSteps) {
          chip.classList.add('agent-suggestion-chip--scale');
          chip.classList.add('agent-suggestion-chip--heat-' + heatSteps[index]);
        }
        if (options.animate !== false) {
          chip.style.animationDelay = index * 40 + 'ms';
        }
        chip.addEventListener('click', function () {
          onSuggestionChip(text);
        });
        suggestionsEl.appendChild(chip);
      });
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
        renderSuggestions(list, { animate: options.animate !== false });
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
      interviewBar.hidden = !interviewActive;
      if (interviewActive) {
        applySection.hidden = true;
        input.placeholder = 'R\u00e9pondez \u00e0 la question\u2026';
      } else {
        input.placeholder = 'Demandez ce que vous voulez';
      }
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

    async function applyCardPatchesFromTurn(patches) {
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
        return updated;
      } catch (err) {
        console.error('AgentUI applyCardPatches failed', err);
        return null;
      }
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
      if (options.announce !== false) {
        appendMessage(
          'assistant',
          options.message ||
            'Interview termin\u00e9e. Vous pouvez me demander d\'affiner priorit\u00e9, \u00e9ch\u00e9ance ou sous-t\u00e2ches.'
        );
        history.push({
          role: 'assistant',
          content:
            options.message ||
            'Interview termin\u00e9e. Vous pouvez me demander d\'affiner priorit\u00e9, \u00e9ch\u00e9ance ou sous-t\u00e2ches.'
        });
      }
      refreshSuggestions({ animate: true });
      refreshApplySuggestions({ animate: true });
      notifyLayout();
    }

    async function bootstrapCardInterview() {
      if (!t || interviewBootstrapped || pending) return;
      if (!Agent.isConfigured(provider) || typeof Agent.cardInterviewTurn !== 'function') {
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
      if (interviewState.complete || history.length) {
        refreshSuggestions({ animate: true });
        refreshApplySuggestions({ animate: true });
        return;
      }

      setInterviewMode(true);
      expandAssistant();
      // UI-only intro (not sent to the model history).
      appendMessage(
        'assistant',
        'Ça semble être une nouvelle tâche. Je peux t\'aider à la configurer.'
      );
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

        var turn = await Agent.cardInterviewTurn(
          provider,
          [],
          bridge,
          'Commence l\'interview de cette carte.',
          {
            asked: interviewState.asked || [],
            surrounding: interviewSurrounding,
            recentCards: interviewRecentCards,
            priorityAxesTrusted: interviewPriorityTrusted
          }
        );

        thinking.classList.remove('is-pending', 'is-streaming');
        thinking.removeAttribute('aria-busy');
        thinking.removeAttribute('aria-label');
        if (bubble) {
          revealPendingBubble(
            bubble,
            turn.message ||
              'Cette carte est nouvelle. \u00c0 qui profite surtout ce travail\u00a0?'
          );
        }
        var opening =
          turn.message ||
          'Cette carte est nouvelle. \u00c0 qui profite surtout ce travail\u00a0?';
        history.push({
          role: 'assistant',
          content: opening,
          rawJson: turn.rawJson
        });
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
        }
        if (turn.cardPatches && turn.cardPatches.length) {
          await applyCardPatchesFromTurn(turn.cardPatches);
        }
        if (turn.usage) updateSessionStats(turn.usage);
        renderPrompts(turn.prompts);
        if (turn.suggestions && turn.suggestions.length) {
          suggestionsSeq += 1;
          renderSuggestions(turn.suggestions, { animate: true });
        }
        if (turn.completeInterview) {
          await finishInterview({ announce: false });
        }
      } catch (err) {
        console.error('AgentUI bootstrapCardInterview failed', err);
        thinking.classList.remove('is-pending', 'is-streaming');
        if (thinking && thinking.parentNode) thinking.remove();
        appendMessage(
          'assistant',
          'Je n\'ai pas pu d\u00e9marrer l\'interview. Posez-moi une question sur cette carte.'
        );
        setInterviewMode(false);
        refreshSuggestions({ animate: true });
      } finally {
        pending = false;
        updateComposerEnabled();
        setSuggestionsBusy(false);
        notifyLayout();
        focusComposerInput();
      }
    }

    async function ensureProviderLoaded() {
      if (!t) return;
      try {
        provider = await Agent.getProvider(t);
        savedProvider = Agent.normalizeProvider(provider);
        fillSettingsForm();
        if (global.UserProfile && typeof global.UserProfile.load === 'function') {
          try {
            var profile = await global.UserProfile.load(t);
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
            console.error('AgentUI load agentStatus failed', profErr);
          }
        }
        if (Agent.isConfigured(provider) && !history.length) {
          await bootstrapCardInterview();
        }
      } catch (err) {
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
        await persistProvider(next);
        if (changed) {
          setSettingsStatus('Enregistr\u00e9 \u2014 tests en cours\u2026');
          await runTests({ fromSave: true });
        } else {
          setSettingsStatus(
            Agent.isVerified(provider)
              ? 'Aucune modification.'
              : 'Fournisseur enregistr\u00e9.',
            Agent.isVerified(provider) ? 'pass' : undefined
          );
        }
        if (Agent.isConfigured(provider) && !history.length && !interviewBootstrapped) {
          await bootstrapCardInterview();
        }
      } catch (err) {
        console.error('AgentUI save provider failed', err);
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
      if (!msg || pending) return;
      if (!Agent.isConfigured(provider)) {
        setSettingsOpen(true);
        setError('Configurez d\'abord un fournisseur IA.');
        return;
      }
      // Ingest immediately so Enter never freezes on the composer.
      if (opts.fromComposer) {
        input.value = '';
      }
      setError('');
      clearFollowUps();
      clearPrompts();
      setSuggestionsBusy(true);
      var userRow = appendMessage('user', msg);
      var userBubble = userRow.querySelector('.agent-msg-bubble');
      history.push({ role: 'user', content: msg });
      pending = true;
      updateComposerEnabled();
      var thinking = appendPendingMessage();
      var bubble = thinking.querySelector('.agent-msg-bubble');
      var streamed = false;
      try {
        if (
          !opts.skipSpellcheck &&
          global.Spellcheck &&
          typeof global.Spellcheck.correct === 'function'
        ) {
          try {
            var corrected = await global.Spellcheck.correct(msg);
            if (typeof corrected === 'string' && corrected.trim()) {
              var fixed = corrected.trim();
              if (fixed !== msg) {
                var originalMsg = msg;
                msg = fixed;
                if (userBubble) userBubble.textContent = msg;
                history[history.length - 1].content = msg;
                if (
                  global.Spellcheck &&
                  typeof global.Spellcheck.attachRevert === 'function'
                ) {
                  global.Spellcheck.attachRevert(userRow, {
                    onRevert: function () {
                      if (userBubble) userBubble.textContent = originalMsg;
                      var last = history[history.length - 1];
                      // Prefer the just-corrected user turn; fall back if assistant already appended.
                      if (last && last.role === 'user' && last.content === fixed) {
                        last.content = originalMsg;
                      } else {
                        for (var hi = history.length - 1; hi >= 0; hi--) {
                          if (
                            history[hi] &&
                            history[hi].role === 'user' &&
                            history[hi].content === fixed
                          ) {
                            history[hi].content = originalMsg;
                            break;
                          }
                        }
                      }
                      notifyLayout();
                    },
                    onDismiss: function () {
                      notifyLayout();
                    }
                  });
                }
                notifyLayout();
              }
            }
          } catch (spellErr) {
            console.error('Spellcheck before chat failed', spellErr);
          }
        }
        var turn;
        if (interviewActive && typeof Agent.cardInterviewTurn === 'function') {
          turn = await Agent.cardInterviewTurn(
            provider,
            history.slice(0, -1),
            bridge,
            msg,
            {
              onDelta: function (visible) {
                if (!bubble || !visible) return;
                if (!streamed) {
                  streamed = true;
                  thinking.classList.remove('is-pending');
                  thinking.removeAttribute('aria-busy');
                  thinking.removeAttribute('aria-label');
                  revealPendingBubble(bubble, visible);
                } else {
                  bubble.textContent = visible;
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
          turn = await Agent.chatTurn(provider, history.slice(0, -1), bridge, msg, {
            onDelta: function (visible) {
              if (!bubble || !visible) return;
              if (!streamed) {
                streamed = true;
                thinking.classList.remove('is-pending');
                thinking.removeAttribute('aria-busy');
                thinking.removeAttribute('aria-label');
                revealPendingBubble(bubble, visible);
              } else {
                bubble.textContent = visible;
              }
              messagesEl.scrollTop = messagesEl.scrollHeight;
              notifyLayout();
            }
          });
        }
        if (bubble) {
          if (!streamed) revealPendingBubble(bubble, turn.message);
          else bubble.textContent = turn.message;
        }
        thinking.classList.remove('is-pending', 'is-streaming');
        thinking.removeAttribute('aria-busy');
        thinking.removeAttribute('aria-label');
        history.push({
          role: 'assistant',
          content: turn.message,
          rawJson: turn.rawJson
        });
        if (collapse && collapse.refreshSummary) {
          collapse.refreshSummary();
        }
        // Auto-apply tools when the assistant has enough info (e.g. after a clarifying answer).
        // Executor result is source of truth — always show a technical recap.
        if (turn.actions && turn.actions.length) {
          var applied = await Agent.executeActions(bridge, turn.actions);
          appendChangeRecap(applied, {
            droppedActions: turn.droppedActions,
            ok: applied.ok
          });
          if (interviewActive) interviewPriorityTrusted = true;
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
        if (turn.debug) pushDebugEntry(turn.debug);
        renderFollowUps(interviewActive ? [] : turn.followUps);
        renderPrompts(turn.prompts);
        if (interviewActive && turn.completeInterview) {
          await finishInterview({ announce: false });
          if (turn.suggestions && turn.suggestions.length) {
            suggestionsSeq += 1;
            renderSuggestions(turn.suggestions, { animate: true });
          } else {
            refreshSuggestions({ animate: true });
          }
        } else if (turn.suggestions && turn.suggestions.length) {
          suggestionsSeq += 1;
          renderSuggestions(turn.suggestions, { animate: true });
        } else if (!interviewActive) {
          refreshSuggestions({ animate: true });
        }
      } catch (err) {
        thinking.classList.remove('is-pending', 'is-streaming');
        var errText = (err && err.message) || 'Erreur de l\'assistant';
        if (thinking && thinking.parentNode) thinking.remove();
        appendChatError(errText);
        setError('');
        if (err && err.debug) pushDebugEntry(err.debug);
        refreshSuggestions({ animate: true });
      } finally {
        pending = false;
        updateComposerEnabled();
        setSuggestionsBusy(false);
        notifyLayout();
      }
    }

    async function onFollowUp(fu) {
      if (pending) return;
      clearFollowUps();
      clearPrompts();
      var actions = (fu && fu.actions) || [];
      if (actions.length) {
        var result = await Agent.executeActions(bridge, actions);
        appendMessage('assistant', result.summary || 'Action effectu\u00e9e.', {
          note: fu.label
        });
        appendChangeRecap(result, { ok: result.ok });
        history.push({
          role: 'assistant',
          content: result.summary || result.recap || 'Action effectu\u00e9e.'
        });
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        refreshSuggestions({ animate: true });
        refreshApplySuggestions({ animate: true });
        notifyLayout();
        return;
      }
      sendUserMessage(fu.label, { skipSpellcheck: true });
    }

    function onSend() {
      sendUserMessage(input.value, { fromComposer: true });
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
    sendBtn.addEventListener('click', onSend);
    interviewSkipBtn.addEventListener('click', function () {
      if (pending || !interviewActive) return;
      finishInterview({
        message:
          'Okay, configuration initiale ignor\u00e9e. Vous pouvez reprendre quand vous voulez.'
      });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });

    fillSettingsForm();
    ensureProviderLoaded();
    updateComposerEnabled();
    syncStatusControls();
    notifyLayout();

    if (initiallyOpen || shouldFocusComposer) {
      openAndFocusComposer();
    }

    return {
      el: section,
      refreshProvider: ensureProviderLoaded,
      collapse: collapse,
      focusComposer: openAndFocusComposer
    };
  }

  global.AgentUI = {
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
