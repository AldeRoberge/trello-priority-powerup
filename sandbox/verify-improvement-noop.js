// Coup de pouce no-op / recent-change filter — run: node sandbox/verify-improvement-noop.js
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

if (!Agent || typeof Agent.filterNoOpImprovementSuggestions !== 'function') {
  console.log('FAIL PriorityAgent filter helpers missing');
  process.exit(1);
}

var today = '2026-07-14';
var tomorrow = Agent.addDaysIsoLocal(today, 1);

check('addDaysIsoLocal tomorrow', tomorrow === '2026-07-15');

var ctxDueTomorrow = {
  today: today,
  nowTime: '10:00',
  due: { enabled: true, dueDate: tomorrow, dueTime: null },
  priority: { enabled: true, urgency: 2, impact: 2, ease: 3 },
  blocked: { enabled: false, blockedReasons: [], blockedLinks: [] },
  progress: { enabled: true, percent: 40, items: [{ id: '1', text: 'A', done: false, progress: 0 }] },
  goals: { projectId: null, project: null },
  statut: { listId: 'L1', listName: 'En cours', category: 'started' },
  display: { tier: 'Importante' }
};

check(
  'set_due same tomorrow is no-op',
  Agent.isNoOpImprovementAction(
    { tool: 'set_due', args: { dueDate: tomorrow, dueEnabled: true } },
    ctxDueTomorrow
  )
);

check(
  'set_due today while due is tomorrow is useful',
  !Agent.isNoOpImprovementAction(
    { tool: 'set_due', args: { dueDate: today, dueEnabled: true } },
    ctxDueTomorrow
  )
);

check(
  'set_due when missing due is useful',
  !Agent.isNoOpImprovementAction(
    { tool: 'set_due', args: { dueDate: tomorrow, dueEnabled: true } },
    {
      today: today,
      due: { enabled: false, dueDate: null, dueTime: null }
    }
  )
);

check(
  'set_due same date ignoring existing time is no-op',
  Agent.isNoOpImprovementAction(
    { tool: 'set_due', args: { dueDate: tomorrow, dueEnabled: true } },
    {
      today: today,
      due: { enabled: true, dueDate: tomorrow, dueTime: '09:00' }
    }
  )
);

check(
  're-block when already blocked is no-op',
  Agent.isNoOpImprovementAction(
    { tool: 'set_blocked', args: { enAttente: true } },
    {
      blocked: { enabled: true, blockedReasons: [], blockedLinks: [] }
    }
  )
);

check(
  'complete_all when all done is no-op',
  Agent.isNoOpImprovementAction(
    { tool: 'complete_all_subtasks', args: {} },
    {
      progress: {
        enabled: true,
        items: [{ id: '1', text: 'A', done: true, progress: 100 }]
      }
    }
  )
);

var filtered = Agent.filterNoOpImprovementSuggestions(
  [
    {
      label: "Définir l'échéance à demain",
      actions: [{ tool: 'set_due', args: { dueDate: tomorrow, dueEnabled: true } }]
    },
    {
      label: 'Marquer bloqué',
      actions: [{ tool: 'set_blocked', args: { enAttente: true } }]
    }
  ],
  ctxDueTomorrow
);

check('filters same-due suggestion', filtered.length === 1);
check(
  'keeps set_blocked suggestion',
  filtered[0] && filtered[0].label === 'Marquer bloqué'
);

var beforeDue = {
  today: today,
  nowTime: '10:00',
  due: { enabled: false, dueDate: null, dueTime: null },
  priority: { enabled: true, urgency: 2, impact: 2, ease: 3 },
  blocked: { enabled: false, blockedReasons: [], blockedLinks: [] },
  progress: { enabled: true, percent: 40, items: [] },
  goals: { projectId: 'p1', project: { id: 'p1', name: 'Sport' } },
  statut: { listId: 'L1', listName: 'En cours', category: 'started' }
};
var afterDue = {
  today: today,
  nowTime: '10:00',
  due: { enabled: true, dueDate: tomorrow, dueTime: null },
  priority: { enabled: true, urgency: 2, impact: 2, ease: 3 },
  blocked: { enabled: false, blockedReasons: [], blockedLinks: [] },
  progress: { enabled: true, percent: 40, items: [] },
  goals: { projectId: 'p1', project: { id: 'p1', name: 'Sport' } },
  statut: { listId: 'L1', listName: 'En cours', category: 'started' }
};

check(
  'detects due as recent change',
  Agent.listRecentCardChanges(beforeDue, afterDue).indexOf('due') >= 0
);

var afterUserSetDue = Agent.filterImprovementsAgainstRecentChanges(
  [
    {
      label: "Définir l'échéance à demain",
      actions: [{ tool: 'set_due', args: { dueDate: tomorrow, dueEnabled: true } }]
    },
    {
      label: 'Marquer bloqué',
      actions: [{ tool: 'set_blocked', args: { enAttente: true } }]
    }
  ],
  beforeDue,
  afterDue
);

check(
  'drops set_due right after user set due',
  afterUserSetDue.length === 1 &&
    afterUserSetDue[0].label === 'Marquer bloqué'
);

var gapsAfterDueOnly = Agent.listCardImprovementGaps({
  today: today,
  due: { enabled: true, dueDate: tomorrow, dueTime: null },
  priority: { enabled: true, urgency: 2, impact: 2, ease: 3 },
  blocked: { enabled: false },
  progress: { enabled: false, items: [] },
  goals: { projectId: 'p1', projects: [{ id: 'p1', name: 'Sport' }] },
  statut: { category: 'started' },
  display: { duePast: false }
});
check(
  'no échéance gap when due already set to tomorrow',
  gapsAfterDueOnly.every(function (g) {
    return !/échéance absente/i.test(g);
  })
);

var gapsMissingDue = Agent.listCardImprovementGaps({
  today: today,
  due: { enabled: false, dueDate: null, dueTime: null },
  priority: { enabled: false },
  blocked: { enabled: false },
  progress: { enabled: false, items: [] },
  goals: { projectId: null, projects: [] },
  statut: { category: 'started' }
});
check(
  'lists missing due gap',
  gapsMissingDue.some(function (g) {
    return /échéance absente/i.test(g);
  })
);
check(
  'lists missing priority gap',
  gapsMissingDue.some(function (g) {
    return /priorité/i.test(g);
  })
);

if (bad) process.exit(1);
console.log('All improvement no-op checks passed.');
