/**
 * AI agent: context
 *
 * Part of the agent (see agent.parts.json). buildContext (card and board snapshot) and the system prompt inputs.
 * Shares its top-level names with the other parts through window.PriorityAgentParts
 * (imports below, exports at the end). Load order: see agent.parts.json.
 */

/**
 * agent-context: part 1 of 3 (7. buildContext — card/board snapshot fed to systemPrompt).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-context.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var ASSISTANT_SCOPES = S.ASSISTANT_SCOPES;
  var CHAT_WARMUP_USER_TURNS = S.CHAT_WARMUP_USER_TURNS;
  var EFFECT_IDS = S.EFFECT_IDS;

  // from other parts (functions, resolved at call time)
  function axisWord() { return S.axisWord.apply(this, arguments); }
  function buildEaseExplanation() { return S.buildEaseExplanation.apply(this, arguments); }
  function buildPriorityExplanation() { return S.buildPriorityExplanation.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function clockFromContext() { return S.clockFromContext.apply(this, arguments); }
  function isProjectScope() { return S.isProjectScope.apply(this, arguments); }
  function localClock() { return S.localClock.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeAssistantScope() { return S.normalizeAssistantScope.apply(this, arguments); }

var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});
  var ASSISTANT_SCOPES = S.ASSISTANT_SCOPES;
  var CHAT_WARMUP_USER_TURNS = S.CHAT_WARMUP_USER_TURNS;
  var EFFECT_IDS = S.EFFECT_IDS;
  function axisWord() { return S.axisWord.apply(this, arguments); }
  function buildEaseExplanation() { return S.buildEaseExplanation.apply(this, arguments); }
  function buildPriorityExplanation() { return S.buildPriorityExplanation.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function clockFromContext() { return S.clockFromContext.apply(this, arguments); }
  function isProjectScope() { return S.isProjectScope.apply(this, arguments); }
  function localClock() { return S.localClock.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeAssistantScope() { return S.normalizeAssistantScope.apply(this, arguments); }

  // ── 7. buildContext — card/board snapshot fed to systemPrompt ────────────
  // Bridge is a thin facade from AgentUI / popup over Trello Power-Up APIs.

  // Getters buildContext reads from the page bridge. AgentUI must forward these
  // from mount options or the model sees empty card state (labels, members, …).
  var BUILD_CONTEXT_GETTERS = [
    'getScope',
    'getCardName',
    'getCardDesc',
    'getFormulaKey',
    'getProfile',
    'getPeople',
    'getPlaces',
    'getEntities',
    'getCustomAssigneeCatalog',
    'getPlaceCatalog',
    'getMemory',
    'getCardMemory',
    'getBoardDigest',
    'getStatut',
    'getOwnership',
    'getCardLabels',
    'getBoardMembers',
    'getBoardLabels',
    'getPriorityState',
    'getHistory',
    'getGoals',
    'getCompletion'
  ];

  // App build stamp for "what version is running?" and the release notes from
  // CHANGELOG.md. version.js sets BuildVersion.current once the popup/settings
  // fetch it; otherwise fetch once here.
  var appBuildInfoCache = null;
  var appBuildInfoRequested = false;
  function currentAppBuildInfo() {
    var bv = global.BuildVersion;
    if (bv && bv.current) return { builtAt: bv.current, releases: bv.releases || [] };
    if (appBuildInfoCache) return appBuildInfoCache;
    if (!appBuildInfoRequested && typeof global.fetch === 'function') {
      appBuildInfoRequested = true;
      try {
        global.fetch('./build-info.json', { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (j && j.builtAt) {
              appBuildInfoCache = { builtAt: j.builtAt, releases: Array.isArray(j.releases) ? j.releases : [] };
            }
          })
          .catch(function () { /* ignore */ });
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  /** "il y a 3 jours" style age of the build, for the assistant's answer. */
  function appBuildAgo(iso, nowMs) {
    var then = Date.parse(iso);
    if (isNaN(then)) return '';
    var minutes = Math.floor(((nowMs || Date.now()) - then) / 60000);
    if (minutes < 60) return 'il y a moins d\'une heure';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return 'il y a ' + hours + (hours === 1 ? ' heure' : ' heures');
    var days = Math.floor(hours / 24);
    return 'il y a ' + days + (days === 1 ? ' jour' : ' jours');
  }

  /** Last two releases from CHANGELOG.md, as a short list for the prompt. */
  function recentChangesText(releases) {
    var lines = [];
    (releases || []).slice(0, 2).forEach(function (release) {
      lines.push('- ' + release.date + ' :');
      (release.items || []).slice(0, 8).forEach(function (item) {
        lines.push('  · ' + item);
      });
    });
    return lines.join('\n');
  }

  // exports
  S.BUILD_CONTEXT_GETTERS = BUILD_CONTEXT_GETTERS;
  S.appBuildAgo = appBuildAgo;
  S.appBuildInfoCache = appBuildInfoCache;
  S.appBuildInfoRequested = appBuildInfoRequested;
  S.currentAppBuildInfo = currentAppBuildInfo;
  S.recentChangesText = recentChangesText;
})(typeof window !== 'undefined' ? window : this);
