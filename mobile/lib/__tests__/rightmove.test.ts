import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUY_PRICES,
  RENT_PRICES,
  formatPrice,
  pricesFor,
  rightmoveUrl,
} from '../rightmove';
import type { PropertyCriteria } from '../types';

/**
 * The area used here must exist in assets/data/rightmove-ids.json, which is
 * generated. "Tooting Bec" is a real station on every run of the build
 * script; if this ever fails to build a URL, the generated file is the
 * thing to look at, not this test.
 */
const AREA = 'Tooting Bec';

const criteria = (over: Partial<PropertyCriteria> = {}): PropertyCriteria => ({
  channel: 'buy',
  minPrice: 300_000,
  maxPrice: 750_000,
  minBeds: 2,
  maxBeds: 3,
  minBaths: 1,
  maxBaths: 2,
  tenures: [],
  features: [],
  setAt: 1_700_000_000_000,
  ...over,
});

/** Reads one query parameter back off a built URL. */
function param(url: string, key: string): string | null {
  return new URL(url).searchParams.get(key);
}

describe('the filters actually reach Rightmove', () => {
  // The web app's version of this shipped links that arrived without the
  // bedroom or bathroom filters on them. Each of these is one of the
  // filters that went missing.
  it('carries every filter the household chose', () => {
    const url = rightmoveUrl(AREA, criteria())!;
    assert.ok(url, 'no URL built — check assets/data/rightmove-ids.json');
    assert.equal(param(url, 'minPrice'), '300000');
    assert.equal(param(url, 'maxPrice'), '750000');
    assert.equal(param(url, 'minBedrooms'), '2');
    assert.equal(param(url, 'maxBedrooms'), '3');
    assert.equal(param(url, 'minBathrooms'), '1');
    assert.equal(param(url, 'maxBathrooms'), '2');
  });

  it('sends bedrooms as a RANGE, not an exact match', () => {
    // The web app sent minBedrooms=N&maxBedrooms=N, so asking for a 2-bed
    // hid every 3-bed. A range is the whole point of asking for two numbers.
    const url = rightmoveUrl(AREA, criteria({ minBeds: 2, maxBeds: 4 }))!;
    assert.equal(param(url, 'minBedrooms'), '2');
    assert.equal(param(url, 'maxBedrooms'), '4');
  });
});

describe('the casing trap', () => {
  // Verified against the live site: a lowercase tenure value does not get
  // ignored, it 307s the entire search and the user lands with NO filters
  // applied at all. This is the single most likely way to silently
  // reintroduce the web app's bug.
  it('sends tenures UPPERCASE, in Rightmove spelling', () => {
    const url = rightmoveUrl(AREA, criteria({ tenures: ['freehold', 'shareOfFreehold'] }))!;
    assert.equal(param(url, 'tenureTypes'), 'FREEHOLD,SHARE_OF_FREEHOLD');
  });

  it('sends features lowercase — the opposite convention, same URL', () => {
    const url = rightmoveUrl(AREA, criteria({ features: ['garden', 'parking'] }))!;
    assert.equal(param(url, 'mustHave'), 'garden,parking');
  });

  it('percent-encodes the ^ in the location identifier', () => {
    const url = rightmoveUrl(AREA, criteria())!;
    assert.ok(url.includes('%5E'), 'the ^ must be encoded as %5E');
    assert.ok(!url.includes('^'), 'a raw ^ must never reach the URL');
    // Still decodes back to the real identifier.
    assert.match(param(url, 'locationIdentifier')!, /^(STATION|REGION)\^\d+$/);
  });
});

describe('an empty choice is not a filter', () => {
  it('omits tenureTypes entirely when they have no preference', () => {
    const url = rightmoveUrl(AREA, criteria({ tenures: [] }))!;
    assert.equal(param(url, 'tenureTypes'), null);
  });

  it('omits mustHave entirely when nothing was ticked', () => {
    const url = rightmoveUrl(AREA, criteria({ features: [] }))!;
    assert.equal(param(url, 'mustHave'), null);
  });
});

describe('buying and renting are different URLs', () => {
  it('buys on the for-sale path', () => {
    const url = rightmoveUrl(AREA, criteria({ channel: 'buy' }))!;
    assert.ok(url.startsWith('https://www.rightmove.co.uk/property-for-sale/find.html?'));
  });

  it('rents on the to-rent path', () => {
    const url = rightmoveUrl(AREA, criteria({ channel: 'rent' }))!;
    assert.ok(url.startsWith('https://www.rightmove.co.uk/property-to-rent/find.html?'));
  });
});

describe('an area we cannot resolve gets no button at all', () => {
  it('returns null rather than guessing', () => {
    // Guessing is how "Chessington North" ends up searching York.
    assert.equal(rightmoveUrl('Nowhere At All', criteria()), null);
  });
});

describe('the price scales people pick from', () => {
  it('runs rent from £500 to £5,000 in £250 steps', () => {
    assert.equal(RENT_PRICES[0], 500);
    assert.equal(RENT_PRICES[RENT_PRICES.length - 1], 5_000);
    assert.equal(RENT_PRICES[1] - RENT_PRICES[0], 250);
  });

  it('runs buy from £150k to £5m', () => {
    assert.equal(BUY_PRICES[0], 150_000);
    assert.equal(BUY_PRICES[BUY_PRICES.length - 1], 5_000_000);
  });

  it('steps buy more finely at the bottom than the top', () => {
    // £25k apart where most of London sits, £250k apart at the far end —
    // otherwise reaching £5m takes 194 identical taps.
    assert.equal(BUY_PRICES[1] - BUY_PRICES[0], 25_000);
    const last = BUY_PRICES.length - 1;
    assert.equal(BUY_PRICES[last] - BUY_PRICES[last - 1], 250_000);
  });

  it('never repeats a value where two bands meet', () => {
    assert.equal(new Set(BUY_PRICES).size, BUY_PRICES.length);
  });

  it('rises without going backwards', () => {
    for (const scale of [RENT_PRICES, BUY_PRICES]) {
      for (let i = 1; i < scale.length; i += 1) {
        assert.ok(scale[i] > scale[i - 1], `${scale[i]} followed ${scale[i - 1]}`);
      }
    }
  });

  it('offers the right scale for the channel', () => {
    assert.equal(pricesFor('rent')[0], 500);
    assert.equal(pricesFor('buy')[0], 150_000);
  });
});

describe('prices read the way people say them', () => {
  it('writes thousands in full', () => {
    assert.equal(formatPrice(2_500), '£2,500');
    assert.equal(formatPrice(750_000), '£750,000');
  });

  it('writes millions short', () => {
    assert.equal(formatPrice(1_000_000), '£1m');
    assert.equal(formatPrice(1_250_000), '£1.25m');
    assert.equal(formatPrice(5_000_000), '£5m');
  });
});
