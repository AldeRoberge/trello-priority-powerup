# PrioritÃ© â€” Power-Up Trello

Power-Up Trello pour Ã©valuer chaque carte selon **l'urgence**, **l'impact** et **l'effort** : score 0â€“10, palier (Critique â†’ Optionnel) et badges colorÃ©s sur le tableau.

Aucune Ã©tape de build pour le dÃ©ploiement : des fichiers HTML/JS/CSS statiques servis depuis la racine du dÃ©pÃ´t (ex. GitHub Pages).

---

## FonctionnalitÃ©s

- **Trois axes** (urgence 0â€“4, impact 0â€“4, effort 1â€“5) avec barre de chaleur et curseurs
- **Score et palier** calculÃ©s par formule baseline (0â€“10)
- **Badges** sur les cartes en vue tableau (`score Â· palier`, ex. `7.9 Â· Urgent`)
- **Popup Â« DÃ©finir la prioritÃ© Â»** : 3 curseurs + barre de chaleur dans le dÃ©tail de carte
- **ParamÃ¨tres du tableau** : courte description, horodatage de build et lien vers le guide de configuration
- **Horodatage de build** affichÃ© sur la page d'accueil du connecteur (`build-info.json`, mis Ã  jour par CI sur `main`)
- **CompatibilitÃ©** : les anciennes prioritÃ©s P1â€“P5 sont lues pour l'affichage jusqu'Ã  la prochaine sauvegarde

---

## Structure du projet

| Chemin | RÃ´le |
|--------|------|
| `index.html` | Connecteur Power-Up (iframe Trello + page d'accueil hors iframe) |
| `popup.html` | Ã‰diteur de prioritÃ© (3 curseurs + barre de chaleur) |
| `settings.html` | ParamÃ¨tres du tableau (infos, build, guide) |
| `welcome.html` | Modal d'accueil Ã  l'activation du Power-Up |
| `priority-ui.js` | Formule de score, composants UI (`PriorityUI`) |
| `priority-ui.css` | Styles de l'Ã©diteur de prioritÃ© |
| `priority-trello.js` | Pont Trello (stockage, badges, affichage) |
| `version.js` | Affichage de la version / date de build |
| `trello-theme.css` | Styles communs des pages Power-Up |
| `build-info.json` | Horodatage du dernier dÃ©ploiement |
| `scripts/` | Utilitaires Node (`stamp-build.js`, `render-icon.js`) |
| `sandbox/` | Prototypes UI et scripts de vÃ©rification â€” **non dÃ©ployÃ©s** (voir `sandbox/README.md`) |

### Production vs bac Ã  sable

- **Production** : tout fichier Ã  la racine rÃ©fÃ©rencÃ© par `index.html`, `popup.html` ou `settings.html`. C'est ce qui doit Ãªtre hÃ©bergÃ© pour Trello.
- **Bac Ã  sable** (`sandbox/`) : pages ouvertes localement pour itÃ©rer sur la formule et l'UI. Charge `../priority-ui.js` â€” pas de bundler.

---

## DÃ©veloppement local

### PrÃ©requis

- Navigateur moderne pour les pages HTML
- **Node.js** (optionnel) : `verify:version`, `stamp:build`
- **Windows + `cscript`** : `verify:presets` (formule de score sans dÃ©pendre du navigateur)

### VÃ©rifications

```bash
# Formule baseline, paliers et presets HEAT_SEGMENTS (Windows â€” cscript)
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

### Bac Ã  sable UI

Ouvrir `sandbox/priority-variants.html` dans le navigateur (double-clic ou serveur statique local). DÃ©tails dans [sandbox/README.md](sandbox/README.md).

### Horodatage de build (local)

```bash
npm run stamp:build
```

En production, le workflow `.github/workflows/static.yml` met Ã  jour `build-info.json` et dÃ©ploie le site Ã  chaque push sur `main`.

---

## DÃ©ploiement (GitHub Pages)

1. CrÃ©er un dÃ©pÃ´t **public** et pousser la branche `main` (racine du site = racine du dÃ©pÃ´t).
2. **Settings â†’ Pages â†’ Build and deployment** â†’ **Source** : **GitHub Actions** (pas Â« Deploy from a branch Â»). Le workflow `.github/workflows/static.yml` horodate `build-info.json`, publie la racine du dÃ©pÃ´t et commit le timestamp (`[skip ci]`).
3. URL du site : `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/`

Dépannage (déploiement bloqué, source Pages) : [.github/DEPLOYMENT.md](.github/DEPLOYMENT.md).

### Enregistrer le Power-Up

1. [trello.com/power-ups/admin](https://trello.com/power-ups/admin) â†’ **Create new Power-Up**
2. **Iframe connector URL** : `https://VOTRE-SITE/index.html`
3. CapacitÃ©s : `card-badges`, `card-detail-badges`, `board-buttons` (ne pas activer `card-buttons` â€” non utilisÃ© par ce Power-Up)
4. Ajouter le Power-Up Ã  un tableau via le menu Power-Ups

---

## Utilisation

### DÃ©finir une prioritÃ©

1. Ouvrir une carte â†’ **DÃ©finir la prioritÃ©**
2. Ajuster les curseurs ou toucher un palier sur la barre de chaleur â€” le badge apparaÃ®t sur la carte

### Infos et guide

**ParamÃ¨tres de prioritÃ©** (bouton du tableau) : version dÃ©ployÃ©e, horodatage de build et lien vers le guide de configuration.

### Effacer une prioritÃ©

Popup **DÃ©finir la prioritÃ©** â†’ **Effacer la prioritÃ©**

---

## Stockage Trello

| PortÃ©e | ClÃ© | Contenu |
|--------|-----|---------|
| Carte (`shared`) | `cardPriority` | `{ urgency, impact, ease }` |

---

## Licence

Voir [LICENSE](LICENSE).
