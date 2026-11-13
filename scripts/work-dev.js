'use strict';
// Runs /work locally with nothing real behind it: a fake Trello (the one the Playwright suite uses) that
// also serves this repo as the static site, and `wrangler dev` pointed at it. Signing in is skipped
// (WORK_DEV_USER works on localhost only).
//   npm run dev:work        then open http://localhost:8787/work/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { FakeTrello } = require('../e2e/fake-trello/model');

const ROOT = path.join(__dirname, '..');
const FAKE_PORT = Number(process.env.FAKE_PORT) || 4310;
const WORKER_PORT = Number(process.env.PORT) || 8787;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

const model = new FakeTrello();

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** The board in one call, shaped like GET /boards/{id}?members=all&labels=all&lists=open&cards=open... */
function boardSnapshot() {
  return {
    ...model.board,
    members: model.members,
    labels: model.labels,
    customFields: model.customFields,
    lists: model.lists.filter((l) => !l.closed),
    cards: model.cards.filter((c) => !c.closed).map((c) => ({ ...model.cardView(c), members: undefined, labels: undefined })),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, body, type) => {
    res.writeHead(status, { 'content-type': type || 'application/json' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  if (url.pathname.startsWith('/1/')) {
    const p = url.pathname.slice(2);
    if (req.method === 'GET' && /^\/members\/me$/.test(p)) return send(200, model.members[0]);
    if (req.method === 'GET' && /pluginData$/.test(p)) return send(200, []);
    if (req.method === 'GET' && /^\/boards\/[^/]+$/.test(p)) {
      return send(200, url.searchParams.get('card_pluginData') ? { id: model.board.id, cards: [] } : boardSnapshot());
    }
    const raw = await readBody(req);
    let body = null;
    if (raw.length && /json/.test(req.headers['content-type'] || '')) {
      try { body = JSON.parse(raw.toString('utf8')); } catch (e) { /* ignore */ }
    }
    const query = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    const out = model.rest(req.method, p, query, body);
    return send(out.status, out.body);
  }
  const file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT) || /[\\/](\.git|node_modules|e2e)[\\/]/.test(file + path.sep)) return send(403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => (err ? send(404, 'Not found', 'text/plain') : send(200, data, TYPES[path.extname(file)] || 'application/octet-stream')));
});

server.listen(FAKE_PORT, '127.0.0.1', () => {
  console.log(`fake Trello + static site on http://127.0.0.1:${FAKE_PORT}`);
  const vars = {
    TRELLO_API_BASE: `http://127.0.0.1:${FAKE_PORT}`,
    WORK_ASSETS_ORIGIN: `http://127.0.0.1:${FAKE_PORT}`,
    TRELLO_KEY: 'k',
    TRELLO_TOKEN: 't',
    TRELLO_BOARD_ID: model.board.id,
    SYNC_SECRET: 'dev',
    SESSION_SECRET: 'dev-session-secret',
    WORK_ALLOWED_EMAILS: 'dev@localhost',
    WORK_DEV_USER: 'dev@localhost',
  };
  const args = ['wrangler', 'dev', '--port', String(WORKER_PORT)];
  Object.entries(vars).forEach(([k, v]) => args.push('--var', `${k}:${v}`));
  const child = spawn('npx', args, { cwd: path.join(ROOT, 'workers', 'trello-sheet-sync'), stdio: 'inherit', shell: true });
  child.on('exit', (code) => { server.close(); process.exit(code || 0); });
  process.on('SIGINT', () => { child.kill(); });
});
