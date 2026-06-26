# Priorités des cartes — Power-Up Trello

Power-Up Trello pour évaluer chaque carte selon **l'urgence**, **l'impact** et **l'effort** : score 0–10, palier (Critique → Optionnel), badges colorés et libellés contextuels optionnels via une matrice.

Aucune étape de build pour le déploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dépôt (ex. GitHub Pages).

---

## Fonctionnalités

- **Trois axes** (urgence 0–4, impact 0–4, effort 1–5) avec barre de chaleur et curseurs
- **Score et palier** calculés par formule baseline (0–10)
- **Matrice de libellés** optionnelle (ex. « Victoire rapide », « Chemin critique »)
- **Badges** sur les cartes en vue tableau (`score · libellé`)
- **Popup « Définir la priorité »** dans le détail de carte
- **Paramètres du tableau** : activer/désactiver la matrice, renommer les règles, import/export JSON v2
- **Horodatage de build** affiché sur la page d'accueil du connecteur (`build-info.json`, mis à jour par CI sur `main`)
- **Compatibilité** : les anciennes priorités P1–P5 sont lues pour l'affichage jusqu'à la prochaine sauvegarde

---

## Structure du projet

| Chemin | Rôle |
|--------|------|
| `index.html` | Connecteur Power-Up (iframe Trello + page d'accueil hors iframe) |
| `popup.html` | Éditeur de priorité (3 curseurs + barre de chaleur) |
| `settings.html` | Paramètres du tableau (matrice de libellés) |
| `welcome.html` | Modal d'accueil à l'activation du Power-Up |
| `priority-ui.js` | Formule de score, composants UI (`PriorityUI`) |
| `priority-ui.css` | Styles de l'éditeur de priorité |
| `priority-trello.js` | Pont Trello (stockage, badges, affichage) |
| `priority-matrix.js` | Règles de libellés contextuels (urgence × impact × facilité) |
| `priority-export.js` | Import/export JSON v2 des paramètres de matrice |
| `version.js` | Affichage de la version / date de build |
| `trello-theme.css` | Styles communs des pages Power-Up |
| `build-info.json` | Horodatage du dernier déploiement |
| `scripts/` | Utilitaires Node (`stamp-build.js`, `render-icon.js`) |
| `sandbox/` | Prototypes UI et scripts de vérification — **non déployés** (voir `sandbox/README.md`) |

### Production vs bac à sable

- **Production** : tout fichier à la racine référencé par `index.html`, `popup.html` ou `settings.html`. C'est ce qui doit être hébergé pour Trello.
- **Bac à sable** (`sandbox/`) : pages ouvertes localement pour itérer sur la formule et l'UI. Charge `../priority-matrix.js` + `../priority-ui.js` — pas de bundler.

---

## Développement local

### Prérequis

- Navigateur moderne pour les pages HTML
- **Node.js** (optionnel) : `verify:matrix`, `stamp:build`
- **Windows + `cscript`** : `verify:presets` (formule de score sans dépendre du navigateur)

### Vérifications

```bash
# Formule baseline, paliers et presets HEAT_SEGMENTS (Windows — cscript)
npm run verify:presets

# Règles de la matrice de libellés (Node)
npm run verify:matrix

# Les deux
npm run verify
```

Sous Windows sans npm :

```bat
cscript //nologo sandbox\verify-presets.js
node sandbox\verify-matrix.js
```

### Bac à sable UI

Ouvrir `sandbox/priority-variants.html` dans le navigateur (double-clic ou serveur statique local). Détails dans [sandbox/README.md](sandbox/README.md).

### Horodatage de build (local)

```bash
npm run stamp:build
```

En production, le workflow `.github/workflows/stamp-build.yml` met à jour `build-info.json` à chaque push sur `main`.

---

## Déploiement (GitHub Pages)

1. Créer un dépôt **public** et pousser la branche `main` (racine du site = racine du dépôt).
2. **Settings → Pages** → source : branche `main`, dossier `/ (root)`.
3. URL du site : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/`

### Enregistrer le Power-Up

1. [trello.com/power-ups/admin](https://trello.com/power-ups/admin) → **Create new Power-Up**
2. **Iframe connector URL** : `https://VOTRE-SITE/index.html`
3. Capacités : `card-badges`, `card-detail-badges`, `card-buttons`, `board-buttons`
4. Ajouter le Power-Up à un tableau via le menu Power-Ups

---

## Utilisation

### Définir une priorité

1. Ouvrir une carte → **Définir la priorité**
2. Ajuster les curseurs ou toucher un palier sur la barre de chaleur — le badge apparaît sur la carte

### Personnaliser les libellés contextuels

1. **Paramètres de priorité** (bouton du tableau)
2. Activer la matrice, renommer les règles ou importer/exporter un JSON v2 → **Enregistrer**

### Effacer une priorité

Popup **Définir la priorité** → **Effacer la priorité**

---

## Stockage Trello

| Portée | Clé | Contenu |
|--------|-----|---------|
| Carte (`shared`) | `cardPriority` | `{ urgency, impact, ease }` |
| Tableau (`shared`) | `matrixLabelSettings` | matrice activée + overrides de libellés |

---

## Licence

Voir [LICENSE](LICENSE).
