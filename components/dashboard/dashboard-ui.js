/*
 * Role: UI of the Dashboard view, a Linear-style workspace in four steps:
 *   Ingest        type tasks (one per line) → cards land in the triage list; optional "Demander à l'IA"
 *   Triage        inbox, one card at a time: define priority / estimate / date, then accept, backlog or cancel
 *   Orchestrateur plan the week: drag tasks onto days (capacity bar per day) or "Planifier auto"
 *   Aujourd'hui   focus list + hour-by-hour timeline of the day
 * Data and writes: DashboardTrello (Trello is the source of truth); logic: DashboardModel (pure).
 * Keys: 1-4 section · C capture · J/K move · A accept · B backlog · X cancel (Triage).
 * Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var DM = function () { return global.DashboardModel; };
  var DT = function () { return global.DashboardTrello; };
  var TM = function () { return global.TableModel; };

  var SECTIONS = [
    { key: 'ingest', label: 'Capture', icon: 'inbox', hint: '1' },
    { key: 'triage', label: 'Triage', icon: 'circle-arrow-down', hint: '2' },
    { key: 'orchestrator', label: 'Orchestrateur', icon: 'calendar-event', hint: '3' },
    { key: 'today', label: 'Aujourd’hui', icon: 'sun', hint: '4' },
  ];
  var URGENCIES = [
    ['aucun', 'Aucune'],
    ['bientot', 'Bientôt'],
    ['assez-vite', 'Assez vite'],
    ['vite', 'Vite'],
    ['au-plus-vite', 'Au plus vite'],
  ];
  var ESTIMATES = [0, 15, 30, 60, 120, 240];
  var QUICK_ESTIMATES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 0];
  var DAYS_FR =['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var HORIZON = 7;

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
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
    return DM().isoOf(new Date());
  }

  function skeleton() {
    var rows = '';
    for (var i = 0; i < 5; i++) rows += '<div class="db-skel db-skel--row"></div>';
    return '<div class="db-root" aria-busy="true"><div class="db-side"></div><div class="db-main">' + rows + '</div></div>';
  }

  /** Icon for a day relative to today (circle-dot, jumping arrow, two arrows, calendars). */
  function dayIconName(iso, today) {
    var days = Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    var CM = global.ContextMenu;
    return CM && CM.dayIcon ? CM.dayIcon(days) : 'calendar-event';
  }

  function dayLabel(iso, today) {
    if (iso === today) return 'Aujourd’hui';
    if (iso === DM().addDays(today, 1)) return 'Demain';
    var d = new Date(iso + 'T00:00:00');
    return DAYS_FR[d.getDay()] + ' ' + TM().formatDay(iso);
  }

  function mount(root, t) {
    var state = {
      section: 'ingest',
      lists: [],
      rows: [],
      selected: null, // triage selection (card id)
      capacity: DT().getCapacity(),
      busy: false,
      status: '',
      statusKind: '',
      draftHtml: '', // capture editor content, kept across section switches
      files: {}, // pending attachments of the capture editor: id → { file, thumb }
      authOk: true,
      landed: false, // first load decides the landing section once
    };
    var statusTimer = null;
    var reloadTimer = null;
    var today = todayIso();

    root.innerHTML = '';
    var els = {
      side: h('nav', { class: 'db-side', 'aria-label': 'Dashboard' }),
      main: h('main', { class: 'db-main' }),
      status: h('div', { class: 'db-status' }),
    };
    var shell = h('div', { class: 'db-root', tabindex: '-1' }, [els.side, h('div', { class: 'db-col' }, [els.main, els.status])]);
    root.appendChild(shell);

    /* ── Status ────────────────────────────────────────────────────── */
    function setStatus(msg, kind, keepMs) {
      state.status = msg || '';
      state.statusKind = kind || '';
      els.status.className = 'db-status' + (kind ? ' is-' + kind : '');
      els.status.textContent = '';
      if (kind === 'ok') els.status.appendChild(icon('check'));
      if (kind === 'busy') els.status.appendChild(icon('refresh', 'db-spin'));
      if (kind === 'error') els.status.appendChild(icon('alert-triangle'));
      els.status.appendChild(document.createTextNode(msg || ''));
      clearTimeout(statusTimer);
      if (msg && kind !== 'error' && kind !== 'busy') {
        statusTimer = setTimeout(function () { setStatus('', ''); }, keepMs || 2500);
      }
    }

    function fail(err) {
      var reason = err && (err.reason || err.message);
      if (reason === 'not-authorized' || reason === 'no-token' || reason === 'auth-failed') {
        state.authOk = false;
        setStatus('Autorisez Trello (REST) pour enregistrer : ouvrez le Kanban ou le Tableau une fois.', 'error');
      } else {
        setStatus('Erreur : ' + (reason || 'inconnue'), 'error');
      }
    }

    /** Runs a write; on failure shows the error and reloads the truth from Trello. */
    function write(promise, okMsg) {
      return promise.then(function (r) {
        if (okMsg) setStatus(okMsg, 'ok');
        scheduleReload();
        return r;
      }, function (err) {
        fail(err);
        reload({ quiet: true });
      });
    }

    function scheduleReload() {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(function tick() {
        // A re-render would drop the caret of a field being edited: wait until the user leaves it.
        var a = document.activeElement;
        if (a && els.main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
          reloadTimer = setTimeout(tick, 1500);
          return;
        }
        reload({ quiet: true });
      }, 2500);
    }

    /* ── Sidebar ───────────────────────────────────────────────────── */
    function renderSide() {
      var c = DM().counts(state.rows, today);
      els.side.textContent = '';
      SECTIONS.forEach(function (s) {
        var n = s.key === 'triage' ? c.triage : s.key === 'orchestrator' ? c.orchestrator : s.key === 'today' ? c.today : 0;
        els.side.appendChild(h('button', {
          class: 'db-nav' + (state.section === s.key ? ' is-on' : ''),
          type: 'button',
          title: s.label + ' (' + s.hint + ')',
          onclick: function () { go(s.key); },
        }, [
          icon(s.icon),
          h('span', { class: 'db-nav-label', text: s.label }),
          n ? h('span', { class: 'db-badge', text: String(n) }) : null,
        ]));
      });
      els.side.appendChild(h('div', { class: 'db-side-foot' }, [
        h('span', { text: 'Capacité / jour' }),
        h('select', {
          class: 'db-select',
          'aria-label': 'Capacité par jour',
          onchange: function (e) {
            state.capacity = Number(e.target.value);
            DT().setCapacity(state.capacity);
            render();
          },
        }, [3, 4, 5, 6, 7, 8].map(function (hrs) {
          return h('option', { value: String(hrs * 60), selected: state.capacity === hrs * 60, text: hrs + ' h' });
        })),
      ]));
    }

    function go(key) {
      state.section = key;
      render();
      if (key === 'ingest') {
        var ta = els.main.querySelector('.db-capture');
        if (ta) ta.focus();
      }
    }

    /* ── Shared row pieces ─────────────────────────────────────────── */
    function statusIcon(row) {
      var l = state.lists.filter(function (x) { return x.id === row.listId; })[0];
      var i = icon(l ? l.icon : 'circle-dotted', 'db-st');
      if (l) i.style.color = l.color;
      return i;
    }

    /** Clickable priority badge: opens the shared priority editor hanging from it. */
    function prioBadge(row, askIfEmpty) {
      var has = typeof row.priority === 'number';
      if (!has && askIfEmpty !== true) return null;
      var badge = h('button', {
        class: has ? 'db-prio db-prio--btn db-prio--' + (row.tierI == null ? 'n' : Math.min(row.tierI, 4)) : 'db-chip db-chip--btn',
        type: 'button',
        title: (has ? (row.tier || 'Priorité') + ' · ' : '') + 'Cliquer pour changer la priorité',
        onclick: function (e) {
          e.stopPropagation();
          if (!global.CardFields) return;
          global.CardFields.open('priority', {
            t: t,
            cardId: row.id,
            cardName: row.name,
            anchor: badge,
            onSaved: function () { setStatus('Enregistré', 'ok', 2500); },
            onError: function (m) { setStatus(m, 'error'); },
            onClose: function (changed) { if (changed) reload({ quiet: true }); },
          });
        },
      }, has ? [document.createTextNode(String(row.priority))] : [icon('flag'), document.createTextNode('Prioriser…')]);
      return badge;
    }

    function setEstimate(row, minutes) {
      row.estimate = minutes;
      write(DT().saveEstimate(t, row.id, minutes));
      render();
    }

    /** Clickable estimate chip: opens a duration menu (same menu everywhere in the app). */
    function estChip(row) {
      var chip = h('button', {
        class: 'db-chip db-chip--btn',
        type: 'button',
        title: 'Cliquer pour changer l’estimation',
        onclick: function (e) {
          e.stopPropagation();
          var CM = global.ContextMenu;
          if (!CM || typeof CM.show !== 'function') return;
          var r = chip.getBoundingClientRect();
          var items = QUICK_ESTIMATES.map(function (m) {
            return {
              id: 'est:' + m,
              label: m ? DM().formatMinutes(m) : 'Non estimée',
              icon: m ? 'clock' : 'clock-off',
              checked: (row.estimate || 0) === m,
              action: function () { setEstimate(row, m); },
            };
          });
          CM.show({ clientX: r.left, clientY: r.bottom + 4 }, items);
        },
      }, [icon('clock'), document.createTextNode(row.estimate ? DM().formatMinutes(row.estimate) : 'Estimer…')]);
      return chip;
    }

    /** Chip that opens a menu next to itself (shared ContextMenu). */
    function menuChip(cls, title, iconName, text, buildItems) {
      var chip = h('button', { class: 'db-chip db-chip--btn ' + cls, type: 'button', title: title, onclick: function (e) {
        e.stopPropagation();
        var CM = global.ContextMenu;
        if (!CM || typeof CM.show !== 'function') return;
        var r = chip.getBoundingClientRect();
        CM.show({ clientX: r.left, clientY: r.bottom + 4 }, buildItems());
      } }, [icon(iconName), document.createTextNode(text)]);
      return chip;
    }

    /** Clickable day chip: plans the card on the chosen day (icons follow the day). */
    function dueChip(row) {
      var late = !!row.due && row.due < today && DM().isOpen(row);
      var label = !row.due ? 'Planifier…' : row.due === today ? 'Aujourd’hui' : dayLabel(row.due, today);
      return menuChip(late ? 'is-late' : '', 'Cliquer pour changer le jour', row.due ? dayIconName(row.due, today) : 'calendar-plus', label, function () {
        var items = [];
        for (var n = 0; n <= 7; n++) {
          (function (iso) {
            items.push({
              id: 'plan:' + iso,
              label: dayLabel(iso, today),
              icon: dayIconName(iso, today),
              checked: row.due === iso,
              action: function () { plan(row, iso); },
            });
          })(DM().addDays(today, n));
        }
        return items;
      });
    }

    /** Clickable "used / capacity" chip: sets the daily capacity. */
    function capChip(used) {
      return menuChip('', 'Cliquer pour changer la capacité par jour', 'gauge', DM().formatMinutes(used) + ' / ' + DM().formatMinutes(state.capacity), function () {
        return [3, 4, 5, 6, 7, 8].map(function (hrs) {
          return {
            id: 'cap:' + hrs,
            label: hrs + ' h par jour',
            icon: 'clock-hour-' + Math.min(hrs, 12),
            checked: state.capacity === hrs * 60,
            action: function () { state.capacity = hrs * 60; DT().setCapacity(state.capacity); render(); },
          };
        });
      });
    }

    function openCard(row) {
      if (row.link && global.window && typeof t.showCard === 'function') {
        var id = row.link.split('/c/')[1];
        t.showCard(id ? id.split('/')[0] : row.id).catch(function () {});
      }
    }

    /* ── 1. Ingest (rich capture) ──────────────────────────────────── */
    var attSeq = 0;

    function escHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function sizeLabel(n) {
      return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
    }

    /** Inline chip for a pasted / dropped file; `data-aid` links it to state.files. */
    function chipHtml(aid, att) {
      var visual = att.thumb
        ? '<img class="db-att-img" alt="" src="' + escHtml(att.thumb) + '">'
        : '<i class="ti ti-' + (att.file.type === 'application/pdf' ? 'file-type-pdf' : 'file') + '"></i>';
      return (
        '<span class="db-att" contenteditable="false" data-aid="' + aid + '" title="' + escHtml(att.file.name) + '">' +
        visual +
        '<span class="db-att-name">' + escHtml(att.file.name) + '</span>' +
        '<span class="db-att-size">' + sizeLabel(att.file.size) + '</span>' +
        '<button class="db-att-x" type="button" tabindex="-1" aria-label="Retirer">×</button></span>'
      );
    }

    function addFile(file) {
      if (file.size > DM().MAX_FILE_BYTES) {
        setStatus('« ' + file.name + ' » dépasse 10 Mo (limite de Trello).', 'error', 5000);
        return null;
      }
      var aid = 'a' + ++attSeq;
      var isImg = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(file.type);
      var att = { file: file, thumb: isImg && global.URL && URL.createObjectURL ? URL.createObjectURL(file) : '' };
      if (!file.name || file.name === 'image.png') {
        var d = new Date();
        var stamp = ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2);
        var ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        try { att.file = new File([file], 'Capture ' + stamp + '.' + ext, { type: file.type }); } catch (e) { /* keep the original name */ }
      }
      state.files[aid] = att;
      return chipHtml(aid, att);
    }

    function dropFile(aid) {
      var att = state.files[aid];
      if (att && att.thumb) try { URL.revokeObjectURL(att.thumb); } catch (e) { /* ignore */ }
      delete state.files[aid];
    }

    /** Editor content → Markdown, each chip replaced by its ⟦id⟧ token (DocsModel.domToMd does the formatting). */
    function editorMarkdown(ed) {
      var clone = ed.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('.db-att'), function (c) {
        c.replaceWith(document.createTextNode(' ' + DM().captureToken(c.getAttribute('data-aid')) + ' '));
      });
      return global.DocsModel.domToMd(clone);
    }

    function captureTasks(ed) {
      var names = {};
      Object.keys(state.files).forEach(function (k) { names[k] = state.files[k].file.name; });
      return DM().parseCapture(editorMarkdown(ed), names).map(function (task) {
        task.files = task.aids.map(function (id) { return state.files[id] && state.files[id].file; }).filter(Boolean);
        return task;
      });
    }

    function renderIngest() {
      var recent = DM().triageQueue(state.rows).slice(-5).reverse();
      var DOCS = global.DocsModel;
      var ed = h('div', {
        class: 'db-capture',
        contenteditable: 'true',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Capture',
        'data-placeholder': 'Une tâche par ligne. Collez du texte, des liens, des images ou des documents.',
        spellcheck: 'true',
      });
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* browser default separator */ }
      ed.innerHTML = state.draftHtml || '';
      var count = h('span', { class: 'db-muted' });
      function refresh() {
        var empty = !ed.textContent.trim() && !ed.querySelector('.db-att, img');
        ed.classList.toggle('is-empty', empty);
        state.draftHtml = empty ? '' : ed.innerHTML;
        var found = empty ? [] : captureTasks(ed);
        var n = found.length;
        var dated = found.filter(function (x) { return x.due; }).length;
        count.textContent = n ? n + (n > 1 ? ' tâches' : ' tâche') + (dated ? ' · ' + dated + ' avec échéance' : '') : '';
      }
      function insertHtml(html) {
        ed.focus();
        document.execCommand('insertHTML', false, html);
        refresh();
      }
      function paste(e) {
        var cd = e.clipboardData;
        if (!cd) return;
        var files = Array.prototype.slice.call(cd.files || []);
        if (files.length) {
          e.preventDefault();
          insertHtml(files.map(addFile).filter(Boolean).join(''));
          return;
        }
        var html = cd.getData('text/html');
        var text = cd.getData('text/plain');
        if (!html && !text) return;
        e.preventDefault();
        var out;
        if (html && DOCS) {
          // Same sanitizer as the Documents editor: HTML → Markdown → whitelisted HTML (bold, italic, links, lists...).
          out = DOCS.mdToHtml(DOCS.domToMd(new DOMParser().parseFromString(html, 'text/html').body));
          var single = /^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/.exec(out);
          if (single) out = single[1];
        } else {
          var lines = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
          // One line stays inline (the caret remains on it, so a file pasted next joins this task).
          out = lines.length === 1 ? escHtml(lines[0]) : lines.map(function (l) { return '<p>' + escHtml(l) + '</p>'; }).join('');
        }
        insertHtml(out);
      }
      function submit() {
        var tasks = captureTasks(ed);
        if (!tasks.length || state.busy) return;
        state.busy = true;
        var nFiles = tasks.reduce(function (n, x) { return n + x.files.length; }, 0);
        setStatus(nFiles ? 'Création et envoi des pièces jointes…' : 'Création…', 'busy');
        DT().ingest(t, tasks, state.lists).then(function (res) {
          state.busy = false;
          Object.keys(state.files).forEach(dropFile);
          state.draftHtml = '';
          var msg = tasks.length + (tasks.length > 1 ? ' tâches ajoutées' : ' tâche ajoutée') + ' dans « ' + res.list.name + ' »';
          if (res.failed.length) setStatus(msg + ' (échec : ' + res.failed.join(', ') + ')', 'error');
          else setStatus(msg, 'ok');
          return reload({ quiet: true });
        }, function (err) { state.busy = false; fail(err); });
      }
      function askAI() {
        var text = ed.innerText.trim();
        var AI = global.KanbanAI;
        if (!text || state.busy) return;
        if (!AI) return setStatus('IA indisponible', 'error');
        state.busy = true;
        setStatus('IA en cours…', 'busy');
        AI.run(t, { text: 'Crée une tâche par élément (sépare le texte en tâches distinctes), dans la liste de triage : ' + text, rows: state.rows, lists: state.lists }).then(function (res) {
          state.busy = false;
          if (res.applied.length) { state.draftHtml = ''; Object.keys(state.files).forEach(dropFile); }
          setStatus(res.applied.length ? 'IA : ' + res.applied.join(', ') : res.message || 'Rien à créer.', res.applied.length ? 'ok' : 'error', 6000);
          return reload({ quiet: true });
        }, function (err) { state.busy = false; fail(err); });
      }
      function format(cmd) {
        ed.focus();
        document.execCommand(cmd);
        refresh();
      }
      var picker = h('input', {
        type: 'file',
        multiple: true,
        hidden: true,
        onchange: function (e) {
          var html = Array.prototype.map.call(e.target.files, addFile).filter(Boolean).join('');
          e.target.value = '';
          if (html) insertHtml(html);
        },
      });

      ed.addEventListener('input', refresh);
      ed.addEventListener('paste', paste);
      ed.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); }
      });
      ed.addEventListener('click', function (e) {
        var x = e.target.closest && e.target.closest('.db-att-x');
        if (!x) return;
        var chip = x.closest('.db-att');
        dropFile(chip.getAttribute('data-aid'));
        chip.remove();
        refresh();
      });
      ed.addEventListener('dragover', function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); ed.classList.add('is-drop'); }
      });
      ed.addEventListener('dragleave', function () { ed.classList.remove('is-drop'); });
      ed.addEventListener('drop', function (e) {
        ed.classList.remove('is-drop');
        var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
        if (!files.length) return;
        e.preventDefault();
        insertHtml(files.map(addFile).filter(Boolean).join(''));
      });

      function tool(iconName, title, fn) {
        return h('button', { class: 'db-icon-btn', type: 'button', title: title, 'aria-label': title, onmousedown: function (e) { e.preventDefault(); }, onclick: fn }, [icon(iconName)]);
      }
      refresh();
      els.main.appendChild(h('div', { class: 'db-page' }, [
        pageHead('Capture', 'Videz votre tête : tout arrive dans la liste de triage.'),
        h('div', { class: 'db-card' }, [
          ed,
          h('div', { class: 'db-actions' }, [
            tool('bold', 'Gras (Ctrl+B)', function () { format('bold'); }),
            tool('italic', 'Italique (Ctrl+I)', function () { format('italic'); }),
            tool('paperclip', 'Joindre des fichiers', function () { picker.click(); }),
            picker,
            count,
            h('span', { class: 'db-spacer' }),
            h('button', { class: 'db-btn', type: 'button', onclick: askAI }, [icon('sparkles'), document.createTextNode('Demander à l’IA')]),
            h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: submit }, [icon('plus'), document.createTextNode('Ajouter'), h('kbd', { text: 'Ctrl+↵' })]),
          ]),
        ]),
        h('p', { class: 'db-hint', text: 'Entrée : nouvelle tâche. Maj+Entrée : ligne suivante dans la même tâche (devient la description). Les images et documents collés ou déposés sont joints à la tâche de la ligne où ils se trouvent.' }),
        recent.length ? h('div', { class: 'db-section-title', text: 'Derniers ajouts' }) : null,
        recent.length ? h('div', { class: 'db-list' }, recent.map(function (r) {
          return h('div', { class: 'db-row', onclick: function () { state.selected = r.id; go('triage'); } }, [statusIcon(r), h('span', { class: 'db-row-name', text: r.name })]);
        })) : null,
      ]));
      setTimeout(function () { ed.focus(); }, 0);
    }

    function pageHead(title, sub, right) {
      return h('header', { class: 'db-head' }, [
        h('div', {}, [h('h1', { class: 'db-title', text: title }), sub ? h('p', { class: 'db-sub', text: sub }) : null]),
        right || null,
      ]);
    }

    /* ── 2. Triage ─────────────────────────────────────────────────── */
    function renderTriage() {
      var q = DM().triageQueue(state.rows);
      if (!q.length) {
        els.main.appendChild(h('div', { class: 'db-page' }, [
          pageHead('Triage', 'Rien à trier.'),
          h('div', { class: 'db-empty' }, [icon('inbox'), h('p', { text: 'Boîte de triage vide. Bien joué.' }),
            h('button', { class: 'db-btn', type: 'button', onclick: function () { go('ingest'); } }, [icon('plus'), document.createTextNode('Capturer des tâches')])]),
        ]));
        return;
      }
      var sel = q.filter(function (r) { return r.id === state.selected; })[0] || q[0];
      state.selected = sel.id;
      var list = h('div', { class: 'db-list db-triage-list' }, q.map(function (r) {
        return h('div', { class: 'db-row' + (r.id === sel.id ? ' is-sel' : ''), onclick: function () { state.selected = r.id; render(); } }, [
          statusIcon(r), h('span', { class: 'db-row-name', text: r.name }), prioBadge(r),
        ]);
      }));
      els.main.appendChild(h('div', { class: 'db-page db-page--split' }, [
        h('div', { class: 'db-split-l' }, [pageHead('Triage', q.length + (q.length > 1 ? ' cartes à définir' : ' carte à définir')), list]),
        h('div', { class: 'db-split-r' }, [triageDetail(sel, q)]),
      ]));
    }

    function triageDetail(row, q) {
      function nextAfter() {
        var i = q.indexOf(row);
        var n = q[i + 1] || q[i - 1];
        state.selected = n ? n.id : null;
      }
      function leave(fn, msg) {
        nextAfter();
        fn();
        setStatus(msg, 'ok');
        render();
      }
      function accept(cats, label) {
        var l = DT().listFor(state.lists, cats);
        if (!l) return setStatus('Aucune liste « ' + label + ' » : définissez les Statuts du tableau.', 'error');
        leave(function () {
          row.listId = l.id; row.statut = l.name; row.statutKey = l.category;
          write(DT().moveToCategory(t, row, state.lists, cats));
        }, '« ' + row.name + ' » → ' + l.name);
      }
      var impact = h('input', { type: 'range', min: '0', max: '10', step: '1', value: String(row.impact == null ? 5 : row.impact), 'aria-label': 'Impact' });
      var impactVal = h('span', { class: 'db-muted', text: impact.value });
      impact.addEventListener('input', function () { impactVal.textContent = impact.value; });
      impact.addEventListener('change', function () {
        row.impact = Number(impact.value);
        write(DT().savePriority(t, row.id, { impact: row.impact }));
      });
      var urgency = h('select', {
        class: 'db-select',
        'aria-label': 'Urgence',
        onchange: function (e) { row.urgency = e.target.selectedOptions[0].textContent; write(DT().savePriority(t, row.id, { empressement: e.target.value })); },
      }, URGENCIES.map(function (u) { return h('option', { value: u[0], selected: row.urgency === u[1], text: u[1] }); }));
      var est = h('select', {
        class: 'db-select',
        'aria-label': 'Estimation',
        onchange: function (e) { row.estimate = Number(e.target.value); write(DT().saveEstimate(t, row.id, row.estimate)); },
      }, ESTIMATES.map(function (m) { return h('option', { value: String(m), selected: (row.estimate || 0) === m, text: m ? DM().formatMinutes(m) : 'Non estimée' }); }));
      var date = h('input', {
        class: 'db-date',
        type: 'date',
        value: row.due || '',
        'aria-label': 'Jour prévu',
        onchange: function (e) {
          var iso = e.target.value;
          row.due = iso; row.start = iso;
          write(DT().planDay(t, row.id, iso));
          renderSide();
        },
      });
      return h('div', { class: 'db-detail' }, [
        h('div', { class: 'db-detail-head' }, [
          statusIcon(row),
          h('input', {
            class: 'db-name',
            type: 'text',
            value: row.name,
            'aria-label': 'Titre',
            onkeydown: function (e) { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
            onchange: function (e) {
              var v = e.target.value.trim();
              if (!v) { e.target.value = row.name; return; }
              row.name = v;
              write(global.TableTrello.saveName(t, row.id, v));
            },
          }),
          h('button', { class: 'db-icon-btn', type: 'button', title: 'Ouvrir la carte', onclick: function () { openCard(row); } }, [icon('external-link')]),
        ]),
        field('Impact', h('div', { class: 'db-range' }, [impact, impactVal])),
        field('Urgence', urgency),
        field('Estimation', est),
        field('Jour prévu', date),
        h('div', { class: 'db-actions db-actions--detail' }, [
          h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { accept(['unstarted', 'backlog'], 'À faire'); } }, [icon('check'), document.createTextNode('Accepter'), h('kbd', { text: 'A' })]),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { accept(['backlog', 'unstarted'], 'Backlog'); } }, [icon('circle-dashed'), document.createTextNode('Backlog'), h('kbd', { text: 'B' })]),
          h('button', { class: 'db-btn db-btn--danger', type: 'button', onclick: function () {
            leave(function () {
              state.rows = state.rows.filter(function (r) { return r.id !== row.id; });
              write(DT().cancel(t, row, state.lists));
            }, '« ' + row.name + ' » annulée');
          } }, [icon('circle-x'), document.createTextNode('Annuler'), h('kbd', { text: 'X' })]),
        ]),
      ]);
    }

    function field(label, control) {
      return h('label', { class: 'db-field' }, [h('span', { class: 'db-field-l', text: label }), control]);
    }

    /* ── 3. Orchestrator ───────────────────────────────────────────── */
    function plan(row, iso) {
      row.start = iso; row.due = iso;
      write(DT().planDay(t, row.id, iso));
      render();
    }

    function taskCard(row, showDue) {
      var el = h('div', { class: 'db-task', draggable: 'true', title: row.name }, [
        h('div', { class: 'db-task-name', text: row.name }),
        h('div', { class: 'db-task-meta' }, [prioBadge(row, true), estChip(row), showDue === true ? dueChip(row) : null]),
      ]);
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', row.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-drag');
      });
      el.addEventListener('dragend', function () { el.classList.remove('is-drag'); });
      el.addEventListener('dblclick', function () { openCard(row); });
      return el;
    }

    function dropZone(el, iso) {
      el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('is-over'); });
      el.addEventListener('dragleave', function () { el.classList.remove('is-over'); });
      el.addEventListener('drop', function (e) {
        e.preventDefault();
        el.classList.remove('is-over');
        var id = e.dataTransfer.getData('text/plain');
        var row = state.rows.filter(function (r) { return r.id === id; })[0];
        if (row && (row.start || row.due || '') !== iso) plan(row, iso);
      });
      return el;
    }

    function renderOrchestrator() {
      var week = DM().weekPlan(state.rows, today, HORIZON, state.capacity);
      var pool = DM().unplanned(state.rows);
      var autoBtn = h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () {
        var moves = DM().autoPlan(state.rows, today, HORIZON, state.capacity);
        if (!moves.length) return setStatus('Rien à planifier.', 'ok');
        moves.forEach(function (m) {
          var row = state.rows.filter(function (r) { return r.id === m.id; })[0];
          if (row) { row.start = m.date; row.due = m.date; }
        });
        render();
        write(moves.reduce(function (p, m) { return p.then(function () { return DT().planDay(t, m.id, m.date); }); }, Promise.resolve()), moves.length + (moves.length > 1 ? ' tâches planifiées' : ' tâche planifiée'));
      } }, [icon('wand'), document.createTextNode('Planifier auto')]);
      var poolEl = dropZone(h('div', { class: 'db-pool' }, pool.length ? pool.map(function (r) { return taskCard(r, true); }) : [h('div', { class: 'db-muted db-pad', text: 'Tout est planifié.' })]), '');
      var days = week.map(function (d) {
        var pct = Math.min(100, Math.round((d.used / d.capacity) * 100));
        return dropZone(h('section', { class: 'db-day' + (d.date === today ? ' is-today' : '') }, [
          h('header', { class: 'db-day-head' }, [
            h('span', { class: 'db-day-name' }, [icon(dayIconName(d.date, today), 'db-day-icon'), document.createTextNode(' ' + dayLabel(d.date, today))]),
            capChip(d.used),
          ]),
          h('div', { class: 'db-meter' + (d.over ? ' is-over' : '') }, [h('div', { class: 'db-meter-fill', style: 'width:' + pct + '%' })]),
          h('div', { class: 'db-day-body' }, d.tasks.map(taskCard)),
        ]), d.date);
      });
      els.main.appendChild(h('div', { class: 'db-page db-page--wide' }, [
        pageHead('Orchestrateur', 'Glissez les tâches sur un jour. Les retards sont reportés sur aujourd’hui.', autoBtn),
        h('div', { class: 'db-orch' }, [
          h('aside', { class: 'db-orch-pool' }, [h('div', { class: 'db-section-title', text: 'À planifier (' + pool.length + ')' }), poolEl]),
          h('div', { class: 'db-week' }, days),
        ]),
      ]));
    }

    /* ── 4. Today ──────────────────────────────────────────────────── */
    function renderToday() {
      var tasks = DM().todayList(state.rows, today);
      var used = DM().minutesOf(tasks);
      var blocks = DM().timeline(tasks);
      var byId = {};
      tasks.forEach(function (r) { byId[r.id] = r; });
      var focus = h('div', { class: 'db-list' }, tasks.length ? tasks.map(function (r) {
        var late = r.due && r.due < today;
        return h('div', { class: 'db-row' }, [
          h('button', {
            class: 'db-check',
            type: 'button',
            title: 'Terminer',
            'aria-label': 'Terminer « ' + r.name + ' »',
            onclick: function () {
              r.dueDone = true;
              write(DT().complete(t, r, state.lists, true), '« ' + r.name + ' » terminée');
              render();
            },
          }, [icon('circle-check')]),
          h('span', { class: 'db-row-name', text: r.name, onclick: function () { openCard(r); } }),
          late ? h('span', { class: 'db-chip is-late' }, [icon('alert-circle'), document.createTextNode('En retard')]) : null,
          prioBadge(r),
          estChip(r),
          dueChip(r),
          h('button', { class: 'db-icon-btn', type: 'button', title: 'Reporter à demain', onclick: function () { plan(r, DM().addDays(today, 1)); } }, [icon('arrow-curve-right')]),
        ]);
      }) : [h('div', { class: 'db-empty' }, [icon('sun'), h('p', { text: 'Rien de prévu aujourd’hui.' }),
        h('button', { class: 'db-btn', type: 'button', onclick: function () { go('orchestrator'); } }, [icon('calendar-event'), document.createTextNode('Ouvrir l’orchestrateur')])])]);

      var first = DM().DAY_START;
      var last = Math.max(first + 8 * 60, blocks.length ? blocks[blocks.length - 1].end : 0);
      var hourPx = 56;
      var grid = h('div', { class: 'db-tl', style: 'height:' + Math.ceil(((last - first) / 60) * hourPx) + 'px' });
      for (var m = first; m <= last; m += 60) {
        grid.appendChild(h('div', { class: 'db-tl-hour', style: 'top:' + ((m - first) / 60) * hourPx + 'px' }, [h('span', { text: DM().hhmm(m) })]));
      }
      blocks.forEach(function (b) {
        var r = byId[b.id];
        grid.appendChild(h('div', {
          class: 'db-tl-block',
          style: 'top:' + ((b.start - first) / 60) * hourPx + 'px;height:' + Math.max(20, ((b.end - b.start) / 60) * hourPx - 2) + 'px',
          title: DM().hhmm(b.start) + ' - ' + DM().hhmm(b.end),
        }, [h('b', { text: r.name }), h('span', { text: DM().hhmm(b.start) + ' - ' + DM().hhmm(b.end) })]));
      });
      var pct = Math.min(100, Math.round((used / state.capacity) * 100));
      var next = DM().nextAction(state.rows, today);
      var sugg = DM().suggestions(state.rows, today, 5);
      var nowCard = next ? h('section', { class: 'db-now' }, [
        h('div', { class: 'db-now-k' }, [icon('target-arrow'), document.createTextNode(next.from === 'today' ? ' Prochaine action' : ' Rien de prévu : je suggère')]),
        h('div', { class: 'db-now-name', text: next.row.name, onclick: function () { openCard(next.row); } }),
        h('div', { class: 'db-now-meta' }, [
          next.row.due && next.row.due < today && DM().isOpen(next.row) ? h('span', { class: 'db-chip is-late' }, [icon('alert-circle'), document.createTextNode('En retard')]) : null,
          prioBadge(next.row),
          estChip(next.row),
          dueChip(next.row),
        ]),
        h('div', { class: 'db-now-actions' }, [
          next.from === 'backlog' ? h('button', { class: 'db-btn db-btn--primary', type: 'button', onclick: function () { plan(next.row, today); } }, [icon('sun'), document.createTextNode('Faire aujourd’hui')]) : null,
          h('button', { class: 'db-btn', type: 'button', onclick: function () {
            next.row.dueDone = true;
            write(DT().complete(t, next.row, state.lists, true), '« ' + next.row.name + ' » terminée');
            render();
          } }, [icon('circle-check'), document.createTextNode('Terminer')]),
          h('button', { class: 'db-btn', type: 'button', onclick: function () { openCard(next.row); } }, [icon('external-link'), document.createTextNode('Ouvrir')]),
        ]),
      ]) : null;
      var suggBox = sugg.length ? h('section', { class: 'db-sugg' }, [
        h('h3', { class: 'db-sugg-h' }, [icon('bulb'), document.createTextNode(' À planifier · par priorité')]),
        h('div', { class: 'db-list' }, sugg.map(function (r) {
          return h('div', { class: 'db-row' }, [
            h('span', { class: 'db-row-name', text: r.name, onclick: function () { openCard(r); } }),
            prioBadge(r),
            estChip(r),
            h('button', { class: 'db-btn', type: 'button', title: 'Ajouter à aujourd’hui', onclick: function () { plan(r, today); } }, [icon('plus'), document.createTextNode('Aujourd’hui')]),
          ]);
        })),
      ]) : null;
      els.main.appendChild(h('div', { class: 'db-page db-page--wide' }, [
        pageHead('Aujourd’hui', DAYS_FR[new Date().getDay()] + ' ' + TM().formatDay(today),h('div', { class: 'db-load' }, [
          capChip(used),
          h('div', { class: 'db-meter' + (used > state.capacity ? ' is-over' : '') }, [h('div', { class: 'db-meter-fill', style: 'width:' + pct + '%' })]),
        ])),
        nowCard,
        h('div', { class: 'db-today' }, [h('div', { class: 'db-today-l' }, [focus]), h('div', { class: 'db-today-r' }, [grid])]),
        suggBox,
      ]));
    }

    /* ── Render + keys ─────────────────────────────────────────────── */
    function render() {
      today = todayIso();
      var keepScroll = els.main.scrollTop;
      els.main.textContent = '';
      renderSide();
      if (state.section === 'ingest') renderIngest();
      else if (state.section === 'triage') renderTriage();
      else if (state.section === 'orchestrator') renderOrchestrator();
      else renderToday();
      els.main.scrollTop = keepScroll;
    }

    shell.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var k = e.key.toLowerCase();
      var idx = '1234'.indexOf(k);
      if (idx >= 0 && k.length === 1) { e.preventDefault(); return go(SECTIONS[idx].key); }
      if (k === 'c') { e.preventDefault(); return go('ingest'); }
      if (state.section !== 'triage') return;
      var q = DM().triageQueue(state.rows);
      var i = q.map(function (r) { return r.id; }).indexOf(state.selected);
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (q[i + 1]) { state.selected = q[i + 1].id; render(); } }
      else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (q[i - 1]) { state.selected = q[i - 1].id; render(); } }
      else if (k === 'a' || k === 'b' || k === 'x') {
        e.preventDefault();
        var cls = k === 'a' ? '.db-btn--primary' : k === 'x' ? '.db-btn--danger' : '.db-actions--detail .db-btn:nth-child(2)';
        var btn = els.main.querySelector('.db-actions--detail ' + cls) || els.main.querySelector(cls);
        if (btn) btn.click();
      }
    });

    function reload(opts) {
      opts = opts || {};
      if (!opts.quiet) {
        root.innerHTML = skeleton();
      }
      return DT().load(t).then(function (res) {
        if (!root.contains(shell)) { root.innerHTML = ''; root.appendChild(shell); }
        state.lists = res.lists;
        state.rows = res.rows;
        // Opening the Dashboard with work due answers "what now?" straight away; otherwise stay on Capture.
        if (!state.landed) {
          state.landed = true;
          if (DM().todayList(state.rows, today).length) state.section = 'today';
        }
        render();
      }).catch(function (err) {
        root.innerHTML = '';
        root.appendChild(h('div', { class: 'db-loading', text: 'Impossible de charger le Dashboard : ' + (err && err.message) }));
      });
    }

    reload();
  }

  global.DashboardUI = { mount: mount, skeleton: skeleton };
})(typeof window !== 'undefined' ? window : this);
