import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeProperty,
  isValidViewing,
  mappableViewings,
  parsePriceText,
  viewingFromManual,
  formatViewingWhen,
  groupViewings,
  looksLikeRightmoveUrl,
  sortViewings,
  viewingFromListing,
  viewingStatus,
  fromStored,
  type ListingDetails,
  type Viewing,
} from '../viewings';

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0); // 12 Sep 2026, midday
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function viewing(over: Partial<Viewing> = {}): Viewing {
  return {
    id: 'v1',
    address: '1 Overton Road, London',
    postcode: 'SE2 9SH',
    lat: 51.491114,
    lng: 0.120399,
    pinAccurate: true,
    priceText: '£640,000',
    priceValue: 640000,
    bedrooms: 3,
    bathrooms: 1,
    propertyType: 'Apartment',
    channel: 'buy',
    listingUrl: 'https://www.rightmove.co.uk/properties/167753189',
    source: 'rightmove',
    viewingAt: null,
    notes: null,
    createdAt: NOW,
    createdBy: 'uid1',
    ...over,
  };
}

const listing: ListingDetails = {
  source: 'rightmove',
  listingId: '167753189',
  url: 'https://www.rightmove.co.uk/properties/167753189',
  address: '1 Overton Road, London',
  postcode: 'SE2 9SH',
  priceText: '£640,000',
  priceValue: 640000,
  priceQualifier: null,
  lat: 51.491114,
  lng: 0.120399,
  pinAccurate: true,
  bedrooms: 3,
  bathrooms: 1,
  propertyType: 'Apartment',
  channel: 'buy',
};

describe('viewingStatus — derived from the date, never stored', () => {
  it('is an idea when nothing is booked', () => {
    assert.equal(viewingStatus(viewing({ viewingAt: null }), NOW), 'idea');
  });

  it('is booked while the date is still ahead', () => {
    assert.equal(viewingStatus(viewing({ viewingAt: NOW + DAY }), NOW), 'booked');
  });

  it('asks whether they went once the date has passed, rather than assuming', () => {
    const v = viewing({ viewingAt: NOW + HOUR });
    assert.equal(viewingStatus(v, NOW), 'booked');
    // Same object, two hours later. Still derived — no job, no stale flag —
    // but a passed date is not proof: viewings get cancelled and moved.
    assert.equal(viewingStatus(v, NOW + 2 * HOUR), 'askWent');
  });

  it('is seen once they say they went, even with nothing scored', () => {
    assert.equal(viewingStatus(viewing({ viewingAt: NOW - DAY, attended: true }), NOW), 'seen');
  });

  it('stays seen after a new must-have is added, if they said they went', () => {
    const mustHaves = [{ id: 'm1', text: 'GARDEN', createdAt: 0 }];
    assert.equal(viewingStatus(viewing({ viewingAt: null, attended: true }), NOW, mustHaves), 'seen');
  });
});

describe('sortViewings', () => {
  it('puts what is coming up first, soonest first', () => {
    const far = viewing({ id: 'far', viewingAt: NOW + 5 * DAY });
    const soon = viewing({ id: 'soon', viewingAt: NOW + DAY });
    assert.deepEqual(
      sortViewings([far, soon], NOW).map((v) => v.id),
      ['soon', 'far'],
    );
  });

  it('orders did-you-go, booked, ideas, then seen', () => {
    const seen = viewing({ id: 'seen', viewingAt: NOW - 2 * DAY, attended: true });
    const ask = viewing({ id: 'ask', viewingAt: NOW - DAY });
    const idea = viewing({ id: 'idea', viewingAt: null });
    const booked = viewing({ id: 'booked', viewingAt: NOW + DAY });
    assert.deepEqual(
      sortViewings([seen, idea, booked, ask], NOW).map((v) => v.id),
      ['ask', 'booked', 'idea', 'seen'],
    );
  });

  it('shows the most recently seen first, not the oldest', () => {
    const old = viewing({ id: 'old', viewingAt: NOW - 10 * DAY });
    const recent = viewing({ id: 'recent', viewingAt: NOW - DAY });
    assert.deepEqual(
      sortViewings([old, recent], NOW).map((v) => v.id),
      ['recent', 'old'],
    );
  });

  it('shows the newest idea first, since nothing else separates them', () => {
    const older = viewing({ id: 'older', viewingAt: null, createdAt: NOW - 5 * DAY });
    const newer = viewing({ id: 'newer', viewingAt: null, createdAt: NOW - DAY });
    assert.deepEqual(
      sortViewings([older, newer], NOW).map((v) => v.id),
      ['newer', 'older'],
    );
  });

  it('does not mutate what it was given', () => {
    const list = [viewing({ id: 'a', viewingAt: NOW + 2 * DAY }), viewing({ id: 'b', viewingAt: NOW + DAY })];
    sortViewings(list, NOW);
    assert.deepEqual(list.map((v) => v.id), ['a', 'b']);
  });
});

