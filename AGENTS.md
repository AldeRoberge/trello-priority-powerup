# Agent instructions

## Git: always commit and push

After finishing meaningful work in this repo:

1. **Commit** local changes (follow the repo’s commit protocol: status, diff, log, then stage + commit).
2. **Push** the current branch to `origin` (`git push -u origin HEAD` when needed).

Do this by default — do not wait for a separate “please commit/push” ask.

Still never:

- Force-push to `main`/`master` unless explicitly requested
- Amend pushed commits unless the usual amend safety rules are met
- Skip hooks or change git config
- Commit secrets (`.env`, credentials, etc.)
