  // â”€â”€ 4. Matrix label bridge (PriorityMatrix) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function isInutile(inputs) {
    var U = inputs.urgency != null ? inputs.urgency : 0;
    var I = inputs.impact != null ? inputs.impact : 0;
    var F = inputs.ease != null ? inputs.ease : 5;
    return U < INUTILE_EPS && I < INUTILE_EPS && F <= 1 + INUTILE_EPS;
  }

  var matrixSettings = null;

  function setMatrixSettings(settings) {
    matrixSettings = settings;
  }

  function getMatrixSettings() {
    return matrixSettings;
  }

  function resolveMatrixLabel(inputs, tier, score, labelSettings) {
    var Matrix = typeof PriorityMatrix !== 'undefined' ? PriorityMatrix : null;
    if (!Matrix) return null;
    var settings = labelSettings != null ? labelSettings : matrixSettings;
    var ctx = Matrix.buildResolveContext(settings, tier, score);
    return Matrix.resolveLabel(inputs, ctx);
  }

  function resolveDisplay(result, inputs, labelSettings) {
    if (!isInutile(inputs)) {
      var settings = labelSettings != null ? labelSettings : matrixSettings;
      var matrix = resolveMatrixLabel(inputs, result.tier, result.score, settings);
      var matrixEnabled = !settings || settings.enabled !== false;
      return {
        inutile: false,
        score: result.score,
        label: matrix ? matrix.label : result.tier.label,
        description: matrix ? matrix.description : (result.tier.description || ''),
        tierLabel: result.tier.label,
        matrixRuleId: matrix ? matrix.ruleId : null,
        matrixLevels: matrix ? matrix.levels : null,
        matrixEnabled: matrixEnabled,
        matrixDisabled: matrix ? !!matrix.matrixDisabled : !matrixEnabled,
        fill: result.tier.fill,
        text: result.tier.text,
        seg: result.tier.seg,
        tierI: result.tier.i,
        cardTier: result.tier
      };
    }
    return {
      inutile: true,
      score: 0,
      label: INUTILE_LABEL,
      description: INUTILE_STYLES.description || '',
      tierLabel: INUTILE_LABEL,
      matrixRuleId: null,
      matrixLevels: null,
      fill: INUTILE_STYLES.fill,
      text: INUTILE_STYLES.text,
      seg: INUTILE_STYLES.seg,
      tierI: null,
      cardTier: {
        inutile: true,
        i: 'inutile',
        label: INUTILE_LABEL,
        fill: INUTILE_STYLES.fill,
        seg: INUTILE_STYLES.seg
      }
    };
  }
