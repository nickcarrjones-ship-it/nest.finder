import type { Member } from './types';
import { type Tier, type Verdict } from './verdicts';

/**
 * Ranking the areas a household has actually been to.
 *
 * Nick's brief, 2026-09-02, with his own worked examples. Two people:
 *
 *   both loved it        >  one loved it, one maybe
 *                        >  two maybes
 *                        >  one loved it, one not for us
 *                        >  two not for us
 *
 * The third line is the one that decides the whole design, and it was
 * called out as the crucial case: a SPLIT — one person in love, the other
 * ruling it out — has to rank BELOW two people who both merely shrugged.
 * Averaging alone cannot produce that, because both come to the same mean.
 * A household does not move somewhere one of them has vetoed, however
 * strongly the other feels; two lukewarm yeses is a place you might
 * actually end up living.
 *
 * So the score is the average MINUS a penalty for how far apart the
 * household is:
 *
 *   net = mean(tier values) − DISAGREEMENT × spread(tier values)
 *
 * Everyone counts equally, whatever the household size — Nick's "the
 * weighting just needs to be even across all of the people in the house".
 */

/** −1 / 0 / +1 rather than 0/1/2 so that "maybe" sits at true neutral and
 *  the mean of a split is zero, which is what makes the penalty below the
 *  only thing separating a split from a shrug. */
export const TIER_VALUE: Record<Tier, number> = {
  not_for_us: -1,
  maybe: 0,
  loved_it: 1,
};

/**
 * How hard disagreement is punished. Any value between 0 and 1 satisfies
 * Nick's ordering; 0.5 is picked for being the middle of that range and
 * for the numbers it produces on the two-person cases, which are clean
 * enough to reason about out loud: 1, 0.25, 0, −0.5, −1.
 *
 * Below 0 it would REWARD disagreement; at 1 or above, a split would fall
 * below two flat noes, which is too far — a place one of you loved is not
 * worse than a place neither of you could stand.
 */
export const DISAGREEMENT = 0.5;

export interface MemberTier {
  memberId: string;
  /** Denormalised so a card can print "Harriet" without a second lookup. */
  name: string;
  tier: Tier;
}

export interface AreaRanking {
  area: string;
  /** What the list sorts on. Runs from +1 (everyone loved it) to −1. */
  net: number;
  mean: number;
  /** 0 when the household agrees exactly. */
  spread: number;
  /** Who said what, in household order — never collapsed into the score. */
  byMember: MemberTier[];
  /** Household members who have not said anything about this area yet. */
  awaiting: string[];
}

/** Population standard deviation — the household IS the population here,
 *  not a sample of one, so there is no n−1 correction to make. */
function spreadOf(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Standard deviation rather than the simpler max-minus-min, and the
 * difference only shows up past two people — which is exactly where it
 * matters. In a four-person household, "three loved it, one didn't" and a
 * flat two-two split have the same max and min, so a range would punish
 * them identically. A deviation knows that one holdout in four is not the
 * same disagreement as half the house, and scores it accordingly.
 */
export function scoreTiers(values: number[]): { mean: number; spread: number; net: number } {
  if (values.length === 0) return { mean: 0, spread: 0, net: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = spreadOf(values);
  return { mean, spread, net: mean - DISAGREEMENT * spread };
}

/**
 * Every area anyone in the household has given a verdict on, best first.
 *
 * Areas with NO verdict are absent entirely rather than ranked at zero:
 * the shortlist is the record of where they have actually been, so it
 * fills up as they go, and an unvisited area sitting mid-table would be
 * making a claim nobody made.
 *
 * A partly-scored area still ranks, on whoever has spoken so far, with the
 * rest named in `awaiting`. Waiting for the whole household before showing
 * anything would leave the tab empty for exactly as long as it is most
 * useful — the evening after one of them has been for a look.
 */
export function rankAreas(verdicts: Verdict[], members: Member[]): AreaRanking[] {
  const byArea = new Map<string, Verdict[]>();
  for (const v of verdicts) {
    const list = byArea.get(v.area);
    if (list) list.push(v);
    else byArea.set(v.area, [v]);
  }

  const rankings: AreaRanking[] = [];
  for (const [area, given] of byArea) {
    // Household order, not the order the verdicts happened to arrive in,
    // so the same two people appear in the same order on every card.
    const byMember: MemberTier[] = [];
    const awaiting: string[] = [];
    for (const member of members) {
      const said = given.find((v) => v.memberId === member.id);
      if (said) byMember.push({ memberId: member.id, name: member.name, tier: said.tier });
      else awaiting.push(member.name);
    }
    // A verdict from someone no longer in the household (a profile edited
    // since) still counts toward the area — it was honestly given — it
    // just has no name to show against it.
    for (const v of given) {
      if (!members.some((m) => m.id === v.memberId)) {
        byMember.push({ memberId: v.memberId, name: '', tier: v.tier });
      }
    }
    if (byMember.length === 0) continue;

    const { mean, spread, net } = scoreTiers(byMember.map((m) => TIER_VALUE[m.tier]));
    rankings.push({ area, net, mean, spread, byMember, awaiting });
  }

  return rankings.sort(compareRankings);
}

/**
 * Ties are broken by how much of the household has spoken — an area both
 * of you rated is a firmer answer than the same score from one person —
 * and then alphabetically, so the order never shuffles between renders for
 * reasons nobody can see.
 */
function compareRankings(a: AreaRanking, b: AreaRanking): number {
  if (b.net !== a.net) return b.net - a.net;
  if (b.byMember.length !== a.byMember.length) return b.byMember.length - a.byMember.length;
  return a.area.localeCompare(b.area);
}
