# Power Automate → Outlook (guide définitif)

Sans backend, sans Entra, sans Trello Pro. Interface Power Automate souvent en **français**.

**Important :** le connecteur Trello Microsoft **n’a pas** « quand une carte est mise à jour ». Seulement :

- **Lorsqu'une nouvelle carte est ajoutée à un tableau** (V2 ou V3)

Pour les modifications ensuite → un **2ᵉ flux planifié** (récurrence).

---

## Flux A — Nouvelle carte → événement Outlook

### 1. Créer le flux

1. [make.powerautomate.com](https://make.powerautomate.com)
2. **Créer** → **Flux de cloud automatisé**
3. Nom : `Trello nouvelle carte → Outlook`
4. Déclencheur : **Trello** → **Lorsqu'une nouvelle carte est ajoutée à un tableau** (V2/V3)
5. Choisir votre **tableau**

### 2. Condition échéance

**Condition** : Date d’échéance / `due` **n’est pas égale à** *(vide)*.

Continuer seulement dans **Si oui**.

### 3. Créer l’événement

**Outlook.com** ou **Office 365 Outlook** → **Créer un événement (V4)**

| Champ | Valeur |
|--------|--------|
| Calendrier | Votre calendrier (obligatoire) |
| Objet | Nom de la carte (contenu dynamique) |
| Journée entière | Oui (plus simple) |
| **Début** | Expression ci‑dessous |
| **Fin** | Expression ci‑dessous |

**Début** (expression) :

```text
formatDateTime(triggerOutputs()?['body/due'], 'yyyy-MM-dd')
```

**Fin** (lendemain, journée entière) :

```text
formatDateTime(addDays(triggerOutputs()?['body/due'], 1), 'yyyy-MM-dd')
```

Ne pas coller `due` brut (erreur `date-time` vs `date-no-tz`).

### 4. Variable EventId (hors condition)

**Important :** **Initialiser une variable** doit être **à la racine** du flux (juste après le déclencheur), **pas** dans la Condition.

1. Après le déclencheur, **avant** la Condition : **Variables** → **Initialiser une variable**
   - Nom : `EventId`
   - Type : Chaîne
   - Valeur : *(vide)*
2. **Dans** Si oui, **après** Créer un événement : **Variables** → **Définir une variable**
   - Nom : `EventId`
   - Valeur : **Contenu dynamique** → Id de Créer un événement

### 5. Écrire l’id dans la description Trello

**Trello** → **Mettre à jour une carte** (toujours dans Si oui, après Définir la variable)

- Carte : id de la carte du déclencheur  
- Description (expression) :

```text
concat(
  coalesce(triggerOutputs()?['body/desc'], ''),
  '

[outlook-event-id]: ',
  variables('EventId')
)
```

Cerveau masquera cette ligne dans le popup (**Afficher les métadonnées masquées**).

### 6. Enregistrer et activer

---

## Flux B — Mise à jour continue (dates / titre)

Trello n’envoie pas « carte modifiée » à Automate. Ce flux **regarde le tableau régulièrement** et pousse les changements vers Outlook.

### 1. Créer le flux planifié

1. **Créer** → **Flux de cloud planifié** (Scheduled cloud flow)
2. Nom : `Trello → Outlook (sync horaire)`
3. Récurrence : toutes les **15 minutes** ou **1 heure** (plus fréquent = plus de runs)

### 2. Variables à la racine

Toujours **avant** toute Condition / Appliquer à chaque :

1. **Initialiser une variable** `EventId` (Chaîne, vide)
2. Optionnel : **Initialiser** `CardDesc` (Chaîne, vide) si utile

### 3. Lister les cartes

**Trello** → chercher une action du genre :

- **Obtenir les cartes** / **List cards** / **Get cards** sur le **tableau**

(Le libellé exact varie ; choisissez celle qui renvoie la liste des cartes du board.)

### 4. Appliquer à chaque carte

**Contrôle** → **Appliquer à chaque** → sélectionnez le tableau de cartes de l’étape précédente.

**Dans** la boucle :

#### 4a. Condition : a une échéance ?

- `items('Appliquer_à_chaque')?['due']` **n’est pas vide**  
  (ou le champ Date d’échéance du contenu dynamique de la carte courante)

**Si non** → ne rien faire.

**Si oui** → suite.

#### 4b. Condition : a déjà un outlook-event-id ?

- Description de la carte **contient** `outlook-event-id`

---

**Branche Si non** (pas encore d’événement) — comme Flux A :

1. **Créer un événement (V4)**  
   - Début : `formatDateTime(items('Appliquer_à_chaque')?['due'], 'yyyy-MM-dd')`  
   - Fin : `formatDateTime(addDays(items('Appliquer_à_chaque')?['due'], 1), 'yyyy-MM-dd')`  
   - Objet : nom de la carte courante  
2. **Définir la variable** `EventId` = Id (contenu dynamique)  
3. **Mettre à jour une carte** — description :

```text
concat(
  coalesce(items('Appliquer_à_chaque')?['desc'], ''),
  '

[outlook-event-id]: ',
  variables('EventId')
)
```

(Adaptez `Appliquer_à_chaque` au nom exact de votre boucle — visible dans le code peek / contenu dynamique.)

---

**Branche Si oui** (événement déjà lié) — **mettre à jour Outlook** :

1. **Composer** (Compose) nommé `ParsedEventId` — expression pour extraire l’id :

```text
trim(
  first(
    split(
      last(split(coalesce(items('Appliquer_à_chaque')?['desc'], ''), '[outlook-event-id]:')),
      decodeUriComponent('%0A')
    )
  )
)
```

Plus simple si une seule ligne d’id en bas de description :

```text
trim(last(split(coalesce(items('Appliquer_à_chaque')?['desc'], ''), '[outlook-event-id]:')))
```

2. **Outlook** → **Mettre à jour un événement (V4)**  
   - Id de l’événement : sortie du Compose `ParsedEventId`  
   - Objet : nom actuel de la carte  
   - Début / Fin : mêmes `formatDateTime` / `addDays` que ci‑dessus sur `due` de la carte courante  

Ainsi, quand vous changez l’échéance (ou le titre) dans Trello, le prochain passage du flux met Outlook à jour.

### 5. Activer

Laissez Flux A + Flux B **activés**.  
Test : changez l’échéance d’une carte déjà liée → attendez le prochain run (15 min / 1 h) → vérifiez Outlook.

**Astuce :** pour tester sans attendre, ouvrez Flux B → **Exécuter** (Run) manuellement.

---

## Test

1. Activer Flux A (et B si vous l’avez).  
2. **Créer** une carte **déjà avec échéance** (sinon Flux A ne sert à rien pour l’échéance ajoutée plus tard → Flux B).  
3. Vérifier Outlook.  
4. Historique des exécutions si échec → action en rouge = champ `null` ou mauvais format de date.

---

## Erreurs fréquentes

| Message | Correction |
|---------|------------|
| Référence non valide à `Créer_un_événement` | Variable `EventId` + contenu dynamique, pas `body('Créer_un_événement')` à la main |
| `date-time` vs `date-no-tz` | `formatDateTime(..., 'yyyy-MM-dd')` |
| Champ `Null` | Calendrier non choisi, ou `due` vide, ou Id d’événement vide |
| Rien ne se passe si j’ajoute l’échéance après | Normal pour Flux A — utiliser Flux B |

---

## Ce que Cerveau fait / ne fait pas

| | |
|--|--|
| **Power Automate** | Crée/met à jour Outlook et écrit `[outlook-event-id]: …` |
| **Cerveau** | Masque cette métadonnée dans le popup |

Gantt **Connecter Outlook** = autre chemin (Graph / Entra), pas requis pour Automate.
