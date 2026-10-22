# Journal des nouveautés

Les plus récentes en premier. Une section par jour : `## AAAA-MM-JJ`, puis une puce par nouveauté visible pour l'utilisateur.
Le script `scripts/stamp-build.js` lit ce fichier au déploiement, et l'assistant s'en sert pour répondre à « quelle version ? » et « quoi de neuf ? ».

## 2026-10-22

- Une fenêtre « Une nouvelle version est disponible, veuillez actualiser » apparaît en bas à droite dès qu'une nouvelle version est publiée (vérification en arrière-plan toutes les 30 secondes), au lieu de recharger la page sans prévenir.
- Triage : glisser la séparation entre la liste et le détail pour l'élargir ou la rétrécir (double-clic pour revenir à la taille par défaut).
- Tableau : les lignes de projet repliables ont le même fond plus foncé que dans Triage.
- Triage : on peut glisser la barre d’avancement et cliquer le cercle pour terminer une tâche, dans la liste.
- Triage : le panneau de droite a une ligne « Avancement » (0 à 100 %) et une ligne « Sous-tâches » (cocher, ajouter).

- Menus clic droit : « Terminer » est en vert, comme « Archiver » est en rouge.
- Assistant : la page s’ouvre tout de suite (le scan du tableau et la mise à jour de la mémoire se font ensuite en arrière-plan), et l’onglet actif retrouve son soulignement bleu.

- Triage : l’avancement (barre et %) et la priorité sont plus visibles à droite de chaque ligne, et les projets affichent aussi leur priorité (la meilleure de leurs tâches) et leur avancement.

- Triage : un « + » au survol d’une tâche ou d’une sous-tâche ajoute une sous-tâche, directement dans la liste.
- Triage : un bouton « Bloquer » discret permet de marquer la tâche comme bloquée, et de la débloquer.

## 2026-10-21
- Recherche : le champ dit « Rechercher… » dans le Tableau, le Kanban, le Gantt, la Mindmap, le Parcours, les Documents, les Entités et le Dashboard.
- Documents : dans Personnes, un nom inconnu propose de créer la personne. Elle rejoint les contacts et, sur une tâche, la carte. `@` suivi du nom fait la même chose.
- Aujourd’hui : bonjour, météo, prochaine action, en retard, à faire, à planifier, revue et planning sont des widgets. On les déplace, on change leur taille, on les ferme, on les rouvre et on les renomme.
- Documents : un dossier vide n’a plus de flèche pour le replier. Elle revient dès qu’il contient un document ou un sous-dossier.
- Onglets : l’onglet Assistant garde le même soulignement bleu que Gantt.
- Triage, Document : le plan se lit comme un tableau. Une bande par projet (qu’on replie), ses tâches en retrait dessous, leurs sous-tâches encore plus en retrait. Les colonnes Jour, Urgence, Durée, Projet, Personnes, Lieux et Étiquettes tombent au même endroit sur chaque ligne ; sur un volet étroit, elles passent sous le titre.
- Triage, Document : une boîte « Demander une modification… » sous le plan. On écrit « mets les achats dans un projet », « fusionne ces deux tâches » ou « retire la dernière », l’IA change le plan sur place (avec le document, les images lues et les échanges précédents) et « Défaire » annule.
- Triage, Document : une étape qui échoue n’est plus résumée en une ligne. Chaque erreur affiche l’étape, la carte, le message complet, le type, le statut, le nombre de tentatives, ce qui a été envoyé et la trace, avec un bouton « Copier le détail ». Le panneau reste ouvert après la création pour qu’on puisse le lire.
- Triage, Document : « Card not found or not on current board » sur une carte tout juste créée (priorité, personnes, sous-tâches) est réglé : Trello ne connaît la carte qu’après un instant, l’étape attend et réessaie, puis une dernière fois une fois toutes les cartes créées.
- Carte : la barre de titre « Trello Cerveau » indique depuis quand l’application a été mise à jour (« mis à jour il y a 2 heures »), comme l’en-tête de la section dans la carte.
- Orchestrateur : sous ma rangée, une rangée par personne du tableau (membres Trello et contacts « Hors Trello »), sur les mêmes colonnes. Glisser une carte sur la rangée de quelqu’un la lui confie (sur la case d’un autre jour, elle change aussi de jour) ; la glisser vers ma rangée la reprend. La molette sur les personnes les fait défiler, ailleurs elle zoome toujours. « Défaire » ou Ctrl+Z remet comme avant.
- Clic droit sur une carte : « Confier à » une personne, ou à moi.
- Dashboard : ouvrir une tâche (Aujourd’hui, Triage, Orchestrateur) affichait « Tâche introuvable » ; elle s’ouvre maintenant. Si une carte manque vraiment, la console le dit au lieu de se taire.
- Planning : la ligne de l’heure actuelle est blanche (plus rouge). Au survol, l’étiquette indique l’écart avec maintenant (« -3 h », « +1 h 15 ») et cache les heures et la météo derrière elle au lieu de les chevaucher.

