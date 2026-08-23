import type { AreaCards, Lifestyle } from '../types';
import { getCouncilTax } from '../councilTax';

/**
 * The AI shortlist prompt — deliberately NOT a port of the web app's
 * classifier (js/map-filter.js buildFilterSystemPrompt).
 *
 * That prompt hardcodes which London areas have parks, nightlife, good
 * schools, low crime — literal lists written when the map had 262 areas.
 * At 570 it's already stale, and every future station addition needs the
 * prompt hand-edited to match, or new areas silently fall outside every
 * list. A known-open finding on the web app.
 *
 * Instead, this GROUNDS each area in numbers we actually compute rather
 * than facts a model recalls: council tax band (real data, not vibes), the
 * commute time and walking budget it earns (the whole point of the app),
 * and the pocket it sits in (how many other reachable areas surround it —
 * a lonely pocket usually means a lonely commute story too). The model's
 * job is to reason about FIT — the profile's own words against real
 * numbers — not to recite facts about London it may or may not know.
 *
 * Known limitation, stated rather than hidden: subjective texture (vibe,
 * nightlife, green space) still comes from the model's general knowledge,
 * which is where the web app's hallucination risk lived. Mitigated by
 * asking for a confidence flag per area and weighting the objective
 * signals more heavily in the instructions — not eliminated. Grounding
 * that in real signals (crime data, park proximity via OSM) is real,
 * scoped future work, not something to fake today.
 */

export interface AreaCandidate {
  neighbourhood: string;
  /** Every station area that resolved to this neighbourhood. */
  stations: string[];
  /** Slowest member's minutes, door to desk — the binding commute. */
  commuteMins: number;
  /** Best walking budget any of its stations earned, 3-15. */
  walkBudgetMins: number;
  pocketSize: number;
}

const SYSTEM_PROMPT = `You are helping a household choose which London neighbourhoods to actually go and visit, out of a list that already satisfies their commute requirement.

Every neighbourhood in the list below is already reachable within their stated commute time — that filtering is done. Your job is ranking by FIT: how well each place matches what they said they want, using the real numbers provided plus your own knowledge of London.

Ground your reasoning in the DATA GIVEN for each area (commute minutes, walking budget, council tax) before adding colour from general knowledge. Where you are relying on general knowledge of a specific neighbourhood's character rather than the given data, and you are not confident about it, say so — set "confidence": "low" rather than presenting a guess as fact. A shorter, honest list beats a padded, confident-sounding one.

If the household gave loved or hated areas, weight those heavily — a hated area should not appear even if the numbers look good, and a loved area's neighbours are worth surfacing.

Return ONLY valid JSON, no prose outside it, matching this shape:
{"ranked":[{"neighbourhood":"<exact name from the list>","score":<1-10>,"reason":"<one sentence, specific, mentioning at least one concrete number or stated preference>","confidence":"high"|"low"}]}`;

function lifestyleLines(lifestyle?: Lifestyle): string[] {
  if (!lifestyle) return [];
  const lines: string[] = [];
  if (lifestyle.greenSpace === 'essential') lines.push('green space is essential');
  if (lifestyle.greenSpace === 'nice') lines.push('green space is a nice-to-have');
  if (lifestyle.streetVibe === 'buzzy') lines.push('prefers a buzzy high street');
  if (lifestyle.streetVibe === 'quiet') lines.push('prefers quiet residential streets');
  if (lifestyle.streetVibe === 'village') lines.push('prefers a village feel');
  if (lifestyle.nightsOut === 'frequent') lines.push('goes out frequently (3+ nights/week)');
  if (lifestyle.nightsOut === 'regular') lines.push('goes out regularly (1-2 nights/week)');
  if (lifestyle.nightsOut === 'rarely') lines.push('rarely goes out');
  if (lifestyle.schoolsPriority === 'now') lines.push('school quality is a top priority now');
  if (lifestyle.schoolsPriority === 'someday') lines.push('may need good schools in future');
  if (lifestyle.safetyPriority === 'veryimportant') lines.push('safety is very important');
  if (lifestyle.dealbreakers?.length && lifestyle.dealbreakers[0] !== 'none') {
    lines.push(`dealbreakers: ${lifestyle.dealbreakers.join(', ')}`);
  }
  if (lifestyle.freeText) lines.push(`in their own words: "${lifestyle.freeText}"`);
  return lines;
}

function areaLine(a: AreaCandidate): string {
  const tax = getCouncilTax(a.stations[0]);
  const taxPart = tax ? `, council tax rank ${tax.rank}/33 (${tax.borough})` : '';
  const near = a.pocketSize > 1 ? `, ${a.pocketSize} nearby areas also reachable` : ', an isolated pocket';
  return `- ${a.neighbourhood}: ${a.commuteMins} min commute, ${a.walkBudgetMins} min walk budget${taxPart}${near}`;
}

/** One batch's worth of the user turn. Batching is the caller's job — see rank.ts. */
export function buildRankingPrompt(
  candidates: AreaCandidate[],
  lifestyle: Lifestyle | undefined,
  areaCards: AreaCards | undefined,
): { system: string; user: string } {
  const prefs = lifestyleLines(lifestyle);
  const loves = Object.entries(areaCards ?? {}).filter(([, v]) => v === 'love').map(([k]) => k);
  const hates = Object.entries(areaCards ?? {}).filter(([, v]) => v === 'hate').map(([k]) => k);

  const parts: string[] = [];
  if (prefs.length) parts.push(`Preferences:\n${prefs.map((p) => `- ${p}`).join('\n')}`);
  if (loves.length) parts.push(`Areas they've said they love: ${loves.join(', ')}`);
  if (hates.length) parts.push(`Areas they've said they want to avoid: ${hates.join(', ')}`);
  parts.push(`Reachable neighbourhoods to rank (${candidates.length}):\n${candidates.map(areaLine).join('\n')}`);

  return { system: SYSTEM_PROMPT, user: parts.join('\n\n') };
}
