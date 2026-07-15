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

// ── Already-set due date: never re-ask "C'est pour quand?" ───────────────────

check(
  'contextHasActiveDue true when enabled + date',
  Agent.contextHasActiveDue({
    due: { enabled: true, dueDate: '2026-07-20', dueTime: null }
  })
);
check(
  'contextHasActiveDue false when disabled',
  !Agent.contextHasActiveDue({
    due: { enabled: false, dueDate: '2026-07-20', dueTime: null }
  })
);
check(
  'contextHasActiveDue false when missing date',
  !Agent.contextHasActiveDue({ due: { enabled: true, dueDate: null } })
);

var alreadyKnown = Agent.summarizeInterviewAlreadyKnown({
  due: { enabled: true, dueDate: '2026-07-20', dueTime: '09:00' },
  cardMemory: { facts: ['Pourquoi : ça fait pas professionnel'] },
  interview: { priorityAxesTrusted: false },
  progress: { percent: 0 }
});
check('alreadyKnown.dueActive', alreadyKnown.dueActive === true);
check('alreadyKnown.whyKnown', alreadyKnown.whyKnown === true);
check('alreadyKnown.dueDate', alreadyKnown.dueDate === '2026-07-20');

var blockedDueAsk = Agent.applyKnownDueGuards(
  {
    message: "C'est pour quand?",
    suggestions: ['Aujourd\'hui', 'Demain', 'Pas d\'échéance']
  },
  {
    due: { enabled: true, dueDate: '2026-07-20' },
    interview: { priorityAxesTrusted: false },
    progress: { percent: 0 }
  }
);
check(
  'blocks c\'est pour quand when due already set',
  !Agent.looksLikeDueAskMessage(blockedDueAsk.message) &&
    /grave/i.test(blockedDueAsk.message)
);
check(
  'pivots to urgency chips instead of due chips',
  Array.isArray(blockedDueAsk.suggestions) &&
    blockedDueAsk.suggestions.length >= 2 &&
    !/aujourd/i.test(JSON.stringify(blockedDueAsk.suggestions))
);

var keepDueAsk = Agent.applyKnownDueGuards(
  {
    message: "C'est pour quand?",
    suggestions: ['Aujourd\'hui', 'Demain']
  },
  {
    due: { enabled: false, dueDate: null },
    interview: { priorityAxesTrusted: true },
    progress: { percent: 0 }
  }
);
check(
  'allows due ask when no active due',
  Agent.looksLikeDueAskMessage(keepDueAsk.message)
);

var scoutPivot = Agent.applyInterviewProgressScoutGuards(
  {
    message: 'Qu\'est-ce qui reste à faire pour le logo?',
    suggestions: ['A', 'B']
  },
  {
    due: { enabled: true, dueDate: '2026-07-22' },
    interview: {
      asked: ['Qu\'est-ce qui reste à faire pour le logo?'],
      priorityAxesTrusted: false
    },
    cardMemory: { facts: [] },
    progress: { percent: 10 },
    priority: { urgency: 2, impact: 2, ease: 3 }
  },
  []
);
check(
  'scout guard does not pivot to due when due already set',
  !Agent.looksLikeDueAskMessage(scoutPivot.message)
);

var trustedWithDue = Agent.buildInterviewNextPivot({
  due: { enabled: true, dueDate: '2026-07-22' },
  interview: { priorityAxesTrusted: true },
  progress: { percent: 40 }
});
check(
  'trusted+due pivot closes interview',
  trustedWithDue.completeInterview === true &&
    !Agent.looksLikeDueAskMessage(trustedWithDue.message)
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll progress-complete checks passed');
process.exit(bad ? 1 : 0);
