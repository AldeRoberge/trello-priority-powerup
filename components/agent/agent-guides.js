/**
 * AgentGuides — visual modules the assistant can open, and later check-ins.
 *
 *   breathe   circle that grows (Inspire), holds (Garde) and shrinks (Expire)
 *   stretch   a small figure, Garmin-style; the person picks the exercise
 *   schedule  a line the assistant says after N seconds
 *
 * Pure helpers are DOM-free. mount() paints into a host the chat already owns.
 */
(function (global) {
  'use strict';

  var BREATHE = [
    { id: '30s', label: '30 s', inhale: 4, hold: 0, exhale: 4, seconds: 30 },
    { id: '426', label: '4-2-6', inhale: 4, hold: 2, exhale: 6, rounds: 3 },
    { id: '60s', label: '1 min', inhale: 4, hold: 0, exhale: 4, seconds: 60 }
  ];

  var POSES = {
    stand: { armL: 14, armR: -14, foreL: 8, foreR: -8 },
    neckA: { head: -32, armL: 14, armR: -14 },
    neckB: { head: 32, armL: 14, armR: -14 },
    shoulderA: { armL: 62, armR: -62, foreL: 8, foreR: -8 },
    shoulderB: { armL: -8, armR: 8, foreL: 4, foreR: -4 },
    chestA: { armL: 86, armR: -86, foreL: 4, foreR: -4 },
    chestB: { armL: 22, armR: -22, foreL: 18, foreR: -18 },
    backA: { torso: 32, head: 18, armL: 28, armR: -28 },
    backB: { torso: -8, head: -6, armL: 10, armR: -10 },
    wristA: { armR: -72, foreR: 55, armL: 16 },
    wristB: { armR: -72, foreR: -20, armL: 16 },
    hipA: { legL: 26, legR: -18, armL: 20, armR: -8 },
    hipB: { legL: -16, legR: 24, armL: -8, armR: 18 }
  };

  var STRETCHES = [
    { id: 'cou', label: 'Cou', a: 'neckA', b: 'neckB', seconds: 20 },
    { id: 'epaules', label: '\u00c9paules', a: 'shoulderA', b: 'shoulderB', seconds: 20 },
    { id: 'poitrine', label: 'Poitrine', a: 'chestA', b: 'chestB', seconds: 20 },
    { id: 'dos', label: 'Dos', a: 'backA', b: 'backB', seconds: 20 },
    { id: 'poignets', label: 'Poignets', a: 'wristA', b: 'wristB', seconds: 20 },
    { id: 'hanches', label: 'Hanches', a: 'hipA', b: 'hipB', seconds: 20 }
  ];

  var PHASE = { in: 'Inspire', hold: 'Garde', out: 'Expire' };

  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function breatheById(id) {
    var key = fold(id).replace(/\s+/g, '');
    if (key === '30' || key === '30s' || key === '30sec' || key === '30secondes') return BREATHE[0];
    if (key === '426' || key === '4-2-6' || key === '4-2-6x3') return BREATHE[1];
    if (key === '60' || key === '60s' || key === '1min' || key === '1minute') return BREATHE[2];
    for (var i = 0; i < BREATHE.length; i++) {
      if (BREATHE[i].id === key) return BREATHE[i];
    }
    return null;
  }

  function stretchById(id) {
    var key = fold(id).replace(/\s+/g, '');
    if (key === 'neck' || key === 'nuque') key = 'cou';
    if (key === 'shoulders' || key === 'epaule') key = 'epaules';
    if (key === 'chest') key = 'poitrine';
    if (key === 'back') key = 'dos';
    if (key === 'wrists' || key === 'wrist' || key === 'poignet') key = 'poignets';
    if (key === 'hips' || key === 'hip' || key === 'hanche') key = 'hanches';
    for (var i = 0; i < STRETCHES.length; i++) {
      if (STRETCHES[i].id === key) return STRETCHES[i];
    }
    return null;
  }

  function kindOf(raw) {
    var k = fold(raw);
    if (!k) return null;
    if (/timer|pomo|minuteur|chrono/.test(k)) return 'timer';
    if (/stretch|etir/.test(k)) return 'stretch';
    if (/breath|respir|medit|souffl|calm/.test(k)) return 'breathe';
    if (k === 'breathe' || k === 'stretch') return k;
    return null;
  }

  /**
   * { kind: 'breathe'|'stretch', preset?: '30s'|'426'|'60s', id?: stretch id } or null.
   */
  function normalizeGuide(args) {
    var src = args && typeof args === 'object' ? args : { kind: args };
    var kind = kindOf(src.kind || src.guide || src.type || src.name);
    var preset = breatheById(src.preset || src.pattern || src.breathe);
    var stretch = stretchById(src.id || src.exercise || src.move);
    if (!kind && stretch) kind = 'stretch';
    if (!kind && preset) kind = 'breathe';
    if (!kind) return null;
    if (kind === 'timer') {
      var minutes = timerMinutes(
        src.minutes != null ? src.minutes : src.duration != null ? src.duration : src.min
      );
      return { kind: 'timer', minutes: minutes || 15 };
    }
    if (kind === 'stretch') {
      return { kind: 'stretch', id: stretch ? stretch.id : null };
    }
    return { kind: 'breathe', preset: preset ? preset.id : null };
  }

  /** { seconds, message } or null. seconds is clamped to 5–3600. */
  function normalizeCheck(args) {
    var src = args && typeof args === 'object' ? args : {};
    var raw =
      src.seconds != null
        ? src.seconds
        : src.delay != null
          ? src.delay
          : src.after != null
            ? src.after
            : src.in;
    var seconds = Number(raw);
    if (!isFinite(seconds)) return null;
    seconds = Math.round(seconds);
    if (seconds < 5 || seconds > 3600) return null;
    var message =
      typeof src.message === 'string'
        ? src.message
        : typeof src.text === 'string'
          ? src.text
          : '';
    message = message.replace(/\s+/g, ' ').trim();
    if (!message) return null;
    if (message.length > 160) message = message.slice(0, 160).trim();
    return { seconds: seconds, message: message };
  }

  /**
   * User text that should open a module immediately.
   * Long card talk that merely contains "dos" does not.
   */
  function timerMinutes(raw) {
    var n = Number(raw);
    if (!isFinite(n)) return null;
    n = Math.round(n);
    if (n < 1 || n > 120) return null;
    return n;
  }

  function formatClock(ms) {
    var s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  /** Notification title. Start uses the phrase the assistant can offer. */
  function timerTitle(minutes, done) {
    var n = timerMinutes(minutes) || 15;
    if (done) return n + ' min';
    return 'Start ' + n + ' min timer';
  }

  function matchIntent(text) {
    var f = fold(text);
    if (!f) return null;
    if (/pomodoro|minuteur|\btimer\b|chrono/.test(f)) {
      var found = /(\d+)\s*min/.exec(f);
      var minutes = found ? timerMinutes(found[1]) : null;
      return { kind: 'timer', minutes: minutes || 15 };
    }
    var stretchWord = /etir|stretch|echauff/.test(f);
    var breatheWord = /medit|respir|souffl|breathe/.test(f);
    var stretch = null;
    if (/\b(cou|nuque|neck)\b/.test(f)) stretch = 'cou';
    else if (/epaule|shoulder/.test(f)) stretch = 'epaules';
    else if (/poitrine|chest/.test(f)) stretch = 'poitrine';
    else if (/\b(dos|back)\b/.test(f)) stretch = 'dos';
    else if (/poignet|wrist/.test(f)) stretch = 'poignets';
    else if (/hanche|hip/.test(f)) stretch = 'hanches';
    if (f.length > 80 && !stretchWord && !breatheWord) return null;
    if ((stretchWord || stretch) && !breatheWord) {
      return { kind: 'stretch', id: stretch };
    }
    if (!breatheWord && !/30\s*s|30 secondes|4[\s-]*2[\s-]*6|1\s*min|60\s*s|une minute/.test(f)) {
      return null;
    }
    var preset = null;
    if (/4[\s-]*2[\s-]*6/.test(f)) preset = '426';
    else if (/1\s*min|60\s*s|une minute/.test(f)) preset = '60s';
    else if (/30/.test(f)) preset = '30s';
    return { kind: 'breathe', preset: preset };
  }

  function breatheSpec(presetId) {
    var spec = breatheById(presetId) || BREATHE[0];
    var rest = spec.rest != null ? spec.rest : spec.hold > 0 ? spec.hold : 0;
    var cycle = (spec.inhale + spec.hold + spec.exhale + rest) * 1000;
    var total = spec.seconds ? spec.seconds * 1000 : (spec.rounds || 1) * cycle;
    return {
      inhale: spec.inhale * 1000,
      hold: spec.hold * 1000,
      exhale: spec.exhale * 1000,
      rest: rest * 1000,
      cycle: cycle,
      total: total
    };
  }

  /**
   * Corners of the breath: up, stay full, down, stay empty, and again.
   * y is 0 empty and 1 full.
   */
  function breathePoints(presetId) {
    var s = breatheSpec(presetId);
    var pts = [{ t: 0, y: 0 }];
    var t = 0;
    var n = 0;
    while (t < s.total && n++ < 64) {
      var up = Math.min(s.inhale, s.total - t);
      if (up > 0) {
        t += up;
        pts.push({ t: t, y: s.inhale ? up / s.inhale : 1 });
      }
      if (t >= s.total) break;
      if (s.hold > 0) {
        t += Math.min(s.hold, s.total - t);
        pts.push({ t: t, y: 1 });
        if (t >= s.total) break;
      }
      var down = Math.min(s.exhale, s.total - t);
      if (down > 0) {
        t += down;
        pts.push({ t: t, y: s.exhale ? 1 - down / s.exhale : 0 });
      }
      if (t >= s.total) break;
      if (s.rest > 0) {
        t += Math.min(s.rest, s.total - t);
        pts.push({ t: t, y: 0 });
      }
    }
    return pts;
  }

  /** The same corners, cut at elapsed and with the live point on the current slope. */
  function breatheTrace(points, elapsed) {
    var t = Math.max(0, Number(elapsed) || 0);
    var out = [];
    var list = Array.isArray(points) ? points : [];
    for (var i = 0; i < list.length; i++) {
      var pt = list[i];
      if (pt.t <= t) {
        out.push(pt);
        continue;
      }
      var prev = out.length ? out[out.length - 1] : { t: 0, y: 0 };
      var span = pt.t - prev.t;
      var k = span ? (t - prev.t) / span : 1;
      out.push({ t: t, y: prev.y + (pt.y - prev.y) * k });
      break;
    }
    return out;
  }

  function breatheAt(presetId, elapsed) {
    var spec = breatheSpec(presetId);
    var t = Math.max(0, Number(elapsed) || 0);
    if (t >= spec.total) {
      return { done: true, phase: 'done', label: '', scale: 0.62, height: 0, total: spec.total };
    }
    var local = t % spec.cycle;
    var height = 0;
    var phase = 'in';
    var label = PHASE.in;
    if (local < spec.inhale) {
      height = spec.inhale ? local / spec.inhale : 1;
    } else if ((local -= spec.inhale) < spec.hold) {
      height = 1;
      phase = 'hold';
      label = PHASE.hold;
    } else if ((local -= spec.hold) < spec.exhale) {
      height = spec.exhale ? 1 - local / spec.exhale : 0;
      phase = 'out';
      label = PHASE.out;
    } else {
      height = 0;
      phase = 'rest';
      label = '';
    }
    return {
      done: false,
      phase: phase,
      label: label,
      height: height,
      scale: 0.62 + 0.38 * height,
      total: spec.total
    };
  }

  /**
   * Guides and later checks the model put in a reply.
   * Reads actions with op or tool show_guide / schedule_check.
   */
  function collect(obj) {
    var guides = [];
    var checks = [];
    var list = obj && Array.isArray(obj.actions) ? obj.actions : [];
    for (var i = 0; i < list.length; i++) {
      var action = list[i];
      if (!action || typeof action !== 'object') continue;
      var tool = String(action.tool || action.op || '');
      var args = action.args && typeof action.args === 'object' ? action.args : action;
      if (tool === 'show_guide') {
        var guide = normalizeGuide(args);
        if (guide) guides.push(guide);
      } else if (tool === 'schedule_check') {
        var check = normalizeCheck(args);
        if (check) checks.push(check);
      }
    }
    return { guides: guides, checks: checks };
  }

  function dueTasks(tasks, now) {
    var due = [];
    var pending = [];
    var list = Array.isArray(tasks) ? tasks : [];
    var t = Number(now) || 0;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item) continue;
      if (Number(item.at) <= t) due.push(item);
      else pending.push(item);
    }
    return { due: due, pending: pending };
  }

  function formatRemain(ms) {
    var s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60);
    var r = s % 60;
    if (!r) return m + ' min';
    return m + ' min ' + r + ' s';
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function reducedMotion() {
    return (
      global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function figureSvg() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ag-fig');
    svg.setAttribute('viewBox', '0 0 120 150');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<g class="ag-leg ag-leg-l"><rect x="46" y="102" width="12" height="36" rx="6"/></g>' +
      '<g class="ag-leg ag-leg-r"><rect x="62" y="102" width="12" height="36" rx="6"/></g>' +
      '<g class="ag-torso"><rect x="46" y="52" width="28" height="54" rx="12"/></g>' +
      '<g class="ag-arm ag-arm-l"><rect x="34" y="54" width="12" height="28" rx="6"/>' +
      '<g class="ag-fore ag-fore-l"><rect x="34" y="78" width="12" height="22" rx="6"/></g></g>' +
      '<g class="ag-arm ag-arm-r"><rect x="74" y="54" width="12" height="28" rx="6"/>' +
      '<g class="ag-fore ag-fore-r"><rect x="74" y="78" width="12" height="22" rx="6"/></g></g>' +
      '<g class="ag-head"><circle cx="60" cy="28" r="16"/></g>';
    return svg;
  }

  function applyPose(svg, pose) {
    if (!svg) return;
    var map = {
      head: '.ag-head',
      torso: '.ag-torso',
      armL: '.ag-arm-l',
      armR: '.ag-arm-r',
      foreL: '.ag-fore-l',
      foreR: '.ag-fore-r',
      legL: '.ag-leg-l',
      legR: '.ag-leg-r'
    };
    var src = pose || POSES.stand;
    Object.keys(map).forEach(function (key) {
      var node = svg.querySelector(map[key]);
      if (!node) return;
      var deg = src[key] || 0;
      node.style.transform = 'rotate(' + deg + 'deg)';
    });
  }

  function stopHost(host) {
    if (host && typeof host._agStop === 'function') {
      host._agStop();
      host._agStop = null;
    }
  }

  function bar(root) {
    var track = el('div', 'ag-bar');
    var fill = el('div', 'ag-bar-fill');
    track.appendChild(fill);
    track.hidden = true;
    root.appendChild(track);
    return { track: track, fill: fill };
  }

  var GRAPH_W = 300;
  var GRAPH_H = 46;
  var GRAPH_PAD = 6;

  function breathGraph(root) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ag-graph');
    svg.setAttribute('viewBox', '0 0 ' + GRAPH_W + ' ' + GRAPH_H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    function path(cls) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      node.setAttribute('class', cls);
      svg.appendChild(node);
      return node;
    }
    var track = path('ag-graph-track');
    var line = path('ag-graph-line');
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('class', 'ag-graph-dot');
    dot.setAttribute('r', '3.2');
    svg.appendChild(dot);
    root.appendChild(svg);
    return { track: track, line: line, dot: dot };
  }

  function graphPoint(pt, total) {
    var x = total ? (pt.t / total) * GRAPH_W : 0;
    var y = GRAPH_PAD + (1 - pt.y) * (GRAPH_H - GRAPH_PAD * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }

  function paintBreathGraph(graph, presetId, elapsed, done) {
    if (!graph) return;
    var pts = breathePoints(presetId);
    var total = pts.length ? pts[pts.length - 1].t : 1;
    var live = done ? pts : breatheTrace(pts, elapsed);
    graph.track.setAttribute('points', pts.map(function (pt) { return graphPoint(pt, total); }).join(' '));
    graph.line.setAttribute('points', live.map(function (pt) { return graphPoint(pt, total); }).join(' '));
    var last = live.length ? live[live.length - 1] : { t: 0, y: 0 };
    var spot = graphPoint(last, total).split(',');
    graph.dot.setAttribute('cx', spot[0]);
    graph.dot.setAttribute('cy', spot[1]);
  }

  function picks(root, items, onPick) {
    var row = el('div', 'ag-picks');
    items.forEach(function (item) {
      var btn = el('button', 'ag-pick');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.setAttribute('data-id', item.id);
      btn.addEventListener('click', function () {
        onPick(item.id);
      });
      row.appendChild(btn);
    });
    root.appendChild(row);
    return row;
  }

  function markPick(row, id) {
    if (!row) return;
    Array.prototype.forEach.call(row.children, function (btn) {
      var on = btn.getAttribute('data-id') === id;
      btn.classList.toggle('is-on', on);
      if (on) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function mountBreathe(host, root, presetId) {
    var stage = el('div', 'ag-stage');
    var wrap = el('div', 'ag-orb-wrap');
    var orb = el('div', 'ag-orb');
    var phase = el('span', 'ag-phase');
    phase.setAttribute('aria-live', 'polite');
    wrap.appendChild(orb);
    wrap.appendChild(phase);
    stage.appendChild(wrap);
    root.appendChild(stage);
    var graph = breathGraph(root);
    var row = picks(root, BREATHE, function (id) {
      run(id);
    });
    var raf = 0;
    var started = 0;
    var current = null;

    function frame(now) {
      if (!current) return;
      var state = breatheAt(current, now - started);
      if (!reducedMotion()) orb.style.transform = 'scale(' + state.scale.toFixed(3) + ')';
      phase.textContent = state.label;
      paintBreathGraph(graph, current, state.done ? state.total : now - started, state.done);
      if (state.done) {
        orb.style.transform = 'scale(0.72)';
        return;
      }
      raf = global.requestAnimationFrame(frame);
    }

    function run(id) {
      if (raf) global.cancelAnimationFrame(raf);
      current = id;
      markPick(row, id);
      paintBreathGraph(graph, id, 0, false);
      started = global.performance ? global.performance.now() : Date.now();
      raf = global.requestAnimationFrame(frame);
    }

    host._agStop = function () {
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
      current = null;
    };
    if (presetId) run(presetId);
    else {
      orb.style.transform = 'scale(0.72)';
      paintBreathGraph(graph, '426', 0, false);
    }
  }

  function mountStretch(host, root, exerciseId) {
    var stage = el('div', 'ag-stage');
    var svg = figureSvg();
    stage.appendChild(svg);
    root.appendChild(stage);
    var meter = bar(root);
    applyPose(svg, POSES.stand);
    var timer = 0;
    var endTimer = 0;
    var row = picks(root, STRETCHES, function (id) {
      run(id);
    });

    function run(id) {
      var item = stretchById(id);
      if (!item) return;
      if (timer) global.clearInterval(timer);
      if (endTimer) global.clearTimeout(endTimer);
      markPick(row, item.id);
      meter.track.hidden = false;
      var started = Date.now();
      var flip = false;
      function show() {
        applyPose(svg, POSES[flip ? item.b : item.a] || POSES.stand);
        var pct = Math.min(100, ((Date.now() - started) / (item.seconds * 1000)) * 100);
        meter.fill.style.width = pct + '%';
      }
      show();
      timer = global.setInterval(function () {
        flip = !flip;
        show();
      }, reducedMotion() ? 2600 : 1600);
      endTimer = global.setTimeout(function () {
        global.clearInterval(timer);
        timer = 0;
        applyPose(svg, POSES.stand);
        meter.fill.style.width = '100%';
      }, item.seconds * 1000);
    }

    host._agStop = function () {
      if (timer) global.clearInterval(timer);
      if (endTimer) global.clearTimeout(endTimer);
      timer = 0;
      endTimer = 0;
    };
    if (exerciseId) run(exerciseId);
  }

  var TIMERS = [
    { id: '15', minutes: 15, label: '15 min' },
    { id: '25', minutes: 25, label: '25 min' },
    { id: '5', minutes: 5, label: '5 min' }
  ];

  function chime(done) {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return;
    try {
      var ctx = chime.ctx || (chime.ctx = new Ctx());
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var now = ctx.currentTime;
      var tones = done ? [523, 659, 784] : [440, 554];
      tones.forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        var t0 = now + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.start(t0);
        osc.stop(t0 + 0.24);
      });
    } catch (e) { /* no audio */ }
  }

  var lastTimerPing = { key: '', at: 0 };

  function announceTimer(minutes, done) {
    var key = (done ? 'end:' : 'start:') + minutes;
    var now = Date.now();
    if (key === lastTimerPing.key && now - lastTimerPing.at < 5000) return;
    lastTimerPing = { key: key, at: now };
    chime(done);
    if (!global.Notification) return;
    var title = timerTitle(minutes, done);
    function show() {
      try { new Notification(title); } catch (err) { /* blocked */ }
    }
    if (Notification.permission === 'granted') show();
    else if (!done && Notification.permission !== 'denied' && Notification.requestPermission) {
      var asked = Notification.requestPermission();
      if (asked && typeof asked.then === 'function') {
        asked.then(function (perm) { if (perm === 'granted') show(); });
      }
    }
  }

  function mountTimer(host, root, minutes) {
    var ring = el('div', 'ag-clock-ring');
    var clock = el('div', 'ag-clock');
    clock.setAttribute('aria-live', 'polite');
    ring.appendChild(clock);
    root.appendChild(ring);
    var tick = 0;
    var endAt = 0;
    var running = 0;
    var row = picks(root, TIMERS, function (id) {
      run(Number(id));
    });

    function paint() {
      var left = Math.max(0, endAt - Date.now());
      var total = running * 60000;
      var p = total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
      ring.style.setProperty('--p', String(Math.round(p)));
      clock.textContent = formatClock(left);
      if (left <= 0 && tick) {
        clearInterval(tick);
        tick = 0;
        announceTimer(running, true);
      }
    }

    function run(mins) {
      mins = timerMinutes(mins) || 15;
      if (tick) clearInterval(tick);
      running = mins;
      endAt = Date.now() + mins * 60000;
      markPick(row, String(mins));
      paint();
      announceTimer(mins, false);
      tick = setInterval(paint, 250);
    }

    host._agStop = function () {
      if (tick) clearInterval(tick);
      tick = 0;
    };
    run(minutes || 15);
  }

  function mount(host, spec) {
    if (!host || typeof document === 'undefined') return null;
    var guide = normalizeGuide(spec) || null;
    if (!guide && spec && spec.kind) guide = spec;
    if (!guide || (guide.kind !== 'breathe' && guide.kind !== 'stretch' && guide.kind !== 'timer')) return null;
    stopHost(host);
    host.hidden = false;
    host.replaceChildren();
    var root = el('div', 'ag-guide');
    root.setAttribute('role', 'region');
    root.setAttribute(
      'aria-label',
      guide.kind === 'breathe' ? 'Respiration' : guide.kind === 'timer' ? 'Minuteur' : '\u00c9tirements'
    );
    var closeBtn = el('button', 'ag-guide-x');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', function () {
      close(host);
    });
    root.appendChild(closeBtn);
    host.appendChild(root);
    if (guide.kind === 'stretch') mountStretch(host, root, guide.id);
    else if (guide.kind === 'timer') mountTimer(host, root, guide.minutes);
    else mountBreathe(host, root, guide.preset);
    return root;
  }

  function close(host) {
    if (!host) return;
    stopHost(host);
    host.replaceChildren();
    host.hidden = true;
  }

  var api = {
    BREATHE: BREATHE,
    STRETCHES: STRETCHES,
    normalizeGuide: normalizeGuide,
    normalizeCheck: normalizeCheck,
    matchIntent: matchIntent,
    collect: collect,
    breatheAt: breatheAt,
    breathePoints: breathePoints,
    breatheTrace: breatheTrace,
    dueTasks: dueTasks,
    formatRemain: formatRemain,
    formatClock: formatClock,
    timerTitle: timerTitle,
    mount: mount,
    close: close
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AgentGuides = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
