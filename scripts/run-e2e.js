'use strict';
/* Real-browser E2E: serves the repo statically, opens the sandbox/e2e pages (Assistant chat,
 * Documents view) in headless Edge/Chrome (no npm deps) and prints each in-page report.
 *   npm run test:e2e                    headless run of every page, exit 1 on failure
 *   npm run test:e2e -- --page=docs     only one page (assistant | docs | docs-unauth)
 *   npm run test:e2e -- --serve         serve only (E2E_PORT=4180 to change the port), then open the printed URLs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.E2E_PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function findBrowser() {
  const candidates = [
    process.env.E2E_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Drive the page over the DevTools protocol (Node's built-in WebSocket, no deps). */
async function readReportViaCdp(port, url) {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json');
      const list = await res.json();
      targets = list.find((t) => t.type === 'page');
    } catch (e) {
      await sleep(250);
    }
  }
  if (!targets) throw new Error('browser did not expose a debug target');
  const ws = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('websocket error'));
  });
  let id = 0;
  const pendingCalls = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendingCalls.has(msg.id)) {
      pendingCalls.get(msg.id)(msg);
      pendingCalls.delete(msg.id);
    }
  };
  const call = (method, params) =>
    new Promise((resolve) => {
      const n = ++id;
      pendingCalls.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    });
  await call('Page.enable');
  await call('Page.navigate', { url });
  const deadline = Date.now() + 110000;
  let last = '';
  while (Date.now() < deadline) {
    await sleep(500);
    const r = await call('Runtime.evaluate', {
      expression: "(document.getElementById('e2e-report')||{}).textContent||''",
      returnByValue: true
    });
    last = (r.result && r.result.result && r.result.result.value) || last;
    if (/E2E DONE/.test(last)) break;
  }
  ws.close();
  return last || 'no report found in page output';
}

// Each page reports through #e2e-report ("PASS ..." / "FAIL ..." / "E2E DONE pass=N fail=M").
const PAGES = [
  { name: 'assistant', path: '/sandbox/e2e/assistant.html', size: '420,900' },
  { name: 'docs', path: '/sandbox/e2e/docs.html?run', size: '1280,900' },
  { name: 'docs-unauth', path: '/sandbox/e2e/docs.html?run&unauth', size: '1280,900' }
];

async function runPage(browser, page) {
  const url = `http://127.0.0.1:${PORT}${page.path}`;
  const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'e2e-'));
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=' + debugPort,
      '--user-data-dir=' + profile,
      '--window-size=' + page.size,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  let text = 'no report found in page output';
  try {
    text = await readReportViaCdp(debugPort, url);
  } catch (err) {
    text = 'E2E runner error: ' + err.message;
  }
  child.kill();
  setTimeout(() => {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
  }, 1000);
  const done = /E2E DONE pass=(d+) fail=(d+)/.exec(text);
  return { text, ok: !!(done && done[2] === '0') };
}

async function main() {
  const server = await serve();
  const only = (process.argv.find((a) => a.startsWith('--page=')) || '').slice(7);
  const pages = PAGES.filter((p) => !only || p.name === only);
  if (!pages.length) {
    server.close();
    console.error('Unknown --page=' + only + ' (use ' + PAGES.map((p) => p.name).join(' | ') + ')');
    process.exit(2);
  }
  if (process.argv.includes('--serve')) {
    pages.forEach((p) => console.log('Serving http://127.0.0.1:' + PORT + p.path));
    return;
  }
  const browser = findBrowser();
  if (!browser) {
    server.close();
    console.error('No Edge/Chrome found. Set E2E_BROWSER to a Chromium-based browser path.');
    process.exit(2);
  }
  let allOk = true;
  for (const page of pages) {
    console.log('── ' + page.name + ' ──');
    const res = await runPage(browser, page);
    console.log(res.text);
    allOk = allOk && res.ok;
  }
  server.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
