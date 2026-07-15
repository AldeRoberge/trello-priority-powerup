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
   * @param {function(string): Promise} options.onRevert
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
    var onRevert =
      typeof options.onRevert === 'function' ? options.onRevert : function () { return Promise.resolve(); };
    var onLayoutChange =
      typeof options.onLayoutChange === 'function' ? options.onLayoutChange : function () {};
    var applying = false;

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
      }
    });

    function render() {
      var entries = getEntries() || [];
      listEl.textContent = '';
      if (!entries.length) {
        emptyEl.hidden = false;
        listEl.hidden = true;
      } else {
        emptyEl.hidden = true;
        listEl.hidden = false;
        entries.forEach(function (entry) {
          var item = el('li', 'historique-item');
          item.setAttribute('data-history-id', entry.id || '');

          var main = el('div', 'historique-item-main');
          var label = el('p', 'historique-item-label', {
            text: entry.label || 'Modification'
          });
          var time = el('p', 'historique-item-time', {
            text: formatRelativeTime(entry.at)
          });
          main.appendChild(label);
          main.appendChild(time);

          var btn = el('button', 'historique-revert-btn', {
            type: 'button',
            text: 'Revenir'
          });
          btn.disabled = applying;
          btn.addEventListener('click', function () {
            if (applying || !entry.id) return;
            applying = true;
            btn.disabled = true;
            Promise.resolve(onRevert(entry.id))
              .catch(function (err) {
                console.error('HistoryUI revert failed', err);
              })
              .then(function () {
                applying = false;
                render();
              });
          });

          item.appendChild(main);
          item.appendChild(btn);
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
