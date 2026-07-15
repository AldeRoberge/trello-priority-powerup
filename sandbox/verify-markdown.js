// Markdown description verification — run: node sandbox/verify-markdown.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = { PriorityUI: null, window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'components', 'priority', 'priority-ui.js'), 'utf8'),
  sandbox
);

var PU = sandbox.PriorityUI || (sandbox.window && sandbox.window.PriorityUI);
var bad = 0;

function check(name, ok, detail) {
  if (!ok) bad++;
  console.log((ok ? 'OK' : 'FAIL') + ' ' + name + (ok || !detail ? '' : ' — ' + detail));
}

check('renderMarkdownToHtml export', typeof PU.renderMarkdownToHtml === 'function');

var smart =
  '[https://docs.google.com/document/d/104eWT2AmtFuJsTiZ-RToWFVXfTjQL8QKva6C_Z_uDXE/edit?tab=t.0](https://docs.google.com/document/d/104eWT2AmtFuJsTiZ-RToWFVXfTjQL8QKva6C_Z_uDXE/edit?tab=t.0 "smartCard-block")';
var outSmart = PU.renderMarkdownToHtml(smart);
check(
  'smartCard-block becomes anchor',
  outSmart.indexOf('<a class="info-md-link"') !== -1 && outSmart.indexOf('smartCard') === -1,
  outSmart
);
check(
  'smartCard href preserved',
  outSmart.indexOf(
    'href="https://docs.google.com/document/d/104eWT2AmtFuJsTiZ-RToWFVXfTjQL8QKva6C_Z_uDXE/edit?tab=t.0"'
  ) !== -1,
  outSmart
);

var withAmp = PU.renderMarkdownToHtml('[label](https://example.com?a=1&b=2 "smartCard-inline")');
check(
  'ampersand in URL not double-escaped',
  withAmp.indexOf('href="https://example.com?a=1&amp;b=2"') !== -1 &&
    withAmp.indexOf('&amp;amp;') === -1,
  withAmp
);

var plain = PU.renderMarkdownToHtml('[plain](https://example.com)');
check('untitled link still works', plain.indexOf('<a class="info-md-link"') !== -1, plain);

var titled = PU.renderMarkdownToHtml('[Click](https://example.com "title")');
check(
  'standard titled link',
  titled.indexOf('<a class="info-md-link"') !== -1 && titled.indexOf('>Click<') !== -1,
  titled
);

if (bad) {
  console.log('\n' + bad + ' failed');
  process.exit(1);
}
console.log('\nAll passed');
