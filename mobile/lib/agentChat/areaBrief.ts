import type { JourneyTimes, Profile } from '../types';
import { describeArea } from '../similarity/describe';
import { dimensionsFor } from '../similarity/describe';
import { compare, weightsFromPreference } from '../similarity/similar';
import { allAreaNames } from '../similarity/features';
import { findAnchors } from '../ranking/anchor';
import { traitsSentence } from '../similarity/dimensionLabels';
import { riverSideOf } from '../ranking/river';
import zone1 from '../../assets/data/zone1-stations.json';
import { joinWords } from '../conversationSummary';

/**
 * Everything we actually KNOW about one area, for answering "what about
 * Fulham?".
 *
 * The point of this file is that almost none of the answer is the model's
 * to invent. The commute is arithmetic, the river is geometry, the
 * resemblance to the areas they love is the similarity engine, and the
 * character comes from describeArea — which is built on the rule that there
 * are no adjectives we cannot defend ("trendy" is not in the data; the
 * share of residents aged 20 to 34 is).
 *
 * The model's job is to read this brief and write it up against what the
 * household said they wanted. It is not asked what it knows about Fulham,
 * because what a language model recalls about a London neighbourhood is
 * exactly the vague second-hand impression this whole app exists to
 * replace.
 *
 * Gaps travel WITH the brief for the same reason describeArea reports them:
 * a model told what is missing is far less likely to invent it.
 */

const ZONE1 = new Set<string>(zone1.stations);

/** First words that are ordinary English before they are place names, so a
 *  sentence using them normally is not read as naming somewhere. */
const TOO_COMMON = new Set([
  'north', 'south', 'east', 'west', 'upper', 'lower', 'new', 'old', 'great',
  'little', 'high', 'green', 'park', 'royal', 'white', 'kings', 'queens',
  'castle', 'church', 'mill', 'bank', 'temple', 'angel', 'oval', 'elephant',
]);

export interface AreaBrief {
  area: string;
  /** Measured facts, each traceable to a number. */
  facts: string[];
  /** What we hold nothing on. Stated, never guessed around. */
  missing: string[];
  /** How it compares to each area they said they love. */
  resemblance: { anchor: string; score: number; traits: string }[];
  riverSide?: 'north' | 'south';
  inZone1: boolean;
  /** Slowest member's door-to-desk minutes, when we can work it out. */
  commuteMins?: number;
  /** Where it clashes with something they already told us. */
  conflicts: string[];
}

/**
 * The area being asked about, if the message names one we hold data for.
 *
 * Two passes, because Londoners do not say station names. "What about
 * Fulham?" names no area we hold — the area is "Fulham Broadway" — so a
 * plain substring search finds nothing, which was the first thing this got
 * wrong.
 *
 * The second pass therefore accepts a bare word that matches exactly ONE
 * compound name. anchor.ts refuses to do that when picking an ANCHOR, for a
 * good reason: "Liverpool" matches Liverpool Street, so someone moving down
 * from Liverpool was silently anchored to a station in the City and every
 * suggestion afterwards was confidently wrong.
 *
 * The risk is not the same here, which is why the answer differs. An anchor
 * is invisible and poisons everything downstream; an ANSWER is read
 * immediately and names the area it is about, so the same mistake shows up
 * as one obviously odd reply rather than a silently ruined shortlist. A
 * visible wrong answer is recoverable. A silent one is not.
 *
 * Genuinely ambiguous words are still refused: "Clapham" could be the
 * Common, the High Street or the Junction, and those are different places
 * with different answers. The existing clarification flow handles that.
 */
