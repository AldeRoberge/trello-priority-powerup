# Ontologie des entités : ce qu'est une « chose »

Étude préalable (philosophie et matérialisme) puis ce qu'elle a changé dans le modèle ECS (`entities-model.js`) et le Composer. Objectif : qu'une même mécanique décrive une crème pour les mains, une région de la carte, une personne, un travailleur, un bâtiment, une ville, un concept.

## 1. Ce que la philosophie apporte

| Source | Idée retenue | Dans le modèle |
| --- | --- | --- |
| **Aristote** (substance et accidents, hylémorphisme : une chose = matière + forme) | Ce qu'une chose *est* (essentiel) se distingue de ce qu'elle *a* ou *est en passant* | **Type** = forme ; **composants** = propriétés ; **rôle** = accident |
| **Aristote** (genre et espèce) | Une espèce hérite du genre (la ville est un lieu) | **Types parents** : une Ville est un Lieu, hérite de ses composants et se retrouve avec lui |
| **Platon** (Formes) vs **nominalisme** | Les idées existent-elles hors des choses ? Le modèle ne tranche pas : il permet les deux | Les **abstraits** sont des entités, mais doivent être *portés* (voir §2) |
| **Locke** (qualités premières et secondes) | Masse, étendue, forme : propres à la chose ; couleur, goût : relatifs à l'observateur | Champs mesurables (masse, volume, surface) vs champs d'appréciation |
| **Husserl, Meinong** (objets intentionnels) | On peut penser, nommer, relier ce qui n'existe pas matériellement (justice, licorne) | Nature **Abstrait** : entité sans corps, avec définition et liens |
| **Searle** (ontologie sociale) | « X compte comme Y dans le contexte C » : argent, loi, société existent par reconnaissance collective | Nature **Fait social** (organisation, règle) |
| **BFO / ontologies formelles** (continuants et occurrents, dépendance) | Distinguer ce qui *dure* (objet) de ce qui *se déroule* (événement) ; un rôle dépend d'un porteur | Nature **Événement** ; type avec `role: true` |
| **Whitehead, Latour, DeLanda** (processus, réseaux, agencements) | Une chose est ce qu'elle fait dans ses relations ; un tout est un agencement de parties | Relations typées de première classe, composition (« fait de ») |
| **Mérologie** (parties et touts) | « Partie de » est transitif | Hiérarchie de **contenance** transitive |

## 2. Ce que le matérialisme apporte

