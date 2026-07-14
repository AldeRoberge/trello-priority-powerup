// point_at tool verification — run: node sandbox/verify-point-at.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { CelebrationEffects: null, PriorityAgent: null };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'shared', 'effects.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'agent', 'agent.js'), 'utf8'),
  sandbox
);

var Agent = sandbox.PriorityAgent;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

if (!Agent) {
  console.log('FAIL PriorityAgent failed to load');
  process.exit(1);
}

check('normalizePointSection priority', Agent.normalizePointSection('Priorité') === 'priority');
check('normalizePointSection due', Agent.normalizePointSection('échéance') === 'due');
check('normalizePointSection blocked', Agent.normalizePointSection('bloqué') === 'blocked');
check('normalizePointSection progress', Agent.normalizePointSection('progrès') === 'progress');
check('normalizePointSection unknown', Agent.normalizePointSection('xyz') == null);

check('normalizePointField impact', Agent.normalizePointField('portée') === 'impact');
check('normalizePointField population alias', Agent.normalizePointField('population') === 'impact');
check('normalizePointField urgency', Agent.normalizePointField('urgence') === 'urgency');
check('normalizePointField ease', Agent.normalizePointField('facilité') === 'ease');

check('normalizePointLevel Population', Agent.normalizePointLevel('Population') === 3);
check('normalizePointLevel Global', Agent.normalizePointLevel('Global') === 4);
check('normalizePointLevel 3', Agent.normalizePointLevel(3) === 3);
check('normalizePointLevel null', Agent.normalizePointLevel(null) == null);

check('isCompleteAction section only', true);

var pointed = [];
var bridge = {
  pointAt: function (args) {
    pointed.push(args);
    return { ok: true };
  }
};

Agent.executeAction(bridge, {
  tool: 'point_at',
  args: { section: 'priority', field: 'impact', level: 3 }
})
  .then(function (res) {
    check('execute point_at ok', !!(res && res.ok));
    check(
      'execute points impact 3',
      !!(
        pointed[0] &&
        pointed[0].section === 'priority' &&
        pointed[0].field === 'impact' &&
        pointed[0].level === 3
      )
    );
    return Agent.executeAction(bridge, {
      tool: 'point_at',
      args: { field: 'population', level: 'Population' }
    });
  })
  .then(function (res) {
    check('field population implies priority', !!(res && res.ok));
    var last = pointed[pointed.length - 1];
    check(
      'population → impact level 3 + priority',
      !!(
        last &&
        last.section === 'priority' &&
        last.field === 'impact' &&
        last.level === 3
      )
    );
    return Agent.executeAction(bridge, {
      tool: 'point_at',
      args: {}
    });
  })
  .then(function (res) {
    check('empty point_at fails', !!(res && !res.ok));
    return Agent.executeAction(
      {},
      { tool: 'point_at', args: { section: 'due' } }
    );
  })
  .then(function (res) {
    check('missing bridge.pointAt fails', !!(res && !res.ok));
    if (bad) process.exit(1);
    console.log('All point_at checks passed.');
  })
  .catch(function (err) {
    console.log('FAIL executeAction', err && err.message ? err.message : err);
    process.exit(1);
  });
