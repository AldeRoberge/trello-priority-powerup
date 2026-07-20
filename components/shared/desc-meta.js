/* Card description hidden metadata (Power-Up / Power Automate). No Trello Pro. */
(function (global) {
  'use strict';

  var META_BLOCK_RE = /<!--\s*cerveau-meta\b([\s\S]*?)-->/gi;
  var OUTLOOK_LINE_RE = /^\s*\[outlook-event-id\]:\s*(\S+)\s*$/gim;
  var KEY_LINE_RE = /^([a-z0-9_-]+)\s*:\s*(.*)$/i;

  function trimVisible(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  }

  function parseKeyLines(body, into) {
    var map = into || {};
    var lines = String(body || '').split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var m = KEY_LINE_RE.exec(line);
      if (!m) continue;
      var key = m[1].toLowerCase();
      var val = (m[2] || '').trim();
      if (key && val) map[key] = val;
    }
    return map;
  }

  /**
   * Split a full Trello description into user-visible text + meta map.
   * Supports <!--cerveau-meta ... --> and legacy [outlook-event-id]: lines.
   */
  function splitDesc(full) {
    var text = String(full == null ? '' : full).replace(/\r\n/g, '\n');
    var meta = {};

    var visible = text.replace(META_BLOCK_RE, function (_all, body) {
      parseKeyLines(body, meta);
      return '';
    });

    visible = visible.replace(OUTLOOK_LINE_RE, function (_all, id) {
      if (id && !meta['outlook-event-id']) {
        meta['outlook-event-id'] = String(id).trim();
      }
      return '';
    });

    visible = trimVisible(visible);
    return {
      visible: visible,
      meta: meta,
      hasMeta: Object.keys(meta).length > 0,
    };
  }

  function serializeMeta(meta) {
    var map = meta && typeof meta === 'object' ? meta : {};
    var keys = Object.keys(map)
      .filter(function (k) {
        return map[k] != null && String(map[k]).trim() !== '';
      })
      .sort();
    if (!keys.length) return '';
    var lines = keys.map(function (k) {
      return k + ': ' + String(map[k]).trim();
    });
    return '<!--cerveau-meta\n' + lines.join('\n') + '\n-->';
  }

  function joinDesc(visible, meta) {
    var v = trimVisible(visible);
    var block = serializeMeta(meta);
    if (!block) return v;
    return v ? v + '\n\n' + block : block;
  }

  function getMeta(full, key) {
    var split = splitDesc(full);
    var k = String(key || '').toLowerCase();
    return split.meta[k] || '';
  }

  function setMeta(full, key, value) {
    var split = splitDesc(full);
    var k = String(key || '').toLowerCase().trim();
    if (!k) return joinDesc(split.visible, split.meta);
    if (value == null || String(value).trim() === '') {
      delete split.meta[k];
    } else {
      split.meta[k] = String(value).trim();
    }
    return joinDesc(split.visible, split.meta);
  }

  function stripVisibleOnly(full) {
    return splitDesc(full).visible;
  }

  global.DescMeta = {
    META_BLOCK_RE: META_BLOCK_RE,
    splitDesc: splitDesc,
    joinDesc: joinDesc,
    serializeMeta: serializeMeta,
    getMeta: getMeta,
    setMeta: setMeta,
    stripVisibleOnly: stripVisibleOnly,
    parseKeyLines: parseKeyLines,
  };
})(typeof window !== 'undefined' ? window : this);
