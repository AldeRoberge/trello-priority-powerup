/*
 * Role: table-aligned chips on cards (Kanban, Orchestrateur...). Each property sits in its own slot, always present
 * and always in the same order, and align() gives every slot the width of the widest chip of that property in the
 * view, so a property starts at the same horizontal place on every card and a missing value shifts nothing.
 * Exposes window.ChipSlots.
 */
(function (global) {
  'use strict';

  var SLOT = 'cs-slot';

  /**
   * Wraps chips in slots. `chips` is a list of [name, chipElement|null] pairs; a null chip leaves an empty slot.
   * Returns the slot elements, in order.
   */
  function slots(chips) {
    var doc = global.document;
    return (chips || []).map(function (pair) {
      var slot = doc.createElement('span');
      slot.className = SLOT;
      slot.setAttribute('data-slot', String(pair[0]));
      if (pair[1]) slot.appendChild(pair[1]);
      return slot;
    });
  }

  /** Measures every slot under root and sets each one's min-width to the widest chip with the same name. */
  function align(root) {
    if (!root || !root.querySelectorAll) return {};
    var all = root.querySelectorAll('.' + SLOT);
    var max = {};
    var i;
    for (i = 0; i < all.length; i++) {
      var chip = all[i].firstElementChild || (all[i].children && all[i].children[0]) || null;
      var name = all[i].getAttribute('data-slot');
      var w = chip && chip.getBoundingClientRect ? Math.ceil(chip.getBoundingClientRect().width) : 0;
      if (w > (max[name] || 0)) max[name] = w;
    }
    for (i = 0; i < all.length; i++) {
      var m = max[all[i].getAttribute('data-slot')] || 0;
      all[i].style.minWidth = m ? m + 'px' : '';
    }
    return max;
  }

  global.ChipSlots = { slots: slots, align: align, SLOT: SLOT };
})(typeof window !== 'undefined' ? window : this);
