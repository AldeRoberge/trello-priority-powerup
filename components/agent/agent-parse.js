/**
 * AI agent: normalizers and parsing
 *
 * Part of the agent (see agent.parts.json). Action and suggestion normalizers, parseAssistantPayload, chatCompletions.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
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

  /**
   * Soft→intense score for answer chips (lower = greener).
   * Returns null when the text looks unrelated to a severity/ease scale.
   */
  function suggestionIntensityRank(text) {
    var raw = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!raw) return null;
    // Action / navigation chips — do not treat as a scale.
    if (
      /^(marquer|definir|ajouter|supprimer|renommer|passer|lie[re]?|mettre|quelle|comment)\b/.test(
        raw
      )
    ) {
      return null;
    }
    var rules = [
      { re: /\b(impossible|catastroph|critique|urgentes?|bloque\b)/, score: 100 },
      { re: /\b(tres\s+difficile|extremement|enorme|graves?)\b/, score: 95 },
      { re: /\b(difficile|hard|compliqu|complexe|intense)\b/, score: 90 },
      { re: /\b(beaucoup|a lot|majeur|major)\b/, score: 75 },
      {
        re: /\b(efforts?|du travail|assez|plutot|avec\s+des\s+efforts)\b/,
        score: 55
      },
      {
        re: /\b(faisable|doable|moyen|moderate|gerable|un\s+peu|quelques)\b/,
        score: 45
      },
      { re: /\b(facile|easy|simple|rapide|trivial)\b/, score: 10 },
      {
        re: /\b(pas\s+grand.?chose|rien\b|faible|petit|negligeable|aucune?)\b/,
        score: 5
      }
    ];
    var best = null;
    rules.forEach(function (rule) {
      if (!rule.re.test(raw)) return;
      if (best == null || rule.score > best) best = rule.score;
    });
    return best;
  }

  /**
   * Force green→red order: sort by heat when known, else by intensity keywords,
   * then re-spread heat 0…4 so colors match left→right.
   */
  function orderSuggestionsGreenToRed(entries, userName) {
    if (!Array.isArray(entries) || entries.length < 2) {
      return entries || [];
    }
    // Impact reach (blue→green + circle icons) must not be remapped to heat.
    var reachHits = entries.filter(function (entry) {
      return impactReachKeyFromText(entry.text, userName);
    }).length;
    if (reachHits >= 2 && reachHits >= Math.ceil(entries.length * 0.6)) {
      return enrichImpactReachSuggestions(entries, userName);
    }
    var list = entries.map(function (entry) {
      return {
        text: entry.text,
        heat: entry.heat,
        icon: entry.icon || null,
        color: entry.color || null,
        hl: entry.hl || null,
        rank: suggestionIntensityRank(entry.text)
      };
    });
    var heatedCount = list.filter(function (item) {
      return item.heat != null;
    }).length;
    var ranked = list.filter(function (item) {
      return item.rank != null;
    });
    var canRank =
      ranked.length >= 2 &&
      ranked.some(function (item) {
        return item.rank !== ranked[0].rank;
      });

    if (canRank) {
      list.sort(function (a, b) {
        var ra = a.rank == null ? 50 : a.rank;
        var rb = b.rank == null ? 50 : b.rank;
        if (ra !== rb) return ra - rb;
        if (a.heat != null && b.heat != null && a.heat !== b.heat) {
          return a.heat - b.heat;
        }
        return 0;
      });
    } else if (heatedCount === list.length) {
      list.sort(function (a, b) {
        return a.heat - b.heat;
      });
    } else {
      return entries;
    }

    var steps = spreadScaleHeat(list.length);
    return list.map(function (item, i) {
      return {
        text: item.text,
        heat: steps[i],
        icon: item.icon,
        color: item.color,
        hl: item.hl || null
      };
    });
  }

  /**
   * Normalize AI suggestions to { text, heat, icon, color }[].
   * heat is 0–4 (green→red) or null. options.scale forces even spread when
   * no per-item heat/color was provided.
   */
  function normalizeSuggestionEntries(raw, maxItems, options) {
    options = options || {};
    var max =
      typeof maxItems === 'number' && maxItems > 0 ? Math.floor(maxItems) : 4;
    var out = [];
    if (!Array.isArray(raw)) return out;
    raw.forEach(function (item) {
      var text = '';
      var heat = null;
      var icon = null;
      var color = null;
      if (typeof item === 'string') {
        text = item.trim();
      } else if (item && typeof item === 'object') {
        if (typeof item.label === 'string') text = item.label.trim();
        else if (typeof item.text === 'string') text = item.text.trim();
        else if (typeof item.suggestion === 'string') text = item.suggestion.trim();
        heat = heatFromSuggestionItem(item);
        icon = iconFromSuggestionItem(item);
        color = colorFromSuggestionItem(item);
        // Named blue/teal never become heat; keep the accent color.
        if (color && (color === 'blue' || color === 'teal')) heat = null;
      }
      text = stripSpaceBeforePunctuation(text);
      if (!isWorthySuggestion(text)) return;
      if (
        out.some(function (entry) {
          return entry.text === text;
        })
      ) {
        return;
      }
      out.push({ text: text, heat: heat, icon: icon, color: color });
    });
    out = enrichUrgencyIcons(
      enrichImpactReachSuggestions(out.slice(0, max), options.userName)
    );
    var hasHeat = out.some(function (entry) {
      return entry.heat != null;
    });
    var hasNamedColor = out.some(function (entry) {
      return !!entry.color;
    });
    if (options.scale && !hasHeat && !hasNamedColor) {
      var steps = spreadScaleHeat(out.length);
      out.forEach(function (entry, i) {
        entry.heat = steps[i];
      });
    }
    if (options.scale || options.rankGreenToRed) {
      out = orderSuggestionsGreenToRed(out, options.userName);
    }
    out = ensurePersonalImpactSuggestion(
      out,
      options.userName,
      options.message || ''
    );
    out = linkSuggestionColorsToHighlights(out, options.message || '');
    if (options.rankGreenToRed || options.scale) {
      out = orderSuggestionsGreenToRed(out, options.userName);
    }
    return out;
  }

  function normalizeSuggestionList(raw, maxItems) {
    return normalizeSuggestionEntries(raw, maxItems).map(function (entry) {
      return entry.text;
    });
  }

  function wantsSuggestionScale(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.suggestionScale === true || parsed.scaleSuggestions === true) {
      return true;
    }
    var colors = parsed.suggestionColors;
    if (typeof colors === 'string') {
      var key = colors.trim().toLowerCase();
      return key === 'scale' || key === 'green-red' || key === 'vert-rouge';
    }
    return false;
  }

  /**
   * Whether answer chips allow multi-select (AI-controlled).
   * true = cumulable answers; false/omitted = single choice.
   */
  function wantsSuggestionsMulti(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.suggestionsMulti === true || parsed.suggestionMulti === true) {
      return true;
    }
    if (parsed.multiSelect === true || parsed.multiAnswers === true) {
      return true;
    }
    if (
      parsed.suggestionsMulti === false ||
      parsed.suggestionMulti === false ||
      parsed.multiSelect === false ||
      parsed.multiAnswers === false
    ) {
      return false;
    }
    return false;
  }

  function suggestionsFromFollowUps(followUps) {
    var out = [];
    (followUps || []).forEach(function (fu) {
      if (!fu || !fu.label) return;
      if (fu.actions && fu.actions.length) return;
      if (!isWorthySuggestion(fu.label)) return;
      out.push(fu.label);
    });
    return out.slice(0, 4);
  }

  /** Rough token estimate when the provider omits usage (≈4 chars / token). */
  function estimateTokensFromText(text) {
    var s = typeof text === 'string' ? text : '';
    if (!s) return 0;
    return Math.max(1, Math.ceil(s.length / 4));
  }

  function estimateMessagesTokens(messages) {
    var total = 0;
    (messages || []).forEach(function (m) {
      if (!m) return;
      total += estimateTokensFromText(m.role || '');
      total += estimateTokensFromText(m.content || '');
      total += 4; // per-message overhead
    });
    return total;
  }

  /**
   * Approximate context window by model id (best-effort; OpenAI-compatible ids vary).
   */
  function contextWindowForModel(modelId) {
    var id = (modelId || '').toLowerCase();
    if (/gpt-4\.1|gpt-5\.4|gpt-5\.2|gpt-5\.1|gpt-5(?!-)/.test(id)) return 1048576;
    if (/gpt-5-mini|gpt-5-nano|gpt-4o|o4-mini|o3-mini|gpt-4\.1-mini|gpt-4\.1-nano/.test(id)) {
      return 128000;
    }
    if (/claude.*opus|claude.*sonnet|claude-3/.test(id)) return 200000;
    if (/gemini.*pro|gemini.*flash/.test(id)) return 1000000;
    return 128000;
  }

  /**
   * Approx USD per 1M tokens { input, output }. Matched longest suffix first via includes.
   * Used only for a rough UI estimate — not billing-accurate.
   */
  var MODEL_PRICE_PER_M = [
    { match: 'gpt-5.4-nano', input: 0.1, output: 0.4 },
    { match: 'gpt-5.4-mini', input: 0.25, output: 2.0 },
    { match: 'gpt-5.4', input: 1.25, output: 10.0 },
    { match: 'gpt-5-nano', input: 0.05, output: 0.4 },
    { match: 'gpt-5-mini', input: 0.25, output: 2.0 },
    { match: 'gpt-5.2', input: 1.25, output: 10.0 },
    { match: 'gpt-5.1', input: 1.25, output: 10.0 },
    { match: 'gpt-5', input: 1.25, output: 10.0 },
    { match: 'gpt-4.1-nano', input: 0.1, output: 0.4 },
    { match: 'gpt-4.1-mini', input: 0.4, output: 1.6 },
    { match: 'gpt-4.1', input: 2.0, output: 8.0 },
    { match: 'gpt-4o-mini', input: 0.15, output: 0.6 },
    { match: 'gpt-4o', input: 2.5, output: 10.0 },
    { match: 'o4-mini', input: 1.1, output: 4.4 },
    { match: 'o3-mini', input: 1.1, output: 4.4 },
    { match: 'claude-3-5-haiku', input: 0.8, output: 4.0 },
    { match: 'claude-3-5-sonnet', input: 3.0, output: 15.0 },
    { match: 'claude-sonnet', input: 3.0, output: 15.0 },
    { match: 'claude-opus', input: 15.0, output: 75.0 },
    { match: 'gemini-2.0-flash', input: 0.1, output: 0.4 },
    { match: 'gemini-flash', input: 0.1, output: 0.4 }
  ];

  function pricingForModel(modelId) {
    var id = (modelId || '').toLowerCase();
    for (var i = 0; i < MODEL_PRICE_PER_M.length; i++) {
      if (id.indexOf(MODEL_PRICE_PER_M[i].match) >= 0) {
        return MODEL_PRICE_PER_M[i];
      }
    }
    return { match: 'default', input: 0.15, output: 0.6 };
  }

  function estimateCostUsd(modelId, promptTokens, completionTokens) {
    var price = pricingForModel(modelId);
    var cost =
      (Math.max(0, promptTokens || 0) / 1e6) * price.input +
      (Math.max(0, completionTokens || 0) / 1e6) * price.output;
    return cost;
  }

  function extractUsageFromRaw(raw, messages, content, modelId) {
    var usage = (raw && raw.usage) || null;
    var promptTokens = usage && typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    var completionTokens =
      usage && typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null;
    var totalTokens = usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : null;
    var cachedTokens = null;
    var reasoningTokens = null;
    if (usage && usage.prompt_tokens_details && typeof usage.prompt_tokens_details.cached_tokens === 'number') {
      cachedTokens = usage.prompt_tokens_details.cached_tokens;
    }
    if (
      usage &&
      usage.completion_tokens_details &&
      typeof usage.completion_tokens_details.reasoning_tokens === 'number'
    ) {
      reasoningTokens = usage.completion_tokens_details.reasoning_tokens;
    }
    var estimated = promptTokens == null || completionTokens == null;
    if (promptTokens == null) promptTokens = estimateMessagesTokens(messages);
    if (completionTokens == null) completionTokens = estimateTokensFromText(content || '');
    if (totalTokens == null) totalTokens = promptTokens + completionTokens;

    var finishReason = null;
    if (raw && raw.choices && raw.choices[0] && raw.choices[0].finish_reason) {
      finishReason = String(raw.choices[0].finish_reason);
    }
    var resolvedModel =
      (raw && typeof raw.model === 'string' && raw.model) || modelId || '';

    var systemChars = 0;
    var historyChars = 0;
    var userChars = 0;
    (messages || []).forEach(function (m) {
      if (!m) return;
      var len = String(m.content || '').length;
      if (m.role === 'system') systemChars += len;
      else if (m.role === 'user') userChars += len;
      else historyChars += len;
    });
    var contextTokens = estimated ? estimateMessagesTokens(messages) : promptTokens;
    var windowTokens = contextWindowForModel(resolvedModel);
    var fillPercent =
      windowTokens > 0 ? Math.min(100, Math.round((contextTokens / windowTokens) * 1000) / 10) : 0;

    return {
      promptTokens: promptTokens,
      completionTokens: completionTokens,
      totalTokens: totalTokens,
      cachedTokens: cachedTokens,
      reasoningTokens: reasoningTokens,
      estimated: estimated,
      costUsd: estimateCostUsd(resolvedModel, promptTokens, completionTokens),
      model: resolvedModel,
      finishReason: finishReason,
      context: {
        requestTokens: contextTokens,
        windowTokens: windowTokens,
        fillPercent: fillPercent,
        messageCount: (messages || []).length,
        systemChars: systemChars,
        historyChars: historyChars,
        userChars: userChars
      }
    };
  }

  var FACE_EMOTION_ALLOW = {
    neutral: true,
    happy: true,
    sad: true,
    surprised: true,
    curious: true,
    thinking: true,
    tongue: true,
    wideEyed: true,
    lookUp: true,
    lookDown: true,
    lookLeft: true,
    lookRight: true,
    excited: true,
    wink: true
  };

  function normalizeAssistantEmotion(value) {
    var raw = String(value || '')
      .trim()
      .toLowerCase();
    if (!raw) return null;
    var aliases = {
      joyeux: 'happy',
      content: 'happy',
      triste: 'sad',
      surpris: 'surprised',
      curieux: 'curious',
      pense: 'thinking',
      'r\u00e9fl\u00e9chit': 'thinking',
      reflechit: 'thinking',
      excite: 'excited',
      'excit\u00e9': 'excited',
      langue: 'tongue',
      clin: 'wink',
      gauche: 'lookLeft',
      droite: 'lookRight'
    };
    if (aliases[raw]) raw = aliases[raw];
    if (FACE_EMOTION_ALLOW[raw]) return raw;
    return null;
  }

  function normalizeAssistantColor(value) {
    var raw = String(value || '')
      .trim()
      .toLowerCase();
    if (global.UserProfile && typeof global.UserProfile.normalizeAgentColor === 'function') {
      var fromProfile = global.UserProfile.normalizeAgentColor(raw);
      if (fromProfile) return fromProfile;
    }
    var allow = {
      orange: true,
      yellow: true,
      green: true,
      purple: true,
      blue: true,
      pink: true,
      red: true,
      teal: true,
      coral: true,
      sky: true
    };
    if (allow[raw]) return raw;
    if (raw === 'jaune' || raw === 'gold' || raw === 'amber' || raw === 'dore') return 'yellow';
    if (raw === 'peach' || raw === 'warm') return 'orange';
    if (raw === 'vert' || raw === 'lime') return 'green';
    if (raw === 'violet' || raw === 'lavender') return 'purple';
    if (raw === 'bleu') return 'blue';
    if (raw === 'rose') return 'pink';
    if (raw === 'rouge') return 'red';
    if (raw === 'turquoise' || raw === 'cyan' || raw === 'mint') return 'teal';
    if (raw === 'ciel') return 'sky';
    if (raw.charAt(0) !== '#' && /^[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) {
      raw = '#' + raw;
    }
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-f]{3}$/.test(raw)) {
      return (
        '#' +
        raw.charAt(1) +
        raw.charAt(1) +
        raw.charAt(2) +
        raw.charAt(2) +
        raw.charAt(3) +
        raw.charAt(3)
      );
    }
    return null;
  }

  // ── 13. Parse model JSON + chatCompletions HTTP ──────────────────────────

  function parseAssistantPayload(content) {
    var text = typeof content === 'string' ? content.trim() : '';
    if (!text) {
      return {
        message: 'R\u00e9ponse vide du fournisseur.',
        emotion: null,
        color: null,
        modelTier: null,
        followUps: [],
        suggestions: [],
        suggestionsMulti: false,
        prompts: [],
        blocks: [],
        actions: [],
        droppedActions: [],
        cardPatches: [],
        patches: [],
        selfPrompt: false,
        selfPromptFocus: ''
      };
    }
    var jsonText = text;
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) jsonText = fence[1].trim();
    else {
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start >= 0 && end > start) jsonText = text.slice(start, end + 1);
    }
    try {
      var parsed = JSON.parse(jsonText);
      var message =
        typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : text;
      var followUps = [];
      if (Array.isArray(parsed.followUps)) {
        parsed.followUps.forEach(function (fu) {
          if (!fu || typeof fu !== 'object') return;
          var label = typeof fu.label === 'string' ? fu.label.trim() : '';
          if (!isWorthySuggestion(label)) return;
          var actions = [];
          if (Array.isArray(fu.actions)) {
            fu.actions.forEach(function (action) {
              if (!action || typeof action !== 'object') return;
              var tool = typeof action.tool === 'string' ? action.tool.trim() : '';
              if (!tool) return;
              var item = {
                tool: tool,
                args: action.args && typeof action.args === 'object' ? action.args : {}
              };
              if (!isCompleteAction(item)) return;
              actions.push(item);
            });
          }
          actions = polishFollowUpActions(actions);
          label = ensureFollowUpActionVerb(label, actions);
          followUps.push({ label: label, actions: actions });
        });
      }
      followUps = followUps.slice(0, 4);
      var suggestionScale = wantsSuggestionScale(parsed);
      var suggestions = normalizeSuggestionEntries(parsed.suggestions, 4, {
        scale: suggestionScale,
        rankGreenToRed: !!suggestionScale,
        message: message
      });
      if (!suggestions.length) {
        suggestions = suggestionsFromFollowUps(followUps).map(function (text) {
          return { text: text, heat: null };
        });
      }
      // Link chip colors to highlight spans (also when scale wasn't requested).
      suggestions = linkSuggestionColorsToHighlights(suggestions, message);
      if (
        suggestionScale ||
        (suggestions.length >= 2 &&
          suggestions.length <= 5 &&
          suggestions.every(function (entry) {
            return entry.text.indexOf('?') < 0;
          }) &&
          suggestions.some(function (entry) {
            return entry.heat != null || suggestionIntensityRank(entry.text) != null;
          }))
      ) {
        suggestions = orderSuggestionsGreenToRed(suggestions);
      }
      var normalized = normalizeActionsWithMeta(parsed.actions);
      var selfPromptFocus =
        typeof parsed.selfPromptFocus === 'string'
          ? parsed.selfPromptFocus.trim().slice(0, 240)
          : typeof parsed.self_prompt_focus === 'string'
            ? parsed.self_prompt_focus.trim().slice(0, 240)
            : '';
      return {
        message: message,
        emotion: normalizeAssistantEmotion(parsed.emotion || parsed.mood),
        color: normalizeAssistantColor(
          parsed.color || parsed.aura || parsed.glow
        ),
        modelTier: normalizeModelTier(
          parsed.modelTier || parsed.model_tier
        ),
        followUps: followUps,
        suggestions: suggestions,
        suggestionsMulti: wantsSuggestionsMulti(parsed),
        prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
        blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
        actions: normalized.actions,
        droppedActions: normalized.dropped,
        cardPatches: normalizeCardPatches(parsed.cardPatches),
        patches: normalizeBoardPatches(parsed.patches),
        selfPrompt:
          parsed.selfPrompt === true ||
          parsed.self_prompt === true ||
          parsed.reflect === true,
        selfPromptFocus: selfPromptFocus
      };
    } catch (e) {
      return {
        message: text,
        emotion: null,
        color: null,
        modelTier: null,
        followUps: [],
        suggestions: [],
        suggestionsMulti: false,
        prompts: [],
        blocks: [],
        actions: [],
        droppedActions: [],
        cardPatches: [],
        patches: [],
        selfPrompt: false,
        selfPromptFocus: ''
      };
    }
  }

  /**
   * Pull the visible `message` string out of a partial JSON assistant payload
   * while tokens are still arriving. Falls back to plain text when the stream
   * is not structured as JSON.
   */
  function extractStreamingMessage(accumulated) {
    var text = typeof accumulated === 'string' ? accumulated : '';
    if (!text) return '';
    var trimmed = text.replace(/^\s+/, '');
    var looksJson =
      trimmed.charAt(0) === '{' ||
      /^```/.test(trimmed) ||
      /"message"\s*:/.test(trimmed);
    if (!looksJson) return text;

    var key = trimmed.match(/"message"\s*:\s*"/);
    if (!key) return '';
    var i = key.index + key[0].length;
    var out = '';
    while (i < trimmed.length) {
      var ch = trimmed.charAt(i);
      if (ch === '"') break;
      if (ch === '\\') {
        if (i + 1 >= trimmed.length) break; // escape still incomplete
        var next = trimmed.charAt(i + 1);
        if (next === 'n') out += '\n';
        else if (next === 'r') out += '\r';
        else if (next === 't') out += '\t';
        else if (next === '"' || next === '\\' || next === '/') out += next;
        else if (next === 'u' && i + 5 < trimmed.length) {
          var hex = trimmed.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          break;
        } else {
          out += next;
        }
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    return polishAssistantVisibleText(stripScaleLegendParenthetical(out));
  }

  function throwHttpError(result) {
    var errMsg =
      (result.data &&
        result.data.error &&
        (result.data.error.message || result.data.error)) ||
      result.text ||
      'HTTP ' + result.status;
    var err = new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    err.status = result.status;
    err.code = result.status === 401 || result.status === 403 ? 'auth' : 'http';
    throw err;
  }

  /**
   * OpenAI-compatible SSE reader for chat.completions with stream:true.
   * Calls onDelta(deltaText, accumulated) for each content token.
   */
  async function readSseChatStream(res, onDelta) {
    var content = '';
    var usage = null;
    var model = null;
    var finishReason = null;
    var lastChunk = null;

    function handleChunk(chunk) {
      if (!chunk || typeof chunk !== 'object') return;
      lastChunk = chunk;
      if (typeof chunk.model === 'string' && chunk.model) model = chunk.model;
      if (chunk.usage && typeof chunk.usage === 'object') usage = chunk.usage;
      var choice = chunk.choices && chunk.choices[0] ? chunk.choices[0] : null;
      if (!choice) return;
      if (choice.finish_reason) finishReason = String(choice.finish_reason);
      var delta = choice.delta || null;
      var piece =
        delta && typeof delta.content === 'string'
          ? delta.content
          : choice.message && typeof choice.message.content === 'string'
            ? choice.message.content
            : '';
      if (!piece) return;
      content += piece;
      if (typeof onDelta === 'function') {
        try {
          onDelta(piece, content);
        } catch (cbErr) {
          console.error('chat stream onDelta failed', cbErr);
        }
      }
    }

    function consumeSseBlock(block) {
      var lines = block.split(/\r?\n/);
      var dataParts = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line) continue;
        if (line.charAt(0) === ':') continue; // comment / keepalive
        if (line.indexOf('data:') === 0) {
          dataParts.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (!dataParts.length) return;
      var payload = dataParts.join('\n').trim();
      if (!payload || payload === '[DONE]') return;
      try {
        handleChunk(JSON.parse(payload));
      } catch (e) {
        // Ignore partial/malformed SSE payloads.
      }
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      var fallbackText = await res.text();
      fallbackText.split(/\n\n|\r\n\r\n/).forEach(consumeSseBlock);
    } else {
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      while (true) {
        var read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        var parts = buffer.split(/\n\n|\r\n\r\n/);
        buffer = parts.pop();
        parts.forEach(consumeSseBlock);
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        buffer.split(/\n\n|\r\n\r\n/).forEach(consumeSseBlock);
      }
    }

    return {
      content: content,
      raw: {
        model: model || (lastChunk && lastChunk.model) || undefined,
        choices: [
          {
            finish_reason: finishReason || 'stop',
            message: { role: 'assistant', content: content }
          }
        ],
        usage: usage || undefined
      },
      status: typeof res.status === 'number' ? res.status : null
    };
  }

  function cloneJsonSafe(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return value;
    }
  }

  function buildRequestMeta(provider, body, extras) {
    var p = normalizeProvider(provider);
    var extra = extras || {};
    return {
      url: p.baseUrl + '/chat/completions',
      method: 'POST',
      model: (body && body.model) || p.model || '',
      stream: !!(body && body.stream),
      jsonMode: !!(body && body.response_format),
      temperature: body && body.temperature,
      max_tokens: body && (body.max_tokens != null ? body.max_tokens : body.max_completion_tokens),
      messageCount: body && body.messages ? body.messages.length : 0,
      body: cloneJsonSafe(body),
      status: extra.status != null ? extra.status : null,
      ok: extra.ok != null ? extra.ok : null,
      error: extra.error || null,
      note: extra.note || null
    };
  }

  /** GPT-5 / o-series on OpenAI take max_completion_tokens, not max_tokens. */
  function usesCompletionTokens(p) {
    var model = String((p && p.model) || '').toLowerCase().replace(/^openai\//, '');
    var isOpenAiHost = /(^|\/\/)api\.openai\.com/i.test(String((p && p.baseUrl) || ''));
    return isOpenAiHost && /^(gpt-5|o\d)/.test(model);
  }

  /**
   * When the API rejects a parameter for this model, return options for one
   * retry that avoid it (or null when the error is unrelated / already handled).
   */
  function adaptOptionsToParamError(opts, errorText) {
    var text = String(errorText || '');
    if (!/unsupported|not supported/i.test(text)) return null;
    if (/max_tokens/.test(text) && /max_completion_tokens/.test(text) && !opts._completionTokens) {
      return Object.assign({}, opts, { _completionTokens: true });
    }
    if (/reasoning_effort/.test(text) && opts.reasoningEffort) {
      var droppedReason = opts._drop || [];
      if (droppedReason.indexOf('reasoning_effort') === -1) {
        return Object.assign({}, opts, {
          _drop: droppedReason.concat('reasoning_effort'),
          reasoningEffort: null
        });
      }
    }
    var match = /unsupported (?:parameter|value):?\s*'(temperature|top_p|stream_options)'/i.exec(text);
    if (match) {
      var key = match[1].toLowerCase();
      var dropped = opts._drop || [];
      if (dropped.indexOf(key) === -1) {
        return Object.assign({}, opts, { _drop: dropped.concat(key) });
      }
    }
    return null;
  }

  async function chatCompletions(provider, messages, options) {
    var p = normalizeProvider(provider);
    var opts = options || {};
    var stream = !!opts.stream;
    var onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : null;
    var body = {
      model: p.model,
      messages: messages,
      temperature: opts.temperature != null ? opts.temperature : 0.3
    };
    if (opts.jsonMode !== false) {
      body.response_format = { type: 'json_object' };
    }
    if (opts.model) body.model = String(opts.model);
    if (opts.max_tokens != null) {
      if (opts._completionTokens || usesCompletionTokens(p)) {
        // GPT-5 / o-series reject max_tokens; reasoning also spends this budget,
        // so keep a floor or tiny limits come back empty. A no-reasoning
        // typeahead call can stay at the requested limit.
        var quiet =
          opts.reasoningEffort === 'none' ||
          opts.reasoningEffort === 'minimal' ||
          (opts._drop || []).indexOf('reasoning_effort') >= 0;
        var floor = quiet ? opts.max_tokens : 256;
        body.max_completion_tokens = Math.max(opts.max_tokens, floor);
      } else {
        body.max_tokens = opts.max_tokens;
      }
    }
    if (opts.reasoningEffort && (opts._drop || []).indexOf('reasoning_effort') < 0) {
      body.reasoning_effort = opts.reasoningEffort;
    }
    (opts._drop || []).forEach(function (key) {
      delete body[key];
    });
    if (stream) {
      body.stream = true;
      if (opts.includeUsage !== false) {
        body.stream_options = { include_usage: true };
      }
    }

    if (!stream) {
      var result = await apiFetch(p, '/chat/completions', {
        method: 'POST',
        body: body
      });
      if (!result.ok) {
        var adaptedOpts = adaptOptionsToParamError(
          opts,
          (result.text || '') + ' ' + (result.data ? JSON.stringify(result.data) : '')
        );
        if (adaptedOpts) return chatCompletions(p, messages, adaptedOpts);
        var httpErr = null;
        try {
          throwHttpError(result);
        } catch (thrown) {
          httpErr = thrown;
        }
        if (httpErr) {
          httpErr.debugMeta = buildRequestMeta(p, body, {
            status: result.status,
            ok: false,
            error: httpErr.message,
            note: 'HTTP error (non-stream)'
          });
          throw httpErr;
        }
      }
      var choice =
        result.data &&
        result.data.choices &&
        result.data.choices[0] &&
        result.data.choices[0].message
          ? result.data.choices[0].message
          : null;
      var content = choice && typeof choice.content === 'string' ? choice.content : '';
      return {
        content: content,
        raw: result.data,
        meta: buildRequestMeta(p, body, { status: result.status, ok: true })
      };
    }

    var url = p.baseUrl + '/chat/completions';
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: requestHeaders(p),
        body: JSON.stringify(body)
      });
    } catch (err) {
      var classified = classifyFetchError(err);
      var e = new Error(classified.message);
      e.code = classified.code;
      e.cause = err;
      e.debugMeta = buildRequestMeta(p, body, {
        status: null,
        ok: false,
        error: classified.message,
        note: 'Network / CORS failure'
      });
      throw e;
    }

    if (!res.ok) {
      var text = '';
      try {
        text = await res.text();
      } catch (readErr) {
        text = '';
      }
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          data = { raw: text };
        }
      }
      var adaptedStreamOpts = adaptOptionsToParamError(opts, text || '');
      if (adaptedStreamOpts) return chatCompletions(p, messages, adaptedStreamOpts);
      // Some gateways reject stream_options — retry once without it.
      if (
        body.stream_options &&
        /stream_options|include_usage|unrecognized|unknown/i.test(text || '')
      ) {
        delete body.stream_options;
        return chatCompletions(p, messages, Object.assign({}, opts, { includeUsage: false }));
      }
      try {
        throwHttpError({ ok: false, status: res.status, data: data, text: text });
      } catch (streamHttpErr) {
        streamHttpErr.debugMeta = buildRequestMeta(p, body, {
          status: res.status,
          ok: false,
          error: streamHttpErr.message,
          note: 'HTTP error (stream)'
        });
        throw streamHttpErr;
      }
    }

    var streamed = await readSseChatStream(res, onDelta);
    streamed.meta = buildRequestMeta(p, body, {
      status: streamed.status != null ? streamed.status : res.status,
      ok: true
    });
    return streamed;
  }

  // exports
  S.FACE_EMOTION_ALLOW = FACE_EMOTION_ALLOW;
  S.IMPACT_REACH_SUGGESTION = IMPACT_REACH_SUGGESTION;
  S.MAX_TURN_ACTIONS = MAX_TURN_ACTIONS;
  S.MODEL_PRICE_PER_M = MODEL_PRICE_PER_M;
  S.SUGGESTION_COLOR_HEAT = SUGGESTION_COLOR_HEAT;
  S.SUGGESTION_ICON_IDS = SUGGESTION_ICON_IDS;
  S.SUGGESTION_NAMED_COLORS = SUGGESTION_NAMED_COLORS;
  S.adaptOptionsToParamError = adaptOptionsToParamError;
  S.buildRequestMeta = buildRequestMeta;
  S.chatCompletions = chatCompletions;
  S.clampSuggestionHeat = clampSuggestionHeat;
  S.cloneJsonSafe = cloneJsonSafe;
  S.coerceActionArgs = coerceActionArgs;
  S.colorFromSuggestionItem = colorFromSuggestionItem;
  S.contextWindowForModel = contextWindowForModel;
  S.defaultCreateSubtaskTitles = defaultCreateSubtaskTitles;
  S.enrichImpactReachSuggestions = enrichImpactReachSuggestions;
  S.enrichSubtaskPickTurn = enrichSubtaskPickTurn;
  S.enrichUrgencyIcons = enrichUrgencyIcons;
  S.ensurePersonalImpactSuggestion = ensurePersonalImpactSuggestion;
  S.estimateCostUsd = estimateCostUsd;
  S.estimateMessagesTokens = estimateMessagesTokens;
  S.estimateTokensFromText = estimateTokensFromText;
  S.extractStreamingMessage = extractStreamingMessage;
  S.extractUsageFromRaw = extractUsageFromRaw;
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
  S.normalizeAssistantColor = normalizeAssistantColor;
  S.normalizeAssistantEmotion = normalizeAssistantEmotion;
  S.normalizeSuggestionColorName = normalizeSuggestionColorName;
  S.normalizeSuggestionEntries = normalizeSuggestionEntries;
  S.normalizeSuggestionIconId = normalizeSuggestionIconId;
  S.normalizeSuggestionList = normalizeSuggestionList;
  S.orderSuggestionsGreenToRed = orderSuggestionsGreenToRed;
  S.parseAssistantPayload = parseAssistantPayload;
  S.pricingForModel = pricingForModel;
  S.readSseChatStream = readSseChatStream;
  S.spreadScaleHeat = spreadScaleHeat;
  S.suggestionIntensityRank = suggestionIntensityRank;
  S.suggestionsFromFollowUps = suggestionsFromFollowUps;
  S.throwHttpError = throwHttpError;
  S.titleLikeSuggestionEntries = titleLikeSuggestionEntries;
  S.urgencyIconFromText = urgencyIconFromText;
  S.usesCompletionTokens = usesCompletionTokens;
  S.wantsSuggestionScale = wantsSuggestionScale;
  S.wantsSuggestionsMulti = wantsSuggestionsMulti;
})(typeof window !== 'undefined' ? window : this);
