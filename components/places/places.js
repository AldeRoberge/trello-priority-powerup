/**
 * Member Places directory — named locations with kind, aliases, notes.
 * Stored at member/private (same privacy lane as peopleDirectory).
 * Exposes window.Places (no bundler).
 *
 * Kind ("maison", "travail") seeds compact aliases; synonym groups expand at
 * match time (home ↔ maison ↔ chez moi…). resolveInText() rewrites place
 * phrases to the canonical name. Card slots use slim { id, name } refs
 * (from / to / at) via board placeCatalog.
 */
(function (global) {
  'use strict';

  function dbg() {
    return global.TpDebug || null;
  }
  function dbgLog(domain, event, meta) {
    var d = dbg();
    if (d && d.log) d.log(domain, event, meta);
  }
  function dbgError(domain, event, err, meta) {
    var d = dbg();
    if (d && d.error) d.error(domain, event, err, meta);
    else if (err) console.error(domain + '.' + event, err);
  }

  var STORAGE_KEY = 'placesDirectory';
  var MAX_PLACES = 40;
  var MAX_NAME = 80;
  var MAX_ALIAS = 40;
  var MAX_ALIASES = 12;
  var MAX_KIND = 40;
  var MAX_NOTES = 400;
  var MAX_ADDRESS = 200;
  /** Per-stop "what we do here" text on a card. */
  var MAX_DO = 120;
  /** Intermediate stops between De and Vers. */
  var MAX_VIA = 6;
  var LOAD_TTL_MS = 30000;
  /** Soft refresh window for agent turns (cross-window profile edits). */
  var AGENT_REFRESH_MAX_AGE_MS = 5000;
  var PLACE_SLOTS = ['from', 'to', 'at'];
  var loadCache = { directory: null, at: 0, inflight: null };

  /** Possessive / article prefixes commonly used with place aliases in FR/EN. */
  var FR_DET = [
    'ma',
    'mon',
    'mes',
    'ta',
    'ton',
    'tes',
    'sa',
    'son',
    'ses',
    'la',
    'le',
    'les',
    'du',
    'au',
    'aux',
    'des',
    'notre',
    'nos',
    'votre',
    'vos',
    'leur',
    'leurs',
    'my',
    'our',
    'your',
    'his',
    'her',
    'their',
    'the'
  ];

  /**
   * Built-in synonym groups: storing any one expands matching to the group.
   * Match-time only; common FR/EN place kinds.
   */
  var ALIAS_SYNONYM_GROUPS = [
    [
      'maison',
      'home',
      'chez moi',
      'chez nous',
      'domicile',
      'house',
      'appartement',
      'appart',
      'condo'
    ],
    [
      'travail',
      'work',
      'bureau',
      'office',
      'job',
      'workplace',
      'lieu de travail'
    ],
    [
      'chalet',
      'cottage',
      'cabin',
      'chalet familial',
      'maison de campagne',
      'campagne'
    ],
    ['ecole', 'school', 'universite', 'university', 'college', 'campus'],
    ['magasin', 'store', 'boutique', 'shop', 'commerce'],
    ['entrepot', 'warehouse', 'depot', 'stockage'],
    ['client', 'chez le client', 'site client', 'customer site'],
    ['clinique', 'hopital', 'hospital', 'cabinet', 'medecin'],
    ['garage', 'atelier', 'workshop'],
    ['jardin', 'cour', 'yard', 'exterieur', 'outside']
  ];

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function foldAccents(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normKey(s) {
    return foldAccents(String(s || ''))
      .toLowerCase()
      .replace(/['’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Strip a single leading FR/EN determinant ("chez moi" kept; "la maison" → "maison"). */
  function stripLeadingDet(folded) {
    var bare = String(folded || '');
    for (var d = 0; d < FR_DET.length; d++) {
      var pref = FR_DET[d] + ' ';
      if (bare.indexOf(pref) === 0) {
        return bare.slice(pref.length).trim();
      }
    }
    return bare;
  }

  function phraseContains(haystack, needle) {
    if (!haystack || !needle) return false;
    if (haystack === needle) return true;
    var re = new RegExp(
      '(?:^|\\s)' + escapeRegExp(needle) + '(?=\\s|$)'
    );
    return re.test(haystack);
  }

  function findSynonymGroupForText(text) {
    var t = normKey(text);
    if (!t) return null;
    var bare = stripLeadingDet(t);
    var bestGroup = null;
    var bestLen = -1;
    for (var g = 0; g < ALIAS_SYNONYM_GROUPS.length; g++) {
      var group = ALIAS_SYNONYM_GROUPS[g];
      for (var i = 0; i < group.length; i++) {
        var member = group[i];
        if (
          t === member ||
          bare === member ||
          phraseContains(t, member) ||
          phraseContains(bare, member)
        ) {
          if (member.length > bestLen) {
            bestLen = member.length;
            bestGroup = group;
          }
        }
      }
    }
    return bestGroup;
  }

  /**
   * From a free-text kind ("maison", "home", "travail") produce compact seed
   * aliases. Full synonym expansion happens at match time.
   */
  function aliasesFromKind(kind) {
    var raw = clampStr(kind, MAX_KIND);
    if (!raw) return [];
    var t = normKey(raw);
    var out = [raw];
    function push(s) {
      if (s && out.indexOf(s) === -1) out.push(s);
    }
    var bare = stripLeadingDet(t);
    if (bare && bare !== t) push(bare);

    var group = findSynonymGroupForText(t);
    if (group && group[0]) {
      push(group[0]);
    }
    return normalizeStringList(out, MAX_ALIAS, MAX_ALIASES);
  }

  function rememberDirectory(directory) {
    loadCache.directory = directory;
    loadCache.at = Date.now();
    return directory;
  }

  function cachedDirectory(maxAgeMs) {
    if (!loadCache.directory) return null;
    var ttl =
      typeof maxAgeMs === 'number' && maxAgeMs >= 0 ? maxAgeMs : LOAD_TTL_MS;
    if (Date.now() - loadCache.at > ttl) return null;
    return loadCache.directory;
  }

  function clearLoadCache() {
    loadCache.directory = null;
    loadCache.at = 0;
    loadCache.inflight = null;
  }

  function placeId() {
    return (
      'place-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function clampStr(s, max) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return '';
    return t.length > max ? t.slice(0, max) : t;
  }

  function normalizeStringList(raw, maxItem, maxLen) {
    var src = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(/[,;|/]/)
        : [];
    var out = [];
    var seen = {};
    for (var i = 0; i < src.length && out.length < maxLen; i++) {
      var item = clampStr(src[i], maxItem);
      if (!item) continue;
      var key = normKey(item);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(item);
    }
    return out;
  }

  function emptyDirectory() {
    return {
      version: 1,
      places: [],
      updatedAt: ''
    };
  }

  function normalizePlace(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = clampStr(raw.name, MAX_NAME);
    if (!name) return null;
    var id =
      typeof raw.id === 'string' && /^place-[a-z0-9-]+$/i.test(raw.id.trim())
        ? raw.id.trim()
        : placeId();
    var kind = clampStr(raw.kind, MAX_KIND);
    var notes = clampStr(raw.notes, MAX_NOTES);
    var address = clampStr(raw.address, MAX_ADDRESS);
    var gps = normalizeGps(raw.lat, raw.lng);
    var aliases = normalizeStringList(raw.aliases, MAX_ALIAS, MAX_ALIASES);
    aliases = normalizeStringList(
      aliases.concat(aliasesFromKind(kind)),
      MAX_ALIAS,
      MAX_ALIASES
    );
    aliases = aliases.filter(function (a) {
      return normKey(a) !== normKey(name);
    });
    var out = {
      id: id,
      name: name,
      kind: kind,
      aliases: aliases,
      notes: notes,
      address: address,
      updatedAt:
        typeof raw.updatedAt === 'string' && raw.updatedAt
          ? raw.updatedAt
          : ''
    };
    if (gps) {
      out.lat = gps.lat;
      out.lng = gps.lng;
    }
    return out;
  }

  /** Valid WGS84 pair (6 decimals, about 10 cm) or null. */
  function normalizeGps(lat, lng) {
    if (lat == null || lng == null || lat === '' || lng === '') return null;
    var a =
      typeof lat === 'number' ? lat : parseFloat(String(lat).replace(',', '.'));
    var b =
      typeof lng === 'number' ? lng : parseFloat(String(lng).replace(',', '.'));
    if (!isFinite(a) || !isFinite(b)) return null;
    if (a < -90 || a > 90 || b < -180 || b > 180) return null;
    return {
      lat: Math.round(a * 1e6) / 1e6,
      lng: Math.round(b * 1e6) / 1e6
    };
  }

  /**
   * Coordinates from free text: "48.1189, -77.7828", "48.1189 -77.7828", or a
   * Google Maps / OpenStreetMap link (@lat,lng, !3d..!4d.., q=lat,lng,
   * mlat=..&mlon=..). Returns { lat, lng } or null.
   */
  function parseCoordinates(text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return null;
    var m;
    try {
      t = decodeURIComponent(t);
    } catch (e) {}
    m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t);
    if (m) return normalizeGps(m[1], m[2]);
    m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t);
    if (m) return normalizeGps(m[1], m[2]);
    m = /[?&#](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?)[, +](-?\d+(?:\.\d+)?)/.exec(t);
    if (m) return normalizeGps(m[1], m[2]);
    m = /mlat=(-?\d+(?:\.\d+)?)&mlon=(-?\d+(?:\.\d+)?)/.exec(t);
    if (m) return normalizeGps(m[1], m[2]);
    m = /^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/.exec(t);
    if (m) return normalizeGps(m[1], m[2]);
    return null;
  }

  /** Map link for a directory place: GPS first, then address, then name. */
  function mapsUrl(place) {
    if (!place) return '';
    var q = '';
    if (typeof place.lat === 'number' && typeof place.lng === 'number') {
      q = place.lat + ',' + place.lng;
    } else if (place.address) {
      q = place.address;
    } else if (place.name) {
      q = place.name;
    }
    if (!q) return '';
    return (
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)
    );
  }

  function geoQuery(place) {
    if (!place) return '';
    if (typeof place.lat === 'number' && typeof place.lng === 'number') {
      return place.lat + ',' + place.lng;
    }
    return place.address || '';
  }

  /**
   * Multi-stop Google Maps directions for directory places in route order.
   * Only stops with GPS or an address count (a bare name is too ambiguous);
   * returns '' unless every stop is locatable and there are at least two.
   */
  function directionsUrl(list) {
    var queries = (Array.isArray(list) ? list : []).map(geoQuery);
    if (queries.length < 2 || queries.some(function (q) { return !q; })) {
      return '';
    }
    var url =
      'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(queries[0]) +
      '&destination=' +
      encodeURIComponent(queries[queries.length - 1]);
    if (queries.length > 2) {
      url +=
        '&waypoints=' +
        encodeURIComponent(queries.slice(1, -1).join('|'));
    }
    return url;
  }

  function normalizeDirectory(raw) {
    var out = emptyDirectory();
    if (!raw || typeof raw !== 'object') return out;
    var src = Array.isArray(raw.places)
      ? raw.places
      : Array.isArray(raw)
        ? raw
        : [];
    var seenIds = {};
    var seenNames = {};
    for (var i = 0; i < src.length && out.places.length < MAX_PLACES; i++) {
      var p = normalizePlace(src[i]);
      if (!p) continue;
      if (seenIds[p.id]) {
        p.id = placeId();
      }
      var nk = normKey(p.name);
      if (seenNames[nk]) continue;
      seenIds[p.id] = true;
      seenNames[nk] = true;
      out.places.push(p);
    }
    out.updatedAt =
      typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : '';
    return out;
  }

  /** Slim board/card ref { id, name }. */
  function normalizePlaceRef(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = clampStr(raw.name, MAX_NAME);
    if (!name) return null;
    var id =
      typeof raw.id === 'string' && /^place-[a-z0-9-]+$/i.test(raw.id.trim())
        ? raw.id.trim()
        : placeId();
    var out = { id: id, name: name };
    var doText = clampStr(raw.do, MAX_DO);
    if (doText) out.do = doText;
    return out;
  }

  /**
   * Card places map: { from?, via?: [ref...], to?, at? }. Empty slots omitted.
   *  - at         : the task happens in one place.
   *  - from / to  : a trip; via = intermediate stops, in order.
   * A ref is { id, name, do? } where `do` is what is done there.
   */
  function normalizePlaces(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    var out = {};
    for (var i = 0; i < PLACE_SLOTS.length; i++) {
      var slot = PLACE_SLOTS[i];
      var ref = normalizePlaceRef(raw[slot]);
      if (ref) out[slot] = ref;
    }
    if (Array.isArray(raw.via)) {
      var via = [];
      for (var v = 0; v < raw.via.length && via.length < MAX_VIA; v++) {
        var vref = normalizePlaceRef(raw.via[v]);
        if (vref) via.push(vref);
      }
      if (via.length) out.via = via;
    }
    return out;
  }

  /**
   * Ordered stops for display / routing:
   * [{ key: 'from'|'via'|'to'|'at', index?, ref }].
   */
  function routeStops(places) {
    var n = normalizePlaces(places);
    var out = [];
    if (n.from) out.push({ key: 'from', ref: n.from });
    (n.via || []).forEach(function (ref, index) {
      out.push({ key: 'via', index: index, ref: ref });
    });
    if (n.to) out.push({ key: 'to', ref: n.to });
    if (n.at) out.push({ key: 'at', ref: n.at });
    return out;
  }

  /** Every ref on a card, in route order (for catalog seeding). */
  function refsOf(places) {
    return routeStops(places).map(function (s) {
      return s.ref;
    });
  }

  function placesEqual(a, b) {
    return JSON.stringify(normalizePlaces(a)) === JSON.stringify(normalizePlaces(b));
  }

  function hasAnyPlace(places) {
    var n = normalizePlaces(places);
    return !!(n.from || n.to || n.at || (n.via && n.via.length));
  }

  function expandedAliasKeys(place) {
    var keys = {};
    function add(raw) {
      var k = normKey(raw);
      if (k) keys[k] = true;
    }
    (place.aliases || []).forEach(add);
    if (place.kind) {
      add(place.kind);
      var kindBare = stripLeadingDet(normKey(place.kind));
      if (kindBare) add(kindBare);
    }
    var allKeys = Object.keys(keys);
    for (var g = 0; g < ALIAS_SYNONYM_GROUPS.length; g++) {
      var group = ALIAS_SYNONYM_GROUPS[g];
      var hit = false;
      for (var i = 0; i < group.length; i++) {
        if (keys[normKey(group[i])]) {
          hit = true;
          break;
        }
      }
      if (hit) {
        for (var j = 0; j < group.length; j++) add(group[j]);
      }
    }
    return Object.keys(keys);
  }

  function matchPhrasesForPlace(place) {
    var phrases = [];
    var seen = {};
    var nameKey = normKey(place.name);
    function push(phrase) {
      var k = normKey(phrase);
      if (!k || seen[k]) return;
      // Never match the place's own name, or a word already inside that name
      // (kind "maison" must not rewrite "Maison Montréal" → double name).
      if (k === nameKey) return;
      if (phraseContains(nameKey, k)) return;
      seen[k] = true;
      phrases.push(phrase);
    }

    var aliasKeys = expandedAliasKeys(place);
    for (var i = 0; i < aliasKeys.length; i++) {
      var base = aliasKeys[i];
      push(base);
      for (var d = 0; d < FR_DET.length; d++) {
        push(FR_DET[d] + ' ' + base);
      }
    }
    phrases.sort(function (a, b) {
      return b.length - a.length;
    });
    return phrases;
  }

  function findByAliasOrName(directoryOrPlaces, query) {
    var q = normKey(query);
    if (!q) return null;
    var qBare = stripLeadingDet(q);

    var places = Array.isArray(directoryOrPlaces)
      ? directoryOrPlaces
      : directoryOrPlaces && Array.isArray(directoryOrPlaces.places)
        ? directoryOrPlaces.places
        : [];

    var nameHit = null;
    var aliasHit = null;
    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      if (!p || !p.name) continue;
      if (normKey(p.name) === q || normKey(p.name) === qBare) {
        nameHit = p;
        break;
      }
      var phrases = matchPhrasesForPlace(p);
      for (var j = 0; j < phrases.length; j++) {
        if (normKey(phrases[j]) === q || normKey(phrases[j]) === qBare) {
          aliasHit = p;
          break;
        }
      }
      if (aliasHit) break;
    }
    return nameHit || aliasHit;
  }

  function resolveInText(text, directoryOrPlaces) {
    if (typeof text !== 'string' || !text) return text || '';
    var places = Array.isArray(directoryOrPlaces)
      ? directoryOrPlaces
      : directoryOrPlaces && Array.isArray(directoryOrPlaces.places)
        ? directoryOrPlaces.places
        : [];
    if (!places.length) return text;

    var pairs = [];
    for (var i = 0; i < places.length; i++) {
      var p = places[i];
      if (!p || !p.name) continue;
      var phrases = matchPhrasesForPlace(p);
      for (var j = 0; j < phrases.length; j++) {
        pairs.push({ phrase: phrases[j], name: p.name });
      }
    }
    pairs.sort(function (a, b) {
      return b.phrase.length - a.phrase.length;
    });

    var result = text;
    for (var k = 0; k < pairs.length; k++) {
      var phrase = pairs[k].phrase;
      var name = pairs[k].name;
      var re = new RegExp(
        '(^|[^\\p{L}\\p{N}_])(' + escapeRegExp(phrase) + ')(?=[^\\p{L}\\p{N}_]|$)',
        'giu'
      );
      try {
        result = result.replace(re, function (full, lead) {
          return lead + name;
        });
      } catch (e) {
        var reLegacy = new RegExp(
          '(^|[^A-Za-zÀ-ÿ0-9_])(' +
            escapeRegExp(phrase) +
            ')(?=[^A-Za-zÀ-ÿ0-9_]|$)',
          'gi'
        );
        result = result.replace(reLegacy, function (full, lead) {
          return lead + name;
        });
      }
    }
    return result;
  }

  function upsert(directory, patch) {
    var dir = normalizeDirectory(directory);
    if (!patch || typeof patch !== 'object') return dir;

    var matchText =
      (typeof patch.matchText === 'string' && patch.matchText.trim()) ||
      (typeof patch.id === 'string' && patch.id.trim()) ||
      '';
    var existing = null;
    var existingIdx = -1;

    if (typeof patch.id === 'string' && patch.id.trim()) {
      for (var i = 0; i < dir.places.length; i++) {
        if (dir.places[i].id === patch.id.trim()) {
          existing = dir.places[i];
          existingIdx = i;
          break;
        }
      }
    }
    if (!existing && matchText) {
      existing = findByAliasOrName(dir, matchText);
      if (existing) {
        for (var j = 0; j < dir.places.length; j++) {
          if (dir.places[j].id === existing.id) {
            existingIdx = j;
            break;
          }
        }
      }
    }
    if (!existing && typeof patch.name === 'string' && patch.name.trim()) {
      existing = findByAliasOrName(dir, patch.name);
      if (existing) {
        for (var k = 0; k < dir.places.length; k++) {
          if (dir.places[k].id === existing.id) {
            existingIdx = k;
            break;
          }
        }
      }
    }

    var base = existing
      ? Object.assign({}, existing)
      : {
          // Keep a caller-supplied id so card refs to a catalog-only place
          // still resolve once it is promoted into the directory.
          id:
            typeof patch.id === 'string' && /^place-[a-z0-9-]+$/i.test(patch.id.trim())
              ? patch.id.trim()
              : placeId(),
          name: '',
          kind: '',
          aliases: [],
          notes: '',
          address: '',
          updatedAt: ''
        };

    if (typeof patch.name === 'string' && patch.name.trim()) {
      base.name = clampStr(patch.name, MAX_NAME);
    }
    if (!base.name) return dir;

    if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
      base.kind = clampStr(patch.kind, MAX_KIND);
    }

    if (Array.isArray(patch.aliases) || typeof patch.aliases === 'string') {
      base.aliases = normalizeStringList(patch.aliases, MAX_ALIAS, MAX_ALIASES);
    } else if (typeof patch.addAlias === 'string' && patch.addAlias.trim()) {
      base.aliases = normalizeStringList(
        (base.aliases || []).concat([patch.addAlias]),
        MAX_ALIAS,
        MAX_ALIASES
      );
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
      base.notes = clampStr(patch.notes, MAX_NOTES);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'address')) {
      base.address = clampStr(patch.address, MAX_ADDRESS);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'lat') ||
      Object.prototype.hasOwnProperty.call(patch, 'lng')
    ) {
      var gps = normalizeGps(patch.lat, patch.lng);
      if (gps) {
        base.lat = gps.lat;
        base.lng = gps.lng;
      } else {
        delete base.lat;
        delete base.lng;
      }
    }
    base.updatedAt = new Date().toISOString();

    var nextPlace = normalizePlace(base);
    if (!nextPlace) return dir;

    if (existingIdx >= 0) {
      dir.places[existingIdx] = nextPlace;
    } else {
      if (dir.places.length >= MAX_PLACES) {
        dir.places = dir.places.slice(0, MAX_PLACES - 1);
      }
      dir.places.push(nextPlace);
    }
    dir.updatedAt = nextPlace.updatedAt;
    return dir;
  }

  function remove(directory, match) {
    var dir = normalizeDirectory(directory);
    if (match == null || match === '') return dir;
    var query =
      typeof match === 'string'
        ? match
        : match && (match.id || match.matchText || match.name || '');
    if (!query) return dir;
    var found = null;
    if (typeof match === 'object' && match.id) {
      for (var i = 0; i < dir.places.length; i++) {
        if (dir.places[i].id === match.id) {
          found = dir.places[i];
          break;
        }
      }
    }
    if (!found) found = findByAliasOrName(dir, query);
    if (!found) return dir;
    dir.places = dir.places.filter(function (p) {
      return p.id !== found.id;
    });
    dir.updatedAt = new Date().toISOString();
    return dir;
  }

  function toAgentContext(directoryOrPlaces) {
    var places = Array.isArray(directoryOrPlaces)
      ? directoryOrPlaces
      : directoryOrPlaces && Array.isArray(directoryOrPlaces.places)
        ? directoryOrPlaces.places
        : [];
    return places.slice(0, MAX_PLACES).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        kind: p.kind || null,
        aliases: (p.aliases || []).slice(),
        notes: p.notes || null,
        address: p.address || null,
        gps: typeof p.lat === 'number' && typeof p.lng === 'number'
      };
    });
  }

  function placesPromptLines(directoryOrPlaces) {
    var list = toAgentContext(directoryOrPlaces);
    if (!list.length) {
      return [
        'Lieux (annuaire)\u00a0: vide. Alias inconnu (\u00ab\u00a0chez moi\u00a0\u00bb)\u00a0: DEMANDE quel lieu, puis upsert_place {name, kind}. N\'invente JAMAIS un nom.'
      ];
    }
    var lines = [
      'Lieux (annuaire \u2014 source de v\u00e9rit\u00e9)\u00a0:',
      '- O\u00f9 / de / vers / \u00ab\u00a0chez moi\u00a0\u00bb\u00a0: r\u00e9ponds avec ces fiches. INTERDIT de dire que tu ne sais pas.'
    ];
    list.forEach(function (p) {
      var bits = [p.name];
      if (p.kind) bits.push('type\u00a0: ' + p.kind);
      if (p.aliases && p.aliases.length) {
        var kindKey = p.kind ? normKey(p.kind) : '';
        var kindBare = kindKey ? stripLeadingDet(kindKey) : '';
        var aliasShow = p.aliases.filter(function (a) {
          var k = normKey(a);
          return k && k !== kindKey && k !== kindBare;
        });
        if (aliasShow.length) bits.push('alias\u00a0: ' + aliasShow.slice(0, 4).join(', '));
      }
      if (p.address) bits.push('adresse\u00a0: ' + p.address);
      if (p.notes) bits.push('notes\u00a0: ' + p.notes);
      lines.push('- ' + bits.join(' \u00b7 '));
    });
    lines.push(
      '- Alias / type (\u00ab\u00a0chez moi\u00a0\u00bb)\u00a0: NOM propre partout. Inconnu\u00a0: UNE question, puis upsert_place. Sur la carte\u00a0: set_places {from?, to?, at?}.'
    );
    return lines;
  }

  /** Shape compatible with board placeCatalog / cardPriority.places slots. */
  function toCatalogEntry(place) {
    var p = normalizePlace(place) || normalizePlaceRef(place);
    if (!p) return null;
    return { id: p.id, name: p.name };
  }

  /**
   * Resolve a place spec (string / {name,matchText,id}) via Places aliases
   * into a slim { id, name } draft.
   */
  function resolvePlaceSpec(directoryOrPlaces, spec) {
    var query = '';
    var idWant = '';
    if (typeof spec === 'string' || typeof spec === 'number') {
      query = String(spec).trim();
      idWant = query;
    } else if (spec && typeof spec === 'object') {
      idWant = spec.id != null ? String(spec.id).trim() : '';
      query =
        (typeof spec.matchText === 'string' && spec.matchText.trim()) ||
        (typeof spec.name === 'string' && spec.name.trim()) ||
        idWant;
    }
    if (!query && !idWant) return null;

    var places = Array.isArray(directoryOrPlaces)
      ? directoryOrPlaces
      : directoryOrPlaces && Array.isArray(directoryOrPlaces.places)
        ? directoryOrPlaces.places
        : [];

    if (idWant) {
      for (var i = 0; i < places.length; i++) {
        if (places[i] && places[i].id === idWant) {
          return toCatalogEntry(places[i]);
        }
      }
    }
    var found = findByAliasOrName(directoryOrPlaces, query);
    return found ? toCatalogEntry(found) : null;
  }

  /**
   * Merge Places directory entries into a board placeCatalog array.
   * Returns { changed, catalog }.
   */
  function mergeIntoPlaceCatalog(catalog, directoryOrPlaces) {
    var list = Array.isArray(catalog) ? catalog.slice() : [];
    var places = Array.isArray(directoryOrPlaces)
      ? directoryOrPlaces
      : directoryOrPlaces && Array.isArray(directoryOrPlaces.places)
        ? directoryOrPlaces.places
        : [];
    var before = JSON.stringify(list);
    var byId = {};
    var byName = {};
    for (var i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].id) continue;
      byId[list[i].id] = i;
      byName[normKey(list[i].name)] = i;
    }
    for (var p = 0; p < places.length; p++) {
      var draft = toCatalogEntry(places[p]);
      if (!draft) continue;
      var nameKey = normKey(draft.name);
      if (byId[draft.id] != null) {
        var idx = byId[draft.id];
        list[idx] = { id: draft.id, name: draft.name };
        continue;
      }
      if (byName[nameKey] != null) {
        continue;
      }
      if (list.length >= MAX_PLACES) break;
      list.push(draft);
      byId[draft.id] = list.length - 1;
      byName[nameKey] = list.length - 1;
    }
    return {
      changed: JSON.stringify(list) !== before,
      catalog: list
    };
  }

  async function load(t, options) {
    options = options || {};
    var force = !!options.force;
    var maxAgeMs =
      typeof options.maxAgeMs === 'number' && options.maxAgeMs >= 0
        ? options.maxAgeMs
        : LOAD_TTL_MS;
    if (!t || typeof t.get !== 'function') {
      dbgLog('places', 'load', { ok: false, reason: 'no-client' });
      return emptyDirectory();
    }
    if (!force) {
      var hit = cachedDirectory(maxAgeMs);
      if (hit) return hit;
      if (loadCache.inflight) return loadCache.inflight;
    } else {
      clearLoadCache();
    }

    var fetchPromise = (async function () {
      try {
        var stored = await t.get('member', 'private', STORAGE_KEY);
        var directory = normalizeDirectory(stored);
        dbgLog('places', 'load', {
          ok: true,
          count: directory.places.length,
          force: force,
          maxAgeMs: maxAgeMs
        });
        return rememberDirectory(directory);
      } catch (err) {
        dbgError('places', 'load', err);
        console.error('Places.load failed', err);
        return rememberDirectory(emptyDirectory());
      } finally {
        if (loadCache.inflight === fetchPromise) {
          loadCache.inflight = null;
        }
      }
    })();

    if (!force) loadCache.inflight = fetchPromise;
    return fetchPromise;
  }

  async function save(t, directory) {
    if (!t || typeof t.set !== 'function') {
      dbgLog('places', 'save', { ok: false, reason: 'no-client' });
      throw new Error('Places.save: t.set required');
    }
    var next = normalizeDirectory(directory);
    next.updatedAt = new Date().toISOString();
    await t.set('member', 'private', STORAGE_KEY, next);
    rememberDirectory(next);
    dbgLog('places', 'save', { ok: true, count: next.places.length });
    return next;
  }

  async function reset(t) {
    var blank = emptyDirectory();
    blank.updatedAt = new Date().toISOString();
    if (t && typeof t.set === 'function') {
      await t.set('member', 'private', STORAGE_KEY, blank);
    }
    rememberDirectory(blank);
    dbgLog('places', 'reset', { ok: true });
    return blank;
  }

  global.Places = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_PLACES: MAX_PLACES,
    MAX_NAME: MAX_NAME,
    MAX_NOTES: MAX_NOTES,
    MAX_KIND: MAX_KIND,
    MAX_ALIASES: MAX_ALIASES,
    MAX_ADDRESS: MAX_ADDRESS,
    MAX_DO: MAX_DO,
    MAX_VIA: MAX_VIA,
    PLACE_SLOTS: PLACE_SLOTS.slice(),
    AGENT_REFRESH_MAX_AGE_MS: AGENT_REFRESH_MAX_AGE_MS,
    emptyDirectory: emptyDirectory,
    normalizeDirectory: normalizeDirectory,
    normalizePlace: normalizePlace,
    normalizePlaceRef: normalizePlaceRef,
    normalizePlaces: normalizePlaces,
    placesEqual: placesEqual,
    hasAnyPlace: hasAnyPlace,
    routeStops: routeStops,
    refsOf: refsOf,
    normalizeGps: normalizeGps,
    parseCoordinates: parseCoordinates,
    mapsUrl: mapsUrl,
    directionsUrl: directionsUrl,
    aliasesFromKind: aliasesFromKind,
    findByAliasOrName: findByAliasOrName,
    resolveInText: resolveInText,
    toCatalogEntry: toCatalogEntry,
    resolvePlaceSpec: resolvePlaceSpec,
    mergeIntoPlaceCatalog: mergeIntoPlaceCatalog,
    upsert: upsert,
    remove: remove,
    toAgentContext: toAgentContext,
    placesPromptLines: placesPromptLines,
    matchPhrasesForPlace: matchPhrasesForPlace,
    load: load,
    save: save,
    reset: reset,
    clearLoadCache: clearLoadCache
  };
})(typeof window !== 'undefined' ? window : this);
