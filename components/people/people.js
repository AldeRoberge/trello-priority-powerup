/**
 * Member People directory — contacts with aliases, roles, email, phone.
 * Stored at member/private (same privacy lane as userProfile).
 * Exposes window.People (no bundler).
 *
 * resolvePeopleInText() expands role aliases (“ma boss” → Jane) for agent
 * blocked-reason polishing. Synonym groups expand when any member is present.
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

  var STORAGE_KEY = 'peopleDirectory';
  var MAX_PEOPLE = 40;
  var MAX_NAME = 80;
  var MAX_ALIAS = 40;
  var MAX_ALIASES = 12;
  var MAX_ROLE = 40;
  var MAX_ROLES = 8;
  var MAX_EMAIL = 120;
  var MAX_PHONE = 40;
  var MAX_NOTES = 400;
  var LOAD_TTL_MS = 30000;
  var loadCache = { directory: null, at: 0, inflight: null };

  /** Possessive / article prefixes commonly used with role aliases in FR. */
  var FR_DET = [
    'ma',
    'mon',
    'mes',
    'ta',
    'ton',
    'tes',
    'sa',
    'son',
    'ses',
    'la',
    'le',
    'les',
    'notre',
    'nos',
    'votre',
    'vos',
    'leur',
    'leurs'
  ];

  /**
   * Built-in synonym groups: storing any one expands matching to the group.
   * Keys are normalized (accent-folded lowercase).
   */
  var ALIAS_SYNONYM_GROUPS = [
    ['boss', 'patron', 'patronne', 'manager', 'n+1', 'n plus 1', 'superieur', 'superieure', 'responsable']
  ];

  function rememberDirectory(directory) {
    loadCache.directory = directory;
    loadCache.at = Date.now();
    return directory;
  }

  function cachedDirectory() {
    if (!loadCache.directory) return null;
    if (Date.now() - loadCache.at > LOAD_TTL_MS) return null;
    return loadCache.directory;
  }

  function clearLoadCache() {
    loadCache.directory = null;
    loadCache.at = 0;
    loadCache.inflight = null;
  }

  function foldAccents(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normKey(s) {
    return foldAccents(String(s || ''))
      .toLowerCase()
      .replace(/['’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function personId() {
    return (
      'person-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function initialsFromName(name) {
    var parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function clampStr(s, max) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return '';
    return t.length > max ? t.slice(0, max) : t;
  }

  function normalizeStringList(raw, maxItem, maxLen) {
    var src = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(/[,;|/]/)
        : [];
    var out = [];
    var seen = {};
    for (var i = 0; i < src.length && out.length < maxLen; i++) {
      var item = clampStr(src[i], maxItem);
      if (!item) continue;
      var key = normKey(item);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(item);
    }
    return out;
  }

  function emptyDirectory() {
    return {
      version: 1,
      people: [],
      updatedAt: ''
    };
  }

  function normalizePerson(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = clampStr(raw.name, MAX_NAME);
    if (!name) return null;
    var id =
      typeof raw.id === 'string' && /^person-[a-z0-9-]+$/i.test(raw.id.trim())
        ? raw.id.trim()
        : personId();
    var aliases = normalizeStringList(raw.aliases, MAX_ALIAS, MAX_ALIASES);
    // Drop aliases that equal the canonical name.
    aliases = aliases.filter(function (a) {
      return normKey(a) !== normKey(name);
    });
    var roles = normalizeStringList(raw.roles, MAX_ROLE, MAX_ROLES);
    return {
      id: id,
      name: name,
      aliases: aliases,
      roles: roles,
      email: clampStr(raw.email, MAX_EMAIL),
      phone: clampStr(raw.phone, MAX_PHONE),
      notes: clampStr(raw.notes, MAX_NOTES),
      trelloMemberId:
        typeof raw.trelloMemberId === 'string' && raw.trelloMemberId.trim()
          ? raw.trelloMemberId.trim().slice(0, 64)
          : '',
      updatedAt:
        typeof raw.updatedAt === 'string' && raw.updatedAt
          ? raw.updatedAt
          : ''
    };
  }

  function normalizeDirectory(raw) {
    var out = emptyDirectory();
    if (!raw || typeof raw !== 'object') return out;
    var src = Array.isArray(raw.people)
      ? raw.people
      : Array.isArray(raw)
        ? raw
        : [];
    var seenIds = {};
    var seenNames = {};
    for (var i = 0; i < src.length && out.people.length < MAX_PEOPLE; i++) {
      var p = normalizePerson(src[i]);
      if (!p) continue;
      if (seenIds[p.id]) {
        p.id = personId();
      }
      var nk = normKey(p.name);
      if (seenNames[nk]) continue;
      seenIds[p.id] = true;
      seenNames[nk] = true;
      out.people.push(p);
    }
    out.updatedAt =
      typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : '';
    return out;
  }

  function expandedAliasKeys(person) {
    var keys = {};
    function add(raw) {
      var k = normKey(raw);
      if (k) keys[k] = true;
    }
    (person.aliases || []).forEach(add);
    (person.roles || []).forEach(add);
    // Expand synonym groups when any member is present.
    var allKeys = Object.keys(keys);
    for (var g = 0; g < ALIAS_SYNONYM_GROUPS.length; g++) {
      var group = ALIAS_SYNONYM_GROUPS[g];
      var hit = false;
      for (var i = 0; i < group.length; i++) {
        if (keys[normKey(group[i])]) {
          hit = true;
          break;
        }
      }
      if (hit) {
        for (var j = 0; j < group.length; j++) add(group[j]);
      }
    }
    return Object.keys(keys);
  }

  /**
   * Build match phrases for a person, longest first.
   * Includes "la boss", "ma boss", bare "boss", etc.
   */
  function matchPhrasesForPerson(person) {
    var phrases = [];
    var seen = {};
    function push(phrase) {
      var k = normKey(phrase);
      if (!k || seen[k]) return;
      // Never match the person's own name as an "alias" to replace.
      if (k === normKey(person.name)) return;
      seen[k] = true;
      phrases.push(phrase);
    }

    var aliasKeys = expandedAliasKeys(person);
    for (var i = 0; i < aliasKeys.length; i++) {
      var base = aliasKeys[i];
      push(base);
      for (var d = 0; d < FR_DET.length; d++) {
        push(FR_DET[d] + ' ' + base);
      }
    }
    phrases.sort(function (a, b) {
      return b.length - a.length;
    });
    return phrases;
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Find a person by name, alias, role, or synonym (e.g. "ma boss", "patron").
   */
  function findByAliasOrName(directoryOrPeople, query) {
    var q = normKey(query);
    if (!q) return null;
    // Strip leading determinant for secondary match.
    var qBare = q;
    for (var d = 0; d < FR_DET.length; d++) {
      var pref = FR_DET[d] + ' ';
      if (qBare.indexOf(pref) === 0) {
        qBare = qBare.slice(pref.length);
        break;
      }
    }

    var people = Array.isArray(directoryOrPeople)
      ? directoryOrPeople
      : directoryOrPeople && Array.isArray(directoryOrPeople.people)
        ? directoryOrPeople.people
        : [];

    var nameHit = null;
    var aliasHit = null;
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      if (!p || !p.name) continue;
      if (normKey(p.name) === q || normKey(p.name) === qBare) {
        nameHit = p;
        break;
      }
      var phrases = matchPhrasesForPerson(p);
      for (var j = 0; j < phrases.length; j++) {
        if (normKey(phrases[j]) === q || normKey(phrases[j]) === qBare) {
          aliasHit = p;
          break;
        }
      }
      if (aliasHit) break;
    }
    return nameHit || aliasHit;
  }

  /**
   * Replace role/alias phrases in text with the person's canonical name.
   * Longest match first. Case-insensitive, accent-tolerant via folded search.
   *
   * Ex.: "En attente de la réponse de la boss" + Jane Doe (aliases: boss)
   *   → "En attente de la réponse de Jane Doe"
   */
  function resolveInText(text, directoryOrPeople) {
    if (typeof text !== 'string' || !text) return text || '';
    var people = Array.isArray(directoryOrPeople)
      ? directoryOrPeople
      : directoryOrPeople && Array.isArray(directoryOrPeople.people)
        ? directoryOrPeople.people
        : [];
    if (!people.length) return text;

    // Collect all (phrase, name) pairs across people, longest phrase first.
    var pairs = [];
    for (var i = 0; i < people.length; i++) {
      var p = people[i];
      if (!p || !p.name) continue;
      var phrases = matchPhrasesForPerson(p);
      for (var j = 0; j < phrases.length; j++) {
        pairs.push({ phrase: phrases[j], name: p.name });
      }
    }
    pairs.sort(function (a, b) {
      return b.phrase.length - a.phrase.length;
    });

    var result = text;
    for (var k = 0; k < pairs.length; k++) {
      var phrase = pairs[k].phrase;
      var name = pairs[k].name;
      // Word-boundary-ish: don't eat letters around the phrase.
      var re = new RegExp(
        '(^|[^\\p{L}\\p{N}_])(' + escapeRegExp(phrase) + ')(?=[^\\p{L}\\p{N}_]|$)',
        'giu'
      );
      // Fallback without unicode property escapes for older engines.
      try {
        result = result.replace(re, function (full, lead) {
          return lead + name;
        });
      } catch (e) {
        var reLegacy = new RegExp(
          '(^|[^A-Za-zÀ-ÿ0-9_])(' +
            escapeRegExp(phrase) +
            ')(?=[^A-Za-zÀ-ÿ0-9_]|$)',
          'gi'
        );
        result = result.replace(reLegacy, function (full, lead) {
          return lead + name;
        });
      }
    }
    return result;
  }

  function upsert(directory, patch) {
    var dir = normalizeDirectory(directory);
    if (!patch || typeof patch !== 'object') return dir;

    var matchText =
      (typeof patch.matchText === 'string' && patch.matchText.trim()) ||
      (typeof patch.id === 'string' && patch.id.trim()) ||
      '';
    var existing = null;
    var existingIdx = -1;

    if (typeof patch.id === 'string' && patch.id.trim()) {
      for (var i = 0; i < dir.people.length; i++) {
        if (dir.people[i].id === patch.id.trim()) {
          existing = dir.people[i];
          existingIdx = i;
          break;
        }
      }
    }
    if (!existing && matchText) {
      existing = findByAliasOrName(dir, matchText);
      if (existing) {
        for (var j = 0; j < dir.people.length; j++) {
          if (dir.people[j].id === existing.id) {
            existingIdx = j;
            break;
          }
        }
      }
    }
    if (!existing && typeof patch.name === 'string' && patch.name.trim()) {
      existing = findByAliasOrName(dir, patch.name);
      if (existing) {
        for (var k = 0; k < dir.people.length; k++) {
          if (dir.people[k].id === existing.id) {
            existingIdx = k;
            break;
          }
        }
      }
    }

    var base = existing
      ? Object.assign({}, existing)
      : {
          id: personId(),
          name: '',
          aliases: [],
          roles: [],
          email: '',
          phone: '',
          notes: '',
          trelloMemberId: '',
          updatedAt: ''
        };

    if (typeof patch.name === 'string' && patch.name.trim()) {
      base.name = clampStr(patch.name, MAX_NAME);
    }
    if (!base.name) return dir;

    if (Array.isArray(patch.aliases) || typeof patch.aliases === 'string') {
      base.aliases = normalizeStringList(patch.aliases, MAX_ALIAS, MAX_ALIASES);
    } else if (typeof patch.addAlias === 'string' && patch.addAlias.trim()) {
      base.aliases = normalizeStringList(
        (base.aliases || []).concat([patch.addAlias]),
        MAX_ALIAS,
        MAX_ALIASES
      );
    }
    if (Array.isArray(patch.roles) || typeof patch.roles === 'string') {
      base.roles = normalizeStringList(patch.roles, MAX_ROLE, MAX_ROLES);
    } else if (typeof patch.addRole === 'string' && patch.addRole.trim()) {
      base.roles = normalizeStringList(
        (base.roles || []).concat([patch.addRole]),
        MAX_ROLE,
        MAX_ROLES
      );
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
      base.email = clampStr(patch.email, MAX_EMAIL);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'phone')) {
      base.phone = clampStr(patch.phone, MAX_PHONE);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
      base.notes = clampStr(patch.notes, MAX_NOTES);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'trelloMemberId')) {
      base.trelloMemberId = clampStr(patch.trelloMemberId, 64);
    }
    base.updatedAt = new Date().toISOString();

    var nextPerson = normalizePerson(base);
    if (!nextPerson) return dir;

    if (existingIdx >= 0) {
      dir.people[existingIdx] = nextPerson;
    } else {
      if (dir.people.length >= MAX_PEOPLE) {
        dir.people = dir.people.slice(0, MAX_PEOPLE - 1);
      }
      dir.people.push(nextPerson);
    }
    dir.updatedAt = nextPerson.updatedAt;
    return dir;
  }

  function remove(directory, match) {
    var dir = normalizeDirectory(directory);
    if (match == null || match === '') return dir;
    var query =
      typeof match === 'string'
        ? match
        : match && (match.id || match.matchText || match.name || '');
    if (!query) return dir;
    var found = null;
    if (typeof match === 'object' && match.id) {
      for (var i = 0; i < dir.people.length; i++) {
        if (dir.people[i].id === match.id) {
          found = dir.people[i];
          break;
        }
      }
    }
    if (!found) found = findByAliasOrName(dir, query);
    if (!found) return dir;
    dir.people = dir.people.filter(function (p) {
      return p.id !== found.id;
    });
    dir.updatedAt = new Date().toISOString();
    return dir;
  }

  function toAgentContext(directoryOrPeople) {
    var people = Array.isArray(directoryOrPeople)
      ? directoryOrPeople
      : directoryOrPeople && Array.isArray(directoryOrPeople.people)
        ? directoryOrPeople.people
        : [];
    return people.slice(0, MAX_PEOPLE).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        aliases: (p.aliases || []).slice(),
        roles: (p.roles || []).slice(),
        email: p.email || null,
        phone: p.phone || null,
        notes: p.notes || null
      };
    });
  }

  function peoplePromptLines(directoryOrPeople) {
    var list = toAgentContext(directoryOrPeople);
    if (!list.length) {
      return [
        'Personnes (annuaire)\u00a0: vide. Si l\'utilisateur parle de \u00ab\u00a0ma boss\u00a0\u00bb / \u00ab\u00a0mon patron\u00a0\u00bb / un r\u00f4le sans nom connu\u00a0: DEMANDE qui c\'est, puis upsert_person. N\'invente JAMAIS un nom.'
      ];
    }
    var lines = [
      'Personnes (annuaire membre \u2014 source de v\u00e9rit\u00e9 pour alias / r\u00f4les)\u00a0:'
    ];
    list.forEach(function (p) {
      var bits = [p.name];
      if (p.aliases && p.aliases.length) {
        bits.push('alias\u00a0: ' + p.aliases.join(', '));
      }
      if (p.roles && p.roles.length) {
        bits.push('r\u00f4les\u00a0: ' + p.roles.join(', '));
      }
      if (p.email) bits.push('email\u00a0: ' + p.email);
      if (p.phone) bits.push('t\u00e9l\u00a0: ' + p.phone);
      if (p.notes) bits.push('notes\u00a0: ' + p.notes);
      lines.push('- ' + bits.join(' \u00b7 '));
    });
    lines.push(
      '- Quand l\'utilisateur dit un alias / r\u00f4le (ex. \u00ab\u00a0ma boss\u00a0\u00bb)\u00a0: utilise le NOM propre dans messages, blockedReasons, sous-t\u00e2ches et set_custom_assignees (ex. \u00ab\u00a0En attente de la r\u00e9ponse de Jane Doe\u00a0\u00bb / add:["Jane Doe"]), jamais le seul r\u00f4le.'
    );
    lines.push(
      '- Hors Trello\u00a0: chaque personne de cet annuaire est aussi assignable via set_custom_assignees (m\u00eame id person-*). upsert_person synchronise le catalogue Hors Trello du tableau.'
    );
    lines.push(
      '- Personne inconnue\u00a0: pose UNE question (\u00ab\u00a0C\'est qui, ta boss?\u00a0\u00bb), puis upsert_person {name, aliases:[\'boss\']} \u00e0 la r\u00e9ponse. Ne stocke pas seulement un fait m\u00e9moire libre.'
    );
    return lines;
  }

  /**
   * Shape compatible with PriorityUI Hors Trello assignees (shared person-* id).
   */
  function toCustomAssignee(person) {
    var p = normalizePerson(person);
    if (!p) return null;
    var row = { id: p.id, name: p.name };
    if (p.trelloMemberId) row.trelloMemberId = p.trelloMemberId;
    return row;
  }

  /**
   * Resolve an assignee spec (string / {name,matchText,id}) via People aliases
   * into a Hors Trello–ready { id, name, trelloMemberId? } draft.
   */
  function resolveAssigneeSpec(directoryOrPeople, spec) {
    var query = '';
    var idWant = '';
    if (typeof spec === 'string' || typeof spec === 'number') {
      query = String(spec).trim();
      idWant = query;
    } else if (spec && typeof spec === 'object') {
      idWant = spec.id != null ? String(spec.id).trim() : '';
      query =
        (typeof spec.matchText === 'string' && spec.matchText.trim()) ||
        (typeof spec.name === 'string' && spec.name.trim()) ||
        (typeof spec.fullName === 'string' && spec.fullName.trim()) ||
        idWant;
    }
    if (!query && !idWant) return null;

    var people = Array.isArray(directoryOrPeople)
      ? directoryOrPeople
      : directoryOrPeople && Array.isArray(directoryOrPeople.people)
        ? directoryOrPeople.people
        : [];

    if (idWant) {
      for (var i = 0; i < people.length; i++) {
        if (people[i] && people[i].id === idWant) {
          return toCustomAssignee(people[i]);
        }
      }
    }
    var found = findByAliasOrName(directoryOrPeople, query);
    return found ? toCustomAssignee(found) : null;
  }

  /**
   * Merge People directory entries into a Hors Trello catalog array
   * (shared person-* ids). Returns { changed, catalog }.
   */
  function mergeIntoAssigneeCatalog(catalog, directoryOrPeople) {
    var list = Array.isArray(catalog) ? catalog.slice() : [];
    var people = Array.isArray(directoryOrPeople)
      ? directoryOrPeople
      : directoryOrPeople && Array.isArray(directoryOrPeople.people)
        ? directoryOrPeople.people
        : [];
    var before = JSON.stringify(list);
    var byId = {};
    var byName = {};
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].id) continue;
      byId[list[i].id] = i;
      byName[normKey(list[i].name)] = i;
    }
    for (var p = 0; p < people.length; p++) {
      var draft = toCustomAssignee(people[p]);
      if (!draft) continue;
      var nameKey = normKey(draft.name);
      if (byId[draft.id] != null) {
        var idx = byId[draft.id];
        list[idx] = {
          id: draft.id,
          name: draft.name,
          trelloMemberId:
            draft.trelloMemberId || list[idx].trelloMemberId || undefined
        };
        if (!list[idx].trelloMemberId) delete list[idx].trelloMemberId;
        continue;
      }
      if (byName[nameKey] != null) {
        // Keep existing catalog id when name already present under another id.
        continue;
      }
      if (list.length >= MAX_PEOPLE) break;
      list.push(draft);
      byId[draft.id] = list.length - 1;
      byName[nameKey] = list.length - 1;
    }
    return {
      changed: JSON.stringify(list) !== before,
      catalog: list
    };
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') {
      dbgLog('people', 'load', { ok: false, reason: 'no-client' });
      return emptyDirectory();
    }
    var hit = cachedDirectory();
    if (hit) return hit;
    if (loadCache.inflight) return loadCache.inflight;

    loadCache.inflight = (async function () {
      try {
        var stored = await t.get('member', 'private', STORAGE_KEY);
        var directory = normalizeDirectory(stored);
        dbgLog('people', 'load', { ok: true, count: directory.people.length });
        return rememberDirectory(directory);
      } catch (err) {
        dbgError('people', 'load', err);
        console.error('People.load failed', err);
        return rememberDirectory(emptyDirectory());
      } finally {
        loadCache.inflight = null;
      }
    })();

    return loadCache.inflight;
  }

  async function save(t, directory) {
    if (!t || typeof t.set !== 'function') {
      dbgLog('people', 'save', { ok: false, reason: 'no-client' });
      throw new Error('People.save: t.set required');
    }
    var next = normalizeDirectory(directory);
    next.updatedAt = new Date().toISOString();
    await t.set('member', 'private', STORAGE_KEY, next);
    rememberDirectory(next);
    dbgLog('people', 'save', { ok: true, count: next.people.length });
    return next;
  }

  async function reset(t) {
    var blank = emptyDirectory();
    blank.updatedAt = new Date().toISOString();
    if (t && typeof t.set === 'function') {
      await t.set('member', 'private', STORAGE_KEY, blank);
    }
    rememberDirectory(blank);
    dbgLog('people', 'reset', { ok: true });
    return blank;
  }

  global.People = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_PEOPLE: MAX_PEOPLE,
    MAX_NAME: MAX_NAME,
    MAX_NOTES: MAX_NOTES,
    emptyDirectory: emptyDirectory,
    normalizeDirectory: normalizeDirectory,
    normalizePerson: normalizePerson,
    initialsFromName: initialsFromName,
    findByAliasOrName: findByAliasOrName,
    resolveInText: resolveInText,
    toCustomAssignee: toCustomAssignee,
    resolveAssigneeSpec: resolveAssigneeSpec,
    mergeIntoAssigneeCatalog: mergeIntoAssigneeCatalog,
    upsert: upsert,
    remove: remove,
    toAgentContext: toAgentContext,
    peoplePromptLines: peoplePromptLines,
    matchPhrasesForPerson: matchPhrasesForPerson,
    load: load,
    save: save,
    reset: reset,
    clearLoadCache: clearLoadCache
  };
})(typeof window !== 'undefined' ? window : this);
