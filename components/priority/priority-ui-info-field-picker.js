/**
 * priority-ui-info-field: createInfoField() part 4 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.pgBuildNode = function pgBuildNode(stop, i, total) {
      var editable = !!M.onPlacesChange;
      var ref = stop.ref;
      var dir = M.findDirectoryPlace(ref);
      var name = M.placeDisplayName(ref);
      var stopKey = 'stop:' + i;

      var node = document.createElement('div');
      node.className = 'tg-node pg-node is-' + stop.key;
      node.setAttribute('data-idx', String(i));
      node.style.width = M.PG_NODE_W + 'px';
      node.style.setProperty('--tg-hue', String(M.tgHue(String(ref.id || name))));
      node.setAttribute('aria-label', M.PLACE_STOP_LABELS[stop.key] + ' : ' + name);

      var head = document.createElement('div');
      head.className = 'tg-node-head';
      if (editable) {
        node.classList.add('is-draggable');
        head.title =
          total > 1
            ? 'Glisser pour d\u00e9placer \u2014 d\u00e9poser sur un autre lieu pour \u00e9changer l\u2019ordre'
            : 'Glisser pour d\u00e9placer';
        head.addEventListener('pointerdown', function (event) {
          M.pgBeginMove(event, i);
        });
      }
      if (M.pgMoving && M.pgMoving.moved) {
        if (M.pgMoving.idx === i) node.classList.add('is-dragging-node');
        else if (M.pgMoving.over === i) node.classList.add('is-drop-target');
      }
      var badge = document.createElement('span');
      badge.className = 'pg-node-icon';
      badge.innerHTML =
        '<i class="ti ' + M.PG_STOP_ICONS[stop.key] + '" aria-hidden="true"></i>';
      head.appendChild(badge);
      var titles = document.createElement('div');
      titles.className = 'pg-node-titles';
      var kindEl = document.createElement('span');
      kindEl.className = 'pg-node-kind';
      kindEl.textContent = M.PLACE_STOP_LABELS[stop.key];
      titles.appendChild(kindEl);
      var nameEl = document.createElement(M.onPlaceDirectorySave ? 'button' : 'span');
      nameEl.className = 'tg-node-name pg-node-name';
      nameEl.textContent = name;
      nameEl.title = name;
      if (M.onPlaceDirectorySave) {
        nameEl.type = 'button';
        nameEl.title = 'Modifier ce lieu (adresse, GPS…)';
        nameEl.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (Date.now() < M.pgNoClickUntil) return;
          M.placesPickerSlot = '';
          M.placeEditKey = M.placeEditKey === stopKey ? '' : stopKey;
          M.renderPlaces();
          M.onLayoutChange();
        });
      }
      titles.appendChild(nameEl);
      head.appendChild(titles);
      if (editable) {
        var swapBtn = document.createElement('button');
        swapBtn.type = 'button';
        swapBtn.className = 'tg-node-clear pg-node-swap';
        swapBtn.setAttribute('aria-label', 'Changer de lieu : ' + name);
        swapBtn.title = 'Choisir un autre lieu';
        swapBtn.innerHTML = '<i class="ti ti-replace" aria-hidden="true"></i>';
        swapBtn.disabled = M.placesBusy;
        swapBtn.addEventListener('pointerdown', function (event) {
          event.stopPropagation();
        });
        swapBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.setPlacesPickerOpen(M.placesPickerSlot === 'rep:' + i ? '' : 'rep:' + i);
        });
        head.appendChild(swapBtn);
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'tg-node-clear';
        clearBtn.setAttribute('aria-label', 'Retirer : ' + name);
        clearBtn.textContent = '×';
        clearBtn.disabled = M.placesBusy;
        clearBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.removePlaceStop(i);
        });
        head.appendChild(clearBtn);
      }
      node.appendChild(head);

      var body = document.createElement('div');
      body.className = 'pg-node-body';
      if (editable) {
        var doInput = document.createElement('input');
        doInput.type = 'text';
        doInput.className = 'pg-node-do';
        doInput.placeholder =
          stop.key === 'from'
            ? 'Ce qu’on y prend / fait…'
            : stop.key === 'to'
              ? 'Ce qu’on y fait à l’arrivée…'
              : 'Ce qu’on y fait…';
        doInput.setAttribute('aria-label', 'Ce qu’on fait à ' + name);
        doInput.maxLength = S.MAX_PLACE_DO_LEN;
        doInput.autocomplete = 'off';
        doInput.value = ref.do || '';
        doInput.disabled = M.placesBusy;
        doInput.addEventListener('keydown', function (event) {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            doInput.blur();
          }
        });
        doInput.addEventListener('change', function () {
          M.setPlaceStopAction(i, doInput.value);
        });
        body.appendChild(doInput);
      } else if (ref.do) {
        var doText = document.createElement('div');
        doText.className = 'pg-node-do-text';
        doText.textContent = ref.do;
        body.appendChild(doText);
      }

      var metaBits = [];
      if (dir && dir.address) metaBits.push(dir.address);
      var hasGps = !!(dir && typeof dir.lat === 'number' && typeof dir.lng === 'number');
      if (metaBits.length || hasGps || dir) {
        var meta = document.createElement('div');
        meta.className = 'pg-node-meta';
        if (metaBits.length) {
          var addr = document.createElement('span');
          addr.className = 'pg-node-addr';
          addr.textContent = metaBits.join(' · ');
          addr.title = metaBits.join(' · ');
          meta.appendChild(addr);
        }
        if (hasGps) {
          var gps = document.createElement('i');
          gps.className = 'ti ti-current-location pg-node-gps';
          gps.title = 'Position GPS enregistrée';
          meta.appendChild(gps);
        }
        if (M.placeHasGeo(dir)) {
          var link = document.createElement('a');
          link.className = 'pg-node-tool';
          link.href = M.placeMapsHref(ref, dir);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = 'Ouvrir dans Google Maps';
          link.setAttribute('aria-label', 'Ouvrir dans Google Maps');
          link.innerHTML = '<i class="ti ti-map-2" aria-hidden="true"></i>';
          link.addEventListener('click', function (event) {
            event.stopPropagation();
          });
          meta.appendChild(link);
        }
        if (meta.childNodes.length) body.appendChild(meta);
      }
      if (editable && total > 1) {
        var tools = document.createElement('div');
        tools.className = 'pg-node-tools';
        if (i > 0) {
          tools.appendChild(
            M.pgToolButton('ti-chevron-up', 'Monter ce lieu', function () {
              M.movePlaceStop(i, -1);
            })
          );
        }
        if (i < total - 1) {
          tools.appendChild(
            M.pgToolButton('ti-chevron-down', 'Descendre ce lieu', function () {
              M.movePlaceStop(i, 1);
            })
          );
        }
        body.appendChild(tools);
      }
      if (body.childNodes.length) node.appendChild(body);

      // Pins (like the Assignés nodes): hover the top of the first stop or the
      // bottom of the last one, then drag or click to add a stop there.
      if (editable) {
        var pins = [];
        if (i === 0) pins.push({ side: 'top', at: 0, label: 'Ajouter un lieu avant' });
        if (i === total - 1) {
          pins.push({ side: 'bottom', at: total, label: 'Ajouter un lieu après' });
        }
        pins.forEach(function (def) {
          var edge = document.createElement('div');
          edge.className = 'tg-edge tg-edge-' + def.side + ' tg-kind-flow';
          edge.setAttribute('role', 'button');
          edge.tabIndex = 0;
          edge.setAttribute('aria-label', name + ' : ' + def.label);
          edge.title = def.label;
          var dot = document.createElement('span');
          dot.className = 'tg-pin';
          dot.setAttribute('aria-hidden', 'true');
          edge.appendChild(dot);
          edge.addEventListener('pointerdown', function (event) {
            var box = M.pgState && M.pgState.nodes[i];
            if (box) M.pgStartPinDrag(event, edge, def.at, def.side, box);
          });
          edge.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              var box = M.pgState && M.pgState.nodes[i];
              if (box) {
                M.pgOpenInsert(def.at, {
                  x: box.x + box.w / 2,
                  y: def.side === 'top' ? box.y - 40 : box.y + box.h + 40
                });
              }
            }
          });
          node.appendChild(edge);
        });
      }
      return node;
    };
    M.pgPlacePopover = function pgPlacePopover(el, x, y, width) {
      var hostW = M.pgHost.clientWidth || 320;
      var w = Math.min(width, hostW);
      el.style.width = w + 'px';
      var left = M.pgStage.offsetLeft + M.pgPan.x + x * M.pgScale - w / 2;
      el.style.left = Math.max(0, Math.min(left, hostW - w)) + 'px';
      var top = Math.max(0, Math.round(M.pgPan.y + y * M.pgScale));
      el.style.top = top + 'px';
      M.pgFrame.style.minHeight = Math.max(
        parseInt(M.pgFrame.style.minHeight, 10) || 0,
        top + el.offsetHeight + 8
      ) + 'px';
    };
    M.renderPlaceGraph = function renderPlaceGraph(stops) {
      if (M.pgDrag) return;
      M.pgNodes.replaceChildren();
      M.pgWires.replaceChildren();
      M.pgPills.replaceChildren();
      M.pgFrame.style.minHeight = '';

      stops.forEach(function (stop, i) {
        M.pgNodes.appendChild(M.pgBuildNode(stop, i, stops.length));
      });
      var heights = [];
      M.pgNodes.querySelectorAll('.pg-node').forEach(function (n) {
        heights[Number(n.getAttribute('data-idx'))] = n.offsetHeight;
      });
      var layout = M.pgLayout(stops.length, heights, M.pgHost.clientWidth);
      // Hand-placed stops (x / y saved on the stop, or live while dragging)
      // override the automatic snake layout.
      var hasFree = false;
      stops.forEach(function (stop, idx) {
        var b = layout.nodes[idx];
        if (!b) return;
        var live = M.pgLive[idx];
        var fx = live ? live.x : stop.ref.x;
        var fy = live ? live.y : stop.ref.y;
        if (typeof fx === 'number' && typeof fy === 'number') {
          b.x = fx;
          b.y = fy;
          hasFree = true;
        }
      });
      var minX = Infinity;
      var minY = Infinity;
      var maxX = 0;
      var maxY = 0;
      layout.nodes.forEach(function (b) {
        if (!b) return;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      });
      if (!isFinite(minX)) {
        minX = 0;
        minY = 0;
      }
      // Never shrink toward the top-left, so nodes do not jump when one is moved.
      var offX = M.PG_PAD + Math.max(0, -minX);
      var offY = M.PG_TOP + Math.max(0, -minY);
      var stageW = maxX + offX + M.PG_PAD;
      var stageH = maxY + offY + M.PG_PAD;
      var shifted = [];
      M.pgNodes.querySelectorAll('.pg-node').forEach(function (n) {
        var idx = Number(n.getAttribute('data-idx'));
        var b = layout.nodes[idx];
        if (!b) return;
        shifted[idx] = { x: b.x + offX, y: b.y + offY, w: b.w, h: b.h };
        n.style.left = shifted[idx].x + 'px';
        n.style.top = shifted[idx].y + 'px';
      });
      M.pgState = { nodes: shifted, width: stageW, height: stageH, off: { x: offX, y: offY } };
      M.pgAutoBtn.hidden = !hasFree || !M.onPlacesChange;

      M.pgStage.style.width = stageW + 'px';
      M.pgStage.style.height = stageH + 'px';
      M.pgWires.setAttribute('width', String(stageW));
      M.pgWires.setAttribute('height', String(stageH));
      M.pgWires.setAttribute('viewBox', '0 0 ' + stageW + ' ' + stageH);

      var available = M.pgHost.clientWidth;
      M.pgFit = available > 0 && stageW > available ? Math.max(0.55, available / stageW) : 1;
      M.pgScale = Math.max(0.25, M.pgFit * M.pgZoomMul);
      M.pgApplyTransform();
      M.pgFrame.style.height = Math.max(320, Math.ceil(stageH * M.pgFit)) + 'px';

      var defs = M.pgSvg('defs');
      var marker = M.pgSvg('marker', {
        id: 'pg-arrow-' + M.pgUid,
        viewBox: '0 0 10 10',
        refX: '9',
        refY: '5',
        markerWidth: '9',
        markerHeight: '9',
        markerUnits: 'userSpaceOnUse',
        orient: 'auto-start-reverse'
      });
      marker.appendChild(M.pgSvg('path', { d: 'M0 1 L10 5 L0 9 z', class: 'tg-arrowhead tg-kind-flow' }));
      defs.appendChild(marker);
      M.pgWires.appendChild(defs);

      var editable = !!M.onPlacesChange;
      for (var i = 0; i < stops.length - 1; i++) {
        (function (idx) {
          var a = shifted[idx];
          var b = shifted[idx + 1];
          if (!a || !b) return;
          var route = M.pgRouteLink(a, b);
          var group = M.pgSvg('g', { class: 'tg-wire-group tg-kind-flow' });
          group.appendChild(M.pgSvg('path', { d: route.d, class: 'tg-wire-glow' }));
          group.appendChild(
            M.pgSvg('path', {
              d: route.d,
              class: 'tg-wire',
              'marker-end': 'url(#pg-arrow-' + M.pgUid + ')'
            })
          );
          var hit = M.pgSvg('path', { d: route.d, class: 'tg-wire-hit' });
          group.appendChild(hit);
          M.pgWires.appendChild(group);
          if (!editable) return;
          var pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'tg-pill tg-kind-flow pg-pill';
          pill.style.left = route.mx + 'px';
          pill.style.top = route.my + 'px';
          pill.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i>';
          pill.title = 'Ajouter un lieu ici';
          pill.setAttribute('aria-label', 'Ajouter un lieu entre ces deux lieux');
          var open = function (event) {
            event.preventDefault();
            event.stopPropagation();
            M.pgOpenInsert(idx + 1, { x: route.mx, y: route.my + 16 });
          };
          pill.addEventListener('click', open);
          hit.addEventListener('click', open);
          M.pgPills.appendChild(pill);
        })(i);
      }

      // Toolbar
      var dirs = stops.map(function (s) {
        return M.findDirectoryPlace(s.ref);
      });
      var itin =
        stops.length >= 2 &&
        dirs.every(Boolean) &&
        global.Places &&
        typeof global.Places.directionsUrl === 'function'
          ? global.Places.directionsUrl(dirs)
          : '';
      M.pgItinBtn.hidden = !itin;
      if (itin) M.pgItinBtn.href = itin;

      // Popovers: place editor under its node, or the "add a stop" picker.
      M.pgEditor.hidden = true;
      M.pgEditor.replaceChildren();
      M.pgPop.hidden = true;
      M.pgPop.replaceChildren();
      var editMatch = /^stop:(\d+)$/.exec(M.placeEditKey);
      var insMatch = /^ins:(\d+)$/.exec(M.placesPickerSlot);
      var repMatch = /^rep:(\d+)$/.exec(M.placesPickerSlot);
      if (editMatch && M.onPlaceDirectorySave && stops[Number(editMatch[1])]) {
        var ei = Number(editMatch[1]);
        var eb = shifted[ei];
        M.pgEditor.hidden = false;
        M.pgEditor.appendChild(M.buildPlaceEditor(stops[ei].ref));
        if (eb) M.pgPlacePopover(M.pgEditor, eb.x + eb.w / 2, eb.y + eb.h + 8, 300);
      } else if (repMatch && editable && shifted[Number(repMatch[1])]) {
        var rb = shifted[Number(repMatch[1])];
        M.pgPop.hidden = false;
        M.pgPop.appendChild(M.buildPlacesPicker(M.placesPickerSlot));
        M.pgPlacePopover(M.pgPop, rb.x + rb.w / 2, rb.y + rb.h + 8, 272);
      } else if (insMatch && editable) {
        M.pgPop.hidden = false;
        M.pgPop.appendChild(M.buildPlacesPicker(M.placesPickerSlot));
        var pt = M.pgPickPoint;
        if (!pt) {
          var lastBox = shifted[shifted.length - 1];
          pt = lastBox
            ? { x: lastBox.x + lastBox.w / 2, y: lastBox.y + lastBox.h + 24 }
            : { x: stageW / 2, y: 24 };
        }
        M.pgPlacePopover(M.pgPop, pt.x, pt.y, 272);
      }
    };
    M.renderPlaceChips = function renderPlaceChips(stops) {
      var wrap = document.createElement('div');
      wrap.className = 'info-route-chips';
      stops.forEach(function (stop, i) {
        if (i > 0) {
          var sep = document.createElement('i');
          sep.className = 'ti ti-arrow-narrow-right info-route-sep';
          sep.setAttribute('aria-hidden', 'true');
          wrap.appendChild(sep);
        }
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'info-route-chip is-' + stop.key;
        var name = M.placeDisplayName(stop.ref);
        chip.title =
          M.PLACE_STOP_LABELS[stop.key] +
          ' : ' +
          name +
          (stop.ref.do ? ' — ' + stop.ref.do : '') +
          ' (voir le détail)';
        chip.style.setProperty('--tg-hue', String(M.tgHue(String(stop.ref.id || name))));
        var dot = document.createElement('span');
        dot.className = 'info-route-chip-dot';
        chip.appendChild(dot);
        var text = document.createElement('span');
        text.className = 'info-route-chip-name';
        text.textContent = name;
        chip.appendChild(text);
        if (stops.length > 1) {
          var kind = document.createElement('span');
          kind.className = 'info-route-chip-kind';
          kind.textContent = M.PLACE_STOP_LABELS[stop.key];
          chip.appendChild(kind);
        }
        chip.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.pgSetExpanded(true);
        });
        wrap.appendChild(chip);
      });
      return wrap;
    };
    M.renderPlaces = function renderPlaces() {
      M.placesRouteEl.replaceChildren();
      var map = S.normalizePlaces(M.cardPlaces);
      var stops = M.pgStops(map);
      var editable = !!M.onPlacesChange;

      if (!stops.length) {
        M.pgHost.hidden = true;
        M.pgExpanded = false;
        M.placesRouteEl.hidden = false;
        // Empty: choose the shape of the task first.
        if (!editable) {
          var none = document.createElement('span');
          none.className = 'info-route-empty-text';
          none.textContent = 'Aucun lieu';
          M.placesRouteEl.appendChild(none);
          return;
        }
        var choose = document.createElement('div');
        choose.className = 'info-route-choose';
        [
          ['at', 'ti-map-pin', 'Un lieu', 'La tâche se fait à un endroit'],
          ['from', 'ti-route', 'Un trajet', 'Départ, étapes, arrivée']
        ].forEach(function (spec) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'info-route-choose-btn';
          b.disabled = M.placesBusy;
          b.title = spec[3];
          b.setAttribute(
            'aria-expanded',
            M.placesPickerSlot === spec[0] ? 'true' : 'false'
          );
          b.innerHTML = '<i class="ti ' + spec[1] + '" aria-hidden="true"></i>';
          var t = document.createElement('span');
          t.textContent = spec[2];
          b.appendChild(t);
          if (M.placesPickerSlot === spec[0]) b.classList.add('is-open');
          b.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            M.setPlacesPickerOpen(M.placesPickerSlot === spec[0] ? '' : spec[0]);
          });
          choose.appendChild(b);
        });
        M.placesRouteEl.appendChild(choose);
        if (M.placesPickerSlot === 'at' || M.placesPickerSlot === 'from') {
          M.placesRouteEl.appendChild(M.buildPlacesPicker(M.placesPickerSlot));
        }
        return;
      }

      if (M.pgExpanded) {
        M.placesRouteEl.hidden = true;
        M.pgHost.hidden = false;
        M.renderPlaceGraph(stops);
      } else {
        M.pgHost.hidden = true;
        M.placesRouteEl.hidden = false;
        M.placesRouteEl.appendChild(M.renderPlaceChips(stops));
      }
    };
    M.renderPlacesPicker = function renderPlacesPicker() {
      M.renderPlaces();
    };
    M.addCustomAssigneeFromPicker = function addCustomAssigneeFromPicker() {
      if (M.membersBusy || !M.onCustomAssigneesChange) return;
      var nameInput = M.membersPicker.querySelector('.info-members-create-input');
      var linkSelect = M.membersPicker.querySelector('.info-members-create-link');
      var name = nameInput && typeof nameInput.value === 'string'
        ? nameInput.value.trim()
        : '';
      var linkId =
        linkSelect && typeof linkSelect.value === 'string'
          ? linkSelect.value.trim()
          : '';
      if (!name) {
        M.setMembersStatus('Nom invalide', 'error');
        return;
      }
      var nameKey = name.toLocaleLowerCase('fr-FR');
      for (var i = 0; i < M.customAssignees.length; i++) {
        if (M.customAssignees[i].name.toLocaleLowerCase('fr-FR') === nameKey) {
          M.setMembersStatus('Cette personne existe d\u00e9j\u00e0', 'error');
          return;
        }
      }

      var catalogHit = S.findCustomAssigneeCatalogByName(name);
      var draft = catalogHit
        ? S.normalizeCustomAssigneeEntry({
            id: catalogHit.id,
            name: catalogHit.name,
            trelloMemberId: linkId || catalogHit.trelloMemberId || ''
          })
        : S.createCustomAssignee({
            name: name,
            trelloMemberId: linkId || ''
          });
      if (!draft) {
        M.setMembersStatus('Nom invalide', 'error');
        return;
      }

      var ensureCatalog = function () {
        var before = S.getCustomAssigneeCatalog();
        var upserted = S.upsertCustomAssigneeCatalog(draft);
        if (!upserted) {
          M.setMembersStatus('Catalogue plein', 'error');
          return Promise.resolve({ ok: false });
        }
        draft = upserted;
        var after = S.getCustomAssigneeCatalog();
        var changed =
          JSON.stringify(before) !== JSON.stringify(after);
        if (!changed) {
          return Promise.resolve({ ok: true, changed: false });
        }
        return M.persistCustomAssigneeCatalog(after);
      };

      ensureCatalog().then(function (result) {
        if (result && result.ok === false) {
          if (!M.membersStatus.textContent) {
            M.setMembersStatus('\u00c9chec de l\u2019enregistrement', 'error');
          }
          return;
        }
        M.persistCustomAssignees(M.customAssignees.concat([draft]));
      });
    };
    M.addCatalogAssigneeFromPicker = function addCatalogAssigneeFromPicker(entry) {
      if (M.membersBusy || !M.onCustomAssigneesChange || !entry || !entry.id) return;
      var id = String(entry.id);
      for (var i = 0; i < M.customAssignees.length; i++) {
        if (M.customAssignees[i] && String(M.customAssignees[i].id) === id) {
          M.setMembersStatus('Cette personne existe d\u00e9j\u00e0', 'error');
          return;
        }
      }
      var draft = S.normalizeCustomAssigneeEntry(entry);
      if (!draft) return;
      return M.persistCustomAssignees(M.customAssignees.concat([draft]));
    };
    M.renderMembersPicker = function renderMembersPicker() {
      M.membersPicker.replaceChildren();
      var available = M.availableBoardMembers();

      var list = document.createElement('div');
      list.className = 'info-members-picker-list';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', 'Membres du tableau');

      if (!available.length) {
        if (!M.boardMembers.length) {
          var empty = document.createElement('div');
          empty.className = 'info-members-picker-empty';
          empty.textContent = 'Aucun membre Trello sur ce tableau';
          list.appendChild(empty);
        }
      } else {
        available.forEach(function (member) {
          var name = M.memberDisplayName(member) || 'Membre';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-members-picker-option';
          btn.setAttribute('role', 'option');
          btn.title = name;
          btn.disabled = M.membersBusy;
          btn.dataset.memberId = String(member.id);

          M.appendMemberAvatar(btn, member);

          var text = document.createElement('span');
          text.className = 'info-members-picker-option-text';
          text.textContent = name;

          btn.appendChild(text);
          btn.addEventListener('click', function () {
            M.addMemberFromPicker(member);
          });
          list.appendChild(btn);
        });
      }
      M.membersPicker.appendChild(list);

      if (M.onCustomAssigneesChange) {
        var catalogAvailable = M.availableCatalogAssignees();
        var horsWrap = document.createElement('div');
        horsWrap.className = 'info-members-create';

        if (catalogAvailable.length) {
          var horsList = document.createElement('div');
          horsList.className = 'info-members-picker-list';
          horsList.setAttribute('role', 'group');
          horsList.setAttribute('aria-label', 'Personnes hors Trello');
          catalogAvailable.forEach(function (entry) {
            var display = S.customAssigneeToMember(entry, M.boardMembers);
            var name =
              (display && M.memberDisplayName(display)) || entry.name || 'Personne';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'info-members-picker-option';
            btn.setAttribute('role', 'option');
            btn.title = name;
            btn.disabled = M.membersBusy;
            btn.dataset.personId = String(entry.id);
            if (display) M.appendMemberAvatar(btn, display);
            var text = document.createElement('span');
            text.className = 'info-members-picker-option-text';
            text.textContent = name;
            var badge = document.createElement('span');
            badge.className = 'info-member-custom-badge';
            badge.textContent = 'hors Trello';
            btn.appendChild(text);
            btn.appendChild(badge);
            btn.addEventListener('click', function () {
              M.addCatalogAssigneeFromPicker(entry);
            });
            horsList.appendChild(btn);
          });
          horsWrap.appendChild(horsList);
        } else if (S.getCustomAssigneeCatalog().length) {
          var horsEmpty = document.createElement('div');
          horsEmpty.className = 'info-members-picker-empty';
          horsEmpty.textContent =
            'Toutes les personnes hors Trello sont d\u00e9j\u00e0 assign\u00e9es';
          horsWrap.appendChild(horsEmpty);
        }

        var createTitle = document.createElement('div');
        createTitle.className = 'info-members-create-title';
        createTitle.textContent = 'Nouvelle personne';
        horsWrap.appendChild(createTitle);

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'info-members-create-input';
        nameInput.placeholder = 'Nom (ex. freelances, client\u2026)';
        nameInput.maxLength = S.MAX_CUSTOM_ASSIGNEE_NAME_LEN;
        nameInput.setAttribute('aria-label', 'Nom de la personne');
        nameInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        nameInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            M.addCustomAssigneeFromPicker();
          }
        });

        var linkSelect = document.createElement('select');
        linkSelect.className = 'info-members-create-link';
        linkSelect.setAttribute(
          'aria-label',
          'Lier \u00e0 un membre Trello (optionnel)'
        );
        linkSelect.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        var optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = 'Sans lien Trello';
        linkSelect.appendChild(optNone);
        M.boardMembers.forEach(function (member) {
          if (!member || !member.id) return;
          var opt = document.createElement('option');
          opt.value = String(member.id);
          opt.textContent =
            'Lier\u00a0: ' + (M.memberDisplayName(member) || member.id);
          linkSelect.appendChild(opt);
        });

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'info-members-create-btn';
        createBtn.textContent = 'Cr\u00e9er';
        createBtn.disabled = M.membersBusy;
        createBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          M.addCustomAssigneeFromPicker();
        });

        horsWrap.appendChild(nameInput);
        horsWrap.appendChild(linkSelect);
        horsWrap.appendChild(createBtn);
        M.membersPicker.appendChild(horsWrap);
      }
    };
    M.rolesForMember = function rolesForMember(memberId) {
      var id = memberId != null ? String(memberId) : '';
      return id && M.memberRoles[id] ? M.memberRoles[id].slice() : [];
    };
    M.cloneMemberRolesMap = function cloneMemberRolesMap() {
      return S.normalizeMemberRoles(M.memberRoles);
    };
    M.persistMemberRoles = function persistMemberRoles(nextMap, nextCustoms) {
      var map = S.normalizeMemberRoles(nextMap);
      var customs = S.pruneMemberRoleCustoms(
        nextCustoms != null ? nextCustoms : S.getMemberRoleCustoms(),
        map
      );
      S.setMemberRoleCustoms(customs);
      M.memberRoles = map;
      if (!M.onMemberRolesChange) {
        M.renderMembers();
        M.onLayoutChange();
        return Promise.resolve({ ok: true, changed: false });
      }
      M.memberRolesBusy = true;
      M.setMembersStatus('', 'saving');
      M.renderMembers();
      return Promise.resolve(M.onMemberRolesChange(map, customs))
        .then(function (result) {
          M.memberRolesBusy = false;
          if (result && result.ok === false) {
            M.setMembersStatus('\u00c9chec des r\u00f4les', 'error');
            M.renderMembers();
            M.onLayoutChange();
            return result;
          }
          if (result && result.memberRoles) {
            M.memberRoles = S.normalizeMemberRoles(result.memberRoles);
          }
          if (result && result.memberRoleCustoms) {
            S.setMemberRoleCustoms(result.memberRoleCustoms);
          }
          M.setMembersStatus('', 'ok');
          // Keep the picker open so the user can toggle several roles.
          M.renderMembers();
          setTimeout(function () {
            if (M.membersStatus.classList.contains('is-ok')) {
              M.setMembersStatus('');
            }
          }, 1400);
          M.onLayoutChange();
          return result || { ok: true, changed: true };
        })
        .catch(function (err) {
          M.memberRolesBusy = false;
          console.error('Info member roles save failed', err);
          M.setMembersStatus('\u00c9chec des r\u00f4les', 'error');
          M.renderMembers();
          M.onLayoutChange();
        });
    };
    M.setMemberRolesPickerOpen = function setMemberRolesPickerOpen(memberId) {
      var id = memberId != null ? String(memberId).trim() : '';
      M.memberRolesPickerMemberId = id;
      M.memberRolesPickerHost.hidden = !id;
      if (id) M.renderMemberRolesPicker(id);
      M.tgPlaceRolesPicker();
      M.onLayoutChange();
    };
    M.renderMemberRolesPicker = function renderMemberRolesPicker(memberId) {
      M.memberRolesPicker.replaceChildren();
      var assigned = Object.create(null);
      var current = M.rolesForMember(memberId);
      for (var a = 0; a < current.length; a++) assigned[current[a]] = true;

      var heading = document.createElement('div');
      heading.className = 'info-member-roles-picker-heading';
      var member = null;
      for (var mi = 0; mi < M.members.length; mi++) {
        if (M.members[mi] && String(M.members[mi].id) === String(memberId)) {
          member = M.members[mi];
          break;
        }
      }
      var memberName = M.memberDisplayName(member) || 'Membre';
      heading.textContent = 'R\u00f4les\u00a0: ' + memberName;
      M.memberRolesPicker.appendChild(heading);

      var list = document.createElement('div');
      list.className = 'info-member-roles-picker-list';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', 'R\u00f4les de ' + memberName);

      var catalog = S.getMemberRoleCatalog().concat(S.getMemberRoleCustoms());
      var seen = Object.create(null);
      var entries = [];
      for (var c = 0; c < catalog.length; c++) {
        var entry = catalog[c];
        if (!entry || !entry.id || seen[entry.id]) continue;
        seen[entry.id] = true;
        entries.push(entry);
      }
      // Keep assigned orphans visible even if dropped from catalog.
      for (var r = 0; r < current.length; r++) {
        if (seen[current[r]]) continue;
        var orphan = S.getMemberRoleEntry(current[r]);
        if (orphan) {
          seen[orphan.id] = true;
          entries.push(orphan);
        }
      }

      if (!entries.length) {
        var empty = document.createElement('div');
        empty.className = 'info-member-roles-picker-empty';
        empty.textContent = 'Aucun r\u00f4le dans le catalogue';
        list.appendChild(empty);
      } else {
        entries.forEach(function (entry) {
          var isOn = !!assigned[entry.id];
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'info-member-roles-picker-option' + (isOn ? ' is-selected' : '');
          btn.setAttribute('role', 'option');
          btn.setAttribute('aria-selected', isOn ? 'true' : 'false');
          btn.title = isOn
            ? 'Retirer\u00a0: ' + entry.label
            : 'Ajouter\u00a0: ' + entry.label;
          btn.disabled = M.memberRolesBusy;
          var check = document.createElement('i');
          check.className =
            'ti ' + (isOn ? 'ti-square-check-filled' : 'ti-square') +
            ' info-member-roles-picker-check';
          check.setAttribute('aria-hidden', 'true');
          var icon = document.createElement('i');
          icon.className = 'ti ti-' + (entry.icon || 'tag');
          icon.setAttribute('aria-hidden', 'true');
          var text = document.createElement('span');
          text.textContent = entry.label;
          btn.appendChild(check);
          btn.appendChild(icon);
          btn.appendChild(text);
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (isOn) M.removeRoleFromMember(memberId, entry.id);
            else M.addRoleToMember(memberId, entry.id);
          });
          list.appendChild(btn);
        });
      }
      M.memberRolesPicker.appendChild(list);

      if (M.onMemberRolesChange) {
        var createWrap = document.createElement('div');
        createWrap.className = 'info-member-roles-create';
        var createRow = document.createElement('div');
        createRow.className = 'info-member-roles-create-row';
        var createInput = document.createElement('input');
        createInput.type = 'text';
        createInput.className = 'info-member-roles-create-input';
        createInput.placeholder = 'Nouveau r\u00f4le (cette carte)';
        createInput.maxLength = S.MAX_MEMBER_ROLE_LABEL_LEN;
        createInput.setAttribute('aria-label', 'Cr\u00e9er un r\u00f4le pour cette carte');
        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'info-member-roles-create-btn';
        createBtn.textContent = 'Ajouter';
        createBtn.disabled = M.memberRolesBusy;

        function submitCreate() {
          if (M.memberRolesBusy) return;
          var draft = S.createCustomMemberRole(
            { label: createInput.value },
            { apply: true }
          );
          if (!draft) {
            M.setMembersStatus('R\u00f4le invalide ou doublon', 'error');
            return;
          }
          var map = M.cloneMemberRolesMap();
          var mid = String(memberId);
          var roles = S.normalizeMemberRoleIds((map[mid] || []).concat([draft.id]));
          if (roles.length) map[mid] = roles;
          M.persistMemberRoles(map, S.getMemberRoleCustoms());
        }

        createBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          submitCreate();
        });
        createInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            submitCreate();
          }
        });
        createInput.addEventListener('click', function (event) {
          event.stopPropagation();
        });
        createRow.appendChild(createInput);
        createRow.appendChild(createBtn);
        createWrap.appendChild(createRow);
        M.memberRolesPicker.appendChild(createWrap);
      }
    };
    M.toggleMemberRolesPicker = function toggleMemberRolesPicker(memberId) {
      var mid = memberId != null ? String(memberId).trim() : '';
      if (!mid || !M.onMemberRolesChange || M.memberRolesBusy) return;
      if (M.memberRolesPickerMemberId === mid) {
        M.setMemberRolesPickerOpen('');
      } else {
        M.setMemberRolesPickerOpen(mid);
      }
    };
    M.addRoleToMember = function addRoleToMember(memberId, roleId) {
      if (!roleId || M.memberRolesBusy) return;
      var map = M.cloneMemberRolesMap();
      var mid = String(memberId);
      var roles = S.normalizeMemberRoleIds((map[mid] || []).concat([roleId]));
      if (roles.length) map[mid] = roles;
      else delete map[mid];
      M.persistMemberRoles(map);
    };
    M.removeRoleFromMember = function removeRoleFromMember(memberId, roleId) {
      if (!roleId || M.memberRolesBusy) return;
      var map = M.cloneMemberRolesMap();
      var mid = String(memberId);
      var roles = (map[mid] || []).filter(function (id) {
        return id !== roleId;
      });
      if (roles.length) map[mid] = roles;
      else delete map[mid];
      M.persistMemberRoles(map);
    };
    M.tgSavePositions = function tgSavePositions() {
      try {
        localStorage.setItem(M.TG_POS_KEY, JSON.stringify(M.tgPositions));
      } catch (err) {
        /* optional */
      }
    };
    M.tgSnap = function tgSnap(v) {
      return Math.round(v / M.TG_GRID) * M.TG_GRID;
    };
    M.tgApplyTransform = function tgApplyTransform() {
      var moved = M.tgPan.x || M.tgPan.y;
      M.tgStage.style.transform =
        M.tgScale === 1 && !moved
          ? ''
          : 'translate(' + M.tgPan.x + 'px,' + M.tgPan.y + 'px) scale(' + M.tgScale + ')';
      M.tgPlaceRolesPicker();
      // Miro-like canvas: the dot grid scales and pans with the content.
      var step = 18 * M.tgScale;
      while (step < 9) step *= 2;
      M.tgHost.style.backgroundSize = step + 'px ' + step + 'px';
      M.tgHost.style.backgroundPosition =
        Math.round(M.tgStage.offsetLeft + M.tgPan.x - step / 2) + 'px ' + Math.round(M.tgPan.y - step / 2) + 'px';
    };
    M.tgZoomBy = function tgZoomBy(factor, px, py) {
      var nextMul = Math.max(0.2, Math.min(3, M.tgZoomMul * factor));
      var nextScale = Math.max(0.25, M.tgFit * nextMul);
      if (Math.abs(nextScale - M.tgScale) < 0.001) return;
      var ox = M.tgStage.offsetLeft;
      var sx = (px - ox - M.tgPan.x) / M.tgScale;
      var sy = (py - M.tgPan.y) / M.tgScale;
      M.tgZoomMul = nextMul;
      M.tgScale = nextScale;
      M.tgPan.x = Math.round(px - ox - sx * M.tgScale);
      M.tgPan.y = Math.round(py - sy * M.tgScale);
      M.tgApplyTransform();
    };
    M.tgEndMove = function tgEndMove(e) {
      var m = M.tgMoving;
      if (!m || (e && e.pointerId !== m.pid)) return;
      M.tgMoving = null;
      M.tgHost.classList.remove('is-moving');
      if (m.moved) {
        M.tgSavePositions();
        M.tgIgnoreClickUntil = Date.now() + 400;
        M.renderTeamGraph();
      }
    };
    M.tgApplyFrameHeight = function tgApplyFrameHeight() {
      M.tgFrame.style.height = Math.max(M.tgAutoH, M.tgCanvasH, 320) + 'px';
      M.tgExpandBtn.innerHTML =
        '<i class="ti ' + (M.tgCanvasH ? 'ti-arrows-minimize' : 'ti-arrows-maximize') + '" aria-hidden="true"></i>';
      M.tgExpandBtn.title = M.tgCanvasH ? 'R\u00e9duire la hauteur' : 'Agrandir la hauteur';
    };
    M.tgPlaceRolesPicker = function tgPlaceRolesPicker() {
      var mid = M.memberRolesPickerMemberId;
      var box = mid && !M.memberRolesPickerHost.hidden && !M.tgHost.hidden && M.tgLayout && M.tgLayout.nodes[mid];
      if (!box) {
        if (M.memberRolesPickerHost.parentNode !== M.membersWrap) M.membersWrap.appendChild(M.memberRolesPickerHost);
        M.memberRolesPickerHost.classList.remove('is-in-graph');
        M.memberRolesPickerHost.style.left = '';
        M.memberRolesPickerHost.style.top = '';
        M.memberRolesPickerHost.style.width = '';
        if (M.tgEditor.hidden) M.tgFrame.style.minHeight = '';
        return;
      }
      if (M.memberRolesPickerHost.parentNode !== M.tgFrame) M.tgFrame.appendChild(M.memberRolesPickerHost);
      M.memberRolesPickerHost.classList.add('is-in-graph');
      var hostW = M.tgHost.clientWidth || 320;
      var w = Math.min(280, hostW);
      M.memberRolesPickerHost.style.width = w + 'px';
      var left = M.tgStage.offsetLeft + M.tgPan.x + box.x * M.tgScale;
      M.memberRolesPickerHost.style.left = Math.max(0, Math.min(left, hostW - w)) + 'px';
      var top = Math.max(0, Math.round(M.tgPan.y + (box.y + box.h) * M.tgScale + 6));
      M.memberRolesPickerHost.style.top = top + 'px';
      M.tgFrame.style.minHeight = top + M.memberRolesPickerHost.offsetHeight + 8 + 'px';
    };
    },
    run: function (M) {
    M.pgHost.addEventListener('click', function (event) {
      if (Date.now() < M.pgIgnoreUntil || event.target.closest('.tg-edge')) return;
      if (
        !event.target.closest('.tg-editor') &&
        !event.target.closest('.tg-pill') &&
        !event.target.closest('.tg-wire-hit') &&
        !event.target.closest('.pg-node-name')
      ) {
        if (M.placeEditKey || /^(ins|rep):/.test(M.placesPickerSlot)) {
          M.placeEditKey = '';
          if (/^(ins|rep):/.test(M.placesPickerSlot)) M.placesPickerSlot = '';
          M.renderPlaces();
          M.onLayoutChange();
        }
      }
    });
    M.pgHost.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && (M.placeEditKey || /^(ins|rep):/.test(M.placesPickerSlot))) {
        M.placeEditKey = '';
        if (/^(ins|rep):/.test(M.placesPickerSlot)) M.placesPickerSlot = '';
        M.renderPlaces();
        M.onLayoutChange();
      }
    });
    if (typeof global.ResizeObserver === 'function') {
      M.pgLastWidth = 0;
      new global.ResizeObserver(function () {
        var w = M.pgHost.clientWidth;
        if (Math.abs(w - M.pgLastWidth) < 2) return;
        M.pgLastWidth = w;
        if (M.pgExpanded && !M.pgHost.hidden) {
          M.renderPlaces();
          M.onLayoutChange();
        }
      }).observe(M.pgHost);
    }
    M.renderPlaces();
    M.TG_NODE_W = 210;
    M.TG_PAD = 20;
    M.TG_KIND_META = {
      asks: { icon: 'ti-arrow-down', label: 'Demande', verb: 'demande à' },
      flow: { icon: 'ti-arrow-right', label: 'Enchaîne', verb: 'passe le relais à' },
      both: { icon: 'ti-arrows-exchange', label: 'Collaboration', verb: 'collabore avec' }
    };
    M.tgUid = ++S.S.teamGraphInstances;
    M.tgSelectedKey = '';
    M.tgPending = null;
    M.tgScale = 1;
    M.tgFit = 1;
    M.tgAutoH = 0;
    M.TG_GRID = 18;
    M.TG_POS_KEY = 'tp-tg-node-pos';
    M.tgMoving = null;
    M.tgPositions = (function () {
      try {
        var raw = typeof localStorage !== 'undefined' && localStorage.getItem(M.TG_POS_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        return {};
      }
    })();
    M.tgCanvasH = 0;
    M.tgZoomMul = 1;
    M.tgLayout = null;
    M.tgDrag = null;
    M.tgExpanded = false;
    M.tgIgnoreClickUntil = 0;
    M.tgPan = { x: 0, y: 0 };
    M.tgFrame.addEventListener(
      'wheel',
      function (event) {
        if (event.target.closest('.tg-editor, .tg-create, .info-member-roles-picker-host')) return;
        if (!(event.ctrlKey || event.metaKey || M.tgExpanded)) return;
        event.preventDefault();
        var rect = M.tgFrame.getBoundingClientRect();
        M.tgZoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
      },
      { passive: false }
    );
    M.tgZoomOutBtn.addEventListener('click', function (event) {
      event.preventDefault();
      M.tgZoomBy(0.8, M.tgHost.clientWidth / 2, M.tgFrame.clientHeight / 2);
    });
    M.tgZoomInBtn.addEventListener('click', function (event) {
      event.preventDefault();
      M.tgZoomBy(1.25, M.tgHost.clientWidth / 2, M.tgFrame.clientHeight / 2);
    });
    M.tgFrame.addEventListener('pointermove', function (e) {
      var m = M.tgMoving;
      if (!m || e.pointerId !== m.pid) return;
      var dx = e.clientX - m.sx;
      var dy = e.clientY - m.sy;
      if (!m.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!m.moved) {
        m.moved = true;
        M.tgHost.classList.add('is-moving');
        M.tgCloseEditor();
      }
      M.tgPositions[m.id] = { x: M.tgSnap(m.x0 + dx / M.tgScale), y: M.tgSnap(m.y0 + dy / M.tgScale) };
      if (!m.raf) {
        m.raf = requestAnimationFrame(function () {
          m.raf = 0;
          M.renderTeamGraph();
        });
      }
    });
    M.tgFrame.addEventListener('pointerup', M.tgEndMove);
    M.tgFrame.addEventListener('pointercancel', M.tgEndMove);
    M.tgExpandBtn.addEventListener('click', function (event) {
      event.preventDefault();
      M.tgCanvasH = M.tgCanvasH ? 0 : Math.max(360, Math.round(window.innerHeight * 0.75));
      M.tgApplyFrameHeight();
      M.onLayoutChange();
    });
    M.tgResizeHandle.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      var startY = event.clientY;
      var startH = M.tgFrame.clientHeight;
      try {
        M.tgResizeHandle.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
      var move = function (e) {
        M.tgCanvasH = Math.round(Math.max(160, Math.min(1400, startH + e.clientY - startY)));
        M.tgApplyFrameHeight();
        M.onLayoutChange();
      };
      var end = function () {
        M.tgResizeHandle.removeEventListener('pointermove', move);
        M.tgResizeHandle.removeEventListener('pointerup', end);
        M.tgResizeHandle.removeEventListener('pointercancel', end);
      };
      M.tgResizeHandle.addEventListener('pointermove', move);
      M.tgResizeHandle.addEventListener('pointerup', end);
      M.tgResizeHandle.addEventListener('pointercancel', end);
    });
    M.tgFrame.addEventListener('mousedown', function (event) {
      if (event.button === 1 && !event.target.closest('.tg-editor, .tg-create, .info-member-roles-picker-host')) {
        event.preventDefault(); // no Windows autoscroll cursor
      }
    });
    }
  });
})(typeof window !== 'undefined' ? window : this);
