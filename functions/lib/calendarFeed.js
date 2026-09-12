/**
 * Turns a household's viewings into a subscribable calendar.
 *
 * PURE — no Firebase, no network — so every rule below is testable under
 * plain Node, the same split lib/rightmoveListing.js uses.
 *
 * The web app shipped a version of this (commit af909af) and it had four
 * faults worth naming, because each one is invisible until it isn't:
 *
 *   1. Times carried no timezone, so an event read as 2:30pm in whatever
 *      zone the reader's phone happened to be in. Fine in London, wrong the
 *      moment either person is abroad. Everything here is UTC, ending Z.
 *   2. Nothing was escaped. A comma is a field separator in this format, so
 *      "Flat 1, 22 High Street" silently corrupted the event.
 *   3. No DTSTAMP, which RFC 5545 requires. Some readers reject a feed
 *      without one rather than ignoring it.
 *   4. No line folding. The format caps a line at 75 octets and a London
 *      address plus a Rightmove URL sails past that.
 */

const LINE_LIMIT = 75; // octets, per RFC 5545 §3.1
const DEFAULT_DURATION_MIN = 30;

/**
 * Escapes one text value. Order matters: backslashes first, or the
 * backslashes this function itself adds get escaped a second time.
 */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds a long line by continuing it on the next one after a single space.
 *
 * Measured in OCTETS, not characters, and never split mid-character: a
 * multi-byte character cut in half is a corrupt file, and London addresses
 * do contain them (Cafe Royal is fine, "Café" is not).
 */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= LINE_LIMIT) return line;

  const parts = [];
  let start = 0;
  let limit = LINE_LIMIT;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off any continuation byte (10xxxxxx) so a character is
    // never split across two lines.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.slice(start, end).toString('utf8'));
    start = end;
    limit = LINE_LIMIT - 1; // continuation lines lose one octet to the space
  }
  return parts.join('\r\n ');
}

/** 2026-09-14T13:30:00Z → "20260914T133000Z". Always UTC; see fault 1. */
function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * What the event is called in someone's calendar.
 *
 * Leads with "Viewing" because that is the word they are scanning their
 * week for, and the address is what tells them which one.
 */
function summaryFor(viewing) {
  const what = describeProperty(viewing);
  return what ? `Viewing: ${viewing.address} (${what})` : `Viewing: ${viewing.address}`;
}

function describeProperty(viewing) {
  const parts = [];
  if (typeof viewing.bedrooms === 'number') parts.push(`${viewing.bedrooms} bed`);
  if (viewing.propertyType) parts.push(String(viewing.propertyType).toLowerCase());
  return parts.length ? parts.join(' ') : null;
}

/** The body of the event: the things you want in your hand at the door. */
function descriptionFor(viewing) {
  const lines = [];
  if (viewing.priceText) lines.push(viewing.priceText);
  if (typeof viewing.bathrooms === 'number') lines.push(`${viewing.bathrooms} bath`);
  if (viewing.notes) lines.push(viewing.notes);
  if (viewing.listingUrl) lines.push(viewing.listingUrl);
  return lines.length ? lines.join('\n') : null;
}

function eventLines(viewing, now) {
  const start = viewing.viewingAt;
  const end = start + DEFAULT_DURATION_MIN * 60 * 1000;
  const lines = [
    'BEGIN:VEVENT',
    // Stable for the life of the viewing, so editing the time MOVES the
    // event rather than leaving the old one behind next to the new one.
    `UID:${viewing.id}@maloca.homes`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(summaryFor(viewing))}`,
  ];

  const location = [viewing.address, viewing.postcode].filter(Boolean).join(', ');
  if (location) lines.push(`LOCATION:${escapeText(location)}`);

  const description = descriptionFor(viewing);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);

  // Only when we actually know where the property is. A pin derived from
  // the middle of a postcode is fine on our own map, which says so — but
  // handed to a calendar it becomes "navigate here", and someone drives to
  // it. See the note on `lat` in mobile/lib/viewings.ts.
  if (viewing.pinAccurate && typeof viewing.lat === 'number' && typeof viewing.lng === 'number') {
    lines.push(`GEO:${viewing.lat};${viewing.lng}`);
  }

  if (viewing.listingUrl) lines.push(`URL:${escapeText(viewing.listingUrl)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * The whole calendar, as one .ics body.
 *
 * Viewings with no date are LEFT OUT rather than given a guessed slot —
 * "we'd like to see this" is a real state in the app (see ViewingStatus)
 * and it is not an appointment. It belongs in the list, not in the diary.
 */
function buildCalendar(viewings, opts) {
  const options = opts || {};
  const now = options.now || Date.now();
  const name = options.name || 'Maloca viewings';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Maloca//Viewings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Europe/London',
    // A REQUEST, not a guarantee: Apple and Google decide how often they
    // actually refresh a subscribed calendar, and both routinely ignore
    // this. It is the reason a viewing booked minutes beforehand may not
    // reach the calendar in time — the honest limit of this approach.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const viewing of viewings) {
    if (!viewing || typeof viewing.viewingAt !== 'number') continue;
    if (!viewing.id || !viewing.address) continue;
    lines.push(...eventLines(viewing, now));
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildCalendar, escapeText, fold, utcStamp };