## 2026-10-21
- Assistant : une tâche créée s’ouvre en vrai panneau au-dessus de la boîte, au lieu d’une simple ligne. On y règle tout sur place : liste, titre, progrès, priorité, échéance, estimation, personnes, lieux, étiquettes et description. La croix le ferme.

## 2026-10-20
- Carte : priorité et statuts plus calmes. Les noms des 7 niveaux sont masqués (le badge nomme déjà le niveau), « Nous permet de… » et « Ce que ça coûte… » restent discrets jusqu’au survol, les statuts sont alignés à gauche avec seul le statut actuel rempli, et les choix de lieu sont atténués.
- Carte : les champs vides (description, assignés, lieux…) se replient sur une ligne discrète, ceux qui ont une valeur restent ouverts. Plus de chevrons, le titre devient l’en-tête et la barre de la description n’apparaît qu’au clic.
- Triage : la description d’une carte ou d’un projet reste dans le panneau, en texte riche. Elle ne s’ouvre plus dans une fenêtre.
- Ctrl+F ouvre une recherche instantanée : un projet ou une tâche s’ouvre tout de suite, et « Demander à l’IA » pose la même question à l’assistant sans modifier le tableau.
- Triage : coller une image dans la description d’un projet ou d’une carte la joint à la carte. Le texte de la carte des objectifs ne grossit pas.
- Kanban : « Projets » montre chaque projet dans sa colonne, avec ses tâches et ses sous-tâches. Glisser le projet le déplace (Backlog, À faire, En cours, Terminé) sans déplacer ses tâches.
- Assistant : « 1+1 » répond « 2 ». Une question qui ne change pas le tableau reçoit la réponse, sans demander quelle carte modifier.
- Projet : l’icône choisie (et sa couleur) apparaît dans chaque vue, et un clic dessus ouvre le même sélecteur. À la création du document du projet, l’assistant en propose une.
- Cliquer une tâche l’ouvre dans la vue, en isolation, pour la modifier sans changer de page.
- Assistant : l’interview de carte ne démarre plus et ne bloque plus les actions (mémoire de carte, etc.).
- Assistant : pendant l’attente, la conversation montre l’étape (préparation, envoi, lecture), une barre et le temps estimé.
- Paramètres : la capacité par jour se règle dans Journée. Le tableau de bord affiche seulement le temps déjà prévu.
- Isolation : le clic droit « Isoler » retient une tâche, une sous-tâche, un projet ou une personne. Les autres tâches pâlissent (Tableau, Kanban, Gantt, Mindmap, Parcours, Triage) et Documents ouvre la page de ce sujet.
- Triage et Gantt : un clic sur l’icône d’un projet en choisit une autre et une couleur, comme pour un document. À la création, l’assistant en propose une.
- Gantt : « Regrouper par projet » découpe le graphique comme le triage (projets repliables, « Sans projet » à la fin). Déposer une carte sur un projet l’y rattache.
- Assistant : les réponses dans la boîte en bas montrent le visage de l’assistant.
- Documents : chaque projet est un document, et chacune de ses tâches est un document enfant de ce projet.
- Assistant : « hello » reçoit un salut. La boîte ne demande plus quoi faire sur le tableau, et ne propose plus une suite de phrase sans rapport.
- Triage : cliquer le nom d’un projet déplie ou replie ses tâches, comme la flèche.
- Triage : le panneau d’un projet permet d’écrire sa description, de choisir ou créer son résultat, et de modifier sa prochaine action.
- Logo : nouveau logo Cerveau, plus net : deux hémisphères bleus unis sur fond sombre, sans dégradé ni halo.
- Menu clic droit d’une carte : « Archiver » est maintenant toujours en premier (Triage, Tableau, Kanban, Gantt, Mindmap, Parcours).

