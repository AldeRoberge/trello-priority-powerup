/*
 * Role: AI for the Systems of the Entities. Two jobs, both validated against the real schema so a bad answer
 * only means "nothing proposed":
 *   author   a rule written in plain French ("quand une bouteille est vide, crée une carte pour la racheter")
 *            becomes a System (components, conditions, message, card) the user previews and approves.
 *   observe  a sentence about what happened ("j'ai fini l'eau") becomes proposed value changes on the entities
 *            it names ("Eau : Niveau = 0"), which the user accepts one by one. Nothing is applied here.
 * Uses the user's configured model through EntitiesComposerAI.provider; never rejects.
 *
 * Contents: 1 author | 2 observe | 3 provider call | 4 export
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }

  var MAX_CANDIDATES = 6;

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

  /** "path | label | kind | options | unité" for the fields of some components. */
  function fieldLines(schema, componentIds) {
    var out = [];
    componentIds.forEach(function (cid) {
      var comp = EM().findById(schema.components, cid);
      if (!comp || comp.builtin) return;
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

  // ---------------------------------------------------------------- 1 author
  function authorMessages(schema, text) {
    var comps = schema.components
      .filter(function (c) {
        return !c.builtin && c.fields.length;
      })
      .map(function (c) {
        return c.id + ' | ' + c.name;
      });
    var system = [
      'Tu transformes une règle écrite en français en une « règle de surveillance » pour une application de gestion. Réponds par un objet JSON seulement.',
      'Forme : {"name":texte court,"on":[idComposant],"when":[{"path":"composant.champ","op":opération,"value":valeur}],"then":{"text":message,"level":"info"|"warn"|"alert","card":titre de carte ou absent}}.',
      '- on : identifiants pris UNIQUEMENT dans la liste des composants ; l’entité doit les porter tous.',
      '- when : toutes les conditions doivent être vraies ; chaque path doit être un champ d’un composant de « on », pris dans la liste des champs.',
      '- opérations : eq (égal), ne (différent), gt (plus grand que), lt (plus petit que), set (rempli), empty (vide), contains (contient), in (parmi une liste).',
      '  Pour les dates : past (déjà passée, sans value), soon (dans N jours ou moins, value = N), ago (il y a plus de N jours, value = N).',
      '  Pour un niveau ou un nombre à zéro : eq avec value 0. Pour un oui/non : eq avec true ou false.',
      '- then.text : le message affiché ; {name} = le nom de l’entité, {composant.champ} = la valeur d’un champ. then.card : titre de la carte à proposer, seulement si l’utilisateur veut une tâche ou un rappel.',
      'Si la règle ne peut pas s’exprimer avec ces composants et champs, renvoie {"error":"raison courte"}.',
      'Écris en français du Québec, sans tirets cadratins.',
    ].join('\n');
    var user = [
      'Règle : ' + String(text || '').slice(0, 400),
      'Composants (id | nom) :\n' + (comps.join('\n') || 'aucun'),
      'Champs (chemin | libellé | genre | options) :\n' + (fieldLines(schema, schema.components.map(function (c) { return c.id; })).join('\n') || 'aucun'),
    ].join('\n\n');
    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  /** The validated System the model described, or null. An id already in the schema gets a numeric suffix. */
  function parseRule(text, schema) {
    var data = parseJson(text);
    if (!data || data.error || typeof data !== 'object') return null;
    var sys = EM().normalizeSystem(data, schema);
    if (!sys) return null;
    var taken = {};
    (schema.systems || []).forEach(function (s) {
      taken[s.id] = true;
    });
    var base = sys.id;
    var n = 2;
    while (taken[sys.id]) sys.id = base + '_' + n++;
    return sys;
  }

  // ---------------------------------------------------------------- 2 observe
  /** Entities the sentence names (exact name or alias, longest first), at most MAX_CANDIDATES. */
  function candidatesFor(schema, entities, text) {
    var r = EM().resolveText(schema, entities, text);
    var ids = {};
    (r.mentions || []).forEach(function (m) {
      if (m.kind === 'entity') ids[m.id] = true;
    });
    return entities
      .filter(function (e) {
        return ids[e.id];
      })
      .slice(0, MAX_CANDIDATES);
  }

  function observeMessages(schema, candidates, flat, text) {
    var blocks = candidates.map(function (e, i) {
      var ids = EM().componentIdsOf(schema, e);
      var current = [];
      ids.forEach(function (cid) {
        var comp = EM().findById(schema.components, cid);
        (comp ? comp.fields : []).forEach(function (f) {
          var v = EM().getValue(flat[i], cid + '.' + f.key);
          if (v !== undefined) current.push(cid + '.' + f.key + ' = ' + EM().formatValue(f, v, flat));
        });
      });
      return ['Entité : ' + e.name, 'Champs (chemin | libellé | genre | options) :', fieldLines(schema, ids).join('\n') || 'aucun', 'Valeurs actuelles : ' + (current.join('; ') || 'aucune')].join('\n');
    });
    var system = [
      'L’utilisateur raconte ce qui vient de se passer. Tu en déduis les changements de valeurs sur les entités nommées. Réponds par un objet JSON seulement.',
      'Forme : {"changes":[{"entity":nom exact,"path":"composant.champ","value":valeur}]}.',
      '- Seulement ce que la phrase affirme ou implique directement (« j’ai fini l’eau » : niveau 0 ; « terminé » : statut terminé). N’invente rien.',
      '- path : un chemin exact de la liste des champs de cette entité. nombre = nombre ; date = AAAA-MM-JJ ; oui-non = true/false ; choice = une des options.',
      'Si rien ne change, renvoie {"changes":[]}.',
    ].join('\n');
    var user = ['Phrase : ' + String(text || '').slice(0, 300), blocks.join('\n\n')].join('\n\n');
    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  /**
   * Proposed changes: [{ entityId, entityName, path, label, value, display, from }]. Each is checked with the
   * model's own setValue (so values are coerced like a manual edit) and dropped when unchanged or unknown.
   */
  function parseObservation(text, schema, candidates, flat) {
    var data = parseJson(text);
    var list = data && Array.isArray(data.changes) ? data.changes : [];
    var out = [];
    list.slice(0, 8).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var key = EM().normKey(c.entity);
      var idx = -1;
      candidates.forEach(function (e, i) {
        if (idx < 0 && EM().normKey(e.name) === key) idx = i;
      });
      if (idx < 0) return;
      var e = candidates[idx];
      var path = String(c.path || '');
      var f = EM().fieldOf(schema, path);
      if (!f || EM().componentIdsOf(schema, e).indexOf(path.split('.')[0]) < 0) return;
      if (f.field.kind === 'ref' || f.field.kind === 'refs') return; // links are chosen by the user, not guessed
      var next;
      try {
        next = EM().setValue(schema, e, path, c.value);
      } catch (err) {
        return;
      }
      if (next === e) return;
      var value = EM().getValue(next, path);
      if (value === undefined) return;
      out.push({
        entityId: e.id,
        entityName: e.name,
        path: path,
        label: f.field.label,
        value: value,
        display: EM().formatValue(f.field, value, candidates),
        from: EM().getValue(flat[idx], path),
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- 3 provider call
  async function ask(t, messages, maxTokens) {
    var CA = global.EntitiesComposerAI;
    var p = CA && CA.provider ? await CA.provider(t) : null;
    if (!p) return { error: 'no-ai' };
    try {
      var res = await global.PriorityAgent.chatCompletions(p, messages, { temperature: 0.1, jsonMode: true, max_tokens: maxTokens, stream: false });
      return { text: res && typeof res.content === 'string' ? res.content : '' };
    } catch (e) {
      return { error: 'failed' };
    }
  }

  /** @returns {Promise<{system?:object, error?:string}>} error: 'no-ai' | 'failed' | 'unclear' */
  async function author(t, schema, text) {
    if (String(text || '').trim().length < 6) return { error: 'unclear' };
    var r = await ask(t, authorMessages(schema, text), 600);
    if (r.error) return { error: r.error };
    var sys = parseRule(r.text, schema);
    return sys ? { system: sys } : { error: 'unclear' };
  }

  /** @returns {Promise<{changes?:object[], error?:string}>} an empty list when the sentence names no known entity */
  async function observe(t, schema, entities, text) {
    var candidates = candidatesFor(schema, entities, text);
    if (!candidates.length) return { changes: [] };
    var flat = EM().flatten(candidates, schema);
    var r = await ask(t, observeMessages(schema, candidates, flat, text), 500);
    if (r.error) return { error: r.error };
    return { changes: parseObservation(r.text, schema, candidates, flat) };
  }

  // ---------------------------------------------------------------- 4 export
  global.EntitiesSystemsAI = {
    authorMessages: authorMessages,
    parseRule: parseRule,
    author: author,
    candidatesFor: candidatesFor,
    observeMessages: observeMessages,
    parseObservation: parseObservation,
    observe: observe,
  };
})(typeof window !== 'undefined' ? window : this);
