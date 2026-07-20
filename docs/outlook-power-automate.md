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

### 4. Sauver l’Id dans une variable

Après **Créer un événement** :

1. **Variables** → **Initialiser une variable**
2. Nom : `EventId`
3. Type : **Chaîne**
4. Valeur : **Contenu dynamique** → sous Créer un événement → **Id**  
   (ne tapez pas le nom de l’action à la main)

### 5. Écrire l’id dans la description Trello

**Trello** → **Mettre à jour une carte**

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

## Flux B — Récurrence (mises à jour)

Sans déclencheur « carte modifiée », utilisez la planification.

1. **Créer** → **Flux de cloud planifié**
2. Récurrence : toutes les **1 heure** (ou 15 min)
3. Trello → action du type **Obtenir les cartes** / lister les cartes du tableau
4. **Appliquer à chaque** carte :
   - Si pas d’échéance → ignorer  
   - Si description **ne contient pas** `outlook-event-id` → créer événement + variable + update description (comme Flux A)  
   - Sinon → **Mettre à jour un événement** avec l’id extrait de la description  

(Extraction d’id : Compose / expression sur le texte après `[outlook-event-id]:`.)

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
