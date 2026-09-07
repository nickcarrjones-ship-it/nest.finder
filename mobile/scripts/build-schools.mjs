/**
 * Builds assets/data/area-schools.json — the nearest real schools to each
 * area, with their actual Ofsted judgement.
 *
 *   npm run schools
 *
 * Nick's requirement (2026-08-31): the area card shows the actual school
 * and its latest Ofsted rating — a named school with a real judgement, not
 * a derived "schools score". Probed 2026-09-02 (docs/data-sources.md):
 * the data and the geocoding both work; what needed deciding was what a
 * "rating" even is now that Ofsted has three incompatible systems live at
 * once. Approved 2026-09-02.
 *
 * SOURCE URL WILL GO STALE. Ofsted publish a new monthly file and the
 * asset ID changes every time — this is pinned to "as at 31 July 2026",
 * the current release when this was written. Re-run this by re-fetching
 * https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes
 * and swapping SRC_URL for whatever "latest inspections" CSV is listed
 * there — the columns below have stayed stable across at least the last
 * two releases, so the parsing should not need to change with it.
 *
 * THREE ERAS OF JUDGEMENT, not one column:
 *
 *   legacy    — the old single grade (Outstanding/Good/RI/Inadequate),
 *               "Latest OEIF overall effectiveness". 53% of London schools
 *               in the July 2026 release.
 *   ungraded  — a short check confirming or revising the old grade without
 *               re-grading it, "School remains Good" and similar,
 *               "Ungraded inspection overall outcome". 37%.
 *   reportcard — Ofsted's post-Sept-2025 model: up to nine independent
 *               category grades (Achievement, Curriculum and teaching,
 *               Leadership and governance, Safeguarding, Inclusion,
 *               Attendance and behaviour, Personal development, Early
 *               years, Post-16), each Exceptional / Strong standard /
 *               Expected standard / Needs attention / Urgent improvement.
 *               NO OVERALL WORD AT ALL. 9% today, and growing — every
 *               school moves to this as it is re-inspected.
 *
 * A report-card school is never collapsed to one invented word. The whole
 * category set travels in the output; ACHIEVEMENT is marked as the
 * headline only as a display hint (closest analogue to what "Good" used
 * to mean to someone outside the school), and the app must still show the
 * rest on request — inventing a rollup Ofsted itself declined to publish
 * is the exact "number nobody can check" failure this feature exists to
 * avoid, one level up.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stations = require('../assets/data/stations.json');

const SRC_URL =
  'https://assets.publishing.service.gov.uk/media/6a75d6aa5a472b60f4ea6d63/Management_information_-_state-funded_schools_-_latest_inspections_as_at_31_July_2026.csv';
const OUT = new URL('../assets/data/area-schools.json', import.meta.url);

/** How far a school may be from a station and still count as "nearby" —
 *  a walkable catchment, same judgement call parks used at 1.2km. */
const RADIUS_KM = 1.2;
/** How many of the nearest schools to keep per area. Enough to show a
 *  primary and a secondary without turning into a directory. */
/**
 * Per PHASE, not overall — and that distinction is the whole point.
 *
 * This used to be a phase-blind "nearest 3", which sounds neutral and is
 * not. England has roughly five primaries for every secondary and primary
 * catchments are far denser, so the three nearest schools to any London
 * station are almost always three primaries. The result was 1306 primaries
 * against 344 secondaries, with 266 of 585 areas holding no secondary at
 * all — so the Agent never mentioned secondary schools for half of London,
 * not because it was ignoring them but because it had none to mention
 * (Nick spotted the pattern, 2026-09-07).
 *
 * Distance alone cannot express "show me both kinds". Taking the nearest
 * few of EACH phase can, and it costs nothing: a household with a
 * four-year-old and a household with a fourteen-year-old are asking
 * different questions of the same area.
 */
const MAX_PER_PHASE = 2;
const PHASES = ['Primary', 'Secondary'];

