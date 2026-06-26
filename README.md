# Priorité — Power-Up Trello

Power-Up Trello pour évaluer chaque carte selon **l'urgence**, **l'impact** et **l'effort** : score 0–10, palier (Critique → Optionnel) et badges colorés sur le tableau.

Aucune étape de build pour le déploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dépôt (ex. GitHub Pages).

---

## Fonctionnalités

- **Trois axes** (urgence 0–4, impact 0–4, effort 1–5) avec barre de chaleur et curseurs
- **Score et palier** calculés par formule baseline (0–10)
- **Badges** sur les cartes en vue tableau (`score · palier`, ex. `7.9 · Urgent`)
- **Popup « Définir la priorité »** : 3 curseurs + barre de chaleur dans le détail de carte
- **Paramètres du tableau** : courte description, horodatage de build et lien vers le guide de configuration
- **Horodatage de build** affiché sur la page d'accueil du connecteur (`build-info.json`, horodaté à chaque déploiement CI dans l'artifact publié)
- **Compatibilité** : les anciennes priorités P1–P5 sont lues pour l'affichage jusqu'à la prochaine sauvegarde

---

## Structure du projet

| Chemin | Rôle |
|--------|------|
| `index.html` | Connecteur Power-Up (iframe Trello + page d'accueil hors iframe) |
| `popup.html` | Éditeur de priorité (3 curseurs + barre de chaleur) |
| `settings.html` | Paramètres du tableau (infos, build, guide) |
| `welcome.html` | Modal d'accueil à l'activation du Power-Up |
| `priority-ui.js` | Formule de score, composants UI (`PriorityUI`) |
| `priority-ui.css` | Styles de l'éditeur de priorité |
| `priority-trello.js` | Pont Trello (stockage, badges, affichage) |
| `trello-api-config-template.js` | Modèle pour la clé API Trello (couleurs de couverture de carte) |
| `version.js` | Affichage de la version / date de build |
| `trello-theme.css` | Styles communs des pages Power-Up |
| `build-info.json` | Horodatage du dernier déploiement |
| `scripts/` | Utilitaires Node (`stamp-build.js`, `write-trello-api-config.js`, `render-icon.js`) |
| `sandbox/` | Prototypes UI et scripts de vérification — **non déployés** (voir `sandbox/README.md`) |

### Production vs bac à sable

- **Production** : tout fichier à la racine référencé par `index.html`, `popup.html` ou `settings.html`. C'est ce qui doit être hébergé pour Trello.
- **Bac à sable** (`sandbox/`) : pages ouvertes localement pour itérer sur la formule et l'UI. Charge `../priority-ui.js` — pas de bundler.

---

## Développement local

### Prérequis

- Navigateur moderne pour les pages HTML
- **Node.js** (optionnel) : `verify:version`, `stamp:build`
- **Windows + `cscript`** : `verify:presets` (formule de score sans dépendre du navigateur)

### Vérifications

```bash
# Formule baseline, paliers et presets HEAT_SEGMENTS (Windows — cscript)
npm run verify:presets

# Affichage de version / build-info (Node)
npm run verify:version

# Les deux
npm run verify
```

Sous Windows sans npm :

```bat
cscript //nologo sandbox\verify-presets.js
node sandbox\verify-version.js
```

### Bac à sable UI

Ouvrir `sandbox/priority-variants.html` dans le navigateur (double-clic ou serveur statique local). Détails dans [sandbox/README.md](sandbox/README.md).

### Clé API Trello (couleurs de carte)

La synchronisation des couleurs de couverture de carte sur le tableau nécessite la clé API de votre Power-Up. Le fichier `trello-api-config.js` contient cette clé et **n'est pas versionné** (voir `.gitignore`).

1. Copier `trello-api-config-template.js` vers `trello-api-config.js`
2. Aller sur [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → votre Power-Up → onglet **API Key**
3. Coller la clé dans `appKey` (laisser vide pour désactiver la synchro des couvertures ; les badges restent actifs)
4. Dans le même onglet **API Key**, section **Allowed origins**, ajouter l’URL exacte du connecteur :
   - GitHub Pages (ce dépôt) : `https://alderoberge.github.io/trello-priority-powerup/index.html`
   - Développement local (serveur HTTP sur un port fixe) : `http://localhost:8080` (adapter le port)
   - **Ne pas** utiliser `*` — Trello le refuse pour OAuth

Sans origine autorisée, l’édition de priorité fonctionne (badges, stockage carte), mais l’OAuth pour les couleurs de couverture affiche *Invalid return_url* lors de la première modification qui déclenche la synchro.

En **production (GitHub Pages)**, la clé n'est pas versionnée : le workflow CI génère `trello-api-config.js` à partir du secret **`TRELLO_API_KEY`** (voir [Déploiement](#déploiement-github-pages)).

### Horodatage de build (local)

```bash
npm run stamp:build
```

En production, le workflow `.github/workflows/static.yml` horodate `build-info.json` sur le runner (sans commit dans le dépôt) et déploie le site à chaque push sur `main`.

---

## Déploiement (GitHub Pages)

1. Créer un dépôt **public** et pousser la branche `main` (racine du site = racine du dépôt).
2. **Settings → Pages → Build and deployment** → **Source** : **GitHub Actions** (obligatoire — **pas** « Deploy from a branch »). Tant que la source reste une branche, GitHub lance aussi `pages-build-deployment` à chaque push, ce qui entre en conflit avec ce workflow.
3. **Settings → Secrets and variables → Actions → New repository secret** :
   - **`TRELLO_API_KEY`** — clé API du Power-Up (même valeur que `appKey` en local ; [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → Power-Up → **API Key**). Sans ce secret, le déploiement réussit mais la synchro des couleurs de couverture reste désactivée sur le site publié.
4. Le workflow génère `trello-api-config.js` sur le runner, horodate `build-info.json`, puis publie la racine via `upload-pages-artifact` / `deploy-pages` (aucun push depuis la CI).
5. URL du site : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/`

Dépannage (déploiement bloqué, source Pages) : [.github/DEPLOYMENT.md](.github/DEPLOYMENT.md).

### Enregistrer le Power-Up

1. [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → **Create new Power-Up** (ou ouvrir le Power-Up existant)
2. **Iframe connector URL** (onglet principal du Power-Up) :
   `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/index.html`
3. Onglet **API Key** → **Allowed origins** : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/index.html` (voir [Configuration OAuth REST API](#configuration-oauth-rest-api-couleurs-de-couverture))
4. Capacités : `card-badges`, `card-detail-badges`, `board-buttons` (ne pas activer `card-buttons` — non utilisé par ce Power-Up)
5. Ajouter le Power-Up à un tableau via le menu Power-Ups

### Configuration OAuth REST API (couleurs de couverture)

La synchro des couleurs de couverture utilise `client.authorize()` de Trello. Sans configuration correcte, vous verrez :

> Invalid return_url. The return URL should match the application's allowed origins.

**Checklist admin (dans le même Power-Up que l’Iframe connector URL) :**

| Étape | Où | Valeur exacte |
|-------|-----|---------------|
| 1. Iframe connector URL | Onglet principal du Power-Up | `https://alderoberge.github.io/trello-priority-powerup/index.html` |
| 2. API Key | Onglet **API Key** → copier la clé | Doit être **identique** à `appKey` dans `trello-api-config.js` (local) ou au secret GitHub **`TRELLO_API_KEY`** (production) |
| 3. Allowed origins | [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → Power-Up → onglet **API Key** → **Allowed origins** | Ajouter **`https://alderoberge.github.io/trello-priority-powerup/index.html`** (URL complète du connecteur — confirmée pour OAuth/popup) |
| 4. Vérifier la clé déployée | GitHub → Settings → Secrets → `TRELLO_API_KEY` | Même clé que l’onglet API Key du Power-Up ci-dessus — une clé d’un autre Power-Up provoque l’erreur `Invalid return_url` même si les origines sont correctes ailleurs |
| 5. Redéployer | Push sur `main` ou relancer le workflow Pages | Le site doit servir la dernière version de `priority-trello.js` |

**Iframe connector URL et Allowed origins**

- **Iframe connector URL** : URL complète de `index.html` — c’est la page où Trello charge le connecteur Power-Up.
- **Allowed origins** : entrée admin pour autoriser le **retour OAuth** (`return_url`). Pour ce déploiement GitHub Pages, utiliser la même URL complète que l’Iframe connector : `https://alderoberge.github.io/trello-priority-powerup/index.html`.
- Ce Power-Up force `return_url` vers **`index.html`** (le connecteur), pas `popup.html`.

**Comportement OAuth dans ce Power-Up**

- L’ouverture du popup **ne déclenche plus** OAuth — les curseurs et badges fonctionnent via le stockage Power-Up (`t.set`), sans REST API.
- OAuth n’est demandé que lors d’un **changement utilisateur** (curseur, case « en attente ») qui nécessite une synchro de couverture, via `promptOAuth: true` — pas à l’ouverture ni à la fermeture du popup.
- `client.authorize()` reçoit `return_url: …/index.html` (connecteur), pas `popup.html`.
- Si l’erreur cite encore `popup.html` dans `return_url`, le site GitHub Pages n’a pas encore la version corrigée de `priority-trello.js` — redéployer.

**Dépannage `Invalid return_url`**

1. Confirmer que **`TRELLO_API_KEY`** (GitHub) = clé API du Power-Up dont l’Iframe connector URL pointe vers ce dépôt.
2. Dans **Allowed origins** ([trello.com/power-ups/admin](https://trello.com/power-ups/admin) → Power-Up → **API Key**), entrer `https://alderoberge.github.io/trello-priority-powerup/index.html` — la même URL que l’Iframe connector URL.
3. Si aucune origine n’est enregistrée, **aucun** `return_url` ne fonctionne (comportement Trello).
4. Après modification des origines, réessayer depuis Trello (pas besoin de redéployer le site pour ce seul changement admin).
5. En local : ajouter `http://localhost:PORT` comme origine autorisée si vous testez avec un serveur local.

---

## Utilisation

### Définir une priorité

1. Ouvrir une carte → **Définir la priorité**
2. Ajuster les curseurs ou toucher un palier sur la barre de chaleur — le badge apparaît sur la carte

### Infos et guide

**Paramètres de priorité** (bouton du tableau) : version déployée, horodatage de build et lien vers le guide de configuration.

### Effacer une priorité

Popup **Définir la priorité** → **Effacer la priorité**

### Messages console sur Trello.com

Certaines erreurs affichées dans la console du navigateur proviennent de **Trello** (application principale ou SDK `power-up.min.js`), pas de ce Power-Up :

| Message | Origine |
|---------|---------|
| `get-paint-metrics.js` — « Deprecated API for given entry type » | Métriques de rendu internes à Trello (React). Sans impact sur le Power-Up. |
| `platform-dst-motion-theme-default` — « Client must be initialized… » | Contrôle interne du thème / feature gate Atlassian. Souvent bénin si badges et popup fonctionnent. |

Les pages iframe reportent les appels API via `t.render()` (`runWhenIframeReady`). Les URL passées à `t.modal()` / `t.popup()` sont résolues en absolu via `PriorityTrello.pageUrl()` (sans `t.signUrl()`, qui provoque un double-signalement). `t.signUrl()` reste réservé aux requêtes `fetch` (ex. `build-info.json` dans les paramètres).

---

## Stockage Trello

| Portée | Clé | Contenu |
|--------|-----|---------|
| Carte (`shared`) | `cardPriority` | `{ urgency, impact, ease }` |

---

## Licence

Voir [LICENSE](LICENSE).
