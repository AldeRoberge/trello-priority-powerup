/*
 * Role: UI of the Kanban view — the board's lists as columns, cards as tiles, like Trello but in the
 * app's own look (kanban-ui.css). Same data and writes as the Table (TableTrello / TableModel):
 *  - drag a card to another column or to a new position (saved to Trello as list + pos)
 *  - "+ Ajouter une carte" at the bottom of each column; click a tile to open it beside the board
 *  - urgency / due / progress chips open the shared CardFields editors; right-click: card menu
 *  - a sparkle on a tile (and one field for the board in the toolbar) asks KanbanAI; the tile
 *    field stays closed until asked, so a board does not prefetch one suggestion per card
 *  - "En retard" and "Bloquées" filter the board; arrow keys move between cards
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var TM = function () { return global.TableModel; };
  var TT = function () { return global.TableTrello; };
  var KM = function () { return global.KanbanModel; };
  var MENU = function () { return global.TableMenu; };
  var AI = function () { return global.KanbanAI; };

  var URGENCY_TONE = { Aucun: 0, 'Bientôt': 1, 'Assez vite': 2, Vite: 3, 'Au plus vite': 4 };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function icon(name, cls) {
    return h('i', { class: 'ti ti-' + name + (cls ? ' ' + cls : '') });
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* Placeholder columns shown while data loads. */
  function skeletonCols() {
    var out = '';
    [3, 2, 4, 2].forEach(function (n) {
      out += '<div class="kb-col kb-col--skel"><div class="kb-skel kb-skel--head"></div>';
      for (var i = 0; i < n; i++) out += '<div class="kb-skel kb-skel--card"></div>';
      out += '</div>';
    });
    return out;
  }

  function mount(root, t) {
    var HD = global.HideDone;
    var state = {
      lists: [],
      rows: [],
      places: {},
      filter: '',
      facets: { blocked: false, overdue: false },
      hideDone: HD.get(),
      authOk: true,
      detailId: null,
      quick: null,
      quickId: null,
      dragId: null,
      dragListId: null, // list id of the column being dragged by its header
      composer: null, // list id with the open "add card" composer
      aiBusy: false,
      swallowClick: false, // true for one tick after a progress-bar drag so the release does not open the card
      status: '',
      statusKind: '',
    };
    var statusTimer = null;
    var HP = null;

    root.innerHTML = '';
    var els = {
      bar: h('div', { class: 'kb-bar' }),
      banner: h('div', { class: 'kb-banner', hidden: true }),
      board: h('div', { class: 'kb-board' }),
      detailBody: h('div', { class: 'kb-detail-body' }),
    };
    els.detail = h('aside', { class: 'kb-detail', hidden: true, 'aria-label': 'Détail de la carte' }, [
      h('button', {
        class: 'kb-iconbtn kb-detail-close',
        type: 'button',
        title: 'Fermer',
        'aria-label': 'Fermer',
        onclick: function () { closeDetail(); },
      }, [icon('x')]),
      els.detailBody,
    ]);
    els.stage = h('div', { class: 'kb-stage' }, [els.board, els.detail]);
    els.root = h('div', { class: 'kb-root', tabindex: '-1' }, [els.bar, els.banner, els.stage]);
    root.appendChild(els.root);

    /* ── Status + errors ───────────────────────────────────────────── */
    function setStatus(msg, kind, keepMs, openHistory) {
      state.status = msg || '';
      state.statusKind = kind || '';
      state.statusOpen = kind === 'ok' ? openHistory || null : null;
      paintStatus();
      clearTimeout(statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        statusTimer = setTimeout(function () { setStatus('', ''); }, keepMs || 2500);
      }
    }

    function paintStatus() {
      var s = els.bar.querySelector('.kb-status');
      if (!s) return;
      s.className = 'kb-status' + (state.statusKind ? ' is-' + state.statusKind : '');
      s.textContent = '';
      if (state.statusKind === 'ok') s.appendChild(icon('check'));
      if (state.statusKind === 'busy') s.appendChild(icon('refresh', 'kb-spin'));
      if (state.statusKind === 'error') s.appendChild(icon('alert-triangle'));
      if (state.statusOpen) {
        s.appendChild(h('button', { class: 'hp-status-link', title: 'Ouvrir l’historique', onclick: state.statusOpen }, [document.createTextNode(state.status)]));
      } else {
        s.appendChild(document.createTextNode(state.status));
      }
    }

    function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        state.authOk = false;
        renderBanner();
        setStatus('Autorisez Trello pour enregistrer les modifications.', 'error');
      } else {
        setStatus('Échec : ' + (reason || 'erreur inconnue'), 'error');
      }
    }

    function renderBanner() {
      els.banner.hidden = state.authOk;
      els.banner.textContent = '';
      if (state.authOk) return;
      els.banner.appendChild(h('span', { text: 'Autorisez Cerveau à écrire dans Trello pour déplacer et modifier les cartes.' }));
      els.banner.appendChild(h('button', {
        class: 'kb-btn kb-btn--primary',
        onclick: function () {
          global.GanttTrello.ensureRestAuthorized(t).then(function (r) { state.authOk = !!r.ok; renderBanner(); }, fail);
        },
      }, [icon('lock-open'), h('span', { text: 'Autoriser' })]));
    }

    /* ── History panel ─────────────────────────────────────────────── */
    function record(e) { return HP ? HP.record(e) : e; }

    /** Runs the write that moves an entry back to its "before" state (`back`) or forward to its "after" state. */
    function applyEntry(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      if (e.type === 'archive') return back ? TT().unarchiveCard(t, e.targetId) : TT().archiveCard(t, e.targetId);
      if (e.type === 'create') return back ? TT().archiveCard(t, e.targetId) : TT().unarchiveCard(t, e.targetId);
      if (e.type === 'move') return TT().moveCard(t, e.targetId, val, back ? e.beforePos : e.afterPos);
      if (e.type === 'reorder') return TT().reorderCard(t, e.targetId, val);
      if (e.type === 'progress') return writeProgress(e.targetId, val);
      return Promise.reject(new Error('Cette modification ne peut pas être annulée'));
    }

    function histVerb(e) {
      if (e.type === 'archive') return 'archivée';
      if (e.type === 'create') return 'créée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      if (e.type === 'move') return 'déplacée';
      if (e.type === 'reorder') return 'réordonnée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      return (e.label || 'Champ') + ' modifié';
    }

    var boardId = '';
    try { boardId = (t && typeof t.getContext === 'function' && t.getContext().board) || ''; } catch (e) { /* no context */ }
    if (global.HistoryPanel) {
      HP = global.HistoryPanel.create({
        key: 'tp-kanban-history:' + boardId,
        apply: applyEntry,
        verb: histVerb,
        after: function () { return reload({ quiet: true }); },
        onStatus: function (m, kind, openHistory) { setStatus(m, kind, undefined, openHistory); },
        onError: fail,
      });
    }

    /* ── Helpers ───────────────────────────────────────────────────── */
    function findRow(id) {
      return state.rows.filter(function (r) { return r.id === id; })[0] || null;
    }
    function listById(id) {
      return state.lists.filter(function (l) { return l.id === id; })[0] || null;
    }
    function columns() {
      return KM().buildColumns(state.rows, state.lists, {
        filter: state.filter,
        hideDone: state.hideDone,
        blocked: state.facets.blocked,
        overdue: state.facets.overdue,
        today: todayIso(),
      });
    }

    function closeDetail() {
      state.detailId = null;
      state.quickId = null;
      if (state.quick) {
        state.quick.destroy();
        state.quick = null;
      }
      els.detail.hidden = true;
      els.detailBody.textContent = '';
      els.board.querySelectorAll('.kb-card.is-selected').forEach(function (n) {
        n.classList.remove('is-selected');
        n.setAttribute('aria-selected', 'false');
      });
    }

    /** Card beside the board. The full editor stays on "Ouvrir la carte". */
    function openDetail(row) {
      if (!row) return;
      state.detailId = row.id;
      els.detail.hidden = false;
      els.board.querySelectorAll('.kb-card').forEach(function (n) {
        var on = n.getAttribute('data-id') === row.id;
        n.classList.toggle('is-selected', on);
        n.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (state.quick && state.quickId === row.id) return;
      if (state.quick) state.quick.destroy();
      state.quick = null;
      state.quickId = row.id;
      els.detailBody.textContent = '';
      if (!global.CardQuick) {
        els.detailBody.appendChild(h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
        els.detailBody.appendChild(h('button', {
          class: 'kb-btn kb-btn--primary',
          type: 'button',
          onclick: function () { openCard(findRow(row.id) || row); },
        }, [icon('external-link'), h('span', { text: 'Ouvrir' })]));
        return;
      }
      state.quick = global.CardQuick.mount(els.detailBody, {
        t: t,
        cardId: row.id,
        name: row.name || '',
        onOpen: function () { openCard(findRow(row.id) || row); },
        onChange: function () { reload({ quiet: true }); },
        onToast: function (m, kind) { setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
        onGone: function () {
          closeDetail();
          reload({ quiet: true });
        },
      });
    }

    function openCard(row) {
      if (!row || typeof t.modal !== 'function') return;
      t.modal({
        title: row.name || 'Carte',
        url: global.PriorityTrello.pageUrl('./popup.html'),
        args: { cardId: row.id, cardName: row.name || '', openSection: null },
        fullscreen: true,
        accentColor: '#22272B',
        callback: function () {
          return t.modal({
            title: 'Kanban',
            url: global.PriorityTrello.pageUrl('./kanban.html'),
            fullscreen: true,
            accentColor: '#22272B',
          });
        },
      });
    }

    /** Opens the shared CardFields editor (progress / priority / due) hanging from `anchor`. */
    function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return false;
      return global.CardFields.open(kind, {
        t: t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        onSaved: function () {
          setStatus('Enregistré', 'ok');
          record({ type: 'field', label: { priority: 'Urgence', due: 'Échéance', progress: 'Progrès' }[kind] || 'Champ', targetId: row.id, title: row.name });
        },
        onError: function (m) { setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) reload({ quiet: true }); },
      });
    }

    /* ── Toolbar ───────────────────────────────────────────────────── */
    function btn(iconName, label, opts) {
      opts = opts || {};
      return h('button', {
        class: 'kb-btn' + (opts.active ? ' is-active' : '') + (label ? '' : ' kb-btn--icon'),
        title: opts.title || label || null,
        onclick: opts.onclick,
      }, [icon(iconName), label ? h('span', { text: label }) : null]);
    }

    function renderBar() {
      els.bar.textContent = '';
      var filter = h('input', {
        class: 'kb-filter tp-search-input',
        type: 'search',
        placeholder: 'Filtrer…',
        'aria-label': 'Filtrer',
        value: state.filter,
        oninput: function (e) {
          state.filter = e.target.value;
          renderBoard();
          paintCount();
        },
      });
      var done = state.rows.filter(function (r) { return r.statutKey === 'completed' || r.statutKey === 'canceled'; }).length;
      var viewed = KM().rowsInView(state.rows, state.lists, { filter: state.filter, hideDone: state.hideDone });
      var counts = KM().facetCounts(viewed, todayIso());
      function facetButton(key, iconName, label, count) {
        if (!count && !state.facets[key]) return null;
        return h('button', {
          class: 'kb-facet' + (state.facets[key] ? ' is-active' : ''),
          type: 'button',
          'data-facet': key,
          'aria-pressed': state.facets[key] ? 'true' : 'false',
          title: label,
          onclick: function () {
            state.facets[key] = !state.facets[key];
            renderBar();
            renderBoard();
            paintCount();
          },
        }, [icon(iconName), h('span', { text: label }), h('span', { class: 'kb-facet-n', text: String(count) })]);
      }
      [
        h('label', { class: 'kb-search tp-search' }, [icon('search'), filter]),
        facetButton('overdue', 'calendar-exclamation', 'En retard', counts.overdue),
        facetButton('blocked', 'player-pause', 'Bloquées', counts.blocked),
        btn('refresh', null, { title: 'Actualiser', onclick: function () { reload(); } }),
        h('span', { class: 'kb-status' }),
        AI() ? boardAsk() : null,
        h('span', { class: 'kb-spacer' }),
        h('span', { class: 'kb-count', 'aria-live': 'polite' }),
        btn(HD.icon(state.hideDone), HD.label(state.hideDone, done), {
          active: state.hideDone,
          title: HD.title(state.hideDone),
          onclick: function () { HD.set(!state.hideDone); },
        }),
        HP ? HP.button(document.body) : null,
      ].forEach(function (c) { if (c) els.bar.appendChild(c); });
      paintStatus();
      paintCount();
    }

    function paintCount() {
      var c = els.bar.querySelector('.kb-count');
      if (!c) return;
      var shown = columns().reduce(function (n, col) { return n + col.cards.length; }, 0);
      var total = state.rows.length;
      c.textContent = (shown === total ? total : shown + ' / ' + total) + (total > 1 ? ' cartes' : ' carte');
    }

    /* ── Ask the AI ────────────────────────────────────────────────── */
    /**
     * Free-text instruction → KanbanAI → writes. `target` is the card the input sits on (null = board level).
     * `input` is disabled while the call runs; the board is reloaded once it is done.
     */
    function askAI(text, target, input) {
      text = String(text || '').trim();
      if (!text || state.aiBusy) return;
      state.aiBusy = true;
      if (input) input.disabled = true;
      setStatus('IA en cours…', 'busy');
      AI().run(t, { text: text, target: target, rows: state.rows, lists: state.lists, record: record }).then(function (res) {
        state.aiBusy = false;
        var ok = res.applied.length > 0;
        var msg = ok ? 'IA : ' + res.applied.join(', ') : res.message || 'Rien à modifier.';
        if (res.failed.length) msg += ' (échec : ' + res.failed.join(' ; ') + ')';
        setStatus(msg, res.failed.length && !ok ? 'error' : 'ok', 8000);
        return reload({ quiet: true });
      }, function (err) {
        state.aiBusy = false;
        if (input) { input.disabled = false; input.focus(); }
        fail(err);
      });
    }

    /** `getSuggestion` (optional): Tab on an empty field fills that sentence in and sends it. */
    function askInput(cls, placeholder, target, getSuggestion) {
      var input = h('input', {
        class: cls,
        type: 'text',
        placeholder: placeholder,
        autocomplete: 'off',
        spellcheck: 'false',
        onkeydown: function (e) {
          e.stopPropagation();
          var sug = getSuggestion && !input.value ? getSuggestion() : '';
          if (e.key === 'Tab' && !e.shiftKey && sug) { e.preventDefault(); input.value = sug; askAI(sug, target, input); }
          else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); askAI(input.value, target, input); }
          else if (e.key === 'Escape') { input.value = ''; input.blur(); }
        },
        onclick: function (e) { e.stopPropagation(); },
      });
      return input;
    }

    /** Sparkle stays quiet until asked, then the same free-text field as the toolbar. */
    function askBox(row) {
      var wrap = h('div', { class: 'kb-ask' });
      var btn = h('button', {
        class: 'kb-ai-toggle',
        type: 'button',
        title: 'Demander à l’IA',
        'aria-label': 'Demander à l’IA',
        onclick: function (e) {
          e.stopPropagation();
          if (wrap.classList.contains('is-open')) return;
          wrap.classList.add('is-open');
          btn.hidden = true;
          var sug = AI().cachedSuggestion(row);
          var input = askInput('kb-ai-input', sug || 'Demander à l’IA…', row, function () { return sug; });
          var box = h('div', { class: 'kb-ai', onclick: function (ev) { ev.stopPropagation(); } }, [icon('sparkles'), input]);
          wrap.appendChild(box);
          var card = wrap.closest('.kb-card');
          input.addEventListener('focus', function () { if (card) card.draggable = false; });
          input.addEventListener('blur', function () {
            if (card) card.draggable = true;
            if (!input.value) {
              wrap.classList.remove('is-open');
              box.remove();
              btn.hidden = false;
            }
          });
          AI().suggest(t, row).then(function (better) {
            if (better && better !== sug && document.body.contains(input) && !input.value) {
              sug = better;
              input.placeholder = better;
            }
          });
          input.focus();
        },
      }, [icon('sparkles')]);
      wrap.appendChild(btn);
      return wrap;
    }

    function boardAsk() {
      var input = askInput('kb-ai-input', 'Demander à l’IA : créer une tâche…', null);
      return h('label', { class: 'kb-ai kb-ai--bar', title: 'Créer ou mettre à jour des tâches en langage naturel' }, [icon('sparkles'), input]);
    }

    /* ── Card tile ─────────────────────────────────────────────────── */
    function chip(cls, iconName, text, title, onclick) {
      return h('button', { class: 'kb-chip ' + cls, title: title || null, onclick: onclick }, [icon(iconName), text ? h('span', { text: text }) : null]);
    }

    function tile(row, list) {
      var badges = [];
      if (row.urgency) {
        var tone = URGENCY_TONE[row.urgency];
        badges.push(chip('kb-chip--u' + (tone == null ? 0 : tone), 'flame', row.urgency, 'Urgence · cliquer pour modifier', function (e) {
          e.stopPropagation();
          openEditor(row, 'priority', e.currentTarget);
        }));
      }
      if (row.due) {
        var closed = KM().isClosedKey(row.statutKey);
        var overdue = /^\d{4}-\d{2}-\d{2}/.test(row.due) && row.due.slice(0, 10) < todayIso() && !closed;
        var hard = global.WorkOS && global.WorkOS.dateKind(row) === 'hard';
        badges.push(chip('kb-chip--due' + (overdue ? ' is-overdue' : '') + (hard ? ' is-hard' : ''), overdue ? 'calendar-exclamation' : 'calendar-event', TM().formatDay(row.due), (overdue ? 'En retard · ' : (hard ? 'Échéance · ' : '')) + row.due, function (e) {
          e.stopPropagation();
          openEditor(row, 'due', e.currentTarget);
        }));
      }
      if (typeof row.priority === 'number') {
        badges.push(chip('kb-chip--prio', 'flag', String(row.priority), 'Priorité' + (row.tier ? ' · ' + row.tier : ''), function (e) {
          e.stopPropagation();
          openEditor(row, 'priority', e.currentTarget);
        }));
      }
      var estLabel = row.estimate > 0 && global.CardFields ? global.CardFields.formatMinutes(row.estimate) : '';
      badges.push(chip('kb-chip--est' + (estLabel ? '' : ' kb-chip--empty'), 'clock', estLabel, 'Estimation · cliquer pour modifier', function (e) {
        e.stopPropagation();
        if (!global.CardFields) return;
        global.CardFields.open('estimate', {
          t: t,
          cardId: row.id,
          minutes: row.estimate || 0,
          anchor: e.currentTarget,
          onSaved: function () { setStatus('Enregistré', 'ok'); record({ type: 'field', label: 'Estimation', targetId: row.id, title: row.name }); },
          onError: function (m) { setStatus(m, 'error'); },
          onClose: function (changed) { if (changed) reload({ quiet: true }); },
        });
      }));
      var kids = [];
      if (row.category) kids.push(h('div', { class: 'kb-cat', text: row.category }));
      kids.push(h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
      var stepText = global.WorkOS && global.WorkOS.stepText(row);
      if (stepText) kids.push(h('div', { class: 'kb-step', text: stepText }));
      var place = state.places && global.WorkOS ? global.WorkOS.placeLabel(state.places[row.id]) : '';
      if (place) kids.push(h('div', { class: 'kb-place', text: place }));
      if (badges.length) kids.push(h('div', { class: 'kb-badges' }, badges));
      var prog = null;
      if (typeof row.progress === 'number') {
        var p = Math.max(0, Math.min(100, row.progress));
        var ring = global.ProgressRing ? global.ProgressRing.create(p, row.blocked) : null;
        // Ring: one click marks the card complete (100 %) or reopens it (0 %); on a blocked card it unblocks.
        var ringBtn = h('button', {
          class: 'kb-prog-ring',
          type: 'button',
          title: row.blocked ? 'Bloqué — cliquer pour débloquer' : p >= 100 ? 'Terminé — cliquer pour rouvrir (0 %)' : 'Cliquer pour marquer comme terminé',
          onclick: function (e) {
            e.stopPropagation();
            if (row.blocked) return unblockRow(row);
            saveProgress(row, row.progress >= 100 ? 0 : 100);
          },
        }, [ring]);
        prog = h('div', {
          class: 'kb-prog' + (p >= 100 ? ' is-done' : ''),
          onclick: function (e) { e.stopPropagation(); },
        }, [
          ringBtn,
          h('span', { class: 'kb-prog-bar', title: 'Cliquer ou glisser pour régler le progrès' }, [h('i', { style: 'width:' + p + '%' })]),
          h('button', {
            class: 'kb-prog-num',
            type: 'button',
            title: 'Détail du progrès · cliquer pour modifier',
            text: p + '%',
            onclick: function (e) {
              e.stopPropagation();
              openEditor(row, 'progress', e.currentTarget.parentNode);
            },
          }),
        ]);
        kids.push(prog);
      }
      if (AI()) kids.push(askBox(row));
      var accent = row.statutColor || (list && list.color) || '#626f86';
      // Blocked (flag or "Bloqué" status) yet complete: striped red/green accent instead of the plain status colour.
      var blockedDone = !!(row.blocked || row.statutKey === 'blocked') && typeof row.progress === 'number' && row.progress >= 100;
      var el = h('div', {
        class: 'kb-card' + (blockedDone ? ' is-blocked-done' : '') + (state.detailId === row.id ? ' is-selected' : ''),
        draggable: 'true',
        tabindex: '0',
        'data-id': row.id,
        'aria-selected': state.detailId === row.id ? 'true' : 'false',
        style: '--kb-accent:' + accent + (blockedDone ? ';--kb-blocked:' + (row.statutKey === 'blocked' ? accent : '#e34935') : ''),
        onclick: function () { if (!state.swallowClick) openDetail(row); },
        onkeydown: function (e) {
          if (e.key === 'Enter' && e.target === el) {
            e.preventDefault();
            openDetail(row);
          }
        },
        oncontextmenu: function (e) {
          e.preventDefault();
          cardMenu(row, e.clientX, e.clientY);
        },
        ondragstart: function (e) {
          state.dragId = row.id;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', row.id); } catch (err) { /* ignore */ }
          setTimeout(function () { el.classList.add('is-dragging'); }, 0);
          els.board.classList.add('is-dragging');
        },
        ondragend: function () {
          state.dragId = null;
          els.board.classList.remove('is-dragging');
          clearDropMarks();
          el.classList.remove('is-dragging');
        },
      }, kids);
      if (prog) bindProgressDrag(el, prog, row);
      return el;
    }

    /**
     * Clicking or dragging on the progress bar sets the % in place, without opening the card (same as the Table).
     * The tile is draggable, so that is switched off for the gesture. Saved on release.
     */
    function bindProgressDrag(card, prog, row) {
      var bar = prog.querySelector('.kb-prog-bar');
      var fill = bar && bar.firstChild;
      var num = prog.querySelector('.kb-prog-num');
      var ring = prog.querySelector('.pg-ring');
      if (!bar || !fill || !num) return;
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (global.CardFields) global.CardFields.close();
        var pct = row.progress;
        function pctAt(x) {
          var r = bar.getBoundingClientRect();
          return r.width ? Math.max(0, Math.min(100, Math.round(((x - r.left) / r.width) * 100))) : pct;
        }
        function paint() {
          fill.style.width = pct + '%';
          num.textContent = pct + '%';
          if (ring && global.ProgressRing) global.ProgressRing.set(ring, pct);
          prog.classList.toggle('is-done', pct >= 100);
        }
        function move(ev) { pct = pctAt(ev.clientX); paint(); }
        function up() {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          card.draggable = true;
          prog.classList.remove('is-dragging');
          state.swallowClick = true;
          setTimeout(function () { state.swallowClick = false; }, 0);
          if (pct !== row.progress) saveProgress(row, pct);
        }
        card.draggable = false;
        prog.classList.add('is-dragging');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* no capture: the document listeners still follow the pointer */ }
        move(e);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
    }

    function cardMenu(row, x, y) {
      if (!MENU()) return;
      var current = null;
      state.lists.forEach(function (l) { if (l.id === row.listId) current = l; });
      var moveItems = state.lists.map(function (l) {
        return {
          icon: l.icon,
          color: l.color,
          label: l.name,
          checked: l.id === row.listId,
          action: function () { if (l.id !== row.listId) dropCard(row.id, l.id, null); },
        };
      });
      MENU().show({ x: x, y: y }, [
        { title: row.name || 'Carte' },
        { icon: 'external-link', label: 'Ouvrir la carte', action: function () { openCard(row); } },
        {
          icon: 'external-link',
          label: 'Ouvrir dans',
          children: (global.ViewTabs ? global.ViewTabs.OPEN_IN : []).map(function (v) {
            return { icon: v.icon, label: v.label, action: function () { global.ViewTabs.openIn(v.key, row.id); } };
          }),
        },
        { sep: true },
        {
          icon: (current && current.icon) || 'progress-check',
          color: current && current.color,
          label: 'Statut',
          hint: (current && current.name) || row.statut || '',
          children: moveItems,
        },
        { sep: true },
        { icon: 'archive', label: 'Archiver', danger: true, action: function () { archiveRow(row); } },
      ]);
    }

    function archiveRow(row) {
      TT().archiveCard(t, row.id).then(function () {
        record({ type: 'archive', targetId: row.id, title: row.name, after: row.statut || '' });
        state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
        if (state.detailId === row.id) closeDetail();
        renderBoard();
        paintCount();
        setStatus('« ' + (row.name || 'Carte') + ' » archivée', 'ok');
      }, fail);
    }

    /* ── Columns ───────────────────────────────────────────────────── */
    function clearDropMarks() {
      els.board.querySelectorAll('.is-over').forEach(function (n) { n.classList.remove('is-over'); });
      var m = els.board.querySelector('.kb-drop');
      if (m && m.parentNode) m.parentNode.removeChild(m);
      els.board.querySelectorAll('.is-drop-before, .is-drop-after').forEach(function (n) {
        n.classList.remove('is-drop-before', 'is-drop-after');
      });
    }

    /** Where a dragged column would land at `x`: its index among the other columns, plus the neighbour to mark. */
    function columnDropAt(x) {
      var cols = [].slice.call(els.board.querySelectorAll('.kb-col:not(.is-dragging-col)'));
      var rects = cols.map(function (n) { return n.getBoundingClientRect(); });
      var index = KM().columnInsertIndex(rects, x);
      return { index: index, before: cols[index] || null, after: index > 0 ? cols[index - 1] : null };
    }

    // Column reordering: dragging a column header over the board moves a marker; dropping saves the list's new position.
    els.board.addEventListener('dragover', function (e) {
      if (!state.dragListId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      var at = columnDropAt(e.clientX);
      if (at.before) at.before.classList.add('is-drop-before');
      else if (at.after) at.after.classList.add('is-drop-after');
    });
    els.board.addEventListener('drop', function (e) {
      if (!state.dragListId) return;
      e.preventDefault();
      var id = state.dragListId;
      var index = columnDropAt(e.clientX).index;
      clearDropMarks();
      dropList(id, index);
    });

    /** Index among the column's tiles (without the dragged one) where a drop at `y` lands. */
    function dropIndex(body, y) {
      var rects = [].slice.call(body.querySelectorAll('.kb-card:not(.is-dragging)')).map(function (n) {
        var r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, node: n };
      });
      return { index: KM().insertIndex(rects, y), rects: rects };
    }

    function column(col) {
      var list = col.list;
      var body = h('div', { class: 'kb-cards' });
      col.cards.forEach(function (row) { body.appendChild(tile(row, list)); });
      // An empty column shows no placeholder: the "+ Ajouter une carte" button below is also a drop target (the whole column accepts drops).
      if (!col.cards.length && (col.hidden || state.filter || state.facets.blocked || state.facets.overdue)) {
        body.appendChild(h('div', { class: 'kb-empty', text: col.hidden ? col.total + ' masquée' + (col.total > 1 ? 's' : '') : 'Aucune carte' }));
      }
      var colEl = h('section', {
        class: 'kb-col' + (KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        style: '--kb-accent:' + list.color,
        ondragover: function (e) {
          if (!state.dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          clearDropMarks();
          colEl.classList.add('is-over');
          var at = dropIndex(body, e.clientY);
          var marker = h('div', { class: 'kb-drop' });
          var ref = at.rects[at.index];
          var empty = body.querySelector('.kb-empty');
          if (ref) body.insertBefore(marker, ref.node);
          else if (empty) body.insertBefore(marker, empty);
          else body.appendChild(marker);
        },
        ondragleave: function (e) {
          if (!colEl.contains(e.relatedTarget)) clearDropMarks();
        },
        ondrop: function (e) {
          if (!state.dragId) return;
          e.preventDefault();
          var at = dropIndex(body, e.clientY).index;
          var id = state.dragId;
          clearDropMarks();
          dropCard(id, list.id, at);
        },
      }, [
        h('header', {
          class: 'kb-col-head',
          draggable: 'true',
          title: 'Glisser pour réorganiser les colonnes',
          ondragstart: function (e) {
            state.dragListId = list.id;
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', 'list:' + list.id); } catch (err) { /* ignore */ }
            try { e.dataTransfer.setDragImage(colEl, 20, 20); } catch (err) { /* default drag image */ }
            setTimeout(function () { colEl.classList.add('is-dragging-col'); }, 0);
            els.board.classList.add('is-dragging-list');
          },
          ondragend: function () {
            state.dragListId = null;
            els.board.classList.remove('is-dragging-list');
            colEl.classList.remove('is-dragging-col');
            clearDropMarks();
          },
        }, [
          h('span', { class: 'kb-col-icon' }, [icon(list.icon)]),
          h('span', { class: 'kb-col-name', text: list.name, title: list.name }),
          (function () {
            var over = list.category === 'started' && global.WorkOS && global.WorkOS.wip(state.rows, global.WorkOS.DEFAULT_WIP);
            if (over && over.over) {
              return h('button', {
                class: 'kb-col-count is-over',
                type: 'button',
                title: 'Ranger la moins prioritaire',
                text: over.count + '/' + over.cap,
                onclick: function (e) {
                  e.stopPropagation();
                  e.preventDefault();
                  var park = over.park;
                  var dest = state.lists.filter(function (l) { return l.category === 'unstarted'; })[0]
                    || state.lists.filter(function (l) { return l.category === 'backlog'; })[0];
                  if (park && dest) dropCard(park.id, dest.id, null);
                },
              });
            }
            return h('span', { class: 'kb-col-count', text: String((state.filter || state.facets.blocked || state.facets.overdue) ? col.cards.length : col.total) });
          })(),
          h('button', {
            class: 'kb-iconbtn',
            title: 'Ajouter une carte',
            onclick: function () { openComposer(list.id); },
          }, [icon('plus')]),
        ]),
        h('div', { class: 'kb-col-scroll' }, [body, composer(list)]),
      ]);
      if (global.InsertGap) {
        global.InsertGap.watch(body, {
          item: '.kb-card',
          placeholder: 'Titre…',
          enabled: function () {
            return !els.board.classList.contains('is-dragging') && !els.board.classList.contains('is-dragging-list');
          },
          onCreate: function (title, info) {
            var aboveId = info.above && info.above.getAttribute('data-id');
            var belowId = info.below && info.below.getAttribute('data-id');
            return createIn(list, title, posAt(list.id, aboveId, belowId));
          },
        });
      }
      return colEl;
    }

    function composer(list) {
      if (state.composer !== list.id) {
        return h('button', { class: 'kb-add', onclick: function () { openComposer(list.id); } }, [icon('plus'), h('span', { text: 'Ajouter une carte' })]);
      }
      var input = h('textarea', { class: 'kb-add-input', rows: '2', placeholder: 'Titre…' });
      var busy = false;
      function submit(fromBlur) {
        var name = input.value.trim();
        if (!name || busy) return;
        busy = true;
        input.disabled = true;
        createIn(list, name).then(function () {
          state.composer = fromBlur === true ? null : list.id;
          renderBoard();
          var next = fromBlur === true ? null : els.board.querySelector('.kb-add-input');
          if (next) next.focus({ preventScroll: true });
        }, function (err) {
          busy = false;
          input.disabled = false;
          fail(err);
        });
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { state.composer = null; renderBoard(); }
      });
      // Clicking away keeps what was typed: the card is created (the composer's own buttons handle themselves).
      input.addEventListener('blur', function (e) {
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.kb-composer')) return;
        submit(true);
      });
      return h('div', { class: 'kb-composer' }, [
        input,
        h('div', { class: 'kb-composer-actions' }, [
          h('button', { class: 'kb-btn kb-btn--primary', onclick: function () { submit(); } }, [h('span', { text: 'Ajouter' })]),
          h('button', { class: 'kb-btn kb-btn--icon', title: 'Annuler', onclick: function () { state.composer = null; renderBoard(); } }, [icon('x')]),
        ]),
      ]);
    }

    function openComposer(listId) {
      state.composer = listId;
      renderBoard();
      var input = els.board.querySelector('.kb-add-input');
      if (input) {
        input.focus({ preventScroll: false });
        input.scrollIntoView({ block: 'nearest' });
      }
    }

    function renderBoard() {
      var scrollX = els.board.scrollLeft;
      var scrolls = {};
      var focusId = '';
      var active = document.activeElement;
      if (active && active.closest && els.board.contains(active)) {
        var focusedCard = active.closest('.kb-card');
        if (focusedCard) focusId = focusedCard.getAttribute('data-id') || '';
      }
      els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-col-scroll');
        if (b) scrolls[c.getAttribute('data-list')] = b.scrollTop;
      });
      els.board.textContent = '';
      var cols = columns();
      if (!cols.length) {
        els.board.appendChild(h('div', { class: 'kb-loading', text: 'Aucune liste dans ce tableau.' }));
        return;
      }
      cols.forEach(function (c) { els.board.appendChild(column(c)); });
      els.board.scrollLeft = scrollX;
      els.board.querySelectorAll('.kb-col').forEach(function (c) {
        var b = c.querySelector('.kb-col-scroll');
        var s = scrolls[c.getAttribute('data-list')];
        if (b && s) b.scrollTop = s;
      });
      if (focusId) {
        var again = els.board.querySelector('.kb-card[data-id="' + focusId + '"]');
        if (again) again.focus({ preventScroll: true });
      }
    }

    /* ── Writes ────────────────────────────────────────────────────── */
    /** Moves a card into `listId` at `index` among that list's other cards (null = bottom). */
    function dropCard(id, listId, index) {
      state.dragId = null;
      var moved = findRow(id);
      var list = listById(listId);
      if (!moved || !list) return renderBoard();
      var siblings = KM().siblingsFor(state.rows, listId, id);
      var at = index == null ? siblings.length : index;
      // `index` counts the *visible* tiles; map it onto the full list so hidden cards keep their place.
      var visible = siblings.filter(function (r) { return columns().some(function (c) { return c.list.id === listId && c.cards.indexOf(r) !== -1; }); });
      if (visible.length !== siblings.length && at < visible.length) at = siblings.indexOf(visible[at]);
      else if (visible.length !== siblings.length) at = siblings.length;
      var pos = TM().dropPos(siblings, at);
      var listChanged = moved.listId !== listId;
      var from = { listId: moved.listId, statut: moved.statut, pos: moved.pos };
      if (!listChanged && moved.pos === pos) return renderBoard();
      moved.pos = pos;
      moved.listId = listId;
      moved.statut = list.name;
      moved.statutKey = list.category;
      moved.statutColor = list.color;
      // Dropped into a hidden (completed) column: dissolve the tile instead of making it vanish.
      var tile = state.hideDone && !state.filter && !state.facets.blocked && !state.facets.overdue ? els.board.querySelector('.kb-card[data-id="' + id + '"]') : null;
      var target = columns().filter(function (c) { return c.list.id === listId; })[0];
      if (tile && target && target.hidden) {
        tile.classList.remove('is-dragging');
        tile.classList.add('is-dissolving');
        setTimeout(renderBoard, 450);
      } else renderBoard();
      paintCount();
      setStatus('Enregistrement…', 'busy');
      var op = listChanged ? TT().moveCard(t, id, listId, pos) : TT().reorderCard(t, id, pos);
      op.then(function () {
        if (listChanged) record({ type: 'move', targetId: id, title: moved.name, key: 'statut', before: from.statut, after: list.name, beforeVal: from.listId, afterVal: listId, beforePos: from.pos, afterPos: pos });
        else record({ type: 'reorder', targetId: id, title: moved.name, after: list.name, beforeVal: from.pos, afterVal: pos });
        var load = list.category === 'started' && global.WorkOS ? global.WorkOS.wip(state.rows, global.WorkOS.DEFAULT_WIP) : null;
        var note = load && load.over ? ' · En cours ' + load.count + '/' + load.cap : '';
        setStatus((listChanged ? 'Carte déplacée dans « ' + list.name + ' »' : 'Ordre enregistré') + note, 'ok');
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    /** Moves column `listId` to `index` among the other columns (saved to Trello as the list's pos). */
    function dropList(listId, index) {
      state.dragListId = null;
      var from = state.lists.map(function (l) { return l.id; });
      var next = KM().reorderLists(state.lists, listId, index);
      var changed = next.some(function (l, i) { return l.id !== from[i]; });
      els.board.classList.remove('is-dragging-list');
      if (!changed) return renderBoard();
      var list = listById(listId);
      state.lists = next;
      renderBoard();
      setStatus('Enregistrement…', 'busy');
      TT().moveList(t, listId, index).then(function () {
        setStatus('Colonne « ' + (list ? list.name : '') + ' » déplacée', 'ok');
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    /** Trello `pos` so a card created under another lands between its neighbours. */
    function posAt(listId, aboveId, belowId) {
      var siblings = state.rows.filter(function (r) { return r.listId === listId; }).sort(function (a, b) {
        return (a.pos || 0) - (b.pos || 0);
      });
      var index = siblings.length;
      if (belowId) {
        var bi = siblings.findIndex(function (r) { return r.id === belowId; });
        if (bi >= 0) index = bi;
      } else if (aboveId) {
        var ai = siblings.findIndex(function (r) { return r.id === aboveId; });
        if (ai >= 0) index = ai + 1;
      }
      return TM().dropPos ? TM().dropPos(siblings, index) : 'bottom';
    }

    function createIn(list, typed, pos) {
      var QP = global.QuickParse;
      var q = QP ? QP.parse(typed) : { name: typed, dueDate: '' };
      var name = q.name;
      return TT().createRow(t, name, list.id, pos).then(function (res) {
        var cardId = res && res.cardId;
        // "… demain": the date is lifted out of the title into the card's due date.
        if (cardId && q.dueDate && global.GanttTrello) global.GanttTrello.saveCardDates(t, cardId, { dueDate: q.dueDate }).catch(function () { /* the card exists; the date can be set by hand */ });
        if (cardId) record({ type: 'create', targetId: cardId, title: name, after: list.name });
        // Trello's client-side card cache can lag right after a REST create: retry before giving up.
        function present() { return !cardId || state.rows.some(function (r) { return r.id === cardId; }); }
        function again(attempt) {
          return reload({ quiet: true }).then(function () {
            if (present() || attempt >= 4) return;
            return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(attempt + 1); });
          });
        }
        return again(0).then(function () { setStatus('Carte créée dans « ' + list.name + ' »' + (q.dueDate ? ' · échéance ' + q.dueDate : ''), 'ok'); });
      });
    }

    /** Master progress over subtasks, else the card's own progress (same write as the Table). Rejects if the editor is unavailable. */
    function writeProgress(cardId, pct) {
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

    /** Sets a card's progress in place; reaching 100 % also moves it to the board's completed list (like the Table). */
    function saveProgress(row, pct) {
      var prev = row.progress;
      var from = { listId: row.listId, statut: row.statut, pos: row.pos };
      row.progress = pct;
      setStatus('Enregistrement…', 'busy');
      writeProgress(row.id, pct)
        .then(function () {
          var done = pct >= 100 && row.statutKey !== 'completed'
            ? state.lists.filter(function (l) { return l.category === 'completed'; })[0]
            : null;
          return done ? TT().moveCard(t, row.id, done.id, 'bottom').then(function () { return done; }) : null;
        })
        .then(function (done) {
          var known = typeof prev === 'number';
          if (prev !== pct) {
            record({
              type: known ? 'progress' : 'field', label: 'Progrès', targetId: row.id, title: row.name,
              before: known ? prev + ' %' : '', after: pct + ' %', beforeVal: prev, afterVal: pct,
            });
          }
          if (done) {
            record({ type: 'move', targetId: row.id, title: row.name, key: 'statut', before: from.statut, after: done.name, beforeVal: from.listId, afterVal: done.id, beforePos: from.pos, afterPos: 'bottom' });
          }
          setStatus(done ? 'Carte terminée — déplacée dans « ' + done.name + ' »' : 'Enregistré', 'ok');
          return reload({ quiet: true });
        }, function (err) {
          row.progress = prev;
          renderBoard();
          fail(err);
          // The progress write may have landed before the move failed: show what Trello really has.
          reload({ quiet: true });
        });
    }

    /** Clears Bloqué on a card (the red II on its progress ring). */
    function unblockRow(row) {
      setStatus('Déblocage…');
      return global.GanttTrello.setCardBlocked(t, row.id, false).then(function (res) {
        if (!res || !res.ok) {
          setStatus('Échec du déblocage' + (res && res.reason ? ' (' + res.reason + ')' : ''), 'error');
        } else {
          record({ type: 'edit', key: 'blocked', label: 'Blocage', targetId: row.id, title: row.name, before: 'Bloqué', after: 'Non', beforeVal: true, afterVal: false });
          setStatus('Carte débloquée', 'ok');
        }
        return reload({ quiet: true });
      }, fail);
    }

    /* ── Loading ───────────────────────────────────────────────────── */
    function goalPlaces() {
      var goals = global.MindmapGoalsTrello;
      var os = global.WorkOS;
      if (!goals || typeof goals.load !== 'function' || !os || typeof os.places !== 'function') return Promise.resolve({});
      return goals.load(t).then(function (g) { return os.places(g || {}); }).catch(function () { return {}; });
    }

    function reload(opts) {
      if (!opts || !opts.quiet) els.board.innerHTML = skeletonCols();
      return Promise.all([
        TT().load(t),
        global.PriorityTrello.isRestAuthorized(t).catch(function () { return false; }),
        goalPlaces(),
      ]).then(function (res) {
        state.lists = res[0].lists;
        state.rows = res[0].rows;
        state.authOk = !!res[1];
        state.places = res[2] || {};
        renderBanner();
        renderBar();
        renderBoard();
      }).catch(function (err) {
        els.board.textContent = '';
        els.board.appendChild(h('div', { class: 'kb-loading', text: 'Impossible de charger le tableau : ' + (err && err.message) }));
      });
    }

    HD.subscribe(function (on) {
      state.hideDone = on;
      renderBar();
      renderBoard();
    });
    // Linear-style keys on the hovered card: S statut, P urgence, D échéance, C nouvelle carte (shared composer).
    function openNewCard() {
      var cols = state.lists.filter(function (l) { return l.category !== 'completed' && l.category !== 'canceled' && l.category !== 'blocked'; });
      var target = cols.filter(function (l) { return l.category === 'unstarted'; })[0] || cols[0];
      if (!target || !global.NewCard) return;
      global.NewCard.open({
        t: t,
        lists: state.lists,
        listId: target.id,
        onError: fail,
        onCreated: function (c) {
          if (c.cardId) record({ type: 'create', targetId: c.cardId, title: c.name, after: c.list.name });
          function present() { return !c.cardId || state.rows.some(function (r) { return r.id === c.cardId; }); }
          (function again(n) {
            return reload({ quiet: true }).then(function () {
              if (present() || n >= 4) return setStatus('Carte créée dans « ' + c.list.name + ' »', 'ok');
              return new Promise(function (resolve) { setTimeout(resolve, 600); }).then(function () { return again(n + 1); });
            });
          })(0);
        },
      });
    }
    if (global.LinearKeys) {
      global.LinearKeys.attach({
        t: t,
        hoverSelector: '.kb-card',
        idOf: function (el) { return el.getAttribute('data-id'); },
        row: findRow,
        lists: function () { return state.lists; },
        selectedId: function () {
          var active = document.activeElement && document.activeElement.closest && document.activeElement.closest('.kb-card');
          if (active && els.board.contains(active)) return active.getAttribute('data-id');
          return state.detailId || '';
        },
        anchorFor: function (id) {
          return els.board.querySelector('.kb-card[data-id="' + id + '"]') || els.detailBody;
        },
        setStatus: function (row, list) { dropCard(row.id, list.id, null); },
        setUrgency: function (row, urgencyId) {
          setStatus('Enregistrement…', 'busy');
          global.LinearKeys.saveUrgency(t, row.id, urgencyId).then(function () {
            record({ type: 'field', label: 'Urgence', targetId: row.id, title: row.name });
            return reload({ quiet: true });
          }).then(function () { setStatus('Enregistré', 'ok'); }, fail);
        },
        openDue: function (row, anchor) { openEditor(row, 'due', anchor); },
        newCard: openNewCard,
      });
    }
    if (global.CommandPalette) {
      global.CommandPalette.attach({
        cards: function () {
          return state.rows.map(function (r) { var l = listById(r.listId); return { id: r.id, name: r.name, hint: l ? l.name : '' }; });
        },
        onCard: function (id) {
          var row = findRow(id);
          if (!row) return;
          openDetail(row);
          var n = els.board.querySelector('.kb-card[data-id="' + id + '"]');
          if (n) { n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); n.focus({ preventScroll: true }); }
        },
        actions: function () { return [{ label: 'Nouvelle carte', icon: 'plus', run: openNewCard }]; },
        isBusy: function () { return global.CardFields && global.CardFields.isOpen(); },
      });
    }
    function typingTarget(node) {
      if (!node || !node.tagName) return false;
      var tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    }
    function moveCardFocus(dx, dy) {
      var cols = [].slice.call(els.board.querySelectorAll('.kb-col'));
      var cur = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.kb-card') : null;
      if (!cur || !els.board.contains(cur)) {
        var first = els.board.querySelector('.kb-card');
        if (first) first.focus();
        return;
      }
      var col = cur.closest('.kb-col');
      var inCol = [].slice.call(col.querySelectorAll('.kb-card'));
      var i = inCol.indexOf(cur);
      var next = null;
      if (dy) next = inCol[i + dy] || null;
      else if (dx) {
        var dest = cols[cols.indexOf(col) + dx];
        if (!dest) return;
        var there = [].slice.call(dest.querySelectorAll('.kb-card'));
        next = there.length ? there[Math.min(i, there.length - 1)] : null;
      }
      if (!next) return;
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    document.addEventListener('keydown', function (e) {
      if (!els.root || !document.body.contains(els.root)) return;
      if (typingTarget(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('.kb-detail')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((global.LinearPick && global.LinearPick.isOpen()) || (global.NewCard && global.NewCard.isOpen()) || (global.CardFields && global.CardFields.isOpen())) return;
      if (document.querySelector('.tp-context-menu')) return;
      if (e.key === 'Escape') {
        if (!state.detailId) return;
        e.preventDefault();
        closeDetail();
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCardFocus(0, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCardFocus(0, -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveCardFocus(1, 0); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCardFocus(-1, 0); }
    });
    renderBar();
    els.board.innerHTML = skeletonCols();
    if (global.AssistantDock) {
      global.AssistantDock.mount({ t: t, after: root, onRefresh: function () { reload({ quiet: true }); }, isBusy: function () { return global.CardFields && global.CardFields.isOpen(); } });
    }
    return reload({ quiet: true });
  }

  global.KanbanUI = { mount: mount, skeletonCols: skeletonCols };
})(typeof window !== 'undefined' ? window : this);
