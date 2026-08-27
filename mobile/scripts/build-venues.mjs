/**
 * Builds assets/data/area-venues.json from OpenStreetMap via Overpass.
 *
 *   npm run venues
 *
 * This is the texture the FSA register cannot give. FSA files every sit-down
 * place as one category, `Restaurant/Cafe/Canteen`, so the difference
 * between a street of brunch cafés and a street of destination restaurants
 * was invisible — and it files a gastropub and a nightclub together as
 * `Pub/bar/nightclub`, which is exactly the distinction Nick drew when he
 * rejected Chiswick Park as a match for Clapham Common (2026-08-27).
 *
 * OSM tags them separately — cafe, restaurant, bar, pub, nightclub,
 * fast_food — and carries `cuisine`, which gives the diversity measure the
 * plan wanted. Its weakness is the mirror of FSA's: precise categories,
 * incomplete coverage. So the two are used together, as designed: FSA is the
 * denominator and the ground truth for what EXISTS, OSM supplies the shape
 * of what KIND.
 *
 * What this still does NOT give: reliable closing times. Only about 28% of
 * London venues carry `opening_hours`, far too sparse to build a late-night
 * signal on, so `lateNight` counts are recorded but deliberately excluded
 * from matching. A real late-licence signal needs borough premises licence
 * data, which has no consolidated London source and remains outstanding.
 *
 * Licence: OpenStreetMap contributors, ODbL. Attribution is required before
 * launch — see docs/data-sources.md.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json');

const OUT = new URL('../assets/data/area-venues.json', import.meta.url);
const RADIUS_KM = 1.60934;
const ENDPOINT = 'https://overpass-api.de/api/interpreter';
/** Greater London, generously. Split into tiles so no single query times out. */
const BBOX = { south: 51.25, west: -0.55, north: 51.72, east: 0.35 };
/**
 * TWO tiles per side, not four — sixteen rapid queries got us temporarily
 * blocked by Overpass, which is a shared free service with strict etiquette.
 * Four large queries with long gaps is both politer and faster in practice.
 */
const TILES = 2;
/** Overpass bans are measured in minutes, so pauses here are deliberate. */
const GAP_MS = 25000;
const COOLDOWN_MS = 90000;
const KINDS = ['cafe', 'restaurant', 'bar', 'pub', 'nightclub', 'fast_food'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
      });
      // 429 and 504 are Overpass's normal "you are asking too fast" replies.
      if (res.status === 429 || res.status >= 500) {
        await sleep(60000 * (i + 1));
        continue;
      }
      if (res.status !== 200) return null;
      return await res.json();
    } catch {
      await sleep(45000 * (i + 1));
    }
  }
  throw new Error('Overpass would not answer after several attempts');
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round = (n) => Math.round(n * 1000) / 1000;
/** Anything listing a time between midnight and 4am is open late. */
const OPEN_LATE = /\b(0[0-4]:[0-5]\d|2[4-9]:[0-5]\d)\b/;

console.log(`Fetching ${KINDS.join(', ')} across London from OpenStreetMap…`);
console.log('Pausing first to let any Overpass rate limit clear…');
await sleep(COOLDOWN_MS);
const venues = new Map();
const latStep = (BBOX.north - BBOX.south) / TILES;
const lngStep = (BBOX.east - BBOX.west) / TILES;

for (let i = 0; i < TILES; i++) {
  for (let j = 0; j < TILES; j++) {
    const s = BBOX.south + i * latStep;
    const n = s + latStep;
    const w = BBOX.west + j * lngStep;
    const e = w + lngStep;
    const query = `[out:json][timeout:120];
(
  node["amenity"~"^(${KINDS.join('|')})$"](${s},${w},${n},${e});
  way["amenity"~"^(${KINDS.join('|')})$"](${s},${w},${n},${e});
);
out center tags;`;
    const body = await overpass(query);
    if (!body) {
      console.log(`  tile ${i * TILES + j + 1}: NO RESPONSE — rerun to fill this gap`);
      await sleep(GAP_MS);
      continue;
    }
    for (const el of body.elements ?? []) {
      // Ways report a `center`; nodes carry lat/lon directly.
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;
      venues.set(`${el.type}/${el.id}`, {
        lat,
        lng,
        kind: el.tags?.amenity,
        cuisine: el.tags?.cuisine,
        hours: el.tags?.opening_hours,
      });
    }
    console.log(`  tile ${i * TILES + j + 1}/${TILES * TILES} — ${venues.size} venues so far`);
    await sleep(GAP_MS);
  }
}
console.log(`\n${venues.size} distinct venues\n`);

const all = [...venues.values()];
const areas = {};
let empty = 0;
for (const station of appStations) {
  const near = all.filter((v) => distanceKm(station, v) <= RADIUS_KM);
  if (near.length === 0) {
    empty += 1;
    continue;
  }
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const cuisines = new Set();
  let lateNight = 0;
  for (const v of near) {
    if (v.kind && counts[v.kind] !== undefined) counts[v.kind] += 1;
    // A venue can list several cuisines; each counts once.
    for (const c of (v.cuisine ?? '').split(';')) if (c.trim()) cuisines.add(c.trim().toLowerCase());
    if (v.hours && OPEN_LATE.test(v.hours)) lateNight += 1;
  }
  const total = near.length;
  areas[station.name] = {
    venues: total,
    counts,
    shares: Object.fromEntries(KINDS.map((k) => [k, round(counts[k] / total)])),
    /** The measure of cosmopolitan: how many kinds of food, not how much. */
    cuisineCount: cuisines.size,
    /** Recorded for later. NOT used for matching — only 28% of venues tag hours. */
    lateNight,
  };
}

const out = {
  source: 'OpenStreetMap via the Overpass API',
  url: ENDPOINT,
  licence: 'Open Data Commons Open Database License (ODbL) — attribution required',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Venues tagged ${KINDS.join('/')} within ${RADIUS_KM.toFixed(2)}km of each area.`,
  caveats: [
    'OSM is contributed, so coverage is uneven — use FSA for what exists, this for what kind.',
    'lateNight is unreliable: only ~28% of venues carry opening_hours. Excluded from matching.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${Object.keys(areas).length} areas to assets/data/area-venues.json`);
if (empty) console.log(`${empty} areas had no tagged venue within range`);
