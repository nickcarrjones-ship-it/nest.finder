/**
 * Builds assets/data/area-circle-counts.json — how many people and homes sit
 * inside each area's one-mile circle, counting BOTH sides of the London
 * boundary.
 *
 *   node scripts/build-circle-counts.mjs
 *
 * Exists because crime rates need a denominator that covers the whole
 * circle police.uk counts crimes in. area-people.json only holds London
 * LSOAs (it describes London character, and is deliberately left alone
 * because the similarity engine reads it), so a border station like
 * Banstead — its circle mostly in Surrey — counted 590 households and came
 * out with the worst burglary rate in London (found 2026-09-29).
 *
 * Sources, free and official: Census 2021 households (TS054 total) and
 * usual residents (TS007A total) by LSOA via NOMIS, for London, the East
 * and the South East; LSOA population-weighted centroids from the ONS Open
 * Geography Portal. Same radius as build-people.mjs and build-crime.mjs.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stations = require('../assets/data/stations.json');
const OUT = new URL('../assets/data/area-circle-counts.json', import.meta.url);

const RADIUS_KM = 1.60934;
/** NOMIS regions: London, East, South East. TYPE151 = 2021 LSOA. */
const REGIONS = ['2013265927', '2013265926', '2013265928'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) { await sleep(4000 * (i + 1)); continue; }
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(3000 * (i + 1));
    }
  }
  throw new Error(`no answer: ${url}`);
}

/** LSOA code -> total, for one dataset's "total" category. */
async function totals(dataset, filter) {
  const out = new Map();
  for (const region of REGIONS) {
    for (let offset = 0; ; offset += 25000) {
      const url =
        `https://www.nomisweb.co.uk/api/v01/dataset/${dataset}.data.csv` +
        `?geography=${region}TYPE151&measures=20100&${filter}` +
        `&select=GEOGRAPHY_CODE,OBS_VALUE&RecordLimit=25000&RecordOffset=${offset}`;
      const lines = (await getText(url)).trim().split('\n').slice(1);
      for (const line of lines) {
        const [code, value] = line.replace(/"/g, '').split(',');
        if (code) out.set(code, Number(value));
      }
      if (lines.length < 25000) break;
      await sleep(400);
    }
  }
  return out;
}

async function centroids() {
  const base =
    'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/' +
    'LSOA_PopCentroids_EW_2021_V4/FeatureServer/0/query' +
    '?where=1%3D1&outFields=LSOA21CD&outSR=4326&f=json&returnGeometry=true' +
    '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects' +
    '&geometry=-0.55,51.25,0.35,51.72';
  const out = new Map();
  for (let offset = 0; ; offset += 2000) {
    const body = JSON.parse(await getText(`${base}&resultOffset=${offset}&resultRecordCount=2000`));
    for (const f of body.features ?? []) out.set(f.attributes.LSOA21CD, { lat: f.geometry.y, lng: f.geometry.x });
    if (!body.exceededTransferLimit) break;
    await sleep(300);
  }
  return out;
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const cents = await centroids();
console.log(`${cents.size} LSOA centres`);
const households = await totals('NM_2072_1', 'c2021_tenure_9=0');
const population = await totals('NM_2020_1', 'c2021_age_19=0');
console.log(`${households.size} LSOAs with households, ${population.size} with population`);

const areas = {};
let missingCounts = 0;
for (const s of stations) {
  let hh = 0; let pop = 0; let n = 0;
  for (const [code, c] of cents) {
    if (distanceKm(s, c) > RADIUS_KM) continue;
    // An LSOA inside the circle but outside the three regions would be
    // silently uncounted — say so rather than undercount quietly.
    if (!households.has(code) || !population.has(code)) { missingCounts++; continue; }
    hh += households.get(code); pop += population.get(code); n++;
  }
  if (n > 0) areas[s.name] = { lsoas: n, households: hh, population: pop };
}

writeFileSync(OUT, JSON.stringify({
  source: 'ONS Census 2021 households (TS054) and usual residents (TS007A) by LSOA via NOMIS, London + East + South East; ONS LSOA population-weighted centroids',
  licence: 'Open Government Licence v3.0',
  fetched: new Date().toISOString().slice(0, 10),
  method: 'Sum over every 2021 LSOA whose population-weighted centre lies within 1.61km of the station, either side of the London boundary.',
  coverage: { areasWithData: Object.keys(areas).length, appAreas: stations.length, lsoasSkippedNoCounts: missingCounts },
  areas,
}));
console.log(`wrote ${Object.keys(areas).length} areas; ${missingCounts} in-circle LSOAs had no counts`);
