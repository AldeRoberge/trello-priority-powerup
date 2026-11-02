/**
 * agent-chat-turn: part 3 of 3 (buildHeuristicStatusBrief).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-chat-turn.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var MAX_STATUS_BRIEF_LEN = S.MAX_STATUS_BRIEF_LEN;

  // from other parts (functions, resolved at call time)
  function buildStatusBriefSnapshot() { return S.buildStatusBriefSnapshot.apply(this, arguments); }
  function clampStatusBriefSentence() { return S.clampStatusBriefSentence.apply(this, arguments); }
  function formatStatusBriefDueGap() { return S.formatStatusBriefDueGap.apply(this, arguments); }
  function normalizeStatusBriefScale() { return S.normalizeStatusBriefScale.apply(this, arguments); }
  function truncateStatusBriefLabel() { return S.truncateStatusBriefLabel.apply(this, arguments); }
  function buildContext() { return S.buildContext.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function cloneJsonSafe() { return S.cloneJsonSafe.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function profileLanguageInstruction() { return S.profileLanguageInstruction.apply(this, arguments); }

  /**
   * Deterministic French boss-style status sentence when AI is unavailable.
   * Substance first: next work / card topic / blocker / owner / due gap.
   * Never empty scale fluff (« petit reste à finir »).
   */
  function buildHeuristicStatusBrief(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    var you = !!snapshot.youAssigned;
    var unassigned = !!snapshot.unassigned;
    var other =
      Array.isArray(snapshot.otherNames) && snapshot.otherNames.length
        ? snapshot.otherNames[0]
        : '';
    var reason =
      Array.isArray(snapshot.blockedReasons) && snapshot.blockedReasons[0]
        ? String(snapshot.blockedReasons[0]).trim()
        : '';
    if (reason.length > 48) reason = reason.slice(0, 45) + '\u2026';
    var scale = normalizeStatusBriefScale(snapshot.scale);
    var next =
      Array.isArray(snapshot.nextOpenItems) && snapshot.nextOpenItems[0]
        ? String(snapshot.nextOpenItems[0]).trim()
        : '';
    if (next.length > 52) next = next.slice(0, 49) + '\u2026';
    var open =
      snapshot.subtasksOpen != null && isFinite(+snapshot.subtasksOpen)
        ? Math.max(0, Math.round(+snapshot.subtasksOpen))
        : null;
    var topic = truncateStatusBriefLabel(snapshot.cardName || '', 42);
    var descHint = truncateStatusBriefLabel(snapshot.cardDesc || '', 48);

    var who = you
      ? '\u00c0 toi'
      : unassigned
        ? 'Personne assign\u00e9'
        : other
          ? 'Chez ' + other
          : 'En cours';

    var dueGap = formatStatusBriefDueGap(snapshot);

    var sentence = '';
    if (snapshot.phase === 'done') {
      sentence = you
        ? 'Termin\u00e9 de ton c\u00f4t\u00e9' +
          (topic ? ' (\u00ab\u00a0' + topic + '\u00a0\u00bb)' : '') +
          '.'
        : 'Marqu\u00e9 termin\u00e9' + (other ? ' (chez ' + other + ')' : '') + '.';
    } else if (snapshot.stuck || snapshot.phase === 'stuck') {
      if (you) {
        sentence = reason
          ? '\u00c0 toi \u2014 bloqu\u00e9\u00a0: ' + reason + '.'
          : '\u00c0 toi \u2014 bloqu\u00e9, cause pas claire.';
      } else if (other) {
        sentence = reason
          ? 'Chez ' + other + ' \u2014 bloqu\u00e9\u00a0: ' + reason + '.'
          : 'Chez ' + other + ' \u2014 bloqu\u00e9.';
      } else if (unassigned) {
        sentence = reason
          ? 'Bloqu\u00e9 sans assign\u00e9 \u2014 ' + reason + '.'
          : 'Bloqu\u00e9 et personne n\'est assign\u00e9.';
      } else {
        sentence = reason ? 'Bloqu\u00e9\u00a0: ' + reason + '.' : 'Bloqu\u00e9.';
      }
    } else if (snapshot.phase === 'in_progress') {
      var workBit = '';
      if (next) {
        workBit = 'prochaine\u00a0: ' + next;
      } else if (topic) {
        workBit =
          scale === 'petit'
            ? 'petit fix \u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert'
            : scale === 'gros'
              ? 'gros chantier \u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert'
              : '\u00ab\u00a0' + topic + '\u00a0\u00bb encore ouvert';
      } else if (descHint) {
        workBit = 'encore ouvert\u00a0: ' + descHint;
      } else if (open != null && open > 0) {
        workBit =
          open === 1
            ? '1 sous-t\u00e2che restante'
            : open + ' sous-t\u00e2ches restantes';
      } else if (scale === 'gros') {
        workBit = 'gros chantier encore ouvert';
      } else {
        workBit = 'encore en cours, d\u00e9tail flou';
      }
      sentence = who + ' \u2014 ' + workBit;
      if (dueGap) sentence += ' ; ' + dueGap;
      sentence += '.';
    } else {
      // not_started / idle
      if (you) {
        if (dueGap === 'pas d\'\u00e9ch\u00e9ance') {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ', et pas d\'\u00e9ch\u00e9ance.';
        } else if (dueGap === 'en retard') {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ' et d\u00e9j\u00e0 en retard.';
        } else if (dueGap) {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9' +
            (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
            ' ; ' +
            dueGap +
            '.';
        } else if (next) {
          sentence =
            '\u00c0 toi \u2014 pas commenc\u00e9 ; premi\u00e8re \u00e9tape\u00a0: ' +
            next +
            '.';
        } else if (topic && scale === 'petit') {
          sentence =
            '\u00c0 toi \u2014 petit fix \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore commenc\u00e9.';
        } else if (topic && scale === 'gros') {
          sentence =
            '\u00c0 toi \u2014 gros chantier \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore lanc\u00e9.';
        } else if (topic) {
          sentence =
            '\u00c0 toi \u2014 \u00ab\u00a0' +
            topic +
            '\u00a0\u00bb pas encore commenc\u00e9.';
        } else if (scale === 'petit') {
          sentence = '\u00c0 toi \u2014 petit fix pas encore commenc\u00e9.';
        } else if (scale === 'gros') {
          sentence = '\u00c0 toi \u2014 gros chantier pas encore lanc\u00e9.';
        } else {
          sentence = '\u00c0 toi \u2014 pas encore commenc\u00e9.';
        }
      } else if (other) {
        sentence =
          'Chez ' +
          other +
          ' \u2014 pas commenc\u00e9' +
          (topic ? ' sur \u00ab\u00a0' + topic + '\u00a0\u00bb' : '') +
          (dueGap ? ' ; ' + dueGap : '') +
          '.';
      } else if (unassigned) {
        sentence = dueGap
          ? 'Personne assign\u00e9, ' + dueGap + ' \u2014 \u00e7a dort.'
          : 'Personne assign\u00e9 \u2014 pas commenc\u00e9.';
      } else {
        sentence =
          'Pas commenc\u00e9' + (dueGap ? ' ; ' + dueGap : '') + '.';
      }
    }

    return clampStatusBriefSentence(sentence);
  }

  /** Reject empty / glaze / English-scale AI sentences; fall back to heuristic. */
  function isVacuousStatusBrief(sentence) {
    var s = String(sentence || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!s) return true;
    if (
      /petit reste\s*[àa]\s*finir|travail encore ouvert|encore en cours, d[eé]tail flou/.test(
        s
      )
    ) {
      return true;
    }
    if (
      /\b(quick|project|stuck|medium|status)\b/.test(s) ||
      /(?:^|[^\wàâäéèêëïîôùûüç])(?:quick|project)\b/.test(s)
    ) {
      return true;
    }
    if (
      /devrait aller vite|t['']inqui[eè]te|tu g[eè]res|bien avanc|glaze|bravo/.test(
        s
      )
    ) {
      return true;
    }
    if (
      /c['']est en cours de ton c[oô]t[eé]|avanc[eé]\s*[àa]\s*\d+\s*%/.test(s)
    ) {
      return true;
    }
    // Pure owner + due with no work noun: « À toi — demain. »
    if (/^(?:à toi|chez \w+|personne assign[eé])\s*[—\-–]\s*[^.]{0,28}\.?$/.test(s)) {
      if (
        !/prochaine|bloqu|sous-t|fix|chantier|pas commenc|termin|\u00ab/.test(s) &&
        !/[a-zàâäéèêëïîôùûüç]{4,}/.test(
          s.replace(
            /à toi|chez \w+|personne assigné|demain|aujourd.?hui|en retard|pas d.?échéance|à \d+|h\b|\d+/gi,
            ''
          )
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * AI Overview status brief: one boss-style sentence about what's going on.
   * Returns { ok, skipped?, reason?, sentence?, usage?, debug }.
   */
  async function cardStatusBriefTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = options.context || buildContext(bridge);
    var snapshot =
      options.snapshot || buildStatusBriefSnapshot(context);
    var heuristic = buildHeuristicStatusBrief(snapshot);

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not-configured',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges UNE phrase de statut pour le r\u00e9sum\u00e9 d\'une carte Trello (Power-Up Cerveau).',
          profileLanguageInstruction(context && context.profile),
          'Le boss r\u00e9pond \u00e0\u00a0: \u00ab\u00a0Hey, \u00e0 propos de cette t\u00e2che\u2026 qu\'est-ce qui se passe\u00a0?\u00a0\u00bb',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"sentence":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- Une seule phrase, ton sec et factuel (manager press\u00e9), dans la langue/dialecte ci-dessus.',
          '- Max ~' + MAX_STATUS_BRIEF_LEN + ' caract\u00e8res.',
          '- SUBSTANCE OBLIGATOIRE\u00a0: nomme LE TRAVAIL concret (cardName, cardDesc, ou nextOpenItems) + qui porte + le fait utile (prochaine \u00e9tape, motif de blocage, \u00e9ch\u00e9ance manquante/retard).',
          '- Si nextOpenItems non vide\u00a0: cite la prochaine \u00e9tape. Sinon\u00a0: ancre la phrase sur cardName (et cardDesc si \u00e7a pr\u00e9cise).',
          '- scale (petit|moyen|gros) = adjectif seulement, JAMAIS le sujet. Interdit de r\u00e9pondre seulement avec la taille.',
          '- Si dueSoon=true\u00a0: mentionne le timing (dueCountdown) et l\'heure (dueTime) si elle est d\u00e9finie \u2014 ex. \u00ab\u00a0demain \u00e0 14 h\u00a0\u00bb. Si dueSoon=false et pas dueMissing/duePast\u00a0: ne parle PAS de l\'\u00e9ch\u00e9ance.',
          '- INTERDIT d\'encourager / flatter / rassurer\u00a0: pas de \u00ab\u00a0\u00e7a devrait aller vite\u00a0\u00bb, \u00ab\u00a0bien avanc\u00e9\u00a0\u00bb, \u00ab\u00a0t\'inqui\u00e8te\u00a0\u00bb, \u00ab\u00a0tu g\u00e8res\u00a0\u00bb.',
          '- INTERDIT les mots anglais dans une r\u00e9ponse fran\u00e7aise (quick, project, stuck, medium, status\u2026).',
          '- INTERDIT de citer le % de progr\u00e8s (d\u00e9j\u00e0 visible dans l\'UI).',
          '- INTERDIT les phrases vides\u00a0: \u00ab\u00a0petit reste \u00e0 finir\u00a0\u00bb, \u00ab\u00a0travail encore ouvert\u00a0\u00bb, \u00ab\u00a0c\'est en cours de ton c\u00f4t\u00e9\u00a0\u00bb, \u00ab\u00a0\u00c0 toi \u2014 demain\u00a0\u00bb sans dire QUOI.',
          '- N\'invente rien\u00a0: seulement le snapshot. Pas de pr\u00e9noms hors otherNames.',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 prochaine\u00a0: finaliser le montage ; pas d\'\u00e9ch\u00e9ance."',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 prochaine\u00a0: finaliser le montage ; demain \u00e0 14 h."',
          '- Ex. BON\u00a0: "\u00c0 toi \u2014 \u00ab\u00a0Fix login SSO\u00a0\u00bb encore ouvert ; demain."',
          '- Ex. BON\u00a0: "Chez Sam \u2014 bloqu\u00e9\u00a0: attente API."',
          '- Ex. MAUVAIS\u00a0: "\u00c0 toi \u2014 petit reste \u00e0 finir ; demain."',
          '- Ex. MAUVAIS\u00a0: "C\'est en cours de ton c\u00f4t\u00e9, avanc\u00e9 \u00e0 31\u00a0% ; c\'est un quick, donc \u00e7a devrait aller vite."',
          'Snapshot\u00a0:',
          JSON.stringify(snapshot)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Donne la phrase de statut (JSON {"sentence":"\u2026"}). Ancre-toi sur le travail r\u00e9el du snapshot (titre / desc / prochaine \u00e9tape). Heuristique de secours\u00a0: ' +
          heuristic
      }
    ];

    var debug = {
      id: 'status-brief-' + Date.now().toString(36),
      kind: 'cardStatusBriefTurn',
      label: 'R\u00e9sum\u00e9 statut (overview)',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardStatusBriefTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 120,
          temperature: 0.35
        });
        if (response.meta) {
          debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
        }
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (
          err &&
          err.message &&
          /response_format|json_object|json mode/i.test(err.message)
        ) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 120,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(
              Object.assign({ label: 'sans json mode' }, response.meta)
            );
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
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : null;
      emitDebug();
      return {
        ok: true,
        skipped: false,
        reason: 'llm-error',
        sentence: heuristic,
        source: 'heuristic',
        error: debug.error,
        debug: debug
      };
    }

    var data = null;
    try {
      var text = typeof response.content === 'string' ? response.content.trim() : '';
      var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      data = JSON.parse(text);
    } catch (parseErr) {
      data = null;
    }

    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request =
      response.meta ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    var aiSentence =
      data && typeof data.sentence === 'string'
        ? clampStatusBriefSentence(data.sentence)
        : '';
    if (!aiSentence || isVacuousStatusBrief(aiSentence)) {
      return {
        ok: true,
        skipped: true,
        reason: !aiSentence ? 'empty-sentence' : 'vacuous-sentence',
        sentence: heuristic,
        source: 'heuristic',
        usage: usage,
        debug: debug
      };
    }

    return {
      ok: true,
      skipped: false,
      sentence: aiSentence,
      source: 'ai',
      usage: usage,
      debug: debug
    };
  }

  var MAX_PROGRESS_SUMMARY_LEN = 120;

  function truncateProgressLabel(text, maxLen) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var lim = maxLen || 48;
    if (s.length <= lim) return s;
    return s.slice(0, lim - 1).replace(/[,:;\-–—\s]+$/, '') + '\u2026';
  }

  /**
   * Map a progress item (local checklist or linked-tree child) into a compact
   * outline node for the Progrès tab AI summary.
   */
  function mapProgressOutlineNode(raw, depth) {
    if (!raw || typeof raw !== 'object') return null;
    var text =
      typeof raw.text === 'string'
        ? raw.text.trim()
        : typeof raw.name === 'string'
          ? raw.name.trim()
          : '';
    if (!text) return null;
    var node = {
      text: truncateProgressLabel(text, depth > 1 ? 40 : 56),
      done: !!raw.done
    };
    if (raw.linkedCardId || raw.linked) node.linked = true;
    var kids = [];
    var sourceKids = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.children)
        ? raw.children
        : null;
    if (sourceKids && sourceKids.length && depth < 3) {
      for (var i = 0; i < sourceKids.length; i++) {
        var child = mapProgressOutlineNode(sourceKids[i], depth + 1);
        if (child) kids.push(child);
        if (kids.length >= 8) break;
      }
    }
    if (kids.length) node.children = kids;
    return node;
  }

  /**
   * Merge local checklists with resolved linked-card children for one subtask.
   */
  function outlineChildrenForItem(item, linkedNode) {
    var kids = [];
    var seen = Object.create(null);
    function pushKid(raw) {
      var node = mapProgressOutlineNode(raw, 2);
      if (!node) return;
      var key = node.text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      kids.push(node);
    }
    if (item && Array.isArray(item.items)) {
      item.items.forEach(pushKid);
    }
    if (linkedNode && Array.isArray(linkedNode.children)) {
      linkedNode.children.forEach(pushKid);
    }
    return kids.slice(0, 8);
  }

  /**
   * Unique Motifs for the Progrès summary when the card / a task is blocked.
   * Prefer card-level causes, then master progress, then item Motifs.
   */
  function collectProgressSummaryBlockedReasons(context, progress, items) {
    var reasons = [];
    var seen = Object.create(null);
    function pushAll(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var reason = typeof list[i] === 'string' ? list[i].trim() : '';
        if (!reason) continue;
        var key = reason.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        reasons.push(reason);
      }
    }
    var blocked = context && context.blocked;
    if (blocked && blocked.enabled) pushAll(blocked.blockedReasons);
    if (progress && progress.blocked) pushAll(progress.blockedReasons);
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      if (!item || item.done || !item.blocked) continue;
      pushAll(item.blockedReasons);
    }
    return reasons.slice(0, 4);
  }

  function isProgressSummaryStuck(context, progress, items) {
    var blocked = context && context.blocked;
    if (blocked && blocked.enabled) return true;
    if (progress && progress.blocked) return true;
    if (progress && progress.hasBlockedSubtasks) return true;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].blocked && !items[i].done) return true;
    }
    return false;
  }

  /**
   * Compact hierarchy for the Progrès collapsed-summary sentence.
   * options.linkedTreeByItemId: optional map from completion-ui linked resolve.
   */
  function buildProgressSummarySnapshot(context, options) {
    options = options || {};
    var progress = context && context.progress;
    var linkedTreeByItemId =
      options.linkedTreeByItemId && typeof options.linkedTreeByItemId === 'object'
        ? options.linkedTreeByItemId
        : null;

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

    var items = progress && Array.isArray(progress.items) ? progress.items : [];
    var outline = [];
    var openLabels = [];
    var doneCount = 0;
    var totalCount = 0;

    function walkCount(node) {
      if (!node) return;
      totalCount += 1;
      if (node.done) doneCount += 1;
      else if (node.text) openLabels.push(node.text);
      if (Array.isArray(node.children)) {
        node.children.forEach(walkCount);
      }
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== 'object') continue;
      var text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) continue;
      var linkedNode =
        linkedTreeByItemId && item.id != null
          ? linkedTreeByItemId[item.id] || linkedTreeByItemId[String(item.id)]
          : null;
      var node = {
        text: truncateProgressLabel(text, 56),
        done: !!item.done
      };
      if (item.linkedCardId || (linkedNode && linkedNode.linkedCardId)) {
        node.linked = true;
      }
      if (item.blocked) node.blocked = true;
      var kids = outlineChildrenForItem(item, linkedNode);
      if (kids.length) node.children = kids;
      outline.push(node);
      walkCount(node);
      if (outline.length >= 12) break;
    }

    // Prefer hierarchy walk counts; fall back to progress meta when empty.
    if (!totalCount && progress) {
      doneCount =
        typeof progress.doneCount === 'number' ? progress.doneCount : 0;
      totalCount =
        typeof progress.totalCount === 'number'
          ? progress.totalCount
          : items.length;
    }

    var openCount = Math.max(0, totalCount - doneCount);
    var stuck = isProgressSummaryStuck(context, progress, items);
    var blockedReasons = stuck
      ? collectProgressSummaryBlockedReasons(context, progress, items)
      : [];
    var phase = 'idle';
    if (percent != null && percent >= 100) phase = 'done';
    else if (totalCount > 0 && openCount <= 0) phase = 'done';
    else if (stuck) phase = 'blocked';
    else if ((percent != null && percent > 0) || doneCount > 0) {
      phase = 'in_progress';
    } else if (totalCount > 0) {
      phase = 'not_started';
    }

    return {
      cardName: context && context.cardName ? String(context.cardName) : '',
      phase: phase,
      stuck: stuck,
      blockedReasons: blockedReasons,
      progressPercent: percent,
      tasksDone: doneCount,
      tasksTotal: totalCount,
      tasksOpen: openCount,
      openLabels: openLabels.slice(0, 6),
      outline: outline
    };
  }

  function fingerprintProgressSummarySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    try {
      return JSON.stringify({
        v: 2,
        phase: snapshot.phase,
        stuck: !!snapshot.stuck,
        blockedReasons: snapshot.blockedReasons || [],
        progressPercent: snapshot.progressPercent,
        tasksDone: snapshot.tasksDone,
        tasksTotal: snapshot.tasksTotal,
        tasksOpen: snapshot.tasksOpen,
        openLabels: snapshot.openLabels || [],
        outline: snapshot.outline || []
      });
    } catch (e) {
      return '';
    }
  }

  function clampProgressSummarySentence(text) {
    var s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    if (s.length <= MAX_PROGRESS_SUMMARY_LEN) return s;
    var cut = s.slice(0, MAX_PROGRESS_SUMMARY_LEN - 1);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 60) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,:;.\-–—\s]+$/, '') + '\u2026';
  }

  /**
   * Deterministic Progrès summary when AI is unavailable.
   * Prefer a short synthesis of open task names over bare counts.
   * When blocked: show Motifs (block reasons), never the remaining task list.
   */
  function buildHeuristicProgressSummary(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    var open = snapshot.tasksOpen;
    var total = snapshot.tasksTotal;
    var labels = Array.isArray(snapshot.openLabels)
      ? snapshot.openLabels.filter(Boolean)
      : [];

    if (snapshot.stuck || snapshot.phase === 'blocked') {
      var reasons = Array.isArray(snapshot.blockedReasons)
        ? snapshot.blockedReasons.filter(Boolean)
        : [];
      if (!reasons.length) return 'Bloqu\u00e9';
      if (reasons.length === 1) {
        return clampProgressSummarySentence(reasons[0]);
      }
      var joined = reasons.join(', ');
      if (joined.length <= 42) return clampProgressSummarySentence(joined);
      return clampProgressSummarySentence(
        reasons[0] + ' +' + (reasons.length - 1)
      );
    }

    if (!total) {
      if (snapshot.phase === 'done' || snapshot.progressPercent >= 100) {
        return 'Compl\u00e9t\u00e9';
      }
      if (
        snapshot.progressPercent != null &&
        snapshot.progressPercent > 0 &&
        snapshot.progressPercent < 100
      ) {
        return snapshot.progressPercent + '\u00a0%';
      }
      return 'En attente';
    }

    if (snapshot.phase === 'done' || open <= 0) return 'Compl\u00e9t\u00e9';

    if (labels.length === 1) {
      return clampProgressSummarySentence('Reste\u00a0: ' + labels[0] + '.');
    }
    if (labels.length === 2) {
      return clampProgressSummarySentence(
        'Reste\u00a0: ' + labels[0] + ' et ' + labels[1] + '.'
      );
    }
    if (labels.length >= 3) {
      return clampProgressSummarySentence(
        'Reste\u00a0: ' +
          labels[0] +
          ', ' +
          labels[1] +
          ' et ' +
          (open - 2) +
          ' autre' +
          (open - 2 > 1 ? 's' : '') +
          '.'
      );
    }

    if (open === 1) return 'Une t\u00e2che restante';
    if (open === 2) return 'Deux t\u00e2ches restantes';
    return open + ' t\u00e2ches restantes';
  }

  /**
   * AI Progrès tab summary: one short sentence combining the task hierarchy.
   * Returns { ok, skipped?, reason?, sentence?, source, usage?, debug }.
   */
  async function cardProgressSummaryTurn(provider, bridge, options) {
    options = options || {};
    var onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;
    var context = options.context || buildContext(bridge);
    var snapshot =
      options.snapshot ||
      buildProgressSummarySnapshot(context, {
        linkedTreeByItemId: options.linkedTreeByItemId
      });
    var heuristic = buildHeuristicProgressSummary(snapshot);

    // Blocked: Motifs are structured — skip AI so the reason replaces open tasks.
    if (snapshot.stuck || snapshot.phase === 'blocked') {
      return {
        ok: true,
        skipped: true,
        reason: 'blocked',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      return {
        ok: true,
        skipped: true,
        reason: 'not-configured',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    if (!snapshot.tasksTotal && !(snapshot.outline && snapshot.outline.length)) {
      return {
        ok: true,
        skipped: true,
        reason: 'no-tasks',
        sentence: heuristic,
        source: 'heuristic'
      };
    }

    var messages = [
      {
        role: 'system',
        content: [
          'Tu r\u00e9diges UNE phrase courte pour le r\u00e9sum\u00e9 de l\'onglet Progr\u00e8s d\'une carte Trello.',
          'Objectif\u00a0: synth\u00e9tiser le sens de TOUTES les t\u00e2ches, sous-t\u00e2ches et sous-sous-t\u00e2ches (outline) en une phrase utile.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"sentence":"\u2026"}',
          'R\u00e8gles\u00a0:',
          '- Une seule phrase, fran\u00e7ais, ton clair et factuel.',
          '- Max ~' + MAX_PROGRESS_SUMMARY_LEN + ' caract\u00e8res.',
          '- Combine / synth\u00e9tise\u00a0: ne liste pas tout comme un inventaire robotique.',
          '- Si stuck/phase=blocked\u00a0: r\u00e9sume UNIQUEMENT les causes (blockedReasons), pas les t\u00e2ches ouvertes.',
          '- Si du travail reste (non bloqu\u00e9)\u00a0: dis ce qui reste \u00e0 faire (th\u00e8me + prochaines \u00e9tapes utiles).',
          '- Si tout est done\u00a0: dis que c\'est termin\u00e9, en rappelant bri\u00e8vement le sujet.',
          '- INTERDIT de citer le % de progr\u00e8s.',
          '- INTERDIT d\'encourager / flatter.',
          '- N\'invente aucune \u00e9tape absente de outline / openLabels / blockedReasons.',
          '- Ex. BON\u00a0: "Reste la validation client (maquette + feedback) avant publication."',
          '- Ex. BON\u00a0: "R\u00e9daction du brief termin\u00e9e\u00a0; encha\u00eene sur relecture et envoi."',
          '- Ex. BON (bloqu\u00e9)\u00a0: "En attente d\'une approbation."',
          '- Ex. MAUVAIS\u00a0: "3 t\u00e2ches restantes."',
          '- Ex. MAUVAIS (bloqu\u00e9)\u00a0: citer une t\u00e2che ouverte au lieu de blockedReasons.',
          'Snapshot\u00a0:',
          JSON.stringify(snapshot)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Donne la phrase de r\u00e9sum\u00e9 Progr\u00e8s (JSON {"sentence":"\u2026"}). Heuristique de secours\u00a0: ' +
          heuristic
      }
    ];

    var debug = {
      id: 'progress-summary-' + Date.now().toString(36),
      kind: 'cardProgressSummaryTurn',
      label: 'R\u00e9sum\u00e9 Progr\u00e8s',
      startedAt: Date.now(),
      attempts: []
    };
    function emitDebug() {
      if (!onDebug) return;
      try {
        onDebug(debug);
      } catch (cbErr) {
        console.error('cardProgressSummaryTurn onDebug failed', cbErr);
      }
    }

    var response;
    var t0 = Date.now();
    try {
      try {
        response = await chatCompletions(p, messages, {
          jsonMode: true,
          max_tokens: 120,
          temperature: 0.35
        });
        if (response.meta) {
          debug.attempts.push(Object.assign({ label: 'json' }, response.meta));
        }
      } catch (err) {
        if (err && err.debugMeta) {
          debug.attempts.push(Object.assign({ label: 'json' }, err.debugMeta));
        }
        if (
          err &&
          err.message &&
          /response_format|json_object|json mode/i.test(err.message)
        ) {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 120,
            temperature: 0.35
          });
          if (response.meta) {
            debug.attempts.push(
              Object.assign({ label: 'sans json mode' }, response.meta)
            );
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
      debug.request = debug.attempts.length
        ? debug.attempts[debug.attempts.length - 1]
        : null;
      emitDebug();
      return {
        ok: true,
        skipped: false,
        reason: 'llm-error',
        sentence: heuristic,
        source: 'heuristic',
        error: debug.error,
        debug: debug
      };
    }

    var data = null;
    try {
      var text = typeof response.content === 'string' ? response.content.trim() : '';
      var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) text = fence[1].trim();
      var start = text.indexOf('{');
      var end = text.lastIndexOf('}');
      if (start >= 0 && end > start) text = text.slice(start, end + 1);
      data = JSON.parse(text);
    } catch (parseErr) {
      data = null;
    }

    var usage = extractUsageFromRaw(response.raw, messages, response.content, p.model);
    usage.latencyMs = Date.now() - t0;
    debug.endedAt = Date.now();
    debug.latencyMs = usage.latencyMs;
    debug.ok = true;
    debug.request =
      response.meta ||
      (debug.attempts.length ? debug.attempts[debug.attempts.length - 1] : null);
    debug.response = {
      status: response.meta && response.meta.status,
      content: response.content,
      raw: cloneJsonSafe(response.raw),
      parsed: data
    };
    debug.usage = usage;
    emitDebug();

    var aiSentence =
      data && typeof data.sentence === 'string'
        ? clampProgressSummarySentence(data.sentence)
        : '';
    if (!aiSentence) {
      return {
        ok: true,
        skipped: true,
        reason: 'empty-sentence',
        sentence: heuristic,
        source: 'heuristic',
        usage: usage,
        debug: debug
      };
    }

    return {
      ok: true,
      skipped: false,
      sentence: aiSentence,
      source: 'ai',
      usage: usage,
      debug: debug
    };
  }

  /** Compact snapshot of fields already visible on the card (so dream does not repeat them). */
  function buildDreamCardSnapshot(context) {
    var due = context && context.due;
    var progress = context && context.progress;
    var blocked = context && context.blocked;
    var items =
      progress && Array.isArray(progress.items)
        ? progress.items
            .map(function (it) {
              if (!it || typeof it !== 'object') return null;
              var text = typeof it.text === 'string' ? it.text.trim() : '';
              if (!text) return null;
              return (it.done ? '[x] ' : '[ ] ') + text.slice(0, 80);
            })
            .filter(Boolean)
            .slice(0, 8)
        : [];
    return {
      due:
        due && due.enabled && due.dueDate
          ? {
              dueDate: due.dueDate,
              dueTime: due.dueTime || null
            }
          : null,
      progress:
        progress && progress.enabled !== false
          ? {
              percent:
                typeof progress.percent === 'number'
                  ? progress.percent
                  : typeof progress.cardProgress === 'number'
                    ? progress.cardProgress
                    : null,
              items: items
            }
          : null,
      blocked:
        blocked && blocked.enabled
          ? {
              reasons: Array.isArray(blocked.blockedReasons)
                ? blocked.blockedReasons.slice(0, 4)
                : []
            }
          : null,
      statut:
        context && context.statut && context.statut.listName
          ? context.statut.listName
          : null
    };
  }

  // exports
  S.MAX_PROGRESS_SUMMARY_LEN = MAX_PROGRESS_SUMMARY_LEN;
  S.buildDreamCardSnapshot = buildDreamCardSnapshot;
  S.buildHeuristicProgressSummary = buildHeuristicProgressSummary;
  S.buildHeuristicStatusBrief = buildHeuristicStatusBrief;
  S.buildProgressSummarySnapshot = buildProgressSummarySnapshot;
  S.cardProgressSummaryTurn = cardProgressSummaryTurn;
  S.cardStatusBriefTurn = cardStatusBriefTurn;
  S.clampProgressSummarySentence = clampProgressSummarySentence;
  S.collectProgressSummaryBlockedReasons = collectProgressSummaryBlockedReasons;
  S.fingerprintProgressSummarySnapshot = fingerprintProgressSummarySnapshot;
  S.isProgressSummaryStuck = isProgressSummaryStuck;
  S.isVacuousStatusBrief = isVacuousStatusBrief;
  S.mapProgressOutlineNode = mapProgressOutlineNode;
  S.outlineChildrenForItem = outlineChildrenForItem;
  S.truncateProgressLabel = truncateProgressLabel;
})(typeof window !== 'undefined' ? window : this);
