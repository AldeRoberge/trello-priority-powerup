/**
 * agent-dream: part 3 of 3 (detailForTool).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-dream.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var MAX_TURN_ACTIONS = S.MAX_TURN_ACTIONS;

  // from other parts (functions, resolved at call time)
  function findItem() { return S.findItem.apply(this, arguments); }
  function pushChange() { return S.pushChange.apply(this, arguments); }
  function normalizeAgentColorArg() { return S.normalizeAgentColorArg.apply(this, arguments); }
  function normalizeEffectId() { return S.normalizeEffectId.apply(this, arguments); }
  function normalizePointField() { return S.normalizePointField.apply(this, arguments); }
  function normalizePointLevel() { return S.normalizePointLevel.apply(this, arguments); }
  function normalizePointSection() { return S.normalizePointSection.apply(this, arguments); }

  function detailForTool(tool, beforeP, afterP, beforeC, afterC, args, extra) {
    var parts = [];
    args = args || {};
    extra = extra || {};
    if (tool === 'set_priority') {
      pushChange(parts, 'priorityEnabled', beforeP.priorityEnabled, afterP.priorityEnabled);
      pushChange(parts, 'empressement', beforeP.empressement, afterP.empressement);
      pushChange(parts, 'impact', beforeP.impact, afterP.impact);
      pushChange(parts, 'ease', beforeP.ease, afterP.ease);
      pushChange(
        parts,
        'estimatedDurationMinutes',
        beforeP.estimatedDurationMinutes,
        afterP.estimatedDurationMinutes
      );
    } else if (tool === 'set_task_types') {
      pushChange(
        parts,
        'taskTypes',
        (beforeP.taskTypes || []).join(','),
        (afterP.taskTypes || []).join(',')
      );
    } else if (tool === 'set_due') {
      pushChange(parts, 'dueEnabled', beforeP.dueEnabled, afterP.dueEnabled);
      pushChange(parts, 'dueDate', beforeP.dueDate, afterP.dueDate);
      pushChange(parts, 'dueTime', beforeP.dueTime, afterP.dueTime);
      pushChange(parts, 'dueMode', beforeP.dueMode, afterP.dueMode);
      pushChange(parts, 'dueVague', beforeP.dueVague, afterP.dueVague);
      pushChange(parts, 'startDate', beforeP.startDate, afterP.startDate);
      pushChange(parts, 'startTime', beforeP.startTime, afterP.startTime);
      pushChange(
        parts,
        'recurrence',
        beforeP.recurrence
          ? JSON.stringify(beforeP.recurrence)
          : '',
        afterP.recurrence ? JSON.stringify(afterP.recurrence) : ''
      );
    } else if (tool === 'set_blocked') {
      pushChange(parts, 'enAttente', beforeP.enAttente, afterP.enAttente);
      pushChange(
        parts,
        'blockedReasons',
        beforeP.blockedReasons,
        afterP.blockedReasons
      );
      pushChange(
        parts,
        'blockedLinks',
        (beforeP.blockedLinks || []).map(function (l) {
          return l.id + (l.label ? ':' + l.label : '');
        }),
        (afterP.blockedLinks || []).map(function (l) {
          return l.id + (l.label ? ':' + l.label : '');
        })
      );
      if (beforeC && afterC) {
        pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      }
    } else if (tool === 'set_progress') {
      pushChange(
        parts,
        'progressEnabled',
        beforeC.progressEnabled,
        afterC.progressEnabled
      );
      pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      if (
        (beforeC.items && beforeC.items.length) ||
        (afterC.items && afterC.items.length)
      ) {
        parts.push(
          'items ' +
            (beforeC.items || []).length +
            ' \u2192 ' +
            (afterC.items || []).length
        );
      }
    } else if (tool === 'set_formula') {
      parts.push('formula \u2192 ' + ((extra && extra.formula) || args.formula || '?'));
    } else if (tool === 'set_statut') {
      parts.push(
        'list \u2192 ' +
          ((extra && extra.listName) || args.matchList || args.category || args.listId || '?')
      );
      if (extra && extra.listId) parts.push('id: ' + extra.listId);
    } else if (tool === 'rename_card') {
      var beforeCard =
        (extra && typeof extra.before === 'string' && extra.before) ||
        '';
      var afterCard =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        '?';
      if (beforeCard) {
        parts.push('"' + beforeCard + '" \u2192 "' + afterCard + '"');
      } else {
        parts.push('name \u2192 "' + afterCard + '"');
      }
    } else if (tool === 'set_description') {
      var beforeDesc =
        (extra && typeof extra.before === 'string' && extra.before) || '';
      var afterDesc =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.desc === 'string' && args.desc) ||
        (typeof args.description === 'string' && args.description) ||
        (typeof args.text === 'string' && args.text) ||
        '';
      var preview = function (s) {
        var t = String(s || '').replace(/\s+/g, ' ').trim();
        if (!t) return '(vide)';
        return t.length > 80 ? t.slice(0, 79) + '\u2026' : t;
      };
      if (beforeDesc) {
        parts.push('"' + preview(beforeDesc) + '" \u2192 "' + preview(afterDesc) + '"');
      } else {
        parts.push('desc \u2192 "' + preview(afterDesc) + '"');
      }
    } else if (tool === 'add_subtask') {
      var text = typeof args.text === 'string' ? args.text.trim() : '';
      parts.push('+ "' + text + '"' + (extra.id ? ' (id: ' + extra.id + ')' : ''));
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    } else if (tool === 'rename_subtask') {
      var beforeRename = findItem(beforeC.items, (extra && extra.id) || args.id);
      var afterRename = findItem(afterC.items, (extra && extra.id) || args.id);
      if (beforeRename && afterRename) {
        parts.push('id: ' + afterRename.id);
        parts.push(
          '"' +
            (beforeRename.text || '') +
            '" \u2192 "' +
            (afterRename.text || '') +
            '"'
        );
      } else {
        parts.push('id: ' + ((extra && extra.id) || args.id || '?'));
      }
    } else if (tool === 'remove_subtask') {
      var removed = findItem(beforeC.items, (extra && extra.id) || args.id);
      parts.push(
        '- "' +
          ((removed && removed.text) || args.matchText || '?') +
          '"' +
          (extra && extra.id ? ' (id: ' + extra.id + ')' : '')
      );
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    } else if (
      tool === 'toggle_subtask' ||
      tool === 'set_subtask_progress' ||
      tool === 'set_subtask_blocked'
    ) {
      var tid = (extra && extra.id) || args.id;
      var beforeItem = findItem(beforeC.items, tid);
      var afterItem = findItem(afterC.items, tid);
      if (beforeItem && afterItem) {
        parts.push('id: ' + tid);
        if (beforeItem.text) parts.push('"' + beforeItem.text + '"');
        pushChange(parts, 'done', beforeItem.done, afterItem.done);
        pushChange(parts, 'progress', beforeItem.progress, afterItem.progress);
        pushChange(parts, 'blocked', !!beforeItem.blocked, !!afterItem.blocked);
      } else {
        parts.push('id: ' + (tid || '?'));
      }
    } else if (tool === 'complete_all_subtasks' || tool === 'reset_progress') {
      pushChange(parts, 'progress', beforeC.progress, afterC.progress);
      parts.push('items ' + beforeC.items.length + ' \u2192 ' + afterC.items.length);
    } else if (tool === 'trigger_effect') {
      var effectId =
        (extra && extra.effect) ||
        normalizeEffectId(args.effect || args.name || args.id) ||
        '?';
      parts.push('effect \u2192 ' + effectId);
      var fxText =
        (extra && extra.text) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        (typeof args.label === 'string' && args.label.trim()) ||
        '';
      if (fxText) parts.push('text \u2192 ' + fxText);
    } else if (tool === 'point_at') {
      var pointSection =
        (extra && extra.section) ||
        normalizePointSection(args.section || args.target || args.area) ||
        '';
      var pointField =
        (extra && extra.field) ||
        normalizePointField(args.field || args.axis) ||
        '';
      var pointLevel =
        extra && extra.level != null
          ? extra.level
          : normalizePointLevel(args.level != null ? args.level : args.value);
      if (pointSection) parts.push('section \u2192 ' + pointSection);
      if (pointField) parts.push('field \u2192 ' + pointField);
      if (pointLevel != null) parts.push('level \u2192 ' + pointLevel);
    } else if (tool === 'set_agent_name') {
      var beforeAgent =
        (extra && typeof extra.before === 'string' && extra.before) || '';
      var afterAgent =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        '?';
      if (beforeAgent) {
        parts.push('"' + beforeAgent + '" \u2192 "' + afterAgent + '"');
      } else {
        parts.push('name \u2192 "' + afterAgent + '"');
      }
    } else if (tool === 'set_agent_color') {
      var beforeColor =
        (extra && typeof extra.before === 'string' && extra.before) || '';
      var afterColor =
        (extra && typeof extra.after === 'string' && extra.after) ||
        normalizeAgentColorArg(
          (args && (args.color || args.aura || args.value || args.text)) || ''
        ) ||
        '?';
      if (beforeColor) {
        parts.push(beforeColor + ' \u2192 ' + afterColor);
      } else {
        parts.push('color \u2192 ' + afterColor);
      }
    } else if (tool === 'set_agent_personality') {
      var afterPersonality =
        (extra && typeof extra.after === 'string' && extra.after) ||
        (typeof args.personality === 'string' && args.personality.trim()) ||
        (typeof args.text === 'string' && args.text.trim()) ||
        (typeof args.value === 'string' && args.value.trim()) ||
        '?';
      if (afterPersonality.length > 48) {
        afterPersonality = afterPersonality.slice(0, 47) + '\u2026';
      }
      parts.push('personality \u2192 "' + afterPersonality + '"');
    } else if (tool === 'upsert_person') {
      var personAfter =
        (extra && extra.person && typeof extra.person === 'object'
          ? extra.person
          : null) || null;
      var personBefore =
        (extra && extra.before && typeof extra.before === 'object'
          ? extra.before
          : null) || null;
      var personName =
        (personAfter && personAfter.name) ||
        (typeof extra.name === 'string' && extra.name.trim()) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.matchText === 'string' && args.matchText.trim()) ||
        '?';
      if (extra && extra.created) {
        parts.push('"' + personName + '" cr\u00e9\u00e9e');
        if (personAfter) {
          if (personAfter.relation) {
            parts.push('relation: ' + personAfter.relation);
          }
          if (personAfter.aliases && personAfter.aliases.length) {
            parts.push('aliases: ' + personAfter.aliases.join(', '));
          }
          if (personAfter.roles && personAfter.roles.length) {
            parts.push('roles: ' + personAfter.roles.join(', '));
          }
          if (personAfter.email) parts.push('email: ' + personAfter.email);
          if (personAfter.phone) parts.push('phone: ' + personAfter.phone);
        } else {
          if (typeof args.relation === 'string' && args.relation.trim()) {
            parts.push('relation: ' + args.relation.trim());
          }
          if (typeof args.addAlias === 'string' && args.addAlias.trim()) {
            parts.push('+alias: ' + args.addAlias.trim());
          }
        }
      } else if (personBefore && personAfter) {
        var personChanges = [];
        pushChange(personChanges, 'name', personBefore.name, personAfter.name);
        pushChange(
          personChanges,
          'relation',
          personBefore.relation || '',
          personAfter.relation || ''
        );
        pushChange(
          personChanges,
          'aliases',
          personBefore.aliases || [],
          personAfter.aliases || []
        );
        pushChange(
          personChanges,
          'roles',
          personBefore.roles || [],
          personAfter.roles || []
        );
        pushChange(
          personChanges,
          'email',
          personBefore.email || '',
          personAfter.email || ''
        );
        pushChange(
          personChanges,
          'phone',
          personBefore.phone || '',
          personAfter.phone || ''
        );
        pushChange(
          personChanges,
          'notes',
          personBefore.notes || '',
          personAfter.notes || ''
        );
        if (personChanges.length) {
          parts.push('"' + personName + '" mise \u00e0 jour');
          Array.prototype.push.apply(parts, personChanges);
        } else {
          parts.push('"' + personName + '" d\u00e9j\u00e0 \u00e0 jour');
        }
      } else {
        parts.push('"' + personName + '" mise \u00e0 jour');
        if (typeof args.relation === 'string' && args.relation.trim()) {
          parts.push('relation: ' + args.relation.trim());
        }
        if (typeof args.addAlias === 'string' && args.addAlias.trim()) {
          parts.push('+alias: ' + args.addAlias.trim());
        }
        if (typeof args.addRole === 'string' && args.addRole.trim()) {
          parts.push('+role: ' + args.addRole.trim());
        }
        if (typeof args.email === 'string' && args.email.trim()) {
          parts.push('email: ' + args.email.trim());
        }
        if (typeof args.phone === 'string' && args.phone.trim()) {
          parts.push('phone: ' + args.phone.trim());
        }
      }
    } else if (tool === 'remove_person') {
      var removeLabel =
        (extra && typeof extra.name === 'string' && extra.name.trim()) ||
        (extra && typeof extra.match === 'string' && extra.match.trim()) ||
        (typeof args.name === 'string' && args.name.trim()) ||
        (typeof args.matchText === 'string' && args.matchText.trim()) ||
        (typeof args.id === 'string' && args.id.trim()) ||
        '?';
      parts.push('- "' + removeLabel + '"');
    } else if (tool === 'set_members' || tool === 'set_labels') {
      var memberOps = (extra && Array.isArray(extra.ops) && extra.ops) || [];
      if (memberOps.length) {
        parts.push(memberOps.join(', '));
      } else {
        parts.push(tool === 'set_labels' ? 'aucune \u00e9tiquette' : 'aucun membre');
      }
    } else if (tool === 'set_custom_assignees') {
      if (extra && extra.count != null) {
        parts.push('personnes: ' + extra.count);
      }
      if (Array.isArray(args.add) && args.add.length) {
        parts.push(
          '+ ' +
            args.add
              .map(function (s) {
                return typeof s === 'string'
                  ? s
                  : (s && (s.name || s.matchText || s.id)) || '?';
              })
              .join(', ')
        );
      }
      if (Array.isArray(args.remove) && args.remove.length) {
        parts.push(
          '- ' +
            args.remove
              .map(function (s) {
                return typeof s === 'string'
                  ? s
                  : (s && (s.name || s.matchText || s.id)) || '?';
              })
              .join(', ')
        );
      }
      if (args.clear === true) parts.push('clear');
    } else if (tool === 'set_member_roles') {
      var roleMember =
        (extra && extra.memberId) ||
        args.memberId ||
        args.matchText ||
        args.name ||
        '?';
      var roleList =
        (extra && Array.isArray(extra.roles) && extra.roles) ||
        (Array.isArray(args.roles) && args.roles) ||
        [];
      parts.push('member: ' + roleMember);
      if (args.clear === true) {
        parts.push('roles \u2192 (vid\u00e9)');
      } else {
        parts.push(
          'roles \u2192 ' + (roleList.length ? roleList.join(', ') : '(aucun)')
        );
      }
    } else if (tool === 'set_project') {
      if (extra && extra.cleared) {
        parts.push('projet \u2192 (aucun)');
      } else {
        parts.push(
          'projet \u2192 "' +
            ((extra && extra.projectName) ||
              args.name ||
              args.matchText ||
              (extra && extra.projectId) ||
              args.projectId ||
              '?') +
            '"'
        );
      }
    } else if (tool === 'set_subtask_estimate') {
      var estId = (extra && extra.id) || args.id;
      var beforeEstItem = findItem(beforeC && beforeC.items, estId);
      var afterEstItem = findItem(afterC && afterC.items, estId);
      if (beforeEstItem || afterEstItem) {
        parts.push('id: ' + (estId || '?'));
        var estLabel =
          (afterEstItem && afterEstItem.text) ||
          (beforeEstItem && beforeEstItem.text) ||
          '';
        if (estLabel) parts.push('"' + estLabel + '"');
        pushChange(
          parts,
          'estimatedMinutes',
          beforeEstItem && beforeEstItem.estimatedMinutes,
          afterEstItem && afterEstItem.estimatedMinutes
        );
      } else {
        parts.push('id: ' + (estId || '?'));
      }
    } else if (tool === 'set_progress_estimate') {
      pushChange(
        parts,
        'estimatedMinutes',
        beforeC && beforeC.estimatedMinutes,
        afterC && afterC.estimatedMinutes
      );
    } else if (
      tool === 'add_checklist_item' ||
      tool === 'remove_checklist_item' ||
      tool === 'rename_checklist_item' ||
      tool === 'set_checklist_progress'
    ) {
      if (extra && extra.parentId) parts.push('parent: ' + extra.parentId);
      if (extra && extra.id) parts.push('id: ' + extra.id);
      if (typeof args.text === 'string' && args.text.trim()) {
        parts.push('"' + args.text.trim() + '"');
      }
      if (args.progress != null) parts.push('progress \u2192 ' + args.progress);
    } else if (
      tool === 'history_undo' ||
      tool === 'history_redo' ||
      tool === 'history_revert'
    ) {
      if (extra && extra.label) parts.push(String(extra.label));
      else if (args && args.matchLabel) parts.push(String(args.matchLabel));
      else if (args && args.entryId) parts.push('entry: ' + args.entryId);
      else if (args && args.steps != null) parts.push('steps: ' + args.steps);
      else parts.push(tool === 'history_undo' ? 'annuler' : tool === 'history_redo' ? 'r\u00e9tablir' : 'restaurer');
    }
    if (parts.length) return parts.join('; ');
    return fallbackDetailFromArgs(tool, args, extra);
  }

  /**
   * Last-resort recap when a tool has no field-level diff: surface useful args
   * instead of the opaque "aucun diff détecté".
   */
  function fallbackDetailFromArgs(tool, args, extra) {
    args = args || {};
    extra = extra || {};
    var bits = [];
    function pushStr(label, value) {
      if (value == null) return;
      var s = String(value).trim();
      if (!s) return;
      if (s.length > 60) s = s.slice(0, 59) + '\u2026';
      bits.push(label ? label + ': ' + s : s);
    }
    if (typeof extra.name === 'string') pushStr(null, '"' + extra.name.trim() + '"');
    if (typeof extra.match === 'string') pushStr(null, '"' + extra.match.trim() + '"');
    if (Array.isArray(extra.ops) && extra.ops.length) {
      bits.push(extra.ops.join(', '));
    }
    if (extra.count != null) pushStr('count', extra.count);
    if (extra.memberId) pushStr('member', extra.memberId);
    if (extra.projectName) pushStr('projet', '"' + extra.projectName + '"');
    if (extra.cleared) bits.push('cleared');
    if (extra.listName) pushStr('list', extra.listName);
    if (extra.effect) pushStr('effect', extra.effect);
    [
      'name',
      'text',
      'matchText',
      'relation',
      'category',
      'effect',
      'formula',
      'personality'
    ].forEach(function (key) {
      if (typeof args[key] === 'string' && args[key].trim()) {
        pushStr(key, args[key].trim());
      }
    });
    if (args.clear === true) bits.push('clear');
    if (bits.length) return bits.join('; ');
    return 'OK';
  }

  /**
   * True when the assistant message claims a card change was applied
   * (used to warn if actions was empty).
   */
  function looksLikeAppliedClaim(message) {
    if (typeof message !== 'string' || !message.trim()) return false;
    return /\b(ajout(\u00e9e?|er)|renomm(\u00e9e?|er)|supprim(\u00e9e?|er)|r(\u00e9|e)initialis(\u00e9e?|er)|d(\u00e9|e)plac(\u00e9e?|er)|mise?\s+[aà]\s+jour|mis\s+[aà]\s+jour|enregistr(\u00e9e?|er)|d(\u00e9|e)fini[ee]?|bloqu(\u00e9e?|er)|d(\u00e9|e)bloqu(\u00e9e?|er)|appliqu(\u00e9e?|er)|modifi(\u00e9e?|er)|termin(\u00e9e?|er)|okay,?\s*bloqu|j['’]ai\s+not\u00e9|c['’]est\s+not\u00e9|not\u00e9\s+la\s+priorit|priorit\S*\s+not\u00e9e?)/i.test(
      message
    );
  }

  /**
   * Map bridge / REST reason codes to short French labels.
   */
  var BRIDGE_REASON_LABELS = {
    unavailable: 'Fonction Trello indisponible (REST ou OAuth).',
    'no-app-key': 'Cl\u00e9 d\'application Trello manquante.',
    'not-authorized': 'Autorisation Trello (OAuth) requise.',
    'no-token': 'Jeton Trello manquant.',
    'no-card-id': 'Identifiant de carte introuvable.',
    'no-member-id': 'Identifiant de membre manquant.',
    'people-unavailable': 'Annuaire People indisponible.',
    'no-setProject': 'setProject non branch\u00e9 sur ce pont.',
    'no-setCardName': 'setCardName non branch\u00e9 sur ce pont.',
    'no-setCardDesc': 'setCardDesc non branch\u00e9 sur ce pont.',
    'no-selectStatut': 'selectStatut non branch\u00e9 sur ce pont.',
    'empty-name': 'Nom vide.',
    'invalid-color': 'Couleur invalide.',
    'empty-personality': 'Personnalit\u00e9 vide.',
    'not-found': 'Introuvable.'
  };

  function translateBridgeReason(reason) {
    if (reason == null || reason === '') return '';
    var key = String(reason).trim();
    if (BRIDGE_REASON_LABELS[key]) return BRIDGE_REASON_LABELS[key];
    return key;
  }

  function summarizeMemberSpec(spec) {
    if (spec == null) return '(vide)';
    if (typeof spec === 'string') return JSON.stringify(spec);
    if (typeof spec !== 'object') return String(spec);
    var bits = [];
    if (spec.id != null) bits.push('id=' + spec.id);
    if (spec.matchText) bits.push('matchText=' + spec.matchText);
    if (spec.name) bits.push('name=' + spec.name);
    if (spec.username) bits.push('username=' + spec.username);
    if (spec.fullName) bits.push('fullName=' + spec.fullName);
    return bits.length ? bits.join(', ') : JSON.stringify(spec).slice(0, 120);
  }

  /**
   * Structured action failure for recap + user-facing error bubbles.
   * extras: { code?, hint?, cause?, args?, detail?, reason? }
   */
  function actionFailure(tool, error, extras) {
    extras = extras || {};
    var out = {
      ok: false,
      tool: tool,
      error: error || '\u00c9chec'
    };
    if (extras.code) out.code = String(extras.code);
    if (extras.hint) out.hint = String(extras.hint);
    if (extras.cause) out.cause = String(extras.cause);
    if (extras.detail) out.detail = extras.detail;
    if (extras.args) out.args = extras.args;
    if (extras.reason) out.reason = String(extras.reason);
    return out;
  }

  function bridgeMissingFailure(tool, error, methods) {
    var list = (Array.isArray(methods) ? methods : [methods]).filter(Boolean);
    return actionFailure(tool, error, {
      code: 'bridge-missing',
      cause: 'missing: ' + list.map(function (m) {
        return 'bridge.' + m;
      }).join(' / '),
      hint:
        'Ce pont agent n\'expose pas ' +
        list.join('/') +
        '. Ouvre la carte via le popup Power-Up (pas seulement l\'assistant projet).'
    });
  }

  function bridgeOpFailure(tool, fallbackError, res) {
    var reason =
      (res && (res.reason || res.error || res.message)) || '';
    var translated = translateBridgeReason(reason);
    var hint = '';
    if (
      reason === 'not-authorized' ||
      reason === 'no-token' ||
      reason === 'no-app-key'
    ) {
      hint = 'Autorise le Power-Up \u00e0 \u00e9crire sur Trello (OAuth).';
    } else if (reason === 'unavailable') {
      hint =
        'La m\u00e9thode Trello n\'est pas disponible dans ce contexte.';
    }
    return actionFailure(tool, translated || fallbackError, {
      code: reason || 'bridge-op-failed',
      reason: reason || undefined,
      cause: reason ? 'reason: ' + reason : undefined,
      hint: hint || undefined
    });
  }

  /**
   * Fill hint/code on plain `{ ok:false, error }` results when missing.
   */
  function enrichActionError(result) {
    if (!result || result.ok || result.skipped) return result;
    var err = result.error != null ? String(result.error) : '';
    if (BRIDGE_REASON_LABELS[err] && !result.hint) {
      result.cause = result.cause || err;
      result.code = result.code || err;
      result.error = BRIDGE_REASON_LABELS[err];
      result.hint =
        'V\u00e9rifie l\'autorisation Trello et la configuration du Power-Up.';
      return result;
    }
    if (/indisponible/i.test(err) && !result.hint) {
      result.code = result.code || 'unavailable';
      result.hint =
        'La capacit\u00e9 n\'est pas branch\u00e9e sur ce pont agent, ou une d\u00e9pendance Trello manque.';
    }
    if (/introuvable/i.test(err) && !result.hint) {
      result.code = result.code || 'not-found';
      result.hint =
        'Aucun \u00e9l\u00e9ment du contexte ne correspond aux args fournis.';
    }
    return result;
  }

  function formatFailureLines(tool, error, extras) {
    extras = extras || {};
    var lines = [];
    var head = '\u2717 ' + (tool || '?') + ': ' + (error || '\u00e9chec');
    if (extras.code) head += ' [' + extras.code + ']';
    lines.push(head);
    if (extras.cause) lines.push('  cause: ' + extras.cause);
    if (extras.hint) lines.push('  \u2192 ' + extras.hint);
    return lines;
  }

  /**
   * Reason text for a dropped (never executed) action — without the tool prefix.
   * Prefer explicit error; fall back to known reason codes (never silent).
   */
  function describeDroppedAction(d) {
    if (!d) return 'abandonn\u00e9e';
    if (d.error) {
      var err = String(d.error);
      if (d.tool && err.indexOf(d.tool + ':') === 0) {
        return err.slice(d.tool.length + 1).trim();
      }
      return err;
    }
    if (d.reason === 'project-scope' || d.code === 'project-scope') {
      return 'indisponible en mode projet';
    }
    if (d.reason === 'action-limit' || d.code === 'action-limit') {
      return 'limite de ' + MAX_TURN_ACTIONS + ' actions par tour';
    }
    if (d.reason === 'interview-disallowed' || d.code === 'interview-disallowed') {
      return 'non autoris\u00e9 pendant l\'interview';
    }
    if (d.reason) return String(d.reason);
    return 'args incomplets';
  }

  function droppedActionHint(d) {
    if (!d) return '';
    if (d.hint) return String(d.hint);
    if (d.reason === 'project-scope' || d.code === 'project-scope') {
      return 'Ouvre la carte dans le popup Power-Up pour appliquer cet outil. L\'assistant projet ne modifie pas les cartes.';
    }
    if (d.reason === 'action-limit' || d.code === 'action-limit') {
      return 'Renvoie les \u00e9l\u00e9ments restants dans un prochain message pour les appliquer.';
    }
    return '';
  }

  /**
   * Technical recap from executeActions results (executor is source of truth).
   * Failures include code / cause / hint when present (rich errors).
   */
  function formatChangeRecap(applied, options) {
    options = options || {};
    var lines = [];
    var results = (applied && applied.results) || [];
    results.forEach(function (r) {
      if (!r || r.skipped) return;
      var tool = r.tool || '?';
      if (r.ok) {
        lines.push('\u2713 ' + tool + (r.detail ? ': ' + r.detail : ''));
      } else {
        Array.prototype.push.apply(
          lines,
          formatFailureLines(tool, r.error, r)
        );
      }
    });
    (options.droppedActions || []).forEach(function (d) {
      if (!d) return;
      Array.prototype.push.apply(
        lines,
        formatFailureLines(d.tool, describeDroppedAction(d), {
          code: d.code || d.reason,
          cause: d.cause,
          hint: droppedActionHint(d)
        })
      );
    });
    if (!lines.length) {
      if (options.emptyClaim) {
        return 'Aucun outil ex\u00e9cut\u00e9 \u2014 rien n\'a \u00e9t\u00e9 modifi\u00e9 sur la carte.';
      }
      return '';
    }
    return lines.join('\n');
  }

  /**
   * User-facing summary of failed / dropped actions (visible chat error).
   */
  function formatActionErrors(applied, options) {
    options = options || {};
    var parts = [];
    var results = (applied && applied.results) || [];
    results.forEach(function (r) {
      if (!r || r.ok || r.skipped) return;
      var tool = r.tool || '?';
      var block = tool + '\u00a0: ' + (r.error || '\u00e9chec');
      if (r.hint) block += '\n' + r.hint;
      else if (r.cause) block += '\n(' + r.cause + ')';
      parts.push(block);
    });
    (options.droppedActions || []).forEach(function (d) {
      if (!d) return;
      var block = (d.tool || '?') + '\u00a0: ' + describeDroppedAction(d);
      var hint = droppedActionHint(d);
      if (hint) block += '\n' + hint;
      parts.push(block);
    });
    if (!parts.length) return '';
    var header =
      parts.length === 1
        ? 'Une action a \u00e9chou\u00e9\u00a0:'
        : parts.length + ' actions ont \u00e9chou\u00e9\u00a0:';
    return header + '\n\n' + parts.join('\n\n');
  }

  // exports
  S.BRIDGE_REASON_LABELS = BRIDGE_REASON_LABELS;
  S.actionFailure = actionFailure;
  S.bridgeMissingFailure = bridgeMissingFailure;
  S.bridgeOpFailure = bridgeOpFailure;
  S.describeDroppedAction = describeDroppedAction;
  S.detailForTool = detailForTool;
  S.droppedActionHint = droppedActionHint;
  S.enrichActionError = enrichActionError;
  S.fallbackDetailFromArgs = fallbackDetailFromArgs;
  S.formatActionErrors = formatActionErrors;
  S.formatChangeRecap = formatChangeRecap;
  S.formatFailureLines = formatFailureLines;
  S.looksLikeAppliedClaim = looksLikeAppliedClaim;
  S.summarizeMemberSpec = summarizeMemberSpec;
  S.translateBridgeReason = translateBridgeReason;
})(typeof window !== 'undefined' ? window : this);
