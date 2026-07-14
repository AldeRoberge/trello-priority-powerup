// Matrix label verification — run: node sandbox/verify-matrix.js
// Loads production priority-matrix.js (same file served to popup.html).
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityMatrix: null };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'priority', 'priority-matrix.js'), 'utf8'),
  sandbox
);
var PriorityMatrix = sandbox.PriorityMatrix;

var bad = 0;
var tier = { label: 'Importante', description: 'tier desc' };

function check(name, inputs, expectedLabel, ctx) {
  var r = PriorityMatrix.resolveLabel(inputs, ctx || { tier: tier });
  var ok = r.label === expectedLabel;
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name + ' -> ' + r.label + ' (expected ' + expectedLabel + ')');
}

console.log('=== Matrix examples ===');
check('Opportunité massive', { ease: 5, impact: 4, urgency: 4 }, 'Opportunité massive');
check('Corvée express', { ease: 1, impact: 0, urgency: 4 }, 'Corvée express');
check('Victoire rapide', { ease: 5, impact: 3, urgency: 1 }, 'Victoire rapide');
check('Chemin critique', { ease: 1, impact: 4, urgency: 4 }, 'Chemin critique');

console.log('\n=== New matrix rules ===');
check('Accélérateur', { ease: 3, impact: 4, urgency: 4 }, 'Accélérateur');
check('Coup de pouce', { ease: 5, impact: 2, urgency: 4 }, 'Coup de pouce');
check('À arbitrer', { ease: 3, impact: 2, urgency: 2 }, 'À arbitrer');
check('Piste exploratoire', { ease: 3, impact: 2, urgency: 1 }, 'Piste exploratoire');
check('Pression modérée', { ease: 3, impact: 2, urgency: 4 }, 'Pression modérée');
check('Échéance serrée', { ease: 2, impact: 2, urgency: 4 }, 'Échéance serrée');

var sparseCtx = { tier: tier, rules: PriorityMatrix.RULES.filter(function (r) { return r.id === 'backlog-filler'; }) };
var fallback = PriorityMatrix.resolveLabel({ ease: 3, impact: 2, urgency: 2 }, sparseCtx);
if (fallback.fromMatrix) { bad++; console.log('FAIL fallback should use tier when no rule matches'); }
else console.log('OK fallback -> ' + fallback.label);

console.log('\n=== Disabled matrix (tier labels only) ===');
var disabledCtx = PriorityMatrix.buildResolveContext({ enabled: false }, tier);
var disabledResult = PriorityMatrix.resolveLabel({ ease: 5, impact: 4, urgency: 4 }, disabledCtx);
if (!disabledResult.matrixDisabled) { bad++; console.log('FAIL disabled should set matrixDisabled'); }
else console.log('OK disabled matrixDisabled flag');
if (disabledResult.fromMatrix) { bad++; console.log('FAIL disabled should not set fromMatrix'); }
else console.log('OK disabled fromMatrix false');

console.log('\n=== Custom override ===');
var customCtx = PriorityMatrix.buildResolveContext({
  overrides: { 'massive-opportunity': { label: 'Jackpot' } }
});
var customResult = PriorityMatrix.resolveLabel({ ease: 5, impact: 4, urgency: 4 }, customCtx);
if (customResult.label !== 'Jackpot') { bad++; console.log('FAIL custom override -> ' + customResult.label); }
else console.log('OK custom override -> ' + customResult.label);

var aliasCtx = PriorityMatrix.buildResolveContext({
  overrides: { 'quick-win': { label: 'Victoire rapide' } }
});
check('Victoire rapide alias', { ease: 5, impact: 3, urgency: 1 }, 'Victoire rapide', aliasCtx);

var cfg = PriorityMatrix.createConfig({
  enabled: false,
  overrides: { 'quick-win': { label: 'Victoire rapide' } }
});
if (cfg.enabled !== false) { bad++; console.log('FAIL createConfig should honor enabled:false'); }
else console.log('OK createConfig enabled:false');
cfg.resetToDefaults();
if (cfg.enabled !== true) { bad++; console.log('FAIL reset should re-enable matrix'); }
else console.log('OK reset re-enables matrix');
check('Victoire rapide after reset',
  { ease: 5, impact: 3, urgency: 1 },
  'Victoire rapide', PriorityMatrix.buildResolveContext(cfg, tier));

var reset = PriorityMatrix.resetToDefaults();
if (reset.enabled !== true || Object.keys(reset.overrides).length !== 0) {
  bad++;
  console.log('FAIL resetToDefaults');
} else {
  console.log('OK resetToDefaults');
}

process.exit(bad > 0 ? 1 : 0);
