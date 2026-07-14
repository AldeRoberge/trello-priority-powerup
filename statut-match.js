/* Statut matching — normalize list names and map to Linear-inspired categories. */
(function (global) {
  'use strict';

  var CATEGORIES = [
    {
      key: 'triage',
      label: 'Triage',
      aliases: [
        'triage',
        'a trier',
        'inbox',
        'incoming',
        'nouveautes',
        'new',
      ],
    },
    {
      key: 'backlog',
      label: 'Backlog',
      aliases: [
        'backlog',
        'icebox',
        'en attente',
        'parking lot',
        'parkinglot',
        'someday',
        'later',
        'ideas',
        'idees',
      ],
    },
    {
      key: 'unstarted',
      label: 'Non démarré',
      aliases: [
        'unstarted',
        'a faire',
        'todo',
        'to do',
        'to-do',
        'ready',
        'ready to start',
        'next',
        'up next',
        'ouvert',
        'open',
        'pending',
      ],
    },
    {
      key: 'started',
      label: 'En cours',
      aliases: [
        'started',
        'en cours',
        'in progress',
        'in-progress',
        'doing',
        'wip',
        'working',
        'in review',
        'review',
        'code review',
        'ready to merge',
        'ready for review',
        'qa',
        'testing',
      ],
    },
    {
      key: 'blocked',
      label: 'Bloqué',
      aliases: [
        'blocked',
        'bloque',
        'on hold',
        'on-hold',
        'en pause',
        'paused',
        'waiting',
        'stuck',
        'bloquees',
      ],
    },
    {
      key: 'completed',
      label: 'Terminé',
      aliases: [
        'completed',
        'complete',
        'termine',
        'terminee',
        'terminees',
        'done',
        'fini',
        'finie',
        'finished',
        'closed',
        'completees',
        'completes',
        'done done',
      ],
    },
    {
      key: 'canceled',
      label: 'Annulé',
      aliases: [
        'canceled',
        'cancelled',
        'annule',
        'annulee',
        'wont do',
        "won't do",
        'wontfix',
        'abandoned',
        'dropped',
        'rejected',
      ],
    },
  ];

  var CATEGORY_KEYS = CATEGORIES.map(function (c) {
    return c.key;
  });

  var CATEGORY_BY_KEY = {};
  CATEGORIES.forEach(function (c) {
    CATEGORY_BY_KEY[c.key] = c;
  });

  /** Prefer ≥0.7 similarity, or absolute distance ≤2 for short names. */
  var MIN_SIMILARITY = 0.7;
  var MAX_DISTANCE = 2;

  function stripAccents(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeName(name) {
    return stripAccents(name)
      .toLowerCase()
      .replace(/[_/\\|]+/g, ' ')
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    a = String(a || '');
    b = String(b || '');
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    var prev = new Array(b.length + 1);
    var curr = new Array(b.length + 1);
    var i;
    var j;
    for (j = 0; j <= b.length; j++) prev[j] = j;

    for (i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[b.length];
  }

  function similarity(a, b) {
    var na = normalizeName(a);
    var nb = normalizeName(b);
    if (!na && !nb) return 1;
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    var dist = levenshtein(na, nb);
    var maxLen = Math.max(na.length, nb.length);
    return maxLen ? 1 - dist / maxLen : 0;
  }

  function isAcceptableMatch(nameNorm, aliasNorm, dist, sim) {
    if (!nameNorm || !aliasNorm) return false;
    if (nameNorm === aliasNorm) return true;
    if (sim >= MIN_SIMILARITY) return true;
    if (dist <= MAX_DISTANCE && Math.min(nameNorm.length, aliasNorm.length) >= 3) {
      return true;
    }
    return false;
  }

  /**
   * Best category for a list name, or null if below threshold.
   * Returns { key, label, score, distance, alias } or null.
   */
  function matchListToCategory(name) {
    var nameNorm = normalizeName(name);
    if (!nameNorm) return null;

    var best = null;

    for (var ci = 0; ci < CATEGORIES.length; ci++) {
      var cat = CATEGORIES[ci];
      for (var ai = 0; ai < cat.aliases.length; ai++) {
        var alias = cat.aliases[ai];
        var aliasNorm = normalizeName(alias);
        var dist = levenshtein(nameNorm, aliasNorm);
        var sim = aliasNorm
          ? 1 - dist / Math.max(nameNorm.length, aliasNorm.length)
          : 0;
        if (!isAcceptableMatch(nameNorm, aliasNorm, dist, sim)) continue;
        if (
          !best ||
          sim > best.score ||
          (sim === best.score && dist < best.distance)
        ) {
          best = {
            key: cat.key,
            label: cat.label,
            score: sim,
            distance: dist,
            alias: alias,
          };
        }
      }
    }

    return best;
  }

  function isCategoryKey(key) {
    return !!(key && CATEGORY_BY_KEY[key]);
  }

  function categoryLabel(key) {
    var cat = CATEGORY_BY_KEY[key];
    return cat ? cat.label : '';
  }

  /**
   * Build listCategories + roleLists from board lists.
   * lists: [{ id, name }, ...]
   */
  function detectFromLists(lists) {
    var listCategories = {};
    var bestByRole = {};

    (lists || []).forEach(function (list) {
      if (!list || !list.id) return;
      var id = String(list.id);
      var match = matchListToCategory(list.name);
      if (match) {
        listCategories[id] = match.key;
        var prev = bestByRole[match.key];
        if (!prev || match.score > prev.score) {
          bestByRole[match.key] = { listId: id, score: match.score };
        }
      } else {
        listCategories[id] = null;
      }
    });

    return {
      listCategories: listCategories,
      roleLists: {
        blocked: bestByRole.blocked ? bestByRole.blocked.listId : null,
        completed: bestByRole.completed ? bestByRole.completed.listId : null,
      },
    };
  }

  global.StatutMatch = {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    MIN_SIMILARITY: MIN_SIMILARITY,
    MAX_DISTANCE: MAX_DISTANCE,
    normalizeName: normalizeName,
    levenshtein: levenshtein,
    similarity: similarity,
    matchListToCategory: matchListToCategory,
    isCategoryKey: isCategoryKey,
    categoryLabel: categoryLabel,
    detectFromLists: detectFromLists,
  };
})(typeof window !== 'undefined' ? window : this);
