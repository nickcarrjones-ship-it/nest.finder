/**
 * Where the map should sit when someone first opens it.
 *
 * It used to open on a fixed point in central London at zoom 10, which is
 * right for nobody: a couple working in Croydon and Stratford got a view
 * centred on Westminster, and had to pan before seeing anything about
 * themselves.
 *
 * Nick's brief (2026-08-29): centre on the midpoint of the workplaces, and
 * zoom so most of the reachable region is on screen — not a tight fit, which
 * leaves the region touching the edges with no context around it.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

/**
 * The point between the workplaces.
 *
 * Deliberately the midpoint of the WORK locations rather than the centre of
 * the reachable region: the region can sprawl a long way down one rail line,
 * which would drag the view somewhere neither person recognises. The
 * workplaces are the two fixed facts of a household's search.
 */
export function midpoint(points: LngLat[]): LngLat | null {
  if (points.length === 0) return null;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  return { lng, lat };
}

/** The corners of a MultiPolygon, ignoring holes. */
export function boundsOf(region: GeoJSON.MultiPolygon | null): { sw: LngLat; ne: LngLat } | null {
  if (!region?.coordinates?.length) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const polygon of region.coordinates) {
    // [0] is the outer ring; the rest are holes and cannot extend the bounds.
    for (const [lng, lat] of polygon[0] ?? []) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return { sw: { lng: minLng, lat: minLat }, ne: { lng: maxLng, lat: maxLat } };
}

/**
 * A box to fit the camera to: centred on the workplaces, sized so the region
 * overflows it by the right amount.
 *
 * This replaces a hand-rolled zoom calculation that was simply wrong — it
 * returned a zoom showing 167% of the region's width where 84% was wanted,
 * because MapLibre's zoom levels do not follow the 256-pixel-tile convention
 * the usual metres-per-pixel formula assumes.
 *
 * Handing MapLibre a box and letting its own fitBounds decide the zoom side-
 * steps that entirely: the library already knows its own projection. We just
 * have to describe the box we want filled.
 *
 * Showing `fraction` of the region's AREA means the box is sqrt(fraction) of
 * its span — 70% of the area is 84% of the width — and centring that box on
 * the workplaces rather than on the region keeps the view where the
 * household actually is.
 */
export function framingBounds(
  workplaces: LngLat[],
  region: GeoJSON.MultiPolygon | null,
  fraction = 0.7,
): { sw: LngLat; ne: LngLat } | null {
  const centre = midpoint(workplaces);
  const bounds = boundsOf(region);
  if (!centre || !bounds) return null;

  const linear = Math.sqrt(fraction);
  // Half-spans of the box, measured from the region but centred on the
  // workplaces — so a region sprawling down one line does not drag the view
  // off the people it belongs to.
  const halfLng = ((bounds.ne.lng - bounds.sw.lng) / 2) * linear;
  const halfLat = ((bounds.ne.lat - bounds.sw.lat) / 2) * linear;

  return {
    sw: { lng: centre.lng - halfLng, lat: centre.lat - halfLat },
    ne: { lng: centre.lng + halfLng, lat: centre.lat + halfLat },
  };
}
