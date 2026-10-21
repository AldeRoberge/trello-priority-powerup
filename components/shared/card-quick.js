/*
 * Role: shared "quick card" panel, the rich preview of one Trello card with the same quick actions
 * as the Kanban tile: status (move to a list), progress ring + bar, blocked, priority, due date,
 * estimate, description, rename, open, archive. It only composes shared pieces (CardFields editors,
 * ProgressRing, TableTrello writes, ContextMenu), so a view that needs a card popup (Documents
 * hover/click on a task chip today) gets every action without its own copy.
 *
 *   CardQuick.mount(host, {
 *     t, cardId, name,                 // name: shown while the card loads
 *     onOpen(),                        // "Ouvrir la carte" (the host opens the full card)
 *     onChange(),                      // something was saved (the host refreshes its own chips)
 *     onHold(on),                      // an editor / menu is open: the host must not close the panel
 *     onToast(message, kind, action),  // optional feedback; action = { label, run }
 *     onGone(),                        // the card was archived: the host closes the panel
 *     onClose(),                       // optional: adds an "x" to the header (the host closes the panel)
 *     waitForCard,                     // optional: the card was just created, wait for Trello to list it
 *   }) -> { refresh(), destroy() }
 *
 * Pure helpers (describe, pctFromX) are exported for unit tests.
 */
