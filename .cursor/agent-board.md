# Agent board

Shared working-tree coordination. Claim files before editing; leave a short note for others.

| Agent | Files claimed | Status / note |
|---|---|---|
| create-card | `components/agent/agent.js` (create_card wiring), `components/priority/priority-trello.js`, `components/agent/agent-ui.js`, `assistant.html`, `popup.html`, `test/agent-create-card.test.js`, `scripts/run-tests.js` | Wiring create_card agent tool for project + task scopes |
| highlight-brief | `components/agent/agent.js` (ensureContrastHighlights / contrastColor / voice concision / ressenti example only), `sandbox/verify-contrast-highlights.js` | Fix A/B highlight truncation+polarity; shorten AI voice |
| card-preview | (released) | Card-back preview: action chips + compact restyle — leave `.field--overview-compact*` alone |
| charcoal-all | `components/shared/trello-theme.css`, `components/priority/priority-ui.css`, `components/priority/priority-ui.js`, `components/agent/agent-ui.css`, `popup.html` (cache busts; shared w/ create-card) | Finish all Trello-style fixes + deploy Pages |
| human-profile | (released) | Settings Mon profil shows identity + human sheet |
| layout-fix | (released) | Centered Assistant column |
