/**
 * Builds assets/data/area-people.json — who actually lives in each area.
 *
 *   npm run people
 *
 * This exists because of a mistake. Asked why Chiswick Park matched Clapham
 * Common, I said they had "the same mix of young professionals and families"
 * — a claim no data in this app supported. Nick rejected it on local
 * knowledge and was right (2026-08-27). The engine had NOTHING about who
 * lives anywhere, yet "young and renting" versus "settled and family" is one
 * of the first things anybody means when they say an area feels a certain
 * way.
 *
 * Sources, both free and official:
 *  - Census 2021 age and tenure by LSOA, via the NOMIS API (ONS).
 *  - LSOA population-weighted centroids, via the ONS Open Geography Portal.
 *
 * An LSOA holds about 1,500 people, so a mile around a station covers
 * several. Each area's figures are the population-weighted average of every
 * LSOA whose centre falls within the radius — weighting by population
 * matters, since a sparse LSOA and a dense one should not count equally.
 *
 * CARE REQUIRED, and this is not boilerplate: age and tenure describe a
 * place, but they also proxy for class and race. They are here to explain
 * character — "mostly young renters" versus "families who own" — and must
 * never be used to rank an area as better, nor surfaced raw in the UI. See
 * the demographic warning in docs/learning-loop.md.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json');

const OUT = new URL('../assets/data/area-people.json', import.meta.url);
/** Miles, matching build-food.mjs so the two signals describe the same patch. */
const RADIUS_KM = 1.60934;
/** NOMIS code for the London region; TYPE151 is 2021 LSOA. */
const LONDON_LSOAS = '2013265927TYPE151';
const AGE_DATASET = 'NM_2020_1'; // TS007A — age by five-year bands
const TENURE_DATASET = 'NM_2072_1'; // TS054 — tenure

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        await sleep(4000 * (i + 1));
        continue;
      }
      if (res.status !== 200) return null;
      return await res.text();
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  throw new Error(`no answer after ${attempts} attempts: ${url}`);
}

/** A real CSV parse — NOMIS category names contain commas and quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** NOMIS caps a response, so pull in pages until it stops giving more. */
async function nomis(dataset, categoryField) {
  const PAGE = 25000;
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `https://www.nomisweb.co.uk/api/v01/dataset/${dataset}.data.csv` +
      `?geography=${LONDON_LSOAS}&measures=20100` +
      `&select=GEOGRAPHY_CODE,${categoryField}_NAME,OBS_VALUE` +
      `&RecordLimit=${PAGE}&RecordOffset=${offset}`;
    const text = await getText(url);
    const rows = text ? parseCsv(text) : [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    await sleep(400);
  }
  return out;
}

