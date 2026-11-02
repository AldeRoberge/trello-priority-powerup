/**
 * priority-trello-board-card: part 2 of 2 (getCustomAssigneeCatalog).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello-board-card.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityTrelloParts = global.PriorityTrelloParts || {});

  // from earlier parts (values)
  var BOARD_CONTEXT_TTL_MS = S.BOARD_CONTEXT_TTL_MS;
  var CUSTOM_ASSIGNEE_CATALOG_KEY = S.CUSTOM_ASSIGNEE_CATALOG_KEY;
  var PLACE_CATALOG_KEY = S.PLACE_CATALOG_KEY;

  // from other parts (functions, resolved at call time)
  function dbgError() { return S.dbgError.apply(this, arguments); }
  function defaultColorSchemeKey() { return S.defaultColorSchemeKey.apply(this, arguments); }
  function getBoardColorScheme() { return S.getBoardColorScheme.apply(this, arguments); }
  function getBoardFormula() { return S.getBoardFormula.apply(this, arguments); }
  function getCardInputs() { return S.getCardInputs.apply(this, arguments); }
  function getCustomTaskTypes() { return S.getCustomTaskTypes.apply(this, arguments); }
  function getMatrixSettings() { return S.getMatrixSettings.apply(this, arguments); }
  function getMemberRoleCatalog() { return S.getMemberRoleCatalog.apply(this, arguments); }
  function priorityUI() { return S.priorityUI.apply(this, arguments); }
  function trelloBadgeComplete() { return S.trelloBadgeComplete.apply(this, arguments); }
  function trelloBadgeMuted() { return S.trelloBadgeMuted.apply(this, arguments); }
  function addCardMember() { return S.addCardMember.apply(this, arguments); }
  function readPowerUpArg() { return S.readPowerUpArg.apply(this, arguments); }
  function resolveCurrentCardId() { return S.resolveCurrentCardId.apply(this, arguments); }
  function restClientOptions() { return S.restClientOptions.apply(this, arguments); }

  async function getCustomAssigneeCatalog(t) {
    var PU = priorityUI();
    if (Array.isArray(S.boardCustomAssigneeCatalog)) {
      return S.boardCustomAssigneeCatalog.slice();
    }
    try {
      var stored = await t.get('board', 'shared', CUSTOM_ASSIGNEE_CATALOG_KEY);
      var list =
        PU && typeof PU.normalizeCustomAssignees === 'function'
          ? PU.normalizeCustomAssignees(stored)
          : Array.isArray(stored)
            ? stored
            : [];
      S.boardCustomAssigneeCatalog = list;
      if (PU && typeof PU.setCustomAssigneeCatalog === 'function') {
        PU.setCustomAssigneeCatalog(list);
      }
      return list.slice();
    } catch (err) {
      console.error('Priority custom assignee catalog load failed', err);
      S.boardCustomAssigneeCatalog = S.boardCustomAssigneeCatalog || [];
      return S.boardCustomAssigneeCatalog.slice();
    }
  }

  async function saveCustomAssigneeCatalog(t, raw) {
    var PU = priorityUI();
    var list =
      PU && typeof PU.normalizeCustomAssignees === 'function'
        ? PU.normalizeCustomAssignees(raw)
        : Array.isArray(raw)
          ? raw
          : [];
    S.boardCustomAssigneeCatalog = list;
    if (PU && typeof PU.setCustomAssigneeCatalog === 'function') {
      PU.setCustomAssigneeCatalog(list);
    }
    await t.set('board', 'shared', CUSTOM_ASSIGNEE_CATALOG_KEY, list);
    return list.slice();
  }

  function getCachedCustomAssigneeCatalog() {
    return Array.isArray(S.boardCustomAssigneeCatalog)
      ? S.boardCustomAssigneeCatalog.slice()
      : [];
  }

  async function getPlaceCatalog(t) {
    var PU = priorityUI();
    if (Array.isArray(S.boardPlaceCatalog)) {
      return S.boardPlaceCatalog.slice();
    }
    try {
      var stored = await t.get('board', 'shared', PLACE_CATALOG_KEY);
      var list =
        PU && typeof PU.normalizePlaceCatalog === 'function'
          ? PU.normalizePlaceCatalog(stored)
          : Array.isArray(stored)
            ? stored
            : [];
      S.boardPlaceCatalog = list;
      if (PU && typeof PU.setPlaceCatalog === 'function') {
        PU.setPlaceCatalog(list);
      }
      return list.slice();
    } catch (err) {
      console.error('Priority place catalog load failed', err);
      S.boardPlaceCatalog = S.boardPlaceCatalog || [];
      return S.boardPlaceCatalog.slice();
    }
  }

  async function savePlaceCatalog(t, raw) {
    var PU = priorityUI();
    var list =
      PU && typeof PU.normalizePlaceCatalog === 'function'
        ? PU.normalizePlaceCatalog(raw)
        : Array.isArray(raw)
          ? raw
          : [];
    S.boardPlaceCatalog = list;
    if (PU && typeof PU.setPlaceCatalog === 'function') {
      PU.setPlaceCatalog(list);
    }
    await t.set('board', 'shared', PLACE_CATALOG_KEY, list);
    return list.slice();
  }

  function getCachedPlaceCatalog() {
    return Array.isArray(S.boardPlaceCatalog)
      ? S.boardPlaceCatalog.slice()
      : [];
  }

  async function preloadBoardPriorityContext(t) {
    return ensureBoardPriorityContext(t);
  }

  function getCachedBoardColorSchemeKey() {
    return S.boardColorSchemeKey || defaultColorSchemeKey();
  }

  async function ensureBoardPriorityContext(t) {
    if (
      S.boardMatrixSettings &&
      Date.now() - S.boardContextAt < BOARD_CONTEXT_TTL_MS
    ) {
      return S.boardMatrixSettings;
    }
    if (S.boardContextInflight) return S.boardContextInflight;

    S.boardContextInflight = (async function () {
      var settings = await getMatrixSettings(t);
      var PU = priorityUI();
      if (PU && PU.setMatrixSettings) {
        PU.setMatrixSettings(settings);
      }
      await getBoardFormula(t);
      await getBoardColorScheme(t);
      await getCustomTaskTypes(t);
      await getMemberRoleCatalog(t);
      await getCustomAssigneeCatalog(t);
      await getPlaceCatalog(t);
      S.boardContextAt = Date.now();
      return settings;
    })().finally(function () {
      S.boardContextInflight = null;
    });

    return S.boardContextInflight;
  }

  function computeDisplay(inputs, labelSettings, formulaKey) {
    try {
      var PU = priorityUI();
      if (!PU || !PU.calc) return null;
      var key = formulaKey || S.boardFormulaKey || 'baseline';
      var calcFn = PU.calc[key] || PU.calc.baseline;
      var result = calcFn(inputs);
      return PU.resolveDisplay(result, inputs, labelSettings);
    } catch (err) {
      dbgError('computeDisplay', err);
      return null;
    }
  }

  async function getCardDisplay(t) {
    var inputs = await getCardInputs(t);
    if (!inputs) return null;
    var settings = await ensureBoardPriorityContext(t);
    return computeDisplay(inputs, settings);
  }

  // Tier-indexed badge dots delegate to PriorityUI tier metadata.
  function tierBadgeDot(display, completed) {
    var PU = priorityUI();
    if (PU && PU.tierBadgeDotChar) {
      return PU.tierBadgeDotChar(display, completed);
    }
    if (completed) return (PU && PU.BADGE_DOT_COMPLETE) || '\u2713';
    if (!display) return (PU && PU.BADGE_DOT_DEFAULT) || '\u25CF';
    if (display.blocked) return (PU && PU.BLOCKED_SYMBOL) || '\u2298';
    if (display.inutile) return (PU && PU.BADGE_DOT_INUTILE) || '\u00B7';
    return (PU && PU.BADGE_DOT_DEFAULT) || '\u25CF';
  }

  function incompleteBadgeLabel(display) {
    var PU = priorityUI();
    if (PU && PU.taskBadgeLabel) {
      return PU.taskBadgeLabel(display);
    }
    if (PU && PU.taskBadgeLabelForTierKey) {
      return PU.taskBadgeLabelForTierKey(String(display.tierLabel || display.label || ''));
    }
    var tierKey = String(display.tierLabel || display.label || '');
    return tierKey ? 'T\u00e2che ' + tierKey.charAt(0).toLowerCase() + tierKey.slice(1) : '';
  }

  // Any t.card().get() chain object exposes .get — truthy, not completion data.
  function isPowerUpRequestChain(value) {
    return !!(value && typeof value === 'object' && typeof value.get === 'function');
  }

  function isCardMarkedComplete(card) {
    if (card === true) return true;
    if (card === false || card == null) return false;
    if (typeof card !== 'object') return false;
    if (isPowerUpRequestChain(card)) return false;
    if (card.dueComplete === true) return true;
    if (card.dueComplete === false) return false;
    if (card.badges && typeof card.badges === 'object' && !isPowerUpRequestChain(card.badges)) {
      if (card.badges.dueComplete === true) return true;
      if (card.badges.dueComplete === false) return false;
    }
    return false;
  }

  var CARD_FIELD_TIMEOUT_MS = 6000;

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(label || 'timeout'));
      }, ms || CARD_FIELD_TIMEOUT_MS);
      Promise.resolve(promise).then(
        function (value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /** Build GET /cards/{id} query for Power-Up field names (Gantt overlay REST path). */
  function buildRestCardQuery(fields) {
    var fieldList = [];
    var wantMembers = false;
    (fields || []).forEach(function (f) {
      if (f === 'members') wantMembers = true;
      else if (f) fieldList.push(String(f));
    });
    if (!fieldList.length) fieldList.push('id');
    var parts = ['fields=' + fieldList.map(encodeURIComponent).join(',')];
    if (wantMembers) {
      parts.push('members=true');
      parts.push(
        'member_fields=' +
          encodeURIComponent('id,fullName,username,initials,avatarHash,avatarUrl')
      );
    }
    return parts.join('&');
  }

  async function restGetCardJson(t, cardId, queryExtra) {
    if (!cardId || !restClientOptions()) return null;
    try {
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/cards/' +
        encodeURIComponent(cardId) +
        '?key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token) +
        (queryExtra ? '&' + queryExtra : '');
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.error('Priority REST GET card failed', err);
      return null;
    }
  }

  /**
   * Read a card field. When opened from Gantt (cardId arg, board context),
   * t.card() has no card localization and can hang — use REST instead.
   */
  function cardFieldPromise(t, field) {
    var argId = readPowerUpArg(t, 'cardId');
    if (argId) {
      return restGetCardJson(t, argId, buildRestCardQuery([field])).then(
        function (card) {
          if (!card) return null;
          if (field === 'members') return card.members || null;
          return Object.prototype.hasOwnProperty.call(card, field)
            ? card[field]
            : null;
        }
      );
    }
    return withTimeout(
      new Promise(function (resolve, reject) {
        t.card(field).get(field).then(resolve, reject);
      }),
      CARD_FIELD_TIMEOUT_MS,
      't.card timeout: ' + field
    );
  }

  function formatCompletedBadgeLabel(taskLabel) {
    var PU = priorityUI();
    if (PU && PU.formatCompletedBadgeLabel) {
      return PU.formatCompletedBadgeLabel(taskLabel);
    }
    var prefix = (PU && PU.COMPLETED_BADGE_PREFIX) || 'Compl\u00e9t\u00e9';
    return prefix + ' (' + taskLabel + ')';
  }

  function formatBlockedBoardBadgeText(display) {
    var d = display || {};
    var PU = priorityUI();
    if (PU && PU.formatBlockedBadgeText) {
      var summary =
        PU.formatBlockedReasonsSummary
          ? PU.formatBlockedReasonsSummary(
              d.blockedReasons != null ? d.blockedReasons : d.blockedReason,
              { empty: '', links: d.blockedLinks || d.blockedLink }
            )
          : typeof d.blockedReason === 'string'
            ? d.blockedReason.trim()
            : '';
      return PU.formatBlockedBadgeText(d, summary || undefined);
    }
    var label = incompleteBadgeLabel(d) || 'T\u00e2che';
    var trimmed =
      PU && PU.formatBlockedReasonsSummary
        ? PU.formatBlockedReasonsSummary(
            d.blockedReasons != null ? d.blockedReasons : d.blockedReason,
            { empty: '', links: d.blockedLinks || d.blockedLink }
          )
        : typeof d.blockedReason === 'string'
          ? d.blockedReason.trim()
          : '';
    if (!trimmed || trimmed === 'Bloqu\u00e9') return label;
    return trimmed + ' (' + label + ')';
  }

  function formatProgressFaceSuffix(progress) {
    var CT = global.CompletionTrello;
    if (!progress || !(progress.percent > 0)) return '';
    if (CT && typeof CT.formatFaceBadgeText === 'function') {
      return CT.formatFaceBadgeText(progress) || '';
    }
    if (progress.percent === 100) return '\u2713 ' + progress.percent + '\u00a0%';
    return progress.percent + '\u00a0%';
  }

  function formatBadgeText(display, completed, progress) {
    var priorityText = '';
    if (display) {
      if (completed) {
        priorityText =
          tierBadgeDot(display, true) + ' ' + formatCompletedBadgeLabel(incompleteBadgeLabel(display));
      } else if (display.blocked) {
        priorityText = tierBadgeDot(display, false) + ' ' + formatBlockedBoardBadgeText(display);
      } else {
        var PU = priorityUI();
        if (display.priorityEnabled === false) {
          if (PU && display.dueCountdown) {
            priorityText = tierBadgeDot(display, false) + ' ' + display.dueCountdown;
          }
        } else if (PU && PU.formatDueBadgeText && display.dueCountdown) {
          priorityText = tierBadgeDot(display, false) + ' ' + PU.formatDueBadgeText(display);
        } else if (display.priorityEnabled !== false) {
          priorityText = tierBadgeDot(display, false) + ' ' + incompleteBadgeLabel(display);
        }
      }
    }
    var progressText = formatProgressFaceSuffix(progress);
    if (priorityText && progressText) return priorityText + ' \u00b7 ' + progressText;
    return priorityText || progressText || '';
  }

  function tierDetailBadgeColor(display) {
    var PU = priorityUI();
    if (PU && PU.tierTrelloBadgeColor) {
      return PU.tierTrelloBadgeColor(display);
    }
    return trelloBadgeMuted();
  }

  function progressFaceBadgeColor(progress) {
    if (
      typeof global.CompletionUI !== 'undefined' &&
      global.CompletionUI.completionTrelloBadgeColor
    ) {
      return global.CompletionUI.completionTrelloBadgeColor(progress.percent);
    }
    if (progress && progress.percent === 100) return 'green';
    if (progress && progress.percent >= 50) return 'blue';
    return 'sky';
  }

  function buildCardFaceBadge(display, completed, progress) {
    var text = formatBadgeText(display, completed, progress);
    if (!text) return null;
    if (display) {
      return {
        text: text,
        color: completed ? trelloBadgeComplete() : tierDetailBadgeColor(display),
      };
    }
    if (progress && progress.percent > 0) {
      return {
        text: text,
        color: progressFaceBadgeColor(progress),
      };
    }
    return null;
  }

  function brandAppName() {
    var brand = global.PriorityBrand;
    if (brand && typeof brand.getAppName === 'function') return brand.getAppName();
    if (brand && typeof brand.appName === 'string' && brand.appName.trim()) {
      return brand.appName.trim();
    }
    var cfg = global.PriorityRestConfig;
    if (cfg && typeof cfg.appName === 'string' && cfg.appName.trim()) {
      return cfg.appName.trim();
    }
    var PU = priorityUI();
    return (PU && PU.DEFINE_PRIORITY_LABEL) || 'Trello Cerveau';
  }

  function definePriorityLabel() {
    return brandAppName();
  }

  function parseCardNameValue(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (typeof value.name === 'string') {
        var fromName = value.name.trim();
        if (fromName) return fromName;
      }
    }
    return null;
  }

  function cardDataPromise(t) {
    var fields = Array.prototype.slice.call(arguments, 1);
    var argId = readPowerUpArg(t, 'cardId');
    if (argId) {
      return restGetCardJson(t, argId, buildRestCardQuery(fields));
    }
    return withTimeout(
      new Promise(function (resolve, reject) {
        t.card.apply(t, fields).then(resolve, reject);
      }),
      CARD_FIELD_TIMEOUT_MS,
      't.card timeout'
    );
  }

  async function getCardName(t) {
    if (typeof t.arg === 'function') {
      var fromArg = parseCardNameValue(t.arg('cardName'));
      if (fromArg) return fromArg;
    }

    try {
      // Documented API: t.card('name').then(card => card.name) — not .get('name'),
      // which often returns the unresolved chain (has .get → isPowerUpRequestChain).
      var card = await cardDataPromise(t, 'name');
      var name = parseCardNameValue(card);
      if (name) return name;

      var scalar = await cardFieldPromise(t, 'name');
      if (!isPowerUpRequestChain(scalar)) {
        name = parseCardNameValue(scalar);
        if (name) return name;
      }
      return null;
    } catch (err) {
      console.error('Priority card name failed', err);
      return null;
    }
  }

  async function getCardDesc(t) {
    try {
      var card = await cardDataPromise(t, 'desc');
      if (card && typeof card.desc === 'string') return card.desc;
      var scalar = await cardFieldPromise(t, 'desc');
      if (typeof scalar === 'string') return scalar;
      if (scalar && typeof scalar === 'object' && typeof scalar.desc === 'string') {
        return scalar.desc;
      }
      return '';
    } catch (err) {
      console.error('Priority card desc failed', err);
      return '';
    }
  }

  function normalizeMemberList(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (member) {
      return (
        member &&
        typeof member === 'object' &&
        !isPowerUpRequestChain(member) &&
        member.id
      );
    });
  }

  /**
   * Members assigned to the current card (`t.card('members')`).
   * Each entry typically has id, fullName, username, initials,
   * and avatar (ready URL) and/or avatarHash/avatarUrl.
   */
  async function getCardMembers(t) {
    try {
      var card = await cardDataPromise(t, 'members');
      var list = null;
      if (card && Array.isArray(card.members)) list = card.members;
      else if (Array.isArray(card)) list = card;
      else {
        var scalar = await cardFieldPromise(t, 'members');
        if (Array.isArray(scalar)) list = scalar;
        else if (scalar && Array.isArray(scalar.members)) list = scalar.members;
      }
      return normalizeMemberList(list);
    } catch (err) {
      console.error('Priority card members failed', err);
      return [];
    }
  }

  /**
   * The member viewing the Power-Up (`t.member(...)`).
   * Used to distinguish "me" vs other assignees on a card.
   */
  async function getCurrentMember(t) {
    try {
      if (!t || typeof t.member !== 'function') return null;
      var member = await new Promise(function (resolve, reject) {
        t.member('id', 'fullName', 'username', 'initials').then(resolve, reject);
      });
      if (!member || typeof member !== 'object' || isPowerUpRequestChain(member)) {
        return null;
      }
      if (!member.id) return null;
      return member;
    } catch (err) {
      console.error('Priority current member failed', err);
      return null;
    }
  }

  /**
   * Board members available to assign (`t.board('members')`).
   */
  async function getBoardMembers(t) {
    try {
      if (!t || typeof t.board !== 'function') return [];
      var board = await new Promise(function (resolve, reject) {
        t.board('members').then(resolve, reject);
      });
      var list = null;
      if (board && Array.isArray(board.members)) list = board.members;
      else if (Array.isArray(board)) list = board;
      if (isPowerUpRequestChain(list)) return [];
      return normalizeMemberList(list);
    } catch (err) {
      console.error('Priority board members failed', err);
      return [];
    }
  }

  function parseIdMemberCreator(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (value.idMemberCreator != null && value.idMemberCreator !== '') {
        return String(value.idMemberCreator);
      }
      if (value.id != null && value.id !== '' && typeof value.fullName === 'string') {
        // Already a member-shaped object from some clients.
        return String(value.id);
      }
    }
    return null;
  }

  async function fetchMemberByIdRest(t, memberId) {
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id) return null;
    if (!restClientOptions()) return null;
    try {
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/members/' +
        encodeURIComponent(id) +
        '?fields=fullName,username,initials,avatarUrl,avatarHash' +
        '&key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token);
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      var member = await response.json();
      if (!member || !member.id) return null;
      return member;
    } catch (err) {
      console.error('Priority member fetch failed', err);
      return null;
    }
  }

  /**
   * idMemberCreator is not an allowed t.card() field — load it via REST.
   */
  async function fetchCardIdMemberCreatorRest(t) {
    if (!restClientOptions()) return null;
    try {
      var cardId = await resolveCurrentCardId(t);
      if (!cardId) return null;
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/cards/' +
        encodeURIComponent(cardId) +
        '?fields=idMemberCreator' +
        '&key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token);
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      var card = await response.json();
      return parseIdMemberCreator(card);
    } catch (err) {
      console.error('Priority card idMemberCreator REST failed', err);
      return null;
    }
  }

  /**
   * Member who created the card, resolved via REST (idMemberCreator) then
   * board members / member REST lookup.
   * @param {object} t Power-Up client
   * @param {Array} [knownBoardMembers] Optional board members (avoids a second fetch)
   */
  async function getCardCreator(t, knownBoardMembers) {
    try {
      // t.card() does not expose idMemberCreator — REST only.
      var creatorId = await fetchCardIdMemberCreatorRest(t);
      if (!creatorId) return null;

      var boardMembers = Array.isArray(knownBoardMembers)
        ? normalizeMemberList(knownBoardMembers)
        : await getBoardMembers(t);
      for (var i = 0; i < boardMembers.length; i++) {
        var boardMember = boardMembers[i];
        if (boardMember && String(boardMember.id) === creatorId) {
          return boardMember;
        }
      }

      var fromRest = await fetchMemberByIdRest(t, creatorId);
      if (fromRest) return fromRest;

      return { id: creatorId };
    } catch (err) {
      console.error('Priority card creator failed', err);
      return null;
    }
  }

  /**
   * If the card has no assignees, assign the card creator.
   * No-op when already assigned, creator unknown, or REST unavailable.
   *
   * @param {object} t Power-Up client
   * @param {{ members?: Array, boardMembers?: Array, creator?: object|null }} [options]
   * @returns {Promise<{ ok: boolean, changed: boolean, reason?: string, members?: Array, creator?: object|null, memberId?: string }>}
   */
  async function ensureCreatorAssigned(t, options) {
    options = options || {};
    try {
      var members = Array.isArray(options.members)
        ? normalizeMemberList(options.members)
        : await getCardMembers(t);
      if (members.length) {
        return {
          ok: true,
          changed: false,
          reason: 'already-assigned',
          members: members,
          creator: options.creator || null
        };
      }

      var creator =
        options.creator && options.creator.id
          ? options.creator
          : await getCardCreator(t, options.boardMembers);
      if (!creator || !creator.id) {
        return { ok: false, changed: false, reason: 'no-creator', members: members };
      }

      var addResult = await addCardMember(t, creator.id);
      if (!addResult || addResult.ok === false) {
        return {
          ok: false,
          changed: false,
          reason: (addResult && addResult.reason) || 'add-failed',
          members: members,
          creator: creator
        };
      }

      var nextMembers = await getCardMembers(t);
      if (!nextMembers.length) nextMembers = [creator];
      return {
        ok: true,
        changed: true,
        members: nextMembers,
        creator: creator,
        memberId: String(creator.id)
      };
    } catch (err) {
      console.error('Priority ensureCreatorAssigned failed', err);
      return {
        ok: false,
        changed: false,
        reason: 'error',
        error: (err && err.message) || String(err || 'Erreur')
      };
    }
  }

  function normalizeLabelList(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (label) {
      return (
        label &&
        typeof label === 'object' &&
        !isPowerUpRequestChain(label) &&
        label.id
      );
    });
  }

  /**
   * Labels on the current card (`t.card('labels')`).
   * Each entry typically has id, name, color, idBoard.
   */
  async function getCardLabels(t) {
    try {
      var card = await cardDataPromise(t, 'labels');
      var list = null;
      if (card && Array.isArray(card.labels)) list = card.labels;
      else if (Array.isArray(card)) list = card;
      else {
        var scalar = await cardFieldPromise(t, 'labels');
        if (Array.isArray(scalar)) list = scalar;
        else if (scalar && Array.isArray(scalar.labels)) list = scalar.labels;
      }
      return normalizeLabelList(list);
    } catch (err) {
      console.error('Priority card labels failed', err);
      return [];
    }
  }

  /**
   * All labels available on the board (`t.board('labels')`).
   */
  async function getBoardLabels(t) {
    try {
      if (!t || typeof t.board !== 'function') return [];
      var board = await new Promise(function (resolve, reject) {
        t.board('labels').then(resolve, reject);
      });
      var list = null;
      if (board && Array.isArray(board.labels)) list = board.labels;
      else if (Array.isArray(board)) list = board;
      if (isPowerUpRequestChain(list)) return [];
      return normalizeLabelList(list);
    } catch (err) {
      console.error('Priority board labels failed', err);
      return [];
    }
  }

  // exports
  S.CARD_FIELD_TIMEOUT_MS = CARD_FIELD_TIMEOUT_MS;
  S.brandAppName = brandAppName;
  S.buildCardFaceBadge = buildCardFaceBadge;
  S.buildRestCardQuery = buildRestCardQuery;
  S.cardDataPromise = cardDataPromise;
  S.cardFieldPromise = cardFieldPromise;
  S.computeDisplay = computeDisplay;
  S.definePriorityLabel = definePriorityLabel;
  S.ensureBoardPriorityContext = ensureBoardPriorityContext;
  S.ensureCreatorAssigned = ensureCreatorAssigned;
  S.fetchCardIdMemberCreatorRest = fetchCardIdMemberCreatorRest;
  S.fetchMemberByIdRest = fetchMemberByIdRest;
  S.formatBadgeText = formatBadgeText;
  S.formatBlockedBoardBadgeText = formatBlockedBoardBadgeText;
  S.formatCompletedBadgeLabel = formatCompletedBadgeLabel;
  S.formatProgressFaceSuffix = formatProgressFaceSuffix;
  S.getBoardLabels = getBoardLabels;
  S.getBoardMembers = getBoardMembers;
  S.getCachedBoardColorSchemeKey = getCachedBoardColorSchemeKey;
  S.getCachedCustomAssigneeCatalog = getCachedCustomAssigneeCatalog;
  S.getCachedPlaceCatalog = getCachedPlaceCatalog;
  S.getCardCreator = getCardCreator;
  S.getCardDesc = getCardDesc;
  S.getCardDisplay = getCardDisplay;
  S.getCardLabels = getCardLabels;
  S.getCardMembers = getCardMembers;
  S.getCardName = getCardName;
  S.getCurrentMember = getCurrentMember;
  S.getCustomAssigneeCatalog = getCustomAssigneeCatalog;
  S.getPlaceCatalog = getPlaceCatalog;
  S.incompleteBadgeLabel = incompleteBadgeLabel;
  S.isCardMarkedComplete = isCardMarkedComplete;
  S.isPowerUpRequestChain = isPowerUpRequestChain;
  S.normalizeLabelList = normalizeLabelList;
  S.normalizeMemberList = normalizeMemberList;
  S.parseCardNameValue = parseCardNameValue;
  S.parseIdMemberCreator = parseIdMemberCreator;
  S.preloadBoardPriorityContext = preloadBoardPriorityContext;
  S.progressFaceBadgeColor = progressFaceBadgeColor;
  S.restGetCardJson = restGetCardJson;
  S.saveCustomAssigneeCatalog = saveCustomAssigneeCatalog;
  S.savePlaceCatalog = savePlaceCatalog;
  S.tierBadgeDot = tierBadgeDot;
  S.tierDetailBadgeColor = tierDetailBadgeColor;
  S.withTimeout = withTimeout;
})(typeof window !== 'undefined' ? window : this);
