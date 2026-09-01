import placeData from '../../assets/data/area-places.json';
import stations from '../../assets/data/stations.json';
import { normaliseName } from './normaliseName';

/**
 * Where London writes its own place names.
 *
 * These are the OpenStreetMap place= nodes the basemap renders as labels —
 * the actual points behind the words "Tooting" and "Clapham" on the map.
 * Built by scripts/build-places.mjs from the same extract the parks and
 * venues data comes from.
 *
 * They exist because our datasets are keyed by STATION, and a station is
 * not a place. Matching what someone says against station names alone put
 * "Wandsworth" on Wandsworth Road — a station in Lambeth, 4.07km from
 * Wandsworth and across a borough boundary — and the similarity engine then
 * measured the wrong neighbourhood for every one of the ten suggestions
 * that followed (found 2026-09-01).
 *
 * A label does not replace the station. It ARBITRATES between the stations
 * whose names match, which is the only rule that fixed the broken cases
 * without breaking working ones: nearest-to-the-label alone moved "Fulham"
 * off Fulham Broadway onto Parsons Green, and "Stoke Newington" onto
 * Rectory Road.
 */

export interface PlaceLabel {
  lat: number;
  lng: number;
  /** suburb, town, neighbourhood, quarter, village or city. */
  cls: string;
}

const labels = placeData as Record<string, PlaceLabel>;

/** Normalised name -> label, built once. */
let index: Map<string, PlaceLabel> | null = null;

function lookup(): Map<string, PlaceLabel> {
  if (index) return index;
  index = new Map();
  for (const [name, label] of Object.entries(labels)) {
    // First writer wins: the file is sorted, and the build has already
    // dropped names that are ambiguous at the same prominence, so a
    // collision here is only ever a normalisation collision.
    const key = normaliseName(name);
    if (!index.has(key)) index.set(key, label);
  }
  return index;
}

/** Where the map writes this name, or null if it writes it nowhere. */
export function placeLabel(said: string): PlaceLabel | null {
  return lookup().get(normaliseName(said)) ?? null;
}

export interface Nearby {
  name: string;
  km: number;
}

const EARTH_KM = 6371;

/** Straight-line distance. Fine at London scale, and only ever used to rank. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(x));
}

/** Station coordinates by name, built once. */
let coords: Map<string, { lat: number; lng: number }> | null = null;

function stationCoords(): Map<string, { lat: number; lng: number }> {
  if (coords) return coords;
  coords = new Map();
  for (const s of stations as { name: string; lat: number; lng: number }[]) {
    coords.set(s.name, { lat: s.lat, lng: s.lng });
  }
  return coords;
}

/** Where an area sits, or null for one we hold no coordinates for. */
export function areaCoords(name: string): { lat: number; lng: number } | null {
  return stationCoords().get(name) ?? null;
}

/**
 * The closest of `names` to a point, ignoring any we cannot place.
 *
 * Returns null rather than a far-away guess when nothing can be placed, so
 * a caller can tell "nothing near" from "nothing known".
 */
export function nearestTo(
  point: { lat: number; lng: number },
  names: readonly string[],
): Nearby | null {
  let best: Nearby | null = null;
  for (const name of names) {
    const at = areaCoords(name);
    if (!at) continue;
    const km = distanceKm(point, at);
    if (!best || km < best.km) best = { name, km };
  }
  return best;
}

/** Test seam — both indexes are built once and outlive a test otherwise. */
export function resetPlaceCaches(): void {
  index = null;
  coords = null;
}
