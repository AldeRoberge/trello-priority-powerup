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

### Clé API Trello (couleurs de carte)

La synchronisation des couleurs de couverture de carte sur le tableau nécessite la clé API de votre Power-Up. Le fichier `trello-api-config.js` contient cette clé et **n'est pas versionné** (voir `.gitignore`).

1. Copier `trello-api-config-template.js` vers `trello-api-config.js`
2. Aller sur [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → votre Power-Up → onglet **API Key**
3. Coller la clé dans `appKey` (laisser vide pour désactiver la synchro des couvertures ; les badges restent actifs)

### Horodatage de build (local)

```bash
npm run stamp:build
```

En production, le workflow `.github/workflows/static.yml` horodate `build-info.json` sur le runner (sans commit dans le dépôt) et déploie le site à chaque push sur `main`.

---

## Déploiement (GitHub Pages)

1. Créer un dépôt **public** et pousser la branche `main` (racine du site = racine du dépôt).
2. **Settings → Pages → Build and deployment** → **Source** : **GitHub Actions** (obligatoire — **pas** « Deploy from a branch »). Tant que la source reste une branche, GitHub lance aussi `pages-build-deployment` à chaque push, ce qui entre en conflit avec ce workflow.
3. Le workflow horodate `build-info.json` sur le runner et publie la racine via `upload-pages-artifact` / `deploy-pages` (aucun push depuis la CI).
4. URL du site : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/`

Dépannage (déploiement bloqué, source Pages) : [.github/DEPLOYMENT.md](.github/DEPLOYMENT.md).

### Enregistrer le Power-Up

1. [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → **Create new Power-Up**
2. **Iframe connector URL** : `https://VOTRE-SITE/index.html`
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

---

## Stockage Trello

| Portée | Clé | Contenu |
|--------|-----|---------|
| Carte (`shared`) | `cardPriority` | `{ urgency, impact, ease }` |

---

## Licence

Voir [LICENSE](LICENSE).
