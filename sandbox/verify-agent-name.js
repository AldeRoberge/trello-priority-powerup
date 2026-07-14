// set_agent_name verification — run: node sandbox/verify-agent-name.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityAgent: null };
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

if (!Agent || typeof Agent.executeAction !== 'function') {
  console.log('FAIL PriorityAgent failed to load');
  process.exit(1);
}

var stored = { agentName: 'Gold', agentColor: 'yellow' };
var bridge = {
  getProfile: function () {
    return stored;
  },
  setAgentName: function (name) {
    stored.agentName = String(name || '').trim();
    return { ok: true, name: stored.agentName };
  }
};

Agent.executeAction(bridge, {
  tool: 'set_agent_name',
  args: { name: 'Nova' }
})
  .then(function (res) {
    check('execute set_agent_name ok', !!(res && res.ok));
    check('stores Nova', stored.agentName === 'Nova');
    check('detail has rename', !!(res && res.detail && /Gold.*Nova/.test(res.detail)));
    return Agent.executeAction(bridge, {
      tool: 'set_agent_name',
      args: { name: '  ' }
    });
  })
  .then(function (res) {
    check('empty name fails', !!(res && !res.ok));
    return Agent.executeAction(bridge, {
      tool: 'set_agent_name',
      args: {}
    });
  })
  .then(function (res) {
    // Incomplete actions are dropped before execute; direct execute still validates.
    check('missing name fails', !!(res && !res.ok));
    if (bad) process.exit(1);
    console.log('All set_agent_name checks passed.');
  })
  .catch(function (err) {
    console.log('FAIL executeAction', err && err.message ? err.message : err);
    process.exit(1);
  });
