/**
 * Adds the London stations the map has been missing.
 *
 *   npm run add-stations           # dry run: resolve and report, write nothing
 *   npm run add-stations -- --write
 *
 * Nick asked why Ealing Broadway was absent (2026-08-28). It was not a
 * naming problem — a whole run of stations is missing, and the pattern is
 * specific: the Bakerloo line simply stops at Harlesden, and almost every
 * other gap is a station served by MORE THAN ONE mode.
 *
 * The August expansion commit (d6aa5a7) says "35 were dropped as
 * duplicates. Duplicate detection checks geography as well as names." A
 * station appearing in both the tube list and the rail list at identical
 * coordinates looks exactly like a duplicate, so the most likely reading is
 * that de-duplication removed those entries instead of merging them. The
 * generator was never committed, so that stays a hypothesis rather than a
 * finding.
 *
 * This adds them back the same way the expansion did: coordinates and a
 * verified TfL station code, then peak journey times to all 73 Zone 1
 * destinations, so the new areas behave identically to the existing 570.
 *
 * Method matches build_journey_times.py exactly — next Tuesday, 08:30
 * departure, LeastTime, bus included (excluding it made some areas look
 * unreachable when a bus leg is genuinely fastest). Set TFL_APP_KEY for a
 * free registered key and this runs several times faster.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const WRITE = process.argv.includes('--write');

/**
 * A free TfL developer key raises the rate limit enormously. Without one
 * this managed roughly one station per 40 minutes — ten hours for fifteen
 * stations. With one it is a few minutes.
 *
 * Read from tfl_key.txt exactly as build_journey_times.py does. The first
 * version of this script checked only the environment variable, so it ran
 * unregistered for 40 minutes while a perfectly good key sat git-ignored in
 * the repo root, where it had been since August.
 */
function loadKey() {
  const fromEnv = (process.env.TFL_APP_KEY ?? '').trim();
  if (fromEnv) return fromEnv;
  const file = new URL('../../tfl_key.txt', import.meta.url);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}
const APP_KEY = loadKey();

/**
 * Stations TfL serves inside Greater London that the map does not hold.
 * Derived from a full audit against the TfL StopPoint API, then filtered by
 * hand to residential London — Watford, Brentwood, Shenfield and the
 * Heathrow terminals are correctly outside the app's scope, and several
 * apparent gaps were only spelling differences.
 */
const MISSING = [
  // The Bakerloo line north-west of Harlesden — six consecutive stations.
  'Stonebridge Park',
  'Wembley Central',
  'North Wembley',
  'South Kenton',
  'Kenton',
  'Harrow & Wealdstone',
  // Multi-mode interchanges dropped individually.
  'Ealing Broadway',
  'Barking',
  'Aldgate East',
  'Kew Gardens',
  'Greenford',
  'Harrow-on-the-Hill',
  'Upminster',
  'West Ruislip',
  'South Ruislip',
];

const ZONE1 = JSON.parse(readFileSync(new URL('./zone1-destinations.json', import.meta.url), 'utf8'));

