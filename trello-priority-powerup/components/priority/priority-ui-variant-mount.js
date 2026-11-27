    function updateScoreTooltip(result, display) {
      var hide = !result || !result.terms || !!display.inutile || !!display.blocked;
      scoreInfoWrap.hidden = hide;
      if (hide) {
        closeScoreTooltip();
        return;
      }

      // Extract urgency, impact, and ease values from the result object
      var urgency = result.urgency !== undefined ? result.urgency : 0;
      var impact = result.impact !== undefined ? result.impact : 0;
      var ease = result.ease !== undefined ? result.ease : 1;

      // Format the tooltip content with specific values
      var breakdown = {
        short: 'Urgency, Impact, Ease',
        lines: [
          `Urgency: ${urgency} (0-4)`,
          `Impact: ${impact} (0-4)`,
          `Ease: ${ease} (1-5)`
        ]
      };

      renderScoreBreakdownTooltip(breakdown, scoreTooltip);
      scoreInfoBtn.removeAttribute('title');
      scoreInfoBtn.setAttribute(
        'aria-label',
        breakdown.short + '. ' + breakdown.lines.join('. ‘')
      );
      repositionScoreTooltipIfVisible();
    }