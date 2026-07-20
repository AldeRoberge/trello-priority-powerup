// Goals / Objectifs verification — run: node sandbox/verify-goals.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { GoalsTrello: null };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'goals', 'goals-trello.js'), 'utf8'),
  sandbox
);

var GT = sandbox.GoalsTrello;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

if (!GT) {
  console.log('FAIL GoalsTrello failed to load');
  process.exit(1);
}

[
  'normalizeObjectif',
  'normalizeProject',
  'normalizeMetric',
  'normalizeMetricsCollection',
  'enforcePrimaryConstraint',
  'migrateLegacyGoals',
  'resolveHierarchyFromCache',
  'findProjectByMatch',
  'directionArrow',
  'formatMetricValue',
  'cardFaceBadges',
  'cardDetailBadges',
].forEach(function (name) {
  check('export ' + name, typeof GT[name] === 'function');
});

check('objectifs key', GT.OBJECTIFS_KEY === 'goals.objectifs');
check('projects key', GT.PROJECTS_KEY === 'goals.projects');
check('metrics key', GT.METRICS_KEY === 'goals.metrics');
check('card projectId key', GT.CARD_PROJECT_ID_KEY === 'goals.projectId');

var objectif = GT.normalizeObjectif({ name: '  Produire des vidéos de qualité  ' });
check(
  'normalize objectif trims name',
  objectif && objectif.name === 'Produire des vidéos de qualité' && !!objectif.id
);
check(
  'normalize objectif no complete',
  objectif && objectif.completed === undefined && objectif.complete === undefined
);
check('normalize objectif retired false', objectif && objectif.retired === false);

check('objectif requires name', GT.normalizeObjectif({ name: '  ' }) === null);

var project = GT.normalizeProject({ name: 'Production Vidéo', objectifId: objectif.id });
check('normalize project', project && project.objectifId === objectif.id);

check('project requires objectifId', GT.normalizeProject({ name: 'X' }) === null);

var legacyProject = GT.normalizeProject({ name: 'Legacy', missionId: objectif.id });
check(
  'normalize project accepts legacy missionId',
  legacyProject && legacyProject.objectifId === objectif.id && !legacyProject.missionId
);

var metricA = GT.normalizeMetric({
  name: 'Énergie',
  type: 'sentimental',
  direction: 'increase',
  measurement: 'manual',
  currentValue: 3,
  target: 5,
  scaleLabels: ['Très ennuyant', 'Très valorisant'],
  linkedGoalId: objectif.id,
  isPrimary: true,
});
check(
  'normalize metric sentimental',
  metricA && metricA.type === 'sentimental' && metricA.scaleLabels.length === 2
);
check('normalize metric primary', metricA && metricA.isPrimary === true);

var metricB = GT.normalizeMetric({
  name: 'Km',
  type: 'incremental',
  direction: 'hold',
  measurement: 'direct',
  currentValue: 10,
  linkedGoalId: objectif.id,
  isPrimary: true,
  dependsOn: [metricA.id, 'missing-id'],
});
check('hold is valid direction', metricB && metricB.direction === 'hold');

var dual = GT.normalizeMetricsCollection([
  metricA,
  Object.assign({}, metricB, { dependsOn: [metricA.id, 'missing-id'] }),
]);
var dualB = dual.find(function (m) {
  return m.name === 'Km';
});
check(
  'dependsOn drops unknown ids',
  dualB &&
    dualB.dependsOn &&
    dualB.dependsOn.indexOf(metricA.id) !== -1 &&
    dualB.dependsOn.indexOf('missing-id') === -1
);
var primaries = dual.filter(function (m) {
  return m.isPrimary && m.linkedGoalId === objectif.id;
});
check('normalizeMetricsCollection enforces one primary', primaries.length === 1);

var enforced = GT.enforcePrimaryConstraint(dual, objectif.id, metricB.id);
var primaryIds = enforced
  .filter(function (m) {
    return m.isPrimary;
  })
  .map(function (m) {
    return m.id;
  });
check(
  'enforcePrimaryConstraint sets exact primary',
  primaryIds.length === 1 && primaryIds[0] === metricB.id
);

var cleared = GT.enforcePrimaryConstraint(enforced, objectif.id, null);
check(
  'enforcePrimaryConstraint can clear primary',
  cleared.every(function (m) {
    return !m.isPrimary || m.linkedGoalId !== objectif.id;
  })
);

var cache = {
  objectifs: [Object.assign({}, objectif, { retired: true })],
  projects: [Object.assign({}, project, { retired: true })],
  metrics: [],
};
var hier = GT.resolveHierarchyFromCache(cache, project.id);
check('resolveHierarchy includes retired', !!(hier.objectif && hier.project));
check(
  'resolveHierarchy retired flags',
  hier.objectif.retired === true && hier.project.retired === true
);
check('resolveHierarchy has no vision/mission', hier.vision == null && hier.mission == null);

check(
  'direction arrows',
  GT.directionArrow('increase') === '\u2191' &&
    GT.directionArrow('decrease') === '\u2193' &&
    GT.directionArrow('hold') === '\u2194'
);

var badge = GT.buildCardFaceBadge(hier);
check('face badge uses project name', badge && badge.text === project.name);

var matched = GT.findProjectByMatch(cache.projects, { matchText: 'production' });
check('findProjectByMatch fuzzy', matched && matched.id === project.id);

var visionId = 'vis-1';
var missionId = 'mis-1';
var migrated = GT.migrateLegacyGoals(
  [{ id: visionId, name: 'Vivre longtemps', retired: false }],
  [{ id: missionId, name: 'Santé', visionId: visionId, retired: false }],
  [{ id: 'proj-1', name: 'Sport 2026', missionId: missionId, retired: false }]
);
check(
  'migrate promotes mission to objectif',
  migrated.objectifs.length === 1 &&
    migrated.objectifs[0].id === missionId &&
    migrated.objectifs[0].name === 'Santé'
);
check(
  'migrate reparents project to objectifId',
  migrated.projects.length === 1 &&
    migrated.projects[0].objectifId === missionId &&
    !migrated.projects[0].missionId
);

var visionOnly = GT.migrateLegacyGoals(
  [{ id: visionId, name: 'Ambition', retired: false }],
  [],
  []
);
check(
  'migrate falls back to visions when no missions',
  visionOnly.objectifs.length === 1 && visionOnly.objectifs[0].name === 'Ambition'
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll goals checks passed');
process.exit(bad ? 1 : 0);
