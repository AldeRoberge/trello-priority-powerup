# Philosophy of work

Every piece of work in this app exists **for a reason that can be traced up to the Vision**, and every
Vision can be traced down to **the next thing to do**. The Mindmap and the Kanban are two views of the
same data; neither owns it.

> Start at "What are we trying to achieve?", zoom down to "What exactly do I need to do next?", and never
> lose the thread between the two.

## The ladder

| Level | Question it answers | Nature |
|---|---|---|
| **Vision** | What future do we want? | Outcome, enduring |
| **Mission** | Why do we exist / what do we keep doing? | Outcome, enduring |
| **Goal** | What major thing do we want to achieve? | Outcome |
| **Objective** | What specific, measurable result tells us we got there? | Outcome, measured by metrics |
| **Project** | What body of work do we organise to reach the objective? | Work |
| **Task** | What independently completable unit has a clear result? | Work (a Trello card) |
| **Subtask** | What smaller part of the task? | Work (checklist) |
| **Action** | What is the smallest executable step? | Work (checklist item) |

Vision → Objective are **outcomes** (the "why"). Project → Action are **work** (the "how").

## Principles

1. **A task belongs to a project, a project serves an objective.** That is the default path, and the
   breadcrumb `Vision / Mission / Goal / Objective / Project / Task` is shown wherever a task is shown.
2. **Work done is not outcome achieved.** Finishing every task of a project does not close its
   objective. An objective is judged by its own success criteria (metrics), never by task completion.
   Progress of work and progress of outcome are always displayed separately.
3. **One canonical data model.** A task exists once. Kanban, Mindmap, Table and Gantt read and write the
   same item; there is no copy to synchronise.
4. **Hierarchy is a tree, sequencing is a graph.** Parent/child = "belongs to" (no cycles, one parent).
   Dependencies = "must happen before". Cross-links = "related to" and never duplicate an item.
5. **Flag, don't forbid.** A task with no project, or an objective with no success criteria, is flagged
   ("orphan", "no definition of done"), but standalone work is legitimate and never blocked.
6. **Decompose progressively.** Any level can get children at any time. AI may *suggest* children, and
   the user approves before anything is created.
7. **Macro to micro by zooming.** Zoomed out you see clusters and statuses of outcomes; zoomed in you see
   individual tasks. Thousands of items stay usable by collapsing and clustering.

## Where this stands in the code today

| Spec level | Today | Gap |
|---|---|---|
| Vision, Mission, Goal | Mindmap goal nodes (`level` vision / mission / goal), stored in the "🎯 Carte des objectifs" card (`mindmap-goals-trello.js`) | none structurally |
| Objective | Goals component `goals.objectifs` + metrics (`goals-trello.js`), which is **separate** from the Mindmap's "goal" level and shares the label "Objectif" | two disconnected models |
| Project | Goals component `goals.projects` (belongs to an objectif), card link `goals.projectId`; Mindmap has a "Unité de travail" level instead | two disconnected models |
| Task | Trello card; Mindmap `serves` edge to a goal level | card → project link and card → mindmap link are independent |
| Subtask / Action | Not modelled | use card checklists (subtask = checklist, action = item) |
| Kanban | Columns = Trello lists | no grouping by project/objective/assignee |

## Decision needed

The Mindmap hierarchy (vision → mission → goal → unit of work) and the Goals hierarchy
(objectif → project → card) describe the same idea twice. They should become one chain:
`Vision → Mission → Goal → Objective → Project → Task`, where Objective keeps its metrics, Project keeps
its card link, and the Mindmap's "Unité de travail" level is replaced by Project.
