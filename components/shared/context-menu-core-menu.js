/* Shared right-click context menu for accordion / Gantt section heads. */

/**
 * context-menu: part 1 of 2 (menu).
 * Names are shared with the other parts through window.ContextMenuParts (see context-menu.parts.json for the load order).
 */

/**
 * context-menu-core: part 1 of 2 (menu).
 * Names are shared with the other parts through window.ContextMenuParts (see context-menu-core.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.ContextMenuParts = global.ContextMenuParts || {});

var S = (global.ContextMenuParts = global.ContextMenuParts || {});

var MENU_CLASS = 'tp-context-menu';
  var ITEM_CLASS = 'tp-context-menu-item';
  S.activeMenu = null;
  S.activeCleanup = null;

  function doc() {
    return global.document;
  }

  function isSeparator(item) {
    return !!(item && item.sep);
  }

  /* Tabler icon per item id ("prefix:*" covers ids like "due-quick:demain"). */
  var ICONS = {
    'toggle-expand': 'layout-list',
    'collapse-all': 'fold-up',
    'expand-all': 'fold-down',
    'edit-settings': 'settings',
    'open-memory': 'brain',
    'focus-composer': 'cursor-text',
    complete: 'circle-check',
    unblock: 'player-play',
    block: 'player-pause',
    'add-subtask': 'list-check',
    'postpone-tomorrow': 'arrow-curve-right',
    'due-quick:*': 'calendar-event',
    'due-quick:cet-apres-midi': 'circle-dot',
    'due-quick:demain-matin': 'arrow-curve-right',
    'due-quick:lundi-prochain': 'calendar-event',
    'due-quick:dans-une-semaine': 'calendar-week',
    'due-quick:dans-deux-semaines': 'calendar-month',
    'clear-due': 'calendar-off',
    'complete-all': 'checks',
    'reset-all': 'rotate',
    'open-goals': 'target',
    undo: 'arrow-back-up',
    redo: 'arrow-forward-up',
    'toggle-graph': 'chart-dots',
    'move-selection': 'arrows-move',
    'select-cards': 'checkbox',
    'toggle-hide-blocked': 'eye-off',
    'toggle-task': 'circle-check',
    'jump-progress': 'progress',
    'show-progress': 'progress',
    'toggle-done': 'circle-check',
    'toggle-master': 'circle-check',
    'toggle-blocked': 'player-pause',
    'add-checklist': 'list-details',
    promote: 'arrow-up-right',
    'open-linked': 'external-link',
    delete: 'trash',
    'select-list': 'list-check',
    'open-settings': 'settings',
    'heat:*': 'flame',
    'explain-score': 'help-circle',
    'edit-resume': 'edit',
    copy: 'copy',
    cut: 'cut',
    paste: 'clipboard',
    'feedback-up': 'thumb-up',
    'feedback-down': 'thumb-down',
    'open-card': 'external-link',
    'open-document': 'file-text',
    'toggle-select': 'checkbox',
    'mini-blocked': 'player-pause',
    'mini-priority': 'flame',
    'mini-progress': 'progress',
    'mini-due': 'calendar-event',
    'clear-dates': 'calendar-off',
    'toggle-details': 'list-details',
    revert: 'history',
    restore: 'arrow-forward-up',
    'edit-roles': 'user-cog',
    edit: 'edit',
    remove: 'x',
    'bulk-count': 'checkbox',
    'bulk-done': 'circle-check',
    'bulk-reopen': 'rotate',
    'bulk-delete': 'trash',
    'bulk-clear': 'square-off',
    'bulk-select-all': 'select-all',
    'focus-add': 'list-check',
    'zoom-day': 'calendar-event',
    'zoom-week': 'calendar-week',
    'zoom-month': 'calendar-month',
    'zoom-year': 'calendar-stats',
    zoom: 'zoom-in',
    'nav-prev': 'chevron-left',
    'nav-today': 'circle-dot',
    'nav-next': 'chevron-right',
    'filter-completed': 'eye-off',
    'filter-blocked': 'eye-off',
    'filter-undated': 'eye-off',
    send: 'send',
    'mode:*': 'sparkles',
    'open-help': 'help-circle',
    'open-link': 'external-link',
    'copy-link': 'link',
    'copy-image-url': 'photo',
    'select-all': 'select-all',
    reload: 'refresh',
    'create-person': 'user-plus',
    'remove-person': 'user-minus',
    'fit-view': 'focus-2',
    'reset-layout': 'layout-grid'
  };

  /* Section (subsection header) per item id; menus with one section show no headers. */
  var GROUPS = {
    'toggle-expand': 'Affichage',
    'collapse-all': 'Affichage',
    'expand-all': 'Affichage',
    'toggle-graph': 'Affichage',
    'toggle-details': 'Affichage',
    'toggle-hide-blocked': 'Affichage',
    'filter-completed': 'Filtres',
    'filter-blocked': 'Filtres',
    'filter-undated': 'Filtres',
    'zoom-day': 'Zoom',
    'zoom-week': 'Zoom',
    'zoom-month': 'Zoom',
    'zoom-year': 'Zoom',
    'nav-prev': 'Navigation',
    'nav-today': 'Navigation',
    'nav-next': 'Navigation',
    'fit-view': 'Affichage',
    'reset-layout': 'Affichage',
    complete: 'Statut',
    unblock: 'Statut',
    block: 'Statut',
    'toggle-task': 'Statut',
    'toggle-done': 'Statut',
    'toggle-master': 'Statut',
    'toggle-blocked': 'Statut',
    'mini-blocked': 'Statut',
    'complete-all': 'Statut',
    'reset-all': 'Statut',
    'bulk-done': 'Statut',
    'bulk-reopen': 'Statut',
    'add-subtask': 'Créer',
    'add-checklist': 'Créer',
    'focus-add': 'Créer',
    'create-person': 'Créer',
    promote: 'Créer',
    'postpone-tomorrow': 'Échéance',
    'mini-due': 'Échéance',
    'clear-due': 'Échéance',
    'clear-dates': 'Échéance',
    'due-quick:*': 'Échéance',
    'mini-priority': 'Priorité',
    'heat:*': 'Priorité',
    'explain-score': 'Priorité',
    'edit-settings': 'Paramètres',
    'open-memory': 'Paramètres',
    'open-settings': 'Paramètres',
    'edit-roles': 'Modifier',
    edit: 'Modifier',
    'edit-resume': 'Modifier',
    undo: 'Modifier',
    redo: 'Modifier',
    revert: 'Modifier',
    restore: 'Modifier',
    'open-card': 'Ouvrir',
    'open-goals': 'Ouvrir',
    'open-linked': 'Ouvrir',
    'open-link': 'Ouvrir',
    'jump-progress': 'Ouvrir',
    'show-progress': 'Ouvrir',
    'mini-progress': 'Ouvrir',
    'select-cards': 'Sélection',
    'toggle-select': 'Sélection',
    'move-selection': 'Sélection',
    'select-list': 'Sélection',
    'bulk-count': 'Sélection',
    'bulk-clear': 'Sélection',
    'bulk-select-all': 'Sélection',
    'select-all': 'Sélection',
    copy: 'Presse-papiers',
    cut: 'Presse-papiers',
    paste: 'Presse-papiers',
    'copy-link': 'Presse-papiers',
    'copy-image-url': 'Presse-papiers',
    'feedback-up': 'Avis',
    'feedback-down': 'Avis',
    'mode:*': 'Modèle',
    send: 'Envoi',
    delete: 'Suppression',
    remove: 'Suppression',
    'remove-person': 'Suppression',
    'bulk-delete': 'Suppression'
  };

  /**
   * Tabler icon for a day relative to today (0 = today): circle-in-circle today,
   * jumping arrow tomorrow, two arrows the day after, calendars further out.
   */
  function dayIcon(days) {
    if (typeof days !== 'number' || !isFinite(days)) return 'calendar';
    if (days === 0) return 'circle-dot';
    if (days === 1) return 'arrow-curve-right';
    if (days === 2) return 'arrows-right';
    if (days === -1) return 'arrow-back-up';
    if (days < -1) return 'history';
    if (days < 7) return 'calendar-event';
    if (days < 14) return 'calendar-week';
    return 'calendar-month';
  }

  function lookup(table, id) {
    if (!id) return '';
    if (table[id]) return table[id];
    var c = id.indexOf(':');
    if (c > 0 && table[id.slice(0, c) + ':*']) return table[id.slice(0, c) + ':*'];
    return '';
  }

  function iconFor(item) {
    return item.icon || lookup(ICONS, item.id) || (item.danger ? 'trash' : 'point');
  }

  function groupFor(item) {
    return item.group || lookup(GROUPS, item.id) || 'Actions';
  }

  function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (isSeparator(it)) {
        out.push({ sep: true });
        continue;
      }
      var children = Array.isArray(it.children) ? normalizeItems(it.children) : null;
      if (children && !children.some(function (c) { return !c.sep; })) children = null;
      if (typeof it.action !== 'function' && !it.disabled && !children) continue;
      out.push({
        id: it.id != null ? String(it.id) : 'item-' + i,
        label: it.label != null ? String(it.label) : '',
        icon: it.icon ? String(it.icon) : '',
        group: it.group ? String(it.group) : '',
        hint: it.hint ? String(it.hint) : '',
        shortcut: dedicatedShortcut(it),
        keywords: it.keywords ? String(it.keywords) : '',
        checked: !!it.checked,
        disabled: !!it.disabled,
        danger: !!it.danger,
        success: !!it.success,
        children: children,
        action: typeof it.action === 'function' ? it.action : null,
      });
    }
    return out;
  }

  /* ── Fuzzy search (Levenshtein) ─────────────────────────────────────── */

  function fold(s) {
    s = String(s == null ? '' : s).toLowerCase();
    try {
      s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (e) {
      /* no String.prototype.normalize */
    }
    return s;
  }

  /**
   * Letter that runs the item while the menu is open. A is Archiver
   * (and « Archiver la carte », « Archiver… »). An explicit `shortcut`
   * of one character wins. A one-letter hint is not a dedicated shortcut.
   */
  function dedicatedShortcut(it) {
    if (!it || it.sep || it.title) return '';
    if (it.shortcut != null && String(it.shortcut).trim()) {
      var raw = String(it.shortcut).trim();
      if (raw.length === 1) return raw.toUpperCase();
    }
    var lab = fold(it.label != null ? it.label : '').replace(/^[^a-z]+/, '');
    if (lab.indexOf('archiver') === 0) return 'A';
    return '';
  }

  function shortcutLetters(items, into) {
    into = into || {};
    (items || []).forEach(function (it) {
      if (!it || it.sep) return;
      if (it.shortcut) into[it.shortcut] = true;
      if (it.children) shortcutLetters(it.children, into);
    });
    return into;
  }

  /** Dedicated shortcut, or a one-character hint (C, 1, …) shown as a key. */
  function accessKey(item) {
    var owned = dedicatedShortcut(item);
    if (owned) return owned;
    var h = item && item.hint ? String(item.hint).trim() : '';
    if (h.length === 1 && /^[A-Za-z0-9]$/.test(h)) return h.toUpperCase();
    return '';
  }

  /**
   * Row a typed key should run. Dedicated shortcuts win over a hint that
   * uses the same letter (A archives, even when Accepter also shows A).
   * A hint key waits until the search field is not focused. Nothing runs
   * once a search query has started.
   * rows: [{ item }]. opts: { filtering, searchFocused }.
   */
  function rowForKey(rows, key, opts) {
    opts = opts || {};
    if (!key || String(key).length !== 1 || opts.filtering) return null;
    var ch = String(key).toUpperCase();
    var hits = [];
    var owned = [];
    var list = rows || [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i] && list[i].item;
      if (!item || item.disabled || item.sep || item.title) continue;
      if (accessKey(item) !== ch) continue;
      hits.push(list[i]);
      if (dedicatedShortcut(item) === ch) owned.push(list[i]);
    }
    if (owned.length) return owned[0];
    if (opts.searchFocused) return null;
    if (hits.length === 1) return hits[0];
    return null;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [];
    var j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Cost of one query token against folded text; null when it does not match. */
  function tokenCost(tok, text, words) {
    if (text.indexOf(tok) !== -1) {
      for (var i = 0; i < words.length; i++) {
        if (words[i].indexOf(tok) === 0) return 0;
      }
      return 0.4;
    }
    var limit = tok.length < 3 ? 0 : tok.length < 6 ? 1 : 2;
    if (!limit) return null;
    var best = Infinity;
    for (var k = 0; k < words.length; k++) {
      var d = Math.min(
        levenshtein(tok, words[k]),
        levenshtein(tok, words[k].slice(0, tok.length))
      );
      if (d < best) best = d;
    }
    return best <= limit ? best + 0.6 : null;
  }

  /**
   * Sort `list` by how well `getText(entry)` matches `query`, dropping non
   * matches. Every whitespace-separated token must match (substring, prefix
   * or within a small Levenshtein distance). Stable for equal scores.
   */
  function rank(query, list, getText) {
    var tokens = fold(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return list.slice();
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var text = fold(getText(list[i]));
      var words = text.split(/[^a-z0-9]+/).filter(Boolean);
      var total = 0;
      var ok = true;
      for (var t = 0; t < tokens.length; t++) {
        var c = tokenCost(tokens[t], text, words);
        if (c === null) {
          ok = false;
          break;
        }
        total += c;
      }
      if (ok) scored.push({ entry: list[i], score: total, index: i });
    }
    scored.sort(function (a, b) {
      return a.score - b.score || a.index - b.index;
    });
    return scored.map(function (s) {
      return s.entry;
    });
  }

  /** Leaf (runnable) entries of a menu, submenu children included with their parent's label. */
  function flatten(items, parent) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.sep) continue;
      if (it.children) {
        out = out.concat(flatten(it.children, it));
      } else {
        out.push({ item: it, parent: parent || null });
      }
    }
    return out;
  }

  function entryText(entry) {
    var it = entry.item;
    return [
      it.label,
      it.keywords,
      entry.parent ? entry.parent.label : '',
      groupFor(entry.parent || it),
    ].join(' ');
  }

  /**
   * Group items under section headers. Returns null when a flat list reads
   * better (few items or a single section).
   */
  function arrangeSections(items) {
    var real = items.filter(function (i) { return !i.sep; });
    if (real.length < 5) return null;
    var order = [];
    var byName = Object.create(null);
    real.forEach(function (it) {
      var name = groupFor(it);
      if (!byName[name]) {
        byName[name] = [];
        order.push(name);
      }
      byName[name].push(it);
    });
    if (order.length < 2) return null;
    return order.map(function (name) {
      return { name: name, items: byName[name] };
    });
  }


  function hide() {
    if (S.activeCleanup) {
      try {
        S.activeCleanup();
      } catch (e) {
        /* ignore */
      }
      S.activeCleanup = null;
    }
    if (S.activeMenu && S.activeMenu.parentNode) {
      try {
        S.activeMenu.parentNode.removeChild(S.activeMenu);
      } catch (e2) {
        /* ignore */
      }
    }
    S.activeMenu = null;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function positionMenu(menuEl, clientX, clientY) {
    var d = doc();
    var vw = (global.innerWidth || (d.documentElement && d.documentElement.clientWidth) || 800);
    var vh = (global.innerHeight || (d.documentElement && d.documentElement.clientHeight) || 600);
    var narrow = global.ViewShell && typeof global.ViewShell.isNarrow === 'function'
      ? global.ViewShell.isNarrow()
      : vw <= 640;
    if (narrow) {
      menuEl.classList.add('is-sheet');
      menuEl.style.visibility = '';
      menuEl.style.left = '8px';
      menuEl.style.right = '8px';
      menuEl.style.top = 'auto';
      menuEl.style.bottom = 'max(8px, env(safe-area-inset-bottom, 0px))'; // not a plain 8px: the home bar of a phone
      menuEl.style.width = 'auto';
      return;
    }
    menuEl.style.visibility = 'hidden';
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    var mw = menuEl.offsetWidth || 220;
    var mh = menuEl.offsetHeight || 160;
    var left = clamp(clientX, 8, vw - mw - 8);
    var top = clamp(clientY, 8, vh - mh - 8);
    menuEl.style.left = Math.round(left) + 'px';
    menuEl.style.top = Math.round(top) + 'px';
    menuEl.style.visibility = '';
  }

  function runItem(item) {
    hide();
    if (!item || item.disabled || typeof item.action !== 'function') return;
    try {
      item.action();
    } catch (err) {
      console.error('ContextMenu action failed', err);
    }
  }

  var SEARCH_MIN_ITEMS = 4;

  // exports
  S.GROUPS = GROUPS;
  S.ICONS = ICONS;
  S.ITEM_CLASS = ITEM_CLASS;
  S.MENU_CLASS = MENU_CLASS;
  S.SEARCH_MIN_ITEMS = SEARCH_MIN_ITEMS;
  S.accessKey = accessKey;
  S.arrangeSections = arrangeSections;
  S.clamp = clamp;
  S.dayIcon = dayIcon;
  S.dedicatedShortcut = dedicatedShortcut;
  S.doc = doc;
  S.entryText = entryText;
  S.flatten = flatten;
  S.fold = fold;
  S.groupFor = groupFor;
  S.hide = hide;
  S.iconFor = iconFor;
  S.isSeparator = isSeparator;
  S.levenshtein = levenshtein;
  S.lookup = lookup;
  S.normalizeItems = normalizeItems;
  S.positionMenu = positionMenu;
  S.rank = rank;
  S.rowForKey = rowForKey;
  S.runItem = runItem;
  S.shortcutLetters = shortcutLetters;
  S.tokenCost = tokenCost;
})(typeof window !== 'undefined' ? window : this);
