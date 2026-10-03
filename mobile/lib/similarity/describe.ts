/**
 * An area's measurements, written as plain facts a model can reason from.
 *
 * This is the join between the data work and the product. Until now the
 * ranking prompt handed the model a commute time, a walk budget and a
 * council tax rank, and everything about an area's CHARACTER came from what
 * the model happened to remember about London — which is exactly what Nick
 * challenged, and what the anchor-and-expand plan exists to replace.
 *
 * Three rules, all of which matter more than they look:
 *
 *  1. SAY ONLY WHAT WAS MEASURED. Every phrase here traces to a number in
 *     one of the datasets. Where a signal is missing the description says so
 *     rather than quietly omitting it, because a gap the model cannot see is
 *     a gap it will fill from memory.
 *  2. NEVER QUOTE THE RAW BUSYNESS FIGURE. TfL's percentageOfBaseLine has no
 *     published definition (docs/data-sources.md). Comparisons between areas
 *     are sound, so "busier after dark than most" is honest; "0.22" or "22%
 *     full" would be inventing a meaning.
 *  3. NO ADJECTIVES WE CANNOT DEFEND. "Trendy" is not in the data. The share
 *     of residents aged 20 to 34 is.
 */

import { DIMENSIONS, allAreaNames, computeStats, featuresFor, standardise } from './features';
import type { AreaFeatures, Dimension } from './features';

/** Where an area sits against London, in plain words. */
function band(z: number | null): 'well below' | 'below' | 'about' | 'above' | 'well above' | null {
  if (z === null) return null;
  if (z <= -1.5) return 'well below';
  if (z <= -0.5) return 'below';
  if (z < 0.5) return 'about';
  if (z < 1.5) return 'above';
  return 'well above';
}

/**
 * Facts are WORDS, never counts (Nick, 2026-10-03: an answer quoted "386
 * places to eat and drink across 58 different cuisines" - "that's just
 * ridiculous"). A model handed a number repeats it however it is told not
 * to; a model handed "a huge choice" cannot. Every measure here is judged
 * against the rest of London, which is what a number never says on its own.
 */
type Band = NonNullable<ReturnType<typeof band>>;
const VENUES: Record<Band, string> = {
  'well above': 'a huge choice of places to eat and drink',
  above: 'plenty of places to eat and drink',
  about: 'a fair few places to eat and drink',
  below: 'not many places to eat and drink',
  'well below': 'very few places to eat and drink',
};
const STATION: Partial<Record<Band, string>> = {
  'well above': 'one of the busiest stations in London',
  above: 'a busy station',
  below: 'a quiet station',
  'well below': 'a very quiet station',
};

let cachedStats: ReturnType<typeof computeStats> | null = null;
function stats() {
  if (!cachedStats) cachedStats = computeStats(allAreaNames().map(featuresFor));
  return cachedStats;
}

export interface AreaDescription {
  /** Short factual clauses, each traceable to a measurement. */
  facts: string[];
  /** Signals we simply do not hold for this area. */
  missing: string[];
}

/**
 * Describes one area. Returns facts and, deliberately, the gaps — a model
 * told what is missing is far less likely to invent it.
 */
