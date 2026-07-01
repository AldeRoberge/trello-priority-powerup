# Priorité — Power-Up Trello

Power-Up Trello pour évaluer chaque carte selon **l'urgence**, **l'impact** et **l'effort** : score 0–10, palier (Critique → Optionnel) et badges colorés sur le tableau.

Aucune étape de build pour le déploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dépôt (ex. GitHub Pages).

---

## Fonctionnalités

- **Trois axes** (urgence 0–4, impact 0–4, effort 1–5) avec barre de chaleur et curseurs
- **Score et palier** calculés par formule baseline (0–10)
- **Badges colorés** sur les cartes en vue tableau (`score · palier`, ex. `7.9 · Urgent`) — pastille colorée selon le palier
- **Popup « Définir la priorité »** : 3 curseurs + barre de chaleur dans le détail de carte
- **Paramètres du tableau** : courte description, horodatage de build et lien vers le guide de configuration
- **Horodatage de build** affiché sur la page d'accueil du connecteur (`build-info.json`, horodaté à chaque déploiement CI dans l'artifact publié)
- **Compatibilité** : les anciennes priorités P1–P5 sont lues pour l'affichage jusqu'à la prochaine sauvegarde
- **Tri par colonne** : menu `…` d'une liste → **Trier par…** → **Priorité** (Critique en haut, cartes sans priorité en bas)

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
3. Onglet **Capabilities** / **Capacités** — cocher **uniquement** les cinq capacités listées ci-dessous (tableau).  
   Ne **pas** activer `card-buttons` ni d'autres capacités non implémentées dans `index.html`.
4. Onglet **API Key** — **Allowed origins** : *non requis* pour ce Power-Up (pas de `t.authorize`, pas d'appels REST/OAuth ; seulement `t.get` / `t.set` et `t.signUrl` pour des fichiers statiques du même site).
5. Enregistrer, attendre la fin du déploiement GitHub Pages si l'URL du connecteur vient de changer.
6. Sur chaque tableau : **retirer et réajouter** le Power-Up (Trello ne recharge pas toujours les capacités sur un tableau déjà ouvert).

Le connecteur enregistre six clés dans `TrelloPowerUp.initialize()` ; cinq doivent être **activées** dans l'admin, une doit rester **désactivée** :

| Capacité | Admin | Rôle dans ce Power-Up | Page / UI |
|----------|:-----:|----------------------|-----------|
| `card-badges` | **Oui** | Badge dynamique sur la **face** de la carte (pastille de palier + libellé, ex. tâche Critique ou complétée) ; rafraîchissement ~10 s | — |
| `card-detail-badges` | **Oui** | Badge **Priorité** au dos de la carte ; clic ouvre le modal d'édition | `popup.html` (modal « Définir la priorité ») |
| `board-buttons` | **Oui** | Bouton de tableau **Paramètres de priorité** | `settings.html` (popup) |
| `list-sorters` | **Oui** | Entrée **Priorité** dans le menu `…` d'une liste → **Trier par…** (Critique en haut, sans priorité en bas) | — |
| `on-enable` | **Oui** | Modal d'accueil à l'**activation** du Power-Up sur un tableau | `welcome.html` |
| `card-buttons` | **Non** | Non utilisé — la priorité s'ouvre via `card-detail-badges`, pas un bouton sur la face de carte. Le connecteur renvoie `[]` si la capacité est cochée par erreur (évite une erreur Trello) | — |

**À activer (5)** : `card-badges`, `card-detail-badges`, `board-buttons`, `list-sorters`, `on-enable`.  
**À ne pas activer** : `card-buttons` (et toute autre capacité absente du tableau ci-dessus).

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

**Alternative** si le tri natif reste indisponible (capacité non activée, cache Trello, etc.) : réordonner les cartes **manuellement** en vous aidant des badges de priorité sur chaque carte (Critique en haut → sans priorité en bas). Aucun autre mécanisme de tri automatique n'est possible sans `list-sorters` ni API REST/OAuth.

Signature du callback (SDK actuel) : `callback(t, opts)` avec `opts.cards` (tableau des cartes de la liste) ; retour `{ sortedIds: [id, …] }` (Promise acceptée).

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
