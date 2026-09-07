import type { AreaCards, Lifestyle, Profile } from './types';
import { joinWords } from './conversationSummary';

/**
 * A profile change the Agent has read out of a conversation but NOT applied.
 *
 * Until 2026-09-07 anything said to the Agent rewrote the profile the
 * instant the model parsed it, which silently re-ranked the map. That is
 * right during setup — the whole point of those three questions is to build
 * the profile — and wrong every time afterwards: asking "what about
 * Fulham?" is a question, not an instruction, and answering it by quietly
 * reordering someone's shortlist is the app putting words in their mouth
 * (Nick, 2026-09-07).
 *
 * So after setup, changes are held here and described back in plain English
 * for a yes or no. The map moves when they say so, not when the model
 * finishes parsing.
 */

/**
 * Whether a change actually moves the map, or is only recorded.
 *
 * This distinction is not cosmetic. Only some preferences reach the
 * arithmetic: loved areas become anchors, ruled-out areas and Zone 1 and
 * the river are hard filters, and the reason and tags weight the similarity
 * engine. The rest — evenings, green space, schools, safety, dealbreakers —
 * reach only lib/ranking/prompt.ts, as a line of text for the model that
 * writes the descriptive sentence. And since an anchored household is now
 * ORDERED by the similarity engine rather than by the model, those fields
 * change no ordering at all.
 *
 * A card headed "Update your map?" that lists "Schools matter one day" is
 * therefore promising something it cannot deliver (Nick asked what it would
 * actually do, 2026-09-07 — the honest answer was "almost nothing"). Saying
 * so is the whole point of a confirmation step; a confirm card that
 * overstates its own effect is worse than none.
 */
export type ChangeEffect = 'ranking' | 'noted';

export interface DescribedChange {
  text: string;
  effect: ChangeEffect;
}

export interface PendingChange {
  lifestyle: Partial<Lifestyle>;
  areaCards: AreaCards;
  /** One line per change, already in English, for the confirm card. */
  described: DescribedChange[];
  /** True when at least one change actually reorders or filters the map. */
  movesMap: boolean;
}

const VIBE: Record<string, string> = {
  buzzy: 'somewhere with a buzz',
  quiet: 'somewhere quiet',
  village: 'a village feel',
};
const NIGHTS: Record<string, string> = {
  frequent: 'out often',
  regular: 'out now and then',
  rarely: 'mostly nights in',
};
const GREEN: Record<string, string> = {
  essential: 'green space is essential',
  nice: 'green space is a bonus',
  unimportant: 'green space is not a priority',
};
const CIRCLE: Record<string, string> = {
  N: 'north London', E: 'east London', S: 'south London', W: 'west London',
};

/**
 * Only what is genuinely NEW is worth confirming.
 *
 * The model restates its whole understanding on every turn — it is told to,
 * so nothing gets dropped — which means most of what comes back is
 * unchanged. Showing "you love Tooting" as a proposed change every time
 * someone says anything would train people to dismiss the card without
 * reading it, and the one time it mattered they would dismiss that too.
 */