export function describeArea(name: string): AreaDescription {
  const f: AreaFeatures = featuresFor(name);
  const z = standardise(f, stats());
  const facts: string[] = [];
  const missing: string[] = [];

  // --- Rhythm: when the place is busy -------------------------------------
  if (f.nightlifeRatio === null) {
    missing.push('when it is busy (no timing data, not on the tube network)');
  } else {
    /**
     * "People come here to go out" needs BOTH a high ratio and real activity.
     *
     * nightlifeRatio is Saturday night measured against the area's OWN peak,
     * so a station that is uniformly dead scores highly: quiet at 8am, quiet
     * at 11pm, ratio near Clapham's. The first version of this claimed High
     * Barnet — 17% aged 20-34, 60% owner-occupied — was somewhere people
     * come to go out, which is exactly the kind of confident nonsense Nick
     * caught twice on 2026-08-27.
     *
     * Requiring absolute Saturday-night busyness as well as the ratio is
     * what separates a genuinely lively place from a consistently empty one.
     */
    const ratio = band(z.nightlifeRatio);
    const absoluteNight = band(z.satNight);
    const livelyRatio = ratio === 'well above' || ratio === 'above';
    const reallyBusy = absoluteNight === 'well above' || absoluteNight === 'above';
    const morning = band(z.weekdayMorning);
    if (livelyRatio && reallyBusy) {
      facts.push('stays busy into Saturday night, people come here to go out');
    } else if (reallyBusy) {
      facts.push('busy on a Saturday night, though busier still at other times');
    } else if (absoluteNight === 'well below' || absoluteNight === 'below') {
      facts.push('quiet after dark');
    }
    if (morning === 'well above') {
      facts.push('a heavy weekday-morning commuter flow');
    }
    const weekend = band(z.weekendLean);
    if (weekend === 'well above' || weekend === 'above') {
      facts.push('busier at weekends than on a working morning, somewhere people come to');
    }
  }

  // --- Food: what is actually there ---------------------------------------
  if (f.venues === null) {
    missing.push('its food and drink scene');
  } else {
    facts.push(VENUES[band(z.venues) ?? 'about']);
    const drink = band(z.drinkShare);
    if (drink === 'well above' || drink === 'above') facts.push('an unusually high share of pubs and bars');
    if (drink === 'well below' || drink === 'below') facts.push('few pubs and bars for its size');
    const takeaway = band(z.takeawayShare);
    if (takeaway === 'well above') facts.push('takeaway-heavy');
    const indie = band(z.independentShare);
    if (indie === 'well above' || indie === 'above') {
      facts.push('mostly independents rather than chains');
    } else if (indie === 'well below') {
      facts.push('more chains than most areas');
    }
  }

  // --- Venue character: the FSA cannot make these distinctions ------------
  if (f.barToPub !== null) {
    const ratio = band(z.barToPub);
    if (ratio === 'well above') facts.push('bars rather than pubs, a going-out crowd');
    else if (ratio === 'well below' || ratio === 'below') facts.push('traditional pubs rather than bars');
  }
  if (f.cuisineCount !== null) {
    const variety = band(z.cuisineCount);
    if (variety === 'well above' || variety === 'above') {
      facts.push('unusually varied food, from all over the world');
    } else if (variety === 'well below') {
      facts.push('limited variety of food');
    }
  }
  if (f.cafeShare !== null && band(z.cafeShare) === 'well above') {
    facts.push('café-heavy, a daytime high street');
  }

  // --- What it looks like --------------------------------------------------
  if (f.flatShare === null) {
    missing.push('what the buildings look like');
  } else {
    const flats = band(z.flatShare);
    const tall = band(z.tallShare);
    if (tall === 'well above') facts.push('a lot of tall buildings, towers rather than streets');
    else if (flats === 'well above' || flats === 'above') facts.push('mostly flats rather than houses');
    else if (band(z.houseShare) === 'well above') facts.push('almost entirely houses');
    if (f.meanStoreys !== null && band(z.meanStoreys) === 'well below') {
      facts.push('low-rise throughout');
    }
  }

  // --- When it was built ---------------------------------------------------
  if (f.preWarShare === null) {
    missing.push('when the housing was built');
  } else {
    const period = band(z.preWarShare);
    const modern = band(z.newBuildShare);
    if (modern === 'well above') facts.push('mostly built since 2007, a new-build area');
    else if (period === 'well above' || period === 'above') {
      facts.push('largely Victorian and Edwardian');
    }
    if (band(z.interwarShare) === 'well above') facts.push('a lot of 1930s housing');
    if (f.medianFloorArea !== null) {
      const size = band(z.medianFloorArea);
      if (size === 'well above') facts.push('unusually large homes');
      if (size === 'well below') facts.push('small homes');
    }
  }

  // --- People: who lives there --------------------------------------------
  if (f.share20to34 === null) {
    missing.push('who lives there');
  } else {
    const young = band(z.share20to34);
    if (young === 'well above') facts.push('one of the youngest areas in London');
    else if (young === 'above') facts.push('a young crowd, lots of people in their twenties and early thirties');
    const kids = band(z.shareUnder15);
    if (kids === 'well above' || kids === 'above') facts.push('a lot of families with children');
    const old = band(z.share65plus);
    if (old === 'well above') facts.push('an older population than most of London');
    if (f.shareOwned !== null) {
      const owned = band(z.shareOwned);
      if (owned === 'well above' || owned === 'above') facts.push('most households own their home');
      else if (owned === 'well below' || owned === 'below') facts.push('mostly renters');
    }
  }

  // --- Scale ---------------------------------------------------------------
  if (f.annualFootfall !== null) {
    const busy = STATION[band(z.annualFootfall) ?? 'about'];
    if (busy) facts.push(busy);
  }

  return { facts, missing };
}

/** One line per area for the ranking prompt. */
export function describeAreaLine(name: string): string {
  const { facts, missing } = describeArea(name);
  if (facts.length === 0) return 'no measurements held for this area';
  const gaps = missing.length ? ` (we hold no data on ${missing.join('; ')})` : '';
  return `${facts.join('; ')}${gaps}`;
}

/** Exposed for tests and for explaining a match. */
export function dimensionsFor(name: string): Record<Dimension, number | null> {
  return standardise(featuresFor(name), stats());
}

export { DIMENSIONS };
