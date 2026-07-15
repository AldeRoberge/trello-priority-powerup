// Completion progress verification — run: node sandbox/verify-completion.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityTrello: null, CompletionTrello: null, CompletionUI: null };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'priority', 'priority-trello.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'completion', 'completion-ui.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'completion', 'completion-trello.js'), 'utf8'),
  sandbox
);

var CT = sandbox.CompletionTrello;
var CUI = sandbox.CompletionUI;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

if (!CT || !CUI) {
  console.log('FAIL modules failed to load (CT=' + !!CT + ', CUI=' + !!CUI + ')');
  process.exit(1);
}

var PT = sandbox.PriorityTrello;
check('PriorityTrello.setCardDueComplete export', !!(PT && typeof PT.setCardDueComplete === 'function'));
check('PriorityTrello.getCardDueComplete export', !!(PT && typeof PT.getCardDueComplete === 'function'));

[
  'normalizeCompletionData',
  'computeWeightedProgress',
  'computeCardProgress',
  'isAllSubtasksComplete',
  'detectDonePendingMismatch',
  'markFullyComplete',
  'markNotFullyComplete',
  'syncCardDueCompleteFromProgress',
  'applyMasterProgress',
  'clampProgress',
  'itemProgress',
  'syncDoneFromProgress',
  'getCardCompletion',
  'saveCardCompletion',
  'formatFaceBadgeText',
  'formatDetailBadgeText',
  'buildCardFaceBadge',
  'cardFaceBadges',
  'cardDetailBadges',
  'getBoardCompletionColorScheme',
  'saveBoardCompletionColorScheme',
  'preloadBoardCompletionContext',
].forEach(function (name) {
  check('export ' + name, typeof CT[name] === 'function' || (name === 'CARD_COMPLETION_KEY' && CT[name]));
});

check('no difficultyWeight export', typeof CT.difficultyWeight !== 'function');
check('no DIFFICULTY_LEVELS export', !CT.DIFFICULTY_LEVELS);
check('storage key', CT.CARD_COMPLETION_KEY === 'cardCompletion');
check('completion scheme storage key', CT.COMPLETION_COLOR_SCHEME_SETTINGS_KEY === 'completionColorScheme');
check('completion gradient storage key', CT.COMPLETION_COLOR_GRADIENT_SETTINGS_KEY === 'completionColorGradient');
check('default scheme traffic', CUI.DEFAULT_COMPLETION_SCHEME_KEY === 'traffic');
check('custom scheme key', CUI.CUSTOM_COMPLETION_SCHEME_KEY === 'custom');
check('five completion schemes', Object.keys(CUI.COMPLETION_COLOR_SCHEMES).length === 5);
check('progress oklch anchors exported', !!CUI.PROGRESS_OKLCH && !!CUI.PROGRESS_OKLCH.GRAY && !!CUI.PROGRESS_OKLCH.BLUE && !!CUI.PROGRESS_OKLCH.GREEN);
check('mountProgressGradientEditor export', typeof CUI.mountProgressGradientEditor === 'function');
check('normalizeGradientStops export', typeof CUI.normalizeGradientStops === 'function');
check('applyCompletionGradient export', typeof CUI.applyCompletionGradient === 'function');
check('getActiveCompletionGradient export', typeof CUI.getActiveCompletionGradient === 'function');
check(
  'color at 0 differs from 100',
  CUI.colorAtProgress('traffic', 0).toLowerCase() !== CUI.colorAtProgress('traffic', 100).toLowerCase()
);
check(
  'color at 99 differs from 100 (hard complete snap)',
  CUI.colorAtProgress('traffic', 99).toLowerCase() !== CUI.colorAtProgress('traffic', 100).toLowerCase()
);
check(
  'completionColorForProgress snaps hard at 100',
  CUI.completionColorForProgress(99).toLowerCase() !== CUI.completionColorForProgress(100).toLowerCase()
);
check('color at 100 is green badge', CUI.completionTrelloBadgeColor(100) === 'green');
check('color at 0 is light-gray badge', CUI.completionTrelloBadgeColor(0) === 'light-gray');
check(
  'completionColorForProgress returns hex',
  /^#[0-9a-f]{6}$/i.test(CUI.completionColorForProgress(50))
);

