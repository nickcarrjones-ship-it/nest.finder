import type { Dimension } from './similarity/features';

/**
 * What someone thought of an area after going there.
 *
 * This is the part of the Agent that COMPOUNDS (docs/learning-loop.md).
 * Every other signal in docs/data-sources.md is public data a competitor
 * can download too; verdicts accumulate only by having users. So the
 * collecting starts now, well before the learning is built — the data only
 * ever accrues in real time, and none of it can be back-filled later.
 *
 * Nothing here learns anything yet. This file is the shape of the record
 * and the vocabulary it is captured in, deliberately kept pure (no React
 * Native, no Zustand) so it compiles and tests under plain Node like the
 * rest of lib/.
 */

/** How much the person actually knows about the place they just scored. */
export type VerdictBasis =
  | 'been'   // went there, recently
  | 'known'  // knows it already, not a fresh visit
  | 'guess'; // hasn't been — an impression

/**
 * A guess is recorded but must not carry a visit's weight. Letting one
 * would reintroduce exactly the problem this whole project exists to
 * escape: an opinion formed from reputation rather than from the place.
 * Kept as a number rather than a filter because a guess is still real
 * signal about what someone EXPECTS, which is worth knowing.
 */
export const BASIS_WEIGHT: Record<VerdictBasis, number> = {
  been: 1,
  known: 0.6,
  guess: 0.25,
};

export const BASIS_LABEL: Record<VerdictBasis, string> = {
  been: 'Been recently',
  known: 'Know it already',
  guess: 'Just a guess',
};

/**
 * Where a reason can point. Similarity dimensions are the learnable ones
 * — a verdict citing them can adjust that person's weights directly.
 *
 * 'commute' is held by the app but is not a similarity dimension (it is
 * computed per person from journey times), so it is learnable through a
 * different route.
 *
 * 'none' is the honest case: we hold NO data for it. Safety and price are
 * the two big ones, and pretending otherwise is the exact failure the
 * Chiswick correction exposed (docs/data-sources.md) — the web app's
 * prompt claimed Met Police crime data that no code has ever fetched.
 * These reasons are still worth collecting: they tell us which signals to
 * go and find, and they stop the chip list quietly steering people into
 * only saying things we can already measure.
 */
export type ReasonTarget = Dimension | 'commute' | 'none';

export interface ReasonOption {
  id: string;
  /** What the chip says. Written as a person would say it, not as a field name. */
  label: string;
  /** Shown for a low score, a high score, or either. */
  polarity: 'negative' | 'positive';
  /** The measured dimensions this points at. Empty means we hold nothing. */
  targets: ReasonTarget[];
}

/**
 * Reasons for a LOW score. Every label is something someone would
 * actually say walking back to the station, not a category name.
 */
export const NEGATIVE_REASONS: ReasonOption[] = [
  {
    id: 'tooQuiet',
    label: 'Too quiet',
    polarity: 'negative',
    targets: ['peak', 'satNight', 'annualFootfall', 'drinkCount', 'venues'],
  },
  {
    id: 'tooBusy',
    label: 'Too busy',
    polarity: 'negative',
    targets: ['peak', 'satNight', 'annualFootfall', 'weekdayMorning'],
  },
  {
    id: 'nothingOpen',
    label: 'Nothing open',
    polarity: 'negative',
    targets: ['satNight', 'nightlifeRatio', 'drinkCount', 'barShare'],
  },
  {
    id: 'nowhereToEat',
    label: 'Nowhere we’d want to eat',
    polarity: 'negative',
    targets: ['sitdownShare', 'restaurantShare', 'cafeShare', 'cuisineCount', 'independentShare'],
  },
  {
    id: 'wrongCrowd',
    label: 'Not our sort of crowd',
    polarity: 'negative',
    targets: ['share20to34', 'shareUnder15', 'share65plus', 'sharePrivateRent', 'shareOwned'],
  },
  {
    id: 'wrongHouses',
    label: 'Wrong kind of houses',
    polarity: 'negative',
    targets: ['flatShare', 'houseShare', 'terraceShare', 'meanStoreys', 'newBuildShare'],
  },
  {
    id: 'tooFar',
    label: 'Further than it looked',
    polarity: 'negative',
    targets: ['commute'],
  },
  // ── The two we cannot measure. Kept deliberately. ──
  {
    id: 'feltUnsafe',
    label: 'Didn’t feel safe',
    polarity: 'negative',
    targets: ['none'],
  },
  {
    id: 'tooExpensive',
    label: 'Out of our price range',
    polarity: 'negative',
    targets: ['none'],
  },
];