const LEGACY_GRADE = { '1': 'Outstanding', '2': 'Good', '3': 'Requires improvement', '4': 'Inadequate' };
const REPORTCARD_CATEGORIES = [
  ['Achievement', 'Achievement'],
  ['Curriculum and teaching', 'Curriculum and teaching'],
  ['Leadership and governance', 'Leadership and governance'],
  ['Attendance and behaviour', 'Attendance and behaviour'],
  ['Personal development and wellbeing', 'Personal development'],
  ['Inclusion', 'Inclusion'],
  ['Safeguarding standards', 'Safeguarding'],
  ['Early years (where applicable)', 'Early years'],
  ['Post-16 provision (where applicable)', 'Post-16'],
];
const EMPTY = new Set(['', 'NULL']);

/** A real CSV line split: commas inside quoted fields are data, not
 *  separators — a school name like "St Mary's, Islington" would otherwise
 *  shift every column after it. */
function splitCsv(line) {
  const out = [];
  let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

/** Windows-1252, not UTF-8 — gov.uk's export, and a plain UTF-8 read
 *  throws partway through on the first curly quote or en-dash. */
function decodeCp1252(buf) {
  // The full table only matters in the 0x80-0x9F range; everything else
  // in Latin-1 maps straight onto its own code point.
  const MAP = {
    0x80:0x20AC,0x82:0x201A,0x83:0x0192,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,
    0x88:0x02C6,0x89:0x2030,0x8A:0x0160,0x8B:0x2039,0x8C:0x0152,0x8E:0x017D,0x91:0x2018,
    0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,0x98:0x02DC,
    0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x0153,0x9E:0x017E,0x9F:0x0178,
  };
  let out = '';
  for (const byte of buf) out += String.fromCharCode(MAP[byte] ?? byte);
  return out;
}

console.log(`Fetching ${SRC_URL}`);
const res = await fetch(SRC_URL);
if (!res.ok) {
  console.error(`Fetch failed: HTTP ${res.status}. The release has probably moved — see the header comment for how to find the current URL.`);
  process.exit(1);
}
const text = decodeCp1252(Buffer.from(await res.arrayBuffer()));
const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
const header = splitCsv(lines[0]);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const need = [
  'School name', 'Ofsted phase', 'Region', 'Postcode',
  'Latest OEIF overall effectiveness', 'Ungraded inspection overall outcome',
  'Publication date', 'Ungraded inspection publication date',
  ...REPORTCARD_CATEGORIES.map(([col]) => col),
];
for (const col of need) {
  if (!(col in idx)) { console.error(`Column missing from the export: "${col}" — the schema has changed, see the header comment.`); process.exit(1); }
}

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const f = splitCsv(lines[i]);
  if (f[idx['Region']] !== 'London') continue;
  const pc = (f[idx['Postcode']] || '').trim();
  if (!pc) continue;

  // Mainstream only. Pupil referral units and alternative provision serve
  // excluded or at-risk pupils, not the local catchment — listing one next
  // to "Tooting Broadway" as if it were an ordinary nearby school would
  // mislead exactly the family this feature is for. Special schools serve
  // a real but different need (SEN placement, not geography) that this
  // card is not built to answer. Nurseries are supplementary, not the
  // "which school" decision the feature exists for.
  const phase = (f[idx['Ofsted phase']] || '').trim();
  if (!['Primary', 'Secondary', 'All-through'].includes(phase)) continue;

  const legacyCode = (f[idx['Latest OEIF overall effectiveness']] || '').trim();
  const ungraded = (f[idx['Ungraded inspection overall outcome']] || '').trim();
  const reportcard = {};
  for (const [col, label] of REPORTCARD_CATEGORIES) {
    const v = (f[idx[col]] || '').trim();
    // "Not applicable" is Ofsted correctly saying a primary school has no
    // post-16 provision to grade — real information, but not a rating, and
    // showing it as one of the school's "categories" reads as a gap in the
    // data rather than the absence of the thing being graded.
    if (!EMPTY.has(v) && v !== 'Not applicable') reportcard[label] = v;
  }

  let rating = null;
  if (Object.keys(reportcard).length > 0) {
    rating = { era: 'reportcard', headline: reportcard['Achievement'] ?? Object.values(reportcard)[0], categories: reportcard };
  } else if (!EMPTY.has(ungraded)) {
    rating = { era: 'ungraded', headline: ungraded };
  } else if (legacyCode in LEGACY_GRADE) {
    rating = { era: 'legacy', headline: LEGACY_GRADE[legacyCode] };
  }
  // No usable judgement at all — the school exists but answers nothing.
  // Excluded rather than shown blank: Nick's requirement is a school AND
  // its rating, and a nameless "?" is not that.
  if (!rating) continue;

  rows.push({ name: (f[idx['School name']] || '').trim(), phase, postcode: pc, rating });
}
console.log(`${rows.length} London schools with a usable judgement, geocoding…`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coords = new Map();
for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100);
  try {
    const r = await fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: chunk.map((s) => s.postcode) }),
    });
    const body = await r.json();
    for (const entry of body.result ?? []) {
      if (!entry.result) continue;
      coords.set(entry.query, { lat: entry.result.latitude, lng: entry.result.longitude });
    }
  } catch { /* a failed batch just means those schools are skipped */ }
  if ((i / 100) % 5 === 0) console.log(`  ${Math.min(i + 100, rows.length)}/${rows.length}`);
  await sleep(120);
}
console.log(`  geocoded ${coords.size} of ${rows.length}\n`);

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}
const round = (n) => Math.round(n * 100) / 100;

