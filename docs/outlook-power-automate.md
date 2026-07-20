# Outlook auto-sync with Power Automate (no hosting)

Automate **Trello → Outlook Calendar** using Microsoft Power Automate. Runs in Microsoft’s cloud — you do **not** host a server.

**No Trello Pro required.** Custom Fields are Pro-only; this guide uses a free **Excel** mapping table (or an optional line in the card description).

| | Graph (Connecter Outlook) | ICS export | **Power Automate** |
|--|--|--|--|
| Your hosting | No | No | **No** |
| Entra SPA app | Yes | No | **No** |
| Trello Pro | No | No | **No** |
| Auto updates | While Gantt open | Manual | **Yes** (cloud triggers) |
| Direction | Two-way | One-way | **One-way** (Trello → Outlook) |

## Prerequisites

1. A Microsoft account that can open [Power Automate](https://make.powerautomate.com) (Microsoft 365 / free Microsoft account often works; some orgs disable connectors).
2. Access to the Trello board (**Free / Standard is fine** — no Custom Fields).
3. Outlook calendar on the same Microsoft account you connect in the flow.
4. OneDrive or Excel Online (comes with the same Microsoft account).

If your **work** tenant blocks the Trello or Outlook connector, try a **personal** Microsoft account (outlook.com), or ask IT to allow those connectors (no custom Entra app required).

---

## Recommended setup (Free Trello) — Excel mapping

Store `CardId → EventId` in a small Excel file so updates don’t create duplicate Outlook events.

### 1. Create the Excel workbook

1. Open [https://excel.office.com](https://excel.office.com) (or OneDrive → New → Excel).
2. Name the file e.g. `Trello-Outlook-Map`.
3. On **Sheet1**, put headers in row 1:

| A | B | C |
|---|---|---|
| CardId | EventId | CardName |

4. Save it in OneDrive.

### 2. Create the flow

1. [https://make.powerautomate.com](https://make.powerautomate.com) → **Create** → **Automated cloud flow**.
2. Name: `Trello → Outlook (Cerveau)`.
3. Trigger: **Trello** → **When a card is updated** → pick your **Board**.
4. **New step** → **Condition**: **Due date** is not equal to *(empty)* / `null`.  
   Continue only in **If yes**.

### 3. Look up the card in Excel

Still in **If yes**:

1. **Excel Online (Business)** or **Excel Online (OneDrive)** → **Get a row**  
   (or **List rows present in a table** — see tip below).
2. Point at your workbook / table.
3. Key column: `CardId` = Trello trigger **Card ID** (or `id`).

**Tip:** Format the header row as an Excel **Table** (select headers → Insert → Table). Many Excel actions require a named table (e.g. `Table1`).

### 4. Create or update Outlook

Add a **Condition**: Excel **EventId** is equal to *(empty)*.

**If yes — create**

1. **Outlook.com** or **Office 365 Outlook** → **Create event (V4)**  
   - Subject ← Trello **Name**  
   - Body ← Trello **Description**  
   - Start ← **Due date**  
   - End ← expression `addHours(triggerOutputs()?['body/due'], 1)` (or `addDays(..., 1)` for all-day style)
2. **Excel – Update a row** (or **Add a row** if Get a row failed / no match):  
   - `CardId` ← Trello card id  
   - `EventId` ← **Id** from Create event  
   - `CardName` ← card name  

If **Get a row** fails when the card is new, use this pattern instead:

1. **List rows** filtered by `CardId eq '...'` (or get all and **Filter array**).
2. Condition: length of results = 0 → **Add a row** after create; else **Update event** + **Update a row**.

**If no — update**

1. **Update event (V4)** with Excel **EventId**.
2. Same subject / body / times as create.
3. Optionally **Update a row** with the latest `CardName`.

### 5. Save and test

1. **Save** → turn the flow **On**.
2. Set a due date on a test card → wait ~1 minute → check Outlook.
3. Rename the card → same event should update; Excel should still have one row for that `CardId`.

---

## Alternative (Free Trello) — marker in the description

If you prefer not to use Excel, store the event id in the card **description** (available on Free).

Marker line (keep exactly this prefix):

```text
[outlook-event-id]: PASTE_EVENT_ID_HERE
```

Flow idea:

1. Trigger: **When a card is updated**, due date not empty.
2. Condition: **Description** contains `[outlook-event-id]:`.
3. **If no** → Create event → **Update a card** description =  
   `concat(triggerBody()?['desc'], '\n\n[outlook-event-id]: ', outputs('Create_event')?['body/id'])`  
   (adjust action names to match your flow).
4. **If yes** → Parse id with an expression, e.g. after the marker, then **Update event**.

**Downsides:** the marker is visible in the description; careless edits can break the id. Prefer **Excel mapping** when possible.

---

## Optional: Trello Pro custom field

If you later get **Trello Pro / Premium**, you can use a text custom field `Outlook Event ID` instead of Excel — same create/update logic, field on the card. Not required for this guide.

---

## Simpler starter (create only — expects duplicates)

1. Trigger: **When a card is created** or **When a due date is set** (if listed).
2. Action: **Create event** only.

Editing cards will spawn **extra** events. Use Excel mapping for real use.

---

## Optional: scheduled catch-up

1. Trigger: **Recurrence** (e.g. daily 7:00).
2. **Trello – Get cards** (open cards on the board).
3. **Apply to each**: due date set **and** no Excel row for that `CardId` → Create event → Add Excel row.

Useful for cards that already had dates before the flow existed.

---

## Gantt in this Power-Up

- **Exporter .ics** — one-shot import (no Automate).
- **Power Automate** — this guide (toolbar button).
- **Connecter Outlook** — Graph; needs Entra; often blocked without admin.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Can’t find Trello connector | Org policy; try personal account at make.powerautomate.com |
| Excel “table not found” | Select header row → Insert → **Table**; use that table name in the action |
| Flow runs but no event | Outlook connector account = mailbox you open in Outlook |
| Duplicates | Excel `CardId` / `EventId` mapping (or description marker) + update branch |
| Work mailbox blocked | Outlook.com calendar, or ask IT for Outlook + Trello connectors |
| Due date timezone wrong | Set time zone on Create event; or `convertTimeZone(...)` |

## Related

- [outlook-ics-export.md](outlook-ics-export.md) — manual `.ics` export
- [outlook-entra-setup.md](outlook-entra-setup.md) — Graph SPA (admin-heavy)
