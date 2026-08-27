# Google Sheets ↔ Trello two-way sync — implementation plan

Status: **v1 implemented** — see [`google-sheets-sync.md`](./google-sheets-sync.md) for the
setup guide, [`google-sheets-sync/apps-script/`](./google-sheets-sync/apps-script/) for the
backend source, `google-sheets-sync.html` + `components/sheets/sheets-trello.js` for the
Power-Up settings panel (Gantt → "Google Sheets" button). Two deviations from the plan
below, made while building since they couldn't be validated live from this environment:

1. **No Google OAuth.** §5/§6 originally called for a client-side Google Identity Services
   flow so Cerveau could write the `_Config` tab via the Sheets API. Implemented instead:
   Cerveau POSTs config straight to the Apps Script Web App URL, guarded by a shared
   `SETUP_TOKEN` (a UUID `setupTemplate()` generates and the user pastes into Cerveau once).
   Zero new OAuth surface, and the Web App was already the trust boundary for Trello's
   webhook — reusing it for config pushes doesn't add a new one.
2. **Priorité and Progrès are Trello → Sheet only**, not full two-way. Priorité is a raw
   `cardPriority.impact` plugin-data read, not Cerveau's actual on-screen weighted score
   (that formula only runs client-side inside the Power-Up — porting it into Apps Script
   was out of scope for this pass, see risk #1 below, still unverified against a live
   card). Progrès is computed from native checklist data (safe, no plugin-data dependency).
   Both are clearly labeled read-only in the settings panel and in the doc's column table.

Everything else — one board, Catégorie as a real custom field, new Sheet rows creating
cards, 3-way merge with Trello winning conflicts, ID-keyed matching — is implemented as
planned below. **Not yet run against a real board/Sheet** (this environment has no way to
authenticate to Trello or Google) — treat the risks in §8 as still open until a live test
pass.

---

Original scope agreed with Alexandre before implementation:

- **One Trello board** per Sheet (not multi-board, not filtered subsets — v1).
- **Catégorie** = a new Trello **custom field** (not list name, not board name).
- A new row typed into the Sheet **creates a Trello card** (true two-way).
- **Setup is manual/guided for v1** (copy a template, paste two IDs into Cerveau). Fully automated one-click provisioning is a Phase 2 stretch goal, not required to ship.

## 1. Why this can't be "just more Power-Up code"

Cerveau today has **zero backend** — it's static files on GitHub Pages, and every existing integration (priority/statut/progress storage, the Outlook sync) runs entirely inside the Power-Up iframe using Trello's `t.set`/`t.get` plugin-data API or client-side OAuth. That model has a hard limitation the existing Outlook sync openly documents: *nothing syncs unless the page happens to be open* — Outlook sync runs on a debounce while the Gantt tab is open, and the Power-Automate alternative polls on a schedule (15 min/1 h) because "Trello doesn't send 'card modified' events to Automate."

That's incompatible with "immediate" two-way sync. To get real push-based sync in both directions without asking Alexandre to run and pay for a server, the plan uses **Google Apps Script bound to the Sheet as the sync engine**. Apps Script is free on a personal Google account, runs server-side (no browser tab required), can expose a public HTTPS endpoint (Web App `doPost`), and can run on an installable `onEdit` trigger — so it's the one piece of "backend" we can get for free that both sides (Trello webhooks, Sheet edits) can reach.

```
 Trello card changes                         Sheet edited by hand
        │                                            │
        ▼                                            ▼
 Trello webhook  ──POST──▶  Apps Script  ◀──onEdit trigger── Google Sheet
 (registered once            Web App
  by the Power-Up)          (doPost / onEdit)
        │                         │
        └────────── Trello REST API (key + personal token) ──────────┘
```

Apps Script becomes the only new "server" in the system. The Power-Up (client-side, as today) is only responsible for *configuring* the sync (field mapping, board selection, first-time setup) — it does not run the sync loop itself.

## 2. Data model

### 2.1 Sheet layout

The target spreadsheet gets three tabs:

