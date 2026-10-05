# Vue Documents

Un éditeur façon Google Docs / ClickUp Docs, dans la même fenêtre que **Gantt** et **Tableau** (onglet **Documents**, ou bouton **Documents** du tableau). Les documents sont partagés avec tous les membres du tableau.

## Utilisation

À l'ouverture de la vue, si le tableau n'a aucun document, un document **Bienvenue** est créé automatiquement (mode d'emploi rapide, modifiable ou supprimable).

| Action | Comment |
|--------|---------|
| Nouveau document | bouton **Nouveau** (ou `@@@titre` puis *Créer le document « titre »* depuis un autre document) |
| Mentionner une personne | `@` puis quelques lettres ; ↑ ↓ pour choisir, **Entrée** ou **Tab** pour valider, **Échap** pour fermer |
| Lier une tâche (carte) | `@@` |
| Lier un autre document | `@@@` |
| Tout chercher d'un coup | `@` seul liste personnes, tâches et documents (3 de chaque) |
| Commandes | `/` puis un mot (`/titre`, `/liste`, `/carte`…) |
| Raccourcis Markdown | `# ` `## ` `### ` titres, `- ` puces, `1. ` numérotée, `[] ` cases à cocher, `> ` citation, `---` + Entrée séparateur, ```` ``` ```` + Entrée bloc de code |
| Mise en forme | barre d'outils ; Ctrl+B / I / U, Ctrl+Maj+X barré, Ctrl+E code, Ctrl+K lien, Ctrl+Maj+7/8/9 listes, Ctrl+Alt+0…3 styles, Tab / Maj+Tab pour imbriquer une liste |
| Ouvrir ce qui est mentionné | clic sur une tâche (ouvre la carte), un document (l'ouvre), une personne (fiche) |

Les mentions affichent toujours le **nom actuel** de la carte, du document ou du membre ; une tâche terminée est barrée, une cible archivée ou supprimée est grisée et soulignée.
Les personnes proposées sont les **membres du tableau** et vos **contacts** (Mon profil → Personnes ; privés, donc invisibles pour les autres membres).

L'enregistrement est automatique (environ 1 s après la dernière frappe, au changement de document et à la fermeture). Le plan des titres s'affiche à droite.
Menu **…** : dupliquer, télécharger en `.md`, copier en Markdown, supprimer (définitif, avec confirmation).

## Où sont stockés les documents ?

Les données de Power-Up sont limitées à 4096 caractères par portée, c'est trop peu. Un document est donc **une carte Trello** dont la **description** (16 384 caractères au maximum, environ 2 500 mots) contient le texte en Markdown :

- la carte s'appelle `📄 Titre du document` et est **archivée dès sa création** : elle n'apparaît jamais sur le tableau, dans le Gantt, dans la Table, dans le Google Sheet ni dans les sélecteurs de cartes ;
- la vue les retrouve avec `GET /boards/{id}/cards/closed` en gardant les noms qui commencent par 📄 ;
- ils restent visibles (et restaurables ou supprimables) dans le menu Trello **Éléments archivés** ;
- la carte est classée dans la **première liste** du tableau (une carte archivée a besoin d'une liste) ;
- un bloc caché `<!--cerveau-meta type: document, rev: N -->` en fin de description porte un compteur de révision : si quelqu'un d'autre enregistre entre-temps, la sauvegarde est refusée et une barre propose *Charger sa version* ou *Écraser avec la mienne*.

Format Markdown : `# ## ###`, `**gras**`, `*italique*`, `++souligné++`, `~~barré~~`, `` `code` ``, `[texte](https://…)`, listes imbriquées (2 espaces), `- [ ]` / `- [x]`, `>`, blocs ```` ``` ````, `---`, et les mentions `[@Nom](person:ID)`, `[@Titre](task:ID_CARTE)`, `[@Titre](doc:ID_DOCUMENT)`.

## Limites

- Un document ne peut pas dépasser la taille d'une description Trello (16 384 caractères, bloc caché compris). Une jauge apparaît à 80 % et l'enregistrement est refusé au-delà.
- Pas d'édition simultanée en direct : dernier enregistrement gagne, avec détection de conflit (voir ci-dessus). Les modifications des autres sont reprises quand la fenêtre reprend le focus.
- Pas d'images, de tableaux ni de couleurs de texte. Un contenu collé depuis Google Docs / Word est converti (gras, italique, souligné, barré, listes, titres, liens) et le reste est ignoré.
- Trello doit être autorisé (même bouton que dans la vue Table) pour lire et écrire les documents.
- Au-delà d'environ 1 000 cartes archivées dans le tableau, Trello peut ne pas toutes renvoyer dans une seule réponse : les plus anciens documents pourraient alors manquer à la liste.

## Synchronisation Google Drive

Chaque document est copié dans un dossier Google Drive sous forme de fichier **`Titre.md`** (texte Markdown, sans le bloc caché de révision). La copie va dans un seul sens, Trello → Drive : modifier le fichier dans Drive ne change pas le document.

- À chaque enregistrement, le webhook Trello fait mettre à jour le fichier (quelques secondes) ; un document renommé renomme son fichier, un document supprimé met son fichier à la corbeille Drive.
- Toutes les 10 minutes, le Worker rapproche aussi l'ensemble (rattrapage). Seuls les fichiers créés par le Worker sont touchés.
- `POST /documents/sync` (en-tête `x-sync-secret`) force une passe ; `GET /info` donne `documents.status` (dernière passe, erreur éventuelle).

Installation, une fois (après `npm run setup:sheet-sync`) :

```powershell
npm run setup:documents-drive
```

Le script demande le dossier Drive (collez l'URL d'un dossier d'un **Drive partagé**, ou Entrée pour en créer un dans Mon Drive), le partage avec le compte de service, enregistre le secret `GOOGLE_DRIVE_FOLDER_ID`, redéploie le Worker et lance une première passe.

**Limite importante** : Google n'accorde aucun quota de stockage aux comptes de service. Avec un compte Google personnel (gmail.com), la création des fichiers dans *Mon Drive* est refusée (erreur `storageQuotaExceeded`, affichée par le script). Il faut alors un dossier dans un **Drive partagé** (Google Workspace). Sans `GOOGLE_DRIVE_FOLDER_ID`, la copie Drive est simplement désactivée.

## Synchronisation Google Sheets

Le Worker ignore les événements des cartes `📄` côté Sheet (sinon chaque sauvegarde automatique remplirait l'onglet **Activités** et déclencherait une synchronisation) ; ils ne servent qu'à la copie Drive ci-dessus. Après avoir récupéré cette version, redéployez le Worker une fois :

```powershell
npm --prefix workers/trello-sheet-sync run deploy
```

Sans redéploiement, tout fonctionne mais les documents apparaissent dans les activités du Sheet.

## Tests

- `npm run test:unit` : `test/docs-model.test.js` (conversion Markdown ⇄ éditeur, mentions, recherche), `test/docs-trello.test.js` (création archivée, révisions, conflits, suppression contre un faux Trello en mémoire).
- `npm run test:e2e -- --page=docs` : l'éditeur complet dans Edge/Chrome sans interface (saisie, `@`, `/`, raccourcis, collage, sauvegarde, conflit, suppression…).
- À la main : `npm run test:e2e -- --serve` puis ouvrir `/sandbox/e2e/docs.html?manual` (`&dark` pour le thème sombre, `&empty` sans document (le document Bienvenue est alors créé), `&unauth` sans jeton Trello).
