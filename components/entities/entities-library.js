/*
 * Role: the ontology library of the Entities: ready-made components and types that cover the usual kinds of
 * things (a hand cream, a world region, a country, a city, a building, a person, a worker, an organization,
 * an event, a concept, a rule), each placed in a nature and a type hierarchy (a City is a Place, a Worker is
 * a Person in a role, a Building is a Place AND a piece of matter). Nothing is in the schema until the user
 * installs it: install() adds a type with its parents, its components and the types its link fields point
 * at, skipping what already exists. Pure data + pure functions (no DOM, no Trello); see docs/entities-ontologie.md.
 *
 * Contents: 1 components | 2 types | 3 lookup | 4 install | 5 export
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }

  // ---------------------------------------------------------------- 1 components
  var COMPONENTS = [
    {
      id: 'propriete',
      name: 'Propriété',
      fields: [{ key: 'proprietaire', label: 'Propriétaire', kind: 'refs', refTypes: [], rel: 'owned-by' }],
    },
    {
      id: 'adresse',
      name: 'Adresse',
      fields: [
        { key: 'adresse', label: 'Adresse', kind: 'text' },
        { key: 'coordonnees', label: 'Coordonnées (lat, lon)', kind: 'geo' },
        { key: 'notes', label: 'Notes', kind: 'longtext' },
      ],
    },
    {
      id: 'matiere',
      name: 'Matière',
      fields: [
        { key: 'etat', label: 'État', kind: 'choice', options: ['solide', 'liquide', 'gaz', 'gel', 'poudre', 'composite'] },
        { key: 'composition', label: 'Composition', kind: 'text' },
        { key: 'masse', label: 'Masse', kind: 'number', unit: 'g' },
        { key: 'volume', label: 'Volume', kind: 'number', unit: 'ml' },
        { key: 'dimensions', label: 'Dimensions', kind: 'text' },
      ],
    },
    {
      id: 'provenance',
      name: 'Provenance',
      fields: [
        { key: 'fabricant', label: 'Fabriqué par', kind: 'ref', refTypes: [], rel: 'made-by' },
        { key: 'fabrique_le', label: 'Fabriqué le', kind: 'date' },
        { key: 'prix', label: 'Prix', kind: 'number', unit: '$' },
      ],
    },
    {
      id: 'acquisition',
      name: 'Acquisition',
      fields: [
        { key: 'acquis_le', label: 'Acquis le', kind: 'date' },
        { key: 'acquis_chez', label: 'Acquis chez', kind: 'text' },
      ],
    },
    {
      id: 'location',
      name: 'Emplacement',
      fields: [{ key: 'place', label: 'Lieu', kind: 'ref', refTypes: ['place'] }],
    },
    {
      id: 'produit',
      name: 'Produit',
      fields: [
        { key: 'marque', label: 'Marque', kind: 'text' },
        { key: 'modele', label: 'Modèle', kind: 'text' },
        { key: 'ingredients', label: 'Ingrédients', kind: 'refs', refTypes: ['substance'], rel: 'made-of' },
        { key: 'peau', label: 'Type de peau', kind: 'multi', options: ['sèche', 'normale', 'mixte', 'grasse', 'sensible'] },
        { key: 'usage', label: 'Mode d’emploi', kind: 'longtext' },
      ],
    },
    {
      id: 'consommable',
      name: 'Consommable',
      can: ['se consommer'],
      fields: [
        { key: 'peremption', label: 'Péremption', kind: 'date' },
        { key: 'consomme', label: 'Consommé', kind: 'bool' },
        { key: 'consomme_le', label: 'Consommé le', kind: 'date' },
      ],
    },
    {
      id: 'contenant',
      name: 'Contenant',
      requires: ['matiere'],
      can: ['contenir'],
      fields: [
        { key: 'contenu', label: 'Contenu', kind: 'refs', refTypes: ['substance', 'produit'] },
        { key: 'capacite', label: 'Capacité maximale', kind: 'number', unit: 'ml' },
        { key: 'quantite', label: 'Niveau', kind: 'level', unit: 'ml', maxField: 'capacite' },
        { key: 'scelle', label: 'Scellé', kind: 'choice', options: ['scellé', 'ouvert'] },
        { key: 'ouvert_le', label: 'Ouvert le', kind: 'date' },
        { key: 'materiau', label: 'Matériau', kind: 'text' },
      ],
    },
    {
      id: 'identification',
      name: 'Identification',
      fields: [
        { key: 'code_barres', label: 'Code-barres', kind: 'text' },
        { key: 'reference', label: 'Référence ou no de série', kind: 'text' },
      ],
    },
    {
      id: 'condition',
      name: 'État',
      fields: [
        { key: 'validite', label: 'Validité', kind: 'choice', options: ['valide', 'expiré'] },
        { key: 'integrite', label: 'Intégrité', kind: 'choice', options: ['intact', 'endommagé'] },
        { key: 'temperature', label: 'Température', kind: 'text' },
      ],
    },
    {
      id: 'vivant',
      name: 'Vivant',
      fields: [
        { key: 'espece', label: 'Espèce', kind: 'text' },
        { key: 'naissance', label: 'Naissance ou plantation', kind: 'date' },
        { key: 'sante', label: 'Santé', kind: 'choice', options: ['bonne', 'fragile', 'morte'] },
      ],
    },
    {
      id: 'personne',
      name: 'Personne',
      fields: [
        { key: 'naissance', label: 'Naissance', kind: 'date' },
        { key: 'residence', label: 'Habite à', kind: 'ref', refTypes: ['place'], rel: 'lives-in' },
        { key: 'courriel', label: 'Courriel', kind: 'text' },
        { key: 'telephone', label: 'Téléphone', kind: 'text' },
        { key: 'notes', label: 'Notes', kind: 'longtext' },
      ],
    },
    {
      id: 'emploi',
      name: 'Emploi',
      fields: [
        { key: 'employeur', label: 'Employeur', kind: 'ref', refTypes: ['organisation'], rel: 'works-for' },
        { key: 'poste', label: 'Poste', kind: 'text' },
        { key: 'depuis', label: 'Depuis', kind: 'date' },
        { key: 'statut', label: 'Statut', kind: 'choice', options: ['employé', 'contractuel', 'autonome', 'bénévole'] },
        { key: 'taux', label: 'Taux horaire', kind: 'number', unit: '$/h' },
      ],
    },
    {
      id: 'organisation',
      name: 'Organisation',
      fields: [
        { key: 'forme', label: 'Forme', kind: 'choice', options: ['entreprise', 'organisme public', 'association', 'équipe', 'famille'] },
        { key: 'fondation', label: 'Fondée le', kind: 'date' },
        { key: 'siege', label: 'Siège', kind: 'ref', refTypes: ['place'], rel: 'located-in' },
        { key: 'site', label: 'Site web', kind: 'url' },
      ],
    },
    {
      id: 'geographie',
      name: 'Géographie',
      fields: [
        { key: 'dans', label: 'Situé dans', kind: 'ref', refTypes: ['place'], rel: 'located-in' },
        { key: 'coordonnees', label: 'Coordonnées (lat, lon)', kind: 'geo' },
        { key: 'superficie', label: 'Superficie', kind: 'number', unit: 'km²' },
        { key: 'population', label: 'Population', kind: 'number' },
        { key: 'niveau', label: 'Niveau', kind: 'choice', options: ['continent', 'pays', 'province ou état', 'région', 'district', 'quartier'] },
      ],
    },
    {
      id: 'pays',
      name: 'Pays',
      fields: [
        { key: 'capitale', label: 'Capitale', kind: 'ref', refTypes: ['ville'] },
        { key: 'langues', label: 'Langues', kind: 'text' },
        { key: 'devise', label: 'Monnaie', kind: 'text' },
      ],
    },
    {
      id: 'construction',
      name: 'Construction',
      fields: [
        { key: 'annee', label: 'Année de construction', kind: 'number' },
        { key: 'etages', label: 'Étages', kind: 'number' },
        { key: 'surface', label: 'Surface', kind: 'number', unit: 'm²' },
        { key: 'usage', label: 'Usage', kind: 'multi', options: ['habitation', 'bureau', 'commerce', 'public', 'industriel', 'culte', 'loisirs'] },
        { key: 'materiaux', label: 'Matériaux', kind: 'refs', refTypes: ['substance'], rel: 'made-of' },
      ],
    },
    {
      id: 'espace',
      name: 'Espace',
      fields: [
        { key: 'dans', label: 'Situé dans', kind: 'ref', refTypes: ['place'], rel: 'located-in' },
        { key: 'surface', label: 'Surface', kind: 'number', unit: 'm²' },
        { key: 'usage', label: 'Usage', kind: 'text' },
      ],
    },
    {
      id: 'temps',
      name: 'Temps',
      fields: [
        { key: 'debut', label: 'Début', kind: 'date' },
        { key: 'fin', label: 'Fin', kind: 'date' },
      ],
    },
    {
      id: 'concept',
      name: 'Concept',
      fields: [
        { key: 'definition', label: 'Définition', kind: 'longtext' },
        { key: 'domaine', label: 'Domaine', kind: 'text' },
        { key: 'tradition', label: 'École ou tradition', kind: 'text' },
        { key: 'source', label: 'Source', kind: 'url' },
      ],
    },
    {
      id: 'regle',
      name: 'Règle',
      fields: [
        { key: 'portee', label: 'Portée', kind: 'text' },
        { key: 'en_vigueur', label: 'En vigueur depuis', kind: 'date' },
        { key: 'autorite', label: 'Édictée par', kind: 'ref', refTypes: ['organisation'], rel: 'made-by' },
        { key: 'source', label: 'Source', kind: 'url' },
      ],
    },
  ];

  // ---------------------------------------------------------------- 2 types
  var GROUPS = [
    { id: 'matter', name: 'Matière', icon: 'box' },
    { id: 'living', name: 'Vivant', icon: 'plant' },
    { id: 'people', name: 'Personnes et organisations', icon: 'users' },
    { id: 'places', name: 'Lieux', icon: 'map-2' },
    { id: 'time', name: 'Temps', icon: 'calendar-event' },
    { id: 'ideas', name: 'Idées et conventions', icon: 'bulb' },
  ];

  var TYPES = [
    { group: 'matter', id: 'objet', name: 'Objet', nature: 'matter', icon: 'box', aliases: ['object', 'chose', 'item', 'article'], components: ['matiere', 'provenance', 'propriete'], description: 'Une chose matérielle fabriquée ou trouvée.' },
    { group: 'matter', id: 'produit', name: 'Produit', nature: 'matter', icon: 'bottle', parents: ['objet'], aliases: ['product', 'cosmétique', 'crème'], components: ['produit', 'consommable'], description: 'Un objet fait pour être utilisé ou consommé : crème pour les mains, savon, aliment.' },
    { group: 'matter', id: 'consommable', name: 'Consommable', nature: 'matter', icon: 'hourglass', aliases: ['consumable', 'périssable'], components: ['consommable'], description: 'Ce qui se consomme ou se périme : un aliment, une pile, une cartouche.' },
    { group: 'matter', id: 'contenant', name: 'Contenant', nature: 'matter', icon: 'package', parents: ['objet'], aliases: ['container', 'récipient'], components: ['contenant'], description: 'Un objet qui contient autre chose, avec une capacité et un niveau.' },
    { group: 'matter', id: 'bouteille', name: 'Bouteille', nature: 'matter', icon: 'bottle', parents: ['produit', 'consommable', 'contenant'], aliases: ['bottle', 'gourde', 'flacon'], components: [], description: 'Un produit, consommable et contenant à la fois : rien de plus qu’une composition de composants.' },
    { group: 'matter', id: 'substance', name: 'Substance', nature: 'matter', icon: 'flask', aliases: ['ingrédient', 'ingredient', 'matière première', 'material'], components: ['matiere'], description: 'De la matière sans forme propre : glycérine, eau, pierre, bois.' },
    { group: 'living', id: 'etre_vivant', name: 'Être vivant', nature: 'living', icon: 'leaf', aliases: ['living', 'organisme', 'vivant'], components: ['vivant', 'propriete'], description: 'Ce qui naît, croît et meurt.' },
    { group: 'living', id: 'animal', name: 'Animal', nature: 'living', icon: 'paw', parents: ['etre_vivant'], aliases: ['pet', 'bête', 'animaux'], components: [], description: 'Un être vivant qui se déplace.' },
    { group: 'people', id: 'personne', name: 'Personne', nature: 'agent', icon: 'user', aliases: ['person', 'people', 'humain', 'gens'], components: ['personne'], description: 'Un être humain : il agit, il a des intentions.' },
    { group: 'people', id: 'travailleur', name: 'Travailleur', nature: 'agent', icon: 'briefcase', parents: ['personne'], role: true, aliases: ['worker', 'employé', 'employee', 'ouvrier', 'collègue'], components: ['emploi'], description: 'Une personne dans son rôle d’employé : le rôle dépend d’un contexte, la personne reste la même.' },
    { group: 'people', id: 'organisation', name: 'Organisation', nature: 'social', icon: 'building-community', aliases: ['organization', 'entreprise', 'company', 'institution', 'groupe'], components: ['organisation'], description: 'Un groupe reconnu qui agit comme un seul : il existe par convention.' },
    { group: 'places', id: 'place', name: 'Lieu', nature: 'place', icon: 'map-pin', aliases: ['endroit', 'location'], components: ['adresse', 'propriete'], description: 'Une portion d’espace.' },
    { group: 'places', id: 'region', name: 'Région du monde', nature: 'place', icon: 'world', parents: ['place'], aliases: ['région', 'region', 'zone', 'territoire', 'world region', 'continent'], components: ['geographie'], description: 'Une zone de la carte : continent, province, région.' },
    { group: 'places', id: 'pays', name: 'Pays', nature: 'place', icon: 'flag', parents: ['region'], aliases: ['country', 'nation'], components: ['pays'], description: 'Un territoire gouverné.' },
    { group: 'places', id: 'ville', name: 'Ville', nature: 'place', icon: 'building-skyscraper', parents: ['place'], aliases: ['city', 'town', 'municipalité', 'village'], components: ['geographie'], description: 'Une agglomération.' },
    { group: 'places', id: 'batiment', name: 'Bâtiment', nature: 'place', icon: 'building', parents: ['place', 'objet'], aliases: ['building', 'édifice', 'immeuble'], components: ['construction'], description: 'À la fois un lieu qu’on habite et un objet construit avec de la matière.' },
    { group: 'places', id: 'piece', name: 'Pièce', nature: 'place', icon: 'door', parents: ['place'], aliases: ['room', 'local', 'salle', 'bureau'], components: ['espace'], description: 'Un espace à l’intérieur d’un bâtiment.' },
    { group: 'time', id: 'evenement', name: 'Événement', nature: 'event', icon: 'calendar-event', aliases: ['event', 'réunion', 'rencontre', 'meeting'], components: ['temps', 'location'], description: 'Ce qui se passe dans le temps, quelque part.' },
    { group: 'ideas', id: 'concept', name: 'Concept', nature: 'abstract', icon: 'bulb', aliases: ['idea', 'idée', 'notion', 'abstraction', 'abstrait', 'abstract'], components: ['concept'], description: 'Une idée sans corps : elle ne vaut que par ce qui l’incarne ou l’exprime.' },
    { group: 'ideas', id: 'valeur', name: 'Valeur', nature: 'abstract', icon: 'scale', parents: ['concept'], aliases: ['value', 'principe', 'principle'], components: [], description: 'Un concept qui oriente l’action : justice, liberté, sobriété.' },
    { group: 'ideas', id: 'regle', name: 'Règle', nature: 'social', icon: 'gavel', aliases: ['rule', 'loi', 'law', 'norme', 'règlement'], components: ['regle'], description: 'Un fait social : elle compte comme règle parce qu’un groupe la reconnaît.' },
  ];

  // ---------------------------------------------------------------- 3 lookup
  function presetType(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return null;
  }

  function presetComponent(id) {
    for (var i = 0; i < COMPONENTS.length; i++) if (COMPONENTS[i].id === id) return COMPONENTS[i];
    return null;
  }

  /** The schema type that stands for a preset: same id, or same name. null when not installed. */
  function installedAs(schema, presetId) {
    var p = presetType(presetId);
    if (!p) return null;
    var byId = EM().findById(schema.types, p.id);
    if (byId) return byId;
    var k = EM().normKey(p.name);
    return (
      schema.types.filter(function (t) {
        return EM().normKey(t.name) === k;
      })[0] || null
    );
  }

  /** Preset types of a group, or of a nature, with whether they are installed. */
  function listFor(schema, filter) {
    return TYPES.filter(function (p) {
      return (!filter || !filter.group || p.group === filter.group) && (!filter || !filter.nature || p.nature === filter.nature);
    }).map(function (p) {
      return { preset: p, installed: !!installedAs(schema, p.id) };
    });
  }

  /** Preset types of a nature that are not in the schema yet. */
  function missingFor(schema, natureId) {
    return listFor(schema, { nature: natureId })
      .filter(function (x) {
        return !x.installed;
      })
      .map(function (x) {
        return x.preset;
      });
  }

  // ---------------------------------------------------------------- 4 install
  /** Preset type ids needed to install `ids`: themselves, their parents and the types their link fields target. */
  function dependencies(ids) {
    var out = [];
    function add(id) {
      var p = presetType(id);
      if (!p || out.indexOf(id) >= 0) return;
      out.push(id);
      (p.parents || []).forEach(add);
      (p.components || []).forEach(function (cid) {
        var c = presetComponent(cid);
        if (!c) return;
        c.fields.forEach(function (f) {
          (f.refTypes || []).forEach(add);
        });
      });
    }
    ids.forEach(add);
    return out;
  }

  /** Adds a component id to `list` after the components it requires (a requirement must exist when it is installed). */
  function requiredFirst(cid, list) {
    if (list.indexOf(cid) >= 0) return;
    var c = presetComponent(cid);
    (c && c.requires ? c.requires : []).forEach(function (r) {
      if (r !== cid) requiredFirst(r, list);
    });
    if (list.indexOf(cid) < 0) list.push(cid);
  }

  /**
   * Adds preset types (one id or a list) to the schema, with their parents, components and link targets;
   * what already exists is left untouched (a user type with the same name is reused as the parent).
   * @returns {{schema:object, added:{types:string[], components:string[]}, typeIds:Object<string,string>, error?:string}}
   *   typeIds maps each requested preset id to the schema type id that now stands for it
   */
  function install(schema, ids) {
    var wanted = Array.isArray(ids) ? ids : [ids];
    var added = { types: [], components: [] };
    var all = dependencies(wanted).filter(function (id) {
      return !!presetType(id);
    });
    var next = schema;
    var map = {};
    all.forEach(function (pid) {
      var have = installedAs(next, pid);
      if (have) map[pid] = have.id;
    });
    // components first (types refer to them), then types parents-first
    var compIds = [];
    all.forEach(function (pid) {
      if (map[pid]) return;
      presetType(pid).components.forEach(function (cid) {
        requiredFirst(cid, compIds);
      });
    });
    compIds.forEach(function (cid) {
      if (EM().findById(next.components, cid)) return;
      var c = presetComponent(cid);
      next = EM().upsertComponent(next, c);
      added.components.push(c.name);
    });
    var pending = all.filter(function (pid) {
      return !map[pid];
    });
    var guard = pending.length + 1;
    while (pending.length && guard-- > 0) {
      pending = pending.filter(function (pid) {
        var p = presetType(pid);
        var ready = (p.parents || []).every(function (par) {
          return !!map[par];
        });
        if (!ready) return true;
        next = EM().upsertType(next, {
          id: p.id,
          name: p.name,
          aliases: p.aliases,
          icon: p.icon,
          nature: p.nature,
          role: p.role === true,
          description: p.description,
          parents: (p.parents || []).map(function (par) {
            return map[par];
          }),
          components: p.components,
        });
        map[pid] = p.id;
        added.types.push(p.name);
        return false;
      });
    }
    if (JSON.stringify(next).length > EM().MAX_SCHEMA_CHARS) {
      return { schema: schema, added: { types: [], components: [] }, typeIds: {}, error: 'schema-too-large' };
    }
    var typeIds = {};
    wanted.forEach(function (w) {
      if (map[w]) typeIds[w] = map[w];
    });
    return { schema: next, added: added, typeIds: typeIds };
  }

  /** The schema with the component installed (unchanged when it is already there). */
  function ensureComponent(schema, cid) {
    if (EM().findById(schema.components, cid)) return schema;
    var c = presetComponent(cid);
    if (!c) return schema;
    var next = schema;
    (c.requires || []).forEach(function (r) {
      if (r !== cid) next = ensureComponent(next, r);
    });
    return EM().upsertComponent(next, c);
  }

  /** The schema with one preset field added to an installed component (unchanged when it is already there). */
  function ensureField(schema, cid, key) {
    var comp = EM().findById(schema.components, cid);
    var preset = presetComponent(cid);
    if (!comp || !preset) return schema;
    if (comp.fields.some(function (f) { return f.key === key; })) return schema;
    var field = preset.fields.filter(function (f) { return f.key === key; })[0];
    if (!field) return schema;
    return EM().upsertComponent(schema, Object.assign({}, comp, { fields: comp.fields.concat([field]) }));
  }

  /**
   * What the People / Places bridge and the owner field need in every schema: the Propriété and Adresse
   * components (the Lieu type carries Adresse), and the Personne type when asked (opts.people). Existing
   * types and data are left alone.
   */
  function ensureBridge(schema, opts) {
    var next = ensureComponent(ensureComponent(schema, 'propriete'), 'adresse');
    var place = EM().findById(next.types, 'place');
    if (place && place.components.indexOf('adresse') < 0) {
      next = EM().upsertType(next, Object.assign({}, place, { components: place.components.concat(['adresse']) }));
    }
    if (opts && opts.people && !installedAs(next, 'personne')) {
      var r = install(next, 'personne');
      if (!r.error) next = r.schema;
    }
    return next;
  }

  // ---------------------------------------------------------------- 5 export
  global.EntitiesLibrary = {
    COMPONENTS: COMPONENTS,
    TYPES: TYPES,
    GROUPS: GROUPS,
    presetType: presetType,
    installedAs: installedAs,
    listFor: listFor,
    missingFor: missingFor,
    dependencies: dependencies,
    install: install,
    ensureComponent: ensureComponent,
    ensureField: ensureField,
    ensureBridge: ensureBridge,
  };
})(typeof window !== 'undefined' ? window : this);
