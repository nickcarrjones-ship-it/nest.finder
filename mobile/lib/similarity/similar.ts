/**
 * "Where else in London feels like this?"
 *
 * The anchor is the query: take the area someone already loves, and find the
 * others whose measurements look like it. Two rules from Nick shape this,
 * and both are easy to get wrong:
 *
 *  - DON'T EXCLUDE NEIGHBOURS. If Balham genuinely matches Clapham, saying
 *    so is true and useful — "if what they're looking for is just down the
 *    road, the app should tell them". What must not happen is an answer that
 *    is four stops down one line. So proximity is never penalised; instead
 *    the RESULT SET is spread, which is a different thing (see `spread`).
 *  - MISSING DATA IS NOT ZERO. 328 of 570 areas have no rhythm signal at
 *    all. Comparing on a dimension one side lacks would quietly rank
 *    unmeasured areas as dead quiet, so comparisons run only over shared
 *    dimensions and report how much was actually compared.
 */

import {
  DIMENSIONS,
  allAreaNames,
  computeStats,
  familyWeight,
  featuresFor,
  interchangeRatio,
  standardise,
  type Dimension,
  type Dim,
} from './features';

export interface Match {
  name: string;
  /** 0–1, where 1 is identical on everything compared. */
  score: number;
  /** How many of the dimensions both areas actually had. */
  dimensionsCompared: number;
  /**
   * Low when little was comparable. The output must say so rather than
   * present a two-dimension match as confidently as a twelve-dimension one.
   */
  confidence: 'high' | 'medium' | 'low';
  /** Kilometres from the anchor — for spreading results, not for ranking. */
  distanceKm: number;
  /** The dimensions this pair matched most closely on, strongest first. */
  sharedTraits: Dimension[];
  /** Share of station traffic that is interchange — null when unknown. */
  interchangeRatio: number | null;
}

/** What the user said they liked about the anchor, as dimension weights. */
export type Weights = Partial<Record<Dimension, number>>;

export interface Coords {
  lat: number;
  lng: number;
}

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distance between two areas over the dimensions they SHARE, scaled so that
 * areas with more data in common are not penalised for it.
 */
export function compare(
  a: Record<Dimension, Dim>,
  b: Record<Dimension, Dim>,
  weights: Weights,
): { score: number; compared: number; traits: Dimension[] } {
  let sum = 0;
  let weightSum = 0;
  let compared = 0;
  const perDim: { dim: Dimension; gap: number }[] = [];

  for (const dim of DIMENSIONS) {
    const va = a[dim];
    const vb = b[dim];
    if (va === null || vb === null) continue;
    // Family weighting first, so a source with many measures cannot out-vote
    // one with few; the caller's own weights steer on top of that.
    const w = (weights[dim] ?? 1) * familyWeight(dim);
    if (w === 0) continue;
    const gap = Math.abs(va - vb);
    sum += w * gap ** 2;
    weightSum += w;
    compared += 1;
    perDim.push({ dim, gap });
  }

  if (compared === 0) return { score: 0, compared: 0, traits: [] };

  /**
   * Unmeasured dimensions count as a TYPICAL disagreement, not as a free
   * pass.
   *
   * Without this, areas with less data win every time: comparing on six
   * dimensions instead of twelve simply gives fewer chances to disagree, so
   * the first real run returned ten areas that all happened to lack rhythm
   * data. Ignoring a dimension silently rewarded ignorance.
   *
   * Two standardised values drawn independently differ by 2 in expected
   * squared terms (the variances add), so 2 is the disagreement of two
   * unrelated areas — the honest stand-in for "we don't know". A perfect
   * six-dimension match now scores below a strong twelve-dimension one, and
   * above a mediocre one, which is the ordering we actually want.
   */
  const EXPECTED_GAP_SQ = 2;
  for (const dim of DIMENSIONS) {
    const w = (weights[dim] ?? 1) * familyWeight(dim);
    if (w === 0) continue;
    if (a[dim] !== null && b[dim] !== null) continue;
    sum += w * EXPECTED_GAP_SQ;
    weightSum += w;
  }

  // Root-mean-square gap in standard deviations, turned into 0–1. Two areas
  // one SD apart on average score ~0.5; identical areas score 1.
  const rms = Math.sqrt(sum / weightSum);
  const score = 1 / (1 + rms);
  const traits = perDim
    .sort((x, y) => x.gap - y.gap)
    .slice(0, 3)
    .map((t) => t.dim);
  return { score, compared, traits };
}

