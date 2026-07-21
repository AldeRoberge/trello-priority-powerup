/**
 * Member-scoped AI usage ledger (cost, tokens, messages) + SVG chart helpers.
 * Stored at member/private (agentUsageStats). Exposes window.AgentStats.
 *
 * Slim daily aggregates only — no prompts, no per-request debug payloads.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'agentUsageStats';
  var MAX_DAYS = 30;
  var MAX_MODELS = 5;
  var MAX_SERIALIZED = 1800;
  var SAVE_DEBOUNCE_MS = 700;

  function emptyLife() {
    return { turns: 0, pt: 0, ct: 0, tt: 0, cost: 0, sent: 0, recv: 0 };
  }

  function emptyStore() {
    return { v: 1, life: emptyLife(), days: [], models: {} };
  }

  function toNonNegNumber(raw, fallback) {
    if (raw == null || raw === '') return fallback == null ? 0 : fallback;
    var n = typeof raw === 'number' ? raw : Number(raw);
    if (!isFinite(n) || n < 0) return fallback == null ? 0 : fallback;
    return n;
  }

  function normalizeLife(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    return {
      turns: Math.round(toNonNegNumber(src.turns)),
      pt: Math.round(toNonNegNumber(src.pt)),
      ct: Math.round(toNonNegNumber(src.ct)),
      tt: Math.round(toNonNegNumber(src.tt)),
      cost: toNonNegNumber(src.cost),
      sent: Math.round(toNonNegNumber(src.sent)),
      recv: Math.round(toNonNegNumber(src.recv))
    };
  }

  function normalizeDay(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var d = typeof raw.d === 'string' ? raw.d.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return {
      d: d,
      turns: Math.round(toNonNegNumber(raw.turns)),
      pt: Math.round(toNonNegNumber(raw.pt)),
      ct: Math.round(toNonNegNumber(raw.ct)),
      tt: Math.round(toNonNegNumber(raw.tt)),
      cost: toNonNegNumber(raw.cost),
      sent: Math.round(toNonNegNumber(raw.sent)),
      recv: Math.round(toNonNegNumber(raw.recv))
    };
  }

  function normalizeModels(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (key) {
      var id = String(key || '').trim().slice(0, 48);
      if (!id) return;
      var m = raw[key];
      if (!m || typeof m !== 'object') return;
      out[id] = {
        turns: Math.round(toNonNegNumber(m.turns)),
        cost: toNonNegNumber(m.cost),
        tt: Math.round(toNonNegNumber(m.tt))
      };
    });
    return out;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return emptyStore();
    var days = [];
    var seen = {};
    (Array.isArray(raw.days) ? raw.days : []).forEach(function (entry) {
      var day = normalizeDay(entry);
      if (!day || seen[day.d]) return;
      seen[day.d] = true;
      days.push(day);
    });
    days.sort(function (a, b) {
      return a.d < b.d ? 1 : a.d > b.d ? -1 : 0;
    });
    return {
      v: 1,
      life: normalizeLife(raw.life),
      days: days,
      models: normalizeModels(raw.models)
    };
  }

  function todayKey(date) {
    var d = date instanceof Date ? date : new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function shortModelId(model) {
    var id = String(model || '').trim();
    if (!id) return 'inconnu';
    var slash = id.lastIndexOf('/');
    if (slash >= 0) id = id.slice(slash + 1);
    return id.slice(0, 40) || 'inconnu';
  }

  function bumpLife(life, delta) {
    life.turns += delta.turns || 0;
    life.pt += delta.pt || 0;
    life.ct += delta.ct || 0;
    life.tt += delta.tt || 0;
    life.cost += delta.cost || 0;
    life.sent += delta.sent || 0;
    life.recv += delta.recv || 0;
  }

  function trimModels(models) {
    var entries = Object.keys(models).map(function (id) {
      return { id: id, m: models[id] };
    });
    entries.sort(function (a, b) {
      return (b.m.cost || 0) - (a.m.cost || 0);
    });
    var out = {};
    entries.slice(0, MAX_MODELS).forEach(function (e) {
      out[e.id] = e.m;
    });
    return out;
  }

  function serializedSize(store) {
    try {
      return JSON.stringify(store).length;
    } catch (e) {
      return MAX_SERIALIZED + 1;
    }
  }

  function trimStore(store) {
    var next = normalize(store);
    if (next.days.length > MAX_DAYS) {
      next.days = next.days.slice(0, MAX_DAYS);
    }
    next.models = trimModels(next.models);
    while (serializedSize(next) > MAX_SERIALIZED && next.days.length > 7) {
      next.days.pop();
    }
    while (serializedSize(next) > MAX_SERIALIZED && Object.keys(next.models).length > 1) {
      next.models = trimModels(next.models);
      var ids = Object.keys(next.models);
      if (ids.length <= 1) break;
      var drop = ids[ids.length - 1];
      delete next.models[drop];
    }
    return next;
  }

  /**
   * @param {object} store
   * @param {object} usage — shape from PriorityAgent.extractUsageFromRaw
   * @param {{ sent?: number, recv?: number, date?: Date|string }} [opts]
   */
  function recordTurn(store, usage, opts) {
    var next = normalize(store);
    var u = usage && typeof usage === 'object' ? usage : {};
    var options = opts || {};
    var dayKey =
      typeof options.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(options.date)
        ? options.date
        : todayKey(options.date instanceof Date ? options.date : undefined);

    var delta = {
      turns: 1,
      pt: Math.round(toNonNegNumber(u.promptTokens)),
      ct: Math.round(toNonNegNumber(u.completionTokens)),
      tt: Math.round(
        toNonNegNumber(
          u.totalTokens,
          toNonNegNumber(u.promptTokens) + toNonNegNumber(u.completionTokens)
        )
      ),
      cost: toNonNegNumber(u.costUsd),
      sent: Math.round(toNonNegNumber(options.sent, 1)),
      recv: Math.round(toNonNegNumber(options.recv, 1))
    };

    bumpLife(next.life, delta);

    var day = null;
    for (var i = 0; i < next.days.length; i++) {
      if (next.days[i].d === dayKey) {
        day = next.days[i];
        break;
      }
    }
    if (!day) {
      day = {
        d: dayKey,
        turns: 0,
        pt: 0,
        ct: 0,
        tt: 0,
        cost: 0,
        sent: 0,
        recv: 0
      };
      next.days.unshift(day);
    }
    day.turns += delta.turns;
    day.pt += delta.pt;
    day.ct += delta.ct;
    day.tt += delta.tt;
    day.cost += delta.cost;
    day.sent += delta.sent;
    day.recv += delta.recv;

    var modelId = shortModelId(u.model);
    if (!next.models[modelId]) {
      next.models[modelId] = { turns: 0, cost: 0, tt: 0 };
    }
    next.models[modelId].turns += 1;
    next.models[modelId].cost += delta.cost;
    next.models[modelId].tt += delta.tt;

    return trimStore(next);
  }

  async function load(t) {
    if (!t || typeof t.get !== 'function') return emptyStore();
    try {
      var stored = await t.get('member', 'private', STORAGE_KEY);
      return trimStore(normalize(stored));
    } catch (err) {
      console.error('AgentStats.load failed', err);
      return emptyStore();
    }
  }

  async function save(t, store) {
    if (!t || typeof t.set !== 'function') {
      throw new Error('AgentStats.save: t.set required');
    }
    var next = trimStore(store);
    await t.set('member', 'private', STORAGE_KEY, next);
    return next;
  }

  async function reset(t) {
    var blank = emptyStore();
    if (t && typeof t.set === 'function') {
      await t.set('member', 'private', STORAGE_KEY, blank);
    }
    return blank;
  }

  function createDebouncedSaver(t, getStore, setStore, delayMs) {
    var timer = null;
    var pending = null;
    var ms = delayMs == null ? SAVE_DEBOUNCE_MS : delayMs;

    function flush() {
      timer = null;
      if (!t || typeof t.set !== 'function') return Promise.resolve(getStore());
      var snapshot = getStore();
      pending = save(t, snapshot)
        .then(function (saved) {
          setStore(saved);
          return saved;
        })
        .catch(function (err) {
          console.error('AgentStats.save failed', err);
          return getStore();
        })
        .finally(function () {
          pending = null;
        });
      return pending;
    }

    return {
      schedule: function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          flush();
        }, ms);
      },
      flush: flush,
      cancel: function () {
        if (timer) clearTimeout(timer);
        timer = null;
      }
    };
  }

  function formatTokenCount(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var v = Math.round(n);
    if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 10000) return Math.round(v / 1000) + 'k';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(v);
  }

  function formatCostUsd(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    if (n < 0.0001 && n > 0) return '<\u00a0$0.0001';
    if (n <= 0) return '$0';
    if (n < 0.01) return '$' + n.toFixed(4);
    if (n < 1) return '$' + n.toFixed(3);
    return '$' + n.toFixed(2);
  }

  function formatDayLabel(iso) {
    if (!iso || iso.length < 10) return '';
    var parts = iso.split('-');
    return parts[2] + '/' + parts[1];
  }

  function addDaysIso(iso, delta) {
    var parts = String(iso).split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + delta);
    return todayKey(d);
  }

  /**
   * Contiguous day series (oldest → newest) for charts, filling gaps with zeros.
   */
  function daySeries(store, count) {
    var n = Math.max(1, Math.min(MAX_DAYS, count || 14));
    var byDay = {};
    (store && store.days ? store.days : []).forEach(function (day) {
      byDay[day.d] = day;
    });
    var end = todayKey();
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var key = addDaysIso(end, -i);
      var hit = byDay[key];
      out.push(
        hit || {
          d: key,
          turns: 0,
          pt: 0,
          ct: 0,
          tt: 0,
          cost: 0,
          sent: 0,
          recv: 0
        }
      );
    }
    return out;
  }

  function hasAnyActivity(store) {
    var life = store && store.life;
    return !!(life && (life.turns > 0 || life.tt > 0 || life.cost > 0 || life.sent > 0));
  }

  function modelList(store) {
    var models = (store && store.models) || {};
    return Object.keys(models)
      .map(function (id) {
        return { id: id, turns: models[id].turns, cost: models[id].cost, tt: models[id].tt };
      })
      .sort(function (a, b) {
        return b.cost - a.cost;
      });
  }

  // ── SVG helpers ────────────────────────────────────────────────────────

  function svgEl(name, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] == null) return;
        node.setAttribute(key, String(attrs[key]));
      });
    }
    return node;
  }

  function maxOf(arr, fn) {
    var m = 0;
    for (var i = 0; i < arr.length; i++) {
      var v = fn(arr[i]);
      if (v > m) m = v;
    }
    return m;
  }

  function buildLineChart(series, valueFn, opts) {
    var options = opts || {};
    var w = options.width || 320;
    var h = options.height || 120;
    var padL = 28;
    var padR = 8;
    var padT = 10;
    var padB = 22;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var maxVal = maxOf(series, valueFn);
    if (maxVal <= 0) maxVal = 1;
    var n = series.length;
    var svg = svgEl('svg', {
      class: 'agent-stats-svg',
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      height: String(h),
      role: 'img',
      'aria-label': options.label || 'Graphique'
    });

    // grid
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (plotH * g) / 3;
      svg.appendChild(
        svgEl('line', {
          class: 'agent-stats-grid',
          x1: padL,
          y1: gy,
          x2: padL + plotW,
          y2: gy
        })
      );
    }

    var points = [];
    series.forEach(function (day, i) {
      var x = padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      var y = padT + plotH - (valueFn(day) / maxVal) * plotH;
      points.push({ x: x, y: y, day: day });
    });

    var areaD =
      'M' +
      points[0].x +
      ',' +
      (padT + plotH) +
      points
        .map(function (p) {
          return ' L' + p.x + ',' + p.y;
        })
        .join('') +
      ' L' +
      points[points.length - 1].x +
      ',' +
      (padT + plotH) +
      ' Z';
    svg.appendChild(svgEl('path', { class: 'agent-stats-area', d: areaD }));

    var lineD = points
      .map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
      })
      .join(' ');
    svg.appendChild(svgEl('path', { class: 'agent-stats-line', d: lineD, fill: 'none' }));

    points.forEach(function (p) {
      if (valueFn(p.day) <= 0) return;
      svg.appendChild(
        svgEl('circle', {
          class: 'agent-stats-dot',
          cx: p.x,
          cy: p.y,
          r: 2.5
        })
      );
    });

    // x labels (first, mid, last)
    var labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
    var seenIdx = {};
    labelIdx.forEach(function (idx) {
      if (seenIdx[idx] || !series[idx]) return;
      seenIdx[idx] = true;
      var lx = padL + (n <= 1 ? plotW / 2 : (idx / (n - 1)) * plotW);
      var text = svgEl('text', {
        class: 'agent-stats-axis',
        x: lx,
        y: h - 6,
        'text-anchor': 'middle'
      });
      text.textContent = formatDayLabel(series[idx].d);
      svg.appendChild(text);
    });

    var maxLabel = svgEl('text', {
      class: 'agent-stats-axis',
      x: padL - 4,
      y: padT + 4,
      'text-anchor': 'end'
    });
    maxLabel.textContent = options.formatY ? options.formatY(maxVal) : String(Math.round(maxVal));
    svg.appendChild(maxLabel);

    return svg;
  }

  function buildStackedBars(series, opts) {
    var options = opts || {};
    var w = options.width || 320;
    var h = options.height || 120;
    var padL = 28;
    var padR = 8;
    var padT = 10;
    var padB = 22;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var n = series.length;
    var maxVal = maxOf(series, function (d) {
      return (d.pt || 0) + (d.ct || 0);
    });
    if (maxVal <= 0) maxVal = 1;
    var gap = 2;
    var barW = Math.max(2, plotW / n - gap);

    var svg = svgEl('svg', {
      class: 'agent-stats-svg',
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      height: String(h),
      role: 'img',
      'aria-label': options.label || 'Tokens'
    });

    for (var g = 0; g <= 3; g++) {
      var gy = padT + (plotH * g) / 3;
      svg.appendChild(
        svgEl('line', {
          class: 'agent-stats-grid',
          x1: padL,
          y1: gy,
          x2: padL + plotW,
          y2: gy
        })
      );
    }

    series.forEach(function (day, i) {
      var x = padL + i * (plotW / n) + gap / 2;
      var ptH = ((day.pt || 0) / maxVal) * plotH;
      var ctH = ((day.ct || 0) / maxVal) * plotH;
      var yBase = padT + plotH;
      if (ptH > 0) {
        svg.appendChild(
          svgEl('rect', {
            class: 'agent-stats-bar agent-stats-bar--in',
            x: x,
            y: yBase - ptH - ctH,
            width: barW,
            height: ptH
          })
        );
      }
      if (ctH > 0) {
        svg.appendChild(
          svgEl('rect', {
            class: 'agent-stats-bar agent-stats-bar--out',
            x: x,
            y: yBase - ctH,
            width: barW,
            height: ctH
          })
        );
      }
    });

    var labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
    var seenIdx = {};
    labelIdx.forEach(function (idx) {
      if (seenIdx[idx] || !series[idx]) return;
      seenIdx[idx] = true;
      var lx = padL + idx * (plotW / n) + barW / 2;
      var text = svgEl('text', {
        class: 'agent-stats-axis',
        x: lx,
        y: h - 6,
        'text-anchor': 'middle'
      });
      text.textContent = formatDayLabel(series[idx].d);
      svg.appendChild(text);
    });

    var maxLabel = svgEl('text', {
      class: 'agent-stats-axis',
      x: padL - 4,
      y: padT + 4,
      'text-anchor': 'end'
    });
    maxLabel.textContent = formatTokenCount(maxVal);
    svg.appendChild(maxLabel);

    return svg;
  }

  function buildGroupedBars(series, opts) {
    var options = opts || {};
    var w = options.width || 320;
    var h = options.height || 120;
    var padL = 28;
    var padR = 8;
    var padT = 10;
    var padB = 22;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var n = series.length;
    var maxVal = maxOf(series, function (d) {
      return Math.max(d.sent || 0, d.recv || 0);
    });
    if (maxVal <= 0) maxVal = 1;
    var slot = plotW / n;
    var pairW = Math.max(4, slot * 0.7);
    var barW = Math.max(2, (pairW - 2) / 2);

    var svg = svgEl('svg', {
      class: 'agent-stats-svg',
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      height: String(h),
      role: 'img',
      'aria-label': options.label || 'Messages'
    });

    for (var g = 0; g <= 3; g++) {
      var gy = padT + (plotH * g) / 3;
      svg.appendChild(
        svgEl('line', {
          class: 'agent-stats-grid',
          x1: padL,
          y1: gy,
          x2: padL + plotW,
          y2: gy
        })
      );
    }

    series.forEach(function (day, i) {
      var cx = padL + i * slot + slot / 2;
      var sentH = ((day.sent || 0) / maxVal) * plotH;
      var recvH = ((day.recv || 0) / maxVal) * plotH;
      var yBase = padT + plotH;
      if (sentH > 0) {
        svg.appendChild(
          svgEl('rect', {
            class: 'agent-stats-bar agent-stats-bar--sent',
            x: cx - pairW / 2,
            y: yBase - sentH,
            width: barW,
            height: sentH
          })
        );
      }
      if (recvH > 0) {
        svg.appendChild(
          svgEl('rect', {
            class: 'agent-stats-bar agent-stats-bar--recv',
            x: cx - pairW / 2 + barW + 2,
            y: yBase - recvH,
            width: barW,
            height: recvH
          })
        );
      }
    });

    var labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
    var seenIdx = {};
    labelIdx.forEach(function (idx) {
      if (seenIdx[idx] || !series[idx]) return;
      seenIdx[idx] = true;
      var lx = padL + idx * slot + slot / 2;
      var text = svgEl('text', {
        class: 'agent-stats-axis',
        x: lx,
        y: h - 6,
        'text-anchor': 'middle'
      });
      text.textContent = formatDayLabel(series[idx].d);
      svg.appendChild(text);
    });

    var maxLabel = svgEl('text', {
      class: 'agent-stats-axis',
      x: padL - 4,
      y: padT + 4,
      'text-anchor': 'end'
    });
    maxLabel.textContent = String(Math.round(maxVal));
    svg.appendChild(maxLabel);

    return svg;
  }

  function buildDonut(pt, ct, opts) {
    var options = opts || {};
    var size = options.size || 120;
    var cx = size / 2;
    var cy = size / 2;
    var r = size * 0.36;
    var stroke = size * 0.14;
    var total = Math.max(0, pt) + Math.max(0, ct);
    var svg = svgEl('svg', {
      class: 'agent-stats-svg agent-stats-svg--donut',
      viewBox: '0 0 ' + size + ' ' + size,
      width: String(size),
      height: String(size),
      role: 'img',
      'aria-label': options.label || 'R\u00e9partition'
    });

    svg.appendChild(
      svgEl('circle', {
        class: 'agent-stats-donut-track',
        cx: cx,
        cy: cy,
        r: r,
        fill: 'none',
        'stroke-width': stroke
      })
    );

    if (total <= 0) {
      var empty = svgEl('text', {
        class: 'agent-stats-donut-center',
        x: cx,
        y: cy + 4,
        'text-anchor': 'middle'
      });
      empty.textContent = '\u2014';
      svg.appendChild(empty);
      return svg;
    }

    var circ = 2 * Math.PI * r;
    var ptLen = (pt / total) * circ;
    var ctLen = (ct / total) * circ;

    var ptRing = svgEl('circle', {
      class: 'agent-stats-donut-in',
      cx: cx,
      cy: cy,
      r: r,
      fill: 'none',
      'stroke-width': stroke,
      'stroke-dasharray': ptLen + ' ' + (circ - ptLen),
      'stroke-dashoffset': circ * 0.25,
      transform: 'rotate(-90 ' + cx + ' ' + cy + ')'
    });
    svg.appendChild(ptRing);

    var ctRing = svgEl('circle', {
      class: 'agent-stats-donut-out',
      cx: cx,
      cy: cy,
      r: r,
      fill: 'none',
      'stroke-width': stroke,
      'stroke-dasharray': ctLen + ' ' + (circ - ctLen),
      'stroke-dashoffset': circ * 0.25 - ptLen,
      transform: 'rotate(-90 ' + cx + ' ' + cy + ')'
    });
    svg.appendChild(ctRing);

    var center = svgEl('text', {
      class: 'agent-stats-donut-center',
      x: cx,
      y: cy + 4,
      'text-anchor': 'middle'
    });
    center.textContent = formatTokenCount(total);
    svg.appendChild(center);

    return svg;
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'text') node.textContent = attrs[key];
        else if (attrs[key] != null) node.setAttribute(key, attrs[key]);
      });
    }
    return node;
  }

  /**
   * Render stats panel into container. Returns { refresh(store), destroy }.
   */
  function mountPanel(container, options) {
    if (!container) throw new Error('AgentStats.mountPanel: container required');
    var opts = options || {};
    var store = normalize(opts.store);
    var onReset =
      typeof opts.onReset === 'function'
        ? opts.onReset
        : function () {
            return Promise.resolve(emptyStore());
          };
    var onLayoutChange =
      typeof opts.onLayoutChange === 'function' ? opts.onLayoutChange : function () {};

    var root = el('div', 'agent-stats-panel');
    container.appendChild(root);

    function kpi(label, value, title) {
      var card = el('div', 'agent-stats-kpi');
      if (title) card.title = title;
      card.appendChild(el('span', 'agent-stats-kpi-label', { text: label }));
      card.appendChild(el('span', 'agent-stats-kpi-value', { text: value }));
      return card;
    }

    function chartBlock(title, legendHtml, chartNode) {
      var block = el('div', 'agent-stats-chart');
      var head = el('div', 'agent-stats-chart-head');
      head.appendChild(el('h4', 'agent-stats-chart-title', { text: title }));
      if (legendHtml) {
        var legend = el('div', 'agent-stats-legend');
        legend.innerHTML = legendHtml;
        head.appendChild(legend);
      }
      block.appendChild(head);
      var body = el('div', 'agent-stats-chart-body');
      body.appendChild(chartNode);
      block.appendChild(body);
      return block;
    }

    function render() {
      root.replaceChildren();
      var life = store.life || emptyLife();

      if (!hasAnyActivity(store)) {
        root.appendChild(
          el('p', 'agent-stats-empty', {
            text:
              'Aucun usage enregistr\u00e9 pour l\u2019instant. Les totaux appara\u00eetront apr\u00e8s vos \u00e9changes avec l\u2019assistant.'
          })
        );
        onLayoutChange();
        return;
      }

      var kpis = el('div', 'agent-stats-kpis');
      kpis.appendChild(
        kpi('Co\u00fbt estim\u00e9', '\u2248' + formatCostUsd(life.cost), 'Estimation selon les tarifs publics')
      );
      kpis.appendChild(kpi('Tokens', formatTokenCount(life.tt), 'Total entr\u00e9e + sortie'));
      kpis.appendChild(kpi('Tours API', String(life.turns), 'Requ\u00eates compl\u00e9t\u00e9es'));
      kpis.appendChild(
        kpi(
          'Messages',
          life.sent + '\u2191 / ' + life.recv + '\u2193',
          'Envoy\u00e9s / re\u00e7us'
        )
      );
      root.appendChild(kpis);

      var series = daySeries(store, 14);

      root.appendChild(
        chartBlock(
          'Co\u00fbt (14 jours)',
          null,
          buildLineChart(series, function (d) {
            return d.cost || 0;
          }, {
            label: 'Co\u00fbt estim\u00e9',
            formatY: formatCostUsd
          })
        )
      );

      root.appendChild(
        chartBlock(
          'Tokens',
          '<span class="agent-stats-swatch agent-stats-swatch--in"></span> Entr\u00e9e' +
            '<span class="agent-stats-swatch agent-stats-swatch--out"></span> Sortie',
          buildStackedBars(series, { label: 'Tokens par jour' })
        )
      );

      root.appendChild(
        chartBlock(
          'Messages',
          '<span class="agent-stats-swatch agent-stats-swatch--sent"></span> Envoy\u00e9s' +
            '<span class="agent-stats-swatch agent-stats-swatch--recv"></span> Re\u00e7us',
          buildGroupedBars(series, { label: 'Messages par jour' })
        )
      );

      var split = el('div', 'agent-stats-split');
      var donutWrap = el('div', 'agent-stats-donut-wrap');
      donutWrap.appendChild(el('h4', 'agent-stats-chart-title', { text: 'R\u00e9partition' }));
      donutWrap.appendChild(buildDonut(life.pt, life.ct, { label: 'Prompt vs compl\u00e9tion' }));
      var donutLegend = el('div', 'agent-stats-legend agent-stats-legend--col');
      donutLegend.innerHTML =
        '<span><span class="agent-stats-swatch agent-stats-swatch--in"></span> Prompt ' +
        formatTokenCount(life.pt) +
        '</span><span><span class="agent-stats-swatch agent-stats-swatch--out"></span> Compl\u00e9tion ' +
        formatTokenCount(life.ct) +
        '</span>';
      donutWrap.appendChild(donutLegend);
      split.appendChild(donutWrap);

      var models = modelList(store);
      var modelsWrap = el('div', 'agent-stats-models');
      modelsWrap.appendChild(el('h4', 'agent-stats-chart-title', { text: 'Mod\u00e8les' }));
      if (!models.length) {
        modelsWrap.appendChild(el('p', 'agent-settings-hint', { text: 'Aucun mod\u00e8le encore.' }));
      } else {
        var list = el('ul', 'agent-stats-model-list');
        var maxCost = models[0].cost || 1;
        models.forEach(function (m) {
          var li = el('li', 'agent-stats-model-row');
          var top = el('div', 'agent-stats-model-top');
          top.appendChild(el('span', 'agent-stats-model-name', { text: m.id }));
          top.appendChild(
            el('span', 'agent-stats-model-meta', {
              text: '\u2248' + formatCostUsd(m.cost) + ' \u00b7 ' + m.turns + ' tour' + (m.turns > 1 ? 's' : '')
            })
          );
          li.appendChild(top);
          var track = el('div', 'agent-stats-model-track');
          var fill = el('div', 'agent-stats-model-fill');
          fill.style.width = Math.max(4, Math.round((m.cost / maxCost) * 100)) + '%';
          track.appendChild(fill);
          li.appendChild(track);
          list.appendChild(li);
        });
        modelsWrap.appendChild(list);
      }
      split.appendChild(modelsWrap);
      root.appendChild(split);

      root.appendChild(
        el('p', 'agent-settings-hint agent-stats-disclaimer', {
          text:
            'Co\u00fbts estim\u00e9s \u00e0 partir des tarifs publics du mod\u00e8le \u2014 pas une facture. Historique conserv\u00e9 ~30 jours sur votre compte.'
        })
      );

      var actions = el('div', 'agent-settings-actions agent-stats-actions');
      var resetBtn = el('button', 'tp-button agent-btn agent-btn--secondary', {
        type: 'button',
        text: 'R\u00e9initialiser'
      });
      resetBtn.addEventListener('click', function () {
        if (
          !global.confirm(
            'Effacer tout l\u2019historique d\u2019usage IA (co\u00fbts, tokens, messages)\u00a0?'
          )
        ) {
          return;
        }
        Promise.resolve(onReset())
          .then(function (next) {
            store = normalize(next || emptyStore());
            render();
          })
          .catch(function (err) {
            console.error('AgentStats reset failed', err);
          });
      });
      actions.appendChild(resetBtn);
      root.appendChild(actions);
      onLayoutChange();
    }

    render();

    return {
      refresh: function (nextStore) {
        store = normalize(nextStore);
        render();
      },
      destroy: function () {
        root.replaceChildren();
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  global.AgentStats = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_DAYS: MAX_DAYS,
    MAX_MODELS: MAX_MODELS,
    MAX_SERIALIZED: MAX_SERIALIZED,
    emptyStore: emptyStore,
    normalize: normalize,
    recordTurn: recordTurn,
    trimStore: trimStore,
    serializedSize: serializedSize,
    todayKey: todayKey,
    daySeries: daySeries,
    hasAnyActivity: hasAnyActivity,
    modelList: modelList,
    formatTokenCount: formatTokenCount,
    formatCostUsd: formatCostUsd,
    load: load,
    save: save,
    reset: reset,
    createDebouncedSaver: createDebouncedSaver,
    mountPanel: mountPanel
  };
})(typeof window !== 'undefined' ? window : globalThis);
