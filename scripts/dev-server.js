// Local dev server: serves the Power-Up over HTTPS with no caching and live reload.
// Point the Power-Up's Iframe connector URL at https://localhost:8443/index.html
// and every file save reloads Trello's iframes within ~1 s (no commit, no deploy).
//   npm run dev
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 8443;
const certDir = path.join(root, '.dev-cert');
const keyFile = path.join(certDir, 'localhost.key');
const certFile = path.join(certDir, 'localhost.crt');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

function findOpenssl() {
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\mingw64\\bin\\openssl.exe',
  ];
  for (const c of candidates) {
    const r = spawnSync(c, ['version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return c;
  }
  return null;
}

function ensureCert() {
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) return true;
  const openssl = findOpenssl();
  if (!openssl) {
    console.error('openssl not found (it ships with Git for Windows). Install Git or add openssl to PATH.');
    return false;
  }
  fs.mkdirSync(certDir, { recursive: true });
  const conf = path.join(certDir, 'openssl.cnf');
  fs.writeFileSync(
    conf,
    [
      '[req]',
      'distinguished_name=dn',
      'x509_extensions=v3',
      'prompt=no',
      '[dn]',
      'CN=localhost',
      '[v3]',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      'basicConstraints=CA:TRUE',
      'keyUsage=digitalSignature,keyEncipherment,keyCertSign',
      'extendedKeyUsage=serverAuth',
      '',
    ].join('\n')
  );
  const r = spawnSync(
    openssl,
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-keyout', keyFile, '-out', certFile, '-config', conf],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error('Certificate generation failed:\n' + (r.stderr || r.stdout));
    return false;
  }
  console.log('Created certificate in .dev-cert/');
  trustCert();
  return true;
}

function trustCert() {
  if (process.platform !== 'win32') {
    console.log('Trust ' + certFile + ' in your OS/browser, or open the URL once and accept the warning.');
    return;
  }
  console.log('Windows will ask to trust the localhost certificate — click Yes.');
  const r = spawnSync('certutil', ['-user', '-addstore', 'Root', certFile], { encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) {
    console.log('Could not trust it automatically; open the URL once in Chrome and accept the warning.');
  }
}

const clients = new Set();
const RELOAD_SNIPPET =
  '<script>(function(){try{var s=new EventSource("/__reload");s.onmessage=function(){location.reload()};}catch(e){}})();</script>';

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const headers = {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };
  if (url.pathname === '/__reload') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }, headers));
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root) || /[\\/](\.git|\.dev-cert|node_modules)[\\/]/.test(file + path.sep)) {
    res.writeHead(403, headers);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, headers);
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    headers['Content-Type'] = types[ext] || 'application/octet-stream';
    if (ext === '.html') data = Buffer.from(data.toString('utf8') + RELOAD_SNIPPET);
    res.writeHead(200, headers);
    res.end(data);
  });
}

let timer = null;
function broadcast() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write('data: reload\n\n');
    console.log('Reloaded ' + clients.size + ' page(s)');
  }, 150);
}

if (!ensureCert()) process.exit(1);

https
  .createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, handler)
  .listen(port, () => {
    console.log('\nDev server ready — set the Power-Up Iframe connector URL to:');
    console.log('  https://localhost:' + port + '/index.html\n');
  });

fs.watch(root, { recursive: true }, (evt, name) => {
  if (!name || /^(\.git|\.dev-cert|node_modules|coverage)([\\/]|$)/.test(name)) return;
  if (/build-info\.json$/.test(name)) return;
  broadcast();
});
