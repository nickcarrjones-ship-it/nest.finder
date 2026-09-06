/**
 * Builds assets/data/rightmove-ids.json — the Rightmove location identifier
 * for each of our areas, so a "Search Rightmove" button can open a real
 * filtered search rather than the Rightmove home page.
 *
 *   npm run rightmove-ids
 *
 * WHY THIS IS A BUILD SCRIPT AND NOT A RUNTIME CALL
 *
 * Rightmove will not take a place name. A search URL needs an opaque
 * identifier — `locationIdentifier=STATION^9245` — and the only way to get
 * one is los.rightmove.co.uk/typeahead, which is undocumented and
 * unversioned. Resolving 585 areas once, here, offline, means: no
 * undocumented endpoint called from users' phones, no per-tap latency, no
 * failure mode where the button does nothing because someone's train has
 * gone into a tunnel — and, most importantly, a human gets to read the
 * misses before any of it ships.
 *
 * THE WRONG-CITY PROBLEM — the reason the guards below exist
 *
 * The typeahead fuzzy-matches, and it will answer confidently with
 * somewhere else entirely. Measured on our own area names (2026-09-06):
 *
 *   "Chessington North"  ->  Heslington, York, North Yorkshire
 *   "St Johns"           ->  Bedford St. Johns Station
 *
 * Sent to a user, that is a search for houses 200 miles from the area they
 * tapped. This is the same failure the place-label arbitration already
 * exists to stop on the map (lib/ranking/placeLabels.ts) — a name that
 * matches something real, somewhere wrong.
 *
 * Two guards, and the important one is the second:
 *
 *   1. Ask for "<area> Station", not "<area>". Our areas ARE station
 *      names, and the station index is far more precise than the region
 *      one — "Chessington North Station" resolves exactly, where the bare
 *      name goes to Yorkshire.
 *   2. VERIFY, don't trust. A match is only accepted if the name it came
 *      back with is the name we asked for, compared with punctuation
 *      normalised away (Rightmove writes "King's Cross St. Pancras" where
 *      our data says "Kings Cross St Pancras"). Anything else is written
 *      to the misses list for a human, never guessed at.
 *
 * Everything unresolved is simply absent from the output, and the app hides
 * the button for those areas (lib/rightmove.ts). A missing button is a
 * disappointment; a button that searches the wrong county is a broken
 * promise, and it is the second one this script exists to prevent.
 */

import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const STATIONS = new URL('../assets/data/stations.json', import.meta.url);
const OUT = new URL('../assets/data/rightmove-ids.json', import.meta.url);
const MISSES = new URL('../assets/data/rightmove-ids.misses.json', import.meta.url);

const TYPEAHEAD = 'https://los.rightmove.co.uk/typeahead';
// Referer is required — without it the endpoint 400s.
const HEADERS = {
  Referer: 'https://www.rightmove.co.uk/',
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
};

/** Politeness between calls. This is someone else's undocumented endpoint
 *  and we are asking it 585 questions; there is no hurry. */
const DELAY_MS = 350;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Strips everything the two sides spell differently: case, apostrophes
 * (King's vs Kings), full stops (St. vs St), hyphens (Bromley-by-Bow vs
 * Bromley by Bow), and the joining word in a double-barrelled name, which
 * Rightmove writes as "&" and our data writes as "and". What is left has to
 * match EXACTLY — this is a verification step, not a second fuzzy match, so
 * it deliberately does no edit distance and no prefix matching.
 *
 * Dropping "and"/"&" rather than normalising them to one spelling is
 * deliberate: it lets "Elephant and Castle" (ours) meet "Elephant & Castle"
 * (theirs) in the middle, and the full-string equality below is what stops
 * that looseness turning into a wrong match.
 */
function normalise(name) {
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Bethnal Green (Underground) Station" -> "Bethnal Green Station".
 *  Rightmove disambiguates same-named stations by line; our data usually
 *  does not. */
function withoutParens(name) {
  return name.replace(/\([^)]*\)/g, ' ');
}

/**
 * What to actually type into the typeahead. The endpoint is fussy in ways
 * worth stating, all measured on 2026-09-06: a query containing "&", the
 * word "and", a hyphen, an apostrophe or brackets returns NOTHING rather
 * than erroring — so "Harrow & Wealdstone Station" silently finds nothing
 * while "Harrow Wealdstone Station" finds it first time.
 */
function queryFor(area) {
  return `${normalise(withoutParens(area))} station`;
}

/**
 * Stations whose Rightmove name is not a punctuation variant of ours but a
 * genuinely different string. Listed by hand, one line each, rather than by
 * loosening the matching above — a rule permissive enough to catch these
 * would also catch a station in another county, which is the failure this
 * whole script is built to avoid.
 */
const OVERRIDES = {
  // Rightmove indexes this as "St. Pancras Station" — not a punctuation
  // variant of "London St Pancras International", so no rule catches it.
  'London St Pancras International': 'STATION^8648',
};

