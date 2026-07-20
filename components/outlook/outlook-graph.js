/* Microsoft Graph calendar helpers (browser fetch + bearer token). */
(function (global) {
  'use strict';

  function cfg() {
    return global.OutlookConfig || {};
  }

  function graphBase() {
    return cfg().graphBase || 'https://graph.microsoft.com/v1.0';
  }

  function extensionName() {
    return cfg().extensionName || 'Com.TrelloCerveau.CardLink';
  }

  function calendarPath(calendarId) {
    if (!calendarId || calendarId === 'primary') {
      return '/me/calendar';
    }
    return '/me/calendars/' + encodeURIComponent(calendarId);
  }

  function authHeaders(accessToken, extra) {
    var headers = {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) {
          headers[k] = extra[k];
        }
      }
    }
    return headers;
  }

  async function graphFetch(accessToken, method, path, body, extraHeaders) {
    var url = path.indexOf('http') === 0 ? path : graphBase() + path;
    var opts = {
      method: method || 'GET',
      headers: authHeaders(accessToken, extraHeaders),
    };
    if (body != null && method !== 'GET' && method !== 'DELETE') {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    var response = await fetch(url, opts);
    var text = '';
    try {
      text = await response.text();
    } catch (e) {
      text = '';
    }
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e2) {
        data = { raw: text };
      }
    }
    if (!response.ok) {
      var err = new Error(
        'Graph ' + method + ' ' + path + ' failed: ' + response.status
      );
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function getEvent(accessToken, eventId) {
    if (!eventId) return null;
    try {
      return await graphFetch(
        accessToken,
        'GET',
        '/me/events/' +
          encodeURIComponent(eventId) +
          '?$select=id,subject,body,bodyPreview,start,end,isAllDay,lastModifiedDateTime' +
          '&$expand=extensions($filter=id eq \'' +
          extensionName() +
          '\')'
      );
    } catch (err) {
      if (err && err.status === 404) return null;
      throw err;
    }
  }

  async function createEvent(accessToken, calendarId, eventBody) {
    return graphFetch(
      accessToken,
      'POST',
      calendarPath(calendarId) + '/events',
      eventBody
    );
  }

  async function updateEvent(accessToken, eventId, patch) {
    return graphFetch(
      accessToken,
      'PATCH',
      '/me/events/' + encodeURIComponent(eventId),
      patch
    );
  }

  async function deleteEvent(accessToken, eventId) {
    try {
      await graphFetch(
        accessToken,
        'DELETE',
        '/me/events/' + encodeURIComponent(eventId)
      );
      return { ok: true };
    } catch (err) {
      if (err && err.status === 404) return { ok: true, missing: true };
      throw err;
    }
  }

  /**
   * Attach / upsert open extension with trelloCardId.
   */
  async function setCardLinkExtension(accessToken, eventId, cardId) {
    var name = extensionName();
    var path =
      '/me/events/' +
      encodeURIComponent(eventId) +
      '/extensions/' +
      encodeURIComponent(name);
    var body = {
      '@odata.type': 'microsoft.graph.openTypeExtension',
      extensionName: name,
      trelloCardId: String(cardId),
    };
    try {
      await graphFetch(accessToken, 'PATCH', path, body);
      return { ok: true, updated: true };
    } catch (err) {
      if (err && (err.status === 404 || err.status === 400)) {
        await graphFetch(
          accessToken,
          'POST',
          '/me/events/' + encodeURIComponent(eventId) + '/extensions',
          body
        );
        return { ok: true, created: true };
      }
      throw err;
    }
  }

  global.OutlookGraph = {
    graphFetch: graphFetch,
    getEvent: getEvent,
    createEvent: createEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    setCardLinkExtension: setCardLinkExtension,
    calendarPath: calendarPath,
    extensionName: extensionName,
  };
})(typeof window !== 'undefined' ? window : this);
