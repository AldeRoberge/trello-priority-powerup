/**
 * priority-ui: part 8 of 12 (createInfoField).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var INFO_DESC_EMPTY_MIN_HEIGHT_PX = S.INFO_DESC_EMPTY_MIN_HEIGHT_PX;
  var INFO_DESC_MAX_HEIGHT_PX = S.INFO_DESC_MAX_HEIGHT_PX;
  var INFO_DESC_MIN_HEIGHT_PX = S.INFO_DESC_MIN_HEIGHT_PX;
  var MAX_CUSTOM_ASSIGNEE_NAME_LEN = S.MAX_CUSTOM_ASSIGNEE_NAME_LEN;
  var MAX_MEMBER_ROLE_LABEL_LEN = S.MAX_MEMBER_ROLE_LABEL_LEN;
  var MAX_PLACE_DO_LEN = S.MAX_PLACE_DO_LEN;
  var MAX_PLACE_NAME_LEN = S.MAX_PLACE_NAME_LEN;
  var MAX_PLACE_VIA = S.MAX_PLACE_VIA;
  var MAX_TASK_TYPE_LABEL_LEN = S.MAX_TASK_TYPE_LABEL_LEN;
  var MAX_TEAM_LINK_LABEL = S.MAX_TEAM_LINK_LABEL;

  // from other parts (functions, resolved at call time)
  function applyMarkdownBlockFormat() { return S.applyMarkdownBlockFormat.apply(this, arguments); }
  function applyMarkdownEditToTextarea() { return S.applyMarkdownEditToTextarea.apply(this, arguments); }
  function connectTeamPeople() { return S.connectTeamPeople.apply(this, arguments); }
  function createCustomAssignee() { return S.createCustomAssignee.apply(this, arguments); }
  function createCustomMemberRole() { return S.createCustomMemberRole.apply(this, arguments); }
  function createCustomTaskType() { return S.createCustomTaskType.apply(this, arguments); }
  function customAssigneeToMember() { return S.customAssigneeToMember.apply(this, arguments); }
  function detectMarkdownLineFormat() { return S.detectMarkdownLineFormat.apply(this, arguments); }
  function dueBandAccent() { return S.dueBandAccent.apply(this, arguments); }
  function escapeHtml() { return S.escapeHtml.apply(this, arguments); }
  function findCustomAssigneeCatalogByName() { return S.findCustomAssigneeCatalogByName.apply(this, arguments); }
  function findPlaceCatalogById() { return S.findPlaceCatalogById.apply(this, arguments); }
  function findPlaceCatalogByName() { return S.findPlaceCatalogByName.apply(this, arguments); }
  function firstRowEditControl() { return S.firstRowEditControl.apply(this, arguments); }
  function getCustomAssigneeCatalog() { return S.getCustomAssigneeCatalog.apply(this, arguments); }
  function getCustomTaskTypes() { return S.getCustomTaskTypes.apply(this, arguments); }
  function getMemberRoleCatalog() { return S.getMemberRoleCatalog.apply(this, arguments); }
  function getMemberRoleCustoms() { return S.getMemberRoleCustoms.apply(this, arguments); }
  function getMemberRoleEntry() { return S.getMemberRoleEntry.apply(this, arguments); }
  function getPlaceCatalog() { return S.getPlaceCatalog.apply(this, arguments); }
  function getTaskTypeCatalog() { return S.getTaskTypeCatalog.apply(this, arguments); }
  function getTaskTypeEntry() { return S.getTaskTypeEntry.apply(this, arguments); }
  function getTaskTypeIconKeys() { return S.getTaskTypeIconKeys.apply(this, arguments); }
  function isCustomAssigneeId() { return S.isCustomAssigneeId.apply(this, arguments); }
  function isValidTaskTypeId() { return S.isValidTaskTypeId.apply(this, arguments); }
  function layoutTeamGraph() { return S.layoutTeamGraph.apply(this, arguments); }
  function linkMarkdownSelection() { return S.linkMarkdownSelection.apply(this, arguments); }
  function markdownFromRichRoot() { return S.markdownFromRichRoot.apply(this, arguments); }
  function mergeAssigneesForDisplay() { return S.mergeAssigneesForDisplay.apply(this, arguments); }
  function normalizeCustomAssigneeEntry() { return S.normalizeCustomAssigneeEntry.apply(this, arguments); }
  function normalizeCustomAssignees() { return S.normalizeCustomAssignees.apply(this, arguments); }
  function normalizeMemberRoleIds() { return S.normalizeMemberRoleIds.apply(this, arguments); }
  function normalizeMemberRoles() { return S.normalizeMemberRoles.apply(this, arguments); }
  function normalizeParentCards() { return S.normalizeParentCards.apply(this, arguments); }
  function normalizePasteableMarkdownUrl() { return S.normalizePasteableMarkdownUrl.apply(this, arguments); }
  function normalizePlaceCatalog() { return S.normalizePlaceCatalog.apply(this, arguments); }
  function normalizePlaceRef() { return S.normalizePlaceRef.apply(this, arguments); }
  function normalizePlaces() { return S.normalizePlaces.apply(this, arguments); }
  function normalizeTaskTypeIconKey() { return S.normalizeTaskTypeIconKey.apply(this, arguments); }
  function normalizeTaskTypes() { return S.normalizeTaskTypes.apply(this, arguments); }
  function normalizeTeamLinks() { return S.normalizeTeamLinks.apply(this, arguments); }
  function pruneMemberRoleCustoms() { return S.pruneMemberRoleCustoms.apply(this, arguments); }
  function randomTaskTypeIconKey() { return S.randomTaskTypeIconKey.apply(this, arguments); }
  function removeMemberFromRoles() { return S.removeMemberFromRoles.apply(this, arguments); }
  function removeTeamLink() { return S.removeTeamLink.apply(this, arguments); }
  function renderMarkdownLinkHtml() { return S.renderMarkdownLinkHtml.apply(this, arguments); }
  function renderMarkdownToHtml() { return S.renderMarkdownToHtml.apply(this, arguments); }
  function richAttr() { return S.richAttr.apply(this, arguments); }
  function richNodeName() { return S.richNodeName.apply(this, arguments); }
  function routeTeamLink() { return S.routeTeamLink.apply(this, arguments); }
  function safeMarkdownHref() { return S.safeMarkdownHref.apply(this, arguments); }
  function setCustomAssigneeCatalog() { return S.setCustomAssigneeCatalog.apply(this, arguments); }
  function setCustomTaskTypes() { return S.setCustomTaskTypes.apply(this, arguments); }
  function setMemberRoleCatalog() { return S.setMemberRoleCatalog.apply(this, arguments); }
  function setMemberRoleCustoms() { return S.setMemberRoleCustoms.apply(this, arguments); }
  function setPlaceCatalog() { return S.setPlaceCatalog.apply(this, arguments); }
  function syncExpandableSurfaceHeight() { return S.syncExpandableSurfaceHeight.apply(this, arguments); }
  function taskTypeHint() { return S.taskTypeHint.apply(this, arguments); }
  function taskTypeIconSvg() { return S.taskTypeIconSvg.apply(this, arguments); }
  function taskTypeLabel() { return S.taskTypeLabel.apply(this, arguments); }
  function teamLinkPairKey() { return S.teamLinkPairKey.apply(this, arguments); }
  function upsertCustomAssigneeCatalog() { return S.upsertCustomAssigneeCatalog.apply(this, arguments); }
  function upsertPlaceCatalog() { return S.upsertPlaceCatalog.apply(this, arguments); }
  function upsertTeamLink() { return S.upsertTeamLink.apply(this, arguments); }
  function wrapMarkdownInlineSelection() { return S.wrapMarkdownInlineSelection.apply(this, arguments); }

  /**
   * Unified card header: title, description, creator, assignees.
   * Secondary props live in a separate « Plus de détails » section (returned as
   * moreDetailsEl for the popup to place after Priorité / Progrès / Échéance).
   */
  function createInfoField(config) {
    var el = config.el;
    var onLayoutChange = config.onLayoutChange || function () {};
    var onTitleChange =
      typeof config.onTitleChange === 'function' ? config.onTitleChange : null;
    var onDescChange =
      typeof config.onDescChange === 'function' ? config.onDescChange : null;
    var onMemberAdd =
      typeof config.onMemberAdd === 'function' ? config.onMemberAdd : null;
    var onMemberRemove =
      typeof config.onMemberRemove === 'function' ? config.onMemberRemove : null;
    var onMemberRolesChange =
      typeof config.onMemberRolesChange === 'function'
        ? config.onMemberRolesChange
        : null;
    var onCustomAssigneesChange =
      typeof config.onCustomAssigneesChange === 'function'
        ? config.onCustomAssigneesChange
        : null;
    var onCustomAssigneeCatalogChange =
      typeof config.onCustomAssigneeCatalogChange === 'function'
        ? config.onCustomAssigneeCatalogChange
        : null;
    if (Array.isArray(config.customAssigneeCatalog)) {
      setCustomAssigneeCatalog(config.customAssigneeCatalog);
    }
    var onPlacesChange =
      typeof config.onPlacesChange === 'function' ? config.onPlacesChange : null;
    var getPlaceDirectory =
      typeof config.getPlaceDirectory === 'function'
        ? config.getPlaceDirectory
        : null;
    var onPlaceDirectorySave =
      typeof config.onPlaceDirectorySave === 'function'
        ? config.onPlaceDirectorySave
        : null;
    var onPlaceCatalogChange =
      typeof config.onPlaceCatalogChange === 'function'
        ? config.onPlaceCatalogChange
        : null;
    if (Array.isArray(config.placeCatalog)) {
      setPlaceCatalog(config.placeCatalog);
    }
    var onLabelAdd =
      typeof config.onLabelAdd === 'function' ? config.onLabelAdd : null;
    var onLabelRemove =
      typeof config.onLabelRemove === 'function' ? config.onLabelRemove : null;
    var onLabelDelete =
      typeof config.onLabelDelete === 'function' ? config.onLabelDelete : null;
    var onLabelCreate =
      typeof config.onLabelCreate === 'function' ? config.onLabelCreate : null;
    var onLabelColorChange =
      typeof config.onLabelColorChange === 'function'
        ? config.onLabelColorChange
        : null;
    var onLabelRename =
      typeof config.onLabelRename === 'function' ? config.onLabelRename : null;
    var suggestLabelsFn =
      typeof config.suggestLabels === 'function' ? config.suggestLabels : null;
    var suggestTaskTypesFn =
      typeof config.suggestTaskTypes === 'function'
        ? config.suggestTaskTypes
        : null;
    var onAuthorize =
      typeof config.onAuthorize === 'function' ? config.onAuthorize : null;
    var onJump =
      typeof config.onJump === 'function' ? config.onJump : null;
    var getBoardCards =
      typeof config.getBoardCards === 'function' ? config.getBoardCards : null;
    var onParentChange =
      typeof config.onParentChange === 'function' ? config.onParentChange : null;
    var onOpenParent =
      typeof config.onOpenParent === 'function' ? config.onOpenParent : null;
    var onTaskTypesChange =
      typeof config.onTaskTypesChange === 'function'
        ? config.onTaskTypesChange
        : null;
    var onCustomTaskTypesChange =
      typeof config.onCustomTaskTypesChange === 'function'
        ? config.onCustomTaskTypesChange
        : null;
    var onDismissedTaskTypeSuggestionsChange =
      typeof config.onDismissedTaskTypeSuggestionsChange === 'function'
        ? config.onDismissedTaskTypeSuggestionsChange
        : null;
    var bodyId = 'info-section-body-' + Math.random().toString(36).slice(2, 9);
    var titleText = typeof config.title === 'string' ? config.title : '';
    var descText = typeof config.desc === 'string' ? config.desc : '';
    var members = Array.isArray(config.members) ? config.members.slice() : [];
    var creatorMember =
      config.creator && typeof config.creator === 'object' && config.creator.id
        ? config.creator
        : null;
    var boardMembers = Array.isArray(config.boardMembers)
      ? config.boardMembers.slice()
      : [];
    var labels = Array.isArray(config.labels) ? config.labels.slice() : [];
    var boardLabels = Array.isArray(config.boardLabels)
      ? config.boardLabels.slice()
      : [];
    // Kept for label suggestions / collapsed summary — not shown as an Information row.
    var priorityLabel = typeof config.priorityLabel === 'string' ? config.priorityLabel : '';
    var impactReachLabel = typeof config.impactReach === 'string' ? config.impactReach : '';
    var titleDirty = false;
    var titleSaveTimer = null;
    var titleBusy = false;
    var descDirty = false;
    var descSaveTimer = null;
    var descBusy = false;
    var descMetaMap = Object.create(null);
    var showDescMeta = false;

    function DM() {
      return global.DescMeta || null;
    }

    function splitFullDesc(full) {
      var dm = DM();
      if (dm && typeof dm.splitDesc === 'function') {
        return dm.splitDesc(full);
      }
      return {
        visible: typeof full === 'string' ? full : '',
        meta: {},
        hasMeta: false,
      };
    }

    function joinFullDesc(visible, meta) {
      var dm = DM();
      if (dm && typeof dm.joinDesc === 'function') {
        return dm.joinDesc(visible, meta);
      }
      return typeof visible === 'string' ? visible : '';
    }

    function cloneMetaMap(meta) {
      var out = Object.create(null);
      if (!meta || typeof meta !== 'object') return out;
      Object.keys(meta).forEach(function (k) {
        if (meta[k] != null && String(meta[k]).trim() !== '') {
          out[k] = String(meta[k]).trim();
        }
      });
      return out;
    }

    function editorShowsFullDesc() {
      return !!showDescMeta;
    }

    function visibleFromEditorValue(value) {
      if (editorShowsFullDesc()) {
        return splitFullDesc(value).visible;
      }
      return typeof value === 'string' ? value : '';
    }

    function fullDescFromEditor() {
      syncDescSourceFromRich();
      var raw = descInput.value;
      if (editorShowsFullDesc()) {
        var split = splitFullDesc(raw);
        descMetaMap = cloneMetaMap(split.meta);
        return joinFullDesc(split.visible, descMetaMap);
      }
      return joinFullDesc(raw, descMetaMap);
    }

    function applyFullDescToEditor(full, options) {
      options = options || {};
      var split = splitFullDesc(full);
      descMetaMap = cloneMetaMap(split.meta);
      var shown = editorShowsFullDesc()
        ? joinFullDesc(split.visible, descMetaMap)
        : split.visible;
      descText = full;
      descInput.value = shown;
      syncDescMetaToggle();
      if (options.skipRender) return;
      if (descMode === 'rich') renderDescRich();
      else syncDescInputSize();
    }
    var descSpellcheckGen = 0;
    var descSpellcheckedText = descText.trim() || null;
    var descSpellRevert = null;
    var authBusy = false;
    var authReason = config.authReason || '';
    var membersBusy = false;
    var membersPickerOpen = false;
    var memberRoles = normalizeMemberRoles(config.memberRoles);
    var memberRolesBusy = false;
    var memberRolesPickerMemberId = '';
    var customAssignees = normalizeCustomAssignees(config.customAssignees);
    var teamLinks = normalizeTeamLinks(config.teamLinks);
    var onTeamLinksChange =
      typeof config.onTeamLinksChange === 'function'
        ? config.onTeamLinksChange
        : null;
    var cardPlaces = normalizePlaces(config.places);
    var placesBusy = false;
    var placesPickerSlot = '';
    var placeEditKey = '';
    if (Array.isArray(config.memberRoleCustoms)) {
      setMemberRoleCustoms(config.memberRoleCustoms);
    }
    if (Array.isArray(config.memberRoleCatalog)) {
      setMemberRoleCatalog(config.memberRoleCatalog);
    }
    var labelsBusy = false;
    var labelsPickerOpen = false;
    var labelsColorEditId = '';
    var labelsRenameId = '';
    var labelsRenameDraft = '';
    var labelSuggestions = [];
    var labelSuggestionsLoading = false;
    var labelSuggestionsSeq = 0;
    var labelSuggestionsTimer = null;
    var labelSuggestionsKey = '';
    var taskTypeSuggestions = [];
    var taskTypeSuggestionsLoading = false;
    var taskTypeSuggestionsSeq = 0;
    var taskTypeSuggestionsTimer = null;
    var taskTypeSuggestionsKey = '';
    var parentCards = normalizeParentCards(
      Array.isArray(config.parents)
        ? config.parents
        : config.parent
          ? [config.parent]
          : []
    );
    var parentBusy = false;
    var parentPickerOpen = false;
    var parentBoardCardsCache = null;
    var taskTypes = normalizeTaskTypes(config.taskTypes);
    var dismissedTaskTypeSuggestions = normalizeTaskTypes(
      config.dismissedTaskTypeSuggestions
    );
    var taskTypesBusy = false;
    var taskTypesPickerOpen = false;
    var FIELD_SAVE_MS = 450;

    var field = document.createElement('div');
    field.className = 'field field--info is-enabled is-unified';

    var body = document.createElement('div');
    body.className = 'info-section-body';
    body.id = bodyId;

    // Secondary properties nest under the inline « Plus de détails » row.
    var moreBodyId =
      'more-details-body-' + Math.random().toString(36).slice(2, 9);
    var moreBody = document.createElement('div');
    moreBody.className = 'more-details-section-body info-section-body';
    moreBody.id = moreBodyId;
    moreBody.hidden = true;
    var historiqueMount = document.createElement('div');
    historiqueMount.className = 'info-historique-mount';
    var moreDetailsExpanded =
      config.moreDetailsExpanded != null
        ? !!config.moreDetailsExpanded
        : false;
    var onMoreDetailsExpandChange =
      typeof config.onMoreDetailsExpandChange === 'function'
        ? config.onMoreDetailsExpandChange
        : function () {};

    function makeRow(key, labelText, options) {
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

      if (options.interactive && onJump) {
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.title = 'Aller \u00e0 ' + labelText;
        function jump() {
          onJump(key);
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
        makeRowCollapsible(key, row, label, value);
      }

      return { row: row, value: value };
    }

    // ── Collapsible rows: header click folds the row to a one-line summary ──
    var rowSummaries = Object.create(null);

    function rowCollapsedStore(key, next) {
      var storeKey = 'tp-info-row-collapsed:' + key;
      try {
        if (next === undefined) return global.localStorage.getItem(storeKey) === '1';
        if (next) global.localStorage.setItem(storeKey, '1');
        else global.localStorage.removeItem(storeKey);
      } catch (e) {}
      return !!next;
    }

    // Shown (italic) in the folded header when the row has no value yet;
    // clicking it unfolds the row and starts the « add » gesture.
    var ROW_EMPTY_PROMPTS = {
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

    function startRowEdit(value) {
      var el = firstRowEditControl(value);
      if (!el) return;
      try {
        if (String(el.tagName || '').toUpperCase() === 'BUTTON') el.click();
        else el.focus();
      } catch (e) {}
    }

    function genericRowSummary(value) {
      var clone = value.cloneNode(true);
      Array.prototype.forEach.call(
        clone.querySelectorAll('button, script, style, [hidden], textarea'),
        function (n) {
          n.remove();
        }
      );
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    // Folded rows with no value sink below the filled ones (stable, creation
    // order kept inside each group; the title and open rows never move).
    var rowOrderSeq = 0;
    var sortingRows = false;
    function sortEmptyRowsDown(container) {
      if (sortingRows) return;
      container = container || body;
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
      sortingRows = true;
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
        sortingRows = false;
      }
    }

    function makeRowCollapsible(key, row, label, value) {
      row.classList.add('is-collapsible');
      row.dataset.rowOrder = String(rowOrderSeq++);
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
          sortEmptyRowsDown(row.parentNode);
          return;
        }
        var text = '';
        try {
          text = rowSummaries[key] ? rowSummaries[key]() : genericRowSummary(value);
        } catch (e) {
          text = genericRowSummary(value);
        }
        var isNode = !!(text && text.nodeType);
        var plain = isNode ? (text.textContent || '').trim() : String(text || '').trim();
        var tip = (isNode && text.summaryTitle) || plain;
        if (isNode && plain) summary.replaceChildren(text);
        else if (plain) summary.textContent = plain;
        else {
          var plus = document.createElement('i');
          var promptText = ROW_EMPTY_PROMPTS[key] || 'Cliquer pour ajouter';
          // + means "create a new item"; choosing or setting a value gets a pencil.
          plus.className = (/ajouter/.test(promptText) ? 'ti ti-plus' : 'ti ti-pencil') + ' info-row-summary-plus';
          plus.setAttribute('aria-hidden', 'true');
          var hint = document.createElement('span');
          hint.className = 'info-row-summary-main';
          hint.textContent = ROW_EMPTY_PROMPTS[key] || 'Cliquer pour ajouter';
          summary.replaceChildren(plus, hint);
        }
        summary.classList.toggle('is-empty', !plain);
        summary.title = tip;
        row.dataset.rowEmpty = !plain && key !== 'title' ? '1' : '0';
        sortEmptyRowsDown(row.parentNode);
      }

      function setCollapsed(next) {
        row.classList.toggle('is-collapsed', next);
        label.setAttribute('aria-expanded', next ? 'false' : 'true');
        summary.hidden = !next;
        refresh();
        onLayoutChangeSafe();
      }

      // Quiet when empty, rich when set: a row with a value is always open, an
      // empty one folds to one dimmed line until the user opens it to add.
      var userOpened = false;
      function isEmptyNow() {
        var text = '';
        try {
          text = rowSummaries[key] ? rowSummaries[key]() : genericRowSummary(value);
        } catch (e) {
          text = genericRowSummary(value);
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
            startRowEdit(value);
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
    }

    function onLayoutChangeSafe() {
      try {
        if (typeof onLayoutChange === 'function') onLayoutChange();
      } catch (e) {}
    }

    // ── Title ──────────────────────────────────────────────────────────
    var titleRow = makeRow('title', 'Titre', { icon: 'ti-heading', collapsible: false });
    var titleWrap = document.createElement('div');
    titleWrap.className = 'info-title-wrap';

    var titleInput = document.createElement('textarea');
    titleInput.className = 'info-title-input';
    titleInput.id = 'cardName';
    titleInput.rows = 1;
    titleInput.setAttribute('aria-label', 'Titre de la carte');
    titleInput.setAttribute('aria-live', 'polite');
    titleInput.placeholder = 'Titre de la carte';
    if (titleText) {
      titleInput.value = titleText;
    } else {
      titleInput.classList.add('is-loading');
      titleInput.value = 'Chargement\u2026';
      titleInput.readOnly = true;
    }

    var titleMeta = document.createElement('div');
    titleMeta.className = 'info-desc-meta';
    var titleStatus = document.createElement('span');
    titleStatus.className = 'info-desc-status';
    titleStatus.setAttribute('aria-live', 'polite');
    titleMeta.appendChild(titleStatus);

    titleWrap.appendChild(titleInput);
    titleWrap.appendChild(titleMeta);
    titleRow.value.appendChild(titleWrap);
    body.appendChild(titleRow.row);

    // ── Description (always-visible markdown / rich editor) ─────────────
    var descRow = makeRow('desc', 'Description', { icon: 'ti-notes' });
    var descWrap = document.createElement('div');
    descWrap.className = 'info-desc-wrap';
    var descMode = 'rich';

    var descInput = document.createElement('textarea');
    descInput.className = 'info-desc-input';
    descInput.id = 'cardDesc';
    descInput.rows = 3;
    descInput.hidden = true;
    descInput.placeholder = 'Ajouter une description\u2026';
    descInput.setAttribute('aria-label', 'Description de la carte');
    descInput.setAttribute('spellcheck', 'false');
    (function initDescEditorValue() {
      var split = splitFullDesc(descText);
      descMetaMap = cloneMetaMap(split.meta);
      descInput.value = split.visible;
    })();

    var descRich = document.createElement('div');
    descRich.className = 'info-desc-rich info-desc-preview';
    descRich.id = 'cardDescRich';
    descRich.contentEditable = 'true';
    descRich.setAttribute('role', 'textbox');
    descRich.setAttribute('aria-multiline', 'true');
    descRich.setAttribute('aria-label', 'Description de la carte, texte enrichi');
    descRich.setAttribute('spellcheck', 'true');
    descRich.setAttribute('data-placeholder', 'Ajouter une description\u2026');

    // Trello-style formatting toolbar (always visible with the editor).
    var descToolbar = document.createElement('div');
    descToolbar.className = 'info-desc-toolbar';
    descToolbar.setAttribute('role', 'toolbar');
    descToolbar.setAttribute('aria-label', 'Mise en forme de la description');

    var DESC_FORMAT_OPTIONS = [
      { kind: 'normal', label: 'Texte normal' },
      { kind: 'h1', label: 'Titre 1' },
      { kind: 'h2', label: 'Titre 2' },
      { kind: 'h3', label: 'Titre 3' },
      { kind: 'ul', label: 'Liste \u00e0 puces' },
      { kind: 'ol', label: 'Liste num\u00e9rot\u00e9e' },
      { kind: 'checklist', label: 'Liste de t\u00e2ches' }
    ];
    var DESC_FORMAT_LABELS = {};
    DESC_FORMAT_OPTIONS.forEach(function (opt) {
      DESC_FORMAT_LABELS[opt.kind] = opt.label;
    });

    var descFormatWrap = document.createElement('div');
    descFormatWrap.className = 'info-desc-format-wrap';

    var descFormatBtn = document.createElement('button');
    descFormatBtn.type = 'button';
    descFormatBtn.className = 'info-desc-toolbar-btn info-desc-format-btn';
    descFormatBtn.setAttribute('aria-haspopup', 'listbox');
    descFormatBtn.setAttribute('aria-expanded', 'false');
    descFormatBtn.title = 'Format';
    descFormatBtn.setAttribute('aria-label', 'Format');
    var descFormatBtnLabel = document.createElement('span');
    descFormatBtnLabel.className = 'info-desc-format-btn-label';
    descFormatBtnLabel.textContent = 'Texte normal';
    descFormatBtn.appendChild(descFormatBtnLabel);
    descFormatBtn.appendChild(document.createTextNode(' '));
    var descFormatChevron = document.createElement('i');
    descFormatChevron.className = 'ti ti-chevron-down';
    descFormatChevron.setAttribute('aria-hidden', 'true');
    descFormatBtn.appendChild(descFormatChevron);

    var descFormatMenu = document.createElement('div');
    descFormatMenu.className = 'info-desc-format-menu';
    descFormatMenu.hidden = true;
    descFormatMenu.setAttribute('role', 'listbox');
    descFormatMenu.setAttribute('aria-label', 'Formats');

    DESC_FORMAT_OPTIONS.forEach(function (opt) {
      var optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'info-desc-format-option';
      optBtn.setAttribute('role', 'option');
      optBtn.setAttribute('data-md-kind', opt.kind);
      optBtn.textContent = opt.label;
      if (opt.kind === 'h1') optBtn.classList.add('is-heading-1');
      if (opt.kind === 'h2') optBtn.classList.add('is-heading-2');
      if (opt.kind === 'h3') optBtn.classList.add('is-heading-3');
      descFormatMenu.appendChild(optBtn);
    });

    descFormatWrap.appendChild(descFormatBtn);
    descFormatWrap.appendChild(descFormatMenu);

    function makeDescToolbarBtn(opts) {
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
    }

    var descToolbarSep = document.createElement('span');
    descToolbarSep.className = 'info-desc-toolbar-sep';
    descToolbarSep.setAttribute('aria-hidden', 'true');

    var descBoldBtn = makeDescToolbarBtn({
      action: 'bold',
      title: 'Gras (Ctrl+B)',
      label: 'Gras',
      icon: 'ti-bold',
      mod: 'is-emphasis'
    });
    var descItalicBtn = makeDescToolbarBtn({
      action: 'italic',
      title: 'Italique (Ctrl+I)',
      label: 'Italique',
      icon: 'ti-italic',
      mod: 'is-emphasis'
    });
    var descStrikeBtn = makeDescToolbarBtn({
      action: 'strike',
      title: 'Barr\u00e9',
      label: 'Barr\u00e9',
      icon: 'ti-strikethrough',
      mod: 'is-emphasis'
    });
    var descLinkBtn = makeDescToolbarBtn({
      action: 'link',
      title: 'Lien (Ctrl+K)',
      label: 'Lien',
      icon: 'ti-link'
    });
    var descChecklistBtn = makeDescToolbarBtn({
      action: 'checklist',
      title: 'Liste de t\u00e2ches',
      label: 'Liste de t\u00e2ches',
      icon: 'ti-list-check'
    });

    descToolbar.appendChild(descFormatWrap);
    descToolbar.appendChild(descToolbarSep);
    descToolbar.appendChild(descBoldBtn);
    descToolbar.appendChild(descItalicBtn);
    descToolbar.appendChild(descStrikeBtn);
    descToolbar.appendChild(descLinkBtn);
    descToolbar.appendChild(descChecklistBtn);

    var descModeSwitch = document.createElement('div');
    descModeSwitch.className = 'info-desc-mode-switch';
    descModeSwitch.setAttribute('role', 'radiogroup');
    descModeSwitch.setAttribute('aria-label', 'Mode d\u2019\u00e9dition');

    function makeDescModeBtn(mode, label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-desc-mode-btn';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-desc-mode', mode);
      btn.textContent = label;
      descModeSwitch.appendChild(btn);
      return btn;
    }

    var descRichModeBtn = makeDescModeBtn('rich', 'Texte enrichi');
    var descMarkdownModeBtn = makeDescModeBtn('markdown', 'Markdown');
    descToolbar.appendChild(descModeSwitch);

    var descMeta = document.createElement('div');
    descMeta.className = 'info-desc-meta';
    var descSpellSpinner = document.createElement('span');
    descSpellSpinner.className = 'info-desc-spinner';
    descSpellSpinner.hidden = true;
    descSpellSpinner.setAttribute('aria-hidden', 'true');
    descSpellSpinner.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
    var descStatus = document.createElement('span');
    descStatus.className = 'info-desc-status';
    descStatus.setAttribute('aria-live', 'polite');
    descMeta.appendChild(descSpellSpinner);
    descMeta.appendChild(descStatus);

    var descMetaToggle = document.createElement('button');
    descMetaToggle.type = 'button';
    descMetaToggle.className = 'info-desc-meta-toggle';
    descMetaToggle.hidden = true;
    descMetaToggle.setAttribute('aria-pressed', 'false');
    descMetaToggle.textContent = 'Afficher les m\u00e9tadonn\u00e9es masqu\u00e9es';

    function syncDescMetaToggle() {
      var has =
        Object.keys(descMetaMap).length > 0 ||
        (editorShowsFullDesc() && splitFullDesc(descInput.value).hasMeta);
      descMetaToggle.hidden = !has && !showDescMeta;
      descMetaToggle.setAttribute('aria-pressed', showDescMeta ? 'true' : 'false');
      descMetaToggle.textContent = showDescMeta
        ? 'Masquer les m\u00e9tadonn\u00e9es'
        : 'Afficher les m\u00e9tadonn\u00e9es masqu\u00e9es';
    }

    descMetaToggle.addEventListener('click', function () {
      syncDescSourceFromRich();
      if (showDescMeta) {
        var split = splitFullDesc(descInput.value);
        descMetaMap = cloneMetaMap(split.meta);
        showDescMeta = false;
        descInput.value = split.visible;
      } else {
        showDescMeta = true;
        descInput.value = joinFullDesc(descInput.value, descMetaMap);
      }
      if (descMode === 'rich') renderDescRich();
      else syncDescInputSize();
      syncDescMetaToggle();
      onLayoutChange();
    });

    var authBox = document.createElement('div');
    authBox.className = 'info-auth-box';
    authBox.hidden = true;
    var authHint = document.createElement('p');
    authHint.className = 'info-auth-hint';
    var authBtn = document.createElement('button');
    authBtn.type = 'button';
    authBtn.className = 'tp-button info-auth-button';
    authBtn.textContent = 'Autoriser Trello (lecture + \u00e9criture)';
    authBox.appendChild(authHint);
    authBox.appendChild(authBtn);

    descWrap.appendChild(descToolbar);
    descWrap.appendChild(descRich);
    descWrap.appendChild(descInput);
    descWrap.appendChild(descMeta);
    descWrap.appendChild(descMetaToggle);
    descWrap.appendChild(authBox);
    descRow.value.appendChild(descWrap);
    body.appendChild(descRow.row);
    syncDescMetaToggle();

    // ── Creator (visible when ≠ sole assignee) ─────────────────────────
    var creatorRow = makeRow('creator', 'Cr\u00e9ateur', { icon: 'ti-user' });
    var creatorEl = document.createElement('div');
    creatorEl.className = 'info-members info-creator';
    creatorEl.setAttribute('aria-label', 'Cr\u00e9ateur de la carte');
    creatorRow.value.appendChild(creatorEl);
    creatorRow.row.hidden = true;
    body.appendChild(creatorRow.row);

    // ── Assignees ──────────────────────────────────────────────────────
    var membersRow = makeRow('members', 'Assign\u00e9s', { icon: 'ti-users' });
    var membersWrap = document.createElement('div');
    membersWrap.className = 'info-members-wrap';

    var membersEl = document.createElement('div');
    membersEl.className = 'info-members';
    membersEl.setAttribute('aria-label', 'Membres assign\u00e9s');

    var membersAddWrap = document.createElement('div');
    membersAddWrap.className = 'info-members-add-wrap';

    var membersAddBtn = document.createElement('button');
    membersAddBtn.type = 'button';
    membersAddBtn.className = 'info-members-add-btn';
    membersAddBtn.setAttribute('aria-label', 'Ajouter un membre');
    membersAddBtn.title = 'Ajouter un membre';
    membersAddBtn.setAttribute('aria-expanded', 'false');
    membersAddBtn.setAttribute('aria-haspopup', 'listbox');
    membersAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var membersPicker = document.createElement('div');
    membersPicker.className = 'info-members-picker';
    membersPicker.hidden = true;
    membersPicker.setAttribute('role', 'listbox');
    membersPicker.setAttribute('aria-label', 'Membres du tableau');

    var membersStatus = document.createElement('span');
    membersStatus.className = 'info-desc-status';
    membersStatus.setAttribute('aria-live', 'polite');

    membersAddWrap.appendChild(membersAddBtn);
    membersAddWrap.appendChild(membersPicker);
    var membersInline = document.createElement('div');
    membersInline.className = 'info-members-inline';
    membersInline.appendChild(membersEl);
    membersInline.appendChild(membersAddWrap);
    // Default is the compact chip list; clicking a person opens the node view
    // (assignees as cards, wires for who asks whom / hands off to whom).
    membersEl.hidden = false;
    var tgHost = document.createElement('div');
    tgHost.className = 'tg';
    tgHost.hidden = true;
    var tgFrame = document.createElement('div');
    tgFrame.className = 'tg-frame';
    var tgStage = document.createElement('div');
    tgStage.className = 'tg-stage';
    var tgWires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tgWires.setAttribute('class', 'tg-wires');
    tgWires.setAttribute('aria-hidden', 'true');
    var tgNodes = document.createElement('div');
    tgNodes.className = 'tg-nodes';
    var tgPills = document.createElement('div');
    tgPills.className = 'tg-pills';
    tgStage.appendChild(tgWires);
    tgStage.appendChild(tgNodes);
    tgStage.appendChild(tgPills);
    var tgEditor = document.createElement('div');
    tgEditor.className = 'tg-editor';
    tgEditor.hidden = true;
    tgEditor.setAttribute('role', 'dialog');
    tgEditor.setAttribute('aria-label', 'Modifier la relation');
    var tgCreate = document.createElement('div');
    tgCreate.className = 'tg-editor tg-create';
    tgCreate.hidden = true;
    tgCreate.setAttribute('role', 'dialog');
    tgCreate.setAttribute('aria-label', 'Nouvelle personne \u00e0 relier');
    var tgCollapseBtn = document.createElement('button');
    tgCollapseBtn.type = 'button';
    tgCollapseBtn.className = 'tg-collapse';
    tgCollapseBtn.title = 'Revenir \u00e0 la vue simple';
    tgCollapseBtn.innerHTML =
      '<i class="ti ti-chevron-up" aria-hidden="true"></i><span>R\u00e9duire</span>';
    tgFrame.appendChild(tgStage);
    tgFrame.appendChild(tgEditor);
    tgFrame.appendChild(tgCreate);
    tgFrame.appendChild(tgCollapseBtn);
    var tgZoomOutBtn = document.createElement('button');
    tgZoomOutBtn.type = 'button';
    tgZoomOutBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-out';
    tgZoomOutBtn.title = 'D\u00e9zoomer (ou Ctrl + molette)';
    tgZoomOutBtn.setAttribute('aria-label', 'D\u00e9zoomer');
    tgZoomOutBtn.innerHTML = '<i class="ti ti-zoom-out" aria-hidden="true"></i>';
    var tgZoomInBtn = document.createElement('button');
    tgZoomInBtn.type = 'button';
    tgZoomInBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-in';
    tgZoomInBtn.title = 'Zoomer';
    tgZoomInBtn.setAttribute('aria-label', 'Zoomer');
    tgZoomInBtn.innerHTML = '<i class="ti ti-zoom-in" aria-hidden="true"></i>';
    tgFrame.appendChild(tgZoomOutBtn);
    tgFrame.appendChild(tgZoomInBtn);
    var tgExpandBtn = document.createElement('button');
    tgExpandBtn.type = 'button';
    tgExpandBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-expand';
    tgExpandBtn.setAttribute('aria-label', 'Hauteur de la vue');
    var tgResizeHandle = document.createElement('div');
    tgResizeHandle.className = 'tg-resize';
    tgResizeHandle.title = 'Glisser pour changer la hauteur';
    tgFrame.appendChild(tgExpandBtn);
    tgFrame.appendChild(tgResizeHandle);
    var tgHint = document.createElement('div');
    tgHint.className = 'tg-hint';
    tgHost.appendChild(tgFrame);
    tgHost.appendChild(tgHint);
    membersWrap.appendChild(tgHost);
    membersWrap.appendChild(membersInline);
    membersWrap.appendChild(membersStatus);

    var memberRolesPickerHost = document.createElement('div');
    memberRolesPickerHost.className = 'info-member-roles-picker-host';
    memberRolesPickerHost.hidden = true;
    var memberRolesPicker = document.createElement('div');
    memberRolesPicker.className = 'info-member-roles-picker';
    memberRolesPicker.setAttribute('role', 'listbox');
    memberRolesPicker.setAttribute('aria-label', 'R\u00f4les disponibles');
    memberRolesPickerHost.appendChild(memberRolesPicker);
    membersWrap.appendChild(memberRolesPickerHost);

    membersRow.value.appendChild(membersWrap);
    body.appendChild(membersRow.row);

    // ── Places: a route of ordered stops (De, étapes, Vers, or Sur place) ──
    // Simple view = chips; clicking opens the node view (same look as Assignés).
    var PLACE_STOP_LABELS = {
      from: 'De',
      via: 'Étape',
      to: 'Vers',
      at: 'Sur place'
    };
    var placesRow = makeRow('places', 'Lieux', { icon: 'ti-map-pin' });
    var placesWrap = document.createElement('div');
    placesWrap.className = 'info-places-wrap';
    placesWrap.setAttribute('aria-label', 'Lieux de la tâche');

    var placesRouteEl = document.createElement('div');
    placesRouteEl.className = 'info-route';

    var pgHost = document.createElement('div');
    pgHost.className = 'tg pg';
    pgHost.hidden = true;
    var pgFrame = document.createElement('div');
    pgFrame.className = 'tg-frame';
    var pgStage = document.createElement('div');
    pgStage.className = 'tg-stage';
    var pgWires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pgWires.setAttribute('class', 'tg-wires');
    pgWires.setAttribute('aria-hidden', 'true');
    var pgNodes = document.createElement('div');
    pgNodes.className = 'tg-nodes';
    var pgPills = document.createElement('div');
    pgPills.className = 'tg-pills';
    pgStage.appendChild(pgWires);
    pgStage.appendChild(pgNodes);
    pgStage.appendChild(pgPills);
    var pgEditor = document.createElement('div');
    pgEditor.className = 'tg-editor pg-pop pg-place-editor';
    pgEditor.hidden = true;
    pgEditor.setAttribute('role', 'dialog');
    pgEditor.setAttribute('aria-label', 'Modifier le lieu');
    var pgPop = document.createElement('div');
    pgPop.className = 'tg-editor tg-create pg-pop';
    pgPop.hidden = true;
    pgPop.setAttribute('role', 'dialog');
    pgPop.setAttribute('aria-label', 'Ajouter un lieu');

    var pgToolbar = document.createElement('div');
    pgToolbar.className = 'pg-toolbar';
    var pgAutoBtn = document.createElement('button');
    pgAutoBtn.type = 'button';
    pgAutoBtn.className = 'tg-collapse pg-tool';
    pgAutoBtn.title = 'Remettre les lieux en ordre (annule les d\u00e9placements)';
    pgAutoBtn.hidden = true;
    pgAutoBtn.innerHTML =
      '<i class="ti ti-layout-grid" aria-hidden="true"></i><span>Ranger</span>';
    var pgItinBtn = document.createElement('a');
    pgItinBtn.className = 'tg-collapse pg-tool';
    pgItinBtn.target = '_blank';
    pgItinBtn.rel = 'noopener noreferrer';
    pgItinBtn.title = 'Itinéraire dans Google Maps';
    pgItinBtn.hidden = true;
    pgItinBtn.innerHTML =
      '<i class="ti ti-map-route" aria-hidden="true"></i><span>Itinéraire</span>';
    var pgCollapseBtn = document.createElement('button');
    pgCollapseBtn.type = 'button';
    pgCollapseBtn.className = 'tg-collapse pg-tool';
    pgCollapseBtn.title = 'Revenir à la vue simple';
    pgCollapseBtn.innerHTML =
      '<i class="ti ti-chevron-up" aria-hidden="true"></i><span>Réduire</span>';
    pgToolbar.appendChild(pgAutoBtn);
    pgToolbar.appendChild(pgItinBtn);
    pgToolbar.appendChild(pgCollapseBtn);

    var pgZoomOutBtn = document.createElement('button');
    pgZoomOutBtn.type = 'button';
    pgZoomOutBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-out';
    pgZoomOutBtn.title = 'Dézoomer (ou Ctrl + molette)';
    pgZoomOutBtn.setAttribute('aria-label', 'Dézoomer');
    pgZoomOutBtn.innerHTML = '<i class="ti ti-zoom-out" aria-hidden="true"></i>';
    var pgZoomInBtn = document.createElement('button');
    pgZoomInBtn.type = 'button';
    pgZoomInBtn.className = 'tg-collapse tg-zoom-btn tg-zoom-in';
    pgZoomInBtn.title = 'Revenir à la taille ajustée';
    pgZoomInBtn.setAttribute('aria-label', 'Agrandir');
    pgZoomInBtn.innerHTML = '<i class="ti ti-zoom-in" aria-hidden="true"></i>';

    pgFrame.appendChild(pgStage);
    pgFrame.appendChild(pgEditor);
    pgFrame.appendChild(pgPop);
    pgFrame.appendChild(pgToolbar);
    pgFrame.appendChild(pgZoomOutBtn);
    pgFrame.appendChild(pgZoomInBtn);
    pgHost.appendChild(pgFrame);

    var placesStatus = document.createElement('span');
    placesStatus.className = 'info-desc-status';
    placesStatus.setAttribute('aria-live', 'polite');

    placesWrap.appendChild(pgHost);
    placesWrap.appendChild(placesRouteEl);
    placesWrap.appendChild(placesStatus);
    placesRow.value.appendChild(placesWrap);
    body.appendChild(placesRow.row);

    rowSummaries.title = function () {
      return titleInput.classList.contains('is-loading') ? '' : titleInput.value;
    };
    function mountText(mount, selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var el = mount.querySelector(selectors[i]);
        var t = el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (t) return t;
      }
      return '';
    }

    // ── Rich folded-row summaries: avatars, icons and tinted chips ──────
    // A builder returns a DocumentFragment (or '' when the row is empty).
    // textContent doubles as the « has a value » test and the tooltip, so
    // purely decorative bits (initials, arrows, dots) never go in as text.
    var IRS_MAX = 3;

    function irsEl(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    }

    function irsIcon(name, className) {
      var i = document.createElement('i');
      i.className = 'ti ti-' + name + (className ? ' ' + className : '');
      i.setAttribute('aria-hidden', 'true');
      return i;
    }

    // Tinted pill: optional leading node (icon / dot / avatar) + text.
    function irsChip(opts) {
      var chip = irsEl('span', 'irs-chip' + (opts.className ? ' ' + opts.className : ''));
      if (opts.accent) chip.style.setProperty('--irs-accent', opts.accent);
      if (opts.title) chip.title = opts.title;
      if (opts.lead) chip.appendChild(opts.lead);
      if (opts.text) chip.appendChild(irsEl('span', 'irs-chip-text', opts.text));
      return chip;
    }

    function irsFragment(nodes, title) {
      var frag = document.createDocumentFragment();
      nodes.forEach(function (n, i) {
        if (i) frag.appendChild(document.createTextNode(' '));
        frag.appendChild(n);
      });
      if (title) frag.summaryTitle = title;
      return frag;
    }

    // First `max` nodes, then a « +N » chip for the rest.
    function irsCapped(nodes, max) {
      if (nodes.length <= max) return nodes;
      var out = nodes.slice(0, max);
      out.push(
        irsChip({
          className: 'irs-chip--more',
          text: '+' + (nodes.length - max)
        })
      );
      return out;
    }

    function irsHueColor(seed) {
      return 'hsl(' + tgHue(String(seed || '?')) + ' 62% 58%)';
    }

    function irsColorOf(el) {
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
    }

    function irsAvatar(member) {
      var resolved = enrichMemberAvatar(member);
      var url = memberAvatarUrl(resolved);
      var mid = member && member.id != null ? String(member.id) : '';
      var wrap = irsEl('span', 'irs-avatar');
      function initialsFallback() {
        wrap.replaceChildren();
        wrap.classList.add('is-initials');
        wrap.style.setProperty('--irs-hue', String(tgHue(mid || memberDisplayName(resolved) || '?')));
        wrap.setAttribute('data-initials', memberInitials(resolved));
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
    }

    function irsTypeChip(id) {
      var label = taskTypeLabel(id) || id;
      var icon = irsEl('span', 'irs-type-icon');
      icon.innerHTML = taskTypeIconSvg(id);
      return irsChip({
        className: 'irs-type',
        accent: irsHueColor(id),
        lead: icon,
        text: label,
        title: taskTypeHint(id) || label
      });
    }

    function irsLabelChip(label) {
      var hex = labelColorHex(label && label.color);
      var name = labelDisplayName(label);
      var chip = irsChip({ className: 'irs-label', text: name, title: name });
      chip.style.setProperty('--label-color', hex);
      chip.style.setProperty('--label-fg', labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff');
      return chip;
    }

    function irsParentChip(parent, withList) {
      var chip = irsChip({
        className: 'irs-parent',
        lead: irsIcon('hierarchy-3'),
        text: parent.name || 'Carte sans titre',
        title: parent.list ? (parent.name || '') + ' — ' + parent.list : parent.name || ''
      });
      if (withList && parent.list) {
        chip.appendChild(irsEl('span', 'irs-chip-sub', parent.list));
      }
      return chip;
    }

    function objectifCrumbNames() {
      return Array.prototype.map
        .call(
          objectifMount.querySelectorAll('.objectif-breadcrumb .objectif-crumb'),
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
    }

    function irsObjectifNode(names) {
      var wrap = irsEl('span', 'irs-crumbs');
      names.forEach(function (name, i) {
        if (i) wrap.appendChild(irsIcon('chevron-right', 'irs-arrow'));
        var last = i === names.length - 1;
        wrap.appendChild(
          irsChip({
            className: 'irs-objectif' + (last ? ' is-last' : ''),
            lead: last ? irsIcon('target-arrow') : null,
            text: name
          })
        );
      });
      return wrap;
    }

    rowSummaries.priority = function () {
      var m = priorityInline.mount;
      var score = mountText(m, ['.heat-badge-num-val']);
      var label = mountText(m, ['.priority-summary-label', '.heat-badge-label']);
      if (!label) return score;
      var accent = irsColorOf(m.querySelector('.priority-summary-dot, .heat-tier-dot'));
      var idle = !!m.querySelector('.priority-summary.is-inutile, .heat-badge.is-inutile');
      var nodes = [
        irsChip({
          className: 'irs-priority' + (idle ? ' is-idle' : ''),
          accent: accent,
          lead: irsEl('span', 'irs-dot'),
          text: label
        })
      ];
      if (score) {
        nodes.push(
          irsChip({
            className: 'irs-chip--score',
            accent: accent,
            text: score,
            title: 'Score de priorité'
          })
        );
      }
      return irsFragment(nodes);
    };

    rowSummaries.progress = function () {
      var m = progressInline.mount;
      var statutEl = m.querySelector('.statut-summary');
      var status = mountText(m, ['.statut-summary-label', '.statut-embedded-summary']);
      var pctMatch = /(\d+)\s*%/.exec(m.textContent || '');
      var pct = pctMatch ? Math.max(0, Math.min(100, +pctMatch[1])) : null;
      if (!status && pct == null) return '';
      var statusColor = statutEl ? statutEl.style.getPropertyValue('--statut-color') : '';
      var barHost = m.querySelector('.progress-summary');
      var barColor =
        (barHost && barHost.style.getPropertyValue('--overview-progress-accent')) || statusColor;
      var icon = statutEl ? statutEl.querySelector('svg') : null;
      var nodes = [
        irsChip({
          className: 'irs-status',
          accent: statusColor || barColor,
          lead: icon ? icon.cloneNode(true) : irsEl('span', 'irs-dot'),
          text: status || 'Progrès'
        })
      ];
      if (pct != null) {
        var meter = irsEl('span', 'irs-progress');
        if (barColor) meter.style.setProperty('--irs-accent', barColor);
        meter.title = 'Progrès : ' + pct + ' %';
        meter.classList.toggle('is-done', pct >= 100);
        var track = irsEl('span', 'irs-bar');
        var fill = irsEl('span', 'irs-bar-fill');
        fill.style.width = pct + '%';
        track.appendChild(fill);
        meter.appendChild(track);
        meter.appendChild(irsEl('span', 'irs-pct', pct + ' %'));
        nodes.push(meter);
      }
      return irsFragment(nodes);
    };

    rowSummaries.due = function () {
      var m = dueInline.mount;
      var label = mountText(m, ['.due-summary-label']);
      if (!label) return '';
      var wrap = m.querySelector('.due-summary');
      var band = wrap && wrap.dataset ? wrap.dataset.dueBand || '' : '';
      var vague = !!(wrap && wrap.classList.contains('due-summary--vague'));
      var accent =
        dueBandAccent(band) || irsColorOf(m.querySelector('.due-summary-dot'));
      var lead = irsEl('span', 'irs-dot');
      if (vague) lead = irsIcon('tilde');
      else if (band === 'overdue') lead = irsIcon('alert-triangle');
      else if (band === 'imminent') lead = irsIcon('clock-exclamation');
      return irsFragment([
        irsChip({
          className: 'irs-due' + (band ? ' is-' + band : ''),
          accent: accent,
          lead: lead,
          text: label
        })
      ]);
    };

    rowSummaries['task-types'] = function () {
      if (!taskTypes.length) return '';
      return irsFragment(
        irsCapped(taskTypes.map(irsTypeChip), IRS_MAX),
        taskTypes
          .map(function (id) {
            return taskTypeLabel(id) || id;
          })
          .join(', ')
      );
    };

    rowSummaries.labels = function () {
      if (!labels.length) return '';
      return irsFragment(
        irsCapped(labels.map(irsLabelChip), IRS_MAX + 1),
        labels.map(labelDisplayName).join(', ')
      );
    };

    rowSummaries.objectif = function () {
      var names = objectifCrumbNames();
      if (!names.length) return '';
      return irsFragment([irsObjectifNode(names)], names.join(' → '));
    };

    rowSummaries.parent = function () {
      if (!parentCards.length) return '';
      return irsFragment(
        irsCapped(
          parentCards.map(function (p) {
            return irsParentChip(p, parentCards.length === 1);
          }),
          2
        ),
        parentCards
          .map(function (p) {
            return p.name || 'Carte sans titre';
          })
          .join(', ')
      );
    };

    rowSummaries.desc = function () {
      var raw = descInput.value || '';
      var text = raw
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/gm, '')
        .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/[*_`~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 160) text = text.slice(0, 159) + '…';

      var tasksTotal = 0;
      var tasksDone = 0;
      var taskRe = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]/gm;
      var hit;
      while ((hit = taskRe.exec(raw))) {
        tasksTotal += 1;
        if (hit[1] !== ' ') tasksDone += 1;
      }
      var images = (raw.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
      var links = Math.max(0, (raw.match(/\bhttps?:\/\/[^\s)\]]+/g) || []).length - images);

      if (!text && !tasksTotal && !images && !links) return '';
      var nodes = [];
      if (text) nodes.push(irsEl('span', 'irs-text', text));
      if (tasksTotal) {
        var allDone = tasksDone === tasksTotal;
        nodes.push(
          irsChip({
            className: 'irs-chip--tasks' + (allDone ? ' is-done' : ''),
            lead: irsIcon(allDone ? 'checks' : 'list-check'),
            text: tasksDone + '/' + tasksTotal,
            title: tasksDone + ' tâche(s) faite(s) sur ' + tasksTotal
          })
        );
      }
      if (links) {
        nodes.push(
          irsChip({
            className: 'irs-chip--links',
            lead: irsIcon('link'),
            text: String(links),
            title: links + (links > 1 ? ' liens' : ' lien')
          })
        );
      }
      if (images) {
        nodes.push(
          irsChip({
            className: 'irs-chip--images',
            lead: irsIcon('photo'),
            text: String(images),
            title: images + (images > 1 ? ' images' : ' image')
          })
        );
      }
      return irsFragment(nodes, text);
    };

    rowSummaries.members = function () {
      var display = displayAssignees();
      if (!display.length) return '';
      var compact = display.length > 2;
      var nodes = display.map(function (member) {
        var name = memberDisplayName(member) || 'Membre';
        var mid = member && member.id != null ? String(member.id) : '';
        var isCustom = !!(member && member.custom) || isCustomAssigneeId(mid);
        var roleIds = rolesForMember(mid);
        var roleLabels = [];
        var chip = irsChip({
          className: 'irs-member' + (isCustom ? ' is-custom' : ''),
          accent: irsHueColor(mid || name),
          lead: irsAvatar(member),
          text: compact ? name.split(/\s+/)[0] : name
        });
        roleIds.slice(0, 2).forEach(function (roleId) {
          var entry = getMemberRoleEntry(roleId);
          var roleLabel = (entry && entry.label) || roleId;
          roleLabels.push(roleLabel);
          var roleIcon = irsIcon((entry && entry.icon) || 'tag', 'irs-member-role');
          roleIcon.title = roleLabel;
          chip.appendChild(roleIcon);
        });
        chip.title = roleLabels.length ? name + ' — ' + roleLabels.join(', ') : name;
        return chip;
      });
      return irsFragment(
        irsCapped(nodes, IRS_MAX),
        display
          .map(function (member) {
            return memberDisplayName(member) || 'Membre';
          })
          .join(', ')
      );
    };

    rowSummaries.places = function () {
      var stops = pgStops(cardPlaces);
      if (!stops.length) return '';
      var shown = stops;
      var hidden = 0;
      if (stops.length > IRS_MAX) {
        shown = [stops[0], null, stops[stops.length - 1]];
        hidden = stops.length - 2;
      }
      var nodes = [];
      shown.forEach(function (stop, i) {
        if (i) nodes.push(irsIcon('arrow-narrow-right', 'irs-arrow'));
        if (!stop) {
          nodes.push(irsChip({ className: 'irs-chip--more', text: '+' + hidden }));
          return;
        }
        var name = placeDisplayName(stop.ref);
        nodes.push(
          irsChip({
            className: 'irs-place is-' + stop.key,
            accent: irsHueColor(stop.ref.id || name),
            lead: stop.key === 'at' ? irsIcon('map-pin') : irsEl('span', 'irs-stop-dot'),
            text: name,
            title: PLACE_STOP_LABELS[stop.key] + ' : ' + name
          })
        );
      });
      var acts = placeSeq(cardPlaces).filter(function (r) {
        return r.do;
      }).length;
      if (acts) {
        nodes.push(
          irsChip({
            className: 'irs-chip--actions',
            lead: irsIcon('list-check'),
            text: String(acts),
            title: acts + ' action' + (acts > 1 ? 's' : '')
          })
        );
      }
      return irsFragment(
        nodes,
        stops
          .map(function (stop) {
            return placeDisplayName(stop.ref);
          })
          .join(' → ')
      );
    };

    // ── Inline feature mounts (Priorité / Progrès / Échéance) ───────────
    function makeInlineMountRow(key, labelText, icon) {
      var row = makeRow(key, labelText, { icon: icon });
      row.row.classList.add('info-row--inline-feature');
      row.row.hidden = true;
      var mount = document.createElement('div');
      mount.className = 'info-inline-mount info-inline-mount--' + key;
      row.value.appendChild(mount);
      body.appendChild(row.row);
      return { row: row.row, mount: mount };
    }

    var priorityInline = makeInlineMountRow(
      'priority',
      'Priorit\u00e9',
      'ti-flame'
    );
    var progressInline = makeInlineMountRow(
      'progress',
      'Progr\u00e8s',
      'ti-progress'
    );
    var dueInline = makeInlineMountRow(
      'due',
      '\u00c9ch\u00e9ance',
      'ti-calendar-event'
    );

    // ── Labels (Trello étiquettes) ─────────────────────────────────────
    var labelsRow = makeRow('labels', '\u00c9tiquettes', { icon: 'ti-tag' });
    var labelsWrap = document.createElement('div');
    labelsWrap.className = 'info-labels-wrap';

    var labelsEl = document.createElement('div');
    labelsEl.className = 'info-labels';
    labelsEl.setAttribute('aria-label', '\u00c9tiquettes de la carte');

    var labelsAddWrap = document.createElement('div');
    labelsAddWrap.className = 'info-labels-add-wrap';

    var labelsAddBtn = document.createElement('button');
    labelsAddBtn.type = 'button';
    labelsAddBtn.className = 'info-labels-add-btn';
    labelsAddBtn.setAttribute('aria-label', 'Ajouter une \u00e9tiquette');
    labelsAddBtn.title = 'Ajouter une \u00e9tiquette';
    labelsAddBtn.setAttribute('aria-expanded', 'false');
    labelsAddBtn.setAttribute('aria-haspopup', 'listbox');
    labelsAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var labelsPicker = document.createElement('div');
    labelsPicker.className = 'info-labels-picker';
    labelsPicker.hidden = true;
    labelsPicker.setAttribute('role', 'listbox');
    labelsPicker.setAttribute('aria-label', '\u00c9tiquettes du tableau');

    var labelsSearchInput = document.createElement('input');
    labelsSearchInput.type = 'search';
    labelsSearchInput.className = 'tp-input info-labels-search';
    labelsSearchInput.placeholder = 'Rechercher une \u00e9tiquette\u2026';
    labelsSearchInput.setAttribute('aria-label', 'Rechercher une \u00e9tiquette');
    labelsSearchInput.setAttribute('autocomplete', 'off');

    var labelsPickerList = document.createElement('div');
    labelsPickerList.className = 'info-labels-picker-list';
    labelsPickerList.setAttribute('role', 'group');
    labelsPickerList.setAttribute('aria-label', '\u00c9tiquettes disponibles');

    var labelsCreateBtn = document.createElement('button');
    labelsCreateBtn.type = 'button';
    labelsCreateBtn.className = 'info-labels-picker-create';
    labelsCreateBtn.hidden = true;

    labelsPicker.appendChild(labelsSearchInput);
    labelsPicker.appendChild(labelsPickerList);
    labelsPicker.appendChild(labelsCreateBtn);

    var labelsStatus = document.createElement('span');
    labelsStatus.className = 'info-desc-status';
    labelsStatus.setAttribute('aria-live', 'polite');

    var labelsSuggestSection = document.createElement('div');
    labelsSuggestSection.className = 'info-labels-suggestions';
    labelsSuggestSection.hidden = true;
    labelsSuggestSection.innerHTML =
      '<div class="info-labels-suggestions-head">' +
      '<button type="button" class="info-labels-suggestions-refresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">\u21bb</button>' +
      '</div>' +
      '<div class="info-labels-suggestions-list" role="list"></div>';
    var labelsSuggestRefreshBtn = labelsSuggestSection.querySelector(
      '.info-labels-suggestions-refresh'
    );
    var labelsSuggestListEl = labelsSuggestSection.querySelector(
      '.info-labels-suggestions-list'
    );

    labelsAddWrap.appendChild(labelsAddBtn);
    labelsAddWrap.appendChild(labelsPicker);
    var labelsInline = document.createElement('div');
    labelsInline.className = 'info-labels-inline';
    labelsInline.appendChild(labelsEl);
    labelsInline.appendChild(labelsAddWrap);

    var labelsColorPicker = document.createElement('div');
    labelsColorPicker.className = 'info-labels-color-picker';
    labelsColorPicker.hidden = true;
    labelsColorPicker.setAttribute('role', 'dialog');
    labelsColorPicker.setAttribute('aria-label', 'Modifier l\u2019\u00e9tiquette');

    labelsWrap.appendChild(labelsInline);
    labelsWrap.appendChild(labelsColorPicker);
    labelsWrap.appendChild(labelsStatus);
    labelsWrap.appendChild(labelsSuggestSection);
    labelsRow.value.appendChild(labelsWrap);
    // Appended into Plus de détails below.

    // ── Type de tâche (multi-label catalog) ─────────────────────────────
    var taskTypesRow = makeRow('task-types', 'Type de t\u00e2che', {
      icon: 'ti-category',
    });
    var taskTypesWrap = document.createElement('div');
    taskTypesWrap.className = 'info-task-types-wrap';

    var taskTypesEl = document.createElement('div');
    taskTypesEl.className = 'info-task-types';
    taskTypesEl.setAttribute('aria-label', 'Types de t\u00e2che');

    var taskTypesAddWrap = document.createElement('div');
    taskTypesAddWrap.className = 'info-task-types-add-wrap';

    var taskTypesAddBtn = document.createElement('button');
    taskTypesAddBtn.type = 'button';
    taskTypesAddBtn.className = 'info-task-types-add-btn';
    taskTypesAddBtn.setAttribute('aria-label', 'Ajouter un type de t\u00e2che');
    taskTypesAddBtn.title = 'Ajouter un type de t\u00e2che';
    taskTypesAddBtn.setAttribute('aria-expanded', 'false');
    taskTypesAddBtn.setAttribute('aria-haspopup', 'listbox');
    taskTypesAddBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var taskTypesPicker = document.createElement('div');
    taskTypesPicker.className = 'info-task-types-picker';
    taskTypesPicker.hidden = true;
    taskTypesPicker.setAttribute('role', 'listbox');
    taskTypesPicker.setAttribute('aria-label', 'Types de t\u00e2che disponibles');

    var taskTypesPickerList = document.createElement('div');
    taskTypesPickerList.className = 'info-task-types-picker-list';
    taskTypesPickerList.setAttribute('role', 'group');
    taskTypesPickerList.setAttribute('aria-label', 'Types disponibles');

    var taskTypesCreateWrap = document.createElement('div');
    taskTypesCreateWrap.className = 'info-task-types-create';
    taskTypesCreateWrap.hidden = !onCustomTaskTypesChange;

    var taskTypesCreateRow = document.createElement('div');
    taskTypesCreateRow.className = 'info-task-types-create-row';

    var taskTypesCreateIconWrap = document.createElement('div');
    taskTypesCreateIconWrap.className = 'info-task-types-create-icon-wrap';

    var taskTypesCreateIconKey = randomTaskTypeIconKey();
    var taskTypesIconPickerOpen = false;

    var taskTypesCreateIconBtn = document.createElement('button');
    taskTypesCreateIconBtn.type = 'button';
    taskTypesCreateIconBtn.className = 'info-task-types-create-icon-trigger';
    taskTypesCreateIconBtn.title = 'Choisir une ic\u00f4ne';
    taskTypesCreateIconBtn.setAttribute('aria-label', 'Choisir une ic\u00f4ne');
    taskTypesCreateIconBtn.setAttribute('aria-expanded', 'false');
    taskTypesCreateIconBtn.setAttribute('aria-haspopup', 'listbox');

    var taskTypesIconPicker = document.createElement('div');
    taskTypesIconPicker.className = 'info-task-types-icon-picker';
    taskTypesIconPicker.hidden = true;
    taskTypesIconPicker.setAttribute('role', 'listbox');
    taskTypesIconPicker.setAttribute('aria-label', 'Ic\u00f4nes disponibles');

    function syncTaskTypesCreateIconBtn() {
      taskTypesCreateIconBtn.innerHTML = taskTypeIconSvg(
        taskTypesCreateIconKey,
        'info-task-type-icon'
      );
      taskTypesCreateIconBtn.setAttribute(
        'aria-expanded',
        taskTypesIconPickerOpen ? 'true' : 'false'
      );
      taskTypesCreateIconWrap.classList.toggle(
        'is-open',
        taskTypesIconPickerOpen
      );
    }

    function setTaskTypesIconPickerOpen(open) {
      taskTypesIconPickerOpen = !!open;
      taskTypesIconPicker.hidden = !taskTypesIconPickerOpen;
      if (taskTypesIconPickerOpen) renderTaskTypesIconPicker();
      syncTaskTypesCreateIconBtn();
      onLayoutChange();
      if (taskTypesPickerOpen) {
        requestAnimationFrame(positionTaskTypesPicker);
      }
    }

    function setTaskTypesCreateIconKey(key, options) {
      options = options || {};
      taskTypesCreateIconKey = normalizeTaskTypeIconKey(key, taskTypesCreateIconKey);
      syncTaskTypesCreateIconBtn();
      if (taskTypesIconPickerOpen) renderTaskTypesIconPicker();
      if (options.close !== false) setTaskTypesIconPickerOpen(false);
    }

    function randomizeTaskTypesCreateIcon() {
      setTaskTypesCreateIconKey(randomTaskTypeIconKey(), { close: true });
    }

    function renderTaskTypesIconPicker() {
      taskTypesIconPicker.replaceChildren();
      getTaskTypeIconKeys().forEach(function (iconKey) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-task-types-icon-picker-option';
        btn.setAttribute('role', 'option');
        btn.dataset.iconKey = iconKey;
        btn.title = iconKey;
        btn.setAttribute('aria-label', 'Ic\u00f4ne\u00a0: ' + iconKey);
        btn.setAttribute(
          'aria-selected',
          iconKey === taskTypesCreateIconKey ? 'true' : 'false'
        );
        if (iconKey === taskTypesCreateIconKey) {
          btn.classList.add('is-selected');
        }
        btn.innerHTML = taskTypeIconSvg(iconKey);
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          setTaskTypesCreateIconKey(iconKey);
        });
        taskTypesIconPicker.appendChild(btn);
      });
    }

    syncTaskTypesCreateIconBtn();

    var taskTypesCreateInput = document.createElement('input');
    taskTypesCreateInput.type = 'search';
    taskTypesCreateInput.className = 'tp-input info-task-types-create-input';
    taskTypesCreateInput.placeholder = 'Rechercher ou cr\u00e9er\u2026';
    taskTypesCreateInput.setAttribute(
      'aria-label',
      'Rechercher ou cr\u00e9er un type de t\u00e2che'
    );
    taskTypesCreateInput.setAttribute('autocomplete', 'off');
    taskTypesCreateInput.maxLength = MAX_TASK_TYPE_LABEL_LEN;

    var taskTypesCreateBtn = document.createElement('button');
    taskTypesCreateBtn.type = 'button';
    taskTypesCreateBtn.className = 'info-task-types-create-btn';
    taskTypesCreateBtn.textContent = 'Cr\u00e9er';
    taskTypesCreateBtn.title = 'Cr\u00e9er un type de t\u00e2che';
    taskTypesCreateBtn.disabled = true;

    taskTypesCreateIconWrap.appendChild(taskTypesCreateIconBtn);
    taskTypesCreateRow.appendChild(taskTypesCreateIconWrap);
    taskTypesCreateRow.appendChild(taskTypesCreateInput);
    taskTypesCreateRow.appendChild(taskTypesCreateBtn);
    taskTypesCreateWrap.appendChild(taskTypesCreateRow);
    taskTypesCreateWrap.appendChild(taskTypesIconPicker);

    taskTypesPicker.appendChild(taskTypesCreateWrap);
    taskTypesPicker.appendChild(taskTypesPickerList);

    var taskTypesStatus = document.createElement('span');
    taskTypesStatus.className = 'info-desc-status';
    taskTypesStatus.setAttribute('aria-live', 'polite');
    taskTypesStatus.hidden = true;

    taskTypesAddWrap.appendChild(taskTypesAddBtn);
    taskTypesAddWrap.appendChild(taskTypesPicker);

    var taskTypesSuggestSection = document.createElement('div');
    taskTypesSuggestSection.className = 'info-task-types-suggestions';
    taskTypesSuggestSection.hidden = true;
    taskTypesSuggestSection.innerHTML =
      '<div class="info-task-types-suggestions-list" role="list"></div>' +
      '<button type="button" class="info-task-types-suggestions-refresh" ' +
      'aria-label="Rafra\u00eechir les suggestions" title="Rafra\u00eechir">' +
      '<i class="ti ti-refresh" aria-hidden="true"></i></button>';
    var taskTypesSuggestRefreshBtn = taskTypesSuggestSection.querySelector(
      '.info-task-types-suggestions-refresh'
    );
    var taskTypesSuggestListEl = taskTypesSuggestSection.querySelector(
      '.info-task-types-suggestions-list'
    );

    var taskTypesInline = document.createElement('div');
    taskTypesInline.className = 'info-task-types-inline';
    taskTypesInline.appendChild(taskTypesEl);
    taskTypesInline.appendChild(taskTypesSuggestSection);
    taskTypesInline.appendChild(taskTypesAddWrap);

    taskTypesWrap.appendChild(taskTypesInline);
    taskTypesWrap.appendChild(taskTypesStatus);
    taskTypesRow.value.appendChild(taskTypesWrap);
    // Appended into Plus de détails below (after Objectif / parents).

    // ── Parent tasks (via Progrès linkedCardId reverse lookup) ──────────
    var parentRow = makeRow('parent', 'T\u00e2ches parentes', {
      icon: 'ti-hierarchy-3',
    });
    var parentWrap = document.createElement('div');
    parentWrap.className = 'info-parent-wrap';

    var parentInline = document.createElement('div');
    parentInline.className = 'info-parent-inline';

    var parentChipsEl = document.createElement('div');
    parentChipsEl.className = 'info-parent-chips';

    var parentPickWrap = document.createElement('div');
    parentPickWrap.className = 'info-parent-pick-wrap';

    var parentPickBtn = document.createElement('button');
    parentPickBtn.type = 'button';
    parentPickBtn.className = 'info-parent-pick-btn';
    parentPickBtn.setAttribute('aria-label', 'Ajouter une t\u00e2che parente');
    parentPickBtn.title = 'Ajouter une t\u00e2che parente';
    parentPickBtn.setAttribute('aria-expanded', 'false');
    parentPickBtn.setAttribute('aria-haspopup', 'listbox');
    parentPickBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';

    var parentPicker = document.createElement('div');
    parentPicker.className = 'info-parent-picker';
    parentPicker.hidden = true;
    parentPicker.setAttribute('role', 'listbox');
    parentPicker.setAttribute('aria-label', 'Choisir une t\u00e2che parente');

    var parentSearchInput = document.createElement('input');
    parentSearchInput.type = 'search';
    parentSearchInput.className = 'tp-input info-parent-search';
    parentSearchInput.placeholder = 'Rechercher une carte\u2026';
    parentSearchInput.setAttribute('aria-label', 'Rechercher une carte');

    var parentStatus = document.createElement('p');
    parentStatus.className = 'info-parent-status';
    parentStatus.setAttribute('aria-live', 'polite');
    parentStatus.hidden = true;

    var parentListEl = document.createElement('div');
    parentListEl.className = 'info-parent-list';
    parentListEl.setAttribute('role', 'list');

    parentPicker.appendChild(parentSearchInput);
    parentPicker.appendChild(parentStatus);
    parentPicker.appendChild(parentListEl);
    parentPickWrap.appendChild(parentPickBtn);
    parentPickWrap.appendChild(parentPicker);

    parentInline.appendChild(parentChipsEl);
    parentInline.appendChild(parentPickWrap);
    parentWrap.appendChild(parentInline);
    parentRow.value.appendChild(parentWrap);

    // ── Objectif (project link) ───────────────────────────────
    var objectifRow = makeRow('objectif', 'Objectif', { icon: 'ti-hierarchy-2' });
    var objectifMount = document.createElement('div');
    objectifMount.className = 'info-objectif-mount objectif-section-body';
    objectifMount.id = 'info-objectif-mount';
    objectifRow.row.classList.add('variant-objectif-section');
    objectifRow.row.hidden = true;
    objectifRow.value.appendChild(objectifMount);

    // Plus de détails order: Objectif → parents → type → étiquettes → historique.
    moreBody.appendChild(objectifRow.row);
    moreBody.appendChild(parentRow.row);
    moreBody.appendChild(taskTypesRow.row);
    moreBody.appendChild(labelsRow.row);
    moreBody.appendChild(historiqueMount);

    var moreRow = makeRow('more-details', 'Plus de d\u00e9tails', {
      icon: 'ti-list-details',
    });
    moreRow.row.classList.add('info-row--more-details');
    var moreWrap = document.createElement('div');
    moreWrap.className = 'info-more-details-wrap';
    var moreToggle = document.createElement('button');
    moreToggle.type = 'button';
    moreToggle.className = 'info-more-details-toggle';
    moreToggle.setAttribute('aria-controls', moreBodyId);
    moreToggle.setAttribute('aria-expanded', 'false');
    var moreChevron = document.createElement('i');
    moreChevron.className = 'ti ti-chevron-down info-more-details-chevron';
    moreChevron.setAttribute('aria-hidden', 'true');
    var moreSummaryEl = document.createElement('span');
    moreSummaryEl.className = 'info-more-details-summary';
    moreToggle.appendChild(moreChevron);
    moreToggle.appendChild(moreSummaryEl);
    moreWrap.appendChild(moreToggle);
    moreWrap.appendChild(moreBody);
    moreRow.value.appendChild(moreWrap);
    body.appendChild(moreRow.row);

    field.appendChild(body);
    el.appendChild(field);

    function setAuthHint(reason) {
      authReason = reason || '';
      var show = !!authReason;
      authBox.hidden = !show;
      if (!show) {
        authHint.textContent = '';
        return;
      }
      if (authReason === 'no-app-key') {
        authHint.textContent =
          'Enregistrement du titre, de la description et des \u00e9tiquettes indisponible (cl\u00e9 d\u2019app manquante).';
        authBtn.hidden = true;
      } else {
        authHint.textContent =
          'Autorisez Trello pour enregistrer le titre, la description et les \u00e9tiquettes sur la carte.';
        authBtn.hidden = !onAuthorize;
      }
    }

    function applyInfoSaveStatus(el, text, kind) {
      var saving = kind === 'saving' || text === 'Enregistrement\u2026';
      var saved = kind === 'ok';
      var errored = kind === 'error';
      el.classList.toggle('is-saving', !!saving);
      el.classList.toggle('is-ok', !!saved && !saving);
      el.classList.toggle('is-error', !!errored && !saving && !saved);
      if (saving) {
        el.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        el.setAttribute('aria-label', 'Enregistrement');
        el.title = 'Enregistrement\u2026';
        return;
      }
      if (saved) {
        el.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i>';
        el.setAttribute('aria-label', 'Enregistr\u00e9');
        el.title = 'Enregistr\u00e9';
        return;
      }
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      el.textContent = text || '';
    }

    function setTitleStatus(text, kind) {
      applyInfoSaveStatus(titleStatus, text, kind);
    }

    function setDescStatus(text, kind) {
      applyInfoSaveStatus(descStatus, text, kind);
    }

    function syncDescInputSize() {
      var empty = !(descInput.value || '').trim();
      syncExpandableSurfaceHeight(descInput, {
        maxHeight: INFO_DESC_MAX_HEIGHT_PX,
        minHeight: empty ? INFO_DESC_EMPTY_MIN_HEIGHT_PX : INFO_DESC_MIN_HEIGHT_PX
      });
    }

    function syncDescRichSize() {
      var empty = !markdownFromRichRoot(descRich);
      descRich.classList.toggle('is-empty', empty);
      syncExpandableSurfaceHeight(descRich, {
        maxHeight: INFO_DESC_MAX_HEIGHT_PX,
        minHeight: empty ? INFO_DESC_EMPTY_MIN_HEIGHT_PX : INFO_DESC_MIN_HEIGHT_PX
      });
    }

    function renderDescRich() {
      descRich.innerHTML = renderMarkdownToHtml(descInput.value);
      descRich.querySelectorAll('input[type="checkbox"]').forEach(function (checkbox) {
        checkbox.disabled = false;
        checkbox.setAttribute('contenteditable', 'false');
      });
      syncDescRichSize();
    }

    function syncDescSourceFromRich() {
      if (descMode !== 'rich') return descInput.value;
      var next = markdownFromRichRoot(descRich);
      if (next !== descInput.value) descInput.value = next;
      return next;
    }

    function closeDescFormatMenu() {
      descFormatMenu.hidden = true;
      descFormatWrap.classList.remove('is-open');
      descFormatBtn.setAttribute('aria-expanded', 'false');
    }

    function openDescFormatMenu() {
      descFormatMenu.hidden = false;
      descFormatWrap.classList.add('is-open');
      descFormatBtn.setAttribute('aria-expanded', 'true');
      syncDescFormatMenuSelection();
    }

    function syncDescFormatMenuSelection() {
      var kind = 'normal';
      if (descMode === 'rich') {
        try {
          var block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
          if (/^h[1-6]$/.test(block)) kind = block;
          else if (document.queryCommandState('insertOrderedList')) kind = 'ol';
          else if (document.queryCommandState('insertUnorderedList')) kind = 'ul';
        } catch (e) {
          kind = 'normal';
        }
      } else {
        var lineStart =
          descInput.value.lastIndexOf('\n', Math.max(0, descInput.selectionStart) - 1) + 1;
        var lineEnd = descInput.value.indexOf('\n', descInput.selectionStart);
        if (lineEnd === -1) lineEnd = descInput.value.length;
        kind = detectMarkdownLineFormat(descInput.value.slice(lineStart, lineEnd));
      }
      if (!DESC_FORMAT_LABELS[kind]) kind = 'normal';
      descFormatBtnLabel.textContent = DESC_FORMAT_LABELS[kind] || 'Texte normal';
      var options = descFormatMenu.querySelectorAll('[data-md-kind]');
      for (var i = 0; i < options.length; i += 1) {
        var opt = options[i];
        var selected = opt.getAttribute('data-md-kind') === kind;
        opt.classList.toggle('is-selected', selected);
        opt.setAttribute('aria-selected', selected ? 'true' : 'false');
      }
    }

    function getDescEditState() {
      return {
        value: descInput.value,
        start: descInput.selectionStart,
        end: descInput.selectionEnd
      };
    }

    function applyDescMarkdownInline(open, close) {
      applyMarkdownEditToTextarea(
        descInput,
        wrapMarkdownInlineSelection(getDescEditState(), open, close)
      );
      syncDescFormatMenuSelection();
      try {
        descInput.focus();
      } catch (e) {
        /* ignore */
      }
    }

    function applyDescMarkdownBlock(kind) {
      applyMarkdownEditToTextarea(
        descInput,
        applyMarkdownBlockFormat(getDescEditState(), kind)
      );
      syncDescFormatMenuSelection();
      try {
        descInput.focus();
      } catch (e) {
        /* ignore */
      }
    }

    function execDescRichCommand(command, value) {
      try {
        descRich.focus();
        document.execCommand(command, false, value == null ? null : value);
      } catch (e) {
        /* unsupported browser command */
      }
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
    }

    function getDescRichSelection() {
      try {
        var sel = window.getSelection && window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        var anchor = sel.anchorNode;
        if (!anchor || !descRich.contains(anchor)) return null;
        return sel;
      } catch (e) {
        return null;
      }
    }

    function decorateDescRichLink(anchor, url) {
      if (!anchor) return;
      try {
        anchor.setAttribute('href', url);
        anchor.className = 'info-md-link';
        if (/^mailto:/i.test(url)) {
          anchor.removeAttribute('target');
          anchor.removeAttribute('rel');
        } else {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      } catch (e) {
        /* ignore */
      }
    }

    function findDescRichLinkFromSelection(sel) {
      if (!sel || !sel.anchorNode) return null;
      var node = sel.anchorNode;
      if (node.nodeType === 3) node = node.parentNode;
      while (node && node !== descRich) {
        if (richNodeName(node) === 'A') return node;
        node = node.parentNode;
      }
      return null;
    }

    /** Apply url to the current rich selection, or insert a linked URL if collapsed. */
    function applyDescRichLink(url) {
      var href = normalizePasteableMarkdownUrl(url) || safeMarkdownHref(url);
      if (!href) return false;
      try {
        descRich.focus();
      } catch (e) {
        /* ignore */
      }
      var sel = getDescRichSelection();
      if (sel && !sel.isCollapsed) {
        try {
          document.execCommand('createLink', false, href);
        } catch (err) {
          return false;
        }
        decorateDescRichLink(findDescRichLinkFromSelection(getDescRichSelection()), href);
      } else {
        var html = renderMarkdownLinkHtml(escapeHtml(href), href);
        if (!html) return false;
        try {
          document.execCommand('insertHTML', false, html);
        } catch (err2) {
          try {
            document.execCommand('insertText', false, href);
          } catch (err3) {
            return false;
          }
        }
      }
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
      return true;
    }

    function applyDescMarkdownLink(url) {
      var href = normalizePasteableMarkdownUrl(url) || safeMarkdownHref(url);
      if (!href) return false;
      var state = getDescEditState();
      var linked = linkMarkdownSelection(state, href);
      if (linked) {
        applyMarkdownEditToTextarea(descInput, linked);
      } else {
        var insertion = '[' + href + '](' + href + ')';
        applyMarkdownEditToTextarea(descInput, {
          value: state.value.slice(0, state.start) + insertion + state.value.slice(state.end),
          start: state.start + 1,
          end: state.start + 1 + href.length
        });
      }
      syncDescFormatMenuSelection();
      try {
        descInput.focus();
      } catch (e) {
        /* ignore */
      }
      return true;
    }

    function promptDescLinkUrl() {
      var existing = '';
      if (descMode === 'rich') {
        var sel = getDescRichSelection();
        var anchor = findDescRichLinkFromSelection(sel);
        if (anchor) existing = richAttr(anchor, 'href') || '';
      }
      var next = window.prompt('URL du lien', existing || 'https://');
      if (next == null) return;
      var href = normalizePasteableMarkdownUrl(next) || safeMarkdownHref(String(next).trim());
      if (!href) return;
      if (descMode === 'rich') applyDescRichLink(href);
      else applyDescMarkdownLink(href);
    }

    function applyDescRichBlock(kind) {
      if (kind === 'ul') {
        execDescRichCommand('insertUnorderedList');
        return;
      }
      if (kind === 'ol') {
        execDescRichCommand('insertOrderedList');
        return;
      }
      if (kind === 'checklist') {
        execDescRichCommand('insertUnorderedList');
        var selection = global.getSelection && global.getSelection();
        var node = selection && selection.anchorNode;
        var li = node && (node.nodeType === 1 ? node : node.parentNode);
        while (li && li !== descRich && richNodeName(li) !== 'LI') li = li.parentNode;
        if (li && li !== descRich && !li.querySelector('input[type="checkbox"]')) {
          var checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.setAttribute('contenteditable', 'false');
          li.insertBefore(checkbox, li.firstChild);
          li.insertBefore(document.createTextNode(' '), checkbox.nextSibling);
          li.classList.add('info-md-li--check');
        }
        syncDescSourceFromRich();
        scheduleDescSave();
        return;
      }
      execDescRichCommand('formatBlock', kind === 'normal' ? 'p' : kind);
    }

    function focusDescEditor(moveToEnd) {
      var target = descMode === 'rich' ? descRich : descInput;
      try {
        target.focus();
        if (moveToEnd && descMode === 'markdown') {
          var len = descInput.value.length;
          descInput.setSelectionRange(len, len);
        }
      } catch (e) {
        /* ignore */
      }
    }

    function setDescMode(mode, options) {
      options = options || {};
      var next = mode === 'markdown' ? 'markdown' : 'rich';
      if (descMode === 'rich' && next === 'markdown') syncDescSourceFromRich();
      descMode = next;
      if (descMode === 'rich') renderDescRich();
      descRich.hidden = descMode !== 'rich';
      descInput.hidden = descMode !== 'markdown';
      descRichModeBtn.classList.toggle('is-active', descMode === 'rich');
      descMarkdownModeBtn.classList.toggle('is-active', descMode === 'markdown');
      descRichModeBtn.setAttribute('aria-checked', descMode === 'rich' ? 'true' : 'false');
      descMarkdownModeBtn.setAttribute(
        'aria-checked',
        descMode === 'markdown' ? 'true' : 'false'
      );
      syncDescFormatMenuSelection();
      if (descMode === 'markdown') syncDescInputSize();
      else syncDescRichSize();
      if (options.focus !== false) focusDescEditor(false);
      onLayoutChange();
    }

    function syncTitleInputSize() {
      titleInput.style.overflowY = 'hidden';
      titleInput.style.height = 'auto';
      titleInput.style.height = titleInput.scrollHeight + 'px';
    }

    function memberDisplayName(member) {
      if (!member || typeof member !== 'object') return '';
      if (typeof member.fullName === 'string' && member.fullName.trim()) {
        return member.fullName.trim();
      }
      if (typeof member.username === 'string' && member.username.trim()) {
        return member.username.trim();
      }
      return '';
    }

    function memberInitials(member) {
      if (!member || typeof member !== 'object') return '?';
      if (typeof member.initials === 'string' && member.initials.trim()) {
        return member.initials.trim().slice(0, 3).toUpperCase();
      }
      var name = memberDisplayName(member);
      if (!name) return '?';
      var parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }

    function memberAvatarUrl(member) {
      if (!member || typeof member !== 'object') return '';
      // Power-Up client: ready-to-use 50px URL (t.member / card members).
      if (typeof member.avatar === 'string' && member.avatar.trim()) {
        return member.avatar.trim();
      }
      // REST API: avatarUrl is a prefix; append size unless already a .png.
      if (typeof member.avatarUrl === 'string' && member.avatarUrl.trim()) {
        var base = member.avatarUrl.trim().replace(/\/$/, '');
        if (/\.png($|\?)/i.test(base)) return base;
        return base + '/50.png';
      }
      if (
        member.id &&
        typeof member.avatarHash === 'string' &&
        member.avatarHash.trim()
      ) {
        return (
          'https://trello-members.s3.amazonaws.com/' +
          encodeURIComponent(String(member.id)) +
          '/' +
          encodeURIComponent(member.avatarHash.trim()) +
          '/50.png'
        );
      }
      return '';
    }

    function enrichMemberAvatar(member) {
      if (!member || typeof member !== 'object') return member;
      if (memberAvatarUrl(member)) return member;
      if (!member.id || !boardMembers.length) return member;
      var id = String(member.id);
      for (var i = 0; i < boardMembers.length; i++) {
        var boardMember = boardMembers[i];
        if (!boardMember || String(boardMember.id) !== id) continue;
        if (!memberAvatarUrl(boardMember)) return member;
        return {
          id: member.id,
          fullName: member.fullName || boardMember.fullName || '',
          username: member.username || boardMember.username || '',
          initials: member.initials || boardMember.initials || '',
          avatar:
            typeof boardMember.avatar === 'string' ? boardMember.avatar : '',
          avatarUrl:
            typeof boardMember.avatarUrl === 'string'
              ? boardMember.avatarUrl
              : '',
          avatarHash:
            typeof boardMember.avatarHash === 'string'
              ? boardMember.avatarHash
              : ''
        };
      }
      return member;
    }

    function appendMemberAvatar(chip, member) {
      var resolved = enrichMemberAvatar(member);
      var avatarUrl = memberAvatarUrl(resolved);
      if (avatarUrl) {
        var img = document.createElement('img');
        img.className = 'info-member-avatar';
        img.src = avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.width = 28;
        img.height = 28;
        img.loading = 'lazy';
        img.addEventListener('error', function () {
          img.remove();
          var fallback = document.createElement('span');
          fallback.className = 'info-member-initials';
          fallback.textContent = memberInitials(resolved);
          chip.insertBefore(fallback, chip.firstChild);
        });
        chip.appendChild(img);
        return;
      }
      var initials = document.createElement('span');
      initials.className = 'info-member-initials';
      initials.textContent = memberInitials(resolved);
      chip.appendChild(initials);
    }

    function creatorDiffersFromAssignees() {
      if (!creatorMember || !creatorMember.id) return false;
      if (
        members.length === 1 &&
        members[0] &&
        members[0].id &&
        String(members[0].id) === String(creatorMember.id)
      ) {
        return false;
      }
      return true;
    }

    function renderCreator() {
      creatorEl.replaceChildren();
      var show = creatorDiffersFromAssignees();
      creatorRow.row.hidden = !show;
      if (!show) return;

      var name = memberDisplayName(creatorMember) || 'Membre';
      var chip = document.createElement('span');
      chip.className = 'info-member';
      chip.title = name;
      chip.setAttribute('aria-label', name);
      appendMemberAvatar(chip, creatorMember);
      var nameEl = document.createElement('span');
      nameEl.className = 'info-member-name';
      nameEl.textContent = name;
      chip.appendChild(nameEl);
      creatorEl.appendChild(chip);
    }

    function setMembersStatus(text, kind) {
      applyInfoSaveStatus(membersStatus, text, kind);
    }

    function displayAssignees() {
      return mergeAssigneesForDisplay(members, customAssignees, boardMembers);
    }

    function selectedMemberIds() {
      var ids = Object.create(null);
      var all = displayAssignees();
      for (var i = 0; i < all.length; i++) {
        if (all[i] && all[i].id) ids[String(all[i].id)] = true;
      }
      return ids;
    }

    function availableBoardMembers() {
      var selected = selectedMemberIds();
      // Also hide board members already represented only as a Trello assignee id.
      for (var i = 0; i < members.length; i++) {
        if (members[i] && members[i].id) selected[String(members[i].id)] = true;
      }
      var out = [];
      for (var b = 0; b < boardMembers.length; b++) {
        var member = boardMembers[b];
        if (!member || !member.id) continue;
        if (selected[String(member.id)]) continue;
        out.push(member);
      }
      return out;
    }

    function availableCatalogAssignees() {
      var selected = selectedMemberIds();
      var out = [];
      var catalog = getCustomAssigneeCatalog();
      for (var i = 0; i < catalog.length; i++) {
        var entry = catalog[i];
        if (!entry || !entry.id) continue;
        if (selected[String(entry.id)]) continue;
        out.push(entry);
      }
      return out;
    }

    function persistCustomAssigneeCatalog(nextList) {
      var previous = getCustomAssigneeCatalog();
      var list = normalizeCustomAssignees(nextList);
      setCustomAssigneeCatalog(list);
      if (!onCustomAssigneeCatalogChange) {
        return Promise.resolve({
          ok: true,
          changed: false,
          customAssigneeCatalog: list
        });
      }
      return Promise.resolve(onCustomAssigneeCatalogChange(list))
        .then(function (result) {
          if (result && result.ok === false) {
            setCustomAssigneeCatalog(previous);
            return result;
          }
          if (result && Array.isArray(result.customAssigneeCatalog)) {
            setCustomAssigneeCatalog(result.customAssigneeCatalog);
          }
          return (
            result || {
              ok: true,
              changed: true,
              customAssigneeCatalog: getCustomAssigneeCatalog()
            }
          );
        })
        .catch(function (err) {
          console.error('Info custom assignee catalog save failed', err);
          setCustomAssigneeCatalog(previous);
          return { ok: false };
        });
    }

    function setMembersPickerOpen(open) {
      membersPickerOpen = !!open;
      membersPicker.hidden = !membersPickerOpen;
      membersAddBtn.setAttribute(
        'aria-expanded',
        membersPickerOpen ? 'true' : 'false'
      );
      membersAddWrap.classList.toggle('is-open', membersPickerOpen);
      if (membersPickerOpen) renderMembersPicker();
      onLayoutChange();
    }

    function persistCustomAssignees(nextList) {
      var list = normalizeCustomAssignees(nextList);
      customAssignees = list;
      if (!onCustomAssigneesChange) {
        renderMembers();
        onLayoutChange();
        return Promise.resolve({ ok: true, changed: false, customAssignees: list });
      }
      membersBusy = true;
      setMembersStatus('', 'saving');
      renderMembers();
      return Promise.resolve(onCustomAssigneesChange(list))
        .then(function (result) {
          membersBusy = false;
          if (result && result.ok === false) {
            setMembersStatus('\u00c9chec de l\u2019enregistrement', 'error');
            renderMembers();
            onLayoutChange();
            return result;
          }
          if (result && Array.isArray(result.customAssignees)) {
            customAssignees = normalizeCustomAssignees(result.customAssignees);
          }
          setMembersStatus('', 'ok');
          setMembersPickerOpen(false);
          renderMembers();
          setTimeout(function () {
            if (membersStatus.classList.contains('is-ok')) {
              setMembersStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result || { ok: true, changed: true, customAssignees: list };
        })
        .catch(function (err) {
          membersBusy = false;
          console.error('Info custom assignee save failed', err);
          setMembersStatus('\u00c9chec de l\u2019enregistrement', 'error');
          renderMembers();
          onLayoutChange();
        });
    }

    function setPlacesStatus(text, kind) {
      applyInfoSaveStatus(placesStatus, text, kind);
    }

    var pgIgnoreUntil = 0;
    var pgExpanded = false;
    var pgPickPoint = null; // stage point where the "add a stop" popover opens

    /**
     * Picker target: 'at' | 'from' (empty state, inline) or 'ins:N' (insert as
     * stop N of the route: opens as a popover inside the node graph).
     */
    function setPlacesPickerOpen(target) {
      var next = String(target || '');
      if (next && !/^(at|from|ins:\d+|rep:\d+)$/.test(next)) next = '';
      // The click that follows releasing a pin must not dismiss what it opened.
      if (!next && Date.now() < pgIgnoreUntil) return;
      placesPickerSlot = next;
      if (next) placeEditKey = '';
      renderPlaces();
      onLayoutChange();
    }

    function persistPlaceCatalog(nextList) {
      var previous = getPlaceCatalog();
      var list = normalizePlaceCatalog(nextList);
      setPlaceCatalog(list);
      if (!onPlaceCatalogChange) {
        return Promise.resolve({
          ok: true,
          changed: false,
          placeCatalog: list
        });
      }
      return Promise.resolve(onPlaceCatalogChange(list))
        .then(function (result) {
          if (result && result.ok === false) {
            setPlaceCatalog(previous);
            return result;
          }
          if (result && Array.isArray(result.placeCatalog)) {
            setPlaceCatalog(result.placeCatalog);
          }
          return (
            result || {
              ok: true,
              changed: true,
              placeCatalog: getPlaceCatalog()
            }
          );
        })
        .catch(function (err) {
          console.error('Info place catalog save failed', err);
          setPlaceCatalog(previous);
          return { ok: false };
        });
    }

    function persistPlaces(nextPlaces) {
      var map = normalizePlaces(nextPlaces);
      cardPlaces = map;
      if (!onPlacesChange) {
        renderPlaces();
        onLayoutChange();
        return Promise.resolve({ ok: true, changed: false, places: map });
      }
      placesBusy = true;
      setPlacesStatus('', 'saving');
      renderPlaces();
      return Promise.resolve(onPlacesChange(map))
        .then(function (result) {
          placesBusy = false;
          if (result && result.ok === false) {
            setPlacesStatus('Échec de l’enregistrement', 'error');
            renderPlaces();
            onLayoutChange();
            return result;
          }
          if (result && result.places) {
            cardPlaces = normalizePlaces(result.places);
          }
          setPlacesStatus('', 'ok');
          placesPickerSlot = '';
          renderPlaces();
          setTimeout(function () {
            if (placesStatus.classList.contains('is-ok')) {
              setPlacesStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result || { ok: true, changed: true, places: map };
        })
        .catch(function (err) {
          placesBusy = false;
          console.error('Info places save failed', err);
          setPlacesStatus('Échec de l’enregistrement', 'error');
          renderPlaces();
          onLayoutChange();
        });
    }

    // ── directory lookups (address / GPS live in the private directory) ──
    function placeDirectoryList() {
      if (!getPlaceDirectory) return [];
      try {
        var list = getPlaceDirectory();
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    }

    function foldPlaceText(s) {
      return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLocaleLowerCase('fr-FR')
        .trim();
    }

    function findDirectoryPlace(ref) {
      if (!ref) return null;
      var list = placeDirectoryList();
      var i;
      for (i = 0; i < list.length; i++) {
        if (ref.id && list[i].id === ref.id) return list[i];
      }
      var key = foldPlaceText(ref.name);
      for (i = 0; i < list.length; i++) {
        if (key && foldPlaceText(list[i].name) === key) return list[i];
      }
      return null;
    }

    /** Name as it is now (a rename in the directory wins over the card copy). */
    function placeDisplayName(ref) {
      var dir = findDirectoryPlace(ref);
      if (dir && dir.name) return dir.name;
      var cat = ref && ref.id ? findPlaceCatalogById(ref.id) : null;
      return (cat && cat.name) || (ref && ref.name) || '';
    }

    function placeHasGeo(dir) {
      return !!(
        dir &&
        ((typeof dir.lat === 'number' && typeof dir.lng === 'number') ||
          dir.address)
      );
    }

    function placeMapsHref(ref, dir) {
      if (global.Places && typeof global.Places.mapsUrl === 'function') {
        return global.Places.mapsUrl(
          dir || { name: placeDisplayName(ref) }
        );
      }
      return '';
    }

    function placeTripStops(map) {
      var out = [];
      if (map.from) out.push(map.from);
      (map.via || []).forEach(function (r) {
        out.push(r);
      });
      if (map.to) out.push(map.to);
      return out;
    }

    // ── edits on the card's route (a route is an ordered list of stops) ──
    function placeSeq(map) {
      var n = normalizePlaces(map);
      var out = [];
      if (n.from) out.push(n.from);
      (n.via || []).forEach(function (r) {
        out.push(r);
      });
      if (n.to) out.push(n.to);
      if (n.at) out.push(n.at);
      return out;
    }

    /** One stop is a place ("at"); two or more are a trip (from, via..., to). */
    function placeMapFromSeq(refs) {
      var out = {};
      if (!refs.length) return out;
      if (refs.length === 1) {
        out.at = refs[0];
        return out;
      }
      out.from = refs[0];
      out.to = refs[refs.length - 1];
      if (refs.length > 2) out.via = refs.slice(1, -1);
      return out;
    }

    function placesMutate(mutator) {
      if (placesBusy || !onPlacesChange) return Promise.resolve(null);
      var next = normalizePlaces(cardPlaces);
      if (mutator(next) === false) return Promise.resolve(null);
      return persistPlaces(next);
    }

    function placesMutateSeq(mutator) {
      if (placesBusy || !onPlacesChange) return Promise.resolve(null);
      var refs = placeSeq(cardPlaces).map(function (r) {
        return Object.assign({}, r);
      });
      if (mutator(refs) === false) return Promise.resolve(null);
      return persistPlaces(placeMapFromSeq(refs));
    }

    function removePlaceStop(i) {
      placeEditKey = '';
      placesMutateSeq(function (refs) {
        if (i < 0 || i >= refs.length) return false;
        refs.splice(i, 1);
      });
    }

    function movePlaceStop(i, delta) {
      placeEditKey = '';
      placesMutateSeq(function (refs) {
        var j = i + delta;
        if (i < 0 || j < 0 || j >= refs.length) return false;
        var tmp = refs[i];
        refs[i] = refs[j];
        refs[j] = tmp;
      });
    }

    function setPlaceStopPos(i, x, y) {
      placesMutateSeq(function (refs) {
        var ref = refs[i];
        if (!ref || (ref.x === x && ref.y === y)) return false;
        ref.x = x;
        ref.y = y;
      });
    }

    /** Forget every hand-placed position: back to the automatic layout. */
    function clearPlacePositions() {
      placesMutateSeq(function (refs) {
        var any = false;
        refs.forEach(function (r) {
          if (r.x != null || r.y != null) any = true;
          delete r.x;
          delete r.y;
        });
        return any;
      });
    }

    /** Drag and drop: take the stop at `from` and drop it at position `to`. */
    function reorderPlaceStop(from, to) {
      placeEditKey = '';
      placesMutateSeq(function (refs) {
        if (from === to || from < 0 || to < 0 || from >= refs.length || to >= refs.length) {
          return false;
        }
        refs.splice(to, 0, refs.splice(from, 1)[0]);
      });
    }

    function setPlaceStopAction(i, text) {
      var value = String(text || '')
        .trim()
        .slice(0, MAX_PLACE_DO_LEN);
      placesMutateSeq(function (refs) {
        var ref = refs[i];
        if (!ref || (ref.do || '') === value) return false;
        if (value) ref.do = value;
        else delete ref.do;
      });
    }

    function assignPlace(target, entry) {
      if (placesBusy || !onPlacesChange || !entry || (!entry.id && !entry.name)) {
        return;
      }
      var before = getPlaceCatalog();
      var draft = upsertPlaceCatalog(entry) || normalizePlaceRef(entry);
      if (!draft) return;
      var after = getPlaceCatalog();
      var catalogPromise =
        JSON.stringify(before) !== JSON.stringify(after)
          ? persistPlaceCatalog(after)
          : Promise.resolve(null);
      catalogPromise.then(function () {
        var ref = { id: draft.id, name: draft.name };
        var swap = /^rep:(\d+)$/.exec(target);
        if (swap) {
          placesMutateSeq(function (refs) {
            var idx = Number(swap[1]);
            var prev = refs[idx];
            if (!prev || prev.id === ref.id) return false;
            // Keep what is done there and where the node was placed.
            if (prev.do) ref.do = prev.do;
            if (prev.x != null) ref.x = prev.x;
            if (prev.y != null) ref.y = prev.y;
            refs[idx] = ref;
          });
          return;
        }
        var ins = /^ins:(\d+)$/.exec(target);
        if (ins) {
          placesMutateSeq(function (refs) {
            if (refs.length >= 2 + MAX_PLACE_VIA) {
              setPlacesStatus(
                'Maximum ' + (2 + MAX_PLACE_VIA) + ' lieux',
                'error'
              );
              return false;
            }
            refs.splice(Math.min(Number(ins[1]), refs.length), 0, ref);
          });
          return;
        }
        placesMutate(function (next) {
          var prev = next[target];
          if (prev && prev.id === ref.id && prev.do) ref.do = prev.do;
          // Empty state: "Un lieu" (at) or the first stop of a trip (from).
          delete next.at;
          delete next.from;
          delete next.to;
          delete next.via;
          next[target] = ref;
        });
      });
    }

    function pickerCreateOrPick(target, name) {
      var found = findPlaceCatalogByName(name);
      assignPlace(target, found || { name: name });
    }

    // ── place picker (search or create, inline under its row) ───────────
    function buildPlacesPicker(target) {
      var panel = document.createElement('div');
      panel.className = 'info-places-picker';
      panel.setAttribute('role', 'listbox');
      panel.setAttribute('aria-label', 'Choisir un lieu');
      panel.addEventListener('click', function (event) {
        event.stopPropagation();
      });

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'info-places-create-input info-places-search';
      input.placeholder = 'Chercher ou créer un lieu…';
      input.setAttribute('aria-label', 'Chercher ou créer un lieu');
      input.maxLength = MAX_PLACE_NAME_LEN;
      input.autocomplete = 'off';
      panel.appendChild(input);

      var list = document.createElement('div');
      list.className = 'info-places-picker-list';
      panel.appendChild(list);

      var options = [];
      var active = 0;

      function currentIds() {
        var ids = {};
        placeTripStops(cardPlaces).forEach(function (r) {
          ids[r.id] = true;
        });
        if (cardPlaces.at) ids[cardPlaces.at.id] = true;
        return ids;
      }

      function paintActive() {
        options.forEach(function (o, i) {
          o.el.classList.toggle('is-active', i === active);
        });
        if (options[active] && options[active].el.scrollIntoView) {
          options[active].el.scrollIntoView({ block: 'nearest' });
        }
      }

      function refill() {
        list.replaceChildren();
        options = [];
        var q = foldPlaceText(input.value);
        var used = currentIds();
        var exact = false;
        getPlaceCatalog().forEach(function (entry) {
          var dir = findDirectoryPlace(entry);
          var name = (dir && dir.name) || entry.name;
          var hay = foldPlaceText(
            name +
              ' ' +
              (dir ? (dir.address || '') + ' ' + (dir.kind || '') + ' ' + (dir.aliases || []).join(' ') : '')
          );
          if (q && hay.indexOf(q) < 0) return;
          if (q && foldPlaceText(name) === q) exact = true;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-places-picker-option';
          btn.setAttribute('role', 'option');
          btn.disabled = placesBusy;
          var icon = document.createElement('i');
          icon.className = 'ti ti-map-pin';
          icon.setAttribute('aria-hidden', 'true');
          var text = document.createElement('span');
          text.className = 'info-places-picker-option-text';
          text.textContent = name;
          btn.appendChild(icon);
          btn.appendChild(text);
          var sub = dir && (dir.address || dir.kind);
          if (sub) {
            var subEl = document.createElement('span');
            subEl.className = 'info-places-picker-option-sub';
            subEl.textContent = sub;
            btn.appendChild(subEl);
          }
          if (placeHasGeo(dir) && dir.lat != null) {
            var gpsEl = document.createElement('i');
            gpsEl.className = 'ti ti-current-location info-places-picker-gps';
            gpsEl.title = 'Position GPS enregistrée';
            btn.appendChild(gpsEl);
          }
          if (used[entry.id]) btn.classList.add('is-selected');
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            assignPlace(target, entry);
          });
          list.appendChild(btn);
          options.push({ el: btn, run: function () { assignPlace(target, entry); } });
        });
        var typed = input.value.trim();
        if (typed && !exact) {
          var create = document.createElement('button');
          create.type = 'button';
          create.className = 'info-places-picker-option info-places-picker-create';
          create.disabled = placesBusy;
          create.innerHTML =
            '<i class="ti ti-plus" aria-hidden="true"></i>';
          var label = document.createElement('span');
          label.className = 'info-places-picker-option-text';
          label.textContent = 'Créer « ' + typed + ' »';
          create.appendChild(label);
          create.addEventListener('click', function (event) {
            event.preventDefault();
            pickerCreateOrPick(target, typed);
          });
          list.appendChild(create);
          options.push({ el: create, run: function () { pickerCreateOrPick(target, typed); } });
        }
        if (!options.length) {
          var empty = document.createElement('p');
          empty.className = 'info-places-picker-empty';
          empty.textContent =
            'Aucun lieu enregistré. Tape un nom pour en créer un.';
          list.appendChild(empty);
        }
        active = Math.min(active, Math.max(0, options.length - 1));
        paintActive();
      }

      input.addEventListener('input', function () {
        active = 0;
        refill();
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!options.length) return;
          active =
            (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
            options.length;
          paintActive();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (options[active]) options[active].run();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setPlacesPickerOpen('');
        }
      });
      refill();
      setTimeout(function () {
        try {
          input.focus();
        } catch (e) {}
      }, 0);
      return panel;
    }

    // ── place editor (name, type, address, GPS: private directory) ──────
    function buildPlaceEditor(ref) {
      var dir = findDirectoryPlace(ref) || {};
      var panel = document.createElement('div');
      panel.className = 'info-place-editor';
      panel.addEventListener('click', function (event) {
        event.stopPropagation();
      });

      function field(label, value, attrs) {
        var wrap = document.createElement('label');
        wrap.className = 'info-place-editor-field';
        var cap = document.createElement('span');
        cap.className = 'info-place-editor-label';
        cap.textContent = label;
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'info-places-create-input';
        inp.value = value || '';
        inp.autocomplete = 'off';
        if (attrs && attrs.placeholder) inp.placeholder = attrs.placeholder;
        if (attrs && attrs.maxLength) inp.maxLength = attrs.maxLength;
        wrap.appendChild(cap);
        wrap.appendChild(inp);
        return { wrap: wrap, input: inp };
      }

      function iconButton(icon, title, label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'info-place-editor-btn';
        b.title = title;
        b.innerHTML = '<i class="ti ' + icon + '" aria-hidden="true"></i>';
        if (label) {
          var t = document.createElement('span');
          t.textContent = label;
          b.appendChild(t);
        }
        return b;
      }

      var startCoords =
        typeof dir.lat === 'number' && typeof dir.lng === 'number'
          ? dir.lat + ', ' + dir.lng
          : '';

      var nameF = field('Nom', placeDisplayName(ref), {
        maxLength: MAX_PLACE_NAME_LEN
      });
      var kindF = field('Type', dir.kind || '', {
        placeholder: 'maison, travail, chalet…',
        maxLength: 40
      });
      var addrF = field('Adresse', dir.address || '', {
        placeholder: '12 chemin du Lac, Val-d’Or',
        maxLength: 200
      });
      var gpsF = field('Coordonnées GPS', startCoords, {
        placeholder: '48.1189, -77.7828 ou lien Google Maps'
      });
      var notesF = field('Notes', dir.notes || '', {
        placeholder: 'Code de porte, clé, accès…',
        maxLength: 400
      });

      var geoStatus = document.createElement('div');
      geoStatus.className = 'info-place-editor-hint';
      geoStatus.setAttribute('aria-live', 'polite');

      function readGps() {
        var raw = gpsF.input.value.trim();
        if (!raw) return { empty: true };
        var parsed =
          global.Places && global.Places.parseCoordinates
            ? global.Places.parseCoordinates(raw)
            : null;
        return parsed ? { gps: parsed } : { invalid: true };
      }

      function paintGps() {
        var g = readGps();
        geoStatus.classList.remove('is-error', 'is-ok');
        if (g.gps) {
          geoStatus.textContent =
            'Position : ' + g.gps.lat.toFixed(6) + ', ' + g.gps.lng.toFixed(6);
          geoStatus.classList.add('is-ok');
        } else if (g.invalid) {
          geoStatus.textContent =
            'Format non reconnu (ex. : 48.1189, -77.7828)';
          geoStatus.classList.add('is-error');
        } else {
          geoStatus.textContent =
            'L’adresse et le GPS restent privés : ils ne sont pas partagés avec le tableau.';
        }
      }
      gpsF.input.addEventListener('input', paintGps);
      paintGps();

      // GPS helpers
      var gpsTools = document.createElement('div');
      gpsTools.className = 'info-place-editor-tools';
      var locateBtn = iconButton('ti-map-search', 'Trouver les coordonnées de cette adresse (OpenStreetMap)', 'Localiser l’adresse');
      var hereBtn = iconButton('ti-current-location', 'Utiliser ma position actuelle', 'Ma position');
      var openBtn = iconButton('ti-external-link', 'Ouvrir dans Google Maps', 'Voir sur la carte');
      gpsTools.appendChild(locateBtn);
      gpsTools.appendChild(hereBtn);
      gpsTools.appendChild(openBtn);

      function setGpsInput(lat, lng) {
        gpsF.input.value = lat.toFixed(6) + ', ' + lng.toFixed(6);
        paintGps();
      }

      locateBtn.addEventListener('click', function () {
        var q = addrF.input.value.trim() || nameF.input.value.trim();
        if (!q) {
          addrF.input.focus();
          return;
        }
        locateBtn.disabled = true;
        geoStatus.classList.remove('is-error', 'is-ok');
        geoStatus.textContent = 'Recherche…';
        fetch(
          'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
            encodeURIComponent(q),
          { headers: { Accept: 'application/json' } }
        )
          .then(function (res) {
            if (!res.ok) throw new Error('http ' + res.status);
            return res.json();
          })
          .then(function (rows) {
            var hit = Array.isArray(rows) ? rows[0] : null;
            var lat = hit ? parseFloat(hit.lat) : NaN;
            var lng = hit ? parseFloat(hit.lon) : NaN;
            if (!isFinite(lat) || !isFinite(lng)) {
              geoStatus.textContent = 'Adresse introuvable';
              geoStatus.classList.add('is-error');
              return;
            }
            setGpsInput(lat, lng);
          })
          .catch(function () {
            geoStatus.textContent =
              'Recherche indisponible : colle des coordonnées ou un lien Google Maps.';
            geoStatus.classList.add('is-error');
          })
          .then(function () {
            locateBtn.disabled = false;
          });
      });

      hereBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          geoStatus.textContent = 'Géolocalisation indisponible ici';
          geoStatus.classList.add('is-error');
          return;
        }
        hereBtn.disabled = true;
        geoStatus.classList.remove('is-error', 'is-ok');
        geoStatus.textContent = 'Localisation…';
        try {
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              hereBtn.disabled = false;
              setGpsInput(pos.coords.latitude, pos.coords.longitude);
            },
            function () {
              hereBtn.disabled = false;
              geoStatus.textContent =
                'Position refusée ou indisponible : colle des coordonnées ou un lien Google Maps.';
              geoStatus.classList.add('is-error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        } catch (e) {
          hereBtn.disabled = false;
          geoStatus.textContent = 'Géolocalisation indisponible ici';
          geoStatus.classList.add('is-error');
        }
      });

      openBtn.addEventListener('click', function () {
        var g = readGps();
        var url = '';
        if (global.Places && global.Places.mapsUrl) {
          url = global.Places.mapsUrl({
            name: nameF.input.value.trim(),
            address: addrF.input.value.trim(),
            lat: g.gps ? g.gps.lat : undefined,
            lng: g.gps ? g.gps.lng : undefined
          });
        }
        if (url) window.open(url, '_blank', 'noopener');
      });

      var actions = document.createElement('div');
      actions.className = 'info-place-editor-actions';
      var saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'info-places-create-btn';
      saveBtn.textContent = 'Enregistrer';
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'info-place-editor-cancel';
      cancelBtn.textContent = 'Annuler';
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);

      cancelBtn.addEventListener('click', function () {
        placeEditKey = '';
        renderPlaces();
        onLayoutChange();
      });

      function save() {
        var name = nameF.input.value.trim();
        if (!name) {
          nameF.input.focus();
          return;
        }
        var g = readGps();
        if (g.invalid) {
          gpsF.input.focus();
          return;
        }
        saveBtn.disabled = true;
        var patch = {
          id: ref.id,
          name: name,
          kind: kindF.input.value.trim(),
          address: addrF.input.value.trim(),
          notes: notesF.input.value.trim(),
          lat: g.gps ? g.gps.lat : null,
          lng: g.gps ? g.gps.lng : null
        };
        Promise.resolve(onPlaceDirectorySave(patch)).then(function (result) {
          saveBtn.disabled = false;
          if (!result || result.ok === false || !result.place) {
            geoStatus.textContent = 'Échec de l’enregistrement';
            geoStatus.classList.remove('is-ok');
            geoStatus.classList.add('is-error');
            return;
          }
          var saved = result.place;
          placeEditKey = '';
          // Refresh the card's copies of this place (name) and the board catalog.
          var renamed = false;
          var next = normalizePlaces(cardPlaces);
          function touch(r) {
            if (r && r.id === ref.id && r.name !== saved.name) {
              r.name = saved.name;
              renamed = true;
            }
          }
          touch(next.from);
          touch(next.to);
          touch(next.at);
          (next.via || []).forEach(touch);
          if (renamed) persistPlaces(next);
          else renderPlaces();
          onLayoutChange();
        });
      }
      saveBtn.addEventListener('click', save);
      panel.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault();
          save();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelBtn.click();
        }
      });

      panel.appendChild(nameF.wrap);
      panel.appendChild(kindF.wrap);
      panel.appendChild(addrF.wrap);
      panel.appendChild(gpsF.wrap);
      panel.appendChild(gpsTools);
      panel.appendChild(geoStatus);
      panel.appendChild(notesF.wrap);
      panel.appendChild(actions);
      setTimeout(function () {
        try {
          nameF.input.focus();
          nameF.input.select();
        } catch (e) {}
      }, 0);
      return panel;
    }

    // ── Place graph (node view of the route, same look as the Assignés graph) ──
    var PG_NODE_W = 220;
    var PG_PAD = 20;
    var PG_HGAP = 56;
    var PG_TOP = 44; // room above the first stop for the toolbar and its add pin
    var PG_VGAP = 64;
    var PG_STOP_ICONS = {
      from: 'ti-circle-dot',
      via: 'ti-map-pin',
      to: 'ti-flag-3',
      at: 'ti-map-pin'
    };
    var pgUid = ++S.teamGraphInstances;
    var pgScale = 1;
    var pgFit = 1;
    var pgZoomMul = 1;
    var pgPan = { x: 0, y: 0 };
    var pgState = null; // { nodes: { i: box }, width, height }
    var pgDrag = null;
    var pgMoving = null; // node being moved by hand
    var pgLive = {}; // idx -> { x, y } while a node is being moved
    var PG_GRID = 18; // same as the dot spacing of the canvas

    /** Stops in route order, tagged with their role (from / via / to / at). */
    function pgStops(map) {
      var n = normalizePlaces(map);
      var out = [];
      if (n.from) out.push({ key: 'from', ref: n.from });
      (n.via || []).forEach(function (ref) {
        out.push({ key: 'via', ref: ref });
      });
      if (n.to) out.push({ key: 'to', ref: n.to });
      if (n.at) out.push({ key: 'at', ref: n.at });
      return out;
    }

    function pgApplyTransform() {
      var moved = pgPan.x || pgPan.y;
      pgStage.style.transform =
        pgScale === 1 && !moved
          ? ''
          : 'translate(' + pgPan.x + 'px,' + pgPan.y + 'px) scale(' + pgScale + ')';
      var step = PG_GRID * pgScale;
      while (step < 9) step *= 2;
      pgHost.style.backgroundSize = step + 'px ' + step + 'px';
      pgHost.style.backgroundPosition =
        Math.round(pgStage.offsetLeft + pgPan.x - step / 2) + 'px ' + Math.round(pgPan.y - step / 2) + 'px';
    }

    function pgZoomBy(factor, px, py) {
      var nextMul = Math.max(0.2, Math.min(1, pgZoomMul * factor));
      var nextScale = Math.max(0.25, pgFit * nextMul);
      if (Math.abs(nextScale - pgScale) < 0.001) return;
      var ox = pgStage.offsetLeft;
      var sx = (px - ox - pgPan.x) / pgScale;
      var sy = (py - pgPan.y) / pgScale;
      pgZoomMul = nextMul;
      pgScale = nextScale;
      pgPan.x = Math.round(px - ox - sx * pgScale);
      pgPan.y = Math.round(py - sy * pgScale);
      if (pgZoomMul === 1) {
        pgPan.x = 0;
        pgPan.y = 0;
      }
      pgApplyTransform();
    }

    pgFrame.addEventListener(
      'wheel',
      function (event) {
        if (event.target.closest('.tg-editor')) return;
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        var rect = pgFrame.getBoundingClientRect();
        pgZoomBy(
          Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left,
          event.clientY - rect.top
        );
      },
      { passive: false }
    );
    pgZoomOutBtn.addEventListener('click', function (event) {
      event.preventDefault();
      pgZoomBy(0.8, pgHost.clientWidth / 2, pgFrame.clientHeight / 2);
    });
    pgZoomInBtn.addEventListener('click', function (event) {
      event.preventDefault();
      pgZoomBy(1.25, pgHost.clientWidth / 2, pgFrame.clientHeight / 2);
    });

    // Drag the background to move around; double-click recentres.
    pgFrame.addEventListener('mousedown', function (event) {
      if (event.button === 1 && !event.target.closest('.tg-editor')) event.preventDefault();
    });
    pgFrame.addEventListener('auxclick', function (event) {
      if (event.button === 1) event.preventDefault();
    });
    pgFrame.addEventListener('pointerdown', function (event) {
      var middle = event.button === 1;
      if (event.button != null && event.button !== 0 && !middle) return;
      if (middle) {
        if (event.target.closest('.tg-editor')) return;
        event.preventDefault();
      } else if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-collapse, .tg-wire-hit')) {
        return;
      }
      var startX = event.clientX;
      var startY = event.clientY;
      var baseX = pgPan.x;
      var baseY = pgPan.y;
      var moved = false;
      try {
        pgFrame.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
      var move = function (e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        pgHost.classList.add('is-panning');
        var hostW = pgHost.clientWidth || 320;
        var frameH = pgFrame.clientHeight || 200;
        var sw = (pgState ? pgState.width : 0) * pgScale;
        var sh = (pgState ? pgState.height : 0) * pgScale;
        var margin = 48;
        pgPan.x = Math.round(Math.max(margin - sw, Math.min(hostW - margin, baseX + dx)));
        pgPan.y = Math.round(Math.max(margin - sh, Math.min(frameH - margin, baseY + dy)));
        pgApplyTransform();
      };
      var end = function () {
        pgFrame.removeEventListener('pointermove', move);
        pgFrame.removeEventListener('pointerup', end);
        pgFrame.removeEventListener('pointercancel', end);
        pgHost.classList.remove('is-panning');
      };
      pgFrame.addEventListener('pointermove', move);
      pgFrame.addEventListener('pointerup', end);
      pgFrame.addEventListener('pointercancel', end);
    });
    pgFrame.addEventListener('dblclick', function (event) {
      if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-collapse, .tg-zoom-btn, button, input')) return;
      if (!onPlacesChange || placesBusy) return;
      pgOpenInsert(pgState ? pgState.nodes.length : 0, pgStagePoint(event));
    });
    pgAutoBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      clearPlacePositions();
    });

    function pgSetExpanded(next) {
      next = !!next;
      if (pgExpanded === next) return;
      pgExpanded = next;
      if (!next) {
        pgPan.x = 0;
        pgPan.y = 0;
        pgZoomMul = 1;
        placeEditKey = '';
        if (/^(ins|rep):/.test(placesPickerSlot)) placesPickerSlot = '';
      }
      renderPlaces();
      onLayoutChange();
    }
    pgCollapseBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      pgSetExpanded(false);
    });

    function pgSvg(tag, attrs) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs || {}).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
      return node;
    }

    function pgStagePoint(event) {
      var rect = pgStage.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / pgScale,
        y: (event.clientY - rect.top) / pgScale
      };
    }

    /**
     * Snake layout: stops fill rows left to right, then the next row runs back
     * right to left, so consecutive stops always touch (short, clean wires).
     */
    function pgLayout(count, heights, hostW) {
      // Allow the stage to shrink to 80% so two columns fit a narrow popup.
      var cols = Math.floor((Math.max(hostW, 0) / 0.8 - PG_PAD * 2 + PG_HGAP) / (PG_NODE_W + PG_HGAP));
      if (!isFinite(cols) || cols < 1) cols = hostW > 0 ? 1 : 2;
      cols = Math.max(1, Math.min(3, cols, count));
      var nodes = [];
      var y = 0;
      for (var start = 0, row = 0; start < count; start += cols, row++) {
        var rowIdx = [];
        var rowH = 0;
        for (var k = start; k < Math.min(count, start + cols); k++) {
          rowIdx.push(k);
          var h = heights[k] > 0 ? heights[k] : 96;
          if (h > rowH) rowH = h;
        }
        rowIdx.forEach(function (idx, j) {
          var col = row % 2 === 0 ? j : cols - 1 - j;
          nodes[idx] = {
            x: col * (PG_NODE_W + PG_HGAP),
            y: y,
            w: PG_NODE_W,
            h: heights[idx] > 0 ? heights[idx] : 96,
            row: row,
            col: col
          };
        });
        y += rowH + PG_VGAP;
      }
      return {
        nodes: nodes,
        width: cols * PG_NODE_W + (cols - 1) * PG_HGAP,
        height: Math.max(0, y - PG_VGAP)
      };
    }

    function pgOpenInsert(index, pt) {
      if (!onPlacesChange || placesBusy) return;
      pgIgnoreUntil = Date.now() + 400;
      placesPickerSlot = 'ins:' + index;
      placeEditKey = '';
      pgPickPoint = pt || null;
      renderPlaces();
      onLayoutChange();
    }

    function pgStartPinDrag(event, edge, insertIndex, side, box) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      var dir = side === 'top' ? [0, -1] : [0, 1];
      var start =
        side === 'top'
          ? { x: box.x + box.w / 2, y: box.y }
          : { x: box.x + box.w / 2, y: box.y + box.h };
      var temp = pgSvg('path', { class: 'tg-wire-temp tg-kind-flow' });
      pgWires.appendChild(temp);
      pgDrag = { moved: false, sx: event.clientX, sy: event.clientY, last: start };
      pgHost.classList.add('is-dragging');
      try {
        edge.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      var move = function (e) {
        if (!pgDrag) return;
        if (Math.abs(e.clientX - pgDrag.sx) + Math.abs(e.clientY - pgDrag.sy) > 5) {
          pgDrag.moved = true;
        }
        var p = pgStagePoint(e);
        pgDrag.last = p;
        var d = Math.max(24, Math.abs(p.y - start.y) / 2);
        temp.setAttribute(
          'd',
          'M' + start.x + ' ' + start.y +
            ' C' + start.x + ' ' + (start.y + dir[1] * d) +
            ' ' + p.x + ' ' + (p.y - dir[1] * d) +
            ' ' + p.x + ' ' + p.y
        );
      };
      var cleanup = function () {
        edge.removeEventListener('pointermove', move);
        edge.removeEventListener('pointerup', done);
        edge.removeEventListener('pointercancel', cancel);
        pgHost.classList.remove('is-dragging');
        temp.remove();
      };
      var done = function () {
        var drag = pgDrag;
        pgDrag = null;
        cleanup();
        if (!drag) return;
        var pt = drag.moved
          ? drag.last
          : { x: start.x, y: start.y + dir[1] * 40 };
        pgOpenInsert(insertIndex, pt);
      };
      var cancel = function () {
        pgDrag = null;
        cleanup();
      };
      edge.addEventListener('pointermove', move);
      edge.addEventListener('pointerup', done);
      edge.addEventListener('pointercancel', cancel);
    }

    var pgNoClickUntil = 0;

    function pgSnap(v) {
      return Math.round(v / PG_GRID) * PG_GRID;
    }

    /**
     * Grab a node by its header: it follows the pointer (snapped to the grid)
     * and stays where it is dropped. Dropping it onto another node swaps their
     * place in the route instead.
     */
    function pgBeginMove(event, index) {
      if (!onPlacesChange || placesBusy || pgMoving) return;
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest('.tg-node-clear')) return;
      var box = pgState && pgState.nodes[index];
      if (!box) return;
      pgMoving = {
        idx: index,
        sx: event.clientX,
        sy: event.clientY,
        x0: box.x - pgState.off.x,
        y0: box.y - pgState.off.y,
        moved: false,
        over: -1,
        raf: 0,
        pid: event.pointerId
      };
      try {
        pgFrame.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
    }

    pgFrame.addEventListener('pointermove', function (e) {
      var m = pgMoving;
      if (!m || e.pointerId !== m.pid) return;
      var dx = e.clientX - m.sx;
      var dy = e.clientY - m.sy;
      if (!m.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!m.moved) {
        m.moved = true;
        pgHost.classList.add('pg-moving');
        placeEditKey = '';
        if (/^(ins|rep):/.test(placesPickerSlot)) placesPickerSlot = '';
      }
      pgLive[m.idx] = { x: pgSnap(m.x0 + dx / pgScale), y: pgSnap(m.y0 + dy / pgScale) };
      var p = pgStagePoint(e);
      m.over = -1;
      (pgState ? pgState.nodes : []).forEach(function (b, k) {
        if (!b || k === m.idx) return;
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) m.over = k;
      });
      if (!m.raf) {
        m.raf = requestAnimationFrame(function () {
          m.raf = 0;
          renderPlaces();
        });
      }
    });

    function pgEndMove(e) {
      var m = pgMoving;
      if (!m || (e && e.pointerId !== m.pid)) return;
      pgMoving = null;
      pgHost.classList.remove('pg-moving');
      var live = pgLive[m.idx];
      pgLive = {};
      if (!m.moved) return;
      pgNoClickUntil = Date.now() + 300;
      pgIgnoreUntil = Date.now() + 400;
      var cancelled = !!e && e.type === 'pointercancel';
      if (!cancelled && m.over >= 0) reorderPlaceStop(m.idx, m.over);
      else if (!cancelled && live) setPlaceStopPos(m.idx, live.x, live.y);
      else renderPlaces();
    }
    pgFrame.addEventListener('pointerup', pgEndMove);
    pgFrame.addEventListener('pointercancel', pgEndMove);

    /**
     * Wire between two boxes wherever they sit: bottom to top when one is
     * clearly above the other, side to side otherwise.
     */
    function pgRouteLink(a, b) {
      var acx = a.x + a.w / 2;
      var acy = a.y + a.h / 2;
      var bcx = b.x + b.w / 2;
      var bcy = b.y + b.h / 2;
      var vGap = b.y >= a.y + a.h ? b.y - (a.y + a.h) : a.y >= b.y + b.h ? a.y - (b.y + b.h) : -1;
      var hGap = b.x >= a.x + a.w ? b.x - (a.x + a.w) : a.x >= b.x + b.w ? a.x - (b.x + b.w) : -1;
      var vertical;
      if (vGap >= 0 && hGap >= 0) vertical = Math.abs(bcy - acy) >= Math.abs(bcx - acx);
      else if (vGap >= 0) vertical = true;
      else if (hGap >= 0) vertical = false;
      else vertical = Math.abs(bcy - acy) >= Math.abs(bcx - acx);
      var x1, y1, x2, y2, c1x, c1y, c2x, c2y;
      if (vertical) {
        var down = bcy >= acy;
        x1 = acx;
        y1 = down ? a.y + a.h : a.y;
        x2 = bcx;
        y2 = down ? b.y : b.y + b.h;
        var dy = Math.max(28, Math.abs(y2 - y1) * 0.5) * (down ? 1 : -1);
        c1x = x1;
        c1y = y1 + dy;
        c2x = x2;
        c2y = y2 - dy;
      } else {
        var right = bcx >= acx;
        x1 = right ? a.x + a.w : a.x;
        y1 = acy;
        x2 = right ? b.x : b.x + b.w;
        y2 = bcy;
        var dx = Math.max(24, Math.abs(x2 - x1) * 0.5) * (right ? 1 : -1);
        c1x = x1 + dx;
        c1y = y1;
        c2x = x2 - dx;
        c2y = y2;
      }
      return {
        d: 'M' + x1 + ' ' + y1 + ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + x2 + ' ' + y2,
        mx: (x1 + 3 * c1x + 3 * c2x + x2) / 8,
        my: (y1 + 3 * c1y + 3 * c2y + y2) / 8
      };
    }

    function pgToolButton(icon, title, onClick, extraClass) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pg-node-tool' + (extraClass ? ' ' + extraClass : '');
      b.title = title;
      b.setAttribute('aria-label', title);
      b.disabled = placesBusy;
      b.innerHTML = '<i class="ti ' + icon + '" aria-hidden="true"></i>';
      b.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return b;
    }

    function pgBuildNode(stop, i, total) {
      var editable = !!onPlacesChange;
      var ref = stop.ref;
      var dir = findDirectoryPlace(ref);
      var name = placeDisplayName(ref);
      var stopKey = 'stop:' + i;

      var node = document.createElement('div');
      node.className = 'tg-node pg-node is-' + stop.key;
      node.setAttribute('data-idx', String(i));
      node.style.width = PG_NODE_W + 'px';
      node.style.setProperty('--tg-hue', String(tgHue(String(ref.id || name))));
      node.setAttribute('aria-label', PLACE_STOP_LABELS[stop.key] + ' : ' + name);

      var head = document.createElement('div');
      head.className = 'tg-node-head';
      if (editable) {
        node.classList.add('is-draggable');
        head.title =
          total > 1
            ? 'Glisser pour d\u00e9placer \u2014 d\u00e9poser sur un autre lieu pour \u00e9changer l\u2019ordre'
            : 'Glisser pour d\u00e9placer';
        head.addEventListener('pointerdown', function (event) {
          pgBeginMove(event, i);
        });
      }
      if (pgMoving && pgMoving.moved) {
        if (pgMoving.idx === i) node.classList.add('is-dragging-node');
        else if (pgMoving.over === i) node.classList.add('is-drop-target');
      }
      var badge = document.createElement('span');
      badge.className = 'pg-node-icon';
      badge.innerHTML =
        '<i class="ti ' + PG_STOP_ICONS[stop.key] + '" aria-hidden="true"></i>';
      head.appendChild(badge);
      var titles = document.createElement('div');
      titles.className = 'pg-node-titles';
      var kindEl = document.createElement('span');
      kindEl.className = 'pg-node-kind';
      kindEl.textContent = PLACE_STOP_LABELS[stop.key];
      titles.appendChild(kindEl);
      var nameEl = document.createElement(onPlaceDirectorySave ? 'button' : 'span');
      nameEl.className = 'tg-node-name pg-node-name';
      nameEl.textContent = name;
      nameEl.title = name;
      if (onPlaceDirectorySave) {
        nameEl.type = 'button';
        nameEl.title = 'Modifier ce lieu (adresse, GPS…)';
        nameEl.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (Date.now() < pgNoClickUntil) return;
          placesPickerSlot = '';
          placeEditKey = placeEditKey === stopKey ? '' : stopKey;
          renderPlaces();
          onLayoutChange();
        });
      }
      titles.appendChild(nameEl);
      head.appendChild(titles);
      if (editable) {
        var swapBtn = document.createElement('button');
        swapBtn.type = 'button';
        swapBtn.className = 'tg-node-clear pg-node-swap';
        swapBtn.setAttribute('aria-label', 'Changer de lieu : ' + name);
        swapBtn.title = 'Choisir un autre lieu';
        swapBtn.innerHTML = '<i class="ti ti-replace" aria-hidden="true"></i>';
        swapBtn.disabled = placesBusy;
        swapBtn.addEventListener('pointerdown', function (event) {
          event.stopPropagation();
        });
        swapBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          setPlacesPickerOpen(placesPickerSlot === 'rep:' + i ? '' : 'rep:' + i);
        });
        head.appendChild(swapBtn);
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'tg-node-clear';
        clearBtn.setAttribute('aria-label', 'Retirer : ' + name);
        clearBtn.textContent = '×';
        clearBtn.disabled = placesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          removePlaceStop(i);
        });
        head.appendChild(clearBtn);
      }
      node.appendChild(head);

      var body = document.createElement('div');
      body.className = 'pg-node-body';
      if (editable) {
        var doInput = document.createElement('input');
        doInput.type = 'text';
        doInput.className = 'pg-node-do';
        doInput.placeholder =
          stop.key === 'from'
            ? 'Ce qu’on y prend / fait…'
            : stop.key === 'to'
              ? 'Ce qu’on y fait à l’arrivée…'
              : 'Ce qu’on y fait…';
        doInput.setAttribute('aria-label', 'Ce qu’on fait à ' + name);
        doInput.maxLength = MAX_PLACE_DO_LEN;
        doInput.autocomplete = 'off';
        doInput.value = ref.do || '';
        doInput.disabled = placesBusy;
        doInput.addEventListener('keydown', function (event) {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            doInput.blur();
          }
        });
        doInput.addEventListener('change', function () {
          setPlaceStopAction(i, doInput.value);
        });
        body.appendChild(doInput);
      } else if (ref.do) {
        var doText = document.createElement('div');
        doText.className = 'pg-node-do-text';
        doText.textContent = ref.do;
        body.appendChild(doText);
      }

      var metaBits = [];
      if (dir && dir.address) metaBits.push(dir.address);
      var hasGps = !!(dir && typeof dir.lat === 'number' && typeof dir.lng === 'number');
      if (metaBits.length || hasGps || dir) {
        var meta = document.createElement('div');
        meta.className = 'pg-node-meta';
        if (metaBits.length) {
          var addr = document.createElement('span');
          addr.className = 'pg-node-addr';
          addr.textContent = metaBits.join(' · ');
          addr.title = metaBits.join(' · ');
          meta.appendChild(addr);
        }
        if (hasGps) {
          var gps = document.createElement('i');
          gps.className = 'ti ti-current-location pg-node-gps';
          gps.title = 'Position GPS enregistrée';
          meta.appendChild(gps);
        }
        if (placeHasGeo(dir)) {
          var link = document.createElement('a');
          link.className = 'pg-node-tool';
          link.href = placeMapsHref(ref, dir);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = 'Ouvrir dans Google Maps';
          link.setAttribute('aria-label', 'Ouvrir dans Google Maps');
          link.innerHTML = '<i class="ti ti-map-2" aria-hidden="true"></i>';
          link.addEventListener('click', function (event) {
            event.stopPropagation();
          });
          meta.appendChild(link);
        }
        if (meta.childNodes.length) body.appendChild(meta);
      }
      if (editable && total > 1) {
        var tools = document.createElement('div');
        tools.className = 'pg-node-tools';
        if (i > 0) {
          tools.appendChild(
            pgToolButton('ti-chevron-up', 'Monter ce lieu', function () {
              movePlaceStop(i, -1);
            })
          );
        }
        if (i < total - 1) {
          tools.appendChild(
            pgToolButton('ti-chevron-down', 'Descendre ce lieu', function () {
              movePlaceStop(i, 1);
            })
          );
        }
        body.appendChild(tools);
      }
      if (body.childNodes.length) node.appendChild(body);

      // Pins (like the Assignés nodes): hover the top of the first stop or the
      // bottom of the last one, then drag or click to add a stop there.
      if (editable) {
        var pins = [];
        if (i === 0) pins.push({ side: 'top', at: 0, label: 'Ajouter un lieu avant' });
        if (i === total - 1) {
          pins.push({ side: 'bottom', at: total, label: 'Ajouter un lieu après' });
        }
        pins.forEach(function (def) {
          var edge = document.createElement('div');
          edge.className = 'tg-edge tg-edge-' + def.side + ' tg-kind-flow';
          edge.setAttribute('role', 'button');
          edge.tabIndex = 0;
          edge.setAttribute('aria-label', name + ' : ' + def.label);
          edge.title = def.label;
          var dot = document.createElement('span');
          dot.className = 'tg-pin';
          dot.setAttribute('aria-hidden', 'true');
          edge.appendChild(dot);
          edge.addEventListener('pointerdown', function (event) {
            var box = pgState && pgState.nodes[i];
            if (box) pgStartPinDrag(event, edge, def.at, def.side, box);
          });
          edge.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              var box = pgState && pgState.nodes[i];
              if (box) {
                pgOpenInsert(def.at, {
                  x: box.x + box.w / 2,
                  y: def.side === 'top' ? box.y - 40 : box.y + box.h + 40
                });
              }
            }
          });
          node.appendChild(edge);
        });
      }
      return node;
    }

    function pgPlacePopover(el, x, y, width) {
      var hostW = pgHost.clientWidth || 320;
      var w = Math.min(width, hostW);
      el.style.width = w + 'px';
      var left = pgStage.offsetLeft + pgPan.x + x * pgScale - w / 2;
      el.style.left = Math.max(0, Math.min(left, hostW - w)) + 'px';
      var top = Math.max(0, Math.round(pgPan.y + y * pgScale));
      el.style.top = top + 'px';
      pgFrame.style.minHeight = Math.max(
        parseInt(pgFrame.style.minHeight, 10) || 0,
        top + el.offsetHeight + 8
      ) + 'px';
    }

    function renderPlaceGraph(stops) {
      if (pgDrag) return;
      pgNodes.replaceChildren();
      pgWires.replaceChildren();
      pgPills.replaceChildren();
      pgFrame.style.minHeight = '';

      stops.forEach(function (stop, i) {
        pgNodes.appendChild(pgBuildNode(stop, i, stops.length));
      });
      var heights = [];
      pgNodes.querySelectorAll('.pg-node').forEach(function (n) {
        heights[Number(n.getAttribute('data-idx'))] = n.offsetHeight;
      });
      var layout = pgLayout(stops.length, heights, pgHost.clientWidth);
      // Hand-placed stops (x / y saved on the stop, or live while dragging)
      // override the automatic snake layout.
      var hasFree = false;
      stops.forEach(function (stop, idx) {
        var b = layout.nodes[idx];
        if (!b) return;
        var live = pgLive[idx];
        var fx = live ? live.x : stop.ref.x;
        var fy = live ? live.y : stop.ref.y;
        if (typeof fx === 'number' && typeof fy === 'number') {
          b.x = fx;
          b.y = fy;
          hasFree = true;
        }
      });
      var minX = Infinity;
      var minY = Infinity;
      var maxX = 0;
      var maxY = 0;
      layout.nodes.forEach(function (b) {
        if (!b) return;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      });
      if (!isFinite(minX)) {
        minX = 0;
        minY = 0;
      }
      // Never shrink toward the top-left, so nodes do not jump when one is moved.
      var offX = PG_PAD + Math.max(0, -minX);
      var offY = PG_TOP + Math.max(0, -minY);
      var stageW = maxX + offX + PG_PAD;
      var stageH = maxY + offY + PG_PAD;
      var shifted = [];
      pgNodes.querySelectorAll('.pg-node').forEach(function (n) {
        var idx = Number(n.getAttribute('data-idx'));
        var b = layout.nodes[idx];
        if (!b) return;
        shifted[idx] = { x: b.x + offX, y: b.y + offY, w: b.w, h: b.h };
        n.style.left = shifted[idx].x + 'px';
        n.style.top = shifted[idx].y + 'px';
      });
      pgState = { nodes: shifted, width: stageW, height: stageH, off: { x: offX, y: offY } };
      pgAutoBtn.hidden = !hasFree || !onPlacesChange;

      pgStage.style.width = stageW + 'px';
      pgStage.style.height = stageH + 'px';
      pgWires.setAttribute('width', String(stageW));
      pgWires.setAttribute('height', String(stageH));
      pgWires.setAttribute('viewBox', '0 0 ' + stageW + ' ' + stageH);

      var available = pgHost.clientWidth;
      pgFit = available > 0 && stageW > available ? Math.max(0.55, available / stageW) : 1;
      pgScale = Math.max(0.25, pgFit * pgZoomMul);
      pgApplyTransform();
      pgFrame.style.height = Math.max(320, Math.ceil(stageH * pgFit)) + 'px';

      var defs = pgSvg('defs');
      var marker = pgSvg('marker', {
        id: 'pg-arrow-' + pgUid,
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: '9',
        markerHeight: '9',
        markerUnits: 'userSpaceOnUse',
        orient: 'auto-start-reverse'
      });
      marker.appendChild(pgSvg('path', { d: 'M0 1 L10 5 L0 9 z', class: 'tg-arrowhead tg-kind-flow' }));
      defs.appendChild(marker);
      pgWires.appendChild(defs);

      var editable = !!onPlacesChange;
      for (var i = 0; i < stops.length - 1; i++) {
        (function (idx) {
          var a = shifted[idx];
          var b = shifted[idx + 1];
          if (!a || !b) return;
          var route = pgRouteLink(a, b);
          var group = pgSvg('g', { class: 'tg-wire-group tg-kind-flow' });
          group.appendChild(pgSvg('path', { d: route.d, class: 'tg-wire-glow' }));
          group.appendChild(
            pgSvg('path', {
              d: route.d,
              class: 'tg-wire',
              'marker-end': 'url(#pg-arrow-' + pgUid + ')'
            })
          );
          var hit = pgSvg('path', { d: route.d, class: 'tg-wire-hit' });
          group.appendChild(hit);
          pgWires.appendChild(group);
          if (!editable) return;
          var pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'tg-pill tg-kind-flow pg-pill';
          pill.style.left = route.mx + 'px';
          pill.style.top = route.my + 'px';
          pill.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
          pill.title = 'Ajouter un lieu ici';
          pill.setAttribute('aria-label', 'Ajouter un lieu entre ces deux lieux');
          var open = function (event) {
            event.preventDefault();
            event.stopPropagation();
            pgOpenInsert(idx + 1, { x: route.mx, y: route.my + 16 });
          };
          pill.addEventListener('click', open);
          hit.addEventListener('click', open);
          pgPills.appendChild(pill);
        })(i);
      }

      // Toolbar
      var dirs = stops.map(function (s) {
        return findDirectoryPlace(s.ref);
      });
      var itin =
        stops.length >= 2 &&
        dirs.every(Boolean) &&
        global.Places &&
        typeof global.Places.directionsUrl === 'function'
          ? global.Places.directionsUrl(dirs)
          : '';
      pgItinBtn.hidden = !itin;
      if (itin) pgItinBtn.href = itin;

      // Popovers: place editor under its node, or the "add a stop" picker.
      pgEditor.hidden = true;
      pgEditor.replaceChildren();
      pgPop.hidden = true;
      pgPop.replaceChildren();
      var editMatch = /^stop:(\d+)$/.exec(placeEditKey);
      var insMatch = /^ins:(\d+)$/.exec(placesPickerSlot);
      var repMatch = /^rep:(\d+)$/.exec(placesPickerSlot);
      if (editMatch && onPlaceDirectorySave && stops[Number(editMatch[1])]) {
        var ei = Number(editMatch[1]);
        var eb = shifted[ei];
        pgEditor.hidden = false;
        pgEditor.appendChild(buildPlaceEditor(stops[ei].ref));
        if (eb) pgPlacePopover(pgEditor, eb.x + eb.w / 2, eb.y + eb.h + 8, 300);
      } else if (repMatch && editable && shifted[Number(repMatch[1])]) {
        var rb = shifted[Number(repMatch[1])];
        pgPop.hidden = false;
        pgPop.appendChild(buildPlacesPicker(placesPickerSlot));
        pgPlacePopover(pgPop, rb.x + rb.w / 2, rb.y + rb.h + 8, 272);
      } else if (insMatch && editable) {
        pgPop.hidden = false;
        pgPop.appendChild(buildPlacesPicker(placesPickerSlot));
        var pt = pgPickPoint;
        if (!pt) {
          var lastBox = shifted[shifted.length - 1];
          pt = lastBox
            ? { x: lastBox.x + lastBox.w / 2, y: lastBox.y + lastBox.h + 24 }
            : { x: stageW / 2, y: 24 };
        }
        pgPlacePopover(pgPop, pt.x, pt.y, 272);
      }
    }

    pgHost.addEventListener('click', function (event) {
      if (Date.now() < pgIgnoreUntil || event.target.closest('.tg-edge')) return;
      if (
        !event.target.closest('.tg-editor') &&
        !event.target.closest('.tg-pill') &&
        !event.target.closest('.tg-wire-hit') &&
        !event.target.closest('.pg-node-name')
      ) {
        if (placeEditKey || /^(ins|rep):/.test(placesPickerSlot)) {
          placeEditKey = '';
          if (/^(ins|rep):/.test(placesPickerSlot)) placesPickerSlot = '';
          renderPlaces();
          onLayoutChange();
        }
      }
    });
    pgHost.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && (placeEditKey || /^(ins|rep):/.test(placesPickerSlot))) {
        placeEditKey = '';
        if (/^(ins|rep):/.test(placesPickerSlot)) placesPickerSlot = '';
        renderPlaces();
        onLayoutChange();
      }
    });
    if (typeof global.ResizeObserver === 'function') {
      var pgLastWidth = 0;
      new global.ResizeObserver(function () {
        var w = pgHost.clientWidth;
        if (Math.abs(w - pgLastWidth) < 2) return;
        pgLastWidth = w;
        if (pgExpanded && !pgHost.hidden) {
          renderPlaces();
          onLayoutChange();
        }
      }).observe(pgHost);
    }

    // ── simple view: chips in route order; click to open the node view ──
    function renderPlaceChips(stops) {
      var wrap = document.createElement('div');
      wrap.className = 'info-route-chips';
      stops.forEach(function (stop, i) {
        if (i > 0) {
          var sep = document.createElement('i');
          sep.className = 'ti ti-arrow-narrow-right info-route-sep';
          sep.setAttribute('aria-hidden', 'true');
          wrap.appendChild(sep);
        }
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'info-route-chip is-' + stop.key;
        var name = placeDisplayName(stop.ref);
        chip.title =
          PLACE_STOP_LABELS[stop.key] +
          ' : ' +
          name +
          (stop.ref.do ? ' — ' + stop.ref.do : '') +
          ' (voir le détail)';
        chip.style.setProperty('--tg-hue', String(tgHue(String(stop.ref.id || name))));
        var dot = document.createElement('span');
        dot.className = 'info-route-chip-dot';
        chip.appendChild(dot);
        var text = document.createElement('span');
        text.className = 'info-route-chip-name';
        text.textContent = name;
        chip.appendChild(text);
        if (stops.length > 1) {
          var kind = document.createElement('span');
          kind.className = 'info-route-chip-kind';
          kind.textContent = PLACE_STOP_LABELS[stop.key];
          chip.appendChild(kind);
        }
        chip.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          pgSetExpanded(true);
        });
        wrap.appendChild(chip);
      });
      return wrap;
    }

    function renderPlaces() {
      placesRouteEl.replaceChildren();
      var map = normalizePlaces(cardPlaces);
      var stops = pgStops(map);
      var editable = !!onPlacesChange;

      if (!stops.length) {
        pgHost.hidden = true;
        pgExpanded = false;
        placesRouteEl.hidden = false;
        // Empty: choose the shape of the task first.
        if (!editable) {
          var none = document.createElement('span');
          none.className = 'info-route-empty-text';
          none.textContent = 'Aucun lieu';
          placesRouteEl.appendChild(none);
          return;
        }
        var choose = document.createElement('div');
        choose.className = 'info-route-choose';
        [
          ['at', 'ti-map-pin', 'Un lieu', 'La tâche se fait à un endroit'],
          ['from', 'ti-route', 'Un trajet', 'Départ, étapes, arrivée']
        ].forEach(function (spec) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'info-route-choose-btn';
          b.disabled = placesBusy;
          b.title = spec[3];
          b.setAttribute(
            'aria-expanded',
            placesPickerSlot === spec[0] ? 'true' : 'false'
          );
          b.innerHTML = '<i class="ti ' + spec[1] + '" aria-hidden="true"></i>';
          var t = document.createElement('span');
          t.textContent = spec[2];
          b.appendChild(t);
          if (placesPickerSlot === spec[0]) b.classList.add('is-open');
          b.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            setPlacesPickerOpen(placesPickerSlot === spec[0] ? '' : spec[0]);
          });
          choose.appendChild(b);
        });
        placesRouteEl.appendChild(choose);
        if (placesPickerSlot === 'at' || placesPickerSlot === 'from') {
          placesRouteEl.appendChild(buildPlacesPicker(placesPickerSlot));
        }
        return;
      }

      if (pgExpanded) {
        placesRouteEl.hidden = true;
        pgHost.hidden = false;
        renderPlaceGraph(stops);
      } else {
        pgHost.hidden = true;
        placesRouteEl.hidden = false;
        placesRouteEl.appendChild(renderPlaceChips(stops));
      }
    }

    function renderPlacesPicker() {
      renderPlaces();
    }

    renderPlaces();

    function addCustomAssigneeFromPicker() {
      if (membersBusy || !onCustomAssigneesChange) return;
      var nameInput = membersPicker.querySelector('.info-members-create-input');
      var linkSelect = membersPicker.querySelector('.info-members-create-link');
      var name = nameInput && typeof nameInput.value === 'string'
        ? nameInput.value.trim()
        : '';
      var linkId =
        linkSelect && typeof linkSelect.value === 'string'
          ? linkSelect.value.trim()
          : '';
      if (!name) {
        setMembersStatus('Nom invalide', 'error');
        return;
      }
      var nameKey = name.toLocaleLowerCase('fr-FR');
      for (var i = 0; i < customAssignees.length; i++) {
        if (customAssignees[i].name.toLocaleLowerCase('fr-FR') === nameKey) {
          setMembersStatus('Cette personne existe d\u00e9j\u00e0', 'error');
          return;
        }
      }

      var catalogHit = findCustomAssigneeCatalogByName(name);
      var draft = catalogHit
        ? normalizeCustomAssigneeEntry({
            id: catalogHit.id,
            name: catalogHit.name,
            trelloMemberId: linkId || catalogHit.trelloMemberId || ''
          })
        : createCustomAssignee({
            name: name,
            trelloMemberId: linkId || ''
          });
      if (!draft) {
        setMembersStatus('Nom invalide', 'error');
        return;
      }

      var ensureCatalog = function () {
        var before = getCustomAssigneeCatalog();
        var upserted = upsertCustomAssigneeCatalog(draft);
        if (!upserted) {
          setMembersStatus('Catalogue plein', 'error');
          return Promise.resolve({ ok: false });
        }
        draft = upserted;
        var after = getCustomAssigneeCatalog();
        var changed =
          JSON.stringify(before) !== JSON.stringify(after);
        if (!changed) {
          return Promise.resolve({ ok: true, changed: false });
        }
        return persistCustomAssigneeCatalog(after);
      };

      ensureCatalog().then(function (result) {
        if (result && result.ok === false) {
          if (!membersStatus.textContent) {
            setMembersStatus('\u00c9chec de l\u2019enregistrement', 'error');
          }
          return;
        }
        persistCustomAssignees(customAssignees.concat([draft]));
      });
    }

    function addCatalogAssigneeFromPicker(entry) {
      if (membersBusy || !onCustomAssigneesChange || !entry || !entry.id) return;
      var id = String(entry.id);
      for (var i = 0; i < customAssignees.length; i++) {
        if (customAssignees[i] && String(customAssignees[i].id) === id) {
          setMembersStatus('Cette personne existe d\u00e9j\u00e0', 'error');
          return;
        }
      }
      var draft = normalizeCustomAssigneeEntry(entry);
      if (!draft) return;
      return persistCustomAssignees(customAssignees.concat([draft]));
    }

    function renderMembersPicker() {
      membersPicker.replaceChildren();
      var available = availableBoardMembers();

      var list = document.createElement('div');
      list.className = 'info-members-picker-list';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', 'Membres du tableau');

      if (!available.length) {
        if (!boardMembers.length) {
          var empty = document.createElement('div');
          empty.className = 'info-members-picker-empty';
          empty.textContent = 'Aucun membre Trello sur ce tableau';
          list.appendChild(empty);
        }
      } else {
        available.forEach(function (member) {
          var name = memberDisplayName(member) || 'Membre';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-members-picker-option';
          btn.setAttribute('role', 'option');
          btn.title = name;
          btn.disabled = membersBusy;
          btn.dataset.memberId = String(member.id);

          appendMemberAvatar(btn, member);

          var text = document.createElement('span');
          text.className = 'info-members-picker-option-text';
          text.textContent = name;

          btn.appendChild(text);
          btn.addEventListener('click', function () {
            addMemberFromPicker(member);
          });
          list.appendChild(btn);
        });
      }
      membersPicker.appendChild(list);

      if (onCustomAssigneesChange) {
        var catalogAvailable = availableCatalogAssignees();
        var horsWrap = document.createElement('div');
        horsWrap.className = 'info-members-create';

        if (catalogAvailable.length) {
          var horsList = document.createElement('div');
          horsList.className = 'info-members-picker-list';
          horsList.setAttribute('role', 'group');
          horsList.setAttribute('aria-label', 'Personnes hors Trello');
          catalogAvailable.forEach(function (entry) {
            var display = customAssigneeToMember(entry, boardMembers);
            var name =
              (display && memberDisplayName(display)) || entry.name || 'Personne';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'info-members-picker-option';
            btn.setAttribute('role', 'option');
            btn.title = name;
            btn.disabled = membersBusy;
            btn.dataset.personId = String(entry.id);
            if (display) appendMemberAvatar(btn, display);
            var text = document.createElement('span');
            text.className = 'info-members-picker-option-text';
            text.textContent = name;
            var badge = document.createElement('span');
            badge.className = 'info-member-custom-badge';
            badge.textContent = 'hors Trello';
            btn.appendChild(text);
            btn.appendChild(badge);
            btn.addEventListener('click', function () {
              addCatalogAssigneeFromPicker(entry);
            });
            horsList.appendChild(btn);
          });
          horsWrap.appendChild(horsList);
        } else if (getCustomAssigneeCatalog().length) {
          var horsEmpty = document.createElement('div');
          horsEmpty.className = 'info-members-picker-empty';
          horsEmpty.textContent =
            'Toutes les personnes hors Trello sont d\u00e9j\u00e0 assign\u00e9es';
          horsWrap.appendChild(horsEmpty);
        }

        var createTitle = document.createElement('div');
        createTitle.className = 'info-members-create-title';
        createTitle.textContent = 'Nouvelle personne';
        horsWrap.appendChild(createTitle);

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'info-members-create-input';
        nameInput.placeholder = 'Nom (ex. freelances, client\u2026)';
        nameInput.maxLength = MAX_CUSTOM_ASSIGNEE_NAME_LEN;
        nameInput.setAttribute('aria-label', 'Nom de la personne');
        nameInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        nameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            addCustomAssigneeFromPicker();
          }
        });

        var linkSelect = document.createElement('select');
        linkSelect.className = 'info-members-create-link';
        linkSelect.setAttribute(
          'aria-label',
          'Lier \u00e0 un membre Trello (optionnel)'
        );
        linkSelect.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        var optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = 'Sans lien Trello';
        linkSelect.appendChild(optNone);
        boardMembers.forEach(function (member) {
          if (!member || !member.id) return;
          var opt = document.createElement('option');
          opt.value = String(member.id);
          opt.textContent =
            'Lier\u00a0: ' + (memberDisplayName(member) || member.id);
          linkSelect.appendChild(opt);
        });

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'info-members-create-btn';
        createBtn.textContent = 'Cr\u00e9er';
        createBtn.disabled = membersBusy;
        createBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          addCustomAssigneeFromPicker();
        });

        horsWrap.appendChild(nameInput);
        horsWrap.appendChild(linkSelect);
        horsWrap.appendChild(createBtn);
        membersPicker.appendChild(horsWrap);
      }
    }

    function rolesForMember(memberId) {
      var id = memberId != null ? String(memberId) : '';
      return id && memberRoles[id] ? memberRoles[id].slice() : [];
    }

    function cloneMemberRolesMap() {
      return normalizeMemberRoles(memberRoles);
    }

    function persistMemberRoles(nextMap, nextCustoms) {
      var map = normalizeMemberRoles(nextMap);
      var customs = pruneMemberRoleCustoms(
        nextCustoms != null ? nextCustoms : getMemberRoleCustoms(),
        map
      );
      setMemberRoleCustoms(customs);
      memberRoles = map;
      if (!onMemberRolesChange) {
        renderMembers();
        onLayoutChange();
        return Promise.resolve({ ok: true, changed: false });
      }
      memberRolesBusy = true;
      setMembersStatus('', 'saving');
      renderMembers();
      return Promise.resolve(onMemberRolesChange(map, customs))
        .then(function (result) {
          memberRolesBusy = false;
          if (result && result.ok === false) {
            setMembersStatus('\u00c9chec des r\u00f4les', 'error');
            renderMembers();
            onLayoutChange();
            return result;
          }
          if (result && result.memberRoles) {
            memberRoles = normalizeMemberRoles(result.memberRoles);
          }
          if (result && result.memberRoleCustoms) {
            setMemberRoleCustoms(result.memberRoleCustoms);
          }
          setMembersStatus('', 'ok');
          // Keep the picker open so the user can toggle several roles.
          renderMembers();
          setTimeout(function () {
            if (membersStatus.classList.contains('is-ok')) {
              setMembersStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result || { ok: true, changed: true };
        })
        .catch(function (err) {
          memberRolesBusy = false;
          console.error('Info member roles save failed', err);
          setMembersStatus('\u00c9chec des r\u00f4les', 'error');
          renderMembers();
          onLayoutChange();
        });
    }

    function setMemberRolesPickerOpen(memberId) {
      var id = memberId != null ? String(memberId).trim() : '';
      memberRolesPickerMemberId = id;
      memberRolesPickerHost.hidden = !id;
      if (id) renderMemberRolesPicker(id);
      tgPlaceRolesPicker();
      onLayoutChange();
    }

    function renderMemberRolesPicker(memberId) {
      memberRolesPicker.replaceChildren();
      var assigned = Object.create(null);
      var current = rolesForMember(memberId);
      for (var a = 0; a < current.length; a++) assigned[current[a]] = true;

      var heading = document.createElement('div');
      heading.className = 'info-member-roles-picker-heading';
      var member = null;
      for (var mi = 0; mi < members.length; mi++) {
        if (members[mi] && String(members[mi].id) === String(memberId)) {
          member = members[mi];
          break;
        }
      }
      var memberName = memberDisplayName(member) || 'Membre';
      heading.textContent = 'R\u00f4les\u00a0: ' + memberName;
      memberRolesPicker.appendChild(heading);

      var list = document.createElement('div');
      list.className = 'info-member-roles-picker-list';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', 'R\u00f4les de ' + memberName);

      var catalog = getMemberRoleCatalog().concat(getMemberRoleCustoms());
      var seen = Object.create(null);
      var entries = [];
      for (var c = 0; c < catalog.length; c++) {
        var entry = catalog[c];
        if (!entry || !entry.id || seen[entry.id]) continue;
        seen[entry.id] = true;
        entries.push(entry);
      }
      // Keep assigned orphans visible even if dropped from catalog.
      for (var r = 0; r < current.length; r++) {
        if (seen[current[r]]) continue;
        var orphan = getMemberRoleEntry(current[r]);
        if (orphan) {
          seen[orphan.id] = true;
          entries.push(orphan);
        }
      }

      if (!entries.length) {
        var empty = document.createElement('div');
        empty.className = 'info-member-roles-picker-empty';
        empty.textContent = 'Aucun r\u00f4le dans le catalogue';
        list.appendChild(empty);
      } else {
        entries.forEach(function (entry) {
          var isOn = !!assigned[entry.id];
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'info-member-roles-picker-option' + (isOn ? ' is-selected' : '');
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-selected', isOn ? 'true' : 'false');
          btn.title = isOn
            ? 'Retirer\u00a0: ' + entry.label
            : 'Ajouter\u00a0: ' + entry.label;
          btn.disabled = memberRolesBusy;
          var check = document.createElement('i');
          check.className =
            'ti ' + (isOn ? 'ti-square-check-filled' : 'ti-square') +
            ' info-member-roles-picker-check';
          check.setAttribute('aria-hidden', 'true');
          var icon = document.createElement('i');
          icon.className = 'ti ti-' + (entry.icon || 'tag');
          icon.setAttribute('aria-hidden', 'true');
          var text = document.createElement('span');
          text.textContent = entry.label;
          btn.appendChild(check);
          btn.appendChild(icon);
          btn.appendChild(text);
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (isOn) removeRoleFromMember(memberId, entry.id);
            else addRoleToMember(memberId, entry.id);
          });
          list.appendChild(btn);
        });
      }
      memberRolesPicker.appendChild(list);

      if (onMemberRolesChange) {
        var createWrap = document.createElement('div');
        createWrap.className = 'info-member-roles-create';
        var createRow = document.createElement('div');
        createRow.className = 'info-member-roles-create-row';
        var createInput = document.createElement('input');
        createInput.type = 'text';
        createInput.className = 'info-member-roles-create-input';
        createInput.placeholder = 'Nouveau r\u00f4le (cette carte)';
        createInput.maxLength = MAX_MEMBER_ROLE_LABEL_LEN;
        createInput.setAttribute('aria-label', 'Cr\u00e9er un r\u00f4le pour cette carte');
        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'info-member-roles-create-btn';
        createBtn.textContent = 'Ajouter';
        createBtn.disabled = memberRolesBusy;

        function submitCreate() {
          if (memberRolesBusy) return;
          var draft = createCustomMemberRole(
            { label: createInput.value },
            { apply: true }
          );
          if (!draft) {
            setMembersStatus('R\u00f4le invalide ou doublon', 'error');
            return;
          }
          var map = cloneMemberRolesMap();
          var mid = String(memberId);
          var roles = normalizeMemberRoleIds((map[mid] || []).concat([draft.id]));
          if (roles.length) map[mid] = roles;
          persistMemberRoles(map, getMemberRoleCustoms());
        }

        createBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          submitCreate();
        });
        createInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitCreate();
          }
        });
        createInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        createRow.appendChild(createInput);
        createRow.appendChild(createBtn);
        createWrap.appendChild(createRow);
        memberRolesPicker.appendChild(createWrap);
      }
    }

    function toggleMemberRolesPicker(memberId) {
      var mid = memberId != null ? String(memberId).trim() : '';
      if (!mid || !onMemberRolesChange || memberRolesBusy) return;
      if (memberRolesPickerMemberId === mid) {
        setMemberRolesPickerOpen('');
      } else {
        setMemberRolesPickerOpen(mid);
      }
    }

    function addRoleToMember(memberId, roleId) {
      if (!roleId || memberRolesBusy) return;
      var map = cloneMemberRolesMap();
      var mid = String(memberId);
      var roles = normalizeMemberRoleIds((map[mid] || []).concat([roleId]));
      if (roles.length) map[mid] = roles;
      else delete map[mid];
      persistMemberRoles(map);
    }

    function removeRoleFromMember(memberId, roleId) {
      if (!roleId || memberRolesBusy) return;
      var map = cloneMemberRolesMap();
      var mid = String(memberId);
      var roles = (map[mid] || []).filter(function (id) {
        return id !== roleId;
      });
      if (roles.length) map[mid] = roles;
      else delete map[mid];
      persistMemberRoles(map);
    }

    // ── Team graph (node view of the assignees) ────────────────────────
    var TG_NODE_W = 210;
    var TG_PAD = 20;
    var TG_KIND_META = {
      asks: { icon: 'ti-arrow-down', label: 'Demande', verb: 'demande à' },
      flow: { icon: 'ti-arrow-right', label: 'Enchaîne', verb: 'passe le relais à' },
      both: { icon: 'ti-arrows-exchange', label: 'Collaboration', verb: 'collabore avec' }
    };
    var tgUid = ++S.teamGraphInstances;
    var tgSelectedKey = '';
    var tgPending = null; // { from, kind } armed by clicking a pin
    var tgScale = 1;
    var tgFit = 1;
    var tgAutoH = 0;
    var TG_GRID = 18; // same as the dot spacing of the canvas
    var TG_POS_KEY = 'tp-tg-node-pos';
    var tgMoving = null;
    var tgPositions = (function () {
      try {
        var raw = typeof localStorage !== 'undefined' && localStorage.getItem(TG_POS_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        return {};
      }
    })();
    function tgSavePositions() {
      try {
        localStorage.setItem(TG_POS_KEY, JSON.stringify(tgPositions));
      } catch (err) {
        /* optional */
      }
    }
    function tgSnap(v) {
      return Math.round(v / TG_GRID) * TG_GRID;
    }
    var tgCanvasH = 0; // user-chosen canvas height (0 = fit the content)
    var tgZoomMul = 1;
    var tgLayout = null;
    var tgDrag = null;
    var tgExpanded = false;
    var tgIgnoreClickUntil = 0;
    var tgPan = { x: 0, y: 0 };

    function tgApplyTransform() {
      var moved = tgPan.x || tgPan.y;
      tgStage.style.transform =
        tgScale === 1 && !moved
          ? ''
          : 'translate(' + tgPan.x + 'px,' + tgPan.y + 'px) scale(' + tgScale + ')';
      tgPlaceRolesPicker();
      // Miro-like canvas: the dot grid scales and pans with the content.
      var step = 18 * tgScale;
      while (step < 9) step *= 2;
      tgHost.style.backgroundSize = step + 'px ' + step + 'px';
      tgHost.style.backgroundPosition =
        Math.round(tgStage.offsetLeft + tgPan.x - step / 2) + 'px ' + Math.round(tgPan.y - step / 2) + 'px';
    }

    // Zoom out (down to 25%) and back to the fitted size, around a point of the frame.
    function tgZoomBy(factor, px, py) {
      var nextMul = Math.max(0.2, Math.min(3, tgZoomMul * factor));
      var nextScale = Math.max(0.25, tgFit * nextMul);
      if (Math.abs(nextScale - tgScale) < 0.001) return;
      var ox = tgStage.offsetLeft;
      var sx = (px - ox - tgPan.x) / tgScale;
      var sy = (py - tgPan.y) / tgScale;
      tgZoomMul = nextMul;
      tgScale = nextScale;
      tgPan.x = Math.round(px - ox - sx * tgScale);
      tgPan.y = Math.round(py - sy * tgScale);
      tgApplyTransform();
    }

    tgFrame.addEventListener(
      'wheel',
      function (event) {
        if (event.target.closest('.tg-editor, .tg-create, .info-member-roles-picker-host')) return;
        if (!(event.ctrlKey || event.metaKey || tgExpanded)) return;
        event.preventDefault();
        var rect = tgFrame.getBoundingClientRect();
        tgZoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
      },
      { passive: false }
    );
    tgZoomOutBtn.addEventListener('click', function (event) {
      event.preventDefault();
      tgZoomBy(0.8, tgHost.clientWidth / 2, tgFrame.clientHeight / 2);
    });
    tgZoomInBtn.addEventListener('click', function (event) {
      event.preventDefault();
      tgZoomBy(1.25, tgHost.clientWidth / 2, tgFrame.clientHeight / 2);
    });

    tgFrame.addEventListener('pointermove', function (e) {
      var m = tgMoving;
      if (!m || e.pointerId !== m.pid) return;
      var dx = e.clientX - m.sx;
      var dy = e.clientY - m.sy;
      if (!m.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!m.moved) {
        m.moved = true;
        tgHost.classList.add('is-moving');
        tgCloseEditor();
      }
      tgPositions[m.id] = { x: tgSnap(m.x0 + dx / tgScale), y: tgSnap(m.y0 + dy / tgScale) };
      if (!m.raf) {
        m.raf = requestAnimationFrame(function () {
          m.raf = 0;
          renderTeamGraph();
        });
      }
    });
    function tgEndMove(e) {
      var m = tgMoving;
      if (!m || (e && e.pointerId !== m.pid)) return;
      tgMoving = null;
      tgHost.classList.remove('is-moving');
      if (m.moved) {
        tgSavePositions();
        tgIgnoreClickUntil = Date.now() + 400;
        renderTeamGraph();
      }
    }
    tgFrame.addEventListener('pointerup', tgEndMove);
    tgFrame.addEventListener('pointercancel', tgEndMove);

    function tgApplyFrameHeight() {
      tgFrame.style.height = Math.max(tgAutoH, tgCanvasH, 320) + 'px';
      tgExpandBtn.innerHTML =
        '<i class="ti ' + (tgCanvasH ? 'ti-arrows-minimize' : 'ti-arrows-maximize') + '" aria-hidden="true"></i>';
      tgExpandBtn.title = tgCanvasH ? 'R\u00e9duire la hauteur' : 'Agrandir la hauteur';
    }
    tgExpandBtn.addEventListener('click', function (event) {
      event.preventDefault();
      tgCanvasH = tgCanvasH ? 0 : Math.max(360, Math.round(window.innerHeight * 0.75));
      tgApplyFrameHeight();
      onLayoutChange();
    });
    tgResizeHandle.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      var startY = event.clientY;
      var startH = tgFrame.clientHeight;
      try {
        tgResizeHandle.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
      var move = function (e) {
        tgCanvasH = Math.round(Math.max(160, Math.min(1400, startH + e.clientY - startY)));
        tgApplyFrameHeight();
        onLayoutChange();
      };
      var end = function () {
        tgResizeHandle.removeEventListener('pointermove', move);
        tgResizeHandle.removeEventListener('pointerup', end);
        tgResizeHandle.removeEventListener('pointercancel', end);
      };
      tgResizeHandle.addEventListener('pointermove', move);
      tgResizeHandle.addEventListener('pointerup', end);
      tgResizeHandle.addEventListener('pointercancel', end);
    });

    // The role picker opens right under the person's node (inside the graph frame),
    // not at the bottom of the section where it can fall outside the view.
    function tgPlaceRolesPicker() {
      var mid = memberRolesPickerMemberId;
      var box = mid && !memberRolesPickerHost.hidden && !tgHost.hidden && tgLayout && tgLayout.nodes[mid];
      if (!box) {
        if (memberRolesPickerHost.parentNode !== membersWrap) membersWrap.appendChild(memberRolesPickerHost);
        memberRolesPickerHost.classList.remove('is-in-graph');
        memberRolesPickerHost.style.left = '';
        memberRolesPickerHost.style.top = '';
        memberRolesPickerHost.style.width = '';
        if (tgEditor.hidden) tgFrame.style.minHeight = '';
        return;
      }
      if (memberRolesPickerHost.parentNode !== tgFrame) tgFrame.appendChild(memberRolesPickerHost);
      memberRolesPickerHost.classList.add('is-in-graph');
      var hostW = tgHost.clientWidth || 320;
      var w = Math.min(280, hostW);
      memberRolesPickerHost.style.width = w + 'px';
      var left = tgStage.offsetLeft + tgPan.x + box.x * tgScale;
      memberRolesPickerHost.style.left = Math.max(0, Math.min(left, hostW - w)) + 'px';
      var top = Math.max(0, Math.round(tgPan.y + (box.y + box.h) * tgScale + 6));
      memberRolesPickerHost.style.top = top + 'px';
      tgFrame.style.minHeight = top + memberRolesPickerHost.offsetHeight + 8 + 'px';
    }

    // Drag the background to move around the map; double-click recentres it.
    // Middle button pans from anywhere (also over nodes / wires), like Miro or Figma.
    tgFrame.addEventListener('mousedown', function (event) {
      if (event.button === 1 && !event.target.closest('.tg-editor, .tg-create, .info-member-roles-picker-host')) {
        event.preventDefault(); // no Windows autoscroll cursor
      }
    });
    tgFrame.addEventListener('auxclick', function (event) {
      if (event.button === 1) event.preventDefault();
    });
    tgFrame.addEventListener('pointerdown', function (event) {
      var middle = event.button === 1;
      if (event.button != null && event.button !== 0 && !middle) return;
      if (middle) {
        if (event.target.closest('.tg-editor, .tg-create, .info-member-roles-picker-host')) return;
        event.preventDefault();
      } else if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-collapse, .tg-zoom-btn, .tg-resize, .tg-wire-hit, .info-member-roles-picker-host')) {
        return;
      }
      var startX = event.clientX;
      var startY = event.clientY;
      var baseX = tgPan.x;
      var baseY = tgPan.y;
      var moved = false;
      try {
        tgFrame.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
      var move = function (e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        tgHost.classList.add('is-panning');
        var hostW = tgHost.clientWidth || 320;
        var frameH = tgFrame.clientHeight || 200;
        var sw = (tgLayout ? tgLayout.width : 0) * tgScale;
        var sh = (tgLayout ? tgLayout.height : 0) * tgScale;
        var margin = 48;
        var minX = margin - sw;
        var maxX = hostW - margin;
        tgPan.x = Math.round(Math.max(minX, Math.min(maxX, baseX + dx)));
        tgPan.y = Math.round(Math.max(margin - sh, Math.min(frameH - margin, baseY + dy)));
        tgApplyTransform();
      };
      var end = function () {
        tgFrame.removeEventListener('pointermove', move);
        tgFrame.removeEventListener('pointerup', end);
        tgFrame.removeEventListener('pointercancel', end);
        tgHost.classList.remove('is-panning');
      };
      tgFrame.addEventListener('pointermove', move);
      tgFrame.addEventListener('pointerup', end);
      tgFrame.addEventListener('pointercancel', end);
    });
    tgFrame.addEventListener('dblclick', function (event) {
      if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-create, .tg-collapse, .tg-zoom-btn, .tg-resize, .info-member-roles-picker-host, button, input')) return;
      tgOpenCreatePerson(tgStagePoint(event));
    });

    // Right-click on the map: create a person right where the click happened,
    // add someone who already exists, recentre. On a node: roles / remove.
    function tgOpenCreatePerson(pt) {
      if (!onCustomAssigneesChange) return;
      tgCloseEditor();
      tgCreate.replaceChildren();
      tgCreate.hidden = false;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'tg-editor-label';
      input.maxLength = MAX_CUSTOM_ASSIGNEE_NAME_LEN;
      input.placeholder = 'Nom de la nouvelle personne';
      input.setAttribute('aria-label', 'Nom de la nouvelle personne');
      tgCreate.appendChild(input);
      var busy = false;
      var submit = function () {
        var name = input.value.trim();
        if (!name || busy) return;
        busy = true;
        input.disabled = true;
        Promise.resolve(tgCreatePerson(name)).then(function (id) {
          tgCloseCreate();
          if (!id) return;
          tgPositions[id] = { x: tgSnap(pt.x), y: tgSnap(pt.y) };
          tgSavePositions();
          renderTeamGraph();
        });
      };
      input.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          tgCloseCreate();
        }
      });
      var hostW = tgHost.clientWidth || 320;
      var w = 256;
      var left = Math.max(0, Math.min(tgStage.offsetLeft + tgPan.x + pt.x * tgScale, hostW - w));
      var top = Math.max(0, Math.round(tgPan.y + pt.y * tgScale));
      tgCreate.style.left = left + 'px';
      tgCreate.style.top = top + 'px';
      tgFrame.style.minHeight = top + tgCreate.offsetHeight + 8 + 'px';
      onLayoutChange();
      setTimeout(function () {
        try {
          input.focus();
        } catch (err) {
          /* ignore */
        }
      }, 0);
    }

    function tgResetView() {
      tgPan.x = 0;
      tgPan.y = 0;
      tgZoomMul = 1;
      tgScale = Math.max(0.25, tgFit);
      tgApplyTransform();
    }

    function tgMenuItems(event) {
      var target = event && event.target;
      var closest = function (sel) {
        return target && target.closest ? target.closest(sel) : null;
      };
      if (closest('.tg-editor, .tg-create, .info-member-roles-picker-host, .tg-zoom-btn, .tg-resize, .tg-collapse')) {
        return [];
      }
      var pt = tgStagePoint(event);
      var items = [];

      var nodeEl = closest('.tg-node');
      var nodeId = nodeEl ? nodeEl.getAttribute('data-id') : '';
      var member = null;
      if (nodeId) {
        var all = displayAssignees();
        for (var i = 0; i < all.length; i++) {
          if (String(all[i].id) === nodeId) member = all[i];
        }
      }
      if (member) {
        var name = memberDisplayName(member) || 'Membre';
        var isCustom = !!member.custom || isCustomAssigneeId(nodeId);
        if (onMemberRolesChange) {
          items.push({
            id: 'edit-roles',
            label: 'Définir les rôles de ' + name + '…',
            disabled: memberRolesBusy,
            action: function () {
              toggleMemberRolesPicker(nodeId);
            }
          });
        }
        if ((isCustom && onCustomAssigneesChange) || (!isCustom && onMemberRemove)) {
          items.push({
            id: 'remove-person',
            label: 'Retirer ' + name + ' de la carte',
            danger: true,
            disabled: membersBusy || memberRolesBusy,
            action: function () {
              removeMemberFromCard(member);
            }
          });
        }
        if (tgPositions[nodeId]) {
          items.push({
            id: 'reset-node',
            icon: 'arrow-back-up',
            group: 'Affichage',
            label: 'Replacer ' + name + ' automatiquement',
            action: function () {
              delete tgPositions[nodeId];
              tgSavePositions();
              renderTeamGraph();
            }
          });
        }
      }

      if (onCustomAssigneesChange) {
        items.push({
          id: 'create-person',
          label: 'Créer une personne…',
          keywords: 'nouvelle personne assigné ajouter nom',
          action: function () {
            tgOpenCreatePerson(pt);
          }
        });
      }

      var existing = [];
      if (onCustomAssigneesChange) {
        availableCatalogAssignees().forEach(function (entry) {
          var display = customAssigneeToMember(entry, boardMembers);
          existing.push({
            id: 'add-person:' + entry.id,
            icon: 'user',
            label: (display && memberDisplayName(display)) || entry.name || 'Personne',
            action: function () {
              Promise.resolve(addCatalogAssigneeFromPicker(entry)).then(function () {
                if (selectedMemberIds()[String(entry.id)]) {
                  tgPositions[String(entry.id)] = { x: tgSnap(pt.x), y: tgSnap(pt.y) };
                  tgSavePositions();
                  renderTeamGraph();
                }
              });
            }
          });
        });
      }
      if (onMemberAdd) {
        availableBoardMembers().forEach(function (m) {
          existing.push({
            id: 'add-person:' + m.id,
            icon: 'brand-trello',
            label: memberDisplayName(m) || 'Membre',
            action: function () {
              Promise.resolve(addMemberFromPicker(m)).then(function () {
                if (selectedMemberIds()[String(m.id)]) {
                  tgPositions[String(m.id)] = { x: tgSnap(pt.x), y: tgSnap(pt.y) };
                  tgSavePositions();
                  renderTeamGraph();
                }
              });
            }
          });
        });
      }
      if (existing.length) {
        items.push({
          id: 'add-existing',
          icon: 'users-plus',
          group: 'Créer',
          label: 'Ajouter une personne existante',
          keywords: 'membre tableau catalogue',
          children: existing
        });
      }

      items.push({
        id: 'fit-view',
        label: 'Recentrer la vue',
        action: tgResetView
      });
      if (Object.keys(tgPositions).length) {
        items.push({
          id: 'reset-layout',
          label: 'Réorganiser automatiquement',
          action: function () {
            tgPositions = {};
            tgSavePositions();
            tgResetView();
            renderTeamGraph();
          }
        });
      }
      return items;
    }

    if (global.ContextMenu && typeof global.ContextMenu.bind === 'function') {
      global.ContextMenu.bind(tgFrame, tgMenuItems);
    }

    function setTgExpanded(next) {
      next = !!next;
      if (tgExpanded === next) return;
      tgExpanded = next;
      membersEl.hidden = tgExpanded;
      if (!tgExpanded) {
        tgPan.x = 0;
        tgPan.y = 0;
        tgZoomMul = 1;
        tgSetPending(null);
        tgCloseEditor();
        tgCloseCreate();
      }
      renderTeamGraph();
      onLayoutChange();
    }
    tgCollapseBtn.addEventListener('click', function (event) {
      event.preventDefault();
      setTgExpanded(false);
    });

    function tgSvg(tag, attrs) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs || {}).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
      return node;
    }

    function tgHue(id) {
      var h = 0;
      for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
      return h;
    }

    function tgPersonName(id) {
      var all = displayAssignees();
      for (var i = 0; i < all.length; i++) {
        if (String(all[i].id) === id) return memberDisplayName(all[i]) || 'Membre';
      }
      return 'Membre';
    }

    function tgVisibleLinks(ids) {
      return normalizeTeamLinks(teamLinks, ids);
    }

    function persistTeamLinks(next, silent) {
      teamLinks = normalizeTeamLinks(next);
      if (!silent) {
        renderTeamGraph();
        onLayoutChange();
      }
      if (!onTeamLinksChange) return Promise.resolve({ ok: true, changed: false });
      return Promise.resolve(onTeamLinksChange(teamLinks)).catch(function (err) {
        console.error('Info team links save failed', err);
        setMembersStatus('Échec de l’enregistrement', 'error');
      });
    }

    function tgCloseEditor() {
      if (!tgSelectedKey && tgEditor.hidden) return;
      tgSelectedKey = '';
      tgEditor.hidden = true;
      tgEditor.replaceChildren();
      tgFrame.style.minHeight = '';
      onLayoutChange();
      tgStage.querySelectorAll('.tg-wire-group.is-selected').forEach(function (g) {
        g.classList.remove('is-selected');
      });
    }

    function tgSetPending(next) {
      tgPending = next;
      tgHost.classList.toggle('is-linking', !!next);
      tgHint.textContent = next
        ? ''
        : tgDefaultHint();
      tgStage.querySelectorAll('.tg-node').forEach(function (n) {
        n.classList.toggle(
          'is-link-source',
          !!next && n.getAttribute('data-id') === next.from
        );
      });
    }

    function tgDefaultHint() {
      return '';
    }

    function tgCommitLink(from, to, kind) {
      if (!onTeamLinksChange || !from || !to || from === to) return;
      var next = connectTeamPeople(teamLinks, from, to, kind);
      tgSelectedKey = teamLinkPairKey(from, to);
      persistTeamLinks(next);
    }

    function tgOpenEditor(link, mx, my) {
      tgCloseCreate();
      tgSelectedKey = teamLinkPairKey(link.from, link.to);
      tgEditor.replaceChildren();
      tgEditor.hidden = false;

      var title = document.createElement('div');
      title.className = 'tg-editor-title';
      var sentence = document.createElement('span');
      var meta = TG_KIND_META[link.kind];
      var who = document.createElement('strong');
      who.textContent = tgPersonName(link.from);
      var whom = document.createElement('strong');
      whom.textContent = tgPersonName(link.to);
      sentence.appendChild(who);
      sentence.appendChild(document.createTextNode(' ' + meta.verb + ' '));
      sentence.appendChild(whom);
      title.appendChild(sentence);
      tgEditor.appendChild(title);

      var seg = document.createElement('div');
      seg.className = 'tg-editor-seg';
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Type de relation');
      ['asks', 'flow', 'both'].forEach(function (kind) {
        var m = TG_KIND_META[kind];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tg-editor-seg-btn tg-kind-' + kind + (link.kind === kind ? ' is-on' : '');
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', link.kind === kind ? 'true' : 'false');
        btn.innerHTML = '<i class="ti ' + m.icon + '" aria-hidden="true"></i>';
        var span = document.createElement('span');
        span.textContent = m.label;
        btn.appendChild(span);
        btn.addEventListener('click', function () {
          if (!onTeamLinksChange || link.kind === kind) return;
          var updated = { from: link.from, to: link.to, kind: kind };
          if (link.label) updated.label = link.label;
          persistTeamLinks(upsertTeamLink(teamLinks, updated));
        });
        seg.appendChild(btn);
      });
      tgEditor.appendChild(seg);

      var labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'tg-editor-label';
      labelInput.maxLength = MAX_TEAM_LINK_LABEL;
      labelInput.placeholder = 'Précision (ex. montage, sous-titres…)';
      labelInput.value = link.label || '';
      labelInput.setAttribute('aria-label', 'Précision sur la relation');
      labelInput.disabled = !onTeamLinksChange;
      var commitLabel = function (silent) {
        var value = labelInput.value.trim();
        if (value === (link.label || '')) return;
        var updated = { from: link.from, to: link.to, kind: link.kind };
        if (value) updated.label = value;
        link.label = value;
        persistTeamLinks(upsertTeamLink(teamLinks, updated), silent);
      };
      labelInput.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commitLabel(false);
          tgCloseEditor();
        } else if (event.key === 'Escape') {
          tgCloseEditor();
        }
      });
      labelInput.addEventListener('blur', function () {
        // Silent: re-rendering here would swallow the click that caused the blur.
        commitLabel(true);
      });
      tgEditor.appendChild(labelInput);

      var actions = document.createElement('div');
      actions.className = 'tg-editor-actions';
      var swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'tg-editor-action';
      swap.innerHTML = '<i class="ti ti-switch-horizontal" aria-hidden="true"></i>';
      swap.appendChild(document.createTextNode(' Inverser'));
      swap.title = 'Inverser le sens';
      swap.disabled = !onTeamLinksChange || link.kind === 'both';
      swap.addEventListener('click', function () {
        var updated = { from: link.to, to: link.from, kind: link.kind };
        if (link.label) updated.label = link.label;
        persistTeamLinks(upsertTeamLink(teamLinks, updated));
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'tg-editor-action is-danger';
      del.innerHTML = '<i class="ti ti-trash" aria-hidden="true"></i>';
      del.appendChild(document.createTextNode(' Supprimer'));
      del.disabled = !onTeamLinksChange;
      del.addEventListener('click', function () {
        tgSelectedKey = '';
        persistTeamLinks(removeTeamLink(teamLinks, link.from, link.to));
      });
      actions.appendChild(swap);
      actions.appendChild(del);
      tgEditor.appendChild(actions);

      var hostW = tgHost.clientWidth || 320;
      var edW = 256;
      var left = tgStage.offsetLeft + tgPan.x + mx * tgScale - edW / 2;
      left = Math.max(0, Math.min(left, hostW - edW));
      tgEditor.style.left = left + 'px';
      var edTop = Math.max(0, Math.round(tgPan.y + my * tgScale + 16));
      tgEditor.style.top = edTop + 'px';
      // Reserve room so the iframe grows instead of clipping the editor.
      tgFrame.style.minHeight = edTop + tgEditor.offsetHeight + 8 + 'px';
      onLayoutChange();
      tgStage.querySelectorAll('.tg-wire-group').forEach(function (g) {
        g.classList.toggle(
          'is-selected',
          g.getAttribute('data-key') === tgSelectedKey
        );
      });
    }

    function tgBuildNode(member) {
      var mid = String(member.id);
      var name = memberDisplayName(member) || 'Membre';
      var isCustom = !!member.custom || isCustomAssigneeId(mid);
      var node = document.createElement('div');
      node.className = 'tg-node' + (isCustom ? ' is-custom' : '');
      node.setAttribute('data-id', mid);
      node.style.width = TG_NODE_W + 'px';
      if (tgPending && tgPending.from === mid) node.classList.add('is-link-source');
      node.style.setProperty('--tg-hue', String(tgHue(mid)));
      node.setAttribute('aria-label', name);

      var head = document.createElement('div');
      head.className = 'tg-node-head';
      appendMemberAvatar(head, member);
      var nameEl = document.createElement('span');
      nameEl.className = 'tg-node-name';
      nameEl.textContent = name;
      nameEl.title = name + (isCustom ? ' (hors Trello)' : '');
      head.appendChild(nameEl);

      var canRemove =
        (isCustom && !!onCustomAssigneesChange) || (!isCustom && !!onMemberRemove);
      if (canRemove) {
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'tg-node-clear';
        clearBtn.setAttribute('aria-label', 'Retirer : ' + name);
        clearBtn.textContent = '×';
        clearBtn.disabled = membersBusy || memberRolesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          removeMemberFromCard(member);
        });
        head.appendChild(clearBtn);
      }
      node.appendChild(head);

      var body = document.createElement('div');
      body.className = 'tg-node-roles';
      rolesForMember(mid).forEach(function (roleId) {
        var entry = getMemberRoleEntry(roleId);
        var label = (entry && entry.label) || roleId;
        var chip = document.createElement('span');
        chip.className = 'tg-role';
        chip.title = label;
        var icon = document.createElement('i');
        icon.className = 'ti ti-' + ((entry && entry.icon) || 'tag');
        icon.setAttribute('aria-hidden', 'true');
        var text = document.createElement('span');
        text.textContent = label;
        chip.appendChild(icon);
        chip.appendChild(text);
        if (onMemberRolesChange) {
          var x = document.createElement('button');
          x.type = 'button';
          x.className = 'tg-role-clear';
          x.setAttribute('aria-label', 'Retirer le rôle ' + label);
          x.textContent = '×';
          x.disabled = memberRolesBusy;
          x.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            removeRoleFromMember(mid, roleId);
          });
          chip.appendChild(x);
        }
        body.appendChild(chip);
      });
      if (onMemberRolesChange) {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'tg-role-add' + (memberRolesPickerMemberId === mid ? ' is-open' : '');
        add.title = 'Définir les rôles';
        add.setAttribute('aria-label', 'Définir les rôles de ' + name);
        add.setAttribute('aria-expanded', memberRolesPickerMemberId === mid ? 'true' : 'false');
        add.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
        if (!rolesForMember(mid).length) {
          var addText = document.createElement('span');
          addText.textContent = 'Rôle';
          add.appendChild(addText);
        }
        add.disabled = memberRolesBusy;
        add.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          toggleMemberRolesPicker(mid);
        });
        body.appendChild(add);
      }
      if (body.childNodes.length) node.appendChild(body);

      // Edges: hover a side to reveal its handle, then drag from it.
      //   bottom = "demande a", right = "enchaine vers"  (this person is the source)
      //   top / left = same relations, but this person is the target ("recoit de")
      if (onTeamLinksChange) {
        [
          { side: 'top', kind: 'asks', reverse: true, label: 'Relier quelqu’un qui te demande' },
          { side: 'left', kind: 'flow', reverse: true, label: 'Relier quelqu’un qui t’enchaîne' },
          { side: 'bottom', kind: 'asks', reverse: false, label: 'Demander à quelqu’un' },
          { side: 'right', kind: 'flow', reverse: false, label: 'Enchaîner vers quelqu’un' }
        ].forEach(function (def) {
          var edge = document.createElement('div');
          edge.className = 'tg-edge tg-edge-' + def.side + ' tg-kind-' + def.kind;
          edge.setAttribute('role', 'button');
          edge.tabIndex = 0;
          edge.setAttribute('data-kind', def.kind);
          edge.setAttribute('aria-label', name + ' : ' + def.label);
          edge.title = def.label;
          var dot = document.createElement('span');
          dot.className = 'tg-pin';
          dot.setAttribute('aria-hidden', 'true');
          edge.appendChild(dot);
          edge.addEventListener('pointerdown', function (event) {
            tgStartDrag(event, edge, mid, def.side, def.kind, def.reverse);
          });
          edge.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              tgSetPending({ from: mid, kind: def.kind, reverse: def.reverse });
            }
          });
          node.appendChild(edge);
        });
      }

      node.addEventListener('pointerdown', function (event) {
        if (event.button != null && event.button !== 0) return;
        if (tgPending || tgMoving) return;
        if (event.target.closest('.tg-node-clear, .tg-role-clear, .tg-role-add, .tg-edge, .tg-role')) return;
        var box = tgLayout && tgLayout.nodes[mid];
        if (!box) return;
        tgMoving = { id: mid, sx: event.clientX, sy: event.clientY, x0: box.x, y0: box.y, moved: false, raf: 0, pid: event.pointerId };
        try {
          tgFrame.setPointerCapture(event.pointerId);
        } catch (err) {
          /* optional */
        }
      });
      node.addEventListener('click', function (event) {
        if (!tgPending) return;
        if (event.target.closest('.tg-node-clear, .tg-role-clear, .tg-role-add, .tg-edge')) return;
        event.preventDefault();
        var pending = tgPending;
        tgSetPending(null);
        if (pending.from !== mid) {
          if (pending.reverse) tgCommitLink(mid, pending.from, pending.kind);
          else tgCommitLink(pending.from, mid, pending.kind);
        }
      });
      return node;
    }

    function tgStagePoint(event) {
      var rect = tgStage.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / tgScale,
        y: (event.clientY - rect.top) / tgScale
      };
    }

    var TG_SIDE_DIR = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

    function tgCloseCreate() {
      if (tgCreate.hidden) return;
      tgCreate.hidden = true;
      tgCreate.replaceChildren();
      if (tgEditor.hidden) tgFrame.style.minHeight = '';
      onLayoutChange();
    }

    // Find (or create) the person a link should point at.
    function tgCreatePerson(rawName) {
      var name = String(rawName || '').trim();
      if (!name || membersBusy || !onCustomAssigneesChange) return Promise.resolve('');
      var key = name.toLocaleLowerCase('fr-FR');
      var all = displayAssignees();
      for (var i = 0; i < all.length; i++) {
        var existing = (memberDisplayName(all[i]) || '').toLocaleLowerCase('fr-FR');
        if (existing === key) return Promise.resolve(String(all[i].id));
      }
      var hit = findCustomAssigneeCatalogByName(name);
      var draft = hit
        ? normalizeCustomAssigneeEntry({
            id: hit.id,
            name: hit.name,
            trelloMemberId: hit.trelloMemberId || ''
          })
        : createCustomAssignee({ name: name, trelloMemberId: '' });
      if (!draft) {
        setMembersStatus('Nom invalide', 'error');
        return Promise.resolve('');
      }
      var before = getCustomAssigneeCatalog();
      var upserted = upsertCustomAssigneeCatalog(draft);
      if (!upserted) {
        setMembersStatus('Catalogue plein', 'error');
        return Promise.resolve('');
      }
      draft = upserted;
      var after = getCustomAssigneeCatalog();
      var saved =
        JSON.stringify(before) !== JSON.stringify(after)
          ? persistCustomAssigneeCatalog(after)
          : Promise.resolve({ ok: true });
      return Promise.resolve(saved).then(function (result) {
        if (result && result.ok === false) return '';
        return Promise.resolve(persistCustomAssignees(customAssignees.concat([draft]))).then(
          function () {
            return String(draft.id);
          }
        );
      });
    }

    // Released a handle off any card: ask who to link (card people, board
    // members, saved off-Trello people, or a brand-new name).
    function tgOpenPicker(pt, fromId, kind, reverse) {
      tgCloseEditor();
      tgCreate.replaceChildren();
      tgCreate.hidden = false;

      var finish = function (idPromise) {
        Promise.resolve(idPromise).then(function (id) {
          tgCloseCreate();
          if (!id || id === fromId) return;
          if (reverse) tgCommitLink(id, fromId, kind);
          else tgCommitLink(fromId, id, kind);
        });
      };

      // One flat, ranked list: people already on the card, then saved people,
      // then board members. Only a few show up front; typing searches them all.
      var candidates = [];
      displayAssignees().forEach(function (m) {
        if (String(m.id) === fromId) return;
        candidates.push({
          member: m,
          name: memberDisplayName(m) || 'Membre',
          pick: function () {
            return Promise.resolve(String(m.id));
          }
        });
      });
      if (onCustomAssigneesChange) {
        availableCatalogAssignees().forEach(function (entry) {
          var display = customAssigneeToMember(entry, boardMembers);
          candidates.push({
            member: display,
            name: (display && memberDisplayName(display)) || entry.name || 'Personne',
            pick: function () {
              return Promise.resolve(addCatalogAssigneeFromPicker(entry)).then(function () {
                return selectedMemberIds()[String(entry.id)] ? String(entry.id) : '';
              });
            }
          });
        });
      }
      if (onMemberAdd) {
        availableBoardMembers().forEach(function (m) {
          candidates.push({
            member: m,
            name: memberDisplayName(m) || 'Membre',
            pick: function () {
              return Promise.resolve(addMemberFromPicker(m)).then(function () {
                return selectedMemberIds()[String(m.id)] ? String(m.id) : '';
              });
            }
          });
        });
      }

      var TG_PICK_SHOWN = 4;
      var tgFold = function (s) {
        return String(s || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase();
      };

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'tg-editor-label';
      input.maxLength = MAX_CUSTOM_ASSIGNEE_NAME_LEN;
      input.placeholder = onCustomAssigneesChange
        ? 'Relier à… (chercher ou créer)'
        : 'Relier à… (chercher)';
      input.setAttribute('aria-label', 'Relier ' + tgPersonName(fromId) + ' à');
      tgCreate.appendChild(input);

      var list = document.createElement('div');
      list.className = 'tg-pick-list';
      tgCreate.appendChild(list);

      var visible = [];
      var render = function () {
        var raw = input.value.trim();
        var q = tgFold(raw);
        visible = q
          ? candidates.filter(function (c) {
              return tgFold(c.name).indexOf(q) !== -1;
            })
          : candidates.slice();
        visible = visible.slice(0, q ? 6 : TG_PICK_SHOWN);
        if (
          raw &&
          onCustomAssigneesChange &&
          !candidates.some(function (c) {
            return tgFold(c.name) === q;
          })
        ) {
          visible.push({
            create: true,
            name: 'Créer « ' + raw + ' »',
            pick: function () {
              return tgCreatePerson(raw);
            }
          });
        }
        list.replaceChildren();
        visible.forEach(function (item, i) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tg-pick-option' + (i === 0 ? ' is-active' : '');
          if (item.member) appendMemberAvatar(btn, item.member);
          var text = document.createElement('span');
          text.textContent = item.name;
          btn.appendChild(text);
          btn.addEventListener('click', function () {
            list.querySelectorAll('button').forEach(function (b) {
              b.disabled = true;
            });
            finish(item.pick());
          });
          list.appendChild(btn);
        });
        list.hidden = !visible.length;
      };
      var choose = function () {
        var first = list.querySelector('.tg-pick-option');
        if (first) first.click();
      };
      input.addEventListener('input', render);
      input.addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          choose();
        } else if (event.key === 'Escape') {
          tgCloseCreate();
        }
      });
      render();

      var hostW = tgHost.clientWidth || 320;
      var w = 256;
      var left = tgStage.offsetLeft + tgPan.x + pt.x * tgScale - w / 2;
      left = Math.max(0, Math.min(left, hostW - w));
      var top = Math.max(0, Math.round(tgPan.y + pt.y * tgScale + 12));
      tgCreate.style.left = left + 'px';
      tgCreate.style.top = top + 'px';
      tgFrame.style.minHeight = top + tgCreate.offsetHeight + 8 + 'px';
      onLayoutChange();
      setTimeout(function () {
        try {
          if (input) input.focus();
        } catch (err) {
          /* ignore */
        }
      }, 0);
    }

    function tgStartDrag(event, edge, fromId, side, kind, reverse) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      tgCloseEditor();
      tgCloseCreate();
      var box = tgLayout && tgLayout.nodes[fromId];
      if (!box) return;
      var dir = TG_SIDE_DIR[side];
      var start =
        side === 'top'
          ? { x: box.x + box.w / 2, y: box.y }
          : side === 'bottom'
            ? { x: box.x + box.w / 2, y: box.y + box.h }
            : side === 'left'
              ? { x: box.x, y: box.y + box.h / 2 }
              : { x: box.x + box.w, y: box.y + box.h / 2 };
      var temp = tgSvg('path', { class: 'tg-wire-temp tg-kind-' + kind });
      tgWires.appendChild(temp);
      tgDrag = {
        from: fromId,
        kind: kind,
        moved: false,
        sx: event.clientX,
        sy: event.clientY,
        target: '',
        last: start
      };
      tgHost.classList.add('is-dragging');
      try {
        edge.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      var move = function (e) {
        if (!tgDrag) return;
        if (Math.abs(e.clientX - tgDrag.sx) + Math.abs(e.clientY - tgDrag.sy) > 5) {
          tgDrag.moved = true;
        }
        var p = tgStagePoint(e);
        tgDrag.last = p;
        var d = Math.max(
          24,
          (Math.abs(p.x - start.x) * Math.abs(dir[0]) +
            Math.abs(p.y - start.y) * Math.abs(dir[1])) / 2
        );
        temp.setAttribute(
          'd',
          'M' + start.x + ' ' + start.y +
            ' C' + (start.x + dir[0] * d) + ' ' + (start.y + dir[1] * d) +
            ' ' + (p.x - dir[0] * d) + ' ' + (p.y - dir[1] * d) +
            ' ' + p.x + ' ' + p.y
        );
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var nodeEl = under && under.closest ? under.closest('.tg-node') : null;
        var targetId = nodeEl ? nodeEl.getAttribute('data-id') : '';
        if (targetId === fromId) targetId = '';
        tgDrag.target = targetId;
        tgStage.querySelectorAll('.tg-node').forEach(function (n) {
          n.classList.toggle('is-drop-target', !!targetId && n.getAttribute('data-id') === targetId);
        });
      };
      var cleanup = function () {
        edge.removeEventListener('pointermove', move);
        edge.removeEventListener('pointerup', done);
        edge.removeEventListener('pointercancel', cancel);
        tgHost.classList.remove('is-dragging');
        temp.remove();
        tgStage.querySelectorAll('.tg-node.is-drop-target').forEach(function (n) {
          n.classList.remove('is-drop-target');
        });
      };
      var done = function () {
        var drag = tgDrag;
        tgDrag = null;
        cleanup();
        if (!drag) return;
        if (!drag.moved) {
          var same =
            tgPending &&
            tgPending.from === fromId &&
            tgPending.kind === kind &&
            !!tgPending.reverse === !!reverse;
          tgSetPending(same ? null : { from: fromId, kind: kind, reverse: !!reverse });
          return;
        }
        if (drag.target) {
          if (reverse) tgCommitLink(drag.target, fromId, kind);
          else tgCommitLink(fromId, drag.target, kind);
        } else {
          tgIgnoreClickUntil = Date.now() + 400;
          tgOpenPicker(drag.last, fromId, kind, !!reverse);
        }
      };
      var cancel = function () {
        tgDrag = null;
        cleanup();
      };
      edge.addEventListener('pointermove', move);
      edge.addEventListener('pointerup', done);
      edge.addEventListener('pointercancel', cancel);
    }

    function renderTeamGraph() {
      if (tgDrag) return;
      var display = displayAssignees();
      var ids = display.map(function (m) {
        return String(m.id);
      });
      tgHost.hidden = !display.length || !tgExpanded;
      if (tgHost.hidden) {
        tgCloseEditor();
        tgCloseCreate();
        return;
      }
      tgNodes.replaceChildren();
      tgWires.replaceChildren();
      tgPills.replaceChildren();
      if (!display.length) {
        tgCloseEditor();
        return;
      }

      // Measure nodes at their natural height, then lay them out.
      display.forEach(function (member) {
        tgNodes.appendChild(tgBuildNode(member));
      });
      var heights = Object.create(null);
      tgNodes.querySelectorAll('.tg-node').forEach(function (n) {
        heights[n.getAttribute('data-id')] = n.offsetHeight;
      });
      var links = tgVisibleLinks(ids);
      var layout = layoutTeamGraph(ids, links, {
        nodeW: TG_NODE_W,
        hgap: 84,
        vgap: 60,
        heights: heights,
        defaultH: 72
      });
      var hasArc = links.some(function (l) {
        var a = layout.nodes[l.from];
        var b = layout.nodes[l.to];
        return a && b && a.row === b.row && Math.abs(a.col - b.col) > 1;
      });
      var padTop = hasArc ? 72 : TG_PAD;
      Object.keys(layout.nodes).forEach(function (id) {
        var p = tgPositions[id];
        if (p && isFinite(p.x) && isFinite(p.y)) {
          layout.nodes[id].x = p.x - TG_PAD;
          layout.nodes[id].y = p.y - padTop;
        }
      });
      var stageW = layout.width + TG_PAD * 2;
      var stageH = layout.height + padTop + TG_PAD;
      tgNodes.querySelectorAll('.tg-node').forEach(function (n) {
        var box = layout.nodes[n.getAttribute('data-id')];
        if (!box) return;
        n.style.left = box.x + TG_PAD + 'px';
        n.style.top = box.y + padTop + 'px';
      });
      // Shift boxes into stage space for wires / pins.
      var shifted = Object.create(null);
      Object.keys(layout.nodes).forEach(function (id) {
        var b = layout.nodes[id];
        shifted[id] = { x: b.x + TG_PAD, y: b.y + padTop, w: b.w, h: b.h, row: b.row, col: b.col, manual: !!tgPositions[id] };
      });
      tgLayout = { nodes: shifted, width: stageW, height: stageH };

      tgStage.style.width = stageW + 'px';
      tgStage.style.height = stageH + 'px';
      tgWires.setAttribute('width', String(stageW));
      tgWires.setAttribute('height', String(stageH));
      tgWires.setAttribute('viewBox', '0 0 ' + stageW + ' ' + stageH);

      var available = tgHost.clientWidth;
      tgFit = available > 0 && stageW > available ? Math.max(0.55, available / stageW) : 1;
      tgScale = Math.max(0.25, tgFit * tgZoomMul);
      tgApplyTransform();
      tgAutoH = Math.ceil(stageH * tgFit);
      tgApplyFrameHeight();

      var defs = tgSvg('defs');
      ['asks', 'flow', 'both'].forEach(function (kind) {
        var marker = tgSvg('marker', {
          id: 'tg-arrow-' + kind + '-' + tgUid,
          viewBox: '0 0 10 10',
          refX: '9',
          refY: '5',
          markerWidth: '9',
          markerHeight: '9',
          markerUnits: 'userSpaceOnUse',
          orient: 'auto-start-reverse'
        });
        marker.appendChild(
          tgSvg('path', { d: 'M0 1 L10 5 L0 9 z', class: 'tg-arrowhead tg-kind-' + kind })
        );
        defs.appendChild(marker);
      });
      tgWires.appendChild(defs);

      links.forEach(function (link) {
        var a = shifted[link.from];
        var b = shifted[link.to];
        if (!a || !b) return;
        var route = routeTeamLink(a, b);
        var key = teamLinkPairKey(link.from, link.to);
        var group = tgSvg('g', {
          class:
            'tg-wire-group tg-kind-' + link.kind + (key === tgSelectedKey ? ' is-selected' : ''),
          'data-key': key
        });
        var arrow = 'url(#tg-arrow-' + link.kind + '-' + tgUid + ')';
        var wire = tgSvg('path', { d: route.d, class: 'tg-wire', 'marker-end': arrow });
        if (link.kind === 'both') wire.setAttribute('marker-start', arrow);
        var glow = tgSvg('path', { d: route.d, class: 'tg-wire-glow' });
        var hit = tgSvg('path', { d: route.d, class: 'tg-wire-hit' });
        group.appendChild(glow);
        group.appendChild(wire);
        group.appendChild(hit);
        tgWires.appendChild(group);

        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'tg-pill tg-kind-' + link.kind + (link.label ? ' has-label' : '');
        pill.style.left = route.mx + 'px';
        pill.style.top = route.my + 'px';
        var meta = TG_KIND_META[link.kind];
        pill.innerHTML = '<i class="ti ' + meta.icon + '" aria-hidden="true"></i>';
        if (link.label) {
          var lab = document.createElement('span');
          lab.textContent = link.label;
          pill.appendChild(lab);
        }
        pill.setAttribute(
          'aria-label',
          tgPersonName(link.from) + ' ' + meta.verb + ' ' + tgPersonName(link.to)
        );
        pill.title = 'Modifier la relation';
        var open = function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (tgSelectedKey === key && !tgEditor.hidden) {
            tgCloseEditor();
            return;
          }
          tgOpenEditor(link, route.mx + 0, route.my);
        };
        pill.addEventListener('click', open);
        hit.addEventListener('click', open);
        tgPills.appendChild(pill);
      });

      if (tgSelectedKey) {
        var selected = links.filter(function (l) {
          return teamLinkPairKey(l.from, l.to) === tgSelectedKey;
        })[0];
        if (selected) {
          var r = routeTeamLink(shifted[selected.from], shifted[selected.to]);
          tgOpenEditor(selected, r.mx, r.my);
        } else {
          tgCloseEditor();
        }
      }
      tgHint.textContent = tgPending
        ? ''
        : tgDefaultHint();
      tgHint.hidden = !tgHint.textContent;
    }

    tgHost.addEventListener('click', function (event) {
      // The click that follows releasing a handle must not dismiss the picker it just opened.
      if (Date.now() < tgIgnoreClickUntil || event.target.closest('.tg-edge')) return;
      if (
        !event.target.closest('.tg-editor') &&
        !event.target.closest('.tg-pill') &&
        !event.target.closest('.tg-wire-hit')
      ) {
        tgCloseEditor();
        tgCloseCreate();
      }
    });
    tgHost.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (tgPending) tgSetPending(null);
        tgCloseEditor();
        tgCloseCreate();
      }
    });
    if (typeof global.ResizeObserver === 'function') {
      var tgLastWidth = 0;
      new global.ResizeObserver(function () {
        var w = tgHost.clientWidth;
        if (Math.abs(w - tgLastWidth) < 2) return;
        tgLastWidth = w;
        renderTeamGraph();
        onLayoutChange();
      }).observe(tgHost);
    }

    function renderMembers() {
      membersEl.replaceChildren();
      var display = displayAssignees();

      if (display.length) {
        display.forEach(function (member) {
          var name = memberDisplayName(member) || 'Membre';
          var mid = member && member.id != null ? String(member.id) : '';
          var isCustom = !!(member && member.custom) || isCustomAssigneeId(mid);
          var chip = document.createElement('div');
          chip.className =
            'info-member' +
            (isCustom ? ' is-custom' : '') +
            (memberRolesPickerMemberId === mid ? ' is-roles-open' : '');
          chip.title = name + ' \u2014 voir les relations';
          chip.setAttribute('aria-label', name + ', voir les relations');

          var main = document.createElement('div');
          main.className = 'info-member-main';
          if (mid) {
            main.classList.add('is-clickable');
            main.setAttribute('role', 'button');
            main.tabIndex = 0;
            main.setAttribute('aria-expanded', 'false');
            main.addEventListener('click', function (event) {
              if (event.target.closest('.info-member-clear')) return;
              event.preventDefault();
              event.stopPropagation();
              setTgExpanded(true);
            });
            main.addEventListener('keydown', function (event) {
              if (event.key === 'Enter' || event.key === ' ') {
                if (event.target.closest('.info-member-clear')) return;
                event.preventDefault();
                event.stopPropagation();
                setTgExpanded(true);
              }
            });
          }

          appendMemberAvatar(main, member);

          var nameEl = document.createElement('span');
          nameEl.className = 'info-member-name';
          nameEl.textContent = name;
          main.appendChild(nameEl);

          if (isCustom) {
            var badge = document.createElement('span');
            badge.className = 'info-member-custom-badge';
            badge.textContent = 'hors Trello';
            badge.title = member.trelloMemberId
              ? 'Personne hors Trello (li\u00e9e \u00e0 un membre)'
              : 'Personne hors Trello';
            main.appendChild(badge);
          }

          var canRemove =
            (isCustom && !!onCustomAssigneesChange) ||
            (!isCustom && !!onMemberRemove);
          if (canRemove) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'info-member-clear';
            clearBtn.setAttribute(
              'aria-label',
              'Retirer\u00a0: ' + name
            );
            clearBtn.textContent = '\u00d7';
            clearBtn.disabled = membersBusy || memberRolesBusy;
            clearBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              removeMemberFromCard(member);
            });
            main.appendChild(clearBtn);
          }

          chip.appendChild(main);

          var rolesRow = document.createElement('div');
          rolesRow.className = 'info-member-roles';
          rolesRow.setAttribute('aria-label', 'R\u00f4les de ' + name);

          var roleIds = rolesForMember(mid);
          roleIds.forEach(function (roleId) {
            var entry = getMemberRoleEntry(roleId);
            var label = (entry && entry.label) || roleId;
            var roleChip = document.createElement('span');
            roleChip.className = 'info-member-role';
            roleChip.title = label;
            var roleIcon = document.createElement('i');
            roleIcon.className =
              'ti ti-' + ((entry && entry.icon) || 'tag');
            roleIcon.setAttribute('aria-hidden', 'true');
            var roleLabel = document.createElement('span');
            roleLabel.className = 'info-member-role-label';
            roleLabel.textContent = label;
            roleChip.appendChild(roleIcon);
            roleChip.appendChild(roleLabel);
            if (onMemberRolesChange) {
              var roleClear = document.createElement('button');
              roleClear.type = 'button';
              roleClear.className = 'info-member-role-clear';
              roleClear.setAttribute('aria-label', 'Retirer le r\u00f4le ' + label);
              roleClear.textContent = '\u00d7';
              roleClear.disabled = memberRolesBusy;
              roleClear.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                removeRoleFromMember(mid, roleId);
              });
              roleChip.appendChild(roleClear);
            }
            rolesRow.appendChild(roleChip);
          });

          if (onMemberRolesChange && mid) {
            var addRoleBtn = document.createElement('button');
            addRoleBtn.type = 'button';
            addRoleBtn.className = 'info-member-role-add';
            addRoleBtn.setAttribute('aria-label', 'D\u00e9finir les r\u00f4les de ' + name);
            addRoleBtn.title = 'D\u00e9finir les r\u00f4les';
            addRoleBtn.setAttribute(
              'aria-expanded',
              memberRolesPickerMemberId === mid ? 'true' : 'false'
            );
            addRoleBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
            addRoleBtn.disabled = memberRolesBusy;
            addRoleBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              toggleMemberRolesPicker(mid);
            });
            rolesRow.appendChild(addRoleBtn);
          }

          if (rolesRow.childNodes.length) {
            chip.appendChild(rolesRow);
          }

          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function' &&
            typeof global.ContextMenu.buildInfoChipItems === 'function'
          ) {
            ContextMenu.bind(chip, function () {
              return ContextMenu.buildInfoChipItems({
                kind: 'member',
                onEditRoles:
                  onMemberRolesChange && mid
                    ? function () {
                        toggleMemberRolesPicker(mid);
                      }
                    : null,
                onRemove: canRemove
                  ? function () {
                      removeMemberFromCard(member);
                    }
                  : null,
              });
            });
          }

          membersEl.appendChild(chip);
        });
      }

      renderTeamGraph();
      var canAdd = !!onMemberAdd || !!onCustomAssigneesChange;
      membersAddBtn.hidden = !canAdd;
      membersAddBtn.disabled = membersBusy || !canAdd || memberRolesBusy;
      if (membersPickerOpen) renderMembersPicker();
      if (memberRolesPickerMemberId) {
        if (!selectedMemberIds()[memberRolesPickerMemberId]) {
          setMemberRolesPickerOpen('');
        } else {
          renderMemberRolesPicker(memberRolesPickerMemberId);
        }
      }
      renderCreator();
    }

    function addMemberFromPicker(member) {
      if (!onMemberAdd || membersBusy || !member || !member.id) return;
      var id = String(member.id);
      if (selectedMemberIds()[id]) return;
      membersBusy = true;
      setMembersStatus('', 'saving');
      renderMembers();
      return Promise.resolve(onMemberAdd(member))
        .then(function (result) {
          membersBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setMembersStatus('', 'error');
            } else {
              setMembersStatus('\u00c9chec de l\u2019ajout', 'error');
            }
            renderMembers();
            onLayoutChange();
            return result;
          }
          if (!selectedMemberIds()[id]) {
            members = members.concat([
              {
                id: member.id,
                fullName:
                  typeof member.fullName === 'string' ? member.fullName : '',
                username:
                  typeof member.username === 'string' ? member.username : '',
                initials:
                  typeof member.initials === 'string' ? member.initials : '',
                avatar:
                  typeof member.avatar === 'string' ? member.avatar : '',
                avatarUrl:
                  typeof member.avatarUrl === 'string' ? member.avatarUrl : '',
                avatarHash:
                  typeof member.avatarHash === 'string' ? member.avatarHash : ''
              }
            ]);
          }
          setAuthHint('');
          setMembersStatus('', 'ok');
          setMembersPickerOpen(false);
          renderMembers();
          setTimeout(function () {
            if (membersStatus.classList.contains('is-ok')) {
              setMembersStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          membersBusy = false;
          console.error('Info member add failed', err);
          setMembersStatus('\u00c9chec de l\u2019ajout', 'error');
          renderMembers();
          onLayoutChange();
        });
    }

    function clearRolesForMemberId(id) {
      if (!memberRoles[id]) return;
      var nextMap = removeMemberFromRoles(memberRoles, id);
      memberRoles = nextMap;
      if (onMemberRolesChange) {
        var customs = pruneMemberRoleCustoms(getMemberRoleCustoms(), nextMap);
        setMemberRoleCustoms(customs);
        Promise.resolve(onMemberRolesChange(nextMap, customs)).catch(
          function (err) {
            console.error('Info member roles cleanup failed', err);
          }
        );
      }
    }

    function removeMemberFromCard(member) {
      if (membersBusy || !member || !member.id) return;
      var id = String(member.id);
      var isCustom = !!(member.custom) || isCustomAssigneeId(id);

      if (isCustom) {
        if (!onCustomAssigneesChange) return;
        var nextCustoms = customAssignees.filter(function (item) {
          return !(item && String(item.id) === id);
        });
        clearRolesForMemberId(id);
        if (memberRolesPickerMemberId === id) {
          setMemberRolesPickerOpen('');
        }
        persistCustomAssignees(nextCustoms);
        return;
      }

      if (!onMemberRemove) return;
      membersBusy = true;
      setMembersStatus('', 'saving');
      renderMembers();
      Promise.resolve(onMemberRemove(member))
        .then(function (result) {
          membersBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setMembersStatus('', 'error');
            } else {
              setMembersStatus('\u00c9chec du retrait', 'error');
            }
            renderMembers();
            onLayoutChange();
            return result;
          }
          members = members.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          clearRolesForMemberId(id);
          if (memberRolesPickerMemberId === id) {
            setMemberRolesPickerOpen('');
          }
          setAuthHint('');
          setMembersStatus('', 'ok');
          renderMembers();
          setTimeout(function () {
            if (membersStatus.classList.contains('is-ok')) {
              setMembersStatus('');
            }
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          membersBusy = false;
          console.error('Info member remove failed', err);
          setMembersStatus('\u00c9chec du retrait', 'error');
          renderMembers();
          onLayoutChange();
        });
    }

    var LABEL_COLOR_HEX = {
      green: '#61BD4F',
      yellow: '#F2D600',
      orange: '#FF9F1A',
      red: '#EB5A46',
      purple: '#C377E0',
      blue: '#0079BF',
      sky: '#00C2E0',
      lime: '#51E898',
      pink: '#FF78CB',
      black: '#344563'
    };
    var LABEL_COLOR_KEYS = Object.keys(LABEL_COLOR_HEX);
    var LABEL_COLOR_NAMES_FR = {
      green: 'Vert',
      yellow: 'Jaune',
      orange: 'Orange',
      red: 'Rouge',
      purple: 'Violet',
      blue: 'Bleu',
      sky: 'Ciel',
      lime: 'Citron',
      pink: 'Rose',
      black: 'Noir'
    };
    var LABEL_COLOR_FALLBACK = '#B3BAC5';

    function labelBaseColor(color) {
      if (!color || typeof color !== 'string') return '';
      return color.replace(/_(light|dark)$/i, '').toLowerCase();
    }

    function labelColorHex(color) {
      var base = labelBaseColor(color);
      if (base && Object.prototype.hasOwnProperty.call(LABEL_COLOR_HEX, base)) {
        return LABEL_COLOR_HEX[base];
      }
      return LABEL_COLOR_FALLBACK;
    }

    function labelDisplayName(label) {
      if (!label || typeof label !== 'object') return '\u00c9tiquette';
      if (typeof label.name === 'string' && label.name.trim()) {
        return label.name.trim();
      }
      var base = labelBaseColor(label.color);
      if (base && Object.prototype.hasOwnProperty.call(LABEL_COLOR_NAMES_FR, base)) {
        return LABEL_COLOR_NAMES_FR[base];
      }
      return 'Sans nom';
    }

    function findLabelById(list, id) {
      var needle = id != null ? String(id) : '';
      if (!needle) return null;
      var arr = Array.isArray(list) ? list : [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && String(arr[i].id) === needle) return arr[i];
      }
      return null;
    }

    function applyLabelColorLocally(labelId, color) {
      var id = labelId != null ? String(labelId) : '';
      if (!id) return;
      labels = labels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { color: color });
      });
      boardLabels = boardLabels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { color: color });
      });
    }

    function applyLabelNameLocally(labelId, name) {
      var id = labelId != null ? String(labelId) : '';
      if (!id) return;
      var nextName = typeof name === 'string' ? name : '';
      labels = labels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { name: nextName });
      });
      boardLabels = boardLabels.map(function (item) {
        if (!item || String(item.id) !== id) return item;
        return Object.assign({}, item, { name: nextName });
      });
    }

    function cancelLabelRename(options) {
      options = options || {};
      if (!labelsRenameId) return;
      labelsRenameId = '';
      labelsRenameDraft = '';
      if (options.render !== false) {
        renderLabels();
        onLayoutChange();
      }
    }

    function beginLabelRenameDraft(label) {
      if (!onLabelRename || !label || !label.id) return;
      var id = String(label.id);
      labelsRenameId = id;
      labelsRenameDraft =
        typeof label.name === 'string' ? label.name : '';
    }

    function flushLabelRenameIfNeeded(labelId) {
      var id = labelId != null ? String(labelId) : '';
      if (!id || !labelsRenameId || labelsRenameId !== id) return;
      var renamingLabel =
        findLabelById(labels, id) || findLabelById(boardLabels, id);
      if (!renamingLabel) {
        cancelLabelRename({ render: false });
        return;
      }
      var previousName =
        typeof renamingLabel.name === 'string' ? renamingLabel.name : '';
      var draft =
        typeof labelsRenameDraft === 'string' ? labelsRenameDraft.trim() : '';
      if (draft === previousName) {
        cancelLabelRename({ render: false });
        return;
      }
      commitLabelRename(renamingLabel, labelsRenameDraft);
    }

    function spellcheckLabelName(text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
      if (
        !trimmed ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    }

    function commitLabelRename(label, rawName) {
      if (!onLabelRename || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      var previousName = typeof label.name === 'string' ? label.name : '';
      var typed =
        typeof rawName === 'string' ? rawName : labelsRenameDraft || '';
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      spellcheckLabelName(typed)
        .then(function (nextName) {
          if (nextName === previousName) {
            labelsBusy = false;
            cancelLabelRename();
            setLabelsStatus('');
            return { ok: true, changed: false, name: nextName };
          }
          applyLabelNameLocally(id, nextName);
          labelsRenameDraft = nextName;
          renderLabels();
          return Promise.resolve(
            onLabelRename({
              id: id,
              name: nextName,
              label: label
            })
          ).then(function (result) {
            return { result: result, nextName: nextName };
          });
        })
        .then(function (payload) {
          if (!payload || payload.ok === true) {
            // Unchanged early exit.
            return payload;
          }
          var result = payload.result;
          var nextName = payload.nextName;
          labelsBusy = false;
          if (result && result.ok === false) {
            applyLabelNameLocally(id, previousName);
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else if (result.reason === 'name-too-long') {
              setLabelsStatus('Nom trop long', 'error');
            } else {
              setLabelsStatus('\u00c9chec du renommage', 'error');
            }
            labelsRenameId = id;
            labelsRenameDraft = previousName;
            renderLabels();
            onLayoutChange();
            return result;
          }
          var savedName =
            result && result.label && typeof result.label.name === 'string'
              ? result.label.name
              : result && typeof result.name === 'string'
                ? result.name
                : nextName;
          applyLabelNameLocally(id, savedName);
          setAuthHint('');
          setLabelsStatus('', 'ok');
          cancelLabelRename({ render: false });
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          applyLabelNameLocally(id, previousName);
          console.error('Info label rename failed', err);
          setLabelsStatus('\u00c9chec du renommage', 'error');
          labelsRenameId = id;
          labelsRenameDraft = previousName;
          renderLabels();
          onLayoutChange();
        });
    }

    function setLabelsColorPickerOpen(labelId, options) {
      options = options || {};
      var nextId = labelId != null ? String(labelId) : '';
      if (!nextId || nextId === labelsColorEditId) {
        var closingId = labelsColorEditId;
        labelsColorEditId = '';
        labelsColorPicker.hidden = true;
        labelsColorPicker.replaceChildren();
        if (closingId) {
          if (options.discardRename) {
            cancelLabelRename({ render: false });
          } else {
            flushLabelRenameIfNeeded(closingId);
          }
        }
        renderLabels();
        onLayoutChange();
        return;
      }
      if (labelsRenameId && labelsRenameId !== nextId) {
        flushLabelRenameIfNeeded(labelsRenameId);
      }
      if (labelsPickerOpen) setLabelsPickerOpen(false);
      labelsColorEditId = nextId;
      var label =
        findLabelById(labels, nextId) || findLabelById(boardLabels, nextId);
      if (label) beginLabelRenameDraft(label);
      renderLabelsColorPicker();
      renderLabels();
      onLayoutChange();
    }

    function renderLabelsColorPicker() {
      labelsColorPicker.replaceChildren();
      var canEditLabel =
        !!labelsColorEditId &&
        !!(onLabelColorChange || onLabelRename || onLabelDelete);
      if (!canEditLabel) {
        labelsColorPicker.hidden = true;
        return;
      }
      var label =
        findLabelById(labels, labelsColorEditId) ||
        findLabelById(boardLabels, labelsColorEditId);
      if (!label) {
        labelsColorEditId = '';
        labelsColorPicker.hidden = true;
        return;
      }
      var current = labelBaseColor(label.color);
      var head = document.createElement('div');
      head.className = 'info-labels-color-picker-head';

      var title = document.createElement('div');
      title.className = 'info-labels-color-picker-title';
      title.textContent = 'Modifier l\u2019\u00e9tiquette';

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'info-labels-color-picker-close';
      closeBtn.setAttribute('aria-label', 'Fermer');
      closeBtn.title = 'Fermer';
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        setLabelsColorPickerOpen('');
      });

      head.appendChild(title);
      head.appendChild(closeBtn);
      labelsColorPicker.appendChild(head);

      if (onLabelRename) {
        var renameField = document.createElement('div');
        renameField.className = 'info-labels-color-picker-rename';

        var renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'info-labels-color-picker-name-input';
        renameInput.dataset.labelId = String(label.id);
        renameInput.value =
          labelsRenameId === String(label.id)
            ? labelsRenameDraft
            : typeof label.name === 'string'
              ? label.name
              : '';
        renameInput.maxLength = 16384;
        renameInput.setAttribute('aria-label', 'Nom de l\u2019\u00e9tiquette');
        renameInput.placeholder = 'Nom de l\u2019\u00e9tiquette';
        renameInput.disabled = labelsBusy;
        renameInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        renameInput.addEventListener('input', function () {
          labelsRenameId = String(label.id);
          labelsRenameDraft = renameInput.value;
        });
        renameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitLabelRename(label, renameInput.value);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setLabelsColorPickerOpen('', { discardRename: true });
          }
        });
        renameField.appendChild(renameInput);
        labelsColorPicker.appendChild(renameField);
      }

      if (onLabelColorChange) {
        var grid = document.createElement('div');
        grid.className = 'info-labels-color-picker-grid';
        grid.setAttribute('role', 'listbox');
        grid.setAttribute('aria-label', 'Couleur de l\u2019\u00e9tiquette');
        LABEL_COLOR_KEYS.forEach(function (key) {
          var hex = LABEL_COLOR_HEX[key];
          var fr = LABEL_COLOR_NAMES_FR[key] || key;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-labels-color-swatch';
          if (current === key) btn.classList.add('is-selected');
          btn.style.setProperty('--label-color', hex);
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-label', fr);
          btn.title = fr;
          btn.disabled = labelsBusy;
          btn.dataset.color = key;
          if (current === key) {
            btn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
          }
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            changeLabelColor(label, key);
          });
          grid.appendChild(btn);
        });
        labelsColorPicker.appendChild(grid);
      }

      if (onLabelDelete) {
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'info-labels-color-picker-delete';
        deleteBtn.setAttribute(
          'aria-label',
          'Supprimer l\u2019\u00e9tiquette du tableau\u00a0: ' +
            labelDisplayName(label)
        );
        deleteBtn.title = 'Supprimer du tableau';
        deleteBtn.disabled = labelsBusy;
        deleteBtn.innerHTML =
          '<i class="ti ti-trash" aria-hidden="true"></i>' +
          '<span>Supprimer du tableau</span>';
        deleteBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          deleteLabelFromBoard(label);
        });
        labelsColorPicker.appendChild(deleteBtn);
      }

      labelsColorPicker.hidden = false;
    }

    function labelNeedsDarkText(hex) {
      var raw = (hex || '').replace(/^#/, '');
      if (raw.length !== 6) return false;
      var r = parseInt(raw.slice(0, 2), 16);
      var g = parseInt(raw.slice(2, 4), 16);
      var b = parseInt(raw.slice(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return false;
      // Relative luminance (sRGB approx).
      var luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luma > 0.62;
    }

    function setLabelsStatus(text, kind) {
      applyInfoSaveStatus(labelsStatus, text, kind);
    }

    function pruneLabelSuggestions() {
      var selected = selectedLabelIds();
      var selectedNames = Object.create(null);
      labels.forEach(function (label) {
        var n =
          label && typeof label.name === 'string'
            ? label.name.trim().toLocaleLowerCase('fr-FR')
            : '';
        if (n) selectedNames[n] = true;
      });
      labelSuggestions = labelSuggestions.filter(function (label) {
        if (!label) return false;
        if (label.isNew) {
          var name =
            typeof label.name === 'string'
              ? label.name.trim().toLocaleLowerCase('fr-FR')
              : '';
          return !!name && !selectedNames[name] && !boardHasLabelName(label.name);
        }
        return label.id && !selected[String(label.id)];
      });
    }

    function renderLabelSuggestions() {
      if (!labelsSuggestListEl || !labelsSuggestSection) return;
      labelsSuggestListEl.replaceChildren();
      pruneLabelSuggestions();
      if (!suggestLabelsFn || !labelSuggestions.length) {
        labelsSuggestSection.hidden = true;
        onLayoutChange();
        return;
      }
      labelsSuggestSection.hidden = false;
      labelSuggestions.forEach(function (label) {
        var name = labelDisplayName(label) || label.name || 'Suggestion';
        var hex = labelColorHex(label.color);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className =
          'info-labels-suggestion' + (label.isNew ? ' is-new' : '');
        btn.setAttribute('role', 'listitem');
        btn.style.setProperty('--label-color', hex);
        btn.style.setProperty(
          '--label-fg',
          labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
        );
        btn.title = label.isNew
          ? 'Cr\u00e9er et ajouter\u00a0: ' + name
          : 'Ajouter\u00a0: ' + name;
        btn.disabled = labelsBusy;
        if (label.id) btn.dataset.labelId = String(label.id);

        var swatch = document.createElement('span');
        swatch.className = 'info-label-swatch';
        swatch.setAttribute('aria-hidden', 'true');

        var text = document.createElement('span');
        text.className = 'info-labels-suggestion-text';
        text.textContent = label.isNew ? '+ ' + name : name;

        btn.appendChild(swatch);
        btn.appendChild(text);
        btn.addEventListener('click', function () {
          if (label.isNew) createLabelSuggestion(label);
          else addLabelFromPicker(label);
        });
        labelsSuggestListEl.appendChild(btn);
      });
      onLayoutChange();
    }

    function labelSuggestionsContextKey() {
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      var existing = labels
        .map(function (label) {
          return label && label.id ? String(label.id) : '';
        })
        .filter(Boolean)
        .sort()
        .join(',');
      var available = boardLabels
        .map(function (label) {
          return label && label.id ? String(label.id) : '';
        })
        .filter(Boolean)
        .sort()
        .join(',');
      return title + '\u0001' + desc + '\u0001' + existing + '\u0001' + available;
    }

    function refreshLabelSuggestions(force) {
      if (!suggestLabelsFn) {
        labelSuggestions = [];
        labelSuggestionsLoading = false;
        labelSuggestionsKey = '';
        renderLabelSuggestions();
        return Promise.resolve();
      }
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      if (!title && !desc && !boardLabels.length) {
        labelSuggestions = [];
        labelSuggestionsLoading = false;
        renderLabelSuggestions();
        return Promise.resolve();
      }
      var key = labelSuggestionsContextKey();
      if (!force && key === labelSuggestionsKey) {
        renderLabelSuggestions();
        return Promise.resolve();
      }

      var seq = ++labelSuggestionsSeq;
      labelSuggestionsLoading = true;
      labelSuggestionsKey = key;
      return Promise.resolve()
        .then(function () {
          return suggestLabelsFn({
            force: !!force,
            cardName: title,
            cardDesc: desc,
            priorityLabel: priorityLabel || '',
            existingLabels: labels.slice(),
            boardLabels: boardLabels.slice()
          });
        })
        .then(function (list) {
          if (seq !== labelSuggestionsSeq) return;
          var selected = selectedLabelIds();
          var seen = Object.create(null);
          var seenNames = Object.create(null);
          labelSuggestions = Array.isArray(list)
            ? list
                .filter(function (label) {
                  if (!label) return false;
                  if (label.isNew) {
                    var nm =
                      typeof label.name === 'string' ? label.name.trim() : '';
                    if (!nm) return false;
                    var nk = nm.toLocaleLowerCase('fr-FR');
                    if (seenNames[nk] || boardHasLabelName(nm)) return false;
                    seenNames[nk] = true;
                    return true;
                  }
                  if (!label.id) return false;
                  var id = String(label.id);
                  if (selected[id] || seen[id]) return false;
                  seen[id] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          labelSuggestionsLoading = false;
          renderLabelSuggestions();
        })
        .catch(function (err) {
          console.error('Info label suggestions failed', err);
          if (seq !== labelSuggestionsSeq) return;
          labelSuggestionsLoading = false;
          labelSuggestions = [];
          renderLabelSuggestions();
        });
    }

    function scheduleLabelSuggestions(force) {
      if (!suggestLabelsFn) return;
      if (labelSuggestionsTimer) {
        clearTimeout(labelSuggestionsTimer);
        labelSuggestionsTimer = null;
      }
      labelSuggestionsTimer = setTimeout(function () {
        labelSuggestionsTimer = null;
        refreshLabelSuggestions(!!force);
      }, force ? 0 : 280);
    }

    function createLabelSuggestion(suggestion) {
      if (!onLabelCreate || labelsBusy || !suggestion || !suggestion.name) return;
      var name = String(suggestion.name || '').trim();
      if (!name || boardHasLabelName(name)) return;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(
        onLabelCreate({
          name: name,
          color: suggestion.color || undefined,
          existingLabels: boardLabels.slice()
        })
      )
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          var created =
            result && result.label && typeof result.label === 'object'
              ? result.label
              : null;
          if (created && created.id) {
            var createdId = String(created.id);
            var onBoard = false;
            for (var i = 0; i < boardLabels.length; i++) {
              if (boardLabels[i] && String(boardLabels[i].id) === createdId) {
                onBoard = true;
                break;
              }
            }
            if (!onBoard) {
              boardLabels = boardLabels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : suggestion.color,
                  idBoard: created.idBoard
                }
              ]);
            }
            if (!selectedLabelIds()[createdId]) {
              labels = labels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : suggestion.color,
                  idBoard: created.idBoard
                }
              ]);
            }
          }
          setAuthHint('');
          setLabelsStatus('', 'ok');
          renderLabels();
          scheduleLabelSuggestions(false);
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label suggestion create failed', err);
          setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function selectedLabelIds() {
      var ids = Object.create(null);
      for (var i = 0; i < labels.length; i++) {
        if (labels[i] && labels[i].id) ids[String(labels[i].id)] = true;
      }
      return ids;
    }

    function availableBoardLabels() {
      var selected = selectedLabelIds();
      var out = [];
      for (var i = 0; i < boardLabels.length; i++) {
        var label = boardLabels[i];
        if (!label || !label.id) continue;
        if (selected[String(label.id)]) continue;
        out.push(label);
      }
      return out;
    }

    function setLabelsPickerOpen(open) {
      labelsPickerOpen = !!open;
      labelsPicker.hidden = !labelsPickerOpen;
      labelsAddBtn.setAttribute('aria-expanded', labelsPickerOpen ? 'true' : 'false');
      labelsAddWrap.classList.toggle('is-open', labelsPickerOpen);
      if (labelsPickerOpen) {
        renderLabelsPicker();
        try {
          labelsSearchInput.focus();
          labelsSearchInput.select();
        } catch (e) {
          /* ignore */
        }
      } else {
        labelsSearchInput.value = '';
      }
      onLayoutChange();
    }

    function filteredAvailableBoardLabels(query) {
      var available = availableBoardLabels();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      if (!q) return available;
      return available.filter(function (label) {
        return labelDisplayName(label).toLowerCase().indexOf(q) !== -1;
      });
    }

    function boardHasLabelName(name) {
      var needle = String(name || '')
        .trim()
        .toLowerCase();
      if (!needle) return false;
      for (var i = 0; i < boardLabels.length; i++) {
        if (labelDisplayName(boardLabels[i]).toLowerCase() === needle) return true;
      }
      return false;
    }

    function updateLabelsCreateButton(query) {
      if (!onLabelCreate) {
        labelsCreateBtn.hidden = true;
        labelsCreateBtn.textContent = '';
        labelsCreateBtn.disabled = true;
        return;
      }
      var q = String(query || '').trim();
      labelsCreateBtn.hidden = false;
      if (!q) {
        labelsCreateBtn.hidden = true;
        labelsCreateBtn.disabled = true;
        labelsCreateBtn.textContent = '';
        return;
      }
      if (boardHasLabelName(q) || labelsBusy) {
        labelsCreateBtn.disabled = true;
        labelsCreateBtn.innerHTML =
          '<i class="ti ti-plus" aria-hidden="true"></i>' +
          '<span>Cr\u00e9er une nouvelle \u00e9tiquette</span>';
        labelsCreateBtn.title = boardHasLabelName(q)
          ? 'Cette \u00e9tiquette existe d\u00e9j\u00e0'
          : 'Cr\u00e9ation en cours\u2026';
        return;
      }
      labelsCreateBtn.disabled = false;
      labelsCreateBtn.innerHTML =
        '<i class="ti ti-plus" aria-hidden="true"></i>' +
        '<span>Cr\u00e9er une nouvelle \u00e9tiquette\u00a0: <strong></strong></span>';
      var strong = labelsCreateBtn.querySelector('strong');
      if (strong) strong.textContent = q;
      labelsCreateBtn.title = 'Cr\u00e9er l\u2019\u00e9tiquette\u00a0: ' + q;
    }

    function filteredBoardLabels(query) {
      var q = String(query || '')
        .trim()
        .toLowerCase();
      return boardLabels.filter(function (label) {
        if (!label || !label.id) return false;
        if (!q) return true;
        return labelDisplayName(label).toLowerCase().indexOf(q) !== -1;
      });
    }

    function renderLabelsPicker() {
      labelsPickerList.replaceChildren();
      var query = labelsSearchInput.value;
      var q = String(query || '').trim();
      // With delete enabled, list every board label so unused and applied
      // ones can be permanently removed from Trello via the row ×.
      var listed = onLabelDelete
        ? filteredBoardLabels(query)
        : filteredAvailableBoardLabels(query);
      var selected = selectedLabelIds();

      if (!listed.length) {
        var empty = document.createElement('div');
        empty.className = 'info-labels-picker-empty';
        if (q) {
          empty.textContent = 'Aucune \u00e9tiquette correspondante';
        } else if (boardLabels.length && !onLabelDelete) {
          empty.textContent =
            'Toutes les \u00e9tiquettes sont d\u00e9j\u00e0 sur la carte';
        } else {
          empty.textContent = 'Aucune \u00e9tiquette sur ce tableau';
        }
        labelsPickerList.appendChild(empty);
      } else {
        listed.forEach(function (label) {
          var name = labelDisplayName(label);
          var hex = labelColorHex(label.color);
          var onCard = !!selected[String(label.id)];
          var row = document.createElement('div');
          row.className = 'info-labels-picker-row';
          if (onCard) row.classList.add('is-on-card');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', onCard ? 'true' : 'false');
          row.dataset.labelId = String(label.id);

          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-labels-picker-option';
          btn.style.setProperty('--label-color', hex);
          btn.style.setProperty(
            '--label-fg',
            labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
          );
          btn.title = onCard ? name + ' (sur cette carte)' : name;
          btn.disabled = labelsBusy || onCard;

          var swatch = document.createElement('span');
          swatch.className = 'info-label-swatch';
          swatch.setAttribute('aria-hidden', 'true');

          var text = document.createElement('span');
          text.className = 'info-labels-picker-option-text';
          text.textContent = name;

          btn.appendChild(swatch);
          btn.appendChild(text);
          if (!onCard) {
            btn.addEventListener('click', function () {
              addLabelFromPicker(label);
            });
          }
          row.appendChild(btn);

          if (onLabelDelete) {
            var deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'info-labels-picker-delete';
            deleteBtn.setAttribute(
              'aria-label',
              'Supprimer l\u2019\u00e9tiquette du tableau\u00a0: ' + name
            );
            deleteBtn.title = 'Supprimer du tableau';
            deleteBtn.disabled = labelsBusy;
            deleteBtn.innerHTML =
              '<i class="ti ti-trash" aria-hidden="true"></i>';
            deleteBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              deleteLabelFromBoard(label);
            });
            row.appendChild(deleteBtn);
          }

          labelsPickerList.appendChild(row);
        });
      }

      updateLabelsCreateButton(query);
    }

    function renderLabels() {
      labelsEl.replaceChildren();

      if (labels.length) {
        labels.forEach(function (label) {
          var name = labelDisplayName(label);
          var hex = labelColorHex(label.color);
          var labelId = label && label.id != null ? String(label.id) : '';
          var isEditing =
            !!labelsColorEditId &&
            labelId &&
            String(labelsColorEditId) === labelId;
          var canEditLabel =
            !!labelId &&
            !!(onLabelColorChange || onLabelRename || onLabelDelete);
          var chip = document.createElement('span');
          chip.className = 'info-label';
          if (isEditing) chip.classList.add('is-editing-color');
          chip.style.setProperty('--label-color', hex);
          chip.style.setProperty(
            '--label-fg',
            labelNeedsDarkText(hex) ? '#172b4d' : '#ffffff'
          );
          chip.title = name;
          chip.setAttribute('aria-label', name);

          var text = document.createElement('span');
          text.className = 'info-label-name';
          text.textContent = name;
          chip.appendChild(text);

          var actions = document.createElement('span');
          actions.className = 'info-label-actions';

          if (canEditLabel) {
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'info-label-edit';
            editBtn.setAttribute(
              'aria-label',
              'Modifier l\u2019\u00e9tiquette\u00a0: ' + name
            );
            editBtn.title = 'Modifier l\u2019\u00e9tiquette';
            editBtn.innerHTML = '<i class="ti ti-pencil" aria-hidden="true"></i>';
            editBtn.disabled = labelsBusy;
            editBtn.setAttribute('aria-expanded', isEditing ? 'true' : 'false');
            editBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              setLabelsColorPickerOpen(label.id);
            });
            actions.appendChild(editBtn);
          }

          if (onLabelRemove) {
            var clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'info-label-clear';
            clearBtn.setAttribute(
              'aria-label',
              'Retirer l\u2019\u00e9tiquette\u00a0: ' + name
            );
            clearBtn.title = 'Retirer de cette carte';
            clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
            clearBtn.disabled = labelsBusy;
            clearBtn.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              if (labelsColorEditId) setLabelsColorPickerOpen('');
              removeLabelFromCard(label);
            });
            actions.appendChild(clearBtn);
          }

          if (actions.childNodes.length) chip.appendChild(actions);
          if (
            global.ContextMenu &&
            typeof global.ContextMenu.bind === 'function' &&
            typeof global.ContextMenu.buildInfoChipItems === 'function'
          ) {
            ContextMenu.bind(chip, function () {
              return ContextMenu.buildInfoChipItems({
                kind: 'label',
                onEdit: canEditLabel
                  ? function () {
                      setLabelsColorPickerOpen(label.id);
                    }
                  : null,
                onRemove: onLabelRemove
                  ? function () {
                      if (labelsColorEditId) setLabelsColorPickerOpen('');
                      removeLabelFromCard(label);
                    }
                  : null,
              });
            });
          }
          labelsEl.appendChild(chip);
        });
      }

      var canAdd = !!onLabelAdd || !!onLabelCreate;
      labelsAddBtn.hidden = !canAdd;
      labelsAddBtn.disabled = labelsBusy || !canAdd || !!labelsColorEditId;
      if (labelsPickerOpen) renderLabelsPicker();
      if (labelsColorEditId) renderLabelsColorPicker();
      else {
        labelsColorPicker.hidden = true;
        labelsColorPicker.replaceChildren();
      }
      renderLabelSuggestions();
    }

    function setTaskTypesStatus(text, tone) {
      taskTypesStatus.textContent = text || '';
      taskTypesStatus.hidden = !text;
      taskTypesStatus.classList.toggle('is-error', tone === 'error');
      taskTypesStatus.classList.toggle('is-saving', tone === 'saving');
    }

    function clearTaskTypesPickerPosition() {
      taskTypesPicker.classList.remove('is-viewport-fixed');
      taskTypesPicker.style.position = '';
      taskTypesPicker.style.top = '';
      taskTypesPicker.style.left = '';
      taskTypesPicker.style.right = '';
      taskTypesPicker.style.bottom = '';
      taskTypesPicker.style.maxHeight = '';
      taskTypesPicker.style.width = '';
    }

    /**
     * Keep the type picker inside the iframe viewport.
     * Prefer below the + button; shift left / lower when edges overflow.
     */
    function positionTaskTypesPicker() {
      if (!taskTypesPickerOpen || taskTypesPicker.hidden) return;
      var margin = 8;
      var gap = 4;
      var vw = window.innerWidth || document.documentElement.clientWidth || 0;
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      if (vw < 40 || vh < 40) return;

      clearTaskTypesPickerPosition();
      taskTypesPicker.classList.add('is-viewport-fixed');
      taskTypesPicker.style.position = 'fixed';
      taskTypesPicker.style.visibility = 'hidden';
      taskTypesPicker.style.top = '0';
      taskTypesPicker.style.left = '0';

      var anchor = taskTypesAddBtn.getBoundingClientRect();
      var maxW = Math.min(280, Math.max(160, vw - margin * 2));
      taskTypesPicker.style.width = maxW + 'px';

      var spaceBelow = Math.max(0, vh - anchor.bottom - gap - margin);
      var spaceAbove = Math.max(0, anchor.top - gap - margin);
      var preferBelow =
        spaceBelow >= 160 || spaceBelow >= spaceAbove || spaceAbove < 120;
      var availableH = preferBelow ? spaceBelow : spaceAbove;
      var maxH = Math.max(120, Math.min(320, availableH || vh - margin * 2));
      taskTypesPicker.style.maxHeight = maxH + 'px';

      var pw = taskTypesPicker.offsetWidth || maxW;
      var ph = taskTypesPicker.offsetHeight || Math.min(maxH, 240);

      var top = preferBelow ? anchor.bottom + gap : anchor.top - gap - ph;
      // If above would clip the top, move lower; always clamp into the viewport.
      if (top < margin) top = margin;
      if (top + ph > vh - margin) {
        top = Math.max(margin, vh - ph - margin);
      }

      // Prefer aligning to the button; shift left when the right edge overflows.
      var left = anchor.left;
      if (left + pw > vw - margin) {
        left = vw - pw - margin;
      }
      // Prefer growing left from the button's right edge when still overflowing.
      if (left < margin) {
        left = Math.max(margin, Math.min(anchor.right - pw, vw - pw - margin));
      }
      left = Math.max(margin, Math.min(left, vw - pw - margin));

      taskTypesPicker.style.top = Math.round(top) + 'px';
      taskTypesPicker.style.left = Math.round(left) + 'px';
      taskTypesPicker.style.visibility = '';
    }

    function setTaskTypesPickerOpen(open) {
      taskTypesPickerOpen = !!open;
      taskTypesPicker.hidden = !taskTypesPickerOpen;
      taskTypesAddWrap.classList.toggle('is-open', taskTypesPickerOpen);
      taskTypesAddBtn.setAttribute(
        'aria-expanded',
        taskTypesPickerOpen ? 'true' : 'false'
      );
      if (taskTypesPickerOpen) {
        randomizeTaskTypesCreateIcon();
        setTaskTypesIconPickerOpen(false);
        renderTaskTypesPicker();
        positionTaskTypesPicker();
        requestAnimationFrame(positionTaskTypesPicker);
        try {
          taskTypesCreateInput.focus();
          taskTypesCreateInput.select();
        } catch (e) {
          /* ignore */
        }
      } else {
        taskTypesCreateInput.value = '';
        setTaskTypesIconPickerOpen(false);
        clearTaskTypesPickerPosition();
      }
      onLayoutChange();
      if (taskTypesPickerOpen) {
        requestAnimationFrame(positionTaskTypesPicker);
      }
    }

    function availableTaskTypeEntries() {
      var selected = Object.create(null);
      for (var i = 0; i < taskTypes.length; i++) selected[taskTypes[i]] = true;
      return getTaskTypeCatalog().filter(function (entry) {
        return !selected[entry.id];
      });
    }

    function filteredAvailableTaskTypeEntries(query) {
      var available = availableTaskTypeEntries();
      var q = String(query || '')
        .trim()
        .toLocaleLowerCase('fr-FR');
      if (!q) return available;
      return available.filter(function (entry) {
        var label = String(entry.label || '')
          .toLocaleLowerCase('fr-FR');
        var hint = String(entry.hint || '')
          .toLocaleLowerCase('fr-FR');
        return label.indexOf(q) !== -1 || hint.indexOf(q) !== -1;
      });
    }

    function canOpenTaskTypesPicker() {
      if (!onTaskTypesChange) return false;
      return availableTaskTypeEntries().length > 0 || !!onCustomTaskTypesChange;
    }

    function syncTaskTypesCreateBtn() {
      if (!onCustomTaskTypesChange) {
        taskTypesCreateBtn.disabled = true;
        return;
      }
      var label = (taskTypesCreateInput.value || '').trim();
      taskTypesCreateBtn.disabled =
        taskTypesBusy || !label || label.length > MAX_TASK_TYPE_LABEL_LEN;
    }

    function renderTaskTypesPicker() {
      taskTypesPickerList.replaceChildren();
      // Keep the search field visible whenever the picker can open; only hide
      // create controls when custom types are unavailable.
      taskTypesCreateWrap.hidden = false;
      taskTypesCreateIconWrap.hidden = !onCustomTaskTypesChange;
      taskTypesCreateBtn.hidden = !onCustomTaskTypesChange;
      taskTypesCreateInput.placeholder = onCustomTaskTypesChange
        ? 'Rechercher ou cr\u00e9er\u2026'
        : 'Rechercher\u2026';
      taskTypesCreateInput.setAttribute(
        'aria-label',
        onCustomTaskTypesChange
          ? 'Rechercher ou cr\u00e9er un type de t\u00e2che'
          : 'Rechercher un type de t\u00e2che'
      );
      var query = taskTypesCreateInput.value;
      var available = filteredAvailableTaskTypeEntries(query);
      var q = String(query || '').trim();
      if (!available.length) {
        var empty = document.createElement('div');
        empty.className = 'info-task-types-picker-empty';
        if (q) {
          empty.textContent = 'Aucun type correspondant';
        } else if (onCustomTaskTypesChange) {
          empty.textContent =
            'Tous les types sont s\u00e9lectionn\u00e9s \u2014 cr\u00e9ez-en un nouveau';
        } else {
          empty.textContent = 'Tous les types sont d\u00e9j\u00e0 s\u00e9lectionn\u00e9s';
        }
        taskTypesPickerList.appendChild(empty);
      } else {
        available.forEach(function (entry) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-task-types-picker-option';
          btn.setAttribute('role', 'option');
          btn.disabled = taskTypesBusy;
          btn.title = entry.hint || entry.label;
          btn.dataset.taskTypeId = entry.id;

          var head = document.createElement('span');
          head.className = 'info-task-types-picker-option-head';
          head.innerHTML = taskTypeIconSvg(entry.id);
          var text = document.createElement('span');
          text.className = 'info-task-types-picker-option-text';
          text.textContent = entry.label;
          head.appendChild(text);
          btn.appendChild(head);

          if (entry.hint) {
            var hint = document.createElement('span');
            hint.className = 'info-task-types-picker-option-hint';
            hint.textContent = entry.hint;
            btn.appendChild(hint);
          }

          btn.addEventListener('click', function () {
            addTaskType(entry.id);
          });
          taskTypesPickerList.appendChild(btn);
        });
      }
      syncTaskTypesCreateBtn();
    }

    function renderTaskTypes() {
      taskTypesEl.replaceChildren();
      taskTypes.forEach(function (id) {
        var label = taskTypeLabel(id) || id;
        var hint = taskTypeHint(id);
        var chip = document.createElement('span');
        chip.className = 'info-task-type';
        chip.title = hint || label;
        chip.setAttribute('aria-label', label);

        var iconWrap = document.createElement('span');
        iconWrap.className = 'info-task-type-icon-wrap';
        iconWrap.innerHTML = taskTypeIconSvg(id);
        chip.appendChild(iconWrap);

        var text = document.createElement('span');
        text.className = 'info-task-type-name';
        text.textContent = label;
        chip.appendChild(text);

        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'info-task-type-clear';
        clearBtn.setAttribute('aria-label', 'Retirer\u00a0: ' + label);
        clearBtn.title = 'Retirer';
        clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        clearBtn.disabled = taskTypesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          removeTaskType(id);
        });
        chip.appendChild(clearBtn);
        if (
          global.ContextMenu &&
          typeof global.ContextMenu.bind === 'function' &&
          typeof global.ContextMenu.buildInfoChipItems === 'function'
        ) {
          ContextMenu.bind(chip, function () {
            return ContextMenu.buildInfoChipItems({
              kind: 'task-type',
              onRemove: function () {
                removeTaskType(id);
              },
            });
          });
        }
        taskTypesEl.appendChild(chip);
      });

      var canAdd = canOpenTaskTypesPicker();
      taskTypesAddBtn.hidden = !onTaskTypesChange;
      taskTypesAddBtn.disabled = taskTypesBusy || !canAdd;
      if (taskTypesPickerOpen) {
        if (!canAdd) setTaskTypesPickerOpen(false);
        else {
          renderTaskTypesPicker();
          requestAnimationFrame(positionTaskTypesPicker);
        }
      }
      renderTaskTypeSuggestions();
    }

    function persistCustomTaskTypes(nextCustoms, createdEntry) {
      var previous = getCustomTaskTypes();
      setCustomTaskTypes(nextCustoms);
      renderTaskTypes();
      if (!onCustomTaskTypesChange) {
        if (createdEntry) addTaskType(createdEntry.id);
        return Promise.resolve({ ok: true });
      }
      taskTypesBusy = true;
      setTaskTypesStatus('', 'saving');
      return Promise.resolve(onCustomTaskTypesChange(getCustomTaskTypes()))
        .then(function (result) {
          taskTypesBusy = false;
          if (result && result.ok === false) {
            setCustomTaskTypes(previous);
            setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
            renderTaskTypes();
            onLayoutChange();
            return result;
          }
          setTaskTypesStatus('', '');
          if (createdEntry) addTaskType(createdEntry.id);
          else {
            renderTaskTypes();
            onLayoutChange();
          }
          return result || { ok: true };
        })
        .catch(function (err) {
          console.error('Info custom task types save failed', err);
          taskTypesBusy = false;
          setCustomTaskTypes(previous);
          setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
          renderTaskTypes();
          onLayoutChange();
          return { ok: false };
        });
    }

    function submitCreateTaskType() {
      if (taskTypesBusy || !onCustomTaskTypesChange) return;
      var label = (taskTypesCreateInput.value || '').trim();
      if (!label) return;
      var draft = createCustomTaskType(
        { label: label, icon: taskTypesCreateIconKey },
        { apply: false }
      );
      if (!draft) {
        setTaskTypesStatus('Ce type existe d\u00e9j\u00e0', 'error');
        return;
      }
      taskTypesCreateInput.value = '';
      syncTaskTypesCreateBtn();
      setTaskTypesIconPickerOpen(false);
      persistCustomTaskTypes(getCustomTaskTypes().concat([draft]), draft).then(
        function (result) {
          if (!result || result.ok !== false) {
            randomizeTaskTypesCreateIcon();
          }
        }
      );
    }

    function persistTaskTypes(nextTypes) {
      var previous = taskTypes.slice();
      var normalized = normalizeTaskTypes(nextTypes);
      taskTypes = normalized;
      renderTaskTypes();
      if (!onTaskTypesChange) {
        onLayoutChange();
        return;
      }
      taskTypesBusy = true;
      setTaskTypesStatus('', 'saving');
      Promise.resolve(onTaskTypesChange(normalized.slice()))
        .then(function (result) {
          taskTypesBusy = false;
          if (result && result.ok === false) {
            taskTypes = previous;
            setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
            renderTaskTypes();
            onLayoutChange();
            return;
          }
          setTaskTypesStatus('', '');
          renderTaskTypes();
          scheduleTaskTypeSuggestions(false);
          onLayoutChange();
        })
        .catch(function (err) {
          console.error('Info task types save failed', err);
          taskTypesBusy = false;
          taskTypes = previous;
          setTaskTypesStatus('\u00c9chec de l\u2019enregistrement', 'error');
          renderTaskTypes();
          onLayoutChange();
        });
    }

    function addTaskType(id) {
      if (taskTypesBusy || !isValidTaskTypeId(id)) return;
      if (taskTypes.indexOf(id) >= 0) return;
      persistTaskTypes(taskTypes.concat([id]));
      setTaskTypesPickerOpen(false);
    }

    function removeTaskType(id) {
      if (taskTypesBusy) return;
      persistTaskTypes(
        taskTypes.filter(function (entry) {
          return entry !== id;
        })
      );
    }

    function pruneTaskTypeSuggestions() {
      var selected = Object.create(null);
      taskTypes.forEach(function (id) {
        selected[id] = true;
      });
      var dismissed = Object.create(null);
      dismissedTaskTypeSuggestions.forEach(function (id) {
        dismissed[id] = true;
      });
      taskTypeSuggestions = taskTypeSuggestions.filter(function (row) {
        return (
          row &&
          row.id &&
          isValidTaskTypeId(row.id) &&
          !selected[row.id] &&
          !dismissed[row.id]
        );
      });
    }

    function renderTaskTypeSuggestions() {
      if (!taskTypesSuggestListEl || !taskTypesSuggestSection) return;
      taskTypesSuggestListEl.replaceChildren();
      pruneTaskTypeSuggestions();
      if (!suggestTaskTypesFn || !taskTypeSuggestions.length) {
        taskTypesSuggestSection.hidden = true;
        onLayoutChange();
        return;
      }
      taskTypesSuggestSection.hidden = false;
      taskTypeSuggestions.forEach(function (row) {
        var entry = getTaskTypeEntry(row.id);
        var label = (entry && entry.label) || row.label || row.id;
        var hint = (entry && entry.hint) || row.hint || '';

        var chip = document.createElement('span');
        chip.className = 'info-task-types-suggestion-chip';
        chip.setAttribute('role', 'listitem');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-task-types-suggestion';
        btn.title = hint
          ? 'Ajouter\u00a0: ' + label + ' \u2014 ' + hint
          : 'Ajouter\u00a0: ' + label;
        btn.disabled = taskTypesBusy;
        btn.dataset.taskTypeId = row.id;
        btn.innerHTML =
          taskTypeIconSvg(row.id, 'info-task-type-icon') +
          '<span class="info-task-types-suggestion-label">' +
          escapeHtml(label) +
          '</span>';
        btn.addEventListener('click', function () {
          addTaskType(row.id);
        });

        var dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'info-task-types-suggestion-dismiss';
        dismissBtn.setAttribute('aria-label', 'Ignorer la suggestion ' + label);
        dismissBtn.title = 'Ignorer';
        dismissBtn.disabled = taskTypesBusy;
        dismissBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
        dismissBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          dismissTaskTypeSuggestion(row.id);
        });

        chip.appendChild(btn);
        chip.appendChild(dismissBtn);
        taskTypesSuggestListEl.appendChild(chip);
      });
      onLayoutChange();
    }

    function persistDismissedTaskTypeSuggestions(nextIds) {
      var previous = dismissedTaskTypeSuggestions.slice();
      var normalized = normalizeTaskTypes(nextIds);
      dismissedTaskTypeSuggestions = normalized;
      pruneTaskTypeSuggestions();
      renderTaskTypeSuggestions();
      if (!onDismissedTaskTypeSuggestionsChange) {
        return Promise.resolve({ ok: true, changed: false });
      }
      return Promise.resolve(
        onDismissedTaskTypeSuggestionsChange(normalized.slice())
      )
        .then(function (result) {
          if (result && result.ok === false) {
            dismissedTaskTypeSuggestions = previous;
            renderTaskTypeSuggestions();
          }
          return result || { ok: true, changed: true };
        })
        .catch(function (err) {
          console.error('Dismiss task type suggestion failed', err);
          dismissedTaskTypeSuggestions = previous;
          renderTaskTypeSuggestions();
          throw err;
        });
    }

    function dismissTaskTypeSuggestion(id) {
      if (!isValidTaskTypeId(id)) return;
      if (dismissedTaskTypeSuggestions.indexOf(id) >= 0) {
        pruneTaskTypeSuggestions();
        renderTaskTypeSuggestions();
        return;
      }
      persistDismissedTaskTypeSuggestions(
        dismissedTaskTypeSuggestions.concat([id])
      );
    }

    function taskTypeSuggestionsContextKey() {
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      var existing = taskTypes.slice().sort().join(',');
      return title + '\u0001' + desc + '\u0001' + existing;
    }

    function refreshTaskTypeSuggestions(force) {
      if (!suggestTaskTypesFn) {
        taskTypeSuggestions = [];
        taskTypeSuggestionsLoading = false;
        taskTypeSuggestionsKey = '';
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      if (taskTypes.length >= getTaskTypeCatalog().length) {
        taskTypeSuggestions = [];
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var title = (titleInput.value || '').trim() || titleText || '';
      var desc = (descInput.value || '').trim() || descText || '';
      if (!title && !desc) {
        taskTypeSuggestions = [];
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var key = taskTypeSuggestionsContextKey();
      if (!force && key === taskTypeSuggestionsKey) {
        renderTaskTypeSuggestions();
        return Promise.resolve();
      }
      var seq = ++taskTypeSuggestionsSeq;
      taskTypeSuggestionsLoading = true;
      taskTypeSuggestionsKey = key;
      return Promise.resolve()
        .then(function () {
          return suggestTaskTypesFn({
            force: !!force,
            cardName: title,
            cardDesc: desc,
            existingTypes: taskTypes.slice()
          });
        })
        .then(function (list) {
          if (seq !== taskTypeSuggestionsSeq) return;
          var selected = Object.create(null);
          taskTypes.forEach(function (id) {
            selected[id] = true;
          });
          var dismissed = Object.create(null);
          dismissedTaskTypeSuggestions.forEach(function (id) {
            dismissed[id] = true;
          });
          var seen = Object.create(null);
          taskTypeSuggestions = Array.isArray(list)
            ? list
                .filter(function (row) {
                  if (!row || !row.id || !isValidTaskTypeId(row.id)) return false;
                  if (selected[row.id] || dismissed[row.id] || seen[row.id]) {
                    return false;
                  }
                  seen[row.id] = true;
                  return true;
                })
                .slice(0, 3)
            : [];
          taskTypeSuggestionsLoading = false;
          renderTaskTypeSuggestions();
        })
        .catch(function (err) {
          console.error('Info task type suggestions failed', err);
          if (seq !== taskTypeSuggestionsSeq) return;
          taskTypeSuggestionsLoading = false;
          taskTypeSuggestions = [];
          renderTaskTypeSuggestions();
        });
    }

    function scheduleTaskTypeSuggestions(force) {
      if (!suggestTaskTypesFn) return;
      if (taskTypeSuggestionsTimer) {
        clearTimeout(taskTypeSuggestionsTimer);
        taskTypeSuggestionsTimer = null;
      }
      taskTypeSuggestionsTimer = setTimeout(function () {
        taskTypeSuggestionsTimer = null;
        refreshTaskTypeSuggestions(!!force);
      }, force ? 0 : 280);
    }

    function changeLabelColor(label, colorKey) {
      if (!onLabelColorChange || labelsBusy || !label || !label.id) return;
      var nextColor = labelBaseColor(colorKey);
      if (!nextColor || !Object.prototype.hasOwnProperty.call(LABEL_COLOR_HEX, nextColor)) {
        return;
      }
      if (labelBaseColor(label.color) === nextColor) {
        setLabelsColorPickerOpen('');
        return;
      }
      flushLabelRenameIfNeeded(label.id);
      var previousColor = label.color;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      applyLabelColorLocally(label.id, nextColor);
      renderLabels();
      Promise.resolve(
        onLabelColorChange({
          id: label.id,
          color: nextColor,
          label: label
        })
      )
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            applyLabelColorLocally(label.id, previousColor);
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la couleur', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          var savedColor =
            result && result.label && result.label.color != null
              ? result.label.color
              : result && result.color != null
                ? result.color
                : nextColor;
          applyLabelColorLocally(label.id, savedColor);
          setAuthHint('');
          setLabelsStatus('', 'ok');
          labelsColorEditId = '';
          if (labelsRenameId === String(label.id)) {
            cancelLabelRename({ render: false });
          }
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          applyLabelColorLocally(label.id, previousColor);
          console.error('Info label color change failed', err);
          setLabelsStatus('\u00c9chec de la couleur', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function createLabelFromPicker() {
      if (!onLabelCreate || labelsBusy) return;
      var name = String(labelsSearchInput.value || '').trim();
      if (!name || boardHasLabelName(name)) return;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(
        onLabelCreate({
          name: name,
          existingLabels: boardLabels.slice()
        })
      )
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else if (result.reason === 'empty-name') {
              setLabelsStatus('Nom requis', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          var created =
            result && result.label && typeof result.label === 'object'
              ? result.label
              : null;
          if (created && created.id) {
            var createdId = String(created.id);
            var onBoard = false;
            for (var i = 0; i < boardLabels.length; i++) {
              if (boardLabels[i] && String(boardLabels[i].id) === createdId) {
                onBoard = true;
                break;
              }
            }
            if (!onBoard) {
              boardLabels = boardLabels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : null,
                  idBoard: created.idBoard
                }
              ]);
            }
            if (!selectedLabelIds()[createdId]) {
              labels = labels.concat([
                {
                  id: created.id,
                  name: typeof created.name === 'string' ? created.name : name,
                  color: created.color != null ? created.color : null,
                  idBoard: created.idBoard
                }
              ]);
            }
          }
          setAuthHint('');
          setLabelsStatus('', 'ok');
          setLabelsPickerOpen(false);
          renderLabels();
          scheduleLabelSuggestions(false);
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label create failed', err);
          setLabelsStatus('\u00c9chec de la cr\u00e9ation', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function addLabelFromPicker(label) {
      if (!onLabelAdd || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      if (selectedLabelIds()[id]) return;
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(onLabelAdd(label))
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de l\u2019ajout', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          if (!selectedLabelIds()[id]) {
            labels = labels.concat([
              {
                id: label.id,
                name: typeof label.name === 'string' ? label.name : '',
                color: label.color != null ? label.color : null,
                idBoard: label.idBoard
              }
            ]);
          }
          labelSuggestions = labelSuggestions.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          setAuthHint('');
          setLabelsStatus('', 'ok');
          setLabelsPickerOpen(false);
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label add failed', err);
          setLabelsStatus('\u00c9chec de l\u2019ajout', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function removeLabelFromCard(label) {
      if (!onLabelRemove || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(onLabelRemove(label))
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec du retrait', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          labels = labels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          setAuthHint('');
          setLabelsStatus('', 'ok');
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label remove failed', err);
          setLabelsStatus('\u00c9chec du retrait', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function deleteLabelFromBoard(label) {
      if (!onLabelDelete || labelsBusy || !label || !label.id) return;
      var id = String(label.id);
      var name = labelDisplayName(label);
      if (
        !window.confirm(
          'Supprimer d\u00e9finitivement l\u2019\u00e9tiquette \u00ab\u00a0' +
            name +
            '\u00a0\u00bb du tableau\u00a0?\nElle sera retir\u00e9e de toutes les cartes.'
        )
      ) {
        return;
      }
      labelsBusy = true;
      setLabelsStatus('', 'saving');
      renderLabels();
      Promise.resolve(onLabelDelete(label))
        .then(function (result) {
          labelsBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setLabelsStatus('', 'error');
            } else {
              setLabelsStatus('\u00c9chec de la suppression', 'error');
            }
            renderLabels();
            onLayoutChange();
            return result;
          }
          labels = labels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          boardLabels = boardLabels.filter(function (item) {
            return !(item && String(item.id) === id);
          });
          if (labelsColorEditId === id) {
            labelsColorEditId = '';
          }
          if (labelsRenameId === id) {
            labelsRenameId = '';
            labelsRenameDraft = '';
          }
          setAuthHint('');
          setLabelsStatus('', 'ok');
          renderLabels();
          setTimeout(function () {
            if (labelsStatus.classList.contains('is-ok')) setLabelsStatus('');
          }, 1400);
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          labelsBusy = false;
          console.error('Info label delete failed', err);
          setLabelsStatus('\u00c9chec de la suppression', 'error');
          renderLabels();
          onLayoutChange();
        });
    }

    function setParentStatus(text, visible) {
      if (!visible || !text) {
        parentStatus.hidden = true;
        parentStatus.textContent = '';
        return;
      }
      parentStatus.hidden = false;
      parentStatus.textContent = text;
    }

    function setParentPickerOpen(open) {
      parentPickerOpen = !!open;
      parentPicker.hidden = !parentPickerOpen;
      parentPickWrap.classList.toggle('is-open', parentPickerOpen);
      parentPickBtn.setAttribute('aria-expanded', parentPickerOpen ? 'true' : 'false');
      if (!parentPickerOpen) {
        parentSearchInput.value = '';
        setParentStatus('', false);
        parentListEl.replaceChildren();
      }
      onLayoutChange();
    }

    function ensureParentBoardCards() {
      if (parentBoardCardsCache) return Promise.resolve(parentBoardCardsCache);
      if (!getBoardCards) return Promise.resolve([]);
      return Promise.resolve()
        .then(function () {
          return getBoardCards();
        })
        .then(function (cards) {
          parentBoardCardsCache = Array.isArray(cards) ? cards : [];
          return parentBoardCardsCache;
        })
        .catch(function (err) {
          console.error('Info parent board cards load failed', err);
          parentBoardCardsCache = [];
          return parentBoardCardsCache;
        });
    }

    function parentIdSet() {
      var set = Object.create(null);
      parentCards.forEach(function (p) {
        if (p && p.id) set[String(p.id)] = true;
      });
      return set;
    }

    function renderParentPickerList(cards, query) {
      parentListEl.replaceChildren();
      var q = String(query || '')
        .trim()
        .toLowerCase();
      var linked = parentIdSet();
      var filtered = (cards || []).filter(function (card) {
        if (!card || !card.id) return false;
        if (linked[String(card.id)]) return false;
        if (!q) return true;
        var name = String(card.name || '').toLowerCase();
        var list = String(card.list || '').toLowerCase();
        return name.indexOf(q) !== -1 || list.indexOf(q) !== -1;
      });
      if (!filtered.length) {
        setParentStatus(
          q ? 'Aucune carte correspondante' : 'Aucune carte disponible',
          true
        );
        return;
      }
      setParentStatus('', false);
      filtered.slice(0, 40).forEach(function (card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-parent-option';
        btn.setAttribute('role', 'option');
        var nameEl = document.createElement('span');
        nameEl.className = 'info-parent-option-name';
        nameEl.textContent = card.name || 'Carte sans titre';
        btn.appendChild(nameEl);
        if (card.list) {
          var meta = document.createElement('span');
          meta.className = 'info-parent-option-list';
          meta.textContent = card.list;
          btn.appendChild(meta);
        }
        btn.title = 'Lier \u00e0\u00a0: ' + (card.name || 'Carte');
        btn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          applyParentChange(card);
        });
        parentListEl.appendChild(btn);
      });
    }

    function openParentPicker() {
      if (!getBoardCards || parentBusy) return;
      setParentPickerOpen(true);
      setParentStatus('Chargement des cartes\u2026', true);
      parentListEl.replaceChildren();
      ensureParentBoardCards().then(function (cards) {
        if (!parentPickerOpen) return;
        renderParentPickerList(cards, parentSearchInput.value);
        try {
          parentSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        onLayoutChange();
      });
    }

    function buildParentChip(parent) {
      var chip = document.createElement('span');
      chip.className = 'info-parent-chip';
      chip.dataset.parentId = parent.id;

      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'info-parent-chip-open';
      openBtn.disabled = parentBusy || !onOpenParent;
      openBtn.title = onOpenParent
        ? 'Ouvrir la t\u00e2che parente'
        : parent.name || '';

      var textEl = document.createElement('span');
      textEl.className = 'info-parent-chip-text';
      var nameEl = document.createElement('span');
      nameEl.className = 'info-parent-chip-name';
      nameEl.textContent = parent.name || 'Carte sans titre';
      textEl.appendChild(nameEl);
      if (parent.list) {
        var listEl = document.createElement('span');
        listEl.className = 'info-parent-chip-list';
        listEl.textContent = parent.list;
        textEl.appendChild(listEl);
      }
      openBtn.appendChild(textEl);

      var clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'info-parent-clear';
      clearBtn.setAttribute('aria-label', 'Retirer la t\u00e2che parente');
      clearBtn.title = 'Retirer';
      clearBtn.textContent = '\u00d7';
      clearBtn.disabled = parentBusy || !onParentChange;
      clearBtn.hidden = !onParentChange;

      openBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!onOpenParent || parentBusy || openBtn.disabled) return;
        Promise.resolve(onOpenParent(parent.id)).catch(function (err) {
          console.error('Info open parent failed', err);
        });
      });

      clearBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (clearBtn.disabled || parentBusy) return;
        applyParentChange(null, parent.id);
      });

      chip.appendChild(openBtn);
      chip.appendChild(clearBtn);
      return chip;
    }

    function renderParent() {
      var canPick = !!getBoardCards && !!onParentChange;
      parentChipsEl.replaceChildren();
      parentCards.forEach(function (parent) {
        parentChipsEl.appendChild(buildParentChip(parent));
      });
      parentPickBtn.hidden = !canPick;
      parentPickBtn.disabled = parentBusy;
      if (!canPick && !parentCards.length) {
        setParentStatus('', false);
      }
    }

    function applyParentChange(nextParent, removeParentId) {
      if (!onParentChange || parentBusy) return;
      parentBusy = true;
      renderParent();
      var payload =
        nextParent && nextParent.id
          ? nextParent
          : removeParentId
            ? { removeParentId: String(removeParentId) }
            : null;
      Promise.resolve(onParentChange(payload))
        .then(function (result) {
          if (result && result.ok === false) {
            var reason = result.reason || 'error';
            var msg =
              reason === 'self'
                ? 'Impossible de lier la carte \u00e0 elle-m\u00eame'
                : reason === 'cycle'
                  ? 'Ce lien cr\u00e9erait une boucle'
                  : 'Impossible de mettre \u00e0 jour la t\u00e2che parente';
            setParentStatus(msg, true);
            return;
          }
          if (result && Array.isArray(result.parents)) {
            parentCards = normalizeParentCards(result.parents);
          } else if (nextParent && nextParent.id) {
            parentCards = normalizeParentCards(
              parentCards.concat([
                {
                  id: String(nextParent.id),
                  name:
                    typeof nextParent.name === 'string' ? nextParent.name : '',
                  list:
                    typeof nextParent.list === 'string' ? nextParent.list : '',
                },
              ])
            );
          } else if (removeParentId) {
            var rid = String(removeParentId);
            parentCards = parentCards.filter(function (p) {
              return !(p && String(p.id) === rid);
            });
          } else {
            parentCards = [];
          }
          setParentPickerOpen(false);
          setParentStatus('', false);
          parentBoardCardsCache = null;
        })
        .catch(function (err) {
          console.error('Info parent change failed', err);
          setParentStatus('Impossible de mettre \u00e0 jour la t\u00e2che parente', true);
        })
        .then(function () {
          parentBusy = false;
          renderParent();
          onLayoutChange();
        });
    }

    function summaryText() {
      if (titleText && !titleInput.classList.contains('is-loading')) {
        return titleText;
      }
      var bits = [];
      if (impactReachLabel) bits.push(impactReachLabel);
      return bits.join(' \u00b7 ');
    }

    function flushTitleSave() {
      if (titleSaveTimer) {
        clearTimeout(titleSaveTimer);
        titleSaveTimer = null;
      }
      if (!onTitleChange || !titleDirty || titleBusy) return Promise.resolve();
      var next = (titleInput.value || '').trim();
      if (!next) {
        // Trello titles cannot be empty — restore last saved value.
        titleInput.value = titleText || '';
        titleDirty = false;
        setTitleStatus('Le titre ne peut pas \u00eatre vide', 'error');
        syncTitleInputSize();
        onLayoutChange();
        return Promise.resolve({ ok: false, reason: 'empty-name', changed: false });
      }
      if (next === titleText) {
        titleDirty = false;
        titleInput.value = next;
        syncTitleInputSize();
        return Promise.resolve({ ok: true, changed: false, name: next });
      }
      titleBusy = true;
      setTitleStatus('', 'saving');
      return Promise.resolve(onTitleChange(next))
        .then(function (result) {
          titleBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setTitleStatus('', 'error');
            } else if (result.reason === 'empty-name') {
              setTitleStatus('Le titre ne peut pas \u00eatre vide', 'error');
            } else {
              setTitleStatus('\u00c9chec de l\u2019enregistrement', 'error');
            }
            return result;
          }
          titleDirty = false;
          titleText = next;
          titleInput.value = next;
          setAuthHint('');
          setTitleStatus('', 'ok');
          collapse.refreshSummary();
          scheduleLabelSuggestions(false);
          scheduleTaskTypeSuggestions(false);
          setTimeout(function () {
            if (titleStatus.classList.contains('is-ok')) setTitleStatus('');
          }, 1400);
          syncTitleInputSize();
          onLayoutChange();
          return result;
        })
        .catch(function (err) {
          titleBusy = false;
          console.error('Info title save failed', err);
          setTitleStatus('\u00c9chec de l\u2019enregistrement', 'error');
        });
    }

    function scheduleTitleSave() {
      titleDirty = true;
      setTitleStatus('');
      if (titleSaveTimer) clearTimeout(titleSaveTimer);
      titleSaveTimer = setTimeout(function () {
        titleSaveTimer = null;
        flushTitleSave();
      }, FIELD_SAVE_MS);
    }

    function setDescSpellchecking(on) {
      descSpellSpinner.hidden = !on;
      descInput.classList.toggle('is-spellchecking', !!on);
      descRich.classList.toggle('is-spellchecking', !!on);
      if (on) descInput.setAttribute('aria-busy', 'true');
      else descInput.removeAttribute('aria-busy');
      if (on) descRich.setAttribute('aria-busy', 'true');
      else descRich.removeAttribute('aria-busy');
    }

    function clearDescSpellRevert() {
      if (descSpellRevert && typeof descSpellRevert.dismiss === 'function') {
        descSpellRevert.dismiss();
      }
      descSpellRevert = null;
    }

    function showDescSpellRevert(original, corrected) {
      clearDescSpellRevert();
      if (
        !original ||
        !corrected ||
        original === corrected ||
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.attachRevert !== 'function'
      ) {
        return;
      }
      descSpellRevert = global.Spellcheck.attachRevert(descMeta, {
        before: descStatus,
        previous: original,
        onRevert: function () {
          descSpellRevert = null;
          if (descInput.value !== corrected && descInput.value.trim() !== corrected.trim()) {
            return;
          }
          descInput.value = original;
          if (descMode === 'rich') renderDescRich();
          descSpellcheckedText = original.trim() || null;
          descDirty = true;
          if (descMode === 'markdown') syncDescInputSize();
          else syncDescRichSize();
          onLayoutChange();
          flushDescSave();
        },
        onDismiss: function () {
          descSpellRevert = null;
          onLayoutChange();
        }
      });
      onLayoutChange();
    }

    function spellcheckDescText(text) {
      var trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) return Promise.resolve('');
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return Promise.resolve(trimmed);
      }
      return global.Spellcheck.correct(trimmed).then(
        function (corrected) {
          return typeof corrected === 'string' ? corrected.trim() : trimmed;
        },
        function () {
          return trimmed;
        }
      );
    }

    /**
     * Save first (never blocked). Then AI may refine orthography in the background;
     * apply only if the field is unchanged since this check started.
     */
    function spellcheckDescAfterCommit() {
      if (
        typeof global.Spellcheck === 'undefined' ||
        typeof global.Spellcheck.correct !== 'function'
      ) {
        return;
      }
      var snapshot = descInput.value;
      var trimmed = snapshot.trim();
      if (!trimmed) {
        descSpellcheckedText = snapshot;
        setDescSpellchecking(false);
        return;
      }
      if (trimmed === descSpellcheckedText) return;
      var gen = ++descSpellcheckGen;
      setDescSpellchecking(true);
      onLayoutChange();
      spellcheckDescText(snapshot).then(function (corrected) {
        if (gen !== descSpellcheckGen) return;
        setDescSpellchecking(false);
        if (!corrected || corrected === trimmed) {
          descSpellcheckedText = trimmed;
          onLayoutChange();
          return;
        }
        // User edited again while we were checking — discard this correction.
        if (descInput.value !== snapshot) {
          onLayoutChange();
          return;
        }
        descInput.value = corrected;
        if (descMode === 'rich') renderDescRich();
        descSpellcheckedText = corrected.trim();
        descDirty = true;
        showDescSpellRevert(snapshot, corrected);
        if (descMode === 'markdown') syncDescInputSize();
        else syncDescRichSize();
        onLayoutChange();
        flushDescSave();
      }).catch(function () {
        if (gen !== descSpellcheckGen) return;
        setDescSpellchecking(false);
        onLayoutChange();
      });
    }

    function flushDescSave() {
      syncDescSourceFromRich();
      if (descSaveTimer) {
        clearTimeout(descSaveTimer);
        descSaveTimer = null;
      }
      if (!onDescChange || !descDirty || descBusy) return Promise.resolve();
      var next = fullDescFromEditor();
      descBusy = true;
      setDescStatus('', 'saving');
      return Promise.resolve(onDescChange(next))
        .then(function (result) {
          descBusy = false;
          if (result && result.ok === false) {
            if (result.reason === 'not-authorized' || result.reason === 'no-app-key') {
              setAuthHint(result.reason);
              setDescStatus('', 'error');
            } else {
              setDescStatus('\u00c9chec de l\u2019enregistrement', 'error');
            }
            return result;
          }
          // Spellcheck (or typing) may have changed the field while this save ran.
          var currentFull = fullDescFromEditor();
          if (currentFull !== next) {
            descText = next;
            descDirty = true;
            scheduleDescSave();
            return result;
          }
          descDirty = false;
          descText = next;
          syncDescMetaToggle();
          setAuthHint('');
          setDescStatus('', 'ok');
          scheduleLabelSuggestions(false);
          scheduleTaskTypeSuggestions(false);
          setTimeout(function () {
            if (descStatus.classList.contains('is-ok')) setDescStatus('');
          }, 1400);
          return result;
        })
        .catch(function (err) {
          descBusy = false;
          console.error('Info description save failed', err);
          setDescStatus('\u00c9chec de l\u2019enregistrement', 'error');
        });
    }

    function scheduleDescSave() {
      descDirty = true;
      setDescStatus('');
      if (descSaveTimer) clearTimeout(descSaveTimer);
      descSaveTimer = setTimeout(function () {
        descSaveTimer = null;
        flushDescSave();
      }, FIELD_SAVE_MS);
    }

    titleInput.addEventListener('input', function () {
      if (titleInput.classList.contains('is-loading')) return;
      scheduleTitleSave();
      syncTitleInputSize();
      onLayoutChange();
    });
    titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.blur();
      }
    });
    titleInput.addEventListener('blur', function () {
      flushTitleSave();
    });

    descInput.addEventListener('input', function () {
      // Invalidate in-flight spellcheck so a stale correction cannot overwrite new typing.
      descSpellcheckGen += 1;
      setDescSpellchecking(false);
      clearDescSpellRevert();
      scheduleDescSave();
      syncDescInputSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
    });
    descInput.addEventListener('keyup', function () {
      syncDescFormatMenuSelection();
    });
    descInput.addEventListener('click', function () {
      syncDescFormatMenuSelection();
    });
    descInput.addEventListener('keydown', function (e) {
      var key = e.key;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        applyDescMarkdownInline('**');
        return;
      }
      if (key === 'i' || key === 'I') {
        e.preventDefault();
        applyDescMarkdownInline('*');
        return;
      }
      if (key === 'k' || key === 'K') {
        e.preventDefault();
        promptDescLinkUrl();
        return;
      }
    });
    descInput.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var state = getDescEditState();
      if (state.start === state.end) return;
      var url = normalizePasteableMarkdownUrl(e.clipboardData.getData('text/plain'));
      if (!url) return;
      e.preventDefault();
      applyDescMarkdownLink(url);
    });
    descInput.addEventListener('blur', function () {
      // Persist immediately; spellcheck runs async with a small spinner.
      flushDescSave();
      spellcheckDescAfterCommit();
    });
    descRich.addEventListener('input', function () {
      descSpellcheckGen += 1;
      setDescSpellchecking(false);
      clearDescSpellRevert();
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
      syncDescFormatMenuSelection();
      onLayoutChange();
    });
    descRich.addEventListener('change', function (e) {
      if (!e.target || richNodeName(e.target) !== 'INPUT') return;
      syncDescSourceFromRich();
      scheduleDescSave();
    });
    descRich.addEventListener('keyup', syncDescFormatMenuSelection);
    descRich.addEventListener('mouseup', syncDescFormatMenuSelection);
    descRich.addEventListener('keydown', function (e) {
      var key = e.key;
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (key === 'b' || key === 'B') {
        e.preventDefault();
        execDescRichCommand('bold');
      } else if (key === 'i' || key === 'I') {
        e.preventDefault();
        execDescRichCommand('italic');
      } else if (key === 'k' || key === 'K') {
        e.preventDefault();
        promptDescLinkUrl();
      }
    });
    descRich.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var plain = e.clipboardData.getData('text/plain');
      var pasteUrl = normalizePasteableMarkdownUrl(plain);
      var sel = getDescRichSelection();
      if (pasteUrl && sel && !sel.isCollapsed) {
        e.preventDefault();
        applyDescRichLink(pasteUrl);
        return;
      }
      e.preventDefault();
      var temp = document.createElement('div');
      var html = e.clipboardData.getData('text/html');
      if (html) temp.innerHTML = html;
      else temp.textContent = plain;
      var safeMarkdown = markdownFromRichRoot(temp);
      var safeHtml = renderMarkdownToHtml(safeMarkdown);
      try {
        document.execCommand('insertHTML', false, safeHtml);
      } catch (err) {
        document.execCommand('insertText', false, plain);
      }
      syncDescSourceFromRich();
      scheduleDescSave();
      syncDescRichSize();
    });
    descRich.addEventListener('blur', function () {
      syncDescSourceFromRich();
      flushDescSave();
      spellcheckDescAfterCommit();
    });

    // Keep the current editor selection when interacting with the toolbar.
    descToolbar.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    descFormatBtn.addEventListener('click', function () {
      if (descFormatMenu.hidden) openDescFormatMenu();
      else closeDescFormatMenu();
      focusDescEditor(false);
    });
    descFormatMenu.addEventListener('click', function (e) {
      var opt =
        e.target && e.target.closest
          ? e.target.closest('[data-md-kind]')
          : null;
      if (!opt) return;
      var kind = opt.getAttribute('data-md-kind');
      closeDescFormatMenu();
      if (descMode === 'rich') applyDescRichBlock(kind);
      else applyDescMarkdownBlock(kind);
    });
    descBoldBtn.addEventListener('click', function () {
      if (descMode === 'rich') execDescRichCommand('bold');
      else applyDescMarkdownInline('**');
    });
    descItalicBtn.addEventListener('click', function () {
      if (descMode === 'rich') execDescRichCommand('italic');
      else applyDescMarkdownInline('*');
    });
    descStrikeBtn.addEventListener('click', function () {
      if (descMode === 'rich') execDescRichCommand('strikeThrough');
      else applyDescMarkdownInline('~~');
    });
    descLinkBtn.addEventListener('click', function () {
      promptDescLinkUrl();
    });
    descChecklistBtn.addEventListener('click', function () {
      if (descMode === 'rich') applyDescRichBlock('checklist');
      else applyDescMarkdownBlock('checklist');
    });
    descModeSwitch.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest
        ? e.target.closest('[data-desc-mode]')
        : null;
      if (!btn) return;
      setDescMode(btn.getAttribute('data-desc-mode'));
    });
    document.addEventListener('mousedown', function (e) {
      if (!descFormatMenu.hidden && !descFormatWrap.contains(e.target)) {
        closeDescFormatMenu();
      }
    });

    authBtn.addEventListener('click', function () {
      if (!onAuthorize || authBusy) return;
      authBusy = true;
      authBtn.disabled = true;
      Promise.resolve(onAuthorize())
        .then(function () {
          setAuthHint('');
          return flushTitleSave();
        })
        .then(function () {
          return flushDescSave();
        })
        .catch(function (err) {
          console.error('Info REST authorize failed', err);
          setAuthHint('not-authorized');
        })
        .then(function () {
          authBusy = false;
          authBtn.disabled = false;
          onLayoutChange();
        });
    });

    membersAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (membersAddBtn.disabled) return;
      setMembersPickerOpen(!membersPickerOpen);
    });

    labelsAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (labelsAddBtn.disabled) return;
      setLabelsPickerOpen(!labelsPickerOpen);
    });

    taskTypesAddBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (taskTypesAddBtn.disabled) return;
      setTaskTypesPickerOpen(!taskTypesPickerOpen);
    });

    taskTypesCreateIconBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (taskTypesBusy) return;
      setTaskTypesIconPickerOpen(!taskTypesIconPickerOpen);
    });

    taskTypesCreateInput.addEventListener('input', function () {
      if (!taskTypesPickerOpen) {
        syncTaskTypesCreateBtn();
        return;
      }
      renderTaskTypesPicker();
      onLayoutChange();
      requestAnimationFrame(positionTaskTypesPicker);
    });
    taskTypesCreateInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    taskTypesCreateInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setTaskTypesPickerOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      var q = String(taskTypesCreateInput.value || '').trim();
      var matches = filteredAvailableTaskTypeEntries(q);
      if (matches.length === 1) {
        addTaskType(matches[0].id);
        return;
      }
      if (matches.length > 1 && q) {
        var exact = null;
        var qKey = q.toLocaleLowerCase('fr-FR');
        for (var i = 0; i < matches.length; i++) {
          if (
            String(matches[i].label || '')
              .toLocaleLowerCase('fr-FR') === qKey
          ) {
            exact = matches[i];
            break;
          }
        }
        if (exact) {
          addTaskType(exact.id);
          return;
        }
      }
      submitCreateTaskType();
    });
    taskTypesCreateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      submitCreateTaskType();
    });

    window.addEventListener('resize', function () {
      if (taskTypesPickerOpen) positionTaskTypesPicker();
    });
    document.addEventListener(
      'scroll',
      function () {
        if (taskTypesPickerOpen) positionTaskTypesPicker();
      },
      true
    );

    labelsSearchInput.addEventListener('input', function () {
      if (!labelsPickerOpen) return;
      renderLabelsPicker();
      onLayoutChange();
    });

    labelsSearchInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    labelsSearchInput.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLabelsPickerOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      var q = String(labelsSearchInput.value || '').trim();
      var matches = filteredAvailableBoardLabels(q);
      if (matches.length === 1) {
        addLabelFromPicker(matches[0]);
        return;
      }
      if (matches.length > 1 && q) {
        var exact = null;
        for (var i = 0; i < matches.length; i++) {
          if (labelDisplayName(matches[i]).toLowerCase() === q.toLowerCase()) {
            exact = matches[i];
            break;
          }
        }
        if (exact) {
          addLabelFromPicker(exact);
          return;
        }
      }
      if (onLabelCreate && q && !boardHasLabelName(q)) {
        createLabelFromPicker();
      }
    });

    labelsCreateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (labelsCreateBtn.disabled) {
        try {
          labelsSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      if (!String(labelsSearchInput.value || '').trim()) {
        try {
          labelsSearchInput.focus();
        } catch (e) {
          /* ignore */
        }
        return;
      }
      createLabelFromPicker();
    });

    if (labelsSuggestRefreshBtn) {
      labelsSuggestRefreshBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        refreshLabelSuggestions(true);
      });
    }

    if (taskTypesSuggestRefreshBtn) {
      taskTypesSuggestRefreshBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        refreshTaskTypeSuggestions(true);
      });
    }

    parentPickBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (parentPickBtn.disabled || !getBoardCards) return;
      if (parentPickerOpen) setParentPickerOpen(false);
      else openParentPicker();
    });

    parentSearchInput.addEventListener('input', function () {
      ensureParentBoardCards().then(function (cards) {
        if (!parentPickerOpen) return;
        renderParentPickerList(cards, parentSearchInput.value);
        onLayoutChange();
      });
    });

    parentSearchInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.addEventListener('click', function (event) {
      if (membersPickerOpen && !membersAddWrap.contains(event.target)) {
        setMembersPickerOpen(false);
      }
      if (!tgHost.contains(event.target)) tgCloseEditor();
      if (
        memberRolesPickerMemberId &&
        !membersWrap.contains(event.target)
      ) {
        setMemberRolesPickerOpen('');
      }
      if (placesPickerSlot && !placesWrap.contains(event.target)) {
        setPlacesPickerOpen('');
      }
      if (labelsPickerOpen && !labelsAddWrap.contains(event.target)) {
        setLabelsPickerOpen(false);
      }
      if (taskTypesPickerOpen && !taskTypesAddWrap.contains(event.target)) {
        setTaskTypesPickerOpen(false);
      } else if (
        taskTypesIconPickerOpen &&
        !taskTypesCreateWrap.contains(event.target)
      ) {
        setTaskTypesIconPickerOpen(false);
      }
      if (
        labelsColorEditId &&
        !labelsWrap.contains(event.target)
      ) {
        setLabelsColorPickerOpen('');
      }
      if (parentPickerOpen && !parentPickWrap.contains(event.target)) {
        setParentPickerOpen(false);
      }
    });

    // Folded \u00ab Plus de d\u00e9tails \u00bb: objectif, parents, type and label chips
    // (same order as the section body).
    function moreDetailsSummaryNode() {
      var nodes = [];
      var crumbs = objectifRow.row.hidden ? [] : objectifCrumbNames();
      if (crumbs.length) {
        nodes.push(
          irsChip({
            className: 'irs-objectif is-last',
            lead: irsIcon('target-arrow'),
            text: crumbs[crumbs.length - 1],
            title: crumbs.join(' \u2192 ')
          })
        );
      }
      if (parentCards.length === 1) {
        nodes.push(irsParentChip(parentCards[0], false));
      } else if (parentCards.length > 1) {
        nodes.push(
          irsChip({
            className: 'irs-parent',
            lead: irsIcon('hierarchy-3'),
            text: parentCards.length + ' parents',
            title: parentCards
              .map(function (p) {
                return p.name || 'Carte sans titre';
              })
              .join(', ')
          })
        );
      }
      nodes = nodes.concat(irsCapped(taskTypes.map(irsTypeChip), 2));
      nodes = nodes.concat(irsCapped(labels.map(irsLabelChip), 3));
      return nodes.length ? irsFragment(nodes) : '';
    }

    function paintMoreDetailsSummary() {
      if (moreDetailsExpanded) {
        moreSummaryEl.replaceChildren();
        moreSummaryEl.hidden = true;
        return;
      }
      var node = moreDetailsSummaryNode();
      moreSummaryEl.classList.toggle('is-empty', !node);
      if (node) moreSummaryEl.replaceChildren(node);
      else moreSummaryEl.textContent = 'Objectif, parents, types, \u00e9tiquettes\u2026';
      moreSummaryEl.hidden = !moreSummaryEl.textContent;
    }

    if (typeof global.MutationObserver === 'function') {
      var moreSummaryTimer = null;
      new global.MutationObserver(function () {
        if (moreDetailsExpanded) return;
        clearTimeout(moreSummaryTimer);
        moreSummaryTimer = setTimeout(paintMoreDetailsSummary, 80);
      }).observe(moreBody, { childList: true, subtree: true, characterData: true });
    }

    function applyMoreDetailsExpanded(next, options) {
      options = options || {};
      var was = moreDetailsExpanded;
      moreDetailsExpanded = !!next;
      moreBody.hidden = !moreDetailsExpanded;
      moreRow.row.classList.toggle('is-expanded', moreDetailsExpanded);
      moreToggle.setAttribute(
        'aria-expanded',
        moreDetailsExpanded ? 'true' : 'false'
      );
      moreToggle.setAttribute(
        'aria-label',
        moreDetailsExpanded
          ? 'Replier Plus de d\u00e9tails'
          : 'D\u00e9velopper Plus de d\u00e9tails'
      );
      paintMoreDetailsSummary();
      if (was !== moreDetailsExpanded && !options.silent) {
        onMoreDetailsExpandChange(moreDetailsExpanded, options);
      }
      if (!options.silent) onLayoutChange();
    }

    moreToggle.addEventListener('click', function (event) {
      event.preventDefault();
      applyMoreDetailsExpanded(!moreDetailsExpanded);
    });

    if (
      global.ContextMenu &&
      typeof global.ContextMenu.bind === 'function' &&
      typeof global.ContextMenu.buildInfoItems === 'function'
    ) {
      ContextMenu.bind(moreRow.row, function () {
        return ContextMenu.buildInfoItems({
          isExpanded: function () {
            return moreDetailsExpanded;
          },
          setExpanded: function (on) {
            applyMoreDetailsExpanded(!!on);
          },
          openGoals:
            typeof config.onOpenGoals === 'function'
              ? function () {
                  config.onOpenGoals();
                }
              : null,
        });
      });
    }

    var moreCollapse = {
      refreshSummary: paintMoreDetailsSummary,
      setExpanded: function (on, opts) {
        applyMoreDetailsExpanded(!!on, opts);
      },
      isExpanded: function () {
        return moreDetailsExpanded;
      },
    };

    // Primary Détails is always open (no accordion); keep a stub for callers.
    var collapse = {
      refreshSummary: function () {
        if (moreCollapse && typeof moreCollapse.refreshSummary === 'function') {
          moreCollapse.refreshSummary();
        }
      },
      setExpanded: function () {
        return true;
      },
      isExpanded: function () {
        return true;
      },
    };

    renderMembers();
    renderLabels();
    renderTaskTypes();
    renderParent();
    setAuthHint(authReason);
    syncTitleInputSize();
    setDescMode('rich', { focus: false });
    applyMoreDetailsExpanded(moreDetailsExpanded, { silent: true });
    sortEmptyRowsDown(body);
    sortEmptyRowsDown(moreBody);
    scheduleLabelSuggestions(false);
    scheduleTaskTypeSuggestions(false);

    return {
      field: field,
      moreDetailsEl: moreRow.row,
      getMoreDetailsEl: function () {
        return moreRow.row;
      },
      getHistoriqueMount: function () {
        return historiqueMount;
      },
      getPriorityMount: function () {
        return priorityInline.mount;
      },
      getProgressMount: function () {
        return progressInline.mount;
      },
      getDueMount: function () {
        return dueInline.mount;
      },
      setInlineFeatureVisible: function (key, visible) {
        var row =
          key === 'priority'
            ? priorityInline.row
            : key === 'progress'
              ? progressInline.row
              : key === 'due'
                ? dueInline.row
                : null;
        if (!row) return;
        row.hidden = !visible;
        onLayoutChange();
      },
      setMoreDetailsExpanded: function (on, opts) {
        return moreCollapse.setExpanded(on, opts);
      },
      isMoreDetailsExpanded: function () {
        return moreCollapse.isExpanded();
      },
      setTitle: function (name, options) {
        options = options || {};
        var value = typeof name === 'string' ? name : '';
        if (titleDirty && !options.force) return;
        if (document.activeElement === titleInput && !options.force) return;
        titleText = value;
        titleInput.readOnly = false;
        titleInput.classList.remove('is-loading');
        if (titleText) {
          titleInput.value = titleText;
          titleInput.title = titleText;
        } else {
          titleInput.value = '';
          titleInput.title = '';
          titleInput.placeholder = 'Titre de la carte';
        }
        titleDirty = false;
        syncTitleInputSize();
        collapse.refreshSummary();
        scheduleLabelSuggestions(false);
        scheduleTaskTypeSuggestions(false);
      },
      getTitle: function () {
        if (titleInput.classList.contains('is-loading')) return titleText || '';
        return (titleInput.value || '').trim() || titleText || '';
      },
      setDesc: function (next, options) {
        options = options || {};
        var value = typeof next === 'string' ? next : '';
        if (descDirty && !options.force) return;
        if (
          (document.activeElement === descInput || document.activeElement === descRich) &&
          !options.force
        ) {
          return;
        }
        descSpellcheckGen += 1;
        setDescSpellchecking(false);
        clearDescSpellRevert();
        applyFullDescToEditor(value);
        descDirty = false;
        descSpellcheckedText = splitFullDesc(value).visible.trim() || null;
        scheduleLabelSuggestions(false);
        scheduleTaskTypeSuggestions(false);
      },
      getDesc: function () {
        return fullDescFromEditor();
      },
      getDescVisible: function () {
        syncDescSourceFromRich();
        return visibleFromEditorValue(descInput.value);
      },
      getDescMeta: function () {
        fullDescFromEditor();
        return cloneMetaMap(descMetaMap);
      },
      setShowDescMeta: function (on) {
        var want = !!on;
        if (want === showDescMeta) return;
        syncDescSourceFromRich();
        if (showDescMeta) {
          var split = splitFullDesc(descInput.value);
          descMetaMap = cloneMetaMap(split.meta);
          showDescMeta = false;
          descInput.value = split.visible;
        } else {
          showDescMeta = true;
          descInput.value = joinFullDesc(descInput.value, descMetaMap);
        }
        if (descMode === 'rich') renderDescRich();
        else syncDescInputSize();
        syncDescMetaToggle();
        onLayoutChange();
      },
      setMembers: function (list) {
        members = Array.isArray(list) ? list.slice() : [];
        renderMembers();
        onLayoutChange();
      },
      setCustomAssignees: function (list) {
        customAssignees = normalizeCustomAssignees(list);
        renderMembers();
        onLayoutChange();
      },
      setTeamLinks: function (list) {
        teamLinks = normalizeTeamLinks(list);
        renderTeamGraph();
        onLayoutChange();
      },
      getTeamLinks: function () {
        return normalizeTeamLinks(teamLinks);
      },
      getCustomAssignees: function () {
        return normalizeCustomAssignees(customAssignees);
      },
      setCustomAssigneeCatalog: function (list) {
        setCustomAssigneeCatalog(list);
        if (membersPickerOpen) renderMembersPicker();
        onLayoutChange();
      },
      getCustomAssigneeCatalog: function () {
        return getCustomAssigneeCatalog();
      },
      setPlaces: function (next) {
        cardPlaces = normalizePlaces(next);
        renderPlaces();
        onLayoutChange();
      },
      getPlaces: function () {
        return normalizePlaces(cardPlaces);
      },
      setPlaceCatalog: function (list) {
        setPlaceCatalog(list);
        if (placesPickerSlot) renderPlacesPicker();
        onLayoutChange();
      },
      getPlaceCatalog: function () {
        return getPlaceCatalog();
      },
      setMemberRoles: function (map) {
        memberRoles = normalizeMemberRoles(map);
        renderMembers();
        onLayoutChange();
      },
      getMemberRoles: function () {
        return normalizeMemberRoles(memberRoles);
      },
      setMemberRoleCustoms: function (list) {
        setMemberRoleCustoms(list);
        renderMembers();
        onLayoutChange();
      },
      getMemberRoleCustoms: function () {
        return getMemberRoleCustoms();
      },
      setMemberRoleCatalog: function (list) {
        setMemberRoleCatalog(list);
        renderMembers();
        if (memberRolesPickerMemberId) {
          renderMemberRolesPicker(memberRolesPickerMemberId);
        }
        onLayoutChange();
      },
      setCreator: function (member) {
        creatorMember =
          member && typeof member === 'object' && member.id ? member : null;
        renderCreator();
        onLayoutChange();
      },
      setBoardMembers: function (list) {
        boardMembers = Array.isArray(list) ? list.slice() : [];
        renderMembers();
        renderCreator();
        onLayoutChange();
      },
      setLabels: function (list) {
        labels = Array.isArray(list) ? list.slice() : [];
        if (labelsRenameId && !findLabelById(labels, labelsRenameId)) {
          cancelLabelRename({ render: false });
        }
        renderLabels();
        scheduleLabelSuggestions(false);
        onLayoutChange();
      },
      setBoardLabels: function (list) {
        boardLabels = Array.isArray(list) ? list.slice() : [];
        renderLabels();
        scheduleLabelSuggestions(false);
        onLayoutChange();
      },
      setTaskTypes: function (list) {
        taskTypes = normalizeTaskTypes(list);
        renderTaskTypes();
        scheduleTaskTypeSuggestions(false);
        onLayoutChange();
      },
      getTaskTypes: function () {
        return taskTypes.slice();
      },
      setCustomTaskTypes: function (list) {
        setCustomTaskTypes(list);
        renderTaskTypes();
        scheduleTaskTypeSuggestions(false);
        onLayoutChange();
      },
      getCustomTaskTypes: function () {
        return getCustomTaskTypes();
      },
      setDismissedTaskTypeSuggestions: function (list) {
        dismissedTaskTypeSuggestions = normalizeTaskTypes(list);
        pruneTaskTypeSuggestions();
        renderTaskTypeSuggestions();
        onLayoutChange();
      },
      getDismissedTaskTypeSuggestions: function () {
        return dismissedTaskTypeSuggestions.slice();
      },
      setRecap: function (next) {
        if (!next) return;
        if (next.priorityLabel != null) priorityLabel = String(next.priorityLabel || '');
        if (next.impactReach != null) impactReachLabel = String(next.impactReach || '');
        collapse.refreshSummary();
      },
      setAuthReason: function (reason) {
        setAuthHint(reason || '');
        onLayoutChange();
      },
      setParents: function (next) {
        parentCards = normalizeParentCards(next);
        renderParent();
        onLayoutChange();
      },
      setParent: function (next) {
        parentCards = normalizeParentCards(next ? [next] : []);
        renderParent();
        onLayoutChange();
      },
      getParents: function () {
        return parentCards.map(function (p) {
          return {
            id: p.id,
            name: p.name || '',
            list: p.list || '',
          };
        });
      },
      getParent: function () {
        return parentCards.length
          ? {
              id: parentCards[0].id,
              name: parentCards[0].name || '',
              list: parentCards[0].list || '',
            }
          : null;
      },
      getObjectifMount: function () {
        return objectifMount;
      },
      setObjectifVisible: function (visible) {
        objectifRow.row.hidden = !visible;
        if (moreCollapse && typeof moreCollapse.refreshSummary === 'function') {
          moreCollapse.refreshSummary();
        }
        onLayoutChange();
      },
      flushTitle: flushTitleSave,
      flushDesc: flushDescSave,
      refreshSummary: function () {
        collapse.refreshSummary();
      },
      setExpanded: function () {
        return true;
      },
      isExpanded: function () {
        return true;
      }
    };
  }

  // exports
  S.createInfoField = createInfoField;
})(typeof window !== 'undefined' ? window : this);
