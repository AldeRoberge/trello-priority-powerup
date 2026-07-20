# Outlook via fichier .ics (sans Entra / sans admin)

Use this when Microsoft Graph / Entra app registration is blocked (e.g. `AADSTS700016`, no tenant admin).

## What you get

| | Graph sync (Connecter Outlook) | **Exporter .ics** | **Power Automate** |
|--|--|--|--|
| Admin / Entra app | Required | **Not required** | **Not required** |
| Direction | Two-way (when it works) | **One-way:** Trello → Outlook | **One-way:** Trello → Outlook |
| Title + description | Yes | Yes | Yes |
| Dates | Yes | Yes | Yes |
| Live updates | While Gantt is open | Re-export / re-import when dates change | **Yes** (cloud flow) |

For automatic updates without hosting, see [outlook-power-automate.md](outlook-power-automate.md) (Gantt button **Power Automate**).

## In the Gantt

1. Open the board → **Gantt**.
2. Click **Exporter .ics**.
3. A `.ics` file downloads (one event per dated card).

## Import into Outlook (desktop)

1. Open **Outlook** → **Calendar**.
2. **File** → **Open & Export** → **Import/Export**  
   (or Calendar home → **Add calendar** → **Upload from file**, depending on Outlook version).
3. Choose **Import an iCalendar (.ics) or vCalendar file**.
4. Select the downloaded file → import into your calendar (or a new calendar).

### Outlook on the web

1. Calendar → **Add calendar** → **Upload from file**.
2. Pick the `.ics` → choose a target calendar → **Import**.

## Limitations

- Not a live subscription URL (that would need a public server). Re-export after big date changes.
- Importing again may create **duplicates** unless you import into a dedicated calendar you can replace, or delete the old imported calendar first.
- Tip: create a calendar named e.g. **Trello Gantt**, import there, and replace that calendar when you re-export.

## If you still want Graph later

`AADSTS700016` usually means the app ID was registered in **another** directory than the one you sign into (work tenant vs personal). Without an admin who can consent/install the app in your work tenant, Graph sync will keep failing — use **Exporter .ics** instead.

See also: [outlook-entra-setup.md](outlook-entra-setup.md) (only if you get a working SPA app in a directory you control).
