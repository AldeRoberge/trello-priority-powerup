// Badge completion verification — run: node sandbox/verify-badges.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityUI: null, PriorityTrello: null, window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-ui.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-trello.js'), 'utf8'),
  sandbox
);

// Scripts attach to window when present in the VM context.
var PT = sandbox.PriorityTrello || (sandbox.window && sandbox.window.PriorityTrello);
var PU = sandbox.PriorityUI || (sandbox.window && sandbox.window.PriorityUI);
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

[
  'initIframePage',
  'saveCardInputs',
  'getCardName',
  'clearBlockedIfComplete',
  'ensureBoardPriorityContext',
  'preloadBoardPriorityContext',
  'getCachedBoardFormulaKey',
  'getBoardFormula',
  'saveBoardFormula',
  'getBoardColorScheme',
  'saveBoardColorScheme',
].forEach(function (name) {
  check('popup export ' + name, typeof PT[name] === 'function');
});
check('popup export IMPORTANT_INPUTS', PT.IMPORTANT_INPUTS && typeof PT.IMPORTANT_INPUTS === 'object');
check('popup export PRIORITY_DIMENSIONS', Array.isArray(PT.PRIORITY_DIMENSIONS));

var urgentDisplay = { tierLabel: 'Urgente', label: 'Urgente', tierI: 1 };
var prioritaireDisplay = { tierLabel: 'Prioritaire', label: 'Prioritaire', tierI: 2 };
var importantDisplay = { tierLabel: 'Importante', label: 'Importante', tierI: 3 };
var blockedDisplay = { blocked: true, blockedReason: 'En attente d\'une approbation', tierI: 1, tierLabel: 'Urgente' };
var critiqueBlockedDisplay = {
  blocked: true,
  blockedReason: 'En attente d\'une r\u00e9ponse',
  tierI: 0,
  tierLabel: 'Critique'
};

var TRELLO_BADGE_NAMES = ['blue', 'green', 'orange', 'red', 'yellow', 'purple', 'pink', 'sky', 'lime', 'light-gray'];

function isTrelloBadgeColor(name) {
  return TRELLO_BADGE_NAMES.indexOf(name) >= 0;
}

PU.applyColorScheme('blue');

