/**
 * Collapsible Historique section for the priority popup.
 */
(function (global) {
  'use strict';

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs && typeof attrs === 'object') {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'text') node.textContent = attrs[key];
        else if (key === 'html') node.innerHTML = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var then = Date.parse(iso);
    if (!isFinite(then)) return '';
    var diffSec = Math.round((Date.now() - then) / 1000);
    if (diffSec < 45) return 'À l\'instant';
    if (diffSec < 90) return 'Il y a 1 min';
    var diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return 'Il y a ' + diffMin + ' min';
    var diffH = Math.round(diffMin / 60);
    if (diffH < 24) return 'Il y a ' + diffH + ' h';
    var diffD = Math.round(diffH / 24);
    if (diffD === 1) return 'Hier';
    if (diffD < 7) return 'Il y a ' + diffD + ' j';
    try {
      return new Date(then).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  function summaryText(entries) {
    if (!entries || !entries.length) return 'Aucune modification';
    if (entries.length === 1) {
      return entries[0].label || '1 modification';
    }
    return entries.length + ' modifications';
  }

  /**
   * @param {HTMLElement} cardEl
   * @param {object} options
   * @param {function(): Array} options.getEntries
   * @param {function(string): object|null} [options.getEntryDetails]
   * @param {function(string): Promise} options.onRevert
   * @param {function(string): Promise} [options.onRestore]
   * @param {function()} [options.onLayoutChange]
   * @param {boolean} [options.initiallyOpen]
   */
  function mount(cardEl, options) {
    options = options || {};
    if (!cardEl || !global.PriorityUI) {
      console.error('HistoryUI.mount: PriorityUI / cardEl required');
      return null;
    }

    var getEntries =
      typeof options.getEntries === 'function' ? options.getEntries : function () { return []; };
    var getEntryDetails =
      typeof options.getEntryDetails === 'function'
        ? options.getEntryDetails
        : function () { return null; };
    var onRevert =
      typeof options.onRevert === 'function' ? options.onRevert : function () { return Promise.resolve(); };
    var onRestore =
      typeof options.onRestore === 'function' ? options.onRestore : function () { return Promise.resolve(); };
    var onLayoutChange =
      typeof options.onLayoutChange === 'function' ? options.onLayoutChange : function () {};
    var applying = false;
    var expandedId = null;

    var section = el('div', 'variant-historique-section');
    var field = el('div', 'field field--historique');

    var chrome = PriorityUI.createCollapsibleEnableChrome({
      title: 'Historique',
      bodyId: 'historique-section-body',
      hideEnable: true,
      leadingIcon: 'ti-history',
      iconClass: 'historique-leading-icon',
      titleClass: 'historique-enable-title',
      collapseLabel: 'Replier Historique',
      expandLabel: 'Développer Historique'
    });
    field.appendChild(chrome.head);

    var body = el('div', 'historique-section-body section-toggle-body');
    body.id = 'historique-section-body';
    body.hidden = true;

    var emptyEl = el('p', 'historique-empty', {
      text: 'Aucune modification enregistrée'
    });
    var listEl = el('ul', 'historique-list');
    listEl.hidden = true;
    body.appendChild(emptyEl);
    body.appendChild(listEl);

    field.appendChild(body);
    section.appendChild(field);

    // Insert just above Assistant when present.
    var chatSection = cardEl.querySelector('.variant-chat-section');
    if (chatSection) {
      cardEl.insertBefore(section, chatSection);
    } else {
      cardEl.appendChild(section);
    }

    var expandHistorique = PriorityUI.resolveSectionExpanded
      ? PriorityUI.resolveSectionExpanded('historique', false)
      : false;
    if (options.initiallyOpen) expandHistorique = true;

    var collapseApi = PriorityUI.bindCollapsibleEnable({
      field: field,
      body: body,
      chrome: chrome,
      alwaysEnabled: true,
      enabled: true,
      expanded: expandHistorique,
      getSummary: function () {
        return summaryText(getEntries());
      },
      onLayoutChange: onLayoutChange,
      onExpandChange: function (isExpanded) {
        if (typeof PriorityUI.saveSectionCollapseState === 'function') {
          PriorityUI.saveSectionCollapseState({ historique: !!isExpanded });
        }
      },
      getContextMenuItems: function (api) {
        if (
          !global.ContextMenu ||
          typeof global.ContextMenu.buildHistoryItems !== 'function'
        ) {
          return [];
        }
        var canUndo =
          typeof options.canUndo === 'function'
            ? !!options.canUndo()
            : !!options.canUndo;
        var canRedo =
          typeof options.canRedo === 'function'
            ? !!options.canRedo()
            : !!options.canRedo;
        return ContextMenu.buildHistoryItems({
          isExpanded: api.isExpanded,
          setExpanded: api.setExpanded,
          canUndo: canUndo,
          canRedo: canRedo,
          undo: function () {
            if (typeof options.onUndo === 'function') options.onUndo();
          },
          redo: function () {
            if (typeof options.onRedo === 'function') options.onRedo();
          },
        });
      },
    });

    function buildDetailPanel(entry) {
      var details =
        (entry && entry.details) ||
        (entry && entry.id ? getEntryDetails(entry.id) : null) ||
        null;

      var detail = el('div', 'historique-item-detail');

      var absoluteTime =
        (details && details.absoluteTime) ||
        (entry && entry.at ? formatRelativeTime(entry.at) : '');
      if (absoluteTime) {
        detail.appendChild(
          el('p', 'historique-detail-time', { text: absoluteTime })
        );
      }

      var domains = (details && details.domains) || (entry && entry.domains) || [];
      var domainLabels =
        (details && details.domainLabels) ||
        domains.map(function (key) {
          if (key === 'priority') return 'Priorité';
          if (key === 'completion') return 'Progrès';
          if (key === 'statut') return 'Statut';
          if (key === 'info') return 'Détails';
          if (key === 'goals') return 'Objectifs';
          return key;
        });

      // Domain chips only help when several domains changed; a single chip
      // just repeats the row label / detail lines.
      var showDomainChips = domainLabels && domainLabels.length > 1;
      if (showDomainChips) {
        var domainsRow = el('div', 'historique-detail-domains');
        domainLabels.forEach(function (name) {
          domainsRow.appendChild(
            el('span', 'historique-detail-domain', { text: name })
          );
        });
        detail.appendChild(domainsRow);
      }

      var rawLines =
        (details && details.lines && details.lines.length && details.lines) ||
        (entry && entry.label ? [entry.label] : ['Modification']);
      var entryLabel = (entry && entry.label) || '';
      var domainSet = Object.create(null);
      (domainLabels || []).forEach(function (name) {
        domainSet[String(name)] = true;
      });
      var lines = rawLines.filter(function (line) {
        var text = String(line || '');
        if (!text) return false;
        // Skip lines that only restate the collapsed row label.
        if (entryLabel && text === entryLabel) return false;
        // Skip bare domain names ("Priorité") — chips or the row already say that.
        if (domainSet[text]) return false;
        return true;
      });
      if (lines.length) {
        var ul = el('ul', 'historique-detail-lines');
        lines.forEach(function (line) {
          ul.appendChild(el('li', 'historique-detail-line', { text: line }));
        });
        detail.appendChild(ul);
      } else if (!absoluteTime) {
        detail.appendChild(
          el('p', 'historique-detail-empty', {
            text: entryLabel || 'Modification'
          })
        );
      }

      return detail;
    }

    function render() {
      var entries = getEntries() || [];
      listEl.textContent = '';
      if (expandedId) {
        var stillThere = entries.some(function (e) {
          return e && e.id === expandedId;
        });
        if (!stillThere) expandedId = null;
      }
      if (!entries.length) {
        emptyEl.hidden = false;
        listEl.hidden = true;
      } else {
        emptyEl.hidden = true;
        listEl.hidden = false;
        entries.forEach(function (entry) {
          var isUndone = !!(entry && entry.undone);
          var isOpen = expandedId && entry.id === expandedId;
          var item = el(
            'li',
            'historique-item' +
              (isOpen ? ' is-expanded' : '') +
              (isUndone ? ' is-undone' : '')
          );
          item.setAttribute('data-history-id', entry.id || '');
          if (isUndone) item.setAttribute('data-undone', 'true');

          var row = el('div', 'historique-item-row');

          var main = el('button', 'historique-item-main', {
            type: 'button',
            'aria-expanded': isOpen ? 'true' : 'false'
          });
          var mainText = el('div', 'historique-item-main-text');
          mainText.appendChild(
            el('p', 'historique-item-label', {
              text: entry.label || 'Modification'
            })
          );
          mainText.appendChild(
            el('p', 'historique-item-time', {
              text: isUndone
                ? 'Annulée · ' + formatRelativeTime(entry.at)
                : formatRelativeTime(entry.at)
            })
          );
          var chevron = el(
            'i',
            'ti ti-chevron-down historique-item-chevron'
          );
          chevron.setAttribute('aria-hidden', 'true');
          main.appendChild(mainText);
          main.appendChild(chevron);
          main.addEventListener('click', function () {
            if (!entry.id) return;
            expandedId = expandedId === entry.id ? null : entry.id;
            render();
          });

          var actionLabel = isUndone ? 'Rétablir' : 'Revenir';
          var btn = el(
            'button',
            'historique-revert-btn' + (isUndone ? ' historique-restore-btn' : ''),
            {
              type: 'button',
              title: actionLabel,
              'aria-label': actionLabel
            }
          );
          var btnIcon = el(
            'i',
            isUndone ? 'ti ti-circle-arrow-right' : 'ti ti-circle-arrow-left'
          );
          btnIcon.setAttribute('aria-hidden', 'true');
          btn.appendChild(btnIcon);
          btn.appendChild(document.createTextNode(actionLabel));
          btn.disabled = applying;
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (applying || !entry.id) return;
            applying = true;
            btn.disabled = true;
            var action = isUndone ? onRestore(entry.id) : onRevert(entry.id);
            Promise.resolve(action)
              .catch(function (err) {
                console.error(
                  isUndone
                    ? 'HistoryUI restore failed'
                    : 'HistoryUI revert failed',
                  err
                );
              })
              .then(function () {
                applying = false;
                expandedId = null;
                render();
              });
          });

          row.appendChild(main);
          row.appendChild(btn);
          item.appendChild(row);

          if (isOpen) {
            item.appendChild(buildDetailPanel(entry));
          }

          listEl.appendChild(item);
        });
      }
      if (collapseApi && typeof collapseApi.refreshSummary === 'function') {
        collapseApi.refreshSummary();
      }
      onLayoutChange();
    }

    render();

    return {
      el: section,
      field: field,
      refresh: render,
      setExpanded: function (on) {
        if (collapseApi && typeof collapseApi.setExpanded === 'function') {
          collapseApi.setExpanded(!!on);
        }
      },
      isExpanded: function () {
        return collapseApi && typeof collapseApi.isExpanded === 'function'
          ? collapseApi.isExpanded()
          : false;
      }
    };
  }

  global.HistoryUI = {
    mount: mount,
    formatRelativeTime: formatRelativeTime
  };
})(typeof window !== 'undefined' ? window : this);
