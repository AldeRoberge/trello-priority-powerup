/*
 * Role: pure helpers for the Document view (a Google-Docs-like editor with @ mentions).
 * No Trello / DOM access (editor nodes are duck-typed) so it is unit-tested in Node
 * (test/docs-model.test.js).
 *
 * Contents
 *   1. Constants + card naming / description packing
 *   1b. Covers (color, gradient, Unsplash, link, upload)
 *   1c. Page subject (task or entity) + document fields (tags, people)
 *   1d. Sidebar icon (glyph + color)
 *   2. Markdown -> editor HTML   (mdToHtml, inlineToHtml)
 *   3. Editor DOM -> Markdown    (domToMd)
 *   4. @ mentions: trigger detection, index, search
 *   5. Small utilities (word count, relative time, export)
 *
 * Storage format. A document is an archived Trello card named "📄 Title" (see docs-trello.js) whose
 * description holds a Markdown subset + a hidden meta block:
 *   # / ## / ###   **bold** *italic* ++underline++ ~~strike~~ ==highlight== `code`   [text](https://url)
 *   text color {c:red}…{/c}   colored highlight {h:green}…{/h}   (gray brown orange yellow green blue purple pink red)
 *   - bullets (nested by 2 spaces)   1. numbers   - [ ] / - [x] checklist   > quote   ``` fence   ---
 *   callout: > [!note] | [!tip] | [!warning]     GFM table     <!--align:center--> or <!--align:right--> on the next line
 *   mentions: [@Label](person:ID) [@Label](task:ID) [@Label](doc:ID) [@texte](entity:ID)
 *   a link whose words stay: [texte](doc:ID)
 *   a person shown by first name only: [@Prénom](person:ID:short)
 *   a picture on its own line: ![alt](https://…) or ![alt](upload:cardId/attId/file.jpg)
 *   <!--blank-->  an intentionally empty paragraph
 */

/**
 * docs-model: part 1 of 2 (1. Constants + naming / packing).
 * Names are shared with the other parts through window.DocsModelParts (see docs-model.parts.json for the load order).
 */

