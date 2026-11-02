'use strict';
// Source text of a component for vm-based verify scripts. A component split into parts
// (components/<dir>/<name>.parts.json) is returned as its parts joined in load order.
const fs = require('fs');
const path = require('path');

function read(rel) {
  const abs = path.join(__dirname, '..', 'components', rel);
  const manifest = abs.replace(/\.js$/, '.parts.json');
  if (!fs.existsSync(abs) && fs.existsSync(manifest)) {
    const parts = JSON.parse(fs.readFileSync(manifest, 'utf8')).parts;
    return parts.map((p) => fs.readFileSync(path.join(path.dirname(abs), p), 'utf8')).join('\n');
  }
  return fs.readFileSync(abs, 'utf8');
}

module.exports = { read };