| Tab | Purpose |
|---|---|
| `Tasks` | The human-facing sheet — exactly what Alexandre's example shows (Catégorie, Objet, Statut, Priorité, Progrès, …), plus one **hidden column A: `TrelloCardId`**. |
| `_SyncState` | Hidden. One row per card: `TrelloCardId`, and one column per synced field holding the **last-synced value** (the 3-way-merge baseline) + a `lastSyncedAt` timestamp. Never shown to the user, only read/written by Apps Script. |
| `_Config` | Hidden. Field-mapping + board ID, written by the Power-Up during setup (see §5), read by Apps Script on every run. |

`TrelloCardId` is the join key everywhere — never the title/Objet text — so renames in either system never break the mapping (this mirrors exactly how `outlook-sync.js` keys its `{eventId, lastSynced}` map by Trello card ID rather than by title).

### 2.2 Field mapping (v1 default)

| Sheet column | Trello source | Type |
|---|---|---|
| Objet | `card.name` | native REST field |
| Description | `card.desc`, with Cerveau's hidden-metadata lines (`[outlook-event-id]: …` etc.) stripped before writing to the Sheet and re-appended when writing back to Trello | native REST field, needs the same `descMeta` split/rejoin logic `popup.html`/`priority-trello.js` already has |
| Statut | Cerveau's `statut` pluginData (shared scope) | Power-Up plugin data |
| Priorité | Cerveau's `priority` pluginData (shared scope) — the computed score, not the raw impact/effort inputs | Power-Up plugin data |
| Progrès | Cerveau's `progress` pluginData (shared scope) | Power-Up plugin data |
| Catégorie | new Trello **custom field** `Catégorie` (Apps Script creates it on the board during setup if missing) | Trello custom field |

The Power-Up's settings screen lets Alexandre check/uncheck which of these sync (per the original ask — "only choose which fields you sync"); unchecked fields simply aren't written in either direction and don't appear as Sheet columns.

**Important constraint to verify in a spike (§8):** priority/statut/progress are stored as Power-Up **plugin data**, not native card fields. Trello's REST API exposes `shared`-scope plugin data on `GET /1/cards/{id}?pluginData=true` to *any* authenticated request (not just calls made with the Power-Up's own key), and accepts writes via `POST /1/cards/{id}/pluginData` using the Power-Up's `appKey` (`e449f4c0…`, already public in `rest-config.js`) + a personal token. Apps Script should be able to read/write these exactly like `priority-trello.js` does over plain `fetch`/`UrlFetchApp`. This needs to be confirmed against a real card before Phase 1 is built — if writes are rejected, the fallback is to stop mirroring the *computed* priority score and instead expose a plain custom field for it too.

### 2.3 Conflict resolution — reuse the Outlook 3-way merge

`components/outlook/outlook-sync.js` already solves this exact problem for Trello↔Outlook: keep a **baseline snapshot** per field from the last successful sync, and on each run compare `baseline → current-Trello-value` and `baseline → current-Sheet-value` per field:

| Trello changed? | Sheet changed? | Result |
|---|---|---|
| No | No | nothing to do |
| Yes | No | push Trello → Sheet |
| No | Yes | push Sheet → Trello |
| Yes | Yes, same new value | already agree, just update baseline |
| Yes | Yes, different values | **conflict** — Trello wins (same rule as Outlook sync), and the conflict is logged to a `_SyncLog` tab (`timestamp, card, field, trelloValue, sheetValue(discarded)`) so Alexandre can see what got overridden instead of it happening silently |

This is a straightforward port of an already-tested pattern in the codebase, not a new algorithm to invent.

## 3. The two sync directions

### 3.1 Trello → Sheet (webhook-driven, near-instant)

