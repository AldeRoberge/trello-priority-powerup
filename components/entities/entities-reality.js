/*
 * Role: pure logic of the REALITY MAP. Typing "Powerade" is enough to know that it is a drink in a bottle (a
 * Contenant whose Contenu is "Powerade (liquide)"), made by the brand Powerade, itself part of The Coca-Cola Company.
 * The AI (entities-reality-ai.js) proposes that map in waves; this file is everything that does not need a model:
 * it reads and validates what the models return, merges the branches, applies the verifier's verdicts, decides what
 * is safe to build on its own, and turns the plan into drafts (new entities, links, components) for
 * EntitiesComposer.finalize. Nothing here touches the DOM, Trello or the network.
 *
 * PLAN  { root: {type, components[], facts{}, aliases[], det, conf},
 *         nodes: { ref: {ref, name, type, conf, components[], facts{}, aliases[], parent, depth, expand, expanded,
 *                        verified, working, failed, source, why} },
 *         order: [ref], edges: [{from, to, via, conf}], nextId }
 *   "root" is the entity being created. An edge reads "from <via> to"; `via` is a link field path
 *   ("contenant.contenu", "provenance.fabricant") or a relation of the vocabulary ("fait partie de").
 *
 * Trust: a node is built automatically when its confidence is >= LIMITS.auto AND the orchestrator verified it (or it
 * is >= LIMITS.sure); between LIMITS.keep and that it is only SUGGESTED (the user switches it on); below, dropped.
 * The user can switch any node off. Existing entities are reused by name or alias, never duplicated or edited.
 *
 * Usage: var plan = EntitiesReality.emptyPlan();
 *        plan = EntitiesReality.addBranch(plan, 'root', EntitiesReality.normalizeBranch(rawJson, ctx, 'root'), { source: 'ia' });
 *        plan = EntitiesReality.applyVerdicts(plan, rawVerdictJson);
 *        var b = EntitiesReality.build({ schema, entities, draft, library }, plan, { excluded, accepted });
 *          b = { schema, draft, extras:[draft], reused:[id], included:[ref] }
 *        EntitiesReality.tree(plan, ctx, flags) -> rows for the map panel;  hintsFromPlan(plan, ctx) -> interview hints
 *
 * Contents: 1 helpers | 2 plan | 3 read a branch | 4 merge | 5 verdicts | 6 what is built | 7 build | 8 views
 */
