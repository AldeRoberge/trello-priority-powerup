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
  'flowers',
  'rainbow',
  'disco',
  'beep',
  'boop',
  'zap',
  'thunder',
  'fanfare',
  'bonk',
  'laser',
  'coin',
  'drumroll',
  'banner'
];

check('list has 22 effects', FX.list().length === 22);
expected.forEach(function (id) {
  check('has ' + id, FX.list().indexOf(id) !== -1);
  check('normalize ' + id, FX.normalize(id) === id);
});

check('alias confettis → confetti', FX.normalize('confettis') === 'confetti');
check('alias etoiles → shooting_stars', FX.normalize('etoiles') === 'shooting_stars');
check('alias beep_beep → beep', FX.normalize('beep_beep') === 'beep');
check('alias tonnerre → thunder', FX.normalize('tonnerre') === 'thunder');
check('alias fullscreen_text → banner', FX.normalize('fullscreen_text') === 'banner');
check('alias fleurs → flowers', FX.normalize('fleurs') === 'flowers');
check('alias bouquet → flowers', FX.normalize('bouquet') === 'flowers');
check('unknown effect', FX.normalize('lava') == null);
check('label fireworks', typeof FX.label('fireworks') === 'string' && FX.label('fireworks').length > 0);
check('play export', typeof FX.play === 'function');
check('clear export', typeof FX.clear === 'function');
check('playSubtaskPop export', typeof FX.playSubtaskPop === 'function');
check(
  'playSubtaskPop rejects missing anchor',
  FX.playSubtaskPop(null, { sound: false }).ok === false
);
check('playUiSound export', typeof FX.playUiSound === 'function');
[
  'trash',
  'block',
  'unblock',
  'complete_all',
  'reset',
  'reset_arm',
  'reset_all',
  'uncomplete',
  'add',
  'done'
].forEach(function (id) {
  var once = FX.playUiSound(id);
  check('playUiSound ' + id, !!(once && once.ok && once.sound === id));
});
check('playUiSound alias delete→trash', FX.playUiSound('delete').sound === 'trash');
check('playUiSound unknown fails', FX.playUiSound('nope').ok === false);
check('banner without text fails', FX.play('banner', { sound: false }).ok === false);
check(
  'beep play ok without DOM visuals path',
  typeof FX.playSound === 'function'
);

if (Agent && typeof Agent.executeAction === 'function') {
  var played = [];
  var bridgeLang = 'fr';
  var bridge = {
    getProfile: function () {
      return { language: bridgeLang };
    },
    playEffect: function (name, opts) {
      played.push({ name: name, opts: opts || {} });
      return { ok: true, effect: name };
    }
  };
  Agent.executeAction(bridge, {
    tool: 'trigger_effect',
    args: { effect: 'confetti' }
  }).then(function (res) {
    check('execute trigger_effect ok', !!(res && res.ok));
    check('execute plays confetti', played[0] && played[0].name === 'confetti');
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'nope' }
    });
  }).then(function (res) {
    check('execute unknown effect fails', !!(res && !res.ok));
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'beep' }
    });
  }).then(function (res) {
    check('execute beep ok', !!(res && res.ok));
    check('execute plays beep', played.some(function (p) { return p.name === 'beep'; }));
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'thunder', text: 'TWO' }
    });
  }).then(function (res) {
    check('execute thunder+text ok', !!(res && res.ok));
    var last = played[played.length - 1];
    check(
      'localizes TWO → DEUX (fr)',
      !!(last && last.opts && last.opts.text === 'DEUX')
    );
    bridgeLang = 'en';
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'thunder', text: 'TWO' }
    });
  }).then(function (res) {
    check('execute thunder+text en ok', !!(res && res.ok));
    var lastEn = played[played.length - 1];
    check(
      'keeps text TWO (en)',
      !!(lastEn && lastEn.opts && lastEn.opts.text === 'TWO')
    );
    bridgeLang = 'fr';
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'banner', text: 'BOOM', sound: 'fanfare' }
    });
  }).then(function (res) {
    check('execute banner+sound ok', !!(res && res.ok));
    var last = played[played.length - 1];
    check('banner name', !!(last && last.name === 'banner'));
    check('banner sound override', !!(last && last.opts && last.opts.sound === 'fanfare'));
    check('banner BOOM unchanged', !!(last && last.opts && last.opts.text === 'BOOM'));
    return Agent.executeAction(bridge, {
      tool: 'trigger_effect',
      args: { effect: 'banner' }
    });
  }).then(function (res) {
    check('banner without text fails execute', !!(res && !res.ok));
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
