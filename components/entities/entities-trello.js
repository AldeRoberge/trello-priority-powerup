/*
 * Role: Trello I/O for the Entities (see entities-model.js). Trello is the source of truth, no extra backend.
 *
 * Where entities live: Power-Up storage is capped at 4096 chars per scope, far too small for entities
 * with properties and history. Like Documents, each entity is a Trello card whose description
 * (16 384 chars) carries its JSON, named "🧩 Name" and ARCHIVED right after creation, so it never shows
 * on the board, in the Gantt / Table, in the Sheet sync or in any card picker. One more archived card,
 * "🧩 Schéma des entités", holds the component and type definitions. Everything is read with ONE call,
 * GET /boards/{id}/cards/closed, keeping the cards whose name starts with 🧩.
 *
 * The description is a readable summary followed by a hidden `<!--cerveau-entity ... -->` block with
 * the JSON (`--` is escaped inside it so the comment cannot be closed early). Each JSON carries a
 * `rev` counter: a save over a newer revision is refused with reason 'conflict'.
 *
 * Writes go through SheetsTrello.trelloRest (the Power-Up REST token), like Documents and the Table.
 */
(function (global) {
  'use strict';

  var MARK = '🧩';
  var SCHEMA_NAME = MARK + ' Schéma des entités';
  var MAX_DESC = 16384;
  var BLOCK_RE = /<!--cerveau-entity\n([\s\S]*?)\n-->\s*$/;
  var CACHE_TTL_MS = 30000;
  var cache = { state: null, at: 0, inflight: null };

  function ST() {
    return global.SheetsTrello;
  }
  function GT() {
    return global.GanttTrello;
  }
  function PT() {
    return global.PriorityTrello;
  }
  function EM() {
    return global.EntitiesModel;
  }

  function fail(reason, extra) {
    var err = new Error(reason);
    err.reason = reason;
    if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
    return err;
  }

  function need(res) {
    if (!res || res.ok === false) throw fail((res && res.reason) || 'trello-failed', { detail: res && res.detail });
    return res.data;
  }

  function enc(s) {
    return encodeURIComponent(s);
  }

  function isEntityName(name) {
    return typeof name === 'string' && name.indexOf(MARK) === 0;
  }

  async function boardId(t) {
    var b = await t.board('id');
    var id = b && (b.id || b);
    if (!id || typeof id !== 'string') throw fail('no-board');
    return id;
  }

  async function homeListId(t) {
    var lists = (await t.lists('id', 'name')) || [];
    if (!lists.length || !lists[0].id) throw fail('no-list');
    return String(lists[0].id);
  }

  async function isAuthorized(t) {
    var pt = PT();
    if (!pt || typeof pt.isRestAuthorized !== 'function') return false;
    try {
      return !!(await pt.isRestAuthorized(t));
    } catch (e) {
      return false;
    }
  }

  /** Must be called from a click (opens Trello's authorization popup). */
  async function authorize(t) {
    var res = await GT().ensureRestAuthorized(t);
    if (!res || !res.ok) throw fail((res && res.reason) || 'auth-failed');
    return true;
  }

  // ----------------------------------------------------------------------- desc <-> JSON
  function summaryOf(entity) {
    var lines = ['Entité ' + entity.name];
    if (entity.types && entity.types.length) lines.push('Types : ' + entity.types.join(', '));
    lines.push('Géré par la vue Entités du Power-Up : ne pas modifier à la main.');
    return lines.join('\n');
  }

  function packJson(summary, obj) {
    var json = JSON.stringify(obj).replace(/--/g, '-\\u002d');
    return summary + '\n\n<!--cerveau-entity\n' + json + '\n-->';
  }

  /** @returns {object|null} the JSON object of a description, or null when absent / corrupt */
  function unpackJson(desc) {
    var full = String(desc == null ? '' : desc).replace(/\r\n?/g, '\n');
    var m = BLOCK_RE.exec(full);
    if (!m) return null;
    try {
      var obj = JSON.parse(m[1]);
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) {
      return null;
    }
  }

  function packEntity(entity, rev) {
    var fitted = EM().fitHistory(entity, MAX_DESC - 400);
    var obj = Object.assign({ kind: 'entity', rev: rev }, fitted);
    var desc = packJson(summaryOf(fitted), obj);
    if (desc.length > MAX_DESC) throw fail('too-long');
    return desc;
  }

  function packSchema(schema, rev) {
    var desc = packJson('Schéma des entités (composants et types). Géré par la vue Entités.', {
      kind: 'schema',
      rev: rev,
      schema: schema,
    });
    if (desc.length > MAX_DESC) throw fail('too-long');
    return desc;
  }

  // ----------------------------------------------------------------------- load
  /**
   * @returns {Promise<{schema:object, entities:object[], cards:Object<string,{cardId:string,rev:number,sig:string}>,
   *   schemaCard:{cardId:string,rev:number,sig:string}|null}>}
   */
  async function loadFresh(t) {
    var id = await boardId(t);
    var cards = need(await ST().trelloRest(t, '/boards/' + enc(id) + '/cards/closed?fields=name,desc')) || [];
    var schema = null;
    var schemaCard = null;
    var raws = [];
    cards.forEach(function (c) {
      if (!c || !c.id || !isEntityName(c.name)) return;
      var obj = unpackJson(c.desc);
      if (!obj) return;
      if (obj.kind === 'schema') {
        if (!schema || (obj.rev || 0) > schemaCard.rev) {
          schema = EM().normalizeSchema(obj.schema);
          schemaCard = { cardId: String(c.id), rev: obj.rev || 1, sig: JSON.stringify(schema) };
        }
      } else if (obj.kind === 'entity') {
        raws.push({ cardId: String(c.id), obj: obj });
      }
    });
    var effective = schema || EM().defaultSchema();
    var entities = [];
    var map = {};
    raws.forEach(function (r) {
      var e = EM().normalizeEntity(r.obj, effective);
      if (!e || map[e.id]) return;
      entities.push(e);
      map[e.id] = { cardId: r.cardId, rev: r.obj.rev || 1, sig: JSON.stringify(e) };
    });
    entities.sort(function (a, b) {
      return a.name.localeCompare(b.name, 'fr');
    });
    return { schema: effective, entities: entities, cards: map, schemaCard: schemaCard };
  }

  /** Cached for CACHE_TTL_MS (the agent asks on every turn); opts.maxAgeMs tightens, opts.force bypasses. */
  async function load(t, opts) {
    opts = opts || {};
    var maxAge = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : CACHE_TTL_MS;
    if (!opts.force && cache.state && Date.now() - cache.at < maxAge) return cache.state;
    if (cache.inflight && !opts.force) return cache.inflight;
    var p = loadFresh(t).then(
      function (s) {
        cache.state = s;
        cache.at = Date.now();
        cache.inflight = null;
        return s;
      },
      function (err) {
        cache.inflight = null;
        throw err;
      }
    );
    cache.inflight = p;
    return p;
  }

  /** Last loaded state, synchronously (for agent bridges); null before the first load. */
  function peek() {
    return cache.state;
  }

  function invalidate() {
    cache.at = 0;
  }

  // ----------------------------------------------------------------------- write
  async function createCard(t, name, desc) {
    var listId = await homeListId(t);
    var created = need(
      await ST().trelloRest(
        t,
        '/cards?idList=' + enc(listId) + '&name=' + enc(name) + '&pos=bottom&desc=' + enc(MARK),
        'POST'
      )
    );
    if (!created || !created.id) throw fail('no-card');
    try {
      need(await ST().trelloRest(t, '/cards/' + enc(created.id), 'PUT', { closed: true, desc: desc }));
    } catch (err) {
      // never leave a visible entity card on the board
      await ST().trelloRest(t, '/cards/' + enc(created.id), 'DELETE').catch(function () {});
      throw err;
    }
    return String(created.id);
  }

  /** A real, visible card in the board's first list (what a System proposes: "Racheter Eau"). Returns its id and url. */
  async function createBoardCard(t, name, desc) {
    var listId = await homeListId(t);
    var created = need(
      await ST().trelloRest(t, '/cards?idList=' + enc(listId) + '&name=' + enc(name) + '&pos=top&desc=' + enc(desc || ''), 'POST')
    );
    if (!created || !created.id) throw fail('no-card');
    return { id: String(created.id), url: created.shortUrl || created.url || '' };
  }

  async function remoteRev(t, cardId) {
    var cur = need(await ST().trelloRest(t, '/cards/' + enc(cardId) + '?fields=desc'));
    var obj = unpackJson(cur && cur.desc);
    return { rev: (obj && obj.rev) || 1, obj: obj };
  }

  async function writeEntity(t, state, entity, opts) {
    var ref = state.cards[entity.id];
    var name = MARK + ' ' + entity.name;
    if (!ref) {
      var cardId = await createCard(t, name, packEntity(entity, 1));
      state.cards[entity.id] = { cardId: cardId, rev: 1, sig: JSON.stringify(entity) };
      return;
    }
    if (!(opts && opts.force)) {
      var remote = await remoteRev(t, ref.cardId);
      if (remote.rev !== ref.rev) throw fail('conflict', { entityId: entity.id, remote: remote.obj });
    }
    var rev = ref.rev + 1;
    need(await ST().trelloRest(t, '/cards/' + enc(ref.cardId), 'PUT', { name: name, desc: packEntity(entity, rev) }));
    state.cards[entity.id] = { cardId: ref.cardId, rev: rev, sig: JSON.stringify(entity) };
  }

  async function writeSchema(t, state, schema, opts) {
    var ref = state.schemaCard;
    if (!ref) {
      var cardId = await createCard(t, SCHEMA_NAME, packSchema(schema, 1));
      state.schemaCard = { cardId: cardId, rev: 1, sig: JSON.stringify(schema) };
      return;
    }
    if (!(opts && opts.force)) {
      var remote = await remoteRev(t, ref.cardId);
      if (remote.rev !== ref.rev) throw fail('conflict', { entityId: '', remote: remote.obj });
    }
    var rev = ref.rev + 1;
    need(await ST().trelloRest(t, '/cards/' + enc(ref.cardId), 'PUT', { desc: packSchema(schema, rev) }));
    state.schemaCard = { cardId: ref.cardId, rev: rev, sig: JSON.stringify(schema) };
  }

  /**
   * Persists the difference between `state` (as loaded) and the edited schema/entities: new entities
   * are created, changed ones saved, missing ones deleted. Mutates and returns `state` with the new
   * values (so a failing step leaves it consistent with what Trello really holds).
   * @throws Error with .reason 'conflict' | 'too-long' | 'not-authorized' | http-xxx
   */
  async function commit(t, state, nextSchema, nextEntities, opts) {
    var schema = EM().normalizeSchema(nextSchema);
    var schemaSig = JSON.stringify(schema);
    if (!state.schemaCard || state.schemaCard.sig !== schemaSig) {
      await writeSchema(t, state, schema, opts);
    }
    state.schema = schema;
    var keep = {};
    for (var i = 0; i < nextEntities.length; i++) {
      var e = nextEntities[i];
      keep[e.id] = true;
      var ref = state.cards[e.id];
      if (!ref || ref.sig !== JSON.stringify(e)) await writeEntity(t, state, e, opts);
    }
    var gone = Object.keys(state.cards).filter(function (id) {
      return !keep[id];
    });
    for (var j = 0; j < gone.length; j++) {
      need(await ST().trelloRest(t, '/cards/' + enc(state.cards[gone[j]].cardId), 'DELETE'));
      delete state.cards[gone[j]];
    }
    state.entities = nextEntities.slice();
    cache.state = state;
    cache.at = Date.now();
    return state;
  }

  global.EntitiesTrello = {
    MARK: MARK,
    isEntityName: isEntityName,
    isAuthorized: isAuthorized,
    authorize: authorize,
    load: load,
    peek: peek,
    invalidate: invalidate,
    commit: commit,
    createBoardCard: createBoardCard,
    packJson: packJson,
    unpackJson: unpackJson,
  };
})(typeof window !== 'undefined' ? window : this);
