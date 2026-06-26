/* Trello Power-Up REST API key — required for card cover colors on the board.
 * 1. Copy this file to trello-api-config.js (trello-api-config.js is gitignored)
 * 2. Go to https://trello.com/power-ups/admin
 * 3. Open your Power-Up → API Key tab → copy the key
 * 4. Paste it below (leave empty to disable cover sync; badges still work)
 * 5. Same Power-Up → API Key tab → Allowed origins: https://YOUR-USER.github.io
 *    Iframe connector URL: https://YOUR-USER.github.io/trello-priority-powerup/index.html
 *
 * Production (GitHub Pages): set repository secret TRELLO_API_KEY — CI generates trello-api-config.js at deploy time.
 */
(function (global) {
  'use strict';

  global.TrelloApiConfig = {
    appKey: '',
    appName: 'Trello Priority Powerup',
  };
})(typeof window !== 'undefined' ? window : this);