/**
 * Confidence is about how much we actually knew, not how good the score was.
 *
 * A heavy interchange drags it down even on a full comparison: when nearly
 * half a station's traffic is people changing trains, its rhythm is a fact
 * about the railway. Better to say so than to present it as a reading of the
 * neighbourhood.
 */
const HEAVY_INTERCHANGE = 0.35;

function confidenceFor(compared: number, interchange: number | null): Match['confidence'] {
  const heavy = interchange !== null && interchange >= HEAVY_INTERCHANGE;
  if (compared >= 14) return heavy ? 'medium' : 'high';
  if (compared >= 8) return heavy ? 'low' : 'medium';
  return 'low';
}

/**
 * Spreads a ranked list geographically WITHOUT penalising proximity.
 *
 * Everything stays eligible and nothing is reordered on distance. The only
 * rule is that once `perCluster` results have been taken from within
 * `clusterKm` of each other, further near-identical neighbours step aside
 * for the next best match elsewhere — so the answer can include Balham
 * without being four stops down one line.
 */
export function spread(
  ranked: Match[],
  limit: number,
  { clusterKm = 2.5, perCluster = 2 }: { clusterKm?: number; perCluster?: number } = {},
  coordsOf: (name: string) => Coords | undefined = () => undefined,
): Match[] {
  const picked: Match[] = [];
  const deferred: Match[] = [];

  for (const m of ranked) {
    if (picked.length >= limit) break;
    const here = coordsOf(m.name);
    const near = here
      ? picked.filter((p) => {
          const there = coordsOf(p.name);
          return there ? haversineKm(here, there) <= clusterKm : false;
        }).length
      : 0;
    if (near >= perCluster) deferred.push(m);
    else picked.push(m);
  }

  // Anything set aside is still a real match — if the spread left room,
  // it comes back rather than being thrown away.
  for (const m of deferred) {
    if (picked.length >= limit) break;
    picked.push(m);
  }
  return picked;
}

export interface FindOptions {
  limit?: number;
  weights?: Weights;
  /** Areas the user has ruled out. */
  exclude?: string[];
  /** Only consider these (e.g. the ones within their commute). */
  candidates?: string[];
  coords?: Record<string, Coords>;
}

/**
 * The main entry point: areas most like `anchor`.
 *
 * Returns matches ordered by similarity, spread geographically, each
 * carrying how much was actually comparable so the wording downstream can be
 * honest about a thin match.
 */
export function findSimilar(anchor: string, options: FindOptions = {}): Match[] {
  const { limit = 8, weights = {}, exclude = [], candidates, coords = {} } = options;

  const names = allAreaNames();
  const all = names.map(featuresFor);
  const stats = computeStats(all);

  const anchorFeatures = all.find((a) => a.name === anchor);
  if (!anchorFeatures) return [];
  const anchorVec = standardise(anchorFeatures, stats);
  const anchorCoords = coords[anchor];

  const excluded = new Set(exclude);
  const allowed = candidates ? new Set(candidates) : null;

  const ranked = all
    .filter((a) => a.name !== anchor && !excluded.has(a.name) && (!allowed || allowed.has(a.name)))
    .map((a): Match => {
      const { score, compared, traits } = compare(anchorVec, standardise(a, stats), weights);
      const here = coords[a.name];
      return {
        name: a.name,
        score,
        dimensionsCompared: compared,
        confidence: confidenceFor(compared, interchangeRatio(a.name)),
        distanceKm: anchorCoords && here ? Math.round(haversineKm(anchorCoords, here) * 10) / 10 : 0,
        sharedTraits: traits,
        interchangeRatio: interchangeRatio(a.name),
      };
    })
    .filter((m) => m.dimensionsCompared > 0)
    .sort((a, b) => b.score - a.score);

  return spread(ranked, limit, {}, (n) => coords[n]);
}

