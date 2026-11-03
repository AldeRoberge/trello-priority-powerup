/**
 * kanban-ui: mount() part 1 of 2.
 * The body of mount runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see kanban-ui.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.KanbanUiParts = global.KanbanUiParts || {});
  var P = (global.KanbanUiPartsMountMount = global.KanbanUiPartsMountMount || { list: [] });

  P.list.push({
    define: function (M) {
    M.setStatus = function setStatus(msg, kind, keepMs, openHistory) {
      M.state.status = msg || '';
      M.state.statusKind = kind || '';
      M.state.statusOpen = kind === 'ok' ? openHistory || null : null;
      M.paintStatus();
      clearTimeout(M.statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        M.statusTimer = setTimeout(function () { M.setStatus('', ''); }, keepMs || 2500);
      }
    };
    M.paintStatus = function paintStatus() {
      var s = M.els.bar.querySelector('.kb-status');
      if (!s) return;
      s.className = 'kb-status' + (M.state.statusKind ? ' is-' + M.state.statusKind : '');
      s.textContent = '';
      if (M.state.statusKind === 'ok') s.appendChild(S.icon('check'));
      if (M.state.statusKind === 'busy') s.appendChild(S.icon('refresh', 'kb-spin'));
      if (M.state.statusKind === 'error') s.appendChild(S.icon('alert-triangle'));
      if (M.state.statusOpen) {
        s.appendChild(S.h('button', { class: 'hp-status-link', title: 'Ouvrir l’historique', onclick: M.state.statusOpen }, [document.createTextNode(M.state.status)]));
      } else {
        s.appendChild(document.createTextNode(M.state.status));
      }
    };
    M.fail = function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        M.state.authOk = false;
        M.renderBanner();
        M.setStatus('Autorisez Trello pour enregistrer les modifications.', 'error');
      } else {
        M.setStatus('Échec : ' + (reason || 'erreur inconnue'), 'error');
      }
    };
    M.renderBanner = function renderBanner() {
      M.els.banner.hidden = M.state.authOk;
      M.els.banner.textContent = '';
      if (M.state.authOk) return;
      M.els.banner.appendChild(S.h('span', { text: 'Autorisez Cerveau à écrire dans Trello pour déplacer et modifier les cartes.' }));
      M.els.banner.appendChild(S.h('button', {
        class: 'kb-btn kb-btn--primary',
        onclick: function () {
          global.GanttTrello.ensureRestAuthorized(M.t).then(function (r) { M.state.authOk = !!r.ok; M.renderBanner(); }, M.fail);
        },
      }, [S.icon('lock-open'), S.h('span', { text: 'Autoriser' })]));
    };
    M.record = function record(e) { return M.HP ? M.HP.record(e) : e; };
    M.applyEntry = function applyEntry(e, back) {
      var val = back ? e.beforeVal : e.afterVal;
      if (e.type === 'archive') return back ? S.TT().unarchiveCard(M.t, e.targetId) : S.TT().archiveCard(M.t, e.targetId);
      if (e.type === 'create') return back ? S.TT().archiveCard(M.t, e.targetId) : S.TT().unarchiveCard(M.t, e.targetId);
      if (e.type === 'move') return S.TT().moveCard(M.t, e.targetId, val, back ? e.beforePos : e.afterPos);
      if (e.type === 'reorder') return S.TT().reorderCard(M.t, e.targetId, val);
      if (e.type === 'progress') return M.writeProgress(e.targetId, val);
      return Promise.reject(new Error('Cette modification ne peut pas être annulée'));
    };
    M.histVerb = function histVerb(e) {
      if (e.type === 'archive') return 'archivée';
      if (e.type === 'create') return 'créée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      if (e.type === 'move') return 'déplacée';
      if (e.type === 'reorder') return 'réordonnée' + (e.after ? ' dans « ' + e.after + ' »' : '');
      return (e.label || 'Champ') + ' modifié';
    };
    M.findRow = function findRow(id) {
      return M.state.rows.filter(function (r) { return r.id === id; })[0] || null;
    };
    M.listById = function listById(id) {
      return M.state.lists.filter(function (l) { return l.id === id; })[0] || null;
    };
    M.viewOpts = function viewOpts() {
      return {
        filter: M.state.filter,
        hideDone: M.state.hideDone,
        blocked: M.state.facets.blocked,
        overdue: M.state.facets.overdue,
        today: S.todayIso(),
        tiers: S.tierDefs(),
        sort: M.state.sort,
        placeOf: function (r) { return M.state.places && global.WorkOS ? global.WorkOS.placeLabel(M.state.places[r.id]) : ''; },
      };
    };
    M.columns = function columns() {
      return S.KM().buildColumns(M.state.rows, M.state.lists, M.viewOpts());
    };
    M.filtering = function filtering() {
      return !!(M.state.filter || M.state.facets.blocked || M.state.facets.overdue);
    };
    M.closeDetail = function closeDetail() {
      var id = M.state.detailId;
      M.state.detailId = null;
      M.state.quickId = null;
      if (M.state.quick) {
        M.state.quick.destroy();
        M.state.quick = null;
      }
      M.els.detail.hidden = true;
      M.els.detailBody.textContent = '';
      M.els.board.querySelectorAll('.kb-card.is-selected').forEach(function (n) {
        n.classList.remove('is-selected');
        n.setAttribute('aria-selected', 'false');
      });
      var Iso = global.Isolation;
      if (id && Iso && typeof Iso.read === 'function' && typeof Iso.clear === 'function') {
        var cur = Iso.read();
        if (cur && cur.kind === 'task' && cur.id === id && !(global.TaskFocus && global.TaskFocus.currentId && global.TaskFocus.currentId() === id)) Iso.clear();
      }
    };
    M.openDetail = function openDetail(row) {
      if (!row) return;
      if (global.Isolation && typeof global.Isolation.set === 'function') {
        global.Isolation.set({ kind: 'task', id: row.id, label: row.name || '' });
      }
      M.state.detailId = row.id;
      M.els.detail.hidden = false;
      M.els.board.querySelectorAll('.kb-card').forEach(function (n) {
        var on = n.getAttribute('data-id') === row.id;
        n.classList.toggle('is-selected', on);
        n.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (M.state.quick && M.state.quickId === row.id) return;
      if (M.state.quick) M.state.quick.destroy();
      M.state.quick = null;
      M.state.quickId = row.id;
      M.els.detailBody.textContent = '';
      if (!global.CardQuick) {
        M.els.detailBody.appendChild(S.h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
        return;
      }
      M.state.quick = global.CardQuick.mount(M.els.detailBody, {
        t: M.t,
        cardId: row.id,
        name: row.name || '',
        onChange: function () { M.reload({ quiet: true }); },
        onToast: function (m, kind) { M.setStatus(m || '', kind === 'error' ? 'error' : 'ok'); },
        onGone: function () {
          M.closeDetail();
          M.reload({ quiet: true });
        },
      });
    };
    M.openCard = function openCard(row) {
      M.openDetail(row);
    };
    M.openEditor = function openEditor(row, kind, anchor) {
      if (!global.CardFields || !anchor) return false;
      return global.CardFields.open(kind, {
        t: M.t,
        cardId: row.id,
        cardName: row.name,
        anchor: anchor,
        onSaved: function () {
          M.setStatus('Enregistré', 'ok');
          M.record({ type: 'field', label: { priority: 'Urgence', due: 'Échéance', progress: 'Progrès' }[kind] || 'Champ', targetId: row.id, title: row.name });
        },
        onError: function (m) { M.setStatus(m, 'error'); },
        onClose: function (changed) { if (changed) M.reload({ quiet: true }); },
      });
    };
    M.btn = function btn(iconName, label, opts) {
      opts = opts || {};
      return S.h('button', {
        class: 'kb-btn' + (opts.active ? ' is-active' : '') + (label ? '' : ' kb-btn--icon') + (opts.cls ? ' ' + opts.cls : ''),
        title: opts.title || label || null,
        onclick: opts.onclick,
      }, [S.icon(iconName), label ? S.h('span', { text: label }) : null]);
    };
    M.closeSmartMenu = function closeSmartMenu() {
      if (!M.smartMenu) return;
      M.smartMenu.remove();
      M.smartMenu = null;
      document.removeEventListener('mousedown', M.onSmartOutside, true);
      document.removeEventListener('keydown', M.onSmartKey, true);
    };
    M.onSmartOutside = function onSmartOutside(e) { if (M.smartMenu && !M.smartMenu.contains(e.target) && !e.target.closest('.kb-btn--smart')) M.closeSmartMenu(); };
    M.onSmartKey = function onSmartKey(e) { if (e.key === 'Escape') M.closeSmartMenu(); };
    M.smartIds = function smartIds(f) {
      var ctx = {
        today: S.todayIso(),
        placeOf: function (r) { return M.state.places && global.WorkOS ? global.WorkOS.placeLabel(M.state.places[r.id]) : ''; },
      };
      var ids = new Set();
      M.state.rows.forEach(function (r) { if (S.KM().matchesSmart(r, f.match, ctx)) ids.add(r.id); });
      return ids;
    };
    M.generateSmart = function generateSmart() {
      if (M.state.smartBusy) return;
      M.state.smartBusy = true;
      M.state.smartError = '';
      M.paintSmartMenu();
      S.AI().smartFilters(M.t, { rows: M.state.rows, places: M.state.places, placeLabel: global.WorkOS && global.WorkOS.placeLabel, count: function (m) { return M.smartIds({ match: m }).size; } }).then(function (filters) {
        M.state.smartList = { sig: S.boardSig(M.state.rows), filters: filters };
        S.writeStored(S.SMART_KEY, M.state.smartList);
        if (!filters.length) M.state.smartError = 'Aucune suggestion pour le moment';
      }).catch(function (err) {
        M.state.smartError = (err && err.reason === 'no-provider') ? 'Configurez l’IA dans l’assistant' : 'Suggestions indisponibles';
      }).then(function () {
        M.state.smartBusy = false;
        M.paintSmartMenu();
      });
    };
    M.paintSmartMenu = function paintSmartMenu() {
      if (!M.smartMenu) return;
      M.smartMenu.textContent = '';
      var shown = M.state.smartList.filters.map(function (f) {
        return { label: f.label, match: f.match, n: M.smartIds(f).size };
      }).filter(function (f) { return f.n; });
      shown.forEach(function (f) {
        M.smartMenu.appendChild(S.h('button', {
          class: 'kb-smart-item' + (M.state.smart && M.state.smart.label === f.label ? ' is-active' : ''),
          type: 'button',
          onclick: function () {
            M.state.smart = M.state.smart && M.state.smart.label === f.label ? null : { label: f.label, match: f.match };
            M.closeSmartMenu();
            M.renderBar();
            M.renderBoard();
          },
        }, [S.h('span', { text: f.label }), S.h('span', { class: 'kb-facet-n', text: String(f.n) })]));
      });
      if (M.state.smartBusy) M.smartMenu.appendChild(S.h('div', { class: 'kb-smart-note', text: 'Analyse des cartes…' }));
      else if (M.state.smartError) M.smartMenu.appendChild(S.h('div', { class: 'kb-smart-note', text: M.state.smartError }));
      M.smartMenu.appendChild(S.h('button', {
        class: 'kb-smart-item kb-smart-refresh',
        type: 'button',
        disabled: M.state.smartBusy ? 'disabled' : null,
        onclick: M.generateSmart,
      }, [S.icon('refresh'), S.h('span', { text: shown.length ? 'Nouvelles suggestions' : 'Suggérer des filtres' })]));
    };
    M.smartButton = function smartButton() {
      return S.h('button', {
        class: 'kb-btn kb-btn--smart' + (M.state.smart ? ' is-active' : ''),
        type: 'button',
        title: 'Filtres intelligents',
        onclick: function (e) {
          if (M.smartMenu) { M.closeSmartMenu(); return; }
          var r = e.currentTarget.getBoundingClientRect();
          M.smartMenu = S.h('div', { class: 'kb-smart-menu', role: 'menu' });
          M.smartMenu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 268)) + 'px';
          M.smartMenu.style.top = (r.bottom + 4) + 'px';
          document.body.appendChild(M.smartMenu);
          document.addEventListener('mousedown', M.onSmartOutside, true);
          document.addEventListener('keydown', M.onSmartKey, true);
          M.paintSmartMenu();
          if (!M.state.smartList.filters.length || M.state.smartList.sig !== S.boardSig(M.state.rows)) M.generateSmart();
        },
      }, [S.icon('sparkles'), S.h('span', { text: 'Filtres' })]);
    };
    M.renderBar = function renderBar() {
      M.els.bar.textContent = '';
      var filter = S.h('input', {
        class: 'kb-filter tp-search-input',
        type: 'search',
        placeholder: 'Rechercher…',
        'aria-label': 'Rechercher',
        value: M.state.filter,
        oninput: function (e) {
          M.state.filter = e.target.value;
          M.renderBoard();
          M.paintCount();
        },
      });
      var done = M.state.rows.filter(function (r) { return r.statutKey === 'completed' || r.statutKey === 'canceled'; }).length;
      var viewed = S.KM().rowsInView(M.state.rows, M.state.lists, { filter: M.state.filter, hideDone: M.state.hideDone });
      var counts = S.KM().facetCounts(viewed, S.todayIso());
      function facetButton(key, iconName, label, count) {
        if (!count && !M.state.facets[key]) return null;
        return S.h('button', {
          class: 'kb-facet' + (M.state.facets[key] ? ' is-active' : ''),
          type: 'button',
          'data-facet': key,
          'aria-pressed': M.state.facets[key] ? 'true' : 'false',
          title: label,
          onclick: function () {
            M.state.facets[key] = !M.state.facets[key];
            M.renderBar();
            M.renderBoard();
            M.paintCount();
          },
        }, [S.icon(iconName), S.h('span', { text: label }), S.h('span', { class: 'kb-facet-n', text: String(count) })]);
      }
      [
        S.h('label', { class: 'kb-search tp-search' }, [S.icon('search'), filter]),
        facetButton('overdue', 'calendar-exclamation', 'En retard', counts.overdue),
        facetButton('blocked', 'player-pause', 'Bloquées', counts.blocked),
        S.AI() ? M.smartButton() : null,
        M.state.smart ? S.h('button', {
          class: 'kb-facet is-smart',
          type: 'button',
          title: 'Retirer le filtre',
          onclick: function () { M.state.smart = null; M.renderBar(); M.renderBoard(); },
        }, [S.icon('sparkles'), S.h('span', { text: M.state.smart.label }), S.h('span', { class: 'kb-facet-n', text: String(M.smartIds(M.state.smart).size) }), S.icon('x')]) : null,
        M.btn('refresh', null, { title: 'Actualiser', onclick: function () { M.reload(); } }),
        S.h('span', { class: 'kb-status' }),
        S.AI() ? M.boardAsk() : null,
        S.h('span', { class: 'kb-spacer' }),
        S.h('span', { class: 'kb-count', 'aria-live': 'polite' }),
        S.h('label', { class: 'kb-sort', title: 'Trier les cartes' }, [
          S.icon('arrows-sort'),
          S.h('select', {
            'aria-label': 'Trier les cartes',
            onchange: function (e) {
              M.state.sort = e.target.value;
              S.writeStored(S.SORT_KEY, M.state.sort);
              M.renderBoard();
            },
          }, S.SORTS.map(function (o) { return S.h('option', { value: o[0], text: o[1], selected: M.state.sort === o[0] }); })),
        ]),
        M.btn('layout-rows', 'Par priorité', {
          cls: 'kb-btn--lanes',
          active: M.state.lanes,
          title: M.state.lanes ? 'Revenir au tableau simple' : 'Grouper les cartes par priorité, les plus urgentes en haut',
          onclick: function () {
            M.state.lanes = !M.state.lanes;
            if (M.state.lanes) M.state.projects = false;
            S.writeStored(S.LANES_KEY, M.state.lanes);
            S.writeStored(S.PROJECTS_KEY, M.state.projects);
            M.renderBar();
            M.renderBoard();
          },
        }),
        M.btn('stack-2', 'Projets', {
          cls: 'kb-btn--lanes',
          active: M.state.projects,
          title: M.state.projects ? 'Revenir au tableau simple' : 'Voir les projets, leurs tâches et leurs sous-tâches',
          onclick: function () {
            M.state.projects = !M.state.projects;
            if (M.state.projects) M.state.lanes = false;
            S.writeStored(S.PROJECTS_KEY, M.state.projects);
            S.writeStored(S.LANES_KEY, M.state.lanes);
            M.renderBar();
            M.renderBoard();
          },
        }),
        M.btn(M.HD.icon(M.state.hideDone), M.HD.label(M.state.hideDone, done), {
          active: M.state.hideDone,
          title: M.HD.title(M.state.hideDone),
          onclick: function () { M.HD.set(!M.state.hideDone); },
        }),
        M.HP ? M.HP.button(document.body) : null,
      ].forEach(function (c) { if (c) M.els.bar.appendChild(c); });
      M.paintStatus();
      M.paintCount();
    };
    M.paintCount = function paintCount() {
      var c = M.els.bar.querySelector('.kb-count');
      if (!c) return;
      var shown = M.columns().reduce(function (n, col) { return n + col.cards.length; }, 0);
      var total = M.state.rows.length;
      c.textContent = (shown === total ? total : shown + ' / ' + total) + (total > 1 ? ' cartes' : ' carte');
    };
    M.askAI = function askAI(text, target, input) {
      text = String(text || '').trim();
      if (!text || M.state.aiBusy) return;
      M.state.aiBusy = true;
      if (input) input.disabled = true;
      M.setStatus('IA en cours…', 'busy');
      S.AI().run(M.t, { text: text, target: target, rows: M.state.rows, lists: M.state.lists, record: M.record }).then(function (res) {
        M.state.aiBusy = false;
        var ok = res.applied.length > 0;
        var msg = ok ? 'IA : ' + res.applied.join(', ') : res.message || 'Rien à modifier.';
        if (res.failed.length) msg += ' (échec : ' + res.failed.join(' ; ') + ')';
        M.setStatus(msg, res.failed.length && !ok ? 'error' : 'ok', 8000);
        return M.reload({ quiet: true });
      }, function (err) {
        M.state.aiBusy = false;
        if (input) { input.disabled = false; input.focus(); }
        M.fail(err);
      });
    };
    M.askInput = function askInput(cls, placeholder, target, getSuggestion) {
      var input = S.h('input', {
        class: cls,
        type: 'text',
        placeholder: placeholder,
        autocomplete: 'off',
        spellcheck: 'false',
        onkeydown: function (e) {
          e.stopPropagation();
          var sug = getSuggestion && !input.value ? getSuggestion() : '';
          if (e.key === 'Tab' && !e.shiftKey && sug) { e.preventDefault(); input.value = sug; M.askAI(sug, target, input); }
          else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); M.askAI(input.value, target, input); }
          else if (e.key === 'Escape') { input.value = ''; input.blur(); }
        },
        onclick: function (e) { e.stopPropagation(); },
      });
      return input;
    };
    M.askBox = function askBox(row) {
      var wrap = S.h('div', { class: 'kb-ask' });
      var btn = S.h('button', {
        class: 'kb-ai-toggle',
        type: 'button',
        title: 'Demander à l’IA',
        'aria-label': 'Demander à l’IA',
        onclick: function (e) {
          e.stopPropagation();
          if (wrap.classList.contains('is-open')) return;
          wrap.classList.add('is-open');
          btn.hidden = true;
          var sug = S.AI().cachedSuggestion(row);
          var input = M.askInput('kb-ai-input', sug || 'Demander à l’IA…', row, function () { return sug; });
          var box = S.h('div', { class: 'kb-ai', onclick: function (ev) { ev.stopPropagation(); } }, [S.icon('sparkles'), input]);
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
          S.AI().suggest(M.t, row).then(function (better) {
            if (better && better !== sug && document.body.contains(input) && !input.value) {
              sug = better;
              input.placeholder = better;
            }
          });
          input.focus();
        },
      }, [S.icon('sparkles')]);
      wrap.appendChild(btn);
      return wrap;
    };
    M.boardAsk = function boardAsk() {
      var input = M.askInput('kb-ai-input', 'Demander à l’IA : créer une tâche…', null);
      return S.h('label', { class: 'kb-ai kb-ai--bar', title: 'Créer ou mettre à jour des tâches en langage naturel' }, [S.icon('sparkles'), input]);
    };
    M.chip = function chip(cls, iconName, text, title, onclick) {
      return S.h('button', { class: 'kb-chip ' + cls, title: title || null, onclick: onclick }, [S.icon(iconName), text ? S.h('span', { text: text }) : null]);
    };
    M.subList = function subList(row) {
      var lines = [];
      function walk(items) {
        (items || []).forEach(function (it) {
          if (!it || typeof it.text !== 'string' || !it.text.trim()) return;
          var done = it.done === true || Number(it.progress) >= 100;
          var blocked = it.blocked === true && !done;
          lines.push(S.h('li', { class: 'kb-sub' + (done ? ' is-done' : '') + (blocked ? ' is-blocked' : '') }, [
            S.icon(done ? 'circle-check' : blocked ? 'player-pause' : 'circle'),
            S.h('span', { text: it.text }),
          ]));
          if (Array.isArray(it.items) && it.items.length) walk(it.items);
        });
      }
      walk(row.items);
      if (!lines.length) return null;
      return S.h('ul', { class: 'kb-subs' }, lines);
    };
    M.tile = function tile(row, list) {
      var badges = [];
      if (row.urgency) {
        var tone = S.URGENCY_TONE[row.urgency];
        badges.push(M.chip('kb-chip--u' + (tone == null ? 0 : tone), 'flame', row.urgency, 'Urgence · cliquer pour modifier', function (e) {
          e.stopPropagation();
          M.openEditor(row, 'priority', e.currentTarget);
        }));
      }
      if (row.due) {
        var closed = S.KM().isClosedKey(row.statutKey);
        var overdue = /^\d{4}-\d{2}-\d{2}/.test(row.due) && row.due.slice(0, 10) < S.todayIso() && !closed;
        var hard = global.WorkOS && global.WorkOS.dateKind(row) === 'hard';
        badges.push(M.chip('kb-chip--due' + (overdue ? ' is-overdue' : '') + (hard ? ' is-hard' : ''), overdue ? 'calendar-exclamation' : 'calendar-event', S.TM().dueLabel(row.due, overdue, S.todayIso()), (overdue ? 'En retard · ' : (hard ? 'Échéance · ' : '')) + row.due, function (e) {
          e.stopPropagation();
          M.openEditor(row, 'due', e.currentTarget);
        }));
      }
      if (typeof row.priority === 'number') {
        badges.push(M.chip('kb-chip--prio', 'flag', S.TM().formatPriority(row.priority), 'Priorité' + (row.tier ? ' · ' + row.tier : ''), function (e) {
          e.stopPropagation();
          M.openEditor(row, 'priority', e.currentTarget);
        }));
      }
      var estLabel = row.estimate > 0 && global.CardFields ? global.CardFields.formatMinutes(row.estimate) : '';
      badges.push(M.chip('kb-chip--est' + (estLabel ? '' : ' kb-chip--empty'), 'clock', estLabel, 'Estimation · cliquer pour modifier', function (e) {
        e.stopPropagation();
        if (!global.CardFields) return;
        global.CardFields.open('estimate', {
          t: M.t,
          cardId: row.id,
          minutes: row.estimate || 0,
          anchor: e.currentTarget,
          onSaved: function () { M.setStatus('Enregistré', 'ok'); M.record({ type: 'field', label: 'Estimation', targetId: row.id, title: row.name }); },
          onError: function (m) { M.setStatus(m, 'error'); },
          onClose: function (changed) { if (changed) M.reload({ quiet: true }); },
        });
      }));
      var kids = [];
      if (row.category) kids.push(S.h('div', { class: 'kb-cat', text: row.category }));
      kids.push(S.h('div', { class: 'kb-title', text: row.name || 'Sans titre' }));
      var stepText = global.WorkOS && global.WorkOS.stepText(row);
      if (stepText) kids.push(S.h('div', { class: 'kb-step', text: stepText }));
      var place = M.state.places && global.WorkOS ? global.WorkOS.placeLabel(M.state.places[row.id]) : '';
      if (place) {
        var pl = M.state.places[row.id];
        var placeKids = [S.h('span', { text: place })];
        if (pl && pl.projectId && global.ProjectIcon) {
          var placeGlyph = global.ProjectIcon.button({
            t: M.t,
            id: pl.projectId,
            icon: pl.icon,
            goals: function () { return M.state.goals; },
            onSaved: function () { M.reload({ quiet: true }); },
          });
          if (placeGlyph) placeKids.unshift(placeGlyph);
        }
        kids.push(S.h('div', { class: 'kb-place' }, placeKids));
      }
      if (badges.length) kids.push(S.h('div', { class: 'kb-badges' }, badges));
      var cardTimer = global.Timers && global.Timers.running(row.id);
      if (cardTimer) {
        kids.push(S.h('button', {
          class: 'kb-timer',
          type: 'button',
          title: 'Minuteur · cliquer pour modifier',
          onclick: function (e) {
            e.stopPropagation();
            M.openEditor(row, 'timer', e.currentTarget);
          },
        }, [S.icon('alarm'), S.h('span', { text: global.Timers.endLabel(cardTimer) })]));
      }
      var prog = null;
      if (typeof row.progress === 'number') {
        var p = Math.max(0, Math.min(100, row.progress));
        var ring = global.ProgressRing ? global.ProgressRing.create(p, row.blocked) : null;
        // Ring: one click marks the card complete (100 %) or reopens it (0 %); on a blocked card it unblocks.
        var ringBtn = S.h('button', {
          class: 'kb-prog-ring',
          type: 'button',
          title: row.blocked ? 'Bloqué — cliquer pour débloquer' : p >= 100 ? 'Terminé — cliquer pour rouvrir (0 %)' : 'Cliquer pour marquer comme terminé',
          onclick: function (e) {
            e.stopPropagation();
            if (row.blocked) return M.unblockRow(row);
            M.saveProgress(row, row.progress >= 100 ? 0 : 100);
          },
        }, [ring]);
        prog = S.h('div', {
          class: 'kb-prog' + (p >= 100 ? ' is-done' : ''),
          onclick: function (e) { e.stopPropagation(); },
        }, [
          ringBtn,
          S.h('span', { class: 'kb-prog-bar', title: 'Cliquer ou glisser pour régler le progrès' }, [S.h('i', { style: 'width:' + p + '%' })]),
          S.h('button', {
            class: 'kb-prog-num',
            type: 'button',
            title: 'Détail du progrès · cliquer pour modifier',
            text: p + '%',
            onclick: function (e) {
              e.stopPropagation();
              M.openEditor(row, 'progress', e.currentTarget.parentNode);
            },
          }),
        ]);
        kids.push(prog);
      }
      if (S.AI()) kids.push(M.askBox(row));
      if (M.state.projects) kids.push(M.subList(row));
      var accent = row.statutColor || (list && list.color) || '#626f86';
      // Blocked (flag or "Bloqué" status) yet complete: striped red/green accent instead of the plain status colour.
      var blockedDone = !!(row.blocked || row.statutKey === 'blocked') && typeof row.progress === 'number' && row.progress >= 100;
      // Completed / canceled (status, list or 100 %): the tile is grayed out, color returns on hover.
      var closedCard = !blockedDone && (S.KM().isClosedKey(row.statutKey) || S.KM().isClosedKey(list && list.category) || (typeof row.progress === 'number' && row.progress >= 100));
      var el = S.h('div', {
        class: 'kb-card' + (blockedDone ? ' is-blocked-done' : '') + (closedCard ? ' is-complete' : '') + (M.state.smartIds ? (M.state.smartIds.has(row.id) ? ' is-match' : ' is-dim') : '') + (M.state.detailId === row.id ? ' is-selected' : ''),
        draggable: 'true',
        tabindex: '0',
        'data-id': row.id,
        'aria-selected': M.state.detailId === row.id ? 'true' : 'false',
        style: '--kb-accent:' + accent + (blockedDone ? ';--kb-blocked:' + (row.statutKey === 'blocked' ? accent : '#e34935') : ''),
        onclick: function () { if (!M.state.swallowClick) M.openDetail(row); },
        onkeydown: function (e) {
          if (e.key === 'Enter' && e.target === el) {
            e.preventDefault();
            M.openDetail(row);
          }
        },
        oncontextmenu: function (e) {
          e.preventDefault();
          M.cardMenu(row, e.clientX, e.clientY);
        },
        ondragstart: function (e) {
          M.state.dragId = row.id;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', row.id); } catch (err) { /* ignore */ }
          setTimeout(function () { el.classList.add('is-dragging'); }, 0);
          M.els.board.classList.add('is-dragging');
          // Priority rows: a card only moves along its own row (its priority is computed, not dropped), so other rows go quiet.
          var own = S.KM().laneKey(row);
          M.els.board.querySelectorAll('.kb-cell').forEach(function (c) {
            c.classList.toggle('is-foreign', c.getAttribute('data-lane') !== own);
          });
        },
        ondragend: function () {
          M.state.dragId = null;
          M.els.board.classList.remove('is-dragging');
          M.els.board.querySelectorAll('.kb-cell.is-foreign').forEach(function (c) { c.classList.remove('is-foreign'); });
          M.clearDropMarks();
          el.classList.remove('is-dragging');
        },
      }, kids);
      if (prog) M.bindProgressDrag(el, prog, row);
      return el;
    };
    M.bindProgressDrag = function bindProgressDrag(card, prog, row) {
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
          M.state.swallowClick = true;
          setTimeout(function () { M.state.swallowClick = false; }, 0);
          if (pct !== row.progress) M.saveProgress(row, pct);
        }
        card.draggable = false;
        prog.classList.add('is-dragging');
        try { bar.setPointerCapture(e.pointerId); } catch (err) { /* no capture: the document listeners still follow the pointer */ }
        move(e);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
      });
    };
    M.cardMenu = function cardMenu(row, x, y) {
      if (!S.MENU()) return;
      var current = null;
      M.state.lists.forEach(function (l) { if (l.id === row.listId) current = l; });
      var moveItems = M.state.lists.map(function (l) {
        return {
          icon: l.icon,
          color: l.color,
          label: l.name,
          checked: l.id === row.listId,
          action: function () { if (l.id !== row.listId) M.dropCard(row.id, l.id, null); },
        };
      });
      S.MENU().show({ x: x, y: y }, [
        { title: row.name || 'Carte' },
        { icon: 'archive', label: 'Archiver', danger: true, action: function () { M.archiveRow(row); } },
        { sep: true },
        { icon: 'external-link', label: 'Ouvrir la carte', action: function () { M.openCard(row); } },
        {
          icon: 'external-link',
          label: 'Ouvrir dans',
          children: (global.ViewTabs ? global.ViewTabs.OPEN_IN : []).map(function (v) {
            return { icon: v.icon, label: v.label, action: function () { global.ViewTabs.openIn(v.key, row.id); } };
          }),
        },
        { sep: true },
        { icon: 'alarm', label: 'Minuteur…', action: function () { M.openEditor(row, 'timer', { getBoundingClientRect: function () { return { left: x, right: x, top: y, bottom: y }; } }); } },
        {
          icon: (current && current.icon) || 'progress-check',
          color: current && current.color,
          label: 'Statut',
          hint: (current && current.name) || row.statut || '',
          children: moveItems,
        },
      ].concat(global.Isolation ? global.Isolation.menuItems({
        cardId: row.id,
        cardName: row.name,
        projectId: row.projectId || '',
        projectName: row.project || '',
        people: global.Isolation.peopleOf(row),
      }) : []));
    };
    M.archiveRow = function archiveRow(row) {
      S.TT().archiveCard(M.t, row.id).then(function () {
        M.record({ type: 'archive', targetId: row.id, title: row.name, after: row.statut || '' }); // offers its own Annuler toast
        M.state.rows = M.state.rows.filter(function (r) { return r.id !== row.id; });
        if (M.state.detailId === row.id) M.closeDetail();
        M.renderBoard();
        M.paintCount();
      }, M.fail);
    };
    M.clearDropMarks = function clearDropMarks() {
      M.els.board.querySelectorAll('.is-over').forEach(function (n) { n.classList.remove('is-over'); });
      var m = M.els.board.querySelector('.kb-drop');
      if (m && m.parentNode) m.parentNode.removeChild(m);
      M.els.board.querySelectorAll('.is-drop-before, .is-drop-after, .is-drop-on').forEach(function (n) {
        n.classList.remove('is-drop-before', 'is-drop-after', 'is-drop-on');
      });
    };
    M.columnDropAt = function columnDropAt(x) {
      var cols = [].slice.call(M.els.board.querySelectorAll('.kb-col:not(.is-dragging-col), .kb-colhead:not(.is-dragging-col)'));
      var rects = cols.map(function (n) { return n.getBoundingClientRect(); });
      var index = S.KM().columnInsertIndex(rects, x);
      return { index: index, before: cols[index] || null, after: index > 0 ? cols[index - 1] : null };
    };
    M.dropIndex = function dropIndex(body, y) {
      var rects = [].slice.call(body.querySelectorAll('.kb-card:not(.is-dragging)')).map(function (n) {
        var r = n.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, node: n };
      });
      return { index: S.KM().insertIndex(rects, y), rects: rects };
    };
    M.colHead = function colHead(col, host) {
      var list = col.list;
      return S.h('header', {
        class: 'kb-col-head',
        draggable: 'true',
        title: 'Glisser pour réorganiser les colonnes',
        ondragstart: function (e) {
          M.state.dragListId = list.id;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', 'list:' + list.id); } catch (err) { /* ignore */ }
          try { e.dataTransfer.setDragImage(host, 20, 20); } catch (err) { /* default drag image */ }
          setTimeout(function () { host.classList.add('is-dragging-col'); }, 0);
          M.els.board.classList.add('is-dragging-list');
        },
        ondragend: function () {
          M.state.dragListId = null;
          M.els.board.classList.remove('is-dragging-list');
          host.classList.remove('is-dragging-col');
          M.clearDropMarks();
        },
      }, [
        S.h('span', { class: 'kb-col-icon' }, [S.icon(list.icon)]),
        S.h('span', { class: 'kb-col-name', text: list.name, title: list.name }),
        (function () {
          var over = list.category === 'started' && global.WorkOS && global.WorkOS.wip(M.state.rows, global.WorkOS.DEFAULT_WIP);
          if (over && over.over) {
            return S.h('button', {
              class: 'kb-col-count is-over',
              type: 'button',
              title: 'Ranger la moins prioritaire',
              text: over.count + '/' + over.cap,
              onclick: function (e) {
                e.stopPropagation();
                e.preventDefault();
                var park = over.park;
                var dest = M.state.lists.filter(function (l) { return l.category === 'unstarted'; })[0]
                  || M.state.lists.filter(function (l) { return l.category === 'backlog'; })[0];
                if (park && dest) M.dropCard(park.id, dest.id, null);
              },
            });
          }
          return S.h('span', { class: 'kb-col-count', text: String(M.filtering() ? col.cards.length : col.total) });
        })(),
        S.h('button', {
          class: 'kb-iconbtn',
          title: 'Nouvelle carte',
          onclick: function () { M.openComposer(list.id); },
        }, [S.icon('plus')]),
      ]);
    };
    M.bindDropZone = function bindDropZone(zone, body, list, lane) {
      function accepts() {
        if (M.state.dragProjectId) return !lane;
        if (!M.state.dragId) return false;
        if (!lane) return true;
        var dragged = M.findRow(M.state.dragId);
        return !!dragged && S.KM().laneKey(dragged) === lane;
      }
      zone.addEventListener('dragover', function (e) {
        if (!accepts()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        M.clearDropMarks();
        zone.classList.add('is-over');
        if (M.state.dragProjectId) return;
        var at = M.dropIndex(body, e.clientY);
        var marker = S.h('div', { class: 'kb-drop' });
        var ref = at.rects[at.index];
        var empty = body.querySelector('.kb-empty');
        if (ref) body.insertBefore(marker, ref.node);
        else if (empty) body.insertBefore(marker, empty);
        else body.appendChild(marker);
      });
      zone.addEventListener('dragleave', function (e) {
        if (!zone.contains(e.relatedTarget)) M.clearDropMarks();
      });
      zone.addEventListener('drop', function (e) {
        if (!accepts()) return;
        e.preventDefault();
        M.clearDropMarks();
        if (M.state.dragProjectId) {
          var projectId = M.state.dragProjectId;
          M.state.dragProjectId = null;
          M.moveProject(projectId, list.id);
          return;
        }
        var at = M.dropIndex(body, e.clientY).index;
        var id = M.state.dragId;
        M.dropCard(id, list.id, at, lane, M.state.projects && !lane ? '' : null);
      });
    };
    M.projectNodes = function projectNodes() {
      return ((M.state.goals && M.state.goals.nodes) || []).filter(function (n) { return n && n.level === 'project'; });
    };
    M.projectGlyph = function projectGlyph(project) {
      var name = project.icon && project.icon.i ? project.icon.i : 'stack-2';
      var color = project.icon && project.icon.c ? project.icon.c : '';
      return S.h('i', { class: 'ti ti-' + name + ' kb-proj-glyph', style: color ? 'color:' + color : '' });
    };
    M.projectTaskRows = function projectTaskRows(projectId) {
      return (M.state.rows || []).filter(function (r) { return r && r.projectId === projectId; });
    };
    M.saveProjectPriority = function saveProjectPriority(id, score) {
      var os = global.WorkOS;
      var GG = global.MindmapGoalsTrello;
      if (!id || !os || typeof os.withNodeEdit !== 'function' || !GG || typeof GG.save !== 'function') {
        return M.setStatus('Projets indisponibles', 'error');
      }
      var next = os.withNodeEdit(M.state.goals, id, { priority: score });
      M.state.goals = next;
      M.renderBoard();
      M.setStatus('Enregistrement…', 'busy');
      GG.save(M.t, next).then(function (saved) {
        M.state.goals = saved || next;
        M.renderBoard();
        M.setStatus(score == null ? 'Priorité retirée' : 'Priorité enregistrée', 'ok');
      }, function () {
        M.setStatus('Échec de l’enregistrement du projet', 'error');
        M.reload({ quiet: true });
      });
    };
    M.projectPriorityButton = function projectPriorityButton(project) {
      if (!project || !project.id) return S.h('span', { class: 'kb-proj-pri is-empty', text: '-', 'aria-hidden': 'true' });
      var has = typeof project.priority === 'number';
      var btn = S.h('button', {
        class: 'kb-proj-pri' + (has ? '' : ' is-empty'),
        type: 'button',
        title: 'Priorité',
        text: has && global.TableModel ? global.TableModel.formatPriority(project.priority) : (has ? Number(project.priority).toFixed(1) : '-'),
      });
      btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!global.TableModel || !S.MENU()) return;
        var rect = btn.getBoundingClientRect();
        S.MENU().show({ x: rect.left, y: rect.bottom + 4 }, [{ title: 'Priorité' }].concat(
          global.TableModel.projectPriorityItems(project.priority, function (score) { M.saveProjectPriority(project.id, score); })
        ));
      });
      btn.addEventListener('dragstart', function (e) { e.preventDefault(); e.stopPropagation(); });
      return btn;
    };
    M.projectProgress = function projectProgress(projectId) {
      var stats = global.TableModel && global.TableModel.sectionStats
        ? global.TableModel.sectionStats(M.projectTaskRows(projectId))
        : { progress: null, subs: 0 };
      var prog = stats.progress;
      if (stats.blocked && prog == null) prog = 0;
      var box = S.h('span', {
        class: 'kb-proj-prog' + (prog == null ? ' is-empty' : '') + (stats.blocked ? ' is-blocked' : ''),
        title: stats.blocked ? 'Une tâche est bloquée' : ((prog != null && prog >= 100) ? 'Rouvrir les tâches' : 'Terminer les tâches'),
        text: prog == null ? '-' : prog + '%',
      });
      var rows = M.projectTaskRows(projectId);
      if (rows.length) {
        box.style.cursor = 'pointer';
        box.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        box.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var CT = global.CompletionTrello;
          var next = CT && typeof CT.parentClickPercent === 'function' ? CT.parentClickPercent(prog) : ((prog != null && prog >= 100) ? 0 : 100);
          M.saveProjectProgress(projectId, rows, next);
        });
        box.addEventListener('dragstart', function (e) { e.preventDefault(); e.stopPropagation(); });
      }
      return box;
    };
    M.saveProjectProgress = function saveProjectProgress(projectId, rows, pct) {
      var CT = global.CompletionTrello;
      if (!CT || typeof CT.saveProgressTree !== 'function') return M.setStatus('Éditeur de progrès indisponible', 'error');
      var wasDone = {};
      (rows || []).forEach(function (r) { wasDone[r.id] = r.statutKey === 'completed'; });
      var name = '';
      M.projectNodes().forEach(function (n) { if (n.id === projectId) name = n.name || ''; });
      M.setStatus('Enregistrement…', 'busy');
      CT.saveProgressTree(M.t, rows, pct).then(function (ids) {
        if (pct < 100) return null;
        var list = M.state.lists.filter(function (l) { return l.category === 'completed'; })[0];
        if (!list || !global.TableTrello) return null;
        var chain = Promise.resolve();
        (ids || []).forEach(function (id) {
          if (wasDone[id]) return;
          chain = chain.then(function () { return global.TableTrello.moveCard(M.t, id, list.id, 'bottom'); });
        });
        return chain;
      }).then(function () {
        M.setStatus(pct >= 100 ? '« ' + (name || 'Projet') + ' » terminé' : 'Enregistré', 'ok');
        return M.reload({ quiet: true });
      }, function (err) {
        M.setStatus((err && err.message) || 'Erreur progrès', 'error');
        M.reload({ quiet: true });
      });
    };
    M.projectBlock = function projectBlock(block, list, body) {
      var id = block.project.id;
      var folded = !!M.state.projFolded[id];
      var guest = !!block.guest;
      var shell = S.h('div', {
        class: 'kb-proj' + (guest ? ' is-guest' : '') + (folded ? ' is-folded' : ''),
        'data-project': id,
      });
      var head = S.h('div', {
        class: 'kb-proj-head',
        draggable: guest ? 'false' : 'true',
        title: guest ? (block.project.name || 'Projet') : 'Glisser le projet vers une autre colonne',
        'aria-label': block.project.name || 'Projet',
      }, [
        S.h('button', {
          class: 'kb-proj-fold',
          type: 'button',
          title: folded ? 'Déplier' : 'Replier',
          onclick: function (e) {
            e.stopPropagation();
            if (folded) delete M.state.projFolded[id];
            else M.state.projFolded[id] = true;
            S.writeStored(S.PROJ_FOLDED_KEY, M.state.projFolded);
            M.renderBoard();
          },
        }, [S.icon(folded ? 'chevron-right' : 'chevron-down')]),
        M.projectGlyph(block.project),
        S.h('span', { class: 'kb-proj-name', text: block.project.name || 'Projet' }),
        M.projectPriorityButton(block.project),
        M.projectProgress(block.project.id),
        S.h('span', {
          class: 'kb-proj-n',
          text: block.tasks.length === block.total ? String(block.total) : block.tasks.length + '/' + block.total,
        }),
      ]);
      if (!guest) {
        head.ondragstart = function (e) {
          if (e.target && e.target.closest && e.target.closest('.kb-proj-pri, .kb-proj-prog')) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          M.state.dragProjectId = id;
          M.state.dragId = null;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', 'project:' + id); } catch (err) { /* ignore */ }
          setTimeout(function () { shell.classList.add('is-dragging'); }, 0);
          M.els.board.classList.add('is-dragging');
        };
        head.ondragend = function () {
          M.state.dragProjectId = null;
          M.els.board.classList.remove('is-dragging');
          shell.classList.remove('is-dragging');
          M.clearDropMarks();
        };
      }
      head.addEventListener('dragstart', function (e) {
        if (e.target && e.target.closest && e.target.closest('.kb-proj-pri, .kb-proj-prog')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
      shell.appendChild(head);
      shell.addEventListener('dragover', function (e) {
        if (M.state.dragProjectId || !M.state.dragId) return;
        e.preventDefault();
        shell.classList.add('is-drop-on');
      });
      shell.addEventListener('dragleave', function (e) {
        if (e.relatedTarget && shell.contains(e.relatedTarget)) return;
        shell.classList.remove('is-drop-on');
      });
      shell.addEventListener('drop', function (e) {
        if (M.state.dragProjectId || !M.state.dragId || !body) return;
        e.preventDefault();
        e.stopPropagation();
        M.clearDropMarks();
        var at = M.dropIndex(body, e.clientY).index;
        M.dropCard(M.state.dragId, list.id, at, null, block.project.id);
      });
      if (!folded) block.tasks.forEach(function (row) { shell.appendChild(M.tile(row, list)); });
      return shell;
    };
    M.column = function column(col) {
      var list = col.list;
      var body = S.h('div', { class: 'kb-cards' });
      if (M.state.projects && col.blocks) {
        col.blocks.forEach(function (block) { body.appendChild(M.projectBlock(block, list, body)); });
        col.guests.forEach(function (block) { body.appendChild(M.projectBlock(block, list, body)); });
        col.loose.forEach(function (row) { body.appendChild(M.tile(row, list)); });
      } else {
        col.cards.forEach(function (row) { body.appendChild(M.tile(row, list)); });
      }
      var shown = M.state.projects && col.blocks ? col.blocks.length + col.guests.length + col.loose.length : col.cards.length;
      // An empty column shows no placeholder: the "+ Ajouter une carte" button below is also a drop target (the whole column accepts drops).
      if (!shown && (col.hidden || M.filtering())) {
        body.appendChild(S.h('div', { class: 'kb-empty', text: col.hidden ? col.total + ' masquée' + (col.total > 1 ? 's' : '') : 'Aucune carte' }));
      }
      var colEl = S.h('section', {
        class: 'kb-col' + (S.KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        style: '--kb-accent:' + list.color,
      });
      colEl.appendChild(M.colHead(col, colEl));
      colEl.appendChild(S.h('div', { class: 'kb-col-scroll' }, [body, M.composer(list)]));
      M.bindDropZone(colEl, body, list, null);
      if (global.InsertGap) {
        global.InsertGap.watch(body, {
          item: '.kb-card',
          placeholder: 'Titre…',
          enabled: function () {
            return !M.els.board.classList.contains('is-dragging') && !M.els.board.classList.contains('is-dragging-list');
          },
          onCreate: function (title, info) {
            var aboveId = info.above && info.above.getAttribute('data-id');
            var belowId = info.below && info.below.getAttribute('data-id');
            return M.createIn(list, title, M.posAt(list.id, aboveId, belowId));
          },
        });
      }
      return colEl;
    };
    M.composer = function composer(list) {
      if (M.state.composer !== list.id) {
        return S.h('button', { class: 'kb-add', onclick: function () { M.openComposer(list.id); } }, [S.icon('plus'), S.h('span', { text: 'Nouvelle carte' })]);
      }
      var input = S.h('textarea', { class: 'kb-add-input', rows: '2', placeholder: 'Nouvelle carte…' });
      var busy = false;
      function submit(fromBlur) {
        var name = input.value.trim();
        if (!name || busy) return;
        busy = true;
        input.disabled = true;
        M.createIn(list, name).then(function () {
          M.state.composer = fromBlur === true ? null : list.id;
          M.renderBoard();
          var next = fromBlur === true ? null : M.els.board.querySelector('.kb-add-input');
          if (next) next.focus({ preventScroll: true });
        }, function (err) {
          busy = false;
          input.disabled = false;
          M.fail(err);
        });
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { M.state.composer = null; M.renderBoard(); }
      });
      // Clicking away keeps what was typed: the card is created (the composer's own buttons handle themselves).
      input.addEventListener('blur', function (e) {
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.kb-composer')) return;
        submit(true);
      });
      return S.h('div', { class: 'kb-composer' }, [
        input,
        S.h('div', { class: 'kb-composer-actions' }, [
          S.h('button', { class: 'kb-btn kb-btn--primary', onclick: function () { submit(); } }, [S.h('span', { text: 'Ajouter' })]),
          S.h('button', { class: 'kb-btn kb-btn--icon', title: 'Annuler', onclick: function () { M.state.composer = null; M.renderBoard(); } }, [S.icon('x')]),
        ]),
      ]);
    };
    M.openComposer = function openComposer(listId) {
      M.state.composer = listId;
      M.renderBoard();
      var input = M.els.board.querySelector('.kb-add-input');
      if (input) {
        input.focus({ preventScroll: false });
        input.scrollIntoView({ block: 'nearest' });
      }
    };
    M.laneColHead = function laneColHead(col) {
      var list = col.list;
      var box = S.h('div', {
        class: 'kb-colhead' + (S.KM().isClosedKey(list.category) ? ' is-closed' : ''),
        'data-list': list.id,
        style: '--kb-accent:' + list.color,
      });
      var inner = S.h('div', { class: 'kb-colhead-box' });
      inner.appendChild(M.colHead(col, box));
      if (col.hidden && !col.cards.length) {
        inner.appendChild(S.h('div', { class: 'kb-empty', text: col.total + ' masquée' + (col.total > 1 ? 's' : '') }));
      }
      if (M.state.composer === list.id) inner.appendChild(M.composer(list));
      box.appendChild(inner);
      return box;
    };
    M.laneHead = function laneHead(lane) {
      var folded = !!M.state.lanesFolded[lane.key];
      return S.h('div', {
        class: 'kb-lane-head' + (lane.count ? '' : ' is-empty'),
        'data-lane': lane.key,
        style: lane.color ? '--kb-lane:' + lane.color : null,
      }, [
        S.h('button', {
          class: 'kb-lane-toggle',
          type: 'button',
          'aria-expanded': folded ? 'false' : 'true',
          title: folded ? 'Déplier' : 'Replier',
          onclick: function () {
            if (folded) delete M.state.lanesFolded[lane.key];
            else M.state.lanesFolded[lane.key] = true;
            S.writeStored(S.LANES_FOLDED_KEY, M.state.lanesFolded);
            M.renderBoard();
          },
        }, [
          S.icon(folded ? 'chevron-right' : 'chevron-down'),
          S.h('span', { class: 'kb-lane-dot' }),
          S.h('span', { class: 'kb-lane-name', text: lane.label }),
          S.h('span', { class: 'kb-lane-count', text: String(lane.count) }),
        ]),
      ]);
    };
    },
    run: function (M) {
    M.HD = global.HideDone;
    M.state = {
      lists: [],
      rows: [],
      places: {},
      goals: { nodes: [], links: [] },
      filter: '',
      facets: { blocked: false, overdue: false },
      lanes: S.readStored(S.LANES_KEY, false) === true, // rows = priority tiers (Y axis), columns stay the board's lists
      lanesFolded: S.readStored(S.LANES_FOLDED_KEY, {}) || {}, // lane key -> true when its row is folded
      projects: S.readStored(S.PROJECTS_KEY, false) === true, // project shells in the columns, tasks and subtasks inside
      projFolded: S.readStored(S.PROJ_FOLDED_KEY, {}) || {},
      goals: { nodes: [], links: [] },
      sort: S.readStored(S.SORT_KEY, 'manual'),
      smart: null, // active smart filter { label, match }: matching cards are highlighted, the others dimmed
      smartList: S.readSmart(), // last AI suggestions { sig, filters }
      smartBusy: false,
      smartError: '',
      hideDone: M.HD.get(),
      authOk: true,
      detailId: null,
      quick: null,
      quickId: null,
      dragId: null,
      dragProjectId: null, // project shell being dragged to another column
      dragListId: null, // list id of the column being dragged by its header
      composer: null, // list id with the open "add card" composer
      aiBusy: false,
      swallowClick: false, // true for one tick after a progress-bar drag so the release does not open the card
      status: '',
      statusKind: '',
    };
    M.statusTimer = null;
    M.HP = null;
    M.root.innerHTML = '';
    M.els = {
      bar: S.h('div', { class: 'kb-bar' }),
      banner: S.h('div', { class: 'kb-banner', hidden: true }),
      board: S.h('div', { class: 'kb-board' }),
      detailBody: S.h('div', { class: 'kb-detail-body' }),
    };
    M.els.detail = S.h('aside', { class: 'kb-detail', hidden: true, 'aria-label': 'Détail de la carte' }, [
      S.h('button', {
        class: 'kb-iconbtn kb-detail-close',
        type: 'button',
        title: 'Fermer',
        'aria-label': 'Fermer',
        onclick: function () { M.closeDetail(); },
      }, [S.icon('x')]),
      M.els.detailBody,
    ]);
    M.els.stage = S.h('div', { class: 'kb-stage' }, [M.els.board, M.els.detail]);
    M.els.root = S.h('div', { class: 'kb-root', tabindex: '-1' }, [M.els.bar, M.els.banner, M.els.stage]);
    M.root.appendChild(M.els.root);
    M.boardId = '';
    try { M.boardId = (M.t && typeof M.t.getContext === 'function' && M.t.getContext().board) || ''; } catch (e) { /* no context */ }
    if (global.HistoryPanel) {
      M.HP = global.HistoryPanel.create({
        key: 'tp-kanban-history:' + M.boardId,
        apply: M.applyEntry,
        verb: M.histVerb,
        after: function () { return M.reload({ quiet: true }); },
        onStatus: function (m, kind, openHistory) { M.setStatus(m, kind, undefined, openHistory); },
        onError: M.fail,
      });
    }
    M.smartMenu = null;
    M.els.board.addEventListener('dragover', function (e) {
      if (!M.state.dragListId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      M.clearDropMarks();
      var at = M.columnDropAt(e.clientX);
      if (at.before) at.before.classList.add('is-drop-before');
      else if (at.after) at.after.classList.add('is-drop-after');
    });
    M.els.board.addEventListener('drop', function (e) {
      if (!M.state.dragListId) return;
      e.preventDefault();
      var id = M.state.dragListId;
      var index = M.columnDropAt(e.clientX).index;
      M.clearDropMarks();
      M.dropList(id, index);
    });
    }
  });
})(typeof window !== 'undefined' ? window : this);
