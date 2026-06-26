# Priorités des cartes — Power-Up Trello

Power-Up Trello pour définir des niveaux de priorité (P1–P5) sur chaque carte : badges colorés, popup de sélection, paramètres par tableau, modèles de libellés et matrice de libellés contextuels.

Aucune étape de build pour le déploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dépôt (ex. GitHub Pages).

---

## Fonctionnalités

- **5 niveaux de priorité** (P1–P5), couleur et libellé personnalisables
- **Badges** sur les cartes en vue tableau
- **Popup « Définir la priorité »** dans le détail de carte
- **Paramètres du tableau** : modèles (français, anglais, MoSCoW, etc.), import/export JSON, matrice de libellés
- **Horodatage de build** affiché sur la page d’accueil du connecteur (`build-info.json`, mis à jour par CI sur `main`)

---

## Structure du projet

| Chemin | Rôle |
|--------|------|
| `index.html` | Connecteur Power-Up (iframe Trello + page d’accueil hors iframe) |
| `popup.html` | Sélecteur de priorité dans une carte |
| `settings.html` | Paramètres du tableau (modèles, couleurs, matrice) |
| `welcome.html` | Modal d’accueil à l’activation du Power-Up |
| `priority-templates.js` | Priorités par défaut, modèles, validation et import/export |
| `priority-matrix.js` | Règles de libellés contextuels (urgence × impact × facilité) — **production** |
| `version.js` | Affichage de la version / date de build |
| `trello-theme.css` | Styles communs des pages Power-Up |
| `build-info.json` | Horodatage du dernier déploiement |
| `scripts/` | Utilitaires Node (`stamp-build.js`, `render-icon.js`) |
| `sandbox/` | Prototypes UI et scripts de vérification — **non déployés** (voir `sandbox/README.md`) |

### Production vs bac à sable

- **Production** : tout fichier à la racine référencé par `index.html`, `popup.html` ou `settings.html`. C’est ce qui doit être hébergé pour Trello.
- **Bac à sable** (`sandbox/`) : pages ouvertes localement dans le navigateur pour itérer sur la formule de score et l’UI compacte. Charge `../priority-matrix.js` + `priority-shared.js` via balises `<script>` — pas de bundler.

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
2. Choisir un niveau — le badge apparaît sur la carte

### Personnaliser libellés et couleurs

1. **Paramètres de priorité** (bouton du tableau)
2. Modifier les libellés / couleurs ou appliquer un modèle → **Enregistrer**

### Effacer une priorité

Popup **Définir la priorité** → **Effacer la priorité**

---

## Priorités par défaut

| # | Libellé | Couleur |
|---|---------|---------|
| P1 | Urgent | `#E53E3E` |
| P2 | Haute | `#DD6B20` |
| P3 | Moyenne | `#D69E2E` |
| P4 | Basse | `#38A169` |
| P5 | Aucune | `#718096` |

---

## Licence

Voir [LICENSE](LICENSE).
