/**
 * AI agent actions: people, places, labels
 *
 * Tools that edit board-level directories: people, places, members, labels, custom assignees, member roles.
 * Each tool registers one handler through registerAction (agent-base.js); executeAction in
 * agent-actions.js looks the tool up. A handler gets (bridge, action, tool, args) and returns the result object.
 * Part of the agent (see agent.parts.json); names are shared through window.PriorityAgentParts.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityAgentParts = global.PriorityAgentParts || {});

  // from earlier parts (values)
  var TOOL_LABELS = S.TOOL_LABELS;

  // from other parts (functions, resolved at call time)
  function actionFailure() { return S.actionFailure.apply(this, arguments); }
  function bridgeMissingFailure() { return S.bridgeMissingFailure.apply(this, arguments); }
  function bridgeOpFailure() { return S.bridgeOpFailure.apply(this, arguments); }
  function detailForTool() { return S.detailForTool.apply(this, arguments); }
  function draftCustomAssigneeFromSpec() { return S.draftCustomAssigneeFromSpec.apply(this, arguments); }
  function getPeopleFromBridge() { return S.getPeopleFromBridge.apply(this, arguments); }
  function getPlacesFromBridge() { return S.getPlacesFromBridge.apply(this, arguments); }
  function matchBoardLabel() { return S.matchBoardLabel.apply(this, arguments); }
  function matchBoardMember() { return S.matchBoardMember.apply(this, arguments); }
  function matchCustomAssignee() { return S.matchCustomAssignee.apply(this, arguments); }
  function registerAction() { return S.registerAction.apply(this, arguments); }
  function resolveMemberRoleId() { return S.resolveMemberRoleId.apply(this, arguments); }
  function snapshotPriority() { return S.snapshotPriority.apply(this, arguments); }
  function summarizeMemberSpec() { return S.summarizeMemberSpec.apply(this, arguments); }

  function registerAction() { return S.registerAction.apply(this, arguments); }

  // upsert_person
  registerAction(['upsert_person'], async function (bridge, action, tool, args) {
    if (typeof bridge.upsertPerson !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Annuaire Personnes indisponible'
      };
    }
    var personPatch = {
      name: typeof args.name === 'string' ? args.name.trim() : '',
      matchText:
        typeof args.matchText === 'string'
          ? args.matchText.trim()
          : typeof args.id === 'string'
            ? args.id.trim()
            : '',
      relation: args.relation,
      aliases: args.aliases,
      roles: args.roles,
      email: args.email,
      phone: args.phone,
      notes: args.notes,
      addAlias: args.addAlias,
      addRole: args.addRole,
      trelloMemberId: args.trelloMemberId
    };
    if (typeof args.id === 'string' && args.id.trim()) {
      personPatch.id = args.id.trim();
    }
    if (!personPatch.name && !personPatch.matchText && !personPatch.id) {
      return { ok: false, tool: tool, error: 'Nom ou matchText requis' };
    }
    var peopleBeforeUpsert = getPeopleFromBridge(bridge);
    var personBeforeUpsert = null;
    if (
      global.People &&
      typeof global.People.findByAliasOrName === 'function'
    ) {
      if (personPatch.id) {
        for (var pbi = 0; pbi < peopleBeforeUpsert.length; pbi++) {
          if (peopleBeforeUpsert[pbi].id === personPatch.id) {
            personBeforeUpsert = peopleBeforeUpsert[pbi];
            break;
          }
        }
      }
      if (!personBeforeUpsert && personPatch.matchText) {
        personBeforeUpsert = global.People.findByAliasOrName(
          peopleBeforeUpsert,
          personPatch.matchText
        );
      }
      if (!personBeforeUpsert && personPatch.name) {
        personBeforeUpsert = global.People.findByAliasOrName(
          peopleBeforeUpsert,
          personPatch.name
        );
      }
    }
    var upsertResult = await Promise.resolve(
      bridge.upsertPerson(personPatch)
    );
    if (!upsertResult || !upsertResult.ok) {
      return {
        ok: false,
        tool: tool,
        error:
          (upsertResult && (upsertResult.reason || upsertResult.error)) ||
          'Mise \u00e0 jour personne \u00e9chou\u00e9e'
      };
    }
    // Sync into board Hors Trello catalog (same person-* id) so the
    // assignee picker and set_custom_assignees share the contact.
    if (
      upsertResult.person &&
      typeof bridge.upsertCustomAssigneeCatalog === 'function'
    ) {
      try {
        var horsDraft =
          global.People && typeof global.People.toCustomAssignee === 'function'
            ? global.People.toCustomAssignee(upsertResult.person)
            : {
                id: upsertResult.person.id,
                name: upsertResult.person.name,
                trelloMemberId: upsertResult.person.trelloMemberId
              };
        if (horsDraft && horsDraft.name) {
          await Promise.resolve(
            bridge.upsertCustomAssigneeCatalog(horsDraft)
          );
        }
      } catch (eSyncHors) { /* non-fatal */ }
    }
    var personAfterUpsert = upsertResult.person || null;
    var personCreated = !personBeforeUpsert;
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: personCreated
        ? 'Personne ajout\u00e9e.'
        : TOOL_LABELS.upsert_person,
      detail: detailForTool(tool, null, null, null, null, args, {
        name:
          (personAfterUpsert && personAfterUpsert.name) ||
          personPatch.name,
        person: personAfterUpsert,
        before: personBeforeUpsert,
        created: personCreated
      })
    };
  });

  // remove_person
  registerAction(['remove_person'], async function (bridge, action, tool, args) {
    if (typeof bridge.removePerson !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Annuaire Personnes indisponible'
      };
    }
    var removeMatch =
      (typeof args.id === 'string' && args.id.trim()) ||
      (typeof args.matchText === 'string' && args.matchText.trim()) ||
      (typeof args.name === 'string' && args.name.trim()) ||
      (typeof args.text === 'string' && args.text.trim()) ||
      '';
    if (!removeMatch) {
      return { ok: false, tool: tool, error: 'matchText / name / id requis' };
    }
    var peopleBeforeRemove = getPeopleFromBridge(bridge);
    var personBeforeRemove = null;
    if (
      global.People &&
      typeof global.People.findByAliasOrName === 'function'
    ) {
      if (typeof args.id === 'string' && args.id.trim()) {
        for (var pri = 0; pri < peopleBeforeRemove.length; pri++) {
          if (peopleBeforeRemove[pri].id === args.id.trim()) {
            personBeforeRemove = peopleBeforeRemove[pri];
            break;
          }
        }
      }
      if (!personBeforeRemove) {
        personBeforeRemove = global.People.findByAliasOrName(
          peopleBeforeRemove,
          removeMatch
        );
      }
    }
    var removeResult = await Promise.resolve(
      bridge.removePerson({
        id: typeof args.id === 'string' ? args.id.trim() : '',
        matchText: removeMatch,
        name: typeof args.name === 'string' ? args.name.trim() : ''
      })
    );
    if (!removeResult || !removeResult.ok) {
      return {
        ok: false,
        tool: tool,
        error:
          (removeResult && (removeResult.reason || removeResult.error)) ||
          'Suppression personne \u00e9chou\u00e9e'
      };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.remove_person,
      detail: detailForTool(tool, null, null, null, null, args, {
        match: removeMatch,
        name:
          (personBeforeRemove && personBeforeRemove.name) || removeMatch
      })
    };
  });

  // upsert_place
  registerAction(['upsert_place'], async function (bridge, action, tool, args) {
    if (typeof bridge.upsertPlace !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Annuaire Lieux indisponible'
      };
    }
    var placePatch = {
      name: typeof args.name === 'string' ? args.name.trim() : '',
      matchText:
        typeof args.matchText === 'string'
          ? args.matchText.trim()
          : typeof args.id === 'string'
            ? args.id.trim()
            : '',
      kind: args.kind,
      aliases: args.aliases,
      notes: args.notes,
      addAlias: args.addAlias
    };
    if (typeof args.id === 'string' && args.id.trim()) {
      placePatch.id = args.id.trim();
    }
    if (!placePatch.name && !placePatch.matchText && !placePatch.id) {
      return { ok: false, tool: tool, error: 'Nom ou matchText requis' };
    }
    var placesBeforeUpsert = getPlacesFromBridge(bridge);
    var placeBeforeUpsert = null;
    if (
      global.Places &&
      typeof global.Places.findByAliasOrName === 'function'
    ) {
      if (placePatch.id) {
        for (var pli = 0; pli < placesBeforeUpsert.length; pli++) {
          if (placesBeforeUpsert[pli].id === placePatch.id) {
            placeBeforeUpsert = placesBeforeUpsert[pli];
            break;
          }
        }
      }
      if (!placeBeforeUpsert && placePatch.matchText) {
        placeBeforeUpsert = global.Places.findByAliasOrName(
          placesBeforeUpsert,
          placePatch.matchText
        );
      }
      if (!placeBeforeUpsert && placePatch.name) {
        placeBeforeUpsert = global.Places.findByAliasOrName(
          placesBeforeUpsert,
          placePatch.name
        );
      }
    }
    var upsertPlaceResult = await Promise.resolve(
      bridge.upsertPlace(placePatch)
    );
    if (!upsertPlaceResult || !upsertPlaceResult.ok) {
      return {
        ok: false,
        tool: tool,
        error:
          (upsertPlaceResult &&
            (upsertPlaceResult.reason || upsertPlaceResult.error)) ||
          'Mise \u00e0 jour lieu \u00e9chou\u00e9e'
      };
    }
    if (
      upsertPlaceResult.place &&
      typeof bridge.upsertPlaceCatalog === 'function'
    ) {
      try {
        var placeDraft =
          global.Places && typeof global.Places.toCatalogEntry === 'function'
            ? global.Places.toCatalogEntry(upsertPlaceResult.place)
            : {
                id: upsertPlaceResult.place.id,
                name: upsertPlaceResult.place.name
              };
        if (placeDraft && placeDraft.name) {
          await Promise.resolve(bridge.upsertPlaceCatalog(placeDraft));
        }
      } catch (eSyncPlace) { /* non-fatal */ }
    }
    var placeAfterUpsert = upsertPlaceResult.place || null;
    var placeCreated = !placeBeforeUpsert;
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: placeCreated
        ? 'Lieu ajout\u00e9.'
        : TOOL_LABELS.upsert_place,
      detail: detailForTool(tool, null, null, null, null, args, {
        name:
          (placeAfterUpsert && placeAfterUpsert.name) || placePatch.name,
        place: placeAfterUpsert,
        before: placeBeforeUpsert,
        created: placeCreated
      })
    };
  });

  // remove_place
  registerAction(['remove_place'], async function (bridge, action, tool, args) {
    if (typeof bridge.removePlace !== 'function') {
      return {
        ok: false,
        tool: tool,
        error: 'Annuaire Lieux indisponible'
      };
    }
    var removePlaceMatch =
      (typeof args.id === 'string' && args.id.trim()) ||
      (typeof args.matchText === 'string' && args.matchText.trim()) ||
      (typeof args.name === 'string' && args.name.trim()) ||
      (typeof args.text === 'string' && args.text.trim()) ||
      '';
    if (!removePlaceMatch) {
      return { ok: false, tool: tool, error: 'matchText / name / id requis' };
    }
    var placesBeforeRemove = getPlacesFromBridge(bridge);
    var placeBeforeRemove = null;
    if (
      global.Places &&
      typeof global.Places.findByAliasOrName === 'function'
    ) {
      if (typeof args.id === 'string' && args.id.trim()) {
        for (var priP = 0; priP < placesBeforeRemove.length; priP++) {
          if (placesBeforeRemove[priP].id === args.id.trim()) {
            placeBeforeRemove = placesBeforeRemove[priP];
            break;
          }
        }
      }
      if (!placeBeforeRemove) {
        placeBeforeRemove = global.Places.findByAliasOrName(
          placesBeforeRemove,
          removePlaceMatch
        );
      }
    }
    var removePlaceResult = await Promise.resolve(
      bridge.removePlace({
        id: typeof args.id === 'string' ? args.id.trim() : '',
        matchText: removePlaceMatch,
        name: typeof args.name === 'string' ? args.name.trim() : ''
      })
    );
    if (!removePlaceResult || !removePlaceResult.ok) {
      return {
        ok: false,
        tool: tool,
        error:
          (removePlaceResult &&
            (removePlaceResult.reason || removePlaceResult.error)) ||
          'Suppression lieu \u00e9chou\u00e9e'
      };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.remove_place,
      detail: detailForTool(tool, null, null, null, null, args, {
        match: removePlaceMatch,
        name:
          (placeBeforeRemove && placeBeforeRemove.name) || removePlaceMatch
      })
    };
  });

  // set_places
  registerAction(['set_places'], async function (bridge, action, tool, args) {
    if (typeof bridge.setPlaces !== 'function') {
      return { ok: false, tool: tool, error: 'Lieux carte indisponibles' };
    }
    var placesDir = getPlacesFromBridge(bridge);
    var stateForPlaces =
      typeof bridge.getPriorityState === 'function'
        ? bridge.getPriorityState() || {}
        : {};
    var currentPlaces =
      global.Places && typeof global.Places.normalizePlaces === 'function'
        ? global.Places.normalizePlaces(stateForPlaces.places)
        : stateForPlaces.places && typeof stateForPlaces.places === 'object'
          ? stateForPlaces.places
          : {};
    var nextPlaces = args.clear === true ? {} : Object.assign({}, currentPlaces);
    function resolveSlot(spec) {
      if (spec == null || spec === '' || spec === false) return null;
      if (spec === true) return null;
      var resolved =
        global.Places && typeof global.Places.resolvePlaceSpec === 'function'
          ? global.Places.resolvePlaceSpec(placesDir, spec)
          : null;
      if (resolved) return resolved;
      var name =
        typeof spec === 'string'
          ? spec.trim()
          : spec && typeof spec.name === 'string'
            ? spec.name.trim()
            : '';
      if (!name) return null;
      if (
        typeof PriorityUI !== 'undefined' &&
        typeof PriorityUI.createPlaceRef === 'function'
      ) {
        return PriorityUI.createPlaceRef(name);
      }
      return { id: 'place-temp-' + Math.random().toString(36).slice(2, 8), name: name };
    }
    if (Object.prototype.hasOwnProperty.call(args, 'from')) {
      var fromRef = resolveSlot(args.from);
      if (fromRef) nextPlaces.from = fromRef;
      else delete nextPlaces.from;
    }
    if (Object.prototype.hasOwnProperty.call(args, 'to')) {
      var toRef = resolveSlot(args.to);
      if (toRef) nextPlaces.to = toRef;
      else delete nextPlaces.to;
    }
    if (Object.prototype.hasOwnProperty.call(args, 'at')) {
      var atRef = resolveSlot(args.at);
      if (atRef) nextPlaces.at = atRef;
      else delete nextPlaces.at;
    }
    if (
      global.Places &&
      typeof global.Places.normalizePlaces === 'function'
    ) {
      nextPlaces = global.Places.normalizePlaces(nextPlaces);
    }
    var setPlacesResult = await Promise.resolve(bridge.setPlaces(nextPlaces));
    if (!setPlacesResult || setPlacesResult.ok === false) {
      return {
        ok: false,
        tool: tool,
        error:
          (setPlacesResult &&
            (setPlacesResult.reason || setPlacesResult.error)) ||
          'Mise \u00e0 jour lieux \u00e9chou\u00e9e'
      };
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_places,
      detail: detailForTool(tool, null, null, null, null, args, {
        places: (setPlacesResult && setPlacesResult.places) || nextPlaces
      })
    };
  });

  // set_members
  registerAction(['set_members'], async function (bridge, action, tool, args) {
    if (
      typeof bridge.addMember !== 'function' &&
      typeof bridge.removeMember !== 'function'
    ) {
      return bridgeMissingFailure(
        tool,
        'Assign\u00e9s indisponibles',
        ['addMember', 'removeMember']
      );
    }
    var boardMembers = [];
    if (typeof bridge.loadBoardMembers === 'function') {
      boardMembers = await Promise.resolve(bridge.loadBoardMembers());
    } else if (typeof bridge.getBoardMembers === 'function') {
      boardMembers = await Promise.resolve(bridge.getBoardMembers());
    }
    if (!Array.isArray(boardMembers)) boardMembers = [];
    var addSpecs = [];
    if (Array.isArray(args.add)) addSpecs = args.add.slice();
    else if (args.add != null) addSpecs = [args.add];
    else if (args.memberId != null || args.matchText || args.name) {
      addSpecs = [args];
    }
    var removeSpecs = [];
    if (Array.isArray(args.remove)) removeSpecs = args.remove.slice();
    else if (args.remove != null) removeSpecs = [args.remove];
    if (args.clear === true && typeof bridge.getOwnership === 'function') {
      var own = bridge.getOwnership() || {};
      var cur = Array.isArray(own.members) ? own.members : [];
      removeSpecs = removeSpecs.concat(cur);
    }
    if (!addSpecs.length && !removeSpecs.length) {
      return actionFailure(tool, 'Aucun membre \u00e0 ajouter ou retirer', {
        code: 'empty-ops',
        hint: 'Passe add[], remove[], ou clear:true.',
        args: args
      });
    }
    var memberOps = [];
    var mi;
    for (mi = 0; mi < removeSpecs.length; mi++) {
      var rm = matchBoardMember(boardMembers, removeSpecs[mi]);
      if (!rm && removeSpecs[mi] && removeSpecs[mi].id != null) {
        rm = { id: String(removeSpecs[mi].id) };
      }
      if (!rm || !rm.id) {
        return actionFailure(tool, 'Membre \u00e0 retirer introuvable', {
          code: 'member-not-found',
          cause: 'spec: ' + summarizeMemberSpec(removeSpecs[mi]),
          hint:
            'Aucun membre du tableau ne correspond. Utilise context.boardMembers / ownership.',
          args: args
        });
      }
      if (typeof bridge.removeMember !== 'function') {
        return bridgeMissingFailure(
          tool,
          'Retrait membre indisponible',
          ['removeMember']
        );
      }
      var rmRes = await Promise.resolve(bridge.removeMember(rm.id));
      if (!rmRes || rmRes.ok === false) {
        return bridgeOpFailure(tool, 'Retrait membre \u00e9chou\u00e9', rmRes);
      }
      memberOps.push('−' + (rm.fullName || rm.username || rm.id));
    }
    for (mi = 0; mi < addSpecs.length; mi++) {
      var am = matchBoardMember(boardMembers, addSpecs[mi]);
      if (!am || !am.id) {
        return actionFailure(tool, 'Membre \u00e0 assigner introuvable', {
          code: 'member-not-found',
          cause: 'spec: ' + summarizeMemberSpec(addSpecs[mi]),
          hint:
            'Aucun membre du tableau ne correspond. Utilise context.boardMembers / ownership.',
          args: args
        });
      }
      if (typeof bridge.addMember !== 'function') {
        return bridgeMissingFailure(
          tool,
          'Ajout membre indisponible',
          ['addMember']
        );
      }
      var amRes = await Promise.resolve(bridge.addMember(am.id));
      if (!amRes || amRes.ok === false) {
        return bridgeOpFailure(tool, 'Ajout membre \u00e9chou\u00e9', amRes);
      }
      memberOps.push('+' + (am.fullName || am.username || am.id));
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_members,
      detail: detailForTool(tool, null, null, null, null, args, {
        ops: memberOps
      })
    };
  });

  // set_labels
  registerAction(['set_labels'], async function (bridge, action, tool, args) {
    if (
      typeof bridge.addLabel !== 'function' &&
      typeof bridge.removeLabel !== 'function' &&
      typeof bridge.createLabel !== 'function'
    ) {
      return bridgeMissingFailure(
        tool,
        '\u00c9tiquettes indisponibles',
        ['addLabel', 'removeLabel', 'createLabel']
      );
    }
    var boardLabels = [];
    if (typeof bridge.loadBoardLabels === 'function') {
      boardLabels = await Promise.resolve(bridge.loadBoardLabels());
    } else if (typeof bridge.getBoardLabels === 'function') {
      boardLabels = await Promise.resolve(bridge.getBoardLabels());
    }
    if (!Array.isArray(boardLabels)) boardLabels = [];
    var cardLabels = [];
    if (typeof bridge.loadCardLabels === 'function') {
      cardLabels = await Promise.resolve(bridge.loadCardLabels());
    } else if (typeof bridge.getCardLabels === 'function') {
      cardLabels = await Promise.resolve(bridge.getCardLabels());
    }
    if (!Array.isArray(cardLabels)) cardLabels = [];
    var labelPool = boardLabels.length ? boardLabels : cardLabels;
    var addLabelSpecs = [];
    if (Array.isArray(args.add)) addLabelSpecs = args.add.slice();
    else if (args.add != null) addLabelSpecs = [args.add];
    var removeLabelSpecs = [];
    if (Array.isArray(args.remove)) removeLabelSpecs = args.remove.slice();
    else if (args.remove != null) removeLabelSpecs = [args.remove];
    if (args.clear === true) {
      removeLabelSpecs = removeLabelSpecs.concat(cardLabels);
    }
    var createSpec =
      args.create && typeof args.create === 'object' ? args.create : null;
    if (
      !addLabelSpecs.length &&
      !removeLabelSpecs.length &&
      !createSpec
    ) {
      return {
        ok: false,
        tool: tool,
        error: 'Aucune \u00e9tiquette \u00e0 modifier'
      };
    }
    var labelOps = [];
    var li;
    for (li = 0; li < removeLabelSpecs.length; li++) {
      var rl =
        matchBoardLabel(cardLabels, removeLabelSpecs[li]) ||
        matchBoardLabel(labelPool, removeLabelSpecs[li]);
      if (!rl || !rl.id) {
        return {
          ok: false,
          tool: tool,
          error: '\u00c9tiquette \u00e0 retirer introuvable'
        };
      }
      if (typeof bridge.removeLabel !== 'function') {
        return {
          ok: false,
          tool: tool,
          error: 'Retrait \u00e9tiquette indisponible'
        };
      }
      var rlRes = await Promise.resolve(bridge.removeLabel(rl.id));
      if (!rlRes || rlRes.ok === false) {
        return {
          ok: false,
          tool: tool,
          error:
            (rlRes && (rlRes.reason || rlRes.error)) ||
            'Retrait \u00e9tiquette \u00e9chou\u00e9'
        };
      }
      labelOps.push('−' + (rl.name || rl.id));
    }
    for (li = 0; li < addLabelSpecs.length; li++) {
      var al = matchBoardLabel(labelPool, addLabelSpecs[li]);
      if (!al || !al.id) {
        return {
          ok: false,
          tool: tool,
          error: '\u00c9tiquette \u00e0 ajouter introuvable'
        };
      }
      if (typeof bridge.addLabel !== 'function') {
        return {
          ok: false,
          tool: tool,
          error: 'Ajout \u00e9tiquette indisponible'
        };
      }
      var alRes = await Promise.resolve(bridge.addLabel(al.id));
      if (!alRes || alRes.ok === false) {
        return {
          ok: false,
          tool: tool,
          error:
            (alRes && (alRes.reason || alRes.error)) ||
            'Ajout \u00e9tiquette \u00e9chou\u00e9'
        };
      }
      labelOps.push('+' + (al.name || al.id));
    }
    if (createSpec) {
      var createName =
        typeof createSpec.name === 'string'
          ? createSpec.name.trim()
          : typeof createSpec.matchText === 'string'
            ? createSpec.matchText.trim()
            : '';
      if (!createName) {
        return {
          ok: false,
          tool: tool,
          error: 'create.name requis'
        };
      }
      if (typeof bridge.createLabel !== 'function') {
        return {
          ok: false,
          tool: tool,
          error: 'Cr\u00e9ation \u00e9tiquette indisponible'
        };
      }
      var crRes = await Promise.resolve(
        bridge.createLabel({
          name: createName,
          color: createSpec.color
        })
      );
      if (!crRes || crRes.ok === false) {
        return {
          ok: false,
          tool: tool,
          error:
            (crRes && (crRes.reason || crRes.error)) ||
            'Cr\u00e9ation \u00e9tiquette \u00e9chou\u00e9e'
        };
      }
      labelOps.push(
        '+new:' +
          ((crRes.label && crRes.label.name) || createName)
      );
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_labels,
      detail: detailForTool(tool, null, null, null, null, args, {
        ops: labelOps
      })
    };
  });

  // set_custom_assignees
  registerAction(['set_custom_assignees'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyPriority !== 'function') {
      return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
    }
    var beforePri = snapshotPriority(bridge);
    var stateForPeople =
      typeof bridge.getPriorityState === 'function'
        ? bridge.getPriorityState() || {}
        : {};
    var people = Array.isArray(stateForPeople.customAssignees)
      ? stateForPeople.customAssignees.slice()
      : [];
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeCustomAssignees === 'function'
    ) {
      people = PriorityUI.normalizeCustomAssignees(people);
    }
    var peopleDirForAssign = getPeopleFromBridge(bridge);
    if (args.clear === true) {
      people = [];
    }
    var removePeople = [];
    if (Array.isArray(args.remove)) removePeople = args.remove;
    else if (args.remove != null) removePeople = [args.remove];
    for (var rpi = 0; rpi < removePeople.length; rpi++) {
      var hit = matchCustomAssignee(
        people,
        removePeople[rpi],
        peopleDirForAssign
      );
      if (!hit) {
        return {
          ok: false,
          tool: tool,
          error: 'Personne \u00e0 retirer introuvable'
        };
      }
      people = people.filter(function (p) {
        return !p || String(p.id) !== String(hit.id);
      });
    }
    var addPeople = [];
    if (Array.isArray(args.add)) addPeople = args.add;
    else if (args.add != null) addPeople = [args.add];
    for (var api = 0; api < addPeople.length; api++) {
      var spec = addPeople[api];
      var existing = matchCustomAssignee(
        people,
        spec,
        peopleDirForAssign
      );
      if (existing) continue;
      // Also try board Hors Trello catalog before creating a new entry.
      if (
        typeof bridge.getCustomAssigneeCatalog === 'function' &&
        typeof PriorityUI !== 'undefined'
      ) {
        try {
          var catalog = bridge.getCustomAssigneeCatalog() || [];
          var catalogHit = matchCustomAssignee(
            catalog,
            spec,
            peopleDirForAssign
          );
          if (catalogHit) {
            people.push(catalogHit);
            continue;
          }
        } catch (eCat) { /* ignore */ }
      }
      var created = draftCustomAssigneeFromSpec(spec, peopleDirForAssign);
      if (!created || !created.name) {
        return {
          ok: false,
          tool: tool,
          error: 'Nom de personne requis'
        };
      }
      people.push(created);
    }
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeCustomAssignees === 'function'
    ) {
      people = PriorityUI.normalizeCustomAssignees(people);
    }
    if (typeof bridge.setCustomAssignees === 'function') {
      var peopleRes = await Promise.resolve(bridge.setCustomAssignees(people));
      if (peopleRes && peopleRes.ok === false) {
        return {
          ok: false,
          tool: tool,
          error:
            (peopleRes.reason || peopleRes.error) ||
            'Personnes assign\u00e9es \u00e9chou\u00e9es'
        };
      }
    } else {
      bridge.applyPriority({ customAssignees: people });
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_custom_assignees,
      detail: detailForTool(
        tool,
        beforePri,
        snapshotPriority(bridge),
        null,
        null,
        args,
        { count: people.length }
      )
    };
  });

  // set_member_roles
  registerAction(['set_member_roles'], async function (bridge, action, tool, args) {
    if (typeof bridge.applyPriority !== 'function') {
      return { ok: false, tool: tool, error: 'Bridge priorit\u00e9 indisponible' };
    }
    var stateRoles =
      typeof bridge.getPriorityState === 'function'
        ? bridge.getPriorityState() || {}
        : {};
    var rolesMap =
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeMemberRoles === 'function'
        ? PriorityUI.normalizeMemberRoles(stateRoles.memberRoles)
        : stateRoles.memberRoles && typeof stateRoles.memberRoles === 'object'
          ? Object.assign({}, stateRoles.memberRoles)
          : {};
    var boardMembersForRoles = [];
    if (typeof bridge.loadBoardMembers === 'function') {
      boardMembersForRoles = await Promise.resolve(bridge.loadBoardMembers());
    } else if (typeof bridge.getBoardMembers === 'function') {
      boardMembersForRoles = bridge.getBoardMembers() || [];
    }
    var ownershipForRoles =
      typeof bridge.getOwnership === 'function'
        ? bridge.getOwnership() || {}
        : {};
    var poolMembers = (boardMembersForRoles || []).concat(
      ownershipForRoles.members || []
    );
    var customsForRoles = Array.isArray(stateRoles.customAssignees)
      ? stateRoles.customAssignees
      : [];
    var peopleDirForRoles = getPeopleFromBridge(bridge);
    var targetMember =
      matchBoardMember(poolMembers, args) ||
      matchCustomAssignee(customsForRoles, args, peopleDirForRoles);
    if ((!targetMember || !targetMember.id) && args.memberId) {
      targetMember = { id: String(args.memberId) };
    }
    if (!targetMember || !targetMember.id) {
      return {
        ok: false,
        tool: tool,
        error: 'Assign\u00e9 introuvable pour les r\u00f4les'
      };
    }
    var mid = String(targetMember.id);
    if (args.clear === true) {
      delete rolesMap[mid];
    } else {
      var roleSpecs = Array.isArray(args.roles)
        ? args.roles
        : args.role != null
          ? [args.role]
          : [];
      if (!roleSpecs.length) {
        return {
          ok: false,
          tool: tool,
          error: 'roles requis (ex. subtitles|Montage)'
        };
      }
      var nextRoles = [];
      for (var ri = 0; ri < roleSpecs.length; ri++) {
        var rid = resolveMemberRoleId(roleSpecs[ri]);
        if (!rid) {
          return {
            ok: false,
            tool: tool,
            error: 'R\u00f4le inconnu\u00a0: ' + String(roleSpecs[ri])
          };
        }
        if (nextRoles.indexOf(rid) === -1) nextRoles.push(rid);
      }
      rolesMap[mid] = nextRoles;
    }
    if (
      typeof PriorityUI !== 'undefined' &&
      typeof PriorityUI.normalizeMemberRoles === 'function'
    ) {
      rolesMap = PriorityUI.normalizeMemberRoles(rolesMap);
    }
    if (typeof bridge.setMemberRoles === 'function') {
      var rolesRes = await Promise.resolve(bridge.setMemberRoles(rolesMap));
      if (rolesRes && rolesRes.ok === false) {
        return {
          ok: false,
          tool: tool,
          error:
            (rolesRes.reason || rolesRes.error) ||
            'R\u00f4les \u00e9chou\u00e9s'
        };
      }
    } else {
      bridge.applyPriority({ memberRoles: rolesMap });
    }
    return {
      ok: true,
      tool: tool,
      args: args,
      summary: TOOL_LABELS.set_member_roles,
      detail: detailForTool(tool, null, null, null, null, args, {
        memberId: mid,
        roles: rolesMap[mid] || []
      })
    };
  });
})(typeof window !== 'undefined' ? window : this);
