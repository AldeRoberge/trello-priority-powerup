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

# Ensure Pages source is GitHub Actions (not branch)
gh api repos/AldeRoberge/trello-priority-powerup/pages
gh api -X PUT repos/AldeRoberge/trello-priority-powerup/pages -f build_type=workflow
```

Example stuck id from a failed run: `27285f2bacfc46ff65f020b476631ea9567bc8cd`.

### Option B — GitHub UI

1. **Settings → Pages** — review deployment history if shown.
2. **Actions** — cancel any in-progress **pages build and deployment** or **Deploy static content to Pages** run.
3. Wait a few minutes, then re-run the workflow.

## Re-run deploy

After Pages source is **GitHub Actions** and no deployment is in progress:

1. **Actions → Deploy static content to Pages → Run workflow** (branch `main`), or
2. Push any commit to `main`.

## Workflow notes

- **Concurrency** (`group: pages`, `cancel-in-progress: false`): runs queue so an in-flight Pages deployment can finish.
- **`build-info.json`** is stamped on the runner before `upload-pages-artifact`; it is **not** committed back to the repo (avoids extra pushes and races with `pages-build-deployment`).
- **`scripts/wait-pages-deployment-slot.sh`** polls the Pages deployments API before `deploy-pages`; failed deploys retry once after another wait.
