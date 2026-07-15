// Badge completion verification — run: node sandbox/verify-badges.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityUI: null, PriorityTrello: null, window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'priority', 'priority-ui.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'priority', 'priority-trello.js'), 'utf8'),
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

var TRELLO_BADGE_NAMES = PU.TRELLO_BADGE_COLOR_NAMES || [
  'blue', 'green', 'orange', 'red', 'yellow', 'purple', 'pink', 'sky', 'lime', 'light-gray'
];
var BADGE_COLOR_COMPLETE = PU.TRELLO_BADGE_COLOR_COMPLETE || 'green';

function isTrelloBadgeColor(name) {
  return TRELLO_BADGE_NAMES.indexOf(name) >= 0;
}

PU.applyColorScheme('blue');

check(
  'exactly two color schemes',
  Object.keys(PU.COLOR_SCHEMES).length === 2 &&
    PU.COLOR_SCHEME_OPTIONS.length === 2 &&
    !!PU.COLOR_SCHEMES.blue &&
    !!PU.COLOR_SCHEMES.fire &&
    !PU.COLOR_SCHEMES.board
);
check('default scheme is classique blue', PU.DEFAULT_COLOR_SCHEME_KEY === 'blue');
check(
  'classic stops restored',
  PU.PRIORITY_BLUE_STOPS.join(',') ===
    ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#0C447C'].join(',')
);
check(
  'unknown scheme key falls back to classic',
  PU.normalizeColorSchemeKey('amber') === 'blue' &&
    PU.normalizeColorSchemeKey('teal') === 'blue' &&
    PU.normalizeColorSchemeKey('green') === 'blue'
);
check(
  'retired board scheme maps to fire',
  PU.normalizeColorSchemeKey('board') === 'fire'
);
check(
  'french scheme labels',
  PU.COLOR_SCHEMES.blue.label === 'Classique' && PU.COLOR_SCHEMES.fire.label === 'Feu'
);

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
  PT.buildCardFaceBadge(urgentDisplay, true).color === BADGE_COLOR_COMPLETE
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
  PT.buildCardFaceBadge(importantDisplay, false).color !== BADGE_COLOR_COMPLETE
);
check(
  'incomplete important badge color is valid',
  isTrelloBadgeColor(PT.buildCardFaceBadge(importantDisplay, false).color)
);
check(
  'complete important badge color',
  PT.buildCardFaceBadge(importantDisplay, true).color === BADGE_COLOR_COMPLETE
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
    PU.applyColorScheme('fire');
    var fireUrgent = PU.tierTrelloBadgeColor(urgentDisplay);
    PU.applyColorScheme('blue');
    return blueUrgent !== fireUrgent;
  })()
);
check(
  'scheme badge preview samples',
  (function () {
    var samples = PU.schemeBadgePreviewSamples();
    if (!Array.isArray(samples) || samples.length !== PU.TIERS.length) return false;
    // Preview is least → most critical (Optionnelle … Critique).
    if (samples[0].label !== PU.TASK_BADGE_LABELS.Optionnelle) return false;
    if (samples[samples.length - 1].label !== PU.TASK_BADGE_LABELS.Critique) return false;
    var byTier = {};
    samples.forEach(function (s) { byTier[s.tierI] = s; });
    if (byTier[PU.TIER_I.CRITIQUE].label !== PU.TASK_BADGE_LABELS.Critique) return false;
    if (byTier[PU.TIER_I.URGENTE].label !== PU.TASK_BADGE_LABELS.Urgente) return false;
    if (byTier[PU.TIER_I.IMPORTANTE].label !== PU.TASK_BADGE_LABELS.Importante) return false;
    if (byTier[PU.TIER_I.OPTIONNELLE].label !== PU.TASK_BADGE_LABELS.Optionnelle) return false;
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
    PU.applyColorScheme('fire');
    var fireColors = PU.schemeBadgePreviewSamples().map(function (s) { return s.color; }).join(',');
    PU.applyColorScheme('blue');
    return blueColors !== fireColors && fireColors.split(',').every(isTrelloBadgeColor);
  })()
);
check(
  'classic badge map matches restored palette',
  (function () {
    PU.applyColorScheme('blue');
    var samples = PU.schemeBadgePreviewSamples();
    // Least → most: Optionnelle … Critique
    return (
      samples[0].color === 'light-gray' &&
      samples[1].color === 'light-gray' &&
      samples[2].color === 'sky' &&
      samples[3].color === 'sky' &&
      samples[4].color === 'sky' &&
      samples[5].color === 'blue' &&
      samples[6].color === 'blue'
    );
  })()
);
check(
  'fire badge map is polychrome trello',
  (function () {
    PU.applyColorScheme('fire');
    var samples = PU.schemeBadgePreviewSamples();
    PU.applyColorScheme('blue');
    // Least → most: Optionnelle … Critique
    return (
      samples[0].color === 'light-gray' &&
      samples[1].color === 'light-gray' &&
      samples[2].color === 'sky' &&
      samples[3].color === 'blue' &&
      samples[4].color === 'yellow' &&
      samples[5].color === 'orange' &&
      samples[6].color === 'red'
    );
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
      blockedReasons: ['En attente d\'une approbation'],
    });
    return (
      cleared.urgency === 1 &&
      cleared.impact === 2 &&
      cleared.ease === 3 &&
      cleared.enAttente == null &&
      cleared.blockedReason == null &&
      cleared.blockedReasons == null
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
      blockedReasons: ['En attente d\'une approbation'],
      dueDate: '2026-07-20',
    });
    return (
      cleared.dueDate === '2026-07-20' &&
      cleared.enAttente == null &&
      cleared.blockedReasons == null
    );
  })()
);
check(
  'clearBlockedFromInputs preserves dueDate and dueTime',
  (function () {
    var cleared = PT.clearBlockedFromInputs({
      urgency: 1,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReason: 'En attente d\'une approbation',
      dueDate: '2026-07-20',
      dueTime: '14:30',
    });
    return cleared.dueDate === '2026-07-20' && cleared.dueTime === '14:30';
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
  PT.buildCardFaceBadge(blockedDisplay, true).color === BADGE_COLOR_COMPLETE
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

var nowFixed = new Date(2026, 6, 13); // 2026-07-13 midnight
var nowAfternoon = new Date(2026, 6, 13, 14, 0, 0); // 2026-07-13 14:00
check(
  'normalizeDueDate accepts ISO date',
  PU.normalizeDueDate('2026-07-16') === '2026-07-16'
);
check(
  'normalizeDueDate rejects invalid date',
  PU.normalizeDueDate('2026-02-31') === ''
);
check(
  'normalizeDueTime accepts HH:mm',
  PU.normalizeDueTime('9:05') === '09:05' && PU.normalizeDueTime('14:30') === '14:30'
);
check(
  'normalizeDueTime rejects invalid time',
  PU.normalizeDueTime('24:00') === '' && PU.normalizeDueTime('12:60') === ''
);
check(
  'default due time is 08:00',
  PU.DUE_DATE_TIME_DEFAULT === '08:00' &&
    PU.normalizeDueTime(PU.DUE_DATE_TIME_DEFAULT) === '08:00'
);
check(
  'countdown today',
  PU.formatDueCountdown('2026-07-13', nowFixed) === 'Aujourd\'hui'
);
check(
  'countdown 1 day',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 1), nowFixed) === 'Demain'
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
  PU.formatDueCountdown(addDaysIso('2026-07-13', -2), nowFixed) === 'En retard de 2 jours'
);
check(
  'countdown overdue 1 day',
  PU.formatDueCountdown(addDaysIso('2026-07-13', -1), nowFixed) === 'En retard de 1 jour'
);
check(
  'countdown overdue 2 weeks',
  PU.formatDueCountdown(addDaysIso('2026-07-13', -14), nowFixed) === 'En retard de 2 semaines'
);
check(
  'countdown overdue 2 months',
  PU.formatDueCountdown(addDaysIso('2026-07-13', -61), nowFixed) === 'En retard de 2 mois'
);
check(
  'countdown overdue 1 year',
  PU.formatDueCountdown(addDaysIso('2026-07-13', -365), nowFixed) === 'En retard de 1 an'
);
check(
  'countdown with time in minutes',
  PU.formatDueCountdown('2026-07-13', nowAfternoon, '14:45') === '45 min restantes'
);
check(
  'countdown with time in hours',
  PU.formatDueCountdown('2026-07-13', nowAfternoon, '17:00') === '3 h restantes'
);
check(
  'countdown hides hours when 10+ remain (same day)',
  PU.formatDueCountdown('2026-07-13', new Date(2026, 6, 13, 8, 0, 0), '20:00') ===
    'Aujourd\'hui'
);
check(
  'countdown hides hours when 10+ remain (next day)',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 1), nowAfternoon, '02:00') ===
    'Demain'
);
check(
  'countdown still shows hours when under 10 remain',
  PU.formatDueCountdown('2026-07-13', nowAfternoon, '23:00') === '9 h restantes'
);
check(
  'countdown with time overdue minutes',
  PU.formatDueCountdown('2026-07-13', nowAfternoon, '13:40') === 'En retard de 20 min'
);
check(
  'countdown with time overdue hours',
  PU.formatDueCountdown('2026-07-13', nowAfternoon, '11:00') === 'En retard de 3 h'
);
check(
  'countdown overdue hides hours when 10+ late',
  PU.formatDueCountdown('2026-07-13', nowAfternoon, '00:00') ===
    'En retard de 1 jour'
);
check(
  'countdown with time overdue weeks scales',
  PU.formatDueCountdown(addDaysIso('2026-07-13', -14), nowAfternoon, '09:00') ===
    'En retard de 2 semaines'
);
check(
  'countdown with time far stays day-granular',
  PU.formatDueCountdown(addDaysIso('2026-07-13', 3), nowAfternoon, '09:00') ===
    '3 jours restants'
);
check(
  'date-only ignores dueTime absence (midnight day granularity)',
  PU.formatDueCountdown('2026-07-13', nowAfternoon) === 'Aujourd\'hui'
);
check(
  'date trigger title empty falls back to Date',
  PU.formatDueDateTriggerTitle('', nowFixed) === 'Date'
);
check(
  'date trigger title today',
  PU.formatDueDateTriggerTitle('2026-07-13', nowFixed) === 'Aujourd\'hui'
);
check(
  'date trigger title tomorrow',
  PU.formatDueDateTriggerTitle(addDaysIso('2026-07-13', 1), nowFixed) === 'Demain'
);
check(
  'date trigger title yesterday',
  PU.formatDueDateTriggerTitle(addDaysIso('2026-07-13', -1), nowFixed) === 'Hier'
);
check(
  'date trigger title in two days',
  PU.formatDueDateTriggerTitle(addDaysIso('2026-07-13', 2), nowFixed) ===
    'Dans deux jours'
);
check(
  'date trigger title in three days',
  PU.formatDueDateTriggerTitle(addDaysIso('2026-07-13', 3), nowFixed) ===
    'Dans 3 jours'
);
check(
  'time trigger title empty falls back to Heure',
  PU.formatDueTimeTriggerTitle('2026-07-13', '', nowAfternoon) === 'Heure'
);
check(
  'time trigger title in one hour',
  PU.formatDueTimeTriggerTitle('2026-07-13', '15:00', nowAfternoon) ===
    'Dans une heure'
);
check(
  'time trigger title in two hours',
  PU.formatDueTimeTriggerTitle('2026-07-13', '16:00', nowAfternoon) ===
    'Dans deux heures'
);
check(
  'time trigger title in minutes',
  PU.formatDueTimeTriggerTitle('2026-07-13', '14:45', nowAfternoon) ===
    'Dans 45 minutes'
);
check(
  'time trigger title past hour',
  PU.formatDueTimeTriggerTitle('2026-07-13', '13:00', nowAfternoon) ===
    'Il y a une heure'
);
check(
  'time trigger title far falls back to day phrase',
  PU.formatDueTimeTriggerTitle(addDaysIso('2026-07-13', 2), '09:00', nowAfternoon) ===
    'Dans deux jours'
);
check(
  'period label today',
  PU.formatDueTimePeriodLabel('matin', '2026-07-13', nowAfternoon) === 'Ce matin' &&
    PU.formatDueTimePeriodLabel('midi', '2026-07-13', nowAfternoon) === 'Ce midi' &&
    PU.formatDueTimePeriodLabel('apres-midi', '2026-07-13', nowAfternoon) ===
      'Cet apr\u00e8s-midi' &&
    PU.formatDueTimePeriodLabel('soir', '2026-07-13', nowAfternoon) === 'Ce soir'
);
check(
  'period label tomorrow',
  PU.formatDueTimePeriodLabel('matin', addDaysIso('2026-07-13', 1), nowAfternoon) ===
    'Demain matin' &&
    PU.formatDueTimePeriodLabel('midi', addDaysIso('2026-07-13', 1), nowAfternoon) ===
      'Demain midi' &&
    PU.formatDueTimePeriodLabel('soir', addDaysIso('2026-07-13', 1), nowAfternoon) ===
      'Demain soir'
);
check(
  'period label yesterday',
  PU.formatDueTimePeriodLabel('matin', addDaysIso('2026-07-13', -1), nowAfternoon) ===
    'Hier matin' &&
    PU.formatDueTimePeriodLabel('midi', addDaysIso('2026-07-13', -1), nowAfternoon) ===
      'Hier midi' &&
    PU.formatDueTimePeriodLabel('soir', addDaysIso('2026-07-13', -1), nowAfternoon) ===
      'Hier soir'
);
check(
  'period label upcoming weekday',
  PU.formatDueTimePeriodLabel('soir', addDaysIso('2026-07-13', 3), nowAfternoon) ===
    'Jeudi soir'
);
check(
  'period label bare without date',
  PU.formatDueTimePeriodLabel('matin', '', nowAfternoon) === 'Matin'
);
check(
  'human readable includes period clock time',
  (function () {
    var human = PU.formatDueDateHumanReadable(
      addDaysIso('2026-07-13', 1),
      '18:00',
      nowAfternoon
    );
    return human.primary === 'Demain soir \u00e0 18 h' || human.secondary === 'Demain soir \u00e0 18 h';
  })()
);
check(
  'human readable this evening includes clock',
  (function () {
    var human = PU.formatDueDateHumanReadable('2026-07-13', '18:00', nowAfternoon);
    return (
      human.primary.indexOf('18 h') !== -1 ||
      (human.secondary && human.secondary.indexOf('18 h') !== -1)
    );
  })()
);
check(
  'human readable past today uses Il y a not Aujourd\'hui',
  (function () {
    var human = PU.formatDueDateHumanReadable('2026-07-13', '13:00', nowAfternoon);
    return (
      human.primary === 'Il y a une heure (En retard)' &&
      !human.secondary &&
      human.primary.indexOf('Aujourd') === -1
    );
  })()
);
check(
  'human readable past date-only uses relative day',
  (function () {
    var human = PU.formatDueDateHumanReadable(
      addDaysIso('2026-07-13', -1),
      '',
      nowAfternoon
    );
    return human.primary === 'Hier (En retard)' && !human.secondary;
  })()
);
check(
  'time display defaults to 24h',
  (function () {
    PU.setTimeFormat('24');
    return (
      PU.getTimeFormat() === '24' &&
      PU.formatDueTimeDisplay('14:30') === '14:30' &&
      PU.formatDueTimeCompactFr('14:30') === '14 h 30'
    );
  })()
);
check(
  'time display 12h mode',
  (function () {
    PU.setTimeFormat('12');
    var ok =
      PU.isHour12() === true &&
      PU.formatDueTimeDisplay('14:30') === '2:30 PM' &&
      PU.formatDueTimeDisplay('09:00') === '9:00 AM' &&
      PU.formatDueTimeDisplay('00:15') === '12:15 AM' &&
      PU.formatDueTimeCompactFr('18:00') === '6 h PM';
    PU.setTimeFormat('24');
    return ok;
  })()
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
    return normalized && normalized.dueDate === '2026-07-16' && normalized.dueTime == null;
  })()
);
check(
  'normalizeInputs keeps dueDate and dueTime',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 3,
      impact: 3,
      ease: 2,
      dueDate: '2026-07-16',
      dueTime: '14:30',
    });
    return (
      normalized &&
      normalized.dueDate === '2026-07-16' &&
      normalized.dueTime === '14:30'
    );
  })()
);
check(
  'normalizeInputs omits dueTime without dueDate',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 3,
      impact: 3,
      ease: 2,
      dueTime: '14:30',
    });
    return normalized && normalized.dueDate == null && normalized.dueTime == null;
  })()
);
check(
  'normalizeInputs omits empty dueDate (toggle off)',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 3,
      impact: 3,
      ease: 2,
      dueDate: '',
      dueTime: '14:30',
    });
    return (
      normalized &&
      normalized.dueDate == null &&
      normalized.dueTime == null
    );
  })()
);
check(
  'normalizeInputs migrates legacy blockedLink to blockedLinks',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReasons: ['En attente d\'une autre t\u00e2che'],
      blockedLink: { type: 'subtask', id: 'sub-1' }
    });
    return (
      normalized &&
      Array.isArray(normalized.blockedLinks) &&
      normalized.blockedLinks.length === 1 &&
      normalized.blockedLinks[0].type === 'subtask' &&
      normalized.blockedLinks[0].id === 'sub-1' &&
      normalized.blockedLink &&
      normalized.blockedLink.id === 'sub-1' &&
      Array.isArray(normalized.blockedReasons) &&
      normalized.blockedReasons[0] === 'En attente d\'une autre t\u00e2che' &&
      normalized.blockedReason == null
    );
  })()
);
check(
  'normalizeInputs migrates legacy blockedReason string',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReason: 'En attente de budget'
    });
    return (
      normalized &&
      Array.isArray(normalized.blockedReasons) &&
      normalized.blockedReasons.length === 1 &&
      normalized.blockedReasons[0] === 'En attente de budget' &&
      normalized.blockedReason == null
    );
  })()
);
check(
  'normalizeInputs keeps multiple blockedReasons and blockedLinks',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReasons: [
        'En attente de budget',
        'En attente d\'une autre t\u00e2che',
        'En attente de budget'
      ],
      blockedLinks: [
        { type: 'subtask', id: 'sub-9' },
        { type: 'subtask', id: 'sub-9' },
        { type: 'subtask', id: 'sub-10', label: 'Livrer le brief' }
      ]
    });
    return (
      normalized &&
      normalized.blockedReasons &&
      normalized.blockedReasons.length === 2 &&
      normalized.blockedReasons[0] === 'En attente de budget' &&
      normalized.blockedReasons[1] === 'En attente d\'une autre t\u00e2che' &&
      normalized.blockedLinks &&
      normalized.blockedLinks.length === 2 &&
      normalized.blockedLinks[0].id === 'sub-9' &&
      normalized.blockedLinks[1].id === 'sub-10' &&
      normalized.blockedLinks[1].label === 'Livrer le brief' &&
      normalized.blockedLink &&
      normalized.blockedLink.id === 'sub-9'
    );
  })()
);
check(
  'normalizeInputs keeps links and injects waiting-other reason',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      blockedReasons: ['En attente de budget'],
      blockedLink: { type: 'subtask', id: 'sub-1' }
    });
    return (
      normalized &&
      Array.isArray(normalized.blockedLinks) &&
      normalized.blockedLinks[0].id === 'sub-1' &&
      normalized.blockedReasons &&
      normalized.blockedReasons.indexOf('En attente d\'une autre t\u00e2che') !== -1
    );
  })()
);
check(
  'normalizeInputs accepts blockedSubtaskId alias',
  (function () {
    var normalized = PT.normalizeInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      blockedReasons: ['En attente d\'une autre t\u00e2che'],
      blockedSubtaskId: 'sub-2'
    });
    return (
      normalized &&
      normalized.blockedLinks &&
      normalized.blockedLinks[0].type === 'subtask' &&
      normalized.blockedLinks[0].id === 'sub-2' &&
      normalized.blockedLink &&
      normalized.blockedLink.id === 'sub-2'
    );
  })()
);
check(
  'clearBlockedFromInputs strips blockedLinks',
  (function () {
    var cleared = PT.clearBlockedFromInputs({
      urgency: 2,
      impact: 2,
      ease: 3,
      enAttente: true,
      blockedReasons: ['En attente d\'une autre t\u00e2che'],
      blockedLinks: [{ type: 'subtask', id: 'sub-1' }],
      blockedLink: { type: 'subtask', id: 'sub-1' }
    });
    return (
      cleared.enAttente == null &&
      cleared.blockedReason == null &&
      cleared.blockedReasons == null &&
      cleared.blockedLink == null &&
      cleared.blockedLinks == null
    );
  })()
);
check(
  'formatBlockedWaitingOnLabel humanizes task name',
  (function () {
    return (
      PU.formatBlockedWaitingOnLabel('Brief client') ===
        'En attente de brief client' &&
      PU.formatBlockedWaitingOnLabel('Essayer le connecteur Antidote') ===
        'En attente d\'essayer le connecteur Antidote' &&
      PU.formatBlockedWaitingOnLabel('') === 'En attente de t\u00e2che inconnue'
    );
  })()
);
check(
  'formatBlockedReasonsSummary expands waiting links with labels',
  (function () {
    var summary = PU.formatBlockedReasonsSummary(
      ['En attente d\'une autre t\u00e2che'],
      {
        links: [{ type: 'subtask', id: 'a', label: 'QA' }],
        maxLength: 80
      }
    );
    var withExplicit = PU.formatBlockedReasonsSummary(
      ['En attente d\'une autre t\u00e2che', 'Budget'],
      {
        links: [{ type: 'subtask', id: 'a', label: 'QA' }],
        maxLength: 80
      }
    );
    return (
      /en attente de qa/i.test(summary) &&
      summary.indexOf('En attente d\'une autre t\u00e2che') === -1 &&
      summary.indexOf('En attente de (') === -1 &&
      withExplicit.indexOf('Budget') !== -1 &&
      !/en attente de qa/i.test(withExplicit)
    );
  })()
);
check(
  'normalizeBlockedLinks migrates single blockedLink',
  (function () {
    var links = PU.normalizeBlockedLinks({
      blockedLink: { type: 'subtask', id: 'x1', label: 'Alpha' }
    });
    return (
      links.length === 1 &&
      links[0].id === 'x1' &&
      links[0].label === 'Alpha'
    );
  })()
);
check(
  'formatBlockedReasonsSummary uses comma or +N',
  (function () {
    var one = PU.formatBlockedReasonsSummary(['En attente de budget']);
    var two = PU.formatBlockedReasonsSummary([
      'Budget',
      'Approbation'
    ]);
    var many = PU.formatBlockedReasonsSummary(
      [
        'En attente d\'une r\u00e9ponse tr\u00e8s longue',
        'En attente de budget',
        'En attente d\'une approbation'
      ],
      { maxLength: 20 }
    );
    return (
      one === 'En attente de budget' &&
      two === 'Budget, Approbation' &&
      many === 'En attente d\'une r\u00e9ponse tr\u00e8s longue +2'
    );
  })()
);
check(
  'withDueDateDisplay skips countdown without dueDate',
  (function () {
    var display = PU.withDueDateDisplay({ label: 'Urgente', tierI: 1 }, { dueDate: '' });
    return display && display.dueCountdown == null && display.dueDate == null;
  })()
);
check(
  'withDueDateDisplay attaches dueTime when set',
  (function () {
    var display = PU.withDueDateDisplay(
      { label: 'Urgente', tierI: 1 },
      { dueDate: '2026-07-16', dueTime: '14:30' }
    );
    return (
      display &&
      display.dueDate === '2026-07-16' &&
      display.dueTime === '14:30' &&
      typeof display.dueCountdown === 'string' &&
      display.dueCountdown.length > 0
    );
  })()
);
check(
  'withDueDateDisplay marks past dueDate as duePast',
  (function () {
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(today.getDate());
    if (day.length < 2) day = '0' + day;
    var display = PU.withDueDateDisplay(
      { label: 'Urgente', tierI: 1 },
      { dueDate: addDaysIso(y + '-' + m + '-' + day, -2) }
    );
    return display && display.duePast === true && !display.blocked;
  })()
);
check(
  'withDueDateDisplay duePast false when dueDate in future',
  (function () {
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(today.getDate());
    if (day.length < 2) day = '0' + day;
    var display = PU.withDueDateDisplay(
      { label: 'Urgente', tierI: 1 },
      { dueDate: addDaysIso(y + '-' + m + '-' + day, 5) }
    );
    return display && display.duePast === false;
  })()
);
check(
  'withDueDateDisplay duePast when dueTime already passed today',
  (function () {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(now.getDate());
    if (day.length < 2) day = '0' + day;
    var past = new Date(now.getTime() - 90 * 60000);
    var hh = String(past.getHours());
    if (hh.length < 2) hh = '0' + hh;
    var mm = String(past.getMinutes());
    if (mm.length < 2) mm = '0' + mm;
    var display = PU.withDueDateDisplay(
      { label: 'Urgente', tierI: 1 },
      { dueDate: y + '-' + m + '-' + day, dueTime: hh + ':' + mm }
    );
    return display && display.duePast === true;
  })()
);
check(
  'resolveDisplay sets duePast without requiring blocked',
  (function () {
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(today.getDate());
    if (day.length < 2) day = '0' + day;
    var result = PU.calc.baseline({ urgency: 3, impact: 3, ease: 2 });
    var display = PU.resolveDisplay(result, {
      urgency: 3,
      impact: 3,
      ease: 2,
      dueDate: addDaysIso(y + '-' + m + '-' + day, -1),
      enAttente: false,
    });
    return display.duePast === true && !display.blocked;
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
check(
  'resolveDisplay attaches dueCountdown with time',
  (function () {
    var now = new Date();
    var in45 = new Date(now.getTime() + 45 * 60000);
    var y = in45.getFullYear();
    var m = String(in45.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    var day = String(in45.getDate());
    if (day.length < 2) day = '0' + day;
    var hh = String(in45.getHours());
    if (hh.length < 2) hh = '0' + hh;
    var mm = String(in45.getMinutes());
    if (mm.length < 2) mm = '0' + mm;
    var due = y + '-' + m + '-' + day;
    var time = hh + ':' + mm;
    var result = PU.calc.baseline({ urgency: 3, impact: 3, ease: 2 });
    var display = PU.resolveDisplay(result, {
      urgency: 3,
      impact: 3,
      ease: 2,
      dueDate: due,
      dueTime: time,
    });
    return (
      display.dueDate === due &&
      display.dueTime === time &&
      display.dueCountdown === PU.formatDueCountdown(due, null, time)
    );
  })()
);
check(
  'shortTierLabel keeps countdown suffix',
  PU.shortTierLabel('Urgente (3 jours restants)') === 'Urg (3 jours restants)'
);
check(
  'blocked badge ignores due countdown in board text',
  (function () {
    var text = PT.formatBadgeText(
      {
        tierLabel: 'Urgente',
        label: 'Urgente',
        tierI: 1,
        blocked: true,
        blockedReasons: ['En attente d\'une autre t\u00e2che'],
        dueDate: addDaysIso('2026-07-13', 3),
        dueCountdown: '3 jours restants',
      },
      false
    );
    return (
      text.indexOf('3 jours restants') === -1 &&
      text.indexOf('En attente d\'une autre t\u00e2che') !== -1
    );
  })()
);
check(
  'blocked badge uses waiting-on task names from links',
  (function () {
    var text = PT.formatBadgeText(
      {
        tierLabel: 'Urgente',
        label: 'Urgente',
        tierI: 1,
        blocked: true,
        blockedReasons: ['En attente d\'une autre t\u00e2che'],
        blockedLinks: [
          { type: 'subtask', id: 's1', label: 'Revue code' },
          { type: 'subtask', id: 's2', label: 'Design' }
        ]
      },
      false
    );
    return (
      /en attente de revue code/i.test(text) &&
      text.indexOf('En attente d\'une autre t\u00e2che') === -1 &&
      text.indexOf('En attente de (') === -1
    );
  })()
);
check(
  'blocked badge summarizes multiple reasons',
  (function () {
    var text = PT.formatBadgeText(
      {
        tierLabel: 'Urgente',
        label: 'Urgente',
        tierI: 1,
        blocked: true,
        blockedReasons: ['Budget', 'Approbation', 'Mat\u00e9riel'],
      },
      false
    );
    return (
      text.indexOf('Budget') !== -1 &&
      (text.indexOf('+2') !== -1 || text.indexOf('Approbation') !== -1)
    );
  })()
);

check('syncCardDueWithTrello export', typeof PT.syncCardDueWithTrello === 'function');
check('getCardDue export', typeof PT.getCardDue === 'function');
check('setCardDue export', typeof PT.setCardDue === 'function');
check('CARD_DUE_SYNCED_KEY', PT.CARD_DUE_SYNCED_KEY === 'cardDueSyncedIso');
check('trelloDueIsoFromParts export', typeof PU.trelloDueIsoFromParts === 'function');
check('parseTrelloDueToParts export', typeof PU.parseTrelloDueToParts === 'function');
check('canonicalizeTrelloDueIso export', typeof PU.canonicalizeTrelloDueIso === 'function');
check('inputsToTrelloDueIso export', typeof PU.inputsToTrelloDueIso === 'function');

check(
  'trelloDueIsoFromParts date-only is local midnight ISO',
  (function () {
    var iso = PU.trelloDueIsoFromParts('2026-07-20', '');
    var parts = PU.parseTrelloDueToParts(iso);
    return (
      typeof iso === 'string' &&
      iso.indexOf('T') !== -1 &&
      parts &&
      parts.dueDate === '2026-07-20' &&
      !parts.dueTime
    );
  })()
);

check(
  'trelloDueIsoFromParts with dueTime round-trips',
  (function () {
    var iso = PU.trelloDueIsoFromParts('2026-07-20', '14:30');
    var parts = PU.parseTrelloDueToParts(iso);
    return parts && parts.dueDate === '2026-07-20' && parts.dueTime === '14:30';
  })()
);

check(
  'canonicalizeTrelloDueIso matches parts round-trip',
  (function () {
    var iso = PU.trelloDueIsoFromParts('2026-08-01', '09:00');
    return PU.canonicalizeTrelloDueIso(iso) === iso;
  })()
);

check(
  'inputsToTrelloDueIso empty without dueDate',
  PU.inputsToTrelloDueIso({ urgency: 2, impact: 2, ease: 3 }) === ''
);

check(
  'inputsToTrelloDueIso uses dueDate and dueTime',
  PU.inputsToTrelloDueIso({
    urgency: 2,
    impact: 2,
    ease: 3,
    dueDate: '2026-07-20',
    dueTime: '14:30',
  }) === PU.trelloDueIsoFromParts('2026-07-20', '14:30')
);

check(
  'parseTrelloDueToParts rejects invalid',
  PU.parseTrelloDueToParts('not-a-date') == null && PU.parseTrelloDueToParts('') == null
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll badge checks passed');
process.exit(bad ? 1 : 0);
