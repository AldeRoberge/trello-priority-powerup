  // â”€â”€ 4. Display resolution (tier labels) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function isInutile(inputs) {
    var U = inputs.urgency != null ? inputs.urgency : 0;
    var I = inputs.impact != null ? inputs.impact : 0;
    var F = inputs.ease != null ? inputs.ease : 5;
    return U < INUTILE_EPS && I < INUTILE_EPS && F <= 1 + INUTILE_EPS;
  }

  function resolveDisplay(result, inputs) {
    if (!isInutile(inputs)) {
      return {
        inutile: false,
        score: result.score,
        label: result.tier.label,
        description: result.tier.description || '',
        tierLabel: result.tier.label,
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
