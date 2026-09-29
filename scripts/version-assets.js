// CI-only: append ?v=<commit> to every local .js/.css reference in the root HTML
// pages so each deploy busts GitHub Pages' 10-minute browser cache
// (Cache-Control: max-age=600) without hand-bumped ?v= tokens.
// Rewrites the checkout in place — never commit its output.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = (process.argv[2] || process.env.GITHUB_SHA || String(Date.now())).slice(0, 10);
const ref = /((?:src|href)=")(\.\/[^"?#]+\.(?:js|css))(\?[^"]*)?(")/g;

let files = 0;
let refs = 0;
for (const name of fs.readdirSync(root)) {
  if (!name.endsWith('.html')) continue;
  const file = path.join(root, name);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(ref, (m, a, url, q, z) => {
    refs++;
    return a + url + '?v=' + version + z;
  });
  if (after !== before) {
    fs.writeFileSync(file, after);
    files++;
  }
}
console.log('Versioned ' + refs + ' asset refs in ' + files + ' pages (v=' + version + ')');
