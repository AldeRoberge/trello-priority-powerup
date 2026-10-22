'use strict';

/**
 * Cross-platform test entrypoint (Windows shells do not expand globs the same way).
 * Usage: node scripts/run-tests.js [--coverage] [--unit]
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'test');

const args = process.argv.slice(2);
const coverage = args.includes('--coverage');
const unitOnly = args.includes('--unit');

const UNIT_FILES = [
  'ai-complete.test.js',
  'version.test.js',
  'version-assets.test.js',
  'linear-pick.test.js',
  'view-shell.test.js',
  'isolation.test.js',
  'card-fields.test.js',
  'shortcut-wiring.test.js',
  'priority-matrix.test.js',
  'priority-scoring.test.js',
  'priority-score-breakdown.test.js',
  'recurrence.test.js',
  'due-vague.test.js',
  'iframe-client.test.js',
  'statut.test.js',
  'effects.test.js',
  'completion.test.js',
  'blocked-motifs.test.js',
  'blocked-reason-split.test.js',
  'brand.test.js',
  'overview.test.js',
  'markdown-rich.test.js',
  'markdown-link.test.js',
  'status-brief.test.js',
  'progress-summary.test.js',
  'task-types.test.js',
  'member-roles.test.js',
  'custom-assignees.test.js',
  'people.test.js',
  'task-split.test.js',
  'history.test.js',
  'debug-log.test.js',
  'user-profile-cache.test.js',
  'user-profile-human-sheet.test.js',
  'trello-confirm.test.js',
  'context-menu.test.js',
  'capabilities.test.js',
  'agent-claims.test.js',
  'agent-blocks.test.js',
  'agent-action-errors.test.js',
  'agent-reply-language.test.js',
  'agent-guides.test.js',
  'agent-highlight-chips.test.js',
  'agent-human-profile.test.js',
  'agent-model-tiers.test.js',
  'language-dialect.test.js',
  'agent-context.test.js',
  'agent-due-vague.test.js',
  'agent-parity.test.js',
  'agent-parity-more.test.js',
  'agent-color.test.js',
  'interview-why-guards.test.js',
  'lift-patch-tools.test.js',
  'add-subtask-dedupe.test.js',
  'gantt-model.test.js',
  'gantt-trello.test.js',
  'gantt-ui.test.js',
  'gantt-filters.test.js',
  'gantt-mini-editors.test.js',
  'outlook-sync.test.js',
  'outlook-ics.test.js',
  'desc-meta.test.js',
  'field-catalog.test.js',
  'docs-model.test.js',
  'docs-icon.test.js',
  'docs-rich.test.js',
  'docs-live.test.js',
  'docs-pins.test.js',
  'docs-entities.test.js',
  'docs-trello.test.js',
  'docs-projects.test.js',
  'docs-history.test.js',
  'card-quick.test.js',
  'entities-model.test.js',
  'entities-trello.test.js',
  'entities-composer.test.js',
  'entities-interview.test.js',
  'entities-interview-ai.test.js',
  'entities-reality.test.js',
  'entities-reality-ai.test.js',
  'entities-level.test.js',
  'quick-parse-when.test.js',
  'entities-archetype.test.js',
  'entities-ontology.test.js',
  'entities-life.test.js',
  'entities-work-life.test.js',
  'entities-systems.test.js',
  'entities-systems-ai.test.js',
  'agent-entities.test.js',
  'insert-gap.test.js',
  'dashboard-model.test.js',
  'dashboard-menu.test.js',
  'people-board-model.test.js',
  'dashboard-trello.test.js',
  'triage-tree.test.js',
  'project-icon.test.js',
  'journey-model.test.js',
  'graph-canvas.test.js',
  'skeleton.test.js',
  'add-row.test.js',
  'triage-doc-model.test.js',
  'triage-doc-trello.test.js',
  'triage-image.test.js',
  'triage-sub.test.js',
  'quick-find.test.js',
  'assistant-dock.test.js',
  'agent-chats.test.js',
  'ai-status.test.js',
  'today-arrange.test.js',
];

function listTests() {
  if (unitOnly || coverage) {
    return UNIT_FILES.map((f) => path.join(TEST_DIR, f));
  }
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => path.join(TEST_DIR, f))
    .sort();
}

const nodeArgs = ['--test'];
if (coverage) {
  nodeArgs.push(
    '--experimental-test-coverage',
    '--test-coverage-include=components/**/*.js',
    '--test-coverage-exclude=**/node_modules/**'
  );
}
nodeArgs.push(...listTests());

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status == null ? 1 : result.status);
