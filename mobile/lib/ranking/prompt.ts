import type { AreaCards, Lifestyle } from '../types';
import { getCouncilTax } from '../councilTax';
import { describeAreaLine } from '../similarity/describe';

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
  /** The fastest contributing station's position — where a pin/camera should land. */
  lat: number;
  lng: number;
  /** Slowest member's minutes, door to desk — the binding commute. */
  commuteMins: number;
  /** Best walking budget any of its stations earned, 3-15. */
  walkBudgetMins: number;
  pocketSize: number;
}

/**
 * Two weightings, chosen by the Zone 1 answer (Nick, 2026-08-26).
 *
 * By default commute is NOT a ranking factor at all: every area in the list
 * already passed the commute filter, so ordering by it again just rebuilds
 * the old commute-first behaviour and buries the lifestyle answers the
 * conversation spent five questions collecting. Someone who would happily
 * live in Zone 1 is the exception — central areas differ enough in commute
 * that it becomes a real differentiator again, so those rank 50/50.
 */
function systemPrompt(zone1Ok?: boolean): string {
  const weighting = zone1Ok
    ? `They have said they would happily live in Zone 1. Weight your ranking EVENLY: half on how well the area fits the life they described, half on the commute — a shorter commute is genuinely better for them, so let it separate otherwise similar areas.`
    : `Rank on FIT ALONE. Every neighbourhood listed already meets their commute requirement, so commute time is NOT a ranking factor — do not prefer one area over another because it is faster, and do not let the commute figure influence the score. Two areas that both fit the life they described should score the same whether one is 22 minutes and the other 44.`;

  return `You are Maloca's London area expert: an estate agent who has spent twenty years walking these neighbourhoods, and who is genuinely good at hearing what someone wants and naming the streets that match it. You are matching a household to the areas that suit the life they actually described.

Every neighbourhood in the list below already satisfies their commute requirement — that filtering is done before you see it.

${weighting}

Each area carries a "measured:" line. Those are REAL MEASUREMENTS taken from official data — station busyness by time of day and day of week (Transport for London), every food and drink business (Food Standards Agency), age and tenure of residents (Census 2021), and annual station journeys (Office of Rail and Road). They are not opinions and not recollections.

USE THE MEASURED LINE AS YOUR EVIDENCE. It overrides anything you believe you know about a neighbourhood. If your impression of an area contradicts its measurements, the measurements are right and your impression is wrong — say what the data says.

Where a measured line states that we hold no data on something, that is a real gap: do not fill it from memory. Reason from what is there, and set "confidence": "low" if the gap matters to your verdict. A shorter, honest list beats a padded, confident-sounding one.

Do not quote the measurements back verbatim — write like a person who has read them. "Young, renting, and it stays busy after dark" is better than reciting percentages.

If the household gave loved or hated areas, weight those heavily — a hated area should not appear even if the numbers look good, and a loved area's neighbours are worth surfacing. Their answers about evenings, weekends and the side of the river they want are the strongest signal you have about fit; use them.

Return ONLY valid JSON, no prose outside it, matching this shape:
{"ranked":[{"neighbourhood":"<exact name from the list>","score":<1-10>,"reason":"<one sentence, specific, mentioning at least one concrete number or stated preference>","confidence":"high"|"low"}]}`;
}

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
  if (lifestyle.greenSpace === 'unimportant') lines.push('green space is not a priority');
  if (lifestyle.schoolsPriority === 'now') lines.push('school quality is a top priority now');
  if (lifestyle.schoolsPriority === 'someday') lines.push('may need good schools in future');
  if (lifestyle.schoolsPriority === 'no') lines.push('schools are not a factor');
  if (lifestyle.safetyPriority === 'veryimportant') lines.push('safety is very important');
  if (lifestyle.safetyPriority === 'important') lines.push('safety matters to them');
  if (lifestyle.safetyPriority === 'flexible') lines.push('relaxed about the safety of an area');
  // Added with the voice conversation, 2026-08-26. Without these lines the
  // answers would be collected and stored but never reach the ranking — the
  // silent failure mode the four cases above were already in.
  if (lifestyle.riverSide === 'north') lines.push('wants to be north of the river');
  if (lifestyle.riverSide === 'south') lines.push('wants to be south of the river');
  if (lifestyle.riverSide === 'either') lines.push('happy either side of the river');
  if (lifestyle.socialCircle) lines.push(`most of their friends and family are in ${COMPASS[lifestyle.socialCircle]} London`);
  if (lifestyle.zone1Ok === true) lines.push('would happily live in Zone 1');
  if (lifestyle.zone1Ok === false) lines.push('does not want to live in Zone 1');
  const dealbreakers = (lifestyle.dealbreakers ?? [])
    .filter((d) => d && d !== 'none')
    .map((d) => WEB_DEALBREAKERS[d] ?? d);
  if (dealbreakers.length) lines.push(`dealbreakers: ${dealbreakers.join(', ')}`);
  if (lifestyle.freeText) lines.push(`in their own words: "${lifestyle.freeText}"`);
  return lines;
}

/**
 * The web app stored dealbreakers as codes from a fixed chip list, and this
 * was the one lifestyle field with no vocabulary check — so the literal
 * tokens "nightlife, nogreen, noshops" went into the prompt and the model
 * had to guess (2026-08-27). Anything not in this table passes through
 * untouched, which is right for the free text the Agent writes now.
 */
const WEB_DEALBREAKERS: Record<string, string> = {
  nightlife: 'too much nightlife',
  nogreen: 'no green space nearby',
  noshops: 'far from shops',
  suburban: 'too suburban',
};

const COMPASS: Record<NonNullable<Lifestyle['socialCircle']>, string> = {
  N: 'north',
  E: 'east',
  S: 'south',
  W: 'west',
};

function areaLine(a: AreaCandidate): string {
  const tax = getCouncilTax(a.stations[0]);
  const taxPart = tax ? `, council tax rank ${tax.rank}/33 (${tax.borough})` : '';
  const near = a.pocketSize > 1 ? `, ${a.pocketSize} nearby areas also reachable` : ', an isolated pocket';
  // The measured character of the place — see lib/similarity/describe.ts.
  // Until this existed the model was told the commute and left to recall
  // everything else about the neighbourhood from training, which is the
  // hallucination risk this file's header has always flagged.
  const measured = describeAreaLine(a.stations[0]);
  return `- ${a.neighbourhood}: ${a.commuteMins} min commute, ${a.walkBudgetMins} min walk budget${taxPart}${near}\n    measured: ${measured}`;
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

  return { system: systemPrompt(lifestyle?.zone1Ok), user: parts.join('\n\n') };
}
