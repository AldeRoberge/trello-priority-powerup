/*
 * An icon for a project on the goal map: { i: tabler name, c: #rrggbb } or null (the default stack).
 *   ProjectIcon.suggest(t, name, desc) -> Promise<icon|null>
 *     Asks the assistant. No provider, or a name it does not know, leaves the default.
 */
(function (global) {
  'use strict';

  function suggest(t, name, desc) {
    var PA = global.PriorityAgent;
    var DM = global.DocsModel;
    var title = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!title || !PA || !DM || typeof PA.getProvider !== 'function' || typeof PA.chatCompletions !== 'function') {
      return Promise.resolve(null);
    }
    return PA.getProvider(t).then(function (provider) {
      if (!PA.isConfigured(provider)) return null;
      var icons = DM.DOC_ICONS.map(function (x) { return x.i; }).join(' ');
      var colors = DM.COVER_COLORS.map(function (c) { return c.v; }).join(' ');
      var note = String(desc || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      var messages = [
        {
          role: 'system',
          content: [
            'Tu choisis une icône pour un projet, d’après son nom.',
            'Réponds uniquement avec JSON: {"i":"nom","c":"#rrggbb"}',
            'i est exactement un de ces noms: ' + icons,
            'c est une de ces couleurs, ou une chaîne vide: ' + colors,
            'Une seule icône, la plus parlante pour ce projet.',
          ].join('\n'),
        },
        { role: 'user', content: note ? title + '\n' + note : title },
      ];
      return PA.chatCompletions(provider, messages, {
        jsonMode: true,
        max_tokens: 40,
        temperature: 0.2,
        stream: false,
      }).then(function (res) {
        var text = res && typeof res.content === 'string' ? res.content : '';
        var start = text.indexOf('{');
        var end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
          return DM.normalizeIcon(JSON.parse(text.slice(start, end + 1)));
        } catch (e) {
          return null;
        }
      });
    }).catch(function () { return null; });
  }

  /** Fills `made[i].icon` when the assistant picks one. A failure leaves the project as it was. */
  function decorate(t, made) {
    var list = made || [];
    return Promise.all(list.map(function (m) {
      if (!m || m.icon) return m;
      return suggest(t, m.name, m.desc).then(function (icon) {
        if (icon) m.icon = icon;
        return m;
      }, function () { return m; });
    }));
  }

  var cache = Object.create(null);

  /** Remembers each project's icon so a later view can show it without another load. */
  function remember(goals) {
    ((goals && goals.nodes) || []).forEach(function (n) {
      if (n && n.level === 'project' && n.id) cache[n.id] = n.icon || null;
    });
  }

  function of(id) {
    if (!id || !Object.prototype.hasOwnProperty.call(cache, id)) return null;
    return cache[id] || null;
  }

  /** Writes the icon on the goal-map project. Loads the map when `goals` is omitted. */
  function save(t, goals, id, icon) {
    var GG = global.MindmapGoalsTrello;
    var WO = global.WorkOS;
    if (!id || !GG || typeof GG.save !== 'function' || !WO || typeof WO.withNodeEdit !== 'function') {
      return Promise.resolve(goals || null);
    }
    var ready = goals ? Promise.resolve(goals) : (typeof GG.load === 'function' ? GG.load(t) : Promise.resolve(null));
    return ready.then(function (g) {
      var next = WO.withNodeEdit(g || { nodes: [], links: [] }, id, { icon: icon || null });
      remember(next);
      return GG.save(t, next).then(function (saved) {
        if (saved) remember(saved);
        return saved || next;
      }, function () { return next; });
    }, function () { return goals || null; });
  }

  /** The same chooser as a document. `onSaved(goals, icon)` runs after the goal map is written. */
  function button(opts) {
    opts = opts || {};
    if (!global.IconPick || typeof global.IconPick.button !== 'function') return null;
    return global.IconPick.button({
      icon: opts.icon,
      fallback: opts.fallback || 'stack-2',
      className: opts.className || 'ip-glyph',
      onChoose: function (next) {
        var goals = typeof opts.goals === 'function' ? opts.goals() : opts.goals;
        save(opts.t, goals, opts.id, next).then(function (saved) {
          if (typeof opts.onSaved === 'function') opts.onSaved(saved, next);
        });
      },
    });
  }

  global.ProjectIcon = { suggest: suggest, decorate: decorate, remember: remember, of: of, save: save, button: button };
})(typeof window !== 'undefined' ? window : this);
