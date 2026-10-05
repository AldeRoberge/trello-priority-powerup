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

## Where this stands in the code

Mindmap levels (stored in the "🎯 Carte des objectifs" card, `mindmap-goals-trello.js`):
**vision, mission, goal ("But"), objective ("Objectif"), project ("Projet")**, then tasks (Trello cards).
Old data with the `work` level is read as `project`. Selecting a task or a goal-level node shows its
breadcrumb Vision / … / Projet and flags what is missing above it ("Sans projet", "Sans objectif",
"Sans but ni mission"); nothing is blocked.

Still to do, in order:

1. Bridge the Goals component (`goals.objectifs` with metrics, `goals.projects`, card `goals.projectId`) to the
   Mindmap objective / project levels so there is a single chain and objectives are judged by their metrics.
2. Kanban: group by project / objective / assignee, show the breadcrumb on cards.
3. Subtasks and actions from card checklists.
4. Semantic zoom and clustering for large maps; progress roll-up (work progress vs outcome progress).