check(
  'incomplete urgent badge',
  PT.formatBadgeText(urgentDisplay, false) === '\u2B24 T\u00e2che urgente'
);
check(
  'complete urgent badge',
  PT.formatBadgeText(urgentDisplay, true) === '\u2713 Compl\u00e9t\u00e9 (T\u00e2che urgente)'
);
check(
  'complete urgent badge color',
  PT.buildCardFaceBadge(urgentDisplay, true).color === 'green'
);
check(
  'incomplete urgent badge color is valid',
  isTrelloBadgeColor(PT.buildCardFaceBadge(urgentDisplay, false).color)
);
check(
  'incomplete prioritaire badge color is valid',
  isTrelloBadgeColor(PT.buildCardFaceBadge(prioritaireDisplay, false).color)
);
check(
  'incomplete important badge color is not green',
  PT.buildCardFaceBadge(importantDisplay, false).color !== 'green'
);
check(
  'incomplete important badge color is valid',
  isTrelloBadgeColor(PT.buildCardFaceBadge(importantDisplay, false).color)
);
check(
  'complete important badge color',
  PT.buildCardFaceBadge(importantDisplay, true).color === 'green'
);
check(
  'urgent and prioritaire badge colors differ',
  PT.buildCardFaceBadge(urgentDisplay, false).color !==
    PT.buildCardFaceBadge(prioritaireDisplay, false).color
);
check(
  'scheme change updates trello badge mapping',
  (function () {
    var blueUrgent = PU.tierTrelloBadgeColor(urgentDisplay);
    PU.applyColorScheme('amber');
    var amberUrgent = PU.tierTrelloBadgeColor(urgentDisplay);
    PU.applyColorScheme('blue');
    return blueUrgent !== amberUrgent;
  })()
);
check(
  'scheme badge preview samples',
  (function () {
    var samples = PU.schemeBadgePreviewSamples();
    if (!Array.isArray(samples) || samples.length !== PU.TIERS.length) return false;
    if (samples[0].label !== 'T\u00e2che critique') return false;
    if (samples[1].label !== 'T\u00e2che urgente') return false;
    if (samples[3].label !== 'T\u00e2che importante') return false;
    if (samples[6].label !== 'T\u00e2che optionnelle') return false;
    return samples.every(function (sample) {
      return (
        typeof sample.tierI === 'number' &&
        isTrelloBadgeColor(sample.color) &&
        typeof sample.label === 'string' &&
        typeof sample.text === 'string' &&
        sample.text.indexOf(sample.label) !== -1
      );
    });
  })()
);
check(
  'scheme badge preview follows color scheme',
  (function () {
    PU.applyColorScheme('blue');
    var blueColors = PU.schemeBadgePreviewSamples().map(function (s) { return s.color; }).join(',');
    PU.applyColorScheme('amber');
    var amberColors = PU.schemeBadgePreviewSamples().map(function (s) { return s.color; }).join(',');
    PU.applyColorScheme('blue');
    return blueColors !== amberColors && amberColors.split(',').every(isTrelloBadgeColor);
  })()
);
check(
  'incomplete dot not checkmark',
  PT.tierBadgeDot(urgentDisplay, false) === '\u2B24'
);
check(
  'complete dot is checkmark',
  PT.tierBadgeDot(urgentDisplay, true) === '\u2713'
);
check(
  'chain object is not complete',
  PT.isCardMarkedComplete({ get: function () {} }) === false
);
check(
  'chain with badges stub is not complete',
  PT.isCardMarkedComplete({ get: function () {}, badges: { dueComplete: true } }) === false
);
check(
  'dueComplete true',
  PT.isCardMarkedComplete({ dueComplete: true }) === true
);
check(
  'dueComplete false',
  PT.isCardMarkedComplete({ dueComplete: false }) === false
);
check(
  'badges.dueComplete true',
  PT.isCardMarkedComplete({ badges: { dueComplete: true } }) === true
);
check(
  'blocked incomplete badge',
  PT.formatBadgeText(blockedDisplay, false) ===
    '\u2298 T\u00e2che urgente (En attente d\'une approbation)'
);
check(
  'critique blocked incomplete badge',
  PT.formatBadgeText(critiqueBlockedDisplay, false) ===
    '\u2298 T\u00e2che critique (En attente d\'une r\u00e9ponse)'
);
check(
  'blocked incomplete badge without reason',
  PT.formatBadgeText({ blocked: true, tierI: 1, tierLabel: 'Urgente' }, false) ===
    '\u2298 T\u00e2che urgente (Bloqu\u00e9)'
);
check(
  'blocked board badge has no icon',
  PT.buildCardFaceBadge(blockedDisplay, false).icon == null
);
check(
  'blocked complete badge has no icon',
  PT.buildCardFaceBadge(blockedDisplay, true).icon == null
);
check(
  'blocked complete uses Complété wrapper without blocked label',
  PT.formatBadgeText(blockedDisplay, true) ===
    '\u2713 Compl\u00e9t\u00e9 (T\u00e2che urgente)'
);
check(
  'clearBlockedFromInputs strips blocked fields',
  (function () {
    var cleared = PT.clearBlockedFromInputs({
      urgency: 1,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReason: 'En attente d\'une approbation',
    });
    return (
      cleared.urgency === 1 &&
      cleared.impact === 2 &&
      cleared.ease === 3 &&
      cleared.enAttente == null &&
      cleared.blockedReason == null
    );
  })()
);
check(
  'clearBlockedFromInputs preserves dueDate',
  (function () {
    var cleared = PT.clearBlockedFromInputs({
      urgency: 1,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReason: 'En attente d\'une approbation',
      dueDate: '2026-07-20',
    });
    return (
      cleared.dueDate === '2026-07-20' &&
      cleared.enAttente == null &&
      cleared.blockedReason == null
    );
  })()
);
check(
  'clearBlockedFromInputs unchanged when not blocked',
  (function () {
    var inputs = { urgency: 2, impact: 2, ease: 3 };
    return PT.clearBlockedFromInputs(inputs) === inputs;
  })()
);
check(
  'blocked complete badge color',
  PT.buildCardFaceBadge(blockedDisplay, true).color === 'green'
);
check(
  'blocked incomplete badge color matches tier',
  PT.buildCardFaceBadge(blockedDisplay, false).color === PU.tierTrelloBadgeColor(blockedDisplay)
);
check(
  'critique blocked incomplete badge color matches tier',
  PT.buildCardFaceBadge(critiqueBlockedDisplay, false).color === PU.tierTrelloBadgeColor(critiqueBlockedDisplay)
);
check(
  'blocked dot is circle-slash only',
  PT.tierBadgeDot(blockedDisplay, false) === '\u2298'
);

var critiqueDisplay = { tierI: 0, score: 9.5, label: 'Critique' };
var optionnelDisplay = { tierI: 6, score: 1.2, label: 'Optionnelle' };
var inutileDisplay = { inutile: true, tierI: null, score: 0, label: 'Inutile' };
var noPriorityDisplay = null;
var urgentHigh = { tierI: 1, score: 8.0, label: 'Urgente' };
var urgentLow = { tierI: 1, score: 6.0, label: 'Urgente' };

