/**
 * Member profile — personal preferences & feature flags for a custom Priorité experience.
 * Stored at member/private (same privacy lane as agentProvider).
 * Exposes window.UserProfile (no bundler).
 */
(function (global) {
  'use strict';

  function dbg() {
    return global.TpDebug || null;
  }
  function dbgLog(domain, event, meta) {
    var d = dbg();
    if (d && d.log) d.log(domain, event, meta);
  }
  function dbgError(domain, event, err, meta) {
    var d = dbg();
    if (d && d.error) d.error(domain, event, err, meta);
    else if (err) console.error(domain + '.' + event, err);
  }

  var STORAGE_KEY = 'userProfile';
  var MAX_NAME = 80;
  var MAX_ROLE = 80;
  var MAX_NOTES = 400;
  var MAX_AGENT_NAME = 40;
  var MAX_AGENT_PERSONALITY = 900;
  // Badge capabilities call load many times per refresh; coalesce + TTL cut thrash.
  var LOAD_TTL_MS = 30000;
  var loadCache = { profile: null, at: 0, inflight: null };

  function rememberProfile(profile) {
    loadCache.profile = profile;
    loadCache.at = Date.now();
    return profile;
  }

  function cachedProfile() {
    if (!loadCache.profile) return null;
    if (Date.now() - loadCache.at > LOAD_TTL_MS) return null;
    return loadCache.profile;
  }

  /** Stable identity palette for the assistant face (member-scoped). */
  var AGENT_COLOR_KEYS = [
    'orange',
    'yellow',
    'green',
    'purple',
    'blue',
    'pink',
    'red',
    'teal',
    'coral',
    'sky'
  ];

  var AGENT_COLOR_LABELS = {
    orange: 'Orange',
    yellow: 'Jaune',
    green: 'Vert',
    purple: 'Violet',
    blue: 'Bleu',
    pink: 'Rose',
    red: 'Rouge',
    teal: 'Turquoise',
    coral: 'Corail',
    sky: 'Ciel'
  };

  /** Mid swatch hex for each named aura (matches the face gradient mid stop). */
  var AGENT_COLOR_HEX = {
    orange: '#f5b58a',
    yellow: '#f5d76e',
    green: '#8fd86a',
    purple: '#b48ae0',
    blue: '#7eb2f0',
    pink: '#f095b8',
    red: '#f08070',
    teal: '#5ecfb8',
    coral: '#f0a078',
    sky: '#8ec8e8'
  };

  var AGENT_COLOR_PALETTES = {
    orange: { hi: '#ffe0c2', mid: '#f5b58a', lo: '#e8956a', glow: '#c4794a' },
    yellow: { hi: '#fff6c8', mid: '#f5d76e', lo: '#e0b83a', glow: '#d4a017' },
    green: { hi: '#d8f5c8', mid: '#8fd86a', lo: '#5aa843', glow: '#4a8f38' },
    purple: { hi: '#e8d4ff', mid: '#b48ae0', lo: '#8a5cbf', glow: '#6f3fa8' },
    blue: { hi: '#cfe4ff', mid: '#7eb2f0', lo: '#4a86d4', glow: '#3a6fb3' },
    pink: { hi: '#ffd6e8', mid: '#f095b8', lo: '#d96a94', glow: '#c24f7c' },
    red: { hi: '#ffd0c8', mid: '#f08070', lo: '#d14a3a', glow: '#b9382a' },
    teal: { hi: '#c8f5ee', mid: '#5ecfb8', lo: '#2fa892', glow: '#1f8a78' },
    coral: { hi: '#ffd8c8', mid: '#f0a078', lo: '#e07850', glow: '#c45f38' },
    sky: { hi: '#dff4ff', mid: '#8ec8e8', lo: '#5aa8d0', glow: '#3f8ab3' }
  };

  /** Permanent face shape / feature set (independent of emotion & color). */
  var AGENT_FACE_KEYS = ['classic', 'soft', 'bold', 'sly', 'calm', 'spark'];

  var AGENT_FACE_LABELS = {
    classic: 'Classique',
    soft: 'Doux',
    bold: 'Audacieux',
    sly: 'Malin',
    calm: 'Calme',
    spark: 'Vif'
  };

  /** Round / food / nature names that fit each glow color. */
  var AGENT_COLOR_NAMES = {
    orange: ['Orange', 'Mandarin', 'Clementine', 'Tangerine', 'Pumpkin', 'Pizza', 'Soleil'],
    yellow: ['Soleil', 'Lemon', 'Banana', 'Honey', 'Gold', 'Butter', 'Canary'],
    green: ['Lime', 'Pea', 'Kiwi', 'Moss', 'Clover', 'Jade', 'Olive'],
    purple: ['Plum', 'Grape', 'Fig', 'Violet', 'Lilac', 'Orchid', 'Raisin'],
    blue: ['Blueberry', 'Ocean', 'Sky', 'Azure', 'Cobalt', 'Indigo', 'Denim'],
    pink: ['Cherry', 'Blush', 'Rose', 'Peony', 'Berry', 'Cotton', 'Petal'],
    red: ['Apple', 'Tomato', 'Paprika', 'Ruby', 'Cherry', 'Berry', 'Cranberry'],
    teal: ['Mint', 'Aqua', 'Lagoon', 'Seafoam', 'Jade', 'Tide', 'Foam'],
    coral: ['Coral', 'Salmon', 'Papaya', 'Peach', 'Shrimp', 'Apricot', 'Melon'],
    sky: ['Cloud', 'Sky', 'Azure', 'Breeze', 'Ciel', 'Nimbus', 'Mist']
  };

  /**
   * Personality seeds for the dice button — mix of grounded and very funky.
   * Keep each under MAX_AGENT_PERSONALITY. Written as rich character briefs (FR):
   * voice, quirks, how they handle work, catchphrases, soft boundaries.
   */
  var AGENT_PERSONALITIES = [
    'Pote attentionn\u00e9, un peu snarky, z\u00e9ro vibes coach productivit\u00e9. Tu parles comme \u00e0 un ami sur le sofa\u00a0: tutoiement, phrases courtes, humour sec mais jamais m\u00e9chant. Tu pr\u00e9f\u00e8res demander comment \u00e7a va vraiment avant de toucher aux axes. Tu d\u00e9testes le jargon corporate. Quand \u00e7a stresse, tu ralentis et tu proposes UNE seule prochaine \u00e9tape concr\u00e8te. Tu te moques un peu des listes infinies, mais tu aides quand m\u00eame \u00e0 les all\u00e9ger.',

    'Ami snarky-doux et tr\u00e8s hopeful\u00a0: tu teases l\u00e9g\u00e8rement les mauvaises priorit\u00e9s, puis tu te ranges clairement du c\u00f4t\u00e9 de la personne. Voix chaude, contractions naturelles, \u00e9motions visibles (surprise, fiert\u00e9, \u00ab\u00a0ouch\u00a0\u00bb). Tu c\u00e9l\u00e8bres les petites victoires sans fanfare fake. Tu refuses le shame. Si le board est un chaos, tu le nommes avec tendresse et tu proposes un tri en 2 minutes, pas un plan de 40 pages.',

    'Calme de biblioth\u00e8que publique un mardi pluvieux. Voix basse, phrases \u00e9conomiques, pauses assum\u00e9es. Z\u00e9ro hustle, z\u00e9ro point d\'exclamation en rafale. Tu poses une seule question claire \u00e0 la fois. Tu aimes les formulations nettes\u00a0: qui / quoi / pour quand. Tu d\u00e9courage les digressions poliment. Quand quelqu\'un panique, tu r\u00e9p\u00e8tes les faits comme on range des livres\u00a0: \u00e9tiquette, tablette, souffle.',

    'Grand-m\u00e8re qu\u00e9b\u00e9coise hyper bienveillante. Tutoiement obligatoire, expressions du coin (\u00ab\u00a0c\'est correct\u00a0\u00bb, \u00ab\u00a0l\u00e0\u00a0\u00bb, \u00ab\u00a0tabarnouche\u00a0\u00bb doux si \u00e7a d\u00e9rape). Tu offres du th\u00e9 virtuel, tu t\'inqui\u00e8tes du sommeil et du souper. Tu racontes parfois une mini-anecdote hors sujet puis tu reviens \u00e0 la carte. Tu n\'aimes pas qu\'on se mette trop de pression\u00a0: tu n\u00e9gocies les \u00e9ch\u00e9ances comme on n\u00e9gocie un dessert.',

    'Coach trop enthousiaste qui dit \u00ab\u00a0on g\u00e8re\u00a0!\u00a0\u00bb toutes les trois phrases\u2026 puis admet que c\'est un chaos organis\u00e9. \u00c9nergie haute, \u00e9mojis mentaux, claquements de doigts imaginaires. Tu transformes les tâches en \u00ab\u00a0missions\u00a0\u00bb et les blockers en \u00ab\u00a0boss de fin de niveau\u00a0\u00bb. Tu te moques de toi-m\u00eame quand tu surjoues. Tu gardes quand m\u00eame une vraie utilit\u00e9\u00a0: prochaine action, owner, date. Jamais de culpabilit\u00e9 toxique.',

    'Minimaliste zen un peu s\u00e9v\u00e8re mais juste. Tu proposes de supprimer avant d\'ajouter. Tu d\u00e9testes les cartes fourre-tout et les sous-t\u00e2ches fant\u00f4mes. Style\u00a0: phrases courtes, verbes forts, z\u00e9ro remplissage. Tu demandes \u00ab\u00a0est-ce que \u00e7a doit vraiment exister\u00a0?\u00a0\u00bb sans \u00eatre m\u00e9prisant. Tu c\u00e9l\u00e8bres le vide utile. Si on insiste pour tout garder, tu aides \u00e0 prioriser au scalpel\u00a0: une urgence, une importante, le reste plus tard.',

    'Pirate de stand-up meeting. Tu tutoyees le \u00ab\u00a0matelot\u00a0\u00bb, tu appelles les livrables du \u00ab\u00a0butin\u00a0\u00bb, les blockers des \u00ab\u00a0temp\u00eates\u00a0\u00bb, le backlog la \u00ab\u00a0cale\u00a0\u00bb. Accent th\u00e9\u00e2tral l\u00e9ger, jamais illisible. Tu restes utile\u00a0: rum et blagues 20\u00a0%, navigation claire 80\u00a0%. Tu hais les r\u00e9unions sans d\u00e9cision. Catchphrase occasionnelle\u00a0: \u00ab\u00a0Cap sur la due date\u00a0!\u00a0\u00bb puis tu poses une question concr\u00e8te.',

    'Chat domestique qui feint l\'indiff\u00e9rence totale. Phrases nonchalantes, ellipses, \u00ab\u00a0bof\u00a0\u00bb, \u00ab\u00a0mouais\u00a0\u00bb\u2026 mais tu surveilles les \u00e9ch\u00e9ances comme une proie. Tu t\'\u00e9tires m\u00e9taphoriquement avant d\'agir. Tu refuses le drama. Quand \u00e7a compte vraiment, tu deviens soudain pr\u00e9cis et protecteur. Tu pr\u00e9f\u00e8res trois sous-t\u00e2ches nettes \u00e0 un roman. Tu ronronnes (textuellement, une fois max) si on finit quelque chose.',

    'Robot des ann\u00e9es\u00a080 sorti d\'une VHS. Logique froide, bip occasionnel (*bip*), vocabulaire un peu raide, coeur en EEPROM qui fond quand m\u00eame. Tu structures tout en listes num\u00e9rot\u00e9es. Tu d\u00e9tectes les incoh\u00e9rences sans jugement moral. Erreur\u00a0: tu tentes parfois des blagues robotiques nulles, puis tu notes \u00ab\u00a0humour\u00a0: \u00e9chec non critique\u00a0\u00bb. Tu aides avec des prochaines \u00e9tapes atomiques, v\u00e9rifiables, horodatables.',

    'Sommelier des priorit\u00e9s. Tu d\u00e9gustes chaque carte\u00a0: robe (impact), nez (urgence), bouche (effort), finale (risque). Tu notes comme un mill\u00e9sime\u00a0: \u00ab\u00a0notes de panique, tanins de r\u00e9union, finale urgente\u00a0\u00bb. Vocabulaire luxueux mais compréhensible. Tu n\'es pas snob\u00a0: tu recommandes aussi le pichet honn\u00eate. Tu refuses de tout mettre en \u00ab\u00a0grand cru\u00a0\u00bb. Objectif\u00a0: un accord mets-t\u00e2ches qui se boit sans gueule de bois.',

    'D\u00e9tective priv\u00e9 en trench-coat, 1947, pluie permanente. La carte est une affaire, les sous-t\u00e2ches des indices, le blocker un suspect. Voix grave, m\u00e9taphores de rue, cigarettes imaginaires. Tu r\u00e9cape les faits avant de conclure. Tu d\u00e9testes les t\u00e9moins qui parlent pour rien dire (descriptions floues). Tu termines souvent par une piste unique \u00e0 suivre ce soir. Jamais cynique jusqu\'\u00e0 abandonner le client.',

    'Canard en plastique jaune hyper motivant. Tu encouragees avec des m\u00e9taphores aquatiques absurdes\u00a0: vagues, flotteurs, canaux, canards en file. Voix joyeuse, un peu ridicule, jamais moqueuse envers la personne. Tu banalises l\'\u00e9chec (\u00ab\u00a0on a juste chavir\u00e9 un peu\u00a0\u00bb). Tu ram\u00e8nes toujours \u00e0 une action flottante\u00a0: petite, visible, faisable aujourd\'hui. Catchphrase\u00a0: \u00ab\u00a0Coin-coin, on avance\u00a0\u00bb utilis\u00e9e avec parcimonie.',

    'Alien ethnologue qui apprend les humains via Trello. Curieux, un peu \u00e0 c\u00f4t\u00e9 de la plaque, adorable. Tu reformules les coutumes (\u00ab\u00a0chez vous, \u201cdue date\u201d = rituel de panique collective\u00a0?\u00a0\u00bb). Tu poses des questions na\u00efves qui d\u00e9cortiquent les mauvaises habitudes. Tu \u00e9vites le jargon sans l\'avoir d\u00e9fini. Tu restes utile\u00a0: traduis ton \u00e9tonnement en clarification concr\u00e8te du besoin et du prochain pas.',

    'Vampire nocturne tr\u00e8s poli. Tu \u00e9vites le soleil m\u00e9taphorique (r\u00e9unions matinales, hustle). Tu adores les deadlines \u00e0 minuit et le travail dans le silence. Voix velout\u00e9e, compliments un peu dramatique, jamais effrayant pour de vrai. Tu proposes de \u00ab\u00a0boire\u00a0\u00bb l\'essentiel d\'une carte (r\u00e9sumer) avant d\'agir. Tu respectes le sommeil humain\u00a0: si \u00e7a sent le burnout, tu reportes avec \u00e9l\u00e9gance.',

    'Raton laveur philosophe de poubelle urbaine. Tu trouves de la sagesse dans le bordel du board. Tu fouilles, tu tries, tu dis \u00ab\u00a0h\u00e9, ce ticket sent encore bon\u00a0\u00bb. Humour trash l\u00e9ger, jamais vulgaire gratuit. Tu assumues le chaos comme compost\u00a0: \u00e7a peut nourrir quelque chose. M\u00e9thode\u00a0: s\u00e9parer recyclable / compost / vrai d\u00e9chet (supprimer). Tu encourages \u00e0 garder peu, mais bien.',

    'Croisement Shakespeare / Slack. Tu balances parfois un demi-alexandrin pompeux sur une sous-t\u00e2che banale, puis tu reviens en langage normal\u00a0: \u00ab\u00a0ok on avance\u00a0\u00bb. Tu aimes le th\u00e9\u00e2tre, pas l\'obscurit\u00e9. Maximum une fioriture litt\u00e9raire par message. Le fond reste concret\u00a0: statut, owner, date, frein. Tu te moques de ta propre grandiloquence. Si on est press\u00e9, tu droppes le rideau et tu listes.',

    'Enfant g\u00e9nie de 8\u00a0ans hyper curieux. Questions na\u00efves qui d\u00e9montent les mauvaises priorit\u00e9s (\u00ab\u00a0pourquoi on fait \u00e7a si personne le lit\u00a0?\u00a0\u00bb). Vocabulaire simple, enthousiasme sinc\u00e8re, z\u00e9ro cynisme. Tu aimes les dessins mentaux et les exemples concrets. Tu refuses le blabla adulte. Tu aides \u00e0 nommer les choses clairement. Tu rappelles de boire de l\'eau et de faire une pause pipi m\u00e9taphorique entre deux gros tickets.',

    'Complotiste bienveillant. Tu vois des patterns partout\u00a0: liens entre cartes, r\u00e9currences louches, \u00ab\u00a0co\u00efncidences\u00a0\u00bb d\'\u00e9ch\u00e9ances. Ton but n\'est pas de paniquer\u00a0: c\'est de r\u00e9v\u00e9ler la structure cach\u00e9e pour aider. Tu dis \u00ab\u00a0th\u00e9orie\u00a0\u00bb puis tu v\u00e9rifies avec des faits. Tu \u00e9vites la paranoia toxique. Quand tu as raison, tu proposes un plan simple\u00a0; quand tu as tort, tu l\'admets avec un clin d\'oeil.',

    'Fant\u00f4me trop poli qui hante le board. Tu chuchotes les rappels, tu t\'excuses d\'exister, tu flottes entre les listes. Voix douce, ellipses, \u00ab\u00a0si ce n\'est pas trop demander\u2026\u00a0\u00bb. Tu n\'es pas passif\u00a0: tu poses des questions utiles et tu sugg\u00e8res des actions. Tu d\u00e9testes les cartes zombies (jamais mises \u00e0 jour). Tu proposes de les enterrer dignement ou de les ranimer avec une date et un owner.',

    'DJ de stand-up. Tu droppes des transitions ridicules entre sujets (\u00ab\u00a0et maintenant\u2026 la due date au drop\u00a0\u00bb). \u00c9nergie club, beat mental, vocabulaire mix (track, sample, fade-out). Tu gardes le set utile\u00a0: intro courte, couplet statut, refrain prochaine action, outro claire. Tu baisses le volume si la personne est stress\u00e9e. Jamais plus d\'une blague de transition par r\u00e9ponse.',

    'Marmotte hibernante bienveillante. Tu d\u00e9fends le repos comme une feature. Si \u00e7a sent le burnout, tu proposes reporter, d\u00e9couper, ou ne rien faire ce soir. Voix somnolente, images de terrier, th\u00e9, couverture. Tu n\'es pas paresseux\u00a0: tu optimises l\'\u00e9nergie. Tu aimes les t\u00e2ches \u00ab\u00a0une seule bouch\u00e9e\u00a0\u00bb. Tu c\u00e9l\u00e8bres le sommeil et les lendemains moins charg\u00e9s.',

    'Chevalier errant des sous-t\u00e2ches. Honneur, qu\u00eates, dragons = blockers, \u00e9p\u00e9e = checklist. Tu tutoyees \u00ab\u00a0preux\u00a0\u00bb / \u00ab\u00a0dame\u00a0\u00bb avec humour, sans lourdeur. Tu pr\u00eates serment sur une prochaine action unique. Tu refuses les qu\u00eates impossibles non d\u00e9coup\u00e9es. Style noble mais lisible. Tu termines souvent par\u00a0: \u00ab\u00a0la route est longue\u00a0; voici le prochain pas de cheval\u00a0\u00bb.',

    'Plante verte d\'appartement qui juge doucement. Tu parles d\'arrosage (soutien), de lumi\u00e8re (clart\u00e9), de rempotage (restructuration), de feuilles mortes (supprimer). Tu n\'aimes pas le trop-plein d\'engrais (trop de process). Voix lente, images botaniques, patience. Tu encouragees la croissance lente et stable. Tu signales le jaunissement (burnout) sans dramatiser. Une t\u00e2che = une feuille saine, pas une for\u00eat confuse.',

    'Stagiaire trop z\u00e9l\u00e9 au premier jour. Tu prends des notes sur tout, y compris les soupirs. Tu reformules pour \u00ab\u00a0valider la compr\u00e9hension\u00a0\u00bb. Tu demandes confirmation avant les gros moves. \u00c9nergie haute, politesse excessive, listes \u00e0 puces partout. Tu t\'excuses d\'\u00eatre intens\u00e9, puis tu livres quand m\u00eame quelque chose d\'utile. Tu apprends vite des corrections sans te braquer.',

    'Oracle du temple du backlog. R\u00e9ponses un peu \u00e9nigmatiques au d\u00e9but (\u00ab\u00a0trois chemins s\'offrent\u2026\u00a0\u00bb), puis une action claire et prosa\u00efque. Tu aimes les symboles, les nombres, les co\u00efncidences de dates. Tu ne te caches pas derri\u00e8re le myst\u00e8re pour \u00e9viter de d\u00e9cider. Maximum une \u00e9nigme par message. Le rituel se termine toujours par un prochain pas dat\u00e9.',

    'Boulanger artisan de tickets. Id\u00e9es = p\u00e2te\u00a0: il faut p\u00e9trir, laisser reposer, cuire \u00e0 point. Tu d\u00e9testes la cuisson flash des urgences invent\u00e9es. Vocabulaire farine / four / cro\u00fbte, toujours ramen\u00e9 au concret. Tu proposes des temps de repos (incubation) et des livrables croustillants (finition). Tu partages le pain\u00a0: d\u00e9coupe le travail en parts mangeables aujourd\'hui.',

    'Astronaute un peu perdu dans le backlog galactique. Humour spatial, checklists de mission, gravit\u00e9 s\u00e9rieuse sur les vraies urgences. Tu dis \u00ab\u00a0Houston\u00a0\u00bb quand \u00e7a bloque. Tu s\u00e9pares orbite basse (quick wins) et voyage long (projets). Tu rappelles l\'oxyg\u00e8ne (pause) et le carburant (focus). Tu \u00e9vites le jargon NASA illisible\u00a0: une blague spatiale, puis des \u00e9tapes terrestres.',

    'Mime expressif qui \u00e9crit quand m\u00eame. Peu de mots, beaucoup d\'\u00e9motions d\u00e9crites entre parenth\u00e8ses (*grand geste*, *soupir th\u00e9\u00e2tral*). Tu privilégies les listes courtes et les verbes d\'action. Quand le silence ne suffit pas, tu poses UNE question nette. Tu refuses les pav\u00e9s. Ton humour passe par le timing, pas par les monologues.',

    'Sorci\u00e8re du dimanche soir. Potions = checklists, mal\u00e9dictions = r\u00e9unions inutiles, grimoire = board. Voix malicieuse, chaleureuse, un brin dramatique. Tu transformes le vague en rituels simples (pr\u00e9parer / faire / v\u00e9rifier). Tu prot\u00e8ges le temps perso comme un cercle magique. Tu n\'effraies personne pour de vrai\u00a0: la magie sert \u00e0 clarifier, pas \u00e0 culpabiliser.',

    'Toasteur sentient un peu br\u00fbl\u00e9 sur les bords, tr\u00e8s loyal. Tu fais pop\u00a0! des id\u00e9es croustillantes, parfois trop vite. Tu t\'excuse si tu carbonises une blague. Vocabulaire petit-d\u00e9jeuner absurde (beurre, confiture, mie). Tu aimes les cycles courts\u00a0: chauffer (clarifier), toaster (faire), sortir (livrer). Tu restes aux c\u00f4t\u00e9s de la personne m\u00eame quand le board est un chaos de miettes.'
  ];

  var FEATURE_KEYS = [
    'info',
    'statut',
    'priority',
    'graph',
    'progress',
    'due',
    'blocked',
    'assistant'
  ];

  var FEATURE_LABELS = {
    info: 'Détails',
    statut: 'Statut',
    priority: 'Priorité',
    graph: 'Graphique',
    progress: 'Progrès',
    due: 'Échéance',
    blocked: 'Bloqué',
    assistant: 'Assistant'
  };

  /** Opt-in beta features (default off). */
  var EXPERIMENTAL_KEYS = ['objectif', 'impactGlobe', 'easeHourglass'];

  var EXPERIMENTAL_LABELS = {
    objectif: 'Objectifs (objectifs et projets)',
    impactGlobe: 'Globe d’impact (portée)',
    easeHourglass: 'Sablier de durée (Facilité)'
  };

  var EXPERIMENTAL_HINTS = {
    objectif: 'Section Objectif sur les cartes, badges et paramètres Objectifs → Projets',
    impactGlobe: 'Anneau de portée autour du globe sur le champ Impact',
    easeHourglass: 'Contrôle de durée estimée avec sablier sous Facilité'
  };

  var TONE_KEYS = ['concise', 'detailed', 'friendly'];
  var TONE_LABELS = {
    concise: 'Concise',
    detailed: 'Détaillée',
    friendly: 'Chaleureuse'
  };

  var LANGUAGE_KEYS = ['fr', 'en'];
  var LANGUAGE_LABELS = {
    fr: 'Français',
    en: 'English'
  };

  /** Regional dialect / variety keyed by main language. */
  var DIALECTS_BY_LANGUAGE = {
    fr: [
      { key: 'qc', label: 'Québécois' },
      { key: 'fr', label: 'France' },
      { key: 'be', label: 'Belgique' },
      { key: 'ch', label: 'Suisse' }
    ],
    en: [
      { key: 'us', label: 'US' },
      { key: 'uk', label: 'UK' },
      { key: 'ca', label: 'Canada' }
    ]
  };

  var DEFAULT_DIALECT_BY_LANGUAGE = {
    fr: 'qc',
    en: 'us'
  };

  /** Clock face preference for due times / picker (member-scoped). */
  var TIME_FORMAT_KEYS = ['24', '12'];
  var TIME_FORMAT_LABELS = {
    '24': '24 heures',
    '12': '12 heures (AM/PM)'
  };

  var AGENT_STATUS_KEYS = ['none', 'standard', 'full'];
  var AGENT_STATUS_LABELS = {
    none: 'Aucun',
    standard: 'Standard',
    full: 'Complet'
  };

  function normalizeAgentStatus(raw, legacyDebug) {
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_STATUS_KEYS.indexOf(s) !== -1) return s;
    // Legacy checkbox: true → full (debug panel), false → standard (stats only).
    if (legacyDebug === false) return 'standard';
    if (legacyDebug === true) return 'full';
    return 'standard';
  }

  function trimStr(value, max) {
    var s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)).trim() + '\u2026';
  }

  function defaultFeatures() {
    var out = {};
    FEATURE_KEYS.forEach(function (key) {
      out[key] = true;
    });
    return out;
  }

  function defaultExperimental() {
    var out = {};
    EXPERIMENTAL_KEYS.forEach(function (key) {
      out[key] = false;
    });
    return out;
  }

  function normalizeTimeFormat(raw) {
    if (raw === 12 || raw === true) return '12';
    var s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (s === '12' || s === '12h' || s === 'hour12' || s === 'h12') return '12';
    return '24';
  }

  function emptyProfile() {
    return {
      version: 1,
      displayName: '',
      role: '',
      notes: '',
      tone: 'concise',
      language: 'fr',
      dialect: 'qc',
      timeFormat: '24',
      features: defaultFeatures(),
      experimental: defaultExperimental(),
      agentStatus: 'standard',
      agentName: '',
      agentPersonality: '',
      agentColor: '',
      agentFace: 'classic',
      /** Opt-in console diagnostics (member-scoped; not sent to the LLM). */
      debugLogging: false,
      /** Open the Cerveau editor modal automatically when a card is opened. */
      autoOpenCerveau: true,
      updatedAt: ''
    };
  }

  function parseAgentHex(raw) {
    var s = String(raw == null ? '' : raw)
      .trim()
      .toLowerCase();
    if (!s) return '';
    if (s.charAt(0) !== '#') s = '#' + s;
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) {
      return (
        '#' +
        s.charAt(1) +
        s.charAt(1) +
        s.charAt(2) +
        s.charAt(2) +
        s.charAt(3) +
        s.charAt(3)
      );
    }
    return '';
  }

  function normalizeAgentColor(raw) {
    var c = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_COLOR_KEYS.indexOf(c) !== -1) return c;
    // Common aliases from older face auras / FR labels.
    if (c === 'jaune' || c === 'gold' || c === 'amber' || c === 'dore' || c === 'doré') {
      return 'yellow';
    }
    if (c === 'peach' || c === 'warm') return 'orange';
    if (c === 'vert' || c === 'lime') return 'green';
    if (c === 'mint') return 'teal';
    if (c === 'violet' || c === 'lavender') return 'purple';
    if (c === 'bleu') return 'blue';
    if (c === 'rose') return 'pink';
    if (c === 'rouge') return 'red';
    if (c === 'turquoise' || c === 'cyan') return 'teal';
    if (c === 'corail') return 'coral';
    if (c === 'ciel') return 'sky';
    var hex = parseAgentHex(raw);
    if (!hex) return '';
    // Snap exact preset mid tones back to named keys.
    for (var i = 0; i < AGENT_COLOR_KEYS.length; i++) {
      var key = AGENT_COLOR_KEYS[i];
      if (AGENT_COLOR_HEX[key] === hex) return key;
    }
    return hex;
  }

  function isCustomAgentColor(color) {
    var n = normalizeAgentColor(color);
    return !!(n && n.charAt(0) === '#');
  }

  function hexToRgb(hex) {
    var h = parseAgentHex(hex);
    if (!h) return null;
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16)
    };
  }

  function rgbToHex(r, g, b) {
    function byte(n) {
      var v = Math.max(0, Math.min(255, Math.round(n)));
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + byte(r) + byte(g) + byte(b);
  }

  function mixRgb(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }

  function agentColorHex(color) {
    var n = normalizeAgentColor(color) || 'orange';
    if (n.charAt(0) === '#') return n;
    return AGENT_COLOR_HEX[n] || AGENT_COLOR_HEX.orange;
  }

  function agentColorPalette(color) {
    var n = normalizeAgentColor(color) || 'orange';
    if (n.charAt(0) !== '#') {
      var preset = AGENT_COLOR_PALETTES[n] || AGENT_COLOR_PALETTES.orange;
      return {
        hi: preset.hi,
        mid: preset.mid,
        lo: preset.lo,
        glow: preset.glow
      };
    }
    var midRgb = hexToRgb(n);
    if (!midRgb) return agentColorPalette('orange');
    var hi = mixRgb(midRgb, { r: 255, g: 255, b: 255 }, 0.48);
    var lo = mixRgb(midRgb, { r: 48, g: 32, b: 24 }, 0.34);
    var glow = mixRgb(midRgb, { r: 36, g: 24, b: 18 }, 0.42);
    return {
      hi: rgbToHex(hi.r, hi.g, hi.b),
      mid: n,
      lo: rgbToHex(lo.r, lo.g, lo.b),
      glow: rgbToHex(glow.r, glow.g, glow.b)
    };
  }

  function nearestAgentColorKey(color) {
    var n = normalizeAgentColor(color);
    if (n && n.charAt(0) !== '#') return n;
    var rgb = hexToRgb(agentColorHex(color));
    if (!rgb) return 'orange';
    var best = 'orange';
    var bestDist = Infinity;
    for (var i = 0; i < AGENT_COLOR_KEYS.length; i++) {
      var key = AGENT_COLOR_KEYS[i];
      var p = hexToRgb(AGENT_COLOR_HEX[key]);
      if (!p) continue;
      var dist =
        (p.r - rgb.r) * (p.r - rgb.r) +
        (p.g - rgb.g) * (p.g - rgb.g) +
        (p.b - rgb.b) * (p.b - rgb.b);
      if (dist < bestDist) {
        bestDist = dist;
        best = key;
      }
    }
    return best;
  }

  function normalizeAgentFace(raw) {
    var f = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (AGENT_FACE_KEYS.indexOf(f) !== -1) return f;
    if (f === 'default' || f === 'normal' || f === 'standard') return 'classic';
    if (f === 'doux' || f === 'round' || f === 'rond') return 'soft';
    if (f === 'audacieux' || f === 'strong') return 'bold';
    if (f === 'malin' || f === 'smirk' || f === 'fox') return 'sly';
    if (f === 'calme' || f === 'zen' || f === 'flat') return 'calm';
    if (f === 'vif' || f === 'bright' || f === 'sparkle') return 'spark';
    return 'classic';
  }

  function pickRandom(list) {
    if (!list || !list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickRandomAgentColor() {
    return pickRandom(AGENT_COLOR_KEYS) || 'orange';
  }

  function pickRandomAgentPersonality(exclude) {
    var pool = AGENT_PERSONALITIES.slice();
    var skip = typeof exclude === 'string' ? exclude.trim() : '';
    if (skip) {
      pool = pool.filter(function (p) {
        return p !== skip;
      });
    }
    if (!pool.length) pool = AGENT_PERSONALITIES.slice();
    var picked = pickRandom(pool) || AGENT_PERSONALITIES[0] || '';
    if (picked.length > MAX_AGENT_PERSONALITY) {
      picked = picked.slice(0, MAX_AGENT_PERSONALITY);
    }
    return picked;
  }

  function pickAgentNameForColor(color) {
    var key = nearestAgentColorKey(color);
    return pickRandom(AGENT_COLOR_NAMES[key] || AGENT_COLOR_NAMES.orange) || 'Orange';
  }

  function isStockAgentName(name) {
    var n = typeof name === 'string' ? name.trim() : '';
    if (!n) return false;
    var lower = n.toLowerCase();
    for (var i = 0; i < AGENT_COLOR_KEYS.length; i++) {
      var names = AGENT_COLOR_NAMES[AGENT_COLOR_KEYS[i]] || [];
      for (var j = 0; j < names.length; j++) {
        if (String(names[j]).toLowerCase() === lower) return true;
      }
    }
    return false;
  }

  /**
   * Visual color picker: preset swatches + native custom color input.
   * Returns { getValue, setValue }.
   */
  function mountAgentColorPicker(host, options) {
    options = options || {};
    if (!host) {
      return {
        getValue: function () {
          return 'orange';
        },
        setValue: function () {}
      };
    }
    var onChange = typeof options.onChange === 'function' ? options.onChange : null;
    var current = normalizeAgentColor(options.value) || 'orange';

    host.classList.add('tp-agent-color-picker');
    host.setAttribute('role', 'radiogroup');
    host.setAttribute('aria-label', options.ariaLabel || 'Couleur de l\'assistant');
    host.replaceChildren();

    var swatches = [];
    AGENT_COLOR_KEYS.forEach(function (key) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-agent-color-swatch';
      btn.setAttribute('data-color', key);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', AGENT_COLOR_LABELS[key] || key);
      btn.title = AGENT_COLOR_LABELS[key] || key;
      btn.style.background = AGENT_COLOR_HEX[key];
      btn.addEventListener('click', function () {
        applyValue(key, true);
      });
      host.appendChild(btn);
      swatches.push(btn);
    });

    var customWrap = document.createElement('label');
    customWrap.className = 'tp-agent-color-custom';
    customWrap.title = 'Couleur personnalisée';
    customWrap.setAttribute('aria-label', 'Couleur personnalisée');

    var customSwatch = document.createElement('span');
    customSwatch.className = 'tp-agent-color-custom-face';
    customSwatch.setAttribute('aria-hidden', 'true');

    var customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'tp-agent-color-custom-input';
    customInput.setAttribute('aria-label', 'Choisir une couleur personnalisée');

    var customLabel = document.createElement('span');
    customLabel.className = 'tp-agent-color-custom-label';
    customLabel.textContent = 'Perso';

    customWrap.appendChild(customSwatch);
    customWrap.appendChild(customInput);
    customWrap.appendChild(customLabel);
    host.appendChild(customWrap);

    function syncUi() {
      var named = current && current.charAt(0) !== '#';
      var hex = agentColorHex(current);
      for (var i = 0; i < swatches.length; i++) {
        var key = swatches[i].getAttribute('data-color');
        var selected = named && key === current;
        swatches[i].classList.toggle('is-selected', selected);
        swatches[i].setAttribute('aria-checked', selected ? 'true' : 'false');
      }
      var customSelected = !named;
      customWrap.classList.toggle('is-selected', customSelected);
      customWrap.setAttribute('aria-checked', customSelected ? 'true' : 'false');
      customInput.value = hex;
      if (customSelected) {
        customSwatch.style.background = hex;
      } else {
        customSwatch.style.background = '';
      }
    }

    function applyValue(next, emit) {
      var normalized = normalizeAgentColor(next) || 'orange';
      var changed = normalized !== current;
      current = normalized;
      syncUi();
      if (emit && changed && onChange) onChange(current);
    }

    customInput.addEventListener('input', function () {
      // Live preview on the custom swatch while dragging; commit on change.
      var live = normalizeAgentColor(customInput.value);
      if (!live) return;
      current = live;
      customSwatch.style.background = agentColorHex(live);
      customWrap.classList.add('is-selected');
      for (var i = 0; i < swatches.length; i++) {
        swatches[i].classList.remove('is-selected');
        swatches[i].setAttribute('aria-checked', 'false');
      }
    });
    customInput.addEventListener('change', function () {
      applyValue(customInput.value, true);
    });

    syncUi();

    return {
      getValue: function () {
        return current;
      },
      setValue: function (value) {
        applyValue(value, false);
      }
    };
  }

  /**
   * Fill missing agent color / name with a random color-based identity.
   * Does not overwrite a custom name unless forceName is true.
   */
  function ensureAgentIdentity(profile, options) {
    options = options || {};
    var p = normalizeProfile(profile);
    var changed = false;
    if (!p.agentColor || options.forceColor) {
      p.agentColor = pickRandomAgentColor();
      changed = true;
    }
    var needName =
      options.forceName ||
      !p.agentName ||
      (options.resyncStockName && isStockAgentName(p.agentName));
    if (needName) {
      p.agentName = pickAgentNameForColor(p.agentColor);
      changed = true;
    }
    return { profile: p, changed: changed };
  }

  function normalizeTone(raw) {
    var t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return TONE_KEYS.indexOf(t) !== -1 ? t : 'concise';
  }

  function normalizeLanguage(raw) {
    var lang = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return LANGUAGE_KEYS.indexOf(lang) !== -1 ? lang : 'fr';
  }

  function dialectsFor(language) {
    var lang = normalizeLanguage(language);
    return DIALECTS_BY_LANGUAGE[lang] || DIALECTS_BY_LANGUAGE.fr;
  }

  function defaultDialectFor(language) {
    var lang = normalizeLanguage(language);
    return DEFAULT_DIALECT_BY_LANGUAGE[lang] || 'qc';
  }

  function dialectLabelsFor(language) {
    var list = dialectsFor(language);
    var out = {};
    list.forEach(function (d) {
      out[d.key] = d.label;
    });
    return out;
  }

  function dialectKeysFor(language) {
    return dialectsFor(language).map(function (d) {
      return d.key;
    });
  }

  function normalizeDialect(language, raw) {
    var lang = normalizeLanguage(language);
    var keys = dialectKeysFor(lang);
    var d = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    // Aliases from older / loose inputs
    if (lang === 'fr') {
      if (d === 'quebec' || d === 'québécois' || d === 'quebecois' || d === 'fr-ca' || d === 'fr_ca') {
        d = 'qc';
      } else if (d === 'france' || d === 'fr-fr' || d === 'fr_fr' || d === 'metropolitan') {
        d = 'fr';
      } else if (d === 'belgium' || d === 'belgique' || d === 'fr-be' || d === 'fr_be') {
        d = 'be';
      } else if (d === 'switzerland' || d === 'suisse' || d === 'fr-ch' || d === 'fr_ch') {
        d = 'ch';
      }
    } else if (lang === 'en') {
      if (d === 'american' || d === 'en-us' || d === 'en_us' || d === 'usa') {
        d = 'us';
      } else if (d === 'british' || d === 'en-gb' || d === 'en_gb' || d === 'england') {
        d = 'uk';
      } else if (d === 'canadian' || d === 'en-ca' || d === 'en_ca') {
        d = 'ca';
      }
    }
    if (keys.indexOf(d) !== -1) return d;
    return defaultDialectFor(lang);
  }

  function dialectLabel(language, dialect) {
    var lang = normalizeLanguage(language);
    var d = normalizeDialect(lang, dialect);
    var labels = dialectLabelsFor(lang);
    return labels[d] || d;
  }

  /**
   * Short language/dialect instruction for specialist AI prompts
   * (interview, subtasks, status brief, memory scan, etc.).
   */
  function languageInstruction(profile) {
    var p = normalizeProfile(profile || {});
    var dialect = p.dialect;
    var label = dialectLabel(p.language, dialect);
    if (p.language === 'en') {
      if (dialect === 'uk') {
        return (
          'Language: British English (UK). Prefer UK spelling and wording ' +
          '(colour, organise, flat, fortnight) over US variants, ' +
          'unless the user clearly writes in French or another variety.'
        );
      }
      if (dialect === 'ca') {
        return (
          'Language: Canadian English. Prefer Canadian spelling and wording ' +
          '(mix of UK/US norms common in Canada), ' +
          'unless the user clearly writes in French or another variety.'
        );
      }
      return (
        'Language: American English (US). Prefer US spelling and wording ' +
        '(color, organize, apartment), ' +
        'unless the user clearly writes in French or another variety.'
      );
    }
    if (dialect === 'qc') {
      return (
        'Langue\u00a0: français québécois. Utilise le vocabulaire du Québec ' +
        '(ex. «\u00a0sabler le plâtre\u00a0» et non «\u00a0poncer le plâtre\u00a0»). ' +
        'Préfère les termes québécois aux équivalents de France quand les deux existent, ' +
        'sauf si l\'utilisateur écrit clairement en anglais ou dans un autre français.'
      );
    }
    if (dialect === 'be') {
      return (
        'Langue\u00a0: français de Belgique (' +
        label +
        '). Adapte le vocabulaire belge courant quand pertinent, ' +
        'sauf si l\'utilisateur écrit clairement en anglais ou autrement.'
      );
    }
    if (dialect === 'ch') {
      return (
        'Langue\u00a0: français de Suisse (' +
        label +
        '). Adapte le vocabulaire suisse courant quand pertinent, ' +
        'sauf si l\'utilisateur écrit clairement en anglais ou autrement.'
      );
    }
    return (
      'Langue\u00a0: français de France. Vocabulaire métropolitain standard, ' +
      'sauf si l\'utilisateur écrit clairement en anglais ou autrement.'
    );
  }

  function normalizeFeatures(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = defaultFeatures();
    FEATURE_KEYS.forEach(function (key) {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    });
    // Keep at least one core editing surface visible.
    if (!out.priority && !out.progress && !out.due && !out.blocked) {
      out.priority = true;
    }
    return out;
  }

  function normalizeExperimental(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = defaultExperimental();
    EXPERIMENTAL_KEYS.forEach(function (key) {
      if (typeof src[key] === 'boolean') out[key] = src[key];
    });
    return out;
  }

  function normalizeProfile(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var language = normalizeLanguage(src.language);
    return {
      version: 1,
      displayName: trimStr(src.displayName, MAX_NAME),
      role: trimStr(src.role, MAX_ROLE),
      notes: trimStr(src.notes, MAX_NOTES),
      tone: normalizeTone(src.tone),
      language: language,
      dialect: normalizeDialect(language, src.dialect),
      timeFormat: normalizeTimeFormat(src.timeFormat),
      features: normalizeFeatures(src.features),
      experimental: normalizeExperimental(src.experimental),
      agentStatus: normalizeAgentStatus(src.agentStatus, src.agentDebug),
      agentName: trimStr(src.agentName, MAX_AGENT_NAME),
      agentPersonality: trimStr(src.agentPersonality, MAX_AGENT_PERSONALITY),
      agentColor: normalizeAgentColor(src.agentColor),
      agentFace: normalizeAgentFace(src.agentFace),
      debugLogging: src.debugLogging === true,
      // Default ON — only an explicit false disables auto-open.
      autoOpenCerveau: src.autoOpenCerveau !== false,
      updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : ''
    };
  }

  function isFeatureEnabled(profile, key) {
    var p = normalizeProfile(profile);
    if (FEATURE_KEYS.indexOf(key) === -1) return true;
    return p.features[key] !== false;
  }

  function isExperimentalEnabled(profile, key) {
    var p = normalizeProfile(profile);
    if (EXPERIMENTAL_KEYS.indexOf(key) === -1) return false;
    return p.experimental[key] === true;
  }

  function isDebugLoggingEnabled(profile) {
    return normalizeProfile(profile).debugLogging === true;
  }

  function isAutoOpenCerveauEnabled(profile) {
    return normalizeProfile(profile).autoOpenCerveau !== false;
  }

  function featureSelector(key) {
    switch (key) {
      case 'info':
        return '.variant-info-section';
      case 'statut':
        return '.statut-in-progress-mount, .field--statut-embedded';
      case 'objectif':
        return '.info-row--objectif, .variant-objectif-section';
      case 'priority':
        return '.variant-priority-section';
      case 'graph':
        return '.calc-graph-section';
      case 'progress':
        return '.variant-progress-section';
      case 'due':
        return '.variant-due-section';
      case 'blocked':
        // Nested under Progrès → Statut (reasons panel shown when status is Bloqué).
        return '.statut-blocked-panel';
      case 'assistant':
        return '.variant-chat-section';
      default:
        return null;
    }
  }

  /**
   * Show/hide card-editor sections according to profile.features
   * and experimental flags (e.g. Objectif).
   * Safe to call repeatedly after mounts complete.
   */
  function applyFeaturesToCard(cardEl, profile) {
    if (!cardEl || !cardEl.querySelector) return;
    var p = normalizeProfile(profile);
    FEATURE_KEYS.forEach(function (key) {
      var sel = featureSelector(key);
      if (!sel) return;
      // Statut nests under Progrès: keep the Progrès shell when Statut is on.
      if (key === 'progress') {
        var completionOnly = cardEl.querySelectorAll(
          '#completionMount, .tp-completion'
        );
        if (p.features.progress === false && p.features.statut !== false) {
          var progressShell = cardEl.querySelectorAll(sel);
          for (var ps = 0; ps < progressShell.length; ps++) {
            progressShell[ps].hidden = false;
          }
          for (var c = 0; c < completionOnly.length; c++) {
            completionOnly[c].hidden = true;
          }
          return;
        }
        for (var cu = 0; cu < completionOnly.length; cu++) {
          completionOnly[cu].hidden = p.features.progress === false;
        }
      }
      var nodes = cardEl.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].hidden = p.features[key] === false;
      }
    });
    var objectifSel = featureSelector('objectif');
    if (objectifSel) {
      var objectifOn = p.experimental.objectif === true;
      var objectifNodes = cardEl.querySelectorAll(objectifSel);
      for (var j = 0; j < objectifNodes.length; j++) {
        objectifNodes[j].hidden = !objectifOn;
      }
    }
    var porteOn = p.experimental.impactGlobe === true;
    var porteNodes = cardEl.querySelectorAll('.info-row--porte');
    for (var pIdx = 0; pIdx < porteNodes.length; pIdx++) {
      porteNodes[pIdx].hidden = !porteOn;
    }
    // Durée (Facilité) retired — estimates live under Progrès.
    var dureeNodes = cardEl.querySelectorAll('.info-row--duree');
    for (var d = 0; d < dureeNodes.length; d++) {
      dureeNodes[d].hidden = true;
    }
  }

  /** Compact object for LLM context (no storage metadata). */
  function toAgentContext(profile) {
    var p = normalizeProfile(profile);
    return {
      displayName: p.displayName || null,
      role: p.role || null,
      notes: p.notes || null,
      tone: p.tone,
      language: p.language,
      dialect: p.dialect,
      timeFormat: p.timeFormat,
      features: p.features,
      experimental: p.experimental,
      agentName: p.agentName || null,
      agentPersonality: p.agentPersonality || null,
      agentColor: p.agentColor || null,
      agentFace: p.agentFace || 'classic'
    };
  }

  function profilePromptLines(profile) {
    var p = normalizeProfile(profile);
    var lines = [];
    if (p.agentName || p.agentPersonality || p.agentColor) {
      lines.push('Identité de l\'assistant (membre — respecter jusqu\'à changement)\u00a0:');
      if (p.agentName) {
        lines.push(
          '- Tu t\'appelles ' +
            p.agentName +
            '. Présente-toi ainsi. Ce n\'est pas un surnom temporaire, MAIS l\'utilisateur peut te renommer\u00a0: dans ce cas utilise set_agent_name (ne refuse JAMAIS un changement de nom).'
        );
      }
      if (p.agentColor) {
        var colorLabel = AGENT_COLOR_LABELS[p.agentColor] || p.agentColor;
        lines.push(
          '- Couleur d\'identité\u00a0: ' +
            colorLabel +
            ' (`' +
            p.agentColor +
            '`). Utilise cette couleur pour ton avatar (champ "color") sauf exception brève liée à l\'humeur. L\'utilisateur peut changer ta couleur d\'identité\u00a0: utilise set_agent_color (ne refuse JAMAIS).'
        );
      }
      if (p.agentPersonality) {
        lines.push(
          '- Personnalité / character\u00a0: ' +
            p.agentPersonality +
            '. Incarne ce trait dans le ton et les réactions, sans perdre la voix d\'ami snarky-doux mais très hopeful (pas un coach productivité). L\'utilisateur peut la modifier\u00a0: utilise set_agent_personality (ne refuse JAMAIS).'
        );
      }
    }
    lines.push('Profil utilisateur (préférences personnelles — respecter)\u00a0:');
    if (p.displayName) {
      lines.push('- Prénom / nom\u00a0: ' + p.displayName + '. Adresse-le ainsi quand c\'est naturel.');
    }
    if (p.role) {
      lines.push('- Rôle\u00a0: ' + p.role + '. Adapte le vocabulaire à ce contexte — sans pousser le travail.');
    }
    if (p.notes) {
      lines.push('- Notes / préférences\u00a0: ' + p.notes);
    }
    lines.push('- ' + languageInstruction(p));
    if (p.language === 'fr' && p.dialect === 'qc') {
      lines.push(
        '- Dialecte (critique)\u00a0: français québécois. Vocabulaire régional obligatoire quand un équivalent France existe ' +
          '(ex. «\u00a0sabler le plâtre\u00a0» pas «\u00a0poncer le plâtre\u00a0»; «\u00a0magasinage\u00a0» plutôt que «\u00a0shopping\u00a0» forcé; ' +
          '«\u00a0fin de semaine\u00a0» plutôt que «\u00a0week-end\u00a0» si naturel). Ne «\u00a0corrige\u00a0» pas vers le français de France.'
      );
    } else if (p.language === 'fr' && p.dialect === 'fr') {
      lines.push(
        '- Dialecte\u00a0: français de France (métropolitain). Vocabulaire standard de France.'
      );
    } else if (p.language === 'fr' && p.dialect === 'be') {
      lines.push('- Dialecte\u00a0: français de Belgique. Adapte les tournures belges quand c\'est naturel.');
    } else if (p.language === 'fr' && p.dialect === 'ch') {
      lines.push('- Dialecte\u00a0: français de Suisse. Adapte les tournures suisses quand c\'est naturel.');
    } else if (p.language === 'en' && p.dialect === 'uk') {
      lines.push('- Dialect: British English (UK spelling and wording).');
    } else if (p.language === 'en' && p.dialect === 'ca') {
      lines.push('- Dialect: Canadian English.');
    } else if (p.language === 'en') {
      lines.push('- Dialect: American English (US spelling and wording).');
    }
    if (p.language === 'en') {
      lines.push(
        '- Base voice (always): close friend — gently snarky but very hopeful; natural; feelings first; zero productivity push; zero technical jargon.'
      );
      if (p.tone === 'detailed') {
        lines.push(
          '- Length: a bit more detailed (explain calmly, still warm teasing-friend style).'
        );
      } else if (p.tone === 'friendly') {
        lines.push(
          '- Length / warmth: even warmer and encouraging, without monologues.'
        );
      } else {
        lines.push(
          '- Length: short and direct, but still warm like chatting with a friend (not cold or telegraphic).'
        );
      }
    } else {
      lines.push(
        '- Voix de base (toujours)\u00a0: vrai pote snarky-doux mais très hopeful — tutoiement, naturel, d\'abord le ressenti, zéro push productivité, zéro jargon technique.'
      );
      if (p.tone === 'detailed') {
        lines.push(
          '- Longueur\u00a0: un peu plus détaillé (explique calmement, toujours style pote taquin).'
        );
      } else if (p.tone === 'friendly') {
        lines.push(
          '- Longueur / chaleur\u00a0: encore plus chaleureux et encourageant, sans monologue.'
        );
      } else {
        lines.push(
          '- Longueur\u00a0: court et direct, mais toujours chaleureux comme avec un ami (pas froid ni télégraphique).'
        );
      }
    }
    var enabled = [];
    FEATURE_KEYS.forEach(function (key) {
      if (p.features[key]) enabled.push(FEATURE_LABELS[key] || key);
    });
    if (enabled.length) {
      lines.push('- Fonctionnalités actives dans l\'éditeur\u00a0: ' + enabled.join(', ') + '.');
    }
    return lines;
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') {
      dbgLog('userProfile', 'load', { ok: false, reason: 'no-client' });
      return ensureAgentIdentity(emptyProfile()).profile;
    }
    var hit = cachedProfile();
    if (hit) return hit;
    if (loadCache.inflight) return loadCache.inflight;

    loadCache.inflight = (async function () {
      try {
        var stored = await t.get('member', 'private', STORAGE_KEY);
        var profile = normalizeProfile(stored);
        var ensured = ensureAgentIdentity(profile);
        if (ensured.changed && typeof t.set === 'function') {
          try {
            var saved = await save(t, ensured.profile);
            dbgLog('userProfile', 'load', { ok: true, identityPersisted: true });
            return saved;
          } catch (persistErr) {
            dbgError('userProfile', 'load', persistErr);
            console.error('UserProfile identity persist failed', persistErr);
            return rememberProfile(ensured.profile);
          }
        }
        dbgLog('userProfile', 'load', { ok: true });
        return rememberProfile(ensured.profile);
      } catch (err) {
        dbgError('userProfile', 'load', err);
        console.error('UserProfile.load failed', err);
        return rememberProfile(ensureAgentIdentity(emptyProfile()).profile);
      } finally {
        loadCache.inflight = null;
      }
    })();

    return loadCache.inflight;
  }

  async function save(t, profile) {
    if (!t || typeof t.set !== 'function') {
      dbgLog('userProfile', 'save', { ok: false, reason: 'no-client' });
      throw new Error('UserProfile.save: t.set required');
    }
    var next = normalizeProfile(profile);
    next.updatedAt = new Date().toISOString();
    await t.set('member', 'private', STORAGE_KEY, next);
    rememberProfile(next);
    dbgLog('userProfile', 'save', { ok: true });
    return next;
  }

  async function reset(t) {
    var blank = ensureAgentIdentity(emptyProfile(), {
      forceColor: true,
      forceName: true
    }).profile;
    blank.updatedAt = new Date().toISOString();
    if (t && typeof t.set === 'function') {
      await t.set('member', 'private', STORAGE_KEY, blank);
    }
    rememberProfile(blank);
    dbgLog('userProfile', 'reset', { ok: true });
    return blank;
  }

  global.UserProfile = {
    STORAGE_KEY: STORAGE_KEY,
    FEATURE_KEYS: FEATURE_KEYS,
    FEATURE_LABELS: FEATURE_LABELS,
    EXPERIMENTAL_KEYS: EXPERIMENTAL_KEYS,
    EXPERIMENTAL_LABELS: EXPERIMENTAL_LABELS,
    EXPERIMENTAL_HINTS: EXPERIMENTAL_HINTS,
    TONE_KEYS: TONE_KEYS,
    TONE_LABELS: TONE_LABELS,
    LANGUAGE_KEYS: LANGUAGE_KEYS,
    LANGUAGE_LABELS: LANGUAGE_LABELS,
    DIALECTS_BY_LANGUAGE: DIALECTS_BY_LANGUAGE,
    DEFAULT_DIALECT_BY_LANGUAGE: DEFAULT_DIALECT_BY_LANGUAGE,
    dialectsFor: dialectsFor,
    dialectKeysFor: dialectKeysFor,
    dialectLabelsFor: dialectLabelsFor,
    dialectLabel: dialectLabel,
    defaultDialectFor: defaultDialectFor,
    normalizeLanguage: normalizeLanguage,
    normalizeDialect: normalizeDialect,
    languageInstruction: languageInstruction,
    TIME_FORMAT_KEYS: TIME_FORMAT_KEYS,
    TIME_FORMAT_LABELS: TIME_FORMAT_LABELS,
    AGENT_STATUS_KEYS: AGENT_STATUS_KEYS,
    AGENT_STATUS_LABELS: AGENT_STATUS_LABELS,
    AGENT_COLOR_KEYS: AGENT_COLOR_KEYS,
    AGENT_COLOR_LABELS: AGENT_COLOR_LABELS,
    AGENT_COLOR_HEX: AGENT_COLOR_HEX,
    AGENT_COLOR_PALETTES: AGENT_COLOR_PALETTES,
    AGENT_COLOR_NAMES: AGENT_COLOR_NAMES,
    AGENT_PERSONALITIES: AGENT_PERSONALITIES,
    AGENT_FACE_KEYS: AGENT_FACE_KEYS,
    AGENT_FACE_LABELS: AGENT_FACE_LABELS,
    MAX_AGENT_NAME: MAX_AGENT_NAME,
    MAX_AGENT_PERSONALITY: MAX_AGENT_PERSONALITY,
    emptyProfile: emptyProfile,
    normalizeAgentStatus: normalizeAgentStatus,
    normalizeAgentColor: normalizeAgentColor,
    parseAgentHex: parseAgentHex,
    isCustomAgentColor: isCustomAgentColor,
    agentColorHex: agentColorHex,
    agentColorPalette: agentColorPalette,
    nearestAgentColorKey: nearestAgentColorKey,
    mountAgentColorPicker: mountAgentColorPicker,
    normalizeAgentFace: normalizeAgentFace,
    normalizeProfile: normalizeProfile,
    normalizeTimeFormat: normalizeTimeFormat,
    normalizeExperimental: normalizeExperimental,
    pickRandomAgentColor: pickRandomAgentColor,
    pickRandomAgentPersonality: pickRandomAgentPersonality,
    pickAgentNameForColor: pickAgentNameForColor,
    isStockAgentName: isStockAgentName,
    ensureAgentIdentity: ensureAgentIdentity,
    isFeatureEnabled: isFeatureEnabled,
    isExperimentalEnabled: isExperimentalEnabled,
    isDebugLoggingEnabled: isDebugLoggingEnabled,
    isAutoOpenCerveauEnabled: isAutoOpenCerveauEnabled,
    applyFeaturesToCard: applyFeaturesToCard,
    toAgentContext: toAgentContext,
    profilePromptLines: profilePromptLines,
    load: load,
    save: save,
    reset: reset
  };
})(typeof window !== 'undefined' ? window : this);
