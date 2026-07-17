/**
 * Board AI memory — short-term (board/session) + long-term (durable user facts).
 * Stored at board/private. Exposes window.AgentMemory (no bundler).
 *
 * Long-term is curated and high-bar: identity, role, boss, tools, durable prefs.
 * Short-term holds board context and provisional notes that must not pollute LTM.
 */
(function (global) {
  'use strict';

  function dbg() {
    return global.TpDebug || null;
  }
  function dbgLog(domain, event, meta) {
    var d = dbg();
    if (d && d.log) d.log(domain, event, meta);
  }
  function dbgError(domain, event, err, meta) {
    var d = dbg();
    if (d && d.error) d.error(domain, event, err, meta);
    else if (err) console.error(domain + '.' + event, err);
  }

  var STORAGE_KEY = 'aiMemory';
  var MAX_LTM_FACTS = 8;
  var MAX_STM_NOTES = 6;
  var MAX_RECENT_CARDS = 10;
  var MAX_FACT_LEN = 140;
  var MAX_SUMMARY_LEN = 280;
  var MAX_BOARD_SUMMARY_LEN = 420;
  var MAX_SERIALIZED = 3200;
  var SCAN_TTL_MS = 3 * 60 * 60 * 1000;
  var MAX_ASKED = 24;

  function emptyMemory() {
    return {
      version: 2,
      onboardingComplete: false,
      lastScanAt: '',
      longTerm: { summary: '', facts: [] },
      shortTerm: { boardSummary: '', notes: [], recentCards: [], updatedAt: '' },
      preferredQuestionsAsked: []
    };
  }

  /** Approx creation time from Mongo ObjectId embedded in Trello card ids. */
  function cardIdCreatedAt(cardId) {
    var id = String(cardId || '');
    if (!/^[a-f0-9]{24}$/i.test(id)) return '';
    var seconds = parseInt(id.slice(0, 8), 16);
    if (!isFinite(seconds) || seconds <= 0) return '';
    try {
      return new Date(seconds * 1000).toISOString();
    } catch (e) {
      return '';
    }
  }

  function normalizeRecentCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    var name = trimStr(raw.name, 120);
    var list = trimStr(raw.list || raw.listName, 80);
    var at =
      (typeof raw.at === 'string' && raw.at.trim()) ||
      cardIdCreatedAt(id) ||
      (typeof raw.dateLastActivity === 'string' ? raw.dateLastActivity : '') ||
      new Date().toISOString();
    return { id: id, name: name, list: list, at: at };
  }

  function normalizeRecentCards(list) {
    var src = Array.isArray(list) ? list : [];
    var seen = {};
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var card = normalizeRecentCard(src[i]);
      if (!card || seen[card.id]) continue;
      seen[card.id] = true;
      out.push(card);
    }
    out.sort(function (a, b) {
      var ta = Date.parse(a.at) || 0;
      var tb = Date.parse(b.at) || 0;
      return tb - ta;
    });
    return out.slice(0, MAX_RECENT_CARDS);
  }

  function trimStr(value, max) {
    var s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + '\u2026';
  }

  function normKey(s) {
    return String(s || '')
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s\-']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function factId() {
    return (
      'f-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  /**
   * Noise / meta / click-accident statements that must never enter long-term.
   */
  function isJunkFact(text) {
    var t = normKey(text);
    if (!t || t.length < 8) return true;
    var junk = [
      /ne souhaite pas/,
      /pas aborder/,
      /nouveaux objectifs/,
      /priorites pour le moment/,
      /disponible pour partager/,
      /partager des informations/,
      /debut de l.?alignement/,
      /alignement pour les projets/,
      /commence l.?alignement/,
      /mise a jour de memoire/,
      /memoire actuelle/,
      /aucun fait/,
      /problemes? recemment/,
      /a rencontre des problemes/,
      /ok(ay)?$/,
      /d.?accord$/,
      /passer$/,
      /plus tard$/,
      /je ne sais pas/,
      /pas maintenant/,
      /suggestion/,
      /remplir/
    ];
    for (var i = 0; i < junk.length; i++) {
      if (junk[i].test(t)) return true;
    }
    // Generic board fluff phrased as a "user fact"
    if (
      /le tableau se concentre/.test(t) ||
      /plusieurs taches sont en attente/.test(t) ||
      /gestion de divers projets/.test(t)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Durable personal/work facts worth long-term storage.
   */
  function isDurableFact(text) {
    if (isJunkFact(text)) return false;
    var t = normKey(text);
    // Concrete identity / work anchors
    if (
      /nom de l.?utilisateur|je m.?appelle|je suis\b|mon nom|appelle\b/.test(t)
    ) {
      return /\b[a-z]{2,}/.test(t.replace(/nom|utilisateur|appelle|suis|je|mon/g, ' '));
    }
    if (/\b\d{1,3}\s*ans\b|\bage\b|age\b/.test(t)) return true;
    if (/patron|manager|boss|superieur|n\+1|responsable/.test(t)) return true;
    if (/role|poste|titre|job title|fonction\b/.test(t)) return true;
    if (/travaille sur|focus|projet (actuel|principal)|en charge de/.test(t)) {
      return t.length >= 18;
    }
    if (/outil|stack|utilise|jira|slack|notion|figma|github/.test(t)) return true;
    if (/equipe|collegue|equipe de/.test(t) && t.length >= 16) return true;
    if (/prefere|habitude|norme|toujours|jamais|ne pas\b/.test(t) && t.length >= 20) {
      // Preference must be concrete, not a decline of conversation
      if (/ne souhaite|pas aborder|pas maintenant/.test(t)) return false;
      return true;
    }
    if (/document|guide|plan strategie|livrable/.test(t) && t.length >= 18) return true;
    // Require a proper-name-ish token or digit for anything else
    if (/[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][a-zàâäéèêëïîôùûüç\-]{2,}/.test(String(text || ''))) {
      return t.length >= 16 && t.length <= 120;
    }
    return false;
  }

  /**
   * Stable identity key so "Nom: X" and "Nom: X." replace instead of duplicating.
   */
  function factIdentityKey(text) {
    var t = normKey(text);
    if (/nom de l.?utilisateur|je m.?appelle|mon nom|je suis\b/.test(t)) {
      return 'identity.name';
    }
    if (/\b\d{1,3}\s*ans\b|\bage\b/.test(t)) return 'identity.age';
    if (/patron|manager|boss|superieur|n\+1/.test(t)) return 'work.boss';
    if (/role|poste|titre|fonction\b/.test(t)) return 'work.role';
    if (/travaille sur|focus du jour|projet (actuel|principal)/.test(t)) {
      return 'work.focus';
    }
    if (/outil|stack|utilise/.test(t)) return 'work.tools';
    if (/equipe|collegue/.test(t)) return 'work.team';
    if (/document|guide|plan strategie/.test(t)) return 'work.docs';
    if (/prefere|habitude|norme/.test(t)) return 'work.pref:' + t.slice(0, 32);
    return 'fact:' + t.slice(0, 56);
  }

  function normalizeFact(raw, options) {
    options = options || {};
    if (!raw) return null;
    var text =
      typeof raw === 'string'
        ? trimStr(raw, MAX_FACT_LEN)
        : trimStr(raw && raw.text, MAX_FACT_LEN);
    if (!text) return null;
    if (options.requireDurable && !isDurableFact(text)) return null;
    if (!options.allowJunk && isJunkFact(text)) return null;
    var key =
      (raw && typeof raw === 'object' && typeof raw.key === 'string' && raw.key) ||
      factIdentityKey(text);
    return {
      id:
        raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : factId(),
      text: text,
      key: key,
      updatedAt:
        raw && typeof raw === 'object' && typeof raw.updatedAt === 'string' && raw.updatedAt
          ? raw.updatedAt
          : new Date().toISOString()
    };
  }

  function upsertFactList(list, incoming, max, requireDurable) {
    var next = Array.isArray(list) ? list.slice() : [];
    var items = Array.isArray(incoming) ? incoming : [incoming];
    var now = new Date().toISOString();
    for (var i = 0; i < items.length; i++) {
      var fact = normalizeFact(items[i], {
        requireDurable: !!requireDurable,
        allowJunk: false
      });
      if (!fact) continue;
      var idx = -1;
      for (var j = 0; j < next.length; j++) {
        if (next[j].key === fact.key || normKey(next[j].text) === normKey(fact.text)) {
          idx = j;
          break;
        }
      }
      // Prefer the more specific / longer concrete statement when replacing.
      if (idx >= 0) {
        var prev = next[idx];
        var keepText =
          fact.text.length >= prev.text.length || /:/.test(fact.text) ? fact.text : prev.text;
        next[idx] = {
          id: prev.id,
          text: keepText,
          key: fact.key || prev.key,
          updatedAt: now
        };
      } else {
        next.unshift({
          id: fact.id,
          text: fact.text,
          key: fact.key,
          updatedAt: now
        });
      }
    }
    // Dedup by key again (belt and suspenders)
    var seen = Object.create(null);
    var deduped = [];
    for (var k = 0; k < next.length; k++) {
      var key = next[k].key || factIdentityKey(next[k].text);
      if (seen[key]) continue;
      seen[key] = true;
      next[k].key = key;
      deduped.push(next[k]);
    }
    return deduped.slice(0, max);
  }

  function migrateFromV1(src) {
    var out = emptyMemory();
    out.onboardingComplete = !!src.onboardingComplete;
    out.lastScanAt = typeof src.lastScanAt === 'string' ? src.lastScanAt : '';
    out.preferredQuestionsAsked = Array.isArray(src.preferredQuestionsAsked)
      ? src.preferredQuestionsAsked
      : [];
    var oldSummary = typeof src.summary === 'string' ? src.summary.trim() : '';
    if (oldSummary) {
      // Board-ish summaries go to STM; short personal ones can stay LTM.
      if (
        /tableau|taches|projets lies|communication et|en attente ou bloque/.test(
          normKey(oldSummary)
        )
      ) {
        out.shortTerm.boardSummary = trimStr(oldSummary, MAX_BOARD_SUMMARY_LEN);
      } else if (!isJunkFact(oldSummary)) {
        out.longTerm.summary = trimStr(oldSummary, MAX_SUMMARY_LEN);
      }
    }
    var facts = Array.isArray(src.facts) ? src.facts : [];
    for (var i = 0; i < facts.length; i++) {
      var text = typeof facts[i] === 'string' ? facts[i] : facts[i] && facts[i].text;
      if (!text) continue;
      if (isDurableFact(text)) {
        out.longTerm.facts = upsertFactList(out.longTerm.facts, text, MAX_LTM_FACTS, true);
      } else if (!isJunkFact(text)) {
        out.shortTerm.notes = upsertFactList(out.shortTerm.notes, text, MAX_STM_NOTES, false);
      }
      // else drop junk
    }
    return out;
  }

  function normalizeMemory(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    // Legacy v1 shape: summary/facts at root without longTerm
    if ((!src.longTerm || typeof src.longTerm !== 'object') && (src.facts || src.summary)) {
      src = migrateFromV1(src);
    }
    var lt = src.longTerm && typeof src.longTerm === 'object' ? src.longTerm : {};
    var st = src.shortTerm && typeof src.shortTerm === 'object' ? src.shortTerm : {};

    var cleanedLt = upsertFactList(
      [],
      Array.isArray(lt.facts) ? lt.facts : [],
      MAX_LTM_FACTS,
      true
    );

    var stmNotes = upsertFactList(
      [],
      Array.isArray(st.notes) ? st.notes : [],
      MAX_STM_NOTES,
      false
    );

    var asked = Array.isArray(src.preferredQuestionsAsked)
      ? src.preferredQuestionsAsked
          .map(function (q) {
            return trimStr(String(q || ''), 120);
          })
          .filter(Boolean)
          .slice(0, MAX_ASKED)
      : [];

    var ltSummary = trimStr(lt.summary, MAX_SUMMARY_LEN);
    if (ltSummary && isJunkFact(ltSummary)) ltSummary = '';
    if (
      ltSummary &&
      /tableau se concentre|taches sont en attente|divers projets/.test(normKey(ltSummary))
    ) {
      // Misplaced board summary
      st.boardSummary = st.boardSummary || ltSummary;
      ltSummary = '';
    }

    return {
      version: 2,
      onboardingComplete: !!src.onboardingComplete,
      lastScanAt: typeof src.lastScanAt === 'string' ? src.lastScanAt : '',
      longTerm: {
        summary: ltSummary,
        facts: cleanedLt
      },
      shortTerm: {
        boardSummary: trimStr(st.boardSummary, MAX_BOARD_SUMMARY_LEN),
        notes: stmNotes,
        recentCards: normalizeRecentCards(st.recentCards),
        updatedAt: typeof st.updatedAt === 'string' ? st.updatedAt : ''
      },
      preferredQuestionsAsked: asked
    };
  }

  /** Back-compat accessors used by older UI/agent code. */
  function legacyView(memory) {
    var m = normalizeMemory(memory);
    return {
      summary: m.longTerm.summary,
      facts: m.longTerm.facts,
      boardSummary: m.shortTerm.boardSummary,
      shortNotes: m.shortTerm.notes,
      recentCards: m.shortTerm.recentCards,
      onboardingComplete: m.onboardingComplete,
      longTerm: m.longTerm,
      shortTerm: m.shortTerm
    };
  }

  function serializedSize(memory) {
    try {
      return JSON.stringify(memory).length;
    } catch (e) {
      return MAX_SERIALIZED + 1;
    }
  }

  function dbgMemoryCounts(memory) {
    var m = normalizeMemory(memory);
    return {
      version: m.version,
      factCount: m.longTerm.facts.length,
      noteCount: m.shortTerm.notes.length,
      bytes: serializedSize(m)
    };
  }

  function enforceBudget(memory) {
    var next = normalizeMemory(memory);
    while (serializedSize(next) > MAX_SERIALIZED && next.shortTerm.recentCards.length) {
      next.shortTerm.recentCards = next.shortTerm.recentCards.slice(0, -1);
    }
    while (serializedSize(next) > MAX_SERIALIZED && next.shortTerm.notes.length) {
      next.shortTerm.notes = next.shortTerm.notes.slice(0, -1);
    }
    while (serializedSize(next) > MAX_SERIALIZED && next.longTerm.facts.length) {
      next.longTerm.facts = next.longTerm.facts.slice(0, -1);
    }
    if (serializedSize(next) > MAX_SERIALIZED) {
      next.shortTerm.boardSummary = trimStr(
        next.shortTerm.boardSummary,
        Math.floor(MAX_BOARD_SUMMARY_LEN / 2)
      );
    }
    if (serializedSize(next) > MAX_SERIALIZED) {
      next.longTerm.summary = trimStr(next.longTerm.summary, Math.floor(MAX_SUMMARY_LEN / 2));
    }
    while (serializedSize(next) > MAX_SERIALIZED && next.preferredQuestionsAsked.length) {
      next.preferredQuestionsAsked = next.preferredQuestionsAsked.slice(0, -1);
    }
    return next;
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') {
      dbgLog('agentMemory', 'load', { ok: false, reason: 'no-client' });
      return emptyMemory();
    }
    try {
      var stored = await t.get('board', 'private', STORAGE_KEY);
      var next = enforceBudget(normalizeMemory(stored));
      var prevCount = 0;
      if (stored && stored.longTerm && Array.isArray(stored.longTerm.facts)) {
        prevCount = stored.longTerm.facts.length;
      } else if (stored && Array.isArray(stored.facts)) {
        prevCount = stored.facts.length;
      }
      var shouldRewrite =
        !stored ||
        stored.version !== 2 ||
        next.longTerm.facts.length < prevCount ||
        (!!(stored && stored.summary) && !next.longTerm.summary && !!next.shortTerm.boardSummary);
      if (shouldRewrite && typeof t.set === 'function') {
        try {
          await t.set('board', 'private', STORAGE_KEY, next);
        } catch (persistErr) {
          console.error('AgentMemory.load purge persist failed', persistErr);
        }
      }
      dbgLog('agentMemory', 'load', Object.assign({ ok: true }, dbgMemoryCounts(next)));
      return next;
    } catch (err) {
      dbgError('agentMemory', 'load', err);
      console.error('AgentMemory.load failed', err);
      return emptyMemory();
    }
  }

  async function save(t, memory) {
    if (!t || typeof t.set !== 'function') {
      dbgLog('agentMemory', 'save', { ok: false, reason: 'no-client' });
      return normalizeMemory(memory);
    }
    var next = enforceBudget(memory);
    try {
      await t.set('board', 'private', STORAGE_KEY, next);
      dbgLog('agentMemory', 'save', Object.assign({ ok: true }, dbgMemoryCounts(next)));
    } catch (err) {
      dbgError('agentMemory', 'save', err);
      console.error('AgentMemory.save failed', err);
    }
    return next;
  }

  function needsOnboarding(memory) {
    var m = normalizeMemory(memory);
    if (m.onboardingComplete) return false;
    if (m.longTerm.facts.length >= 2) return false;
    if (m.longTerm.summary && m.longTerm.summary.length > 30) return false;
    return true;
  }

  function rememberLongTerm(memory, incoming) {
    var next = normalizeMemory(memory);
    next.longTerm.facts = upsertFactList(next.longTerm.facts, incoming, MAX_LTM_FACTS, true);
    return enforceBudget(next);
  }

  function rememberShortTerm(memory, incoming) {
    var next = normalizeMemory(memory);
    next.shortTerm.notes = upsertFactList(next.shortTerm.notes, incoming, MAX_STM_NOTES, false);
    next.shortTerm.updatedAt = new Date().toISOString();
    return enforceBudget(next);
  }

  /** @deprecated Use rememberLongTerm — kept for call sites. */
  function mergeFacts(memory, incoming) {
    return rememberLongTerm(memory, incoming);
  }

  function forgetFacts(memory, query) {
    var next = normalizeMemory(memory);
    var q = normKey(query);
    if (!q) return next;
    next.longTerm.facts = next.longTerm.facts.filter(function (f) {
      return normKey(f.text).indexOf(q) < 0 && normKey(f.id) !== q && normKey(f.key) !== q;
    });
    next.shortTerm.notes = next.shortTerm.notes.filter(function (f) {
      return normKey(f.text).indexOf(q) < 0 && normKey(f.id) !== q;
    });
    return enforceBudget(next);
  }

  function setSummary(memory, summary) {
    var next = normalizeMemory(memory);
    var s = trimStr(summary, MAX_SUMMARY_LEN);
    if (!s || isJunkFact(s)) return next;
    if (/tableau se concentre|taches sont en attente/.test(normKey(s))) {
      return setBoardSummary(next, s);
    }
    next.longTerm.summary = s;
    return enforceBudget(next);
  }

  function setBoardSummary(memory, summary) {
    var next = normalizeMemory(memory);
    next.shortTerm.boardSummary = trimStr(summary, MAX_BOARD_SUMMARY_LEN);
    next.shortTerm.updatedAt = new Date().toISOString();
    return enforceBudget(next);
  }

  /**
   * Merge recently created / opened cards into STM (not LTM).
   * Incoming cards are normalized and sorted by approx creation time.
   */
  function mergeRecentCards(memory, cards) {
    var next = normalizeMemory(memory);
    var incoming = normalizeRecentCards(cards);
    if (!incoming.length) return next;
    next.shortTerm.recentCards = normalizeRecentCards(
      incoming.concat(next.shortTerm.recentCards)
    );
    next.shortTerm.updatedAt = new Date().toISOString();
    return enforceBudget(next);
  }

  /**
   * Load memory, upsert recent card entries from board scan, persist.
   * @param {object} t Trello iframe client
   * @param {Array|{id,name,list?,at?}} cardsOrCard cards to record
   */
  async function recordRecentCards(t, cardsOrCard) {
    var list = Array.isArray(cardsOrCard)
      ? cardsOrCard
      : cardsOrCard
        ? [cardsOrCard]
        : [];
    var memory = await load(t);
    var next = mergeRecentCards(memory, list);
    return save(t, next);
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
    var lines = ['Memoire utilisateur (Priorite)\u00a0:'];
    var hasLt = !!(m.longTerm.summary || m.longTerm.facts.length);
    var hasSt = !!(m.shortTerm.boardSummary || m.shortTerm.notes.length);
    if (!hasLt && !hasSt) return 'Memoire utilisateur\u00a0: (vide)';

    lines.push('LONG TERME (faits durables, prioritaires)\u00a0:');
    if (m.longTerm.summary) lines.push('Resume\u00a0: ' + m.longTerm.summary);
    if (m.longTerm.facts.length) {
      for (var i = 0; i < m.longTerm.facts.length; i++) {
        lines.push('- ' + m.longTerm.facts[i].text);
      }
    } else {
      lines.push('- (aucun)');
    }

    lines.push('COURT TERME (contexte tableau / provisoire, moins prioritaire)\u00a0:');
    if (m.shortTerm.boardSummary) {
      lines.push('Tableau\u00a0: ' + m.shortTerm.boardSummary);
    }
    if (m.shortTerm.notes.length) {
      for (var j = 0; j < m.shortTerm.notes.length; j++) {
        lines.push('- ' + m.shortTerm.notes[j].text);
      }
    }
    if (m.shortTerm.recentCards && m.shortTerm.recentCards.length) {
      lines.push('Cartes r\u00e9centes\u00a0:');
      for (var r = 0; r < m.shortTerm.recentCards.length; r++) {
        var rc = m.shortTerm.recentCards[r];
        var bit = '- ' + (rc.name || rc.id);
        if (rc.list) bit += ' [' + rc.list + ']';
        lines.push(bit);
      }
    }
    if (
      !m.shortTerm.boardSummary &&
      !m.shortTerm.notes.length &&
      !(m.shortTerm.recentCards && m.shortTerm.recentCards.length)
    ) {
      lines.push('- (aucun)');
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
   * Scan board → refresh SHORT-TERM board summary only (never dump into LTM).
   */
  async function scanAndRefresh(t, provider, options) {
    options = options || {};
    var force = !!options.force;
    var t0 = Date.now();
    var memory = await load(t);
    if (scanIsFresh(memory, force) && !options.forceMergeDigest) {
      dbgLog('agentMemory', 'scanAndRefresh', {
        ok: false,
        reason: 'fresh-cache',
        durationMs: Date.now() - t0
      });
      return memory;
    }

    var Agent = global.PriorityAgent;
    var PT = global.PriorityTrello;
    if (!Agent || !Agent.isConfigured || !Agent.isConfigured(provider)) {
      dbgLog('agentMemory', 'scanAndRefresh', {
        ok: false,
        reason: 'no-provider',
        durationMs: Date.now() - t0
      });
      return memory;
    }
    if (!PT || typeof PT.scanBoardCards !== 'function') {
      dbgLog('agentMemory', 'scanAndRefresh', {
        ok: false,
        reason: 'no-scanner',
        durationMs: Date.now() - t0
      });
      return memory;
    }

    var digest;
    try {
      digest = await PT.scanBoardCards(t);
    } catch (err) {
      dbgError('agentMemory', 'scanAndRefresh', err, { durationMs: Date.now() - t0 });
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
      dbgLog('agentMemory', 'scanAndRefresh', {
        ok: true,
        reason: 'empty-digest',
        durationMs: Date.now() - t0
      });
      return save(t, memory);
    }

    var scanProfile = options.profile || null;
    if (!scanProfile && global.UserProfile && typeof global.UserProfile.load === 'function') {
      try {
        scanProfile = await global.UserProfile.load(t);
      } catch (profileErr) {
        scanProfile = { language: 'fr', dialect: 'qc' };
      }
    }
    var langInstr =
      global.UserProfile && typeof global.UserProfile.languageInstruction === 'function'
        ? global.UserProfile.languageInstruction(scanProfile || { language: 'fr', dialect: 'qc' })
        : 'Langue\u00a0: fran\u00e7ais qu\u00e9b\u00e9cois.';

    var prompt = [
      'Tu produis UNIQUEMENT du contexte COURT TERME pour un assistant Trello.',
      'R\u00e9ponds UNIQUEMENT en JSON\u00a0:',
      '{"boardSummary":"2\u20133 phrases max sur les th\u00e8mes du tableau","suggestedQuestions":["\u2026"]}',
      'R\u00e8gles STRICTES\u00a0:',
      '- boardSummary = th\u00e8mes / types de cartes du board. COURT.',
      '- INTERDIT d\'inventer des faits personnels sur l\'utilisateur (nom, \u00e2ge, patron, pr\u00e9f\u00e9rences).',
      '- INTERDIT de remplir une m\u00e9moire long terme depuis le digest.',
      '- suggestedQuestions = 2\u20133 questions pour apprendre des faits durables (nom, r\u00f4le, focus, outils).',
      '- ' + langInstr,
      '- Pas de remplissage.',
      '',
      'M\u00e9moire long terme actuelle (ne pas r\u00e9p\u00e9ter ici)\u00a0:',
      JSON.stringify({
        summary: memory.longTerm.summary,
        facts: memory.longTerm.facts.map(function (f) {
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
          { role: 'user', content: 'Produis le JSON court terme.' }
        ],
        { temperature: 0.2, jsonMode: true, max_tokens: 280, stream: false }
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
        if (typeof data.boardSummary === 'string' && data.boardSummary.trim()) {
          memory = setBoardSummary(memory, data.boardSummary);
        } else if (typeof data.summary === 'string' && data.summary.trim()) {
          // Legacy field name from older prompts → STM only
          memory = setBoardSummary(memory, data.summary);
        }
        // Ignore any "facts" array from the model for scans — LTM is user-stated only.
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
      dbgError('agentMemory', 'scanAndRefresh.model', err, { durationMs: Date.now() - t0 });
      console.error('AgentMemory.scanAndRefresh model failed', err);
    }

    memory = normalizeMemory(memory);
    memory.lastScanAt = new Date().toISOString();
    var opening = memory._openingQuestions;
    delete memory._openingQuestions;
    var saved = await save(t, memory);
    if (opening && opening.length) saved._openingQuestions = opening;
    dbgLog('agentMemory', 'scanAndRefresh', {
      ok: true,
      durationMs: Date.now() - t0,
      questionCount: opening ? opening.length : 0
    });
    return saved;
  }

  /**
   * Apply memory patches from a memoryTurn response — gated hard for LTM.
   */
  async function applyPatches(t, memory, patches) {
    var next = normalizeMemory(memory);
    var list = Array.isArray(patches) ? patches : [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object') continue;
      var op = String(p.op || '');
      if ((op === 'remember' || op === 'remember_long') && p.text) {
        // High bar: only durable, non-junk facts enter long-term.
        if (isDurableFact(p.text)) {
          next = rememberLongTerm(next, p.text);
        } else if (!isJunkFact(p.text)) {
          // Soft landing: provisional short-term note instead of polluting LTM.
          next = rememberShortTerm(next, p.text);
        }
      } else if ((op === 'note' || op === 'remember_short') && p.text) {
        if (!isJunkFact(p.text)) next = rememberShortTerm(next, p.text);
      } else if (op === 'forget' && p.query) {
        next = forgetFacts(next, p.query);
      } else if (op === 'set_summary' && p.text != null) {
        next = setSummary(next, p.text);
      } else if (op === 'set_board_summary' && p.text != null) {
        next = setBoardSummary(next, p.text);
      } else if (op === 'complete_onboarding') {
        next = markOnboardingComplete(next);
      }
    }
    return save(t, next);
  }

  // ── Per-card memory (card/shared) — local facts about THIS card only ─────

  var CARD_STORAGE_KEY = 'cardAiMemory';
  var MAX_CARD_FACTS = 8;
  var MAX_CARD_FACT_LEN = 160;

  function emptyCardMemory() {
    return {
      version: 1,
      facts: [],
      updatedAt: '',
      lastDreamAt: '',
      dreamSignature: ''
    };
  }

  /**
   * Stable fingerprint of card facts — used to decide if a Dream pass is needed.
   */
  function cardFactsSignature(memory) {
    var mem = normalizeCardMemory(memory);
    if (!mem.facts.length) return '';
    return mem.facts
      .map(function (f) {
        return f.key || factIdentityKey(f.text);
      })
      .filter(Boolean)
      .sort()
      .join('|');
  }

  /**
   * True when card facts exist and have changed since the last Dream consolidation.
   */
  function cardDreamNeedsRefresh(memory) {
    var mem = normalizeCardMemory(memory);
    if (!mem.facts.length) return false;
    var sig = cardFactsSignature(mem);
    if (!sig) return false;
    return !(mem.dreamSignature && mem.dreamSignature === sig && mem.lastDreamAt);
  }

  async function markCardDreamed(t, memory) {
    var next = normalizeCardMemory(memory);
    next.dreamSignature = cardFactsSignature(next);
    next.lastDreamAt = new Date().toISOString();
    return saveCardMemory(t, next);
  }

  function normalizeCardFact(raw) {
    if (!raw) return null;
    var text =
      typeof raw === 'string'
        ? trimStr(raw, MAX_CARD_FACT_LEN)
        : trimStr(raw && raw.text, MAX_CARD_FACT_LEN);
    if (!text || isJunkFact(text)) return null;
    var key =
      (raw && typeof raw === 'object' && typeof raw.key === 'string' && raw.key) ||
      factIdentityKey(text);
    return {
      id:
        raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : factId(),
      text: text,
      key: key,
      updatedAt:
        raw && typeof raw === 'object' && typeof raw.updatedAt === 'string' && raw.updatedAt
          ? raw.updatedAt
          : new Date().toISOString()
    };
  }

  function normalizeCardMemory(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var facts = [];
    if (Array.isArray(src.facts)) {
      for (var i = 0; i < src.facts.length; i++) {
        var f = normalizeCardFact(src.facts[i]);
        if (f) facts.push(f);
      }
    }
    var seen = Object.create(null);
    var deduped = [];
    for (var j = 0; j < facts.length; j++) {
      var k = facts[j].key || factIdentityKey(facts[j].text);
      if (seen[k]) continue;
      seen[k] = true;
      facts[j].key = k;
      deduped.push(facts[j]);
    }
    return {
      version: 1,
      facts: deduped.slice(0, MAX_CARD_FACTS),
      updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : '',
      lastDreamAt: typeof src.lastDreamAt === 'string' ? src.lastDreamAt : '',
      dreamSignature: typeof src.dreamSignature === 'string' ? src.dreamSignature : ''
    };
  }

  async function loadCardMemory(t) {
    if (!t || typeof t.get !== 'function') return emptyCardMemory();
    try {
      var stored = await t.get('card', 'shared', CARD_STORAGE_KEY);
      return normalizeCardMemory(stored);
    } catch (err) {
      console.error('AgentMemory.loadCardMemory failed', err);
      return emptyCardMemory();
    }
  }

  async function saveCardMemory(t, memory) {
    var next = normalizeCardMemory(memory);
    next.updatedAt = new Date().toISOString();
    if (!t || typeof t.set !== 'function') return next;
    try {
      await t.set('card', 'shared', CARD_STORAGE_KEY, next);
    } catch (err) {
      console.error('AgentMemory.saveCardMemory failed', err);
    }
    return next;
  }

  function rememberCardFact(memory, text) {
    var next = normalizeCardMemory(memory);
    var fact = normalizeCardFact(text);
    if (!fact) return next;
    next.facts = upsertFactList(next.facts, fact, MAX_CARD_FACTS, false);
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function forgetCardFacts(memory, query) {
    var next = normalizeCardMemory(memory);
    var q = normKey(query);
    if (!q) return next;
    next.facts = next.facts.filter(function (f) {
      return normKey(f.text).indexOf(q) === -1 && (f.key || '').indexOf(q) === -1;
    });
    next.updatedAt = new Date().toISOString();
    return next;
  }

  /**
   * Apply card-local patches: remember | note | forget.
   * Lower bar than board LTM — any non-junk card fact is kept.
   */
  async function applyCardPatches(t, memory, patches) {
    var next = normalizeCardMemory(memory);
    var list = Array.isArray(patches) ? patches : [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object') continue;
      var op = String(p.op || '');
      if ((op === 'remember' || op === 'note') && p.text) {
        next = rememberCardFact(next, p.text);
      } else if (op === 'forget') {
        var q =
          (typeof p.query === 'string' && p.query) ||
          (typeof p.text === 'string' && p.text) ||
          '';
        if (q) next = forgetCardFacts(next, q);
      }
    }
    return saveCardMemory(t, next);
  }

  function buildCardPromptBlock(memory) {
    var mem = normalizeCardMemory(memory);
    if (!mem.facts.length) return '';
    var lines = ['Faits mémorisés sur cette carte :'];
    mem.facts.forEach(function (f) {
      lines.push('- ' + f.text);
    });
    return lines.join('\n');
  }

  global.AgentMemory = {
    STORAGE_KEY: STORAGE_KEY,
    CARD_STORAGE_KEY: CARD_STORAGE_KEY,
    MAX_FACTS: MAX_LTM_FACTS,
    MAX_LTM_FACTS: MAX_LTM_FACTS,
    MAX_STM_NOTES: MAX_STM_NOTES,
    MAX_RECENT_CARDS: MAX_RECENT_CARDS,
    MAX_CARD_FACTS: MAX_CARD_FACTS,
    SCAN_TTL_MS: SCAN_TTL_MS,
    emptyMemory: emptyMemory,
    normalizeMemory: normalizeMemory,
    legacyView: legacyView,
    load: load,
    save: save,
    needsOnboarding: needsOnboarding,
    mergeFacts: mergeFacts,
    rememberLongTerm: rememberLongTerm,
    rememberShortTerm: rememberShortTerm,
    forgetFacts: forgetFacts,
    setSummary: setSummary,
    setBoardSummary: setBoardSummary,
    mergeRecentCards: mergeRecentCards,
    recordRecentCards: recordRecentCards,
    cardIdCreatedAt: cardIdCreatedAt,
    markOnboardingComplete: markOnboardingComplete,
    markQuestionAsked: markQuestionAsked,
    buildPromptBlock: buildPromptBlock,
    scanIsFresh: scanIsFresh,
    scanAndRefresh: scanAndRefresh,
    applyPatches: applyPatches,
    enforceBudget: enforceBudget,
    isJunkFact: isJunkFact,
    isDurableFact: isDurableFact,
    factIdentityKey: factIdentityKey,
    emptyCardMemory: emptyCardMemory,
    normalizeCardMemory: normalizeCardMemory,
    loadCardMemory: loadCardMemory,
    saveCardMemory: saveCardMemory,
    rememberCardFact: rememberCardFact,
    forgetCardFacts: forgetCardFacts,
    applyCardPatches: applyCardPatches,
    buildCardPromptBlock: buildCardPromptBlock,
    cardFactsSignature: cardFactsSignature,
    cardDreamNeedsRefresh: cardDreamNeedsRefresh,
    markCardDreamed: markCardDreamed
  };
})(typeof window !== 'undefined' ? window : this);
