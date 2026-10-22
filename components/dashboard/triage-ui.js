/*
 * Role: the Triage pane of the Dashboard, the right side of the split view. One captured card, from "what is it?"
 * to the decision that takes it out of the inbox:
 *   title and note     read and fix what was captured
 *   Prochaine action   the first step of the card (what every view shows under its title)
 *   Impact, Urgence    one click each; the priority score follows
 *   Estimation, Jour   one click for the usual values, the shared editors for the rest
 *   Personnes, Lieux, Étiquettes, Projet   chips that open the shared pickers
 *   Décision           Accepter, Backlog, En attente, Un jour, Référence, Annuler, each with its key
 * The pane only draws and routes. Every write goes through `host` (the Dashboard), which queues the writes of a
 * card one after the other, so two quick clicks never overwrite each other.
 *
 *   TriageUI.detail(row, host) -> element
 *   TriageUI.subDetail(spec, host) -> element   one checklist subtask (title, durée, jour, avancement, bloquer)
 *     spec: { card, item, parent }   parent is the checklist item above it, or null
 *     host: { today, dayLabel(iso), showCard(), openCard(), rename(text), setEstimate(minutes),
 *             openEstimate(anchor), plan(iso), openDay(anchor, iso), setProgress(pct),
 *             toggleBlocked(), toggleChild(id, done), addChild(text) }
 *   host: {
 *     t, today,
 *     save(row, factory, opts),            // queued write: factory() -> promise; opts { ok, then(result) }
 *     perform(row, id, anchor),            // a decision (DashboardModel.TRIAGE_EXITS) or a card action
 *     openCard(row), cardMenu(row, anchor),
 *     openEditor(row, kind, anchor),       // CardFields: priority | due (the description is inline)
 *     openEntities(row, kind, anchor),     // CardEntities: people | places | labels
 *     pickProject(row, anchor), estimateMenu(row, anchor), plan(row, iso),
 *     projectOf(row) -> { text, title } | null,
 *     dayLabel(iso), dayText(row), dayIcon(row),
 *     hintOf(exitId) -> tooltip, refreshRow(row),   // refreshRow redraws the row of the list on the left
 *   }
 * Colors come from trello-theme.css (--tp-*). Icons: Tabler webfont.
 */
