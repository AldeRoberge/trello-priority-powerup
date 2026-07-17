/* Product branding — customize appName / tagline / icon paths here. */
(function (global) {
  'use strict';

  var DEFAULT_APP_NAME = 'Trello Cerveau';

  var Brand = {
    /** Display name shown in modals, badges, OAuth, and page titles. */
    appName: DEFAULT_APP_NAME,
    appAuthor: 'AldeRoberge',
    /** Short line under the name on the landing page. */
    tagline: 'Power-Up Trello',
    /** Welcome / marketing subtitle. */
    subtitle:
      "Évaluez chaque carte selon l'urgence, l'impact et la facilité pour obtenir un score et un libellé de palier.",
    /** Relative paths from site root (Power-Up admin + landing). */
    iconSvg: './assets/icon.svg',
    iconPng: './assets/icon.png',
  };

  Brand.getAppName = function () {
    var name = typeof Brand.appName === 'string' ? Brand.appName.trim() : '';
    return name || DEFAULT_APP_NAME;
  };

  Brand.applyDocumentTitle = function (documentRef) {
    var doc = documentRef || (typeof document !== 'undefined' ? document : null);
    if (!doc) return Brand.getAppName();
    doc.title = Brand.getAppName();
    return doc.title;
  };

  Brand.applyLanding = function (documentRef) {
    var doc = documentRef || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    var name = Brand.getAppName();
    var titleEl = doc.getElementById('brandTitle');
    if (titleEl) titleEl.textContent = name;
    var taglineEl = doc.getElementById('brandTagline');
    if (taglineEl) taglineEl.textContent = Brand.tagline || '';
    var logoEl = doc.getElementById('brandLogo');
    if (logoEl && Brand.iconPng) {
      logoEl.src = Brand.iconPng;
      logoEl.alt = name;
    }
    Brand.applyDocumentTitle(doc);
  };

  global.PriorityBrand = Brand;
})(typeof window !== 'undefined' ? window : this);
