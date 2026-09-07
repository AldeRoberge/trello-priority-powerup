# Agent board

Shared working-tree coordination. Claim files before editing; leave a short note for others.

| Agent | Files claimed | Status / note |
|---|---|---|
| create-card | `components/agent/agent.js` (create_card wiring), `components/priority/priority-trello.js`, `components/agent/agent-ui.js` (create_card; shared w/ no-collapse for standalone header only), `assistant.html`, `popup.html`, `test/agent-create-card.test.js`, `scripts/run-tests.js` | Wiring create_card agent tool for project + task scopes |
| no-collapse | (released) | Standalone Assistant: static header, no collapse chevron |
| chat-scroll | (released) | Auto-scroll chat on assistant answer (pin after layout) |
| highlight-brief | (released) | Contrast highlights: no mid-phrase chop; polarity + chip link; shorter voice |
| card-preview | (released) | Card-back preview: action chips + compact restyle — leave `.field--overview-compact*` alone |
| charcoal-all | (released) | All Trello-style popup fixes shipped (`ad9c306`) — hard-refresh Cerveau |
| human-profile | (released) | Settings Mon profil shows identity + human sheet |
| layout-fix | (released) | Centered Assistant column |