// Gray → blue → green ramp (no warm/red start) for Classique
function hexToRgb(hex) {
  var h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
var c0 = hexToRgb(CUI.colorAtProgress('traffic', 0));
var c50 = hexToRgb(CUI.colorAtProgress('traffic', 50));
var c100 = hexToRgb(CUI.colorAtProgress('traffic', 100));
check(
  'ramp 0% is cool gray (not red)',
  c0.r <= c0.g + 12 && c0.b >= c0.r - 8 && (Math.max(c0.r, c0.g, c0.b) - Math.min(c0.r, c0.g, c0.b)) < 80
);
check('ramp 50% leans blue', c50.b > c50.r && c50.b >= c50.g);
check('ramp 100% leans green', c100.g > c100.r && c100.g >= c100.b);
check(
  'scheme gradient includes mid stop',
  (CUI.schemeGradientCss('traffic').match(/#/g) || []).length >= 3
);

var sunset0 = hexToRgb(CUI.colorAtProgress('sunset', 0));
check(
  'horizon preset starts warm (distinct from classique)',
  sunset0.r > sunset0.b && sunset0.r >= sunset0.g - 10
);

var customStops = CUI.normalizeGradientStops([
  { p: 0, color: '#ff0000' },
  { p: 50, color: '#0000ff' },
  { p: 100, color: '#00ff00' },
]);
CUI.applyCompletionGradient(customStops, 'custom');
check('custom gradient apply key', CUI.getActiveCompletionSchemeKey() === 'custom');
check(
  'custom gradient mid is bluish',
  hexToRgb(CUI.completionColorForProgress(50)).b >
    hexToRgb(CUI.completionColorForProgress(50)).r
);
check(
  'custom gradient ends greenish',
  hexToRgb(CUI.completionColorForProgress(100)).g >
    hexToRgb(CUI.completionColorForProgress(100)).r
);
CUI.applyCompletionColorScheme('traffic');
check('restore traffic after custom', CUI.getActiveCompletionSchemeKey() === 'traffic');

check('saveBoardCompletionGradient export', typeof CT.saveBoardCompletionGradient === 'function');
check('getBoardCompletionGradient export', typeof CT.getBoardCompletionGradient === 'function');
check(
  'progress badge preview samples',
  Array.isArray(CUI.progressBadgePreviewSamples()) &&
    CUI.progressBadgePreviewSamples().length === 5
);

// Legacy migration: done boolean → progress; difficulty ignored
var migrated = CT.normalizeItem({ id: 'a', text: 'Done', done: true, difficulty: 0 });
check('migrate done true to progress 100', migrated.progress === 100 && migrated.done === true);
check('normalize strips legacy difficulty', migrated.difficulty === undefined);
var notDone = CT.normalizeItem({ id: 'b', text: 'Open', done: false, difficulty: 4 });
check('migrate done false to progress 0', notDone.progress === 0 && notDone.done === false);
check('normalize ignores hard difficulty', notDone.difficulty === undefined);

var items = [
  { id: 'a', text: 'Easy', done: true, difficulty: 0 },
  { id: 'b', text: 'Hard', done: false, difficulty: 4 },
];
var progress = CT.computeWeightedProgress(items);
check('equal-weight percent 50 (legacy done)', progress.percent === 50);
check('done count 1', progress.doneCount === 1);
check('total count 2', progress.totalCount === 2);
check('done weight 1', progress.doneWeight === 1);
check('total weight 2', progress.totalWeight === 2);

// Partial progress per item (legacy difficulty must not skew)
var partial = CT.computeWeightedProgress([
  { id: 'a', text: 'Half easy', progress: 50, difficulty: 0 },
  { id: 'b', text: 'Full hard', progress: 100, difficulty: 4 },
]);
check('partial equal-weight percent 75', partial.percent === 75);
check('partial done count 1', partial.doneCount === 1);
check('partial done weight 1.5', partial.doneWeight === 1.5);

var mid = CT.computeWeightedProgress([
  { id: 'a', text: 'A', progress: 50, difficulty: 2 },
  { id: 'b', text: 'B', progress: 50, difficulty: 2 },
]);
check('equal partial items 50%', mid.percent === 50);

var allDone = CT.computeWeightedProgress([
  { id: 'a', text: 'A', progress: 100, difficulty: 2 },
  { id: 'b', text: 'B', progress: 100, difficulty: 3 },
]);
check('100 percent when all at 100', allDone.percent === 100);

var empty = CT.computeWeightedProgress([]);
check('empty has no items', empty.hasItems === false && empty.percent === 0);

// Estimate-weighted Progrès
var estimateWeighted = CT.computeWeightedProgress([
  { id: 'a', text: 'Quick', progress: 100, estimatedMinutes: 30 },
  { id: 'b', text: 'Long', progress: 0, estimatedMinutes: 90 },
]);
check(
  'estimate weights progress (30 done of 120 = 25%)',
  estimateWeighted.percent === 25 &&
    estimateWeighted.doneWeight === 30 &&
    estimateWeighted.totalWeight === 120
);
var estimateHalf = CT.computeWeightedProgress([
  { id: 'a', text: 'A', progress: 0, estimatedMinutes: 60 },
  { id: 'b', text: 'B', progress: 50, estimatedMinutes: 120 },
]);
check(
  'estimate weights partial (0*60 + 50*120)/180 = 33%',
  estimateHalf.percent === 33
);
var mixedEstimate = CT.computeWeightedProgress([
  { id: 'a', text: 'Estimated', progress: 100, estimatedMinutes: 120 },
  { id: 'b', text: 'Missing', progress: 0 },
]);
check(
  'missing estimate uses sibling average',
  mixedEstimate.percent === 50 && mixedEstimate.totalWeight === 240
);
var masterEst = CT.applyMasterProgress(
  [
    { id: 'a', text: 'A', progress: 0, estimatedMinutes: 30 },
    { id: 'b', text: 'B', progress: 0, estimatedMinutes: 90 },
  ],
  50
);
check(
  'master with estimates reaches ~50%',
  CT.computeWeightedProgress(masterEst).percent === 50
);

check(
  'isAllSubtasksComplete false when empty',
  CT.isAllSubtasksComplete({ items: [] }) === false
);
check(
  'isAllSubtasksComplete true for card-only 100%',
  CT.isAllSubtasksComplete({ items: [], progress: 100 }) === true
);
check(
  'isAllSubtasksComplete false when some open',
  CT.isAllSubtasksComplete({
    items: [
      { id: 'a', text: 'A', progress: 100 },
      { id: 'b', text: 'B', progress: 50 },
    ],
  }) === false
);
check(
  'isAllSubtasksComplete true when remaining 0',
  CT.isAllSubtasksComplete({
    items: [
      { id: 'a', text: 'A', progress: 100 },
      { id: 'b', text: 'B', done: true },
    ],
  }) === true
);
check('syncCardDueCompleteFromProgress export', typeof CT.syncCardDueCompleteFromProgress === 'function');
check('completion marked due key', CT.COMPLETION_MARKED_DUE_COMPLETE_KEY === 'completionMarkedDueComplete');
check(
  'completion suppress due key',
  CT.COMPLETION_SUPPRESS_DUE_COMPLETE_KEY === 'completionSuppressDueComplete'
);
check('setDueCompleteSuppressed export', typeof CT.setDueCompleteSuppressed === 'function');
check('getDueCompleteSuppressed export', typeof CT.getDueCompleteSuppressed === 'function');
check('playAllCompleteCelebration export', typeof CUI.playAllCompleteCelebration === 'function');
check('clearAllCompleteCelebration export', typeof CUI.clearAllCompleteCelebration === 'function');

var cardOnly = CT.computeCardProgress({ items: [], progress: 45 });
check('card progress without items', cardOnly.hasItems === false && cardOnly.percent === 45);
check(
  'detail badge card-only progress',
  CT.formatDetailBadgeText(cardOnly) === '45\u00a0%'
);
check(
  'face badge card-only progress',
  CT.buildCardFaceBadge(cardOnly).text === '45\u00a0%'
);

var normalizedCard = CT.normalizeCompletionData({ items: [], progress: 72 });
check('normalize stores card progress', normalizedCard.progress === 72 && normalizedCard.items.length === 0);
check(
  'normalize drops card progress when items exist',
  CT.normalizeCompletionData({ items: [{ id: 'a', text: 'A', progress: 50, difficulty: 1 }], progress: 72 }).progress ===
    undefined
);

// Master slider proportional scaling
var base = [
  { id: 'a', text: 'A', progress: 25, difficulty: 2 },
  { id: 'b', text: 'B', progress: 25, difficulty: 2 },
];
var scaled = CT.applyMasterProgress(base, 50);
var scaledProgress = CT.computeWeightedProgress(scaled);
check('master slider reaches 50%', scaledProgress.percent === 50);
check('master slider doubles each item', scaled[0].progress === 50 && scaled[1].progress === 50);
check('master strips difficulty', scaled[0].difficulty === undefined && scaled[1].difficulty === undefined);

var fromZero = CT.applyMasterProgress(
  [
    { id: 'a', text: 'A', progress: 0, difficulty: 1 },
    { id: 'b', text: 'B', progress: 0, difficulty: 3 },
  ],
  60
);
check('master from zero sets uniform 60%', fromZero[0].progress === 60 && fromZero[1].progress === 60);

var toComplete = CT.applyMasterProgress(
  [
    { id: 'a', text: 'A', progress: 30, difficulty: 1 },
    { id: 'b', text: 'B', progress: 70, difficulty: 1 },
  ],
  100
);
check('master to 100 completes all', toComplete.every(function (i) { return i.progress === 100 && i.done; }));

var markedFromZero = CT.markFullyComplete({ items: [], progress: 0 });
check('markFullyComplete card progress', markedFromZero.progress === 100);
check(
  'markFullyComplete clears disabled flag',
  markedFromZero.progressEnabled !== false
);
var markedItems = CT.markFullyComplete({
  items: [
    { id: 'a', text: 'A', progress: 10, difficulty: 1 },
    { id: 'b', text: 'B', progress: 40, difficulty: 1 },
  ],
  progressEnabled: false,
});
check(
  'markFullyComplete items',
  markedItems.items.every(function (i) { return i.progress === 100 && i.done; }) &&
    markedItems.progressEnabled !== false
);

check('markNotFullyComplete export', typeof CT.markNotFullyComplete === 'function');
var clearedCard = CT.markNotFullyComplete({ items: [], progress: 100 });
check(
  'markNotFullyComplete card progress',
  clearedCard.progress === 0 && !CT.isAllSubtasksComplete(clearedCard)
);
check(
  'markNotFullyComplete noop when already incomplete',
  CT.markNotFullyComplete({ items: [], progress: 40 }).progress === 40
);
var clearedItems = CT.markNotFullyComplete({
  items: [
    { id: 'a', text: 'A', progress: 100 },
    { id: 'b', text: 'B', progress: 100 },
  ],
});
check(
  'markNotFullyComplete items',
  clearedItems.items.every(function (i) { return i.progress === 0 && !i.done; }) &&
    !CT.isAllSubtasksComplete(clearedItems)
);

check(
  'face badge hidden at 0%',
  CT.buildCardFaceBadge({ hasItems: true, percent: 0 }) === null
);
check(
  'face badge text incomplete',
  CT.formatFaceBadgeText({ hasItems: true, percent: 45 }) === '45\u00a0%'
);
check(
  'face badge text complete',
  CT.formatFaceBadgeText({ hasItems: true, percent: 100 }) === '\u2713 100\u00a0%'
);
check(
  'detail badge with items',
  CT.formatDetailBadgeText({ hasItems: true, percent: 45, doneCount: 2, totalCount: 5 }) ===
    '45\u00a0% (2/5)'
);
check(
  'detail badge empty',
  CT.formatDetailBadgeText({ hasItems: false }) === 'D\u00e9finir le progr\u00e8s'
);
check(
  'face badge color complete via CUI',
  CT.buildCardFaceBadge({ hasItems: true, percent: 100 }).color === 'green'
);
check(
  'normalize strips empty text',
  CT.normalizeCompletionData({ items: [{ id: 'x', text: '  ', done: false, difficulty: 1 }] }).items.length === 0
);
check(
  'normalize clamps progress',
  CT.normalizeItem({ id: 'x', text: 'ok', progress: 150, difficulty: 1 }).progress === 100
);
check(
  'normalize syncs done from progress',
  CT.normalizeItem({ id: 'x', text: 'ok', progress: 80, difficulty: 1 }).done === false &&
    CT.normalizeItem({ id: 'y', text: 'ok', progress: 100, difficulty: 1 }).done === true
);

check('encouragement at 0', CUI.progressEncouragementText(0) === 'En attente');
check('encouragement amorcee', CUI.progressEncouragementText(8) === 'Amorc\u00e9e');
check('encouragement debut', CUI.progressEncouragementText(20) === 'D\u00e9but\u00e9');
check('encouragement en cours', CUI.progressEncouragementText(40) === 'En cours');
check('encouragement bon progres', CUI.progressEncouragementText(60) === 'Bon progr\u00e8s');
check('encouragement bien avance', CUI.progressEncouragementText(85) === 'Bien avanc\u00e9');
check('encouragement bientot termine', CUI.progressEncouragementText(95) === 'Bient\u00f4t termin\u00e9');
check('encouragement termine', CUI.progressEncouragementText(100) === 'Termin\u00e9');
check(
  'encouragement idle icon',
  CUI.progressEncouragementMeta(0).icon === 'ti-player-pause' &&
    CUI.progressEncouragementMeta(0).tone === 'idle'
);
check(
  'encouragement play icon',
  CUI.progressEncouragementMeta(40).icon === 'ti-player-play' &&
    CUI.progressEncouragementMeta(40).tone === 'active'
);
check(
  'encouragement almost-done icon',
  CUI.progressEncouragementMeta(95).icon === 'ti-player-skip-forward' &&
    CUI.progressEncouragementMeta(95).tone === 'near'
);
check(
  'encouragement done icon',
  CUI.progressEncouragementMeta(100).icon === 'ti-check' &&
    CUI.progressEncouragementMeta(100).tone === 'done'
);

var mismatchDone = CT.detectDonePendingMismatch(
  { category: 'completed', listName: 'Done', listId: 'L1' },
  {
    items: [
      { id: 'a', text: 'Ship', progress: 100 },
      { id: 'b', text: 'Polish', progress: 40 },
    ],
  }
);
check('detectDonePendingMismatch finds pending under completed', !!mismatchDone);
check('detectDonePendingMismatch pendingCount', mismatchDone && mismatchDone.pendingCount === 1);
check(
  'detectDonePendingMismatch pending text',
  mismatchDone && mismatchDone.pendingItems[0].text === 'Polish'
);
check(
  'detectDonePendingMismatch null when all done',
  CT.detectDonePendingMismatch(
    { category: 'completed' },
    { items: [{ id: 'a', text: 'Ship', progress: 100 }] }
  ) === null
);
check(
  'detectDonePendingMismatch null when not completed',
  CT.detectDonePendingMismatch(
    { category: 'started' },
    {
      items: [
        { id: 'a', text: 'Ship', progress: 100 },
        { id: 'b', text: 'Polish', progress: 40 },
      ],
    }
  ) === null
);
check(
  'detectDonePendingMismatch via completed role list',
  !!CT.detectDonePendingMismatch(
    { category: null, listId: 'Ldone', roleLists: { completed: 'Ldone' }, listName: 'Termin\u00e9' },
    { items: [{ id: 'a', text: 'Left', progress: 0 }] }
  )
);
check(
  'detectDonePendingMismatch ignores card-only progress',
  CT.detectDonePendingMismatch({ category: 'completed' }, { items: [], progress: 40 }) === null
);

check('LINK_NEST_MAX_DEPTH is 2', CT.LINK_NEST_MAX_DEPTH === 2);
check('isLinkedItem export', typeof CT.isLinkedItem === 'function');
check('itemLinkedCardId export', typeof CT.itemLinkedCardId === 'function');
check('resolveLinkedCompletionTree export', typeof CT.resolveLinkedCompletionTree === 'function');
check('applyLinkedSnapshots export', typeof CT.applyLinkedSnapshots === 'function');
check('getCardCompletionById export', typeof CT.getCardCompletionById === 'function');
[
  'saveCardCompletionById',
  'removeLinkedChildFromCompletion',
  'ensureLinkedChildInCompletion',
  'completionLinksToCard',
  'isLinkedDescendantOf',
  'findParentCards',
  'setParentCard',
].forEach(function (name) {
  check('export ' + name, typeof CT[name] === 'function');
});

var linkedItem = CT.normalizeItem({
  id: 'link-1',
  text: 'D\u00e9pendance',
  progress: 40,
  linkedCardId: 'card-b',
});
check('normalize keeps linkedCardId', linkedItem && linkedItem.linkedCardId === 'card-b');
check('isLinkedItem true for linked', CT.isLinkedItem(linkedItem));
check(
  'normalize linked placeholder without text',
  CT.normalizeItem({ id: 'l2', linkedCardId: 'card-c', progress: 0 }).text === 'Carte li\u00e9e'
);

var parentWithChild = CT.normalizeCompletionData({
  items: [
    { id: 'local', text: 'Local', progress: 0 },
    { id: 'link', text: 'Enfant', progress: 25, linkedCardId: 'card-child' },
  ],
});
check(
  'completionLinksToCard true',
  CT.completionLinksToCard(parentWithChild, 'card-child')
);
check(
  'completionLinksToCard false',
  !CT.completionLinksToCard(parentWithChild, 'card-other')
);
var stripped = CT.removeLinkedChildFromCompletion(parentWithChild, 'card-child');
check(
  'removeLinkedChildFromCompletion removes link',
  stripped.removed === 1 &&
    stripped.data.items.length === 1 &&
    stripped.data.items[0].id === 'local' &&
    !CT.completionLinksToCard(stripped.data, 'card-child')
);
var ensured = CT.ensureLinkedChildInCompletion(stripped.data, 'card-child', {
  text: 'Enfant',
  progress: 40,
});
check(
  'ensureLinkedChildInCompletion adds link',
  ensured.added &&
    ensured.changed &&
    ensured.data.items.length === 2 &&
    CT.completionLinksToCard(ensured.data, 'card-child')
);
var ensuredAgain = CT.ensureLinkedChildInCompletion(ensured.data, 'card-child', {
  text: 'Autre',
  progress: 99,
});
check(
  'ensureLinkedChildInCompletion idempotent',
  !ensuredAgain.added &&
    !ensuredAgain.changed &&
    ensuredAgain.data.items.length === 2
);

var mixedMaster = CT.applyMasterProgress(
  [
    { id: 'a', text: 'Local', progress: 0 },
    { id: 'b', text: 'Linked', progress: 50, linkedCardId: 'card-b' },
  ],
  100
);
check(
  'applyMasterProgress completes local only',
  mixedMaster[0].progress === 100 && mixedMaster[1].progress === 50 && mixedMaster[1].linkedCardId === 'card-b'
);

var snapped = CT.applyLinkedSnapshots(
  {
    items: [
      { id: 'a', text: 'Old', progress: 10, linkedCardId: 'card-b' },
      { id: 'b', text: 'Local', progress: 20 },
    ],
  },
  { 'card-b': { name: 'Nouveau titre', percent: 75 } }
);
check(
  'applyLinkedSnapshots updates title + progress',
  snapped.items[0].text === 'Nouveau titre' &&
    snapped.items[0].progress === 75 &&
    snapped.items[1].progress === 20
);

// Async tree resolve with cycle A ↔ B
var store = {
  'card-a': {
    items: [{ id: 'a1', text: 'Vers B', progress: 0, linkedCardId: 'card-b' }],
  },
  'card-b': {
    items: [
      { id: 'b1', text: 'Sous-t\u00e2che B', progress: 50 },
      { id: 'b2', text: 'Retour A', progress: 0, linkedCardId: 'card-a' },
    ],
  },
  'card-parent': {
    items: [
      { id: 'p1', text: 'Local', progress: 0 },
      { id: 'p2', text: 'Enfant', progress: 10, linkedCardId: 'card-child' },
    ],
  },
  'card-child': {
    items: [{ id: 'c1', text: 'Travail', progress: 30 }],
  },
  'card-other': {
    items: [],
  },
};
var fakeT = {
  get: function (scope, vis, key) {
    if (key !== CT.CARD_COMPLETION_KEY) return Promise.resolve(null);
    return Promise.resolve(store[scope] || null);
  },
  set: function (scope, vis, key, value) {
    if (key !== CT.CARD_COMPLETION_KEY) return Promise.resolve();
    store[scope] = value;
    return Promise.resolve();
  },
};

// ── Estimate time (Progrès) ───────────────────────────────────────────
[
  'clampEstimatedMinutes',
  'computeEstimatedTotal',
  'computeEstimatedRemaining',
  'computeItemsEstimateBase',
  'itemsNeedingEstimate',
  'applyItemEstimates',
  'applyMasterEstimate',
  'applyItemEstimate',
  'migrateEstimateFromPriority',
  'formatEstimatedMinutesCompact',
  'formatEstimatedRemainingLabel',
  'formatEstimateForScale',
  'formatEstimateForScales',
  'normalizeEstimateScale',
  'normalizeEstimateScales',
  'getEstimateScale',
  'getEstimateScaleTicks',
  'nearestEstimateTick',
  'getCachedBoardEstimateScales',
  'setCachedBoardEstimateScales',
].forEach(function (name) {
  check('export ' + name, typeof CT[name] === 'function');
});

check('default estimate scale is time', CT.DEFAULT_ESTIMATE_SCALE === 'time');
check(
  'two estimate scales (no cafés)',
  CT.ESTIMATE_SCALE_ORDER.length === 2 &&
    !!CT.ESTIMATE_SCALES.time &&
    !!CT.ESTIMATE_SCALES.tshirt &&
    !CT.ESTIMATE_SCALES.coffee
);
check(
  'default board scales are time + tshirt',
  Array.isArray(CT.DEFAULT_ESTIMATE_SCALES) &&
    CT.DEFAULT_ESTIMATE_SCALES.join(',') === 'time,tshirt'
);
check('normalize unknown scale → time', CT.normalizeEstimateScale('nope') === 'time');
check('normalize tailles → tshirt', CT.normalizeEstimateScale('tailles') === 'tshirt');
check('normalize legacy cafés → time', CT.normalizeEstimateScale('cafés') === 'time');
check(
  'normalizeEstimateScales accepts both',
  CT.normalizeEstimateScales(['tshirt', 'time']).join(',') === 'time,tshirt'
);
check(
  'normalizeEstimateScales empty → defaults',
  CT.normalizeEstimateScales([]).join(',') === 'time,tshirt'
);
check(
  'tshirt ticks XS–XL',
  CT.getEstimateScaleTicks('tshirt')
    .map(function (t) {
      return t.label;
    })
    .join(',') === 'XS,S,M,L,XL'
);
check(
  'format tshirt M',
  CT.formatEstimateForScale(4 * 60, 'tshirt') === 'M'
);
check(
  'format dual scales',
  CT.formatEstimateForScales(4 * 60, ['time', 'tshirt']).indexOf('M') !== -1 &&
    CT.formatEstimateForScales(4 * 60, ['time', 'tshirt']).indexOf('h') !== -1
);
check(
  'nearest tshirt for 50 min → S',
  CT.nearestEstimateTick(50, 'tshirt').label === 'S'
);
check(
  'remaining label tshirt',
  CT.formatEstimatedRemainingLabel(60, 'tshirt') === '~S restantes'
);
check(
  'normalize drops legacy per-card estimateScale',
  CT.normalizeCompletionData({ items: [], estimateScale: 'tshirt' }).estimateScale ===
    undefined
);

var estItems = CT.normalizeCompletionData({
  items: [
    { id: 'e1', text: 'A', progress: 0, estimatedMinutes: 60 },
    { id: 'e2', text: 'B', progress: 50, estimatedMinutes: 120 },
  ],
});
check(
  'estimate sum of subtasks',
  CT.computeEstimatedTotal(estItems) === 180
);
check(
  'estimate remaining respects progress',
  CT.computeEstimatedRemaining(estItems) === 60 + 60
);

var withOffset = CT.applyMasterEstimate(estItems, 240, { lock: true });
check(
  'master edit sets hidden offset',
  withOffset.estimatedMinutesOffset === 60 &&
    withOffset.estimatedMinutesLocked === true
);
check(
  'total includes offset',
  CT.computeEstimatedTotal(withOffset) === 240
);
check(
  'remaining includes positive offset fraction',
  CT.computeEstimatedRemaining(withOffset) ===
    60 + 60 + Math.round(60 * (1 - CT.computeCardProgress(withOffset).percent / 100))
);

var lockedItem = CT.applyItemEstimate(estItems, 'e1', 90, { lock: true });
check(
  'item estimate lock',
  lockedItem.items[0].estimatedMinutes === 90 &&
    lockedItem.items[0].estimatedMinutesLocked === true
);
var aiFill = CT.applyItemEstimates(
  {
    items: [
      { id: 'e1', text: 'A', progress: 0, estimatedMinutes: 90, estimatedMinutesLocked: true },
      { id: 'e2', text: 'B', progress: 0 },
    ],
  },
  [
    { id: 'e1', estimatedMinutes: 5 },
    { id: 'e2', estimatedMinutes: 30 },
  ]
);
check(
  'AI fill skips locked item',
  aiFill.items[0].estimatedMinutes === 90 && aiFill.items[1].estimatedMinutes === 30
);
check(
  'items needing estimate filters locked/set',
  CT.itemsNeedingEstimate(aiFill).length === 0
);

var cardOnlyEst = CT.normalizeCompletionData({
  items: [],
  progress: 50,
  estimatedMinutes: 100,
});
check('card-level estimate total', CT.computeEstimatedTotal(cardOnlyEst) === 100);
check('card-level estimate remaining half', CT.computeEstimatedRemaining(cardOnlyEst) === 50);

var migratedEst = CT.migrateEstimateFromPriority({ items: [] }, 45);
check(
  'migrate Facilité → card estimate',
  migratedEst && migratedEst.estimatedMinutes === 45
);
var migratedOffset = CT.migrateEstimateFromPriority(
  {
    items: [
      { id: 'x', text: 'X', progress: 0 },
    ],
  },
  90
);
check(
  'migrate Facilité → offset when items lack times',
  migratedOffset && migratedOffset.estimatedMinutesOffset === 90
);
check(
  'migrate no-op when estimate exists',
  CT.migrateEstimateFromPriority({ items: [], estimatedMinutes: 20 }, 45) === null
);

var preserved = CT.applyMasterProgress(
  [{ id: 'p1', text: 'P', progress: 20, estimatedMinutes: 40, estimatedMinutesLocked: true }],
  40
);
check(
  'applyMasterProgress keeps estimates',
  preserved[0].estimatedMinutes === 40 && preserved[0].estimatedMinutesLocked === true
);

check(
  'remaining label compact',
  typeof CT.formatEstimatedRemainingLabel(60) === 'string' &&
    CT.formatEstimatedRemainingLabel(60).indexOf('restantes') !== -1
);
check(
  'remaining label at 0 is Terminé',
  CT.formatEstimatedRemainingLabel(0) === 'Termin\u00e9'
);

var boardCardsForParent = [
  { id: 'card-parent', name: 'Parent', list: 'Todo' },
  { id: 'card-child', name: 'Enfant', list: 'Todo' },
  { id: 'card-other', name: 'Autre', list: 'Doing' },
  { id: 'card-a', name: 'Carte A', list: 'Todo' },
  { id: 'card-b', name: 'Carte B', list: 'Todo' },
];

CT.resolveLinkedCompletionTree(fakeT, store['card-a'], {
  currentCardId: 'card-a',
  cardNameById: { 'card-a': 'Carte A', 'card-b': 'Carte B' },
  maxDepth: 2,
})
  .then(function (resolved) {
    var node = resolved && resolved.byItemId && resolved.byItemId.a1;
    check('resolve tree loads linked title', node && node.text === 'Carte B');
    check(
      'resolve tree shows depth-2 children',
      node && node.children && node.children.length === 2
    );
    check(
      'resolve tree marks cycle on back-link',
      node &&
        node.children.some(function (c) {
          return c.linkedCardId === 'card-a' && c.isCycle;
        })
    );
    check(
      'resolve tree does not nest past cycle',
      node &&
        node.children.every(function (c) {
          return !c.children || !c.children.length;
        })
    );
    check(
      'resolve tree caches linked progress on item',
      resolved.data.items[0].progress ===
        CT.computeCardProgress(CT.normalizeCompletionData(store['card-b'])).percent
    );

    return CT.findParentCards(fakeT, 'card-child', {
      cards: boardCardsForParent,
    });
  })
  .then(function (parents) {
    check(
      'findParentCards finds reverse link',
      Array.isArray(parents) &&
        parents.length === 1 &&
        parents[0].id === 'card-parent' &&
        parents[0].name === 'Parent'
    );

    return CT.setParentCard(fakeT, 'card-child', null, {
      cards: boardCardsForParent,
    });
  })
  .then(function (cleared) {
    check('setParentCard clear ok', cleared && cleared.ok);
    check(
      'setParentCard clear removes from parent',
      !CT.completionLinksToCard(store['card-parent'], 'card-child')
    );

    return CT.setParentCard(fakeT, 'card-child', 'card-other', {
      cards: boardCardsForParent,
      childName: 'Enfant',
      childProgress: 30,
      parentName: 'Autre',
      parentList: 'Doing',
    });
  })
  .then(function (setResult) {
    check('setParentCard set ok', setResult && setResult.ok);
    check(
      'setParentCard sets new parent link',
      CT.completionLinksToCard(store['card-other'], 'card-child')
    );
    check(
      'setParentCard parent meta',
      setResult.parent &&
        setResult.parent.id === 'card-other' &&
        setResult.parent.name === 'Autre'
    );

    return CT.setParentCard(fakeT, 'card-child', 'card-child', {
      cards: boardCardsForParent,
    });
  })
  .then(function (selfResult) {
    check(
      'setParentCard rejects self',
      selfResult && selfResult.ok === false && selfResult.reason === 'self'
    );

    return CT.setParentCard(fakeT, 'card-a', 'card-b', {
      cards: boardCardsForParent,
    });
  })
  .then(function (cycleResult) {
    check(
      'setParentCard rejects cycle',
      cycleResult && cycleResult.ok === false && cycleResult.reason === 'cycle'
    );

    console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll completion checks passed');
    process.exit(bad ? 1 : 0);
  })
  .catch(function (err) {
    console.error(err);
    console.log('\nFAIL parent / resolveLinkedCompletionTree threw');
    process.exit(1);
  });