describe('groupViewings', () => {
  it('splits the three states and keeps each one sorted', () => {
    const grouped = groupViewings(
      [
        viewing({ id: 'seen', viewingAt: NOW - DAY, attended: true }),
        viewing({ id: 'ask', viewingAt: NOW - 2 * DAY }),
        viewing({ id: 'late', viewingAt: NOW + 5 * DAY }),
        viewing({ id: 'idea', viewingAt: null }),
        viewing({ id: 'soon', viewingAt: NOW + HOUR }),
      ],
      NOW,
    );
    assert.deepEqual(grouped.booked.map((v) => v.id), ['soon', 'late']);
    assert.deepEqual(grouped.idea.map((v) => v.id), ['idea']);
    assert.deepEqual(grouped.seen.map((v) => v.id), ['seen']);
    assert.deepEqual(grouped.askWent.map((v) => v.id), ['ask']);
  });

  it('gives empty groups rather than missing ones when there is nothing', () => {
    const grouped = groupViewings([], NOW);
    assert.deepEqual(grouped, { askWent: [], booked: [], idea: [], seen: [] });
  });
});

describe('a fully scored property counts as viewed', () => {
  const mustHaves = [
    { id: 'm1', text: 'GARDEN', createdAt: 0 },
    { id: 'm2', text: 'TWO BATHROOMS', createdAt: 0 },
  ];

  it('moves out of want-to-see once every must-have has a tick or a cross', () => {
    const v = viewing({ viewingAt: null, checks: { m1: true, m2: false } });
    assert.equal(viewingStatus(v, NOW, mustHaves), 'seen');
  });

  it('moves out of booked too, even with the date still ahead', () => {
    const v = viewing({ viewingAt: NOW + DAY, checks: { m1: false, m2: false } });
    assert.equal(viewingStatus(v, NOW, mustHaves), 'seen');
  });

  it('stays put while any must-have is unanswered', () => {
    const v = viewing({ viewingAt: null, checks: { m1: true } });
    assert.equal(viewingStatus(v, NOW, mustHaves), 'idea');
  });

  it('never counts as viewed with no must-haves set', () => {
    assert.equal(viewingStatus(viewing({ viewingAt: null, checks: {} }), NOW, []), 'idea');
  });

  it('is grouped with the viewed ones', () => {
    const grouped = groupViewings(
      [viewing({ id: 'scored', viewingAt: null, checks: { m1: true, m2: true } }), viewing({ id: 'idea' })],
      NOW,
      mustHaves,
    );
    assert.deepEqual(grouped.seen.map((v) => v.id), ['scored']);
    assert.deepEqual(grouped.idea.map((v) => v.id), ['idea']);
  });
});

describe('viewingFromListing', () => {
  it('carries over everything the listing knew', () => {
    const v = viewingFromListing(listing, { createdBy: 'uid1', now: NOW });
    assert.equal(v.address, '1 Overton Road, London');
    assert.equal(v.lat, 51.491114);
    assert.equal(v.priceText, '£640,000');
    assert.equal(v.bedrooms, 3);
    assert.equal(v.channel, 'buy');
    assert.equal(v.listingUrl, listing.url);
    assert.equal(v.source, 'rightmove');
    assert.equal(v.createdBy, 'uid1');
  });

  it('starts as an idea — pasting a link is not booking a viewing', () => {
    assert.equal(viewingFromListing(listing, { createdBy: 'uid1', now: NOW }).viewingAt, null);
  });

  it('takes a date when one was given', () => {
    const v = viewingFromListing(listing, { createdBy: 'uid1', viewingAt: NOW + DAY, now: NOW });
    assert.equal(viewingStatus(v, NOW), 'booked');
  });

  it('gives each viewing its own id', () => {
    const a = viewingFromListing(listing, { createdBy: 'uid1', now: NOW });
    const b = viewingFromListing(listing, { createdBy: 'uid1', now: NOW });
    assert.notEqual(a.id, b.id);
  });
});

