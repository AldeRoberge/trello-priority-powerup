/*
 * Role: loading skeletons, one per view, shaped like the page they stand in for (toolbar, columns,
 * rows, panels). Pure HTML strings: no Trello, no randomness (the same skeleton before and after
 * the view mounts, so nothing jumps). Exposes window.Skeleton.
 *
 *   Skeleton.html('gantt')         full view (toolbar + body + assistant box), used before the view mounts
 *   Skeleton.html('gantt.body')    only the part a mounted view repaints while it loads
 *   Skeleton.mount(el, 'gantt')    el.innerHTML = Skeleton.html('gantt')
 *   Skeleton.VIEWS                 one name per tab (ViewTabs.VIEWS keys)
 *
 * Styles: components/shared/skeleton.css (the page also loads its own view CSS for the shell classes).
 */
(function (global) {
  'use strict';

  var LABELS_W_KEY = 'tp-gantt-labels-width';
  var WID = [62, 84, 48, 72, 56, 90, 44, 68];

  function px(v) {
    return typeof v === 'number' ? v + 'px' : String(v);
  }

  function cyc(list, i) {
    return list[((i % list.length) + list.length) % list.length];
  }

  function times(n, fn) {
    var out = '';
    for (var i = 0; i < n; i++) out += fn(i);
    return out;
  }

  function div(cls, inner, style) {
    return '<div class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '>' + (inner || '') + '</div>';
  }

  /** A shimmering block. */
  function sk(w, h, cls) {
    return '<span class="sk' + (cls ? ' ' + cls : '') + '" style="--w:' + px(w) + (h != null ? ';--h:' + px(h) : '') + '"></span>';
  }

  function dot(d, cls) {
    return sk(d, d, 'sk--round' + (cls ? ' ' + cls : ''));
  }

  function pill(w, h, cls) {
    return sk(w, h || 16, 'sk--pill' + (cls ? ' ' + cls : ''));
  }

  /** Outlined control with a short label inside; label false leaves it empty (icon button). */
  function box(w, h, label, cls) {
    var inner = label === false ? '' : sk(label || '55%', 8);
    return '<span class="sk-box' + (cls ? ' ' + cls : '') + '" style="--w:' + px(w) + ';--h:' + px(h || 30) + '">' + inner + '</span>';
  }

  function field(w) {
    return box(w || 190, 30, false, 'sk-box--field').replace('></span>', '>' + dot(14) + sk('50%', 8) + '</span>');
  }

  function seg(widths, h) {
    return '<span class="sk-seg">' + widths.map(function (w) { return box(w, h || 30); }).join('') + '</span>';
  }

  function track(w, pct) {
    return '<span class="sk-track" style="--w:' + px(w) + ';--p:' + pct + '%"><span class="sk"></span></span>';
  }

  function spacer() {
    return '<span class="sk-spacer"></span>';
  }

  function sr() {
    return '<span class="sk-sr">Chargement…</span>';
  }

  /** Wrapper of a full view: announced as busy, fades in after a beat so a fast load never flashes it. */
  function view(cls, inner) {
    return '<div class="sk-view ' + cls + '" role="status" aria-busy="true">' + sr() + inner + '</div>';
  }

  /** Assistant box docked at the bottom of a view. */
  function dock() {
    return div('sk-dock', dot(18) + box('100%', 32, '38%', 'sk-box--field') + dot(24));
  }

  /* ── Table ─────────────────────────────────────────────────────────── */

  function tableBar() {
    return div('tb-bar', field(190) + box(30, 30, false) + box(98, 30, '60%') + spacer() + box(30, 30, false) + box(100, 30, '60%') + box(30, 30, false, 'sk-box--accent'));
  }

  function tableGrid() {
    var rows = times(28, function (r) {
      var head = r === 0;
      function cell(inner, end) {
        return div('sk-grid-cell' + (end ? ' sk-grid-cell--end' : ''), inner);
      }
      var cells = head
        ? times(10, function (c) { return cell(sk(cyc([34, 56, 40, 48], c) + '%', 8)); })
        : cell(sk(cyc([14, 18, 22], r), 8), true) +
          cell(pill(cyc([60, 76, 52, 68], r), 16)) +
          cell(sk(cyc(WID, r * 3) + '%', 10)) +
          cell(pill(cyc([84, 70, 92, 76], r), 18)) +
          cell(pill(cyc([60, 74, 52], r + 1), 16)) +
          cell(dot(16)) +
          cell(track('80%', cyc([0, 25, 60, 100, 45], r))) +
          cell(sk(cyc(WID, r * 5 + 1) + '%', 10)) +
          cell(sk(cyc([70, 56, 64, 48], r) + '%', 8)) +
          cell(dot(12));
      return div('sk-grid-row' + (head ? ' sk-grid-row--head' : ''), cells);
    });
    return div('sk-grid', rows);
  }

  function table() {
    return view('tb-root', tableBar() + div('tb-wrap', tableGrid()) + dock());
  }

  /* ── Kanban ────────────────────────────────────────────────────────── */

  var CARD_KINDS = [
    { lines: [88, 56], chips: [44, 58], bar: 40 },
    { lines: [72], chips: [52], bar: 0 },
    { lines: [92, 70], chips: [40, 50, 36], bar: 75 },
    { lines: [64], chips: [], bar: 20 },
    { lines: [80, 44], chips: [56], bar: 0 },
  ];

  function kanbanCard(i) {
    var k = cyc(CARD_KINDS, i);
    var body = k.lines.map(function (w) { return sk(w + '%', 10); }).join('');
    var chips = k.chips.length ? '<span class="sk-row-flex">' + k.chips.map(function (w) { return pill(w, 14); }).join('') + '</span>' : '';
    var foot = '<span class="sk-row-flex">' + (k.bar ? track('60%', k.bar) : sk('36%', 8)) + spacer() + dot(20) + '</span>';
    return div('sk-card', body + chips + foot);
  }

  function kanbanCols() {
    return [3, 2, 4, 2, 3].map(function (n, c) {
      var head = div('sk-colhead', dot(16) + sk(cyc([46, 58, 40, 52, 44], c) + '%', 12) + spacer() + sk(18, 12));
      var cards = times(n, function (i) { return kanbanCard(c * 2 + i); });
      return div('kb-col', head + div('sk-colbody', cards), '--kb-accent:var(--tp-border-strong)');
    }).join('');
  }

  function kanbanBar() {
    return div('kb-bar', field(190) + box(30, 30, false) + box(260, 30, '50%') + spacer() + sk(44, 10) + box(150, 30, '60%') + box(100, 30, '60%'));
  }

  function kanban() {
    return view('kb-root', kanbanBar() + div('kb-board', kanbanCols()) + dock());
  }

  /* ── Gantt ─────────────────────────────────────────────────────────── */

  function ganttToolbar() {
    return div(
      'gantt-toolbar',
      seg([62, 78, 62, 62]) +
        '<span class="sk-row-flex">' + box(30, 30, false) + box(112, 30, '56%') + box(30, 30, false) + '</span>' +
        sk(170, 14) +
        spacer() +
        box(112, 30, '60%') + box(92, 30, '50%', 'sk-box--accent') + box(30, 30, false) + box(30, 30, false)
    );
  }

  function ganttStrip() {
    return div('sk-strip', pill(118, 24) + pill(196, 24) + spacer() + pill(90, 24));
  }

  /** Rows of the chart: H header, S section (accent), T task. Both panes read the same list. */
  var GANTT_ROWS = ['S', 'T', 'T', 'T', 'S', 'T', 'T', 'T', 'S', 'T', 'S', 'T', 'T', 'T', 'T', 'T', 'T', 'T'];
  var GANTT_ACCENTS = ['var(--tp-primary)', 'var(--tp-text-subtle)', 'var(--tp-danger-text, #ae2e24)'];
  var BAR_AT = [30, 168, 250, 96, 330, 140, 60, 210];
  var BAR_W = [120, 210, 96, 168, 260, 84];

  function labelsWidth() {
    var n = 560;
    try {
      var raw = global.localStorage && global.localStorage.getItem(LABELS_W_KEY);
      var v = raw != null ? parseInt(raw, 10) : NaN;
      if (isFinite(v) && v >= 280 && v <= 1200) n = v;
    } catch (e) {
      /* storage unavailable */
    }
    return n;
  }

  function ganttLabels() {
    var sec = 0;
    var task = 0;
    var head = div(
      'sk-glabels-row sk-glabels-row--head',
      div('sk-gl-check', sk(14, 14)) + div('sk-gl-name', sk(48, 10)) + div('sk-gl-score', dot(8) + sk(14, 8))
    );
    var rows = GANTT_ROWS.map(function (kind, i) {
      if (kind === 'S') {
        var accent = cyc(GANTT_ACCENTS, sec);
        sec += 1;
        return (
          '<div class="sk-glabels-row sk-glabels-row--sec" style="--sk-accent:' + accent + '">' +
          div('sk-gl-check', sk(8, 8)) +
          div('sk-gl-name', sk(cyc([70, 54, 62], sec), 12) + dot(16)) +
          '<span></span><span></span></div>'
        );
      }
      var t = task++;
      return (
        '<div class="sk-glabels-row' + (t % 2 ? ' sk-glabels-row--odd' : '') + '">' +
        div('sk-gl-check', sk(14, 14)) +
        div('sk-gl-name', sk(cyc(WID, t * 3 + 1) + '%', 10), '--sk-indent:14px') +
        div('sk-gl-score', dot(8) + sk(cyc([26, 22, 30], t), 8)) +
        div('sk-gl-icons', times(4, function () { return sk(12, 12); })) +
        '</div>'
      );
    });
    return div('gantt-labels', head + rows.join(''), 'width:min(' + labelsWidth() + 'px, 55%)');
  }

  function ganttTimeline() {
    var days = 9;
    var head = '<div class="sk-thead">' + times(days, function (d) { return '<span>' + sk(cyc([46, 38, 52], d), 8) + '</span>'; }) + '</div>';
    var task = 0;
    var rows = GANTT_ROWS.map(function (kind) {
      if (kind === 'S') return '<div class="sk-trow sk-trow--sec"></div>';
      var t = task++;
      return '<div class="sk-trow">' + (t % 4 === 3 ? '' : '<span class="sk sk--bar" style="--w:' + cyc(BAR_W, t) + 'px;left:' + cyc(BAR_AT, t) + 'px"></span>') + '</div>';
    });
    var today = '<span class="sk-today" style="left:calc(var(--sk-day-w) * 2)"></span>';
    return div('gantt-timeline-scroll', '<div class="gantt-timeline" style="--gantt-day-w:var(--sk-day-w)">' + head + rows.join('') + today + '</div>');
  }

  function ganttBody() {
    return div('gantt-chart sk-chart', ganttLabels() + '<div class="gantt-splitter"></div>' + ganttTimeline());
  }

  function gantt() {
    return view('gantt-root', ganttToolbar() + ganttStrip() + div('gantt-body', ganttBody()) + dock());
  }

  /* ── Node graphs (Mindmap, Parcours) ───────────────────────────────── */

  /**
   * nodes: [{ x, y (percent of the canvas), w (px), kind, lines: [percent widths], bar }]
   * edges: [[from, to, dashed]] by node index
   */
  function graph(nodes, edges, blobs) {
    var paths = edges.map(function (e) {
      var a = nodes[e[0]];
      var b = nodes[e[1]];
      var mx = (a.x + b.x) / 2;
      return '<path' + (e[2] ? ' class="is-dashed"' : '') + ' d="M' + a.x + ' ' + a.y + ' C' + mx + ' ' + a.y + ',' + mx + ' ' + b.y + ',' + b.x + ' ' + b.y + '"/>';
    }).join('');
    var blobHtml = (blobs || []).map(function (b) {
      return div('sk-blob', '', 'left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%;--sk-blob:' + b.color);
    }).join('');
    var nodeHtml = nodes.map(function (n) {
      var head = '<span class="sk-row-flex">' + dot(n.kind === 'person' ? 26 : 18) + sk(n.lines[0] + '%', 10) + '</span>';
      var rest = n.lines.slice(1).map(function (w) { return sk(w + '%', 8, 'sk--soft'); }).join('');
      var foot = n.bar != null ? '<span class="sk-row-flex">' + sk(34, 8) + track('50%', n.bar) + '</span>' : '';
      return div(
        'sk-node sk-node--' + (n.kind || 'task') + (n.mark ? ' sk-node--mark' : ''),
        head + rest + foot,
        'left:' + n.x + '%;top:' + n.y + '%;--w:' + n.w + 'px' + (n.mark ? ';--sk-mark:' + n.mark : '')
      );
    }).join('');
    return div('sk-graph', blobHtml + '<svg class="sk-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + paths + '</svg>' + nodeHtml);
  }

  /* ── Mindmap ───────────────────────────────────────────────────────── */

  var MM_NODES = [
    { x: 50, y: 22, w: 230, kind: 'goal', lines: [62, 34] },
    { x: 76, y: 40, w: 170, kind: 'person', lines: [58] },
    { x: 26, y: 52, w: 220, lines: [74, 40], bar: 30 },
    { x: 52, y: 64, w: 220, lines: [66, 44], bar: 60 },
    { x: 79, y: 76, w: 210, lines: [70, 36], bar: 10 },
    { x: 24, y: 82, w: 200, lines: [58, 30], bar: 85 },
  ];
  var MM_EDGES = [[0, 1], [0, 2], [0, 3, true], [1, 3], [3, 4], [2, 5]];
  var MM_BLOBS = [
    { x: 38, y: 52, w: 46, h: 62, color: '#8270db' },
    { x: 74, y: 70, w: 34, h: 46, color: '#1f845a' },
  ];

  function mindmapCanvas() {
    return graph(MM_NODES, MM_EDGES, MM_BLOBS);
  }

  function mindmapBar() {
    var tools = seg([30, 30, 30, 30, 30]);
    var zoom = '<span class="sk-row-flex">' + box(30, 30, false) + box(54, 30, '60%') + box(30, 30, false) + '</span>';
    return div('mm-bar', field(190) + tools + box(30, 30, false) + box(30, 30, false) + spacer() + sk(44, 10) + zoom + box(30, 30, false) + box(30, 30, false) + box(30, 30, false));
  }

  function mindmap() {
    return view('mm-root', mindmapBar() + div('mm-canvas', mindmapCanvas()) + dock());
  }

  /* ── Parcours ──────────────────────────────────────────────────────── */

  var JY_NODES = [
    { x: 14, y: 30, w: 170, lines: [66, 40], mark: 'var(--tp-primary)' },
    { x: 40, y: 20, w: 170, lines: [58, 36] },
    { x: 40, y: 50, w: 170, lines: [72, 44] },
    { x: 66, y: 34, w: 170, lines: [54, 30], mark: 'var(--tp-danger-text, #ae2e24)' },
    { x: 66, y: 66, w: 170, lines: [62, 38] },
    { x: 88, y: 50, w: 150, lines: [50, 28] },
  ];
  var JY_EDGES = [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4, true], [3, 5], [4, 5]];

  function journeyBar() {
    var legend = '<span class="sk-jlegend">' + times(3, function (i) { return '<span>' + sk(22, 4) + sk(cyc([44, 52, 36], i), 8) + '</span>'; }) + '</span>';
    return div('jy-bar', field(190) + seg([56, 56, 56], 28) + box(28, 28, false) + box(28, 28, false) + sk(80, 10) + spacer() + legend);
  }

  function journeyRow(i) {
    return (
      '<div class="sk-jrow">' +
      dot(14) +
      div('sk-col-flex', sk(cyc([84, 62, 74, 52], i) + '%', 10) + sk(cyc([46, 62, 38], i) + '%', 8, 'sk--soft'), 'gap:5px') +
      sk(cyc([40, 52, 34], i), 8) +
      sk(cyc([56, 44, 60], i), 8, 'sk--soft') +
      dot(14, 'sk--soft') +
      '</div>'
    );
  }

  function journeyQueue() {
    return div(
      'jy-queue',
      div('sk-jhead', sk(76, 10)) + times(5, journeyRow) + div('sk-jhead', sk(60, 10)) + times(3, function (i) { return journeyRow(i + 5); })
    );
  }

  function journeyDetail() {
    return div('sk-jdetail', sk('34%', 14) + sk('52%', 10, 'sk--soft') + '<span class="sk-row-flex">' + box(76, 28, '50%', 'sk-box--accent') + box(76, 28, '50%') + box(76, 28, '50%') + '</span>');
  }

  function journeyBody() {
    return div('jy-body', div('jy-stage', div('jy-map', graph(JY_NODES, JY_EDGES)) + journeyDetail()) + journeyQueue());
  }

  function journey() {
    return view('jy', journeyBar() + journeyBody());
  }

  /** Left panel shared by Dashboard, Documents and Entités: title + round buttons, search, rows. */
  function sidePanel(head, search, body, foot) {
    return (
      '<aside class="sk-sp">' +
      div('sk-sp-head', head) +
      (search ? div('sk-sp-search', dot(14) + sk('36%', 9)) : '') +
      div('sk-sp-body', body) +
      (foot ? div('sk-sp-foot', foot) : '') +
      '</aside>'
    );
  }

  /* ── Documents ─────────────────────────────────────────────────────── */

  function docsList() {
    return times(9, function (i) {
      return div('sk-drow' + (i === 0 ? ' sk-drow--on' : ''), sk(16, 16) + div('sk-col-flex', sk(cyc([72, 58, 80, 64], i) + '%', 10) + sk(cyc([30, 38, 26], i) + '%', 8, 'sk--soft'), 'flex:1;gap:5px'));
    });
  }

  function docsSide() {
    return sidePanel(sk(96, 20) + spacer() + dot(28) + dot(28) + dot(28, 'sk--accent'), true, docsList());
  }

  function docsPage() {
    var line = function (w) { return sk(w + '%', 10); };
    var props = div('sk-dpage-props', times(3, function (i) { return div('sk-dpage-prop', sk(64, 10) + sk(cyc([140, 96, 118], i), 10, 'sk--soft')); }));
    var para = function (ws) { return div('sk-dpage-lines', ws.map(line).join('')); };
    var bullets = div('sk-dpage-lines', times(3, function (i) { return div('sk-dpage-bullet', dot(6) + sk(cyc([58, 72, 44], i) + '%', 10)); }));
    return (
      '<article class="dc-page">' +
      sk('56%', 32) +
      props +
      sk(150, 8, 'sk--soft') +
      div('', '', 'height:22px') +
      sk('30%', 20) +
      div('', '', 'height:12px') +
      para([100, 96, 88, 54]) +
      div('', '', 'height:22px') +
      sk('26%', 20) +
      div('', '', 'height:12px') +
      bullets +
      div('', '', 'height:18px') +
      para([100, 92, 70]) +
      '</article>'
    );
  }

  /** Head, toolbar and page of the open document (the mounted view paints it inside .dc-doc while it boots). */
  function docsMainInner() {
    var head = div('sk-dhead', dot(16) + sk(180, 12) + spacer() + box(86, 26, '50%') + box(86, 26, '50%') + dot(18));
    var group = function (n) { return times(n, function () { return box(24, 24, false); }); };
    var toolbar = div('sk-dtoolbar', box(28, 24, false) + box(28, 24, false) + '<span class="sk-gap"></span>' + box(70, 24, false) + '<span class="sk-gap"></span>' + group(5) + '<span class="sk-gap"></span>' + group(4) + '<span class="sk-gap"></span>' + group(3));
    return head + toolbar + div('dc-scroll', docsPage());
  }

  function docsMain() {
    return '<section class="dc-doc">' + docsMainInner() + '</section>';
  }

  function docsOutline() {
    return '<aside class="dc-outline">' + div('sk-doutline', sk(30, 8, 'sk--soft') + sk('70%', 10) + sk('52%', 10) + sk('62%', 10)) + '</aside>';
  }

  function docs() {
    return view('dc-root', div('dc-main', docsSide() + docsMain() + docsOutline()) + dock());
  }

  /* ── Entités ───────────────────────────────────────────────────────── */

  function entityRows(n, from) {
    return times(n, function (i) {
      return div('sk-erow', dot(34) + div('sk-col-flex', sk(cyc([68, 52, 76, 60], from + i) + '%', 11) + sk(cyc([36, 48, 30], from + i) + '%', 8, 'sk--soft'), 'flex:1;gap:5px'));
    });
  }

  function entitiesList() {
    return (
      div('sk-egroup', sk(70, 9) + sk(14, 9, 'sk--soft')) + entityRows(4, 0) +
      div('sk-egroup', sk(56, 9) + sk(14, 9, 'sk--soft')) + entityRows(3, 4)
    );
  }

  function entitiesSide() {
    return sidePanel(sk(88, 20) + spacer() + sk(60, 9, 'sk--soft') + dot(28, 'sk--accent'), true, entitiesList(), '<span class="sk-row-flex" style="padding:6px 8px">' + dot(14) + sk(108, 9) + '</span>');
  }

  function entitiesPage() {
    var set = function (rows, title) {
      return div(
        'sk-eset',
        div('sk-eset-title', sk(title, 10)) +
          div('sk-eset-box', times(rows, function (i) { return div('sk-eprop', sk(cyc([52, 66, 44, 58], i) + '%', 10) + sk(cyc([70, 48, 82, 60], i) + '%', 10, 'sk--soft')); }))
      );
    };
    return (
      div('en-hero-top', dot(64) + div('sk-col-flex', sk('52%', 28) + sk('26%', 10, 'sk--soft'), 'flex:1;gap:8px')) +
        '<span class="sk-row-flex" style="margin-top:16px">' + pill(70, 22) + pill(90, 22) + pill(60, 22) + '</span>' +
        set(4, 90) + set(3, 70)
    );
  }

  function entitiesMain() {
    return '<main class="en-main">' + div('en-page', entitiesPage()) + '</main>';
  }

  function entities() {
    return view('en-root', div('en-body', entitiesSide() + entitiesMain()) + dock());
  }

  /* ── Dashboard ─────────────────────────────────────────────────────── */

  function dashboardSide() {
    var nav = times(3, function (i) { return div('sk-nav' + (i === 2 ? ' sk-nav--on' : ''), dot(14) + sk(cyc([52, 74, 64], i) + '%', 10) + spacer() + dot(16, 'sk--soft')); });
    return sidePanel(sk(110, 20), false, nav, div('sk-col-flex', sk(70, 8, 'sk--soft') + box('100%', 28, false), 'padding:6px 8px;gap:6px'));
  }

  function dashboardPage() {
    var head = div(
      'db-head',
      div('sk-col-flex', sk(150, 24) + sk(90, 12, 'sk--soft'), 'gap:8px') + div('sk-col-flex', sk(160, 3, 'sk--bar') + sk(60, 10, 'sk--soft'), 'align-items:flex-end;gap:6px;padding-top:6px')
    );
    var hero = div(
      'sk-hero',
      sk(110, 10, 'sk--accent') + sk('52%', 20) + sk('26%', 10, 'sk--soft') +
        '<span class="sk-row-flex">' + pill(78, 18) + pill(44, 18) + pill(56, 18) + pill(70, 18) + '</span>' +
        '<span class="sk-row-flex" style="margin-top:4px">' + box(96, 30, '56%') + box(86, 30, '56%') + '</span>'
    );
    var list = div('sk-list', times(4, function (i) {
      return div('sk-list-row', div('sk-col-flex', sk(cyc([64, 78, 52, 70], i) + '%', 11) + sk(cyc([40, 30, 46], i) + '%', 8, 'sk--soft'), 'flex:1;gap:6px') + pill(34, 18) + sk(38, 9) + sk(cyc([56, 48, 62], i), 9, 'sk--soft'));
    }));
    var day = div('sk-day', times(5, function (i) {
      return div('sk-day-hour', sk(34, 8, 'sk--soft') + (i === 1 ? sk('70%', 46, 'sk--accent') : ''));
    }));
    return div('db-page db-page--wide', head + hero + div('sk-split', list + day));
  }

  function dashboard() {
    return view('db-root', dashboardSide() + div('db-main', dashboardPage()) + dock());
  }

  /* ── Registry ──────────────────────────────────────────────────────── */

  var BUILDERS = {
    dashboard: dashboard,
    gantt: gantt,
    'gantt.body': ganttBody,
    table: table,
    'table.grid': tableGrid,
    kanban: kanban,
    'kanban.cols': kanbanCols,
    mindmap: mindmap,
    'mindmap.canvas': mindmapCanvas,
    journey: journey,
    docs: docs,
    'docs.list': docsList,
    'docs.main': docsMainInner,
    entities: entities,
    'entities.list': entitiesList,
    'entities.main': entitiesPage,
  };

  /** One name per tab, in the order of the tab strip (ViewTabs.VIEWS). */
  var VIEWS = ['dashboard', 'gantt', 'table', 'kanban', 'mindmap', 'journey', 'docs', 'entities'];

  function html(name) {
    var build = BUILDERS[name];
    return build ? build() : '';
  }

  function mount(el, name) {
    if (el) el.innerHTML = html(name);
    return el;
  }

  global.Skeleton = { html: html, mount: mount, VIEWS: VIEWS, names: function () { return Object.keys(BUILDERS); } };
})(typeof window !== 'undefined' ? window : this);
