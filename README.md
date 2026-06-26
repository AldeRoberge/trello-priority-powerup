# 🚩 Trello Priority Power-Up

Add customisable priority levels (P1–P5) to any Trello card — with colour-coded badges, custom labels, and a settings panel.

---

## Features

- **5 priority levels** (P1–P5), each with a colour and label
- **Badges** appear directly on card faces in board view
- **Set Priority popup** inside each card
- **Settings panel** to rename labels and change colours per board
- Priorities are stored per-board, so each board can have its own scheme

---

## Setup Instructions

### Step 1 — Host on GitHub Pages

1. Go to [github.com/new](https://github.com/new) and create a **public** repository (e.g. `trello-priority-powerup`)
2. Upload all four files (`index.html`, `popup.html`, `settings.html`, `README.md`) to the repo root — click **"Add file" → "Upload files"** in the GitHub UI, or use Git:
   ```bash
   git init
   git add .
   git commit -m "Initial Power-Up"
   git remote add origin https://github.com/YOUR-USERNAME/trello-priority-powerup.git
   git push -u origin main
   ```
3. In your repo go to **Settings → Pages**
4. Under **Source**, select **Deploy from a branch** → branch: `main`, folder: `/ (root)` → **Save**
5. After 1–2 minutes your site will be live at:
   `https://YOUR-USERNAME.github.io/trello-priority-powerup/`

---

### Step 2 — Register the Power-Up

1. Go to [https://trello.com/power-ups/admin](https://trello.com/power-ups/admin)
2. Click **"Create new Power-Up"**
3. Fill in:
   - **Name**: Card Priorities
   - **Iframe connector URL**: `https://YOUR-SITE-URL/index.html`
4. Under **Capabilities**, enable:
   - `card-badges`
   - `card-detail-badges`
   - `card-buttons`
   - `board-buttons`
5. Save

---

### Step 3 — Add to your board

1. Open any Trello board
2. Click **Power-Ups** in the board menu
3. Find **Card Priorities** under "Custom" or search by name
4. Click **Add**

---

## Usage

### Setting a priority on a card
1. Open any card
2. Click **"Set Priority"** in the right panel
3. Pick a priority level — the badge appears instantly on the card

### Customising priority names & colours
1. Click **"Priority Settings"** in the top-right board buttons area
2. Edit the label text and click the colour swatch to pick a new colour
3. Hit **Save changes**

### Clearing a priority
1. Open the card → **Set Priority**
2. Click **✕ Clear priority** at the bottom

---

## File overview

| File | Purpose |
|------|---------|
| `index.html` | Power-Up connector — registers all capabilities with Trello |
| `popup.html` | Priority picker popup shown inside each card |
| `settings.html` | Board-level settings to customise labels and colours |

---

## Default priorities

| # | Label | Colour |
|---|-------|--------|
| P1 | Urgent | 🔴 #E53E3E |
| P2 | High   | 🟠 #DD6B20 |
| P3 | Medium | 🟡 #D69E2E |
| P4 | Low    | 🟢 #38A169 |
| P5 | None   | ⚫ #718096 |
