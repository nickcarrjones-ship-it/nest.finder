import { allAreaNames, computeStats, featuresFor, standardise } from './similarity/features';
import crimeData from '../assets/data/area-crime.json';
import type { JourneyTimes, Profile } from './types';

/**
 * Ranking the household's areas on one thing (Nick, 2026-10-03: "Which of
 * the Maloca areas and the ones I love is busiest at night and has a
 * vibrant nightlife" - "an engaging way of 'ranking' the areas"). Drawn as
 * a podium (components/RankCard.tsx, option B of two mock-ups).
 *
 * Every score comes from Maloca's own measurements - never the model's
 * memory - and every reason is WORDS: no counts reach the screen
 * (see feedback on "386 places"). Where an area lacks part of the data
 * (National Rail stations have no night-time travel figures) it is judged
 * on what we do hold, and says so.
 */

export type RankKind = 'love' | 'pick';

export interface RankRow {
  name: string;
  kind: RankKind;
  /** 0 (last) to 1 (first), for the podium heights and order. */
  score: number;
  /** Why, in a few plain words. */
  reason: string;
  /** Judged on part of the data only. */
  partial: boolean;
}

export interface Ranking {
  theme: ThemeId;
  title: string;
  subtitle: string;
  rows: RankRow[];
  /** A note about areas judged on part of the data, or null. */
  footnote: string | null;
}

export type ThemeId = 'nightlife' | 'food' | 'cafes' | 'quiet' | 'busy' | 'young' | 'families' | 'safety' | 'commute';

type Z = Record<string, number | null>;
type Band = 'well below' | 'below' | 'about' | 'above' | 'well above';

function band(z: number | null | undefined): Band | null {
  if (z === null || z === undefined || !Number.isFinite(z)) return null;
  if (z <= -1.5) return 'well below';
  if (z <= -0.5) return 'below';
  if (z < 0.5) return 'about';
  if (z < 1.5) return 'above';
  return 'well above';
}
const high = (z: number | null | undefined) => ['above', 'well above'].includes(band(z) ?? '');
const low = (z: number | null | undefined) => ['below', 'well below'].includes(band(z) ?? '');

interface Theme {
  title: string;
  subtitle: string;
  match: RegExp;
  /** Weighted z-score dimensions; negative weight means less is better. */
  dims?: [string, number][];
  /** The dimension without which the score is only partial. */
  core?: string;
  reason?: (z: Z) => string;
  partialNote?: string;
}

const THEMES: Record<Exclude<ThemeId, 'safety' | 'commute'>, Theme> = {
  nightlife: {
    title: 'Liveliest at night',
    subtitle: 'busiest after dark first',
    match: /\b(night ?life|nights? out|going out|at night|after dark|late[- ]night|night ?clubs?|clubbing|club scene|bars?|vibrant|lively|liveliest|buzz(?:y|iest)?)\b/i,
    dims: [['satNight', 0.4], ['nightlifeRatio', 0.25], ['drinkShare', 0.2], ['barToPub', 0.15]],
    core: 'satNight',
    reason: (z) => {
      const parts: string[] = [];
      if (high(z.satNight) && high(z.nightlifeRatio)) parts.push('Busy late on Saturday night, people come here to go out');
      else if (high(z.satNight)) parts.push('Busy on Saturday nights');
      else if (low(z.satNight)) parts.push('Quiet after dark');
      if (high(z.barToPub)) parts.push('more bars than pubs');
      else if (high(z.drinkShare)) parts.push('lots of pubs and bars');
      else if (low(z.drinkShare)) parts.push('few pubs and bars');
      return sentence(parts) || 'An ordinary night-time buzz';
    },
    partialNote: 'no night-time travel data, so judged on its pubs and bars',
  },
  food: {
    title: 'Best for food',
    subtitle: 'the richest food scene first',
    match: /\b(food|foodie|restaurants?|eat(?:ing)?|dinner|cuisines?)\b/i,
    dims: [['venues', 0.4], ['cuisineCount', 0.3], ['independentShare', 0.3]],
    core: 'venues',
    reason: (z) => sentence([
      high(z.venues) ? 'Plenty of places to eat' : low(z.venues) ? 'Not many places to eat' : '',
      high(z.cuisineCount) ? 'food from all over the world' : '',
      high(z.independentShare) ? 'mostly independents' : low(z.independentShare) ? 'more chains than most' : '',
    ]) || 'A fairly ordinary food scene',
  },
  cafes: {
    title: 'Best for cafés and brunch',
    subtitle: 'the best café scene first',
    match: /\b(caf[eé]s?|coffee|brunch)\b/i,
    dims: [['cafeShare', 0.6], ['venues', 0.2], ['independentShare', 0.2]],
    core: 'cafeShare',
    reason: (z) => sentence([
      high(z.cafeShare) ? 'Café-heavy, a daytime high street' : low(z.cafeShare) ? 'Fewer cafés than most' : '',
      high(z.independentShare) ? 'mostly independents' : '',
    ]) || 'A fair few cafés',
  },
  quiet: {
    title: 'Quietest',
    subtitle: 'the most peaceful first',
    match: /\b(quiet(?:est|er)?|peaceful|calm(?:est)?|sleepy|tranquil)\b/i,
    dims: [['satNight', -0.35], ['annualFootfall', -0.35], ['venues', -0.3]],
    core: 'annualFootfall',
    reason: (z) => sentence([
      low(z.satNight) ? 'Quiet after dark' : high(z.satNight) ? 'Busy on Saturday nights' : '',
      low(z.annualFootfall) ? 'a quiet station' : high(z.annualFootfall) ? 'a busy station' : '',
    ]) || 'About as busy as most',
  },
  busy: {
    title: 'Busiest',
    subtitle: 'the most going on first',
    match: /\b(busiest|busy|bustling|most going on|central)\b/i,
    dims: [['annualFootfall', 0.5], ['venues', 0.3], ['satNight', 0.2]],
    core: 'annualFootfall',
    reason: (z) => sentence([
      high(z.annualFootfall) ? 'A busy station' : low(z.annualFootfall) ? 'A quiet station' : '',
      high(z.venues) ? 'plenty of places to eat and drink' : '',
    ]) || 'About as busy as most',
  },
  young: {
    title: 'Youngest crowd',
    subtitle: 'the most twenty-somethings first',
    match: /\b(young(?:est|er)?|twenty-?somethings?|in (?:our|their) (?:20s|twenties))\b/i,
    dims: [['share20to34', 1]],
    core: 'share20to34',
    reason: (z) => (high(z.share20to34) ? 'Lots of people in their twenties and early thirties'
      : low(z.share20to34) ? 'An older crowd than most' : 'A typical mix of ages'),
  },
  families: {
    title: 'Most family-friendly',
    subtitle: 'the most families first',
    match: /\b(famil(?:y|ies)|kids|children|family-friendly)\b/i,
    dims: [['shareUnder15', 0.6], ['shareOwned', 0.4]],
    core: 'shareUnder15',
    reason: (z) => sentence([
      high(z.shareUnder15) ? 'Lots of families with children' : low(z.shareUnder15) ? 'Fewer families than most' : '',
      high(z.shareOwned) ? 'mostly owners' : low(z.shareOwned) ? 'mostly renters' : '',
    ]) || 'A typical mix',
  },
};

