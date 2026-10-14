const fs = require('fs');
const path = require('path');
const { commitToken } = require('./version-assets');

const root = path.join(__dirname, '..');
const target = path.join(root, 'build-info.json');
const changelog = path.join(root, 'CHANGELOG.md');

/**
 * Reads the `## AAAA-MM-JJ` sections of CHANGELOG.md, newest first.
 * Each `- ` line under a section becomes one item.
 */
function parseChangelog(text, limit = 10) {
  const releases = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = /^##\s+(\d{4}-\d{2}-\d{2})\b/.exec(line);
    if (heading) {
      current = { date: heading[1], items: [] };
      releases.push(current);
      continue;
    }
    const item = /^\s*-\s+(.+)$/.exec(line);
    if (item && current) current.items.push(item[1].trim());
  }
  return releases.slice(0, limit);
}

function stamp() {
  const builtAt = new Date().toISOString();
  const info = { builtAt };
  const commit = commitToken(process.env.GITHUB_SHA || '');
  if (commit) info.commit = commit;
  const text = fs.existsSync(changelog) ? fs.readFileSync(changelog, 'utf8') : '';
  info.releases = parseChangelog(text);
  fs.writeFileSync(target, JSON.stringify(info, null, 2) + '\n');
  console.log('Stamped build-info.json:', builtAt, '· releases:', info.releases.length);
}

if (require.main === module) stamp();

module.exports = { parseChangelog };
