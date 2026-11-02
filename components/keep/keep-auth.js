/*
 * Role: Trello access for the standalone Notes app (outside the Power-Up iframe).
 * Keeps the REST token and the chosen board in localStorage and offers the small `t` object that
 * DocsTrello needs (board, lists, getRestApi). Exposes window.KeepAuth.
 */
(function (global) {
  'use strict';

  var TOKEN_KEY = 'trello_token';
  var BOARD_KEY = 'keep.board';
  var RETURN_KEY = 'keep.authReturn';
  var API = 'https://api.trello.com/1';

  function store() {
    try {
      return global.localStorage;
    } catch (e) {
      return null;
    }
  }

  function read(k) {
    var s = store();
    try {
      return (s && s.getItem(k)) || '';
    } catch (e) {
      return '';
    }
  }

  function write(k, v) {
    var s = store();
    try {
      if (!s) return;
      if (v) s.setItem(k, v);
      else s.removeItem(k);
    } catch (e) {
      /* private mode */
    }
  }

  function cfg() {
    return global.PriorityRestConfig || {};
  }

  /** A token pasted by hand may arrive as a whole URL or with spaces: keep only the token. */
  function cleanToken(text) {
    var t = String(text || '').trim();
    var m = /[#&?]token=([A-Za-z0-9_-]+)/.exec(t);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : '';
  }

  function token() { return read(TOKEN_KEY); }
  function setToken(v) { write(TOKEN_KEY, cleanToken(v)); return !!token(); }
  function boardId() { return read(BOARD_KEY); }
  function setBoard(id) { write(BOARD_KEY, /^[A-Za-z0-9]{8,}$/.test(String(id || '')) ? id : ''); }
  function signOut() { write(TOKEN_KEY, ''); write(BOARD_KEY, ''); }

  /** Full-page authorization: Trello sends the user back to auth-return.html, which stores the token. */
  function authorizeUrl(returnUrl) {
    var params = {
      expiration: 'never',
      scope: 'read,write',
      name: cfg().appName || 'Trello Cerveau',
      key: cfg().appKey,
      callback_method: 'fragment',
      response_type: 'fragment',
      return_url: returnUrl,
    };
    if (cfg().appAuthor) params.author = cfg().appAuthor;
    return (
      'https://trello.com/1/authorize?' +
      Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&')
    );
  }

  function startAuthorize() {
    var back = new URL('./keep.html', global.location.href).href;
    write(RETURN_KEY, back);
    global.location.href = authorizeUrl(new URL('./auth-return.html', global.location.href).href);
  }

  async function get(path) {
    var res = await fetch(API + path + (path.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(cfg().appKey) + '&token=' + encodeURIComponent(token()));
    if (!res.ok) {
      var err = new Error('http-' + res.status);
      err.reason = 'http-' + res.status;
      throw err;
    }
    return res.json();
  }

  function listBoards() {
    return get('/members/me/boards?filter=open&fields=id,name');
  }

  /** The Power-Up client, reduced to what DocsTrello and SheetsTrello call. */
  function makeT() {
    return {
      board: async function () { return { id: boardId() }; },
      lists: async function () { return get('/boards/' + encodeURIComponent(boardId()) + '/lists'); },
      getRestApi: async function () {
        return {
          isAuthorized: async function () { return !!token(); },
          getToken: async function () { return token(); },
        };
      },
    };
  }

  global.KeepAuth = {
    RETURN_KEY: RETURN_KEY,
    cleanToken: cleanToken,
    token: token,
    setToken: setToken,
    boardId: boardId,
    setBoard: setBoard,
    signOut: signOut,
    authorizeUrl: authorizeUrl,
    startAuthorize: startAuthorize,
    listBoards: listBoards,
    makeT: makeT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