export function areaAskedAbout(text: string): string | null {
  const known = allAreaNames();
  const haystack = text.toLowerCase();

  // Longest first, so "Clapham Common" is never swallowed by "Clapham".
  for (const name of [...known].sort((a, b) => b.length - a.length)) {
    if (haystack.includes(name.toLowerCase())) return name;
  }

  const words = haystack.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !TOO_COMMON.has(w));
  for (const w of words) {
    // The FIRST word only. Matching the last as well read "somewhere
    // quieter with a garden" as Covent Garden — London place names end in
    // ordinary English (Garden, Park, Green, Cross, Bridge, Common), and
    // those words turn up in sentences that are not about places at all.
    // First words are the distinctive half: Fulham, Peckham, Tooting.
    const matches = known.filter((n) => {
      const parts = n.toLowerCase().split(/\s+/);
      return parts.length > 1 && parts[0] === w;
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export function buildAreaBrief(
  area: string,
  profile: Profile | null,
  journeyTimes?: JourneyTimes,
): AreaBrief {
  const { facts, missing } = describeArea(area);
  const ls = profile?.lifestyle;

  // How much like the places they already love is it? Weighted by what they
  // said they liked, so "the Common and the coffee shops" and "the bars on a
  // Friday" do not produce the same comparison.
  const weights = weightsFromPreference(
    [ls?.anchorReason, ...(ls?.preferenceTags ?? [])].filter(Boolean).join(' '),
  );
  const target = dimensionsFor(area);
  const resemblance = findAnchors(profile?.areaCards)
    .filter((a) => a !== area)
    .map((anchor) => {
      const { score, traits } = compare(dimensionsFor(anchor), target, weights);
      return { anchor, score, traits: traitsSentence(traits) };
    })
    .sort((a, b) => b.score - a.score);

  const side = riverSideOf(area);
  const inZone1 = ZONE1.has(area);

  let commuteMins: number | undefined;
  const members = profile?.members ?? [];
  if (journeyTimes && members.length > 0) {
    const times = members.map((m) => journeyTimes[area]?.[m.workId]);
    // The binding commute is the SLOWEST member's, not the average — an area
    // that works brilliantly for one person and not at all for the other
    // does not work.
    if (times.every((t) => typeof t === 'number')) {
      commuteMins = Math.max(...(times as number[])) + Math.max(...members.map((m) => m.offWalk ?? 0));
    }
  }

  /**
   * Where it contradicts something they already said. Computed here rather
   * than left to the model, because these are the answers most worth being
   * certain about — "you told me south of the river" is either true or it
   * isn't, and a model hedging it is worse than useless.
   */
  const conflicts: string[] = [];
  if (side && ls?.riverSide && ls.riverSide !== 'either' && ls.riverSide !== side) {
    conflicts.push(`they asked for ${ls.riverSide} of the river; this is ${side}`);
  }
  if (inZone1 && ls?.zone1Ok === false) {
    conflicts.push('they ruled out Zone 1; this is in Zone 1');
  }
  const maxMins = profile?.maxCommuteMins;
  if (commuteMins && maxMins && commuteMins > maxMins) {
    conflicts.push(`their commute limit is ${maxMins} minutes; this is about ${commuteMins}`);
  }
  if ((profile?.areaCards ?? {})[area] === 'hate') {
    conflicts.push('they previously ruled this area out themselves');
  }

  return { area, facts, missing, resemblance, riverSide: side, inZone1, commuteMins, conflicts };
}

/** The brief as the text the model is given. Plain lines, no JSON: it is
 *  being read, not parsed. */
export function briefForPrompt(b: AreaBrief): string {
  const lines: string[] = [`AREA: ${b.area}`];
  if (b.commuteMins) lines.push(`Commute (slowest member, door to desk): about ${b.commuteMins} minutes`);
  if (b.riverSide) lines.push(`River: ${b.riverSide} of the Thames`);
  lines.push(`Zone 1: ${b.inZone1 ? 'yes' : 'no'}`);
  if (b.facts.length) lines.push(`Measured character: ${b.facts.join('; ')}`);
  if (b.resemblance.length) {
    lines.push(
      `Resemblance to areas they love: ${b.resemblance
        .map((r) => `${r.anchor} ${(r.score * 100).toFixed(0)}%${r.traits ? ` (closest on ${r.traits})` : ''}`)
        .join(', ')}`,
    );
  }
  if (b.conflicts.length) lines.push(`CONFLICTS WITH WHAT THEY TOLD US: ${joinWords(b.conflicts)}`);
  if (b.missing.length) lines.push(`WE HOLD NO DATA ON: ${b.missing.join('; ')}`);
  return lines.join('\n');
}
