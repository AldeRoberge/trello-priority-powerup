/**
 * AI agent actions: assistant itself
 *
 * Tools about the assistant: guides and checks, effects, pointing at the UI, name, color, personality, history undo and redo.
 * Each tool registers one handler through registerAction (agent-base.js); executeAction in
 * agent-actions.js looks the tool up. A handler gets (bridge, action, tool, args) and returns the result object.
 * Part of the agent (see agent.parts.json); names are shared through window.PriorityAgentParts.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var EFFECT_IDS = S.EFFECT_IDS;
  var TOOL_LABELS = S.TOOL_LABELS;

  // from other parts (functions, resolved at call time)
  function bridgeMissingFailure() { return S.bridgeMissingFailure.apply(this, arguments); }
  function detailForTool() { return S.detailForTool.apply(this, arguments); }
  function localizeEffectText() { return S.localizeEffectText.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizeMatchKey() { return S.normalizeMatchKey.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointLevel() { return S.normalizePointLevel.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }
  function registerAction() { return S.registerAction.apply(this, arguments); }
  function resolveEffectLanguage() { return S.resolveEffectLanguage.apply(this, arguments); }

  function registerAction() { return S.registerAction.apply(this, arguments); }

  // show_guide, schedule_check
  registerAction(['show_guide','schedule_check'], async function (bridge, action, tool, args) {
    var Guides = typeof AgentGuides !== 'undefined' ? AgentGuides : null;
    if (tool === 'show_guide') {
      var guide = Guides && Guides.normalizeGuide(args);
      if (!guide) {
        return { ok: false, tool: tool, error: 'show_guide: kind breathe ou stretch' };
      }
      return {
        ok: true,
        tool: tool,
        args: args,
        guide: guide,
        summary: TOOL_LABELS.show_guide
      };
    }
    var check = Guides && Guides.normalizeCheck(args);
    if (!check) {
      return { ok: false, tool: tool, error: 'schedule_check: seconds et message requis' };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      schedule: check,
      summary: TOOL_LABELS.schedule_check
    };
  });

  // trigger_effect
  registerAction(['trigger_effect'], async function (bridge, action, tool, args) {
    var effectRaw = args.effect || args.name || args.id;
    var effectId = normalizeEffectId(effectRaw);
    if (!effectId) {
      return {
        ok: false,
        tool: tool,
        error:
          'Effet inconnu. Valeurs\u00a0: ' + EFFECT_IDS.join(', ')
      };
    }
    var effectText = '';
    if (typeof args.text === 'string' && args.text.trim()) {
      effectText = args.text.trim().slice(0, 48);
    } else if (typeof args.label === 'string' && args.label.trim()) {
      effectText = args.label.trim().slice(0, 48);
    } else if (typeof args.message === 'string' && args.message.trim()) {
      effectText = args.message.trim().slice(0, 48);
    }
    if (effectText) {
      effectText = localizeEffectText(effectText, resolveEffectLanguage(bridge));
    }
    if (effectId === 'banner' && !effectText) {
      return {
        ok: false,
        tool: tool,
        error: 'banner exige un text (plein \u00e9cran)',
        args: { effect: effectId }
      };
    }
    var soundOverride = null;
    if (typeof args.sound === 'string' && args.sound.trim()) {
      soundOverride = normalizeEffectId(args.sound);
    } else if (typeof args.soundEffect === 'string' && args.soundEffect.trim()) {
      soundOverride = normalizeEffectId(args.soundEffect);
    } else if (typeof args.sfx === 'string' && args.sfx.trim()) {
      soundOverride = normalizeEffectId(args.sfx);
    }
    if (typeof bridge.playEffect !== 'function') {
      return bridgeMissingFailure(tool, 'Effets indisponibles', [
        'playEffect'
      ]);
    }
    var playOpts = { sound: soundOverride || true };
    if (effectText) playOpts.text = effectText;
    var played = bridge.playEffect(effectId, playOpts);
    if (played && played.ok === false) {
      return {
        ok: false,
        tool: tool,
        error: (played && played.error) || 'Effet \u00e9chou\u00e9',
        args: { effect: effectId, text: effectText || undefined }
      };
    }
    var resultArgs = { effect: effectId };
    if (effectText) resultArgs.text = effectText;
    if (soundOverride) resultArgs.sound = soundOverride;
    return {
      ok: true,
      tool: tool,
      args: resultArgs,
      summary: TOOL_LABELS.trigger_effect,
      detail: detailForTool(tool, null, null, null, null, args, {
        effect: effectId,
        text: effectText || undefined
      })
    };
  });

  // point_at
  registerAction(['point_at'], async function (bridge, action, tool, args) {
    var pointSection = normalizePointSection(
      args.section || args.target || args.area || args.panel
    );
    var pointField = normalizePointField(
      args.field || args.axis || args.dim
    );
    var pointLevel = normalizePointLevel(
      args.level != null ? args.level : args.value
    );
    if (pointLevel == null) {
      var inferredLevel = normalizePointLevel(
        args.field || args.axis || args.dim
      );
      if (inferredLevel != null) pointLevel = inferredLevel;
    }
    if (!pointSection && !pointField) {
      return {
        ok: false,
        tool: tool,
        error: 'section ou field requis'
      };
    }
    if (pointField && !pointSection) {
      pointSection = 'priority';
    }
    if (typeof bridge.pointAt !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Pointage indisponible'
      };
    }
    var pointArgs = {};
    if (pointSection) pointArgs.section = pointSection;
    if (pointField) pointArgs.field = pointField;
    if (pointLevel != null) pointArgs.level = pointLevel;
    var pointed = bridge.pointAt(pointArgs);
    if (pointed && typeof pointed.then === 'function') {
      pointed = await pointed;
    }
    if (pointed && pointed.ok === false) {
      return {
        ok: false,
        tool: tool,
        error: (pointed && pointed.error) || 'Cible introuvable',
        args: pointArgs
      };
    }
    return {
      ok: true,
      tool: tool,
      args: pointArgs,
      summary: TOOL_LABELS.point_at,
      detail: detailForTool(tool, null, null, null, null, args, {
        section: pointSection || undefined,
        field: pointField || undefined,
        level: pointLevel != null ? pointLevel : undefined
      })
    };
  });

  // set_agent_name
  registerAction(['set_agent_name'], async function (bridge, action, tool, args) {
    if (typeof bridge.setAgentName !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Changement de nom indisponible'
      };
    }
    var newAgentName =
      typeof args.name === 'string' && args.name.trim()
        ? args.name.trim()
        : typeof args.text === 'string'
          ? args.text.trim()
          : '';
    if (!newAgentName) {
      return { ok: false, tool: tool, error: 'Nouveau nom requis' };
    }
    var beforeAgentName = '';
    if (typeof bridge.getProfile === 'function') {
      try {
        var profSnap = bridge.getProfile();
        if (profSnap && typeof profSnap.agentName === 'string') {
          beforeAgentName = profSnap.agentName.trim();
        }
      } catch (e) { /* ignore */ }
    }
    var renameAgentResult = await Promise.resolve(
      bridge.setAgentName(newAgentName)
    );
    if (!renameAgentResult || !renameAgentResult.ok) {
      var agentRenameReason =
        (renameAgentResult &&
          (renameAgentResult.reason || renameAgentResult.error)) ||
        'Changement de nom \u00e9chou\u00e9';
      if (agentRenameReason === 'empty-name') {
        agentRenameReason = 'Nouveau nom requis';
      }
      return { ok: false, tool: tool, error: agentRenameReason };
    }
    var afterAgentName =
      (renameAgentResult && renameAgentResult.name) || newAgentName;
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_agent_name,
      detail: detailForTool(tool, null, null, null, null, args, {
        before: beforeAgentName,
        after: afterAgentName
      })
    };
  });

  // set_agent_color
  registerAction(['set_agent_color'], async function (bridge, action, tool, args) {
    if (typeof bridge.setAgentColor !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Changement de couleur indisponible'
      };
    }
    var newAgentColor = normalizeAgentColorArg(
      (typeof args.color === 'string' && args.color) ||
        (typeof args.aura === 'string' && args.aura) ||
        (typeof args.value === 'string' && args.value) ||
        (typeof args.text === 'string' && args.text) ||
        ''
    );
    if (!newAgentColor) {
      return {
        ok: false,
        tool: tool,
        error:
          'Couleur invalide (orange|yellow|\u2026|sky ou #RRGGBB)'
      };
    }
    var beforeAgentColor = '';
    if (typeof bridge.getProfile === 'function') {
      try {
        var colorSnap = bridge.getProfile();
        if (colorSnap && typeof colorSnap.agentColor === 'string') {
          beforeAgentColor = colorSnap.agentColor.trim();
        }
      } catch (eColor) { /* ignore */ }
    }
    var recolorResult = await Promise.resolve(
      bridge.setAgentColor(newAgentColor)
    );
    if (!recolorResult || !recolorResult.ok) {
      var recolorReason =
        (recolorResult && (recolorResult.reason || recolorResult.error)) ||
        'Changement de couleur \u00e9chou\u00e9';
      if (recolorReason === 'empty-color' || recolorReason === 'invalid-color') {
        recolorReason =
          'Couleur invalide (orange|yellow|\u2026|sky ou #RRGGBB)';
      }
      return { ok: false, tool: tool, error: recolorReason };
    }
    var afterAgentColor =
      (recolorResult && recolorResult.color) || newAgentColor;
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_agent_color,
      detail: detailForTool(tool, null, null, null, null, args, {
        before: beforeAgentColor,
        after: afterAgentColor
      })
    };
  });

  // set_agent_personality
  registerAction(['set_agent_personality'], async function (bridge, action, tool, args) {
    if (typeof bridge.setAgentPersonality !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Changement de personnalit\u00e9 indisponible'
      };
    }
    var newPersonality =
      typeof args.personality === 'string' && args.personality.trim()
        ? args.personality.trim()
        : typeof args.text === 'string' && args.text.trim()
          ? args.text.trim()
          : typeof args.value === 'string' && args.value.trim()
            ? args.value.trim()
            : '';
    if (!newPersonality) {
      return {
        ok: false,
        tool: tool,
        error: 'Personnalit\u00e9 requise'
      };
    }
    var personalityResult = await Promise.resolve(
      bridge.setAgentPersonality(newPersonality)
    );
    if (!personalityResult || !personalityResult.ok) {
      var personalityReason =
        (personalityResult &&
          (personalityResult.reason || personalityResult.error)) ||
        'Changement de personnalit\u00e9 \u00e9chou\u00e9';
      if (personalityReason === 'empty-personality') {
        personalityReason = 'Personnalit\u00e9 requise';
      }
      return { ok: false, tool: tool, error: personalityReason };
    }
    var afterPersonality =
      (personalityResult && personalityResult.personality) || newPersonality;
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_agent_personality,
      detail: detailForTool(tool, null, null, null, null, args, {
        after: afterPersonality
      })
    };
  });

  // history_undo, history_redo, history_revert
  registerAction(['history_undo','history_redo','history_revert'], async function (bridge, action, tool, args) {
    if (tool === 'history_undo') {
      if (typeof bridge.historyUndo !== 'function') {
        return { ok: false, tool: tool, error: 'Historique indisponible' };
      }
      var undoRes = await Promise.resolve(bridge.historyUndo());
      if (!undoRes) {
        return { ok: false, tool: tool, error: 'Rien \u00e0 annuler' };
      }
      return {
        ok: true,
        tool: tool,
        args: args,
        summary: TOOL_LABELS.history_undo
      };
    }
    if (tool === 'history_redo') {
      if (typeof bridge.historyRedo !== 'function') {
        return { ok: false, tool: tool, error: 'Historique indisponible' };
      }
      var redoRes = await Promise.resolve(bridge.historyRedo());
      if (!redoRes) {
        return { ok: false, tool: tool, error: 'Rien \u00e0 r\u00e9tablir' };
      }
      return {
        ok: true,
        tool: tool,
        args: args,
        summary: TOOL_LABELS.history_redo
      };
    }
    if (typeof bridge.historyRevert !== 'function') {
      return { ok: false, tool: tool, error: 'Historique indisponible' };
    }
    var entryId =
      typeof args.entryId === 'string'
        ? args.entryId.trim()
        : typeof args.id === 'string'
          ? args.id.trim()
          : '';
    if (!entryId && typeof bridge.getHistory === 'function') {
      var hist = bridge.getHistory() || {};
      var entries = Array.isArray(hist.entries) ? hist.entries : [];
      var matchLabel =
        typeof args.matchLabel === 'string'
          ? args.matchLabel.trim()
          : typeof args.label === 'string'
            ? args.label.trim()
            : '';
      if (matchLabel) {
        var needle = normalizeMatchKey(matchLabel);
        for (var hi = 0; hi < entries.length; hi++) {
          if (
            entries[hi] &&
            !entries[hi].undone &&
            normalizeMatchKey(entries[hi].label || '').indexOf(needle) >= 0
          ) {
            entryId = entries[hi].id;
            break;
          }
        }
      } else if (args.steps != null) {
        var steps = Math.max(1, Math.round(Number(args.steps)) || 1);
        var active = entries.filter(function (e) {
          return e && !e.undone;
        });
        var target = active[Math.min(steps, active.length) - 1];
        if (target) entryId = target.id;
      }
    }
    if (!entryId) {
      return {
        ok: false,
        tool: tool,
        error: 'entryId ou matchLabel requis'
      };
    }
    var revertRes = await Promise.resolve(bridge.historyRevert(entryId));
    if (!revertRes) {
      return {
        ok: false,
        tool: tool,
        error: 'Entr\u00e9e d\'historique introuvable'
      };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.history_revert,
      detail: detailForTool(tool, null, null, null, null, args, {
        entryId: entryId
      })
    };
  });
})(typeof window !== 'undefined' ? window : this);
