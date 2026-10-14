/*
 * Pure geometry and link payloads for the document task-chip pins.
 * A dot sits on an edge of a task mention (parent above, sibling to the right, person to the left)
 * and only counts as visible when the pointer is within reach of that edge.
 * Parent is stored as depType "parts" on the parent card (it is composed of this task).
 * Sibling is stored as depType "after" on this card (it comes after the other).
 * A responsible person is a board member id, appended to the card's member list.
 */
(function (global) {
  'use strict';

  var ROLES = [
    { id: 'parent', nx: 0, ny: -1, label: 'Tâche parente', kind: 'task' },
    { id: 'sibling', nx: 1, ny: 0, label: 'Tâche voisine', kind: 'task' },
    { id: 'person', nx: -1, ny: 0, label: 'Responsable', kind: 'person' },
  ];

  function roleById(id) {
    var i;
    for (i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i];
    return null;
  }

  function dist(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Screen point of a pin on a chip rectangle (the edge midpoint). */
  function anchor(rect, roleId) {
    var r = typeof roleId === 'string' ? roleById(roleId) : roleId;
    if (!r || !rect) return null;
    return {
      x: rect.left + rect.width / 2 + r.nx * (rect.width / 2),
      y: rect.top + rect.height / 2 + r.ny * (rect.height / 2),
      role: r.id,
    };
  }

  /** Pins close enough to grab. reach is the outer radius, hot the radius that fills the dot. */
  function visible(rect, x, y, reach, hot) {
    var limit = reach == null ? 30 : reach;
    var hotAt = hot == null ? 14 : hot;
    var out = [];
    if (!rect) return out;
    ROLES.forEach(function (r) {
      var p = anchor(rect, r.id);
      var d = dist(p.x, p.y, x, y);
      if (d > limit) return;
      out.push({ role: r.id, x: p.x, y: p.y, d: d, hot: d <= hotAt });
    });
    return out;
  }

  /** The single closest pin within reach, or null. */
  function nearest(rect, x, y, reach, hot) {
    var list = visible(rect, x, y, reach, hot);
    var best = null;
    list.forEach(function (p) {
      if (!best || p.d < best.d) best = p;
    });
    return best;
  }

  /**
   * Where a task link is written.
   * parent: the other card is composed of this one.
   * sibling: this card comes after the other.
   */
  function taskWrite(role, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return null;
    if (role === 'parent') return { cardId: toId, addId: fromId, depType: 'parts' };
    if (role === 'sibling') return { cardId: fromId, addId: toId, depType: 'after' };
    return null;
  }

  /** Appends addId to dependsOn and sets its type. changed is false when that exact link already exists. */
  function appendDep(dependsOn, depTypes, addId, depType, selfId) {
    var id = String(addId || '').trim();
    if (!id || id === String(selfId || '')) return null;
    var list = (Array.isArray(dependsOn) ? dependsOn : []).slice();
    var types = {};
    var key;
    for (key in depTypes || {}) {
      if (Object.prototype.hasOwnProperty.call(depTypes, key)) types[key] = depTypes[key];
    }
    var existed = list.indexOf(id) >= 0;
    if (!existed) list.push(id);
    var same = existed && types[id] === depType;
    if (depType) types[id] = depType;
    return { dependsOn: list, depTypes: types, changed: !same };
  }

  /** Appends a member id. changed is false when they are already on the card. */
  function appendMember(ids, addId) {
    var id = String(addId || '').trim();
    if (!id) return null;
    var list = (ids || []).map(function (x) { return String(x); });
    if (list.indexOf(id) >= 0) return { ids: list, changed: false };
    return { ids: list.concat([id]), changed: true };
  }

  global.DocsPins = {
    ROLES: ROLES,
    roleById: roleById,
    anchor: anchor,
    visible: visible,
    nearest: nearest,
    taskWrite: taskWrite,
    appendDep: appendDep,
    appendMember: appendMember,
  };
})(typeof window !== 'undefined' ? window : this);
