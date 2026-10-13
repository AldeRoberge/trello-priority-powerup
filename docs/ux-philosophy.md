# Philosophie UX commune

Règles partagées entre les vues. Vérifié par lecture du code et des pages HTML le 2026-10-13 ; pas encore testé dans le navigateur.

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
| `linear-keys.js` (S/P/D/C) | oui | oui | non | non | non | non | non |
| `new-card.js` (création) | oui | oui | non | non | non | non | non |
| `hide-done.js` (masquer terminés) | oui | oui | oui | oui | oui | non | non |
| `context-menu.js` | oui | oui | oui | oui | oui | oui | oui |

Documents et Entités n'ont pas de statut ni d'urgence ; l'absence de S/P/D y est une exception assumée, pas un oubli. Pour Entités, le masquage des terminés reste à décider.

## Écarts principaux (priorisés)

| # | Problème | Vues concernées | Priorité | Complexité | Validation |
|---|---|---|---|---|---|
| 1 | Raccourcis S/P/D/C absents (`linear-keys.js` non chargé) | Gantt, Mindmap, Dashboard, Entités | P2 | Faible : charger le script et brancher les actions sur la carte sélectionnée | Test e2e : sélectionner une carte, appuyer S, vérifier le statut dans la vue et après retour de vue |
| 2 | Création de carte propre à chaque vue (`new-card.js` absent) | Gantt, Mindmap, Dashboard, Entités | P2 | Moyenne : le composant est prévu pour Kanban/Tableau, vérifier son contrat avant réutilisation | Test : créer une carte dans chaque vue, la retrouver dans Kanban et Tableau |
| 3 | Masquer les terminés absent | Entités, Documents | P3 | Faible, mais décision produit (Documents n'a pas de terminé) | Test : marquer une carte terminée, vérifier le bouton haut-droit |
| 4 | Indicateur de sauvegarde non uniforme | Gantt, Tableau, Kanban, Entités | P2 | Moyenne | À mesurer dans le navigateur avant de changer |
| 5 | Recherche et filtres non partagés entre vues | Toutes | P3 | Élevée : décision produit requise (état partagé ou par vue ?) | Décision à prendre avant tout code |

Ces écarts viennent de la lecture du code. Aucun n'a encore été reproduit dans le navigateur.

## Exceptions assumées

Le Gantt garde le glisser des dates, la Mindmap garde zoom et panoramique, Documents n'a ni statut ni urgence.

## Avant de livrer une vue

`npm run test:unit`, tester vide / terminé / bloqué / texte long / étroit, et vérifier qu'un changement de vue puis un retour conserve l'état.
