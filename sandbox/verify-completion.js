// Completion weighted progress verification — run: node sandbox/verify-completion.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityTrello: null, CompletionTrello: null, window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-trello.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'completion-trello.js'), 'utf8'),
  sandbox
);

var CT = sandbox.CompletionTrello;
var bad = 0;

function check(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

[
  'normalizeCompletionData',
  'computeWeightedProgress',
  'difficultyWeight',
  'getCardCompletion',
  'saveCardCompletion',
  'formatFaceBadgeText',
  'formatDetailBadgeText',
  'buildCardFaceBadge',
  'cardFaceBadges',
  'cardDetailBadges',
].forEach(function (name) {
  check('export ' + name, typeof CT[name] === 'function' || (name === 'CARD_COMPLETION_KEY' && CT[name]));
});

check('storage key', CT.CARD_COMPLETION_KEY === 'cardCompletion');
check('difficulty weight easy', CT.difficultyWeight(0) === 1);
check('difficulty weight hard', CT.difficultyWeight(4) === 5);
check('difficulty weight default invalid', CT.difficultyWeight('x') === 3);

var items = [
  { id: 'a', text: 'Easy', done: true, difficulty: 0 },
  { id: 'b', text: 'Hard', done: false, difficulty: 4 },
];
var progress = CT.computeWeightedProgress(items);
check('weighted percent 17', progress.percent === 17);
check('done count 1', progress.doneCount === 1);
check('total count 2', progress.totalCount === 2);
check('done weight 1', progress.doneWeight === 1);
check('total weight 6', progress.totalWeight === 6);

var allDone = CT.computeWeightedProgress([
  { id: 'a', text: 'A', done: true, difficulty: 2 },
  { id: 'b', text: 'B', done: true, difficulty: 3 },
]);
check('100 percent when all done', allDone.percent === 100);

var empty = CT.computeWeightedProgress([]);
check('empty has no items', empty.hasItems === false && empty.percent === 0);

check(
  'face badge text incomplete',
  CT.formatFaceBadgeText({ hasItems: true, percent: 45 }) === '45\u00a0%'
);
check(
  'face badge text complete',
  CT.formatFaceBadgeText({ hasItems: true, percent: 100 }) === '\u2713 100\u00a0%'
);
check(
  'detail badge with items',
  CT.formatDetailBadgeText({ hasItems: true, percent: 45, doneCount: 2, totalCount: 5 }) ===
    '45\u00a0% (2/5)'
);
check(
  'detail badge empty',
  CT.formatDetailBadgeText({ hasItems: false }) === 'D\u00e9finir l\u2019avancement'
);
check(
  'face badge color complete',
  CT.buildCardFaceBadge({ hasItems: true, percent: 100 }).color === 'green'
);
check(
  'normalize strips empty text',
  CT.normalizeCompletionData({ items: [{ id: 'x', text: '  ', done: false, difficulty: 1 }] }).items.length === 0
);
check(
  'normalize clamps difficulty',
  CT.normalizeItem({ id: 'x', text: 'ok', done: false, difficulty: 99 }).difficulty === 4
);
check(
  'normalize clamps negative difficulty',
  CT.normalizeItem({ id: 'x', text: 'ok', done: false, difficulty: -3 }).difficulty === 0
);
check(
  'normalize truncates long text',
  CT.normalizeItem({ id: 'x', text: 'a'.repeat(600), done: false, difficulty: 1 }).text.length ===
    CT.ITEM_TEXT_MAX
);
check(
  'normalize drops duplicate ids',
  CT.normalizeCompletionData({
    items: [
      { id: 'dup', text: 'First', done: false, difficulty: 1 },
      { id: 'dup', text: 'Second', done: true, difficulty: 2 },
      { id: 'other', text: 'Other', done: false, difficulty: 0 },
    ],
  }).items.length === 2
);
check(
  'normalize duplicate keeps first',
  CT.normalizeCompletionData({
    items: [
      { id: 'dup', text: 'First', done: false, difficulty: 1 },
      { id: 'dup', text: 'Second', done: true, difficulty: 2 },
    ],
  }).items[0].text === 'First'
);
check(
  'normalize malformed root',
  CT.normalizeCompletionData(null).items.length === 0 &&
    CT.normalizeCompletionData('bad').items.length === 0
);
check(
  'normalize non-array items',
  CT.normalizeCompletionData({ items: 'nope' }).items.length === 0
);
check(
  'normalize rejects non-boolean done',
  CT.normalizeItem({ id: 'x', text: 'ok', done: 1, difficulty: 1 }).done === false
);

console.log(bad ? '\n' + bad + ' failure(s)' : '\nAll completion checks passed');
process.exit(bad ? 1 : 0);