- **Matérialisme ontologique** : tout ce qui existe est matière ou dépend de la matière. Les idées ne flottent pas : elles sont portées par des cerveaux, des textes, des lieux, des pratiques (*survenance* : pas de différence d'idée sans différence matérielle).
- **Matérialisme historique** (Marx) : les choses sociales (propriété, travail, organisation) naissent de rapports de production entre humains et matière.
- **Matérialisme des assemblages** (DeLanda) : un tout (ville, entreprise) est un agencement de parties aux relations réelles, avec des propriétés émergentes.

Conséquences concrètes :

1. **Royaumes** : chaque nature est *matérielle* (matière, vivant, agent, lieu, événement : a un corps, une place ou une date) ou *immatérielle* (fait social, abstrait : existe par convention ou par pensée).
2. **Composition et production** : relations « fait de », « fabriqué par », « appartient à ». Une crème est faite de glycérine et fabriquée par un labo : la chaîne matérielle est modélisée, pas seulement décrite.
3. **Ancrage** (le garde-fou matérialiste) : un abstrait ou un fait social doit être relié, à 3 liens au plus, à quelque chose de matériel (ce qui l'incarne, l'exprime, l'instancie). Sinon l'entité est signalée *flottante* (information, jamais bloquant). Exemple : *Justice* → exprimé par → *Code civil* → exprimé par → *Palais de justice* (bâtiment).
4. **Contenance** : lieux et parties s'emboîtent (Salon, Hôtel de Ville, Montréal, Canada) ; « mes plantes au Canada » trouve donc la plante du Salon.

## 3. Modèle

### Natures (`EntitiesModel.NATURES`)

| Nature | Royaume | Exemples |
| --- | --- | --- |
| `matter` Matière | matériel | crème pour les mains, glycérine, bâtiment (en partie) |
| `living` Vivant | matériel | plante, animal |
| `agent` Agent | matériel | personne, travailleur |
| `place` Lieu | matériel | région du monde, pays, ville, bâtiment, pièce |
| `event` Événement | matériel | réunion, récolte |
| `social` Fait social | immatériel | organisation, règle, loi |
| `abstract` Abstrait | immatériel | concept, valeur |

### Types

Un type a : `nature`, `parents` (hiérarchie, sans boucle ; plusieurs parents permis : un **Bâtiment** est un Lieu *et* un Objet), `role` (une personne *est* travailleur dans un contexte, pas par nature), `description`. Une entité répond à son type et à tous ses ancêtres : « mes lieux » trouve villes et pièces.

### Champs

Genres ajoutés : choix multiple, texte long, coordonnées (lat, lon), lien web (http/https seulement), et une **unité** pour les nombres (`50 ml`, `8,5 $`). Un champ de lien peut porter une relation (`rel`) : le *Lieu* d'une plante **est** « situé dans », le *Fabriqué par* d'un produit **est** « fabriqué par » : ces champs alimentent la hiérarchie et l'ancrage sans double saisie.

### Relations (`EntitiesModel.RELATIONS`)

Texte libre toujours permis ; un nom reconnu (nom, inverse ou alias, français ou anglais) prend un sens : catégorie, inverse, transitivité (`up`), natures attendues (écart = avertissement).

| Catégorie | Relations (inverse) |
| --- | --- |
| spatiale / mérologique (hiérarchie) | situé dans (abrite), fait partie de (contient), habite à |
| composition, production | fait de (compose), fabriqué par (a fabriqué) |
| sociale | appartient à (possède), membre de, travaille pour (emploie) |
| taxonomique | instance de (a pour instance), sorte de |
| **ancrage** | ancré dans (ancre), exprimé par (exprime) |
| causale, temporelle | cause, dépend de, précède |
| conceptuelle | s'oppose à, ressemble à, représente |
| générique | lié à |

### Bibliothèque (`entities-library.js`)

Types prêts à l'emploi, installés à la demande avec leurs parents, composants et cibles de liens : Objet, **Produit** (crème pour les mains : marque, ingrédients, type de peau, péremption), Substance, Être vivant, Animal, Personne, **Travailleur**, Organisation, Lieu, **Région du monde**, Pays, **Ville**, **Bâtiment**, Pièce, Événement, **Concept**, Valeur, Règle. Tout le catalogue pèse environ 9 000 des 16 384 caractères de la carte de schéma ; une installation qui dépasserait 15 000 est refusée.

## 4. Dans le Composer

- Première question : **Qu'est-ce que c'est ?** (nature). Elle filtre les types et propose, d'un clic, ceux de la bibliothèque qui manquent.
- « Nouveau type » demande nature, types parents et rôle ; la ligne de champs accepte `Poids (nombre: kg)`, `Peau (choix-multiple: sèche/mixte)`, `Définition (texte-long)`, `Position (geo)`, `Site (url)`.
- Étape **Liens** adaptée : un concept se voit demander *ce qui l'incarne ou l'exprime*, un lieu *où il est et ce qu'il contient*, un produit *de quoi il est fait et par qui*. Relations proposées selon la nature, avec l'inverse affiché ; un lien qui ferait contenir une chose par elle-même est refusé.
- Remarques ontologiques : concept flottant (information), relation entre natures inhabituelles (avertissement), boucle de contenance (erreur, bloque la création).

## 5. Dans la vue Entités

Carte **Ontologie** par entité : natures, rôle, chemin (Canada › Montréal › Hôtel de Ville › Salon), contenu, ancrage matériel. Éditeur de schéma : nature, parents, rôle, description par type ; bibliothèque par groupe. Liens entrants affichés avec l'inverse (« abrite Salon »).

## 6. Pas fait

- Relations personnalisées (nom, inverse, natures) : le vocabulaire est dans le code ; un nom inconnu reste un lien libre.
- La lecture d'une phrase (`readIntent`) crée encore un lien « lié à » (et non « situé dans ») quand aucun champ de lien ne convient, pour ne pas changer le comportement existant.
- Pas de graphe visuel de la hiérarchie : seulement le chemin et la liste du contenu.
