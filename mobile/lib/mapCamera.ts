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

/** Web-mercator metres per pixel at zoom 0, the constant every tile scheme uses. */
const EARTH_CIRCUMFERENCE = 40075016.686;
const TILE_SIZE = 512;

/**
 * The zoom at which `fraction` of the region's AREA is on screen.
 *
 * Area, not width — "70% of it visible" is naturally read as area, and area
 * grows with the square of distance, so 70% of the area is about 84% of the
 * span. Getting that wrong would zoom noticeably too far out.
 */
export function zoomToShow(
  bounds: { sw: LngLat; ne: LngLat },
  viewport: { width: number; height: number },
  fraction = 0.7,
): number {
  const latSpan = Math.max(1e-6, bounds.ne.lat - bounds.sw.lat);
  const lngSpan = Math.max(1e-6, bounds.ne.lng - bounds.sw.lng);
  const midLat = (bounds.ne.lat + bounds.sw.lat) / 2;

  // Metres across, accounting for longitude lines converging at this latitude.
  const metresPerDegLat = EARTH_CIRCUMFERENCE / 360;
  const heightM = latSpan * metresPerDegLat;
  const widthM = lngSpan * metresPerDegLat * Math.cos((midLat * Math.PI) / 180);

  const linear = Math.sqrt(fraction);
  const zoomFor = (metres: number, pixels: number) => {
    const target = metres * linear;
    const metresPerPixel = target / Math.max(1, pixels);
    return Math.log2((EARTH_CIRCUMFERENCE * Math.cos((midLat * Math.PI) / 180)) / (TILE_SIZE * metresPerPixel));
  };

  // Whichever axis is tighter decides, or the other one spills off screen.
  const zoom = Math.min(zoomFor(widthM, viewport.width), zoomFor(heightM, viewport.height));
  // Clamped to something a street map can actually render usefully.
  return Math.max(8, Math.min(14, zoom));
}

/**
 * The opening camera, or null while we do not yet know enough for one.
 *
 * Returning null rather than a guess matters: a wrong first view is worse
 * than the default, because it moves once the data lands and looks broken.
 */
export function openingCamera(
  workplaces: LngLat[],
  region: GeoJSON.MultiPolygon | null,
  viewport: { width: number; height: number },
  fraction = 0.7,
): { center: [number, number]; zoom: number } | null {
  const centre = midpoint(workplaces);
  if (!centre) return null;
  const bounds = boundsOf(region);
  // Workplaces but no region yet — centre on them at a sensible city zoom
  // rather than waiting, so the first frame is already about this household.
  if (!bounds) return { center: [centre.lng, centre.lat], zoom: 10.5 };
  return { center: [centre.lng, centre.lat], zoom: zoomToShow(bounds, viewport, fraction) };
}
