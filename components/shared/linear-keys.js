/*
 * Role: Linear-style single-key shortcuts shared by the card views (Table, Kanban). On the card under the
 * pointer (or the selected one) :  S = statut, P = urgence, D = échéance;  C = nouvelle carte.
 * Statut and urgence open the searchable LinearPick; the échéance opens the shared CardFields editor.
 * The view only supplies how to find a card and how to apply a change, so both views behave the same.
 *
 *   LinearKeys.attach({   // a newCard() also mounts the phone's round "+" button (see mountNewButton)
 *     t,
 *     hoverSelector,                   // card element, e.g. '.kb-card' or 'tr[data-id]'
 *     idOf(el) -> cardId,
 *     selectedId() -> cardId | '',     // optional fallback when nothing is hovered
 *     lists() -> [{ id, name, category, color }],
 *     row(id) -> row | null,           // needs { id, listId, urgency }
 *     isBusy() -> bool,                // optional: an inline editor is open
 *     anchorFor(id) -> element,        // optional: where the picker hangs (default: the hovered element)
 *     setStatus(row, list),            // apply a status change (view moves the card)
 *     setUrgency(row, urgencyId),      // apply an urgency change
 *     openDue(row, anchor),
 *     newCard(),
 *   }) -> detach()
 */
(function (global) {
  'use strict';

  /** Urgency ids in the order of the picker, with the label the views show on a row. */
  var LABEL_TO_ID = { Aucun: 'aucun', 'Bientôt': 'bientot', 'Assez vite': 'assez-vite', Vite: 'vite', 'Au plus vite': 'au-plus-vite' };

  /** Which action a key triggers (pure; null when the key is not a shortcut or a modifier is held). */
  function actionFor(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
    return { s: 'status', p: 'urgency', d: 'due', c: 'new' }[String(e.key || '').toLowerCase()] || null;
  }

  function typing() {
    var a = document.activeElement;
    return !!(a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable));
  }

  function attach(o) {
    var hovered = null;
    function onOver(e) {
      var c = e.target && e.target.closest ? e.target.closest(o.hoverSelector) : null;
      if (c) hovered = c;
    }
    function onLeave() { hovered = null; }

    function target() {
      var id = hovered && document.contains(hovered) ? o.idOf(hovered) : '';
      if (!id && typeof o.selectedId === 'function') id = o.selectedId() || '';
      var row = id ? o.row(id) : null;
      if (!row) return null;
      var anchor = (typeof o.anchorFor === 'function' && o.anchorFor(id)) || (hovered && document.contains(hovered) ? hovered : null) || document.body;
      return { row: row, anchor: anchor };
    }

    /** An inline editor, picker or composer is open: a shortcut or the "+" button must not stack another one. */
    function blocked() {
      if (typeof o.isBusy === 'function' && o.isBusy()) return true;
      return !!((global.LinearPick && global.LinearPick.isOpen()) || (global.NewCard && global.NewCard.isOpen()) || (global.CardFields && global.CardFields.isOpen()));
    }

    function onKey(e) {
      var action = actionFor(e);
      if (!action || e.defaultPrevented || typing()) return;
      if (blocked()) return;
      if (action === 'new') {
        if (typeof o.newCard !== 'function') return;
        e.preventDefault();
        return o.newCard();
      }
      var tg = target();
      if (!tg) return;
      e.preventDefault();
      if (action === 'due') return o.openDue(tg.row, tg.anchor);
      if (!global.LinearPick) return;
      if (action === 'status') {
        var TM = global.TableModel;
        global.LinearPick.open({
          anchor: tg.anchor,
          placeholder: 'Changer le statut…',
          current: tg.row.listId,
          items: o.lists().map(function (l) {
            return { id: l.id, label: l.name, icon: TM && TM.statutIcon ? TM.statutIcon(l.category || '_none') : 'circle', color: l.color };
          }),
          onPick: function (it) {
            var list = o.lists().filter(function (l) { return l.id === it.id; })[0];
            if (list && list.id !== tg.row.listId) o.setStatus(tg.row, list);
          },
        });
      } else {
        var urgencies = (global.NewCard && global.NewCard.URGENCIES) || [];
        var colors = { bientot: '#9fadbc', 'assez-vite': '#e2b203', vite: '#f38a3f', 'au-plus-vite': '#e34935' };
        global.LinearPick.open({
          anchor: tg.anchor,
          placeholder: 'Définir l’urgence…',
          current: LABEL_TO_ID[tg.row.urgency] || 'aucun',
          items: urgencies.map(function (u) { return { id: u.id, label: u.label, icon: u.icon, color: colors[u.id] }; }),
          onPick: function (it) {
            if (it.id !== (LABEL_TO_ID[tg.row.urgency] || 'aucun')) o.setUrgency(tg.row, it.id);
          },
        });
      }
    }

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('keydown', onKey);
    var unmountNew = typeof o.newCard === 'function' ? mountNewButton(function () { if (!blocked()) o.newCard(); }) : null;
    return function detach() {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('keydown', onKey);
      if (unmountNew) unmountNew();
    };
  }

  /**
   * The C key has no touch equivalent, so a round "+" button (shown on phones and touch screens by view-shell.css)
   * starts a new card through the same newCard(). It sits just above the assistant dock, and steps aside while a
   * text field has focus (the keyboard is up). Returns the function that removes it.
   */
  function mountNewButton(onClick) {
    var doc = global.document;
    if (!doc || !doc.body || typeof doc.createElement !== 'function') return null;
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'lk-new';
    b.title = 'Nouvelle carte (C)';
    b.setAttribute('aria-label', 'Nouvelle carte');
    var i = doc.createElement('i');
    i.className = 'ti ti-plus';
    b.appendChild(i);
    b.addEventListener('click', onClick);
    doc.body.appendChild(b);

    /** The button hangs 12 px above the assistant dock (ViewShell.dockBottom); with no dock, 16 px + the safe area. */
    function place() {
      var VS = global.ViewShell;
      var px = VS && typeof VS.dockBottom === 'function' ? VS.dockBottom(12) : null;
      b.style.bottom = px == null ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : px + 'px';
      return doc.querySelector ? doc.querySelector('.ad-dock') : null;
    }
    function isField(el) {
      return !!(el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable));
    }
    function onFocusIn(e) { if (isField(e.target)) b.classList.add('is-hidden'); }
    function onFocusOut() { b.classList.remove('is-hidden'); }

    var observed = null;
    var ro = null;
    function settle() {
      var dock = place();
      if (dock && dock !== observed && typeof global.ResizeObserver === 'function') {
        if (ro) ro.disconnect();
        ro = new global.ResizeObserver(place);
        ro.observe(dock);
        observed = dock;
      }
    }
    // The dock mounts after the view; look for it a few times, then ResizeObserver follows its drag-resize.
    var timers = [0, 300, 1000, 2500].map(function (ms) { return global.setTimeout(settle, ms); });
    var vv = global.visualViewport;
    global.addEventListener('resize', settle);
    if (vv && typeof vv.addEventListener === 'function') vv.addEventListener('resize', settle);
    doc.addEventListener('focusin', onFocusIn);
    doc.addEventListener('focusout', onFocusOut);
    place();

    return function unmount() {
      timers.forEach(function (id) { global.clearTimeout(id); });
      if (ro) ro.disconnect();
      global.removeEventListener('resize', settle);
      if (vv && typeof vv.removeEventListener === 'function') vv.removeEventListener('resize', settle);
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', onFocusOut);
      if (b.parentNode) b.parentNode.removeChild(b);
    };
  }

  /** Writes an urgency (an id of NewCard.URGENCIES) on a card through the same store as the priority editor. */
  function saveUrgency(t, cardId, urgencyId) {
    var PT = global.PriorityTrello;
    if (!PT || typeof PT.saveCardInputsById !== 'function') return Promise.reject(new Error('Éditeur d’urgence indisponible'));
    return PT.saveCardInputsById(t, cardId, { empressement: urgencyId });
  }

  global.LinearKeys = { attach: attach, actionFor: actionFor, saveUrgency: saveUrgency, LABEL_TO_ID: LABEL_TO_ID };
})(typeof window !== 'undefined' ? window : this);
