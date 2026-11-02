/**
 * completion-ui: part 2 of 3 (createEstimateChip).
 * Names are shared with the other parts through window.CompletionUiParts (see completion-ui.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.CompletionUiParts = global.CompletionUiParts || {});

  // from other parts (functions, resolved at call time)
  function closeOpenEstimatePopovers() { return S.closeOpenEstimatePopovers.apply(this, arguments); }
  function durationTicks() { return S.durationTicks.apply(this, arguments); }
  function nearestTrelloBadgeColorName() { return S.nearestTrelloBadgeColorName.apply(this, arguments); }
  function normalizeGradientStops() { return S.normalizeGradientStops.apply(this, arguments); }
  function resolveEstimateInput() { return S.resolveEstimateInput.apply(this, arguments); }
  function rgbFromGradientStops() { return S.rgbFromGradientStops.apply(this, arguments); }
  function rgbToHex() { return S.rgbToHex.apply(this, arguments); }

  /**
   * Compact estimate chip + popover (ticks + optional freeform).
   * config: {
   *   minutes, scales|scale, readOnly, adjusted, compact, clearable, ariaLabel,
   *   onChange(minutes|null), t
   * }
   * Scales stay in minutes; Progrès / subtasks use Temps.
   * Empty state: grayed clock only (estimate optional). Set state: label + × to clear.
   */
  function createEstimateChip(CT, config) {
    config = config || {};
    var minutes =
      typeof CT.clampEstimatedMinutes === 'function'
        ? CT.clampEstimatedMinutes(config.minutes)
        : config.minutes != null
          ? Math.round(config.minutes)
          : null;
    var scaleIds =
      typeof CT.normalizeEstimateScales === 'function'
        ? CT.normalizeEstimateScales(
            config.scales != null ? config.scales : config.scale
          )
        : Array.isArray(config.scales)
          ? config.scales.slice()
          : [config.scale || 'time'];
    var readOnly = !!config.readOnly;
    var clearable = config.clearable !== false;
    var onChange = typeof config.onChange === 'function' ? config.onChange : null;
    var trelloT = config.t || null;

    var wrap = document.createElement('div');
    wrap.className =
      'tp-estimate-chip-wrap' + (config.compact ? ' is-compact' : '');

    var chip = document.createElement(readOnly ? 'span' : 'button');
    if (!readOnly) chip.type = 'button';
    chip.className = 'tp-estimate-chip';

    // Same Tabler icons as the Temps dropdown ticks (bolt / clock / sun / …).
    var iconEl = document.createElement('i');
    iconEl.className = 'ti ti-clock tp-estimate-chip-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'tp-estimate-chip-label';
    chip.appendChild(iconEl);
    chip.appendChild(label);
    wrap.appendChild(chip);

    var clearBtn = null;
    if (!readOnly) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'tp-estimate-chip-clear';
      clearBtn.setAttribute('aria-label', 'Retirer l\u2019estimation');
      clearBtn.title = 'Retirer l\u2019estimation';
      clearBtn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      clearBtn.hidden = true;
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
        setMinutes(null, true);
      });
      wrap.appendChild(clearBtn);
    }

    var popover = null;
    var ticksRoot = null;
    var freeRow = null;
    var freeInput = null;

    function activeScales() {
      return scaleIds.slice();
    }

    function hasScale(id) {
      return scaleIds.indexOf(id) !== -1;
    }

    function primaryMeta() {
      var id = scaleIds[0] || 'time';
      if (typeof CT.getEstimateScale === 'function') {
        return CT.getEstimateScale(id);
      }
      return {
        id: id,
        emptyLabel: 'Estimer',
        emptyTitle: 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
        popoverLabel: 'Choisir une estim\u00e9e',
        freeform: id === 'time',
      };
    }

    function emptyLabels() {
      if (scaleIds.length > 1) {
        return {
          emptyLabel: 'Estimer',
          emptyTitle: 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
          popoverLabel: 'Choisir une estim\u00e9e',
        };
      }
      var meta = primaryMeta();
      return {
        emptyLabel: meta.emptyLabel || 'Estimer',
        emptyTitle:
          meta.emptyTitle || 'Ajouter une dur\u00e9e estim\u00e9e (optionnel)',
        popoverLabel: meta.popoverLabel || 'Choisir une estim\u00e9e',
      };
    }

    function ticksForScale(scaleId) {
      if (typeof CT.getEstimateScaleTicks === 'function') {
        return CT.getEstimateScaleTicks(scaleId);
      }
      return scaleId === 'time' ? durationTicks() : [];
    }

    function formatCurrent() {
      if (minutes == null) return '';
      if (typeof CT.formatEstimateForScales === 'function') {
        return CT.formatEstimateForScales(minutes, scaleIds);
      }
      if (typeof CT.formatEstimateForScale === 'function') {
        return CT.formatEstimateForScale(minutes, scaleIds[0]);
      }
      if (typeof CT.formatEstimatedMinutesCompact === 'function') {
        return CT.formatEstimatedMinutesCompact(minutes);
      }
      return String(minutes) + ' min';
    }

    /** Nearest tick for the chip icon + accent (prefer Temps when multi-scale). */
    function resolveChipTick() {
      if (minutes == null) return null;
      var scaleId = hasScale('time') ? 'time' : scaleIds[0] || 'time';
      if (typeof CT.nearestEstimateTick === 'function') {
        return CT.nearestEstimateTick(minutes, scaleId);
      }
      var ticks = ticksForScale(scaleId);
      if (!ticks.length) return null;
      var best = ticks[0];
      var bestDist = Infinity;
      var logM = Math.log(Math.max(minutes, 1));
      for (var i = 0; i < ticks.length; i++) {
        var tm = ticks[i].minutes;
        if (tm == null || !isFinite(+tm)) continue;
        var dist = Math.abs(logM - Math.log(Math.max(+tm, 1)));
        if (dist < bestDist) {
          bestDist = dist;
          best = ticks[i];
        }
      }
      return best;
    }

    function paint() {
      var labels = emptyLabels();
      var estimating = !!config.estimating && minutes == null;
      var isEmpty = minutes == null && !estimating;
      var text = estimating
        ? 'Estimation'
        : minutes == null
          ? ''
          : formatCurrent();
      label.textContent = text;
      label.hidden = isEmpty;
      chip.classList.toggle('is-empty', minutes == null);
      chip.classList.toggle('is-icon-only', isEmpty);
      chip.classList.toggle('is-set', minutes != null);
      chip.classList.toggle('is-estimating', estimating);
      chip.classList.toggle('is-adjusted', !!config.adjusted && minutes != null);
      chip.classList.toggle('is-scale-time', hasScale('time'));
      chip.classList.toggle('is-scale-tshirt', hasScale('tshirt'));
      chip.classList.toggle('is-scale-multi', scaleIds.length > 1);
      chip.setAttribute('aria-busy', estimating ? 'true' : 'false');
      chip.setAttribute(
        'aria-label',
        config.ariaLabel ||
          (minutes != null
            ? 'Estimation\u00a0: ' + text + '. Modifier'
            : labels.emptyTitle || 'Ajouter une dur\u00e9e estim\u00e9e')
      );
      chip.title = estimating
        ? 'Estimation en cours\u00a0\u2014 vous pouvez encore la modifier'
        : minutes == null
          ? labels.emptyTitle
          : config.adjusted
            ? 'Total ajust\u00e9\u00a0: ' + text
            : text;

      if (clearBtn) {
        var showClear = clearable && minutes != null;
        clearBtn.hidden = !showClear;
        wrap.classList.toggle('has-clear', showClear);
      }

      var tick = resolveChipTick();
      var iconName =
        (tick && tick.icon) || (estimating ? 'loader-2' : 'clock');
      iconEl.className = 'ti ti-' + iconName + ' tp-estimate-chip-icon';
      if (tick && tick.color) {
        wrap.style.setProperty('--estimate-accent', tick.color);
      } else {
        wrap.style.removeProperty('--estimate-accent');
      }
      syncTickSelection();
    }

    function setMinutes(next, notify) {
      minutes =
        typeof CT.clampEstimatedMinutes === 'function'
          ? CT.clampEstimatedMinutes(next)
          : next != null && isFinite(+next) && +next > 0
            ? Math.round(+next)
            : null;
      if (minutes != null) config.estimating = false;
      paint();
      if (notify && onChange) onChange(minutes);
    }

    function setEstimating(on) {
      config.estimating = !!on && minutes == null;
      paint();
    }

    function setClearable(next) {
      clearable = next !== false;
      paint();
    }

    function setScales(nextScales) {
      scaleIds =
        typeof CT.normalizeEstimateScales === 'function'
          ? CT.normalizeEstimateScales(nextScales)
          : Array.isArray(nextScales)
            ? nextScales.slice()
            : [nextScales || 'time'];
      config.scales = scaleIds.slice();
      rebuildPopoverBody();
      paint();
    }

    /** @deprecated Prefer setScales — kept for callers that pass a single scale. */
    function setScale(nextScale) {
      setScales(nextScale);
    }

    var onDocClose = null;
    var onPopoverReposition = null;

    function clearPopoverPosition() {
      if (!popover) return;
      popover.classList.remove('is-fixed');
      popover.style.left = '';
      popover.style.right = '';
      popover.style.top = '';
      popover.style.bottom = '';
      popover.style.maxWidth = '';
    }

    /**
     * Anchor below the chip (right-aligned), then clamp into the viewport so
     * left-side chips (master "Estimer") do not spill off-screen.
     */
    function positionPopover() {
      if (!popover || popover.hidden) return;
      var margin = 8;
      var gap = 6;
      var chipRect = chip.getBoundingClientRect();
      var viewW = document.documentElement.clientWidth || window.innerWidth || 0;
      var viewH = document.documentElement.clientHeight || window.innerHeight || 0;
      if (viewW <= 0 || viewH <= 0) return;

      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
      popover.style.maxWidth = Math.max(160, viewW - margin * 2) + 'px';
      popover.style.left = Math.round(chipRect.left) + 'px';
      popover.style.top = Math.round(chipRect.bottom + gap) + 'px';
      popover.classList.add('is-fixed');

      var popW = popover.offsetWidth;
      var popH = popover.offsetHeight;

      var left = chipRect.right - popW;
      var top = chipRect.bottom + gap;

      if (left < margin) left = margin;
      if (left + popW > viewW - margin) {
        left = Math.max(margin, viewW - margin - popW);
      }

      if (top + popH > viewH - margin) {
        var above = chipRect.top - gap - popH;
        if (above >= margin) top = above;
        else top = Math.max(margin, viewH - margin - popH);
      }

      popover.style.left = Math.round(left) + 'px';
      popover.style.top = Math.round(top) + 'px';
    }

    function bindPopoverReposition(on) {
      if (on) {
        if (onPopoverReposition) return;
        onPopoverReposition = function () {
          positionPopover();
        };
        window.addEventListener('resize', onPopoverReposition);
        window.addEventListener('scroll', onPopoverReposition, true);
      } else if (onPopoverReposition) {
        window.removeEventListener('resize', onPopoverReposition);
        window.removeEventListener('scroll', onPopoverReposition, true);
        onPopoverReposition = null;
      }
    }

    function closePopover() {
      if (!popover) return;
      popover.classList.remove('is-open');
      popover.hidden = true;
      clearPopoverPosition();
      bindPopoverReposition(false);
      chip.setAttribute('aria-expanded', 'false');
      if (onDocClose) {
        document.removeEventListener('click', onDocClose, true);
        onDocClose = null;
      }
    }

    wrap._tpCloseEstimate = closePopover;

    function syncTickSelection() {
      if (!ticksRoot) return;
      var groups = ticksRoot.querySelectorAll('[data-estimate-scale]');
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var scaleId = group.getAttribute('data-estimate-scale') || 'time';
        var nearest =
          minutes != null && typeof CT.nearestEstimateTick === 'function'
            ? CT.nearestEstimateTick(minutes, scaleId)
            : null;
        var buttons = group.querySelectorAll('.tp-estimate-tick');
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var btnMins = Number(btn.dataset.minutes);
          var selected =
            nearest &&
            minutes != null &&
            (btn.dataset.tickId === nearest.id ||
              (isFinite(btnMins) && btnMins === nearest.minutes));
          btn.classList.toggle('is-selected', !!selected);
          btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
      }
    }

    function rebuildPopoverBody() {
      if (!popover) return;
      var labels = emptyLabels();
      var allowFreeform = hasScale('time');
      popover.setAttribute('aria-label', labels.popoverLabel || 'Choisir une estim\u00e9e');
      popover.classList.toggle('is-scale-time', hasScale('time'));
      popover.classList.toggle('is-scale-discrete', !hasScale('time'));
      popover.classList.toggle('is-scale-multi', scaleIds.length > 1);

      if (!ticksRoot) {
        ticksRoot = document.createElement('div');
        ticksRoot.className = 'tp-estimate-ticks-root';
        popover.insertBefore(ticksRoot, popover.firstChild);
      }
      ticksRoot.textContent = '';

      activeScales().forEach(function (scaleId) {
        var meta =
          typeof CT.getEstimateScale === 'function'
            ? CT.getEstimateScale(scaleId)
            : { id: scaleId, label: scaleId };
        var section = document.createElement('div');
        section.className = 'tp-estimate-scale-section';
        section.setAttribute('data-estimate-scale', scaleId);
        if (scaleIds.length > 1) {
          var heading = document.createElement('div');
          heading.className = 'tp-estimate-scale-heading';
          heading.textContent = meta.label || scaleId;
          section.appendChild(heading);
        }
        var ticksEl = document.createElement('div');
        ticksEl.className = 'tp-estimate-ticks';
        ticksEl.setAttribute('role', 'listbox');
        ticksEl.setAttribute(
          'aria-label',
          meta.popoverLabel || meta.label || 'Choisir une estim\u00e9e'
        );
        ticksForScale(scaleId).forEach(function (tick) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tp-estimate-tick';
          btn.setAttribute('role', 'option');
          btn.title = tick.title || tick.label;
          btn.dataset.minutes = String(tick.minutes);
          if (tick.id) btn.dataset.tickId = String(tick.id);
          if (tick.color) {
            btn.style.setProperty('--tick-color', tick.color);
          }
          if (tick.icon) {
            var iconEl = document.createElement('i');
            iconEl.className = 'ti ti-' + tick.icon + ' tp-estimate-tick-icon';
            iconEl.setAttribute('aria-hidden', 'true');
            btn.appendChild(iconEl);
          }
          var labelEl = document.createElement('span');
          labelEl.className = 'tp-estimate-tick-label';
          labelEl.textContent = tick.label;
          btn.appendChild(labelEl);
          btn.addEventListener('click', function () {
            setMinutes(tick.minutes, true);
            closePopover();
          });
          ticksEl.appendChild(btn);
        });
        section.appendChild(ticksEl);
        ticksRoot.appendChild(section);
      });

      if (allowFreeform) {
        var timeMeta =
          typeof CT.getEstimateScale === 'function'
            ? CT.getEstimateScale('time')
            : { freeformPlaceholder: 'ex. 2 h', freeformAria: 'Dur\u00e9e personnalis\u00e9e' };
        if (!freeRow) {
          freeRow = document.createElement('div');
          freeRow.className = 'tp-estimate-free';
          freeInput = document.createElement('input');
          freeInput.type = 'text';
          freeInput.className = 'tp-input tp-estimate-free-input';
          freeInput.placeholder = timeMeta.freeformPlaceholder || 'ex. 2 h';
          freeInput.setAttribute(
            'aria-label',
            timeMeta.freeformAria || 'Dur\u00e9e personnalis\u00e9e'
          );
          var applyBtn = document.createElement('button');
          applyBtn.type = 'button';
          applyBtn.className = 'tp-estimate-free-apply';
          applyBtn.textContent = 'OK';

          var applyBusy = false;
          function applyFreeformEstimate() {
            if (applyBusy) return Promise.resolve();
            var typed = freeInput.value;
            applyBusy = true;
            applyBtn.disabled = true;
            freeInput.disabled = true;
            return resolveEstimateInput(typed, CT, trelloT)
              .then(function (parsed) {
                if (parsed != null) {
                  setMinutes(parsed, true);
                  closePopover();
                }
              })
              .finally(function () {
                applyBusy = false;
                applyBtn.disabled = false;
                freeInput.disabled = false;
              });
          }

          freeInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyFreeformEstimate();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closePopover();
            }
          });
          applyBtn.addEventListener('click', function () {
            applyFreeformEstimate();
          });
          freeRow.appendChild(freeInput);
          freeRow.appendChild(applyBtn);
          popover.appendChild(freeRow);
        }
        freeRow.hidden = false;
        freeInput.placeholder = timeMeta.freeformPlaceholder || 'ex. 2 h';
      } else if (freeRow) {
        freeRow.hidden = true;
      }
      syncTickSelection();
    }

    function openPopover() {
      if (readOnly || !popover) return;
      closeOpenEstimatePopovers(popover);
      rebuildPopoverBody();
      popover.hidden = false;
      popover.classList.add('is-open');
      chip.setAttribute('aria-expanded', 'true');
      positionPopover();
      bindPopoverReposition(true);
      if (!onDocClose) {
        onDocClose = function (e) {
          if (!wrap.contains(e.target)) closePopover();
        };
        document.addEventListener('click', onDocClose, true);
      }
      if (freeInput && hasScale('time')) {
        freeInput.value =
          minutes != null
            ? typeof CT.formatEstimatedMinutesCompact === 'function'
              ? CT.formatEstimatedMinutesCompact(minutes).replace(/^~/, '')
              : String(minutes)
            : '';
        setTimeout(function () {
          freeInput.focus();
          freeInput.select();
        }, 0);
      }
    }

    if (!readOnly) {
      chip.setAttribute('aria-haspopup', 'dialog');
      chip.setAttribute('aria-expanded', 'false');
      popover = document.createElement('div');
      popover.className = 'tp-estimate-popover';
      popover.hidden = true;
      popover.setAttribute('role', 'dialog');
      rebuildPopoverBody();
      wrap.appendChild(popover);
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (popover.classList.contains('is-open')) closePopover();
        else openPopover();
      });
    }

    paint();

    var api = {
      el: wrap,
      chip: chip,
      getMinutes: function () {
        return minutes;
      },
      setMinutes: function (next) {
        setMinutes(next, false);
      },
      getScale: function () {
        return scaleIds[0] || 'time';
      },
      getScales: function () {
        return scaleIds.slice();
      },
      setScale: setScale,
      setScales: setScales,
      setEstimating: setEstimating,
      setClearable: setClearable,
      setAdjusted: function (adjusted) {
        config.adjusted = !!adjusted;
        paint();
      },
      setAccent: function (color) {
        if (color) wrap.style.setProperty('--estimate-accent', color);
        else wrap.style.removeProperty('--estimate-accent');
      }
    };
    wrap._tpEstimateChip = api;
    return api;
  }

  /** Selection key for a top-level Progrès subtask (master). */
  function selectionKeyForItem(itemId) {
    return 'item:' + String(itemId || '');
  }

  /** Selection key for a nested checklist sub-sous-tâche. */
  function selectionKeyForChecklist(parentId, nestedId) {
    return 'check:' + String(parentId || '') + ':' + String(nestedId || '');
  }

  function parseSelectionKey(key) {
    var raw = typeof key === 'string' ? key : '';
    if (raw.indexOf('item:') === 0) {
      var itemId = raw.slice(5);
      return itemId ? { kind: 'item', itemId: itemId } : null;
    }
    if (raw.indexOf('check:') === 0) {
      var rest = raw.slice(6);
      var colon = rest.indexOf(':');
      if (colon <= 0) return null;
      var parentId = rest.slice(0, colon);
      var nestedId = rest.slice(colon + 1);
      if (!parentId || !nestedId) return null;
      return { kind: 'check', parentId: parentId, nestedId: nestedId };
    }
    return null;
  }

  /** Master item key + all checklist children (cascade, like Gantt). */
  function collectItemSelectionIds(item) {
    if (!item || !item.id) return [];
    var ids = [selectionKeyForItem(item.id)];
    var nested = Array.isArray(item.items) ? item.items : [];
    for (var i = 0; i < nested.length; i++) {
      if (nested[i] && nested[i].id) {
        ids.push(selectionKeyForChecklist(item.id, nested[i].id));
      }
    }
    return ids;
  }

  /**
   * When a master is selected with its checklist children, bulk ops on the
   * master already cover the children — drop redundant check entries.
   */
  function dedupeBulkEntries(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var parentIds = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'item' && list[i].itemId) {
        parentIds[list[i].itemId] = true;
      }
    }
    var out = [];
    for (var j = 0; j < list.length; j++) {
      var e = list[j];
      if (!e) continue;
      if (e.kind === 'check' && e.parentId && parentIds[e.parentId]) continue;
      out.push(e);
    }
    return out;
  }

  function selectAllCheckboxState(selectedCount, visibleCount) {
    var selected = Math.max(0, Number(selectedCount) || 0);
    var visible = Math.max(0, Number(visibleCount) || 0);
    if (!visible || !selected) {
      return { checked: false, indeterminate: false };
    }
    if (selected >= visible) {
      return { checked: true, indeterminate: false };
    }
    return { checked: false, indeterminate: true };
  }

  // ── mountCompletionUI — main Progrès editor ─────────────────────────────

  function mountCompletionUI(containerEl, options) {
    var M = Object.create(null);
    M.containerEl = containerEl;
    M.options = options;
    var __parts = (global.CompletionUiPartsMountMountCompletionUI || { list: [] }).list;
    for (var __i = 0; __i < __parts.length; __i++) __parts[__i].define(M);
    for (var __j = 0; __j < __parts.length; __j++) {
      var __r = __parts[__j].run(M);
      if (__r) return __r.v;
    }
  }

  function progressBadgePreviewSamples(stops) {
    var list = normalizeGradientStops(stops || S.activeGradientStops);
    return [0, 25, 50, 75, 100].map(function (pct) {
      var hex = rgbToHex(rgbFromGradientStops(pct, list));
      var colorName =
        pct >= 100 ? 'green' : pct <= 0 ? 'light-gray' : nearestTrelloBadgeColorName(hex);
      var text = pct >= 100 ? '\u2713 ' + pct + '\u00a0%' : pct + '\u00a0%';
      return { percent: pct, hex: hex, color: colorName, text: text };
    });
  }

  // exports
  S.collectItemSelectionIds = collectItemSelectionIds;
  S.createEstimateChip = createEstimateChip;
  S.dedupeBulkEntries = dedupeBulkEntries;
  S.mountCompletionUI = mountCompletionUI;
  S.parseSelectionKey = parseSelectionKey;
  S.progressBadgePreviewSamples = progressBadgePreviewSamples;
  S.selectAllCheckboxState = selectAllCheckboxState;
  S.selectionKeyForChecklist = selectionKeyForChecklist;
  S.selectionKeyForItem = selectionKeyForItem;
})(typeof window !== 'undefined' ? window : this);
