/*
 * Role: the list of conversations on the left of the Assistant page (see agent-chats.js for the model).
 * A "Nouvelle conversation" button, the earlier conversations grouped by day, and a folded "Archivées"
 * list. Click a row to open it, the icon on its right (or right-click) archives it. Draws only; the
 * Assistant (agent-ui.js) decides what opening / archiving does to the chat on screen.
 *
 *   AgentChatsUI.mount(host, { getView, onNew, onOpen, onArchive, onRestore, isLocked })
 *     getView () => AgentChats view ({ currentId, isDraft, persisted, groups, archived })
 *     isLocked () => bool   true while the assistant is answering: opening / new are quiet and do nothing
 *   → { render, syncLock }
 */
(function (global) {
  'use strict';

  var LOCKED_TITLE = 'L’assistant répond…';

  function el(tag, cls, text) {
    var n = global.document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    var i = el('i', 'ti ti-' + name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function mount(host, opts) {
    opts = opts || {};
    var showArchived = false;
    host.classList.add('agent-chats');
    host.setAttribute('aria-label', 'Conversations');

    var newBtn = el('button', 'agent-chats-new');
    newBtn.type = 'button';
    newBtn.appendChild(icon('plus'));
    newBtn.appendChild(el('span', 'agent-chats-new-label', 'Nouvelle conversation'));
    var listEl = el('div', 'agent-chats-list');
    listEl.setAttribute('role', 'list');
    var archToggle = el('button', 'agent-chats-archived-toggle');
    archToggle.type = 'button';
    var archChevron = icon('chevron-right');
    var archCount = el('span', 'agent-chats-archived-count');
    archToggle.appendChild(archChevron);
    archToggle.appendChild(el('span', 'agent-chats-archived-label', 'Archivées'));
    archToggle.appendChild(archCount);
    var archEl = el('div', 'agent-chats-list agent-chats-list--archived');
    archEl.setAttribute('role', 'list');
    var note = el('div', 'agent-chats-note', 'Historique non enregistré');
    note.title = 'Le navigateur refuse le stockage local : les conversations disparaissent à la fermeture.';
    host.appendChild(newBtn);
    host.appendChild(listEl);
    host.appendChild(archToggle);
    host.appendChild(archEl);
    host.appendChild(note);

    function locked() {
      return typeof opts.isLocked === 'function' && !!opts.isLocked();
    }

    function call(name, arg) {
      if (typeof opts[name] === 'function') opts[name](arg);
    }

    function buildRow(item, archived, currentId) {
      var row = el('div', 'agent-chats-row' + (item.id === currentId ? ' is-current' : '') + (archived ? ' is-archived' : ''));
      row.setAttribute('role', 'listitem');
      row.setAttribute('data-chat-id', item.id);
      var main = el('button', 'agent-chats-item', item.title);
      main.type = 'button';
      if (item.id === currentId) main.setAttribute('aria-current', 'true');
      main.addEventListener('click', function () {
        if (archived) return call('onRestore', { id: item.id, open: true });
        if (locked()) return;
        call('onOpen', item.id);
      });
      var act = el('button', 'agent-chats-act');
      act.type = 'button';
      act.appendChild(icon(archived ? 'archive-off' : 'archive'));
      act.title = archived ? 'Restaurer' : 'Archiver';
      act.setAttribute('aria-label', (archived ? 'Restaurer « ' : 'Archiver « ') + item.title + ' »');
      act.addEventListener('click', function (e) {
        e.stopPropagation();
        call(archived ? 'onRestore' : 'onArchive', archived ? { id: item.id, open: false } : item.id);
      });
      row.appendChild(main);
      row.appendChild(act);
      var CM = global.ContextMenu;
      if (CM && typeof CM.bind === 'function' && typeof CM.buildAgentChatItems === 'function') {
        CM.bind(row, function () {
          return CM.buildAgentChatItems({
            archived: archived,
            onOpen: function () {
              if (archived) call('onRestore', { id: item.id, open: true });
              else if (!locked()) call('onOpen', item.id);
            },
            onArchive: function () { call('onArchive', item.id); },
            onRestore: function () { call('onRestore', { id: item.id, open: false }); },
          });
        });
      }
      return row;
    }

    function render() {
      var view = typeof opts.getView === 'function' ? opts.getView() : null;
      if (!view) return;
      newBtn.classList.toggle('is-current', !!view.isDraft);
      listEl.textContent = '';
      view.groups.forEach(function (group) {
        var box = el('div', 'agent-chats-group');
        box.appendChild(el('div', 'agent-chats-group-title', group.label));
        group.chats.forEach(function (c) { box.appendChild(buildRow(c, false, view.currentId)); });
        listEl.appendChild(box);
      });
      archEl.textContent = '';
      view.archived.forEach(function (c) { archEl.appendChild(buildRow(c, true, view.currentId)); });
      // The toggle keeps its place when the list is empty (quieter, not gone): nothing next to it moves.
      archToggle.classList.toggle('is-empty', !view.archived.length);
      archToggle.disabled = !view.archived.length;
      archCount.textContent = view.archived.length ? String(view.archived.length) : '';
      var open = showArchived && view.archived.length > 0;
      archEl.hidden = !open;
      archToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      archChevron.className = 'ti ti-chevron-' + (open ? 'down' : 'right');
      note.hidden = view.persisted !== false;
      syncLock();
    }

    function syncLock() {
      var on = locked();
      host.classList.toggle('is-locked', on);
      if (on) host.setAttribute('title', LOCKED_TITLE);
      else host.removeAttribute('title');
    }

    newBtn.addEventListener('click', function () {
      if (locked()) return;
      call('onNew');
    });
    archToggle.addEventListener('click', function () {
      showArchived = !showArchived;
      render();
    });

    render();
    return { render: render, syncLock: syncLock };
  }

  global.AgentChatsUI = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
