/*
 * Role: makes the People and Places directories part of the entity system. Every person of the People directory
 * and every place of the Places directory has a matching entity (type Personne / Lieu) linked by
 * `entity.source = { kind: 'people' | 'places', id }`; the other way round, an entity that is a person or a place
 * gets a directory record, so the assistant (which reads the directories) knows what was created in Entities.
 *
 * Mirrored fields: name, aliases, and for a person email / phone / notes, for a place address / coordinates / notes.
 * Everything else a directory record holds (relation, roles, kind, Trello member…) stays in the directory, and
 * everything else an entity holds (links, other components, history) stays on the entity.
 *
 * Who wins: when the page loads, the directory wins ("pull"); when entities are saved, the entity wins ("push").
 * A record met for the first time (or an entity matched to it by name) is adopted with the record's values.
 * A linked record deleted from its directory leaves its entity in place, marked `gone`, and is never recreated.
 *
 * Usage: EntitiesDirectories.pull(t, schema, entities) -> Promise<{ schema, entities, changed }>
 *        EntitiesDirectories.push(t, schema, entities) -> Promise<{ entities, changed }>
 *        EntitiesDirectories.forget(t, entity) -> Promise<void>   (an entity was deleted)
 *        EntitiesDirectories.sync(schema, entities, dirs, mode) -> pure core, mode 'pull' | 'push'
 *
 * Contents: 1 mapping | 2 sync (pure) | 3 I/O
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }

  var KINDS = {
    people: { type: 'personne', key: 'people', list: 'people' },
    places: { type: 'place', key: 'places', list: 'places' },
  };

  /* ── 1. Mapping ──────────────────────────────────────────────────── */

  function norm(s) {
    return EM().normKey(s);
  }

  function isPerson(schema, e) {
    return EM().typeClosure(schema, e.types).indexOf('personne') >= 0;
  }
  function isPlace(schema, e) {
    return EM().naturesOf(schema, e).indexOf('place') >= 0;
  }
  function kindOf(schema, e) {
    if (isPerson(schema, e)) return 'people';
    if (isPlace(schema, e)) return 'places';
    return '';
  }

  /** The entity field paths that mirror a directory record, per kind. */
  var FIELDS = {
    people: [
      { path: 'personne.courriel', rec: 'email' },
      { path: 'personne.telephone', rec: 'phone' },
      { path: 'personne.notes', rec: 'notes' },
    ],
    places: [
      { path: 'adresse.adresse', rec: 'address' },
      { path: 'adresse.notes', rec: 'notes' },
    ],
  };

  function carries(schema, entity, path) {
    return !!EM().fieldOf(schema, path) && EM().componentIdsOf(schema, entity).indexOf(path.split('.')[0]) >= 0;
  }

  function getData(entity, path) {
    var p = path.split('.');
    var v = entity.data && entity.data[p[0]] ? entity.data[p[0]][p[1]] : undefined;
    return v === undefined || v === null ? '' : String(v);
  }

  function setData(entity, path, value) {
    var p = path.split('.');
    var data = Object.assign({}, entity.data);
    var comp = Object.assign({}, data[p[0]]);
    if (value === '' || value == null) delete comp[p[1]];
    else comp[p[1]] = value;
    if (Object.keys(comp).length) data[p[0]] = comp;
    else delete data[p[0]];
    return Object.assign({}, entity, { data: data });
  }

  function coordsOf(rec) {
    return rec.lat != null && rec.lng != null ? Number(rec.lat) + ', ' + Number(rec.lng) : '';
  }

  function parseCoords(text) {
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(text || ''));
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
  }

  /** The entity with the record's mirrored values. */
  function recordToEntity(schema, kind, entity, rec) {
    var next = Object.assign({}, entity, { name: rec.name, aliases: (rec.aliases || []).slice() });
    FIELDS[kind].forEach(function (f) {
      if (carries(schema, next, f.path)) next = setData(next, f.path, rec[f.rec] || '');
    });
    if (kind === 'places' && carries(schema, next, 'adresse.coordonnees')) next = setData(next, 'adresse.coordonnees', coordsOf(rec));
    return next;
  }

  /** The record with the entity's mirrored values (what the entity does not carry is left as it was). */
  function entityToRecord(schema, kind, entity, rec) {
    var next = Object.assign({}, rec, { name: entity.name, aliases: (entity.aliases || []).slice() });
    FIELDS[kind].forEach(function (f) {
      if (carries(schema, entity, f.path)) next[f.rec] = getData(entity, f.path);
    });
    if (kind === 'places' && carries(schema, entity, 'adresse.coordonnees')) {
      var g = parseCoords(getData(entity, 'adresse.coordonnees'));
      if (g) {
        next.lat = g.lat;
        next.lng = g.lng;
      } else {
        delete next.lat;
        delete next.lng;
      }
    }
    return next;
  }

  /* ── 2. Sync (pure) ──────────────────────────────────────────────── */

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * @param {object} dirs { people: record[], places: record[] }  (copied, never mutated)
   * @param {{max?: {people:number, places:number}}} [opts]
   * @returns {{entities:object[], people:object[], places:object[], entitiesChanged:boolean, directoriesChanged:{people:boolean,places:boolean}}}
   */
  function sync(schema, entities, dirs, mode, opts) {
    var max = (opts && opts.max) || {};
    var out = { people: (dirs.people || []).map(clone), places: (dirs.places || []).map(clone) };
    var list = entities.map(clone);
    var beforeEntities = JSON.stringify(list);
    var beforeDirs = { people: JSON.stringify(out.people), places: JSON.stringify(out.places) };

    function clone(x) {
      return JSON.parse(JSON.stringify(x));
    }
    function linked(kind, id) {
      return list.filter(function (e) { return e.source && e.source.kind === kind && e.source.id === id; })[0];
    }
    function indexOfEntity(e) {
      return list.indexOf(e);
    }

    Object.keys(KINDS).forEach(function (kind) {
      var recs = out[KINDS[kind].list];
      var classOf = kind === 'people' ? isPerson : isPlace;

      // 1. every record has an entity, linked or created
      recs.forEach(function (rec, ri) {
        var e = linked(kind, rec.id);
        var fresh = false;
        if (!e) {
          e = list.filter(function (x) {
            return !x.source && classOf(schema, x) && norm(x.name) === norm(rec.name);
          })[0];
          if (e) fresh = true;
        }
        if (!e) {
          try {
            e = EM().createEntity(schema, { name: rec.name, types: [KINDS[kind].type] });
          } catch (err) {
            return;
          }
          list.push(e);
          fresh = true;
        }
        var i = indexOfEntity(e);
        var next = Object.assign({}, e, { source: { kind: kind, id: rec.id } });
        if (fresh || mode === 'pull') next = recordToEntity(schema, kind, next, rec);
        else {
          var merged = entityToRecord(schema, kind, next, rec);
          if (!same(merged, rec)) recs[ri] = merged;
        }
        list[i] = next;
      });

      // 2. entities whose record vanished are kept, unlinked for good
      list.forEach(function (e, i) {
        if (!e.source || e.source.kind !== kind || e.source.gone) return;
        if (!recs.some(function (r) { return r.id === e.source.id; })) list[i] = Object.assign({}, e, { source: { kind: kind, id: e.source.id, gone: true } });
      });

      // 3. entities that are people / places without a record get one (push only: a pull must not write)
      if (mode !== 'push') return;
      list.forEach(function (e, i) {
        if (e.source || !classOf(schema, e)) return;
        if (kind === 'places' && isPerson(schema, e)) return;
        if (max[kind] && recs.length >= max[kind]) return;
        var id = (kind === 'people' ? 'person-' : 'place-') + e.id.replace(/[^a-z0-9]/gi, '').toLowerCase();
        var rec = entityToRecord(schema, kind, e, { id: id });
        recs.push(rec);
        list[i] = Object.assign({}, e, { source: { kind: kind, id: id } });
      });
    });

    var normalized = list
      .map(function (e) {
        var n = EM().normalizeEntity(e, schema);
        return n ? Object.assign(n, e.source ? { source: n.source || e.source } : {}) : null;
      })
      .filter(Boolean);
    return {
      entities: normalized,
      people: out.people,
      places: out.places,
      entitiesChanged: JSON.stringify(normalized) !== beforeEntities,
      directoriesChanged: {
        people: JSON.stringify(out.people) !== beforeDirs.people,
        places: JSON.stringify(out.places) !== beforeDirs.places,
      },
    };
  }

  /* ── 3. I/O ──────────────────────────────────────────────────────── */

  function dirsAvailable() {
    return !!(global.People && global.Places && global.EntitiesLibrary);
  }

  async function loadDirs(t) {
    var p = await global.People.load(t, { force: true });
    var l = await global.Places.load(t, { force: true });
    return { people: p.people, places: l.places, peopleDir: p, placesDir: l };
  }

  async function saveDirs(t, res, dirs) {
    if (res.directoriesChanged.people) await global.People.save(t, Object.assign({}, dirs.peopleDir, { people: res.people }));
    if (res.directoriesChanged.places) await global.Places.save(t, Object.assign({}, dirs.placesDir, { places: res.places }));
  }

  function limits() {
    return { max: { people: global.People.MAX_PEOPLE || 40, places: 0 } };
  }

  /** Directory -> entities, on page load. Never throws: a failure leaves the entities as they were. */
  async function pull(t, schema, entities) {
    var none = { schema: schema, entities: entities, changed: false };
    if (!dirsAvailable()) return none;
    try {
      var dirs = await loadDirs(t);
      var next = schema;
      if (dirs.people.length) next = global.EntitiesLibrary.ensureBridge(next, { people: true });
      else next = global.EntitiesLibrary.ensureBridge(next, {});
      var res = sync(next, entities, dirs, 'pull');
      var schemaChanged = !same(next, schema);
      return { schema: next, entities: res.entities, changed: res.entitiesChanged || schemaChanged };
    } catch (err) {
      console.error('EntitiesDirectories.pull failed', err);
      return none;
    }
  }

  /** Entities -> directories, before saving. Returns the entities with their `source` links. */
  async function push(t, schema, entities) {
    var none = { entities: entities, changed: false };
    if (!dirsAvailable()) return none;
    try {
      var dirs = await loadDirs(t);
      var res = sync(schema, entities, dirs, 'push', limits());
      await saveDirs(t, res, dirs);
      return { entities: res.entities, changed: res.entitiesChanged };
    } catch (err) {
      console.error('EntitiesDirectories.push failed', err);
      return none;
    }
  }

  /** An entity linked to a record was deleted: the record goes too. */
  async function forget(t, entity) {
    if (!dirsAvailable() || !entity || !entity.source || entity.source.gone) return;
    try {
      if (entity.source.kind === 'people') {
        var p = await global.People.load(t, { force: true });
        await global.People.save(t, Object.assign({}, p, { people: p.people.filter(function (r) { return r.id !== entity.source.id; }) }));
      } else if (entity.source.kind === 'places') {
        var l = await global.Places.load(t, { force: true });
        await global.Places.save(t, Object.assign({}, l, { places: l.places.filter(function (r) { return r.id !== entity.source.id; }) }));
      }
    } catch (err) {
      console.error('EntitiesDirectories.forget failed', err);
    }
  }

  global.EntitiesDirectories = { sync: sync, pull: pull, push: push, forget: forget, kindOf: kindOf };
})(typeof window !== 'undefined' ? window : this);
