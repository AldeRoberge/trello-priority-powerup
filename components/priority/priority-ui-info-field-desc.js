/**
 * priority-ui-info-field: createInfoField() part 1 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.DM = function DM() {
      return global.DescMeta || null;
    };
    M.splitFullDesc = function splitFullDesc(full) {
      var dm = M.DM();
      if (dm && typeof dm.splitDesc === 'function') {
        return dm.splitDesc(full);
      }
      return {
        visible: typeof full === 'string' ? full : '',
        meta: {},
        hasMeta: false,
      };
    };
    M.joinFullDesc = function joinFullDesc(visible, meta) {
      var dm = M.DM();
      if (dm && typeof dm.joinDesc === 'function') {
        return dm.joinDesc(visible, meta);
      }
      return typeof visible === 'string' ? visible : '';
    };
    M.cloneMetaMap = function cloneMetaMap(meta) {
      var out = Object.create(null);
      if (!meta || typeof meta !== 'object') return out;
      Object.keys(meta).forEach(function (k) {
        if (meta[k] != null && String(meta[k]).trim() !== '') {
          out[k] = String(meta[k]).trim();
        }
      });
      return out;
    };
    M.editorShowsFullDesc = function editorShowsFullDesc() {
      return !!M.showDescMeta;
    };
    M.visibleFromEditorValue = function visibleFromEditorValue(value) {
      if (M.editorShowsFullDesc()) {
        return M.splitFullDesc(value).visible;
      }
      return typeof value === 'string' ? value : '';
    };
    M.fullDescFromEditor = function fullDescFromEditor() {
      M.syncDescSourceFromRich();
      var raw = M.descInput.value;
      if (M.editorShowsFullDesc()) {
        var split = M.splitFullDesc(raw);
        M.descMetaMap = M.cloneMetaMap(split.meta);
        return M.joinFullDesc(split.visible, M.descMetaMap);
      }
      return M.joinFullDesc(raw, M.descMetaMap);
    };
    M.applyFullDescToEditor = function applyFullDescToEditor(full, options) {
      options = options || {};
      var split = M.splitFullDesc(full);
      M.descMetaMap = M.cloneMetaMap(split.meta);
      var shown = M.editorShowsFullDesc()
        ? M.joinFullDesc(split.visible, M.descMetaMap)
        : split.visible;
      M.descText = full;
      M.descInput.value = shown;
      M.syncDescMetaToggle();
      if (options.skipRender) return;
      if (M.descMode === 'rich') M.renderDescRich();
      else M.syncDescInputSize();
    };
    M.makeRow = function makeRow(key, labelText, options) {
      options = options || {};
      var row = document.createElement('div');
      row.className = 'info-row info-row--' + key;
      if (options.interactive) row.classList.add('is-interactive');

      var label = document.createElement('div');
      label.className = 'info-row-label';
      label.title = labelText;
      if (options.icon) {
        var labelIcon = document.createElement('i');
        labelIcon.className = 'ti ' + options.icon + ' info-row-icon';
        labelIcon.setAttribute('aria-hidden', 'true');
        label.appendChild(labelIcon);
      }
      var labelTextEl = document.createElement('span');
      labelTextEl.className = 'info-row-label-text';
      labelTextEl.textContent = labelText;
      label.appendChild(labelTextEl);

      var value = document.createElement('div');
      value.className = 'info-row-value';

      row.appendChild(label);
      row.appendChild(value);

      if (options.interactive && M.onJump) {
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.title = 'Aller \u00e0 ' + labelText;
        function jump() {
          M.onJump(key);
        }
        row.addEventListener('click', jump);
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            jump();
          }
        });
      }

      if (
        options.collapsible !== false &&
        !options.interactive &&
        key !== 'creator' &&
        key !== 'more-details'
      ) {
        M.makeRowCollapsible(key, row, label, value);
      }

      return { row: row, value: value };
    };
    M.rowCollapsedStore = function rowCollapsedStore(key, next) {
      var storeKey = 'tp-info-row-collapsed:' + key;
      try {
        if (next === undefined) return global.localStorage.getItem(storeKey) === '1';
        if (next) global.localStorage.setItem(storeKey, '1');
        else global.localStorage.removeItem(storeKey);
      } catch (e) {}
      return !!next;
    };
    M.startRowEdit = function startRowEdit(value) {
      var el = S.firstRowEditControl(value);
      if (!el) return;
      try {
        if (String(el.tagName || '').toUpperCase() === 'BUTTON') el.click();
        else el.focus();
      } catch (e) {}
    };
    M.genericRowSummary = function genericRowSummary(value) {
      var clone = value.cloneNode(true);
      Array.prototype.forEach.call(
        clone.querySelectorAll('button, script, style, [hidden], textarea'),
        function (n) {
          n.remove();
        }
      );
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    };
    M.sortEmptyRowsDown = function sortEmptyRowsDown(container) {
      if (M.sortingRows) return;
      container = container || M.body;
      var rows = Array.prototype.filter.call(container.children, function (el) {
        return el.classList && el.classList.contains('is-collapsible');
      });
      if (rows.length < 2) return;
      var byOrder = function (a, b) {
        return +a.dataset.rowOrder - +b.dataset.rowOrder;
      };
      var filled = rows.filter(function (r) { return r.dataset.rowEmpty !== '1'; }).sort(byOrder);
      var empty = rows.filter(function (r) { return r.dataset.rowEmpty === '1'; }).sort(byOrder);
      var ordered = filled.concat(empty);
      if (ordered.every(function (r, i) { return r === rows[i]; })) return;
      M.sortingRows = true;
      try {
        var marks = rows.map(function (r) {
          var m = document.createComment('');
          container.insertBefore(m, r);
          return m;
        });
        ordered.forEach(function (r, i) {
          container.insertBefore(r, marks[i]);
        });
        marks.forEach(function (m) {
          container.removeChild(m);
        });
      } finally {
        M.sortingRows = false;
      }
    };
    M.makeRowCollapsible = function makeRowCollapsible(key, row, label, value) {
      row.classList.add('is-collapsible');
      row.dataset.rowOrder = String(M.rowOrderSeq++);
      var chevron = document.createElement('i');
      chevron.className = 'ti ti-chevron-down info-row-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      var summary = document.createElement('span');
      summary.className = 'info-row-summary';
      summary.hidden = true;
      label.classList.add('info-row-toggle');
      label.setAttribute('role', 'button');
      label.tabIndex = 0;
      label.appendChild(summary);
      label.appendChild(chevron);

      function refresh() {
        if (!row.classList.contains('is-collapsed')) {
          row.dataset.rowEmpty = '0';
          M.sortEmptyRowsDown(row.parentNode);
          return;
        }
        var text = '';
        try {
          text = M.rowSummaries[key] ? M.rowSummaries[key]() : M.genericRowSummary(value);
        } catch (e) {
          text = M.genericRowSummary(value);
        }
        var isNode = !!(text && text.nodeType);
        var plain = isNode ? (text.textContent || '').trim() : String(text || '').trim();
        var tip = (isNode && text.summaryTitle) || plain;
        if (isNode && plain) summary.replaceChildren(text);
        else if (plain) summary.textContent = plain;
        else {
          var plus = document.createElement('i');
          var promptText = M.ROW_EMPTY_PROMPTS[key] || 'Cliquer pour ajouter';
          // + means "create a new item"; choosing or setting a value gets a pencil.
          plus.className = (/ajouter/.test(promptText) ? 'ti ti-plus' : 'ti ti-pencil') + ' info-row-summary-plus';
          plus.setAttribute('aria-hidden', 'true');
          var hint = document.createElement('span');
          hint.className = 'info-row-summary-main';
          hint.textContent = M.ROW_EMPTY_PROMPTS[key] || 'Cliquer pour ajouter';
          summary.replaceChildren(plus, hint);
        }
        summary.classList.toggle('is-empty', !plain);
        summary.title = tip;
        row.dataset.rowEmpty = !plain && key !== 'title' ? '1' : '0';
        M.sortEmptyRowsDown(row.parentNode);
      }

      function setCollapsed(next) {
        row.classList.toggle('is-collapsed', next);
        label.setAttribute('aria-expanded', next ? 'false' : 'true');
        summary.hidden = !next;
        refresh();
        M.onLayoutChangeSafe();
      }

      // Quiet when empty, rich when set: a row with a value is always open, an
      // empty one folds to one dimmed line until the user opens it to add.
      var userOpened = false;
      function isEmptyNow() {
        var text = '';
        try {
          text = M.rowSummaries[key] ? M.rowSummaries[key]() : M.genericRowSummary(value);
        } catch (e) {
          text = M.genericRowSummary(value);
        }
        var plain = text && text.nodeType ? (text.textContent || '').trim() : String(text || '').trim();
        return !plain;
      }
      function rowHasFocus() {
        var active = global.document && global.document.activeElement;
        return !!(active && row.contains(active));
      }
      function autoFold() {
        var collapsed = row.classList.contains('is-collapsed');
        var empty = isEmptyNow();
        if (collapsed && !empty) setCollapsed(false);
        else if (!collapsed && empty && !userOpened && !rowHasFocus()) setCollapsed(true);
      }

      function toggle(event) {
        event.preventDefault();
        if (!row.classList.contains('is-collapsed')) return;
        userOpened = true;
        var wasEmpty = summary.classList.contains('is-empty');
        setCollapsed(false);
        if (wasEmpty) {
          setTimeout(function () {
            M.startRowEdit(value);
          }, 0);
        }
      }
      label.addEventListener('click', toggle);
      label.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') toggle(event);
      });
      row.addEventListener('focusout', function () {
        setTimeout(function () {
          if (rowHasFocus()) return;
          userOpened = false;
          autoFold();
        }, 150);
      });

      if (typeof global.MutationObserver === 'function') {
        var timer = null;
        new global.MutationObserver(function () {
          clearTimeout(timer);
          timer = setTimeout(autoFold, 80);
        }).observe(value, { childList: true, subtree: true, characterData: true });
      }
      setCollapsed(false);
      setTimeout(autoFold, 0);
      setTimeout(autoFold, 600);
    };
    M.onLayoutChangeSafe = function onLayoutChangeSafe() {
      try {
        if (typeof M.onLayoutChange === 'function') M.onLayoutChange();
      } catch (e) {}
    };
    M.makeDescToolbarBtn = function makeDescToolbarBtn(opts) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-desc-toolbar-btn';
      if (opts.mod) btn.className += ' ' + opts.mod;
      btn.title = opts.title;
      btn.setAttribute('aria-label', opts.label || opts.title);
      btn.setAttribute('data-md-action', opts.action);
      btn.innerHTML =
        '<i class="ti ' + opts.icon + '" aria-hidden="true"></i>';
      return btn;
    };
    M.makeDescModeBtn = function makeDescModeBtn(mode, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-desc-mode-btn';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-desc-mode', mode);
      btn.textContent = label;
      M.descModeSwitch.appendChild(btn);
      return btn;
    };
    M.syncDescMetaToggle = function syncDescMetaToggle() {
      var has =
        Object.keys(M.descMetaMap).length > 0 ||
        (M.editorShowsFullDesc() && M.splitFullDesc(M.descInput.value).hasMeta);
      M.descMetaToggle.hidden = !has && !M.showDescMeta;
      M.descMetaToggle.setAttribute('aria-pressed', M.showDescMeta ? 'true' : 'false');
      M.descMetaToggle.textContent = M.showDescMeta
        ? 'Masquer les m\u00e9tadonn\u00e9es'
        : 'Afficher les m\u00e9tadonn\u00e9es masqu\u00e9es';
    };
    M.mountText = function mountText(mount, selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var el = mount.querySelector(selectors[i]);
        var t = el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (t) return t;
      }
      return '';
    };
    M.irsEl = function irsEl(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    };
    M.irsIcon = function irsIcon(name, className) {
      var i = document.createElement('i');
      i.className = 'ti ti-' + name + (className ? ' ' + className : '');
      i.setAttribute('aria-hidden', 'true');
      return i;
    };
    M.irsChip = function irsChip(opts) {
      var chip = M.irsEl('span', 'irs-chip' + (opts.className ? ' ' + opts.className : ''));
      if (opts.accent) chip.style.setProperty('--irs-accent', opts.accent);
      if (opts.title) chip.title = opts.title;
      if (opts.lead) chip.appendChild(opts.lead);
      if (opts.text) chip.appendChild(M.irsEl('span', 'irs-chip-text', opts.text));
      return chip;
    };
    M.irsFragment = function irsFragment(nodes, title) {
      var frag = document.createDocumentFragment();
      nodes.forEach(function (n, i) {
        if (i) frag.appendChild(document.createTextNode(' '));
        frag.appendChild(n);
      });
      if (title) frag.summaryTitle = title;
      return frag;
    };
    M.irsCapped = function irsCapped(nodes, max) {
      if (nodes.length <= max) return nodes;
      var out = nodes.slice(0, max);
      out.push(
        M.irsChip({
          className: 'irs-chip--more',
          text: '+' + (nodes.length - max)
        })
      );
      return out;
    };
    M.irsHueColor = function irsHueColor(seed) {
      return 'hsl(' + M.tgHue(String(seed || '?')) + ' 62% 58%)';
    };
    M.irsColorOf = function irsColorOf(el) {
      if (!el) return '';
      var c = el.style && (el.style.backgroundColor || el.style.background);
      if (c) return c;
      try {
        var computed = global.getComputedStyle(el).backgroundColor;
        if (computed && computed !== 'transparent' && computed !== 'rgba(0, 0, 0, 0)') {
          return computed;
        }
      } catch (e) {}
      return '';
    };
    M.irsAvatar = function irsAvatar(member) {
      var resolved = M.enrichMemberAvatar(member);
      var url = M.memberAvatarUrl(resolved);
      var mid = member && member.id != null ? String(member.id) : '';
      var wrap = M.irsEl('span', 'irs-avatar');
      function initialsFallback() {
        wrap.replaceChildren();
        wrap.classList.add('is-initials');
        wrap.style.setProperty('--irs-hue', String(M.tgHue(mid || M.memberDisplayName(resolved) || '?')));
        wrap.setAttribute('data-initials', M.memberInitials(resolved));
      }
      if (url) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.width = 20;
        img.height = 20;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', initialsFallback);
        wrap.appendChild(img);
      } else {
        initialsFallback();
      }
      return wrap;
    };
    M.irsTypeChip = function irsTypeChip(id) {
      var label = S.taskTypeLabel(id) || id;
      var icon = M.irsEl('span', 'irs-type-icon');
      icon.innerHTML = S.taskTypeIconSvg(id);
      return M.irsChip({
        className: 'irs-type',
        accent: M.irsHueColor(id),
        lead: icon,
        text: label,
        title: S.taskTypeHint(id) || label
      });
    };
    M.irsLabelChip = function irsLabelChip(label) {
      var hex = M.labelColorHex(label && label.color);
      var name = M.labelDisplayName(label);
      var chip = M.irsChip({ className: 'irs-label', text: name, title: name });
      chip.style.setProperty('--label-color', hex);
      chip.style.setProperty('--label-fg', M.labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff');
      return chip;
    };
    M.irsParentChip = function irsParentChip(parent, withList) {
      var chip = M.irsChip({
        className: 'irs-parent',
        lead: M.irsIcon('hierarchy-3'),
        text: parent.name || 'Carte sans titre',
        title: parent.list ? (parent.name || '') + ' — ' + parent.list : parent.name || ''
      });
      if (withList && parent.list) {
        chip.appendChild(M.irsEl('span', 'irs-chip-sub', parent.list));
      }
      return chip;
    };
    M.objectifCrumbNames = function objectifCrumbNames() {
      return Array.prototype.map
        .call(
          M.objectifMount.querySelectorAll('.objectif-breadcrumb .objectif-crumb'),
          function (n) {
            var c = n.cloneNode(true);
            Array.prototype.forEach.call(c.querySelectorAll('.objectif-retired-tag'), function (t) {
              t.remove();
            });
            return (c.textContent || '').replace(/\s+/g, ' ').trim();
          }
        )
        .filter(function (t) {
          return t && t !== '—';
        });
    };
    M.irsObjectifNode = function irsObjectifNode(names) {
      var wrap = M.irsEl('span', 'irs-crumbs');
      names.forEach(function (name, i) {
        if (i) wrap.appendChild(M.irsIcon('chevron-right', 'irs-arrow'));
        var last = i === names.length - 1;
        wrap.appendChild(
          M.irsChip({
            className: 'irs-objectif' + (last ? ' is-last' : ''),
            lead: last ? M.irsIcon('target-arrow') : null,
            text: name
          })
        );
      });
      return wrap;
    };
    },
    run: function (M) {
    M.el = M.config.el;
    M.onLayoutChange = M.config.onLayoutChange || function () {};
    M.onTitleChange =
      typeof M.config.onTitleChange === 'function' ? M.config.onTitleChange : null;
    M.onDescChange =
      typeof M.config.onDescChange === 'function' ? M.config.onDescChange : null;
    M.onMemberAdd =
      typeof M.config.onMemberAdd === 'function' ? M.config.onMemberAdd : null;
    M.onMemberRemove =
      typeof M.config.onMemberRemove === 'function' ? M.config.onMemberRemove : null;
    M.onMemberRolesChange =
      typeof M.config.onMemberRolesChange === 'function'
        ? M.config.onMemberRolesChange
        : null;
    M.onCustomAssigneesChange =
      typeof M.config.onCustomAssigneesChange === 'function'
        ? M.config.onCustomAssigneesChange
        : null;
    M.onCustomAssigneeCatalogChange =
      typeof M.config.onCustomAssigneeCatalogChange === 'function'
        ? M.config.onCustomAssigneeCatalogChange
        : null;
    if (Array.isArray(M.config.customAssigneeCatalog)) {
      S.setCustomAssigneeCatalog(M.config.customAssigneeCatalog);
    }
    M.onPlacesChange =
      typeof M.config.onPlacesChange === 'function' ? M.config.onPlacesChange : null;
    M.getPlaceDirectory =
      typeof M.config.getPlaceDirectory === 'function'
        ? M.config.getPlaceDirectory
        : null;
    M.onPlaceDirectorySave =
      typeof M.config.onPlaceDirectorySave === 'function'
        ? M.config.onPlaceDirectorySave
        : null;
    M.onPlaceCatalogChange =
      typeof M.config.onPlaceCatalogChange === 'function'
        ? M.config.onPlaceCatalogChange
        : null;
    if (Array.isArray(M.config.placeCatalog)) {
      S.setPlaceCatalog(M.config.placeCatalog);
    }
    M.onLabelAdd =
      typeof M.config.onLabelAdd === 'function' ? M.config.onLabelAdd : null;
    M.onLabelRemove =
      typeof M.config.onLabelRemove === 'function' ? M.config.onLabelRemove : null;
    M.onLabelDelete =
      typeof M.config.onLabelDelete === 'function' ? M.config.onLabelDelete : null;
    M.onLabelCreate =
      typeof M.config.onLabelCreate === 'function' ? M.config.onLabelCreate : null;
    M.onLabelColorChange =
      typeof M.config.onLabelColorChange === 'function'
        ? M.config.onLabelColorChange
        : null;
    M.onLabelRename =
      typeof M.config.onLabelRename === 'function' ? M.config.onLabelRename : null;
    M.suggestLabelsFn =
      typeof M.config.suggestLabels === 'function' ? M.config.suggestLabels : null;
    M.suggestTaskTypesFn =
      typeof M.config.suggestTaskTypes === 'function'
        ? M.config.suggestTaskTypes
        : null;
    M.onAuthorize =
      typeof M.config.onAuthorize === 'function' ? M.config.onAuthorize : null;
    M.onJump =
      typeof M.config.onJump === 'function' ? M.config.onJump : null;
    M.getBoardCards =
      typeof M.config.getBoardCards === 'function' ? M.config.getBoardCards : null;
    M.onParentChange =
      typeof M.config.onParentChange === 'function' ? M.config.onParentChange : null;
    M.onOpenParent =
      typeof M.config.onOpenParent === 'function' ? M.config.onOpenParent : null;
    M.onTaskTypesChange =
      typeof M.config.onTaskTypesChange === 'function'
        ? M.config.onTaskTypesChange
        : null;
    M.onCustomTaskTypesChange =
      typeof M.config.onCustomTaskTypesChange === 'function'
        ? M.config.onCustomTaskTypesChange
        : null;
    M.onDismissedTaskTypeSuggestionsChange =
      typeof M.config.onDismissedTaskTypeSuggestionsChange === 'function'
        ? M.config.onDismissedTaskTypeSuggestionsChange
        : null;
    M.bodyId = 'info-section-body-' + Math.random().toString(36).slice(2, 9);
    M.titleText = typeof M.config.title === 'string' ? M.config.title : '';
    M.descText = typeof M.config.desc === 'string' ? M.config.desc : '';
    M.members = Array.isArray(M.config.members) ? M.config.members.slice() : [];
    M.creatorMember =
      M.config.creator && typeof M.config.creator === 'object' && M.config.creator.id
        ? M.config.creator
        : null;
    M.boardMembers = Array.isArray(M.config.boardMembers)
      ? M.config.boardMembers.slice()
      : [];
    M.labels = Array.isArray(M.config.labels) ? M.config.labels.slice() : [];
    M.boardLabels = Array.isArray(M.config.boardLabels)
      ? M.config.boardLabels.slice()
      : [];
    M.priorityLabel = typeof M.config.priorityLabel === 'string' ? M.config.priorityLabel : '';
    M.impactReachLabel = typeof M.config.impactReach === 'string' ? M.config.impactReach : '';
    M.titleDirty = false;
    M.titleSaveTimer = null;
    M.titleBusy = false;
    M.descDirty = false;
    M.descSaveTimer = null;
    M.descBusy = false;
    M.descMetaMap = Object.create(null);
    M.showDescMeta = false;
    M.descSpellcheckGen = 0;
    M.descSpellcheckedText = M.descText.trim() || null;
    M.descSpellRevert = null;
    M.authBusy = false;
    M.authReason = M.config.authReason || '';
    M.membersBusy = false;
    M.membersPickerOpen = false;
    M.memberRoles = S.normalizeMemberRoles(M.config.memberRoles);
    M.memberRolesBusy = false;
    M.memberRolesPickerMemberId = '';
    M.customAssignees = S.normalizeCustomAssignees(M.config.customAssignees);
    M.teamLinks = S.normalizeTeamLinks(M.config.teamLinks);
    M.onTeamLinksChange =
      typeof M.config.onTeamLinksChange === 'function'
        ? M.config.onTeamLinksChange
        : null;
    M.cardPlaces = S.normalizePlaces(M.config.places);
    M.placesBusy = false;
    M.placesPickerSlot = '';
    M.placeEditKey = '';
    if (Array.isArray(M.config.memberRoleCustoms)) {
      S.setMemberRoleCustoms(M.config.memberRoleCustoms);
    }
    if (Array.isArray(M.config.memberRoleCatalog)) {
      S.setMemberRoleCatalog(M.config.memberRoleCatalog);
    }
    M.labelsBusy = false;
    M.labelsPickerOpen = false;
    M.labelsColorEditId = '';
    M.labelsRenameId = '';
    M.labelsRenameDraft = '';
    M.labelSuggestions = [];
    M.labelSuggestionsLoading = false;
    M.labelSuggestionsSeq = 0;
    M.labelSuggestionsTimer = null;
    M.labelSuggestionsKey = '';
    M.taskTypeSuggestions = [];
    M.taskTypeSuggestionsLoading = false;
    M.taskTypeSuggestionsSeq = 0;
    M.taskTypeSuggestionsTimer = null;
    M.taskTypeSuggestionsKey = '';
    M.parentCards = S.normalizeParentCards(
      Array.isArray(M.config.parents)
        ? M.config.parents
        : M.config.parent
          ? [M.config.parent]
          : []
    );
    M.parentBusy = false;
    M.parentPickerOpen = false;
    M.parentBoardCardsCache = null;
    M.taskTypes = S.normalizeTaskTypes(M.config.taskTypes);
    M.dismissedTaskTypeSuggestions = S.normalizeTaskTypes(
      M.config.dismissedTaskTypeSuggestions
    );
    M.taskTypesBusy = false;
    M.taskTypesPickerOpen = false;
    M.FIELD_SAVE_MS = 450;
    M.field = document.createElement('div');
    M.field.className = 'field field--info is-enabled is-unified';
    M.body = document.createElement('div');
    M.body.className = 'info-section-body';
    M.body.id = M.bodyId;
    M.moreBodyId =
      'more-details-body-' + Math.random().toString(36).slice(2, 9);
    M.moreBody = document.createElement('div');
    M.moreBody.className = 'more-details-section-body info-section-body';
    M.moreBody.id = M.moreBodyId;
    M.moreBody.hidden = true;
    M.historiqueMount = document.createElement('div');
    M.historiqueMount.className = 'info-historique-mount';
    M.moreDetailsExpanded =
      M.config.moreDetailsExpanded != null
        ? !!M.config.moreDetailsExpanded
        : false;
    M.onMoreDetailsExpandChange =
      typeof M.config.onMoreDetailsExpandChange === 'function'
        ? M.config.onMoreDetailsExpandChange
        : function () {};
    M.rowSummaries = Object.create(null);
    M.ROW_EMPTY_PROMPTS = {
      title: 'Cliquer pour nommer la carte',
      desc: 'Cliquer pour ajouter une description',
      members: 'Cliquer pour assigner quelqu’un',
      places: 'Cliquer pour ajouter un lieu',
      labels: 'Cliquer pour ajouter une étiquette',
      'task-types': 'Cliquer pour choisir un type',
      parent: 'Cliquer pour ajouter une tâche parente',
      objectif: 'Cliquer pour choisir un objectif',
      priority: 'Cliquer pour évaluer la priorité',
      progress: 'Cliquer pour définir le progrès',
      due: 'Cliquer pour définir une échéance'
    };
    M.rowOrderSeq = 0;
    M.sortingRows = false;
    M.titleRow = M.makeRow('title', 'Titre', { icon: 'ti-heading', collapsible: false });
    M.titleWrap = document.createElement('div');
    M.titleWrap.className = 'info-title-wrap';
    M.titleInput = document.createElement('textarea');
    M.titleInput.className = 'info-title-input';
    M.titleInput.id = 'cardName';
    M.titleInput.rows = 1;
    M.titleInput.setAttribute('aria-label', 'Titre de la carte');
    M.titleInput.setAttribute('aria-live', 'polite');
    M.titleInput.placeholder = 'Titre de la carte';
    if (M.titleText) {
      M.titleInput.value = M.titleText;
    } else {
      M.titleInput.classList.add('is-loading');
      M.titleInput.value = 'Chargement\u2026';
      M.titleInput.readOnly = true;
    }
    M.titleMeta = document.createElement('div');
    M.titleMeta.className = 'info-desc-meta';
    M.titleStatus = document.createElement('span');
    M.titleStatus.className = 'info-desc-status';
    M.titleStatus.setAttribute('aria-live', 'polite');
    M.titleMeta.appendChild(M.titleStatus);
    M.titleWrap.appendChild(M.titleInput);
    M.titleWrap.appendChild(M.titleMeta);
    M.titleRow.value.appendChild(M.titleWrap);
    M.body.appendChild(M.titleRow.row);
    M.descRow = M.makeRow('desc', 'Description', { icon: 'ti-notes' });
    M.descWrap = document.createElement('div');
    M.descWrap.className = 'info-desc-wrap';
    M.descMode = 'rich';
    M.descInput = document.createElement('textarea');
    M.descInput.className = 'info-desc-input';
    M.descInput.id = 'cardDesc';
    M.descInput.rows = 3;
    M.descInput.hidden = true;
    M.descInput.placeholder = 'Ajouter une description\u2026';
    M.descInput.setAttribute('aria-label', 'Description de la carte');
    M.descInput.setAttribute('spellcheck', 'false');
    (function initDescEditorValue() {
      var split = M.splitFullDesc(M.descText);
      M.descMetaMap = M.cloneMetaMap(split.meta);
      M.descInput.value = split.visible;
    })();
    M.descRich = document.createElement('div');
    M.descRich.className = 'info-desc-rich info-desc-preview';
    M.descRich.id = 'cardDescRich';
    M.descRich.contentEditable = 'true';
    M.descRich.setAttribute('role', 'textbox');
    M.descRich.setAttribute('aria-multiline', 'true');
    M.descRich.setAttribute('aria-label', 'Description de la carte, texte enrichi');
    M.descRich.setAttribute('spellcheck', 'true');
    M.descRich.setAttribute('data-placeholder', 'Ajouter une description\u2026');
    M.descToolbar = document.createElement('div');
    M.descToolbar.className = 'info-desc-toolbar';
    M.descToolbar.setAttribute('role', 'toolbar');
    M.descToolbar.setAttribute('aria-label', 'Mise en forme de la description');
    M.DESC_FORMAT_OPTIONS = [
      { kind: 'normal', label: 'Texte normal' },
      { kind: 'h1', label: 'Titre 1' },
      { kind: 'h2', label: 'Titre 2' },
      { kind: 'h3', label: 'Titre 3' },
      { kind: 'ul', label: 'Liste \u00e0 puces' },
      { kind: 'ol', label: 'Liste num\u00e9rot\u00e9e' },
      { kind: 'checklist', label: 'Liste de t\u00e2ches' }
    ];
    M.DESC_FORMAT_LABELS = {};
    M.DESC_FORMAT_OPTIONS.forEach(function (opt) {
      M.DESC_FORMAT_LABELS[opt.kind] = opt.label;
    });
    M.descFormatWrap = document.createElement('div');
    M.descFormatWrap.className = 'info-desc-format-wrap';
    M.descFormatBtn = document.createElement('button');
    M.descFormatBtn.type = 'button';
    M.descFormatBtn.className = 'info-desc-toolbar-btn info-desc-format-btn';
    M.descFormatBtn.setAttribute('aria-haspopup', 'listbox');
    M.descFormatBtn.setAttribute('aria-expanded', 'false');
    M.descFormatBtn.title = 'Format';
    M.descFormatBtn.setAttribute('aria-label', 'Format');
    M.descFormatBtnLabel = document.createElement('span');
    M.descFormatBtnLabel.className = 'info-desc-format-btn-label';
    M.descFormatBtnLabel.textContent = 'Texte normal';
    M.descFormatBtn.appendChild(M.descFormatBtnLabel);
    M.descFormatBtn.appendChild(document.createTextNode(' '));
    M.descFormatChevron = document.createElement('i');
    M.descFormatChevron.className = 'ti ti-chevron-down';
    M.descFormatChevron.setAttribute('aria-hidden', 'true');
    M.descFormatBtn.appendChild(M.descFormatChevron);
    M.descFormatMenu = document.createElement('div');
    M.descFormatMenu.className = 'info-desc-format-menu';
    M.descFormatMenu.hidden = true;
    M.descFormatMenu.setAttribute('role', 'listbox');
    M.descFormatMenu.setAttribute('aria-label', 'Formats');
    M.DESC_FORMAT_OPTIONS.forEach(function (opt) {
      var optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'info-desc-format-option';
      optBtn.setAttribute('role', 'option');
      optBtn.setAttribute('data-md-kind', opt.kind);
      optBtn.textContent = opt.label;
      if (opt.kind === 'h1') optBtn.classList.add('is-heading-1');
      if (opt.kind === 'h2') optBtn.classList.add('is-heading-2');
      if (opt.kind === 'h3') optBtn.classList.add('is-heading-3');
      M.descFormatMenu.appendChild(optBtn);
    });
    M.descFormatWrap.appendChild(M.descFormatBtn);
    M.descFormatWrap.appendChild(M.descFormatMenu);
    M.descToolbarSep = document.createElement('span');
    M.descToolbarSep.className = 'info-desc-toolbar-sep';
    M.descToolbarSep.setAttribute('aria-hidden', 'true');
    M.descBoldBtn = M.makeDescToolbarBtn({
      action: 'bold',
      title: 'Gras (Ctrl+B)',
      label: 'Gras',
      icon: 'ti-bold',
      mod: 'is-emphasis'
    });
    M.descItalicBtn = M.makeDescToolbarBtn({
      action: 'italic',
      title: 'Italique (Ctrl+I)',
      label: 'Italique',
      icon: 'ti-italic',
      mod: 'is-emphasis'
    });
    M.descStrikeBtn = M.makeDescToolbarBtn({
      action: 'strike',
      title: 'Barr\u00e9',
      label: 'Barr\u00e9',
      icon: 'ti-strikethrough',
      mod: 'is-emphasis'
    });
    M.descLinkBtn = M.makeDescToolbarBtn({
      action: 'link',
      title: 'Lien (Ctrl+K)',
      label: 'Lien',
      icon: 'ti-link'
    });
    M.descChecklistBtn = M.makeDescToolbarBtn({
      action: 'checklist',
      title: 'Liste de t\u00e2ches',
      label: 'Liste de t\u00e2ches',
      icon: 'ti-list-check'
    });
    M.descToolbar.appendChild(M.descFormatWrap);
    M.descToolbar.appendChild(M.descToolbarSep);
    M.descToolbar.appendChild(M.descBoldBtn);
    M.descToolbar.appendChild(M.descItalicBtn);
    M.descToolbar.appendChild(M.descStrikeBtn);
    M.descToolbar.appendChild(M.descLinkBtn);
    M.descToolbar.appendChild(M.descChecklistBtn);
    M.descModeSwitch = document.createElement('div');
    M.descModeSwitch.className = 'info-desc-mode-switch';
    M.descModeSwitch.setAttribute('role', 'radiogroup');
    M.descModeSwitch.setAttribute('aria-label', 'Mode d\u2019\u00e9dition');
    M.descRichModeBtn = M.makeDescModeBtn('rich', 'Texte enrichi');
    M.descMarkdownModeBtn = M.makeDescModeBtn('markdown', 'Markdown');
    M.descToolbar.appendChild(M.descModeSwitch);
    M.descMeta = document.createElement('div');
    M.descMeta.className = 'info-desc-meta';
    M.descSpellSpinner = document.createElement('span');
    M.descSpellSpinner.className = 'info-desc-spinner';
    M.descSpellSpinner.hidden = true;
    M.descSpellSpinner.setAttribute('aria-hidden', 'true');
    M.descSpellSpinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
    M.descStatus = document.createElement('span');
    M.descStatus.className = 'info-desc-status';
    M.descStatus.setAttribute('aria-live', 'polite');
    M.descMeta.appendChild(M.descSpellSpinner);
    M.descMeta.appendChild(M.descStatus);
    M.descMetaToggle = document.createElement('button');
    M.descMetaToggle.type = 'button';
    M.descMetaToggle.className = 'info-desc-meta-toggle';
    M.descMetaToggle.hidden = true;
    M.descMetaToggle.setAttribute('aria-pressed', 'false');
    M.descMetaToggle.textContent = 'Afficher les m\u00e9tadonn\u00e9es masqu\u00e9es';
    M.descMetaToggle.addEventListener('click', function () {
      M.syncDescSourceFromRich();
      if (M.showDescMeta) {
        var split = M.splitFullDesc(M.descInput.value);
        M.descMetaMap = M.cloneMetaMap(split.meta);
        M.showDescMeta = false;
        M.descInput.value = split.visible;
      } else {
        M.showDescMeta = true;
        M.descInput.value = M.joinFullDesc(M.descInput.value, M.descMetaMap);
      }
      if (M.descMode === 'rich') M.renderDescRich();
      else M.syncDescInputSize();
      M.syncDescMetaToggle();
      M.onLayoutChange();
    });
    M.authBox = document.createElement('div');
    M.authBox.className = 'info-auth-box';
    M.authBox.hidden = true;
    M.authHint = document.createElement('p');
    M.authHint.className = 'info-auth-hint';
    M.authBtn = document.createElement('button');
    M.authBtn.type = 'button';
    M.authBtn.className = 'tp-button info-auth-button';
    M.authBtn.textContent = 'Autoriser Trello (lecture + \u00e9criture)';
    M.authBox.appendChild(M.authHint);
    M.authBox.appendChild(M.authBtn);
    M.descWrap.appendChild(M.descToolbar);
    M.descWrap.appendChild(M.descRich);
    M.descWrap.appendChild(M.descInput);
    M.descWrap.appendChild(M.descMeta);
    M.descWrap.appendChild(M.descMetaToggle);
    M.descWrap.appendChild(M.authBox);
    M.descRow.value.appendChild(M.descWrap);
    M.body.appendChild(M.descRow.row);
    M.syncDescMetaToggle();
    M.creatorRow = M.makeRow('creator', 'Cr\u00e9ateur', { icon: 'ti-user' });
    M.creatorEl = document.createElement('div');
    M.creatorEl.className = 'info-members info-creator';
    M.creatorEl.setAttribute('aria-label', 'Cr\u00e9ateur de la carte');
    M.creatorRow.value.appendChild(M.creatorEl);
    M.creatorRow.row.hidden = true;
    M.body.appendChild(M.creatorRow.row);
    M.membersRow = M.makeRow('members', 'Assign\u00e9s', { icon: 'ti-users' });
    M.membersWrap = document.createElement('div');
    M.membersWrap.className = 'info-members-wrap';
    M.membersEl = document.createElement('div');
    M.membersEl.className = 'info-members';
    M.membersEl.setAttribute('aria-label', 'Membres assign\u00e9s');
    M.membersAddWrap = document.createElement('div');
    M.membersAddWrap.className = 'info-members-add-wrap';
    M.membersAddBtn = document.createElement('button');
    M.membersAddBtn.type = 'button';
    M.membersAddBtn.className = 'info-members-add-btn';
    M.membersAddBtn.setAttribute('aria-label', 'Ajouter un membre');
    M.membersAddBtn.title = 'Ajouter un membre';
    M.membersAddBtn.setAttribute('aria-expanded', 'false');
    M.membersAddBtn.setAttribute('aria-haspopup', 'listbox');
    M.membersAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
    M.membersPicker = document.createElement('div');
    M.membersPicker.className = 'info-members-picker';
    M.membersPicker.hidden = true;
    M.membersPicker.setAttribute('role', 'listbox');
    M.membersPicker.setAttribute('aria-label', 'Membres du tableau');
    M.membersStatus = document.createElement('span');
    M.membersStatus.className = 'info-desc-status';
    M.membersStatus.setAttribute('aria-live', 'polite');
    M.membersAddWrap.appendChild(M.membersAddBtn);
    M.membersAddWrap.appendChild(M.membersPicker);
    M.membersInline = document.createElement('div');
    M.membersInline.className = 'info-members-inline';
    M.membersInline.appendChild(M.membersEl);
    M.membersInline.appendChild(M.membersAddWrap);
    M.membersEl.hidden = false;
    M.tgHost = document.createElement('div');
    M.tgHost.className = 'tg';
    M.tgHost.hidden = true;
    M.tgFrame = document.createElement('div');
    M.tgFrame.className = 'tg-frame';
    M.tgStage = document.createElement('div');
    M.tgStage.className = 'tg-stage';
    M.tgWires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    M.tgWires.setAttribute('class', 'tg-wires');
    M.tgWires.setAttribute('aria-hidden', 'true');
    M.tgNodes = document.createElement('div');
    M.tgNodes.className = 'tg-nodes';
    M.tgPills = document.createElement('div');
    M.tgPills.className = 'tg-pills';
    M.tgStage.appendChild(M.tgWires);
    M.tgStage.appendChild(M.tgNodes);
    M.tgStage.appendChild(M.tgPills);
    M.tgEditor = document.createElement('div');
    M.tgEditor.className = 'tg-editor';
    M.tgEditor.hidden = true;
    M.tgEditor.setAttribute('role', 'dialog');
    M.tgEditor.setAttribute('aria-label', 'Modifier la relation');
    M.tgCreate = document.createElement('div');
    M.tgCreate.className = 'tg-editor tg-create';
    M.tgCreate.hidden = true;
    M.tgCreate.setAttribute('role', 'dialog');
    M.tgCreate.setAttribute('aria-label', 'Nouvelle personne \u00e0 relier');
    M.tgCollapseBtn = document.createElement('button');
    M.tgCollapseBtn.type = 'button';
    M.tgCollapseBtn.className = 'tg-collapse';
    M.tgCollapseBtn.title = 'Revenir \u00e0 la vue simple';
    M.tgCollapseBtn.innerHTML =
      '<i class="ti ti-chevron-up" aria-hidden="true"></i><span>R\u00e9duire</span>';
    M.tgFrame.appendChild(M.tgStage);
    M.tgFrame.appendChild(M.tgEditor);
    M.tgFrame.appendChild(M.tgCreate);
    M.tgFrame.appendChild(M.tgCollapseBtn);
    M.tgZoomOutBtn = document.createElement('button');
    M.tgZoomOutBtn.type = 'button';
    M.tgZoomOutBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-out';
    M.tgZoomOutBtn.title = 'D\u00e9zoomer (ou Ctrl + molette)';
    M.tgZoomOutBtn.setAttribute('aria-label', 'D\u00e9zoomer');
    M.tgZoomOutBtn.innerHTML = '<i class="ti ti-zoom-out" aria-hidden="true"></i>';
    M.tgZoomInBtn = document.createElement('button');
    M.tgZoomInBtn.type = 'button';
    M.tgZoomInBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-in';
    M.tgZoomInBtn.title = 'Zoomer';
    M.tgZoomInBtn.setAttribute('aria-label', 'Zoomer');
    M.tgZoomInBtn.innerHTML = '<i class="ti ti-zoom-in" aria-hidden="true"></i>';
    M.tgFrame.appendChild(M.tgZoomOutBtn);
    M.tgFrame.appendChild(M.tgZoomInBtn);
    M.tgExpandBtn = document.createElement('button');
    M.tgExpandBtn.type = 'button';
    M.tgExpandBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-expand';
    M.tgExpandBtn.setAttribute('aria-label', 'Hauteur de la vue');
    M.tgResizeHandle = document.createElement('div');
    M.tgResizeHandle.className = 'tg-resize';
    M.tgResizeHandle.title = 'Glisser pour changer la hauteur';
    M.tgFrame.appendChild(M.tgExpandBtn);
    M.tgFrame.appendChild(M.tgResizeHandle);
    M.tgHint = document.createElement('div');
    M.tgHint.className = 'tg-hint';
    M.tgHost.appendChild(M.tgFrame);
    M.tgHost.appendChild(M.tgHint);
    M.membersWrap.appendChild(M.tgHost);
    M.membersWrap.appendChild(M.membersInline);
    M.membersWrap.appendChild(M.membersStatus);
    M.memberRolesPickerHost = document.createElement('div');
    M.memberRolesPickerHost.className = 'info-member-roles-picker-host';
    M.memberRolesPickerHost.hidden = true;
    M.memberRolesPicker = document.createElement('div');
    M.memberRolesPicker.className = 'info-member-roles-picker';
    M.memberRolesPicker.setAttribute('role', 'listbox');
    M.memberRolesPicker.setAttribute('aria-label', 'R\u00f4les disponibles');
    M.memberRolesPickerHost.appendChild(M.memberRolesPicker);
    M.membersWrap.appendChild(M.memberRolesPickerHost);
    M.membersRow.value.appendChild(M.membersWrap);
    M.body.appendChild(M.membersRow.row);
    M.PLACE_STOP_LABELS = {
      from: 'De',
      via: 'Étape',
      to: 'Vers',
      at: 'Sur place'
    };
    M.placesRow = M.makeRow('places', 'Lieux', { icon: 'ti-map-pin' });
    M.placesWrap = document.createElement('div');
    M.placesWrap.className = 'info-places-wrap';
    M.placesWrap.setAttribute('aria-label', 'Lieux de la tâche');
    M.placesRouteEl = document.createElement('div');
    M.placesRouteEl.className = 'info-route';
    M.pgHost = document.createElement('div');
    M.pgHost.className = 'tg pg';
    M.pgHost.hidden = true;
    M.pgFrame = document.createElement('div');
    M.pgFrame.className = 'tg-frame';
    M.pgStage = document.createElement('div');
    M.pgStage.className = 'tg-stage';
    M.pgWires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    M.pgWires.setAttribute('class', 'tg-wires');
    M.pgWires.setAttribute('aria-hidden', 'true');
    M.pgNodes = document.createElement('div');
    M.pgNodes.className = 'tg-nodes';
    M.pgPills = document.createElement('div');
    M.pgPills.className = 'tg-pills';
    M.pgStage.appendChild(M.pgWires);
    M.pgStage.appendChild(M.pgNodes);
    M.pgStage.appendChild(M.pgPills);
    M.pgEditor = document.createElement('div');
    M.pgEditor.className = 'tg-editor pg-pop pg-place-editor';
    M.pgEditor.hidden = true;
    M.pgEditor.setAttribute('role', 'dialog');
    M.pgEditor.setAttribute('aria-label', 'Modifier le lieu');
    M.pgPop = document.createElement('div');
    M.pgPop.className = 'tg-editor tg-create pg-pop';
    M.pgPop.hidden = true;
    M.pgPop.setAttribute('role', 'dialog');
    M.pgPop.setAttribute('aria-label', 'Ajouter un lieu');
    M.pgToolbar = document.createElement('div');
    M.pgToolbar.className = 'pg-toolbar';
    M.pgAutoBtn = document.createElement('button');
    M.pgAutoBtn.type = 'button';
    M.pgAutoBtn.className = 'tg-collapse pg-tool';
    M.pgAutoBtn.title = 'Remettre les lieux en ordre (annule les d\u00e9placements)';
    M.pgAutoBtn.hidden = true;
    M.pgAutoBtn.innerHTML =
      '<i class="ti ti-layout-grid" aria-hidden="true"></i><span>Ranger</span>';
    M.pgItinBtn = document.createElement('a');
    M.pgItinBtn.className = 'tg-collapse pg-tool';
    M.pgItinBtn.target = '_blank';
    M.pgItinBtn.rel = 'noopener noreferrer';
    M.pgItinBtn.title = 'Itinéraire dans Google Maps';
    M.pgItinBtn.hidden = true;
    M.pgItinBtn.innerHTML =
      '<i class="ti ti-map-route" aria-hidden="true"></i><span>Itinéraire</span>';
    M.pgCollapseBtn = document.createElement('button');
    M.pgCollapseBtn.type = 'button';
    M.pgCollapseBtn.className = 'tg-collapse pg-tool';
    M.pgCollapseBtn.title = 'Revenir à la vue simple';
    M.pgCollapseBtn.innerHTML =
      '<i class="ti ti-chevron-up" aria-hidden="true"></i><span>Réduire</span>';
    M.pgToolbar.appendChild(M.pgAutoBtn);
    M.pgToolbar.appendChild(M.pgItinBtn);
    M.pgToolbar.appendChild(M.pgCollapseBtn);
    M.pgZoomOutBtn = document.createElement('button');
    M.pgZoomOutBtn.type = 'button';
    M.pgZoomOutBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-out';
    M.pgZoomOutBtn.title = 'Dézoomer (ou Ctrl + molette)';
    M.pgZoomOutBtn.setAttribute('aria-label', 'Dézoomer');
    M.pgZoomOutBtn.innerHTML = '<i class="ti ti-zoom-out" aria-hidden="true"></i>';
    M.pgZoomInBtn = document.createElement('button');
    M.pgZoomInBtn.type = 'button';
    M.pgZoomInBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-in';
    M.pgZoomInBtn.title = 'Revenir à la taille ajustée';
    M.pgZoomInBtn.setAttribute('aria-label', 'Agrandir');
    M.pgZoomInBtn.innerHTML = '<i class="ti ti-zoom-in" aria-hidden="true"></i>';
    M.pgFrame.appendChild(M.pgStage);
    M.pgFrame.appendChild(M.pgEditor);
    M.pgFrame.appendChild(M.pgPop);
    M.pgFrame.appendChild(M.pgToolbar);
    M.pgFrame.appendChild(M.pgZoomOutBtn);
    M.pgFrame.appendChild(M.pgZoomInBtn);
    M.pgHost.appendChild(M.pgFrame);
    M.placesStatus = document.createElement('span');
    M.placesStatus.className = 'info-desc-status';
    M.placesStatus.setAttribute('aria-live', 'polite');
    M.placesWrap.appendChild(M.pgHost);
    M.placesWrap.appendChild(M.placesRouteEl);
    M.placesWrap.appendChild(M.placesStatus);
    M.placesRow.value.appendChild(M.placesWrap);
    M.body.appendChild(M.placesRow.row);
    M.rowSummaries.title = function () {
      return M.titleInput.classList.contains('is-loading') ? '' : M.titleInput.value;
    };
    M.IRS_MAX = 3;
    M.rowSummaries.priority = function () {
      var m = M.priorityInline.mount;
      var score = M.mountText(m, ['.heat-badge-num-val']);
      var label = M.mountText(m, ['.priority-summary-label', '.heat-badge-label']);
      if (!label) return score;
      var accent = M.irsColorOf(m.querySelector('.priority-summary-dot, .heat-tier-dot'));
      var idle = !!m.querySelector('.priority-summary.is-inutile, .heat-badge.is-inutile');
      var nodes = [
        M.irsChip({
          className: 'irs-priority' + (idle ? ' is-idle' : ''),
          accent: accent,
          lead: M.irsEl('span', 'irs-dot'),
          text: label
        })
      ];
      if (score) {
        nodes.push(
          M.irsChip({
            className: 'irs-chip--score',
            accent: accent,
            text: score,
            title: 'Score de priorité'
          })
        );
      }
      return M.irsFragment(nodes);
    };
    M.rowSummaries.progress = function () {
      var m = M.progressInline.mount;
      var statutEl = m.querySelector('.statut-summary');
      var status = M.mountText(m, ['.statut-summary-label', '.statut-embedded-summary']);
      var pctMatch = /(\d+)\s*%/.exec(m.textContent || '');
      var pct = pctMatch ? Math.max(0, Math.min(100, +pctMatch[1])) : null;
      if (!status && pct == null) return '';
      var statusColor = statutEl ? statutEl.style.getPropertyValue('--statut-color') : '';
      var barHost = m.querySelector('.progress-summary');
      var barColor =
        (barHost && barHost.style.getPropertyValue('--overview-progress-accent')) || statusColor;
      var icon = statutEl ? statutEl.querySelector('svg') : null;
      var nodes = [
        M.irsChip({
          className: 'irs-status',
          accent: statusColor || barColor,
          lead: icon ? icon.cloneNode(true) : M.irsEl('span', 'irs-dot'),
          text: status || 'Progrès'
        })
      ];
      if (pct != null) {
        var meter = M.irsEl('span', 'irs-progress');
        if (barColor) meter.style.setProperty('--irs-accent', barColor);
        meter.title = 'Progrès : ' + pct + ' %';
        meter.classList.toggle('is-done', pct >= 100);
        var track = M.irsEl('span', 'irs-bar');
        var fill = M.irsEl('span', 'irs-bar-fill');
        fill.style.width = pct + '%';
        track.appendChild(fill);
        meter.appendChild(track);
        meter.appendChild(M.irsEl('span', 'irs-pct', pct + ' %'));
        nodes.push(meter);
      }
      return M.irsFragment(nodes);
    };
    M.rowSummaries.due = function () {
      var m = M.dueInline.mount;
      var label = M.mountText(m, ['.due-summary-label']);
      if (!label) return '';
      var wrap = m.querySelector('.due-summary');
      var band = wrap && wrap.dataset ? wrap.dataset.dueBand || '' : '';
      var vague = !!(wrap && wrap.classList.contains('due-summary--vague'));
      var accent =
        S.dueBandAccent(band) || M.irsColorOf(m.querySelector('.due-summary-dot'));
      var lead = M.irsEl('span', 'irs-dot');
      if (vague) lead = M.irsIcon('tilde');
      else if (band === 'overdue') lead = M.irsIcon('alert-triangle');
      else if (band === 'imminent') lead = M.irsIcon('clock-exclamation');
      return M.irsFragment([
        M.irsChip({
          className: 'irs-due' + (band ? ' is-' + band : ''),
          accent: accent,
          lead: lead,
          text: label
        })
      ]);
    };
    }
  });
})(typeof window !== 'undefined' ? window : this);
