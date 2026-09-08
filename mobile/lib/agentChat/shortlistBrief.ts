import type { JourneyTimes, Profile } from '../types';
import { medianFor, trendFor } from '../areaPrices';
import { riverSideOf } from '../ranking/river';
import { summariseConversation } from '../conversationSummary';

/**
 * The household's own hunt, as a brief — for questions that name no area.
 *
 * "Which of my areas is cheapest?", "which should I visit first?", "can we
 * afford a 3-bed anywhere?" are questions about their OWN shortlist, and
 * the app knows the answer to every one of them. Until 2026-09-08 they got
 * silence, because the only answering path needed a resolved area name.
 *
 * Deliberately a table of what we hold about the areas on their list, not
 * prose: the model's job here is to read numbers back and rank them, which
 * is the part it is good at, and the numbers are the part it must not
 * invent.
 */

/** How many of the shortlist travel. Enough to rank honestly, few enough
 *  that the prompt stays about the question. */
const MAX_AREAS = 10;

export interface ShortlistBriefInput {
  profile: Profile | null;
  /** The ranked area names currently on the map. */
  areas: string[];
  journeyTimes?: JourneyTimes;
}

export function shortlistBrief({ profile, areas, journeyTimes }: ShortlistBriefInput): string {
  const summary = summariseConversation(profile);
  const lines: string[] = [];

  lines.push('WHAT THEY TOLD US THEY WANT:');
  if (summary.loves.length) lines.push(`  Areas they love: ${summary.loves.join(', ')}`);
  if (summary.reason) lines.push(`  What they like about them: "${summary.reason}"`);
  for (const l of summary.lines) lines.push(`  ${l.label}: ${l.value}`);

  const crit = profile?.propertyCriteria;
  if (crit) {
    lines.push(
      `  Looking to ${crit.channel === 'rent' ? 'rent' : 'buy'}: £${crit.minPrice.toLocaleString('en-GB')}–£${crit.maxPrice.toLocaleString('en-GB')}${
        crit.channel === 'rent' ? ' per month' : ''
      }, ${crit.minBeds}–${crit.maxBeds} beds, ${crit.minBaths}–${crit.maxBaths} baths`,
    );
  }
  if (profile?.maxCommuteMins) lines.push(`  Commute limit: ${profile.maxCommuteMins} minutes`);

  const members = profile?.members ?? [];
  if (members.length) {
    lines.push(`  Household: ${members.map((m) => `${m.name} works at ${m.workLabel}`).join(', ')}`);
  }

  lines.push('');
  if (areas.length === 0) {
    // The honest answer to "which is cheapest?" with nothing on the list is
    // that there is no list, not a guess at one.
    lines.push('THEIR SHORTLIST IS EMPTY — no areas have been suggested yet.');
    return lines.join('\n');
  }

  lines.push(`THEIR SHORTLIST (${Math.min(areas.length, MAX_AREAS)} of ${areas.length}), in rank order:`);
  for (const [i, area] of areas.slice(0, MAX_AREAS).entries()) {
    const bits: string[] = [];
    const price = medianFor(area);
    if (price) {
      const t = trendFor(area);
      bits.push(
        `median £${price.median.toLocaleString('en-GB')}${
          t && t.direction !== 'flat' ? ` (${t.direction} ${Math.abs(t.changePct).toFixed(0)}% since 2023)` : ''
        }`,
      );
    }
    const commute = slowestCommute(area, profile, journeyTimes);
    if (commute) bits.push(`${commute} min commute`);
    const side = riverSideOf(area);
    if (side) bits.push(`${side} of the river`);
    lines.push(`  ${i + 1}. ${area} — ${bits.join('; ') || 'no figures held'}`);
  }
  return lines.join('\n');
}

/** The binding commute — the slowest member's, plus their walk. Same rule
 *  as the area brief, so the two never disagree. */
function slowestCommute(
  area: string,
  profile: Profile | null,
  journeyTimes?: JourneyTimes,
): number | undefined {
  const members = profile?.members ?? [];
  if (!journeyTimes || members.length === 0) return undefined;
  const times = members.map((m) => journeyTimes[area]?.[m.workId]);
  if (!times.every((t) => typeof t === 'number')) return undefined;
  return Math.max(...(times as number[])) + Math.max(...members.map((m) => m.offWalk ?? 0));
}
