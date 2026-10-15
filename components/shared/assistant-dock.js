/*
 * Role: the Assistant box docked at the bottom of every view (Table, Gantt, Kanban, Mindmap, Dashboard,
 * Documents, Entités). Always open: one message box that takes text, pasted / dropped images and files.
 * The AI (KanbanAI.run, with the board's cards and lists) decides what to create or change; files are
 * attached to the cards it creates. This replaces the old Capture page.
 *
 *   AssistantDock.mount({ t, after: mountEl, onRefresh, isBusy })
 *     after     element the dock is inserted after (the view's mount node, inside a flex-column body)
 *     onRefresh () => any   called after the AI wrote something, to reload the view
 *     isBusy    () => bool  unused here (kept so the views' calls stay valid)
 *   → { root, focus, toggle }   toggle() just focuses the box (the dock has no collapsed state)
 */
(function (global) {
  'use strict';

  var MAX_FILE_BYTES = 10 * 1048576; // Trello's attachment limit
  var MAX_SHOTS = 4; // images sent to the model
  var SHOT_EDGE = 1600; // longest edge sent to the model, in px
  var LOG_KEEP = 4;
  var LOG_FADE_MS = 45000;
  var IMG_RE = /^image\/(png|jpe?g|gif|webp|bmp)$/;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
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

  function mount(opts) {
    opts = opts || {};
    var t = opts.t;
    var files = []; // { id, file, thumb }
    var seq = 0;
    var busy = false;
    var log = []; // { who: 'me' | 'ai' | 'error', text, at }

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
    root.appendChild(logEl);
    root.appendChild(attsEl);
    root.appendChild(composer);

    function addLog(who, text) {
      log.push({ who: who, text: text, at: Date.now() });
      if (log.length > LOG_KEEP) log.shift();
      renderLog();
    }

    function renderLog() {
      var now = Date.now();
      log = log.filter(function (m) { return now - m.at < LOG_FADE_MS || m.who === 'error'; });
      logEl.innerHTML = '';
      logEl.hidden = !log.length;
      log.forEach(function (m) {
        logEl.appendChild(el('div', 'ad-dock-msg is-' + m.who, m.text));
      });
      logEl.scrollTop = logEl.scrollHeight;
    }
    setInterval(function () { if (root.isConnected && log.length) renderLog(); }, 5000);

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
      var shots = sending.filter(function (a) { return IMG_RE.test(a.file.type); }).slice(0, MAX_SHOTS);
      Promise.all(shots.map(function (a) { return toDataUrl(a.file); })).then(function (urls) {
        var attachments = sending.map(function (a) {
          var i = shots.indexOf(a);
          return { name: a.file.name, type: a.file.type, dataUrl: i >= 0 ? urls[i] : '' };
        });
        return TT.load(t).then(function (board) {
          return AI.run(t, {
            text: text,
            rows: board.rows,
            lists: board.lists,
            attachments: attachments,
            files: sending.map(function (a) { return a.file; }),
          });
        });
      }).then(function (res) {
        var parts = [];
        if (res.applied.length) parts.push(res.applied.join(', '));
        else if (res.message) parts.push(res.message);
        else parts.push('Rien à faire.');
        if (res.failed.length) parts.push('Échec : ' + res.failed.join(' ; '));
        addLog(res.failed.length && !res.applied.length ? 'error' : 'ai', parts.join(' — '));
        if (res.applied.length) {
          sending.forEach(function (a) { if (a.thumb) try { URL.revokeObjectURL(a.thumb); } catch (e) { /* ignore */ } });
          files = [];
          renderAtts();
          if (typeof opts.onRefresh === 'function') try { opts.onRefresh(); } catch (e) { /* view gone */ }
        } else if (!res.failed.length) {
          input.value = text; // nothing happened (a question came back): keep the draft
          grow();
        }
      }, function (err) {
        input.value = text;
        grow();
        addLog('error', (err && (err.message || err.reason)) || 'Erreur de l’assistant.');
      }).then(function () {
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
    return { root: root, focus: focus, toggle: focus };
  }

  global.AssistantDock = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