- Parcours : la carte montre maintenant toutes les tâches ouvertes d'emblée, plus besoin de cliquer un projet pour les voir.
- Parcours : cliquer une boîte ne recentre plus la carte si elle est déjà bien visible; sinon la caméra glisse doucement.
- Triage : cliquer sur un projet de l’arbre l’ouvre dans le panneau de droite, comme une tâche (nom et note modifiables, résultat, prochaine action, tâches ouvertes, avancement). La flèche sert toujours à replier.
- Tableau : les cartes sont regroupées en sections par projet (repliables, avec le nombre de cartes), « Sans projet » à la fin.
- Tableau : deux nouvelles colonnes, « Projet » et « Tâche parente », à droite de l’Objet (masquables depuis « Colonnes »).
- Triage : la liste s’affiche en arbre : les projets, sous eux leurs tâches, puis les sous-tâches (repliables, avec le « 2/5 » de sous-tâches faites). Le bouton arbre en haut revient à la liste simple ; J et K suivent l’ordre de l’arbre.
- Triage : l’échelle d’Impact (0 à 10) se teinte jusqu’à la valeur choisie, chaque chiffre prenant la couleur de son palier de priorité (gris, indigo, ambre, orange, rouge).
- Triage, Orchestrateur, Aujourd’hui : la priorité s’affiche avec un « P » devant le chiffre (P5), pour qu’on ne la prenne plus pour un compteur.
- Assistant : le visage reste immobile (plus de rebond, de clignement ni de lueur en boucle), et la pastille « nouveau message » et le point d’écoute ne pulsent plus.
- Tableau : en mode sombre, le bandeau des cartes critiques est un rouge foncé au lieu d’une barre rouge vif.
- Météo : la recherche de ville met d’abord la bonne (Val-d’Or au Québec avant « Val Dor » en Malaisie), préfère le Canada à nom égal, et retire les doublons, les aéroports et les lignes sans région ni pays.
- Tableau : « Colonnes… » dans le clic droit ouvre enfin le panneau des colonnes (il se refermait aussitôt).
- Triage : le bouton « Nouveau document » ouvre une page où l’on écrit, colle ou glisse du texte et des images. L’IA lit tout (images comprises) et propose des projets, des tâches et des sous-tâches avec jour, urgence, durée, personnes, lieux et étiquettes. On relit le plan, on corrige ce qu’on veut, puis « Créer » écrit les cartes dans le triage (annulable). Sans IA, le plan vient des puces et des retraits du texte.
- Onglets : l’onglet actif (Assistant, Gantt…) garde toujours son soulignement bleu, même quand il a le focus clavier ; le cadre de focus reste à l’intérieur de l’onglet.
- Parcours : les sous-tâches (éléments de liste d’une carte) se déplacent à la main comme les cartes et ont un fond plein ; les liens vers les sous-tâches sont tracés comme une arborescence (tronc et branches coudées, sans flèche).
- Parcours : double-clic sur le nom d’une tâche, d’un projet ou d’une mission pour le renommer sur place, comme dans la Mindmap (« Ouvrir » reste dans le clic droit et sous la carte).
- Parcours : chaque tâche a sa barre de progrès (cliquer ou glisser règle le %) et sa pause « II » pour la bloquer ou la débloquer.
- Parcours : le cercle d’une sous-tâche la termine (ou la rouvre) d’un clic, avec « Annuler ». Le cercle d’une tâche fait de même, sur la carte comme dans la liste « Maintenant ».
- Parcours : les sous-tâches ont leur pause « II », se renomment par double-clic, montrent leur échéance et leur effort, et ont un clic droit (terminer, bloquer, renommer, progrès, échéance, effort, ouvrir la carte, supprimer).
- Parcours : un « + » sous les sous-tâches d’une tâche en ajoute une (Entrée pour la suivante, Échap pour finir) ; « Sous-tâche » est aussi sous la carte et dans le clic droit de la tâche, qui peut maintenant être rouverte et renommée.
- Kanban : le bouton « Par priorité » découpe le tableau en rangées, une par palier (Critique tout en haut, puis Urgente, Prioritaire… jusqu’à « Sans priorité »). Les colonnes restent celles du tableau ; une carte se glisse d’une colonne à l’autre dans sa propre rangée, et chaque rangée se replie.
- Aujourd’hui : le bandeau « Bon matin » suit le mode sombre (ciel assombri, plus de fond éclatant) et plus rien n’y bouge (soleil, nuages, pluie, étoiles).
- Gantt : chaque sous-tâche a la pause (bloquer / débloquer), comme les tâches parentes. Une sous-tâche bloquée bloque la tâche parente.
- Sous-tâches : la liste des tâches terminées se replie comme une section, le panneau de progression reste ouvert après un glissement, et il a une coche pour terminer, une pause pour bloquer et un bouton « Ajouter une sous-tâche ». Le mode Nœuds est retiré.

