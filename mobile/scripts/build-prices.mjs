/**
 * Builds assets/data/area-prices.json — what homes actually sold for near
 * each area, from HM Land Registry Price Paid Data.
 *
 *   npm run prices
 *
 * WHY: the app asks for a budget — £150k to £5m, built 2026-09-06 — and
 * then shows areas with no idea what any of them cost. Someone with £500k
 * gets suggested Chelsea. Prices are also the thing that would let a budget
 * FILTER areas rather than just ride along on the Rightmove link.
 *
 * SOURCE AND LICENCE: HM Land Registry Price Paid Data, Open Government
 * Licence v3. The gov.uk guidance states the data is "freely available for
 * commercial and non-commercial reuse" and names "create valuation software
 * and price estimations" among its intended uses, so deriving and shipping
 * these aggregates is squarely within it. Contains HM Land Registry data
 * (c) Crown copyright and database right — that attribution has to appear
 * wherever these numbers are shown.
 *
 * WHAT THIS DATA CANNOT TELL US: bedrooms. Price Paid records the price,
 * the date, the postcode and the property type, and nothing about the
 * inside of the building. So this reports "a flat near Tooting Broadway
 * typically sold for X", never "a two-bed flat" — which is a real gap,
 * because the criteria sheet asks for bedrooms. Closing it needs an EPC
 * join on postcode and is its own piece of work; inventing a bedroom count
 * here would be exactly the unverifiable number this project avoids.
 *
 * THREE DELIBERATE FILTERS, each of which changes the answer:
 *
 *   Category A only. Price Paid marks standard open-market sales as A and
 *   everything else as B — repossessions, transfers between companies,
 *   buy-to-let portfolio moves, sales that were never offered to the
 *   public. B was a fifth of London rows in 2025, and it does not describe
 *   what someone would pay.
 *
 *   Greater London only, which is where our areas are.
 *
 *   A minimum sample per area and type. A median drawn from four sales is
 *   noise wearing a number's clothes, and it would be indistinguishable on
 *   screen from one drawn from four hundred. Below the floor the entry is
 *   simply absent, the same rule the schools data follows for areas with no
 *   rated school.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STATIONS = new URL('../assets/data/stations.json', import.meta.url);
const OUT = new URL('../assets/data/area-prices.json', import.meta.url);

/** Years to include. Three balances "recent enough to be true today"
 *  against "enough sales that a quiet area still gets a number". */
const YEARS = [2023, 2024, 2025];

/** How far a sale can be from a station and still describe it. Matches the
 *  schools radius; beyond this it is describing somewhere else. */
const RADIUS_KM = 1.2;

/**
 * Fewest sales before a median is worth publishing. 30 is a judgement, and
 * the reasoning is that the number has to survive a couple of unusual
 * houses without moving much — not that 30 is statistically magic.
 */
const MIN_SAMPLE = 30;

/**
 * Counties to read, not just Greater London.
 *
 * The first run filtered to GREATER LONDON and lost Epping, Chigwell,
 * Debden, Caterham, Ewell and Elstree — our areas follow the tube and the
 * overground out past the boundary, and someone commuting from Epping is
 * still using this app. The radius check below is what actually decides
 * whether a sale belongs to an area; this list only keeps the file from
 * reading all 954,000 UK rows a year to find them.
 */
const COUNTIES = new Set([
  'GREATER LONDON', 'ESSEX', 'SURREY', 'HERTFORDSHIRE', 'KENT',
  'BUCKINGHAMSHIRE', 'BERKSHIRE', 'MIDDLESEX',
]);

