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

/**
 * What one person made of an area, in three words.
 *
 * It was a 0-10 slider until 2026-09-02, when Nick called it: "the
 * drag-to-score is too many options... it doesn't really help". He is
 * right, and the reason is worth writing down — eleven points implied a
 * precision nobody has walking back to the station. The real question a
 * household is answering is "would we live here", and that has three
 * honest answers.
 *
 * Three tiers also make the DISAGREEMENT legible, which is what the
 * shortlist ranks on (lib/verdictRank.ts). "Harriet loved it, you said not
 * for us" is a sentence; "Harriet 8, you 4" needed interpreting first.
 */
export type Tier = 'not_for_us' | 'maybe' | 'loved_it';

/** What each tier says on the pill. The arrows are part of the label:
 *  they carry the sense of a scale that the old slider track used to. */
export const TIER_LABEL: Record<Tier, string> = {
  not_for_us: '← Not for us',
  maybe: 'Maybe',
  loved_it: 'Loved it →',
};

/** The same three without the arrows, for anywhere they are read back
 *  rather than pressed — a shortlist row, a summary line. */
export const TIER_SHORT: Record<Tier, string> = {
  not_for_us: 'Not for us',
  maybe: 'Maybe',
  loved_it: 'Loved it',
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
 * right on both counts. A shrug says very little; a flat no says a great
 * deal. Keeping the second step rare is what stops it feeling like a form.
 *
 * Under the old 0-10 scale this was "at or below 2, at or above 9". The
 * three tiers say the same thing more directly: ask at both ends, never in
 * the middle.
 */
export function shouldAskWhy(tier: Tier): boolean {
  return tier !== 'maybe';
}

/** The chips to offer for a given tier. Empty in the middle, by design. */
export function reasonsFor(tier: Tier): ReasonOption[] {
  if (tier === 'not_for_us') return NEGATIVE_REASONS;
  if (tier === 'loved_it') return POSITIVE_REASONS;
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
  /** Never defaulted — see TIER_UNSET. */
  tier: Tier;
  /** Reason ids from the vocabulary above. Empty is valid — the tier alone is a complete answer. */
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
 * A control that starts on a default records an opinion nobody gave, and
 * would quietly poison the data (docs/learning-loop.md). So "nothing said
 * yet" has to be representable, and it is not one of the three tiers —
 * hence no pill is pre-selected, exactly as the old slider started with no
 * handle parked at 5.
 */
export const TIER_UNSET = null;
export type DraftTier = Tier | null;

const TIERS: Tier[] = ['not_for_us', 'maybe', 'loved_it'];

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

export function isValidTier(tier: unknown): tier is Tier {
  return typeof tier === 'string' && (TIERS as string[]).includes(tier);
}

/**
 * Guards what reaches storage — a malformed verdict is worse than none.
 *
 * This is also the whole migration story for the verdicts written under
 * the old 0-10 scale: they carry a `score` and no `tier`, so they fail
 * here and loadVerdicts drops them, which is already what that function
 * does with anything it cannot trust. No conversion, deliberately — a
 * 6/10 does not mean "maybe" reliably enough to put words in someone's
 * mouth, and there is no real corpus at stake yet.
 */
export function isValidVerdict(v: unknown): v is Verdict {
  if (!v || typeof v !== 'object') return false;
  const c = v as Verdict;
  return (
    typeof c.area === 'string' && c.area.length > 0 &&
    typeof c.memberId === 'string' && c.memberId.length > 0 &&
    isValidTier(c.tier) &&
    Array.isArray(c.reasons) && c.reasons.every((r) => typeof r === 'string') &&
    typeof c.at === 'number' && c.at > 0
  );
}

/**
 * Everything one household has said about an area, in the order it was
 * said. Two people disagreeing is interesting in itself — "Harriet loved
 * it, you said not for us" — so this never averages them away. The
 * shortlist's ranking (lib/verdictRank.ts) combines them for ORDERING
 * without ever losing the individual answers.
 */
export function verdictsForArea(verdicts: Verdict[], area: string): Verdict[] {
  return verdicts.filter((v) => v.area === area).sort((a, b) => a.at - b.at);
}
