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

  global.DocsProjects = {
    plan: plan,
    parentEdits: parentEdits,
  };
})(typeof window !== 'undefined' ? window : this);
