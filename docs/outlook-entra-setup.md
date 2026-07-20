# Outlook sync — Entra app setup

Guide to register the Microsoft identity app used by the Gantt ↔ Outlook calendar sync.

## What type of app to create?

Create a **Single-page application (SPA)** under **Microsoft Entra ID → App registrations**.

| Choice | Use this? | Why |
|--------|-----------|-----|
| **Single-page application (SPA)** | **Yes** | The Power-Up runs in the browser (GitHub Pages). Auth uses MSAL + PKCE popup. |
| Web / confidential client | No | Would need a client secret and a backend. This Power-Up has neither. |
| Mobile / desktop (public client) | No | Wrong redirect / platform for an iframe Power-Up. |
| Daemon / service principal | No | No user sign-in; cannot access a member’s Outlook calendar. |

Also:

- **Public client** (no client secret, no certificates).
- **Delegated** Microsoft Graph permissions (signed-in user), not application permissions.
- Account type: **personal + work/school** (unless you intentionally restrict to one tenant).

## Prerequisites

- Access to [Azure Portal](https://portal.azure.com) or [Microsoft Entra admin center](https://entra.microsoft.com)
- Your Power-Up base URL on GitHub Pages, for example:  
  `https://AldeRoberge.github.io/trello-priority-powerup`

## Step-by-step

### 1. New app registration

1. Open **Microsoft Entra ID** → **App registrations** → **New registration**.
2. **Name:** e.g. `Trello Cerveau Outlook`.
3. **Supported account types:**  
   **Accounts in any organizational directory and personal Microsoft accounts**  
   (matches `authority: https://login.microsoftonline.com/common` in the Power-Up).
4. **Redirect URI:**
   - Platform: **Single-page application (SPA)**
   - URI (exact match required):

   ```text
   https://AldeRoberge.github.io/trello-priority-powerup/outlook-auth.html
   ```

   Replace the host/path if your Pages URL is different. No trailing slash.
5. Click **Register**.

### 2. Copy the client ID

On the app **Overview** page, copy **Application (client) ID**.

Paste it into [`components/outlook/outlook-config.js`](../components/outlook/outlook-config.js):

```js
clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
```

Commit and deploy so GitHub Pages serves the updated file.

### 3. API permissions (delegated)

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**.
2. Add:
   - `User.Read` (often present by default)
   - `Calendars.ReadWrite`
3. **Add permissions**.

Do **not** add application permissions such as `Calendars.ReadWrite` (Application). Those need admin consent and a daemon app.

Personal Microsoft accounts consent in the popup. Work tenants may need an admin to **Grant admin consent** depending on org policy.

### 4. Confirm Authentication settings

Under **Authentication**:

- Platform **Single-page application** lists your `outlook-auth.html` URI.
- No **client secrets** or certificates.
- Implicit grant is not required (MSAL uses auth code + PKCE).

### 5. Use it in Trello

1. Open the board → **Gantt**.
2. Click **Autoriser Trello** (needed to write title / description / dates back to cards).
3. Click **Connecter Outlook**, sign in, accept consent.
4. Click **Sync Outlook**.

## Checklist

- [ ] App type = **SPA** (not Web)
- [ ] Redirect URI = `…/outlook-auth.html` (exact URL, HTTPS)
- [ ] `clientId` set in `outlook-config.js` and deployed
- [ ] Delegated: `User.Read`, `Calendars.ReadWrite`
- [ ] No client secret created
- [ ] Trello REST authorized in the Gantt

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Popup closes with an error after login | Redirect URI mismatch (wrong path, `http` vs `https`, trailing slash) |
| Toolbar shows **Outlook (config)** disabled | Empty `clientId` in `outlook-config.js`, or Pages not redeployed |
| Calendar consent denied | Missing `Calendars.ReadWrite`, or tenant blocks the permission |
| Titles/dates don’t update in Trello | Outlook connected but Trello OAuth not authorized |
| Portal error `AADSTS16000` / app `ADIbizaUX` / tenant **Microsoft Services** | Azure Portal sign-in stuck on the wrong tenant — see below |

### AADSTS16000 with `ADIbizaUX` (Azure Portal, not the Power-Up)

If the error JSON looks like this:

- `clientId`: `74658136-14ec-4630-ad9b-26e160ff0fc6` (**ADIbizaUX**)
- tenant: **Microsoft Services**
- identity provider: **live.com**

that is the **Azure Portal** app, not Trello Cerveau. Your personal Microsoft account landed in Microsoft’s shared “Services” tenant, where you cannot create App registrations.

**Fix — create (or open) your own directory:**

1. Open a private/incognito window (avoids sticky SSO).
2. Go to [https://azure.microsoft.com/free/](https://azure.microsoft.com/free/) and start a free Azure account with the same Microsoft account (or use an existing work/school account that already has a tenant).
3. After signup you get a real directory (e.g. `something.onmicrosoft.com`) and you are Global Admin there.
4. Sign in at [https://portal.azure.com](https://portal.azure.com) → top-right profile → **Switch directory** → pick **your** directory (not “Microsoft Services”).
5. Then create the **SPA** App registration as in the steps above.

Alternative if you already have a tenant: ask that tenant’s admin to invite your `live.com` account as a guest, accept the invite, then switch directory to that tenant.

Do **not** paste the `ADIbizaUX` client ID into `outlook-config.js`. Use only the **Application (client) ID** from *your* App registration Overview page.

## Related files

| File | Role |
|------|------|
| [`components/outlook/outlook-config.js`](../components/outlook/outlook-config.js) | `clientId`, scopes, authority |
| [`outlook-auth.html`](../outlook-auth.html) | MSAL popup redirect page |
| [`components/outlook/outlook-auth.js`](../components/outlook/outlook-auth.js) | MSAL login / token |
| [`README.md`](../README.md) | Product overview (Sync Outlook section) |
