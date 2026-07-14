/* Trello Power-Up bridge — Vision / Mission / Project / Metric storage and badges.
 * Board collections: board/shared. Card link: card/shared goals.projectId.
 * Does not touch priority scoring. Exposes window.GoalsTrello (no bundler).
 */
(function (global) {
  'use strict';

  var VISIONS_KEY = 'goals.visions';
  var MISSIONS_KEY = 'goals.missions';
  var PROJECTS_KEY = 'goals.projects';
  var METRICS_KEY = 'goals.metrics';
  var CARD_PROJECT_ID_KEY = 'goals.projectId';
  var CARD_DETAIL_BADGE_TITLE = 'Objectif';
  var BADGE_REFRESH_SEC =
    global.PriorityTrello && global.PriorityTrello.BADGE_REFRESH_SEC
      ? global.PriorityTrello.BADGE_REFRESH_SEC
      : 10;
  var NAME_MAX = 120;
  var METRIC_TYPES = { incremental: true, sentimental: true };
  var METRIC_DIRECTIONS = { increase: true, decrease: true, hold: true };
  var METRIC_MEASUREMENTS = { direct: true, manual: true };

  var boardCache = {
    visions: null,
    missions: null,
    projects: null,
    metrics: null,
  };

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function trimName(value) {
    var s = typeof value === 'string' ? value.trim() : '';
    if (!s) return '';
    if (s.length <= NAME_MAX) return s;
    return s.slice(0, NAME_MAX);
  }

  function asNumber(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value !== '') {
      var parsed = Number(value);
      if (isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeGoalEntity(raw, requiredParentKey) {
    if (!raw || typeof raw !== 'object') return null;
    var name = trimName(raw.name);
    if (!name) return null;
    var id = typeof raw.id === 'string' && raw.id ? raw.id : generateId();
    var entity = {
      id: id,
      name: name,
      retired: raw.retired === true,
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowIso(),
    };
    if (requiredParentKey) {
      var parentId = typeof raw[requiredParentKey] === 'string' ? raw[requiredParentKey] : '';
      if (!parentId) return null;
      entity[requiredParentKey] = parentId;
    }
    return entity;
  }

  function normalizeVision(raw) {
    return normalizeGoalEntity(raw, null);
  }

  function normalizeMission(raw) {
    return normalizeGoalEntity(raw, 'visionId');
  }

  function normalizeProject(raw) {
    return normalizeGoalEntity(raw, 'missionId');
  }

  function normalizeMetric(raw, existingMetricIds) {
    if (!raw || typeof raw !== 'object') return null;
    var name = trimName(raw.name);
    if (!name) return null;
    var linkedGoalId = typeof raw.linkedGoalId === 'string' ? raw.linkedGoalId : '';
    if (!linkedGoalId) return null;
    var type = typeof raw.type === 'string' && METRIC_TYPES[raw.type] ? raw.type : 'incremental';
    var direction =
      typeof raw.direction === 'string' && METRIC_DIRECTIONS[raw.direction]
        ? raw.direction
        : 'increase';
    var measurement =
      typeof raw.measurement === 'string' && METRIC_MEASUREMENTS[raw.measurement]
        ? raw.measurement
        : 'manual';
    var currentValue = asNumber(raw.currentValue);
    if (!isFinite(currentValue)) currentValue = 0;

    var metric = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
      name: name,
      type: type,
      direction: direction,
      measurement: measurement,
      currentValue: currentValue,
      linkedGoalId: linkedGoalId,
      isPrimary: raw.isPrimary === true,
    };

    var target = asNumber(raw.target);
    if (isFinite(target)) metric.target = target;

    if (type === 'sentimental' && Array.isArray(raw.scaleLabels) && raw.scaleLabels.length >= 2) {
      var lo = typeof raw.scaleLabels[0] === 'string' ? raw.scaleLabels[0].trim() : '';
      var hi = typeof raw.scaleLabels[1] === 'string' ? raw.scaleLabels[1].trim() : '';
      if (lo && hi) metric.scaleLabels = [lo.slice(0, 80), hi.slice(0, 80)];
    }

    if (Array.isArray(raw.dependsOn) && raw.dependsOn.length) {
      var deps = [];
      var seen = Object.create(null);
      for (var i = 0; i < raw.dependsOn.length; i++) {
        var depId = raw.dependsOn[i];
        if (typeof depId !== 'string' || !depId || seen[depId] || depId === metric.id) continue;
        if (existingMetricIds && !existingMetricIds[depId]) continue;
        seen[depId] = true;
        deps.push(depId);
      }
      if (deps.length) metric.dependsOn = deps;
    }

    return metric;
  }

  function normalizeCollection(raw, normalizeFn) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var item = normalizeFn(list[i]);
      if (!item || seen[item.id]) continue;
      seen[item.id] = true;
      out.push(item);
    }
    return out;
  }

  function normalizeMetricsCollection(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var idPass = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && typeof list[i].id === 'string' && list[i].id) {
        idPass[list[i].id] = true;
      }
    }
    var out = [];
    var seen = Object.create(null);
    var primaryByMission = Object.create(null);
    for (var j = 0; j < list.length; j++) {
      var metric = normalizeMetric(list[j], idPass);
      if (!metric || seen[metric.id]) continue;
      seen[metric.id] = true;
      if (metric.isPrimary) {
        if (primaryByMission[metric.linkedGoalId]) {
          metric.isPrimary = false;
        } else {
          primaryByMission[metric.linkedGoalId] = metric.id;
        }
      }
      out.push(metric);
    }
    return out;
  }

  /** Enforce at most one primary metric per Mission; returns new array. */
  function enforcePrimaryConstraint(metrics, missionId, primaryMetricId) {
    var list = Array.isArray(metrics) ? metrics.slice() : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].linkedGoalId !== missionId) continue;
      list[i] = Object.assign({}, list[i], {
        isPrimary: primaryMetricId != null && list[i].id === primaryMetricId,
      });
    }
    return list;
  }

  function findById(list, id) {
    if (!id || !Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function activeOnly(list) {
    return (list || []).filter(function (item) {
      return item && !item.retired;
    });
  }

  async function readBoardArray(t, key, normalizeFn) {
    var stored = await t.get('board', 'shared', key);
    return normalizeFn(stored);
  }

  async function writeBoardArray(t, key, list) {
    await t.set('board', 'shared', key, list);
    return list;
  }

  async function getVisions(t) {
    var list = await readBoardArray(t, VISIONS_KEY, function (raw) {
      return normalizeCollection(raw, normalizeVision);
    });
    boardCache.visions = list;
    return list;
  }

  async function saveVisions(t, list) {
    var normalized = normalizeCollection(list, normalizeVision);
    boardCache.visions = normalized;
    return writeBoardArray(t, VISIONS_KEY, normalized);
  }

  async function getMissions(t) {
    var list = await readBoardArray(t, MISSIONS_KEY, function (raw) {
      return normalizeCollection(raw, normalizeMission);
    });
    boardCache.missions = list;
    return list;
  }

  async function saveMissions(t, list) {
    var normalized = normalizeCollection(list, normalizeMission);
    boardCache.missions = normalized;
    return writeBoardArray(t, MISSIONS_KEY, normalized);
  }

  async function getProjects(t) {
    var list = await readBoardArray(t, PROJECTS_KEY, function (raw) {
      return normalizeCollection(raw, normalizeProject);
    });
    boardCache.projects = list;
    return list;
  }

  async function saveProjects(t, list) {
    var normalized = normalizeCollection(list, normalizeProject);
    boardCache.projects = normalized;
    return writeBoardArray(t, PROJECTS_KEY, normalized);
  }

  async function getMetrics(t) {
    var list = await readBoardArray(t, METRICS_KEY, normalizeMetricsCollection);
    boardCache.metrics = list;
    return list;
  }

  async function saveMetrics(t, list) {
    var normalized = normalizeMetricsCollection(list);
    boardCache.metrics = normalized;
    return writeBoardArray(t, METRICS_KEY, normalized);
  }

  async function preloadBoardGoalsContext(t) {
    await Promise.all([getVisions(t), getMissions(t), getProjects(t), getMetrics(t)]);
    return boardCache;
  }

  function getCachedBoardGoals() {
    return {
      visions: boardCache.visions || [],
      missions: boardCache.missions || [],
      projects: boardCache.projects || [],
      metrics: boardCache.metrics || [],
    };
  }

  async function createVision(t, name) {
    var list = await getVisions(t);
    var entity = normalizeVision({
      id: generateId(),
      name: name,
      retired: false,
      createdAt: nowIso(),
    });
    if (!entity) throw new Error('Nom de vision requis');
    list.push(entity);
    await saveVisions(t, list);
    return entity;
  }

  async function updateVision(t, id, patch) {
    var list = await getVisions(t);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('Vision introuvable');
    var next = Object.assign({}, list[idx], patch || {}, { id: list[idx].id });
    delete next.completed;
    delete next.complete;
    var normalized = normalizeVision(next);
    if (!normalized) throw new Error('Vision invalide');
    list[idx] = normalized;
    await saveVisions(t, list);
    return normalized;
  }

  async function retireVision(t, id) {
    return updateVision(t, id, { retired: true });
  }

  async function createMission(t, name, visionId) {
    var list = await getMissions(t);
    var entity = normalizeMission({
      id: generateId(),
      name: name,
      visionId: visionId,
      retired: false,
      createdAt: nowIso(),
    });
    if (!entity) throw new Error('Mission invalide (nom et visionId requis)');
    list.push(entity);
    await saveMissions(t, list);
    return entity;
  }

  async function updateMission(t, id, patch) {
    var list = await getMissions(t);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('Mission introuvable');
    var next = Object.assign({}, list[idx], patch || {}, { id: list[idx].id });
    delete next.completed;
    delete next.complete;
    var normalized = normalizeMission(next);
    if (!normalized) throw new Error('Mission invalide');
    list[idx] = normalized;
    await saveMissions(t, list);
    return normalized;
  }

  async function retireMission(t, id) {
    return updateMission(t, id, { retired: true });
  }

  async function createProject(t, name, missionId) {
    var list = await getProjects(t);
    var entity = normalizeProject({
      id: generateId(),
      name: name,
      missionId: missionId,
      retired: false,
      createdAt: nowIso(),
    });
    if (!entity) throw new Error('Projet invalide (nom et missionId requis)');
    list.push(entity);
    await saveProjects(t, list);
    return entity;
  }

  async function updateProject(t, id, patch) {
    var list = await getProjects(t);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('Projet introuvable');
    var next = Object.assign({}, list[idx], patch || {}, { id: list[idx].id });
    var normalized = normalizeProject(next);
    if (!normalized) throw new Error('Projet invalide');
    list[idx] = normalized;
    await saveProjects(t, list);
    return normalized;
  }

  async function retireProject(t, id) {
    return updateProject(t, id, { retired: true });
  }

  async function createMetric(t, raw) {
    var list = await getMetrics(t);
    var ids = Object.create(null);
    list.forEach(function (m) {
      ids[m.id] = true;
    });
    var metric = normalizeMetric(
      Object.assign({}, raw, { id: raw && raw.id ? raw.id : generateId() }),
      ids
    );
    if (!metric) throw new Error('Métrique invalide');
    list.push(metric);
    if (metric.isPrimary) {
      list = enforcePrimaryConstraint(list, metric.linkedGoalId, metric.id);
    }
    await saveMetrics(t, list);
    return findById(list, metric.id);
  }

  async function updateMetric(t, id, patch) {
    var list = await getMetrics(t);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('Métrique introuvable');
    var ids = Object.create(null);
    list.forEach(function (m) {
      ids[m.id] = true;
    });
    var next = Object.assign({}, list[idx], patch || {}, { id: list[idx].id });
    var metric = normalizeMetric(next, ids);
    if (!metric) throw new Error('Métrique invalide');
    list[idx] = metric;
    if (metric.isPrimary) {
      list = enforcePrimaryConstraint(list, metric.linkedGoalId, metric.id);
    } else if (patch && patch.isPrimary === false) {
      // leave others as-is
    }
    await saveMetrics(t, list);
    return findById(list, metric.id);
  }

  async function removeMetric(t, id) {
    var list = await getMetrics(t);
    var next = list.filter(function (m) {
      return m.id !== id;
    });
    // Drop dependsOn references to removed metric
    next = next.map(function (m) {
      if (!m.dependsOn || !m.dependsOn.length) return m;
      var deps = m.dependsOn.filter(function (dep) {
        return dep !== id;
      });
      var copy = Object.assign({}, m);
      if (deps.length) copy.dependsOn = deps;
      else delete copy.dependsOn;
      return copy;
    });
    await saveMetrics(t, next);
    return true;
  }

  async function setPrimaryMetric(t, missionId, metricId) {
    var list = await getMetrics(t);
    if (metricId) {
      var found = findById(list, metricId);
      if (!found || found.linkedGoalId !== missionId) {
        throw new Error('Métrique introuvable pour cette mission');
      }
    }
    list = enforcePrimaryConstraint(list, missionId, metricId || null);
    await saveMetrics(t, list);
    return getMetricsForMissionFromList(list, missionId);
  }

  function getMetricsForMissionFromList(list, missionId) {
    return (list || []).filter(function (m) {
      return m.linkedGoalId === missionId;
    });
  }

  async function getMetricsForMission(t, missionId) {
    var list = await getMetrics(t);
    return getMetricsForMissionFromList(list, missionId);
  }

  async function getCardProjectId(t) {
    try {
      var stored = await t.get('card', 'shared', CARD_PROJECT_ID_KEY);
      if (typeof stored === 'string' && stored) return stored;
      return null;
    } catch (err) {
      return null;
    }
  }

  async function setCardProjectId(t, projectId) {
    var value = typeof projectId === 'string' && projectId ? projectId : null;
    if (value) {
      var projects = await getProjects(t);
      var project = findById(projects, value);
      if (!project) throw new Error('Projet introuvable');
      if (project.retired) throw new Error('Projet retiré');
    }
    await t.set('card', 'shared', CARD_PROJECT_ID_KEY, value);
    return value;
  }

  /**
   * Resolve Vision → Mission → Project for a projectId (includes retired).
   */
  function resolveHierarchyFromCache(cache, projectId) {
    var projects = cache.projects || [];
    var missions = cache.missions || [];
    var visions = cache.visions || [];
    var project = findById(projects, projectId);
    if (!project) {
      return { vision: null, mission: null, project: null };
    }
    var mission = findById(missions, project.missionId);
    var vision = mission ? findById(visions, mission.visionId) : null;
    return { vision: vision, mission: mission, project: project };
  }

  async function resolveHierarchy(t, projectId) {
    if (!projectId) {
      return { vision: null, mission: null, project: null };
    }
    await preloadBoardGoalsContext(t);
    return resolveHierarchyFromCache(getCachedBoardGoals(), projectId);
  }

  function directionArrow(direction) {
    if (direction === 'decrease') return '\u2193';
    if (direction === 'hold') return '\u2194';
    return '\u2191';
  }

  function formatMetricValue(metric) {
    if (!metric) return '';
    var cur = metric.currentValue;
    if (metric.target != null && isFinite(metric.target)) {
      return cur + ' / ' + metric.target + ' ' + directionArrow(metric.direction);
    }
    return String(cur) + ' ' + directionArrow(metric.direction);
  }

  function buildCardFaceBadge(hierarchy) {
    if (!hierarchy || !hierarchy.project) return null;
    return {
      text: hierarchy.project.name,
      color: hierarchy.project.retired ? 'light-gray' : 'purple',
    };
  }

  function withBadgeRefresh(badge) {
    if (!badge) return { refresh: BADGE_REFRESH_SEC };
    return Object.assign({ refresh: BADGE_REFRESH_SEC }, badge);
  }

  async function getBadgeHierarchy(t) {
    var projectId = await getCardProjectId(t);
    if (!projectId) return null;
    var hierarchy = await resolveHierarchy(t, projectId);
    if (!hierarchy.project) return null;
    return hierarchy;
  }

  function dynamicCardFaceBadge(t) {
    return {
      dynamic: function () {
        return getBadgeHierarchy(t).then(function (hierarchy) {
          if (!hierarchy || !hierarchy.project) {
            return { refresh: BADGE_REFRESH_SEC };
          }
          return withBadgeRefresh(buildCardFaceBadge(hierarchy));
        });
      },
    };
  }

  function cardFaceBadges(t) {
    return getCardProjectId(t)
      .then(function (projectId) {
        if (!projectId) return [];
        return [dynamicCardFaceBadge(t)];
      })
      .catch(function (err) {
        console.error('Goals card-badges failed', err);
        return [];
      });
  }

  function cardDetailBadges(t, openCallback) {
    return [
      {
        dynamic: function () {
          return getBadgeHierarchy(t)
            .then(function (hierarchy) {
              if (!hierarchy || !hierarchy.project) {
                return withBadgeRefresh({
                  title: CARD_DETAIL_BADGE_TITLE,
                  text: 'Lier un projet',
                  color: 'purple',
                  callback: openCallback,
                });
              }
              var missionName = hierarchy.mission ? hierarchy.mission.name : '—';
              return withBadgeRefresh({
                title: missionName,
                text: hierarchy.project.name,
                color: hierarchy.project.retired ? 'light-gray' : 'purple',
                callback: openCallback,
              });
            })
            .catch(function (err) {
              console.error('Goals card-detail-badges failed', err);
              return withBadgeRefresh({
                title: CARD_DETAIL_BADGE_TITLE,
                text: 'Objectif',
                color: 'purple',
                callback: openCallback,
              });
            });
        },
      },
    ];
  }

  /** Match project by id or fuzzy name (active preferred). */
  function findProjectByMatch(projects, args) {
    var list = projects || [];
    if (args && typeof args.projectId === 'string' && args.projectId) {
      return findById(list, args.projectId);
    }
    var match =
      args && typeof args.matchText === 'string'
        ? args.matchText.trim().toLowerCase()
        : args && typeof args.name === 'string'
          ? args.name.trim().toLowerCase()
          : '';
    if (!match) return null;
    var active = activeOnly(list);
    var pool = active.length ? active : list;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].name.toLowerCase() === match) return pool[i];
    }
    for (var j = 0; j < pool.length; j++) {
      if (pool[j].name.toLowerCase().indexOf(match) !== -1) return pool[j];
    }
    return null;
  }

  global.GoalsTrello = {
    VISIONS_KEY: VISIONS_KEY,
    MISSIONS_KEY: MISSIONS_KEY,
    PROJECTS_KEY: PROJECTS_KEY,
    METRICS_KEY: METRICS_KEY,
    CARD_PROJECT_ID_KEY: CARD_PROJECT_ID_KEY,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
    generateId: generateId,
    normalizeVision: normalizeVision,
    normalizeMission: normalizeMission,
    normalizeProject: normalizeProject,
    normalizeMetric: normalizeMetric,
    normalizeMetricsCollection: normalizeMetricsCollection,
    enforcePrimaryConstraint: enforcePrimaryConstraint,
    activeOnly: activeOnly,
    findById: findById,
    directionArrow: directionArrow,
    formatMetricValue: formatMetricValue,
    getVisions: getVisions,
    saveVisions: saveVisions,
    getMissions: getMissions,
    saveMissions: saveMissions,
    getProjects: getProjects,
    saveProjects: saveProjects,
    getMetrics: getMetrics,
    saveMetrics: saveMetrics,
    preloadBoardGoalsContext: preloadBoardGoalsContext,
    getCachedBoardGoals: getCachedBoardGoals,
    createVision: createVision,
    updateVision: updateVision,
    retireVision: retireVision,
    createMission: createMission,
    updateMission: updateMission,
    retireMission: retireMission,
    createProject: createProject,
    updateProject: updateProject,
    retireProject: retireProject,
    createMetric: createMetric,
    updateMetric: updateMetric,
    removeMetric: removeMetric,
    setPrimaryMetric: setPrimaryMetric,
    getMetricsForMission: getMetricsForMission,
    getCardProjectId: getCardProjectId,
    setCardProjectId: setCardProjectId,
    resolveHierarchy: resolveHierarchy,
    resolveHierarchyFromCache: resolveHierarchyFromCache,
    findProjectByMatch: findProjectByMatch,
    buildCardFaceBadge: buildCardFaceBadge,
    cardFaceBadges: cardFaceBadges,
    cardDetailBadges: cardDetailBadges,
  };
})(typeof window !== 'undefined' ? window : globalThis);
