/*
 * Role: open one task inside the current view. The rest fades (Isolation) and the task
 * is edited here (CardQuick). Nothing navigates and nothing opens a Trello modal.
 *
 *   TaskFocus.open({ t, cardId, name, onChange, onToast, onGone })
 *   TaskFocus.close()
 *   TaskFocus.currentId() -> string
 *   TaskFocus.next(currentId, cardId) -> { action: 'noop'|'close'|'open', id }
 *
 * A second click on the same task closes it and leaves isolation.
 */
(function (global) {
  'use strict';

  var panel = null;
  var quick = null;
  var ownedId = '';
  var listening = false;

  function next(currentId, cardId) {
    var id = cardId == null ? '' : String(cardId);
    if (!id) return { action: 'noop', id: '' };
    if (currentId && String(currentId) === id) return { action: 'close', id: id };
    return { action: 'open', id: id };
  }

  function isolate(cardId, name) {
    ownedId = String(cardId);
    var Iso = global.Isolation;
    if (!Iso || typeof Iso.set !== 'function') return;
    Iso.set({ kind: 'task', id: ownedId, label: name || '' });
  }

  function releaseIsolation() {
    var id = ownedId;
    ownedId = '';
    var Iso = global.Isolation;
    if (!id || !Iso || typeof Iso.read !== 'function' || typeof Iso.clear !== 'function') return;
    var cur = Iso.read();
    if (cur && cur.kind === 'task' && cur.id === id) Iso.clear();
  }

  function onIsolation() {
    if (!panel) return;
    var Iso = global.Isolation;
    var cur = Iso && typeof Iso.read === 'function' ? Iso.read() : null;
    if (!cur || cur.kind !== 'task' || cur.id !== ownedId) close(false);
  }

  function onKey(e) {
    if (!panel || !e || e.key !== 'Escape') return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    close(true);
  }

  function ensureListen() {
    if (listening || !global.document || !global.document.addEventListener) return;
    listening = true;
    global.document.addEventListener('tp-isolation', onIsolation);
    global.document.addEventListener('keydown', onKey);
  }

  function close(release) {
    if (quick && typeof quick.destroy === 'function') quick.destroy();
    quick = null;
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    if (release) releaseIsolation();
    else ownedId = '';
  }

  function open(opts) {
    opts = opts || {};
    var cardId = opts.cardId || (opts.row && opts.row.id) || '';
    var step = next(ownedId, cardId);
    if (step.action === 'noop') return;
    if (step.action === 'close') {
      close(true);
      return;
    }
    var name = opts.name || (opts.row && opts.row.name) || '';
    ensureListen();
    close(false);
    isolate(step.id, name);
    var doc = global.document;
    if (!doc || typeof doc.createElement !== 'function' || !doc.body) return;
    var el = doc.createElement('aside');
    el.className = 'tf-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', name || 'Tâche');
    var x = doc.createElement('button');
    x.type = 'button';
    x.className = 'tf-x';
    x.title = 'Fermer';
    x.setAttribute('aria-label', 'Fermer');
    var icon = doc.createElement('i');
    icon.className = 'ti ti-x';
    icon.setAttribute('aria-hidden', 'true');
    x.appendChild(icon);
    x.addEventListener('click', function () { close(true); });
    var body = doc.createElement('div');
    body.className = 'tf-body';
    el.appendChild(x);
    el.appendChild(body);
    doc.body.appendChild(el);
    panel = el;
    if (global.CardQuick && typeof global.CardQuick.mount === 'function') {
      quick = global.CardQuick.mount(body, {
        t: opts.t,
        cardId: step.id,
        name: name,
        onChange: opts.onChange,
        onToast: opts.onToast,
        onGone: function () {
          if (typeof opts.onGone === 'function') opts.onGone();
          close(true);
        },
      });
    }
  }

  global.TaskFocus = {
    open: open,
    close: function () { close(true); },
    currentId: function () { return panel ? ownedId : ''; },
    next: next,
  };
})(typeof window !== 'undefined' ? window : this);
