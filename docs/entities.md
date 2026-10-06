# Entités

Onglet **Entités** (à côté de Gantt, Tableau, Kanban, Documents). On y décrit des objets nommés une fois (« Monstera », « Hôtel de Ville ») avec des types, des propriétés, des liens et un historique, puis l'assistant les retrouve à partir d'une phrase.

Exemple : « Arroser mes plantes au travail » devient le filtre *type Plante* + *lieu dont l'alias est « travail »*, soit exactement les plantes qui sont à l'Hôtel de Ville. Fonctionne aussi en anglais (« Water my plants at work ») grâce aux alias et aux pluriels.

## La vue

- **Liste (à gauche)** : une recherche qui comprend aussi une phrase (« mes plantes au travail » devient des puces *Type* + *lieu*), des pastilles de filtre par type (les plus utilisés, le reste sous « Plus »), puis les entités rangées par type, chacune avec une icône colorée selon la nature de son type. Le bouton **+** ouvre un menu : *Composer une entité* ou *Entité vide*. « Types et composants » (en bas) ouvre l'éditeur de schéma.
- **Page d'une entité (à droite)** : un grand nom modifiable (Entrée valide, Échap annule), ses types en pastilles (« × » pour retirer, « + Type » ouvre un sélecteur avec recherche), ses alias (« Aussi appelé », Entrée ou virgule pour en ajouter), puis un groupe de lignes par composant : étiquette à gauche, valeur à droite, interrupteur pour oui/non, pastilles pour les choix multiples, puces pour les liens multiples. Chaque champ dit d'où vient sa valeur (« par défaut », « hérité ») et propose ↩ pour revenir à la valeur du type ou du modèle.
- Ensuite : **Ajouter des champs** (un groupe de champs pour cette entité seulement), **Liens** (liste avec « Ajouter un lien » sur place), **Contexte** (où elle se trouve, ce qu'elle contient : calculé, lecture seule), puis deux lignes repliées : **Modèle et variantes** (ouverte d'office si l'entité a un modèle ou des variantes) et **Historique**.
- Le menu **•••** à côté du nom : *Créer une variante*, *Dupliquer* (copie sans lien), *Détacher du modèle*, *Supprimer l'entité* (deux clics).
- Le défilement est conservé quand la page se redessine ; clair et sombre suivent le thème de Trello.

## Modèle (ECS)

| Notion | Rôle | Exemple |
| --- | --- | --- |
| **Composant** | groupe de champs typés | *Entretien* : fréquence (nombre), dernier arrosage (date), santé (choix) |
| **Archétype** (le « type ») | modèle prédéfini : des composants, des **valeurs par défaut**, une nature, des archétypes parents | *Plante* = Lieu + Entretien, arrosage par défaut 7 jours |
| **Entité** | instance d'un ou plusieurs archétypes : ne stocke que ses **surcharges** (ce qui diffère du défaut), peut ajouter des composants à elle seule, a des alias, des liens, un historique | *Monstera*, lieu = Hôtel de Ville, arrosage = 3 jours |

Types de champ : texte, nombre, date, oui/non, choix, lien vers une entité, liens vers plusieurs entités. Un lieu est simplement une entité de type *Lieu* (fourni par défaut, avec le composant *Lieu*) ; donnez-lui des alias (`travail, work, bureau`) pour que « au travail » le retrouve.

Les **liens** sont de deux sortes : les champs « lien » (ex. lieu d'une plante) et des relations libres nommées (« contient », « fait partie de »). Les liens entrants sont affichés sur l'entité liée. Supprimer une entité retire aussi les liens qui pointent vers elle (noté dans l'historique des autres entités).

L'**historique** garde les 40 derniers changements de chaque entité ; chacun peut être annulé (l'annulation s'ajoute à l'historique, rien n'est effacé).

## Ontologie

Le modèle distingue la **nature** des choses (matière, vivant, agent, lieu, événement, fait social, abstrait), les **types parents** (une Ville est un Lieu), les **rôles**, des relations typées avec inverse (« situé dans » / « abrite »), une hiérarchie de contenance transitive et un contrôle d'**ancrage matériel** des abstraits. Une **bibliothèque** installe en un clic des types prêts (crème pour les mains, région, pays, ville, bâtiment, personne, travailleur, concept…). Étude et détails : [entities-ontologie.md](entities-ontologie.md).

## Composer (création en une page)

Le bouton **Composer** ouvre une seule page (plus d'étapes) :

1. **Nom** : un champ. « Palmier, une plante au travail » est compris : nom, archétype *Plante*, lieu dont l'alias est « travail » (champ lien de l'archétype, sinon relation « situé dans » / « lié à »). Une virgule dont la suite ne veut rien dire reste dans le nom. Alias en puces dessous, avec avertissement de doublon.
2. **Archétype** : pastilles rangées par nature. Celles de la bibliothèque non installées portent un « + » (un clic les installe avec leurs parents). On peut en **combiner** plusieurs, ou en **définir un nouveau** (nature, parents, rôle, champs en une ligne). Une fois choisi, la liste se replie.
3. **Composants** : une carte par composant des archétypes, remplie en place ; tout est facultatif et un champ vide prend la valeur **par défaut** de l'archétype (affichée « par défaut : … »). **Ajouter un composant** : un existant, ou un nouveau décrit en une ligne (`Poids (nombre: kg), Notes (texte-long)`).
4. **Liens** : relations proposées selon ce qu'on crée (voir [entities-ontologie.md](entities-ontologie.md)), avec l'inverse affiché.

**Créer à la volée** : une question de lien propose « Créer « Salon » » ; la même page s'ouvre pour lui (fil d'Ariane), puis « Ajouter et revenir ». Rien n'est écrit avant « Créer » (ou « Créer et en ajouter une autre »). Un aperçu en direct est affiché à droite.

Logique pure et testée : `components/entities/entities-composer.js` (`readIntent`, `suggest`, `defaultFor`, `archetypeChoices`, `toggleComponent`, `defineComponent`, `defineType`, `issues`, `finalize`) ; interface : `entities-composer-ui.js` + `.css`. Tests : `test/entities-composer.test.js`, `test/entities-ontology.test.js`.

Dans l'éditeur de **Schéma**, chaque archétype a une section « Valeurs par défaut » (champs hors liens). Sur la page d'une entité, un champ affiche sa provenance (« par défaut », « hérité », ou ↩ quand il a été modifié) et « Ajouter des champs » ajoute un composant à cette entité seulement. Un champ « lien vers une entité » propose aussi les entités des sous-types (un Bâtiment est un Lieu).

## Variantes (une entité comme modèle)

En plus de l'archétype (le type), une entité peut être une **variante** d'une autre entité (son modèle). Elle hérite de toutes ses valeurs et ne stocke que ses **surcharges** :

- Modifier une variante écrit une valeur propre ; l'archétype et les autres variantes ne bougent jamais.
- Modifier l'archétype se répercute sur les variantes, sauf sur les champs qu'elles ont surchargés.
- Chaque champ indique sa provenance (« hérité de Monstera » / « modifié ») ; **Réinitialiser** supprime la surcharge et revient à la valeur du modèle.
- **Créer une variante** (hérite), **Dupliquer** (valeurs copiées, aucun lien) et **Détacher du modèle** (garde les valeurs actuelles, ne suit plus) sont dans le menu **•••** de la page ; la ligne repliée « Modèle et variantes » permet de choisir le modèle d'une entité existante et liste ses variantes. Les chaînes (variante d'une variante) fonctionnent ; les boucles sont refusées.
- Supprimer un archétype fige les valeurs héritées de ses variantes. Alias, types et liens libres ne sont pas hérités ; les recherches (« mes plantes au travail ») et l'assistant voient les valeurs héritées.
- Cela se fait depuis la page de l'entité ; le Composer ne le propose plus.

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
- `components/entities/entities-library.js` : bibliothèque d'ontologie (types et composants prêts à installer) ; test : `test/entities-ontology.test.js`
- `components/entities/entities-composer*.js` : l'assistant de création (voir plus haut)
- Tests : `test/entities-composer.test.js`, `test/entities-model.test.js`, `test/entities-trello.test.js`, `test/agent-entities.test.js` ; page de test visuel : `sandbox/e2e/entities.html` (serveur : `npm run test:e2e -- --serve`)

## Pas encore fait

- Les cartes ne sont pas encore liées aux entités (ex. « Arroser mes plantes » → une tâche par plante) : l'assistant sait *quelles* entités sont visées, mais il n'a pas d'outil pour créer ou lier des cartes.
- Pas de synonymes automatiques entre l'annuaire **Lieux** du profil et les entités de type Lieu : les alias se saisissent dans l'entité.
- L'historique n'est pas encore branché sur le panneau d'historique de la Table.
