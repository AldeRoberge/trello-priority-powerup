# Tests Playwright (vrai navigateur, faux Trello)

Ouvre **chaque page du Power-Up** dans un vrai navigateur, branchée sur un faux Trello local, et s'en sert comme un utilisateur : parcours écrits à la main (`specs/flows-*.spec.js`) et explorateur qui clique, tape, glisse et appuie sur des touches au hasard (`specs/explore.spec.js`). Tout ce qui cloche est rapporté : erreur JS non attrapée, `console.error`, requête en échec, page figée, texte `undefined`/`NaN`, débordement horizontal, texte coupé, bouton sans nom, URL construite avec `undefined`, `pluginData` au-delà des 4096 caractères de Trello.

```powershell
npm run test:pw                 # tout (bureau + largeur téléphone)
npm run test:pw -- table        # un seul fichier (toute option Playwright passe après --)
npm run test:pw:headed          # voir le navigateur
npm run test:pw:explore         # seulement l'explorateur
npm run test:pw:report          # rapport HTML (captures, traces des échecs)
npm run test:pw:serve           # démarre le faux Trello pour cliquer soi-même
```

Navigateur : Microsoft Edge installé (aucun téléchargement). Pour un autre : `$env:E2E_BROWSER_CHANNEL = 'chrome'`, ou vide puis `npx playwright install chromium`.

## Résultat

- Une **erreur** fait échouer le test ; un **avertissement** (mise en page, accessibilité) est seulement listé. `$env:E2E_STRICT = '1'` fait aussi échouer sur les avertissements.
- `e2e/.out/problems.md` regroupe tout ce qui a été trouvé (avec les dernières actions avant chaque problème) ; `problems.json` contient le détail.
- L'explorateur est reproductible : même graine, mêmes actions. `E2E_SEED=abc`, `E2E_STEPS=200`, `E2E_EXPLORE_MS=90000` changent la graine et le budget.

## Le faux Trello (`e2e/fake-trello/`)

| Fichier | Rôle |
|---|---|
| `model.js` | Un tableau en mémoire : listes, cartes, membres, étiquettes, champs personnalisés, `pluginData` (limite 4096 caractères par portée), routes REST `api.trello.com/1/...`. Note ce qu'il ne sait pas faire (`gaps`) et les règles de Trello enfreintes (`violations`). |
| `power-up-sdk.js` | Remplace `p.trellocdn.com/power-up.min.js` : `TrelloPowerUp.iframe()` (`t.get/set/cards/lists/board/card/member/modal/popup/alert/...`), réécrit `api.trello.com` vers le faux serveur, dessine modales et fenêtres comme le fait Trello. |
| `server.js` | Sert le dépôt tel quel (le script du SDK est remplacé à la volée) et les appels du faux Trello. |
| `board.html` / `board.js` | Un faux tableau : charge le connecteur (`index.html`), affiche ses boutons de tableau, ses badges de carte et la section de dos de carte. |

Une dépendance Trello manquante est une **lacune du faux Trello** (`fake-trello-gap`, fait échouer le test) : l'ajouter dans `model.js` ou `power-up-sdk.js`.

Les services externes sont simulés dans `mocks.js` (IA, météo, géocodage) ; seules les polices et icônes (jsDelivr, Google Fonts) passent par le vrai réseau. Toute autre requête externe est bloquée et signalée.

## Écrire un parcours

```js
const { test, expect } = require('../fixtures');

test('renommer une carte dans le tableau', async ({ app, page }) => {
  await app.open('table');                    // page + attente de la fin du chargement
  app.step('double-clic sur le titre');       // apparaît dans « après : » si un problème survient
  await page.getByText('Planifier le budget 2027').dblclick();
  await page.keyboard.type('Budget 2027 révisé');
  await page.keyboard.press('Enter');
  await expect.poll(() => app.card('c8').name).toBe('Budget 2027 révisé'); // ce que Trello a reçu
});
```

Aides de `app` : `open(page, { query, card })`, `openBoard()`, `settle()`, `check()`, `card(id|nom)`, `list(id|nom)`, `cardData(id, clé)`, `rest(méthode, /motif/)`, `hostCalls()`, `setTheme()`, `setAuthorized()`, `allow(type, /motif/)` (problème attendu dans ce test), `model` (état du faux Trello). Chaque test repart d'un tableau neuf (`seedData()` dans `model.js` : 4 listes, 12 cartes, 2 membres).
