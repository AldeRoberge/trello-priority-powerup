/**
 * priority-ui-catalogs: part 2 of 2 (normalizeCustomAssigneeEntry).
 * Names are shared with the other parts through window.PriorityUIParts (see priority-ui-catalogs.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});

  // from earlier parts (values)
  var AXIS_SCORE_MAX = S.AXIS_SCORE_MAX;
  var MAX_CUSTOM_ASSIGNEES = S.MAX_CUSTOM_ASSIGNEES;
  var MAX_CUSTOM_ASSIGNEE_NAME_LEN = S.MAX_CUSTOM_ASSIGNEE_NAME_LEN;

  // from other parts (functions, resolved at call time)
  function initialsFromName() { return S.initialsFromName.apply(this, arguments); }
  function isCustomAssigneeId() { return S.isCustomAssigneeId.apply(this, arguments); }
  function makeCustomAssigneeId() { return S.makeCustomAssigneeId.apply(this, arguments); }

  function normalizeCustomAssigneeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name =
      typeof raw.name === 'string'
        ? raw.name.trim()
        : typeof raw.fullName === 'string'
          ? raw.fullName.trim()
          : typeof raw.label === 'string'
            ? raw.label.trim()
            : '';
    if (!name) return null;
    if (name.length > MAX_CUSTOM_ASSIGNEE_NAME_LEN) {
      name = name.slice(0, MAX_CUSTOM_ASSIGNEE_NAME_LEN);
    }
    var id =
      typeof raw.id === 'string' && isCustomAssigneeId(raw.id.trim())
        ? raw.id.trim()
        : makeCustomAssigneeId(name);
    var trelloMemberId = '';
    if (typeof raw.trelloMemberId === 'string' && raw.trelloMemberId.trim()) {
      trelloMemberId = raw.trelloMemberId.trim();
    } else if (
      typeof raw.linkedMemberId === 'string' &&
      raw.linkedMemberId.trim()
    ) {
      trelloMemberId = raw.linkedMemberId.trim();
    }
    // Never treat a custom person id as a Trello link.
    if (isCustomAssigneeId(trelloMemberId)) trelloMemberId = '';
    return {
      id: id,
      name: name,
      trelloMemberId: trelloMemberId || undefined
    };
  }

  function normalizeCustomAssignees(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    var seenName = Object.create(null);
    for (var i = 0; i < list.length && out.length < MAX_CUSTOM_ASSIGNEES; i++) {
      var entry = normalizeCustomAssigneeEntry(list[i]);
      if (!entry || seen[entry.id]) continue;
      var nameKey = entry.name.toLocaleLowerCase('fr-FR');
      if (seenName[nameKey]) continue;
      seen[entry.id] = true;
      seenName[nameKey] = true;
      var row = { id: entry.id, name: entry.name };
      if (entry.trelloMemberId) row.trelloMemberId = entry.trelloMemberId;
      out.push(row);
    }
    return out;
  }

  function createCustomAssignee(input, options) {
    options = options || {};
    var name =
      typeof input === 'string'
        ? input.trim()
        : input && typeof input.name === 'string'
          ? input.name.trim()
          : input && typeof input.fullName === 'string'
            ? input.fullName.trim()
            : '';
    if (!name) return null;
    var draft = normalizeCustomAssigneeEntry({
      name: name,
      id:
        input && typeof input === 'object' && typeof input.id === 'string'
          ? input.id
          : undefined,
      trelloMemberId:
        input && typeof input === 'object'
          ? input.trelloMemberId || input.linkedMemberId || ''
          : ''
    });
    return draft;
  }

  function getCustomAssigneeCatalog() {
    return S.customAssigneeCatalog.slice();
  }

  function setCustomAssigneeCatalog(raw) {
    S.customAssigneeCatalog = normalizeCustomAssignees(raw);
    return S.customAssigneeCatalog.slice();
  }

  function findCustomAssigneeCatalogById(id) {
    var key = id != null ? String(id) : '';
    if (!key) return null;
    for (var i = 0; i < S.customAssigneeCatalog.length; i++) {
      if (String(S.customAssigneeCatalog[i].id) === key) {
        return S.customAssigneeCatalog[i];
      }
    }
    return null;
  }

  function findCustomAssigneeCatalogByName(name) {
    var nameKey = String(name || '')
      .trim()
      .toLocaleLowerCase('fr-FR');
    if (!nameKey) return null;
    for (var i = 0; i < S.customAssigneeCatalog.length; i++) {
      if (S.customAssigneeCatalog[i].name.toLocaleLowerCase('fr-FR') === nameKey) {
        return S.customAssigneeCatalog[i];
      }
    }
    return null;
  }

  /**
   * Upsert a Hors Trello person into the board catalog.
   * Reuses an existing entry when id or name already matches (stable ids across cards).
   */
  function upsertCustomAssigneeCatalog(input) {
    var draft =
      input && typeof input === 'object' && isCustomAssigneeId(input.id)
        ? normalizeCustomAssigneeEntry(input)
        : createCustomAssignee(input);
    if (!draft) return null;

    var byId = findCustomAssigneeCatalogById(draft.id);
    var byName = findCustomAssigneeCatalogByName(draft.name);
    var existing = byId || byName;
    if (existing) {
      var next = {
        id: existing.id,
        name: draft.name || existing.name
      };
      var link =
        draft.trelloMemberId || existing.trelloMemberId || undefined;
      if (link) next.trelloMemberId = link;
      var nextList = S.customAssigneeCatalog.map(function (item) {
        return String(item.id) === String(existing.id) ? next : item;
      });
      S.customAssigneeCatalog = normalizeCustomAssignees(nextList);
      return findCustomAssigneeCatalogById(existing.id) || next;
    }

    if (S.customAssigneeCatalog.length >= MAX_CUSTOM_ASSIGNEES) return null;
    S.customAssigneeCatalog = normalizeCustomAssignees(
      S.customAssigneeCatalog.concat([draft])
    );
    return findCustomAssigneeCatalogById(draft.id) || draft;
  }

  /**
   * Merge card (or other) people into the board catalog without remapping ids.
   * Returns { changed, catalog }.
   */
  function mergeIntoCustomAssigneeCatalog(entries) {
    var before = JSON.stringify(S.customAssigneeCatalog);
    var list = Array.isArray(entries) ? entries : [];
    for (var i = 0; i < list.length; i++) {
      var entry = normalizeCustomAssigneeEntry(list[i]);
      if (!entry) continue;
      if (findCustomAssigneeCatalogById(entry.id)) {
        upsertCustomAssigneeCatalog(entry);
        continue;
      }
      if (findCustomAssigneeCatalogByName(entry.name)) {
        // Name already catalogued under another id — keep both catalogs
        // distinct only by skipping so picker shows the first stable id.
        continue;
      }
      if (S.customAssigneeCatalog.length >= MAX_CUSTOM_ASSIGNEES) break;
      S.customAssigneeCatalog = normalizeCustomAssignees(
        S.customAssigneeCatalog.concat([entry])
      );
    }
    var catalog = getCustomAssigneeCatalog();
    return {
      changed: JSON.stringify(catalog) !== before,
      catalog: catalog
    };
  }

  /**
   * Named places (De / Vers / Où).
   * Board catalog: placeCatalog. Card: cardPriority.places { from?, to?, at? }.
   */
  var PLACE_ID_RE = /^place-[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var MAX_PLACES_CATALOG = 40;
  var MAX_PLACE_NAME_LEN = 80;
  var MAX_PLACE_DO_LEN = 120;
  var MAX_PLACE_VIA = 6;
  var PLACE_SLOTS = ['from', 'to', 'at'];
  S.placeCatalog = [];

  function isPlaceId(id) {
    return typeof id === 'string' && PLACE_ID_RE.test(id);
  }

  function slugifyPlaceName(name) {
    return (
      String(name || '')
        .toLocaleLowerCase('fr-FR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28) || 'lieu'
    );
  }

  function makePlaceId(name) {
    return (
      'place-' +
      slugifyPlaceName(name) +
      '-' +
      Math.random().toString(36).slice(2, 6)
    );
  }

  function normalizePlaceRef(raw) {
    if (
      global.Places &&
      typeof global.Places.normalizePlaceRef === 'function'
    ) {
      return global.Places.normalizePlaceRef(raw);
    }
    if (!raw || typeof raw !== 'object') return null;
    var name =
      typeof raw.name === 'string'
        ? raw.name.trim()
        : typeof raw.label === 'string'
          ? raw.label.trim()
          : '';
    if (!name) return null;
    if (name.length > MAX_PLACE_NAME_LEN) {
      name = name.slice(0, MAX_PLACE_NAME_LEN);
    }
    var id =
      typeof raw.id === 'string' && isPlaceId(raw.id.trim())
        ? raw.id.trim()
        : makePlaceId(name);
    return { id: id, name: name };
  }

  function normalizePlaces(raw) {
    if (
      global.Places &&
      typeof global.Places.normalizePlaces === 'function'
    ) {
      return global.Places.normalizePlaces(raw);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    var out = {};
    for (var i = 0; i < PLACE_SLOTS.length; i++) {
      var slot = PLACE_SLOTS[i];
      var ref = normalizePlaceRef(raw[slot]);
      if (ref) out[slot] = ref;
    }
    return out;
  }

  /** Every ref on a card's places map, in route order. */
  function placeRefsOf(map) {
    var n = normalizePlaces(map);
    var refs = [];
    if (n.from) refs.push(n.from);
    (n.via || []).forEach(function (r) {
      refs.push(r);
    });
    if (n.to) refs.push(n.to);
    if (n.at) refs.push(n.at);
    return refs;
  }

  function normalizePlaceCatalog(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    var seenName = Object.create(null);
    for (var i = 0; i < list.length && out.length < MAX_PLACES_CATALOG; i++) {
      var entry = normalizePlaceRef(list[i]);
      if (!entry || seen[entry.id]) continue;
      var nameKey = entry.name.toLocaleLowerCase('fr-FR');
      if (seenName[nameKey]) continue;
      seen[entry.id] = true;
      seenName[nameKey] = true;
      out.push({ id: entry.id, name: entry.name });
    }
    return out;
  }

  function createPlaceRef(input) {
    var name =
      typeof input === 'string'
        ? input.trim()
        : input && typeof input.name === 'string'
          ? input.name.trim()
          : '';
    if (!name) return null;
    return normalizePlaceRef({
      name: name,
      id:
        input && typeof input === 'object' && typeof input.id === 'string'
          ? input.id
          : undefined
    });
  }

  function getPlaceCatalog() {
    return S.placeCatalog.slice();
  }

  function setPlaceCatalog(raw) {
    S.placeCatalog = normalizePlaceCatalog(raw);
    return S.placeCatalog.slice();
  }

  function findPlaceCatalogById(id) {
    var key = id != null ? String(id) : '';
    if (!key) return null;
    for (var i = 0; i < S.placeCatalog.length; i++) {
      if (String(S.placeCatalog[i].id) === key) return S.placeCatalog[i];
    }
    return null;
  }

  function findPlaceCatalogByName(name) {
    var nameKey = String(name || '')
      .trim()
      .toLocaleLowerCase('fr-FR');
    if (!nameKey) return null;
    for (var i = 0; i < S.placeCatalog.length; i++) {
      if (S.placeCatalog[i].name.toLocaleLowerCase('fr-FR') === nameKey) {
        return S.placeCatalog[i];
      }
    }
    return null;
  }

  function upsertPlaceCatalog(input) {
    var draft =
      input && typeof input === 'object' && isPlaceId(input.id)
        ? normalizePlaceRef(input)
        : createPlaceRef(input);
    if (!draft) return null;

    var byId = findPlaceCatalogById(draft.id);
    var byName = findPlaceCatalogByName(draft.name);
    var existing = byId || byName;
    if (existing) {
      var next = { id: existing.id, name: draft.name || existing.name };
      var nextList = S.placeCatalog.map(function (item) {
        return String(item.id) === String(existing.id) ? next : item;
      });
      S.placeCatalog = normalizePlaceCatalog(nextList);
      return findPlaceCatalogById(existing.id) || next;
    }

    if (S.placeCatalog.length >= MAX_PLACES_CATALOG) return null;
    S.placeCatalog = normalizePlaceCatalog(S.placeCatalog.concat([draft]));
    return findPlaceCatalogById(draft.id) || draft;
  }

  function mergeIntoPlaceCatalog(entries) {
    var before = JSON.stringify(S.placeCatalog);
    var list = Array.isArray(entries) ? entries : [];
    if (
      global.Places &&
      typeof global.Places.mergeIntoPlaceCatalog === 'function' &&
      entries &&
      !Array.isArray(entries) &&
      Array.isArray(entries.places)
    ) {
      var merged = global.Places.mergeIntoPlaceCatalog(S.placeCatalog, entries);
      S.placeCatalog = normalizePlaceCatalog(merged.catalog);
      return {
        changed: merged.changed,
        catalog: getPlaceCatalog()
      };
    }
    for (var i = 0; i < list.length; i++) {
      var entry = normalizePlaceRef(list[i]);
      if (!entry) continue;
      if (findPlaceCatalogById(entry.id)) {
        upsertPlaceCatalog(entry);
        continue;
      }
      if (findPlaceCatalogByName(entry.name)) continue;
      if (S.placeCatalog.length >= MAX_PLACES_CATALOG) break;
      S.placeCatalog = normalizePlaceCatalog(S.placeCatalog.concat([entry]));
    }
    var catalog = getPlaceCatalog();
    return {
      changed: JSON.stringify(catalog) !== before,
      catalog: catalog
    };
  }

  /**
   * Display shape compatible with assignee chips (avatar / name / roles).
   */
  function customAssigneeToMember(entry, boardMembersList) {
    if (!entry || !entry.id) return null;
    var name = entry.name || 'Personne';
    var member = {
      id: entry.id,
      fullName: name,
      username: '',
      initials: initialsFromName(name),
      custom: true,
      trelloMemberId: entry.trelloMemberId || ''
    };
    if (entry.trelloMemberId && Array.isArray(boardMembersList)) {
      for (var i = 0; i < boardMembersList.length; i++) {
        var bm = boardMembersList[i];
        if (bm && String(bm.id) === String(entry.trelloMemberId)) {
          if (bm.avatar) member.avatar = bm.avatar;
          if (bm.avatarUrl) member.avatarUrl = bm.avatarUrl;
          if (bm.avatarHash) member.avatarHash = bm.avatarHash;
          if (bm.initials && !member.avatar && !member.avatarUrl && !member.avatarHash) {
            member.initials = bm.initials;
          }
          break;
        }
      }
    }
    return member;
  }

  function mergeAssigneesForDisplay(trelloMembers, customList, boardMembersList) {
    var out = [];
    var seen = Object.create(null);
    var trello = Array.isArray(trelloMembers) ? trelloMembers : [];
    for (var i = 0; i < trello.length; i++) {
      if (!trello[i] || !trello[i].id) continue;
      seen[String(trello[i].id)] = true;
      out.push(trello[i]);
    }
    var customs = normalizeCustomAssignees(customList);
    for (var c = 0; c < customs.length; c++) {
      if (seen[customs[c].id]) continue;
      var display = customAssigneeToMember(customs[c], boardMembersList);
      if (display) out.push(display);
    }
    return out;
  }

  // ── 1e. Team graph (who asks whom, who hands off to whom) ───────────────
  // cardPriority.teamLinks: [{ from, to, kind, label? }] between assignee ids.
  //   asks — `from` asked `to` for the work (from sits above, arrow points down)
  //   flow — work goes from `from` to `to` on the same level (horizontal arrow)
  //   both — back and forth between the two (double-headed horizontal arrow)
  // One link per pair of people; the pair key is order-independent.
  var TEAM_LINK_KINDS = ['asks', 'flow', 'both'];
  var MAX_TEAM_LINKS = 60;
  S.teamGraphInstances = 0;
  var MAX_TEAM_LINK_LABEL = 32;

  function teamLinkPairKey(a, b) {
    var x = String(a);
    var y = String(b);
    return x < y ? x + '|' + y : y + '|' + x;
  }

  function normalizeTeamLinks(raw, validIds) {
    if (!Array.isArray(raw)) return [];
    var allowed = null;
    if (validIds) {
      allowed = Object.create(null);
      var ids = Array.isArray(validIds) ? validIds : Object.keys(validIds);
      for (var v = 0; v < ids.length; v++) allowed[String(ids[v])] = true;
    }
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < raw.length && out.length < MAX_TEAM_LINKS; i++) {
      var item = raw[i];
      if (!item || typeof item !== 'object') continue;
      var from = item.from != null ? String(item.from).trim() : '';
      var to = item.to != null ? String(item.to).trim() : '';
      if (!from || !to || from === to) continue;
      if (allowed && (!allowed[from] || !allowed[to])) continue;
      var kind = TEAM_LINK_KINDS.indexOf(item.kind) >= 0 ? item.kind : 'flow';
      var key = teamLinkPairKey(from, to);
      if (seen[key]) continue;
      seen[key] = true;
      var link = { from: from, to: to, kind: kind };
      var label = typeof item.label === 'string' ? item.label.trim() : '';
      if (label.length > MAX_TEAM_LINK_LABEL) {
        label = label.slice(0, MAX_TEAM_LINK_LABEL).trim();
      }
      if (label) link.label = label;
      out.push(link);
    }
    return out;
  }

  /** Add or replace the link between two people (drag / popover edits). */
  function upsertTeamLink(links, input) {
    var list = normalizeTeamLinks(links);
    var next = normalizeTeamLinks([input]);
    if (!next.length) return list;
    var link = next[0];
    var key = teamLinkPairKey(link.from, link.to);
    var out = [];
    var replaced = false;
    for (var i = 0; i < list.length; i++) {
      if (teamLinkPairKey(list[i].from, list[i].to) === key) {
        out.push(link);
        replaced = true;
      } else {
        out.push(list[i]);
      }
    }
    if (!replaced) out.push(link);
    return normalizeTeamLinks(out);
  }

  /**
   * Link created by dragging between two people. Handing work in the opposite
   * direction of an existing hand-off turns it into a back-and-forth.
   */
  function connectTeamPeople(links, from, to, kind) {
    var list = normalizeTeamLinks(links);
    var existing = null;
    var key = teamLinkPairKey(from, to);
    for (var i = 0; i < list.length; i++) {
      if (teamLinkPairKey(list[i].from, list[i].to) === key) existing = list[i];
    }
    var label = existing && existing.label;
    if (
      existing &&
      kind === 'flow' &&
      (existing.kind === 'both' ||
        (existing.kind === 'flow' && existing.from === String(to)))
    ) {
      kind = 'both';
    }
    var input = { from: from, to: to, kind: kind };
    if (label) input.label = label;
    return upsertTeamLink(list, input);
  }

  function removeTeamLink(links, from, to) {
    var key = teamLinkPairKey(from, to);
    return normalizeTeamLinks(links).filter(function (l) {
      return teamLinkPairKey(l.from, l.to) !== key;
    });
  }

  function removePersonFromTeamLinks(links, personId) {
    var id = String(personId);
    return normalizeTeamLinks(links).filter(function (l) {
      return l.from !== id && l.to !== id;
    });
  }

  /**
   * Auto layout: requesters sit on rows above the people they ask; hand-offs
   * run left to right inside a row. opts.heights maps id → measured node height.
   * Returns { nodes: { id: { x, y, w, h, row, col } }, rows, width, height }.
   */
  function layoutTeamGraph(ids, links, opts) {
    opts = opts || {};
    var w = opts.nodeW || 172;
    var hgap = opts.hgap != null ? opts.hgap : 72;
    var vgap = opts.vgap != null ? opts.vgap : 64;
    var heights = opts.heights || {};
    var defaultH = opts.defaultH || 72;
    var list = [];
    var index = Object.create(null);
    (Array.isArray(ids) ? ids : []).forEach(function (raw) {
      var id = String(raw);
      if (index[id] != null) return;
      index[id] = list.length;
      list.push(id);
    });
    var n = list.length;
    var ls = normalizeTeamLinks(links, list);
    var rank = Object.create(null);
    list.forEach(function (id) {
      rank[id] = 0;
    });
    // People joined by a hand-off share a row, so peers stay side by side.
    for (var pass = 0; pass < n * 2; pass++) {
      var changed = false;
      for (var i = 0; i < ls.length; i++) {
        var l = ls[i];
        if (l.kind === 'asks') {
          if (rank[l.to] < rank[l.from] + 1 && rank[l.from] + 1 < n) {
            rank[l.to] = rank[l.from] + 1;
            changed = true;
          }
        } else if (rank[l.from] !== rank[l.to]) {
          rank[l.from] = rank[l.to] = Math.max(rank[l.from], rank[l.to]);
          changed = true;
        }
      }
      if (!changed) break;
    }
    var rows = [];
    list.forEach(function (id) {
      (rows[rank[id]] = rows[rank[id]] || []).push(id);
    });
    rows = rows.filter(Boolean);

    var pos = Object.create(null);
    var rowOf = Object.create(null);
    var y = 0;
    var minX = Infinity;
    var maxX = -Infinity;
    var placed = [];

    rows.forEach(function (rowIds, r) {
      rowIds.forEach(function (id) {
        rowOf[id] = r;
      });
      // Components joined by hand-offs stay side by side.
      var parent = Object.create(null);
      rowIds.forEach(function (id) {
        parent[id] = id;
      });
      var find = function (x) {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };
      var inRow = Object.create(null);
      rowIds.forEach(function (id) {
        inRow[id] = true;
      });
      ls.forEach(function (l) {
        if (l.kind === 'asks' || !inRow[l.from] || !inRow[l.to]) return;
        parent[find(l.from)] = find(l.to);
      });
      var comps = Object.create(null);
      var compOrder = [];
      rowIds.forEach(function (id) {
        var root = find(id);
        if (!comps[root]) {
          comps[root] = [];
          compOrder.push(root);
        }
        comps[root].push(id);
      });
      var groups = compOrder.map(function (root) {
        var members = comps[root];
        // Kahn topo sort over `flow` edges so hand-offs read left to right.
        var indeg = Object.create(null);
        members.forEach(function (id) {
          indeg[id] = 0;
        });
        var flows = ls.filter(function (l) {
          return l.kind === 'flow' && indeg[l.from] != null && indeg[l.to] != null;
        });
        flows.forEach(function (l) {
          indeg[l.to]++;
        });
        var ordered = [];
        var left = members.slice();
        while (left.length) {
          var pick = null;
          for (var k = 0; k < left.length; k++) {
            if (indeg[left[k]] === 0) {
              pick = left[k];
              break;
            }
          }
          if (pick == null) pick = left[0];
          left.splice(left.indexOf(pick), 1);
          ordered.push(pick);
          flows.forEach(function (l) {
            if (l.from === pick && indeg[l.to] > 0) indeg[l.to]--;
          });
        }
        // Barycenter of the people who asked them, to limit wire crossings.
        var sum = 0;
        var cnt = 0;
        ls.forEach(function (l) {
          if (l.kind === 'asks' && members.indexOf(l.to) >= 0 && pos[l.from]) {
            sum += pos[l.from].x + w / 2;
            cnt++;
          }
        });
        return {
          ids: ordered,
          key: cnt ? sum / cnt : null,
          first: Math.min.apply(
            null,
            members.map(function (id) {
              return index[id];
            })
          )
        };
      });
      groups.sort(function (a, b) {
        if (a.key != null && b.key != null && a.key !== b.key) return a.key - b.key;
        return a.first - b.first;
      });
      var order = [];
      groups.forEach(function (g) {
        order = order.concat(g.ids);
      });
      var rowW = order.length * w + (order.length - 1) * hgap;
      var rowH = 0;
      order.forEach(function (id, c) {
        var h = heights[id] > 0 ? heights[id] : defaultH;
        if (h > rowH) rowH = h;
        var x = -rowW / 2 + c * (w + hgap);
        pos[id] = { x: x, y: y, w: w, h: h, row: r, col: c };
        if (x < minX) minX = x;
        if (x + w > maxX) maxX = x + w;
      });
      placed.push(order);
      y += rowH + vgap;
    });

    var shift = isFinite(minX) ? -minX : 0;
    var nodes = Object.create(null);
    Object.keys(pos).forEach(function (id) {
      var p = pos[id];
      nodes[id] = { x: p.x + shift, y: p.y, w: p.w, h: p.h, row: p.row, col: p.col };
    });
    return {
      nodes: nodes,
      rows: placed,
      width: isFinite(maxX) ? maxX + shift : 0,
      height: rows.length ? y - vgap : 0
    };
  }

  /**
   * Wire between two laid-out boxes: vertical between rows, horizontal inside
   * a row, arcing over the row when the two are not neighbours.
   */
  function routeTeamLink(a, b) {
    var x1, y1, x2, y2, c1x, c1y, c2x, c2y;
    var arc = false;
    if (a.manual || b.manual) {
      // Hand-placed nodes: pick the side from where the other node actually is.
      var gx = b.x + b.w / 2 - (a.x + a.w / 2);
      var gy = b.y + b.h / 2 - (a.y + a.h / 2);
      var vertical = Math.abs(gy) > Math.abs(gx) * 0.8;
      a = Object.assign({}, a, { row: 0, col: vertical ? 0 : gx >= 0 ? 0 : 1 });
      b = Object.assign({}, b, { row: vertical ? (gy >= 0 ? 1 : -1) : 0, col: vertical ? 0 : gx >= 0 ? 1 : 0 });
    }
    if (a.row !== b.row) {
      var down = a.row < b.row;
      x1 = a.x + a.w / 2;
      y1 = down ? a.y + a.h : a.y;
      x2 = b.x + b.w / 2;
      y2 = down ? b.y : b.y + b.h;
      var dy = Math.max(28, Math.abs(y2 - y1) * 0.5) * (down ? 1 : -1);
      c1x = x1;
      c1y = y1 + dy;
      c2x = x2;
      c2y = y2 - dy;
    } else if (Math.abs(a.col - b.col) > 1) {
      arc = true;
      var lift = Math.min(64, 30 + 12 * (Math.abs(a.col - b.col) - 1));
      x1 = a.x + a.w / 2;
      y1 = a.y;
      x2 = b.x + b.w / 2;
      y2 = b.y;
      c1x = x1;
      c1y = y1 - lift;
      c2x = x2;
      c2y = y2 - lift;
    } else {
      var right = a.col < b.col;
      x1 = right ? a.x + a.w : a.x;
      y1 = a.y + a.h / 2;
      x2 = right ? b.x : b.x + b.w;
      y2 = b.y + b.h / 2;
      var dx = Math.max(24, Math.abs(x2 - x1) * 0.5) * (right ? 1 : -1);
      c1x = x1 + dx;
      c1y = y1;
      c2x = x2 - dx;
      c2y = y2;
    }
    return {
      d:
        'M' + x1 + ' ' + y1 +
        ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + x2 + ' ' + y2,
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      mx: (x1 + 3 * c1x + 3 * c2x + x2) / 8,
      my: (y1 + 3 * c1y + 3 * c2y + y2) / 8,
      arc: arc
    };
  }

  // Urgency / impact axis max (ease uses 1..5).
  /** Derived legacy urgency axis (0–4) for matrix / Eisenhower / calc graph. */
  var AXIS_UI_MAX = 4;
  var IMPACT_UI_MAX = AXIS_SCORE_MAX;
  var EASE_UI_MAX = AXIS_SCORE_MAX;
  var EMPRESSEMENT_UI_MAX = 4;

  // exports
  S.AXIS_UI_MAX = AXIS_UI_MAX;
  S.EASE_UI_MAX = EASE_UI_MAX;
  S.EMPRESSEMENT_UI_MAX = EMPRESSEMENT_UI_MAX;
  S.IMPACT_UI_MAX = IMPACT_UI_MAX;
  S.MAX_PLACES_CATALOG = MAX_PLACES_CATALOG;
  S.MAX_PLACE_DO_LEN = MAX_PLACE_DO_LEN;
  S.MAX_PLACE_NAME_LEN = MAX_PLACE_NAME_LEN;
  S.MAX_PLACE_VIA = MAX_PLACE_VIA;
  S.MAX_TEAM_LINKS = MAX_TEAM_LINKS;
  S.MAX_TEAM_LINK_LABEL = MAX_TEAM_LINK_LABEL;
  S.PLACE_ID_RE = PLACE_ID_RE;
  S.PLACE_SLOTS = PLACE_SLOTS;
  S.TEAM_LINK_KINDS = TEAM_LINK_KINDS;
  S.connectTeamPeople = connectTeamPeople;
  S.createCustomAssignee = createCustomAssignee;
  S.createPlaceRef = createPlaceRef;
  S.customAssigneeToMember = customAssigneeToMember;
  S.findCustomAssigneeCatalogById = findCustomAssigneeCatalogById;
  S.findCustomAssigneeCatalogByName = findCustomAssigneeCatalogByName;
  S.findPlaceCatalogById = findPlaceCatalogById;
  S.findPlaceCatalogByName = findPlaceCatalogByName;
  S.getCustomAssigneeCatalog = getCustomAssigneeCatalog;
  S.getPlaceCatalog = getPlaceCatalog;
  S.isPlaceId = isPlaceId;
  S.layoutTeamGraph = layoutTeamGraph;
  S.makePlaceId = makePlaceId;
  S.mergeAssigneesForDisplay = mergeAssigneesForDisplay;
  S.mergeIntoCustomAssigneeCatalog = mergeIntoCustomAssigneeCatalog;
  S.mergeIntoPlaceCatalog = mergeIntoPlaceCatalog;
  S.normalizeCustomAssigneeEntry = normalizeCustomAssigneeEntry;
  S.normalizeCustomAssignees = normalizeCustomAssignees;
  S.normalizePlaceCatalog = normalizePlaceCatalog;
  S.normalizePlaceRef = normalizePlaceRef;
  S.normalizePlaces = normalizePlaces;
  S.normalizeTeamLinks = normalizeTeamLinks;
  S.placeRefsOf = placeRefsOf;
  S.removePersonFromTeamLinks = removePersonFromTeamLinks;
  S.removeTeamLink = removeTeamLink;
  S.routeTeamLink = routeTeamLink;
  S.setCustomAssigneeCatalog = setCustomAssigneeCatalog;
  S.setPlaceCatalog = setPlaceCatalog;
  S.slugifyPlaceName = slugifyPlaceName;
  S.teamLinkPairKey = teamLinkPairKey;
  S.upsertCustomAssigneeCatalog = upsertCustomAssigneeCatalog;
  S.upsertPlaceCatalog = upsertPlaceCatalog;
  S.upsertTeamLink = upsertTeamLink;
})(typeof window !== 'undefined' ? window : this);
