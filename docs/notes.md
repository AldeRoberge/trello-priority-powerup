# Notes (clone de Google Keep)

Page autonome `keep.html`, installable sur l'écran d'accueil du téléphone. Notes et listes à cocher, épingler, couleurs, archives, recherche. Elle marche hors ligne et se synchronise avec Trello environ toutes les 10 secondes, au retour au premier plan et dès que le réseau revient.

## Installer

1. Ouvrir `https://<compte>.github.io/<dépôt>/keep.html` dans Safari (iPhone) ou Chrome (Android).
2. Partager → **Sur l'écran d'accueil**.
3. Au premier lancement : **Se connecter avec Trello**, puis choisir le tableau (celui des documents).

## Où sont les notes ?

Chaque note est un **document** de la vue Documents (carte `📄` archivée). Une note créée ici apparaît donc dans Documents, et inversement. Les listes `- [ ]` / `- [x]` sont des listes à cocher ; épingle, archive et couleur sont gardées dans le bloc caché du document (`keep: pin,arch,color=yellow`). La synchro Google Drive et Google Keep du Worker continue de s'appliquer aux mêmes documents.

## Hors ligne

Les notes sont gardées sur l'appareil (IndexedDB). Une modification est écrite tout de suite, puis envoyée à Trello quand c'est possible. Si une note a changé des deux côtés, rien n'est perdu : la version distante reste et la version locale devient une copie « (conflit) ».

## Limites

- iOS ne synchronise pas en arrière-plan quand l'app est fermée : le rattrapage se fait à l'ouverture.
- Une note ne peut pas dépasser la taille d'une description Trello (16 384 caractères).
- Pas de glisser pour réordonner : les notes épinglées d'abord, puis les plus récentes.
