import type { Destinations } from './types';
import destinationsData from '../assets/data/destinations.json';

/**
 * The 73 Zone 1 workplace stations (js/config.js DESTINATIONS on the web
 * app), keyed by workId. Bundled directly rather than fetched like
 * stations.json/journey-times.json — this is small (~4KB) and static, so
 * there's no reason to add a network dependency for it.
 *
 * Coordinates are TfL-verified, not the web app's own fallback (which
 * string-matches a label against area names when no override is given —
 * the exact class of bug that mismatched several real stations tonight
 * while fixing build_journey_times.py). Regenerate by re-running the same
 * StopPoint lookup used there if a station code ever changes.
 */
export function getDestination(workId: string) {
  return (destinationsData as Destinations)[workId] ?? null;
}
