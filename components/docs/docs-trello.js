/*
 * Role: Trello I/O for the Document view. Trello is the source of truth, no extra backend.
 *
 * Where documents live: Power-Up storage is capped at 4096 chars per scope, far too small for a
 * document. A document is therefore a Trello card whose description (16 384 chars) holds the text
 * (Markdown, see DocsModel). The card is named "📄 Title" and ARCHIVED right after creation, so it
 * never shows on the board, in the Gantt / Table, in the Sheet sync or in any card picker. The view
 * lists them with GET /boards/{id}/cards/closed and keeps only names starting with the 📄 marker.
 * They stay visible (and restorable / deletable) in Trello's "Archived items".
 *
 * Writes go through SheetsTrello.trelloRest (the Power-Up REST token), like the Table view.
 * Concurrent edits are detected with a `rev` counter stored in the hidden meta block of the
 * description (optimistic concurrency: a save over a newer revision is refused with reason 'conflict').
 */
(function (global) {
  'use strict';

  function ST() {
    return global.SheetsTrello;
  }
  function GT() {
    return global.GanttTrello;
  }
  function PT() {
    return global.PriorityTrello;
  }
  function DM() {
    return global.DocsModel;
  }

  function fail(reason, extra) {
    var err = new Error(reason);
    err.reason = reason;
    if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
    return err;
  }

  /** Unwraps a trelloRest result or throws an Error carrying `.reason` (http-404, not-authorized...). */
  function need(res) {
    if (!res || res.ok === false) throw fail((res && res.reason) || 'trello-failed', { detail: res && res.detail });
    return res.data;
  }

  async function boardId(t) {
    var b = await t.board('id');
    var id = b && (b.id || b);
    if (!id || typeof id !== 'string') throw fail('no-board');
    return id;
  }

  /** The list the (archived) document cards are filed in: the board's first list. */
  async function homeListId(t) {
    var lists = (await t.lists('id', 'name')) || [];
    if (!lists.length || !lists[0].id) throw fail('no-list');
    return String(lists[0].id);
  }

  function enc(s) {
    return encodeURIComponent(s);
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

  /** @returns {Promise<{id:string,title:string,updatedAt:string}[]>} newest first */
  async function listDocs(t) {
    var id = await boardId(t);
    var cards = need(await ST().trelloRest(t, '/boards/' + enc(id) + '/cards/closed?fields=name,dateLastActivity')) || [];
    return cards
      .filter(function (c) {
        return c && c.id && DM().isDocName(c.name);
      })
      .map(function (c) {
        return { id: String(c.id), title: DM().titleFromName(c.name), updatedAt: c.dateLastActivity || '' };
      })
      .sort(function (a, b) {
        return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
      });
  }

  /** @returns {Promise<{id,title,body,rev,updatedAt}>} */
  async function loadDoc(t, docId) {
    var card = need(await ST().trelloRest(t, '/cards/' + enc(docId) + '?fields=name,desc,dateLastActivity'));
    if (!card || !DM().isDocName(card.name)) throw fail('not-a-document');
    var u = DM().unpackDesc(card.desc);
    return {
      id: String(card.id || docId),
      title: DM().titleFromName(card.name),
      body: u.body,
      rev: u.rev,
      updatedAt: card.dateLastActivity || '',
    };
  }

  /** Creates the card (hidden-meta description) then archives it, with the body in the same call. */
  async function createDoc(t, title, body) {
    var text = String(body == null ? '' : body);
    if (DM().sizeInfo(text).over) throw fail('too-long');
    var listId = await homeListId(t);
    var name = DM().nameFromTitle(title);
    var created = need(
      await ST().trelloRest(
        t,
        '/cards?idList=' + enc(listId) + '&name=' + enc(name) + '&pos=bottom&desc=' + enc(DM().packDesc('', { rev: 1 })),
        'POST'
      )
    );
    if (!created || !created.id) throw fail('no-card');
    try {
      need(await ST().trelloRest(t, '/cards/' + enc(created.id), 'PUT', { closed: true, desc: DM().packDesc(text, { rev: 1 }) }));
    } catch (err) {
      // never leave a visible document card on the board
      await ST().trelloRest(t, '/cards/' + enc(created.id), 'DELETE').catch(function () {});
      throw err;
    }
    return {
      id: String(created.id),
      title: DM().titleFromName(name),
      body: text,
      rev: 1,
      updatedAt: created.dateLastActivity || new Date().toISOString(),
    };
  }

  /**
   * Saves the body. Refuses ({reason:'conflict', remote}) when someone saved a newer revision since
   * `doc.rev` was loaded, unless opts.force.
   * @returns {Promise<{rev:number, updatedAt:string}>}
   */
  async function saveDoc(t, doc, opts) {
    opts = opts || {};
    var nextRev = (doc.rev || 1) + 1;
    var desc = DM().packDesc(doc.body, { rev: nextRev });
    if (desc.length > DM().MAX_DESC) throw fail('too-long');
    if (!opts.force) {
      var cur = need(await ST().trelloRest(t, '/cards/' + enc(doc.id) + '?fields=desc'));
      var remote = DM().unpackDesc(cur && cur.desc);
      if (remote.rev !== (doc.rev || 1)) throw fail('conflict', { remote: { rev: remote.rev, body: remote.body } });
    }
    var card = need(await ST().trelloRest(t, '/cards/' + enc(doc.id), 'PUT', { desc: desc }));
    return { rev: nextRev, updatedAt: (card && card.dateLastActivity) || new Date().toISOString() };
  }

  async function renameDoc(t, docId, title) {
    var card = need(await ST().trelloRest(t, '/cards/' + enc(docId), 'PUT', { name: DM().nameFromTitle(title) }));
    return { title: DM().titleFromName((card && card.name) || DM().nameFromTitle(title)) };
  }

  /** Permanent: the card is deleted from Trello (not just left archived). */
  async function deleteDoc(t, docId) {
    need(await ST().trelloRest(t, '/cards/' + enc(docId), 'DELETE'));
  }

  /** Raw material for the @ picker; DocsModel.buildMentionIndex turns it into a searchable index. */
  async function loadMentionSources(t) {
    var failed = [];
    function safe(name, fn, fallback) {
      return Promise.resolve()
        .then(fn)
        .then(function (v) {
          return v == null ? fallback : v;
        })
        .catch(function () {
          failed.push(name);
          return fallback;
        });
    }
    var pt = PT();
    var people = global.People;
    var out = await Promise.all([
      safe('members', function () { return pt.getBoardMembers(t); }, []),
      safe('contacts', function () { return people.load(t); }, null),
      safe('cards', function () { return t.cards('id', 'name', 'idList', 'dueComplete', 'url'); }, []),
      safe('lists', function () { return t.lists('id', 'name'); }, []),
    ]);
    return {
      members: Array.isArray(out[0]) ? out[0] : [],
      contacts: out[1] && Array.isArray(out[1].people) ? out[1].people : [],
      cards: Array.isArray(out[2]) ? out[2] : [],
      lists: Array.isArray(out[3]) ? out[3] : [],
      /** names of the sources that could not be read (so "not found" is not mistaken for "unavailable") */
      failed: failed,
    };
  }

  global.DocsTrello = {
    isAuthorized: isAuthorized,
    authorize: authorize,
    listDocs: listDocs,
    loadDoc: loadDoc,
    createDoc: createDoc,
    saveDoc: saveDoc,
    renameDoc: renameDoc,
    deleteDoc: deleteDoc,
    loadMentionSources: loadMentionSources,
  };
})(typeof window !== 'undefined' ? window : this);
