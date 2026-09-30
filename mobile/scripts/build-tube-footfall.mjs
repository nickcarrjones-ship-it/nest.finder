/**
 * Builds assets/data/area-tube-footfall.json — yearly entries plus exits at
 * every TfL-counted station (Underground, Overground, DLR, Elizabeth line).
 *
 *   node scripts/build-tube-footfall.mjs
 *
 * Exists for the crime rates. area-footfall.json is ORR's National Rail
 * table, which has no Underground-only stations — so Oxford Circus, Green
 * Park and Leicester Square had no footfall at all, and the West End got
 * none of the "busy is not dangerous" correction it needed most (found
 * 2026-09-29).
 *
 * Source: TfL Annual Station Counts 2025, annualised entries and exits,
 * crowding.data.tfl.gov.uk. Read straight out of the .xlsx with the
 * system `unzip`, so no spreadsheet package is added for one file.
 * Update SRC to the next year's file when TfL publish it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stations = require('../assets/data/stations.json');
const OUT = new URL('../assets/data/area-tube-footfall.json', import.meta.url);
const SRC =
  'https://s3-eu-west-1.amazonaws.com/crowding.data.tfl.gov.uk/Annual%20Station%20Counts/2025/AC2025_AnnualisedEntryExit_public.xlsx';

const dir = mkdtempSync(join(tmpdir(), 'tfl-'));
const file = join(dir, 'counts.xlsx');
writeFileSync(file, Buffer.from(await (await fetch(SRC)).arrayBuffer()));
const read = (part) => execFileSync('unzip', ['-p', file, part], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));

const rows = [...read('xl/worksheets/sheet1.xml').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((m) =>
  [...m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].reduce((acc, c) => {
    const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] ?? '')?.[1];
    acc[c[1]] = v === undefined ? '' : /t="s"/.test(c[2]) ? shared[Number(v)] : v;
    return acc;
  }, {}),
);

const header = rows.find((r) => r.D === 'Station');
const annualCol = Object.keys(header).find((k) => header[k] === 'Annualised');
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/\bst\.?\b/g, 'st').replace(/[^a-z0-9]/g, '');
/**
 * TfL labels a station per line or mode — "Brixton LU", "Heathrow Terminal
 * 4 EL", "Hammersmith (DIS)" — where the app has one name. Strip the label
 * and the variants are summed, which is right: they are the same place.
 */
const tflName = (s) => s
  .replace(/\s+\((dis|h&c|h&amp;c|bak|bakerloo|lu|el|dlr|lo)\)$/i, '')
  .replace(/\s+(lu|el|dlr|lo|tfl rail|nr)$/i, '')
  .trim();
/** Where TfL and the app name the same place differently. */
const ALIASES = {
  'Bank': 'Bank and Monument',
  'Monument': 'Bank and Monument',
  'Edgware Road (Bakerloo)': 'Edgware Road',
};

const tfl = new Map();
for (const r of rows) {
  const n = Number(r[annualCol]);
  if (!r.D || !Number.isFinite(n) || n <= 0 || r.D === 'Station') continue;
  // Some stations appear once per mode (LU and DLR at Bank). Sum them.
  const key = norm(tflName(r.D));
  tfl.set(key, (tfl.get(key) ?? 0) + n);
}

const areas = {};
const unmatched = [];
for (const s of stations) {
  const n = tfl.get(norm(ALIASES[s.name] ?? s.name));
  if (n) areas[s.name] = { entriesExits: Math.round(n) };
  else unmatched.push(s.name);
}

writeFileSync(OUT, JSON.stringify({
  source: 'TfL Annual Station Counts 2025, annualised entries and exits',
  url: SRC,
  licence: 'Transport for London open data',
  fetched: new Date().toISOString().slice(0, 10),
  coverage: { areasWithData: Object.keys(areas).length, appAreas: stations.length, tflStations: tfl.size },
  areas,
}));
console.log(`${tfl.size} TfL stations, matched ${Object.keys(areas).length} of ${stations.length} app areas`);
