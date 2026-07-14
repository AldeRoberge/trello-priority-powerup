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
      getFormulaKey: options.getFormulaKey || function () { return 'baseline'; },
      getPriorityState: options.getPriorityState || function () { return {}; },
      getCompletion: options.getCompletion || function () { return { items: [] }; },
      applyPriority: options.applyPriority || function () {},
      applyCompletion: options.applyCompletion || function () {}
    };
    var onLayoutChange = options.onLayoutChange || function () {};
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
    // Place after the collapse control so it stays clickable (collapse is flex:1).
    chrome.head.appendChild(settingsBtn);

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
    composer.appendChild(input);
    composer.appendChild(sendBtn);
    chatPanel.appendChild(composer);

    var suggestionsEl = el('div', 'agent-suggestions', {
      role: 'group',
      'aria-label': 'Questions sugg\u00e9r\u00e9es'
    });
    suggestionsEl.hidden = true;
    chatPanel.appendChild(suggestionsEl);

    var statsEl = el('div', 'agent-chat-stats', {
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Statistiques de la conversation'
    });
    statsEl.hidden = true;
    chatPanel.appendChild(statsEl);

    var errorEl = el('p', 'agent-error');
    errorEl.hidden = true;
    chatPanel.appendChild(errorEl);

    body.appendChild(chatPanel);
    field.appendChild(body);
    section.appendChild(field);
    cardEl.appendChild(section);

    var expandFallback = false;
    var expandChat =
      typeof PriorityUI.resolveSectionExpanded === 'function'
        ? PriorityUI.resolveSectionExpanded('chat', expandFallback)
        : expandFallback;

    var collapse = PriorityUI.bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      enabled: true,
      expanded: expandChat,
      getSummary: function () {
        if (!Agent.isConfigured(provider)) return 'Non configur\u00e9';
        if (!Agent.isVerified(provider)) return 'Non v\u00e9rifi\u00e9';
        return provider.model || '';
      },
      onLayoutChange: onLayoutChange,
      onEnableChange: function (on) {
        if (!on && settingsOpen) setSettingsOpen(false);
        notifyLayout();
      },
      onExpandChange: function (isExpanded) {
        if (typeof PriorityUI.saveSectionCollapseState === 'function') {
          PriorityUI.saveSectionCollapseState({ chat: !!isExpanded });
        }
      }
    });

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

    function renderChatStats() {
      var usage = sessionStats.lastUsage;
      if (!usage || sessionStats.turns < 1) {
        statsEl.hidden = true;
        statsEl.replaceChildren();
        return;
      }
      statsEl.hidden = false;
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
        },
        {
          label: 'Latence',
          value: formatLatency(usage.latencyMs)
        }
      ];
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
        },
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
      ];
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
      if (!configured) clearSuggestions();
      else setSuggestionsBusy(pending);
    }

    function appendMessage(role, text, meta) {
      emptyState.classList.add('is-hidden');
      var row = el('div', 'agent-msg agent-msg--' + role);
      var bubble = el('div', 'agent-msg-bubble');
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

    function clearFollowUps() {
      followUpsEl.replaceChildren();
      followUpsEl.hidden = true;
      notifyLayout();
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
      suggestionsEl.replaceChildren();
      suggestionsEl.hidden = true;
      notifyLayout();
    }

    function renderSuggestions(list, options) {
      options = options || {};
      var items = (list || [])
        .map(function (s) {
          return typeof s === 'string' ? s.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 4);
      suggestionsEl.replaceChildren();
      if (!items.length || !Agent.isConfigured(provider)) {
        suggestionsEl.hidden = true;
        notifyLayout();
        return;
      }
      suggestionsEl.hidden = false;
      items.forEach(function (text, index) {
        var chip = el('button', 'agent-suggestion-chip', { type: 'button' });
        chip.textContent = text;
        chip.disabled = pending;
        if (options.animate !== false) {
          chip.style.animationDelay = index * 40 + 'ms';
        }
        chip.addEventListener('click', function () {
          if (pending) return;
          sendUserMessage(text);
        });
        suggestionsEl.appendChild(chip);
      });
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
          history: history
        });
        if (seq !== suggestionsSeq) return;
        renderSuggestions(list, { animate: options.animate !== false });
      } catch (err) {
        if (seq !== suggestionsSeq) return;
        console.error('AgentUI suggestQuestions failed', err);
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

    async function ensureProviderLoaded() {
      if (!t) return;
      try {
        provider = await Agent.getProvider(t);
        savedProvider = Agent.normalizeProvider(provider);
        fillSettingsForm();
        if (Agent.isConfigured(provider) && !history.length) {
          refreshSuggestions({ animate: true });
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
          if (!history.length) refreshSuggestions({ animate: true });
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

    async function sendUserMessage(text) {
      var msg = (text || '').trim();
      if (!msg || pending) return;
      if (!Agent.isConfigured(provider)) {
        setSettingsOpen(true);
        setError('Configurez d\'abord un fournisseur IA.');
        return;
      }
      setError('');
      clearFollowUps();
      setSuggestionsBusy(true);
      appendMessage('user', msg);
      history.push({ role: 'user', content: msg });
      pending = true;
      updateComposerEnabled();
      var thinking = appendMessage('assistant', '\u2026');
      thinking.classList.add('is-pending', 'is-streaming');
      var bubble = thinking.querySelector('.agent-msg-bubble');
      var streamed = false;
      try {
        var turn = await Agent.chatTurn(provider, history.slice(0, -1), bridge, msg, {
          onDelta: function (visible) {
            if (!bubble || !visible) return;
            if (!streamed) {
              streamed = true;
              thinking.classList.remove('is-pending');
            }
            bubble.textContent = visible;
            messagesEl.scrollTop = messagesEl.scrollHeight;
            notifyLayout();
          }
        });
        if (bubble) bubble.textContent = turn.message;
        thinking.classList.remove('is-pending', 'is-streaming');
        history.push({
          role: 'assistant',
          content: turn.message,
          rawJson: turn.rawJson
        });
        // Auto-apply tools when the assistant has enough info (e.g. after a clarifying answer).
        if (turn.actions && turn.actions.length) {
          var applied = Agent.executeActions(bridge, turn.actions);
          if (applied.errors && applied.errors.length) {
            appendMessage('assistant', applied.errors.join('; '));
          } else if (collapse && collapse.refreshSummary) {
            collapse.refreshSummary();
          }
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
        renderFollowUps(turn.followUps);
        if (turn.suggestions && turn.suggestions.length) {
          suggestionsSeq += 1;
          renderSuggestions(turn.suggestions, { animate: true });
        } else {
          refreshSuggestions({ animate: true });
        }
      } catch (err) {
        thinking.classList.remove('is-pending', 'is-streaming');
        var errText = (err && err.message) || 'Erreur de l\'assistant';
        if (bubble) bubble.textContent = errText;
        else appendMessage('assistant', errText);
        setError(errText);
        refreshSuggestions({ animate: true });
      } finally {
        pending = false;
        updateComposerEnabled();
        setSuggestionsBusy(false);
        notifyLayout();
      }
    }

    function onFollowUp(fu) {
      if (pending) return;
      clearFollowUps();
      var actions = (fu && fu.actions) || [];
      if (actions.length) {
        var result = Agent.executeActions(bridge, actions);
        var note =
          result.summary ||
          (result.errors && result.errors[0]) ||
          'Action effectu\u00e9e.';
        if (result.errors && result.errors.length && result.summary) {
          note = result.summary + ' (' + result.errors.join('; ') + ')';
        } else if (result.errors && result.errors.length && !result.ok) {
          note = result.errors.join('; ');
        }
        appendMessage('assistant', note, { note: fu.label });
        history.push({
          role: 'assistant',
          content: note
        });
        if (collapse && collapse.refreshSummary) collapse.refreshSummary();
        refreshSuggestions({ animate: true });
        notifyLayout();
        return;
      }
      sendUserMessage(fu.label);
    }

    function onSend() {
      var msg = input.value;
      input.value = '';
      sendUserMessage(msg);
    }

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
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    });

    fillSettingsForm();
    ensureProviderLoaded();
    updateComposerEnabled();
    notifyLayout();

    return {
      el: section,
      refreshProvider: ensureProviderLoaded,
      collapse: collapse
    };
  }

  global.AgentUI = {
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