const STATIONS = new URL('../assets/data/stations.json', import.meta.url);
const JOURNEYS = new URL('../assets/data/journey-times.json', import.meta.url);
const ORIGINS = new URL('../../data/origin-codes.json', import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function get(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Maloca/1.0' } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(10000 * (i + 1));
        continue;
      }
      if (res.status !== 200) return null;
      return await res.json();
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

/** Next Tuesday — TfL rejects dates more than about a week in the past. */
function nextTuesday() {
  const d = new Date();
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
const DATE = nextTuesday();

async function journeyMinutes(fromId, toId) {
  /**
   * A station's journey to ITSELF is zero, not a failure.
   *
   * Several areas are also Zone 1 destinations — Aldgate East is both — and
   * TfL returns no journeys when asked to route somewhere to itself. Read as
   * a failure, that one gap disqualified the whole area under the
   * complete-set rule below. The existing data already stores 0 for these
   * (Aldgate, Angel and Bermondsey all do), so this matches it.
   */
  if (fromId === toId) return 0;

  const params = new URLSearchParams({
    date: DATE,
    time: '0830',
    timeIs: 'Departing',
    journeyPreference: 'LeastTime',
    // Bus included deliberately: without it some areas look unreachable
    // when a bus leg is genuinely the fastest real option.
    mode: 'tube,dlr,elizabeth-line,overground,national-rail,bus',
  });
  if (APP_KEY) params.set('app_key', APP_KEY);
  const body = await get(
    `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(fromId)}/to/${encodeURIComponent(toId)}?${params}`,
  );
  const journeys = body?.journeys ?? [];
  if (!journeys.length) return null;
  return journeys.reduce((a, b) => ((b.duration ?? 9999) < (a.duration ?? 9999) ? b : a)).duration ?? null;
}

/**
 * Resolve a station name to a code the Journey Planner will actually accept.
 *
 * THIS IS THE BUG. Multi-mode stations resolve to a HUB code (HUBEAL,
 * HUBWMB), and the Journey Planner rejects those with HTTP 300 — "ambiguous,
 * pick one" — rather than routing from them. Every station missing from the
 * map is one of these, which is almost certainly why the original generator
 * dropped them: it asked for a journey, got a 300, and moved on.
 *
 * A hub's children are the real stations underneath. Both give identical
 * journey times (verified: Ealing Broadway to Bank is 29 minutes from either
 * the rail or the tube child), so this prefers the rail child to match the
 * 910G convention the existing data already uses.
 */
async function resolveStation(name) {
  const body = await get(
    `https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(name)}?modes=tube,dlr,overground,elizabeth-line,national-rail`,
  );
  const matches = body?.matches ?? [];
  if (!matches.length) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = matches.find((m) => norm(m.name).startsWith(norm(name))) ?? matches[0];

  if (!hit.id.startsWith('HUB')) return { id: hit.id, name, lat: hit.lat, lng: hit.lon };

  const hub = await get(`https://api.tfl.gov.uk/StopPoint/${encodeURIComponent(hit.id)}`);
  const children = (hub?.children ?? []).filter((c) =>
    /Naptan(Metro|Rail)Station/.test(c.stopType),
  );
  if (!children.length) return null;
  const rail = children.find((c) => c.stopType === 'NaptanRailStation');
  const child = rail ?? children[0];
  return { id: child.naptanId, name, lat: hit.lat, lng: hit.lon };
}

console.log(`Resolving ${MISSING.length} missing stations against TfL…`);
const resolved = [];
for (const name of MISSING) {
  const station = await resolveStation(name);
  if (!station) {
    console.log(`  ! ${name}: could not resolve — skipped`);
    continue;
  }
  resolved.push(station);
  console.log(`  ${name.padEnd(22)} ${station.id}  ${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}`);
  await sleep(400);
}

const existing = require('../assets/data/stations.json');
const held = new Set(existing.map((s) => s.name));
const toAdd = resolved.filter((s) => !held.has(s.name));
console.log(`\n${toAdd.length} to add, ${resolved.length - toAdd.length} already held.`);

if (!WRITE) {
  console.log('\nDry run — nothing written. Re-run with --write to fetch journey times and save.');
  process.exit(0);
}

const destEntries = Object.entries(ZONE1);
console.log(`\nFetching ${toAdd.length * destEntries.length} journeys (${DATE}, 08:30)…`);
console.log(
  APP_KEY
    ? 'Using the TfL key from tfl_key.txt — six journeys at a time.'
    : 'No TfL key found — running slowly and unregistered.',
);

const journeyTimes = {};
for (const station of toAdd) {
  const times = {};
  let failed = 0;
  // TfL's registered tier allows about 500 requests a minute; six at a time
  // with a short pause stays comfortably under it, matching what
  // build_journey_times.py settled on after testing.
  const workers = APP_KEY ? 6 : 1;
  const queue = [...destEntries];
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [destName, destId] = next;
        const mins = await journeyMinutes(station.id, destId);
        if (mins === null) failed += 1;
        else times[slug(destName)] = mins;
        await sleep(APP_KEY ? 100 : 600);
      }
    }),
  );
  journeyTimes[station.name] = times;
  console.log(`  ${station.name.padEnd(22)} ${Object.keys(times).length}/${destEntries.length} journeys${failed ? ` (${failed} failed)` : ''}`);
}

// Only write areas with a COMPLETE set. A half-filled area would silently
// look closer to everywhere than it is, which is worse than being absent.
const complete = toAdd.filter((s) => Object.keys(journeyTimes[s.name]).length === destEntries.length);
const incomplete = toAdd.filter((s) => !complete.includes(s));
if (incomplete.length) {
  console.log(`\nSkipping ${incomplete.length} with missing journeys: ${incomplete.map((s) => s.name).join(', ')}`);
}

const stations = [...existing, ...complete.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }))]
  .sort((a, b) => a.name.localeCompare(b.name));
const journeys = JSON.parse(readFileSync(JOURNEYS, 'utf8'));
const origins = JSON.parse(readFileSync(ORIGINS, 'utf8'));
for (const s of complete) {
  journeys[s.name] = journeyTimes[s.name];
  origins[s.name] = { id: s.id };
}

writeFileSync(STATIONS, `${JSON.stringify(stations, null, 2)}\n`);
writeFileSync(JOURNEYS, `${JSON.stringify(journeys, null, 2)}\n`);
writeFileSync(ORIGINS, `${JSON.stringify(origins, null, 2)}\n`);
console.log(`\nAdded ${complete.length} areas — now ${stations.length}.`);
console.log('Re-run the data builds so the new areas get measurements:');
console.log('  npm run food && npm run people && npm run footfall && npm run venues && npm run homes && npm run rhythm');
