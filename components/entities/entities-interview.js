/*
 * Role: pure logic of the Entity INTERVIEW: instead of a page of fields, the composer asks one short question at a
 * time ("À qui appartient la tablette graphique ?"), each with a few suggested answers of which the best is already
 * highlighted, so Enter keeps the conversation going. It works on the same draft as EntitiesComposer (same
 * finalize, same result); the UI is entities-interview-ui.js and the background lookups are entities-interview-ai.js.
 *
 * A CARD is one question: { id, kind: 'type'|'field'|'batch'|'done', path?, question, options[], best, input }.
 *   option = { id, label, detail?, source?: 'usage'|'ia'|'web', action?: 'value'|'me'|'ask', ... }
 * HINTS come from the background lookups: { det, types:[{id,confidence}], candidates:{ path:[{label, confidence, source}] }, ask:[path] }.
 * Nothing here touches the DOM, Trello or the network.
 *
 * Usage: var p = EntitiesInterview.prepare(ctx); var card = EntitiesInterview.next(ctx);
 *        var r = EntitiesInterview.answer(ctx, card, { option: 0 } | { text } | { skip: true })
 *   ctx = { schema, entities (existing + other drafts as pseudo entities), draft, hints?, now?, library? }
 *   r   = { schema, draft, extra: [draft], sub?: card, error?: string }
 *
 * Contents: 1 words | 2 preparation | 3 slots | 4 cards | 5 answers | 6 thread
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }
  function EC() {
    return global.EntitiesComposer;
  }
  function LIB(ctx) {
    return (ctx && ctx.library) || global.EntitiesLibrary;
  }
  function QP() {
    if (global.QuickParse) return global.QuickParse;
    if (typeof require === 'function') {
      try {
        return require('../shared/quick-parse.js');
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }
  function trim(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }
  function key(s) {
    return EM().normKey(s);
  }

  /* ── 1. Words ────────────────────────────────────────────────────── */

  var VOWEL = /^[aeiouyàâäéèêëîïôöûùüh]/i;

  /**
   * The name with its article, as French needs it in a question: "la tablette graphique", "de la tablette graphique",
   * "l'écran", "de l'écran". `det` ('le'|'la'|"l'"|'les') overrides the guess (the model knows the gender).
   * A person or a place with a proper name keeps the bare name.
   */
  function words(name, det, bare) {
    var n = trim(name) || 'cette chose';
    if (bare) return { def: n, of: (VOWEL.test(n) ? 'd’' : 'de ') + n, at: 'à ' + n };
    var low = /^[A-ZÀ-Ý][^A-ZÀ-Ý]*$/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
    var d = det || '';
    if (!d) {
      if (/^les?\s|^la\s|^l['’]/i.test(low)) d = '';
      else if (/s$/i.test(low) && !/(us|is)$/i.test(low)) d = 'les';
      else if (VOWEL.test(low)) d = 'l’';
      else if (/(e|tion|té|ette|ure|ance|ence)$/i.test(low) && !/(age|ège|isme|ment|eur)$/i.test(low)) d = 'la';
      else d = 'le';
    }
    if (d === "l'") d = 'l’';
    var def = d ? (d === 'l’' ? d + low : d + ' ' + low) : low;
    var of = d === 'le' ? 'du ' + low : d === 'les' ? 'des ' + low : d === 'la' ? 'de la ' + low : d === 'l’' ? 'de l’' + low : 'de ' + low;
    var at = d === 'le' ? 'au ' + low : d === 'les' ? 'aux ' + low : d === 'la' ? 'à la ' + low : d === 'l’' ? 'à l’' + low : 'à ' + low;
    return { def: def, of: of, at: at };
  }

  function wordsOf(ctx) {
    var d = ctx.draft;
    var natures = EM().naturesOf(ctx.schema, d);
    var bare = natures.indexOf('agent') >= 0 || natures.indexOf('social') >= 0;
    return words(d.name, ctx.hints && ctx.hints.det, bare);
  }

  /** Question text for a field path, with the entity's name woven in. */
  function questionText(ctx, path, field) {
    var w = wordsOf(ctx);
    switch (path) {
      case 'propriete.proprietaire':
        return 'À qui appartient ' + w.def + ' ?';
      case 'produit.marque':
        return 'Quelle est la marque ' + w.of + ' ?';
      case 'produit.modele':
        return 'Quel est le modèle ?';
      case 'location.place':
        return 'Où se trouve ' + w.def + ' en ce moment ?';
      case 'acquisition.acquis_le':
        return 'Quand avez-vous acquis ' + w.def + ' ?';
      case 'acquisition.acquis_chez':
        return 'Où avez-vous acheté ' + w.def + ' ?';
      case 'provenance.prix':
        return 'Combien avez-vous payé ' + w.def + ' ?';
      case 'vivant.espece':
        return 'Quelle est l’espèce ' + w.of + ' ?';
      case 'personne.residence':
        return 'Où habite ' + w.def + ' ?';
      default:
        return field.label + ' ' + w.of + ' ?';
    }
  }

  /* ── 2. Preparation ──────────────────────────────────────────────── */

  /**
   * Makes sure the draft carries what a real-life thing is worth asking about: where it is, when it was acquired
   * and who owns it (components added to the draft, installed in the schema when missing). Existing schemas keep
   * their data: only missing components and the "Modèle" field of Produit are added.
   * @returns {{schema:object, draft:object}}
   */
  function prepare(ctx) {
    var lib = LIB(ctx);
    var s = ctx.schema;
    var d = ctx.draft;
    if (!lib || !d.types.length) return { schema: s, draft: d };
    var natures = EM().naturesOf(s, d);
    var thing = natures.indexOf('matter') >= 0 || natures.indexOf('living') >= 0;
    if (!thing) return { schema: s, draft: d };
    ['propriete', 'location', 'acquisition'].forEach(function (cid) {
      s = lib.ensureComponent(s, cid);
      if (EM().componentIdsOf(s, d).indexOf(cid) < 0 && EM().findById(s.components, cid)) d = EC().toggleComponent(s, d, cid, true);
    });
    if (EM().componentIdsOf(s, d).indexOf('produit') >= 0 && lib.ensureField) s = lib.ensureField(s, 'produit', 'modele');
    return { schema: s, draft: d };
  }

  /* ── 3. Slots ────────────────────────────────────────────────────── */

  // The questions worth asking first, in this order. Anything else is asked only when the lookups say it matters
  // (hints.ask) or when it belongs to a component the user wrote himself; "Tout voir" shows the rest.
  var CORE = [
    'propriete.proprietaire',
    'produit.marque',
    'produit.modele',
    'location.place',
    'acquisition.acquis_le',
    'provenance.prix',
    'vivant.espece',
    'personne.residence',
    'adresse.adresse',
  ];
  var SKIP_KINDS = { geo: 1, longtext: 1, url: 1, multi: 1 };

  function isPreset(cid) {
    var lib = global.EntitiesLibrary;
    return !!(lib && lib.COMPONENTS.some(function (c) { return c.id === cid; }));
  }

  function seenKey(path) {
    return 'iv:' + path;
  }

  function isOpen(draft, path) {
    return draft.answers[path] === undefined && !(draft.seen && draft.seen[seenKey(path)]);
  }

  /** The paths still to ask, in the order to ask them. */
  function slots(ctx) {
    var out = [];
    var ask = (ctx.hints && ctx.hints.ask) || [];
    var custom = {};
    EM()
      .componentIdsOf(ctx.schema, ctx.draft)
      .forEach(function (cid) {
        var comp = EM().findById(ctx.schema.components, cid);
        if (!comp) return;
        var n = 0;
        comp.fields.forEach(function (f) {
          if (SKIP_KINDS[f.kind]) return;
          var path = cid + '.' + f.key;
          if (!isOpen(ctx.draft, path)) return;
          var rank = CORE.indexOf(path);
          if (rank < 0 && ask.indexOf(path) >= 0) rank = 100 + ask.indexOf(path);
          if (rank < 0 && !isPreset(cid) && n < 4) rank = 200 + n;
          if (rank < 0) return;
          n += 1;
          out.push({ path: path, rank: rank });
        });
      });
    out.sort(function (a, b) { return a.rank - b.rank; });
    void custom;
    return out.map(function (x) { return x.path; });
  }

  /* ── 4. Cards ────────────────────────────────────────────────────── */

  function findMe(entities) {
    var names = ['moi', 'me', 'moi meme', 'myself'];
    var hit = null;
    entities.forEach(function (e) {
      if (hit) return;
      if ([e.name].concat(e.aliases || []).some(function (l) { return names.indexOf(key(l)) >= 0; })) hit = e;
    });
    return hit;
  }

  function isTypeOf(schema, e, typeId) {
    return EM().typeClosure(schema, e.types || []).indexOf(typeId) >= 0;
  }

  /** The user's employer: the organisation linked from "Moi", else the most recently updated organisation. */
  function findEmployer(ctx) {
    var orgs = ctx.entities.filter(function (e) { return isTypeOf(ctx.schema, e, 'organisation'); });
    var me = findMe(ctx.entities);
    if (me) {
      var linked = null;
      ctx.schema.components.forEach(function (c) {
        c.fields.forEach(function (f) {
          if (linked || f.kind !== 'ref' || !(f.refTypes || []).some(function (t) { return t === 'organisation'; })) return;
          var v = EM().getValue(me, c.id + '.' + f.key);
          if (v) linked = EM().findById(orgs, v);
        });
      });
      if (linked) return linked;
    }
    return orgs.slice().sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); })[0] || null;
  }

  function candidatesFor(ctx, path) {
    var c = ctx.hints && ctx.hints.candidates && ctx.hints.candidates[path];
    return Array.isArray(c) ? c : [];
  }

  function pushOption(list, opt) {
    var k = key(opt.label);
    if (!k || list.some(function (o) { return key(o.label) === k; })) return;
    list.push(opt);
  }

  function typeNamed(ctx, refTypes) {
    var t = (refTypes || [])[0];
    return t || '';
  }

  /** Entity options for a link field: those other entities of the same type use, then the model's ideas. */
  function entityOptions(ctx, path, field, max) {
    var list = [];
    EC()
      .suggest(ctx.schema, ctx.entities, ctx.draft, path)
      .slice(0, max)
      .forEach(function (s) {
        var e = EM().findById(ctx.entities, s.value);
        if (e) pushOption(list, { id: 'e:' + e.id, label: e.name, source: 'usage', action: 'value', entityId: e.id });
      });
    candidatesFor(ctx, path).forEach(function (c) {
      var e = findByName(ctx, field, c.label);
      if (e) pushOption(list, { id: 'e:' + e.id, label: e.name, source: c.source || 'ia', action: 'value', entityId: e.id, confidence: c.confidence });
      else pushOption(list, { id: 'n:' + key(c.label), label: c.label, detail: 'à créer', source: c.source || 'ia', action: 'value', create: { name: c.label }, confidence: c.confidence });
    });
    return list;
  }

  function findByName(ctx, field, name) {
    var k = key(name);
    if (!k) return null;
    var hit = null;
    ctx.entities.forEach(function (e) {
      if (hit || !EC().eligible(field, e, ctx.draft, ctx.schema)) return;
      if ([e.name].concat(e.aliases || []).some(function (l) { return key(l) === k; })) hit = e;
    });
    return hit;
  }

  function bestIndex(options) {
    if (!options.length) return -1;
    var best = 0;
    options.forEach(function (o, i) {
      if ((o.confidence || 0) > (options[best].confidence || 0)) best = i;
    });
    return best;
  }

  /** The question about one field path. */
  function cardFor(ctx, path) {
    var f = EM().fieldOf(ctx.schema, path);
    if (!f) return null;
    var field = f.field;
    var card = { id: 'f:' + path, kind: 'field', path: path, field: field, question: questionText(ctx, path, field), options: [], best: -1, input: { kind: field.kind, placeholder: '' } };
    if (path === 'propriete.proprietaire') return ownerCard(ctx, card);
    if (field.kind === 'ref' || field.kind === 'refs') {
      card.options = entityOptions(ctx, path, field, 3).slice(0, 5);
      card.input.placeholder = 'Chercher ou créer…';
      card.best = bestIndex(card.options);
      return card;
    }
    if (field.kind === 'bool') {
      card.options = [
        { id: 'b:1', label: 'Oui', action: 'value', value: true },
        { id: 'b:0', label: 'Non', action: 'value', value: false },
      ];
      return card;
    }
    if (field.kind === 'choice') {
      card.options = (field.options || []).map(function (o) { return { id: 'c:' + o, label: o, action: 'value', value: o }; });
      candidatesFor(ctx, path).forEach(function (c) {
        var i = card.options.findIndex(function (o) { return key(o.label) === key(c.label); });
        if (i >= 0) {
          card.options[i].source = c.source || 'ia';
          card.options[i].confidence = c.confidence;
        }
      });
      card.best = bestIndex(card.options.filter(function (o) { return o.confidence; }).length ? card.options : []);
      return card;
    }
    var opts = [];
    candidatesFor(ctx, path).forEach(function (c) {
      pushOption(opts, { id: 't:' + key(c.label), label: c.label, source: c.source || 'ia', action: 'value', raw: c.label, confidence: c.confidence });
    });
    if (field.kind !== 'date') {
      EC()
        .suggest(ctx.schema, ctx.entities, ctx.draft, path)
        .forEach(function (s) {
          pushOption(opts, { id: 't:' + key(s.value), label: String(s.value), source: 'usage', action: 'value', raw: String(s.value) });
        });
    }
    card.options = opts.slice(0, 5);
    card.best = bestIndex(card.options);
    card.input.placeholder =
      field.kind === 'date' ? 'Ex. : il y a 2 ans, octobre 2023, 15 mars 2022' : field.kind === 'number' ? 'Un nombre' + (field.unit ? ' (' + field.unit + ')' : '') : 'Autre…';
    return card;
  }

  function ownerCard(ctx, card) {
    var me = findMe(ctx.entities);
    var emp = findEmployer(ctx);
    card.options = [
      { id: 'o:person', label: 'Personne', detail: 'quelqu’un d’autre', action: 'ask', refTypes: ['personne'], sub: 'Quelle personne ?' },
      me ? { id: 'e:' + me.id, label: 'Moi', action: 'value', entityId: me.id } : { id: 'o:me', label: 'Moi', action: 'me' },
      emp ? { id: 'e:' + emp.id, label: 'Employeur', detail: emp.name, action: 'value', entityId: emp.id } : { id: 'o:org', label: 'Employeur', action: 'ask', refTypes: ['organisation'], sub: 'Quel employeur ?' },
    ];
    candidatesFor(ctx, 'propriete.proprietaire').forEach(function (c) {
      var e = findByName(ctx, card.field, c.label);
      if (e && !card.options.some(function (o) { return o.entityId === e.id; })) card.options.push({ id: 'e:' + e.id, label: e.name, source: c.source || 'ia', action: 'value', entityId: e.id });
    });
    card.best = 1;
    card.input = { kind: 'refs', placeholder: 'Quelqu’un d’autre…' };
    return card;
  }

  function typeCard(ctx) {
    var lib = LIB(ctx);
    var choices = EC().archetypeChoices(ctx.schema, lib);
    var byId = {};
    choices.forEach(function (c) { byId[c.id] = c; });
    var opts = [];
    function add(c, src, conf) {
      if (!c || opts.some(function (o) { return o.typeId === c.id; })) return;
      opts.push({ id: 't:' + c.id, label: c.name, detail: c.installed ? '' : 'à installer', icon: c.icon, source: src, action: 'type', typeId: c.id, installed: c.installed, confidence: conf });
    }
    ((ctx.hints && ctx.hints.types) || []).forEach(function (t) { add(byId[t.id], t.source || 'ia', t.confidence || 0.5); });
    var r = EM().resolveText(ctx.schema, ctx.entities, ctx.draft.name);
    r.mentions.forEach(function (m) { if (m.kind === 'type') add(byId[m.id], 'usage', 0.4); });
    ['objet', 'produit', 'personne', 'place', 'organisation', 'etre_vivant', 'evenement', 'concept'].forEach(function (id) { if (opts.length < 5) add(byId[id]); });
    return {
      id: 'type',
      kind: 'type',
      question: '« ' + (ctx.draft.name || 'Cette chose') + ' », c’est quel genre de chose ?',
      options: opts.slice(0, 6),
      best: opts.length ? 0 : -1,
      input: { kind: 'type', placeholder: 'Chercher un genre…' },
    };
  }

  function doneCard(ctx) {
    return { id: 'done', kind: 'done', question: 'C’est prêt. Créer « ' + (ctx.draft.name || 'cette entité') + ' » ?', options: [], best: -1, input: null };
  }

  /** Confident answers that need no typing are offered together: one Enter confirms them all. */
  function batchCard(ctx, paths) {
    if (ctx.draft.seen && ctx.draft.seen.ivNoBatch) return null;
    var items = [];
    for (var i = 0; i < paths.length && items.length < 4; i++) {
      var path = paths[i];
      if (path === 'propriete.proprietaire') break;
      var c = candidatesFor(ctx, path).filter(function (x) { return (x.confidence || 0) >= 0.6; })[0];
      if (!c) break;
      var f = EM().fieldOf(ctx.schema, path);
      var r = f && resolveInput(ctx, f.field, c.label, { noCreate: false });
      if (!r || !r.ok) break;
      items.push({ path: path, label: f.field.label, display: r.display, resolved: r, source: c.source || 'ia' });
    }
    if (items.length < 2) return null;
    return {
      id: 'batch:' + items.map(function (x) { return x.path; }).join('|'),
      kind: 'batch',
      question: 'Voici ce que je comprends. C’est bon ?',
      items: items,
      options: [
        { id: 'batch:ok', label: 'Oui, tout garder', action: 'batch' },
        { id: 'batch:edit', label: 'Modifier un par un', action: 'unbatch' },
      ],
      best: 0,
      input: null,
    };
  }

  /** The next question, or the final card when nothing is left to ask. */
  function next(ctx) {
    if (!ctx.draft.types.length) return typeCard(ctx);
    var paths = slots(ctx);
    if (!paths.length) return doneCard(ctx);
    return batchCard(ctx, paths) || cardFor(ctx, paths[0]);
  }

  /** The cards still to come (their questions only), for the progress hint. */
  function remaining(ctx) {
    return ctx.draft.types.length ? slots(ctx).length : 0;
  }

  /** Options of a card that match what the user typed ("kam" -> Kamvas Pro). */
  function matchOptions(card, text) {
    var k = key(text);
    if (!k) return card.options.map(function (o, i) { return i; });
    var out = [];
    card.options.forEach(function (o, i) {
      if (key(o.label + ' ' + (o.detail || '')).indexOf(k) >= 0) out.push(i);
    });
    return out;
  }

  /* ── 5. Answers ──────────────────────────────────────────────────── */

  function withSeen(draft, path) {
    var d = clone(draft);
    d.seen = d.seen || {};
    d.seen[seenKey(path)] = true;
    return d;
  }

  function personTypeId(ctx) {
    var lib = LIB(ctx);
    var s = ctx.schema;
    var t = lib && lib.installedAs(s, 'personne');
    if (t) return { schema: s, id: t.id };
    var r = lib && lib.install(s, 'personne');
    if (r && !r.error) return { schema: r.schema, id: (r.typeIds && r.typeIds.personne) || 'personne' };
    return { schema: s, id: '' };
  }

  function typeIdFor(ctx, refType) {
    var lib = LIB(ctx);
    var s = ctx.schema;
    if (!refType) return { schema: s, id: '' };
    if (EM().findById(s.types, refType)) return { schema: s, id: refType };
    var have = lib && lib.installedAs(s, refType);
    if (have) return { schema: s, id: have.id };
    var r = lib && lib.install(s, refType);
    if (r && !r.error) return { schema: r.schema, id: (r.typeIds && r.typeIds[refType]) || refType };
    return { schema: s, id: '' };
  }

  /**
   * Turns what the user typed (or a model idea) into the value the field stores.
   * @returns {{ok:boolean, value?:*, display?:string, create?:{name:string, refType:string}, label?:string}}
   */
  function resolveInput(ctx, field, raw, opts) {
    var text = trim(raw);
    if (!text) return { ok: false };
    switch (field.kind) {
      case 'number': {
        var n = parseFloat(text.replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
        return isFinite(n) ? { ok: true, value: n, display: EM().formatValue(field, n, []) } : { ok: false };
      }
      case 'date': {
        var qp = QP();
        var w = qp && qp.parseWhen ? qp.parseWhen(text, ctx.now) : null;
        return w ? { ok: true, value: w.iso, display: w.label, label: w.label } : { ok: false };
      }
      case 'bool':
        return /^(oui|yes|vrai|true|1)$/i.test(text) ? { ok: true, value: true, display: 'oui' } : /^(non|no|faux|false|0)$/i.test(text) ? { ok: true, value: false, display: 'non' } : { ok: false };
      case 'choice': {
        var hit = (field.options || []).filter(function (o) { return key(o) === key(text); })[0];
        return hit ? { ok: true, value: hit, display: hit } : { ok: false };
      }
      case 'ref':
      case 'refs': {
        var e = findByName(ctx, field, text);
        var v = function (id) { return field.kind === 'refs' ? [id] : id; };
        if (e) return { ok: true, value: v(e.id), display: e.name, entityId: e.id };
        if (opts && opts.noCreate) return { ok: false };
        return { ok: true, create: { name: text, refType: typeNamed(ctx, field.refTypes) }, display: text, multi: field.kind === 'refs' };
      }
      default:
        return { ok: true, value: text.slice(0, 120), display: text.slice(0, 120) };
    }
  }

  /** Creates the draft of a new linked entity (a person, a place...) and returns it with the schema it may need. */
  function makeExtra(ctx, create, field) {
    var s = ctx.schema;
    var typeId = '';
    var want = create.refType || (field && typeNamed(ctx, field.refTypes));
    if (create.person) {
      var p = personTypeId(ctx);
      s = p.schema;
      typeId = p.id;
    } else if (want) {
      var t = typeIdFor({ schema: s, library: ctx.library }, want);
      s = t.schema;
      typeId = t.id;
    }
    return { schema: s, draft: EC().newDraft({ name: create.name, types: typeId ? [typeId] : [] }) };
  }

  function setLink(draft, field, path, id) {
    return EC().setAnswer(draft, path, field.kind === 'refs' ? [id] : id);
  }

  /** Applies one resolved value to the draft (creating the linked draft when asked). */
  function applyResolved(ctx, state, path, field, r) {
    var out = state;
    if (r.create) {
      var m = makeExtra({ schema: out.schema, library: ctx.library }, r.create, field);
      out = { schema: m.schema, draft: out.draft, extra: out.extra.concat([m.draft]) };
      out.draft = setLink(out.draft, field, path, m.draft.id);
    } else if (r.entityId && !Array.isArray(r.value) && field.kind === 'refs') {
      out.draft = setLink(out.draft, field, path, r.entityId);
    } else {
      out.draft = EC().setAnswer(out.draft, path, r.value);
    }
    if (r.label) {
      out.draft = clone(out.draft);
      out.draft.precision = out.draft.precision || {};
      out.draft.precision[path] = r.label;
    }
    out.draft = withSeen(out.draft, path);
    return out;
  }

  /**
   * One answer to a card: { option: index } picks a suggestion, { text } is what was typed, { skip: true } passes.
   * @returns {{schema, draft, extra:object[], sub?:object, error?:string}}
   */
  function answer(ctx, card, input) {
    var state = { schema: ctx.schema, draft: ctx.draft, extra: [] };
    if (!card || card.kind === 'done') return state;
    input = input || {};

    if (card.kind === 'type') {
      var opt = typeof input.option === 'number' ? card.options[input.option] : card.options[matchOptions(card, input.text)[0]];
      if (!opt) return Object.assign(state, { error: 'Choisissez un genre dans la liste.' });
      var s = state.schema;
      var typeId = opt.typeId;
      if (!opt.installed) {
        var r = LIB(ctx).install(s, [opt.typeId]);
        if (r.error) return Object.assign(state, { error: 'Impossible d’ajouter ce genre.' });
        s = r.schema;
        typeId = (r.typeIds && r.typeIds[opt.typeId]) || opt.typeId;
      }
      var d = EC().pruneAnswers(s, EC().toggleType(s, state.draft, typeId, true));
      var p = prepare({ schema: s, draft: d, library: ctx.library });
      return { schema: p.schema, draft: p.draft, extra: [] };
    }

    if (card.kind === 'batch') {
      if (input.skip || (typeof input.option === 'number' && card.options[input.option].action === 'unbatch')) {
        var nb = clone(state.draft);
        nb.seen = nb.seen || {};
        nb.seen.ivNoBatch = true;
        return Object.assign(state, { draft: nb });
      }
      card.items.forEach(function (it) {
        var f = EM().fieldOf(state.schema, it.path);
        if (f) state = applyResolved(ctx, state, it.path, f.field, it.resolved);
      });
      return state;
    }

    var path = card.path;
    var field = card.field;
    if (input.skip) return { schema: state.schema, draft: withSeen(state.draft, path), extra: [] };

    var option = typeof input.option === 'number' ? card.options[input.option] : null;
    if (option && option.action === 'ask') {
      var people = ctx.entities.filter(function (e) { return option.refTypes.some(function (t) { return isTypeOf(ctx.schema, e, t); }) && !(findMe(ctx.entities) && e.id === findMe(ctx.entities).id); });
      var sub = {
        id: card.id + '>' + option.id,
        kind: 'field',
        path: path,
        field: field,
        question: option.sub,
        options: people.slice(0, 5).map(function (e) { return { id: 'e:' + e.id, label: e.name, action: 'value', entityId: e.id }; }),
        best: people.length ? 0 : -1,
        input: { kind: 'refs', placeholder: 'Nom (existant ou à créer)…', createRefType: option.refTypes[0] },
        parent: card.id,
      };
      return Object.assign(state, { sub: sub });
    }
    if (option && option.action === 'me') {
      var pp = personTypeId(ctx);
      var me = makeExtra({ schema: pp.schema, library: ctx.library }, { name: 'Moi', person: true }, field);
      var st2 = { schema: me.schema, draft: setLink(state.draft, field, path, me.draft.id), extra: [me.draft] };
      st2.draft = withSeen(st2.draft, path);
      return st2;
    }

    var r2;
    if (option) {
      if (option.entityId) r2 = { ok: true, value: field.kind === 'refs' ? [option.entityId] : option.entityId, entityId: option.entityId };
      else if (option.create) r2 = { ok: true, create: { name: option.create.name, refType: typeNamed(ctx, field.refTypes) } };
      else if (option.raw !== undefined) r2 = resolveInput(ctx, field, option.raw);
      else r2 = { ok: true, value: option.value };
    } else {
      var typed = trim(input.text);
      if (!typed && card.best >= 0 && input.useBest !== false) return answer(ctx, card, { option: card.best });
      if (!typed) return { schema: state.schema, draft: withSeen(state.draft, path), extra: [] };
      var match = matchOptions(card, typed);
      if (match.length === 1 && card.options[match[0]] && key(card.options[match[0]].label) === key(typed)) return answer(ctx, card, { option: match[0] });
      r2 = resolveInput(ctx, field, typed);
      if (r2.create && card.input && card.input.createRefType) r2.create.refType = card.input.createRefType;
    }
    if (!r2 || !r2.ok) return Object.assign(state, { error: errorFor(field) });
    return applyResolved(ctx, state, path, field, r2);
  }

  function errorFor(field) {
    if (field.kind === 'date') return 'Je n’ai pas compris cette date. Essayez « il y a 2 ans » ou « 15 octobre 2023 ».';
    if (field.kind === 'number') return 'Un nombre, s’il vous plaît.';
    if (field.kind === 'choice') return 'Choisissez une des options.';
    return 'Je n’ai pas compris cette réponse.';
  }

  /** Drafts nobody links to any more are dropped (an answer replaced after a "Créer « X »"). */
  function reachable(rootId, drafts) {
    var byId = {};
    drafts.forEach(function (d) { byId[d.id] = d; });
    var keep = {};
    (function visit(id) {
      if (keep[id] || !byId[id]) return;
      keep[id] = true;
      var d = byId[id];
      Object.keys(d.answers).forEach(function (p) {
        var v = d.answers[p];
        (Array.isArray(v) ? v : [v]).forEach(function (x) { if (typeof x === 'string') visit(x); });
      });
      d.relations.forEach(function (r) { visit(r.to); });
    })(rootId);
    return drafts.filter(function (d) { return keep[d.id]; });
  }

  /* ── 6. Thread ───────────────────────────────────────────────────── */

  /** What is answered so far, in question order: [{ path, label, display }]. Skipped questions are not listed. */
  function thread(ctx) {
    var out = [];
    var d = ctx.draft;
    EM()
      .componentIdsOf(ctx.schema, d)
      .forEach(function (cid) {
        var comp = EM().findById(ctx.schema.components, cid);
        if (!comp) return;
        comp.fields.forEach(function (f) {
          var path = cid + '.' + f.key;
          var v = d.answers[path];
          if (v === undefined) return;
          var shown = d.precision && d.precision[path] ? d.precision[path] : EM().formatValue(f, v, ctx.entities);
          out.push({ path: path, label: f.label, display: shown, rank: CORE.indexOf(path) < 0 ? 99 : CORE.indexOf(path) });
        });
      });
    return out.sort(function (a, b) { return a.rank - b.rank; });
  }

  /** The card for a path already answered, to change it ("Marque : Huion" clicked). */
  function reopen(ctx, path) {
    var d = clone(ctx.draft);
    delete d.answers[path];
    if (d.seen) delete d.seen[seenKey(path)];
    return { draft: d, card: cardFor({ schema: ctx.schema, entities: ctx.entities, draft: d, hints: ctx.hints, now: ctx.now, library: ctx.library }, path) };
  }

  global.EntitiesInterview = {
    words: words,
    prepare: prepare,
    slots: slots,
    next: next,
    cardFor: cardFor,
    remaining: remaining,
    matchOptions: matchOptions,
    resolveInput: resolveInput,
    answer: answer,
    reachable: reachable,
    thread: thread,
    reopen: reopen,
    findMe: findMe,
    findEmployer: findEmployer,
  };
})(typeof window !== 'undefined' ? window : this);
