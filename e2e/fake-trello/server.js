'use strict';
/*
 * HTTP side of the fake Trello: serves the repo as the Power-Up host (with the real Trello SDK
 * script swapped for ./power-up-sdk.js), the data calls from that SDK, the api.trello.com REST
 * routes (rewritten to /__fake/1/...), and a fake board page (/__fake/board.html) that loads the
 * connector (index.html) and shows its board buttons / card badges the way Trello does.
 *
 *   const srv = await startServer({ model });   // port 0 = any free port
 *   srv.url                                      // http://127.0.0.1:PORT
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { FakeTrello } = require('./model');

const ROOT = path.join(__dirname, '..', '..');
const SDK_URL = 'https://p.trellocdn.com/power-up.min.js';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function send(res, status, body, type) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': type || (isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8'),
    'Cache-Control': 'no-store',
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function pageList() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => /\.html$/.test(f))
    .sort();
}

function startServer(opts) {
  const model = (opts && opts.model) || new FakeTrello();
  const sdk = fs.readFileSync(path.join(__dirname, 'power-up-sdk.js'), 'utf8');

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);

    if (p.indexOf('/__fake/') === 0) {
      const sub = p.slice('/__fake/'.length);
      if (sub === 'power-up.min.js') {
        const cfg = Object.assign({}, model.config);
        return send(res, 200, 'window.__FAKE_TRELLO__ = ' + JSON.stringify(cfg) + ';\n' + sdk, TYPES['.js']);
      }
      if (sub === 'rpc' && req.method === 'POST') {
        let msg = {};
        try {
          msg = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch (e) { /* bad json */ }
        try {
          const result = model.rpc(msg.method, msg.args, msg.ctx || {});
          return send(res, 200, { result: result === undefined ? null : result });
        } catch (err) {
          return send(res, 200, { error: { name: err.name || 'Error', message: err.message } });
        }
      }
      if (sub === 'gap' && req.method === 'POST') {
        let msg = {};
        try {
          msg = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch (e) { /* ignore */ }
        model.gaps.push({ kind: 'sdk', what: msg.what, page: msg.page });
        return send(res, 200, {});
      }
      if (sub === 'auth' && req.method === 'POST') {
        let msg = {};
        try {
          msg = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch (e) { /* ignore */ }
        model.config.authorized = !!msg.authorized;
        return send(res, 200, { authorized: model.config.authorized });
      }
      if (sub === 'config' && req.method === 'POST') {
        let msg = {};
        try {
          msg = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch (e) { /* ignore */ }
        Object.assign(model.config, msg);
        return send(res, 200, model.config);
      }
      if (sub === 'reset' && req.method === 'POST') {
        model.reset();
        return send(res, 200, { ok: true });
      }
      if (sub === 'state') {
        return send(res, 200, {
          config: model.config,
          lists: model.lists,
          cards: model.cards,
          restCalls: model.restLog.length,
          gaps: model.gaps,
          violations: model.violations,
        });
      }
      if (sub === 'index.html') {
        const links = pageList()
          .map((f) => '<li><a href="/' + f + '">' + f + '</a></li>')
          .join('');
        return send(res, 200, '<!doctype html><meta charset="utf-8"><title>Fake Trello</title><body style="font:14px system-ui;margin:24px"><h1>Fake Trello</h1><p><a href="/__fake/board.html">Open the fake board</a> (Power-Up buttons and card badges)</p><h2>Pages</h2><ul>' + links + '</ul>', TYPES['.html']);
      }
      if (sub === 'board.html' || sub === 'board.js') {
        const file = path.join(__dirname, sub === 'board.html' ? 'board.html' : 'board.js');
        let body = fs.readFileSync(file, 'utf8');
        if (sub === 'board.html') body = body.split(SDK_URL).join('/__fake/power-up.min.js');
        return send(res, 200, body, sub === 'board.html' ? TYPES['.html'] : TYPES['.js']);
      }
      if (/^1\//.test(sub)) {
        const query = {};
        url.searchParams.forEach((v, k) => {
          query[k] = v;
        });
        const raw = await readBody(req);
        let body = null;
        if (raw.length && /json/.test(req.headers['content-type'] || '')) {
          try {
            body = JSON.parse(raw.toString('utf8'));
          } catch (e) { /* ignore */ }
        }
        const out = model.rest(req.method, '/' + sub.slice(2), query, body);
        return send(res, out.status, out.body);
      }
      return send(res, 404, 'unknown fake endpoint ' + sub);
    }

    if (p === '/favicon.ico') return send(res, 204, '');

    // Static: the repo itself.
    let rel = p;
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || /[\\/](\.git|\.dev-cert|node_modules|e2e)[\\/]/.test(file + path.sep)) {
      return send(res, 403, 'Forbidden');
    }
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Not found');
      const ext = path.extname(file).toLowerCase();
      if (ext === '.html') data = Buffer.from(data.toString('utf8').split(SDK_URL).join('/__fake/power-up.min.js'));
      send(res, 200, data, TYPES[ext] || 'application/octet-stream');
    });
  };

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handler(req, res).catch((err) => send(res, 500, 'fake server error: ' + err.stack));
    });
    server.on('error', reject);
    server.listen((opts && opts.port) || 0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: 'http://127.0.0.1:' + port,
        port,
        model,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

module.exports = { startServer, ROOT, pageList };
