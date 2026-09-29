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
