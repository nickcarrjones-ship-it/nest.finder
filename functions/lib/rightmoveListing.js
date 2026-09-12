/**
 * Reading a Rightmove property page.
 *
 * This lives in the CLOUD FUNCTION rather than in the app, deliberately.
 * Rightmove's page format has already changed once — it used to be a plain
 * JSON object and is now a flattened reference graph — so when it changes
 * again the fix has to be a function deploy, not an App Store release that
 * takes a week and leaves every existing install broken in the meantime.
 *
 * Verified against a live listing on 2026-09-12 (property 167753189):
 * address, price, exact coordinates, beds, baths and property type are all
 * present and reachable. The coordinates are the reason this is worth
 * doing at all — they come with the listing, so a pasted link puts a pin
 * exactly on the property with no geocoder in the loop.
 *
 * EVERYTHING HERE FAILS LOUDLY. A format change must surface as an error
 * the user sees ("couldn't read that link, type it in") and never as a
 * viewing quietly saved with a blank address.
 */

class ListingParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ListingParseError';
  }
}

/**
 * The ONLY URL this service will ever fetch, rebuilt from scratch.
 *
 * The user pastes arbitrary text. Fetching that text from a server is a
 * textbook SSRF vector — a crafted URL could reach the metadata endpoint,
 * an internal address, or a redirect chain into either. So nothing the
 * user typed is ever passed to fetch(): the host is checked against
 * Rightmove exactly, the numeric property id is pulled out, and a
 * canonical URL is CONSTRUCTED from that id alone.
 *
 * Returns null for anything that isn't a Rightmove property link, which
 * the caller turns into "that doesn't look like a Rightmove property".
 */
function rightmovePropertyUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;

  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  // Exact host match, not endsWith: "rightmove.co.uk.evil.com" ends with
  // nothing useful, but "notrightmove.co.uk" would pass a sloppy suffix
  // test. Subdomains are listed rather than pattern-matched.
  const host = parsed.hostname.toLowerCase();
  const ALLOWED = ['www.rightmove.co.uk', 'rightmove.co.uk', 'm.rightmove.co.uk'];
  if (!ALLOWED.includes(host)) return null;

  // /properties/167753189 — with or without a trailing slash, #fragment or
  // the utm_* query Rightmove's own share links carry.
  const match = /^\/properties\/(\d{4,12})\/?$/.exec(parsed.pathname);
  if (!match) return null;

  return {
    listingId: match[1],
    url: `https://www.rightmove.co.uk/properties/${match[1]}`,
  };
}

/**
 * Pull `window.__PAGE_MODEL = {...}` out of the HTML.
 *
 * Scans for the matching close brace rather than slicing to `</script>`,
 * because that script tag carries more than this one assignment. The scan
 * is string-aware — it steps over quoted text and backslash escapes — so
 * a brace inside an estate agent's free-text description cannot throw the
 * depth count off. (A naive counter happens to survive balanced JSON
 * inside a string, which is exactly the kind of luck that breaks later.)
 */
function extractPageModel(html) {
  if (typeof html !== 'string') throw new ListingParseError('No page content');

  const marker = /window\.__PAGE_MODEL\s*=\s*/.exec(html);
  if (!marker) throw new ListingParseError('Page model not found — Rightmove may have changed format');

  const start = marker.index + marker[0].length;
  if (html[start] !== '{') throw new ListingParseError('Page model is not an object');

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < html.length; i++) {
    const c = html[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) throw new ListingParseError('Page model never closed');

  try {
    return JSON.parse(html.slice(start, end));
  } catch (e) {
    throw new ListingParseError(`Page model is not valid JSON: ${e.message}`);
  }
}

/**
 * Resolve the flattened reference graph.
 *
 * Every value in the array is either a primitive or an object/array whose
 * own values are INDICES back into the same array — so `{"address": 21}`
 * means "the address is whatever is at index 21". Primitives are
 * deduplicated, which is why `null` and `true` each appear once and are
 * pointed at from all over.
 *
 * Depth-limited and cycle-guarded: this is untrusted input from a third
 * party, and a self-referencing graph must not take the function down.
 */
