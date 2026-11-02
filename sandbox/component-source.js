'use strict';
// Source text of a component for vm-based verify scripts. A component split into parts
// (components/<dir>/<name>.parts.json) is returned as its parts joined in load order, whichever of its
// files is asked for.
const fs = require('fs');
const path = require('path');

function read(rel) {
  const abs = path.join(__dirname, '..', 'components', rel);
  const dir = path.dirname(abs);
  const base = path.basename(abs);
  const own = abs.replace(/\.js$/, '.parts.json');
  const candidates = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.parts.json')) : [];
  const ordered = fs.existsSync(own) ? [path.basename(own)].concat(candidates) : candidates;
  for (const f of ordered) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (m.parts.includes(base) || path.join(dir, f) === own) return m.parts.map((p) => fs.readFileSync(path.join(dir, p), 'utf8')).join('\n');
  }
  return fs.readFileSync(abs, 'utf8');
}

module.exports = { read };
