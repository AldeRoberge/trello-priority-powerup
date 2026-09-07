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

var ressenti =
  "Okay, \u00e7a se comprend. T'as besoin de parler de rien de lourd ou juste de jaser un peu?";
var ressentiPolished = Agent.ensureContrastHighlights(ressenti);
check(
  'ressenti keeps full right phrase (incl. peu)',
  /\[\[g:jaser un peu\]\]/i.test(ressentiPolished) ||
    /\[\[g:[^\]]*jaser[^\]]*peu\]\]/i.test(ressentiPolished)
);
check(
  'ressenti does not truncate mid-phrase',
  !/\[\[r:juste de jaser un\]\]/i.test(ressentiPolished)
);
check(
  'ressenti heavy side is red',
  /\[\[r:[^\]]*lourd\]\]/i.test(ressentiPolished)
);
check(
  'ressenti light side is green',
  /\[\[g:[^\]]*jaser/i.test(ressentiPolished)
);
var ressentiLinked = Agent.linkSuggestionColorsToHighlights(
  [
    { text: 'Juste jaser', heat: null },
    { text: 'Un truc qui me p\u00e8se', heat: null },
    { text: 'Rien', heat: null }
  ],
  ressentiPolished
);
check('Juste jaser chip is green', ressentiLinked[0].heat === 0);
check(
  'Un truc qui me p\u00e8se chip is red (or uncolored)',
  ressentiLinked[1].heat === 4 || ressentiLinked[1].heat == null
);
check(
  'Rien chip is not falsely green',
  ressentiLinked[2].heat !== 0
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll contrast-highlight checks passed');
process.exit(bad ? 1 : 0);
