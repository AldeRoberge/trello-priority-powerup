# Synchronisation Google Sheets ↔ Trello

Un Google Sheet lié dans les deux sens à un tableau Trello, plus une vue **Table** dans Trello
(bouton à côté de **Gantt**) qui ressemble à un tableur : édition des cellules, réordonnancement,
bouton **Afficher dans Google Sheet**.

- Vous modifiez une carte dans Trello → la ligne du Sheet est mise à jour en quelques secondes (webhook Trello).
- Vous modifiez une cellule du Sheet → la carte est mise à jour en environ une minute (le Worker relit le Sheet chaque minute).
- Une ligne ajoutée au Sheet (avec un « Objet ») crée une carte ; une carte archivée dans Trello retire sa ligne.
- En cas de modification simultanée du même champ des deux côtés, **Trello gagne** (le conflit est noté dans l’onglet caché `_SyncLog`).

## Architecture

```
Trello ──webhook──▶ Worker Cloudflare ◀──cron 1 min── (lit le Sheet)
   ▲                      │  ▲
   └── REST (cartes) ◀────┘  └── POST /push  ◀── vue Table (score, progrès… calculés dans le navigateur)
                          │
                          ▼
                    Google Sheet (compte de service)
```

- `workers/trello-sheet-sync/` : le Worker (JavaScript, aucune dépendance sauf `wrangler`). Il garde son état dans
  des onglets cachés du Sheet (`_SyncState`, `_Config`, `_SyncLog`) : pas de KV ni de base de données.
- `scripts/setup-sheet-sync.ps1` : installation en une commande (même approche que `vvd-smart-dashboard`).
- `table.html` + `components/table/` : la vue Table. Trello est la source de vérité de cette vue : chaque
  modification est écrite directement dans Trello, puis reflétée dans le Sheet.

## Installation

Prérequis : Node 18+, un compte Cloudflare, un compte Google, un compte Trello, et une clé API Trello dans
`components/shared/rest-config.js` (voir le README, « Configuration admin Trello »).

```bash
npm run setup:sheet-sync
```

Le script (reprenable : l’état est dans `workers/trello-sheet-sync/.setup-state.json`, `-Reset` recommence) :

1. installe les dépendances du Worker ;
2. `wrangler login` (Cloudflare) si nécessaire ;
3. ouvre la page d’autorisation Trello (collez le jeton une fois) et vous fait choisir le tableau ;
4. crée un projet Google Cloud, active les API Sheets/Drive, crée un compte de service, **crée la feuille sous votre compte
   Google** et la partage avec le compte de service (installe `gcloud` sans droits admin s’il manque) ;
5. déploie le Worker et envoie les secrets avec `wrangler secret bulk` ;
6. enregistre le webhook Trello et lance la première synchronisation ;
7. génère un **code de connexion** (copié dans le presse-papiers).

Ensuite, dans Trello : **Paramètres du Cerveau → Google Sheets** (ou le bouton *Connecter Google Sheets* de la vue Table)
→ collez le code → **Connecter**.

## Colonnes personnalisables

Bouton **Colonnes** de la vue Table : cocher/décocher et réordonner. Le même choix s’applique à l’onglet `Tasks` du Sheet
(le Worker réorganise l’onglet en conservant les valeurs).

| Colonne | Sens | Notes |
|---------|------|-------|
| Catégorie | ⇄ | champ personnalisé texte « Catégorie » (créé au besoin ; nécessite le Power-Up *Custom Fields*) |
| Objet | ⇄ | titre de la carte |
| Statut | ⇄ | liste de la carte ; menu déroulant dans le Sheet |
| Description | ⇄ | partie visible seulement ; les métadonnées cachées de Cerveau sont préservées |
| Urgence, Impact et besoin, Priorité, Palier, Progrès | Trello → Sheet | calculés par le Power-Up dans le navigateur, poussés quand la vue Table est ouverte |
| Échéance, Carte | Trello → Sheet | lecture seule |

La colonne A (`TrelloCardId`) est cachée : c’est la clé de jointure, ne la supprimez pas.

## Limites

- Sheet → Trello : délai d’environ une minute (Google Sheets n’offre pas de notification sans Apps Script).
- Priorité, Progrès, Urgence… ne se rafraîchissent dans le Sheet que lorsque la vue Table (ou le bouton *Synchroniser*) est utilisée : seul le navigateur sait calculer ces valeurs.
- Un tableau par Sheet. Supprimer une ligne du Sheet ne supprime pas la carte : la ligne réapparaît. Archivez dans Trello (ou avec ✕ dans la Table).
- Une ligne dont l’« Objet » est rempli devient une carte à la prochaine minute : terminez votre saisie avant.
- Le jeton Trello du Worker et le secret de synchronisation sont des secrets Cloudflare ; le secret est aussi stocké dans les données partagées du tableau (visibles des membres du tableau).

## Dépannage

| Symptôme | Piste |
|----------|-------|
| `403` à la création du Sheet | attendre 1–2 min (propagation Google) : le script réessaie ; sinon `gcloud auth login --enable-gdrive-access` |
| La table dit « Autoriser Trello » | bouton dans la bannière : la vue Table écrit avec votre jeton Power-Up |
| Le Sheet ne suit pas Trello | `npx wrangler tail` dans `workers/trello-sheet-sync` ; vérifier le webhook (`POST /webhook/register` avec l’en-tête `x-sync-secret`) |
| Erreur CORS depuis Trello | `ALLOWED_ORIGINS` doit être l’origine du Power-Up (ex. `https://VOTRE-UTILISATEUR.github.io`) : `npx wrangler secret put ALLOWED_ORIGINS` dans `workers/trello-sheet-sync` |
| Colonne Catégorie vide | activer le Power-Up *Champs personnalisés* sur le tableau |
