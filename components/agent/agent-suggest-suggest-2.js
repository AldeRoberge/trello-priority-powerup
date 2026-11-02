/**
 * agent-suggest: part 3 of 3 (heuristicLabelSuggestions).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-suggest.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var LABEL_SUGGEST_MIN_CONFIDENCE = S.LABEL_SUGGEST_MIN_CONFIDENCE;
  var TASK_TYPE_SUGGEST_MIN_CONFIDENCE = S.TASK_TYPE_SUGGEST_MIN_CONFIDENCE;

  // from other parts (functions, resolved at call time)
  function normalizeBoardLabelRef() { return S.normalizeBoardLabelRef.apply(this, arguments); }
  function agentTaskTypeCatalog() { return S.agentTaskTypeCatalog.apply(this, arguments); }
  function chatCompletions() { return S.chatCompletions.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgFetchMeta() { return S.dbgFetchMeta.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function extractUsageFromRaw() { return S.extractUsageFromRaw.apply(this, arguments); }
  function isConfigured() { return S.isConfigured.apply(this, arguments); }
  function normalizeProvider() { return S.normalizeProvider.apply(this, arguments); }
  function normalizeSuggestionList() { return S.normalizeSuggestionList.apply(this, arguments); }
  function parseAssistantPayload() { return S.parseAssistantPayload.apply(this, arguments); }
  function stripSpaceBeforePunctuation() { return S.stripSpaceBeforePunctuation.apply(this, arguments); }
  function userTurnWithClock() { return S.userTurnWithClock.apply(this, arguments); }

  function heuristicLabelSuggestions(context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var hay = (
      String(ctx.cardName || '') +
      ' ' +
      String(ctx.cardDesc || '') +
      ' ' +
      String(ctx.priorityLabel || '')
    )
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!hay.trim()) return [];
    var existingIds = Object.create(null);
    (Array.isArray(ctx.existingLabels) ? ctx.existingLabels : []).forEach(
      function (label) {
        if (label && label.id) existingIds[String(label.id)] = true;
      }
    );
    var scored = [];
    (Array.isArray(ctx.boardLabels) ? ctx.boardLabels : []).forEach(function (label) {
      if (!label || !label.id || existingIds[String(label.id)]) return;
      var name = typeof label.name === 'string' ? label.name.trim() : '';
      if (!name || name.length < 2) return;
      var needle = name
        .toLocaleLowerCase('fr-FR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (hay.indexOf(needle) !== -1 || needle.indexOf(hay.trim().slice(0, 24)) !== -1) {
        scored.push({
          id: String(label.id),
          name: name,
          color: label.color != null ? label.color : null,
          idBoard: label.idBoard,
          confidence: 0.7,
          isNew: false
        });
      }
    });
    return scored.slice(0, 3);
  }

  function heuristicTaskTypeSuggestions(context) {
    var ctx = context && typeof context === 'object' ? context : {};
    var hay = (
      String(ctx.cardName || '') +
      ' ' +
      String(ctx.cardDesc || '')
    )
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    var existing = Object.create(null);
    (Array.isArray(ctx.existingTypes) ? ctx.existingTypes : []).forEach(function (id) {
      if (id) existing[String(id)] = true;
    });
    var rules = [
      { id: 'communication', re: /\b(mail|email|reunion|meeting|appeler|ecrire|message|slack|discuter|parler)\b/ },
      { id: 'exploratory', re: /\b(recherch|explor|analyser|audit|etude|decouvrir|investig)\b/ },
      { id: 'recurring', re: /\b(recurrent|chaque|hebdo|quotidien|mensuel|routine|regulier)\b/ },
      { id: 'project', re: /\b(projet|roadmap|chantier|phase|jalon|milestone)\b/ },
      { id: 'deliverable', re: /\b(livrable|document|rapport|pdf|diapo|presentation|slides|article)\b/ },
      { id: 'thinking', re: /\b(reflech|decid|penser|strategie|brainstorm|planifier)\b/ },
      { id: 'process', re: /\b(process|maintenance|menage|ranger|nettoyer|ops|procedure)\b/ },
      { id: 'emotional', re: /\b(emotion|stress|anxi|psy|confiance|motivation)\b/ },
      { id: 'material', re: /\b(materiel|fourniture|equipement|outil|stock|commander|achat|acheter)\b/ },
      { id: 'learning', re: /\b(apprend|formation|cours|etudier|tutoriel|competence|certif)\b/ },
      { id: 'admin', re: /\b(administratif|paperasse|formulaire|declaration|formalit)\b/ },
      { id: 'creative', re: /\b(creatif|design|dessin|illustration|montage|maquette|contenu)\b/ },
      { id: 'finance', re: /\b(budget|payer|paiement|facture|argent|finance|cout|devis)\b/ },
      { id: 'action', re: /\b(faire|installer|envoyer|fixer|completer|terminer)\b/ }
    ];
    var out = [];
    for (var i = 0; i < rules.length; i++) {
      if (existing[rules[i].id]) continue;
      if (rules[i].re.test(hay)) {
        out.push({ id: rules[i].id, confidence: 0.62 });
      }
      if (out.length >= 3) break;
    }
    if (!out.length && !existing.action && hay.trim()) {
      out.push({ id: 'action', confidence: 0.5 });
    }
    return out;
  }

  /**
   * Suggest board labels (and optional new names) for Information → Étiquettes.
   * context: { cardName?, cardDesc?, priorityLabel?, existingLabels?, boardLabels? }
   * @returns {Promise<Array<{id?:string,name:string,color?:*,confidence:number,isNew?:boolean}>>}
   */
  async function suggestLabels(provider, context, options) {
    options = options || {};
    var minConfidence =
      typeof options.minConfidence === 'number' && isFinite(options.minConfidence)
        ? options.minConfidence
        : LABEL_SUGGEST_MIN_CONFIDENCE;
    var p = normalizeProvider(provider);
    var ctx = context && typeof context === 'object' ? context : {};
    var fallback = heuristicLabelSuggestions(ctx);

    var boardLabels = Array.isArray(ctx.boardLabels)
      ? ctx.boardLabels.filter(function (label) {
          return label && label.id;
        })
      : [];

    var existingIds = Object.create(null);
    var existingNames = Object.create(null);
    (Array.isArray(ctx.existingLabels) ? ctx.existingLabels : []).forEach(
      function (label) {
        if (!label) return;
        if (label.id) existingIds[String(label.id)] = true;
        var n =
          typeof label.name === 'string' ? label.name.trim().toLocaleLowerCase('fr-FR') : '';
        if (n) existingNames[n] = true;
      }
    );

    var available = boardLabels
      .filter(function (label) {
        return !existingIds[String(label.id)];
      })
      .slice(0, 60)
      .map(function (label) {
        return {
          id: String(label.id),
          name: typeof label.name === 'string' ? label.name.trim().slice(0, 80) : '',
          color: label.color != null ? String(label.color) : null
        };
      });

    if (!isConfigured(p)) return fallback;

    var byId = Object.create(null);
    var byName = Object.create(null);
    available.forEach(function (label) {
      byId[label.id] = label;
      if (label.name) {
        var key = label.name.toLocaleLowerCase('fr-FR');
        if (!byName[key]) byName[key] = label;
      }
    });

    var payload = {
      cardName: typeof ctx.cardName === 'string' ? ctx.cardName.slice(0, 200) : '',
      cardDesc:
        typeof ctx.cardDesc === 'string'
          ? ctx.cardDesc.trim().replace(/\s+/g, ' ').slice(0, 600)
          : '',
      priorityLabel:
        typeof ctx.priorityLabel === 'string' ? ctx.priorityLabel.slice(0, 80) : '',
      boardLabels: available
    };

    var title = String(payload.cardName || '').trim();
    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des \u00e9tiquettes Trello pour une carte, d\u2019apr\u00e8s le titre et la description.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":[{"id":"\u2026","confidence":0.0},{"name":"Nouveau","color":"blue","confidence":0.0}]}',
          'R\u00e8gles\u00a0:',
          '- Propose 1 \u00e0 3 suggestions utiles (pas 0 sauf carte totalement vide).',
          '- Pr\u00e9f\u00e8re d\u2019abord les \u00e9tiquettes existantes de boardLabels (id exact).',
          '- Si aucune \u00e9tiquette du tableau ne convient, propose un NOUVEAU nom court (name, sans id) + color Trello (green|yellow|orange|red|purple|blue|sky|lime|pink|black).',
          '- confidence = 0\u20131. Inclus seulement si \u2265 ' +
            String(minConfidence) +
            ' (ou omets confidence\u00a0: on assumera un bon match).',
          '- Noms nouveaux\u00a0: 1\u20133 mots max, fran\u00e7ais, concrets (pas \u00ab\u00a0Divers\u00a0\u00bb / \u00ab\u00a0Autre\u00a0\u00bb).',
          '- INTERDIT\u00a0: ids hors boardLabels\u00a0; \u00e9tiquettes d\u00e9j\u00e0 sur la carte\u00a0; suggestions dans le chat.',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: title
          ? 'Quelles \u00e9tiquettes collent \u00e0\u00a0: \u00ab\u00a0' +
            title.slice(0, 200) +
            '\u00a0\u00bb\u00a0? Utilise les indices du titre/description.'
          : 'Propose des \u00e9tiquettes pertinentes pour cette carte (indices du contexte).'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 280,
        temperature: 0.35,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 280,
            temperature: 0.35,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestLabels failed', err2);
          return fallback;
        }
      } else {
        console.error('PriorityAgent.suggestLabels failed', err);
        return fallback;
      }
    }

    var rawList = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      rawList = parsed.suggestions || parsed.labels || [];
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        rawList = raw.suggestions || raw.labels || [];
      } catch (e2) {
        rawList = [];
      }
    }
    if (!Array.isArray(rawList)) rawList = [];

    var out = [];
    var seen = Object.create(null);
    var seenNames = Object.create(null);
    for (var i = 0; i < rawList.length; i++) {
      var ref = normalizeBoardLabelRef(rawList[i]);
      if (!ref) continue;
      var confidence =
        ref.confidence == null ? 0.72 : ref.confidence;
      if (confidence < minConfidence) continue;

      var match = null;
      if (ref.id && byId[ref.id]) match = byId[ref.id];
      else if (ref.name) {
        match = byName[ref.name.toLocaleLowerCase('fr-FR')] || null;
      }

      if (match) {
        if (existingIds[match.id] || seen[match.id]) continue;
        if (match.name && existingNames[match.name.toLocaleLowerCase('fr-FR')]) {
          continue;
        }
        seen[match.id] = true;
        var full = null;
        for (var j = 0; j < boardLabels.length; j++) {
          if (boardLabels[j] && String(boardLabels[j].id) === match.id) {
            full = boardLabels[j];
            break;
          }
        }
        out.push({
          id: match.id,
          name: full && typeof full.name === 'string' ? full.name : match.name,
          color: full && full.color != null ? full.color : match.color,
          idBoard: full && full.idBoard != null ? full.idBoard : undefined,
          confidence: confidence,
          isNew: false
        });
      } else if (ref.name) {
        var newName = ref.name.trim().slice(0, 50);
        var nameKey = newName.toLocaleLowerCase('fr-FR');
        if (!newName || existingNames[nameKey] || seenNames[nameKey] || byName[nameKey]) {
          continue;
        }
        seenNames[nameKey] = true;
        out.push({
          id: '',
          name: newName,
          color: ref.color || 'blue',
          confidence: confidence,
          isNew: true
        });
      }
      if (out.length >= 3) break;
    }

    if (!out.length && fallback.length) return fallback;
    return out;
  }

  /**
   * Suggest task-type catalog ids for Information → Type de tâche.
   * context: { cardName?, cardDesc?, existingTypes? }
   * @returns {Promise<Array<{id:string,label?:string,confidence:number}>>}
   */
  async function suggestTaskTypes(provider, context, options) {
    options = options || {};
    var minConfidence =
      typeof options.minConfidence === 'number' && isFinite(options.minConfidence)
        ? options.minConfidence
        : TASK_TYPE_SUGGEST_MIN_CONFIDENCE;
    var p = normalizeProvider(provider);
    var ctx = context && typeof context === 'object' ? context : {};
    var existing = Object.create(null);
    (Array.isArray(ctx.existingTypes) ? ctx.existingTypes : []).forEach(function (id) {
      if (id) existing[String(id)] = true;
    });
    var fullCatalog = agentTaskTypeCatalog();
    var catalog = fullCatalog.filter(function (entry) {
      return !existing[entry.id];
    });
    var fallback = heuristicTaskTypeSuggestions(ctx)
      .filter(function (row) {
        return row && row.id && !existing[row.id];
      })
      .map(function (row) {
        var entry = null;
        for (var i = 0; i < fullCatalog.length; i++) {
          if (fullCatalog[i].id === row.id) {
            entry = fullCatalog[i];
            break;
          }
        }
        return {
          id: row.id,
          label: entry ? entry.label : row.id,
          hint: entry ? entry.hint : '',
          confidence: row.confidence
        };
      });

    if (!catalog.length) return [];
    if (!isConfigured(p)) return fallback.slice(0, 3);

    var payload = {
      cardName: typeof ctx.cardName === 'string' ? ctx.cardName.slice(0, 200) : '',
      cardDesc:
        typeof ctx.cardDesc === 'string'
          ? ctx.cardDesc.trim().replace(/\s+/g, ' ').slice(0, 600)
          : '',
      catalog: catalog,
      existingTypes: Object.keys(existing)
    };
    var title = String(payload.cardName || '').trim();
    var messages = [
      {
        role: 'system',
        content: [
          'Tu classifies une carte Trello dans 1 \u00e0 3 types de t\u00e2che du catalogue.',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0: {"suggestions":[{"id":"action","confidence":0.8}]}',
          'R\u00e8gles\u00a0:',
          '- Choisis UNIQUEMENT des id du catalog.',
          '- Propose 1\u20133 types qui collent au titre/description (pas 0 si le titre a du sens).',
          '- confidence 0\u20131. Inclus seulement si \u2265 ' +
            String(minConfidence) +
            ' (ou omets confidence).',
          '- INTERDIT\u00a0: ids hors catalog\u00a0; types d\u00e9j\u00e0 s\u00e9lectionn\u00e9s\u00a0; suggestions chat.',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: title
          ? 'Quels types collent \u00e0\u00a0: \u00ab\u00a0' +
            title.slice(0, 200) +
            '\u00a0\u00bb\u00a0?'
          : 'Propose les types de t\u00e2che les plus pertinents.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 180,
        temperature: 0.3,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        try {
          response = await chatCompletions(p, messages, {
            jsonMode: false,
            max_tokens: 180,
            temperature: 0.3,
            stream: false
          });
        } catch (err2) {
          console.error('PriorityAgent.suggestTaskTypes failed', err2);
          return fallback.slice(0, 3);
        }
      } else {
        console.error('PriorityAgent.suggestTaskTypes failed', err);
        return fallback.slice(0, 3);
      }
    }

    var rawList = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      rawList = parsed.suggestions || parsed.types || parsed.taskTypes || [];
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        rawList = raw.suggestions || raw.types || raw.taskTypes || [];
      } catch (e2) {
        rawList = [];
      }
    }
    if (!Array.isArray(rawList)) rawList = [];

    var byId = Object.create(null);
    catalog.forEach(function (entry) {
      byId[entry.id] = entry;
    });

    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < rawList.length; i++) {
      var row = rawList[i];
      var id =
        typeof row === 'string'
          ? row.trim()
          : row && row.id != null
            ? String(row.id).trim()
            : '';
      if (!id || !byId[id] || existing[id] || seen[id]) continue;
      var confidence = Number(row && row.confidence);
      if (!isFinite(confidence)) confidence = Number(row && row.score);
      if (!isFinite(confidence)) confidence = 0.72;
      else {
        if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
        confidence = Math.max(0, Math.min(1, confidence));
      }
      if (confidence < minConfidence) continue;
      seen[id] = true;
      out.push({
        id: id,
        label: byId[id].label,
        hint: byId[id].hint,
        confidence: confidence
      });
      if (out.length >= 3) break;
    }

    if (!out.length) return fallback.slice(0, 3);
    return out;
  }

  function normalizeMetricSuggestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 120) return null;
    var type = raw.type === 'sentimental' ? 'sentimental' : 'incremental';
    var direction =
      raw.direction === 'decrease' || raw.direction === 'hold' ? raw.direction : 'increase';
    var measurement = raw.measurement === 'direct' ? 'direct' : 'manual';
    var currentValue = Number(raw.currentValue);
    if (!isFinite(currentValue)) currentValue = 0;
    var metric = {
      name: name,
      type: type,
      direction: direction,
      measurement: measurement,
      currentValue: currentValue,
      isPrimary: raw.isPrimary === true
    };
    var target = Number(raw.target);
    if (isFinite(target)) metric.target = target;
    if (type === 'sentimental' && Array.isArray(raw.scaleLabels) && raw.scaleLabels.length >= 2) {
      var lo = typeof raw.scaleLabels[0] === 'string' ? raw.scaleLabels[0].trim() : '';
      var hi = typeof raw.scaleLabels[1] === 'string' ? raw.scaleLabels[1].trim() : '';
      if (lo && hi) metric.scaleLabels = [lo.slice(0, 80), hi.slice(0, 80)];
    }
    return metric;
  }

  function normalizeMetricSuggestionList(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    var primaryClaimed = false;
    for (var i = 0; i < list.length; i++) {
      var metric = normalizeMetricSuggestion(list[i]);
      if (!metric) continue;
      var key = metric.name.toLocaleLowerCase('fr-FR');
      if (seen[key]) continue;
      seen[key] = true;
      if (metric.isPrimary) {
        if (primaryClaimed) metric.isPrimary = false;
        else primaryClaimed = true;
      }
      out.push(metric);
      if (out.length >= 3) break;
    }
    if (out.length && !primaryClaimed) out[0].isPrimary = true;
    return out;
  }

  /**
   * Suggest mission metrics from Vision + Mission names.
   * context: { visionName, missionName, boardName?, existingMetrics? }
   * Returns [{ name, type, direction, measurement, currentValue, target?, scaleLabels?, isPrimary }]
   */
  async function suggestMetrics(provider, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return [];
    var ctx = context && typeof context === 'object' ? context : {};
    var visionName = typeof ctx.visionName === 'string' ? ctx.visionName.trim() : '';
    var missionName = typeof ctx.missionName === 'string' ? ctx.missionName.trim() : '';
    if (!missionName) return [];

    var existing = Array.isArray(ctx.existingMetrics) ? ctx.existingMetrics : [];
    var existingNames = existing
      .map(function (m) {
        return typeof m === 'string' ? m.trim() : m && m.name ? String(m.name).trim() : '';
      })
      .filter(Boolean);

    var payload = {
      visionName: visionName.slice(0, 200),
      missionName: missionName.slice(0, 200),
      boardName: typeof ctx.boardName === 'string' ? ctx.boardName.slice(0, 200) : '',
      existingMetrics: existingNames.slice(0, 30)
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu proposes des m\u00e9triques pour une Mission Trello (Objectifs\u00a0: Vision \u2192 Mission).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"metrics":[{"name":"\u2026","type":"incremental|sentimental","direction":"increase|decrease|hold","measurement":"manual|direct","currentValue":0,"target":100,"scaleLabels":["bas","haut"],"isPrimary":true}]}',
          'Propose 1 \u00e0 3 m\u00e9triques (pr\u00e9f\u00e8re 2) ancr\u00e9es dans les noms Vision et Mission.',
          'Exactement UNE m\u00e9trique isPrimary:true (la plus centrale pour la mission).',
          'type incremental = quantit\u00e9 num\u00e9rique\u00a0; sentimental = \u00e9chelle subjective (alors scaleLabels [bas, haut] obligatoires).',
          'direction\u00a0: increase / decrease / hold selon l\'objectif.',
          'measurement\u00a0: manual (saisie) ou direct (suivi auto) \u2014 privil\u00e9gie manual.',
          'currentValue et target num\u00e9riques coh\u00e9rents (target optionnel si hold).',
          'Noms courts en fran\u00e7ais, concrets, mesurables.',
          'INTERDIT\u00a0: dupliquer une m\u00e9trique existante (m\u00eame sens).',
          'INTERDIT\u00a0: placeholders g\u00e9n\u00e9riques (\u00ab\u00a0KPI 1\u00a0\u00bb, \u00ab\u00a0M\u00e9trique principale\u00a0\u00bb).',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content:
          'Propose des m\u00e9triques pour la mission \u00ab\u00a0' +
          missionName +
          '\u00a0\u00bb' +
          (visionName ? ' (vision\u00a0: \u00ab\u00a0' + visionName + '\u00a0\u00bb)' : '') +
          '.'
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 520,
        temperature: 0.45,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 520,
          temperature: 0.45,
          stream: false
        });
      } else {
        console.error('PriorityAgent.suggestMetrics failed', err);
        return [];
      }
    }

    var list = [];
    try {
      var parsed = parseAssistantPayload(response.content);
      list = normalizeMetricSuggestionList(parsed.metrics || parsed.suggestions);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        list = normalizeMetricSuggestionList(raw.metrics || raw.suggestions);
      } catch (e2) {
        list = [];
      }
    }

    var existingKeys = {};
    for (var i = 0; i < existingNames.length; i++) {
      existingKeys[existingNames[i].toLocaleLowerCase('fr-FR')] = true;
    }
    return list.filter(function (m) {
      return m && m.name && !existingKeys[m.name.toLocaleLowerCase('fr-FR')];
    });
  }

  /**
   * Parse free-text into a single metric payload.
   * context: { visionName?, missionName?, boardName?, existingMetrics?, hasPrimary? }
   * Returns normalized metric or null.
   */
  async function parseMetric(provider, text, context, options) {
    options = options || {};
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) return null;
    var rawText = typeof text === 'string' ? text.trim() : '';
    if (!rawText) return null;

    var ctx = context && typeof context === 'object' ? context : {};
    var visionName = typeof ctx.visionName === 'string' ? ctx.visionName.trim() : '';
    var missionName = typeof ctx.missionName === 'string' ? ctx.missionName.trim() : '';
    var existing = Array.isArray(ctx.existingMetrics) ? ctx.existingMetrics : [];
    var existingNames = existing
      .map(function (m) {
        return typeof m === 'string' ? m.trim() : m && m.name ? String(m.name).trim() : '';
      })
      .filter(Boolean);
    var hasPrimary = ctx.hasPrimary === true || existing.some(function (m) {
      return m && m.isPrimary;
    });

    var payload = {
      text: rawText.slice(0, 400),
      visionName: visionName.slice(0, 200),
      missionName: missionName.slice(0, 200),
      boardName: typeof ctx.boardName === 'string' ? ctx.boardName.slice(0, 200) : '',
      existingMetrics: existingNames.slice(0, 30),
      hasPrimary: hasPrimary
    };

    var messages = [
      {
        role: 'system',
        content: [
          'Tu convertis une description libre en UNE m\u00e9trique Trello (Objectifs\u00a0: Vision \u2192 Mission).',
          'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
          '{"metric":{"name":"\u2026","type":"incremental|sentimental","direction":"increase|decrease|hold","measurement":"manual|direct","currentValue":0,"target":100,"scaleLabels":["bas","haut"],"isPrimary":false}}',
          'Extrais tout ce qui est dit (nom, valeurs, direction, type). Compl\u00e8te seulement les champs manquants de fa\u00e7on raisonnable.',
          'type incremental = quantit\u00e9 num\u00e9rique\u00a0; sentimental = \u00e9chelle subjective (alors scaleLabels [bas, haut] obligatoires).',
          'Ex. \u00ab\u00a0NPS de 30 \u00e0 70\u00a0\u00bb \u2192 incremental, increase, currentValue 30, target 70.',
          'Ex. \u00ab\u00a0Satisfaction de mauvais \u00e0 excellent\u00a0\u00bb \u2192 sentimental, increase, scaleLabels.',
          'Ex. \u00ab\u00a0Maintenir le taux \u00e0 80\u00a0\u00bb \u2192 hold, currentValue/target 80.',
          'measurement\u00a0: manual sauf si l\'utilisateur demande un suivi auto/direct.',
          'isPrimary:true seulement si explicitement demand\u00e9 OU si aucune m\u00e9trique principale n\'existe encore (hasPrimary:false).',
          'Nom court en fran\u00e7ais, concret, mesurable \u2014 jamais un copier-coller trop long de la phrase.',
          'INTERDIT\u00a0: inventer une autre m\u00e9trique sans rapport avec le texte.',
          'INTERDIT\u00a0: dupliquer une m\u00e9trique existante (m\u00eame sens).',
          'Contexte\u00a0:',
          JSON.stringify(payload)
        ].join('\n')
      },
      {
        role: 'user',
        content: 'Parse cette m\u00e9trique\u00a0: ' + rawText.slice(0, 400)
      }
    ];

    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 360,
        temperature: 0.2,
        stream: false
      });
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 360,
          temperature: 0.2,
          stream: false
        });
      } else {
        console.error('PriorityAgent.parseMetric failed', err);
        return null;
      }
    }

    var metric = null;
    try {
      var parsed = parseAssistantPayload(response.content);
      metric = normalizeMetricSuggestion(parsed.metric || parsed);
    } catch (e) {
      try {
        var raw = JSON.parse(response.content);
        metric = normalizeMetricSuggestion(raw.metric || raw);
      } catch (e2) {
        metric = null;
      }
    }
    if (!metric) return null;
    if (hasPrimary) metric.isPrimary = false;
    return metric;
  }

  /**
   * Conversational turn for memory alignment (no card tools).
   * Returns { message, suggestions, patches, rawJson, usage }.
   */
  async function memoryTurn(provider, history, memory, userText, options) {
    options = options || {};
    var mode = options.mode === 'onboarding' ? 'onboarding' : 'ongoing';
    dbgLog('agent', 'memoryTurn.start', { mode: mode });
    var p = normalizeProvider(provider);
    if (!isConfigured(p)) {
      dbgLog('agent', 'memoryTurn.end', { ok: false, reason: 'not-configured' });
      return {
        message: 'Configurez d\'abord un fournisseur IA dans les param\u00e8tres.',
        suggestions: [],
        patches: [],
        rawJson: '',
        usage: null
      };
    }

    var mem = memory && typeof memory === 'object' ? memory : {};
    var Mem = global.AgentMemory;
    var view = Mem && typeof Mem.legacyView === 'function' ? Mem.legacyView(mem) : mem;
    var asked = Array.isArray(mem.preferredQuestionsAsked) ? mem.preferredQuestionsAsked : [];
    var system = [
      'Tu es l\'assistant m\u00e9moire Cerveau\u00a0: un pote qui aide \u00e0 se souvenir du contexte, pas un coach productivit\u00e9.',
      'Tu parles en fran\u00e7ais, tu tutoyes, ton naturel et amical\u00a0: z\u00e9ro jargon, z\u00e9ro ton support.',
      'Voix\u00a0: comme un message \u00e0 un ami. Court, clair, humain.',
      'La m\u00e9moire a deux \u00e9tages\u00a0: LONG TERME (durable) et COURT TERME (provisoire / tableau).',
      'Mettre \u00e0 jour le LONG TERME est un GROS d\u00e9al\u00a0: seulement des faits stables et pr\u00e9cieux.',
      'R\u00e9ponds UNIQUEMENT avec JSON\u00a0:',
      '{"message":"texte","suggestions":["r\u00e9ponse courte","\u2026"],"patches":[{"op":"remember","text":"\u2026"}]}',
      'Ops patches autoris\u00e9es\u00a0:',
      '- {"op":"remember","text":"fait durable"} \u2192 LONG TERME (strict)',
      '- {"op":"note","text":"note provisoire"} \u2192 COURT TERME',
      '- {"op":"forget","query":"mot-cl\u00e9"}',
      '- {"op":"set_summary","text":"1\u20132 phrases sur l\'utilisateur"} \u2192 LONG TERME',
      '- {"op":"set_board_summary","text":"th\u00e8mes du tableau"} \u2192 COURT TERME',
      '- {"op":"complete_onboarding"} (quand tu as assez de faits durables)',
      'R\u00e8gles LONG TERME (remember / set_summary)\u00a0:',
      '- UNIQUEMENT si l\'utilisateur vient d\'affirmer un fait concret et durable.',
      '- Ex. accept\u00e9s\u00a0: nom, \u00e2ge, r\u00f4le, patron, outils, focus projet, norme d\'\u00e9quipe claire.',
      '- INTERDIT\u00a0: m\u00e9ta-conversation, refus, \u00ab\u00a0pas maintenant\u00a0\u00bb, disponibilit\u00e9 \u00e0 discuter,',
      '  d\u00e9but d\'alignement, suggestions cliqu\u00e9es par erreur, reformulations vagues,',
      '  r\u00e9sum\u00e9s g\u00e9n\u00e9riques du tableau, doublons (un seul fait par th\u00e8me\u00a0: nom, \u00e2ge, etc.).',
      '- Si le fait n\'est pas assez solide\u00a0: n\'\u00e9cris PAS de patch remember (demande confirmation).',
      '- Un seul remember par th\u00e8me\u00a0; \u00e9crase mentalement les doublons (ex. nom).',
      'R\u00e8gles g\u00e9n\u00e9rales\u00a0:',
      '- Pose UNE question claire \u00e0 la fois.',
      '- suggestions = 2\u20134 r\u00e9ponses/intentions cliquables courtes.',
      '- Pour r\u00e9ponses \u00e0 compl\u00e9ter\u00a0: utilise \u2026 (ex. \u00ab\u00a0Je m\'appelle\u2026\u00a0\u00bb).',
      '- Les suggestions de type \u00ab\u00a0passer / plus tard / pas d\'objectif\u00a0\u00bb NE doivent JAMAIS devenir des faits.',
      mode === 'onboarding'
        ? '- Mode onboarding\u00a0: apr\u00e8s ~2\u20133 faits LONG TERME solides, remercie et complete_onboarding.'
        : '- Mode continu\u00a0: sois encore plus s\u00e9lectif pour remember.',
      '- \u00c9vite de reposer les questions d\u00e9j\u00e0 pos\u00e9es.',
      '- INTERDIT d\'inventer des faits non dits par l\'utilisateur.',
      '',
      'Questions d\u00e9j\u00e0 pos\u00e9es\u00a0:',
      JSON.stringify(asked),
      '',
      'M\u00e9moire actuelle\u00a0:',
      JSON.stringify({
        longTerm: {
          summary: view.summary || '',
          facts: Array.isArray(view.facts)
            ? view.facts.map(function (f) {
                return typeof f === 'string' ? f : f && f.text ? f.text : '';
              })
            : []
        },
        shortTerm: {
          boardSummary: view.boardSummary || '',
          notes: Array.isArray(view.shortNotes)
            ? view.shortNotes.map(function (f) {
                return typeof f === 'string' ? f : f && f.text ? f.text : '';
              })
            : []
        },
        onboardingComplete: !!mem.onboardingComplete
      }),
      options.boardDigest
        ? '\nDigest tableau (extrait, contexte COURT TERME seulement)\u00a0:\n' +
          String(options.boardDigest).slice(0, 3500)
        : ''
    ]
      .filter(Boolean)
      .join('\n');

    var messages = [{ role: 'system', content: system }];
    (history || []).forEach(function (entry) {
      if (!entry || !entry.role || !entry.content) return;
      if (entry.role === 'user' || entry.role === 'assistant') {
        messages.push({
          role: entry.role,
          content: String(entry.content)
        });
      }
    });
    messages.push({ role: 'user', content: userTurnWithClock(userText) });

    var t0 = Date.now();
    var response;
    try {
      response = await chatCompletions(p, messages, {
        jsonMode: true,
        max_tokens: 420,
        temperature: 0.5,
        stream: false
      });
      dbgLog(
        'agent',
        'memoryTurn.fetch',
        dbgFetchMeta('non-stream + json', response, { latencyMs: Date.now() - t0 })
      );
    } catch (err) {
      if (err && err.message && /response_format|json_object|json mode/i.test(err.message)) {
        dbgLog(
          'agent',
          'memoryTurn.fetch',
          dbgFetchMeta('non-stream + json', err, {
            latencyMs: Date.now() - t0,
            fallback: 'json-mode-retry'
          })
        );
        response = await chatCompletions(p, messages, {
          jsonMode: false,
          max_tokens: 420,
          temperature: 0.5,
          stream: false
        });
        dbgLog(
          'agent',
          'memoryTurn.fetch',
          dbgFetchMeta('non-stream (sans json mode)', response, { latencyMs: Date.now() - t0 })
        );
      } else {
        dbgError('agent', 'memoryTurn.fetch', err, { latencyMs: Date.now() - t0 });
        throw err;
      }
    }

    var content = response && response.content ? response.content : '';
    var data = null;
    try {
      data = JSON.parse(content.trim());
    } catch (e) {
      var start = content.indexOf('{');
      var end = content.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          data = JSON.parse(content.slice(start, end + 1));
        } catch (e2) {
          data = null;
        }
      }
    }
    if (!data || typeof data !== 'object') {
      return {
        message: content.trim() || 'Je n\'ai pas compris. Peux-tu reformuler?',
        suggestions: [],
        patches: [],
        rawJson: content,
        usage: extractUsageFromRaw(response && response.raw)
      };
    }

    var patches = Array.isArray(data.patches)
      ? data.patches.filter(function (patch) {
          return patch && typeof patch === 'object' && typeof patch.op === 'string';
        })
      : [];

    dbgLog('agent', 'memoryTurn.end', {
      ok: true,
      latencyMs: Date.now() - t0,
      patchCount: patches.length
    });
    return {
      message: stripSpaceBeforePunctuation(
        typeof data.message === 'string' ? data.message.trim() : ''
      ),
      suggestions: normalizeSuggestionList(data.suggestions),
      patches: patches,
      rawJson: content,
      usage: extractUsageFromRaw(response && response.raw)
    };
  }

  // exports
  S.heuristicLabelSuggestions = heuristicLabelSuggestions;
  S.heuristicTaskTypeSuggestions = heuristicTaskTypeSuggestions;
  S.memoryTurn = memoryTurn;
  S.normalizeMetricSuggestion = normalizeMetricSuggestion;
  S.normalizeMetricSuggestionList = normalizeMetricSuggestionList;
  S.parseMetric = parseMetric;
  S.suggestLabels = suggestLabels;
  S.suggestMetrics = suggestMetrics;
  S.suggestTaskTypes = suggestTaskTypes;
})(typeof window !== 'undefined' ? window : this);
