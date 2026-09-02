/**
 * A colour for a judgement written as free text.
 *
 * Built for Ofsted's ungraded checks ("School remains Good (Concerns) -
 * S5 Next"), which are prose, not a fixed enum — so this reads for
 * keywords rather than matching exactly. ORDER MATTERS: 'concern' is
 * checked before 'good' so "remains Good (Concerns)" lands as mixed, not
 * good — the whole reason the text is scanned rather than the headline
 * word alone.
 *
 * Shares its colour TOKENS with WhyThisArea's match badge (green/amber/
 * red), not its vocabulary — match strength has no 'concern', because
 * nothing on a suggestion list is a warning. An Inadequate school
 * genuinely is one, so this scale needs the word WhyThisArea deliberately
 * left out.
 */

export type Tone = 'good' | 'mixed' | 'concern';

export function toneFor(text: string): Tone {
  const t = text.toLowerCase();
  if (t.includes('inadequate') || t.includes('urgent improvement') || t.includes('not met')) return 'concern';
  if (
    t.includes('requires improvement') ||
    t.includes('needs attention') ||
    t.includes('concern') ||
    t.includes('not as strong')
  ) return 'mixed';
  return 'good';
}