(function (global) {
  'use strict';

  function EM() {
    return global.EntitiesModel;
  }
  function EC() {
    return global.EntitiesComposer;
  }
  function LIB(ctx) {
    return (ctx && ctx.library) || global.EntitiesLibrary;
  }
  function CAI() {
    return global.EntitiesComposerAI;
  }

  var LIMITS = { maxNodes: 24, perCall: 8, maxDepth: 3, auto: 0.75, sure: 0.9, keep: 0.5, expand: 0.6 };

  /* ── 1. Helpers ──────────────────────────────────────────────────── */

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }
  function trim(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }
  function key(s) {
    return EM().normKey(s);
  }
  function conf(v, dflt) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? Math.max(0, Math.min(1, n)) : dflt;
  }
  function uniq(list) {
    var out = [];
    list.forEach(function (x) {
      if (x && out.indexOf(x) < 0) out.push(x);
    });
    return out;
  }

  function parseJson(text) {
    var s = String(text || '');
    try {
      return JSON.parse(s);
    } catch (e) {
      var a = s.indexOf('{');
      var b = s.lastIndexOf('}');
      if (a < 0 || b <= a) return null;
      try {
        return JSON.parse(s.slice(a, b + 1));
      } catch (e2) {
        return null;
      }
    }
  }

  /** Ids of the archetypes the plan may use (the schema's own, then the library's). */
  function typeIds(ctx) {
    return EC()
      .archetypeChoices(ctx.schema, LIB(ctx))
      .map(function (c) { return c.id; });
  }

  /** Ids of the components the plan may add to an entity (the schema's own, then the library's). */
  function componentIds(ctx) {
    var out = ctx.schema.components.map(function (c) { return c.id; });
    var lib = LIB(ctx);
    if (lib) lib.COMPONENTS.forEach(function (c) { if (out.indexOf(c.id) < 0) out.push(c.id); });
    return out;
  }

  /* ── 2. Plan ─────────────────────────────────────────────────────── */

  function emptyPlan() {
    return { root: { type: '', types: [], components: [], facts: {}, aliases: [], det: '', conf: 0 }, nodes: {}, order: [], edges: [], nextId: 1 };
  }

  function depthOf(plan, ref) {
    return ref === 'root' ? 0 : plan.nodes[ref] ? plan.nodes[ref].depth : 0;
  }

  function hasEdge(plan, from, to, via) {
    return plan.edges.some(function (e) { return e.from === from && e.to === to && key(e.via) === key(via); });
  }

  /** True when `to` already leads to `from` (adding from -> to would close a loop). */
  function reaches(plan, start, goal) {
    var seen = {};
    var stack = [start];
    while (stack.length) {
      var at = stack.pop();
      if (at === goal) return true;
      if (seen[at]) continue;
      seen[at] = true;
      plan.edges.forEach(function (e) { if (e.from === at) stack.push(e.to); });
    }
    return false;
  }

  /* ── 3. Read a branch ────────────────────────────────────────────── */

  function scalarFacts(v) {
    var out = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    Object.keys(v).slice(0, 8).forEach(function (p) {
      var x = v[p];
      if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') out[p] = x;
      else if (Array.isArray(x) && x.every(function (y) { return typeof y === 'string'; })) out[p] = x.slice(0, 6);
    });
    return out;
  }

  function strings(v, max, len) {
    return (Array.isArray(v) ? v : [])
      .map(function (x) { return trim(x).slice(0, len || 80); })
      .filter(Boolean)
      .slice(0, max);
  }

  /**
   * What a model returned (text or object) as a clean branch: unknown genres and components are dropped, names
   * cleaned, confidences clamped, at most LIMITS.perCall nodes, nothing below LIMITS.keep.
   * Shape: { root?, nodes:[{lref, name, type, conf, components, facts, aliases, expand, why}], links:[{from, to, via, conf}] }
   * `anchor` is the ref the branch hangs from ('root' or a node ref); links may use it as an endpoint.
   */
  /** The genres a thing has: "types" (a list) and/or "type" (one), valid ids only, at most 3. A type is just a list of components, so a thing may have several. */
  function pickTypes(v, valid) {
    var list = (v.type ? [v.type] : []).concat(Array.isArray(v.types) ? v.types : []);
    var out = [];
    list.forEach(function (id) {
      if (typeof id === 'string' && valid.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
    });
    return out.slice(0, 3);
  }

  function normalizeBranch(raw, ctx, anchor) {
    var data = typeof raw === 'string' ? parseJson(raw) : raw;
    var out = { root: null, nodes: [], links: [] };
    if (!data || typeof data !== 'object') return out;
    var types = typeIds(ctx);
    var comps = componentIds(ctx);
    if (anchor === 'root' && data.root && typeof data.root === 'object') {
      var r = data.root;
      var rootTypes = pickTypes(r, types);
      out.root = {
        type: rootTypes[0] || '',
        types: rootTypes,
        components: strings(r.components, 8, 40).filter(function (c) { return comps.indexOf(c) >= 0; }),
        facts: scalarFacts(r.facts),
        aliases: strings(r.aliases, 3),
        det: ['le', 'la', 'l\'', 'l’', 'les'].indexOf(r.det) >= 0 ? (r.det === 'l’' ? "l'" : r.det) : '',
        conf: conf(r.confidence, 0.6),
      };
    }
    var seen = {};
    (Array.isArray(data.nodes) ? data.nodes : []).forEach(function (n) {
      if (out.nodes.length >= LIMITS.perCall || !n || typeof n !== 'object') return;
      var name = trim(n.name).slice(0, 80);
      var lref = trim(n.ref).slice(0, 24);
      var c = conf(n.confidence, 0.5);
      if (!name || !lref || seen[lref] || lref === 'root' || lref === anchor) return;
      var nodeTypes = pickTypes(n, types);
      if (c < LIMITS.keep || !nodeTypes.length) return;
      seen[lref] = true;
      out.nodes.push({
        lref: lref,
        name: name,
        type: nodeTypes[0],
        types: nodeTypes,
        conf: c,
        components: strings(n.components, 5, 40).filter(function (x) { return comps.indexOf(x) >= 0; }),
        facts: scalarFacts(n.facts),
        aliases: strings(n.aliases, 3),
        expand: n.expand === true,
        why: trim(n.why).slice(0, 140),
      });
    });
    (Array.isArray(data.links) ? data.links : []).slice(0, LIMITS.perCall * 2).forEach(function (l) {
      if (!l || typeof l !== 'object') return;
      var from = trim(l.from);
      var to = trim(l.to);
      var via = trim(l.via).slice(0, 60);
      if (!from || !to || !via || from === to) return;
      out.links.push({ from: from, to: to, via: via, conf: conf(l.confidence, null) });
    });
    return out;
  }

  /* ── 4. Merge ────────────────────────────────────────────────────── */

  function findNode(plan, name, type) {
    var k = key(name);
    var hit = '';
    plan.order.forEach(function (ref) {
      if (!hit && key(plan.nodes[ref].name) === k) hit = ref;
    });
    return hit;
  }

  /**
   * The plan with a branch added under `anchor`. Names already in the plan are the same node (the web converges:
   * "Coca-Cola" reached twice stays one node), except a node that shares the root's name but not its kind (the
   * brand "Powerade" next to the drink "Powerade"). Links without an end in the plan are dropped, loops are refused,
   * and a node with no link at all is attached to its anchor with "lié à".
   * opts: { source: 'ia'|'web', rootName }
   */
  function addBranch(plan, anchor, branch, opts) {
    opts = opts || {};
    var next = clone(plan);
    if (anchor !== 'root' && !next.nodes[anchor]) return next;
    if (branch.root) {
      next.root = Object.assign({}, next.root, branch.root, { facts: Object.assign({}, next.root.facts, branch.root.facts) });
      next.root.components = uniq((plan.root.components || []).concat(branch.root.components));
      next.root.aliases = uniq((plan.root.aliases || []).concat(branch.root.aliases));
    }
    var map = {};
    map.root = 'root';
    map[anchor] = anchor;
    var depth = depthOf(next, anchor) + 1;
    var fresh = [];
    branch.nodes.forEach(function (n) {
      var same = findNode(next, n.name);
      if (same && same !== anchor) {
        var ex = next.nodes[same];
        ex.conf = Math.max(ex.conf, n.conf);
        ex.expand = ex.expand || n.expand;
        ex.components = uniq(ex.components.concat(n.components));
        ex.types = uniq((ex.types || [ex.type]).concat(n.types || [n.type]));
        map[n.lref] = same;
        return;
      }
      if (opts.rootName && key(n.name) === key(opts.rootName) && next.root.type && n.type === next.root.type) {
        map[n.lref] = 'root';
        return;
      }
      if (next.order.length >= LIMITS.maxNodes) return;
      var ref = 'n' + next.nextId++;
      next.nodes[ref] = {
        ref: ref,
        name: n.name,
        type: n.type,
        types: (n.types || [n.type]).slice(),
        conf: n.conf,
        components: n.components.slice(),
        facts: Object.assign({}, n.facts),
        aliases: n.aliases.slice(),
        parent: anchor,
        depth: depth,
        expand: n.expand && depth < LIMITS.maxDepth,
        expanded: false,
        verified: false,
        working: false,
        failed: false,
        source: opts.source || 'ia',
        why: n.why,
      };
      next.order.push(ref);
      map[n.lref] = ref;
      fresh.push(ref);
    });
    var linked = {};
    branch.links.forEach(function (l) {
      var from = map[l.from];
      var to = map[l.to];
      if (!from || !to || from === to) return;
      if (fresh.indexOf(from) < 0 && fresh.indexOf(to) < 0 && from !== anchor && to !== anchor) return;
      if (hasEdge(next, from, to, l.via) || reaches(next, to, from)) return;
      var c = l.conf != null ? l.conf : Math.min(from === 'root' ? 1 : next.nodes[from] ? next.nodes[from].conf : 1, to === 'root' ? 1 : next.nodes[to] ? next.nodes[to].conf : 1);
      next.edges.push({ from: from, to: to, via: l.via, conf: c });
      linked[from] = true;
      linked[to] = true;
    });
    fresh.forEach(function (ref) {
      if (!linked[ref]) next.edges.push({ from: anchor, to: ref, via: 'lié à', conf: next.nodes[ref].conf });
    });
    // a node hangs under the node that links to it ("Coca-Cola" under the brand), so a branch can be switched off whole
    for (var pass = 0; pass < fresh.length + 1; pass++) {
      fresh.forEach(function (ref) {
        var inc = next.edges.filter(function (e) { return e.to === ref && (e.from === 'root' || next.nodes[e.from]) && e.from !== ref; })[0];
        var up = inc && (inc.from === anchor || fresh.indexOf(inc.from) >= 0) ? inc.from : anchor;
        next.nodes[ref].parent = up;
        next.nodes[ref].depth = depthOf(next, up) + 1;
        next.nodes[ref].expand = next.nodes[ref].expand && next.nodes[ref].depth < LIMITS.maxDepth;
      });
    }
    return next;
  }

  /** Marks the branch of a node as being explored (spinner) or finished. */
  function setWorking(plan, ref, working, failed) {
    var next = clone(plan);
    if (next.nodes[ref]) {
      next.nodes[ref].working = !!working;
      if (!working) {
        next.nodes[ref].expanded = true;
        next.nodes[ref].failed = !!failed;
      }
    }
    return next;
  }

  /** Nodes worth exploring further: asked for, confident enough, shallow enough, not explored yet. */
  function toExpand(plan, limit) {
    return plan.order
      .filter(function (ref) {
        var n = plan.nodes[ref];
        return n.expand && !n.expanded && !n.working && n.conf >= LIMITS.expand && n.depth < LIMITS.maxDepth && parentsAlive(plan, ref);
      })
      .slice(0, limit || 5);
  }

  function parentsAlive(plan, ref) {
    var at = plan.nodes[ref];
    while (at && at.parent !== 'root') {
      at = plan.nodes[at.parent];
      if (!at) return false;
    }
    return !!at;
  }

  /* ── 5. Verdicts ─────────────────────────────────────────────────── */

  /**
   * Applies the orchestrator's verdicts: { nodes:[{ref, keep, confidence, name?}], edges:[{from, to, keep}],
   * same:[[refA, refB]] }. A verified node keeps `verified = true`. The verifier may lower any confidence but only
   * raise one by 0.1 (up to 0.9); a dropped node takes its descendants and edges with it; "same" merges B into A.
   * Nodes the verdicts do not mention stay unverified.
   */
  function applyVerdicts(plan, raw) {
    var data = typeof raw === 'string' ? parseJson(raw) : raw;
    var next = clone(plan);
    if (!data || typeof data !== 'object') return next;
    var drop = {};
    (Array.isArray(data.same) ? data.same : []).forEach(function (pair) {
      if (!Array.isArray(pair) || pair.length < 2) return;
      var a = pair[0];
      var b = pair[1];
      if (!next.nodes[a] || !next.nodes[b] || a === b) return;
      next.nodes[a].conf = Math.max(next.nodes[a].conf, next.nodes[b].conf);
      next.nodes[a].expand = next.nodes[a].expand || next.nodes[b].expand;
      next.edges.forEach(function (e) {
        if (e.from === b) e.from = a;
        if (e.to === b) e.to = a;
      });
      next.order.forEach(function (ref) { if (next.nodes[ref].parent === b) next.nodes[ref].parent = a; });
      drop[b] = true;
    });
    (Array.isArray(data.nodes) ? data.nodes : []).forEach(function (v) {
      var n = v && next.nodes[v.ref];
      if (!n) return;
      if (v.keep === false) {
        drop[n.ref] = true;
        return;
      }
      var c = conf(v.confidence, n.conf);
      n.conf = c > n.conf ? Math.min(0.9, n.conf + 0.1, c) : c;
      var nm = trim(v.name).slice(0, 80);
      if (nm && key(nm) !== key(n.name) && !findNode(next, nm)) n.name = nm;
      n.verified = true;
    });
    (Array.isArray(data.edges) ? data.edges : []).forEach(function (v) {
      if (!v || v.keep !== false) return;
      next.edges = next.edges.filter(function (e) { return !(e.from === v.from && e.to === v.to); });
    });
    // descendants of a dropped node go too
    var changed = true;
    while (changed) {
      changed = false;
      next.order.forEach(function (ref) {
        if (!drop[ref] && drop[next.nodes[ref].parent]) {
          drop[ref] = true;
          changed = true;
        }
      });
    }
    next.order = next.order.filter(function (ref) { return !drop[ref]; });
    Object.keys(drop).forEach(function (ref) { delete next.nodes[ref]; });
    next.edges = next.edges.filter(function (e) {
      return (e.from === 'root' || next.nodes[e.from]) && (e.to === 'root' || next.nodes[e.to]) && e.from !== e.to;
    });
    return next;
  }

  /** Nodes the orchestrator has not looked at yet. */
  function unverified(plan) {
    return plan.order.filter(function (ref) { return !plan.nodes[ref].verified; });
  }

  /** Nodes the orchestrator saw and let through. */
  function approve(plan, refs) {
    var next = clone(plan);
    refs.forEach(function (ref) { if (next.nodes[ref]) next.nodes[ref].verified = true; });
    return next;
  }

  /** Verification skipped (no answer): the nodes count as looked at, but not as verified. */
  function markChecked(plan, refs) {
    var next = clone(plan);
    refs.forEach(function (ref) { if (next.nodes[ref]) next.nodes[ref].verified = 'skipped'; });
    return next;
  }

  /* ── 6. What is built ────────────────────────────────────────────── */

  /**
   * 'on' (built), 'suggested' (shown, the user may add it), 'off' (the user removed it), 'pending' (not verified yet).
   * `flags` = { excluded: {ref: true}, accepted: {ref: true} }.
   */
  function statusOf(plan, ref, flags) {
    var n = plan.nodes[ref];
    if (!n) return 'off';
    flags = flags || {};
    if (flags.excluded && flags.excluded[ref]) return 'off';
    if (n.parent !== 'root' && !(flags.accepted && flags.accepted[ref])) {
      var up = statusOf(plan, n.parent, flags);
      if (up !== 'on') return up === 'off' ? 'off' : 'suggested';
    }
    if (flags.accepted && flags.accepted[ref]) return 'on';
    if (n.conf >= LIMITS.sure) return 'on';
    if (n.conf >= LIMITS.auto) return n.verified === true ? 'on' : n.verified === 'skipped' ? 'suggested' : 'pending';
    return 'suggested';
  }

  /* ── 7. Build ────────────────────────────────────────────────────── */

  function typeFor(schema, lib, id) {
    if (!id) return { schema: schema, id: '' };
    if (EM().findById(schema.types, id)) return { schema: schema, id: id };
    var have = lib && lib.installedAs(schema, id);
    if (have) return { schema: schema, id: have.id };
    var r = lib && lib.install(schema, [id]);
    if (r && !r.error) return { schema: r.schema, id: (r.typeIds && r.typeIds[id]) || '' };
    return { schema: schema, id: '' };
  }

  function carry(schema, lib, draft, cid) {
    var s = lib ? lib.ensureComponent(schema, cid) : schema;
    var d = draft;
    if (EM().findById(s.components, cid) && EM().componentIdsOf(s, d).indexOf(cid) < 0) d = EC().toggleComponent(s, d, cid, true);
    return { schema: s, draft: d };
  }

  function lookup(pool, name) {
    var k = key(name);
    if (!k) return null;
    var hit = null;
    pool.forEach(function (e) {
      if (hit) return;
      if ([e.name].concat(e.aliases || []).some(function (l) { return key(l) === k; })) hit = e;
    });
    return hit;
  }

  /** Facts on a draft: only fields the draft carries, only values that fit, never over an answer already there. */
  function setFacts(st, draft, facts) {
    var d = draft;
    // gauges last: their maximum (the capacity) must be known to clamp them
    var paths = Object.keys(facts || {}).sort(function (a, b) {
      var fa = EM().fieldOf(st.schema, a);
      var fb = EM().fieldOf(st.schema, b);
      return (fa && fa.field.kind === 'level' ? 1 : 0) - (fb && fb.field.kind === 'level' ? 1 : 0);
    });
    paths.forEach(function (path) {
      var cid = path.split('.')[0];
      if (d.answers[path] !== undefined) return;
      var c = carry(st.schema, st.lib, d, cid);
      st.schema = c.schema;
      d = c.draft;
      var f = EM().fieldOf(st.schema, path);
      if (!f || f.field.kind === 'geo' || f.field.kind === 'ref' || f.field.kind === 'refs') return;
      var v = CAI() ? CAI().coerce(f.field, facts[path], st.pool) : typeof facts[path] === 'string' ? facts[path] : undefined;
      if (v !== undefined && f.field.kind === 'level') {
        var cid2 = path.split('.')[0];
        var b = EM().levelBounds(f.field, function (k) { return d.answers[cid2 + '.' + k]; });
        v = Math.max(b.min, b.known ? Math.min(b.max, v) : v);
      }
      if (v !== undefined) d = EC().setAnswer(d, path, v);
    });
    return d;
  }

  function entityLike(st, id) {
    if (id === st.root.id) return st.root;
    if (st.drafts[id]) return st.drafts[id];
    return EM().findById(st.pool, id);
  }

  /**
   * The plan applied to the entity being created. Pure: call it again after the user switches a node.
   * ctx = { schema, entities (existing + drafts of the interview, as pseudo entities), draft (the root), library }
   * @returns {{schema, draft, extras:object[], reused:string[], included:string[]}}
   */
  function build(ctx, plan, flags) {
    var lib = LIB(ctx);
    var st = { schema: ctx.schema, lib: lib, pool: ctx.entities || [], root: ctx.draft, drafts: {}, refToId: { root: ctx.draft.id }, isNew: { root: true } };
    var extras = [];
    var reused = [];
    var included = [];

    // the root: genre and components from the plan, only where the user has not decided
    var root = st.root;
    // a type is only a list of components, so the thing may take several: the first when it has none, the others when the map is confident
    var wanted = plan.root.types && plan.root.types.length ? plan.root.types : plan.root.type ? [plan.root.type] : [];
    wanted.forEach(function (id, i) {
      if (flags && flags.excluded && flags.excluded['type:' + id]) return;
      if (i > 0 && !(plan.root.conf >= LIMITS.auto)) return;
      if (i === 0 && root.types.length && !(plan.root.conf >= LIMITS.auto)) return;
      var rt = typeFor(st.schema, lib, id);
      st.schema = rt.schema;
      if (rt.id && root.types.indexOf(rt.id) < 0) root = EC().toggleType(st.schema, root, rt.id, true);
    });
    plan.root.components.forEach(function (cid) {
      var c = carry(st.schema, lib, root, cid);
      st.schema = c.schema;
      root = c.draft;
    });
    st.root = root;
    root = setFacts(st, root, plan.root.facts);
    st.root = root;
    if (plan.root.aliases.length && !root.aliases.length) {
      st.root = Object.assign(clone(st.root), { aliases: plan.root.aliases.filter(function (a) { return key(a) !== key(st.root.name); }) });
    }

    // the nodes, parents first
    var order = plan.order.slice().sort(function (a, b) { return plan.nodes[a].depth - plan.nodes[b].depth; });
    order.forEach(function (ref) {
      if (statusOf(plan, ref, flags) !== 'on') return;
      var n = plan.nodes[ref];
      var have = lookup(st.pool.concat(Object.keys(st.drafts).map(function (id) { return st.drafts[id]; })), n.name);
      if (have && key(have.name) === key(ctx.draft.name) && have.id !== ctx.draft.id && (have.types || []).join() === (st.root.types || []).join()) have = null;
      if (have && have.id !== ctx.draft.id) {
        st.refToId[ref] = have.id;
        if (!have.draft || !st.drafts[have.id]) reused.push(have.id);
        included.push(ref);
        return;
      }
      var ids = [];
      (n.types || [n.type]).forEach(function (tid) {
        var t = typeFor(st.schema, lib, tid);
        st.schema = t.schema;
        if (t.id && ids.indexOf(t.id) < 0) ids.push(t.id);
      });
      if (!ids.length) return;
      var d = EC().newDraft({ name: n.name, types: ids, aliases: n.aliases.filter(function (a) { return key(a) !== key(n.name); }) });
      n.components.forEach(function (cid) {
        var c = carry(st.schema, lib, d, cid);
        st.schema = c.schema;
        d = c.draft;
      });
      d = setFacts(st, d, n.facts);
      st.drafts[d.id] = d;
      st.refToId[ref] = d.id;
      st.isNew[ref] = true;
      extras.push(d);
      included.push(ref);
    });

    // the links
    function draftOf(ref) {
      var id = st.refToId[ref];
      if (!id) return null;
      if (id === st.root.id) return st.root;
      return st.drafts[id] || null;
    }
    function put(ref, d) {
      var id = st.refToId[ref];
      if (id === st.root.id) st.root = d;
      else st.drafts[id] = d;
    }
    plan.edges
      .slice()
      .sort(function (a, b) { return depthOf(plan, a.from) - depthOf(plan, b.from); })
      .forEach(function (e) {
        if (!st.refToId[e.from] || !st.refToId[e.to]) return;
        var toId = st.refToId[e.to];
        var target = entityLike(st, toId);
        var from = draftOf(e.from);
        var f = e.via.indexOf('.') > 0 ? EM().fieldOf(carry(st.schema, lib, from || st.root, e.via.split('.')[0]).schema, e.via) : null;
        if (f && from) {
          var c = carry(st.schema, lib, from, e.via.split('.')[0]);
          st.schema = c.schema;
          from = c.draft;
          var field = f.field;
          var ok = (field.kind === 'ref' || field.kind === 'refs') && target && EC().eligible(field, { id: toId, types: target.types || [] }, from, st.schema);
          var cur = from.answers[e.via];
          if (ok && field.kind === 'ref' && cur === undefined) from = EC().setAnswer(from, e.via, toId);
          else if (ok && field.kind === 'refs') from = EC().setAnswer(from, e.via, (Array.isArray(cur) ? cur : []).filter(function (x) { return x !== toId; }).concat([toId]));
          else if (field.rel && EM().relationById(field.rel)) from = EC().addRelationTo(from, EM().relationById(field.rel).name, toId);
          if (ok && (e.via === 'provenance.fabricant' || field.rel === 'made-by') && from.answers['produit.marque'] === undefined && EM().componentIdsOf(st.schema, from).indexOf('produit') >= 0) {
            from = EC().setAnswer(from, 'produit.marque', target.name);
          }
          put(e.from, from);
          return;
        }
        var m = EM().matchRelation(e.via);
        var name = m ? m.def.name : 'lié à';
        var a = e.from;
        var b = e.to;
        if (m && m.dir === 'inv') {
          a = e.to;
          b = e.from;
        }
        var holder = draftOf(a);
        if (!holder) {
          // the entity that should hold the link already exists and is never edited: store it from the other end
          holder = draftOf(b);
          if (!holder) return;
          put(b, EC().addRelationTo(holder, EM().inverseLabel(name), st.refToId[a]));
          return;
        }
        put(a, EC().addRelationTo(holder, name, st.refToId[b]));
      });

    return {
      schema: st.schema,
      draft: st.root,
      extras: extras.map(function (d) { return st.drafts[d.id]; }),
      reused: uniq(reused),
      included: included,
    };
  }

  /* ── 8. Views ────────────────────────────────────────────────────── */

  function viaLabel(via) {
    if (via.indexOf('.') > 0) {
      var f = EM().fieldOf({ components: global.EntitiesLibrary ? global.EntitiesLibrary.COMPONENTS : [] }, via);
      return f ? f.field.label : via;
    }
    var m = EM().matchRelation(via);
    return m ? m.def.name : via;
  }

  /**
   * Rows of the map panel, depth-first: { ref, depth, name, typeName, icon, conf, status, via, working, failed,
   * verified, source, existing }. Only nodes at or above LIMITS.keep are listed.
   */
  function tree(plan, ctx, flags) {
    var choices = EC().archetypeChoices(ctx.schema, LIB(ctx));
    var rows = [];
    function incoming(ref) {
      var hit = null;
      plan.edges.forEach(function (e) { if (!hit && e.to === ref) hit = e; });
      return hit;
    }
    function visit(parent, depth) {
      plan.order.forEach(function (ref) {
        var n = plan.nodes[ref];
        if (n.parent !== parent) return;
        var named = (n.types || [n.type]).map(function (id) { return choices.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
        var c = named[0];
        var link = incoming(ref);
        var have = lookup(ctx.entities || [], n.name);
        rows.push({
          ref: ref,
          depth: depth,
          name: n.name,
          typeName: named.map(function (x) { return x.name; }).join(' + '),
          icon: c ? c.icon : 'stack-2',
          conf: n.conf,
          status: statusOf(plan, ref, flags),
          via: link ? viaLabel(link.via).charAt(0).toUpperCase() + viaLabel(link.via).slice(1) : '',
          working: n.working,
          failed: n.failed,
          verified: n.verified === true,
          source: n.source,
          existing: !!have,
          why: n.why,
        });
        visit(ref, depth + 1);
      });
    }
    visit('root', 1);
    return rows;
  }

  /** The genres the map gives the root: [{id, name, on}] ("on" unless the user switched it off). */
  function rootTypes(plan, ctx, flags) {
    var choices = EC().archetypeChoices(ctx.schema, LIB(ctx));
    return (plan.root.types || [])
      .map(function (id) {
        var c = choices.filter(function (x) { return x.id === id; })[0];
        return c ? { id: id, name: c.name, icon: c.icon, on: !(flags && flags.excluded && flags.excluded['type:' + id]) } : null;
      })
      .filter(Boolean);
  }

  /** Interview hints from the plan: the genre of the root and the maker as the brand to propose. */
  function hintsFromPlan(plan, ctx) {
    var out = { det: plan.root.det || '', types: [], candidates: {}, ask: [] };
    var valid = typeIds(ctx);
    (plan.root.types && plan.root.types.length ? plan.root.types : plan.root.type ? [plan.root.type] : []).forEach(function (id) {
      if (valid.indexOf(id) >= 0) out.types.push({ id: id, confidence: plan.root.conf || 0.7, source: 'ia' });
    });
    plan.edges.forEach(function (e) {
      if (e.from !== 'root' || !plan.nodes[e.to]) return;
      var made = e.via === 'provenance.fabricant' || (EM().matchRelation(e.via) && EM().matchRelation(e.via).def.id === 'made-by');
      if (!made) return;
      var n = plan.nodes[e.to];
      out.candidates['produit.marque'] = (out.candidates['produit.marque'] || []).concat([{ label: n.name, confidence: n.conf, source: n.source === 'web' ? 'web' : 'ia' }]);
    });
    return out;
  }

  global.EntitiesReality = {
    LIMITS: LIMITS,
    parseJson: parseJson,
    typeIds: typeIds,
    componentIds: componentIds,
    emptyPlan: emptyPlan,
    normalizeBranch: normalizeBranch,
    addBranch: addBranch,
    setWorking: setWorking,
    toExpand: toExpand,
    applyVerdicts: applyVerdicts,
    unverified: unverified,
    markChecked: markChecked,
    approve: approve,
    statusOf: statusOf,
    build: build,
    tree: tree,
    hintsFromPlan: hintsFromPlan,
    rootTypes: rootTypes,
  };
})(typeof window !== 'undefined' ? window : this);
