'use strict';

/**
 * Structure guard: node scripts/check-structure.js [--update-baseline]
 *
 * 1. Every local <script src> / <link href> in a page points at a file that exists.
 * 2. A component split into parts (components/<dir>/<name>.parts.json) is loaded by each page in full and in order.
 * 3. No component file grows past MAX_LINES unless it is listed in scripts/size-baseline.json, and a listed file may
 *    not grow beyond its recorded size (shrink it, then run --update-baseline to lower the limit).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MAX_LINES = 1500;
const BASELINE_FILE = path.join(__dirname, 'size-baseline.json');
const SKIP = new Set(['node_modules', '.git', 'coverage', 'workers', '.dev-cert', 'e2e']);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const files = walk(ROOT, []);
const problems = [];

// 1 + 2: pages
const manifests = files.filter((f) => f.endsWith('.parts.json')).map((f) => ({ dir: path.dirname(f), data: JSON.parse(fs.readFileSync(f, 'utf8')) }));
for (const page of files.filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(page, 'utf8');
  const srcs = [];
  const re = /<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1].split('?')[0].split('#')[0];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(url) || !url) continue;
    const abs = url.startsWith('/') ? path.join(ROOT, url) : path.resolve(path.dirname(page), url);
    if (!fs.existsSync(abs)) problems.push(`${rel(page)}: missing file ${url}`);
    srcs.push(abs);
  }
  for (const mf of manifests) {
    const want = mf.data.parts.map((p) => path.join(mf.dir, p));
    const at = want.map((w) => srcs.indexOf(w));
    if (at.every((i) => i < 0)) continue;
    const missing = want.filter((w, i) => at[i] < 0).map(rel);
    if (missing.length) problems.push(`${rel(page)}: ${mf.data.name} parts missing: ${missing.join(', ')}`);
    else if (at.some((v, i) => i > 0 && v < at[i - 1])) problems.push(`${rel(page)}: ${mf.data.name} parts are not in the order of ${mf.data.name}.parts.json`);
  }
}

// 3: sizes
const lineCount = (f) => fs.readFileSync(f, 'utf8').split('\n').length;
const sizes = {};
for (const f of files.filter((x) => /^components\/.*\.(js|css)$/.test(rel(x)))) {
  const n = lineCount(f);
  if (n > MAX_LINES) sizes[rel(f)] = n;
}
if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(sizes, null, 2) + '\n');
  console.log(`baseline written: ${Object.keys(sizes).length} files over ${MAX_LINES} lines`);
} else {
  const base = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
  for (const [f, n] of Object.entries(sizes)) {
    if (!(f in base)) problems.push(`${f}: ${n} lines, over the ${MAX_LINES} limit. Split it into smaller files.`);
    else if (n > base[f]) problems.push(`${f}: grew from ${base[f]} to ${n} lines. Split it instead of adding to it.`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('structure ok');
