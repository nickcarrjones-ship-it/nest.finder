import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shortlistByAnchor } from '../anchor';
import { areaCoords, distanceKm } from '../placeLabels';
import { allAreaNames } from '../../similarity/features';
import type { AreaCandidate } from '../prompt';
import type { AreaCards } from '../../types';

/**
 * The suggestions must not all be the same corner of London.
 *
 * Similarity has an unavoidable pull towards neighbours — price, housing
 * stock, pub density and demographics are all spatially correlated, so the
 * areas most like Clapham genuinely ARE the ones around Clapham. That is
 * the right answer to "where else feels like this?" and is deliberately
 * never penalised (see similar.ts). What stops it becoming five stops on
 * one line is `spread`, which caps how many results may come from any one
 * 2.5km cluster.
 *
 * These run against the real data rather than a fixture, because the whole
 * property being checked is emergent: it only appears once real areas with
 * real coordinates and real correlations are ranked. The assertions are
 * about the SHAPE of the result, never about which areas come back, so
 * they survive the data being regenerated.
 */

const CLUSTER_KM = 2.5;
const PER_CLUSTER = 2;

/** Every area we hold, unfiltered — a household with a generous commute. */
function pool(): AreaCandidate[] {
  const out: AreaCandidate[] = [];
  for (const name of allAreaNames()) {
    const c = areaCoords(name);
    if (!c) continue;
    out.push({
      neighbourhood: name,
      stations: [name],
      lat: c.lat,
      lng: c.lng,
      commuteMins: 30,
      walkBudgetMins: 10,
      pocketSize: 1,
    });
  }
  return out;
}

/** The largest number of picks sitting inside one cluster. */
function biggestCluster(names: string[]): { size: number; where: string } {
  let worst = { size: 0, where: '' };
  for (const centre of names) {
    const here = areaCoords(centre);
    if (!here) continue;
    const near = names.filter((n) => {
      const there = areaCoords(n);
      return there ? distanceKm(here, there) <= CLUSTER_KM : false;
    });
    if (near.length > worst.size) worst = { size: near.length, where: near.join(', ') };
  }
  return worst;
}

describe('suggestions are spread across London, not piled in one corner', () => {
  it('holds when the loved areas are next door to each other', () => {
    /**
     * The case that used to fail, and the one that matters most: people
     * very often love two adjacent places. findSimilar spreads each
     * anchor's own results, but merging several anchors and re-sorting
     * used to undo it — Clapham plus Balham returned Wandsworth Common,
     * Tooting Bec AND Clapham South, three inside 2.1km (2026-09-14).
     */
    const result = shortlistByAnchor(pool(), { Clapham: 'love', Balham: 'love' }, undefined, 5);
    assert.ok(result, 'expected a shortlist for two well-known areas');
    const names = result.candidates.map((c) => c.neighbourhood);
    assert.equal(names.length, 5);

    const worst = biggestCluster(names);
    assert.ok(
      worst.size <= PER_CLUSTER,
      `${worst.size} picks inside ${CLUSTER_KM}km: ${worst.where}`,
    );
  });

  it('holds for a single anchor too', () => {
    const result = shortlistByAnchor(pool(), { Clapham: 'love' }, undefined, 5);
    assert.ok(result);
    const worst = biggestCluster(result.candidates.map((c) => c.neighbourhood));
    assert.ok(worst.size <= PER_CLUSTER, `${worst.size} picks inside ${CLUSTER_KM}km: ${worst.where}`);
  });

  it('holds for three anchors spread across the city', () => {
    const result = shortlistByAnchor(
      pool(),
      { Clapham: 'love', Islington: 'love', Hackney: 'love' },
      undefined,
      5,
    );
    assert.ok(result);
    const worst = biggestCluster(result.candidates.map((c) => c.neighbourhood));
    assert.ok(worst.size <= PER_CLUSTER, `${worst.size} picks inside ${CLUSTER_KM}km: ${worst.where}`);
  });

  it('still returns the full five — spreading must not cost suggestions', () => {
    // Deferred matches come back if the spread left room; a household that
    // asked for five areas gets five, not three and a gap.
    const cases: AreaCards[] = [
      { Clapham: 'love' },
      { Clapham: 'love', Balham: 'love' },
    ];
    for (const cards of cases) {
      const result = shortlistByAnchor(pool(), cards, undefined, 5);
      assert.ok(result);
      assert.equal(result.candidates.length, 5, `only ${result.candidates.length} for ${Object.keys(cards)}`);
    }
  });

  it('keeps a genuinely similar neighbour rather than banishing it', () => {
    // Spreading caps a cluster at two; it must not push neighbours out
    // altogether. "If what they're looking for is just down the road, the
    // app should tell them" (Nick) — the rule is variety, not exile.
    const result = shortlistByAnchor(pool(), { Clapham: 'love' }, undefined, 5);
    assert.ok(result);
    const anchor = areaCoords(result.anchor);
    assert.ok(anchor, 'the anchor itself should have coordinates');
    const near = result.candidates.filter((c) => distanceKm(anchor, c) <= 5);
    assert.ok(near.length >= 1, 'expected at least one suggestion within 5km of the anchor');
  });
});
