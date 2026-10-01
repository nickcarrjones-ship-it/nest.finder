/**
 * Builds assets/data/area-named-places.json — the actual, NAMED places around
 * each station, for Ask Maloca's friend-style answers (Nick, 2026-10-01).
 *
 *   node scripts/build-named-places.mjs data/london-2026-09-26.osm.pbf
 *
 * Why: a friend says "Tooting Broadway's got the market, loads of pubs and an
 * M&S", not "284 places to eat". The model may only NAME a business that is
 * in this file — that is what stops it inventing one (see FRIEND_PROMPT).
 *
 * Restaurants are kept apart from takeaways using OpenStreetMap's own
 * tagging: amenity=restaurant versus amenity=fast_food. Chicken shops, kebab
 * shops, Domino's and KFC are mapped as fast_food, so they never appear as
 * restaurants here (Nick: "proper places", not "the local KFC"). Chains are
 * KEPT but flagged — OSM marks a chain branch with a brand tag, which
 * independents do not carry — so the answer can say when a high street is
 * mostly chains (Nick, 2026-10-01).
 *
 * 1km, not the mile the counts use: this is "what's on the high street",
 * a walk from the station, not the whole catchment.
 *
 * Licence: © OpenStreetMap contributors, ODbL — attribution required.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

const require = createRequire(import.meta.url);
const parseOsm = require('osm-pbf-parser');
const stations = require('../assets/data/stations.json');

const extract = process.argv[2];
if (!extract) throw new Error('pass the .osm.pbf path');
const OUT = new URL('../assets/data/area-named-places.json', import.meta.url);
const RADIUS_KM = 1.0;

/** amenity/shop value -> our kind. */
function kindOf(tags) {
  const a = tags.amenity;
  if (a === 'restaurant') return 'restaurant';
  if (a === 'fast_food') return 'fastFood';
  if (a === 'pub') return 'pub';
  if (a === 'bar') return 'bar';
  if (a === 'cafe') return 'cafe';
  if (a === 'marketplace') return 'market';
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.shop === 'department_store') return 'department';
  return null;
}

/**
 * A second filter for takeaways that mappers tagged as restaurants
 * ("Chickeninn", "Tooting Bec Kebab Centre"). Errs on the strict side: a
 * proper restaurant lost here costs less than a chicken shop recommended.
 */
const TAKEAWAY_CUISINE = new Set(['chicken', 'fried_chicken', 'kebab', 'fish_and_chips', 'peri-peri']);
const TAKEAWAY_NAME = /\b(kebab|chicken|fried|peri[ -]?peri|chippy|pizza (?:express )?delivery|takeaway)\b/i;
const looksLikeTakeaway = (p) =>
  p.kind === 'restaurant' && !p.chain && (TAKEAWAY_CUISINE.has(p.cuisine) || TAKEAWAY_NAME.test(p.name));

/** How many of each to keep per area, nearest first. */
const KEEP = { restaurant: 12, pub: 8, bar: 4, cafe: 5, market: 3, supermarket: 4, department: 3 };

async function scan(onItem) {
  await pipeline(
    createReadStream(extract),
    parseOsm(),
    new Writable({
      objectMode: true,
      write(items, _e, done) { for (const i of items) onItem(i); done(); },
    }),
  );
}

console.log('Pass 1: named places');
const places = [];
const pendingWays = new Map();
const needed = new Map();
await scan((item) => {
  const tags = item.tags;
  if (!tags || !tags.name) return;
  const kind = kindOf(tags);
  if (!kind) return;
  // Closed or disused places are sometimes left mapped with a prefix.
  if (tags['disused:amenity'] || tags['was:amenity'] || /\bclosed\b/i.test(tags.name)) return;
  const p = {
    kind,
    name: tags.name.trim(),
    cuisine: (tags.cuisine ?? '').split(';')[0].trim().toLowerCase() || null,
    chain: Boolean(tags.brand || tags['brand:wikidata']),
  };
  if (item.type === 'node') places.push({ ...p, lat: item.lat, lng: item.lon });
  else if (item.type === 'way' && item.refs?.length) {
    pendingWays.set(item.id, { ...p, refs: item.refs });
    for (const r of item.refs) needed.set(r, null);
  }
});
console.log('Pass 2: outline positions');
await scan((item) => {
  if (item.type === 'node' && needed.has(item.id)) needed.set(item.id, [item.lat, item.lon]);
});
for (const w of pendingWays.values()) {
  const pts = w.refs.map((r) => needed.get(r)).filter(Boolean);
  if (!pts.length) continue;
  places.push({
    kind: w.kind, name: w.name, cuisine: w.cuisine, chain: w.chain,
    lat: pts.reduce((s, p) => s + p[0], 0) / pts.length,
    lng: pts.reduce((s, p) => s + p[1], 0) / pts.length,
  });
}
console.log(`${places.length} named places`);

function km(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const areas = {};
for (const s of stations) {
  const near = places
    .map((p) => ({ ...p, d: km(s, p) }))
    .filter((p) => p.d <= RADIUS_KM)
    .map((p) => (looksLikeTakeaway(p) ? { ...p, kind: 'fastFood' } : p))
    .sort((a, b) => a.d - b.d);
  if (!near.length) continue;

  const restaurants = near.filter((p) => p.kind === 'restaurant');
  const chains = restaurants.filter((p) => p.chain);
  const cuisines = {};
  for (const r of restaurants) if (r.cuisine) cuisines[r.cuisine] = (cuisines[r.cuisine] ?? 0) + 1;

  // Compact rows: [name, cuisine|null, chain 0/1, metres]. One entry per name
  // per kind (a chain with two branches nearby is one line).
  const rows = (kind) => {
    const seen = new Set();
    return near
      .filter((p) => p.kind === kind && !seen.has(p.name) && seen.add(p.name))
      .slice(0, KEEP[kind])
      .map((p) => [p.name, p.cuisine, p.chain ? 1 : 0, Math.round(p.d * 1000)]);
  };

  areas[s.name] = {
    stats: {
      restaurants: restaurants.length,
      fastFood: near.filter((p) => p.kind === 'fastFood').length,
      pubs: near.filter((p) => p.kind === 'pub').length,
      chainShare: restaurants.length ? Math.round((chains.length / restaurants.length) * 100) / 100 : 0,
      chainNames: [...new Set(chains.map((c) => c.name))].slice(0, 8),
      cuisines: Object.entries(cuisines).sort((a, b) => b[1] - a[1]).slice(0, 6),
    },
    restaurant: rows('restaurant'),
    pub: rows('pub'),
    bar: rows('bar'),
    cafe: rows('cafe'),
    market: rows('market'),
    supermarket: rows('supermarket'),
    department: rows('department'),
  };
}

writeFileSync(OUT, JSON.stringify({
  source: 'OpenStreetMap London extract (BBBike), 2026-09-26',
  licence: '© OpenStreetMap contributors, ODbL — attribution required',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Named restaurants (not fast_food), pubs, bars, cafés, markets, supermarkets and department stores within ${RADIUS_KM}km of each station, nearest first. chain = OSM brand tag present.`,
  areas,
}));
console.log(`wrote ${Object.keys(areas).length} areas`);
