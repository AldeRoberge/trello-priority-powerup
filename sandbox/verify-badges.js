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

var PT = sandbox.PriorityTrello;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

var urgentDisplay = { tierLabel: 'Urgent', label: 'Urgent', tierI: 1 };
var prioritaireDisplay = { tierLabel: 'Prioritaire', label: 'Prioritaire', tierI: 2 };
var blockedDisplay = { blocked: true, blockedReason: 'En attente d\'une approbation', tierI: 1, tierLabel: 'Urgent' };
var critiqueBlockedDisplay = {
  blocked: true,
  blockedReason: 'En attente d\'une r\u00e9ponse',
  tierI: 0,
  tierLabel: 'Critique'
};

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
  'incomplete urgent badge color',
  PT.buildCardFaceBadge(urgentDisplay, false).color === 'orange'
);
check(
  'incomplete prioritaire badge color',
  PT.buildCardFaceBadge(prioritaireDisplay, false).color === 'yellow'
);
check(
  'urgent and prioritaire badge colors differ',
  PT.buildCardFaceBadge(urgentDisplay, false).color !==
    PT.buildCardFaceBadge(prioritaireDisplay, false).color
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
    '\u2298 T\u00e2che urgente bloqu\u00e9e \u2014 En attente d\'une approbation'
);
check(
  'critique blocked incomplete badge',
  PT.formatBadgeText(critiqueBlockedDisplay, false) ===
    '\u2298 T\u00e2che critique bloqu\u00e9e \u2014 En attente d\'une r\u00e9ponse'
);
check(
  'blocked board badge has icon',
  PT.buildCardFaceBadge(blockedDisplay, false).icon != null &&
    PT.buildCardFaceBadge(blockedDisplay, false).monochrome === false
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
  PT.buildCardFaceBadge(blockedDisplay, false).color === 'orange'
);
check(
  'critique blocked incomplete badge color',
  PT.buildCardFaceBadge(critiqueBlockedDisplay, false).color === 'red'
);
check(
  'blocked dot is circle-slash only',
  PT.tierBadgeDot(blockedDisplay, false) === '\u2298'
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll badge checks passed');
process.exit(bad ? 1 : 0);
