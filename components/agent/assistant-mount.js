/*
 * Role: boots the project-scope Assistant (AgentUI, scope 'project') into any container.
 * Shared by assistant.html (full page) and the Table/Gantt views (docked panel) so the same
 * memory / profile / people / places / board-digest wiring backs every assistant surface.
 *
 *   AssistantMount.mount(containerEl, t, { onLayoutChange, focusComposer, resizeBody })
 *     → Promise<void> (resolves once AgentUI is mounted)
 */
(function (global) {
  'use strict';

  function log(name, data) {
    if (global.TpDebug) global.TpDebug.log('assistant', name, data);
  }

  function mount(container, t, options) {
    options = options || {};
    var cachedMemory = null;
    var cachedProfile = null;
    var cachedPeople = null;
    var cachedPlaces = null;
    var cachedDigest = '';
    var PT = global.PriorityTrello;
    var PA = global.PriorityAgent;
    var AM = global.AgentMemory;

    function resize() {
      if (typeof options.onLayoutChange === 'function') return options.onLayoutChange();
      if (options.resizeBody !== false && t && typeof t.sizeTo === 'function') {
        try {
          t.sizeTo(document.body);
        } catch (e) {
          /* ignore */
        }
      }
    }

    function scanDigest() {
      if (!PT || typeof PT.scanBoardCards !== 'function') return Promise.resolve(cachedDigest || '');
      return PT.scanBoardCards(t, { maxCards: 100, descMax: 40, includePriority: false, sortBy: 'activity' }).then(
        function (scan) {
          cachedDigest = (scan && scan.digest) || '';
          log('digest.loaded', { hasDigest: !!cachedDigest, cardCount: (scan && scan.cards && scan.cards.length) || 0 });
          return cachedDigest;
        },
        function () {
          return cachedDigest || '';
        }
      );
    }

    function loadDir(mod, key) {
      if (!mod || !mod.load) return Promise.resolve(null);
      return mod.load(t).then(function (v) {
        return v;
      }, function () {
        return null;
      });
    }

    var provider = PA && typeof PA.getProvider === 'function'
      ? PA.getProvider(t).catch(function () {
          return PA.normalizeProvider(null);
        })
      : Promise.resolve(null);

    // Independent loads run in parallel; the memory refresh needs the provider.
    return Promise.all([
      AM ? AM.load(t).catch(function () { return null; }) : null,
      loadDir(global.UserProfile),
      loadDir(global.People),
      loadDir(global.Places),
      provider,
      scanDigest(),
    ]).then(function (res) {
      cachedMemory = res[0];
      cachedProfile = res[1];
      cachedPeople = res[2];
      cachedPlaces = res[3];
      var prov = res[4];
      var memoryP = Promise.resolve(cachedMemory);
      if (AM && typeof AM.scanAndRefresh === 'function' && PA && PA.isConfigured && PA.isConfigured(prov)) {
        memoryP = AM.scanAndRefresh(t, prov, { force: false }).then(
          function (m) {
            if (m) cachedMemory = m;
            return m;
          },
          function () {
            return cachedMemory;
          }
        );
      }
      return memoryP.then(function () {
        var needsAlign = AM && AM.needsOnboarding && AM.needsOnboarding(cachedMemory);
        function refresh(name, mod) {
          return async function () {
            if (!mod || !mod.load) return name === 'people' ? cachedPeople : cachedPlaces;
            try {
              var v = await mod.load(t, { maxAgeMs: mod.AGENT_REFRESH_MAX_AGE_MS || 5000 });
              if (name === 'people') cachedPeople = v;
              else cachedPlaces = v;
            } catch (e) {
              console.error(name + '.refresh failed', e);
            }
            return name === 'people' ? cachedPeople : cachedPlaces;
          };
        }
        function apply(name, mod) {
          return async function (next) {
            var cur = name === 'people' ? cachedPeople : cachedPlaces;
            if (!next || typeof next !== 'object') return cur;
            if (name === 'people') cachedPeople = next;
            else cachedPlaces = next;
            if (mod && typeof mod.save === 'function') {
              try {
                var saved = await mod.save(t, next);
                if (name === 'people') cachedPeople = saved;
                else cachedPlaces = saved;
              } catch (e) {
                console.error(name + '.save failed', e);
              }
            }
            return name === 'people' ? cachedPeople : cachedPlaces;
          };
        }
        global.AgentUI.mount(container, {
          t: t,
          scope: 'project',
          standalone: true,
          initiallyOpen: true,
          focusComposer: options.focusComposer !== false,
          openMemoryOnSettings: !!needsAlign,
          getScope: function () {
            return 'project';
          },
          getMemory: function () {
            return cachedMemory;
          },
          getProfile: function () {
            return cachedProfile;
          },
          getPeople: function () {
            return cachedPeople || { version: 1, people: [], updatedAt: '' };
          },
          refreshPeople: refresh('people', global.People),
          applyPeople: apply('people', global.People),
          getPlaces: function () {
            return cachedPlaces || { version: 1, places: [], updatedAt: '' };
          },
          refreshPlaces: refresh('places', global.Places),
          applyPlaces: apply('places', global.Places),
          getEntities: function () {
            var ET = global.EntitiesTrello;
            if (!ET) return null;
            // cache-aware: only hits Trello when the last read is older than its TTL
            ET.load(t).catch(function () { /* not authorized yet: no entities for the agent */ });
            return ET.peek();
          },
          getBoardDigest: function () {
            return cachedDigest || '';
          },
          refreshBoardDigest: scanDigest,
          onMemoryUpdate: function (next) {
            cachedMemory = next;
          },
          onLayoutChange: resize,
          playEffect: function (name, opts) {
            if (global.CelebrationEffects && typeof global.CelebrationEffects.play === 'function') {
              return global.CelebrationEffects.play(name, opts || {});
            }
            return { ok: false, error: 'CelebrationEffects indisponible' };
          },
        });
        resize();
      });
    });
  }

  global.AssistantMount = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
