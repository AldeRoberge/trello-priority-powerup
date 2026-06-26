/**
 * Matrix-based priority labels from urgency, impact, and ease.
 *
 * Extensibility:
 * - Override DIMENSIONS (ranges, level bands) via createConfig()
 * - Append or replace MATRIX_RULES for custom label sets
 * - Pass customRules / dimensions in resolveLabel() context
 * - Optional match(inputs, levels, ctx) per rule for non-declarative logic
 * - Board settings: enable/disable, per-rule label overrides, reset to defaults
 */
(function (global) {
  'use strict';

  var DEFAULT_DIMENSIONS = {
    urgency: {
      key: 'urgency',
      min: 0,
      max: 4,
      levels: [
        { id: 'veryLow', min: 0, max: 0.99 },
        { id: 'low', min: 1, max: 1.99 },
        { id: 'mid', min: 2, max: 2.99 },
        { id: 'high', min: 3, max: 3.49 },
        { id: 'veryHigh', min: 3.5, max: 4 }
      ]
    },
    impact: {
      key: 'impact',
      min: 0,
      max: 4,
      levels: [
        { id: 'veryLow', min: 0, max: 0.99 },
        { id: 'low', min: 1, max: 1.99 },
        { id: 'mid', min: 2, max: 2.99 },
        { id: 'high', min: 3, max: 3.49 },
        { id: 'veryHigh', min: 3.5, max: 4 }
      ]
    },
    ease: {
      key: 'ease',
      min: 1,
      max: 5,
      levels: [
        { id: 'veryLow', min: 1, max: 1.49 },
        { id: 'low', min: 1.5, max: 2.49 },
        { id: 'mid', min: 2.5, max: 3.49 },
        { id: 'high', min: 3.5, max: 4.49 },
        { id: 'veryHigh', min: 4.5, max: 5 }
      ]
    }
  };

  /**
   * Rules are evaluated highest priority first.
   * `when` accepts level ids, arrays of ids, or { min, max } numeric ranges.
   */
  var DEFAULT_RULES = [
    {
      id: 'massive-opportunity',
      label: 'Opportunité massive',
      description: 'Impact majeur, facile Ã  exÃ©cuter et sous forte pression. Ã€ saisir tout de suite.',
      priority: 100,
      when: { ease: ['high', 'veryHigh'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'dirty-job',
      label: 'Corvée express',
      description: 'Urgent mais secondaire et un peu ingrat. À boucler vite pour dégager la suite, sans viser la perfection.',
      priority: 99,
      when: { ease: ['veryLow', 'low'], impact: ['veryLow'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'effort-disproportionne',
      label: 'Corvée ciblée',
      description: 'Urgent et un peu laborieux pour un retour modeste. Fixer un plafond d\'effort et viser l\'essentiel.',
      priority: 98,
      when: { ease: ['veryLow', 'low'], impact: ['low'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'quick-win',
      label: 'Victoire rapide',
      description: 'Peu d\'effort pour un gain net. IdÃ©al Ã  glisser entre deux tÃ¢ches lourdes.',
      priority: 90,
      when: { ease: ['high', 'veryHigh'], impact: ['mid', 'high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'fire-drill',
      label: 'Priorité passagère',
      description: 'Pression Ã©levÃ©e sur un sujet Ã  faible valeur. Contenir sans s\'y perdre.',
      priority: 88,
      when: { ease: ['mid', 'high', 'veryHigh'], impact: ['veryLow', 'low'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'strategic-bet',
      label: 'Pari stratégique',
      description: 'Fort impact, effort conséquent, calendrier souple. À planifier et protéger des urgences du jour.',
      priority: 85,
      when: { ease: ['veryLow', 'low'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'critical-path',
      label: 'Chemin critique',
      description: 'Gros enjeu, réellement exigeant, sous pression. Priorité haute : ça vaut le coup de s\'y consacrer.',
      priority: 84,
      when: { ease: ['veryLow', 'low'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'maintenance',
      label: 'Entretien',
      description: 'Utile mais sans urgence ni enjeu majeur. Ã€ caler quand la bande passante le permet.',
      priority: 70,
      when: { ease: ['mid', 'high'], impact: ['low', 'mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'noise',
      label: 'Faible priorité',
      description: 'Peu de valeur, peu urgent, effort modÃ©rÃ©. Candidat Ã  repousser ou Ã©carter.',
      priority: 65,
      when: { ease: ['low', 'mid'], impact: ['veryLow', 'low'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'backlog-filler',
      label: 'Bonus backlog',
      description: 'Sans pression ni impact notable. À garder en bas de pile, sans y investir trop d\'attention.',
      priority: 60,
      when: { impact: ['veryLow'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'micro-opportunite',
      label: 'Petite opportunité',
      description: 'Presque sans effort, impact limitÃ© mais net positif. Ã€ saisir entre deux chantiers plus lourds.',
      priority: 89,
      when: { ease: ['veryHigh'], impact: ['low', 'mid'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'coup-de-pouce',
      label: 'Coup de pouce',
      description: 'Impact moyen, urgence rÃ©elle, exÃ©cution facile. DÃ©bloque la suite sans mobilisation lourde.',
      priority: 87,
      when: { ease: ['high', 'veryHigh'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'accelerateur',
      label: 'Accélérateur',
      description: 'Gros enjeu, urgence rÃ©elle, difficultÃ© modÃ©rÃ©e. Pas trivial, mais Ã  pousser maintenant.',
      priority: 86,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'effet-levier',
      label: 'Effet de levier',
      description: 'Fort impact pour un effort raisonnable, sans urgence immÃ©diate. Ã€ planifier tant que la prioritÃ© le permet.',
      priority: 83,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'deadline-exigeante',
      label: 'PiÃ¨ge Ã  temps',
      description: 'Semble prioritaire, coÃ»te cher pour un gain moyen. Cadrer le scope ou renÃ©gocier la deadline.',
      priority: 83,
      when: { ease: ['veryLow', 'low'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'pression-moderee',
      label: 'Pression modérée',
      description: 'Enjeu moyen, rythme soutenu, urgence réelle. Prioriser la clôture, la perfection peut attendre.',
      priority: 81,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'travail-de-fond',
      label: 'Travail de fond',
      description: 'Refactors, dette d\'organisation ou stabilisation technique. Effort lourd, impact moyen Ã  fort, sans Ã©chÃ©ance proche.',
      priority: 82,
      when: { ease: ['veryLow', 'low'], impact: ['mid', 'high'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'fondation',
      label: 'Fondation',
      description: 'Travail structurant, effort soutenu, impact rÃ©el mais sans urgence immÃ©diate. Pose les bases des prochains gains.',
      priority: 81,
      when: { ease: ['low', 'mid'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'derapage-cache',
      label: 'Point d\'attention',
      description: 'Fort impact, urgence qui monte, effort encore gérable. Un coup d\'œil régulier évite la course de dernière minute.',
      priority: 80,
      when: { ease: ['mid'], impact: ['high', 'veryHigh'], urgency: ['mid'] }
    },
    {
      id: 'sprint-tactique',
      label: 'Sprint tactique',
      description: 'Sujet moyen sous pression, effort modÃ©rÃ©. Ã€ boucler proprement sans le transformer en chantier.',
      priority: 80,
      when: { ease: ['low', 'mid'], impact: ['mid', 'high'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'pare-feu',
      label: 'Bouclier préventif',
      description: 'Protège un enjeu important avant qu\'il ne devienne urgent. Mise en place proactive, pas réactive.',
      priority: 79,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'paperasse',
      label: 'Paperasse',
      description: 'Facile mais peu gratifiant, urgence rÃ©elle. Ã€ traiter en mode traitement de flux, pas en mode perfection.',
      priority: 77,
      when: { ease: ['high', 'veryHigh'], impact: ['veryLow', 'low'], urgency: ['mid', 'high'] }
    },
    {
      id: 'fausse-priorite',
      label: 'Urgence modérée',
      description: 'Deadline serrée, retour modeste, effort non négligeable. Traiter l\'essentiel puis repasser à des sujets à plus fort levier.',
      priority: 76,
      when: { ease: ['low', 'mid'], impact: ['low', 'mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'sable-mouvant',
      label: 'Effort dense',
      description: 'PÃ©nible, peu utile, urgence moyenne. Classique gouffre Ã  temps si on n\'impose pas une limite.',
      priority: 75,
      when: { ease: ['veryLow', 'low'], impact: ['veryLow', 'low'], urgency: ['mid'] }
    },
    {
      id: 'marathon',
      label: 'Marathon',
      description: 'Long et exigeant, valeur moyenne, pas de deadline proche. Ã€ Ã©taler, pas Ã  forcer d\'un bloc.',
      priority: 74,
      when: { ease: ['veryLow', 'low'], impact: ['mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'routine-utile',
      label: 'Routine utile',
      description: 'Peu d\'effort, valeur modeste mais rÃ©elle, sans pression. Bon crÃ©neau entre deux urgences.',
      priority: 72,
      when: { ease: ['high', 'veryHigh'], impact: ['low', 'mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'piste-exploratoire',
      label: 'Piste exploratoire',
      description: 'Impact et effort moyens, aucune urgence. Utile pour tester une direction sans engagement lourd.',
      priority: 71,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'zone-grise',
      label: 'À arbitrer',
      description: 'Ni prioritaire ni secondaire sur les trois axes. À repositionner selon le reste du backlog : avancer, repousser ou simplifier.',
      priority: 67,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['mid'] }
    }
  ];

  var DEFAULT_SETTINGS = {
    enabled: true,
    overrides: {}
  };

  var LABEL_SETTINGS_STORAGE_KEY = 'trello-priority-matrix-label-settings';

  var LABEL_MAX_LENGTH = 40;
  var DESCRIPTION_MAX_LENGTH = 200;

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function getDefaultRule(id) {
    for (var i = 0; i < DEFAULT_RULES.length; i++) {
      if (DEFAULT_RULES[i].id === id) return DEFAULT_RULES[i];
    }
    return null;
  }

  function normalizeSettings(raw) {
    if (!raw || typeof raw !== 'object') {
      return cloneJson(DEFAULT_SETTINGS);
    }

    var overrides = {};
    var rawOverrides = raw.overrides || raw.ruleOverrides;
    if (rawOverrides && typeof rawOverrides === 'object') {
      Object.keys(rawOverrides).forEach(function (id) {
        if (!getDefaultRule(id)) return;
        var entry = rawOverrides[id];
        if (!entry || typeof entry !== 'object') return;
        var normalized = {};
        if (typeof entry.label === 'string' && entry.label.trim()) {
          normalized.label = entry.label.trim();
        }
        if (typeof entry.description === 'string') {
          normalized.description = entry.description.trim();
        }
        if (Object.keys(normalized).length) overrides[id] = normalized;
      });
    }

    return {
      enabled: raw.enabled !== false,
      overrides: overrides
    };
  }

  function applyRuleOverrides(rules, overrides) {
    if (!overrides || !Object.keys(overrides).length) return rules;
    return rules.map(function (rule) {
      var override = overrides[rule.id];
      if (!override) return rule;
      return Object.assign({}, rule, {
        label: override.label != null ? override.label : rule.label,
        description: override.description != null ? override.description : rule.description
      });
    });
  }

  function getEffectiveRules(settings) {
    var s = settings && (settings.overrides != null || settings.ruleOverrides != null)
      ? normalizeSettings(settings)
      : normalizeSettings(settings || {});
    var base = settings && settings._baseRules ? settings._baseRules : DEFAULT_RULES;
    return applyRuleOverrides(cloneJson(base), s.overrides);
  }

  function hasCustomOverrides(settings) {
    return Object.keys(normalizeSettings(settings).overrides).length > 0;
  }

  function resetSettings() {
    return cloneJson(DEFAULT_SETTINGS);
  }

  function resetToDefaults() {
    return resetSettings();
  }

  function serializeLabelSettings(settings) {
    var s = normalizeSettings(settings);
    return { enabled: s.enabled, overrides: cloneJson(s.overrides) };
  }

  function saveLabelSettings(settings, storageKey) {
    if (typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(storageKey || LABEL_SETTINGS_STORAGE_KEY, JSON.stringify(serializeLabelSettings(settings)));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadLabelSettings(overrides, storageKey) {
    var config = createConfig(overrides);
    if (typeof localStorage === 'undefined') return config;
    try {
      var raw = localStorage.getItem(storageKey || LABEL_SETTINGS_STORAGE_KEY);
      if (!raw) return config;
      var data = JSON.parse(raw);
      if (data.enabled === false) config.enabled = false;
      if (data.overrides && typeof data.overrides === 'object') {
        config.overrides = cloneJson(data.overrides);
      }
    } catch (e) { /* ignore corrupt storage */ }
    return config;
  }

  function buildResolveContext(settings, tier, score, dimensions) {
    var normalized = settings && (settings.overrides != null || settings.enabled != null)
      ? normalizeSettings(settings)
      : normalizeSettings(settings);
    return {
      enabled: normalized.enabled,
      settings: normalized,
      rules: getEffectiveRules(settings),
      dimensions: dimensions || (settings && settings.dimensions) || DEFAULT_DIMENSIONS,
      tier: tier,
      score: score,
      fallbackLabel: tier ? tier.label : undefined,
      fallbackDescription: tier ? tier.description : undefined
    };
  }

  function validateSettings(settings) {
    settings = normalizeSettings(settings);
    var ids = Object.keys(settings.overrides);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var rule = getDefaultRule(id);
      if (!rule) return 'RÃ¨gle de matrice inconnue : ' + id + '.';
      var entry = settings.overrides[id];
      if (entry.label != null) {
        if (!entry.label.trim()) return 'Le libellÃ© de Â« ' + rule.label + ' Â» ne peut pas Ãªtre vide.';
        if (entry.label.length > LABEL_MAX_LENGTH) {
          return 'Le libellÃ© de Â« ' + rule.label + ' Â» est trop long (' + LABEL_MAX_LENGTH + ' caractÃ¨res maximum).';
        }
      }
      if (entry.description != null && entry.description.length > DESCRIPTION_MAX_LENGTH) {
        return 'La description de Â« ' + rule.label + ' Â» est trop longue (' + DESCRIPTION_MAX_LENGTH + ' caractÃ¨res maximum).';
      }
    }
    return null;
  }

  function normalizeInputs(inputs, dimensions) {
    var dims = dimensions || DEFAULT_DIMENSIONS;
    return {
      urgency: clamp(inputs.urgency != null ? inputs.urgency : 0, dims.urgency.min, dims.urgency.max),
      impact: clamp(inputs.impact != null ? inputs.impact : 0, dims.impact.min, dims.impact.max),
      ease: clamp(inputs.ease != null ? inputs.ease : dims.ease.min, dims.ease.min, dims.ease.max)
    };
  }

  function levelForAxis(axisKey, value, dimensions) {
    var dim = dimensions[axisKey];
    if (!dim) return null;
    var v = clamp(value, dim.min, dim.max);
    for (var i = 0; i < dim.levels.length; i++) {
      var band = dim.levels[i];
      if (v >= band.min && v <= band.max) return band.id;
    }
    return dim.levels[dim.levels.length - 1].id;
  }

  function levelsFromInputs(inputs, dimensions) {
    return {
      urgency: levelForAxis('urgency', inputs.urgency, dimensions),
      impact: levelForAxis('impact', inputs.impact, dimensions),
      ease: levelForAxis('ease', inputs.ease, dimensions)
    };
  }

  function levelRank(dim, levelId) {
    for (var i = 0; i < dim.levels.length; i++) {
      if (dim.levels[i].id === levelId) return i;
    }
    return -1;
  }

  function matchesLevelConstraint(constraint, axisKey, levelId, rawValue, dimensions) {
    if (constraint == null) return true;

    if (typeof constraint === 'string') {
      return levelId === constraint;
    }

    if (Array.isArray(constraint)) {
      return constraint.indexOf(levelId) !== -1;
    }

    if (typeof constraint === 'object') {
      if (constraint.level != null) {
        return matchesLevelConstraint(constraint.level, axisKey, levelId, rawValue, dimensions);
      }
      if (constraint.levels != null) {
        return matchesLevelConstraint(constraint.levels, axisKey, levelId, rawValue, dimensions);
      }
      if (constraint.min != null && rawValue < constraint.min) return false;
      if (constraint.max != null && rawValue > constraint.max) return false;
      if (constraint.minLevel != null) {
        var dim = dimensions[axisKey];
        if (levelRank(dim, levelId) < levelRank(dim, constraint.minLevel)) return false;
      }
      if (constraint.maxLevel != null) {
        var dimMax = dimensions[axisKey];
        if (levelRank(dimMax, levelId) > levelRank(dimMax, constraint.maxLevel)) return false;
      }
      return true;
    }

    return true;
  }

  function ruleMatches(rule, inputs, levels, dimensions) {
    if (typeof rule.match === 'function') {
      return !!rule.match(inputs, levels, { dimensions: dimensions });
    }
    if (!rule.when) return false;

    var axes = ['urgency', 'impact', 'ease'];
    for (var i = 0; i < axes.length; i++) {
      var axis = axes[i];
      if (rule.when[axis] == null) continue;
      if (!matchesLevelConstraint(rule.when[axis], axis, levels[axis], inputs[axis], dimensions)) {
        return false;
      }
    }
    return true;
  }

  function specificityScore(rule) {
    if (!rule.when) return 0;
    var score = 0;
    var axes = ['urgency', 'impact', 'ease'];
    for (var i = 0; i < axes.length; i++) {
      var c = rule.when[axes[i]];
      if (c == null) continue;
      score += 1;
      if (Array.isArray(c)) score += c.length;
      else if (typeof c === 'string') score += 1;
      else if (typeof c === 'object') score += 2;
    }
    return score;
  }

  function findMatchingRule(inputs, rules, dimensions) {
    var levels = levelsFromInputs(inputs, dimensions);
    var sorted = rules.slice().sort(function (a, b) {
      var pa = a.priority != null ? a.priority : 0;
      var pb = b.priority != null ? b.priority : 0;
      if (pb !== pa) return pb - pa;
      return specificityScore(b) - specificityScore(a);
    });

    for (var i = 0; i < sorted.length; i++) {
      if (ruleMatches(sorted[i], inputs, levels, dimensions)) return sorted[i];
    }
    return null;
  }

  function tierFallback(ctx, levels, normalized) {
    var fallbackLabel = ctx.fallbackLabel;
    var fallbackDescription = ctx.fallbackDescription || '';
    if (fallbackLabel == null && ctx.tier) {
      fallbackLabel = ctx.tier.label;
      fallbackDescription = ctx.tier.description || fallbackDescription;
    }
    if (fallbackLabel == null) fallbackLabel = 'Non classÃ©';

    return {
      label: fallbackLabel,
      description: fallbackDescription,
      ruleId: null,
      levels: levels,
      inputs: normalized,
      fromMatrix: false
    };
  }

  function createConfig(overrides) {
    overrides = overrides || {};
    var dimensions = cloneJson(DEFAULT_DIMENSIONS);
    if (overrides.dimensions) {
      Object.keys(overrides.dimensions).forEach(function (key) {
        dimensions[key] = Object.assign({}, dimensions[key] || {}, overrides.dimensions[key]);
        if (overrides.dimensions[key].levels) {
          dimensions[key].levels = cloneJson(overrides.dimensions[key].levels);
        }
      });
    }
    var baseRules = overrides.rules ? cloneJson(overrides.rules) : cloneJson(DEFAULT_RULES);
    var config = normalizeSettings({
      enabled: overrides.enabled,
      overrides: overrides.overrides || overrides.ruleOverrides
    });
    config.dimensions = dimensions;
    config._baseRules = baseRules;

    config.resetToDefaults = function () {
      var fresh = resetSettings();
      config.enabled = fresh.enabled;
      config.overrides = fresh.overrides;
      config.dimensions = cloneJson(DEFAULT_DIMENSIONS);
      config._baseRules = cloneJson(DEFAULT_RULES);
    };

    config.setRuleOverride = function (ruleId, patch) {
      config.overrides[ruleId] = Object.assign({}, config.overrides[ruleId] || {}, patch);
    };

    config.clearRuleOverride = function (ruleId) {
      delete config.overrides[ruleId];
    };

    return config;
  }

  /**
   * @param {Object} inputs - { urgency, impact, ease }
   * @param {Object} [ctx] - { enabled, tier, score, dimensions, rules, settings, fallbackLabel, fallbackDescription }
   */
  function resolveLabel(inputs, ctx) {
    ctx = ctx || {};
    var dimensions = ctx.dimensions || DEFAULT_DIMENSIONS;
    var settings = ctx.settings != null ? normalizeSettings(ctx.settings) : null;
    var enabled = ctx.enabled;
    if (enabled == null && settings) enabled = settings.enabled;
    if (enabled == null) enabled = true;

    var rules = ctx.rules;
    if (!rules && settings) rules = getEffectiveRules(settings);
    if (!rules) rules = DEFAULT_RULES;

    var normalized = normalizeInputs(inputs, dimensions);
    var levels = levelsFromInputs(normalized, dimensions);

    if (!enabled) {
      var disabled = tierFallback(ctx, levels, normalized);
      disabled.matrixDisabled = true;
      return disabled;
    }

    var rule = findMatchingRule(normalized, rules, dimensions);

    if (rule) {
      return {
        label: rule.label,
        description: rule.description || '',
        ruleId: rule.id,
        levels: levels,
        inputs: normalized,
        fromMatrix: true,
        matrixDisabled: false
      };
    }

    return tierFallback(ctx, levels, normalized);
  }

  var PriorityMatrix = {
    DIMENSIONS: DEFAULT_DIMENSIONS,
    RULES: DEFAULT_RULES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    STORAGE_KEY: LABEL_SETTINGS_STORAGE_KEY,
    LABEL_MAX_LENGTH: LABEL_MAX_LENGTH,
    DESCRIPTION_MAX_LENGTH: DESCRIPTION_MAX_LENGTH,
    createConfig: createConfig,
    normalizeSettings: normalizeSettings,
    applyRuleOverrides: applyRuleOverrides,
    getEffectiveRules: getEffectiveRules,
    hasCustomOverrides: hasCustomOverrides,
    resetSettings: resetSettings,
    resetToDefaults: resetToDefaults,
    serializeLabelSettings: serializeLabelSettings,
    saveLabelSettings: saveLabelSettings,
    loadLabelSettings: loadLabelSettings,
    buildResolveContext: buildResolveContext,
    validateSettings: validateSettings,
    normalizeInputs: normalizeInputs,
    levelForAxis: levelForAxis,
    levelsFromInputs: levelsFromInputs,
    ruleMatches: ruleMatches,
    findMatchingRule: findMatchingRule,
    resolveLabel: resolveLabel
  };

  global.PriorityMatrix = PriorityMatrix;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
