/*
 * Pure logic of the table editor (no DOM): grid operations, formulas, number formats,
 * conditional formatting, CSV / TSV. The model is
 *   { rows: [[cell]], w: [percent], al: ['', 'center', 'right'], cf: [rule] }
 * row 0 is the header row. A cell is { t, h?, f?, bg?, fg?, fmt? }:
 * t = plain text (the computed value for a formula), h = inline HTML to keep, f = formula
 * ("=SUM(B2:B5)"), bg / fg = palette ids, fmt = auto | num | pct | cur.
 * Exposes window.DocsTableModel. DocsTableUI and the sheet view are the only users.
 */
(function (global) {
  'use strict';

  var COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  var FORMATS = ['auto', 'num', 'pct', 'cur'];
  var CF_OPS = ['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'has', 'empty', 'filled'];
  var MAX_COLS = 40;
  var MAX_ROWS = 2000;
  var NBSP = ' ';

  function FErr(code) {
    this.code = code;
  }

  /* ── Columns and references ────────────────────────────────────── */

  function colName(i) {
    var s = '';
    var n = i + 1;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function colIndex(name) {
    var n = 0;
    String(name).toUpperCase().split('').forEach(function (ch) { n = n * 26 + (ch.charCodeAt(0) - 64); });
    return n - 1;
  }

  function refName(r, c) {
    return colName(c) + (r + 1);
  }

  function parseRef(s) {
    var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(s));
    if (!m) return null;
    var r = parseInt(m[2], 10) - 1;
    if (r < 0) return null;
    return { r: r, c: colIndex(m[1]) };
  }

  /* ── Numbers ───────────────────────────────────────────────────── */

  /** "12,5 %" -> 0.125, "1 234,56" -> 1234.56, "$1,234.50" -> 1234.5, text -> null. */
  function parseNumber(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var str = String(s == null ? '' : s).trim();
    if (!str) return null;
    var pct = /%$/.test(str);
    str = str.replace(/%$/, '').replace(/CAD|USD|EUR/gi, '').replace(/[$€£]/g, '').replace(/[\s  ']/g, '');
    if (!/^[-+]?[\d.,]+$/.test(str)) return null;
    var sign = '';
    if (str.charAt(0) === '-' || str.charAt(0) === '+') {
      sign = str.charAt(0) === '-' ? '-' : '';
      str = str.slice(1);
    }
    var lastDot = str.lastIndexOf('.');
    var lastComma = str.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      var dec = Math.max(lastDot, lastComma);
      str = str.slice(0, dec).replace(/[.,]/g, '') + '.' + str.slice(dec + 1);
    } else if (lastComma >= 0) {
      str = str.split(',').length > 2 ? str.replace(/,/g, '') : str.replace(',', '.');
    } else if (lastDot >= 0 && str.split('.').length > 2) {
      str = str.replace(/\./g, '');
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(str)) return null;
    var n = parseFloat(sign + str);
    if (!isFinite(n)) return null;
    return pct ? n / 100 : n;
  }

  function trimmed(n, decimals) {
    var s = Number(n.toFixed(decimals)).toString();
    if (/e/i.test(s)) s = n.toFixed(decimals);
    return s;
  }

  function groupThousands(intPart) {
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  function fixed2(n) {
    var neg = n < 0;
    var parts = Math.abs(n).toFixed(2).split('.');
    return (neg ? '-' : '') + groupThousands(parts[0]) + ',' + parts[1];
  }

  function formatNumber(n, fmt) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (fmt === 'num') return fixed2(n);
    if (fmt === 'cur') return fixed2(n) + NBSP + '$';
    if (fmt === 'pct') return trimmed(n * 100, 2).replace('.', ',') + NBSP + '%';
    return trimmed(n, 10).replace('.', ',');
  }

  /* ── Formulas ──────────────────────────────────────────────────── */

  var FN_ALIASES = {
    SOMME: 'SUM', MOYENNE: 'AVERAGE', NB: 'COUNT', NBVAL: 'COUNTA', SI: 'IF', ARRONDI: 'ROUND',
    PRODUIT: 'PRODUCT', RACINE: 'SQRT',
  };
  var FN_NAMES = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'IF', 'ROUND', 'ABS', 'PRODUCT', 'SQRT'];
  var astCache = {};

  function tokenize(src) {
    var out = [];
    var i = 0;
    var m;
    while (i < src.length) {
      var rest = src.slice(i);
      if ((m = /^\s+/.exec(rest))) { i += m[0].length; continue; }
      if (rest.charAt(0) === '"') {
        var j = 1;
        var str = '';
        for (;;) {
          if (j >= rest.length) throw new FErr('#ERR');
          if (rest.charAt(j) === '"') {
            if (rest.charAt(j + 1) === '"') { str += '"'; j += 2; continue; }
            break;
          }
          str += rest.charAt(j++);
        }
        out.push({ k: 'str', v: str });
        i += j + 1;
        continue;
      }
      if ((m = /^(\d+(?:\.\d+)?|\.\d+)/.exec(rest))) {
        out.push({ k: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if ((m = /^\$?([A-Za-z]{1,3})\$?(\d+)(?![\w(])/.exec(rest))) {
        out.push({ k: 'ref', r: parseInt(m[2], 10) - 1, c: colIndex(m[1]) });
        i += m[0].length;
        continue;
      }
      if ((m = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(rest))) {
        var name = m[0].toUpperCase();
        i += m[0].length;
        if (src.charAt(i) === '(') out.push({ k: 'fn', v: name });
        else if (name === 'TRUE' || name === 'VRAI') out.push({ k: 'bool', v: true });
        else if (name === 'FALSE' || name === 'FAUX') out.push({ k: 'bool', v: false });
        else throw new FErr('#NAME?');
        continue;
      }
      if ((m = /^(<=|>=|<>|[=<>+\-*\/^&(),;:%])/.exec(rest))) {
        out.push({ k: 'op', v: m[0] });
        i += m[0].length;
        continue;
      }
      throw new FErr('#ERR');
    }
    return out;
  }

  function parseFormula(f) {
    if (astCache[f]) return astCache[f];
    var src = String(f).trim();
    if (src.charAt(0) === '=') src = src.slice(1);
    var toks = tokenize(src);
    var p = 0;
    function peek() { return toks[p]; }
    function isOp(v) { var t = toks[p]; return t && t.k === 'op' && t.v === v; }
    function next() { return toks[p++]; }
    function expect(v) { if (!isOp(v)) throw new FErr('#ERR'); p++; }

    function compare() {
      var a = concat();
      for (;;) {
        var t = peek();
        if (t && t.k === 'op' && /^(=|<>|<=|>=|<|>)$/.test(t.v)) { p++; a = { n: 'bin', op: t.v, a: a, b: concat() }; } else return a;
      }
    }
    function concat() {
      var a = add();
      while (isOp('&')) { p++; a = { n: 'bin', op: '&', a: a, b: add() }; }
      return a;
    }
    function add() {
      var a = mul();
      for (;;) {
        if (isOp('+') || isOp('-')) { var o = next().v; a = { n: 'bin', op: o, a: a, b: mul() }; } else return a;
      }
    }
    function mul() {
      var a = pow();
      for (;;) {
        if (isOp('*') || isOp('/')) { var o = next().v; a = { n: 'bin', op: o, a: a, b: pow() }; } else return a;
      }
    }
    function pow() {
      var a = unary();
      while (isOp('^')) { p++; a = { n: 'bin', op: '^', a: a, b: unary() }; }
      return a;
    }
    function unary() {
      if (isOp('-')) { p++; return { n: 'neg', a: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      var a = primary();
      while (isOp('%')) { p++; a = { n: 'bin', op: '/', a: a, b: { n: 'num', v: 100 } }; }
      return a;
    }
    function primary() {
      var t = next();
      if (!t) throw new FErr('#ERR');
      if (t.k === 'num' || t.k === 'str' || t.k === 'bool') return { n: t.k, v: t.v };
      if (t.k === 'ref') {
        if (isOp(':')) {
          p++;
          var e = next();
          if (!e || e.k !== 'ref') throw new FErr('#ERR');
          return { n: 'range', r1: Math.min(t.r, e.r), c1: Math.min(t.c, e.c), r2: Math.max(t.r, e.r), c2: Math.max(t.c, e.c) };
        }
        return { n: 'ref', r: t.r, c: t.c };
      }
      if (t.k === 'fn') {
        expect('(');
        var args = [];
        if (!isOp(')')) {
          for (;;) {
            args.push(compare());
            if (isOp(',') || isOp(';')) { p++; continue; }
            break;
          }
        }
        expect(')');
        var name = FN_ALIASES[t.v] || t.v;
        if (FN_NAMES.indexOf(name) < 0) throw new FErr('#NAME?');
        return { n: 'fn', name: name, args: args };
      }
      if (t.k === 'op' && t.v === '(') {
        var inner = compare();
        expect(')');
        return inner;
      }
      throw new FErr('#ERR');
    }

    var ast = compare();
    if (p < toks.length) throw new FErr('#ERR');
    astCache[f] = ast;
    return ast;
  }

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === '' || v == null) return 0;
    var n = parseNumber(v);
    if (n == null) throw new FErr('#VALUE!');
    return n;
  }

  function toStr(v) {
    if (typeof v === 'number') return formatNumber(v, 'auto');
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    return String(v == null ? '' : v);
  }

  function truthy(v) {
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'boolean') return v;
    return String(v || '') !== '' && String(v).toUpperCase() !== 'FAUX' && String(v).toUpperCase() !== 'FALSE';
  }

  function compareValues(a, b) {
    if (typeof a === 'string' && typeof b === 'string') {
      var x = a.toLowerCase();
      var y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    if (typeof a === 'string' && a !== '' && typeof b === 'number') return 1;
    if (typeof b === 'string' && b !== '' && typeof a === 'number') return -1;
    var na = toNum(a);
    var nb = toNum(b);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }

  function evalAst(node, get) {
    switch (node.n) {
      case 'num': case 'str': case 'bool': return node.v;
      case 'ref': return get(node.r, node.c);
      case 'range': {
        if ((node.r2 - node.r1 + 1) * (node.c2 - node.c1 + 1) > 20000) throw new FErr('#ERR');
        var list = [];
        for (var r = node.r1; r <= node.r2; r++) for (var c = node.c1; c <= node.c2; c++) list.push(get(r, c));
        return { range: list };
      }
      case 'neg': return -toNum(scalar(evalAst(node.a, get)));
      case 'bin': {
        var a = scalar(evalAst(node.a, get));
        var b = scalar(evalAst(node.b, get));
        switch (node.op) {
          case '+': return toNum(a) + toNum(b);
          case '-': return toNum(a) - toNum(b);
          case '*': return toNum(a) * toNum(b);
          case '/': {
            var d = toNum(b);
            if (d === 0) throw new FErr('#DIV/0!');
            return toNum(a) / d;
          }
          case '^': {
            var pw = Math.pow(toNum(a), toNum(b));
            if (!isFinite(pw)) throw new FErr('#NUM!');
            return pw;
          }
          case '&': return toStr(a) + toStr(b);
          case '=': return compareValues(a, b) === 0;
          case '<>': return compareValues(a, b) !== 0;
          case '<': return compareValues(a, b) < 0;
          case '>': return compareValues(a, b) > 0;
          case '<=': return compareValues(a, b) <= 0;
          case '>=': return compareValues(a, b) >= 0;
          default: throw new FErr('#ERR');
        }
      }
      case 'fn': return callFn(node, get);
      default: throw new FErr('#ERR');
    }
  }

  function scalar(v) {
    if (v && typeof v === 'object' && v.range) return v.range.length ? v.range[0] : '';
    return v;
  }

  function flat(args, get) {
    var out = [];
    args.forEach(function (a) {
      var v = evalAst(a, get);
      if (v && typeof v === 'object' && v.range) out = out.concat(v.range.filter(function (x) { return typeof x === 'number'; }));
      else if (typeof v === 'number') out.push(v);
      else if (typeof v === 'boolean') out.push(v ? 1 : 0);
      else if (typeof v === 'string' && v !== '' && parseNumber(v) != null && a.n !== 'ref') out.push(parseNumber(v));
    });
    return out;
  }

  function callFn(node, get) {
    var args = node.args;
    var nums;
    switch (node.name) {
      case 'SUM': return flat(args, get).reduce(function (s, x) { return s + x; }, 0);
      case 'PRODUCT': nums = flat(args, get); return nums.length ? nums.reduce(function (s, x) { return s * x; }, 1) : 0;
      case 'AVERAGE':
        nums = flat(args, get);
        if (!nums.length) throw new FErr('#DIV/0!');
        return nums.reduce(function (s, x) { return s + x; }, 0) / nums.length;
      case 'MIN': nums = flat(args, get); return nums.length ? Math.min.apply(null, nums) : 0;
      case 'MAX': nums = flat(args, get); return nums.length ? Math.max.apply(null, nums) : 0;
      case 'COUNT': return flat(args, get).length;
      case 'COUNTA': {
        var n = 0;
        args.forEach(function (a) {
          var v = evalAst(a, get);
          if (v && typeof v === 'object' && v.range) v.range.forEach(function (x) { if (x !== '') n++; });
          else if (v !== '') n++;
        });
        return n;
      }
      case 'IF': {
        if (args.length < 2) throw new FErr('#ERR');
        var cond = truthy(scalar(evalAst(args[0], get)));
        if (cond) return scalar(evalAst(args[1], get));
        return args.length > 2 ? scalar(evalAst(args[2], get)) : false;
      }
      case 'ROUND': {
        if (!args.length) throw new FErr('#ERR');
        var x = toNum(scalar(evalAst(args[0], get)));
        var d = args.length > 1 ? Math.max(0, Math.min(10, Math.floor(toNum(scalar(evalAst(args[1], get)))))) : 0;
        var k = Math.pow(10, d);
        return Math.round(x * k) / k;
      }
      case 'ABS': if (!args.length) throw new FErr('#ERR'); return Math.abs(toNum(scalar(evalAst(args[0], get))));
      case 'SQRT': {
        if (!args.length) throw new FErr('#ERR');
        var q = toNum(scalar(evalAst(args[0], get)));
        if (q < 0) throw new FErr('#NUM!');
        return Math.sqrt(q);
      }
      default: throw new FErr('#NAME?');
    }
  }

  function displayValue(v, fmt) {
    if (v && typeof v === 'object' && v.range) v = scalar(v);
    if (typeof v === 'number') return formatNumber(v, fmt && fmt !== 'auto' ? fmt : 'auto');
    if (typeof v === 'boolean') return v ? 'VRAI' : 'FAUX';
    return String(v == null ? '' : v);
  }

  /** Recompute every formula cell. Mutates the model; plain cells are never touched. */
  function recalc(m) {
    var cache = {};
    var stack = {};
    function value(r, c) {
      var cell = m.rows[r] && m.rows[r][c];
      if (!cell) return '';
      if (!cell.f) {
        var n = parseNumber(cell.t);
        return n == null ? (cell.t || '') : n;
      }
      var key = r + ',' + c;
      if (key in cache) {
        if (cache[key] instanceof FErr) throw cache[key];
        return cache[key];
      }
      if (stack[key]) throw new FErr('#CYCLE');
      stack[key] = 1;
      try {
        var v = scalar(evalAst(parseFormula(cell.f), value));
        cache[key] = v;
        return v;
      } catch (e) {
        var err = e instanceof FErr ? e : new FErr('#ERR');
        cache[key] = err;
        throw err;
      } finally {
        delete stack[key];
      }
    }
    m.rows.forEach(function (row, r) {
      row.forEach(function (cell, c) {
        if (!cell.f) return;
        try {
          cell.t = displayValue(value(r, c), cell.fmt);
        } catch (e) {
          cell.t = e instanceof FErr ? e.code : '#ERR';
        }
        delete cell.h;
      });
    });
    return m;
  }

  /** Rewrite the references of a formula. fn(r, c, kind) -> [r, c] | null (null becomes #REF!). */
  function rewriteRefs(f, fn) {
    var re = /"[^"]*"|(?<![\w$.])(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![\w(])/g;
    return String(f).replace(re, function (all, a, b) {
      if (all.charAt(0) === '"') return all;
      var ra = parseRef(a);
      if (!ra) return all;
      if (b) {
        var rb = parseRef(b);
        if (!rb) return all;
        var s = fn(ra.r, ra.c, 'start');
        var e = fn(rb.r, rb.c, 'end');
        if (!s || !e || s[0] > e[0] || s[1] > e[1] || s[0] < 0 || s[1] < 0 || e[0] < 0 || e[1] < 0) return '#REF!';
        return refName(s[0], s[1]) + ':' + refName(e[0], e[1]);
      }
      var one = fn(ra.r, ra.c, 'single');
      if (!one || one[0] < 0 || one[1] < 0) return '#REF!';
      return refName(one[0], one[1]);
    });
  }

  function remapAll(m, fn) {
    m.rows.forEach(function (row) {
      row.forEach(function (cell) { if (cell.f) cell.f = rewriteRefs(cell.f, fn); });
    });
  }

  /* ── Model basics ──────────────────────────────────────────────── */

  function blankCell() {
    return { t: '' };
  }

  function blankRow(n) {
    var row = [];
    for (var i = 0; i < n; i++) row.push(blankCell());
    return row;
  }

  function create(cols, rows) {
    var m = { rows: [], w: [], al: [], cf: [] };
    for (var r = 0; r < rows; r++) m.rows.push(blankRow(cols));
    for (var c = 0; c < cols; c++) m.al.push('');
    return m;
  }

  function clone(m) {
    return JSON.parse(JSON.stringify(m));
  }

  function width(m) {
    return m.rows.length ? m.rows[0].length : 0;
  }

  function normalize(m) {
    var w = 0;
    m.rows.forEach(function (row) { if (row.length > w) w = row.length; });
    if (!m.rows.length) m.rows.push([]);
    w = Math.max(1, w);
    m.rows.forEach(function (row) { while (row.length < w) row.push(blankCell()); });
    if (m.rows.length < 2) m.rows.push(blankRow(w));
    while ((m.al || []).length < w) (m.al = m.al || []).push('');
    if (m.al.length > w) m.al.length = w;
    if (!m.w || m.w.length !== w) m.w = [];
    m.cf = m.cf || [];
    return m;
  }

  function cellText(cell) {
    return cell ? String(cell.t == null ? '' : cell.t) : '';
  }

  function rect(a, b, c, d) {
    return { r1: Math.min(a, c), c1: Math.min(b, d), r2: Math.max(a, c), c2: Math.max(b, d) };
  }

  function clampRect(m, rc) {
    var rows = m.rows.length;
    var cols = width(m);
    return {
      r1: Math.max(0, Math.min(rc.r1, rows - 1)),
      r2: Math.max(0, Math.min(rc.r2, rows - 1)),
      c1: Math.max(0, Math.min(rc.c1, cols - 1)),
      c2: Math.max(0, Math.min(rc.c2, cols - 1)),
    };
  }

  function eachCell(m, rc, fn) {
    var x = clampRect(m, rc);
    for (var r = x.r1; r <= x.r2; r++) for (var c = x.c1; c <= x.c2; c++) fn(m.rows[r][c], r, c);
  }

  /* ── Structure operations (each returns true when it changed something) ── */

  function insertRow(m, at) {
    if (m.rows.length >= MAX_ROWS) return false;
    at = Math.max(1, Math.min(at, m.rows.length));
    m.rows.splice(at, 0, blankRow(width(m)));
    remapAll(m, function (r, c) { return [r >= at ? r + 1 : r, c]; });
    return true;
  }

  function insertCol(m, at) {
    if (width(m) >= MAX_COLS) return false;
    at = Math.max(0, Math.min(at, width(m)));
    m.rows.forEach(function (row) { row.splice(at, 0, blankCell()); });
    m.al.splice(at, 0, '');
    m.w = [];
    m.cf.forEach(function (rule) { if (rule.c >= at) rule.c++; });
    remapAll(m, function (r, c) { return [r, c >= at ? c + 1 : c]; });
    return true;
  }

  function deleteRow(m, r) {
    if (r < 1 || r >= m.rows.length || m.rows.length <= 2) return false;
    m.rows.splice(r, 1);
    remapAll(m, function (rr, c, kind) {
      if (rr === r) return kind === 'single' ? null : kind === 'start' ? [r, c] : [r - 1, c];
      return [rr > r ? rr - 1 : rr, c];
    });
    return true;
  }

  function deleteCol(m, col) {
    if (col < 0 || col >= width(m) || width(m) <= 1) return false;
    m.rows.forEach(function (row) { row.splice(col, 1); });
    m.al.splice(col, 1);
    m.w = [];
    m.cf = m.cf.filter(function (rule) { return rule.c !== col; });
    m.cf.forEach(function (rule) { if (rule.c > col) rule.c--; });
    remapAll(m, function (r, cc, kind) {
      if (cc === col) return kind === 'single' ? null : kind === 'start' ? [r, col] : [r, col - 1];
      return [r, cc > col ? cc - 1 : cc];
    });
    return true;
  }

  function permuteMap(from, to) {
    return function (i) {
      if (i === from) return to;
      if (from < to && i > from && i <= to) return i - 1;
      if (from > to && i >= to && i < from) return i + 1;
      return i;
    };
  }

  function moveRow(m, from, to) {
    if (from < 1 || to < 1 || from >= m.rows.length || to >= m.rows.length || from === to) return false;
    var map = permuteMap(from, to);
    m.rows.splice(to, 0, m.rows.splice(from, 1)[0]);
    remapAll(m, function (r, c) { return [map(r), c]; });
    return true;
  }

  function moveCol(m, from, to) {
    var n = width(m);
    if (from < 0 || to < 0 || from >= n || to >= n || from === to) return false;
    var map = permuteMap(from, to);
    m.rows.forEach(function (row) { row.splice(to, 0, row.splice(from, 1)[0]); });
    m.al.splice(to, 0, m.al.splice(from, 1)[0]);
    m.w = [];
    m.cf.forEach(function (rule) { if (rule.c >= 0) rule.c = map(rule.c); });
    remapAll(m, function (r, c) { return [r, map(c)]; });
    return true;
  }

  function shiftRefs(f, dr, dc) {
    return rewriteRefs(f, function (r, c) { return [r + dr, c + dc]; });
  }

  function duplicateRow(m, r) {
    if (r < 0 || r >= m.rows.length || m.rows.length >= MAX_ROWS) return false;
    var at = Math.max(1, r + 1);
    var copy = clone(m.rows[r]);
    insertRow(m, at);
    m.rows[at] = copy.map(function (cell) {
      if (cell.f) cell.f = shiftRefs(cell.f, at - r, 0);
      return cell;
    });
    return true;
  }

  function duplicateCol(m, col) {
    if (col < 0 || col >= width(m) || width(m) >= MAX_COLS) return false;
    var copies = m.rows.map(function (row) { return clone(row[col]); });
    var al = m.al[col];
    insertCol(m, col + 1);
    m.rows.forEach(function (row, r) {
      var cell = copies[r];
      if (cell.f) cell.f = shiftRefs(cell.f, 0, 1);
      row[col + 1] = cell;
    });
    m.al[col + 1] = al;
    return true;
  }

  function sortKey(cell) {
    var n = parseNumber(cellText(cell));
    return n == null ? { n: null, s: cellText(cell).toLowerCase() } : { n: n, s: '' };
  }

  /**
   * Sort body rows by one column. Rows that hold a range formula (totals) stay where they are;
   * references to the row itself follow it, references to other rows do not move.
   */
  function sortRows(m, col, dir, r1, r2) {
    if (col < 0 || col >= width(m)) return false;
    var from = Math.max(1, r1 == null ? 1 : r1);
    var to = Math.min(m.rows.length - 1, r2 == null ? m.rows.length - 1 : r2);
    if (to <= from) return false;
    var sign = dir === 'desc' ? -1 : 1;
    var fixed = {};
    var movable = [];
    for (var r = from; r <= to; r++) {
      var pinned = m.rows[r].some(function (cell) { return cell.f && cell.f.indexOf(':') >= 0; });
      if (pinned) fixed[r] = true;
      else movable.push(r);
    }
    var order = movable.slice().sort(function (a, b) {
      var ka = sortKey(m.rows[a][col]);
      var kb = sortKey(m.rows[b][col]);
      var cmp;
      var ea = ka.n == null && ka.s === '';
      var eb = kb.n == null && kb.s === '';
      if (ea || eb) return ea && eb ? a - b : ea ? 1 : -1; // blanks last in both directions
      if (ka.n != null && kb.n != null) cmp = ka.n - kb.n;
      else if (ka.n != null) cmp = -1;
      else if (kb.n != null) cmp = 1;
      else cmp = ka.s < kb.s ? -1 : ka.s > kb.s ? 1 : 0;
      return cmp ? cmp * sign : a - b;
    });
    var changed = order.some(function (old, i) { return old !== movable[i]; });
    if (!changed) return false;
    var rowsBefore = m.rows.slice();
    movable.forEach(function (target, i) {
      var old = order[i];
      var row = rowsBefore[old];
      row.forEach(function (cell) {
        if (cell.f) cell.f = rewriteRefs(cell.f, function (rr, cc) { return [rr === old ? target : rr, cc]; });
      });
      m.rows[target] = row;
    });
    return true;
  }

  /* ── Cell edits ────────────────────────────────────────────────── */

  /** Typed text -> cell. "=..." becomes a formula, anything else plain text (reformatted when numeric). */
  function setInput(cell, text) {
    var s = String(text == null ? '' : text);
    delete cell.h;
    if (/^\s*=\s*\S/.test(s)) {
      cell.f = s.trim();
      cell.t = '';
      return cell;
    }
    delete cell.f;
    cell.t = s;
    if (cell.fmt && cell.fmt !== 'auto') reformatCell(cell);
    return cell;
  }

  function reformatCell(cell) {
    if (cell.f) return;
    var raw = cellText(cell).trim();
    if (!raw) return;
    var n = parseNumber(raw);
    if (n == null) return;
    // typing "12" in a percent cell means 12 %
    if (cell.fmt === 'pct' && !/%/.test(raw)) n = n / 100;
    cell.t = formatNumber(n, cell.fmt || 'auto');
    delete cell.h;
  }

  function setFormat(m, rc, fmt) {
    var f = FORMATS.indexOf(fmt) >= 0 ? fmt : 'auto';
    eachCell(m, rc, function (cell, r) {
      if (f === 'auto') delete cell.fmt;
      else cell.fmt = f;
      if (r > 0 && !cell.f) reformatCell(cell);
    });
  }

  function setColor(m, rc, key, id) {
    if (key !== 'bg' && key !== 'fg') return;
    eachCell(m, rc, function (cell) {
      if (COLORS.indexOf(id) >= 0) cell[key] = id;
      else delete cell[key];
    });
  }

  function clearCells(m, rc) {
    eachCell(m, rc, function (cell) {
      cell.t = '';
      delete cell.h;
      delete cell.f;
    });
  }

  function clearFormat(m, rc) {
    eachCell(m, rc, function (cell) {
      delete cell.bg;
      delete cell.fg;
      delete cell.fmt;
    });
  }

  function setAlign(m, col, a) {
    if (col < 0 || col >= width(m)) return;
    m.al[col] = a === 'center' || a === 'right' ? a : '';
  }

  /** Put a function over the selection in the first free cell below it (or at its right for a single row). */
  function autoSum(m, rc, fn) {
    var x = clampRect(m, rc);
    var name = FN_NAMES.indexOf(fn) >= 0 ? fn : 'SUM';
    var cols = x.c2 - x.c1 + 1;
    var rows = x.r2 - x.r1 + 1;
    var single = rows === 1 && cols > 1;
    var target;
    var range;
    if (single) {
      target = { r: x.r1, c: x.c2 + 1 };
      range = refName(x.r1, x.c1) + ':' + refName(x.r2, x.c2);
      if (target.c >= width(m) && !insertCol(m, width(m))) return null;
    } else {
      var firstRow = x.r1;
      if (x.r1 === 0 && rows > 1) firstRow = 1; // a header is not data
      range = refName(firstRow, x.c1) + ':' + refName(x.r2, x.c2);
      target = { r: x.r2 + 1, c: x.c1 };
      if (target.r >= m.rows.length && !insertRow(m, m.rows.length)) return null;
    }
    var cell = m.rows[target.r][target.c];
    cell.f = '=' + name + '(' + range + ')';
    cell.t = '';
    delete cell.h;
    return target;
  }

  /* ── Conditional formatting ────────────────────────────────────── */

  function cfMatch(rule, text) {
    var t = String(text == null ? '' : text).trim();
    var n = parseNumber(t);
    var vn = parseNumber(rule.v);
    var v = String(rule.v == null ? '' : rule.v).trim().toLowerCase();
    switch (rule.op) {
      case 'empty': return t === '';
      case 'filled': return t !== '';
      case 'has': return v !== '' && t.toLowerCase().indexOf(v) >= 0;
      case 'eq': return n != null && vn != null ? n === vn : t.toLowerCase() === v;
      case 'ne': return n != null && vn != null ? n !== vn : t.toLowerCase() !== v;
      case 'gt': return n != null && vn != null && n > vn;
      case 'lt': return n != null && vn != null && n < vn;
      case 'ge': return n != null && vn != null && n >= vn;
      case 'le': return n != null && vn != null && n <= vn;
      default: return false;
    }
  }

  /** Style given by the rules to the cell at (r, c): { bg, fg } or null. Rules run in order, the last wins. */
  function cfStyle(m, r, c) {
    if (r === 0 || !m.cf || !m.cf.length) return null;
    var out = null;
    m.cf.forEach(function (rule) {
      if (!rule || CF_OPS.indexOf(rule.op) < 0) return;
      var testCol = rule.c >= 0 ? rule.c : c;
      if (rule.c >= 0 && !rule.row && rule.c !== c) return;
      var probe = m.rows[r] && m.rows[r][testCol];
      if (!probe) return;
      if (!cfMatch(rule, cellText(probe))) return;
      out = out || {};
      if (rule.bg) out.bg = rule.bg;
      if (rule.fg) out.fg = rule.fg;
    });
    return out;
  }

  function cleanRule(rule) {
    if (!rule || CF_OPS.indexOf(rule.op) < 0) return null;
    var c = parseInt(rule.c, 10);
    return {
      c: isFinite(c) ? Math.max(-1, Math.min(MAX_COLS, c)) : -1,
      op: rule.op,
      v: String(rule.v == null ? '' : rule.v).slice(0, 100),
      bg: COLORS.indexOf(rule.bg) >= 0 ? rule.bg : '',
      fg: COLORS.indexOf(rule.fg) >= 0 ? rule.fg : '',
      row: !!rule.row,
    };
  }

  /* ── CSV / TSV ─────────────────────────────────────────────────── */

  function detectDelimiter(text) {
    var first = String(text).split(/\r?\n/)[0] || '';
    var best = ',';
    var bestN = 0;
    ['\t', ';', ','].forEach(function (d) {
      var n = first.split(d).length - 1;
      if (n > bestN) { best = d; bestN = n; }
    });
    return best;
  }

  function parseDelimited(text, delim) {
    var src = String(text == null ? '' : text).replace(/^﻿/, '');
    var d = delim || detectDelimiter(src);
    var rows = [];
    var row = [];
    var cur = '';
    var quoted = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (quoted) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') { cur += '"'; i++; } else quoted = false;
        } else cur += ch;
      } else if (ch === '"' && cur === '') quoted = true;
      else if (ch === d) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src.charAt(i + 1) === '\n') i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every(function (x) { return x === ''; })) rows.pop();
    return rows;
  }

  function toDelimited(grid, delim) {
    var d = delim || ',';
    return grid.map(function (row) {
      return row.map(function (v) {
        var s = String(v == null ? '' : v);
        return s.indexOf(d) >= 0 || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(d);
    }).join('\r\n');
  }

  function gridOf(m, rc) {
    var x = rc ? clampRect(m, rc) : { r1: 0, c1: 0, r2: m.rows.length - 1, c2: width(m) - 1 };
    var out = [];
    for (var r = x.r1; r <= x.r2; r++) {
      var line = [];
      for (var c = x.c1; c <= x.c2; c++) line.push(cellText(m.rows[r][c]));
      out.push(line);
    }
    return out;
  }

  /** Drop a grid of text into the model at (r, c), growing the table when needed. Returns the covered rect. */
  function putGrid(m, r, c, grid) {
    if (!grid.length) return null;
    var needCols = c + Math.max.apply(null, grid.map(function (g) { return g.length; }));
    var needRows = r + grid.length;
    while (width(m) < Math.min(needCols, MAX_COLS)) insertCol(m, width(m));
    while (m.rows.length < Math.min(needRows, MAX_ROWS)) insertRow(m, m.rows.length);
    var last = { r: r, c: c };
    grid.forEach(function (line, i) {
      line.forEach(function (v, j) {
        var cell = m.rows[r + i] && m.rows[r + i][c + j];
        if (!cell) return;
        setInput(cell, v);
        last = { r: r + i, c: c + j };
      });
    });
    return rect(r, c, last.r, last.c);
  }

  /** Whole new content from rows of text (CSV import): first row is the header. */
  function fromGrid(grid) {
    var cols = Math.max(1, Math.min(MAX_COLS, Math.max.apply(null, grid.map(function (g) { return g.length; }).concat([1]))));
    var rows = Math.max(2, Math.min(MAX_ROWS, grid.length));
    var m = create(cols, rows);
    putGrid(m, 0, 0, grid.slice(0, MAX_ROWS).map(function (line) { return line.slice(0, MAX_COLS); }));
    return m;
  }

  global.DocsTableModel = {
    COLORS: COLORS,
    FORMATS: FORMATS,
    CF_OPS: CF_OPS,
    FUNCTIONS: FN_NAMES,
    MAX_COLS: MAX_COLS,
    MAX_ROWS: MAX_ROWS,
    colName: colName,
    colIndex: colIndex,
    refName: refName,
    parseRef: parseRef,
    parseNumber: parseNumber,
    formatNumber: formatNumber,
    parseFormula: parseFormula,
    rewriteRefs: rewriteRefs,
    recalc: recalc,
    create: create,
    clone: clone,
    normalize: normalize,
    width: width,
    cellText: cellText,
    rect: rect,
    clampRect: clampRect,
    eachCell: eachCell,
    insertRow: insertRow,
    insertCol: insertCol,
    deleteRow: deleteRow,
    deleteCol: deleteCol,
    moveRow: moveRow,
    moveCol: moveCol,
    duplicateRow: duplicateRow,
    duplicateCol: duplicateCol,
    sortRows: sortRows,
    setInput: setInput,
    setFormat: setFormat,
    setColor: setColor,
    setAlign: setAlign,
    clearCells: clearCells,
    clearFormat: clearFormat,
    autoSum: autoSum,
    cfMatch: cfMatch,
    cfStyle: cfStyle,
    cleanRule: cleanRule,
    parseDelimited: parseDelimited,
    toDelimited: toDelimited,
    detectDelimiter: detectDelimiter,
    gridOf: gridOf,
    putGrid: putGrid,
    fromGrid: fromGrid,
  };
})(typeof window !== 'undefined' ? window : this);
