/**
 * Builds assets/data/area-rhythm.json from the TfL crowding API.
 *
 *   npm run rhythm
 *
 * The rhythm of a place is the first real signal behind anchor-and-expand:
 * when an area is busy, measured, rather than what a model remembers about
 * it. TfL publishes percentageOfBaseLine in 15-minute bands for every day of
 * the week, and it discriminates far better than expected — Clapham Common
 * peaks at 00:15 on a Saturday and is twice as busy as Clapham South, a mile
 * down the same line. That is a nightlife signature no general knowledge of
 * "Clapham" would ever separate.
 *
 * Two things this script has to get right, both learned the hard way while
 * probing (see docs/data-sources.md):
 *
 *  1. The API rate-limits with HTTP 429 and an empty body. Reading that as
 *     "this station has no data" produced a 18% coverage figure when the
 *     truth was 100%. So every response is checked by STATUS, retried with
 *     backoff, and a station is only recorded as having no data when the API
 *     actually says 200 with nothing in it.
 *  2. Coverage is tube-only — no Overground, no DLR, no tram, and Elizabeth
 *     line only where it meets the tube. 242 of the app's 570 areas are
 *     covered. The other 328 get NO entry here at all rather than a zero,
 *     because "quiet" and "unmeasured" must never look the same downstream.
 *
 * Raw bands are ~160k numbers, far too big to bundle, so this derives a
 * handful of features per station and writes only those. Re-running the
 * script is the way to re-derive; nothing is thrown away that TfL won't give
 * back for free.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const appStations = require('../assets/data/stations.json');

/**
 * Four days, not seven. Monday to Thursday are near-identical, so a typical
 * weekday plus Friday (a going-out night, which genuinely differs), Saturday
 * and Sunday captures everything that matters for 43% fewer requests. TfL
 * throttles hard enough that this is the difference between a run that
 * finishes and one that doesn't.
 */
const DAYS = ['Wed', 'Fri', 'Sat', 'Sun'];
const WEEKDAY = 'Wed';
const OUT = new URL('../assets/data/area-rhythm.json', import.meta.url);
/** Checkpoint, so a failure 200 stations in does not throw away the lot. */
const CHECKPOINT = new URL('./.rhythm-progress.json', import.meta.url);

/** Matches build-zone1.mjs so both scripts join on the same key. */
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A GET that treats throttling as "ask again", never as an answer.
 * Returns null only for a genuine 200-with-nothing or a dead end.
 */
/**
 * Returns parsed JSON, null for a genuine "nothing here", or throws only
 * when the API would not answer at all.
 *
 * Backoff is generous because TfL's limiter punishes bursts: waiting is
 * always cheaper than a wrong answer, and a throttled response read as "no
 * data" is exactly the bug that once produced a fake 18% coverage figure.
 */
async function get(url, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetch(url);
    } catch {
      await sleep(3000 * (i + 1));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(5000 * (i + 1));
      continue;
    }
    if (res.status !== 200) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  throw new Error(`no answer after ${attempts} attempts: ${url}`);
}

/** Every tube station TfL knows, keyed by the app's normalised name. */
async function tubeStations() {
  const byName = new Map();
  let page = 1;
  for (;;) {
    const body = await get(`https://api.tfl.gov.uk/StopPoint/Mode/tube?page=${page}`);
    const stops = body?.stopPoints ?? [];
    for (const stop of stops) {
      if (stop.stopType !== 'NaptanMetroStation') continue;
      const key = normalise(stop.commonName ?? '');
      if (key && !byName.has(key)) byName.set(key, stop.naptanId);
    }
    if (stops.length === 0 || page * (body.pageSize ?? 1000) >= (body.total ?? 0)) break;
    page += 1;
    await sleep(400);
  }
  return byName;
}

const hourOf = (band) => parseInt(band.timeBand.slice(0, 2), 10);
const mean = (bands) =>
  bands.length ? bands.reduce((s, b) => s + b.percentageOfBaseLine, 0) / bands.length : 0;
const between = (bands, from, to) => bands.filter((b) => hourOf(b) >= from && hourOf(b) < to);
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * The features. Chosen because each one answers a question someone would
 * actually ask about an area, and because the probe showed they separate
 * places a Londoner would call different.
 *
 * Values are comparable BETWEEN stations — verified: Saturday peaks run from
 * Oxford Circus 0.29 down to Chesham 0.03 — so these carry both the shape of
 * a place and how intense it is. That matters: the food data gives shares
 * only, which hide intensity entirely.
 */
