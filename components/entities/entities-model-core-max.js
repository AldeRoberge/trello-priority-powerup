/*
 * Role: pure Entity-Component model ("Entités"): rich things the user names once ("Monstera", "Hôtel de
 * Ville") and the assistant can then filter ("mes plantes au travail"). No Trello, no DOM.
 *
 * In the UI: an ARCHETYPE (internally a "type") is a predefined model: a bundle of components plus default
 * values. An ENTITY is an instance of one or more archetypes and stores only its OVERRIDES (what differs
 * from the defaults); it may also carry extra components of its own (entity.components).
 *
 * Vocabulary (ECS):
 *   Component  a named group of typed fields ("location" {place: ref}, "care" {interval_days: number}).
 *   Type       an archetype that bundles components ("plant" = location + care). An entity may have
 *              several types; its components are the union of its types' components.
 *   Entity     an id + name + aliases + types + data + relations + history.
 *   data       { componentId: { fieldKey: value } }, addressed by path "component.field".
 *   relations  free-form named links to other entities ({type:'part-of', to:id}); ref fields are links too.
 *   base       optional archetype (another entity's id): the entity inherits its data values and only
 *              stores OVERRIDES. Editing an override never touches the archetype; editing the archetype
 *              reaches every entity that has not overridden that field (see effectiveData).
 *   history    bounded log of changes; every change can be reverted with revertEntry().
 *
 * Ontology (see docs/entities-ontologie.md): the ECS is deliberately general, so a thing can be a hand cream,
 * a region of the world map, a person, a worker, a building, a city, a concept. Three additions carry that:
 *   nature     what KIND of thing a type is (matter, living, agent, place, event, social, abstract), each in
 *              a realm (material / immaterial). Types may have parent types (a City is a Place) and inherit
 *              their components; a type with role:true is something an entity is only in a context (Worker).
 *   relations  a built-in vocabulary (located in / part of / made of / instance of / grounded in...) with
 *              inverses, categories and expected natures; containment (located in + part of) is transitive.
 *   grounding  materialism as a lint: an abstract or social entity should be anchored, within a few links,
 *              to something material (what embodies, expresses or instantiates it). Otherwise it is
 *              reported as "floating" (information, never blocking).
 *
 * Contents: 1 constants / text helpers | 2 schema (components, types, defaults) | 2b natures and type
 * lineage | 3 entities and values | 4 mutations (all pure: they return a modified copy) | 5 relations |
 * 5b relation vocabulary, containment, grounding | 6 history / revert | 7 queries and natural-language
 * resolution | 8 agent prompt lines | 9 export
 */

/**
 * entities-model: part 1 of 2 (-).
 * Names are shared with the other parts through window.EntitiesModelParts (see entities-model.parts.json for the load order).
 */

