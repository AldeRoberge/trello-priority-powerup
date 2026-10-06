/* Shared right-click context menu for accordion / Gantt section heads. */
(function (global) {
  'use strict';

  var MENU_CLASS = 'tp-context-menu';
  var ITEM_CLASS = 'tp-context-menu-item';
  var activeMenu = null;
  var activeCleanup = null;

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
        keywords: it.keywords ? String(it.keywords) : '',
        checked: !!it.checked,
        disabled: !!it.disabled,
        danger: !!it.danger,
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
    if (activeCleanup) {
      try {
        activeCleanup();
      } catch (e) {
        /* ignore */
      }
      activeCleanup = null;
    }
    if (activeMenu && activeMenu.parentNode) {
      try {
        activeMenu.parentNode.removeChild(activeMenu);
      } catch (e2) {
        /* ignore */
      }
    }
    activeMenu = null;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function positionMenu(menuEl, clientX, clientY) {
    var d = doc();
    var vw = (global.innerWidth || (d.documentElement && d.documentElement.clientWidth) || 800);
    var vh = (global.innerHeight || (d.documentElement && d.documentElement.clientHeight) || 600);
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

  /**
   * Item: { id, label, icon?, group?, hint?, keywords?, checked?, danger?, disabled?,
   * action?, children? } or { sep: true }. `children` opens a submenu (flyout).
   * Icons are Tabler webfont names; missing ones are derived from the id.
   * @param {{ clientX: number, clientY: number }|Event} point
   * @param {Array} items
   */
  function show(point, items) {
    hide();
    var normalized = normalizeItems(items);
    if (!normalized.length) return null;

    var d = doc();
    if (!d || typeof d.createElement !== 'function') return null;

    var clientX =
      point && typeof point.clientX === 'number'
        ? point.clientX
        : point && point.touches && point.touches[0]
          ? point.touches[0].clientX
          : 0;
    var clientY =
      point && typeof point.clientY === 'number'
        ? point.clientY
        : point && point.touches && point.touches[0]
          ? point.touches[0].clientY
          : 0;

    var leaves = flatten(normalized);
    var sections = arrangeSections(normalized);
    var searchable = leaves.length >= SEARCH_MIN_ITEMS;

    var menu = d.createElement('div');
    menu.className = MENU_CLASS;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('tabindex', '-1');

    var input = null;
    if (searchable) {
      var searchWrap = d.createElement('div');
      searchWrap.className = 'tp-context-menu-search';
      var searchIcon = d.createElement('i');
      searchIcon.className = 'ti ti-search tp-context-menu-search-icon';
      searchIcon.setAttribute('aria-hidden', 'true');
      searchWrap.appendChild(searchIcon);
      input = d.createElement('input');
      input.type = 'text';
      input.className = 'tp-context-menu-search-input';
      input.placeholder = 'Rechercher une action…';
      input.setAttribute('aria-label', 'Rechercher une action');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      searchWrap.appendChild(input);
      menu.appendChild(searchWrap);
    }

    var list = d.createElement('div');
    list.className = 'tp-context-menu-list';
    menu.appendChild(list);

    var nav = { rows: [], cursor: -1, sub: null, subRows: [], subCursor: -1, subOwner: null };

    function closeSub() {
      if (nav.sub && nav.sub.parentNode) nav.sub.parentNode.removeChild(nav.sub);
      if (nav.subOwner) nav.subOwner.classList.remove('is-open');
      nav.sub = null;
      nav.subRows = [];
      nav.subCursor = -1;
      nav.subOwner = null;
      subEl = null;
    }
    var subEl = null;

    function setActive(rows, i, isSub) {
      var prev = isSub ? nav.subCursor : nav.cursor;
      if (rows[prev]) rows[prev].el.classList.remove('is-active');
      if (isSub) nav.subCursor = i;
      else nav.cursor = i;
      if (rows[i]) {
        rows[i].el.classList.add('is-active');
        if (typeof rows[i].el.scrollIntoView === 'function') {
          rows[i].el.scrollIntoView({ block: 'nearest' });
        }
      }
    }

    function makeRow(item, opts) {
      opts = opts || {};
      var btn = d.createElement('button');
      btn.type = 'button';
      btn.className =
        ITEM_CLASS + (item.danger ? ' is-danger' : '') + (item.checked ? ' is-checked' : '');
      btn.setAttribute('role', 'menuitem');
      btn.dataset.contextAction = item.id;
      if (item.disabled) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
      var ic = d.createElement('i');
      ic.className = 'ti ti-' + iconFor(item) + ' tp-context-menu-icon';
      ic.setAttribute('aria-hidden', 'true');
      btn.appendChild(ic);
      var lab = d.createElement('span');
      lab.className = 'tp-context-menu-item-label';
      lab.textContent = item.label;
      btn.appendChild(lab);
      var hint = opts.hint || item.hint;
      if (hint) {
        var h = d.createElement('span');
        h.className = 'tp-context-menu-hint';
        h.textContent = hint;
        btn.appendChild(h);
      }
      if (item.checked) {
        var ck = d.createElement('i');
        ck.className = 'ti ti-check tp-context-menu-check';
        ck.setAttribute('aria-hidden', 'true');
        btn.appendChild(ck);
      }
      if (item.children) {
        var ch = d.createElement('i');
        ch.className = 'ti ti-chevron-right tp-context-menu-chevron';
        ch.setAttribute('aria-hidden', 'true');
        btn.appendChild(ch);
      }
      return btn;
    }

    function openSub(rowEntry) {
      var item = rowEntry.item;
      if (!item.children || item.disabled) return;
      if (nav.subOwner === rowEntry.el) return;
      closeSub();
      var fly = d.createElement('div');
      fly.className = MENU_CLASS + ' tp-context-submenu';
      fly.setAttribute('role', 'menu');
      var flyList = d.createElement('div');
      flyList.className = 'tp-context-menu-list';
      fly.appendChild(flyList);
      var subRows = [];
      item.children.forEach(function (child) {
        if (child.sep) {
          var sep = d.createElement('hr');
          sep.className = 'tp-context-menu-sep';
          sep.setAttribute('role', 'separator');
          flyList.appendChild(sep);
          return;
        }
        var btn = makeRow(child);
        var idx = subRows.length;
        btn.addEventListener('click', function (e) {
          if (e) {
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
          }
          runItem(child);
        });
        btn.addEventListener('mousemove', function () {
          if (nav.subCursor !== idx && !child.disabled) setActive(subRows, idx, true);
        });
        subRows.push({ el: btn, item: child });
        flyList.appendChild(btn);
      });
      (d.body || d.documentElement).appendChild(fly);
      var rect =
        typeof rowEntry.el.getBoundingClientRect === 'function'
          ? rowEntry.el.getBoundingClientRect()
          : { left: clientX, right: clientX + 200, top: clientY };
      var vw = global.innerWidth || 800;
      var vh = global.innerHeight || 600;
      fly.style.visibility = 'hidden';
      fly.style.left = '0px';
      fly.style.top = '0px';
      var fw = fly.offsetWidth || 200;
      var fh = fly.offsetHeight || 120;
      var left = rect.right + 2;
      if (left + fw > vw - 8) left = Math.max(8, rect.left - fw - 2);
      var top = clamp(rect.top - 6, 8, Math.max(8, vh - fh - 8));
      fly.style.left = Math.round(left) + 'px';
      fly.style.top = Math.round(top) + 'px';
      fly.style.visibility = '';
      rowEntry.el.classList.add('is-open');
      nav.sub = fly;
      nav.subRows = subRows;
      nav.subOwner = rowEntry.el;
      subEl = fly;
    }

    function appendSeparator() {
      var sep = d.createElement('hr');
      sep.className = 'tp-context-menu-sep';
      sep.setAttribute('role', 'separator');
      list.appendChild(sep);
    }

    function addRow(item, opts) {
      var btn = makeRow(item, opts);
      var entry = { el: btn, item: item };
      var idx = nav.rows.length;
      btn.addEventListener('click', function (e) {
        if (e) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
        }
        if (item.children) {
          openSub(entry);
          return;
        }
        runItem(item);
      });
      btn.addEventListener('mousemove', function () {
        if (item.disabled) return;
        if (nav.cursor !== idx) setActive(nav.rows, idx, false);
        if (item.children) openSub(entry);
        else if (nav.sub && !nav.sub.contains(btn)) closeSub();
      });
      nav.rows.push(entry);
      list.appendChild(btn);
    }

    function firstEnabled(rows) {
      for (var i = 0; i < rows.length; i++) if (!rows[i].item.disabled) return i;
      return -1;
    }

    function render(query) {
      closeSub();
      list.textContent = '';
      nav.rows = [];
      nav.cursor = -1;
      query = String(query || '').trim();
      if (query) {
        var hits = rank(query, leaves, entryText);
        if (!hits.length) {
          var empty = d.createElement('div');
          empty.className = 'tp-context-menu-empty';
          empty.textContent = 'Aucun résultat';
          list.appendChild(empty);
          return;
        }
        hits.forEach(function (hit) {
          addRow(hit.item, { hint: hit.parent ? hit.parent.label : groupFor(hit.item) });
        });
        setActive(nav.rows, firstEnabled(nav.rows), false);
        return;
      }
      if (sections) {
        sections.forEach(function (section) {
          var head = d.createElement('div');
          head.className = 'tp-context-menu-group';
          head.setAttribute('role', 'presentation');
          head.textContent = section.name;
          list.appendChild(head);
          section.items.forEach(function (item) {
            addRow(item);
          });
        });
        return;
      }
      normalized.forEach(function (item) {
        if (item.sep) appendSeparator();
        else addRow(item);
      });
    }

    render('');
    if (input) {
      input.addEventListener('input', function () {
        render(input.value);
      });
    }

    (d.body || d.documentElement).appendChild(menu);
    activeMenu = menu;
    positionMenu(menu, clientX, clientY);
    if (input && typeof input.focus === 'function') {
      try {
        input.focus();
      } catch (e0) {
        /* ignore */
      }
    }

    function move(step) {
      var useSub = !!(nav.sub && nav.subCursor >= 0);
      var rows = useSub ? nav.subRows : nav.rows;
      var cur = useSub ? nav.subCursor : nav.cursor;
      var enabled = [];
      rows.forEach(function (r, i) {
        if (!r.item.disabled) enabled.push(i);
      });
      if (!enabled.length) return;
      var pos = enabled.indexOf(cur);
      var next =
        pos < 0
          ? step > 0
            ? enabled[0]
            : enabled[enabled.length - 1]
          : enabled[(pos + step + enabled.length) % enabled.length];
      setActive(rows, next, useSub);
    }

    function inMenus(target) {
      if (!target) return false;
      if (activeMenu && activeMenu.contains && activeMenu.contains(target)) return true;
      return !!(subEl && subEl.contains && subEl.contains(target));
    }

    function onKey(e) {
      if (!activeMenu) return;
      var k = e.key || '';
      if (k === 'Escape') {
        e.preventDefault();
        if (nav.sub) {
          closeSub();
          return;
        }
        hide();
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        move(k === 'ArrowDown' ? 1 : -1);
      } else if (k === 'ArrowRight') {
        var cur = nav.rows[nav.cursor];
        if (cur && cur.item.children) {
          e.preventDefault();
          openSub(cur);
          if (nav.subRows.length) setActive(nav.subRows, firstEnabled(nav.subRows), true);
        }
      } else if (k === 'ArrowLeft') {
        if (nav.sub) {
          e.preventDefault();
          closeSub();
        }
      } else if (k === 'Enter') {
        var target =
          nav.sub && nav.subCursor >= 0 ? nav.subRows[nav.subCursor] : nav.rows[nav.cursor];
        if (target) {
          e.preventDefault();
          if (target.item.children) openSub(target);
          else runItem(target.item);
        }
      } else if (
        input &&
        k.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        d.activeElement !== input &&
        typeof input.focus === 'function'
      ) {
        input.focus();
      }
    }

    function onPointerDown(e) {
      if (!activeMenu) return;
      if (inMenus(e && e.target)) return;
      hide();
    }

    function onScroll(e) {
      if (e && inMenus(e.target)) return;
      hide();
    }

    // Defer outside listeners so the opening contextmenu event does not close us.
    var bindTimer = global.setTimeout(function () {
      d.addEventListener('mousedown', onPointerDown, true);
      d.addEventListener('contextmenu', onPointerDown, true);
      d.addEventListener('keydown', onKey, true);
      global.addEventListener('scroll', onScroll, true);
      global.addEventListener('resize', onScroll, true);
    }, 0);

    activeCleanup = function () {
      global.clearTimeout(bindTimer);
      closeSub();
      d.removeEventListener('mousedown', onPointerDown, true);
      d.removeEventListener('contextmenu', onPointerDown, true);
      d.removeEventListener('keydown', onKey, true);
      global.removeEventListener('scroll', onScroll, true);
      global.removeEventListener('resize', onScroll, true);
    };

    return menu;
  }

  function isNativeEditableTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    if (typeof target.closest === 'function') {
      return !!target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
      );
    }
    return false;
  }

  /**
   * @param {Element} el
   * @param {function(Event): Array} getItems
   * @returns {function()} unbind
   */
  function bind(el, getItems) {
    if (!el || typeof el.addEventListener !== 'function') {
      return function () {};
    }
    if (typeof getItems !== 'function') {
      return function () {};
    }

    function onContextMenu(e) {
      if (isNativeEditableTarget(e && e.target)) return;
      var items = getItems(e);
      items = normalizeItems(items);
      if (!items.length) return;
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      show(e, items);
    }

    el.addEventListener('contextmenu', onContextMenu);
    return function unbind() {
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }

  /** Expand / collapse toggle item for accordion chrome. */
  function buildExpandToggleItem(opts) {
    opts = opts || {};
    var expanded =
      typeof opts.isExpanded === 'function' ? !!opts.isExpanded() : !!opts.expanded;
    var collapseLabel = opts.collapseLabel || 'Replier';
    var expandLabel = opts.expandLabel || 'D\u00e9velopper';
    return {
      id: 'toggle-expand',
      label: expanded ? collapseLabel : expandLabel,
      action: function () {
        if (typeof opts.setExpanded === 'function') {
          opts.setExpanded(!expanded);
        }
      },
    };
  }

  /** Assistant / AI section quick actions. */
  function buildAgentItems(opts) {
    opts = opts || {};
    var items = [];
    if (!opts.hideCollapse) {
      items.push(
        buildExpandToggleItem({
          isExpanded: opts.isExpanded,
          setExpanded: opts.setExpanded,
          collapseLabel: opts.collapseLabel || 'Replier Assistant',
          expandLabel: opts.expandLabel || 'D\u00e9velopper Assistant',
        })
      );
      items.push({ sep: true });
    }
    items.push({
      id: 'edit-settings',
      label: 'Modifier les param\u00e8tres',
      action: function () {
        if (typeof opts.setExpanded === 'function') opts.setExpanded(true);
        if (typeof opts.openSettings === 'function') opts.openSettings();
      },
    });
    items.push({
      id: 'open-memory',
      label: 'Ouvrir la m\u00e9moire',
      action: function () {
        if (typeof opts.setExpanded === 'function') opts.setExpanded(true);
        if (typeof opts.openSettings === 'function') {
          opts.openSettings({ memory: true, mountMemory: 'ongoing' });
        }
      },
    });
    if (typeof opts.focusComposer === 'function') {
      items.push({
        id: 'focus-composer',
        label: 'Focus composer',
        action: function () {
          if (typeof opts.setExpanded === 'function') opts.setExpanded(true);
          opts.focusComposer();
        },
      });
    }
    return items;
  }

  /** Résumé overview quick actions. */
  function buildOverviewItems(opts) {
    opts = opts || {};
    var data = typeof opts.getData === 'function' ? opts.getData() || {} : {};
    var isBlocked = !!(data.progressBlocked || data.statusCategory === 'blocked');
    var isDone =
      !!(data.statusCategory === 'completed') ||
      (data.progressPercent != null && Number(data.progressPercent) >= 100);
    var dueDays = data.dueDays;
    var onAction = typeof opts.onAction === 'function' ? opts.onAction : function () {};

    var items = [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier R\u00e9sum\u00e9',
        expandLabel: 'D\u00e9velopper R\u00e9sum\u00e9',
      }),
      { sep: true },
    ];

    if (!isDone) {
      items.push({
        id: 'complete',
        label: 'Terminer la carte',
        action: function () {
          onAction('complete');
        },
      });
    }

    if (isBlocked) {
      items.push({
        id: 'unblock',
        label: 'Marquer d\u00e9bloqu\u00e9',
        action: function () {
          onAction('unblock');
        },
      });
    } else if (!isDone) {
      items.push({
        id: 'block',
        label: 'Mettre en attente\u2026',
        action: function () {
          onAction('block');
        },
      });
    }

    items.push({
      id: 'add-subtask',
      label: 'Ajouter une sous-t\u00e2che',
      action: function () {
        onAction('add-subtask');
      },
    });

    var postponeEnabled =
      dueDays != null && isFinite(dueDays) && Number(dueDays) <= 0;
    items.push({
      id: 'postpone-tomorrow',
      label: 'Reporter \u00e0 demain',
      disabled: !postponeEnabled,
      action: function () {
        onAction('postpone-tomorrow');
      },
    });

    return items;
  }

  /** Due section quick date presets + clear. */
  function buildDueItems(opts) {
    opts = opts || {};
    var suggestions = Array.isArray(opts.suggestions) ? opts.suggestions : [];
    var items = [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier \u00c9ch\u00e9ance',
        expandLabel: 'D\u00e9velopper \u00c9ch\u00e9ance',
      }),
      { sep: true },
    ];
    for (var i = 0; i < suggestions.length; i++) {
      (function (sug) {
        items.push({
          id: 'due-quick:' + sug.id,
          label: sug.label || sug.id,
          action: function () {
            if (typeof opts.applyQuick === 'function') opts.applyQuick(sug.id);
          },
        });
      })(suggestions[i]);
    }
    items.push({
      id: 'clear-due',
      label: 'Effacer l\u2019\u00e9ch\u00e9ance',
      danger: true,
      disabled: !!opts.clearDisabled,
      action: function () {
        if (typeof opts.clearDue === 'function') opts.clearDue();
      },
    });
    return items;
  }

  /** Progress section quick actions. */
  function buildProgressItems(opts) {
    opts = opts || {};
    var isBlocked = !!opts.isBlocked;
    var items = [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier Progr\u00e8s',
        expandLabel: 'D\u00e9velopper Progr\u00e8s',
      }),
      { sep: true },
      {
        id: 'complete-all',
        label: 'Tout terminer',
        action: function () {
          if (typeof opts.completeAll === 'function') opts.completeAll();
        },
      },
      {
        id: 'reset-all',
        label: 'Tout r\u00e9initialiser',
        action: function () {
          if (typeof opts.resetAll === 'function') opts.resetAll();
        },
      },
      {
        id: 'add-subtask',
        label: 'Ajouter une sous-t\u00e2che',
        action: function () {
          if (typeof opts.focusAdd === 'function') opts.focusAdd();
        },
      },
    ];
    if (isBlocked) {
      items.push({
        id: 'unblock',
        label: 'D\u00e9bloquer',
        action: function () {
          if (typeof opts.setBlocked === 'function') opts.setBlocked(false);
        },
      });
    } else {
      items.push({
        id: 'block',
        label: 'Mettre en attente',
        action: function () {
          if (typeof opts.setBlocked === 'function') opts.setBlocked(true);
        },
      });
    }
    return items;
  }

  /** Info section quick actions. */
  function buildInfoItems(opts) {
    opts = opts || {};
    var items = [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier Plus de d\u00e9tails',
        expandLabel: 'D\u00e9velopper Plus de d\u00e9tails',
      }),
    ];
    if (typeof opts.openGoals === 'function') {
      items.push({ sep: true });
      items.push({
        id: 'open-goals',
        label: 'Objectifs\u2026',
        action: function () {
          opts.openGoals();
        },
      });
    }
    return items;
  }

  /** Historique undo / redo. */
  function buildHistoryItems(opts) {
    opts = opts || {};
    return [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier Historique',
        expandLabel: 'D\u00e9velopper Historique',
      }),
      { sep: true },
      {
        id: 'undo',
        label: 'Annuler',
        disabled: !opts.canUndo,
        action: function () {
          if (typeof opts.undo === 'function') opts.undo();
        },
      },
      {
        id: 'redo',
        label: 'R\u00e9tablir',
        disabled: !opts.canRedo,
        action: function () {
          if (typeof opts.redo === 'function') opts.redo();
        },
      },
    ];
  }

  /** Priority section + calc graph toggle. */
  function buildPriorityItems(opts) {
    opts = opts || {};
    var graphExpanded = !!opts.graphExpanded;
    var items = [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier Priorit\u00e9',
        expandLabel: 'D\u00e9velopper Priorit\u00e9',
      }),
    ];
    if (typeof opts.toggleGraph === 'function') {
      items.push({ sep: true });
      items.push({
        id: 'toggle-graph',
        label: graphExpanded ? 'Masquer le graphique' : 'Afficher le graphique',
        action: function () {
          opts.toggleGraph(!graphExpanded);
        },
      });
    }
    return items;
  }

  /** Gantt state-section header actions. */
  function buildGanttSectionItems(opts) {
    opts = opts || {};
    var sectionKey = opts.sectionKey || 'pending';
    var expanded = !!opts.expanded;
    var selectedCount = opts.selectedCount > 0 ? opts.selectedCount : 0;
    var hideBlocked = !!opts.hideBlocked;
    var items = [
      {
        id: 'toggle-expand',
        label: expanded ? 'Replier' : 'D\u00e9velopper',
        action: function () {
          if (typeof opts.onToggleExpand === 'function') opts.onToggleExpand();
        },
      },
      {
        id: 'collapse-all',
        label: 'Tout replier',
        action: function () {
          if (typeof opts.onCollapseAll === 'function') opts.onCollapseAll();
        },
      },
      {
        id: 'expand-all',
        label: 'Tout d\u00e9velopper',
        action: function () {
          if (typeof opts.onExpandAll === 'function') opts.onExpandAll();
        },
      },
      { sep: true },
      {
        id: 'move-selection',
        label: 'D\u00e9placer la s\u00e9lection ici',
        disabled: selectedCount < 1,
        action: function () {
          if (typeof opts.onMoveSelection === 'function') opts.onMoveSelection();
        },
      },
      {
        id: 'select-cards',
        label: 'S\u00e9lectionner les cartes',
        action: function () {
          if (typeof opts.onSelectCards === 'function') opts.onSelectCards();
        },
      },
    ];
    if (sectionKey === 'blocked') {
      items.push({ sep: true });
      items.push({
        id: 'toggle-hide-blocked',
        label: hideBlocked ? 'Afficher les bloqu\u00e9es' : 'Masquer les bloqu\u00e9es',
        action: function () {
          if (typeof opts.onToggleHideBlocked === 'function') {
            opts.onToggleHideBlocked(!hideBlocked);
          }
        },
      });
    }
    return items;
  }

  /** Overview task row. */
  function buildOverviewTaskItems(opts) {
    opts = opts || {};
    var done = !!opts.done;
    var blocked = !!opts.blocked;
    var items = [];
    if (blocked) {
      items.push({
        id: 'toggle-task',
        label: 'D\u00e9bloquer',
        action: function () {
          if (typeof opts.onToggle === 'function') opts.onToggle();
        },
      });
    } else {
      items.push({
        id: 'toggle-task',
        label: done ? 'Marquer non fait' : 'Marquer termin\u00e9',
        action: function () {
          if (typeof opts.onToggle === 'function') opts.onToggle();
        },
      });
    }
    items.push({
      id: 'jump-progress',
      label: 'Aller \u00e0 Progr\u00e8s',
      action: function () {
        if (typeof opts.onJumpProgress === 'function') opts.onJumpProgress();
      },
    });
    return items;
  }

  /** Completion master / linked subtask row. */
  function buildCompletionItemItems(opts) {
    opts = opts || {};
    var done = !!opts.done;
    var blocked = !!opts.blocked;
    var linked = !!opts.linked;
    var items = [];
    items.push({
      id: 'toggle-done',
      label: done ? 'Marquer non termin\u00e9' : 'Marquer termin\u00e9',
      disabled: !!opts.toggleDisabled,
      action: function () {
        if (typeof opts.onToggleDone === 'function') opts.onToggleDone();
      },
    });
    if (!linked) {
      items.push({
        id: 'toggle-blocked',
        label: blocked ? 'D\u00e9bloquer' : 'Bloquer',
        disabled: !!done,
        action: function () {
          if (typeof opts.onToggleBlocked === 'function') opts.onToggleBlocked();
        },
      });
      items.push({
        id: 'show-progress',
        label: 'Afficher le progr\u00e8s',
        action: function () {
          if (typeof opts.onShowProgress === 'function') opts.onShowProgress();
        },
      });
      items.push({
        id: 'add-checklist',
        label: 'Ajouter une sous-sous-t\u00e2che',
        action: function () {
          if (typeof opts.onAddChecklist === 'function') opts.onAddChecklist();
        },
      });
      if (opts.canPromote) {
        items.push({
          id: 'promote',
          label: 'Convertir en carte',
          action: function () {
            if (typeof opts.onPromote === 'function') opts.onPromote();
          },
        });
      }
    } else {
      items.push({
        id: 'open-linked',
        label: 'Ouvrir la carte li\u00e9e',
        action: function () {
          if (typeof opts.onOpenLinked === 'function') opts.onOpenLinked();
        },
      });
    }
    items.push({ sep: true });
    items.push({
      id: 'delete',
      label: linked ? 'Retirer le lien' : 'Supprimer',
      danger: true,
      action: function () {
        if (typeof opts.onDelete === 'function') opts.onDelete();
      },
    });
    return items;
  }

  /** Nested checklist item. */
  function buildChecklistItemItems(opts) {
    opts = opts || {};
    var done = !!opts.done;
    return [
      {
        id: 'toggle-done',
        label: done ? 'Marquer non termin\u00e9' : 'Marquer termin\u00e9',
        action: function () {
          if (typeof opts.onToggleDone === 'function') opts.onToggleDone();
        },
      },
      {
        id: 'show-progress',
        label: 'Afficher le progr\u00e8s',
        action: function () {
          if (typeof opts.onShowProgress === 'function') opts.onShowProgress();
        },
      },
      { sep: true },
      {
        id: 'delete',
        label: 'Supprimer',
        danger: true,
        action: function () {
          if (typeof opts.onDelete === 'function') opts.onDelete();
        },
      },
    ];
  }

  /** Statut list chip. */
  function buildStatutChipItems(opts) {
    opts = opts || {};
    var name = opts.listName || 'cette liste';
    var items = [
      {
        id: 'select-list',
        label: 'S\u00e9lectionner \u00ab\u00a0' + name + '\u00a0\u00bb',
        disabled: !!opts.selected || !!opts.busy,
        action: function () {
          if (typeof opts.onSelect === 'function') opts.onSelect();
        },
      },
    ];
    if (typeof opts.onOpenSettings === 'function') {
      items.push({
        id: 'open-settings',
        label: 'Personnaliser les statuts\u2026',
        action: function () {
          opts.onOpenSettings();
        },
      });
    }
    return items;
  }

  /** Heat / priority tier segment. */
  function buildHeatSegmentItems(opts) {
    opts = opts || {};
    var segments = Array.isArray(opts.segments) ? opts.segments : [];
    var items = [];
    for (var i = 0; i < segments.length; i++) {
      (function (seg) {
        items.push({
          id: 'heat:' + (seg.i != null ? seg.i : seg.label),
          label: seg.label || String(seg.target),
          action: function () {
            if (typeof opts.onPick === 'function') opts.onPick(seg);
          },
        });
      })(segments[i]);
    }
    if (typeof opts.onExplain === 'function') {
      if (items.length) items.push({ sep: true });
      items.push({
        id: 'explain-score',
        label: 'Comment ce score est calcul\u00e9',
        action: function () {
          opts.onExplain();
        },
      });
    }
    return items;
  }

  /** Agent message bubble. */
  function buildAgentMessageItems(opts) {
    opts = opts || {};
    var role = opts.role || 'assistant';
    var items = [];
    if (role === 'user') {
      items.push({
        id: 'edit-resume',
        label: 'Modifier et reprendre',
        action: function () {
          if (typeof opts.onEditResume === 'function') opts.onEditResume();
        },
      });
    }
    items.push({
      id: 'copy',
      label: 'Copier',
      disabled: !opts.canCopy,
      action: function () {
        if (typeof opts.onCopy === 'function') opts.onCopy();
      },
    });
    if (role === 'assistant' && opts.canFeedback) {
      items.push({ sep: true });
      items.push({
        id: 'feedback-up',
        label: 'Bonne r\u00e9ponse',
        action: function () {
          if (typeof opts.onFeedbackUp === 'function') opts.onFeedbackUp();
        },
      });
      items.push({
        id: 'feedback-down',
        label: 'Mauvaise r\u00e9ponse',
        action: function () {
          if (typeof opts.onFeedbackDown === 'function') opts.onFeedbackDown();
        },
      });
    }
    return items;
  }

  /** Gantt card / subtask label row. */
  function buildGanttCardItems(opts) {
    opts = opts || {};
    var selected = !!opts.selected;
    var items = [];
    if (opts.kind === 'card' && opts.cardId) {
      items.push({
        id: 'open-card',
        label: 'Ouvrir la carte',
        action: function () {
          if (typeof opts.onOpen === 'function') opts.onOpen();
        },
      });
    }
    items.push({
      id: 'toggle-select',
      label: selected ? 'D\u00e9s\u00e9lectionner' : 'S\u00e9lectionner',
      action: function () {
        if (typeof opts.onToggleSelect === 'function') opts.onToggleSelect();
      },
    });
    if (opts.expandable) {
      items.push({
        id: 'toggle-expand',
        label: opts.expanded ? 'Replier' : 'D\u00e9velopper',
        action: function () {
          if (typeof opts.onToggleExpand === 'function') opts.onToggleExpand();
        },
      });
    }
    if (opts.kind === 'card') {
      items.push({ sep: true });
      items.push({
        id: 'mini-blocked',
        label: 'Bloquer\u2026',
        action: function () {
          if (typeof opts.onMiniBlocked === 'function') opts.onMiniBlocked();
        },
      });
      items.push({
        id: 'mini-priority',
        label: 'Priorit\u00e9\u2026',
        action: function () {
          if (typeof opts.onMiniPriority === 'function') opts.onMiniPriority();
        },
      });
      items.push({
        id: 'mini-progress',
        label: 'Progr\u00e8s\u2026',
        action: function () {
          if (typeof opts.onMiniProgress === 'function') opts.onMiniProgress();
        },
      });
      items.push({
        id: 'mini-due',
        label: '\u00c9ch\u00e9ance\u2026',
        action: function () {
          if (typeof opts.onMiniDue === 'function') opts.onMiniDue();
        },
      });
    }
    if (opts.editable) {
      items.push({ sep: true });
      items.push({
        id: 'toggle-done',
        label: opts.done ? 'Marquer non termin\u00e9' : 'Marquer termin\u00e9',
        action: function () {
          if (typeof opts.onToggleDone === 'function') opts.onToggleDone();
        },
      });
      items.push({
        id: 'delete',
        label: opts.deleteLabel || 'Supprimer',
        danger: true,
        action: function () {
          if (typeof opts.onDelete === 'function') opts.onDelete();
        },
      });
    }
    return items;
  }

  /** Gantt timeline bar. */
  function buildGanttBarItems(opts) {
    opts = opts || {};
    var items = [];
    if (opts.kind === 'card' && opts.cardId) {
      items.push({
        id: 'open-card',
        label: 'Ouvrir la carte',
        action: function () {
          if (typeof opts.onOpen === 'function') opts.onOpen();
        },
      });
    }
    items.push({
      id: 'clear-dates',
      label: 'Effacer les dates',
      danger: true,
      disabled: !!opts.clearDisabled,
      action: function () {
        if (typeof opts.onClearDates === 'function') opts.onClearDates();
      },
    });
    return items;
  }

  /** History entry row. */
  function buildHistoryEntryItems(opts) {
    opts = opts || {};
    var undone = !!opts.undone;
    var open = !!opts.open;
    return [
      {
        id: 'toggle-details',
        label: open ? 'Masquer les d\u00e9tails' : 'Afficher les d\u00e9tails',
        action: function () {
          if (typeof opts.onToggleDetails === 'function') opts.onToggleDetails();
        },
      },
      {
        id: undone ? 'restore' : 'revert',
        label: undone ? 'R\u00e9tablir' : 'Revenir \u00e0 cet \u00e9tat',
        disabled: !!opts.busy,
        action: function () {
          if (undone) {
            if (typeof opts.onRestore === 'function') opts.onRestore();
          } else if (typeof opts.onRevert === 'function') {
            opts.onRevert();
          }
        },
      },
    ];
  }

  /** Info member / label / task-type chip. */
  function buildInfoChipItems(opts) {
    opts = opts || {};
    var kind = opts.kind || 'label';
    var items = [];
    if (kind === 'member') {
      if (typeof opts.onEditRoles === 'function') {
        items.push({
          id: 'edit-roles',
          label: 'D\u00e9finir les r\u00f4les\u2026',
          action: function () {
            opts.onEditRoles();
          },
        });
      }
      if (typeof opts.onRemove === 'function') {
        items.push({
          id: 'remove',
          label: 'Retirer',
          danger: true,
          action: function () {
            opts.onRemove();
          },
        });
      }
    } else if (kind === 'label') {
      if (typeof opts.onEdit === 'function') {
        items.push({
          id: 'edit',
          label: 'Modifier l\u2019\u00e9tiquette\u2026',
          action: function () {
            opts.onEdit();
          },
        });
      }
      if (typeof opts.onRemove === 'function') {
        items.push({
          id: 'remove',
          label: 'Retirer de cette carte',
          danger: true,
          action: function () {
            opts.onRemove();
          },
        });
      }
    } else if (kind === 'task-type') {
      if (typeof opts.onRemove === 'function') {
        items.push({
          id: 'remove',
          label: 'Retirer',
          danger: true,
          action: function () {
            opts.onRemove();
          },
        });
      }
    }
    return items;
  }

  /** Shared bulk-selection toolbar (completion or gantt). */
  function buildBulkActionItems(opts) {
    opts = opts || {};
    var count = opts.count > 0 ? opts.count : 0;
    var items = [];
    if (count > 0) {
      items.push({
        id: 'bulk-count',
        label: count + ' s\u00e9lectionn\u00e9e(s)',
        disabled: true,
        action: function () {},
      });
      items.push({ sep: true });
    }
    items.push({
      id: 'bulk-done',
      label: 'Terminer',
      disabled: count < 1,
      action: function () {
        if (typeof opts.onDone === 'function') opts.onDone();
      },
    });
    items.push({
      id: 'bulk-reopen',
      label: 'Rouvrir',
      disabled: count < 1,
      action: function () {
        if (typeof opts.onReopen === 'function') opts.onReopen();
      },
    });
    items.push({
      id: 'bulk-delete',
      label: 'Supprimer',
      danger: true,
      disabled: count < 1,
      action: function () {
        if (typeof opts.onDelete === 'function') opts.onDelete();
      },
    });
    items.push({
      id: 'bulk-clear',
      label: 'Tout d\u00e9s\u00e9lectionner',
      disabled: count < 1,
      action: function () {
        if (typeof opts.onClear === 'function') opts.onClear();
      },
    });
    if (typeof opts.onSelectAll === 'function') {
      items.push({
        id: 'bulk-select-all',
        label: 'Tout s\u00e9lectionner',
        action: function () {
          opts.onSelectAll();
        },
      });
    }
    return items;
  }

  /** Completion master chrome (check / block / complete-all / reset). */
  function buildCompletionMasterItems(opts) {
    opts = opts || {};
    var done = !!opts.done;
    var blocked = !!opts.blocked;
    var items = [
      {
        id: 'toggle-master',
        label: done ? 'Marquer non termin\u00e9' : 'Marquer termin\u00e9',
        action: function () {
          if (typeof opts.onToggleComplete === 'function') opts.onToggleComplete();
        },
      },
      {
        id: 'toggle-blocked',
        label: blocked ? 'D\u00e9bloquer' : 'Mettre en attente',
        action: function () {
          if (typeof opts.onToggleBlocked === 'function') opts.onToggleBlocked();
        },
      },
      { sep: true },
      {
        id: 'complete-all',
        label: 'Tout terminer',
        action: function () {
          if (typeof opts.onCompleteAll === 'function') opts.onCompleteAll();
        },
      },
      {
        id: 'reset-all',
        label: 'Tout invalider',
        action: function () {
          if (typeof opts.onResetAll === 'function') opts.onResetAll();
        },
      },
    ];
    if (typeof opts.onFocusAdd === 'function') {
      items.push({
        id: 'focus-add',
        label: 'Ajouter une sous-t\u00e2che',
        action: function () {
          opts.onFocusAdd();
        },
      });
    }
    return items;
  }

  /** Gantt toolbar zoom / nav / filters. */
  function buildGanttToolbarItems(opts) {
    opts = opts || {};
    var viewMode = opts.viewMode || 'week';
    var items = [
      {
        id: 'zoom-day',
        label: 'Jour',
        disabled: viewMode === 'day',
        action: function () {
          if (typeof opts.onViewMode === 'function') opts.onViewMode('day');
        },
      },
      {
        id: 'zoom-week',
        label: 'Semaine',
        disabled: viewMode === 'week',
        action: function () {
          if (typeof opts.onViewMode === 'function') opts.onViewMode('week');
        },
      },
      {
        id: 'zoom-month',
        label: 'Mois',
        disabled: viewMode === 'month',
        action: function () {
          if (typeof opts.onViewMode === 'function') opts.onViewMode('month');
        },
      },
      {
        id: 'zoom-year',
        label: 'Ann\u00e9e',
        disabled: viewMode === 'year',
        action: function () {
          if (typeof opts.onViewMode === 'function') opts.onViewMode('year');
        },
      },
      { sep: true },
      {
        id: 'nav-prev',
        label: 'Pr\u00e9c\u00e9dent',
        action: function () {
          if (typeof opts.onPrev === 'function') opts.onPrev();
        },
      },
      {
        id: 'nav-today',
        label: "Aujourd'hui",
        action: function () {
          if (typeof opts.onToday === 'function') opts.onToday();
        },
      },
      {
        id: 'nav-next',
        label: 'Suivant',
        action: function () {
          if (typeof opts.onNext === 'function') opts.onNext();
        },
      },
      { sep: true },
      {
        id: 'filter-completed',
        label: opts.hideCompleted
          ? 'Afficher les termin\u00e9s'
          : 'Masquer les termin\u00e9s',
        action: function () {
          if (typeof opts.onToggleHideCompleted === 'function') {
            opts.onToggleHideCompleted(!opts.hideCompleted);
          }
        },
      },
      {
        id: 'filter-blocked',
        label: opts.hideBlocked
          ? 'Afficher les bloqu\u00e9es'
          : 'Masquer les bloqu\u00e9es',
        action: function () {
          if (typeof opts.onToggleHideBlocked === 'function') {
            opts.onToggleHideBlocked(!opts.hideBlocked);
          }
        },
      },
      {
        id: 'filter-undated',
        label: opts.hideUndated
          ? 'Afficher sans date'
          : 'Masquer sans date',
        action: function () {
          if (typeof opts.onToggleHideUndated === 'function') {
            opts.onToggleHideUndated(!opts.hideUndated);
          }
        },
      },
    ];
    return items;
  }

  /** Agent composer chrome (send + model tiers). */
  function buildAgentComposerItems(opts) {
    opts = opts || {};
    var items = [
      {
        id: 'send',
        label: 'Envoyer',
        disabled: !!opts.sendDisabled,
        action: function () {
          if (typeof opts.onSend === 'function') opts.onSend();
        },
      },
    ];
    var modes = Array.isArray(opts.modes) ? opts.modes : [];
    if (modes.length) {
      items.push({ sep: true });
      for (var i = 0; i < modes.length; i++) {
        (function (mode) {
          items.push({
            id: 'mode:' + mode.id,
            label: mode.label || mode.id,
            disabled: mode.id === opts.currentMode,
            action: function () {
              if (typeof opts.onSetMode === 'function') opts.onSetMode(mode.id);
            },
          });
        })(modes[i]);
      }
    }
    return items;
  }

  /** Priority axis field label help. */
  function buildPriorityFieldItems(opts) {
    opts = opts || {};
    var label = opts.label || 'ce champ';
    return [
      {
        id: 'open-help',
        label: 'Choisir le niveau de ' + label + '\u2026',
        action: function () {
          if (typeof opts.onOpenHelp === 'function') opts.onOpenHelp();
        },
      },
    ];
  }

  /* ── Global fallback: replaces the browser's native menu everywhere ─────── */

  function selectionText(d) {
    try {
      var sel = global.getSelection && global.getSelection();
      return sel ? String(sel.toString()) : '';
    } catch (e) {
      return '';
    }
  }

  function fieldSelection(el) {
    try {
      if (typeof el.selectionStart === 'number' && el.selectionEnd > el.selectionStart) {
        return String(el.value || '').slice(el.selectionStart, el.selectionEnd);
      }
    } catch (e) {
      /* some input types (email, number) throw */
    }
    return '';
  }

  function copyText(d, text) {
    if (!text) return;
    var nav = global.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      nav.clipboard.writeText(text).catch(function () {
        legacyCopy(d);
      });
      return;
    }
    legacyCopy(d);
  }

  function legacyCopy(d) {
    try {
      d.execCommand('copy');
    } catch (e) {
      /* ignore */
    }
  }

  function insertText(d, field, text) {
    if (!text) return;
    field.focus();
    var ok = false;
    try {
      ok = d.execCommand('insertText', false, text);
    } catch (e) {
      ok = false;
    }
    if (!ok && typeof field.setRangeText === 'function') {
      field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
      field.dispatchEvent(new global.Event('input', { bubbles: true }));
    }
  }

  /** Items for a right-click anywhere no specific menu claimed. */
  function buildGenericItems(target, d) {
    d = d || doc();
    var items = [];
    var el = target && target.nodeType === 3 ? target.parentNode : target;
    var closest = function (sel) {
      return el && typeof el.closest === 'function' ? el.closest(sel) : null;
    };

    var link = closest('a[href]');
    if (link) {
      var href = link.href || link.getAttribute('href');
      items.push({
        id: 'open-link',
        label: 'Ouvrir le lien',
        action: function () {
          global.open(href, '_blank', 'noopener');
        },
      });
      items.push({
        id: 'copy-link',
        label: 'Copier l’adresse du lien',
        action: function () {
          copyText(d, href);
        },
      });
    }

    var img = closest('img[src]');
    if (img) {
      if (items.length) items.push({ sep: true });
      items.push({
        id: 'copy-image-url',
        label: 'Copier l’adresse de l’image',
        action: function () {
          copyText(d, img.currentSrc || img.src);
        },
      });
    }

    var field = isNativeEditableTarget(el) ? (closest('input, textarea, [contenteditable]') || el) : null;
    if (field) {
      var tag = String(field.tagName || '').toUpperCase();
      var isSelect = tag === 'SELECT';
      var readOnly = !!(field.readOnly || field.disabled) || isSelect;
      var selected = isSelect ? '' : fieldSelection(field) || selectionText(d);
      if (items.length) items.push({ sep: true });
      if (!isSelect) {
        items.push({
          id: 'undo',
          label: 'Annuler',
          disabled: readOnly,
          action: function () {
            field.focus();
            d.execCommand('undo');
          },
        });
        items.push({
          id: 'redo',
          label: 'Rétablir',
          disabled: readOnly,
          action: function () {
            field.focus();
            d.execCommand('redo');
          },
        });
        items.push({ sep: true });
        items.push({
          id: 'cut',
          label: 'Couper',
          disabled: readOnly || !selected,
          action: function () {
            field.focus();
            copyText(d, selected);
            d.execCommand('delete');
          },
        });
        items.push({
          id: 'copy',
          label: 'Copier',
          disabled: !selected,
          action: function () {
            copyText(d, selected);
          },
        });
        items.push({
          id: 'paste',
          label: 'Coller',
          disabled: readOnly,
          action: function () {
            var nav = global.navigator;
            if (nav && nav.clipboard && typeof nav.clipboard.readText === 'function') {
              nav.clipboard.readText().then(
                function (t) {
                  insertText(d, field, t);
                },
                function () {
                  field.focus();
                  try {
                    d.execCommand('paste');
                  } catch (e) {
                    /* clipboard blocked in this frame */
                  }
                }
              );
            } else {
              field.focus();
              try {
                d.execCommand('paste');
              } catch (e2) {
                /* ignore */
              }
            }
          },
        });
        items.push({
          id: 'select-all',
          label: 'Tout sélectionner',
          action: function () {
            field.focus();
            if (typeof field.select === 'function') field.select();
            else d.execCommand('selectAll');
          },
        });
      }
      return items;
    }

    var text = selectionText(d);
    if (text) {
      if (items.length) items.push({ sep: true });
      items.push({
        id: 'copy',
        label: 'Copier',
        action: function () {
          copyText(d, text);
        },
      });
    }
    if (items.length) items.push({ sep: true });
    items.push({
      id: 'select-all',
      label: 'Tout sélectionner',
      action: function () {
        var body = d.body;
        if (!body) return;
        var range = d.createRange();
        range.selectNodeContents(body);
        var sel = global.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      },
    });
    items.push({
      id: 'reload',
      label: 'Recharger',
      action: function () {
        global.location.reload();
      },
    });
    return items;
  }

  var globalInstalled = null;

  /**
   * Suppress the native context menu document-wide. Specific menus (bind /
   * table menu) run first and call preventDefault; anything left over falls
   * through here and gets the generic menu.
   */
  function installGlobal(d) {
    d = d || doc();
    if (!d || typeof d.addEventListener !== 'function') return function () {};
    if (globalInstalled && globalInstalled.doc === d) return globalInstalled.off;
    function onContextMenu(e) {
      if (!e || e.defaultPrevented) return;
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.' + MENU_CLASS)) {
        e.preventDefault();
        return;
      }
      var items = buildGenericItems(e.target, d);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      show(e, items);
    }
    d.addEventListener('contextmenu', onContextMenu, false);
    var off = function () {
      d.removeEventListener('contextmenu', onContextMenu, false);
      globalInstalled = null;
    };
    globalInstalled = { doc: d, off: off };
    return off;
  }

  global.ContextMenu = {
    dayIcon: dayIcon,
    show: show,
    hide: hide,
    bind: bind,
    isNativeEditableTarget: isNativeEditableTarget,
    buildGenericItems: buildGenericItems,
    installGlobal: installGlobal,
    normalizeItems: normalizeItems,
    flatten: flatten,
    rank: rank,
    fold: fold,
    levenshtein: levenshtein,
    iconFor: iconFor,
    buildExpandToggleItem: buildExpandToggleItem,
    buildAgentItems: buildAgentItems,
    buildOverviewItems: buildOverviewItems,
    buildDueItems: buildDueItems,
    buildProgressItems: buildProgressItems,
    buildInfoItems: buildInfoItems,
    buildHistoryItems: buildHistoryItems,
    buildPriorityItems: buildPriorityItems,
    buildGanttSectionItems: buildGanttSectionItems,
    buildOverviewTaskItems: buildOverviewTaskItems,
    buildCompletionItemItems: buildCompletionItemItems,
    buildChecklistItemItems: buildChecklistItemItems,
    buildStatutChipItems: buildStatutChipItems,
    buildHeatSegmentItems: buildHeatSegmentItems,
    buildAgentMessageItems: buildAgentMessageItems,
    buildGanttCardItems: buildGanttCardItems,
    buildGanttBarItems: buildGanttBarItems,
    buildHistoryEntryItems: buildHistoryEntryItems,
    buildInfoChipItems: buildInfoChipItems,
    buildBulkActionItems: buildBulkActionItems,
    buildCompletionMasterItems: buildCompletionMasterItems,
    buildGanttToolbarItems: buildGanttToolbarItems,
    buildAgentComposerItems: buildAgentComposerItems,
    buildPriorityFieldItems: buildPriorityFieldItems,
  };
  if (global.document && typeof global.document.addEventListener === 'function') {
    installGlobal(global.document);
  }
})(typeof window !== 'undefined' ? window : this);
