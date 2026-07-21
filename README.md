# Trello Cerveau — Power-Up Trello

Tu as toujours plein de grandes choses à faire, mais si peu de temps?

As-tu parfois de la difficulté à t'en tenir au plan?

En mettant en place un système, tu passeras moins de temps à faire des listes et plus de temps à profiter de la vie.


### Synchronisation bidirectionnelle avec Trello
<img width="686" height="487" alt="image" src="https://github.com/user-attachments/assets/718f6379-bae3-4b1c-8282-5993f5dff3cd" />
<img width="292" height="192" alt="image" src="https://github.com/user-attachments/assets/9aefc770-22c9-4651-9cbb-4398e7e38c2a" />

### Chat AI (Supporte ChatGPT et OpenRouter)
<img width="623" height="587" alt="image" src="https://github.com/user-attachments/assets/bd495c10-8962-4560-a511-5d24d15c460e" />

### Système de priorité paramétrable
<img width="683" height="624" alt="image" src="https://github.com/user-attachments/assets/0da7cae6-93db-4483-8617-33133fa6750a" />

### Tableau Gantt (Beta)
<img width="2519" height="1167" alt="image" src="https://github.com/user-attachments/assets/77dc05b3-f739-4e18-90ea-f505b07f8ca1" />

### Sous-tâches
<img width="655" height="262" alt="image" src="https://github.com/user-attachments/assets/896ce1d3-6e74-4ad0-81e0-b03866aa6907" />

### Échéances précises
<img width="667" height="720" alt="image" src="https://github.com/user-attachments/assets/f2105fed-a5e0-4ff8-add5-bd9e6ed4a740" />

### Historique
<img width="698" height="199" alt="image" src="https://github.com/user-attachments/assets/f5ca34f2-8c9a-4c88-9d82-6195fc7d97ce" />

### Écran de chargement détaillé
<img width="401" height="304" alt="image" src="https://github.com/user-attachments/assets/53e8bc64-4c4a-493e-b218-fe84a117cefe" />


Aucune étape de build pour le déploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dépôt (ex. GitHub Pages).

You always have so many big things to do, yet so little time?

Do you sometimes have trouble sticking to the plan?

You’re not alone!

By getting a system that works for you, you’ll spend less time making lists and more time enjoying your life.

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
- **Gantt** : vue chronologique du tableau (dates start/due), avec sync Outlook optionnelle (titre, description, dates)
- **Profil** : préférences personnelles (identité, langue/ton de l’assistant, sections visibles dans l’éditeur), stockées en privé sur le compte Trello — accessibles via **Paramètres du Cerveau** → **Mon profil**

---

## Structure du projet

