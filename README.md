# Priorité — Power-Up Trello

Power-Up Trello pour évaluer chaque carte selon **l'urgence**, **l'impact** et **la facilité** : score 0–10, palier (Critique → Optionnel) et badges colorés sur le tableau.

Aucune étape de build pour le déploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dépôt (ex. GitHub Pages).

---

## Fonctionnalités

- **Trois axes** (urgence 0–4, impact 0–4, facilité 1–5) avec barre de chaleur et curseurs
- **Score et palier** calculés par formule baseline (0–10)
- **Badges colorés** sur les cartes en vue tableau (`score · palier`, ex. `7.9 · Urgent`) — pastille colorée selon le palier
- **Popup « Définir la priorité »** : 3 curseurs + barre de chaleur dans le détail de carte
- **Paramètres du tableau** : courte description, horodatage de build et lien vers le guide de configuration
- **Horodatage de build** affiché sur la page d'accueil du connecteur (`build-info.json`, horodaté à chaque déploiement CI dans l'artifact publié)
- **Compatibilité** : les anciennes priorités P1–P5 sont lues pour l'affichage jusqu'à la prochaine sauvegarde
- **Tri par colonne** : menu `…` d'une liste → **Trier par…** → **Priorité** (Critique en haut, cartes sans priorité en bas)
- **Tri automatique** (optionnel) : après chaque changement de priorité, la carte se réordonne dans sa liste (nécessite clé API + autorisation OAuth ; voir ci-dessous)

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
| `priority-trello.js` | Pont Trello (stockage, badges, affichage, tri) |
| `rest-config.js` | Clé API Power-Up pour le tri automatique (REST) |
| `version.js` | Affichage de la version / date de build |
| `trello-theme.css` | Styles communs des pages Power-Up |
| `build-info.json` | Horodatage du dernier déploiement |
| `scripts/` | Utilitaires Node (`stamp-build.js`, `render-icon.js`) |
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

### Limite Trello : couleur de fond des cartes

Les Power-Ups **ne peuvent pas** modifier le fond d'une carte en vue tableau. Trello n'expose ni CSS injectable sur le tableau, ni propriété API pour colorer la surface de la carte. Les seuls moyens visuels disponibles sont :

- **Badges** (`card-badges`) — pastille colorée + texte sur la face de la carte (utilisé par ce Power-Up)
- **Étiquettes** (labels Trello natifs) — bandeau de couleur en haut de la carte
- **Couverture** (cover REST API) — bandeau coloré ou image en haut de la carte uniquement, pas le fond entier

Ce Power-Up affiche la priorité via des **badges colorés** (`score · palier`). Pour un fond de carte entièrement coloré, il faudrait une extension navigateur qui modifie le DOM/CSS de Trello — ce n'est pas possible dans le modèle iframe Power-Up.

La synchronisation des **couvertures** de carte (bandeau coloré via REST API) n'est **pas** implémentée dans ce dépôt. Le connecteur n'utilise que `t.get` / `t.set` (données partagées Power-Up).

### Horodatage de build (local)

```bash
npm run stamp:build
```

En production, le workflow `.github/workflows/static.yml` horodate `build-info.json` sur le runner (sans commit dans le dépôt) et déploie le site à chaque push sur `main`.

---

## Déploiement (GitHub Pages)

1. Créer un dépôt **public** et pousser la branche `main` (racine du site = racine du dépôt).
2. **Settings → Pages → Build and deployment** → **Source** : **GitHub Actions** (obligatoire — **pas** « Deploy from a branch »). Tant que la source reste une branche, GitHub lance aussi `pages-build-deployment` à chaque push, ce qui entre en conflit avec ce workflow.
3. Le workflow horodate `build-info.json`, puis publie la racine via `upload-pages-artifact` / `deploy-pages` (aucun push depuis la CI).
4. URL du site : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/`

Dépannage (déploiement bloqué, source Pages) : [.github/DEPLOYMENT.md](.github/DEPLOYMENT.md).

### Configuration admin Trello

Après le déploiement GitHub Pages, enregistrez ou mettez à jour le Power-Up sur [trello.com/power-ups/admin](https://trello.com/power-ups/admin).

#### Étapes

1. **Create new Power-Up** (ou ouvrir le Power-Up existant).
2. Onglet **Basic information** / informations principales :
   - **Iframe connector URL** : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/index.html`  
     Doit pointer vers `index.html` à la racine du site déployé (connecteur chargé par Trello dans une iframe).
