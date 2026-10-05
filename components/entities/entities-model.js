/*
 * Role: pure Entity-Component model ("Entités"): rich things the user names once ("Ficus", "Hôtel de
 * Ville") and the assistant can then filter ("mes plantes au travail"). No Trello, no DOM.
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
 * Contents: 1 constants / text helpers | 2 schema (components, types, defaults) | 3 entities and
 * values | 4 mutations (all pure: they return a modified copy) | 5 relations | 6 history / revert |
 * 7 queries and natural-language resolution | 8 agent prompt lines | 9 export
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 1 constants / text helpers
  var VERSION = 1;
  var MAX_NAME = 80;
  var MAX_ALIAS = 40;
  var MAX_ALIASES = 12;
  var MAX_TEXT = 500;
  var MAX_COMPONENTS = 30;
  var MAX_FIELDS = 20;
  var MAX_TYPES = 40;
  var MAX_ENTITIES = 500;
  var MAX_RELATIONS = 30;
  var MAX_REL_TYPE = 40;
  var MAX_CHOICES = 20;
  var MAX_HISTORY = 40;
  var MAX_PROMPT_CHARS = 2400;
  var MAX_PROMPT_MATCHES = 25;
  var FIELD_KINDS = ['text', 'number', 'date', 'bool', 'choice', 'ref', 'refs'];

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
    if (kind === 'choice') out.options = uniqueStrings(f.options, MAX_CHOICES, MAX_ALIAS);
    if (kind === 'ref' || kind === 'refs') {
      out.refTypes = uniqueStrings(f.refTypes, MAX_TYPES, MAX_NAME).map(slug).filter(Boolean);
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
    return { id: id, name: name || id, fields: fields.slice(0, MAX_FIELDS) };
  }

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
      components: uniqueStrings(t.components, MAX_COMPONENTS, MAX_NAME).map(slug).filter(Boolean),
    };
  }

  function defaultSchema() {
    return normalizeSchema({
      components: [
        { id: 'location', name: 'Lieu', fields: [{ key: 'place', label: 'Lieu', kind: 'ref', refTypes: ['place'] }] },
      ],
      types: [{ id: 'place', name: 'Lieu', aliases: ['endroit', 'location'], icon: 'map-pin', components: [] }],
    });
  }

  function normalizeSchema(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var seenC = {};
    var components = [];
    (Array.isArray(s.components) ? s.components : []).forEach(function (c) {
      var nc = normalizeComponent(c);
      if (!nc || seenC[nc.id]) return;
      seenC[nc.id] = true;
      components.push(nc);
    });
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
    return { version: VERSION, components: components.slice(0, MAX_COMPONENTS), types: types.slice(0, MAX_TYPES) };
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
    next.components = next.components.filter(function (c) {
      return c.id !== id;
    });
    next.types.forEach(function (t) {
      t.components = t.components.filter(function (c) {
        return c !== id;
      });
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
      var t = findById(schema.types, tid);
      if (!t) return;
      t.components.forEach(function (cid) {
        if (out.indexOf(cid) < 0) out.push(cid);
      });
    });
    return out;
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
    return {
      id: String(raw.id),
      name: name,
      base: raw.base && String(raw.base) !== String(raw.id) ? String(raw.base) : '',
      aliases: uniqueStrings(raw.aliases, MAX_ALIASES, MAX_ALIAS),
      types: types,
      data: data,
      relations: relations.slice(0, MAX_RELATIONS),
      history: history,
      createdAt: String(raw.createdAt || ''),
      updatedAt: String(raw.updatedAt || ''),
    };
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
  function effectiveData(entities, entity) {
    var chain = chainOf(entities, entity);
    var data = {};
    for (var i = chain.length - 1; i >= 0; i--) {
      Object.keys(chain[i].data || {}).forEach(function (cid) {
        data[cid] = Object.assign({}, data[cid], chain[i].data[cid]);
      });
    }
    return data;
  }

  function effectiveValue(entities, entity, path) {
    var p = String(path || '').split('.');
    var c = effectiveData(entities, entity)[p[0]];
    return c ? c[p[1]] : undefined;
  }

  /**
   * Where a field's value comes from: 'own' (override), an archetype's entity id (inherited), or ''
   * (no value anywhere).
   */
  function originOf(entities, entity, path) {
    var chain = chainOf(entities, entity);
    for (var i = 0; i < chain.length; i++) {
      if (getValue(chain[i], path) !== undefined) return i === 0 ? 'own' : chain[i].id;
    }
    return '';
  }

  /** Entities with inheritance applied (same ids; data merged). Cheap when nobody has a base. */
  function flatten(entities) {
    if (
      !entities.some(function (e) {
        return e.base;
      })
    ) {
      return entities;
    }
    return entities.map(function (e) {
      return e.base ? Object.assign({}, e, { data: effectiveData(entities, e) }) : e;
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
    if (field.kind === 'bool') return value ? 'oui' : 'non';
    return String(value);
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
        ? { name: name, types: src.types, data: effectiveData(entities, src), relations: src.relations }
        : { name: name, types: src.types, base: src.id },
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
    return !!entry && !entry.undoOf && ['set', 'rename', 'aliases', 'types', 'relate', 'unrelate'].indexOf(entry.op) >= 0;
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
    var entities = flatten(rawEntities);
    var self = findById(entities, id);
    if (!self) return out;
    self.relations.forEach(function (r) {
      out.push({ dir: 'out', via: r.type, other: r.to });
    });
    entities.forEach(function (e) {
      if (e.id === id) return;
      if (e.base === id) out.push({ dir: 'in', via: 'variante de', other: e.id });
      e.relations.forEach(function (r) {
        if (r.to === id) out.push({ dir: 'in', via: r.type, other: e.id });
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
        return prefix + 'Types : ' + names(h.after);
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
   * filter = { types?: string[] (any of), text?: string, refersTo?: string[] (all of, entity ids),
   *            where?: [{ path, op, value }] (all of) }
   */
  function matches(schema, entity, filter) {
    var f = filter || {};
    if (f.types && f.types.length) {
      if (
        !f.types.some(function (t) {
          return entity.types.indexOf(t) >= 0;
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
          return refersTo(schema, entity, id);
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
    var flat = flatten(entities);
    return entities.filter(function (e, i) {
      return matches(schema, flat[i], filter);
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
    var hay = stem(text);
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
      var isDirect = n.entity.types.some(function (t) {
        return types.indexOf(t) >= 0;
      });
      (isDirect ? direct : []).push(n.entity);
      if (!isDirect) refs.push(n.entity.id);
      mentions.push({ kind: 'entity', id: n.entity.id, name: n.entity.name, via: n.via });
    });
    var where = [];
    var scope = types.length ? types : null;
    var comps = {};
    (scope || (schema.types || []).map(function (t) { return t.id; })).forEach(function (tid) {
      var t = findById(schema.types, tid);
      if (t) t.components.forEach(function (c) { comps[c] = true; });
    });
    Object.keys(comps).forEach(function (cid) {
      var c = findById(schema.components, cid);
      if (!c) return;
      c.fields.forEach(function (fd) {
        if (fd.kind !== 'choice') return;
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
  function describeEntity(schema, entities, entity) {
    var types = entity.types
      .map(function (t) {
        var x = findById(schema.types, t);
        return x ? x.name : t;
      })
      .join('/');
    var parts = [];
    var data = effectiveData(entities, entity);
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
        '- ' + t.name + ' (' + list.length + ') : ' +
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
    fieldOf: fieldOf,
    findById: findById,
    createEntity: createEntity,
    renameEntity: renameEntity,
    setAliases: setAliases,
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
    query: query,
    resolveText: resolveText,
    describeEntity: describeEntity,
    promptLines: promptLines,
  };
})(typeof window !== 'undefined' ? window : this);