1. During setup, the Power-Up registers a Trello webhook (`POST /1/webhooks`) on the chosen board pointing at the Apps Script Web App's `/exec` URL.
2. On any board/card change, Trello POSTs the event to Apps Script's `doPost(e)`.
3. Apps Script re-fetches the changed card in full (webhook payloads are thin; don't trust them for field values) via `UrlFetchApp` + the Trello REST API, runs the merge in §2.3, and writes the row (or appends a new row + `TrelloCardId` if this card has never been seen).
4. Trello requires the callback URL to answer a `HEAD` verification request within a few seconds and to keep responding fast — Apps Script Web Apps satisfy this natively.

### 3.2 Sheet → Trello (onEdit-driven, seconds to ~1 min)

1. An **installable `onEdit` trigger** (needed because simple triggers can't call external services) fires on every edit to the `Tasks` tab.
2. Apps Script diffs the edited row against `_SyncState`, runs the same merge, and calls the Trello REST API to patch the card (`PUT /1/cards/{id}`, plugin-data POST, or custom-field PUT depending on which column changed).
3. **New row with no `TrelloCardId`:** if the row has an Objet (title) but a blank ID cell, Apps Script creates the card (`POST /1/cards`) on the configured board/list, sets whichever mapped fields were already filled in on that row, and writes the new ID back into column A.
4. Google doesn't guarantee sub-second `onEdit` delivery (typically a few seconds, occasionally up to ~1 minute under load) — worth setting that expectation explicitly rather than promising true real-time for this direction.

### 3.3 New Trello card → new Sheet row

Covered by 3.1 — the webhook fires `createCard` the same as any other update, Apps Script sees an unknown `TrelloCardId` and appends a row.

## 4. Apps Script project structure

Single script bound to the Sheet, roughly:

```
Code.gs
  doPost(e)              // webhook receiver → routes to syncFromTrello()
  onEditInstallable(e)    // onEdit trigger → routes to syncFromSheet(e.range)
  syncFromTrello(cardId)
  syncFromSheet(range)
  createTrelloCard(row)
  createSheetRow(card)
  mergeField(baseline, trelloVal, sheetVal)   // §2.3
Trello.gs                 // thin REST wrapper: getCard, updateCard, getPluginData,
                           // setPluginData, getOrCreateCustomField, setCustomFieldValue,
                           // createCard, registerWebhook
Config.gs                 // reads/writes the _Config tab
```

Trello key + personal token live in **`PropertiesService.getScriptProperties()`** (Apps Script's server-side secret store, never exposed to the Sheet UI), entered once during setup.

## 5. Setup flow (Phase 1 — manual/guided)

1. Cerveau ships a **template spreadsheet** (public "make a copy" link) with the `Tasks`/`_SyncState`/`_Config`/`_SyncLog` tabs and the Apps Script already written into the bound script, checked into `docs/templates/` or linked from a new `docs/google-sheets-sync.md` guide (same style as `outlook-power-automate.md`).
2. Alexandre: **File → Make a copy** of the template into his own Drive.
3. He opens the copied script editor once, runs an `authorize()` function to grant it access to Sheets + external requests (standard Apps Script OAuth consent screen), and **Deploy → Web app** (execute as me, access "Anyone") to get the `/exec` URL.
4. Back in Cerveau (a new "Google Sheets" section, likely alongside the Outlook settings in the Assistant/settings panel): paste the Sheet ID + the Web App URL, pick the board, check which fields to sync.
5. Cerveau writes that config into the `_Config` tab (via the Sheets API using a client-side Google OAuth token, Sheets-scope only — mirrors the MSAL popup pattern already used for Outlook, but with Google Identity Services instead) and calls Trello's REST API to register the webhook at the pasted `/exec` URL.
6. Cerveau also creates the `Catégorie` custom field on the board if it doesn't already exist (`POST /1/boards/{id}/customFields`).
7. Done — Apps Script takes it from here; Cerveau doesn't need to be open for sync to keep running.

This keeps the OAuth surface small (Sheets API scope from the Power-Up; the Apps Script's own Trello key/token is entered once by hand into Script Properties) and avoids the Apps Script API entirely for v1.

## 6. Power-Up (client-side) changes

- New settings section: field checkboxes (Titre/Objet, Description, Statut, Priorité, Progrès, Catégorie), Sheet ID input, Web App URL input, board picker, a "Test connection" button, a small sync-log viewer (reads `_SyncLog` via the Sheets API, read-only).
- Reuse `components/shared/rest-config.js`'s appKey/token pattern for any Trello calls the Power-Up itself makes during setup (webhook registration, custom field creation).
- New `components/sheets/sheets-trello.js` (setup/config calls only — no sync loop, that all lives in Apps Script) and `components/sheets/sheets-ui.js` (settings UI), following the same file-split convention as `outlook-auth.js`/`outlook-sync.js`.
- Store the sync's own metadata (Sheet ID, Web App URL, enabled fields) via `t.set('board','shared','sheetsSync', {...})` so it's visible to any board member opening Cerveau, same scope pattern used for `MATRIX_SETTINGS_KEY`/`FORMULA_SETTINGS_KEY` today.

## 7. Security notes

- The Trello token Apps Script uses is Alexandre's own personal token (same permission scope as his own Trello account) — no shared secret, no third party involved.
- The Web App's `/exec` URL is effectively a bearer secret: anyone with the URL can POST fake webhook payloads. Mitigate by having Apps Script validate the payload's `model.id` matches the configured board ID before acting, and optionally check `X-Trello-Webhook` isn't spoofable enough to fully trust — treat this as "friction, not a real access-control boundary" and document it as low-risk given it's a single-user personal tool.
- No secrets ever touch GitHub Pages / the static Power-Up bundle; the only new secret (Trello key/token) lives in Apps Script's server-side Script Properties.

## 8. Risks / things to validate before writing code

1. **Plugin-data write access from outside the Power-Up context** (§2.2) — spike this first; it decides whether Priorité/Statut/Progrès can sync as-is or need to become custom fields too.
2. **Apps Script consumer-account quotas** — `UrlFetchApp` calls (20k/day) and trigger execution limits. Fine for a personal task board, worth a one-line note in the guide.
3. **Custom field values via REST** require the field to already exist on the board (`idCustomField`) before a card's value can be set — the setup step (§5.6) must run before any Catégorie sync attempt.
4. **`onEdit` can't distinguish "user typed this" from "Apps Script itself just wrote this row"** — writing back from `syncFromTrello` must temporarily flag the row (e.g. a script-set flag in `_SyncState`) so it doesn't immediately re-trigger `onEditInstallable` and bounce the value back, an infinite-loop hazard classic to this kind of two-way sync.
5. Multi-user boards: if two board members both have Cerveau open and both are also collaborators on the Sheet, nothing in this design changes — Apps Script is the single writer to Trello for the Sheet direction, so there's no new race beyond what already exists between board members editing Trello directly.

## 9. Phase 2 (not required for v1, noted for later)

Fully automated setup — Cerveau provisions everything from an *empty* Sheet with no manual copy/deploy step, using the **Apps Script API** (`projects.create`, `projects.updateContent`, `deployments.create`) plus broader Google OAuth scopes (`script.projects`, `script.deployments`, `script.webapp.deploy`). This is the "just give me an empty Sheet" experience from the original ask, but it's materially more OAuth surface and engineering than Phase 1, so it's deliberately deferred until the manual flow is proven to work end-to-end.

## 10. Rough task breakdown

| # | Task | Depends on |
|---|---|---|
| 1 | Spike: confirm plugin-data read/write from Apps Script via REST | — |
| 2 | Build Apps Script template (Code.gs/Trello.gs/Config.gs, tabs, merge logic) | 1 |
| 3 | `docs/google-sheets-sync.md` guided setup doc (à la `outlook-power-automate.md`) | 2 |
| 4 | Power-Up settings UI + `sheets-trello.js`/`sheets-ui.js` (field picker, board picker, config write, webhook registration, custom-field creation) | 2 |
| 5 | `_SyncLog` viewer in the Power-Up | 4 |
| 6 | End-to-end test: rename in Trello, edit in Sheet, add row in Sheet, add card in Trello, force a same-field conflict | 2–4 |
| 7 | (Phase 2) Apps Script API automated provisioning | 6 |
