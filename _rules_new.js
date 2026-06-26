  var DEFAULT_RULES = [
    {
      id: 'massive-opportunity',
      label: 'Opportunité massive',
      description: 'Impact majeur, facile à lancer, forte urgence. Le moment idéal pour agir.',
      priority: 100,
      when: { ease: ['high', 'veryHigh'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'dirty-job',
      label: 'Corvée express',
      description: 'Urgent mais secondaire et un peu ingrat. À boucler vite pour dégager la suite, sans viser la perfection.',
      priority: 99,
      when: { ease: ['veryLow', 'low'], impact: ['veryLow'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'effort-disproportionne',
      label: 'Corvée ciblée',
      description: 'Urgent et un peu laborieux pour un retour modeste. Fixer un plafond d\'effort et viser l\'essentiel.',
      priority: 98,
      when: { ease: ['veryLow', 'low'], impact: ['low'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'quick-win',
      label: 'Victoire rapide',
      description: 'Peu d\'effort pour un gain net. Parfait à glisser entre deux chantiers plus lourds.',
      priority: 90,
      when: { ease: ['high', 'veryHigh'], impact: ['mid', 'high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'fire-drill',
      label: 'Priorité passagère',
      description: 'Pression réelle sur un sujet modeste. À traiter avec sobriété, puis repasser à l\'essentiel.',
      priority: 88,
      when: { ease: ['mid', 'high', 'veryHigh'], impact: ['veryLow', 'low'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'strategic-bet',
      label: 'Pari stratégique',
      description: 'Fort impact, effort conséquent, sans urgence immédiate. À planifier et protéger des urgences.',
      priority: 85,
      when: { ease: ['veryLow', 'low'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'critical-path',
      label: 'Chemin critique',
      description: 'Gros enjeu, réellement exigeant, sous pression. Priorité haute : ça vaut le coup de s\'y consacrer.',
      priority: 84,
      when: { ease: ['veryLow', 'low'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'maintenance',
      label: 'Entretien',
      description: 'Utile, sans urgence ni enjeu majeur. À caler quand la bande passante le permet.',
      priority: 70,
      when: { ease: ['mid', 'high'], impact: ['low', 'mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'noise',
      label: 'Faible priorité',
      description: 'Peu de valeur, peu urgent, effort modéré. Bon candidat pour plus tard ou pour simplifier.',
      priority: 65,
      when: { ease: ['low', 'mid'], impact: ['veryLow', 'low'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'backlog-filler',
      label: 'Bonus backlog',
      description: 'Sans pression ni impact notable. À garder en bas de pile, sans y investir trop d\'attention.',
      priority: 60,
      when: { impact: ['veryLow'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'micro-opportunite',
      label: 'Petite opportunité',
      description: 'Presque sans effort, impact modeste mais net positif. À saisir entre deux chantiers plus lourds.',
      priority: 89,
      when: { ease: ['veryHigh'], impact: ['low', 'mid'], urgency: ['veryLow', 'low', 'mid'] }
    },
    {
      id: 'coup-de-pouce',
      label: 'Coup de pouce',
      description: 'Impact moyen, urgence réelle, exécution facile. Débloque la suite sans mobilisation lourde.',
      priority: 87,
      when: { ease: ['high', 'veryHigh'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'accelerateur',
      label: 'Accélérateur',
      description: 'Gros enjeu, urgence réelle, difficulté modérée. Pas trivial, mais à pousser maintenant avec confiance.',
      priority: 86,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'effet-levier',
      label: 'Effet de levier',
      description: 'Fort impact pour un effort raisonnable, sans urgence immédiate. À planifier pendant que la fenêtre est ouverte.',
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
      description: 'Effort élevé pour une valeur limitée, sans urgence. Repousser jusqu\'à ce qu\'un levier change.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['veryLow'], urgency: ['veryLow'] }
    },
    {
      id: 'remettre-en-rayon',
      label: 'Pour plus tard',
      description: 'Retour modeste, sans urgence, coût élevé. Garder visible sans lancer tout de suite.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['low'], urgency: ['veryLow'] }
    },
    {
      id: 'attente-contexte',
      label: 'En attente de contexte',
      description: 'Impact modeste pour l\'investissement demandé. Repousser jusqu\'à un changement de contexte ou de priorité.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['mid'], urgency: ['veryLow'] }
    },
    {
      id: 'bruit-fond-lourd',
      label: 'Chantier en veille',
      description: 'Sujet exigeant à retour limité, sans échéance. Laisser dormir plutôt que mobiliser l\'équipe maintenant.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['veryLow'], urgency: ['low'] }
    },
    {
      id: 'effort-peu-retour',
      label: 'Investissement lourd',
      description: 'Coût élevé pour un bénéfice modeste, sans urgence. À revisiter quand une meilleure fenêtre s\'ouvrira.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['low'], urgency: ['low'] }
    },
    {
      id: 'projet-sommeil',
      label: 'Projet en pause',
      description: 'Volume important, impact moyen, aucune pression. Mettre en pause et revisiter quand les conditions auront changé.',
      priority: 83,
      when: { ease: ['veryLow'], impact: ['mid'], urgency: ['low'] }
    },
    {
      id: 'fondation',
      label: 'Fondation',
      description: 'Travail structurant, effort soutenu, impact réel sans urgence immédiate. Pose les bases des prochains gains.',
      priority: 84,
      when: { ease: ['low', 'mid'], impact: ['high', 'veryHigh'], urgency: ['veryLow'] }
    },
    {
      id: 'derapage-cache',
      label: 'Point d\'attention',
      description: 'Fort impact, urgence qui monte, effort encore gérable. Un suivi régulier évite un basculement en chemin critique.',
      priority: 80,
      when: { ease: ['mid'], impact: ['high', 'veryHigh'], urgency: ['mid'] }
    },
    {
      id: 'deadline-exigeante',
      label: 'Échéance serrée',
      description: 'Enjeu moyen, effort soutenu, urgence réelle. Protéger le scope et livrer l\'essentiel avec sérénité.',
      priority: 83,
      when: { ease: ['veryLow', 'low'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'pression-moderee',
      label: 'Pression modérée',
      description: 'Enjeu moyen, rythme soutenu, urgence réelle. Prioriser la clôture, sans viser la perfection.',
      priority: 81,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'sprint-tactique',
      label: 'Sprint tactique',
      description: 'Sujet moyen sous pression, effort modéré. À boucler proprement sans le transformer en chantier long.',
      priority: 80,
      when: { ease: ['low', 'mid'], impact: ['mid', 'high'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'pare-feu',
      label: 'Bouclier préventif',
      description: 'Protège un enjeu important avant qu\'il ne devienne urgent. Mise en place proactive, pas réactive.',
      priority: 79,
      when: { ease: ['mid', 'high'], impact: ['high', 'veryHigh'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'paperasse',
      label: 'Paperasse',
      description: 'Facile mais peu glamour, urgence réelle. Mode flux : fait, validé, on passe à la suite.',
      priority: 77,
      when: { ease: ['high', 'veryHigh'], impact: ['veryLow', 'low'], urgency: ['mid', 'high'] }
    },
    {
      id: 'fausse-priorite',
      label: 'Urgence modérée',
      description: 'Urgence élevée, retour modeste, effort non négligeable. Traiter l\'essentiel puis repasser à des sujets à plus fort levier.',
      priority: 76,
      when: { ease: ['low', 'mid'], impact: ['low', 'mid'], urgency: ['high', 'veryHigh'] }
    },
    {
      id: 'sable-mouvant',
      label: 'Effort dense',
      description: 'Exigeant, retour limité, urgence moyenne. Fixer une limite claire pour garder le cap.',
      priority: 75,
      when: { ease: ['veryLow', 'low'], impact: ['veryLow', 'low'], urgency: ['mid'] }
    },
    {
      id: 'marathon',
      label: 'Marathon',
      description: 'Long et exigeant, valeur moyenne, sans urgence. À étaler sereinement, pas à forcer d\'un bloc.',
      priority: 74,
      when: { ease: ['veryLow', 'low'], impact: ['mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'routine-utile',
      label: 'Routine utile',
      description: 'Peu d\'effort, valeur modeste mais réelle, sans pression. Bon créneau entre deux sujets plus tendus.',
      priority: 72,
      when: { ease: ['high', 'veryHigh'], impact: ['low', 'mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'piste-exploratoire',
      label: 'Piste exploratoire',
      description: 'Impact et effort moyens, aucune urgence. Idéal pour tester une direction sans engagement lourd.',
      priority: 71,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['veryLow', 'low'] }
    },
    {
      id: 'zone-grise',
      label: 'À arbitrer',
      description: 'Ni prioritaire ni secondaire sur les trois axes. À repositionner selon le reste du backlog : avancer, repousser ou simplifier.',
      priority: 67,
      when: { ease: ['mid'], impact: ['mid'], urgency: ['mid'] }
    }
  ];