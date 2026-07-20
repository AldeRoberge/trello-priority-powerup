# Outlook auto-sync with Power Automate (no hosting)

Automate **Trello → Outlook Calendar** using Microsoft Power Automate. Runs in Microsoft’s cloud — you do **not** host a server.

| | Graph (Connecter Outlook) | ICS export | **Power Automate** |
|--|--|--|--|
| Your hosting | No | No | **No** |
| Entra SPA app | Yes | No | **No** |
| Auto updates | While Gantt open | Manual | **Yes** (cloud triggers) |
| Direction | Two-way | One-way | **One-way** (Trello → Outlook) |

## Prerequisites

1. A Microsoft account that can open [Power Automate](https://make.powerautomate.com) (Microsoft 365 / free Microsoft account often works; some orgs disable connectors).
2. Access to the Trello board.
3. Outlook calendar on the same Microsoft account you connect in the flow.

If your **work** tenant blocks the Trello or Outlook connector, try the same flows with a **personal** Microsoft account (outlook.com) and that calendar — or ask IT to allow those connectors (no custom Entra app required).

## Recommended setup (create + update, fewer duplicates)

### 1. Custom field on the Trello board

1. Board → **…** → **Custom Fields** → add a **Text** field.
2. Name it exactly: `Outlook Event ID`  
   (used to remember the Outlook event so updates don’t create duplicates).

### 2. Create the flow

1. Open [https://make.powerautomate.com](https://make.powerautomate.com) → **Create** → **Automated cloud flow**.
2. Name: `Trello → Outlook (Cerveau)`.
3. Trigger: search **Trello** → **When a card is updated**.
4. Sign in to Trello; pick your **Board**.
5. Click **New step**.

### 3. Condition — only dated cards

1. Add **Condition**.
2. Left: **Due date** (from the Trello trigger).
3. Operator: **is not equal to**.
4. Right: leave empty (or use expression `null`).

Stay on the **If yes** branch for the next steps.

### 4. Branch — create vs update

Add another **Condition** in **If yes**:

| | Field |
|--|--|
| Left | Custom field **Outlook Event ID** (or “Get custom field options / Get card” if needed — see note below) |
| Operator | **is equal to** |
| Right | *(empty)* |

**If yes** (no event yet) — **Create event**:

1. Action: **Office 365 Outlook** or **Outlook.com** → **Create event (V4)**  
   (use **Outlook.com** for personal MSA; **Office 365 Outlook** for work mailbox).
2. Calendar: your calendar (e.g. Calendar).
3. Subject: **Name** (Trello card).
4. Start time: **Due date** (or Start date if you use both — map as you prefer).
5. End time: same as start + 1 hour, or use an expression (example below).
6. Body: **Description** (Trello).
7. Next action: **Trello – Update a card** (or **Update custom field**) → set **Outlook Event ID** to the **Id** from the Create event output.

**If no** (event id already set) — **Update event**:

1. Action: **Update event (V4)**.
2. Event id: the **Outlook Event ID** custom field value.
3. Subject / times / body: same mappings as create.

#### End time expression (optional)

If the connector wants a separate end:

```text
addHours(triggerOutputs()?['body/due'], 1)
```

Or for all-day style end next day:

```text
addDays(triggerOutputs()?['body/due'], 1)
```

### 5. Trello custom field note

Depending on the Trello connector version:

- Prefer actions like **Get a card** / **Get custom fields** after the trigger if **Outlook Event ID** is not on the trigger payload.
- Or use **Update custom fields** after create.

Exact action names vary slightly between Power Automate UI locales.

### 6. Save and test

1. **Save** the flow → turn it **On**.
2. In Trello, set a due date on a test card (and a title/description).
3. Wait ~1 minute → check Outlook calendar.
4. Change the card title → confirm the **same** event updates (not a second event).

## Simpler starter flow (create only)

If custom fields are awkward:

1. Trigger: **Trello – When a card is created** or **When a due date is set** (if available in your connector).
2. Action: **Create event** with Subject = name, Body = desc, time = due.

**Downside:** editing the card often creates **duplicate** events. Prefer the custom-field flow above for day-to-day use.

## Optional: scheduled catch-up

Add a second flow:

1. Trigger: **Recurrence** (e.g. every day at 7:00).
2. Action: **Trello – Get cards** on the board (filter open cards).
3. **Apply to each** card with a due date and empty **Outlook Event ID** → Create event → write Event ID.

Useful for cards that already had dates before the flow existed.

## Gantt in this Power-Up

- **Exporter .ics** — one-shot import (no Automate).
- **Power Automate** — open the in-app guide from the Gantt toolbar (**Power Automate**) or read this file.
- **Connecter Outlook** — Graph sync; needs Entra SPA; often blocked without admin.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Can’t find Trello connector | Org policy; try personal account at make.powerautomate.com |
| Flow runs but no event | Check Outlook connector account = the mailbox you open in Outlook |
| Duplicates | Implement **Outlook Event ID** custom field + update branch |
| Work mailbox blocked | Use Outlook.com calendar, or ask IT to allow Outlook + Trello connectors (still no custom Entra app) |
| Due date timezone wrong | In Create event, set time zone explicitly; or convert with `convertTimeZone(...)` |

## Related

- [outlook-ics-export.md](outlook-ics-export.md) — manual `.ics` export
- [outlook-entra-setup.md](outlook-entra-setup.md) — Graph SPA (admin-heavy)
