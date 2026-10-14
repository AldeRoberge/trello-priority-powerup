# Parcours

Journey is another view of the board, not a second task list.

## What it reads

- Open cards from `GanttTrello.loadBoard`: title, list category, score, due date, estimate, assignees, `enAttente`, `dependsOn` / `depTypes`, checklist items.
- The Mindmap goals card (`MindmapGoalsTrello.load`): vision, mission, but, objectif, projet, and `serves` links. A task id is stored with or without the `t:` prefix.

Writes go through the same card APIs as the other views: completion, `restPutCard`, `GanttTrello.setCardBlocked`, `TableTrello` for a new card or an archive. A new task under a project adds one `serves` link on the goals card.

## What a line means

| Line | Data | Meaning |
|---|---|---|
| Solid | `serves` | This contributes to that. Not a prerequisite. |
| Red, solid | `dependsOn` with `needs`, or an untyped dependency | Cannot proceed until the other card is done. |
| Dashed | `depTypes: after` | Should follow. Still listed as available, after work that is free. |
| Thin | `parts`, checklist link | Composition. Does not block. |
| Dotted | a second `serves` link | The task also contributes somewhere else. |

The queue sorts by due date, then by whether the task is waiting on an `after` link, then by how many open tasks `needs` it, then by the existing priority score, then by a known estimate. Each reason is one of those facts. A missing date, score, or estimate is left out.

## Zoom

- **Carte.** Missions and projects, with open / waiting / blocked / done counts. Tasks stay folded.
- **Projet.** The chosen branch and its tasks. A project with more than 80 tasks keeps the most relevant ones. Search still finds the others.
- **Tâche.** The task, what it requires, and what it unlocks.

Tasks with no project sit under **Sans projet**. That label is a bucket, not a goal that was stored.

## Not in this view

Milestones (`jalon`) and blockers that exist only as entities are not on the map. Cards and entities are still separate records. A card has no "last touched" field here, so neglected work is not ranked. Completing a task does not invent a project percentage.
