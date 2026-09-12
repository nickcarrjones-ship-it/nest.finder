const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildCalendar, escapeText, fold, utcStamp } = require('./calendarFeed');

/** A viewing with everything filled in, so each test can knock one part out. */
function viewing(over) {
  return Object.assign({
    id: 'v1',
    address: '22 High Street',
    postcode: 'SW6 1AA',
    viewingAt: Date.UTC(2026, 8, 14, 13, 30),
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'Flat',
    priceText: '£640,000',
    lat: 51.48,
    lng: -0.19,
    pinAccurate: true,
    listingUrl: 'https://www.rightmove.co.uk/properties/167753189',
    notes: null,
  }, over || {});
}

const NOW = Date.UTC(2026, 8, 12, 9, 0);
const build = (list, opts) => buildCalendar(list, Object.assign({ now: NOW }, opts || {}));

/** Every line of the output, unfolded, so assertions read like the file. */
function lines(ics) {
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('the four faults the web app shipped', () => {
  // Fault 1: times with no timezone read as local time wherever they land.
  test('every time is UTC and says so', () => {
    const ics = build([viewing()]);
    assert.match(ics, /DTSTART:20260914T133000Z/);
    assert.match(ics, /DTEND:20260914T140000Z/);
    assert.match(ics, /DTSTAMP:20260912T090000Z/);
    // No naked local time anywhere — that is the bug, spelled out.
    for (const line of lines(ics)) {
      if (/^(DTSTART|DTEND|DTSTAMP):/.test(line)) assert.ok(line.endsWith('Z'), line);
    }
  });

  // Fault 2: a comma is a field separator, and London addresses are full
  // of them. Unescaped, the event silently loses everything after one.
  test('escapes commas, semicolons, backslashes and newlines', () => {
    assert.equal(escapeText('Flat 1, 22 High St'), 'Flat 1\\, 22 High St');
    assert.equal(escapeText('a;b'), 'a\;b');
    assert.equal(escapeText('a\\b'), 'a\\\\b');
    assert.equal(escapeText('one\ntwo'), 'one\\ntwo');
  });

  test('escapes the backslash before the characters it then adds', () => {
    // Wrong order gives 'a\\\\,b' — the escape escaping itself.
    assert.equal(escapeText('a\\,b'), 'a\\\\\\,b');
  });

  // Fault 3: RFC 5545 requires DTSTAMP; some readers reject a feed without.
  test('every event carries a DTSTAMP', () => {
    const ics = build([viewing({ id: 'a' }), viewing({ id: 'b' })]);
    assert.equal(lines(ics).filter((l) => l.startsWith('DTSTAMP:')).length, 2);
  });

  // Fault 4: 75 octets is the cap, and an address plus a listing URL is
  // comfortably past it.
  test('folds any line over 75 octets', () => {
    const long = 'x'.repeat(200);
    const folded = fold(`SUMMARY:${long}`);
    for (const line of folded.split('\r\n')) {
      assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `${Buffer.byteLength(line)} octets`);
    }
    // Unfolds back to exactly what went in.
    assert.equal(folded.replace(/\r\n /g, ''), `SUMMARY:${long}`);
  });

  test('never splits a character in half when folding', () => {
    // A café on a long enough street to force a fold right through the é.
    const value = 'SUMMARY:' + 'é'.repeat(60);
    const folded = fold(value);
    assert.ok(!folded.includes('�'), 'a character was cut in half');
    assert.equal(folded.replace(/\r\n /g, ''), value);
    for (const line of folded.split('\r\n')) {
      assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
    }
  });
});

describe('what goes in the calendar and what does not', () => {
  test('leaves out a viewing with no date', () => {
    // "We want to see this" is a real state in the app and it is not an
    // appointment — it belongs in the list, not the diary.
    const ics = build([viewing({ id: 'dated' }), viewing({ id: 'idea', viewingAt: null })]);
    assert.match(ics, /UID:dated@/);
    assert.ok(!ics.includes('UID:idea@'));
  });

  test('skips anything without an id or an address', () => {
    const ics = build([viewing({ id: '' }), viewing({ address: '' }), null]);
    assert.ok(!ics.includes('BEGIN:VEVENT'));
  });

  test('gives an empty household a valid, empty calendar', () => {
    const ics = build([]);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!ics.includes('BEGIN:VEVENT'));
  });

  test('keeps the id stable, so changing the time moves the event', () => {
    const early = build([viewing({ viewingAt: Date.UTC(2026, 8, 14, 10, 0) })]);
    const later = build([viewing({ viewingAt: Date.UTC(2026, 8, 14, 16, 0) })]);
    assert.match(early, /UID:v1@maloca\.homes/);
    assert.match(later, /UID:v1@maloca\.homes/);
    assert.notEqual(early, later);
  });
});

describe('the event as someone reads it at the door', () => {
  test('leads with the word they are scanning for', () => {
    assert.match(build([viewing()]), /SUMMARY:Viewing: 22 High Street \(2 bed flat\)/);
  });

  test('drops the bracket when the listing said nothing about the property', () => {
    const ics = build([viewing({ bedrooms: null, propertyType: null })]);
    assert.match(ics, /SUMMARY:Viewing: 22 High Street\r\n/);
  });

  test('puts the price, the baths, the notes and the link in the body', () => {
    const ics = build([viewing({ notes: 'Ask about the lease' })]);
    const body = lines(ics).find((l) => l.startsWith('DESCRIPTION:'));
    assert.match(body, /£640\\,000/);
    assert.match(body, /1 bath/);
    assert.match(body, /Ask about the lease/);
    assert.match(body, /rightmove\.co\.uk/);
  });

  test('joins the address and postcode into the location', () => {
    assert.match(build([viewing()]), /LOCATION:22 High Street\\, SW6 1AA/);
  });
});

describe('coordinates', () => {
  test('sends them only when they are the actual property', () => {
    assert.match(build([viewing()]), /GEO:51\.48;-0\.19/);
  });

  test('withholds a postcode-centre pin, which a calendar would navigate to', () => {
    // Our own map labels an approximate pin as approximate. A calendar
    // does not — it just says "directions", and someone drives there.
    assert.ok(!build([viewing({ pinAccurate: false })]).includes('GEO:'));
  });

  test('withholds a missing coordinate rather than sending half of one', () => {
    assert.ok(!build([viewing({ lat: null, lng: null })]).includes('GEO:'));
    assert.ok(!build([viewing({ lat: 51.48, lng: null })]).includes('GEO:'));
  });
});

describe('the calendar itself', () => {
  test('names itself, so it is identifiable among a dozen subscriptions', () => {
    assert.match(build([], { name: 'Nick & Harriet viewings' }), /X-WR-CALNAME:Nick & Harriet viewings/);
  });

  test('escapes a household name with a comma in it', () => {
    assert.match(build([], { name: 'Nick, Harriet' }), /X-WR-CALNAME:Nick\\, Harriet/);
  });

  test('ends every line the way the format requires', () => {
    const ics = build([viewing()]);
    assert.ok(!/[^\r]\n/.test(ics), 'a bare newline reached the file');
  });

  test('asks to be refreshed hourly, knowing it may be ignored', () => {
    assert.match(build([]), /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  });
});

describe('utcStamp', () => {
  test('drops the punctuation and the milliseconds', () => {
    assert.equal(utcStamp(Date.UTC(2026, 0, 5, 7, 8, 9)), '20260105T070809Z');
  });
});
