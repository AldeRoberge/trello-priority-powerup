// Subtask-pick enrichment — run: node sandbox/verify-subtask-pick.js
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

if (!Agent || typeof Agent.enrichSubtaskPickTurn !== 'function') {
  console.log('FAIL PriorityAgent.enrichSubtaskPickTurn missing');
  process.exit(1);
}

check(
  'detects rename pick question',
  Agent.looksLikeSubtaskPickQuestion(
    "Quel est le nom de la sous-tâche que tu veux changer?"
  )
);
check(
  'ignores bare add prompt',
  !Agent.looksLikeSubtaskPickQuestion('Quel est le nom de la sous-tâche?')
);
check(
  'lists progress labels',
  Agent.listProgressSubtaskLabels({
    progress: {
      items: [
        { id: '1', text: 'Contacter Ian' },
        { id: '2', text: 'Valider le brief' }
      ]
    }
  }).join('|') === 'Contacter Ian|Valider le brief'
);

Agent.enrichSubtaskPickTurn(
  {
    message: "Quel est le nom de la sous-tâche que tu veux changer?",
    suggestions: [{ text: 'Quelle est la priorité?', heat: null }]
  },
  {
    progress: {
      items: [
        { id: '1', text: 'Contacter Ian' },
        { id: '2', text: 'Valider le brief' }
      ]
    }
  }
).then(function (withItems) {
  check(
    'injects existing subtasks as suggestions',
    withItems.suggestions.map(function (s) {
      return s.text;
    }).join('|') === 'Contacter Ian|Valider le brief' &&
      withItems.suggestionsMulti === false
  );
  return Agent.enrichSubtaskPickTurn(
    {
      message: "Quelle sous-tâche tu veux changer?",
      suggestions: [{ text: 'Quelle est la priorité?', heat: null }]
    },
    { progress: { items: [] } }
  );
}).then(function (empty) {
  check(
    'empty items pivots message',
    /pas encore de sous-t/.test(empty.message) && /cr[eé]er/.test(empty.message)
  );
  check(
    'empty items suggests create titles',
    empty.suggestions.length >= 2 &&
      empty.suggestions.every(function (s) {
        return s.text && s.text.indexOf('?') < 0;
      })
  );
  if (bad) process.exit(1);
  console.log('All subtask-pick checks passed.');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
