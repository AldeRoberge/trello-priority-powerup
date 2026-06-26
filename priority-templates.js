/* Shared priority defaults and preset templates for the Card Priorities Power-Up */

const DEFAULT_PRIORITIES = [
  { id: 1, label: 'Urgent', color: '#E53E3E' },
  { id: 2, label: 'Haute',  color: '#DD6B20' },
  { id: 3, label: 'Moyenne', color: '#D69E2E' },
  { id: 4, label: 'Basse',   color: '#38A169' },
  { id: 5, label: 'Aucune',  color: '#718096' },
];

const PRIORITY_TEMPLATES = [
  {
    id: 'english',
    name: 'Anglais',
    priorities: [
      { id: 1, label: 'Urgent', color: '#E53E3E' },
      { id: 2, label: 'High',   color: '#DD6B20' },
      { id: 3, label: 'Medium', color: '#D69E2E' },
      { id: 4, label: 'Low',    color: '#38A169' },
      { id: 5, label: 'None',   color: '#718096' },
    ],
  },
  {
    id: 'french',
    name: 'Français',
    priorities: [
      { id: 1, label: '🔴 Critique', color: '#E53E3E' },
      { id: 2, label: '🟠 Élevée',   color: '#DD6B20' },
      { id: 3, label: '🟡 Modérée',  color: '#D69E2E' },
      { id: 4, label: '🟢 Faible',   color: '#38A169' },
      { id: 5, label: 'Aucune',      color: '#718096' },
    ],
  },
  {
    id: 'german',
    name: 'Deutsch',
    priorities: [
      { id: 1, label: 'Kritisch', color: '#E53E3E' },
      { id: 2, label: 'Hoch',     color: '#DD6B20' },
      { id: 3, label: 'Mittel',   color: '#D69E2E' },
      { id: 4, label: 'Niedrig',  color: '#38A169' },
      { id: 5, label: 'Keine',    color: '#718096' },
    ],
  },
  {
    id: 'italian',
    name: 'Italiano',
    priorities: [
      { id: 1, label: 'Critico', color: '#E53E3E' },
      { id: 2, label: 'Alto',    color: '#DD6B20' },
      { id: 3, label: 'Medio',   color: '#D69E2E' },
      { id: 4, label: 'Basso',   color: '#38A169' },
      { id: 5, label: 'Nessuno', color: '#718096' },
    ],
  },
  {
    id: 'emoji',
    name: 'Échelle emoji',
    priorities: [
      { id: 1, label: '🔥🔥🔥 Critical', color: '#E53E3E' },
      { id: 2, label: '🔥🔥 High',        color: '#DD6B20' },
      { id: 3, label: '🔥 Medium',        color: '#D69E2E' },
      { id: 4, label: '💤 Low',           color: '#38A169' },
      { id: 5, label: '➖ None',          color: '#718096' },
    ],
  },
  {
    id: 'moscow',
    name: 'Méthode MoSCoW',
    priorities: [
      { id: 1, label: 'Must have',    color: '#E53E3E' },
      { id: 2, label: 'Should have',  color: '#DD6B20' },
      { id: 3, label: 'Could have',   color: '#D69E2E' },
      { id: 4, label: "Won't have",   color: '#38A169' },
      { id: 5, label: 'Unrated',      color: '#718096' },
    ],
  },
];

const CUSTOM_SCHEME_ID = 'custom';
const EXPORT_VERSION = 1;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function clonePriorities(priorities) {
  return JSON.parse(JSON.stringify(priorities));
}

function getTemplateById(id) {
  return PRIORITY_TEMPLATES.find(t => t.id === id) || null;
}

function getSchemeDisplayName(schemeId) {
  if (schemeId === CUSTOM_SCHEME_ID) return 'Personnalisé';
  const template = getTemplateById(schemeId);
  return template ? template.name : 'Personnalisé';
}

function prioritiesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) =>
    p.id === b[i].id && p.label === b[i].label && p.color.toLowerCase() === b[i].color.toLowerCase()
  );
}

function detectScheme(priorities) {
  const match = PRIORITY_TEMPLATES.find(t => prioritiesEqual(priorities, t.priorities));
  return match ? match.id : CUSTOM_SCHEME_ID;
}

function validatePriorities(priorities) {
  if (!Array.isArray(priorities) || priorities.length !== 5) {
    return 'Il faut exactement 5 niveaux de priorité.';
  }
  const ids = new Set();
  for (let i = 0; i < priorities.length; i++) {
    const p = priorities[i];
    if (!p || typeof p !== 'object') return `La priorité ${i + 1} est invalide.`;
    if (typeof p.id !== 'number' || p.id < 1 || p.id > 5) {
      return `La priorité ${i + 1} doit avoir un identifiant de 1 à 5.`;
    }
    if (ids.has(p.id)) return `Identifiant de priorité en double : ${p.id}.`;
    ids.add(p.id);
    if (typeof p.label !== 'string' || !p.label.trim()) {
      return `La priorité ${p.id} doit avoir un libellé non vide.`;
    }
    if (p.label.length > 40) {
      return `Le libellé de la priorité ${p.id} est trop long (40 caractères maximum).`;
    }
    if (typeof p.color !== 'string' || !HEX_COLOR.test(p.color)) {
      return `La priorité ${p.id} doit avoir une couleur hexadécimale valide (ex. #E53E3E).`;
    }
  }
  return null;
}

function validateImportData(data) {
  if (!data || typeof data !== 'object') return 'JSON invalide : objet attendu.';
  if (data.version !== EXPORT_VERSION) {
    return `Version d'export non prise en charge (version ${EXPORT_VERSION} attendue).`;
  }
  const err = validatePriorities(data.priorities);
  if (err) return err;
  if (data.template != null && typeof data.template !== 'string') {
    return 'Le champ modèle doit être une chaîne de caractères lorsqu\'il est fourni.';
  }
  return null;
}

function buildExportPayload(priorities, schemeId) {
  return {
    version: EXPORT_VERSION,
    template: schemeId || detectScheme(priorities),
    priorities: clonePriorities(priorities),
  };
}

function parseImportFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Fichier JSON invalide.' };
  }
  const error = validateImportData(data);
  if (error) return { error };
  const schemeId = data.template === CUSTOM_SCHEME_ID || getTemplateById(data.template)
    ? data.template
    : detectScheme(data.priorities);
  return {
    priorities: clonePriorities(data.priorities),
    schemeId,
  };
}
