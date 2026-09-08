import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STOPS, isUsableStop, mapsLink, outingTags, planItinerary } from '../itinerary';
import { PREFERENCE_TAGS } from '../similarity/tags';
import type { Profile } from '../types';

const withTags = (preferenceTags: string[]): Profile => ({
  members: [], lifestyle: { preferenceTags },
});

describe('turning what they said into somewhere to go', () => {
  it('builds stops from the tags the ranking already uses', () => {
    // Same fixed vocabulary that chose the area, so the itinerary and the
    // ranking can never disagree about what someone said.
    const stops = planItinerary(withTags(['cafe_culture', 'big_park_nearby']));
    assert.equal(stops.length, 2);
    assert.match(stops[0].query, /coffee/);
    assert.equal(stops[0].because, 'cafe_culture');
    assert.match(stops[1].query, /park/);
  });

  it('never plans the same outing twice', () => {
    // cafe_culture and independent_shops both point at independents; two
    // tags should not become two versions of the same walk.
    const stops = planItinerary(withTags(['big_park_nearby', 'lots_of_green']));
    assert.equal(stops.length, 1);
  });

  it('caps the morning at three stops', () => {
    const stops = planItinerary(withTags([
      'cafe_culture', 'nightlife', 'big_park_nearby', 'good_restaurants', 'weekend_destination',
    ]));
    assert.equal(stops.length, MAX_STOPS);
  });

  it('still gives them somewhere to go when they named nothing', () => {
    // An empty itinerary is worse than a generic one — twenty minutes in a
    // pub says more about who lives somewhere than any data we hold.
    const stops = planItinerary(withTags([]));
    assert.equal(stops.length, 1);
    assert.equal(planItinerary(null).length, 1);
  });

  it('ignores tags with nothing to go and do about them', () => {
    // "period_property" is about housing stock. There is no Saturday
    // outing that tests it.
    const stops = planItinerary(withTags(['period_property', 'spacious_homes']));
    assert.equal(stops.length, 1); // the fallback, not two housing stops
  });

  it('only ever names tags that really exist', () => {
    // Guards the outing list against drifting from the real vocabulary.
    for (const tag of outingTags()) {
      assert.ok(PREFERENCE_TAGS[tag], `${tag} is not a real preference tag`);
    }
  });

  it('gives every stop a reason in our own words', () => {
    // Ours to store. The venue's NAME is Google's and is not.
    for (const stop of planItinerary(withTags(['cafe_culture', 'nightlife']))) {
      assert.ok(stop.reason.length > 10);
      assert.ok(isUsableStop(stop));
    }
  });
});

describe('the free half of the feature', () => {
  it('builds a Maps link that needs no API key', () => {
    const link = mapsLink('ChIJabc123', "Bob's Cafe");
    assert.ok(link.startsWith('https://www.google.com/maps/search/?api=1'));
    assert.ok(link.includes('query_place_id=ChIJabc123'));
    // Spaces are encoded. Apostrophes are left alone deliberately —
    // encodeURIComponent does not touch them because they are legal in a
    // query string, and escaping them would be wrong rather than safer.
    assert.ok(link.includes('Bob%27s%20Cafe') || link.includes("Bob's%20Cafe"));
  });

  it('works from a place id alone', () => {
    assert.ok(mapsLink('ChIJabc123').includes('ChIJabc123'));
  });
});
