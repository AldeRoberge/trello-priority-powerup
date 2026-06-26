  var DEFAULT_RULES = [
    {
      id: 'massive-opportunity',
      label: 'OpportunitÃ© massive',
      description: 'Impact majeur, facile Ã  lancer, forte urgence. Le moment idÃ©al pour agir.',
      priority: 100,
      when: { ease: ['high', 'veryHigh'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'dirty-job',
      label: 'CorvÃ©e express',
      description: 'Urgent mais secondaire et un peu ingrat. Ã€ boucler vite pour dÃ©gager la suite, sans viser la perfection.',
      priority: 99,
      when: { ease: ['veryLow', 'low'], impact: ['veryLow'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'effort-disproportionne',
      label: 'CorvÃ©e ciblÃ©e',
      description: 'Urgent et un peu laborieux pour un retour modeste. Fixer un plafond d\'effort et viser l\'essentiel.',
      priority: 98,
      when: { ease: ['veryLow', 'low'], impact: ['low'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'quick-win',
      label: 'Victoire rapide',
      description: 'Peu d\'effort pour un gain net. Parfait Ã  glisser entre deux chantiers plus lourds.',
      priority: 90,
      when: { ease: ['high', 'veryHigh'], impact: ['mid', 'high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'fire-drill',
      label: 'PrioritÃ© passagÃ¨re',
      description: 'Pression rÃ©elle sur un sujet modeste. Ã€ traiter avec sobriÃ©tÃ©, puis repasser Ã  l\'essentiel.',
      priority: 88,
      when: { ease: ['mid', 'high', 'veryHigh'], impact: ['veryLow', 'low'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'strategic-bet',
      label: 'Pari stratÃ©gique',
      description: 'Fort impact, effort consÃ©quent, sans urgence immÃ©diate. Ã€ planifier et protÃ©ger des urgences.',
      priority: 85,
      when: { ease: ['veryLow', 'low'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'critical-path',
      label: 'Chemin critique',
      description: 'Gros enjeu, rÃ©ellement exigeant, sous pression. PrioritÃ© haute : Ã§a vaut le coup de s\'y consacrer.',
      priority: 84,
      when: { ease: ['veryLow', 'low'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'maintenance',
      label: 'Entretien',
      description: 'Utile, sans urgence ni enjeu majeur. Ã€ caler quand la bande passante le permet.',
      priority: 70,
      when: { ease: ['mid', 'high'], impact: ['low', 'mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'noise',
      label: 'Faible prioritÃ©',
      description: 'Peu de valeur, peu urgent, effort modÃ©rÃ©. Bon candidat pour plus tard ou pour simplifier.',
      priority: 65,
      when: { ease: ['low', 'mid'], impact: ['veryLow', 'low'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'backlog-filler',
      label: 'Bonus backlog',
      description: 'Sans pression ni impact notable. Ã€ garder en bas de pile, sans y investir trop d\'attention.',
      priority: 60,
      when: { impact: ['veryLow'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'micro-opportunite',
      label: 'Petite opportunitÃ©',
      description: 'Presque sans effort, impact modeste mais net positif. Ã€ saisir entre deux chantiers plus lourds.',
      priority: 89,
      when: { ease: ['veryHigh'], impact: ['low', 'mid'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'coup-de-pouce',
      label: 'Coup de pouce',
      description: 'Impact moyen, urgence rÃ©elle, exÃ©cution facile. DÃ©bloque la suite sans mobilisation lourde.',
      priority: 87,
      when: { ease: ['high', 'veryHigh'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'accelerateur',
      label: 'AccÃ©lÃ©rateur',
      description: 'Gros enjeu, urgence rÃ©elle, difficultÃ© modÃ©rÃ©e. Pas trivial, mais Ã  pousser maintenant avec confiance.',
      priority: 86,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'effet-levier',
      label: 'Effet de levier',
      description: 'Fort impact pour un effort raisonnable, sans urgence immÃ©diate. Ã€ planifier pendant que la fenÃªtre est ouverte.',
      priority: 83,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'travail-de-fond',
      label: 'Travail de fond',
      description: 'Refactors, organisation ou stabilisation technique. Effort soutenu pour un impact durable.',
      priority: 82,
      when: { ease: ['veryLow', 'low'], impact: ['mid', 'high'], urgency: ['veryLow', 'low', 'mid', 'high', 'veryHigh'] }
    },
    {
      id: 'sans-urgence-retour',
      label: 'En veille',
      description: 'Effort Ã©levÃ© pour une valeur limitÃ©e, sans urgence. Repousser jusqu\'Ã  ce qu\'un levier change.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['veryLow'], urgency: ['veryLow'] }
    },
    {
      id: 'remettre-en-rayon',
      label: 'Pour plus tard',
      description: 'Retour modeste, sans urgence, coÃ»t Ã©levÃ©. Garder visible sans lancer tout de suite.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['low'], urgency: ['veryLow'] }
    },
    {
      id: 'attente-contexte',
      label: 'En attente de contexte',
      description: 'Impact modeste pour l\'investissement demandÃ©. Repousser jusqu\'Ã  un changement de contexte ou de prioritÃ©.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['mid'], urgency: ['veryLow'] }
    },
    {
      id: 'bruit-fond-lourd',
      label: 'Chantier en veille',
      description: 'Sujet exigeant Ã  retour limitÃ©, sans Ã©chÃ©ance. Laisser dormir plutÃ´t que mobiliser l\'Ã©quipe maintenant.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['veryLow'], urgency: ['low'] }
    },
    {
      id: 'effort-peu-retour',
      label: 'Investissement lourd',
      description: 'CoÃ»t Ã©levÃ© pour un bÃ©nÃ©fice modeste, sans urgence. Ã€ revisiter quand une meilleure fenÃªtre s\'ouvrira.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['low'], urgency: ['low'] }
    },
    {
      id: 'projet-sommeil',
      label: 'Projet en pause',
      description: 'Volume important, impact moyen, aucune pression. Mettre en pause et revisiter quand les conditions auront changÃ©.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['mid'], urgency: ['low'] }
    },
    {
      id: 'fondation',
      label: 'Fondation',
      description: 'Travail structurant, effort soutenu, impact rÃ©el sans urgence immÃ©diate. Pose les bases des prochains gains.',
      priority: 84,
      when: { ease: ['low', 'mid'], impact: ['high', 'veryHigh'], urgency: ['veryLow'] }
    },
    {
      id: 'derapage-cache',
      label: 'Point d\'attention',
      description: 'Fort impact, urgence qui monte, effort encore gÃ©rable. Un suivi rÃ©gulier Ã©vite un basculement en chemin critique.',
      priority: 80,
      when: { ease: ['mid'], impact: ['high', 'veryHigh'], urgency: ['mid'] }
    },
    {
      id: 'deadline-exigeante',
      label: 'Ã‰chÃ©ance serrÃ©e',
      description: 'Enjeu moyen, effort soutenu, urgence rÃ©elle. ProtÃ©ger le scope et livrer l\'essentiel avec sÃ©rÃ©nitÃ©.',
      priority: 83,
      when: { ease: ['veryLow', 'low'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'pression-moderee',
      label: 'Pression modÃ©rÃ©e',
      description: 'Enjeu moyen, rythme soutenu, urgence rÃ©elle. Prioriser la clÃ´ture, sans viser la perfection.',
      priority: 81,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'sprint-tactique',
      label: 'Sprint tactique',
      description: 'Sujet moyen sous pression, effort modÃ©rÃ©. Ã€ boucler proprement sans le transformer en chantier long.',
      priority: 80,
      when: { ease: ['low', 'mid'], impact: ['mid', 'high'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'pare-feu',
      label: 'Bouclier prÃ©ventif',
      description: 'ProtÃ¨ge un enjeu important avant qu\'il ne devienne urgent. Mise en place proactive, pas rÃ©active.',
      priority: 79,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'paperasse',
      label: 'Paperasse',
      description: 'Facile mais peu glamour, urgence rÃ©elle. Mode flux : fait, validÃ©, on passe Ã  la suite.',
      priority: 77,
      when: { ease: ['high', 'veryHigh'], impact: ['veryLow', 'low'], urgency: ['mid', 'high'] }
    },
    {
      id: 'fausse-priorite',
      label: 'Urgence modÃ©rÃ©e',
      description: 'Urgence Ã©levÃ©e, retour modeste, effort non nÃ©gligeable. Traiter l\'essentiel puis repasser Ã  des sujets Ã  plus fort levier.',
      priority: 76,
      when: { ease: ['low', 'mid'], impact: ['low', 'mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'sable-mouvant',
      label: 'Effort dense',
      description: 'Exigeant, retour limitÃ©, urgence moyenne. Fixer une limite claire pour garder le cap.',
      priority: 75,
      when: { ease: ['veryLow', 'low'], impact: ['veryLow', 'low'], urgency: ['mid'] }
    },
    {
      id: 'marathon',
      label: 'Marathon',
      description: 'Long et exigeant, valeur moyenne, sans urgence. Ã€ Ã©taler sereinement, pas Ã  forcer d\'un bloc.',
      priority: 74,
      when: { ease: ['veryLow', 'low'], impact: ['mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'routine-utile',
      label: 'Routine utile',
      description: 'Peu d\'effort, valeur modeste mais rÃ©elle, sans pression. Bon crÃ©neau entre deux sujets plus tendus.',
      priority: 72,
      when: { ease: ['high', 'veryHigh'], impact: ['low', 'mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'piste-exploratoire',
      label: 'Piste exploratoire',
      description: 'Impact et effort moyens, aucune urgence. IdÃ©al pour tester une direction sans engagement lourd.',
      priority: 71,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'zone-grise',
      label: 'Ã€ arbitrer',
      description: 'Ni prioritaire ni secondaire sur les trois axes. Ã€ repositionner selon le reste du backlog : avancer, repousser ou simplifier.',
      priority: 67,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['mid'] }
    }
  ];