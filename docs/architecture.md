# Architecture (carte du code)

No bundler. Each file is a script that attaches itself to `window`; pages list their scripts in order. `npm run check` (`scripts/check-structure.js`) verifies the lists and refuses new files over 1500 lines.

## Layers

- `*-model.js`: pure logic, no DOM, no Trello. Easy to unit test (`test/`).
- `*-trello.js`: reads and writes Trello (pluginData, REST).
- `*-ui.js` / `*.css`: rendering and events.
- `components/shared/`: used by several views (context menu, history, view shell, card fields...).

## Split components (parts)

A component too big for one file is cut into ordered parts that share their top-level names through one namespace object. The order is in `<name>.parts.json`; pages, `test/helpers/load.js` (`loadComponent('agent/agent.js')`) and `sandbox/component-source.js` read it.

### AI agent (`components/agent/`, namespace `PriorityAgentParts`)

| Part | What is in it |
|---|---|
| `agent-base` | debug helpers, storage keys, model tiers, normalizers, the action registry (`registerAction`) |
| `agent-provider` | provider settings, `apiFetch`, turn guards |
| `agent-context` | `buildContext` (card and board snapshot for the prompt) |
| `agent-suggest` | suggest helpers (subtasks, labels, goals, metrics), `memoryTurn` |
| `agent-chat-store` | first-open interview, per-card chat history |
| `agent-parse` | action normalizers, `parseAssistantPayload`, `chatCompletions` |
| `agent-chat-turn` | `chatTurn`, the conversation loop |
| `agent-dream` | status brief, progress summary, card dream |
| `agent-actions-card/subtasks/assistant/board` | one handler per tool, registered with `registerAction([...tools], async function (bridge, action, tool, args) {...})` |
| `agent-actions` | `executeAction` (looks the tool up in the registry), `executeActions`, result visuals, debug export |
| `agent-api` | builds `window.PriorityAgent` |

**Add an agent tool:** register a handler in the matching `agent-actions-*.js` file (or a new file listed in `agent.parts.json` before `agent-actions.js` and in every page that loads the agent), add its label in `TOOL_LABELS`, and its prompt text in `agent-context`.

**Rules for parts:** a function from another part is reached through a generated stub (`function x() { return S.x.apply(this, arguments); }`), a constant through `var x = S.x;` (so its part must load first). A top-level name that is reassigned must stay inside one part.

### Other split components

Same mechanism, cut by size at statement boundaries (see each `*.parts.json`):

| Component | Parts |
|---|---|
| `priority/priority-ui` (`PriorityUIParts`) | `catalogs`, `markdown-icons`, `color-schemes-due`, `scoring`, `score-help`, `statut-field`, `overview-field`, `info-field` (9.7k lines, one function), `en-attente-field`, `due-date-field`, `variant-mount`, `mini-editors-api` |
| `priority/priority-trello` | `board-card`, `badges-due`, `sort-actions` |
| `completion/completion-trello` | `estimate-scales`, `completion-data` |
| `docs/docs-model` | `core`, `html-folders` |
| `entities/entities-model` | `core`, `schema-graph` |
| `shared/context-menu` | `core`, `builders` |
| `shared/effects` | `sounds`, `overlays` |

A top-level variable that is reassigned in one part and read in another is reached as `S.name` everywhere (the splitter rewrites it), so it always has one shared value.

### Exploded functions (views and big builders)

A big `mount()` (or `createInfoField`, `chatTurn`...) is cut into ordered part files, `<file>-<topic>.js`, followed by the original file as the core. Each part registers `{ define(M), run(M) }` in `window.<Namespace>Mount<Function>`; the core's function is a small driver:

1. every part's `define(M)` assigns its inner functions to `M` (this replaces hoisting);
2. every part's `run(M)` executes its statements in the original order (a `return` stops the whole mount).

`M` is a per-call object: every local variable, parameter and inner function of the old closure is `M.name`. Top-level helpers and constants of the file are `S.name` (the file's shared namespace, exported by the core). Rules for editing these files:

- Write `M.x` for state of the view and `S.f()` for module-level helpers, exactly like the code around you.
- A new inner function goes in a part's `define`, a new statement in `run` at the right point in the order.
- Parts must be listed in the page before the core file; `<file>.parts.json` has the order and `npm run check` verifies the pages.

Covered this way: table, kanban, gantt, docs, dashboard (and its Today board), mindmap, entities (and its composer), journey, completion, agent UI, plus `createInfoField`, `createDueDateField` and `chatTurn`.

## Size rule

No component file may pass 1500 lines unless it is in `scripts/size-baseline.json`; a listed file may not grow. When you shrink one, run `node scripts/check-structure.js --update-baseline`. The files still listed are mostly stylesheets (`priority-ui.css` 10k, `trello-theme.css` 6k, `agent-ui.css` 5k, ...) and single parts that are one long list of statements.
