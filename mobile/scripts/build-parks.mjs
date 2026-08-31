/**
 * Green space per area, from OpenStreetMap.
 *
 *   node scripts/build-parks.mjs
 *
 * Answers the thing the engine was completely blind to: someone whose first
 * words are "the commons for sunbathing and running" got matched entirely on
 * cafés, because none of the 32 dimensions knew a park existed (found in
 * Nick's own profile, 2026-08-31).
 *
 * TWO SIGNALS, NOT ONE (Nick's call, same day). They separate different
 * things and a single number blurs them:
 *
 *   majorParkHa  — the biggest park within reach. Clapham Common is 77.8ha
 *                  and you plan a Saturday around it.
 *   greenSpaceHa — everything within reach, added up. Kensington has a lot
 *                  of green in small pieces; that is a real amenity too,
 *                  just a different one.
 *
 * MINIMUM 10 HECTARES (Nick, 2026-08-31). OSM tags a pocket garden and
 * Hyde Park identically as leisure=park: of 4,109 spaces in London, 1,973
 * are under half a hectare. 10ha is set from the smallest place Nick named
 * as a real park — Highbury Fields, 11.7ha — so the line sits just under
 * the examples it has to keep, rather than at a round number nobody chose.
 *
 * RELATIONS MATTER MORE THAN WAYS HERE, which is the trap in this dataset.
 * A naive leisure=park way query misses Clapham Common, Wandsworth Common,
 * Tooting Bec, Brockwell, Hampstead Heath, Peckham Rye, Burgess Park and
 * Highbury Fields — every one is a multipolygon relation, because real
 * parks have ponds and buildings punched out of them. The parks that matter
 * most are exactly the ones the easy query drops.
 */
import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const parseOsm = require('osm-pbf-parser');
const stations = require('../assets/data/stations.json');

const PBF = new URL('../data/london.osm.pbf', import.meta.url).pathname;
const OUT = new URL('../assets/data/area-parks.json', import.meta.url).pathname;

/** Below this, it is a garden square, not somewhere you go for a run. */
const MIN_HECTARES = 10;
/** A park this size anchors a weekend rather than a lunch break. */
const MAJOR_HECTARES = 20;
/** How far someone will walk to a park. Generous on purpose — people walk
 *  further for a Saturday in the park than for a pint. */
const RADIUS_KM = 1.2;

const WANTED = new Set(['park', 'common']);

if (!existsSync(PBF)) {
  console.error(`Missing ${PBF}\nDownload: https://download.bbbike.org/osm/bbbike/London/London.osm.pbf`);
  process.exit(1);
}

async function sweep(onItem) {
  await pipeline(
    createReadStream(PBF),
    parseOsm(),
    new Writable({
      objectMode: true,
      write(items, _enc, cb) {
        for (const item of items) onItem(item);
        cb();
      },
    }),
  );
}

// ── Pass 1: which ways and relations are green space ────────────────
const taggedWays = new Map(); // wayId -> {name, kind}
const relations = [];         // {name, kind, outer: wayId[]}
const wantWays = new Set();

await sweep((item) => {
  const tags = item.tags || {};
  if (!WANTED.has(tags.leisure)) return;
  const name = tags.name || '(unnamed)';
  if (item.type === 'way') {
    taggedWays.set(item.id, { name, kind: tags.leisure });
    wantWays.add(item.id);
  } else if (item.type === 'relation' && Array.isArray(item.members)) {
    // Only the OUTER rings bound the park; inner ones are the holes.
    const outer = item.members
      .filter((m) => m.type === 'way' && (m.role === 'outer' || !m.role))
      .map((m) => m.id);
    if (outer.length) {
      relations.push({ name, kind: tags.leisure, outer });
      for (const id of outer) wantWays.add(id);
    }
  }
});
console.error(`parks: ${taggedWays.size} ways, ${relations.length} relations`);

// ── Pass 2: the geometry of every way we need ───────────────────────
const wayRefs = new Map();
await sweep((item) => {
  if (item.type === 'way' && wantWays.has(item.id) && item.refs) wayRefs.set(item.id, item.refs);
});

// ── Pass 3: positions for the nodes those ways are made of ──────────
const needNodes = new Set();
for (const refs of wayRefs.values()) for (const r of refs) needNodes.add(r);
const coords = new Map();
await sweep((item) => {
  if (item.type === 'node' && needNodes.has(item.id)) coords.set(item.id, [item.lon, item.lat]);
});
console.error(`geometry: ${wayRefs.size} ways, ${coords.size} nodes`);