## 2026-10-19
- Assistant : un bouton copie la conversation avec le détail technique (requêtes, réponses brutes, contexte envoyé) pour le déboguer.
- Tableau : les sous-tâches d’une carte s’affichent en lignes filles sous la carte, avec une flèche pour les déplier ou replier.
- Assistant : en corrigeant une liste de sous-tâches, il modifie l’élément existant au lieu d’en ajouter un doublon, et dit clairement quand il ne peut pas corriger.
- Assistant : pendant l’interview d’une carte, il peut renommer et supprimer une sous-tâche (avant, ces actions étaient refusées).

## 2026-10-16
- Priorité : cliquer Imp (ou un autre niveau) règle vraiment la carte sur ce niveau, empressement compris.
- Planning : cliquer une tâche l’ouvre ici, à côté de l’heure, au lieu d’un autre onglet.
- Planning : les heures hors travail sont barrées (tôt le matin, fin d’après-midi, vendredi après-midi, samedi et dimanche).
- Dashboard : le menu du jour prévu (Orchestrateur) propose maintenant les horizons vagues (Bientôt, Sous peu, Éventuellement…) dans « Plus tard », et le prochain lundi s’écrit « Lundi prochain » au lieu de sa date.

## 2026-10-15
- Documents : survoler ou cliquer une tâche liée ouvre un panneau d’actions rapides (liste, progrès, bloquée, priorité, échéance, estimation, description, renommer, archiver).
- Toutes les vues : pendant le chargement, chaque onglet (Dashboard, Gantt, Tableau, Kanban, Mindmap, Parcours, Documents, Entités) affiche un squelette gris animé à l’image de sa page (barre d’outils, colonnes, lignes, panneaux, barre de l’Assistant), avec le même nombre de lignes, colonnes et cartes que la dernière fois.
- Dashboard, Documents et Entités : le panneau de gauche a le même look (titre, + pour créer, recherche, lignes) et se redimensionne en glissant son bord (double-clic pour revenir à la taille d’origine). Le Dashboard peut aussi filtrer ses cartes avec la recherche.
- Documents, Entités, Mindmap, Parcours : la même ligne discrète « Nouveau document… », « Nouvelle entité… » ou « Nouvelle carte… » en bas de la liste (ou en bas à gauche de la carte) crée directement, avec Entrée.
- Toutes les vues : Ctrl+K ouvre la même recherche rapide partout (Tableau, Gantt, Tableau de bord, Mindmap, Parcours, Documents, Entités). On y trouve une carte, une vue, l’Assistant, les Paramètres, ou on crée une carte.

