import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, type Dim, type Dimension } from '../similarity/features';
import {
  compare,
  spread,
  weightsFromPreference,
  type Match,
} from '../similarity/similar';

/** A vector with everything unmeasured, so each test states only what it means. */
function vec(values: Partial<Record<Dimension, number>>): Record<Dimension, Dim> {
  const out = {} as Record<Dimension, Dim>;
  for (const d of DIMENSIONS) out[d] = values[d] ?? null;
  return out;
}

describe('compare — missing data is not zero', () => {
  it('ignores a dimension either side is missing rather than scoring it as a gap', () => {
    // The trap this guards: 328 of 570 areas have no rhythm data at all. If a
    // missing value were read as 0, every unmeasured area would look like the
    // quietest place in London and would match anywhere sleepy.
    const anchor = vec({ satNight: 2, sitdownShare: 0.5 });
    const noRhythm = vec({ sitdownShare: 0.5 });
    const agrees = compare(anchor, noRhythm, {});
    assert.equal(agrees.compared, 1, 'only the shared dimension is reported as compared');

    // The point: an area we cannot measure on satNight must land BETWEEN one
    // that genuinely matches it and one that genuinely does not — never
    // scored as though its silence were agreement.
    const alsoQuiet = vec({ satNight: 2, sitdownShare: 0.5 });
    const actuallyLoud = vec({ satNight: -2, sitdownShare: 0.5 });
    assert.ok(agrees.score < compare(anchor, alsoQuiet, {}).score, 'unknown is not agreement');
    assert.ok(agrees.score > compare(anchor, actuallyLoud, {}).score, 'nor is it disagreement');
  });

  it('reports nothing comparable rather than a confident zero', () => {
    const rhythmOnly = vec({ satNight: 1 });
    const foodOnly = vec({ sitdownShare: 0.5 });
    const result = compare(rhythmOnly, foodOnly, {});
    assert.equal(result.compared, 0);
    assert.equal(result.score, 0);
  });

  it('scores fully-measured identical areas 1, and distant areas far lower', () => {
    const full = (v: number) =>
      vec(Object.fromEntries(DIMENSIONS.map((d) => [d, v])) as Partial<Record<Dimension, number>>);
    assert.equal(compare(full(1), full(1), {}).score, 1, 'nothing unknown, nothing different');
    assert.ok(compare(full(1), full(-2), {}).score < 0.4, 'three SDs apart is a poor match');
  });
});

describe('compare — weights are what separate two people who both say "Clapham"', () => {
  it('lets a weighted dimension dominate the verdict', () => {
    const anchor = vec({ satNight: 2, sitdownShare: 0 });
    // Matches the nightlife but not the food.
    const bars = vec({ satNight: 2, sitdownShare: 2 });
    // Matches the food but not the nightlife.
    const cafes = vec({ satNight: 0, sitdownShare: 0 });

    const nightWeighted = { satNight: 5 };
    assert.ok(
      compare(anchor, bars, nightWeighted).score > compare(anchor, cafes, nightWeighted).score,
      'someone who said they liked the bars should be sent to the bars',
    );

    const foodWeighted = { sitdownShare: 5 };
    assert.ok(
      compare(anchor, cafes, foodWeighted).score > compare(anchor, bars, foodWeighted).score,
      'and someone who said the opposite should not',
    );
  });

  it('names the dimensions that actually matched, closest first', () => {
    const a = vec({ satNight: 1, drinkShare: 1, venues: 1 });
    const b = vec({ satNight: 1, drinkShare: 1.1, venues: 3 });
    const { traits } = compare(a, b, {});
    assert.equal(traits[0], 'satNight', 'the exact match leads');
    assert.ok(!traits.includes('venues') || traits.indexOf('venues') === 2);
  });
});

