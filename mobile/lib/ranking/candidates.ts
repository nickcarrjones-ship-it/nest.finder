import type { AreaBudget } from '../walkBudget';
import type { AreaCandidate } from './prompt';

/** station area name -> the neighbourhood it belongs to. */
export type IdentityMap = Record<string, string>;

/**
 * Groups station-anchored budgets into neighbourhood candidates for the AI
 * to rank. Several stations can belong to one neighbourhood (Clapham North,
 * Clapham High Street and Clapham Common are all just Clapham) — when they
 * do, the neighbourhood is exactly as reachable as its BEST station, since
 * that is genuinely where someone could live and still make the commute.
 *
 * Deliberately takes the identity map as a parameter rather than importing
 * one. The real mapping (station -> real-world neighbourhood, built from
 * OpenStreetMap boundaries) is still being generated as of 2026-08-23; this
 * keeps the grouping and ranking logic buildable and testable without
 * waiting on it, and makes swapping the real mapping in a one-line change
 * at the call site rather than a rewrite here.
 */
export function computeAreaCandidates(
  budgets: AreaBudget[],
  identities: IdentityMap,
): AreaCandidate[] {
  const byHood = new Map<string, AreaBudget[]>();
  for (const b of budgets) {
    const hood = identities[b.area.name] ?? b.area.name;
    const list = byHood.get(hood);
    if (list) list.push(b); else byHood.set(hood, [b]);
  }

  const out: AreaCandidate[] = [];
  for (const [hood, group] of byHood) {
    // The best station carries the neighbourhood — fastest commute, and
    // among ties the most generous walk budget.
    const slowestLeg = (b: AreaBudget) => Math.max(...b.journeys);
    const best = group.reduce((a, b) => {
      if (slowestLeg(a) !== slowestLeg(b)) return slowestLeg(a) < slowestLeg(b) ? a : b;
      return a.budget >= b.budget ? a : b;
    });
    out.push({
      neighbourhood: hood,
      stations: group.map((g) => g.area.name),
      lat: best.area.lat,
      lng: best.area.lng,
      commuteMins: Math.max(...best.journeys),
      walkBudgetMins: best.budget,
      pocketSize: group.length,
    });
  }

  return out.sort((a, b) => a.commuteMins - b.commuteMins);
}

/** A no-op identity map — every station is its own neighbourhood. Used only
 *  until the real OSM-derived mapping is available; never the intended
 *  final behaviour (Brixton and Clapham Common would stay ungrouped). */
export function identityStationsOnly(stationNames: string[]): IdentityMap {
  return Object.fromEntries(stationNames.map((n) => [n, n]));
}
