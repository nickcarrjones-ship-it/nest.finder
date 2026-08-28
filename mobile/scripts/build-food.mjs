/**
 * Builds assets/data/area-food.json from the FSA food hygiene register.
 *
 *   npm run food
 *
 * The second signal behind anchor-and-expand: what an area's food scene is
 * SHAPED like. Not how good it is — the FSA holds hygiene ratings, which say
 * nothing whatsoever about quality and must never be presented as if they
 * do — but the balance of sitting down, taking away and drinking, and how
 * much of it is independent rather than chain.
 *
 * Four things learned while probing (docs/data-sources.md), all of which
 * this script exists to get right:
 *
 *  1. PAGINATE. A first probe capped at 400 records and silently truncated
 *     four of five districts, moving the City's pub share from 6% to 10%.
 *     Every area is fetched to meta.totalCount.
 *  2. FILTER. The FSA registers childminders, care homes, schools and shops
 *     as food businesses — 2,301 of Peckham's 4,308 records. Only three
 *     business types are real venues; everything else is excluded.
 *  3. SHARES HIDE INTENSITY. EC2 has 65 pubs to Clapham's 30 yet a lower
 *     pub SHARE, because ~400 office lunch places dilute it (Nick spotted
 *     this). So counts are written alongside every share, and the pair has
 *     to be read together.
 *  4. FSA CANNOT SPLIT CAFE FROM RESTAURANT. Both live in one bucket called
 *     Restaurant/Cafe/Canteen. That split needs OpenStreetMap and is not
 *     attempted here — better an honest three-way split than a fabricated
 *     four-way one.
 *
 * Areas are keyed by a radius around each station rather than by postcode,
 * which is possible because 89% of FSA records carry coordinates. Adjacent
 * areas overlap, which is correct: neighbouring stations genuinely do share
 * a food scene.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json');

const OUT = new URL('../assets/data/area-food.json', import.meta.url);
/** Miles. Roughly a 20 minute walk — the outer edge of the app's walk budgets. */
const RADIUS_MILES = 1;
const PAGE = 500;

/** The only three FSA types that are places you actually go to eat or drink. */
const VENUE = {
  'Restaurant/Cafe/Canteen': 'sitdown',
  'Takeaway/sandwich shop': 'takeaway',
  'Pub/bar/nightclub': 'drink',
};

/**
 * Holding a drinks licence is not the same as being somewhere you go out.
 *
 * Nick queried Chiswick Park's 46 pubs (2026-08-27) and was right: the list
 * included Chiswick Catholic Centre, a memorial club, a sports and social
 * club and Merkur Slots, a gaming arcade. The pollution is not even — it
 * inflates suburbs ~15% against inner London's ~6%, because social clubs,
 * sports clubs and church halls are a suburban phenomenon. Left in, it
 * systematically overstates how lively the suburbs are, which is exactly the
 * error that flattered Chiswick.
 *
 * Deliberately conservative: it matches obvious institutional words only. A
 * genuine pub called "The Cricketers" keeps its place because the word here
 * is `cricket club`, not `cricket`.
 */
const NOT_A_VENUE =
  /\b(catholic|church|chapel|mosque|synagogue|memorial|association|scout|cadet|legion|masonic|working men'?s|conservative club|labour club|sports (and|&) social|social club|cricket club|rugby club|football club|tennis club|bowls club|golf club|slots|bingo|casino|arcade|community centre|community hall|village hall|parish|institute|academy|primary school|secondary school|college|university|hospital|care home|nursing home|residents)\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'x-api-version': '2' } });
    } catch {
      await sleep(1500 * (i + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(2500 * (i + 1));
      continue;
    }
    if (res.status !== 200) return null;
    return res.json();
  }
  throw new Error(`gave up after ${attempts} attempts: ${url}`);
}

/** Every establishment within RADIUS_MILES, all pages, not just the first. */
async function establishmentsNear(lat, lng) {
  const base =
    `https://api.ratings.food.gov.uk/Establishments` +
    `?latitude=${lat}&longitude=${lng}&maxDistanceLimit=${RADIUS_MILES}&pageSize=${PAGE}`;
  const out = [];
  for (let page = 1; ; page++) {
    const body = await get(`${base}&pageNumber=${page}`);
    const rows = body?.establishments ?? [];
    out.push(...rows);
    const total = body?.meta?.totalCount ?? 0;
    if (rows.length === 0 || out.length >= total) break;
    await sleep(150);
  }
  return out;
}

/** Chains are names that recur across London. Keyed loosely so punctuation and
 *  "Ltd" variants collapse together. */
const nameKey = (n) =>
  (n ?? '')
    .toLowerCase()
    .replace(/\b(ltd|limited|uk|plc|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

const round = (n) => Math.round(n * 1000) / 1000;

console.log(`Fetching food venues within ${RADIUS_MILES} mile of ${appStations.length} areas…`);
console.log('(this makes a few thousand requests and takes a while)\n');

// Pass one: collect. Dedupe by FHRSID so a venue near three stations is one
// business when counting how often its name recurs.
const perArea = new Map();
const allById = new Map();
for (const [i, station] of appStations.entries()) {
  const rows = await establishmentsNear(station.lat, station.lng);
  const venues = rows.filter(
    (r) => VENUE[r.BusinessType] && !NOT_A_VENUE.test(r.BusinessName ?? ''),
  );
  perArea.set(station.name, venues);
  for (const v of venues) allById.set(v.FHRSID, v);
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${appStations.length}…`);
  await sleep(120);
}

// Pass two: how many DISTINCT businesses share each name, London-wide.
const londonNameCounts = new Map();
for (const v of allById.values()) {
  const k = nameKey(v.BusinessName);
  if (k) londonNameCounts.set(k, (londonNameCounts.get(k) ?? 0) + 1);
}
console.log(`\n${allById.size} distinct venues, ${londonNameCounts.size} distinct names`);

// Pass three: the fingerprint.
const areas = {};
for (const [name, venues] of perArea) {
  if (venues.length === 0) continue;
  const counts = { sitdown: 0, takeaway: 0, drink: 0 };
  let independent = 0;
  for (const v of venues) {
    counts[VENUE[v.BusinessType]] += 1;
    // Appearing once across the whole capital is the working definition of
    // independent — much closer to what people mean than any raw count.
    if ((londonNameCounts.get(nameKey(v.BusinessName)) ?? 1) === 1) independent += 1;
  }
  const total = venues.length;
  areas[name] = {
    venues: total,
    counts,
    shares: {
      sitdown: round(counts.sitdown / total),
      takeaway: round(counts.takeaway / total),
      drink: round(counts.drink / total),
    },
    independentShare: round(independent / total),
  };
}

const out = {
  source: 'Food Standards Agency food hygiene rating register',
  url: 'https://api.ratings.food.gov.uk/Establishments',
  licence: 'Open Government Licence v3.0',
  fetched: new Date().toISOString().slice(0, 10),
  method: `All establishments within ${RADIUS_MILES} mile of each area, fully paginated, filtered to ${Object.keys(VENUE).join(' / ')}.`,
  caveats: [
    'FSA cannot distinguish a cafe from a restaurant — both are Restaurant/Cafe/Canteen.',
    'Hygiene ratings are deliberately not used: they say nothing about quality.',
    'Shares describe balance and hide intensity — read them with `counts`.',
  ],
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

// Written minified, not pretty-printed. Indentation was 31% of the bundled
// data — 622KB the app downloads and never reads. The cost is that git diffs
// on these files become one unreadable line, which is acceptable because they
// are generated wholesale and never edited by hand.
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${Object.keys(areas).length} areas to assets/data/area-food.json`);