/** Every London LSOA's population-weighted centre. */
async function lsoaCentroids() {
  const base =
    'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/' +
    'LSOA_PopCentroids_EW_2021_V4/FeatureServer/0/query' +
    '?where=1%3D1&outFields=LSOA21CD&outSR=4326&f=json&returnGeometry=true' +
    '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects' +
    '&geometry=-0.55,51.25,0.35,51.72';
  const out = new Map();
  for (let offset = 0; ; offset += 2000) {
    const text = await getText(`${base}&resultOffset=${offset}&resultRecordCount=2000`);
    const body = text ? JSON.parse(text) : null;
    const features = body?.features ?? [];
    for (const f of features) {
      out.set(f.attributes.LSOA21CD, { lat: f.geometry.y, lng: f.geometry.x });
    }
    if (!body?.exceededTransferLimit) break;
    await sleep(300);
  }
  return out;
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

console.log('Fetching LSOA centroids from the ONS Open Geography Portal…');
const centroids = await lsoaCentroids();
console.log(`  ${centroids.size} LSOA centres in the London bounding box`);

console.log('Fetching Census 2021 age by LSOA (NOMIS)…');
const ageRows = await nomis(AGE_DATASET, 'C2021_AGE_19');
console.log(`  ${ageRows.length} rows`);

console.log('Fetching Census 2021 tenure by LSOA (NOMIS)…');
const tenureRows = await nomis(TENURE_DATASET, 'C2021_TENURE_9');
console.log(`  ${tenureRows.length} rows`);

/** Sums the bands whose label matches, per LSOA. */
function collect(rows, field, match) {
  const out = new Map();
  for (const r of rows) {
    const code = r.GEOGRAPHY_CODE;
    const name = r[field];
    const value = Number(r.OBS_VALUE);
    if (!code || !name || Number.isNaN(value)) continue;
    if (!match(name)) continue;
    out.set(code, (out.get(code) ?? 0) + value);
  }
  return out;
}

const AGE_FIELD = 'C2021_AGE_19_NAME';
const TENURE_FIELD = 'C2021_TENURE_9_NAME';

// "Total" is a band in its own right — never sum it with the others.
const isTotal = (n) => /^total$/i.test(n.trim());
const ageOf = (n) => {
  const m = n.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

const population = collect(ageRows, AGE_FIELD, isTotal);
const aged20to34 = collect(ageRows, AGE_FIELD, (n) => {
  if (isTotal(n)) return false;
  const a = ageOf(n);
  return a !== null && a >= 20 && a < 35;
});
const children = collect(ageRows, AGE_FIELD, (n) => {
  if (isTotal(n)) return false;
  const a = ageOf(n);
  return a !== null && a < 15;
});
const over65 = collect(ageRows, AGE_FIELD, (n) => {
  if (isTotal(n)) return false;
  const a = ageOf(n);
  return a !== null && a >= 65;
});

/**
 * Tenure nests: "Private rented" is a parent of "Private rented: Private
 * landlord or letting agency", and there are combined rows like "Private
 * rented or lives rent free" on top. A regex match on "private rent" counts
 * the same household three times, which is how the first run produced
 * nonsense. Exact equality on the top-level labels only.
 *
 * The total is "Total: All households", not "Total" — the age table's
 * spelling. Getting that wrong silently zeroed every tenure share.
 */
const exactly = (label) => (n) => n.trim() === label;
const households = collect(tenureRows, TENURE_FIELD, exactly('Total: All households'));
const privateRent = collect(tenureRows, TENURE_FIELD, exactly('Private rented'));
const socialRent = collect(tenureRows, TENURE_FIELD, exactly('Social rented'));
const owned = collect(tenureRows, TENURE_FIELD, exactly('Owned'));

// Report what the labels actually were, so a silent vocabulary change in a
// future Census release shows up as an obvious zero rather than a plausible
// number nobody questions.
for (const [label, map] of [
  ['Total: All households', households],
  ['Owned', owned],
  ['Social rented', socialRent],
  ['Private rented', privateRent],
]) {
  if (map.size === 0) {
    console.log(`  WARNING: tenure category "${label}" matched nothing — has the Census vocabulary changed?`);
  }
}

const areas = {};
let noCoverage = 0;
for (const station of appStations) {
  const near = [];
  for (const [code, c] of centroids) {
    if (distanceKm(station, c) <= RADIUS_KM) near.push(code);
  }
  const pop = near.reduce((s, c) => s + (population.get(c) ?? 0), 0);
  const hh = near.reduce((s, c) => s + (households.get(c) ?? 0), 0);
  if (pop === 0) {
    noCoverage += 1;
    continue;
  }
  const shareOf = (map) => round(near.reduce((s, c) => s + (map.get(c) ?? 0), 0) / pop);
  const hhShareOf = (map) => (hh ? round(near.reduce((s, c) => s + (map.get(c) ?? 0), 0) / hh) : null);
  areas[station.name] = {
    lsoas: near.length,
    population: pop,
    households: hh,
    share20to34: shareOf(aged20to34),
    shareUnder15: shareOf(children),
    share65plus: shareOf(over65),
    sharePrivateRent: hhShareOf(privateRent),
    shareSocialRent: hhShareOf(socialRent),
    shareOwned: hhShareOf(owned),
  };
}

const out = {
  source: 'ONS Census 2021 (age TS007A, tenure TS054) via NOMIS; LSOA population-weighted centroids via ONS Open Geography Portal',
  url: 'https://www.nomisweb.co.uk/api/v01/',
  licence: 'Open Government Licence v3.0',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Population-weighted average of every 2021 LSOA whose centre lies within ${RADIUS_KM.toFixed(2)}km of the area.`,
  caveats: [
    'Census 2021 was taken during a pandemic; central and student areas may be unrepresentative.',
    'Age and tenure explain character. They must never rank an area as better, nor appear raw in the UI.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

// Written minified, not pretty-printed. Indentation was 31% of the bundled
// data — 622KB the app downloads and never reads. The cost is that git diffs
// on these files become one unreadable line, which is acceptable because they
// are generated wholesale and never edited by hand.
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`\nWrote ${Object.keys(areas).length} areas to assets/data/area-people.json`);
if (noCoverage) console.log(`${noCoverage} areas had no LSOA within range (outside the London box)`);
