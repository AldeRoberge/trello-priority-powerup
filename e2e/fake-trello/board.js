/*
 * The fake Trello board: loads the Power-Up connector (/index.html) in a hidden iframe, asks it for
 * its capabilities (board buttons, card badges, card-back section...) and draws them the way Trello
 * does. Clicking a board button opens its view in a modal iframe; clicking a card opens the card back.
 * Test hook: window.__fakeBoardReady is true once buttons and card faces are drawn.
 */
(function () {
  'use strict';
  var connector = document.getElementById('connector');
  var CFG = TrelloPowerUp.__config;
  var base = new URL('/index.html', location.href).href;
  var caps = null;
  var cards = [];
  var lists = [];

  function client(card) {
    return TrelloPowerUp.__makeClient({ ctx: { card: card ? card.id : null, list: card ? card.idList : null }, base: base });
  }
  function postJson(path, body) {
    return fetch('/__fake' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      return r.json();
    });
  }
  function rpc(method, args, ctx) {
    return postJson('/rpc', { method: method, args: args, ctx: ctx || { board: CFG.board, member: CFG.member } }).then(function (r) {
      return r.result;
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function cap(name, t) {
    if (!caps || typeof caps[name] !== 'function') return Promise.resolve(null);
    try {
      return Promise.resolve(caps[name](t, {})).catch(function (e) {
        console.error('capability ' + name + ' failed', e);
        return null;
      });
    } catch (e) {
      console.error('capability ' + name + ' threw', e);
      return Promise.resolve(null);
    }
  }

  function renderButtons() {
    var host = document.getElementById('buttons');
    host.textContent = '';
    return cap('board-buttons', client(null)).then(function (list) {
      (list || []).forEach(function (b) {
        var btn = el('button', 'fk-board-button', b.text);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          if (typeof b.callback === 'function') b.callback(client(null), {});
        });
        host.appendChild(btn);
      });
    });
  }

  function renderBadges(card, into) {
    return cap('card-badges', client(card)).then(function (badges) {
      (badges || []).forEach(function (b) {
        if (b && typeof b.dynamic === 'function') b = b.dynamic();
        Promise.resolve(b).then(function (badge) {
          if (!badge || !badge.text) return;
          var chip = el('span', 'fk-badge', badge.text);
          if (badge.color) chip.setAttribute('data-color', badge.color);
          if (badge.title) chip.title = badge.title;
          into.appendChild(chip);
        });
      });
    });
  }

  function renderBoard() {
    var host = document.getElementById('lists');
    host.textContent = '';
    var jobs = [];
    var labels = {};
    return Promise.all([rpc('lists', []), rpc('cards', []), rpc('board', ['labels'])]).then(function (r) {
      lists = r[0];
      cards = r[1];
      (r[2].labels || []).forEach(function (l) {
        labels[l.id] = l;
      });
      lists.forEach(function (list) {
        var col = el('section', 'fk-list');
        col.setAttribute('data-list', list.id);
        col.appendChild(el('h2', '', list.name));
        cards
          .filter(function (c) {
            return c.idList === list.id;
          })
          .forEach(function (card) {
            var b = el('button', 'fk-card');
            b.type = 'button';
            b.setAttribute('data-card', card.id);
            var lb = el('div', 'fk-labels');
            (card.idLabels || []).forEach(function (id) {
              var s = el('span', 'fk-label');
              if (labels[id]) s.title = labels[id].name;
              lb.appendChild(s);
            });
            b.appendChild(lb);
            b.appendChild(el('div', 'fk-card-name', card.name));
            var badges = el('div', 'fk-badges');
            b.appendChild(badges);
            jobs.push(renderBadges(card, badges));
            b.addEventListener('click', function () {
              openCard(card);
            });
            col.appendChild(b);
          });
        host.appendChild(col);
      });
      return Promise.all(jobs);
    });
  }

  function openCard(card) {
    var back = document.getElementById('cardBack');
    var body = document.getElementById('cardBackBody');
    body.textContent = '';
    body.appendChild(el('h2', '', card.name));
    if (card.desc) body.appendChild(el('p', '', card.desc));
    var t = client(card);
    var detail = el('div', 'fk-details');
    body.appendChild(detail);
    cap('card-detail-badges', t).then(function (badges) {
      (badges || []).forEach(function (b) {
        var btn = el('button', 'fk-detail', (b.title ? b.title + ': ' : '') + (b.text || ''));
        btn.type = 'button';
        btn.addEventListener('click', function (ev) {
          if (typeof b.callback === 'function') b.callback(client(card), { element: ev.currentTarget });
        });
        detail.appendChild(btn);
      });
    });
    cap('card-back-section', t).then(function (section) {
      if (!section) return;
      var wrap = el('div', 'fk-section');
      wrap.appendChild(el('h3', '', section.title || ''));
      if (section.content && section.content.url) {
        var f = document.createElement('iframe');
        f.title = section.title || 'section';
        f.style.height = (section.content.height || 200) + 'px';
        f.name = 'fake-t:' + JSON.stringify({ args: {}, ctx: { card: card.id, list: card.idList }, kind: 'section' });
        f.src = section.content.url;
        wrap.appendChild(f);
      }
      if (section.action && section.action.text) {
        var a = el('button', 'fk-detail', section.action.text);
        a.type = 'button';
        a.addEventListener('click', function () {
          if (typeof section.action.callback === 'function') section.action.callback(client(card), {});
        });
        wrap.appendChild(a);
      }
      body.appendChild(wrap);
    });
    back.hidden = false;
  }

  document.getElementById('cardBackClose').addEventListener('click', function () {
    document.getElementById('cardBack').hidden = true;
  });
  document.getElementById('enable').addEventListener('click', function () {
    cap('on-enable', client(null));
  });
  var themeSel = document.getElementById('theme');
  themeSel.value = CFG.theme || 'light';
  themeSel.addEventListener('change', function () {
    postJson('/config', { theme: themeSel.value }).then(function () {
      location.reload();
    });
  });

  function whenCapabilities() {
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function poll() {
        var w = connector.contentWindow;
        if (w && w.__fakeCapabilities) return resolve(w.__fakeCapabilities);
        if (++tries > 200) return reject(new Error('The connector never called TrelloPowerUp.initialize()'));
        setTimeout(poll, 50);
      })();
    });
  }

  whenCapabilities()
    .then(function (c) {
      caps = c;
      window.__fakeCapabilityNames = Object.keys(c);
      return Promise.all([renderButtons(), renderBoard()]);
    })
    .then(
      function () {
        window.__fakeBoardReady = true;
      },
      function (err) {
        console.error(err);
        window.__fakeBoardError = String(err && err.message);
      }
    );
})();
