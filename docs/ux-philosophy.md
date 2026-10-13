# Philosophie UX commune

Règles partagées entre les vues. Statut : audit par lecture du code, pas encore testé dans le navigateur.

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

## Écarts principaux

| Problème | Vues concernées | Priorité |
|---|---|---|
| Raccourcis S/P/D/C absents | Gantt, Mindmap, Entités | P2 |
| Menu contextuel différent | Dashboard, Gantt, Entités | P2 |
| Indicateur de sauvegarde non uniforme | Gantt, Tableau, Kanban, Entités | P2 |
| Recherche et filtres non partagés | Toutes | P3 (décision produit requise) |

## Exceptions assumées

Le Gantt garde le glisser des dates, la Mindmap garde zoom et panoramique, Documents n'a ni statut ni urgence.

## Avant de livrer une vue

`npm run test:unit`, tester vide / terminé / bloqué / texte long / étroit, et vérifier qu'un changement de vue puis un retour conserve l'état.
