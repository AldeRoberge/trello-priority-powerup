/*
 * Role: the Assistant box docked at the bottom of every view (Table, Gantt, Kanban, Mindmap, Dashboard,
 * Documents, Entités). Folded, it is the message box plus the last reply on one line. The top edge
 * opens it the way Triage opens a row or its split: drag anywhere on that edge to reveal more or less
 * of the conversation, click to fold, double-click to come back to the usual height. The AI
 * (KanbanAI.run, with the board's cards and lists) decides what to create or change; files are
 * attached to the cards it creates.
 *
 *   AssistantDock.mount({ t, after: mountEl, onRefresh, isBusy })
 *     after     element the dock is inserted after (the view's mount node, inside a flex-column body)
 *     onRefresh () => any   called after the AI wrote something, to reload the view
 *     isBusy    () => bool  unused here (kept so the views' calls stay valid)
 *   → { root, focus, toggle }   toggle() focuses the box
 */
(function (global) {
  'use strict';

  var live = null; // the dock on this page, so Ctrl+F can ask without opening a second chat
  var MAX_FILE_BYTES = 10 * 1048576; // Trello's attachment limit
  var MAX_SHOTS = 4; // images sent to the model
  var SHOT_EDGE = 1600; // longest edge sent to the model, in px
  var LOG_KEEP = 50; // lines kept for the session; folded, only the last one is shown
  var LOG_MIN_H = 48;
  var LOG_DEFAULT_H = 220;
  var LOG_MAX_H = 640;
  var COLLAPSE_UNDER = 28; // a drag below this folds the conversation
  var GRIP_KEY = 'tp.assistantDock.history';

  /** Open height of the conversation. Under COLLAPSE_UNDER it folds; the caller keeps the previous open height. */
  function clampLog(h, max) {
    var cap = typeof max === 'number' && max > 0 ? max : LOG_MAX_H;
    if (cap < LOG_MIN_H) cap = LOG_MIN_H;
    var n = Number(h);
    if (!(n > COLLAPSE_UNDER)) return { open: false, h: LOG_DEFAULT_H };
    if (n < LOG_MIN_H) n = LOG_MIN_H;
    if (n > cap) n = cap;
    return { open: true, h: Math.round(n) };
  }

  function logMax() {
    var view = global.innerHeight || 800;
    return Math.max(LOG_MIN_H, Math.min(LOG_MAX_H, Math.round(view * 0.5) - 80));
  }
  var MAX_CARDS = 4; // task panels kept open above the box; the oldest closes first
  var IMG_RE = /^image\/(png|jpe?g|gif|webp|bmp)$/;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Same peach face as the assistant chat, still (no blink, no glow). */
  function avatar() {
    var face = el('span', 'ad-dock-avatar');
    face.setAttribute('aria-hidden', 'true');
    face.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="28" height="28" focusable="false">' +
      '<ellipse cx="20" cy="20" rx="19.2" ry="19.2" fill="#f5b58a"/>' +
      '<ellipse cx="20" cy="20" rx="19.2" ry="19.2" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.4"/>' +
      '<ellipse cx="14.2" cy="17.6" rx="2.35" ry="2.7" fill="#2a211c"/>' +
      '<ellipse cx="25.8" cy="17.6" rx="2.35" ry="2.7" fill="#2a211c"/>' +
      '<circle cx="15" cy="16.7" r="0.7" fill="#fff"/>' +
      '<circle cx="26.6" cy="16.7" r="0.7" fill="#fff"/>' +
      '<path d="M14.4 24.4c1.8 2.4 4.2 3.5 5.6 3.5s3.8-1.1 5.6-3.5" fill="none" stroke="#6b3f2a" stroke-width="1.55" stroke-linecap="round"/>' +
      '</svg>';
    return face;
  }

  function icon(name) {
    var i = el('i', 'ti ti-' + name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function stamp() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2);
  }

  /** Pasted screenshots are all called image.png: give them a readable, distinct name. */
  function named(file) {
    if (file.name && file.name !== 'image.png') return file;
    var ext = ((file.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg');
    try { return new File([file], 'Capture ' + stamp() + '.' + ext, { type: file.type }); } catch (e) { return file; }
  }

  /** Image File → downscaled JPEG data URL for the model ('' when it cannot be decoded). */
  function toDataUrl(file) {
    return new Promise(function (resolve) {
      var url = global.URL && URL.createObjectURL ? URL.createObjectURL(file) : '';
      if (!url) return resolve('');
      var img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, SHOT_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { resolve(''); }
        URL.revokeObjectURL(url);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  /**
   * What the box says about an AI result. A task that was just created is not repeated as a line: it opens as a
   * task panel (`created`, one per new card) when the page can show one (`rich`); otherwise it stays a line.
   * -> { text, kind: 'ai' | 'error', created: [{ id, title, list, text }] }
   */
  function outcome(res, rich) {
    res = res || {};
    var applied = res.applied || [];
    var failed = res.failed || [];
    var made = rich ? (res.created || []).filter(function (c) { return c && c.id; }) : [];
    var madeText = made.map(function (c) { return c.text; });
    var rest = applied.filter(function (s) { return madeText.indexOf(s) < 0; });
    var parts = [];
    if (rest.length) parts.push(rest.join(', '));
    else if (!made.length) parts.push(res.message || 'Rien à faire.');
    if (failed.length) parts.push('Échec : ' + failed.join(' ; '));
    return { text: parts.join(' — '), kind: failed.length && !applied.length ? 'error' : 'ai', created: made };
  }

  function mount(opts) {
    opts = opts || {};
    var t = opts.t;
    var files = []; // { id, file, thumb }
    var seq = 0;
    var busy = false;
    var log = []; // { who: 'me' | 'ai' | 'error', text, at, action? }
    var cards = []; // task panels: { destroy }

    var root = el('div', 'ad-dock');
    if (opts.after && opts.after.parentNode) opts.after.parentNode.insertBefore(root, opts.after.nextSibling);
    else document.body.appendChild(root);

    var logEl = el('div', 'ad-dock-log');
    logEl.setAttribute('role', 'log');
    logEl.setAttribute('aria-live', 'polite');
    var attsEl = el('div', 'ad-dock-atts');
    var composer = el('div', 'ad-dock-composer');
    var picker = el('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.hidden = true;
    var clip = el('button', 'ad-dock-btn');
    clip.type = 'button';
    clip.title = 'Joindre des fichiers';
    clip.setAttribute('aria-label', 'Joindre des fichiers');
    clip.appendChild(icon('paperclip'));
    var input = el('textarea', 'ad-dock-input');
    input.setAttribute('data-ai', 'off');
    input.rows = 1;
    input.placeholder = 'Une tâche, une idée, une image…';
    input.setAttribute('aria-label', 'Message à l\'assistant');
    var send = el('button', 'ad-dock-btn ad-dock-send');
    send.type = 'button';
    send.title = 'Envoyer (Entrée)';
    send.setAttribute('aria-label', 'Envoyer');
    send.appendChild(icon('arrow-up'));
    composer.appendChild(clip);
    composer.appendChild(input);
    composer.appendChild(send);
    composer.appendChild(picker);
    var loadHost = el('div', 'ad-dock-load');
    loadHost.hidden = true;
    var cardsEl = el('div', 'ad-dock-cards'); // task panels float above the box, so the view behind does not move
    cardsEl.hidden = true;
    // Top edge, like the Triage split: drag anywhere to reveal more or less, click to fold,
    // double-click to come back to the usual height. A folded line also opens on click.
    var grip = el('div', 'ad-dock-grip');
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'horizontal');
    grip.tabIndex = 0;
    var gripIcon = icon('chevron-up');
    grip.appendChild(gripIcon);
    var open = false;
    var logH = LOG_DEFAULT_H;
    try {
      var saved = JSON.parse(global.localStorage.getItem(GRIP_KEY) || 'null');
      if (saved) {
        open = !!saved.open;
        var restored = clampLog(saved.h, LOG_MAX_H);
        if (restored.open) logH = restored.h;
      }
    } catch (e) { /* storage unavailable: defaults */ }
    function persist() {
      try { global.localStorage.setItem(GRIP_KEY, JSON.stringify({ open: open, h: logH })); } catch (e2) { /* ignore */ }
    }
    function paintSize() {
      root.classList.toggle('is-open', open);
      grip.setAttribute('aria-expanded', open ? 'true' : 'false');
      var label = open ? 'Replier' : 'Déplier';
      grip.setAttribute('aria-label', label);
      grip.title = label;
      gripIcon.className = 'ti ti-chevron-' + (open ? 'down' : 'up');
      if (open) {
        logEl.hidden = false;
        logEl.style.height = logH + 'px';
        logEl.style.maxHeight = logH + 'px';
      } else {
        logEl.style.height = '';
        logEl.style.maxHeight = '';
        logEl.hidden = !log.length;
      }
    }
    function applyOpen() {
      renderLog();
      persist();
    }
    function setFromHeight(next) {
      var was = open;
      var c = clampLog(next, logMax());
      open = c.open;
      if (c.open) logH = c.h;
      if (was !== open) renderLog();
      else paintSize();
    }
    grip.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;
      var y0 = ev.clientY;
      var h0 = logEl.hidden ? 0 : logEl.getBoundingClientRect().height;
      var moved = false;
      grip.classList.add('is-drag');
      document.documentElement.classList.add('ad-resizing');
      function move(e) {
        if (!moved && Math.abs(e.clientY - y0) < 4) return;
        moved = true;
        setFromHeight(h0 + (y0 - e.clientY));
      }
      function end() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
        grip.classList.remove('is-drag');
        document.documentElement.classList.remove('ad-resizing');
        if (!moved) { open = !open; renderLog(); }
        persist();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
      ev.preventDefault();
      ev.stopPropagation();
    });
    grip.addEventListener('dblclick', function () {
      open = true;
      logH = Math.min(LOG_DEFAULT_H, logMax());
      applyOpen();
    });
    grip.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFromHeight((open ? logH : 0) + (e.key === 'ArrowUp' ? 32 : -32));
        persist();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open = !open;
        applyOpen();
      }
    });
    logEl.addEventListener('click', function (e) {
      if (open) return;
      if (e.target.closest && e.target.closest('button')) return;
      open = true;
      applyOpen();
    });
    root.appendChild(grip);
    root.appendChild(cardsEl);
    root.appendChild(logEl);
    root.appendChild(loadHost);
    root.appendChild(attsEl);
    root.appendChild(composer);
    applyOpen();

    function addLog(who, text, action) {
      log.push({ who: who, text: text, at: Date.now(), action: action || null });
      if (log.length > LOG_KEEP) log.shift();
      renderLog();
    }

    function renderLog() {
      paintSize();
      logEl.innerHTML = '';
      // Folded: one line, the latest reply. Open: the whole conversation, at the height that was dragged.
      var shown = open ? log : (log.length ? [log[log.length - 1]] : []);
      if (!open) logEl.hidden = !shown.length;
      shown.forEach(function (m) {
        var row = el('div', 'ad-dock-msg is-' + m.who);
        if (m.who !== 'me') row.appendChild(avatar());
        row.appendChild(el('span', 'ad-dock-msg-text', m.text));
        if (m.action) {
          var act = el('button', 'ad-dock-msg-act', m.action.label);
          act.type = 'button';
          act.addEventListener('click', function () {
            log = log.filter(function (x) { return x !== m; });
            renderLog();
            try { m.action.run(); } catch (e) { /* the host reports its own errors */ }
          });
          row.appendChild(act);
        }
        logEl.appendChild(row);
      });
      if (open) logEl.scrollTop = logEl.scrollHeight;
    }

    function refreshView() {
      if (typeof opts.onRefresh === 'function') try { opts.onRefresh(); } catch (e) { /* view gone */ }
    }

    /** A task the assistant just created, open as the shared task panel (status, progress, priority, date, people, description). */
    function addCard(made) {
      var CQ = global.CardQuick;
      var entry = el('div', 'ad-dock-card');
      var panel = el('div', 'ad-dock-card-panel');
      entry.appendChild(avatar());
      entry.appendChild(panel);
      cardsEl.appendChild(entry);
      var quick = null;
      var item = {
        destroy: function () {
          if (quick) quick.destroy();
          quick = null;
          if (entry.parentNode) entry.parentNode.removeChild(entry);
          cards = cards.filter(function (c) { return c !== item; });
          cardsEl.hidden = !cards.length;
          input.focus();
        },
      };
      cards.push(item);
      quick = CQ.mount(panel, {
        t: t,
        cardId: made.id,
        name: made.title,
        waitForCard: true,
        onChange: refreshView,
        onClose: item.destroy,
        onToast: function (message, kind, action) {
          if (kind === 'error') addLog('error', message);
          else if (action) addLog('ai', message, action);
        },
        onGone: function () {
          item.destroy();
          refreshView();
        },
      });
      while (cards.length > MAX_CARDS) cards[0].destroy();
      cardsEl.hidden = false;
      return entry;
    }

    function renderAtts() {
      attsEl.innerHTML = '';
      attsEl.hidden = !files.length;
      files.forEach(function (a) {
        var chip = el('span', 'ad-dock-att');
        chip.title = a.file.name;
        if (a.thumb) {
          var im = el('img', 'ad-dock-att-img');
          im.alt = '';
          im.src = a.thumb;
          chip.appendChild(im);
        } else {
          chip.appendChild(icon(a.file.type === 'application/pdf' ? 'file-type-pdf' : 'file'));
        }
        chip.appendChild(el('span', 'ad-dock-att-name', a.file.name));
        var x = el('button', 'ad-dock-att-x');
        x.type = 'button';
        x.setAttribute('aria-label', 'Retirer');
        x.appendChild(icon('x'));
        x.addEventListener('click', function () {
          if (a.thumb) try { URL.revokeObjectURL(a.thumb); } catch (e) { /* ignore */ }
          files = files.filter(function (f) { return f !== a; });
          renderAtts();
          input.focus();
        });
        chip.appendChild(x);
        attsEl.appendChild(chip);
      });
      refreshSend();
    }

    function addFiles(list) {
      Array.prototype.forEach.call(list || [], function (raw) {
        if (raw.size > MAX_FILE_BYTES) {
          addLog('error', '« ' + raw.name + ' » dépasse 10 Mo (limite de Trello).');
          return;
        }
        var file = named(raw);
        var isImg = IMG_RE.test(file.type);
        files.push({ id: ++seq, file: file, thumb: isImg && global.URL && URL.createObjectURL ? URL.createObjectURL(file) : '' });
      });
      renderAtts();
    }

    var loadCtl = null;
    var turnEstimate = 8000;

    function stopLoad() {
      if (loadCtl) {
        var waited = loadCtl.elapsed();
        if (waited > 400) turnEstimate = Math.round(turnEstimate * 0.35 + waited * 0.65);
        loadCtl.stop();
        loadCtl = null;
      }
      loadHost.hidden = true;
      loadHost.textContent = '';
    }

    function startLoad() {
      stopLoad();
      var UI = global.AgentUI;
      if (!UI || typeof UI.mountLoading !== 'function') return;
      loadHost.hidden = false;
      loadHost.appendChild(avatar());
      loadCtl = UI.mountLoading(loadHost, {
        estimateMs: turnEstimate,
        phases: ['prepare', 'send', 'read', 'write'],
        phase: 'prepare'
      });
    }

    function refreshSend() {
      send.disabled = busy || (!input.value.trim() && !files.length);
      input.disabled = busy;
      root.classList.toggle('is-busy', busy);
    }

    function grow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    }

    function submit() {
      var text = input.value.trim();
      if (busy || (!text && !files.length)) return;
      var AI = global.KanbanAI;
      var TT = global.TableTrello;
      if (!AI || !TT) return addLog('error', 'Assistant indisponible sur cette page.');
      var sending = files.slice();
      busy = true;
      addLog('me', (text || '') + (sending.length ? (text ? ' ' : '') + '📎 ' + sending.length : ''));
      input.value = '';
      grow();
      refreshSend();
      var instant = !sending.length && ((AI.socialReply && AI.socialReply(text)) || (AI.arithmeticReply && AI.arithmeticReply(text)));
      if (!instant) startLoad();
      var shots = sending.filter(function (a) { return IMG_RE.test(a.file.type); }).slice(0, MAX_SHOTS);
      Promise.all(shots.map(function (a) { return toDataUrl(a.file); })).then(function (urls) {
        var attachments = sending.map(function (a) {
          var i = shots.indexOf(a);
          return { name: a.file.name, type: a.file.type, dataUrl: i >= 0 ? urls[i] : '' };
        });
        return TT.load(t).then(function (board) {
          if (loadCtl) loadCtl.setPhase('send');
          return AI.run(t, {
            text: text,
            rows: board.rows,
            lists: board.lists,
            attachments: attachments,
            files: sending.map(function (a) { return a.file; }),
            onStatus: function (phase) {
              if (loadCtl) loadCtl.setPhase(phase);
            }
          });
        });
      }).then(function (res) {
        var CQ = global.CardQuick;
        var out = outcome(res, !!(CQ && typeof CQ.mount === 'function'));
        if (out.text) addLog(out.kind, out.text);
        if (out.created.length) {
          CQ.invalidate(); // the snapshot taken before the creation does not hold these cards
          var entries = out.created.map(addCard);
          if (entries[0].scrollIntoView) entries[0].scrollIntoView({ block: 'start' }); // earlier panels scroll away
        }
        if (res.applied.length) {
          sending.forEach(function (a) { if (a.thumb) try { URL.revokeObjectURL(a.thumb); } catch (e) { /* ignore */ } });
          files = [];
          renderAtts();
          refreshView();
        } else if (!res.failed.length && AI.keepsDraft && AI.keepsDraft(text, res.message)) {
          input.value = text; // a real question came back: keep the draft so it can be edited
          grow();
        }
      }, function (err) {
        input.value = text;
        grow();
        addLog('error', (err && (err.message || err.reason)) || 'Erreur de l’assistant.');
      }).then(function () {
        stopLoad();
        busy = false;
        refreshSend();
        input.focus();
      });
    }

    input.addEventListener('input', function () { grow(); refreshSend(); });
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') input.blur();
    });
    input.addEventListener('paste', function (e) {
      var fl = e.clipboardData && e.clipboardData.files;
      if (fl && fl.length) { e.preventDefault(); addFiles(fl); }
    });
    send.addEventListener('click', submit);
    clip.addEventListener('click', function () { picker.click(); });
    picker.addEventListener('change', function () {
      addFiles(picker.files);
      picker.value = '';
      input.focus();
    });
    root.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
        e.preventDefault();
        root.classList.add('is-drop');
      }
    });
    root.addEventListener('dragleave', function (e) {
      if (!root.contains(e.relatedTarget)) root.classList.remove('is-drop');
    });
    root.addEventListener('drop', function (e) {
      root.classList.remove('is-drop');
      var fl = e.dataTransfer && e.dataTransfer.files;
      if (!fl || !fl.length) return;
      e.preventDefault();
      addFiles(fl);
      input.focus();
    });

    renderLog();
    renderAtts();
    function focus() { try { input.focus(); } catch (e) { /* ignore */ } }
    /** Send one search question. The board is not edited; the model only answers. */
    function ask(text) {
      var q = String(text || '').trim();
      if (!q || busy) return false;
      input.value = 'Cherche dans le tableau, sans rien modifier : ' + q;
      grow();
      refreshSend();
      focus();
      submit();
      return true;
    }
    live = { ask: ask };
    return { root: root, focus: focus, toggle: focus, ask: ask };
  }

  function ask(text) {
    return !!(live && live.ask(text));
  }

  // toDataUrl / named are shared with the Triage document (images pasted there are read the same way).
  global.AssistantDock = { mount: mount, ask: ask, toDataUrl: toDataUrl, named: named, IMG_RE: IMG_RE, outcome: outcome, clampLog: clampLog };
})(typeof window !== 'undefined' ? window : this);