/** Reasons for a HIGH score. */
export const POSITIVE_REASONS: ReasonOption[] = [
  {
    id: 'greatHighStreet',
    label: 'Great high street',
    polarity: 'positive',
    targets: ['independentShare', 'venues', 'cafeShare', 'restaurantShare'],
  },
  {
    id: 'rightBuzz',
    label: 'Buzzy in the right way',
    polarity: 'positive',
    targets: ['peak', 'satNight', 'weekendLean', 'nightlifeRatio'],
  },
  {
    id: 'goodPubs',
    label: 'Good pubs',
    polarity: 'positive',
    targets: ['drinkShare', 'drinkCount', 'barToPub'],
  },
  {
    id: 'goodFood',
    label: 'Good places to eat',
    polarity: 'positive',
    targets: ['restaurantShare', 'cuisineCount', 'sitdownShare', 'independentShare'],
  },
  {
    id: 'rightPeople',
    label: 'Felt like our sort of place',
    polarity: 'positive',
    targets: ['share20to34', 'shareUnder15', 'share65plus', 'sharePrivateRent', 'shareOwned'],
  },
  {
    id: 'likedHouses',
    label: 'Loved the houses',
    polarity: 'positive',
    targets: ['flatShare', 'houseShare', 'terraceShare', 'preWarShare', 'medianFloorArea'],
  },
  {
    id: 'calm',
    label: 'Calm without being dead',
    polarity: 'positive',
    targets: ['peak', 'satNight', 'annualFootfall'],
  },
  {
    id: 'easyCommute',
    label: 'Easy to get to work',
    polarity: 'positive',
    targets: ['commute'],
  },
];

const ALL_REASONS = [...NEGATIVE_REASONS, ...POSITIVE_REASONS];

const BY_ID = new Map(ALL_REASONS.map((r) => [r.id, r]));

export function reasonById(id: string): ReasonOption | undefined {
  return BY_ID.get(id);
}

/**
 * Ask "why" only at the extremes — Nick's call, 2026-08-27, and it is
 * right on both counts. A 6 says very little; a 0 says a great deal. And
 * keeping the second step rare is what stops it feeling like a form.
 */
export const LOW_EXTREME = 2;
export const HIGH_EXTREME = 9;

export function shouldAskWhy(score: number): boolean {
  return score <= LOW_EXTREME || score >= HIGH_EXTREME;
}

/** The chips to offer for a given score. Empty in the middle, by design. */
export function reasonsFor(score: number): ReasonOption[] {
  if (score <= LOW_EXTREME) return NEGATIVE_REASONS;
  if (score >= HIGH_EXTREME) return POSITIVE_REASONS;
  return [];
}

/** Whether we hold any measured signal a reason could actually teach. */
export function isLearnable(reason: ReasonOption): boolean {
  return reason.targets.some((t) => t !== 'none');
}

export interface Verdict {
  /** Neighbourhood name, matching the similarity engine's area keys. */
  area: string;
  /** Which member of the household said it — two people, two verdicts. */
  memberId: string;
  /** 0 (hated it) to 10 (loved it). Never defaulted — see SCORE_UNSET. */
  score: number;
  basis: VerdictBasis;
  /** Reason ids from the vocabulary above. Empty is valid — the score alone is a complete answer. */
  reasons: string[];
  /** Anything the chips could not hold. Optional, and usually empty. */
  note?: string;
  /** When it was given, ms since epoch. */
  at: number;
  /**
   * What the app had claimed about this area when it suggested it. Stored
   * WITH the verdict rather than looked up later, because the ranking
   * changes as preferences change — by the time anyone learns from this,
   * the reason the area was shown will no longer be reconstructable.
   */
  suggested?: {
    /** What the model gave the area when it put it forward. */
    score?: number;
    /** The sentence the app showed to justify it. */
    reason: string;
    confidence?: string;
  };
}

/**
 * A slider that starts parked at 5 records an opinion nobody gave, and
 * would quietly poison the data (docs/learning-loop.md). So "no score
 * yet" needs to be representable, and it is not a number.
 */
export const SCORE_UNSET = null;
export type Score = number | null;

export const MIN_SCORE = 0;
export const MAX_SCORE = 10;

/** Stable key for storing one person's verdict on one area. */
export function verdictKey(area: string, memberId: string): string {
  return `${area}|${memberId}`;
}

/**
 * Firebase keys cannot contain . $ # [ ] or /, and London has areas like
 * "Shepherd's Bush" and "King's Cross" — mirrors the web app's own
 * AuthManager.sanitizeAreaKey rather than inventing a second scheme.
 */
export function sanitiseAreaKey(area: string): string {
  return area.replace(/[.$#[\]/]/g, '_');
}

export function isValidScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isInteger(score) && score >= MIN_SCORE && score <= MAX_SCORE;
}

/** Guards what reaches storage — a malformed verdict is worse than none. */
export function isValidVerdict(v: unknown): v is Verdict {
  if (!v || typeof v !== 'object') return false;
  const c = v as Verdict;
  return (
    typeof c.area === 'string' && c.area.length > 0 &&
    typeof c.memberId === 'string' && c.memberId.length > 0 &&
    isValidScore(c.score) &&
    (c.basis === 'been' || c.basis === 'known' || c.basis === 'guess') &&
    Array.isArray(c.reasons) && c.reasons.every((r) => typeof r === 'string') &&
    typeof c.at === 'number' && c.at > 0
  );
}

/**
 * How much a verdict should count. Basis is the whole of it today; when
 * Level 1 learning arrives, recency belongs here too (an opinion from
 * eighteen months ago is about a different high street).
 */
export function verdictWeight(v: Verdict): number {
  return BASIS_WEIGHT[v.basis];
}

/**
 * Everything one household has said about an area, in the order it was
 * said. Two people disagreeing is interesting in itself — "Harriet gave
 * it 8, you gave it 4" — so this never averages them away.
 */
export function verdictsForArea(verdicts: Verdict[], area: string): Verdict[] {
  return verdicts.filter((v) => v.area === area).sort((a, b) => a.at - b.at);
}
