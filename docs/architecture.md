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

## Still monolithic (see `scripts/size-baseline.json`)

the `*-ui.js` view files are one big `mount()` closure each (`agent-ui` 9.6k lines, `docs-ui` 7.5k, `completion-ui` 4.5k, `gantt-ui` 5.5k, `dashboard-ui`, `mindmap-ui`, `entities-ui`, `table-ui`), and a few single functions (`createInfoField` 9.7k, `createDueDateField` 2.8k, `chatTurn` 2.9k, `executeAction` dispatch is now small). These share local state, so they need a hand refactor (state object plus feature modules), not a mechanical cut. Shrink them, then run `node scripts/check-structure.js --update-baseline` to lower their limit.
