import type { AreaCards, Area } from './types';
import { placeLabel } from './ranking/placeLabels';
import { resolveAreaName } from './ranking/anchor';

/**
 * The order loved areas appear in — on the map's numbered rose bubbles, and
 * in the picks carousel too.
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
 * The UI offers one position per loved area (it used to stop at 3 — lifted
 * 2026-09-25, since a fifth loved area had nowhere to go). Out-of-range
 * positions are clamped to the end rather than leaving a gap.
 */
export function reorderToPosition(order: string[], name: string, position: number): string[] {
  const without = order.filter((n) => n !== name);
  const at = Math.max(0, Math.min(position - 1, without.length));
  return [...without.slice(0, at), name, ...without.slice(at)];
}

export interface AreaLocation {
  lat: number;
  lng: number;
}

/**
 * Where a loved area actually sits, for its bubble on the map or its card
 * in the carousel — one rule, so the two never disagree about a place.
 *
 * The basemap's own OSM label for the place first, so a pin lands on the
 * real word "Tooting" rather than somewhere near it, and only falls back
 * to the station's coordinates where London draws no such label — the one
 * case where there is no word on the map to sit on.
 *
 * `showLabel` used to travel with this, back when a loved area's pin was
 * an unlabelled dot that could be tapped to reveal its name. That
 * mechanism is gone (Nick, 2026-09-09: loved areas are numbered bubbles
 * now, same as every other pick) — nothing shows a name in place any
 * more, so there is nothing left for that field to answer.
 */
export function locateArea(name: string, stations: Area[]): AreaLocation | null {
  const label = placeLabel(name);
  if (label) return { lat: label.lat, lng: label.lng };

  const resolved = resolveAreaName(name);
  const station = resolved ? stations.find((s) => s.name === resolved) : undefined;
  return station ? { lat: station.lat, lng: station.lng } : null;
}