describe('formatViewingWhen', () => {
  // Built in LOCAL time on purpose, so these pass wherever they are run —
  // the function reads the phone's own clock, and a test pinned to UTC
  // would only be asserting the test runner's timezone.
  it('reads the way someone would say it', () => {
    assert.equal(formatViewingWhen(new Date(2026, 8, 14, 14, 30).getTime()), 'Mon 14 Sep, 2:30pm');
  });

  it('says am for a morning viewing', () => {
    assert.equal(formatViewingWhen(new Date(2026, 8, 14, 9, 0).getTime()), 'Mon 14 Sep, 9:00am');
  });

  it('says 12 rather than 0 at either end of the day', () => {
    assert.equal(formatViewingWhen(new Date(2026, 8, 14, 12, 15).getTime()), 'Mon 14 Sep, 12:15pm');
    assert.equal(formatViewingWhen(new Date(2026, 8, 14, 0, 5).getTime()), 'Mon 14 Sep, 12:05am');
  });

  // The reason this is not toLocaleDateString: en-GB gives "Sept" on some
  // ICU builds and "Sep" on others, so the same viewing would read
  // differently on two phones in the same household.
  it('abbreviates every month the same way on every device', () => {
    assert.equal(formatViewingWhen(new Date(2026, 8, 1, 10, 0).getTime()).slice(6, 9), 'Sep');
    assert.equal(formatViewingWhen(new Date(2026, 2, 1, 10, 0).getTime()).slice(6, 9), 'Mar');
  });
});

describe('describeProperty', () => {
  it('says it the way a person would', () => {
    assert.equal(describeProperty(viewing()), '3 bed apartment');
  });

  it('drops what the listing did not say', () => {
    assert.equal(describeProperty(viewing({ propertyType: null })), '3 bed');
    assert.equal(describeProperty(viewing({ bedrooms: null })), 'apartment');
  });

  it('gives null rather than an empty string when it knows nothing', () => {
    assert.equal(describeProperty(viewing({ bedrooms: null, propertyType: null })), null);
  });
});

describe('looksLikeRightmoveUrl', () => {
  it('recognises a property link, pasted with whatever came with it', () => {
    assert.ok(looksLikeRightmoveUrl('https://www.rightmove.co.uk/properties/167753189'));
    assert.ok(looksLikeRightmoveUrl('  https://www.rightmove.co.uk/properties/167753189?utm_source=x#/  '));
  });

  it('does not claim a search page or another site is a listing', () => {
    assert.equal(looksLikeRightmoveUrl('https://www.rightmove.co.uk/property-for-sale/find.html'), false);
    assert.equal(looksLikeRightmoveUrl('https://www.zoopla.co.uk/for-sale/details/12345'), false);
    assert.equal(looksLikeRightmoveUrl(''), false);
  });
});

describe('isValidViewing — what we will trust back out of Firebase', () => {
  it('accepts a well-formed viewing', () => {
    assert.ok(isValidViewing(viewing()));
    assert.ok(isValidViewing(viewing({ viewingAt: NOW + DAY })));
  });

  it('rejects one with nowhere to go', () => {
    assert.equal(isValidViewing(viewing({ address: '' })), false);
    assert.equal(isValidViewing(viewing({ address: '   ' })), false);
  });

  // A pin at a guessed coordinate is worse than no pin: someone drives to it.
  it('rejects one with a broken point on the map', () => {
    assert.equal(isValidViewing(viewing({ lat: Number.NaN })), false);
    assert.equal(isValidViewing({ ...viewing(), lng: undefined }), false);
    assert.equal(isValidViewing({ ...viewing(), lat: '51.49' }), false);
  });

  it('accepts a hand-typed viewing with no coordinates at all', () => {
    assert.ok(isValidViewing(viewing({ lat: null, lng: null })));
  });

  // Half a coordinate is the dangerous one: it puts the pin on the
  // equator or the meridian rather than anywhere near the property.
  it('rejects half a coordinate', () => {
    assert.equal(isValidViewing(viewing({ lat: 51.49, lng: null })), false);
    assert.equal(isValidViewing(viewing({ lat: null, lng: 0.12 })), false);
  });

  it('rejects junk without throwing', () => {
    assert.equal(isValidViewing(null), false);
    assert.equal(isValidViewing('a viewing'), false);
    assert.equal(isValidViewing({}), false);
  });

  it('treats a missing date as invalid, but an explicit null as fine', () => {
    assert.equal(isValidViewing({ ...viewing(), viewingAt: undefined }), false);
    assert.ok(isValidViewing(viewing({ viewingAt: null })));
  });
});

