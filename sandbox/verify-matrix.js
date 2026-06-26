// Matrix label verification — run: node sandbox/verify-matrix.js
// Loads production priority-matrix.js (same file served to settings.html).
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityMatrix: null };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-matrix.js'), 'utf8'),
  sandbox
);
var PriorityMatrix = sandbox.PriorityMatrix;

var bad = 0;
var tier = { label: 'Important', description: 'tier desc' };

function check(name, inputs, expectedLabel, ctx) {
  var r = PriorityMatrix.resolveLabel(inputs, ctx || { tier: tier });
  var ok = r.label === expectedLabel;
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name + ' -> ' + r.label + ' (expected ' + expectedLabel + ')');
}

console.log('=== Matrix examples ===');
check('Opportunité massive', { ease: 5, impact: 4, urgency: 4 }, 'Opportunité massive');
check('Tâche ingrate', { ease: 1, impact: 0, urgency: 4 }, 'Tâche ingrate');
check('Victoire rapide', { ease: 5, impact: 3, urgency: 1 }, 'Victoire rapide');
check('Chemin critique', { ease: 1, impact: 4, urgency: 4 }, 'Chemin critique');

console.log('\n=== New matrix rules ===');
check('Accélérateur', { ease: 3, impact: 4, urgency: 4 }, 'Accélérateur');
check('Coup de pouce', { ease: 5, impact: 2, urgency: 4 }, 'Coup de pouce');
check('Zone grise', { ease: 3, impact: 2, urgency: 2 }, 'Zone grise');
check('Piste exploratoire', { ease: 3, impact: 2, urgency: 1 }, 'Piste exploratoire');
check('Travail de fond', { ease: 2, impact: 2.5, urgency: 1 }, 'Travail de fond');
check('Travail de fond (ex-Piège à temps)', { ease: 1, impact: 2, urgency: 4 }, 'Travail de fond');

console.log('\n=== Shelf zone (low urgency, low-mid impact, very high effort) ===');
check('Projet en sommeil', { ease: 1, impact: 2, urgency: 1 }, 'Projet en sommeil');
check('Gros effort, peu de retour', { ease: 1, impact: 1.5, urgency: 1.2 }, 'Gros effort, peu de retour');
check('En attente de contexte', { ease: 1, impact: 2.5, urgency: 0.5 }, 'En attente de contexte');
check('À remettre en rayon', { ease: 1, impact: 1.5, urgency: 0.5 }, 'À remettre en rayon');
check('Sans urgence ni retour', { ease: 1, impact: 0.5, urgency: 0.5 }, 'Sans urgence ni retour');
check('Bruit de fond lourd', { ease: 1, impact: 0.5, urgency: 1.2 }, 'Bruit de fond lourd');
check('Travail de fond not shelf', { ease: 2, impact: 3, urgency: 1 }, 'Travail de fond');
check('Effet de levier', { ease: 3, impact: 4, urgency: 1 }, 'Effet de levier');
check('Fondation', { ease: 2.5, impact: 4, urgency: 0.5 }, 'Fondation');

var sparseCtx = { tier: tier, rules: PriorityMatrix.RULES.filter(function (r) { return r.id === 'backlog-filler'; }) };
var fallback = PriorityMatrix.resolveLabel({ ease: 3, impact: 2, urgency: 2 }, sparseCtx);
if (fallback.fromMatrix) { bad++; console.log('FAIL fallback should use tier when no rule matches'); }
else console.log('OK fallback -> ' + fallback.label);

console.log('\n=== Disabled matrix (tier labels only) ===');
var disabledCtx = PriorityMatrix.buildResolveContext({ enabled: false }, tier);
check('disabled uses tier', { ease: 5, impact: 4, urgency: 4 }, 'Important', disabledCtx);
var disabledResult = PriorityMatrix.resolveLabel({ ease: 5, impact: 4, urgency: 4 }, disabledCtx);
if (!disabledResult.matrixDisabled) { bad++; console.log('FAIL disabled should set matrixDisabled'); }
else console.log('OK disabled matrixDisabled flag');
if (disabledResult.fromMatrix) { bad++; console.log('FAIL disabled should not set fromMatrix'); }
else console.log('OK disabled fromMatrix false');

console.log('\n=== Custom rule overrides ===');
var customCtx = PriorityMatrix.buildResolveContext({
  overrides: { 'quick-win': { label: 'Gain express', description: 'Custom quick win text' } }
}, tier);
check('override label', { ease: 5, impact: 3, urgency: 1 }, 'Gain express', customCtx);
var customResult = PriorityMatrix.resolveLabel({ ease: 5, impact: 3, urgency: 1 }, customCtx);
if (customResult.description !== 'Custom quick win text') {
  bad++;
  console.log('FAIL override description -> ' + customResult.description);
} else {
  console.log('OK override description');
}

console.log('\n=== ruleOverrides alias ===');
var aliasCtx = PriorityMatrix.buildResolveContext({
  ruleOverrides: { 'noise': { label: 'Static' } }
}, tier);
check('ruleOverrides alias', { ease: 2, impact: 0, urgency: 0 }, 'Static', aliasCtx);

console.log('\n=== createConfig + resetToDefaults ===');
var cfg = PriorityMatrix.createConfig({
  enabled: false,
  ruleOverrides: { 'quick-win': { label: 'Another label' } }
});
cfg.setRuleOverride('quick-win', { label: 'Yet another' });
cfg.resetToDefaults();
if (cfg.enabled !== true) { bad++; console.log('FAIL reset should re-enable'); }
else console.log('OK reset re-enables matrix');
if (Object.keys(cfg.overrides).length !== 0) { bad++; console.log('FAIL reset should clear overrides'); }
else console.log('OK reset clears overrides');
check('reset restores default label', { ease: 5, impact: 3, urgency: 1 },
  'Victoire rapide', PriorityMatrix.buildResolveContext(cfg, tier));

console.log('\n=== resetSettings / resetToDefaults ===');
var reset = PriorityMatrix.resetToDefaults();
if (reset.enabled !== true || Object.keys(reset.overrides).length !== 0) {
  bad++;
  console.log('FAIL resetToDefaults');
} else {
  console.log('OK resetToDefaults');
}

process.exit(bad > 0 ? 1 : 0);
