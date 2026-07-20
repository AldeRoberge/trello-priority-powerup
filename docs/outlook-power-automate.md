# Outlook auto-sync with Power Automate (no hosting, no Trello Pro)

**Cerveau does not create Outlook events.** Power Automate does.  
**Cerveau only hides** the `outlook-event-id` line/block in the card popup once the flow has written it.

| Who | Role |
|-----|------|
| **Power Automate** | Create/update Outlook events; **write** `outlook-event-id` into the Trello description |
| **Cerveau popup** | **Hide** that metadata by default; show it under **Afficher les métadonnées masquées** |

No Entra SPA app. No Trello Pro custom fields. No server to host.

---

## Prerequisites

1. [Power Automate](https://make.powerautomate.com) (personal Microsoft account is fine if work blocks connectors).
2. Trello board access (Free is fine).
3. Outlook / Outlook.com calendar on the **same** Microsoft account as the flow.

---

## Recommended flow (description marker, no Excel)

### 1. Create the flow

1. **Create** → **Automated cloud flow**.
2. Name: `Trello → Outlook (Cerveau)`.
3. Trigger: **Trello – When a card is updated** → select your board.
4. **Condition**: **Due date** is not empty. Work only in **If yes**.

### 2. Detect whether an event already exists

**Condition**: **Description** contains `outlook-event-id`

- **If no** → create path (step 3)  
- **If yes** → update path (step 4)

### 3. Create path (first time)

1. **Outlook.com** or **Office 365 Outlook** → **Create event (V4)**  
   - Subject ← card **Name**  
   - Body ← card **Description** (optional; may include old noise — fine)  
   - Start ← **Due date**  
   - End ← `addHours(triggerOutputs()?['body/due'], 1)`
2. **Trello – Update a card** (description) — **this is the automatic metadata write**:

Append the event id. Simplest expression:

```text
concat(
  triggerBody()?['desc'],
  '

[outlook-event-id]: ',
  body('Create_event')?['id']
)
```

(Adjust `Create_event` to your action’s exact name in the dynamic content picker.)

Cerveau will **hide** that line in the popup. In native Trello it may still show until you open Cerveau (which keeps the hidden `<!--cerveau-meta-->` form on later saves).

### 4. Update path (later edits)

1. Parse the id from the description (Compose + expression), e.g. take the text after `[outlook-event-id]:`.
2. **Update event (V4)** with that id; map subject / times / body like create.

### 5. Save, turn **On**, test

1. Set a due date on a test card.  
2. Wait ~1 minute → event appears in Outlook.  
3. Reopen the card in **Cerveau** → description looks normal; click **Afficher les métadonnées masquées** to see the id.  
4. Rename the card → same Outlook event updates (not a duplicate).

---

## Marker formats Cerveau understands

Either works:

```text
[outlook-event-id]: THE_OUTLOOK_EVENT_ID
```

```text
<!--cerveau-meta
outlook-event-id: THE_OUTLOOK_EVENT_ID
-->
```

**Power Automate must write one of these.** Cerveau will not invent an Outlook event id by itself.

---

## Optional: Excel mapping instead

If you prefer not to touch the description, use a OneDrive Excel table `CardId | EventId | CardName` — see older notes in git history / ask. Description marker is the path that matches “metadata in the description.”

---

## Gantt buttons

| Button | What it does |
|--------|----------------|
| **Power Automate** | Opens this guide in-app |
| **Exporter .ics** | Manual calendar file — **does not** write `outlook-event-id` |
| **Connecter Outlook** | Graph sync (Entra) — separate path; not required for Automate |

---

## Troubleshooting

| Issue | Cause |
|-------|--------|
| No metadata in Cerveau | Flow never ran step 3 (Update card description), or due-date condition failed |
| No reveal link in popup | No marker in description yet — run the create path once |
| Duplicate Outlook events | Update path not parsing id / always taking create branch |
| Connector missing | Org policy — try personal account at make.powerautomate.com |
