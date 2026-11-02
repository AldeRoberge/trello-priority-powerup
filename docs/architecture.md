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

## Still monolithic (see `scripts/size-baseline.json`)

`priority/priority-ui.js` (27k lines, `createInfoField` is one 9.7k-line function), `agent/agent-ui.js` (10k), `docs/docs-ui.js` (7.7k), `completion/completion-ui.js` (6.8k), `gantt/gantt-ui.js` (5.9k). Shrink them, then run `node scripts/check-structure.js --update-baseline` to lower their limit.
