/**
 * Builds assets/data/area-crime.json — recorded crime around each area,
 * as RATES a house-hunter can compare, never raw counts.
 *
 *   node scripts/build-crime.mjs
 *
 * Source: data.police.uk street-level crime, all categories, one call per
 * area per month for the latest 12 published months. Free, no key, Open
 * Government Licence. The API returns every crime within roughly one mile
 * of the point — the same 1.61km circle area-people.json counts residents
 * and households in, which is what makes the rates below honest.
 *
 * NORMALISED, because raw counts measure busyness, not safety (Nick,
 * 2026-08-31). Two rates, each with the denominator that suits it:
 *
 *   burglary per 1,000 homes a year — the households in the circle. The
 *     measure that matters most to someone choosing where to live, and one
 *     footfall barely touches: burglars go where the homes are.
 *
 *   street crime per 1,000 people around a year — violence and sexual
 *     offences, robbery and theft from the person, divided by residents
 *     PLUS the station's average daily users (ORR entries and exits / 365).
 *     This is the footfall correction: without it the West End ranks worst
 *     in London simply for being full of people.
 *
 * 241 of 585 areas have no ORR footfall figure (see area-footfall.json
 * coverage). For those the denominator is residents alone, which slightly
 * overstates their street-crime rate. Flagged per area as `footfallKnown`
 * so the Agent can say so rather than hide it.
 *
 * A FAILED CALL IS NEVER A ZERO. An area missing any month is left out
 * rather than recorded as quiet — otherwise the safest-looking places would
 * be the ones the fetch failed for (the trap docs/data-sources.md warns
 * about, which TfL and Overpass both fell into).
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stations = require('../assets/data/stations.json');
// Both sides of the London boundary (build-circle-counts.mjs), so border
// stations are not divided by a fraction of their real households.
const people = require('../assets/data/area-circle-counts.json').areas;
// Rail (ORR) and TfL counts. The larger of the two, never the sum: at an
// interchange both count many of the same journeys.
const orr = require('../assets/data/area-footfall.json').areas;
const tube = require('../assets/data/area-tube-footfall.json').areas;
const yearlyFootfall = (name) => Math.max(orr[name]?.entriesExits ?? 0, tube[name]?.entriesExits ?? 0);

const OUT = new URL('../assets/data/area-crime.json', import.meta.url);
const MONTHS = 12;
/** Gentle: police.uk allows 15/s. */
const CONCURRENCY = 6;

