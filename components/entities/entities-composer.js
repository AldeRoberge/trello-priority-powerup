/*
 * Role: pure logic of the Entity composer ("Composer une entité"): a guided interview that asks the
 * questions needed to create an entity, and the ones it drags along (a new place, a new type), then
 * creates everything linked in one go. No Trello, no DOM (the UI is entities-composer-ui.js).
 *
 * Model (UI words: an ARCHETYPE is a type = a bundle of components + default values; an entity is an
 * instance that stores only overrides, and may add components of its own)
 *   draft   an entity being composed: { id, name, aliases[], types[], components[] (extra), answers{ "comp.field": value },
 *           relations[{type,to}], intent, seen{} }. Ids are assigned up front, so a draft can be the
 *           target of another draft's link ("Monstera" -> place "Salon" that does not exist yet) and
 *           everything is created together by finalize().
 *   steps   what to ask, derived from the draft's types: start -> identity -> one step per component
 *           (the union over the types: composable) -> links -> review.
 *
 * Smart parts: readIntent() understands "Monstera, une plante au travail" (name, type, linked place);
 * suggest() proposes the values and links other entities of the same type already use; issues()
 * flags duplicates and ambiguous aliases; parseFieldSpec() lets a new type be described in one line.
 *
 * The ontology (natures, type hierarchy, relation vocabulary, grounding) lives in EntitiesModel; the composer
 * uses it to offer the right types for what the user is adding (a place, a person, an idea...), the right
 * relations for it (an abstract concept: "ancré dans", "exprimé par"...) and to warn about floating concepts.
 *
 * Contents: 1 helpers | 2 field specs and new types | 3 drafts | 4 intent | 5 steps and questions |
 * 6 suggestions and relations | 7 issues | 8 finalize | 9 export
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }

  // ---------------------------------------------------------------- 1 helpers
  var DEFAULT_REL_TYPES = ['contient', 'fait partie de', 'lié à'];

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }

  function trim(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function stemOf(s) {
    return EM()
      .normKey(s)
      .split(' ')
      .map(function (w) {
        return w.length > 3 && /(s|x)$/.test(w) ? w.slice(0, -1) : w;
      })
      .join(' ');
  }

  function splitTop(s) {
    return String(s || '')
      .split(/[,;\n]/)
      .map(trim)
      .filter(Boolean);
  }

  function uniqueId(base, taken) {
    var id = base || 'x';
    var n = 1;
    while (taken.indexOf(id) >= 0) {
      n += 1;
      id = base + '_' + n;
    }
    return id;
  }

  function typeByLabel(schema, label) {
    var k = stemOf(label);
    if (!k) return null;
    var hit = null;
    (schema.types || []).forEach(function (t) {
      if (hit) return;
      var labels = [t.id, t.name].concat(t.aliases || []).map(stemOf);
      if (labels.indexOf(k) >= 0) hit = t;
    });
    return hit;
  }

  // ---------------------------------------------------------------- 2 field specs and new types
  var KIND_WORDS = {
    texte: 'text', text: 'text', note: 'text',
    nombre: 'number', number: 'number', num: 'number', numero: 'number', quantite: 'number',
    date: 'date',
    'oui-non': 'bool', 'oui/non': 'bool', 'oui non': 'bool', bool: 'bool', booleen: 'bool', yesno: 'bool', 'yes-no': 'bool',
    choix: 'choice', choice: 'choice', liste: 'choice',
    'choix-multiple': 'multi', multi: 'multi', multiple: 'multi', tags: 'multi', etiquettes: 'multi',
    'texte-long': 'longtext', long: 'longtext', longtext: 'longtext', description: 'longtext', definition: 'longtext',
    geo: 'geo', gps: 'geo', coordonnees: 'geo', position: 'geo',
    url: 'url', web: 'url', site: 'url', 'lien-web': 'url',
    lien: 'ref', link: 'ref', ref: 'ref', entite: 'ref',
    liens: 'refs', links: 'refs', refs: 'refs', entites: 'refs',
  };

  /**
   * "Fréquence (nombre), Dernier arrosage (date), Santé (choix: bonne/fragile/morte), Lieu (lien: Lieu),
   * Poids (nombre: kg), Peau (choix-multiple: sèche/mixte), Définition (texte-long), Position (geo), Site (url)"
   * -> [{key,label,kind,options?,refTypes?,unit?}]. A bare label is a text field. Unknown kinds are text.
   */
  function parseFieldSpec(text, schema) {
    var fields = [];
    var seen = {};
    // split on commas that are not inside parentheses
    var parts = [];
    var depth = 0;
    var cur = '';
    String(text || '').split('').forEach(function (ch) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';' || ch === '\n') && depth === 0) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    });
    parts.push(cur);
    parts.forEach(function (raw) {
      var m = /^([^()]+?)\s*(?:\(\s*([^:)]*?)\s*(?::\s*([^)]*))?\s*\))?\s*$/.exec(trim(raw));
      if (!m) return;
      var label = trim(m[1]);
      var key = EM().slug(label);
      if (!label || !key || seen[key]) return;
      seen[key] = true;
      var kindWord = EM().normKey(m[2] || '').replace(/ /g, '-');
      var kind = KIND_WORDS[kindWord] || KIND_WORDS[(m[2] || '').toLowerCase().trim()] || 'text';
      var f = { key: key, label: label, kind: kind };
      var arg = trim(m[3]);
      if (kind === 'number' && arg) f.unit = arg.slice(0, 12);
      if (kind === 'choice' || kind === 'multi') {
        f.options = arg
          .split(/[\/|]/)
          .map(trim)
          .filter(Boolean);
        if (!f.options.length) f.kind = 'text';
      }
      if (kind === 'ref' || kind === 'refs') {
        f.refTypes = [];
        splitTop(arg.replace(/[\/|]/g, ',')).forEach(function (name) {
          var t = schema ? typeByLabel(schema, name) : null;
          var id = t ? t.id : EM().slug(name);
          if (id && f.refTypes.indexOf(id) < 0) f.refTypes.push(id);
        });
      }
      fields.push(f);
    });
    return fields;
  }

  /** Renders fields back to the one-line spec (used to prefill an editor). */
  function fieldSpecText(fields) {
    var names = {
      text: 'texte', number: 'nombre', date: 'date', bool: 'oui-non', choice: 'choix', ref: 'lien', refs: 'liens',
      multi: 'choix-multiple', longtext: 'texte-long', geo: 'geo', url: 'url',
    };
    return (fields || [])
      .map(function (f) {
        var arg =
          f.kind === 'choice' || f.kind === 'multi'
            ? ': ' + (f.options || []).join('/')
            : f.kind === 'number' && f.unit
              ? ': ' + f.unit
              : (f.kind === 'ref' || f.kind === 'refs') && f.refTypes && f.refTypes.length
                ? ': ' + f.refTypes.join('/')
                : '';
        return f.kind === 'text' ? f.label : f.label + ' (' + names[f.kind] + arg + ')';
      })
      .join(', ');
  }

  /**
   * Adds a type (and optionally one new component with its fields) to the schema.
   * spec = { name, aliases?, icon?, nature?, parents?: string[] (type ids), role?, description?,
   *          componentIds?: string[], component?: { name, fieldsText } }
   * @returns {{schema:object, typeId?:string, componentId?:string, error?:string}}
   */
  function defineType(schema, spec) {
    var name = trim(spec && spec.name);
    if (!name) return { schema: schema, error: 'name-required' };
    if (typeByLabel(schema, name)) return { schema: schema, error: 'type-exists' };
    var next = schema;
    var comps = (spec.componentIds || []).filter(function (cid) {
      return !!EM().findById(schema.components, cid);
    });
    var componentId = '';
    var c = spec.component;
    if (c && trim(c.fieldsText)) {
      var fields = parseFieldSpec(c.fieldsText, schema);
      if (fields.length) {
        var taken = schema.components.map(function (x) { return x.id; });
        componentId = uniqueId(EM().slug(trim(c.name) || name) || 'composant', taken);
        next = EM().upsertComponent(next, { id: componentId, name: trim(c.name) || name, fields: fields });
        comps.push(componentId);
      }
    }
    var takenT = schema.types.map(function (x) { return x.id; });
    var typeId = uniqueId(EM().slug(name) || 'type', takenT);
    next = EM().upsertType(next, {
      id: typeId,
      name: name,
      aliases: spec.aliases || [],
      icon: spec.icon || '',
      nature: spec.nature || '',
      parents: (spec.parents || []).filter(function (p) {
        return !!EM().findById(schema.types, p);
      }),
      role: spec.role === true,
      description: spec.description || '',
      components: comps,
    });
    if (!EM().findById(next.types, typeId)) return { schema: schema, error: 'too-many-types' };
    return { schema: next, typeId: typeId, componentId: componentId };
  }

  // ---------------------------------------------------------------- 3 drafts
  function newDraft(opts) {
    opts = opts || {};
    return {
      id: opts.id || 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: trim(opts.name),
      aliases: (opts.aliases || []).slice(),
      types: (opts.types || []).slice(),
      components: (opts.components || []).slice(),
      base: opts.base || '',
      answers: Object.assign({}, opts.answers),
      relations: (opts.relations || []).slice(),
      intent: '',
      seen: {},
    };
  }

  function withDraft(draft, patch) {
    return Object.assign(clone(draft), patch);
  }

  function setAnswer(draft, path, value) {
    var next = clone(draft);
    var empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
    if (empty) delete next.answers[path];
    else next.answers[path] = value;
    return next;
  }

  /**
   * Starts the draft from an archetype: it inherits every value and only stores what the user
   * answers (overrides). Types default to the archetype's. '' removes the archetype.
   */
  function setBase(schema, entities, draft, baseId) {
    var next = clone(draft);
    var b = baseId ? EM().findById(entities, baseId) : null;
    next.base = b ? b.id : '';
    if (b && !next.types.length) {
      next.types = b.types.filter(function (t) { return !!EM().findById(schema.types, t); });
    }
    return next;
  }

  /** The value a field would inherit from the draft's archetype (undefined when none). */
  function inheritedValue(entities, draft, path) {
    var b = draft.base ? EM().findById(entities, draft.base) : null;
    return b ? EM().effectiveValue(entities, b, path) : undefined;
  }

  function toggleType(schema, draft, typeId, on) {
    var next = clone(draft);
    next.types = next.types.filter(function (t) { return t !== typeId; });
    if (on && EM().findById(schema.types, typeId)) next.types.push(typeId);
    return next;
  }

  /** Adds or removes a component the entity carries on its own (beyond its archetypes). */
  function toggleComponent(schema, draft, cid, on) {
    var next = clone(draft);
    next.components = (next.components || []).filter(function (c) { return c !== cid; });
    if (on && EM().findById(schema.components, cid)) next.components.push(cid);
    return on ? next : pruneAnswers(schema, next);
  }

  /** Components not carried yet (neither by the archetypes nor added): what "+ Composant" can offer. */
  function componentsAvailable(schema, draft) {
    var have = EM().componentIdsOf(schema, draft);
    return schema.components.filter(function (c) { return have.indexOf(c.id) < 0; });
  }

  /**
   * Creates a component from a one-line spec ("Poids (nombre: kg), Notes (texte-long)") and returns the
   * new schema. @returns {{schema:object, componentId?:string, error?:string}}
   */
  function defineComponent(schema, name, fieldsText) {
    var label = trim(name);
    var fields = parseFieldSpec(fieldsText, schema);
    if (!label) return { schema: schema, error: 'name-required' };
    if (!fields.length) return { schema: schema, error: 'fields-required' };
    var id = uniqueId(EM().slug(label) || 'composant', schema.components.map(function (x) { return x.id; }));
    var next = EM().upsertComponent(schema, { id: id, name: label, fields: fields });
    if (!EM().findById(next.components, id)) return { schema: schema, error: 'too-many-components' };
    return { schema: next, componentId: id };
  }

  /**
   * What a field gets when the user leaves it empty: the archetype's default, or the value of the model
   * entity the draft is a variant of. null when there is none.
   * @returns {{value:*, source:'archetype'|'model', from:string}|null}
   */
  function defaultFor(schema, entities, draft, path) {
    var model = inheritedValue(entities, draft, path);
    if (model !== undefined) {
      var b = EM().findById(entities, draft.base);
      return { value: model, source: 'model', from: b ? b.name : '' };
    }
    var p = path.split('.');
    var d = EM().archetypeDefaults(schema, draft.types);
    if (d[p[0]] && d[p[0]][p[1]] !== undefined) {
      var owner = '';
      draft.types.forEach(function (tid) {
        EM().typeLineage(schema, tid).forEach(function (t) {
          if (t.defaults && t.defaults[path] !== undefined) owner = t.name;
        });
      });
      return { value: d[p[0]][p[1]], source: 'archetype', from: owner };
    }
    return null;
  }

  /**
   * Every archetype the user can pick, in nature order: the schema's types, then (library given) the ready-made
   * ones not installed yet. [{id, name, icon, nature, description, installed, role}]
   */
  function archetypeChoices(schema, library) {
    var order = EM().NATURES.map(function (n) { return n.id; });
    var rank = function (n) { var i = order.indexOf(n); return i < 0 ? order.length : i; };
    var out = schema.types.map(function (t) {
      var nature = EM().natureOfType(schema, t.id);
      return { id: t.id, name: t.name, icon: t.icon || 'stack-2', nature: nature, description: t.description || '', installed: true, role: !!t.role };
    });
    if (library) {
      library.TYPES.forEach(function (p) {
        if (library.installedAs(schema, p.id)) return;
        out.push({ id: p.id, name: p.name, icon: p.icon || 'plus', nature: p.nature, description: p.description || '', installed: false, role: !!p.role });
      });
    }
    return out
      .map(function (x, i) { return { x: x, i: i }; })
      .sort(function (a, b) { return rank(a.x.nature) - rank(b.x.nature) || a.i - b.i; })
      .map(function (o) { return o.x; });
  }

  /** Answers for fields whose component is no longer carried (type unticked) are dropped. */
  function pruneAnswers(schema, draft) {
    var comps = EM().componentIdsOf(schema, draft);
    var next = clone(draft);
    Object.keys(next.answers).forEach(function (p) {
      if (comps.indexOf(p.split('.')[0]) < 0) delete next.answers[p];
    });
    return next;
  }

  function addRelationTo(draft, type, toId) {
    var t = trim(type) || DEFAULT_REL_TYPES[2];
    if (!toId || toId === draft.id) return draft;
    var exists = draft.relations.some(function (r) {
      return r.to === toId && EM().normKey(r.type) === EM().normKey(t);
    });
    if (exists) return draft;
    var next = clone(draft);
    next.relations.push({ type: t, to: toId });
    return next;
  }

  function removeRelationFrom(draft, type, toId) {
    var next = clone(draft);
    next.relations = next.relations.filter(function (r) {
      return !(r.to === toId && r.type === type);
    });
    return next;
  }

  /** How many answers the draft has, out of how many questions its types ask. */
  function completeness(schema, draft) {
    var total = 0;
    var answered = 0;
    EM()
      .componentIdsOf(schema, draft)
      .forEach(function (cid) {
        var comp = EM().findById(schema.components, cid);
        if (!comp) return;
        comp.fields.forEach(function (f) {
          total += 1;
          if (draft.answers[cid + '.' + f.key] !== undefined) answered += 1;
        });
      });
    return { answered: answered, total: total, ratio: total ? answered / total : 0 };
  }

  // ---------------------------------------------------------------- 4 intent
  var SPLIT_RE = /\s*(?:[,:;]|\s[-–—]\s|\s(?:est|is)\s(?:(?:un|une|a|an)\s)?)\s*/;

  /**
   * Reads "Monstera, une plante au travail" -> name "Monstera", type Plante, linked place "Hôtel de Ville"
   * (through the type's place field when it has one, else a relation). Without a separator the whole
   * text is the name and nothing else is inferred (a name like "Plante verte" stays a name).
   * @returns {{name:string, types:string[], answers:object, relations:object[], mentions:object[]}}
   */
  function readIntent(schema, entities, text) {
    var out = { name: '', types: [], answers: {}, relations: [], mentions: [] };
    var raw = trim(text);
    if (!raw) return out;
    var m = SPLIT_RE.exec(raw);
    if (!m || m.index === 0) {
      out.name = raw;
      return out;
    }
    out.name = trim(raw.slice(0, m.index));
    var rest = trim(raw.slice(m.index + m[0].length));
    if (!rest) return out;
    var r = EM().resolveText(schema, entities, rest);
    out.mentions = r.mentions;
    r.mentions.forEach(function (x) {
      if (x.kind === 'type' && out.types.indexOf(x.id) < 0) out.types.push(x.id);
    });
    var probe = { types: out.types };
    var compIds = EM().componentIdsOf(schema, probe);
    r.mentions.forEach(function (x) {
      if (x.kind === 'value') {
        out.answers[x.path] = x.name;
      } else if (x.kind === 'entity') {
        var e = EM().findById(entities, x.id);
        if (!e || e.types.some(function (t) { return out.types.indexOf(t) >= 0; })) return;
        var slot = null;
        compIds.forEach(function (cid) {
          var comp = EM().findById(schema.components, cid);
          if (!comp || slot) return;
          comp.fields.forEach(function (f) {
            var path = cid + '.' + f.key;
            if (slot || f.kind !== 'ref' || out.answers[path]) return;
            var ok = !f.refTypes || !f.refTypes.length || e.types.some(function (t) { return f.refTypes.indexOf(t) >= 0; });
            if (ok) slot = path;
          });
        });
        if (slot) out.answers[slot] = e.id;
        else out.relations.push({ type: relationFor(schema, out.types, e), to: e.id });
      }
    });
    // nothing after the separator meant anything: it was part of the name ("Crème, mains")
    if (!out.types.length && !Object.keys(out.answers).length && !out.relations.length) {
      out.name = raw;
      out.mentions = [];
    }
    return out;
  }

  /**
   * The relation to use when a sentence mentions an entity and no link field fits: "situé dans" when the
   * mentioned thing is a place and the subject is not one itself, else the generic "lié à".
   */
  function relationFor(schema, subjectTypes, target) {
    var tn = EM().naturesOf(schema, target);
    var sn = EM().naturesOf(schema, { types: subjectTypes });
    return tn.indexOf('place') >= 0 && sn.indexOf('place') < 0 ? 'situé dans' : DEFAULT_REL_TYPES[2];
  }

  /** Applies a read intent to a draft without overwriting what the user already filled. */
  function applyIntent(schema, draft, intent) {
    var next = clone(draft);
    if (intent.name && !next.name) next.name = intent.name;
    intent.types.forEach(function (t) {
      if (next.types.indexOf(t) < 0 && EM().findById(schema.types, t)) next.types.push(t);
    });
    Object.keys(intent.answers).forEach(function (p) {
      if (next.answers[p] === undefined) next.answers[p] = intent.answers[p];
    });
    intent.relations.forEach(function (r) {
      next = addRelationTo(next, r.type, r.to);
    });
    return next;
  }

  // ---------------------------------------------------------------- 5 steps and questions
  /** The interview for the draft's current types. */
  function stepsFor(schema, draft) {
    var steps = [
      { key: 'start', kind: 'start', title: 'Quoi ?' },
      { key: 'identity', kind: 'identity', title: 'Nom' },
    ];
    EM()
      .componentIdsOf(schema, draft)
      .forEach(function (cid) {
        var comp = EM().findById(schema.components, cid);
        if (comp && comp.fields.length) steps.push({ key: 'comp:' + cid, kind: 'component', componentId: cid, title: comp.name });
      });
    steps.push({ key: 'links', kind: 'links', title: 'Liens' });
    steps.push({ key: 'review', kind: 'review', title: 'Résumé' });
    return steps;
  }

  /** @returns {{text:string, hint:string}} how a field is asked */
  function questionFor(comp, field, draft) {
    var who = draft && draft.name ? '« ' + draft.name + ' »' : 'cette entité';
    var label = field.label;
    switch (field.kind) {
      case 'number':
        return { text: label + ' ?', hint: 'Un nombre. Laissez vide si vous ne savez pas.' };
      case 'date':
        return { text: label + ' ?', hint: 'Choisissez une date, ou un raccourci.' };
      case 'bool':
        return { text: label + ' ?', hint: 'Oui ou non pour ' + who + '.' };
      case 'choice':
        return { text: label + ' ?', hint: 'Une seule valeur.' };
      case 'ref':
        return { text: label + ' ?', hint: 'Choisissez une entité existante, ou créez-la ici.' };
      case 'refs':
        return { text: label + ' ?', hint: 'Une ou plusieurs entités, existantes ou à créer ici.' };
      default:
        return { text: label + ' ?', hint: 'Texte libre.' };
    }
  }

  // ---------------------------------------------------------------- 6 suggestions
  function siblings(schema, entities, draft) {
    var mine = EM().typeClosure(schema, draft.types);
    return entities.filter(function (e) {
      return e.types.some(function (t) { return mine.indexOf(t) >= 0; });
    });
  }

  /**
   * What other entities of the same type(s) put in this field, most used first: [{value, count}].
   * For ref/refs the list continues with the other eligible entities (most recently updated first,
   * count 0), so the UI can show a short "usual suspects" row then the rest.
   */
  function suggest(schema, entities, draft, path) {
    var f = EM().fieldOf(schema, path);
    if (!f) return [];
    var counts = {};
    var order = [];
    siblings(schema, entities, draft).forEach(function (e) {
      var v = EM().getValue(e, path);
      if (v === undefined) return;
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        var k = String(x);
        if (!(k in counts)) {
          counts[k] = 0;
          order.push({ k: k, v: x });
        }
        counts[k] += 1;
      });
    });
    var list = order
      .map(function (o) { return { value: o.v, count: counts[o.k] }; })
      .sort(function (a, b) { return b.count - a.count; });
    if (f.field.kind === 'date' || f.field.kind === 'bool') return [];
    if (f.field.kind === 'ref' || f.field.kind === 'refs') {
      var inList = {};
      list = list.filter(function (x) {
        var e = EM().findById(entities, x.value);
        if (!e || !eligible(f.field, e, draft, schema)) return false;
        inList[x.value] = true;
        return true;
      });
      var rest = entities
        .filter(function (e) { return !inList[e.id] && eligible(f.field, e, draft, schema); })
        .sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); })
        .map(function (e) { return { value: e.id, count: 0 }; });
      return list.concat(rest);
    }
    return list.slice(0, 4);
  }

  /** Can `entity` be the target of this link field? With `schema`, a City is eligible where a Place is asked. */
  function eligible(field, entity, draft, schema) {
    if (entity.id === draft.id) return false;
    if (!field.refTypes || !field.refTypes.length) return true;
    var types = schema ? EM().typeClosure(schema, entity.types) : entity.types;
    return types.some(function (t) { return field.refTypes.indexOf(t) >= 0; });
  }

  /** Relation names already used in this workspace, then the defaults (for the links step). */
  function relationTypes(entities) {
    var counts = {};
    entities.forEach(function (e) {
      e.relations.forEach(function (r) {
        counts[r.type] = (counts[r.type] || 0) + 1;
      });
    });
    var used = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    DEFAULT_REL_TYPES.forEach(function (d) {
      if (!used.some(function (u) { return EM().normKey(u) === EM().normKey(d); })) used.push(d);
    });
    return used;
  }

  /**
   * Types to offer for a nature ("c'est un lieu"): every type whose nature (own or inherited) is it, the
   * parent types first. Without a nature: all types.
   */
  function typesOfNature(schema, natureId) {
    return (schema.types || []).filter(function (t) {
      return !natureId || EM().natureOfType(schema, t.id) === natureId;
    });
  }

  /** Natures the draft has through its chosen types. */
  function naturesOfDraft(schema, draft) {
    return EM().naturesOf(schema, { types: draft.types });
  }

  /**
   * Relations to propose when linking the draft: those that fit its natures first (a place: "situé dans",
   * "abrite"...), then the relation names already used in the workspace, then the rest of the vocabulary.
   * @returns {{label:string, inverse:string, category:string, builtin:boolean, used:number}[]}
   */
  function relationChoices(schema, entities, draft) {
    var counts = {};
    entities.forEach(function (e) {
      e.relations.forEach(function (r) {
        counts[r.type] = (counts[r.type] || 0) + 1;
      });
    });
    var out = [];
    var seen = {};
    function push(label, def) {
      var k = EM().normKey(label);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push({
        label: label,
        inverse: def ? EM().inverseLabel(label) : '',
        category: def ? def.category : '',
        builtin: !!def,
        used: counts[label] || 0,
      });
    }
    EM()
      .relationsFor(naturesOfDraft(schema, draft))
      .forEach(function (d) { push(d.name, d); });
    Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .forEach(function (label) {
        var m = EM().matchRelation(label);
        push(m ? (m.dir === 'inv' ? m.def.inverse : m.def.name) : label, m && m.def);
      });
    return out;
  }

  /**
   * What the "Liens" step asks, depending on what the draft is: an idea or a convention is asked what
   * embodies it (grounding), a place what it is in, a piece of matter what it is made of or by whom...
   * @returns {{title:string, hint:string, suggested:string[]}}
   */
  function linksPrompt(schema, draft) {
    var name = draft.name ? '« ' + draft.name + ' »' : 'cette entité';
    var natures = naturesOfDraft(schema, draft);
    var has = function (n) { return natures.indexOf(n) >= 0; };
    var material = natures.some(function (n) { return EM().realmOf(n) === 'material'; });
    if (natures.length && !material) {
      return {
        title: 'Qu’est-ce qui incarne ou exprime ' + name + ' ?',
        hint: 'Une idée ou une convention n’existe que par ce qui la porte : une personne, un lieu, un objet, un texte, un geste. Reliez ' + name + ' à au moins un de ces appuis, ou à une idée plus générale (sorte de, s’oppose à).',
        suggested: ['ancré dans', 'exprimé par', 'instance de', 'sorte de', 's’oppose à'],
      };
    }
    if (has('place')) {
      return { title: 'Où ' + name + ' se situe-t-il, et que contient-il ?', hint: 'Un lieu s’emboîte dans un autre : une pièce dans un bâtiment, dans une ville, dans un pays.', suggested: ['situé dans', 'abrite', 'fait partie de'] };
    }
    if (has('agent')) {
      return { title: 'Qui est ' + name + ' lié à ?', hint: 'Où il habite, pour qui il travaille, de quoi il est membre.', suggested: ['travaille pour', 'habite à', 'membre de'] };
    }
    if (has('matter') || has('living')) {
      return { title: 'De quoi ' + name + ' est-il fait, et par qui ?', hint: 'La matière dont il est composé, qui l’a fabriqué, à qui il appartient, où il se trouve.', suggested: ['fait de', 'fabriqué par', 'appartient à', 'situé dans'] };
    }
    if (has('event')) {
      return { title: 'Où et avec qui ?', hint: 'Le lieu, ce qui précède ou suit.', suggested: ['situé dans', 'précède', 'dépend de'] };
    }
    return { title: 'Autres liens ?', hint: 'Relier ' + name + ' à d’autres entités : contient, fait partie de, près de…', suggested: [] };
  }

  // ---------------------------------------------------------------- 7 issues
  /**
   * Problems with a draft: level 'error' blocks creation, 'warn' is shown but allowed.
   * `others` = the other drafts of the same composition (their names also count as taken).
   */
  function issues(schema, entities, draft, others) {
    var out = [];
    var name = trim(draft.name);
    if (!name) {
      out.push({ level: 'error', code: 'name-required', message: 'Donnez un nom à l’entité.' });
      return out;
    }
    if (entities.length + (others ? others.length : 0) >= EM().MAX_ENTITIES) {
      out.push({ level: 'error', code: 'too-many', message: 'Limite de ' + EM().MAX_ENTITIES + ' entités atteinte.' });
    }
    var pool = entities.concat(
      (others || []).map(function (d) {
        return { id: d.id, name: d.name, aliases: d.aliases, draft: true };
      })
    );
    var nameKey = stemOf(name);
    pool.forEach(function (e) {
      if (e.id === draft.id) return;
      var theirs = [e.name].concat(e.aliases || []).map(stemOf);
      if (theirs.indexOf(nameKey) >= 0) {
        out.push({
          level: 'warn',
          code: 'duplicate-name',
          other: e.id,
          message: '« ' + e.name + ' » existe déjà' + (e.draft ? ' dans cette composition' : '') + ' : l’assistant ne saura pas les distinguer.',
        });
      }
    });
    draft.aliases.forEach(function (a) {
      var k = stemOf(a);
      if (k === nameKey) return;
      pool.forEach(function (e) {
        if (e.id === draft.id) return;
        var theirs = [e.name].concat(e.aliases || []).map(stemOf);
        if (theirs.indexOf(k) >= 0) {
          out.push({
            level: 'warn',
            code: 'alias-clash',
            other: e.id,
            message: 'L’alias « ' + a + ' » désigne déjà « ' + e.name + ' » : « au ' + a + ' » sera ambigu.',
          });
        }
      });
    });
    ontologyIssuesOf(schema, entities, draft, others).forEach(function (i) { out.push(i); });
    if (!draft.types.length) {
      out.push({
        level: 'warn',
        code: 'no-type',
        message: 'Sans type, l’entité ne sera retrouvée que par son nom (pas par « mes plantes »).',
      });
    }
    return out;
  }

  /** A draft seen as an entity, so that the model's ontology checks can run on it before it exists. */
  function pseudoEntity(schema, d) {
    var data = {};
    Object.keys(d.answers || {}).forEach(function (p) {
      var q = p.split('.');
      data[q[0]] = data[q[0]] || {};
      data[q[0]][q[1]] = d.answers[p];
    });
    return { id: d.id, name: trim(d.name) || 'Sans nom', aliases: d.aliases || [], types: d.types || [], base: '', data: data, relations: d.relations || [], history: [] };
  }

  /** Containment loops, odd relations and floating abstractions of one draft, among entities and sibling drafts. */
  function ontologyIssuesOf(schema, entities, draft, others) {
    var pool = entities.concat((others || []).map(function (o) { return pseudoEntity(schema, o); }));
    var me = pseudoEntity(schema, draft);
    return EM().ontologyIssues(schema, pool.concat([me]), me);
  }

  function hasError(list) {
    return list.some(function (i) { return i.level === 'error'; });
  }

  // ---------------------------------------------------------------- 8 finalize
  /**
   * Creates every draft as an entity. Links to a draft that is not part of `drafts` and to an entity
   * that does not exist are dropped. Drafts with an error are skipped and reported.
   * @returns {{entities:object[], created:object[], skipped:object[]}}
   */
  function finalize(schema, entities, drafts, opts) {
    var known = {};
    entities.forEach(function (e) { known[e.id] = true; });
    var valid = drafts.filter(function (d) {
      return !hasError(issues(schema, entities, d, drafts.filter(function (o) { return o !== d; })));
    });
    var skipped = drafts.filter(function (d) { return valid.indexOf(d) < 0; });
    valid.forEach(function (d) { known[d.id] = true; });
    var created = valid.map(function (d) {
      var data = {};
      Object.keys(d.answers).forEach(function (path) {
        var f = EM().fieldOf(schema, path);
        if (!f) return;
        var v = d.answers[path];
        if (f.field.kind === 'ref' && !known[v]) return;
        if (f.field.kind === 'refs') {
          v = (v || []).filter(function (x) { return known[x]; });
        }
        var p = path.split('.');
        data[p[0]] = data[p[0]] || {};
        data[p[0]][p[1]] = v;
      });
      return EM().createEntity(
        schema,
        {
          id: d.id,
          name: d.name,
          base: d.base && EM().findById(entities, d.base) ? d.base : '',
          aliases: d.aliases,
          types: d.types,
          components: (d.components || []).filter(function (c) { return !!EM().findById(schema.components, c); }),
          data: data,
          relations: d.relations.filter(function (r) { return known[r.to]; }),
        },
        opts
      );
    });
    return { entities: entities.concat(created), created: created, skipped: skipped };
  }

  // ---------------------------------------------------------------- 9 export
  global.EntitiesComposer = {
    DEFAULT_REL_TYPES: DEFAULT_REL_TYPES,
    parseFieldSpec: parseFieldSpec,
    fieldSpecText: fieldSpecText,
    defineType: defineType,
    newDraft: newDraft,
    withDraft: withDraft,
    setAnswer: setAnswer,
    toggleType: toggleType,
    toggleComponent: toggleComponent,
    componentsAvailable: componentsAvailable,
    defineComponent: defineComponent,
    defaultFor: defaultFor,
    archetypeChoices: archetypeChoices,
    setBase: setBase,
    inheritedValue: inheritedValue,
    pruneAnswers: pruneAnswers,
    addRelationTo: addRelationTo,
    removeRelationFrom: removeRelationFrom,
    completeness: completeness,
    readIntent: readIntent,
    applyIntent: applyIntent,
    stepsFor: stepsFor,
    questionFor: questionFor,
    suggest: suggest,
    eligible: eligible,
    relationTypes: relationTypes,
    typesOfNature: typesOfNature,
    naturesOfDraft: naturesOfDraft,
    relationChoices: relationChoices,
    linksPrompt: linksPrompt,
    pseudoEntity: pseudoEntity,
    issues: issues,
    hasError: hasError,
    finalize: finalize,
  };
})(typeof window !== 'undefined' ? window : this);
