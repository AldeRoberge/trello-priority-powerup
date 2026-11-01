/*
 * Role: pure model of the Notes app (a Google Keep clone). A note is a Documents card (see DocsModel):
 * title, Markdown body, and three flags stored in the hidden `keep:` meta line (pin, arch, color=name).
 * Body lines `- [ ] x` / `- [x] x` are checklist items, every other line is plain text.
 * No DOM, no Trello. Exposes window.KeepModel (no bundler).
 */
(function (global) {
  'use strict';

  var COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'gray'];
  var RE_ITEM = /^\s{0,3}[-*+]\s+\[( |x|X)\](?:[ \t]+(.*))?$/;

  function fold(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** body -> [{ t:'item', text, checked } | { t:'text', text }] */
  function parseLines(body) {
    var raw = String(body == null ? '' : body).replace(/\r\n?/g, '\n');
    if (!raw) return [];
    return raw.split('\n').map(function (line) {
      var m = RE_ITEM.exec(line);
      if (m) return { t: 'item', text: m[2] || '', checked: m[1] !== ' ' };
      return { t: 'text', text: line };
    });
  }

  function serializeLines(lines) {
    return (lines || [])
      .map(function (l) {
        return l.t === 'item' ? '- [' + (l.checked ? 'x' : ' ') + '] ' + l.text : l.text;
      })
      .join('\n')
      .replace(/\s+$/, '');
  }

  function isList(body) {
    return parseLines(body).some(function (l) { return l.t === 'item'; });
  }

  /** Text note <-> checklist. Blank text lines are dropped when making a list. */
  function toList(body) {
    return serializeLines(
      parseLines(body)
        .filter(function (l) { return l.t === 'item' || l.text.trim(); })
        .map(function (l) { return l.t === 'item' ? l : { t: 'item', text: l.text.trim(), checked: false }; }),
    );
  }

  function toText(body) {
    return serializeLines(parseLines(body).map(function (l) { return { t: 'text', text: l.text }; }));
  }

  /** Done items sink below the open ones (the order inside each group is kept). */
  function sinkDone(body) {
    var lines = parseLines(body);
    var open = [];
    var done = [];
    var tail = [];
    var seenItem = false;
    lines.forEach(function (l) {
      if (l.t !== 'item') {
        (seenItem ? tail : open).push(l);
        return;
      }
      seenItem = true;
      (l.checked ? done : open).push(l);
    });
    return serializeLines(open.concat(done, tail));
  }

  function toggleItem(body, index) {
    var lines = parseLines(body);
    var n = -1;
    lines.forEach(function (l) {
      if (l.t !== 'item') return;
      n++;
      if (n === index) l.checked = !l.checked;
    });
    return serializeLines(lines);
  }

  /* ── flags (the `keep:` meta line) ───────────────────────────────── */

  function parseFlags(str) {
    var out = { pin: false, arch: false, color: '' };
    String(str || '').split(',').forEach(function (p) {
      p = p.trim().toLowerCase();
      if (p === 'pin') out.pin = true;
      else if (p === 'arch') out.arch = true;
      else if (p.indexOf('color=') === 0 && COLORS.indexOf(p.slice(6)) >= 0) out.color = p.slice(6);
    });
    return out;
  }

  function flagString(note) {
    var out = [];
    if (note.pin) out.push('pin');
    if (note.arch) out.push('arch');
    if (note.color && COLORS.indexOf(note.color) >= 0) out.push('color=' + note.color);
    return out.join(',');
  }

  /** A Documents entry (DocsTrello.listDocs / loadDoc) -> a note. `props` keeps tags and people untouched. */
  function fromDoc(doc) {
    var props = (doc && doc.props) || null;
    var f = parseFlags(props && props.keep);
    return {
      id: String(doc.id),
      title: doc.title === 'Sans titre' ? '' : String(doc.title || ''),
      body: String(doc.body || ''),
      pin: f.pin,
      arch: f.arch,
      color: f.color,
      rev: doc.rev || 1,
      updatedAt: doc.updatedAt || '',
      props: props,
    };
  }

  /** What is compared and sent: title, body, flags. */
  function snapshot(note) {
    return JSON.stringify([String(note.title || ''), String(note.body || '').replace(/\s+$/, ''), flagString(note)]);
  }

  function propsFor(note) {
    var base = note.props || {};
    return { tags: base.tags || [], people: base.people || [], keep: flagString(note) };
  }

  function blank(id) {
    return { id: id, title: '', body: '', pin: false, arch: false, color: '', rev: 1, updatedAt: '', props: null };
  }

  function isEmpty(note) {
    return !String(note.title || '').trim() && !String(note.body || '').trim();
  }

  /** Pinned first, then the most recently changed. */
  function sortNotes(notes) {
    return (notes || []).slice().sort(function (a, b) {
      if (a.pin !== b.pin) return a.pin ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
    });
  }

  function matches(note, query) {
    var q = fold(query);
    if (!q) return true;
    return fold(note.title + ' ' + toText(note.body)).indexOf(q) >= 0;
  }

  /**
   * One note changed here and maybe elsewhere. `base` is what both sides last agreed on.
   *  same  : nothing differs        push : only this device changed   pull : only the other side changed
   *  copy  : both changed differently (keep both, nothing is lost)
   */
  function resolve(base, local, remote) {
    var l = snapshot(local);
    var r = snapshot(remote);
    if (l === r) return 'same';
    var b = base ? snapshot(base) : null;
    if (b !== null && r === b) return 'push';
    if (b !== null && l === b) return 'pull';
    return 'copy';
  }

  global.KeepModel = {
    COLORS: COLORS,
    parseLines: parseLines,
    serializeLines: serializeLines,
    isList: isList,
    toList: toList,
    toText: toText,
    sinkDone: sinkDone,
    toggleItem: toggleItem,
    parseFlags: parseFlags,
    flagString: flagString,
    fromDoc: fromDoc,
    snapshot: snapshot,
    propsFor: propsFor,
    blank: blank,
    isEmpty: isEmpty,
    sortNotes: sortNotes,
    matches: matches,
    resolve: resolve,
  };
})(typeof window !== 'undefined' ? window : globalThis);
