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
      if (typeof it.action !== 'function' && !it.disabled) continue;
      out.push({
        id: it.id != null ? String(it.id) : 'item-' + i,
        label: it.label != null ? String(it.label) : '',
        disabled: !!it.disabled,
        danger: !!it.danger,
        action: typeof it.action === 'function' ? it.action : null,
      });
    }
    return out;
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

  /**
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

    var menu = d.createElement('div');
    menu.className = MENU_CLASS;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('tabindex', '-1');

    for (var i = 0; i < normalized.length; i++) {
      (function (item) {
        if (item.sep) {
          var sep = d.createElement('hr');
          sep.className = 'tp-context-menu-sep';
          sep.setAttribute('role', 'separator');
          menu.appendChild(sep);
          return;
        }
        var btn = d.createElement('button');
        btn.type = 'button';
        btn.className = ITEM_CLASS + (item.danger ? ' is-danger' : '');
        btn.setAttribute('role', 'menuitem');
        btn.dataset.contextAction = item.id;
        if (item.disabled) {
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
        }
        var lab = d.createElement('span');
        lab.className = 'tp-context-menu-item-label';
        lab.textContent = item.label;
        btn.appendChild(lab);
        btn.addEventListener('click', function (e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          runItem(item);
        });
        menu.appendChild(btn);
      })(normalized[i]);
    }

    (d.body || d.documentElement).appendChild(menu);
    activeMenu = menu;
    positionMenu(menu, clientX, clientY);

    function onKey(e) {
      if (!activeMenu) return;
      if ((e.key || '') === 'Escape') {
        e.preventDefault();
        hide();
      }
    }

    function onPointerDown(e) {
      if (!activeMenu) return;
      var target = e && e.target;
      if (target && activeMenu.contains && activeMenu.contains(target)) return;
      hide();
    }

    function onScroll() {
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
      d.removeEventListener('mousedown', onPointerDown, true);
      d.removeEventListener('contextmenu', onPointerDown, true);
      d.removeEventListener('keydown', onKey, true);
      global.removeEventListener('scroll', onScroll, true);
      global.removeEventListener('resize', onScroll, true);
    };

    return menu;
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
    items.push(
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: opts.collapseLabel || 'Replier Assistant',
        expandLabel: opts.expandLabel || 'D\u00e9velopper Assistant',
      })
    );
    items.push({ sep: true });
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
        collapseLabel: 'Replier Information',
        expandLabel: 'D\u00e9velopper Information',
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

  global.ContextMenu = {
    show: show,
    hide: hide,
    bind: bind,
    normalizeItems: normalizeItems,
    buildExpandToggleItem: buildExpandToggleItem,
    buildAgentItems: buildAgentItems,
    buildOverviewItems: buildOverviewItems,
    buildDueItems: buildDueItems,
    buildProgressItems: buildProgressItems,
    buildInfoItems: buildInfoItems,
    buildHistoryItems: buildHistoryItems,
    buildPriorityItems: buildPriorityItems,
    buildGanttSectionItems: buildGanttSectionItems,
  };
})(typeof window !== 'undefined' ? window : this);
