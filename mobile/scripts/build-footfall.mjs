/**
 * Builds assets/data/area-footfall.json from ORR station usage estimates.
 *
 *   npm run footfall
 *
 * Two jobs, both of which fix known holes.
 *
 * ONE — intensity where TfL cannot reach. The TfL crowding API is tube-only,
 * so 328 of 570 areas had no busyness signal at all, and it showed: Stoke
 * Newington's matches all scored a flat 53% because everything was being
 * compared on eleven dimensions instead of seventeen. ORR covers every
 * National Rail station in Great Britain, so Peckham Rye, Hackney Central
 * and Clapham Junction finally get a measured figure. It is an ANNUAL total,
 * so it says how busy but never when — half the signal, and the reliable
 * half.
 *
 * TWO — the interchange correction, which is the better find. ORR publishes
 * interchanges separately from entries and exits. Balham exposed the problem
 * (Nick, 2026-08-27): as a station it is a tube/National Rail interchange
 * with a huge morning peak and nothing at night, so the data called it a
 * commuter dormitory even though its high road is lively. Now we can measure
 * exactly how much of a station's traffic is people who never leave it, and
 * treat its rhythm as less representative of the neighbourhood accordingly.
 *
 * Source: ORR Table 1410, April 2024 to March 2025, Open Government Licence.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json');

const OUT = new URL('../assets/data/area-footfall.json', import.meta.url);
const SOURCE =
  'https://dataportal.orr.gov.uk/media/1909/table-1410-passenger-entries-and-exits-and-interchanges-by-station.csv';

/** Matches build-zone1.mjs and build-rhythm.mjs so every script joins alike. */
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

/** ORR's headers contain newlines inside quoted cells, so this must be real. */
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
  return rows;
}

/** "11,873,686" -> 11873686; "[z]" and blanks -> null, never 0. */
function number(cell) {
  if (cell == null) return null;
  const cleaned = String(cell).replace(/,/g, '').trim();
  if (!cleaned || /^\[/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

console.log('Downloading ORR station usage (Table 1410)…');
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`ORR download failed: HTTP ${res.status}`);
const rows = parseCsv(await res.text());

const headerIndex = rows.findIndex((r) => r[0] === 'Station name');
if (headerIndex === -1) throw new Error('Could not find the header row — has the ORR layout changed?');
const header = rows[headerIndex].map((h) => h.replace(/\s+/g, ' ').trim());
const col = (label) => {
  const i = header.findIndex((h) => h === label);
  if (i === -1) throw new Error(`ORR column missing: "${label}"`);
  return i;
};
const NAME = col('Station name');
const ALL_TICKETS = col('Entries and exits: All tickets');
const INTERCHANGES = col('Interchanges');

const byName = new Map();
for (const row of rows.slice(headerIndex + 1)) {
  const name = (row[NAME] ?? '').trim();
  if (!name) continue;
  const entries = number(row[ALL_TICKETS]);
  if (entries === null) continue;
  byName.set(normalise(name), {
    entriesExits: entries,
    interchanges: number(row[INTERCHANGES]),
  });
}
console.log(`  ${byName.size} stations with usage figures\n`);

const areas = {};
const unmatched = [];
for (const station of appStations) {
  const hit = byName.get(normalise(station.name));
  if (!hit) {
    unmatched.push(station.name);
    continue;
  }
  const { entriesExits, interchanges } = hit;
  areas[station.name] = {
    entriesExits,
    interchanges,
    /**
     * Interchanges as a share of ALL movement through the station. High
     * means most of its traffic never reaches the street, so its rhythm
     * describes the railway rather than the neighbourhood.
     */
    interchangeRatio:
      interchanges === null || entriesExits + interchanges === 0
        ? null
        : Math.round((interchanges / (entriesExits + interchanges)) * 1000) / 1000,
  };
}

const out = {
  source: 'Office of Rail and Road, Table 1410: passenger entries, exits and interchanges by station, April 2024 to March 2025',
  url: SOURCE,
  licence: 'Open Government Licence v3.0',
  fetched: new Date().toISOString().slice(0, 10),
  method: 'Annual entries and exits per National Rail station, matched to areas by normalised name.',
  caveats: [
    'Annual totals only — this says how busy a station is, never when.',
    'Tube-only stations are absent: ORR covers National Rail. TfL crowding covers those.',
    'Estimated from ticket sales, so season-ticket travel is modelled rather than counted.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

// Written minified, not pretty-printed. Indentation was 31% of the bundled
// data — 622KB the app downloads and never reads. The cost is that git diffs
// on these files become one unreadable line, which is acceptable because they
// are generated wholesale and never edited by hand.
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${Object.keys(areas).length} of ${appStations.length} areas to assets/data/area-footfall.json`);
console.log(`${unmatched.length} areas had no ORR entry (expected: tube-only stations)`);
console.log(`  e.g. ${unmatched.slice(0, 8).join(', ')}`);
