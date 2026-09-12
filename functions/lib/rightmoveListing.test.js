const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ListingParseError,
  rightmovePropertyUrl,
  parseRightmoveListing,
  parsePriceValue,
  extractPageModel,
} = require('./rightmoveListing');

/**
 * A miniature of the real thing.
 *
 * These are genuine values and the genuine flattened shape, read off a
 * live listing on 2026-09-12 (property 167753189) and reduced to the
 * entries that matter. Keeping a 380KB page in the repo would test the
 * same three functions and cost every future reader the download.
 *
 * What a fixture CANNOT catch is Rightmove renaming a field — only a live
 * request can. That is precisely why parseRightmoveListing throws instead
 * of returning blanks: the day the format moves, the app says "couldn't
 * read that link" rather than saving a viewing with no address in it.
 */
function pageWith(flat) {
  const model = JSON.stringify({ data: JSON.stringify(flat), encoding: 'json' });
  return `<html><body><script>window.__PAGE_MODEL = ${model};\nwindow.OTHER = {"unrelated":true};</script></body></html>`;
}

const REAL_SHAPE = [
  { propertyData: 1 }, // 0
  { address: 2, prices: 8, location: 12, bedrooms: 19, bathrooms: 20, propertySubType: 21, channel: 22 }, // 1
  { displayAddress: 3, countryCode: 4, deliveryPointId: 5, ukCountry: 6, outcode: 7, incode: 23 }, // 2
  '1 Overton Road, London', // 3
  'GB', // 4
  null, // 5
  'England', // 6
  'SE2', // 7
  { primaryPrice: 9, secondaryPrice: 5, displayPriceQualifier: 10, pricePerSqFt: 5, message: 5 }, // 8
  '£640,000', // 9
  '', // 10
  true, // 11
  { latitude: 13, longitude: 14, circleRadiusOnMap: 15, zoomLevel: 16, pinType: 17, showMap: 11 }, // 12
  51.491114, // 13
  0.120399, // 14
  0, // 15
  15, // 16
  'ACCURATE_POINT', // 17
  'APPROXIMATE', // 18
  3, // 19
  1, // 20
  'Apartment', // 21
  'RES_BUY', // 22
  '9SH', // 23
];

describe('rightmovePropertyUrl — the only thing the server will fetch', () => {
  it('accepts a property link and rebuilds it canonically', () => {
    assert.deepEqual(rightmovePropertyUrl('https://www.rightmove.co.uk/properties/167753189'), {
      listingId: '167753189',
      url: 'https://www.rightmove.co.uk/properties/167753189',
    });
  });

  it("accepts Rightmove's own share link, utm noise and fragment included", () => {
    const shared =
      'https://www.rightmove.co.uk/properties/167753189?utm_campaign=property-details&utm_source=copytoclipboard#/&channel=RES_BUY';
    assert.equal(rightmovePropertyUrl(shared).listingId, '167753189');
  });

  it('accepts the bare and mobile hosts', () => {
    assert.ok(rightmovePropertyUrl('https://rightmove.co.uk/properties/12345678'));
    assert.ok(rightmovePropertyUrl('https://m.rightmove.co.uk/properties/12345678'));
  });

  // The SSRF cases. A server that fetches whatever a user pasted is a way
  // into the metadata endpoint and anything else on the private network.
  it('refuses the cloud metadata endpoint', () => {
    assert.equal(rightmovePropertyUrl('http://169.254.169.254/latest/meta-data/'), null);
    assert.equal(rightmovePropertyUrl('http://localhost:8080/properties/12345678'), null);
  });

  it('refuses a lookalike domain that merely CONTAINS rightmove.co.uk', () => {
    assert.equal(rightmovePropertyUrl('https://rightmove.co.uk.evil.com/properties/12345678'), null);
    assert.equal(rightmovePropertyUrl('https://notrightmove.co.uk/properties/12345678'), null);
  });

  it('refuses non-property Rightmove pages, so only listings are ever fetched', () => {
    assert.equal(rightmovePropertyUrl('https://www.rightmove.co.uk/property-for-sale/find.html'), null);
  });

  it('refuses junk without throwing', () => {
    assert.equal(rightmovePropertyUrl('not a url'), null);
    assert.equal(rightmovePropertyUrl(''), null);
    assert.equal(rightmovePropertyUrl(null), null);
    assert.equal(rightmovePropertyUrl(`https://www.rightmove.co.uk/properties/${'9'.repeat(5000)}`), null);
  });
});

