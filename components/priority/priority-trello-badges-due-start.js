/**
 * priority-trello-badges-due: part 2 of 2 (parseCardStartValue).
 * Names are shared with the other parts through window.PriorityTrelloParts (see priority-trello-badges-due.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityTrelloParts = global.PriorityTrelloParts || {});

  // from earlier parts (values)
  var BADGE_REFRESH_SEC = S.BADGE_REFRESH_SEC;
  var CARD_DETAIL_BADGE_TITLE = S.CARD_DETAIL_BADGE_TITLE;
  var CARD_PRIORITY_KEY = S.CARD_PRIORITY_KEY;
  var CARD_START_SYNCED_KEY = S.CARD_START_SYNCED_KEY;
  var COLOR_SCHEME_REV_KEY = S.COLOR_SCHEME_REV_KEY;
  var DEFAULT_INPUTS = S.DEFAULT_INPUTS;

  // from other parts (functions, resolved at call time)
  function canonicalizeDueIso() { return S.canonicalizeDueIso.apply(this, arguments); }
  function cardPluginScope() { return S.cardPluginScope.apply(this, arguments); }
  function getCardDueComplete() { return S.getCardDueComplete.apply(this, arguments); }
  function resolveCurrentCardId() { return S.resolveCurrentCardId.apply(this, arguments); }
  function brandAppName() { return S.brandAppName.apply(this, arguments); }
  function buildCardFaceBadge() { return S.buildCardFaceBadge.apply(this, arguments); }
  function cardFieldPromise() { return S.cardFieldPromise.apply(this, arguments); }
  function clearBlockedFromInputs() { return S.clearBlockedFromInputs.apply(this, arguments); }
  function computeDisplay() { return S.computeDisplay.apply(this, arguments); }
  function definePriorityLabel() { return S.definePriorityLabel.apply(this, arguments); }
  function ensureBoardPriorityContext() { return S.ensureBoardPriorityContext.apply(this, arguments); }
  function formatBadgeText() { return S.formatBadgeText.apply(this, arguments); }
  function getCardDisplay() { return S.getCardDisplay.apply(this, arguments); }
  function getCardInputs() { return S.getCardInputs.apply(this, arguments); }
  function getCardName() { return S.getCardName.apply(this, arguments); }
  function isPowerUpRequestChain() { return S.isPowerUpRequestChain.apply(this, arguments); }
  function normalizeInputs() { return S.normalizeInputs.apply(this, arguments); }
  function priorityUI() { return S.priorityUI.apply(this, arguments); }
  function restPutCard() { return S.restPutCard.apply(this, arguments); }
  function trelloBadgeComplete() { return S.trelloBadgeComplete.apply(this, arguments); }

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
  S.COLOR_MODE_STORAGE_KEY = COLOR_MODE_STORAGE_KEY;
  S.applyColorMode = applyColorMode;
  S.applyStartToInputs = applyStartToInputs;
  S.cardDetailBadges = cardDetailBadges;
  S.cardFaceBadges = cardFaceBadges;
  S.dynamicCardFaceBadge = dynamicCardFaceBadge;
  S.getBadgeData = getBadgeData;
  S.getCardOverviewSnapshot = getCardOverviewSnapshot;
  S.getCardStart = getCardStart;
  S.getCardStartSyncedIso = getCardStartSyncedIso;
  S.getFaceProgress = getFaceProgress;
  S.hasPriorityFaceContent = hasPriorityFaceContent;
  S.iframeClientOptions = iframeClientOptions;
  S.inputsToCanonicalStartIso = inputsToCanonicalStartIso;
  S.isFullscreenModal = isFullscreenModal;
  S.isNestedPowerUpIframe = isNestedPowerUpIframe;
  S.pageUrl = pageUrl;
  S.parseCardStartValue = parseCardStartValue;
  S.restClientOptions = restClientOptions;
  S.setCardStart = setCardStart;
  S.setCardStartSyncedIso = setCardStartSyncedIso;
  S.shouldSkipSizeTo = shouldSkipSizeTo;
  S.syncCardStartWithTrello = syncCardStartWithTrello;
  S.whenDomReady = whenDomReady;
  S.withBadgeRefresh = withBadgeRefresh;
})(typeof window !== 'undefined' ? window : this);
