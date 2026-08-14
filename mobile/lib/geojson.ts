import type { ReachableArea } from './types';

/**
 * Turns the computed reachable areas into a GeoJSON FeatureCollection —
 * the format MapLibre's <GeoJSONSource> expects. One point per area, with
 * the per-member commute times attached as properties (handy for popups
 * later; unused by the circle layer itself today).
 */
export function reachableAreasToGeoJSON(areas: ReachableArea[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.map(({ area, memberTimes }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [area.lng, area.lat] },
      properties: { name: area.name, memberTimes },
    })),
  };
}
