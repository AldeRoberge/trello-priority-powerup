# Philosophie UX commune

Document vivant. Il décrit les règles partagées entre les vues et renvoie au code qui les implante. Chaque règle doit pouvoir se vérifier dans le code ; si ce n'est pas le cas, elle est une intention, pas une règle.

Statut : **audit par lecture du code**. Les parcours n'ont pas encore été testés dans le navigateur, et aucune recherche de produits concurrents n'a été faite. Les points marqués *à vérifier* sont des hypothèses.

## 1. Inventaire des vues

Onglets de navigation : `VIEWS` dans [components/shared/view-tabs.js](../components/shared/view-tabs.js).

| Vue | Page | Représentation | Module principal | Modèle partagé |
|---|---|---|---|---|
| Dashboard | [dashboard.html](../dashboard.html) | Synthèse | [components/dashboard](../components/dashboard) | `dashboard-model.js` |
| Gantt | [gantt.html](../gantt.html) | Frise temporelle | [components/gantt](../components/gantt) | `gantt-model.js` |
| Tableau | [table.html](../table.html) | Liste dense | [components/table](../components/table) | données Trello, `table-trello.js` |
| Kanban | [kanban.html](../kanban.html) | Colonnes par statut | [components/kanban](../components/kanban) | `kanban-model.js` |
| Mindmap | [mindmap.html](../mindmap.html) | Arbre spatial | [components/mindmap](../components/mindmap) | `mindmap-model.js` |
| Documents | [docs.html](../docs.html) | Éditeur Markdown | [components/docs](../components/docs) | `docs-model.js` |
| Entités | [entities.html](../entities.html) | Fiches structurées | [components/entities](../components/entities) | `entities-model.js` |

Vues annexes : Priorité (`components/priority`), Complétion (`components/completion`), Objectifs (`components/goals`), Personnes, Lieux, Statut, Sheets, Outlook, et l'assistant (`components/agent`, dock dans `components/shared/assistant-dock.js`).

Source de vérité : le tableau Trello. Toutes les vues lisent et écrivent les mêmes cartes, listes, libellés et membres. Les documents et entités sont stockés comme cartes archivées (voir [docs/documents.md](documents.md)).

## 2. Composants partagés existants

À réutiliser avant de créer un composant parallèle.

| Besoin | Composant | Fichier |
|---|---|---|
| Barre d'onglets entre vues | ViewTabs | `components/shared/view-tabs.js` / `.css` |
| Menu contextuel (clic droit) | ContextMenu | `components/shared/context-menu.js` / `.css` |
| Raccourcis une touche (S, P, D, C) | LinearKeys | `components/shared/linear-keys.js` |
| Sélecteur recherchable (statut, urgence) | LinearPick | `components/shared/linear-pick.js` / `.css` |
| Éditeur de champs de carte (échéance, etc.) | CardFields | `components/shared/card-fields.js` / `.css` |
| Création rapide de carte | NewCard, CardQuick | `components/shared/new-card.js`, `card-quick.js` |
| Historique | HistoryPanel | `components/shared/history-panel.js` |
| Masquer les terminés | HideDone | `components/shared/hide-done.js` |
| Anneau de progression | ProgressRing | `components/shared/progress-ring.js` |
| Confirmation Trello | TrelloConfirm | `components/shared/trello-confirm.js` |
| Markdown | MarkdownDom | `components/shared/markdown-dom.js` |

## 3. Principes

1. **Une action, un comportement.** Une même intention (changer le statut, l'urgence, l'échéance, créer une carte) passe par le même composant dans chaque vue.
2. **Le code partagé vit dans `components/shared`.** Une vue ne réimplémente pas un sélecteur, un menu ou un raccourci. Elle fournit seulement comment trouver la carte et comment appliquer le changement.
3. **Les états sont cohérents.** Terminé : grisé, non gras, masqué par défaut avec le même interrupteur en haut à droite. Bloqué ou en pause : rouge avec l'icône « II », un clic débloque. Le texte n'est jamais tronqué sans être accessible.
4. **Moins de texte à l'écran.** Pas de sous-titres ni de paragraphes d'aide. Les placeholders sont courts. Une info moins pertinente est moins présente (opacité environ 0,55).
5. **L'icône `+` ne signifie que « créer ».** Pour choisir ou modifier, on utilise un crayon ou pas d'icône.
6. **Édition directe.** Double-clic sur un titre, clic sur une barre de progression, pas de modale pour une modification simple. Archiver agit tout de suite, et Ctrl+Z annule.
7. **Ne jamais perdre une saisie.** Une saisie en cours est enregistrée au blur (déjà fait pour la Mindmap et le compositeur Kanban).
8. **Un élément nouveau apparaît tout de suite**, à l'endroit où il a été créé.

