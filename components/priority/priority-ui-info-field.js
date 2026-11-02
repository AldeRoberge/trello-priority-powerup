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
    var M = Object.create(null);
    M.config = config;
    var __parts = (global.PriorityUIPartsMountCreateInfoField || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  // exports
  S.createInfoField = createInfoField;

  // shared with the createInfoField parts
  S.S = S;
})(typeof window !== 'undefined' ? window : this);
