/*
 * Role: Trello I/O of the Triage "Document". Reads the board context the AI needs (people, places, labels,
 * entities), then writes a reviewed plan (see triage-doc-model.js) through the same modules as the rest of
 * the app: cards in the triage list (TableTrello), description / members / labels in one REST write
 * (PriorityTrello.restPutCard), urgency / places / contacts (saveCardInputsById), the day (DashboardTrello.planDay),
 * subtasks and estimates (CompletionTrello), images as attachments (DashboardTrello.attachFile) and the project
 * links in the Mindmap goal map (MindmapGoalsTrello).
 *
 *   TriageDocTrello.loadContext(t, { projects }) -> Promise<raw context for TriageDocModel.contextOf>
 *   TriageDocTrello.create(t, plan, o) -> Promise<{ created, failed, madeProjects, goalsSaved }>
 *     o: { lists, goals, files: { editorImageId: File }, context, onProgress(done, total, title) }
 *     A step that fails never loses the card: it lands in `failed`. A task keeps `createdId` once written,
 *     so running create again after a failure only writes what is missing.
 *   TriageDocTrello.undo(t, result) -> Promise<void>   archives the cards and takes the projects it made back
 *
 * Pure helpers (itemsOf, patchesOf) are exported for the unit tests.
 */
(function (global) {
  'use strict';

  function DT() { return global.DashboardTrello; }
  function TT() { return global.TableTrello; }
  function PT() { return global.PriorityTrello; }
  function PU() { return global.PriorityUI; }
  function CT() { return global.CompletionTrello; }
  function GG() { return global.MindmapGoalsTrello; }

  function fold(s) {
    var t = String(s == null ? '' : s).toLowerCase();
    if (typeof t.normalize === 'function') t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  function soft(p, fallback) {
    return Promise.resolve(p).then(function (v) { return v; }, function () { return fallback; });
  }

  /* ── Pure ──────────────────────────────────────────────────────── */

  /** Subtasks of a plan task -> the items CompletionTrello stores (ids are given on normalize). */
  function itemsOf(task) {
    return (task.subtasks || []).map(function (s) {
      var item = { text: s.text, progress: 0 };
      if (s.estimate) item.estimatedMinutes = s.estimate;
      if (s.items && s.items.length) {
        item.items = s.items.map(function (n) { return { text: n.text, progress: 0 }; });
      }
      return item;
    });
  }

  /**
   * What one task writes besides its name, from the board catalogs.
   *   card:   { desc, idMembers, idLabels }  one REST PUT
   *   inputs: { empressement, customAssignees, places }  one saveCardInputsById
   * `catalog`: { customs: [entry by id], places: [ref by fold(name)] } (entries created for this run included).
   */
  function patchesOf(task, catalog) {
    var card = {};
    var inputs = {};
    if (task.desc) card.desc = task.desc;
    var members = task.people.filter(function (p) { return p.kind === 'member' && p.id; }).map(function (p) { return p.id; });
    if (members.length) card.idMembers = members.join(',');
    var labels = task.labels.map(function (l) { return l.id; }).filter(Boolean);
    if (labels.length) card.idLabels = labels.join(',');
    var customs = [];
    task.people.forEach(function (p) {
      if (p.kind === 'member') return;
      var entry = (p.id && catalog.customs[p.id]) || catalog.customsByName[fold(p.name)];
      if (entry && customs.indexOf(entry) < 0) customs.push(entry);
    });
    if (customs.length) inputs.customAssignees = customs;
    var place = task.places[0];
    if (place) {
      var ref = (place.id && catalog.placesById[place.id]) || catalog.placesByName[fold(place.name)];
      if (ref) inputs.places = { at: { id: ref.id, name: ref.name } };
    }
    if (task.urgency) inputs.empressement = task.urgency;
    return { card: card, inputs: inputs };
  }

  /* ── Context ───────────────────────────────────────────────────── */

  /**
   * The people, places, labels and entities of the board, for the prompt and for matching names.
   * Every source is best effort: a board without entities or contacts still works.
   */
  function loadContext(t, o) {
    o = o || {};
    var pt = PT();
    var et = global.EntitiesTrello;
    var de = global.DocsEntities;
    var tasks = [
      pt && pt.getBoardMembers ? soft(pt.getBoardMembers(t), []) : Promise.resolve([]),
      pt && pt.getCustomAssigneeCatalog ? soft(pt.getCustomAssigneeCatalog(t), []) : Promise.resolve([]),
      pt && pt.getPlaceCatalog ? soft(pt.getPlaceCatalog(t), []) : Promise.resolve([]),
      pt && pt.getBoardLabels ? soft(pt.getBoardLabels(t), []) : Promise.resolve([]),
      et && typeof et.load === 'function' && de && typeof de.catalogOf === 'function'
        ? soft(et.load(t).then(function (s) { return de.catalogOf(s.schema, s.entities); }), [])
        : Promise.resolve([]),
    ];
    return Promise.all(tasks).then(function (r) {
      return { projects: o.projects || [], members: r[0] || [], customAssignees: r[1] || [], places: r[2] || [], labels: r[3] || [], entities: r[4] || [] };
    });
  }

  /* ── Catalogs of new people and places ─────────────────────────── */

  /** Adds the people and places the plan names and the board does not know yet, saved once for the whole run. */
  function prepareCatalog(t, tasks) {
    var pt = PT();
    var pu = PU();
    return Promise.all([
      pt && pt.getCustomAssigneeCatalog ? soft(pt.getCustomAssigneeCatalog(t), []) : Promise.resolve([]),
      pt && pt.getPlaceCatalog ? soft(pt.getPlaceCatalog(t), []) : Promise.resolve([]),
    ]).then(function (r) {
      var customs = (r[0] || []).slice();
      var places = (r[1] || []).slice();
      var addedCustoms = false;
      var addedPlaces = false;
      tasks.forEach(function (task) {
        task.people.forEach(function (p) {
          if (p.kind === 'member') return;
          var known = customs.filter(function (c) { return String(c.id) === p.id || fold(c.name) === fold(p.name); })[0];
          if (known) return;
          var entry = pu && pu.createCustomAssignee ? pu.createCustomAssignee({ name: p.name }) : null;
          if (entry) { customs.push(entry); addedCustoms = true; }
        });
        task.places.slice(0, 1).forEach(function (pl) {
          var known = places.filter(function (x) { return String(x.id) === pl.id || fold(x.name) === fold(pl.name); })[0];
          if (known) return;
          var ref = pu && pu.createPlaceRef ? pu.createPlaceRef(pl.name) : null;
          if (ref) { places.push(ref); addedPlaces = true; }
        });
      });
      var saves = [];
      if (addedCustoms && pt && pt.saveCustomAssigneeCatalog) saves.push(soft(pt.saveCustomAssigneeCatalog(t, customs).then(function (saved) { if (saved) customs = saved; })));
      if (addedPlaces && pt && pt.savePlaceCatalog) saves.push(soft(pt.savePlaceCatalog(t, places).then(function (saved) { if (saved) places = saved; })));
      return Promise.all(saves).then(function () {
        var catalog = { customs: {}, customsByName: {}, placesById: {}, placesByName: {} };
        customs.forEach(function (c) { catalog.customs[String(c.id)] = c; catalog.customsByName[fold(c.name)] = c; });
        places.forEach(function (p) { catalog.placesById[String(p.id)] = p; catalog.placesByName[fold(p.name)] = p; });
        return catalog;
      });
    });
  }

  /* ── Write ─────────────────────────────────────────────────────── */

  function writeTask(t, task, list, catalog, files, failed) {
    var tt = TT();
    var pt = PT();
    var ct = CT();
    var dt = DT();
    var label = '« ' + task.title + ' »';
    return tt.createRow(t, task.title, list.id).then(function (res) {
      var cardId = res && res.cardId;
      if (!cardId) throw new Error('carte ' + label + ' non créée');
      task.createdId = cardId;
      var patches = patchesOf(task, catalog);
      var steps = Promise.resolve();
      function step(what, fn) {
        steps = steps.then(fn).then(function (r) {
          if (r && r.ok === false) throw new Error(r.reason || 'refusé');
        }).catch(function (err) {
          failed.push(what + ' de ' + label + (err && err.message ? ' (' + err.message + ')' : ''));
        });
      }
      if (Object.keys(patches.card).length) step('détails', function () { return pt.restPutCard(t, cardId, patches.card); });
      if (Object.keys(patches.inputs).length) step('priorité et personnes', function () { return pt.saveCardInputsById(t, cardId, patches.inputs); });
      if (task.due) step('jour', function () { return dt.planDay(t, cardId, task.due); });
      if (task.subtasks.length && ct) {
        step('sous-tâches', function () {
          return ct.saveCardCompletionById(t, cardId, ct.normalizeCompletionData({ items: itemsOf(task) }));
        });
      } else if (task.estimate) {
        step('durée', function () { return dt.saveEstimate(t, cardId, task.estimate); });
      }
      task.imageIds.forEach(function (id) {
        var file = files && files[id];
        if (file) step('image', function () { return dt.attachFile(t, cardId, file); });
      });
      return steps.then(function () { return cardId; });
    });
  }

  /** The goal map with the new projects and the links of the created cards (a task belongs to one project). */
  function withProjects(goals, made, links) {
    var nodes = ((goals && goals.nodes) || []).slice();
    var have = Object.create(null);
    nodes.forEach(function (n) { have[n.id] = true; });
    made.forEach(function (m) {
      if (have[m.nodeId]) return;
      var node = { id: m.nodeId, level: 'project', name: m.name };
      if (m.icon) node.icon = m.icon;
      nodes.push(node);
    });
    var out = { nodes: nodes, links: ((goals && goals.links) || []).slice() };
    var WO = global.WorkOS;
    links.forEach(function (l) {
      if (WO && WO.withTaskProject) out = WO.withTaskProject(out, l.taskId, l.projectId);
      else out.links.push({ from: l.taskId, to: l.projectId });
    });
    return out;
  }

  function saveGoals(t, goalsBase, made, links) {
    var gg = GG();
    if (!gg || typeof gg.save !== 'function') return Promise.reject(new Error('Projets indisponibles ici.'));
    function attempt(base, again) {
      return gg.save(t, withProjects(base, made, links)).catch(function (err) {
        if (!again || !err || err.reason !== 'conflict' || typeof gg.load !== 'function') throw err;
        return gg.load(t).then(function (fresh) {
          // A project of the same name made elsewhere meanwhile is reused.
          var byName = Object.create(null);
          ((fresh && fresh.nodes) || []).forEach(function (n) { if (n.level === 'project') byName[fold(n.name)] = n.id; });
          var remap = Object.create(null);
          var keep = made.filter(function (m) {
            if (byName[fold(m.name)]) { remap[m.nodeId] = byName[fold(m.name)]; return false; }
            return true;
          });
          links.forEach(function (l) { if (remap[l.projectId]) l.projectId = remap[l.projectId]; });
          made = keep;
          return attempt(fresh, false);
        });
      });
    }
    return attempt(goalsBase, true).then(function (saved) { return { saved: saved, made: made }; });
  }

  function create(t, plan, o) {
    o = o || {};
    var tasks = (plan.tasks || []).filter(function (x) { return x.include && !x.createdId; });
    var list = DT() && DT().listFor ? DT().listFor(o.lists || [], ['triage']) : null;
    if (!list) {
      var noList = new Error('Aucune liste de triage sur ce tableau.');
      noList.reason = 'no-triage-list';
      return Promise.reject(noList);
    }
    var result = { created: [], failed: [], madeProjects: [], goalsBefore: o.goals || { nodes: [], links: [] }, goalsSaved: false };
    // Cards made by an earlier try of the same plan count too.
    (plan.tasks || []).forEach(function (x) { if (x.createdId) result.created.push({ taskId: x.id, cardId: x.createdId, title: x.title }); });
    var done = 0;
    var gg = GG();
    var madeNodes = [];
    var nodeOf = Object.create(null); // plan project id -> goal node id
    var existingProject = Object.create(null);
    (plan.projects || []).forEach(function (p) {
      if (p.existingId) { nodeOf[p.id] = p.existingId; existingProject[p.id] = true; }
    });
    tasks.forEach(function (x) {
      var p = (plan.projects || []).filter(function (q) { return q.id === x.project; })[0];
      if (!p || nodeOf[p.id] || !p.include) return;
      nodeOf[p.id] = gg && typeof gg.newId === 'function' ? gg.newId() : 'g:' + Date.now().toString(36) + p.id;
      madeNodes.push({ nodeId: nodeOf[p.id], name: p.name });
    });
    var links = [];

    return prepareCatalog(t, tasks).then(function (catalog) {
      var chain = Promise.resolve();
      tasks.forEach(function (task) {
        chain = chain.then(function () {
          return writeTask(t, task, list, catalog, o.files || {}, result.failed).then(function (cardId) {
            result.created.push({ taskId: task.id, cardId: cardId, title: task.title });
            if (task.project && nodeOf[task.project]) links.push({ taskId: cardId, projectId: nodeOf[task.project] });
          }, function (err) {
            result.failed.push((err && err.message) || ('« ' + task.title + ' »'));
          }).then(function () {
            done++;
            if (typeof o.onProgress === 'function') o.onProgress(done, tasks.length, task.title);
          });
        });
      });
      return chain;
    }).then(function () {
      if (!links.length) return null;
      // Only the projects some created card sits under are written.
      var usedNode = Object.create(null);
      links.forEach(function (l) { usedNode[l.projectId] = true; });
      var madeUsed = madeNodes.filter(function (m) { return usedNode[m.nodeId]; });
      var ready = global.ProjectIcon && typeof global.ProjectIcon.decorate === 'function'
        ? global.ProjectIcon.decorate(t, madeUsed)
        : Promise.resolve(madeUsed);
      return ready.then(function (made) {
        return saveGoals(t, result.goalsBefore, made, links);
      }).then(function (r) {
        result.goalsSaved = true;
        result.madeProjects = r.made;
        result.goalsAfter = r.saved;
      }, function (err) {
        result.failed.push('projets (' + ((err && (err.reason || err.message)) || 'erreur') + ')');
      });
    }).then(function () { return result; });
  }

  /** Takes a creation back: the cards are archived (Trello keeps them) and the projects it made leave the goal map. */
  function undo(t, result) {
    var tt = TT();
    var gg = GG();
    var chain = Promise.resolve();
    (result.created || []).forEach(function (c) {
      chain = chain.then(function () { return soft(tt.archiveCard(t, c.cardId)); });
    });
    var made = (result.madeProjects || []).map(function (m) { return m.nodeId; });
    var cards = (result.created || []).map(function (c) { return c.cardId; });
    if (!result.goalsSaved || !gg || typeof gg.load !== 'function' || typeof gg.save !== 'function') return chain;
    return chain.then(function () {
      return gg.load(t).then(function (cur) {
        var gone = Object.create(null);
        made.forEach(function (id) { gone[id] = true; });
        cards.forEach(function (id) { gone[id] = true; });
        var next = {
          nodes: (cur.nodes || []).filter(function (n) { return !gone[n.id]; }),
          links: (cur.links || []).filter(function (l) { return !gone[l.from] && !gone[l.to]; }),
        };
        return gg.save(t, next);
      });
    }).then(function () {}, function () { /* the cards are archived; a link left behind points at an archived card */ });
  }

  global.TriageDocTrello = {
    loadContext: loadContext,
    create: create,
    undo: undo,
    itemsOf: itemsOf,
    patchesOf: patchesOf,
  };
})(typeof window !== 'undefined' ? window : this);
