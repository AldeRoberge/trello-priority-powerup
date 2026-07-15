// set_blocked clears 100% progress — run: node sandbox/verify-blocked-incomplete.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = {
  PriorityAgent: null,
  CompletionTrello: null,
  CompletionUI: null,
  PriorityTrello: null,
  console: console
};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'priority', 'priority-trello.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'completion', 'completion-ui.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'completion', 'completion-trello.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'agent', 'agent.js'), 'utf8'),
  sandbox
);

var Agent = sandbox.PriorityAgent;
var CT = sandbox.CompletionTrello;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

if (!Agent || !CT) {
  console.log('FAIL modules failed to load');
  process.exit(1);
}

check(
  'fallbackUnblockSubtaskText export',
  typeof Agent.fallbackUnblockSubtaskText === 'function'
);
check(
  'suggestUnblockSubtaskText export',
  typeof Agent.suggestUnblockSubtaskText === 'function'
);
check(
  'fallback waiting cable',
  Agent.fallbackUnblockSubtaskText("En attente d'un c\u00e2ble") ===
    'Obtenir un c\u00e2ble'
);
check(
  'fallback approval',
  Agent.fallbackUnblockSubtaskText("En attente d'une approbation") ===
    "Obtenir l'approbation"
);
check(
  'fallbackBlockedReasonText export',
  typeof Agent.fallbackBlockedReasonText === 'function'
);
check(
  'fallbackBlockedReasonText action → en attente de',
  Agent.fallbackBlockedReasonText('Manger un hot-dog') ===
    'En attente de manger un hot-dog'
);
check(
  'fallbackBlockedReasonText keeps existing cause',
  Agent.fallbackBlockedReasonText("En attente d'une r\u00e9ponse") ===
    "En attente d'une r\u00e9ponse"
);

var priority = { enAttente: false, blockedReasons: [] };
var completion = { items: [], progress: 100 };

var bridge = {
  getPriorityState: function () {
    return Object.assign({}, priority);
  },
  getCompletion: function () {
    return JSON.parse(JSON.stringify(completion));
  },
  applyPriority: function (partial) {
    Object.assign(priority, partial || {});
  },
  applyCompletion: function (next) {
    completion = JSON.parse(JSON.stringify(next || { items: [] }));
  }
};

Agent.executeAction(bridge, {
  tool: 'set_blocked',
  args: {
    enAttente: true,
    blockedReasons: ["En attente de l'acc\u00e8s admin"]
  }
})
  .then(function (res) {
    check('set_blocked ok', !!(res && res.ok));
    check('enAttente enabled', priority.enAttente === true);
    check(
      'progress left 100%',
      completion.progress === 0 && !CT.isAllSubtasksComplete(completion)
    );
    check(
      'master blocked mirrored',
      completion.blocked === true && CT.hasAnyBlocked(completion)
    );
    check(
      'detail mentions progress',
      !!(res && res.detail && /progress/.test(res.detail))
    );

    // Already incomplete: blocking must not force progress to 0.
    priority = { enAttente: false, blockedReasons: [] };
    completion = { items: [], progress: 40 };
    return Agent.executeAction(bridge, {
      tool: 'set_blocked',
      args: { enAttente: true, blockedReasons: ['En attente d\'une r\u00e9ponse'] }
    });
  })
  .then(function (res) {
    check(
      'set_blocked keeps partial progress',
      !!(res && res.ok) && completion.progress === 40
    );
    check('set_blocked sets master.blocked', completion.blocked === true);

    // Items at 100% also clear.
    priority = { enAttente: false, blockedReasons: [] };
    completion = {
      items: [
        { id: 'a', text: 'A', progress: 100, done: true },
        { id: 'b', text: 'B', progress: 100, done: true }
      ]
    };
    return Agent.executeAction(bridge, {
      tool: 'set_blocked',
      args: { enAttente: true }
    });
  })
  .then(function (res) {
    check('set_blocked ok with items', !!(res && res.ok));
    check(
      'items no longer complete',
      completion.items.every(function (i) {
        return i.progress === 0 && !i.done;
      }) && !CT.isAllSubtasksComplete(completion)
    );
    check('master blocked when enabling without links', completion.blocked === true);

    // Unblock clears progress blocked flags.
    return Agent.executeAction(bridge, {
      tool: 'set_blocked',
      args: { enAttente: false }
    });
  })
  .then(function (res) {
    check('set_blocked unblock ok', !!(res && res.ok));
    check('enAttente false', priority.enAttente === false);
    check(
      'clearAllBlocked via set_blocked false',
      !completion.blocked && !CT.hasAnyBlocked(completion)
    );

    // add_subtask blocked:true creates blocked item + enAttente.
    priority = { enAttente: false, blockedReasons: [], blockedLinks: [] };
    completion = { items: [] };
    return Agent.executeAction(bridge, {
      tool: 'add_subtask',
      args: { text: 'Obtenir le mat\u00e9riel', blocked: true }
    });
  })
  .then(function (res) {
    check('add_subtask blocked ok', !!(res && res.ok));
    check(
      'add_subtask blocked item',
      completion.items.length === 1 &&
        completion.items[0].blocked === true &&
        completion.items[0].text === 'Obtenir le mat\u00e9riel'
    );
    check('add_subtask blocked enables enAttente', priority.enAttente === true);
    check(
      'add_subtask blocked sets blockedLinks',
      Array.isArray(priority.blockedLinks) &&
        priority.blockedLinks.length === 1 &&
        priority.blockedLinks[0].id === completion.items[0].id
    );

    // set_subtask_blocked toggle off clears card when last blocked item.
    return Agent.executeAction(bridge, {
      tool: 'set_subtask_blocked',
      args: { id: completion.items[0].id, blocked: false }
    });
  })
  .then(function (res) {
    check('set_subtask_blocked off ok', !!(res && res.ok));
    check(
      'set_subtask_blocked clears item',
      completion.items[0] && !completion.items[0].blocked
    );
    check(
      'set_subtask_blocked clears enAttente when none left',
      priority.enAttente === false
    );

    if (bad) process.exit(1);
    console.log('All blocked-incomplete checks passed.');
  })
  .catch(function (err) {
    console.log('FAIL', err && err.message ? err.message : err);
    process.exit(1);
  });
