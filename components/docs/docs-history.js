/*
 * Role: who wrote a document and its version history (Documents view).
 * No extra storage: Trello already keeps one card action per save, with its author, its date and the
 * description before and after (data.old.desc / data.card.desc). Autosaves come every second or so,
 * so consecutive saves by the same person are merged into one version (MERGE_GAP_MS).
 *
 * Contents
 *   1. Pure helpers: actions -> events -> versions, line diff, word stats, day labels
 *   2. Trello reads (card actions through SheetsTrello.trelloRest)
 *   3. Versions panel (DOM): list by day, preview, changes, restore
 * Tests: test/docs-history.test.js
 */
(function (global) {
  'use strict';

  function DM() {
    return global.DocsModel;
  }
  function ST() {
    return global.SheetsTrello;
  }

  var MERGE_GAP_MS = 15 * 60 * 1000;
  var PAGE = 300;
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /* ── 1. Pure helpers ─────────────────────────────────────────────── */

  function memberOf(a) {
    var m = (a && a.memberCreator) || {};
    var name = m.fullName || m.username || 'Quelqu’un';
    return {
      id: m.id || (a && a.idMemberCreator) || '',
      name: name,
      initials: m.initials || DM().initialsOf(name),
      avatar: /^https:\/\//.test(m.avatarUrl || '') ? m.avatarUrl + '/50.png' : '',
    };
  }

  function byDate(x, y) {
    return x.date < y.date ? -1 : x.date > y.date ? 1 : 0;
  }

  /**
   * Trello actions (any order) -> document events, oldest first:
   * {id, date, member, kind:'create'|'body'|'title', before?, after?, title?}.
   * A save that only changed the hidden meta block (cover, revision) is not an event.
   */
  function toEvents(actions) {
    var out = [];
    var seen = {};
    (actions || []).forEach(function (a) {
      if (!a || !a.id || seen[a.id] || !a.data) return;
      seen[a.id] = true;
      var d = a.data;
      var ev = { id: a.id, date: String(a.date || ''), member: memberOf(a) };
      if (a.type === 'createCard' || a.type === 'copyCard') {
        ev.kind = 'create';
        ev.title = d.card && d.card.name ? DM().titleFromName(d.card.name) : '';
      } else if (a.type === 'updateCard' && d.old && Object.prototype.hasOwnProperty.call(d.old, 'desc')) {
        if (!d.card || typeof d.card.desc !== 'string') return;
        var before = DM().unpackDesc(d.old.desc).body;
        var after = DM().unpackDesc(d.card.desc).body;
        if (before === after) return;
        ev.kind = 'body';
        ev.before = before;
        ev.after = after;
      } else if (a.type === 'updateCard' && d.old && Object.prototype.hasOwnProperty.call(d.old, 'name')) {
        var from = DM().titleFromName(d.old.name);
        var to = DM().titleFromName(d.card && d.card.name);
        if (from === to) return;
        ev.kind = 'title';
        ev.before = from;
        ev.after = to;
      } else return;
      out.push(ev);
    });
    return out.sort(byDate);
  }

  /**
   * Events -> versions, newest first. A version = consecutive events by one person with less than
   * MERGE_GAP_MS between them: {id, start, end, member, created, titleFrom?, titleTo?, body, prevBody, count}.
   * `body` is the text right after the version; null when the loaded actions do not reach it.
   */
  function groupVersions(events) {
    var groups = [];
    events.forEach(function (ev) {
      var g = groups[groups.length - 1];
      var near = g && g.member.id === ev.member.id && Date.parse(ev.date) - Date.parse(g.end) <= MERGE_GAP_MS;
      if (!g || !near || ev.kind === 'create') {
        g = { id: ev.id, start: ev.date, end: ev.date, member: ev.member, created: false, count: 0 };
        groups.push(g);
      }
      g.id = ev.id;
      g.end = ev.date;
      g.count++;
      if (ev.kind === 'create') {
        g.created = true;
        g.createdTitle = ev.title;
      } else if (ev.kind === 'body') {
        if (g.bodyBefore === undefined) g.bodyBefore = ev.before;
        g.bodyAfter = ev.after;
      } else if (ev.kind === 'title') {
        if (g.titleFrom === undefined) g.titleFrom = ev.before;
        g.titleTo = ev.after;
      }
    });
    // text before the oldest loaded change = start of the window; a document starts empty
    var first = events.filter(function (e) { return e.kind === 'body'; })[0];
    var hasCreate = events.some(function (e) { return e.kind === 'create'; });
    var cur = first ? first.before : hasCreate ? '' : null;
    groups.forEach(function (g) {
      g.prevBody = g.created ? '' : cur;
      if (g.bodyAfter !== undefined) cur = g.bodyAfter;
      g.body = cur;
      if (g.titleFrom !== undefined && g.titleFrom === g.titleTo) {
        delete g.titleFrom;
        delete g.titleTo;
      }
      delete g.bodyBefore;
      delete g.bodyAfter;
    });
    return groups.reverse();
  }

  function splitLines(s) {
    return String(s == null ? '' : s).split('\n');
  }

  /** Line diff: [{op:'='|'+'|'-', text}]. Common head/tail first, then LCS on the middle (bounded). */
  function diffLines(a, b) {
    var x = splitLines(a);
    var y = splitLines(b);
    var head = 0;
    while (head < x.length && head < y.length && x[head] === y[head]) head++;
    var tail = 0;
    while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;
    var xm = x.slice(head, x.length - tail);
    var ym = y.slice(head, y.length - tail);
    var out = x.slice(0, head).map(function (t) { return { op: '=', text: t }; });
    var mid = [];
    if (xm.length * ym.length > 2500000) {
      xm.forEach(function (t) { mid.push({ op: '-', text: t }); });
      ym.forEach(function (t) { mid.push({ op: '+', text: t }); });
    } else {
      var n = xm.length;
      var m = ym.length;
      var L = [];
      for (var i = 0; i <= n; i++) L.push(new Uint32Array(m + 1));
      for (i = n - 1; i >= 0; i--) {
        for (var j = m - 1; j >= 0; j--) L[i][j] = xm[i] === ym[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
      i = 0;
      j = 0;
      while (i < n && j < m) {
        if (xm[i] === ym[j]) { mid.push({ op: '=', text: xm[i] }); i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) mid.push({ op: '-', text: xm[i++] });
        else mid.push({ op: '+', text: ym[j++] });
      }
      while (i < n) mid.push({ op: '-', text: xm[i++] });
      while (j < m) mid.push({ op: '+', text: ym[j++] });
    }
    return out.concat(mid, x.slice(x.length - tail).map(function (t) { return { op: '=', text: t }; }));
  }

  /** Words added / removed between two texts (mentions count as their visible label). */
  function diffStats(a, b) {
    var added = 0;
    var removed = 0;
    if (a == null || b == null) return { added: 0, removed: 0, known: false };
    diffLines(a, b).forEach(function (d) {
      if (d.op === '=') return;
      var w = DM().countWords(DM().mentionsToPlain(d.text).replace(/[#>*_`~\-[\]()]+/g, ' '));
      if (d.op === '+') added += w;
      else removed += w;
    });
    return { added: added, removed: removed, known: true };
  }

  /** Only the changed lines with `context` unchanged lines around them; gaps become {op:'gap', count}. */
  function compactDiff(diff, context) {
    var c = context == null ? 2 : context;
    var keep = diff.map(function () { return false; });
    diff.forEach(function (d, i) {
      if (d.op === '=') return;
      for (var k = Math.max(0, i - c); k <= Math.min(diff.length - 1, i + c); k++) keep[k] = true;
    });
    var out = [];
    var skipped = 0;
    diff.forEach(function (d, i) {
      if (keep[i]) {
        if (skipped) out.push({ op: 'gap', count: skipped });
        skipped = 0;
        out.push(d);
      } else skipped++;
    });
    if (skipped && out.length) out.push({ op: 'gap', count: skipped });
    return out;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** "Aujourd’hui", "Hier", "13 oct." (year added when not this year) */
  function dayLabel(iso, nowMs) {
    var d = new Date(Date.parse(iso));
    var now = new Date(typeof nowMs === 'number' ? nowMs : Date.now());
    if (sameDay(d, now)) return 'Aujourd’hui';
    var y = new Date(now.getTime());
    y.setDate(y.getDate() - 1);
    if (sameDay(d, y)) return 'Hier';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
  }

  function clock(iso) {
    var d = new Date(Date.parse(iso));
    return d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0');
  }

  /** One short line about a version: "Création", "Renommé « A » en « B »", "+12 mots, −3". */
  function versionSummary(v) {
    var parts = [];
    if (v.created) parts.push('Création');
    if (v.titleFrom !== undefined) parts.push('Renommé « ' + v.titleFrom + ' » en « ' + v.titleTo + ' »');
    return parts.join(' · ');
  }

  /** Author (creation) and last editor (newest change) out of the summary actions. */
  function whoFromActions(actions) {
    var events = toEvents(actions);
    var created = events.filter(function (e) { return e.kind === 'create'; })[0] || null;
    var edits = events.filter(function (e) { return e.kind !== 'create'; });
    var last = edits[edits.length - 1] || null;
    return {
      author: created ? { member: created.member, date: created.date } : null,
      editor: last ? { member: last.member, date: last.date } : created ? { member: created.member, date: created.date } : null,
    };
  }

  /* ── 2. Trello reads ─────────────────────────────────────────────── */

  var FIELDS = '&fields=type,date,data,idMemberCreator&memberCreator_fields=fullName,username,initials,avatarUrl';

  function need(res) {
    if (!res || res.ok === false) {
      var err = new Error((res && res.reason) || 'trello-failed');
      err.reason = err.message;
      throw err;
    }
    return res.data || [];
  }

  function actionsUrl(docId, filter, limit, before) {
    return '/cards/' + encodeURIComponent(docId) + '/actions?filter=' + filter + '&limit=' + limit + FIELDS + (before ? '&before=' + encodeURIComponent(before) : '');
  }

  /** {author, editor} for the meta line: creation action + the latest few edits. */
  async function loadWho(t, docId) {
    var res = await Promise.all([
      ST().trelloRest(t, actionsUrl(docId, 'createCard,copyCard', 1)),
      ST().trelloRest(t, actionsUrl(docId, 'updateCard:desc,updateCard:name', 20)),
    ]);
    return whoFromActions(need(res[0]).concat(need(res[1])));
  }

  /**
   * One page of history actions (newest first). Pass the previous page's `before` to go further back.
   * @returns {Promise<{actions:object[], before:string, more:boolean}>}
   */
  async function loadPage(t, docId, before) {
    var reqs = [ST().trelloRest(t, actionsUrl(docId, 'updateCard:desc,updateCard:name', PAGE, before))];
    if (!before) reqs.push(ST().trelloRest(t, actionsUrl(docId, 'createCard,copyCard', 1)));
    var res = await Promise.all(reqs);
    var page = need(res[0]);
    var all = page.concat(res[1] ? need(res[1]) : []);
    return { actions: all, before: page.length ? page[page.length - 1].id : '', more: page.length >= PAGE };
  }

  var meCache = null;
  /** The signed-in member ({id, name}) or null. */
  function loadMe(t) {
    if (meCache) return meCache;
    meCache = Promise.resolve()
      .then(function () { return t && typeof t.member === 'function' ? t.member('id', 'fullName', 'username') : null; })
      .then(function (m) { return m && m.id ? { id: m.id, name: m.fullName || m.username || '' } : null; })
      .catch(function () { return null; });
    return meCache;
  }

  /* ── 3. Versions panel ───────────────────────────────────────────── */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name) {
    return h('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  }

  function avatar(member) {
    var a = h('span', { class: 'dh-avatar', title: member.name, 'aria-hidden': 'true' }, [member.avatar ? null : member.initials]);
    if (member.avatar) a.appendChild(h('img', { src: member.avatar, alt: '' }));
    return a;
  }

  /**
   * Opens the versions panel over `opts.root`.
   * opts: {root, t, docId, title, currentBody, me, onRestore(body) -> Promise}
   * @returns {{close: function}}
   */
  function openPanel(opts) {
    var versions = [];
    var actions = [];
    var before = '';
    var more = false;
    var loading = false;
    var picked = null;
    var showChanges = true;
    var failed = '';

    var list = h('div', { class: 'dh-list', role: 'listbox', 'aria-label': 'Versions' });
    var preview = h('div', { class: 'dh-preview' });
    var close = h('button', { class: 'dh-iconbtn', type: 'button', title: 'Fermer', 'aria-label': 'Fermer' }, [icon('x')]);
    var panel = h('div', { class: 'dh-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Historique des versions' }, [
      h('div', { class: 'dh-head' }, [h('span', { class: 'dh-title', text: 'Historique des versions' }), close]),
      h('div', { class: 'dh-body' }, [preview, list]),
    ]);
    var overlay = h('div', { class: 'dh-overlay' }, [panel]);

    function done() {
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done();
      }
    }
    close.addEventListener('click', done);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) done(); });
    document.addEventListener('keydown', onKey, true);
    opts.root.appendChild(overlay);

    function nameOf(m) {
      return opts.me && m.id === opts.me.id ? 'Vous' : m.name;
    }

    function paintList() {
      list.textContent = '';
      if (failed) {
        list.appendChild(h('p', { class: 'dh-empty', text: failed }));
        return;
      }
      if (!versions.length) {
        list.appendChild(h('p', { class: 'dh-empty', text: loading ? 'Chargement…' : 'Aucune version.' }));
        return;
      }
      var day = '';
      versions.forEach(function (v, i) {
        var d = dayLabel(v.end);
        if (d !== day) {
          day = d;
          list.appendChild(h('div', { class: 'dh-day', text: d }));
        }
        var st = diffStats(v.prevBody, v.body);
        var sub = versionSummary(v);
        var on = picked === v;
        list.appendChild(
          h('button', {
            class: 'dh-item' + (on ? ' is-on' : ''),
            type: 'button',
            role: 'option',
            'aria-selected': on ? 'true' : 'false',
            onclick: function () { pick(v); },
          }, [
            avatar(v.member),
            h('span', { class: 'dh-item-main' }, [
              h('span', { class: 'dh-item-top' }, [
                h('span', { class: 'dh-item-time', text: clock(v.end) }),
                i === 0 ? h('span', { class: 'dh-badge', text: 'Actuelle' }) : null,
              ]),
              h('span', { class: 'dh-item-name', text: nameOf(v.member) }),
              sub ? h('span', { class: 'dh-item-sub', text: sub }) : null,
            ]),
            st.known && (st.added || st.removed)
              ? h('span', { class: 'dh-stats' }, [
                st.added ? h('span', { class: 'dh-plus', text: '+' + st.added }) : null,
                st.removed ? h('span', { class: 'dh-minus', text: '−' + st.removed }) : null,
              ])
              : null,
          ])
        );
      });
      if (more) {
        list.appendChild(h('button', { class: 'dh-more', type: 'button', disabled: loading, onclick: loadMore }, [loading ? 'Chargement…' : 'Versions plus anciennes']));
      }
    }

    function paintPreview() {
      preview.textContent = '';
      var v = picked;
      if (!v) {
        preview.appendChild(h('p', { class: 'dh-empty', text: loading ? 'Chargement…' : '' }));
        return;
      }
      var isCurrent = versions[0] === v;
      var canShow = typeof v.body === 'string';
      var canDiff = canShow && typeof v.prevBody === 'string';
      var bar = h('div', { class: 'dh-bar' }, [
        h('span', { class: 'dh-bar-label', text: dayLabel(v.end) + ', ' + clock(v.end) + ' · ' + nameOf(v.member) }),
        canDiff
          ? h('label', { class: 'dh-toggle' }, [
            h('input', { type: 'checkbox', checked: showChanges ? true : null, onchange: function (e) { showChanges = e.target.checked; paintPreview(); } }),
            'Changements',
          ])
          : null,
        !isCurrent && canShow
          ? h('button', { class: 'dc-btn dc-btn--primary dh-restore', type: 'button', onclick: restore }, [icon('restore'), 'Restaurer'])
          : null,
      ]);
      preview.appendChild(bar);
      var page = h('div', { class: 'dh-page' });
      if (!canShow) {
        page.appendChild(h('p', { class: 'dh-empty', text: 'Le texte de cette version n’est plus disponible.' }));
      } else if (showChanges && canDiff) {
        var diff = compactDiff(diffLines(v.prevBody, v.body), 2);
        if (!diff.length) page.appendChild(h('p', { class: 'dh-empty', text: versionSummary(v) || 'Aucun changement de texte.' }));
        diff.forEach(function (d) {
          if (d.op === 'gap') page.appendChild(h('div', { class: 'dh-gap', text: '⋯ ' + d.count + (d.count > 1 ? ' lignes identiques' : ' ligne identique') }));
          else page.appendChild(h('div', { class: 'dh-line' + (d.op === '+' ? ' dh-add' : d.op === '-' ? ' dh-del' : ''), text: DM().mentionsToPlain(d.text) || '\u00a0' }));
        });
      } else {
        var doc = h('div', { class: 'dc-editor dh-doc' });
        doc.innerHTML = DM().mdToHtml(v.body);
        page.appendChild(doc);
      }
      preview.appendChild(page);
    }

    function pick(v) {
      picked = v;
      paintList();
      paintPreview();
    }

    function restore() {
      var v = picked;
      if (!v || typeof v.body !== 'string') return;
      var btn = preview.querySelector('.dh-restore');
      if (btn) btn.disabled = true;
      Promise.resolve(opts.onRestore(v.body)).then(
        function (ok) {
          if (ok !== false) done();
          else if (btn) btn.disabled = false;
        },
        function () {
          if (btn) btn.disabled = false;
        }
      );
    }

    function rebuild() {
      // the creation is only placed once the pages in between are loaded, so its text is right
      versions = groupVersions(toEvents(more ? actions.filter(function (a) { return a.type !== 'createCard' && a.type !== 'copyCard'; }) : actions));
      // the newest version is what is on screen now, even if the last save is not in Trello's actions yet
      if (versions.length && typeof opts.currentBody === 'string') {
        versions[0].body = opts.currentBody;
      }
      if (!picked || versions.indexOf(picked) < 0) {
        var keepId = picked && picked.id;
        picked = versions.filter(function (v) { return v.id === keepId; })[0] || versions[0] || null;
      }
    }

    function loadMore() {
      if (loading) return;
      loading = true;
      paintList();
      loadPage(opts.t, opts.docId, before).then(
        function (p) {
          loading = false;
          actions = actions.concat(p.actions);
          before = p.before;
          more = p.more;
          rebuild();
          paintList();
          paintPreview();
        },
        function () {
          loading = false;
          failed = 'Impossible de lire l’historique dans Trello.';
          paintList();
          paintPreview();
        }
      );
    }

    loadMore();
    paintPreview();
    return { close: done };
  }

  global.DocsHistory = {
    MERGE_GAP_MS: MERGE_GAP_MS,
    toEvents: toEvents,
    groupVersions: groupVersions,
    diffLines: diffLines,
    diffStats: diffStats,
    compactDiff: compactDiff,
    dayLabel: dayLabel,
    versionSummary: versionSummary,
    whoFromActions: whoFromActions,
    loadWho: loadWho,
    loadPage: loadPage,
    loadMe: loadMe,
    openPanel: openPanel,
  };
})(typeof window !== 'undefined' ? window : this);
