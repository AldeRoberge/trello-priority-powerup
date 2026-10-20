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
 *   host: {
 *     t, today,
 *     save(row, factory, opts),            // queued write: factory() -> promise; opts { ok, then(result) }
 *     perform(row, id, anchor),            // a decision (DashboardModel.TRIAGE_EXITS) or a card action
 *     openCard(row), cardMenu(row, anchor),
 *     openEditor(row, kind, anchor),       // CardFields: desc | priority | due
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
      if (spec.fill) b.setAttribute('data-tier', String(impactTier(Number(o.id))));
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
        if (spec.fill) b.classList.toggle('is-fill', has && Number(o.id) <= Number(value));
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
      row.blocked ? h('button', {
        class: 'tri-blocked',
        type: 'button',
        title: 'Bloquée · cliquer pour débloquer',
        'data-fk': 'blocked',
        onclick: function () { host.perform(row, 'blocked'); },
      }, [icon('player-pause'), text('Bloquée')]) : null,
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
    var hasNote = !!clean(row.desc);
    var note = h('div', {
      class: 'tri-desc' + (hasNote ? '' : ' is-empty'),
      role: 'button',
      tabindex: '0',
      title: hasNote ? 'Modifier la note' : 'Ajouter une note',
      'data-fk': 'desc',
    });
    if (hasNote) {
      var shown = h('div', { class: 'tri-desc-body agent-md' });
      if (global.MarkdownDom) global.MarkdownDom.append(shown, row.desc);
      else shown.textContent = row.desc;
      note.appendChild(shown);
    } else {
      note.appendChild(icon('plus'));
      note.appendChild(h('span', { text: 'Cliquer pour ajouter…' }));
    }
    function openNote(e) {
      if (e && e.target && e.target.closest && e.target.closest('a')) return; // links inside the note keep working
      host.openEditor(row, 'desc', note);
    }
    note.addEventListener('click', openNote);
    note.addEventListener('keydown', function (e) {
      if (e.target !== note || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      openNote();
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
    dayOptions.push({ id: 'other', label: 'Autre…', icon: 'calendar-event' });
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
      setOption(day.buttons[day.buttons.length - 1], which === 'other' ? host.dayText(row) : 'Autre…', which === 'other' ? host.dayIcon(row) : 'calendar-event');
    }
    paintDay();

    props.appendChild(prop('Impact', [impact.el]));
    props.appendChild(prop('Urgence', [urgency.el]));
    props.appendChild(prop('Priorité', [prio, h('span', { class: 'tri-spacer' }), refine], 'tri-prop--result'));
    props.appendChild(prop('Estimation', [est.el]));
    props.appendChild(prop('Jour prévu', [day.el]));
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
      entity('project', 'stack-2', 'Projet', project ? [project] : [], function (b) { host.pickProject(row, b); }),
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
   *     saveProject(id, { name?, desc?, icon? }) -> Promise,
   *     pickIcon(p, icon),                    // the glyph was chosen in the pane
   *     openDesc(p, anchor),                 // rich description (CardFields)
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

    var hasNote = !!clean(p.desc);
    var note = h('div', {
      class: 'tri-desc' + (hasNote ? '' : ' is-empty'),
      role: 'button',
      tabindex: '0',
      title: hasNote ? 'Modifier la description' : 'Ajouter une description',
      'data-fk': 'pdesc',
    });
    if (hasNote) {
      var shown = h('div', { class: 'tri-desc-body agent-md' });
      if (global.MarkdownDom) global.MarkdownDom.append(shown, p.desc);
      else shown.textContent = p.desc;
      note.appendChild(shown);
    } else {
      note.appendChild(icon('plus'));
      note.appendChild(h('span', { text: 'Cliquer pour ajouter…' }));
    }
    function openNote(e) {
      if (e && e.target && e.target.closest && e.target.closest('a')) return;
      if (host.openDesc) host.openDesc(p, note);
    }
    note.addEventListener('click', openNote);
    note.addEventListener('keydown', function (e) {
      if (e.target !== note || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      openNote();
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

  global.TriageUI = { detail: detail, projectDetail: projectDetail, segmented: segmented };
})(typeof window !== 'undefined' ? window : this);
