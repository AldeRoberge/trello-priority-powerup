/* REST / OAuth settings for auto-sort (optional). Set appKey from trello.com/power-ups/admin. */
(function (global) {
  'use strict';

  global.PriorityRestConfig = {
    appKey: 'e449f4c01b03a2501072808abe5611ab',
    appName: 'Priorité',
    appAuthor: 'AldeRoberge',
    autoSortDebounceMs: 400,
  };
})(typeof window !== 'undefined' ? window : this);
