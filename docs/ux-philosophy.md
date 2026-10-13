# Philosophie UX commune

Règles partagées entre les vues. Vérifié par lecture du code et des pages HTML le 2026-10-13. S/P/D/C implémentés dans Gantt, Mindmap et Dashboard le 2026-10-13, testés dans le harnais e2e (mock Trello).

## Vues

Dashboard, Gantt, Tableau, Kanban, Mindmap, Documents, Entités (navigation dans [components/shared/view-tabs.js](../components/shared/view-tabs.js)). Toutes lisent le même tableau Trello ; Documents et Entités sont des cartes archivées (voir [documents.md](documents.md)).

## Composants partagés à réutiliser

- Raccourcis S / P / D / C : `components/shared/linear-keys.js`
- Sélecteur recherchable : `components/shared/linear-pick.js`
- Champs de carte : `components/shared/card-fields.js`
- Menu contextuel : `components/shared/context-menu.js`
- Création rapide : `components/shared/new-card.js`, `card-quick.js`
- Masquer les terminés : `components/shared/hide-done.js`

## Principes

1. Une même action se comporte pareil dans chaque vue.
2. Le code partagé vit dans `components/shared`, jamais en copie dans une vue.
3. Terminé : grisé, non gras, masqué par défaut. Bloqué : rouge, icône « II », un clic débloque.
4. Peu de texte à l'écran. Pas de paragraphes d'aide.
5. L'icône `+` ne sert qu'à créer.
6. Édition directe (double-clic, glisser) plutôt que modale. Ctrl+Z annule.
7. Une saisie en cours n'est jamais perdue : enregistrement au blur.

## Matrice des composants partagés (chargés par page HTML)

| Composant | Kanban | Tableau | Gantt | Mindmap | Dashboard | Entités | Documents |
|---|---|---|---|---|---|---|---|
| `linear-keys.js` (S/P/D/C) | oui | oui | oui | oui | oui | non (pas de statut) | non (pas de statut) |
| `new-card.js` (C) | oui | oui | oui | oui | oui | non | non |
| `hide-done.js` (masquer terminés) | oui | oui | oui | oui | oui | non | non |
| `context-menu.js` | oui | oui | oui | oui | oui | oui | oui |

Entités et Documents n'ont ni statut ni urgence : l'absence de S/P/D y est une exception assumée. Le masquage des terminés n'y est pas encore décidé.

## Écarts restants (priorisés)

| # | Problème | Vues concernées | Priorité | Complexité | Validation |
|---|---|---|---|---|---|
| 1 | Urgence préselectionnée « Aucune » dans le sélecteur : la ligne n'expose pas l'urgence (Mindmap, Dashboard). Gantt corrigé : `row` expose l'urgence via `TableModel.urgencyLabel` | Mindmap, Dashboard | P3 | Faible : passer le libellé d'urgence dans `row` | Ouvrir P sur une carte urgente et vérifier la coche |
| 2 | Filtre « masquer terminés » absent des vues sans statut | Entités, Documents | P3 | Décision produit | — |
| 3 | Indicateur de sauvegarde non uniforme | Gantt, Tableau, Kanban, Entités | P2 | Moyenne | À mesurer dans le navigateur |
| 4 | Recherche et filtres non partagés entre vues | Toutes | P3 | Élevée : décision produit (état partagé ou par vue ?) | Décision à prendre avant tout code |

Les raccourcis et la création sont vérifiés par `test/shortcut-wiring.test.js` (pages et scripts), et testés dans le harnais e2e (Mindmap, Gantt, Dashboard). Le Dashboard fixe la date d'échéance avec D ; le jour prévu (début et fin) reste celui de l'éditeur de triage.

## Exceptions assumées

Le Gantt garde le glisser des dates, la Mindmap garde zoom et panoramique, Documents n'a ni statut ni urgence.

## Avant de livrer une vue

`npm run test:unit`, tester vide / terminé / bloqué / texte long / étroit, et vérifier qu'un changement de vue puis un retour conserve l'état.
