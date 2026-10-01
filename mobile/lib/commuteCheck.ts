import type { Ring } from './mergeStrategies';
import type { Area, JourneyTimes, Profile } from './types';
import { resolveCommute } from './commuteSettings';

/**
 * Is a pasted property inside the teal zone, and roughly how long is the
 * commute from it? (Nick, 2026-10-01: Woburn Close sat outside the teal
 * zone and nothing said so.)
 *
 * PURE and read-only. It never changes how the zone itself is worked out -
 * the commute calculation is one of the two things that must not break - it
 * reuses the SAME catchment shapes the map draws (lib/isochrones.ts) and
 * the same rule the map uses (lib/mergeRegions.ts): a home is in the zone
 * when it sits inside SOME catchment of EVERY member. So this can never
 * disagree with what the map shows.
 */

interface IndexedRing { ring: Ring; minX: number; minY: number; maxX: number; maxY: number }

export function indexRings(rings: Ring[]): IndexedRing[] {
  return rings.map((ring) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { ring, minX, minY, maxX, maxY };
  });
}

/** Ray casting, coordinates as [lng, lat]. */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inAnyRing(lat: number, lng: number, rings: IndexedRing[]): boolean {
  return rings.some((r) => lng >= r.minX && lng <= r.maxX && lat >= r.minY && lat <= r.maxY && inRing(lng, lat, r.ring));
}

/** In the shared zone: inside some catchment of EVERY member. */
export function inSharedZone(lat: number, lng: number, perMember: IndexedRing[][]): boolean {
  return perMember.length > 0 && perMember.every((rings) => inAnyRing(lat, lng, rings));
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Door to desk for the SLOWEST member - the one that decides whether a home
 * works - via whichever nearby station is quickest for each. An ESTIMATE:
 * the walk is straight-line distance with a 25% allowance for real streets,
 * at 80m a minute, where the zone itself uses real walking routes. Callers
 * only show it when it agrees with the zone check.
 */
export function estimateCommute(
  at: { lat: number; lng: number },
  stations: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
): number | null {
  const members = profile.members ?? [];
  if (!members.length) return null;
  const near = stations
    .map((s) => ({ s, walk: Math.ceil((km(at, s) * 1000 * 1.25) / 80) }))
    .filter((x) => x.walk <= 25);
  let slowest = 0;
  for (const m of members) {
    let best = Infinity;
    for (const { s, walk } of near) {
      const journey = journeyTimes[s.name]?.[m.workId];
      if (typeof journey === 'number') best = Math.min(best, walk + journey + (m.offWalk ?? 0));
    }
    if (!Number.isFinite(best)) return null;
    slowest = Math.max(slowest, best);
  }
  return slowest;
}

export interface CommuteVerdict {
  inZone: boolean;
  /** Shown only when it agrees with inZone; null otherwise. */
  mins: number | null;
  maxMins: number;
}

export function commuteVerdict(
  at: { lat: number; lng: number },
  perMember: IndexedRing[][],
  stations: Area[],
  journeyTimes: JourneyTimes,
  profile: Profile,
): CommuteVerdict {
  const inZone = inSharedZone(at.lat, at.lng, perMember);
  const maxMins = Math.max(...resolveCommute(profile).maxMins);
  const est = estimateCommute(at, stations, journeyTimes, profile);
  // An estimate that contradicts the zone (say 48 minutes for somewhere
  // just outside it) would confuse more than it helps, so it is dropped.
  const agrees = est !== null && (inZone ? est <= maxMins : est > maxMins);
  return { inZone, mins: agrees ? est : null, maxMins };
}
