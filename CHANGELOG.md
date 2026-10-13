# Journal des nouveautés

Les plus récentes en premier. Une section par jour : `## AAAA-MM-JJ`, puis une puce par nouveauté visible pour l'utilisateur.
Le script `scripts/stamp-build.js` lit ce fichier au déploiement, et l'assistant s'en sert pour répondre à « quelle version ? » et « quoi de neuf ? ».

## 2026-10-13
- Documents : l'aperçu d'une tâche s'agrandit par n'importe quel coin, et la molette zoome sous le curseur.
- Aujourd'hui : une tâche courte ne recouvre plus la suivante sur la ligne du temps.
- Documents : la poignée (+ et glisser) s’aligne sur la première ligne de chaque bloc.
- Documents : Tab dans une liste indente une sous-tâche. La puce ou la case reste la même.
- Saisie : le texte et le défilement ne recopient plus tout le document à chaque lettre.
- Gantt : faire défiler charge le jour, la semaine, le mois ou l'année d'à côté, au lieu de rester bloqué sur la période affichée.
- Orchestrateur : un zoom, des minutes aux années (puis Vague). Déposer une carte sur une heure la planifie à cette heure.
- Documents : sélectionner du texte affiche une barre (style, couleur, surlignage, gras, italique, lien, listes) et « Créer une tâche ».
- Documents : dans un bloc de code, la flèche bas ou un clic en dessous place le curseur sous le bloc.
- Entités : le curseur au-dessus, au milieu ou en dessous d'une entité affiche un + pour en créer une à cet endroit.
- Bloquer une carte n'exige plus une raison. Le champ reste là si on veut en ajouter une.
- Kanban, Tableau et Dashboard : une carte rattachée à un projet affiche « Projet · Objectif ». Une échéance (heure ou date sans début) se distingue d’un jour prévu.
- Aujourd'hui : la priorité, l'estimation, le jour et la flèche restent alignés d'une tâche à l'autre.
- Entités : dans « quel genre », un mot cherche tous les genres. Un mot nouveau, comme Chat, crée le genre.
- Documents : chaque document est un fichier .md dans Google Drive, dans les deux sens, comme les tâches avec Google Sheets.
- Orchestrateur : chaque échelle a une icône.
- Listes : le curseur sous une tâche ou un document affiche un + pour en créer un à cet endroit (Kanban, Tableau, Gantt, Mindmap, Documents, Tableau de bord, Entités, sous-tâches).
- Saisie : quatre suites sont prévues d'un coup. Tant que les lettres suivent l'une d'elles, l'IA n'est pas rappelée.
- Gantt : survoler la ligne rouge affiche l'heure exacte, à la milliseconde près quand on zoome.
- Saisie : la suite proposée par l'IA (Tab pour garder) suit aussi les descriptions, les nouvelles cartes et les autres champs de texte.
- Mindmap : un groupe se sélectionne, se déplace avec son contenu, se renomme, et une carte glissée dessus en fait partie.
- Orchestrateur : « Nouvelle tâche » en bas de chaque colonne crée la tâche là (à planifier, ce jour, ou cet horizon). « Demain » dans le titre choisit le jour.
- Tableau de bord : clic droit sur une carte pour trier, planifier, modifier, ouvrir ou archiver.
- Saisie : la suggestion pendant la frappe utilise le modèle rapide et continue la phrase.
- Dashboard : la prochaine action est la première sous-tâche ouverte. Le triage peut classer en référence, en attente ou un jour. La revue liste ce qui manque.
- Kanban et Tableau : la prochaine action s'affiche sous le titre. Au-delà de 3 cartes en cours, on peut ranger la moins prioritaire.
- Une échéance (heure, ou date sans début) se distingue d'un jour prévu. Un horizon vague reste hors du calendrier.
- Documents : « Mentionné dans » sur le document et sur l'aperçu d'une tâche.
- Orchestrateur : Jour, Semaine, Mois, Année, Années et Vague. L’horizon « À long terme » s’ajoute au planificateur.
- Clic droit : le statut est un sous-menu (Mindmap, Tableau, Kanban), au lieu d'une ligne par liste.
- Documents : « Repositionner » la couverture permet aussi de zoomer (molette, pincement ou curseur) et de la déplacer dans tous les sens, sans jamais laisser de bord vide.
- Mindmap : la barre d’outils est une rangée d’icônes (pointeur, sélection, grille, liens, groupes), comme dans Paint.
- Entités : la fenêtre « Nouvelle entité » se cale sur le champ, sans grand vide en dessous.
- Documents : l'auteur et la dernière modification (qui, quand) sous le titre ; un clic ouvre l'historique des versions (aperçu, changements, restauration).
- Documents : une tâche ou une entité a sa page (personnes, étiquettes, échéance, description, mots-clés, sous-documents). Menu Document dans Tableau, Kanban, Gantt et Entités.
- Documents : chaque ligne a une poignée à gauche pour la glisser, la changer de type ou ajouter un bloc, y compris une image.
- Documents : sélectionner du texte propose « Créer une tâche » ; la sélection devient une tâche du tableau, liée dans le document.
- Mindmap : zoom arrière replie un groupe (vision, projet, type ou groupe à la main) ; zoom avant ouvre la tâche en nœuds (progrès, priorité, statut).
- Saisie : l'IA propose la suite du texte (Tab pour garder) dans les documents, les noms de tâches, de documents et de personnes, et les étiquettes.
- Interface : les phrases d'explication sous les titres et les champs sont retirées (nouvelle entité, réglages, documents, assistant, Gantt, guide).
- Mindmap : un lien se lit depuis la carte cliquée, sans répéter le nom. Tâche planifiée : « Sera fait par » ; en cours : « Est en train d’être fait par » ; terminée : « Complété par ». Depuis la personne : « Va faire », « Est en train de faire » ou « A complété ».
- Menu clic droit : le fond suit le mode sombre (Entités, Mindmap, Réglages).
- Documents : couverture en haut de chaque document (couleur, dégradé, photo Unsplash, lien ou image importée), repositionnable et annulable.
- Orchestrateur : la colonne « À planifier » s’aligne sur les jours, la semaine tient sur une ligne, et les petits boutons n’ont plus de contour blanc.
- Vues : changer d'onglet (Kanban, Tableau, Gantt) ne fait plus un flash blanc.
- Documents : Retour arrière juste après une personne ne garde que le prénom, la mention reste.
- Documents : « Nouveau sous-document » est en tête du menu, avec une icône +.
- Annulation : le message « Action annulée » ouvre l'historique, pour annuler ou rétablir d'autres modifications (Kanban, Gantt, Mindmap, Documents).
- Gantt : survoler la ligne rouge d'aujourd'hui affiche l'heure actuelle.
- Cartes : choix du statut et de l'urgence avec recherche, touches S, P et D (style Linear).
- Nouvelle carte : la touche C ouvre le même composeur dans Kanban, Table et Gantt.
- Documents : le panneau rapide d'une tâche affiche statut, progression, blocage, priorité, échéance, estimation et description, avec renommer et archiver (annulable).
- Mindmap : une nouvelle tâche apparaît tout de suite à l'endroit où elle a été déposée. Bouton Tableau restauré après un rafraîchissement.
- Table : la case priorité devient rouge sur les cartes bloquées.
- Saisie jamais perdue : cliquer ailleurs crée la tâche en cours de saisie (Mindmap et Kanban).

## 2026-10-07
- Kanban : la suggestion de l'IA se base sur l'état complet de la carte (attente, sous-tâches, échéance, conversation récente).
- Entités : la page s'ouvre sur les groupes remplis et les liens. La recherche trouve les personnes par poste.
- Aujourd'hui : chips sans bordure, nom et heure sur une seule ligne.

## 2026-10-06
- Entités : groupes de personnes, rôles dans les relations, sélecteur de lien avec création sur place.
- Entités : menu clic droit complet, sections repliables, jauges de niveau, composants par type.
- Entités : une carte de réalité construite par l'IA à partir du seul nom, avec les éléments vérifiés créés automatiquement.
- Tableau de bord : vues Capture, Triage, Orchestrateur et Aujourd'hui, avec « Prochaine action ».
- Capture : éditeur riche, pièces jointes, dates en français (demain, vendredi) qui deviennent la date planifiée.
- Documents : supprimer devient archiver (restaurable).
- Icônes : le + ne sert qu'à créer, le crayon à choisir ou modifier.