export function describeChange(
  current: Profile | null,
  lifestyle: Partial<Lifestyle>,
  areaCards: AreaCards,
): PendingChange | null {
  const nowLs = current?.lifestyle ?? {};
  const nowCards = current?.areaCards ?? {};

  const newLs: Partial<Lifestyle> = {};
  const newCards: AreaCards = {};
  const described: DescribedChange[] = [];

  for (const [name, verdict] of Object.entries(areaCards)) {
    if (nowCards[name] === verdict) continue;
    newCards[name] = verdict;
    described.push({
      text: verdict === 'love' ? `Add ${name} to the areas you like` : `Rule out ${name}`,
      effect: 'ranking',
    });
  }

  const say = (key: keyof Lifestyle, text: string, effect: ChangeEffect) => {
    newLs[key] = lifestyle[key] as never;
    described.push({ text, effect });
  };

  if (lifestyle.streetVibe && lifestyle.streetVibe !== nowLs.streetVibe) {
    say('streetVibe', `You're after ${VIBE[lifestyle.streetVibe]}`, 'noted');
  }
  if (lifestyle.nightsOut && lifestyle.nightsOut !== nowLs.nightsOut) {
    say('nightsOut', `Evenings: ${NIGHTS[lifestyle.nightsOut]}`, 'noted');
  }
  if (lifestyle.greenSpace && lifestyle.greenSpace !== nowLs.greenSpace) {
    say('greenSpace', GREEN[lifestyle.greenSpace], 'noted');
  }
  if (lifestyle.riverSide && lifestyle.riverSide !== nowLs.riverSide) {
    say('riverSide', lifestyle.riverSide === 'either'
      ? 'Either side of the river'
      : `${lifestyle.riverSide === 'north' ? 'North' : 'South'} of the river`, 'ranking');
  }
  if (typeof lifestyle.zone1Ok === 'boolean' && lifestyle.zone1Ok !== nowLs.zone1Ok) {
    say('zone1Ok', lifestyle.zone1Ok ? 'Zone 1 is fine' : 'Rule out Zone 1', 'ranking');
  }
  if (lifestyle.socialCircle && lifestyle.socialCircle !== nowLs.socialCircle) {
    say('socialCircle', `Your people are mostly in ${CIRCLE[lifestyle.socialCircle]}`, 'noted');
  }
  if (lifestyle.schoolsPriority && lifestyle.schoolsPriority !== nowLs.schoolsPriority) {
    say('schoolsPriority', lifestyle.schoolsPriority === 'no'
      ? 'Schools are not a factor'
      : `Schools matter ${lifestyle.schoolsPriority === 'now' ? 'now' : 'one day'}`, 'noted');
  }
  if (lifestyle.schoolPhase && lifestyle.schoolPhase !== nowLs.schoolPhase) {
    say('schoolPhase', lifestyle.schoolPhase === 'both'
      ? 'Primary and secondary schools both matter'
      : `${lifestyle.schoolPhase === 'primary' ? 'Primary' : 'Secondary'} schools are the ones that matter`,
      // Changes which schools the Agent leads with, not which areas rank.
      'noted');
  }
  if (typeof lifestyle.considerFeePaying === 'boolean'
      && lifestyle.considerFeePaying !== nowLs.considerFeePaying) {
    say('considerFeePaying', lifestyle.considerFeePaying
      ? 'Open to fee-paying schools'
      : 'State schools only', 'noted');
  }
  if (lifestyle.anchorReason && lifestyle.anchorReason.trim() !== (nowLs.anchorReason ?? '').trim()) {
    say('anchorReason', `What you like: “${lifestyle.anchorReason.trim()}”`, 'ranking');
  }

  const newDealbreakers = (lifestyle.dealbreakers ?? [])
    .filter((d) => !(nowLs.dealbreakers ?? []).includes(d));
  if (newDealbreakers.length) {
    newLs.dealbreakers = [...(nowLs.dealbreakers ?? []), ...newDealbreakers];
    described.push({ text: `Rule out ${joinWords(newDealbreakers)}`, effect: 'noted' });
  }

  // preferenceTags steer the search but are never shown as their own line:
  // they are the machine-readable form of anchorReason, and listing them
  // would be the same change described twice, once in words nobody uses.
  if (lifestyle.preferenceTags?.length) {
    const before = (nowLs.preferenceTags ?? []).join('|');
    if (lifestyle.preferenceTags.join('|') !== before) {
      newLs.preferenceTags = lifestyle.preferenceTags;
    }
  }

  if (described.length === 0) return null;
  return {
    lifestyle: newLs,
    areaCards: newCards,
    described,
    movesMap: described.some((d) => d.effect === 'ranking'),
  };
}
