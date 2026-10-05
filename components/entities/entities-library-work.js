/*
 * Role: the "philosophy of work" archetypes for the Entities library (docs/philosophy-of-work.md): the
 * outcome side, ABSTRAIT (vision, mission, goal, objective, indicator, risk) and the work side, CONCRET
 * (project, task, milestone, deliverable), each with its properties and the links that tie them together
 * (contributes to, measured by, delivers, led by, blocks, threatens). Adds its components / types / groups
 * to EntitiesLibrary and its relations to EntitiesModel.RELATIONS, so install() handles them like any other
 * preset. Load after entities-model.js and entities-library.js. Pure data, no DOM, no Trello.
 * Test: test/entities-library-work.test.js
 */
(function (global) {
  'use strict';

  var EM = global.EntitiesModel;
  var LIB = global.EntitiesLibrary;

  // ---------------------------------------------------------------- relations
  // "A contribue à B" is the spine: task → project → objective → goal → mission → vision, any level may be skipped.
  var NATURES_OF_WORK = ['abstract', 'event', 'matter', 'agent', 'social'];
  var RELATIONS = [
    { id: 'serves', name: 'contribue à', inverse: 'est servi par', category: 'purpose', from: NATURES_OF_WORK, aliases: ['sert', 'serves', 'au service de', 'contributes to'], inverseAliases: ['reçoit la contribution de', 'is served by'] },
    { id: 'measured-by', name: 'mesuré par', inverse: 'mesure', category: 'purpose', from: ['abstract', 'event'], to: ['abstract'], aliases: ['measured by', 'évalué par'], inverseAliases: ['measures'] },
    { id: 'delivers', name: 'livre', inverse: 'est livré par', category: 'production', from: ['event'], aliases: ['produit comme livrable', 'delivers'], inverseAliases: ['delivered by'] },
    { id: 'led-by', name: 'dirigé par', inverse: 'dirige', category: 'social', to: ['agent', 'social'], aliases: ['responsable', 'assigné à', 'led by', 'owner'], inverseAliases: ['est responsable de', 'leads'] },
    { id: 'blocks', name: 'bloque', inverse: 'est bloqué par', category: 'causal', aliases: ['empêche', 'blocks'], inverseAliases: ['blocked by'] },
    { id: 'threatens', name: 'menace', inverse: 'est menacé par', category: 'causal', from: ['abstract'], aliases: ['met en péril', 'threatens'], inverseAliases: ['threatened by'] },
  ];

  // ---------------------------------------------------------------- components (the properties)
  var STATUS_WORK = ['backlog', 'prêt', 'en cours', 'révision', 'bloqué', 'terminé'];
  var COMPONENTS = [
    {
      id: 'intention',
      name: 'Intention',
      fields: [
        { key: 'pourquoi', label: 'Pourquoi c’est important', kind: 'longtext' },
        { key: 'horizon', label: 'Horizon', kind: 'date' },
        { key: 'valeurs', label: 'Fondée sur les valeurs', kind: 'refs', refTypes: ['valeur'], rel: 'grounded-in' },
        { key: 'statut', label: 'Statut', kind: 'choice', options: ['proposée', 'active', 'atteinte', 'abandonnée'] },
      ],
    },
    {
      id: 'resultat',
      name: 'Résultat visé',
      fields: [
        { key: 'succes', label: 'Critère de réussite', kind: 'longtext' },
        { key: 'mesures', label: 'Indicateurs', kind: 'refs', refTypes: ['indicateur'], rel: 'measured-by' },
        { key: 'echeance', label: 'Échéance', kind: 'date' },
        { key: 'obtenu', label: 'Résultat obtenu', kind: 'number', unit: '%' },
        { key: 'statut', label: 'Statut', kind: 'choice', options: ['à définir', 'en cours', 'atteint', 'manqué', 'abandonné'] },
      ],
    },
    {
      id: 'mesure',
      name: 'Mesure',
      fields: [
        { key: 'unite', label: 'Unité', kind: 'text' },
        { key: 'sens', label: 'Sens', kind: 'choice', options: ['augmenter', 'diminuer', 'maintenir'] },
        { key: 'depart', label: 'Valeur de départ', kind: 'number' },
        { key: 'actuelle', label: 'Valeur actuelle', kind: 'number' },
        { key: 'cible', label: 'Valeur cible', kind: 'number' },
        { key: 'frequence', label: 'Fréquence', kind: 'choice', options: ['jour', 'semaine', 'mois', 'trimestre', 'année'] },
        { key: 'releve', label: 'Relevé', kind: 'choice', options: ['direct', 'manuel'] },
      ],
    },
    {
      id: 'contribution',
      name: 'Contribution',
      fields: [{ key: 'sert', label: 'Contribue à', kind: 'refs', refTypes: [], rel: 'serves' }],
    },
    {
      id: 'travail',
      name: 'Travail',
      fields: [
        { key: 'statut', label: 'Statut', kind: 'choice', options: STATUS_WORK },
        { key: 'priorite', label: 'Priorité', kind: 'choice', options: ['basse', 'normale', 'haute', 'critique'] },
        { key: 'responsable', label: 'Dirigé par', kind: 'ref', refTypes: ['personne'], rel: 'led-by' },
        { key: 'debut', label: 'Début', kind: 'date' },
        { key: 'echeance', label: 'Échéance', kind: 'date' },
        { key: 'effort', label: 'Effort estimé', kind: 'number', unit: 'h' },
        { key: 'accompli', label: 'Travail accompli', kind: 'number', unit: '%' },
        { key: 'fait', label: 'Définition de terminé', kind: 'longtext' },
        { key: 'bloque_par', label: 'Bloqué par', kind: 'refs', refTypes: [], rel: 'blocks' },
      ],
    },
    {
      id: 'projet',
      name: 'Projet',
      fields: [
        { key: 'budget', label: 'Budget', kind: 'number', unit: '$' },
        { key: 'livrables', label: 'Livrables', kind: 'refs', refTypes: ['livrable'], rel: 'delivers' },
      ],
    },
    {
      id: 'livrable',
      name: 'Livrable',
      fields: [
        { key: 'format', label: 'Format', kind: 'text' },
        { key: 'version', label: 'Version', kind: 'text' },
        { key: 'emplacement', label: 'Emplacement', kind: 'url' },
        { key: 'accepte', label: 'Accepté', kind: 'choice', options: ['à faire', 'en révision', 'accepté', 'refusé'] },
      ],
    },
    {
      id: 'risque',
      name: 'Risque',
      fields: [
        { key: 'menace', label: 'Menace', kind: 'refs', refTypes: [], rel: 'threatens' },
        { key: 'probabilite', label: 'Probabilité', kind: 'choice', options: ['faible', 'moyenne', 'élevée'] },
        { key: 'impact', label: 'Impact', kind: 'choice', options: ['mineur', 'important', 'majeur'] },
        { key: 'parade', label: 'Parade', kind: 'longtext' },
      ],
    },
  ];

  // ---------------------------------------------------------------- types
  var GROUPS = [
    { id: 'purpose', name: 'Intentions (abstrait)', icon: 'compass' },
    { id: 'work', name: 'Travail (concret)', icon: 'hammer' },
  ];
  var TYPES = [
    { group: 'purpose', id: 'vision', name: 'Vision', nature: 'abstract', icon: 'eye', parents: ['concept'], aliases: ['vision', 'futur désiré', 'desired future'], components: ['intention'], description: 'L’état futur désiré : ce que le monde ou la vie ressemblerait si tout allait bien.' },
    { group: 'purpose', id: 'mission', name: 'Mission', nature: 'abstract', icon: 'flag-3', parents: ['concept'], aliases: ['raison d’être', 'purpose', 'mandat'], components: ['intention', 'contribution'], description: 'Le but durable : pourquoi on fait ce qu’on fait, sans date de fin.' },
    { group: 'purpose', id: 'but', name: 'But', nature: 'abstract', icon: 'target-arrow', parents: ['concept'], aliases: ['goal', 'grand but', 'ambition'], components: ['intention', 'contribution'], description: 'Une grande réalisation à accomplir, qui rapproche de la mission.' },
    { group: 'purpose', id: 'objectif', name: 'Objectif', nature: 'abstract', icon: 'ruler', parents: ['concept'], aliases: ['objective', 'cible', 'résultat visé'], components: ['resultat', 'contribution'], description: 'Un résultat précis et mesurable. Il se juge à ses indicateurs, pas au nombre de tâches terminées.' },
    { group: 'purpose', id: 'indicateur', name: 'Indicateur', nature: 'abstract', icon: 'chart-line', parents: ['concept'], aliases: ['kpi', 'metric', 'métrique', 'mesure'], components: ['mesure'], description: 'Ce qu’on mesure pour savoir si un objectif est atteint : valeur de départ, actuelle et cible.' },
    { group: 'purpose', id: 'risque', name: 'Risque', nature: 'abstract', icon: 'alert-triangle', parents: ['concept'], aliases: ['risk', 'menace', 'obstacle'], components: ['risque'], description: 'Ce qui pourrait empêcher un objectif ou un projet d’aboutir.' },
    { group: 'work', id: 'projet', name: 'Projet', nature: 'event', icon: 'stack-2', aliases: ['project', 'initiative', 'chantier'], components: ['temps', 'travail', 'projet', 'contribution'], description: 'Un ensemble organisé de travail vers un objectif. Le terminer ne prouve pas que l’objectif est atteint.' },
    { group: 'work', id: 'tache', name: 'Tâche', nature: 'event', icon: 'checkbox', aliases: ['task', 'carte', 'card', 'tâches'], components: ['travail', 'contribution'], description: 'Une unité de travail qu’on peut terminer seule, avec un résultat clair. Elle se décompose en sous-tâches et en actions.' },
    { group: 'work', id: 'jalon', name: 'Jalon', nature: 'event', icon: 'milestone', aliases: ['milestone', 'étape clé'], components: ['travail', 'contribution'], description: 'Un point de contrôle daté dans un projet.' },
    { group: 'work', id: 'livrable', name: 'Livrable', nature: 'matter', icon: 'package', parents: ['objet'], aliases: ['deliverable', 'extrant', 'résultat concret'], components: ['livrable', 'contribution'], description: 'La chose concrète qu’un projet ou une tâche remet : un document, un objet, un système.' },
  ];

  // ---------------------------------------------------------------- registration (idempotent)
  function addAll(target, list) {
    list.forEach(function (item) {
      for (var i = 0; i < target.length; i++) if (target[i].id === item.id) return;
      target.push(item);
    });
  }

  var ids = TYPES.map(function (t) {
    return t.id;
  });

  if (EM && Array.isArray(EM.RELATIONS)) addAll(EM.RELATIONS, RELATIONS);
  if (LIB) {
    addAll(LIB.COMPONENTS, COMPONENTS);
    addAll(LIB.TYPES, TYPES);
    addAll(LIB.GROUPS, GROUPS);
  }

  /** Installs the whole work philosophy (every archetype above, with parents, components and link targets). */
  function installAll(schema) {
    return LIB.install(schema, ids);
  }

  global.EntitiesLibraryWork = {
    RELATIONS: RELATIONS,
    COMPONENTS: COMPONENTS,
    TYPES: TYPES,
    GROUPS: GROUPS,
    TYPE_IDS: ids,
    installAll: installAll,
  };
})(typeof window !== 'undefined' ? window : this);
