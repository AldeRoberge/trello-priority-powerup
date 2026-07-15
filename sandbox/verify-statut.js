// Statut matching verification — run: node sandbox/verify-statut.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { window: {}, StatutMatch: null, StatutTrello: null };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'statut', 'statut-match.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'statut', 'statut-trello.js'), 'utf8'),
  sandbox
);

var SM = sandbox.StatutMatch || (sandbox.window && sandbox.window.StatutMatch);
var ST = sandbox.StatutTrello || (sandbox.window && sandbox.window.StatutTrello);
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

check('StatutMatch export', !!SM);
check('StatutTrello export', !!ST);

check('normalizeName accents', SM.normalizeName('À faire') === 'a faire');
check('normalizeName punctuation', SM.normalizeName('To-Do!') === 'to-do' || SM.normalizeName('To-Do!') === 'to do');

check(
  'levenshtein identical',
  SM.levenshtein('bloque', 'bloque') === 0
);
check(
  'levenshtein nearby',
  SM.levenshtein('bloque', 'blocked') <= 2
);

var todo = SM.matchListToCategory('À faire');
check('match À faire → unstarted', !!(todo && todo.key === 'unstarted'));

var blocked = SM.matchListToCategory('Bloqué');
check('match Bloqué → blocked', !!(blocked && blocked.key === 'blocked'));

var done = SM.matchListToCategory('Done');
check('match Done → completed', !!(done && done.key === 'completed'));

var progress = SM.matchListToCategory('In Progress');
check('match In Progress → started', !!(progress && progress.key === 'started'));

var nonsense = SM.matchListToCategory('XYZ123QQQ');
check('match nonsense → null', nonsense == null);

var detected = SM.detectFromLists([
  { id: '1', name: 'En attente' },
  { id: '2', name: 'À faire' },
  { id: '3', name: 'En cours' },
  { id: '4', name: 'Bloqué' },
  { id: '5', name: 'Terminé' },
]);

check('detect backlog/triage for En attente', detected.listCategories['1'] === 'backlog' || detected.listCategories['1'] === 'triage');
check('detect unstarted', detected.listCategories['2'] === 'unstarted');
check('detect started', detected.listCategories['3'] === 'started');
check('detect blocked', detected.listCategories['4'] === 'blocked');
check('detect completed', detected.listCategories['5'] === 'completed');
check('roleLists.blocked', detected.roleLists.blocked === '4');
check('roleLists.completed', detected.roleLists.completed === '5');

var normalized = ST.normalizeSettings({
  initialized: true,
  listCategories: { a: 'started', b: 'nope' },
  roleLists: { blocked: '4' },
  autoMoveBlocked: false,
  showUnassigned: true,
});
check('normalize drops invalid category', normalized.listCategories.b === null);
check('normalize keeps started', normalized.listCategories.a === 'started');
check('normalize autoMoveBlocked false', normalized.autoMoveBlocked === false);
check('normalize autoMoveCompleted default true', normalized.autoMoveCompleted === true);
check('normalize showUnassigned true', normalized.showUnassigned === true);
check(
  'normalize showUnassigned default false',
  ST.normalizeSettings({}).showUnassigned === false
);

var groups = ST.groupListsByCategory(
  [
    { id: '2', name: 'À faire' },
    { id: '4', name: 'Bloqué' },
    { id: 'x', name: 'Misc' },
  ],
  {
    listCategories: { '2': 'unstarted', '4': 'blocked', x: null },
  }
);
check('groupListsByCategory has groups', groups.length >= 2);
var uncat = groups.filter(function (g) { return g.key === '_none'; })[0];
check('uncategorized group', !!(uncat && uncat.lists.length === 1));

var groupsHidden = ST.groupListsByCategory(
  [
    { id: '2', name: 'À faire' },
    { id: 'x', name: 'Misc' },
  ],
  { listCategories: { '2': 'unstarted', x: null } },
  { includeUnassigned: false }
);
var uncatHidden = groupsHidden.filter(function (g) { return g.key === '_none'; })[0];
check('includeUnassigned false hides uncategorized', !uncatHidden);

