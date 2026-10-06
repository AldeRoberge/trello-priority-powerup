/*
 * Role: the S of the ECS. A System is a declarative rule stored in the schema (EntitiesModel.normalizeSystem):
 * "every entity that carries these components and meets these conditions gets a finding, and may propose a
 * card" (an empty water bottle, a product about to expire, a task past its due date). evaluate() is pure and
 * reads the entities as they are (values inherited from models and archetype defaults included); nothing is
 * written. Ready-made rules (PRESETS) install their components first. Also: plain-French descriptions of a rule
 * for the UI, and a lint that spots fields duplicated across components (the guard against granularity turning
 * into chaos). Pure data + functions (no DOM, no Trello). Docs: docs/entities.md, section Systèmes.
 *
 * Contents: 1 evaluate | 2 wording | 3 presets | 4 duplicate fields | 5 export
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }

  var LEVEL_RANK = { alert: 0, warn: 1, info: 2 };

  // ---------------------------------------------------------------- 1 evaluate
  function isoDay(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function shiftDays(now, n) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
    return isoDay(d);
  }

  /** Does one condition hold for the value of its field? Dates are ISO strings, so they compare as text. */
  function holds(cond, actual, now) {
    var today = isoDay(now);
    var day = typeof actual === 'string' ? actual.slice(0, 10) : '';
    switch (cond.op) {
      case 'past':
        return !!day && day < today;
      case 'soon':
        return !!day && day <= shiftDays(now, Number(cond.value) || 0);
      case 'ago':
        return !!day && day <= shiftDays(now, -(Number(cond.value) || 0));
      default: {
        var expected = cond.value;
        // a rule written as text ("0") still compares with a number
        if (typeof actual === 'number' && typeof expected === 'string' && expected.trim() !== '' && isFinite(Number(expected))) expected = Number(expected);
        if (typeof actual === 'boolean' && typeof expected === 'string') expected = expected === 'true' || expected === 'oui';
        return EM().compare(cond.op, actual, expected);
      }
    }
  }

  function fillText(template, schema, entity, flat, all) {
    return String(template || '').replace(/\{([^{}]+)\}/g, function (m, token) {
      if (token === 'name') return entity.name;
      var f = EM().fieldOf(schema, token);
      var v = f ? EM().getValue(flat, token) : undefined;
      if (v === undefined) return '…';
      return EM().formatValue(f.field, v, all);
    });
  }

  /**
   * Findings of the enabled systems over the entities: [{ id, systemId, systemName, entityId, entityName,
   * level, text, card }], most severe first. opts.now (a Date) is for tests; opts.only restricts to one entity id.
   */
  function evaluate(schema, entities, opts) {
    var systems = (schema && schema.systems) || [];
    if (!systems.length) return [];
    var now = (opts && opts.now) || new Date();
    var flat = EM().flatten(entities, schema);
    var out = [];
    entities.forEach(function (entity, i) {
      if (opts && opts.only && entity.id !== opts.only) return;
      var have = EM().componentIdsOf(schema, entity);
      systems.forEach(function (sys) {
        if (!sys.enabled) return;
        if (
          !sys.on.every(function (cid) {
            return have.indexOf(cid) >= 0;
          })
        ) {
          return;
        }
        var ok = sys.when.every(function (c) {
          return holds(c, EM().getValue(flat[i], c.path), now);
        });
        if (!ok) return;
        out.push({
          id: sys.id + ':' + entity.id,
          systemId: sys.id,
          systemName: sys.name,
          entityId: entity.id,
          entityName: entity.name,
          level: sys.then.level,
          text: fillText(sys.then.text, schema, entity, flat[i], entities),
          card: sys.then.card ? fillText(sys.then.card, schema, entity, flat[i], entities) : '',
        });
      });
    });
    out.sort(function (a, b) {
      return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.entityName.localeCompare(b.entityName);
    });
    return out;
  }

  // ---------------------------------------------------------------- 2 wording
  var OP_WORDS = {
    eq: 'est',
    ne: 'n’est pas',
    gt: 'dépasse',
    lt: 'est sous',
    set: 'est rempli',
    empty: 'est vide',
    in: 'est parmi',
    contains: 'contient',
    past: 'est passé',
  };

  function conditionText(schema, c) {
    var f = EM().fieldOf(schema, c.path);
    var label = f ? f.field.label : c.path;
    if (c.op === 'soon') return label + ' dans ' + c.value + ' jours ou moins';
    if (c.op === 'ago') return label + ' depuis plus de ' + c.value + ' jours';
    var v = c.value === undefined ? '' : ' ' + (Array.isArray(c.value) ? c.value.join(' ou ') : typeof c.value === 'boolean' ? (c.value ? 'oui' : 'non') : c.value);
    return label + ' ' + (OP_WORDS[c.op] || c.op) + v;
  }

  /** "Contenant : Niveau est 0" in one line, for the rule list. */
  function describe(schema, sys) {
    var comps = sys.on.map(function (cid) {
      var c = EM().findById(schema.components, cid);
      return c ? c.name : cid;
    });
    return comps.join(' + ') + ' : ' + sys.when.map(function (c) { return conditionText(schema, c); }).join(', ');
  }

  // ---------------------------------------------------------------- 3 presets
  var PRESETS = [
    {
      id: 'contenant_vide',
      name: 'Contenant vide',
      on: ['contenant'],
      when: [{ path: 'contenant.quantite', op: 'eq', value: 0 }],
      then: { text: '{name} est vide', level: 'warn', card: 'Racheter {name}' },
    },
    {
      id: 'bientot_perime',
      name: 'Bientôt périmé',
      on: ['consommable'],
      when: [
        { path: 'consommable.peremption', op: 'soon', value: 7 },
        { path: 'consommable.consomme', op: 'ne', value: true },
      ],
      then: { text: '{name} se périme le {consommable.peremption}', level: 'warn', card: 'Utiliser ou remplacer {name}' },
    },
    {
      id: 'echeance_depassee',
      name: 'Échéance dépassée',
      on: ['travail'],
      when: [
        { path: 'travail.echeance', op: 'past' },
        { path: 'travail.statut', op: 'ne', value: 'terminé' },
      ],
      then: { text: '{name} est en retard (échéance {travail.echeance})', level: 'alert' },
    },
    {
      id: 'sans_responsable',
      name: 'Sans responsable',
      on: ['assignation'],
      when: [{ path: 'assignation.assigne_a', op: 'empty' }],
      then: { text: 'Personne n’est assigné à {name}', level: 'info' },
    },
  ];

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  /**
   * Installs a ready-made rule: the components it reads first (the library's own, with what they require),
   * then the rule. Returns { schema } or { schema, error } when a component is unknown or the schema is full.
   */
  function install(schema, presetId) {
    var p = presetById(presetId);
    if (!p) return { schema: schema, error: 'unknown' };
    var next = schema;
    var EL = global.EntitiesLibrary;
    p.on.forEach(function (cid) {
      if (EL && !EM().findById(next.components, cid)) next = EL.ensureComponent(next, cid);
    });
    var shaped = EM().upsertSystem(next, p);
    var done = (shaped.systems || []).some(function (s) {
      return s.id === p.id;
    });
    if (!done) return { schema: schema, error: 'missing-component' };
    if (JSON.stringify(shaped).length > EM().MAX_SCHEMA_CHARS) return { schema: schema, error: 'schema-too-large' };
    return { schema: shaped };
  }

  // ---------------------------------------------------------------- 4 duplicate fields
  /**
   * Fields that appear, same label and same kind, in several components ("Péremption" in Produit and in
   * Consommable): candidates for being one atom. [{ label, kind, paths:['a.x','b.y'] }], most repeated first.
   * Generic labels (notes, source) are ignored: they are meant to repeat.
   */
  var GENERIC = ['notes', 'source', 'statut', 'niveau', 'usage', 'dans', 'definition'];

  function duplicateFields(schema) {
    var seen = {};
    (schema.components || []).forEach(function (c) {
      c.fields.forEach(function (f) {
        var key = EM().normKey(f.label) + '|' + f.kind;
        if (GENERIC.indexOf(EM().normKey(f.label)) >= 0) return;
        (seen[key] = seen[key] || { label: f.label, kind: f.kind, paths: [] }).paths.push(c.id + '.' + f.key);
      });
    });
    return Object.keys(seen)
      .map(function (k) {
        return seen[k];
      })
      .filter(function (x) {
        return x.paths.length > 1;
      })
      .sort(function (a, b) {
        return b.paths.length - a.paths.length;
      });
  }

  // ---------------------------------------------------------------- 5 export
  global.EntitiesSystems = {
    PRESETS: PRESETS,
    presetById: presetById,
    install: install,
    evaluate: evaluate,
    holds: holds,
    describe: describe,
    conditionText: conditionText,
    duplicateFields: duplicateFields,
  };
})(typeof window !== 'undefined' ? window : this);
