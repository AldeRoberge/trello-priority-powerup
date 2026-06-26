# GitHub Pages deployment

This repo publishes static files from the repository root via **GitHub Actions** (`.github/workflows/static.yml`).

## One-time setup

1. Open **Settings → Pages → Build and deployment**.
2. Set **Source** to **GitHub Actions** (not **Deploy from a branch**).
3. If **Deploy from a branch** stays enabled, GitHub also runs the built-in **`pages build and deployment`** workflow on every push. That competes with this workflow for the single Pages deployment slot and produces errors such as:

   `Deployment request failed ... due to in progress deployment`

## Unblock a stuck deployment

When a deployment is stuck **in progress**, new runs of **Deploy static content to Pages** fail at `deploy-pages`.

### Option A — GitHub CLI (recommended)

Install [GitHub CLI](https://cli.github.com/) and authenticate (`gh auth login`).

```powershell
# List recent deployments (note the id of any in_progress entry)
gh api repos/AldeRoberge/trello-priority-powerup/pages/deployments?per_page=10

# Cancel a stuck deployment (replace DEPLOYMENT_ID)
gh api -X POST repos/AldeRoberge/trello-priority-powerup/pages/deployments/DEPLOYMENT_ID/cancel
```

Example stuck id from a failed run: `27285f2bacfc46ff65f020b476631ea9567bc8cd`.

### Option B — GitHub UI

1. **Settings → Pages** — review deployment history if shown.
2. **Actions** — open the stuck **pages build and deployment** or **Deploy static content to Pages** run and cancel it if still running.
3. Wait a few minutes for the Pages deployment to finish or expire, then re-run the workflow.

## Re-run deploy

After Pages source is **GitHub Actions** and no deployment is in progress:

1. **Actions → Deploy static content to Pages → Run workflow** (branch `main`), or
2. Push any commit to `main` (stamp-only updates to `build-info.json` are ignored via `paths-ignore`).

## Workflow notes

- **Concurrency** (`group: pages`, `cancel-in-progress: true`): only one Actions deploy at a time; superseded runs are cancelled.
- **Stamp commit** runs before upload so `build-info.json` is included in the published site; the commit message includes `[skip ci]` and `paths-ignore` avoids a second deploy.
