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

  /* Folder tree: one hidden archived card holds it (see DocsModel "Folders"); listDocs refreshes the cache. */
  var folderIndex = null;
  var indexCardId = '';

  /** The folder tree read by the last listDocs (empty before that). */
  function getFolderIndex() {
    return folderIndex || DM().emptyIndex();
  }

  /**
   * Read-modify-write of the folder tree: re-reads the card so two members' edits merge instead of
   * overwriting each other, applies `mutate(index)` (which may throw to abort), saves, returns the new tree.
   */
  async function updateFolderIndex(t, mutate) {
    var id = await boardId(t);
    var cards = need(await ST().trelloRest(t, '/boards/' + enc(id) + '/cards/closed?fields=name,desc')) || [];
    var card = cards.filter(function (c) {
      return c && c.id && DM().isFolderIndexName(c.name);
    })[0];
    var idx = DM().parseFolderIndex(card && card.desc);
    mutate(idx);
    var desc = DM().packFolderIndex(idx);
    if (desc.length > DM().MAX_DESC) throw fail('too-long');
    if (card) {
      need(await ST().trelloRest(t, '/cards/' + enc(card.id), 'PUT', { desc: desc }));
      indexCardId = String(card.id);
    } else {
      var listId = await homeListId(t);
      var created = need(
        await ST().trelloRest(t, '/cards?idList=' + enc(listId) + '&name=' + enc(DM().FOLDER_INDEX_NAME) + '&pos=bottom&desc=' + enc(desc), 'POST')
      );
      if (!created || !created.id) throw fail('no-card');
      try {
        need(await ST().trelloRest(t, '/cards/' + enc(created.id), 'PUT', { closed: true }));
      } catch (err) {
        await ST().trelloRest(t, '/cards/' + enc(created.id), 'DELETE').catch(function () {});
        throw err;
      }
      indexCardId = String(created.id);
    }
    folderIndex = idx;
    return idx;
  }

  /**
   * Each folder is a document. Folders that have no live document card get one (empty), and the
   * index stores its id. Already-linked folders are left alone. An extra card created in a race
   * (someone else linked first) is deleted.
   * @returns {Promise<{docs:object[], idx:object, created:object[]}>}
   */
  async function ensureFolderDocs(t, docs) {
    docs = Array.isArray(docs) ? docs : [];
    var idx = getFolderIndex();
    var live = {};
    docs.forEach(function (d) { if (d && d.id) live[d.id] = true; });
    var missing = (idx.folders || []).filter(function (f) { return !f.doc || !live[f.doc]; });
    if (!missing.length) return { docs: docs, idx: idx, created: [] };
    var made = [];
    for (var i = 0; i < missing.length; i++) {
      made.push({ folderId: missing[i].id, doc: await createDoc(t, missing[i].name, '') });
    }
    var orphans = [];
    var next = await updateFolderIndex(t, function (tree) {
      made.forEach(function (c) {
        var x = DM().folderById(tree, c.folderId);
        if (!x || (x.doc && live[x.doc])) {
          orphans.push(c.doc.id);
          return;
        }
        x.doc = c.doc.id;
        var name = DM().cleanFolderName(c.doc.title);
        if (name) x.name = name;
      });
    });
    for (var j = 0; j < orphans.length; j++) {
      await deleteDoc(t, orphans[j]).catch(function () {});
    }
    var out = docs.slice();
    var created = [];
    made.forEach(function (c) {
      if (orphans.indexOf(c.doc.id) >= 0) return;
      created.push(c.doc);
      out.unshift({
        id: c.doc.id,
        title: c.doc.title,
        updatedAt: c.doc.updatedAt || '',
        size: String(c.doc.body || '').length,
        body: c.doc.body || '',
      });
    });
    return { docs: out, idx: next, created: created };
  }

  /** @returns {Promise<{id:string,title:string,updatedAt:string}[]>} newest first */
  async function listDocs(t) {
    var id = await boardId(t);
    var cards = need(await ST().trelloRest(t, '/boards/' + enc(id) + '/cards/closed?fields=name,desc,dateLastActivity')) || [];
    var idxCard = cards.filter(function (c) {
      return c && c.id && DM().isFolderIndexName(c.name);
    })[0];
    indexCardId = idxCard ? String(idxCard.id) : '';
    folderIndex = DM().parseFolderIndex(idxCard && idxCard.desc);
    return cards
      .filter(function (c) {
        return c && c.id && DM().isDocName(c.name);
      })
      .map(function (c) {
        var u = DM().unpackDesc(c.desc);
        return {
          id: String(c.id),
          title: DM().titleFromName(c.name),
          updatedAt: c.dateLastActivity || '',
          size: u.body.length,
          body: u.body,
          subject: u.subject,
          props: u.props,
          icon: u.icon,
        };
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
      cover: u.cover,
      subject: u.subject,
      props: u.props,
      icon: u.icon,
      updatedAt: card.dateLastActivity || '',
    };
  }

  /** Creates the card (hidden-meta description) then archives it, with the body in the same call. */
  async function createDoc(t, title, body, opts) {
    var text = String(body == null ? '' : body);
    var cover = DM().normalizeCover(opts && opts.cover);
    var subject = DM().normalizeSubject(opts && opts.subject);
    var props = DM().normalizeProps(opts && opts.props);
    var icon = DM().normalizeIcon(opts && opts.icon);
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
      need(await ST().trelloRest(t, '/cards/' + enc(created.id), 'PUT', { closed: true, desc: DM().packDesc(text, { rev: 1, cover: cover, subject: subject, props: props, icon: icon }) }));
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
      cover: cover,
      subject: subject,
      props: props,
      icon: icon,
      updatedAt: created.dateLastActivity || new Date().toISOString(),
    };
  }

  /**
   * The Documents view never opens empty: when the board has no document, a default one is created.
   * Re-lists right before creating so two members opening the view together rarely create two.
   * @param {{id:string,title:string,updatedAt:string}[]} docs what listDocs just returned
   * @returns {Promise<{docs: object[], created: object|null}>} docs includes the new one
   */
  async function ensureDefaultDoc(t, docs) {
    if (docs && docs.length) return { docs: docs, created: null };
    var again = await listDocs(t);
    if (again.length) return { docs: again, created: null };
    var doc = await createDoc(t, DM().DEFAULT_TITLE, DM().DEFAULT_BODY);
    return { docs: [{ id: doc.id, title: doc.title, updatedAt: doc.updatedAt }], created: doc };
  }

  /**
   * Saves the body (and `doc.cover`, which is rewritten with it). Refuses ({reason:'conflict', remote})
   * when someone saved a newer revision since `doc.rev` was loaded, unless opts.force.
   * @returns {Promise<{rev:number, updatedAt:string}>}
   */
  async function saveDoc(t, doc, opts) {
    opts = opts || {};
    var nextRev = (doc.rev || 1) + 1;
    var cover = doc.cover;
    var subject = doc.subject;
    var props = doc.props;
    var icon = doc.icon;
    // A body save that omits cover / subject / props / icon keeps whatever is already stored.
    if (!opts.force || cover === undefined || subject === undefined || props === undefined || icon === undefined) {
      var cur = need(await ST().trelloRest(t, '/cards/' + enc(doc.id) + '?fields=desc'));
      var remote = DM().unpackDesc(cur && cur.desc);
      if (!opts.force && remote.rev !== (doc.rev || 1)) throw fail('conflict', { remote: { rev: remote.rev, body: remote.body } });
      if (cover === undefined) cover = remote.cover;
      if (subject === undefined) subject = remote.subject;
      if (props === undefined) props = remote.props;
      if (icon === undefined) icon = remote.icon;
    }
    var desc = DM().packDesc(doc.body, { rev: nextRev, cover: cover, subject: subject, props: props, icon: icon });
    if (desc.length > DM().MAX_DESC) throw fail('too-long');
    var card = need(await ST().trelloRest(t, '/cards/' + enc(doc.id), 'PUT', { desc: desc }));
    return { rev: nextRev, updatedAt: (card && card.dateLastActivity) || new Date().toISOString() };
  }

  /**
   * Changes only the cover (null removes it): the remote body is kept and the revision bumped, so other
   * members pick it up. Same conflict rule as saveDoc.
   * @returns {Promise<{rev:number, updatedAt:string, cover:object|null}>}
   */
  async function setCover(t, doc, cover) {
    var cur = need(await ST().trelloRest(t, '/cards/' + enc(doc.id) + '?fields=desc'));
    var remote = DM().unpackDesc(cur && cur.desc);
    if (remote.rev !== (doc.rev || 1)) throw fail('conflict', { remote: { rev: remote.rev, body: remote.body } });
    var next = DM().normalizeCover(cover);
    var nextRev = remote.rev + 1;
    var desc = DM().packDesc(remote.body, { rev: nextRev, cover: next, subject: remote.subject, props: remote.props, icon: remote.icon });
    if (desc.length > DM().MAX_DESC) throw fail('too-long');
    var card = need(await ST().trelloRest(t, '/cards/' + enc(doc.id), 'PUT', { desc: desc }));
    return { rev: nextRev, updatedAt: (card && card.dateLastActivity) || new Date().toISOString(), cover: next };
  }

  /**
   * Changes only the sidebar icon (null clears it). The remote body stays. `doc.rev` null means
   * apply on the latest text (the list does not keep a revision).
   * @returns {Promise<{rev:number, updatedAt:string, icon:object|null}>}
   */
  async function setIcon(t, doc, icon) {
    var cur = need(await ST().trelloRest(t, '/cards/' + enc(doc.id) + '?fields=desc,dateLastActivity'));
    var remote = DM().unpackDesc(cur && cur.desc);
    if (doc.rev != null && remote.rev !== doc.rev) throw fail('conflict', { remote: { rev: remote.rev, body: remote.body } });
    var next = DM().normalizeIcon(icon);
    if (DM().sameIcon(next, remote.icon)) {
      return { rev: remote.rev, updatedAt: (cur && cur.dateLastActivity) || '', icon: next };
    }
    var nextRev = remote.rev + 1;
    var desc = DM().packDesc(remote.body, { rev: nextRev, cover: remote.cover, subject: remote.subject, props: remote.props, icon: next });
    if (desc.length > DM().MAX_DESC) throw fail('too-long');
    var card = need(await ST().trelloRest(t, '/cards/' + enc(doc.id), 'PUT', { desc: desc }));
    return { rev: nextRev, updatedAt: (card && card.dateLastActivity) || new Date().toISOString(), icon: next };
  }

  async function restCreds(t) {
    var cfg = global.PriorityRestConfig;
    if (!cfg || !cfg.appKey) throw fail('no-app-key');
    var api = await t.getRestApi();
    var token = (await api.isAuthorized()) ? await api.getToken() : null;
    if (!token) throw fail('not-authorized');
    return { key: cfg.appKey, token: token };
  }

  /**
   * Uploads an image (File / Blob) as an attachment of the card and returns a pointer to it.
   * The file name is ours (no characters that would break the download URL). `prefix === 'note'`
   * marks a description picture (`note-…`); anything else is a cover (`couverture-…`).
   */
  async function uploadCover(t, docId, blob, ext, prefix) {
    var c = await restCreds(t);
    var kind = prefix === 'note' ? 'note' : 'couverture';
    var name = kind + '-' + Date.now() + '.' + (/^(jpg|png|webp|gif)$/.test(ext) ? ext : 'jpg');
    var form = new FormData();
    form.append('file', blob, name);
    form.append('name', name);
    form.append('setCover', 'false');
    var res = await fetch(
      'https://api.trello.com/1/cards/' + enc(docId) + '/attachments?key=' + enc(c.key) + '&token=' + enc(c.token),
      { method: 'POST', body: form }
    );
    if (!res.ok) throw fail('http-' + res.status);
    var att = await res.json();
    var cover = DM().normalizeCover({ k: 'upload', c: docId, a: att && att.id, n: name });
    if (!cover) throw fail('upload-failed');
    if (typeof URL !== 'undefined' && URL.createObjectURL) blobCache[cover.a] = URL.createObjectURL(blob);
    return cover;
  }

  /**
   * Description pictures already attached to a card (`note-…` files). Nothing is written into
   * pluginData or the goal map: the attachment list is the index.
   * @returns {Promise<{src:string, alt:string}[]>}
   */
  async function listNoteImages(t, cardId) {
    var res = await ST().trelloRest(t, '/cards/' + enc(cardId) + '/attachments?fields=id,name');
    if (!res || res.ok === false) throw fail((res && res.reason) || 'trello-failed', res && res.detail);
    var rows = Array.isArray(res.data) ? res.data : [];
    var ui = global.TriageUI;
    return ui && typeof ui.noteShots === 'function' ? ui.noteShots(cardId, rows) : [];
  }

  /* Uploaded covers are Trello attachments, which need the token to be read: fetched once as blob URLs. */
  var blobCache = {};

  async function coverBlobUrl(t, cover) {
    var c = DM().normalizeCover(cover);
    if (!c || c.k !== 'upload') return '';
    if (blobCache[c.a]) return blobCache[c.a];
    var creds = await restCreds(t);
    var res = await fetch('https://api.trello.com/1/cards/' + enc(c.c) + '/attachments/' + enc(c.a) + '/download/' + enc(c.n), {
      headers: { Authorization: 'OAuth oauth_consumer_key="' + creds.key + '", oauth_token="' + creds.token + '"' },
    });
    if (!res.ok) throw fail('http-' + res.status);
    var url = URL.createObjectURL(await res.blob());
    blobCache[c.a] = url;
    return url;
  }

  /**
   * Unsplash search through the board's Worker (it holds the API key). Resolves null when the Worker is
   * not connected or has no key, so the caller falls back to the curated gallery.
   */
  async function searchUnsplash(t, query) {
    var st = ST();
    if (!st || typeof st.getSettings !== 'function') return null;
    var settings = await st.getSettings(t).catch(function () { return null; });
    if (!settings || !st.isConnected(settings)) return null;
    var r = await st.workerCall(settings, 'GET', '/unsplash?q=' + enc(String(query || '').slice(0, 100)));
    if (!r.ok || !r.data || !r.data.enabled || !Array.isArray(r.data.results)) return null;
    return r.data.results.map(DM().normalizeCover).filter(Boolean);
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

  function metaOf(full) {
    var meta = global.DescMeta;
    if (meta && typeof meta.splitDesc === 'function') {
      var split = meta.splitDesc(full);
      return (split && split.meta) || {};
    }
    return {};
  }

  function visibleOf(full) {
    var meta = global.DescMeta;
    if (meta && typeof meta.splitDesc === 'function') return meta.splitDesc(full).visible || '';
    return String(full || '');
  }

  function joinVisible(full, visible) {
    var meta = global.DescMeta;
    if (meta && typeof meta.splitDesc === 'function' && typeof meta.joinDesc === 'function') {
      return meta.joinDesc(visible, meta.splitDesc(full).meta);
    }
    return String(visible || '');
  }

  /** Live fields of a task card: name, visible description, due, members, labels. */
  async function loadCardFace(t, cardId) {
    var card = need(
      await ST().trelloRest(
        t,
        '/cards/' + enc(cardId) + '?fields=name,desc,due,dueComplete,closed,url&members=true&member_fields=fullName,username&labels=true'
      )
    );
    if (!card) throw fail('http-404');
    return {
      id: String(card.id || cardId),
      name: card.name || '',
      desc: visibleOf(card.desc),
      meta: metaOf(card.desc),
      due: card.due || '',
      dueComplete: !!card.dueComplete,
      closed: !!card.closed,
      url: card.url || '',
      members: (card.members || []).map(function (m) {
        return { id: String(m.id), name: m.fullName || m.username || '' };
      }),
      labels: (card.labels || []).map(function (l) {
        return { id: String(l.id), name: l.name || '', color: l.color || '' };
      }),
    };
  }

  /** Writes the visible description and keeps the hidden Cerveau block on the task card. */
  async function saveCardDesc(t, cardId, visible) {
    var card = need(await ST().trelloRest(t, '/cards/' + enc(cardId) + '?fields=desc'));
    var next = joinVisible(card && card.desc, visible);
    if (next.length > 16384) throw fail('too-long');
    need(await ST().trelloRest(t, '/cards/' + enc(cardId), 'PUT', { desc: next }));
    return { desc: visibleOf(next) };
  }

  async function setCardMembers(t, cardId, ids) {
    var list = (ids || []).map(function (id) { return DM().cleanId(id); }).filter(Boolean);
    need(await ST().trelloRest(t, '/cards/' + enc(cardId), 'PUT', { idMembers: list.join(',') }));
  }

  async function setCardLabels(t, cardId, ids) {
    var list = (ids || []).map(function (id) { return DM().cleanId(id); }).filter(Boolean);
    need(await ST().trelloRest(t, '/cards/' + enc(cardId), 'PUT', { idLabels: list.join(',') }));
  }

  /** Writes one hidden desc-meta key on the task card and keeps the visible text. */
  async function saveCardMeta(t, cardId, key, value) {
    var meta = global.DescMeta;
    if (!meta || typeof meta.setMeta !== 'function') throw fail('no-meta');
    var card = need(await ST().trelloRest(t, '/cards/' + enc(cardId) + '?fields=desc'));
    var next = meta.setMeta(card && card.desc, key, value);
    if (next.length > 16384) throw fail('too-long');
    need(await ST().trelloRest(t, '/cards/' + enc(cardId), 'PUT', { desc: next }));
    return { meta: metaOf(next) };
  }

  /**
   * Priority inputs and the Catégorie custom field for one task.
   * Missing pieces stay empty; the page still shows the label-derived value.
   */
  async function loadTaskFields(t, cardId) {
    var inputs = null;
    var pt = PT();
    if (pt && typeof pt.getCardInputsById === 'function') {
      try {
        inputs = await pt.getCardInputsById(t, cardId);
      } catch (e) {
        inputs = null;
      }
    }
    var category = '';
    var categoryFieldId = null;
    try {
      var board = await t.board('id');
      var boardId = board && board.id;
      if (boardId) {
        var fields = await ST().trelloRest(t, '/boards/' + enc(boardId) + '/customFields');
        if (fields && fields.ok) {
          var field = (fields.data || []).filter(function (f) {
            return f && f.name === 'Catégorie' && f.type === 'text';
          })[0];
          if (field) {
            categoryFieldId = field.id;
            var card = await ST().trelloRest(t, '/cards/' + enc(cardId) + '?fields=id&customFieldItems=true');
            var item = card && card.ok && card.data
              ? (card.data.customFieldItems || []).filter(function (i) { return i.idCustomField === field.id; })[0]
              : null;
            if (item && item.value && item.value.text) category = String(item.value.text);
          }
        }
      }
    } catch (e2) {
      category = '';
    }
    return { inputs: inputs, category: category, categoryFieldId: categoryFieldId };
  }

  var ENTITY_MARK = '🧩';
  var ENTITY_BLOCK = /<!--cerveau-entity\n([\s\S]*?)\n-->\s*$/;

  function parseEntityBlob(desc) {
    var m = ENTITY_BLOCK.exec(String(desc || '').replace(/\r\n?/g, '\n'));
    if (!m) return null;
    try {
      var obj = JSON.parse(m[1]);
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) {
      return null;
    }
  }

  /** Name and aliases of an entity card. Types stay on the entity page (they are ids here). */
  async function loadEntityFace(t, entityId) {
    var card = need(await ST().trelloRest(t, '/cards/' + enc(entityId) + '?fields=name,desc'));
    if (!card || String(card.name || '').indexOf(ENTITY_MARK) !== 0) throw fail('not-an-entity');
    var obj = parseEntityBlob(card.desc) || {};
    var aliases = Array.isArray(obj.aliases)
      ? obj.aliases.filter(function (a) { return typeof a === 'string' && a.trim(); }).slice(0, 12)
      : [];
    return {
      id: String(card.id || entityId),
      name: String(obj.name || card.name).replace(/^🧩\s?/, '').trim() || 'Sans titre',
      aliases: aliases,
    };
  }

  /** Entities the page can be linked to (archived 🧩 cards, schema excluded). */
  async function listEntityChoices(t) {
    var id = await boardId(t);
    var cards = need(await ST().trelloRest(t, '/boards/' + enc(id) + '/cards/closed?fields=name')) || [];
    return cards
      .filter(function (c) {
        return c && c.id && typeof c.name === 'string' && c.name.indexOf(ENTITY_MARK) === 0 && c.name.indexOf('Schéma des entités') < 0;
      })
      .map(function (c) {
        return { id: String(c.id), name: String(c.name).replace(/^🧩\s?/, '').trim() || 'Sans titre' };
      });
  }

  /**
   * The one document bound to this task or entity. Creates it (titled with the subject's name) when missing.
   * @returns {Promise<{doc:object, created:boolean, docs:object[]}>}
   */
  async function ensureSubjectDoc(t, kind, id, nameHint) {
    var subject = DM().normalizeSubject({ k: kind, id: id });
    if (!subject) throw fail('bad-subject');
    var docs = await listDocs(t);
    var found = DM().docForSubject(docs, subject.k, subject.id);
    if (found) return { doc: await loadDoc(t, found.id), created: false, docs: docs };
    var hinted = String(nameHint || '').replace(/\s+/g, ' ').trim();
    var title = hinted || DM().UNTITLED;
    if (subject.k === 'task' || subject.k === 'entity') {
      try {
        title = subject.k === 'task' ? (await loadCardFace(t, subject.id)).name : (await loadEntityFace(t, subject.id)).name;
      } catch (e) {
        title = hinted || DM().UNTITLED;
      }
    }
    var doc = await createDoc(t, title || DM().UNTITLED, '', { subject: subject });
    docs.unshift({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt, size: 0, subject: doc.subject, props: doc.props });
    return { doc: doc, created: true, docs: docs };
  }

  /**
   * Rewrites subject and/or props. Omitted keys are kept. `null` clears that key.
   * The body and the cover stay as stored. Same conflict rule as setCover.
   */
  async function patchMeta(t, doc, patch) {
    patch = patch || {};
    var cur = need(await ST().trelloRest(t, '/cards/' + enc(doc.id) + '?fields=desc'));
    var remote = DM().unpackDesc(cur && cur.desc);
    if (remote.rev !== (doc.rev || 1)) throw fail('conflict', { remote: { rev: remote.rev, body: remote.body } });
    var nextRev = remote.rev + 1;
    var subject = patch.subject !== undefined ? DM().normalizeSubject(patch.subject) : remote.subject;
    var props = patch.props !== undefined ? DM().normalizeProps(patch.props) : remote.props;
    var desc = DM().packDesc(remote.body, { rev: nextRev, cover: remote.cover, subject: subject, props: props, icon: remote.icon });
    if (desc.length > DM().MAX_DESC) throw fail('too-long');
    var card = need(await ST().trelloRest(t, '/cards/' + enc(doc.id), 'PUT', { desc: desc }));
    return {
      rev: nextRev,
      updatedAt: (card && card.dateLastActivity) || new Date().toISOString(),
      subject: subject,
      props: props,
    };
  }

  /**
   * A real board card (not archived, unlike a document) whose name is the selected text.
   * `listId` empty means the board's first list.
   */
  async function createTask(t, name, listId, desc) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) throw fail('no-name');
    var idList = listId ? String(listId) : await homeListId(t);
    var created = need(
      await ST().trelloRest(t, '/cards?idList=' + enc(idList) + '&name=' + enc(name) + '&pos=bottom', 'POST')
    );
    if (!created || !created.id) throw fail('no-card');
    var body = String(desc || '').trim();
    if (body) {
      if (body.length > DM().MAX_DESC) body = body.slice(0, DM().MAX_DESC);
      try {
        need(await ST().trelloRest(t, '/cards/' + enc(created.id), 'PUT', { desc: body }));
      } catch (e) {
        /* the card exists; the description can be added by hand */
      }
    }
    return {
      id: String(created.id),
      name: (created.name && String(created.name)) || name,
      idList: String(created.idList || idList),
    };
  }

  function listed(doc) {
    return {
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updatedAt,
      size: (doc.body || '').length,
      body: doc.body || '',
      subject: doc.subject,
      props: doc.props,
      icon: doc.icon,
    };
  }

  async function cardNames(t) {
    var names = Object.create(null);
    if (!t || typeof t.cards !== 'function') return names;
    try {
      var cards = await t.cards('id', 'name');
      (cards || []).forEach(function (c) {
        if (c && c.id && c.name) names[String(c.id)] = String(c.name);
      });
    } catch (e) {
      /* names stay empty: tasks without a name are not turned into documents */
    }
    return names;
  }

  /**
   * One document per project, titled with the project name. Each task of that project gets its own
   * document, nested under the project. Already-linked documents are renamed or re-nested; nothing
   * is deleted. `opts.keepTitles` skips renaming those document ids (an unsaved title in the editor).
   * @returns {Promise<{docs:object[], created:object[]}>}
   */
  async function ensureProjectDocs(t, docs, opts) {
    docs = Array.isArray(docs) ? docs.slice() : [];
    var DP = global.DocsProjects;
    var GG = global.MindmapGoalsTrello;
    if (!DP || !GG || typeof GG.load !== 'function') return { docs: docs, created: [] };
    var goals;
    try {
      goals = await GG.load(t);
    } catch (e) {
      return { docs: docs, created: [] };
    }
    var keep = Object.create(null);
    ((opts && opts.keepTitles) || []).forEach(function (id) { if (id) keep[id] = true; });
    var names = await cardNames(t);
    var created = [];
    if (global.ProjectIcon && typeof global.ProjectIcon.remember === 'function') global.ProjectIcon.remember(goals);
    var plan = DP.plan(goals, docs, names);
    var i;
    for (i = 0; i < plan.createProjects.length; i++) {
      var p = plan.createProjects[i];
      var icon = null;
      ((goals && goals.nodes) || []).forEach(function (n) { if (n && n.id === p.id && n.icon) icon = n.icon; });
      if (!icon && global.ProjectIcon && typeof global.ProjectIcon.suggest === 'function') {
        icon = await global.ProjectIcon.suggest(t, p.name, '');
        if (icon && global.WorkOS && typeof global.WorkOS.withNodeEdit === 'function') {
          goals = global.WorkOS.withNodeEdit(goals, p.id, { icon: icon });
          try { goals = (await GG.save(t, goals)) || goals; } catch (e) { /* the document still gets the glyph */ }
          if (global.ProjectIcon.remember) global.ProjectIcon.remember(goals);
        }
      }
      var doc = await createDoc(t, p.name, '', { subject: { k: 'project', id: p.id }, icon: icon || { i: 'briefcase' } });
      docs.unshift(listed(doc));
      created.push(doc);
    }
    plan = DP.plan(goals, docs, names);
    for (i = 0; i < plan.rename.length; i++) {
      var rn = plan.rename[i];
      if (keep[rn.docId]) continue;
      var renamed = await renameDoc(t, rn.docId, rn.name);
      docs.forEach(function (d) { if (d.id === rn.docId) d.title = renamed.title; });
    }
    plan = DP.plan(goals, docs, names);
    for (i = 0; i < plan.createTasks.length; i++) {
      var task = plan.createTasks[i];
      var td = await createDoc(t, task.name, '', { subject: { k: 'task', id: task.taskId }, icon: { i: 'checkbox' } });
      docs.unshift(listed(td));
      created.push(td);
    }
    plan = DP.plan(goals, docs, names);
    var edits = DP.parentEdits(getFolderIndex(), docs, plan);
    if (edits.set.length || edits.clear.length) {
      await updateFolderIndex(t, function (idx) {
        idx.parents = idx.parents || {};
        edits.clear.forEach(function (id) { delete idx.parents[id]; });
        edits.set.forEach(function (n) {
          if (!n.child || !n.parent || n.child === n.parent) return;
          if (DM().isDocInside(idx, n.child, n.parent)) return;
          idx.parents[n.child] = n.parent;
          delete idx.docs[n.child];
        });
      });
    }
    var newProjectIds = created.filter(function (d) { return d.subject && d.subject.k === 'project'; }).map(function (d) { return d.id; });
    var probe = DM().parseFolderIndex(DM().packFolderIndex(getFolderIndex()));
    var spare = [];
    if (DP.fileProjects(probe, docs, newProjectIds)) {
      await updateFolderIndex(t, function (idx) {
        DP.fileProjects(idx, docs, newProjectIds);
        spare = (idx.spareFolderDocs || []).slice();
        delete idx.spareFolderDocs;
      });
    }
    var gone = Object.create(null);
    for (var s = 0; s < spare.length; s++) {
      try {
        await deleteDoc(t, spare[s]);
        gone[spare[s]] = true;
      } catch (e) { /* the copy stays until the next pass */ }
    }
    if (spare.length) docs = docs.filter(function (d) { return d && !gone[d.id]; });
    return { docs: docs, created: created };
  }

  /** Attaches a board card to a project on the goal map. No-op when it is already there. */
  async function linkTaskToProject(t, taskId, projectId) {
    var GG = global.MindmapGoalsTrello;
    var WO = global.WorkOS;
    if (!GG || !WO || typeof GG.load !== 'function' || typeof WO.withTaskProject !== 'function') return;
    if (!taskId || !projectId) return;
    var goals = await GG.load(t);
    var cur = typeof WO.projectOf === 'function' ? WO.projectOf(goals, taskId) : null;
    if (cur && cur.id === projectId) return;
    await GG.save(t, WO.withTaskProject(goals, taskId, projectId));
  }

  /** The project node keeps the document's title. No-op when the names already match. */
  async function syncProjectTitle(t, projectId, name) {
    var GG = global.MindmapGoalsTrello;
    var WO = global.WorkOS;
    if (!GG || !WO || typeof GG.load !== 'function' || typeof WO.withNodeEdit !== 'function') return;
    var title = DM().cleanTitle(name);
    if (!projectId || !title) return;
    var goals = await GG.load(t);
    var node = (goals.nodes || []).filter(function (n) { return n && n.id === projectId; })[0];
    if (!node || node.name === title) return;
    await GG.save(t, WO.withNodeEdit(goals, projectId, { name: title }));
  }

  global.DocsTrello = {
    isAuthorized: isAuthorized,
    authorize: authorize,
    listDocs: listDocs,
    getFolderIndex: getFolderIndex,
    updateFolderIndex: updateFolderIndex,
    ensureFolderDocs: ensureFolderDocs,
    ensureProjectDocs: ensureProjectDocs,
    linkTaskToProject: linkTaskToProject,
    syncProjectTitle: syncProjectTitle,
    loadDoc: loadDoc,
    createDoc: createDoc,
    ensureDefaultDoc: ensureDefaultDoc,
    saveDoc: saveDoc,
    setCover: setCover,
    setIcon: setIcon,
    uploadCover: uploadCover,
    listNoteImages: listNoteImages,
    coverBlobUrl: coverBlobUrl,
    searchUnsplash: searchUnsplash,
    renameDoc: renameDoc,
    deleteDoc: deleteDoc,
    createTask: createTask,
    loadMentionSources: loadMentionSources,
    loadCardFace: loadCardFace,
    saveCardDesc: saveCardDesc,
    setCardMembers: setCardMembers,
    setCardLabels: setCardLabels,
    saveCardMeta: saveCardMeta,
    loadTaskFields: loadTaskFields,
    loadEntityFace: loadEntityFace,
    listEntityChoices: listEntityChoices,
    ensureSubjectDoc: ensureSubjectDoc,
    patchMeta: patchMeta,
  };
})(typeof window !== 'undefined' ? window : this);
