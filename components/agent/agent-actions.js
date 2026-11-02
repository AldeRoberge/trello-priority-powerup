/**
 * AI agent: actions
 *
 * Part of the agent (see agent.parts.json). executeAction and executeActions: apply model tools to the board, with user-facing error formatting.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var TOOL_LABELS = S.TOOL_LABELS;

  // from other parts (functions, resolved at call time)
  function actionFailure() { return S.actionFailure.apply(this, arguments); }
  function apiFetch() { return S.apiFetch.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function classifyFetchError() { return S.classifyFetchError.apply(this, arguments); }
  function currentAppBuildInfo() { return S.currentAppBuildInfo.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function enrichActionError() { return S.enrichActionError.apply(this, arguments); }
  function formatActionErrors() { return S.formatActionErrors.apply(this, arguments); }
  function formatChangeRecap() { return S.formatChangeRecap.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSubtaskTitleKey() { return S.normalizeSubtaskTitleKey.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function resolveEstimateMinutesArg() { return S.resolveEstimateMinutesArg.apply(this, arguments); }
  function snapshotCompletion() { return S.snapshotCompletion.apply(this, arguments); }
  function snapshotPriority() { return S.snapshotPriority.apply(this, arguments); }

  // ── 16. executeAction(s) — apply one tool call to Trello via bridge ──────
  // Keep side-effects here (not in the UI). Unknown types → soft error.

  async function executeAction(bridge, action) {
    if (!bridge || !action || !action.tool) {
      return actionFailure(action && action.tool, 'Action invalide', {
        code: 'invalid-action',
        hint: 'Action sans outil ou pont manquant.'
      });
    }
    var tool = action.tool;
    var args = action.args && typeof action.args === 'object' ? action.args : {};
    try {
      var handler = S.ACTION_HANDLERS && S.ACTION_HANDLERS[tool];
      if (handler) return await handler(bridge, action, tool, args);
      return { ok: false, tool: tool, error: 'Outil inconnu\u00a0: ' + tool };
    } catch (err) {
      var msg = (err && err.message) || '\u00c9chec d\'ex\u00e9cution';
      var causeLine = '';
      if (err && err.stack) {
        causeLine = String(err.stack).split('\n')[0];
      } else if (err != null) {
        causeLine = String(err);
      }
      dbgError('agent', 'actions.executeOne', err, { tool: tool });
      return actionFailure(tool, msg, {
        code: 'exception',
        cause: causeLine || undefined,
        hint: 'Exception pendant l\'ex\u00e9cution de l\'outil.'
      });
    }
  }

  /**
   * Attach a structured `visual` payload for chat result cards when missing.
   * Uses post-action bridge snapshots so the synthesizer stays dumb.
   */
  function enrichResultVisual(bridge, result) {
    if (!result || !result.ok || result.visual) return result;
    var tool = result.tool;
    var args = result.args || {};
    try {
      if (tool === 'set_priority') {
        var pri = snapshotPriority(bridge);
        var tierLabel = '';
        var matrixLabel = '';
        if (
          typeof PriorityUI !== 'undefined' &&
          typeof PriorityUI.baselineScore === 'function' &&
          typeof PriorityUI.tierFor === 'function' &&
          pri.priorityEnabled !== false
        ) {
          var score = PriorityUI.baselineScore(pri.urgency, pri.impact, pri.ease);
          var tier = PriorityUI.tierFor(score);
          if (tier && tier.label) tierLabel = tier.label;
          if (typeof PriorityUI.resolveDisplay === 'function') {
            try {
              var display = PriorityUI.resolveDisplay(
                {
                  score: score,
                  urgency: pri.urgency,
                  impact: pri.impact,
                  ease: pri.ease
                },
                {
                  urgency: pri.urgency,
                  impact: pri.impact,
                  ease: pri.ease,
                  priorityEnabled: pri.priorityEnabled !== false
                }
              );
              if (display && display.matrixLabel) {
                matrixLabel = String(display.matrixLabel);
              }
              if (
                (!tierLabel || tierLabel === 'Priorit\u00e9') &&
                display &&
                display.label
              ) {
                tierLabel = String(display.label);
              }
            } catch (eDisplay) {
              /* ignore */
            }
          }
        }
        if (!tierLabel && args.tier) tierLabel = String(args.tier);
        var visual = {
          type: 'priority',
          tier: tierLabel || 'Priorit\u00e9',
          urgency: pri.urgency,
          impact: pri.impact,
          ease: pri.ease,
          priorityEnabled: pri.priorityEnabled !== false
        };
        if (matrixLabel) visual.matrixLabel = matrixLabel;
        result.visual = visual;
        return result;
      }
      if (
        tool === 'add_subtask' ||
        tool === 'rename_subtask' ||
        tool === 'toggle_subtask' ||
        tool === 'set_subtask_blocked' ||
        tool === 'set_subtask_progress' ||
        tool === 'set_subtask_estimate' ||
        tool === 'remove_subtask'
      ) {
        var comp = snapshotCompletion(bridge);
        var item = null;
        var id = result.id || args.id;
        if (id && comp.items) {
          for (var i = 0; i < comp.items.length; i++) {
            if (String(comp.items[i].id) === String(id)) {
              item = comp.items[i];
              break;
            }
          }
        }
        if (!item && args.matchText && comp.items) {
          var needle = normalizeSubtaskTitleKey(args.matchText);
          for (var j = 0; j < comp.items.length; j++) {
            if (normalizeSubtaskTitleKey(comp.items[j].text) === needle) {
              item = comp.items[j];
              break;
            }
          }
        }
        if (tool === 'remove_subtask') {
          result.visual = {
            type: 'subtask',
            text:
              (item && item.text) ||
              (typeof args.matchText === 'string' ? args.matchText : '') ||
              'Sous-t\u00e2che',
            removed: true,
            id: id != null ? String(id) : undefined
          };
          return result;
        }
        var text =
          (item && item.text) ||
          (typeof args.text === 'string' ? args.text.trim() : '') ||
          (typeof args.matchText === 'string' ? args.matchText.trim() : '') ||
          'Sous-t\u00e2che';
        result.visual = {
          type: 'subtask',
          text: text,
          id: (item && item.id) || (id != null ? String(id) : undefined),
          done: item ? !!item.done : !!args.done,
          blocked: item ? !!item.blocked : !!args.blocked,
          progress: item && item.progress != null ? item.progress : undefined,
          estimatedMinutes:
            item && item.estimatedMinutes != null
              ? item.estimatedMinutes
              : resolveEstimateMinutesArg(args)
        };
        return result;
      }
      if (tool === 'set_due') {
        var dueSnap = snapshotPriority(bridge);
        if (!dueSnap.dueEnabled && !dueSnap.dueVague) {
          result.visual = { type: 'due', cleared: true };
        } else if (dueSnap.dueVague) {
          result.visual = {
            type: 'due',
            dueVague: dueSnap.dueVague,
            dueMode: 'vague',
            dueBand: 'far'
          };
        } else {
          var dueBand = '';
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.dueProximityBand === 'function' &&
            dueSnap.dueDate
          ) {
            try {
              dueBand =
                PriorityUI.dueProximityBand(dueSnap.dueDate, dueSnap.dueTime) ||
                '';
            } catch (eBand) {
              dueBand = '';
            }
          }
          result.visual = {
            type: 'due',
            dueDate: dueSnap.dueDate || '',
            dueTime: dueSnap.dueTime || '',
            dueMode: 'precise',
            recurrence: dueSnap.recurrence || undefined,
            startDate: dueSnap.startDate || undefined
          };
          if (dueBand) result.visual.dueBand = dueBand;
        }
        return result;
      }
      if (tool === 'set_blocked') {
        var blockedSnap = snapshotPriority(bridge);
        if (!blockedSnap.enAttente) {
          result.visual = { type: 'blocked', enabled: false, cleared: true };
        } else {
          var blockedVisual = { type: 'blocked', enabled: true };
          if (
            Array.isArray(blockedSnap.blockedReasons) &&
            blockedSnap.blockedReasons.length
          ) {
            blockedVisual.reasons = blockedSnap.blockedReasons.slice();
          } else if (Array.isArray(args.blockedReasons) && args.blockedReasons.length) {
            blockedVisual.reasons = args.blockedReasons
              .map(function (r) {
                return typeof r === 'string' ? r.trim() : '';
              })
              .filter(Boolean);
          }
          var linkSrc =
            Array.isArray(blockedSnap.blockedLinks) && blockedSnap.blockedLinks.length
              ? blockedSnap.blockedLinks
              : Array.isArray(args.blockedLinks)
                ? args.blockedLinks
                : [];
          if (linkSrc.length) {
            blockedVisual.links = linkSrc
              .map(function (link) {
                if (!link) return null;
                if (typeof link === 'string') return { label: link };
                var label =
                  (typeof link.label === 'string' && link.label.trim()) ||
                  (typeof link.matchText === 'string' && link.matchText.trim()) ||
                  '';
                var id = link.id != null ? String(link.id) : '';
                if (!label && !id) return null;
                var entry = {};
                if (label) entry.label = label;
                if (id) entry.id = id;
                return entry;
              })
              .filter(Boolean);
          }
          result.visual = blockedVisual;
        }
        return result;
      }
      if (tool === 'set_task_types') {
        var typeSnap = snapshotPriority(bridge);
        var typeIds =
          Array.isArray(typeSnap.taskTypes) && typeSnap.taskTypes.length
            ? typeSnap.taskTypes
            : Array.isArray(args.types)
              ? args.types
              : [];
        if (typeIds.length) {
          result.visual = {
            type: 'task_types',
            types: typeIds.map(function (id) {
              return typeof id === 'string' ? id : id && id.id;
            }).filter(Boolean)
          };
        }
        return result;
      }
      if (tool === 'set_statut') {
        result.visual = {
          type: 'statut',
          listName:
            (args && (args.listName || args.matchList)) ||
            '',
          listId: args.listId || undefined,
          category: args.category || undefined
        };
        if (result.detail && typeof result.detail === 'string') {
          var listMatch = result.detail.match(/list\s*[:=→>]\s*([^;]+)/i);
          if (listMatch) result.visual.listName = listMatch[1].trim();
          var idMatch = result.detail.match(/\bid\s*[:=]\s*([^;]+)/i);
          if (idMatch) result.visual.listId = idMatch[1].trim();
        }
        if (!result.visual.listName && args.matchList) {
          result.visual.listName = String(args.matchList);
        }
        return result;
      }
      if (tool === 'set_project') {
        if (args.clear === true) {
          result.visual = { type: 'project', cleared: true };
        } else {
          result.visual = {
            type: 'project',
            name: args.name || args.matchText || '',
            projectId: args.projectId || undefined
          };
          if (result.detail && typeof result.detail === 'string') {
            var pn = result.detail.match(/projet\s*[:=→>]\s*([^;]+)/i);
            if (pn) result.visual.name = pn[1].trim();
          }
        }
        return result;
      }
      if (
        tool === 'set_progress' ||
        tool === 'set_progress_estimate' ||
        tool === 'complete_all_subtasks' ||
        tool === 'reset_progress'
      ) {
        var prog = snapshotCompletion(bridge);
        var doneCount = 0;
        (prog.items || []).forEach(function (it) {
          if (it.done) doneCount += 1;
        });
        result.visual = {
          type: 'progress',
          progress: prog.progress,
          progressEnabled: prog.progressEnabled !== false,
          estimatedMinutes: prog.estimatedMinutes,
          doneCount: doneCount,
          totalCount: (prog.items || []).length
        };
        return result;
      }
      if (tool === 'set_members' || tool === 'set_custom_assignees') {
        var people = [];
        if (result.detail && typeof result.detail === 'string') {
          result.detail.split(/[;,]/).forEach(function (part) {
            var t = part.trim();
            if (!t) return;
            if (t.charAt(0) === '+' || t.charAt(0) === '−' || t.charAt(0) === '-') {
              people.push({
                name: t.slice(1).trim(),
                op: t.charAt(0) === '+' ? 'add' : 'remove'
              });
            }
          });
        }
        if (!people.length && Array.isArray(args.add)) {
          args.add.forEach(function (a) {
            var n =
              typeof a === 'string'
                ? a
                : a && (a.fullName || a.name || a.username);
            if (n) people.push({ name: String(n), op: 'add' });
          });
        }
        if (people.length) {
          result.visual = { type: 'members', people: people };
        }
        return result;
      }
      if (tool === 'set_labels') {
        var labels = [];
        if (result.detail && typeof result.detail === 'string') {
          result.detail.split(/[;,]/).forEach(function (part) {
            var t = part.trim();
            if (!t) return;
            if (t.charAt(0) === '+' || t.charAt(0) === '−' || t.charAt(0) === '-') {
              labels.push({
                name: t.slice(1).trim(),
                op: t.charAt(0) === '+' ? 'add' : 'remove'
              });
            }
          });
        }
        if (labels.length) {
          result.visual = { type: 'labels', labels: labels };
        }
        return result;
      }
    } catch (err) {
      console.error('enrichResultVisual failed', err);
    }
    return result;
  }

  /** Present-tense, user-facing label for one action ("Je débloque la tâche"). */
  function describeActionStep(action) {
    var tool = action && action.tool;
    var args = (action && action.args) || {};
    var has = function (k) {
      return Object.prototype.hasOwnProperty.call(args, k);
    };
    switch (tool) {
      case 'set_blocked':
        if (args.enAttente === false) return 'Je débloque la tâche';
        if (Array.isArray(args.blockedReasons) && args.blockedReasons.length) {
          return 'Je note la cause du blocage';
        }
        return 'Je marque la tâche comme bloquée';
      case 'set_subtask_blocked':
        return args.blocked === false
          ? 'Je débloque la sous-tâche'
          : 'Je bloque la sous-tâche';
      case 'set_priority': return 'Je mets à jour la priorité';
      case 'set_due': return 'Je définis l\'échéance';
      case 'set_progress':
        return has('progress') ? 'Je mets le progrès à jour' : 'Je configure le progrès';
      case 'set_statut': return 'Je change le statut';
      case 'add_subtask': return 'J\'ajoute une sous-tâche';
      case 'rename_subtask': return 'Je renomme la sous-tâche';
      case 'remove_subtask': return 'Je supprime la sous-tâche';
      case 'complete_all_subtasks': return 'Je termine toutes les sous-tâches';
      case 'reset_progress': return 'Je réinitialise le progrès';
      case 'rename_card': return 'Je renomme la carte';
      case 'set_description': return 'Je mets la description à jour';
      case 'set_project': return 'Je lie la carte au projet';
      case 'trigger_effect': return 'Je lance un effet';
      case 'point_at': return 'Je te montre la section';
      default:
        return TOOL_LABELS[tool]
          ? 'Je fais : ' + TOOL_LABELS[tool].replace(/\.$/, '').toLowerCase()
          : 'J\'applique une modification';
    }
  }

  async function executeActions(bridge, actions, hooks) {
    var list = Array.isArray(actions) ? actions : [];
    var results = [];
    var summaries = [];
    var errors = [];
    var executed = 0;
    var rejected = 0;
    hooks = hooks || {};
    for (var i = 0; i < list.length; i++) {
      if (typeof hooks.onStart === 'function') {
        try { hooks.onStart(i, list[i]); } catch (hookErr) { /* UI only */ }
      }
      var result = await executeAction(bridge, list[i]);
      result = enrichActionError(result);
      result = enrichResultVisual(bridge, result);
      results.push(result);
      if (typeof hooks.onDone === 'function') {
        try { hooks.onDone(i, result); } catch (hookErr2) { /* UI only */ }
      }
      if (result.ok) {
        executed += 1;
        if (result.summary) summaries.push(result.summary);
      } else {
        rejected += 1;
        if (result.error) errors.push(result.error);
        dbgLog('agent', 'actions.reject', {
          tool: result.tool,
          error: result.error,
          code: result.code || null,
          cause: result.cause || null,
          hint: result.hint || null
        });
      }
    }
    dbgLog('agent', 'actions.execute', {
      total: list.length,
      executed: executed,
      rejected: rejected
    });
    var applied = {
      results: results,
      summary: summaries.filter(Boolean).join(' ') || (errors.length ? '' : 'OK'),
      errors: errors,
      ok: errors.length === 0 && results.length > 0
    };
    applied.recap = formatChangeRecap(applied);
    applied.errorSummary = formatActionErrors(applied);
    return applied;
  }

  async function runProviderTests(provider, onResult) {
    var p = normalizeProvider(provider);
    var results = [];

    function paint() {
      return new Promise(function (resolve) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            resolve();
          });
        } else {
          setTimeout(resolve, 0);
        }
      });
    }

    async function push(id, label, status, detail, ms) {
      var item = {
        id: id,
        label: label,
        status: status,
        detail: detail || '',
        ms: typeof ms === 'number' ? ms : null
      };
      var idx = -1;
      for (var i = 0; i < results.length; i++) {
        if (results[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) results[idx] = item;
      else results.push(item);
      if (typeof onResult === 'function') {
        try {
          onResult(item, results.slice());
        } catch (cbErr) {
          console.error('runProviderTests onResult failed', cbErr);
        }
      }
      await paint();
      return item;
    }

    // 1. Config
    if (!p.apiKey) {
      await push('config', 'Configuration', 'fail', 'Cl\u00e9 API manquante');
      return results;
    }
    if (!p.baseUrl) {
      await push('config', 'Configuration', 'fail', 'URL de base manquante');
      return results;
    }
    if (!p.model) {
      await push('config', 'Configuration', 'fail', 'Mod\u00e8le manquant');
      return results;
    }
    await push(
      'config',
      'Configuration',
      'pass',
      p.preset + ' \u00b7 ' + p.model + ' \u00b7 ' + p.baseUrl
    );

    // 2. Reachability / CORS (+ auth signal)
    await push('reach', 'Accessibilit\u00e9 / CORS', 'running', 'En cours\u2026');
    var t0 = Date.now();
    var modelsRes = null;
    var reachErr = null;
    try {
      modelsRes = await apiFetch(p, '/models', { method: 'GET' });
    } catch (err) {
      reachErr = err;
    }
    var reachMs = Date.now() - t0;

    if (reachErr && reachErr.code === 'cors_or_network') {
      await push('reach', 'Accessibilit\u00e9 / CORS', 'fail', reachErr.message, reachMs);
      await push('auth', 'Authentification', 'skip', 'Non test\u00e9 (CORS / r\u00e9seau)');
      await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9');
      await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
      return results;
    }

    if (reachErr) {
      // Fallback: try a tiny chat completion to prove reachability
      await push('reach', 'Accessibilit\u00e9 / CORS', 'running', 'Tentative via chat\u2026');
      t0 = Date.now();
      try {
        await chatCompletions(
          p,
          [{ role: 'user', content: 'Reply with OK' }],
          { jsonMode: false, max_tokens: 5, temperature: 0 }
        );
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          '/models indisponible, chat OK',
          Date.now() - t0
        );
        await push('auth', 'Authentification', 'pass', 'Cl\u00e9 accept\u00e9e via chat');
      } catch (chatErr) {
        var classified = chatErr.code === 'cors_or_network'
          ? chatErr
          : classifyFetchError(chatErr);
        if (chatErr.code === 'cors_or_network' || classified.code === 'cors_or_network') {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'fail',
            chatErr.message || classified.message,
            Date.now() - t0
          );
        } else if (chatErr.status === 401 || chatErr.status === 403 || chatErr.code === 'auth') {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'pass',
            'Endpoint joignable',
            Date.now() - t0
          );
          await push(
            'auth',
            'Authentification',
            'fail',
            chatErr.message || 'Cl\u00e9 refus\u00e9e',
            Date.now() - t0
          );
        } else {
          await push(
            'reach',
            'Accessibilit\u00e9 / CORS',
            'fail',
            chatErr.message || String(chatErr),
            Date.now() - t0
          );
        }
        if (results.every(function (r) { return r.id !== 'auth'; })) {
          await push('auth', 'Authentification', 'skip', 'Non conclu');
        }
        await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9');
        await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
        return results;
      }
    } else if (modelsRes) {
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          'Endpoint joignable (HTTP ' + modelsRes.status + ')',
          reachMs
        );
        await push(
          'auth',
          'Authentification',
          'fail',
          (modelsRes.data &&
            modelsRes.data.error &&
            modelsRes.data.error.message) ||
            'Cl\u00e9 refus\u00e9e (HTTP ' + modelsRes.status + ')',
          reachMs
        );
        await push('chat', '\u00c9change chat', 'skip', 'Non test\u00e9 (auth)');
        await push('json', 'Mode JSON', 'skip', 'Non test\u00e9 (auth)');
        return results;
      }
      if (modelsRes.ok) {
        var modelCount =
          modelsRes.data && Array.isArray(modelsRes.data.data)
            ? modelsRes.data.data.length
            : null;
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'pass',
          modelCount != null
            ? modelCount + ' mod\u00e8les list\u00e9s'
            : 'GET /models OK',
          reachMs
        );
        await push('auth', 'Authentification', 'pass', 'Cl\u00e9 accept\u00e9e', reachMs);
      } else {
        await push(
          'reach',
          'Accessibilit\u00e9 / CORS',
          'warn',
          'GET /models HTTP ' + modelsRes.status + ' \u2014 on tente le chat',
          reachMs
        );
        await push(
          'auth',
          'Authentification',
          'warn',
          'Ind\u00e9termin\u00e9 via /models',
          reachMs
        );
      }
    }

    // 3/4. Chat round-trip
    await push('chat', '\u00c9change chat', 'running', 'En cours\u2026');
    t0 = Date.now();
    try {
      var chatRes = await chatCompletions(
        p,
        [{ role: 'user', content: 'R\u00e9ponds uniquement OK' }],
        { jsonMode: false, max_tokens: 8, temperature: 0 }
      );
      var okText = (chatRes.content || '').trim();
      await push(
        'chat',
        '\u00c9change chat',
        /ok/i.test(okText) ? 'pass' : 'warn',
        okText
          ? 'R\u00e9ponse\u00a0: ' + okText.slice(0, 80)
          : 'R\u00e9ponse vide',
        Date.now() - t0
      );
      if (results.every(function (r) { return r.id !== 'auth' || r.status === 'warn' || r.status === 'skip'; })) {
        // Upgrade auth if still warn/skip
        for (var i = 0; i < results.length; i++) {
          if (results[i].id === 'auth' && results[i].status !== 'pass') {
            await push(
              'auth',
              'Authentification',
              'pass',
              'Cl\u00e9 accept\u00e9e via chat',
              results[i].ms
            );
            break;
          }
        }
      }
    } catch (chatErr2) {
      await push(
        'chat',
        '\u00c9change chat',
        'fail',
        chatErr2.message || String(chatErr2),
        Date.now() - t0
      );
      await push('json', 'Mode JSON', 'skip', 'Non test\u00e9');
      return results;
    }

    // 5. JSON mode
    await push('json', 'Mode JSON', 'running', 'En cours\u2026');
    t0 = Date.now();
    try {
      var jsonRes = await chatCompletions(
        p,
        [
          {
            role: 'user',
            content:
              'R\u00e9ponds uniquement avec JSON {"message":"OK","followUps":[]}'
          }
        ],
        { jsonMode: true, max_tokens: 40, temperature: 0 }
      );
      var parsed = parseAssistantPayload(jsonRes.content);
      if (parsed && parsed.message) {
        await push(
          'json',
          'Mode JSON',
          'pass',
          'response_format json_object OK',
          Date.now() - t0
        );
      } else {
        await push(
          'json',
          'Mode JSON',
          'warn',
          'JSON difficile \u00e0 parser',
          Date.now() - t0
        );
      }
    } catch (jsonErr) {
      await push(
        'json',
        'Mode JSON',
        'warn',
        (jsonErr.message || String(jsonErr)) +
          ' \u2014 les follow-ups peuvent \u00eatre moins fiables',
        Date.now() - t0
      );
    }

    return results;
  }

  /** Markdown fence that cannot be closed by backticks inside `text`. */
  function debugFenced(lang, text) {
    var body = String(text == null ? '' : text);
    var fence = '```';
    var runs = body.match(/`{3,}/g) || [];
    for (var r = 0; r < runs.length; r++) {
      if (runs[r].length >= fence.length) fence = runs[r] + '`';
    }
    return fence + (lang || '') + '\n' + body + '\n' + fence;
  }

  function debugJsonText(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch (e) {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return String(value);
    }
  }

  function debugIsoStamp(value) {
    var d = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
    return d && !isNaN(d.getTime()) ? localStamp(d.toISOString()) : '?';
  }

  /**
   * Texte copiable pour déboguer une conversation : les messages tels que
   * l'utilisateur les voit, puis ce qui s'est passé sous le capot pour chaque
   * appel (requête, réponse brute, tentatives, métriques). Le contexte système
   * n'est écrit qu'une fois par version. La clé API n'est jamais incluse.
   */
  function buildChatDebugExport(input) {
    var src = input || {};
    var provider = normalizeProvider(src.provider);
    var history = Array.isArray(src.history) ? src.history : [];
    var debugLog = Array.isArray(src.debugLog) ? src.debugLog : [];
    var appInfo = currentAppBuildInfo() || {};
    var out = [];

    out.push('# Débogage — conversation avec l’Assistant');
    out.push('');
    out.push('- Exporté : ' + debugIsoStamp(Date.now()) + ' (heure locale)');
    if (appInfo.builtAt) out.push('- App compilée : ' + debugIsoStamp(appInfo.builtAt));
    out.push(
      '- Fournisseur : ' + provider.preset + ' · modèle ' + provider.model + ' · ' + provider.baseUrl
    );
    out.push('- Niveau de statut : ' + (src.statusLevel || 'inconnu'));
    out.push('');

    out.push('## 1. Conversation (' + history.length + ' message(s))');
    out.push('');
    for (var h = 0; h < history.length; h++) {
      var entry = history[h];
      if (!entry || !entry.content) continue;
      var who = entry.role === 'user' ? 'Utilisateur' : entry.role === 'assistant' ? 'Assistant' : String(entry.role);
      out.push('### ' + (h + 1) + '. ' + who + (entry.selfPrompt ? ' (relance automatique)' : ''));
      out.push(String(entry.content));
      if (entry.role === 'assistant' && entry.rawJson) {
        out.push('');
        out.push('JSON brut :');
        out.push(debugFenced('json', debugJsonText(entry.rawJson)));
      }
      out.push('');
    }

    out.push('## 2. Sous le capot (' + debugLog.length + ' appel(s))');
    out.push('');
    var systemVersions = [];
    for (var c = 0; c < debugLog.length; c++) {
      var d = debugLog[c] || {};
      var req = d.request || null;
      var body = req && req.body ? req.body : null;
      out.push('### Appel ' + (c + 1) + ' — ' + (d.label || d.kind || 'appel'));
      out.push('- Type : ' + (d.kind || '?'));
      out.push('- Début : ' + debugIsoStamp(d.startedAt));
      out.push('- Durée : ' + (d.latencyMs != null ? d.latencyMs + ' ms' : '?'));
      out.push('- Résultat : ' + (d.ok === false ? 'erreur' : 'ok'));
      if (d.error) out.push('- Erreur : ' + d.error);
      if (req) {
        out.push(
          '- Requête : ' + (req.method || 'POST') + ' ' + (req.url || '') +
            ' · modèle ' + (req.model || '?') +
            ' · stream ' + (req.stream ? 'oui' : 'non') +
            ' · mode JSON ' + (req.jsonMode ? 'oui' : 'non') +
            ' · température ' + (req.temperature != null ? req.temperature : '?') +
            ' · max_tokens ' + (req.max_tokens != null ? req.max_tokens : '?') +
            ' · ' + (req.messageCount || 0) + ' messages'
        );
        if (req.status != null) out.push('- Statut HTTP : ' + req.status);
        if (req.note) out.push('- Note : ' + req.note);
      }
      if (body && Array.isArray(body.messages)) {
        var sysText = null;
        var lastUser = null;
        for (var m = 0; m < body.messages.length; m++) {
          var msg = body.messages[m];
          if (!msg) continue;
          if (msg.role === 'system' && sysText == null) sysText = String(msg.content || '');
          if (msg.role === 'user') lastUser = String(msg.content || '');
        }
        if (sysText != null) {
          var version = -1;
          for (var v = 0; v < systemVersions.length; v++) {
            if (systemVersions[v].text === sysText) version = v;
          }
          if (version < 0) {
            systemVersions.push({ text: sysText, calls: [] });
            version = systemVersions.length - 1;
          }
          systemVersions[version].calls.push(c + 1);
          out.push('- Contexte système : version ' + (version + 1) + ' (section 3)');
        }
        if (lastUser != null) {
          out.push('');
          out.push('Dernier message envoyé :');
          out.push(debugFenced('', lastUser));
        }
      }
      if (d.attempts && d.attempts.length) {
        out.push('');
        out.push('Tentatives :');
        for (var a = 0; a < d.attempts.length; a++) {
          var at = d.attempts[a] || {};
          out.push(
            '- ' + (at.label || 'essai') + (at.status != null ? ' · HTTP ' + at.status : '') +
              (at.ok === false || at.error ? ' · échec' : '') +
              (at.error ? ' : ' + at.error : '')
          );
        }
      }
      if (d.response) {
        out.push('');
        out.push('Réponse brute du modèle :');
        out.push(debugFenced('', d.response.content || '(vide)'));
        if (d.response.parsed) {
          out.push('');
          out.push('Sortie analysée :');
          out.push(debugFenced('json', debugJsonText(d.response.parsed)));
        }
        if (d.response.raw) {
          out.push('');
          out.push('Réponse API brute :');
          out.push(debugFenced('json', debugJsonText(d.response.raw)));
        }
      }
      if (d.usage) {
        out.push('');
        out.push('Métriques :');
        out.push(debugFenced('json', debugJsonText(d.usage)));
      }
      out.push('');
    }

    out.push('## 3. Contexte système envoyé au modèle (' + systemVersions.length + ' version(s))');
    out.push('');
    for (var sv = 0; sv < systemVersions.length; sv++) {
      out.push('### Version ' + (sv + 1) + ' (appels ' + systemVersions[sv].calls.join(', ') + ')');
      out.push(debugFenced('', systemVersions[sv].text));
      out.push('');
    }
    if (!systemVersions.length) out.push('Aucun appel avec contexte.');

    return out.join('\n');
  }

  // exports
  S.buildChatDebugExport = buildChatDebugExport;
  S.debugFenced = debugFenced;
  S.debugIsoStamp = debugIsoStamp;
  S.debugJsonText = debugJsonText;
  S.describeActionStep = describeActionStep;
  S.enrichResultVisual = enrichResultVisual;
  S.executeAction = executeAction;
  S.executeActions = executeActions;
  S.runProviderTests = runProviderTests;
})(typeof window !== 'undefined' ? window : this);
