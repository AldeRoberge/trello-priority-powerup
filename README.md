# Trello Cerveau

Un Power-Up Trello pour décider quoi faire en premier : priorité urgence / impact / facilité, sous-tâches, Gantt, Kanban, Documents et un assistant IA, directement dans vos tableaux.

> Tu as toujours plein de grandes choses à faire, mais si peu de temps? Avec un système qui fonctionne, tu passes moins de temps à faire des listes et plus de temps à profiter de la vie.
>
> *You always have so much to do and so little time? A system that works means less list-making, more living.*

<img width="683" alt="Priorité paramétrable" src="https://github.com/user-attachments/assets/0da7cae6-93db-4483-8617-33133fa6750a" />

## Fonctionnalités

- **Priorité sur trois axes** : urgence (0–4), impact (0–4), facilité (1–5). Un score de 0 à 10 et un palier (Critique, Urgent…) s'affichent en badge sur la carte.
- **Tri par priorité** d'une liste, ou automatique à chaque changement.
- **Sous-tâches et progression**, échéances précises, historique avec annulation.
- **Vues plein écran** : Table, Gantt, Kanban, Mindmap, Documents, Tableau de bord.
- **Documents** : éditeur avec mentions `@` personne, `@@` tâche, `@@@` document, enregistré dans Trello ([docs/documents.md](docs/documents.md)).
- **Assistant IA** (ChatGPT ou OpenRouter) qui connaît vos cartes.
- **Synchronisations optionnelles** : Outlook ([docs/outlook-entra-setup.md](docs/outlook-entra-setup.md)) et Google Sheets ([docs/sheet-sync.md](docs/sheet-sync.md)).

| Gantt | Sous-tâches |
|---|---|
| <img src="https://github.com/user-attachments/assets/77dc05b3-f739-4e18-90ea-f505b07f8ca1" /> | <img src="https://github.com/user-attachments/assets/896ce1d3-6e74-4ad0-81e0-b03866aa6907" /> |

## Démarrage rapide

Le Power-Up est un site statique (HTML/JS/CSS, aucune étape de build) hébergé sur GitHub Pages.

1. **Forker** ce dépôt, puis dans *Settings → Pages* choisir **Source : GitHub Actions**. Chaque push sur `main` déploie le site.
2. Sur [trello.com/power-ups/admin](https://trello.com/power-ups/admin), créer un Power-Up avec l'URL de connecteur `https://VOTRE-UTILISATEUR.github.io/trello-priority-powerup/index.html`.
3. Activer les capacités `card-badges`, `card-detail-badges`, `card-back-section`, `board-buttons`, `list-sorters` et `on-enable`.
4. Ajouter le Power-Up à un tableau.

Le détail (clé API, tri automatique, capacités, dépannage) est dans [docs/trello-setup.md](docs/trello-setup.md). Pour automatiser les étapes 1 et 2, voir `scripts/setup.ps1` (Windows) ou `scripts/setup.sh`.

## Développement

Prérequis : Node.js 18 ou plus.

```bash
npm run dev           # serveur local
npm run test:unit     # tests unitaires
npm test              # tests unitaires + vérifications sandbox
npm run test:coverage # avec couverture
```

La suite `npm test` et `npm run verify` incluent `verify:presets`, qui nécessite Windows (`cscript`).

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Connecteur du Power-Up |
| `popup.html`, `settings.html`, `profile.html`, `card-open.html` | Modals de la carte et du tableau |
| `table.html`, `gantt.html`, `kanban.html`, `mindmap.html`, `docs.html`, `dashboard.html`, `entities.html` | Vues plein écran |
| `components/` | Code par domaine (JS + CSS côte à côte) ; `shared/` pour le code commun |
| `workers/trello-sheet-sync/` | Worker Cloudflare pour la synchro Google Sheets |
| `docs/` | Guides de configuration et notes de conception |
| `scripts/` | Serveur de dev, lanceurs de tests, scripts de configuration, horodatage du build |
| `sandbox/` | Prototypes et scripts de vérification, non déployés |
| `test/` | Tests unitaires |

## Contribuer

1. Ouvrir une issue pour discuter du changement.
2. Faire passer `npm test` (ou au moins `npm run test:unit`) et ajouter un test pour toute logique modifiée.
3. Ajouter une ligne en français dans [CHANGELOG.md](CHANGELOG.md) pour tout changement visible.
4. Ouvrir une pull request.

L'interface est en français (Québec).

## Licence

[GNU GPL v3](LICENSE)
