/**
 * priority-trello: part 2 of 3 (resolveCurrentBoardId).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello.parts.json for the load order).
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

  function parseCardStartValue(value) {
    if (value == null || value === false) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object' && !isPowerUpRequestChain(value)) {
      if (typeof value.start === 'string' && value.start.trim()) {
        return value.start.trim();
      }
      if (
        value.badges &&
        typeof value.badges === 'object' &&
        !isPowerUpRequestChain(value.badges)
      ) {
        if (typeof value.badges.start === 'string' && value.badges.start.trim()) {
          return value.badges.start.trim();
        }
      }
    }
    return null;
  }

  async function getCardStart(t) {
    try {
      var start = await cardFieldPromise(t, 'start');
      if (isPowerUpRequestChain(start)) start = null;
      var parsed = parseCardStartValue(start);
      if (parsed) return parsed;

      var badges = await cardFieldPromise(t, 'badges');
      if (isPowerUpRequestChain(badges)) return null;
      return parseCardStartValue(badges && { badges: badges });
    } catch (err) {
      console.error('Priority card start failed', err);
      return null;
    }
  }

  async function getCardStartSyncedIso(t) {
    try {
      var stored = await t.get(await cardPluginScope(t), 'shared', CARD_START_SYNCED_KEY);
      if (stored == null || stored === '') return '';
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

  async function setCardStartSyncedIso(t, iso) {
    try {
      await t.set(
        await cardPluginScope(t),
        'shared',
        CARD_START_SYNCED_KEY,
        typeof iso === 'string' ? iso : ''
      );
    } catch (err) {
      console.error('Priority start sync marker failed', err);
    }
  }

  function applyStartToInputs(inputs, startDate, startTime) {
    var next = inputs
      ? Object.assign({}, inputs)
      : Object.assign({}, DEFAULT_INPUTS, { priorityEnabled: false });
    delete next.startDate;
    delete next.startTime;
    var normalized = '';
    if (startDate) {
      var PU = priorityUI();
      normalized =
        PU && PU.normalizeDueDate
          ? PU.normalizeDueDate(startDate)
          : String(startDate).trim();
      if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized = '';
    }
    if (normalized) {
      next.startDate = normalized;
      var PUTime = priorityUI();
      var nt =
        startTime && PUTime && PUTime.normalizeDueTime
          ? PUTime.normalizeDueTime(startTime)
          : startTime
            ? String(startTime).trim()
            : '';
      if (nt && /^\d{2}:\d{2}$/.test(nt)) next.startTime = nt;
    }
    return normalizeInputs(next);
  }

  function inputsToCanonicalStartIso(inputs) {
    var PU = priorityUI();
    if (PU && PU.inputsToTrelloStartIso) return PU.inputsToTrelloStartIso(inputs) || '';
    return '';
  }

  async function setCardStart(t, startIso) {
    var want = startIso ? canonicalizeDueIso(startIso) : '';
    if (startIso && !want) return { ok: false, reason: 'invalid-start', changed: false };
    if (!restClientOptions()) return { ok: false, reason: 'no-app-key', changed: false };

    var currentRaw = await getCardStart(t);
    var currentCanon = canonicalizeDueIso(currentRaw);
    if (currentCanon === want) {
      return { ok: true, changed: false, start: want || null };
    }

    var cardId = await resolveCurrentCardId(t);
    if (!cardId) return { ok: false, reason: 'no-card-id', changed: false };

    var put = await restPutCard(t, cardId, { start: want || null });
    if (!put.ok) return Object.assign({ changed: false }, put);
    return { ok: true, changed: true, start: want || null };
  }

  /**
   * Two-way sync: Échéance startDate ↔ Trello Dates `start`.
   * Same conflict rules as syncCardDueWithTrello.
   */
  async function syncCardStartWithTrello(t, options) {
    options = options || {};
    var prefer = options.prefer === 'powerup' ? 'powerup' : 'trello';
    var inputs = options.inputs !== undefined ? options.inputs : await getCardInputs(t);
    if (inputs) inputs = normalizeInputs(inputs) || inputs;

    var PU = priorityUI();
    var trelloRaw = await getCardStart(t);
    var actualCanon = canonicalizeDueIso(trelloRaw);
    var expectedCanon = inputsToCanonicalStartIso(inputs);
    var lastSynced = await getCardStartSyncedIso(t);

    if (actualCanon === expectedCanon) {
      if (lastSynced !== actualCanon) await setCardStartSyncedIso(t, actualCanon);
      return {
        ok: true,
        changed: false,
        inputs: inputs,
        start: actualCanon || null,
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
        if (!inputs || !inputs.startDate) {
          if (lastSynced !== '') await setCardStartSyncedIso(t, '');
          return {
            ok: true,
            changed: false,
            inputs: inputs,
            start: null,
            direction: 'pull',
          };
        }
        var cleared = applyStartToInputs(inputs, null);
        await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, cleared);
        await setCardStartSyncedIso(t, '');
        return {
          ok: true,
          changed: true,
          direction: 'pull',
          inputs: cleared,
          start: null,
        };
      }
      var parts =
        PU && PU.parseTrelloDueToParts
          ? PU.parseTrelloDueToParts(actualCanon)
          : null;
      if (!parts && trelloRaw && PU && PU.parseTrelloDueToParts) {
        parts = PU.parseTrelloDueToParts(trelloRaw);
      }
      if (!parts || !parts.dueDate) {
        return {
          ok: false,
          reason: 'invalid-trello-start',
          changed: false,
          inputs: inputs,
          start: trelloRaw,
        };
      }
      var nextInputs = applyStartToInputs(
        inputs,
        parts.dueDate,
        parts.dueTime || ''
      );
      var nextCanon = inputsToCanonicalStartIso(nextInputs);
      var inputsChanged =
        !inputs ||
        (inputs.startDate || '') !== (nextInputs.startDate || '') ||
        (inputs.startTime || '') !== (nextInputs.startTime || '');
      if (inputsChanged) {
        await t.set(await cardPluginScope(t), 'shared', CARD_PRIORITY_KEY, nextInputs);
      }
      await setCardStartSyncedIso(t, nextCanon);
      return {
        ok: true,
        changed: inputsChanged,
        direction: 'pull',
        inputs: nextInputs,
        start: nextCanon || null,
      };
    }

    var put = await setCardStart(t, expectedCanon || null);
    if (!put.ok) {
      return {
        ok: false,
        reason: put.reason || 'push-failed',
        changed: false,
        direction: 'push',
        inputs: inputs,
        start: actualCanon || null,
      };
    }
    await setCardStartSyncedIso(t, expectedCanon);
    return {
      ok: true,
      changed: !!put.changed,
      direction: 'push',
      inputs: inputs,
      start: expectedCanon || null,
    };
  }

  async function getBadgeData(t) {
    // Read-only: never sync due/start or mutate plugin data here.
    // Badge polls run often; writes re-trigger capabilities and cause REST thrash.
    var results = await Promise.all([
      getCardInputs(t),
      getCardDueComplete(t),
      t.get('board', 'shared', COLOR_SCHEME_REV_KEY).catch(function () { return null; }),
    ]);
    var completed = results[1] === true;
    var inputs = results[0];
    if (completed && inputs && inputs.enAttente) {
      inputs = clearBlockedFromInputs(inputs);
    }
    var display = null;
    if (inputs) {
      var settings = await ensureBoardPriorityContext(t);
      display = computeDisplay(inputs, settings);
    }
    return { display: display, completed: completed };
  }

  function withBadgeRefresh(badge) {
    if (!badge) return { refresh: BADGE_REFRESH_SEC };
    return Object.assign({ refresh: BADGE_REFRESH_SEC }, badge);
  }

  async function getFaceProgress(t) {
    var CT = global.CompletionTrello;
    if (!CT || typeof CT.getCardCompletion !== 'function') return null;
    try {
      var data = await CT.getCardCompletion(t);
      if (data && data.progressEnabled === false) return null;
      var progress =
        typeof CT.computeCardProgress === 'function' ? CT.computeCardProgress(data) : null;
      if (!progress || !(progress.percent > 0)) return null;
      return progress;
    } catch (err) {
      console.error('Priority face progress load failed', err);
      return null;
    }
  }

  /**
   * Snapshot for Résumé / card-back compact overview (title, progress, due, priority).
   */
  async function getCardOverviewSnapshot(t) {
    var empty = {
      title: '',
      status: '',
      statusCategory: '',
      statusColor: '',
      progressPercent: null,
      progressColor: '',
      progressBlocked: false,
      dueCountdown: '',
      dueBand: '',
      dueDays: null,
      priorityLabel: '',
      priorityColor: '',
      summaryText: '',
      blockedReasons: [],
      tasks: [],
      tasksDone: 0,
      tasksTotal: 0,
      features: {
        statut: true,
        progress: true,
        due: true,
        priority: true
      }
    };
    if (!t) return empty;

    var badgePromise = getBadgeData(t).catch(function () {
      return { display: null, completed: false };
    });
    var namePromise =
      typeof getCardName === 'function'
        ? getCardName(t).catch(function () {
            return '';
          })
        : Promise.resolve('');
    var completionPromise = (function () {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.getCardCompletion !== 'function') {
        return Promise.resolve(null);
      }
      return CT.getCardCompletion(t).catch(function () {
        return null;
      });
    })();
    var statutPromise = (function () {
      var ST = global.StatutTrello;
      if (!ST || typeof ST.getCardStatut !== 'function') {
        return Promise.resolve(null);
      }
      return ST.getCardStatut(t).catch(function () {
        return null;
      });
    })();
    var profilePromise = (function () {
      var UP = global.UserProfile;
      if (!UP || typeof UP.load !== 'function') return Promise.resolve(null);
      return UP.load(t).catch(function () {
        return null;
      });
    })();

    var results = await Promise.all([
      badgePromise,
      namePromise,
      completionPromise,
      statutPromise,
      profilePromise
    ]);
    var badge = results[0] || {};
    var title = typeof results[1] === 'string' ? results[1] : '';
    var completion = results[2];
    var statut = results[3];
    var profile = results[4];
    var display = badge.display || null;
    var completed = !!badge.completed;

    var features = {
      statut: true,
      progress: true,
      due: true,
      priority: true
    };
    var UP = global.UserProfile;
    if (profile && UP && typeof UP.isFeatureEnabled === 'function') {
      features.statut = UP.isFeatureEnabled(profile, 'statut') !== false;
      features.progress = UP.isFeatureEnabled(profile, 'progress') !== false;
      features.due = UP.isFeatureEnabled(profile, 'due') !== false;
      features.priority = UP.isFeatureEnabled(profile, 'priority') !== false;
    }

    var progressPercent = null;
    var progressColor = '';
    var progressBlocked = false;
    var CT = global.CompletionTrello;
    if (completion && CT && typeof CT.computeCardProgress === 'function') {
      if (completion.progressEnabled !== false) {
        var progressMeta = CT.computeCardProgress(completion);
        if (progressMeta && (progressMeta.hasItems || progressMeta.percent != null)) {
          progressPercent =
            progressMeta.percent != null ? progressMeta.percent : 0;
        }
      }
    }
    var statusCategory =
      statut && typeof statut.category === 'string' ? statut.category : '';
    var statusLabel =
      statut && typeof statut.listName === 'string' ? statut.listName : '';
    var statusColor = '';
    if (
      global.StatutMatch &&
      typeof global.StatutMatch.categoryStyle === 'function'
    ) {
      var stStyle = global.StatutMatch.categoryStyle(statusCategory || '_none');
      statusColor = (stStyle && stStyle.color) || '';
    } else {
      var PU = priorityUI();
      if (PU && typeof PU.statutCategoryStyle === 'function') {
        var puStyle = PU.statutCategoryStyle(statusCategory || '_none');
        statusColor = (puStyle && puStyle.color) || '';
      }
    }

    var fullyComplete =
      completed ||
      statusCategory === 'completed' ||
      (CT &&
        typeof CT.isAllSubtasksComplete === 'function' &&
        completion &&
        CT.isAllSubtasksComplete(completion)) ||
      (progressPercent != null && progressPercent >= 100);
    if (fullyComplete) {
      progressPercent = 100;
      progressBlocked = false;
      if (!statusCategory) statusCategory = 'completed';
    } else if (
      CT &&
      typeof CT.hasAnyBlocked === 'function' &&
      completion
    ) {
      progressBlocked = !!CT.hasAnyBlocked(completion);
    }
    if (display && display.blocked) progressBlocked = true;

    var PU2 = priorityUI();
    if (progressBlocked && PU2 && PU2.BLOCKED_STYLES && PU2.BLOCKED_STYLES.seg) {
      progressColor = PU2.BLOCKED_STYLES.seg;
    } else if (
      progressPercent != null &&
      global.CompletionUI &&
      typeof global.CompletionUI.completionColorForProgress === 'function'
    ) {
      progressColor = global.CompletionUI.completionColorForProgress(
        progressPercent
      );
    } else if (progressPercent != null) {
      if (progressPercent >= 100) progressColor = '#22a06b';
      else if (progressPercent >= 50) progressColor = '#0c66e4';
      else progressColor = '#579dff';
    }

    var priorityLabel = '';
    var priorityColor = '';
    if (display && display.priorityEnabled !== false) {
      priorityLabel = display.label || '';
      priorityColor = display.seg || display.fill || '';
    }

    var dueCountdown = '';
    var dueBand = '';
    var dueDays = null;
    if (display && display.dueCountdown) {
      dueCountdown = display.dueCountdown;
    }
    if (PU2 && display) {
      var dueVague =
        display.dueMode === 'vague' ||
        (typeof PU2.isDueVagueMode === 'function' &&
          PU2.isDueVagueMode(display));
      if (dueVague) {
        dueBand = 'far';
        dueDays = null;
      } else if (display.dueDate) {
        if (typeof PU2.dueProximityBand === 'function') {
          dueBand =
            PU2.dueProximityBand(display.dueDate, display.dueTime) || '';
        }
        if (typeof PU2.daysUntilDue === 'function') {
          var days = PU2.daysUntilDue(display.dueDate);
          if (isFinite(days)) dueDays = days;
        }
      }
    }

    var priorityReasons = [];
    var priorityLinks = [];
    if (display) {
      if (Array.isArray(display.blockedReasons)) {
        priorityReasons = display.blockedReasons.slice();
      } else if (
        typeof display.blockedReason === 'string' &&
        display.blockedReason.trim()
      ) {
        priorityReasons = [display.blockedReason.trim()];
      }
      if (Array.isArray(display.blockedLinks)) {
        priorityLinks = display.blockedLinks.slice();
      } else if (display.blockedLink) {
        priorityLinks = [display.blockedLink];
      }
    }

    var enrichment = {
      summaryText: '',
      blockedReasons: [],
      tasks: [],
      tasksDone: 0,
      tasksTotal: 0
    };
    if (PU2 && typeof PU2.buildOverviewEnrichment === 'function') {
      enrichment = PU2.buildOverviewEnrichment(completion || { items: [] }, {
        progressPercent: progressPercent,
        progressBlocked: progressBlocked,
        statusCategory: statusCategory,
        blockedReasons: priorityReasons,
        links: priorityLinks,
        items: completion && completion.items ? completion.items : []
      });
    }

    return {
      title: title || '',
      status: statusLabel,
      statusCategory: statusCategory,
      statusColor: statusColor,
      progressPercent: progressPercent,
      progressColor: progressColor,
      progressBlocked: progressBlocked,
      dueCountdown: dueCountdown,
      dueBand: dueBand,
      dueDays: dueDays,
      priorityLabel: priorityLabel,
      priorityColor: priorityColor,
      summaryText: enrichment.summaryText || '',
      blockedReasons: enrichment.blockedReasons || [],
      tasks: enrichment.tasks || [],
      tasksDone: enrichment.tasksDone != null ? enrichment.tasksDone : 0,
      tasksTotal: enrichment.tasksTotal != null ? enrichment.tasksTotal : 0,
      features: features
    };
  }

  function hasPriorityFaceContent(display) {
    if (!display) return false;
    if (display.priorityEnabled === false && !display.blocked && !display.dueCountdown) {
      return false;
    }
    if (
      display.priorityEnabled === false &&
      !display.blocked &&
      !formatBadgeText(display, false)
    ) {
      return false;
    }
    return !!formatBadgeText(display, false);
  }

  function dynamicCardFaceBadge(t) {
    return {
      dynamic: function () {
        return Promise.all([getBadgeData(t), getFaceProgress(t)]).then(function (pair) {
          var data = pair[0];
          var progress = pair[1];
          if (!data.display && !progress) return { refresh: BADGE_REFRESH_SEC };
          var badge = buildCardFaceBadge(data.display, data.completed, progress);
          if (!badge || !badge.text) return { refresh: BADGE_REFRESH_SEC };
          return withBadgeRefresh(badge);
        });
      },
    };
  }

  function cardFaceBadges(t) {
    return Promise.all([
      getCardDisplay(t).catch(function () {
        return null;
      }),
      getFaceProgress(t),
    ])
      .then(function (pair) {
        var display = pair[0];
        var progress = pair[1];
        if (!hasPriorityFaceContent(display) && !progress) return [];
        return [dynamicCardFaceBadge(t)];
      })
      .catch(function (err) {
        console.error('Priority card-badges failed', err);
        return [];
      });
  }

  function cardDetailBadges(t, openCallback) {
    return [{
      dynamic: function () {
        return getBadgeData(t)
          .then(function (data) {
            if (
              !data.display ||
              (
                data.display.priorityEnabled === false &&
                !data.display.blocked &&
                !data.display.dueCountdown
              )
            ) {
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: definePriorityLabel(),
                color: trelloBadgeComplete(),
                callback: openCallback,
              });
            }
            var badge = buildCardFaceBadge(data.display, data.completed);
            if (!badge || !badge.text) {
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: definePriorityLabel(),
                color: trelloBadgeComplete(),
                callback: openCallback,
              });
            }
            return withBadgeRefresh({
              title: CARD_DETAIL_BADGE_TITLE,
              text: badge.text,
              color: badge.color,
              callback: openCallback,
            });
          })
          .catch(function (err) {
            console.error('Priority card-detail-badges dynamic failed', err);
            return withBadgeRefresh({
              title: CARD_DETAIL_BADGE_TITLE,
              text: definePriorityLabel(),
              color: trelloBadgeComplete(),
              callback: openCallback,
            });
          });
      },
    }];
  }

  // Resolve a connector-relative path to an absolute URL for t.modal / t.popup.
  // Do not pre-sign — Trello signs modal/popup iframe URLs once. t.signUrl() here
  // double-signs and triggers "url that already has a hash" warnings.
  function pageUrl(relativePath) {
    var path = relativePath || '';
    if (
      typeof global.TrelloPowerUp !== 'undefined' &&
      global.TrelloPowerUp.util &&
      typeof global.TrelloPowerUp.util.relativeUrl === 'function'
    ) {
      return global.TrelloPowerUp.util.relativeUrl(path);
    }
    try {
      return new URL(path, global.location.href).href.split('#')[0];
    } catch (err) {
      return path;
    }
  }

  function whenDomReady() {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined' || document.readyState !== 'loading') {
        resolve();
        return;
      }
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function restClientOptions() {
    var cfg = global.PriorityRestConfig;
    if (!cfg || !cfg.appKey) return null;
    var opts = {
      appKey: cfg.appKey,
      appName: brandAppName(),
    };
    if (cfg.appAuthor) opts.appAuthor = cfg.appAuthor;
    else if (global.PriorityBrand && global.PriorityBrand.appAuthor) {
      opts.appAuthor = global.PriorityBrand.appAuthor;
    }
    return opts;
  }

  // Options for TrelloPowerUp.iframe(). Opt out of ADS tokens: the SDK's
  // theme path checks platform-dst-motion-theme-default before FeatureGates
  // is ready and logs a console error. We apply data-color-mode ourselves.
  function iframeClientOptions() {
    var opts = { useADSTokens: false };
    var restOpts = restClientOptions();
    if (!restOpts) return opts;
    opts.appKey = restOpts.appKey;
    opts.appName = restOpts.appName;
    if (restOpts.appAuthor) opts.appAuthor = restOpts.appAuthor;
    return opts;
  }

  // Read by the inline boot in each view page (before stylesheets) so a tab change
  // paints dark immediately instead of the light default.
  var COLOR_MODE_STORAGE_KEY = 'trello-priority-powerup/color-mode';

  function applyColorMode(theme) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    if (theme !== 'light' && theme !== 'dark') return;
    var root = document.documentElement;
    root.setAttribute('data-color-mode', theme);
    try {
      if (root.style) {
        root.style.colorScheme = theme;
        root.style.backgroundColor = theme === 'dark' ? '#1d2125' : '';
      }
    } catch (err) {
      /* style optional */
    }
    try {
      if (global.localStorage) global.localStorage.setItem(COLOR_MODE_STORAGE_KEY, theme);
    } catch (err) {
      /* storage unavailable */
    }
  }

  /** True when this iframe is hosted in a Trello fullscreen modal (sizeTo is a no-op / warns). */
  function isFullscreenModal(t) {
    if (!t || typeof t.getContext !== 'function') return false;
    try {
      var ctx = t.getContext();
      if (!ctx) return false;
      if (ctx.fullscreen === true) return true;
      if (ctx.modal && ctx.modal.fullscreen === true) return true;
    } catch (err) {
      /* context optional during early init */
    }
    return false;
  }

  /**
   * True when this page is a nested Power-Up iframe (e.g. Task overlay inside
   * fullscreen Gantt). getContext() often omits fullscreen there, but t.sizeTo
   * still hits the parent modal and Trello warns.
   */
  function isNestedPowerUpIframe() {
    try {
      if (typeof global === 'undefined' || !global.parent || !global.top) {
        return false;
      }
      return global.parent !== global.top;
    } catch (err) {
      return true;
    }
  }

  /** Skip sizeTo for fullscreen hosts and nested iframes (Gantt Task overlay). */
  function shouldSkipSizeTo(t) {
    if (isFullscreenModal(t)) return true;
    if (isNestedPowerUpIframe()) return true;
    return false;
  }

  // exports
  S.BOARD_LABEL_COLORS = BOARD_LABEL_COLORS;
  S.COLOR_MODE_STORAGE_KEY = COLOR_MODE_STORAGE_KEY;
  S.addCardLabel = addCardLabel;
  S.addCardMember = addCardMember;
  S.applyColorMode = applyColorMode;
  S.applyDuePartsToInputs = applyDuePartsToInputs;
  S.applyStartToInputs = applyStartToInputs;
  S.canonicalizeDueIso = canonicalizeDueIso;
  S.cardDetailBadges = cardDetailBadges;
  S.cardFaceBadges = cardFaceBadges;
  S.cardPluginScope = cardPluginScope;
  S.createBoardLabel = createBoardLabel;
  S.deleteBoardLabel = deleteBoardLabel;
  S.dynamicCardFaceBadge = dynamicCardFaceBadge;
  S.getBadgeData = getBadgeData;
  S.getCardDue = getCardDue;
  S.getCardDueComplete = getCardDueComplete;
  S.getCardDueSyncedIso = getCardDueSyncedIso;
  S.getCardOverviewSnapshot = getCardOverviewSnapshot;
  S.getCardStart = getCardStart;
  S.getCardStartSyncedIso = getCardStartSyncedIso;
  S.getFaceProgress = getFaceProgress;
  S.hasPriorityFaceContent = hasPriorityFaceContent;
  S.iframeClientOptions = iframeClientOptions;
  S.inputsToCanonicalDueIso = inputsToCanonicalDueIso;
  S.inputsToCanonicalStartIso = inputsToCanonicalStartIso;
  S.isFullscreenModal = isFullscreenModal;
  S.isNestedPowerUpIframe = isNestedPowerUpIframe;
  S.normalizeBoardLabelColor = normalizeBoardLabelColor;
  S.pageUrl = pageUrl;
  S.parseCardDueValue = parseCardDueValue;
  S.parseCardStartValue = parseCardStartValue;
  S.pickUnusedLabelColor = pickUnusedLabelColor;
  S.readPowerUpArg = readPowerUpArg;
  S.removeCardLabel = removeCardLabel;
  S.removeCardMember = removeCardMember;
  S.resolveCurrentBoardId = resolveCurrentBoardId;
  S.resolveCurrentCardId = resolveCurrentCardId;
  S.restClientOptions = restClientOptions;
  S.setCardDesc = setCardDesc;
  S.setCardDue = setCardDue;
  S.setCardDueSyncedIso = setCardDueSyncedIso;
  S.setCardName = setCardName;
  S.setCardStart = setCardStart;
  S.setCardStartSyncedIso = setCardStartSyncedIso;
  S.shouldSkipSizeTo = shouldSkipSizeTo;
  S.syncCardDueWithTrello = syncCardDueWithTrello;
  S.syncCardStartWithTrello = syncCardStartWithTrello;
  S.updateBoardLabel = updateBoardLabel;
  S.whenDomReady = whenDomReady;
  S.withBadgeRefresh = withBadgeRefresh;
})(typeof window !== 'undefined' ? window : this);
