/**
 * priority-ui: part 6 of 12 (bindCollapsibleEnable).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var BLOCKED_LABEL = S.BLOCKED_LABEL;

  // from other parts (functions, resolved at call time)
  function applySectionGlow() { return S.applySectionGlow.apply(this, arguments); }
  function clearSectionGlow() { return S.clearSectionGlow.apply(this, arguments); }
  function createCollapsibleEnableChrome() { return S.createCollapsibleEnableChrome.apply(this, arguments); }
  function expandBlockedReasonsForDisplay() { return S.expandBlockedReasonsForDisplay.apply(this, arguments); }
  function formatBlockedReasonsSummary() { return S.formatBlockedReasonsSummary.apply(this, arguments); }
  function loadStatutEmbeddedDetailsExpanded() { return S.loadStatutEmbeddedDetailsExpanded.apply(this, arguments); }
  function normalizeBlockedReason() { return S.normalizeBlockedReason.apply(this, arguments); }
  function normalizeBlockedReasons() { return S.normalizeBlockedReasons.apply(this, arguments); }
  function readCssVar() { return S.readCssVar.apply(this, arguments); }
  function saveStatutEmbeddedDetailsExpanded() { return S.saveStatutEmbeddedDetailsExpanded.apply(this, arguments); }

  function bindCollapsibleEnable(config) {
    var field = config.field;
    var body = config.body;
    var chrome = config.chrome;
    var alwaysEnabled = !!config.alwaysEnabled;
    var enabled = alwaysEnabled ? true : !!config.enabled;
    var expanded = config.expanded != null ? !!config.expanded : (!!enabled && !alwaysEnabled);
    var enableAllowed = config.enableAllowed !== false;
    var onEnableChange = config.onEnableChange || function () {};
    var onExpandChange = config.onExpandChange || null;
    var onLayoutChange = config.onLayoutChange || function () {};
    var getSummary = config.getSummary || function () { return ''; };
    var onBeforeDisable = config.onBeforeDisable || null;
    var onAfterEnable = config.onAfterEnable || null;
    var getContextMenuItems =
      typeof config.getContextMenuItems === 'function'
        ? config.getContextMenuItems
        : null;
    var activateHint = 'Activer pour modifier';
    var lockedHint = 'Indisponible tant que le progr\u00e8s est \u00e0 100\u00a0%';

    function notifyExpandChange(options) {
      if (typeof onExpandChange !== 'function') return;
      if (options && options.persist === false) return;
      onExpandChange(expanded, options || {});
    }

    // Catcher sits above the inert preview body so clicks can enable the section.
    var shell = body.parentNode && body.parentNode.classList.contains('section-toggle-shell')
      ? body.parentNode
      : null;
    if (!shell && body.parentNode) {
      shell = document.createElement('div');
      shell.className = 'section-toggle-shell';
      body.parentNode.insertBefore(shell, body);
      shell.appendChild(body);
    }

    var catcher = shell ? shell.querySelector('.section-enable-catcher') : null;
    if (shell && !catcher && !alwaysEnabled) {
      catcher = document.createElement('button');
      catcher.type = 'button';
      catcher.className = 'section-enable-catcher';
      catcher.tabIndex = -1;
      catcher.setAttribute('aria-label', activateHint);
      catcher.title = activateHint;
      shell.appendChild(catcher);
    }

    function applySummaryContent(content) {
      if (content == null || content === '') {
        chrome.summary.replaceChildren();
        chrome.summary.hidden = true;
        chrome.summary.setAttribute('aria-hidden', 'true');
        return;
      }
      if (typeof content === 'string') {
        chrome.summary.textContent = content;
      } else if (content.nodeType) {
        // Node / DocumentFragment — e.g. Statut icon + label
        chrome.summary.replaceChildren(content);
      } else {
        chrome.summary.textContent = String(content);
      }
      chrome.summary.hidden = false;
      chrome.summary.setAttribute('aria-hidden', 'false');
    }

    function syncUi(shouldNotifyLayout) {
      var wasHidden = !!body.hidden;
      if (chrome.checkbox) {
        chrome.checkbox.checked = enabled;
        // Always-on sections keep a checked, clickable-looking checkbox that cannot turn off.
        chrome.checkbox.disabled = alwaysEnabled ? false : !enableAllowed;
        if (alwaysEnabled) {
          chrome.checkbox.title = 'Toujours activ\u00e9';
          chrome.checkbox.setAttribute('aria-disabled', 'true');
        } else if (!enableAllowed) {
          chrome.checkbox.title = lockedHint;
          chrome.checkbox.setAttribute('aria-disabled', 'true');
        } else {
          chrome.checkbox.removeAttribute('title');
          chrome.checkbox.removeAttribute('aria-disabled');
        }
      }
      field.classList.toggle('is-enabled', enabled);
      field.classList.toggle('is-collapsed', !expanded);
      field.classList.toggle('is-enable-locked', !alwaysEnabled && !enableAllowed);
      body.hidden = !expanded;
      if (shell) shell.hidden = !expanded;
      try {
        body.inert = !enabled;
      } catch (e) { /* ignore */ }
      if (catcher) {
        var showCatcher = !alwaysEnabled && !enabled && expanded && enableAllowed;
        catcher.hidden = !showCatcher;
        catcher.setAttribute('aria-hidden', showCatcher ? 'false' : 'true');
        catcher.title = enableAllowed ? activateHint : lockedHint;
        catcher.setAttribute('aria-label', enableAllowed ? activateHint : lockedHint);
      }
      chrome.collapseBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      chrome.collapseBtn.setAttribute(
        'aria-label',
        expanded ? chrome.collapseLabel : chrome.expandLabel
      );
      applySummaryContent(enabled ? getSummary() : '');
      if (shouldNotifyLayout !== false && wasHidden !== !!body.hidden) {
        onLayoutChange();
      }
    }

    function setExpanded(next, options) {
      options = options || {};
      var wasExpanded = expanded;
      expanded = !!next;
      syncUi(options.notifyLayout !== false);
      if (wasExpanded !== expanded) notifyExpandChange(options);
    }

    function setEnabled(next, options) {
      options = options || {};
      if (alwaysEnabled) {
        // Always-on sections ignore enable/disable; expand may still be controlled.
        if (options.expand != null) {
          var wasAlwaysExpanded = expanded;
          expanded = !!options.expand;
          syncUi(options.notifyLayout !== false);
          if (wasAlwaysExpanded !== expanded) notifyExpandChange(options);
        }
        return;
      }
      var on = !!next;
      // Progress-complete lock: keep data, block re-enable via checkbox / catcher.
      if (on && !enableAllowed && !options.force) {
        if (chrome.checkbox) chrome.checkbox.checked = enabled;
        return;
      }
      var changed = on !== enabled;
      var wasExpanded = expanded;
      enabled = on;
      if (enabled) {
        if (options.preserveCollapse) {
          // Keep current expand/collapse (e.g. AI edits must not reopen sections).
        } else if (changed || options.expand != null) {
          expanded = options.expand !== false;
        }
        if (changed && typeof onAfterEnable === 'function') onAfterEnable(options);
      } else {
        // Disabling collapses by default; pass expand:true to keep open.
        // preserveCollapse only skips unintended opens — disable still collapses.
        expanded = options.expand != null ? !!options.expand : false;
        if (changed && typeof onBeforeDisable === 'function') onBeforeDisable(options);
      }
      syncUi(options.notifyLayout !== false);
      if (changed) onEnableChange(enabled, options);
      if (wasExpanded !== expanded) notifyExpandChange(options);
    }

    function setEnableAllowed(allowed, options) {
      options = options || {};
      if (alwaysEnabled) return;
      var next = allowed !== false;
      if (next === enableAllowed) {
        syncUi(false);
        return;
      }
      enableAllowed = next;
      if (!enableAllowed && enabled) {
        var disableOpts = { notifyLayout: options.notifyLayout };
        if (options.expand != null) disableOpts.expand = options.expand;
        setEnabled(false, disableOpts);
        return;
      }
      syncUi(options.notifyLayout !== false);
    }

    function refreshSummary() {
      applySummaryContent(enabled ? getSummary() : '');
    }

    function focusControlAtPoint(clientX, clientY) {
      var hit = document.elementFromPoint(clientX, clientY);
      if (!hit || !body.contains(hit)) return;
      var focusable = typeof hit.closest === 'function'
        ? hit.closest('button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')
        : null;
      var target = focusable && body.contains(focusable) ? focusable : hit;
      if (!target || typeof target.focus !== 'function' || target.disabled) return;
      try {
        target.focus();
      } catch (err) { /* ignore */ }
    }

    if (chrome.checkbox) {
      chrome.checkbox.addEventListener('click', function (event) {
        // Keep enable clicks from bubbling into any header handlers.
        event.stopPropagation();
        if (alwaysEnabled || !enableAllowed) {
          event.preventDefault();
          chrome.checkbox.checked = enabled;
        }
      });

      chrome.checkbox.addEventListener('change', function () {
        if (alwaysEnabled || !enableAllowed) {
          chrome.checkbox.checked = enabled;
          return;
        }
        setEnabled(chrome.checkbox.checked);
      });
    }

    chrome.collapseBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (field.classList.contains('is-focus-locked')) return;
      setExpanded(!expanded);
    });

    if (catcher) {
      catcher.addEventListener('click', function (event) {
        if (enabled || !enableAllowed) return;
        event.preventDefault();
        event.stopPropagation();
        var x = event.clientX;
        var y = event.clientY;
        setEnabled(true);
        requestAnimationFrame(function () {
          focusControlAtPoint(x, y);
        });
      });
    }

    var api = {
      setEnabled: setEnabled,
      setExpanded: setExpanded,
      setEnableAllowed: setEnableAllowed,
      isEnableAllowed: function () { return enableAllowed; },
      isEnabled: function () { return enabled; },
      isExpanded: function () { return expanded; },
      refreshSummary: refreshSummary,
      syncUi: syncUi
    };

    if (
      getContextMenuItems &&
      chrome.head &&
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function'
    ) {
      ContextMenu.bind(chrome.head, function (e) {
        return getContextMenuItems(api, e) || [];
      });
    }

    syncUi(false);

    return api;
  }

  function statutCategoryStyle(key) {
    if (
      typeof global.StatutMatch !== 'undefined' &&
      typeof global.StatutMatch.categoryStyle === 'function'
    ) {
      return global.StatutMatch.categoryStyle(key);
    }
    return { color: '#626f86', icon: 'dot' };
  }

  function createStatutIcon(iconKey, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var dim = size > 0 ? Number(size) : 16;
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', String(dim));
    svg.setAttribute('height', String(dim));
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('statut-list-option-icon');

    function path(d, attrs) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.6');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          p.setAttribute(k, attrs[k]);
        });
      }
      return p;
    }

    function circle(cx, cy, r, attrs) {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', 'currentColor');
      c.setAttribute('stroke-width', '1.6');
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          c.setAttribute(k, attrs[k]);
        });
      }
      return c;
    }

    function line(x1, y1, x2, y2) {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', String(x1));
      l.setAttribute('y1', String(y1));
      l.setAttribute('x2', String(x2));
      l.setAttribute('y2', String(y2));
      l.setAttribute('stroke', 'currentColor');
      l.setAttribute('stroke-width', '1.6');
      l.setAttribute('stroke-linecap', 'round');
      return l;
    }

    if (iconKey === 'check') {
      svg.appendChild(path('M3.2 8.2 L6.5 11.4 L12.8 4.4'));
    } else if (iconKey === 'ban') {
      svg.appendChild(circle(8, 8, 5.5));
      svg.appendChild(line(4.2, 4.2, 11.8, 11.8));
    } else if (iconKey === 'play') {
      // Play arrow (En cours)
      svg.appendChild(
        path('M5.2 3.6 L12.4 8 L5.2 12.4 Z', {
          fill: 'currentColor',
          stroke: 'none',
        })
      );
    } else if (iconKey === 'inbox') {
      svg.appendChild(path('M2.5 6.5 L8 2.8 L13.5 6.5 V13 H2.5 Z'));
      svg.appendChild(path('M2.5 6.5 H13.5'));
    } else if (iconKey === 'layers') {
      svg.appendChild(path('M2.5 10.5 L8 13.5 L13.5 10.5'));
      svg.appendChild(path('M2.5 7.5 L8 10.5 L13.5 7.5'));
      svg.appendChild(path('M2.5 4.5 L8 7.5 L13.5 4.5 L8 1.5 Z'));
    } else if (iconKey === 'hourglass') {
      // Hourglass (En attente / backlog): caps + glass silhouette.
      svg.appendChild(path('M4.5 2.5 H11.5'));
      svg.appendChild(path('M4.5 13.5 H11.5'));
      svg.appendChild(path('M5.5 3.5 L8 8 L5.5 12.5'));
      svg.appendChild(path('M10.5 3.5 L8 8 L10.5 12.5'));
    } else if (iconKey === 'circle') {
      svg.appendChild(circle(8, 8, 5));
    } else if (iconKey === 'x') {
      svg.appendChild(line(4.5, 4.5, 11.5, 11.5));
      svg.appendChild(line(11.5, 4.5, 4.5, 11.5));
    } else {
      // Dot / unassigned
      var d = document.createElementNS(ns, 'circle');
      d.setAttribute('cx', '8');
      d.setAttribute('cy', '8');
      d.setAttribute('r', '2.4');
      d.setAttribute('fill', 'currentColor');
      svg.appendChild(d);
    }
    return svg;
  }

  // Statut section: list-category picker (À faire / En cours / Bloqué / …)
  // wired to StatutTrello settings. Embedded mode = card-back strip.

  function createStatutField(config) {
    var el = config.el;
    var onChange = config.onChange || function () {};
    var onLayoutChange = config.onLayoutChange || function () {};
    var onSelectList =
      typeof config.onSelectList === 'function' ? config.onSelectList : null;
    var onOpenSettings =
      typeof config.onOpenSettings === 'function' ? config.onOpenSettings : null;
    var embedded = !!config.embedded;
    var bodyId = 'statut-section-body-' + Math.random().toString(36).slice(2, 9);
    var currentListId = config.listId ? String(config.listId) : '';
    var lists = Array.isArray(config.lists) ? config.lists.slice() : [];
    var settings = config.settings || null;
    if (
      settings &&
      typeof global.StatutMatch !== 'undefined' &&
      typeof global.StatutMatch.applyStateColors === 'function'
    ) {
      global.StatutMatch.applyStateColors(settings.stateColors);
    }
    var busy = false;
    var authBusy = false;
    var showUnassigned =
      config.showUnassigned != null
        ? !!config.showUnassigned
        : !!(settings && settings.showUnassigned);
    var onAuthorize =
      typeof config.onAuthorize === 'function' ? config.onAuthorize : null;
    var authReason = config.authReason || (config.needsAuth ? 'not-authorized' : '');
    var embeddedDetailsExpanded = embedded
      ? loadStatutEmbeddedDetailsExpanded()
      : true;
    var embeddedBlockedReasons = [];

    var field = document.createElement('div');
    field.className = embedded
      ? 'field field--statut field--statut-embedded is-enabled'
      : 'field field--statut is-enabled';

    var chrome = null;
    if (!embedded) {
      chrome = createCollapsibleEnableChrome({
        title: 'Statut',
        bodyId: bodyId,
        hideEnable: true,
        leadingIcon: 'ti-list',
        iconClass: 'statut-leading-icon',
        titleClass: 'statut-enable-title',
        collapseLabel: 'Replier Statut',
        expandLabel: 'Développer Statut',
      });
      field.appendChild(chrome.head);
    }

    var settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'statut-settings-btn';
    settingsBtn.setAttribute('aria-label', 'Personnaliser les statuts');
    settingsBtn.title = 'Personnaliser les statuts';
    settingsBtn.hidden = !onOpenSettings;
    var settingsIcon = document.createElement('i');
    settingsIcon.className = 'ti ti-settings';
    settingsIcon.setAttribute('aria-hidden', 'true');
    settingsBtn.appendChild(settingsIcon);
    settingsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!onOpenSettings) return;
      Promise.resolve(onOpenSettings()).catch(function (err) {
        console.error('Statut open settings failed', err);
      });
    });

    if (!embedded) {
      // Gear left of the enable checkbox (checkbox stays on the far right).
      if (chrome.label) {
        chrome.head.insertBefore(settingsBtn, chrome.label);
      } else {
        chrome.head.appendChild(settingsBtn);
      }
    }

    var body = document.createElement('div');
    body.className = embedded
      ? 'statut-section-body statut-section-body--embedded'
      : 'statut-section-body section-toggle-body';
    body.id = bodyId;

    var embeddedBar = null;
    var embeddedHead = null;
    var embeddedToggleBtn = null;
    var embeddedHeaderSummary = null;
    var embeddedSummaryEl = null;
    var heroEl = null;
    if (embedded) {
      embeddedBar = document.createElement('div');
      embeddedBar.className = 'statut-embedded-bar';
      embeddedBar.appendChild(settingsBtn);
      body.appendChild(embeddedBar);

      // Compact section-style header (chevron + title + collapsed summary).
      // Hero stays outside the button so hover is not a huge square.
      embeddedHead = document.createElement('div');
      embeddedHead.className = 'statut-embedded-head section-toggle-head';
      body.appendChild(embeddedHead);

      embeddedToggleBtn = document.createElement('button');
      embeddedToggleBtn.type = 'button';
      embeddedToggleBtn.className =
        'statut-embedded-collapse-btn section-collapse-btn';

      var embeddedChevron = document.createElement('i');
      embeddedChevron.className =
        'ti ti-chevron-down section-collapse-chevron statut-embedded-collapse-chevron';
      embeddedChevron.setAttribute('aria-hidden', 'true');
      embeddedToggleBtn.appendChild(embeddedChevron);

      var embeddedLeading = document.createElement('span');
      embeddedLeading.className = 'section-leading-icon statut-leading-icon';
      embeddedLeading.setAttribute('aria-hidden', 'true');
      var embeddedLeadingGlyph = document.createElement('i');
      embeddedLeadingGlyph.className =
        'ti ti-list section-leading-icon-glyph';
      embeddedLeading.appendChild(embeddedLeadingGlyph);
      embeddedToggleBtn.appendChild(embeddedLeading);

      var embeddedTextWrap = document.createElement('span');
      embeddedTextWrap.className = 'section-enable-text';
      var embeddedTitle = document.createElement('span');
      embeddedTitle.className = 'section-enable-title statut-enable-title';
      embeddedTitle.textContent = 'Statut';
      embeddedTextWrap.appendChild(embeddedTitle);
      embeddedToggleBtn.appendChild(embeddedTextWrap);

      embeddedHeaderSummary = document.createElement('span');
      embeddedHeaderSummary.className = 'section-toggle-summary';
      embeddedHeaderSummary.hidden = true;
      embeddedHeaderSummary.setAttribute('aria-hidden', 'true');
      embeddedToggleBtn.appendChild(embeddedHeaderSummary);

      embeddedHead.appendChild(embeddedToggleBtn);

      heroEl = document.createElement('div');
      heroEl.className = 'statut-hero';
      heroEl.setAttribute('aria-live', 'polite');
      body.appendChild(heroEl);

      embeddedSummaryEl = document.createElement('p');
      embeddedSummaryEl.className = 'statut-embedded-summary';
      embeddedSummaryEl.hidden = true;
      embeddedSummaryEl.setAttribute('aria-live', 'polite');
      body.appendChild(embeddedSummaryEl);
    }

    var authBox = document.createElement('div');
    authBox.className = 'statut-auth-box';

    var hint = document.createElement('p');
    hint.className = 'statut-auth-hint';

    var authBtn = document.createElement('button');
    authBtn.type = 'button';
    authBtn.className = 'tp-button statut-auth-button';
    authBtn.textContent = 'Autoriser Trello (lecture + écriture)';
    authBtn.addEventListener('click', function () {
      if (!onAuthorize || authBusy) return;
      authBusy = true;
      authBtn.disabled = true;
      Promise.resolve(onAuthorize())
        .then(function () {
          setAuthHint('');
        })
        .catch(function (err) {
          console.error('Statut REST authorize failed', err);
          setAuthHint('not-authorized');
        })
        .then(function () {
          authBusy = false;
          updateAuthUi();
          onLayoutChange();
        });
    });

    authBox.appendChild(hint);
    authBox.appendChild(authBtn);

    var groupsEl = document.createElement('div');
    groupsEl.className = 'statut-groups';
    groupsEl.setAttribute('role', 'listbox');
    groupsEl.setAttribute('aria-label', 'Listes du tableau');

    var emptyEl = document.createElement('p');
    emptyEl.className = 'statut-empty';
    emptyEl.hidden = true;
    emptyEl.textContent = 'Aucune liste trouvée sur ce tableau.';

    body.appendChild(authBox);
    body.appendChild(groupsEl);
    body.appendChild(emptyEl);

    var blockedPanel = document.createElement('div');
    // Visibility is class-driven (is-statut-blocked) so profile feature flags can
    // still use the [hidden] attribute without fighting category sync.
    blockedPanel.className = 'statut-blocked-panel';
    var blockedMount = document.createElement('div');
    blockedMount.className = 'statut-blocked-mount';
    blockedPanel.appendChild(blockedMount);
    body.appendChild(blockedPanel);

    function authMessage(reason) {
      if (reason === 'no-app-key') {
        return (
          'Impossible de déplacer la carte : aucune clé API Trello n’est configurée pour ce Power-Up. ' +
          'Dans components/shared/rest-config.js, renseignez appKey (clé depuis trello.com/power-ups/admin), puis rechargez.'
        );
      }
      if (reason === 'not-authorized') {
        return (
          'Impossible de déplacer la carte : Trello n’a pas encore l’autorisation d’écriture.'
        );
      }
      return '';
    }

    function updateAuthUi() {
      var msg = authMessage(authReason);
      hint.textContent = msg;
      authBox.hidden = !msg;
      authBtn.hidden = authReason !== 'not-authorized' || !onAuthorize;
      authBtn.disabled = authBusy;
    }

    function setAuthHint(reason) {
      authReason = reason || '';
      updateAuthUi();
    }

    updateAuthUi();
    field.appendChild(body);
    el.appendChild(field);

    function currentListName() {
      for (var i = 0; i < lists.length; i++) {
        if (String(lists[i].id) === String(currentListId)) return lists[i].name;
      }
      return '';
    }

    function currentCategory() {
      if (!currentListId) return null;
      var cats = (settings && settings.listCategories) || {};
      var cat = cats[currentListId] || cats[String(currentListId)] || null;
      var roleBlocked =
        settings && settings.roleLists && settings.roleLists.blocked
          ? String(settings.roleLists.blocked)
          : '';
      if (roleBlocked && roleBlocked === String(currentListId)) return 'blocked';
      var roleCompleted =
        settings && settings.roleLists && settings.roleLists.completed
          ? String(settings.roleLists.completed)
          : '';
      if (roleCompleted && roleCompleted === String(currentListId)) return 'completed';
      return cat || null;
    }

    function syncBlockedPanel() {
      var show = currentCategory() === 'blocked';
      var wasActive = blockedPanel.classList.contains('is-statut-blocked');
      blockedPanel.classList.toggle('is-statut-blocked', show);
      field.classList.toggle('has-blocked-panel', show);
      refreshEmbeddedSummary();
      if (wasActive !== show) onLayoutChange();
    }

    function syncStatutSectionTint() {
      syncBlockedPanel();
      var cat = currentCategory();
      if (!cat) {
        clearSectionGlow(field);
        return;
      }
      var style = statutCategoryStyle(cat);
      applySectionGlow(field, style && style.color);
    }

    function summaryContent() {
      var name = currentListName() || (currentListId ? 'Liste inconnue' : '—');
      var style = statutCategoryStyle(currentCategory() || '_none');
      var wrap = document.createElement('span');
      wrap.className = 'statut-summary';
      wrap.style.setProperty('--statut-color', style.color || '#626f86');
      wrap.appendChild(createStatutIcon(style.icon || 'dot'));
      var label = document.createElement('span');
      label.className = 'statut-summary-label';
      label.textContent = name;
      wrap.appendChild(label);
      return wrap;
    }

    function refreshEmbeddedHeaderSummary() {
      if (!embeddedHeaderSummary) return;
      embeddedHeaderSummary.replaceChildren(summaryContent());
      embeddedHeaderSummary.hidden = false;
      embeddedHeaderSummary.setAttribute('aria-hidden', 'false');
    }

    function refreshEmbeddedSummary() {
      if (!embeddedSummaryEl) return;
      var show = currentCategory() === 'blocked' && !embeddedDetailsExpanded;
      var text = formatBlockedReasonsSummary(embeddedBlockedReasons, {
        empty: BLOCKED_LABEL,
      });
      embeddedSummaryEl.textContent = text;
      embeddedSummaryEl.title = text;
      embeddedSummaryEl.hidden = !show;
    }

    function setEmbeddedDetailsExpanded(expanded, opts) {
      if (!embedded) return;
      opts = opts || {};
      embeddedDetailsExpanded = !!expanded;
      field.classList.toggle('is-collapsed', !embeddedDetailsExpanded);
      if (embeddedToggleBtn) {
        embeddedToggleBtn.setAttribute(
          'aria-expanded',
          embeddedDetailsExpanded ? 'true' : 'false'
        );
        embeddedToggleBtn.setAttribute(
          'aria-label',
          embeddedDetailsExpanded
            ? 'Replier les détails du statut'
            : 'Développer les détails du statut'
        );
        embeddedToggleBtn.title = embeddedDetailsExpanded
          ? 'Replier les détails'
          : 'Développer les détails';
      }
      refreshEmbeddedHeaderSummary();
      refreshEmbeddedSummary();
      if (opts.persist !== false) {
        saveStatutEmbeddedDetailsExpanded(embeddedDetailsExpanded);
      }
      if (opts.notifyLayout !== false) onLayoutChange();
    }

    function buildGroups() {
      if (
        typeof global.StatutTrello !== 'undefined' &&
        global.StatutTrello.groupListsByCategory
      ) {
        return global.StatutTrello.groupListsByCategory(lists, settings, {
          includeUnassigned: showUnassigned,
        });
      }
      return lists.length
        ? [{ key: '_none', label: 'Listes', lists: lists }]
        : [];
    }

    /** Keep the active list visible even when unassigned chip row is hidden. */
    function ensureCurrentListVisible(groups) {
      if (!currentListId || showUnassigned) return groups;
      var found = false;
      for (var gi = 0; gi < groups.length; gi++) {
        for (var li = 0; li < groups[gi].lists.length; li++) {
          if (String(groups[gi].lists[li].id) === String(currentListId)) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) return groups;

      var current = null;
      for (var i = 0; i < lists.length; i++) {
        if (String(lists[i].id) === String(currentListId)) {
          current = lists[i];
          break;
        }
      }
      if (!current) return groups;

      var style = statutCategoryStyle('_none');
      var next = groups.slice();
      next.push({
        key: '_none',
        label: 'Non assigné',
        lists: [current],
        color: style.color,
        icon: style.icon,
      });
      return next;
    }

    function renderHero() {
      if (!heroEl) return;
      heroEl.replaceChildren();
      var cat = currentCategory() || '_none';
      var style = statutCategoryStyle(cat);
      var color = style.color || '#626f86';
      var name = currentListName() || (currentListId ? 'Liste inconnue' : '—');
      heroEl.style.setProperty('--statut-color', color);
      heroEl.dataset.category = cat;

      var iconWrap = document.createElement('div');
      iconWrap.className = 'statut-hero-icon';
      iconWrap.appendChild(createStatutIcon(style.icon || 'dot', 28));

      var nameEl = document.createElement('div');
      nameEl.className = 'statut-hero-name';
      nameEl.textContent = name;

      heroEl.appendChild(iconWrap);
      heroEl.appendChild(nameEl);
    }

    function renderOptions() {
      groupsEl.replaceChildren();
      var groups = ensureCurrentListVisible(buildGroups());
      emptyEl.hidden = lists.length > 0;
      settingsBtn.hidden = !onOpenSettings;
      if (embeddedBar) embeddedBar.hidden = !onOpenSettings;
      renderHero();

      if (!groups.length) return;

      function statutTitleKey(s) {
        return String(s || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '');
      }

      var chipRow = document.createElement('div');
      chipRow.className = 'statut-chip-row';
      chipRow.setAttribute('role', 'group');
      chipRow.setAttribute('aria-label', 'Statuts');

      groups.forEach(function (group) {
        var style = statutCategoryStyle(group.key);
        var color = group.color || style.color;
        var iconKey = group.icon || style.icon;

        group.lists.forEach(function (list) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'statut-list-option';
          btn.dataset.listId = list.id;
          btn.dataset.category = group.key;
          btn.setAttribute('role', 'option');
          btn.style.setProperty('--statut-color', color);
          var selected = String(list.id) === String(currentListId);
          btn.classList.toggle('is-selected', selected);
          btn.setAttribute('aria-selected', selected ? 'true' : 'false');
          btn.disabled = busy;
          // Avoid "En cours — En cours" when the list name already matches the category.
          var groupLabel = String(group.label || '').trim();
          var listName = String(list.name || '').trim();
          btn.title =
            groupLabel &&
            listName &&
            statutTitleKey(groupLabel) !== statutTitleKey(listName)
              ? groupLabel + ' — ' + listName
              : '';

          btn.appendChild(createStatutIcon(iconKey));
          var nameSpan = document.createElement('span');
          nameSpan.className = 'statut-list-option-name';
          nameSpan.textContent = list.name;
          btn.appendChild(nameSpan);

          btn.addEventListener('click', function () {
            if (busy || String(list.id) === String(currentListId)) return;
            selectList(list.id);
          });
          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function' &&
            typeof global.ContextMenu.buildStatutChipItems === 'function'
          ) {
            ContextMenu.bind(btn, function () {
              return ContextMenu.buildStatutChipItems({
                listName: list.name,
                selected: String(list.id) === String(currentListId),
                busy: busy,
                onSelect: function () {
                  if (busy || String(list.id) === String(currentListId)) return;
                  selectList(list.id);
                },
                onOpenSettings: onOpenSettings
                  ? function () {
                      Promise.resolve(onOpenSettings()).catch(function (err) {
                        console.error('Statut open settings failed', err);
                      });
                    }
                  : null,
              });
            });
          }
          chipRow.appendChild(btn);
        });
      });

      groupsEl.appendChild(chipRow);
      syncStatutSectionTint();
    }

    if (embeddedToggleBtn) {
      embeddedToggleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        setEmbeddedDetailsExpanded(!embeddedDetailsExpanded);
      });
    }

    if (embeddedSummaryEl) {
      embeddedSummaryEl.addEventListener('click', function () {
        if (!embeddedDetailsExpanded) setEmbeddedDetailsExpanded(true);
      });
    }

    function selectList(listId) {
      if (!onSelectList) {
        currentListId = String(listId);
        if (embedded && currentCategory() === 'blocked' && !embeddedDetailsExpanded) {
          setEmbeddedDetailsExpanded(true, { notifyLayout: false });
        }
        renderOptions();
        refreshSummary();
        syncStatutSectionTint();
        onChange({ listId: currentListId });
        return;
      }
      busy = true;
      renderOptions();
      Promise.resolve(onSelectList(listId))
        .then(function (result) {
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
            }
            return;
          }
          currentListId = String(listId);
          if (embedded && currentCategory() === 'blocked' && !embeddedDetailsExpanded) {
            setEmbeddedDetailsExpanded(true, { notifyLayout: false });
          }
          setAuthHint('');
          onChange({ listId: currentListId, result: result });
        })
        .catch(function (err) {
          console.error('Statut list select failed', err);
        })
        .then(function () {
          busy = false;
          renderOptions();
          refreshSummary();
          syncStatutSectionTint();
          onLayoutChange();
        });
    }

    var collapse = null;
    if (!embedded) {
      collapse = bindCollapsibleEnable({
        field: field,
        body: body,
        chrome: chrome,
        alwaysEnabled: true,
        enabled: true,
        expanded:
          config.expanded != null
            ? !!config.expanded
            : true,
        getSummary: summaryContent,
        onLayoutChange: onLayoutChange,
        onExpandChange: config.onExpandChange || function () {},
        onEnableChange: function (on) {
          if (typeof config.onEnableChange === 'function') {
            config.onEnableChange(on);
          }
          onLayoutChange();
        },
      });
    }

    function refreshSummary() {
      if (collapse) collapse.refreshSummary();
      if (embedded) refreshEmbeddedHeaderSummary();
    }

    renderOptions();
    if (embedded) {
      setEmbeddedDetailsExpanded(embeddedDetailsExpanded, {
        persist: false,
        notifyLayout: false,
      });
    }
    refreshSummary();

    return {
      field: field,
      getListId: function () {
        return currentListId;
      },
      getCategory: currentCategory,
      getBlockedMount: function () {
        return blockedMount;
      },
      syncBlockedPanel: syncStatutSectionTint,
      setExpanded: function (on, opts) {
        if (!collapse && embedded) return setEmbeddedDetailsExpanded(on, opts);
        if (!collapse) return;
        return collapse.setExpanded(on, opts);
      },
      isExpanded: function () {
        if (collapse) return collapse.isExpanded();
        return embedded ? !!embeddedDetailsExpanded : true;
      },
      setBlockedSummary: function (reasons) {
        embeddedBlockedReasons = normalizeBlockedReasons(reasons);
        refreshEmbeddedSummary();
      },
      setListId: function (listId) {
        currentListId = listId ? String(listId) : '';
        renderOptions();
        refreshSummary();
        syncStatutSectionTint();
      },
      setData: function (next) {
        if (!next) return;
        if (next.lists) lists = next.lists.slice();
        if (next.settings) {
          settings = next.settings;
          if (
            typeof global.StatutMatch !== 'undefined' &&
            typeof global.StatutMatch.applyStateColors === 'function'
          ) {
            global.StatutMatch.applyStateColors(settings.stateColors);
          }
        }
        if (next.listId != null) currentListId = next.listId ? String(next.listId) : '';
        if (next.authReason != null) {
          setAuthHint(next.authReason);
        } else if (next.needsAuth != null) {
          setAuthHint(next.needsAuth ? 'not-authorized' : '');
        }
        if (next.showUnassigned != null) {
          showUnassigned = !!next.showUnassigned;
        } else if (next.settings) {
          showUnassigned = !!settings.showUnassigned;
        }
        renderOptions();
        refreshSummary();
        syncStatutSectionTint();
        onLayoutChange();
      },
      isEnabled: function () {
        return collapse ? collapse.isEnabled() : true;
      },
      setEnabled: function (on, opts) {
        if (!collapse) return;
        return collapse.setEnabled(on, opts);
      },
      refreshSummary: refreshSummary,
    };
  }

  function normalizeParentCards(raw) {
    var list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object' || !item.id) continue;
      var id = String(item.id);
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push({
        id: id,
        name: typeof item.name === 'string' ? item.name : '',
        list: typeof item.list === 'string' ? item.list : '',
      });
    }
    return out;
  }

  var PROGRESS_CHECK_SVG =
    '<svg class="tp-completion-check-icon" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3.5 8.2 L6.6 11.2 L12.5 4.8"></path>' +
    '</svg>';
  var PROGRESS_PAUSE_SVG =
    '<svg class="tp-completion-check-icon tp-completion-pause-icon" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">' +
    '<rect x="5" y="4" width="2.2" height="8" rx="0.8" fill="currentColor"></rect>' +
    '<rect x="8.8" y="4" width="2.2" height="8" rx="0.8" fill="currentColor"></rect>' +
    '</svg>';

  /**
   * Compact Progrès header summary: same ring + % + bar + color as the Overview cell.
   * When blocked, shows Motif (block reason) only — no progress bar.
   * Returns a DOM node, or '' when there is nothing to show.
   */
  function buildProgressSummaryNode(opts) {
    opts = opts || {};
    var percent =
      opts.progressPercent != null && isFinite(+opts.progressPercent)
        ? Math.max(0, Math.min(100, Math.round(+opts.progressPercent)))
        : null;
    // Statut Terminé / explicit complete → treat as 100% even if percent lags at 0.
    if (
      opts.statusCategory === 'completed' ||
      opts.forceComplete === true
    ) {
      percent = 100;
    }
    if (percent == null) return '';

    var color =
      typeof opts.progressColor === 'string' ? opts.progressColor : '';
    var blocked = !!opts.progressBlocked && percent < 100;
    var title = typeof opts.title === 'string' ? opts.title.trim() : '';
    var donePct = percent >= 100;
    var showReason = blocked && !donePct;
    var accent = blocked
      ? readCssVar('--blocked-accent', '#ae2e24')
      : color || '';

    var wrap = document.createElement('span');
    wrap.className = 'progress-summary';
    if (title) wrap.title = title;
    wrap.classList.toggle('is-blocked', showReason);
    if (accent) {
      wrap.style.setProperty('--overview-progress-accent', accent);
      wrap.classList.add('has-progress-accent');
    }

    var valueRow = document.createElement('span');
    valueRow.className = 'progress-summary-value';

    var ring = document.createElement('span');
    ring.className = 'overview-progress-ring tp-completion-check';
    ring.setAttribute('aria-hidden', 'true');
    ring.classList.toggle('is-checked', donePct);
    ring.classList.toggle('has-progress', percent > 0 && !donePct);
    ring.classList.toggle('is-blocked', showReason);
    ring.style.setProperty('--completion-progress', String(percent));
    if (accent) {
      ring.style.setProperty('--completion-check-fill', accent);
    }
    ring.innerHTML = showReason ? PROGRESS_PAUSE_SVG : PROGRESS_CHECK_SVG;

    var pctText = document.createElement('span');
    pctText.className = 'overview-progress-pct';
    if (showReason) {
      pctText.classList.add('progress-summary-reason');
      pctText.textContent = title || 'Bloqu\u00e9';
    } else {
      pctText.textContent = percent + '\u00a0%';
    }

    valueRow.appendChild(ring);
    valueRow.appendChild(pctText);

    wrap.appendChild(valueRow);
    // Blocked summary shows Motif only — no progress bar.
    if (!showReason) {
      var track = document.createElement('span');
      track.className = 'overview-progress-track';
      var fill = document.createElement('span');
      fill.className = 'overview-progress-fill';
      fill.style.width = percent + '%';
      track.appendChild(fill);
      wrap.appendChild(track);
    }
    return wrap;
  }

  /**
   * Build open/blocked task rows + counts from completion data for the Résumé.
   */
  function buildOverviewTasksFromCompletion(completion, options) {
    options = options || {};
    var cap =
      options.cap != null && isFinite(+options.cap)
        ? Math.max(0, Math.round(+options.cap))
        : 5;
    var items =
      completion && Array.isArray(completion.items) ? completion.items : [];
    var CT = global.CompletionTrello;
    var tasks = [];
    var doneCount = 0;
    var totalCount = 0;
    var openLabels = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== 'object') continue;
      var text = typeof it.text === 'string' ? it.text.trim() : '';
      if (!text) continue;
      totalCount += 1;
      var blocked =
        CT && typeof CT.isItemBlocked === 'function'
          ? !!CT.isItemBlocked(it)
          : it.blocked === true;
      var done =
        !blocked &&
        (!!it.done ||
          (it.progress != null && isFinite(+it.progress) && +it.progress >= 100));
      if (done) {
        doneCount += 1;
        continue;
      }
      openLabels.push(text);
      if (tasks.length < cap) {
        tasks.push({
          id: it.id != null ? String(it.id) : '',
          text: text,
          done: false,
          blocked: blocked
        });
      }
    }
    return {
      tasks: tasks,
      tasksDone: doneCount,
      tasksTotal: totalCount,
      tasksOpen: Math.max(0, totalCount - doneCount),
      openLabels: openLabels
    };
  }

  /**
   * Deterministic one-line situation for the Résumé (no AI).
   * Prefers Motifs when blocked; otherwise open task names.
   */
  function buildOverviewSummaryText(opts) {
    opts = opts || {};
    var Agent = global.PriorityAgent;
    if (Agent && typeof Agent.buildHeuristicProgressSummary === 'function') {
      var snap = {
        phase: opts.phase || 'idle',
        stuck: !!opts.stuck,
        blockedReasons: Array.isArray(opts.blockedReasons)
          ? opts.blockedReasons
          : [],
        progressPercent:
          opts.progressPercent != null && isFinite(+opts.progressPercent)
            ? Math.round(+opts.progressPercent)
            : null,
        tasksDone: opts.tasksDone != null ? opts.tasksDone : 0,
        tasksTotal: opts.tasksTotal != null ? opts.tasksTotal : 0,
        tasksOpen: opts.tasksOpen != null ? opts.tasksOpen : 0,
        openLabels: Array.isArray(opts.openLabels) ? opts.openLabels : []
      };
      var fromAgent = Agent.buildHeuristicProgressSummary(snap);
      if (fromAgent) return fromAgent;
    }

    var blocked = !!opts.stuck || opts.phase === 'blocked';
    var reasons = Array.isArray(opts.blockedReasons)
      ? opts.blockedReasons.filter(Boolean)
      : [];
    if (blocked) {
      if (!reasons.length) return 'Bloqu\u00e9';
      if (reasons.length === 1) return String(reasons[0]);
      var joined = reasons.join(', ');
      if (joined.length <= 42) return joined;
      return reasons[0] + ' +' + (reasons.length - 1);
    }
    var total = opts.tasksTotal != null ? +opts.tasksTotal : 0;
    var open = opts.tasksOpen != null ? +opts.tasksOpen : 0;
    var labels = Array.isArray(opts.openLabels)
      ? opts.openLabels.filter(Boolean)
      : [];
    var pct =
      opts.progressPercent != null && isFinite(+opts.progressPercent)
        ? Math.round(+opts.progressPercent)
        : null;
    if (!total) {
      if (opts.phase === 'done' || (pct != null && pct >= 100)) {
        return 'Compl\u00e9t\u00e9';
      }
      if (pct != null && pct > 0 && pct < 100) return pct + '\u00a0%';
      return 'En attente';
    }
    if (opts.phase === 'done' || open <= 0) return 'Compl\u00e9t\u00e9';
    if (labels.length === 1) return 'Reste\u00a0: ' + labels[0] + '.';
    if (labels.length === 2) {
      return 'Reste\u00a0: ' + labels[0] + ' et ' + labels[1] + '.';
    }
    if (labels.length > 2) {
      return (
        'Reste\u00a0: ' +
        labels[0] +
        ', ' +
        labels[1] +
        ' +' +
        (labels.length - 2) +
        '.'
      );
    }
    return open + ' t\u00e2che' + (open > 1 ? 's' : '') + ' restante' + (open > 1 ? 's' : '');
  }

  /**
   * Enrichment payload from completion + priority Motifs for Résumé / snapshot.
   */
  function buildOverviewEnrichment(completion, options) {
    options = options || {};
    var taskMeta = buildOverviewTasksFromCompletion(completion, {
      cap: options.taskCap != null ? options.taskCap : 5
    });
    var CT = global.CompletionTrello;
    var fromCompletion =
      CT && typeof CT.aggregateBlockedReasons === 'function'
        ? CT.aggregateBlockedReasons(completion || { items: [] })
        : [];
    if (!fromCompletion.length && completion && Array.isArray(completion.items)) {
      var seenReasons = Object.create(null);
      var fallback = [];
      function pushReason(reason) {
        var n = normalizeBlockedReason(reason);
        if (!n || seenReasons[n]) return;
        seenReasons[n] = true;
        fallback.push(n);
      }
      if (completion.blocked === true && Array.isArray(completion.blockedReasons)) {
        for (var mr = 0; mr < completion.blockedReasons.length; mr++) {
          pushReason(completion.blockedReasons[mr]);
        }
      }
      for (var ii = 0; ii < completion.items.length; ii++) {
        var bit = completion.items[ii];
        if (!bit || bit.blocked !== true) continue;
        if (!Array.isArray(bit.blockedReasons)) continue;
        for (var br = 0; br < bit.blockedReasons.length; br++) {
          pushReason(bit.blockedReasons[br]);
        }
      }
      fromCompletion = fallback;
    }
    var fromPriority = normalizeBlockedReasons(
      options.blockedReasons != null
        ? options.blockedReasons
        : options.priorityReasons
    );
    var blockedReasons = fromCompletion.length ? fromCompletion : fromPriority;
    if (
      options.links != null ||
      (options.items != null && options.items.length)
    ) {
      blockedReasons = expandBlockedReasonsForDisplay(
        blockedReasons,
        options.links,
        options.items || (completion && completion.items) || []
      );
    }
    var progressBlocked = !!options.progressBlocked;
    if (
      !progressBlocked &&
      CT &&
      typeof CT.hasAnyBlocked === 'function' &&
      completion
    ) {
      progressBlocked = !!CT.hasAnyBlocked(completion);
    }
    var statusCategory =
      typeof options.statusCategory === 'string' ? options.statusCategory : '';
    var progressPercent =
      options.progressPercent != null && isFinite(+options.progressPercent)
        ? Math.max(0, Math.min(100, Math.round(+options.progressPercent)))
        : null;
    var isDone =
      statusCategory === 'completed' ||
      (progressPercent != null && progressPercent >= 100);
    var isBlocked =
      !isDone && (statusCategory === 'blocked' || progressBlocked);
    var phase = isDone
      ? 'done'
      : isBlocked
        ? 'blocked'
        : taskMeta.tasksTotal > 0 && taskMeta.tasksDone > 0
          ? 'in_progress'
          : progressPercent != null && progressPercent > 0
            ? 'in_progress'
            : 'not_started';
    var summaryText =
      typeof options.summaryText === 'string' && options.summaryText.trim()
        ? options.summaryText.trim()
        : buildOverviewSummaryText({
            phase: phase,
            stuck: isBlocked,
            blockedReasons: blockedReasons,
            progressPercent: progressPercent,
            tasksDone: taskMeta.tasksDone,
            tasksTotal: taskMeta.tasksTotal,
            tasksOpen: taskMeta.tasksOpen,
            openLabels: taskMeta.openLabels
          });
    return {
      summaryText: summaryText,
      blockedReasons: blockedReasons,
      tasks: taskMeta.tasks,
      tasksDone: taskMeta.tasksDone,
      tasksTotal: taskMeta.tasksTotal,
      tasksOpen: taskMeta.tasksOpen,
      phase: phase
    };
  }

  // exports
  S.PROGRESS_CHECK_SVG = PROGRESS_CHECK_SVG;
  S.PROGRESS_PAUSE_SVG = PROGRESS_PAUSE_SVG;
  S.bindCollapsibleEnable = bindCollapsibleEnable;
  S.buildOverviewEnrichment = buildOverviewEnrichment;
  S.buildOverviewSummaryText = buildOverviewSummaryText;
  S.buildOverviewTasksFromCompletion = buildOverviewTasksFromCompletion;
  S.buildProgressSummaryNode = buildProgressSummaryNode;
  S.createStatutField = createStatutField;
  S.createStatutIcon = createStatutIcon;
  S.normalizeParentCards = normalizeParentCards;
  S.statutCategoryStyle = statutCategoryStyle;
})(typeof window !== 'undefined' ? window : this);