/** Price Paid's single-letter codes, in the words the app uses. */
const TYPE = { D: 'detached', S: 'semi', T: 'terraced', F: 'flat' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function splitCsv(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
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

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// ── read the sales ──────────────────────────────────────────────────────
const sales = [];
const postcodes = new Set();
for (const year of YEARS) {
  const path = `/tmp/pp${year}.csv`;
  if (!existsSync(path)) {
    console.log(`  pp${year}.csv not found at ${path} — skipping`);
    continue;
  }
  const text = readFileSync(path, 'latin1');
  let kept = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const f = splitCsv(line);
    if (f.length < 16) continue;
    if (!COUNTIES.has(f[13].trim().toUpperCase())) continue;
    // Standard open-market sales only — see the header.
    if (f[14].trim().toUpperCase() !== 'A') continue;
    const type = TYPE[f[4].trim().toUpperCase()];
    if (!type) continue; // 'O' (other) is offices, garages, land — not a home
    const price = Number(f[1]);
    if (!Number.isFinite(price) || price <= 0) continue;
    const pc = f[3].trim().toUpperCase();
    if (!pc) continue;
    sales.push({ pc, price, type });
    postcodes.add(pc);
    kept += 1;
  }
  console.log(`  ${year}: ${kept.toLocaleString()} London open-market sales`);
}
console.log(`\n${sales.length.toLocaleString()} sales across ${postcodes.size.toLocaleString()} postcodes`);

// ── locate the postcodes ────────────────────────────────────────────────
const list = [...postcodes];
const coords = new Map();
console.log('Geocoding…');
for (let i = 0; i < list.length; i += 100) {
  try {
    const r = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: list.slice(i, i + 100) }),
    });
    const body = await r.json();
    for (const e of body.result ?? []) {
      if (e.result) coords.set(e.query.toUpperCase(), { lat: e.result.latitude, lng: e.result.longitude });
    }
  } catch { /* a failed batch loses those postcodes, not the run */ }
  if ((i / 100) % 50 === 0) console.log(`  ${Math.min(i + 100, list.length).toLocaleString()}/${list.length.toLocaleString()}`);
  await sleep(120);
}
console.log(`  located ${coords.size.toLocaleString()} of ${list.length.toLocaleString()}\n`);

// ── attach each sale to its nearest area ────────────────────────────────
const raw = JSON.parse(readFileSync(STATIONS, 'utf8'));
const stations = (Array.isArray(raw) ? raw : raw.stations ?? []);

// Bucket stations by rounded coordinate so each sale compares against a
// handful of candidates rather than all 585 — 320k x 585 is 187M distance
// calculations and several minutes; this is seconds.
const CELL = 0.02;
const grid = new Map();
const key = (la, ln) => `${Math.round(la / CELL)}|${Math.round(ln / CELL)}`;
for (const s of stations) {
  const k = key(s.lat, s.lng);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(s);
}

const byArea = new Map();
let placed = 0;
for (const sale of sales) {
  const at = coords.get(sale.pc);
  if (!at) continue;
  let best = null;
  let bestKm = Infinity;
  for (let dla = -1; dla <= 1; dla += 1) {
    for (let dln = -1; dln <= 1; dln += 1) {
      for (const st of grid.get(`${Math.round(at.lat / CELL) + dla}|${Math.round(at.lng / CELL) + dln}`) ?? []) {
        const km = distanceKm(at, st);
        if (km < bestKm) { bestKm = km; best = st; }
      }
    }
  }
  if (!best || bestKm > RADIUS_KM) continue;
  if (!byArea.has(best.name)) byArea.set(best.name, {});
  const bucket = byArea.get(best.name);
  (bucket[sale.type] ??= []).push(sale.price);
  (bucket.all ??= []).push(sale.price);
  placed += 1;
}
console.log(`${placed.toLocaleString()} sales placed within ${RADIUS_KM}km of an area\n`);

// ── medians ─────────────────────────────────────────────────────────────
const areas = {};
let thin = 0;
for (const [name, buckets] of byArea) {
  const entry = {};
  for (const [type, prices] of Object.entries(buckets)) {
    if (prices.length < MIN_SAMPLE) continue;
    entry[type] = { median: median(prices), sales: prices.length };
  }
  if (Object.keys(entry).length === 0) { thin += 1; continue; }
  areas[name] = entry;
}

const sorted = Object.fromEntries(Object.keys(areas).sort().map((k) => [k, areas[k]]));
writeFileSync(OUT, `${JSON.stringify({
  source: 'HM Land Registry Price Paid Data',
  licence: 'Open Government Licence v3',
  attribution: 'Contains HM Land Registry data © Crown copyright and database right',
  years: YEARS,
  radiusKm: RADIUS_KM,
  minSample: MIN_SAMPLE,
  note: 'Standard open-market sales only (PPD category A). Median sold price, not asking price. No bedroom data exists in this source.',
  counties: [...COUNTIES],
  built: new Date().toISOString().slice(0, 10),
  areas: sorted,
}, null, 0)}\n`);

console.log(`${Object.keys(sorted).length} areas priced, ${thin} too thin to publish`);
console.log(`Wrote ${OUT.pathname}`);
