# Bac à sable — priorité et formule

Prototypes et vérifications pour l'UI de scoring (curseurs, barre de chaleur, paliers). **Ces fichiers ne sont pas servis en production** ; ils ne doivent pas être référencés par les pages Power-Up à la racine.

## Pages HTML

| Fichier | Statut | Usage |
|---------|--------|--------|
| `priority-variants.html` | **Actif** | UI compacte 3 curseurs (urgence, impact, facilité), formule baseline. Point d'entrée principal du bac à sable. |
| `priority-prototype.html` | **Prototype obsolète** | Première maquette autonome (styles inline). Conservé pour référence ; préférer `priority-variants.html`. |

Ouvrir les fichiers directement dans le navigateur — pas de build ni de serveur requis.

### Ordre de chargement des scripts (`priority-variants.html`)

1. `../priority-ui.js` → expose `window.PriorityUI`

Styles : `../priority-ui.css`

## Fichiers partagés (racine du dépôt)

| Fichier | Rôle |
|---------|------|
| `../priority-ui.js` | Formules de score, libellés de palier FR, icônes SVG, composants UI (`mountVariant`, modale d'aide, graphique RSM). |
| `../priority-ui.css` | Styles de l'éditeur de priorité (partagés avec la production). |

## Scripts de vérification

| Script | Runtime | Commande |
|--------|---------|----------|
| `verify-presets.js` | Windows `cscript` | `npm run verify:presets` ou `cscript //nologo sandbox\verify-presets.js` |
| `verify-version.js` | Node.js | `npm run verify:version` ou `node sandbox/verify-version.js` |

- **verify-presets** : formule baseline, paliers (`TIERS`), presets `HEAT_SEGMENTS`. La logique est **dupliquée** volontairement (exécutable sans navigateur ni DOM) — doit rester alignée avec `priority-ui.js` (section « Scoring »).
- **verify-version** : formatage et résolution de l'horodatage de build (`version.js`, `build-info.json`).

Code de sortie `0` = succès, `1` = échec.

## Formule (`priority-variants.html`)

Variante **A (baseline)** : pression d'urgence + impact pondéré + terme facilité, avec atténuation et boost d'urgence. Détails dans `PriorityUI.calc` (`priority-ui.js`).
