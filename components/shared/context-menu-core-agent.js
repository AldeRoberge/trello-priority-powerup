/**
 * context-menu-core: part 2 of 2 (show).
 * Names are shared with the other parts through window.ContextMenuParts (see context-menu-core.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.ContextMenuParts = global.ContextMenuParts || {});

  // from earlier parts (values)
  var ITEM_CLASS = S.ITEM_CLASS;
  var MENU_CLASS = S.MENU_CLASS;
  var SEARCH_MIN_ITEMS = S.SEARCH_MIN_ITEMS;

  // from other parts (functions, resolved at call time)
  function arrangeSections() { return S.arrangeSections.apply(this, arguments); }
  function clamp() { return S.clamp.apply(this, arguments); }
  function doc() { return S.doc.apply(this, arguments); }
  function entryText() { return S.entryText.apply(this, arguments); }
  function flatten() { return S.flatten.apply(this, arguments); }
  function groupFor() { return S.groupFor.apply(this, arguments); }
  function hide() { return S.hide.apply(this, arguments); }
  function iconFor() { return S.iconFor.apply(this, arguments); }
  function normalizeItems() { return S.normalizeItems.apply(this, arguments); }
  function positionMenu() { return S.positionMenu.apply(this, arguments); }
  function rank() { return S.rank.apply(this, arguments); }
  function rowForKey() { return S.rowForKey.apply(this, arguments); }
  function runItem() { return S.runItem.apply(this, arguments); }
  function shortcutLetters() { return S.shortcutLetters.apply(this, arguments); }

  /**
   * Item: { id, label, icon?, group?, hint?, shortcut?, keywords?, checked?, danger?, disabled?,
   * action?, children? } or { sep: true }. `children` opens a submenu (flyout).
   * `shortcut` is one letter that runs the item while the menu is open. Archiver is A.
   * Icons are Tabler webfont names; missing ones are derived from the id.
   * @param {{ clientX: number, clientY: number }|Event} point
   * @param {Array} items
   */
  function show(point, items) {
    hide();
    var normalized = normalizeItems(items);
    if (!normalized.length) return null;
    var taken = shortcutLetters(normalized);

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
        ITEM_CLASS + (item.danger ? ' is-danger' : '') + (item.success ? ' is-success' : '') +
        (item.checked ? ' is-checked' : '');
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
      if (
        !opts.hint &&
        hint &&
        String(hint).trim().length === 1 &&
        taken[String(hint).trim().toUpperCase()] &&
        item.shortcut !== String(hint).trim().toUpperCase()
      ) {
        hint = '';
      }
      var key = item.shortcut || '';
      if (key && String(hint || '').trim().toUpperCase() !== key) {
        var kbd = d.createElement('span');
        kbd.className = 'tp-context-menu-key';
        kbd.textContent = key;
        btn.appendChild(kbd);
        btn.setAttribute('aria-keyshortcuts', key);
      }
      if (hint) {
        var h = d.createElement('span');
        h.className = 'tp-context-menu-hint';
        h.textContent = hint;
        btn.appendChild(h);
        // Long hints get their own line under the label instead of squeezing it.
        if (String(hint).length > 16) btn.classList.add('has-long-hint');
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
    S.activeMenu = menu;
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
      if (S.activeMenu && S.activeMenu.contains && S.activeMenu.contains(target)) return true;
      return !!(subEl && subEl.contains && subEl.contains(target));
    }

    function onKey(e) {
      if (!S.activeMenu) return;
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
      } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !e.isComposing) {
        var filtering = !!(input && String(input.value || '').trim());
        var searchFocused = !!(input && d.activeElement === input);
        var pool = nav.sub ? nav.subRows : nav.rows;
        var hit = rowForKey(pool, k, { filtering: filtering, searchFocused: searchFocused });
        if (hit) {
          e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          if (hit.item.children) {
            openSub(hit);
            if (nav.subRows.length) setActive(nav.subRows, firstEnabled(nav.subRows), true);
          } else runItem(hit.item);
        } else if (input && !searchFocused && typeof input.focus === 'function') {
          input.focus();
        }
      }
    }

    function onPointerDown(e) {
      if (!S.activeMenu) return;
      if (inMenus(e && e.target)) return;
      hide();
    }

    function onScroll(e) {
      if (e && inMenus(e.target)) return;
      // A right-click can scroll the row into view a moment later. Ignore that
      // or the menu disappears as soon as it opens.
      if (Date.now() - openedAt < 400) return;
      hide();
    }

    var openedAt = Date.now();

    // Defer outside listeners so the opening contextmenu event does not close us.
    var bindTimer = global.setTimeout(function () {
      d.addEventListener('mousedown', onPointerDown, true);
      d.addEventListener('contextmenu', onPointerDown, true);
      d.addEventListener('keydown', onKey, true);
      global.addEventListener('scroll', onScroll, true);
      global.addEventListener('resize', onScroll, true);
    }, 0);

    S.activeCleanup = function () {
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
      var items = [];
      try {
        items = getItems(e);
      } catch (err) {
        console.error('ContextMenu items failed', err);
        return;
      }
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

  // exports
  S.bind = bind;
  S.buildAgentItems = buildAgentItems;
  S.buildAgentMessageItems = buildAgentMessageItems;
  S.buildChecklistItemItems = buildChecklistItemItems;
  S.buildCompletionItemItems = buildCompletionItemItems;
  S.buildDueItems = buildDueItems;
  S.buildExpandToggleItem = buildExpandToggleItem;
  S.buildGanttSectionItems = buildGanttSectionItems;
  S.buildHeatSegmentItems = buildHeatSegmentItems;
  S.buildHistoryItems = buildHistoryItems;
  S.buildInfoItems = buildInfoItems;
  S.buildOverviewItems = buildOverviewItems;
  S.buildOverviewTaskItems = buildOverviewTaskItems;
  S.buildPriorityItems = buildPriorityItems;
  S.buildProgressItems = buildProgressItems;
  S.buildStatutChipItems = buildStatutChipItems;
  S.isNativeEditableTarget = isNativeEditableTarget;
  S.show = show;
})(typeof window !== 'undefined' ? window : this);