const STREET = new Set(['violent-crime', 'robbery', 'theft-from-the-person']);
/** Grouped for the Agent: what someone choosing a home would ask about. */
const GROUPS = {
  'violent-crime': 'violence',
  robbery: 'robbery',
  'theft-from-the-person': 'theftFromPerson',
  burglary: 'burglary',
  'vehicle-crime': 'vehicle',
  'anti-social-behaviour': 'antisocial',
  'bicycle-theft': 'bicycle',
  shoplifting: 'shoplifting',
  drugs: 'drugs',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Maloca area data build (maloca.homes)' } });
      if (res.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error('gave up');
}

function monthsBack(latest, n) {
  const [y, m] = latest.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out.reverse();
}

async function crimesFor(station, months) {
  const counts = { total: 0 };
  for (const month of months) {
    const url = `https://data.police.uk/api/crimes-street/all-crime?lat=${station.lat}&lng=${station.lng}&date=${month}`;
    const list = await getJson(url); // throws on failure: never a silent zero
    for (const c of list) {
      counts.total++;
      const g = GROUPS[c.category] ?? 'other';
      counts[g] = (counts[g] ?? 0) + 1;
      if (STREET.has(c.category)) counts.street = (counts.street ?? 0) + 1;
    }
  }
  return counts;
}

function percentileRank(values, v) {
  // Share of areas with a LOWER rate: 0.8 means "higher than 80% of areas".
  const below = values.filter((x) => x < v).length;
  return Math.round((below / values.length) * 100) / 100;
}

/** Rates from raw yearly counts. Split out so --rates-only can rerun it
 *  on stored counts without fetching a year of police.uk data again. */
function computeRates(raw) {
  const areas = {};
  for (const [name, c] of Object.entries(raw)) {
    const p = people[name];
    if (!p || !p.population || !p.households) continue; // no honest denominator
    const daily = yearlyFootfall(name) / 365;
    const around = p.population + daily;
    const byType = {};
    for (const g of [...new Set(Object.values(GROUPS)), 'other']) {
      if (c[g]) byType[g] = Math.round(c[g]);
    }
    areas[name] = {
      perYear: Math.round(c.total),
      byType,
      burglaryPer1kHomes: +(((c.burglary ?? 0) / p.households) * 1000).toFixed(1),
      streetPer1kPeople: +(((c.street ?? 0) / around) * 1000).toFixed(1),
      footfallKnown: daily > 0,
    };
  }
  const burg = Object.values(areas).map((a) => a.burglaryPer1kHomes);
  const street = Object.values(areas).map((a) => a.streetPer1kPeople);
  for (const a of Object.values(areas)) {
    a.burglaryRank = percentileRank(burg, a.burglaryPer1kHomes);
    a.streetRank = percentileRank(street, a.streetPer1kPeople);
  }
  return { areas, burg, street };
}

async function main() {
  if (process.argv.includes('--rates-only')) return ratesOnly();
  const { date: latestDate } = await getJson('https://data.police.uk/api/crime-last-updated');
  const latest = latestDate.slice(0, 7);
  const months = monthsBack(latest, MONTHS);
  console.log(`months ${months[0]} to ${months.at(-1)}, ${stations.length} areas`);

  const raw = {};
  const failed = [];
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < stations.length) {
      const s = stations[next++];
      try {
        raw[s.name] = await crimesFor(s, months);
      } catch (err) {
        failed.push({ area: s.name, error: String(err.message ?? err) });
      }
      if (++done % 25 === 0) console.log(`${done}/${stations.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const { areas, burg, street } = computeRates(raw);
  const out = {
    source: 'data.police.uk street-level crime, all categories',
    url: 'https://data.police.uk/docs/method/crime-street/',
    licence: 'Open Government Licence v3.0',
    fetched: new Date().toISOString().slice(0, 10),
    months: [months[0], months.at(-1)],
    method:
      'Crimes recorded within about one mile of the station over the last 12 published months. ' +
      'Burglary per 1,000 households (Census 2021, same one-mile circle). Street crime (violence and sexual ' +
      'offences, robbery, theft from the person) per 1,000 residents plus average daily station users (ORR). ' +
      'Ranks are the share of London areas with a lower rate.',
    caveats: [
      'A crime is recorded where it is reported, which near a station is not always where anyone lives.',
      'Areas without ORR footfall use residents only, which slightly overstates their street-crime rate (footfallKnown: false).',
      'police.uk locations are snapped to anonymised points, so edges of the circle are approximate.',
    ],
    coverage: { areasWithData: Object.keys(areas).length, appAreas: stations.length, failed: failed.length },
    failed,
    areas,
    raw,
  };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${Object.keys(areas).length} areas, ${failed.length} failed`);
}

main().catch((err) => { console.error(err); process.exit(1); });

/** Recompute rates from the counts already on disk (node scripts/build-crime.mjs --rates-only). */
async function ratesOnly() {
  const { readFileSync } = await import('node:fs');
  const prev = JSON.parse(readFileSync(OUT, 'utf8'));
  const raw = prev.raw ?? Object.fromEntries(Object.entries(prev.areas).map(([name, a]) => [name, {
    ...a.byType,
    total: a.perYear,
    street: (a.byType.violence ?? 0) + (a.byType.robbery ?? 0) + (a.byType.theftFromPerson ?? 0),
  }]));
  const { areas } = computeRates(raw);
  writeFileSync(OUT, JSON.stringify({
    ...prev,
    method: prev.method.replace('average daily station users (ORR)', 'average daily station users (the larger of ORR rail and TfL counts)')
      .replace('(Census 2021, same one-mile circle)', '(Census 2021, same one-mile circle, both sides of the London boundary)'),
    coverage: { ...prev.coverage, areasWithData: Object.keys(areas).length },
    areas,
    raw,
  }));
  console.log(`recomputed rates for ${Object.keys(areas).length} areas`);
}
