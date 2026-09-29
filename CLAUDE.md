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