// ── Areas and centres ───────────────────────────────────────────────
const R = 6371000;
const D = Math.PI / 180;

/** Shoelace on locally-projected metres. Equirectangular is accurate well
 *  past the size of any London park. */
function measure(refs) {
  const pts = refs.map((r) => coords.get(r)).filter(Boolean);
  if (pts.length < 3) return null;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.cos(lat0 * D);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] * D * R * k) * (pts[i][1] * D * R) - (pts[i][0] * D * R * k) * (pts[j][1] * D * R);
    cx += pts[i][0];
    cy += pts[i][1];
  }
  return { ha: Math.abs(a / 2) / 10000, lng: cx / pts.length, lat: cy / pts.length };
}

const parks = [];
for (const [id, meta] of taggedWays) {
  const m = measure(wayRefs.get(id) || []);
  if (m && m.ha >= MIN_HECTARES) parks.push({ ...meta, ...m });
}
for (const rel of relations) {
  let ha = 0;
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const id of rel.outer) {
    const m = measure(wayRefs.get(id) || []);
    if (!m) continue;
    ha += m.ha;
    lat += m.lat;
    lng += m.lng;
    n++;
  }
  if (n && ha >= MIN_HECTARES) parks.push({ name: rel.name, kind: rel.kind, ha, lat: lat / n, lng: lng / n });
}
console.error(`kept ${parks.length} green spaces of ${MIN_HECTARES}ha or more`);

// ── Per station ─────────────────────────────────────────────────────
function km(a, b) {
  const dLat = (b.lat - a.lat) * D;
  const dLng = (b.lng - a.lng) * D * Math.cos(((a.lat + b.lat) / 2) * D);
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371;
}

const areas = {};
for (const st of stations) {
  const near = parks.filter((p) => km(st, p) <= RADIUS_KM);
  const biggest = near.reduce((best, p) => (!best || p.ha > best.ha ? p : best), null);
  areas[st.name] = {
    greenSpaceHa: +near.reduce((s, p) => s + p.ha, 0).toFixed(1),
    majorParkHa: biggest ? +biggest.ha.toFixed(1) : 0,
    parkCount: near.length,
    // Named so a suggestion can say WHICH park, rather than asserting
    // "good for green space" and leaving someone to take it on trust.
    nearest: near
      .filter((p) => p.name !== '(unnamed)')
      .sort((a, b) => b.ha - a.ha)
      .slice(0, 3)
      .map((p) => ({ name: p.name, ha: +p.ha.toFixed(1) })),
  };
}

const withMajor = Object.values(areas).filter((a) => a.majorParkHa >= MAJOR_HECTARES).length;
writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: 'OpenStreetMap',
      url: 'https://download.bbbike.org/osm/bbbike/London/London.osm.pbf',
      licence: 'Open Database Licence (ODbL) — attribution required',
      fetched: new Date().toISOString().slice(0, 10),
      method:
        `leisure=park and leisure=common, ways and multipolygon relations, area by shoelace. ` +
        `Kept at ${MIN_HECTARES}ha or larger, then summed within ${RADIUS_KM}km of each station.`,
      caveats: [
        `Below ${MIN_HECTARES}ha is excluded: half of London's 4,109 tagged spaces are under 0.5ha ` +
          `and are garden squares, not parks. The line sits just under Highbury Fields (11.7ha), ` +
          `the smallest space Nick named as a real park.`,
        'Relations carry most of the important parks — Clapham Common, Hampstead Heath, Wandsworth ' +
          'Common and Brockwell are all multipolygons. A way-only query silently loses them.',
        'A park straddling the radius boundary counts in full for every station within 1.2km, so ' +
          'greenSpaceHa is "green space reachable from here", not an exclusive allocation.',
        'OSM completeness varies. An absent park means nobody mapped it, not that it does not exist.',
      ],
      coverage: {
        stations: stations.length,
        parksKept: parks.length,
        stationsWithAMajorPark: withMajor,
        majorThresholdHa: MAJOR_HECTARES,
      },
      areas,
    },
    null,
    1,
  ),
);
console.error(`wrote ${OUT} — ${withMajor}/${stations.length} stations have a ${MAJOR_HECTARES}ha+ park within ${RADIUS_KM}km`);
