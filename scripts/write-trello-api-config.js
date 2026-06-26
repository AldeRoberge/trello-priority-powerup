const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'trello-api-config.js');
const inCi = process.env.GITHUB_ACTIONS === 'true';

if (!inCi && fs.existsSync(target)) {
  console.log('Not in CI and trello-api-config.js already exists — skipping.');
  process.exit(0);
}

const appKey = process.env.TRELLO_API_KEY || '';
const appName = 'Trello Priority Powerup';

const content = `/* Trello Power-Up REST API key — required for card cover colors on the board.
 * Generated at CI build time from the TRELLO_API_KEY repository secret.
 * Local dev: copy trello-api-config-template.js to trello-api-config.js and set appKey.
 */
(function (global) {
  'use strict';

  global.TrelloApiConfig = {
    appKey: ${JSON.stringify(appKey)},
    appName: ${JSON.stringify(appName)},
  };
})(typeof window !== 'undefined' ? window : this);
`;

fs.writeFileSync(target, content);

if (!appKey) {
  console.warn(
    'TRELLO_API_KEY is unset — trello-api-config.js written with empty appKey; card cover sync disabled on deployed site.'
  );
} else {
  console.log('Generated trello-api-config.js for deployment.');
}
