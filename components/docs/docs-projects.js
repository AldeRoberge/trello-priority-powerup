/**
 * Role: a project is a document, and each of its tasks is a child of that document.
 * Pure. Reads the goal map (Mindmap goals) and the document list. Does not call Trello.
 * Exposes window.DocsProjects (no bundler).
 *
 *   plan(goals, docs, names) → what to create, rename and nest
 *   parentEdits(idx, docs, plan) → folder-index parent links to set or clear
 */
(function (global) {
  'use strict';

  function cleanName(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function indexDocs(docs) {
    var projectDoc = Object.create(null);
    var taskDoc = Object.create(null);
    (docs || []).forEach(function (d) {
      if (!d || !d.id || !d.subject) return;
      if (d.subject.k === 'project' && !projectDoc[d.subject.id]) projectDoc[d.subject.id] = d;
      if (d.subject.k === 'task' && !taskDoc[d.subject.id]) taskDoc[d.subject.id] = d;
    });
    return { projectDoc: projectDoc, taskDoc: taskDoc };
  }

  /** projectId → [taskId] for every task that sits under a project on the goal map. */
  function tasksByProject(goals) {
    var WO = global.WorkOS;
    var nodes = (goals && goals.nodes) || [];
    var byId = Object.create(null);
    nodes.forEach(function (n) { if (n && n.id) byId[n.id] = n; });
    var taskIds = Object.create(null);
    ((goals && goals.links) || []).forEach(function (l) {
      if (!l) return;
      if (l.from && !byId[l.from]) taskIds[l.from] = true;
      if (l.to && !byId[l.to]) taskIds[l.to] = true;
    });
    var out = Object.create(null);
    if (!WO || typeof WO.projectOf !== 'function') return out;
    Object.keys(taskIds).forEach(function (id) {
      var project = WO.projectOf(goals, id);
      if (!project || !project.id) return;
      (out[project.id] = out[project.id] || []).push(id);
    });
    return out;
  }

  /**
   * @param {object} goals {nodes, links}
   * @param {object[]} docs documents ({id, title, subject})
   * @param {Object<string,string>} names cardId → card name (tasks with no name are left alone)
   */
  function plan(goals, docs, names) {
    names = names || {};
    var nodes = ((goals && goals.nodes) || []).filter(function (n) {
      return n && n.level === 'project' && n.id && cleanName(n.name);
    });
    var indexed = indexDocs(docs);
    var createProjects = [];
    var rename = [];
    nodes.forEach(function (n) {
      var name = cleanName(n.name);
      var doc = indexed.projectDoc[n.id];
      if (!doc) {
        createProjects.push({ id: n.id, name: name });
        return;
      }
      if (cleanName(doc.title) !== name) rename.push({ docId: doc.id, name: name });
    });
    var byProject = tasksByProject(goals);
    var createTasks = [];
    var nest = [];
    Object.keys(byProject).forEach(function (pid) {
      var parent = indexed.projectDoc[pid];
      byProject[pid].forEach(function (tid) {
        var child = indexed.taskDoc[tid];
        if (child) {
          if (parent && child.id !== parent.id) nest.push({ child: child.id, parent: parent.id });
          return;
        }
        var name = cleanName(names[tid]);
        if (!name) return;
        createTasks.push({ taskId: tid, projectId: pid, name: name });
      });
    });
    return {
      createProjects: createProjects,
      createTasks: createTasks,
      rename: rename,
      nest: nest,
      byProject: byProject,
    };
  }

  /**
   * Parent links for task documents. A task document sits under its project document.
   * A task document left under a project it no longer belongs to is cleared.
   * Other parents (a folder, a note) are left as they are.
   */
  function parentEdits(idx, docs, plan) {
    var parents = (idx && idx.parents) || {};
    var want = Object.create(null);
    ((plan && plan.nest) || []).forEach(function (n) {
      if (n && n.child && n.parent) want[n.child] = n.parent;
    });
    var projectDocs = Object.create(null);
    var taskDocs = Object.create(null);
    (docs || []).forEach(function (d) {
      if (!d || !d.id || !d.subject) return;
      if (d.subject.k === 'project') projectDocs[d.id] = true;
      if (d.subject.k === 'task') taskDocs[d.id] = true;
    });
    var set = [];
    Object.keys(want).forEach(function (child) {
      if (parents[child] !== want[child]) set.push({ child: child, parent: want[child] });
    });
    var clear = [];
    Object.keys(parents).forEach(function (child) {
      if (!taskDocs[child]) return;
      if (!projectDocs[parents[child]]) return;
      if (want[child] === parents[child]) return;
      clear.push(child);
    });
    return { set: set, clear: clear };
  }

  var ROOT_NAME = 'Projets';

  /** A folder page with no text of its own. Copies created by mistake are safe to drop. */
  function emptyPage(d) {
    return !!(d && !d.subject && !(d.size > 0) && !String(d.body || '').trim());
  }

  /**
   * Files project documents in the root folder "Projets" (mutates idx). The folder is created when missing.
   * A folder that already has its own document still counts: opening it must not create another Projets.
   * Extra root folders with the same name are folded into the first. Their empty pages are listed on
   * `idx.spareFolderDocs` (not saved) so the caller can delete those cards.
   * When the folder already exists only `newIds` are filed, so a project the user moved elsewhere stays
   * where they put it. Task documents follow their project through their parent link.
   * @returns {boolean} whether idx changed
   */
  function fileProjects(idx, docs, newIds) {
    var DM = global.DocsModel;
    if (!idx || !DM) return false;
    idx.folders = idx.folders || [];
    idx.docs = idx.docs || {};
    idx.parents = idx.parents || {};
    delete idx.spareFolderDocs;
    var projects = (docs || []).filter(function (d) { return d && d.id && d.subject && d.subject.k === 'project'; });
    var roots = idx.folders.filter(function (f) { return f && !f.parent && f.name === ROOT_NAME; });
    if (!projects.length && roots.length < 2) return false;
    var byId = Object.create(null);
    (docs || []).forEach(function (d) { if (d && d.id) byId[d.id] = d; });
    var changed = false;
    var existed = roots.length > 0;
    var folder = roots[0];
    var spare = [];
    if (!folder) {
      folder = { id: DM.newFolderId(), name: ROOT_NAME, parent: null };
      idx.folders.push(folder);
      changed = true;
    } else if (roots.length > 1) {
      var drop = Object.create(null);
      roots.slice(1).forEach(function (extra) { drop[extra.id] = true; });
      Object.keys(idx.docs).forEach(function (docId) {
        if (drop[idx.docs[docId]]) idx.docs[docId] = folder.id;
      });
      idx.folders.forEach(function (f) {
        if (f.parent && drop[f.parent]) f.parent = folder.id;
      });
      roots.slice(1).forEach(function (extra) {
        if (!extra.doc || extra.doc === folder.doc) return;
        if (emptyPage(byId[extra.doc])) spare.push(extra.doc);
        else if (byId[extra.doc] && !idx.docs[extra.doc] && !idx.parents[extra.doc]) idx.docs[extra.doc] = folder.id;
      });
      spare.forEach(function (id) {
        delete idx.docs[id];
        delete idx.parents[id];
      });
      idx.folders = idx.folders.filter(function (f) { return !drop[f.id]; });
      changed = true;
    }
    if (spare.length) idx.spareFolderDocs = spare;
    if (existed) {
      var fresh = Object.create(null);
      (newIds || []).forEach(function (id) { fresh[id] = true; });
      projects = projects.filter(function (d) { return fresh[d.id]; });
    }
    projects.forEach(function (d) {
      if (d.id === folder.doc) return;
      if (idx.docs[d.id] || idx.parents[d.id]) return;
      idx.docs[d.id] = folder.id;
      changed = true;
    });
    return changed;
  }

  global.DocsProjects = {
    ROOT_NAME: ROOT_NAME,
    fileProjects: fileProjects,
    plan: plan,
    parentEdits: parentEdits,
  };
})(typeof window !== 'undefined' ? window : this);
