/**
 * priority-trello: part 2 of 3 (resolveCurrentBoardId).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello.parts.json for the load order).
 */

/**
 * priority-trello-badges-due: part 1 of 2 (resolveCurrentBoardId).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello-badges-due.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityTrelloParts = global.PriorityTrelloParts || {});

  // from earlier parts (values)
  var BADGE_REFRESH_SEC = S.BADGE_REFRESH_SEC;
  var CARD_DETAIL_BADGE_TITLE = S.CARD_DETAIL_BADGE_TITLE;
  var CARD_DUE_SYNCED_KEY = S.CARD_DUE_SYNCED_KEY;
  var CARD_PRIORITY_KEY = S.CARD_PRIORITY_KEY;
  var CARD_START_SYNCED_KEY = S.CARD_START_SYNCED_KEY;
  var COLOR_SCHEME_REV_KEY = S.COLOR_SCHEME_REV_KEY;
  var DEFAULT_INPUTS = S.DEFAULT_INPUTS;

  // from other parts (functions, resolved at call time)
  function restClientOptions() { return S.restClientOptions.apply(this, arguments); }
  function brandAppName() { return S.brandAppName.apply(this, arguments); }
  function buildCardFaceBadge() { return S.buildCardFaceBadge.apply(this, arguments); }
  function cardFieldPromise() { return S.cardFieldPromise.apply(this, arguments); }
  function clearBlockedFromInputs() { return S.clearBlockedFromInputs.apply(this, arguments); }
  function computeDisplay() { return S.computeDisplay.apply(this, arguments); }
  function definePriorityLabel() { return S.definePriorityLabel.apply(this, arguments); }
  function ensureBoardPriorityContext() { return S.ensureBoardPriorityContext.apply(this, arguments); }
  function formatBadgeText() { return S.formatBadgeText.apply(this, arguments); }
  function getCardDesc() { return S.getCardDesc.apply(this, arguments); }
  function getCardDisplay() { return S.getCardDisplay.apply(this, arguments); }
  function getCardInputs() { return S.getCardInputs.apply(this, arguments); }
  function getCardName() { return S.getCardName.apply(this, arguments); }
  function isCardMarkedComplete() { return S.isCardMarkedComplete.apply(this, arguments); }
  function isPowerUpRequestChain() { return S.isPowerUpRequestChain.apply(this, arguments); }
  function normalizeInputs() { return S.normalizeInputs.apply(this, arguments); }
  function priorityUI() { return S.priorityUI.apply(this, arguments); }
  function readCardIdAndListId() { return S.readCardIdAndListId.apply(this, arguments); }
  function restPutCard() { return S.restPutCard.apply(this, arguments); }
  function trelloBadgeComplete() { return S.trelloBadgeComplete.apply(this, arguments); }

var S = (global.PriorityTrelloParts = global.PriorityTrelloParts || {});
  var BADGE_REFRESH_SEC = S.BADGE_REFRESH_SEC;
  var CARD_DETAIL_BADGE_TITLE = S.CARD_DETAIL_BADGE_TITLE;
  var CARD_DUE_SYNCED_KEY = S.CARD_DUE_SYNCED_KEY;
  var CARD_PRIORITY_KEY = S.CARD_PRIORITY_KEY;
  var CARD_START_SYNCED_KEY = S.CARD_START_SYNCED_KEY;
  var COLOR_SCHEME_REV_KEY = S.COLOR_SCHEME_REV_KEY;
  var DEFAULT_INPUTS = S.DEFAULT_INPUTS;
  function brandAppName() { return S.brandAppName.apply(this, arguments); }
  function buildCardFaceBadge() { return S.buildCardFaceBadge.apply(this, arguments); }
  function cardFieldPromise() { return S.cardFieldPromise.apply(this, arguments); }
  function clearBlockedFromInputs() { return S.clearBlockedFromInputs.apply(this, arguments); }
  function computeDisplay() { return S.computeDisplay.apply(this, arguments); }
  function definePriorityLabel() { return S.definePriorityLabel.apply(this, arguments); }
  function ensureBoardPriorityContext() { return S.ensureBoardPriorityContext.apply(this, arguments); }
  function formatBadgeText() { return S.formatBadgeText.apply(this, arguments); }
  function getCardDesc() { return S.getCardDesc.apply(this, arguments); }
  function getCardDisplay() { return S.getCardDisplay.apply(this, arguments); }
  function getCardInputs() { return S.getCardInputs.apply(this, arguments); }
  function getCardName() { return S.getCardName.apply(this, arguments); }
  function isCardMarkedComplete() { return S.isCardMarkedComplete.apply(this, arguments); }
  function isPowerUpRequestChain() { return S.isPowerUpRequestChain.apply(this, arguments); }
  function normalizeInputs() { return S.normalizeInputs.apply(this, arguments); }
  function priorityUI() { return S.priorityUI.apply(this, arguments); }
  function readCardIdAndListId() { return S.readCardIdAndListId.apply(this, arguments); }
  function restPutCard() { return S.restPutCard.apply(this, arguments); }
  function trelloBadgeComplete() { return S.trelloBadgeComplete.apply(this, arguments); }

  async function resolveCurrentBoardId(t) {
    try {
      if (t && typeof t.board === 'function') {
        var board = await new Promise(function (resolve, reject) {
          t.board('id').then(resolve, reject);
        });
        if (typeof board === 'string' && board.trim()) return board.trim();
        if (board && typeof board === 'object' && !isPowerUpRequestChain(board)) {
          if (board.id != null && String(board.id).trim()) return String(board.id).trim();
        }
      }
    } catch (err) {
      /* ignore */
    }
    try {
      var cardId = await resolveCurrentCardId(t);
      if (!cardId || !restClientOptions()) return null;
      var api = await t.getRestApi();
      var authorized = await api.isAuthorized();
      if (!authorized) return null;
      var token = await api.getToken();
      if (!token) return null;
      var cfg = restClientOptions();
      var url =
        'https://api.trello.com/1/cards/' +
        encodeURIComponent(cardId) +
        '?fields=idBoard' +
        '&key=' +
        encodeURIComponent(cfg.appKey) +
        '&token=' +
        encodeURIComponent(token);
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return null;
      var card = await response.json();
      if (card && card.idBoard != null && String(card.idBoard).trim()) {
        return String(card.idBoard).trim();
      }
    } catch (restErr) {
      console.error('Priority board id REST failed', restErr);
    }
    return null;
  }

  var BOARD_LABEL_COLORS = [
    'green',
    'yellow',
    'orange',
    'red',
    'purple',
    'blue',
    'sky',
    'lime',
    'pink',
    'black'
  ];

  function normalizeBoardLabelColor(color) {
    if (color == null || color === '') return null;
    var base = String(color)
      .replace(/_(light|dark)$/i, '')
      .toLowerCase()
      .trim();
    if (BOARD_LABEL_COLORS.indexOf(base) !== -1) return base;
    return null;
  }

  function pickUnusedLabelColor(existingLabels) {
    var used = Object.create(null);
    var list = Array.isArray(existingLabels) ? existingLabels : [];
    for (var i = 0; i < list.length; i++) {
      var c = normalizeBoardLabelColor(list[i] && list[i].color);
      if (c) used[c] = true;
    }
    for (var j = 0; j < BOARD_LABEL_COLORS.length; j++) {
      if (!used[BOARD_LABEL_COLORS[j]]) return BOARD_LABEL_COLORS[j];
    }
    return BOARD_LABEL_COLORS[list.length % BOARD_LABEL_COLORS.length] || 'blue';
  }

  /**
   * Create a board label via REST POST /labels, then optionally attach it to the card.
   * Requires OAuth (same as title / description edits).
   *
   * @param {object} t Power-Up client
   * @param {{ name: string, color?: string|null, addToCard?: boolean, existingLabels?: Array }} options
   */
  async function createBoardLabel(t, options) {
    options = options || {};
    var name = typeof options.name === 'string' ? options.name.trim() : '';
    if (!name) return { ok: false, reason: 'empty-name', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var boardId = await resolveCurrentBoardId(t);
    if (!boardId) return { ok: false, reason: 'no-board-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var color =
      options.color !== undefined
        ? normalizeBoardLabelColor(options.color)
        : pickUnusedLabelColor(options.existingLabels);

    var url =
      'https://api.trello.com/1/labels' +
      '?name=' +
      encodeURIComponent(name.slice(0, 16384)) +
      '&idBoard=' +
      encodeURIComponent(boardId) +
      '&key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);
    if (color) url += '&color=' + encodeURIComponent(color);

    var response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST POST /labels failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }

    var created = await response.json();
    if (!created || !created.id) {
      return { ok: false, reason: 'no-label', changed: false };
    }

    var label = {
      id: String(created.id),
      name: typeof created.name === 'string' ? created.name : name,
      color: created.color != null ? created.color : color,
      idBoard: created.idBoard != null ? String(created.idBoard) : boardId
    };

    var addToCard = options.addToCard !== false;
    if (addToCard) {
      var addResult = await addCardLabel(t, label.id);
      if (!addResult || addResult.ok === false) {
        return {
          ok: false,
          reason: (addResult && addResult.reason) || 'add-failed',
          changed: false,
          label: label
        };
      }
    }

    return { ok: true, changed: true, label: label, labelId: label.id };
  }

  /**
   * Update a board label via REST PUT /labels/{id}.
   * Accepts name and/or color. Requires OAuth (same as title / description edits).
   *
   * @param {object} t Power-Up client
   * @param {string} labelId
   * @param {{ color?: string|null, name?: string }} options
   */
  async function updateBoardLabel(t, labelId, options) {
    options = options || {};
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var hasColor = Object.prototype.hasOwnProperty.call(options, 'color');
    var hasName = Object.prototype.hasOwnProperty.call(options, 'name');
    if (!hasColor && !hasName) {
      return { ok: false, reason: 'no-changes', changed: false };
    }

    var color = null;
    if (hasColor) {
      color = normalizeBoardLabelColor(options.color);
      if (!color) return { ok: false, reason: 'invalid-color', changed: false };
    }
    var name = null;
    if (hasName) {
      name = typeof options.name === 'string' ? options.name.trim() : '';
      if (name.length > 16384) {
        return { ok: false, reason: 'name-too-long', changed: false };
      }
    }

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var params = [
      'key=' + encodeURIComponent(cfg.appKey),
      'token=' + encodeURIComponent(token)
    ];
    if (hasColor) params.push('color=' + encodeURIComponent(color));
    if (hasName) params.push('name=' + encodeURIComponent(name));

    var url =
      'https://api.trello.com/1/labels/' +
      encodeURIComponent(id) +
      '?' +
      params.join('&');

    var response = await fetch(url, { method: 'PUT' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST PUT /labels/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }

    var updated = null;
    try {
      updated = await response.json();
    } catch (parseErr) {
      updated = null;
    }

    var label = {
      id: id,
      name:
        updated && typeof updated.name === 'string'
          ? updated.name
          : hasName
            ? name
            : undefined,
      color:
        updated && Object.prototype.hasOwnProperty.call(updated, 'color')
          ? updated.color
          : hasColor
            ? color
            : undefined,
      idBoard:
        updated && updated.idBoard != null ? String(updated.idBoard) : undefined
    };

    return {
      ok: true,
      changed: true,
      label: label,
      labelId: id,
      color: label.color,
      name: label.name
    };
  }

  /**
   * Add an existing board label to the card via REST POST /cards/{id}/idLabels.
   * Requires OAuth (same as title / description edits).
   */
  async function addCardLabel(t, labelId) {
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idLabels?value=' +
      encodeURIComponent(id) +
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
        'Trello REST POST /cards/' +
          cardId +
          '/idLabels failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, labelId: id };
  }

  /**
   * Remove a label from the card via REST DELETE /cards/{id}/idLabels/{idLabel}.
   * Requires OAuth (same as title / description edits).
   */
  async function removeCardLabel(t, labelId) {
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idLabels/' +
      encodeURIComponent(id) +
      '?key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST DELETE /cards/' +
          cardId +
          '/idLabels/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, labelId: id };
  }

  /**
   * Permanently delete a board label via REST DELETE /labels/{id}.
   * Removes it from every card on the board. Requires OAuth.
   */
  async function deleteBoardLabel(t, labelId) {
    var id = labelId != null ? String(labelId).trim() : '';
    if (!id) return { ok: false, reason: 'no-label-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/labels/' +
      encodeURIComponent(id) +
      '?key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST DELETE /labels/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, labelId: id };
  }

  /**
   * Assign a board member to the card via REST POST /cards/{id}/idMembers.
   * Requires OAuth (same as title / description edits).
   */
  async function addCardMember(t, memberId) {
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id) return { ok: false, reason: 'no-member-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idMembers?value=' +
      encodeURIComponent(id) +
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
        'Trello REST POST /cards/' +
          cardId +
          '/idMembers failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, memberId: id };
  }

  /**
   * Unassign a member from the card via REST DELETE /cards/{id}/idMembers/{idMember}.
   * Requires OAuth (same as title / description edits).
   */
  async function removeCardMember(t, memberId) {
    var id = memberId != null ? String(memberId).trim() : '';
    if (!id) return { ok: false, reason: 'no-member-id', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var cfg = restClientOptions();
    var api = await t.getRestApi();
    var authorized = await api.isAuthorized();
    if (!authorized) return { ok: false, reason: 'not-authorized', changed: false };
    var token = await api.getToken();
    if (!token) return { ok: false, reason: 'no-token', changed: false };

    var url =
      'https://api.trello.com/1/cards/' +
      encodeURIComponent(cardId) +
      '/idMembers/' +
      encodeURIComponent(id) +
      '?key=' +
      encodeURIComponent(cfg.appKey) +
      '&token=' +
      encodeURIComponent(token);

    var response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      var detail = '';
      try {
        detail = await response.text();
      } catch (readErr) {
        detail = readErr && readErr.message ? readErr.message : '';
      }
      throw new Error(
        'Trello REST DELETE /cards/' +
          cardId +
          '/idMembers/' +
          id +
          ' failed: ' +
          response.status +
          (detail ? ' ' + detail : '')
      );
    }
    return { ok: true, changed: true, memberId: id };
  }

  /**
   * Update the card description via REST PUT. Requires OAuth (same as due sync).
   */
  async function setCardDesc(t, desc) {
    var want = typeof desc === 'string' ? desc : '';
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var current = await getCardDesc(t);
    if (current === want) {
      return { ok: true, changed: false, desc: want };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { desc: want });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, desc: want };
  }

  /**
   * Update the card name via REST PUT. Requires OAuth (same as due sync).
   */
  async function setCardName(t, name) {
    var want = typeof name === 'string' ? name.trim() : '';
    if (!want) return { ok: false, reason: 'empty-name', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var current = await getCardName(t);
    if (current === want) {
      return { ok: true, changed: false, name: want };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { name: want });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, name: want };
  }

  async function getCardDueComplete(t) {
    try {
      // Documented pattern: t.card(field).get(field).then(value) — resolves the scalar/object.
      // Never bare await t.card(...) (returns chain) or !!chain (always truthy → every ✓).
      var dueComplete = await cardFieldPromise(t, 'dueComplete');
      if (dueComplete === true) return true;
      if (dueComplete === false) return false;
      if (isPowerUpRequestChain(dueComplete)) {
        dueComplete = null;
      } else if (typeof dueComplete === 'object' && dueComplete !== null) {
        var fromObject = isCardMarkedComplete(dueComplete);
        if (fromObject) return true;
        if (dueComplete.dueComplete === false || (dueComplete.badges && dueComplete.badges.dueComplete === false)) {
          return false;
        }
      }

      var badges = await cardFieldPromise(t, 'badges');
      if (isPowerUpRequestChain(badges)) return false;
      if (badges && typeof badges === 'object') {
        if (badges.dueComplete === true) return true;
        if (badges.dueComplete === false) return false;
      }
      return false;
    } catch (err) {
      console.error('Priority card dueComplete failed', err);
      return false;
    }
  }

  function parseCardDueValue(value) {
    if (value == null || value === false) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (typeof value.due === 'string' && value.due.trim()) return value.due.trim();
      if (value.badges && typeof value.badges === 'object' && !isPowerUpRequestChain(value.badges)) {
        if (typeof value.badges.due === 'string' && value.badges.due.trim()) {
          return value.badges.due.trim();
        }
      }
    }
    return null;
  }

  async function getCardDue(t) {
    try {
      var due = await cardFieldPromise(t, 'due');
      if (isPowerUpRequestChain(due)) due = null;
      var parsed = parseCardDueValue(due);
      if (parsed) return parsed;

      var badges = await cardFieldPromise(t, 'badges');
      if (isPowerUpRequestChain(badges)) return null;
      return parseCardDueValue(badges && { badges: badges });
    } catch (err) {
      console.error('Priority card due failed', err);
      return null;
    }
  }

  async function resolveCurrentCardId(t) {
    var fromArg = readPowerUpArg(t, 'cardId');
    if (fromArg) return fromArg;
    var ids = await readCardIdAndListId(t);
    var cardId = ids && ids.cardId;
    if (cardId) return cardId;
    try {
      var rawId = await cardFieldPromise(t, 'id');
      if (isPowerUpRequestChain(rawId)) rawId = null;
      if (typeof rawId === 'object' && rawId) rawId = rawId.id;
      if (rawId) return String(rawId);
    } catch (err) {
      /* ignore */
    }
    return null;
  }

  /**
   * Read a Power-Up iframe arg from t.arg(), then URL ?query (Gantt overlay).
   */
  function readPowerUpArg(t, key) {
    if (!key) return null;
    try {
      if (t && typeof t.arg === 'function') {
        var fromArg = t.arg(key);
        if (fromArg != null && String(fromArg).trim()) {
          return String(fromArg).trim();
        }
      }
    } catch (argErr) {
      /* ignore */
    }
    try {
      if (typeof URLSearchParams !== 'undefined' && global.location) {
        var sp = new URLSearchParams(global.location.search || '');
        var fromUrl = sp.get(key);
        if (fromUrl != null && String(fromUrl).trim()) {
          return String(fromUrl).trim();
        }
      }
    } catch (urlErr) {
      /* ignore */
    }
    return null;
  }

  /**
   * Plugin-data scope for the active card: explicit cardId arg (board → Cerveau
   * modal) or the literal 'card' when the iframe already has card context.
   */
  async function cardPluginScope(t) {
    var id = await resolveCurrentCardId(t);
    return id || 'card';
  }

  async function getCardDueSyncedIso(t) {
    try {
      var stored = await t.get(await cardPluginScope(t), 'shared', CARD_DUE_SYNCED_KEY);
      if (stored == null) return '';
      if (stored === '') return '';
      if (typeof stored !== 'string') return '';
      var PU = priorityUI();
      if (PU && PU.canonicalizeTrelloDueIso) {
        return PU.canonicalizeTrelloDueIso(stored);
      }
      return stored;
    } catch (err) {
      return '';
    }
  }

  async function setCardDueSyncedIso(t, iso) {
    try {
      await t.set(
        await cardPluginScope(t),
        'shared',
        CARD_DUE_SYNCED_KEY,
        typeof iso === 'string' ? iso : ''
      );
    } catch (err) {
      console.error('Priority due sync marker failed', err);
    }
  }

  function applyDuePartsToInputs(inputs, parts) {
    var next = inputs
      ? Object.assign({}, inputs)
      : Object.assign({}, DEFAULT_INPUTS, { priorityEnabled: false });
    var prevVague =
      inputs && typeof inputs.dueVague === 'string' ? inputs.dueVague : '';
    var prevMode = inputs && inputs.dueMode === 'vague' ? 'vague' : '';
    var prevDueDate =
      inputs && typeof inputs.dueDate === 'string' ? inputs.dueDate : '';
    delete next.dueDate;
    delete next.dueTime;
    delete next.dueEnabled;
    delete next.dueMode;
    delete next.dueVague;
    if (parts && parts.dueDate) {
      next.dueDate = parts.dueDate;
      if (parts.dueTime) next.dueTime = parts.dueTime;
      // Keep Vague horizon when Trello still has the same calendar proxy day.
      // Otherwise badge sync (prefer:trello) would flatten Vague → "3 ans restants".
      if (
        (prevMode === 'vague' || prevVague) &&
        prevVague &&
        prevDueDate &&
        parts.dueDate === prevDueDate
      ) {
        next.dueMode = 'vague';
        next.dueVague = prevVague;
        delete next.dueTime;
      }
    }
    return normalizeInputs(next);
  }

  function inputsToCanonicalDueIso(inputs) {
    var PU = priorityUI();
    if (PU && PU.inputsToTrelloDueIso) return PU.inputsToTrelloDueIso(inputs) || '';
    return '';
  }

  function canonicalizeDueIso(value) {
    var PU = priorityUI();
    if (!value) return '';
    if (PU && PU.canonicalizeTrelloDueIso) return PU.canonicalizeTrelloDueIso(value) || '';
    return String(value);
  }

  /**
   * Set or clear the card's Trello Dates due via REST PUT.
   * Requires OAuth (same path as auto-sort / dueComplete).
   */
  async function setCardDue(t, dueIso) {
    var want = dueIso ? canonicalizeDueIso(dueIso) : '';
    if (dueIso && !want) return { ok: false, reason: 'invalid-due', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var currentRaw = await getCardDue(t);
    var currentCanon = canonicalizeDueIso(currentRaw);
    if (currentCanon === want) {
      return { ok: true, changed: false, due: want || null };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { due: want || null });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, due: want || null };
  }

  /**
   * Two-way sync: Échéance (cardPriority dueDate/dueTime) ↔ Trello Dates `due`.
   * Uses CARD_DUE_SYNCED_KEY to detect which side changed since last agreement.
   * options.prefer: 'trello' (default, pull on conflict) | 'powerup' (push on conflict)
   */
  async function syncCardDueWithTrello(t, options) {
    options = options || {};
    var prefer = options.prefer === 'powerup' ? 'powerup' : 'trello';
    var inputs = options.inputs !== undefined ? options.inputs : await getCardInputs(t);
    if (inputs) inputs = normalizeInputs(inputs) || inputs;

    var PU = priorityUI();
    var trelloRaw = await getCardDue(t);
    var actualCanon = canonicalizeDueIso(trelloRaw);
    var expectedCanon = inputsToCanonicalDueIso(inputs);
    var lastSynced = await getCardDueSyncedIso(t);

    if (actualCanon === expectedCanon) {
      if (lastSynced !== actualCanon) await setCardDueSyncedIso(t, actualCanon);
      return {
        ok: true,
        changed: false,
        inputs: inputs,
        due: actualCanon || null,
      };
    }

    var trelloChanged = actualCanon !== lastSynced;
    var powerUpChanged = expectedCanon !== lastSynced;
    var action = 'pull';
    if (powerUpChanged && !trelloChanged) action = 'push';
    else if (trelloChanged && !powerUpChanged) action = 'pull';
    else if (powerUpChanged && trelloChanged) {
      action = prefer === 'powerup' ? 'push' : 'pull';
    } else {
      action = prefer === 'powerup' ? 'push' : 'pull';
    }

    if (action === 'pull') {
      if (!actualCanon) {
        if (!inputs || !inputs.dueDate) {
          if (lastSynced !== '') await setCardDueSyncedIso(t, '');
          return { ok: true, changed: false, inputs: inputs, due: null, direction: 'pull' };
        }
        var cleared = applyDuePartsToInputs(inputs, null);
        await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, cleared);
        await setCardDueSyncedIso(t, '');
        return {
          ok: true,
          changed: true,
          direction: 'pull',
          inputs: cleared,
          due: null,
        };
      }
      var parts =
        PU && PU.parseTrelloDueToParts
          ? PU.parseTrelloDueToParts(actualCanon)
          : null;
      if (!parts && trelloRaw && PU && PU.parseTrelloDueToParts) {
        parts = PU.parseTrelloDueToParts(trelloRaw);
      }
      if (!parts) {
        return {
          ok: false,
          reason: 'invalid-trello-due',
          changed: false,
          inputs: inputs,
          due: trelloRaw,
        };
      }
      var nextInputs = applyDuePartsToInputs(inputs, parts);
      var nextCanon = inputsToCanonicalDueIso(nextInputs);
      var inputsChanged =
        !inputs ||
        inputs.dueDate !== nextInputs.dueDate ||
        (inputs.dueTime || '') !== (nextInputs.dueTime || '') ||
        (inputs.dueEnabled === false) !== (nextInputs.dueEnabled === false);
      if (inputsChanged) {
        await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, nextInputs);
      }
      await setCardDueSyncedIso(t, nextCanon);
      return {
        ok: true,
        changed: inputsChanged,
        direction: 'pull',
        inputs: nextInputs,
        due: nextCanon || null,
      };
    }

    var put = await setCardDue(t, expectedCanon || null);
    if (!put.ok) {
      return {
        ok: false,
        reason: put.reason || 'push-failed',
        changed: false,
        direction: 'push',
        inputs: inputs,
        due: actualCanon || null,
      };
    }
    await setCardDueSyncedIso(t, expectedCanon);
    return {
      ok: true,
      changed: !!put.changed,
      direction: 'push',
      inputs: inputs,
      due: expectedCanon || null,
    };
  }

  // exports
  S.BOARD_LABEL_COLORS = BOARD_LABEL_COLORS;
  S.addCardLabel = addCardLabel;
  S.addCardMember = addCardMember;
  S.applyDuePartsToInputs = applyDuePartsToInputs;
  S.canonicalizeDueIso = canonicalizeDueIso;
  S.cardPluginScope = cardPluginScope;
  S.createBoardLabel = createBoardLabel;
  S.deleteBoardLabel = deleteBoardLabel;
  S.getCardDue = getCardDue;
  S.getCardDueComplete = getCardDueComplete;
  S.getCardDueSyncedIso = getCardDueSyncedIso;
  S.inputsToCanonicalDueIso = inputsToCanonicalDueIso;
  S.normalizeBoardLabelColor = normalizeBoardLabelColor;
  S.parseCardDueValue = parseCardDueValue;
  S.pickUnusedLabelColor = pickUnusedLabelColor;
  S.readPowerUpArg = readPowerUpArg;
  S.removeCardLabel = removeCardLabel;
  S.removeCardMember = removeCardMember;
  S.resolveCurrentBoardId = resolveCurrentBoardId;
  S.resolveCurrentCardId = resolveCurrentCardId;
  S.setCardDesc = setCardDesc;
  S.setCardDue = setCardDue;
  S.setCardDueSyncedIso = setCardDueSyncedIso;
  S.setCardName = setCardName;
  S.syncCardDueWithTrello = syncCardDueWithTrello;
  S.updateBoardLabel = updateBoardLabel;
})(typeof window !== 'undefined' ? window : this);
