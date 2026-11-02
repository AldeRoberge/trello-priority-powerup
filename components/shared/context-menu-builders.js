/**
 * context-menu: part 2 of 2 (buildAgentChatItems).
 * Names are shared with the other parts through window.ContextMenuParts (see context-menu.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.ContextMenuParts = global.ContextMenuParts || {});

  // from earlier parts (values)
  var MENU_CLASS = S.MENU_CLASS;

  // from other parts (functions, resolved at call time)
  function accessKey() { return S.accessKey.apply(this, arguments); }
  function bind() { return S.bind.apply(this, arguments); }
  function buildAgentItems() { return S.buildAgentItems.apply(this, arguments); }
  function buildAgentMessageItems() { return S.buildAgentMessageItems.apply(this, arguments); }
  function buildChecklistItemItems() { return S.buildChecklistItemItems.apply(this, arguments); }
  function buildCompletionItemItems() { return S.buildCompletionItemItems.apply(this, arguments); }
  function buildDueItems() { return S.buildDueItems.apply(this, arguments); }
  function buildExpandToggleItem() { return S.buildExpandToggleItem.apply(this, arguments); }
  function buildGanttSectionItems() { return S.buildGanttSectionItems.apply(this, arguments); }
  function buildHeatSegmentItems() { return S.buildHeatSegmentItems.apply(this, arguments); }
  function buildHistoryItems() { return S.buildHistoryItems.apply(this, arguments); }
  function buildInfoItems() { return S.buildInfoItems.apply(this, arguments); }
  function buildOverviewItems() { return S.buildOverviewItems.apply(this, arguments); }
  function buildOverviewTaskItems() { return S.buildOverviewTaskItems.apply(this, arguments); }
  function buildPriorityItems() { return S.buildPriorityItems.apply(this, arguments); }
  function buildProgressItems() { return S.buildProgressItems.apply(this, arguments); }
  function buildStatutChipItems() { return S.buildStatutChipItems.apply(this, arguments); }
  function dayIcon() { return S.dayIcon.apply(this, arguments); }
  function dedicatedShortcut() { return S.dedicatedShortcut.apply(this, arguments); }
  function doc() { return S.doc.apply(this, arguments); }
  function flatten() { return S.flatten.apply(this, arguments); }
  function fold() { return S.fold.apply(this, arguments); }
  function hide() { return S.hide.apply(this, arguments); }
  function iconFor() { return S.iconFor.apply(this, arguments); }
  function isNativeEditableTarget() { return S.isNativeEditableTarget.apply(this, arguments); }
  function levenshtein() { return S.levenshtein.apply(this, arguments); }
  function normalizeItems() { return S.normalizeItems.apply(this, arguments); }
  function rank() { return S.rank.apply(this, arguments); }
  function rowForKey() { return S.rowForKey.apply(this, arguments); }
  function show() { return S.show.apply(this, arguments); }

  /** A conversation in the Assistant's list: open it, archive it (or bring an archived one back). */
  function buildAgentChatItems(opts) {
    opts = opts || {};
    var items = [
      {
        id: 'open-chat',
        label: 'Ouvrir',
        icon: 'message-circle',
        group: 'Ouvrir',
        action: function () {
          if (typeof opts.onOpen === 'function') opts.onOpen();
        },
      },
    ];
    items.push({ sep: true });
    items.push(
      opts.archived
        ? {
            id: 'restore-chat',
            label: 'Restaurer',
            icon: 'archive-off',
            group: 'Modifier',
            action: function () {
              if (typeof opts.onRestore === 'function') opts.onRestore();
            },
          }
        : {
            id: 'archive-chat',
            label: 'Archiver',
            icon: 'archive',
            group: 'Modifier',
            action: function () {
              if (typeof opts.onArchive === 'function') opts.onArchive();
            },
          }
    );
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
      items.push({
        id: 'open-document',
        label: 'Document',
        action: function () {
          if (global.ViewTabs && typeof global.ViewTabs.openSubject === 'function') global.ViewTabs.openSubject('task', opts.cardId);
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
      // Archiver / Supprimer comes first, like the card menus of the other views.
      items.unshift({ sep: true });
      items.unshift({
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
      items.push({
        id: 'open-document',
        label: 'Document',
        action: function () {
          if (global.ViewTabs && typeof global.ViewTabs.openSubject === 'function') global.ViewTabs.openSubject('task', opts.cardId);
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
      success: true,
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
   * Suppress the browser menu on every right-click, then show ours.
   * A specific menu calls preventDefault while the event is going down the tree;
   * anything that does not gets the generic menu on the way back up.
   */
  function armContextMenu(e) {
    if (!e || e.__tpMenuArmed) return;
    e.__tpMenuArmed = true;
    if (e.defaultPrevented) e.__tpMenuHandled = true;
    var orig = e.preventDefault;
    e.preventDefault = function () {
      e.__tpMenuHandled = true;
      if (typeof orig === 'function') orig.call(e);
    };
    if (!e.defaultPrevented && typeof orig === 'function') orig.call(e);
  }

  function installGlobal(d) {
    d = d || doc();
    if (!d || typeof d.addEventListener !== 'function') return function () {};
    if (globalInstalled && globalInstalled.doc === d) return globalInstalled.off;
    function onContextMenu(e) {
      if (!e || e.__tpMenuHandled) return;
      // Already cancelled by a menu that ran before this listener (and not by
      // our own native-menu block, which marks the event armed).
      if (e.defaultPrevented && !e.__tpMenuArmed) return;
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('.' + MENU_CLASS)) {
        return;
      }
      var items = buildGenericItems(e.target, d);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      show(e, items);
    }
    d.addEventListener('contextmenu', armContextMenu, true);
    d.addEventListener('contextmenu', onContextMenu, false);
    var off = function () {
      d.removeEventListener('contextmenu', armContextMenu, true);
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
    dedicatedShortcut: dedicatedShortcut,
    accessKey: accessKey,
    rowForKey: rowForKey,
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
    buildAgentChatItems: buildAgentChatItems,
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

  // exports
  S.armContextMenu = armContextMenu;
  S.buildAgentChatItems = buildAgentChatItems;
  S.buildAgentComposerItems = buildAgentComposerItems;
  S.buildBulkActionItems = buildBulkActionItems;
  S.buildCompletionMasterItems = buildCompletionMasterItems;
  S.buildGanttBarItems = buildGanttBarItems;
  S.buildGanttCardItems = buildGanttCardItems;
  S.buildGanttToolbarItems = buildGanttToolbarItems;
  S.buildGenericItems = buildGenericItems;
  S.buildHistoryEntryItems = buildHistoryEntryItems;
  S.buildInfoChipItems = buildInfoChipItems;
  S.buildPriorityFieldItems = buildPriorityFieldItems;
  S.copyText = copyText;
  S.fieldSelection = fieldSelection;
  S.globalInstalled = globalInstalled;
  S.insertText = insertText;
  S.installGlobal = installGlobal;
  S.legacyCopy = legacyCopy;
  S.selectionText = selectionText;
})(typeof window !== 'undefined' ? window : this);
