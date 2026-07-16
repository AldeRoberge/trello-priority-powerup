/* REST / OAuth settings for auto-sort (optional). Set appKey from trello.com/power-ups/admin.
 * Product name / author come from PriorityBrand (components/shared/brand.js) when loaded. */
(function (global) {
  'use strict';

  var brand = global.PriorityBrand || {};

  global.PriorityRestConfig = {
    appKey: 'e449f4c01b03a2501072808abe5611ab',
    appName: brand.appName || 'Cerveau',
    appAuthor: brand.appAuthor || 'AldeRoberge',
    autoSortDebounceMs: 400,
  };
})(typeof window !== 'undefined' ? window : this);
