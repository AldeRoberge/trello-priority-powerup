'use strict';
/*
 * Answers for every host outside the fake Trello. The suite never reaches the real internet except
 * the font / icon CDNs (so icons render like they do for a user); every other external request is
 * either mocked here or blocked and reported as an "unmocked-external" warning.
 */

const ALLOW_CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const LLM_HOST = /^https:\/\/mock-llm\.test\//;
const LINK_HOSTS = /^https:\/\/(trello\.com|github\.com|www\.google\.com|unsplash\.com|images\.unsplash\.com|cli\.github\.com|make\.powerautomate\.com|login\.microsoftonline\.com|graph\.microsoft\.com|raw\.githubusercontent\.com)\//;

function llmReply(userText) {
  const text = String(userText || '');
  const out = { message: 'Reçu : ' + text.replace(/\s+/g, ' ').trim().slice(0, 60), actions: [], suggestions: [], followUps: [] };
  if (/\[chips\]/.test(text)) out.suggestions = ['Alpha', 'Bravo', 'Charlie'];
  return out;
}

function lastUser(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return String(messages[i].content || '');
  }
  return '';
}

function fulfillLlm(route) {
  let body = {};
  try {
    body = JSON.parse(route.request().postData() || '{}');
  } catch (e) { /* ignore */ }
  const content = JSON.stringify(llmReply(lastUser(body.messages)));
  if (body.stream) {
    const chunk = 'data: ' + JSON.stringify({ model: body.model || 'mock', choices: [{ delta: { content }, finish_reason: null }] }) + '\n\n';
    const fin =
      'data: ' +
      JSON.stringify({ model: body.model || 'mock', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) +
      '\n\ndata: [DONE]\n\n';
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' }, body: chunk + fin });
  }
  return route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ model: body.model || 'mock', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
  });
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

/**
 * Installs the routes on a browser context. `localOrigin` is the fake Trello server; `onUnmocked`
 * receives the URL of any blocked external request.
 */
async function installMocks(context, localOrigin, onUnmocked) {
  await context.route(
    (url) => url.origin !== localOrigin && url.protocol.indexOf('http') === 0,
    async (route) => {
      const req = route.request();
      const url = req.url();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (ALLOW_CDN.test(url)) return route.continue().catch(() => {});
      if (LLM_HOST.test(url)) {
        if (/chat\/completions/.test(url)) return fulfillLlm(route);
        return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ data: [] }) });
      }
      if (/^https:\/\/api\.open-meteo\.com\//.test(url)) {
        return route.fulfill({
          status: 200,
          headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
          body: JSON.stringify({
            current: { temperature_2m: 12, weather_code: 3, is_day: 1, wind_speed_10m: 8, precipitation: 0, relative_humidity_2m: 60, apparent_temperature: 10 },
            daily: { time: [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)), weather_code: [3, 1, 61, 2, 0, 3, 80], temperature_2m_max: [12, 14, 9, 11, 15, 13, 10], temperature_2m_min: [3, 5, 2, 4, 6, 4, 3], precipitation_probability_max: [10, 0, 80, 20, 0, 30, 70] },
            hourly: { time: [], temperature_2m: [], weather_code: [], precipitation_probability: [] },
          }),
        });
      }
      if (/^https:\/\/(geocoding-api\.open-meteo\.com|nominatim\.openstreetmap\.org)\//.test(url)) {
        return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ results: [{ name: 'Val-d’Or', latitude: 48.1, longitude: -77.78, country: 'Canada', admin1: 'Québec' }] }) });
      }
      if (LINK_HOSTS.test(url)) {
        // Links the user can open in a new tab: answer an empty page so the click completes.
        return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<!doctype html><title>externe</title><p>Page externe (simulée)</p>' });
      }
      onUnmocked(url);
      return route.abort('blockedbyclient');
    }
  );
}

module.exports = { installMocks, ALLOW_CDN };
