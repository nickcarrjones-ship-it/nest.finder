/**
 * What people ask that we cannot answer, sent where the owner can read it.
 *
 * Nick's requirement (2026-09-07): "I need to understand if patterns pop up
 * where people are asking questions the model is lacking, so we can enhance
 * it over time" — a data roadmap driven by real demand rather than by
 * guesswork about what a house-hunter wants. And explicitly NOT a user
 * feature: this is owner tooling, so it goes to Firebase and is read in the
 * console, not shown in the app.
 *
 * WHAT IS DELIBERATELY NOT SENT: the question. Not the wording, not a
 * paraphrase, not a user id. "Eleven questions hit an area where we hold no
 * crime data" is the finding; which eleven, and how they phrased it, adds
 * nothing and would turn a counter into a pile of personal data needing a
 * lawful basis, a purpose declared before collection, and a retention
 * policy. Aggregate by construction is the cheapest way to stay on the
 * right side of that — you cannot leak what you never held, and
 * database.rules.json enforces the shape so a later client cannot quietly
 * widen it.
 *
 * Append-only and unreadable by any client, the same trust shape as the
 * waitlist node: a row can be added, never edited, never read back.
 *
 * PURE, with the write in lib/dataGapSync.ts — the same split as
 * verdicts.ts and verdictSync.ts, and for the same reason: importing
 * ./firebase here would drag React Native into a plain-Node test and make
 * the one thing worth testing, the row SHAPE, untestable.
 */

export interface DataGapRow {
  area: string;
  missing: string[];
  fellBack: boolean;
}

/** Kept in step with the rules, which reject anything longer. */
const MAX_AREA = 80;
const MAX_SUBJECT = 60;
/** A cap on how much one question can report, so a malformed brief cannot
 *  turn into an unbounded write. */
const MAX_SUBJECTS = 12;

/** The row as it will be stored — pure, so the shape can be tested without
 *  a network or a signed-in user. */
export function gapRow(area: string, missing: string[], fellBack: boolean): DataGapRow | null {
  const cleanArea = area.trim().slice(0, MAX_AREA);
  if (!cleanArea) return null;
  const cleanMissing = missing
    .filter((m) => typeof m === 'string' && m.trim().length > 0)
    .map((m) => m.trim().slice(0, MAX_SUBJECT))
    .slice(0, MAX_SUBJECTS);
  // Nothing missing and no fallback is a question we answered properly.
  // Worth counting as the denominator — without it a rising gap count could
  // just mean rising use — so it is still a row, just an empty-handed one.
  return { area: cleanArea, missing: cleanMissing, fellBack };
}