const placed = rows.map((s) => ({ ...s, at: coords.get(s.postcode) })).filter((s) => s.at);

const areas = {};
let empty = 0;
for (const station of stations) {
  const inRange = placed
    .map((s) => ({ s, km: distanceKm(station, s.at) }))
    .filter(({ km }) => km <= RADIUS_KM)
    .sort((a, b) => a.km - b.km);

  // All-through schools serve both phases, so they are eligible for either
  // slot rather than being a third category nobody asked about.
  const nearby = [];
  for (const phase of PHASES) {
    const matching = inRange.filter(
      ({ s }) => s.phase === phase || s.phase === 'All-through',
    );
    for (const hit of matching.slice(0, MAX_PER_PHASE)) {
      if (!nearby.includes(hit)) nearby.push(hit);
    }
  }
  nearby.sort((a, b) => a.km - b.km);
  if (nearby.length === 0) { empty++; continue; }
  areas[station.name] = nearby.map(({ s, km }) => ({
    name: s.name, phase: s.phase, distanceKm: round(km), rating: s.rating,
  }));
}

const out = {
  source: 'Ofsted management information — state-funded schools inspections and outcomes',
  url: 'https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes',
  licence: 'Open Government Licence v3.0',
  fetched: new Date().toISOString().slice(0, 10),
  method: `Nearest ${MAX_PER_PHASE} primary and ${MAX_PER_PHASE} secondary schools within ${RADIUS_KM}km with a usable judgement, keyed by station. Per-phase rather than nearest-N overall, because primaries are ~5x denser and a phase-blind cut returned almost only primaries. Three rating eras — see the header comment in scripts/build-schools.mjs before displaying "rating" as if it were one thing.`,
  caveats: [
    'Ofsted abolished single-word grades in September 2025. A "reportcard" rating has no overall word — categories must all be reachable, not just the headline.',
    'A school "remaining Good" via an ungraded check is confirmed, not re-graded — the underlying inspection may be several years old.',
    'Straight-line distance from the station, not a walking route or a catchment boundary.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: stations.length, schoolsPlaced: placed.length },
  areas,
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${Object.keys(areas).length} areas to assets/data/area-schools.json`);
if (empty) console.log(`${empty} areas had no rated school within ${RADIUS_KM}km`);
