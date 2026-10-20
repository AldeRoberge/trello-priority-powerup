/*
 * Role: the people rows under the Orchestrateur (DOM only; logic in people-board-model.js).
 * One row per person, on the same columns as my own row: the person's unplanned cards at the left, then
 * a cell per day (or per week, month... whatever the zoom shows). The list scrolls with the mouse wheel;
 * the columns follow the horizontal scroll and the zoom of my row. Prefix: pb-.
 *
 *   PeopleBoardUI.build({
 *     people: [{ key, name, initials, custom }],
 *     plan(person) -> { count, pool: [row], cells: [{ spec, tasks: [row], current, weekend }] },
 *     card(row, person) -> element            // the same card as in my row
 *     zone(element, spec) -> element          // makes it a drop zone (spec carries the owner)
 *     poolSpec(person) -> spec                // where the cards dropped on the name go
 *   }) -> element
 *   PeopleBoardUI.sync(page)                  // columns and horizontal scroll of the rows = those of my row
 */
(function (global) {
  'use strict';

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /** A calm, stable colour per person (same name, same colour). */
  function hueOf(name) {
    var n = 0;
    String(name || '').split('').forEach(function (ch) { n = (n * 31 + ch.charCodeAt(0)) % 360; });
    return n;
  }

  function avatar(person) {
    return h('span', {
      class: 'pb-avatar' + (person.custom ? ' is-custom' : ''),
      style: '--pb-hue:' + hueOf(person.name),
      'aria-hidden': 'true',
      text: person.initials || '?',
    });
  }

  function build(host) {
    var root = h('div', { class: 'pb-people', 'data-keep': 'people', role: 'list', 'aria-label': 'Équipe' });
    (host.people || []).forEach(function (person) {
      var plan = host.plan(person);
      var who = host.zone(h('div', { class: 'db-col-card db-col-card--pool pb-who' + (plan.count ? '' : ' is-empty') }, [
        h('header', { class: 'pb-head', title: person.custom ? person.name + ' (hors Trello)' : person.name }, [
          avatar(person),
          h('span', { class: 'pb-name', text: person.name }),
          plan.count ? h('span', { class: 'db-col-count', text: String(plan.count) }) : null,
        ]),
        h('div', { class: 'pb-body' }, plan.pool.map(function (r) { return host.card(r, person); })),
      ]), host.poolSpec(person));
      var cells = plan.cells.map(function (c) {
        var cls = 'db-col-card pb-cell' + (c.current ? ' is-today' : '') + (c.weekend ? ' is-weekend' : '');
        return host.zone(h('section', { class: cls }, [
          h('div', { class: 'pb-body' }, c.tasks.map(function (r) { return host.card(r, person); })),
        ]), c.spec);
      });
      root.appendChild(h('section', { class: 'pb-row', role: 'listitem', 'data-person': person.key }, [
        who,
        h('div', { class: 'pb-days' }, cells),
      ]));
    });
    return root;
  }

  /** The rows copy the grid template and the horizontal position of my row (the strip with the day columns). */
  function sync(page) {
    if (!page || !page.querySelector) return;
    var strip = page.querySelector('.db-board-days');
    if (!strip) return;
    var template = strip.style.gridTemplateColumns;
    var left = strip.scrollLeft;
    var strips = page.querySelectorAll('.pb-days');
    for (var i = 0; i < strips.length; i++) {
      if (template && strips[i].style.gridTemplateColumns !== template) strips[i].style.gridTemplateColumns = template;
      if (strips[i].scrollLeft !== left) strips[i].scrollLeft = left;
    }
  }

  global.PeopleBoardUI = { build: build, sync: sync };
})(typeof window !== 'undefined' ? window : this);