(function (global) {
  'use strict';

  var DM = function () { return global.DashboardModel; };
  var DT = function () { return global.DashboardTrello; };
  var WO = function () { return global.WorkOS; };
  var CE = function () { return global.CardEntities; };

  var TONE = { aucun: 0, bientot: 1, 'assez-vite': 2, vite: 3, 'au-plus-vite': 4 };
  var DAY_LABEL = { today: 'Aujourd’hui', tomorrow: 'Demain', monday: 'Lundi' };
  var IMPACTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var DEFAULT_IMPACT = 5; // what the priority formula assumes while nothing was chosen

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

  function text(s) {
    return document.createTextNode(s);
  }

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  var IMG_TYPE = /^image\/(jpeg|png|webp|gif)$/;
  var MAX_IMAGE_BYTES = 10 * 1048576;
  var NOTE_NAME = /^note-\d+\.(jpg|png|webp|gif)$/;

  /**
   * Description pictures from a card's attachments. Covers (`couverture-…`) and other files are ignored.
   * Ordered by the timestamp in the file name. Nothing here is stored in pluginData.
   */
  function noteShots(cardId, atts) {
    var id = String(cardId || '');
    return (atts || []).filter(function (a) {
      return a && (a.id || a.a) && NOTE_NAME.test(String(a.name || a.n || ''));
    }).slice().sort(function (a, b) {
      var an = String(a.name || a.n || '');
      var bn = String(b.name || b.n || '');
      return an < bn ? -1 : an > bn ? 1 : 0;
    }).map(function (a) {
      return { src: 'upload:' + id + '/' + (a.id || a.a) + '/' + (a.name || a.n), alt: a.alt || '' };
    });
  }

  /** Image files on a clipboard or a drop. Items are read only while the event is still running. */
  function imageFilesOf(dt) {
    var out = [];
    if (!dt) return out;
    var files = dt.files;
    var i;
    if (files && files.length) {
      for (i = 0; i < files.length; i++) if (files[i] && IMG_TYPE.test(files[i].type)) out.push(files[i]);
      if (out.length) return out;
    }
    var items = dt.items;
    if (!items) return out;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.kind !== 'file' || !IMG_TYPE.test(it.type) || typeof it.getAsFile !== 'function') continue;
      var f = it.getAsFile();
      if (f) out.push(f);
    }
    return out;
  }

  /** A file name worth keeping as the picture’s label. A bare “image” from the clipboard is left blank. */
  function imageAlt(file) {
    var name = String((file && file.name) || '').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
    if (!name || /^image$/i.test(name) || /^clipboard/i.test(name)) return '';
    return name.slice(0, 200);
  }

  /** Description split into text and picture lines (`DocsModel.parseImageLine`). */
  function descBlocks(text) {
    var parse = global.DocsModel && global.DocsModel.parseImageLine;
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var blocks = [];
    var buf = [];
    function flush() {
      var t = buf.join('\n').trim();
      buf = [];
      if (t) blocks.push({ type: 'text', text: t });
    }
    lines.forEach(function (line) {
      var img = parse ? parse(line) : null;
      if (!img) { buf.push(line); return; }
      flush();
      blocks.push({ type: 'image', alt: img.alt, src: img.src });
    });
    flush();
    return blocks;
  }

  /** Adds one markdown line, on its own line. */
  function appendLine(desc, line) {
    line = String(line || '').trim();
    if (!line) return String(desc || '');
    var base = String(desc || '').replace(/\s+$/g, '');
    return base ? base + '\n' + line : line;
  }

  /** Adds a picture line when `src` is a safe image address or an `upload:` pointer. */
  function appendImage(desc, alt, src) {
    var DM = global.DocsModel;
    if (!DM || typeof DM.imageSrc !== 'function' || typeof DM.imageMd !== 'function') return String(desc || '');
    var safe = DM.imageSrc(src);
    if (!safe) return String(desc || '');
    return appendLine(desc, DM.imageMd(alt, safe));
  }

  function fillNote(note, desc, resolve) {
    note.textContent = '';
    var blocks = descBlocks(desc);
    note.classList.toggle('is-empty', !blocks.length);
    if (!blocks.length) {
      note.appendChild(icon('plus'));
      note.appendChild(h('span', { text: 'Cliquer pour ajouter…' }));
      return;
    }
    blocks.forEach(function (b) {
      if (b.type === 'text') {
        var shown = h('div', { class: 'tri-desc-body agent-md' });
        if (global.MarkdownDom) global.MarkdownDom.append(shown, b.text);
        else shown.textContent = b.text;
        note.appendChild(shown);
        return;
      }
      var fig = h('figure', { class: 'tri-desc-img', 'data-src': b.src });
      var img = h('img', { alt: b.alt || '', draggable: 'false' });
      fig.appendChild(img);
      note.appendChild(fig);
      if (b.src.indexOf('upload:') !== 0) { img.src = b.src; return; }
      if (typeof resolve !== 'function') return;
      fig.classList.add('is-loading');
      Promise.resolve(resolve(b.src)).then(function (url) {
        if (!img.isConnected) return;
        fig.classList.remove('is-loading');
        if (url) img.src = url;
        else fig.classList.add('is-broken');
      }, function () {
        if (!fig.isConnected) return;
        fig.classList.remove('is-loading');
        fig.classList.add('is-broken');
      });
    });
  }

  function paintShot(note, shot, resolve) {
    var fig = h('figure', { class: 'tri-desc-img', 'data-shot': '1', 'data-src': shot.src });
    var img = h('img', { alt: shot.alt || '', draggable: 'false' });
    fig.appendChild(img);
    note.appendChild(fig);
    if (!shot.src || shot.src.indexOf('upload:') !== 0) { if (shot.src) img.src = shot.src; return; }
    if (typeof resolve !== 'function') return;
    fig.classList.add('is-loading');
    Promise.resolve(resolve(shot.src)).then(function (url) {
      if (!img.isConnected) return;
      fig.classList.remove('is-loading');
      if (url) img.src = url;
      else fig.classList.add('is-broken');
    }, function () {
      if (!fig.isConnected) return;
      fig.classList.remove('is-loading');
      fig.classList.add('is-broken');
    });
  }

  /** Attachment pictures under the text. The placeholder goes away once a picture is there. */
  function applyShots(note, shots, resolve) {
    note.querySelectorAll('[data-shot]').forEach(function (n) { n.remove(); });
    if (!shots || !shots.length) return;
    var rich = note.querySelector('.tri-desc-rich');
    if (rich) rich.classList.remove('is-blank');
    shots.forEach(function (s) { paintShot(note, s, resolve); });
  }

  function showPending(note, files) {
    var rich = note.querySelector('.tri-desc-rich');
    if (rich) rich.classList.remove('is-blank');
    files.forEach(function (file) {
      var url = global.URL && URL.createObjectURL ? URL.createObjectURL(file) : '';
      var img = h('img', { alt: imageAlt(file), draggable: 'false' });
      if (url) img.src = url;
      note.appendChild(h('figure', { class: 'tri-desc-img', 'data-pending': '1' }, [img]));
    });
  }

  function noteBlank(el) {
    var t = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
    return !t && !el.querySelector('img, ul, ol, table, pre, hr, blockquote');
  }

  /** Fills the rich surface from Markdown. Pictures stored as `upload:` get their address from `resolve`. */
  function paintRich(rich, desc, resolve) {
    var DM = global.DocsModel;
    if (!DM || typeof DM.mdToHtml !== 'function') {
      fillNote(rich, desc, resolve);
      rich.classList.toggle('is-blank', !descBlocks(desc).length);
      return;
    }
    rich.innerHTML = DM.mdToHtml(desc || '');
    if (typeof resolve === 'function') {
      rich.querySelectorAll('figure[data-src]').forEach(function (fig) {
        var src = fig.getAttribute('data-src') || '';
        if (src.indexOf('upload:') !== 0) return;
        var img = fig.querySelector('img');
        if (!img) return;
        fig.classList.add('is-loading');
        Promise.resolve(resolve(src)).then(function (url) {
          if (!img.isConnected) return;
          fig.classList.remove('is-loading');
          if (url) img.src = url;
          else fig.classList.add('is-broken');
        }, function () {
          if (!fig.isConnected) return;
          fig.classList.remove('is-loading');
          fig.classList.add('is-broken');
        });
      });
    }
    rich.classList.toggle('is-blank', noteBlank(rich));
  }

  function noteMarkdown(el) {
    var DM = global.DocsModel;
    if (!DM || typeof DM.domToMd !== 'function') return (el.textContent || '').replace(/\u00a0/g, ' ').trim();
    return DM.domToMd(el);
  }

  /**
   * The description, always in the pane: a rich text section. Typing edits it; leaving it saves.
   * A pasted or dropped image is handed to `opts.onImages` and shown at once.
   * opts: { desc, fk, resolve(src), shots, loadImages(cb), onSave(text), onImages(files) -> Promise, onImageError(msg) }
   */
  function noteField(opts) {
    var saved = String(opts.desc || '');
    var rich = h('div', {
      class: 'tri-desc-rich',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Description',
      spellcheck: 'true',
      'data-fk': opts.fk,
    });
    paintRich(rich, saved, opts.resolve);
    var note = h('div', { class: 'tri-desc' }, [rich]);
    var shown = opts.shots || [];
    if (shown.length) applyShots(note, shown, opts.resolve);
    if (typeof opts.loadImages === 'function') {
      opts.loadImages(function (images) {
        shown = images || [];
        if (!note.isConnected) return;
        applyShots(note, shown, opts.resolve);
      });
    }
    function mark() { rich.classList.toggle('is-blank', noteBlank(rich)); }
    function canon(md) {
      var probe = h('div');
      paintRich(probe, md, null);
      return noteMarkdown(probe);
    }
    function flush() {
      var next = noteMarkdown(rich);
      if (next === canon(saved)) return;
      saved = next;
      if (opts.onSave) opts.onSave(next);
    }
    rich.addEventListener('input', mark);
    rich.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key !== 'Escape') return;
      e.preventDefault();
      paintRich(rich, saved, opts.resolve);
      rich.blur();
    });
    rich.addEventListener('blur', flush);
    note.addEventListener('mousedown', function (e) {
      if (e.target !== note) return;
      e.preventDefault();
      rich.focus();
    });
    if (typeof opts.onImages === 'function') {
      function take(files) {
        if (!files.length) return;
        var heavy = files.some(function (f) { return f && f.size > MAX_IMAGE_BYTES; });
        if (heavy) {
          if (opts.onImageError) opts.onImageError('Image trop lourde (10 Mo).');
          return;
        }
        flush();
        showPending(note, files);
        var job;
        try { job = opts.onImages(files); } catch (err) {
          note.querySelectorAll('[data-pending]').forEach(function (n) { n.remove(); });
          mark();
          return;
        }
        Promise.resolve(job).then(function () {}, function () {
          note.querySelectorAll('[data-pending]').forEach(function (n) { n.remove(); });
          mark();
        });
      }
      note.addEventListener('paste', function (e) {
        var files = imageFilesOf(e.clipboardData);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        take(files);
      });
      note.addEventListener('dragover', function (e) {
        if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
        e.preventDefault();
        note.classList.add('is-drop');
      });
      note.addEventListener('dragleave', function (e) {
        if (e.relatedTarget && note.contains(e.relatedTarget)) return;
        note.classList.remove('is-drop');
      });
      note.addEventListener('drop', function (e) {
        note.classList.remove('is-drop');
        var files = imageFilesOf(e.dataTransfer);
        if (!files.length) return;
        e.preventDefault();
        e.stopPropagation();
        take(files);
      });
    }
    return note;
  }

  function iconButton(name, title, onclick) {
    return h('button', { class: 'tri-icon', type: 'button', title: title, 'aria-label': title, onclick: onclick }, [icon(name)]);
  }

  /** Changes the words (and the icon) of one button of a segmented group. */
  function setOption(button, label, iconName) {
    var t = button.querySelector('.tri-opt-t');
    if (t) t.textContent = label;
    var i = button.querySelector('.ti');
    if (i && iconName) i.className = 'ti ti-' + iconName;
  }

  /**
   * A row of one-choice buttons (a radio group; the arrows move between them, Enter or Space picks).
   * spec: { label, key, options: [{ id, label, title?, icon?, tone? }], value, fill?, cls?, onPick(option) }
   * -> { el, buttons, set(value) }. `fill` also tints every option up to the value (a scale).
   */
  /** Priority tier (same bands as the P badge: 8.6 / 7.2 / 5.8 / 4.3) an impact value falls in; 4 = below. */
  function impactTier(n) {
    return n >= 8.6 ? 0 : n >= 7.2 ? 1 : n >= 5.8 ? 2 : n >= 4.3 ? 3 : 4;
  }

  function segmented(spec) {
    var el = h('div', { class: 'tri-seg' + (spec.cls ? ' ' + spec.cls : ''), role: 'radiogroup', 'aria-label': spec.label });
    var buttons = spec.options.map(function (o, i) {
      var b = h('button', {
        class: 'tri-opt' + (o.tone != null ? ' tri-opt--u' + o.tone : ''),
        type: 'button',
        role: 'radio',
        'aria-checked': 'false',
        tabindex: '-1',
        title: o.title || null,
        'data-fk': spec.key + ':' + o.id,
      }, [o.icon ? icon(o.icon) : null, h('span', { class: 'tri-opt-t', text: o.label })]);
      if (spec.fill === true) b.setAttribute('data-tier', String(impactTier(Number(o.id))));
      b.addEventListener('click', function () { spec.onPick(o); });
      b.addEventListener('focus', function () {
        buttons.forEach(function (x) { x.tabIndex = x === b ? 0 : -1; });
      });
      b.addEventListener('keydown', function (e) {
        var to = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = i + 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = i - 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = buttons.length - 1;
        if (to < 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (buttons[to]) buttons[to].focus();
      });
      el.appendChild(b);
      return b;
    });
    function set(value) {
      var has = value != null && value !== '';
      var on = null;
      buttons.forEach(function (b, i) {
        var o = spec.options[i];
        var checked = has && String(o.id) === String(value);
        b.setAttribute('aria-checked', checked ? 'true' : 'false');
        if (spec.fill === true) b.classList.toggle('is-fill', has && Number(o.id) <= Number(value));
        if (checked) on = b;
        b.tabIndex = -1;
      });
      (on || buttons[0]).tabIndex = 0;
    }
    set(spec.value);
    return { el: el, buttons: buttons, set: set };
  }

  function detail(row, host) {
    var t = host.t;
    var D = DM();
    var root = h('div', { class: 'tri', 'data-card': row.id });
    var body = h('div', { class: 'tri-body' });
    root.appendChild(body);

    /* ── Where it comes from ─────────────────────────────────────── */
    var born = D.createdAtOf(row.id);
    var ago = born ? D.ageLabel(born, Date.now()) : '';
    body.appendChild(h('div', { class: 'tri-top' }, [
      h('span', { class: 'tri-origin' }, [icon('inbox'), text((row.statut || 'Inbox') + (ago ? ' · ' + ago : ''))]),
      h('span', { class: 'tri-spacer' }),
      iconButton('external-link', 'Ouvrir la carte', function () { host.openCard(row); }),
      iconButton('dots', 'Plus d’actions', function (e) { host.cardMenu(row, e.currentTarget); }),
    ]));

    /* ── Title ───────────────────────────────────────────────────── */
    var title = h('textarea', { class: 'tri-title', rows: '1', maxlength: '300', spellcheck: 'true', 'aria-label': 'Titre', 'data-fk': 'title' });
    title.value = row.name || '';
    function fitTitle() {
      title.style.height = 'auto';
      title.style.height = title.scrollHeight + 'px';
    }
    title.addEventListener('input', fitTitle);
    title.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); title.blur(); }
      else if (e.key === 'Escape') { title.value = row.name || ''; fitTitle(); title.blur(); }
    });
    title.addEventListener('blur', function () {
      var v = clean(title.value);
      if (!v) { title.value = row.name || ''; fitTitle(); return; }
      title.value = v;
      if (v === row.name) return;
      row.name = v;
      host.save(row, function () { return global.TableTrello.saveName(t, row.id, v); });
      host.refreshRow(row);
    });
    body.appendChild(title);
    setTimeout(fitTitle, 0); // the height can only be measured once the pane is in the page

    /* ── Note (the description of the card) ──────────────────────── */
    var cardShots = host.shots ? host.shots(row) : [];
    var note = noteField({
      desc: row.desc,
      fk: 'desc',
      resolve: host.resolveImage,
      shots: cardShots,
      loadImages: host.loadImages ? function (cb) { host.loadImages(row, cb); } : null,
      onSave: function (text) {
        var prev = row.desc;
        row.desc = text;
        if (!host.save || !global.TableTrello || typeof global.TableTrello.saveDesc !== 'function') return;
        host.save(row, function () {
          return global.TableTrello.saveDesc(t, row, text).then(function (full) {
            row.fullDesc = full;
          }, function (err) { row.desc = prev; throw err; });
        }, { ok: 'Enregistré' });
      },
      onImages: host.pasteImages ? function (files) { return host.pasteImages(row, files); } : null,
      onImageError: host.imageError,
    });
    body.appendChild(note);

    /* ── Prochaine action ────────────────────────────────────────── */
    function stepOf() {
      return WO() && WO().stepText ? WO().stepText(row) : '';
    }
    var step = h('input', {
      class: 'tri-input',
      type: 'text',
      placeholder: 'Prochaine action',
      'aria-label': 'Prochaine action',
      'data-fk': 'step',
      maxlength: '300',
      autocomplete: 'off',
    });
    step.value = stepOf();
    step.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); step.blur(); }
      else if (e.key === 'Escape') { step.value = stepOf(); step.blur(); }
    });
    step.addEventListener('blur', function () {
      var v = clean(step.value);
      if (!v || v === stepOf()) { step.value = stepOf(); return; }
      row.items = D.withNextStep(row.items, v);
      step.value = v;
      host.save(row, function () { return DT().saveNextStep(t, row.id, v); });
      host.refreshRow(row);
    });
    body.appendChild(h('label', { class: 'tri-next' }, [icon('target-arrow'), step]));

    /* ── Properties: one row each, the same columns ─────────────── */
    var props = h('div', { class: 'tri-props' });
    function prop(label, parts, cls) {
      return h('div', { class: 'tri-prop' + (cls ? ' ' + cls : '') }, [
        h('span', { class: 'tri-k', text: label }),
        h('div', { class: 'tri-v' }, parts),
      ]);
    }

    // Priority is a result: Impact and Urgence feed it, the shared editor refines it.
    var prio = h('span', { class: 'tri-prio' });
    function paintPrio() {
      prio.textContent = '';
      if (typeof row.priority === 'number') {
        prio.appendChild(h('span', { class: 'db-prio db-prio--' + (row.tierI == null ? 'n' : Math.min(row.tierI, 4)), text: 'P' + String(row.priority) }));
        if (row.tier) prio.appendChild(h('span', { class: 'tri-tier', text: row.tier }));
      } else {
        prio.appendChild(h('span', { class: 'tri-quiet', text: 'Pas encore calculée' }));
      }
    }
    function showDisplay(d) {
      if (!d) return;
      row.priority = d.priority;
      row.tier = d.tier;
      row.tierI = d.tierI;
      paintPrio();
      host.refreshRow(row);
    }
    paintPrio();
    var refine = h('button', {
      class: 'tri-link',
      type: 'button',
      title: 'Affiner la priorité',
      'data-fk': 'refine',
      onclick: function () { host.openEditor(row, 'priority', refine); },
    }, [icon('adjustments'), text('Affiner')]);

    var impact = segmented({
      label: 'Impact',
      key: 'impact',
      fill: true,
      cls: 'tri-scale' + (row.impact == null ? ' is-default' : ''),
      options: IMPACTS.map(function (n) { return { id: n, label: String(n), title: n + ' sur 10' }; }),
      value: row.impact == null ? DEFAULT_IMPACT : row.impact,
      onPick: function (o) {
        row.impact = o.id;
        impact.el.classList.remove('is-default');
        impact.set(o.id);
        host.save(row, function () { return DT().savePriority(t, row.id, { impact: o.id }); }, { then: showDisplay });
      },
    });

    var urgency = segmented({
      label: 'Urgence',
      key: 'urg',
      options: D.URGENCIES.map(function (u) {
        return { id: u[0], label: u[1], icon: u[0] === 'aucun' ? 'flame-off' : 'flame', tone: TONE[u[0]] };
      }),
      value: D.urgencyIdOf(row.urgency),
      onPick: function (o) {
        row.urgency = o.label;
        urgency.set(o.id);
        host.save(row, function () { return DT().savePriority(t, row.id, { empressement: o.id }); }, { then: showDisplay });
      },
    });

    // Estimation: the usual durations in one click, the whole menu behind the last button.
    function estValue() {
      var m = row.estimate || 0;
      return !m ? '' : D.ESTIMATE_CHIPS.indexOf(m) >= 0 ? m : 'other';
    }
    var estOptions = D.ESTIMATE_CHIPS.map(function (m) { return { id: m, label: D.formatMinutes(m) }; });
    estOptions.push({ id: 'other', label: 'Autre…', icon: 'chevron-down' });
    var est = segmented({
      label: 'Estimation',
      key: 'est',
      options: estOptions,
      value: estValue(),
      onPick: function (o) {
        if (o.id === 'other') return host.estimateMenu(row, est.buttons[est.buttons.length - 1]);
        row.estimate = o.id === estValue() ? 0 : o.id; // the chosen button again clears it
        paintEst();
        host.save(row, function () { return DT().saveEstimate(t, row.id, row.estimate); });
      },
    });
    function paintEst() {
      est.set(estValue());
      setOption(est.buttons[est.buttons.length - 1], estValue() === 'other' ? D.formatMinutes(row.estimate) : 'Autre…');
    }
    paintEst();

    // Jour prévu: today, tomorrow, Monday; any other day or a horizon through the shared date editor.
    var quick = D.quickDays(host.today);
    var dayOptions = quick.map(function (d) {
      return { id: d.id, label: DAY_LABEL[d.id], title: d.id === 'monday' ? host.dayLabel(d.iso) : null, iso: d.iso };
    });
    dayOptions.push({ id: 'other', label: 'Autre…', icon: 'chevron-down' });
    var day = segmented({
      label: 'Jour prévu',
      key: 'day',
      options: dayOptions,
      value: D.quickDayOf(row, host.today),
      onPick: function (o) {
        if (o.id === 'other') return host.openEditor(row, 'due', day.buttons[day.buttons.length - 1]);
        host.plan(row, o.id === D.quickDayOf(row, host.today) ? '' : o.iso); // the chosen button again clears it
        paintDay();
      },
    });
    function paintDay() {
      var which = D.quickDayOf(row, host.today);
      day.set(which);
      setOption(day.buttons[day.buttons.length - 1], which === 'other' ? host.dayText(row) : 'Autre…', which === 'other' ? host.dayIcon(row) : 'chevron-down');
    }
    paintDay();

    props.appendChild(prop('Impact', [impact.el]));
    props.appendChild(prop('Urgence', [urgency.el]));
    props.appendChild(prop('Priorité', [prio, h('span', { class: 'tri-spacer' }), refine], 'tri-prop--result'));
    props.appendChild(prop('Estimation', [est.el]));
    props.appendChild(prop('Jour prévu', [day.el]));

    // Avancement: the usual steps in one click (the chosen step again clears it); a value in between shows as is.
    var STEPS = [0, 25, 50, 75, 100];
    function progValue() {
      return typeof row.progress === 'number' && STEPS.indexOf(Math.round(row.progress)) >= 0 ? Math.round(row.progress) : '';
    }
    var progNum = h('span', { class: 'tri-quiet' });
    var prog = segmented({
      label: 'Avancement',
      key: 'prog',
      fill: 'plain',
      cls: 'tri-scale tri-scale--plain',
      options: STEPS.map(function (n) { return { id: n, label: n + ' %', title: n + ' %' }; }),
      value: progValue(),
      onPick: function (o) {
        var cur = typeof row.progress === 'number' ? Math.round(row.progress) : 0;
        host.setProgress(row, o.id === cur && o.id > 0 ? 0 : o.id);
        paintProg();
      },
    });
    function paintProg() {
      var p = typeof row.progress === 'number' ? Math.round(row.progress) : 0;
      prog.set(progValue());
      prog.buttons.forEach(function (b, i) { b.classList.toggle('is-fill', p >= STEPS[i] && p > 0); });
      prog.el.classList.toggle('is-done', p >= 100);
      progNum.textContent = progValue() === '' && p > 0 ? p + ' %' : '';
    }
    paintProg();
    // Bloquer: right of the Avancement steps; quiet until the task is blocked.
    var blockBtn = h('button', { class: 'tri-blocked', type: 'button', 'data-fk': 'blocked' }, [icon('player-pause'), h('span', { class: 'tri-blocked-t' })]);
    function paintBlocked() {
      blockBtn.classList.toggle('is-on', !!row.blocked);
      blockBtn.title = row.blocked ? 'Bloquée · cliquer pour débloquer' : 'Marquer comme bloquée';
      blockBtn.setAttribute('aria-pressed', row.blocked ? 'true' : 'false');
      blockBtn.querySelector('.tri-blocked-t').textContent = row.blocked ? 'Bloquée' : 'Bloquer';
    }
    blockBtn.addEventListener('click', function () {
      host.perform(row, 'blocked');
      paintBlocked();
    });
    paintBlocked();
    props.appendChild(prop('Avancement', [prog.el, progNum, blockBtn]));

    // Sous-tâches: each one ticks in place, a field adds the next.
    var subs = h('div', { class: 'tri-subs' });
    function paintSubs() {
      subs.textContent = '';
      (row.items || []).forEach(function (it) {
        if (!it || typeof it.text !== 'string') return;
        var done = it.done === true || Number(it.progress) >= 100;
        var b = h('button', {
          class: 'tri-sub' + (done ? ' is-done' : '') + (it.blocked && !done ? ' is-blocked' : ''),
          type: 'button',
          role: 'checkbox',
          'aria-checked': done ? 'true' : 'false',
          title: done ? 'Rouvrir' : 'Terminer',
          disabled: it.linkedCardId ? 'disabled' : null,
          onclick: function () {
            host.toggleSub(row, it.id, !done);
            paintSubs();
            paintProg();
          },
        }, [icon(done ? 'circle-check' : 'circle'), h('span', { class: 'tri-sub-t', text: it.text })]);
        subs.appendChild(b);
      });
      var add = h('input', { class: 'tri-sub-add', type: 'text', placeholder: 'Nouvelle sous-tâche', 'aria-label': 'Nouvelle sous-tâche', maxlength: '200' });
      add.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var v = add.value.replace(/\s+/g, ' ').trim();
        if (!v) return;
        add.value = '';
        host.addSub(row.id, '', v);
        paintSubs();
        paintProg();
        var next = subs.querySelector('.tri-sub-add');
        if (next) next.focus();
      });
      subs.appendChild(add);
    }
    paintSubs();
    props.appendChild(prop('Sous-tâches', [subs], 'tri-prop--subs'));
    body.appendChild(props);

    /* ── Where it belongs ────────────────────────────────────────── */
    var found = CE() ? CE().describe(row) : { people: [], places: [], labels: [] };
    function entity(kind, iconName, label, values, open) {
      var b = h('button', {
        class: 'tri-ent' + (values.length ? '' : ' is-empty'),
        type: 'button',
        title: label,
        'data-fk': 'ent:' + kind,
        onclick: function () { open(b); },
      }, [icon(iconName)]);
      if (!values.length) b.appendChild(h('span', { class: 'tri-ent-t', text: label }));
      values.forEach(function (v) {
        b.appendChild(h('span', { class: 'tri-tag', title: v.title || null }, [
          v.dot ? h('i', { class: 'tri-dot', style: 'background:' + v.dot }) : null,
          text(v.text),
        ]));
      });
      return b;
    }
    var project = host.projectOf ? host.projectOf(row) : null;
    body.appendChild(h('div', { class: 'tri-ents' }, [
      entity('people', 'user', 'Personnes', found.people, function (b) { host.openEntities(row, 'people', b); }),
      entity('places', 'map-pin', 'Lieux', found.places, function (b) { host.openEntities(row, 'places', b); }),
      entity('labels', 'tag', 'Étiquettes', found.labels, function (b) { host.openEntities(row, 'labels', b); }),
      entity('project', (project && project.glyph) || 'stack-2', 'Projet', project ? [project] : [], function (b) { host.pickProject(row, b); }),
    ]));

    /* ── Decision: always at the bottom of the pane ──────────────── */
    var decide = h('div', { class: 'tri-decide', role: 'group', 'aria-label': 'Décision' });
    var groups = {
      do: h('div', { class: 'tri-group' }),
      park: h('div', { class: 'tri-group tri-group--park' }),
    };
    decide.appendChild(groups.do);
    decide.appendChild(groups.park);
    D.TRIAGE_EXITS.forEach(function (ex) {
      var b = h('button', {
        class: 'db-btn tri-act' + (ex.primary ? ' db-btn--primary' : '') + (ex.danger ? ' db-btn--danger tri-act--end' : ''),
        type: 'button',
        title: host.hintOf ? host.hintOf(ex.id) : null,
        'data-exit': ex.id,
        'data-fk': 'exit:' + ex.id,
        onclick: function () { host.perform(row, ex.id, b); },
      }, [icon(ex.icon), text(ex.label), h('kbd', { text: ex.key.toUpperCase() })]);
      (groups[ex.group] || decide).appendChild(b);
    });
    root.appendChild(decide);
    return root;
  }

  /**
   * The pane of a project (a node of the goal map) when its line is clicked in the tree.
   * Name, description, outcome and next step can be set here; open-task count and progress stay computed.
   * `p` is a WorkOS.projectChain row plus `desc`.
   *   host: {
   *     saveProject(id, { name?, desc?, icon? }, okMsg) -> Promise,
   *     pickIcon(p, icon),                    // the glyph was chosen in the pane
   *     pasteImages(p, files) -> Promise,    // a pasted or dropped picture
   *     resolveImage(src) -> Promise<url>,   // an upload: pointer, shown in the note
   *     imageError(message),
   *     pickOutcome(p, anchor),              // choose or create the objective this project serves
   *     saveStep(p, text),                   // the next step, written on its card
   *     saveMetric(p, number),               // the measured result, when the project has one
   *   }
   */
  function projectDetail(p, host) {
    var root = h('div', { class: 'tri tri-project', 'data-project': p.id });
    var body = h('div', { class: 'tri-body' });
    root.appendChild(body);
    var origin = h('span', { class: 'tri-origin' });
    if (global.IconPick && host.pickIcon) {
      origin.appendChild(global.IconPick.button({
        icon: p.icon,
        fallback: 'stack-2',
        className: 'ip-glyph',
        onChoose: function (next) { host.pickIcon(p, next); },
      }));
    } else origin.appendChild(icon((p.icon && p.icon.i) || 'stack-2'));
    origin.appendChild(text('Projet'));
    body.appendChild(h('div', { class: 'tri-top' }, [origin]));

    function field(cls, label, value, placeholder, onSave, single) {
      var el = h('textarea', { class: cls, rows: '1', maxlength: single ? '120' : '2000', spellcheck: 'true', 'aria-label': label, placeholder: placeholder || null });
      el.value = value || '';
      function fit() {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
      el.addEventListener('input', fit);
      el.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { el.value = value || ''; fit(); el.blur(); }
        else if (e.key === 'Enter' && !e.isComposing && (single || e.ctrlKey || e.metaKey)) { e.preventDefault(); el.blur(); }
      });
      el.addEventListener('blur', function () {
        var v = single ? clean(el.value) : el.value.trim();
        if (single && !v) { el.value = value || ''; fit(); return; }
        if (v === (value || '')) return;
        value = v;
        el.value = v;
        onSave(v);
      });
      setTimeout(fit, 0);
      return el;
    }
    body.appendChild(field('tri-title', 'Nom du projet', p.name, '', function (v) { host.saveProject(p.id, { name: v }); }, true));

    var projectShots = host.shots ? host.shots(p) : [];
    var note = noteField({
      desc: p.desc,
      fk: 'pdesc',
      resolve: host.resolveImage,
      shots: projectShots,
      loadImages: host.loadImages ? function (cb) { host.loadImages(p, cb); } : null,
      onSave: function (text) { if (host.saveProject) host.saveProject(p.id, { desc: text }, 'Enregistré'); },
      onImages: host.pasteImages ? function (files) { return host.pasteImages(p, files); } : null,
      onImageError: host.imageError,
    });
    body.appendChild(note);

    function fact(iconName, label, valueEl, empty) {
      var editable = valueEl && (valueEl.tagName === 'BUTTON' || valueEl.tagName === 'INPUT');
      var row = h('div', { class: 'tri-fact' + (empty ? ' is-empty' : '') + (editable ? ' tri-fact--edit' : '') }, [
        icon(iconName),
        h('span', { class: 'tri-fact-l', text: label }),
      ]);
      row.appendChild(valueEl);
      if (editable) {
        row.addEventListener('click', function (e) {
          if (e.target === valueEl || valueEl.contains(e.target)) return;
          if (valueEl.tagName === 'BUTTON') valueEl.click();
          else valueEl.focus();
        });
      }
      return row;
    }
    function valueText(text, empty) {
      return h('span', { class: 'tri-fact-v', text: text || empty });
    }
    function valueButton(text, empty, title, fk, onClick) {
      return h('button', {
        class: 'tri-fact-v tri-fact-btn' + (text ? '' : ' is-empty'),
        type: 'button',
        title: title,
        'data-fk': fk,
        onclick: function (e) { onClick(e.currentTarget); },
      }, [text || empty]);
    }

    var facts = h('div', { class: 'tri-facts' });
    facts.appendChild(fact('flag', 'Résultat', valueButton(
      p.outcome,
      'Cliquer pour ajouter…',
      p.outcome ? 'Changer le résultat' : 'Choisir un résultat',
      'outcome',
      function (b) { if (host.pickOutcome) host.pickOutcome(p, b); }
    ), !p.outcome));

    var step = p.step && p.step.text ? p.step.text : '';
    var stepCard = p.step && p.step.cardId;
    if (stepCard && host.saveStep) {
      var stepInput = h('input', {
        class: 'tri-fact-input' + (step ? '' : ' is-empty'),
        type: 'text',
        placeholder: 'Cliquer pour ajouter…',
        'aria-label': 'Prochaine action',
        'data-fk': 'pstep',
        maxlength: '300',
        autocomplete: 'off',
      });
      stepInput.value = step;
      stepInput.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); stepInput.blur(); }
        else if (e.key === 'Escape') { stepInput.value = step; stepInput.blur(); }
      });
      stepInput.addEventListener('input', function () {
        stepInput.classList.toggle('is-empty', !clean(stepInput.value));
      });
      stepInput.addEventListener('blur', function () {
        var v = clean(stepInput.value);
        if (!v || v === step) { stepInput.value = step; stepInput.classList.toggle('is-empty', !step); return; }
        host.saveStep(p, v);
      });
      facts.appendChild(fact('player-track-next', 'Prochaine action', stepInput, !step));
    } else {
      facts.appendChild(fact('player-track-next', 'Prochaine action', valueText(step, 'Aucune'), !step));
    }

    if (p.metricLabel && p.metricId && host.saveMetric) {
      facts.appendChild(fact('chart-line', 'Mesure', valueButton(
        p.metricLabel,
        '',
        'Mettre à jour la mesure',
        'metric',
        function (b) { editMetric(b); }
      ), false));
    }
    facts.appendChild(fact('checklist', 'Tâches ouvertes', valueText(p.openCount ? String(p.openCount) : '', 'Aucune'), !p.openCount));
    facts.appendChild(fact('progress', 'Avancement', valueText(p.work == null ? '' : p.work + ' %', 'Aucun'), p.work == null));
    body.appendChild(facts);

    function editMetric(btn) {
      var input = h('input', {
        class: 'tri-fact-input',
        type: 'number',
        step: 'any',
        'aria-label': 'Mesure',
        'data-fk': 'metric',
        value: p.metricValue == null ? '' : String(p.metricValue),
      });
      btn.replaceWith(input);
      input.focus();
      input.select();
      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        var n = Number(String(input.value).replace(',', '.'));
        if (!save || !isFinite(n)) { input.replaceWith(btn); return; }
        host.saveMetric(p, n);
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); done = true; input.replaceWith(btn); }
      });
      input.addEventListener('blur', function () { finish(true); });
    }
    return root;
  }

  /**
   * The pane of one checklist subtask. A linked card whose row is already loaded is drawn with detail()
   * instead: this pane is the local item (or a linked line whose card is not on the board).
   */
  function subDetail(spec, host) {
    var D = DM();
    var item = spec.item || {};
    var card = spec.card || {};
    var nested = !!spec.parent;
    var linkedOnly = !!item.linkedCardId;
    var root = h('div', { class: 'tri tri--sub', 'data-card': card.id || '', 'data-sub': item.id || '' });
    var body = h('div', { class: 'tri-body' });
    root.appendChild(body);

    body.appendChild(h('div', { class: 'tri-top' }, [
      h('button', {
        class: 'tri-back',
        type: 'button',
        title: card.name || 'Tâche',
        onclick: function () { host.showCard(); },
      }, [icon('list-check'), h('span', { text: card.name || 'Tâche' })]),
      h('span', { class: 'tri-spacer' }),
      linkedOnly ? iconButton('external-link', 'Ouvrir la carte', function () { host.openCard(); }) : null,
    ]));

    var title = h('textarea', { class: 'tri-title', rows: '1', maxlength: '500', spellcheck: 'true', 'aria-label': 'Titre', 'data-fk': 'title' });
    title.value = item.text || '';
    function fitTitle() {
      title.style.height = 'auto';
      title.style.height = title.scrollHeight + 'px';
    }
    title.addEventListener('input', fitTitle);
    title.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); title.blur(); }
      else if (e.key === 'Escape') { title.value = item.text || ''; fitTitle(); title.blur(); }
    });
    title.addEventListener('blur', function () {
      var v = clean(title.value);
      if (!v) { title.value = item.text || ''; fitTitle(); return; }
      title.value = v;
      if (v === item.text) return;
      host.rename(v);
    });
    body.appendChild(title);
    setTimeout(fitTitle, 0);
    if (linkedOnly) return root;

    function prop(label, parts) {
      return h('div', { class: 'tri-prop' }, [
        h('span', { class: 'tri-k', text: label }),
        h('div', { class: 'tri-v' }, parts),
      ]);
    }
    function minutesOf() {
      var CT = global.CompletionTrello;
      var m = CT && CT.itemEstimatedMinutes ? CT.itemEstimatedMinutes(item) : item.estimatedMinutes;
      return m || 0;
    }
    function dueOf() {
      return item.dueDate || item.startDate || '';
    }
    function dayId() {
      var day = dueOf();
      if (!day || !D) return '';
      var days = D.quickDays(host.today);
      for (var i = 0; i < days.length; i++) if (days[i].iso && days[i].iso === day) return days[i].id;
      return 'other';
    }

    var props = h('div', { class: 'tri-props' });

    function estValue() {
      var m = minutesOf();
      return !m ? '' : D.ESTIMATE_CHIPS.indexOf(m) >= 0 ? m : 'other';
    }
    var estOptions = D.ESTIMATE_CHIPS.map(function (m) { return { id: m, label: D.formatMinutes(m) }; });
    estOptions.push({ id: 'other', label: 'Autre…', icon: 'chevron-down' });
    var est = segmented({
      label: 'Estimation',
      key: 'est',
      options: estOptions,
      value: estValue(),
      onPick: function (o) {
        if (o.id === 'other') return host.openEstimate(est.buttons[est.buttons.length - 1]);
        host.setEstimate(o.id === estValue() ? 0 : o.id);
      },
    });
    function paintEst() {
      est.set(estValue());
      setOption(est.buttons[est.buttons.length - 1], estValue() === 'other' ? D.formatMinutes(minutesOf()) : 'Autre…');
    }
    paintEst();

    var quick = D.quickDays(host.today);
    var dayOptions = quick.map(function (d) {
      return { id: d.id, label: DAY_LABEL[d.id], title: d.id === 'monday' ? host.dayLabel(d.iso) : null, iso: d.iso };
    });
    dayOptions.push({ id: 'other', label: 'Autre…', icon: 'chevron-down' });
    var day = segmented({
      label: 'Jour prévu',
      key: 'day',
      options: dayOptions,
      value: dayId(),
      onPick: function (o) {
        if (o.id === 'other') return host.openDay(day.buttons[day.buttons.length - 1], dueOf());
        var cur = dayId();
        host.plan(o.id === cur ? '' : o.iso);
      },
    });
    function paintDay() {
      var which = dayId();
      day.set(which);
      setOption(day.buttons[day.buttons.length - 1], which === 'other' && dueOf() ? host.dayLabel(dueOf()) : 'Autre…', which === 'other' ? 'calendar' : 'chevron-down');
    }
    paintDay();

    props.appendChild(prop('Estimation', [est.el]));
    props.appendChild(prop('Jour prévu', [day.el]));

    var STEPS = [0, 25, 50, 75, 100];
    function progValue() {
      var p = typeof item.progress === 'number' ? Math.round(item.progress) : (item.done ? 100 : 0);
      return STEPS.indexOf(p) >= 0 ? p : '';
    }
    var progNum = h('span', { class: 'tri-quiet' });
    var prog = segmented({
      label: 'Avancement',
      key: 'prog',
      fill: 'plain',
      cls: 'tri-scale tri-scale--plain',
      options: STEPS.map(function (n) { return { id: n, label: n + ' %', title: n + ' %' }; }),
      value: progValue(),
      onPick: function (o) {
        var cur = typeof item.progress === 'number' ? Math.round(item.progress) : 0;
        host.setProgress(o.id === cur && o.id > 0 ? 0 : o.id);
      },
    });
    function paintProg() {
      var p = typeof item.progress === 'number' ? Math.round(item.progress) : (item.done ? 100 : 0);
      prog.set(progValue());
      prog.buttons.forEach(function (b, i) { b.classList.toggle('is-fill', p >= STEPS[i] && p > 0); });
      prog.el.classList.toggle('is-done', p >= 100);
      progNum.textContent = progValue() === '' && p > 0 ? p + ' %' : '';
    }
    paintProg();
    var progParts = [prog.el, progNum];
    if (!nested) {
      var blockBtn = h('button', { class: 'tri-blocked', type: 'button', 'data-fk': 'blocked' }, [icon('player-pause'), h('span', { class: 'tri-blocked-t' })]);
      blockBtn.classList.toggle('is-on', !!item.blocked);
      blockBtn.title = item.blocked ? 'Bloquée · cliquer pour débloquer' : 'Marquer comme bloquée';
      blockBtn.setAttribute('aria-pressed', item.blocked ? 'true' : 'false');
      blockBtn.querySelector('.tri-blocked-t').textContent = item.blocked ? 'Bloquée' : 'Bloquer';
      blockBtn.addEventListener('click', function () { host.toggleBlocked(); });
      progParts.push(blockBtn);
    }
    props.appendChild(prop('Avancement', progParts));

    if (!nested) {
      var subs = h('div', { class: 'tri-subs' });
      (item.items || []).forEach(function (it) {
        if (!it || typeof it.text !== 'string') return;
        var done = it.done === true || Number(it.progress) >= 100;
        subs.appendChild(h('button', {
          class: 'tri-sub' + (done ? ' is-done' : '') + (it.blocked && !done ? ' is-blocked' : ''),
          type: 'button',
          role: 'checkbox',
          'aria-checked': done ? 'true' : 'false',
          title: done ? 'Rouvrir' : 'Terminer',
          onclick: function () { host.toggleChild(it.id, !done); },
        }, [icon(done ? 'circle-check' : 'circle'), h('span', { class: 'tri-sub-t', text: it.text })]));
      });
      var add = h('input', { class: 'tri-sub-add', type: 'text', placeholder: 'Nouvelle sous-tâche', 'aria-label': 'Nouvelle sous-tâche', maxlength: '200' });
      add.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var v = add.value.replace(/\s+/g, ' ').trim();
        if (!v) return;
        add.value = '';
        host.addChild(v);
      });
      subs.appendChild(add);
      props.appendChild(prop('Sous-tâches', [subs]));
    }
    body.appendChild(props);
    return root;
  }

  global.TriageUI = {
    detail: detail,
    subDetail: subDetail,
    projectDetail: projectDetail,
    segmented: segmented,
    appendImage: appendImage,
    appendLine: appendLine,
    descBlocks: descBlocks,
    imageFilesOf: imageFilesOf,
    imageAlt: imageAlt,
    noteShots: noteShots,
  };
})(typeof window !== 'undefined' ? window : this);
