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

### Enregistrer le Power-Up

1. [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → **Create new Power-Up** (ou ouvrir le Power-Up existant)
2. **Iframe connector URL** (onglet principal du Power-Up) :
   `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/index.html`
3. Capacités : `card-badges`, `card-detail-badges`, `board-buttons` (ne pas activer `card-buttons` — non utilisé par ce Power-Up)
4. Ajouter le Power-Up à un tableau via le menu Power-Ups

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