describe('parseRightmoveListing', () => {
  it('reads a real listing off the real page shape', () => {
    const listing = parseRightmoveListing(pageWith(REAL_SHAPE));
    assert.equal(listing.address, '1 Overton Road, London');
    assert.equal(listing.postcode, 'SE2 9SH');
    assert.equal(listing.priceText, '£640,000');
    assert.equal(listing.priceValue, 640000);
    assert.equal(listing.lat, 51.491114);
    assert.equal(listing.lng, 0.120399);
    assert.equal(listing.pinAccurate, true);
    assert.equal(listing.bedrooms, 3);
    assert.equal(listing.bathrooms, 1);
    assert.equal(listing.propertyType, 'Apartment');
    assert.equal(listing.channel, 'buy');
  });

  it('reads a rental — different channel, and a price that is not a total', () => {
    const flat = [...REAL_SHAPE];
    flat[9] = '£2,700 pcm';
    flat[22] = 'RES_LET';
    const listing = parseRightmoveListing(pageWith(flat));
    assert.equal(listing.channel, 'rent');
    assert.equal(listing.priceText, '£2,700 pcm');
    assert.equal(listing.priceValue, 2700);
  });

  it('treats a withheld incode as a partial postcode, not a failure', () => {
    const flat = [...REAL_SHAPE];
    flat[23] = null;
    assert.equal(parseRightmoveListing(pageWith(flat)).postcode, 'SE2');
  });

  it('passes through an approximate pin rather than implying precision', () => {
    const flat = [...REAL_SHAPE];
    flat[17] = 'APPROXIMATE';
    assert.equal(parseRightmoveListing(pageWith(flat)).pinAccurate, false);
  });

  // The fail-loudly contract. Each of these must throw rather than hand
  // back a half-built listing that gets saved as a real viewing.
  it('throws when the page model is missing entirely', () => {
    assert.throws(() => parseRightmoveListing('<html><body>Blocked</body></html>'), ListingParseError);
  });

  it('throws when there is no address', () => {
    const flat = [...REAL_SHAPE];
    flat[3] = '';
    assert.throws(() => parseRightmoveListing(pageWith(flat)), /no address/i);
  });

  it('throws when there is no location, since the pin is the point', () => {
    const flat = [...REAL_SHAPE];
    flat[12] = { latitude: 5, longitude: 5, pinType: 17, showMap: 11 }; // index 5 is null
    assert.throws(() => parseRightmoveListing(pageWith(flat)), /no location/i);
  });

  it('survives a self-referencing graph instead of recursing forever', () => {
    const flat = [{ propertyData: 1 }, { address: 1, prices: 1, location: 1 }];
    assert.throws(() => parseRightmoveListing(pageWith(flat)), ListingParseError);
  });
});

describe('extractPageModel — the brace scan', () => {
  it("steps over braces inside an agent's description instead of losing count", () => {
    const flat = [...REAL_SHAPE];
    // An unbalanced brace in free text is exactly what breaks a naive
    // depth counter: it would stop scanning in the middle of the JSON.
    flat[3] = 'Flat 1 {unit B, London';
    const listing = parseRightmoveListing(pageWith(flat));
    assert.equal(listing.address, 'Flat 1 {unit B, London');
  });

  it('ignores the other assignments sharing the same script tag', () => {
    const model = extractPageModel(pageWith(REAL_SHAPE));
    assert.equal(typeof model.data, 'string');
  });

  it('throws on a truncated page rather than returning something partial', () => {
    assert.throws(() => extractPageModel('<script>window.__PAGE_MODEL = {"data":"['), ListingParseError);
  });
});

describe('parsePriceValue', () => {
  it('reads the number out of what Rightmove chose to display', () => {
    assert.equal(parsePriceValue('£640,000'), 640000);
    assert.equal(parsePriceValue('£2,700 pcm'), 2700);
    assert.equal(parsePriceValue('Offers over £1,250,000'), 1250000);
  });

  it('gives null, never 0, when there is no number — a POA flat is not free', () => {
    assert.equal(parsePriceValue('POA'), null);
    assert.equal(parsePriceValue(''), null);
    assert.equal(parsePriceValue(null), null);
  });
});