## 4. Matrice de cohérence (par lecture du code)

Légende : **C** cohérent et efficace · **E** efficace mais inconsistant · **I** inconsistant ou confus · **M** manquant mais nécessaire · **N/A** non applicable.

| Critère | Dashboard | Gantt | Tableau | Kanban | Mindmap | Documents | Entités |
|---|---|---|---|---|---|---|---|
| Changer statut / urgence au clavier | N/A | M | C (LinearKeys) | C (LinearKeys) | M | N/A | M |
| Menu contextuel clic droit | M | E | E | E | E | E | M |
| Création rapide | N/A | E | C (NewCard) | C (CardQuick) | E (champ dédié) | E (bouton Nouveau) | E |
| Masquer les terminés | M | E | C | C | M | N/A | M |
| Recherche / filtres partagés | M | E (gantt-filters) | E | E | M | M | E |
| Historique (undo) | M | E | E | E | E | N/A | E |
| Feedback de sauvegarde | *à vérifier* | *à vérifier* | *à vérifier* | *à vérifier* | C (spinner « Création… ») | C (barre de conflit) | *à vérifier* |

Lecture rapide : Tableau et Kanban partagent déjà les raccourcis et le sélecteur. Les autres vues ne les ont pas encore, et c'est le principal écart systémique.

## 5. Backlog priorisé

Priorité : P1 bloquant, P2 important, P3 souhaitable.

| # | Problème | Vues | Solution proposée | Complexité | Dépendances | Priorité | Validation |
|---|---|---|---|---|---|---|---|
| 1 | Raccourcis S/P/D/C absents de Gantt, Mindmap, Entités | Gantt, Mindmap, Entités | Brancher `LinearKeys.attach` avec les adaptateurs de chaque vue | Moyenne | `linear-keys.js` | P2 | Test unitaire d'adaptateur + essai clavier dans chaque vue |
| 2 | Menu contextuel incomplet ou différent | Dashboard, Entités, Gantt | Un menu commun (`ContextMenu`) avec les mêmes icônes et actions | Moyenne | `context-menu.js` | P2 | Clic droit sur une carte dans chaque vue, comparer les entrées |
| 3 | Terminés masqués sans interrupteur dans certaines vues | Dashboard, Mindmap, Entités | Réutiliser `HideDone` | Faible | `hide-done.js` | P3 | Vérifier le bouton en haut à droite |
| 4 | Feedback de sauvegarde non uniforme | Gantt, Tableau, Kanban, Entités | Indicateur d'état commun | Moyenne | à définir | P2 | Modifier puis recharger, vérifier le message |
| 5 | Recherche et filtres non partagés | Toutes | Terminologie et logique communes, état dans le contexte de navigation | Élevée | modèle de préférences | P3 | Filtrer dans une vue, changer de vue, vérifier le filtre |

Non traité dans cette passe : les points 4 et 5 demandent une décision produit (où stocker les préférences, et quel feedback est attendu).

## 6. Règles à vérifier avant de livrer une vue

- Réutiliser les composants de la section 2.
- Tester les états : vide, terminé, bloqué, texte long, largeur étroite.
- Lancer `npm run test:unit`.
- Ajouter un test pour toute logique partagée modifiée.
- Vérifier que la vue reste utilisable après un changement de vue puis un retour.

## 7. Exceptions assumées

- Le Gantt garde la manipulation de dates au glisser, et la Mindmap garde le zoom et le panoramique. Ce ne sont pas des incohérences.
- Les Documents n'ont ni statut ni urgence : le clavier de carte ne s'y applique pas.
