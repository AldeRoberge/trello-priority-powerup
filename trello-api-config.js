/* Trello Power-Up REST API key — required for card cover colors on the board.
 * 1. Go to https://trello.com/power-ups/admin
 * 2. Open your Power-Up → API Key tab → copy the key
 * 3. Paste it below (leave empty to disable cover sync; badges still work)
 */
(function (global) {
  'use strict';

  global.TrelloApiConfig = {
    appKey: '',
    appName: 'Priorité',
  };
})(typeof window !== 'undefined' ? window : this);