/**
 * Turns "what do you like about there?" into dimension weights.
 *
 * Deliberately coarse and readable rather than clever: this is the step that
 * separates two people who both say "Clapham" and mean opposite things, and
 * it needs to be obvious what it did when a result looks wrong.
 *
 * TODO once the learning loop lands (docs/learning-loop.md): these weights
 * are where a user's own verdicts should adjust things.
 */
export function weightsFromPreference(text: string): Weights {
  const t = text.toLowerCase();
  const w: Weights = {};
  const wants = (...words: string[]) => words.some((word) => t.includes(word));
  const bump = (dims: Dimension[], by: number) => {
    for (const d of dims) w[d] = Math.max(w[d] ?? 0, by);
  };

  // --- going out --------------------------------------------------------
  if (wants('night', 'bar', 'pub', 'drink', 'going out', 'go out', 'buzz', 'lively', 'vibrant', 'nightlife')) {
    bump(['satNight', 'nightlifeRatio'], 3);
    bump(['drinkShare', 'drinkCount', 'barToPub', 'barShare'], 2);
  }
  if (wants('quiet', 'calm', 'peaceful', 'residential', 'village', 'sleepy', 'suburban')) {
    bump(['satNight', 'nightlifeRatio', 'peak'], 3);
    bump(['annualFootfall'], 2);
  }

  // --- eating and drinking ----------------------------------------------
  if (wants('coffee', 'cafe', 'café', 'brunch', 'independent', 'indie', 'local shops', 'high street')) {
    bump(['independentShare', 'cafeShare'], 3);
    bump(['sitdownShare'], 2);
  }
  if (wants('restaurant', 'food', 'eat', 'dining', 'cuisine', 'foodie')) {
    bump(['restaurantShare', 'cuisineCount'], 3);
    bump(['sitdownShare', 'venues'], 2);
  }
  if (wants('chain', 'takeaway', 'fast food')) bump(['takeawayShare', 'independentShare'], 2);

  // --- what the housing is like -----------------------------------------
  if (wants('victorian', 'edwardian', 'period', 'georgian', 'character', 'terrace', 'townhouse', 'original features')) {
    bump(['preWarShare', 'terraceShare'], 3);
    bump(['newBuildShare', 'houseShare'], 2);
  }
  if (wants('new build', 'new-build', 'modern', 'contemporary', 'newly built', 'development')) {
    bump(['newBuildShare'], 3);
    bump(['preWarShare', 'flatShare'], 2);
  }
  if (wants('thirties', '1930s', 'semi', 'mock tudor')) bump(['interwarShare'], 3);
  if (wants('house', 'garden', 'family home')) bump(['houseShare', 'flatShare'], 3);
  if (wants('flat', 'apartment', 'maisonette')) bump(['flatShare', 'houseShare'], 3);
  if (wants('big', 'large', 'spacious', 'roomy', 'space')) bump(['medianFloorArea'], 3);
  if (wants('tower', 'high rise', 'high-rise', 'skyscraper')) bump(['tallShare', 'meanStoreys'], 3);
  if (wants('low rise', 'low-rise', 'leafy street', 'quiet street')) bump(['meanStoreys', 'tallShare'], 2);

  // --- who lives there ---------------------------------------------------
  if (wants('young', 'twenties', 'thirties crowd', 'students', 'professional')) bump(['share20to34'], 3);
  if (wants('famil', 'kids', 'children', 'school', 'schools', 'nursery')) {
    bump(['shareUnder15', 'shareOwned'], 3);
    bump(['houseShare'], 2);
  }
  if (wants('settled', 'established', 'own', 'owner')) bump(['shareOwned', 'sharePrivateRent'], 2);
  if (wants('renting', 'renters', 'transient')) bump(['sharePrivateRent'], 2);

  // --- rhythm ------------------------------------------------------------
  if (wants('weekend', 'saturday', 'sunday', 'day out', 'market')) {
    bump(['weekendDay', 'weekendLean'], 3);
  }
  if (wants('commut', 'work', 'office')) bump(['weekdayMorning'], 2);
  if (wants('busy', 'bustling', 'central')) bump(['peak', 'annualFootfall', 'venues'], 2);

  return w;
}