(function (global) {
  'use strict';

  var TTL = 15000;
  var WAIT_RETRIES = 6; // opts.waitForCard: reads of the board before giving up on a card that was just created
  var WAIT_MS = 600;
  var cache = null; // { t, at, promise }

  function TT() { return global.TableTrello; }
  function TM() { return global.TableModel; }
  function CF() { return global.CardFields; }
  function CM() { return global.ContextMenu; }

  function el(tag, cls, attrs, kids) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function ico(name) {
    return el('i', 'ti ti-' + name, { 'aria-hidden': 'true' });
  }

  function msg(err) {
    return (err && (err.message || err.reason)) || String(err || 'erreur');
  }

  /**
   * The row of a card, by its Trello id. The short link (the code in the card's URL, /c/AbCd1234/…) is accepted too,
   * so a caller that only knows the link still finds its card.
   */
  function rowFor(rows, cardId) {
    var id = cardId == null ? '' : String(cardId);
    if (!id) return null;
    var list = rows || [];
    var i;
    for (i = 0; i < list.length; i++) if (list[i] && String(list[i].id) === id) return list[i];
    for (i = 0; i < list.length; i++) {
      var url = list[i] && list[i].link;
      if (url && (String(url) + '/').indexOf('/c/' + id + '/') >= 0) return list[i];
    }
    return null;
  }

  /** The panel found no card for this id: say so in the console (it used to fail without a trace). */
  function reportMissing(cardId, rows) {
    var d = global.TpDebug;
    if (d && typeof d.log === 'function') d.log('cardQuick', 'card-not-found', { cardId: String(cardId), rows: (rows || []).length });
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn('CardQuick: no card ' + cardId + ' among the ' + (rows || []).length + ' cards of the board snapshot');
    }
  }

  /* ── Pure helpers ───────────────────────────────────────────────── */

  var URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };

  function isClosedKey(key) {
    return key === 'completed' || key === 'canceled';
  }

  /** What the panel shows for a board row (same data shape as the Table / Kanban rows). */
  function describe(row, todayIso) {
    row = row || {};
    var pct = typeof row.progress === 'number' ? Math.max(0, Math.min(100, Math.round(row.progress))) : 0;
    var closed = isClosedKey(row.statutKey);
    var due = String(row.due || '');
    return {
      pct: pct,
      done: pct >= 100 || closed,
      blocked: !!row.blocked,
      overdue: /^\d{4}-\d{2}-\d{2}/.test(due) && due.slice(0, 10) < String(todayIso || '') && !closed,
      urgencyTone: row.urgency ? (URGENCY_TONE[row.urgency] == null ? 0 : URGENCY_TONE[row.urgency]) : null,
      hasDesc: !!String(row.desc || '').trim(),
    };
  }

  /** Progress (0-100) for a pointer at `x` over a bar spanning [left, left + width]. */
  function pctFromX(left, width, x, fallback) {
    if (!(width > 0)) return fallback;
    return Math.max(0, Math.min(100, Math.round(((x - left) / width) * 100)));
  }

  /**
   * Resize a box from one corner. `corner` is nw, ne, sw or se.
   * dx/dy are pointer deltas. The opposite corner stays put. Min size is enforced
   * without pulling that opposite corner.
   */
  function resizeRect(rect, corner, dx, dy, minW, minH) {
    rect = rect || {};
    var left = rect.left || 0;
    var top = rect.top || 0;
    var width = rect.width || 0;
    var height = rect.height || 0;
    var growE = corner === 'ne' || corner === 'se';
    var growS = corner === 'sw' || corner === 'se';
    minW = minW > 0 ? minW : 0;
    minH = minH > 0 ? minH : 0;
    if (growE) width += dx;
    else { width -= dx; left += dx; }
    if (growS) height += dy;
    else { height -= dy; top += dy; }
    if (width < minW) {
      if (!growE) left -= minW - width;
      width = minW;
    }
    if (height < minH) {
      if (!growS) top -= minH - height;
      height = minH;
    }
    return { left: left, top: top, width: width, height: height };
  }

  /**
   * Next zoom of a box so the point (x, y) stays under the cursor.
   * `box` is the visual rectangle; scales are the layout multiplier (1 = natural).
   */
  function zoomAt(box, x, y, prevScale, nextScale) {
    box = box || {};
    var scale = prevScale > 0 ? prevScale : 1;
    var next = nextScale > 0 ? nextScale : scale;
    var width = box.width || 0;
    var height = box.height || 0;
    var left = box.left || 0;
    var top = box.top || 0;
    var fx = width ? (x - left) / width : 0;
    var fy = height ? (y - top) / height : 0;
    var layoutW = width / scale;
    var layoutH = height / scale;
    return {
      scale: next,
      left: x - fx * layoutW * next,
      top: y - fy * layoutH * next,
    };
  }

  function todayIso() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ── Data ───────────────────────────────────────────────────────── */

  /** The board snapshot (rows + lists), shared by every open panel for a few seconds. */
  function loadBoard(t, force) {
    if (!force && cache && cache.t === t && Date.now() - cache.at < TTL) return cache.promise;
    var promise = Promise.resolve(TT().load(t));
    cache = { t: t, at: Date.now(), promise: promise };
    promise.catch(function () {
      if (cache && cache.promise === promise) cache = null;
    });
    return promise;
  }

  function invalidate() {
    cache = null;
  }

  /** Same write as the Kanban / Table: move every subtask with the master, or the card's own progress. */
  function writeProgress(t, cardId, pct) {
    var CT = global.CompletionTrello;
    if (!CT || typeof CT.getCardCompletionById !== 'function') return Promise.reject(new Error('Éditeur de progrès indisponible'));
    return CT.getCardCompletionById(t, cardId).then(function (data) {
      data = CT.normalizeCompletionData(data || { items: [] });
      var next = data.items && data.items.length
        ? Object.assign({}, data, { items: CT.applyMasterProgress(data.items, pct) })
        : Object.assign({}, data, { progress: pct });
      return CT.saveCardCompletionById(t, cardId, CT.normalizeCompletionData(next));
    });
  }

  /** Sets the progress; reaching 100 % also moves the card to the board's completed list (like the Table). */
  function setProgress(t, row, lists, pct) {
    return writeProgress(t, row.id, pct).then(function () {
      var done = pct >= 100 && row.statutKey !== 'completed'
        ? (lists || []).filter(function (l) { return l.category === 'completed'; })[0]
        : null;
      return done ? TT().moveCard(t, row.id, done.id, 'bottom').then(function () { return done; }) : null;
    });
  }

  /* ── Panel ──────────────────────────────────────────────────────── */

  function mount(host, opts) {
    opts = opts || {};
    var t = opts.t;
    var state = { row: null, lists: [], alive: true, editingTitle: false };
    var root = el('div', 'cq');
    host.appendChild(root);

    function toast(m, kind, action) {
      if (typeof opts.onToast === 'function') opts.onToast(m, kind, action);
    }
    function hold(on) {
      if (typeof opts.onHold === 'function') opts.onHold(!!on);
    }
    function failed(err) {
      toast(msg(err), 'error');
    }

    /** Keeps the host from closing while a ContextMenu (no close hook of its own) is on screen. */
    function watchMenu() {
      hold(true);
      var started = Date.now();
      (function poll() {
        if (!state.alive) return;
        if (document.querySelector('.tp-context-menu') && Date.now() - started < 60000) setTimeout(poll, 200);
        else hold(false);
      })();
    }

    function showMenu(anchor, items) {
      if (!CM() || typeof CM().show !== 'function') return;
      var r = anchor.getBoundingClientRect();
      CM().show({ clientX: r.left, clientY: r.bottom + 4 }, items);
      watchMenu();
    }

    /** Reloads the card from a fresh board snapshot and repaints. */
    function refresh() {
      invalidate();
      return loadBoard(t, true).then(function (data) {
        if (!state.alive) return;
        state.lists = data.lists || [];
        state.row = rowFor(data.rows, opts.cardId);
        if (!state.row) reportMissing(opts.cardId, data.rows);
        paint();
      }, function (err) {
        if (!state.alive) return;
        paintMessage('Aperçu indisponible : ' + msg(err));
      });
    }

    function saved() {
      if (typeof opts.onChange === 'function') opts.onChange();
      return refresh();
    }

    /** Runs a write, then repaints from Trello (so the panel always shows what is really saved). */
    function run(write, okMsg) {
      return Promise.resolve()
        .then(write)
        .then(function () {
          if (okMsg) toast(okMsg, 'ok');
          return saved();
        }, function (err) {
          failed(err);
          return refresh();
        });
    }

    function openField(kind, anchor, extra) {
      var cf = CF();
      if (!cf || !anchor) return;
      var changed = false;
      hold(true);
      var ok = cf.open(kind, Object.assign({
        t: t,
        cardId: state.row.id,
        cardName: state.row.name,
        anchor: anchor,
        onSaved: function () { changed = true; },
        onError: failed,
        onClose: function (didChange) {
          hold(false);
          if (didChange || changed) saved();
        },
      }, extra || {}));
      if (!ok) hold(false);
    }

    function paintMessage(text) {
      root.textContent = '';
      var head = bareHead();
      if (head) root.appendChild(head);
      root.appendChild(el('div', 'cq-note', { text: text }));
    }

    /* Header: status (move) + open + more */
    function statusButton(row) {
      var list = state.lists.filter(function (l) { return l.id === row.listId; })[0];
      var color = row.statutColor || (list && list.color) || '#626f86';
      var b = el('button', 'cq-status', {
        type: 'button',
        title: 'Changer de liste',
        style: '--cq-accent:' + color,
      }, [ico(list && list.icon ? list.icon : 'circle'), el('span', 'cq-status-name', { text: row.statut || 'Sans liste' }), ico('chevron-down')]);
      b.addEventListener('click', function () {
        showMenu(b, state.lists.map(function (l) {
          return {
            id: 'list:' + l.id,
            label: l.name,
            icon: l.icon,
            checked: l.id === row.listId,
            action: function () {
              if (l.id === row.listId) return;
              run(function () { return TT().moveCard(t, row.id, l.id, 'bottom'); }, 'Déplacée dans « ' + l.name + ' »');
            },
          };
        }));
      });
      return b;
    }

    function archive(row) {
      TT().archiveCard(t, row.id).then(function () {
        invalidate();
        if (typeof opts.onChange === 'function') opts.onChange();
        toast('« ' + (row.name || 'Carte') + ' » archivée', 'ok', {
          label: 'Annuler',
          run: function () {
            TT().unarchiveCard(t, row.id).then(function () {
              invalidate();
              if (typeof opts.onChange === 'function') opts.onChange();
            }, failed);
          },
        });
        if (typeof opts.onGone === 'function') opts.onGone();
      }, failed);
    }

    /** GanttTrello.setCardBlocked reports failure as { ok: false } instead of throwing. */
    function setBlocked(row, on) {
      return Promise.resolve(global.GanttTrello.setCardBlocked(t, row.id, on)).then(function (res) {
        if (res && res.ok === false) throw new Error(res.reason || 'Échec du blocage');
      });
    }

    function moreMenu(anchor, row) {
      var items = [
        { id: 'archive', label: 'Archiver', icon: 'archive', danger: true, action: function () { archive(row); } },
      ];
      if (opts.onOpen) {
        items.push({ sep: true });
        items.push({ id: 'open-card', label: 'Ouvrir la carte', icon: 'external-link', action: function () { opts.onOpen(); } });
      }
      items.push({ id: 'open-document', label: 'Document', icon: 'file-text', action: function () { if (global.ViewTabs) global.ViewTabs.openSubject('task', opts.cardId); } });
      if (row.link) {
        items.push({
          id: 'copy-link',
          label: 'Copier le lien',
          action: function () {
            try {
              Promise.resolve(global.navigator.clipboard.writeText(row.link)).then(function () { toast('Lien copié', 'ok'); }, function () {});
            } catch (e) { /* clipboard unavailable */ }
          },
        });
      }
      showMenu(anchor, items);
    }

    function header(row) {
      var kids = [statusButton(row), el('span', 'cq-spacer')];
      if (opts.onOpen) {
        kids.push(el('button', 'cq-iconbtn', {
          type: 'button',
          title: 'Ouvrir la carte',
          'aria-label': 'Ouvrir la carte',
          onclick: function () { opts.onOpen(); },
        }, [ico('external-link')]));
      }
      var more = el('button', 'cq-iconbtn', { type: 'button', title: 'Plus d’actions', 'aria-label': 'Plus d’actions' }, [ico('dots')]);
      more.addEventListener('click', function () { moreMenu(more, row); });
      kids.push(more);
      if (opts.onClose) kids.push(closeButton());
      return el('div', 'cq-head', null, kids);
    }

    function closeButton() {
      return el('button', 'cq-iconbtn', {
        type: 'button',
        title: 'Fermer',
        'aria-label': 'Fermer',
        onclick: function () { opts.onClose(); },
      }, [ico('x')]);
    }

    /** Header of the loading / unavailable states: only the "x" (there is no card to act on yet). */
    function bareHead() {
      return opts.onClose ? el('div', 'cq-head', null, [el('span', 'cq-spacer'), closeButton()]) : null;
    }

    /* Title: double-click to rename in place */
    function titleBlock(row, info) {
      var title = el('div', 'cq-title' + (info.done ? ' is-done' : '') + (info.blocked ? ' is-blocked' : ''), { text: row.name || 'Sans titre', title: 'Double-clic pour renommer' });
      title.addEventListener('dblclick', function () {
        if (state.editingTitle) return;
        state.editingTitle = true;
        var input = el('textarea', 'cq-title-input', { rows: '1', 'aria-label': 'Titre de la carte' });
        input.value = row.name || '';
        title.replaceWith(input);
        function fit() { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; }
        fit();
        input.focus();
        input.select();
        var finished = false;
        function finish(save) {
          if (finished) return;
          finished = true;
          state.editingTitle = false;
          var next = input.value.replace(/\s+/g, ' ').trim();
          if (save && next && next !== row.name) run(function () { return TT().saveName(t, row.id, next); });
          else paint();
        }
        input.addEventListener('input', fit);
        input.addEventListener('keydown', function (e) {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', function () { finish(true); });
      });
      return title;
    }

    function stepBlock(row) {
      var os = global.WorkOS;
      var text = os && typeof os.stepText === 'function' ? os.stepText(row) : '';
      if (!text) return null;
      return el('div', 'cq-step', { text: text });
    }

    function mentionBlock() {
      var list = opts.mentions || [];
      if (!list.length) return null;
      var kids = [el('span', 'cq-mentions-k', { text: 'Mentionné dans' })];
      list.forEach(function (m) {
        kids.push(el('button', 'cq-mention', {
          type: 'button',
          text: m.title || 'Sans titre',
          onclick: function () { if (m.open) m.open(); },
        }));
      });
      return el('div', 'cq-mentions', null, kids);
    }

    /* Progress: ring (complete / reopen / unblock), draggable bar, number opens the detail */
    function progressBlock(row, info) {
      var ring = global.ProgressRing ? global.ProgressRing.create(info.pct, info.blocked) : null;
      var ringBtn = el('button', 'cq-ring', {
        type: 'button',
        title: info.blocked ? 'Bloquée · cliquer pour débloquer' : info.pct >= 100 ? 'Terminée · cliquer pour rouvrir (0 %)' : 'Cliquer pour marquer comme terminée',
      }, [ring]);
      ringBtn.addEventListener('click', function () {
        if (info.blocked) return run(function () { return setBlocked(row, false); }, 'Carte débloquée');
        var next = info.pct >= 100 ? 0 : 100;
        run(function () { return setProgress(t, row, state.lists, next); }, next >= 100 ? 'Carte terminée' : 'Carte rouverte');
      });
      var fill = el('i', null, { style: 'width:' + info.pct + '%' });
      var bar = el('span', 'cq-bar', { title: 'Cliquer ou glisser pour régler le progrès' }, [fill]);
      var num = el('button', 'cq-num', { type: 'button', text: info.pct + '%', title: 'Détail du progrès' });
      var wrap = el('div', 'cq-prog' + (info.pct >= 100 ? ' is-done' : ''), null, [ringBtn, bar, num]);
      num.addEventListener('click', function () { openField('progress', wrap); });
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        if (CF()) CF().close();
        var pct = info.pct;
        function paintPct() {
          fill.style.width = pct + '%';
          num.textContent = pct + '%';
          if (ring && global.ProgressRing) global.ProgressRing.set(ring, pct);
          wrap.classList.toggle('is-done', pct >= 100);
        }
        function at(ev) {
          var r = bar.getBoundingClientRect();
          pct = pctFromX(r.left, r.width, ev.clientX, pct);
          paintPct();
        }
        function up() {
          document.removeEventListener('pointermove', at);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          wrap.classList.remove('is-dragging');
          if (pct !== info.pct) run(function () { return setProgress(t, row, state.lists, pct); }, pct >= 100 ? 'Carte terminée' : '');
        }
        wrap.classList.add('is-dragging');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* the document listeners still follow */ }
        at(e);
        document.addEventListener('pointermove', at);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
      return wrap;
    }

    function chip(cls, icon, text, title, onclick) {
      var b = el('button', 'cq-chip ' + cls, { type: 'button', title: title }, [ico(icon), text ? el('span', null, { text: text }) : null]);
      b.addEventListener('click', function () { onclick(b); });
      return b;
    }

    function chipsBlock(row, info) {
      var chips = [];
      var tone = info.urgencyTone;
      chips.push(chip(
        'cq-chip--prio' + (tone != null ? ' cq-chip--u' + tone : '') + (row.urgency || row.priority != null ? '' : ' is-empty'),
        'flame',
        [row.urgency, row.priority != null ? String(row.priority) : ''].filter(Boolean).join(' · '),
        row.tier ? 'Priorité · ' + row.tier : 'Définir la priorité',
        function (b) { openField('priority', b); }
      ));
      chips.push(chip(
        'cq-chip--due' + (info.overdue ? ' is-overdue' : '') + (row.due ? '' : ' is-empty'),
        info.overdue ? 'calendar-exclamation' : 'calendar-event',
        row.due && TM() ? TM().formatDay(row.due) : row.due || '',
        row.due ? (info.overdue ? 'En retard · ' : 'Échéance · ') + row.due : 'Définir l’échéance',
        function (b) { openField('due', b); }
      ));
      var est = row.estimate > 0 && CF() ? CF().formatMinutes(row.estimate) : '';
      chips.push(chip(
        'cq-chip--est' + (est ? '' : ' is-empty'),
        'clock',
        est,
        est ? 'Estimation · ' + est : 'Définir l’estimation',
        function (b) {
          hold(true);
          openField('estimate', b, { minutes: row.estimate || 0 });
          watchMenu();
        }
      ));
      chips.push(chip(
        'cq-chip--blocked' + (info.blocked ? ' is-blocked' : ' is-empty'),
        'player-pause',
        info.blocked ? 'Bloquée' : '',
        info.blocked ? 'Bloquée · cliquer pour débloquer' : 'Bloquer',
        function (b) {
          if (info.blocked) run(function () { return setBlocked(row, false); }, 'Carte débloquée');
          else openField('blocked', b);
        }
      ));
      return el('div', 'cq-chips', null, chips);
    }

    /* People, places, labels: chips that open the shared picker (same as the Mindmap panel) */
    function entitiesBlock(row) {
      var CE = global.CardEntities;
      if (!CE) return null;
      function entity(kind, icon, title, chips) {
        var b = el('button', 'cq-ent' + (chips.length ? '' : ' is-empty'), { type: 'button', title: title }, chips.length ? chips : [ico(icon), el('span', null, { text: title })]);
        b.addEventListener('click', function () {
          hold(true);
          CE.open(kind, {
            t: t,
            rec: row,
            anchor: b,
            onError: failed,
            onClose: function (changed) {
              hold(false);
              if (changed) saved();
            },
          });
        });
        return b;
      }
      var people = (row.assignees || []).map(function (a) { return el('span', 'cq-tag', null, [ico('user'), a.name]); });
      var places = CE.placeChips(row.inputs && row.inputs.places).map(function (p) {
        return el('span', 'cq-tag', null, [ico('map-pin'), (p.slot === 'at' ? '' : p.label + ' ') + p.name]);
      });
      var labels = (row.labels || []).map(function (l) {
        return el('span', 'cq-tag', null, [CE.COLORS[l.color] ? el('i', 'cq-dot', { style: 'background:' + CE.COLORS[l.color] }) : null, l.name || l.color || '·']);
      });
      return el('div', 'cq-ents', null, [
        entity('people', 'user', 'Personnes', people),
        entity('places', 'map-pin', 'Lieux', places),
        entity('labels', 'tag', 'Étiquettes', labels),
      ]);
    }

    /* Description: rendered; click to edit in the shared rich editor */
    function descBlock(row, info) {
      var box = el('button', 'cq-desc' + (info.hasDesc ? '' : ' is-empty'), { type: 'button', title: info.hasDesc ? 'Modifier la description' : 'Ajouter une description' });
      if (info.hasDesc) {
        var body = el('div', 'cq-desc-body agent-md');
        if (global.MarkdownDom) global.MarkdownDom.append(body, row.desc);
        else body.textContent = row.desc;
        box.appendChild(body);
      } else {
        box.appendChild(ico('plus'));
        box.appendChild(el('span', null, { text: 'Cliquer pour ajouter…' }));
      }
      box.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) return; // links inside the text keep working
        openField('desc', box, {
          value: row.desc || '',
          save: function (text) { return TT().saveDesc(t, row, text); },
        });
      });
      return box;
    }

    function paint() {
      if (state.editingTitle) return;
      var row = state.row;
      root.textContent = '';
      if (!row) return paintMessage('Tâche introuvable (archivée ou supprimée).');
      var info = describe(row, todayIso());
      root.classList.toggle('is-done', info.done);
      root.classList.toggle('is-blocked', info.blocked);
      root.appendChild(header(row));
      root.appendChild(titleBlock(row, info));
      var stepEl = stepBlock(row);
      if (stepEl) root.appendChild(stepEl);
      var mentions = mentionBlock();
      if (mentions) root.appendChild(mentions);
      root.appendChild(progressBlock(row, info));
      root.appendChild(chipsBlock(row, info));
      var ents = entitiesBlock(row);
      if (ents) root.appendChild(ents);
      root.appendChild(descBlock(row, info));
    }

    /**
     * First load. A card created a moment ago is not always in Trello's listing yet, so with
     * `opts.waitForCard` the snapshot is read again (a few times) until the card shows up. The host calls
     * CardQuick.invalidate() first when its cached snapshot predates the card.
     */
    function firstLoad(attempt) {
      return loadBoard(t, attempt > 0).then(function (data) {
        if (!state.alive) return;
        state.lists = data.lists || [];
        state.row = rowFor(data.rows, opts.cardId);
        if (!state.row && attempt < (opts.waitForCard ? WAIT_RETRIES : 0)) {
          return new Promise(function (resolve) { setTimeout(resolve, WAIT_MS); }).then(function () {
            return state.alive ? firstLoad(attempt + 1) : null;
          });
        }
        if (!state.row) reportMissing(opts.cardId, data.rows);
        paint();
      }, function (err) {
        if (state.alive) paintMessage('Aperçu indisponible : ' + msg(err));
      });
    }

    // First paint: the title straight away, the rest once the board snapshot is in.
    var firstHead = bareHead();
    if (firstHead) root.appendChild(firstHead);
    root.appendChild(el('div', 'cq-title', { text: opts.name || 'Carte' }));
    root.appendChild(el('div', 'cq-note', { text: 'Chargement…' }));
    if (!TT() || typeof TT().load !== 'function') {
      paintMessage('Aperçu indisponible.');
    } else {
      firstLoad(0);
    }

    return {
      refresh: refresh,
      destroy: function () {
        state.alive = false;
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  }

  global.CardQuick = {
    mount: mount,
    describe: describe,
    rowFor: rowFor,
    pctFromX: pctFromX,
    resizeRect: resizeRect,
    zoomAt: zoomAt,
    invalidate: invalidate,
    setProgress: setProgress,
  };
})(typeof window !== 'undefined' ? window : this);
