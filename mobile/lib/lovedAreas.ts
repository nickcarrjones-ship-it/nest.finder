import type { AreaCards, Area } from './types';
import { placeLabel } from './ranking/placeLabels';
import { resolveAreaName } from './ranking/anchor';

/**
 * The order loved areas appear in — on the map's rose pins, and now in the
 * picks carousel too.
 *
 * "At first, they need to be ranked in position 1, 2, 3, 4, 5, whatever"
 * (Nick, 2026-09-09): a newly loved area just takes the next number, no
 * decision required. `lovedOrder` only records what someone has
 * DELIBERATELY reordered — most loved areas never appear in it at all —
 * so this function is what actually decides the order shown on screen: the
 * ones someone has ranked, in the order they ranked them, then everything
 * else loved, oldest-first by when `areaCards` recorded it (a plain object
 * preserves insertion order for string keys, which is the one place this
 * relies on that being true rather than restating it).
 *
 * Areas that stopped being loved, or were never loved despite lingering in
 * a stale `lovedOrder`, are dropped rather than shown as a gap.
 */
export function effectiveLovedOrder(
  areaCards: AreaCards | undefined,
  lovedOrder: string[] | undefined,
): string[] {
  const loved = new Set(
    Object.entries(areaCards ?? {}).filter(([, v]) => v === 'love').map(([k]) => k),
  );
  const ranked = (lovedOrder ?? []).filter((name) => loved.has(name));
  const rest = [...loved].filter((name) => !ranked.includes(name));
  return [...ranked, ...rest];
}

/**
 * Move one area to a 1-based position, shifting the rest to make room.
 *
 * Only positions 1, 2 and 3 are exposed in the UI — "this will define the
 * user's preferred areas" — but the function itself does not enforce that
 * cap: clamping it here as well as in the UI would be the same rule stated
 * twice, and the one place it actually matters is what the buttons offer.
 */
export function reorderToPosition(order: string[], name: string, position: number): string[] {
  const without = order.filter((n) => n !== name);
  const at = Math.max(0, Math.min(position - 1, without.length));
  return [...without.slice(0, at), name, ...without.slice(at)];
}

export interface AreaLocation {
  lat: number;
  lng: number;
  /** False when the pin can sit on the basemap's own label for the place —
   *  see AnchorPin, which is the only other caller of this rule. */
  showLabel: boolean;
}

/**
 * Where a loved area actually sits, for a pin or a card.
 *
 * The SAME resolution AnchorPin has used since 2026-09-01, pulled out so
 * the picks carousel can place these cards on the map too without a second,
 * possibly-drifting copy of the rule: the basemap's own OSM label for the
 * place first, so the pin lands on the word rather than near it, and only
 * falls back to the station's coordinates where London draws no such
 * label — the one case where there is no word on the map to sit on.
 */
export function locateArea(name: string, stations: Area[]): AreaLocation | null {
  const label = placeLabel(name);
  if (label) return { lat: label.lat, lng: label.lng, showLabel: false };

  const resolved = resolveAreaName(name);
  const station = resolved ? stations.find((s) => s.name === resolved) : undefined;
  return station ? { lat: station.lat, lng: station.lng, showLabel: true } : null;
}
