# CLAUDE.md

## Git workflow

- Always commit to `main`. Never leave finished work only on a side branch or worktree.
- If work is done on another branch or worktree, always merge it into `main` when finished, without waiting to be asked. Do this before reporting the task as done.
- Only stage and commit your own changes; leave unrelated untracked or modified files alone.

## Scripts the user runs by hand (setup scripts, PowerShell)

Setup scripts have failed three times in a row from avoidable mistakes. Before handing one over:

- **Run what you can.** Extract each helper and test it in `powershell -NoProfile` (success and failure paths), parse-check the whole file with `[System.Management.Automation.Language.Parser]::ParseFile`, and test the non-interactive fallback. Say plainly what was not run for real.
- **Windows PowerShell 5.1 pitfalls** (the user runs 5.1, not pwsh 7):
  - A function returns *all* its output, so `& $cmd; return $LASTEXITCODE` returns command output plus the code. Pipe command output to `Out-Host` and return `[int]$LASTEXITCODE`.
  - `ConvertFrom-Json` / `Invoke-RestMethod` return a JSON array as one object. Flatten with `| ForEach-Object { $_ }` before indexing or counting.
  - Set `[Console]::OutputEncoding` to UTF-8 or tool output turns into mojibake.
- **Validate every prompt.** The user may paste the wrong thing (once pasted the command itself as an answer). Check format, re-ask on invalid input, and self-heal bad values already saved in state or `.dev.vars`.
- **Make it resumable and idempotent**, and tell the user the exact command to re-run (with or without `-Reset`; `-Reset` wipes saved progress).
- When a setup step fails, re-read the output the user pasted and fix the root cause in the script; do not just tell them to retry.
- In JS patch scripts, never pass replacement text containing `$'`, `$&` or `` $` `` to `String.replace`; use a function replacer.
- Use the Write tool, not shell heredocs, for files containing quotes or `$` (a heredoc silently truncated a file once).

## Commands I give the user to run

The user runs Windows PowerShell 5.1, usually from the repo root. Every command I hand over must work there as typed:

- **Never use `&&` or `||`** (parser error in 5.1). Use `;` to chain, or better, give one command per code block.
- **Avoid `cd`**. Prefer a command that takes a directory: `npm --prefix workers/trello-sheet-sync run deploy`, `npx --prefix ...`, `git -C <dir> ...`. If a `cd` is unavoidable use `Set-Location workers\trello-sheet-sync` on its own line, and say to come back.
- Use Windows paths (`.\scripts\x.ps1`) for PowerShell scripts, forward slashes are fine for npm/git arguments.
- No bash-only syntax: no `export VAR=x` (use `$env:VAR = 'x'`), no `$(...)` substitution, no heredocs, no `&` backgrounding, no `~`.
- If the command has to run inside a folder that has no `--prefix`/`-C` equivalent, give two separate blocks (`Set-Location ...`, then the command).
- Before sending a command, check that it is the exact one needed (right script name, right folder) instead of a guess; if I add an npm script for it, give `npm run <script>`.
- Deploying the Worker is `npm --prefix workers/trello-sheet-sync run deploy`.

## Notify the user when a push is live

Every push to `main` deploys to GitHub Pages through `.github/workflows/static.yml` (about 20-30 s). The changes are only live once that run succeeds, so after **every** `git push` to `main`, without being asked:

1. Find the run for the pushed commit: `gh run list --branch main --limit 5 --json databaseId,headSha,status` and pick the one whose `headSha` equals `git rev-parse HEAD` (retry after a few seconds if it has not appeared yet).
2. Wait for it: `gh run watch <databaseId> --exit-status` (run it in the background if there is other work to do).
3. Send a `PushNotification` (load it with ToolSearch `select:PushNotification` if its schema is not loaded): "Live: <commit subject>" on success, or "Deploy failed: <commit subject>" with the failing step (`gh run view <id> --log-failed`) on failure. Also say it in the final reply.

This is a rule for me, not a settings hook: hooks only run shell commands and cannot send the notification. Skip it only if `gh` is unavailable, and say so.


## How to work on this app (distilled from past chats)

The UI copy is French (Québec). The user writes short, informal requests and expects initiative.

### Process

1. Interpret intent, not literal words. Reuse the nearest existing feature's components and style (Tableau progress bar, the "II" pause button, the history panel) before building something new.
2. **Keep views consistent.** A feature asked for in one view (progress slider, complete circle, blocked "II", show/hide completed, right-click menu, assistant dock, drag and drop, undo/history) must be checked in Table, Gantt, Kanban, Mindmap and Documents and implemented through shared code, not copies. Say which views were covered and which were skipped, and why.
3. "Keep going" or "finish started work" means continue without asking. Ask only for decisions that are truly the user's; otherwise pick a sensible default and say what was chosen.
4. Fix root causes and check nearby code for the same problem. New items must show immediately. A fix must not make something else vanish (the Entités tab did once): put shared things in shared code.
5. Verify before reporting: `npm run test:unit`, add tests for changed logic, check in the browser pane (narrow widths; empty, completed, blocked and long-text states). Say plainly what was not run.

### UX rules

- Simple first, detail on demand: progressive disclosure, submenus, no walls of options. The user types first, suggestions come after.
- Compact: no huge buttons, no wasted vertical space, no redundant labels (like "Quoi ?" then "Nom"), no stray lines or odd padding.
- Direct manipulation: inline edits (double-click a title, click a progress bar or circle, drag sliders), no modal for simple edits, create in place. Archive acts immediately (Ctrl+Z undoes).
- Every item has a right-click menu with consistent icons and all card actions. Middle mouse pans; Ctrl+A/C/V/Delete work; selection and snapping behave like Miro or Draw.io.
- Reference apps: Apple (clean, calm), Linear, Miro, Draw.io, Trello. A confusing screen gets redesigned, not patched.
- States: completed is grayed and not bold; blocked/paused is red with the "II" icon (click to unblock); blocked and completed together needs a deliberate look. Completed items are hidden by default with the same top-right toggle in every view. Text is never cropped (wrap it). Icons are homogeneous.
- Empty values say "Cliquer pour ajouter…" and can be set right there, never just "Vide".
- **Visual hierarchy: less relevant means less present, everywhere.** Empty placeholders and hints ("Cliquer pour ajouter…", empty columns, input placeholders) are dimmed (opacity about 0.55, muted color), prefixed with a `+` icon (`ti ti-plus`) when they invite an action, and brighten slightly on hover. Same for other secondary info (completed, metadata, helper text): quieter than the content that matters. Apply it through shared CSS and check every view, not just the one asked about.

### AI rules

- AI features use the LLM with the real app context (cards, statuses, entities, dates, build), not keyword heuristics. The assistant knows what the app knows.
- Messages must make sense to a non-developer (no "J'ai eu la réponse, je peux reprendre", no "en attente de rien") and must not refuse actions the app can do (like deleting a card).
- Understand Québec French. No em dashes in agent-visible text.

### Replies

A few lines: what changed and where (file links), which views were covered, what was tested, decisions needed. No essays.
