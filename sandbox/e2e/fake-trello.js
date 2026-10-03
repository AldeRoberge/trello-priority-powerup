/*
 * In-memory stand-in for the slice of Trello that the Document view uses (REST via
 * SheetsTrello.trelloRest + the Power-Up client `t`). Shared by test/docs-trello.test.js (Node) and
 * sandbox/e2e/docs.html (browser harness). Not served in production.
 *
 *   var fake = FakeTrello.create({ lists, cards, members });
 *   fake.trelloRest(t, path, method, body)  -> { ok, data } | { ok:false, reason:'http-404' }
 *   fake.t                                   -> mock Power-Up client (board, lists, cards, get/set)
 *   fake.calls                               -> every REST call, for assertions
 */
(function (global) {
  'use strict';

  function create(seed) {
    seed = seed || {};
    var lists = (seed.lists || [{ id: 'l1', name: 'À faire' }, { id: 'l2', name: 'En cours' }]).map(function (l) {
      return Object.assign({}, l);
    });
    var cards = (seed.cards || []).map(function (c) {
      return Object.assign({ desc: '', closed: false, idList: lists[0].id, dateLastActivity: new Date().toISOString() }, c);
    });
    var members = seed.members || [];
    var storage = {};
    var seq = 100;
    var calls = [];
    var clock = seed.clock || (function () { var n = Date.parse('2026-10-03T10:00:00Z'); return function () { n += 60000; return new Date(n).toISOString(); }; })();
    var authorized = seed.authorized !== false;

    function pick(card, fields) {
      if (!fields) return Object.assign({}, card);
      var out = { id: card.id };
      String(fields).split(',').forEach(function (f) {
        if (f && f !== 'id' && f in card) out[f] = card[f];
      });
      return out;
    }

    function parse(path) {
      var qi = path.indexOf('?');
      var query = {};
      if (qi >= 0) {
        path.slice(qi + 1).split('&').forEach(function (kv) {
          var p = kv.split('=');
          query[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
        });
      }
      return { path: qi >= 0 ? path.slice(0, qi) : path, query: query };
    }

    function trelloRest(_t, rawPath, method, body) {
      method = method || 'GET';
      calls.push({ method: method, path: rawPath, body: body || null });
      if (!authorized) return Promise.resolve({ ok: false, reason: 'not-authorized' });
      var u = parse(rawPath);
      var m;
      var res;
      if (method === 'GET' && (m = /^\/boards\/([^/]+)\/cards\/(closed|open)$/.exec(u.path))) {
        var wantClosed = m[2] === 'closed';
        res = { ok: true, data: cards.filter(function (c) { return c.closed === wantClosed; }).map(function (c) { return pick(c, u.query.fields); }) };
      } else if (method === 'POST' && u.path === '/cards') {
        var card = {
          id: 'card' + ++seq,
          name: u.query.name || '',
          desc: u.query.desc || '',
          idList: u.query.idList,
          closed: false,
          dateLastActivity: clock(),
        };
        cards.push(card);
        res = { ok: true, data: pick(card) };
      } else if ((m = /^\/cards\/([^/]+)$/.exec(u.path))) {
        var found = cards.filter(function (c) { return c.id === m[1]; })[0];
        if (!found) res = { ok: false, reason: 'http-404', detail: 'card not found' };
        else if (method === 'GET') res = { ok: true, data: pick(found, u.query.fields) };
        else if (method === 'PUT') {
          ['name', 'desc', 'closed', 'idList'].forEach(function (k) {
            if (body && k in body) found[k] = body[k];
          });
          if (body && body.desc != null && body.desc.length > 16384) {
            res = { ok: false, reason: 'http-400', detail: 'invalid value for desc' };
          } else {
            found.dateLastActivity = clock();
            res = { ok: true, data: pick(found) };
          }
        } else if (method === 'DELETE') {
          cards.splice(cards.indexOf(found), 1);
          res = { ok: true, data: {} };
        }
      }
      return Promise.resolve(res || { ok: false, reason: 'http-400', detail: 'unsupported ' + method + ' ' + rawPath });
    }

    var t = {
      board: function (field) {
        var all = { id: 'b1', members: members };
        if (field === 'members') return Promise.resolve({ members: members });
        return Promise.resolve(field ? { id: all.id } : all);
      },
      lists: function () {
        return Promise.resolve(lists.map(function (l) { return Object.assign({}, l); }));
      },
      cards: function () {
        var fields = Array.prototype.slice.call(arguments);
        return Promise.resolve(
          cards.filter(function (c) { return !c.closed; }).map(function (c) {
            var out = { id: c.id };
            fields.forEach(function (f) { if (f in c) out[f] = c[f]; });
            return out;
          })
        );
      },
      get: function (_a, _b, k) { return Promise.resolve(storage[k] === undefined ? null : storage[k]); },
      set: function (_a, _b, k, v) { storage[k] = v; return Promise.resolve(); },
      render: function (fn) { fn(); },
      sizeTo: function () { return Promise.resolve(); },
      modal: function (o) { calls.push({ method: 'MODAL', path: o && o.url, body: o && o.args }); return Promise.resolve(); },
    };

    return {
      t: t,
      trelloRest: trelloRest,
      calls: calls,
      cards: cards,
      lists: lists,
      setAuthorized: function (v) { authorized = !!v; },
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FakeTrello = api;
})(typeof window !== 'undefined' ? window : this);
