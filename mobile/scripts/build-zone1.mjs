/**
 * Regenerates assets/data/zone1-stations.json from the TfL Unified API.
 *
 *   npm run zones
 *
 * Why this exists: the Zone 1 list was first assembled by hand, from memory,
 * because the repo had no complete zone data. That list missed six genuine
 * Zone 1 stations — Tottenham Court Road and Notting Hill Gate among them —
 * which would have silently left central areas in the results for someone
 * who had explicitly ruled Zone 1 out. TfL publishes the real answer for
 * free and without a key, so there is no reason to guess.
 *
 * Zones come from each stop's "Zone" additionalProperty. Boundary stations
 * are listed as "1+2" and DO count as Zone 1. Names are normalised because
 * TfL uses full formal names ("Aldgate Underground Station") where the app
 * uses short ones ("Aldgate").
 *
 * The API is paginated at 1000 stops per page and national-rail alone is
 * ~6900, so this makes a couple of dozen requests and takes a minute or two.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json').map((s) => s.name);

const MODES = ['tube', 'dlr', 'overground', 'elizabeth-line', 'tram', 'national-rail'];

function normalise(name) {
  return name
    .toLowerCase()
    .replace(/^london /, '')
    .replace(/ \((bakerloo|circle line|district|central|h&c line|hammersmith|for excel|london)\)/g, '')
    .replace(/ (underground|rail|dlr|tram|overground|bus|coach) station.*$/, '')
    .replace(/ station$/, '')
    .replace(/[.'’]/g, '')
    .replace(/ & /g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchMode(mode) {
  const zones = new Map();
  let page = 1;
  for (;;) {
    const res = await fetch(`https://api.tfl.gov.uk/StopPoint/Mode/${mode}?page=${page}`);
    if (!res.ok) throw new Error(`TfL ${mode} page ${page}: HTTP ${res.status}`);
    const body = await res.json();
    const stops = body.stopPoints ?? [];
    for (const stop of stops) {
      const zone = (stop.additionalProperties ?? []).find((p) => p.key === 'Zone')?.value;
      if (!zone) continue;
      const key = normalise(stop.commonName ?? '');
      if (!key) continue;
      const parts = String(zone).split('+').map((z) => z.trim());
      zones.set(key, [...new Set([...(zones.get(key) ?? []), ...parts])]);
    }
    if (stops.length === 0 || page * (body.pageSize ?? 1000) >= (body.total ?? 0)) break;
    page += 1;
  }
  console.log(`  ${mode}: ${zones.size} named stops with a zone`);
  return zones;
}

const zoneByName = new Map();
console.log('Fetching zones from the TfL Unified API…');
for (const mode of MODES) {
  for (const [name, zones] of await fetchMode(mode)) {
    zoneByName.set(name, [...new Set([...(zoneByName.get(name) ?? []), ...zones])]);
  }
}

const stations = appStations.filter((n) => (zoneByName.get(normalise(n)) ?? []).includes('1')).sort();
const unmatchedStations = appStations.filter((n) => !zoneByName.has(normalise(n)));

writeFileSync(
  new URL('../assets/data/zone1-stations.json', import.meta.url),
  JSON.stringify(
    {
      _readme:
        'London Zone 1 station areas, keyed to the names in stations.json. Used by lib/ranking/zones.ts: when someone answers no to "would you live in Zone 1?", neighbourhoods containing any of these stations are dropped before ranking. Generated from the TfL Unified API — regenerate with `npm run zones`. Boundary stations TfL lists as "1+2" ARE included, because they are in Zone 1. Any app station TfL did not match is treated as not-Zone-1; those are listed below so the assumption can be checked.',
      source: 'TfL Unified API (api.tfl.gov.uk/StopPoint/Mode/…)',
      generated: new Date().toISOString().slice(0, 10),
      matchedStations: appStations.length - unmatchedStations.length,
      totalStations: appStations.length,
      unmatchedStations,
      stations,
    },
    null,
    2,
  ) + '\n',
);

console.log(`\nZone 1 stations: ${stations.length}`);
console.log(`Matched ${appStations.length - unmatchedStations.length} of ${appStations.length} app stations`);
if (unmatchedStations.length) console.log(`Unmatched (treated as not Zone 1): ${unmatchedStations.join(', ')}`);
