/**
 * listing-import.js
 * ─────────────────────────────────────────────────────────────
 * "Paste a listing" quick-add. Given a Rightmove/Zoopla URL, asks Claude
 * (via the signed-in Firebase proxy) to fetch the page server-side and
 * return the property's details as JSON. The browser can't fetch those
 * sites directly — they block cross-origin requests — so the fetch runs on
 * Anthropic's side using the web_fetch server tool. No new infrastructure:
 * the request goes through the same proxy the area AI already uses, so it
 * counts as one AI action and respects the monthly cap.
 *
 * Everything degrades gracefully: if the fetch is blocked or the reply
 * can't be parsed, fetchListing() throws and the caller falls back to
 * plain manual entry (today's behaviour) — the paste is never a dead end.
 * ─────────────────────────────────────────────────────────────
 */
window.ListingImport = (function () {
  'use strict';

  // Listing portals we advertise support for. We don't hard-block other
  // URLs (the model can still try), but we warn before spending an AI call.
  var SUPPORTED = /(^|\.)(rightmove\.co\.uk|zoopla\.co\.uk|onthemarket\.com)/i;

  function isSupported(url) {
    try { return SUPPORTED.test(new URL(url).hostname); }
    catch (e) { return false; }
  }

  function looksLikeUrl(url) {
    try { var u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch (e) { return false; }
  }

  // Ask Claude to fetch the listing and hand back structured details.
  // Resolves to an object whose fields may individually be null.
  async function fetchListing(url) {
    if (typeof callAnthropicMessages !== 'function') {
      throw new Error('AI features are not available.');
    }
    var body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }],
      messages: [{
        role: 'user',
        content:
          'Fetch this UK residential property listing and read its details:\n' + url + '\n\n' +
          'Then reply with ONLY a single JSON object — no prose, no markdown code fence. ' +
          'Use null for any value the page does not state. Shape:\n' +
          '{\n' +
          '  "address": "full street address including postcode, e.g. 24 Wilton Way, London E8 1BG",\n' +
          '  "postcode": "the UK postcode only",\n' +
          '  "area": "the London neighbourhood or area name, e.g. London Fields",\n' +
          '  "price": 650000,            // asking price as a plain integer in pounds, no symbols or commas\n' +
          '  "beds": 2,                  // integer\n' +
          '  "bathrooms": 1,             // integer\n' +
          '  "propertyType": "Flat",     // e.g. Flat, Terraced house, Maisonette\n' +
          '  "tenure": "Leasehold",      // Leasehold, Freehold, or Share of Freehold\n' +
          '  "lat": 51.5417,             // latitude if shown, else null\n' +
          '  "lng": -0.0586              // longitude if shown, else null\n' +
          '}'
      }]
    };

    var data = await callAnthropicMessages(body);
    var parsed = parseListingJson(data);
    if (!parsed) throw new Error('Could not read the listing details.');
    return normalise(parsed);
  }

  // Join every text block in the reply, then pull the first {...} object out.
  function parseListingJson(data) {
    var blocks = (data && data.content) || [];
    var text = blocks
      .filter(function (b) { return b && b.type === 'text' && b.text; })
      .map(function (b) { return b.text; })
      .join('\n');
    if (!text) return null;

    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); }
    catch (e) { return null; }
  }

  // Coerce the model's JSON into the exact types the form expects.
  function normalise(p) {
    function num(v) {
      if (v === null || v === undefined || v === '') return null;
      var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
      return isFinite(n) ? n : null;
    }
    function str(v) {
      if (v === null || v === undefined) return null;
      var s = String(v).trim();
      return s ? s : null;
    }
    return {
      address: str(p.address),
      postcode: str(p.postcode),
      area: str(p.area),
      price: num(p.price),
      beds: num(p.beds),
      bathrooms: num(p.bathrooms),
      propertyType: str(p.propertyType),
      tenure: str(p.tenure),
      lat: num(p.lat),
      lng: num(p.lng)
    };
  }

  return { fetchListing: fetchListing, isSupported: isSupported, looksLikeUrl: looksLikeUrl };
})();