const SAFETY = /\b(safe(?:st|r)?|crime|dangerous)\b/i;
const COMMUTE = /\b(commute|shortest journey|quickest|closest to (?:work|the office)|journey)\b/i;

function sentence(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (!p.length) return '';
  const s = p.join(', ');
  return s[0].toUpperCase() + s.slice(1);
}

// --- the question ------------------------------------------------------

/** "Which of my areas", "rank the Maloca picks", "of the ones I love". */
const SET_WORDS = /\b(my areas|our areas|areas (?:i|we) love|(?:the )?ones (?:i|we) love|loved areas|maloca(?:'s)? (?:areas|picks|suggestions)|(?:the )?picks|suggested areas|shortlist|all (?:of )?(?:them|these|those|my areas|our areas)|my list|our list)\b/i;
const RANK_WORDS = /\b(which|rank|ranking|order|compare|top|best|most|least|\w+est)\b/i;

/** Which theme a ranking question is about, or null if it is not one. */
export function rankingAsked(said: string): ThemeId | null {
  if (!SET_WORDS.test(said) || !RANK_WORDS.test(said)) return null;
  // Night-time first: "busiest at night" is nightlife, not footfall.
  if (THEMES.nightlife.match.test(said)) return 'nightlife';
  if (SAFETY.test(said)) return 'safety';
  if (COMMUTE.test(said)) return 'commute';
  for (const id of ['food', 'cafes', 'quiet', 'young', 'families', 'busy'] as const) {
    if (THEMES[id].match.test(said)) return id;
  }
  return null;
}

/** Whether they meant the loved areas, the picks, or both. */
export function whichSets(said: string): { love: boolean; pick: boolean } {
  const love = /\b(love|loved|my areas|our areas|my list|our list)\b/i.test(said);
  const pick = /\b(maloca|picks?|suggest(?:ed|ions)|shortlist)\b/i.test(said);
  if (!love && !pick) return { love: true, pick: true };
  return { love, pick };
}

// --- scoring -----------------------------------------------------------

let statsCache: ReturnType<typeof computeStats> | null = null;
function zFor(name: string): Z {
  if (!statsCache) statsCache = computeStats(allAreaNames().map(featuresFor));
  return standardise(featuresFor(name), statsCache) as unknown as Z;
}

interface Scored { name: string; kind: RankKind; raw: number; reason: string; partial: boolean }

function scoreFeatures(theme: Theme, name: string): { raw: number; partial: boolean; reason: string } | null {
  const z = zFor(name);
  const dims = theme.dims ?? [];
  const have = dims.filter(([d]) => typeof z[d] === 'number' && Number.isFinite(z[d] as number));
  if (!have.length) return null;
  const weight = have.reduce((s, [, w]) => s + Math.abs(w), 0);
  const raw = have.reduce((s, [d, w]) => s + w * (z[d] as number), 0) / weight;
  const partial = Boolean(theme.core && !have.some(([d]) => d === theme.core));
  const reason = theme.reason ? theme.reason(z) : '';
  return { raw, partial, reason: partial && theme.partialNote ? `${reason} - ${theme.partialNote}` : reason };
}

const CRIME = (crimeData as unknown as { areas: Record<string, { streetPer1kPeople: number; commercialCentre: boolean }> }).areas;

function scoreSafety(name: string): { raw: number; partial: boolean; reason: string } | null {
  const row = CRIME[name];
  if (!row || typeof row.streetPer1kPeople !== 'number') return null;
  const all = Object.values(CRIME).map((r) => r.streetPer1kPeople).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const rank = all.findIndex((v) => v >= row.streetPer1kPeople) / all.length; // 0 safest .. 1
  const reason = row.commercialCentre
    ? 'A busy centre, so its crime figures are swollen by visitors'
    : rank < 0.33 ? 'Less street crime than most of London' : rank > 0.66 ? 'More street crime than most of London' : 'About average for street crime';
  return { raw: -row.streetPer1kPeople, partial: row.commercialCentre, reason };
}

function scoreCommute(name: string, profile: Profile, journeyTimes: JourneyTimes): { raw: number; partial: boolean; reason: string } | null {
  const members = profile.members ?? [];
  const times = members.map((m) => {
    const t = journeyTimes[name]?.[m.workId];
    return typeof t === 'number' ? { who: m.name?.trim() || 'one of you', mins: t + (m.offWalk ?? 0) } : null;
  });
  if (!times.length || times.some((t) => t === null)) return null;
  const known = times as { who: string; mins: number }[];
  const slowest = Math.max(...known.map((t) => t.mins));
  // Minutes are an answer, so they may be shown.
  const reason = known.length === 1 ? `About ${known[0].mins} minutes to work`
    : known.map((t) => `${t.who} about ${t.mins} min`).join(', ');
  return { raw: -slowest, partial: false, reason };
}

/**
 * The areas in order for one theme. Areas with no data for it at all are
 * left out rather than guessed.
 */
export function rankAreas(
  theme: ThemeId,
  areas: { name: string; kind: RankKind }[],
  ctx: { profile: Profile; journeyTimes?: JourneyTimes },
): Ranking {
  const scored: Scored[] = [];
  for (const a of areas) {
    const s = theme === 'safety' ? scoreSafety(a.name)
      : theme === 'commute' ? (ctx.journeyTimes ? scoreCommute(a.name, ctx.profile, ctx.journeyTimes) : null)
        : scoreFeatures(THEMES[theme], a.name);
    if (s) scored.push({ ...a, ...s });
  }
  scored.sort((x, y) => y.raw - x.raw);
  const hi = scored[0]?.raw ?? 0;
  const lo = scored[scored.length - 1]?.raw ?? 0;
  const rows: RankRow[] = scored.map((s) => ({
    name: s.name,
    kind: s.kind,
    score: hi === lo ? 1 : (s.raw - lo) / (hi - lo),
    reason: s.reason,
    partial: s.partial,
  }));

  const head = theme === 'safety'
    ? { title: 'Safest', subtitle: 'the least street crime first' }
    : theme === 'commute'
      ? { title: 'Easiest commute', subtitle: 'the shortest journey for the slowest of you first' }
      : { title: THEMES[theme].title, subtitle: THEMES[theme].subtitle };
  const kinds = new Set(areas.map((a) => a.kind));
  const whose = kinds.size === 2 ? "Your areas and Maloca's picks" : kinds.has('love') ? 'The areas you love' : "Maloca's picks";

  const partial = rows.filter((r) => r.partial).map((r) => r.name);
  const footnote = partial.length
    ? theme === 'safety'
      ? `${joinNames(partial)}: busy centres, where visitors swell the crime figures.`
      : `${joinNames(partial)}: ${theme === 'nightlife' ? 'no night-time travel data (National Rail), so judged on pubs and bars' : 'judged on part of the data'}.`
    : null;

  return { theme, title: head.title, subtitle: `${whose}, ${head.subtitle}`, rows, footnote };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const TOP_FOR: Record<ThemeId, string> = {
  nightlife: 'nightlife', food: 'food', cafes: 'cafés and brunch', quiet: 'peace and quiet', busy: 'buzz',
  young: 'a young crowd', families: 'families', safety: 'safety', commute: 'the commute',
};

/** The answer above the podium, in words. */
export function describeRanking(r: Ranking): string {
  const [first, second, third] = r.rows;
  if (!first) return "I don't have the data to rank those areas on that yet.";
  const last = r.rows.length > 3 ? r.rows[r.rows.length - 1] : null;
  const parts = [`${first.name} comes out top for ${TOP_FOR[r.theme]}: ${first.reason.charAt(0).toLowerCase()}${first.reason.slice(1)}.`];
  if (second) parts.push(third ? `${second.name} and ${third.name} follow.` : `${second.name} comes second.`);
  if (last) parts.push(`${last.name} is at the other end.`);
  return parts.join(' ');
}
