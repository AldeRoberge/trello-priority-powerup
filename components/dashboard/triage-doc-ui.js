/*
 * Role: the Document pane of the Triage (right side of the split view). A page to write, paste or drop text and
 * images into, like a document. "Analyser" has the AI read all of it (images included) and propose a plan of
 * projects, tasks and subtasks, with day, urgency, duration, people, places and labels. The plan is reviewed in
 * place (keep or drop a task, fix a title, change a value, move a task to another project), then "Créer" writes it
 * to the triage list. Logic is in triage-doc-model.js, Trello writes in triage-doc-trello.js.
 *
 *   TriageDocUI.create(host) -> { el, focus(), hasFocus(), park(), unpark(), isDirty() }
 *   host: {
 *     t, today(),
 *     rows(), projects() -> [{ id, name }], goals(), lists(),
 *     onCreated(result, plan),      // after cards were written (also when some steps failed)
 *     onClose(),
 *     status(message, kind, keepMs),
 *   }
 * The pane keeps its draft while another card is open: the page asks for the same element again.
 * Colors come from trello-theme.css (--tp-*). Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var DM = function () { return global.TriageDocModel; };
  var TD = function () { return global.TriageDocTrello; };

  var DRAFT_KEY = 'trello-priority-powerup/triage-doc-draft';
  var MAX_IMAGES = 6;
  var MAX_FILE_BYTES = 10 * 1048576; // Trello's attachment limit
  var IMG_RE = /^image\/(png|jpe?g|gif|webp|bmp)$/;
  var URGENCY_COLORS = { bientot: '#9fadbc', 'assez-vite': '#e2b203', vite: '#f38a3f', 'au-plus-vite': '#e34935' };
  var ESTIMATES = [5, 15, 30, 60, 120, 240];

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

  function icon(name) {
    return h('i', { class: 'ti ti-' + name, 'aria-hidden': 'true' });
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function store(fn) {
    try { return fn(global.localStorage); } catch (e) { return null; }
  }

  /** '2026-10-08' -> '8 oct.' */
  function dayText(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    try { return d.toLocaleDateString('fr-CA', opts); } catch (e) { return iso; }
  }

  function minutesText(min) {
    var D = global.DashboardModel;
    return D && D.formatMinutes ? D.formatMinutes(min) : min + ' min';
  }

  function create(host) {
    var s = { phase: 'write', plan: null, notes: [], parts: [], error: '', progress: '' };
    var images = {}; // editor image id -> { id, file, url }
    var seq = 0;
    var parked = null;
    var saveTimer = null;

    var root = h('div', { class: 'tdoc' });
    var top = h('div', { class: 'tdoc-top' });
    var stage = h('div', { class: 'tdoc-stage' });
    var foot = h('div', { class: 'tdoc-foot' });
    root.appendChild(top);
    root.appendChild(stage);
    root.appendChild(foot);

    /* ── The page ────────────────────────────────────────────────── */
    var ed = h('div', {
      class: 'tdoc-ed is-empty',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Document',
      spellcheck: 'true',
      'data-ph': 'Écrire ou coller du texte et des images…',
    });
    var picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });

    function refreshEmpty() {
      ed.classList.toggle('is-empty', !ed.querySelector('[data-img]') && !/\S/.test(ed.textContent || ''));
    }

    function release(id) {
      var im = images[id];
      if (!im) return;
      try { URL.revokeObjectURL(im.url); } catch (e) { /* ignore */ }
      delete images[id];
    }

    function liveImages() {
      return Array.prototype.slice.call(ed.querySelectorAll('[data-img]')).length;
    }

    /** The caret of the page, or its end when the caret is elsewhere. */
    function caretRange() {
      var sel = global.getSelection && global.getSelection();
      if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
        var r = sel.getRangeAt(0).cloneRange();
        r.collapse(false);
        return r;
      }
      var end = document.createRange();
      end.selectNodeContents(ed);
      end.collapse(false);
      return end;
    }

    function insertImage(raw, at) {
      var dock = global.AssistantDock;
      var file = dock && dock.named ? dock.named(raw) : raw;
      if (!file || !IMG_RE.test(file.type)) return false;
      if (file.size > MAX_FILE_BYTES) { s.error = '« ' + file.name + ' » dépasse 10 Mo.'; paintFoot(); return false; }
      if (liveImages() >= MAX_IMAGES) { s.error = MAX_IMAGES + ' images au plus.'; paintFoot(); return false; }
      var id = 'i' + (++seq);
      var url = global.URL && URL.createObjectURL ? URL.createObjectURL(file) : '';
      images[id] = { id: id, file: file, url: url };
      var fig = h('figure', { class: 'tdoc-img', contenteditable: 'false', 'data-img': id }, [
        h('img', { src: url, alt: file.name || '', draggable: 'false' }),
        h('button', {
          class: 'tdoc-img-x',
          type: 'button',
          title: 'Retirer l’image',
          'aria-label': 'Retirer l’image',
          onclick: function () { fig.remove(); release(id); refreshEmpty(); scheduleSave(); },
        }, [icon('x')]),
      ]);
      var r = at || caretRange();
      r.insertNode(fig);
      var next = fig.nextSibling;
      if (!next || (next.nodeType === 1 && next.hasAttribute('data-img'))) {
        next = h('div', {}, [document.createElement('br')]);
        fig.parentNode.insertBefore(next, fig.nextSibling);
      }
      var sel = global.getSelection && global.getSelection();
      if (sel) {
        var c = document.createRange();
        if (next.nodeType === 1) c.selectNodeContents(next);
        else c.setStart(next, 0);
        c.collapse(true);
        sel.removeAllRanges();
        sel.addRange(c);
      }
      s.error = '';
      refreshEmpty();
      paintFoot();
      return true;
    }

    function insertText(text) {
      ed.focus();
      var done = false;
      try { done = document.execCommand('insertText', false, text); } catch (e) { done = false; }
      if (!done) {
        var r = caretRange();
        r.insertNode(document.createTextNode(text));
        r.collapse(false);
      }
    }

    function imageFilesOf(dt) {
      var out = [];
      if (!dt) return out;
      Array.prototype.forEach.call(dt.files || [], function (f) { if (IMG_RE.test(f.type)) out.push(f); });
      if (!out.length) {
        Array.prototype.forEach.call(dt.items || [], function (it) {
          var f = it.kind === 'file' && it.getAsFile ? it.getAsFile() : null;
          if (f && IMG_RE.test(f.type)) out.push(f);
        });
      }
      return out;
    }

    function pointRange(e) {
      if (document.caretRangeFromPoint) return document.caretRangeFromPoint(e.clientX, e.clientY);
      if (document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (p) {
          var r = document.createRange();
          r.setStart(p.offsetNode, p.offset);
          r.collapse(true);
          return r;
        }
      }
      return null;
    }

    ed.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var files = imageFilesOf(cd);
      var text = cd.getData('text/plain');
      if (!files.length && !text) return;
      e.preventDefault();
      if (text) insertText(text);
      files.forEach(function (f) { insertImage(f); });
      refreshEmpty();
      scheduleSave();
    });
    ed.addEventListener('dragover', function (e) {
      if (s.phase === 'write' && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
        e.preventDefault();
        ed.classList.add('is-drop');
      }
    });
    ed.addEventListener('dragleave', function () { ed.classList.remove('is-drop'); });
    ed.addEventListener('drop', function (e) {
      ed.classList.remove('is-drop');
      var files = imageFilesOf(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault();
      var at = pointRange(e);
      files.forEach(function (f) { insertImage(f, at && ed.contains(at.startContainer) ? at : null); });
      scheduleSave();
    });
    ed.addEventListener('input', function () { refreshEmpty(); scheduleSave(); paintFoot(); });
    ed.addEventListener('keydown', function (e) {
      // The page keys of the Dashboard (J, K, A, B…) and its Ctrl+Z (a triage decision) are not for the text.
      var mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') e.stopPropagation();
      if (mod && e.key === 'Enter') { e.preventDefault(); analyse(); return; }
      if (e.key === 'Escape') { ed.blur(); return; }
      if (e.key === 'Tab' && !e.shiftKey && !mod && !e.isComposing) {
        e.preventDefault();
        insertText('\t');
      }
    });
    picker.addEventListener('change', function () {
      Array.prototype.forEach.call(picker.files || [], function (f) { insertImage(f); });
      picker.value = '';
      scheduleSave();
      ed.focus();
    });

    /* ── Draft (kept in memory by the page, and as text when there is no image) ── */
    function plainDraft() {
      var parts = DM().partsFromNode(ed);
      if (parts.some(function (p) { return p.type === 'image'; })) return null;
      return parts.map(function (p) { return p.text; }).join('\n');
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        var text = plainDraft();
        store(function (ls) {
          if (text) ls.setItem(DRAFT_KEY, text);
          else ls.removeItem(DRAFT_KEY);
        });
      }, 500);
    }

    function setText(text) {
      ed.textContent = '';
      String(text || '').split('\n').forEach(function (line) {
        ed.appendChild(line ? h('div', { text: line }) : h('div', {}, [document.createElement('br')]));
      });
      refreshEmpty();
    }

    function clearPage() {
      Object.keys(images).forEach(release);
      ed.textContent = '';
      refreshEmpty();
      store(function (ls) { ls.removeItem(DRAFT_KEY); });
    }

    var saved = store(function (ls) { return ls.getItem(DRAFT_KEY); });
    if (saved) setText(saved);

    /* ── Reading the document ────────────────────────────────────── */
    function titlesInTriage() {
      return (host.rows() || []).filter(function (r) { return r.statutKey === 'triage'; }).map(function (r) { return r.name; });
    }

    function analyse() {
      if (s.phase !== 'write') return;
      var parts = DM().partsFromNode(ed);
      if (!DM().hasContent(parts)) return;
      s.parts = parts;
      s.error = '';
      s.phase = 'busy';
      paint();
      var ids = DM().imageIdsOf(parts);
      var used = ids.map(function (id) { return images[id]; }).filter(Boolean);
      var dock = global.AssistantDock;
      Promise.all(used.map(function (im) {
        return dock && dock.toDataUrl ? dock.toDataUrl(im.file) : Promise.resolve('');
      })).then(function (urls) {
        var map = {};
        used.forEach(function (im, i) { map[im.id] = urls[i]; });
        return TD().loadContext(host.t, { projects: host.projects() }).then(function (ctx) {
          return DM().parse(host.t, { parts: parts, images: map, context: ctx, today: host.today(), existingTitles: titlesInTriage() });
        });
      }).then(function (res) {
        if (!res.plan.tasks.length) {
          s.error = res.plan.summary || 'Aucune tâche trouvée dans ce document.';
          s.phase = 'write';
        } else {
          s.plan = res.plan;
          s.notes = res.notes.slice();
          var idle = DM().orphanImages(res.plan, parts).length;
          if (idle && res.via === 'ai') s.notes.push(idle === 1 ? '1 image n’est liée à aucune tâche.' : idle + ' images ne sont liées à aucune tâche.');
          s.phase = 'review';
        }
        paint();
      }, function (err) {
        s.error = (err && (err.message || err.reason)) || 'Lecture impossible.';
        s.phase = 'write';
        paint();
      });
    }

    /* ── Review: the plan ────────────────────────────────────────── */
    function box(state, label, onclick) {
      return h('button', {
        class: 'tdoc-box is-' + state,
        type: 'button',
        role: 'checkbox',
        'aria-checked': state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false',
        'aria-label': label,
        onclick: onclick,
      }, [icon(state === 'all' ? 'square-check' : state === 'some' ? 'square-minus' : 'square')]);
    }

    /** Text that becomes a one-line field when clicked; the value is kept when focus leaves. */
    function editable(cls, value, commit, title) {
      var span = h('span', { class: cls + ' tdoc-text', tabindex: '0', role: 'button', title: title || 'Modifier', text: value });
      function start() {
        var input = h('input', { class: 'tdoc-edit ' + cls, type: 'text', maxlength: '300', autocomplete: 'off', 'aria-label': 'Modifier' });
        input.value = span.textContent;
        span.replaceWith(input);
        input.focus();
        input.select();
        var done = false;
        function finish(keep) {
          if (done) return;
          done = true;
          var v = clean(input.value);
          if (keep && v && v !== span.textContent) { commit(v); span.textContent = v; }
          input.replaceWith(span);
        }
        input.addEventListener('blur', function () { finish(true); });
        input.addEventListener('keydown', function (e) {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); span.focus(); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); span.focus(); }
        });
      }
      span.addEventListener('click', start);
      span.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
      });
      return span;
    }

    function pick(anchor, placeholder, current, items, onPick, create) {
      if (!global.LinearPick) return;
      global.LinearPick.open({ anchor: anchor, placeholder: placeholder, current: current, items: items, digits: false, create: create, onPick: onPick });
    }

    function prop(cls, iconName, text, color, onclick, disabled) {
      var b = h('button', { class: 'tdoc-prop ' + cls + (text ? '' : ' is-empty') + (disabled ? ' is-inert' : ''), type: 'button', onclick: onclick }, [
        h('i', { class: 'ti ti-' + iconName, 'aria-hidden': 'true', style: color ? 'color:' + color : null }),
        text ? h('span', { class: 'tdoc-prop-t', text: text }) : null,
      ]);
      return b;
    }

    function dayProp(task) {
      var b = prop('tdoc-prop--day', 'calendar-event', dayText(task.due), '', function () {
        var inp = b.querySelector('input');
        if (inp && inp.showPicker) { try { inp.showPicker(); } catch (e) { inp.focus(); } } else if (inp) inp.focus();
      });
      b.title = 'Jour';
      var date = h('input', { type: 'date', 'aria-label': 'Jour', tabindex: '-1' });
      date.value = task.due || '';
      date.addEventListener('change', function () { task.due = DM().isoDay(date.value); paintReview(); });
      b.appendChild(date);
      return b;
    }

    function urgencyProp(task) {
      var D = global.DashboardModel;
      var cur = task.urgency || 'aucun';
      var u = D.URGENCIES.filter(function (x) { return x[0] === cur; })[0];
      var b = prop('tdoc-prop--urg', cur === 'aucun' ? 'flame-off' : 'flame', cur === 'aucun' ? '' : u[1], URGENCY_COLORS[cur], function () {
        pick(b, 'Définir l’urgence…', cur, D.URGENCIES.map(function (x) {
          return { id: x[0], label: x[1], icon: x[0] === 'aucun' ? 'flame-off' : 'flame', color: URGENCY_COLORS[x[0]] };
        }), function (it) { task.urgency = it.id === 'aucun' ? '' : it.id; paintReview(); });
      });
      b.title = 'Urgence';
      return b;
    }

    function estimateProp(task) {
      var sum = task.subtasks.reduce(function (n, x) { return n + (x.estimate || 0); }, 0);
      var withSubs = task.subtasks.length > 0; // the duration then lives on the subtasks
      var minutes = withSubs ? sum : task.estimate;
      var b = prop('tdoc-prop--est', 'clock', minutes ? minutesText(minutes) : '', '', function () {
        var list = ESTIMATES.slice();
        if (task.estimate && list.indexOf(task.estimate) < 0) { list.push(task.estimate); list.sort(function (a, c) { return a - c; }); }
        pick(b, 'Durée…', String(task.estimate || 0), [{ id: '0', label: 'Aucune durée', icon: 'circle-x' }].concat(list.map(function (m) {
          return { id: String(m), label: minutesText(m), icon: 'clock' };
        })), function (it) { task.estimate = Number(it.id) || 0; paintReview(); });
      }, withSubs);
      b.title = withSubs ? 'Durée des sous-tâches' : 'Durée';
      return b;
    }

    function uid(plan) {
      var max = 0;
      plan.projects.forEach(function (p) { max = Math.max(max, Number(String(p.id).slice(1)) || 0); });
      return 'p' + (max + 1);
    }

    function moveToProject(task, name, existingId) {
      var plan = s.plan;
      var key = DM().fold(name);
      var hit = plan.projects.filter(function (p) { return (existingId && p.existingId === existingId) || DM().fold(p.name) === key; })[0];
      if (!hit) {
        hit = { id: uid(plan), name: name, existingId: existingId || '', include: true };
        plan.projects.push(hit);
      }
      task.project = hit.id;
    }

    function projectProp(task) {
      var plan = s.plan;
      var cur = plan.projects.filter(function (p) { return p.id === task.project; })[0];
      var b = h('button', { class: 'tdoc-chip tdoc-chip--project' + (cur ? '' : ' is-empty'), type: 'button', title: 'Projet', onclick: function () {
        var items = [];
        if (cur) items.push({ id: '', label: 'Aucun projet', icon: 'circle-x' });
        var seen = Object.create(null);
        plan.projects.forEach(function (p) {
          seen[DM().fold(p.name)] = true;
          items.push({ id: 'plan:' + p.id, label: p.name, icon: 'stack-2' });
        });
        (host.projects() || []).forEach(function (p) {
          if (seen[DM().fold(p.name)]) return;
          items.push({ id: 'board:' + p.id, label: p.name, icon: 'stack-2' });
        });
        pick(b, 'Choisir un projet…', cur ? 'plan:' + cur.id : '', items, function (it) {
          if (!it.id) task.project = '';
          else if (it.id.indexOf('plan:') === 0) task.project = it.id.slice(5);
          else if (it.id.indexOf('board:') === 0) {
            var p = (host.projects() || []).filter(function (x) { return x.id === it.id.slice(6); })[0];
            if (p) moveToProject(task, p.name, p.id);
          } else if (it.id.indexOf('new:') === 0) moveToProject(task, it.id.slice(4), '');
          paintReview();
        }, function (q) { return q ? { id: 'new:' + q, label: 'Nouveau projet « ' + q + ' »', icon: 'plus' } : null; });
      } }, [icon('stack-2'), h('span', { text: cur ? cur.name : 'Projet' })]);
      return b;
    }

    function entityChip(kind, iconName, label, title, onRemove, extra) {
      var c = h('span', { class: 'tdoc-chip tdoc-chip--' + kind + (extra ? ' ' + extra : ''), title: title || label }, [icon(iconName), h('span', { class: 'tdoc-chip-t', text: label })]);
      c.appendChild(h('button', { class: 'tdoc-chip-x', type: 'button', 'aria-label': 'Retirer ' + label, onclick: onRemove }, [icon('x')]));
      return c;
    }

    function metaRow(task) {
      var kids = [projectProp(task)];
      task.people.forEach(function (p, i) {
        kids.push(entityChip('people', 'user', p.name, p.kind === 'new' ? p.name + ' (nouvelle personne, hors Trello)' : p.name, function () { task.people.splice(i, 1); paintReview(); }, p.kind === 'new' ? 'is-new' : ''));
      });
      task.places.forEach(function (p, i) {
        kids.push(entityChip('place', 'map-pin', p.name, p.id ? p.name : p.name + ' (nouveau lieu)', function () { task.places.splice(i, 1); paintReview(); }, p.id ? '' : 'is-new'));
      });
      task.labels.forEach(function (l, i) {
        var chip = entityChip('label', 'tag', l.name, l.name, function () { task.labels.splice(i, 1); paintReview(); });
        var color = global.CardEntities && global.CardEntities.COLORS && global.CardEntities.COLORS[l.color];
        if (color) chip.querySelector('.ti').style.color = color;
        kids.push(chip);
      });
      return h('div', { class: 'tdoc-meta' }, kids);
    }

    function subtasksOf(task) {
      if (!task.subtasks.length) return null;
      var list = h('div', { class: 'tdoc-subs' });
      task.subtasks.forEach(function (sub, si) {
        function row(cls, text, onCommit, onRemove, iconName) {
          return h('div', { class: 'tdoc-sub ' + cls }, [
            icon(iconName),
            editable('tdoc-sub-t', text, onCommit),
            h('button', { class: 'tdoc-sub-x', type: 'button', 'aria-label': 'Retirer', title: 'Retirer', onclick: onRemove }, [icon('x')]),
          ]);
        }
        list.appendChild(row('', sub.text, function (v) { sub.text = v; }, function () { task.subtasks.splice(si, 1); paintReview(); }, 'circle'));
        sub.items.forEach(function (it, ii) {
          list.appendChild(row('tdoc-sub--nested', it.text, function (v) { it.text = v; }, function () { sub.items.splice(ii, 1); paintReview(); }, 'point'));
        });
      });
      return list;
    }

    function taskRow(task) {
      var locked = !!task.createdId;
      var title = locked ? h('span', { class: 'tdoc-title tdoc-text', text: task.title }) : editable('tdoc-title', task.title, function (v) { task.title = v; });
      var kids = [title];
      if (task.duplicate) kids.push(h('span', { class: 'tdoc-tag', title: 'Déjà dans le triage : « ' + task.duplicate + ' »', text: 'Déjà là' }));
      if (locked) kids.push(h('span', { class: 'tdoc-tag tdoc-tag--ok', text: 'Créée' }));
      var main = h('div', { class: 'tdoc-main' }, [h('div', { class: 'tdoc-title-row' }, kids)]);
      if (!locked) main.appendChild(metaRow(task));
      var subs = subtasksOf(task);
      if (subs) main.appendChild(subs);
      return h('div', { class: 'tdoc-task' + (task.include ? '' : ' is-off') + (locked ? ' is-locked' : ''), 'data-task': task.id }, [
        locked ? h('span', { class: 'tdoc-box is-all' }, [icon('square-check')]) : box(task.include ? 'all' : 'none', 'Garder « ' + task.title + ' »', function () { task.include = !task.include; paintReview(); }),
        main,
        h('div', { class: 'tdoc-props' }, [dayProp(task), urgencyProp(task), estimateProp(task)]),
      ]);
    }

    function projectRow(g) {
      var p = g.project;
      var state = DM().projectState(s.plan, p.id);
      return h('div', { class: 'tdoc-proj' }, [
        box(state, 'Garder les tâches de « ' + p.name + ' »', function () { DM().setProject(s.plan, p.id, state !== 'all'); paintReview(); }),
        h('div', { class: 'tdoc-proj-main' }, [
          icon('stack-2'),
          editable('tdoc-proj-name', p.name, function (v) { p.name = v; p.existingId = ''; }),
          h('span', { class: 'tdoc-tag' + (p.existingId ? '' : ' tdoc-tag--new'), text: p.existingId ? 'Projet existant' : 'Nouveau projet' }),
        ]),
      ]);
    }

    function readsBlock() {
      var plan = s.plan;
      if (!plan.images.length) return null;
      var det = h('details', { class: 'tdoc-reads' }, [h('summary', {}, [icon('eye'), h('span', { text: 'Texte lu dans les images (' + plan.images.length + ')' })])]);
      plan.images.forEach(function (im) {
        var src = images[im.id];
        det.appendChild(h('div', { class: 'tdoc-read' }, [
          src ? h('img', { src: src.url, alt: '' }) : null,
          h('div', { class: 'tdoc-read-t', text: im.text }),
        ]));
      });
      return det;
    }

    function paintReview() {
      var scroller = root.parentNode;
      var keep = scroller ? scroller.scrollTop : 0;
      var plan = s.plan;
      stage.textContent = '';
      var wrap = h('div', { class: 'tdoc-plan' });
      s.notes.forEach(function (n) { wrap.appendChild(h('div', { class: 'tdoc-note' }, [icon('info-circle'), h('span', { text: n })])); });
      DM().groups(plan).forEach(function (g) {
        var block = h('section', { class: 'tdoc-group' + (g.project ? '' : ' tdoc-group--loose') });
        block.appendChild(g.project ? projectRow(g) : h('div', { class: 'tdoc-proj tdoc-proj--loose' }, [h('span'), h('div', { class: 'tdoc-proj-main' }, [h('span', { class: 'tdoc-loose', text: 'Sans projet' })])]));
        g.tasks.forEach(function (task) { block.appendChild(taskRow(task)); });
        wrap.appendChild(block);
      });
      var reads = readsBlock();
      if (reads) wrap.appendChild(reads);
      stage.appendChild(wrap);
      paintTop();
      paintFoot();
      if (scroller) scroller.scrollTop = keep;
    }

    /* ── Create ──────────────────────────────────────────────────── */
    function createAll() {
      if (s.phase !== 'review') return;
      var plan = s.plan;
      var count = DM().stats(plan);
      if (!count.tasks) return;
      s.phase = 'creating';
      s.error = '';
      s.progress = '0/' + count.tasks;
      root.classList.add('is-busy');
      paintFoot();
      var files = {};
      Object.keys(images).forEach(function (id) { files[id] = images[id].file; });
      TD().create(host.t, plan, {
        lists: host.lists(),
        goals: host.goals(),
        files: files,
        onProgress: function (done, total) { s.progress = done + '/' + total; paintFoot(); },
      }).then(function (result) {
        root.classList.remove('is-busy');
        var left = DM().stats(plan).tasks;
        if (!result.created.length) {
          s.phase = 'review';
          s.error = (result.failed[0] || 'Aucune carte créée.');
          paint();
          return;
        }
        if (left) {
          s.phase = 'review';
          s.error = left + (left === 1 ? ' tâche n’a pas été créée.' : ' tâches n’ont pas été créées.');
          paint();
        } else {
          s.phase = 'write';
          s.plan = null;
          clearPage();
          paint();
        }
        host.onCreated(result, plan, left === 0);
      }, function (err) {
        root.classList.remove('is-busy');
        s.phase = 'review';
        s.error = (err && (err.message || err.reason)) || 'Création impossible.';
        paint();
      });
    }

    function backToPage() {
      s.phase = 'write';
      s.error = '';
      paint();
      ed.focus();
    }

    /* ── Frame: top bar and foot ─────────────────────────────────── */
    function paintTop() {
      top.textContent = '';
      top.appendChild(h('span', { class: 'tdoc-crumb' }, [icon('notes'), h('span', { text: 'Document' })]));
      top.appendChild(h('span', { class: 'tdoc-spacer' }));
      if ((s.phase === 'review' || s.phase === 'creating') && s.plan) {
        var line = DM().summaryLine(DM().stats(s.plan));
        if (line) top.appendChild(h('span', { class: 'tdoc-count', text: line }));
      }
      top.appendChild(h('button', { class: 'tdoc-icon', type: 'button', title: 'Fermer', 'aria-label': 'Fermer', onclick: function () { host.onClose(); } }, [icon('x')]));
    }

    function paintFoot() {
      foot.textContent = '';
      var err = s.error ? h('span', { class: 'tdoc-err', role: 'alert' }, [icon('alert-triangle'), h('span', { text: s.error })]) : null;
      if (s.phase === 'write') {
        var has = DM().hasContent(DM().partsFromNode(ed));
        foot.appendChild(h('button', { class: 'tdoc-icon', type: 'button', title: 'Ajouter une image', 'aria-label': 'Ajouter une image', onclick: function () { picker.click(); } }, [icon('photo-plus')]));
        foot.appendChild(picker);
        foot.appendChild(h('span', { class: 'tdoc-spacer' }));
        if (err) foot.appendChild(err);
        foot.appendChild(h('button', {
          class: 'db-btn db-btn--primary tdoc-go' + (has ? '' : ' is-inert'),
          type: 'button',
          disabled: has ? null : true,
          onclick: analyse,
        }, [icon('sparkles'), document.createTextNode('Analyser'), h('kbd', { text: 'Ctrl ↵' })]));
      } else if (s.phase === 'busy') {
        foot.appendChild(h('span', { class: 'tdoc-wait' }, [icon('refresh'), h('span', { text: 'Lecture du document…' })]));
      } else {
        var count = DM().stats(s.plan);
        var creating = s.phase === 'creating';
        foot.appendChild(h('button', { class: 'db-btn', type: 'button', disabled: creating ? true : null, onclick: backToPage }, [icon('arrow-left'), document.createTextNode('Modifier')]));
        foot.appendChild(h('span', { class: 'tdoc-spacer' }));
        if (err) foot.appendChild(err);
        foot.appendChild(h('button', {
          class: 'db-btn db-btn--primary tdoc-go' + (count.tasks && !creating ? '' : ' is-inert'),
          type: 'button',
          disabled: count.tasks && !creating ? null : true,
          onclick: createAll,
        }, [icon(creating ? 'refresh' : 'check'), document.createTextNode(creating ? 'Création ' + s.progress + '…' : DM().createLabel(count))]));
      }
    }

    function paint() {
      ed.setAttribute('contenteditable', s.phase === 'write' ? 'true' : 'false');
      ed.classList.toggle('is-busy', s.phase === 'busy');
      if (s.phase === 'review' || s.phase === 'creating') {
        paintReview();
        return;
      }
      stage.textContent = '';
      stage.appendChild(ed);
      paintTop();
      paintFoot();
    }

    /* ── Survives a redraw of the page around it ─────────────────── */
    function pathOf(node) {
      var path = [];
      while (node && node !== ed) {
        var p = node.parentNode;
        if (!p) return null;
        path.unshift(Array.prototype.indexOf.call(p.childNodes, node));
        node = p;
      }
      return node === ed ? path : null;
    }

    function nodeAt(path) {
      var n = ed;
      for (var i = 0; i < path.length && n; i++) n = n.childNodes[path[i]];
      return n || null;
    }

    function park() {
      var sel = global.getSelection && global.getSelection();
      var inside = !!(sel && sel.rangeCount && ed.contains(sel.anchorNode) && document.activeElement === ed);
      parked = { focus: inside, path: inside ? pathOf(sel.anchorNode) : null, offset: inside ? sel.anchorOffset : 0 };
    }

    function unpark() {
      var p = parked;
      parked = null;
      if (!p || !p.focus || s.phase !== 'write' || !ed.isConnected) return;
      ed.focus({ preventScroll: true });
      var node = p.path ? nodeAt(p.path) : null;
      var sel = global.getSelection && global.getSelection();
      if (!node || !sel) return;
      try {
        var r = document.createRange();
        r.setStart(node, Math.min(p.offset, node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length));
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } catch (e) { /* the text changed: the caret stays where focus put it */ }
    }

    paint();
    return {
      el: root,
      park: park,
      unpark: unpark,
      focus: function () { if (s.phase === 'write') { try { ed.focus(); } catch (e) { /* not shown */ } } },
      hasFocus: function () { return document.activeElement === ed; },
      isDirty: function () { return DM().hasContent(DM().partsFromNode(ed)) || !!s.plan; },
    };
  }

  global.TriageDocUI = { create: create };
})(typeof window !== 'undefined' ? window : this);
