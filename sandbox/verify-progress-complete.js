// Progress-complete celebration guards — run: node sandbox/verify-progress-complete.js
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

if (!Agent || typeof Agent.applyProgressCompleteGuards !== 'function') {
  console.log('FAIL PriorityAgent.applyProgressCompleteGuards missing');
  process.exit(1);
}

check(
  'detects set_progress 100',
  Agent.actionsReachFullProgress([
    { tool: 'set_progress', args: { progress: 100, progressEnabled: true } }
  ])
);
check(
  'detects complete_all_subtasks',
  Agent.actionsReachFullProgress([{ tool: 'complete_all_subtasks', args: {} }])
);
check(
  'ignores partial progress',
  !Agent.actionsReachFullProgress([
    { tool: 'set_progress', args: { progress: 80 } }
  ])
);

check(
  'detects due ask phrasing',
  Agent.looksLikeDueAskMessage("Veux-tu que je définisse l'échéance à demain?")
);
check(
  'detects c\'est pour quand',
  Agent.looksLikeDueAskMessage('C\'est pour quand?')
);
check(
  'ignores unrelated question',
  !Agent.looksLikeDueAskMessage('Quelle est la priorité?')
);

var rewritten = Agent.polishMessageAfterProgressComplete(
  "Veux-tu que je définisse l'échéance?",
  [{ tool: 'set_progress', args: { progress: 100 } }],
  null
);
check(
  'rewrites due ask to congratulations',
  /bravo/i.test(rewritten) && !/\u00e9ch[eé]ance/i.test(rewritten)
);

var alreadyDone = Agent.polishMessageAfterProgressComplete(
  "Veux-tu que je définisse l'échéance à demain?",
  [],
  { progress: { percent: 100 } }
);
check(
  'blocks due ask when already at 100',
  /termin/i.test(alreadyDone) && !/veux-tu/i.test(alreadyDone)
);

var guarded = Agent.applyProgressCompleteGuards(
  {
    message: "Veux-tu que je définisse l'échéance?",
    actions: [{ tool: 'set_progress', args: { progress: 100 } }],
    suggestions: [
      { text: "Définir une échéance" },
      { text: 'Passer en Terminé' }
    ],
    emotion: null
  },
  null
);
check('injects confetti', guarded.actions.some(function (a) {
  return a.tool === 'trigger_effect' && a.args && a.args.effect === 'confetti';
}));
check('happy emotion', guarded.emotion === 'happy');
check(
  'drops due suggestion chip',
  guarded.suggestions.length === 1 &&
    /termin/i.test(guarded.suggestions[0].text)
);
check('keeps congratulation message', /bravo/i.test(guarded.message));

var keepCongrats = Agent.applyProgressCompleteGuards(
  {
    message: 'Bravo, c\'est plié !',
    actions: [
      { tool: 'set_progress', args: { progress: 100 } },
      { tool: 'trigger_effect', args: { effect: 'flowers' } }
    ],
    suggestions: [{ text: 'Et ensuite?' }],
    emotion: 'happy'
  },
  null
);
check(
  'keeps existing celebration effect',
  keepCongrats.actions.filter(function (a) {
    return a.tool === 'trigger_effect';
  }).length === 1 &&
    keepCongrats.actions[0].args.effect === 'flowers'
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll progress-complete checks passed');
process.exit(bad ? 1 : 0);
