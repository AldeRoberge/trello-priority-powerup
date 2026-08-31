# Google Sheets ↔ Trello (guide de configuration)

Synchronisation à deux sens, immédiate, sans backend Cerveau. Le moteur de sync est un
script **Google Apps Script** que vous déployez vous-même (gratuit sur un compte Google
personnel) — Cerveau ne fait que le configurer.

Contexte / choix de conception : voir [`google-sheets-sync-plan.md`](./google-sheets-sync-plan.md).
Résumé : un tableau Trello par feuille, la « Catégorie » est un vrai champ personnalisé
Trello, une nouvelle ligne dans le Sheet crée une carte, et Priorité/Progrès sont
**en lecture seule** (Trello → Sheet uniquement — voir l'en-tête de `Trello.gs`).

---

## Étape 1 — Créer la feuille et coller le script

1. Créez une **feuille Google Sheets vide**.
2. **Extensions → Apps Script**.
3. Supprimez le contenu par défaut (`Code.gs`), puis créez 4 fichiers avec le contenu de
   [`google-sheets-sync/apps-script/`](./google-sheets-sync/apps-script/) dans ce dépôt :
   - `Code.gs`
   - `Trello.gs`
   - `Config.gs`
   - `appsscript.json` (dans l'éditeur Apps Script : icône ⚙️ **Paramètres du projet** →
     cocher *Afficher le fichier manifeste "appsscript.json" dans l'éditeur* pour pouvoir
     le remplacer)
4. **Enregistrer** le projet.

## Étape 2 — Initialiser les onglets

1. Dans l'éditeur, sélectionnez la fonction **`setupTemplate`** dans le menu déroulant en
   haut, puis **Exécuter**.
2. Autorisez le script quand Google le demande (accès à cette feuille uniquement).
3. Ouvrez **Affichage → Journal d'exécution** : notez le `SETUP_TOKEN` affiché — vous en
   aurez besoin à l'étape 4.
4. Retournez sur la feuille : 4 onglets sont créés — `Tasks` (visible), `_SyncState`,
   `_Config`, `_SyncLog` (masqués, ne pas y toucher à la main).

## Étape 3 — Donner au script l'accès à Trello

1. Créez un **jeton d'API Trello personnel** :
   `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=e449f4c01b03a2501072808abe5611ab`
   (c'est la clé d'app de Cerveau — publique, déjà utilisée par le Power-Up lui-même).
2. Dans l'éditeur, ouvrez `Code.gs` et **temporairement** ajoutez une fonction :
   ```js
   function storeMyTrelloToken() {
     setTrelloCredentials('e449f4c01b03a2501072808abe5611ab', 'VOTRE_JETON_ICI');
   }
   ```
   Sélectionnez **`storeMyTrelloToken`** (pas `setTrelloCredentials` tout seul — sans
   arguments elle écraserait les secrets avec des valeurs vides), **Exécuter**, puis
   **supprimez** `storeMyTrelloToken` et le jeton du fichier.
3. Le jeton est stocké dans les *Script Properties* (jamais dans une cellule).

## Étape 4 — Déployer comme Web App

1. **Déployer → Nouveau déploiement**.
2. Type : **Application Web**.
3. « Exécuter en tant que » : **Moi**. « Qui a accès » : **Tout le monde**.
4. **Déployer**, puis copiez l'URL `.../exec`.

> Trello enverra des requêtes à cette URL à chaque changement sur le tableau — elle doit
> rester publique (n'importe qui avec le lien pourrait y envoyer une requête ; le script
> vérifie le jeton de configuration pour les changements de réglages, mais un webhook
> Trello falsifié resterait théoriquement possible — risque jugé acceptable pour un outil
> personnel, voir la section Sécurité du plan).

## Étape 5 — Connecter depuis Cerveau

1. Dans Trello, ouvrez le **Gantt** (Cerveau) sur le tableau à synchroniser.
2. Cliquez **Google Sheets** dans la barre d'outils.
3. Collez l'URL `.../exec` et le `SETUP_TOKEN` de l'étape 2.
4. Cochez les champs à synchroniser (Catégorie, Objet, Description, Statut — Priorité et
   Progrès sont toujours en lecture seule).
5. **Autoriser Trello** si ce n'est pas déjà fait, puis **Enregistrer et activer**.

Ceci crée le champ personnalisé *Catégorie* sur le tableau (si coché), enregistre un
webhook Trello pointant vers votre Web App, et pousse la configuration (tableau + champs
choisis) dans l'onglet `_Config`.

## Étape 6 — Tester

- **Trello → Sheet** : modifiez le titre d'une carte, ou déplacez-la vers une autre liste.
  La ligne correspondante dans `Tasks` devrait se mettre à jour en quelques secondes.
- **Sheet → Trello** : modifiez une cellule *Objet* ou *Statut* existante — la carte Trello
  change en quelques secondes à ~1 minute (délai du déclencheur `onEdit` de Google, pas
  garanti instantané).
- **Nouvelle carte** : ajoutez une carte sur le tableau — une ligne apparaît dans `Tasks`
  avec son ID (colonne A, masquée) rempli automatiquement.
- **Nouvelle ligne** : tapez le titre dans la colonne **Objet** (pas la première colonne
  visible — celle-ci est *Catégorie* ; la colonne A `TrelloCardId` est masquée). Une carte
  Trello est créée au prochain `onEdit`, et l'ID revient dans la colonne A.
- **Conflit** : modifiez le même champ des deux côtés avant qu'une sync passe — Trello
  gagne, et la ligne écrasée est notée dans `_SyncLog`.

## Correspondance des colonnes (`Tasks`)

| Colonne | Source Trello | Sens |
|---|---|---|
| Catégorie | champ personnalisé « Catégorie » | Sheet ↔ Trello |
| Objet | titre de la carte | Sheet ↔ Trello |
| Description | description de la carte (métadonnées cachées de Cerveau préservées) | Sheet ↔ Trello |
| Statut | liste actuelle de la carte, via un mot-clé (Backlog / À faire / En cours / Bloqué / Terminé / Annulé…) | Sheet ↔ Trello (changer Statut déplace la carte vers la liste correspondante) |
| Priorité | `impact` brut des données du Power-Up (`cardPriority`) | Trello → Sheet seulement |
| Progrès | % de cases cochées dans les checklists de la carte | Trello → Sheet seulement |

Pour Statut, nommez vos listes proche d'un des mots-clés ci-dessus (correspondance simple,
sans tolérance aux fautes de frappe contrairement à la version dans le Power-Up).

