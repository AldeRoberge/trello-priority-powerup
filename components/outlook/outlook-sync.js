/**
 * Outlook ↔ Trello card sync — mapping, merge, syncBoard / syncCard.
 * Exposes window.OutlookSync. Depends on OutlookAuth, OutlookGraph, Gantt*.
 *
 * Bidirectional field set: name, desc, startDate, dueDate, dueTime.
 * Graph all-day end is exclusive; cardId stored via Graph open extension.
 * Orphan mappings (card gone) delete the Outlook event.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'outlookSync';
  var SYNC_DEBOUNCE_MS = 800;
  var FIELDS = ['name', 'desc', 'startDate', 'dueDate', 'dueTime'];
  var cardSyncTimers = Object.create(null);

  function auth() {
    return global.OutlookAuth || null;
  }

  function graph() {
    return global.OutlookGraph || null;
  }

  function ganttModel() {
    return global.GanttModel || null;
  }

  function ganttTrello() {
    return global.GanttTrello || null;
  }

  function priorityTrello() {
    return global.PriorityTrello || null;
  }

  function descMeta() {
    return global.DescMeta || null;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function emptySnapshot() {
    return {
      name: '',
      desc: '',
      startDate: '',
      dueDate: '',
      dueTime: '',
    };
  }

  function normalizeSnapshot(raw) {
    var s = emptySnapshot();
    if (!raw || typeof raw !== 'object') return s;
    s.name = typeof raw.name === 'string' ? raw.name : '';
    s.desc = typeof raw.desc === 'string' ? raw.desc : '';
    s.startDate = typeof raw.startDate === 'string' ? raw.startDate : '';
    s.dueDate = typeof raw.dueDate === 'string' ? raw.dueDate : '';
    s.dueTime = typeof raw.dueTime === 'string' ? raw.dueTime : '';
    return s;
  }

  function snapshotsEqual(a, b) {
    a = normalizeSnapshot(a);
    b = normalizeSnapshot(b);
    for (var i = 0; i < FIELDS.length; i++) {
      if (a[FIELDS[i]] !== b[FIELDS[i]]) return false;
    }
    return true;
  }

  /**
   * Per-field 3-way merge. Both-changed → prefer Trello.
   * @returns {{ toTrello: object|null, toOutlook: object|null, nextSynced: object }}
   */
  function mergeCardEvent(trello, outlook, lastSynced) {
    var t = normalizeSnapshot(trello);
    var o = normalizeSnapshot(outlook);
    var base = normalizeSnapshot(lastSynced);
    var toTrello = null;
    var toOutlook = null;
    var next = emptySnapshot();

    for (var i = 0; i < FIELDS.length; i++) {
      var field = FIELDS[i];
      var tv = t[field];
      var ov = o[field];
      var bv = base[field];
      var tChanged = tv !== bv;
      var oChanged = ov !== bv;

      if (tChanged && !oChanged) {
        next[field] = tv;
        if (!toOutlook) toOutlook = emptySnapshot();
        toOutlook[field] = tv;
      } else if (oChanged && !tChanged) {
        next[field] = ov;
        if (!toTrello) toTrello = emptySnapshot();
        toTrello[field] = ov;
      } else if (tChanged && oChanged) {
        // Prefer Trello
        next[field] = tv;
        if (tv !== ov) {
          if (!toOutlook) toOutlook = emptySnapshot();
          toOutlook[field] = tv;
        }
      } else {
        next[field] = tv;
      }
    }

    // Fill missing sides with full next snapshot for PATCH convenience
    if (toOutlook) {
      toOutlook = Object.assign(emptySnapshot(), next, toOutlook);
    }
    if (toTrello) {
      toTrello = Object.assign(emptySnapshot(), next, toTrello);
    }

    return { toTrello: toTrello, toOutlook: toOutlook, nextSynced: next };
  }

  function addDaysIso(isoDate, days) {
    var model = ganttModel();
    if (model && typeof model.parseIsoDate === 'function') {
      var d = model.parseIsoDate(isoDate);
      if (!d) return '';
      var next = model.addDays(d, days);
      return model.toIsoDate(next);
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
    if (!m) return '';
    var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    dt.setDate(dt.getDate() + (Number(days) || 0));
    return (
      dt.getFullYear() +
      '-' +
      pad2(dt.getMonth() + 1) +
      '-' +
      pad2(dt.getDate())
    );
  }

  /**
   * Build inclusive start/due from Gantt bar rules; returns null if undated.
   */
  function resolveCardInterval(card) {
    var model = ganttModel();
    if (!model || typeof model.resolveBarInterval !== 'function') {
      if (!card) return null;
      if (!card.startDate && !card.dueDate) return null;
      return {
        startDate: card.startDate || card.dueDate || '',
        dueDate: card.dueDate || card.startDate || '',
        dueTime: card.dueTime || '',
      };
    }
    var interval = model.resolveBarInterval({
      startDate: card && card.startDate,
      dueDate: card && card.dueDate,
      estimatedMinutes: card && card.estimatedMinutes,
    });
    if (!interval) return null;
    return {
      startDate: model.toIsoDate(interval.start),
      dueDate: model.toIsoDate(interval.end),
      dueTime: (card && card.dueTime) || '',
    };
  }

  function snapshotFromCard(card) {
    var s = emptySnapshot();
    if (!card) return s;
    s.name = typeof card.name === 'string' ? card.name : '';
    var rawDesc = typeof card.desc === 'string' ? card.desc : '';
    var dm = descMeta();
    s.desc =
      dm && typeof dm.stripVisibleOnly === 'function'
        ? dm.stripVisibleOnly(rawDesc)
        : rawDesc;
    var interval = resolveCardInterval(card);
    if (interval) {
      s.startDate = interval.startDate;
      s.dueDate = interval.dueDate;
      s.dueTime = interval.dueTime || '';
    } else {
      s.startDate = card.startDate || '';
      s.dueDate = card.dueDate || '';
      s.dueTime = card.dueTime || '';
    }
    return s;
  }

  function parseGraphDatePart(value) {
    if (!value || typeof value !== 'object') return { date: '', time: '' };
    if (typeof value.date === 'string' && value.date) {
      return { date: value.date.slice(0, 10), time: '' };
    }
    var dt = typeof value.dateTime === 'string' ? value.dateTime : '';
    var m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(dt);
    if (!m) return { date: '', time: '' };
    var time = m[2] != null ? m[2] + ':' + m[3] : '';
    if (time === '00:00') time = '';
    return { date: m[1], time: time };
  }

  function bodyTextFromEvent(event) {
    if (!event) return '';
    if (typeof event.bodyPreview === 'string' && event.bodyPreview) {
      return event.bodyPreview;
    }
    var body = event.body;
    if (!body) return '';
    var content = typeof body.content === 'string' ? body.content : '';
    if (!content) return '';
    if (body.contentType === 'html' || /<[a-z][\s\S]*>/i.test(content)) {
      return content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\r\n/g, '\n')
        .trim();
    }
    return content.trim();
  }

  function snapshotFromEvent(event) {
    var s = emptySnapshot();
    if (!event) return s;
    s.name = typeof event.subject === 'string' ? event.subject : '';
    s.desc = bodyTextFromEvent(event);
    var start = parseGraphDatePart(event.start);
    var end = parseGraphDatePart(event.end);
    s.startDate = start.date;
    if (event.isAllDay) {
      // Graph all-day end is exclusive
      s.dueDate = end.date ? addDaysIso(end.date, -1) : start.date;
      s.dueTime = '';
    } else {
      s.dueDate = end.date || start.date;
      s.dueTime = end.time || '';
    }
    return s;
  }

  function localTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  /**
   * Build Graph event payload from a sync snapshot.
   */
  function buildEventPayload(snapshot, cardId) {
    var s = normalizeSnapshot(snapshot);
    var startDate = s.startDate || s.dueDate;
    var dueDate = s.dueDate || s.startDate;
    if (!startDate || !dueDate) return null;

    var tz = localTimeZone();
    var payload = {
      subject: s.name || '(Sans titre)',
      body: {
        contentType: 'text',
        content: s.desc || '',
      },
    };

    if (s.dueTime) {
      var startTime = '09:00';
      if (startDate === dueDate && s.dueTime <= startTime) {
        startTime = '08:00';
      }
      payload.isAllDay = false;
      payload.start = {
        dateTime: startDate + 'T' + startTime + ':00',
        timeZone: tz,
      };
      payload.end = {
        dateTime: dueDate + 'T' + s.dueTime + ':00',
        timeZone: tz,
      };
    } else {
      var endExclusive = addDaysIso(dueDate, 1);
      payload.isAllDay = true;
      payload.start = {
        dateTime: startDate + 'T00:00:00',
        timeZone: 'UTC',
      };
      payload.end = {
        dateTime: endExclusive + 'T00:00:00',
        timeZone: 'UTC',
      };
    }

    // cardId is applied after create via setCardLinkExtension (Graph open extension).
    void cardId;

    return payload;
  }

  function patchFromSnapshot(snapshot) {
    var full = buildEventPayload(snapshot, null);
    if (!full) return null;
    return {
      subject: full.subject,
      body: full.body,
      isAllDay: full.isAllDay,
      start: full.start,
      end: full.end,
    };
  }

  async function resolveBoardId(t) {
    if (!t) return '';
    try {
      if (typeof t.board === 'function') {
        var id = await t.board('id');
        if (id && typeof id === 'object' && id.id) return String(id.id);
        if (typeof id === 'string') return id;
      }
    } catch (e) {
      /* ignore */
    }
    var pt = priorityTrello();
    if (pt && typeof pt.resolveCurrentBoardId === 'function') {
      try {
        var bid = await pt.resolveCurrentBoardId(t);
        return bid ? String(bid) : '';
      } catch (e2) {
        return '';
      }
    }
    return '';
  }

  async function loadStore(t) {
    try {
      var raw = await t.get('member', 'private', STORAGE_KEY);
      if (raw && typeof raw === 'object') return raw;
    } catch (e) {
      /* ignore */
    }
    return {};
  }

  async function saveStore(t, store) {
    await t.set('member', 'private', STORAGE_KEY, store || {});
  }

  function boardEntry(store, boardId) {
    if (!store[boardId] || typeof store[boardId] !== 'object') {
      store[boardId] = { calendarId: 'primary', events: {} };
    }
    if (!store[boardId].events || typeof store[boardId].events !== 'object') {
      store[boardId].events = {};
    }
    if (!store[boardId].calendarId) store[boardId].calendarId = 'primary';
    return store[boardId];
  }

  async function writeOutlookEventIdToDesc(t, cardId, eventId, currentDesc) {
    var dm = descMeta();
    var pt = priorityTrello();
    if (!dm || typeof dm.setMeta !== 'function') {
      return { ok: false, reason: 'no-desc-meta' };
    }
    if (!pt || typeof pt.restPutCard !== 'function') {
      return { ok: false, reason: 'no-rest' };
    }
    var next = dm.setMeta(currentDesc || '', 'outlook-event-id', eventId);
    if (next === (currentDesc || '')) {
      return { ok: true, changed: false, desc: next };
    }
    var put = await pt.restPutCard(t, cardId, { desc: next });
    if (!put || !put.ok) {
      return Object.assign({ ok: false, reason: 'rest-desc-meta' }, put || {});
    }
    return { ok: true, changed: true, desc: next };
  }

  /**
   * If member-private outlookSync already has an eventId for this card,
   * ensure it is also stored in the card description (hidden meta block).
   * No Graph call — safe after a past successful sync.
   */
  async function ensureDescMetaFromStore(t, cardId, currentDesc) {
    var id = cardId != null ? String(cardId).trim() : '';
    if (!id) return { ok: false, reason: 'no-card-id', desc: currentDesc || '' };

    var dm = descMeta();
    if (dm && typeof dm.getMeta === 'function') {
      var existing = dm.getMeta(currentDesc || '', 'outlook-event-id');
      if (existing) {
        return {
          ok: true,
          changed: false,
          already: true,
          desc: currentDesc || '',
          eventId: existing,
        };
      }
    }

    var boardId = await resolveBoardId(t);
    if (!boardId) {
      return { ok: false, reason: 'no-board-id', desc: currentDesc || '' };
    }
    var store = await loadStore(t);
    var entry = boardEntry(store, boardId);
    var mapped = entry.events && entry.events[id];
    var eventId = mapped && mapped.eventId ? String(mapped.eventId) : '';
    if (!eventId) {
      return { ok: true, changed: false, missing: true, desc: currentDesc || '' };
    }

    return writeOutlookEventIdToDesc(t, id, eventId, currentDesc || '');
  }

  async function applyToTrello(t, cardId, snapshot) {
    var s = normalizeSnapshot(snapshot);
    var pt = priorityTrello();
    var gt = ganttTrello();
    if (!pt || typeof pt.restPutCard !== 'function') {
      return { ok: false, reason: 'no-rest' };
    }
    if (gt && typeof gt.ensureRestAuthorized === 'function') {
      var authRes = await gt.ensureRestAuthorized(t);
      if (!authRes || !authRes.ok) {
        return Object.assign({ ok: false }, authRes || { reason: 'not-authorized' });
      }
    }

    var body = {};
    if (s.name) body.name = s.name;
    if (typeof s.desc === 'string') {
      var dm = descMeta();
      if (
        dm &&
        typeof dm.joinDesc === 'function' &&
        typeof dm.splitDesc === 'function' &&
        snapshot &&
        snapshot._fullDesc != null
      ) {
        var split = dm.splitDesc(String(snapshot._fullDesc));
        body.desc = dm.joinDesc(s.desc, split.meta);
      } else {
        body.desc = s.desc;
      }
    }

    if (Object.keys(body).length) {
      var put = await pt.restPutCard(t, cardId, body);
      if (!put || !put.ok) {
        return Object.assign({ ok: false, reason: 'rest-name-desc' }, put || {});
      }
    }

    if (gt && typeof gt.saveCardDates === 'function') {
      var dates = await gt.saveCardDates(t, cardId, {
        startDate: s.startDate,
        dueDate: s.dueDate,
        dueTime: s.dueTime,
      });
      if (!dates || !dates.ok) {
        return Object.assign({ ok: false, reason: 'rest-dates' }, dates || {});
      }
    }

    return { ok: true };
  }

  async function ensureToken() {
    var a = auth();
    if (!a) return { ok: false, reason: 'no-outlook-auth' };
    if (typeof a.isConfigured === 'function' && !a.isConfigured()) {
      return { ok: false, reason: 'no-client-id' };
    }
    var tok = await a.getAccessToken();
    return tok;
  }

  async function syncOneCard(t, accessToken, boardId, card, mapEntry, calendarId) {
    var g = graph();
    if (!g) return { ok: false, reason: 'no-graph' };

    var cardId = String(card.id);
    var trelloSnap = snapshotFromCard(card);
    var interval = resolveCardInterval(card);
    if (!interval) {
      // Undated: delete mapped event if any
      if (mapEntry && mapEntry.eventId) {
        await g.deleteEvent(accessToken, mapEntry.eventId);
        return { ok: true, action: 'deleted-undated', clearMap: true };
      }
      return { ok: true, action: 'skip-undated', clearMap: true };
    }

    if (!mapEntry || !mapEntry.eventId) {
      var createBody = buildEventPayload(trelloSnap, cardId);
      var created = await g.createEvent(accessToken, calendarId, createBody);
      var eventId = created && created.id ? String(created.id) : '';
      if (!eventId) return { ok: false, reason: 'create-no-id' };
      try {
        await g.setCardLinkExtension(accessToken, eventId, cardId);
      } catch (extErr) {
        console.warn('OutlookSync extension failed', extErr);
      }
      try {
        await writeOutlookEventIdToDesc(t, cardId, eventId, card.desc || '');
      } catch (descErr) {
        console.warn('OutlookSync desc meta failed', descErr);
      }
      return {
        ok: true,
        action: 'created',
        eventId: eventId,
        lastSynced: trelloSnap,
      };
    }

    var event = await g.getEvent(accessToken, mapEntry.eventId);
    if (!event) {
      var recreate = buildEventPayload(trelloSnap, cardId);
      var recreated = await g.createEvent(accessToken, calendarId, recreate);
      var newId = recreated && recreated.id ? String(recreated.id) : '';
      if (!newId) return { ok: false, reason: 'recreate-no-id' };
      try {
        await g.setCardLinkExtension(accessToken, newId, cardId);
      } catch (e2) {
        /* ignore */
      }
      try {
        await writeOutlookEventIdToDesc(t, cardId, newId, card.desc || '');
      } catch (descErr2) {
        console.warn('OutlookSync desc meta failed', descErr2);
      }
      return {
        ok: true,
        action: 'recreated',
        eventId: newId,
        lastSynced: trelloSnap,
      };
    }

    var outlookSnap = snapshotFromEvent(event);
    var merged = mergeCardEvent(
      trelloSnap,
      outlookSnap,
      mapEntry.lastSynced || emptySnapshot()
    );

    if (merged.toTrello) {
      var pull = Object.assign({}, merged.toTrello, {
        _fullDesc: card.desc || '',
      });
      var tRes = await applyToTrello(t, cardId, pull);
      if (!tRes.ok) return Object.assign({ action: 'merge' }, tRes);
    }
    if (merged.toOutlook) {
      var patch = patchFromSnapshot(merged.toOutlook);
      if (patch) {
        await g.updateEvent(accessToken, mapEntry.eventId, patch);
      }
    }

    // Keep description meta in sync with mapped event id (Power Automate / Free Trello).
    try {
      await writeOutlookEventIdToDesc(
        t,
        cardId,
        mapEntry.eventId,
        card.desc || ''
      );
    } catch (descErr3) {
      /* ignore */
    }

    return {
      ok: true,
      action: 'merged',
      eventId: mapEntry.eventId,
      lastSynced: merged.nextSynced,
      pushed: !!merged.toOutlook,
      pulled: !!merged.toTrello,
    };
  }

  async function syncBoard(t, options) {
    options = options || {};
    var tokenRes = await ensureToken();
    if (!tokenRes.ok) {
      return {
        ok: false,
        reason: tokenRes.reason || 'not-connected',
        error: tokenRes.error,
      };
    }
    var accessToken = tokenRes.accessToken;
    var boardId = options.boardId || (await resolveBoardId(t));
    if (!boardId) return { ok: false, reason: 'no-board-id' };

    var gt = ganttTrello();
    if (!gt || typeof gt.loadBoard !== 'function') {
      return { ok: false, reason: 'no-gantt-trello' };
    }

    var data = options.boardData || (await gt.loadBoard(t));
    var cards = (data && data.cards) || [];
    var store = await loadStore(t);
    var entry = boardEntry(store, boardId);
    var calendarId = entry.calendarId || 'primary';
    var eventsMap = entry.events;
    var seen = Object.create(null);

    var summary = {
      ok: true,
      created: 0,
      updated: 0,
      deleted: 0,
      merged: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [],
    };

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card || !card.id) continue;
      var cardId = String(card.id);
      seen[cardId] = true;
      var mapEntry = eventsMap[cardId] || null;
      try {
        var res = await syncOneCard(
          t,
          accessToken,
          boardId,
          card,
          mapEntry,
          calendarId
        );
        if (!res || !res.ok) {
          summary.errors++;
          summary.errorDetails.push({
            cardId: cardId,
            reason: (res && res.reason) || 'error',
          });
          continue;
        }
        if (res.clearMap) {
          if (eventsMap[cardId]) {
            delete eventsMap[cardId];
            if (res.action === 'deleted-undated') summary.deleted++;
            else summary.skipped++;
          } else {
            summary.skipped++;
          }
        } else if (res.eventId) {
          eventsMap[cardId] = {
            eventId: res.eventId,
            lastSynced: normalizeSnapshot(res.lastSynced),
          };
          if (res.action === 'created' || res.action === 'recreated') {
            summary.created++;
          } else if (res.pushed || res.pulled) {
            summary.updated++;
            summary.merged++;
          } else {
            summary.merged++;
          }
        }
      } catch (err) {
        summary.errors++;
        summary.errorDetails.push({
          cardId: cardId,
          reason: err && err.message ? err.message : String(err),
        });
        console.error('OutlookSync.syncBoard card failed', cardId, err);
      }
    }

    // Orphan mappings: card gone → delete Outlook event
    var g = graph();
    var orphanIds = Object.keys(eventsMap);
    for (var oi = 0; oi < orphanIds.length; oi++) {
      var oid = orphanIds[oi];
      if (seen[oid]) continue;
      var orphan = eventsMap[oid];
      try {
        if (g && orphan && orphan.eventId) {
          await g.deleteEvent(accessToken, orphan.eventId);
        }
        delete eventsMap[oid];
        summary.deleted++;
      } catch (delErr) {
        summary.errors++;
        summary.errorDetails.push({
          cardId: oid,
          reason: delErr && delErr.message ? delErr.message : String(delErr),
        });
      }
    }

    entry.events = eventsMap;
    store[boardId] = entry;
    try {
      await saveStore(t, store);
    } catch (saveErr) {
      summary.ok = false;
      summary.reason = 'store-save-failed';
      summary.error = saveErr && saveErr.message ? saveErr.message : String(saveErr);
    }

    if (summary.errors > 0 && summary.created + summary.updated + summary.merged === 0) {
      summary.ok = false;
      summary.reason = 'all-failed';
    }

    return summary;
  }

  async function syncCard(t, cardId, options) {
    options = options || {};
    var id = cardId != null ? String(cardId).trim() : '';
    if (!id) return { ok: false, reason: 'no-card-id' };

    var tokenRes = await ensureToken();
    if (!tokenRes.ok) return tokenRes;

    var boardId = options.boardId || (await resolveBoardId(t));
    if (!boardId) return { ok: false, reason: 'no-board-id' };

    var gt = ganttTrello();
    var data = options.boardData || (await gt.loadBoard(t));
    var cards = (data && data.cards) || [];
    var card = null;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i] && String(cards[i].id) === id) {
        card = cards[i];
        break;
      }
    }
    if (!card) {
      // Card missing: treat as orphan delete
      var storeMissing = await loadStore(t);
      var entryMissing = boardEntry(storeMissing, boardId);
      var mapMissing = entryMissing.events[id];
      if (mapMissing && mapMissing.eventId) {
        var g = graph();
        if (g) await g.deleteEvent(tokenRes.accessToken, mapMissing.eventId);
        delete entryMissing.events[id];
        await saveStore(t, storeMissing);
        return { ok: true, action: 'deleted-orphan' };
      }
      return { ok: true, action: 'skip-missing' };
    }

    var store = await loadStore(t);
    var entry = boardEntry(store, boardId);
    var res = await syncOneCard(
      t,
      tokenRes.accessToken,
      boardId,
      card,
      entry.events[id] || null,
      entry.calendarId || 'primary'
    );
    if (!res || !res.ok) return res || { ok: false, reason: 'sync-failed' };

    if (res.clearMap) {
      delete entry.events[id];
    } else if (res.eventId) {
      entry.events[id] = {
        eventId: res.eventId,
        lastSynced: normalizeSnapshot(res.lastSynced),
      };
    }
    store[boardId] = entry;
    await saveStore(t, store);
    return res;
  }

  function scheduleSyncCard(t, cardId) {
    var id = cardId != null ? String(cardId) : '';
    if (!id) return;
    if (cardSyncTimers[id]) {
      clearTimeout(cardSyncTimers[id]);
    }
    cardSyncTimers[id] = setTimeout(function () {
      delete cardSyncTimers[id];
      var a = auth();
      if (!a || typeof a.isConnected !== 'function') return;
      a.isConnected().then(function (connected) {
        if (!connected) return;
        syncCard(t, id).catch(function (err) {
          console.error('OutlookSync.scheduleSyncCard failed', id, err);
        });
      });
    }, SYNC_DEBOUNCE_MS);
  }

  global.OutlookSync = {
    STORAGE_KEY: STORAGE_KEY,
    FIELDS: FIELDS,
    emptySnapshot: emptySnapshot,
    normalizeSnapshot: normalizeSnapshot,
    snapshotsEqual: snapshotsEqual,
    mergeCardEvent: mergeCardEvent,
    resolveCardInterval: resolveCardInterval,
    snapshotFromCard: snapshotFromCard,
    snapshotFromEvent: snapshotFromEvent,
    buildEventPayload: buildEventPayload,
    parseGraphDatePart: parseGraphDatePart,
    bodyTextFromEvent: bodyTextFromEvent,
    addDaysIso: addDaysIso,
    syncBoard: syncBoard,
    syncCard: syncCard,
    scheduleSyncCard: scheduleSyncCard,
    writeOutlookEventIdToDesc: writeOutlookEventIdToDesc,
    ensureDescMetaFromStore: ensureDescMetaFromStore,
    loadStore: loadStore,
    saveStore: saveStore,
  };
})(typeof window !== 'undefined' ? window : this);
