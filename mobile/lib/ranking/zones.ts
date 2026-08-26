import type { Lifestyle } from '../types';
import type { AreaCandidate } from './prompt';
import zone1 from '../../assets/data/zone1-stations.json';

/**
 * The Zone 1 answer is the only lifestyle field that changes WHICH areas are
 * ranked rather than just how they're described to the model (Nick,
 * 2026-08-26): answering no to "would you live in Zone 1?" should stop
 * central areas being suggested at all, not merely rank them lower.
 *
 * A neighbourhood counts as Zone 1 if ANY of its contributing stations is —
 * neighbourhoods straddle zones, and someone who has ruled Zone 1 out will
 * not thank us for suggesting a place whose nearest station is Barbican.
 *
 * Deliberately conservative in the other direction: an unanswered question
 * (zone1Ok undefined) filters nothing. Silently removing dozens of areas
 * because a question was never reached would be much worse than showing a
 * few someone doesn't want.
 */

const ZONE1_STATIONS = new Set<string>(zone1.stations);

export function isZone1(candidate: AreaCandidate): boolean {
  return candidate.stations.some((s) => ZONE1_STATIONS.has(s));
}

/** Drops Zone 1 neighbourhoods when, and only when, they've said no to it. */
export function applyZone1Filter(
  candidates: AreaCandidate[],
  lifestyle: Lifestyle | undefined,
): AreaCandidate[] {
  if (lifestyle?.zone1Ok !== false) return candidates;
  const kept = candidates.filter((c) => !isZone1(c));
  // Never hand back an empty list: if someone's commute only reaches central
  // London, honouring the filter would leave them with no picks at all,
  // which reads as a broken app rather than a respected preference.
  return kept.length > 0 ? kept : candidates;
}
