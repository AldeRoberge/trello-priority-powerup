// Markdown description verification — run: node sandbox/verify-markdown.js
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var { URL } = require('url');

var sandbox = {
  PriorityUI: null,
  window: {},
  URL: URL,
  fetch: function () {
    return Promise.reject(new Error('fetch disabled in verify-markdown'));
  },
  sessionStorage: {
    _data: Object.create(null),
    getItem: function (k) {
      return this._data[k] || null;
    },
    setItem: function (k, v) {
      this._data[k] = String(v);
    }
  }
};
sandbox.window = sandbox;
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
  'smartCard-block becomes smartcard',
  outSmart.indexOf('info-md-smartcard--block') !== -1 &&
    outSmart.indexOf('data-smart-url=') !== -1 &&
    outSmart.indexOf('smartCard') === -1,
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
  'smartCard-inline ampersand href',
  withAmp.indexOf('info-md-smartcard--inline') !== -1 &&
    withAmp.indexOf('href="https://example.com?a=1&amp;b=2"') !== -1 &&
    withAmp.indexOf('&amp;amp;') === -1,
  withAmp
);

var plain = PU.renderMarkdownToHtml('[plain](https://example.com)');
check('named link stays inline', plain.indexOf('info-md-link') !== -1, plain);

var titled = PU.renderMarkdownToHtml('[Click](https://example.com "title")');
check(
  'standard titled link',
  titled.indexOf('<a class="info-md-link"') !== -1 && titled.indexOf('>Click<') !== -1,
  titled
);

var bare = PU.renderMarkdownToHtml('See https://example.com/path for more');
check('bare url becomes smartcard', bare.indexOf('info-md-smartcard--block') !== -1, bare);

check(
  'smartCardMode block',
  PU.smartCardModeForLink('https://x.com', 'https://x.com', 'smartCard-block') === 'block'
);
check(
  'smartCardMode inline',
  PU.smartCardModeForLink('label', 'https://x.com', 'smartCard-inline') === 'inline'
);
check(
  'smartCardMode named',
  PU.smartCardModeForLink('Click here', 'https://x.com', '') === ''
);

check('wrapMarkdownInlineSelection export', typeof PU.wrapMarkdownInlineSelection === 'function');
check('applyMarkdownBlockFormat export', typeof PU.applyMarkdownBlockFormat === 'function');

var bold = PU.wrapMarkdownInlineSelection({ value: 'hello', start: 0, end: 5 }, '**');
check('bold wrap', bold.value === '**hello**' && bold.start === 2 && bold.end === 7, JSON.stringify(bold));
var boldToggle = PU.wrapMarkdownInlineSelection(bold, '**');
check('bold unwrap', boldToggle.value === 'hello', JSON.stringify(boldToggle));

var italic = PU.wrapMarkdownInlineSelection({ value: 'x', start: 0, end: 1 }, '*');
check('italic wrap', italic.value === '*x*', italic.value);

var checkOn = PU.applyMarkdownBlockFormat({ value: 'task', start: 0, end: 4 }, 'checklist');
check(
  'checklist apply',
  checkOn.value === '- [ ] task',
  checkOn.value
);
var checkOff = PU.applyMarkdownBlockFormat(
  { value: checkOn.value, start: 0, end: checkOn.value.length },
  'checklist'
);
check('checklist toggle off', checkOff.value === 'task', checkOff.value);

var h1 = PU.applyMarkdownBlockFormat({ value: 'Title', start: 0, end: 5 }, 'h1');
check('heading 1', h1.value === '# Title', h1.value);
var normal = PU.applyMarkdownBlockFormat(
  { value: h1.value, start: 0, end: h1.value.length },
  'normal'
);
check('heading clear', normal.value === 'Title', normal.value);
check('detect checklist', PU.detectMarkdownLineFormat('- [ ] a') === 'checklist');
check('detect h2', PU.detectMarkdownLineFormat('## Hi') === 'h2');

if (bad) {
  console.log('\n' + bad + ' failed');
  process.exit(1);
}
console.log('\nAll passed');
