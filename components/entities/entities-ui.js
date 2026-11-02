/*
 * Role: UI of the Entities view ("Entités"): define rich things once ("Monstera", "Hôtel de Ville"), give them
 * types, typed properties, links and a history, then find them by describing them ("mes plantes au travail").
 *  - left: a source list (search box that also understands a request, type filter pills, entities grouped by type,
 *    one "+" button that opens the composer)
 *  - right: the entity as a page (big editable name, type pills, aliases, then properties as grouped lists,
 *    links, and two collapsed rows: "Modèle et variantes", "Historique" with per-entry undo)
 *  - "Types et composants": the components (groups of typed fields) and types (bundles of components)
 * Data + writes: EntitiesTrello; pure logic (schema, mutations, history, query, text resolution): EntitiesModel.
 *
 * Contents
 *   1. helpers   2. mount: state + skeleton   (popovers and menus)   3. sidebar   4. entity editor
 *   5. schema editor   6. saving   7. boot
 */
(function (global) {
  'use strict';

  var S = (global.EntitiesUiParts = global.EntitiesUiParts || {});

  var EM = function () {
    return global.EntitiesModel;
  };
  var ET = function () {
    return global.EntitiesTrello;
  };
  var ES = function () {
    return global.EntitiesSystems;
  };
  var ESAI = function () {
    return global.EntitiesSystemsAI;
  };

  var SAVE_DELAY_MS = 700;
  var KIND_LABELS = {
    text: 'Texte',
    number: 'Nombre',
    date: 'Date',
    bool: 'Oui / non',
    choice: 'Choix',
    ref: 'Lien vers une entité',
    refs: 'Liens vers des entités',
    multi: 'Choix multiple',
    longtext: 'Texte long',
    level: 'Jauge (curseur)',
    geo: 'Coordonnées (lat, lon)',
    url: 'Lien web',
  };

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

  /** Lowercase, accent-free text for searching in pickers. */
  function fold(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function cap(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** The tile of an entity takes the color of the nature of its first type (iOS system colors). */
  var NATURE_COLORS = {
    matter: '#ff9500',
    living: '#34c759',
    agent: '#0a84ff',
    place: '#30b0c7',
    event: '#af52de',
    social: '#5e5ce6',
    abstract: '#ff2d55',
  };
  var NEUTRAL_COLOR = '#8e8e93';

  var RELATIVE = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }) : null;

  /** "à l’instant", "il y a 3 min", "hier", then a short date once it is older than a week. */
  function whenText(ts) {
    var d = ts ? new Date(ts) : null;
    if (!d || isNaN(d.getTime())) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (RELATIVE && diff >= 0 && diff < 7 * 86400) {
      if (diff < 60) return 'à l’instant';
      if (diff < 3600) return RELATIVE.format(-Math.round(diff / 60), 'minute');
      if (diff < 86400) return RELATIVE.format(-Math.round(diff / 3600), 'hour');
      return RELATIVE.format(-Math.round(diff / 86400), 'day');
    }
    return d.toLocaleDateString('fr-CA', { dateStyle: 'medium' });
  }

  function splitList(s) {
    return String(s || '')
      .split(',')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  function reasonText(err) {
    var r = (err && (err.reason || err.message)) || '';
    if (r === 'not-authorized' || r === 'no-token' || r === 'auth-failed') return 'Autorisez Trello pour enregistrer vos entités.';
    if (r === 'http-401' || r === 'http-403') return 'L’autorisation Trello a expiré ou ne couvre pas ce tableau.';
    if (r === 'too-long') return 'Cette entité dépasse la taille maximale d’une description Trello.';
    if (r === 'no-list') return 'Le tableau n’a aucune liste : créez-en une pour pouvoir enregistrer des entités.';
    if (r === 'conflict') return 'Modifié ailleurs entre-temps : rechargez pour voir la dernière version.';
    return 'Échec : ' + (r || 'erreur inconnue');
  }

  function isAuthReason(err) {
    var r = err && (err.reason || err.message);
    return r === 'not-authorized' || r === 'no-token' || r === 'auth-failed' || r === 'http-401';
  }

  /* ── 2. Mount: state + skeleton ──────────────────────────────────── */

  function mount(root, t) {
    var M = Object.create(null);
    M.root = root;
    M.t = t;
    var __parts = (global.EntitiesUiPartsMountMount || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  global.EntitiesUI = { mount: mount };

  // shared with the mount parts
  S.EM = EM;
  S.ES = ES;
  S.ESAI = ESAI;
  S.ET = ET;
  S.KIND_LABELS = KIND_LABELS;
  S.NATURE_COLORS = NATURE_COLORS;
  S.NEUTRAL_COLOR = NEUTRAL_COLOR;
  S.RELATIVE = RELATIVE;
  S.SAVE_DELAY_MS = SAVE_DELAY_MS;
  S.cap = cap;
  S.fold = fold;
  S.h = h;
  S.icon = icon;
  S.isAuthReason = isAuthReason;
  S.mount = mount;
  S.reasonText = reasonText;
  S.splitList = splitList;
  S.whenText = whenText;
})(typeof window !== 'undefined' ? window : this);
