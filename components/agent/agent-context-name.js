/**
 * agent-context: part 2 of 3 (buildContext).
 * Names are shared with the other parts through window.PriorityAgentParts (see agent-context.parts.json for the load order).
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var ASSISTANT_SCOPES = S.ASSISTANT_SCOPES;

  // from other parts (functions, resolved at call time)
  function currentAppBuildInfo() { return S.currentAppBuildInfo.apply(this, arguments); }
  function axisWord() { return S.axisWord.apply(this, arguments); }
  function buildEaseExplanation() { return S.buildEaseExplanation.apply(this, arguments); }
  function buildPriorityExplanation() { return S.buildPriorityExplanation.apply(this, arguments); }
  function clampInt() { return S.clampInt.apply(this, arguments); }
  function isProjectScope() { return S.isProjectScope.apply(this, arguments); }
  function localClock() { return S.localClock.apply(this, arguments); }
  function localStamp() { return S.localStamp.apply(this, arguments); }
  function normalizeAgentTaskTypes() { return S.normalizeAgentTaskTypes.apply(this, arguments); }
  function normalizeAssistantScope() { return S.normalizeAssistantScope.apply(this, arguments); }

  function buildContext(bridge) {
    var appInfo = currentAppBuildInfo() || {};
    var clock = localClock();
    var ctx = {
      today: clock.today,
      nowTime: clock.nowTime,
      timeZone: clock.timeZone,
      utcOffset: clock.utcOffset,
      appBuiltAt: appInfo.builtAt || null,
      appBuiltLocal: appInfo.builtAt ? localStamp(appInfo.builtAt) : null,
      appReleases: appInfo.releases || [],
      /** 'task' = card popup; 'project' = board-wide assistant window. */
      scope: ASSISTANT_SCOPES.TASK,
      cardName: '',
      cardDesc: '',
      formula: 'baseline',
      priority: null,
      display: null,
      due: null,
      blocked: null,
      progress: null,
      taskTypes: [],
      taskTypesLocked: false,
      memory: null,
      profile: null,
      boardDigest: '',
      statut: null,
      ownership: null
    };
    if (!bridge) return ctx;
    if (typeof bridge.getScope === 'function') {
      try {
        ctx.scope = normalizeAssistantScope(bridge.getScope());
      } catch (e) { /* ignore */ }
    } else if (bridge.scope != null) {
      ctx.scope = normalizeAssistantScope(bridge.scope);
    }
    if (typeof bridge.getCardName === 'function') {
      try {
        ctx.cardName = bridge.getCardName() || '';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getCardDesc === 'function') {
      try {
        ctx.cardDesc = bridge.getCardDesc() || '';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getFormulaKey === 'function') {
      try {
        ctx.formula = bridge.getFormulaKey() || 'baseline';
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getProfile === 'function') {
      try {
        var prof = bridge.getProfile();
        if (prof && typeof prof === 'object') {
          if (global.UserProfile && typeof global.UserProfile.toAgentContext === 'function') {
            ctx.profile = global.UserProfile.toAgentContext(prof);
          } else {
            ctx.profile = {
              displayName: typeof prof.displayName === 'string' ? prof.displayName : null,
              role: typeof prof.role === 'string' ? prof.role : null,
              notes: typeof prof.notes === 'string' ? prof.notes : null,
              tone: prof.tone || 'concise',
              language: prof.language || 'fr',
              dialect: prof.dialect || 'qc'
            };
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getPeople === 'function') {
      try {
        var peopleRaw = bridge.getPeople();
        if (global.People && typeof global.People.toAgentContext === 'function') {
          ctx.people = global.People.toAgentContext(peopleRaw);
        } else if (Array.isArray(peopleRaw)) {
          ctx.people = peopleRaw;
        } else if (peopleRaw && Array.isArray(peopleRaw.people)) {
          ctx.people = peopleRaw.people;
        } else {
          ctx.people = [];
        }
      } catch (e) {
        ctx.people = [];
      }
    }
    if (typeof bridge.getPlaces === 'function') {
      try {
        var placesRaw = bridge.getPlaces();
        if (global.Places && typeof global.Places.toAgentContext === 'function') {
          ctx.placeDirectory = global.Places.toAgentContext(placesRaw);
        } else if (Array.isArray(placesRaw)) {
          ctx.placeDirectory = placesRaw;
        } else if (placesRaw && Array.isArray(placesRaw.places)) {
          ctx.placeDirectory = placesRaw.places;
        } else {
          ctx.placeDirectory = [];
        }
      } catch (e) {
        ctx.placeDirectory = [];
      }
    }
    if (typeof bridge.getEntities === 'function') {
      try {
        var entitiesRaw = bridge.getEntities();
        if (entitiesRaw && entitiesRaw.schema && Array.isArray(entitiesRaw.entities) && entitiesRaw.entities.length) {
          ctx.entityStore = { schema: entitiesRaw.schema, entities: entitiesRaw.entities };
        }
      } catch (eEnt) { /* optional */ }
    }
    if (typeof bridge.getCustomAssigneeCatalog === 'function') {
      try {
        var horsCatalog = bridge.getCustomAssigneeCatalog();
        if (Array.isArray(horsCatalog) && horsCatalog.length) {
          ctx.customAssigneeCatalog = horsCatalog
            .map(function (p) {
              if (!p || typeof p !== 'object') return null;
              return {
                id: p.id || '',
                name: p.name || '',
                trelloMemberId: p.trelloMemberId || undefined
              };
            })
            .filter(function (p) {
              return p && p.name;
            })
            .slice(0, 40);
        }
      } catch (eCatCtx) { /* ignore */ }
    }
    if (typeof bridge.getPlaceCatalog === 'function') {
      try {
        var placeCat = bridge.getPlaceCatalog();
        if (Array.isArray(placeCat) && placeCat.length) {
          ctx.placeCatalog = placeCat
            .map(function (p) {
              if (!p || typeof p !== 'object') return null;
              return { id: p.id || '', name: p.name || '' };
            })
            .filter(function (p) {
              return p && p.name;
            })
            .slice(0, 40);
        }
      } catch (ePlaceCat) { /* ignore */ }
    }
    if (typeof bridge.getMemory === 'function') {
      try {
        var mem = bridge.getMemory();
        if (mem && typeof mem === 'object') {
          var Mem = global.AgentMemory;
          var view =
            Mem && typeof Mem.legacyView === 'function' ? Mem.legacyView(mem) : mem;
          ctx.memory = {
            summary: typeof view.summary === 'string' ? view.summary : '',
            facts: Array.isArray(view.facts)
              ? view.facts
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 8)
              : [],
            boardSummary:
              typeof view.boardSummary === 'string' ? view.boardSummary : '',
            shortNotes: Array.isArray(view.shortNotes)
              ? view.shortNotes
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 6)
              : [],
            recentCards: Array.isArray(view.recentCards)
              ? view.recentCards
                  .map(function (c) {
                    if (!c || typeof c !== 'object') return null;
                    return {
                      id: c.id || '',
                      name: c.name || '',
                      list: c.list || '',
                      at: c.at || ''
                    };
                  })
                  .filter(Boolean)
                  .slice(0, 10)
              : [],
            onboardingComplete: !!view.onboardingComplete
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getCardMemory === 'function') {
      try {
        var cardMem = bridge.getCardMemory();
        if (cardMem && typeof cardMem === 'object') {
          var MemCard = global.AgentMemory;
          var cardNorm =
            MemCard && typeof MemCard.normalizeCardMemory === 'function'
              ? MemCard.normalizeCardMemory(cardMem)
              : cardMem;
          ctx.cardMemory = {
            facts: Array.isArray(cardNorm.facts)
              ? cardNorm.facts
                  .map(function (f) {
                    return typeof f === 'string' ? f : f && f.text ? f.text : '';
                  })
                  .filter(Boolean)
                  .slice(0, 8)
              : []
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getBoardDigest === 'function') {
      try {
        var digestCap = isProjectScope(ctx.scope) ? 8000 : 4000;
        ctx.boardDigest = String(bridge.getBoardDigest() || '').slice(0, digestCap);
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getStatut === 'function') {
      try {
        var statutRaw = bridge.getStatut();
        if (statutRaw && typeof statutRaw === 'object') {
          ctx.statut = {
            listId: statutRaw.listId || null,
            listName: statutRaw.listName || '',
            category: statutRaw.category || null,
            lists: Array.isArray(statutRaw.lists)
              ? statutRaw.lists
                  .map(function (list) {
                    if (!list || list.id == null) return null;
                    return {
                      id: String(list.id),
                      name: list.name || '',
                      category: list.category || null
                    };
                  })
                  .filter(Boolean)
                  .slice(0, 40)
              : [],
            roleLists:
              statutRaw.roleLists && typeof statutRaw.roleLists === 'object'
                ? statutRaw.roleLists
                : {}
          };
        }
      } catch (e) { /* ignore */ }
    }
    if (typeof bridge.getOwnership === 'function') {
      try {
        var ownRaw = bridge.getOwnership();
        if (ownRaw && typeof ownRaw === 'object') {
          var youRaw = ownRaw.you && typeof ownRaw.you === 'object' ? ownRaw.you : null;
          var youId =
            youRaw && youRaw.id != null ? String(youRaw.id) : '';
          var membersList = Array.isArray(ownRaw.members)
            ? ownRaw.members
                .map(function (m) {
                  if (!m || m.id == null) return null;
                  var id = String(m.id);
                  var fullName =
                    typeof m.fullName === 'string' && m.fullName.trim()
                      ? m.fullName.trim()
                      : typeof m.username === 'string' && m.username.trim()
                        ? m.username.trim()
                        : '';
                  return {
                    id: id,
                    fullName: fullName,
                    username:
                      typeof m.username === 'string' ? m.username : ''
                  };
                })
                .filter(Boolean)
                .slice(0, 12)
            : [];
          var assigneeCount = membersList.length;
          var youAssigned =
            !!youId &&
            membersList.some(function (m) {
              return m.id === youId;
            });
          if (ownRaw.youAssigned === true || ownRaw.youAssigned === false) {
            youAssigned = !!ownRaw.youAssigned;
          }
          ctx.ownership = {
            members: membersList,
            you: youId
              ? {
                  id: youId,
                  fullName:
                    (youRaw &&
                      typeof youRaw.fullName === 'string' &&
                      youRaw.fullName.trim()) ||
                    '',
                  username:
                    (youRaw && typeof youRaw.username === 'string'
                      ? youRaw.username
                      : '') || ''
                }
              : null,
            youAssigned: youAssigned,
            assigneeCount: assigneeCount,
            unassigned: assigneeCount === 0
          };
        }
      } catch (eOwn) { /* ignore */ }
    }
    if (typeof bridge.getCardLabels === 'function') {
      try {
        var labelsRaw = bridge.getCardLabels();
        if (Array.isArray(labelsRaw)) {
          ctx.labels = labelsRaw
            .map(function (l) {
              if (!l || l.id == null) return null;
              return {
                id: String(l.id),
                name: typeof l.name === 'string' ? l.name : '',
                color: typeof l.color === 'string' ? l.color : ''
              };
            })
            .filter(Boolean)
            .slice(0, 30);
        }
      } catch (eLab) { /* ignore */ }
    }
    if (typeof bridge.getBoardMembers === 'function') {
      try {
        var boardMemRaw = bridge.getBoardMembers();
        // Sync cache only — async Promises are resolved at tool time.
        if (Array.isArray(boardMemRaw)) {
          ctx.boardMembers = boardMemRaw
            .map(function (m) {
              if (!m || m.id == null) return null;
              return {
                id: String(m.id),
                fullName:
                  typeof m.fullName === 'string' && m.fullName.trim()
                    ? m.fullName.trim()
                    : typeof m.username === 'string'
                      ? m.username.trim()
                      : '',
                username: typeof m.username === 'string' ? m.username : ''
              };
            })
            .filter(Boolean)
            .slice(0, 40);
        }
      } catch (eBm) { /* ignore */ }
    }
    if (typeof bridge.getBoardLabels === 'function') {
      try {
        var boardLabRaw = bridge.getBoardLabels();
        if (Array.isArray(boardLabRaw)) {
          ctx.boardLabels = boardLabRaw
            .map(function (l) {
              if (!l || l.id == null) return null;
              return {
                id: String(l.id),
                name: typeof l.name === 'string' ? l.name : '',
                color: typeof l.color === 'string' ? l.color : ''
              };
            })
            .filter(Boolean)
            .slice(0, 60);
        }
      } catch (eBl) { /* ignore */ }
    }
    if (typeof bridge.getPriorityState === 'function') {
      try {
        var priForPeople = bridge.getPriorityState() || {};
        if (Array.isArray(priForPeople.customAssignees)) {
          ctx.customAssignees = priForPeople.customAssignees
            .map(function (p) {
              if (!p || p.id == null) return null;
              return {
                id: String(p.id),
                name: typeof p.name === 'string' ? p.name : ''
              };
            })
            .filter(Boolean)
            .slice(0, 20);
        }
        if (priForPeople.memberRoles && typeof priForPeople.memberRoles === 'object') {
          ctx.memberRoles = priForPeople.memberRoles;
        }
        if (priForPeople.places && typeof priForPeople.places === 'object') {
          var placesNorm =
            global.Places && typeof global.Places.normalizePlaces === 'function'
              ? global.Places.normalizePlaces(priForPeople.places)
              : priForPeople.places;
          if (placesNorm && (placesNorm.from || placesNorm.to || placesNorm.at)) {
            ctx.places = placesNorm;
          }
        }
      } catch (ePe) { /* ignore */ }
    }
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.getMemberRoleCatalog === 'function'
    ) {
      try {
        ctx.memberRoleCatalog = (PriorityUI.getMemberRoleCatalog() || [])
          .map(function (r) {
            return r && r.id
              ? { id: r.id, label: r.label || r.id }
              : null;
          })
          .filter(Boolean)
          .slice(0, 40);
      } catch (eRc) { /* ignore */ }
    }
    if (typeof bridge.getHistory === 'function') {
      try {
        var histRaw = bridge.getHistory();
        if (histRaw && typeof histRaw === 'object') {
          ctx.history = {
            canUndo: !!histRaw.canUndo,
            canRedo: !!histRaw.canRedo,
            entries: Array.isArray(histRaw.entries)
              ? histRaw.entries.slice(0, 12).map(function (e) {
                  return {
                    id: e.id,
                    label: e.label || '',
                    undone: !!e.undone,
                    at: e.at || null
                  };
                })
              : []
          };
        }
      } catch (eHi) { /* ignore */ }
    }
    if (typeof bridge.getGoals === 'function') {
      try {
        var goalsRaw = bridge.getGoals();
        if (goalsRaw && typeof goalsRaw === 'object') {
          var h = goalsRaw.hierarchy || {};
          var projectsList = Array.isArray(goalsRaw.projects) ? goalsRaw.projects : [];
          var activeProjects = projectsList.filter(function (p) {
            return p && !p.retired;
          });
          ctx.goals = {
            projectId: goalsRaw.projectId || null,
            objectif: h.objectif
              ? { id: h.objectif.id, name: h.objectif.name, retired: !!h.objectif.retired }
              : null,
            project: h.project
              ? { id: h.project.id, name: h.project.name, retired: !!h.project.retired }
              : null,
            projects: activeProjects
              .map(function (p) {
                return { id: p.id, name: p.name, objectifId: p.objectifId };
              })
              .slice(0, 40),
            metrics: Array.isArray(goalsRaw.metrics)
              ? goalsRaw.metrics
                  .filter(function (m) {
                    return h.objectif && m.linkedGoalId === h.objectif.id;
                  })
                  .map(function (m) {
                    return {
                      id: m.id,
                      name: m.name,
                      currentValue: m.currentValue,
                      target: m.target,
                      direction: m.direction,
                      isPrimary: !!m.isPrimary,
                    };
                  })
                  .slice(0, 20)
              : [],
          };
        }
      } catch (e) { /* ignore */ }
    }
    var state = null;
    if (typeof bridge.getPriorityState === 'function') {
      try {
        state = bridge.getPriorityState();
      } catch (e) {
        state = null;
      }
    }
    if (state && typeof state === 'object') {
      var priorityEnabled = state.priorityEnabled !== false;
      var dueEnabled = state.dueEnabled !== false;
      var blockedEnabled = !!state.enAttente;
      var blockedReasons = Array.isArray(state.blockedReasons)
        ? state.blockedReasons.filter(function (r) {
            return typeof r === 'string' && r.trim();
          })
        : [];
      var urgencyLvl = clampInt(state.urgency, 0, 4, 0);
      var impactLvl = clampInt(state.impact, 0, 4, 0);
      var easeLvl = clampInt(state.ease, 1, 5, 3);
      var taskTypes = normalizeAgentTaskTypes(state.taskTypes);
      ctx.taskTypes = taskTypes;
      ctx.taskTypesLocked = state.taskTypesLocked === true;
      ctx.priority = {
        enabled: priorityEnabled,
        // Values below are inactive when enabled=false — do not treat as the live priority.
        urgency: state.urgency,
        impact: state.impact,
        ease: state.ease,
        taskTypes: taskTypes,
        taskTypesLocked: state.taskTypesLocked === true,
        // Qualitative labels (0–4 / 1–5 scales) — use these, never invent 0–10 axis scores.
        labels: priorityEnabled
          ? {
              urgency: axisWord('urgency', urgencyLvl),
              impact: axisWord('impact', impactLvl),
              ease: axisWord('ease', easeLvl)
            }
          : null,
        // Impact reach = labels.impact (Personnel → Global).
        impactReach: priorityEnabled ? axisWord('impact', impactLvl) || null : null,
        // Legacy Facilité field — prefer context.progress.estimatedTotalMinutes.
        estimatedDurationMinutes: null,
        estimatedDurationLabel: (function () {
          return null;
        })(),
        // Ready-made answer for "is it hard?" / Facilité questions.
        easeExplanation: buildEaseExplanation(state),
        explanation: null
      };
      ctx.due = {
        enabled: dueEnabled,
        // dueDate/dueTime are inactive when enabled=false.
        dueDate: dueEnabled ? state.dueDate || null : null,
        dueTime: dueEnabled ? state.dueTime || null : null,
        dueMode:
          dueEnabled &&
          (state.dueMode === 'vague' ||
            (typeof PriorityUI !== 'undefined' &&
              PriorityUI.normalizeDueVague &&
              PriorityUI.normalizeDueVague(state.dueVague)))
            ? 'vague'
            : dueEnabled
              ? 'precise'
              : null,
        dueVague: (function () {
          if (!dueEnabled) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.normalizeDueVague === 'function'
          ) {
            return PriorityUI.normalizeDueVague(state.dueVague) || null;
          }
          return state.dueVague || null;
        })(),
        dueLabel: (function () {
          if (!dueEnabled) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.formatDueCountdownFromInputs === 'function'
          ) {
            return PriorityUI.formatDueCountdownFromInputs(state) || null;
          }
          return null;
        })(),
        startDate: dueEnabled ? state.startDate || null : null,
        startTime: dueEnabled ? state.startTime || null : null,
        recurrence: (function () {
          if (!dueEnabled) return null;
          if (
            typeof PriorityUI !== 'undefined' &&
            typeof PriorityUI.normalizeRecurrence === 'function'
          ) {
            return PriorityUI.normalizeRecurrence(state.recurrence);
          }
          return state.recurrence && typeof state.recurrence === 'object'
            ? state.recurrence
            : null;
        })(),
        savedDueDate: !dueEnabled && state.dueDate ? state.dueDate : undefined,
        savedDueTime: !dueEnabled && state.dueTime ? state.dueTime : undefined
      };
      var blockedLinksRaw = Array.isArray(state.blockedLinks)
        ? state.blockedLinks
        : [];
      var blockedLinks = blockedLinksRaw
        .map(function (link) {
          if (!link || typeof link !== 'object') return null;
          var lid = link.id != null ? String(link.id).trim() : '';
          if (!lid) return null;
          return {
            type: 'subtask',
            id: lid,
            label:
              typeof link.label === 'string' && link.label.trim()
                ? link.label.trim()
                : undefined
          };
        })
        .filter(Boolean);
      ctx.blocked = {
        // Card is blocked ONLY when enAttente=true (shown under Progrès when status is Bloqué).
        enabled: blockedEnabled,
        enAttente: blockedEnabled,
        blockedReasons: blockedEnabled ? blockedReasons.slice() : [],
        blockedLinks: blockedEnabled ? blockedLinks : [],
        // Retained while the section is off — historical only, NOT an active block.
        savedReasons: !blockedEnabled && blockedReasons.length
          ? blockedReasons.slice()
          : undefined,
        savedLinks: !blockedEnabled && blockedLinks.length ? blockedLinks : undefined
      };
      if (typeof PriorityUI !== 'undefined' && PriorityUI.resolveDisplay) {
        try {
          var formulaKey = ctx.formula;
          var calc =
            PriorityUI.FORMULAS &&
            PriorityUI.FORMULAS[formulaKey] &&
            PriorityUI.FORMULAS[formulaKey].calc
              ? PriorityUI.FORMULAS[formulaKey].calc
              : PriorityUI.FORMULAS && PriorityUI.FORMULAS.baseline
                ? PriorityUI.FORMULAS.baseline.calc
                : null;
          if (calc) {
            var result = calc(state);
            var display = PriorityUI.resolveDisplay(result, state);
            ctx.display = {
              score: display.score,
              label: display.label,
              tier: display.label || null,
              inutile: !!display.inutile,
              // false when Bloqué is disabled, even if savedReasons exist
              blocked: !!display.blocked,
              dueCountdown: dueEnabled ? display.dueCountdown || null : null,
              duePast: dueEnabled ? !!display.duePast : false,
              dueDate: dueEnabled ? display.dueDate || null : null,
              priorityEnabled: priorityEnabled,
              tiers: (
                (typeof PriorityUI !== 'undefined' && PriorityUI.HEAT_SEGMENTS) ||
                []
              ).map(function (seg) {
                return seg.label;
              })
            };
            if (ctx.priority) {
              ctx.priority.explanation = buildPriorityExplanation(state, ctx.display);
            }
          }
        } catch (e) {
          console.error('PriorityAgent.buildContext display failed', e);
        }
      }
      if (ctx.priority && !ctx.priority.explanation) {
        ctx.priority.explanation = buildPriorityExplanation(state, ctx.display);
      }
    }
    var completion = null;
    if (typeof bridge.getCompletion === 'function') {
      try {
        completion = bridge.getCompletion();
      } catch (e) {
        completion = null;
      }
    }
    if (completion && typeof completion === 'object') {
      var progressEnabled = completion.progressEnabled !== false;
      var progressMeta = null;
      if (
        progressEnabled &&
        typeof CompletionTrello !== 'undefined' &&
        CompletionTrello.computeCardProgress
      ) {
        try {
          progressMeta = CompletionTrello.computeCardProgress(completion);
        } catch (e) {
          progressMeta = null;
        }
      }
      ctx.progress = {
        enabled: progressEnabled,
        cardProgress:
          progressEnabled && !(completion.items && completion.items.length)
            ? typeof completion.progress === 'number'
              ? completion.progress
              : null
            : null,
        percent: progressMeta ? progressMeta.percent : null,
        doneCount: progressMeta ? progressMeta.doneCount : null,
        totalCount: progressMeta ? progressMeta.totalCount : null,
        // Always include items so the agent can match/rename by name even if the
        // section is momentarily off (values are inactive when enabled=false).
        items: (completion.items || []).map(function (item) {
          var mapped = {
            id: item.id,
            text: item.text,
            done: !!item.done,
            progress: item.progress,
            blocked: item.blocked === true,
            blockedReasons:
              item.blocked === true && Array.isArray(item.blockedReasons)
                ? item.blockedReasons.slice()
                : undefined,
            estimatedMinutes:
              item.estimatedMinutes != null && isFinite(+item.estimatedMinutes)
                ? +item.estimatedMinutes
                : null,
            estimatedMinutesLocked: item.estimatedMinutesLocked === true
          };
          if (item.linkedCardId) {
            mapped.linkedCardId = String(item.linkedCardId);
          }
          // Local checklists (sub-sub-tasks) under a subtask.
          if (Array.isArray(item.items) && item.items.length) {
            mapped.items = item.items
              .map(function (child) {
                if (!child || typeof child !== 'object') return null;
                return {
                  id: child.id,
                  text: child.text,
                  done: !!child.done,
                  progress: child.progress,
                  estimatedMinutes:
                    child.estimatedMinutes != null &&
                    isFinite(+child.estimatedMinutes)
                      ? +child.estimatedMinutes
                      : null
                };
              })
              .filter(Boolean);
          }
          return mapped;
        }),
        blocked: completion.blocked === true,
        blockedOrigin:
          completion.blocked === true
            ? completion.blockedOrigin === 'status'
              ? 'status'
              : 'user'
            : undefined,
        blockedReasons:
          completion.blocked === true &&
          Array.isArray(completion.blockedReasons)
            ? completion.blockedReasons.slice()
            : undefined,
        hasBlockedSubtasks:
          typeof CompletionTrello !== 'undefined' &&
          CompletionTrello.hasBlockedSubtasks
            ? CompletionTrello.hasBlockedSubtasks(completion)
            : undefined,
        estimatedTotalMinutes: null,
        estimatedRemainingMinutes: null,
        estimatedMinutesOffset:
          typeof completion.estimatedMinutesOffset === 'number' &&
          isFinite(completion.estimatedMinutesOffset)
            ? completion.estimatedMinutesOffset
            : null
      };
      if (
        typeof CompletionTrello !== 'undefined' &&
        CompletionTrello.computeEstimatedTotal
      ) {
        try {
          ctx.progress.estimatedTotalMinutes =
            CompletionTrello.computeEstimatedTotal(completion);
          ctx.progress.estimatedRemainingMinutes =
            CompletionTrello.computeEstimatedRemaining(completion);
        } catch (eEst) {
          /* ignore */
        }
      }
    }
    ctx.userName = resolveUserDisplayName(ctx);
    return ctx;
  }

  /**
   * Pull a display name from identity-style memory facts
   * ("Nom: Alex", "Je m'appelle Alex", …).
   */
  function extractNameFromIdentityFact(text) {
    var s = String(text || '').trim();
    if (!s) return '';
    var m =
      s.match(/nom\s+de\s+l['\u2019]?utilisateur\s*[:\-]?\s*(.+)$/i) ||
      s.match(/je\s+m['\u2019]appelle\s+(.+)$/i) ||
      s.match(/mon\s+nom\s+(?:est\s+)?(.+)$/i) ||
      s.match(/^nom\s*[:\-]\s*(.+)$/i) ||
      s.match(/prenom\s*[:\-]?\s*(.+)$/i);
    if (!m) return '';
    var name = String(m[1] || '')
      .replace(/[。.!?]+$/g, '')
      .split(/[,;(/]/)[0]
      .trim();
    if (name.length < 2 || name.length > 40) return '';
    // Reject leftover filler words without a real name token.
    if (/^(est|suis|appel+e)$/i.test(name)) return '';
    return name;
  }

  /** Prefer profile.displayName, else identity fact from board memory. */
  function resolveUserDisplayName(ctx) {
    if (ctx && ctx.profile && typeof ctx.profile.displayName === 'string') {
      var fromProfile = ctx.profile.displayName.trim();
      if (fromProfile) return fromProfile;
    }
    var facts =
      ctx && ctx.memory && Array.isArray(ctx.memory.facts) ? ctx.memory.facts : [];
    for (var i = 0; i < facts.length; i++) {
      var n = extractNameFromIdentityFact(facts[i]);
      if (n) return n;
    }
    return '';
  }

  /**
   * Lightweight FR/EN detector for the latest user message.
   * Returns 'en' | 'fr' | null (ambiguous / empty).
   */
  function detectMessageLanguage(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var fr = 0;
    var en = 0;
    if (/[àâäéèêëïîôùûüçœ]/i.test(t)) fr += 4;
    var frRe =
      /\b(le|la|les|un|une|des|du|de|je|tu|il|elle|on|nous|vous|ils|elles|est|sont|pas|pour|avec|dans|sur|que|qui|quoi|oui|non|merci|aussi|mais|donc|alors|aujourd'hui|j'ai|t'as|c'est|d'accord|okay|ok|ajoute|ajouter|t[aâ]che|sous-t[aâ]che|carte|priorit[eé]|[eé]ch[eé]ance|bloque|bloqu[eé]|progr[eè]s|fais|fait|peux|veux|s'il|svp)\b/gi;
    var enRe =
      /\b(the|a|an|is|are|was|were|i|you|we|they|this|that|with|for|from|have|has|had|don't|doesn't|can't|won't|what's|please|thanks|thank|also|but|so|then|today|okay|ok|add|adding|task|subtask|card|priority|due|blocked|progress|can|want|need|just|really|maybe|sure|yeah|yep|nope|hey|hi|hello)\b/gi;
    var m;
    while ((m = frRe.exec(t))) {
      fr += 1;
    }
    while ((m = enRe.exec(t))) {
      en += 1;
    }
    // Pure title lists / short English phrases without stopwords
    if (!fr && !en) {
      if (/^[A-Za-z0-9 ,./'\-+\n]+$/.test(t) && /[A-Za-z]{3,}/.test(t)) {
        return 'en';
      }
      return null;
    }
    if (en >= fr + 1) return 'en';
    if (fr >= en + 1) return 'fr';
    return null;
  }

  function profileLanguageInstruction(profile, replyLanguage) {
    var forced =
      replyLanguage === 'en' || replyLanguage === 'fr' ? replyLanguage : null;
    if (forced === 'en') {
      return (
        'Language (OBLIGATORY for this turn): The user wrote in English. ' +
        'Reply entirely in English (message, suggestions, followUps, prompts, block captions). ' +
        'Do NOT switch to French unless they clearly write in French.'
      );
    }
    if (forced === 'fr') {
      return (
        'Langue (OBLIGATOIRE pour ce tour)\u00a0: l\'utilisateur a \u00e9crit en fran\u00e7ais. ' +
        'R\u00e9ponds enti\u00e8rement en fran\u00e7ais (message, suggestions, followUps, prompts, l\u00e9gendes). ' +
        'Ne passe en anglais que s\'il \u00e9crit clairement en anglais.'
      );
    }
    if (global.UserProfile && typeof global.UserProfile.languageInstruction === 'function') {
      try {
        return global.UserProfile.languageInstruction(profile || {});
      } catch (e) {
        /* fall through */
      }
    }
    if (profile && profile.language === 'en') {
      return (
        'Default language: English. Always match the user\'s latest message language ' +
        '(if they write in French, reply in French; if English, reply in English).'
      );
    }
    return (
      'Langue par d\u00e9faut\u00a0: fran\u00e7ais qu\u00e9b\u00e9cois. ' +
      'OBLIGATOIRE\u00a0: suis la langue du dernier message utilisateur ' +
      '(s\'il \u00e9crit en anglais, r\u00e9ponds enti\u00e8rement en anglais\u00a0; ' +
      's\'il \u00e9crit en fran\u00e7ais, reste en fran\u00e7ais qu\u00e9b\u00e9cois). ' +
      'Utilise le vocabulaire du Qu\u00e9bec (ex. \u00ab\u00a0sabler le pl\u00e2tre\u00a0\u00bb, pas \u00ab\u00a0poncer le pl\u00e2tre\u00a0\u00bb).'
    );
  }

  /**
   * Job: build & maintain a real human "character sheet" (static + skills +
   * dynamic state) and use it to evaluate / filter / recommend tasks.
   * Persistence = board memory patches with stable prefixes (member pluginData
   * is already crowded). Never invent values.
   */
  function humanProfileJobLines(isEn) {
    if (isEn) {
      return [
        'Human profile (character sheet \u2014 core job, non-negotiable):',
        '- Your job is to build and maintain a structured profile of the CURRENT USER: static identity, learned skills, biology, and real-time state. Use it to evaluate, filter, and recommend tasks intelligently WHEN they ask for help prioritizing or choosing what to do.',
        '- Treat them like a character with stats, but every stat must map to something real and, ideally, self-reported or measurable. NEVER fabricate data. If you do not know a value: ask (conversationally) or mark it unknown. Do not invent numbers, ages, diagnoses, or money figures.',
        '- Friend-first still applies: do NOT quiz them mid-task or dump a giant form. A few questions at a time. Skip or postpone sensitive topics if they decline. Never unsolicited productivity push.',
        '- Persistence (important):',
        '  \u00b7 Durable human facts \u2192 patches with op "remember" and prefix "Moi \u2014 \u2026" (board LTM). Examples: "Moi \u2014 Identit\u00e9: \u2026", "Moi \u2014 Biologie: \u2026", "Moi \u2014 Comp\u00e9tence: \u2026", "Moi \u2014 Famille: \u2026", "Moi \u2014 Finance: \u2026".',
        '  \u00b7 Dynamic state (today) \u2192 patches with op "note" and prefix "\u00c9tat \u2014 \u2026" (short-term). Include the date when useful (context.today). Refresh when they update; do not treat stale \u00c9tat as truth forever.',
        '  \u00b7 Prefer updating / replacing the same prefix over flooding memory with duplicates.',
        '  \u00b7 context.profile.displayName / role / notes + Mon profil UI remain source of truth for name/role when set. Do not put general identity only in cardPatches.',
        '  \u00b7 Family / people (parents, boss\u2026) can also use upsert_person when they are distinct contacts.',
        '- Read context.memory (facts + short notes), context.profile, and context.people BEFORE re-asking something already answered.',
        '1) Static profile (build once / fill gaps on first contact):',
        '- If almost no "Moi \u2014" facts and no displayName: start gently, a few questions at a time (never a form dump).',
        '- Identity: full name; date and time of birth (to the minute if known \u2014 enables exact age / circadian context); place of birth / current location.',
        '- Parents: mother\'s current age (derive age at user birth when possible); father\'s current age, alive?, cause of death if relevant, alcoholism if self-reported. Sensitive: ask only with consent / when building the sheet; mark unknown if refused.',
        '- Grandparents: living/deceased, ages if living, cause of death if known. Same sensitivity rules.',
        '- Passive traits (genetic / slow-changing): family disease history / predispositions; metabolism type; blood type; pain tolerance (self-rated 1\u201310 or inferred over time, labeled inferred); allergies as specific trigger + severity + reaction ("elemental weaknesses" framing is OK in tone, keep facts precise).',
        '- Physical descriptors (update periodically, not every session): height, weight, BMI / body-fat % if known; resting HR, blood pressure; bone density if known; flexibility/mobility; age as context (stats do NOT scale linearly with age \u2014 not a "level").',
        '- Skill trees: languages, sports, instruments, trades, other learned abilities. Track proficiency, last practiced, practice frequency. Decay: unused for a long stretch \u2192 flag "rusty" and lower confidence until refreshed. Note plateau vs active improvement (diminishing returns).',
        '2) Dynamic human state (user-configurable; ask with the suggested phrasing when a check-in fits):',
        '- Energy (physical): glycogen/fatigue, desire to move \u2014 "How\'s your body feeling \u2014 energized, okay, drained?"',
        '- Energy (mental/cognitive): working memory, processing speed, decision fatigue \u2014 "How\'s your head today \u2014 sharp, foggy, fried?"',
        '- Mood: Great / Good / Okay / Bad.',
        '- Sleep (last night): Great / Good / Okay / Bad.',
        '- Hydration: Yes / Not really / No.',
        '- Nutrition (ate well today?): Yes / No.',
        '- Charisma / social battery: Low / Medium / High.',
        '- Strength / grit (willingness for hard, tedious, unfun work right now): Low / Medium / High.',
        '- Sickness / injury: free text + severity.',
        '- Anxiety flags: optional free text about specific dread today.',
        '- Money: cash/bank, savings, saving friction / issues if they share it. Never invent amounts.',
        '3) Using the sheet for tasks:',
        '- When they ask what to do / how to prioritize / whether something is realistic today: filter and recommend using known state + skills (e.g. low grit + fried head \u2192 avoid heavy cognitive slog; rusty skill \u2192 warn or suggest a warm-up).',
        '- Cite only known facts. If a key stat is unknown and it would change the recommendation, ask one short question.',
        '- Still no unsolicited "let\'s grind the board" pivots after small talk.'
      ];
    }
    return [
      'Profil humain (fiche personnage \u2014 job central, non n\u00e9gociable)\u00a0:',
      '- Ton job est de construire et maintenir un profil structur\u00e9 de l\'utilisateur actuel\u00a0: identit\u00e9 statique, comp\u00e9tences apprises, biologie, et \u00e9tat en temps r\u00e9el. Tu t\'en sers pour \u00e9valuer, filtrer et recommander des t\u00e2ches intelligemment QUAND iel demande de l\'aide \u00e0 prioriser / choisir quoi faire.',
      '- Traite-le comme un personnage avec des stats, mais chaque stat doit mapper \u00e0 quelque chose de r\u00e9el, id\u00e9alement auto-d\u00e9clar\u00e9 ou mesurable. N\'INVENTE JAMAIS de donn\u00e9es. Si tu ne connais pas une valeur\u00a0: demande (en conversation) ou marque unknown. Pas de chiffres, \u00e2ges, diagnostics ou montants invent\u00e9s.',
      '- Ami d\'abord toujours\u00a0: pas de quiz au milieu d\'une t\u00e2che, jamais de formulaire g\u00e9ant. Quelques questions \u00e0 la fois. Sujets sensibles\u00a0: seulement avec consentement / si iel refuse, marque unknown. Z\u00e9ro push productivit\u00e9 non sollicit\u00e9.',
      '- Persistance (important)\u00a0:',
      '  \u00b7 Faits humains durables \u2192 patches op "remember" avec pr\u00e9fixe \u00ab\u00a0Moi \u2014 \u2026\u00a0\u00bb (m\u00e9moire long terme tableau). Ex.\u00a0: \u00ab\u00a0Moi \u2014 Identit\u00e9\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Moi \u2014 Biologie\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Moi \u2014 Comp\u00e9tence\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Moi \u2014 Famille\u00a0: \u2026\u00a0\u00bb, \u00ab\u00a0Moi \u2014 Finance\u00a0: \u2026\u00a0\u00bb.',
      '  \u00b7 \u00c9tat dynamique (aujourd\'hui) \u2192 patches op "note" avec pr\u00e9fixe \u00ab\u00a0\u00c9tat \u2014 \u2026\u00a0\u00bb (court terme). Inclure la date si utile (context.today). Rafra\u00eechir quand \u00e7a change\u00a0; un \u00c9tat p\u00e9rim\u00e9 n\'est pas la v\u00e9rit\u00e9 \u00e0 vie.',
      '  \u00b7 Pr\u00e9f\u00e8re mettre \u00e0 jour / remplacer le m\u00eame pr\u00e9fixe plut\u00f4t que saturer la m\u00e9moire de doublons.',
      '  \u00b7 context.profile.displayName / role / notes + UI Mon profil restent la source pour nom/r\u00f4le quand c\'est rempli. INTERDIT de mettre l\'identit\u00e9 g\u00e9n\u00e9rale seulement en cardPatches.',
      '  \u00b7 Famille / contacts distincts\u00a0: upsert_person possible (parents, boss\u2026).',
      '- Lis context.memory (faits + notes), context.profile et context.people AVANT de reposer une question d\u00e9j\u00e0 r\u00e9pondue.',
      '1) Profil statique (construire une fois / combler les trous au premier contact)\u00a0:',
      '- Si presque aucun fait \u00ab\u00a0Moi \u2014\u00a0\u00bb et pas de displayName\u00a0: commence doucement, quelques questions \u00e0 la fois (jamais un dump de formulaire).',
      '- Identit\u00e9\u00a0: nom complet\u00a0; date et heure de naissance (\u00e0 la minute si connue \u2014 \u00e2ge exact / contexte circadien)\u00a0; lieu de naissance / localisation actuelle.',
      '- Parents\u00a0: \u00e2ge actuel de la m\u00e8re (en d\u00e9duire l\'\u00e2ge \u00e0 la naissance de l\'utilisateur si possible)\u00a0; \u00e2ge du p\u00e8re, vivant?, cause de d\u00e9c\u00e8s si pertinente, alcoolisme si auto-d\u00e9clar\u00e9. Sensible\u00a0: seulement avec consentement / en construisant la fiche\u00a0; unknown si refus.',
      '- Grands-parents\u00a0: vivants/d\u00e9c\u00e9d\u00e9s, \u00e2ges si vivants, cause de d\u00e9c\u00e8s si connue. M\u00eames r\u00e8gles de sensibilit\u00e9.',
      '- Traits passifs (g\u00e9n\u00e9tiques / lents)\u00a0: ant\u00e9c\u00e9dents / pr\u00e9dispositions familiales\u00a0; m\u00e9tabolisme\u00a0; groupe sanguin\u00a0; tol\u00e9rance \u00e0 la douleur (auto 1\u201310 ou inf\u00e9r\u00e9e dans le temps, \u00e9tiquet\u00e9e inf\u00e9r\u00e9e)\u00a0; allergies = d\u00e9clencheur + s\u00e9v\u00e9rit\u00e9 + type de r\u00e9action (tu peux dire \u00ab\u00a0faiblesses \u00e9l\u00e9mentaires\u00a0\u00bb en ton, mais les faits restent pr\u00e9cis).',
      '- Descripteurs physiques (mise \u00e0 jour p\u00e9riodique, pas chaque session)\u00a0: taille, poids, IMC / % graisse si connu\u00a0; FC repos, tension\u00a0; densit\u00e9 osseuse si connue\u00a0; flexibilit\u00e9/mobilit\u00e9\u00a0; \u00e2ge comme contexte (les stats ne scalent PAS lin\u00e9airement avec l\'\u00e2ge \u2014 ce n\'est pas un \u00ab\u00a0niveau\u00a0\u00bb).',
      '- Arbres de comp\u00e9tences\u00a0: langues, sports, instruments, m\u00e9tiers, autres apprentissages. Suivre niveau, derni\u00e8re pratique, fr\u00e9quence. D\u00e9croissance\u00a0: longtemps inutilis\u00e9 \u2192 flag \u00ab\u00a0rouill\u00e9\u00a0\u00bb et baisse de confiance jusqu\'\u00e0 refresh. Noter plateau vs progression active (rendements d\u00e9croissants).',
      '2) \u00c9tat humain dynamique (configurable\u00a0; demander avec les formulations ci-dessous quand un check-in colle)\u00a0:',
      '- \u00c9nergie (physique)\u00a0: glycog\u00e8ne/fatigue, envie de bouger \u2014 \u00ab\u00a0Ton corps l\u00e0\u00a0: \u00e9nergis\u00e9, okay, \u00e0 plat?\u00a0\u00bb',
      '- \u00c9nergie (mentale/cognitive)\u00a0: m\u00e9moire de travail, vitesse, fatigue d\u00e9cisionnelle \u2014 \u00ab\u00a0Ta t\u00eate aujourd\'hui\u00a0: sharp, brouillard, frite?\u00a0\u00bb',
      '- Humeur\u00a0: Super / Bien / Okay / Mal.',
      '- Sommeil (nuit derni\u00e8re)\u00a0: Super / Bien / Okay / Mal.',
      '- Hydratation\u00a0: Oui / Pas vraiment / Non.',
      '- Nutrition (bien mang\u00e9 aujourd\'hui?)\u00a0: Oui / Non.',
      '- Charisme / batterie sociale\u00a0: Bas / Moyen / Haut.',
      '- Force / grit (envie de faire du dur, ennuyeux, pas fun maintenant)\u00a0: Bas / Moyen / Haut.',
      '- Maladie / blessure\u00a0: texte libre + s\u00e9v\u00e9rit\u00e9.',
      '- Flags anxi\u00e9t\u00e9\u00a0: texte libre optionnel sur une crainte pr\u00e9cise aujourd\'hui.',
      '- Argent\u00a0: liquidit\u00e9s/compte, \u00e9pargne, frictions / difficult\u00e9s \u00e0 \u00e9pargner s\'iel en parle. Jamais inventer de montants.',
      '3) Utiliser la fiche pour les t\u00e2ches\u00a0:',
      '- Quand iel demande quoi faire / comment prioriser / si c\'est r\u00e9aliste aujourd\'hui\u00a0: filtre et recommande avec l\'\u00e9tat + les comp\u00e9tences connus (ex. grit bas + t\u00eate frite \u2192 \u00e9viter le gros slog cognitif\u00a0; skill rouill\u00e9 \u2192 pr\u00e9venir ou proposer un \u00e9chauffement).',
      '- Ne cite que des faits connus. Si une stat cl\u00e9 manque et changerait la reco, pose UNE question courte.',
      '- Toujours interdit de pivoter en \u00ab\u00a0on s\'y met sur le board?\u00a0\u00bb apr\u00e8s du small talk.'
    ];
  }

  // exports
  S.buildContext = buildContext;
  S.detectMessageLanguage = detectMessageLanguage;
  S.extractNameFromIdentityFact = extractNameFromIdentityFact;
  S.humanProfileJobLines = humanProfileJobLines;
  S.profileLanguageInstruction = profileLanguageInstruction;
  S.resolveUserDisplayName = resolveUserDisplayName;
})(typeof window !== 'undefined' ? window : this);