/**
 * docs-model-core: part 1 of 2 (1. Constants + naming / packing).
 * Names are shared with the other parts through window.DocsModelParts (see docs-model-core.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.DocsModelParts = global.DocsModelParts || {});

  // from other parts (functions, resolved at call time)
  function alignSuffix() { return S.alignSuffix.apply(this, arguments); }
  function attr() { return S.attr.apply(this, arguments); }
  function inlineToHtml() { return S.inlineToHtml.apply(this, arguments); }
  function fold() { return S.fold.apply(this, arguments); }

var S = (global.DocsModelParts = global.DocsModelParts || {});
  function fold() { return S.fold.apply(this, arguments); }

/* ── 1. Constants + naming / packing ─────────────────────────────── */

  var NAME_PREFIX = '📄 ';
  var MAX_DESC = 16384; // Trello card description limit
  var META_RESERVE = 980; // rev + cover line + subject + tags + people
  var MAX_BODY = MAX_DESC - META_RESERVE;
  var MAX_TITLE = 120;
  var UNTITLED = 'Sans titre';

  var MENTION_TYPES = {
    person: { icon: 'user', group: 'Personnes' },
    task: { icon: 'checkbox', group: 'Tâches' },
    doc: { icon: 'file-text', group: 'Documents' },
    entity: { icon: 'stack-2', group: 'Entités' },
  };

  function isDocName(name) {
    return typeof name === 'string' && name.indexOf('📄') === 0;
  }

  function titleFromName(name) {
    var t = String(name == null ? '' : name).replace(/^📄\s?/, '').trim();
    return t || UNTITLED;
  }

  function cleanTitle(title) {
    var t = String(title == null ? '' : title).replace(/\s+/g, ' ').trim();
    return t.slice(0, MAX_TITLE);
  }

  function nameFromTitle(title) {
    return NAME_PREFIX + (cleanTitle(title) || UNTITLED);
  }

  /** Description text of a document card: the body, then a hidden `type: document` + `rev: N` block (cover, icon, subject, tags, people). */
  function packDesc(body, meta) {
    var m = meta || {};
    var rev = Math.max(1, parseInt(m.rev, 10) || 1);
    var text = String(body == null ? '' : body).replace(/\s+$/, '');
    var lines = ['type: document', 'rev: ' + rev];
    var cover = packCover(m.cover);
    if (cover) lines.push('cover: ' + cover);
    var ic = iconLine(m.icon);
    if (ic) lines.push('icon: ' + ic);
    var sub = subjectLine(m.subject);
    if (sub) lines.push('subject: ' + sub);
    propLines(m.props).forEach(function (line) { lines.push(line); });
    var block = '<!--cerveau-meta\n' + lines.join('\n') + '\n-->';
    return text ? text + '\n\n' + block : block;
  }

  /**
   * The meta block is always the very last thing in the description, so only the last
   * `<!--cerveau-meta ... -->` that runs to the end counts: text typed in the body can never forge it.
   * @returns {{body:string, rev:number, isDoc:boolean, cover:object|null, icon:object|null, subject:object|null, props:object|null}}
   */
  function unpackDesc(desc) {
    var full = String(desc == null ? '' : desc).replace(/\r\n?/g, '\n');
    var meta = {};
    var body = full;
    var start = -1;
    var finder = /<!--\s*cerveau-meta\b/gi;
    var hit;
    while ((hit = finder.exec(full))) start = hit.index;
    if (start >= 0) {
      var tail = /^<!--\s*cerveau-meta\b([\s\S]*?)-->\s*$/i.exec(full.slice(start));
      if (tail) {
        tail[1].split('\n').forEach(function (line) {
          var m = /^\s*([a-z0-9_-]+)\s*:\s*(.*?)\s*$/i.exec(line);
          if (m) meta[m[1].toLowerCase()] = m[2];
        });
        body = full.slice(0, start);
      }
    }
    return {
      body: body.replace(/\s+$/, ''),
      rev: Math.max(1, parseInt(meta.rev, 10) || 1),
      isDoc: meta.type === 'document',
      cover: parseCover(meta.cover),
      icon: normalizeIcon(meta.icon),
      subject: normalizeSubject(meta.subject),
      props: normalizeProps({ tags: meta.tags, people: meta.people, keep: meta.keep }),
    };
  }

  /* ── 1c. Page subject + document fields ──────────────────────────── */
  /*
   * A page can belong to one task, one entity, one project or one person
   * (`subject: task:<id>` / `subject: entity:<id>` / `subject: project:g:…` / `subject: person:<id>`),
   * or be the generated day page (`subject: day:today`, see docs-daily.js).
   * The card or the entity keeps its own fields (members, labels, description). The document only
   * stores the link, plus its own short tags and people when those are not the task's.
   * A project id is the goal-map id (`g:` plus letters). Caps keep the hidden block small:
   * 6 tags of 20 characters, 8 people.
   */

  var MAX_TAGS = 6;
  var MAX_TAG = 20;
  var MAX_PAGE_PEOPLE = 8;

  /** Goal-map project ids look like `g:` plus base36. Anything else is not a project subject. */
  function projectIdOk(id) {
    var s = String(id == null ? '' : id).trim();
    return /^g:[A-Za-z0-9]{1,24}$/.test(s) ? s : '';
  }

  function normalizeSubject(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
      var text = String(raw).trim();
      var project = /^project:(g:[A-Za-z0-9]{1,24})$/.exec(text);
      if (project) return { k: 'project', id: project[1] };
      if (text === 'day:today') return { k: 'day', id: 'today' };
      var person = /^person:([A-Za-z0-9_-]{1,32})$/.exec(text);
      if (person) return { k: 'person', id: person[1] };
      var m = /^(task|entity):([A-Za-z0-9_-]{1,32})$/.exec(text);
      return m ? { k: m[1], id: m[2] } : null;
    }
    if (typeof raw !== 'object') return null;
    if (raw.k === 'project' || raw.kind === 'project') {
      var pid = projectIdOk(raw.id);
      return pid ? { k: 'project', id: pid } : null;
    }
    if (raw.k === 'day' || raw.kind === 'day') return String(raw.id) === 'today' ? { k: 'day', id: 'today' } : null;
    if (raw.k === 'person' || raw.kind === 'person') {
      var mid = cleanId(raw.id);
      if (mid.length > 32) mid = '';
      return mid ? { k: 'person', id: mid } : null;
    }
    var k = raw.k === 'task' || raw.k === 'entity' ? raw.k : raw.kind === 'task' || raw.kind === 'entity' ? raw.kind : '';
    var id = cleanId(raw.id);
    if (id.length > 32) id = '';
    return k && id ? { k: k, id: id } : null;
  }

  function subjectLine(subject) {
    var s = normalizeSubject(subject);
    return s ? s.k + ':' + s.id : '';
  }

  function cleanTag(s) {
    return String(s == null ? '' : s).replace(/[|\n\r<>:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG);
  }

  /** `{tags:string[], people:string[]}` or null when both are empty. */
  function normalizeProps(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var tags = [];
    var tagList = Array.isArray(src.tags) ? src.tags : String(src.tags || '').split('|');
    tagList.forEach(function (t) {
      var c = cleanTag(t);
      if (!c) return;
      var key = c.toLowerCase();
      if (tags.some(function (x) { return x.toLowerCase() === key; })) return;
      if (tags.length < MAX_TAGS) tags.push(c);
    });
    var people = [];
    var ppl = Array.isArray(src.people) ? src.people : String(src.people || '').split(',');
    ppl.forEach(function (id) {
      var c = cleanId(id);
      if (!c || c.length > 32 || people.indexOf(c) >= 0) return;
      if (people.length < MAX_PAGE_PEOPLE) people.push(c);
    });
    var keep = cleanKeep(src.keep);
    if (!tags.length && !people.length && !keep) return null;
    var out = { tags: tags, people: people };
    if (keep) out.keep = keep;
    return out;
  }

  /** Notes app flags (`pin`, `arch`, `color=yellow`), kept as one short line: `keep: pin,color=yellow`. */
  function cleanKeep(raw) {
    var seen = [];
    String(raw == null ? '' : raw).split(',').forEach(function (part) {
      var m = /^\s*(pin|arch|color=[a-z]{3,12})\s*$/i.exec(part);
      var v = m && m[1].toLowerCase();
      if (v && seen.indexOf(v) < 0) seen.push(v);
    });
    return seen.join(',');
  }

  function propLines(props) {
    var p = normalizeProps(props);
    if (!p) return [];
    var lines = [];
    if (p.tags.length) lines.push('tags: ' + p.tags.join('|'));
    if (p.people.length) lines.push('people: ' + p.people.join(','));
    if (p.keep) lines.push('keep: ' + p.keep);
    return lines;
  }

  /** The document in `docs` whose subject is this task or entity, or null. */
  function docForSubject(docs, kind, id) {
    var want = normalizeSubject({ k: kind, id: id });
    if (!want) return null;
    var list = docs || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i] && list[i].subject;
      if (s && s.k === want.k && s.id === want.id) return list[i];
    }
    return null;
  }

  /* ── 1d. Sidebar icon (glyph + color) ────────────────────────────── */
  /*
   * One short line of the meta block: `icon: book|#0c66e4`. The name is a Tabler glyph from DOC_ICONS;
   * the color is a cover swatch. Either half may be omitted (`icon: book`, `icon: |#0c66e4`).
   * Empty means the row keeps its default glyph and the muted color.
   */

  var DOC_ICONS = [
    { i: 'file-text', k: 'document page texte' },
    { i: 'folder', k: 'dossier' },
    { i: 'notebook', k: 'carnet notes' },
    { i: 'book', k: 'livre' },
    { i: 'bible', k: 'bible' },
    { i: 'bookmark', k: 'signet' },
    { i: 'notes', k: 'notes' },
    { i: 'clipboard', k: 'presse-papier' },
    { i: 'list', k: 'liste' },
    { i: 'list-check', k: 'taches checklist' },
    { i: 'checkbox', k: 'case tache' },
    { i: 'stack-2', k: 'pile entite' },
    { i: 'calendar', k: 'calendrier date' },
    { i: 'clock', k: 'heure' },
    { i: 'flag', k: 'drapeau' },
    { i: 'star', k: 'etoile favori' },
    { i: 'star-filled', k: 'etoile pleine' },
    { i: 'heart', k: 'coeur' },
    { i: 'heart-filled', k: 'coeur plein' },
    { i: 'bulb', k: 'idee ampoule' },
    { i: 'rocket', k: 'fusee' },
    { i: 'target', k: 'cible' },
    { i: 'map', k: 'carte' },
    { i: 'home', k: 'maison' },
    { i: 'user', k: 'personne' },
    { i: 'users', k: 'equipe personnes' },
    { i: 'briefcase', k: 'travail mallette' },
    { i: 'school', k: 'ecole' },
    { i: 'music', k: 'musique' },
    { i: 'photo', k: 'photo image' },
    { i: 'palette', k: 'couleur' },
    { i: 'brush', k: 'pinceau dessin' },
    { i: 'code', k: 'code' },
    { i: 'database', k: 'donnees' },
    { i: 'chart-bar', k: 'graphique' },
    { i: 'coin', k: 'argent' },
    { i: 'shopping-cart', k: 'courses achat' },
    { i: 'car', k: 'voiture' },
    { i: 'plane', k: 'avion voyage' },
    { i: 'world', k: 'monde' },
    { i: 'leaf', k: 'feuille nature' },
    { i: 'flame', k: 'flamme feu' },
    { i: 'bolt', k: 'eclair' },
    { i: 'crown', k: 'couronne' },
    { i: 'diamond', k: 'diamant' },
    { i: 'puzzle', k: 'puzzle' },
    { i: 'key', k: 'cle' },
    { i: 'lock', k: 'cadenas' },
    { i: 'mail', k: 'courriel' },
    { i: 'phone', k: 'telephone' },
    { i: 'bell', k: 'cloche' },
    { i: 'map-pin', k: 'lieu epingle' },
    { i: 'compass', k: 'boussole' },
    { i: 'sun', k: 'soleil' },
    { i: 'moon', k: 'lune' },
    { i: 'cloud', k: 'nuage' },
    { i: 'coffee', k: 'cafe' },
    { i: 'gift', k: 'cadeau' },
    { i: 'trophy', k: 'trophee' },
    { i: 'sparkles', k: 'etoiles' },
    { i: 'brain', k: 'cerveau' },
    { i: 'building', k: 'immeuble' },
    { i: 'building-church', k: 'eglise' },
    { i: 'cross', k: 'croix' },
    { i: 'heart-handshake', k: 'accord' },
    { i: 'tool', k: 'outil' },
    { i: 'stethoscope', k: 'sante' },
    { i: 'ball-football', k: 'sport' },
    { i: 'mountain', k: 'montagne' },
    { i: 'anchor', k: 'ancre' },
    { i: 'feather', k: 'plume' },
    { i: 'pencil', k: 'crayon' },
  ];

  var docIconByName = Object.create(null);
  DOC_ICONS.forEach(function (x) { docIconByName[x.i] = 1; });

  function docIconColorOk(c) {
    return COVER_COLORS.some(function (x) { return x.v === c; });
  }

  /** `{i?:name, c?:#rrggbb}` or null. Unknown names and colors are dropped. */
  function normalizeIcon(raw) {
    var name = '';
    var color = '';
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') {
      var s = String(raw).trim();
      if (/^#[0-9a-f]{6}$/i.test(s)) color = s;
      else {
        var cut = s.indexOf('|');
        name = cut < 0 ? s : s.slice(0, cut);
        color = cut < 0 ? '' : s.slice(cut + 1);
      }
    } else if (typeof raw === 'object') {
      name = raw.i != null ? raw.i : raw.icon;
      color = raw.c != null ? raw.c : raw.color;
    } else return null;
    name = String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (!docIconByName[name]) name = '';
    color = String(color == null ? '' : color).trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color) || !docIconColorOk(color)) color = '';
    if (!name && !color) return null;
    var out = {};
    if (name) out.i = name;
    if (color) out.c = color;
    return out;
  }

  /** Meta line value ('' when there is nothing to store). */
  function iconLine(icon) {
    var n = normalizeIcon(icon);
    if (!n) return '';
    return (n.i || '') + (n.c ? '|' + n.c : '');
  }

  function sameIcon(a, b) {
    return iconLine(a) === iconLine(b);
  }

  function searchDocIcons(query) {
    var q = fold(String(query || '').trim());
    if (!q) return DOC_ICONS.slice();
    return DOC_ICONS.filter(function (x) {
      return x.i.indexOf(q) >= 0 || fold(x.k).indexOf(q) >= 0;
    });
  }

  /* ── 1b. Covers (banner above the title) ─────────────────────────── */
  /*
   * A cover is one JSON line of the meta block. Kinds (short keys keep the description small):
   *   {k:'color', v:'#rrggbb'}            {k:'gradient', v:<COVER_GRADIENTS id>}
   *   {k:'unsplash', v:'photo-…', x?:ixid, by?:author, u?:username}
   *   {k:'image', v:'https://…'}          {k:'upload', c:cardId, a:attachmentId, n:fileName}
   * plus y: vertical position of an image (0 = top, 100 = bottom, default 50).
   * Every field is whitelisted, so the line can never contain "-->" or break out of the block.
   */

  var MAX_COVER_JSON = 400;

  var COVER_COLORS = [
    { id: 'gris', label: 'Gris', v: '#8590a2' },
    { id: 'ardoise', label: 'Ardoise', v: '#44546f' },
    { id: 'brun', label: 'Brun', v: '#8f6b4f' },
    { id: 'orange', label: 'Orange', v: '#e56910' },
    { id: 'jaune', label: 'Jaune', v: '#e2b203' },
    { id: 'vert', label: 'Vert', v: '#1f845a' },
    { id: 'sarcelle', label: 'Sarcelle', v: '#1d9aaa' },
    { id: 'bleu', label: 'Bleu', v: '#0c66e4' },
    { id: 'violet', label: 'Violet', v: '#6e5dc6' },
    { id: 'rose', label: 'Rose', v: '#cd519d' },
    { id: 'rouge', label: 'Rouge', v: '#c9372c' },
    { id: 'nuit', label: 'Nuit', v: '#1d2125' },
  ];

  var COVER_GRADIENTS = [
    { id: 'aurore', label: 'Aurore', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 'aube', label: 'Aube', css: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
    { id: 'ocean', label: 'Océan', css: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
    { id: 'foret', label: 'Forêt', css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
    { id: 'peche', label: 'Pêche', css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
    { id: 'minuit', label: 'Minuit', css: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
    { id: 'lavande', label: 'Lavande', css: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
    { id: 'braise', label: 'Braise', css: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
    { id: 'menthe', label: 'Menthe', css: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
    { id: 'ciel', label: 'Ciel', css: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)' },
    { id: 'framboise', label: 'Framboise', css: 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)' },
    { id: 'graphite', label: 'Graphite', css: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
  ];

  /** Curated Unsplash photos (no API key needed to show them). `tags` feed the local search. */
  var COVER_GALLERY = [
    { v: 'photo-1465056836041-7f43ac27dcb5', by: 'Tobias Keller', u: 'tokeller', tags: 'montagne paysage neige' },
    { v: 'photo-1500964757637-c85e8a162699', by: 'simon', u: 'simon_berger', tags: 'montagne paysage colline' },
    { v: 'photo-1518837695005-2083093ee35b', by: 'Matt Hardy', u: 'matthardy', tags: 'ocean mer vague eau' },
    { v: 'photo-1559827260-dc66d52bef19', by: 'Silas Baisch', u: 'silasbaisch', tags: 'ocean mer vague eau bleu' },
    { v: 'photo-1448375240586-882707db888b', by: 'Sebastian Unrau', u: 'sebastian_unrau', tags: 'foret arbre nature vert' },
    { v: 'photo-1425913397330-cf8af2ff40a1', by: 'Steven Kamenar', u: 'skamenar', tags: 'foret arbre nature' },
    { v: 'photo-1542401886-65d6c61db217', by: 'Wolfgang Hasselmann', u: 'wolfgang_hasselmann', tags: 'desert dune sable' },
    { v: 'photo-1488197047962-b48492212cda', by: 'Keith Hardy', u: 'keithhardy2001', tags: 'desert dune sable' },
    { v: 'photo-1483347756197-71ef80e95f73', by: 'Vincent Guth', u: 'vingtcent', tags: 'aurore boreale nuit ciel' },
    { v: 'photo-1531366936337-7c912a4589a7', by: 'Lightscape', u: 'lightscape', tags: 'aurore boreale nuit ciel' },
    { v: 'photo-1669295384050-a1d4357bd1d7', by: 'Pawel Czerwinski', u: 'pawel_czerwinski', tags: 'abstrait texture couleur' },
    { v: 'photo-1568733873715-f9d497a47ea0', by: 'Hulki Okan Tabak', u: 'hulkiokantabak', tags: 'abstrait texture' },
    { v: 'photo-1513061379709-ef0cd1695189', by: 'Yiran Ding', u: 'yiranding', tags: 'ville nuit lumiere urbain' },
    { v: 'photo-1444723121867-7a241cacace9', by: 'Henning Witzel', u: 'henning', tags: 'ville nuit urbain' },
    { v: 'photo-1557316655-8715fdecd2d1', by: 'Neil Thomas', u: 'neilthomas', tags: 'lac calme eau montagne' },
    { v: 'photo-1533757879476-8f4a3cb1ae4b', by: 'Emma Harper', u: 'emarieharp015', tags: 'lac calme eau' },
    { v: 'photo-1464802686167-b939a6910659', by: 'Jeremy Thomas', u: 'jeremythomasphoto', tags: 'espace galaxie etoile nuit' },
    { v: 'photo-1538370965046-79c0d6907d47', by: 'Graham Holtshausen', u: 'freedomstudios', tags: 'espace galaxie etoile' },
    { v: 'photo-1508796079212-a4b83cbf734d', by: 'César Couto', u: 'xcrap', tags: 'pastel minimal doux' },
    { v: 'photo-1554757388-29a2a86ef02f', by: 'Ashley West Edwards', u: 'ashleywedwards', tags: 'pastel minimal doux' },
  ];

  function coverText(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f<>"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  var UNSPLASH_ID = /^photo-[A-Za-z0-9-]{6,80}$/;
  var SAFE_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~\/%!$&*+,;=:@?#-]*)?$/;

  /** A valid cover object or null. Unknown kinds / bad values are dropped. */
  function normalizeCover(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var k = raw.k;
    var out = null;
    if (k === 'color') {
      var c = String(raw.v || '').toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(c)) out = { k: k, v: c };
    } else if (k === 'gradient') {
      if (COVER_GRADIENTS.some(function (g) { return g.id === raw.v; })) out = { k: k, v: raw.v };
    } else if (k === 'unsplash') {
      var id = String(raw.v || '');
      if (UNSPLASH_ID.test(id)) {
        out = { k: k, v: id };
        var x = String(raw.x || '');
        if (/^[A-Za-z0-9_-]{1,80}$/.test(x)) out.x = x;
        var by = coverText(raw.by, 60);
        if (by) out.by = by;
        var u = String(raw.u || '');
        if (/^[A-Za-z0-9_.-]{1,60}$/.test(u)) out.u = u;
      }
    } else if (k === 'image') {
      var url = String(raw.v || '').trim();
      if (url.length <= 300 && SAFE_URL.test(url)) out = { k: k, v: url };
    } else if (k === 'upload') {
      var cid = cleanId(raw.c);
      var aid = cleanId(raw.a);
      var n = coverText(raw.n, 80).replace(/[\/?#%&]/g, '_');
      if (cid && aid) out = { k: k, c: cid, a: aid, n: n || 'image' };
    }
    if (!out) return null;
    if (out.k !== 'color' && out.k !== 'gradient' && raw.y != null) {
      var y = Math.round(Number(raw.y));
      if (isFinite(y) && y !== 50) out.y = Math.max(0, Math.min(100, y));
    }
    if (out.k !== 'color' && out.k !== 'gradient' && raw.px != null) {
      var px = Math.round(Number(raw.px));
      if (isFinite(px) && px !== 50) out.px = Math.max(0, Math.min(100, px));
    }
    if (out.k !== 'color' && out.k !== 'gradient' && raw.z != null) {
      var z = Math.round(Number(raw.z));
      if (isFinite(z) && z > COVER_ZOOM_MIN) out.z = Math.min(COVER_ZOOM_MAX, z);
    }
    return out;
  }

  var COVER_ZOOM_MIN = 100;
  var COVER_ZOOM_MAX = 300;

  /**
   * Inline style of a cover photo: focus point (px, y in %) + zoom (z in %, never below 100).
   * The image keeps object-fit: cover and is scaled around the focus point, so it always fills the banner.
   */
  function coverImageStyle(cover) {
    var c = normalizeCover(cover) || {};
    var x = c.px == null ? 50 : c.px;
    var y = c.y == null ? 50 : c.y;
    var z = c.z || COVER_ZOOM_MIN;
    return {
      objectPosition: x + '% ' + y + '%',
      transformOrigin: x + '% ' + y + '%',
      transform: z > COVER_ZOOM_MIN ? 'scale(' + z / 100 + ')' : '',
    };
  }

  /** One-line JSON for the meta block ('' = no cover). */
  function packCover(cover) {
    var c = normalizeCover(cover);
    if (!c) return '';
    var s = JSON.stringify(c);
    return s.length <= MAX_COVER_JSON ? s : '';
  }

  function parseCover(line) {
    if (!line) return null;
    try {
      return normalizeCover(JSON.parse(line));
    } catch (e) {
      return null;
    }
  }

  function sameCover(a, b) {
    return packCover(a) === packCover(b);
  }

  /** CSS background of a color / gradient cover ('' for images). */
  function coverBackground(cover) {
    var c = normalizeCover(cover);
    if (!c) return '';
    if (c.k === 'color') return c.v;
    if (c.k === 'gradient') {
      var g = COVER_GRADIENTS.filter(function (x) { return x.id === c.v; })[0];
      return g ? g.css : '';
    }
    return '';
  }

  /** Image URL of an Unsplash id at a given width (hotlinked from images.unsplash.com, as Unsplash requires). */
  function unsplashUrl(id, width, ixid) {
    return 'https://images.unsplash.com/' + id + '?' + (ixid ? 'ixid=' + ixid + '&' : '') + 'auto=format&fit=crop&q=80&w=' + (width || 1600);
  }

  /** Displayable URL of an unsplash / image cover ('' for colors, gradients and uploads, which need auth). */
  function coverImageUrl(cover, width) {
    var c = normalizeCover(cover);
    if (!c) return '';
    if (c.k === 'unsplash') return unsplashUrl(c.v, width, c.x);
    if (c.k === 'image') return c.v;
    return '';
  }

  /** Profile link for the "Photo : Name / Unsplash" credit (with the referral params Unsplash asks for). */
  function unsplashCredit(cover) {
    var c = normalizeCover(cover);
    if (!c || c.k !== 'unsplash' || !c.by) return null;
    var utm = '?utm_source=cerveau&utm_medium=referral';
    return {
      name: c.by,
      profile: c.u ? 'https://unsplash.com/@' + c.u + utm : 'https://unsplash.com/' + utm,
      site: 'https://unsplash.com/' + utm,
    };
  }

  /**
   * A pasted link as a cover: images.unsplash.com links keep their photo id, any other https URL is
   * used as is. null when the text is not a usable https URL.
   */
  function coverFromLink(text) {
    var s = String(text == null ? '' : text).trim();
    var m = /^https:\/\/images\.unsplash\.com\/(photo-[A-Za-z0-9-]{6,80})(?:\?(.*))?$/.exec(s);
    if (m) {
      var ix = /(?:^|&)ixid=([A-Za-z0-9_-]{1,80})/.exec(m[2] || '');
      return normalizeCover({ k: 'unsplash', v: m[1], x: ix ? ix[1] : '' });
    }
    return normalizeCover({ k: 'image', v: s });
  }

  /** Curated gallery entries matching a query (accent-insensitive, on tags and author). */
  function searchGallery(query) {
    var q = fold(query).trim();
    var all = COVER_GALLERY.map(function (g) { return { k: 'unsplash', v: g.v, by: g.by, u: g.u }; });
    if (!q) return all;
    var words = q.split(/\s+/);
    return COVER_GALLERY.filter(function (g) {
      var hay = fold(g.tags + ' ' + g.by);
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).map(function (g) { return { k: 'unsplash', v: g.v, by: g.by, u: g.u }; });
  }

  /** The cover given by "Ajouter une couverture": a gallery photo picked by `rand` (0..1). */
  function randomCover(rand) {
    var r = typeof rand === 'number' ? rand : Math.random();
    var g = COVER_GALLERY[Math.min(COVER_GALLERY.length - 1, Math.floor(r * COVER_GALLERY.length))];
    return { k: 'unsplash', v: g.v, by: g.by, u: g.u };
  }

  function cleanId(id) {
    var s = String(id == null ? '' : id).trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : '';
  }

  /** `doc:cardId` when the words of a link stay put. Empty for a web address. */
  function docLinkId(href) {
    var m = /^doc:([A-Za-z0-9_-]{1,64})$/.exec(String(href == null ? '' : href).trim());
    return m ? m[1] : '';
  }

  /** Only http(s) / mailto links survive; "example.com/x" gets https://. */
  function safeHref(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u || /[\u0000-\u001f<>"]/.test(u)) return '';
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u.replace(/\s/g, '%20');
    if (/\s/.test(u)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
    if (/^[^\s\/@]+\.[a-z]{2,}(?:[\/?#:]|$)/i.test(u)) return 'https://' + u;
    return '';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 2. Markdown -> editor HTML ──────────────────────────────────── */

  var ESCAPABLE = '\\`*_{}[]()#+-.!~<>|=';

  function runLength(s, i, ch) {
    var k = i;
    while (s.charAt(k) === ch) k++;
    return k - i;
  }

  function findBacktickRun(s, from, run) {
    var k = from;
    while (k < s.length) {
      if (s.charAt(k) === '`') {
        var r = runLength(s, k, '`');
        if (r === run) return k;
        k += r;
      } else k++;
    }
    return -1;
  }

  /** Index just after a valid code span starting at i, or -1. */
  function skipCode(s, i) {
    var run = runLength(s, i, '`');
    var close = findBacktickRun(s, i + run, run);
    return close < 0 ? -1 : close + run;
  }

  /**
   * Index of the closing `marker` for an emphasis opened just before `from`, or -1.
   * For a run longer than the marker ("***a***") the closer is the last marker-length chars.
   */
  function findCloser(s, from, marker) {
    var m = marker.length;
    var mc = marker.charAt(0);
    var k = from;
    while (k < s.length) {
      var ch = s.charAt(k);
      if (ch === '\\') {
        k += 2;
        continue;
      }
      if (ch === '`') {
        var after = skipCode(s, k);
        k = after > 0 ? after : k + runLength(s, k, '`');
        continue;
      }
      if (ch === mc && s.substr(k, m) === marker) {
        if (m === 1 && s.charAt(k + 1) === mc) {
          // a nested double marker while looking for a single one: step over the whole pair
          var inner = findCloser(s, k + 2, mc + mc);
          k = inner > 0 ? inner + 2 : k + 2;
          continue;
        }
        if (k > from && !/\s/.test(s.charAt(k - 1))) {
          var runEnd = k + runLength(s, k, mc);
          return runEnd - k > m ? runEnd - m : k;
        }
      }
      k++;
    }
    return -1;
  }

  function isWordChar(ch) {
    return !!ch && /[A-Za-z0-9À-￿]/.test(ch);
  }

  /** First word of a full name ("Aldé Roberge" → "Aldé", "Jean-Pierre Tremblay" → "Jean-Pierre"). */
  function firstName(label) {
    var parts = String(label == null ? '' : label).trim().split(/\s+/).filter(Boolean);
    return parts[0] || '';
  }

  /**
   * @param {{short?:boolean}} [opts] person only: show and store the first name (`data-short`)
   *   while `data-label` keeps the full name passed in.
   */
  function mentionHtml(type, id, label, opts) {
    var spec = MENTION_TYPES[type];
    var cid = cleanId(id);
    if (!spec || !cid) return esc(label || '');
    var text = String(label == null ? '' : label).replace(/\s+/g, ' ').trim() || '?';
    if (type === 'entity') {
      return (
        '<span class="dc-ent" data-m="entity" data-id="' + cid +
        '" data-label="' + esc(text) + '" contenteditable="false">' + esc(text) + '</span>'
      );
    }
    var short = type === 'person' && !!(opts && opts.short);
    var shown = short ? (firstName(text) || text) : text;
    return (
      '<span class="dc-mention dc-mention--' + type + '" data-m="' + type + '" data-id="' + cid +
      '" data-label="' + esc(text) + '"' + (short ? ' data-short="1"' : '') + ' contenteditable="false">' +
      '<i class="ti ti-' + spec.icon + '" aria-hidden="true"></i>' + esc(shown) + '</span>'
    );
  }

  /** `[label](url)` starting at i: a mention chip, a link, or just the label text. */
  function parseLink(s, i) {
    var n = s.length;
    var j = i + 1;
    var depth = 1;
    while (j < n) {
      var ch = s.charAt(j);
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === '`') {
        var a = skipCode(s, j);
        if (a > 0) {
          j = a;
          continue;
        }
      }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    if (j >= n || s.charAt(j + 1) !== '(') return null;
    var k = j + 2;
    var pd = 1;
    while (k < n) {
      var c = s.charAt(k);
      if (c === '\\') {
        k += 2;
        continue;
      }
      if (c === '(') pd++;
      else if (c === ')') {
        pd--;
        if (!pd) break;
      }
      k++;
    }
    if (k >= n) return null;
    var label = s.slice(i + 1, j);
    var url = s.slice(j + 2, k).trim();
    var m = /^(person|task|doc|entity):([A-Za-z0-9_-]{1,64})(?::(short))?$/.exec(url);
    if (m && label.charAt(0) === '@') {
      return {
        html: mentionHtml(m[1], m[2], label.slice(1).replace(/\\(.)/g, '$1'), { short: m[3] === 'short' }),
        end: k + 1,
      };
    }
    if (m && m[1] === 'doc') {
      return {
        html: '<a class="dc-doclink" href="doc:' + m[2] + '" data-doc="' + m[2] + '">' + inlineToHtml(label) + '</a>',
        end: k + 1,
      };
    }
    var href = safeHref(url);
    if (!href) return { html: inlineToHtml(label), end: k + 1 };
    return {
      html: '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + inlineToHtml(label) + '</a>',
      end: k + 1,
    };
  }

  var RICH_INKS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

  function isInk(name) {
    return RICH_INKS.indexOf(name) >= 0;
  }

  /** `{c:red}…{/c}` text color or `{h:green}…{/h}` highlight. Null when it is not a closed, known color. */
  function parseColorSpan(s, i) {
    var m = /^\{(c|h):([a-z]+)\}/.exec(s.slice(i));
    if (!m || !isInk(m[2])) return null;
    var close = '{/' + m[1] + '}';
    var k = i + m[0].length;
    while (k < s.length) {
      if (s.charAt(k) === '\\') {
        k += 2;
        continue;
      }
      if (s.charAt(k) === '`') {
        var after = skipCode(s, k);
        k = after > 0 ? after : k + 1;
        continue;
      }
      if (s.substr(k, close.length) === close) {
        return { kind: m[1], color: m[2], inner: s.slice(i + m[0].length, k), end: k + close.length };
      }
      k++;
    }
    return null;
  }

  function parseCssColor(raw) {
    var s = String(raw || '').trim().toLowerCase();
    if (!s || /^(inherit|transparent|currentcolor|initial|unset|auto)$/.test(s)) return null;
    var hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
    var named = {
      black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
      silver: [192, 192, 192], red: [220, 50, 47], orange: [230, 126, 34], yellow: [240, 200, 40],
      green: [40, 160, 70], blue: [30, 100, 220], purple: [140, 60, 180], pink: [220, 80, 140], brown: [140, 90, 50],
    };
    return named[s] || null;
  }

  /** Nearest palette name for a pasted CSS color, or '' when it is just body text / paper. */
  function nearestInk(rgb, kind) {
    if (!rgb) return '';
    var r = rgb[0];
    var g = rgb[1];
    var b = rgb[2];
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var l = (max + min) / 2 / 255;
    var d = max - min;
    var sat = max === 0 ? 0 : d / max;
    if (kind === 'hi') {
      if (l > 0.94 && sat < 0.18) return '';
      if (sat < 0.14) return 'gray';
    } else if (l < 0.22 || (l > 0.92 && sat < 0.25)) return '';
    else if (sat < 0.22) return l > 0.28 && l < 0.82 ? 'gray' : '';
    var hue = 0;
    if (d) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    if (hue >= 12 && hue <= 48 && l < 0.55 && sat < 0.85) return 'brown';
    var stops = [
      { id: 'red', h: 0 }, { id: 'orange', h: 28 }, { id: 'yellow', h: 54 }, { id: 'green', h: 140 },
      { id: 'blue', h: 220 }, { id: 'purple', h: 275 }, { id: 'pink', h: 330 }, { id: 'red', h: 360 },
    ];
    var best = 'red';
    var bestD = 999;
    stops.forEach(function (stop) {
      var dist = Math.abs(hue - stop.h);
      if (dist < bestD) {
        bestD = dist;
        best = stop.id;
      }
    });
    return best;
  }

  function alignAttr(a) {
    return a === 'center' || a === 'right' ? ' data-align="' + a + '"' : '';
  }

  function isAlignLine(line) {
    return /^<!--align:(center|right)-->$/.test(String(line).trim());
  }

  function alignName(line) {
    var m = /^<!--align:(center|right)-->$/.exec(String(line).trim());
    return m ? m[1] : '';
  }

  function alignSuffix(node) {
    var a = attr(node, 'data-align');
    return a === 'center' || a === 'right' ? '\n<!--align:' + a + '-->' : '';
  }

  // exports
  S.COVER_COLORS = COVER_COLORS;
  S.COVER_GALLERY = COVER_GALLERY;
  S.COVER_GRADIENTS = COVER_GRADIENTS;
  S.COVER_ZOOM_MAX = COVER_ZOOM_MAX;
  S.COVER_ZOOM_MIN = COVER_ZOOM_MIN;
  S.DOC_ICONS = DOC_ICONS;
  S.ESCAPABLE = ESCAPABLE;
  S.MAX_BODY = MAX_BODY;
  S.MAX_COVER_JSON = MAX_COVER_JSON;
  S.MAX_DESC = MAX_DESC;
  S.MAX_PAGE_PEOPLE = MAX_PAGE_PEOPLE;
  S.MAX_TAG = MAX_TAG;
  S.MAX_TAGS = MAX_TAGS;
  S.MAX_TITLE = MAX_TITLE;
  S.MENTION_TYPES = MENTION_TYPES;
  S.META_RESERVE = META_RESERVE;
  S.NAME_PREFIX = NAME_PREFIX;
  S.RICH_INKS = RICH_INKS;
  S.SAFE_URL = SAFE_URL;
  S.UNSPLASH_ID = UNSPLASH_ID;
  S.UNTITLED = UNTITLED;
  S.alignAttr = alignAttr;
  S.alignName = alignName;
  S.cleanId = cleanId;
  S.cleanKeep = cleanKeep;
  S.cleanTag = cleanTag;
  S.cleanTitle = cleanTitle;
  S.coverBackground = coverBackground;
  S.coverFromLink = coverFromLink;
  S.coverImageStyle = coverImageStyle;
  S.coverImageUrl = coverImageUrl;
  S.coverText = coverText;
  S.docForSubject = docForSubject;
  S.docIconByName = docIconByName;
  S.docIconColorOk = docIconColorOk;
  S.docLinkId = docLinkId;
  S.esc = esc;
  S.findBacktickRun = findBacktickRun;
  S.findCloser = findCloser;
  S.firstName = firstName;
  S.iconLine = iconLine;
  S.isAlignLine = isAlignLine;
  S.isDocName = isDocName;
  S.isInk = isInk;
  S.isWordChar = isWordChar;
  S.mentionHtml = mentionHtml;
  S.nameFromTitle = nameFromTitle;
  S.nearestInk = nearestInk;
  S.normalizeCover = normalizeCover;
  S.normalizeIcon = normalizeIcon;
  S.normalizeProps = normalizeProps;
  S.normalizeSubject = normalizeSubject;
  S.packCover = packCover;
  S.packDesc = packDesc;
  S.parseColorSpan = parseColorSpan;
  S.parseCover = parseCover;
  S.parseCssColor = parseCssColor;
  S.parseLink = parseLink;
  S.projectIdOk = projectIdOk;
  S.propLines = propLines;
  S.randomCover = randomCover;
  S.runLength = runLength;
  S.safeHref = safeHref;
  S.sameCover = sameCover;
  S.sameIcon = sameIcon;
  S.searchDocIcons = searchDocIcons;
  S.searchGallery = searchGallery;
  S.skipCode = skipCode;
  S.subjectLine = subjectLine;
  S.titleFromName = titleFromName;
  S.unpackDesc = unpackDesc;
  S.unsplashCredit = unsplashCredit;
  S.unsplashUrl = unsplashUrl;
})(typeof window !== 'undefined' ? window : this);
