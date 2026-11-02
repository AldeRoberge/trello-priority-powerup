/**
 * entities-model-core: part 2 of 2 (levelBounds).
 * Names are shared with the other parts through window.EntitiesModelParts (see entities-model-core.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesModelParts = global.EntitiesModelParts || {});

  // from earlier parts (values)
  var MAX_ALIAS = S.MAX_ALIAS;
  var MAX_ALIASES = S.MAX_ALIASES;
  var MAX_COMPONENTS = S.MAX_COMPONENTS;
  var MAX_HISTORY = S.MAX_HISTORY;
  var MAX_NAME = S.MAX_NAME;
  var MAX_RELATIONS = S.MAX_RELATIONS;
  var MAX_REL_TYPE = S.MAX_REL_TYPE;
  var MAX_ROLE = S.MAX_ROLE;
  var MAX_TYPES = S.MAX_TYPES;
  var NAMES_COMPONENT = S.NAMES_COMPONENT;

  // from other parts (functions, resolved at call time)
  function clone() { return S.clone.apply(this, arguments); }
  function coerceValue() { return S.coerceValue.apply(this, arguments); }
  function componentFits() { return S.componentFits.apply(this, arguments); }
  function effectiveData() { return S.effectiveData.apply(this, arguments); }
  function effectiveValue() { return S.effectiveValue.apply(this, arguments); }
  function fieldOf() { return S.fieldOf.apply(this, arguments); }
  function findById() { return S.findById.apply(this, arguments); }
  function flatten() { return S.flatten.apply(this, arguments); }
  function getValue() { return S.getValue.apply(this, arguments); }
  function naturesOf() { return S.naturesOf.apply(this, arguments); }
  function newId() { return S.newId.apply(this, arguments); }
  function normKey() { return S.normKey.apply(this, arguments); }
  function normalizeEntity() { return S.normalizeEntity.apply(this, arguments); }
  function normalizeHistoryEntry() { return S.normalizeHistoryEntry.apply(this, arguments); }
  function nowIso() { return S.nowIso.apply(this, arguments); }
  function slug() { return S.slug.apply(this, arguments); }
  function str() { return S.str.apply(this, arguments); }
  function typeClosure() { return S.typeClosure.apply(this, arguments); }
  function uniqueStrings() { return S.uniqueStrings.apply(this, arguments); }
  function upsertType() { return S.upsertType.apply(this, arguments); }
  function wouldCycle() { return S.wouldCycle.apply(this, arguments); }

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
        return !!findById(schema.components, c) && componentFits(schema, entity, c);
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
  /** A relation may carry a `role` ("Ingénieur" for a participant of an event): the same person can hold several. */
  function sameRelation(r, type, toId, role) {
    return r.to === toId && normKey(r.type) === normKey(type) && normKey(r.role || '') === normKey(role || '');
  }

  function relationRecord(type, toId, role) {
    return role ? { type: type, to: toId, role: role } : { type: type, to: toId };
  }

  function addRelation(entity, type, toId, opts, role) {
    var t = str(type, MAX_REL_TYPE) || 'lié à';
    var ro = str(role, MAX_ROLE);
    if (!toId || toId === entity.id) return entity;
    var exists = entity.relations.some(function (r) {
      return sameRelation(r, t, toId, ro);
    });
    if (exists || entity.relations.length >= MAX_RELATIONS) return entity;
    var next = clone(entity);
    next.relations.push(relationRecord(t, toId, ro));
    pushHistory(next, { op: 'relate', after: relationRecord(t, toId, ro) }, opts);
    return next;
  }

  function removeRelation(entity, type, toId, opts, role) {
    var hit = entity.relations.filter(function (r) {
      return sameRelation(r, type, toId, str(role, MAX_ROLE));
    })[0];
    if (!hit) return entity;
    var next = clone(entity);
    next.relations = next.relations.filter(function (r) {
      return r !== hit && !(r.to === hit.to && r.type === hit.type && (r.role || '') === (hit.role || ''));
    });
    pushHistory(next, { op: 'unrelate', before: relationRecord(hit.type, hit.to, hit.role) }, opts);
    return next;
  }

  /** Every link touching `id`: outgoing relations, then incoming relations and ref fields. */
  function linksOf(schema, rawEntities, id) {
    var out = [];
    var entities = flatten(rawEntities, schema);
    var self = findById(entities, id);
    if (!self) return out;
    self.relations.forEach(function (r) {
      out.push({ dir: 'out', via: r.type, other: r.to, role: r.role || '' });
    });
    entities.forEach(function (e) {
      if (e.id === id) return;
      if (e.base === id) out.push({ dir: 'in', via: 'variante de', other: e.id });
      e.relations.forEach(function (r) {
        if (r.to === id) out.push({ dir: 'in', via: r.type, inverse: inverseLabel(r.type), other: e.id, role: r.role || '' });
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
        if (r.to === id) cur = removeRelation(cur, r.type, id, opts, r.role);
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
  S.RELATIONS = [
    { id: 'located-in', name: 'situé dans', inverse: 'abrite', category: 'spatial', up: true, from: ['matter', 'living', 'agent', 'place', 'event', 'social'], to: ['place'], aliases: ['situé à', 'localisé dans', 'located in'], inverseAliases: ['héberge', 'houses'] },
    { id: 'part-of', name: 'fait partie de', inverse: 'contient', category: 'mereological', up: true, aliases: ['partie de', 'part of'], inverseAliases: ['comprend', 'has part', 'contains'] },
    { id: 'lives-in', name: 'habite à', inverse: 'est habité par', category: 'spatial', up: true, from: ['agent', 'living'], to: ['place'], aliases: ['habite dans', 'habite au', 'habite aux', 'lives in'] },
    { id: 'made-of', name: 'fait de', inverse: 'compose', category: 'composition', from: ['matter', 'living'], to: ['matter', 'living'], aliases: ['composé de', 'made of', 'contient comme ingrédient'] },
    { id: 'made-by', name: 'fabriqué par', inverse: 'a fabriqué', category: 'production', to: ['agent', 'social'], aliases: ['créé par', 'produit par', 'made by'] },
    { id: 'owned-by', name: 'appartient à', inverse: 'possède', category: 'social', to: ['agent', 'social'], aliases: ['propriété de', 'owned by'] },
    { id: 'member-of', name: 'membre de', inverse: 'a pour membre', category: 'social', from: ['agent', 'social'], to: ['social', 'agent'], aliases: ['member of'] },
    { id: 'participates-in', name: 'participe à', inverse: 'a pour participant', category: 'social', from: ['agent', 'social'], to: ['event'], aliases: ['invité à', 'participates in'], inverseAliases: ['a pour invité', 'participants'] },
    { id: 'works-for', name: 'travaille pour', inverse: 'emploie', category: 'social', from: ['agent'], to: ['social', 'agent'], aliases: ['works for', 'travaille chez'], inverseAliases: ['employs'] },
    { id: 'parent-of', name: 'parent de', inverse: 'enfant de', category: 'social', from: ['agent'], to: ['agent'], aliases: ['père de', 'mère de', 'parent of'], inverseAliases: ['fils de', 'fille de', 'child of'] },
    { id: 'partner-of', name: 'conjoint de', category: 'social', symmetric: true, from: ['agent'], to: ['agent'], aliases: ['partenaire de', 'partner of', 'mari de', 'femme de', 'époux de', 'épouse de'] },
    { id: 'sibling-of', name: 'frère ou sœur de', category: 'social', symmetric: true, from: ['agent'], to: ['agent'], aliases: ['frère de', 'sœur de', 'sibling of'] },
    { id: 'friend-of', name: 'ami de', category: 'social', symmetric: true, from: ['agent'], to: ['agent'], aliases: ['amie de', 'friend of'] },
    { id: 'colleague-of', name: 'collègue de', category: 'social', symmetric: true, from: ['agent'], to: ['agent'], aliases: ['coworker of'] },
    { id: 'cares-for', name: 's’occupe de', inverse: 'est sous la garde de', category: 'social', from: ['agent'], to: ['living', 'agent'], aliases: ['prend soin de', 'cares for'] },
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
    { id: 'uses', name: 'utilise', inverse: 'est utilisé par', category: 'social', from: ['agent', 'social', 'event'], aliases: ['uses', 'emploie comme outil', 'a besoin de'], inverseAliases: ['used by'] },
    { id: 'supplies', name: 'fournit', inverse: 'est fourni par', category: 'social', from: ['agent', 'social'], aliases: ['fournisseur de', 'supplies', 'livre à'], inverseAliases: ['fournisseur', 'supplied by'] },
    { id: 'published-on', name: 'publié sur', inverse: 'publie', category: 'production', aliases: ['diffusé sur', 'published on'], inverseAliases: ['diffuse', 'publishes'] },
    { id: 'organizes', name: 'organise', inverse: 'est organisé par', category: 'social', from: ['agent', 'social'], to: ['event'], aliases: ['organizes'], inverseAliases: ['organisé par', 'organized by'] },
    { id: 'replaces', name: 'remplace', inverse: 'est remplacé par', category: 'taxonomic', aliases: ['replaces'], inverseAliases: ['remplacé par', 'replaced by'] },
    { id: 'related', name: 'lié à', category: 'generic', symmetric: true, aliases: ['related to', 'relié à'] },
  ];
  S.relIndex = null;
  var relIndexed = -1;

  function relationById(id) {
    for (var i = 0; i < S.RELATIONS.length; i++) if (S.RELATIONS[i].id === id) return S.RELATIONS[i];
    return null;
  }

  function relationIndex() {
    // the work library pushes relations after this file loads; a longer list must be reindexed
    if (S.relIndex && relIndexed === S.RELATIONS.length) return S.relIndex;
    S.relIndex = {};
    relIndexed = S.RELATIONS.length;
    function put(label, def, dir) {
      var k = normKey(label);
      if (k && !S.relIndex[k]) S.relIndex[k] = { def: def, dir: dir };
    }
    S.RELATIONS.forEach(function (d) {
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
    return S.relIndex;
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
    S.RELATIONS.forEach(function (d) {
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
   * The people an entity gathers, when it is the kind of thing that gathers some: the participants of an event
   * (each with a role: Ingénieur, Vidéaste) or the members of a group or an organization.
   * @returns {{kind:'event'|'group', rel:string, title:string, add:string}|null}
   */
  function peopleSpec(schema, entity) {
    var closure = typeClosure(schema, (entity && entity.types) || []);
    if (closure.indexOf('groupe') >= 0 || closure.indexOf('organisation') >= 0) return { kind: 'group', rel: 'a pour membre', title: 'Membres', add: 'Ajouter un membre' };
    if (naturesOf(schema, entity).indexOf('event') >= 0) return { kind: 'event', rel: 'a pour participant', title: 'Participants', add: 'Ajouter un participant' };
    return null;
  }

  /**
   * Relations of an entity that peopleSpec lists (they are shown there, not in the general links).
   * Pass `entities` to also see the link stored on the other side ("Léa membre de la chorale").
   */
  function peopleRelations(schema, entity, entities) {
    var spec = peopleSpec(schema, entity);
    if (!spec) return [];
    var out = [];
    var seen = {};
    function add(to, role, record) {
      var k = to + '\n' + normKey(role || '');
      if (!to || seen[k]) return;
      seen[k] = true;
      out.push(record);
    }
    (entity.relations || []).forEach(function (r) {
      if (normKey(r.type) === normKey(spec.rel)) add(r.to, r.role, r);
    });
    (entities || []).forEach(function (other) {
      if (!other || other.id === entity.id) return;
      (other.relations || []).forEach(function (r) {
        if (r.to !== entity.id) return;
        var inv = inverseLabel(r.type);
        if (normKey(r.type) !== normKey(spec.rel) && normKey(inv) !== normKey(spec.rel)) return;
        add(other.id, r.role, { type: spec.rel, to: other.id, role: r.role || '' });
      });
    });
    return out;
  }

  /** The place a person lives in: the Habite à field, or a "habite à" link from either side. */
  function homeId(schema, entities, entity) {
    if (!entity) return '';
    var v = effectiveValue(entities, entity, 'personne.residence', schema);
    if (typeof v === 'string' && v) return v;
    var home = '';
    flatten(entities, schema).forEach(function (e) {
      factsOf(schema, e).forEach(function (f) {
        if (f.def && f.def.id === 'lives-in' && f.subject === entity.id) home = f.object;
      });
    });
    return home;
  }

  /** The organisation a person works for: the Employeur field, or a "travaille pour" link. */
  function employerId(schema, entities, entity) {
    if (!entity) return '';
    var v = effectiveValue(entities, entity, 'emploi.employeur', schema);
    if (typeof v === 'string' && v) return v;
    var emp = '';
    flatten(entities, schema).forEach(function (e) {
      factsOf(schema, e).forEach(function (f) {
        if (f.def && f.def.id === 'works-for' && f.subject === entity.id) emp = f.object;
      });
    });
    return emp;
  }

  /** People whose home is this place or somewhere inside it. */
  function residentsOf(schema, entities, placeId) {
    if (!placeId) return [];
    var inside = {};
    inside[placeId] = true;
    descendantsOf(schema, entities, placeId).forEach(function (id) {
      inside[id] = true;
    });
    return (entities || []).filter(function (e) {
      var h = homeId(schema, entities, e);
      return h && inside[h];
    });
  }

  /**
   * The other end of a vocabulary relation.
   * dir 'fwd' (the phrase used the relation's name, "parent de Emma"): target is the object, return subjects.
   * dir 'inv' ("enfant de Léa"): target is the subject, return objects.
   * Symmetric relations return either end. Colleagues also include people with the same employer.
   */
  function relatedTo(schema, entities, targetId, def, dir) {
    if (!def || !targetId) return [];
    var ids = [];
    function add(x) {
      if (x && x !== targetId && ids.indexOf(x) < 0) ids.push(x);
    }
    if (def.id === 'lives-in') {
      if (dir === 'inv') {
        var who = findById(entities, targetId);
        var h = who ? homeId(schema, entities, who) : '';
        return h ? [findById(entities, h)].filter(Boolean) : [];
      }
      return residentsOf(schema, entities, targetId);
    }
    if (def.id === 'serves') {
      if (dir === 'inv') return purposePath(schema, entities, targetId).slice(0, -1);
      return descendantsOf(schema, entities, targetId)
        .map(function (cid) { return findById(entities, cid); })
        .filter(Boolean);
    }
    flatten(entities, schema).forEach(function (e) {
      factsOf(schema, e).forEach(function (f) {
        if (!f.def || f.def.id !== def.id) return;
        if (def.symmetric || dir === 'sym') {
          if (f.subject === targetId) add(f.object);
          if (f.object === targetId) add(f.subject);
        } else if (dir === 'inv') {
          if (f.subject === targetId) add(f.object);
        } else if (f.object === targetId) add(f.subject);
      });
    });
    if (def.id === 'colleague-of') {
      var self = findById(entities, targetId);
      var emp = self ? employerId(schema, entities, self) : '';
      if (emp) {
        (entities || []).forEach(function (e) {
          if (employerId(schema, entities, e) === emp) add(e.id);
        });
      }
    }
    return ids
      .map(function (id) {
        return findById(entities, id);
      })
      .filter(Boolean);
  }

  /** Partner, parents, children, siblings, friends, pets, colleagues and home of one person. */
  function circleOf(schema, entities, id) {
    var self = findById(entities, id);
    if (!self) return null;
    function list(defId, dir) {
      var def = relationById(defId);
      return def ? relatedTo(schema, entities, id, def, dir) : [];
    }
    return {
      home: homeId(schema, entities, self),
      partners: list('partner-of', 'sym'),
      parents: list('parent-of', 'fwd'),
      children: list('parent-of', 'inv'),
      siblings: list('sibling-of', 'sym'),
      friends: list('friend-of', 'sym'),
      pets: list('cares-for', 'inv'),
      colleagues: list('colleague-of', 'sym'),
    };
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
          if (f.field.incoming) out.push({ subject: to, def: def, object: entity.id });
          else out.push({ subject: entity.id, def: def, object: to });
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

  /** Ids this entity points at through one vocabulary relation (flattened, so defaults count). */
  function factObjects(schema, entity, relId) {
    var out = [];
    if (!entity) return out;
    factsOf(schema, entity).forEach(function (f) {
      if (!f.def || f.def.id !== relId || f.subject !== entity.id) return;
      if (out.indexOf(f.object) < 0) out.push(f.object);
    });
    return out;
  }

  function flatMap(schema, entities) {
    var map = {};
    flatten(entities, schema).forEach(function (e) { map[e.id] = e; });
    return map;
  }

  /** The chain from the outermost container down to the entity (Canada, Montréal, Hôtel de Ville, Salon).
   * A place wins over the work ladder, so a task kept in a room still says where it is. */
  function pathOf(schema, entities, id) {
    var idx = hierarchy(schema, entities);
    var byId = flatMap(schema, entities);
    var chain = [id];
    var seen = {};
    seen[id] = true;
    var cur = id;
    while (idx.parents[cur] && idx.parents[cur].length) {
      var options = idx.parents[cur];
      var served = {};
      factObjects(schema, byId[cur], 'serves').forEach(function (p) { served[p] = true; });
      var spatial = options.filter(function (p) { return !served[p]; });
      var p = (spatial.length ? spatial : options)[0];
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

  /**
   * Vision › mission › but › objectif › projet › tâche. Walks "contribue à", then a subtask's parent
   * task. A place on the task does not replace this chain.
   */
  function purposePath(schema, entities, id) {
    var byId = flatMap(schema, entities);
    var chain = [];
    var seen = {};
    var cur = id;
    while (cur && !seen[cur] && chain.length < 12) {
      seen[cur] = true;
      chain.unshift(cur);
      var next = '';
      var e = byId[cur];
      if (e) {
        var up = factObjects(schema, e, 'serves');
        if (up.length) next = up[0];
        else {
          var parts = factObjects(schema, e, 'part-of');
          for (var i = 0; i < parts.length && !next; i++) {
            var parent = findById(entities, parts[i]);
            if (parent && naturesOf(schema, parent).indexOf('event') >= 0) next = parts[i];
          }
        }
      }
      cur = next;
    }
    return chain
      .map(function (x) {
        return findById(entities, x);
      })
      .filter(Boolean);
  }

  /**
   * People who lead the same work. From a person: whoever leads something on the ladder of what they lead.
   * From a project (or any other entity): whoever leads it or what sits inside it.
   */
  function crewOf(schema, entities, id) {
    var led = relationById('led-by');
    var self = findById(entities, id);
    if (!led || !self) return [];
    var roots = [];
    if (naturesOf(schema, self).indexOf('agent') >= 0) {
      relatedTo(schema, entities, id, led, 'fwd').forEach(function (e) {
        purposePath(schema, entities, e.id).forEach(function (n) {
          if (roots.indexOf(n.id) < 0) roots.push(n.id);
        });
      });
    } else roots.push(id);
    var scope = {};
    roots.forEach(function (rid) {
      scope[rid] = true;
      descendantsOf(schema, entities, rid).forEach(function (d) { scope[d] = true; });
    });
    var people = [];
    Object.keys(scope).forEach(function (sid) {
      relatedTo(schema, entities, sid, led, 'inv').forEach(function (p) {
        if (p.id === id) return;
        if (!people.some(function (x) { return x.id === p.id; })) people.push(p);
      });
    });
    return people;
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

  // exports
  S.addRelation = addRelation;
  S.addUnique = addUnique;
  S.ancestorsIn = ancestorsIn;
  S.ancestorsOf = ancestorsOf;
  S.circleOf = circleOf;
  S.cloneEntity = cloneEntity;
  S.createEntity = createEntity;
  S.crewOf = crewOf;
  S.deleteEntity = deleteEntity;
  S.descendantsIn = descendantsIn;
  S.descendantsOf = descendantsOf;
  S.detachEntity = detachEntity;
  S.employerId = employerId;
  S.factObjects = factObjects;
  S.factsOf = factsOf;
  S.flatMap = flatMap;
  S.hierarchy = hierarchy;
  S.homeId = homeId;
  S.inverseLabel = inverseLabel;
  S.isRevertable = isRevertable;
  S.levelBounds = levelBounds;
  S.linksOf = linksOf;
  S.matchRelation = matchRelation;
  S.pathOf = pathOf;
  S.peopleRelations = peopleRelations;
  S.peopleSpec = peopleSpec;
  S.purposePath = purposePath;
  S.pushHistory = pushHistory;
  S.refersTo = refersTo;
  S.relIndexed = relIndexed;
  S.relatedTo = relatedTo;
  S.relationById = relationById;
  S.relationIndex = relationIndex;
  S.relationRecord = relationRecord;
  S.relationsFor = relationsFor;
  S.removeRelation = removeRelation;
  S.renameEntity = renameEntity;
  S.residentsOf = residentsOf;
  S.sameRelation = sameRelation;
  S.setAliases = setAliases;
  S.setBase = setBase;
  S.setComponents = setComponents;
  S.setTypeDefault = setTypeDefault;
  S.setTypes = setTypes;
  S.setValue = setValue;
  S.walk = walk;
  S.wouldCycleRelation = wouldCycleRelation;
})(typeof window !== 'undefined' ? window : this);
