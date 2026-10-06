/*
 * Role: AI ideas for the Entity composer. From the name typed (and the genres already chosen) it asks the user's
 * configured model for what is likely true about the thing: its genre, other names, values for the fields its
 * genres carry, and links to entities that already exist. Everything comes back as small SUGGESTIONS the user
 * accepts with one click; nothing is applied on its own. The model's answer is validated against the schema
 * (unknown genres, fields, options and entities are dropped), so a bad answer only means fewer ideas.
 *
 * Usage: EntitiesComposerAI.suggest(t, { schema, entities, draft, choices, signal? }) -> Promise<item[]>
 *        EntitiesComposerAI.available(t) -> Promise<boolean>
 *        EntitiesComposerAI.apply(schema, draft, item) -> draft   (items of kind alias | answer | relation | type)
 *   item = { id, kind, label, detail?, icon, ... } (see parse)
 *
 * Contents: 1 prompt | 2 parse and validate | 3 apply | 4 provider call
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }
  function EC() {
    return global.EntitiesComposer;
  }

  var MAX_ENTITIES = 60;
  var MAX_ITEMS = 8;

  /* ── 1. Prompt ───────────────────────────────────────────────────── */

  /** The fields of the components the draft carries, as "path | label | kind | options". */
  function fieldLines(schema, draft) {
    var out = [];
    EM()
      .componentIdsOf(schema, draft)
      .forEach(function (cid) {
        var comp = EM().findById(schema.components, cid);
        if (!comp) return;
        comp.fields.forEach(function (f) {
          if (f.kind === 'geo') return;
          var line = cid + '.' + f.key + ' | ' + f.label + ' | ' + f.kind;
          if (f.options && f.options.length) line += ' | ' + f.options.join('/');
          if (f.unit) line += ' | unité: ' + f.unit;
          out.push(line);
        });
      });
    return out;
  }

  function buildMessages(ctx) {
    var schema = ctx.schema;
    var draft = ctx.draft;
    var genres = (ctx.choices || []).map(function (c) {
      return c.id + ' | ' + c.name + (c.installed ? '' : ' (à installer)');
    });
    var chosen = draft.types.map(function (id) {
      var t = EM().findById(schema.types, id);
      return t ? t.name : id;
    });
    var existing = ctx.entities.slice(0, MAX_ENTITIES).map(function (e) {
      return e.name;
    });
    var fields = fieldLines(schema, draft);
    var rels = EC().relationTypes(ctx.entities).slice(0, 8);
    var system = [
      'Tu aides à décrire une chose (une « entité ») dans une application de gestion. Réponds par un objet JSON seulement.',
      'Propose peu, mais juste : seulement ce dont tu es raisonnablement sûr d’après le nom. N’invente jamais de faits précis (dates, prix, adresses).',
      'Écris dans la langue du nom.',
      'Forme : {"types":[id],"aliases":[texte],"answers":{"chemin":valeur},"links":[{"type":texte,"to":nom}]}.',
      '- types : au plus 3 identifiants pris UNIQUEMENT dans la liste des genres, sans répéter ceux déjà choisis.',
      '- aliases : au plus 3 autres noms ou traductions courantes.',
      '- answers : valeurs plausibles pour des champs de la liste (chemin exact). nombre = nombre ; date = AAAA-MM-JJ ; oui-non = true/false ; choice = une des options ; multi = liste d’options ; texte = court.',
      '- links : au plus 3 liens vers des entités de la liste « Entités existantes » (nom exact), avec un type de lien parmi les types proposés.',
      'Si rien ne s’applique, renvoie des listes vides.',
    ].join('\n');
    var user = [
      'Nom : ' + draft.name,
      'Genres déjà choisis : ' + (chosen.join(', ') || 'aucun'),
      'Genres disponibles (id | nom) :\n' + (genres.join('\n') || 'aucun'),
      'Champs disponibles (chemin | libellé | genre | options) :\n' + (fields.join('\n') || 'aucun'),
      'Entités existantes : ' + (existing.join(', ') || 'aucune'),
      'Types de lien : ' + rels.join(', '),
    ].join('\n\n');
    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  /* ── 2. Parse and validate ───────────────────────────────────────── */

  function parseJson(text) {
    var s = String(text || '');
    try {
      return JSON.parse(s);
    } catch (e) {
      var a = s.indexOf('{');
      var b = s.lastIndexOf('}');
      if (a < 0 || b <= a) return null;
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch (e2) {
        return null;
      }
    }
  }

  function findEntityByName(entities, name) {
    var key = EM().normKey(name);
    if (!key) return null;
    var hit = null;
    entities.forEach(function (e) {
      if (hit) return;
      if ([e.name].concat(e.aliases || []).some(function (l) { return EM().normKey(l) === key; })) hit = e;
    });
    return hit;
  }

  /** The value as the field wants it, or undefined when it does not fit. */
  function coerce(field, v, entities) {
    if (v === undefined || v === null || v === '') return undefined;
    var k = field.kind;
    if (k === 'number') {
      var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      return isFinite(n) ? n : undefined;
    }
    if (k === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined;
    if (k === 'bool') return v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined;
    if (k === 'choice') {
      var key = EM().normKey(v);
      var opt = (field.options || []).filter(function (o) { return EM().normKey(o) === key; })[0];
      return opt;
    }
    if (k === 'multi') {
      var list = (Array.isArray(v) ? v : [v])
        .map(function (x) {
          return (field.options || []).filter(function (o) { return EM().normKey(o) === EM().normKey(x); })[0];
        })
        .filter(Boolean);
      return list.length ? list : undefined;
    }
    if (k === 'ref' || k === 'refs') {
      var names = Array.isArray(v) ? v : [v];
      var ids = names
        .map(function (x) { return findEntityByName(entities, x); })
        .filter(function (e) { return e && (!field.refTypes || !field.refTypes.length || e.types.some(function (t) { return field.refTypes.indexOf(t) >= 0; })); })
        .map(function (e) { return e.id; });
      if (!ids.length) return undefined;
      return k === 'ref' ? ids[0] : ids;
    }
    if (k === 'url') return /^https?:\/\//i.test(String(v)) ? String(v) : undefined;
    var s = String(v).trim();
    return s ? s.slice(0, k === 'longtext' ? 600 : 120) : undefined;
  }

  /**
   * Turns the model's text into suggestions that can be applied to the draft. Anything already on the draft,
   * or that does not exist in the schema, is dropped.
   * @returns {object[]} items: { id, kind:'type'|'alias'|'answer'|'relation', label, detail, icon, ... }
   */
  function parse(text, ctx) {
    var data = parseJson(text);
    var out = [];
    if (!data || typeof data !== 'object') return out;
    var schema = ctx.schema;
    var draft = ctx.draft;
    var seen = {};
    function add(item) {
      if (seen[item.id]) return;
      seen[item.id] = true;
      out.push(item);
    }
    (Array.isArray(data.types) ? data.types : []).slice(0, 3).forEach(function (id) {
      var c = (ctx.choices || []).filter(function (x) { return x.id === id; })[0];
      if (!c || draft.types.indexOf(c.id) >= 0) return;
      add({ id: 'type:' + c.id, kind: 'type', label: c.name, detail: 'Genre', icon: c.icon || 'category', typeId: c.id, installed: c.installed });
    });
    (Array.isArray(data.aliases) ? data.aliases : []).slice(0, 3).forEach(function (a) {
      var name = typeof a === 'string' ? a.trim() : '';
      var key = EM().normKey(name);
      if (!key || key === EM().normKey(draft.name)) return;
      if (draft.aliases.some(function (x) { return EM().normKey(x) === key; })) return;
      add({ id: 'alias:' + key, kind: 'alias', label: name, detail: 'Autre nom', icon: 'tag', alias: name });
    });
    var answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
    Object.keys(answers).forEach(function (path) {
      if (draft.answers[path] !== undefined) return;
      if (EM().componentIdsOf(schema, draft).indexOf(path.split('.')[0]) < 0) return;
      var f = EM().fieldOf(schema, path);
      if (!f || f.field.kind === 'geo') return;
      var value = coerce(f.field, answers[path], ctx.entities);
      if (value === undefined) return;
      var shown = EM().formatValue(f.field, value, ctx.entities);
      add({ id: 'answer:' + path, kind: 'answer', label: shown, detail: f.field.label, icon: 'sparkles', path: path, value: value });
    });
    (Array.isArray(data.links) ? data.links : []).slice(0, 3).forEach(function (l) {
      if (!l || typeof l !== 'object') return;
      var e = findEntityByName(ctx.entities, l.to);
      var type = typeof l.type === 'string' ? l.type.trim() : '';
      if (!e || !type) return;
      if (draft.relations.some(function (r) { return r.to === e.id; })) return;
      add({ id: 'link:' + e.id, kind: 'relation', label: e.name, detail: type, icon: 'link', relType: type, to: e.id });
    });
    return out.slice(0, MAX_ITEMS);
  }

  /* ── 3. Apply ────────────────────────────────────────────────────── */

  /** The draft with one suggestion accepted (a genre that must be installed first is handled by the caller). */
  function apply(schema, draft, item) {
    if (item.kind === 'type') return EC().pruneAnswers(schema, EC().toggleType(schema, draft, item.typeId, true));
    if (item.kind === 'alias') return Object.assign({}, draft, { aliases: draft.aliases.concat([item.alias]) });
    if (item.kind === 'answer') return EC().setAnswer(draft, item.path, item.value);
    if (item.kind === 'relation') return EC().addRelationTo(draft, item.relType, item.to);
    return draft;
  }

  /* ── 4. Provider call ────────────────────────────────────────────── */

  var cache = {};

  async function provider(t) {
    var Agent = global.PriorityAgent;
    if (!Agent || typeof Agent.getProvider !== 'function' || typeof Agent.chatCompletions !== 'function') return null;
    try {
      var p = await Agent.getProvider(t);
      return Agent.isConfigured(p) ? p : null;
    } catch (e) {
      return null;
    }
  }

  async function available(t) {
    return !!(await provider(t));
  }

  /** Never rejects: no provider, a network error or a bad answer all give []. */
  async function suggest(t, ctx) {
    var name = (ctx.draft.name || '').trim();
    if (name.length < 2) return [];
    var key = [EM().normKey(name), ctx.draft.types.slice().sort().join(',')].join('|');
    if (cache[key]) return parse(cache[key], ctx);
    var p = await provider(t);
    if (!p) return [];
    try {
      var res = await global.PriorityAgent.chatCompletions(p, buildMessages(ctx), {
        temperature: 0.2,
        jsonMode: true,
        max_tokens: 700,
        stream: false,
      });
      var text = res && typeof res.content === 'string' ? res.content : '';
      if (text) cache[key] = text;
      return parse(text, ctx);
    } catch (e) {
      return [];
    }
  }

  global.EntitiesComposerAI = {
    available: available,
    suggest: suggest,
    buildMessages: buildMessages,
    parse: parse,
    apply: apply,
  };
})(typeof window !== 'undefined' ? window : this);
