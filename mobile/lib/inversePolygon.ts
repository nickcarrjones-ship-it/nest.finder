import type { Ring } from './mergeStrategies';

/**
 * Turn a region into its inverse, so the map can dim everything OUTSIDE it.
 *
 * MapLibre has no "fade everything except this shape" primitive. The standard
 * trick is a polygon covering the whole visible world whose INNER rings are
 * the region — a fill with holes punched in it. Fill that with a translucent
 * wash and the reachable area shows through at full strength while the rest
 * recedes.
 *
 * The winding rule matters and is easy to get wrong: in GeoJSON the first
 * ring of a polygon is the outer boundary and every subsequent ring is a
 * hole. Renderers use the even-odd rule here, so holes do not need opposite
 * winding to their shell — but nested holes would cancel out, which is why
 * the region must already be merged (no overlapping shapes) before it gets
 * here.
 */

/** Comfortably beyond any real viewport, and inside valid lat/lng bounds. */
const WORLD: Ring = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

type MP = number[][][][];

/**
 * @param regionRings every outer ring of the merged reachable region
 * @returns a single polygon: the world, with the region cut out of it
 */
export function invertRegion(regionRings: Ring[]): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [WORLD, ...regionRings.filter((r) => r.length >= 4)],
  };
}

/** Pull the outer ring of every polygon out of polygon-clipping's output. */
export function outerRings(merged: MP): Ring[] {
  if (!Array.isArray(merged)) return [];
  return merged
    .map((poly) => poly?.[0])
    .filter((r): r is Ring => Array.isArray(r) && r.length >= 4);
}

/** The region itself, for drawing its boundary line. */
export function regionFeature(regionRings: Ring[]): GeoJSON.MultiPolygon {
  return {
    type: 'MultiPolygon',
    coordinates: regionRings.map((r) => [r]),
  };
}
