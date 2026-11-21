# /work : le Cerveau sans Trello

`https://alderoberge.com/work/` ouvre les vues du Cerveau directement (Dashboard, Tableau, Kanban, Gantt, Mindmap, Documents...), sans ouvrir Trello, la carte puis le Power-Up. Même principe que `/storage` : un Worker Cloudflare sur une route du domaine, connexion Google, seules les adresses autorisées entrent.

## Comment ça marche

```
navigateur ──▶ alderoberge.com/work/*  (Worker trello-sheet-sync)
                 ├─ pages et scripts : lus sur GitHub Pages, la page remplace power-up.min.js par /work/sdk.js
                 ├─ /work/api/rpc, /data   données du Power-Up (Durable Object, SQLite)
                 ├─ /work/api/trello/1/*   API REST Trello (clé et jeton ajoutés par le Worker)
                 └─ /work/api/sheet/*      synchro Google Sheet (la session remplace le secret partagé)
```

- Les vues ne changent pas. `components/work/work-sdk.js` joue le rôle de `TrelloPowerUp.iframe()` : `t.get/t.set` lisent une copie en mémoire chargée en une requête (donc instantanés), `t.board/t.cards` passent par le Worker (cache 20 s), les fenêtres (`t.modal`, `t.popup`) sont dessinées par la page.
- **Données du Power-Up** (score, statut, sous-tâches, réglages) : l'API REST de Trello ne peut pas les écrire, seul l'iframe du Power-Up le peut. `/work` les garde donc dans un Durable Object. Au premier accès, tout ce qui existe dans Trello y est copié (sans jamais écraser).
- **Cartes** (titre, description, échéance, liste, étiquettes, membres) : écrites dans Trello. Le webhook existant met ensuite le Google Sheet à jour, comme avant. Une modification faite dans Trello ou le Sheet apparaît dans `/work` au prochain chargement (le cache dure 20 s au maximum).
- **Limite actuelle** : le Power-Up *dans* Trello continue de lire les données de Trello. Ce que vous changez dans `/work` (score, statut...) n'y apparaît pas encore. Le Worker expose déjà `GET /work/api/changes?since=` pour le rattrapage.

## Installation (une fois)

Prérequis : `npm run setup:sheet-sync` déjà fait (Trello et Google Sheet), le domaine `alderoberge.com` sur le même compte Cloudflare.

```powershell
npm run setup:work
```

Le script demande l'ID client et le secret d'un client OAuth Google (type « Application Web ») et les adresses autorisées, déploie le Worker et enregistre les secrets. Ajoutez l'URI de redirection `https://alderoberge.com/work/api/auth/google/callback` à ce client (on peut réutiliser celui de `/storage`).

Mettre à jour le Worker après un changement dans `workers/` : `npm --prefix workers/trello-sheet-sync run deploy`. Les pages, elles, se mettent à jour à chaque push sur `main` (GitHub Pages).

## Essayer en local, sans rien de réel

```powershell
npm run dev:work
```

Ouvre un faux Trello et `wrangler dev` sur http://localhost:8787/work/ ; la connexion Google est remplacée par un utilisateur de développement (accepté seulement quand le Worker pointe vers un faux Trello local).

## Sécurité

- Cookie de session `work_session` (HttpOnly, limité à `/work`), 60 jours. La liste `WORK_ALLOWED_EMAILS` est revérifiée à chaque requête.
- Le navigateur ne voit jamais la clé ni le jeton Trello. Le relais refuse les chemins `tokens`, `webhooks` et `organizations`.
- Toute écriture exige que l'en-tête `Origin` soit le site lui-même.

## /life : même chose pour le tableau Home

`https://alderoberge.com/life/` est le même Worker et les mêmes pages, branchés sur le tableau Trello Home (`LIFE_BOARD_ID` dans `wrangler.jsonc`, `oESYPwNf` par défaut). Il a ses propres données (une 2e instance du Durable Object), son propre cookie `life_session` (limité à `/life`) et la même liste `WORK_ALLOWED_EMAILS`. La synchro Google Sheet reste pour `/work` seulement.

Après le déploiement du Worker, ajoutez l'URI de redirection `https://alderoberge.com/life/api/auth/google/callback` au client OAuth Google.
