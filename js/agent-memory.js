/**
 * Board AI memory — per-member private facts/summary for Priorité assistant.
 * Stored at board/private (separate from member/private agentProvider).
 * Exposes window.AgentMemory (no bundler).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'aiMemory';
  var MAX_FACTS = 12;
  var MAX_FACT_LEN = 160;
  var MAX_SUMMARY_LEN = 600;
  var MAX_SERIALIZED = 2500;
  var SCAN_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
  var MAX_ASKED = 24;

  function emptyMemory() {
    return {
      version: 1,
      onboardingComplete: false,
      lastScanAt: '',
      summary: '',
      facts: [],
      preferredQuestionsAsked: []
    };
  }

  function trimStr(value, max) {
    var s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + '\u2026';
  }

  function factId() {
    return (
      'f-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function normalizeFact(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      var text = trimStr(raw, MAX_FACT_LEN);
      if (!text) return null;
      return { id: factId(), text: text, updatedAt: new Date().toISOString() };
    }
    if (typeof raw !== 'object') return null;
    var t = trimStr(raw.text, MAX_FACT_LEN);
    if (!t) return null;
    return {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : factId(),
      text: t,
      updatedAt:
        typeof raw.updatedAt === 'string' && raw.updatedAt
          ? raw.updatedAt
          : new Date().toISOString()
    };
  }

  function normalizeMemory(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var facts = Array.isArray(src.facts) ? src.facts : [];
    var normalizedFacts = [];
    for (var i = 0; i < facts.length; i++) {
      var f = normalizeFact(facts[i]);
      if (f) normalizedFacts.push(f);
    }
    normalizedFacts = normalizedFacts.slice(0, MAX_FACTS);
    var asked = Array.isArray(src.preferredQuestionsAsked)
      ? src.preferredQuestionsAsked
          .map(function (q) {
            return trimStr(String(q || ''), 120);
          })
          .filter(Boolean)
          .slice(0, MAX_ASKED)
      : [];
    return {
      version: 1,
      onboardingComplete: !!src.onboardingComplete,
      lastScanAt: typeof src.lastScanAt === 'string' ? src.lastScanAt : '',
      summary: trimStr(src.summary, MAX_SUMMARY_LEN),
      facts: normalizedFacts,
      preferredQuestionsAsked: asked
    };
  }

  function serializedSize(memory) {
    try {
      return JSON.stringify(memory).length;
    } catch (e) {
      return MAX_SERIALIZED + 1;
    }
  }

  function enforceBudget(memory) {
    var next = normalizeMemory(memory);
    while (serializedSize(next) > MAX_SERIALIZED && next.facts.length) {
      next.facts = next.facts.slice(0, -1);
    }
    if (serializedSize(next) > MAX_SERIALIZED) {
      next.summary = trimStr(next.summary, Math.floor(MAX_SUMMARY_LEN / 2));
    }
    while (serializedSize(next) > MAX_SERIALIZED && next.preferredQuestionsAsked.length) {
      next.preferredQuestionsAsked = next.preferredQuestionsAsked.slice(0, -1);
    }
    return next;
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') return emptyMemory();
    try {
      var stored = await t.get('board', 'private', STORAGE_KEY);
      return normalizeMemory(stored);
    } catch (err) {
      console.error('AgentMemory.load failed', err);
      return emptyMemory();
    }
  }

  async function save(t, memory) {
    if (!t || typeof t.set !== 'function') return normalizeMemory(memory);
    var next = enforceBudget(memory);
    try {
      await t.set('board', 'private', STORAGE_KEY, next);
    } catch (err) {
      console.error('AgentMemory.save failed', err);
    }
    return next;
  }

  function needsOnboarding(memory) {
    var m = normalizeMemory(memory);
    if (m.onboardingComplete) return false;
    if (m.facts.length >= 2 || (m.summary && m.summary.length > 40)) return false;
    return true;
  }

  function mergeFacts(memory, incoming) {
    var next = normalizeMemory(memory);
    var list = Array.isArray(incoming) ? incoming : [incoming];
    var now = new Date().toISOString();
    for (var i = 0; i < list.length; i++) {
      var fact = normalizeFact(list[i]);
      if (!fact) continue;
      var key = fact.text.toLocaleLowerCase('fr-FR');
      var replaced = false;
      for (var j = 0; j < next.facts.length; j++) {
        if (next.facts[j].text.toLocaleLowerCase('fr-FR') === key) {
          next.facts[j] = {
            id: next.facts[j].id,
            text: fact.text,
            updatedAt: now
          };
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        next.facts.unshift({ id: fact.id, text: fact.text, updatedAt: now });
      }
    }
    next.facts = next.facts.slice(0, MAX_FACTS);
    return enforceBudget(next);
  }

  function forgetFacts(memory, query) {
    var next = normalizeMemory(memory);
    var q = trimStr(String(query || ''), 120).toLocaleLowerCase('fr-FR');
    if (!q) return next;
    next.facts = next.facts.filter(function (f) {
      var text = (f.text || '').toLocaleLowerCase('fr-FR');
      var id = (f.id || '').toLocaleLowerCase('fr-FR');
      return text.indexOf(q) < 0 && id !== q;
    });
    return enforceBudget(next);
  }

  function setSummary(memory, summary) {
    var next = normalizeMemory(memory);
    next.summary = trimStr(summary, MAX_SUMMARY_LEN);
    return enforceBudget(next);
  }

  function markOnboardingComplete(memory) {
    var next = normalizeMemory(memory);
    next.onboardingComplete = true;
    return enforceBudget(next);
  }

  function markQuestionAsked(memory, question) {
    var next = normalizeMemory(memory);
    var q = trimStr(String(question || ''), 120);
    if (!q) return next;
    var key = q.toLocaleLowerCase('fr-FR');
    var already = next.preferredQuestionsAsked.some(function (x) {
      return x.toLocaleLowerCase('fr-FR') === key;
    });
    if (!already) {
      next.preferredQuestionsAsked = [q].concat(next.preferredQuestionsAsked).slice(0, MAX_ASKED);
    }
    return enforceBudget(next);
  }

  function buildPromptBlock(memory) {
    var m = normalizeMemory(memory);
    if (!m.summary && !m.facts.length) {
      return 'M\u00e9moire plateau\u00a0: (vide)';
    }
    var lines = ['M\u00e9moire plateau (faits importants pour cet utilisateur)\u00a0:'];
    if (m.summary) lines.push('R\u00e9sum\u00e9\u00a0: ' + m.summary);
    if (m.facts.length) {
      lines.push('Faits\u00a0:');
      for (var i = 0; i < m.facts.length; i++) {
        lines.push('- ' + m.facts[i].text);
      }
    }
    return lines.join('\n');
  }

  function scanIsFresh(memory, force) {
    if (force) return false;
    var m = normalizeMemory(memory);
    if (!m.lastScanAt) return false;
    var ts = Date.parse(m.lastScanAt);
    if (!isFinite(ts)) return false;
    return Date.now() - ts < SCAN_TTL_MS;
  }

  /**
   * Scan board cards, ask the model to refresh summary + facts, persist.
   * @returns {Promise<object>} updated memory
   */
  async function scanAndRefresh(t, provider, options) {
    options = options || {};
    var force = !!options.force;
    var memory = await load(t);
    if (scanIsFresh(memory, force) && !options.forceMergeDigest) {
      return memory;
    }

    var Agent = global.PriorityAgent;
    var PT = global.PriorityTrello;
    if (!Agent || !Agent.isConfigured || !Agent.isConfigured(provider)) {
      return memory;
    }
    if (!PT || typeof PT.scanBoardCards !== 'function') {
      return memory;
    }

    var digest;
    try {
      digest = await PT.scanBoardCards(t);
    } catch (err) {
      console.error('AgentMemory.scanBoardCards failed', err);
      return memory;
    }

    var digestText =
      digest && typeof digest.digest === 'string'
        ? digest.digest
        : typeof digest === 'string'
          ? digest
          : '';
    if (!digestText.trim()) {
      memory = normalizeMemory(memory);
      memory.lastScanAt = new Date().toISOString();
      return save(t, memory);
    }

    var prompt = [
      'Tu mets \u00e0 jour la m\u00e9moire d\'un assistant Trello pour CE membre sur CE tableau.',
      'R\u00e9ponds UNIQUEMENT en JSON\u00a0:',
      '{"summary":"2 \u00e0 5 phrases","facts":["fait court", "..."],"suggestedQuestions":["question d\'alignement", "..."]}',
      'R\u00e8gles\u00a0:',
      '- summary = vue d\'ensemble du travail / th\u00e8mes du board (pas une liste brute).',
      '- facts = 3 \u00e0 8 faits utiles et stables (noms, projets, outils, contraintes).',
      '- suggestedQuestions = 2 \u00e0 4 questions conversationnelles pour mieux aligner (patron, focus du jour, normes).',
      '- Fran\u00e7ais. Courts. Pas d\'invention hors digest + m\u00e9moire existante.',
      '',
      'M\u00e9moire actuelle\u00a0:',
      JSON.stringify({
        summary: memory.summary,
        facts: memory.facts.map(function (f) {
          return f.text;
        })
      }),
      '',
      'Digest du tableau\u00a0:',
      digestText.slice(0, 6000)
    ].join('\n');

    try {
      var response = await Agent.chatCompletions(
        provider,
        [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: 'Produis la mise \u00e0 jour de m\u00e9moire JSON.'
          }
        ],
        { temperature: 0.3, jsonMode: true, max_tokens: 500, stream: false }
      );
      var raw = response && response.content ? response.content.trim() : '';
      var data = null;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        var start = raw.indexOf('{');
        var end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
          try {
            data = JSON.parse(raw.slice(start, end + 1));
          } catch (e2) {
            data = null;
          }
        }
      }
      if (data && typeof data === 'object') {
        if (typeof data.summary === 'string' && data.summary.trim()) {
          memory = setSummary(memory, data.summary);
        }
        if (Array.isArray(data.facts) && data.facts.length) {
          memory = mergeFacts(memory, data.facts);
        }
        if (Array.isArray(data.suggestedQuestions)) {
          memory._openingQuestions = data.suggestedQuestions
            .map(function (q) {
              return trimStr(String(q || ''), 120);
            })
            .filter(Boolean)
            .slice(0, 4);
        }
      }
    } catch (err) {
      console.error('AgentMemory.scanAndRefresh model failed', err);
    }

    memory = normalizeMemory(memory);
    memory.lastScanAt = new Date().toISOString();
    // Drop ephemeral field before persist
    var opening = memory._openingQuestions;
    delete memory._openingQuestions;
    var saved = await save(t, memory);
    if (opening && opening.length) saved._openingQuestions = opening;
    return saved;
  }

  /**
   * Apply memory patches from a memoryTurn response.
   */
  async function applyPatches(t, memory, patches) {
    var next = normalizeMemory(memory);
    var list = Array.isArray(patches) ? patches : [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object') continue;
      if (p.op === 'remember' && p.text) {
        next = mergeFacts(next, p.text);
      } else if (p.op === 'forget' && p.query) {
        next = forgetFacts(next, p.query);
      } else if (p.op === 'set_summary' && p.text != null) {
        next = setSummary(next, p.text);
      } else if (p.op === 'complete_onboarding') {
        next = markOnboardingComplete(next);
      }
    }
    return save(t, next);
  }

  global.AgentMemory = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_FACTS: MAX_FACTS,
    SCAN_TTL_MS: SCAN_TTL_MS,
    emptyMemory: emptyMemory,
    normalizeMemory: normalizeMemory,
    load: load,
    save: save,
    needsOnboarding: needsOnboarding,
    mergeFacts: mergeFacts,
    forgetFacts: forgetFacts,
    setSummary: setSummary,
    markOnboardingComplete: markOnboardingComplete,
    markQuestionAsked: markQuestionAsked,
    buildPromptBlock: buildPromptBlock,
    scanIsFresh: scanIsFresh,
    scanAndRefresh: scanAndRefresh,
    applyPatches: applyPatches,
    enforceBudget: enforceBudget
  };
})(typeof window !== 'undefined' ? window : this);
