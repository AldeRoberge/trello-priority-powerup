/**
 * entities-model: part 2 of 2 (-).
 * Names are shared with the other parts through window.EntitiesModelParts (see entities-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesModelParts = global.EntitiesModelParts || {});

  // from earlier parts (values)
  var COMPONENT_NATURES = S.COMPONENT_NATURES;
  var FIELD_KINDS = S.FIELD_KINDS;
  var MAX_ENTITIES = S.MAX_ENTITIES;
  var MAX_HISTORY = S.MAX_HISTORY;
  var MAX_PROMPT_CHARS = S.MAX_PROMPT_CHARS;
  var MAX_PROMPT_MATCHES = S.MAX_PROMPT_MATCHES;
  var MAX_SCHEMA_CHARS = S.MAX_SCHEMA_CHARS;
  var NAMES_COMPONENT = S.NAMES_COMPONENT;
  var NATURES = S.NATURES;
  var RELATIONS = S.RELATIONS;
  var RELATION_CATEGORIES = S.RELATION_CATEGORIES;
  var SYSTEM_LEVELS = S.SYSTEM_LEVELS;
  var SYSTEM_OPS = S.SYSTEM_OPS;
  var VERSION = S.VERSION;

  // from other parts (functions, resolved at call time)
  function addRelation() { return S.addRelation.apply(this, arguments); }
  function addUnique() { return S.addUnique.apply(this, arguments); }
  function ancestorsIn() { return S.ancestorsIn.apply(this, arguments); }
  function ancestorsOf() { return S.ancestorsOf.apply(this, arguments); }
  function archetypeDefaults() { return S.archetypeDefaults.apply(this, arguments); }
  function chainOf() { return S.chainOf.apply(this, arguments); }
  function circleOf() { return S.circleOf.apply(this, arguments); }
  function clone() { return S.clone.apply(this, arguments); }
  function cloneEntity() { return S.cloneEntity.apply(this, arguments); }
  function componentFits() { return S.componentFits.apply(this, arguments); }
  function componentIdsOf() { return S.componentIdsOf.apply(this, arguments); }
  function createEntity() { return S.createEntity.apply(this, arguments); }
  function crewOf() { return S.crewOf.apply(this, arguments); }
  function defaultSchema() { return S.defaultSchema.apply(this, arguments); }
  function deleteEntity() { return S.deleteEntity.apply(this, arguments); }
  function descendantsIn() { return S.descendantsIn.apply(this, arguments); }
  function descendantsOf() { return S.descendantsOf.apply(this, arguments); }
  function detachEntity() { return S.detachEntity.apply(this, arguments); }
  function effectiveData() { return S.effectiveData.apply(this, arguments); }
  function effectiveValue() { return S.effectiveValue.apply(this, arguments); }
  function employerId() { return S.employerId.apply(this, arguments); }
  function factObjects() { return S.factObjects.apply(this, arguments); }
  function factsOf() { return S.factsOf.apply(this, arguments); }
  function fieldOf() { return S.fieldOf.apply(this, arguments); }
  function findById() { return S.findById.apply(this, arguments); }
  function flatten() { return S.flatten.apply(this, arguments); }
  function formatValue() { return S.formatValue.apply(this, arguments); }
  function getValue() { return S.getValue.apply(this, arguments); }
  function hasPhrase() { return S.hasPhrase.apply(this, arguments); }
  function hierarchy() { return S.hierarchy.apply(this, arguments); }
  function homeId() { return S.homeId.apply(this, arguments); }
  function inverseLabel() { return S.inverseLabel.apply(this, arguments); }
  function isA() { return S.isA.apply(this, arguments); }
  function isMaterial() { return S.isMaterial.apply(this, arguments); }
  function isRevertable() { return S.isRevertable.apply(this, arguments); }
  function levelBounds() { return S.levelBounds.apply(this, arguments); }
  function linksOf() { return S.linksOf.apply(this, arguments); }
  function matchRelation() { return S.matchRelation.apply(this, arguments); }
  function natureById() { return S.natureById.apply(this, arguments); }
  function natureOfType() { return S.natureOfType.apply(this, arguments); }
  function naturesOf() { return S.naturesOf.apply(this, arguments); }
  function normKey() { return S.normKey.apply(this, arguments); }
  function normalizeEntity() { return S.normalizeEntity.apply(this, arguments); }
  function normalizeSchema() { return S.normalizeSchema.apply(this, arguments); }
  function normalizeSystem() { return S.normalizeSystem.apply(this, arguments); }
  function originOf() { return S.originOf.apply(this, arguments); }
  function pathOf() { return S.pathOf.apply(this, arguments); }
  function peopleRelations() { return S.peopleRelations.apply(this, arguments); }
  function peopleSpec() { return S.peopleSpec.apply(this, arguments); }
  function purposePath() { return S.purposePath.apply(this, arguments); }
  function realmOf() { return S.realmOf.apply(this, arguments); }
  function refersTo() { return S.refersTo.apply(this, arguments); }
  function relatedTo() { return S.relatedTo.apply(this, arguments); }
  function relationById() { return S.relationById.apply(this, arguments); }
  function relationsFor() { return S.relationsFor.apply(this, arguments); }
  function removeComponent() { return S.removeComponent.apply(this, arguments); }
  function removeRelation() { return S.removeRelation.apply(this, arguments); }
  function removeRelationDef() { return S.removeRelationDef.apply(this, arguments); }
  function removeSystem() { return S.removeSystem.apply(this, arguments); }
  function removeType() { return S.removeType.apply(this, arguments); }
  function renameEntity() { return S.renameEntity.apply(this, arguments); }
  function residentsOf() { return S.residentsOf.apply(this, arguments); }
  function setAliases() { return S.setAliases.apply(this, arguments); }
  function setBase() { return S.setBase.apply(this, arguments); }
  function setComponents() { return S.setComponents.apply(this, arguments); }
  function setTypeDefault() { return S.setTypeDefault.apply(this, arguments); }
  function setTypes() { return S.setTypes.apply(this, arguments); }
  function setValue() { return S.setValue.apply(this, arguments); }
  function singular() { return S.singular.apply(this, arguments); }
  function slug() { return S.slug.apply(this, arguments); }
  function stem() { return S.stem.apply(this, arguments); }
  function subtypesOf() { return S.subtypesOf.apply(this, arguments); }
  function typeClosure() { return S.typeClosure.apply(this, arguments); }
  function typeLineage() { return S.typeLineage.apply(this, arguments); }
  function upsertComponent() { return S.upsertComponent.apply(this, arguments); }
  function upsertRelationDef() { return S.upsertRelationDef.apply(this, arguments); }
  function upsertSystem() { return S.upsertSystem.apply(this, arguments); }
  function upsertType() { return S.upsertType.apply(this, arguments); }
  function variantsOf() { return S.variantsOf.apply(this, arguments); }
  function wouldCycle() { return S.wouldCycle.apply(this, arguments); }
  function wouldCycleRelation() { return S.wouldCycleRelation.apply(this, arguments); }

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
    var kids = {};
    Object.keys(byId).forEach(function (eid) {
      factObjects(schema, byId[eid], 'serves').forEach(function (parent) { addUnique(kids, parent, eid); });
      if (naturesOf(schema, byId[eid]).indexOf('event') >= 0) {
        factObjects(schema, byId[eid], 'part-of').forEach(function (parent) { addUnique(kids, parent, eid); });
      }
    });
    var from2 = {};
    from2[id] = '';
    var front = [id];
    for (var depth2 = 0; depth2 < 8; depth2++) {
      var next2 = [];
      for (var a = 0; a < front.length; a++) {
        var list = kids[front[a]] || [];
        for (var b = 0; b < list.length; b++) {
          var m = list[b];
          if (m in from2) continue;
          from2[m] = front[a];
          if (byId[m] && isMaterial(schema, byId[m])) {
            var path2 = [m];
            while (from2[path2[0]]) path2.unshift(from2[path2[0]]);
            return { grounded: true, base: m, path: path2 };
          }
          next2.push(m);
        }
      }
      front = next2;
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
      out.push({ level: 'error', code: 'cycle', message: '« ' + entity.name + ' » finirait par se contenir : retirez un lien « situé dans », « fait partie de » ou « habite à ».' });
    }
    (entity.relations || []).forEach(function (r) {
      var m = matchRelation(r.type);
      var other = findById(entities, r.to);
      if (!m || !other || m.def.symmetric) return;
      var subject = m.dir === 'inv' ? other : entity;
      var object = m.dir === 'inv' ? entity : other;
      var bad = [];
      [['from', subject], ['to', object]].forEach(function (side) {
        var expected = m.def[side[0]];
        var ns = naturesOf(schema, side[1]);
        if (!expected || !ns.length || ns.some(function (n) { return expected.indexOf(n) >= 0; })) return;
        bad.push('« ' + side[1].name + ' » est de nature « ' + natureNames(ns) + ' » (attendu : « ' + natureNames(expected).replace(/ \/ /g, ' » ou « ') + ' »)');
      });
      if (!bad.length) return;
      out.push({
        level: 'warn',
        code: 'relation-nature',
        other: other.id,
        relType: r.type,
        message: 'Le lien « ' + r.type + ' » avec « ' + other.name + ' » ne convient pas : ' + bad.join(' ; ') + '. Essayez le sens inverse, « fait partie de » ou « lié à ».',
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
        next = removeRelation(entity, h.after.type, h.after.to, opts, h.after.role);
        break;
      case 'unrelate':
        next = addRelation(entity, h.before.type, h.before.to, opts, h.before.role);
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
      return r.type + ' ' + (e ? e.name : '?') + (r.role ? ' (' + r.role + ')' : '');
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
   * Names of the entities most relevant to `text` (shared words with the name or aliases first, then the most
   * recently touched), for AI prompts that cannot carry every entity.
   */
  function relevantNames(entities, text, limit) {
    var words = normKey(text || '').split(' ').filter(function (w) { return w.length > 2; }).map(singular);
    var scored = (entities || []).map(function (e, i) {
      var keys = [e.name].concat(e.aliases || []).map(function (n) { return normKey(n).split(' ').map(singular); });
      var hit = 0;
      keys.forEach(function (ws) { ws.forEach(function (w) { if (words.indexOf(w) >= 0) hit++; }); });
      return { name: e.name, hit: hit, at: String(e.updatedAt || ''), i: i };
    });
    scored.sort(function (a, b) { return b.hit - a.hit || (a.at < b.at ? 1 : a.at > b.at ? -1 : a.i - b.i); });
    return scored.slice(0, limit).map(function (x) { return x.name; });
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

  /** Kinship, care and residence: a phrase like "enfants de Léa" names the relation, not a type. */
  var PHRASE_REL = ['parent-of', 'partner-of', 'sibling-of', 'friend-of', 'colleague-of', 'cares-for', 'lives-in', 'serves', 'led-by', 'blocks', 'measured-by', 'delivers', 'threatens'];

  function relationPhrase(hay) {
    var best = null;
    PHRASE_REL.forEach(function (id) {
      var d = relationById(id);
      if (!d) return;
      var labels = [d.name].concat(d.aliases || []);
      if (d.inverse) labels.push(d.inverse);
      (d.inverseAliases || []).forEach(function (a) {
        labels.push(a);
      });
      labels.forEach(function (label) {
        var k = stem(label);
        if (k.length < 5 || !hasPhrase(hay, k)) return;
        if (best && k.length <= best.len) return;
        var m = matchRelation(label);
        best = { def: d, dir: m ? m.dir : 'fwd', len: k.length, via: k, label: label };
      });
    });
    return best;
  }

  /**
   * Turns a free-text request into a filter: "arroser mes plantes au travail" with a type "plant" and
   * a place whose alias is "travail" gives { types:['plant'], refersTo:[<place id>] } and the
   * matching entities. Possessives and verbs are ignored; what counts is which type names, entity
   * names/aliases and choice values (e.g. "mortes") the text contains.
   * @returns {{recognized:boolean, filter:object, entities:object[], mentions:object[]}}
   */
  function resolveText(schema, entities, text) {
    // French elisions ("l'eau", "d'ordinateur") must not hide the word: drop the clitic before matching.
    // Keep the raw stem too: "s'occupe" is a reflexive verb, not an elision, and it is a relation name.
    var raw = stem(text);
    var hay = raw.replace(/(^|\s)(?:l|d|j|m|n|s|t|c|qu)'(?=\S)/g, '$1');
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
    // A place named "bureau" wins over the type alias "bureau": the word is an anchor, not a second type.
    types = types.filter(function (tid) {
      var via = '';
      mentions.forEach(function (m) {
        if (m.kind === 'type' && m.id === tid) via = m.via;
      });
      return !named.some(function (n) {
        return n.via === via && typeClosure(schema, n.entity.types).indexOf(tid) < 0;
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
    // short text values already typed on entities ("Vidéaste" as a Poste) are searchable words too ("les vidéastes")
    var seenText = {};
    entities.forEach(function (e) {
      Object.keys(e.data || {}).forEach(function (cid) {
        Object.keys(e.data[cid]).forEach(function (key) {
          var f = fieldOf(schema, cid + '.' + key);
          var v = e.data[cid][key];
          if (!f || f.field.kind !== 'text' || typeof v !== 'string' || v.length < 3 || v.length > 40) return;
          var k = cid + '.' + key + '=' + normKey(v);
          if (seenText[k] || !hasPhrase(hay, stem(v))) return;
          seenText[k] = true;
          where.push({ path: cid + '.' + key, op: 'eq', value: v });
          mentions.push({ kind: 'value', path: cid + '.' + key, name: v, via: stem(v) });
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
    } else if (where.length && !refs.length && !named.length) {
      found = query(schema, entities, filter);
    } else if (refs.length || where.length) {
      // only names were mentioned ("au travail"): the mentioned entities themselves
      found = named.map(function (n) {
        return n.entity;
      });
      // "dans la cuisine" asks for what is inside, not for the room itself
      if (!types.length && /(?:^|\s)dans(?:\s|$)/.test(hay)) {
        var inside = [];
        refs.forEach(function (id) {
          descendantsOf(schema, entities, id).forEach(function (cid) {
            var e = findById(entities, cid);
            if (e && !inside.some(function (x) { return x.id === e.id; })) inside.push(e);
          });
        });
        if (inside.length) found = inside;
      }
    }
    var phrase = relationPhrase(raw) || relationPhrase(hay);
    if (phrase && named.length) {
      var agentQuery =
        !types.length ||
        types.every(function (tid) {
          var n = natureOfType(schema, tid);
          return n === 'agent' || n === 'social' || !n;
        });
      // "mes plantes qui habitent à la maison" stays a plant query; "qui habite à Montréal" does not
      if (phrase.def.id !== 'lives-in' || agentQuery) {
        var linked = [];
        named.forEach(function (n) {
          relatedTo(schema, entities, n.entity.id, phrase.def, phrase.dir).forEach(function (e) {
            if (!linked.some(function (x) { return x.id === e.id; })) linked.push(e);
          });
        });
        if (types.length) {
          var answerTypes = types.filter(function (tid) {
            var via = '';
            mentions.forEach(function (m) {
              if (m.kind === 'type' && m.id === tid) via = m.via;
            });
            return via && phrase.via.indexOf(via) < 0;
          });
          if (answerTypes.length) {
            linked = linked.filter(function (e) {
              return typeClosure(schema, e.types).some(function (t) {
                return answerTypes.indexOf(t) >= 0;
              });
            });
          }
        }
        mentions.push({ kind: 'relation', id: phrase.def.id, name: phrase.label, via: phrase.via });
        return {
          recognized: true,
          filter: {
            relation: phrase.def.id,
            refersTo: named.map(function (n) {
              return n.entity.id;
            }),
          },
          entities: linked,
          mentions: mentions,
        };
      }
    }
    if (/(?:^|\s)(?:travaille avec|equipe de|equipe du)(?:\s|$)/.test(hay) && named.length) {
      var crew = [];
      named.forEach(function (n) {
        crewOf(schema, entities, n.entity.id).forEach(function (e) {
          if (!crew.some(function (x) { return x.id === e.id; })) crew.push(e);
        });
      });
      mentions.push({ kind: 'relation', id: 'crew', name: 'travaille avec', via: 'equipe' });
      return {
        recognized: true,
        filter: {
          crew: true,
          refersTo: named.map(function (n) { return n.entity.id; }),
        },
        entities: crew,
        mentions: mentions,
      };
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
      parts.push(r.type + ': ' + (o ? o.name : '?') + (r.role ? ' (' + r.role + ')' : ''));
    });
    var ladder = purposePath(schema, entities, entity.id);
    var containers = pathOf(schema, entities, entity.id);
    function chainNames(list) {
      return list
        .slice(0, -1)
        .reverse()
        .map(function (c) { return c.name; })
        .join(' › ');
    }
    function sameChain(a, b) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
      return true;
    }
    if (ladder.length > 1) parts.push('sert ' + chainNames(ladder));
    if (containers.length > 1 && !sameChain(containers, ladder)) parts.push('dans ' + chainNames(containers));
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
   * Lines for the agent system prompt. The entities the current sentence resolves to come first, so a long
   * catalog cannot push them past the character budget. Bounded (MAX_PROMPT_CHARS).
   */
  function promptLines(schema, entities, userText) {
    if (!schema || !entities || !entities.length) return [];
    var lines = ['Entités de l’utilisateur (objets nommés avec propriétés ; « mes plantes au travail » = filtre type + lieu) :'];
    var r = userText ? resolveText(schema, entities, userText) : null;
    if (r && r.recognized) {
      lines.push('Entités correspondant à la demande actuelle (filtre résolu, ne pas redemander) :');
      if (!r.entities.length) lines.push('- aucune');
      r.entities.slice(0, MAX_PROMPT_MATCHES).forEach(function (e) {
        lines.push('- ' + describeEntity(schema, entities, e));
      });
    }
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
    componentFits: componentFits,
    peopleSpec: peopleSpec,
    peopleRelations: peopleRelations,
    homeId: homeId,
    employerId: employerId,
    relatedTo: relatedTo,
    residentsOf: residentsOf,
    circleOf: circleOf,
    COMPONENT_NATURES: COMPONENT_NATURES,
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
    purposePath: purposePath,
    crewOf: crewOf,
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
    relevantNames: relevantNames,
    resolveText: resolveText,
    describeEntity: describeEntity,
    promptLines: promptLines,
  };

  // exports
  S.PHRASE_REL = PHRASE_REL;
  S.compare = compare;
  S.describeEntity = describeEntity;
  S.describeEntry = describeEntry;
  S.fitHistory = fitHistory;
  S.groundingOf = groundingOf;
  S.labelsOf = labelsOf;
  S.matches = matches;
  S.natureNames = natureNames;
  S.natureTag = natureTag;
  S.ontologyIssues = ontologyIssues;
  S.promptLines = promptLines;
  S.query = query;
  S.relationPhrase = relationPhrase;
  S.relevantNames = relevantNames;
  S.resolveText = resolveText;
  S.revertEntry = revertEntry;
})(typeof window !== 'undefined' ? window : this);
