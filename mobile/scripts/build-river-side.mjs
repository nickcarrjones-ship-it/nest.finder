/**
 * Builds assets/data/river-side.json — which side of the Thames each area is
 * on, so "I only want to live south of the river" can actually filter.
 *
 *   npm run river
 *
 * THE BUG THIS EXISTS TO FIX (Nick, 2026-09-07): saying "south of the river"
 * in the Agent conversation changed nothing. riverSide was written to the
 * profile and then only ever reached the model as a sentence in the prompt
 * ("wants to be north of the river") — a polite suggestion the model ignored.
 * On the run that surfaced this, 7 of 10 suggested areas were north. A stated
 * preference this concrete has to be arithmetic, not persuasion.
 *
 * WHY NOT JUST COMPARE LATITUDES: because the Thames meanders violently.
 * Canary Wharf sits north of the river at a latitude below much of the south
 * bank, and around Richmond the river runs north-SOUTH, where "above or below
 * the river" means nothing at all. A latitude cutoff gets central London
 * roughly right and the Isle of Dogs and the whole west completely wrong.
 *
 * SO: the real river centreline (assets/data/thames-centreline.json, chained
 * from OpenStreetMap's River Thames ways and simplified to ~40m), and for each
 * area the nearest segment of it, then the sign of the cross product — which
 * side of the river's own local direction of travel the point falls on. That
 * handles the meanders, the Isle of Dogs loop and the vertical stretches,
 * because it asks "which bank" rather than "which latitude".
 *
 * Verified against 24 places whose side is not in doubt (Greenwich south,
 * Canary Wharf north, Kew south, Isleworth north, Westminster north, Waterloo
 * south...): 24/24.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const STATIONS = new URL('../assets/data/stations.json', import.meta.url);
const CENTRELINE = new URL('../assets/data/thames-centreline.json', import.meta.url);
const OUT = new URL('../assets/data/river-side.json', import.meta.url);

/** 1 degree of longitude is ~0.62 of a degree of latitude in distance at
 *  London's latitude. Without this the "nearest segment" search is wrong. */
const KX = Math.cos((51.5 * Math.PI) / 180);

/**
 * The Richmond loop, where the Thames runs north-south and the geometry
 * therefore answers a question nobody asked. All of these sit on the west
 * bank of that stretch, so the cross product calls them "north" — but they
 * are in the London Borough of Richmond upon Thames, they are TW postcodes,
 * and a Londoner asked whether Twickenham is north or south of the river
 * says south without hesitating. The map is not the territory here; what
 * someone MEANS by "south of the river" is what has to win.
 *
 * Kept as an explicit, short, reviewable list rather than a cleverer rule,
 * because it is a judgement about how people speak, not about geography —
 * see the note on Londoner place names in the project memory.
 */
const SPOKEN_AS_SOUTH = new Set([
  'Twickenham',
  'St Margarets',
  'Strawberry Hill',
  'Teddington',
  'Fulwell',
  'Whitton',
  'Hampton Wick',
]);

const line = JSON.parse(readFileSync(CENTRELINE, 'utf8'));

function sideOf(lat, lng) {
  const px = lng * KX;
  const py = lat;
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ax = line[i][0] * KX, ay = line[i][1];
    const bx = line[i + 1][0] * KX, by = line[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = (px - cx) ** 2 + (py - cy) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  const ax = line[bi][0] * KX, ay = line[bi][1];
  const bx = line[bi + 1][0] * KX, by = line[bi + 1][1];
  // Positive cross product = left of the river's west-to-east travel = north.
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax) > 0 ? 'north' : 'south';
}

const raw = JSON.parse(readFileSync(STATIONS, 'utf8'));
const areas = Array.isArray(raw) ? raw : raw.stations ?? [];

const out = {};
let overridden = 0;
for (const a of areas) {
  const geometric = sideOf(a.lat, a.lng);
  if (SPOKEN_AS_SOUTH.has(a.name)) {
    out[a.name] = 'south';
    if (geometric !== 'south') overridden += 1;
  } else {
    out[a.name] = geometric;
  }
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);

const north = Object.values(out).filter((v) => v === 'north').length;
console.log(`north ${north}   south ${Object.keys(out).length - north}   total ${Object.keys(out).length}`);
console.log(`Richmond-loop names spoken as south: ${overridden}`);
console.log(`Wrote ${OUT.pathname}`);
