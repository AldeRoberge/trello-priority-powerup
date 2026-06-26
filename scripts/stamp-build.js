const fs = require('fs');
const path = require('path');

const builtAt = new Date().toISOString();
const target = path.join(__dirname, '..', 'build-info.json');

fs.writeFileSync(target, JSON.stringify({ builtAt }, null, 2) + '\n');
console.log('Stamped build-info.json:', builtAt);
