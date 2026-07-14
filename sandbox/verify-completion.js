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

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll completion checks passed');
process.exit(bad ? 1 : 0);
