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
    var history = [];
    var pending = false;
    var settingsOpen = false;

    var section = el('div', 'variant-chat-section');
    var field = el('div', 'field field--chat');

    var chrome = PriorityUI.createCollapsibleEnableChrome({
      title: 'Assistant',
      bodyId: 'agent-chat-body',
      hideEnable: true,
      leadingIcon: 'ti-message-chatbot',
      labelClass: 'chat-leading-icon',
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

    body.appendChild(settingsPanel);

    // ── Chat panel ──────────────────────────────────────────────────────
    var chatPanel = el('div', 'agent-chat-panel');

    var emptyState = el('div', 'agent-empty');
    emptyState.appendChild(
      el('p', 'agent-empty-text', {
        text: 'Posez une question sur cette carte, ou demandez une modification (priorit\u00e9, \u00e9ch\u00e9ance, progr\u00e8s\u2026).'
      })
    );
    var emptyConfigBtn = el('button', 'tp-link agent-empty-config', {
      type: 'button',
      text: 'Configurer le fournisseur'
    });
    emptyState.appendChild(emptyConfigBtn);
    chatPanel.appendChild(emptyState);

    var messagesEl = el('div', 'agent-messages', { role: 'log', 'aria-live': 'polite' });
    chatPanel.appendChild(messagesEl);

    var followUpsEl = el('div', 'agent-followups', { role: 'group', 'aria-label': 'Suggestions' });
    followUpsEl.hidden = true;
    chatPanel.appendChild(followUpsEl);

    var composer = el('div', 'agent-composer');
    var input = el('textarea', 'agent-composer-input', {
      rows: '2',
      placeholder: 'Ex. Quand est l\'\u00e9ch\u00e9ance\u00a0?',
      'aria-label': 'Message \u00e0 l\'assistant'
    });
    var sendBtn = el('button', 'tp-button agent-send-btn', {
      type: 'button',
      text: 'Envoyer'
    });
    composer.appendChild(input);
    composer.appendChild(sendBtn);
    chatPanel.appendChild(composer);

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
      alwaysEnabled: true,
      enabled: true,
      expanded: expandChat,
      getSummary: function () {
        if (!Agent.isConfigured(provider)) return 'Non configur\u00e9';
        return provider.model || '';
      },
      onLayoutChange: onLayoutChange,
      onExpandChange: function (isExpanded) {
        if (typeof PriorityUI.saveSectionCollapseState === 'function') {
          PriorityUI.saveSectionCollapseState({ chat: !!isExpanded });
        }
      }
    });

    function notifyLayout() {
      onLayoutChange();
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
      emptyState.classList.toggle('is-hidden', history.length > 0);
      emptyConfigBtn.hidden = Agent.isConfigured(provider);
    }

    function readSettingsForm() {
      var isOpenAI = provider.preset === 'openai';
      return Agent.normalizeProvider({
        preset: provider.preset || 'openai',
        apiKey: apiKeyInput.value,
        baseUrl: baseUrlInput.value,
        model: isOpenAI ? modelSelect.value : modelInput.value
      });
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
      followUpsEl.hidden = false;
      followUps.forEach(function (fu) {
        var chip = el('button', 'agent-followup-chip', { type: 'button' });
        chip.textContent = fu.label;
        chip.addEventListener('click', function () {
          onFollowUp(fu);
        });
        followUpsEl.appendChild(chip);
      });
      notifyLayout();
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
        fillSettingsForm();
      } catch (err) {
        console.error('AgentUI load provider failed', err);
      }
    }

    async function saveSettings() {
      provider = readSettingsForm();
      fillSettingsForm();
      if (!t) {
        setSettingsStatus('Client Trello indisponible', 'fail');
        return;
      }
      try {
        provider = await Agent.saveProvider(t, provider);
        fillSettingsForm();
        setSettingsStatus('Fournisseur enregistr\u00e9.', 'pass');
      } catch (err) {
        console.error('AgentUI save provider failed', err);
        setSettingsStatus(
          (err && err.message) || 'Enregistrement impossible',
          'fail'
        );
      }
    }

    async function runTests() {
      provider = readSettingsForm();
      fillSettingsForm();
      testBtn.disabled = true;
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
        if (failed) setSettingsStatus('Des tests ont \u00e9chou\u00e9.', 'fail');
        else if (warned) setSettingsStatus('Fournisseur joignable avec avertissements.', 'warn');
        else setSettingsStatus('Tous les tests sont pass\u00e9s.', 'pass');
      } catch (err) {
        setSettingsStatus((err && err.message) || 'Tests interrompus', 'fail');
      } finally {
        testBtn.disabled = false;
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
      appendMessage('user', msg);
      history.push({ role: 'user', content: msg });
      pending = true;
      updateComposerEnabled();
      var thinking = appendMessage('assistant', '\u2026');
      thinking.classList.add('is-pending');
      try {
        var turn = await Agent.chatTurn(provider, history.slice(0, -1), bridge, msg);
        thinking.remove();
        appendMessage('assistant', turn.message);
        history.push({
          role: 'assistant',
          content: turn.message,
          rawJson: turn.rawJson
        });
        renderFollowUps(turn.followUps);
      } catch (err) {
        thinking.remove();
        var errText = (err && err.message) || 'Erreur de l\'assistant';
        appendMessage('assistant', errText);
        setError(errText);
        // Keep history consistent: drop the user turn that failed mid-flight? keep it.
      } finally {
        pending = false;
        updateComposerEnabled();
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
      setSettingsOpen(!settingsOpen);
    });
    emptyConfigBtn.addEventListener('click', function () {
      setSettingsOpen(true);
      if (collapse && !collapse.isExpanded()) {
        collapse.setExpanded(true);
      }
    });
    saveBtn.addEventListener('click', function () {
      saveSettings();
    });
    testBtn.addEventListener('click', function () {
      runTests();
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
