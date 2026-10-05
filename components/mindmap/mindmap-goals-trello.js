/*
 * Role: Trello I/O of the goal hierarchy shown in the Mindmap (vision, mission, goal, unit of work and the
 * links down to the tasks). Same approach as the Entities: Power-Up storage is capped at 4096 chars, so the
 * data lives in the description of ONE archived card named "🎯 Carte des objectifs" (JSON in a hidden
 * `<!--cerveau-goals ... -->` block with a `rev` counter; saving over a newer revision is refused with
 * reason 'conflict'). Writes use SheetsTrello.trelloRest (the Power-Up REST token).
 * Data shape: { nodes: [{id:'g:…', level, name}], links: [{from, to}] }, see MindmapModel.normalizeGoals.
 */
(function (global) {
  'use strict';

  var MARK = '🎯';
  var CARD_NAME = MARK + ' Carte des objectifs';
  var MAX_DESC = 16384;
  var BLOCK_RE = /<!--cerveau-goals\n([\s\S]*?)\n-->\s*$/;
  var ref = null; // { cardId, rev } of the loaded card, null while none exists

  function ST() { return global.SheetsTrello; }
  function PT() { return global.PriorityTrello; }
  function GT() { return global.GanttTrello; }
  function MM() { return global.MindmapModel; }

  function fail(reason, detail) {
    var err = new Error(reason);
    err.reason = reason;
    if (detail) err.detail = detail;
    return err;
  }
  function need(res) {
    if (!res || res.ok === false) throw fail((res && res.reason) || 'trello-failed', res && res.detail);
    return res.data;
  }
  function enc(s) { return encodeURIComponent(s); }

  function boardId(t) {
    return t.board('id').then(function (b) {
      var id = b && (b.id || b);
      if (!id || typeof id !== 'string') throw fail('no-board');
      return id;
    });
  }

  function isAuthorized(t) {
    var pt = PT();
    if (!pt || typeof pt.isRestAuthorized !== 'function') return Promise.resolve(false);
    return Promise.resolve(pt.isRestAuthorized(t)).then(function (ok) { return !!ok; }, function () { return false; });
  }

  /** Must run from a click (opens Trello's authorization popup). */
  function authorize(t) {
    return GT().ensureRestAuthorized(t).then(function (res) {
      if (!res || !res.ok) throw fail((res && res.reason) || 'auth-failed');
      return true;
    });
  }

  function pack(data, rev) {
    var summary = 'Carte des objectifs (vision, mission, objectifs, unités de travail). Gérée par la vue Mindmap : ne pas modifier à la main.';
    var json = JSON.stringify(Object.assign({ rev: rev }, data)).replace(/--/g, '-\\u002d');
    var desc = summary + '\n\n<!--cerveau-goals\n' + json + '\n-->';
    if (desc.length > MAX_DESC) throw fail('too-long');
    return desc;
  }

  function unpack(desc) {
    var m = BLOCK_RE.exec(String(desc == null ? '' : desc).replace(/\r\n?/g, '\n'));
    if (!m) return null;
    try {
      var obj = JSON.parse(m[1]);
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) {
      return null;
    }
  }

  /** @returns {Promise<{nodes:object[], links:object[]}>} empty when no goal card exists yet */
  function load(t) {
    return boardId(t).then(function (id) {
      return ST().trelloRest(t, '/boards/' + enc(id) + '/cards/closed?fields=name,desc');
    }).then(function (res) {
      var cards = need(res) || [];
      var best = null;
      cards.forEach(function (c) {
        if (!c || !c.id || typeof c.name !== 'string' || c.name.indexOf(MARK) !== 0) return;
        var obj = unpack(c.desc);
        if (obj && (!best || (obj.rev || 0) > (best.obj.rev || 0))) best = { cardId: String(c.id), obj: obj };
      });
      ref = best ? { cardId: best.cardId, rev: best.obj.rev || 1 } : null;
      return MM().normalizeGoals(best && best.obj);
    });
  }

  function createCard(t, data) {
    return boardId(t).then(function (id) {
      return t.lists('id').then(function (lists) {
        if (!lists || !lists.length) throw fail('no-list');
        return ST().trelloRest(t, '/cards?idList=' + enc(lists[0].id) + '&name=' + enc(CARD_NAME) + '&pos=bottom&desc=' + enc(MARK), 'POST');
      });
    }).then(function (res) {
      var created = need(res);
      if (!created || !created.id) throw fail('no-card');
      return ST().trelloRest(t, '/cards/' + enc(created.id), 'PUT', { closed: true, desc: pack(data, 1) }).then(function (r2) {
        try {
          need(r2);
        } catch (err) {
          // never leave a visible helper card on the board
          return ST().trelloRest(t, '/cards/' + enc(created.id), 'DELETE').catch(function () {}).then(function () { throw err; });
        }
        ref = { cardId: String(created.id), rev: 1 };
      });
    });
  }

  /** Saves the whole goal data. @throws Error with .reason 'conflict' | 'too-long' | 'not-authorized' | http-xxx */
  function save(t, data) {
    var clean = MM().normalizeGoals(data);
    if (!ref) return createCard(t, clean).then(function () { return clean; });
    var current = ref;
    return ST().trelloRest(t, '/cards/' + enc(current.cardId) + '?fields=desc').then(function (res) {
      var obj = unpack((need(res) || {}).desc);
      if (((obj && obj.rev) || 1) !== current.rev) throw fail('conflict');
      var rev = current.rev + 1;
      return ST().trelloRest(t, '/cards/' + enc(current.cardId), 'PUT', { desc: pack(clean, rev) }).then(function (r2) {
        need(r2);
        ref = { cardId: current.cardId, rev: rev };
        return clean;
      });
    });
  }

  function newId() {
    return 'g:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  global.MindmapGoalsTrello = {
    MARK: MARK,
    isAuthorized: isAuthorized,
    authorize: authorize,
    load: load,
    save: save,
    newId: newId,
  };
})(typeof window !== 'undefined' ? window : this);
