# Agent board

Shared working-tree coordination. Claim files before editing; leave a short note for others.

| Agent | Files claimed | Status / note |
|---|---|---|
| sel-task | `docs-ui.js` (selection bar + create-task only; not property strip, gutter, or empty state), `docs-ui.css` (`.dc-selbar` only), `docs-model.js` (`taskFromSelection` / list pick only), `docs-trello.js` (`createTask` only), `test/docs-model.test.js`, `test/docs-trello.test.js`, `sandbox/e2e/docs-tests.js` (one test), `docs/documents.md` (one row), `CHANGELOG.md` (one line) | Select text in a document to create a linked task |
| ai-complete | `components/shared/ai-complete.js` (new), `components/shared/trello-theme.css` (ghost rule only), `docs.html` + `gantt.html` + `table.html` + `kanban.html` + `mindmap.html` + `dashboard.html` + `entities.html` + `popup.html` + `profile.html` (one script tag each; not cache queries, not copy), `sandbox/e2e/docs.html` (script tags), `test/ai-complete.test.js`, `CHANGELOG.md` (one line). Not editing `docs-ui.js`. | Tab ghost text while typing |
| doc-blocks | `docs-model.js` (image-line parser only; not subject/tags/people or covers), `docs-ui.js` (block gutter only; not the property strip or empty state), `docs-ui.css` (gutter + figures), `test/docs-model.test.js`, `sandbox/e2e/docs-tests.js`, `docs/documents.md` (image + handle sentence), `CHANGELOG.md` (one line). Not touching `docs-trello.js` (reuses `uploadCover`). | Notion block handle: drag, transform, add, pictures |
| page-fields | `docs-model.js` (subject/tags/people lines only; covers stay doc-banner's), `docs-trello.js`, `docs-ui.js` (property strip; not the empty state quiet-ui owns), `docs-ui.css`, `docs.html` (cache query, shared with doc-banner), `test/docs-page.test.js`, `view-tabs.js`, `entities-ui.js` (menu Document only), `card-quick.js`, `context-menu.js` (Document item), `kanban-ui.js`, `table-ui.js`, `fake-trello.js`, `docs/documents.md`, `CHANGELOG.md` (one line) | Page of a task or entity: fields above the text. Mindmap and Dashboard left alone (other agents). |
| fractal-map | `components/mindmap/mindmap-model.js`, `components/mindmap/mindmap-ui.js`, `components/mindmap/mindmap-ui.css`, `test/mindmap-model.test.js`, `sandbox/e2e/mindmap.html`, `mindmap.html` (cache query only, shared with tab-flash), `CHANGELOG.md` (one line) | Loose groups + zoom that opens a task into nodes |
| orch-layout | (released) | Orchestrateur columns aligned, quiet chips |
| quiet-ui | (released) | Instructional subtitles removed |
| tab-flash | (released) | View tab change paints the saved theme before stylesheets |
| mention-short | (released) | Person mention: Backspace keeps the first name |
| docs-plus | (released) | Doc menu: Nouveau sous-document first, plus icon |
| create-card | `components/agent/agent.js` (create_card wiring), `components/priority/priority-trello.js`, `components/agent/agent-ui.js` (create_card; shared w/ no-collapse for standalone header only), `assistant.html`, `popup.html`, `test/agent-create-card.test.js`, `scripts/run-tests.js` | Wiring create_card agent tool for project + task scopes |
| console-fix | (released) | PluginData 4096/409 and AudioContext autoplay |
| doc-banner | (released) | Document covers shipped (docs + worker `/unsplash`). Note: `sandbox/e2e/docs-tests.js` "duplicate, export and delete" test is stale (expects old Supprimer dialog) |
| no-collapse | (released) | Standalone Assistant: static header, no collapse chevron |
| chat-scroll | (released) | Auto-scroll chat on assistant answer (pin after layout) |
| highlight-brief | (released) | Contrast highlights: no mid-phrase chop; polarity + chip link; shorter voice |
| card-preview | (released) | Card-back preview: action chips + compact restyle — leave `.field--overview-compact*` alone |
| charcoal-all | (released) | All Trello-style popup fixes shipped (`ad9c306`) — hard-refresh Cerveau |
| human-profile | (released) | Settings Mon profil shows identity + human sheet |
| layout-fix | (released) | Centered Assistant column |
| menu-dark | (released) | Context menu follows dark mode |
| rel-phrase | (done) leave `relationPhrase`, `taskPhase`, `phraseSections` and `.mm-edge-label*` alone | Mindmap link phrases follow the clicked node and the task phase |