function features(byDay) {
  const sat = byDay.Sat ?? [];
  const sun = byDay.Sun ?? [];
  const fri = byDay.Fri ?? [];
  const weekdays = byDay[WEEKDAY] ?? [];
  const allBands = DAYS.flatMap((d) => byDay[d] ?? []);
  if (allBands.length === 0) return null;

  // The DAY matters as much as the time, and is easy to lose: TfL's "Sat"
  // data starts at Saturday 00:00, so a peak in the Sat 00:15 band is really
  // FRIDAY night. Recording the day is what makes "busiest just after
  // midnight on a Friday" a sentence we can actually say.
  let peak = { percentageOfBaseLine: -1, timeBand: '', day: '' };
  for (const day of DAYS) {
    for (const band of byDay[day] ?? []) {
      if (band.percentageOfBaseLine > peak.percentageOfBaseLine) peak = { ...band, day };
    }
  }
  // Saturday night proper: 22:00 to 02:00, which spans midnight — so the
  // small hours come from SUNDAY's bands, not Saturday's.
  const satNight = [...between(sat, 22, 24), ...between(sun, 0, 2)];
  // Friday night is a separate going-out signal: some areas fill on a Friday
  // and empty on a Saturday, and vice versa.
  const friNight = [...between(fri, 22, 24), ...between(sat, 0, 2)];
  const weekdayMorning = between(weekdays, 7, 10);

  const satNightMean = mean(satNight);
  return {
    peak: round(peak.percentageOfBaseLine),
    peakTime: peak.timeBand,
    /** Which day that peak fell on — meaningless without it. */
    peakDay: peak.day,
    satNight: round(satNightMean),
    friNight: round(mean(friNight)),
    satAfternoon: round(mean(between(sat, 12, 17))),
    sunAfternoon: round(mean(between(sun, 12, 17))),
    weekdayMorning: round(mean(weekdayMorning)),
    weekdayEvening: round(mean(between(weekdays, 17, 20))),
    // How much of a station's busiest moment survives to Saturday night.
    // High means somewhere people go out; low means somewhere people leave.
    nightlifeRatio: round(peak.percentageOfBaseLine ? satNightMean / peak.percentageOfBaseLine : 0),
    // Above 1 means busier at the weekend than on a working morning — a
    // destination rather than a dormitory.
    weekendLean: round(mean(weekdayMorning) ? mean([...sat, ...sun]) / mean(weekdayMorning) : 0),
  };
}

console.log('Resolving tube stations from the TfL Unified API…');
const naptanByName = await tubeStations();
console.log(`  ${naptanByName.size} tube stations`);

const matched = appStations.filter((s) => naptanByName.has(normalise(s.name)));
console.log(`  ${matched.length} of ${appStations.length} app areas are tube stations\n`);

// Resume wherever a previous run stopped. The first version of this script
// threw on one unlucky station 200 in and discarded eighteen minutes of
// completed work — hence both the checkpoint and the per-station catch.
const areas = existsSync(CHECKPOINT) ? JSON.parse(readFileSync(CHECKPOINT, 'utf8')) : {};
const done = new Set(Object.keys(areas));
if (done.size) console.log(`Resuming — ${done.size} areas already fetched\n`);

const failed = [];
let noData = 0;
for (const [i, station] of matched.entries()) {
  if (done.has(station.name)) continue;
  const naptan = naptanByName.get(normalise(station.name));
  try {
    const byDay = {};
    for (const day of DAYS) {
      const body = await get(`https://api.tfl.gov.uk/crowding/${naptan}/${day}`);
      if (body?.timeBands?.length) byDay[day] = body.timeBands;
      await sleep(300);
    }
    const f = features(byDay);
    if (f) areas[station.name] = f;
    else noData += 1;
  } catch (err) {
    // One station the API will not answer for must never cost the whole run.
    failed.push(station.name);
    console.log(`  ! ${station.name}: ${err.message}`);
    await sleep(5000);
  }
  if ((i + 1) % 20 === 0) {
    writeFileSync(CHECKPOINT, JSON.stringify(areas));
    console.log(`  ${i + 1}/${matched.length}… (${Object.keys(areas).length} with data)`);
  }
}
writeFileSync(CHECKPOINT, JSON.stringify(areas));

const out = {
  // Provenance travels with the data — every signal has to say where it came
  // from, when, and under what licence. See docs/data-sources.md.
  source: 'TfL Unified API, crowding endpoint',
  url: 'https://api.tfl.gov.uk/crowding/{naptanId}/{day}',
  licence: 'Powered by TfL Open Data',
  fetched: new Date().toISOString().slice(0, 10),
  note: 'Tube only. Areas absent from `areas` have no rhythm data — that is unmeasured, NOT quiet.',
  coverage: { areasWithData: Object.keys(areas).length, appAreas: appStations.length },
  areas,
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(areas).length} areas to assets/data/area-rhythm.json`);
if (noData) console.log(`${noData} matched stations returned no bands`);
if (failed.length) console.log(`${failed.length} could not be fetched: ${failed.join(', ')}`);
console.log(`${appStations.length - Object.keys(areas).length} areas have no rhythm signal.`);
console.log('Re-run to retry anything that failed — completed areas are cached.');
