// Card cover sync verification — run: node sandbox/verify-cover-sync.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = {
  window: {},
  PriorityUI: {
    calc: {
      baseline: function (inputs) {
        return { tierI: 3, label: 'Important', inutile: false };
      },
    },
    resolveDisplay: function (result, inputs) {
      if (inputs && inputs.enAttente) {
        return { blocked: true, tierI: 3, label: 'Important', inutile: false };
      }
      return Object.assign({ inutile: false, blocked: false }, result);
    },
    setMatrixSettings: function () {},
  },
  TrelloApiConfig: { appKey: 'test-key', appName: 'Priorité' },
  PriorityTrello: null,
  console: console,
};

vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-trello.js'), 'utf8'),
  sandbox
);
var PriorityTrello = sandbox.PriorityTrello;

var bad = 0;

function assert(name, ok) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name);
}

assert('isTrelloApiConfigured with key', PriorityTrello.isTrelloApiConfigured() === true);

sandbox.TrelloApiConfig.appKey = '';
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-trello.js'), 'utf8'),
  sandbox
);
PriorityTrello = sandbox.PriorityTrello;
assert('isTrelloApiConfigured empty key', PriorityTrello.isTrelloApiConfigured() === false);

sandbox.TrelloApiConfig.appKey = 'test-key';
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'priority-trello.js'), 'utf8'),
  sandbox
);
PriorityTrello = sandbox.PriorityTrello;

assert(
  'coverHasImage ignores boolean idUploadedBackground',
  PriorityTrello.coverHasImage({ color: 'yellow', idUploadedBackground: true }) === false
);
assert(
  'coverHasImage detects attachment id',
  PriorityTrello.coverHasImage({ idAttachment: 'abc123' }) === true
);
assert(
  'coverHasImage detects uploaded background id',
  PriorityTrello.coverHasImage({ idUploadedBackground: 'bg-123' }) === true
);

var grayCover = PriorityTrello.serializeCover({ color: null, brightness: 'light' });
var redCover = PriorityTrello.buildColorCover(grayCover, 'red');
assert('buildColorCover sets red', redCover.color === 'red');
assert('buildColorCover clears attachment', redCover.idAttachment === null);

assert(
  'tierCoverColor blocked',
  PriorityTrello.tierCoverColor({ blocked: true }) === 'red'
);
assert(
  'tierCoverColor tier 0',
  PriorityTrello.tierCoverColor({ tierI: 0, inutile: false, blocked: false }) === 'red'
);
assert(
  'tierCoverColor tier 3',
  PriorityTrello.tierCoverColor({ tierI: 3, inutile: false, blocked: false }) === 'green'
);
assert(
  'tierCoverColor inutile',
  PriorityTrello.tierCoverColor({ inutile: true, blocked: false }) === null
);

var fetchCalls = [];
var mockT = {
  memberCanWriteToModel: function () { return true; },
  getContext: function () { return { card: 'card123' }; },
  card: function () { return Promise.resolve({ color: null, brightness: 'light' }); },
  get: function () { return Promise.resolve(null); },
  set: function () { return Promise.resolve(); },
  remove: function () { return Promise.resolve(); },
  getRestApi: function () {
    return Promise.resolve({
      isAuthorized: function () { return Promise.resolve(true); },
      getToken: function () { return Promise.resolve('token-abc'); },
    });
  },
};

global.fetch = function (url, options) {
  fetchCalls.push({ url: url, options: options });
  return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(''); } });
};

PriorityTrello.syncCardCover(mockT, null, { urgency: 2, impact: 2, ease: 3, enAttente: true })
  .then(function () {
    assert('syncCardCover blocked issues fetch', fetchCalls.length === 1);
    var call = fetchCalls[0];
    assert('PUT /cover endpoint', /\/1\/cards\/card123\/cover/.test(call.url));
    assert('key in query string', call.url.indexOf('key=test-key') !== -1);
    assert('token in query string', call.url.indexOf('token=token-abc') !== -1);
    var body = JSON.parse(call.options.body);
    assert('body has value only', body.value && body.value.color === 'red' && !body.key);

    if (bad) {
      console.log('\n' + bad + ' failure(s)');
      process.exit(1);
    }
    console.log('\nAll cover sync checks passed');
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