describe('spread — reach without penalising proximity', () => {
  const at = (name: string, lat: number, lng: number): Match => ({
    name,
    score: 0.9,
    dimensionsCompared: 12,
    confidence: 'high',
    distanceKm: 0,
    sharedTraits: [],
  });
  const coords: Record<string, { lat: number; lng: number }> = {
    // Three effectively on top of each other, then two far away.
    near1: { lat: 51.46, lng: -0.14 },
    near2: { lat: 51.462, lng: -0.141 },
    near3: { lat: 51.463, lng: -0.142 },
    far1: { lat: 51.56, lng: -0.08 },
    far2: { lat: 51.51, lng: 0.02 },
  };
  const ranked = ['near1', 'near2', 'near3', 'far1', 'far2'].map((n) => at(n, 0, 0));
  const lookup = (n: string) => coords[n];

  it('includes nearby matches — a good match down the road is still a good match', () => {
    const picked = spread(ranked, 4, {}, lookup);
    assert.ok(picked.some((m) => m.name === 'near1'), 'Nick: do not exclude the neighbours');
    assert.ok(picked.some((m) => m.name === 'near2'));
  });

  it('stops one cluster from taking every slot', () => {
    const picked = spread(ranked, 4, {}, lookup);
    const nearCount = picked.filter((m) => m.name.startsWith('near')).length;
    assert.ok(nearCount <= 2, 'the answer cannot be four stops down one line');
    assert.ok(picked.some((m) => m.name.startsWith('far')), 'so somewhere else gets in');
  });

  it('never silently drops a match when there is room for it', () => {
    const picked = spread(ranked, 5, {}, lookup);
    assert.equal(picked.length, 5, 'deferred is deferred, not discarded');
  });

  it('degrades safely when coordinates are unknown', () => {
    const picked = spread(ranked, 3, {}, () => undefined);
    assert.equal(picked.length, 3);
  });
});

describe('weightsFromPreference — the Common versus the High Street', () => {
  it('hears nightlife', () => {
    const w = weightsFromPreference('the bars and the pubs, going out on a Friday');
    assert.ok((w.satNight ?? 0) > 1);
    assert.ok((w.drinkShare ?? 0) > 1);
  });

  it('hears the opposite', () => {
    const w = weightsFromPreference('quiet residential streets, a village feel');
    assert.ok((w.satNight ?? 0) > 1, 'still weights the night — just towards a quiet anchor');
    assert.equal(w.drinkShare, undefined);
  });

  it('hears independent coffee', () => {
    const w = weightsFromPreference('independent coffee shops and brunch');
    assert.ok((w.independentShare ?? 0) > 1);
  });

  it('returns nothing rather than guessing when it recognises nothing', () => {
    assert.deepEqual(weightsFromPreference('somewhere nice please'), {});
  });
});

describe('compare — less data must never be an advantage', () => {
  it('does not let a thin match outrank a strong full one', () => {
    // The bug this guards: the first real run returned ten areas that all
    // lacked rhythm data, because six dimensions give fewer chances to
    // disagree than twelve. Ignorance was scoring better than evidence.
    const anchor = vec({
      peak: 1, satNight: 1, weekendDay: 1, weekdayMorning: 1, nightlifeRatio: 1, weekendLean: 1,
      sitdownShare: 1, takeawayShare: 1, drinkShare: 1, independentShare: 1, venues: 1, drinkCount: 1,
    });
    const perfectOnHalf = vec({
      sitdownShare: 1, takeawayShare: 1, drinkShare: 1, independentShare: 1, venues: 1, drinkCount: 1,
    });
    const closeOnEverything = vec({
      peak: 1.2, satNight: 1.2, weekendDay: 1.2, weekdayMorning: 1.2, nightlifeRatio: 1.2, weekendLean: 1.2,
      sitdownShare: 1.2, takeawayShare: 1.2, drinkShare: 1.2, independentShare: 1.2, venues: 1.2, drinkCount: 1.2,
    });
    assert.ok(
      compare(anchor, closeOnEverything, {}).score > compare(anchor, perfectOnHalf, {}).score,
      'a strong twelve-dimension match beats a perfect six-dimension one',
    );
  });

  it('still ranks a perfect thin match above a poor full one', () => {
    const anchor = vec({ sitdownShare: 1, venues: 1, peak: 1, satNight: 1 });
    const perfectThin = vec({ sitdownShare: 1, venues: 1 });
    const poorFull = vec({ sitdownShare: -2, venues: -2, peak: -2, satNight: -2 });
    assert.ok(compare(anchor, perfectThin, {}).score > compare(anchor, poorFull, {}).score);
  });

  it('reports the honest dimension count, not the padded one', () => {
    // Padding affects the SCORE so ignorance cannot win; it must never
    // inflate the count we show the user as evidence.
    const anchor = vec({ sitdownShare: 1, peak: 1 });
    const foodOnly = vec({ sitdownShare: 1 });
    assert.equal(compare(anchor, foodOnly, {}).compared, 1);
  });
});
