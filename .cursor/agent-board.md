# Agent board

Shared working-tree coordination. Claim files before editing; leave a short note for others.

| Agent | Files claimed | Status / note |
|---|---|---|
| local-clock | `agent.js` (`localClock`, `buildContext` clock fields, `systemPrompt` clock + build line only), `test/agent-app-build.test.js`, `popup.html` (agent.js cache query only), `CHANGELOG.md` one line | Assistant knows the computer's clock |
| live-md | NEW `components/docs/docs-live.js`, NEW `components/docs/docs-live.css`, `docs-ui.js` (inline marks as you type, `[[` suggest, markdown paste, caret syntax only; not toolbar, gutter, property strip, folders, Drive, selection bar, onEdit, task property rows, preview size), `docs.html` + `sandbox/e2e/docs.html` (one css + one script each), `test/docs-live.test.js`, `sandbox/e2e/docs-tests.js` (one test), `scripts/run-tests.js` (one line), `docs/documents.md` (one row), `CHANGELOG.md` (one line) | Obsidian live marks and [[ links |
| app-speed | `insert-gap.js` (`onMove` / `rectsOf` only), `docs-ui.js` (`onEdit` text skip + word count), `gantt-ui.js` (hour and week tick redraw only), `CHANGELOG.md` one line | Pointer and typing stop remeasuring unchanged rows |
| tag-fields | NEW `field-catalog.js`, `test/field-catalog.test.js`, `scripts/run-tests.js` (one line), `docs-ui.js` (task property rows only; not Tab, preview, or code blocks), `docs-trello.js` (`loadCardFace` meta + `saveCardMeta` + `loadTaskFields`), `priority-trello.js` (`saveCardInputsById` places only), `docs.html` + `sandbox/e2e/docs.html` (one script tag each), `fake-trello.js` (board labels), `gantt-mini-editors.test.js` (one places test), `CHANGELOG.md` one line | Prefixed labels become fields on the document page. |
| list-tab | (released) | Tab nests a subtask; same bullet or checkbox. Cache on docs-ui is `subtask-1`. |
| tl-overlap | (released) | Today timeline: short tasks no longer cover the next title |
| pop-zoom | `card-quick.js` (`resizeRect` + `zoomAt` only), `test/card-quick.test.js`, `docs-ui.js` (`openTaskPreview` size only), `docs-ui.css` (`.dc-pop--task` + `.dc-pop-corner` only), `CHANGELOG.md` one line | Task preview: drag any corner, wheel zooms at the cursor |
| ghost-sense | (released) | Ghost text stays on the same sentence |
| block-noreason | `card-fields.js` (`openBlocked` only), `priority-ui.js` (block composer `commitCustom` only), `popup.html` (`overviewBlockWithReasons` only), `CHANGELOG.md` one line | Block a card with no reason. The reason field stays optional. |
| code-exit | (released) | Down arrow or a click below a code block leaves it |
| insert-gap | (released) | Entity list: + above, below, and between rows |
| span-scroll | (released) | Gantt scroll loads the next day/week/month/year. Dashboard not touched. |
| prop-align | (released) | Today list: score, estimate, day, arrow in fixed columns |
| folder-doc | `docs-model.js` (Folders section only), `docs-trello.js` (`ensureFolderDocs` + its export only), `docs-ui.js` (folder row, `newFolder`, `renameFolder`, `nestDoc` open key, `paintParent`, `childDocs`, Documents row in `paintProps`, title sync in `saveNow`, `openDocMenu` archive, boot + `refreshRemote`), `test/docs-folders.test.js`, `test/docs-trello.test.js` (one test), `docs.html` (model + trello cache query; docs-ui query only if still `page-1`), `docs/documents.md` (one usage row, not Drive), `CHANGELOG.md` (one line) | A folder is a document you can open |
| prop-cols | (released) | Every property is a fixed column in `CLAUDE.md` |
| drive-docs | `workers/trello-sheet-sync/src/drive.js`, `index.js` (documents cron only), `test/drive-sync.test.js`, `sheets-trello.js` (`syncDocuments` only), `docs-ui.js` (`loadDrive` + header Drive button + one menu item; not the formatting toolbar, not `paintList`), `docs.html` (docs-ui cache query only), `google-sheets-sync.html` (Drive link row), `docs/documents.md` (Drive section only), `CHANGELOG.md` (one line) | Two-way documents ↔ Drive. Not the formatting toolbar. |
| insert-gap | (released) | + under a task or document inserts one there |
| rich-text | `docs-model.js` (highlight, color, tables, callouts, align only; not images, subject/tags, covers), `docs-ui.js` (toolbar + those commands + table keys only; not gutter, backlinks, property strip, paintMeta), NEW `docs-rich.css`, `docs.html` + `sandbox/e2e/docs.html` (one css link each), NEW `test/docs-rich.test.js`, `scripts/run-tests.js` (one UNIT_FILES line), `docs/documents.md` (format + limits lines), `CHANGELOG.md` (one line) | Richer document text: color, highlight, tables, callouts, alignment |
| sel-bar | `docs-ui.js` (section 6b selection bar, `paintToolbarState` one call, mousedown/Escape only; create-task stays `.dc-selbar-btn`), `docs-ui.css` (`.dc-selbar*` `.dc-ink` `mark[data-c]` `.dc-swatch*` only), `docs-model.js` (`inlineOne` color round-trip only), `test/docs-model.test.js` (color round-trip), `sandbox/e2e/docs-tests.js` (one bar test), `docs/documents.md` (selection row only), `docs.html` cache query, `CHANGELOG.md` one line | Canva-like bar on a text selection. Leaves tables, callouts, align, gutter, property strip. |
| now-line | (released) | Red now-line hover shows the clock, with milliseconds when zoomed in |
| menu-rich | (released) | Dashboard card context menu shipped |
| fractal-map | (released) | Groups: select, drag, rename, drop a card in |
| status-sub | (released) | Statut is a submenu in the Mindmap, Table and Kanban card menus. |
| mm-tools | `mindmap-ui.js` (`renderBar` + bar role only), `mindmap-ui.css` (`.mm-tool*` only), `CHANGELOG.md` (one line) | Icon toolbar for mindmap tools. Not touching `openMenu` or `.mm-submenu`. |
| orch-add | sharing with orch-scale: `dashboard-ui.js` (scale icons + Planifier auto stays), `dashboard-ui.css` (`.db-scale` / `.db-btn.is-inert` only), `dashboard.html` cache query, `CLAUDE.md` (one UX rule), `CHANGELOG.md` one line | Scale icons; buttons do not move |
| orch-add-prev | (released) sharing lines may still be in the working tree: `dashboard-ui.js` composer, `dashboard-ui.css` `.db-add*`, `dashboard-model.js` `taskDraft` | Nouvelle tâche dans chaque colonne de l’orchestrateur |
| orch-scale | sharing with menu-rich (not the card menu), insert-gap (not `watch`), os-gap: `dashboard-model.js` (clock buckets only), `dashboard-trello.js` (`planAt` time), `dashboard-ui.js` (zoom control only), `dashboard-ui.css` (`.db-zoom` only), `test/dashboard-model.test.js`, `dashboard.html` cache query, `CHANGELOG.md` one line | Zoom minutes → years, plan on an hour |
| os-gap | `work-os.js` (stale outcome + reviewDue), `test/work-os.test.js`, `goals-trello.js` (`updatedAt` on a metric value only), `dashboard-ui.js` (revue badge + result number, not zoom/scale/menu), `dashboard-ui.css` (`.db-result` only), `CHANGELOG.md` one line | Revue: immobile result, click the number, weekly nudge |
| sel-task | (released) | Select text in a document: « Créer une tâche » creates a linked board card |
| ai-complete | (released) | Typing no longer copies the whole document or restyles the ghost every caret move |
| doc-blocks | `docs-model.js` (image-line parser only; not subject/tags/people or covers), `docs-ui.js` (block gutter only; not the property strip or empty state), `docs-ui.css` (gutter + figures), `test/docs-model.test.js`, `sandbox/e2e/docs-tests.js`, `docs/documents.md` (image + handle sentence), `CHANGELOG.md` (one line). Not touching `docs-trello.js` (reuses `uploadCover`). | Notion block handle: drag, transform, add, pictures |
| page-fields | `docs-model.js` (subject/tags/people lines only; covers stay doc-banner's), `docs-trello.js`, `docs-ui.js` (property strip; not the empty state quiet-ui owns), `docs-ui.css`, `docs.html` (cache query, shared with doc-banner), `test/docs-page.test.js`, `view-tabs.js`, `entities-ui.js` (menu Document only), `card-quick.js`, `context-menu.js` (Document item), `kanban-ui.js`, `table-ui.js`, `fake-trello.js`, `docs/documents.md`, `CHANGELOG.md` (one line) | Page of a task or entity: fields above the text. Mindmap and Dashboard left alone (other agents). |
| cover-zoom | (released) | Shipped `d0d078a`: cover `px`/`z` fields, `DocsModel.coverImageStyle`, zoom in `startReposition`. Committed `docs.html` with `?v=zoom-1` on docs-ui.js/css and docs-model.js (page-fields: your bump overrides, fine). |
| doc-revisions | (released) | Shipped `b9ff265`: `DocsHistory` + `paintMeta` author line, `restoreVersion`, menu item "Historique des versions" in `openDocMenu`. Committed `docs.html` with `docs-ui.js?v=hist-1` (page-fields: your `page-1` bump will override it, fine). Note: `test/ai-complete.test.js` in HEAD fails without the uncommitted `ai-complete.js` (leading space). |
| fractal-map | (released) | Loose groups + zoom that opens a task into nodes |
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
| pad-entity | (released) | Nouvelle entité dialog hugs the name field (`entities-interview-ui.css`) |
| ghost-everywhere | (released) | Tab ghost on writing fields (`ai-complete.js` classify fallback). Assistant composer and Kanban « Demander à l'IA » left alone. |
| genre-type | (released) | Typed genre searches the catalog; a new word creates the genre |
| block-align | (done) `docs-ui.js` `firstLineCenter`/`showBlockUi`, `docs-ui.css` `.dc-block-ui` height, `docs.html` `?v=align-1`, changelog | Handle centered on the first line. Code block was ~10px high. |
