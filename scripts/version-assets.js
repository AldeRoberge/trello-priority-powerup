// CI-only: stamp ?v=<commit> on every local asset in HTML pages, and load the
// build watcher, so a deploy shows up without a hard refresh.
// GitHub Pages caches for 10 minutes (Cache-Control: max-age=600). Rewrites the
// checkout in place — never commit its output.
const fs = require('fs');
const path = require('path');

const SKIP_DIR = {
  node_modules: true,
  '.git': true,
  coverage: true,
  workers: true,
  '.dev-cert': true
};

function commitToken(sha) {
  return String(sha || '').trim().slice(0, 10);
}

function versionUrl(raw, version) {
  const url = String(raw || '').trim();
  if (!url || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;
  const hashAt = url.indexOf('#');
  const frag = hashAt >= 0 ? url.slice(hashAt) : '';
  const before = hashAt >= 0 ? url.slice(0, hashAt) : url;
  if (!/\.(?:js|css|html|svg|png|json|woff2?)(?:$|\?)/i.test(before)) return url;
  if (/build-info\.json(?:$|\?)/i.test(before)) return url;
  const qAt = before.indexOf('?');
  const pathPart = qAt >= 0 ? before.slice(0, qAt) : before;
  const query = qAt >= 0 ? before.slice(qAt + 1) : '';
  const params = query.split('&').filter((part) => part && part.slice(0, 2) !== 'v=');
  params.unshift('v=' + version);
  return pathPart + '?' + params.join('&') + frag;
}

function ensureWatcher(html, version, scriptSrc) {
  let out = String(html || '');
  const head = /<head(\s[^>]*)?>/i;
  if (!head.test(out)) return out;
  if (!/components\/shared\/version\.js/.test(out)) {
    out = out.replace(head, (open) => open + '\n  <script src="' + scriptSrc + '"></script>');
  }
  if (!/name="cerveau-build"/.test(out)) {
    out = out.replace(head, (open) => open + '\n  <meta name="cerveau-build" content="">');
  }
  return out.replace(
    /name="cerveau-build" content="[^"]*"/,
    'name="cerveau-build" content="' + version + '"'
  );
}

function rewriteHtml(html, version, scriptSrc) {
  const withWatcher = ensureWatcher(html, version, scriptSrc || './components/shared/version.js');
  return withWatcher.replace(/(\s(?:src|href)\s*=\s*")([^"]+)(")/gi, (match, open, url, close) => {
    const next = versionUrl(url, version);
    if (next === url) return match;
    return open + next + close;
  });
}

function scriptSrcFor(file, root) {
  const rel = path.relative(path.dirname(file), path.join(root, 'components', 'shared', 'version.js'));
  return rel.split(path.sep).join('/');
}

function htmlFiles(dir, root, out) {
  out = out || [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return out;
  }
  names.forEach((name) => {
    if (SKIP_DIR[name]) return;
    const file = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(file);
    } catch (e) {
      return;
    }
    if (st.isDirectory()) htmlFiles(file, root, out);
    else if (name.endsWith('.html')) out.push(file);
  });
  return out;
}

function applyVersion(root, version) {
  const token = commitToken(version);
  let pages = 0;
  let refs = 0;
  htmlFiles(root, root).forEach((file) => {
    const before = fs.readFileSync(file, 'utf8');
    const after = rewriteHtml(before, token, scriptSrcFor(file, root));
    if (after === before) return;
    const seen = after.match(/\?v=/g);
    refs += seen ? seen.length : 0;
    fs.writeFileSync(file, after);
    pages += 1;
  });
  return { pages: pages, refs: refs, version: token };
}

function main() {
  const root = path.join(__dirname, '..');
  const version = commitToken(process.argv[2] || process.env.GITHUB_SHA || String(Date.now()));
  const result = applyVersion(root, version);
  console.log(
    'Versioned ' + result.refs + ' asset refs in ' + result.pages + ' pages (v=' + result.version + ')'
  );
}

if (require.main === module) main();

module.exports = {
  commitToken,
  versionUrl,
  rewriteHtml,
  applyVersion
};
