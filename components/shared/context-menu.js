/* Shared right-click context menu for accordion / Gantt section heads. */
(function (global) {
  'use strict';

  var MENU_CLASS = 'tp-context-menu';
  var ITEM_CLASS = 'tp-context-menu-item';
  var activeMenu = null;
  var activeCleanup = null;
  var activeFocusIndex = -1;

  function doc() {
    return global.document;
  }

  function isSeparator(item) {
    return !!(item && (item.sep || item.separator || item.type === 'separator'));
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
        icon: it.icon ? String(it.icon) : '',
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
    activeFocusIndex = -1;
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

  function actionableButtons(menuEl) {
    var nodes = menuEl.querySelectorAll('.' + ITEM_CLASS);
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].disabled || nodes[i].getAttribute('aria-disabled') === 'true') {
        continue;
      }
      list.push(nodes[i]);
    }
    return list;
  }

  function setFocused(menuEl, index) {
    var buttons = actionableButtons(menuEl);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-focused', i === index);
    }
    activeFocusIndex = index;
    if (index >= 0 && index < buttons.length && typeof buttons[index].focus === 'function') {
      try {
        buttons[index].focus();
      } catch (e) {
        /* ignore */
      }
    }
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
        if (item.icon) {
          var ic = d.createElement('i');
          ic.className = 'ti ' + item.icon + ' tp-context-menu-item-icon';
          ic.setAttribute('aria-hidden', 'true');
          btn.appendChild(ic);
        }
        var lab = d.createElement('span');
        lab.className = 'tp-context-menu-item-label';
        lab.textContent = item.label;
        btn.appendChild(lab);
        btn.addEventListener('click', function (e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
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
      var key = e.key || '';
      if (key === 'Escape') {
        e.preventDefault();
        hide();
        return;
      }
      var buttons = actionableButtons(activeMenu);
      if (!buttons.length) return;
      if (key === 'ArrowDown') {
        e.preventDefault();
        setFocused(activeMenu, (activeFocusIndex + 1 + buttons.length) % buttons.length);
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        setFocused(
          activeMenu,
          activeFocusIndex <= 0 ? buttons.length - 1 : activeFocusIndex - 1
        );
        return;
      }
      if (key === 'Enter' || key === ' ') {
        if (activeFocusIndex >= 0 && activeFocusIndex < buttons.length) {
          e.preventDefault();
          buttons[activeFocusIndex].click();
        }
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
      d.addEventListener('pointerdown', onPointerDown, true);
      d.addEventListener('contextmenu', onPointerDown, true);
      d.addEventListener('keydown', onKey, true);
      global.addEventListener('scroll', onScroll, true);
      global.addEventListener('resize', onScroll, true);
    }, 0);

    activeCleanup = function () {
      global.clearTimeout(bindTimer);
      d.removeEventListener('mousedown', onPointerDown, true);
      d.removeEventListener('pointerdown', onPointerDown, true);
      d.removeEventListener('contextmenu', onPointerDown, true);
      d.removeEventListener('keydown', onKey, true);
      global.removeEventListener('scroll', onScroll, true);
      global.removeEventListener('resize', onScroll, true);
    };

    setFocused(menu, 0);
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
      icon: expanded ? 'ti-chevron-up' : 'ti-chevron-down',
      action: function () {
        if (typeof opts.setExpanded === 'function') {
          opts.setExpanded(!expanded);
        } else if (typeof opts.onToggle === 'function') {
          opts.onToggle(!expanded);
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
      icon: 'ti-settings',
      action: function () {
        if (typeof opts.setExpanded === 'function') opts.setExpanded(true);
        if (typeof opts.openSettings === 'function') opts.openSettings();
      },
    });
    items.push({
      id: 'open-memory',
      label: 'Ouvrir la m\u00e9moire',
      icon: 'ti-brain',
      action: function () {
        if (typeof opts.setExpanded === 'function') opts.setExpanded(true);
        if (typeof opts.openSettings === 'function') {
          opts.openSettings({ memory: true, mountMemory: 'ongoing' });
        }
      },
    });
    items.push({
      id: 'focus-composer',
      label: 'Focus composer',
      icon: 'ti-pencil',
      action: function () {
        if (typeof opts.setExpanded === 'function') opts.setExpanded(true);
        if (typeof opts.focusComposer === 'function') opts.focusComposer();
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
        icon: 'ti-circle-check',
        action: function () {
          onAction('complete');
        },
      });
    }

    if (isBlocked) {
      items.push({
        id: 'unblock',
        label: 'Marquer d\u00e9bloqu\u00e9',
        icon: 'ti-player-play',
        action: function () {
          onAction('unblock');
        },
      });
    } else if (!isDone) {
      items.push({
        id: 'block',
        label: 'Mettre en attente\u2026',
        icon: 'ti-player-pause',
        action: function () {
          onAction('block');
        },
      });
    }

    items.push({
      id: 'add-subtask',
      label: 'Ajouter une sous-t\u00e2che',
      icon: 'ti-plus',
      action: function () {
        onAction('add-subtask');
      },
    });

    var postponeEnabled =
      dueDays != null && isFinite(dueDays) && Number(dueDays) <= 0;
    items.push({
      id: 'postpone-tomorrow',
      label: 'Reporter \u00e0 demain',
      icon: 'ti-calendar-plus',
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
          icon: 'ti-calendar-event',
          action: function () {
            if (typeof opts.applyQuick === 'function') opts.applyQuick(sug.id);
          },
        });
      })(suggestions[i]);
    }
    items.push({
      id: 'clear-due',
      label: 'Effacer l\u2019\u00e9ch\u00e9ance',
      icon: 'ti-trash',
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
        icon: 'ti-checks',
        action: function () {
          if (typeof opts.completeAll === 'function') opts.completeAll();
        },
      },
      {
        id: 'reset-all',
        label: 'Tout r\u00e9initialiser',
        icon: 'ti-refresh',
        action: function () {
          if (typeof opts.resetAll === 'function') opts.resetAll();
        },
      },
      {
        id: 'add-subtask',
        label: 'Ajouter une sous-t\u00e2che',
        icon: 'ti-plus',
        action: function () {
          if (typeof opts.focusAdd === 'function') opts.focusAdd();
        },
      },
    ];
    if (isBlocked) {
      items.push({
        id: 'unblock',
        label: 'D\u00e9bloquer',
        icon: 'ti-player-play',
        action: function () {
          if (typeof opts.setBlocked === 'function') opts.setBlocked(false);
        },
      });
    } else {
      items.push({
        id: 'block',
        label: 'Mettre en attente',
        icon: 'ti-player-pause',
        action: function () {
          if (typeof opts.setBlocked === 'function') opts.setBlocked(true);
        },
      });
    }
    return items;
  }

  /** Info section focus helpers. */
  function buildInfoItems(opts) {
    opts = opts || {};
    var items = [
      buildExpandToggleItem({
        isExpanded: opts.isExpanded,
        setExpanded: opts.setExpanded,
        collapseLabel: 'Replier Information',
        expandLabel: 'D\u00e9velopper Information',
      }),
      { sep: true },
      {
        id: 'focus-title',
        label: 'Focus titre',
        icon: 'ti-cursor-text',
        action: function () {
          if (typeof opts.focusTitle === 'function') opts.focusTitle();
        },
      },
      {
        id: 'focus-desc',
        label: 'Focus description',
        icon: 'ti-align-left',
        action: function () {
          if (typeof opts.focusDesc === 'function') opts.focusDesc();
        },
      },
    ];
    if (typeof opts.openGoals === 'function') {
      items.push({
        id: 'open-goals',
        label: 'Objectifs\u2026',
        icon: 'ti-target',
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
        icon: 'ti-arrow-back-up',
        disabled: !opts.canUndo,
        action: function () {
          if (typeof opts.undo === 'function') opts.undo();
        },
      },
      {
        id: 'redo',
        label: 'R\u00e9tablir',
        icon: 'ti-arrow-forward-up',
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
        icon: 'ti-chart-dots-3',
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
        icon: expanded ? 'ti-chevron-up' : 'ti-chevron-down',
        action: function () {
          if (typeof opts.onToggleExpand === 'function') opts.onToggleExpand();
        },
      },
      {
        id: 'collapse-all',
        label: 'Tout replier',
        icon: 'ti-fold',
        action: function () {
          if (typeof opts.onCollapseAll === 'function') opts.onCollapseAll();
        },
      },
      {
        id: 'expand-all',
        label: 'Tout d\u00e9velopper',
        icon: 'ti-fold-down',
        action: function () {
          if (typeof opts.onExpandAll === 'function') opts.onExpandAll();
        },
      },
      { sep: true },
      {
        id: 'move-selection',
        label: 'D\u00e9placer la s\u00e9lection ici',
        icon: 'ti-arrow-right',
        disabled: selectedCount < 1,
        action: function () {
          if (typeof opts.onMoveSelection === 'function') opts.onMoveSelection();
        },
      },
      {
        id: 'select-cards',
        label: 'S\u00e9lectionner les cartes',
        icon: 'ti-checkbox',
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
        icon: hideBlocked ? 'ti-eye' : 'ti-eye-off',
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
