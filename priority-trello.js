/* Trello Power-Up bridge — card priority storage and badges. */
(function (global) {
  'use strict';

  var CARD_PRIORITY_KEY = 'cardPriority';
  var LEGACY_PRIORITY_KEY = 'priority';
  var MATRIX_SETTINGS_KEY = 'matrixLabelSettings';
  var BLOCKED_COVER_SNAPSHOT_KEY = 'blockedCoverSnapshot';
  var PRIORITY_COVER_SNAPSHOT_KEY = 'priorityCoverSnapshot';
  var BLOCKED_COVER_COLOR = 'red';
  // Trello minimum for dynamic badge polling (card-badges / card-detail-badges).
  var BADGE_REFRESH_SEC = 10;

  function importantInputs() {
    var segments = typeof PriorityUI !== 'undefined' && PriorityUI.HEAT_SEGMENTS;
    if (segments) {
      for (var i = 0; i < segments.length; i++) {
        if (segments[i].label === 'Important' && segments[i].preset) {
          return Object.assign({}, segments[i].preset);
        }
      }
    }
    return { urgency: 2, impact: 2, ease: 3 };
  }

  var IMPORTANT_INPUTS = importantInputs();
  var DEFAULT_INPUTS = IMPORTANT_INPUTS;

  var LEGACY_ID_TO_INPUTS = {
    1: { urgency: 4, impact: 4, ease: 5 },
    2: { urgency: 3, impact: 3, ease: 2 },
    3: { urgency: 2, impact: 2, ease: 3 },
    4: { urgency: 1, impact: 1, ease: 2 },
    5: { urgency: 0, impact: 0, ease: 2 },
  };

  var PRIORITY_DIMENSIONS = [
    {
      key: 'urgency',
      label: 'Urgence',
      icon: 'ti-flame',
      wordsKey: 'urgency',
      min: 0,
      max: 4,
      value: 2,
    },
    {
      key: 'impact',
      label: 'Impact',
      icon: 'ti-target-arrow',
      wordsKey: 'impact',
      min: 0,
      max: 4,
      value: 2,
    },
    {
      key: 'ease',
      label: 'Effort',
      icon: 'ti-gauge',
      wordsKey: 'ease',
      min: 1,
      max: 5,
      value: 3,
    },
  ];

  function asNumber(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value !== '') {
      var parsed = Number(value);
      if (isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  function normalizeInputs(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var urgency = asNumber(raw.urgency);
    var impact = asNumber(raw.impact);
    var ease = asNumber(raw.ease);
    if (!isFinite(urgency) || !isFinite(impact) || !isFinite(ease)) return null;
    var normalized = {
      urgency: Math.max(0, Math.min(4, urgency)),
      impact: Math.max(0, Math.min(4, impact)),
      ease: Math.max(1, Math.min(5, ease)),
    };
    if (raw.enAttente === true) {
      normalized.enAttente = true;
      var reason = typeof raw.blockedReason === 'string' ? raw.blockedReason.trim() : '';
      if (
        reason &&
        typeof PriorityUI !== 'undefined' &&
        PriorityUI.isValidBlockedReason &&
        PriorityUI.isValidBlockedReason(reason)
      ) {
        normalized.blockedReason = reason;
      }
    }
    return normalized;
  }

  async function getCardInputs(t) {
    var stored = await t.get('card', 'shared', CARD_PRIORITY_KEY);
    var normalized = normalizeInputs(stored);
    if (normalized) return normalized;

    var legacyId = await t.get('card', 'shared', LEGACY_PRIORITY_KEY);
    if (legacyId != null && legacyId !== '') {
      var mapped = LEGACY_ID_TO_INPUTS[+legacyId];
      if (mapped) return Object.assign({}, mapped);
    }
    return null;
  }

  async function getMatrixSettings(t) {
    var stored = await t.get('board', 'shared', MATRIX_SETTINGS_KEY);
    if (typeof PriorityMatrix !== 'undefined' && PriorityMatrix.normalizeSettings) {
      return PriorityMatrix.normalizeSettings(stored);
    }
    if (stored && typeof stored === 'object') return stored;
    return { enabled: true, overrides: {} };
  }

  function computeDisplay(inputs, labelSettings) {
    try {
      var result = PriorityUI.calc.baseline(inputs);
      return PriorityUI.resolveDisplay(result, inputs, labelSettings);
    } catch (err) {
      console.error('PriorityTrello.computeDisplay failed', err);
      return null;
    }
  }

  async function getCardDisplay(t) {
    var inputs = await getCardInputs(t);
    if (!inputs) return null;
    var settings = await getMatrixSettings(t);
    PriorityUI.setMatrixSettings(settings);
    return computeDisplay(inputs, settings);
  }

  // Tier-indexed badge dots (largest = highest priority). Unicode only — Trello badge text.
  var BADGE_DOTS_BY_TIER = {
    0: '\u2B24', // ⬤ Critique
    1: '\u2B24', // ⬤ Urgent (largest)
    2: '\u25CF', // ● Prioritaire
    3: '\u2022', // • Important (middle)
    4: '\u00B7', // · Flexible
    5: '\u00B7', // · Secondaire
    6: '\u00B7', // · Optionnel
  };
  var BADGE_DOT_INUTILE = '\u00B7'; // · inutile
  var BADGE_DOT_BLOCKED = '\u2298'; // ⊘ blocked / en attente
  var BADGE_DOT_COMPLETE = '\u2713'; // ✓ card marked complete in Trello

  function tierBadgeDot(display, completed) {
    if (completed) return BADGE_DOT_COMPLETE;
    if (!display) return '\u25CF';
    if (display.blocked) return BADGE_DOT_BLOCKED;
    if (display.inutile) return BADGE_DOT_INUTILE;
    var i = display.tierI;
    if (i != null && Object.prototype.hasOwnProperty.call(BADGE_DOTS_BY_TIER, i)) {
      return BADGE_DOTS_BY_TIER[i];
    }
    return '\u25CF';
  }

  function formatBadgeText(display, completed) {
    if (!display) return '';
    if (display.blocked) {
      var blockedText = (typeof PriorityUI !== 'undefined' && PriorityUI.formatBlockedBadgeText)
        ? PriorityUI.formatBlockedBadgeText(display.blockedReason || '')
        : BADGE_DOT_BLOCKED + ' Bloqu\u00e9';
      if (completed) {
        return BADGE_DOT_COMPLETE + blockedText.slice(BADGE_DOT_BLOCKED.length);
      }
      return blockedText;
    }
    var label = (typeof PriorityUI !== 'undefined' && PriorityUI.classicTierLabel)
      ? PriorityUI.classicTierLabel(display)
      : (display.tierLabel || display.label);
    return tierBadgeDot(display, completed) + ' ' + label;
  }

  function tierDetailBadgeColor(display) {
    if (!display) return 'light-gray';
    // Trello card badges only accept named colors (red, orange, …), not hex.
    if (display.blocked) return 'red';
    if (display.inutile) return 'light-gray';
    var i = display.tierI;
    if (i === 0) return 'red';
    if (i === 1 || i === 2) return 'orange';
    if (i === 3) return 'green';
    if (i === 4) return 'sky';
    if (i === 5) return 'blue';
    return 'light-gray';
  }

  // Trello card cover colors (PUT /cards/{id}/cover value.color).
  function tierCoverColor(display) {
    if (!display) return null;
    if (display.blocked) return BLOCKED_COVER_COLOR;
    if (display.inutile) return null;
    var i = display.tierI;
    if (i === 0) return 'red';
    if (i === 1 || i === 2) return 'orange';
    if (i === 3) return 'green';
    if (i === 4) return 'sky';
    if (i === 5) return 'blue';
    if (i === 6) return 'black';
    return null;
  }

  function buildCardFaceBadge(display, completed) {
    if (!display) return null;
    return {
      text: formatBadgeText(display, completed),
      color: tierDetailBadgeColor(display),
    };
  }

  async function getCardDueComplete(t) {
    try {
      return await t.card('dueComplete');
    } catch (err) {
      console.error('Priority card dueComplete failed', err);
      return false;
    }
  }

  async function getBadgeData(t) {
    var results = await Promise.all([getCardDisplay(t), getCardDueComplete(t)]);
    return { display: results[0], completed: !!results[1] };
  }

  function withBadgeRefresh(badge) {
    if (!badge) return { refresh: BADGE_REFRESH_SEC };
    return Object.assign({ refresh: BADGE_REFRESH_SEC }, badge);
  }

  function dynamicCardFaceBadge(t) {
    return {
      dynamic: function () {
        return getBadgeData(t).then(function (data) {
          if (!data.display) return { refresh: BADGE_REFRESH_SEC };
          return withBadgeRefresh(buildCardFaceBadge(data.display, data.completed));
        });
      },
    };
  }

  function cardFaceBadges(t) {
    return getCardDisplay(t)
      .then(function (display) {
        if (!display) return [];
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
            if (!data.display) {
              return withBadgeRefresh({
                text: 'Définir la priorité',
                color: 'green',
                callback: openCallback,
              });
            }
            var badge = buildCardFaceBadge(data.display, data.completed);
            return withBadgeRefresh({
              text: badge.text,
              color: badge.color,
              callback: openCallback,
            });
          })
          .catch(function (err) {
            console.error('Priority card-detail-badges dynamic failed', err);
            return withBadgeRefresh({
              text: 'Définir la priorité',
              color: 'green',
              callback: openCallback,
            });
          });
      },
    }];
  }

  function trelloApiConfig() {
    return typeof global.TrelloApiConfig !== 'undefined' ? global.TrelloApiConfig : null;
  }

  function isTrelloApiConfigured() {
    var config = trelloApiConfig();
    if (!config || typeof config.appKey !== 'string') return false;
    var key = config.appKey.trim();
    return key.length > 0 && key !== 'YOUR_TRELLO_APP_KEY';
  }

  function getIframeInitOptions() {
    if (!isTrelloApiConfigured()) return undefined;
    var config = trelloApiConfig();
    return {
      appKey: config.appKey.trim(),
      appName: config.appName || 'Trello Priority Powerup',
    };
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

  // OAuth return_url must match an API-key allowed origin (trello.com/power-ups/admin → API Key).
  // Use the connector page — not popup.html — so Trello signing hashes on modal URLs are avoided.
  function oauthReturnUrl() {
    return pageUrl('./index.html');
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

  function createIframeClient() {
    if (typeof global.TrelloPowerUp === 'undefined') {
      throw new Error('TrelloPowerUp is not loaded');
    }
    var opts = getIframeInitOptions();
    return opts ? global.TrelloPowerUp.iframe(opts) : global.TrelloPowerUp.iframe();
  }

  // Call after DOM is ready so TrelloPowerUp.iframe() theme init finds document.body.
  function createIframeClientDeferred() {
    return whenDomReady().then(function () {
      return createIframeClient();
    });
  }

  // Defer t.get/set/getRestApi until Trello finishes the iframe handshake.
  // Residual feature-gate noise in power-up.min.js is Trello-internal (see README).
  function runWhenIframeReady(t, fn) {
    var started = false;
    return new Promise(function (resolve, reject) {
      if (!t || typeof t.render !== 'function') {
        Promise.resolve().then(fn).then(resolve, reject);
        return;
      }
      t.render(function () {
        if (started) return;
        started = true;
        Promise.resolve().then(fn).then(resolve, reject);
      });
    });
  }

  function coverSyncError(message, detail) {
    if (detail !== undefined) {
      console.error('Priority card cover: ' + message, detail);
    } else {
      console.error('Priority card cover: ' + message);
    }
  }

  function canWriteCard(t) {
    return typeof t.memberCanWriteToModel === 'function' && t.memberCanWriteToModel('card');
  }

  function serializeCover(cover) {
    if (!cover || typeof cover !== 'object') {
      return {
        color: null,
        idAttachment: null,
        idUploadedBackground: null,
        size: 'normal',
        brightness: 'light',
      };
    }
    return {
      color: cover.color || null,
      idAttachment: cover.idAttachment || null,
      idUploadedBackground: typeof cover.idUploadedBackground === 'string'
        ? cover.idUploadedBackground
        : null,
      size: cover.size || 'normal',
      brightness: cover.brightness || 'light',
    };
  }

  function coverHasImage(cover) {
    if (!cover || typeof cover !== 'object') return false;
    if (cover.idAttachment) return true;
    return typeof cover.idUploadedBackground === 'string' && cover.idUploadedBackground.length > 0;
  }

  function buildColorCover(currentCover, color) {
    var base = serializeCover(currentCover);
    return {
      color: color,
      idAttachment: null,
      idUploadedBackground: null,
      size: base.size,
      brightness: base.brightness,
    };
  }

  async function ensurePriorityCoverSnapshot(t) {
    var snapshot = await t.get('card', 'shared', PRIORITY_COVER_SNAPSHOT_KEY);
    if (!snapshot) {
      var currentCover = await t.card('cover');
      await t.set('card', 'shared', PRIORITY_COVER_SNAPSHOT_KEY, serializeCover(currentCover));
    }
  }

  async function ensureBlockedCoverSnapshot(t) {
    var snapshot = await t.get('card', 'shared', BLOCKED_COVER_SNAPSHOT_KEY);
    if (!snapshot) {
      var currentCover = await t.card('cover');
      await t.set('card', 'shared', BLOCKED_COVER_SNAPSHOT_KEY, serializeCover(currentCover));
    }
  }

  async function getAuthorizedRestClient(t) {
    if (!isTrelloApiConfigured()) return null;
    try {
      var client = await t.getRestApi();
      if (!(await client.isAuthorized())) return null;
      return client;
    } catch (err) {
      coverSyncError('REST client unavailable', err);
      return null;
    }
  }

  async function ensureRestApiAuthorized(t) {
    if (!isTrelloApiConfigured()) {
      coverSyncError(
        'Trello API key missing — copy trello-api-config-template.js to trello-api-config.js and set appKey (trello.com/power-ups/admin → API Key)'
      );
      return null;
    }
    try {
      var client = await t.getRestApi();
      if (await client.isAuthorized()) return client;
      var returnUrl = oauthReturnUrl();
      await client.authorize({ scope: 'read,write', return_url: returnUrl });
      if (!(await client.isAuthorized())) {
        coverSyncError('OAuth authorization was not granted');
        return null;
      }
      return client;
    } catch (err) {
      coverSyncError('OAuth authorization failed', err);
      return null;
    }
  }

  async function updateCardCover(client, t, coverValue) {
    var config = trelloApiConfig();
    var token = await client.getToken();
    if (!token) {
      coverSyncError('REST token missing after authorization');
      return false;
    }
    if (!isTrelloApiConfigured()) {
      coverSyncError('Trello API key missing — cannot update card cover');
      return false;
    }

    var ctx = t.getContext();
    var cardId = ctx && ctx.card;
    if (!cardId) {
      coverSyncError('card id missing from Power-Up context');
      return false;
    }

    var url = 'https://api.trello.com/1/cards/' + encodeURIComponent(cardId) + '/cover'
      + '?key=' + encodeURIComponent(config.appKey.trim())
      + '&token=' + encodeURIComponent(token);

    var res = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: coverValue }),
    });
    if (!res.ok) {
      coverSyncError('cover update failed (' + res.status + ')', await res.text());
      return false;
    }
    return true;
  }

  async function applyTierCover(client, t, display) {
    var color = tierCoverColor(display);
    if (!color) return;

    var currentCover = await t.card('cover');
    await ensurePriorityCoverSnapshot(t);
    if (coverHasImage(currentCover)) return;

    await updateCardCover(client, t, buildColorCover(currentCover, color));
  }

  function coverSyncWouldApply(previous, normalized, settings) {
    var display = computeDisplay(normalized, settings);
    var wasBlocked = !!(previous && previous.enAttente);
    var isBlocked = !!normalized.enAttente;
    if (isBlocked || wasBlocked) return true;
    return !!tierCoverColor(display);
  }

  async function syncCardCover(t, previous, normalized, options) {
    options = options || {};
    if (!isTrelloApiConfigured()) {
      coverSyncError(
        'skipped — copy trello-api-config-template.js to trello-api-config.js and set appKey to sync card cover colors on the board'
      );
      return;
    }
    if (!canWriteCard(t)) {
      coverSyncError('skipped — member cannot edit this card');
      return;
    }

    var settings = await getMatrixSettings(t);
    if (!coverSyncWouldApply(previous, normalized, settings)) {
      return;
    }

    var client = await getAuthorizedRestClient(t);
    if (!client && options.promptOAuth) {
      client = await ensureRestApiAuthorized(t);
    }
    if (!client) {
      if (options.promptOAuth) {
        coverSyncError('skipped — Trello REST API not authorized (OAuth required)');
      }
      return;
    }

    PriorityUI.setMatrixSettings(settings);
    var display = computeDisplay(normalized, settings);
    var wasBlocked = !!(previous && previous.enAttente);
    var isBlocked = !!normalized.enAttente;

    if (isBlocked) {
      await ensurePriorityCoverSnapshot(t);
      await ensureBlockedCoverSnapshot(t);
      var coverNow = await t.card('cover');
      await updateCardCover(client, t, buildColorCover(coverNow, BLOCKED_COVER_COLOR));
      return;
    }

    if (wasBlocked) {
      var savedCover = await t.get('card', 'shared', BLOCKED_COVER_SNAPSHOT_KEY);
      if (savedCover) {
        await updateCardCover(client, t, savedCover);
        await t.remove('card', 'shared', BLOCKED_COVER_SNAPSHOT_KEY);
      } else {
        await applyTierCover(client, t, display);
      }
      return;
    }

    await applyTierCover(client, t, display);
  }

  async function restorePriorityCover(t) {
    if (!canWriteCard(t)) return;

    var client = await getAuthorizedRestClient(t);
    if (!client) return;

    var savedCover = await t.get('card', 'shared', PRIORITY_COVER_SNAPSHOT_KEY);
    if (savedCover) {
      await updateCardCover(client, t, savedCover);
      await t.remove('card', 'shared', PRIORITY_COVER_SNAPSHOT_KEY);
    }
    await t.remove('card', 'shared', BLOCKED_COVER_SNAPSHOT_KEY);
  }

  async function saveCardInputs(t, inputs, options) {
    var normalized = normalizeInputs(inputs);
    if (!normalized) return;
    var previous = await getCardInputs(t);
    await t.set('card', 'shared', CARD_PRIORITY_KEY, normalized);
    if (options && options.syncCover === false) return;
    try {
      await syncCardCover(t, previous, normalized, options);
    } catch (err) {
      console.error('Priority card cover sync failed', err);
    }
  }

  global.PriorityTrello = {
    CARD_PRIORITY_KEY: CARD_PRIORITY_KEY,
    MATRIX_SETTINGS_KEY: MATRIX_SETTINGS_KEY,
    IMPORTANT_INPUTS: IMPORTANT_INPUTS,
    DEFAULT_INPUTS: DEFAULT_INPUTS,
    PRIORITY_DIMENSIONS: PRIORITY_DIMENSIONS,
    normalizeInputs: normalizeInputs,
    getCardInputs: getCardInputs,
    getMatrixSettings: getMatrixSettings,
    computeDisplay: computeDisplay,
    getCardDisplay: getCardDisplay,
    getCardDueComplete: getCardDueComplete,
    getBadgeData: getBadgeData,
    formatBadgeText: formatBadgeText,
    tierBadgeDot: tierBadgeDot,
    tierDetailBadgeColor: tierDetailBadgeColor,
    tierCoverColor: tierCoverColor,
    buildCardFaceBadge: buildCardFaceBadge,
    cardFaceBadges: cardFaceBadges,
    cardDetailBadges: cardDetailBadges,
    saveCardInputs: saveCardInputs,
    isTrelloApiConfigured: isTrelloApiConfigured,
    getIframeInitOptions: getIframeInitOptions,
    pageUrl: pageUrl,
    createIframeClient: createIframeClient,
    createIframeClientDeferred: createIframeClientDeferred,
    runWhenIframeReady: runWhenIframeReady,
    getAuthorizedRestClient: getAuthorizedRestClient,
    ensureRestApiAuthorized: ensureRestApiAuthorized,
    oauthReturnUrl: oauthReturnUrl,
    syncCardCover: syncCardCover,
    serializeCover: serializeCover,
    coverHasImage: coverHasImage,
    buildColorCover: buildColorCover,
    restorePriorityCover: restorePriorityCover,
    BLOCKED_COVER_SNAPSHOT_KEY: BLOCKED_COVER_SNAPSHOT_KEY,
    PRIORITY_COVER_SNAPSHOT_KEY: PRIORITY_COVER_SNAPSHOT_KEY,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
    BADGE_DOT_BLOCKED: BADGE_DOT_BLOCKED,
    BADGE_DOT_COMPLETE: BADGE_DOT_COMPLETE,
  };
})(typeof window !== 'undefined' ? window : this);
