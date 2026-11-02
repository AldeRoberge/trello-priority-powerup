/**
 * agent-ui: mount() part 1 of 8.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see agent-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.AgentUiParts = global.AgentUiParts || {});
  var P = (global.AgentUiPartsMountMount = global.AgentUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.labeledInput = function labeledInput(labelText, inputEl) {
      var wrap = S.el('label', 'agent-field');
      wrap.appendChild(S.el('span', 'agent-field-label', { text: labelText }));
      wrap.appendChild(inputEl);
      return wrap;
    };
    M.normalizeStatusLevel = function normalizeStatusLevel(raw) {
      if (global.UserProfile && typeof global.UserProfile.normalizeAgentStatus === 'function') {
        return global.UserProfile.normalizeAgentStatus(raw);
      }
      var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return M.STATUS_LEVELS.indexOf(s) !== -1 ? s : 'standard';
    };
    M.loadStatusLevel = function loadStatusLevel() {
      try {
        if (typeof localStorage !== 'undefined') {
          var raw = localStorage.getItem(M.STATUS_PREF_STORAGE_KEY);
          if (raw != null) return M.normalizeStatusLevel(raw);
          var legacy = localStorage.getItem(M.LEGACY_DEBUG_PREF_STORAGE_KEY);
          if (legacy != null) {
            return legacy === '0' || legacy === 'false' ? 'standard' : 'full';
          }
        }
      } catch (e) {
        /* ignore */
      }
      return 'standard';
    };
    M.saveStatusLevel = function saveStatusLevel(level) {
      var next = M.normalizeStatusLevel(level);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(M.STATUS_PREF_STORAGE_KEY, next);
        }
      } catch (e) {
        /* ignore quota / private mode */
      }
      if (M.t && global.UserProfile && typeof global.UserProfile.load === 'function') {
        global.UserProfile.load(M.t)
          .then(function (profile) {
            if (!profile || profile.agentStatus === next) return null;
            profile.agentStatus = next;
            return global.UserProfile.save(M.t, profile);
          })
          .catch(function (err) {
            console.error('AgentUI: profile agentStatus sync failed', err);
          });
      }
    };
    M.syncProviderFold = function syncProviderFold() {
      var configured = M.Agent.isConfigured(M.provider);
      if (configured) {
        M.providerBadge.hidden = true;
        M.providerBadge.textContent = '';
      } else {
        M.providerBadge.hidden = false;
        M.providerBadge.textContent = 'Non configur\u00e9';
      }
    };
    M.openProviderFold = function openProviderFold() {
      M.providerDetails.open = true;
      M.syncProviderFold();
      M.notifyLayout();
    };
    M.syncMemoryBadge = function syncMemoryBadge() {
      var Mem = global.AgentMemory;
      var mem =
        typeof M.bridge.getMemory === 'function' ? M.bridge.getMemory() : null;
      var needs =
        Mem && typeof Mem.needsOnboarding === 'function' && Mem.needsOnboarding(mem);
      if (needs) {
        M.memoryBadge.hidden = false;
        M.memoryBadge.textContent = '\u00c0 aligner';
      } else {
        M.memoryBadge.hidden = true;
        M.memoryBadge.textContent = '';
      }
    };
    M.needsMemoryAlign = function needsMemoryAlign() {
      var Mem = global.AgentMemory;
      var mem =
        typeof M.bridge.getMemory === 'function' ? M.bridge.getMemory() : null;
      return !!(
        Mem &&
        typeof Mem.needsOnboarding === 'function' &&
        Mem.needsOnboarding(mem)
      );
    };
    M.mountMemoryUi = function mountMemoryUi(mode) {
      if (M.memoryUiBusy) return;
      var MemUI = global.MemoryUI;
      if (!MemUI || typeof MemUI.mount !== 'function') {
        M.setSettingsStatus(
          'Module m\u00e9moire indisponible sur cette page.',
          'fail'
        );
        return;
      }
      M.memoryUiBusy = true;
      M.memoryMountEl.hidden = false;
      M.memoryMountEl.innerHTML = '';
      M.memoryDetails.open = true;
      try {
        MemUI.mount(M.memoryMountEl, {
          t: M.t,
          mode: mode === 'onboarding' ? 'onboarding' : 'ongoing',
          showSkip: mode === 'onboarding',
          showSummary: true,
          embedded: true,
          onLayoutChange: M.notifyLayout,
          onSkip: function () {
            M.memoryMountEl.hidden = true;
            M.memoryMountEl.innerHTML = '';
            M.memoryUiMounted = false;
            M.syncMemoryBadge();
            M.notifyLayout();
          },
          onComplete: function (updated) {
            if (updated && M.onMemoryUpdate) M.onMemoryUpdate(updated);
            else if (updated) {
              M.bridge.getMemory = function () {
                return updated;
              };
            }
            M.memoryMountEl.hidden = true;
            M.memoryMountEl.innerHTML = '';
            M.memoryUiMounted = false;
            M.syncMemoryBadge();
            M.notifyLayout();
          }
        });
        M.memoryUiMounted = true;
      } catch (err) {
        console.error('AgentUI memory mount failed', err);
        M.setSettingsStatus('Impossible d\'ouvrir la m\u00e9moire.', 'fail');
      }
      M.memoryUiBusy = false;
      M.notifyLayout();
    };
    M.mountStatsPanel = function mountStatsPanel() {
      if (!M.Stats || typeof M.Stats.mountPanel !== 'function') {
        M.statsMountEl.replaceChildren();
        M.statsMountEl.appendChild(
          S.el('p', 'agent-settings-hint', {
            text: 'Module statistiques indisponible sur cette page.'
          })
        );
        return;
      }
      if (M.statsPanelCtl && typeof M.statsPanelCtl.destroy === 'function') {
        M.statsPanelCtl.destroy();
        M.statsPanelCtl = null;
      }
      M.statsMountEl.replaceChildren();
      M.statsPanelCtl = M.Stats.mountPanel(M.statsMountEl, {
        store: M.usageStore,
        onLayoutChange: M.notifyLayout,
        onReset: function () {
          if (!M.Stats || typeof M.Stats.reset !== 'function') {
            M.usageStore = M.Stats.emptyStore();
            return Promise.resolve(M.usageStore);
          }
          return M.Stats.reset(M.t).then(function (blank) {
            M.usageStore = blank;
            M.syncStatsBadge();
            return blank;
          });
        }
      });
      M.syncStatsBadge();
    };
    },
    run: function (M) {
    if (!M.cardEl) throw new Error('AgentUI.mount: cardEl required');
    M.options = M.options || {};
    M.t = M.options.t;
    M.Agent = global.PriorityAgent;
    if (!M.Agent) throw new Error('PriorityAgent is required');
    if (!global.PriorityUI) throw new Error('PriorityUI is required');
    M.assistantScope = M.Agent.normalizeAssistantScope
      ? M.Agent.normalizeAssistantScope(M.options.scope)
      : M.options.scope === 'project'
        ? 'project'
        : 'task';
    M.isProjectScope = M.assistantScope === 'project';
    M.standalone = !!M.options.standalone || M.isProjectScope;
    S.dbgLog('agentUi', 'mount.start', { scope: M.assistantScope, standalone: M.standalone });
    M.bridge = {
      getScope: M.options.getScope || function () { return M.assistantScope; },
      getCardName: M.options.getCardName || function () { return ''; },
      getCardDesc: M.options.getCardDesc || function () { return ''; },
      getFormulaKey: M.options.getFormulaKey || function () { return 'baseline'; },
      getPriorityState: M.options.getPriorityState || function () { return {}; },
      getCompletion: M.options.getCompletion || function () { return { items: [] }; },
      getMemory: M.options.getMemory || function () { return null; },
      getCardMemory: M.options.getCardMemory || function () { return null; },
      getProfile: M.options.getProfile || function () { return null; },
      getPeople: M.options.getPeople || function () { return null; },
      getPlaces: M.options.getPlaces || function () { return null; },
      refreshPeople:
        typeof M.options.refreshPeople === 'function'
          ? M.options.refreshPeople
          : null,
      getCustomAssigneeCatalog:
        typeof M.options.getCustomAssigneeCatalog === 'function'
          ? M.options.getCustomAssigneeCatalog
          : function () {
              if (
                global.PriorityUI &&
                typeof global.PriorityUI.getCustomAssigneeCatalog === 'function'
              ) {
                return global.PriorityUI.getCustomAssigneeCatalog();
              }
              return [];
            },
      upsertCustomAssigneeCatalog:
        typeof M.options.upsertCustomAssigneeCatalog === 'function'
          ? M.options.upsertCustomAssigneeCatalog
          : null,
      getBoardDigest: M.options.getBoardDigest || function () { return ''; },
      refreshBoardDigest:
        typeof M.options.refreshBoardDigest === 'function'
          ? M.options.refreshBoardDigest
          : null,
      getGoals: M.options.getGoals || function () { return null; },
      setProject: M.options.setProject || function () {
        return Promise.resolve({ ok: false, reason: 'no-setProject' });
      },
      applyPriority: M.options.applyPriority || function () {},
      applyCompletion: M.options.applyCompletion || function () {},
      playEffect: M.options.playEffect || function (name, opts) {
        if (
          global.CelebrationEffects &&
          typeof global.CelebrationEffects.play === 'function'
        ) {
          return global.CelebrationEffects.play(name, opts || {});
        }
        return { ok: false, error: 'CelebrationEffects indisponible' };
      },
      openSection: M.options.openSection || null,
      resolvePointTarget: M.options.resolvePointTarget || null,
      setFormulaKey: M.options.setFormulaKey || function () {},
      setCardName: M.options.setCardName || function () {
        return Promise.resolve({ ok: false, reason: 'no-setCardName' });
      },
      setCardDesc: M.options.setCardDesc || function () {
        return Promise.resolve({ ok: false, reason: 'no-setCardDesc' });
      },
      getStatut: M.options.getStatut || function () { return null; },
      getOwnership: M.options.getOwnership || function () { return null; },
      selectStatut: M.options.selectStatut || function () {
        return Promise.resolve({ ok: false, reason: 'no-selectStatut' });
      }
    };
    S.attachOptionalBridgeFns(M.bridge, M.options);
    M.onMemoryUpdate =
      typeof M.options.onMemoryUpdate === 'function' ? M.options.onMemoryUpdate : null;
    M.onCardMemoryUpdate =
      typeof M.options.onCardMemoryUpdate === 'function' ? M.options.onCardMemoryUpdate : null;
    M.onLayoutChange = M.options.onLayoutChange || function () {};
    M.initiallyOpen = M.standalone ? true : !!M.options.initiallyOpen;
    M.shouldFocusComposer = M.options.focusComposer != null
      ? !!M.options.focusComposer
      : M.initiallyOpen;
    M.preferComposer = !!M.options.preferComposer;
    M.openMemoryOnSettings =
      M.options.openMemoryOnSettings != null
        ? !!M.options.openMemoryOnSettings
        : false;
    M.provider = M.Agent.normalizeProvider(null);
    M.savedProvider = M.Agent.normalizeProvider(null);
    M.history = [];
    M.sessionModelTier = null;
    M.chatRestored = false;
    M.chatPersistTimer = null;
    M.chats =
      M.isProjectScope && M.options.chatList && global.AgentChats && global.AgentChatsUI
        ? global.AgentChats.createController({
            key: global.AgentChats.keyFor(M.options.chatList.key),
            storage: M.options.chatList.storage
          })
        : null;
    M.chatsUi = null;
    M.chatsBooted = false;
    M.pending = false;
    M.turnEstimateMs = 8000;
    M.chatTurnGen = 0;
    M.messageQueue = [];
    M.settingsOpen = false;
    M.testing = false;
    M.suggestionsSeq = 0;
    M.suggestionsMultiSelect = false;
    M.suggestionConfirmTimer = null;
    M.suggestionConfirmDeadline = 0;
    M.SUGGESTION_CONFIRM_MS = 5000;
    M.SUGGESTION_CONFIRM_PROMPTS = [
      'C\'est tout?',
      'Rien d\'autre?'
    ];
    M.applySuggestionsSeq = 0;
    M.applySuggestions = [];
    M.applySuggestionsLoading = false;
    M.interviewActive = false;
    M.interviewState = M.Agent.emptyCardInterview
      ? M.Agent.emptyCardInterview()
      : { complete: false, asked: [], startedAt: '', completedAt: '' };
    M.interviewSurrounding = [];
    M.interviewRecentCards = [];
    M.interviewPriorityTrusted = false;
    M.interviewBootstrapped = false;
    M.sanityBootstrapped = false;
    M.dreamDebounceTimer = null;
    M.dreamInFlight = false;
    M.dreamGen = 0;
    M.dreamDirty = false;
    M.verboseDescRewriteTried = false;
    M.unreadAssistant = 0;
    M.settleReady = false;
    M.listeningActive = false;
    M.listeningAnalyzing = false;
    M.listenTimer = null;
    M.listenDebounceTimer = null;
    M.listenFingerprint = '';
    M.listenBaselineContext = null;
    M.listenScanPreviousContext = null;
    M.listenMutedUntil = 0;
    M.listenCooldownUntil = 0;
    M.listenScanSeq = 0;
    M.activeOffer = null;
    M.dismissedOffers = {};
    M.lastListenSuggestions = [];
    M.awaitingFeedback = null;
    M.audioCtx = null;
    M.LISTEN_POLL_MS = 2000;
    M.LISTEN_DEBOUNCE_MS = 1400;
    M.LISTEN_COOLDOWN_MS = 14000;
    M.LISTEN_MUTE_MS = 1800;
    M.sessionStats = {
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      estimated: false,
      lastUsage: null
    };
    M.Stats = global.AgentStats;
    M.usageStore =
      M.Stats && typeof M.Stats.emptyStore === 'function' ? M.Stats.emptyStore() : null;
    M.usageSaver = null;
    M.statsPanelCtl = null;
    if (M.Stats && typeof M.Stats.createDebouncedSaver === 'function') {
      M.usageSaver = M.Stats.createDebouncedSaver(
        M.t,
        function () {
          return M.usageStore;
        },
        function (next) {
          M.usageStore = next;
          if (M.statsPanelCtl && typeof M.statsPanelCtl.refresh === 'function') {
            M.statsPanelCtl.refresh(M.usageStore);
          }
          M.syncStatsBadge();
        }
      );
    }
    M.syncStatsBadge = function () {
      /* replaced after stats fold DOM exists */
    };
    if (M.Stats && typeof M.Stats.load === 'function' && M.t) {
      M.Stats.load(M.t)
        .then(function (stored) {
          M.usageStore = stored;
          if (M.statsPanelCtl && typeof M.statsPanelCtl.refresh === 'function') {
            M.statsPanelCtl.refresh(M.usageStore);
          }
          M.syncStatsBadge();
        })
        .catch(function (err) {
          console.error('AgentUI: AgentStats.load failed', err);
        });
    }
    M.section = S.el('div', 'variant-chat-section' + (M.standalone ? ' variant-chat-section--standalone' : ''));
    M.field = S.el('div', 'field field--chat' + (M.standalone ? ' is-enabled' : ''));
    M.agentIdentity = {
      agentName: '',
      agentPersonality: '',
      agentColor: 'orange',
      agentFace: 'classic'
    };
    M.settingsBtn = S.el('button', 'agent-settings-btn', {
      type: 'button',
      'aria-label': 'Param\u00e8tres de l\'assistant',
      title: 'Param\u00e8tres'
    });
    M.settingsIcon = S.el('i', 'ti ti-settings');
    M.settingsIcon.setAttribute('aria-hidden', 'true');
    M.settingsBtn.appendChild(M.settingsIcon);
    M.chatsToggleBtn = null;
    M.chatsNewBtn = null;
    if (M.chats) {
      M.chatsToggleBtn = S.el('button', 'agent-settings-btn agent-chats-head-toggle', {
        type: 'button',
        'aria-label': 'Conversations',
        title: 'Conversations',
        'aria-expanded': 'false'
      });
      M.chatsToggleIcon = S.el('i', 'ti ti-layout-sidebar');
      M.chatsToggleIcon.setAttribute('aria-hidden', 'true');
      M.chatsToggleBtn.appendChild(M.chatsToggleIcon);
      M.chatsNewBtn = S.el('button', 'agent-settings-btn agent-chats-head-new', {
        type: 'button',
        'aria-label': 'Nouvelle conversation',
        title: 'Nouvelle conversation'
      });
      M.chatsNewIcon = S.el('i', 'ti ti-plus');
      M.chatsNewIcon.setAttribute('aria-hidden', 'true');
      M.chatsNewBtn.appendChild(M.chatsNewIcon);
    }
    M.chrome;
    if (M.standalone) {
      // Full-page / project Assistant: static header (no collapse chevron).
      M.head = S.el('div', 'section-toggle-head agent-standalone-head');
      M.heading = S.el('div', 'agent-standalone-heading');
      M.leadingIconEl = S.el('span', 'section-leading-icon chat-leading-icon');
      M.leadingIconEl.setAttribute('aria-hidden', 'true');
      M.iconGlyph = S.el('i', 'ti ti-message-chatbot section-leading-icon-glyph');
      M.iconGlyph.setAttribute('aria-hidden', 'true');
      M.leadingIconEl.appendChild(M.iconGlyph);
      M.heading.appendChild(M.leadingIconEl);
      M.textWrap = S.el('span', 'section-enable-text');
      M.titleEl = S.el('span', 'section-enable-title chat-enable-title', {
        text: 'Assistant'
      });
      M.textWrap.appendChild(M.titleEl);
      M.heading.appendChild(M.textWrap);
      M.head.appendChild(M.heading);
      if (M.chats) {
        M.head.insertBefore(M.chatsToggleBtn, M.heading);
        M.head.appendChild(M.chatsNewBtn);
      }
      M.head.appendChild(M.settingsBtn);
      M.field.appendChild(M.head);
      M.chrome = {
        head: M.head,
        label: null,
        checkbox: null,
        leadingIcon: M.leadingIconEl,
        title: M.titleEl,
        summary: null,
        collapseBtn: null,
        collapseLabel: '',
        expandLabel: '',
        enableLabel: ''
      };
    } else {
      M.chrome = PriorityUI.createCollapsibleEnableChrome({
        title: 'Assistant',
        bodyId: 'agent-chat-body',
        hideEnable: true,
        leadingIcon: 'ti-message-chatbot',
        iconClass: 'chat-leading-icon',
        titleClass: 'chat-enable-title',
        collapseLabel: 'Replier Assistant',
        expandLabel: 'D\u00e9velopper Assistant'
      });
      M.field.appendChild(M.chrome.head);
      // Gear left of the enable checkbox (checkbox stays on the far right).
      if (M.chrome.label) {
        M.chrome.head.insertBefore(M.settingsBtn, M.chrome.label);
      } else {
        M.chrome.head.appendChild(M.settingsBtn);
      }
    }
    M.body = S.el(
      'div',
      'agent-chat-body' + (M.standalone ? '' : ' section-toggle-body')
    );
    M.body.id = 'agent-chat-body';
    M.body.hidden = !M.standalone;
    M.settingsPanel = S.el('div', 'agent-settings');
    M.settingsPanel.hidden = true;
    M.charTitle = S.el('h4', 'agent-settings-title', { text: 'Caract\u00e8re' });
    M.settingsPanel.appendChild(M.charTitle);
    M.agentAvatarPreview = S.el('div', 'agent-avatar-preview', {
      'aria-label': 'Aper\u00e7u de l\'avatar'
    });
    M.agentAvatarPreviewFaceHost = S.el('div', 'agent-avatar-preview-face');
    M.agentAvatarPreviewMeta = S.el('div', 'agent-avatar-preview-meta');
    M.agentAvatarPreviewName = S.el('span', 'agent-avatar-preview-name');
    M.agentAvatarPreviewCaption = S.el('span', 'agent-avatar-preview-caption', {
      text: 'Aper\u00e7u'
    });
    M.agentAvatarPreviewMeta.appendChild(M.agentAvatarPreviewName);
    M.agentAvatarPreviewMeta.appendChild(M.agentAvatarPreviewCaption);
    M.agentAvatarPreview.appendChild(M.agentAvatarPreviewFaceHost);
    M.agentAvatarPreview.appendChild(M.agentAvatarPreviewMeta);
    M.settingsPanel.appendChild(M.agentAvatarPreview);
    M.agentNameInput = S.el('input', 'agent-input', {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'true',
      maxlength: '40',
      placeholder: 'ex. Clementine'
    });
    M.agentColorPickerHost = S.el('div', 'agent-color-picker');
    M.agentColorPicker = null;
    M.agentFacePicker = S.el('div', 'agent-face-picker', {
      role: 'radiogroup',
      'aria-label': 'Visage de l\'assistant'
    });
    M.agentPersonalityInput = S.el('textarea', 'agent-input agent-personality-input', {
      rows: '4',
      maxlength: String(
        (global.UserProfile && global.UserProfile.MAX_AGENT_PERSONALITY) || 900
      ),
      placeholder: 'ex. Pote attentionn\u00e9, peu fan de productivit\u00e9\u2026'
    });
    M.settingsPanel.appendChild(M.labeledInput('Nom', M.agentNameInput));
    M.faceField = S.el('div', 'agent-field');
    M.faceField.appendChild(S.el('span', 'agent-field-label', { text: 'Visage' }));
    M.faceField.appendChild(M.agentFacePicker);
    M.settingsPanel.appendChild(M.faceField);
    M.colorField = S.el('div', 'agent-field');
    M.colorField.appendChild(S.el('span', 'agent-field-label', { text: 'Couleur' }));
    M.colorField.appendChild(M.agentColorPickerHost);
    M.settingsPanel.appendChild(M.colorField);
    M.personalityField = S.el('div', 'agent-field');
    M.personalityLabelRow = S.el('div', 'agent-field-label-row');
    M.personalityLabelRow.appendChild(
      S.el('span', 'agent-field-label', { text: 'Personnalit\u00e9' })
    );
    M.rerollPersonalityBtn = S.el('button', 'agent-field-dice', {
      type: 'button',
      'aria-label': 'Personnalit\u00e9 al\u00e9atoire',
      title: 'Personnalit\u00e9 al\u00e9atoire'
    });
    M.rerollPersonalityIcon = S.el('i', 'ti ti-dice');
    M.rerollPersonalityIcon.setAttribute('aria-hidden', 'true');
    M.rerollPersonalityBtn.appendChild(M.rerollPersonalityIcon);
    M.personalityLabelRow.appendChild(M.rerollPersonalityBtn);
    M.personalityField.appendChild(M.personalityLabelRow);
    M.personalityField.appendChild(M.agentPersonalityInput);
    M.settingsPanel.appendChild(M.personalityField);
    M.charActions = S.el('div', 'agent-settings-actions agent-char-actions');
    M.rerollNameBtn = S.el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Nouveau nom'
    });
    M.rerollColorBtn = S.el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Couleur al\u00e9atoire'
    });
    M.charActions.appendChild(M.rerollNameBtn);
    M.charActions.appendChild(M.rerollColorBtn);
    M.settingsPanel.appendChild(M.charActions);
    M.providerDetails = S.el('details', 'agent-settings-fold agent-settings-provider');
    M.providerSummary = S.el('summary', 'agent-settings-fold-summary');
    M.providerSummary.appendChild(
      S.el('span', 'agent-settings-fold-title', { text: 'Fournisseur IA' })
    );
    M.providerBadge = S.el('span', 'agent-settings-fold-badge');
    M.providerBadge.hidden = true;
    M.providerSummary.appendChild(M.providerBadge);
    M.providerDetails.appendChild(M.providerSummary);
    M.providerBody = S.el('div', 'agent-settings-fold-body');
    M.presetRow = S.el('div', 'agent-preset-row', { role: 'group', 'aria-label': 'Pr\u00e9r\u00e9glages' });
    M.presetButtons = {};
    ['openai', 'openrouter', 'custom'].forEach(function (id) {
      var preset = M.Agent.PRESETS[id];
      var btn = S.el('button', 'agent-preset-btn', { type: 'button', 'data-preset': id });
      btn.textContent = preset.label;
      btn.addEventListener('click', function () {
        M.applyPreset(id);
      });
      M.presetButtons[id] = btn;
      M.presetRow.appendChild(btn);
    });
    M.providerBody.appendChild(M.presetRow);
    M.apiKeyInput = S.el('input', 'agent-input', {
      type: 'password',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'sk-…'
    });
    M.baseUrlInput = S.el('input', 'agent-input', {
      type: 'url',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'https://api.openai.com/v1'
    });
    M.apiKeyForm = S.el('form', 'agent-field-form', { autocomplete: 'off' });
    M.apiKeyForm.addEventListener('submit', function (e) {
      e.preventDefault();
    });
    M.modelSelect = S.el('select', 'agent-input agent-model-select', {
      'aria-label': 'Mod\u00e8le OpenAI'
    });
    (M.Agent.OPENAI_MODELS || []).forEach(function (m) {
      var opt = S.el('option', null, { value: m.id, text: m.label || m.id });
      M.modelSelect.appendChild(opt);
    });
    M.modelInput = S.el('input', 'agent-input', {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'gpt-5.4-mini'
    });
    M.modelSelectField = M.labeledInput('Mod\u00e8le', M.modelSelect);
    M.modelInputField = M.labeledInput('Mod\u00e8le', M.modelInput);
    M.apiKeyForm.appendChild(M.labeledInput('Cl\u00e9 API', M.apiKeyInput));
    M.providerBody.appendChild(M.apiKeyForm);
    M.providerBody.appendChild(M.labeledInput('URL de base', M.baseUrlInput));
    M.providerBody.appendChild(M.modelSelectField);
    M.providerBody.appendChild(M.modelInputField);
    M.STATUS_PREF_STORAGE_KEY = 'trello-priority-powerup/agent-status';
    M.LEGACY_DEBUG_PREF_STORAGE_KEY = 'trello-priority-powerup/agent-debug-enabled';
    M.STATUS_LEVELS = ['none', 'standard', 'full'];
    M.STATUS_LABELS = {
      none: 'Aucun',
      standard: 'Standard',
      full: 'Complet'
    };
    M.statusLevel = M.loadStatusLevel();
    M.statusSelect = S.el('select', 'agent-input agent-status-select', {
      'aria-label': 'Afficher le statut'
    });
    M.STATUS_LEVELS.forEach(function (id) {
      M.statusSelect.appendChild(
        S.el('option', null, { value: id, text: M.STATUS_LABELS[id] || id })
      );
    });
    M.statusSelect.value = M.statusLevel;
    M.providerBody.appendChild(M.labeledInput('Afficher le statut', M.statusSelect));
    M.settingsActions = S.el('div', 'agent-settings-actions');
    M.saveBtn = S.el('button', 'tp-button agent-btn', { type: 'button', text: 'Enregistrer' });
    M.testBtn = S.el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Tester le fournisseur'
    });
    M.settingsActions.appendChild(M.saveBtn);
    M.settingsActions.appendChild(M.testBtn);
    M.providerBody.appendChild(M.settingsActions);
    M.settingsStatus = S.el('p', 'agent-settings-status');
    M.settingsStatus.hidden = true;
    M.providerBody.appendChild(M.settingsStatus);
    M.testResultsEl = S.el('ul', 'agent-test-results');
    M.testResultsEl.hidden = true;
    M.providerBody.appendChild(M.testResultsEl);
    M.providerDetails.appendChild(M.providerBody);
    M.settingsPanel.appendChild(M.providerDetails);
    M.providerDetails.addEventListener('toggle', function () {
      M.syncProviderFold();
      M.notifyLayout();
    });
    M.memoryDetails = S.el('details', 'agent-settings-fold agent-settings-memory');
    M.memorySummary = S.el('summary', 'agent-settings-fold-summary');
    M.memorySummary.appendChild(S.el('span', 'agent-settings-fold-title', { text: 'M\u00e9moire' }));
    M.memoryBadge = S.el('span', 'agent-settings-fold-badge');
    M.memoryBadge.hidden = true;
    M.memorySummary.appendChild(M.memoryBadge);
    M.memoryDetails.appendChild(M.memorySummary);
    M.memoryBody = S.el('div', 'agent-settings-fold-body');
    M.memoryActions = S.el('div', 'agent-settings-actions agent-memory-actions');
    M.memoryAlignBtn = S.el('button', 'tp-button agent-btn agent-btn--secondary', {
      type: 'button',
      text: 'Aligner la m\u00e9moire'
    });
    M.memoryChatBtn = S.el('button', 'tp-button agent-btn', {
      type: 'button',
      text: 'Ouvrir la m\u00e9moire'
    });
    M.memoryActions.appendChild(M.memoryAlignBtn);
    M.memoryActions.appendChild(M.memoryChatBtn);
    M.memoryBody.appendChild(M.memoryActions);
    M.memoryMountEl = S.el('div', 'agent-settings-memory-mount');
    M.memoryMountEl.hidden = true;
    M.memoryBody.appendChild(M.memoryMountEl);
    M.memoryDetails.appendChild(M.memoryBody);
    M.settingsPanel.appendChild(M.memoryDetails);
    M.memoryUiMounted = false;
    M.memoryUiBusy = false;
    M.memoryAlignBtn.addEventListener('click', function (e) {
      e.preventDefault();
      M.mountMemoryUi('onboarding');
    });
    M.memoryChatBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var Mem = global.AgentMemory;
      var mem =
        typeof M.bridge.getMemory === 'function' ? M.bridge.getMemory() : null;
      var needs =
        Mem && typeof Mem.needsOnboarding === 'function' && Mem.needsOnboarding(mem);
      M.mountMemoryUi(needs ? 'onboarding' : 'ongoing');
    });
    M.memoryDetails.addEventListener('toggle', function () {
      M.syncMemoryBadge();
      M.notifyLayout();
    });
    M.syncMemoryBadge();
    M.syncProviderFold();
    M.statsDetails = S.el('details', 'agent-settings-fold agent-settings-stats');
    M.statsSummary = S.el('summary', 'agent-settings-fold-summary');
    M.statsSummary.appendChild(
      S.el('span', 'agent-settings-fold-title', { text: 'Statistiques' })
    );
    M.statsBadge = S.el('span', 'agent-settings-fold-badge');
    M.statsBadge.hidden = true;
    M.statsSummary.appendChild(M.statsBadge);
    M.statsDetails.appendChild(M.statsSummary);
    M.statsBody = S.el('div', 'agent-settings-fold-body');
    M.statsMountEl = S.el('div', 'agent-settings-stats-mount');
    M.statsBody.appendChild(M.statsMountEl);
    M.statsDetails.appendChild(M.statsBody);
    M.settingsPanel.appendChild(M.statsDetails);
    M.syncStatsBadge = function () {
      if (!M.usageStore || !M.Stats || typeof M.Stats.formatCostUsd !== 'function') {
        M.statsBadge.hidden = true;
        M.statsBadge.textContent = '';
        return;
      }
      var life = M.usageStore.life || {};
      if (!life.turns) {
        M.statsBadge.hidden = true;
        M.statsBadge.textContent = '';
        return;
      }
      M.statsBadge.hidden = false;
      M.statsBadge.textContent = '\u2248' + M.Stats.formatCostUsd(life.cost || 0);
    };
    M.statsDetails.addEventListener('toggle', function () {
      if (M.statsDetails.open) M.mountStatsPanel();
      M.syncStatsBadge();
      M.notifyLayout();
    });
    M.syncStatsBadge();
    M.doneWrap = S.el('div', 'agent-settings-done');
    M.doneBtn = S.el('button', 'tp-button agent-btn', {
      type: 'button',
      text: 'Termin\u00e9'
    });
    M.doneWrap.appendChild(M.doneBtn);
    M.settingsPanel.appendChild(M.doneWrap);
    M.body.appendChild(M.settingsPanel);
    M.chatPanel = S.el('div', 'agent-chat-panel');
    M.listenFaceMode = null;
    M.emptyState = S.el('div', 'agent-empty');
    M.emptyConfigBtn = S.el('button', 'tp-link agent-empty-config', {
      type: 'button',
      text: 'Configurer le fournisseur'
    });
    M.emptyState.appendChild(M.emptyConfigBtn);
    M.chatPanel.appendChild(M.emptyState);
    M.messagesEl = S.el('div', 'agent-messages', { role: 'log', 'aria-live': 'polite' });
    M.chatPanel.appendChild(M.messagesEl);
    M.followUpsEl = S.el('div', 'agent-followups', { role: 'group', 'aria-label': 'Actions rapides' });
    M.followUpsEl.hidden = true;
    M.chatPanel.appendChild(M.followUpsEl);
    M.promptsEl = S.el('div', 'agent-prompts', {
      role: 'group',
      'aria-label': 'Contr\u00f4les interactifs'
    });
    M.promptsEl.hidden = true;
    M.chatPanel.appendChild(M.promptsEl);
    M.suggestionsEl = S.el('div', 'agent-suggestions', {
      role: 'group',
      'aria-label': 'Questions sugg\u00e9r\u00e9es'
    });
    M.suggestionsEl.hidden = true;
    M.composer = S.el('div', 'agent-composer');
    M.input = S.el('textarea', 'agent-composer-input', {
      rows: M.standalone ? '4' : '2',
      placeholder: 'Demandez ce que vous voulez',
      'aria-label': 'Message \u00e0 l\'assistant'
    });
    M.MODEL_MODE_OPTIONS = [
      { id: 'auto', label: 'Auto' },
      { id: 'efficient', label: '\u00c9conome' },
      { id: 'balanced', label: '\u00c9quilibr\u00e9' },
      { id: 'capable', label: 'Puissant' }
    ];
    M.modelModeSelect = S.el('select', 'agent-model-mode-select', {
      'aria-label': 'Mode co\u00fbt / finesse',
      title: 'Mode co\u00fbt / finesse'
    });
    M.MODEL_MODE_OPTIONS.forEach(function (m) {
      M.modelModeSelect.appendChild(
        S.el('option', null, { value: m.id, text: m.label })
      );
    });
    M.modelModeSelect.addEventListener('change', function () {
      var nextMode =
        typeof M.Agent.normalizeModelMode === 'function'
          ? M.Agent.normalizeModelMode(M.modelModeSelect.value)
          : M.modelModeSelect.value || 'auto';
      M.provider = M.Agent.normalizeProvider(
        Object.assign({}, M.provider, { modelMode: nextMode })
      );
      M.modelModeSelect.value = M.provider.modelMode || 'auto';
      if (!M.t) return;
      M.Agent.saveProvider(M.t, M.provider)
        .then(function (saved) {
          M.provider = M.Agent.normalizeProvider(saved);
          M.savedProvider = M.Agent.normalizeProvider(saved);
        })
        .catch(function (err) {
          console.error('AgentUI: modelMode save failed', err);
        });
    });
    M.sendBtn = S.el('button', 'tp-button agent-send-btn', {
      type: 'button',
      'aria-label': 'Envoyer'
    });
    M.sendBtnLabel = S.el('span', 'agent-send-btn-label');
    M.sendBtnLabel.textContent = 'Envoyer';
    M.sendConfirmCount = S.el('span', 'agent-send-btn-count');
    M.sendConfirmCount.hidden = true;
    M.sendBtnIcon = S.el('i', 'ti ti-send agent-send-btn-icon');
    M.sendBtnIcon.setAttribute('aria-hidden', 'true');
    M.sendBtn.appendChild(M.sendBtnIcon);
    M.sendBtn.appendChild(M.sendBtnLabel);
    M.sendBtn.appendChild(M.sendConfirmCount);
    M.composerSuggestions = [];
    M.tabComplete = null;
    if (global.TabAutocomplete && typeof global.TabAutocomplete.wrapField === 'function') {
      M.wrappedComposer = global.TabAutocomplete.wrapField(M.input);
      M.composer.appendChild(M.wrappedComposer.wrap);
      M.tabComplete = global.TabAutocomplete.bind({
        field: M.input,
        wrapEl: M.wrappedComposer.wrap,
        ghostEl: M.wrappedComposer.ghost,
        getCandidates: function () {
          return M.composerSuggestions.slice();
        },
        isEnabled: function () {
          return !M.input.disabled;
        },
        onProposal: function (proposal) {
          M.markSuggestionTabTarget(
            proposal && proposal.candidate ? proposal.candidate.text : ''
          );
        }
      });
    } else {
      M.composer.appendChild(M.input);
    }
    M.modelModeWrap = S.el('span', 'agent-model-mode-wrap');
    M.modelModeIcon = S.el('i', 'ti ti-bolt agent-model-mode-icon');
    M.modelModeIcon.setAttribute('aria-hidden', 'true');
    M.modelModeWrap.appendChild(M.modelModeIcon);
    M.modelModeWrap.appendChild(M.modelModeSelect);
    M.composer.appendChild(M.sendBtn);
    M.composerFoot = S.el('div', 'agent-composer-foot');
    if (
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildAgentComposerItems === 'function'
    ) {
      ContextMenu.bind(M.composer, function () {
        return ContextMenu.buildAgentComposerItems({
          sendDisabled: !!M.sendBtn.disabled,
          currentMode: M.modelModeSelect.value || 'auto',
          modes: M.MODEL_MODE_OPTIONS,
          onSend: function () {
            if (typeof M.onSend === 'function') M.onSend();
          },
          onSetMode: function (modeId) {
            var nextMode =
              typeof M.Agent.normalizeModelMode === 'function'
                ? M.Agent.normalizeModelMode(modeId)
                : modeId || 'auto';
            M.provider = M.Agent.normalizeProvider(
              Object.assign({}, M.provider, { modelMode: nextMode })
            );
            M.modelModeSelect.value = M.provider.modelMode || 'auto';
            if (!M.t) return;
            M.Agent.saveProvider(M.t, M.provider)
              .then(function (saved) {
                M.provider = M.Agent.normalizeProvider(saved);
                M.savedProvider = M.Agent.normalizeProvider(saved);
              })
              .catch(function (err) {
                console.error('AgentUI: modelMode save failed', err);
              });
          },
        });
      });
    }
    M.guideHost = S.el('div', 'ag-guide-host');
    M.guideHost.hidden = true;
    M.chatPanel.appendChild(M.guideHost);
    M.chatPanel.appendChild(M.suggestionsEl);
    M.chatPanel.appendChild(M.composer);
    M.chatPanel.appendChild(M.composerFoot);
    M.interviewBar = S.el('div', 'agent-interview-bar');
    M.interviewBar.hidden = true;
    M.interviewSkipBtn = S.el('button', 'agent-interview-skip', {
      type: 'button',
      'aria-label': 'Ignorer la configuration initiale',
      title: 'Ignorer la configuration initiale'
    });
    M.interviewSkipIcon = S.el('i', 'ti ti-x');
    M.interviewSkipIcon.setAttribute('aria-hidden', 'true');
    M.interviewSkipBtn.appendChild(M.interviewSkipIcon);
    M.interviewSkipBtn.appendChild(
      S.el('span', 'agent-interview-skip-label', { text: 'Passer la configuration' })
    );
    M.interviewBar.appendChild(M.interviewSkipBtn);
    M.composerFoot.appendChild(M.interviewBar);
    M.applySection = S.el('div', 'agent-apply-suggestions');
    M.applySection.hidden = true;
    if (M.isProjectScope) {
      M.applySection.style.display = 'none';
    }
    M.applyHead = S.el('div', 'agent-apply-suggestions-head');
    M.applyRefreshBtn = S.el('button', 'agent-apply-suggestions-refresh', {
      type: 'button',
      'aria-label': 'Rafra\u00eechir les suggestions',
      title: 'Rafra\u00eechir'
    });
    M.applyRefreshBtn.textContent = '\u21bb';
    M.applyHead.appendChild(M.applyRefreshBtn);
    M.applySection.appendChild(M.applyHead);
    M.applyListEl = S.el('div', 'agent-apply-suggestions-list', {
      role: 'list',
      'aria-label': 'Suggestions applicables'
    });
    M.applySection.appendChild(M.applyListEl);
    M.applyStatusEl = S.el('p', 'agent-apply-suggestions-status');
    M.applyStatusEl.hidden = true;
    M.applySection.appendChild(M.applyStatusEl);
    M.chatPanel.appendChild(M.applySection);
    M.infoEl = S.el('div', 'agent-chat-info', {
      'aria-label': 'Informations de la conversation'
    });
    M.infoHead = S.el('div', 'agent-chat-info-head');
    M.statsEl = S.el('div', 'agent-chat-stats', {
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Statistiques de la conversation'
    });
    M.infoHead.appendChild(M.statsEl);
    M.infoExpanded = false;
    M.infoToggleBtn = S.el('button', 'agent-info-toggle', {
      type: 'button',
      'aria-label': 'Afficher les détails',
      title: 'Détails',
      'aria-expanded': 'false'
    });
    M.infoToggleIcon = S.el('i', 'ti ti-chevron-down');
    M.infoToggleIcon.setAttribute('aria-hidden', 'true');
    M.infoToggleBtn.appendChild(M.infoToggleIcon);
    M.infoToggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      M.infoExpanded = !M.infoExpanded;
      M.infoToggleBtn.setAttribute('aria-expanded', M.infoExpanded ? 'true' : 'false');
      M.infoToggleBtn.classList.toggle('is-open', M.infoExpanded);
      M.infoToggleIcon.className = 'ti ' + (M.infoExpanded ? 'ti-chevron-up' : 'ti-chevron-down');
      M.infoBody.hidden = !M.infoExpanded;
      M.statsEl.classList.toggle('is-expanded', M.infoExpanded);
      M.renderChatStats();
    });
    M.infoHead.appendChild(M.infoToggleBtn);
    M.copyDebugBtn = S.el('button', 'agent-debug-btn', {
      type: 'button',
      'aria-label': 'Copier la conversation pour le d\u00e9bogage',
      title: 'Copier pour le d\u00e9bogage'
    });
    M.copyDebugIcon = S.el('i', 'ti ti-copy');
    M.copyDebugIcon.setAttribute('aria-hidden', 'true');
    M.copyDebugBtn.appendChild(M.copyDebugIcon);
    M.copyDebugBtn.addEventListener('click', function (e) {
      e.preventDefault();
      var text = M.Agent.buildChatDebugExport({
        provider: M.provider,
        history: M.history,
        debugLog: M.debugLog,
        statusLevel: M.statusLevel
      });
      M.copyTextToClipboard(text).then(function (ok) {
        if (!ok) {
          M.errorEl.textContent = 'Copie impossible.';
          M.errorEl.hidden = false;
          return;
        }
        M.copyDebugIcon.className = 'ti ti-check';
        clearTimeout(M.copyDebugBtn._copyReset);
        M.copyDebugBtn._copyReset = setTimeout(function () {
          M.copyDebugIcon.className = 'ti ti-copy';
        }, 1400);
      });
    });
    M.infoHead.appendChild(M.copyDebugBtn);
    M.debugBtn = S.el('button', 'agent-debug-btn', {
      type: 'button',
      'aria-label': 'Panneau de d\u00e9bogage',
      title: 'D\u00e9bogage',
      'aria-expanded': 'false'
    });
    M.debugBtn.hidden = M.statusLevel !== 'full';
    M.debugIcon = S.el('i', 'ti ti-bug');
    M.debugIcon.setAttribute('aria-hidden', 'true');
    M.debugBtn.appendChild(M.debugIcon);
    M.infoHead.appendChild(M.debugBtn);
    M.schedTasks = [];
    M.schedTimer = null;
    M.schedWrap = S.el('div', 'agent-sched');
    M.schedWrap.hidden = true;
    M.schedBtn = S.el('button', 'agent-debug-btn', {
      type: 'button',
      'aria-label': 'Rappels',
      title: 'Rappels',
      'aria-expanded': 'false'
    });
    M.schedIcon = S.el('i', 'ti ti-alarm');
    M.schedIcon.setAttribute('aria-hidden', 'true');
    M.schedBtn.appendChild(M.schedIcon);
    M.schedCount = S.el('span', 'agent-sched-count');
    M.schedCount.setAttribute('aria-hidden', 'true');
    M.schedBtn.appendChild(M.schedCount);
    M.schedPop = S.el('div', 'agent-sched-pop');
    M.schedPop.hidden = true;
    M.schedWrap.appendChild(M.schedBtn);
    M.schedWrap.appendChild(M.schedPop);
    M.infoHead.appendChild(M.schedWrap);
    M.infoEl.appendChild(M.infoHead);
    M.infoBody = S.el('div', 'agent-chat-info-body');
    M.infoBody.hidden = true;
    M.infoBody.appendChild(M.modelModeWrap);
    M.infoEl.appendChild(M.infoBody);
    M.chatPanel.appendChild(M.infoEl);
    M.errorEl = S.el('p', 'agent-error');
    M.errorEl.hidden = true;
    M.chatPanel.appendChild(M.errorEl);
    M.debugPanel = S.el('div', 'agent-debug-panel', {
      role: 'region',
      'aria-label': 'Panneau de d\u00e9bogage'
    });
    M.debugPanel.hidden = true;
    M.chatPanel.appendChild(M.debugPanel);
    M.body.appendChild(M.chatPanel);
    if (M.standalone) {
      M.shell = S.el('div', 'section-toggle-shell');
      M.field.appendChild(M.shell);
      M.shell.appendChild(M.body);
    } else {
      M.field.appendChild(M.body);
    }
    M.section.appendChild(M.field);
    M.chatsLayout = null;
    if (M.chats) {
      M.chatsLayout = S.el('div', 'agent-chats-layout');
      M.chatsAside = S.el('aside');
      M.chatsLayout.appendChild(M.chatsAside);
      M.chatsLayout.appendChild(M.section);
      M.cardEl.appendChild(M.chatsLayout);
      M.chatsUi = global.AgentChatsUI.mount(M.chatsAside, {
        getView: function () {
          return M.chats.view();
        },
        isLocked: M.chatBusy,
        onNew: M.newConversation,
        onOpen: M.openConversation,
        onArchive: M.archiveConversation,
        onRestore: M.restoreConversation
      });
      M.chats.onChange(function () {
        M.chatsUi.render();
      });
      M.setChatsOpen(M.readChatsOpen(), false);
      M.chatsToggleBtn.addEventListener('click', function () {
        M.setChatsOpen(!M.chatsLayout.classList.contains('is-chats-open'), true);
      });
      M.chatsNewBtn.addEventListener('click', M.newConversation);
    } else {
      M.cardEl.appendChild(M.section);
    }
    M.debugOpen = false;
    M.debugLog = [];
    M.selectedDebugId = null;
    M.expandFallback =
      M.options.initiallyOpen != null ? !!M.options.initiallyOpen : true;
    M.expandChat = M.standalone
      ? true
      : typeof PriorityUI.resolveSectionExpanded === 'function'
        ? PriorityUI.resolveSectionExpanded('chat', M.expandFallback)
        : M.expandFallback;
    M.collapse;
    if (M.standalone) {
      M.collapse = {
        isExpanded: function () {
          return true;
        },
        setExpanded: function () {},
        isEnabled: function () {
          return true;
        },
        setEnabled: function () {},
        refreshSummary: function () {}
      };
    } else {
      M.collapse = PriorityUI.bindCollapsibleEnable({
      field: M.field,
      body: M.body,
      chrome: M.chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: M.expandChat,
      getSummary: function () {
        if (M.applySuggestionsLoading || M.listeningAnalyzing) return 'Analyse\u2026';
        if (M.activeOffer) return 'Suggestion';
        if (M.applySuggestions.length) {
          return S.formatFrCountLabel(
            M.applySuggestions.length,
            'suggestion',
            'suggestions'
          );
        }
        if (M.unreadAssistant > 0) {
          return M.unreadAssistant === 1
            ? 'Nouveau message'
            : S.formatFrCountLabel(M.unreadAssistant, 'nouveau', 'nouveaux');
        }
        if (!M.Agent.isConfigured(M.provider)) return 'Non configur\u00e9';
        if (!M.Agent.isVerified(M.provider)) return 'Non v\u00e9rifi\u00e9';
        if (M.listeningActive) return 'À l\u2019écoute';
        if (M.isProjectScope) return 'Projet';
        return '';
      },
      onLayoutChange: M.onLayoutChange,
      onEnableChange: function (on) {
        if (!on && M.settingsOpen) M.setSettingsOpen(false);
      },
      onExpandChange: function (isExpanded) {
        if (isExpanded && M.unreadAssistant) {
          M.unreadAssistant = 0;
          M.syncApplySummary();
        }
        if (!M.standalone && typeof PriorityUI.saveSectionCollapseState === 'function') {
          PriorityUI.saveSectionCollapseState({ chat: !!isExpanded });
        }
        // Dock/reparent first (options.onExpandChange) — that resets scrollTop.
        if (typeof M.options.onExpandChange === 'function') {
          M.options.onExpandChange(!!isExpanded);
        }
        if (isExpanded) M.scrollMessagesToBottom();
      },
      getContextMenuItems: function (api) {
        if (
          !global.ContextMenu ||
          typeof global.ContextMenu.buildAgentItems !== 'function'
        ) {
          return [];
        }
        return ContextMenu.buildAgentItems({
          isExpanded: api.isExpanded,
          setExpanded: api.setExpanded,
          collapseLabel: 'Replier Assistant',
          expandLabel: 'D\u00e9velopper Assistant',
          openSettings: function (opts) {
            M.setSettingsOpen(true);
            if (opts && opts.memory) {
              M.memoryDetails.open = true;
              if (typeof M.syncMemoryBadge === 'function') M.syncMemoryBadge();
              if (opts.mountMemory && typeof M.mountMemoryUi === 'function') {
                M.mountMemoryUi(
                  opts.mountMemory === 'onboarding' ? 'onboarding' : 'ongoing'
                );
              }
            }
          },
          focusComposer: M.openAndFocusComposer,
        });
      },
    });
    }
    if (
      M.standalone &&
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildAgentItems === 'function'
    ) {
      ContextMenu.bind(M.chrome.head, function () {
        return ContextMenu.buildAgentItems({
          hideCollapse: true,
          openSettings: function (opts) {
            M.setSettingsOpen(true);
            if (opts && opts.memory) {
              M.memoryDetails.open = true;
              if (typeof M.syncMemoryBadge === 'function') M.syncMemoryBadge();
              if (opts.mountMemory && typeof M.mountMemoryUi === 'function') {
                M.mountMemoryUi(
                  opts.mountMemory === 'onboarding' ? 'onboarding' : 'ongoing'
                );
              }
            }
          },
          focusComposer: M.openAndFocusComposer,
        });
      });
    }
    }
  });
})(typeof window !== 'undefined' ? window : this);
