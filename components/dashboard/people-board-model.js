/*
 * Role: pure logic of the people rows under the Orchestrateur. My own todo is the top row; every other
 * person of the board (Trello members and "Hors Trello" contacts) gets a row below, on the same columns,
 * and a card dragged from one row to another is handed over.
 * No Trello / DOM access (test/people-board-model.test.js).
 *
 * Rows are the shape DashboardTrello.load builds: row.assignees = [{ id, name, initials, custom, trelloId }]
 * and row.inputs.customAssignees = the stored "Hors Trello" entries ({ id, name, trelloMemberId? }).
 * A person is { key, id, name, initials, custom, trelloId, entry? }; key is 'm:<id>' (member) or 'c:<id>' (contact).
 * ME is the key of the viewer's own row.
 */
(function (global) {
  'use strict';

  var ME = 'me';

  function fold(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function initialsOf(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /** The viewer as a person: { key: 'me', id, name, initials, custom: false, trelloId } or null when unknown. */
  function meOf(member) {
    if (!member || member.id == null || member.id === '') return null;
    var id = String(member.id);
    var name = String(member.fullName || member.username || '').trim() || id;
    return { key: ME, id: id, name: name, initials: String(member.initials || '').trim() || initialsOf(name), custom: false, trelloId: id };
  }

  /** Same person: same id, or a contact linked to the member (either way round). */
  function matches(assignee, person) {
    if (!assignee || !person) return false;
    var aid = String(assignee.id);
    var at = assignee.trelloId ? String(assignee.trelloId) : '';
    var pid = String(person.id);
    var pt = person.trelloId ? String(person.trelloId) : '';
    return aid === pid || (pt !== '' && (aid === pt || at === pt)) || (at !== '' && at === pid);
  }

  /** True when `row` sits on `person`'s row: assigned to them. */
  function isOn(row, person) {
    return ((row && row.assignees) || []).some(function (a) { return matches(a, person); });
  }

  /** My row: what is assigned to me, and what nobody has yet. */
  function isMine(row, me) {
    var list = (row && row.assignees) || [];
    if (!list.length) return true;
    return list.some(function (a) { return matches(a, me); });
  }

  function mineRows(rows, me) {
    if (!me) return (rows || []).slice();
    return (rows || []).filter(function (r) { return isMine(r, me); });
  }

  function personRows(rows, person) {
    return (rows || []).filter(function (r) { return isOn(r, person); });
  }

  /**
   * The people under my row, A to Z: board members, then "Hors Trello" contacts that are not a board member
   * (a contact linked to a member counts once, as the member). Never me.
   * raw: { members: [{ id, fullName, username, initials }], catalog: [{ id, name, trelloMemberId }], me }
   */
  function people(raw) {
    raw = raw || {};
    var me = raw.me || null;
    var out = [];
    var memberIds = Object.create(null);
    (raw.members || []).forEach(function (m) {
      if (!m || m.id == null || memberIds[String(m.id)]) return;
      var id = String(m.id);
      memberIds[id] = true;
      if (me && id === me.id) return;
      var name = String(m.fullName || m.username || '').trim() || id;
      out.push({ key: 'm:' + id, id: id, name: name, initials: String(m.initials || '').trim() || initialsOf(name), custom: false, trelloId: id });
    });
    var seen = Object.create(null);
    (raw.catalog || []).forEach(function (c) {
      if (!c || c.id == null) return;
      var id = String(c.id);
      var linked = c.trelloMemberId ? String(c.trelloMemberId) : '';
      if (linked && (memberIds[linked] || (me && linked === me.id))) return;
      if (me && id === me.id) return;
      if (seen[id]) return;
      seen[id] = true;
      var name = String(c.name || c.fullName || '').trim() || id;
      out.push({ key: 'c:' + id, id: id, name: name, initials: initialsOf(name), custom: true, trelloId: linked, entry: { id: id, name: name, trelloMemberId: linked || undefined } });
    });
    // Someone only seen on a card (left the board, contact not in the catalog) still gets a row, so no card vanishes.
    (raw.rows || []).forEach(function (r) {
      var stored = (r && r.inputs && r.inputs.customAssignees) || [];
      ((r && r.assignees) || []).forEach(function (a) {
        if (!a || a.id == null || (me && matches(a, me))) return;
        if (out.some(function (p) { return matches(a, p); })) return;
        var id = String(a.id);
        var name = String(a.name || '').trim() || id;
        var linked = a.trelloId ? String(a.trelloId) : '';
        if (a.custom) {
          var entry = stored.filter(function (e) { return e && String(e.id) === id; })[0];
          out.push({ key: 'c:' + id, id: id, name: name, initials: initialsOf(name), custom: true, trelloId: linked, entry: entry ? Object.assign({}, entry) : { id: id, name: name } });
        } else {
          out.push({ key: 'm:' + id, id: id, name: name, initials: String(a.initials || '').trim() || initialsOf(name), custom: false, trelloId: id });
        }
      });
    });
    out.sort(function (a, b) {
      var fa = fold(a.name);
      var fb = fold(b.name);
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
    return out;
  }

  function asAssignee(person) {
    return { id: person.id, name: person.name, initials: person.initials, custom: !!person.custom, trelloId: person.trelloId || '' };
  }

  function sameList(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort();
    var y = b.slice().sort();
    return x.every(function (v, i) { return v === y[i]; });
  }

  /**
   * What to write so a card goes from the row `from` to the row `to` (people, or ME as { key: 'me', ... }).
   * The source row's person is taken off, the target is put on (no one twice); the other people stay.
   * `from` = 'all' (the card menu's "Confier à") takes everyone off: the target ends up alone with it.
   * Returns { assignees, memberIds, customs, members, contacts }: the card's people after the move, the
   * Trello member ids and the "Hors Trello" entries to store, and which of the two changed (null = leave it).
   */
  function handover(row, from, to) {
    var before = (row && row.assignees) || [];
    var kept = before.filter(function (a) { return !(from === 'all' || (from && matches(a, from))); });
    var next = kept.some(function (a) { return matches(a, to); }) ? kept : kept.concat([asAssignee(to)]);
    var stored = ((row && row.inputs && row.inputs.customAssignees) || []).filter(function (e) { return e && e.id != null; });
    var customs = [];
    next.forEach(function (a) {
      if (!a.custom) return;
      var entry = stored.filter(function (e) { return String(e.id) === String(a.id); })[0];
      if (!entry && to.entry && String(to.entry.id) === String(a.id)) entry = to.entry;
      customs.push(entry ? Object.assign({}, entry) : { id: a.id, name: a.name });
    });
    var memberIds = next.filter(function (a) { return !a.custom; }).map(function (a) { return String(a.id); });
    var beforeMembers = before.filter(function (a) { return !a.custom; }).map(function (a) { return String(a.id); });
    var beforeCustoms = stored.map(function (e) { return String(e.id); });
    return {
      assignees: next,
      memberIds: memberIds,
      customs: customs,
      members: sameList(memberIds, beforeMembers) ? null : memberIds,
      contacts: sameList(customs.map(function (c) { return String(c.id); }), beforeCustoms) ? null : customs,
    };
  }

  /** True when dropping `row` on `target`'s row changes who has it (it is not already theirs alone). */
  function needsHandover(row, from, to) {
    var plan = handover(row, from, to);
    return !!(plan.members || plan.contacts);
  }

  /** The card after the move, locally: the assignees and stored contacts a view shows. Mutates and returns `row`. */
  function applyHandover(row, plan) {
    row.assignees = plan.assignees.map(function (a) { return Object.assign({}, a); });
    row.inputs = Object.assign({}, row.inputs || {}, { customAssignees: plan.customs.map(function (c) { return Object.assign({}, c); }) });
    return row;
  }

  /** What the card menu lists under "Confier à": me first (when the card is elsewhere), then everyone, A to Z. */
  function menuPeople(row, list, me) {
    var out = [];
    if (me) out.push({ key: ME, name: 'Moi', on: isMine(row, me) });
    (list || []).forEach(function (p) { out.push({ key: p.key, name: p.name, on: isOn(row, p) }); });
    return out;
  }

  /** The person (or me) for a key, from the list. */
  function byKey(list, me, key) {
    if (key === ME) return me || null;
    return (list || []).filter(function (p) { return p.key === key; })[0] || null;
  }

  global.PeopleBoardModel = {
    ME: ME,
    meOf: meOf,
    matches: matches,
    isOn: isOn,
    isMine: isMine,
    mineRows: mineRows,
    personRows: personRows,
    people: people,
    handover: handover,
    needsHandover: needsHandover,
    applyHandover: applyHandover,
    menuPeople: menuPeople,
    byKey: byKey,
    initialsOf: initialsOf,
  };
})(typeof window !== 'undefined' ? window : this);