3. Onglet **Capabilities** / **Capacités** — cocher **uniquement** les cinq capacités utilisées (voir tableau).  
   Ne **pas** activer `card-buttons`, `list-actions`, `on-disable` ni d'autres capacités non utilisées (des stubs évitent l'erreur console si elles restent cochées).
4. Onglet **API Key** — générer une clé et la copier dans `rest-config.js` (`appKey`) pour activer le **tri automatique** (voir [Tri automatique](#tri-automatique)). **Allowed origins** : *non requis* pour les pages statiques du Power-Up ; l'OAuth REST utilise le flux intégré Trello.
5. Enregistrer, attendre la fin du déploiement GitHub Pages si l'URL du connecteur vient de changer.
6. Sur chaque tableau : **retirer et réajouter** le Power-Up (Trello ne recharge pas toujours les capacités sur un tableau déjà ouvert).

Le connecteur enregistre les capacités ci-dessous dans `TrelloPowerUp.initialize()`. Cinq sont **utilisées** ; les autres sont des **stubs** (`[]` / no-op) pour éviter l'erreur console si elles restent cochées dans l'admin :

| Capacité | Admin | Rôle dans ce Power-Up | Page / UI |
|----------|:-----:|----------------------|-----------|
| `card-badges` | **Oui** | Badge dynamique sur la **face** de la carte (pastille de palier + libellé, ex. tâche Critique ou complétée) ; rafraîchissement ~10 s | — |
| `card-detail-badges` | **Oui** | Badge **Priorité** au dos de la carte ; clic ouvre le modal d'édition | `popup.html` (modal « Définir la priorité ») |
| `board-buttons` | **Oui** | Bouton de tableau **Paramètres de priorité** | `settings.html` (popup) |
| `list-sorters` | **Oui** | Entrée **Priorité** dans le menu `…` d'une liste → **Trier par…** (Critique en haut, sans priorité en bas) | — |
| `on-enable` | **Oui** | Modal d'accueil à l'**activation** du Power-Up sur un tableau | `welcome.html` |
| `card-buttons` | **Non** | Stub `[]` — la priorité s'ouvre via `card-detail-badges`, pas un bouton sur la face de carte | — |
| `list-actions` | **Non** | Stub `[]` — aucune action supplémentaire dans le menu `…` de liste (le tri passe par `list-sorters`) | — |
| `on-disable` | **Non** | Stub no-op — pas de nettoyage à la désactivation (données partagées conservées) | — |

**À activer (5)** : `card-badges`, `card-detail-badges`, `board-buttons`, `list-sorters`, `on-enable`.  
**À ne pas activer** : `card-buttons`, `list-actions`, `on-disable` (stubs présents si cochées par erreur).

Dépannage tri / capacités : voir [Trier une colonne par priorité](#trier-une-colonne-par-priorité) et [« Priorité » n'apparaît pas dans *Trier par…*](#priorité-napparaît-pas-dans-trier-par).

---

## Utilisation

### Définir une priorité

1. Ouvrir une carte → **Définir la priorité**
2. Ajuster les curseurs ou toucher un palier sur la barre de chaleur — le badge apparaît sur la carte

### Infos et guide

**Paramètres de priorité** (bouton du tableau) : version déployée, horodatage de build et lien vers le guide de configuration.

### Effacer une priorité

Popup **Définir la priorité** → **Effacer la priorité**

### Trier une colonne par priorité

1. Sur le tableau, ouvrir le menu `…` de la liste (colonne)
2. Choisir **Trier par…** → **Priorité**
3. Les cartes sont réordonnées : Critique → Urgent → … → Optionnel → Inutile ; les cartes sans priorité passent en bas

Les cartes **en attente** (bloquées) sont classées selon leur palier sous-jacent (score et palier calculés), pas selon l'état bloqué.

Le tri utilise la capacité native `list-sorters` de Trello (`sortedIds`) — **aucun appel REST ni OAuth** n'est requis. Seules les données `t.get` / `t.set` du Power-Up sont lues.

#### « Priorité » n'apparaît pas dans *Trier par…*

1. Vérifier que `list-sorters` est coché dans [trello.com/power-ups/admin](https://trello.com/power-ups/admin) pour ce Power-Up
2. Vérifier que l'URL du connecteur pointe vers la version déployée (`index.html` à jour)
3. Retirer le Power-Up du tableau, rafraîchir la page, le réactiver
4. Ouvrir le menu `…` de la **liste** (pas du tableau) → **Trier par…** — l'entrée **Priorité** est fournie par ce Power-Up

**Alternative** si le tri natif reste indisponible (capacité non activée, cache Trello, etc.) : réordonner les cartes **manuellement** en vous aidant des badges de priorité sur chaque carte (Critique en haut → sans priorité en bas), ou activer le [tri automatique](#tri-automatique) si la clé API et l'autorisation OAuth sont configurées.

Signature du callback (SDK actuel) : `callback(t, opts)` avec `opts.cards` (tableau des cartes de la liste) ; retour `{ sortedIds: [id, …] }` (Promise acceptée).

### Tri automatique

Lorsqu'un membre modifie la priorité d'une carte (curseurs, palier, état bloqué, etc.), le Power-Up peut **réordonner uniquement cette carte** dans sa liste via l'API REST Trello (`PUT /1/cards/{id}` avec `pos`). Le reste du tableau n'est pas re-trié.

**Règles** (identiques au tri manuel *Priorité*) :

1. Palier le plus élevé en haut : Critique → Urgent → Prioritaire → … → Optionnel → Inutile
2. À palier égal : score plus élevé en haut
3. Cartes **bloquées** : classées selon le palier sous-jacent (pas selon l'état bloqué)
4. Cartes **sans priorité** : en bas de la liste
5. À priorité égale : l'ordre actuel dans la liste est conservé (tri stable)

**Prérequis admin / déploiement**

| Élément | Requis pour le tri auto |
|---------|-------------------------|
| Capacités `card-detail-badges`, etc. | Oui (comme aujourd'hui) |
| `list-sorters` | Non (tri manuel reste indépendant) |
| `rest-config.js` → `appKey` | Oui — clé API de [trello.com/power-ups/admin](https://trello.com/power-ups/admin) |
| `index.html` → `TrelloPowerUp.initialize(…, { appKey, appName })` | Oui (automatique si `appKey` est renseigné) |
| Autorisation OAuth membre (`read,write`) | Oui — une fois par membre via **Paramètres de priorité** → **Autoriser le tri automatique** |

**Limitations**

- Pas de `t.moveCard` dans le SDK Power-Up : seul `PUT /cards/{id}` avec `pos` (`top`, `bottom` ou valeur numérique) est utilisé.
- Sans `appKey` ou sans autorisation OAuth, la priorité est enregistrée normalement mais **aucun déplacement** n'est effectué (le tri manuel *Trier par… → Priorité* reste disponible).
- Le tri ne s'applique qu'à la **liste courante** de la carte ; les autres listes ne bougent pas.
- Les curseurs déclenchent une sauvegarde immédiate ; le déplacement est **débouncé** (400 ms par défaut, `autoSortDebounceMs` dans `rest-config.js`).
- Nécessite la portée REST **écriture** (`write`) pour modifier la position des cartes.

### Messages console sur Trello.com

Certaines erreurs affichées dans la console du navigateur proviennent de **Trello** (application principale ou SDK `power-up.min.js`), pas de ce Power-Up :

| Message | Origine |
|---------|---------|
| `get-paint-metrics.js` — « Deprecated API for given entry type » | Métriques de rendu internes à Trello (React). Sans impact sur le Power-Up. |
| `platform-dst-motion-theme-default` — « Client must be initialized… » | Bug interne du SDK `power-up.min.js` (FeatureGates / thème iframe). Se produit au premier `TrelloPowerUp.iframe()` ; **non corrigeable** côté Power-Up. Bénin si badges et popup fonctionnent. |

Les pages iframe reportent les appels API via `t.render()` (`runWhenIframeReady`). Les URL passées à `t.modal()` / `t.popup()` sont résolues en absolu via `PriorityTrello.pageUrl()` (sans `t.signUrl()`, qui provoque un double-signalement). `t.signUrl()` reste réservé aux requêtes `fetch` (ex. `build-info.json` dans les paramètres).

---

## Stockage Trello

| Portée | Clé | Contenu |
|--------|-----|---------|
| Carte (`shared`) | `cardPriority` | `{ urgency, impact, ease }` |

---

## Licence

Voir [LICENSE](LICENSE).
