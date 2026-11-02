/**
 * priority-ui-info-field: createInfoField() part 3 of 8.
 * The body of createInfoField runs in order across these parts; its locals live on the per-call state object (M).
 * Order and shared names: see priority-ui-info-field.parts.json and docs/architecture.md.
 */
(function (global) {
  'use strict';

  var S = (global.PriorityUIParts = global.PriorityUIParts || {});
  var P = (global.PriorityUIPartsMountCreateInfoField = global.PriorityUIPartsMountCreateInfoField || { list: [] });

  P.list.push({
    define: function (M) {
    M.persistPlaces = function persistPlaces(nextPlaces) {
      var map = S.normalizePlaces(nextPlaces);
      M.cardPlaces = map;
      if (!M.onPlacesChange) {
        M.renderPlaces();
        M.onLayoutChange();
        return Promise.resolve({ ok: true, changed: false, places: map });
      }
      M.placesBusy = true;
      M.setPlacesStatus('', 'saving');
      M.renderPlaces();
      return Promise.resolve(M.onPlacesChange(map))
        .then(function (result) {
          M.placesBusy = false;
          if (result && result.ok === false) {
            M.setPlacesStatus('Échec de l’enregistrement', 'error');
            M.renderPlaces();
            M.onLayoutChange();
            return result;
          }
          if (result && result.places) {
            M.cardPlaces = S.normalizePlaces(result.places);
          }
          M.setPlacesStatus('', 'ok');
          M.placesPickerSlot = '';
          M.renderPlaces();
          setTimeout(function () {
            if (M.placesStatus.classList.contains('is-ok')) {
              M.setPlacesStatus('');
            }
          }, 1400);
          M.onLayoutChange();
          return result || { ok: true, changed: true, places: map };
        })
        .catch(function (err) {
          M.placesBusy = false;
          console.error('Info places save failed', err);
          M.setPlacesStatus('Échec de l’enregistrement', 'error');
          M.renderPlaces();
          M.onLayoutChange();
        });
    };
    M.placeDirectoryList = function placeDirectoryList() {
      if (!M.getPlaceDirectory) return [];
      try {
        var list = M.getPlaceDirectory();
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    };
    M.foldPlaceText = function foldPlaceText(s) {
      return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLocaleLowerCase('fr-FR')
        .trim();
    };
    M.findDirectoryPlace = function findDirectoryPlace(ref) {
      if (!ref) return null;
      var list = M.placeDirectoryList();
      var i;
      for (i = 0; i < list.length; i++) {
        if (ref.id && list[i].id === ref.id) return list[i];
      }
      var key = M.foldPlaceText(ref.name);
      for (i = 0; i < list.length; i++) {
        if (key && M.foldPlaceText(list[i].name) === key) return list[i];
      }
      return null;
    };
    M.placeDisplayName = function placeDisplayName(ref) {
      var dir = M.findDirectoryPlace(ref);
      if (dir && dir.name) return dir.name;
      var cat = ref && ref.id ? S.findPlaceCatalogById(ref.id) : null;
      return (cat && cat.name) || (ref && ref.name) || '';
    };
    M.placeHasGeo = function placeHasGeo(dir) {
      return !!(
        dir &&
        ((typeof dir.lat === 'number' && typeof dir.lng === 'number') ||
          dir.address)
      );
    };
    M.placeMapsHref = function placeMapsHref(ref, dir) {
      if (global.Places && typeof global.Places.mapsUrl === 'function') {
        return global.Places.mapsUrl(
          dir || { name: M.placeDisplayName(ref) }
        );
      }
      return '';
    };
    M.placeTripStops = function placeTripStops(map) {
      var out = [];
      if (map.from) out.push(map.from);
      (map.via || []).forEach(function (r) {
        out.push(r);
      });
      if (map.to) out.push(map.to);
      return out;
    };
    M.placeSeq = function placeSeq(map) {
      var n = S.normalizePlaces(map);
      var out = [];
      if (n.from) out.push(n.from);
      (n.via || []).forEach(function (r) {
        out.push(r);
      });
      if (n.to) out.push(n.to);
      if (n.at) out.push(n.at);
      return out;
    };
    M.placeMapFromSeq = function placeMapFromSeq(refs) {
      var out = {};
      if (!refs.length) return out;
      if (refs.length === 1) {
        out.at = refs[0];
        return out;
      }
      out.from = refs[0];
      out.to = refs[refs.length - 1];
      if (refs.length > 2) out.via = refs.slice(1, -1);
      return out;
    };
    M.placesMutate = function placesMutate(mutator) {
      if (M.placesBusy || !M.onPlacesChange) return Promise.resolve(null);
      var next = S.normalizePlaces(M.cardPlaces);
      if (mutator(next) === false) return Promise.resolve(null);
      return M.persistPlaces(next);
    };
    M.placesMutateSeq = function placesMutateSeq(mutator) {
      if (M.placesBusy || !M.onPlacesChange) return Promise.resolve(null);
      var refs = M.placeSeq(M.cardPlaces).map(function (r) {
        return Object.assign({}, r);
      });
      if (mutator(refs) === false) return Promise.resolve(null);
      return M.persistPlaces(M.placeMapFromSeq(refs));
    };
    M.removePlaceStop = function removePlaceStop(i) {
      M.placeEditKey = '';
      M.placesMutateSeq(function (refs) {
        if (i < 0 || i >= refs.length) return false;
        refs.splice(i, 1);
      });
    };
    M.movePlaceStop = function movePlaceStop(i, delta) {
      M.placeEditKey = '';
      M.placesMutateSeq(function (refs) {
        var j = i + delta;
        if (i < 0 || j < 0 || j >= refs.length) return false;
        var tmp = refs[i];
        refs[i] = refs[j];
        refs[j] = tmp;
      });
    };
    M.setPlaceStopPos = function setPlaceStopPos(i, x, y) {
      M.placesMutateSeq(function (refs) {
        var ref = refs[i];
        if (!ref || (ref.x === x && ref.y === y)) return false;
        ref.x = x;
        ref.y = y;
      });
    };
    M.clearPlacePositions = function clearPlacePositions() {
      M.placesMutateSeq(function (refs) {
        var any = false;
        refs.forEach(function (r) {
          if (r.x != null || r.y != null) any = true;
          delete r.x;
          delete r.y;
        });
        return any;
      });
    };
    M.reorderPlaceStop = function reorderPlaceStop(from, to) {
      M.placeEditKey = '';
      M.placesMutateSeq(function (refs) {
        if (from === to || from < 0 || to < 0 || from >= refs.length || to >= refs.length) {
          return false;
        }
        refs.splice(to, 0, refs.splice(from, 1)[0]);
      });
    };
    M.setPlaceStopAction = function setPlaceStopAction(i, text) {
      var value = String(text || '')
        .trim()
        .slice(0, S.MAX_PLACE_DO_LEN);
      M.placesMutateSeq(function (refs) {
        var ref = refs[i];
        if (!ref || (ref.do || '') === value) return false;
        if (value) ref.do = value;
        else delete ref.do;
      });
    };
    M.assignPlace = function assignPlace(target, entry) {
      if (M.placesBusy || !M.onPlacesChange || !entry || (!entry.id && !entry.name)) {
        return;
      }
      var before = S.getPlaceCatalog();
      var draft = S.upsertPlaceCatalog(entry) || S.normalizePlaceRef(entry);
      if (!draft) return;
      var after = S.getPlaceCatalog();
      var catalogPromise =
        JSON.stringify(before) !== JSON.stringify(after)
          ? M.persistPlaceCatalog(after)
          : Promise.resolve(null);
      catalogPromise.then(function () {
        var ref = { id: draft.id, name: draft.name };
        var swap = /^rep:(\d+)$/.exec(target);
        if (swap) {
          M.placesMutateSeq(function (refs) {
            var idx = Number(swap[1]);
            var prev = refs[idx];
            if (!prev || prev.id === ref.id) return false;
            // Keep what is done there and where the node was placed.
            if (prev.do) ref.do = prev.do;
            if (prev.x != null) ref.x = prev.x;
            if (prev.y != null) ref.y = prev.y;
            refs[idx] = ref;
          });
          return;
        }
        var ins = /^ins:(\d+)$/.exec(target);
        if (ins) {
          M.placesMutateSeq(function (refs) {
            if (refs.length >= 2 + S.MAX_PLACE_VIA) {
              M.setPlacesStatus(
                'Maximum ' + (2 + S.MAX_PLACE_VIA) + ' lieux',
                'error'
              );
              return false;
            }
            refs.splice(Math.min(Number(ins[1]), refs.length), 0, ref);
          });
          return;
        }
        M.placesMutate(function (next) {
          var prev = next[target];
          if (prev && prev.id === ref.id && prev.do) ref.do = prev.do;
          // Empty state: "Un lieu" (at) or the first stop of a trip (from).
          delete next.at;
          delete next.from;
          delete next.to;
          delete next.via;
          next[target] = ref;
        });
      });
    };
    M.pickerCreateOrPick = function pickerCreateOrPick(target, name) {
      var found = S.findPlaceCatalogByName(name);
      M.assignPlace(target, found || { name: name });
    };
    M.buildPlacesPicker = function buildPlacesPicker(target) {
      var panel = document.createElement('div');
      panel.className = 'info-places-picker';
      panel.setAttribute('role', 'listbox');
      panel.setAttribute('aria-label', 'Choisir un lieu');
      panel.addEventListener('click', function (event) {
        event.stopPropagation();
      });

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'info-places-create-input info-places-search';
      input.placeholder = 'Chercher ou créer un lieu…';
      input.setAttribute('aria-label', 'Chercher ou créer un lieu');
      input.maxLength = S.MAX_PLACE_NAME_LEN;
      input.autocomplete = 'off';
      panel.appendChild(input);

      var list = document.createElement('div');
      list.className = 'info-places-picker-list';
      panel.appendChild(list);

      var options = [];
      var active = 0;

      function currentIds() {
        var ids = {};
        M.placeTripStops(M.cardPlaces).forEach(function (r) {
          ids[r.id] = true;
        });
        if (M.cardPlaces.at) ids[M.cardPlaces.at.id] = true;
        return ids;
      }

      function paintActive() {
        options.forEach(function (o, i) {
          o.el.classList.toggle('is-active', i === active);
        });
        if (options[active] && options[active].el.scrollIntoView) {
          options[active].el.scrollIntoView({ block: 'nearest' });
        }
      }

      function refill() {
        list.replaceChildren();
        options = [];
        var q = M.foldPlaceText(input.value);
        var used = currentIds();
        var exact = false;
        S.getPlaceCatalog().forEach(function (entry) {
          var dir = M.findDirectoryPlace(entry);
          var name = (dir && dir.name) || entry.name;
          var hay = M.foldPlaceText(
            name +
              ' ' +
              (dir ? (dir.address || '') + ' ' + (dir.kind || '') + ' ' + (dir.aliases || []).join(' ') : '')
          );
          if (q && hay.indexOf(q) < 0) return;
          if (q && M.foldPlaceText(name) === q) exact = true;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'info-places-picker-option';
          btn.setAttribute('role', 'option');
          btn.disabled = M.placesBusy;
          var icon = document.createElement('i');
          icon.className = 'ti ti-map-pin';
          icon.setAttribute('aria-hidden', 'true');
          var text = document.createElement('span');
          text.className = 'info-places-picker-option-text';
          text.textContent = name;
          btn.appendChild(icon);
          btn.appendChild(text);
          var sub = dir && (dir.address || dir.kind);
          if (sub) {
            var subEl = document.createElement('span');
            subEl.className = 'info-places-picker-option-sub';
            subEl.textContent = sub;
            btn.appendChild(subEl);
          }
          if (M.placeHasGeo(dir) && dir.lat != null) {
            var gpsEl = document.createElement('i');
            gpsEl.className = 'ti ti-current-location info-places-picker-gps';
            gpsEl.title = 'Position GPS enregistrée';
            btn.appendChild(gpsEl);
          }
          if (used[entry.id]) btn.classList.add('is-selected');
          btn.addEventListener('click', function (event) {
            event.preventDefault();
            M.assignPlace(target, entry);
          });
          list.appendChild(btn);
          options.push({ el: btn, run: function () { M.assignPlace(target, entry); } });
        });
        var typed = input.value.trim();
        if (typed && !exact) {
          var create = document.createElement('button');
          create.type = 'button';
          create.className = 'info-places-picker-option info-places-picker-create';
          create.disabled = M.placesBusy;
          create.innerHTML =
            '<i class="ti ti-plus" aria-hidden="true"></i>';
          var label = document.createElement('span');
          label.className = 'info-places-picker-option-text';
          label.textContent = 'Créer « ' + typed + ' »';
          create.appendChild(label);
          create.addEventListener('click', function (event) {
            event.preventDefault();
            M.pickerCreateOrPick(target, typed);
          });
          list.appendChild(create);
          options.push({ el: create, run: function () { M.pickerCreateOrPick(target, typed); } });
        }
        if (!options.length) {
          var empty = document.createElement('p');
          empty.className = 'info-places-picker-empty';
          empty.textContent =
            'Aucun lieu enregistré. Tape un nom pour en créer un.';
          list.appendChild(empty);
        }
        active = Math.min(active, Math.max(0, options.length - 1));
        paintActive();
      }

      input.addEventListener('input', function () {
        active = 0;
        refill();
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!options.length) return;
          active =
            (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
            options.length;
          paintActive();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (options[active]) options[active].run();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          M.setPlacesPickerOpen('');
        }
      });
      refill();
      setTimeout(function () {
        try {
          input.focus();
        } catch (e) {}
      }, 0);
      return panel;
    };
    M.buildPlaceEditor = function buildPlaceEditor(ref) {
      var dir = M.findDirectoryPlace(ref) || {};
      var panel = document.createElement('div');
      panel.className = 'info-place-editor';
      panel.addEventListener('click', function (event) {
        event.stopPropagation();
      });

      function field(label, value, attrs) {
        var wrap = document.createElement('label');
        wrap.className = 'info-place-editor-field';
        var cap = document.createElement('span');
        cap.className = 'info-place-editor-label';
        cap.textContent = label;
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'info-places-create-input';
        inp.value = value || '';
        inp.autocomplete = 'off';
        if (attrs && attrs.placeholder) inp.placeholder = attrs.placeholder;
        if (attrs && attrs.maxLength) inp.maxLength = attrs.maxLength;
        wrap.appendChild(cap);
        wrap.appendChild(inp);
        return { wrap: wrap, input: inp };
      }

      function iconButton(icon, title, label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'info-place-editor-btn';
        b.title = title;
        b.innerHTML = '<i class="ti ' + icon + '" aria-hidden="true"></i>';
        if (label) {
          var t = document.createElement('span');
          t.textContent = label;
          b.appendChild(t);
        }
        return b;
      }

      var startCoords =
        typeof dir.lat === 'number' && typeof dir.lng === 'number'
          ? dir.lat + ', ' + dir.lng
          : '';

      var nameF = field('Nom', M.placeDisplayName(ref), {
        maxLength: S.MAX_PLACE_NAME_LEN
      });
      var kindF = field('Type', dir.kind || '', {
        placeholder: 'maison, travail, chalet…',
        maxLength: 40
      });
      var addrF = field('Adresse', dir.address || '', {
        placeholder: '12 chemin du Lac, Val-d’Or',
        maxLength: 200
      });
      var gpsF = field('Coordonnées GPS', startCoords, {
        placeholder: '48.1189, -77.7828 ou lien Google Maps'
      });
      var notesF = field('Notes', dir.notes || '', {
        placeholder: 'Code de porte, clé, accès…',
        maxLength: 400
      });

      var geoStatus = document.createElement('div');
      geoStatus.className = 'info-place-editor-hint';
      geoStatus.setAttribute('aria-live', 'polite');

      function readGps() {
        var raw = gpsF.input.value.trim();
        if (!raw) return { empty: true };
        var parsed =
          global.Places && global.Places.parseCoordinates
            ? global.Places.parseCoordinates(raw)
            : null;
        return parsed ? { gps: parsed } : { invalid: true };
      }

      function paintGps() {
        var g = readGps();
        geoStatus.classList.remove('is-error', 'is-ok');
        if (g.gps) {
          geoStatus.textContent =
            'Position : ' + g.gps.lat.toFixed(6) + ', ' + g.gps.lng.toFixed(6);
          geoStatus.classList.add('is-ok');
        } else if (g.invalid) {
          geoStatus.textContent =
            'Format non reconnu (ex. : 48.1189, -77.7828)';
          geoStatus.classList.add('is-error');
        } else {
          geoStatus.textContent =
            'L’adresse et le GPS restent privés : ils ne sont pas partagés avec le tableau.';
        }
      }
      gpsF.input.addEventListener('input', paintGps);
      paintGps();

      // GPS helpers
      var gpsTools = document.createElement('div');
      gpsTools.className = 'info-place-editor-tools';
      var locateBtn = iconButton('ti-map-search', 'Trouver les coordonnées de cette adresse (OpenStreetMap)', 'Localiser l’adresse');
      var hereBtn = iconButton('ti-current-location', 'Utiliser ma position actuelle', 'Ma position');
      var openBtn = iconButton('ti-external-link', 'Ouvrir dans Google Maps', 'Voir sur la carte');
      gpsTools.appendChild(locateBtn);
      gpsTools.appendChild(hereBtn);
      gpsTools.appendChild(openBtn);

      function setGpsInput(lat, lng) {
        gpsF.input.value = lat.toFixed(6) + ', ' + lng.toFixed(6);
        paintGps();
      }

      locateBtn.addEventListener('click', function () {
        var q = addrF.input.value.trim() || nameF.input.value.trim();
        if (!q) {
          addrF.input.focus();
          return;
        }
        locateBtn.disabled = true;
        geoStatus.classList.remove('is-error', 'is-ok');
        geoStatus.textContent = 'Recherche…';
        fetch(
          'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
            encodeURIComponent(q),
          { headers: { Accept: 'application/json' } }
        )
          .then(function (res) {
            if (!res.ok) throw new Error('http ' + res.status);
            return res.json();
          })
          .then(function (rows) {
            var hit = Array.isArray(rows) ? rows[0] : null;
            var lat = hit ? parseFloat(hit.lat) : NaN;
            var lng = hit ? parseFloat(hit.lon) : NaN;
            if (!isFinite(lat) || !isFinite(lng)) {
              geoStatus.textContent = 'Adresse introuvable';
              geoStatus.classList.add('is-error');
              return;
            }
            setGpsInput(lat, lng);
          })
          .catch(function () {
            geoStatus.textContent =
              'Recherche indisponible : colle des coordonnées ou un lien Google Maps.';
            geoStatus.classList.add('is-error');
          })
          .then(function () {
            locateBtn.disabled = false;
          });
      });

      hereBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          geoStatus.textContent = 'Géolocalisation indisponible ici';
          geoStatus.classList.add('is-error');
          return;
        }
        hereBtn.disabled = true;
        geoStatus.classList.remove('is-error', 'is-ok');
        geoStatus.textContent = 'Localisation…';
        try {
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              hereBtn.disabled = false;
              setGpsInput(pos.coords.latitude, pos.coords.longitude);
            },
            function () {
              hereBtn.disabled = false;
              geoStatus.textContent =
                'Position refusée ou indisponible : colle des coordonnées ou un lien Google Maps.';
              geoStatus.classList.add('is-error');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        } catch (e) {
          hereBtn.disabled = false;
          geoStatus.textContent = 'Géolocalisation indisponible ici';
          geoStatus.classList.add('is-error');
        }
      });

      openBtn.addEventListener('click', function () {
        var g = readGps();
        var url = '';
        if (global.Places && global.Places.mapsUrl) {
          url = global.Places.mapsUrl({
            name: nameF.input.value.trim(),
            address: addrF.input.value.trim(),
            lat: g.gps ? g.gps.lat : undefined,
            lng: g.gps ? g.gps.lng : undefined
          });
        }
        if (url) window.open(url, '_blank', 'noopener');
      });

      var actions = document.createElement('div');
      actions.className = 'info-place-editor-actions';
      var saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'info-places-create-btn';
      saveBtn.textContent = 'Enregistrer';
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'info-place-editor-cancel';
      cancelBtn.textContent = 'Annuler';
      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);

      cancelBtn.addEventListener('click', function () {
        M.placeEditKey = '';
        M.renderPlaces();
        M.onLayoutChange();
      });

      function save() {
        var name = nameF.input.value.trim();
        if (!name) {
          nameF.input.focus();
          return;
        }
        var g = readGps();
        if (g.invalid) {
          gpsF.input.focus();
          return;
        }
        saveBtn.disabled = true;
        var patch = {
          id: ref.id,
          name: name,
          kind: kindF.input.value.trim(),
          address: addrF.input.value.trim(),
          notes: notesF.input.value.trim(),
          lat: g.gps ? g.gps.lat : null,
          lng: g.gps ? g.gps.lng : null
        };
        Promise.resolve(M.onPlaceDirectorySave(patch)).then(function (result) {
          saveBtn.disabled = false;
          if (!result || result.ok === false || !result.place) {
            geoStatus.textContent = 'Échec de l’enregistrement';
            geoStatus.classList.remove('is-ok');
            geoStatus.classList.add('is-error');
            return;
          }
          var saved = result.place;
          M.placeEditKey = '';
          // Refresh the card's copies of this place (name) and the board catalog.
          var renamed = false;
          var next = S.normalizePlaces(M.cardPlaces);
          function touch(r) {
            if (r && r.id === ref.id && r.name !== saved.name) {
              r.name = saved.name;
              renamed = true;
            }
          }
          touch(next.from);
          touch(next.to);
          touch(next.at);
          (next.via || []).forEach(touch);
          if (renamed) M.persistPlaces(next);
          else M.renderPlaces();
          M.onLayoutChange();
        });
      }
      saveBtn.addEventListener('click', save);
      panel.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault();
          save();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelBtn.click();
        }
      });

      panel.appendChild(nameF.wrap);
      panel.appendChild(kindF.wrap);
      panel.appendChild(addrF.wrap);
      panel.appendChild(gpsF.wrap);
      panel.appendChild(gpsTools);
      panel.appendChild(geoStatus);
      panel.appendChild(notesF.wrap);
      panel.appendChild(actions);
      setTimeout(function () {
        try {
          nameF.input.focus();
          nameF.input.select();
        } catch (e) {}
      }, 0);
      return panel;
    };
    M.pgStops = function pgStops(map) {
      var n = S.normalizePlaces(map);
      var out = [];
      if (n.from) out.push({ key: 'from', ref: n.from });
      (n.via || []).forEach(function (ref) {
        out.push({ key: 'via', ref: ref });
      });
      if (n.to) out.push({ key: 'to', ref: n.to });
      if (n.at) out.push({ key: 'at', ref: n.at });
      return out;
    };
    M.pgApplyTransform = function pgApplyTransform() {
      var moved = M.pgPan.x || M.pgPan.y;
      M.pgStage.style.transform =
        M.pgScale === 1 && !moved
          ? ''
          : 'translate(' + M.pgPan.x + 'px,' + M.pgPan.y + 'px) scale(' + M.pgScale + ')';
      var step = M.PG_GRID * M.pgScale;
      while (step < 9) step *= 2;
      M.pgHost.style.backgroundSize = step + 'px ' + step + 'px';
      M.pgHost.style.backgroundPosition =
        Math.round(M.pgStage.offsetLeft + M.pgPan.x - step / 2) + 'px ' + Math.round(M.pgPan.y - step / 2) + 'px';
    };
    M.pgZoomBy = function pgZoomBy(factor, px, py) {
      var nextMul = Math.max(0.2, Math.min(1, M.pgZoomMul * factor));
      var nextScale = Math.max(0.25, M.pgFit * nextMul);
      if (Math.abs(nextScale - M.pgScale) < 0.001) return;
      var ox = M.pgStage.offsetLeft;
      var sx = (px - ox - M.pgPan.x) / M.pgScale;
      var sy = (py - M.pgPan.y) / M.pgScale;
      M.pgZoomMul = nextMul;
      M.pgScale = nextScale;
      M.pgPan.x = Math.round(px - ox - sx * M.pgScale);
      M.pgPan.y = Math.round(py - sy * M.pgScale);
      if (M.pgZoomMul === 1) {
        M.pgPan.x = 0;
        M.pgPan.y = 0;
      }
      M.pgApplyTransform();
    };
    M.pgSetExpanded = function pgSetExpanded(next) {
      next = !!next;
      if (M.pgExpanded === next) return;
      M.pgExpanded = next;
      if (!next) {
        M.pgPan.x = 0;
        M.pgPan.y = 0;
        M.pgZoomMul = 1;
        M.placeEditKey = '';
        if (/^(ins|rep):/.test(M.placesPickerSlot)) M.placesPickerSlot = '';
      }
      M.renderPlaces();
      M.onLayoutChange();
    };
    M.pgSvg = function pgSvg(tag, attrs) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs || {}).forEach(function (k) {
        node.setAttribute(k, attrs[k]);
      });
      return node;
    };
    M.pgStagePoint = function pgStagePoint(event) {
      var rect = M.pgStage.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / M.pgScale,
        y: (event.clientY - rect.top) / M.pgScale
      };
    };
    M.pgLayout = function pgLayout(count, heights, hostW) {
      // Allow the stage to shrink to 80% so two columns fit a narrow popup.
      var cols = Math.floor((Math.max(hostW, 0) / 0.8 - M.PG_PAD * 2 + M.PG_HGAP) / (M.PG_NODE_W + M.PG_HGAP));
      if (!isFinite(cols) || cols < 1) cols = hostW > 0 ? 1 : 2;
      cols = Math.max(1, Math.min(3, cols, count));
      var nodes = [];
      var y = 0;
      for (var start = 0, row = 0; start < count; start += cols, row++) {
        var rowIdx = [];
        var rowH = 0;
        for (var k = start; k < Math.min(count, start + cols); k++) {
          rowIdx.push(k);
          var h = heights[k] > 0 ? heights[k] : 96;
          if (h > rowH) rowH = h;
        }
        rowIdx.forEach(function (idx, j) {
          var col = row % 2 === 0 ? j : cols - 1 - j;
          nodes[idx] = {
            x: col * (M.PG_NODE_W + M.PG_HGAP),
            y: y,
            w: M.PG_NODE_W,
            h: heights[idx] > 0 ? heights[idx] : 96,
            row: row,
            col: col
          };
        });
        y += rowH + M.PG_VGAP;
      }
      return {
        nodes: nodes,
        width: cols * M.PG_NODE_W + (cols - 1) * M.PG_HGAP,
        height: Math.max(0, y - M.PG_VGAP)
      };
    };
    M.pgOpenInsert = function pgOpenInsert(index, pt) {
      if (!M.onPlacesChange || M.placesBusy) return;
      M.pgIgnoreUntil = Date.now() + 400;
      M.placesPickerSlot = 'ins:' + index;
      M.placeEditKey = '';
      M.pgPickPoint = pt || null;
      M.renderPlaces();
      M.onLayoutChange();
    };
    M.pgStartPinDrag = function pgStartPinDrag(event, edge, insertIndex, side, box) {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      var dir = side === 'top' ? [0, -1] : [0, 1];
      var start =
        side === 'top'
          ? { x: box.x + box.w / 2, y: box.y }
          : { x: box.x + box.w / 2, y: box.y + box.h };
      var temp = M.pgSvg('path', { class: 'tg-wire-temp tg-kind-flow' });
      M.pgWires.appendChild(temp);
      M.pgDrag = { moved: false, sx: event.clientX, sy: event.clientY, last: start };
      M.pgHost.classList.add('is-dragging');
      try {
        edge.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture is optional */
      }
      var move = function (e) {
        if (!M.pgDrag) return;
        if (Math.abs(e.clientX - M.pgDrag.sx) + Math.abs(e.clientY - M.pgDrag.sy) > 5) {
          M.pgDrag.moved = true;
        }
        var p = M.pgStagePoint(e);
        M.pgDrag.last = p;
        var d = Math.max(24, Math.abs(p.y - start.y) / 2);
        temp.setAttribute(
          'd',
          'M' + start.x + ' ' + start.y +
            ' C' + start.x + ' ' + (start.y + dir[1] * d) +
            ' ' + p.x + ' ' + (p.y - dir[1] * d) +
            ' ' + p.x + ' ' + p.y
        );
      };
      var cleanup = function () {
        edge.removeEventListener('pointermove', move);
        edge.removeEventListener('pointerup', done);
        edge.removeEventListener('pointercancel', cancel);
        M.pgHost.classList.remove('is-dragging');
        temp.remove();
      };
      var done = function () {
        var drag = M.pgDrag;
        M.pgDrag = null;
        cleanup();
        if (!drag) return;
        var pt = drag.moved
          ? drag.last
          : { x: start.x, y: start.y + dir[1] * 40 };
        M.pgOpenInsert(insertIndex, pt);
      };
      var cancel = function () {
        M.pgDrag = null;
        cleanup();
      };
      edge.addEventListener('pointermove', move);
      edge.addEventListener('pointerup', done);
      edge.addEventListener('pointercancel', cancel);
    };
    M.pgSnap = function pgSnap(v) {
      return Math.round(v / M.PG_GRID) * M.PG_GRID;
    };
    M.pgBeginMove = function pgBeginMove(event, index) {
      if (!M.onPlacesChange || M.placesBusy || M.pgMoving) return;
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest('.tg-node-clear')) return;
      var box = M.pgState && M.pgState.nodes[index];
      if (!box) return;
      M.pgMoving = {
        idx: index,
        sx: event.clientX,
        sy: event.clientY,
        x0: box.x - M.pgState.off.x,
        y0: box.y - M.pgState.off.y,
        moved: false,
        over: -1,
        raf: 0,
        pid: event.pointerId
      };
      try {
        M.pgFrame.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
    };
    M.pgEndMove = function pgEndMove(e) {
      var m = M.pgMoving;
      if (!m || (e && e.pointerId !== m.pid)) return;
      M.pgMoving = null;
      M.pgHost.classList.remove('pg-moving');
      var live = M.pgLive[m.idx];
      M.pgLive = {};
      if (!m.moved) return;
      M.pgNoClickUntil = Date.now() + 300;
      M.pgIgnoreUntil = Date.now() + 400;
      var cancelled = !!e && e.type === 'pointercancel';
      if (!cancelled && m.over >= 0) M.reorderPlaceStop(m.idx, m.over);
      else if (!cancelled && live) M.setPlaceStopPos(m.idx, live.x, live.y);
      else M.renderPlaces();
    };
    M.pgRouteLink = function pgRouteLink(a, b) {
      var acx = a.x + a.w / 2;
      var acy = a.y + a.h / 2;
      var bcx = b.x + b.w / 2;
      var bcy = b.y + b.h / 2;
      var vGap = b.y >= a.y + a.h ? b.y - (a.y + a.h) : a.y >= b.y + b.h ? a.y - (b.y + b.h) : -1;
      var hGap = b.x >= a.x + a.w ? b.x - (a.x + a.w) : a.x >= b.x + b.w ? a.x - (b.x + b.w) : -1;
      var vertical;
      if (vGap >= 0 && hGap >= 0) vertical = Math.abs(bcy - acy) >= Math.abs(bcx - acx);
      else if (vGap >= 0) vertical = true;
      else if (hGap >= 0) vertical = false;
      else vertical = Math.abs(bcy - acy) >= Math.abs(bcx - acx);
      var x1, y1, x2, y2, c1x, c1y, c2x, c2y;
      if (vertical) {
        var down = bcy >= acy;
        x1 = acx;
        y1 = down ? a.y + a.h : a.y;
        x2 = bcx;
        y2 = down ? b.y : b.y + b.h;
        var dy = Math.max(28, Math.abs(y2 - y1) * 0.5) * (down ? 1 : -1);
        c1x = x1;
        c1y = y1 + dy;
        c2x = x2;
        c2y = y2 - dy;
      } else {
        var right = bcx >= acx;
        x1 = right ? a.x + a.w : a.x;
        y1 = acy;
        x2 = right ? b.x : b.x + b.w;
        y2 = bcy;
        var dx = Math.max(24, Math.abs(x2 - x1) * 0.5) * (right ? 1 : -1);
        c1x = x1 + dx;
        c1y = y1;
        c2x = x2 - dx;
        c2y = y2;
      }
      return {
        d: 'M' + x1 + ' ' + y1 + ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + x2 + ' ' + y2,
        mx: (x1 + 3 * c1x + 3 * c2x + x2) / 8,
        my: (y1 + 3 * c1y + 3 * c2y + y2) / 8
      };
    };
    M.pgToolButton = function pgToolButton(icon, title, onClick, extraClass) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pg-node-tool' + (extraClass ? ' ' + extraClass : '');
      b.title = title;
      b.setAttribute('aria-label', title);
      b.disabled = M.placesBusy;
      b.innerHTML = '<i class="ti ' + icon + '" aria-hidden="true"></i>';
      b.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return b;
    };
    },
    run: function (M) {
    M.PG_NODE_W = 220;
    M.PG_PAD = 20;
    M.PG_HGAP = 56;
    M.PG_TOP = 44;
    M.PG_VGAP = 64;
    M.PG_STOP_ICONS = {
      from: 'ti-circle-dot',
      via: 'ti-map-pin',
      to: 'ti-flag-3',
      at: 'ti-map-pin'
    };
    M.pgUid = ++S.S.teamGraphInstances;
    M.pgScale = 1;
    M.pgFit = 1;
    M.pgZoomMul = 1;
    M.pgPan = { x: 0, y: 0 };
    M.pgState = null;
    M.pgDrag = null;
    M.pgMoving = null;
    M.pgLive = {};
    M.PG_GRID = 18;
    M.pgFrame.addEventListener(
      'wheel',
      function (event) {
        if (event.target.closest('.tg-editor')) return;
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        var rect = M.pgFrame.getBoundingClientRect();
        M.pgZoomBy(
          Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left,
          event.clientY - rect.top
        );
      },
      { passive: false }
    );
    M.pgZoomOutBtn.addEventListener('click', function (event) {
      event.preventDefault();
      M.pgZoomBy(0.8, M.pgHost.clientWidth / 2, M.pgFrame.clientHeight / 2);
    });
    M.pgZoomInBtn.addEventListener('click', function (event) {
      event.preventDefault();
      M.pgZoomBy(1.25, M.pgHost.clientWidth / 2, M.pgFrame.clientHeight / 2);
    });
    M.pgFrame.addEventListener('mousedown', function (event) {
      if (event.button === 1 && !event.target.closest('.tg-editor')) event.preventDefault();
    });
    M.pgFrame.addEventListener('auxclick', function (event) {
      if (event.button === 1) event.preventDefault();
    });
    M.pgFrame.addEventListener('pointerdown', function (event) {
      var middle = event.button === 1;
      if (event.button != null && event.button !== 0 && !middle) return;
      if (middle) {
        if (event.target.closest('.tg-editor')) return;
        event.preventDefault();
      } else if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-collapse, .tg-wire-hit')) {
        return;
      }
      var startX = event.clientX;
      var startY = event.clientY;
      var baseX = M.pgPan.x;
      var baseY = M.pgPan.y;
      var moved = false;
      try {
        M.pgFrame.setPointerCapture(event.pointerId);
      } catch (err) {
        /* optional */
      }
      var move = function (e) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        M.pgHost.classList.add('is-panning');
        var hostW = M.pgHost.clientWidth || 320;
        var frameH = M.pgFrame.clientHeight || 200;
        var sw = (M.pgState ? M.pgState.width : 0) * M.pgScale;
        var sh = (M.pgState ? M.pgState.height : 0) * M.pgScale;
        var margin = 48;
        M.pgPan.x = Math.round(Math.max(margin - sw, Math.min(hostW - margin, baseX + dx)));
        M.pgPan.y = Math.round(Math.max(margin - sh, Math.min(frameH - margin, baseY + dy)));
        M.pgApplyTransform();
      };
      var end = function () {
        M.pgFrame.removeEventListener('pointermove', move);
        M.pgFrame.removeEventListener('pointerup', end);
        M.pgFrame.removeEventListener('pointercancel', end);
        M.pgHost.classList.remove('is-panning');
      };
      M.pgFrame.addEventListener('pointermove', move);
      M.pgFrame.addEventListener('pointerup', end);
      M.pgFrame.addEventListener('pointercancel', end);
    });
    M.pgFrame.addEventListener('dblclick', function (event) {
      if (event.target.closest('.tg-node, .tg-edge, .tg-pill, .tg-editor, .tg-collapse, .tg-zoom-btn, button, input')) return;
      if (!M.onPlacesChange || M.placesBusy) return;
      M.pgOpenInsert(M.pgState ? M.pgState.nodes.length : 0, M.pgStagePoint(event));
    });
    M.pgAutoBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      M.clearPlacePositions();
    });
    M.pgCollapseBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      M.pgSetExpanded(false);
    });
    M.pgNoClickUntil = 0;
    M.pgFrame.addEventListener('pointermove', function (e) {
      var m = M.pgMoving;
      if (!m || e.pointerId !== m.pid) return;
      var dx = e.clientX - m.sx;
      var dy = e.clientY - m.sy;
      if (!m.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!m.moved) {
        m.moved = true;
        M.pgHost.classList.add('pg-moving');
        M.placeEditKey = '';
        if (/^(ins|rep):/.test(M.placesPickerSlot)) M.placesPickerSlot = '';
      }
      M.pgLive[m.idx] = { x: M.pgSnap(m.x0 + dx / M.pgScale), y: M.pgSnap(m.y0 + dy / M.pgScale) };
      var p = M.pgStagePoint(e);
      m.over = -1;
      (M.pgState ? M.pgState.nodes : []).forEach(function (b, k) {
        if (!b || k === m.idx) return;
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) m.over = k;
      });
      if (!m.raf) {
        m.raf = requestAnimationFrame(function () {
          m.raf = 0;
          M.renderPlaces();
        });
      }
    });
    M.pgFrame.addEventListener('pointerup', M.pgEndMove);
    M.pgFrame.addEventListener('pointercancel', M.pgEndMove);
    }
  });
})(typeof window !== 'undefined' ? window : this);
