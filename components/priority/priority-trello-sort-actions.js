/**
 * priority-trello: part 3 of 3 (sizeToContent).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityTrelloParts = global.PriorityTrelloParts || {});

  // from earlier parts (values)
  var BADGE_REFRESH_SEC = S.BADGE_REFRESH_SEC;
  var CARD_DUE_SYNCED_KEY = S.CARD_DUE_SYNCED_KEY;
  var CARD_PRIORITY_KEY = S.CARD_PRIORITY_KEY;
  var CARD_START_SYNCED_KEY = S.CARD_START_SYNCED_KEY;
  var COLOR_MODE_STORAGE_KEY = S.COLOR_MODE_STORAGE_KEY;
  var COLOR_SCHEME_REV_KEY = S.COLOR_SCHEME_REV_KEY;
  var COLOR_SCHEME_SETTINGS_KEY = S.COLOR_SCHEME_SETTINGS_KEY;
  var CUSTOM_ASSIGNEE_CATALOG_KEY = S.CUSTOM_ASSIGNEE_CATALOG_KEY;
  var DEFAULT_INPUTS = S.DEFAULT_INPUTS;
  var FORMULA_SETTINGS_KEY = S.FORMULA_SETTINGS_KEY;
  var IMPORTANT_INPUTS = S.IMPORTANT_INPUTS;
  var MATRIX_SETTINGS_KEY = S.MATRIX_SETTINGS_KEY;
  var MEMBER_ROLE_CATALOG_KEY = S.MEMBER_ROLE_CATALOG_KEY;
  var PLACE_CATALOG_KEY = S.PLACE_CATALOG_KEY;
  var PRIORITY_DIMENSIONS = S.PRIORITY_DIMENSIONS;
  var SORT_TIER_INUTILE = S.SORT_TIER_INUTILE;
  var SORT_TIER_NONE = S.SORT_TIER_NONE;

  // from other parts (functions, resolved at call time)
  function addCardLabel() { return S.addCardLabel.apply(this, arguments); }
  function addCardMember() { return S.addCardMember.apply(this, arguments); }
  function applyColorMode() { return S.applyColorMode.apply(this, arguments); }
  function brandAppName() { return S.brandAppName.apply(this, arguments); }
  function buildCardFaceBadge() { return S.buildCardFaceBadge.apply(this, arguments); }
  function cardDataPromise() { return S.cardDataPromise.apply(this, arguments); }
  function cardDetailBadges() { return S.cardDetailBadges.apply(this, arguments); }
  function cardFaceBadges() { return S.cardFaceBadges.apply(this, arguments); }
  function cardFieldPromise() { return S.cardFieldPromise.apply(this, arguments); }
  function cardPluginScope() { return S.cardPluginScope.apply(this, arguments); }
  function clearBlockedFromInputs() { return S.clearBlockedFromInputs.apply(this, arguments); }
  function clearBlockedIfComplete() { return S.clearBlockedIfComplete.apply(this, arguments); }
  function computeDisplay() { return S.computeDisplay.apply(this, arguments); }
  function createBoardLabel() { return S.createBoardLabel.apply(this, arguments); }
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function dbgLog() { return S.dbgLog.apply(this, arguments); }
  function deleteBoardLabel() { return S.deleteBoardLabel.apply(this, arguments); }
  function ensureBoardPriorityContext() { return S.ensureBoardPriorityContext.apply(this, arguments); }
  function ensureCreatorAssigned() { return S.ensureCreatorAssigned.apply(this, arguments); }
  function formatBadgeText() { return S.formatBadgeText.apply(this, arguments); }
  function formatBlockedBoardBadgeText() { return S.formatBlockedBoardBadgeText.apply(this, arguments); }
  function getBadgeData() { return S.getBadgeData.apply(this, arguments); }
  function getBoardColorScheme() { return S.getBoardColorScheme.apply(this, arguments); }
  function getBoardFormula() { return S.getBoardFormula.apply(this, arguments); }
  function getBoardLabels() { return S.getBoardLabels.apply(this, arguments); }
  function getBoardMembers() { return S.getBoardMembers.apply(this, arguments); }
  function getCachedBoardColorSchemeKey() { return S.getCachedBoardColorSchemeKey.apply(this, arguments); }
  function getCachedCustomAssigneeCatalog() { return S.getCachedCustomAssigneeCatalog.apply(this, arguments); }
  function getCachedCustomTaskTypes() { return S.getCachedCustomTaskTypes.apply(this, arguments); }
  function getCachedMemberRoleCatalog() { return S.getCachedMemberRoleCatalog.apply(this, arguments); }
  function getCachedPlaceCatalog() { return S.getCachedPlaceCatalog.apply(this, arguments); }
  function getCardCreator() { return S.getCardCreator.apply(this, arguments); }
  function getCardDesc() { return S.getCardDesc.apply(this, arguments); }
  function getCardDisplay() { return S.getCardDisplay.apply(this, arguments); }
  function getCardDue() { return S.getCardDue.apply(this, arguments); }
  function getCardDueComplete() { return S.getCardDueComplete.apply(this, arguments); }
  function getCardInputs() { return S.getCardInputs.apply(this, arguments); }
  function getCardLabels() { return S.getCardLabels.apply(this, arguments); }
  function getCardMembers() { return S.getCardMembers.apply(this, arguments); }
  function getCardName() { return S.getCardName.apply(this, arguments); }
  function getCardOverviewSnapshot() { return S.getCardOverviewSnapshot.apply(this, arguments); }
  function getCardStart() { return S.getCardStart.apply(this, arguments); }
  function getCurrentMember() { return S.getCurrentMember.apply(this, arguments); }
  function getCustomAssigneeCatalog() { return S.getCustomAssigneeCatalog.apply(this, arguments); }
  function getCustomTaskTypes() { return S.getCustomTaskTypes.apply(this, arguments); }
  function getMatrixSettings() { return S.getMatrixSettings.apply(this, arguments); }
  function getMemberRoleCatalog() { return S.getMemberRoleCatalog.apply(this, arguments); }
  function getPlaceCatalog() { return S.getPlaceCatalog.apply(this, arguments); }
  function iframeClientOptions() { return S.iframeClientOptions.apply(this, arguments); }
  function incompleteBadgeLabel() { return S.incompleteBadgeLabel.apply(this, arguments); }
  function isCardMarkedComplete() { return S.isCardMarkedComplete.apply(this, arguments); }
  function isFullscreenModal() { return S.isFullscreenModal.apply(this, arguments); }
  function isNestedPowerUpIframe() { return S.isNestedPowerUpIframe.apply(this, arguments); }
  function isPowerUpRequestChain() { return S.isPowerUpRequestChain.apply(this, arguments); }
  function normalizeDepTypes() { return S.normalizeDepTypes.apply(this, arguments); }
  function normalizeDependsOn() { return S.normalizeDependsOn.apply(this, arguments); }
  function normalizeInputs() { return S.normalizeInputs.apply(this, arguments); }
  function pageUrl() { return S.pageUrl.apply(this, arguments); }
  function preloadBoardPriorityContext() { return S.preloadBoardPriorityContext.apply(this, arguments); }
  function priorityUI() { return S.priorityUI.apply(this, arguments); }
  function readPowerUpArg() { return S.readPowerUpArg.apply(this, arguments); }
  function readStoredCardInputs() { return S.readStoredCardInputs.apply(this, arguments); }
  function removeCardLabel() { return S.removeCardLabel.apply(this, arguments); }
  function removeCardMember() { return S.removeCardMember.apply(this, arguments); }
  function resolveCurrentCardId() { return S.resolveCurrentCardId.apply(this, arguments); }
  function restClientOptions() { return S.restClientOptions.apply(this, arguments); }
  function saveBoardColorScheme() { return S.saveBoardColorScheme.apply(this, arguments); }
  function saveBoardFormula() { return S.saveBoardFormula.apply(this, arguments); }
  function saveCustomAssigneeCatalog() { return S.saveCustomAssigneeCatalog.apply(this, arguments); }
  function saveCustomTaskTypes() { return S.saveCustomTaskTypes.apply(this, arguments); }
  function saveMemberRoleCatalog() { return S.saveMemberRoleCatalog.apply(this, arguments); }
  function savePlaceCatalog() { return S.savePlaceCatalog.apply(this, arguments); }
  function setCardDesc() { return S.setCardDesc.apply(this, arguments); }
  function setCardDue() { return S.setCardDue.apply(this, arguments); }
  function setCardName() { return S.setCardName.apply(this, arguments); }
  function setCardStart() { return S.setCardStart.apply(this, arguments); }
  function shouldSkipSizeTo() { return S.shouldSkipSizeTo.apply(this, arguments); }
  function syncCardDueWithTrello() { return S.syncCardDueWithTrello.apply(this, arguments); }
  function syncCardStartWithTrello() { return S.syncCardStartWithTrello.apply(this, arguments); }
  function tierBadgeDot() { return S.tierBadgeDot.apply(this, arguments); }
  function tierDetailBadgeColor() { return S.tierDetailBadgeColor.apply(this, arguments); }
  function updateBoardLabel() { return S.updateBoardLabel.apply(this, arguments); }
  function whenDomReady() { return S.whenDomReady.apply(this, arguments); }

  /**
   * Resize the host popup/modal to content. Skips fullscreen modals (e.g. Gantt)
   * and nested overlays where Trello warns:
   * "Fullscreen modals cannot be resized with t.sizeTo".
   */
  function sizeToContent(t, el) {
    if (!t || typeof t.sizeTo !== 'function') return;
    if (shouldSkipSizeTo(t)) return;
    try {
      var target =
        el ||
        (typeof document !== 'undefined' ? document.body : null);
      if (!target) return;
      var result = t.sizeTo(target);
      if (result && typeof result.then === 'function') {
        result.then(null, function () {
          /* ignore rejected sizeTo (unsupported host) */
        });
      }
    } catch (err) {
      /* ignore */
    }
  }

  function syncIframeTheme(t) {
    if (!t) return t;
    try {
      var ctx = typeof t.getContext === 'function' ? t.getContext() : null;
      applyColorMode((ctx && (ctx.theme || ctx.initialTheme)) || null);
    } catch (err) {
      /* theme optional during early init */
    }
    if (typeof t.subscribeToThemeChanges === 'function') {
      try {
        t.subscribeToThemeChanges(function (theme) {
          applyColorMode(theme);
        });
      } catch (subErr) {
        /* ignore — older SDK stubs */
      }
    }
    return t;
  }

  function createIframeClient() {
    if (typeof global.TrelloPowerUp === 'undefined') {
      throw new Error('TrelloPowerUp is not loaded');
    }
    return syncIframeTheme(global.TrelloPowerUp.iframe(iframeClientOptions()));
  }

  // Call after DOM is ready so TrelloPowerUp.iframe() theme init finds document.body.
  function createIframeClientDeferred() {
    return whenDomReady().then(function () {
      return createIframeClient();
    });
  }

  // Defer t.get/set until Trello finishes the iframe handshake.
  function runWhenIframeReady(t, fn) {
    var started = false;
    var HANDSHAKE_TIMEOUT_MS = 10000;
    return new Promise(function (resolve, reject) {
      if (!t || typeof t.render !== 'function') {
        Promise.resolve().then(fn).then(resolve, reject);
        return;
      }
      var timer = setTimeout(function () {
        if (started) return;
        started = true;
        reject(new Error('Trello iframe handshake timed out'));
      }, HANDSHAKE_TIMEOUT_MS);
      t.render(function () {
        if (started) return;
        started = true;
        clearTimeout(timer);
        Promise.resolve().then(fn).then(resolve, reject);
      });
    });
  }

  // Shared iframe bootstrap: DOM-ready client + post-handshake callback.
  function initIframePage(onReady) {
    dbgLog('iframe.init.start');
    return createIframeClientDeferred().then(function (t) {
      dbgLog('iframe.client.ready');
      return runWhenIframeReady(t, function () {
        dbgLog('iframe.handshake.ready');
        return onReady(t);
      });
    });
  }

  async function saveCardInputs(t, inputs, options) {
    options = options || {};
    var previous = null;
    try {
      previous = await getCardInputs(t);
    } catch (readErr) {
      previous = null;
    }
    var wasBlocked = !!(previous && previous.enAttente);
    var normalized = normalizeInputs(inputs);
    if (!normalized) return;
    dbgLog('save.start', {
      syncDue: options.syncDue !== false,
      autoSort: options.autoSort !== false,
      wasBlocked: wasBlocked,
      nowBlocked: !!normalized.enAttente
    });
    await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, normalized);
    if (options.syncDue !== false) {
      try {
        await syncCardDueWithTrello(t, { inputs: normalized, prefer: 'powerup' });
      } catch (syncErr) {
        dbgError('due.sync.save', syncErr);
      }
      try {
        await syncCardStartWithTrello(t, { inputs: normalized, prefer: 'powerup' });
      } catch (startErr) {
        dbgError('start.sync.save', startErr);
      }
    }
    if (options.autoSort !== false) {
      scheduleAutoSortCard(t);
    }
    // Newly blocked → move to the board's Bloqué list when configured.
    if (
      options.skipStatutAutoMove !== true &&
      normalized.enAttente &&
      !wasBlocked &&
      global.StatutTrello &&
      typeof global.StatutTrello.maybeAutoMoveForBlocked === 'function'
    ) {
      try {
        await global.StatutTrello.maybeAutoMoveForBlocked(t);
        dbgLog('statut.autoMove.blocked');
      } catch (moveErr) {
        dbgError('statut.autoMove.blocked', moveErr);
      }
    }
    // Unblocked → restore previous Statut list (En cours, etc.) when still on Bloqué.
    if (
      options.skipStatutAutoMove !== true &&
      wasBlocked &&
      !normalized.enAttente &&
      global.StatutTrello &&
      typeof global.StatutTrello.restorePreviousStatutFromUnblocked === 'function'
    ) {
      try {
        await global.StatutTrello.restorePreviousStatutFromUnblocked(t);
        dbgLog('statut.restore.unblocked');
      } catch (restoreErr) {
        dbgError('statut.restore.unblocked', restoreErr);
      }
    }
    dbgLog('save.end');
  }

  async function getCardInputsById(t, cardId) {
    return readStoredCardInputs(t, cardId);
  }

  /**
   * Merge + persist cardPriority for an arbitrary board card (Gantt / board context).
   * Preserves sidecars not present in `inputs` by loading existing first.
   * Explicit empty due / unblock clearing is applied when those keys are provided.
   */
  async function saveCardInputsById(t, cardId, inputs, options) {
    options = options || {};
    var id = cardId != null ? String(cardId).trim() : '';
    if (!id) {
      throw new Error('saveCardInputsById requires cardId');
    }
    var existing = null;
    try {
      existing = await getCardInputsById(t, id);
    } catch (readErr) {
      existing = null;
    }
    var base = existing
      ? Object.assign({}, existing)
      : Object.assign({}, DEFAULT_INPUTS, { priorityEnabled: true });
    var patch = inputs && typeof inputs === 'object' ? inputs : {};

    if (patch.urgency != null) base.urgency = patch.urgency;
    if (patch.impact != null) base.impact = patch.impact;
    if (patch.ease != null) base.ease = patch.ease;
    if (patch.empressement != null) base.empressement = patch.empressement;
    if (patch.dateFixe != null) base.dateFixe = patch.dateFixe;
    if (patch.dueLimitState != null) base.dueLimitState = patch.dueLimitState;
    if (patch.impactFactors != null) base.impactFactors = patch.impactFactors;
    if (patch.easeCosts != null) base.easeCosts = patch.easeCosts;
    if (patch.legacyUrgency != null) base.legacyUrgency = patch.legacyUrgency;
    if (patch.urgencyMigrated != null) base.urgencyMigrated = patch.urgencyMigrated;
    if (patch.urgencyReviewNeeded != null) base.urgencyReviewNeeded = patch.urgencyReviewNeeded;
    if (patch.axesScaledTo10 != null) base.axesScaledTo10 = patch.axesScaledTo10;
    if (patch.priorityEnabled != null) base.priorityEnabled = patch.priorityEnabled;
    if (patch.estimatedDurationMinutes != null) {
      base.estimatedDurationMinutes = patch.estimatedDurationMinutes;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'enAttente')) {
      if (patch.enAttente) {
        base.enAttente = true;
        if (patch.blockedReasons != null) base.blockedReasons = patch.blockedReasons;
        if (patch.blockedLinks != null) base.blockedLinks = patch.blockedLinks;
      } else {
        base = clearBlockedFromInputs(base);
        base.enAttente = false;
        if (patch.blockedReasons != null) base.blockedReasons = patch.blockedReasons;
        if (patch.blockedLinks != null) base.blockedLinks = patch.blockedLinks;
      }
    } else {
      if (patch.blockedReasons != null) base.blockedReasons = patch.blockedReasons;
      if (patch.blockedLinks != null) base.blockedLinks = patch.blockedLinks;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'dueDate')) {
      if (patch.dueDate) {
        base.dueDate = patch.dueDate;
        if (patch.dueTime != null) base.dueTime = patch.dueTime;
        if (patch.dueEnabled != null) base.dueEnabled = patch.dueEnabled;
      } else {
        delete base.dueDate;
        delete base.dueTime;
        delete base.dueEnabled;
      }
    } else if (patch.dueTime != null) {
      base.dueTime = patch.dueTime;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'dueMode')) {
      base.dueMode = patch.dueMode;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'dueVague')) {
      if (patch.dueVague) base.dueVague = patch.dueVague;
      else delete base.dueVague;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'startDate')) {
      if (patch.startDate) {
        base.startDate = patch.startDate;
      } else {
        delete base.startDate;
        delete base.startTime;
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) {
      if (patch.recurrence) base.recurrence = patch.recurrence;
      else delete base.recurrence;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'dependsOn')) {
      var deps = normalizeDependsOn(patch.dependsOn).filter(function (d) {
        return d !== id;
      });
      if (deps.length) base.dependsOn = deps;
      else delete base.dependsOn;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'dependsOn') ||
      Object.prototype.hasOwnProperty.call(patch, 'depTypes')
    ) {
      var typeSrc = Object.prototype.hasOwnProperty.call(patch, 'depTypes') ? patch.depTypes : base.depTypes;
      var kept = normalizeDepTypes(typeSrc, base.dependsOn || []);
      if (kept) base.depTypes = kept;
      else delete base.depTypes;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'places')) {
      if (patch.places && typeof patch.places === 'object' && !Array.isArray(patch.places)) {
        base.places = patch.places;
      } else {
        delete base.places;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'customAssignees')) {
      if (Array.isArray(patch.customAssignees) && patch.customAssignees.length) {
        base.customAssignees = patch.customAssignees;
      } else {
        delete base.customAssignees;
      }
    }

    var normalized = normalizeInputs(base);
    if (!normalized) {
      throw new Error('saveCardInputsById: invalid inputs');
    }
    await t.set(id, 'shared', CARD_PRIORITY_KEY, normalized);
    return normalized;
  }

  /**
   * Compact board digest for AI memory / suggestions.
   * Caps cards and truncates descriptions to stay prompt-friendly.
   * @returns {Promise<{ digest: string, cards: Array, lists: Array }>}
   */
  async function scanBoardCards(t, options) {
    options = options || {};
    var maxCards = typeof options.maxCards === 'number' ? options.maxCards : 40;
    var descMax = typeof options.descMax === 'number' ? options.descMax : 200;
    var includePriority = options.includePriority !== false;
    var sortBy = options.sortBy === 'activity' ? 'activity' : '';

    var lists = [];
    var cards = [];
    try {
      lists = (await t.lists('id', 'name')) || [];
    } catch (err) {
      console.error('PriorityTrello.scanBoardCards lists failed', err);
      lists = [];
    }
    try {
      cards =
        (await t.cards(
          'id',
          'name',
          'desc',
          'idList',
          'due',
          'pos',
          'dateLastActivity'
        )) || [];
    } catch (err) {
      console.error('PriorityTrello.scanBoardCards cards failed', err);
      cards = [];
    }

    if (sortBy === 'activity' && cards.length > 1) {
      cards = cards.slice().sort(function (a, b) {
        var ta = a && a.dateLastActivity ? Date.parse(a.dateLastActivity) || 0 : 0;
        var tb = b && b.dateLastActivity ? Date.parse(b.dateLastActivity) || 0 : 0;
        return tb - ta;
      });
    }

    var listNameById = {};
    for (var li = 0; li < lists.length; li++) {
      if (lists[li] && lists[li].id) {
        listNameById[lists[li].id] = lists[li].name || '';
      }
    }

    var slice = cards.slice(0, maxCards);
    var settings = null;
    if (includePriority) {
      try {
        settings = await ensureBoardPriorityContext(t);
      } catch (e) {
        settings = null;
      }
    }

    var lines = [];
    lines.push('Listes (' + lists.length + ')\u00a0:');
    for (var lj = 0; lj < lists.length; lj++) {
      lines.push('- ' + (lists[lj].name || lists[lj].id));
    }
    lines.push('Cartes ouvertes (' + Math.min(cards.length, maxCards) + '/' + cards.length + ')\u00a0:');

    var enriched = [];
    for (var ci = 0; ci < slice.length; ci++) {
      var card = slice[ci];
      var name = (card && card.name) || '';
      var desc = typeof card.desc === 'string' ? card.desc.trim() : '';
      if (desc.length > descMax) desc = desc.slice(0, descMax - 1) + '\u2026';
      var listLabel = listNameById[card.idList] || card.idList || '?';
      var priorityLabel = '';
      if (includePriority && settings && card.id) {
        try {
          var inputs = await getCardInputsById(t, card.id);
          var display = inputs ? computeDisplay(inputs, settings) : null;
          if (display && display.priorityEnabled !== false) {
            priorityLabel = formatBadgeText(display, false) || display.label || '';
          }
        } catch (e) {
          /* ignore per-card */
        }
      }
      enriched.push({
        id: card.id,
        name: name,
        desc: desc,
        list: listLabel,
        listId: card.idList || null,
        due: card.due || null,
        pos: typeof card.pos === 'number' ? card.pos : Number(card.pos) || 0,
        dateLastActivity: card.dateLastActivity || null,
        priority: priorityLabel || null
      });
      var bit = '- [' + listLabel + '] ' + name;
      if (priorityLabel) bit += ' (' + priorityLabel + ')';
      if (card.due) bit += ' due:' + String(card.due).slice(0, 10);
      if (desc) bit += ' \u2014 ' + desc.replace(/\s+/g, ' ');
      lines.push(bit);
    }

    return {
      digest: lines.join('\n'),
      cards: enriched,
      lists: lists.map(function (l) {
        return { id: l.id, name: l.name };
      })
    };
  }

  /**
   * Same-list neighbors + recently created cards for card interview context.
   * @returns {Promise<{ surrounding: Array, recentCreated: Array, current: object|null }>}
   */
  async function getCardNeighborhood(t, options) {
    options = options || {};
    var neighborRadius =
      typeof options.neighborRadius === 'number' ? options.neighborRadius : 4;
    var recentMax = typeof options.recentMax === 'number' ? options.recentMax : 8;
    var descMax = typeof options.descMax === 'number' ? options.descMax : 120;
    var includePriority = options.includePriority === true;

    var currentId = options.cardId || null;
    if (!currentId && t && typeof t.card === 'function') {
      try {
        var me = await t.card('id');
        currentId = (me && me.id) || null;
      } catch (e) {
        currentId = null;
      }
    }

    var scan;
    try {
      scan = await scanBoardCards(t, {
        maxCards: 80,
        descMax: descMax,
        includePriority: includePriority
      });
    } catch (err) {
      console.error('PriorityTrello.getCardNeighborhood scan failed', err);
      return { surrounding: [], recentCreated: [], current: null };
    }

    var cards = (scan && scan.cards) || [];
    var current = null;
    var idx = -1;
    for (var i = 0; i < cards.length; i++) {
      if (currentId && cards[i].id === currentId) {
        current = cards[i];
        idx = i;
        break;
      }
    }

    var surrounding = [];
    if (current && current.listId) {
      var sameList = cards
        .filter(function (c) {
          return c && String(c.listId) === String(current.listId);
        })
        .slice()
        .sort(function (a, b) {
          return (a.pos || 0) - (b.pos || 0);
        });
      var localIdx = -1;
      for (var si = 0; si < sameList.length; si++) {
        if (sameList[si].id === current.id) {
          localIdx = si;
          break;
        }
      }
      if (localIdx >= 0) {
        var from = Math.max(0, localIdx - neighborRadius);
        var to = Math.min(sameList.length, localIdx + neighborRadius + 1);
        for (var ni = from; ni < to; ni++) {
          if (ni === localIdx) continue;
          var n = sameList[ni];
          surrounding.push({
            id: n.id,
            name: n.name,
            desc: n.desc,
            list: n.list,
            due: n.due,
            priority: n.priority,
            relation: ni < localIdx ? 'above' : 'below'
          });
        }
      }
    }

    var Mem = global.AgentMemory;
    var recentCreated = cards
      .slice()
      .map(function (c) {
        var at =
          (Mem && typeof Mem.cardIdCreatedAt === 'function' && Mem.cardIdCreatedAt(c.id)) ||
          c.dateLastActivity ||
          '';
        return {
          id: c.id,
          name: c.name,
          list: c.list,
          at: at,
          due: c.due,
          priority: c.priority
        };
      })
      .filter(function (c) {
        return c.id && c.id !== currentId;
      })
      .sort(function (a, b) {
        var ta = Date.parse(a.at) || 0;
        var tb = Date.parse(b.at) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
      })
      .slice(0, recentMax);

    return {
      surrounding: surrounding,
      recentCreated: recentCreated,
      current: current
        ? {
            id: current.id,
            name: current.name,
            desc: current.desc,
            list: current.list,
            due: current.due,
            priority: current.priority
          }
        : null
    };
  }

  // ── List-sorters (native Trello sortedIds) ──────────────────────────────

  function prioritySortRank(display) {
    if (!display) return { tier: SORT_TIER_NONE, score: -1 };
    if (display.priorityEnabled === false && !display.blocked) {
      return { tier: SORT_TIER_NONE, score: -1 };
    }
    if (display.inutile) return { tier: SORT_TIER_INUTILE, score: 0 };
    var tier = display.tierI != null ? display.tierI : SORT_TIER_INUTILE;
    return { tier: tier, score: display.score || 0 };
  }

  function comparePriorityDisplays(displayA, displayB) {
    var rankA = prioritySortRank(displayA);
    var rankB = prioritySortRank(displayB);
    if (rankA.tier !== rankB.tier) return rankA.tier - rankB.tier;
    if (rankA.score !== rankB.score) return rankB.score - rankA.score;
    return 0;
  }

  async function sortListCardsByPriority(t, cards) {
    if (!cards || !cards.length) return { sortedIds: [] };

    var settings = await ensureBoardPriorityContext(t);
    var entries = await Promise.all(
      cards.map(async function (card) {
        var inputs = await getCardInputsById(t, card.id);
        var display = inputs ? computeDisplay(inputs, settings) : null;
        return { id: card.id, display: display };
      })
    );

    entries.sort(function (a, b) {
      return comparePriorityDisplays(a.display, b.display);
    });

    return { sortedIds: entries.map(function (entry) { return entry.id; }) };
  }

  function listPrioritySorters(t) {
    return [{
      text: 'Priorité',
      callback: function (ctx, opts) {
        return sortListCardsByPriority(ctx, opts.cards);
      },
    }];
  }

  // ── Auto-sort (REST PUT /cards/{id} pos) ─────────────────────────────────

  var autoSortDebounceByClient = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var autoSortDebounceFallback = null;

  function autoSortDebounceMs() {
    var cfg = global.PriorityRestConfig;
    var ms = cfg && cfg.autoSortDebounceMs;
    return typeof ms === 'number' && ms >= 0 ? ms : 400;
  }

  function getAutoSortDebounceState(t) {
    if (autoSortDebounceByClient) {
      var state = autoSortDebounceByClient.get(t);
      if (!state) {
        state = { timer: null, chain: Promise.resolve() };
        autoSortDebounceByClient.set(t, state);
      }
      return state;
    }
    if (!autoSortDebounceFallback) {
      autoSortDebounceFallback = { timer: null, chain: Promise.resolve() };
    }
    return autoSortDebounceFallback;
  }

  function comparePriorityEntries(entryA, entryB) {
    var cmp = comparePriorityDisplays(entryA.display, entryB.display);
    if (cmp !== 0) return cmp;
    return (entryA.pos || 0) - (entryB.pos || 0);
  }

  function sortEntriesByPriority(entries) {
    return entries.slice().sort(comparePriorityEntries);
  }

  function indexByPos(entries) {
    var byPos = entries.slice().sort(function (a, b) {
      return (a.pos || 0) - (b.pos || 0);
    });
    var indexById = {};
    for (var i = 0; i < byPos.length; i++) {
      indexById[byPos[i].id] = i;
    }
    return indexById;
  }

  // Returns null when the card is already at the correct rank; otherwise { pos }.
  function computeCardMovePosition(entries, cardId) {
    if (!entries || entries.length < 2 || !cardId) return null;

    var byPriority = sortEntriesByPriority(entries);
    var targetIdx = -1;
    for (var i = 0; i < byPriority.length; i++) {
      if (byPriority[i].id === cardId) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) return null;

    var posIndex = indexByPos(entries);
    if (posIndex[cardId] === targetIdx) return null;

    var above = targetIdx > 0 ? byPriority[targetIdx - 1] : null;
    var below = targetIdx < byPriority.length - 1 ? byPriority[targetIdx + 1] : null;

    if (!above) return { pos: 'top' };
    if (!below) return { pos: 'bottom' };

    var posAbove = above.pos;
    var posBelow = below.pos;
    if (typeof posAbove !== 'number' || typeof posBelow !== 'number' || posAbove >= posBelow) {
      return { pos: 'bottom' };
    }
    return { pos: (posAbove + posBelow) / 2 };
  }

  async function readCardIdAndListId(t) {
    var results = await Promise.all([
      cardFieldPromise(t, 'id'),
      cardFieldPromise(t, 'idList'),
    ]);
    var cardId = results[0];
    var listId = results[1];
    if (isPowerUpRequestChain(cardId) || isPowerUpRequestChain(listId)) return null;
    if (typeof cardId === 'object' && cardId) cardId = cardId.id;
    if (typeof listId === 'object' && listId) listId = listId.idList || listId.id;
    if (!cardId || !listId) return null;
    return { cardId: String(cardId), listId: String(listId) };
  }

  /**
   * Create a board card via REST POST /cards.
   * Defaults idList to the current card's list when omitted.
   */
  async function createCard(t, options) {
    options = options || {};
    var name = typeof options.name === 'string' ? options.name.trim() : '';
    if (!name) return { ok: false, reason: 'no-name', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var idList = options.idList != null ? String(options.idList).trim() : '';
    if (!idList) {
      var ids = await readCardIdAndListId(t);
      idList = ids && ids.listId ? String(ids.listId) : '';
    }
    if (!idList) return { ok: false, reason: 'no-list-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var pos =
      options.pos != null && String(options.pos).trim()
        ? String(options.pos).trim()
        : 'bottom';

    var url =
      'https://api.trello.com/1/cards' +
      '?name=' +
      encodeURIComponent(name) +
      '&idList=' +
      encodeURIComponent(idList) +
      '&pos=' +
      encodeURIComponent(pos) +
      '&key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST POST /cards failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }

    var created = await response.json();
    if (!created || !created.id) {
      return { ok: false, reason: 'no-card', changed: false };
    }

    return {
      ok: true,
      changed: true,
      cardId: String(created.id),
      card: {
        id: String(created.id),
        name: typeof created.name === 'string' ? created.name : name,
        idList: created.idList != null ? String(created.idList) : idList,
        url: typeof created.url === 'string' ? created.url : undefined,
        shortUrl: typeof created.shortUrl === 'string' ? created.shortUrl : undefined,
      },
    };
  }

  async function buildListPriorityEntries(t, listId, settings) {
    var cards = await t.cards('id', 'idList', 'pos');
    if (!Array.isArray(cards)) return [];

    var inList = cards.filter(function (card) {
      return card && String(card.idList) === String(listId);
    });
    if (!inList.length) return [];

    return Promise.all(
      inList.map(async function (card) {
        var inputs = await getCardInputsById(t, card.id);
        var display = inputs ? computeDisplay(inputs, settings) : null;
        return {
          id: String(card.id),
          pos: typeof card.pos === 'number' ? card.pos : Number(card.pos) || 0,
          display: display,
        };
      })
    );
  }

  async function restPutCard(t, cardId, body) {
    var cfg = restClientOptions();
    if (!cfg) {
      dbgLog('rest.put.skip', { reason: 'no-app-key' });
      return { ok: false, reason: 'no-app-key' };
    }

    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) {
      dbgLog('rest.put.skip', { reason: 'not-authorized' });
      return { ok: false, reason: 'not-authorized' };
    }

    var token = await api.getToken();
    if (!token) {
      dbgLog('rest.put.skip', { reason: 'no-token' });
      return { ok: false, reason: 'no-token' };
    }

    var keys = body && typeof body === 'object' ? Object.keys(body) : [];
    var t0 = Date.now();
    var url =
      'https://api.trello.com/1/cards/' + encodeURIComponent(cardId) +
      '?key=' + encodeURIComponent(cfg.appKey) +
      '&token=' + encodeURIComponent(token);

    var response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      dbgError('rest.put', new Error('http_' + response.status), {
        status: response.status,
        fields: keys.length,
        durationMs: Math.max(0, Date.now() - t0)
      });
      throw new Error('Trello REST PUT /cards/' + cardId + ' failed: ' + response.status + (detail ? ' ' + detail : ''));
    }
    dbgLog('rest.put.ok', {
      fields: keys.length,
      durationMs: Math.max(0, Date.now() - t0)
    });
    return { ok: true };
  }

  /**
   * Mark (or unmark) the card as Done via REST PUT dueComplete.
   * Requires OAuth (same path as auto-sort). No-ops when already at target.
   * When recurrence is set and marking complete: advance due/start, persist,
   * push dates, then leave dueComplete false (Trello-like roll-forward).
   */
  async function setCardDueComplete(t, dueComplete, options) {
    options = options || {};
    var want = !!dueComplete;
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var current = await getCardDueComplete(t);
    if (current === want) {
      return { ok: true, changed: false, alreadyComplete: want };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    if (want) {
      var inputs = await getCardInputs(t);
      var PU = priorityUI();
      var recurrence =
        inputs && PU && typeof PU.normalizeRecurrence === 'function'
          ? PU.normalizeRecurrence(inputs.recurrence)
          : inputs && inputs.recurrence
            ? inputs.recurrence
            : null;
      if (recurrence && inputs && inputs.dueDate && PU && PU.nextOccurrenceParts) {
        var nextParts = PU.nextOccurrenceParts(
          {
            dueDate: inputs.dueDate,
            dueTime: inputs.dueTime || '',
            startDate: inputs.startDate || '',
          },
          recurrence
        );
        if (nextParts && nextParts.dueDate) {
          var rolled = Object.assign({}, inputs, {
            dueDate: nextParts.dueDate,
            dueTime: nextParts.dueTime || inputs.dueTime || '',
            dueEnabled: true,
          });
          if (nextParts.startDate) rolled.startDate = nextParts.startDate;
          else delete rolled.startDate;
          rolled = normalizeInputs(rolled);
          await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, rolled);
          try {
            await syncCardDueWithTrello(t, {
              inputs: rolled,
              prefer: 'powerup',
            });
          } catch (dueRollErr) {
            console.error('Priority due roll-forward failed', dueRollErr);
          }
          try {
            await syncCardStartWithTrello(t, {
              inputs: rolled,
              prefer: 'powerup',
            });
          } catch (startRollErr) {
            console.error('Priority start roll-forward failed', startRollErr);
          }
          // Ensure card is not left complete after rolling the schedule.
          if (current === true) {
            var reset = await restPutCard(t, cardId, { dueComplete: false });
            if (!reset.ok) {
              return Object.assign({ changed: false, rolled: true }, reset);
            }
          }
          return {
            ok: true,
            changed: true,
            rolled: true,
            dueComplete: false,
            inputs: rolled,
          };
        }
      }
    }

    var put = await restPutCard(t, cardId, { dueComplete: want });
    if (!put.ok) return Object.assign({ changed: false }, put);

    // Newly completed → move to the board's Terminé list when configured.
    if (
      want &&
      options.skipStatutAutoMove !== true &&
      global.StatutTrello &&
      typeof global.StatutTrello.maybeAutoMoveForCompleted === 'function'
    ) {
      try {
        await global.StatutTrello.maybeAutoMoveForCompleted(t);
        dbgLog('statut.autoMove.completed');
      } catch (moveErr) {
        dbgError('statut.autoMove.completed', moveErr);
      }
    }

    return { ok: true, changed: true, dueComplete: want };
  }

  async function autoSortCardInList(t) {
    if (!restClientOptions()) {
      dbgLog('autoSort.skip', { reason: 'no-app-key' });
      return { moved: false, reason: 'no-app-key' };
    }

    var ids = await readCardIdAndListId(t);
    if (!ids) {
      dbgLog('autoSort.skip', { reason: 'no-card-context' });
      return { moved: false, reason: 'no-card-context' };
    }

    var settings = await ensureBoardPriorityContext(t);
    var entries = await buildListPriorityEntries(t, ids.listId, settings);
    if (entries.length < 2) {
      dbgLog('autoSort.skip', { reason: 'single-card-list' });
      return { moved: false, reason: 'single-card-list' };
    }

    var move = computeCardMovePosition(entries, ids.cardId);
    if (!move) {
      dbgLog('autoSort.skip', { reason: 'already-sorted' });
      return { moved: false, reason: 'already-sorted' };
    }

    await restPutCard(t, ids.cardId, { pos: move.pos });
    dbgLog('autoSort.moved', { entryCount: entries.length });
    return { moved: true, pos: move.pos };
  }

  function scheduleAutoSortCard(t) {
    if (!restClientOptions()) return Promise.resolve({ moved: false, reason: 'no-app-key' });

    var state = getAutoSortDebounceState(t);
    if (state.timer) clearTimeout(state.timer);
    dbgLog('autoSort.schedule');

    state.chain = state.chain
      .catch(function () { /* keep chain alive after a failed sort */ })
      .then(function () {
        return new Promise(function (resolve) {
          state.timer = setTimeout(resolve, autoSortDebounceMs());
        });
      })
      .then(function () {
        state.timer = null;
        return autoSortCardInList(t);
      })
      .catch(function (err) {
        dbgError('autoSort', err);
        return { moved: false, reason: 'error' };
      });

    return state.chain;
  }

  async function isRestAuthorized(t) {
    if (!restClientOptions()) return false;
    try {
      var api = await t.getRestApi();
      return api.isAuthorized();
    } catch (err) {
      dbgError('rest.authCheck', err);
      return false;
    }
  }

  // Default key used by TrelloPowerUp RestApi client (localStorage + member private).
  var REST_TOKEN_STORAGE_KEY = 'trello_token';

  function isLikelyRestToken(token) {
    // Tokens are opaque (legacy hex or ATTA…). Only reject empty/short values and JWTs.
    return typeof token === 'string' && token.length >= 20 && token.indexOf('.') === -1;
  }

  function authReturnUrl() {
    var url = pageUrl('./auth-return.html');
    try {
      return new URL(url, global.location.href).href.split('#')[0].split('?')[0];
    } catch (err) {
      if (typeof global.location !== 'undefined' && global.location.origin) {
        return global.location.origin + global.location.pathname.replace(/[^/]+$/, 'auth-return.html');
      }
      return url;
    }
  }

  function buildRestAuthorizeUrl(cfg, returnUrl) {
    var params = {
      expiration: 'never',
      scope: 'read,write',
      name: brandAppName(),
      key: cfg.appKey,
      // fragment + return_url: popup lands on auth-return.html with #token=…
      callback_method: 'fragment',
      response_type: 'fragment',
      return_url: returnUrl,
    };
    if (cfg.appAuthor) params.author = cfg.appAuthor;
    return (
      'https://trello.com/1/authorize?' +
      Object.keys(params)
        .map(function (key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        })
        .join('&')
    );
  }

  function isPluginDataConflict(err) {
    var msg = String((err && (err.message || err.name || err)) || '');
    return /\b409\b|Conflict/i.test(msg);
  }

  /**
   * Persist the OAuth token once under the RestApi client's storage key.
   * Do not also seed localStorage: getToken()/isAuthorized() would then call
   * fetchAndStoreToken → storeToken and POST pluginData a second time (409).
   */
  function storeRestToken(t, token) {
    return Promise.resolve()
      .then(function () {
        var api = typeof t.getRestApi === 'function' ? t.getRestApi() : null;
        if (api && typeof api.storeToken === 'function') {
          return api.storeToken(token);
        }
        return t.set('member', 'private', REST_TOKEN_STORAGE_KEY, token);
      })
      .then(function () {
        return token;
      })
      .catch(function (err) {
        // Concurrent member pluginData write — only treat as ok if readable.
        if (!isPluginDataConflict(err)) throw err;
        return isRestAuthorized(t).then(function (ok) {
          if (ok) return token;
          throw err;
        });
      });
  }

  /**
   * Kick off Trello REST OAuth via t.authorize (not getRestApi().authorize).
   *
   * getRestApi().authorize() opens the consent popup then immediately calls
   * getToken(); if anything looks like a token (or the popup appears "closed"
   * to the poll), it closes the window in ~0.1s — the bug users saw.
   *
   * t.authorize + auth-return.html avoids that race: the return page calls
   * window.opener.authorize(token). Must stay synchronous through window.open
   * (call only from a direct click handler).
   */
  function authorizeRestForAutoSort(t) {
    var cfg = restClientOptions();
    if (!cfg) {
      return Promise.reject(new Error('REST appKey is not configured'));
    }
    if (!t || typeof t.authorize !== 'function') {
      return Promise.reject(new Error('t.authorize is not available'));
    }

    var returnUrl = authReturnUrl();
    var authUrl = buildRestAuthorizeUrl(cfg, returnUrl);

    // Drop a leftover local token so follow-up isAuthorized checks stay honest.
    try {
      global.localStorage.removeItem(REST_TOKEN_STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var authWindow = null;
      var openedAt = Date.now();
      var closeTimer = null;

      function clearAuthTimers() {
        clearInterval(poll);
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
      }

      function finishOk(token) {
        if (settled) return;
        settled = true;
        clearAuthTimers();
        resolve(token);
      }

      function deny(err) {
        if (settled) return;
        settled = true;
        clearAuthTimers();
        reject(
          err ||
            (global.TrelloPowerUp &&
            TrelloPowerUp.restApiError &&
            TrelloPowerUp.restApiError.AuthDeniedError
              ? new TrelloPowerUp.restApiError.AuthDeniedError()
              : new Error('AuthDeniedError'))
        );
      }

      // Ignore brief startup closed=true; after grace, defer deny so
      // opener.authorize(token) can settle before we treat close as cancel.
      var poll = setInterval(function () {
        if (settled) return;
        if (!authWindow) return;
        if (Date.now() - openedAt < 1500) return;
        if (!authWindow.closed) return;
        if (closeTimer) return;
        closeTimer = setTimeout(function () {
          closeTimer = null;
          if (!settled) deny();
        }, 600);
      }, 500);

      // Promise executor runs sync → window.open keeps the click user-gesture.
      t.authorize(authUrl, {
        width: 550,
        height: 725,
        windowCallback: function (win) {
          authWindow = win;
          if (!win) deny(new Error('Popup blocked — allow popups for Trello'));
        },
        validToken: isLikelyRestToken,
      })
        .then(function (token) {
          finishOk(token);
        })
        .catch(function (err) {
          deny(err);
        });
    }).then(function (token) {
      return storeRestToken(t, token);
    });
  }

  function getCachedBoardFormulaKey() {
    return S.boardFormulaKey || 'baseline';
  }

  global.PriorityTrello = {
    CARD_PRIORITY_KEY: CARD_PRIORITY_KEY,
    MATRIX_SETTINGS_KEY: MATRIX_SETTINGS_KEY,
    FORMULA_SETTINGS_KEY: FORMULA_SETTINGS_KEY,
    COLOR_SCHEME_SETTINGS_KEY: COLOR_SCHEME_SETTINGS_KEY,
    COLOR_SCHEME_REV_KEY: COLOR_SCHEME_REV_KEY,
    IMPORTANT_INPUTS: IMPORTANT_INPUTS,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    PRIORITY_DIMENSIONS: PRIORITY_DIMENSIONS,
    normalizeInputs: normalizeInputs,
    clearBlockedFromInputs: clearBlockedFromInputs,
    clearBlockedIfComplete: clearBlockedIfComplete,
    getCardInputs: getCardInputs,
    getMatrixSettings: getMatrixSettings,
    getBoardFormula: getBoardFormula,
    getCachedBoardFormulaKey: getCachedBoardFormulaKey,
    saveBoardFormula: saveBoardFormula,
    getBoardColorScheme: getBoardColorScheme,
    getCachedBoardColorSchemeKey: getCachedBoardColorSchemeKey,
    saveBoardColorScheme: saveBoardColorScheme,
    getCustomTaskTypes: getCustomTaskTypes,
    getCachedCustomTaskTypes: getCachedCustomTaskTypes,
    saveCustomTaskTypes: saveCustomTaskTypes,
    getMemberRoleCatalog: getMemberRoleCatalog,
    getCachedMemberRoleCatalog: getCachedMemberRoleCatalog,
    saveMemberRoleCatalog: saveMemberRoleCatalog,
    MEMBER_ROLE_CATALOG_KEY: MEMBER_ROLE_CATALOG_KEY,
    getCustomAssigneeCatalog: getCustomAssigneeCatalog,
    getCachedCustomAssigneeCatalog: getCachedCustomAssigneeCatalog,
    saveCustomAssigneeCatalog: saveCustomAssigneeCatalog,
    CUSTOM_ASSIGNEE_CATALOG_KEY: CUSTOM_ASSIGNEE_CATALOG_KEY,
    getPlaceCatalog: getPlaceCatalog,
    getCachedPlaceCatalog: getCachedPlaceCatalog,
    savePlaceCatalog: savePlaceCatalog,
    PLACE_CATALOG_KEY: PLACE_CATALOG_KEY,
    preloadBoardPriorityContext: preloadBoardPriorityContext,
    ensureBoardPriorityContext: ensureBoardPriorityContext,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    getCardName: getCardName,
    getCardDesc: getCardDesc,
    cardDataPromise: cardDataPromise,
    getCardMembers: getCardMembers,
    getCurrentMember: getCurrentMember,
    getBoardMembers: getBoardMembers,
    getCardCreator: getCardCreator,
    ensureCreatorAssigned: ensureCreatorAssigned,
    getCardLabels: getCardLabels,
    getBoardLabels: getBoardLabels,
    createBoardLabel: createBoardLabel,
    updateBoardLabel: updateBoardLabel,
    addCardLabel: addCardLabel,
    removeCardLabel: removeCardLabel,
    deleteBoardLabel: deleteBoardLabel,
    addCardMember: addCardMember,
    removeCardMember: removeCardMember,
    setCardDesc: setCardDesc,
    setCardName: setCardName,
    createCard: createCard,
    getCardDueComplete: getCardDueComplete,
    setCardDueComplete: setCardDueComplete,
    getCardDue: getCardDue,
    setCardDue: setCardDue,
    syncCardDueWithTrello: syncCardDueWithTrello,
    CARD_DUE_SYNCED_KEY: CARD_DUE_SYNCED_KEY,
    getCardStart: getCardStart,
    setCardStart: setCardStart,
    syncCardStartWithTrello: syncCardStartWithTrello,
    CARD_START_SYNCED_KEY: CARD_START_SYNCED_KEY,
    getBadgeData: getBadgeData,
    getCardOverviewSnapshot: getCardOverviewSnapshot,
    formatBadgeText: formatBadgeText,
    formatBlockedBoardBadgeText: formatBlockedBoardBadgeText,
    incompleteBadgeLabel: incompleteBadgeLabel,
    isCardMarkedComplete: isCardMarkedComplete,
    tierBadgeDot: tierBadgeDot,
    tierDetailBadgeColor: tierDetailBadgeColor,
    buildCardFaceBadge: buildCardFaceBadge,
    cardFaceBadges: cardFaceBadges,
    cardDetailBadges: cardDetailBadges,
    saveCardInputs: saveCardInputs,
    getCardInputsById: getCardInputsById,
    saveCardInputsById: saveCardInputsById,
    scanBoardCards: scanBoardCards,
    getCardNeighborhood: getCardNeighborhood,
    prioritySortRank: prioritySortRank,
    comparePriorityDisplays: comparePriorityDisplays,
    sortListCardsByPriority: sortListCardsByPriority,
    listPrioritySorters: listPrioritySorters,
    comparePriorityEntries: comparePriorityEntries,
    computeCardMovePosition: computeCardMovePosition,
    autoSortCardInList: autoSortCardInList,
    scheduleAutoSortCard: scheduleAutoSortCard,
    isRestAuthorized: isRestAuthorized,
    authorizeRestForAutoSort: authorizeRestForAutoSort,
    restClientOptions: restClientOptions,
    iframeClientOptions: iframeClientOptions,
    restPutCard: restPutCard,
    readCardIdAndListId: readCardIdAndListId,
    resolveCurrentCardId: resolveCurrentCardId,
    readPowerUpArg: readPowerUpArg,
    pageUrl: pageUrl,
    isFullscreenModal: isFullscreenModal,
    isNestedPowerUpIframe: isNestedPowerUpIframe,
    shouldSkipSizeTo: shouldSkipSizeTo,
    sizeToContent: sizeToContent,
    createIframeClient: createIframeClient,
    createIframeClientDeferred: createIframeClientDeferred,
    initIframePage: initIframePage,
    runWhenIframeReady: runWhenIframeReady,
    syncIframeTheme: syncIframeTheme,
    COLOR_MODE_STORAGE_KEY: COLOR_MODE_STORAGE_KEY,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
  };

  // exports
  S.REST_TOKEN_STORAGE_KEY = REST_TOKEN_STORAGE_KEY;
  S.authReturnUrl = authReturnUrl;
  S.authorizeRestForAutoSort = authorizeRestForAutoSort;
  S.autoSortCardInList = autoSortCardInList;
  S.autoSortDebounceByClient = autoSortDebounceByClient;
  S.autoSortDebounceFallback = autoSortDebounceFallback;
  S.autoSortDebounceMs = autoSortDebounceMs;
  S.buildListPriorityEntries = buildListPriorityEntries;
  S.buildRestAuthorizeUrl = buildRestAuthorizeUrl;
  S.comparePriorityDisplays = comparePriorityDisplays;
  S.comparePriorityEntries = comparePriorityEntries;
  S.computeCardMovePosition = computeCardMovePosition;
  S.createCard = createCard;
  S.createIframeClient = createIframeClient;
  S.createIframeClientDeferred = createIframeClientDeferred;
  S.getAutoSortDebounceState = getAutoSortDebounceState;
  S.getCachedBoardFormulaKey = getCachedBoardFormulaKey;
  S.getCardInputsById = getCardInputsById;
  S.getCardNeighborhood = getCardNeighborhood;
  S.indexByPos = indexByPos;
  S.initIframePage = initIframePage;
  S.isLikelyRestToken = isLikelyRestToken;
  S.isPluginDataConflict = isPluginDataConflict;
  S.isRestAuthorized = isRestAuthorized;
  S.listPrioritySorters = listPrioritySorters;
  S.prioritySortRank = prioritySortRank;
  S.readCardIdAndListId = readCardIdAndListId;
  S.restPutCard = restPutCard;
  S.runWhenIframeReady = runWhenIframeReady;
  S.saveCardInputs = saveCardInputs;
  S.saveCardInputsById = saveCardInputsById;
  S.scanBoardCards = scanBoardCards;
  S.scheduleAutoSortCard = scheduleAutoSortCard;
  S.setCardDueComplete = setCardDueComplete;
  S.sizeToContent = sizeToContent;
  S.sortEntriesByPriority = sortEntriesByPriority;
  S.sortListCardsByPriority = sortListCardsByPriority;
  S.storeRestToken = storeRestToken;
  S.syncIframeTheme = syncIframeTheme;
})(typeof window !== 'undefined' ? window : this);
