/*
 * Role: starts the Notes app: service worker, sign-in (Trello token), board choice, then the screen.
 * Exposes nothing.
 */
(function (global) {
  'use strict';

  var root = document.getElementById('app');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function connectScreen() {
    root.textContent = '';
    var box = el('div', 'k-connect');
    box.appendChild(el('h1', '', 'Notes'));
    var go = el('button', 'k-primary', 'Se connecter avec Trello');
    go.type = 'button';
    go.addEventListener('click', function () { global.KeepAuth.startAuthorize(); });
    box.appendChild(go);
    var more = el('button', 'k-link', 'Coller un jeton');
    more.type = 'button';
    var input = el('input', 'k-token');
    input.placeholder = 'Jeton';
    input.hidden = true;
    more.addEventListener('click', function () { input.hidden = !input.hidden; if (!input.hidden) input.focus(); });
    input.addEventListener('change', function () {
      if (global.KeepAuth.setToken(input.value)) start();
      else {
        input.value = '';
        input.placeholder = 'Jeton invalide';
      }
    });
    box.appendChild(more);
    box.appendChild(input);
    root.appendChild(box);
  }

  async function boardScreen() {
    root.textContent = '';
    var box = el('div', 'k-connect');
    box.appendChild(el('h1', '', 'Tableau'));
    var list = el('div', 'k-boards');
    box.appendChild(list);
    root.appendChild(box);
    try {
      var boards = await global.KeepAuth.listBoards();
      boards.forEach(function (b) {
        var item = el('button', '', b.name);
        item.type = 'button';
        item.addEventListener('click', function () { global.KeepAuth.setBoard(b.id); start(); });
        list.appendChild(item);
      });
    } catch (e) {
      if (e && e.reason === 'http-401') {
        global.KeepAuth.signOut();
        connectScreen();
      } else list.appendChild(el('p', 'k-empty', 'Hors ligne'));
    }
  }

  function start() {
    var A = global.KeepAuth;
    if (!A.token()) return connectScreen();
    if (!A.boardId()) return boardScreen();
    var store = global.KeepStore.create();
    var t = A.makeT();
    var sync = global.KeepSync.create({ store: store, api: global.KeepSync.trelloApi(t) });
    global.KeepUI.mount(root, {
      sync: sync,
      store: store,
      onSignOut: function () { A.signOut(); start(); },
    });
  }

  if ('serviceWorker' in global.navigator) {
    global.navigator.serviceWorker.register('./sw.js').catch(function () { /* optional */ });
  }
  start();
})(window);
