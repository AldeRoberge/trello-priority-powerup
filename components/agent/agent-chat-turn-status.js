/**
 * agent-chat-turn: part 2 of 3 (filterNoOpImprovementSuggestions).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-chat-turn.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from other parts (functions, resolved at call time)
  function addDaysIsoLocal() { return S.addDaysIsoLocal.apply(this, arguments); }
  function daysBetweenIsoLocal() { return S.daysBetweenIsoLocal.apply(this, arguments); }
  function describeRecentCardChanges() { return S.describeRecentCardChanges.apply(this, arguments); }
  function filterImprovementsAgainstRecentChanges() { return S.filterImprovementsAgainstRecentChanges.apply(this, arguments); }
  function isNoOpImprovementAction() { return S.isNoOpImprovementAction.apply(this, arguments); }
  function listCardImprovementGaps() { return S.listCardImprovementGaps.apply(this, arguments); }
  function listRecentCardChanges() { return S.listRecentCardChanges.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function ensureFollowUpActionVerb() { return S.ensureFollowUpActionVerb.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function isWorthySuggestion() { return S.isWorthySuggestion.apply(this, arguments); }
  function normalizeActionsWithMeta() { return S.normalizeActionsWithMeta.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function nowTimeLocal() { return S.nowTimeLocal.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function polishFollowUpActions() { return S.polishFollowUpActions.apply(this, arguments); }
  function todayIsoLocal() { return S.todayIsoLocal.apply(this, arguments); }

  /** Keep suggestions that have at least one action that would change the card. */
  function filterNoOpImprovementSuggestions(list, context) {
    if (!Array.isArray(list) || !list.length) return [];
    return list.filter(function (item) {
      if (!item || !Array.isArray(item.actions) || !item.actions.length) {
        return false;
      }
      for (var i = 0; i < item.actions.length; i++) {
        if (!isNoOpImprovementAction(item.actions[i], context)) return true;
      }
      return false;
    });
  }

  /**
   * Few-shot JSON shaped by real gaps — avoids always teaching "set due tomorrow".
   */
  function buildImprovementExampleJson(context, gaps, today, tomorrow) {
    var first = gaps && gaps.length ? gaps[0] : '';
    if (!first) {
      return '{"suggestions":[]}';
    }
    if (first.indexOf('échéance absente') === 0) {
      return (
        '{"suggestions":[{"label":"D\u00e9finir l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
        tomorrow +
        '","dueEnabled":true}}]}]}'
      );
    }
    if (first.indexOf('échéance passée') === 0) {
      return (
        '{"suggestions":[{"label":"Reporter l\'\u00e9ch\u00e9ance \u00e0 demain","actions":[{"tool":"set_due","args":{"dueDate":"' +
        tomorrow +
        '","dueEnabled":true}}]}]}'
      );
    }
    if (first.indexOf('priorité') === 0) {
      return '{"suggestions":[{"label":"D\u00e9finir la priorit\u00e9","actions":[{"tool":"set_priority","args":{"priorityEnabled":true,"urgency":2,"impact":2,"ease":3}}]}]}';
    }
    if (first.indexOf('statut Terminé') === 0) {
      return '{"suggestions":[{"label":"Marquer les sous-t\u00e2ches termin\u00e9es","actions":[{"tool":"complete_all_subtasks","args":{}}]}]}';
    }
    if (first.indexOf('projet') >= 0 && context.goals && context.goals.projects && context.goals.projects[0]) {
      var proj = context.goals.projects[0];
      var match = proj.name || proj.id || '';
      return (
        '{"suggestions":[{"label":"Lier au projet ' +
        String(match).replace(/"/g, '') +
        '","actions":[{"tool":"set_project","args":{"matchText":"' +
        String(match).replace(/"/g, '') +
        '"}}]}]}'
      );
    }
    if (first.indexOf('bloqué sans cause') === 0) {
      return '{"suggestions":[{"label":"Pr\u00e9ciser la cause de blocage","actions":[{"tool":"set_blocked","args":{"enAttente":true,"blockedReasons":["En attente d\'une r\u00e9ponse"]}}]}]}';
    }
    if (first.indexOf('sous-tâches') >= 0 || first.indexOf('progrès') >= 0) {
      return '{"suggestions":[{"label":"Ajouter une sous-t\u00e2che concr\u00e8te","actions":[{"tool":"add_subtask","args":{"text":"Clarifier la prochaine \u00e9tape"}}]}]}';
    }
    return '{"suggestions":[]}';
  }

  /**
   * On-card-open / Coup de pouce: AI proposes applyable improvements.
   * Pass options.previousContext when reacting to a user edit so we never
   * re-offer the field they just changed.
   * @returns {Promise<Array<{label:string, actions:Array}>>}
   */
  async function suggestCardImprovements(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var previousContext =
      options.previousContext && typeof options.previousContext === 'object'
        ? options.previousContext
        : null;
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var context = buildContext(bridge);
    var today = (context && context.today) || todayIsoLocal();
    var tomorrow = addDaysIsoLocal(today, 1);
    var nowTime = (context && context.nowTime) || nowTimeLocal();
    var dueAlready = context.due && context.due.enabled && context.due.dueDate;
    var gaps = listCardImprovementGaps(context);
    var recentLines = describeRecentCardChanges(previousContext, context);
    var recentKeys = listRecentCardChanges(previousContext, context);
    // Gaps the model should ignore because the user just handled that field.
    var gapsForPrompt = gaps.filter(function (gap) {
      if (recentKeys.indexOf('due') >= 0 && /échéance/i.test(gap)) return false;
      if (recentKeys.indexOf('priority') >= 0 && /priorité/i.test(gap)) return false;
      if (recentKeys.indexOf('blocked') >= 0 && /bloqu/i.test(gap)) return false;
      if (recentKeys.indexOf('project') >= 0 && /projet/i.test(gap)) return false;
      if (recentKeys.indexOf('statut') >= 0 && /statut/i.test(gap)) return false;
      return true;
    });
    var exampleJson = buildImprovementExampleJson(
      context,
      gapsForPrompt,
      today,
      tomorrow
    );
    var systemLines = [
      'Tu analyses une carte Trello (Power-Up Cerveau) et proposes le PROCHAIN coup de pouce utile.',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      exampleJson,
      'R\u00e8gles\u00a0:',
      '- 0 \u00e0 3 suggestions max. Si rien d\'utile (carte d\u00e9j\u00e0 en ordre, ou seul le champ que l\'utilisateur vient de changer)\u00a0: {"suggestions":[]}.',
      '- Chaque suggestion DOIT avoir actions non vides (outils ex\u00e9cutables), pas seulement une question.',
      '- label\u00a0: verbe \u00e0 l\'infinitif, court, en fran\u00e7ais.',
      '- Outils autoris\u00e9s\u00a0: set_due, set_priority, set_blocked, set_progress, add_subtask, set_project, set_statut, complete_all_subtasks.',
      '- Priorise les vrais manques / incoh\u00e9rences list\u00e9s ci-dessous. Ne propose PAS un changement cosm\u00e9tique si un vrai trou existe.',
      '- Si context.goals.projectId est null et context.goals.projects n\'est pas vide, tu PEUX proposer de lier un projet pertinent (set_project avec matchText ou projectId).',
      '- Incoh\u00e9rence\u00a0: si statut.category=completed et sous-t\u00e2ches ouvertes, propose complete_all_subtasks OU set_statut vers started/unstarted/backlog.',
      '- Dates\u00a0: aujourd\'hui = ' +
        today +
        ', demain = ' +
        tomorrow +
        ', heure actuelle = ' +
        nowTime +
        '.',
      '- INTERDIT noop\u00a0: ne re-bloque pas si d\u00e9j\u00e0 bloqu\u00e9\u00a0; ne red\u00e9finis pas priorit\u00e9/statut/projet identiques\u00a0; ne propose pas complete_all_subtasks si tout est \u00e0 100%.',
      '- \u00c9ch\u00e9ance\u00a0: INTERDIT set_due vers une date d\u00e9j\u00e0 active' +
        (dueAlready ? ' (active\u00a0: ' + dueAlready + ')' : '') +
        '. Propose set_due SEULEMENT si absente, d\u00e9sactiv\u00e9e, pass\u00e9e, ou clairement \u00e0 d\u00e9caler \u2014 jamais pour redire «\u00a0demain\u00a0» juste apr\u00e8s que l\'utilisateur l\'ait mis.',
      '- L\'exemple JSON n\'est un mod\u00e8le de format que s\'il correspond aux manques restants\u00a0; sinon adapte ou renvoie [].',
      '- add_subtask.text obligatoire et concret si utilis\u00e9.'
    ];
    if (gapsForPrompt.length) {
      systemLines.push('Manques / incoh\u00e9rences \u00e0 combler (dans l\'ordre)\u00a0:');
      gapsForPrompt.forEach(function (gap, idx) {
        systemLines.push((idx + 1) + '. ' + gap);
      });
    } else {
      systemLines.push(
        'Aucun manque prioritaires d\u00e9tect\u00e9 \u2014 renvoie {"suggestions":[]} sauf vraie incoh\u00e9rence absente de cette liste.'
      );
    }
    if (recentLines.length) {
      systemLines.push(
        'CHANGEMENTS TOUT JUSTE FAITS PAR L\'UTILISATEUR (ne pas les refaire, ni les redemander)\u00a0:'
      );
      recentLines.forEach(function (line) {
        systemLines.push('- ' + line);
      });
      systemLines.push(
        'Propose plut\u00f4t le prochain compl\u00e9ment utile (autre section), ou [].'
      );
    }
    systemLines.push('Contexte carte\u00a0:');
    systemLines.push(JSON.stringify(context));

    var messages = [
      {
        role: 'system',
        content: systemLines.join('\n')
      },
      {
        role: 'user',
        content: recentLines.length
          ? 'L\'utilisateur vient de modifier la carte. Quel prochain coup de pouce utile (sans refaire ce qu\'il vient de faire)? Sinon suggestions vides.'
          : 'Y a-t-il une am\u00e9lioration concr\u00e8te \u00e0 appliquer sur cette carte? Sinon renvoie suggestions vides.'
      }
    ];
    var debug = {
      id: 'improve-' + Date.now().toString(36),
      kind: 'suggestCardImprovements',
      label: 'Suggestions applicables',
      startedAt: Date.now(),
      attempts: [],
      gaps: gapsForPrompt.slice(),
      recentChanges: recentKeys.slice()
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('suggestCardImprovements onDebug failed', cbErr);
      }
    }

    // Fast path: user just edited the only meaningful surface and nothing else to do.
    if (recentKeys.length && !gapsForPrompt.length) {
      debug.endedAt = Date.now();
      debug.latencyMs = 0;
      debug.ok = true;
      debug.skippedApi = true;
      debug.response = { suggestions: [] };
      emitDebug();
      return [];
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 420,
          temperature: 0.35
        });
        if (response.meta) debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 420,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(Object.assign({ label: 'sans json mode' }, response.meta));
          }
        } else {
          throw err;
        }
      }
    } catch (fatal) {
      debug.endedAt = Date.now();
      debug.latencyMs = Date.now() - t0;
      debug.ok = false;
      debug.error = (fatal && fatal.message) || String(fatal || 'Erreur');
      debug.request = debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null;
      emitDebug();
      throw fatal;
    }

    var parsed = parseAssistantPayload(response.content);
    var list = [];
    // Prefer applyable followUps-shaped items; also accept suggestions with actions.
    var rawItems = [];
    try {
      var data = JSON.parse(
        (function () {
          var text = typeof response.content === 'string' ? response.content.trim() : '';
          var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
          if (fence) return fence[1].trim();
          var start = text.indexOf('{');
          var end = text.lastIndexOf('}');
          return start >= 0 && end > start ? text.slice(start, end + 1) : text;
        })()
      );
      if (Array.isArray(data.suggestions)) rawItems = data.suggestions;
      else if (Array.isArray(data.followUps)) rawItems = data.followUps;
    } catch (parseErr) {
      rawItems = parsed.followUps || [];
    }
    rawItems.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var label = typeof item.label === 'string' ? item.label.trim() : '';
      if (!label && typeof item.text === 'string') label = item.text.trim();
      if (!isWorthySuggestion(label)) return;
      var actionsMeta = normalizeActionsWithMeta(item.actions);
      var actions = polishFollowUpActions(actionsMeta.actions || []);
      if (!actions.length) return;
      label = ensureFollowUpActionVerb(label, actions);
      list.push({ label: label, actions: actions });
    });

    // Re-read live card state: user may have finished editing during the API round-trip.
    var liveContext = buildContext(bridge);
    list = filterNoOpImprovementSuggestions(list, liveContext);
    list = filterImprovementsAgainstRecentChanges(
      list,
      previousContext,
      liveContext
    );
    list = list.slice(0, 3);

    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request =
      response.meta || (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      suggestions: list
    };
    debug.usage = usage;
    emitDebug();
    return list;
  }

  /**
   * Preferred non-completed Statut category when reversing a wrong "done".
   */
  function preferReopenStatutCategory(statut) {
    var lists = statut && Array.isArray(statut.lists) ? statut.lists : [];
    var preferred = ['started', 'unstarted', 'backlog', 'triage'];
    for (var p = 0; p < preferred.length; p++) {
      var want = preferred[p];
      for (var i = 0; i < lists.length; i++) {
        if (lists[i] && lists[i].category === want) return want;
      }
    }
    return 'started';
  }

  function buildDonePendingSanityFallback(mismatch, statut) {
    var pending = (mismatch && mismatch.pendingItems) || [];
    var names = pending
      .slice(0, 3)
      .map(function (item) {
        return item && item.text ? String(item.text) : '';
      })
      .filter(Boolean);
    var count = (mismatch && mismatch.pendingCount) || names.length || 0;
    var listHint =
      mismatch && mismatch.listName
        ? ' (\u00ab\u00a0' + mismatch.listName + '\u00a0\u00bb)'
        : '';
    var taskHint = '';
    if (names.length === 1) {
      taskHint = ' (\u00ab\u00a0' + names[0] + '\u00a0\u00bb)';
    } else if (names.length > 1) {
      taskHint =
        ' (\u00ab\u00a0' +
        names.join('\u00a0\u00bb, \u00ab\u00a0') +
        (count > names.length ? '\u00a0\u00bb\u2026' : '\u00a0\u00bb') +
        ')';
    }
    var reopen = preferReopenStatutCategory(statut);
    return {
      kind: 'done_pending_tasks',
      message:
        'Le statut est Termin\u00e9' +
        listHint +
        ', mais il reste ' +
        (count === 1 ? 'une sous-t\u00e2che' : count + ' sous-t\u00e2ches') +
        ' en cours' +
        taskHint +
        '. Ces t\u00e2ches sont-elles obsol\u00e8tes, ou le statut Termin\u00e9 est-il incorrect?',
      suggestions: [
        'T\u00e2ches obsol\u00e8tes',
        'Statut incorrect',
        'Ignorer pour l\'instant'
      ],
      followUps: [
        {
          label: 'Marquer les t\u00e2ches obsol\u00e8tes termin\u00e9es',
          actions: [{ tool: 'complete_all_subtasks', args: {} }]
        },
        {
          label: 'Sortir du statut Termin\u00e9',
          actions: [{ tool: 'set_statut', args: { category: reopen } }]
        }
      ],
      mismatch: mismatch || null
    };
  }

  var MAX_DREAM_DESC_LEN = 900;
  var MAX_DREAM_HISTORY_CHARS = 1200;

  function normalizeDescForCompare(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function buildDreamHistoryExcerpt(history) {
    var list = Array.isArray(history) ? history : [];
    var chunks = [];
    var budget = MAX_DREAM_HISTORY_CHARS;
    for (var i = list.length - 1; i >= 0 && budget > 0; i--) {
      var entry = list[i];
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) continue;
      var content = String(entry.content || '').trim();
      if (!content) continue;
      if (/^\[Auto-revue\b/i.test(content) || /^\[R[eê]ve\b/i.test(content)) continue;
      var line =
        (entry.role === 'user' ? 'U: ' : 'A: ') +
        content.replace(/\s+/g, ' ').slice(0, 280);
      if (line.length > budget) line = line.slice(0, budget);
      chunks.unshift(line);
      budget -= line.length + 1;
    }
    return chunks.join('\n');
  }

  /**
   * True when Description looks like the old verbose structured brief
   * (## Pourquoi / Livrable / Qui / …) that Dream used to emit.
   */
  function isVerboseStructuredDesc(desc) {
    var t = String(desc || '');
    if (t.length < 120) return false;
    var hits = 0;
    if (/#{1,3}\s*Pourquoi\b/i.test(t)) hits++;
    if (/#{1,3}\s*Livrable\b/i.test(t) || /#{1,3}\s*But\b/i.test(t)) hits++;
    if (/#{1,3}\s*Qui\b/i.test(t)) hits++;
    if (/#{1,3}\s*Contraintes?\b/i.test(t)) hits++;
    if (/#{1,3}\s*D[e\u00e9]j[a\u00e0]\s*fait\b/i.test(t)) hits++;
    if (/#{1,3}\s*Reste\b/i.test(t)) hits++;
    return hits >= 2;
  }

  var MAX_STATUS_BRIEF_LEN = 140;
  var MAX_STATUS_BRIEF_DESC_LEN = 160;

  function firstNameFromFullName(fullName) {
    var s = String(fullName || '').trim();
    if (!s) return '';
    var part = s.split(/\s+/)[0] || '';
    return part.length > 24 ? part.slice(0, 24) : part;
  }

  function truncateStatusBriefLabel(text, maxLen) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    var lim = maxLen || 60;
    if (s.length <= lim) return s;
    return s.slice(0, lim - 1).replace(/[,:;\-–—\s]+$/, '') + '\u2026';
  }

  /** Short plain excerpt of the card description for the status brief. */
  function excerptStatusBriefDesc(desc) {
    var s = String(desc || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_`>~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return truncateStatusBriefLabel(s, MAX_STATUS_BRIEF_DESC_LEN);
  }

  /**
   * Prefer concrete open leaf work; fall back to open parents.
   * Walks nested checklist items (items/children).
   */
  function collectStatusBriefNextOpenItems(items, max) {
    var out = [];
    var limit = max || 2;
    function itemText(it) {
      if (!it || typeof it !== 'object') return '';
      if (typeof it.text === 'string') return it.text.trim();
      if (typeof it.name === 'string') return it.name.trim();
      return '';
    }
    function kidsOf(it) {
      if (!it || typeof it !== 'object') return null;
      if (Array.isArray(it.items) && it.items.length) return it.items;
      if (Array.isArray(it.children) && it.children.length) return it.children;
      return null;
    }
    function hasOpenKid(kids) {
      if (!kids) return false;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] && !kids[i].done) return true;
      }
      return false;
    }
    function walk(list) {
      if (!Array.isArray(list) || out.length >= limit) return;
      for (var i = 0; i < list.length && out.length < limit; i++) {
        var it = list[i];
        if (!it || typeof it !== 'object' || it.done) continue;
        var kids = kidsOf(it);
        if (hasOpenKid(kids)) {
          walk(kids);
          continue;
        }
        var text = truncateStatusBriefLabel(itemText(it), 60);
        if (text) out.push(text);
      }
    }
    walk(items);
    return out;
  }

  /**
   * Compact facts for the Overview "what's going on" sentence
   * (boss-style status brief).
   */
  function buildStatusBriefSnapshot(context) {
    var due = context && context.due;
    var progress = context && context.progress;
    var blocked = context && context.blocked;
    var statut = context && context.statut;
    var priority = context && context.priority;
    var display = context && context.display;
    var ownership = context && context.ownership;

    var category =
      statut && typeof statut.category === 'string' ? statut.category : '';
    var listName =
      statut && typeof statut.listName === 'string' ? statut.listName : '';
    var stuck = !!(
      (blocked && blocked.enabled) ||
      category === 'blocked' ||
      (progress && progress.blocked)
    );
    var reasons = [];
    if (blocked && blocked.enabled && Array.isArray(blocked.blockedReasons)) {
      reasons = blocked.blockedReasons
        .map(function (r) {
          return typeof r === 'string' ? r.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    } else if (
      progress &&
      progress.blocked &&
      Array.isArray(progress.blockedReasons)
    ) {
      reasons = progress.blockedReasons
        .map(function (r) {
          return typeof r === 'string' ? r.trim() : '';
        })
        .filter(Boolean)
        .slice(0, 2);
    }

    var percent = null;
    if (progress) {
      if (typeof progress.percent === 'number' && isFinite(progress.percent)) {
        percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      } else if (
        typeof progress.cardProgress === 'number' &&
        isFinite(progress.cardProgress)
      ) {
        percent = Math.max(0, Math.min(100, Math.round(progress.cardProgress)));
      }
    }
    var doneCount =
      progress && typeof progress.doneCount === 'number'
        ? progress.doneCount
        : 0;
    var totalCount =
      progress && typeof progress.totalCount === 'number'
        ? progress.totalCount
        : Array.isArray(progress && progress.items)
          ? progress.items.length
          : 0;
    var remainingMinutes =
      progress &&
      typeof progress.estimatedRemainingMinutes === 'number' &&
      isFinite(progress.estimatedRemainingMinutes)
        ? progress.estimatedRemainingMinutes
        : null;

    var nextOpenItems = collectStatusBriefNextOpenItems(
      progress && Array.isArray(progress.items) ? progress.items : [],
      2
    );

    var dueEnabled = !(due && due.enabled === false);
    var dueDate = due && due.dueDate ? String(due.dueDate) : '';
    var dueTime =
      dueEnabled && due && typeof due.dueTime === 'string' && due.dueTime
        ? String(due.dueTime).trim()
        : '';
    if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) dueTime = '';
    var dueMissing = dueEnabled && !dueDate;
    var duePast = !!(display && display.duePast);
    var dueCountdown =
      display && typeof display.dueCountdown === 'string'
        ? display.dueCountdown
        : '';
    // Match PriorityUI soon band (≤14 days): worth naming timing in the brief.
    var today = (context && context.today) || todayIsoLocal();
    var daysUntil = dueDate ? daysBetweenIsoLocal(today, dueDate) : NaN;
    var dueSoon =
      !dueMissing &&
      !duePast &&
      isFinite(daysUntil) &&
      daysUntil >= 0 &&
      daysUntil <= 14;

    var ease =
      priority && priority.enabled !== false && priority.ease != null
        ? clampInt(priority.ease, 1, 5, 3)
        : null;
    var tier =
      (display && (display.label || display.tier)) ||
      (priority && priority.labels && priority.labels.urgency) ||
      '';

    // French-only scale keys (never "quick"/"project" — those leak into LLM copy).
    var scale = 'moyen';
    if (
      (ease != null && ease >= 4 && totalCount <= 2 && (remainingMinutes == null || remainingMinutes < 60)) ||
      (totalCount <= 1 && (remainingMinutes == null || remainingMinutes < 45) && (ease == null || ease >= 3))
    ) {
      scale = 'petit';
    }
    if (
      totalCount >= 5 ||
      (remainingMinutes != null && remainingMinutes >= 240) ||
      (ease != null && ease <= 2 && totalCount >= 3)
    ) {
      scale = 'gros';
    }

    var phase = 'idle';
    if (category === 'completed' || (percent != null && percent >= 100)) {
      phase = 'done';
    } else if (stuck) {
      phase = 'stuck';
    } else if (
      category === 'started' ||
      (percent != null && percent > 0) ||
      doneCount > 0
    ) {
      phase = 'in_progress';
    } else if (category === 'todo' || category === 'backlog' || !category) {
      phase = 'not_started';
    }

    var members = ownership && Array.isArray(ownership.members)
      ? ownership.members
      : [];
    var youId =
      ownership && ownership.you && ownership.you.id
        ? String(ownership.you.id)
        : '';
    var youAssigned = !!(ownership && ownership.youAssigned);
    var unassigned = members.length === 0;
    if (ownership && typeof ownership.unassigned === 'boolean') {
      unassigned = ownership.unassigned;
    }

    var otherNames = members
      .filter(function (m) {
        return !youId || m.id !== youId;
      })
      .map(function (m) {
        return firstNameFromFullName(m.fullName || m.username);
      })
      .filter(Boolean)
      .slice(0, 3);

    var cardName =
      context && context.cardName
        ? truncateStatusBriefLabel(String(context.cardName), 72)
        : '';
    var cardDesc = excerptStatusBriefDesc(
      context && context.cardDesc ? context.cardDesc : ''
    );

    return {
      cardName: cardName,
      cardDesc: cardDesc,
      phase: phase,
      stuck: stuck,
      statutCategory: category || null,
      statutListName: listName || null,
      blockedReasons: reasons,
      progressPercent: percent,
      subtasksDone: doneCount,
      subtasksTotal: totalCount,
      subtasksOpen: Math.max(0, totalCount - doneCount),
      nextOpenItems: nextOpenItems,
      estimatedRemainingMinutes: remainingMinutes,
      dueMissing: dueMissing,
      duePast: duePast,
      dueSoon: dueSoon,
      dueCountdown: dueCountdown || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      priorityTier: typeof tier === 'string' ? tier : '',
      ease: ease,
      scale: scale,
      youAssigned: youAssigned,
      unassigned: unassigned,
      otherNames: otherNames,
      assigneeCount: members.length
    };
  }

  function fingerprintStatusBriefSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
      return JSON.stringify({
        v: 3,
        cardName: snapshot.cardName || '',
        cardDesc: snapshot.cardDesc || '',
        phase: snapshot.phase,
        stuck: !!snapshot.stuck,
        statutCategory: snapshot.statutCategory || null,
        blockedReasons: snapshot.blockedReasons || [],
        progressPercent: snapshot.progressPercent,
        subtasksDone: snapshot.subtasksDone,
        subtasksTotal: snapshot.subtasksTotal,
        subtasksOpen: snapshot.subtasksOpen,
        nextOpenItems: snapshot.nextOpenItems || [],
        estimatedRemainingMinutes: snapshot.estimatedRemainingMinutes,
        dueMissing: !!snapshot.dueMissing,
        duePast: !!snapshot.duePast,
        dueSoon: !!snapshot.dueSoon,
        dueCountdown: snapshot.dueCountdown || null,
        dueDate: snapshot.dueDate || null,
        dueTime: snapshot.dueTime || null,
        priorityTier: snapshot.priorityTier || '',
        ease: snapshot.ease,
        scale: snapshot.scale,
        youAssigned: !!snapshot.youAssigned,
        unassigned: !!snapshot.unassigned,
        otherNames: snapshot.otherNames || [],
        assigneeCount: snapshot.assigneeCount || 0
      });
    } catch (e) {
      return '';
    }
  }

  function clampStatusBriefSentence(text) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    if (s.length <= MAX_STATUS_BRIEF_LEN) return s;
    var cut = s.slice(0, MAX_STATUS_BRIEF_LEN - 1);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 80) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,:;.\-–—\s]+$/, '') + '\u2026';
  }

  function normalizeStatusBriefScale(scale) {
    var s = String(scale || '').toLowerCase();
    if (s === 'petit' || s === 'quick') return 'petit';
    if (s === 'gros' || s === 'project') return 'gros';
    return 'moyen';
  }

  /** Compact French clock for status brief (e.g. "14 h", "14 h 30"). */
  function formatStatusBriefDueTime(time) {
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.formatDueTimeCompactFr === 'function'
    ) {
      return PriorityUI.formatDueTimeCompactFr(time) || '';
    }
    var s = String(time || '').trim();
    if (!/^\d{2}:\d{2}$/.test(s)) return '';
    var parts = s.split(':');
    var hours = +parts[0];
    var minutes = +parts[1];
    if (!isFinite(hours) || !isFinite(minutes)) return '';
    if (minutes === 0) return String(hours) + ' h';
    return (
      String(hours) +
      ' h ' +
      (minutes < 10 ? '0' + minutes : String(minutes))
    );
  }

  /**
   * Due clause for the brief: missing / late / soon timing (+ clock when set).
   * Far-away dues stay silent so the sentence keeps focusing on work.
   */
  function formatStatusBriefDueGap(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    if (snapshot.duePast) return 'en retard';
    if (snapshot.dueMissing) return 'pas d\'\u00e9ch\u00e9ance';
    if (!snapshot.dueSoon) return '';

    var when = '';
    if (typeof snapshot.dueCountdown === 'string' && snapshot.dueCountdown) {
      when = snapshot.dueCountdown.replace(/\s+/g, ' ').trim();
      if (when) {
        when = when.charAt(0).toLocaleLowerCase('fr-FR') + when.slice(1);
      }
    }
    var clock = formatStatusBriefDueTime(snapshot.dueTime);
    var countdownHasClock = /\b(h|heure|heures|minute|minutes)\b/i.test(when);

    if (when && clock && !countdownHasClock) {
      return when + ' \u00e0 ' + clock;
    }
    if (when) return when;
    if (clock) return '\u00e0 ' + clock;
    return '';
  }

  // exports
  S.MAX_DREAM_DESC_LEN = MAX_DREAM_DESC_LEN;
  S.MAX_DREAM_HISTORY_CHARS = MAX_DREAM_HISTORY_CHARS;
  S.MAX_STATUS_BRIEF_DESC_LEN = MAX_STATUS_BRIEF_DESC_LEN;
  S.MAX_STATUS_BRIEF_LEN = MAX_STATUS_BRIEF_LEN;
  S.buildDonePendingSanityFallback = buildDonePendingSanityFallback;
  S.buildDreamHistoryExcerpt = buildDreamHistoryExcerpt;
  S.buildImprovementExampleJson = buildImprovementExampleJson;
  S.buildStatusBriefSnapshot = buildStatusBriefSnapshot;
  S.clampStatusBriefSentence = clampStatusBriefSentence;
  S.collectStatusBriefNextOpenItems = collectStatusBriefNextOpenItems;
  S.excerptStatusBriefDesc = excerptStatusBriefDesc;
  S.filterNoOpImprovementSuggestions = filterNoOpImprovementSuggestions;
  S.fingerprintStatusBriefSnapshot = fingerprintStatusBriefSnapshot;
  S.firstNameFromFullName = firstNameFromFullName;
  S.formatStatusBriefDueGap = formatStatusBriefDueGap;
  S.formatStatusBriefDueTime = formatStatusBriefDueTime;
  S.isVerboseStructuredDesc = isVerboseStructuredDesc;
  S.normalizeDescForCompare = normalizeDescForCompare;
  S.normalizeStatusBriefScale = normalizeStatusBriefScale;
  S.preferReopenStatutCategory = preferReopenStatutCategory;
  S.suggestCardImprovements = suggestCardImprovements;
  S.truncateStatusBriefLabel = truncateStatusBriefLabel;
})(typeof window !== 'undefined' ? window : this);
