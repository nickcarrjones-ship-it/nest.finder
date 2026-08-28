/**
 * Builds assets/data/area-homes.json — what the buildings actually look like.
 *
 *   npm run homes
 *
 * The gap Canary Wharf exposed (Nick, 2026-08-28). The engine matched it to
 * Balham at 56% because their busyness curves are nearly identical — and
 * nothing in twenty-three dimensions could tell glass towers from Victorian
 * terraces. Nick's words: "I do desperately think we need a 'what the place
 * looks like' element too." He is right; it is one of the first things
 * anybody means by an area's character.
 *
 * Source: the same OpenStreetMap extract build-venues.mjs already uses, so
 * this costs one more pass over a file we hold rather than a new dependency
 * or another API. 1.5 million London buildings, 59% carrying a specific
 * type and 18% a storey count.
 *
 * WHAT THIS GIVES: the mix of houses, terraces, semis and flats, and how
 * tall things are. Enough to separate a street of two-storey terraces from
 * an estate of towers.
 *
 * WHAT IT DOES NOT: construction age. Only 0.1% of London buildings carry
 * `start_date`, so Victorian-versus-postwar genuinely needs the EPC
 * register, which requires a registered API key. That is real outstanding
 * work, not something to fudge from building type.
 *
 * Positions come from each building's FIRST node rather than a true
 * centroid. A building is metres across and every measure here works at a
 * one-mile radius, so the error is irrelevant — and holding one reference
 * per building instead of all of them keeps a 1.5-million-building pass
 * inside sensible memory.
 *
 * Licence: © OpenStreetMap contributors, ODbL.
 */
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const parseOsm = require('osm-pbf-parser');
const appStations = require('../assets/data/stations.json');

const OUT = new URL('../assets/data/area-homes.json', import.meta.url);
const EXTRACT = new URL('../data/london.osm.pbf', import.meta.url);
const RADIUS_KM = 1.60934;

/**
 * Places people live, grouped as someone would describe a street.
 * Everything else — garages, sheds, shops, schools — is ignored: they say
 * nothing about what it is like to live there.
 */
const HOME_TYPES = {
  house: 'house',
  detached: 'house',
  semidetached_house: 'semi',
  terrace: 'terrace',
  apartments: 'flats',
  residential: 'other',
};

if (!existsSync(EXTRACT)) {
  console.error('No OSM extract found. Run `npm run venues` first — it downloads one.');
  process.exit(1);
}
console.log(`Using ${EXTRACT.pathname} (${(statSync(EXTRACT).size / 1048576).toFixed(0)} MB)`);

const sleepFree = (onItem) =>
  pipeline(
    createReadStream(EXTRACT),
    parseOsm(),
    new Writable({
      objectMode: true,
      write(items, _enc, done) {
        for (const item of items) onItem(item);
        done();
      },
    }),
  );

console.log('Pass 1 — finding homes and the positions they need…');
/** Each building: its kind, storeys, and the node id that will locate it. */
const homes = [];
const neededNodes = new Map();

await sleepFree((item) => {
  const tags = item.tags;
  if (!tags?.building) return;
  const kind = HOME_TYPES[tags.building];
  if (!kind) return;

  const levels = Number.parseInt(tags['building:levels'], 10);
  const storeys = Number.isFinite(levels) && levels > 0 && levels < 100 ? levels : null;

  if (item.type === 'node') {
    homes.push({ kind, storeys, lat: item.lat, lng: item.lon });
  } else if (item.type === 'way' && item.refs?.length) {
    const ref = item.refs[0];
    homes.push({ kind, storeys, ref });
    neededNodes.set(ref, null);
  }
});
console.log(`  ${homes.length.toLocaleString()} homes, needing ${neededNodes.size.toLocaleString()} positions`);

console.log('Pass 2 — reading those positions…');
await sleepFree((item) => {
  if (item.type !== 'node') return;
  if (!neededNodes.has(item.id)) return;
  neededNodes.set(item.id, [item.lat, item.lon]);
});

const located = [];
for (const home of homes) {
  if (home.lat != null) {
    located.push(home);
    continue;
  }
  const at = neededNodes.get(home.ref);
  if (at) located.push({ kind: home.kind, storeys: home.storeys, lat: at[0], lng: at[1] });
}
console.log(`  located ${located.length.toLocaleString()} of ${homes.length.toLocaleString()}\n`);

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

const areas = {};
let empty = 0;
for (const station of appStations) {
  const near = located.filter((h) => distanceKm(station, h) <= RADIUS_KM);
  if (near.length === 0) {
    empty += 1;
    continue;
  }
  const counts = { house: 0, semi: 0, terrace: 0, flats: 0, other: 0 };
  const storeys = [];
  let tall = 0;
  for (const h of near) {
    counts[h.kind] += 1;
    if (h.storeys !== null) {
      storeys.push(h.storeys);
      if (h.storeys >= 6) tall += 1;
    }
  }
  const total = near.length;
  areas[station.name] = {
    homes: total,
    counts,
    shares: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, round(v / total)])),
    /** Mean storeys, from the ~18% that carry a height. */
    meanStoreys: storeys.length ? round(storeys.reduce((s, v) => s + v, 0) / storeys.length) : null,
    /** Share of measured buildings six storeys or more — the tower signal. */
    tallShare: storeys.length ? round(tall / storeys.length) : null,
    storeysSampled: storeys.length,
  };
}

const out = {
  source: 'OpenStreetMap building tags, London extract via BBBike',
  url: 'https://download.bbbike.org/osm/bbbike/London/London.osm.pbf',
  licence: '© OpenStreetMap contributors, ODbL — attribution required',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Residential buildings within ${RADIUS_KM.toFixed(2)}km of each area, positioned by their first node.`,
  caveats: [
    'Construction age is NOT here: only 0.1% of London buildings tag start_date. Victorian versus postwar needs the EPC register.',
    'Storey counts come from the ~18% of buildings that record them, so meanStoreys is a sample, not a census.',
    'OSM building types are contributed and uneven; "residential" with no further detail is counted as other.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

// Written minified, not pretty-printed. Indentation was 31% of the bundled
// data — 622KB the app downloads and never reads. The cost is that git diffs
// on these files become one unreadable line, which is acceptable because they
// are generated wholesale and never edited by hand.
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${Object.keys(areas).length} areas to assets/data/area-homes.json`);
if (empty) console.log(`${empty} areas had no residential building within range`);
