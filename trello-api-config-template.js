/* Trello Power-Up REST API key — required for card cover colors on the board.
 * 1. Copy this file to trello-api-config.js (trello-api-config.js is gitignored)
 * 2. Go to https://trello.com/power-ups/admin
 * 3. Open your Power-Up → API Key tab → copy the key
 * 4. Paste it below (leave empty to disable cover sync; badges still work)
 */
(function (global) {
  'use strict';

  global.TrelloApiConfig = {
    appKey: '',
    appName: 'Trello Priority Powerup',
  };
})(typeof window !== 'undefined' ? window : this);
