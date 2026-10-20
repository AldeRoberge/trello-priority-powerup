'use strict';
/*
 * In-memory Trello for the Playwright suite: one board, its lists, cards, members, labels, custom
 * fields, Power-Up pluginData and the REST routes the Power-Up calls (api.trello.com/1/...).
 *
 *   const fake = new FakeTrello();          // seeded with a realistic French board
 *   fake.rpc('cards', ['id', 'name'], ctx)  // what t.cards('id', 'name') returns
 *   fake.rest('PUT', '/cards/c1', query, body) -> { status, body }
 *
 * Anything the app asks for that is not modelled is recorded in `fake.gaps` (the suite fails on it:
 * extend this file) and rule breaks of the real Trello (pluginData over 4096 characters) in
 * `fake.violations`. Every REST call is logged in `fake.restLog` for assertions.
 */

const DAY = 86400000;
const PLUGIN_DATA_LIMIT = 4096;

function iso(daysFromNow, hour) {
  const d = new Date(Date.now() + daysFromNow * DAY);
  d.setUTCHours(hour == null ? 17 : hour, 0, 0, 0);
  return d.toISOString();
}

function seedData() {
  const board = { id: 'b1', name: 'Cerveau (test)', desc: '', closed: false, url: 'https://trello.com/b/b1/cerveau-test' };
  const members = [
    { id: 'm1', fullName: 'Alex Tremblay', username: 'alextremblay', initials: 'AT', avatarUrl: null },
    { id: 'm2', fullName: 'Camille Gagnon', username: 'camillegagnon', initials: 'CG', avatarUrl: null },
  ];
  const labels = [
    { id: 'lb1', name: 'Urgent', color: 'red' },
    { id: 'lb2', name: 'Design', color: 'purple' },
    { id: 'lb3', name: 'Technique', color: 'blue' },
  ];
  const lists = [
    { id: 'l1', name: 'À faire', pos: 1000, closed: false },
    { id: 'l2', name: 'En cours', pos: 2000, closed: false },
    { id: 'l3', name: 'En attente', pos: 3000, closed: false },
    { id: 'l4', name: 'Terminé', pos: 4000, closed: false },
  ];
  const c = (id, idShort, name, idList, pos, extra) =>
    Object.assign(
      { id, idShort, name, desc: '', idList, pos, closed: false, due: null, start: null, dueComplete: false, idMembers: [], idLabels: [] },
      extra || {}
    );
  const cards = [
    c('c1', 1, 'Préparer la réunion de lancement', 'l1', 1000, { due: iso(-2), idMembers: ['m1'], idLabels: ['lb1'], desc: 'Inviter **tout le monde**\n- ordre du jour\n- salle' }),
    c('c2', 2, 'Refonte du tableau de bord', 'l2', 1000, { start: iso(-6), due: iso(9), idMembers: ['m1', 'm2'], idLabels: ['lb2'], desc: 'Nouvelle maquette' }),
    c('c3', 3, 'Publier la version 2', 'l2', 2000, { start: iso(-3), due: iso(3), idMembers: ['m2'], idLabels: ['lb3'] }),
    c('c4', 4, 'Archiver les anciennes cartes', 'l1', 2000, { desc: 'Rien de spécial' }),
    c('c5', 5, 'Répondre aux courriels de la semaine', 'l1', 3000, { due: iso(0), idMembers: ['m1'] }),
    c('c6', 6, 'Attendre la réponse du fournisseur', 'l3', 1000, { due: iso(14) }),
    c('c7', 7, 'Rédiger la politique de télétravail avec une très longue description pour vérifier que le texte passe à la ligne et n’est jamais coupé dans la vue', 'l1', 4000, { start: iso(1), due: iso(20), idLabels: ['lb2', 'lb3'] }),
    c('c8', 8, 'Planifier le budget 2027', 'l2', 3000, { start: iso(-1), due: iso(30), idMembers: ['m2'] }),
    c('c9', 9, 'Former les nouveaux employés', 'l4', 1000, { due: iso(-10), dueComplete: true, idMembers: ['m1'] }),
    c('c10', 10, 'Corriger le bogue du formulaire', 'l2', 4000, { due: iso(1), idLabels: ['lb1', 'lb3'] }),
    c('c11', 11, 'Idée : application mobile', 'l3', 2000, {}),
    c('c12', 12, 'Révision du contrat de service', 'l4', 2000, { dueComplete: true }),
  ];
  // Cerveau metadata a real board would hold after some use (priority inputs, progress, subtasks).
  const data = {
    c1: { cardPriority: { impact: 8, ease: 5, empressement: 'vite' }, cardCompletion: { items: [], progress: 0, estimatedMinutes: 60 } },
    c2: {
      cardPriority: { impact: 6, ease: 4, empressement: 'assez-vite' },
      cardCompletion: { items: [{ id: 's1', text: 'Maquette', progress: 100 }, { id: 's2', text: 'Revue avec l’équipe', progress: 0 }, { id: 's3', text: 'Intégration', progress: 20 }] },
    },
    c3: { cardPriority: { impact: 9, ease: 6, empressement: 'au-plus-vite' }, cardCompletion: { items: [], progress: 100 } },
    c4: { cardPriority: { impact: 2, ease: 9, empressement: 'aucun' }, cardCompletion: { items: [], progress: 10 } },
    c10: { cardPriority: { impact: 7, ease: 3, empressement: 'vite' }, cardCompletion: { items: [], progress: 30, blocked: true, blockedReason: 'Attend un accès' } },
  };
  // The Assistant is configured against a host the Playwright suite answers (see e2e/mocks.js).
  const pluginData = {
    'member:m1|private:m1': { agentProvider: { preset: 'openai', baseUrl: 'https://mock-llm.test/v1', model: 'mock-model', modelMode: 'auto', apiKey: 'test-key' } },
  };
  return { board, members, labels, lists, cards, data, pluginData };
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

class FakeTrello {
  constructor() {
    this.config = null;
    this.reset();
  }

  reset(seed) {
    const s = seed || seedData();
    this.board = clone(s.board);
    this.members = clone(s.members);
    this.labels = clone(s.labels);
    this.lists = clone(s.lists);
    this.cards = clone(s.cards);
    this.customFields = clone(s.customFields) || [];
    this.attachments = [];
    this.pluginData = {};
    Object.keys(s.data || {}).forEach((cardId) => {
      Object.keys(s.data[cardId]).forEach((key) => {
        this._storeRaw('card:' + cardId + '|shared', 'shared', key, s.data[cardId][key]);
      });
    });
    Object.keys(s.pluginData || {}).forEach((bucketKey) => {
      Object.keys(s.pluginData[bucketKey]).forEach((key) => this._storeRaw(bucketKey, null, key, s.pluginData[bucketKey][key]));
    });
    this.config = {
      board: this.board.id,
      member: this.members[0].id,
      theme: 'light',
      authorized: true,
      token: 'fake-trello-token-0123456789abcdef',
    };
    this.seq = 1000;
    this.restLog = [];
    this.rpcLog = [];
    this.gaps = [];
    this.violations = [];
  }

  nextId(prefix) {
    this.seq += 1;
    return prefix + this.seq;
  }

  /* ── plugin data ─────────────────────────────────────────────────────── */

  _scopeKey(scope, visibility, ctx) {
    let key;
    if (scope === 'board') key = 'board:' + this.board.id;
    else if (scope === 'member') key = 'member:' + ctx.member;
    else if (scope === 'organization') key = 'organization:o1';
    else if (scope === 'card') key = 'card:' + (ctx.card || '');
    else key = 'card:' + scope; // a card id: the Power-Up reads other cards from a board modal
    return visibility === 'private' ? key + '|private:' + ctx.member : key + '|shared';
  }

  _bucket(scope, visibility, ctx) {
    const sk = this._scopeKey(scope, visibility, ctx);
    return this.pluginData[sk] || null;
  }

  /* ── cards ───────────────────────────────────────────────────────────── */

  cardById(id) {
    return this.cards.find((c) => c.id === id) || null;
  }

  listById(id) {
    return this.lists.find((l) => l.id === id) || null;
  }

  cardView(card, fields) {
    const full = Object.assign({}, card, {
      idBoard: this.board.id,
      shortLink: 'sl' + card.id,
      url: 'https://trello.com/c/sl' + card.id + '/' + card.idShort + '-card',
      shortUrl: 'https://trello.com/c/sl' + card.id,
      dateLastActivity: card.dateLastActivity || new Date().toISOString(),
      members: this.members.filter((m) => card.idMembers.indexOf(m.id) >= 0).map((m) => Object.assign({}, m)),
      labels: this.labels.filter((l) => card.idLabels.indexOf(l.id) >= 0).map((l) => Object.assign({}, l)),
      badges: { due: card.due, dueComplete: card.dueComplete, comments: 0, attachments: this.attachments.filter((a) => a.cardId === card.id).length },
      customFieldItems: card.customFieldItems || [],
      cover: null,
    });
    if (!fields || !fields.length) return clone(full);
    const out = { id: card.id };
    fields.forEach((f) => {
      if (f in full) out[f] = clone(full[f]);
    });
    return out;
  }

  _nextPos(idList, where) {
    const inList = this.cards.filter((c) => c.idList === idList && !c.closed).map((c) => c.pos);
    if (where === 'top') return (inList.length ? Math.min.apply(null, inList) : 65536) / 2;
    return (inList.length ? Math.max.apply(null, inList) : 0) + 65536;
  }

  _applyCard(card, p) {
    ['name', 'desc', 'idList'].forEach((k) => {
      if (p[k] != null) card[k] = String(p[k]);
    });
    if ('closed' in p) card.closed = p.closed === true || p.closed === 'true';
    if ('dueComplete' in p) card.dueComplete = p.dueComplete === true || p.dueComplete === 'true';
    ['due', 'start'].forEach((k) => {
      if (k in p) card[k] = p[k] === null || p[k] === '' || p[k] === 'null' ? null : new Date(p[k]).toISOString();
    });
    if ('pos' in p) {
      card.pos = p.pos === 'top' ? this._nextPos(card.idList, 'top') : p.pos === 'bottom' ? this._nextPos(card.idList, 'bottom') : Number(p.pos);
    }
    if ('idMembers' in p) card.idMembers = String(p.idMembers || '').split(',').filter(Boolean);
    if ('idLabels' in p) card.idLabels = String(p.idLabels || '').split(',').filter(Boolean);
    card.dateLastActivity = new Date().toISOString();
  }

  /* ── Power-Up client calls (t.get, t.cards, ...) ─────────────────────── */

  rpc(method, args, ctx) {
    this.rpcLog.push({ method, args });
    args = args || [];
    switch (method) {
      case 'get': {
        const b = this._bucket(args[0], args[1], ctx);
        const v = b && args[2] in b ? b[args[2]] : undefined;
        return clone(v === undefined ? (args[3] === undefined ? null : args[3]) : v);
      }
      case 'set': {
        const sk = this._scopeKey(args[0], args[1], ctx);
        if (args[2] && typeof args[2] === 'object') Object.keys(args[2]).forEach((k) => this._storeRaw(sk, args[1], k, args[2][k]));
        else this._storeRaw(sk, args[1], args[2], args[3]);
        return null;
      }
      case 'remove': {
        const sk = this._scopeKey(args[0], args[1], ctx);
        [].concat(args[2]).forEach((k) => this._storeRaw(sk, args[1], k, undefined));
        return null;
      }
      case 'getAll': {
        const out = {};
        ['board', 'card', 'member', 'organization'].forEach((scope) => {
          ['shared', 'private'].forEach((vis) => {
            const b = this._bucket(scope, vis, ctx);
            if (b) {
              out[scope] = out[scope] || {};
              out[scope][vis] = clone(b);
            }
          });
        });
        return out;
      }
      case 'board': {
        const all = Object.assign({}, this.board, { members: clone(this.members), labels: clone(this.labels), customFields: clone(this.customFields) });
        return this._pickObject(all, args);
      }
      case 'lists':
        return this.lists
          .filter((l) => !l.closed)
          .sort((a, b) => a.pos - b.pos)
          .map((l) => {
            const full = Object.assign({}, l, { cards: this.cards.filter((c) => c.idList === l.id && !c.closed).map((c) => this.cardView(c)) });
            return this._pickObject(full, args);
          });
      case 'cards':
        return this.cards
          .filter((c) => !c.closed)
          .sort((a, b) => this._listPos(a.idList) - this._listPos(b.idList) || a.pos - b.pos)
          .map((c) => this.cardView(c, args));
      case 'card': {
        const card = this.cardById(ctx.card);
        if (!card) throw Object.assign(new Error('No card in this iframe context'), { name: 'NoCardContext' });
        return args.length ? this.cardView(card, args) : this.cardView(card);
      }
      case 'list': {
        const card = this.cardById(ctx.card);
        const list = this.listById(card ? card.idList : ctx.list);
        if (!list) throw Object.assign(new Error('No list in this iframe context'), { name: 'NoListContext' });
        return this._pickObject(list, args);
      }
      case 'member': {
        const m = this.members.find((x) => x.id === ctx.member);
        return this._pickObject(m, args);
      }
      case 'organization':
        return this._pickObject({ id: 'o1', name: 'test-org', displayName: 'Organisation test' }, args);
      case 'isMemberSignedIn':
        return true;
      case 'memberCanWriteToModel':
        return true;
      case 'loadSecret':
        return null;
      case 'storeSecret':
        return null;
      default:
        this.gaps.push({ kind: 'sdk', what: 't.' + method + '()' });
        throw Object.assign(new Error('Fake Trello does not implement t.' + method + '()'), { name: 'FakeGap' });
    }
  }

  _storeRaw(scopeKey, visibility, key, value) {
    const bucketKey = scopeKey;
    const bucket = (this.pluginData[bucketKey] = this.pluginData[bucketKey] || {});
    const before = Object.prototype.hasOwnProperty.call(bucket, key) ? bucket[key] : undefined;
    if (value === undefined || value === null) delete bucket[key];
    else bucket[key] = clone(value);
    const size = JSON.stringify(bucket).length;
    if (size > PLUGIN_DATA_LIMIT) {
      if (before === undefined) delete bucket[key];
      else bucket[key] = before;
      this.violations.push({ kind: 'plugin-data-limit', bucket: bucketKey, key, size });
      throw Object.assign(new Error('Plugin data too large (' + size + ' > ' + PLUGIN_DATA_LIMIT + ' characters) in ' + bucketKey + ' while writing "' + key + '"'), { name: 'PluginDataLimit' });
    }
  }

  _listPos(idList) {
    const l = this.listById(idList);
    return l ? l.pos : 0;
  }

  _pickObject(obj, fields) {
    if (!fields || !fields.length) return clone(obj);
    const out = {};
    fields.forEach((f) => {
      if (obj && f in obj) out[f] = clone(obj[f]);
    });
    if (obj && obj.id) out.id = obj.id;
    return out;
  }

  /* ── REST: api.trello.com/1/... ──────────────────────────────────────── */

  rest(method, pathname, query, body) {
    const entry = { method, path: pathname, query: query || {}, body: body || null, status: 0 };
    this.restLog.push(entry);
    const out = this._rest(method, pathname, query, body);
    entry.status = out.status;
    return out;
  }

  _rest(method, pathname, query, body) {
    const q = Object.assign({}, query || {}, body && typeof body === 'object' ? body : {});
    const reply = (status, data) => ({ status, body: data });
    if (!this.config.authorized || !q.token) return reply(401, 'unauthorized card permission requested');
    const fields = q.fields ? String(q.fields).split(',').filter(Boolean) : null;
    const seg = pathname.replace(/^\/+|\/+$/g, '').split('/');
    let m;

    // boards
    if (seg[0] === 'boards' && seg.length === 2 && method === 'GET') return reply(200, this._pickObject(this.board, fields));
    if (seg[0] === 'boards' && seg[2] === 'cards' && method === 'GET') {
      const which = seg[3] || q.filter || 'open';
      let list = this.cards.filter((c) => (which === 'all' ? true : which === 'closed' ? c.closed : !c.closed));
      list = list.map((c) => {
        const v = this.cardView(c, fields);
        if (q.customFieldItems === 'true') v.customFieldItems = clone(c.customFieldItems || []);
        return v;
      });
      return reply(200, list);
    }
    if (seg[0] === 'boards' && seg[2] === 'lists' && method === 'GET') {
      const filter = q.filter || 'open';
      return reply(200, this.lists.filter((l) => (filter === 'all' ? true : filter === 'closed' ? l.closed : !l.closed)).map((l) => this._pickObject(l, fields)));
    }
    if (seg[0] === 'boards' && seg[2] === 'labels' && method === 'GET') return reply(200, clone(this.labels));
    if (seg[0] === 'boards' && seg[2] === 'members' && method === 'GET') return reply(200, clone(this.members));
    if (seg[0] === 'boards' && seg[2] === 'customFields' && method === 'GET') return reply(200, clone(this.customFields));

    // members
    if (seg[0] === 'members' && seg.length === 2 && method === 'GET') {
      const id = seg[1] === 'me' ? this.config.member : seg[1];
      const mem = this.members.find((x) => x.id === id || x.username === id);
      return mem ? reply(200, this._pickObject(mem, fields)) : reply(404, 'member not found');
    }

    // lists
    if (seg[0] === 'lists' && seg.length === 1 && method === 'POST') {
      const list = { id: this.nextId('l'), name: q.name || '', pos: q.pos === 'top' ? 0.5 : (Math.max(0, ...this.lists.map((l) => l.pos)) + 1000), closed: false };
      this.lists.push(list);
      return reply(200, clone(list));
    }
    if (seg[0] === 'lists' && seg.length === 2 && method === 'PUT') {
      const list = this.listById(seg[1]);
      if (!list) return reply(404, 'list not found');
      if (q.name != null) list.name = String(q.name);
      if (q.pos != null) list.pos = q.pos === 'top' ? 0.5 : q.pos === 'bottom' ? Math.max(...this.lists.map((l) => l.pos)) + 1000 : Number(q.pos);
      if (q.closed != null) list.closed = q.closed === true || q.closed === 'true';
      return reply(200, clone(list));
    }

    // cards
    if (seg[0] === 'cards' && seg.length === 1 && method === 'POST') {
      if (!this.listById(q.idList)) return reply(400, 'invalid value for idList');
      const idShort = Math.max(0, ...this.cards.map((c) => c.idShort)) + 1;
      const card = { id: this.nextId('c'), idShort, name: '', desc: '', idList: q.idList, pos: 0, closed: false, due: null, start: null, dueComplete: false, idMembers: [], idLabels: [] };
      this._applyCard(card, Object.assign({ pos: 'bottom' }, q));
      this.cards.push(card);
      return reply(200, this.cardView(card));
    }
    if (seg[0] === 'cards' && seg.length >= 2) {
      const card = this.cardById(seg[1]);
      if (!card) return reply(404, 'The requested resource was not found.');
      if (seg.length === 2) {
        if (method === 'GET') {
          const v = this.cardView(card, fields);
          if (q.customFieldItems === 'true') v.customFieldItems = clone(card.customFieldItems || []);
          return reply(200, v);
        }
        if (method === 'PUT') {
          if (q.desc != null && String(q.desc).length > 16384) return reply(400, 'invalid value for desc');
          if (q.idList != null && !this.listById(q.idList)) return reply(400, 'invalid value for idList');
          this._applyCard(card, q);
          return reply(200, this.cardView(card));
        }
        if (method === 'DELETE') {
          this.cards.splice(this.cards.indexOf(card), 1);
          return reply(200, {});
        }
      }
      if (seg[2] === 'idLabels') {
        if (method === 'POST') {
          if (card.idLabels.indexOf(q.value) < 0) card.idLabels.push(q.value);
          return reply(200, clone(card.idLabels));
        }
        if (method === 'DELETE') {
          card.idLabels = card.idLabels.filter((x) => x !== seg[3]);
          return reply(200, {});
        }
      }
      if (seg[2] === 'idMembers') {
        if (method === 'POST') {
          if (card.idMembers.indexOf(q.value) < 0) card.idMembers.push(q.value);
          return reply(200, clone(card.idMembers));
        }
        if (method === 'DELETE') {
          card.idMembers = card.idMembers.filter((x) => x !== seg[3]);
          return reply(200, {});
        }
      }
      if (seg[2] === 'attachments' && method === 'POST') {
        const att = { id: this.nextId('a'), cardId: card.id, name: q.name || 'fichier', url: q.url || '' };
        this.attachments.push(att);
        return reply(200, clone(att));
      }
      if (seg[2] === 'attachments' && method === 'GET') {
        return reply(200, this.attachments.filter((a) => a.cardId === card.id).map(clone));
      }
      if (seg[2] === 'customField' && seg[4] === 'item' && method === 'PUT') {
        card.customFieldItems = (card.customFieldItems || []).filter((i) => i.idCustomField !== seg[3]);
        const val = body && body.value;
        if (val) card.customFieldItems.push({ id: this.nextId('cfi'), idCustomField: seg[3], value: val });
        return reply(200, {});
      }
    }

    // labels
    if (seg[0] === 'labels') {
      if (seg.length === 1 && method === 'POST') {
        const label = { id: this.nextId('lb'), name: q.name || '', color: q.color || null };
        this.labels.push(label);
        return reply(200, clone(label));
      }
      const label = this.labels.find((l) => l.id === seg[1]);
      if (!label) return reply(404, 'label not found');
      if (method === 'PUT') {
        if (q.name != null) label.name = q.name;
        if (q.color != null) label.color = q.color;
        return reply(200, clone(label));
      }
      if (method === 'DELETE') {
        this.labels.splice(this.labels.indexOf(label), 1);
        this.cards.forEach((c) => (c.idLabels = c.idLabels.filter((x) => x !== label.id)));
        return reply(200, {});
      }
    }

    // custom fields
    if (seg[0] === 'customFields' && seg.length === 1 && method === 'POST') {
      const f = { id: this.nextId('cf'), idModel: this.board.id, modelType: 'board', name: q.name || '', type: q.type || 'text', pos: this.customFields.length + 1 };
      this.customFields.push(f);
      return reply(200, clone(f));
    }

    if ((m = /^cards\/[^/]+\/attachments\/[^/]+\/download\//.exec(seg.join('/')))) return reply(404, 'no such attachment');

    this.gaps.push({ kind: 'rest', what: method + ' /' + seg.join('/') });
    return reply(404, 'Fake Trello does not implement ' + method + ' /' + seg.join('/'));
  }
}

module.exports = { FakeTrello, seedData, iso, PLUGIN_DATA_LIMIT };