/**
 * Rightmove is inconsistent about what it calls the thing at the end of a
 * station name: "Lea Bridge" has no suffix at all, "Morden Road Tram Stop"
 * has a different one, and "Battersea Power Underground Station" has two.
 * Comparing base names — everything before those words — is what lets all
 * three meet our plain "Lea Bridge" / "Morden Road" / "Battersea Power
 * Station".
 *
 * This is still an exact comparison of what remains, which is why it does
 * not reopen the wrong-city hole: "St Johns" and "Bedford St Johns" have
 * different base names and stay unmatched.
 */
function baseName(name) {
  let out = normalise(withoutParens(name));
  let prev;
  do {
    prev = out;
    out = out.replace(/\s*\b(station|tram stop|stop|underground|overground|dlr|rail)\b\s*$/, '').trim();
  } while (out !== prev && out.length > 0);
  return out;
}

async function typeahead(query) {
  const url = `${TYPEAHEAD}?query=${encodeURIComponent(query)}&limit=10`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.matches) ? body.matches : [];
}

/**
 * One area -> one identifier, or null. Tries the station index first and
 * only accepts a name-verified hit; see the header for why there is no
 * "best effort" fallback here.
 */
async function resolve(area) {
  if (OVERRIDES[area]) return { id: OVERRIDES[area], displayName: '(override)' };

  // Two queries, because the suffix cuts both ways: "<name> Station" is
  // what disambiguates a station from the district around it, but Rightmove
  // has no "Lea Bridge Station" — only "Lea Bridge" — and asking for the
  // suffixed form there returns nothing at all. Results are pooled and then
  // judged by the tiers below, so asking twice widens what we consider
  // without widening what we accept.
  const stations = [];
  const seen = new Set();
  for (const q of [queryFor(area), baseName(area)]) {
    let matches;
    try {
      matches = await typeahead(q);
    } catch {
      continue;
    }
    for (const m of matches) {
      if (m.type === 'STATION' && !seen.has(m.id)) {
        seen.add(m.id);
        stations.push(m);
      }
    }
    await sleep(DELAY_MS);
  }

  // Tier 1 — the name we asked for, exactly, once punctuation is set aside.
  // This is what keeps "Edgware Road (Bakerloo)" on the Bakerloo platform
  // rather than the Circle line one, when our own data bothered to say.
  const want = normalise(`${area} station`);
  const exact = stations.find((m) => normalise(m.displayName) === want);
  if (exact) return { id: `STATION^${exact.id}`, displayName: exact.displayName };

  // Tier 2 — same name once each side's line-disambiguator is dropped.
  // "Bethnal Green" meets "Bethnal Green (Underground)" here. Where several
  // candidates survive they are by definition variants of the SAME station
  // name — the two Bethnal Greens are 250m apart, well inside the search
  // radius — so taking the first is safe in a way that a looser name match
  // would not be.
  const wantBare = normalise(`${withoutParens(area)} station`);
  const bare = stations.find((m) => normalise(withoutParens(m.displayName)) === wantBare);
  if (bare) return { id: `STATION^${bare.id}`, displayName: bare.displayName };

  // Tier 3 — same base name once each side's "Station"/"Tram Stop"/
  // "Underground" tail is set aside. See baseName: this is what catches
  // "Lea Bridge" (no suffix at all on Rightmove) and "Morden Road Tram
  // Stop", without loosening the comparison of the name itself.
  const wantBase = baseName(area);
  const based = stations.find((m) => baseName(m.displayName) === wantBase);
  if (based) return { id: `STATION^${based.id}`, displayName: based.displayName };

  return null;
}

const raw = JSON.parse(readFileSync(STATIONS, 'utf8'));
const areas = (Array.isArray(raw) ? raw : raw.stations ?? []).map((a) => a.name);

console.log(`Resolving ${areas.length} areas against Rightmove's location index…`);

const out = {};
const misses = [];
let done = 0;

for (const area of areas) {
  const hit = await resolve(area);
  if (hit) out[area] = hit.id;
  else misses.push(area);
  done += 1;
  if (done % 50 === 0) console.log(`  ${done}/${areas.length} (${misses.length} unresolved)`);
  await sleep(DELAY_MS);
}

// Sorted so the diff between two runs is readable — this file is checked
// in, and a reordering would otherwise look like a data change.
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));

writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
writeFileSync(MISSES, `${JSON.stringify(misses.sort(), null, 2)}\n`);

const pct = ((Object.keys(out).length / areas.length) * 100).toFixed(1);
console.log(`\nResolved ${Object.keys(out).length}/${areas.length} (${pct}%)`);
console.log(`Unresolved (button hidden for these): ${misses.length}`);
if (misses.length) console.log(`  ${misses.slice(0, 15).join(', ')}${misses.length > 15 ? ', …' : ''}`);
console.log(`\nWrote ${OUT.pathname}`);
console.log(`Wrote ${MISSES.pathname} — read this before shipping.`);
