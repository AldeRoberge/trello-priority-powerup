/* Strings for the landing-page install guide (fr / en).
 * Values are trusted static HTML (they may contain <strong>, <code>, <a>, data-bind spans). */
(function (global) {
  'use strict';

  var fr = {
    versionLabel: 'Version déployée',
    title: 'Guide d’installation',
    intro:
      '<strong data-bind="appName"></strong> n’est pas (encore) dans le répertoire officiel des Power-Ups : vous l’ajoutez à votre compte en quelques minutes avec un Power-Up « personnalisé » hébergé sur GitHub Pages.',
    cfgTitle: 'Votre installation',
    cfgHint: 'Cliquez sur une valeur pour la modifier. Tout le guide s’adapte.',
    cfgAppName: 'Nom de l’application',
    cfgOwner: 'Compte GitHub',
    cfgRepo: 'Nom du dépôt',
    cfgAuthor: 'Nom d’auteur',
    cfgAppKey: 'Clé d’API Trello (optionnel)',
    cfgSite: 'Site',
    reset: 'Réinitialiser',
    copy: 'Copier',
    copied: 'Copié',
    optional: 'optionnel',
    automatable: 'automatisable',
    s1Title: 'Créer votre copie du code',
    s1Body:
      'Ce script crée le dépôt <code data-bind="repo"></code> sur votre compte GitHub, y met le nom <strong data-bind="appName"></strong>, active GitHub Pages, attend la mise en ligne, puis vous guide dans Trello (créer le Power-Up lui-même ne peut pas être scripté). Il nécessite <a href="https://cli.github.com/" target="_blank" rel="noopener">GitHub CLI</a> et Git.',
    tabPs: 'PowerShell (Windows)',
    tabSh: 'Bash (macOS / Linux)',
    s1Note:
      'Vous préférez tout faire à la main ? Sautez cette étape : forkez <a data-href-path="" href="https://github.com/AldeRoberge/trello-priority-powerup" target="_blank" rel="noopener">le dépôt d’origine</a>, activez Pages (source : GitHub Actions), puis suivez les étapes suivantes.',
    s2Title: 'Créer le Power-Up dans Trello',
    s2a: 'Ouvrez <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener">trello.com/power-ups/admin</a> (connecté à votre compte Trello).',
    s2b: 'Cliquez sur <strong>Create new Power-Up</strong>.',
    s2c: 'Nom : <strong data-bind="appName"></strong>. Choisissez votre espace de travail (workspace), renseignez un courriel de contact et un nom d’auteur.',
    s2d: 'Dans <strong>Iframe connector URL</strong>, collez l’adresse ci-dessous :',
    s2e: 'Créez ensuite le Power-Up.',
    s3Title: 'Activer les six capacités',
    s3a: 'Dans l’onglet <strong>Capabilities</strong>, cochez <strong>uniquement</strong> :',
    s3b: 'Ne cochez pas <code>card-buttons</code>, <code>list-actions</code> ni <code>on-disable</code>. Enregistrez.',
    s4Title: 'Ajouter le Power-Up à un tableau',
    s4a: 'Ouvrez le tableau Trello où vous voulez l’utiliser.',
    s4b: 'Menu du tableau → <strong>Power-Ups</strong> → <strong>Ajouter des Power-Ups</strong> → onglet <strong>Custom</strong>.',
    s4c: 'Trouvez <strong data-bind="appName"></strong> et cliquez sur <strong>Ajouter</strong>. Une fenêtre de bienvenue s’affiche.',
    s4note:
      'Si des fonctions manquent (badge, entrée « Priorité » dans <em>Trier par…</em>), retirez le Power-Up du tableau, rechargez la page Trello puis ajoutez-le de nouveau.',
    s5Title: 'Définir une première priorité',
    s5a: 'Ouvrez une carte : la fenêtre <strong>Cerveau</strong> s’ouvre. Réglez l’<strong>urgence</strong>, l’<strong>impact</strong> et la <strong>facilité</strong> avec les curseurs (ou touchez un palier sur la barre de chaleur). Le score et le palier (ex. <code>7.9 · Urgent</code>) apparaissent en badge sur la carte.',
    s5b: 'Pour trier une colonne : menu <code>…</code> de la liste → <strong>Trier par…</strong> → <strong>Priorité</strong>.',
    s6Title: 'Personnaliser',
    s6a: 'Le bouton <strong>Paramètres du Cerveau</strong> (menu du tableau) donne accès à :',
    s6b: '<strong>Mon profil</strong> : langue, ton de l’assistant, sections visibles dans l’éditeur.',
    s6c: '<strong>Assistant IA</strong> : compatible OpenAI et OpenRouter — vous fournissez votre propre clé, stockée en privé sur votre compte Trello.',
    s6d: '<strong>Statuts</strong> : associer vos listes à des catégories (à faire, en cours, terminé…).',
    s6e: '<strong>Gantt</strong> (bêta) : vue chronologique du tableau à partir des dates de début et d’échéance.',
    s7Title: 'Fonctions avancées',
    s7a: '<strong>Tri automatique</strong> : réordonne la carte dès que sa priorité change. Nécessite votre propre copie du dépôt avec votre <code>appKey</code> dans <code>rest-config.js</code>, l’onglet <strong>API Key</strong> du Power-Up (avec votre domaine dans <em>Allowed origins</em>), puis <strong>Autoriser Trello</strong> dans les paramètres.',
    s7b: '<strong>Synchronisation Outlook</strong> : <a data-href-path="docs/outlook-entra-setup.md" target="_blank" rel="noopener">Entra</a>, <a data-href-path="docs/outlook-power-automate.md" target="_blank" rel="noopener">Power Automate</a> ou <a data-href-path="docs/outlook-ics-export.md" target="_blank" rel="noopener">export .ics</a>.',
    s7c: '<strong>Google Sheets</strong> : <a data-href-path="docs/google-sheets-sync.md" target="_blank" rel="noopener">guide de synchronisation</a>.',
    tsTitle: 'Dépannage',
    ts1: 'Le Power-Up n’apparaît pas dans <strong>Custom</strong> : vérifiez qu’il est créé dans le même espace de travail que le tableau.',
    ts2: 'Trello affiche une erreur au chargement : l’URL du connecteur doit se terminer par <code>/index.html</code> et s’ouvrir dans le navigateur.',
    ts3: 'Badge ou bouton absent : vérifiez les six capacités, puis retirez et réajoutez le Power-Up.',
    ts4: '« Priorité » absent de <em>Trier par…</em> : ouvrez le menu <code>…</code> de la <strong>liste</strong> (pas du tableau) et confirmez que <code>list-sorters</code> est coché.',
    footer: '<a data-href-path="" target="_blank" rel="noopener">Code source sur GitHub</a>',
  };

  var en = {
    versionLabel: 'Deployed version',
    title: 'Setup guide',
    intro:
      '<strong data-bind="appName"></strong> is not (yet) in the official Power-Up directory: you add it to your account in a few minutes as a “custom” Power-Up hosted on GitHub Pages.',
    cfgTitle: 'Your setup',
    cfgHint: 'Click a value to edit it. The whole guide updates.',
    cfgAppName: 'App name',
    cfgOwner: 'GitHub account',
    cfgRepo: 'Repository name',
    cfgAuthor: 'Author name',
    cfgAppKey: 'Trello API key (optional)',
    cfgSite: 'Site',
    reset: 'Reset',
    copy: 'Copy',
    copied: 'Copied',
    optional: 'optional',
    automatable: 'automatable',
    s1Title: 'Create your copy of the code',
    s1Body:
      'This script creates the <code data-bind="repo"></code> repository on your GitHub account, sets the name <strong data-bind="appName"></strong>, turns on GitHub Pages, waits for the site to go live, then walks you through Trello (creating the Power-Up itself cannot be scripted). It needs <a href="https://cli.github.com/" target="_blank" rel="noopener">GitHub CLI</a> and Git.',
    tabPs: 'PowerShell (Windows)',
    tabSh: 'Bash (macOS / Linux)',
    s1Note:
      'Prefer doing it by hand? Skip this step: fork <a data-href-path="" href="https://github.com/AldeRoberge/trello-priority-powerup" target="_blank" rel="noopener">the original repository</a>, enable Pages (source: GitHub Actions), then follow the next steps.',
    s2Title: 'Create the Power-Up in Trello',
    s2a: 'Open <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener">trello.com/power-ups/admin</a> (signed in to your Trello account).',
    s2b: 'Click <strong>Create new Power-Up</strong>.',
    s2c: 'Name: <strong data-bind="appName"></strong>. Pick your workspace, enter a contact email and an author name.',
    s2d: 'In <strong>Iframe connector URL</strong>, paste the address below:',
    s2e: 'Then create the Power-Up.',
    s3Title: 'Enable the six capabilities',
    s3a: 'In the <strong>Capabilities</strong> tab, tick <strong>only</strong>:',
    s3b: 'Do not tick <code>card-buttons</code>, <code>list-actions</code> or <code>on-disable</code>. Save.',
    s4Title: 'Add the Power-Up to a board',
    s4a: 'Open the Trello board where you want to use it.',
    s4b: 'Board menu → <strong>Power-Ups</strong> → <strong>Add Power-Ups</strong> → <strong>Custom</strong> tab.',
    s4c: 'Find <strong data-bind="appName"></strong> and click <strong>Add</strong>. A welcome window appears.',
    s4note:
      'If features are missing (badge, the “Priorité” entry under <em>Sort by…</em>), remove the Power-Up from the board, reload the Trello page, then add it again.',
    s5Title: 'Set a first priority',
    s5a: 'Open a card: the <strong>Cerveau</strong> window opens. Set <strong>urgency</strong>, <strong>impact</strong> and <strong>ease</strong> with the sliders (or tap a tier on the heat bar). The score and tier (e.g. <code>7.9 · Urgent</code>) show as a badge on the card.',
    s5b: 'To sort a column: list <code>…</code> menu → <strong>Sort by…</strong> → <strong>Priorité</strong>.',
    s6Title: 'Customize',
    s6a: 'The <strong>Paramètres du Cerveau</strong> button (board menu) gives access to:',
    s6b: '<strong>My profile</strong>: language, assistant tone, sections shown in the editor.',
    s6c: '<strong>AI assistant</strong>: works with OpenAI and OpenRouter — you bring your own key, stored privately on your Trello account.',
    s6d: '<strong>Statuses</strong>: map your lists to categories (to do, in progress, done…).',
    s6e: '<strong>Gantt</strong> (beta): board timeline built from start and due dates.',
    s7Title: 'Advanced features',
    s7a: '<strong>Auto-sort</strong>: reorders the card as soon as its priority changes. Needs your own copy of the repo with your <code>appKey</code> in <code>rest-config.js</code>, the Power-Up <strong>API Key</strong> tab (with your domain in <em>Allowed origins</em>), then <strong>Authorize Trello</strong> in the settings.',
    s7b: '<strong>Outlook sync</strong>: <a data-href-path="docs/outlook-entra-setup.md" target="_blank" rel="noopener">Entra</a>, <a data-href-path="docs/outlook-power-automate.md" target="_blank" rel="noopener">Power Automate</a> or <a data-href-path="docs/outlook-ics-export.md" target="_blank" rel="noopener">.ics export</a>.',
    s7c: '<strong>Google Sheets</strong>: <a data-href-path="docs/google-sheets-sync.md" target="_blank" rel="noopener">sync guide</a>.',
    tsTitle: 'Troubleshooting',
    ts1: 'The Power-Up is missing from <strong>Custom</strong>: check that it was created in the same workspace as the board.',
    ts2: 'Trello shows an error on load: the connector URL must end with <code>/index.html</code> and open in the browser.',
    ts3: 'Badge or button missing: check the six capabilities, then remove and re-add the Power-Up.',
    ts4: '“Priorité” missing from <em>Sort by…</em>: open the <code>…</code> menu of the <strong>list</strong> (not the board) and confirm <code>list-sorters</code> is ticked.',
    footer: '<a data-href-path="" target="_blank" rel="noopener">Source code on GitHub</a>',
  };

  function detect(nav) {
    var l = nav && (nav.language || (nav.languages && nav.languages[0])) || '';
    return /^fr/i.test(l) ? 'fr' : 'en';
  }

  global.SetupI18n = { fr: fr, en: en, strings: { fr: fr, en: en }, detect: detect };
})(typeof window !== 'undefined' ? window : this);
