/*
 * Role: UI of the Entity composer: ONE page to create an entity. An ARCHETYPE is a predefined model (a bundle of
 * components with default values); an ENTITY is an instance of it that stores only its overrides. The page:
 *   1. Name      one field ("Monstera, une plante au travail" is understood: name, archetype, place) + aliases
 *   2. Archetype pills grouped by nature (installed ones, ready-made library ones with a "+", a new one);
 *                several can be combined
 *   3. Components one card per component the archetypes bring, filled in place; "+ Composant" adds more
 *                (existing ones, or a new one written in a line)
 *   4. Links     relations to other entities, with the relations that fit what is being created
 * Fields left empty take the archetype's default (shown as "par défaut"). Linking to something that does not
 * exist offers "Créer « Salon »": the same page opens for it and comes back. Nothing is written until the
 * final "Créer". Logic: EntitiesComposer.
 *
 * Usage: EntitiesComposerUI.open({ schema, entities, initialText?, initialTypes?, initialDrafts?, onDone(result) })
 *   initialDrafts = the drafts of an interview that was switched to this page (first = the entity, then what it links to)
 *   result = { schema, entities, created, rootId, again, types }
 *
 * Contents: 1 helpers | 2 open: state | 3 page | 4 field controls | 5 links | 6 chrome | 7 flow
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesComposerUiParts = global.EntitiesComposerUiParts || {});

  function EM() {
    return global.EntitiesModel;
  }
  function EC() {
    return global.EntitiesComposer;
  }

  /* ── 1. Helpers ──────────────────────────────────────────────────── */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
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

  function splitList(s) {
    return String(s || '')
      .split(',')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  function issueIcon(level) {
    return icon(level === 'error' ? 'alert-circle' : level === 'info' ? 'info-circle' : 'alert-triangle');
  }

  function isoDay(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    var p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ── 2. Open: state ──────────────────────────────────────────────── */

  function open(ctx) {
    var M = Object.create(null);
    M.ctx = ctx;
    var __parts = (global.EntitiesComposerUiPartsMountOpen || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.EntitiesComposerUI = { open: open };

  // shared with the open parts
  S.EC = EC;
  S.EM = EM;
  S.h = h;
  S.icon = icon;
  S.isoDay = isoDay;
  S.issueIcon = issueIcon;
  S.open = open;
  S.splitList = splitList;
})(typeof window !== 'undefined' ? window : this);