check('categoryStyle completed green', !!(SM.categoryStyle && SM.categoryStyle('completed').icon === 'check'));
check('categoryStyle blocked ban', SM.categoryStyle('blocked').icon === 'ban');
check('categoryStyle started hammer', SM.categoryStyle('started').icon === 'hammer');

// --- Previous Statut restore (Progrès leaves 100%) ---
check('STATUT_PREVIOUS_LIST_KEY export', ST.STATUT_PREVIOUS_LIST_KEY === 'statutPreviousListId');
check('isCompletedListId export', typeof ST.isCompletedListId === 'function');
check('shouldCapturePreviousListId export', typeof ST.shouldCapturePreviousListId === 'function');
check('firstFallbackIncompleteListId export', typeof ST.firstFallbackIncompleteListId === 'function');
check('resolvePreviousListRestoreTarget export', typeof ST.resolvePreviousListRestoreTarget === 'function');

var restoreSettings = {
  listCategories: {
    '1': 'backlog',
    '2': 'unstarted',
    '3': 'started',
    '4': 'blocked',
    '5': 'completed',
  },
  roleLists: { blocked: '4', completed: '5' },
};
var restoreLists = [
  { id: '1', name: 'En attente' },
  { id: '2', name: 'À faire' },
  { id: '3', name: 'En cours' },
  { id: '4', name: 'Bloqué' },
  { id: '5', name: 'Terminé' },
];

check('isCompletedListId by category', ST.isCompletedListId('5', restoreSettings) === true);
check('isCompletedListId by role', ST.isCompletedListId('5', {
  listCategories: {},
  roleLists: { completed: '5' },
}) === true);
check('isCompletedListId started false', ST.isCompletedListId('3', restoreSettings) === false);

check(
  'shouldCapture started list',
  ST.shouldCapturePreviousListId('3', restoreSettings) === true
);
check(
  'shouldCapture blocked list',
  ST.shouldCapturePreviousListId('4', restoreSettings) === true
);
check(
  'capture skips completed → completed (no overwrite with Terminé)',
  ST.shouldCapturePreviousListId('5', restoreSettings) === false
);
check(
  'capture skips empty list id',
  ST.shouldCapturePreviousListId(null, restoreSettings) === false
);

check(
  'fallback prefers started',
  ST.firstFallbackIncompleteListId(restoreLists, restoreSettings) === '3'
);
check(
  'fallback skips to unstarted when no started',
  ST.firstFallbackIncompleteListId(restoreLists, {
    listCategories: {
      '1': 'backlog',
      '2': 'unstarted',
      '5': 'completed',
    },
    roleLists: { completed: '5' },
  }) === '2'
);
check(
  'fallback skips to backlog when no started/unstarted',
  ST.firstFallbackIncompleteListId(restoreLists, {
    listCategories: {
      '1': 'backlog',
      '4': 'blocked',
      '5': 'completed',
    },
    roleLists: { completed: '5' },
  }) === '1'
);
check(
  'fallback never invents blocked',
  ST.firstFallbackIncompleteListId(restoreLists, {
    listCategories: {
      '4': 'blocked',
      '5': 'completed',
    },
    roleLists: { completed: '5' },
  }) === null
);

check(
  'restore no-ops when current list is not completed',
  ST.resolvePreviousListRestoreTarget('3', '2', restoreLists, restoreSettings) === null
);
check(
  'restore uses stored previous when valid',
  ST.resolvePreviousListRestoreTarget('5', '3', restoreLists, restoreSettings) === '3'
);
check(
  'restore uses stored blocked previous',
  ST.resolvePreviousListRestoreTarget('5', '4', restoreLists, restoreSettings) === '4'
);
check(
  'restore falls back when stored missing',
  ST.resolvePreviousListRestoreTarget('5', null, restoreLists, restoreSettings) === '3'
);
check(
  'restore falls back when stored list deleted',
  ST.resolvePreviousListRestoreTarget('5', 'gone', restoreLists, restoreSettings) === '3'
);
check(
  'restore ignores stored completed id',
  ST.resolvePreviousListRestoreTarget('5', '5', restoreLists, restoreSettings) === '3'
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll statut checks passed');
process.exit(bad ? 1 : 0);
