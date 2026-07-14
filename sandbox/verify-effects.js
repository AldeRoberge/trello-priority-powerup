// Celebration effects verification — run: node sandbox/verify-effects.js
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

var FX = sandbox.CelebrationEffects;
var Agent = sandbox.PriorityAgent;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

if (!FX) {
  console.log('FAIL CelebrationEffects failed to load');
  process.exit(1);
}

var expected = [
  'fireworks',
  'confetti',
  'hearts',
  'sparkles',
  'shooting_stars',
  'bubbles',
  'aurora',
  'balloons',
  'petals',
  'rainbow',
  'disco'
];

check('list has 11 effects', FX.list().length === 11);
expected.forEach(function (id) {
  check('has ' + id, FX.list().indexOf(id) !== -1);
  check('normalize ' + id, FX.normalize(id) === id);
});

check('alias confettis → confetti', FX.normalize('confettis') === 'confetti');
check('alias etoiles → shooting_stars', FX.normalize('etoiles') === 'shooting_stars');
check('unknown effect', FX.normalize('lava') == null);
check('label fireworks', typeof FX.label('fireworks') === 'string' && FX.label('fireworks').length > 0);
check('play export', typeof FX.play === 'function');
check('clear export', typeof FX.clear === 'function');

if (Agent && typeof Agent.executeAction === 'function') {
  var played = [];
  var bridge = {
    playEffect: function (name) {
      played.push(name);
      return { ok: true, effect: name };
    }
  };
  Agent.executeAction(bridge, {
    tool: 'trigger_effect',
    args: { effect: 'confetti' }
  }).then(function (res) {
    check('execute trigger_effect ok', !!(res && res.ok));
    check('execute plays confetti', played[0] === 'confetti');
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'nope' }
    });
  }).then(function (res) {
    check('execute unknown effect fails', !!(res && !res.ok));
    if (bad) process.exit(1);
    console.log('All effects checks passed.');
  }).catch(function (err) {
    console.log('FAIL executeAction', err && err.message ? err.message : err);
    process.exit(1);
  });
} else {
  check('PriorityAgent loaded', false);
  process.exit(1);
}
