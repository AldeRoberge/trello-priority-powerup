# Agent board

Shared working-tree coordination. Claim files before editing; leave a short note for others.

| Agent | Files claimed | Status / note |
|---|---|---|
| journey | (released) `view-tabs.js` has the Parcours tab. Please keep that `VIEWS` entry. | Journey map and next-action queue are on main. |
| link-doc | (released) | Link button searches documents; selected words stay |
| orbit-map | `mindmap-model.js` (`orbit` only), `mindmap-ui.js` (focus orbit, node corners; not `renderBar` / `openMenu`), `mindmap-ui.css` (`.mm-node.is-context`, `.mm-edge.is-context`, `.mm-orbit-ring`; not `.mm-tool*`), `test/mindmap-model.test.js`, `mindmap.html` cache, `CHANGELOG.md` one line | Click gathers a neighbourhood; background click returns the map |
| work-ladder | (released) | Vision to task, who leads, who blocks |
| board-face | (released) | Kanban: side panel, full-height columns, overdue/blocked chips, AI on demand |
| date-moi | (released) | « il y a deux moi » reads as a month |
| orch-pan | (released) | Middle mouse pans the orchestrator like the Gantt |
| doc-icon | (released) | Icon picker scrollbar sits beside the last column |
| life-map | (released) | Simulated life shipped in the working tree: kinship, places, plants, tasks |
| ent-link | `docs-entities.js` (nameFromSelection, matchId), `docs-ui.js` (selection bar + menu: create entity), `docs.html` + `sandbox/e2e/docs.html` (docs-ui cache), `test/docs-entities.test.js`, `docs/documents.md` one row, `CHANGELOG.md` one line | Create an entity from selected document text |
| quote-exit | (released) | Removing a quote keeps the line as normal text |
| arrow-neck | (released) | Arrow shaft meets the head |
| ghost-fast | (released) | Ghost text uses the fast model and shows the first line as it arrives |
| plus-hide | (released) | Stray + circles stay hidden |
| orch-glide | (released) | Smooth zoom like the Gantt |
| ghost-ans | (released) | Don't finish "answer" on a question line |
| hull-edge | (released) | Group boundary follows card edges |
| chip-pins | NEW `components/docs/docs-pins.js`, `docs-ui.js` (`wireChipPins` only), `docs-ui.css` (`.dc-pin*` only), `docs.html` + `sandbox/e2e/docs.html` (one script each), `test/docs-pins.test.js`, `scripts/run-tests.js` (one line), `docs/documents.md` (one row), `CHANGELOG.md` one line | Task-chip pins: parent, sibling, person |
| doc-icon | (released) | Sidebar icon picker shipped in the working tree |
| asset-ver | (released) | Every asset is versioned; a new build reloads the page |
| dash-dock | (released) | Assistant bar on Dashboard |
| local-clock | (released) | Every reply uses the computer clock |
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
| rich-text | (released) | Documents: color, highlight, tables, callouts, alignment. Shipped in `docs-rich.js`. |
| sel-bar | `docs-ui.js` (section 6b selection bar, `paintToolbarState` one call, mousedown/Escape only; create-task stays `.dc-selbar-btn`), `docs-ui.css` (`.dc-selbar*` `.dc-ink` `mark[data-c]` `.dc-swatch*` only), `docs-model.js` (`inlineOne` color round-trip only), `test/docs-model.test.js` (color round-trip), `sandbox/e2e/docs-tests.js` (one bar test), `docs/documents.md` (selection row only), `docs.html` cache query, `CHANGELOG.md` one line | Canva-like bar on a text selection. Leaves tables, callouts, align, gutter, property strip. |
| now-line | (released) | Red now-line hover shows the clock, with milliseconds when zoomed in |
| menu-rich | (released) | Dashboard card context menu shipped |
| fractal-map | (released) | Groups: select, drag, rename, drop a card in |
| status-sub | (released) | Statut is a submenu in the Mindmap, Table and Kanban card menus. |
| mm-tools | `mindmap-ui.js` (`renderBar` + bar role only), `mindmap-ui.css` (`.mm-tool*` only), `CHANGELOG.md` (one line) | Icon toolbar for mindmap tools. Not touching `openMenu` or `.mm-submenu`. |
| orch-add | sharing with orch-scale: `dashboard-ui.js` (scale icons + Planifier auto stays), `dashboard-ui.css` (`.db-scale` / `.db-btn.is-inert` only), `dashboard.html` cache query, `CLAUDE.md` (one UX rule), `CHANGELOG.md` one line | Scale icons; buttons do not move |
| orch-add-prev | (released) sharing lines may still be in the working tree: `dashboard-ui.js` composer, `dashboard-ui.css` `.db-add*`, `dashboard-model.js` `taskDraft` | Nouvelle tâche dans chaque colonne de l’orchestrateur |
| orch-scale | sharing with menu-rich (not the card menu), insert-gap (not `watch`), os-gap: `dashboard-model.js` (clock buckets only), `dashboard-trello.js` (`planAt` time), `dashboard-ui.js` (zoom control only), `dashboard-ui.css` (`.db-zoom` only), `test/dashboard-model.test.js`, `dashboard.html` cache query, `CHANGELOG.md` one line | Zoom minutes → years, plan on an hour |
| os-gap | (released) | Documents and Entités use the same bottom assistant dock. |
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
| quiet-gap | (done) `stepText` + painters in table, kanban, card-quick, dashboard; `contextFlags` empty | Missing structure is no longer painted on the item. Revue count stays. |
