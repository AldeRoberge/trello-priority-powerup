# Notes (clone de Google Keep)

Page autonome `keep.html`, installable sur l'écran d'accueil du téléphone. Notes et listes à cocher, épingler, couleurs, archives, recherche. Elle marche hors ligne et se synchronise avec Trello environ toutes les 10 secondes, au retour au premier plan et dès que le réseau revient.

## Installer

1. Ouvrir `https://<compte>.github.io/<dépôt>/keep.html` dans Safari (iPhone) ou Chrome (Android).
2. Partager → **Sur l'écran d'accueil**.
3. Au premier lancement : **Se connecter avec Trello**, puis choisir le tableau (celui des documents).

## Où sont les notes ?

Chaque note est un **document** de la vue Documents (carte `📄` archivée). Une note créée ici apparaît donc dans Documents, et inversement. Les listes `- [ ]` / `- [x]` sont des listes à cocher ; épingle, archive, couleur, avancement et position sont gardés dans le bloc caché du document (`keep: pin,arch,color=yellow,pct=40,ord=2048`). La synchro Google Drive et Google Keep du Worker continue de s'appliquer aux mêmes documents.

## Hors ligne

Les notes sont gardées sur l'appareil (IndexedDB). Une modification est écrite tout de suite, puis envoyée à Trello quand c'est possible. Si une note a changé des deux côtés, rien n'est perdu : la version distante reste et la version locale devient une copie « (conflit) ».

## Actions sur une note

- **Clic droit** : ouvrir, terminer / rouvrir, épingler, couleur, convertir texte / liste, dupliquer, archiver, supprimer. Archiver et supprimer agissent tout de suite ; « Annuler » (ou Ctrl+Z) les reprend pendant quelques secondes.
- **Cercle en bas à droite** : un clic termine la note (100 %) ou la rouvre ; presser et glisser vers le haut ou la droite règle le pourcentage (par 5). Une note terminée est grisée. Le pourcentage est gardé dans la note (`pct=`), donc il marche hors ligne.
- **Glisser une note** sur une autre pour la placer avant ou après (un trait montre l'endroit). Les épinglées et les autres sont deux groupes : on ne dépose pas d'un groupe à l'autre (l'épingle change de groupe). La position est gardée dans la note (`ord=`). Les nouvelles notes arrivent en tête de leur groupe. Désactivé pendant une recherche.
- **Recherche** : taper filtre tout de suite. **Entrée** (ou l'étincelle) interroge l'assistant IA du tableau : une courte réponse et les notes les plus pertinentes, dans son ordre. Échap ou effacer revient à la liste. Sans fournisseur IA configuré, ou hors ligne, la recherche simple reste et un court message le dit.

## Limites

- iOS ne synchronise pas en arrière-plan quand l'app est fermée : le rattrapage se fait à l'ouverture.
- Une note ne peut pas dépasser la taille d'une description Trello (16 384 caractères).
- Pas de glisser au doigt pour réordonner (souris seulement).
