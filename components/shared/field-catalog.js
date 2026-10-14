/*
 * Role: turn a board's Trello labels into typed fields.
 * A label named Priority-Low is the field Priorité with the value Low, not one more tag in a
 * shared bag. Known names (priority, location, category, money, and the French equivalents)
 * become the app's own fields. Any other Title-Value label becomes a single-choice field.
 * A plain label (Maison, follow-up) stays a label.
 *
 *   FieldCatalog.catalog(labels) → [{ id, label, icon, kind, options:[{ id, value, ids, color }] }]
 *   FieldCatalog.loose(labels)   → labels that are not a field value
 *   FieldCatalog.valueOn(field, cardLabels) → { id, value } | null
 *   FieldCatalog.without(labels, selectedIds, fieldId) → ids with that field's labels removed
 *   FieldCatalog.metaKey(field)  → desc-meta key for a value that has no native store
 *   FieldCatalog.pretty(value)   → "VeryLow" → "Very Low"
 */
(function (global) {
  'use strict';

  var KINDS = [
    { id: 'priority', label: 'Priorité', icon: 'flame', keys: ['priority', 'priorite', 'prio', 'urgence'] },
    { id: 'place', label: 'Lieu', icon: 'map-pin', keys: ['location', 'lieu', 'place', 'endroit', 'where'] },
    { id: 'category', label: 'Catégorie', icon: 'category', keys: ['category', 'categorie'] },
    { id: 'money', label: 'Argent', icon: 'coin', keys: ['money', 'argent', 'finance', 'depense', 'cout'] },
  ];

  var KIND_ORDER = { priority: 0, place: 1, category: 2, money: 3, choice: 4 };

  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  function slug(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
  }

  function isUpperStart(s) {
    var c = String(s || '').charAt(0);
    return c !== c.toLowerCase() && c === c.toUpperCase();
  }

  function kindOf(name) {
    var key = fold(name);
    for (var i = 0; i < KINDS.length; i++) {
      if (KINDS[i].keys.indexOf(key) !== -1) return KINDS[i];
    }
    return null;
  }

  /** `{ field, value, kind }` or null when this label is just a label. */
  function splitName(name) {
    var s = String(name || '').trim();
    var m = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]{0,31})\s*[-–—]\s*(\S(?:.{0,38}\S)?)$/.exec(s);
    if (!m) return null;
    var field = m[1];
    var value = m[2].trim();
    if (!value) return null;
    var kind = kindOf(field);
    if (!kind && !(isUpperStart(field) && isUpperStart(value))) return null;
    return { field: field, value: value, kind: kind };
  }

  function pretty(value) {
    return String(value || '')
      .replace(/[_]+/g, ' ')
      .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * One entry per field found in `labels` ({id, name, color}).
   * Options of the same field are unique by folded value.
   */
  function catalog(labels) {
    var byId = Object.create(null);
    var order = [];
    (labels || []).forEach(function (label) {
      if (!label || label.id == null) return;
      var split = splitName(label.name);
      if (!split) return;
      var kind = split.kind;
      var id = kind ? kind.id : slug(split.field) || 'champ';
      var field = byId[id];
      if (!field) {
        field = {
          id: id,
          label: kind ? kind.label : split.field,
          icon: kind ? kind.icon : 'forms',
          kind: kind ? kind.id : 'choice',
          options: [],
        };
        byId[id] = field;
        order.push(field);
      }
      var valueKey = fold(split.value);
      var option = null;
      for (var i = 0; i < field.options.length; i++) {
        if (fold(field.options[i].value) === valueKey) {
          option = field.options[i];
          break;
        }
      }
      if (!option) {
        option = { id: String(label.id), value: split.value, ids: [], color: label.color || '' };
        field.options.push(option);
      }
      option.ids.push(String(label.id));
    });
    order.sort(function (a, b) {
      var d = (KIND_ORDER[a.kind] || 4) - (KIND_ORDER[b.kind] || 4);
      if (d) return d;
      return a.label.localeCompare(b.label, 'fr');
    });
    order.forEach(function (field) {
      field.options.sort(function (a, b) {
        return pretty(a.value).localeCompare(pretty(b.value), 'fr');
      });
    });
    return order;
  }

  function loose(labels) {
    return (labels || []).filter(function (label) {
      return label && !splitName(label.name);
    });
  }

  function findField(labels, fieldId) {
    var list = catalog(labels);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === fieldId) return list[i];
    }
    return null;
  }

  /** The value currently on the card, in card-label order. */
  function valueOn(field, cardLabels) {
    if (!field) return null;
    var byId = Object.create(null);
    (field.options || []).forEach(function (option) {
      (option.ids || []).forEach(function (id) {
        byId[id] = option;
      });
    });
    var list = cardLabels || [];
    for (var i = 0; i < list.length; i++) {
      var label = list[i];
      var option = label && byId[String(label.id)];
      if (option) return { id: option.id, value: option.value };
    }
    return null;
  }

  /** Selected label ids with every label of `fieldId` removed. */
  function without(labels, selectedIds, fieldId) {
    var field = findField(labels, fieldId);
    var drop = Object.create(null);
    if (field) {
      field.options.forEach(function (option) {
        (option.ids || []).forEach(function (id) {
          drop[id] = true;
        });
      });
    }
    return (selectedIds || []).filter(function (id) {
      return !drop[String(id)];
    });
  }

  /**
   * Desc-meta key for a value that is not the priority score, the place, or the
   * Catégorie custom field. Empty when the value lives only in that native store.
   */
  function metaKey(field) {
    if (!field) return '';
    if (field.kind === 'money') return 'money';
    if (field.kind === 'choice') return 'f-' + field.id;
    if (field.kind === 'place') return 'lieu';
    if (field.kind === 'category') return 'categorie';
    return '';
  }

  global.FieldCatalog = {
    KINDS: KINDS,
    fold: fold,
    splitName: splitName,
    pretty: pretty,
    catalog: catalog,
    loose: loose,
    valueOn: valueOn,
    without: without,
    metaKey: metaKey,
  };
})(typeof window !== 'undefined' ? window : this);
