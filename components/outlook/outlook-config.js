/* Outlook / Microsoft Graph config (public SPA client). Set clientId from Entra. */
(function (global) {
  'use strict';

  function defaultRedirectUri() {
    try {
      if (typeof global.location !== 'undefined' && global.location.href) {
        return new URL('./outlook-auth.html', global.location.href).href
          .split('#')[0]
          .split('?')[0];
      }
    } catch (e) {
      /* ignore */
    }
    return './outlook-auth.html';
  }

  global.OutlookConfig = {
    /** Entra application (client) ID — paste from Azure portal SPA registration. */
    clientId: '63646e5d-10ae-406e-9b37-c6cca8609082',
    /**
     * Authority: "common" allows work + personal Microsoft accounts.
     * Use "organizations" for work-only, or a tenant GUID.
     */
    authority: 'https://login.microsoftonline.com/common',
    /** Popup redirect page (must match Entra SPA redirect URI exactly). */
    redirectUri: defaultRedirectUri(),
    scopes: ['User.Read', 'Calendars.ReadWrite', 'offline_access'],
    graphBase: 'https://graph.microsoft.com/v1.0',
    /** Open extension name for trelloCardId on calendar events. */
    extensionName: 'Com.TrelloCerveau.CardLink',
  };
})(typeof window !== 'undefined' ? window : this);