## 2026-10-14
- Barre d’onglets : l’Assistant (chat complet) et les Paramètres du Cerveau s’ouvrent maintenant dans la même fenêtre, avec les icônes en haut à droite (bulle et roue dentée). La page d’une tâche a aussi la barre, avec un onglet « Tâche » : un clic ouvre Gantt, Tableau, Kanban… sur cette tâche.
- Tableau, Gantt, Kanban, Tableau de bord : même ligne « Nouvelle carte » partout (plus discrète, même texte). Le Gantt a maintenant sa ligne en bas de la liste, comme le Tableau.
- Parcours : comme dans la Mindmap, on déplace les boîtes, on tire un lien depuis un point d’accroche pour relier deux tâches ou une tâche à son objectif, on clique un lien pour le déplacer ou le retirer (Suppr), et la molette zoome. Le bouton Réorganiser remet la disposition automatique.
- Assistant : la boîte en bas de chaque vue est toujours ouverte et remplace Capture. On y écrit, colle ou glisse du texte, des images et des fichiers; l’IA crée les tâches (dans Triage) et attache les fichiers.
- Toutes les vues : la zone de recherche est la même partout (loupe, « Filtrer… », même taille), y compris dans le Parcours, la Mindmap, les Documents, les Entités et le Gantt.
- Kanban et Documents : la carte rapide permet aussi de choisir personnes, lieux et étiquettes.
- Mindmap : le panneau de droite d’une tâche permet maintenant de choisir les personnes (membres Trello ou hors Trello), les lieux (Où, De, Vers), les étiquettes et l’estimation, directement sur place.
- Parcours : la molette zoome et dézoome sur le curseur, comme dans la Mindmap.
- Mindmap : la Perspective peut aussi ranger les cartes par statut ou par urgence.
- Mobile : le titre passe en premier et reste fixe dans le Tableau, les barres d’outils tiennent sur une seule ligne qu’on fait glisser, et le Tableau de bord et les Documents ne débordent plus.
- Mindmap : le bouton Perspective range la même carte par personne, par lieu ou par échéance. Les cartes glissent dans leurs colonnes, le reste s’estompe, et Réseau les ramène à leur place.
- Kanban : Ctrl+K ouvre une recherche rapide pour trouver une carte, changer de vue ou créer une carte.
- Les champs vides (« Cliquer pour ajouter… ») ont le même aspect discret partout : carte rapide, fiche et documents.
- Téléphone : les onglets tiennent, le tableau garde le nom, le Kanban se feuille liste par liste, Documents et Entités passent en plein écran.

