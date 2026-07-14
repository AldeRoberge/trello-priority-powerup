// Contrast highlights + suggestion color link — run: node sandbox/verify-contrast-highlights.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityAgent: null, console: console };
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

if (!Agent || typeof Agent.ensureContrastHighlights !== 'function') {
  console.log('FAIL ensureContrastHighlights missing');
  process.exit(1);
}

var sample =
  "Génial! Ça veut dire que tu as le contrôle sur le contenu. Est-ce que ça a déjà été commencé ou pas encore?";
var polished = Agent.ensureContrastHighlights(sample);
check(
  'highlights déjà été commencé in green',
  /\[\[g:d[eé]j[aà] [eé]t[eé] commenc[eé]\]\]/i.test(polished)
);
check(
  'highlights pas encore in red',
  /\[\[r:pas encore\]\]/i.test(polished)
);

var viaPolish = Agent.polishAssistantVisibleText
  ? null
  : polished;
// polishAssistantVisibleText may not be exported — use ensure + link only
var linked = Agent.linkSuggestionColorsToHighlights(
  [
    { text: 'Oui, un peu', heat: null },
    { text: 'Oui, presque terminé', heat: null },
    { text: 'Non, pas encore', heat: null }
  ],
  polished
);
check('oui un peu is green heat 0', linked[0].heat === 0);
check('presque terminé is green heat 0', linked[1].heat === 0);
check('pas encore chip is red heat 4', linked[2].heat === 4);

var facile = Agent.ensureContrastHighlights(
  'Tu trouves ça simple ou plutôt difficile?'
);
check(
  'simple/difficile contrast',
  /\[\[g:simple\]\]/i.test(facile) && /\[\[r:[^\]]*difficile\]\]/i.test(facile)
);

var spans = Agent.extractHighlightSpans(polished);
check(
  'extracts g+r spans',
  spans.some(function (s) {
    return s.color === 'g';
  }) &&
    spans.some(function (s) {
      return s.color === 'r';
    })
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll contrast-highlight checks passed');
process.exit(bad ? 1 : 0);
