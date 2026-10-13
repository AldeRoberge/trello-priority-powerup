# Productivity redesign: audit and prioritized plan

Sources: product audit, architecture analysis and competitor UX research (read-only, 2026-10-13). Static code reading only; no browser run yet.

## 1. Findings (verified in code unless marked)

### P0
- Gantt has no create-card path (gantt.html does not load new-card.js).
- Mindmap creates through its own "Ajouter" composer, so creation takes a different number of steps per view.

### P1
- Hide-completed is missing in Documents and Entités (no hide-done.js). Documents may be an exception (no status); Entités is unresolved.
- Documents has no assistant dock.
- Mindmap used `+` for link actions. **Fixed** (see section 4).
- Archive wording and feedback differ: Table "Archiver la carte" with an 8 s undo toast; Kanban "Archiver" with a short status.
- Search is four controls with different scopes: Table/Kanban "Filtrer…", Mindmap "Filtrer (tâche, personne, lieu)…", Gantt "Rechercher… (titre, personne, liste, étiquette)", Documents "Rechercher…".
- `docs/ux-philosophy.md` is stale: Gantt does have S/P/D keys (commit 237eae0).

### P2
- Terminology mixes "carte" and "tâche".
- Long placeholders break the no-verbose rule (Entités composer, Mindmap filter).
- Table and Kanban duplicate archive and undo code.

### Architecture risks
1. Trello pluginData is capped at 4096 chars per scope, all keys combined. Board-level keys can fail silently. Check the budget before adding a key.
2. Progress, blocked and archive each have several write paths (Table, Kanban, Gantt, Mindmap, agent). A rule change in one view desyncs the others. A blocked change in Gantt also moves the Trello list.
3. No bundler: modules are window globals and load order matters.
4. Documents and Entités are Trello cards; schema changes need migration of live cards.
5. Statut is the Trello list; renaming lists changes status everywhere.
6. No rate-limit handling for Trello REST.
7. Uncommitted work in `components/kanban/*`, `components/shared/context-menu.*`, `components/table/table-trello.js` at session start. Do not touch these until committed.
8. Tests: no UI tests for table-ui, kanban-ui, mindmap-ui, docs-ui, entities-ui, dashboard-ui, priority-ui.

### Competitor patterns (from the UX research; Linear S/P/C and Notion labels are unverified)
- Adopt: one shared Ctrl+K command palette in `components/shared`; S/P/D picker already built (`linear-keys.js`, `linear-pick.js`) to extend to Mindmap and Gantt.
- Adapt: "Bloquées" and "En retard" as shared filter chips with counts (not a new page); C opens new-card everywhere; triage stays in Dashboard.
- Investigate: AND-combined saved views (needs the shared filter-state decision).
- Reject: Obsidian-style external capture; ClickUp custom statuses.
- Verify: Ctrl+Z history panel works in every view (documented, not traced).

## 2. Defaults chosen for open questions

The reports asked three questions. Defaults chosen so work can proceed; change them if you disagree:
- Creation: every view gets the same create-in-place composer (`new-card.js`). Mindmap keeps its link composer but its "create" uses the shared composer.
- Search: one shared search control with a single scope (title, person, list, label) across views, implemented in shared code.
- Hide-completed: Entités gets the shared toggle if its items have a completed state. Documents stays without it until documents gain a status.

## 3. Prioritized plan

**Critical usability (next):**
1. Gantt create path via `new-card.js`. Check the Gantt toolbar first (unverified).
2. Mindmap: `+` only for create; link actions use `link`. **Done.**
3. Documents assistant dock.

**High-impact workflows:**
4. Shared filter chips "Bloquées" and "En retard" with counts, in shared filter code, used by Table, Kanban, Gantt.
5. Shared search control with one scope.
6. Extend S/P/D to Mindmap (`linear-keys.js`).
7. Verify Ctrl+Z per view; add a test for the undo stack.

**Design system and consistency:**
8. One archive/undo module replacing the Table and Kanban copies (after the uncommitted Kanban/Table work is committed).
9. Unify "carte"/"tâche" terminology and shorten placeholders.
10. Progress and blocked write path consolidated into shared Trello write layer (architecture order: card-model, then write layer, then UI copies).

**Knowledge management:** backlinks and linking are not started; the Obsidian/Notion features need a product decision first.

**Advanced / experimental:** command palette (Ctrl+K), AND-combined saved views.

## 4. Done in this pass
- `components/mindmap/mindmap-ui.js`: three link actions ("Relier…", "Contribue à…", "Dépend de…") switched from `plus` to `link`. Syntax checked; `npm run test:unit` 866/866 pass. No browser check run yet.

## 5. Not done yet and why
- Browser verification of any view: not run in this pass.
- Items 1–10 need per-view UI tests first (architecture risk 8); they are not started.
- Files with uncommitted work from before this session were not touched.
