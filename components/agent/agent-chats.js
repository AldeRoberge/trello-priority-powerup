/*
 * Role: the Assistant's conversations, ChatGPT style. The Assistant page opens on a fresh conversation;
 * the earlier ones are listed on the left and can be reopened, archived and restored.
 *
 * Where they live: Trello plugin data is capped at 4096 chars per scope (the old single chat kept 16
 * short messages in 2 KB), far too small for several conversations. They are kept in this browser's
 * localStorage, one key per board, so opening the Assistant is instant and needs no Trello call. If the
 * browser refuses storage (private window, quota) they last until the page is closed.
 *
 * Pure model + a small controller, no DOM (the list is components/agent/agent-chats-ui.js):
 *   AgentChats.createController({ storage, key, now }) → { current, startNew, open, saveMessages,
 *     archive, restore, view, importLegacy, persisted, onChange }
 *   AgentChats.groupByDay(chats, now), AgentChats.titleFrom(messages), AgentChats.keyFor(boardId)
 *
 * A conversation is { id, title, createdAt, updatedAt, archived, messages: [{ role, content, selfPrompt? }] }.
 * A new conversation is a draft: it is not stored (nor listed) until it has a message.
 */
(function (global) {
  'use strict';

  var VERSION = 1;
  var KEY_PREFIX = 'trello-priority-powerup/assistant-chats/';
  var MAX_CHATS = 60;
  var MAX_MESSAGES = 200;
  var MAX_CONTENT = 8000;
  var MAX_TITLE = 48;
  var DAY_MS = 86400000;

  function clean(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function keyFor(boardId) {
    return KEY_PREFIX + (clean(boardId) || 'board');
  }

  function newId(now) {
    return 'c' + Math.floor(now).toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function normalizeMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : '';
    var content = String(raw.content == null ? '' : raw.content).trim().slice(0, MAX_CONTENT);
    if (!role || !content) return null;
    var out = { role: role, content: content };
    if (raw.selfPrompt) out.selfPrompt = true;
    return out;
  }

  function normalizeMessages(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (m) {
      var n = normalizeMessage(m);
      if (n) out.push(n);
    });
    return out.length > MAX_MESSAGES ? out.slice(out.length - MAX_MESSAGES) : out;
  }

  /** First thing the user said, cut at a word boundary: the title of the conversation. */
  function titleFrom(messages) {
    var list = Array.isArray(messages) ? messages : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || m.role !== 'user' || m.selfPrompt) continue;
      var text = clean(m.content);
      if (!text) continue;
      if (text.length <= MAX_TITLE) return text;
      var cut = text.slice(0, MAX_TITLE);
      var space = cut.lastIndexOf(' ');
      if (space > MAX_TITLE * 0.5) cut = cut.slice(0, space);
      return cut.replace(/[\s,.;:!?\-]+$/, '') + '…';
    }
    return '';
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : fallback;
  }

  function normalizeChat(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    var id = clean(raw.id).slice(0, 40);
    var messages = normalizeMessages(raw.messages);
    if (!id || !messages.length) return null;
    var updatedAt = num(raw.updatedAt, now);
    return {
      id: id,
      title: titleFrom(messages) || clean(raw.title).slice(0, MAX_TITLE + 1),
      createdAt: num(raw.createdAt, updatedAt),
      updatedAt: updatedAt,
      archived: !!raw.archived,
      messages: messages,
    };
  }

  function byRecent(a, b) {
    return b.updatedAt - a.updatedAt;
  }

  /** Over the cap, archived conversations go first (oldest first), then the oldest active ones. */
  function prune(chats) {
    var list = chats.slice().sort(byRecent);
    while (list.length > MAX_CHATS) {
      var drop = -1;
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].archived) { drop = i; break; }
      }
      list.splice(drop >= 0 ? drop : list.length - 1, 1);
    }
    return list;
  }

  function emptyStore() {
    return { version: VERSION, legacyDone: false, chats: [] };
  }

  function normalizeStore(raw, now) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var seen = Object.create(null);
    var chats = [];
    (Array.isArray(src.chats) ? src.chats : []).forEach(function (c) {
      var n = normalizeChat(c, now);
      if (!n || seen[n.id]) return;
      seen[n.id] = true;
      chats.push(n);
    });
    return { version: VERSION, legacyDone: !!src.legacyDone, chats: prune(chats) };
  }

  /**
   * Buckets for the list, newest first: Aujourd’hui / Hier / 7 derniers jours / 30 derniers jours / Plus ancien.
   * Only the buckets that have a conversation are returned.
   */
  function groupByDay(chats, now) {
    var t = typeof now === 'number' ? now : Date.now();
    var start = new Date(t);
    start.setHours(0, 0, 0, 0);
    var today = start.getTime();
    var buckets = [
      { key: 'today', label: 'Aujourd’hui', from: today, chats: [] },
      { key: 'yesterday', label: 'Hier', from: today - DAY_MS, chats: [] },
      { key: 'week', label: '7 derniers jours', from: today - 7 * DAY_MS, chats: [] },
      { key: 'month', label: '30 derniers jours', from: today - 30 * DAY_MS, chats: [] },
      { key: 'older', label: 'Plus ancien', from: -Infinity, chats: [] },
    ];
    (Array.isArray(chats) ? chats : []).slice().sort(byRecent).forEach(function (c) {
      for (var i = 0; i < buckets.length; i++) {
        if (c.updatedAt >= buckets[i].from) { buckets[i].chats.push(c); return; }
      }
    });
    return buckets
      .filter(function (b) { return b.chats.length; })
      .map(function (b) { return { key: b.key, label: b.label, chats: b.chats }; });
  }

  function memoryStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
    };
  }

  /** localStorage when the browser lets this page use it, else null. */
  function browserStorage() {
    try {
      var s = global.localStorage;
      if (!s) return null;
      var probe = KEY_PREFIX + 'probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }

  function createController(opts) {
    opts = opts || {};
    var browser = opts.storage ? null : browserStorage();
    var storage = opts.storage || browser || memoryStorage();
    var key = opts.key || keyFor('board');
    var clock = typeof opts.now === 'function' ? opts.now : Date.now;
    var listeners = [];
    var saved = !!(opts.storage || browser);
    var store = read();
    var draft = blank();
    var currentId = draft.id;

    function read() {
      try {
        var raw = storage.getItem(key);
        return normalizeStore(raw ? JSON.parse(raw) : null, clock());
      } catch (e) {
        return emptyStore();
      }
    }

    /** Writes the store; on a refusal (quota) the oldest conversations are dropped and the write retried. */
    function write() {
      for (var attempt = 0; attempt < 4; attempt++) {
        try {
          storage.setItem(key, JSON.stringify(store));
          saved = true;
          return true;
        } catch (e) {
          if (store.chats.length < 2) break;
          store.chats = store.chats.slice(0, Math.floor(store.chats.length / 2)); // newest half
        }
      }
      saved = false;
      return false;
    }

    function blank() {
      var now = clock();
      return { id: newId(now), title: '', createdAt: now, updatedAt: now, archived: false, messages: [] };
    }

    function find(id) {
      for (var i = 0; i < store.chats.length; i++) if (store.chats[i].id === id) return store.chats[i];
      return null;
    }

    function emit() {
      listeners.slice().forEach(function (fn) {
        try { fn(); } catch (e) { /* a broken listener must not stop the others */ }
      });
    }

    function current() {
      return find(currentId) || (draft.id === currentId ? draft : blank());
    }

    /** A new, empty conversation. Asking again while the current one is still empty changes nothing. */
    function startNew() {
      if (!find(currentId) && draft.id === currentId) return draft;
      draft = blank();
      currentId = draft.id;
      emit();
      return draft;
    }

    /** Opens a stored conversation (an archived one comes back to the list first). */
    function open(id) {
      var chat = find(id);
      if (!chat) return null;
      if (chat.archived) {
        chat.archived = false;
        write();
      }
      currentId = chat.id;
      emit();
      return chat;
    }

    /** Stores the messages of the conversation on screen (called after every exchange). */
    function saveMessages(messages) {
      var msgs = normalizeMessages(messages);
      var existing = find(currentId);
      if (!msgs.length) {
        if (existing) {
          store.chats = store.chats.filter(function (c) { return c !== existing; });
          draft = { id: currentId, title: '', createdAt: clock(), updatedAt: clock(), archived: false, messages: [] };
          write();
          emit();
        }
        return draft;
      }
      var now = clock();
      if (existing && JSON.stringify(existing.messages) === JSON.stringify(msgs)) return existing;
      var chat = {
        id: currentId,
        title: titleFrom(msgs) || (existing && existing.title) || '',
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
        archived: false,
        messages: msgs,
      };
      store.chats = prune(store.chats.filter(function (c) { return c.id !== chat.id; }).concat([chat]));
      write();
      emit();
      return chat;
    }

    /** Archives a stored conversation. When it was the one on screen, a fresh one takes its place. */
    function archive(id) {
      var chat = find(id);
      if (!chat || chat.archived) return { ok: false, wasCurrent: false };
      chat.archived = true;
      write();
      var wasCurrent = chat.id === currentId;
      if (wasCurrent) {
        draft = blank();
        currentId = draft.id;
      }
      emit();
      return { ok: true, wasCurrent: wasCurrent };
    }

    function restore(id) {
      var chat = find(id);
      if (!chat || !chat.archived) return false;
      chat.archived = false;
      write();
      emit();
      return true;
    }

    function summary(c) {
      return { id: c.id, title: c.title || 'Nouvelle conversation', updatedAt: c.updatedAt, archived: c.archived };
    }

    /** What the list shows: active conversations grouped by day, then the archived ones. */
    function view() {
      var active = [];
      var archived = [];
      store.chats.forEach(function (c) { (c.archived ? archived : active).push(summary(c)); });
      return {
        currentId: currentId,
        isDraft: !find(currentId),
        persisted: saved,
        groups: groupByDay(active, clock()),
        archived: archived.sort(byRecent),
      };
    }

    /**
     * Carries over the single conversation the old Assistant kept in Trello plugin data, once.
     * Returns the new conversation, or null when there was nothing to carry or it was already done.
     */
    function importLegacy(legacy) {
      if (store.legacyDone) return null;
      store.legacyDone = true;
      var msgs = normalizeMessages(legacy && legacy.messages);
      var chat = null;
      if (msgs.length) {
        var at = Date.parse(legacy && legacy.updatedAt);
        chat = {
          id: newId(clock()),
          title: titleFrom(msgs),
          createdAt: isFinite(at) ? at : clock(),
          updatedAt: isFinite(at) ? at : clock(),
          archived: false,
          messages: msgs,
        };
        store.chats = prune(store.chats.concat([chat]));
      }
      write();
      emit();
      return chat;
    }

    return {
      current: current,
      startNew: startNew,
      open: open,
      saveMessages: saveMessages,
      archive: archive,
      restore: restore,
      view: view,
      importLegacy: importLegacy,
      legacyPending: function () { return !store.legacyDone; },
      persisted: function () { return saved; },
      onChange: function (fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
      },
    };
  }

  global.AgentChats = {
    createController: createController,
    groupByDay: groupByDay,
    titleFrom: titleFrom,
    keyFor: keyFor,
    normalizeStore: normalizeStore,
    normalizeChat: normalizeChat,
    MAX_CHATS: MAX_CHATS,
    MAX_TITLE: MAX_TITLE,
  };
})(typeof window !== 'undefined' ? window : this);