## 2026-10-13
- Parcours : la carte relie missions et projets, et propose quelques actions avec la raison, l'échéance et ce qui bloque.
- Cartes : une liste terminée n’écrit plus « Sans prochaine action » sous le titre. La revue garde le nombre. La mindmap ne signale plus « Sans projet ».
- Documents : le bouton lien propose d'abord les documents. Les mots sélectionnés restent et ouvrent le document choisi.
- Mindmap : cliquer une carte la laisse en place et rassemble autour d'elle ce qui lui est lié. Un clic dans le vide remet la carte où elle était.
- Kanban : un clic garde la carte à côté du tableau. Les colonnes remplissent la hauteur. En retard et Bloquées filtrent. L’IA d’une carte n’apparaît qu’au besoin.
- Entités : une tâche remonte jusqu’à sa vision. On retrouve qui la dirige, qui la bloque, et qui travaille avec.
- Assistant : ouvrir le chat place le curseur dans le message, prêt à écrire.
- Documents : sélectionner un nom propose « Créer une entité ». Le nom reste, lié à l'entité.
- Entités : « il y a deux mois » donne le mois, même écrit « moi ». « dans deux mois » aussi.
- Mindmap : l’icône Dépendances et l’icône Sélection s’affichent.
- Orchestrateur : le bouton du milieu déplace la vue, comme dans le Gantt.
- Documents : la barre de défilement du choix d’icône ne recouvre plus la dernière colonne.
- Entités : une plante, une famille, un objet, une tâche et les proches se retrouvent par une phrase. Une plante en retard d’entretien est signalée.
- Documents : une entité connue se lie toute seule dans le texte (comme « mon boss »). Le surlignage reste très discret, et le survol montre l'entité.
- Documents : retirer une citation garde le texte, en paragraphe normal.
- Documents et Entités : le même assistant en bas de page que dans les autres vues.
- Orchestrateur : le zoom glisse comme le Gantt. La molette étire les colonnes, et l'instant sous le curseur reste en place.
- Mindmap : la flèche d'un lien rejoint le trait, sans trou au col.
- Documents : un clic sur l’icône d’un document ou d’un dossier change le dessin et la couleur.
- Saisie : la suggestion arrive tout de suite, avec le modèle rapide, dès les premiers mots.
- Le + d’insertion n’apparaît qu’au survol d’un espace entre deux éléments.
- Aujourd’hui : la revue (triage, prochaine action, attente, en cours, résultat) est sur la même page.
- Saisie : après une question, la suggestion ne finit plus le mot « answer ».
- Mindmap : le contour d'un groupe suit le bord des cartes qu'il contient.
- Documents : approcher une tâche mentionnée fait apparaître un point pour relier une tâche parente, une tâche voisine ou un responsable.
- Mise à jour : une nouvelle version recharge la page toute seule, sans rafraîchissement forcé.
- Documents : Entrée dans une sous-tâche ajoute une ligne au même niveau. La ligne du dessus reste imbriquée.
- Revue : un résultat qui n’a pas bougé depuis 14 jours est signalé. Cliquer le nombre le met à jour. Le badge revient chaque semaine.
- Documents : Priorité, Lieu, Catégorie et Argent sont chacun un champ. Une étiquette du type Priority-Low n'est plus mélangée aux lieux et à l'argent.
- Dashboard : le même assistant en bas de page que dans les autres vues.
- Assistant : il est toujours à l'heure de l'ordinateur. Toute heure qu'il dit, y compris le build, est dans ce fuseau.
- Documents : taper les signes autour d'un mot (gras, italique, barré, surligné, code) applique la mise en forme. Ils réapparaissent tant que le curseur est dans le mot. Deux crochets lient un autre document.
- Assistant : le champ en bas n’a plus qu’un seul contour.
- Vitesse : le pointeur ne remesure plus chaque ligne à chaque mouvement, et taper dans un document ne reparcourt plus les images et les tableaux.
- Documents : couleurs, surlignage, tableaux, encadrés (note, conseil, attention) et alignement, dans la barre et avec `/`.
- Documents : un dossier est lui-même un document. Un clic l’ouvre pour écrire dedans ; le chevron montre ce qu’il contient.
- Entités : dans « quel genre », un mot cherche tous les genres. Un mot nouveau, comme Chat, crée le genre.
- Saisie : la suggestion pendant la frappe continue la même phrase, au lieu d'une suite hors sujet.
- Documents : l'aperçu d'une tâche s'agrandit par n'importe quel coin, et la molette zoome sous le curseur.
- Aujourd'hui : une tâche courte ne recouvre plus la suivante sur la ligne du temps.
- Documents : la poignée (+ et glisser) s’aligne sur la première ligne de chaque bloc.
- Orchestrateur : « Planifier auto » est sous « À planifier », et n’apparaît que s’il y a quelque chose à placer.
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
