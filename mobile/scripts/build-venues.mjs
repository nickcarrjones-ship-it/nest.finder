/**
 * Builds assets/data/area-venues.json from a local OpenStreetMap extract.
 *
 *   npm run venues            # uses data/london.osm.pbf, downloading if absent
 *   npm run venues -- <path>  # or point it at an extract you already have
 *
 * This is the texture the FSA register cannot give. FSA files every sit-down
 * place as one category, `Restaurant/Cafe/Canteen`, so a street of brunch
 * cafés and a street of destination restaurants look identical — and it
 * files a gastropub and a nightclub together as `Pub/bar/nightclub`, which
 * is exactly the distinction Nick drew when he rejected Chiswick Park as a
 * match for Clapham Common (2026-08-27).
 *
 * OSM tags them separately and carries `cuisine`, giving the diversity
 * measure the plan wanted. Its weakness mirrors FSA's: precise categories,
 * uneven coverage. So the two are used together — FSA is the denominator and
 * the ground truth for what EXISTS, OSM supplies the shape of what KIND.
 *
 * WHY A LOCAL FILE RATHER THAN THE OVERPASS API. Overpass is built for small
 * interactive queries, not bulk extraction, and using it the wrong way got
 * this machine blocked repeatedly (2026-08-27/28) — first after sixteen
 * rapid queries, then again after two. Downloading one extract is the
 * intended route for this job: no rate limits, reproducible, and it works
 * offline.
 *
 * KNOWN LIMITATION, stated rather than hidden: this reads NODES only. A
 * minority of venues are mapped as ways (a building outline rather than a
 * point), and resolving those needs every node position in London held in
 * memory. Counts here are therefore a floor. Since every metric is a SHARE
 * or a diversity count rather than a total, and the omission is not thought
 * to favour one venue type, this affects precision more than comparison —
 * but it is a real gap, and `nodesOnly` records it in the output.
 *
 * What this still does NOT give: reliable closing times. Only about 28% of
 * venues carry `opening_hours`, so `lateNight` is recorded but excluded from
 * matching. A real late-licence signal needs borough premises licence data,
 * which has no consolidated London source and remains outstanding.
 *
 * Licence: © OpenStreetMap contributors, ODbL. Attribution is required
 * before launch — see docs/data-sources.md.
 */
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const parseOsm = require('osm-pbf-parser');
const appStations = require('../assets/data/stations.json');

const OUT = new URL('../assets/data/area-venues.json', import.meta.url);
const DEFAULT_EXTRACT = new URL('../data/london.osm.pbf', import.meta.url);
const EXTRACT_URL = 'https://download.bbbike.org/osm/bbbike/London/London.osm.pbf';
const RADIUS_KM = 1.60934;
const KINDS = ['cafe', 'restaurant', 'bar', 'pub', 'nightclub', 'fast_food'];

const extractPath = process.argv[2] ? new URL(process.argv[2], `file://${process.cwd()}/`) : DEFAULT_EXTRACT;

async function ensureExtract() {
  if (existsSync(extractPath)) {
    const mb = statSync(extractPath).size / 1048576;
    console.log(`Using ${extractPath.pathname} (${mb.toFixed(0)} MB)`);
    return;
  }
  console.log(`Downloading the London extract (~189 MB) from ${EXTRACT_URL}…`);
  mkdirSync(new URL('.', extractPath), { recursive: true });
  const res = await fetch(EXTRACT_URL);
  if (!res.ok) throw new Error(`extract download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(extractPath, bytes);
  console.log(`  saved ${(bytes.length / 1048576).toFixed(0)} MB`);
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
/** Any listed time between midnight and 4am counts as open late. */
const OPEN_LATE = /\b(0[0-4]:[0-5]\d|2[4-9]:[0-5]\d)\b/;

await ensureExtract();

console.log('Scanning the extract for eating and drinking places…');
const wanted = new Set(KINDS);
const venues = [];
let scanned = 0;

await pipeline(
  createReadStream(extractPath),
  parseOsm(),
  new Writable({
    objectMode: true,
    write(items, _enc, done) {
      for (const item of items) {
        scanned += 1;
        if (item.type !== 'node') continue;
        const amenity = item.tags?.amenity;
        if (!amenity || !wanted.has(amenity)) continue;
        venues.push({
          lat: item.lat,
          lng: item.lon,
          kind: amenity,
          cuisine: item.tags.cuisine,
          hours: item.tags.opening_hours,
        });
      }
      done();
    },
  }),
);
console.log(`  ${scanned.toLocaleString()} OSM elements scanned, ${venues.length} venues found\n`);

const areas = {};
let empty = 0;
for (const station of appStations) {
  const near = venues.filter((v) => distanceKm(station, v) <= RADIUS_KM);
  if (near.length === 0) {
    empty += 1;
    continue;
  }
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const cuisines = new Set();
  let lateNight = 0;
  for (const v of near) {
    counts[v.kind] += 1;
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
    /** Recorded for later. NOT used for matching — only ~28% of venues tag hours. */
    lateNight,
  };
}

const out = {
  source: 'OpenStreetMap, London extract via BBBike',
  url: EXTRACT_URL,
  licence: '© OpenStreetMap contributors, ODbL — attribution required',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Nodes tagged ${KINDS.join('/')} within ${RADIUS_KM.toFixed(2)}km of each area.`,
  nodesOnly: true,
  caveats: [
    'Nodes only — venues mapped as building outlines are missed, so counts are a floor.',
    'OSM is contributed, so coverage is uneven. Use FSA for what exists, this for what kind.',
    'lateNight is unreliable: only ~28% of venues carry opening_hours. Excluded from matching.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${Object.keys(areas).length} areas to assets/data/area-venues.json`);
if (empty) console.log(`${empty} areas had no tagged venue within range`);
