/* REST / OAuth settings for auto-sort (optional). Set appKey from trello.com/power-ups/admin. */
(function (global) {
  'use strict';

  global.PriorityRestConfig = {
    appKey: '',
    appName: 'Priorité',
    appAuthor: 'AldeRoberge',
    autoSortDebounceMs: 400,
  };
})(typeof window !== 'undefined' ? window : this);
