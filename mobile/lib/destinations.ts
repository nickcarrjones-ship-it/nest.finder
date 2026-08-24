import type { Area, Destinations } from './types';
import destinationsData from '../assets/data/destinations.json';

/**
 * Resolving a workId to a real map coordinate — mirrors the web app's
 * findStation (js/map-core.js): prefer an explicit override, and where
 * there isn't one, fall back to matching the workplace's label against the
 * candidate-area station list (many workplace stations, e.g. "Victoria" or
 * "Angel", are also entries in stations.json under the same name).
 *
 * Bug fixed 2026-08-23: this used to be a bare lookup with no fallback, so
 * any workId beyond the 2 demo entries (canary_wharf, holborn) silently had
 * no pin at all — invisible with a 2-person demo profile, but broke as soon
 * as real, non-demo workplaces were entered (surfaced by the new multi-
 * person WorkplaceEntrySheet). The handful of stations whose label doesn't
 * cleanly string-match (e.g. "Bank / Monument", "Elephant & Castle") keep
 * explicit overrides here, same as the web app's DESTINATIONS array.
 */

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export function getDestination(
  workId: string,
  workLabel: string,
  stations: Area[],
): { lat: number; lng: number } | null {
  const override = (destinationsData as Destinations)[workId];
  if (override) return { lat: override.lat, lng: override.lng };

  const target = normalize(workLabel);
  const match = stations.find((s) => normalize(s.name) === target);
  return match ? { lat: match.lat, lng: match.lng } : null;
}
