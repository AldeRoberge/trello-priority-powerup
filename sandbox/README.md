# Bac à sable — priorité et formule

Prototypes et vérifications pour l’UI de scoring et la matrice de libellés. **Ces fichiers ne sont pas servis en production** ; ils ne doivent pas être référencés par les pages Power-Up à la racine.

## Pages HTML

| Fichier | Statut | Usage |
|---------|--------|--------|
| `priority-variants.html` | **Actif** | UI compacte 3 curseurs (urgence, impact, facilité), formule baseline. Point d’entrée principal du bac à sable. |
| `priority-prototype.html` | **Prototype obsolète** | Première maquette autonome (styles inline). Conservé pour référence ; préférer `priority-variants.html`. |

Ouvrir les fichiers directement dans le navigateur — pas de build ni de serveur requis.

### Ordre de chargement des scripts (`priority-variants.html`)

1. `../priority-matrix.js` → expose `window.PriorityMatrix`
2. `../priority-ui.js` → expose `window.PriorityUI` (utilise `PriorityMatrix` si présent)

Styles : `../priority-ui.css`

## Fichiers partagés du bac à sable

| Fichier | Rôle |
|---------|------|
| `priority-shared.js` | Formules de score, libellés FR, icônes SVG, composants UI (`mountVariant`, modale d’aide, graphique RSM). ~2 300 lignes — voir la table des matières en tête de fichier. |
| `priority-shared.css` | Styles du bac à sable (sections commentées). |

## Scripts de vérification

| Script | Runtime | Commande |
|--------|---------|----------|
| `verify-presets.js` | Windows `cscript` | `npm run verify:presets` ou `cscript //nologo sandbox\verify-presets.js` |
| `verify-matrix.js` | Node.js | `npm run verify:matrix` ou `node sandbox/verify-matrix.js` |

- **verify-presets** : formule baseline, paliers (`TIERS`), presets `HEAT_SEGMENTS`. La logique est **dupliquée** volontairement (exécutable sans navigateur ni DOM) — doit rester alignée avec `priority-ui.js` (section « Scoring »).
- **verify-matrix** : charge `priority-matrix.js` via `vm` et valide les règles de libellés, overrides et mode désactivé.

Code de sortie `0` = succès, `1` = échec.

## Formule (`priority-variants.html`)

Variante **A (baseline)** : pression d’urgence + impact pondéré + terme facilité, avec atténuation et boost d’urgence. Détails dans `PriorityUI.calc` (`priority-shared.js`).