describe('viewingFromManual — the fallback when a link cannot be read', () => {
  it('keeps what they typed and claims no location', () => {
    const v = viewingFromManual(
      { address: '12 Acacia Avenue, SE1', priceText: '£525,000' },
      { createdBy: 'uid1', now: NOW },
    );
    assert.equal(v.address, '12 Acacia Avenue, SE1');
    assert.equal(v.priceText, '£525,000');
    assert.equal(v.priceValue, 525000);
    assert.equal(v.lat, null);
    assert.equal(v.lng, null);
    assert.equal(v.source, 'manual');
    assert.equal(v.pinAccurate, false);
  });

  it('is still a valid viewing — it belongs in the list, just not on the map', () => {
    const v = viewingFromManual({ address: '12 Acacia Avenue' }, { createdBy: 'uid1', now: NOW });
    assert.ok(isValidViewing(v));
    assert.equal(mappableViewings([v]).length, 0);
  });

  it('trims, and treats an empty price as no price rather than zero', () => {
    const v = viewingFromManual(
      { address: '  12 Acacia Avenue  ', priceText: '   ' },
      { createdBy: 'uid1', now: NOW },
    );
    assert.equal(v.address, '12 Acacia Avenue');
    assert.equal(v.priceText, null);
    assert.equal(v.priceValue, null);
  });
});

describe('mappableViewings', () => {
  it('hands back only the ones with a real point, narrowed', () => {
    const withPin = viewing({ id: 'pinned' });
    const without = viewing({ id: 'typed', lat: null, lng: null });
    const mappable = mappableViewings([withPin, without]);
    assert.deepEqual(mappable.map((v) => v.id), ['pinned']);
    // Narrowed, so the map never null-checks a coordinate it filtered for.
    const lat: number = mappable[0].lat;
    assert.equal(lat, 51.491114);
  });
});

describe('parsePriceText', () => {
  it('reads a number out of however someone typed it', () => {
    assert.equal(parsePriceText('£525,000'), 525000);
    assert.equal(parsePriceText('525000'), 525000);
    assert.equal(parsePriceText('£1,800 pcm'), 1800);
  });

  it('gives null when there is no number in it', () => {
    assert.equal(parsePriceText('ask the agent'), null);
    assert.equal(parsePriceText(''), null);
  });
});

describe('fromStored — surviving Firebase dropping nulls', () => {
  // Firebase does not store null, so this is exactly what comes back.
  const roundTrip = (v: Viewing) => JSON.parse(JSON.stringify(v, (_k, x) => (x === null ? undefined : x)));

  it('keeps a want-to-see property with no date', () => {
    const stored = roundTrip(viewing({ viewingAt: null, notes: null }));
    assert.equal(isValidViewing(stored), false); // the bug: dropped on load
    const restored = fromStored(stored);
    assert.equal(isValidViewing(restored), true);
    assert.equal((restored as Viewing).viewingAt, null);
  });

  it('keeps a hand-typed property with no coordinates', () => {
    const stored = roundTrip(viewing({ lat: null, lng: null, source: 'manual', listingUrl: null }));
    assert.equal(isValidViewing(fromStored(stored)), true);
  });

  it('still rejects half a coordinate', () => {
    const stored = roundTrip(viewing({ lng: null }));
    assert.equal(isValidViewing(fromStored(stored)), false);
  });

  it('still rejects a record with no address', () => {
    const { address: _gone, ...rest } = viewing();
    assert.equal(isValidViewing(fromStored(rest)), false);
  });
});
