/*
 * Role: shared "new card" composer in the style of Linear's "New issue": a title, an optional
 * description, and a row of chips (Statut, Urgence, Échéance) that open searchable pickers. Table,
 * Kanban and the other views open the same one (key C), so a card is created the same way everywhere.
 *
 *   NewCard.open({
 *     t,                          // Trello bridge
 *     lists,                      // [{ id, name, category, color }]
 *     listId,                     // initial status (list)
 *     onCreated({ cardId, name, list, dueDate, urgency }),   // after the card and its fields are saved
 *     onError(err),               // optional
 *   })
 *
 * Writes go through the same modules as the rest of the app (TableTrello.createRow, PriorityTrello
 * restPutCard / saveCardInputsById, GanttTrello.saveCardDates). buildPlan is pure and unit-tested.
 */
(function (global) {
  'use strict';

  var URGENCIES = [
    { id: 'aucun', label: 'Aucune urgence', icon: 'flame-off' },
    { id: 'bientot', label: 'Bientôt', icon: 'flame' },
    { id: 'assez-vite', label: 'Assez vite', icon: 'flame' },
    { id: 'vite', label: 'Vite', icon: 'flame' },
    { id: 'au-plus-vite', label: 'Au plus vite', icon: 'flame' },
  ];
  var URGENCY_COLORS = { aucun: '', bientot: '#9fadbc', 'assez-vite': '#e2b203', vite: '#f38a3f', 'au-plus-vite': '#e34935' };

  var current = null;

  /**
   * What to write for a draft { title, desc, listId, urgency, dueDate }: "… demain" in the title becomes the
   * due date unless one was picked. Returns null when there is no title.
   */
  function buildPlan(draft, quickParse) {
    var typed = String((draft && draft.title) || '').trim();
    if (!typed) return null;
    var q = quickParse && typeof quickParse.parse === 'function' ? quickParse.parse(typed) : { name: typed, dueDate: '' };
    var name = (q && q.name) || typed;
    var due = (draft.dueDate || '') || (q && q.dueDate) || '';
    var urgency = draft.urgency && draft.urgency !== 'aucun' ? draft.urgency : '';
    return { name: name, desc: String(draft.desc || '').trim(), listId: draft.listId || '', dueDate: due, urgency: urgency };
  }

  /** '2026-10-08' -> '8 oct.' (the year only when it is not the current one). */
  function formatDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    try { return d.toLocaleDateString('fr-CA', opts); } catch (e) { return iso; }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function close() {
    if (!current) return;
    var c = current;
    current = null;
    document.removeEventListener('keydown', c.onKey, true);
    if (global.LinearPick) global.LinearPick.close();
    if (c.root.parentNode) c.root.parentNode.removeChild(c.root);
    if (c.prevFocus && c.prevFocus.focus) { try { c.prevFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  }

  function statutIcon(list) {
    var TM = global.TableModel;
    return TM && TM.statutIcon ? TM.statutIcon((list && list.category) || '_none') : 'circle';
  }

  function write(o, plan) {
    var TT = global.TableTrello;
    var PT = global.PriorityTrello;
    var GT = global.GanttTrello;
    return TT.createRow(o.t, plan.name, plan.listId).then(function (res) {
      var cardId = res && res.cardId;
      if (!cardId) return res;
      var steps = [];
      function soft(p) { return p.then(null, function () { /* the card exists; the field can be set by hand */ }); }
      if (plan.desc && PT && PT.restPutCard) steps.push(soft(PT.restPutCard(o.t, cardId, { desc: plan.desc })));
      if (plan.dueDate && GT && GT.saveCardDates) steps.push(soft(GT.saveCardDates(o.t, cardId, { dueDate: plan.dueDate })));
      if (plan.urgency && PT && PT.saveCardInputsById) steps.push(soft(PT.saveCardInputsById(o.t, cardId, { empressement: plan.urgency })));
      return Promise.all(steps).then(function () { return res; });
    });
  }

  function open(o) {
    o = o || {};
    var lists = o.lists || [];
    if (!o.t || !lists.length || !global.TableTrello) return false;
    close();
    var prevFocus = document.activeElement;
    var draft = { title: '', desc: '', listId: o.listId || lists[0].id, urgency: 'aucun', dueDate: '' };
    var busy = false;

    var root = el('div', 'nc-scrim');
    var card = el('div', 'nc-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Nouvelle carte');
    root.appendChild(card);
    card.appendChild(el('div', 'nc-crumb', 'Nouvelle carte'));
    var title = el('input', 'nc-title');
    title.type = 'text';
    title.placeholder = 'Titre de la carte';
    title.autocomplete = 'off';
    var desc = el('textarea', 'nc-desc');
    desc.placeholder = 'Ajouter une description…';
    var chips = el('div', 'nc-chips');
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(chips);

    function listById(id) { return lists.filter(function (l) { return l.id === id; })[0] || lists[0]; }

    function chip(iconName, text, empty, onclick, color) {
      var b = el('button', 'nc-chip' + (empty ? ' is-empty' : ''));
      b.type = 'button';
      var i = el('i', 'ti ti-' + iconName);
      if (color) i.style.color = color;
      b.appendChild(i);
      b.appendChild(el('span', null, text));
      b.addEventListener('click', function () { onclick(b); });
      return b;
    }

    function paintChips() {
      chips.textContent = '';
      var list = listById(draft.listId);
      chips.appendChild(chip(statutIcon(list), list.name, false, function (anchor) {
        global.LinearPick.open({
          anchor: anchor,
          placeholder: 'Changer le statut…',
          current: draft.listId,
          items: lists.map(function (l) { return { id: l.id, label: l.name, icon: statutIcon(l), color: l.color }; }),
          onPick: function (it) { draft.listId = it.id; paintChips(); title.focus(); },
          onClose: function () { if (current) title.focus(); },
        });
      }, list.color));
      var u = URGENCIES.filter(function (x) { return x.id === draft.urgency; })[0] || URGENCIES[0];
      chips.appendChild(chip(u.icon, draft.urgency === 'aucun' ? 'Urgence' : u.label, draft.urgency === 'aucun', function (anchor) {
        global.LinearPick.open({
          anchor: anchor,
          placeholder: 'Définir l’urgence…',
          current: draft.urgency,
          items: URGENCIES.map(function (x) { return { id: x.id, label: x.label, icon: x.icon, color: URGENCY_COLORS[x.id] }; }),
          onPick: function (it) { draft.urgency = it.id; paintChips(); title.focus(); },
          onClose: function () { if (current) title.focus(); },
        });
      }, URGENCY_COLORS[draft.urgency]));
      // The chip shows the date as text; the real date input sits invisibly over it so the native picker opens on click.
      var dueChip = chip('calendar-event', draft.dueDate ? formatDay(draft.dueDate) : 'Échéance', !draft.dueDate, function () {
        var inp = dueChip.querySelector('input');
        if (inp && inp.showPicker) { try { inp.showPicker(); } catch (e) { inp.focus(); } } else if (inp) inp.focus();
      });
      dueChip.classList.add('nc-chip--date');
      var date = el('input');
      date.type = 'date';
      date.value = draft.dueDate;
      date.setAttribute('aria-label', 'Échéance');
      date.addEventListener('change', function () { draft.dueDate = date.value; paintChips(); title.focus(); });
      dueChip.appendChild(date);
      chips.appendChild(dueChip);
    }

    var foot = el('div', 'nc-foot');
    foot.appendChild(el('span', 'nc-hint', 'Entrée pour créer · Échap pour fermer'));
    var go = el('button', 'nc-btn', 'Créer la carte');
    go.type = 'button';
    foot.appendChild(go);
    card.appendChild(foot);

    function submit() {
      if (busy) return;
      draft.title = title.value;
      draft.desc = desc.value;
      var plan = buildPlan(draft, global.QuickParse);
      if (!plan) { title.focus(); return; }
      busy = true;
      go.disabled = true;
      go.textContent = 'Création…';
      write(o, plan).then(function (res) {
        var list = listById(plan.listId);
        close();
        if (typeof o.onCreated === 'function') o.onCreated({ cardId: res && res.cardId, name: plan.name, list: list, dueDate: plan.dueDate, urgency: plan.urgency });
      }, function (err) {
        busy = false;
        go.disabled = false;
        go.textContent = 'Créer la carte';
        if (typeof o.onError === 'function') o.onError(err);
      });
    }

    go.addEventListener('click', submit);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    function onKey(e) {
      if (!current || current.root !== root) return;
      if (global.LinearPick && global.LinearPick.isOpen()) return; // the picker owns the keys while open
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Enter' && !e.isComposing && ((e.ctrlKey || e.metaKey) || e.target === title)) { e.preventDefault(); e.stopPropagation(); submit(); }
    }
    current = { root: root, onKey: onKey, prevFocus: prevFocus };
    document.addEventListener('keydown', onKey, true);
    paintChips();
    document.body.appendChild(root);
    title.focus();
    return true;
  }

  global.NewCard = {
    open: open,
    close: close,
    isOpen: function () { return !!current; },
    buildPlan: buildPlan,
    URGENCIES: URGENCIES,
  };
})(typeof window !== 'undefined' ? window : this);
