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
        label: 'Agenda',
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

  global.ContextMenu = {
    show: show,
    hide: hide,
    bind: bind,
    isNativeEditableTarget: isNativeEditableTarget,
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
})(typeof window !== 'undefined' ? window : this);
