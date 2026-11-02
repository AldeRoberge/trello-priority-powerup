/**
 * agent-dream: part 2 of 3 (snapshotPriority).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-dream.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from other parts (functions, resolved at call time)
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }

  function snapshotPriority(bridge) {
    var s =
      typeof bridge.getPriorityState === 'function' ? bridge.getPriorityState() || {} : {};
    var links = Array.isArray(s.blockedLinks)
      ? s.blockedLinks
          .map(function (link) {
            if (!link || typeof link !== 'object') return null;
            var lid = link.id != null ? String(link.id).trim() : '';
            if (!lid) return null;
            return {
              type: 'subtask',
              id: lid,
              label:
                typeof link.label === 'string' && link.label.trim()
                  ? link.label.trim()
                  : undefined
            };
          })
          .filter(Boolean)
      : [];
    var dueVague =
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeDueVague === 'function'
        ? PriorityUI.normalizeDueVague(s.dueVague)
        : typeof s.dueVague === 'string'
          ? s.dueVague.trim()
          : '';
    var dueMode =
      dueVague || s.dueMode === 'vague'
        ? 'vague'
        : 'precise';
    return {
      urgency: s.urgency,
      impact: s.impact,
      ease: s.ease,
      empressement: s.empressement,
      estimatedDurationMinutes:
        s.estimatedDurationMinutes != null && isFinite(+s.estimatedDurationMinutes)
          ? +s.estimatedDurationMinutes
          : null,
      priorityEnabled: s.priorityEnabled !== false,
      dueDate: s.dueDate || '',
      dueTime: s.dueTime || '',
      dueEnabled: !!s.dueEnabled,
      dueMode: dueMode,
      dueVague: dueVague,
      startDate: s.startDate || '',
      startTime: s.startTime || '',
      recurrence: (function () {
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.normalizeRecurrence === 'function'
        ) {
          return PriorityUI.normalizeRecurrence(s.recurrence);
        }
        return s.recurrence && typeof s.recurrence === 'object' ? s.recurrence : null;
      })(),
      enAttente: !!s.enAttente,
      blockedReasons: Array.isArray(s.blockedReasons)
        ? s.blockedReasons.slice()
        : s.blockedReason
          ? [s.blockedReason]
          : [],
      blockedLinks: links,
      taskTypes: normalizeAgentTaskTypes(s.taskTypes),
      taskTypesLocked: s.taskTypesLocked === true
    };
  }

  function snapshotCompletion(bridge) {
    var c =
      typeof bridge.getCompletion === 'function'
        ? bridge.getCompletion() || { items: [] }
        : { items: [] };
    return {
      progress: c.progress,
      progressEnabled: c.progressEnabled !== false,
      estimatedMinutes:
        c.estimatedMinutes != null && isFinite(+c.estimatedMinutes)
          ? +c.estimatedMinutes
          : null,
      estimatedMinutesOffset:
        typeof c.estimatedMinutesOffset === 'number' &&
        isFinite(c.estimatedMinutesOffset)
          ? c.estimatedMinutesOffset
          : null,
      items: (c.items || []).map(function (it) {
        return {
          id: it.id,
          text: it.text,
          done: !!it.done,
          progress: it.progress != null ? it.progress : 0,
          estimatedMinutes:
            it.estimatedMinutes != null && isFinite(+it.estimatedMinutes)
              ? +it.estimatedMinutes
              : null
        };
      })
    };
  }

  function resolveEstimateMinutesArg(args) {
    args = args || {};
    if (args.estimatedMinutes === null || args.estimatedMinutes === '') {
      return null;
    }
    if (args.estimatedMinutes !== undefined && args.estimatedMinutes !== '') {
      if (
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.clampEstimatedMinutes === 'function'
      ) {
        return CompletionTrello.clampEstimatedMinutes(args.estimatedMinutes);
      }
      var n = +args.estimatedMinutes;
      return isFinite(n) && n > 0 ? Math.round(n) : null;
    }
    var text =
      typeof args.estimatedDuration === 'string'
        ? args.estimatedDuration
        : typeof args.duration === 'string'
          ? args.duration
          : '';
    if (!text.trim()) return undefined;
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.parseDurationNl === 'function'
    ) {
      var parsed = PriorityUI.parseDurationNl(text);
      if (
        typeof CompletionTrello !== 'undefined' &&
        typeof CompletionTrello.clampEstimatedMinutes === 'function'
      ) {
        return CompletionTrello.clampEstimatedMinutes(parsed);
      }
      return parsed;
    }
    return undefined;
  }

  function fmtVal(v) {
    if (v == null || v === '') return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return '[' + v.join(', ') + ']';
    return String(v);
  }

  function pushChange(parts, key, before, after) {
    if (before === after) return;
    if (
      Array.isArray(before) &&
      Array.isArray(after) &&
      JSON.stringify(before) === JSON.stringify(after)
    ) {
      return;
    }
    parts.push(key + ' ' + fmtVal(before) + ' \u2192 ' + fmtVal(after));
  }

  function findItem(items, id) {
    for (var i = 0; i < (items || []).length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  /** Normalize subtask title for exact duplicate checks (trim + locale lower). */
  function normalizeSubtaskTitleKey(text) {
    return String(text || '')
      .trim()
      .toLocaleLowerCase('fr-FR');
  }

  /** Find an existing progress item by exact title (case/accent insensitive). */
  function findExistingSubtaskByText(items, text) {
    var needle = normalizeSubtaskTitleKey(text);
    if (!needle) return null;
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item) continue;
      if (normalizeSubtaskTitleKey(item.text) === needle) return item;
    }
    return null;
  }

  /** Resolve a subtask by id, or by case-insensitive text match (exact then contains). */
  function resolveSubtaskItem(items, args) {
    var list = items || [];
    var id = args && typeof args.id === 'string' ? args.id.trim() : '';
    if (id) {
      var byId = findItem(list, id);
      if (byId) return byId;
    }
    var matchRaw =
      args && typeof args.matchText === 'string'
        ? args.matchText.trim()
        : args && typeof args.from === 'string'
          ? args.from.trim()
          : '';
    if (!matchRaw) return null;
    var needle = matchRaw.toLocaleLowerCase('fr-FR');
    var exact = null;
    var contains = null;
    for (var i = 0; i < list.length; i++) {
      var text = String(list[i].text || '').trim();
      var key = text.toLocaleLowerCase('fr-FR');
      if (key === needle) {
        exact = list[i];
        break;
      }
      if (!contains && key.indexOf(needle) !== -1) contains = list[i];
    }
    return exact || contains;
  }

  /** Resolve blockedLinks args against live subtasks (id or matchText). */
  function resolveBlockedLinkArgs(rawLinks, items) {
    if (!Array.isArray(rawLinks)) return null;
    var out = [];
    var seen = {};
    for (var i = 0; i < rawLinks.length; i++) {
      var raw = rawLinks[i];
      if (!raw || typeof raw !== 'object') continue;
      var target = resolveSubtaskItem(items, raw);
      if (!target && typeof raw.id === 'string' && raw.id.trim()) {
        target = { id: raw.id.trim(), text: raw.label || '' };
      }
      if (!target || !target.id) continue;
      var id = String(target.id);
      if (seen[id]) continue;
      seen[id] = true;
      var label =
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label.trim()
          : target.text
            ? String(target.text).trim()
            : undefined;
      out.push({
        type: 'subtask',
        id: id,
        label: label
      });
    }
    return out;
  }

  function resolveHeatSegment(tier, heatTarget) {
    var segs =
      typeof PriorityUI !== 'undefined' && Array.isArray(PriorityUI.HEAT_SEGMENTS)
        ? PriorityUI.HEAT_SEGMENTS
        : [];
    if (heatTarget != null && isFinite(Number(heatTarget))) {
      var target = Number(heatTarget);
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < segs.length; i++) {
        var dist = Math.abs(segs[i].target - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = segs[i];
        }
      }
      if (best && bestDist < 0.6) return best;
    }
    if (typeof tier !== 'string' || !tier.trim()) return null;
    var needle = tier.trim().toLocaleLowerCase('fr-FR');
    var aliases = {
      critique: 'Critique',
      urgente: 'Urgente',
      urgent: 'Urgente',
      prioritaire: 'Prioritaire',
      importante: 'Importante',
      important: 'Importante',
      flexible: 'Flexible',
      secondaire: 'Secondaire',
      optionnelle: 'Optionnelle',
      optionnel: 'Optionnelle'
    };
    if (aliases[needle]) needle = aliases[needle].toLocaleLowerCase('fr-FR');
    for (var j = 0; j < segs.length; j++) {
      var label = String(segs[j].label || '').toLocaleLowerCase('fr-FR');
      if (label === needle) return segs[j];
    }
    return null;
  }

  function resolveStatutListId(statut, args) {
    if (!statut || typeof statut !== 'object') return null;
    var lists = Array.isArray(statut.lists) ? statut.lists : [];
    var roleLists =
      statut.roleLists && typeof statut.roleLists === 'object'
        ? statut.roleLists
        : {};

    if (typeof args.listId === 'string' && args.listId.trim()) {
      var wantId = args.listId.trim();
      for (var i = 0; i < lists.length; i++) {
        if (String(lists[i].id) === wantId) return wantId;
      }
      return wantId;
    }

    if (typeof args.category === 'string' && args.category.trim()) {
      var catRaw = args.category.trim().toLocaleLowerCase('fr-FR');
      var roleAlias = {
        blocked: 'blocked',
        bloque: 'blocked',
        'bloqu\u00e9': 'blocked',
        bloquee: 'blocked',
        completed: 'completed',
        complete: 'completed',
        termine: 'completed',
        'termin\u00e9': 'completed',
        terminee: 'completed',
        done: 'completed',
        triage: 'triage',
        backlog: 'backlog',
        unstarted: 'unstarted',
        'a faire': 'unstarted',
        todo: 'unstarted',
        started: 'started',
        active: 'started',
        'en cours': 'started',
        waiting: 'waiting',
        attente: 'waiting',
        canceled: 'canceled',
        cancelled: 'canceled',
        annule: 'canceled'
      };
      var role = roleAlias[catRaw] || catRaw;
      // Role lists only define blocked/completed targets.
      if (
        (role === 'blocked' || role === 'completed') &&
        roleLists[role]
      ) {
        return String(roleLists[role]);
      }
      for (var c = 0; c < lists.length; c++) {
        var listCat = lists[c].category
          ? String(lists[c].category).toLocaleLowerCase('fr-FR')
          : '';
        if (listCat === role || listCat === catRaw) return String(lists[c].id);
      }
    }

    if (typeof args.matchList === 'string' && args.matchList.trim()) {
      var needle = args.matchList.trim().toLocaleLowerCase('fr-FR');
      var exact = null;
      var contains = null;
      for (var m = 0; m < lists.length; m++) {
        var name = String(lists[m].name || '')
          .trim()
          .toLocaleLowerCase('fr-FR');
        if (name === needle) {
          exact = lists[m];
          break;
        }
        if (!contains && name.indexOf(needle) !== -1) contains = lists[m];
      }
      var hit = exact || contains;
      return hit ? String(hit.id) : null;
    }

    return null;
  }

  // exports
  S.findExistingSubtaskByText = findExistingSubtaskByText;
  S.findItem = findItem;
  S.fmtVal = fmtVal;
  S.normalizeSubtaskTitleKey = normalizeSubtaskTitleKey;
  S.pushChange = pushChange;
  S.resolveBlockedLinkArgs = resolveBlockedLinkArgs;
  S.resolveEstimateMinutesArg = resolveEstimateMinutesArg;
  S.resolveHeatSegment = resolveHeatSegment;
  S.resolveStatutListId = resolveStatutListId;
  S.resolveSubtaskItem = resolveSubtaskItem;
  S.snapshotCompletion = snapshotCompletion;
  S.snapshotPriority = snapshotPriority;
})(typeof window !== 'undefined' ? window : this);
