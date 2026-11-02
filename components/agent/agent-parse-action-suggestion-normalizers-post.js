/**
 * AI agent: normalizers and parsing
 *
 * Part of the agent (see agent.parts.json). Action and suggestion normalizers, parseAssistantPayload, chatCompletions.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */

/**
 * agent-parse: part 1 of 2 (12. Action + suggestion normalizers (post-model)).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-parse.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var EFFECT_IDS = S.EFFECT_IDS;
  var FORMULA_KEYS = S.FORMULA_KEYS;

  // from other parts (functions, resolved at call time)
  function apiFetch() { return S.apiFetch.apply(this, arguments); }
  function classifyFetchError() { return S.classifyFetchError.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function linkSuggestionColorsToHighlights() { return S.linkSuggestionColorsToHighlights.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeBoardPatches() { return S.normalizeBoardPatches.apply(this, arguments); }
  function normalizeCardPatches() { return S.normalizeCardPatches.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizeModelTier() { return S.normalizeModelTier.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function polishAssistantVisibleText() { return S.polishAssistantVisibleText.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function requestHeaders() { return S.requestHeaders.apply(this, arguments); }
  function stripScaleLegendParenthetical() { return S.stripScaleLegendParenthetical.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }

var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  var EFFECT_IDS = S.EFFECT_IDS;
  var FORMULA_KEYS = S.FORMULA_KEYS;
  function apiFetch() { return S.apiFetch.apply(this, arguments); }
  function classifyFetchError() { return S.classifyFetchError.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function linkSuggestionColorsToHighlights() { return S.linkSuggestionColorsToHighlights.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeBoardPatches() { return S.normalizeBoardPatches.apply(this, arguments); }
  function normalizeCardPatches() { return S.normalizeCardPatches.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizeModelTier() { return S.normalizeModelTier.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function polishAssistantVisibleText() { return S.polishAssistantVisibleText.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function requestHeaders() { return S.requestHeaders.apply(this, arguments); }
  function stripScaleLegendParenthetical() { return S.stripScaleLegendParenthetical.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }

  /** Drop tool calls that are missing required args (e.g. empty add_subtask). */
  // ── 12. Action + suggestion normalizers (post-model) ─────────────────────
  // Models emit loose JSON; these coerce to executable action shapes.

  /** Max tool calls applied in one assistant turn (prompt + runtime). */
  var MAX_TURN_ACTIONS = 5;

  function hasSubtaskRef(args) {
    return (
      (typeof args.id === 'string' && !!args.id.trim()) ||
      (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
      (typeof args.from === 'string' && !!args.from.trim())
    );
  }

  function firstNonEmptyString() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  /**
   * Coerce common model aliases before completeness checks
   * (e.g. add_subtask.title → text).
   */
  function coerceActionArgs(action) {
    if (!action || typeof action.tool !== 'string' || !action.tool) return action;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    if (action.tool === 'add_subtask') {
      var text = firstNonEmptyString(args.text, args.title, args.name, args.label);
      if (text && text !== args.text) {
        return {
          tool: action.tool,
          args: Object.assign({}, args, { text: text })
        };
      }
    }
    return {
      tool: action.tool,
      args: args
    };
  }

  function isCompleteAction(action) {
    if (!action || typeof action.tool !== 'string' || !action.tool) return false;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    if (action.tool === 'add_subtask') {
      return typeof args.text === 'string' && !!args.text.trim();
    }
    if (action.tool === 'rename_card') {
      return (
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim())
      );
    }
    if (action.tool === 'set_description') {
      return (
        typeof args.desc === 'string' ||
        typeof args.description === 'string' ||
        typeof args.text === 'string'
      );
    }
    if (action.tool === 'rename_subtask') {
      return (
        typeof args.text === 'string' &&
        !!args.text.trim() &&
        hasSubtaskRef(args)
      );
    }
    if (
      action.tool === 'remove_subtask' ||
      action.tool === 'toggle_subtask' ||
      action.tool === 'set_subtask_blocked'
    ) {
      return hasSubtaskRef(args);
    }
    if (action.tool === 'set_subtask_progress') {
      return hasSubtaskRef(args) && args.progress != null;
    }
    if (action.tool === 'set_formula') {
      return (
        typeof args.formula === 'string' &&
        FORMULA_KEYS.indexOf(args.formula.trim()) !== -1
      );
    }
    if (action.tool === 'set_statut') {
      return (
        (typeof args.listId === 'string' && !!args.listId.trim()) ||
        (typeof args.matchList === 'string' && !!args.matchList.trim()) ||
        (typeof args.category === 'string' && !!args.category.trim())
      );
    }
    if (action.tool === 'set_project') {
      if (args.clear === true) return true;
      return (
        (typeof args.projectId === 'string' && !!args.projectId.trim()) ||
        (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
        (typeof args.name === 'string' && !!args.name.trim())
      );
    }
    if (
      action.tool === 'complete_all_subtasks' ||
      action.tool === 'reset_progress'
    ) {
      return true;
    }
    if (action.tool === 'trigger_effect') {
      var fxOk = !!normalizeEffectId(args.effect || args.name || args.id);
      if (!fxOk) return false;
      var fxNorm = normalizeEffectId(args.effect || args.name || args.id);
      if (fxNorm === 'banner') {
        var bannerText =
          (typeof args.text === 'string' && args.text.trim()) ||
          (typeof args.label === 'string' && args.label.trim()) ||
          (typeof args.message === 'string' && args.message.trim());
        return !!bannerText;
      }
      return true;
    }
    if (action.tool === 'point_at') {
      var pointSection = normalizePointSection(
        args.section || args.target || args.area || args.panel
      );
      var pointField = normalizePointField(args.field || args.axis || args.dim);
      return !!(pointSection || pointField);
    }
    if (action.tool === 'set_agent_name') {
      return (
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim())
      );
    }
    if (action.tool === 'set_agent_color') {
      var colorRaw =
        (typeof args.color === 'string' && args.color) ||
        (typeof args.aura === 'string' && args.aura) ||
        (typeof args.value === 'string' && args.value) ||
        (typeof args.text === 'string' && args.text) ||
        '';
      return !!normalizeAgentColorArg(colorRaw);
    }
    if (action.tool === 'set_agent_personality') {
      return (
        (typeof args.personality === 'string' && !!args.personality.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim()) ||
        (typeof args.value === 'string' && !!args.value.trim())
      );
    }
    if (action.tool === 'upsert_person') {
      return (
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
        (typeof args.id === 'string' && !!args.id.trim())
      );
    }
    if (action.tool === 'remove_person') {
      return (
        (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.id === 'string' && !!args.id.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim())
      );
    }
    if (action.tool === 'upsert_place') {
      return (
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
        (typeof args.id === 'string' && !!args.id.trim())
      );
    }
    if (action.tool === 'remove_place') {
      return (
        (typeof args.matchText === 'string' && !!args.matchText.trim()) ||
        (typeof args.name === 'string' && !!args.name.trim()) ||
        (typeof args.id === 'string' && !!args.id.trim()) ||
        (typeof args.text === 'string' && !!args.text.trim())
      );
    }
    if (action.tool === 'set_places') {
      return (
        args.clear === true ||
        Object.prototype.hasOwnProperty.call(args, 'from') ||
        Object.prototype.hasOwnProperty.call(args, 'to') ||
        Object.prototype.hasOwnProperty.call(args, 'at')
      );
    }
    if (action.tool === 'show_guide') {
      var guideKind = String(args.kind || args.guide || args.type || '').toLowerCase();
      return /breath|respir|medit|stretch|etir|breathe|timer|pomo|minuteur/.test(guideKind);
    }
    if (action.tool === 'set_timer') {
      var timerArg = args.minutes != null ? args.minutes : args.duration;
      return typeof Timers !== 'undefined' ? !!Timers.parseDuration(timerArg) : Number(timerArg) > 0;
    }
    if (action.tool === 'schedule_check') {
      var checkSeconds = Number(
        args.seconds != null ? args.seconds : args.delay != null ? args.delay : args.after
      );
      var checkText =
        (typeof args.message === 'string' && args.message.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        '';
      return isFinite(checkSeconds) && checkSeconds >= 5 && checkSeconds <= 3600 && !!checkText;
    }
    if (action.tool === 'set_task_types') {
      var typeArgs =
        args.types != null
          ? args.types
          : args.taskTypes != null
            ? args.taskTypes
            : null;
      return Array.isArray(typeArgs) || typeof typeArgs === 'string';
    }
    return true;
  }

  function incompleteActionError(action) {
    if (!action || !action.tool) return 'Action invalide';
    if (action.tool === 'add_subtask') return 'add_subtask: text requis';
    if (action.tool === 'rename_card') return 'rename_card: name requis';
    if (action.tool === 'set_description') return 'set_description: desc requis';
    if (action.tool === 'rename_subtask') {
      return 'rename_subtask: text et id (ou matchText) requis';
    }
    if (action.tool === 'remove_subtask') {
      return 'remove_subtask: id (ou matchText) requis';
    }
    if (action.tool === 'toggle_subtask') {
      return 'toggle_subtask: id (ou matchText) requis';
    }
    if (action.tool === 'set_subtask_blocked') {
      return 'set_subtask_blocked: id (ou matchText) requis';
    }
    if (action.tool === 'set_subtask_progress') {
      return 'set_subtask_progress: id (ou matchText) et progress requis';
    }
    if (action.tool === 'set_formula') {
      return 'set_formula: formula requis (baseline|eisenhower|wsjf|valueEffort)';
    }
    if (action.tool === 'set_statut') {
      return 'set_statut: listId, matchList ou category requis';
    }
    if (action.tool === 'set_project') {
      return 'set_project: projectId, matchText/name, ou clear:true requis';
    }
    if (action.tool === 'trigger_effect') {
      var fxTry = normalizeEffectId(
        action.args && (action.args.effect || action.args.name || action.args.id)
      );
      if (fxTry === 'banner') {
        return 'trigger_effect: banner exige text (texte plein \u00e9cran)';
      }
      return (
        'trigger_effect: effect requis (' + EFFECT_IDS.join('|') + ')'
      );
    }
    if (action.tool === 'point_at') {
      return 'point_at: section ou field requis';
    }
    if (action.tool === 'set_agent_name') {
      return 'set_agent_name: name requis';
    }
    if (action.tool === 'set_agent_color') {
      return 'set_agent_color: color requis (orange|yellow|…|sky ou #RRGGBB)';
    }
    if (action.tool === 'set_agent_personality') {
      return 'set_agent_personality: personality requis';
    }
    if (action.tool === 'upsert_person') {
      return 'upsert_person: name ou matchText requis';
    }
    if (action.tool === 'remove_person') {
      return 'remove_person: matchText, name ou id requis';
    }
    if (action.tool === 'upsert_place') {
      return 'upsert_place: name ou matchText requis';
    }
    if (action.tool === 'remove_place') {
      return 'remove_place: matchText, name ou id requis';
    }
    if (action.tool === 'set_places') {
      return 'set_places: from, to, at ou clear requis';
    }
    if (action.tool === 'show_guide') {
      return 'show_guide: kind breathe ou stretch';
    }
    if (action.tool === 'set_timer') {
      return 'set_timer: minutes (nombre ou texte comme 2 h 30) requis';
    }
    if (action.tool === 'schedule_check') {
      return 'schedule_check: seconds (5\u20133600) et message requis';
    }
    if (action.tool === 'set_task_types') {
      return (
        'set_task_types: types requis (action|project|recurring|exploratory|emotional|communication|deliverable|process|thinking|material|learning|admin|creative|finance|custom-*)'
      );
    }
    return action.tool + ': args incomplets';
  }

  function normalizeActionList(raw) {
    return normalizeActionsWithMeta(raw).actions;
  }

  function normalizeActionsWithMeta(raw) {
    var out = [];
    var dropped = [];
    if (!Array.isArray(raw)) return { actions: out, dropped: dropped };
    raw.forEach(function (action) {
      if (!action || typeof action !== 'object') return;
      var tool = typeof action.tool === 'string' ? action.tool.trim() : '';
      if (!tool) return;
      var item = coerceActionArgs({
        tool: tool,
        args: action.args && typeof action.args === 'object' ? action.args : {}
      });
      if (!isCompleteAction(item)) {
        dropped.push({
          tool: item.tool,
          code: 'incomplete-args',
          error: incompleteActionError(item),
          hint: 'Args manquants ou invalides pour cet outil.'
        });
        return;
      }
      out.push(item);
    });
    var polished = polishFollowUpActions(out);
    var kept = polished.slice(0, MAX_TURN_ACTIONS);
    polished.slice(MAX_TURN_ACTIONS).forEach(function (item) {
      if (!item || !item.tool) return;
      dropped.push({
        tool: item.tool,
        code: 'action-limit',
        reason: 'action-limit',
        error:
          item.tool +
          ': limite de ' +
          MAX_TURN_ACTIONS +
          ' actions par tour',
        hint:
          'Renvoie les \u00e9l\u00e9ments restants dans un prochain message pour les appliquer.'
      });
    });
    return {
      actions: kept,
      dropped: dropped
    };
  }

  /** Reject ellipsis / placeholder chips the model copies from prompt examples. */
  function isWorthySuggestion(text) {
    if (!text) return false;
    var t = String(text).trim();
    if (!t) return false;
    // Only dots / ellipsis / whitespace (e.g. "...", "…", ". . .")
    if (/^[.\u2026\u22EF\u2025\s]+$/.test(t)) return false;
    // Generic placeholders sometimes echoed from schemas
    if (/^(suggestion|suggestions?|exemple|example|placeholder|\u2026|\.\.\.)$/i.test(t)) {
      return false;
    }
    return true;
  }

  /**
   * Named colors (FR/EN) → heat 0–4 (green → red) for severity scales.
   * Blue/teal stay as named colors (impact reach) and do not map to heat.
   */
  var SUGGESTION_COLOR_HEAT = {
    green: 0,
    vert: 0,
    lime: 1,
    yellow: 2,
    jaune: 2,
    amber: 2,
    orange: 3,
    red: 4,
    rouge: 4,
    gray: 0,
    grey: 0,
    gris: 0
  };

  /** Colors rendered as named accents (not green→red heat). */
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

  /** Icons the model may set on suggestion chips. */
  var SUGGESTION_ICON_IDS = [
    'circle-xs',
    'circle-sm',
    'circle-md',
    'circle-lg',
    'circle-xl',
    'dots',
    'hammer',
    'calm-face',
    'exclaim',
    'user',
    'users',
    'building',
    'globe',
    'flame',
    'check',
    'ban',
    'clock',
    'bolt',
    'layers',
    'hourglass'
  ];

  var IMPACT_REACH_SUGGESTION = {
    personnel: {
      icon: 'circle-xs',
      color: 'blue',
      label: 'Personnel',
      heat: null
    },
    equipe: {
      icon: 'circle-sm',
      color: 'teal',
      label: '\u00c9quipe',
      heat: null
    },
    interne: {
      icon: 'circle-md',
      color: 'yellow',
      label: 'Interne',
      heat: null
    },
      population: {
      icon: 'circle-lg',
      color: 'green',
      label: 'Population',
      heat: null
    },
    global: {
      icon: 'circle-xl',
      color: 'green',
      label: 'Global',
      heat: null
    }
  };

  function clampSuggestionHeat(value) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(4, Math.round(n)));
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

  function normalizeSuggestionIconId(raw) {
    if (typeof raw !== 'string') return null;
    var key = raw.trim().toLowerCase();
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
      exclamations: 'exclaim'
    };
    if (aliases[key]) key = aliases[key];
    return SUGGESTION_ICON_IDS.indexOf(key) >= 0 ? key : null;
  }

  function heatFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.heat != null) return clampSuggestionHeat(item.heat);
    if (typeof item.color === 'string') {
      var key = item.color.trim().toLowerCase();
      // Blue/teal are reach accents — keep out of green→red heat.
      if (key === 'blue' || key === 'bleu' || key === 'teal' || key === 'cyan') {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(SUGGESTION_COLOR_HEAT, key)) {
        return SUGGESTION_COLOR_HEAT[key];
      }
    }
    return null;
  }

  function colorFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.color !== 'string') return null;
    return normalizeSuggestionColorName(item.color);
  }

  function iconFromSuggestionItem(item) {
    if (!item || typeof item !== 'object') return null;
    return normalizeSuggestionIconId(item.icon);
  }

  function impactReachKeyFromText(text, knownName) {
    var raw = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!raw) return null;
    var numbered = raw.match(
      /^(?:impact\s*[=:]?\s*)?([0-4])\s*[\-–—:(]\s*(.+?)\s*\)?$/
    );
    if (numbered) raw = numbered[2].trim();
    raw = raw.replace(/^(portee|impact)\s*[=:]?\s*/, '').trim();
    // "Impact sur l'équipe" / "sur moi" conversational chips
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
    if (knownName) {
      var nameKey = String(knownName)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      var first = nameKey.split(/\s+/)[0];
      if (
        (first && first.length >= 2 && (raw === first || raw.indexOf(first) === 0)) ||
        (nameKey.length >= 2 && raw === nameKey)
      ) {
        return 'personnel';
      }
    }
    return null;
  }

  function foldMatchText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function listProgressSubtaskLabels(context, maxItems) {
    var cap = maxItems != null ? maxItems : 6;
    var items =
      context && context.progress && Array.isArray(context.progress.items)
        ? context.progress.items
        : [];
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var text =
        items[i] && typeof items[i].text === 'string' ? items[i].text.trim() : '';
      if (!text) continue;
      var key = foldMatchText(text);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(text);
      if (out.length >= cap) break;
    }
    return out;
  }

  /** Assistant asks which existing subtask to rename / change / delete / complete. */
  function looksLikeSubtaskPickQuestion(message) {
    var raw = String(message || '');
    if (!/\?/.test(raw)) return false;
    var m = foldMatchText(raw);
    var pickVerb =
      /(changer|renommer|supprimer|modifier|cocher|terminer|completer|rename|change|edit|delete|remove|complete|check off)/.test(
        m
      );
    // "Quelle sous-tâche…?" / "Which subtask…?" implies picking an existing one.
    if (
      /quelle sous-tache/.test(m) ||
      /quelles sous-taches/.test(m) ||
      /which subtask/.test(m)
    ) {
      return true;
    }
    // "Quel est le nom de la sous-tâche que tu veux changer?" — not bare add prompts.
    if (
      (/nom de la sous-tache/.test(m) ||
        /name of the subtask/.test(m) ||
        /what('?s| is) the (name|title) of the subtask/.test(m)) &&
      pickVerb
    ) {
      return true;
    }
    if (/sous-tache/.test(m) && pickVerb) return true;
    if (/subtask/.test(m) && pickVerb) return true;
    return /laquelle/.test(m) && pickVerb;
  }

  function titleLikeSuggestionEntries(entries) {
    var out = [];
    (entries || []).forEach(function (entry) {
      var text =
        typeof entry === 'string'
          ? entry.trim()
          : entry && typeof entry.text === 'string'
            ? entry.text.trim()
            : '';
      if (!text || /\?/.test(text)) return;
      var folded = foldMatchText(text);
      if (
        /^(quelle|quel|quelles|what|which)\b/.test(folded) ||
        /^(definir|marquer|ajouter une autre)\b/.test(folded)
      ) {
        return;
      }
      out.push({ text: text, heat: null, icon: null, color: null });
    });
    return out;
  }

  function defaultCreateSubtaskTitles(context) {
    var isEn = !!(context && context.profile && context.profile.language === 'en');
    return isEn
      ? ['Check the brief', 'Contact the client', 'Prepare the delivery']
      : ['V\u00e9rifier le brief', 'Contacter le client', 'Pr\u00e9parer la livraison'];
  }

  /**
   * When the assistant asks which subtask to pick: surface live progress.items,
   * or pivot to create-titles if the card has none.
   */
  async function enrichSubtaskPickTurn(parsed, context, options) {
    options = options || {};
    if (!parsed || !looksLikeSubtaskPickQuestion(parsed.message)) {
      return parsed;
    }
    var isEn = !!(context && context.profile && context.profile.language === 'en');
    var labels = listProgressSubtaskLabels(context, 6);
    if (labels.length) {
      parsed.suggestions = labels.map(function (text) {
        return { text: text, heat: null, icon: null, color: null };
      });
      parsed.suggestionsMulti = false;
      return parsed;
    }

    parsed.message = isEn
      ? "There's no subtask on this card yet. You can create one — what title do you want?"
      : "Y a pas encore de sous-t\u00e2che sur cette carte. Tu peux en cr\u00e9er une \u2014 quel titre tu veux?";

    var titles = titleLikeSuggestionEntries(parsed.suggestions);
    if (titles.length < 2 && typeof options.suggestTitles === 'function') {
      try {
        var generated = await options.suggestTitles();
        titles = titleLikeSuggestionEntries(generated || []);
      } catch (err) {
        console.error('enrichSubtaskPickTurn suggestTitles failed', err);
      }
    }
    if (titles.length < 2) {
      titles = titleLikeSuggestionEntries(defaultCreateSubtaskTitles(context));
    }
    parsed.suggestions = titles.slice(0, 4);
    parsed.suggestionsMulti = false;
    return parsed;
  }

  /**
   * If impact-audience chips omit the known user, prepend "Impact sur {name}".
   */
  function ensurePersonalImpactSuggestion(entries, userName, message) {
    var name = String(userName || '').trim();
    if (!name || !Array.isArray(entries) || entries.length < 2) {
      return entries || [];
    }
    var firstName = name.split(/\s+/)[0];
    if (!firstName) return entries;

    function fold(s) {
      return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    }

    function looksLikeAudience(text) {
      var raw = fold(text).trim();
      if (/^(impact\s+sur|sur)\s+/.test(raw)) return true;
      return !!impactReachKeyFromText(text, name);
    }

    function mentionsUser(text) {
      var raw = fold(text);
      if (/\b(moi|personnel|individuel|me)\b/.test(raw)) return true;
      var key = fold(firstName);
      return key.length >= 2 && raw.indexOf(key) >= 0;
    }

    var audienceHits = 0;
    for (var i = 0; i < entries.length; i++) {
      if (looksLikeAudience(entries[i].text)) audienceHits += 1;
    }
    var messageLooksImpact = /impact|touch[eé]|port[eé]e|qui\s+(est|sont)/i.test(
      String(message || '')
    );
    if (audienceHits < 2 && !(messageLooksImpact && audienceHits >= 1)) {
      return entries;
    }
    if (audienceHits < Math.ceil(entries.length * 0.5) && audienceHits < 2) {
      return entries;
    }
    if (
      entries.some(function (entry) {
        return mentionsUser(entry.text);
      })
    ) {
      return entries;
    }

    var personal = {
      text: 'Impact sur ' + firstName,
      heat: null,
      icon: 'circle-xs',
      color: 'blue'
    };
    return [personal].concat(entries).slice(0, 5);
  }

  /** Rewrite numbered reach chips (0 Personnel…) into labelled icon+color chips. */
  function enrichImpactReachSuggestions(entries, userName) {
    if (!Array.isArray(entries) || entries.length < 2) return entries || [];
    var keys = entries.map(function (entry) {
      return impactReachKeyFromText(entry.text, userName);
    });
    var hit = keys.filter(Boolean).length;
    if (hit < 2 || hit < Math.ceil(entries.length * 0.6)) return entries;
    return entries.map(function (entry, i) {
      var meta = keys[i] ? IMPACT_REACH_SUGGESTION[keys[i]] : null;
      if (!meta) return entry;
      var label = meta.label;
      var conversational = /^(impact\s+sur|sur)\s+/i.test(String(entry.text || ''));
      if (conversational) {
        label = entry.text;
      } else if (keys[i] === 'personnel' && userName) {
        var first = String(userName).trim().split(/\s+/)[0];
        var folded = String(entry.text || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        var firstFold = String(first || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (firstFold && folded.indexOf(firstFold) >= 0) {
          label = entry.text;
        } else if (first) {
          label = first;
        }
      }
      return {
        text: label,
        heat: null,
        icon: entry.icon || meta.icon,
        color: entry.color || meta.color
      };
    });
  }

  /** Calm face for "pas urgent…", !! for clear "urgent / critique". */
  function urgencyIconFromText(text) {
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

  function enrichUrgencyIcons(entries) {
    if (!Array.isArray(entries) || !entries.length) return entries || [];
    return entries.map(function (entry) {
      var icon = urgencyIconFromText(entry.text);
      if (!icon) return entry;
      return {
        text: entry.text,
        heat: entry.heat,
        icon: icon,
        color: entry.color
      };
    });
  }

  /** Even green→red steps for N chips (e.g. 3 → 0,2,4). */
  function spreadScaleHeat(count) {
    var n = Math.max(0, Math.floor(count));
    if (n <= 0) return [];
    if (n === 1) return [2];
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(Math.round((i / (n - 1)) * 4));
    }
    return out;
  }

  // exports
  S.IMPACT_REACH_SUGGESTION = IMPACT_REACH_SUGGESTION;
  S.MAX_TURN_ACTIONS = MAX_TURN_ACTIONS;
  S.SUGGESTION_COLOR_HEAT = SUGGESTION_COLOR_HEAT;
  S.SUGGESTION_ICON_IDS = SUGGESTION_ICON_IDS;
  S.SUGGESTION_NAMED_COLORS = SUGGESTION_NAMED_COLORS;
  S.clampSuggestionHeat = clampSuggestionHeat;
  S.coerceActionArgs = coerceActionArgs;
  S.colorFromSuggestionItem = colorFromSuggestionItem;
  S.defaultCreateSubtaskTitles = defaultCreateSubtaskTitles;
  S.enrichImpactReachSuggestions = enrichImpactReachSuggestions;
  S.enrichSubtaskPickTurn = enrichSubtaskPickTurn;
  S.enrichUrgencyIcons = enrichUrgencyIcons;
  S.ensurePersonalImpactSuggestion = ensurePersonalImpactSuggestion;
  S.firstNonEmptyString = firstNonEmptyString;
  S.foldMatchText = foldMatchText;
  S.hasSubtaskRef = hasSubtaskRef;
  S.heatFromSuggestionItem = heatFromSuggestionItem;
  S.iconFromSuggestionItem = iconFromSuggestionItem;
  S.impactReachKeyFromText = impactReachKeyFromText;
  S.incompleteActionError = incompleteActionError;
  S.isCompleteAction = isCompleteAction;
  S.isWorthySuggestion = isWorthySuggestion;
  S.listProgressSubtaskLabels = listProgressSubtaskLabels;
  S.looksLikeSubtaskPickQuestion = looksLikeSubtaskPickQuestion;
  S.normalizeActionList = normalizeActionList;
  S.normalizeActionsWithMeta = normalizeActionsWithMeta;
  S.normalizeSuggestionColorName = normalizeSuggestionColorName;
  S.normalizeSuggestionIconId = normalizeSuggestionIconId;
  S.spreadScaleHeat = spreadScaleHeat;
  S.titleLikeSuggestionEntries = titleLikeSuggestionEntries;
  S.urgencyIconFromText = urgencyIconFromText;
})(typeof window !== 'undefined' ? window : this);
