// Card Dream helpers verification — run: node sandbox/verify-card-dream.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = {
  console: console,
  window: {},
  AgentMemory: null
};
sandbox.window = sandbox;
vm.runInNewContext(
  fs.readFileSync(
    path.join(__dirname, '..', 'components', 'agent', 'agent-memory.js'),
    'utf8'
  ),
  sandbox
);

var Mem = sandbox.AgentMemory || (sandbox.window && sandbox.window.AgentMemory);
var bad = 0;

function check(name, ok, detail) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name + (ok || !detail ? '' : ' — ' + detail));
}

check('AgentMemory export', !!Mem);
check('cardFactsSignature export', typeof Mem.cardFactsSignature === 'function');
check('cardDreamNeedsRefresh export', typeof Mem.cardDreamNeedsRefresh === 'function');
check('markCardDreamed export', typeof Mem.markCardDreamed === 'function');

var empty = Mem.emptyCardMemory();
check('empty needs no dream', Mem.cardDreamNeedsRefresh(empty) === false);
check('empty signature empty', Mem.cardFactsSignature(empty) === '');

var withFacts = Mem.normalizeCardMemory({
  facts: [
    { text: 'Pourquoi : aligner les messages' },
    { text: 'Livrable : plan com Q3' }
  ]
});
check('facts need dream', Mem.cardDreamNeedsRefresh(withFacts) === true);
var sig = Mem.cardFactsSignature(withFacts);
check('signature non-empty', !!sig && sig.indexOf('|') !== -1, sig);

var dreamed = Mem.normalizeCardMemory(
  Object.assign({}, withFacts, {
    dreamSignature: sig,
    lastDreamAt: new Date().toISOString()
  })
);
check('dreamed skips refresh', Mem.cardDreamNeedsRefresh(dreamed) === false);

var changed = Mem.rememberCardFact(dreamed, 'Reste : valider avec Ian');
check('new fact needs dream again', Mem.cardDreamNeedsRefresh(changed) === true);
check(
  'normalize keeps dream meta',
  dreamed.lastDreamAt && dreamed.dreamSignature === sig
);

var agentSrc = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'agent', 'agent.js'),
  'utf8'
);
check('agent exports cardDreamTurn', /cardDreamTurn:\s*cardDreamTurn/.test(agentSrc));
check('agent defines cardDreamTurn', /async function cardDreamTurn\(/.test(agentSrc));
check(
  'dream prompt forbids structured brief dump',
  agentSrc.indexOf('INTERDIT les sections structur') !== -1 &&
    agentSrc.indexOf('## Pourquoi / Livrable / But / Qui') !== -1
);
check(
  'dream prompt prefers short summary',
  agentSrc.indexOf('Description COURTE') !== -1 &&
    agentSrc.indexOf('infos misc absentes des autres champs carte') !== -1
);
check('dream builds card snapshot', /function buildDreamCardSnapshot\(/.test(agentSrc));
check('dream detects verbose dump', /function isVerboseStructuredDesc\(/.test(agentSrc));
check('dream exports verbose detector', /isVerboseStructuredDesc:\s*isVerboseStructuredDesc/.test(agentSrc));
check('dream desc cap is short', /var MAX_DREAM_DESC_LEN = 900/.test(agentSrc));
check(
  'dream rewrites verbose briefs',
  agentSrc.indexOf('long brief structur') !== -1 &&
    agentSrc.indexOf('version courte') !== -1
);

check(
  'ui rewrites verbose desc once',
  /verboseDescRewriteTried/.test(uiSrc) && /cardDescNeedsDreamRewrite/.test(uiSrc)
);

var uiSrc = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'agent', 'agent-ui.js'),
  'utf8'
);
check('ui schedules dream', /function scheduleCardDream\(/.test(uiSrc));
check('ui runs dream', /function tryRunCardDream\(/.test(uiSrc));
check('ui marks dreamed', /markCardDreamed/.test(uiSrc));

if (bad) {
  console.log('\n' + bad + ' failed');
  process.exit(1);
}
console.log('\nAll passed');
