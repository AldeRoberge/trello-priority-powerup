/* Trello Power-Up bridge — Objectif / Project storage and badges.
 * Board collections: board/shared. Card link: card/shared goals.projectId.
 * One-shot migrate from legacy Vision / Mission keys when needed.
 * Does not touch priority scoring. Exposes window.GoalsTrello (no bundler).
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

  var OBJECTIFS_KEY = 'goals.objectifs';
  var LEGACY_VISIONS_KEY = 'goals.visions';
  var LEGACY_MISSIONS_KEY = 'goals.missions';
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
    objectifs: null,
    projects: null,
    metrics: null,
  };
  var migratePromise = null;

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

  function normalizeObjectif(raw) {
    return normalizeGoalEntity(raw, null);
  }

  function normalizeProject(raw) {
    if (!raw || typeof raw !== 'object') return null;
    // Accept legacy missionId during migration / read of old boards.
    var patched = raw;
    if (
      !(typeof raw.objectifId === 'string' && raw.objectifId) &&
      typeof raw.missionId === 'string' &&
      raw.missionId
    ) {
      patched = Object.assign({}, raw, { objectifId: raw.missionId });
    }
    var entity = normalizeGoalEntity(patched, 'objectifId');
    if (!entity) return null;
    return entity;
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
    var primaryByGoal = Object.create(null);
    for (var j = 0; j < list.length; j++) {
      var metric = normalizeMetric(list[j], idPass);
      if (!metric || seen[metric.id]) continue;
      seen[metric.id] = true;
      if (metric.isPrimary) {
        if (primaryByGoal[metric.linkedGoalId]) {
          metric.isPrimary = false;
        } else {
          primaryByGoal[metric.linkedGoalId] = metric.id;
        }
      }
      out.push(metric);
    }
    return out;
  }

  /** Enforce at most one primary metric per linked goal; returns new array. */
  function enforcePrimaryConstraint(metrics, linkedGoalId, primaryMetricId) {
    var list = Array.isArray(metrics) ? metrics.slice() : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].linkedGoalId !== linkedGoalId) continue;
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

  /**
   * Pure migrate helper: missions → objectifs; projects missionId → objectifId.
   * Exported for sandbox verifies.
   */
  function migrateLegacyGoals(legacyVisions, legacyMissions, legacyProjects) {
    var missions = Array.isArray(legacyMissions) ? legacyMissions : [];
    var projects = Array.isArray(legacyProjects) ? legacyProjects : [];
    var objectifs = [];
    var seen = Object.create(null);

    for (var i = 0; i < missions.length; i++) {
      var mission = missions[i];
      if (!mission || typeof mission !== 'object') continue;
      var objectif = normalizeObjectif({
        id: typeof mission.id === 'string' && mission.id ? mission.id : generateId(),
        name: mission.name,
        retired: mission.retired === true,
        createdAt: mission.createdAt,
      });
      if (!objectif || seen[objectif.id]) continue;
      seen[objectif.id] = true;
      objectifs.push(objectif);
    }

    // If only visions exist (no missions), promote visions so data is not lost.
    if (!objectifs.length && Array.isArray(legacyVisions)) {
      for (var v = 0; v < legacyVisions.length; v++) {
        var vision = legacyVisions[v];
        if (!vision || typeof vision !== 'object') continue;
        var fromVision = normalizeObjectif({
          id: typeof vision.id === 'string' && vision.id ? vision.id : generateId(),
          name: vision.name,
          retired: vision.retired === true,
          createdAt: vision.createdAt,
        });
        if (!fromVision || seen[fromVision.id]) continue;
        seen[fromVision.id] = true;
        objectifs.push(fromVision);
      }
    }

    var nextProjects = [];
    for (var p = 0; p < projects.length; p++) {
      var proj = projects[p];
      if (!proj || typeof proj !== 'object') continue;
      var objectifId =
        typeof proj.objectifId === 'string' && proj.objectifId
          ? proj.objectifId
          : typeof proj.missionId === 'string'
            ? proj.missionId
            : '';
      var normalized = normalizeProject(
        Object.assign({}, proj, objectifId ? { objectifId: objectifId } : {})
      );
      if (normalized) nextProjects.push(normalized);
    }

    return { objectifs: objectifs, projects: nextProjects };
  }

  async function ensureMigrated(t) {
    if (migratePromise) return migratePromise;
    migratePromise = (async function () {
      var storedObjectifs = await t.get('board', 'shared', OBJECTIFS_KEY);
      var hasObjectifs = Array.isArray(storedObjectifs) && storedObjectifs.length > 0;
      if (hasObjectifs) return;

      var legacyVisions = await t.get('board', 'shared', LEGACY_VISIONS_KEY);
      var legacyMissions = await t.get('board', 'shared', LEGACY_MISSIONS_KEY);
      var legacyProjects = await t.get('board', 'shared', PROJECTS_KEY);
      var hasLegacy =
        (Array.isArray(legacyVisions) && legacyVisions.length > 0) ||
        (Array.isArray(legacyMissions) && legacyMissions.length > 0) ||
        (Array.isArray(legacyProjects) &&
          legacyProjects.some(function (p) {
            return p && typeof p.missionId === 'string' && p.missionId && !p.objectifId;
          }));
      if (!hasLegacy) return;

      var migrated = migrateLegacyGoals(legacyVisions, legacyMissions, legacyProjects);
      await writeBoardArray(t, OBJECTIFS_KEY, migrated.objectifs);
      await writeBoardArray(t, PROJECTS_KEY, migrated.projects);
      boardCache.objectifs = migrated.objectifs;
      boardCache.projects = migrated.projects;
      dbgLog('goalsTrello', 'migrate.legacy', {
        objectifs: migrated.objectifs.length,
        projects: migrated.projects.length,
      });
    })().catch(function (err) {
      migratePromise = null;
      dbgError('goalsTrello', 'migrate.legacy', err);
      throw err;
    });
    return migratePromise;
  }

  async function getObjectifs(t) {
    await ensureMigrated(t);
    var list = await readBoardArray(t, OBJECTIFS_KEY, function (raw) {
      return normalizeCollection(raw, normalizeObjectif);
    });
    boardCache.objectifs = list;
    dbgLog('goalsTrello', 'objectifs.load', { count: list.length });
    return list;
  }

  async function saveObjectifs(t, list) {
    var normalized = normalizeCollection(list, normalizeObjectif);
    boardCache.objectifs = normalized;
    dbgLog('goalsTrello', 'objectifs.save', { count: normalized.length });
    return writeBoardArray(t, OBJECTIFS_KEY, normalized);
  }

  async function getProjects(t) {
    await ensureMigrated(t);
    var list = await readBoardArray(t, PROJECTS_KEY, function (raw) {
      return normalizeCollection(raw, normalizeProject);
    });
    boardCache.projects = list;
    dbgLog('goalsTrello', 'projects.load', { count: list.length });
    return list;
  }

  async function saveProjects(t, list) {
    var normalized = normalizeCollection(list, normalizeProject);
    boardCache.projects = normalized;
    dbgLog('goalsTrello', 'projects.save', { count: normalized.length });
    return writeBoardArray(t, PROJECTS_KEY, normalized);
  }

  async function getMetrics(t) {
    var list = await readBoardArray(t, METRICS_KEY, normalizeMetricsCollection);
    boardCache.metrics = list;
    dbgLog('goalsTrello', 'metrics.load', { count: list.length });
    return list;
  }

  async function saveMetrics(t, list) {
    var normalized = normalizeMetricsCollection(list);
    boardCache.metrics = normalized;
    dbgLog('goalsTrello', 'metrics.save', { count: normalized.length });
    return writeBoardArray(t, METRICS_KEY, normalized);
  }

  async function preloadBoardGoalsContext(t) {
    await Promise.all([getObjectifs(t), getProjects(t), getMetrics(t)]);
    return boardCache;
  }

  function getCachedBoardGoals() {
    return {
      objectifs: boardCache.objectifs || [],
      projects: boardCache.projects || [],
      metrics: boardCache.metrics || [],
    };
  }

  async function createObjectif(t, name) {
    var list = await getObjectifs(t);
    var entity = normalizeObjectif({
      id: generateId(),
      name: name,
      retired: false,
      createdAt: nowIso(),
    });
    if (!entity) throw new Error('Nom d\u2019objectif requis');
    list.push(entity);
    await saveObjectifs(t, list);
    dbgLog('goalsTrello', 'objectif.create', { ok: true });
    return entity;
  }

  async function updateObjectif(t, id, patch) {
    var list = await getObjectifs(t);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) throw new Error('Objectif introuvable');
    var next = Object.assign({}, list[idx], patch || {}, { id: list[idx].id });
    delete next.completed;
    delete next.complete;
    var normalized = normalizeObjectif(next);
    if (!normalized) throw new Error('Objectif invalide');
    list[idx] = normalized;
    await saveObjectifs(t, list);
    dbgLog('goalsTrello', 'objectif.update', { ok: true });
    return normalized;
  }

  async function retireObjectif(t, id) {
    var result = await updateObjectif(t, id, { retired: true });
    dbgLog('goalsTrello', 'objectif.retire', { ok: true });
    return result;
  }

  async function createProject(t, name, objectifId) {
    var objectifs = await getObjectifs(t);
    var objectif = findById(objectifs, objectifId);
    if (!objectif) throw new Error('Objectif introuvable');
    if (objectif.retired) throw new Error('Objectif retir\u00e9');
    var list = await getProjects(t);
    var entity = normalizeProject({
      id: generateId(),
      name: name,
      objectifId: objectifId,
      retired: false,
      createdAt: nowIso(),
    });
    if (!entity) throw new Error('Projet invalide (nom et objectifId requis)');
    list.push(entity);
    await saveProjects(t, list);
    dbgLog('goalsTrello', 'project.create', { ok: true });
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
    dbgLog('goalsTrello', 'project.update', { ok: true });
    return normalized;
  }

  async function retireProject(t, id) {
    var result = await updateProject(t, id, { retired: true });
    dbgLog('goalsTrello', 'project.retire', { ok: true });
    return result;
  }

  async function createMetric(t, raw) {
    var objectifs = await getObjectifs(t);
    var linkedGoalId = raw && raw.linkedGoalId;
    var objectif = findById(objectifs, linkedGoalId);
    if (!objectif) throw new Error('Objectif introuvable');
    if (objectif.retired) throw new Error('Objectif retir\u00e9');
    var list = await getMetrics(t);
    var ids = Object.create(null);
    list.forEach(function (m) {
      ids[m.id] = true;
    });
    var metric = normalizeMetric(
      Object.assign({}, raw, { id: raw && raw.id ? raw.id : generateId() }),
      ids
    );
    if (!metric) throw new Error('M\u00e9trique invalide');
    list.push(metric);
    if (metric.isPrimary) {
      list = enforcePrimaryConstraint(list, metric.linkedGoalId, metric.id);
    }
    await saveMetrics(t, list);
    dbgLog('goalsTrello', 'metric.create', { ok: true });
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
    if (idx < 0) throw new Error('M\u00e9trique introuvable');
    var ids = Object.create(null);
    list.forEach(function (m) {
      ids[m.id] = true;
    });
    var next = Object.assign({}, list[idx], patch || {}, { id: list[idx].id });
    var metric = normalizeMetric(next, ids);
    if (!metric) throw new Error('M\u00e9trique invalide');
    list[idx] = metric;
    if (metric.isPrimary) {
      list = enforcePrimaryConstraint(list, metric.linkedGoalId, metric.id);
    }
    await saveMetrics(t, list);
    dbgLog('goalsTrello', 'metric.update', { ok: true });
    return findById(list, metric.id);
  }

  async function removeMetric(t, id) {
    var list = await getMetrics(t);
    var next = list.filter(function (m) {
      return m.id !== id;
    });
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
    dbgLog('goalsTrello', 'metric.remove', { ok: true });
    return true;
  }

  async function setPrimaryMetric(t, linkedGoalId, metricId) {
    var list = await getMetrics(t);
    if (metricId) {
      var found = findById(list, metricId);
      if (!found || found.linkedGoalId !== linkedGoalId) {
        throw new Error('M\u00e9trique introuvable pour cet objectif');
      }
    }
    list = enforcePrimaryConstraint(list, linkedGoalId, metricId || null);
    await saveMetrics(t, list);
    return getMetricsForObjectifFromList(list, linkedGoalId);
  }

  function getMetricsForObjectifFromList(list, linkedGoalId) {
    return (list || []).filter(function (m) {
      return m.linkedGoalId === linkedGoalId;
    });
  }

  async function getMetricsForObjectif(t, linkedGoalId) {
    var list = await getMetrics(t);
    return getMetricsForObjectifFromList(list, linkedGoalId);
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
      if (project.retired) throw new Error('Projet retir\u00e9');
    }
    await t.set('card', 'shared', CARD_PROJECT_ID_KEY, value);
    dbgLog('goalsTrello', 'cardProject.link', { action: value ? 'set' : 'clear', ok: true });
    return value;
  }

  /**
   * Resolve Objectif → Project for a projectId (includes retired).
   */
  function resolveHierarchyFromCache(cache, projectId) {
    var projects = cache.projects || [];
    var objectifs = cache.objectifs || [];
    var project = findById(projects, projectId);
    if (!project) {
      return { objectif: null, project: null };
    }
    var objectif = findById(objectifs, project.objectifId);
    return { objectif: objectif, project: project };
  }

  async function resolveHierarchy(t, projectId) {
    if (!projectId) {
      return { objectif: null, project: null };
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
              var objectifName = hierarchy.objectif ? hierarchy.objectif.name : 'Objectif';
              return withBadgeRefresh({
                title: objectifName,
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
    OBJECTIFS_KEY: OBJECTIFS_KEY,
    PROJECTS_KEY: PROJECTS_KEY,
    METRICS_KEY: METRICS_KEY,
    CARD_PROJECT_ID_KEY: CARD_PROJECT_ID_KEY,
    BADGE_REFRESH_SEC: BADGE_REFRESH_SEC,
    generateId: generateId,
    normalizeObjectif: normalizeObjectif,
    normalizeProject: normalizeProject,
    normalizeMetric: normalizeMetric,
    normalizeMetricsCollection: normalizeMetricsCollection,
    enforcePrimaryConstraint: enforcePrimaryConstraint,
    migrateLegacyGoals: migrateLegacyGoals,
    activeOnly: activeOnly,
    findById: findById,
    directionArrow: directionArrow,
    formatMetricValue: formatMetricValue,
    getObjectifs: getObjectifs,
    saveObjectifs: saveObjectifs,
    getProjects: getProjects,
    saveProjects: saveProjects,
    getMetrics: getMetrics,
    saveMetrics: saveMetrics,
    preloadBoardGoalsContext: preloadBoardGoalsContext,
    getCachedBoardGoals: getCachedBoardGoals,
    createObjectif: createObjectif,
    updateObjectif: updateObjectif,
    retireObjectif: retireObjectif,
    createProject: createProject,
    updateProject: updateProject,
    retireProject: retireProject,
    createMetric: createMetric,
    updateMetric: updateMetric,
    removeMetric: removeMetric,
    setPrimaryMetric: setPrimaryMetric,
    getMetricsForObjectif: getMetricsForObjectif,
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
