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
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 1 constants / text helpers
  var VERSION = 1;
  var MAX_NAME = 80;
  var MAX_ALIAS = 40;
  var MAX_ALIASES = 12;
  var MAX_TEXT = 500;
  var MAX_COMPONENTS = 40;
  var MAX_FIELDS = 20;
  var MAX_TYPES = 60;
  var MAX_ENTITIES = 500;
  var MAX_RELATIONS = 30;
  var MAX_REL_TYPE = 40;
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

  /** "plantes" -> "plante", "plants" -> "plant": crude FR/EN plural folding, applied to both sides. */
  function singular(word) {
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
      if (f.rel && relationById(f.rel)) out.rel = String(f.rel);
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
  var SYSTEM_OPS = ['eq', 'ne', 'gt', 'lt', 'set', 'empty', 'in', 'contains', 'past', 'soon', 'ago'];
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
    for (var i = RELATIONS.length - 1; i >= 0; i--) if (RELATIONS[i].custom) RELATIONS.splice(i, 1);
    list.forEach(function (d) {
      RELATIONS.push(Object.assign({ custom: true }, d));
    });
    relIndex = null;
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
      if (out.indexOf(cid) < 0 && findById(schema.components, cid)) out.push(cid);
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
      if (
        relations.some(function (x) {
          return x.to === r.to && normKey(x.type) === normKey(type);
        })
      ) {
        return;
      }
      relations.push({ type: type, to: r.to });
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

  /**
   * The range of a gauge field: { min, max, known, unit }. The maximum is the value of the sibling field named by
   * `maxField` (the capacity), else the field's own `max`, else 100 (`known` is false: the scale is only a guess).
   * `read(key)` gives the value of a sibling field of the same component.
   */
  function levelBounds(field, read) {
    var min = isFinite(field.min) ? field.min : 0;
    var max = NaN;
    if (field.maxField && typeof read === 'function') {
      var v = read(field.maxField);
      var n = typeof v === 'number' ? v : parseFloat(v);
      if (isFinite(n) && n > min) max = n;
    }
    if (!isFinite(max) && isFinite(field.max)) max = field.max;
    var known = isFinite(max);
    return { min: min, max: known ? max : 100, known: known, unit: field.unit || (known ? '' : '%') };
  }

  // ---------------------------------------------------------------- 4 mutations
  function pushHistory(entity, entry, opts) {
    var e = normalizeHistoryEntry(Object.assign({ id: newId('h_'), ts: nowIso(opts) }, entry));
    entity.history = (entity.history || []).concat([e]).slice(-MAX_HISTORY);
    entity.updatedAt = e.ts;
    return e;
  }

  /** @returns {object} the new entity (history starts with a "create" entry) */
  function createEntity(schema, init, opts) {
    opts = opts || {};
    var name = str(init && init.name, MAX_NAME);
    if (!name) throw new Error('name-required');
    var now = nowIso(opts);
    var entity = normalizeEntity(
      {
        id: (init && init.id) || newId('e_'),
        name: name,
        base: init && init.base,
        aliases: init && init.aliases,
        types: init && init.types,
        components: init && init.components,
        data: init && init.data,
        relations: init && init.relations,
        createdAt: now,
        updatedAt: now,
        history: [],
      },
      schema
    );
    pushHistory(entity, { op: 'create', after: name }, opts);
    return entity;
  }

  function renameEntity(entity, name, opts) {
    var n = str(name, MAX_NAME);
    if (!n || n === entity.name) return entity;
    var next = clone(entity);
    pushHistory(next, { op: 'rename', before: entity.name, after: n }, opts);
    next.name = n;
    return next;
  }

  function setAliases(entity, aliases, opts) {
    var list = uniqueStrings(aliases, MAX_ALIASES, MAX_ALIAS);
    if (JSON.stringify(list) === JSON.stringify(entity.aliases)) return entity;
    var next = clone(entity);
    pushHistory(next, { op: 'aliases', before: entity.aliases, after: list }, opts);
    next.aliases = list;
    if (list.length && (next.components || []).indexOf(NAMES_COMPONENT) < 0) next.components = (next.components || []).concat([NAMES_COMPONENT]);
    return next;
  }

  function setTypes(schema, entity, types, opts) {
    var list = uniqueStrings(types, MAX_TYPES, MAX_NAME)
      .map(slug)
      .filter(function (t) {
        return !!findById(schema.types, t);
      });
    if (JSON.stringify(list) === JSON.stringify(entity.types)) return entity;
    var next = clone(entity);
    pushHistory(next, { op: 'types', before: entity.types, after: list }, opts);
    next.types = list;
    return next;
  }

  /** The extra components an entity carries beyond its archetypes (what the user added to it). */
  function setComponents(schema, entity, ids, opts) {
    var list = uniqueStrings(ids, MAX_COMPONENTS, MAX_NAME)
      .map(slug)
      .filter(function (c) {
        return !!findById(schema.components, c);
      });
    if (JSON.stringify(list) === JSON.stringify(entity.components || [])) return entity;
    var next = clone(entity);
    pushHistory(next, { op: 'components', before: entity.components || [], after: list }, opts);
    next.components = list;
    return next;
  }

  /** Sets (or clears with undefined) the default of "component.field" on an archetype. Returns the new schema. */
  function setTypeDefault(schema, typeId, path, value) {
    var t = findById(schema.types, typeId);
    if (!t) throw new Error('unknown-type');
    var fd = fieldOf(schema, path);
    if (!fd) throw new Error('unknown-field:' + path);
    var v = coerceValue(fd.field, value);
    var defaults = Object.assign({}, t.defaults || {});
    if (v === undefined) delete defaults[path];
    else defaults[path] = v;
    return upsertType(schema, Object.assign({}, t, { defaults: defaults }));
  }

  /** Sets (or clears, with undefined/''/null) one "component.field" value. Unknown paths throw. */
  function setValue(schema, entity, path, value, opts) {
    var f = fieldOf(schema, path);
    if (!f) throw new Error('unknown-field:' + path);
    var v = coerceValue(f.field, value);
    var before = getValue(entity, path);
    if (JSON.stringify(v) === JSON.stringify(before)) return entity;
    var next = clone(entity);
    var p = path.split('.');
    next.data = next.data || {};
    next.data[p[0]] = next.data[p[0]] || {};
    if (v === undefined) {
      delete next.data[p[0]][p[1]];
      if (!Object.keys(next.data[p[0]]).length) delete next.data[p[0]];
    } else {
      next.data[p[0]][p[1]] = v;
    }
    pushHistory(next, { op: 'set', path: path, before: before, after: v }, opts);
    return next;
  }

  /**
   * A variant of id: same types, inherits every value from it and stores only its own changes
   * (opts.detach = a plain independent copy: values and relations copied, no link to the original).
   */
  function cloneEntity(schema, entities, id, opts) {
    opts = opts || {};
    var src = findById(entities, id);
    if (!src) throw new Error('unknown-entity');
    var base = opts.name ? str(opts.name, MAX_NAME) : str(src.name + ' (copie)', MAX_NAME);
    var name = base;
    var n = 1;
    while (
      entities.some(function (e) {
        return e.name === name;
      })
    ) {
      n += 1;
      name = str(base + ' ' + n, MAX_NAME);
    }
    return createEntity(
      schema,
      opts.detach
        ? { name: name, types: src.types, data: effectiveData(entities, src, schema), relations: src.relations, components: src.components }
        : { name: name, types: src.types, components: src.components, base: src.id },
      opts
    );
  }

  /** Sets (or clears with '') the archetype. Own overrides are kept. Throws on a loop or unknown entity. */
  function setBase(entities, entity, baseId, opts) {
    var b = baseId || '';
    if (b === (entity.base || '')) return entity;
    if (b) {
      if (!findById(entities, b)) throw new Error('unknown-entity');
      if (wouldCycle(entities, entity.id, b)) throw new Error('base-cycle');
    }
    var next = clone(entity);
    pushHistory(next, { op: 'base', before: entity.base || '', after: b }, opts);
    next.base = b;
    return next;
  }

  /** Cuts the link to the archetype, keeping what the entity currently has (inherited values become its own). */
  function detachEntity(entities, entity, opts) {
    if (!entity.base) return entity;
    var next = clone(entity);
    pushHistory(next, { op: 'base', before: entity.base, after: '' }, opts);
    next.data = effectiveData(entities, entity);
    next.base = '';
    return next;
  }

  /** Can this history entry be undone from the entity alone? (base changes need the other entities.) */
  function isRevertable(entry) {
    return !!entry && !entry.undoOf && ['set', 'rename', 'aliases', 'types', 'components', 'relate', 'unrelate'].indexOf(entry.op) >= 0;
  }

  // ---------------------------------------------------------------- 5 relations
  function addRelation(entity, type, toId, opts) {
    var t = str(type, MAX_REL_TYPE) || 'lié à';
    if (!toId || toId === entity.id) return entity;
    var exists = entity.relations.some(function (r) {
      return r.to === toId && normKey(r.type) === normKey(t);
    });
    if (exists || entity.relations.length >= MAX_RELATIONS) return entity;
    var next = clone(entity);
    next.relations.push({ type: t, to: toId });
    pushHistory(next, { op: 'relate', after: { type: t, to: toId } }, opts);
    return next;
  }

  function removeRelation(entity, type, toId, opts) {
    var hit = entity.relations.filter(function (r) {
      return r.to === toId && normKey(r.type) === normKey(type);
    })[0];
    if (!hit) return entity;
    var next = clone(entity);
    next.relations = next.relations.filter(function (r) {
      return !(r.to === hit.to && r.type === hit.type);
    });
    pushHistory(next, { op: 'unrelate', before: { type: hit.type, to: hit.to } }, opts);
    return next;
  }

  /** Every link touching `id`: outgoing relations, then incoming relations and ref fields. */
  function linksOf(schema, rawEntities, id) {
    var out = [];
    var entities = flatten(rawEntities, schema);
    var self = findById(entities, id);
    if (!self) return out;
    self.relations.forEach(function (r) {
      out.push({ dir: 'out', via: r.type, other: r.to });
    });
    entities.forEach(function (e) {
      if (e.id === id) return;
      if (e.base === id) out.push({ dir: 'in', via: 'variante de', other: e.id });
      e.relations.forEach(function (r) {
        if (r.to === id) out.push({ dir: 'in', via: r.type, inverse: inverseLabel(r.type), other: e.id });
      });
      Object.keys(e.data).forEach(function (cid) {
        Object.keys(e.data[cid]).forEach(function (key) {
          var f = fieldOf(schema, cid + '.' + key);
          var v = e.data[cid][key];
          if (!f) return;
          if ((f.field.kind === 'ref' && v === id) || (f.field.kind === 'refs' && v.indexOf(id) >= 0)) {
            out.push({ dir: 'in', via: f.component.name + ' / ' + f.field.label, other: e.id });
          }
        });
      });
    });
    return out;
  }

  /** Does `entity` point at `id` through a relation or a ref field? */
  function refersTo(schema, entity, id) {
    if (
      entity.relations.some(function (r) {
        return r.to === id;
      })
    ) {
      return true;
    }
    return Object.keys(entity.data).some(function (cid) {
      return Object.keys(entity.data[cid]).some(function (key) {
        var f = fieldOf(schema, cid + '.' + key);
        var v = entity.data[cid][key];
        return !!f && ((f.field.kind === 'ref' && v === id) || (f.field.kind === 'refs' && v.indexOf(id) >= 0));
      });
    });
  }

  /**
   * Removes an entity and every reference to it (ref fields cleared, relations dropped, each recorded
   * in the history of the entity that pointed at it).
   * @returns {object[]} the new entity list
   */
  function deleteEntity(schema, entities, id, opts) {
    var rest = entities.filter(function (e) {
      return e.id !== id;
    });
    return rest.map(function (e) {
      var cur = e;
      // variants of the deleted archetype keep what they inherited (it becomes their own)
      if (cur.base === id) cur = detachEntity(entities, cur, opts);
      cur.relations.forEach(function (r) {
        if (r.to === id) cur = removeRelation(cur, r.type, id, opts);
      });
      Object.keys(cur.data).forEach(function (cid) {
        Object.keys(cur.data[cid]).forEach(function (key) {
          var f = fieldOf(schema, cid + '.' + key);
          var v = cur.data[cid] && cur.data[cid][key];
          if (!f) return;
          if (f.field.kind === 'ref' && v === id) cur = setValue(schema, cur, cid + '.' + key, undefined, opts);
          if (f.field.kind === 'refs' && v && v.indexOf(id) >= 0) {
            cur = setValue(
              schema,
              cur,
              cid + '.' + key,
              v.filter(function (x) {
                return x !== id;
              }),
              opts
            );
          }
        });
      });
      return cur;
    });
  }

  // ---------------------------------------------------------------- 5b relation vocabulary, containment, grounding
  /**
   * Built-in relation vocabulary. A relation stored on an entity is still just {type, to} (free text is
   * allowed); when `type` matches a name, inverse or alias below, the model knows what it means:
   *   category   spatial | mereological | composition | production | social | taxonomic | grounding |
   *              causal | temporal | conceptual | generic
   *   up         "A <name> B" makes B a container/whole of A: located in + part of build the containment
   *              hierarchy (transitive: a plant in the Salon is in the Hôtel de Ville, in Montréal)
   *   from / to  natures usually found on each side (a mismatch is a warning, not an error)
   */
  var RELATIONS = [
    { id: 'located-in', name: 'situé dans', inverse: 'abrite', category: 'spatial', up: true, from: ['matter', 'living', 'agent', 'place', 'event', 'social'], to: ['place'], aliases: ['situé à', 'localisé dans', 'located in'], inverseAliases: ['héberge', 'houses'] },
    { id: 'part-of', name: 'fait partie de', inverse: 'contient', category: 'mereological', up: true, aliases: ['partie de', 'part of'], inverseAliases: ['comprend', 'has part', 'contains'] },
    { id: 'lives-in', name: 'habite à', inverse: 'est habité par', category: 'spatial', from: ['agent', 'living'], to: ['place'], aliases: ['habite dans', 'lives in'] },
    { id: 'made-of', name: 'fait de', inverse: 'compose', category: 'composition', from: ['matter', 'living'], to: ['matter', 'living'], aliases: ['composé de', 'made of', 'contient comme ingrédient'] },
    { id: 'made-by', name: 'fabriqué par', inverse: 'a fabriqué', category: 'production', to: ['agent', 'social'], aliases: ['créé par', 'produit par', 'made by'] },
    { id: 'owned-by', name: 'appartient à', inverse: 'possède', category: 'social', to: ['agent', 'social'], aliases: ['propriété de', 'owned by'] },
    { id: 'member-of', name: 'membre de', inverse: 'a pour membre', category: 'social', from: ['agent', 'social'], to: ['social', 'agent'], aliases: ['member of'] },
    { id: 'works-for', name: 'travaille pour', inverse: 'emploie', category: 'social', from: ['agent'], to: ['social', 'agent'], aliases: ['works for', 'travaille chez'], inverseAliases: ['employs'] },
    { id: 'instance-of', name: 'instance de', inverse: 'a pour instance', category: 'taxonomic', to: ['abstract', 'social'], aliases: ['exemple de', 'instance of'], inverseAliases: ['a pour exemple'] },
    { id: 'grounded-in', name: 'ancré dans', inverse: 'ancre', category: 'grounding', from: ['abstract', 'social'], aliases: ['basé sur', 'grounded in'] },
    { id: 'expressed-by', name: 'exprimé par', inverse: 'exprime', category: 'grounding', from: ['abstract', 'social'], aliases: ['incarné par', 'illustré par', 'expressed by'] },
    { id: 'kind-of', name: 'sorte de', inverse: 'a pour sorte', category: 'taxonomic', from: ['abstract', 'social'], to: ['abstract', 'social'], aliases: ['kind of', 'est un'] },
    { id: 'causes', name: 'cause', inverse: 'est causé par', category: 'causal', aliases: ['provoque', 'causes'] },
    { id: 'depends-on', name: 'dépend de', inverse: 'est requis par', category: 'causal', aliases: ['requiert', 'depends on'] },
    { id: 'precedes', name: 'précède', inverse: 'suit', category: 'temporal', aliases: ['avant', 'precedes'] },
    { id: 'opposes', name: 's’oppose à', category: 'conceptual', symmetric: true, from: ['abstract', 'social'], to: ['abstract', 'social'], aliases: ['contraire de', 'opposes'] },
    { id: 'similar-to', name: 'ressemble à', category: 'conceptual', symmetric: true, aliases: ['similaire à', 'similar to'] },
    { id: 'represents', name: 'représente', inverse: 'est représenté par', category: 'conceptual', aliases: ['symbolise', 'represents'] },
    { id: 'related', name: 'lié à', category: 'generic', symmetric: true, aliases: ['related to', 'relié à'] },
  ];
  var relIndex = null;

  function relationById(id) {
    for (var i = 0; i < RELATIONS.length; i++) if (RELATIONS[i].id === id) return RELATIONS[i];
    return null;
  }

  function relationIndex() {
    if (relIndex) return relIndex;
    relIndex = {};
    function put(label, def, dir) {
      var k = normKey(label);
      if (k && !relIndex[k]) relIndex[k] = { def: def, dir: dir };
    }
    RELATIONS.forEach(function (d) {
      var fwd = d.symmetric ? 'sym' : 'fwd';
      put(d.name, d, fwd);
      (d.aliases || []).forEach(function (a) {
        put(a, d, fwd);
      });
      if (d.inverse) put(d.inverse, d, 'inv');
      (d.inverseAliases || []).forEach(function (a) {
        put(a, d, 'inv');
      });
    });
    return relIndex;
  }

  /** @returns {{def:object, dir:'fwd'|'inv'|'sym'}|null} what a relation label means (null = free text) */
  function matchRelation(label) {
    return relationIndex()[normKey(label)] || null;
  }

  /** The same link read from the other end: "contient" -> "fait partie de"; free text and symmetric stay. */
  function inverseLabel(type) {
    var m = matchRelation(type);
    if (!m || m.def.symmetric) return m ? m.def.name : type;
    return m.dir === 'inv' ? m.def.name : m.def.inverse;
  }

  /**
   * Relations that make sense for entities of these natures, most specific first (the generic "lié à"
   * always last), as [{id, name, inverse, category}]. No natures known: the whole vocabulary.
   */
  function relationsFor(natures) {
    var ns = natures || [];
    var specific = [];
    var generic = [];
    RELATIONS.forEach(function (d) {
      if (d.id === 'related') return;
      if (!d.from) {
        generic.push(d);
      } else if (!ns.length || d.from.some(function (n) { return ns.indexOf(n) >= 0; })) {
        specific.push(d);
      }
    });
    return specific.concat(generic).concat([relationById('related')]);
  }

  /**
   * What entity states, oriented "subject <relation> object": its free relations whose type is in the
   * vocabulary, plus its ref fields that carry a `rel`. Pass inherited data (flatten) for variants.
   * @returns {{subject:string, def:object, object:string}[]}
   */
  function factsOf(schema, entity) {
    var out = [];
    (entity.relations || []).forEach(function (r) {
      var m = matchRelation(r.type);
      if (!m) return;
      if (m.dir === 'inv') out.push({ subject: r.to, def: m.def, object: entity.id });
      else out.push({ subject: entity.id, def: m.def, object: r.to });
      if (m.def.symmetric) out.push({ subject: r.to, def: m.def, object: entity.id });
    });
    Object.keys(entity.data || {}).forEach(function (cid) {
      Object.keys(entity.data[cid]).forEach(function (key) {
        var f = fieldOf(schema, cid + '.' + key);
        if (!f || !f.field.rel || (f.field.kind !== 'ref' && f.field.kind !== 'refs')) return;
        var def = relationById(f.field.rel);
        var v = entity.data[cid][key];
        (Array.isArray(v) ? v : [v]).forEach(function (to) {
          if (typeof to !== 'string' || !to) return;
          out.push({ subject: entity.id, def: def, object: to });
          if (def.symmetric) out.push({ subject: to, def: def, object: entity.id });
        });
      });
    });
    return out;
  }

  // ---- containment hierarchy (located in + part of, transitive)
  function addUnique(map, k, v) {
    map[k] = map[k] || [];
    if (map[k].indexOf(v) < 0) map[k].push(v);
  }

  /** @returns {{parents:Object<string,string[]>, children:Object<string,string[]>}} the containment graph */
  function hierarchy(schema, entities) {
    var idx = { parents: {}, children: {} };
    flatten(entities, schema).forEach(function (e) {
      factsOf(schema, e).forEach(function (f) {
        if (!f.def.up || f.subject === f.object) return;
        addUnique(idx.parents, f.subject, f.object);
        addUnique(idx.children, f.object, f.subject);
      });
    });
    return idx;
  }

  function walk(map, id, limit) {
    var out = [];
    var seen = {};
    var queue = (map[id] || []).slice();
    while (queue.length && out.length < limit) {
      var cur = queue.shift();
      if (seen[cur]) continue;
      seen[cur] = true;
      out.push(cur);
      (map[cur] || []).forEach(function (n) {
        queue.push(n);
      });
    }
    return out;
  }

  /** Containers of id, nearest first (id itself appears only when the data loops). */
  function ancestorsIn(idx, id) {
    return walk(idx.parents, id, 50);
  }

  /** Everything inside id, nearest first. */
  function descendantsIn(idx, id) {
    return walk(idx.children, id, 500);
  }

  function ancestorsOf(schema, entities, id) {
    return ancestorsIn(hierarchy(schema, entities), id);
  }

  function descendantsOf(schema, entities, id) {
    return descendantsIn(hierarchy(schema, entities), id);
  }

  /** The chain from the outermost container down to the entity (Canada, Montréal, Hôtel de Ville, Salon). */
  function pathOf(schema, entities, id) {
    var idx = hierarchy(schema, entities);
    var chain = [id];
    var seen = {};
    seen[id] = true;
    var cur = id;
    while (idx.parents[cur] && idx.parents[cur].length) {
      var p = idx.parents[cur][0];
      if (seen[p]) break;
      seen[p] = true;
      chain.unshift(p);
      cur = p;
    }
    return chain
      .map(function (x) {
        return findById(entities, x);
      })
      .filter(Boolean);
  }

  /** Would "id <type> toId" make something contain itself? Only containment relations can. */
  function wouldCycleRelation(schema, entities, id, type, toId) {
    var m = matchRelation(type);
    if (!m || !m.def.up) return false;
    var subject = m.dir === 'inv' ? toId : id;
    var object = m.dir === 'inv' ? id : toId;
    if (subject === object) return true;
    return ancestorsOf(schema, entities, object).indexOf(subject) >= 0;
  }

  // ---- grounding (materialism as a lint)
  /**
   * Is an entity anchored to something material? Looks at most 3 links away (relations and ref fields, in
   * both directions) for an entity that has a body, a place or a date. A material entity grounds itself.
   * @returns {{grounded:boolean, base:string, path:string[]}} path = ids from the entity to its base
   */
  function groundingOf(schema, entities, id) {
    var flat = flatten(entities, schema);
    var byId = {};
    var adj = {};
    flat.forEach(function (e) {
      byId[e.id] = e;
    });
    function link(a, b) {
      addUnique(adj, a, b);
      addUnique(adj, b, a);
    }
    flat.forEach(function (e) {
      (e.relations || []).forEach(function (r) {
        if (byId[r.to]) link(e.id, r.to);
      });
      Object.keys(e.data || {}).forEach(function (cid) {
        Object.keys(e.data[cid]).forEach(function (key) {
          var f = fieldOf(schema, cid + '.' + key);
          if (!f || (f.field.kind !== 'ref' && f.field.kind !== 'refs')) return;
          [].concat(e.data[cid][key]).forEach(function (to) {
            if (byId[to]) link(e.id, to);
          });
        });
      });
    });
    var start = byId[id];
    if (!start) return { grounded: false, base: '', path: [] };
    if (isMaterial(schema, start)) return { grounded: true, base: id, path: [id] };
    var from = {};
    from[id] = '';
    var frontier = [id];
    for (var depth = 0; depth < 3; depth++) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var neighbours = adj[frontier[i]] || [];
        for (var j = 0; j < neighbours.length; j++) {
          var n = neighbours[j];
          if (n in from) continue;
          from[n] = frontier[i];
          if (isMaterial(schema, byId[n])) {
            var path = [n];
            while (from[path[0]]) path.unshift(from[path[0]]);
            return { grounded: true, base: n, path: path };
          }
          next.push(n);
        }
      }
      frontier = next;
    }
    return { grounded: false, base: '', path: [] };
  }

  function natureNames(list) {
    return list
      .map(function (n) {
        var x = natureById(n);
        return x ? x.name.toLowerCase() : n;
      })
      .join(' / ');
  }

  /**
   * Ontological remarks about one entity (which must be in `entities`): level 'error' (a containment
   * loop), 'warn' (a relation between natures it does not usually link) or 'info' (a floating abstraction).
   * @returns {{level:string, code:string, message:string, other?:string}[]}
   */
  function ontologyIssues(schema, entities, entity) {
    var out = [];
    var natures = naturesOf(schema, entity);
    if (ancestorsOf(schema, entities, entity.id).indexOf(entity.id) >= 0) {
      out.push({ level: 'error', code: 'cycle', message: '« ' + entity.name + ' » finirait par se contenir lui-même : retirez un lien « situé dans » ou « fait partie de ».' });
    }
    (entity.relations || []).forEach(function (r) {
      var m = matchRelation(r.type);
      var other = findById(entities, r.to);
      if (!m || !other || m.def.symmetric) return;
      var subject = m.dir === 'inv' ? other : entity;
      var object = m.dir === 'inv' ? entity : other;
      [['from', subject], ['to', object]].forEach(function (side) {
        var expected = m.def[side[0]];
        var ns = naturesOf(schema, side[1]);
        if (!expected || !ns.length || ns.some(function (n) { return expected.indexOf(n) >= 0; })) return;
        out.push({
          level: 'warn',
          code: 'relation-nature',
          other: other.id,
          relType: r.type,
          message:
            'Le lien « ' + r.type + ' » ne convient pas ici : « ' + side[1].name + ' » est de nature « ' + natureNames(ns) + ' », alors que ce lien relie d’habitude des choses de nature « ' + natureNames(expected).replace(/ \/ /g, ' » ou « ') + ' ». ' +
            'Essayez « fait partie de » ou « lié à » (ou changez le type de « ' + side[1].name + ' »).',
        });
      });
    });
    if (natures.length && !natures.some(function (n) { return realmOf(n) === 'material'; }) && !groundingOf(schema, entities, entity.id).grounded) {
      out.push({
        level: 'info',
        code: 'floating',
        message: '« ' + entity.name + ' » (' + natureNames(natures) + ') flotte : reliez-le à ce qui l’incarne, l’exprime ou l’illustre (un lieu, une personne, un objet, un événement).',
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- 6 history / revert
  /**
   * Reverts one history entry (a new "undo" entry is recorded, nothing is erased). "create" cannot be
   * reverted. Returns the same entity when the entry is unknown or not revertable.
   */
  function revertEntry(schema, entity, entryId, opts) {
    var h = findById(entity.history, entryId);
    if (!h || h.undoOf) return entity;
    var next = entity;
    switch (h.op) {
      case 'set':
        next = setValue(schema, entity, h.path, h.before, opts);
        break;
      case 'rename':
        next = renameEntity(entity, h.before, opts);
        break;
      case 'aliases':
        next = setAliases(entity, h.before, opts);
        break;
      case 'types':
        next = setTypes(schema, entity, h.before, opts);
        break;
      case 'components':
        next = setComponents(schema, entity, h.before, opts);
        break;
      case 'relate':
        next = removeRelation(entity, h.after.type, h.after.to, opts);
        break;
      case 'unrelate':
        next = addRelation(entity, h.before.type, h.before.to, opts);
        break;
      default:
        return entity;
    }
    if (next === entity) return entity;
    next.history[next.history.length - 1].undoOf = entryId;
    return next;
  }

  /** One-line French description of a history entry (for the entity history list). */
  function describeEntry(schema, entities, h) {
    function fv(path, v) {
      var f = fieldOf(schema, path);
      return f ? formatValue(f.field, v, entities) || '(vide)' : String(v);
    }
    function names(ids) {
      return (ids || [])
        .map(function (t) {
          var x = findById(schema.types, t);
          return x ? x.name : t;
        })
        .join(', ') || '(aucun)';
    }
    function relName(r) {
      var e = findById(entities, r.to);
      return r.type + ' ' + (e ? e.name : '?');
    }
    var prefix = h.undoOf ? 'Annulé : ' : '';
    switch (h.op) {
      case 'create':
        return 'Créé « ' + h.after + ' »';
      case 'rename':
        return prefix + 'Renommé « ' + h.before + ' » en « ' + h.after + ' »';
      case 'aliases':
        return prefix + 'Alias : ' + ((h.after || []).join(', ') || '(aucun)');
      case 'types':
        return prefix + 'Archétypes : ' + names(h.after);
      case 'components':
        return (
          prefix +
          'Composants ajoutés : ' +
          ((h.after || [])
            .map(function (c) {
              var x = findById(schema.components, c);
              return x ? x.name : c;
            })
            .join(', ') || '(aucun)')
        );
      case 'base': {
        var bn = function (bid) {
          var x = findById(entities, bid);
          return bid ? (x ? x.name : '?') : '(aucun)';
        };
        return prefix + 'Modèle : ' + bn(h.before) + ' → ' + bn(h.after);
      }
      case 'relate':
        return prefix + 'Lien ajouté : ' + relName(h.after);
      case 'unrelate':
        return prefix + 'Lien retiré : ' + relName(h.before);
      case 'set': {
        var f = fieldOf(schema, h.path);
        var label = f ? f.component.name + ' / ' + f.field.label : h.path;
        return prefix + label + ' : ' + fv(h.path, h.before) + ' → ' + fv(h.path, h.after);
      }
      default:
        return prefix + h.op;
    }
  }

  /** Drops the oldest history entries until JSON.stringify(entity) fits `maxChars` (Trello desc budget). */
  function fitHistory(entity, maxChars) {
    var e = clone(entity);
    while (e.history.length > 1 && JSON.stringify(e).length > maxChars) e.history.shift();
    return e;
  }

  // ---------------------------------------------------------------- 7 queries and natural language
  function compare(op, actual, expected) {
    switch (op) {
      case 'set':
        return actual !== undefined;
      case 'empty':
        return actual === undefined;
      case 'ne':
        return !compare('eq', actual, expected);
      case 'in':
        return (Array.isArray(expected) ? expected : [expected]).some(function (x) {
          return compare('eq', actual, x);
        });
      case 'contains':
        if (Array.isArray(actual)) return actual.indexOf(expected) >= 0;
        return actual !== undefined && normKey(actual).indexOf(normKey(expected)) >= 0;
      case 'gt':
        return actual !== undefined && actual > expected;
      case 'lt':
        return actual !== undefined && actual < expected;
      default:
        if (Array.isArray(actual)) return actual.indexOf(expected) >= 0;
        if (typeof actual === 'string' && typeof expected === 'string') return normKey(actual) === normKey(expected);
        return actual === expected;
    }
  }

  /**
   * filter = { types?: string[] (any of, subtypes included), text?: string,
   *            refersTo?: string[] (all of, entity ids; what is inside them counts),
   *            where?: [{ path, op, value }] (all of) }
   */
  function matches(schema, entity, filter, ctx) {
    var f = filter || {};
    if (f.types && f.types.length) {
      // a City answers to "Place": the entity's types are widened to their ancestors
      var closure = typeClosure(schema, entity.types);
      if (
        !f.types.some(function (t) {
          return closure.indexOf(t) >= 0;
        })
      ) {
        return false;
      }
    }
    if (f.text) {
      var q = stem(f.text);
      var hay = [entity.name].concat(entity.aliases).map(stem);
      if (
        !hay.some(function (h) {
          return h.indexOf(q) >= 0;
        })
      ) {
        return false;
      }
    }
    if (f.refersTo && f.refersTo.length) {
      if (
        !f.refersTo.every(function (id) {
          // "at the Hôtel de Ville" also reaches what is in its rooms (ctx.reach = the place and its insides)
          return (ctx && ctx.reach ? ctx.reach(id) : [id]).some(function (rid) {
            return refersTo(schema, entity, rid);
          });
        })
      ) {
        return false;
      }
    }
    return (f.where || []).every(function (w) {
      return compare(w.op || 'eq', getValue(entity, w.path), w.value);
    });
  }

  function query(schema, entities, filter) {
    var flat = flatten(entities, schema);
    var ctx = null;
    if (filter && filter.refersTo && filter.refersTo.length) {
      var idx = hierarchy(schema, entities);
      ctx = {
        reach: function (id) {
          return [id].concat(descendantsIn(idx, id));
        },
      };
    }
    return entities.filter(function (e, i) {
      return matches(schema, flat[i], filter, ctx);
    });
  }

  /** Label keys an entity answers to: name + aliases, stemmed, longest first. */
  function labelsOf(item) {
    return [item.name]
      .concat(item.aliases || [])
      .map(stem)
      .filter(function (l) {
        return l.length >= 2;
      });
  }

  /**
   * Turns a free-text request into a filter: "arroser mes plantes au travail" with a type "plant" and
   * a place whose alias is "travail" gives { types:['plant'], refersTo:[<place id>] } and the
   * matching entities. Possessives and verbs are ignored; what counts is which type names, entity
   * names/aliases and choice values (e.g. "mortes") the text contains.
   * @returns {{recognized:boolean, filter:object, entities:object[], mentions:object[]}}
   */
  function resolveText(schema, entities, text) {
    // French elisions ("l'eau", "d'ordinateur") must not hide the word: drop the clitic before matching
    var hay = stem(text).replace(/(^|\s)(?:l|d|j|m|n|s|t|c|qu)'(?=\S)/g, '$1');
    var mentions = [];
    var types = [];
    (schema.types || []).forEach(function (t) {
      var hit = labelsOf(t).filter(function (l) {
        return hasPhrase(hay, l);
      });
      if (hit.length) {
        types.push(t.id);
        mentions.push({ kind: 'type', id: t.id, name: t.name, via: hit[0] });
      }
    });
    var named = [];
    entities.forEach(function (e) {
      var hit = labelsOf(e).filter(function (l) {
        return hasPhrase(hay, l);
      });
      if (!hit.length) return;
      // "plante" typed as a type word must not also match an entity merely called "Plante": keep both
      // only when the entity is not just the type label itself.
      named.push({ entity: e, via: hit.sort(function (a, b) { return b.length - a.length; })[0] });
    });
    // drop entities whose matched label is contained in a longer matched label ("Hôtel" vs "Hôtel de Ville")
    named = named.filter(function (n) {
      return !named.some(function (o) {
        return o !== n && o.via.length > n.via.length && o.via.indexOf(n.via) >= 0;
      });
    });
    // A named entity that already has a queried type is a direct pick ("le ficus"); the others are
    // anchors the answer must point at ("au travail").
    var direct = [];
    var refs = [];
    named.forEach(function (n) {
      var isDirect = typeClosure(schema, n.entity.types).some(function (t) {
        return types.indexOf(t) >= 0;
      });
      (isDirect ? direct : []).push(n.entity);
      if (!isDirect) refs.push(n.entity.id);
      mentions.push({ kind: 'entity', id: n.entity.id, name: n.entity.name, via: n.via });
    });
    var where = [];
    var scope = types.length ? types : null;
    var scopeTypes = scope || (schema.types || []).map(function (t) { return t.id; });
    componentIdsOf(schema, { types: scopeTypes }).forEach(function (cid) {
      var c = findById(schema.components, cid);
      if (!c) return;
      c.fields.forEach(function (fd) {
        if (fd.kind !== 'choice' && fd.kind !== 'multi') return;
        (fd.options || []).forEach(function (o) {
          if (hasPhrase(hay, stem(o))) {
            where.push({ path: cid + '.' + fd.key, op: 'eq', value: o });
            mentions.push({ kind: 'value', path: cid + '.' + fd.key, name: o, via: stem(o) });
          }
        });
      });
    });
    var filter = {};
    if (types.length) filter.types = types;
    if (refs.length) filter.refersTo = refs;
    if (where.length) filter.where = where;
    var recognized = !!(types.length || refs.length || where.length || direct.length);
    var found = [];
    if (types.length) {
      found = query(schema, entities, filter);
      if (!found.length && direct.length && !where.length) found = direct;
    } else if (refs.length || where.length) {
      // only names were mentioned ("au travail"): the mentioned entities themselves
      found = named.map(function (n) {
        return n.entity;
      });
    }
    return { recognized: recognized, filter: filter, entities: found, mentions: mentions };
  }

  // ---------------------------------------------------------------- 8 agent prompt lines
  /** " [Fait social]" when the nature says more than the type's own name, else "". */
  function natureTag(t) {
    var n = natureById(t.nature);
    return n && normKey(n.name) !== normKey(t.name) ? ' [' + n.name + ']' : '';
  }

  function describeEntity(schema, entities, entity) {
    var types = entity.types
      .map(function (t) {
        var x = findById(schema.types, t);
        return x ? x.name : t;
      })
      .join('/');
    var parts = [];
    var data = effectiveData(entities, entity, schema);
    var baseEntity = entity.base ? findById(entities, entity.base) : null;
    if (baseEntity) parts.push('variante de ' + baseEntity.name);
    Object.keys(data).forEach(function (cid) {
      Object.keys(data[cid]).forEach(function (key) {
        var f = fieldOf(schema, cid + '.' + key);
        if (f) parts.push(f.field.label + ': ' + formatValue(f.field, data[cid][key], entities));
      });
    });
    entity.relations.forEach(function (r) {
      var o = findById(entities, r.to);
      parts.push(r.type + ': ' + (o ? o.name : '?'));
    });
    var containers = pathOf(schema, entities, entity.id).slice(0, -1);
    if (containers.length) {
      parts.push(
        'dans ' +
          containers
            .reverse()
            .map(function (c) {
              return c.name;
            })
            .join(' › ')
      );
    }
    return (
      entity.name +
      (types ? ' [' + types + ']' : '') +
      (entity.aliases.length ? ' (alias: ' + entity.aliases.join(', ') + ')' : '') +
      (parts.length ? ' | ' + parts.join('; ') : '') +
      ' #' +
      entity.id
    );
  }

  /**
   * Lines for the agent system prompt: the catalog by type, then, when the user's text names a type
   * or an entity, the entities it resolves to. Bounded (MAX_PROMPT_CHARS).
   */
  function promptLines(schema, entities, userText) {
    if (!schema || !entities || !entities.length) return [];
    var lines = ['Entités de l’utilisateur (objets nommés avec propriétés ; « mes plantes au travail » = filtre type + lieu) :'];
    (schema.types || []).forEach(function (t) {
      var list = entities.filter(function (e) {
        return e.types.indexOf(t.id) >= 0;
      });
      if (!list.length) return;
      lines.push(
        '- ' + t.name + ' (' + list.length + ')' + natureTag(t) + ' : ' +
          list.slice(0, 15).map(function (e) { return e.name; }).join(', ') + (list.length > 15 ? ', …' : '')
      );
    });
    var r = userText ? resolveText(schema, entities, userText) : null;
    if (r && r.recognized) {
      lines.push('Entités correspondant à la demande actuelle (filtre résolu, ne pas redemander) :');
      if (!r.entities.length) lines.push('- aucune');
      r.entities.slice(0, MAX_PROMPT_MATCHES).forEach(function (e) {
        lines.push('- ' + describeEntity(schema, entities, e));
      });
    }
    var out = [];
    var total = 0;
    for (var i = 0; i < lines.length; i++) {
      total += lines[i].length + 1;
      if (total > MAX_PROMPT_CHARS) break;
      out.push(lines[i]);
    }
    return out;
  }

  // ---------------------------------------------------------------- 9 export
  global.EntitiesModel = {
    VERSION: VERSION,
    NATURES: NATURES,
    RELATIONS: RELATIONS,
    RELATION_CATEGORIES: RELATION_CATEGORIES,
    upsertRelationDef: upsertRelationDef,
    removeRelationDef: removeRelationDef,
    MAX_SCHEMA_CHARS: MAX_SCHEMA_CHARS,
    MAX_ENTITIES: MAX_ENTITIES,
    MAX_HISTORY: MAX_HISTORY,
    FIELD_KINDS: FIELD_KINDS,
    normKey: normKey,
    slug: slug,
    defaultSchema: defaultSchema,
    normalizeSchema: normalizeSchema,
    normalizeEntity: normalizeEntity,
    upsertComponent: upsertComponent,
    upsertType: upsertType,
    removeComponent: removeComponent,
    removeType: removeType,
    componentIdsOf: componentIdsOf,
    archetypeDefaults: archetypeDefaults,
    setComponents: setComponents,
    setTypeDefault: setTypeDefault,
    natureById: natureById,
    typeLineage: typeLineage,
    typeClosure: typeClosure,
    isA: isA,
    natureOfType: natureOfType,
    naturesOf: naturesOf,
    realmOf: realmOf,
    isMaterial: isMaterial,
    subtypesOf: subtypesOf,
    relationById: relationById,
    matchRelation: matchRelation,
    inverseLabel: inverseLabel,
    relationsFor: relationsFor,
    factsOf: factsOf,
    hierarchy: hierarchy,
    ancestorsIn: ancestorsIn,
    descendantsIn: descendantsIn,
    ancestorsOf: ancestorsOf,
    descendantsOf: descendantsOf,
    pathOf: pathOf,
    wouldCycleRelation: wouldCycleRelation,
    groundingOf: groundingOf,
    ontologyIssues: ontologyIssues,
    fieldOf: fieldOf,
    levelBounds: levelBounds,
    findById: findById,
    createEntity: createEntity,
    renameEntity: renameEntity,
    setAliases: setAliases,
    NAMES_COMPONENT: NAMES_COMPONENT,
    setTypes: setTypes,
    setValue: setValue,
    getValue: getValue,
    chainOf: chainOf,
    effectiveData: effectiveData,
    effectiveValue: effectiveValue,
    originOf: originOf,
    flatten: flatten,
    variantsOf: variantsOf,
    wouldCycle: wouldCycle,
    cloneEntity: cloneEntity,
    setBase: setBase,
    detachEntity: detachEntity,
    isRevertable: isRevertable,
    formatValue: formatValue,
    addRelation: addRelation,
    removeRelation: removeRelation,
    linksOf: linksOf,
    refersTo: refersTo,
    deleteEntity: deleteEntity,
    revertEntry: revertEntry,
    describeEntry: describeEntry,
    fitHistory: fitHistory,
    matches: matches,
    compare: compare,
    normalizeSystem: normalizeSystem,
    upsertSystem: upsertSystem,
    removeSystem: removeSystem,
    SYSTEM_OPS: SYSTEM_OPS,
    SYSTEM_LEVELS: SYSTEM_LEVELS,
    query: query,
    resolveText: resolveText,
    describeEntity: describeEntity,
    promptLines: promptLines,
  };
})(typeof window !== 'undefined' ? window : this);
