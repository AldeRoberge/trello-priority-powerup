/* Matrix label settings import/export for the Card Priorities Power-Up. */

const MATRIX_EXPORT_VERSION = 2;

function cloneMatrixLabelSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { enabled: true, overrides: {} };
  }
  return {
    enabled: settings.enabled !== false,
    overrides: settings.overrides && typeof settings.overrides === 'object'
      ? JSON.parse(JSON.stringify(settings.overrides))
      : {},
  };
}

function validateMatrixImportData(data) {
  if (!data || typeof data !== 'object') return 'JSON invalide : objet attendu.';
  if (data.version !== MATRIX_EXPORT_VERSION) {
    return `Version d'export non prise en charge (version ${MATRIX_EXPORT_VERSION} attendue).`;
  }
  if (!data.matrixLabelSettings || typeof data.matrixLabelSettings !== 'object') {
    return 'Le champ matrixLabelSettings est requis.';
  }
  if (data.matrixLabelSettings.enabled != null && typeof data.matrixLabelSettings.enabled !== 'boolean') {
    return 'Le champ enabled de matrixLabelSettings doit être un booléen.';
  }
  const overrides = data.matrixLabelSettings.overrides;
  if (overrides != null && (typeof overrides !== 'object' || Array.isArray(overrides))) {
    return 'Le champ overrides de matrixLabelSettings doit être un objet.';
  }
  return null;
}

function buildMatrixExportPayload(matrixLabelSettings) {
  return {
    version: MATRIX_EXPORT_VERSION,
    matrixLabelSettings: cloneMatrixLabelSettings(matrixLabelSettings),
  };
}

function parseMatrixImportFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Fichier JSON invalide.' };
  }
  const error = validateMatrixImportData(data);
  if (error) return { error };
  return {
    matrixLabelSettings: cloneMatrixLabelSettings(data.matrixLabelSettings),
  };
}
