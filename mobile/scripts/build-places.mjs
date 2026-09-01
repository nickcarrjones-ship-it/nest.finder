/**
 * Where London writes its own place names, from OpenStreetMap.
 *
 *   node scripts/build-places.mjs
 *
 * The basemap draws "Tooting" and "Clapham" from OSM place= NODES — single
 * points with a name — which OpenMapTiles turns into the labels on Positron.
 * Extracting the same nodes from the same extract the parks and venues
 * builds already read means our markers can sit exactly where the map says
 * the place is, rather than on whichever station happens to share the name.
 *
 * IT IS NOT A COSMETIC FILE. It fixes a real anchoring bug: our datasets are
 * keyed by STATION, so "Wandsworth" was resolving by string match to
 * Wandsworth Road — a station in Lambeth, 4.07km from Wandsworth, across a
 * borough boundary. Every suggestion built from that anchor was measuring
 * the wrong neighbourhood (found 2026-09-01). With a label to aim at, the
 * question becomes "which station is nearest where London says Wandsworth
 * is", which is answerable and right.
 *
 * CLASSES ARE DELIBERATELY LIMITED. place=locality (457 of them) is mostly
 * field names, farms and minor spots that would hijack a real place name;
 * hamlet, farm, isolated_dwelling and plot likewise. Only the classes
 * OpenMapTiles renders as settlement labels are kept.
 */
import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const parseOsm = require('osm-pbf-parser');
const stations = require('../assets/data/stations.json');

const PBF = new URL('../data/london.osm.pbf', import.meta.url).pathname;
const OUT = new URL('../assets/data/area-places.json', import.meta.url).pathname;

/**
 * Ranked most prominent first. Where one name appears at two classes —
 * Hampstead is tagged both town and suburb — the more prominent wins,
 * which is also the one the basemap labels at lower zoom.
 */
const CLASS_RANK = { city: 0, town: 1, suburb: 2, quarter: 3, neighbourhood: 4, village: 5 };

/**
 * A label further than this from every station we hold is dropped.
 *
 * Not a size saving — a correctness one. The extract reaches ~20km past
 * anything we have journey times for, and a label out there would resolve
 * an anchor to whatever station happened to be least far away, which is a
 * confident wrong answer rather than an honest "we don't cover that".
 * 2.5km is a long walk, and comfortably past the worst legitimate case
 * (Muswell Hill to Highgate, 1.52km).
 */
const MAX_STATION_KM = 2.5;

function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function nearestStationKm(point) {
  let best = Infinity;
  for (const s of stations) {
    const d = km(point, s);
    if (d < best) best = d;
  }
  return best;
}

if (!existsSync(PBF)) {
  console.error(`Missing ${PBF}\nDownload: https://download.bbbike.org/osm/bbbike/London/London.osm.pbf`);
  process.exit(1);
}

const found = new Map(); // name -> {cls, lat, lng, dupes}

await pipeline(
  createReadStream(PBF),
  parseOsm(),
  new Writable({
    objectMode: true,
    write(items, _enc, cb) {
      for (const item of items) {
        if (item.type !== 'node') continue;
        const tags = item.tags || {};
        const cls = tags.place;
        const name = tags.name;
        if (!name || !(cls in CLASS_RANK)) continue;

        const existing = found.get(name);
        if (!existing) {
          found.set(name, { cls, lat: item.lat, lng: item.lon, dupes: 0 });
        } else if (CLASS_RANK[cls] < CLASS_RANK[existing.cls]) {
          found.set(name, { cls, lat: item.lat, lng: item.lon, dupes: existing.dupes });
        } else if (CLASS_RANK[cls] === CLASS_RANK[existing.cls]) {
          // Two places, same name, same standing. Nothing here can tell them
          // apart, so the count is kept and the name is dropped below rather
          // than silently resolving to whichever the parser reached first.
          existing.dupes += 1;
        }
      }
      cb();
    },
  }),
);

const out = {};
let dropped = 0;
let outOfReach = 0;
for (const [name, p] of found) {
  if (p.dupes > 0) { dropped += 1; continue; }
  if (nearestStationKm(p) > MAX_STATION_KM) { outOfReach += 1; continue; }
  out[name] = { lat: Number(p.lat.toFixed(5)), lng: Number(p.lng.toFixed(5)), cls: p.cls };
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
writeFileSync(OUT, JSON.stringify(sorted));

const byClass = {};
for (const p of Object.values(sorted)) byClass[p.cls] = (byClass[p.cls] || 0) + 1;
console.log(`${Object.keys(sorted).length} place labels ->`, byClass);
console.log(`${dropped} dropped as genuinely ambiguous (same name, same class, two places)`);
console.log(`${outOfReach} dropped as further than ${MAX_STATION_KM}km from any station we hold`);
