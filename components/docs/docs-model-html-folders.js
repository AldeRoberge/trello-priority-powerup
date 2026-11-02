/**
 * docs-model: part 2 of 2 (taskFromSelection).
 * Names are shared with the other parts through window.DocsModelParts (see docs-model.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.DocsModelParts = global.DocsModelParts || {});

  // from earlier parts (values)
  var BLANK_MARK = S.BLANK_MARK;
  var CLOSED_LIST = S.CLOSED_LIST;
  var COVER_COLORS = S.COVER_COLORS;
  var COVER_GALLERY = S.COVER_GALLERY;
  var COVER_GRADIENTS = S.COVER_GRADIENTS;
  var COVER_ZOOM_MAX = S.COVER_ZOOM_MAX;
  var COVER_ZOOM_MIN = S.COVER_ZOOM_MIN;
  var DOC_ICONS = S.DOC_ICONS;
  var MAX_BODY = S.MAX_BODY;
  var MAX_DESC = S.MAX_DESC;
  var MAX_TITLE = S.MAX_TITLE;
  var MENTION_TYPES = S.MENTION_TYPES;
  var NAME_PREFIX = S.NAME_PREFIX;
  var RICH_INKS = S.RICH_INKS;
  var TASK_NAME_MAX = S.TASK_NAME_MAX;
  var UNTITLED = S.UNTITLED;

  // from other parts (functions, resolved at call time)
  function cleanId() { return S.cleanId.apply(this, arguments); }
  function cleanTitle() { return S.cleanTitle.apply(this, arguments); }
  function coverBackground() { return S.coverBackground.apply(this, arguments); }
  function coverFromLink() { return S.coverFromLink.apply(this, arguments); }
  function coverImageStyle() { return S.coverImageStyle.apply(this, arguments); }
  function coverImageUrl() { return S.coverImageUrl.apply(this, arguments); }
  function detectSlash() { return S.detectSlash.apply(this, arguments); }
  function detectTrigger() { return S.detectTrigger.apply(this, arguments); }
  function docForSubject() { return S.docForSubject.apply(this, arguments); }
  function docLinkId() { return S.docLinkId.apply(this, arguments); }
  function domToMd() { return S.domToMd.apply(this, arguments); }
  function firstName() { return S.firstName.apply(this, arguments); }
  function iconLine() { return S.iconLine.apply(this, arguments); }
  function imageMd() { return S.imageMd.apply(this, arguments); }
  function imageSrc() { return S.imageSrc.apply(this, arguments); }
  function inlineToHtml() { return S.inlineToHtml.apply(this, arguments); }
  function isDocName() { return S.isDocName.apply(this, arguments); }
  function kids() { return S.kids.apply(this, arguments); }
  function mdToHtml() { return S.mdToHtml.apply(this, arguments); }
  function mentionHtml() { return S.mentionHtml.apply(this, arguments); }
  function nameFromTitle() { return S.nameFromTitle.apply(this, arguments); }
  function normalizeCover() { return S.normalizeCover.apply(this, arguments); }
  function normalizeIcon() { return S.normalizeIcon.apply(this, arguments); }
  function normalizeProps() { return S.normalizeProps.apply(this, arguments); }
  function normalizeSubject() { return S.normalizeSubject.apply(this, arguments); }
  function packCover() { return S.packCover.apply(this, arguments); }
  function packDesc() { return S.packDesc.apply(this, arguments); }
  function parseCover() { return S.parseCover.apply(this, arguments); }
  function parseImageLine() { return S.parseImageLine.apply(this, arguments); }
  function randomCover() { return S.randomCover.apply(this, arguments); }
  function safeHref() { return S.safeHref.apply(this, arguments); }
  function sameCover() { return S.sameCover.apply(this, arguments); }
  function sameIcon() { return S.sameIcon.apply(this, arguments); }
  function searchDocIcons() { return S.searchDocIcons.apply(this, arguments); }
  function searchGallery() { return S.searchGallery.apply(this, arguments); }
  function titleFromName() { return S.titleFromName.apply(this, arguments); }
  function unpackDesc() { return S.unpackDesc.apply(this, arguments); }
  function unsplashCredit() { return S.unsplashCredit.apply(this, arguments); }
  function unsplashUrl() { return S.unsplashUrl.apply(this, arguments); }

  /**
   * Selected editor text -> a task draft. The first line is the name (capped); further lines,
   * and whatever did not fit in the name, become the description. Blank selections return null.
   */
  function taskFromSelection(text) {
    var raw = String(text == null ? '' : text).replace(/\u200b/g, '').replace(/\u00a0/g, ' ');
    var lines = raw.split(/\r?\n/).map(function (l) {
      return l.replace(/[ \t]+/g, ' ').trim();
    }).filter(Boolean);
    if (!lines.length) return null;
    var first = lines[0];
    var name = first.slice(0, TASK_NAME_MAX).trim();
    if (!name) return null;
    var extra = [];
    if (first.length > TASK_NAME_MAX) {
      var rest = first.slice(TASK_NAME_MAX).trim();
      if (rest) extra.push(rest);
    }
    lines.slice(1).forEach(function (l) { extra.push(l); });
    var desc = extra.join('\n');
    if (desc.length > 8000) desc = desc.slice(0, 8000);
    return { name: name, desc: desc };
  }

  /** Lists a new task may land in: open ones, or every list when all of them are closed. */
  function taskListsForCreate(lists) {
    var all = (lists || []).filter(function (l) { return l && l.id; });
    var open = all.filter(function (l) { return !CLOSED_LIST[l.category]; });
    return open.length ? open : all;
  }

  /** Prefer an "À faire" (unstarted) list, otherwise the first open list. */
  function defaultTaskListId(lists) {
    var pool = taskListsForCreate(lists);
    if (!pool.length) return '';
    var unstarted = pool.filter(function (l) { return l.category === 'unstarted'; })[0];
    return String((unstarted || pool[0]).id);
  }

  function fold(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    try {
      t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (e) {
      /* old engines: keep accents */
    }
    return t;
  }

  /**
   * Everything a mention can point to, plus a lookup for rendering existing chips.
   * @param {{members?:object[], contacts?:object[], cards?:object[], lists?:object[], docs?:object[], excludeDocId?:string}} src
   */
  function buildMentionIndex(src) {
    src = src || {};
    var person = [];
    var task = [];
    var doc = [];
    var entity = [];
    var by = Object.create(null);
    var seenMember = Object.create(null);
    function add(list, item) {
      var id = cleanId(item.id);
      if (!id) return;
      item.id = id;
      list.push(item);
      by[item.type + ':' + id] = item;
    }
    (Array.isArray(src.members) ? src.members : []).forEach(function (m) {
      if (!m || m.id == null) return;
      var label = String(m.fullName || m.username || '').trim() || String(m.id);
      seenMember[String(m.id)] = true;
      add(person, {
        type: 'person',
        id: m.id,
        label: label,
        sub: m.username ? '@' + m.username : '',
        kw: fold(m.username || ''),
        initials: String(m.initials || '').trim() || initialsOf(label),
        username: m.username || '',
      });
    });
    (Array.isArray(src.contacts) ? src.contacts : []).forEach(function (p) {
      if (!p || !p.id || !p.name) return;
      if (p.trelloMemberId && seenMember[String(p.trelloMemberId)]) {
        var linked = by['person:' + cleanId(p.trelloMemberId)];
        if (linked && !linked.sub) linked.sub = p.relation || '';
        if (linked) linked.kw += ' ' + fold((p.aliases || []).join(' '));
        return;
      }
      add(person, {
        type: 'person',
        id: p.id,
        label: String(p.name),
        sub: p.relation || (p.roles && p.roles[0]) || p.email || 'Contact',
        kw: fold((p.aliases || []).concat(p.roles || []).join(' ')),
        initials: initialsOf(p.name),
        contact: true,
        email: p.email || '',
        phone: p.phone || '',
      });
    });
    var listName = Object.create(null);
    (Array.isArray(src.lists) ? src.lists : []).forEach(function (l) {
      if (l && l.id) listName[String(l.id)] = l.name || '';
    });
    (Array.isArray(src.cards) ? src.cards : []).forEach(function (c) {
      if (!c || !c.id || isDocName(c.name)) return;
      add(task, {
        type: 'task',
        id: c.id,
        label: String(c.name || '').trim() || 'Sans titre',
        sub: listName[String(c.idList)] || '',
        kw: '',
        done: !!c.dueComplete,
        url: c.url || '',
      });
    });
    (Array.isArray(src.docs) ? src.docs : []).forEach(function (d) {
      if (!d || !d.id) return;
      var item = { type: 'doc', id: d.id, label: d.title || UNTITLED, sub: d.sub || '', kw: '' };
      if (d.id === src.excludeDocId) {
        // not offered in the picker (a document linking to itself is noise) but still resolvable
        var self = cleanId(d.id);
        if (self) by['doc:' + self] = item;
        return;
      }
      add(doc, item);
    });
    (Array.isArray(src.entities) ? src.entities : []).forEach(function (e) {
      if (!e || e.id == null || !e.name) return;
      var roles = (e.roles || []).concat((e.relations || []).map(function (r) { return r && r.role; }));
      add(entity, {
        type: 'entity',
        id: e.id,
        label: String(e.name).replace(/\s+/g, ' ').trim() || 'Entité',
        sub: e.sub || '',
        kw: fold((e.aliases || []).concat(roles).join(' ')),
      });
    });
    return { person: person, task: task, doc: doc, entity: entity, by: by };
  }

  function initialsOf(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function resolveMention(index, type, id) {
    return (index && index.by && index.by[type + ':' + id]) || null;
  }

  function rank(item, q) {
    var label = fold(item.label);
    if (label === q) return 0;
    if (label.indexOf(q) === 0) return 1;
    if (label.split(/[\s\-_/.,()]+/).some(function (w) { return w.indexOf(q) === 0; })) return 2;
    if (label.indexOf(q) >= 0) return 3;
    var extra = fold((item.sub || '') + ' ' + (item.kw || ''));
    if (extra.indexOf(q) >= 0) return 4;
    return -1;
  }

  /**
   * Name worth offering as a new person. Empty when the query is too short,
   * too long for a card assignee, or already someone's name.
   */
  function personDraft(labels, query) {
    var name = String(query == null ? '' : query).replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 60) return '';
    var q = fold(name);
    var exact = (labels || []).some(function (label) {
      return fold(label) === q;
    });
    return exact ? '' : name;
  }

  /**
   * Grouped, ranked results for the picker.
   * @returns {{type:string, label:string, items:object[], total:number}[]} (empty groups omitted)
   */
  function searchMentions(index, scope, query, opts) {
    opts = opts || {};
    var q = fold(String(query || '').trim());
    var types = scope === 'task' ? ['task'] : scope === 'doc' ? ['doc'] : scope === 'entity' ? ['entity'] : ['person', 'entity', 'task', 'doc'];
    var per = opts.perGroup || (types.length === 1 ? 8 : q ? 5 : 3);
    var groups = [];
    types.forEach(function (type) {
      var source = (index && index[type]) || [];
      var hits;
      if (!q) hits = source.slice();
      else {
        hits = source
          .map(function (item, pos) {
            return { item: item, r: rank(item, q), pos: pos };
          })
          .filter(function (h) {
            return h.r >= 0;
          })
          .sort(function (a, b) {
            return a.r - b.r || a.pos - b.pos;
          })
          .map(function (h) {
            return h.item;
          });
      }
      if (hits.length) {
        groups.push({ type: type, label: MENTION_TYPES[type].group, items: hits.slice(0, per), total: hits.length });
      }
    });
    return groups;
  }

  /* ── 5. Utilities ────────────────────────────────────────────────── */

  function countWords(text) {
    var m = String(text == null ? '' : text).match(/[^\s]+/g);
    return m ? m.length : 0;
  }

  function sizeInfo(md) {
    var len = packDesc(md, { rev: 1 }).length;
    return { length: len, max: MAX_DESC, ratio: len / MAX_DESC, over: len > MAX_DESC };
  }

  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /** "à l'instant", "il y a 5 min", "il y a 3 h", "hier", "il y a 4 j", else "3 oct." */
  function relativeTime(iso, nowMs) {
    var then = Date.parse(iso);
    if (!isFinite(then)) return '';
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    var sec = Math.max(0, Math.round((now - then) / 1000));
    if (sec < 45) return 'à l’instant';
    var min = Math.round(sec / 60);
    if (min < 60) return 'il y a ' + min + ' min';
    var hr = Math.round(min / 60);
    if (hr < 24) return 'il y a ' + hr + ' h';
    var day = Math.round(hr / 24);
    if (day === 1) return 'hier';
    if (day < 7) return 'il y a ' + day + ' j';
    var d = new Date(then);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date(now).getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /** Mentions become plain "@Label" so an exported file reads naturally. */
  function mentionsToPlain(md) {
    return String(md == null ? '' : md).replace(/\[@((?:\\.|[^\]\\])*)\]\((?:person|task|doc|entity):[A-Za-z0-9_-]+(?::short)?\)/g, function (_a, label) {
      return '@' + label.replace(/\\(.)/g, '$1');
    });
  }

  function exportMarkdown(title, md) {
    return '# ' + (cleanTitle(title) || UNTITLED) + '\n\n' + mentionsToPlain(md) + '\n';
  }

  function filterDocs(docs, query) {
    var q = fold(String(query || '').trim());
    if (!q) return (docs || []).slice();
    return (docs || []).filter(function (d) {
      return fold(d.title).indexOf(q) >= 0;
    });
  }

  /* ── Folders ─────────────────────────────────────────────────────────
   * The tree lives in one hidden archived card ("📁 Dossiers"), as JSON:
   *   { v:1, folders:[{id,name,parent|null,doc?}], docs:{ <docCardId>: <folderId> } }
   * `doc` is the document card the folder itself is (opened and edited like any other).
   * A doc absent from `docs` (or pointing to a missing folder) sits at the root.
   * A card id used as some folder's `doc` is that folder, not a separate row. */

  var FOLDER_INDEX_NAME = '📁 Dossiers';
  var MAX_FOLDER_NAME = MAX_TITLE;

  function isFolderIndexName(name) {
    return typeof name === 'string' && name.indexOf('📁') === 0;
  }

  function cleanFolderName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);
  }

  function emptyIndex() {
    return { v: 1, folders: [], docs: {}, parents: {}, archived: {} };
  }

  /** Tolerant parse: anything unreadable gives an empty index; dangling parents / cycles are healed. */
  function parseFolderIndex(desc) {
    var idx = emptyIndex();
    var raw;
    try {
      raw = JSON.parse(String(desc == null ? '' : desc));
    } catch (e) {
      return idx;
    }
    if (!raw || typeof raw !== 'object') return idx;
    var seen = {};
    (Array.isArray(raw.folders) ? raw.folders : []).forEach(function (f) {
      if (!f || typeof f.id !== 'string' || !f.id || seen[f.id]) return;
      var name = cleanFolderName(f.name);
      if (!name) return;
      seen[f.id] = true;
      var nf = { id: f.id, name: name, parent: typeof f.parent === 'string' && f.parent ? f.parent : null };
      if (typeof f.doc === 'string' && f.doc && f.doc !== f.id) nf.doc = f.doc;
      if (f.archived === true) nf.archived = true;
      idx.folders.push(nf);
    });
    idx.folders.forEach(function (f) {
      if (f.parent && (!seen[f.parent] || f.parent === f.id)) f.parent = null;
    });
    idx.folders.forEach(function (f) {
      // a parent chain that loops back on itself: cut it at this folder
      var hops = 0;
      var cur = f;
      while (cur && cur.parent && hops <= idx.folders.length) {
        cur = idx.folders.filter(function (x) { return x.id === cur.parent; })[0];
        hops++;
        if (cur === f) {
          f.parent = null;
          return;
        }
      }
    });
    var takenDoc = {};
    idx.folders.forEach(function (f) {
      if (!f.doc || takenDoc[f.doc]) {
        delete f.doc;
        return;
      }
      takenDoc[f.doc] = true;
    });
    var docs = raw.docs && typeof raw.docs === 'object' ? raw.docs : {};
    Object.keys(docs).forEach(function (k) {
      if (typeof docs[k] === 'string' && seen[docs[k]]) idx.docs[k] = docs[k];
    });
    var parents = raw.parents && typeof raw.parents === 'object' ? raw.parents : {};
    Object.keys(parents).forEach(function (k) {
      if (typeof parents[k] === 'string' && parents[k] && parents[k] !== k) idx.parents[k] = parents[k];
    });
    var arch = raw.archived && typeof raw.archived === 'object' ? raw.archived : {};
    Object.keys(arch).forEach(function (k) { if (arch[k] === true) idx.archived[k] = true; });
    return idx;
  }

  function packFolderIndex(idx) {
    return JSON.stringify({ v: 1, folders: idx.folders, docs: idx.docs, parents: idx.parents || {}, archived: idx.archived || {} });
  }

  function newFolderId() {
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function folderById(idx, id) {
    return idx.folders.filter(function (f) { return f.id === id; })[0] || null;
  }

  /** The folder whose own document is `docId`, or null. */
  function folderByDoc(idx, docId) {
    if (!docId) return null;
    return idx.folders.filter(function (f) { return f.doc === docId; })[0] || null;
  }

  /** True when `target` is `id` itself or one of its descendants (moving `id` there would loop). */
  function isInsideFolder(idx, id, target) {
    var cur = target;
    var hops = 0;
    while (cur && hops++ <= idx.folders.length) {
      if (cur === id) return true;
      var f = folderById(idx, cur);
      cur = f && f.parent;
    }
    return false;
  }

  function folderPath(idx, id) {
    var out = [];
    var cur = folderById(idx, id);
    var hops = 0;
    while (cur && hops++ <= idx.folders.length) {
      out.unshift(cur.name);
      cur = cur.parent ? folderById(idx, cur.parent) : null;
    }
    return out.join(' / ');
  }

  /** Removes a folder; its sub-folders and documents move up to its parent (nothing is deleted). */
  function removeFolderFrom(idx, id) {
    var f = folderById(idx, id);
    if (!f) return idx;
    var up = f.parent || null;
    var upDoc = up && (folderById(idx, up) || {}).doc;
    idx.folders = idx.folders.filter(function (x) { return x.id !== id; });
    idx.folders.forEach(function (x) { if (x.parent === id) x.parent = up; });
    Object.keys(idx.docs).forEach(function (k) {
      if (idx.docs[k] !== id) return;
      if (up) idx.docs[k] = up;
      else delete idx.docs[k];
    });
    if (f.doc) reparentAwayFrom(idx, f.doc, up, upDoc);
    return idx;
  }

  /** Documents nested under `docId` move under the parent folder (`upDoc` or `up`). */
  function reparentAwayFrom(idx, docId, up, upDoc) {
    Object.keys(idx.parents || {}).forEach(function (k) {
      if (idx.parents[k] !== docId) return;
      if (upDoc) idx.parents[k] = upDoc;
      else {
        delete idx.parents[k];
        if (up) idx.docs[k] = up;
      }
    });
  }

  var SORTS = ['date', 'date-asc', 'name', 'name-desc', 'size', 'size-asc'];

  function docComparator(sort) {
    function byName(a, b) {
      var x = fold(a.title);
      var y = fold(b.title);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    function byDate(a, b) {
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    }
    function bySize(a, b) {
      return (a.size || 0) - (b.size || 0);
    }
    switch (sort) {
      case 'date-asc': return byDate;
      case 'name': return byName;
      case 'name-desc': return function (a, b) { return byName(b, a); };
      case 'size': return function (a, b) { return bySize(b, a) || byName(a, b); };
      case 'size-asc': return function (a, b) { return bySize(a, b) || byName(a, b); };
      default: return function (a, b) { return byDate(b, a); };
    }
  }

  /**
   * Flat list of sidebar rows, depth-first, folders before documents (A→Z), documents keeping their order.
   * With a query only matching folders and documents show, inside their (force-opened) ancestor folders.
   * A folder's own document is the folder row, never a second row beside it.
   * @param {Set|Object} open map/set of expanded folder ids
   * @param {string} [sort] one of SORTS (default 'date'); folders follow the name order, A→Z unless 'name-desc'
   * @returns {{type:'folder'|'doc', depth:number, folder?:object, doc?:object, count?:number, open?:boolean}[]}
   */
  /** True when `target` is `docId` itself or sits somewhere below it (nesting `docId` there would loop). */
  function isDocInside(idx, docId, target) {
    var cur = target;
    var hops = 0;
    var parents = idx.parents || {};
    while (cur && hops++ < 1000) {
      if (cur === docId) return true;
      cur = parents[cur];
    }
    return false;
  }

  /** `docId` plus every document nested (at any depth) under it. */
  function docWithKids(idx, docId) {
    var out = [docId];
    Object.keys(idx.parents || {}).forEach(function (k) {
      if (k !== docId && isDocInside(idx, docId, k)) out.push(k);
    });
    return out;
  }

  /** Folder `id` plus all its sub-folders (ids). */
  function folderWithSubs(idx, id) {
    return idx.folders.filter(function (f) { return isInsideFolder(idx, id, f.id); }).map(function (f) { return f.id; });
  }

  /** Documents (ids) filed in the given folders, or nested under a folder's own document. */
  function docsInFolders(idx, folderIds) {
    var set = {};
    var docSet = {};
    folderIds.forEach(function (fid) {
      set[fid] = true;
      var f = folderById(idx, fid);
      if (f && f.doc) docSet[f.doc] = true;
    });
    var out = [];
    Object.keys(idx.docs).forEach(function (k) {
      if (set[idx.docs[k]]) docWithKids(idx, k).forEach(function (x) { out.push(x); });
    });
    Object.keys(idx.parents || {}).forEach(function (k) {
      if (docSet[idx.parents[k]]) docWithKids(idx, k).forEach(function (x) { out.push(x); });
    });
    return out;
  }

  /** Marks a document (and what is nested under it) archived: hidden from the list, nothing deleted. */
  function archiveDocIn(idx, docId) {
    idx.archived = idx.archived || {};
    docWithKids(idx, docId).forEach(function (k) { idx.archived[k] = true; });
    return idx;
  }

  function restoreDocIn(idx, docId) {
    idx.archived = idx.archived || {};
    docWithKids(idx, docId).forEach(function (k) { delete idx.archived[k]; });
    return idx;
  }

  /**
   * Archives a folder. With `withContent` its sub-folders, documents and nested documents are archived too;
   * otherwise they move up to its parent and stay visible.
   */
  function archiveFolderIn(idx, id, withContent) {
    var f = folderById(idx, id);
    if (!f) return idx;
    idx.archived = idx.archived || {};
    if (withContent) {
      var ids = folderWithSubs(idx, id);
      docsInFolders(idx, ids).forEach(function (k) { idx.archived[k] = true; });
      idx.folders.forEach(function (x) {
        if (ids.indexOf(x.id) < 0) return;
        x.archived = true;
        if (x.doc) idx.archived[x.doc] = true;
      });
      return idx;
    }
    var up = f.parent || null;
    var upDoc = up && (folderById(idx, up) || {}).doc;
    idx.folders.forEach(function (x) { if (x.parent === id) x.parent = up; });
    Object.keys(idx.docs).forEach(function (k) {
      if (idx.docs[k] !== id) return;
      if (up) idx.docs[k] = up;
      else delete idx.docs[k];
    });
    if (f.doc) reparentAwayFrom(idx, f.doc, up, upDoc);
    if (f.doc) idx.archived[f.doc] = true;
    f.archived = true;
    return idx;
  }

  /** Restores a folder with everything archived inside it. */
  function restoreFolderIn(idx, id) {
    var ids = folderWithSubs(idx, id);
    docsInFolders(idx, ids).forEach(function (k) { delete (idx.archived || {})[k]; });
    idx.folders.forEach(function (x) {
      if (ids.indexOf(x.id) < 0) return;
      delete x.archived;
      if (x.doc) delete (idx.archived || {})[x.doc];
    });
    return idx;
  }

  function folderRows(docs, idx, open, query, sort, showArchived) {
    var arch = idx.archived || {};
    if (!showArchived) docs = (docs || []).filter(function (d) { return !arch[d.id]; });
    var q = fold(String(query || '').trim());
    var isOpen = function (key, force) { return force || q ? true : !!(open && (open.has ? open.has(key) : open[key])); };
    var parents = idx.parents || {};
    var byId = {};
    (docs || []).forEach(function (d) { byId[d.id] = d; });
    var folderDoc = {};
    idx.folders.forEach(function (f) { if (f.doc) folderDoc[f.doc] = f.id; });
    // a document nests under its parent only when that parent exists, is not itself a folder, and the chain does not loop
    function parentOf(d) {
      var p = parents[d.id];
      return p && byId[p] && !folderDoc[p] && !isDocInside(idx, d.id, p) ? p : '';
    }
    function homeFolder(d) {
      var p = parents[d.id];
      if (p && folderDoc[p] && !isDocInside(idx, d.id, p)) return folderDoc[p];
      var fid = idx.docs[d.id];
      return fid && folderById(idx, fid) ? fid : '';
    }
    var kids = {};
    var byFolder = {};
    (docs || []).forEach(function (d) {
      if (folderDoc[d.id]) return;
      var p = parentOf(d);
      if (p) {
        (kids[p] = kids[p] || []).push(d);
        return;
      }
      var fid = homeFolder(d);
      (byFolder[fid] = byFolder[fid] || []).push(d);
    });
    function docCount(d) {
      return (kids[d.id] || []).reduce(function (n, k) { return n + docCount(k); }, 1);
    }
    function docMatches(d) {
      return fold(d.title).indexOf(q) >= 0 || (kids[d.id] || []).some(docMatches);
    }
    function countIn(fid) {
      var n = (byFolder[fid] || []).reduce(function (m, d) { return m + docCount(d); }, 0);
      idx.folders.forEach(function (f) { if (f.parent === fid && (showArchived || !f.archived)) n += countIn(f.id); });
      return n;
    }
    function titleOf(f) {
      var linked = f.doc && byId[f.doc];
      return linked ? linked.title : f.name;
    }
    function nameHit(f) {
      if (fold(f.name).indexOf(q) >= 0) return true;
      var linked = f.doc && byId[f.doc];
      return !!(linked && fold(linked.title).indexOf(q) >= 0);
    }
    function matchesIn(fid) {
      if ((byFolder[fid] || []).some(docMatches)) return true;
      return idx.folders.some(function (f) {
        return (f.parent || '') === fid && (showArchived || !f.archived) && (nameHit(f) || matchesIn(f.id));
      });
    }
    function directKids(fid) {
      var n = 0;
      (byFolder[fid] || []).forEach(function (d) { if (!q || docMatches(d)) n += 1; });
      idx.folders.forEach(function (x) {
        if ((x.parent || '') !== fid || (!showArchived && x.archived)) return;
        if (q && !nameHit(x) && !matchesIn(x.id)) return;
        n += 1;
      });
      return n;
    }
    var cmp = docComparator(sort);
    var dir = sort === 'name-desc' ? -1 : 1;
    var rows = [];
    function pushDoc(d, depth) {
      var ch = kids[d.id] || [];
      var o = ch.length > 0 && isOpen('doc:' + d.id);
      rows.push({ type: 'doc', depth: depth, doc: d, childCount: ch.length, open: o, archived: !!arch[d.id] });
      if (o) ch.slice().sort(cmp).forEach(function (k) { if (!q || docMatches(k)) pushDoc(k, depth + 1); });
    }
    function walk(fid, depth) {
      idx.folders
        .filter(function (f) { return (f.parent || '') === fid && (showArchived || !f.archived); })
        .sort(function (a, b) {
          var x = fold(titleOf(a));
          var y = fold(titleOf(b));
          return dir * (x < y ? -1 : x > y ? 1 : 0);
        })
        .forEach(function (f) {
          if (q && !nameHit(f) && !matchesIn(f.id)) return;
          var kidsN = directKids(f.id);
          var o = kidsN > 0 && isOpen(f.id);
          var linked = f.doc && byId[f.doc] ? byId[f.doc] : null;
          rows.push({ type: 'folder', depth: depth, folder: f, doc: linked, count: countIn(f.id), childCount: kidsN, open: o, archived: !!f.archived });
          if (o) walk(f.id, depth + 1);
        });
      (byFolder[fid] || []).slice().sort(cmp).forEach(function (d) {
        if (q && !docMatches(d)) return;
        pushDoc(d, depth);
      });
    }
    walk('', 0);
    return rows;
  }

  /** Created when the Documents view opens on a board that has no document yet. */
  var DEFAULT_TITLE = 'Bienvenue';
  var DEFAULT_BODY = [
    '# Bienvenue dans vos documents',
    '',
    'Ce document a été créé automatiquement. Modifiez-le, renommez-le ou supprimez-le (menu **…**).',
    '',
    '## Quelques idées',
    '',
    '- `@` pour mentionner une personne',
    '- `@@` pour lier une tâche du tableau',
    '- `@@@` pour lier un autre document',
    '- `/` pour insérer un titre, une liste, une citation…',
    '',
    '- [ ] Écrire mon premier compte rendu',
  ].join('\n');

  global.DocsModel = {
    FOLDER_INDEX_NAME: FOLDER_INDEX_NAME,
    MAX_FOLDER_NAME: MAX_FOLDER_NAME,
    isFolderIndexName: isFolderIndexName,
    cleanFolderName: cleanFolderName,
    emptyIndex: emptyIndex,
    parseFolderIndex: parseFolderIndex,
    packFolderIndex: packFolderIndex,
    newFolderId: newFolderId,
    folderById: folderById,
    folderByDoc: folderByDoc,
    isInsideFolder: isInsideFolder,
    folderPath: folderPath,
    removeFolderFrom: removeFolderFrom,
    folderRows: folderRows,
    archiveDocIn: archiveDocIn,
    restoreDocIn: restoreDocIn,
    archiveFolderIn: archiveFolderIn,
    restoreFolderIn: restoreFolderIn,
    isDocInside: isDocInside,
    SORTS: SORTS,
    DEFAULT_TITLE: DEFAULT_TITLE,
    DEFAULT_BODY: DEFAULT_BODY,
    NAME_PREFIX: NAME_PREFIX,
    MAX_DESC: MAX_DESC,
    MAX_BODY: MAX_BODY,
    MAX_TITLE: MAX_TITLE,
    UNTITLED: UNTITLED,
    MENTION_TYPES: MENTION_TYPES,
    BLANK_MARK: BLANK_MARK,
    isDocName: isDocName,
    titleFromName: titleFromName,
    nameFromTitle: nameFromTitle,
    cleanTitle: cleanTitle,
    packDesc: packDesc,
    unpackDesc: unpackDesc,
    normalizeSubject: normalizeSubject,
    normalizeProps: normalizeProps,
    docForSubject: docForSubject,
    DOC_ICONS: DOC_ICONS,
    normalizeIcon: normalizeIcon,
    iconLine: iconLine,
    sameIcon: sameIcon,
    searchDocIcons: searchDocIcons,
    COVER_COLORS: COVER_COLORS,
    COVER_GRADIENTS: COVER_GRADIENTS,
    COVER_GALLERY: COVER_GALLERY,
    normalizeCover: normalizeCover,
    packCover: packCover,
    parseCover: parseCover,
    sameCover: sameCover,
    coverBackground: coverBackground,
    coverImageStyle: coverImageStyle,
    COVER_ZOOM_MIN: COVER_ZOOM_MIN,
    COVER_ZOOM_MAX: COVER_ZOOM_MAX,
    coverImageUrl: coverImageUrl,
    unsplashUrl: unsplashUrl,
    unsplashCredit: unsplashCredit,
    coverFromLink: coverFromLink,
    searchGallery: searchGallery,
    randomCover: randomCover,
    cleanId: cleanId,
    docLinkId: docLinkId,
    safeHref: safeHref,
    RICH_INKS: RICH_INKS,
    imageSrc: imageSrc,
    parseImageLine: parseImageLine,
    imageMd: imageMd,
    mdToHtml: mdToHtml,
    inlineToHtml: inlineToHtml,
    mentionHtml: mentionHtml,
    firstName: firstName,
    domToMd: domToMd,
    detectTrigger: detectTrigger,
    detectSlash: detectSlash,
    TASK_NAME_MAX: TASK_NAME_MAX,
    taskFromSelection: taskFromSelection,
    taskListsForCreate: taskListsForCreate,
    defaultTaskListId: defaultTaskListId,
    buildMentionIndex: buildMentionIndex,
    resolveMention: resolveMention,
    searchMentions: searchMentions,
    personDraft: personDraft,
    initialsOf: initialsOf,
    countWords: countWords,
    sizeInfo: sizeInfo,
    relativeTime: relativeTime,
    mentionsToPlain: mentionsToPlain,
    exportMarkdown: exportMarkdown,
    filterDocs: filterDocs,
    fold: fold,
  };

  // exports
  S.DEFAULT_BODY = DEFAULT_BODY;
  S.DEFAULT_TITLE = DEFAULT_TITLE;
  S.FOLDER_INDEX_NAME = FOLDER_INDEX_NAME;
  S.MAX_FOLDER_NAME = MAX_FOLDER_NAME;
  S.MONTHS = MONTHS;
  S.SORTS = SORTS;
  S.archiveDocIn = archiveDocIn;
  S.archiveFolderIn = archiveFolderIn;
  S.buildMentionIndex = buildMentionIndex;
  S.cleanFolderName = cleanFolderName;
  S.countWords = countWords;
  S.defaultTaskListId = defaultTaskListId;
  S.docComparator = docComparator;
  S.docWithKids = docWithKids;
  S.docsInFolders = docsInFolders;
  S.emptyIndex = emptyIndex;
  S.exportMarkdown = exportMarkdown;
  S.filterDocs = filterDocs;
  S.fold = fold;
  S.folderByDoc = folderByDoc;
  S.folderById = folderById;
  S.folderPath = folderPath;
  S.folderRows = folderRows;
  S.folderWithSubs = folderWithSubs;
  S.initialsOf = initialsOf;
  S.isDocInside = isDocInside;
  S.isFolderIndexName = isFolderIndexName;
  S.isInsideFolder = isInsideFolder;
  S.mentionsToPlain = mentionsToPlain;
  S.newFolderId = newFolderId;
  S.packFolderIndex = packFolderIndex;
  S.parseFolderIndex = parseFolderIndex;
  S.personDraft = personDraft;
  S.rank = rank;
  S.relativeTime = relativeTime;
  S.removeFolderFrom = removeFolderFrom;
  S.reparentAwayFrom = reparentAwayFrom;
  S.resolveMention = resolveMention;
  S.restoreDocIn = restoreDocIn;
  S.restoreFolderIn = restoreFolderIn;
  S.searchMentions = searchMentions;
  S.sizeInfo = sizeInfo;
  S.taskFromSelection = taskFromSelection;
  S.taskListsForCreate = taskListsForCreate;
})(typeof window !== 'undefined' ? window : this);