check(
  'sort critique before urgent',
  PT.comparePriorityDisplays(critiqueDisplay, urgentDisplay) < 0
);
check(
  'sort urgent before prioritaire',
  PT.comparePriorityDisplays(urgentDisplay, prioritaireDisplay) < 0
);
check(
  'sort optionnel before inutile',
  PT.comparePriorityDisplays(optionnelDisplay, inutileDisplay) < 0
);
check(
  'sort inutile before unprioritized',
  PT.comparePriorityDisplays(inutileDisplay, noPriorityDisplay) < 0
);
check(
  'sort unprioritized last',
  PT.prioritySortRank(noPriorityDisplay).tier === 100
);
check(
  'blocked card sorts by underlying tier (urgent before prioritaire)',
  PT.comparePriorityDisplays(blockedDisplay, prioritaireDisplay) < 0
);
check(
  'blocked critique sorts before blocked urgent',
  PT.comparePriorityDisplays(critiqueBlockedDisplay, blockedDisplay) < 0
);
check(
  'same tier sorts higher score first',
  PT.comparePriorityDisplays(urgentHigh, urgentLow) < 0
);
check(
  'list sorter label is Priorité',
  PT.listPrioritySorters({}).length === 1 && PT.listPrioritySorters({})[0].text === 'Priorit\u00e9'
);

var listEntries = [
  { id: 'c1', pos: 16384, display: critiqueDisplay },
  { id: 'c2', pos: 32768, display: urgentDisplay },
  { id: 'c3', pos: 49152, display: prioritaireDisplay },
];
check(
  'compute move: no move when list already matches priority',
  PT.computeCardMovePosition(listEntries, 'c2') === null
);
var wrongOrderEntries = [
  { id: 'c1', pos: 16384, display: critiqueDisplay },
  { id: 'c3', pos: 32768, display: prioritaireDisplay },
  { id: 'c2', pos: 49152, display: urgentDisplay },
];
check(
  'compute move: prioritaire down when above urgent',
  JSON.stringify(PT.computeCardMovePosition(wrongOrderEntries, 'c3')) === JSON.stringify({ pos: 'bottom' })
);
var mixedEntries = [
  { id: 'a', pos: 1000, display: critiqueDisplay },
  { id: 'c', pos: 2000, display: prioritaireDisplay },
  { id: 'b', pos: 3000, display: urgentDisplay },
];
check(
  'compute move: urgent up when currently below prioritaire',
  JSON.stringify(PT.computeCardMovePosition(mixedEntries, 'b')) === JSON.stringify({ pos: 1500 })
);
check(
  'compute move: unprioritized card sorts to bottom',
  JSON.stringify(PT.computeCardMovePosition([
    { id: 'x', pos: 2000, display: critiqueDisplay },
    { id: 'y', pos: 1000, display: null },
  ], 'y')) === JSON.stringify({ pos: 'bottom' })
);

function addDaysIso(baseIso, deltaDays) {
  var parts = baseIso.split('-').map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2] + deltaDays);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1);
  var day = String(d.getDate());
  if (m.length < 2) m = '0' + m;
  if (day.length < 2) day = '0' + day;
  return y + '-' + m + '-' + day;
}

var nowFixed = new Date(2026, 6, 13); // 2026-07-13
check(
  'normalizeDueDate accepts ISO date',
  PU.normalizeDueDate('2026-07-16') === '2026-07-16'
);
check(
  'normalizeDueDate rejects invalid date',
  PU.normalizeDueDate('2026-02-31') === ''
);
check(
  'countdown today',
  PU.formatDueCountdown('2026-07-13', nowFixed) === 'aujourd\'hui'
);
check(
  'countdown 1 day',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 1), nowFixed) === '1 jour restant'
);
check(
  'countdown 3 days',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 3), nowFixed) === '3 jours restants'
);
check(
  'countdown 2 weeks',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 14), nowFixed) === '2 semaines restantes'
);
check(
  'countdown 2 months',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 61), nowFixed) === '2 mois restants'
);
check(
  'countdown overdue',
  PU.formatDueCountdown(addDaysIso('2026-07-13', -2), nowFixed) === 'en retard de 2 jours'
);
check(
  'due badge text includes countdown',
  PT.formatBadgeText(
    {
      tierLabel: 'Urgente',
      label: 'Urgente',
      tierI: 1,
      dueDate: addDaysIso('2026-07-13', 3),
      dueCountdown: '3 jours restants',
    },
    false
  ) === '\u2B24 T\u00e2che urgente (3 jours restants)'
);
check(
  'normalizeInputs keeps dueDate',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 3,
      impact: 3,
      ease: 2,
      dueDate: '2026-07-16',
    });
    return normalized && normalized.dueDate === '2026-07-16';
  })()
);
check(
  'resolveDisplay attaches dueCountdown',
  (function () {
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(today.getDate());
    if (day.length < 2) day = '0' + day;
    var due = addDaysIso(y + '-' + m + '-' + day, 3);
    var result = PU.calc.baseline({ urgency: 3, impact: 3, ease: 2 });
    var display = PU.resolveDisplay(result, {
      urgency: 3,
      impact: 3,
      ease: 2,
      dueDate: due,
    });
    return (
      display.dueDate === due &&
      display.dueCountdown === PU.formatDueCountdown(due)
    );
  })()
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll badge checks passed');
process.exit(bad ? 1 : 0);
