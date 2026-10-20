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

  global.ProjectIcon = { suggest: suggest, decorate: decorate };
})(typeof window !== 'undefined' ? window : this);
