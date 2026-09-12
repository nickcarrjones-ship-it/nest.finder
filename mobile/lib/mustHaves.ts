/**
 * The things a household will not compromise on, in the order they matter.
 *
 * PURE — no React Native, no Firebase — so every rule below is testable
 * under plain Node, the same split viewings.ts and verdicts already use.
 *
 * The ORDER IS THE WEIGHTING. There are no sliders, no percentages and no
 * "how important is this, 1 to 5" — a household drags their top thing to
 * the top and that is the whole input. Ranking a list is something people
 * can actually do; assigning numbers to their own preferences is something
 * they do badly and inconsistently, and then argue about.
 */

export interface MustHave {
  id: string;
  /** In their words — "no renovation needed", "double garden". */
  text: string;
  createdAt: number;
}

/**
 * What a household said about one property, keyed by must-have id.
 *
 * THREE states, not two: true (it has it), false (it doesn't), and ABSENT
 * (nobody has said yet). Absent is the common one — someone standing in a
 * flat ticks the four things they can see and leaves the rest — and it is
 * deliberately not stored as a cross. See `assess` for why that matters.
 */
export type Checks = Record<string, boolean>;

export function newMustHaveId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeMustHave(text: string, now = Date.now()): MustHave {
  return { id: newMustHaveId(), text: text.trim(), createdAt: now };
}

export function isValidMustHave(candidate: unknown): candidate is MustHave {
  if (!candidate || typeof candidate !== 'object') return false;
  const m = candidate as Partial<MustHave>;
  return (
    typeof m.id === 'string' && m.id.length > 0 &&
    typeof m.text === 'string' && m.text.trim().length > 0 &&
    typeof m.createdAt === 'number'
  );
}

/** The cap exists so the weighting stays meaningful: past about twenty,
 *  the bottom item is worth a rounding error and the list is really a wish
 *  list rather than a set of must-haves. */
export const MAX_MUST_HAVES = 20;

/**
 * Moves one must-have up or down by a single place.
 *
 * Returns the SAME array reference when nothing moved (already top, already
 * bottom, not found), so a screen can skip a re-render and a sync rather
 * than writing an identical list back to Firebase on every stray tap.
 */
export function moveMustHave(list: MustHave[], id: string, direction: -1 | 1): MustHave[] {
  const from = list.findIndex((m) => m.id === id);
  if (from === -1) return list;
  const to = from + direction;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * What each position is worth: the top of a list of N counts N times as
 * much as the bottom, falling by one at each step.
 *
 * Linear, and chosen over the alternatives on purpose. Halving at each step
 * makes everything below about fifth place worth nothing, so a household
 * who listed twelve things is really being scored on four. A flat weighting
 * ignores the ranking they just spent time on. Linear is also the only one
 * of the three that can be said in a sentence someone believes — "your
 * first counts N times as much as your last" — and a score nobody believes
 * does not get used.
 */
export function weightsFor(count: number): number[] {
  return Array.from({ length: count }, (_, i) => count - i);
}

export interface Assessment {
  /**
   * Out of 10, or NULL when nothing has been answered yet.
   *
   * Null rather than 0, for the same reason a POA flat has a null price
   * rather than a free one: "we haven't looked" and "it has none of what
   * we wanted" are opposite findings and must never sort together.
   */
  score: number | null;
  /** How many of the must-haves have been answered either way. */
  answered: number;
  total: number;
  met: number;
  /**
   * True when too little has been answered for the score to mean much.
   *
   * The score is calculated over the ANSWERED must-haves only — an
   * unanswered one is not counted as a failure, because nobody said it
   * failed. That is the honest reading, but it has a sharp edge: tick one
   * thing and walk out and the property scores 10. So the shortfall is
   * shown rather than hidden, and this flag is what the card uses to say
   * so out loud instead of quietly ranking a half-filled card first.
   */
  provisional: boolean;
}

/** Below this share of the list answered, a score is shown as provisional. */
const CONFIDENT_COVERAGE = 0.5;

export function assess(mustHaves: MustHave[], checks: Checks | null | undefined): Assessment {
  const weights = weightsFor(mustHaves.length);
  let answeredWeight = 0;
  let metWeight = 0;
  let answered = 0;
  let met = 0;

  mustHaves.forEach((mustHave, i) => {
    const value = checks?.[mustHave.id];
    // Only a real boolean counts. A must-have added after this property was
    // viewed, or one deleted since, simply is not in this sum — the list is
    // the source of truth, and old keys left in `checks` are ignored rather
    // than migrated.
    if (typeof value !== 'boolean') return;
    answered += 1;
    answeredWeight += weights[i];
    if (value) {
      met += 1;
      metWeight += weights[i];
    }
  });

  const total = mustHaves.length;
  if (answered === 0) {
    return { score: null, answered: 0, total, met: 0, provisional: total > 0 };
  }

  // One decimal place. Two invites a household to argue about a tenth of a
  // point between two flats they should be comparing on their merits.
  const score = Math.round((metWeight / answeredWeight) * 100) / 10;
  return {
    score,
    answered,
    total,
    met,
    provisional: total > 0 && answered / total < CONFIDENT_COVERAGE,
  };
}

/** "8.4", or "7" where the decimal adds nothing. Null stays null — the
 *  caller decides what "not scored yet" should say, not this. */
export function formatScore(score: number | null): string | null {
  if (score === null) return null;
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/**
 * How the seen properties are ordered: best first.
 *
 * A property nobody has scored goes to the BOTTOM rather than the top or
 * the middle — it is not a bad property, it is an unanswered question, and
 * the list's whole job is to answer "which was best". Between two equal
 * scores the more thoroughly checked one wins, because it is the one they
 * know more about.
 */
export function rankByScore<T extends { viewingAt: number | null; checks?: Checks | null }>(
  items: T[],
  mustHaves: MustHave[],
): T[] {
  const scored = items.map((item) => ({ item, assessment: assess(mustHaves, item.checks) }));
  scored.sort((a, b) => {
    const sa = a.assessment.score;
    const sb = b.assessment.score;
    if (sa === null && sb === null) return (b.item.viewingAt ?? 0) - (a.item.viewingAt ?? 0);
    if (sa === null) return 1;
    if (sb === null) return -1;
    if (sb !== sa) return sb - sa;
    if (b.assessment.answered !== a.assessment.answered) {
      return b.assessment.answered - a.assessment.answered;
    }
    return (b.item.viewingAt ?? 0) - (a.item.viewingAt ?? 0);
  });
  return scored.map((s) => s.item);
}

/** How many of the list have been answered, as a sentence rather than a
 *  fraction someone has to interpret. Null when there is nothing to say. */
export function describeCoverage(assessment: Assessment): string | null {
  if (assessment.total === 0) return null;
  if (assessment.answered === 0) return 'Not checked off yet';
  if (assessment.answered === assessment.total) return `All ${assessment.total} checked`;
  return `${assessment.answered} of ${assessment.total} checked`;
}
