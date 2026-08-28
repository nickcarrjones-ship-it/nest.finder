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

const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 100)}%`);

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
    missing.push('when it is busy (no timing data — not on the tube network)');
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
      facts.push('stays busy into Saturday night — people come here to go out');
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
      facts.push('busier at weekends than on a working morning — somewhere people come to');
    }
  }

  // --- Food: what is actually there ---------------------------------------
  if (f.venues === null) {
    missing.push('its food and drink scene');
  } else {
    facts.push(`${f.venues} places to eat or drink within a mile`);
    const drink = band(z.drinkShare);
    if (drink === 'well above' || drink === 'above') facts.push('an unusually high share of pubs and bars');
    if (drink === 'well below' || drink === 'below') facts.push('few pubs and bars for its size');
    const takeaway = band(z.takeawayShare);
    if (takeaway === 'well above') facts.push('takeaway-heavy');
    const indie = band(z.independentShare);
    if (indie === 'well above' || indie === 'above') {
      facts.push(`mostly independents (${pct(f.independentShare)} appear nowhere else in London)`);
    } else if (indie === 'well below') {
      facts.push('more chains than most areas');
    }
  }

  // --- Venue character: the FSA cannot make these distinctions ------------
  if (f.barToPub !== null) {
    const ratio = band(z.barToPub);
    if (ratio === 'well above') facts.push('bars rather than pubs — a going-out crowd');
    else if (ratio === 'well below' || ratio === 'below') facts.push('traditional pubs rather than bars');
  }
  if (f.cuisineCount !== null) {
    const variety = band(z.cuisineCount);
    if (variety === 'well above' || variety === 'above') {
      facts.push(`unusually varied food (${f.cuisineCount} different cuisines)`);
    } else if (variety === 'well below') {
      facts.push(`limited variety of food (${f.cuisineCount} cuisines)`);
    }
  }
  if (f.cafeShare !== null && band(z.cafeShare) === 'well above') {
    facts.push('café-heavy — a daytime high street');
  }

  // --- What it looks like --------------------------------------------------
  if (f.flatShare === null) {
    missing.push('what the buildings look like');
  } else {
    const flats = band(z.flatShare);
    const tall = band(z.tallShare);
    if (tall === 'well above') facts.push('a lot of tall buildings — towers rather than streets');
    else if (flats === 'well above' || flats === 'above') facts.push('mostly flats rather than houses');
    else if (band(z.houseShare) === 'well above') facts.push('almost entirely houses');
    if (f.meanStoreys !== null && band(z.meanStoreys) === 'well below') {
      facts.push('low-rise throughout');
    }
  }

  // --- People: who lives there --------------------------------------------
  if (f.share20to34 === null) {
    missing.push('who lives there');
  } else {
    facts.push(`${pct(f.share20to34)} of residents are aged 20 to 34`);
    const young = band(z.share20to34);
    if (young === 'well above') facts.push('one of the youngest areas in London');
    const kids = band(z.shareUnder15);
    if (kids === 'well above' || kids === 'above') facts.push('a lot of families with children');
    const old = band(z.share65plus);
    if (old === 'well above') facts.push('an older population than most of London');
    if (f.shareOwned !== null) {
      facts.push(`${pct(f.shareOwned)} of households own their home`);
    }
  }

  // --- Scale ---------------------------------------------------------------
  if (f.annualFootfall !== null) {
    const millions = f.annualFootfall / 1_000_000;
    facts.push(
      `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}m station journeys a year`,
    );
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
