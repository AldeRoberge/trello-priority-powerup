/* Outlook auth — MSAL public client (popup) for Microsoft Graph. */
(function (global) {
  'use strict';

  var pca = null;
  var initPromise = null;

  function cfg() {
    return global.OutlookConfig || null;
  }

  function msalLib() {
    return global.msal || null;
  }

  function isConfigured() {
    var c = cfg();
    return !!(c && typeof c.clientId === 'string' && c.clientId.trim());
  }

  function resolveRedirectUri() {
    var c = cfg();
    if (!c) return '';
    if (typeof c.redirectUri === 'string' && c.redirectUri) {
      try {
        return new URL(c.redirectUri, global.location.href).href
          .split('#')[0]
          .split('?')[0];
      } catch (e) {
        return c.redirectUri;
      }
    }
    try {
      return new URL('./outlook-auth.html', global.location.href).href
        .split('#')[0]
        .split('?')[0];
    } catch (e2) {
      return './outlook-auth.html';
    }
  }

  function ensurePca() {
    if (pca) return Promise.resolve(pca);
    if (initPromise) return initPromise;
    if (!isConfigured()) {
      return Promise.reject(new Error('outlook-client-id-missing'));
    }
    var lib = msalLib();
    if (!lib || typeof lib.PublicClientApplication !== 'function') {
      return Promise.reject(new Error('msal-missing'));
    }
    var c = cfg();
    var instance = new lib.PublicClientApplication({
      auth: {
        clientId: String(c.clientId).trim(),
        authority: c.authority || 'https://login.microsoftonline.com/common',
        redirectUri: resolveRedirectUri(),
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
      },
    });
    initPromise = Promise.resolve()
      .then(function () {
        if (typeof instance.initialize === 'function') {
          return instance.initialize().then(function () {
            return instance;
          });
        }
        return instance;
      })
      .then(function (ready) {
        pca = ready;
        return pca;
      })
      .catch(function (err) {
        initPromise = null;
        throw err;
      });
    return initPromise;
  }

  function scopes() {
    var c = cfg();
    return (c && Array.isArray(c.scopes) && c.scopes.length
      ? c.scopes.slice()
      : ['User.Read', 'Calendars.ReadWrite', 'offline_access']);
  }

  function getAccount(instance) {
    if (!instance) return null;
    if (typeof instance.getActiveAccount === 'function') {
      var active = instance.getActiveAccount();
      if (active) return active;
    }
    var all =
      typeof instance.getAllAccounts === 'function'
        ? instance.getAllAccounts()
        : [];
    return all && all.length ? all[0] : null;
  }

  function isConnected() {
    if (!isConfigured() || !msalLib()) return Promise.resolve(false);
    return ensurePca()
      .then(function (instance) {
        return !!getAccount(instance);
      })
      .catch(function () {
        return false;
      });
  }

  function connect() {
    if (!isConfigured()) {
      return Promise.resolve({ ok: false, reason: 'no-client-id' });
    }
    return ensurePca()
      .then(function (instance) {
        return instance
          .loginPopup({
            scopes: scopes(),
            redirectUri: resolveRedirectUri(),
          })
          .then(function (result) {
            if (result && result.account && typeof instance.setActiveAccount === 'function') {
              instance.setActiveAccount(result.account);
            }
            return {
              ok: true,
              account: result && result.account ? result.account : null,
            };
          });
      })
      .catch(function (err) {
        return {
          ok: false,
          reason: 'login-failed',
          error: err && err.message ? err.message : String(err),
        };
      });
  }

  function disconnect() {
    if (!isConfigured() || !msalLib()) {
      return Promise.resolve({ ok: true, skipped: true });
    }
    return ensurePca()
      .then(function (instance) {
        var account = getAccount(instance);
        if (!account) return { ok: true, already: true };
        if (typeof instance.logoutPopup === 'function') {
          return instance
            .logoutPopup({
              account: account,
              mainWindowRedirectUri: resolveRedirectUri(),
            })
            .then(function () {
              return { ok: true };
            })
            .catch(function () {
              if (typeof instance.setActiveAccount === 'function') {
                instance.setActiveAccount(null);
              }
              return { ok: true, localOnly: true };
            });
        }
        if (typeof instance.setActiveAccount === 'function') {
          instance.setActiveAccount(null);
        }
        return { ok: true, localOnly: true };
      })
      .catch(function (err) {
        return {
          ok: false,
          reason: 'logout-failed',
          error: err && err.message ? err.message : String(err),
        };
      });
  }

  function getAccessToken() {
    if (!isConfigured()) {
      return Promise.resolve({ ok: false, reason: 'no-client-id' });
    }
    return ensurePca().then(function (instance) {
      var account = getAccount(instance);
      if (!account) {
        return { ok: false, reason: 'not-connected' };
      }
      var request = {
        scopes: scopes(),
        account: account,
      };
      return instance
        .acquireTokenSilent(request)
        .then(function (result) {
          if (!result || !result.accessToken) {
            return { ok: false, reason: 'no-token' };
          }
          return { ok: true, accessToken: result.accessToken, account: account };
        })
        .catch(function () {
          return instance.acquireTokenPopup(request).then(function (result) {
            if (!result || !result.accessToken) {
              return { ok: false, reason: 'no-token' };
            }
            if (result.account && typeof instance.setActiveAccount === 'function') {
              instance.setActiveAccount(result.account);
            }
            return {
              ok: true,
              accessToken: result.accessToken,
              account: result.account || account,
            };
          });
        });
    });
  }

  global.OutlookAuth = {
    isConfigured: isConfigured,
    isConnected: isConnected,
    connect: connect,
    disconnect: disconnect,
    getAccessToken: getAccessToken,
    resolveRedirectUri: resolveRedirectUri,
  };
})(typeof window !== 'undefined' ? window : this);
