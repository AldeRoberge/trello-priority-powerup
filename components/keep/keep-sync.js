/*
 * Role: two-way sync between the notes on this device (KeepStore) and the Documents cards in Trello.
 * Edits are written locally first (instant, works offline) and marked dirty; run() then sends them
 * and pulls what changed elsewhere. When a note changed on both sides, nothing is lost: the remote
 * version stays and the local one is saved as a copy "(conflit)".
 * Needs window.KeepModel. Exposes window.KeepSync.
 *
 *   api = { list(), create(title, body, props), save(note), rename(id, title), remove(id) }
 *   (trelloApi(t) builds one on DocsTrello)
 */
(function (global) {
  'use strict';

  function KM() {
    return global.KeepModel;
  }

  function copyOf(note) {
    return { title: note.title, body: note.body, pin: !!note.pin, arch: !!note.arch, color: note.color || '' };
  }

  function clean(note) {
    return Object.assign({}, note, { base: copyOf(note), dirty: false, deleted: false });
  }

  function isLocalId(id) {
    return String(id).indexOf('local-') === 0;
  }

  function newId() {
    return 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function create(opts) {
    var store = opts.store;
    var api = opts.api;
    var now = opts.now || function () { return new Date().toISOString(); };
    var running = null;
    var again = false;

    /** Saves a note edit on this device. A new note has no id yet. */
    async function save(note) {
      var prev = note.id ? await store.get(note.id) : null;
      var rec = Object.assign({}, KM().blank(note.id || newId()), prev || {}, note);
      rec.updatedAt = now();
      rec.dirty = true;
      rec.deleted = false;
      if (!prev) rec.base = null;
      await store.put(rec);
      return rec;
    }

    async function remove(id) {
      var rec = await store.get(id);
      if (!rec) return;
      if (isLocalId(id)) await store.remove(id);
      else await store.put(Object.assign({}, rec, { deleted: true }));
    }

    /** A fresh remote note from a local one; the local record is replaced by the real one. */
    async function push(rec, title) {
      var made = await api.create(title == null ? rec.title : title, rec.body, KM().propsFor(rec));
      var note = KM().fromDoc(made);
      note.props = made.props || note.props;
      note.title = title == null ? rec.title : title;
      return note;
    }

    /** The stored record if the user edited it (or deleted it) while a pass was talking to Trello, else null. */
    async function editedSince(rec) {
      var cur = await store.get(rec.id);
      if (!cur) return null;
      return cur.updatedAt !== rec.updatedAt || !!cur.dirty !== !!rec.dirty || !!cur.deleted !== !!rec.deleted ? cur : null;
    }

    /** Stores what Trello now has, unless the user edited the note meanwhile: that edit is kept, still unsent. */
    async function putRemote(rec, remoteNote) {
      var cur = await editedSince(rec);
      if (cur) {
        await store.put(Object.assign({}, cur, { rev: remoteNote.rev, base: copyOf(remoteNote), props: remoteNote.props, dirty: true }));
        return false;
      }
      await store.put(clean(remoteNote));
      return true;
    }

    async function pass() {
      var remote;
      try {
        remote = await api.list();
      } catch (e) {
        return { ok: false, offline: true, pending: await store.pending(), error: String((e && e.message) || e) };
      }
      var byId = new Map(remote.map(function (d) { return [String(d.id), d]; }));
      var recs = await store.all();
      var seen = new Set();
      var errors = 0;
      for (var i = 0; i < recs.length; i++) {
        var rec = recs[i];
        var r = byId.get(rec.id);
        if (r) seen.add(rec.id);
        try {
          if (rec.deleted) {
            if (r) await api.remove(rec.id);
            await store.remove(rec.id);
            continue;
          }
          if (isLocalId(rec.id)) {
            if (KM().isEmpty(rec)) {
              await store.remove(rec.id);
              continue;
            }
            var made = await push(rec);
            var editedMeanwhile = await editedSince(rec);
            await store.remove(rec.id);
            if (editedMeanwhile) {
              await store.put(Object.assign({}, made, copyOf(editedMeanwhile), {
                base: copyOf(made), dirty: true, deleted: !!editedMeanwhile.deleted, updatedAt: editedMeanwhile.updatedAt,
              }));
            } else {
              await store.put(clean(Object.assign({}, made, { updatedAt: made.updatedAt || now() })));
            }
            seen.add(made.id);
            continue;
          }
          if (!r) {
            if (!rec.dirty) {
              await store.remove(rec.id); // deleted elsewhere
              continue;
            }
            var again2 = await push(rec); // edited here, deleted there: keep the edit
            var edited2 = await editedSince(rec);
            await store.remove(rec.id);
            if (edited2) {
              await store.put(Object.assign({}, again2, copyOf(edited2), {
                base: copyOf(again2), dirty: true, deleted: !!edited2.deleted, updatedAt: edited2.updatedAt,
              }));
            } else {
              await store.put(clean(again2));
            }
            seen.add(again2.id);
            continue;
          }
          var theirs = KM().fromDoc(r);
          if (!rec.dirty) {
            if (KM().snapshot(rec) !== KM().snapshot(theirs) || rec.rev !== theirs.rev || rec.updatedAt !== theirs.updatedAt) {
              if (!(await editedSince(rec))) await store.put(clean(theirs));
            }
            continue;
          }
          var verdict = KM().resolve(rec.base, rec, theirs);
          if (verdict === 'same' || verdict === 'pull') {
            await putRemote(rec, theirs);
          } else if (verdict === 'push') {
            if (rec.title !== theirs.title) await api.rename(rec.id, rec.title || '');
            var saved = await api.save(Object.assign({}, rec, { rev: theirs.rev, props: Object.assign({}, theirs.props) }));
            await putRemote(rec, Object.assign({}, rec, { rev: saved.rev, updatedAt: saved.updatedAt || now(), props: theirs.props }));
          } else {
            var copy = await push(rec, (rec.title || 'Sans titre') + ' (conflit)');
            await store.put(clean(copy));
            await putRemote(rec, theirs);
            seen.add(copy.id);
          }
        } catch (e) {
          errors++; // stays dirty, tried again on the next pass
        }
      }
      remote.forEach(function (d) {
        if (seen.has(String(d.id))) return;
        seen.add(String(d.id));
      });
      for (var j = 0; j < remote.length; j++) {
        var d = remote[j];
        if (recs.some(function (x) { return x.id === String(d.id); })) continue;
        if (await store.get(String(d.id))) continue; // created here while the pass was running
        await store.put(clean(KM().fromDoc(d)));
      }
      return { ok: errors === 0, offline: false, pending: await store.pending(), errors: errors };
    }

    /** One pass at a time; a call during a pass schedules exactly one more. */
    function run() {
      if (running) {
        again = true;
        return running;
      }
      running = (async function () {
        var result;
        do {
          again = false;
          result = await pass();
        } while (again && !result.offline);
        return result;
      })().finally(function () { running = null; });
      return running;
    }

    return { save: save, remove: remove, run: run, newId: newId };
  }

  /** The Documents cards as the sync's remote. `t` is any object DocsTrello accepts (see keep-auth.js). */
  function trelloApi(t) {
    var DT = global.DocsTrello;
    return {
      list: function () { return DT.listDocs(t); },
      create: function (title, body, props) { return DT.createDoc(t, title || 'Sans titre', body, { props: props }); },
      rename: function (id, title) { return DT.renameDoc(t, id, title || 'Sans titre'); },
      save: function (note) {
        return DT.saveDoc(t, { id: note.id, body: note.body, rev: note.rev, props: KM().propsFor(note) });
      },
      remove: function (id) { return DT.deleteDoc(t, id); },
    };
  }

  global.KeepSync = { create: create, trelloApi: trelloApi, isLocalId: isLocalId };
})(typeof window !== 'undefined' ? window : globalThis);
