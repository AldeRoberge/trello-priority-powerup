// Goals / Metrics verification — run: node sandbox/verify-goals.js
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
  'normalizeVision',
  'normalizeMission',
  'normalizeProject',
  'normalizeMetric',
  'normalizeMetricsCollection',
  'enforcePrimaryConstraint',
  'resolveHierarchyFromCache',
  'findProjectByMatch',
  'directionArrow',
  'formatMetricValue',
  'cardFaceBadges',
  'cardDetailBadges',
].forEach(function (name) {
  check('export ' + name, typeof GT[name] === 'function');
});

check('visions key', GT.VISIONS_KEY === 'goals.visions');
check('missions key', GT.MISSIONS_KEY === 'goals.missions');
check('projects key', GT.PROJECTS_KEY === 'goals.projects');
check('metrics key', GT.METRICS_KEY === 'goals.metrics');
check('card projectId key', GT.CARD_PROJECT_ID_KEY === 'goals.projectId');

var vision = GT.normalizeVision({ name: '  Vivre longtemps  ' });
check('normalize vision trims name', vision && vision.name === 'Vivre longtemps' && !!vision.id);
check('normalize vision no complete', vision && vision.completed === undefined && vision.complete === undefined);
check('normalize vision retired false', vision && vision.retired === false);

check('vision requires name', GT.normalizeVision({ name: '  ' }) === null);

var mission = GT.normalizeMission({ name: 'Santé', visionId: vision.id });
check('normalize mission', mission && mission.visionId === vision.id);

check('mission requires visionId', GT.normalizeMission({ name: 'X' }) === null);

var project = GT.normalizeProject({ name: 'Sport 2026', missionId: mission.id });
check('normalize project', project && project.missionId === mission.id);

var metricA = GT.normalizeMetric({
  name: 'Énergie',
  type: 'sentimental',
  direction: 'increase',
  measurement: 'manual',
  currentValue: 3,
  target: 5,
  scaleLabels: ['Très ennuyant', 'Très valorisant'],
  linkedGoalId: mission.id,
  isPrimary: true,
});
check('normalize metric sentimental', metricA && metricA.type === 'sentimental' && metricA.scaleLabels.length === 2);
check('normalize metric primary', metricA && metricA.isPrimary === true);

var metricB = GT.normalizeMetric({
  name: 'Km',
  type: 'incremental',
  direction: 'hold',
  measurement: 'direct',
  currentValue: 10,
  linkedGoalId: mission.id,
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
  dualB && dualB.dependsOn && dualB.dependsOn.indexOf(metricA.id) !== -1 && dualB.dependsOn.indexOf('missing-id') === -1
);
var primaries = dual.filter(function (m) {
  return m.isPrimary && m.linkedGoalId === mission.id;
});
check('normalizeMetricsCollection enforces one primary', primaries.length === 1);

var enforced = GT.enforcePrimaryConstraint(dual, mission.id, metricB.id);
var primaryIds = enforced.filter(function (m) {
  return m.isPrimary;
}).map(function (m) {
  return m.id;
});
check('enforcePrimaryConstraint sets exact primary', primaryIds.length === 1 && primaryIds[0] === metricB.id);

var cleared = GT.enforcePrimaryConstraint(enforced, mission.id, null);
check('enforcePrimaryConstraint can clear primary', cleared.every(function (m) {
  return !m.isPrimary || m.linkedGoalId !== mission.id;
}));

var cache = {
  visions: [vision],
  missions: [Object.assign({}, mission, { retired: true })],
  projects: [Object.assign({}, project, { retired: true })],
  metrics: [],
};
var hier = GT.resolveHierarchyFromCache(cache, project.id);
check('resolveHierarchy includes retired', !!(hier.vision && hier.mission && hier.project));
check('resolveHierarchy retired flags', hier.mission.retired === true && hier.project.retired === true);

check('direction arrows', GT.directionArrow('increase') === '\u2191' && GT.directionArrow('decrease') === '\u2193' && GT.directionArrow('hold') === '\u2194');

var badge = GT.buildCardFaceBadge(hier);
check('face badge uses project name', badge && badge.text === project.name);

var matched = GT.findProjectByMatch(cache.projects, { matchText: 'sport' });
check('findProjectByMatch fuzzy', matched && matched.id === project.id);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll goals checks passed');
process.exit(bad ? 1 : 0);