function hydrate(flat, index, seen = new Set(), depth = 0) {
  if (depth > 20) return null;
  if (!Number.isInteger(index) || index < 0 || index >= flat.length) return null;

  const value = flat[index];
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(index)) return null;

  const nextSeen = new Set(seen).add(index);

  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'number' ? hydrate(flat, v, nextSeen, depth + 1) : v));
  }

  const out = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    out[key] = typeof v === 'number' ? hydrate(flat, v, nextSeen, depth + 1) : v;
  }
  return out;
}

/**
 * "£640,000" -> 640000. "£2,500 pcm" -> 2500. "POA" -> null.
 *
 * Returned alongside the display string, never instead of it: the display
 * string is what Rightmove chose to say and is what gets shown, while the
 * number exists only so viewings can be sorted and totalled. Anything
 * unparseable gives null rather than 0 — a property with no number is not
 * a free one.
 */
function parsePriceValue(display) {
  if (typeof display !== 'string') return null;
  const digits = display.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Rightmove withholds the incode on plenty of listings, so a partial
 *  postcode ("SE2") is the normal case, not a failure. */
function joinPostcode(outcode, incode) {
  const out = typeof outcode === 'string' ? outcode.trim() : '';
  const inc = typeof incode === 'string' ? incode.trim() : '';
  if (!out) return null;
  return inc ? `${out} ${inc}` : out;
}

/**
 * The whole job: HTML in, a normalised listing out.
 *
 * Throws ListingParseError if the two things that make a viewing worth
 * having — an address and a location — are not both present. Everything
 * else is optional and comes back null when Rightmove hasn't got it.
 */
function parseRightmoveListing(html) {
  const model = extractPageModel(html);

  if (typeof model.data !== 'string') {
    throw new ListingParseError('Page model has no data payload');
  }

  let flat;
  try {
    flat = JSON.parse(model.data);
  } catch (e) {
    throw new ListingParseError(`Data payload is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(flat) || flat.length === 0) {
    throw new ListingParseError('Data payload is not a reference graph');
  }

  const root = hydrate(flat, 0);
  const property = root && root.propertyData;
  if (!property || typeof property !== 'object') {
    throw new ListingParseError('No property data on the page');
  }

  const address = property.address || {};
  const prices = property.prices || {};
  const location = property.location || {};

  const displayAddress = typeof address.displayAddress === 'string' ? address.displayAddress.trim() : '';
  const lat = typeof location.latitude === 'number' ? location.latitude : null;
  const lng = typeof location.longitude === 'number' ? location.longitude : null;

  if (!displayAddress) throw new ListingParseError('Listing has no address');
  if (lat === null || lng === null) throw new ListingParseError('Listing has no location');

  const priceText = typeof prices.primaryPrice === 'string' ? prices.primaryPrice.trim() : null;

  return {
    source: 'rightmove',
    address: displayAddress,
    postcode: joinPostcode(address.outcode, address.incode),
    priceText,
    priceValue: parsePriceValue(priceText),
    /** "Offers over", "Guide price" — empty string on most listings. */
    priceQualifier:
      typeof prices.displayPriceQualifier === 'string' && prices.displayPriceQualifier.trim()
        ? prices.displayPriceQualifier.trim()
        : null,
    lat,
    lng,
    /**
     * Rightmove says whether the pin is the real address or the middle of
     * a postcode. Passed through rather than flattened away, so the map can
     * be honest about a pin it isn't sure of instead of implying a
     * precision the listing never claimed.
     */
    pinAccurate: location.pinType === 'ACCURATE_POINT',
    bedrooms: typeof property.bedrooms === 'number' ? property.bedrooms : null,
    bathrooms: typeof property.bathrooms === 'number' ? property.bathrooms : null,
    propertyType:
      typeof property.propertySubType === 'string' && property.propertySubType.trim()
        ? property.propertySubType.trim()
        : null,
    channel: property.channel === 'RES_LET' ? 'rent' : property.channel === 'RES_BUY' ? 'buy' : null,
  };
}

module.exports = {
  ListingParseError,
  rightmovePropertyUrl,
  parseRightmoveListing,
  parsePriceValue,
  // Exported for the tests only.
  extractPageModel,
  hydrate,
};
