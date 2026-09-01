/**
 * How close a match is, in a word.
 *
 * A percentage was shown here and it was the wrong unit for the job (Nick,
 * 2026-09-01). "71%" invites a precision the number does not have — it is a
 * standardised distance across 35 dimensions, not a probability — and
 * nobody reads it as anything except a mark out of a hundred, which makes
 * a perfectly good suggestion look like a C grade.
 *
 * The bands come from the observed spread rather than from round numbers.
 * A real run over a real profile produces scores clustered between 0.57 and
 * 0.71, because everything reaching this point has already survived the
 * commute filter and the similarity ranking — so 0.60 is a good match in
 * this population, not a mediocre one, and the labels have to say that.
 */

export type MatchStrength = 'strong' | 'potential' | 'loose';

const STRONG = 0.65;
const POTENTIAL = 0.55;

export function matchStrength(score: number): MatchStrength {
  if (score >= STRONG) return 'strong';
  if (score >= POTENTIAL) return 'potential';
  return 'loose';
}

/** What each band is called on screen. */
export const STRENGTH_LABEL: Record<MatchStrength, string> = {
  strong: 'Strong match',
  potential: 'Potential',
  // Not hidden and not dressed up. Everything on this list is worth
  // showing, but saying so at the same volume as a strong match would be
  // the dishonest choice.
  loose: 'Worth a look',
};