| Chemin | Rôle |
|--------|------|
| `index.html` | Connecteur Power-Up (iframe Trello + page d'accueil hors iframe) |
| `popup.html` | Éditeur de priorité / progrès / agent |
| `settings.html` | Paramètres du tableau (statut, infos, build, guide) |
| `profile.html` | Profil membre (préférences, fonctionnalités, assistant) |
| `welcome.html` | Modal d'accueil à l'activation du Power-Up |
| `outlook-power-automate.html` | Guide in-app : sync Trello → Outlook via Power Automate |
| `gantt.html` | Vue Gantt plein écran (bouton tableau) |
| `outlook-auth.html` | Retour popup MSAL (autorisation Outlook) |
| `components/` | Modules par domaine (JS + CSS colocated) |
| `components/shared/` | Thème Trello, version, REST config, utilitaires |
| `components/priority/` | Score, UI et connecteur Trello priorité |
| `components/completion/` | Progrès / sous-tâches |
| `components/statut/` | Mapping listes → catégories |
| `components/gantt/` | Modèle, UI et connecteur Gantt |
| `components/outlook/` | Auth MSAL, Graph Calendar, sync bidirectionnelle |
| `components/agent/` | Assistant, mémoire, UI chat |
| `components/profile/` | Profil membre |
| `assets/` | Icônes Power-Up et badges SVG |
| `components/shared/rest-config.js` | Clé API Power-Up pour le tri automatique (REST) |
| `components/outlook/outlook-config.js` | Client ID Entra (SPA) pour Outlook |
| `build-info.json` | Horodatage du dernier déploiement |
| `scripts/` | Utilitaires Node (`stamp-build.js`, `render-icon.js`) |
| `sandbox/` | Prototypes UI et scripts de vérification — **non déployés** (voir `sandbox/README.md`) |

### Production vs bac à sable

- **Production** : pages HTML à la racine + `components/`, `assets/` référencés par `index.html`, `popup.html` ou `settings.html`.
- **Bac à sable** (`sandbox/`) : pages ouvertes localement pour itérer sur la formule et l'UI. Charge `../components/priority/priority-ui.js` — pas de bundler.

---

## Développement local

### Prérequis

- Navigateur moderne pour les pages HTML
- **Node.js 18+** : suite de tests, `verify:*`, `stamp:build`
- **Windows + `cscript`** : `verify:presets` (formule de score sans dépendre du navigateur)

### Tests et couverture

```bash
# Suite complète (unitaires + scripts sandbox/verify-*.js verts)
npm test

# Unitaires seulement (plus rapide)
npm run test:unit

# Unitaires + rapport de couverture V8 sur components/
npm run test:coverage
```

Les tests vivent dans `test/` et chargent le JS de production via `require` (voir `test/helpers/load.js`) pour que la couverture instrumente les vrais fichiers. Le lanceur `scripts/run-tests.js` évite les problèmes de glob sous Windows.

### Vérifications (sandbox)

```bash
# Formule baseline, paliers et presets HEAT_SEGMENTS (Windows — cscript)
npm run verify:presets

# Affichage de version / build-info (Node)
npm run verify:version

# Jeu historique de verifies
npm run verify
```

Sous Windows sans npm :

```bat
cscript //nologo sandbox\verify-presets.js
node sandbox\verify-version.js
node scripts\run-tests.js
node scripts\run-tests.js --coverage
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
3. Onglet **Capabilities** / **Capacités** — cocher **uniquement** les six capacités utilisées (voir tableau).  
   Ne **pas** activer `card-buttons`, `list-actions`, `on-disable` ni d'autres capacités non utilisées (des stubs évitent l'erreur console si elles restent cochées).
4. Onglet **API Key** — générer une clé et la copier dans `components/shared/rest-config.js` (`appKey`) pour activer le **tri automatique** (voir [Tri automatique](#tri-automatique)). **Allowed origins** : ajouter l’origine GitHub Pages du Power-Up (ex. `https://VOTRE-UTILISATEUR.github.io`) — sans cela, la fenêtre OAuth peut s’ouvrir puis l’autorisation échoue (le redirect vers `auth-return.html` est bloqué).
5. Enregistrer, attendre la fin du déploiement GitHub Pages si l'URL du connecteur vient de changer.
6. Sur chaque tableau : **retirer et réajouter** le Power-Up (Trello ne recharge pas toujours les capacités sur un tableau déjà ouvert).

Le connecteur enregistre les capacités ci-dessous dans `TrelloPowerUp.initialize()`. La liste canonique vit dans `components/shared/capabilities.js` et est affichée sous **Paramètres du Cerveau → Débogage** (observation runtime + rappel admin). Six sont **utilisées** ; les autres sont des **stubs** (`[]` / no-op) pour éviter l'erreur console si elles restent cochées dans l'admin :

| Capacité | Admin | Rôle dans ce Power-Up | Page / UI |
|----------|:-----:|----------------------|-----------|
| `card-badges` | **Oui** | Badge dynamique sur la **face** de la carte (pastille de palier + libellé, ex. tâche Critique ou complétée) ; rafraîchissement ~10 s | — |
| `card-detail-badges` | **Oui** | Badge **Priorité** au dos de la carte ; clic ouvre le modal d'édition | `popup.html` (modal « Définir la priorité ») |
| `card-back-section` | **Oui** | Section au dos de la carte ; charge `card-open.html` qui **ouvre automatiquement** le modal Cerveau | `card-open.html` → `popup.html` |
| `board-buttons` | **Oui** | Bouton de tableau **Paramètres du Cerveau** | `settings.html` (popup) |
| `list-sorters` | **Oui** | Entrée **Priorité** dans le menu `…` d'une liste → **Trier par…** (Critique en haut, sans priorité en bas) | — |
| `on-enable` | **Oui** | Modal d'accueil à l'**activation** du Power-Up sur un tableau | `welcome.html` |
| `card-buttons` | **Non** | Stub `[]` — la priorité s'ouvre via `card-detail-badges`, pas un bouton sur la face de carte | — |
| `list-actions` | **Non** | Stub `[]` — aucune action supplémentaire dans le menu `…` de liste (le tri passe par `list-sorters`) | — |
| `on-disable` | **Non** | Stub no-op — pas de nettoyage à la désactivation (données partagées conservées) | — |

**À activer (6)** : `card-badges`, `card-detail-badges`, `card-back-section`, `board-buttons`, `list-sorters`, `on-enable`.  
**À ne pas activer** : `card-buttons`, `list-actions`, `on-disable` (stubs présents si cochées par erreur).

Vérification développeur : **Paramètres du Cerveau → Débogage** liste chaque capacité (Activer / Ne pas activer), indique si le connecteur l’a **observée** (handler appelé), et propose un lien vers [l’admin Power-Up](https://trello.com/power-ups/admin) plus la copie des IDs à cocher. Après un changement de capacités, retirer et réajouter le Power-Up sur le tableau.

Dépannage tri / capacités : voir [Trier une colonne par priorité](#trier-une-colonne-par-priorité) et [« Priorité » n'apparaît pas dans *Trier par…*](#priorité-napparaît-pas-dans-trier-par).

---

## Utilisation

### Définir une priorité

1. Ouvrir une carte — le modal **Cerveau** s’ouvre automatiquement si l’option est activée (**Paramètres du Cerveau → Affichage** ; sinon badge **Priorité** ou bouton de la section)
2. Ajuster les curseurs ou toucher un palier sur la barre de chaleur — le badge apparaît sur la carte

### Infos et guide

**Paramètres du Cerveau** (bouton du tableau) : version déployée, horodatage de build, guide de configuration et **Mon profil**.

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
| `components/shared/rest-config.js` → `appKey` | Oui — clé API de [trello.com/power-ups/admin](https://trello.com/power-ups/admin) |
| Admin → **Allowed origins** | Oui — origine Pages (ex. `https://VOTRE-UTILISATEUR.github.io`) |
| `index.html` → `TrelloPowerUp.initialize(…, { appKey, appName })` | Oui (automatique si `appKey` est renseigné) |
| Autorisation OAuth membre (`read,write`) | Oui — une fois par membre via **Paramètres du Cerveau** → **Autoriser Trello** (retour OAuth : `auth-return.html`) |

**Limitations**

- Pas de `t.moveCard` dans le SDK Power-Up : seul `PUT /cards/{id}` avec `pos` (`top`, `bottom` ou valeur numérique) est utilisé.
- Sans `appKey` ou sans autorisation OAuth, la priorité est enregistrée normalement mais **aucun déplacement** n'est effectué (le tri manuel *Trier par… → Priorité* reste disponible).
- Le tri ne s'applique qu'à la **liste courante** de la carte ; les autres listes ne bougent pas.
- Les curseurs déclenchent une sauvegarde immédiate ; le déplacement est **débouncé** (400 ms par défaut, `autoSortDebounceMs` dans `components/shared/rest-config.js`).
- Nécessite la portée REST **écriture** (`write`) pour modifier la position des cartes.

### Sync Outlook (Gantt)

Depuis la vue **Gantt**, les cartes datées peuvent être synchronisées avec le calendrier Outlook du membre (titre ↔ sujet, description ↔ corps, start/due ↔ plage d’événement). Sync **bidirectionnelle** pour les paires carte↔événement déjà liées ; les nouveaux événements Outlook non liés ne créent pas de cartes Trello.

**Fonctionnement (client-only)**

- Auth Microsoft via MSAL (popup) + Microsoft Graph dans le navigateur — **pas de backend**.
- Sync au chargement du Gantt (si déjà connecté), via **Sync Outlook**, et après enregistrement de dates (debounced).
- En cas de conflit sur un champ modifié des deux côtés : **Trello gagne**.
- Mapping stocké en privé membre (`outlookSync`), par tableau.

**Configuration Entra (une fois)**

Voir le guide détaillé : [docs/outlook-entra-setup.md](docs/outlook-entra-setup.md).

**Type d’app :** **Single-page application (SPA)** (pas Web, pas secret client).

1. Portail Azure → **App registrations** → New registration (comptes personnels + organisationnels si besoin).
2. Platform **Single-page application (SPA)** — redirect URI exacte du Power-Up, ex.  
   `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/outlook-auth.html`
3. API permissions (delegated) : `User.Read`, `Calendars.ReadWrite`.
4. Copier l’**Application (client) ID** dans [`components/outlook/outlook-config.js`](components/outlook/outlook-config.js) → `clientId`.
5. Dans le Gantt : **Connecter Outlook**, puis **Sync Outlook**. Autoriser aussi Trello (REST) pour les écritures de titre/description/dates.

**Limitations**

- Pas de webhooks : rien ne sync tant que le Gantt n’est pas ouvert (ou Sync manuel).
- Calendrier par défaut (`primary`) uniquement en v1.
- `clientId` public (SPA) — normal ; pas de secret client dans le dépôt.
- Si Entra / Graph est bloqué (`AADSTS700016`, pas d’admin) :
  - **Power Automate** (auto, cloud Microsoft, sans hébergement) — [docs/outlook-power-automate.md](docs/outlook-power-automate.md) / bouton Gantt **Power Automate**
  - **Exporter .ics** (manuel) — [docs/outlook-ics-export.md](docs/outlook-ics-export.md)

### Messages console sur Trello.com

Certaines erreurs affichées dans la console du navigateur proviennent de **Trello** (application principale ou SDK `power-up.min.js`), pas de ce Power-Up :

| Message | Origine |
|---------|---------|
| `get-paint-metrics.js` — « Deprecated API for given entry type » | Métriques de rendu internes à Trello (React). Sans impact sur le Power-Up. |
| `platform-dst-motion-theme-default` — « Client must be initialized… » | Bug interne du SDK `power-up.min.js` (FeatureGates / thème ADS). Évité côté Power-Up via `useADSTokens: false` + sync manuelle de `data-color-mode` (`PriorityTrello.createIframeClient`). |

Les pages iframe reportent les appels API via `t.render()` (`runWhenIframeReady`). Les URL passées à `t.modal()` / `t.popup()` sont résolues en absolu via `PriorityTrello.pageUrl()` (sans `t.signUrl()`, qui provoque un double-signalement). `t.signUrl()` reste réservé aux requêtes `fetch` (ex. `build-info.json` dans les paramètres).

---

## Stockage Trello

| Portée | Clé | Contenu |
|--------|-----|---------|
| Carte (`shared`) | `cardPriority` | `{ urgency, impact, ease }` |
| Membre (`private`) | `outlookSync` | Mapping carte ↔ événement Outlook par tableau |

---

## Licence

Voir [LICENSE](LICENSE).
