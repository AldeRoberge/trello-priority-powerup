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
  var MAX_RELATION = 80;
  var LOAD_TTL_MS = 30000;
  /** Soft refresh window for agent turns (cross-window profile edits). */
  var AGENT_REFRESH_MAX_AGE_MS = 5000;
  var loadCache = { directory: null, at: 0, inflight: null };

  /** Possessive / article prefixes commonly used with role aliases in FR/EN. */
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
    'du',
    'au',
    'aux',
    'des',
    'notre',
    'nos',
    'votre',
    'vos',
    'leur',
    'leurs',
    'my',
    'our',
    'your',
    'his',
    'her',
    'their',
    'the'
  ];

  /**
   * Built-in synonym groups: storing any one expands matching to the group.
   * Keys are normalized (accent-folded lowercase).
   */
  var ALIAS_SYNONYM_GROUPS = [
    // Manager / boss / N+1
    [
      'boss',
      'patron',
      'patronne',
      'manager',
      'manageuse',
      'n+1',
      'n plus 1',
      'n+ 1',
      'hierarchie',
      'superieur',
      'superieure',
      'superieur hierarchique',
      'superieure hierarchique',
      'responsable',
      'chef',
      'cheffe',
      'chef de service',
      'cheffe de service',
      'chef d equipe',
      'cheffe d equipe',
      'team lead',
      'teamlead',
      'team leader',
      'leader',
      'directeur',
      'directrice',
      'director',
      'dirigeant',
      'dirigeante',
      'pdg',
      'ceo',
      'vp',
      'vice-president',
      'vice-presidente',
      'vice president',
      'superviseur',
      'superviseure',
      'supervisor',
      'superior'
    ],
    // Skip-level / N+2
    [
      'n+2',
      'n plus 2',
      'n+ 2',
      'grand patron',
      'grande patronne',
      'skip level',
      'skip-level',
      'skiplevel',
      'boss du boss',
      'patron du patron'
    ],
    // Colleague / teammate
    [
      'collegue',
      'collegues',
      'coworker',
      'co-worker',
      'co worker',
      'coworkers',
      'equipier',
      'equipiere',
      'equipiers',
      'coequipier',
      'coequipiere',
      'teammate',
      'team mate',
      'team-mate',
      'pair',
      'pairs',
      'peer',
      'peers',
      'compagnon de travail',
      'compagne de travail'
    ],
    // Client / customer
    [
      'client',
      'cliente',
      'clients',
      'clientele',
      'customer',
      'customers',
      'acheteur',
      'acheteuse',
      'donneur d ordre',
      'donneuse d ordre',
      'commanditaire',
      'sponsor',
      'stakeholder',
      'partie prenante'
    ],
    // Vendor / supplier / partner org
    [
      'fournisseur',
      'fournisseuse',
      'vendor',
      'supplier',
      'prestataire',
      'sous-traitant',
      'sous traitant',
      'contractor',
      'consultant',
      'consultante',
      'partenaire externe',
      'agence'
    ],
    // Spouse / partner (personal)
    [
      'conjoint',
      'conjointe',
      'partenaire',
      'conjoint.e',
      'spouse',
      'mari',
      'femme',
      'epoux',
      'epouse',
      'copain',
      'copine',
      'chum',
      'blonde',
      'boyfriend',
      'girlfriend',
      'fiance',
      'fiancee',
      'compagnon',
      'compagne'
    ],
    // Assistant / admin
    [
      'adjoint',
      'adjointe',
      'assistant',
      'assistante',
      'executive assistant',
      'secretaire',
      'adjointe administrative',
      'adjoint administratif',
      'personal assistant',
      'assistante de direction',
      'assistant de direction'
    ],
    // Intern / junior
    [
      'stagiaire',
      'intern',
      'interne',
      'junior',
      'apprenti',
      'apprentie',
      'trainee',
      'etudiant',
      'etudiante',
      'co-op',
      'coop'
    ],
    // Mentor / coach
    [
      'mentor',
      'mentore',
      'mentorat',
      'coach',
      'coaching',
      'sponsor interne',
      'parrain',
      'marraine'
    ],
    // HR / RH
    [
      'rh',
      'hr',
      'ressources humaines',
      'human resources',
      'people ops',
      'people operations',
      'recruteur',
      'recruteuse',
      'recruiter'
    ],
    // IT / tech support (avoid bare "it" — too common in EN)
    [
      'ti',
      'informatique',
      'support ti',
      'support it',
      'helpdesk',
      'help desk',
      'service desk',
      'sysadmin',
      'admin systeme',
      'tech support',
      'soutien technique'
    ],
    // Finance / accounting
    [
      'finance',
      'finances',
      'comptable',
      'comptabilite',
      'accounting',
      'controller',
      'controleur',
      'controleuse',
      'payroll',
      'paie'
    ],
    // Legal / compliance
    [
      'juridique',
      'legal',
      'avocat',
      'avocate',
      'counsel',
      'compliance',
      'conformite',
      'notaire'
    ],
    // Family (common blockers / context)
    [
      'mere',
      'maman',
      'mom',
      'mother',
      'pere',
      'papa',
      'dad',
      'father',
      'frere',
      'soeur',
      'brother',
      'sister',
      'beau-pere',
      'belle-mere',
      'beau pere',
      'belle mere',
      'beau-frere',
      'belle-soeur'
    ],
    // Doctor / health
    [
      'medecin',
      'docteur',
      'docteure',
      'doctor',
      'therapeute',
      'psy',
      'psychologue',
      'physiotherapeute',
      'physio'
    ],
    // Contact / point person / PM
    [
      'contact',
      'point de contact',
      'point person',
      'interlocuteur',
      'interlocutrice',
      'referent',
      'referente',
      'responsable dossier',
      'product owner',
      'project manager',
      'chef de projet',
      'cheffe de projet',
      'gestionnaire de projet'
    ]
  ];

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  /** Strip a single leading FR/EN determinant ("ma boss" → "boss"). */
  function stripLeadingDet(folded) {
    var bare = String(folded || '');
    for (var d = 0; d < FR_DET.length; d++) {
      var pref = FR_DET[d] + ' ';
      if (bare.indexOf(pref) === 0) {
        return bare.slice(pref.length).trim();
      }
    }
    return bare;
  }

  /**
   * True when needle appears in haystack as a whole phrase (not mid-word).
   * "chef" matches "mon chef" / "chef de service"; not "parchemin".
   */
  function phraseContains(haystack, needle) {
    if (!haystack || !needle) return false;
    if (haystack === needle) return true;
    var re = new RegExp(
      '(?:^|\\s)' + escapeRegExp(needle) + '(?=\\s|$)'
    );
    return re.test(haystack);
  }

  /**
   * Longest synonym-group member that matches text (exact or whole-phrase).
   * Preferring length avoids "chef" beating "chef de projet".
   */
  function findSynonymGroupForText(text) {
    var t = normKey(text);
    if (!t) return null;
    var bare = stripLeadingDet(t);
    var bestGroup = null;
    var bestLen = -1;
    for (var g = 0; g < ALIAS_SYNONYM_GROUPS.length; g++) {
      var group = ALIAS_SYNONYM_GROUPS[g];
      for (var i = 0; i < group.length; i++) {
        var member = group[i];
        if (
          t === member ||
          bare === member ||
          phraseContains(t, member) ||
          phraseContains(bare, member)
        ) {
          if (member.length > bestLen) {
            bestLen = member.length;
            bestGroup = group;
          }
        }
      }
    }
    return bestGroup;
  }

  /**
   * From a free-text relation ("my boss", "ma boss", "directeur") produce
   * compact seed aliases. Full synonym expansion happens at match time.
   */
  function aliasesFromRelation(relation) {
    var raw = clampStr(relation, MAX_RELATION);
    if (!raw) return [];
    var t = normKey(raw);
    var out = [raw];
    function push(s) {
      if (s && out.indexOf(s) === -1) out.push(s);
    }
    var bare = stripLeadingDet(t);
    if (bare && bare !== t) push(bare);

    var group = findSynonymGroupForText(t);
    if (group && group[0]) {
      // Primary group key so expandedAliasKeys can expand the whole set.
      push(group[0]);
    }
    return normalizeStringList(out, MAX_ALIAS, MAX_ALIASES);
  }

  function rememberDirectory(directory) {
    loadCache.directory = directory;
    loadCache.at = Date.now();
    return directory;
  }

  function cachedDirectory(maxAgeMs) {
    if (!loadCache.directory) return null;
    var ttl =
      typeof maxAgeMs === 'number' && maxAgeMs >= 0 ? maxAgeMs : LOAD_TTL_MS;
    if (Date.now() - loadCache.at > ttl) return null;
    return loadCache.directory;
  }

  function clearLoadCache() {
    loadCache.directory = null;
    loadCache.at = 0;
    loadCache.inflight = null;
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
    var relation = clampStr(raw.relation, MAX_RELATION);
    var roles = normalizeStringList(raw.roles, MAX_ROLE, MAX_ROLES);
    var notes = clampStr(raw.notes, MAX_NOTES);
    var aliases = normalizeStringList(raw.aliases, MAX_ALIAS, MAX_ALIASES);
    // Relation → compact aliases (my boss → boss). Synonyms expand at match time.
    aliases = normalizeStringList(
      aliases.concat(aliasesFromRelation(relation)),
      MAX_ALIAS,
      MAX_ALIASES
    );
    aliases = aliases.filter(function (a) {
      return normKey(a) !== normKey(name);
    });
    return {
      id: id,
      name: name,
      relation: relation,
      aliases: aliases,
      roles: roles,
      email: clampStr(raw.email, MAX_EMAIL),
      phone: clampStr(raw.phone, MAX_PHONE),
      notes: notes,
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
    // Relation is a first-class match source (even before aliases are seeded).
    if (person.relation) {
      add(person.relation);
      var relBare = stripLeadingDet(normKey(person.relation));
      if (relBare) add(relBare);
    }
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
    var qBare = stripLeadingDet(q);

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
          relation: '',
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

    if (Object.prototype.hasOwnProperty.call(patch, 'relation')) {
      base.relation = clampStr(patch.relation, MAX_RELATION);
    }

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
        relation: p.relation || null,
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
        'Personnes / coll\u00e8gues (annuaire)\u00a0: vide. Si l\'utilisateur parle de \u00ab\u00a0ma boss\u00a0\u00bb / un coll\u00e8gue sans nom connu\u00a0: DEMANDE qui c\'est, puis upsert_person. N\'invente JAMAIS un nom.'
      ];
    }
    var lines = [
      'Personnes / coll\u00e8gues (annuaire membre \u2014 TU CONNAIS CES GENS)\u00a0:',
      '- Tu as leurs coordonn\u00e9es (t\u00e9l\u00e9phone, courriel, r\u00f4le, relation). Si on te demande le num\u00e9ro / courriel / qui est ta boss\u00a0: R\u00c9PONDS avec ces faits. INTERDIT de dire que tu ne sais pas quand la fiche est ci-dessous.'
    ];
    list.forEach(function (p) {
      var bits = [p.name];
      if (p.relation) bits.push('relation\u00a0: ' + p.relation);
      if (p.aliases && p.aliases.length) {
        bits.push('alias\u00a0: ' + p.aliases.join(', '));
      }
      if (p.roles && p.roles.length) {
        bits.push('r\u00f4les\u00a0: ' + p.roles.join(', '));
      }
      if (p.email) bits.push('email\u00a0: ' + p.email);
      if (p.phone) bits.push('t\u00e9l\u00e9phone\u00a0: ' + p.phone);
      if (p.notes) bits.push('notes\u00a0: ' + p.notes);
      lines.push('- ' + bits.join(' \u00b7 '));
    });
    lines.push(
      '- Ex. user \u00ab\u00a0c\'est quoi le t\u00e9l\u00e9phone de ma boss?\u00a0\u00bb + fiche Sylviane (relation boss, t\u00e9l\u00a0: 819-\u2026) \u2192 r\u00e9ponds le num\u00e9ro de Sylviane Mailhot tout de suite.'
    );
    lines.push(
      '- Quand l\'utilisateur dit un alias / relation (ex. \u00ab\u00a0ma boss\u00a0\u00bb)\u00a0: utilise le NOM propre partout (messages, blockedReasons, set_custom_assignees).'
    );
    lines.push(
      '- Hors Trello\u00a0: m\u00eame id person-* via set_custom_assignees. upsert_person synchronise le catalogue.'
    );
    lines.push(
      '- Personne inconnue\u00a0: UNE question (\u00ab\u00a0C\'est qui, ta boss?\u00a0\u00bb), puis upsert_person {name, relation:"ma boss", aliases, phone?}.'
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

  async function load(t, options) {
    options = options || {};
    var force = !!options.force;
    if (!t || typeof t.get !== 'function') {
      dbgLog('people', 'load', { ok: false, reason: 'no-client' });
      return emptyDirectory();
    }
    if (!force) {
      var hit = cachedDirectory();
      if (hit) return hit;
      if (loadCache.inflight) return loadCache.inflight;
    } else {
      clearLoadCache();
    }

    var fetchPromise = (async function () {
      try {
        var stored = await t.get('member', 'private', STORAGE_KEY);
        var directory = normalizeDirectory(stored);
        dbgLog('people', 'load', {
          ok: true,
          count: directory.people.length,
          force: force
        });
        return rememberDirectory(directory);
      } catch (err) {
        dbgError('people', 'load', err);
        console.error('People.load failed', err);
        return rememberDirectory(emptyDirectory());
      } finally {
        if (loadCache.inflight === fetchPromise) {
          loadCache.inflight = null;
        }
      }
    })();

    if (!force) loadCache.inflight = fetchPromise;
    return fetchPromise;
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
    MAX_RELATION: MAX_RELATION,
    emptyDirectory: emptyDirectory,
    normalizeDirectory: normalizeDirectory,
    normalizePerson: normalizePerson,
    initialsFromName: initialsFromName,
    aliasesFromRelation: aliasesFromRelation,
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