## Dépannage

| Symptôme | Piste |
|---|---|
| « Enregistrer et activer » échoue à l'étape webhook | Trello vérifie l'URL avant de créer le webhook (requête `HEAD`) — si Apps Script ne répond pas assez vite à la vérification, la création échoue. Réessayez ; si ça persiste, redéployez le Web App (parfois un déploiement fraîchement créé met quelques secondes à répondre) |
| Rien ne se passe après une carte modifiée | Vérifiez que le webhook existe : `https://api.trello.com/1/tokens/VOTRE_JETON/webhooks?key=e449f4c0…` |
| Rien ne se passe après une édition du Sheet | `Déclencheurs` (icône ⏰ dans l'éditeur Apps Script) → un déclencheur `onEditInstallable` doit exister ; sinon relancez `installTriggers()` |
| « bad setupToken » | Le jeton collé dans Cerveau ne correspond pas à celui du journal — relancez `setupTemplate()` pour le revoir (il ne change pas s'il existe déjà) |
| Erreurs Trello API 401/404 | Rejouez `setTrelloCredentials(...)` avec un jeton valide |
| Catégorie ne se crée pas | Le compte Trello utilisé doit avoir les droits d'admin sur le tableau pour créer un champ personnalisé |
| Priorité/Progrès semblent faux | Ce sont des approximations en lecture seule (voir l'en-tête de `Trello.gs`) — pas la formule pondérée affichée dans le popup Cerveau |

## Resynchroniser tout manuellement

Depuis l'éditeur Apps Script, exécutez **`syncAllCards`** — relit toutes les cartes du
tableau configuré et réapplique la fusion à trois voies sur chacune.
