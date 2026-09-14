import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asksForAnOuting,
  composeOuting,
  describeRating,
  pickBest,
  WALK_RADIUS_M,
  type PlannedStop,
} from '../agentChat/outing';
import type { Place } from '../placesClient';

const stop = (name: string, reason: string, address: string | null = null): PlannedStop => ({
  plan: { query: 'q', because: 'cafe_culture', reason },
  place: { id: 'p', name, address, lat: null, lng: null, rating: null, ratingCount: null },
});

/** Queens Park, and points a given distance due north of it. */
const HERE = { lat: 51.534443, lng: -0.204882 };
function northOf(metres: number): { lat: number; lng: number } {
  return { lat: HERE.lat + metres / 111_320, lng: HERE.lng };
}
const place = (o: Partial<Place> & { id: string }): Place => ({
  name: o.id,
  address: null,
  lat: HERE.lat,
  lng: HERE.lng,
  rating: null,
  ratingCount: null,
  ...o,
});

describe('picking the best place within a ten minute walk', () => {
  it('drops anything beyond the walk, however good it is', () => {
    // The household was promised a ten minute walk. A brilliant café forty
    // minutes away is a different suggestion, not a better one.
    const far = northOf(WALK_RADIUS_M + 400);
    const best = pickBest(
      [
        place({ id: 'far-and-perfect', ...far, rating: 5, ratingCount: 5000 }),
        place({ id: 'near-and-good', rating: 4.2, ratingCount: 500 }),
      ],
      HERE,
    );
    assert.equal(best?.id, 'near-and-good');
  });

  it('prefers a well-reviewed place over a higher score nobody has been to', () => {
    // A 5.0 from three people is a claim about three people.
    const best = pickBest(
      [
        place({ id: 'three-reviews', rating: 5, ratingCount: 3 }),
        place({ id: 'two-thousand', rating: 4.5, ratingCount: 2000 }),
      ],
      HERE,
    );
    assert.equal(best?.id, 'two-thousand');
  });

  it('falls back to the best of a thinly-reviewed field rather than nothing', () => {
    const best = pickBest(
      [
        place({ id: 'quiet-one', rating: 3.9, ratingCount: 4 }),
        place({ id: 'better-quiet-one', rating: 4.8, ratingCount: 6 }),
      ],
      HERE,
    );
    assert.equal(best?.id, 'better-quiet-one');
  });

  it('breaks a tie towards the place more people have been to', () => {
    const best = pickBest(
      [
        place({ id: 'fewer', rating: 4.6, ratingCount: 40 }),
        place({ id: 'more', rating: 4.6, ratingCount: 900 }),
      ],
      HERE,
    );
    assert.equal(best?.id, 'more');
  });

  it('refuses a place with no coordinates rather than guessing it is close', () => {
    const best = pickBest(
      [place({ id: 'unlocatable', lat: null, lng: null, rating: 5, ratingCount: 900 })],
      HERE,
    );
    assert.equal(best, null);
  });

  it('never repeats a place already used earlier in the day', () => {
    const best = pickBest(
      [
        place({ id: 'already-there', rating: 4.9, ratingCount: 900 }),
        place({ id: 'the-other-one', rating: 4.1, ratingCount: 900 }),
      ],
      HERE,
      new Set(['already-there']),
    );
    assert.equal(best?.id, 'the-other-one');
  });

  it('returns null when nothing at all is within the walk', () => {
    const far = northOf(WALK_RADIUS_M + 1);
    assert.equal(pickBest([place({ id: 'far', ...far, rating: 5 })], HERE), null);
  });
});

describe('showing a rating somebody can weigh', () => {
  it('gives the score and how many people it rests on', () => {
    // Google returns one decimal already; this only guards the formatting
    // and the thousands separator, not any rounding of our own.
    assert.equal(
      describeRating(place({ id: 'x', rating: 4.6, ratingCount: 1204 })),
      '4.6★ (1,204 reviews)',
    );
  });

  it('shows the score alone when the count is unknown', () => {
    assert.equal(describeRating(place({ id: 'x', rating: 4.2 })), '4.2★');
  });

  it('says nothing at all when Google holds no rating', () => {
    // Better silence than a bare 0, which reads as a terrible place.
    assert.equal(describeRating(place({ id: 'x' })), null);
  });
});

describe('spotting a request for something to do', () => {
  it('catches the ways people actually ask', () => {
    for (const said of [
      'plan a chill sunday in Queens Park',
      'plan me a day in Balham',
      'what should we do in Peckham?',
      'things to do in Hackney',
      'where can we eat in Brixton?',
      'where should I get coffee around Angel',
      "what's there to do in Deptford",
      'give me an itinerary for Clapham',
    ]) {
      assert.equal(asksForAnOuting(said), true, `missed: ${said}`);
    }
  });

  it('leaves factual questions alone', () => {
    // A false positive is worse than a miss: someone who asked what an
    // area is LIKE gets a list of cafés instead of an answer.
    for (const said of [
      'is Balham busy on a Sunday?',
      'what about Queens Park?',
      'how long is the commute from Peckham',
      'can we afford Clapham',
      'what are the schools like in Angel',
      'is it a quiet area at the weekend',
      'we are moving in March',
    ]) {
      assert.equal(asksForAnOuting(said), false, `false positive: ${said}`);
    }
  });
});

describe('the itinerary as somebody reads it', () => {
  it('names each place and why it is on the list', () => {
    const text = composeOuting('Queens Park', [
      stop('Milk Beach', 'You said the cafés matter — this is the one to try first.', '1 Lonsdale Rd'),
      stop('Queens Park', 'The green space you said you wanted within walking distance.'),
    ]);
    assert.match(text, /Queens Park/);
    assert.match(text, /Milk Beach/);
    // No address: noise beside a name and a map link, and nobody
    // navigates by reading a postcode off a chat message.
    assert.ok(!text.includes('1 Lonsdale Rd'), 'the address should not be shown');
    // Every stop is openable in Maps — the point is going there.
    assert.match(text, /google\.com\/maps\/search/);
    assert.match(text, /cafés matter/);
    // The reason is the point — a list without it is just a search result.
    assert.match(text, /green space you said you wanted/);
  });

  it('says so plainly when there was nothing to suggest', () => {
    const text = composeOuting('Nowhere', []);
    assert.match(text, /couldn't find enough/);
    // Still ends with something useful rather than an apology.
    assert.match(text, /worth a wander/i);
  });

  it('shows the rating on each stop when there is one', () => {
    const text = composeOuting('Balham', [
      {
        plan: { query: 'pub', because: 'local_and_lowkey', reason: 'A local rather than a destination.' },
        place: place({ id: 'p1', name: 'The Bedford', rating: 4.3, ratingCount: 2100 }),
      },
    ]);
    assert.match(text, /4\.3★ \(2,100 reviews\)/);
  });

  it('promises the ten minute walk it actually enforces', () => {
    const text = composeOuting('Balham', [stop('The Bedford', 'A local.')]);
    assert.match(text, /ten minute walk/);
  });
});
