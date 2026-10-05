# Entités

Onglet **Entités** (à côté de Gantt, Tableau, Kanban, Documents). On y décrit des objets nommés une fois (« Ficus », « Hôtel de Ville ») avec des types, des propriétés, des liens et un historique, puis l'assistant les retrouve à partir d'une phrase.

Exemple : « Arroser mes plantes au travail » devient le filtre *type Plante* + *lieu dont l'alias est « travail »*, soit exactement les plantes qui sont à l'Hôtel de Ville. Fonctionne aussi en anglais (« Water my plants at work ») grâce aux alias et aux pluriels.

## Modèle (ECS)

| Notion | Rôle | Exemple |
| --- | --- | --- |
| **Composant** | groupe de champs typés | *Entretien* : fréquence (nombre), dernier arrosage (date), santé (choix) |
| **Type** | regroupe des composants | *Plante* = Lieu + Entretien |
| **Entité** | id, nom, alias, types, valeurs, liens, historique | *Ficus*, alias « arbre », lieu = Hôtel de Ville |

Types de champ : texte, nombre, date, oui/non, choix, lien vers une entité, liens vers plusieurs entités. Un lieu est simplement une entité de type *Lieu* (fourni par défaut, avec le composant *Lieu*) ; donnez-lui des alias (`travail, work, bureau`) pour que « au travail » le retrouve.

Les **liens** sont de deux sortes : les champs « lien » (ex. lieu d'une plante) et des relations libres nommées (« contient », « fait partie de »). Les liens entrants sont affichés sur l'entité liée. Supprimer une entité retire aussi les liens qui pointent vers elle (noté dans l'historique des autres entités).

L'**historique** garde les 40 derniers changements de chaque entité ; chacun peut être annulé (l'annulation s'ajoute à l'historique, rien n'est effacé).

## Composer (assistant de création)

Le bouton **Composer** (colonne de gauche, ou l'état vide) ouvre un dialogue qui pose les questions pour créer une entité et tout ce qu'elle entraîne, puis crée le tout lié en une seule fois.

- **Quoi ?** Une phrase libre : « Palmier, une plante au travail » donne le nom, le type *Plante* et le lieu dont l'alias est « travail » (via le champ lien du type, sinon une relation « lié à »). Sans virgule, tout le texte est le nom. On peut aussi cocher des types, ou en **définir un nouveau en une ligne** : `État (choix: neuf/usé), Achat (date), Lieu (lien: Lieu)`.
- **Nom** : nom et alias (puces), avec avertissement de doublon ou d'alias ambigu.
- **Un écran par composant** des types choisis (composition : l'union des composants). Chaque champ est une question ; tout est facultatif. Suggestions intelligentes tirées des entités du même type : les lieux les plus utilisés, « Souvent : 7 », raccourcis de date.
- **Créer à la volée** : une question de lien propose « Créer « Salon » » ; ça ouvre une mini-interview (fil d'Ariane), puis on revient à la question avec le lien posé. Rien n'est écrit avant le dernier écran.
- **Liens** (relations libres, avec les types déjà utilisés) puis **Résumé** : « Créer N entités » ou « Créer et en ajouter une autre ». Un aperçu en direct est affiché à droite pendant tout le parcours.

Logique pure et testée : `components/entities/entities-composer.js` (`readIntent`, `stepsFor`, `suggest`, `issues`, `defineType`, `finalize`) ; interface : `entities-composer-ui.js` + `.css`. Test : `test/entities-composer.test.js`.

## Résolution d'une phrase

`EntitiesModel.resolveText(schema, entities, texte)` cherche dans la phrase : les noms/alias de **types** (pluriel ignoré, accents ignorés), les noms/alias d'**entités** (le plus long gagne : « Hôtel de Ville » avant « Hôtel »), et les valeurs de champs à **choix** (« mortes »). Résultat : un filtre `{types, refersTo, where}` et les entités correspondantes. Les possessifs (mon, mes, my) et les verbes sont ignorés. Une entité nommée qui a déjà le type demandé est un choix direct (« tailler le ficus »).

L'assistant (fenêtre projet, Table, Kanban) reçoit dans son prompt le catalogue par type, puis les entités résolues pour le message en cours (`EntitiesModel.promptLines`, limité à ~2 400 caractères).

## Stockage

Comme les Documents : le stockage Power-Up est limité à 4 096 caractères, trop peu. Chaque entité est une **carte Trello archivée** nommée `🧩 Nom` dont la description (16 384 caractères) contient un résumé lisible puis le JSON dans un bloc caché `<!--cerveau-entity ... -->`. Une carte `🧩 Schéma des entités` porte les composants et types. Tout se lit avec un seul `GET /boards/{id}/cards/closed`.

- Jamais visibles sur le tableau, le Gantt, la Table, le Sheet ni les sélecteurs de cartes ; visibles (et supprimables) dans « Éléments archivés » de Trello.
- Un compteur `rev` détecte les modifications concurrentes (`conflict`).
- Si une entité dépasse la description, l'historique le plus ancien est élagué en premier.
- Le Worker ignore les événements des cartes `🧩` (pas de Sheet, pas d'Activités, pas de copie Drive). **Redéployez le Worker une fois** : `npm --prefix workers/trello-sheet-sync run deploy`.

## Fichiers

- `components/entities/entities-model.js` : modèle pur (schéma, mutations, historique, requêtes, résolution de texte, lignes de prompt)
- `components/entities/entities-trello.js` : lecture/écriture Trello (`load`, `commit`, cache 30 s)
- `components/entities/entities-ui.js` + `.css`, `entities.html` : la vue
- `components/agent/agent.js` : `getEntities` (contexte) et lignes de prompt ; `assistant-mount.js` fournit les entités
- `components/entities/entities-composer*.js` : l'assistant de création (voir plus haut)
- Tests : `test/entities-composer.test.js`, `test/entities-model.test.js`, `test/entities-trello.test.js`, `test/agent-entities.test.js` ; page de test visuel : `sandbox/e2e/entities.html` (serveur : `npm run test:e2e -- --serve`)

## Pas encore fait

- Les cartes ne sont pas encore liées aux entités (ex. « Arroser mes plantes » → une tâche par plante) : l'assistant sait *quelles* entités sont visées, mais il n'a pas d'outil pour créer ou lier des cartes.
- Pas de synonymes automatiques entre l'annuaire **Lieux** du profil et les entités de type Lieu : les alias se saisissent dans l'entité.
- L'historique n'est pas encore branché sur le panneau d'historique de la Table.
