/**
 * Member profile — personal preferences & feature flags for a custom Priorité experience.
 * Stored at member/private (same privacy lane as agentProvider).
 * Exposes window.UserProfile (no bundler).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'userProfile';
  var MAX_NAME = 80;
  var MAX_ROLE = 80;
  var MAX_NOTES = 400;

  var FEATURE_KEYS = [
    'info',
    'statut',
    'objectif',
    'priority',
    'graph',
    'progress',
    'due',
    'blocked',
    'assistant'
  ];

  var FEATURE_LABELS = {
    info: 'Information',
    statut: 'Statut',
    objectif: 'Objectif',
    priority: 'Priorité',
    graph: 'Graphique',
    progress: 'Progrès',
    due: 'Échéance',
    blocked: 'Bloqué',
    assistant: 'Assistant'
  };

  var TONE_KEYS = ['concise', 'detailed', 'friendly'];
  var TONE_LABELS = {
    concise: 'Concise',
    detailed: 'Détaillée',
    friendly: 'Chaleureuse'
  };

  var LANGUAGE_KEYS = ['fr', 'en'];
  var LANGUAGE_LABELS = {
    fr: 'Français',
    en: 'English'
  };

  var AGENT_STATUS_KEYS = ['none', 'standard', 'full'];
  var AGENT_STATUS_LABELS = {
    none: 'Aucun',
    standard: 'Standard',
    full: 'Complet'
  };

  function normalizeAgentStatus(raw, legacyDebug) {
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_STATUS_KEYS.indexOf(s) !== -1) return s;
    // Legacy checkbox: true → full (debug panel), false → standard (stats only).
    if (legacyDebug === false) return 'standard';
    if (legacyDebug === true) return 'full';
    return 'standard';
  }

  function trimStr(value, max) {
    var s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + '\u2026';
  }

  function defaultFeatures() {
    var out = {};
    FEATURE_KEYS.forEach(function (key) {
      out[key] = true;
    });
    return out;
  }

  function emptyProfile() {
    return {
      version: 1,
      displayName: '',
      role: '',
      notes: '',
      tone: 'concise',
      language: 'fr',
      features: defaultFeatures(),
      agentStatus: 'standard',
      updatedAt: ''
    };
  }

  function normalizeTone(raw) {
    var t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return TONE_KEYS.indexOf(t) !== -1 ? t : 'concise';
  }

  function normalizeLanguage(raw) {
    var lang = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return LANGUAGE_KEYS.indexOf(lang) !== -1 ? lang : 'fr';
  }

  function normalizeFeatures(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = defaultFeatures();
    FEATURE_KEYS.forEach(function (key) {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    });
    // Keep at least one core editing surface visible.
    if (!out.priority && !out.progress && !out.due && !out.blocked) {
      out.priority = true;
    }
    return out;
  }

  function normalizeProfile(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 1,
      displayName: trimStr(src.displayName, MAX_NAME),
      role: trimStr(src.role, MAX_ROLE),
      notes: trimStr(src.notes, MAX_NOTES),
      tone: normalizeTone(src.tone),
      language: normalizeLanguage(src.language),
      features: normalizeFeatures(src.features),
      agentStatus: normalizeAgentStatus(src.agentStatus, src.agentDebug),
      updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : ''
    };
  }

  function isFeatureEnabled(profile, key) {
    var p = normalizeProfile(profile);
    if (FEATURE_KEYS.indexOf(key) === -1) return true;
    return p.features[key] !== false;
  }

  function featureSelector(key) {
    switch (key) {
      case 'info':
        return '.variant-info-section';
      case 'statut':
        return '.variant-statut-section';
      case 'objectif':
        return '.info-row--objectif, .variant-objectif-section';
      case 'priority':
        return '.variant-priority-section';
      case 'graph':
        return '.calc-graph-section';
      case 'progress':
        return '.variant-progress-section';
      case 'due':
        return '.variant-due-section';
      case 'blocked':
        // Nested under Statut (reasons panel shown when status is Bloqué).
        return '.statut-blocked-panel';
      case 'assistant':
        return '.variant-chat-section';
      default:
        return null;
    }
  }

  /**
   * Show/hide card-editor sections according to profile.features.
   * Safe to call repeatedly after mounts complete.
   */
  function applyFeaturesToCard(cardEl, profile) {
    if (!cardEl || !cardEl.querySelector) return;
    var features = normalizeProfile(profile).features;
    FEATURE_KEYS.forEach(function (key) {
      var sel = featureSelector(key);
      if (!sel) return;
      var nodes = cardEl.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].hidden = features[key] === false;
      }
    });
  }

  /** Compact object for LLM context (no storage metadata). */
  function toAgentContext(profile) {
    var p = normalizeProfile(profile);
    return {
      displayName: p.displayName || null,
      role: p.role || null,
      notes: p.notes || null,
      tone: p.tone,
      language: p.language,
      features: p.features
    };
  }

  function profilePromptLines(profile) {
    var p = normalizeProfile(profile);
    var lines = [];
    lines.push('Profil utilisateur (préférences personnelles — respecter)\u00a0:');
    if (p.displayName) {
      lines.push('- Prénom / nom\u00a0: ' + p.displayName + '. Adresse-le ainsi quand c\'est naturel.');
    }
    if (p.role) {
      lines.push('- Rôle\u00a0: ' + p.role + '. Adapte le vocabulaire et les priorités à ce contexte.');
    }
    if (p.notes) {
      lines.push('- Notes / préférences\u00a0: ' + p.notes);
    }
    if (p.language === 'en') {
      lines.push('- Langue\u00a0: réponds en anglais (English), sauf si l\'utilisateur écrit clairement en français.');
    } else {
      lines.push('- Langue\u00a0: réponds en français.');
    }
    if (p.tone === 'detailed') {
      lines.push('- Ton\u00a0: un peu plus détaillé et expliqué (reste clair, pas de jargon inutile).');
    } else if (p.tone === 'friendly') {
      lines.push('- Ton\u00a0: chaleureux et encourageant, sans être verbeux.');
    } else {
      lines.push('- Ton\u00a0: concis et direct.');
    }
    var enabled = [];
    FEATURE_KEYS.forEach(function (key) {
      if (p.features[key]) enabled.push(FEATURE_LABELS[key] || key);
    });
    if (enabled.length) {
      lines.push('- Fonctionnalités actives dans l\'éditeur\u00a0: ' + enabled.join(', ') + '.');
    }
    return lines;
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') return emptyProfile();
    try {
      var stored = await t.get('member', 'private', STORAGE_KEY);
      return normalizeProfile(stored);
    } catch (err) {
      console.error('UserProfile.load failed', err);
      return emptyProfile();
    }
  }

  async function save(t, profile) {
    if (!t || typeof t.set !== 'function') {
      throw new Error('UserProfile.save: t.set required');
    }
    var next = normalizeProfile(profile);
    next.updatedAt = new Date().toISOString();
    await t.set('member', 'private', STORAGE_KEY, next);
    return next;
  }

  async function reset(t) {
    var blank = emptyProfile();
    blank.updatedAt = new Date().toISOString();
    if (t && typeof t.set === 'function') {
      await t.set('member', 'private', STORAGE_KEY, blank);
    }
    return blank;
  }

  global.UserProfile = {
    STORAGE_KEY: STORAGE_KEY,
    FEATURE_KEYS: FEATURE_KEYS,
    FEATURE_LABELS: FEATURE_LABELS,
    TONE_KEYS: TONE_KEYS,
    TONE_LABELS: TONE_LABELS,
    LANGUAGE_KEYS: LANGUAGE_KEYS,
    LANGUAGE_LABELS: LANGUAGE_LABELS,
    AGENT_STATUS_KEYS: AGENT_STATUS_KEYS,
    AGENT_STATUS_LABELS: AGENT_STATUS_LABELS,
    emptyProfile: emptyProfile,
    normalizeAgentStatus: normalizeAgentStatus,
    normalizeProfile: normalizeProfile,
    isFeatureEnabled: isFeatureEnabled,
    applyFeaturesToCard: applyFeaturesToCard,
    toAgentContext: toAgentContext,
    profilePromptLines: profilePromptLines,
    load: load,
    save: save,
    reset: reset
  };
})(typeof window !== 'undefined' ? window : this);
