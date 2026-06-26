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
var blockedDisplay = { blocked: true, blockedReason: 'En attente d\'une approbation', tierI: 1, tierLabel: 'Urgent' };

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
  PT.formatBadgeText(blockedDisplay, false) === sandbox.PriorityUI.formatBlockedBadgeText(blockedDisplay.blockedReason)
);
check(
  'blocked complete uses Complété wrapper',
  PT.formatBadgeText(blockedDisplay, true) === '\u2713 Compl\u00e9t\u00e9 (T\u00e2che bloqu\u00e9 \u2014 En attente d\'une approbation)'
);
check(
  'blocked complete badge color',
  PT.buildCardFaceBadge(blockedDisplay, true).color === 'green'
);
check(
  'blocked incomplete badge color',
  PT.buildCardFaceBadge(blockedDisplay, false).color === 'pink'
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll badge checks passed');
process.exit(bad ? 1 : 0);