/**
 * entities-model-core: part 1 of 2 (-).
 * Names are shared with the other parts through window.EntitiesModelParts (see entities-model-core.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesModelParts = global.EntitiesModelParts || {});

  // from other parts (functions, resolved at call time)
  function matchRelation() { return S.matchRelation.apply(this, arguments); }
  function relationById() { return S.relationById.apply(this, arguments); }

var S = (global.EntitiesModelParts = global.EntitiesModelParts || {});

// ---------------------------------------------------------------- 1 constants / text helpers
  var VERSION = 1;
  var MAX_NAME = 80;
  var MAX_ALIAS = 40;
  var MAX_ALIASES = 12;
  var MAX_TEXT = 500;
  var MAX_COMPONENTS = 40;
  var MAX_FIELDS = 20;
  var MAX_TYPES = 60;
  var MAX_ENTITIES = 2000;
  var MAX_RELATIONS = 120;
  var MAX_REL_TYPE = 40;
  var MAX_ROLE = 60;
  var MAX_CHOICES = 20;
  var MAX_HISTORY = 40;
  var MAX_PROMPT_CHARS = 2400;
  var MAX_PROMPT_MATCHES = 25;
  var MAX_LONGTEXT = 1500;
  var MAX_URL = 300;
  var MAX_UNIT = 12;
  var MAX_DESCRIPTION = 200;
  var MAX_CUSTOM_RELATIONS = 20;
  var MAX_DEFAULTS = 40;
  var RELATION_CATEGORIES = ['spatial', 'mereological', 'composition', 'production', 'social', 'taxonomic', 'grounding', 'causal', 'temporal', 'conceptual', 'generic'];
  /** The description card of the schema holds 16 384 chars; stay well under it. */
  var MAX_SCHEMA_CHARS = 15000;
  var FIELD_KINDS = ['text', 'number', 'date', 'bool', 'choice', 'ref', 'refs', 'multi', 'longtext', 'geo', 'url', 'level'];

  /**
   * What a type of thing fundamentally IS. realm: 'material' (has a body, a place or a time: matter, living,
   * agent, place, event) or 'immaterial' (exists by convention or by thought: social, abstract).
   */
  var NATURES = [
    { id: 'matter', name: 'Matière', realm: 'material', icon: 'box', hint: 'Ce qui a une masse et occupe l’espace : un objet, un produit, une substance.' },
    { id: 'living', name: 'Vivant', realm: 'material', icon: 'plant', hint: 'Un être qui naît, croît et meurt : une plante, un animal.' },
    { id: 'agent', name: 'Agent', realm: 'material', icon: 'user', hint: 'Quelqu’un qui agit et a des intentions : une personne, un travailleur.' },
    { id: 'place', name: 'Lieu', realm: 'material', icon: 'map-pin', hint: 'Une portion d’espace : une région, une ville, un bâtiment, une pièce.' },
    { id: 'event', name: 'Événement', realm: 'material', icon: 'calendar-event', hint: 'Ce qui se déroule dans le temps : une réunion, une récolte.' },
    { id: 'social', name: 'Fait social', realm: 'immaterial', icon: 'building-community', hint: 'Existe parce qu’un groupe le reconnaît : une organisation, une loi, une monnaie.' },
    { id: 'abstract', name: 'Abstrait', realm: 'immaterial', icon: 'bulb', hint: 'Une idée ou une notion : justice, liberté, une méthode, un nombre.' },
  ];

  function str(v, max) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max).trim() : s;
  }

  function foldAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /** Lowercase, accent-free, single-spaced, apostrophes unified: the comparison key of any label. */
  function normKey(s) {
    return foldAccents(s).toLowerCase().replace(/['’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** "plantes" -> "plante". A few words end in s without being plural ("dans", "fils"). */
  function singular(word) {
    if (word === 'animaux') return 'animal';
    if (word === 'travaux') return 'travail';
    if (word === 'dans' || word === 'sans' || word === 'sous' || word === 'vers' || word === 'fils' || word === 'temps' || word === 'plus') return word;
    if (word.length > 3 && /(s|x)$/.test(word)) return word.slice(0, -1);
    return word;
  }

  function stem(s) {
    return normKey(s).split(' ').map(singular).join(' ');
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function hasPhrase(haystack, needle) {
    if (!haystack || !needle) return false;
    return new RegExp('(?:^|\\s)' + escapeRegExp(needle) + '(?=\\s|$)').test(haystack);
  }

  function slug(s) {
    return normKey(s).replace(/'/g, '').replace(/ /g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
  }

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }

  var idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + idCounter.toString(36);
  }

  function nowIso(opts) {
    return opts && opts.now ? opts.now : new Date().toISOString();
  }

  function uniqueStrings(list, max, maxLen) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (v) {
      var s = str(v, maxLen);
      var k = normKey(s);
      if (!s || !k || seen[k]) return;
      seen[k] = true;
      out.push(s);
    });
    return out.slice(0, max);
  }

  // ---------------------------------------------------------------- 2 schema
  function normalizeField(f) {
    if (!f || typeof f !== 'object') return null;
    var label = str(f.label || f.key, MAX_NAME);
    var key = slug(f.key || label);
    if (!key) return null;
    var kind = FIELD_KINDS.indexOf(f.kind) >= 0 ? f.kind : 'text';
    var out = { key: key, label: label || key, kind: kind };
    if (kind === 'choice' || kind === 'multi') out.options = uniqueStrings(f.options, MAX_CHOICES, MAX_ALIAS);
    if (kind === 'number' && f.unit) out.unit = str(f.unit, MAX_UNIT);
    if (kind === 'level') {
      // a gauge: a number between a minimum (0) and a maximum, either fixed or read from a sibling field (the capacity)
      if (f.unit) out.unit = str(f.unit, MAX_UNIT);
      var lo = Number(f.min);
      if (isFinite(lo) && lo !== 0) out.min = lo;
      var hi = Number(f.max);
      if (isFinite(hi) && f.max !== null && f.max !== '' && hi > (out.min || 0)) out.max = hi;
      if (f.maxField) out.maxField = slug(f.maxField);
    }
    if (kind === 'ref' || kind === 'refs') {
      out.refTypes = uniqueStrings(f.refTypes, MAX_TYPES, MAX_NAME).map(slug).filter(Boolean);
      // the field IS a relation of the vocabulary (e.g. a plant's place is "located in")
      if (f.rel && relationById(f.rel)) {
        out.rel = String(f.rel);
        // "Bloqué par X" stores X as the subject of "bloque": X blocks this entity, not the reverse.
        if (f.incoming) out.incoming = true;
      }
    }
    return out;
  }

  function normalizeComponent(c) {
    if (!c || typeof c !== 'object') return null;
    var name = str(c.name || c.id, MAX_NAME);
    var id = slug(c.id || name);
    if (!id) return null;
    var seen = {};
    var fields = [];
    (Array.isArray(c.fields) ? c.fields : []).forEach(function (f) {
      var nf = normalizeField(f);
      if (!nf || seen[nf.key]) return;
      seen[nf.key] = true;
      fields.push(nf);
    });
    if (id === 'location') {
      fields.forEach(function (f) {
        if (f.key === 'place' && f.kind === 'ref' && !f.rel) f.rel = 'located-in';
      });
    }
    var out = { id: id, name: name || id, fields: fields.slice(0, MAX_FIELDS) };
    if (c.builtin === 'aliases') out.builtin = 'aliases';
    // atomic composition: components this one cannot live without (Contenant requires Matière), and what it lets the thing do
    var requires = uniqueStrings(c.requires, 6, MAX_NAME).map(slug).filter(function (r) {
      return r && r !== id;
    });
    if (requires.length) out.requires = requires;
    var can = uniqueStrings(c.can, 6, MAX_ALIAS);
    if (can.length) out.can = can;
    return out;
  }

  /** Built-in component whose value is the entity's own alias list ("Autres noms"); added or removed like any other. */
  var NAMES_COMPONENT = 'names';

  function normalizeType(t) {
    if (!t || typeof t !== 'object') return null;
    var name = str(t.name || t.id, MAX_NAME);
    var id = slug(t.id || name);
    if (!id) return null;
    return {
      id: id,
      name: name || id,
      aliases: uniqueStrings(t.aliases, MAX_ALIASES, MAX_ALIAS),
      icon: str(t.icon, 30),
      nature: natureById(t.nature) ? t.nature : id === 'place' ? 'place' : '',
      parents: uniqueStrings(t.parents, 6, MAX_NAME).map(slug).filter(Boolean),
      role: t.role === true,
      description: str(t.description, MAX_DESCRIPTION),
      defaults: t.defaults && typeof t.defaults === 'object' && !Array.isArray(t.defaults) ? clone(t.defaults) : {},
      components: uniqueStrings(t.components, MAX_COMPONENTS, MAX_NAME).map(slug).filter(Boolean),
    };
  }

  function defaultSchema() {
    return normalizeSchema({
      components: [
        { id: 'location', name: 'Lieu', fields: [{ key: 'place', label: 'Lieu', kind: 'ref', refTypes: ['place'] }] },
      ],
      types: [{ id: 'place', name: 'Lieu', aliases: ['endroit', 'location'], icon: 'map-pin', nature: 'place', components: [] }],
    });
  }

  function normalizeSchema(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var relations = normalizeRelationDefs(s.relations);
    syncCustomRelations(relations);
    var seenC = {};
    var components = [];
    (Array.isArray(s.components) ? s.components : []).forEach(function (c) {
      var nc = normalizeComponent(c);
      if (!nc || seenC[nc.id]) return;
      seenC[nc.id] = true;
      components.push(nc);
    });
    if (!seenC[NAMES_COMPONENT]) {
      seenC[NAMES_COMPONENT] = true;
      components.push({ id: NAMES_COMPONENT, name: 'Autres noms', fields: [], builtin: 'aliases' });
    }
    var seenT = {};
    var types = [];
    (Array.isArray(s.types) ? s.types : []).forEach(function (t) {
      var nt = normalizeType(t);
      if (!nt || seenT[nt.id]) return;
      seenT[nt.id] = true;
      nt.components = nt.components.filter(function (cid) {
        return seenC[cid];
      });
      types.push(nt);
    });
    types = types.slice(0, MAX_TYPES);
    var byId = {};
    types.forEach(function (t) {
      byId[t.id] = t;
    });
    // parents must exist, not be the type itself, and never close a loop (the edge that would is dropped)
    types.forEach(function (t) {
      t.parents = t.parents.filter(function (p) {
        return p !== t.id && !!byId[p] && !lineageHas(byId, p, t.id);
      });
    });
    // archetype defaults: only "component.field" paths that exist, coerced like any value
    var shell = { components: components };
    types.forEach(function (t) {
      var clean = {};
      Object.keys(t.defaults).slice(0, MAX_DEFAULTS).forEach(function (path) {
        var fd = fieldOf(shell, path);
        var v = fd ? coerceValue(fd.field, t.defaults[path]) : undefined;
        if (v !== undefined) clean[path] = v;
      });
      if (Object.keys(clean).length) t.defaults = clean;
      else delete t.defaults;
    });
    var out = { version: VERSION, components: components.slice(0, MAX_COMPONENTS), types: types };
    if (relations.length) out.relations = relations;
    var systems = normalizeSystems(s.systems, shell);
    if (systems.length) out.systems = systems;
    return out;
  }

  // ---------------------------------------------------------------- 2a systems (declarative rules)
  var MAX_SYSTEMS = 20;
  var SYSTEM_OPS = ['eq', 'ne', 'gt', 'lt', 'set', 'empty', 'in', 'contains', 'past', 'soon', 'ago', 'overdue'];
  var SYSTEM_LEVELS = ['info', 'warn', 'alert'];

  /**
   * A System is a rule over components: "every entity that carries the components in `on` and meets every
   * condition in `when` gets a finding (and may propose a card)". Data only, so it lives in the schema.
   *   { id, name, on:[componentId], when:[{path, op, value?}], then:{ text, level, card? }, enabled }
   * Conditions whose path names a component outside `on` are dropped; a rule with no condition is dropped.
   */
  function normalizeSystem(raw, schema) {
    if (!raw || typeof raw !== 'object') return null;
    var name = str(raw.name, MAX_NAME);
    var id = slug(raw.id || name);
    if (!id) return null;
    var on = uniqueStrings(raw.on, 6, MAX_NAME).map(slug).filter(Boolean);
    var when = [];
    (Array.isArray(raw.when) ? raw.when : []).slice(0, 6).forEach(function (w) {
      if (!w || typeof w !== 'object' || SYSTEM_OPS.indexOf(w.op) < 0) return;
      var path = String(w.path || '');
      var cid = path.split('.')[0];
      if (path.split('.').length !== 2 || on.indexOf(cid) < 0) return;
      if (schema && schema.components && !fieldOf(schema, path)) return;
      var c = { path: path, op: w.op };
      if (w.value !== undefined && w.value !== null && w.value !== '') {
        c.value = typeof w.value === 'number' || typeof w.value === 'boolean' || Array.isArray(w.value) ? w.value : str(w.value, MAX_ALIAS);
      }
      if (w.op === 'soon' || w.op === 'ago') {
        if (!isFinite(Number(c.value))) return;
        c.value = Math.max(0, Math.min(3650, Math.round(Number(c.value))));
      }
      // a date older than the number of days stored in a sibling field (last care vs frequency)
      if (w.op === 'overdue') {
        var other = String(c.value || '');
        var oc = other.split('.');
        if (oc.length !== 2 || on.indexOf(oc[0]) < 0) return;
        if (schema && schema.components && !fieldOf(schema, other)) return;
        c.value = other;
      }
      when.push(c);
    });
    if (!on.length || !when.length) return null;
    var then = raw.then && typeof raw.then === 'object' ? raw.then : {};
    var out = {
      id: id,
      name: name || id,
      on: on,
      when: when,
      then: { text: str(then.text, MAX_TEXT) || '{name}', level: SYSTEM_LEVELS.indexOf(then.level) >= 0 ? then.level : 'warn' },
      enabled: raw.enabled !== false,
    };
    var card = str(then.card, MAX_NAME);
    if (card) out.then.card = card;
    return out;
  }

  function normalizeSystems(list, schema) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      var ns = normalizeSystem(r, schema);
      if (!ns || seen[ns.id]) return;
      seen[ns.id] = true;
      out.push(ns);
    });
    return out.slice(0, MAX_SYSTEMS);
  }

  function upsertSystem(schema, system) {
    var ns = normalizeSystem(system, schema);
    if (!ns) return schema;
    var next = clone(schema);
    var list = (next.systems || []).filter(function (x) {
      return x.id !== ns.id;
    });
    next.systems = list.concat([ns]);
    return normalizeSchema(next);
  }

  function removeSystem(schema, id) {
    var next = clone(schema);
    next.systems = (next.systems || []).filter(function (x) {
      return x.id !== id;
    });
    return normalizeSchema(next);
  }

  /**
   * User-defined relations ({name, inverse?, category?, symmetric?, up?}): same behaviour as the built-in
   * ones (inverse label, containment when up). Built-in names cannot be redefined.
   */
  function normalizeRelationDefs(list) {
    var out = [];
    var seen = {};
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var name = str(r.name, MAX_ALIAS);
      var key = normKey(name);
      if (!key || seen[key]) return;
      var builtin = matchRelation(name);
      if (builtin && !builtin.def.custom) return;
      var symmetric = r.symmetric === true;
      var inverse = symmetric ? '' : str(r.inverse, MAX_ALIAS);
      var ik = normKey(inverse);
      if (ik && (ik === key || seen[ik])) inverse = '';
      var ib = inverse ? matchRelation(inverse) : null;
      if (ib && !ib.def.custom) inverse = '';
      seen[key] = true;
      if (inverse) seen[normKey(inverse)] = true;
      out.push({
        id: 'custom-' + (slug(name) || 'lien'),
        name: name,
        inverse: inverse,
        category: RELATION_CATEGORIES.indexOf(r.category) >= 0 ? r.category : 'generic',
        symmetric: symmetric,
        up: r.up === true && !symmetric,
      });
    });
    return out.slice(0, MAX_CUSTOM_RELATIONS);
  }

  /** Makes the schema's relations known to the vocabulary (replacing the previous custom ones). */
  function syncCustomRelations(list) {
    for (var i = S.RELATIONS.length - 1; i >= 0; i--) if (S.RELATIONS[i].custom) S.RELATIONS.splice(i, 1);
    list.forEach(function (d) {
      S.RELATIONS.push(Object.assign({ custom: true }, d));
    });
    S.relIndex = null;
  }

  function upsertRelationDef(schema, def) {
    var next = clone(schema);
    var key = normKey(def && def.name);
    var rest = (next.relations || []).filter(function (r) {
      return normKey(r.name) !== key;
    });
    next.relations = rest.concat([def]);
    return normalizeSchema(next);
  }

  function removeRelationDef(schema, id) {
    var next = clone(schema);
    next.relations = (next.relations || []).filter(function (r) {
      return 'custom-' + slug(r.name) !== id;
    });
    return normalizeSchema(next);
  }

  /** Is `target` among the ancestors (or the type itself) of `id`? `byId` maps type ids to types. */
  function lineageHas(byId, id, target) {
    var seen = {};
    var stack = [id];
    while (stack.length) {
      var cur = stack.pop();
      if (cur === target) return true;
      if (seen[cur] || !byId[cur]) continue;
      seen[cur] = true;
      (byId[cur].parents || []).forEach(function (p) {
        stack.push(p);
      });
    }
    return false;
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function upsertComponent(schema, comp) {
    var nc = normalizeComponent(comp);
    if (!nc) return schema;
    var next = clone(schema);
    var i = next.components.findIndex(function (c) {
      return c.id === nc.id;
    });
    if (i >= 0) next.components[i] = nc;
    else next.components.push(nc);
    return normalizeSchema(next);
  }

  function upsertType(schema, type) {
    var nt = normalizeType(type);
    if (!nt) return schema;
    var next = clone(schema);
    var i = next.types.findIndex(function (t) {
      return t.id === nt.id;
    });
    if (i >= 0) next.types[i] = nt;
    else next.types.push(nt);
    return normalizeSchema(next);
  }

  /** Removes a component from the schema and from every type (entity data of it stays dormant). */
  function removeComponent(schema, id) {
    var next = clone(schema);
    if (id === NAMES_COMPONENT) return schema;
    next.components = next.components.filter(function (c) {
      return c.id !== id;
    });
    next.types.forEach(function (t) {
      t.components = t.components.filter(function (c) {
        return c !== id;
      });
    });
    // what required it no longer does, and a rule that read it has nothing left to read
    next.components.forEach(function (c) {
      if (!c.requires) return;
      c.requires = c.requires.filter(function (r) {
        return r !== id;
      });
      if (!c.requires.length) delete c.requires;
    });
    next.systems = (next.systems || []).filter(function (x) {
      return x.on.indexOf(id) < 0;
    });
    return normalizeSchema(next);
  }

  function removeType(schema, id) {
    var next = clone(schema);
    next.types = next.types.filter(function (t) {
      return t.id !== id;
    });
    return normalizeSchema(next);
  }

  /**
   * Components that only make sense for some natures (a Personne component on an event is nonsense: the person
   * is another entity linked to the event). Keyed by component id so it also covers schemas saved earlier.
   * Components of a type's own list are never filtered; this only guards the ones added to an entity.
   */
  var COMPONENT_NATURES = {
    personne: ['agent'],
    emploi: ['agent'],
    vivant: ['living'],
    organisation: ['social'],
    geographie: ['place'],
    pays: ['place'],
    espace: ['place'],
    construction: ['place', 'matter'],
  };

  /** May the entity carry the component on its own? Untyped entities and components without a rule always may. */
  function componentFits(schema, entity, cid) {
    var allowed = COMPONENT_NATURES[cid];
    if (!allowed) return true;
    var natures = naturesOf(schema, entity);
    if (!natures.length) return true;
    return natures.some(function (n) {
      return allowed.indexOf(n) >= 0;
    });
  }

  /** Component ids an entity carries: union over its types, in type order. */
  function componentIdsOf(schema, entity) {
    var out = [];
    (entity.types || []).forEach(function (tid) {
      typeLineage(schema, tid).forEach(function (t) {
        t.components.forEach(function (cid) {
          if (out.indexOf(cid) < 0) out.push(cid);
        });
      });
    });
    // components the entity added on its own, beyond its archetypes
    (entity.components || []).forEach(function (cid) {
      if (out.indexOf(cid) < 0 && findById(schema.components, cid) && componentFits(schema, entity, cid)) out.push(cid);
    });
    // a component pulls in the ones it requires (Contenant needs Matière), transitively and without loops
    for (var i = 0; i < out.length; i++) {
      var comp = findById(schema.components, out[i]);
      ((comp && comp.requires) || []).forEach(function (rid) {
        if (out.indexOf(rid) < 0 && findById(schema.components, rid)) out.push(rid);
      });
    }
    return out;
  }

  /**
   * Default values the archetypes give ({component:{field:value}}): parent archetypes first, so a child
   * overrides its parent, and later archetypes of the entity override earlier ones.
   */
  function archetypeDefaults(schema, typeIds) {
    var data = {};
    (typeIds || []).forEach(function (tid) {
      typeLineage(schema, tid).forEach(function (t) {
        Object.keys(t.defaults || {}).forEach(function (path) {
          var p = path.split('.');
          data[p[0]] = data[p[0]] || {};
          data[p[0]][p[1]] = t.defaults[path];
        });
      });
    });
    return data;
  }

  // ---------------------------------------------------------------- 2b natures and type lineage
  function natureById(id) {
    for (var i = 0; i < NATURES.length; i++) if (NATURES[i].id === id) return NATURES[i];
    return null;
  }

  /** A type and its ancestors, ancestors first (a City: Place, then City). Loops cannot occur (normalizeSchema). */
  function typeLineage(schema, typeId) {
    var out = [];
    var seen = {};
    (function visit(id) {
      if (seen[id]) return;
      seen[id] = true;
      var t = findById(schema.types, id);
      if (!t) return;
      (t.parents || []).forEach(visit);
      out.push(t);
    })(typeId);
    return out;
  }

  /** Every type id an entity answers to: its types and all their ancestors. */
  function typeClosure(schema, typeIds) {
    var out = [];
    (typeIds || []).forEach(function (tid) {
      typeLineage(schema, tid).forEach(function (t) {
        if (out.indexOf(t.id) < 0) out.push(t.id);
      });
    });
    return out;
  }

  /** Is the entity (or list of type ids) of type `typeId`, directly or through a parent type? */
  function isA(schema, entityOrTypes, typeId) {
    var ids = Array.isArray(entityOrTypes) ? entityOrTypes : (entityOrTypes && entityOrTypes.types) || [];
    return typeClosure(schema, ids).indexOf(typeId) >= 0;
  }

  /** Nature of a type: its own, else the nearest ancestor's ('' when none). */
  function natureOfType(schema, typeId) {
    var line = typeLineage(schema, typeId);
    for (var i = line.length - 1; i >= 0; i--) if (line[i].nature) return line[i].nature;
    return '';
  }

  /** Natures an entity has through its types (a Building is a place AND matter), without duplicates. */
  function naturesOf(schema, entity) {
    var out = [];
    typeClosure(schema, (entity && entity.types) || []).forEach(function (tid) {
      var t = findById(schema.types, tid);
      if (t && t.nature && out.indexOf(t.nature) < 0) out.push(t.nature);
    });
    return out;
  }

  function realmOf(natureId) {
    var n = natureById(natureId);
    return n ? n.realm : '';
  }

  /** Does the entity have a body, a place or a date (as opposed to being a convention or an idea)? */
  function isMaterial(schema, entity) {
    return naturesOf(schema, entity).some(function (n) {
      return realmOf(n) === 'material';
    });
  }

  /** Types that descend from `typeId` (itself excluded). */
  function subtypesOf(schema, typeId) {
    return schema.types.filter(function (t) {
      return t.id !== typeId && typeClosure(schema, [t.id]).indexOf(typeId) >= 0;
    });
  }

  function fieldOf(schema, path) {
    var p = String(path || '').split('.');
    if (p.length !== 2) return null;
    var c = findById(schema.components, p[0]);
    if (!c) return null;
    var f = null;
    c.fields.forEach(function (x) {
      if (x.key === p[1]) f = x;
    });
    return f ? { component: c, field: f } : null;
  }

  // ---------------------------------------------------------------- 3 entities and values
  /** Coerces a raw value to what the field kind stores; returns undefined for "no value". */
  function coerceValue(field, v) {
    if (v === undefined || v === null || v === '') return undefined;
    switch (field.kind) {
      case 'number': {
        var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
        return isFinite(n) ? n : undefined;
      }
      case 'level': {
        var lv = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
        if (!isFinite(lv)) return undefined;
        var floor = isFinite(field.min) ? field.min : 0;
        lv = Math.max(floor, lv);
        if (!field.maxField && isFinite(field.max)) lv = Math.min(field.max, lv);
        return lv;
      }
      case 'bool':
        return v === true || /^(true|1|oui|yes|vrai)$/i.test(String(v));
      case 'date': {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
        return m ? m[1] + '-' + m[2] + '-' + m[3] : undefined;
      }
      case 'choice': {
        var key = normKey(v);
        var hit = (field.options || []).filter(function (o) {
          return normKey(o) === key;
        })[0];
        return hit;
      }
      case 'multi': {
        var picked = [];
        (Array.isArray(v) ? v : [v]).forEach(function (x) {
          var k = normKey(x);
          var opt = (field.options || []).filter(function (o) {
            return normKey(o) === k;
          })[0];
          if (opt && picked.indexOf(opt) < 0) picked.push(opt);
        });
        return picked.length ? picked : undefined;
      }
      case 'longtext': {
        var long = String(v).replace(/\r\n?/g, '\n').trim();
        return long ? long.slice(0, MAX_LONGTEXT) : undefined;
      }
      case 'geo': {
        // "45.5017, -73.5673" (also ";" or a space as separator): latitude then longitude, in range
        var g = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(String(v));
        if (!g) return undefined;
        var lat = parseFloat(g[1].replace(',', '.'));
        var lon = parseFloat(g[2].replace(',', '.'));
        if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return undefined;
        return Number(lat.toFixed(5)) + ', ' + Number(lon.toFixed(5));
      }
      case 'url': {
        // only web links are kept (never javascript: or data: ones, the value ends up in href)
        var u = String(v).trim();
        if (/^https?:\/\/[^\s]+$/i.test(u)) return u.slice(0, MAX_URL);
        if (/^[\w-]+(\.[\w-]+)+(\/[^\s]*)?$/.test(u)) return ('https://' + u).slice(0, MAX_URL);
        return undefined;
      }
      case 'ref':
        return typeof v === 'string' && v ? v : undefined;
      case 'refs': {
        var arr = (Array.isArray(v) ? v : [v]).filter(function (x) {
          return typeof x === 'string' && x;
        });
        return arr.length ? arr.slice(0, MAX_RELATIONS) : undefined;
      }
      default:
        return str(v, MAX_TEXT) || undefined;
    }
  }

  function normalizeHistoryEntry(h) {
    if (!h || typeof h !== 'object' || !h.op) return null;
    var out = { id: String(h.id || newId('h_')), ts: String(h.ts || ''), op: String(h.op), path: str(h.path, 80) };
    if (h.before !== undefined) out.before = h.before;
    if (h.after !== undefined) out.after = h.after;
    if (h.undoOf) out.undoOf = String(h.undoOf);
    return out;
  }

  function normalizeEntity(raw, schema) {
    if (!raw || typeof raw !== 'object') return null;
    var name = str(raw.name, MAX_NAME);
    if (!name || !raw.id) return null;
    var types = uniqueStrings(raw.types, MAX_TYPES, MAX_NAME).map(slug).filter(Boolean);
    if (schema) {
      types = types.filter(function (t) {
        return !!findById(schema.types, t);
      });
    }
    var extra = uniqueStrings(raw.components, MAX_COMPONENTS, MAX_NAME).map(slug).filter(function (c) {
      return !!c && (!schema || !!findById(schema.components, c));
    });
    var aliasList = uniqueStrings(raw.aliases, MAX_ALIASES, MAX_ALIAS);
    // an entity that already has other names carries the "Autres noms" component
    if (aliasList.length && extra.indexOf(NAMES_COMPONENT) < 0 && (!schema || !!findById(schema.components, NAMES_COMPONENT))) extra.push(NAMES_COMPONENT);
    var data = {};
    var src = raw.data && typeof raw.data === 'object' ? raw.data : {};
    Object.keys(src).forEach(function (cid) {
      var comp = schema ? findById(schema.components, cid) : null;
      if (schema && !comp) return;
      var vals = {};
      Object.keys(src[cid] || {}).forEach(function (key) {
        var field = comp ? fieldOf(schema, cid + '.' + key) : null;
        if (comp && !field) return;
        var v = field ? coerceValue(field.field, src[cid][key]) : src[cid][key];
        if (v !== undefined) vals[key] = v;
      });
      if (Object.keys(vals).length) data[cid] = vals;
    });
    var relations = [];
    (Array.isArray(raw.relations) ? raw.relations : []).forEach(function (r) {
      if (!r || typeof r.to !== 'string' || !r.to) return;
      var type = str(r.type, MAX_REL_TYPE) || 'lié à';
      var role = str(r.role, MAX_ROLE);
      if (
        relations.some(function (x) {
          return x.to === r.to && normKey(x.type) === normKey(type) && normKey(x.role || '') === normKey(role);
        })
      ) {
        return;
      }
      relations.push(role ? { type: type, to: r.to, role: role } : { type: type, to: r.to });
    });
    var history = (Array.isArray(raw.history) ? raw.history : [])
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .slice(-MAX_HISTORY);
    var source = null;
    if (raw.source && typeof raw.source === 'object' && (raw.source.kind === 'people' || raw.source.kind === 'places') && raw.source.id) {
      source = { kind: raw.source.kind, id: String(raw.source.id).slice(0, 80) };
      if (raw.source.gone === true) source.gone = true;
    }
    var out = {
      id: String(raw.id),
      name: name,
      base: raw.base && String(raw.base) !== String(raw.id) ? String(raw.base) : '',
      aliases: aliasList,
      types: types,
      components: extra,
      data: data,
      relations: relations.slice(0, MAX_RELATIONS),
      history: history,
      createdAt: String(raw.createdAt || ''),
      updatedAt: String(raw.updatedAt || ''),
    };
    if (source) out.source = source; // link to a People / Places record (see entities-directories.js)
    return out;
  }

  function getValue(entity, path) {
    var p = String(path || '').split('.');
    var c = entity && entity.data && entity.data[p[0]];
    return c ? c[p[1]] : undefined;
  }

  // ---- archetype inheritance
  /** The entity, then its archetype, then the archetype's archetype... (cycles and missing bases stop it). */
  function chainOf(entities, entity) {
    var out = [entity];
    var seen = {};
    seen[entity.id] = true;
    var cur = entity;
    while (cur.base && !seen[cur.base] && out.length < 12) {
      var b = findById(entities, cur.base);
      if (!b) break;
      seen[b.id] = true;
      out.push(b);
      cur = b;
    }
    return out;
  }

  /** Own overrides laid over the archetype chain: what the entity "has" once inheritance is applied. */
  function effectiveData(entities, entity, schema) {
    var chain = chainOf(entities, entity);
    // with a schema, the archetypes' default values sit underneath everything else
    var data = schema ? archetypeDefaults(schema, entity.types) : {};
    Object.keys(data).forEach(function (cid) {
      data[cid] = Object.assign({}, data[cid]);
    });
    for (var i = chain.length - 1; i >= 0; i--) {
      Object.keys(chain[i].data || {}).forEach(function (cid) {
        data[cid] = Object.assign({}, data[cid], chain[i].data[cid]);
      });
    }
    return data;
  }

  function effectiveValue(entities, entity, path, schema) {
    var p = String(path || '').split('.');
    var c = effectiveData(entities, entity, schema)[p[0]];
    return c ? c[p[1]] : undefined;
  }

  /**
   * Where a field's value comes from: 'own' (override), a model entity's id (inherited), 'archetype' (the
   * archetype's default, needs `schema`), or '' (no value anywhere).
   */
  function originOf(entities, entity, path, schema) {
    var chain = chainOf(entities, entity);
    for (var i = 0; i < chain.length; i++) {
      if (getValue(chain[i], path) !== undefined) return i === 0 ? 'own' : chain[i].id;
    }
    if (schema) {
      var d = archetypeDefaults(schema, entity.types);
      var p = path.split('.');
      if (d[p[0]] && d[p[0]][p[1]] !== undefined) return 'archetype';
    }
    return '';
  }

  /** Entities with inheritance applied (same ids; data merged). Cheap when nobody has a base. */
  function flatten(entities, schema) {
    var hasDefaults =
      !!schema &&
      schema.types.some(function (t) {
        return t.defaults;
      });
    if (
      !hasDefaults &&
      !entities.some(function (e) {
        return e.base;
      })
    ) {
      return entities;
    }
    return entities.map(function (e) {
      return e.base || hasDefaults ? Object.assign({}, e, { data: effectiveData(entities, e, schema) }) : e;
    });
  }

  /** Entities whose archetype is id (direct variants). */
  function variantsOf(entities, id) {
    return entities.filter(function (e) {
      return e.base === id;
    });
  }

  /** Would making baseId the archetype of id create a loop? */
  function wouldCycle(entities, id, baseId) {
    var seen = {};
    var cur = baseId;
    while (cur && !seen[cur]) {
      if (cur === id) return true;
      seen[cur] = true;
      var e = findById(entities, cur);
      cur = e ? e.base : '';
    }
    return false;
  }

  /** Display text of a value (refs resolve to entity names through `entities`). */
  function formatValue(field, value, entities) {
    if (value === undefined || value === null) return '';
    function nameOf(id) {
      var e = findById(entities || [], id);
      return e ? e.name : '?';
    }
    if (field.kind === 'ref') return nameOf(value);
    if (field.kind === 'refs') return value.map(nameOf).join(', ');
    if (field.kind === 'multi') return value.join(', ');
    if (field.kind === 'bool') return value ? 'oui' : 'non';
    if ((field.kind === 'number' || field.kind === 'level') && field.unit) return value + ' ' + field.unit;
    return String(value);
  }

  // exports
  S.COMPONENT_NATURES = COMPONENT_NATURES;
  S.FIELD_KINDS = FIELD_KINDS;
  S.MAX_ALIAS = MAX_ALIAS;
  S.MAX_ALIASES = MAX_ALIASES;
  S.MAX_CHOICES = MAX_CHOICES;
  S.MAX_COMPONENTS = MAX_COMPONENTS;
  S.MAX_CUSTOM_RELATIONS = MAX_CUSTOM_RELATIONS;
  S.MAX_DEFAULTS = MAX_DEFAULTS;
  S.MAX_DESCRIPTION = MAX_DESCRIPTION;
  S.MAX_ENTITIES = MAX_ENTITIES;
  S.MAX_FIELDS = MAX_FIELDS;
  S.MAX_HISTORY = MAX_HISTORY;
  S.MAX_LONGTEXT = MAX_LONGTEXT;
  S.MAX_NAME = MAX_NAME;
  S.MAX_PROMPT_CHARS = MAX_PROMPT_CHARS;
  S.MAX_PROMPT_MATCHES = MAX_PROMPT_MATCHES;
  S.MAX_RELATIONS = MAX_RELATIONS;
  S.MAX_REL_TYPE = MAX_REL_TYPE;
  S.MAX_ROLE = MAX_ROLE;
  S.MAX_SCHEMA_CHARS = MAX_SCHEMA_CHARS;
  S.MAX_SYSTEMS = MAX_SYSTEMS;
  S.MAX_TEXT = MAX_TEXT;
  S.MAX_TYPES = MAX_TYPES;
  S.MAX_UNIT = MAX_UNIT;
  S.MAX_URL = MAX_URL;
  S.NAMES_COMPONENT = NAMES_COMPONENT;
  S.NATURES = NATURES;
  S.RELATION_CATEGORIES = RELATION_CATEGORIES;
  S.SYSTEM_LEVELS = SYSTEM_LEVELS;
  S.SYSTEM_OPS = SYSTEM_OPS;
  S.VERSION = VERSION;
  S.archetypeDefaults = archetypeDefaults;
  S.chainOf = chainOf;
  S.clone = clone;
  S.coerceValue = coerceValue;
  S.componentFits = componentFits;
  S.componentIdsOf = componentIdsOf;
  S.defaultSchema = defaultSchema;
  S.effectiveData = effectiveData;
  S.effectiveValue = effectiveValue;
  S.escapeRegExp = escapeRegExp;
  S.fieldOf = fieldOf;
  S.findById = findById;
  S.flatten = flatten;
  S.foldAccents = foldAccents;
  S.formatValue = formatValue;
  S.getValue = getValue;
  S.hasPhrase = hasPhrase;
  S.idCounter = idCounter;
  S.isA = isA;
  S.isMaterial = isMaterial;
  S.lineageHas = lineageHas;
  S.natureById = natureById;
  S.natureOfType = natureOfType;
  S.naturesOf = naturesOf;
  S.newId = newId;
  S.normKey = normKey;
  S.normalizeComponent = normalizeComponent;
  S.normalizeEntity = normalizeEntity;
  S.normalizeField = normalizeField;
  S.normalizeHistoryEntry = normalizeHistoryEntry;
  S.normalizeRelationDefs = normalizeRelationDefs;
  S.normalizeSchema = normalizeSchema;
  S.normalizeSystem = normalizeSystem;
  S.normalizeSystems = normalizeSystems;
  S.normalizeType = normalizeType;
  S.nowIso = nowIso;
  S.originOf = originOf;
  S.realmOf = realmOf;
  S.removeComponent = removeComponent;
  S.removeRelationDef = removeRelationDef;
  S.removeSystem = removeSystem;
  S.removeType = removeType;
  S.singular = singular;
  S.slug = slug;
  S.stem = stem;
  S.str = str;
  S.subtypesOf = subtypesOf;
  S.syncCustomRelations = syncCustomRelations;
  S.typeClosure = typeClosure;
  S.typeLineage = typeLineage;
  S.uniqueStrings = uniqueStrings;
  S.upsertComponent = upsertComponent;
  S.upsertRelationDef = upsertRelationDef;
  S.upsertSystem = upsertSystem;
  S.upsertType = upsertType;
  S.variantsOf = variantsOf;
  S.wouldCycle = wouldCycle;
})(typeof window !== 'undefined' ? window : this);
