// set_agent_name / set_agent_color / set_agent_personality verification
// run: node sandbox/verify-agent-identity.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityAgent: null, UserProfile: null };
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

var stored = {
  agentName: 'Gold',
  agentColor: 'yellow',
  agentPersonality: 'Calme'
};
var bridge = {
  getProfile: function () {
    return stored;
  },
  setAgentName: function (name) {
    stored.agentName = String(name || '').trim();
    return { ok: true, name: stored.agentName };
  },
  setAgentColor: function (color) {
    stored.agentColor = String(color || '').trim();
    return { ok: true, color: stored.agentColor };
  },
  setAgentPersonality: function (personality) {
    stored.agentPersonality = String(personality || '').trim();
    return { ok: true, personality: stored.agentPersonality };
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
      tool: 'set_agent_color',
      args: { color: 'rouge' }
    });
  })
  .then(function (res) {
    check('execute set_agent_color ok', !!(res && res.ok));
    check('stores red from rouge', stored.agentColor === 'red');
    check('color detail has transition', !!(res && res.detail && /yellow.*red/.test(res.detail)));
    return Agent.executeAction(bridge, {
      tool: 'set_agent_color',
      args: { color: 'not-a-color' }
    });
  })
  .then(function (res) {
    check('invalid color fails', !!(res && !res.ok));
    return Agent.executeAction(bridge, {
      tool: 'set_agent_personality',
      args: { personality: 'Un peu taquin' }
    });
  })
  .then(function (res) {
    check('execute set_agent_personality ok', !!(res && res.ok));
    check('stores personality', stored.agentPersonality === 'Un peu taquin');
    return Agent.executeAction(bridge, {
      tool: 'set_agent_personality',
      args: { personality: '  ' }
    });
  })
  .then(function (res) {
    check('empty personality fails', !!(res && !res.ok));
    return Agent.executeAction(bridge, {
      tool: 'set_agent_name',
      args: { name: '  ' }
    });
  })
  .then(function (res) {
    check('empty name fails', !!(res && !res.ok));
    if (bad) process.exit(1);
    console.log('All set_agent identity checks passed.');
  })
  .catch(function (err) {
    console.log('FAIL executeAction', err && err.message ? err.message : err);
    process.exit(1);
  });
