/**
 * Turning "I love Clapham" into a shortlist.
 *
 * This is the switch between the two ways the app can rank areas, and the
 * difference matters (Nick, 2026-08-28):
 *
 *  - ANCHOR-LED, for the majority who already have somewhere in mind. The
 *    similarity engine — arithmetic over measured data, free and instant —
 *    picks the areas most like the one they love. The model then explains
 *    only those. It decides nothing.
 *  - MODEL-LED, the fallback, for someone new to London with nowhere in
 *    mind. There is nothing to be similar TO, so every reachable area goes
 *    to the model with its measurements and the model does the ranking.
 *
 * The fallback is deliberately the expensive path, used by the few. Faking
 * an anchor from someone's stated preferences was considered and rejected:
 * it would mean inventing an ideal area that exists nowhere and calling it
 * evidence, which is the habit this whole rebuild exists to break.
 */

import { allAreaNames, featuresFor } from '../similarity/features';
import { findSimilar, weightsFromPreference, type Coords } from '../similarity/similar';
import { weightsFromTags } from '../similarity/tags';
import type { AreaCards } from '../types';
import type { AreaCandidate } from './prompt';

/**
 * How many areas the model is asked to explain when we have an anchor.
 *
 * Enough to give a real choice, few enough that the prompt stays small —
 * the whole cost saving is in not paying a model to read evidence about
 * areas it would have ranked near the bottom anyway.
 */
export const ANCHOR_SHORTLIST = 15;

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/ & /g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Matches what someone SAYS to an area we hold data for.
 *
 * The Agent hears "Clapham"; the datasets are keyed by station, so the
 * nearest thing we hold is "Clapham Common". Without this the anchor would
 * silently fail to resolve and every user would drop to the expensive path
 * without anyone noticing.
 *
 * Deliberately conservative — an exact name, then a name that begins with
 * what they said, then one that contains it.
 *
 * Where several match, the most PROMINENT wins, measured by how much is
 * around it. "Clapham" matches Common, South and High Street, and picking
 * the shortest name gave Clapham South — an arbitrary answer that happens
 * to be the quietest of the three. Someone saying "Clapham" means the busy
 * bit, and venue count is a fair, data-driven stand-in for that.
 *
 * This is still a guess at an ambiguous word. The conversation should
 * confirm it back — "Clapham, the Common end or nearer the Junction?" —
 * which catches a misheard name at the same time.
 */
export function resolveAreaName(spoken: string, known: string[] = allAreaNames()): string | null {
  const want = normalise(spoken);
  if (!want) return null;

  const exact = known.find((n) => normalise(n) === want);
  if (exact) return exact;

  const mostProminent = (matches: string[]) =>
    matches.length
      ? matches.reduce((a, b) => (prominence(b) > prominence(a) ? b : a))
      : null;

  const startsWith = mostProminent(known.filter((n) => normalise(n).startsWith(`${want} `)));
  if (startsWith) return startsWith;

  // Only match a whole word, so "Kew" never lands on "Kewstoke"-alikes.
  const contains = mostProminent(
    known.filter((n) => new RegExp(`(^| )${escapeRegExp(want)}( |$)`).test(normalise(n))),
  );
  return contains;
}

/**
 * How much of a centre an area is. Venue count where we have it, falling
 * back to a stable shortest-name preference so this never depends on data
 * being present.
 */
function prominence(name: string): number {
  const venues = featuresFor(name).venues;
  return venues ?? 1 / name.length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every area we hold that a spoken name could plausibly mean.
 *
 * "Clapham" covers the Common, the High Street, North, South and the
 * Junction — and they are NOT interchangeable: from the Common the engine
 * suggests Highbury and Islington and Kennington, from the Junction it
 * suggests Wandsworth Town and Balham. Picking one silently would decide
 * something the user should decide.
 *
 * Returns an empty array when the name is unambiguous, so the caller can
 * simply skip asking.
 */
export function ambiguousMatches(spoken: string, known: string[] = allAreaNames()): string[] {
  const want = normalise(spoken);
  if (!want) return [];
  if (known.some((n) => normalise(n) === want)) return [];
  const matches = known.filter((n) =>
    new RegExp(`(^| )${escapeRegExp(want)}( |$)`).test(normalise(n)),
  );
  return matches.length > 1 ? matches : [];
}

/**
 * Ambiguous place names, precomputed once: "clapham" -> the five Claphams.
 *
 * Built from the area list rather than hardcoded, so it stays correct as
 * stations are added — Ealing Broadway arriving on 2026-08-28 made "ealing"
 * ambiguous five ways without anyone editing a list.
 */
let ambiguousStems: Map<string, string[]> | null = null;

/**
 * Words too ordinary to treat as a place name on their own.
 *
 * London names are built from plain English — Great Portland Street, Clapham
 * COMMON, Herne HILL, Turnham GREEN — so "Brixton is great" was matching
 * Great Portland Street and asking the user to confirm it. A word only
 * identifies a place when it is doing more work than these are.
 */
const TOO_COMMON = new Set([
  'great', 'common', 'park', 'green', 'hill', 'cross', 'north', 'south', 'east', 'west',
  'new', 'old', 'high', 'town', 'end', 'gate', 'bridge', 'wood', 'street', 'road', 'lane',
  'way', 'house', 'court', 'heath', 'vale', 'gardens', 'village', 'junction', 'central',
  'upper', 'lower', 'royal', 'queens', 'kings', 'grove', 'rise', 'hall', 'bank', 'water',
  'the', 'and', 'for', 'near', 'like', 'area', 'place', 'good', 'nice', 'big', 'small',
  'city', 'station', 'line', 'side', 'field', 'fields', 'mill', 'farm', 'lodge', 'manor',
  // London itself is the subject of every sentence here, not a place to pin
  // down. It matches London Bridge, London Fields, London City Airport and
  // London St Pancras, so "East London" was being queried back at the user
  // (Nick, 2026-08-28).
  'london', 'bridge', 'airport', 'international', 'arena', 'pancras',
]);

/**
 * Words that mean they are RULING SOMEWHERE OUT rather than naming it.
 *
 * The clarification exists to pin down an anchor — the place they love and
 * want more of. Asking which part of somewhere they just rejected is
 * pointless and reads as not having listened: Nick said "I'd hate to live in
 * East London like Canary Wharf" and was asked which London he meant.
 *
 * Deliberately narrow. "don't want" is a rejection; "don't mind" is not, so
 * only the full phrases count.
 */
const REJECTION = /\b(hate|hated|avoid|dislike|never|not keen|put off|rule out|ruled out|ruling out|don'?t want|do not want|wouldn'?t live|would not live|nowhere near|anywhere but)\b/i;

function stemsOf(known: string[]): Map<string, string[]> {
  const byStem = new Map<string, string[]>();
  for (const name of known) {
    const words = normalise(name).split(' ');
    // Both the first and last word: "Clapham Common" is found by "clapham",
    // "North Ealing" by "ealing". Single-word names index themselves.
    for (const w of new Set([words[0], words[words.length - 1]])) {
      if (!w || w.length < 3 || TOO_COMMON.has(w)) continue;
      const list = byStem.get(w) ?? [];
      list.push(name);
      byStem.set(w, list);
    }
  }
  // A stem is only ambiguous if it names several places AND is not itself an
  // area — "Angel" is unambiguous even though other names contain it.
  const exact = new Set(known.map(normalise));
  return new Map(
    [...byStem.entries()].filter(([stem, list]) => list.length > 1 && !exact.has(stem)),
  );
}

/**
 * What someone SAID that we cannot pin to one place, read from their own
 * words rather than waiting for the model to extract an area first.
 *
 * Timing is the reason. Areas only reach the profile after a turn has been
 * parsed, so checking there would raise the question a turn late — after the
 * Agent had already moved on. Scanning the message as it is sent lets it ask
 * straight away, which is also when a mishearing is cheapest to catch.
 */
export function ambiguityInText(text: string, known: string[] = allAreaNames()): string[] {
  // Never clarify a place they are ruling out — see REJECTION.
  if (REJECTION.test(text)) return [];
  if (!ambiguousStems) ambiguousStems = stemsOf(known);
  const words = normalise(text).split(/[^a-z0-9]+/);
  const said = normalise(text);
  const exact = new Set(known.map(normalise));

  for (const w of words) {
    if (!w || w.length < 3 || exact.has(w) || TOO_COMMON.has(w)) continue;
    const hit = ambiguousStems.get(w);
    // Only when they did NOT already say which one — "Clapham Common" is a
    // complete answer and must not be queried back at them.
    if (hit && !hit.some((n) => said.includes(normalise(n)))) return hit;

    /**
     * A bare word that matches exactly ONE compound area name is the
     * dangerous case, not the safe one. "Liverpool" resolves to Liverpool
     * Street, "Cambridge" to Cambridge Heath, "Oxford" to Oxford Circus —
     * so someone moving down from Liverpool was silently anchored to a
     * station in the City, and every suggestion after it was confidently
     * wrong (found 2026-08-28).
     *
     * There is no data-driven way to tell "Clapham" (a district people
     * really mean) from "Liverpool" (a city 200 miles away) — both are one
     * word matching one London name. So we stop guessing and confirm.
     */
    const single = known.filter((n) => {
      const parts = normalise(n).split(' ');
      return parts.length > 1 && (parts[0] === w || parts[parts.length - 1] === w);
    });
    if (single.length === 1 && !said.includes(normalise(single[0]))) return single;
  }
  return [];
}

/**
 * Names that resolved to nothing we hold — somewhere outside London.
 *
 * Silence here was dangerous. Someone saying "we're moving down from
 * Liverpool" would fall through to the expensive model-led path with no
 * anchor and no explanation, and someone saying "Amsterdam" the same. The
 * Agent should say plainly that it only covers London rather than quietly
 * producing a worse answer.
 */
export function unresolvedAreas(areaCards: AreaCards | undefined): string[] {
  return Object.entries(areaCards ?? {})
    .filter(([, v]) => v === 'love')
    .map(([n]) => n)
    .filter((n) => resolveAreaName(n) === null);
}

/** The note handed to the Agent when they have named somewhere we cannot map. */
export function outsideLondonNote(names: string[]): string {
  return (
    `[Note for you, not from them: ${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} not ` +
    `somewhere this app covers — it only knows areas inside London. Say so warmly and briefly, ` +
    `without making them feel silly, and ask either for a London area they like or, if they do ` +
    `not know London, what they are hoping for in a place. Do NOT guess a London area from the ` +
    `name.]`
  );
}

/**
 * The note handed to the Agent when a spoken place name is ambiguous.
 *
 * Injected into the conversation rather than the system prompt, because it
 * depends on what they just said. It doubles as a check on speech
 * recognition: confirming "Clapham" out loud catches a mishearing before it
 * becomes the anchor for every suggestion that follows.
 */
export function clarifyNote(options: string[]): string {
  if (options.length === 1) {
    return (
      `[Note for you, not from them: they said a place name that we can only match to ` +
      `"${options[0]}" in London. That may not be what they meant — "Liverpool" matches ` +
      `Liverpool Street, "Cambridge" matches Cambridge Heath. Check briefly and warmly that ` +
      `this is the London place they mean. If they meant somewhere outside London, say the ` +
      `app only covers London and ask what they are hoping for instead.]`
    );
  }
  return (
    `[Note for you, not from them: they said a place name that could mean ` +
    `${options.join(', ')}. These are genuinely different — from one the engine ` +
    `suggests quite different areas than from another — so ask which part they mean ` +
    `before moving on. Name a landmark or two rather than listing stations, and keep ` +
    `it to one short question. "Both", "either" or "the whole area" is a perfectly ` +
    `good answer: record every part they name.]`
  );
}

/**
 * A note for the Agent when someone has named somewhere ambiguous, or null.
 *
 * Injected into the conversation rather than baked into the system prompt,
 * because it depends on what they actually said. It doubles as a check on
 * speech recognition: confirming "Clapham" out loud catches a mishearing
 * before it becomes the anchor for every suggestion that follows.
 */
export function ambiguityNote(areaCards: AreaCards | undefined, known?: string[]): string | null {
  for (const [name, verdict] of Object.entries(areaCards ?? {})) {
    if (verdict !== 'love') continue;
    const options = ambiguousMatches(name, known);
    if (options.length > 1) {
      return (
        `[Note for you, not from them: "${name}" could mean ${options.join(', ')}. ` +
        `These are genuinely different places, so ask which part they mean — ` +
        `naming a landmark or two is friendlier than listing stations. ` +
        `"Both" or "the whole area" is a perfectly good answer: record every part they name.]`
      );
    }
  }
  return null;
}

/**
 * EVERY area they love that we can measure, in the order they named them.
 *
 * People name more than one, and "both" is a real answer to "the Common or
 * the Junction?" (Nick, 2026-08-28). Taking only the first would silently
 * discard the rest.
 */
export function findAnchors(areaCards: AreaCards | undefined, known?: string[]): string[] {
  const out: string[] = [];
  for (const [name, verdict] of Object.entries(areaCards ?? {})) {
    if (verdict !== 'love') continue;
    const resolved = resolveAreaName(name, known);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/** The primary anchor — the first they named. */
export function findAnchor(areaCards: AreaCards | undefined, known?: string[]): string | null {
  return findAnchors(areaCards, known)[0] ?? null;
}

export interface AnchorShortlist {
  /** The first area they named — what the UI calls the shortlist. */
  anchor: string;
  /** Every area they named that we can measure. */
  anchors: string[];
  candidates: AreaCandidate[];
  /** Which of their anchors each suggestion actually resembles. */
  matchedAnchor: Record<string, string>;
}

/**
 * Narrows the reachable areas to those most like the anchor.
 *
 * Areas they said they HATE are excluded outright — a stated rejection
 * outranks any measurement. Everything else stays eligible, including the
 * anchor's own neighbours: a good match down the road is still a good
 * match, and `findSimilar` already stops one cluster taking every slot.
 */
export function shortlistByAnchor(
  candidates: AreaCandidate[],
  areaCards: AreaCards | undefined,
  anchorReason: string | undefined,
  limit: number = ANCHOR_SHORTLIST,
  preferenceTags?: readonly string[],
): AnchorShortlist | null {
  const anchors = findAnchors(areaCards);
  const anchor = anchors[0];
  if (!anchor) return null;

  const byName = new Map(candidates.map((c) => [c.stations[0], c]));
  // Some candidates key on a neighbourhood name rather than their station.
  for (const c of candidates) if (!byName.has(c.neighbourhood)) byName.set(c.neighbourhood, c);

  const hated = Object.entries(areaCards ?? {})
    .filter(([, v]) => v === 'hate')
    .map(([n]) => resolveAreaName(n))
    .filter((n): n is string => n !== null);

  /**
   * With several anchors, each candidate is scored against ALL of them and
   * keeps its BEST match — never an average.
   *
   * Averaging is the tempting choice and it is wrong. The midpoint of
   * Clapham and Hampstead is a place that resembles neither, so someone who
   * likes both would be sent somewhere they like less than either. Taking
   * the best match returns places like one OR the other, which is what "I
   * like both" actually means — and it lets us say WHICH one each
   * suggestion resembles, rather than presenting a blend nobody asked for.
   *
   * It also makes "the Common or the Junction?" answerable with "either":
   * both become anchors, and anywhere resembling either one qualifies.
   */
  /**
   * Tags first, free text second.
   *
   * The Agent hears the answer and emits tags from a fixed vocabulary — it
   * understands "somewhere we can actually get a table on a Friday" in a way
   * no keyword list will. The keyword matcher stays as the fallback for a
   * profile written before tags existed, or a turn where the model returned
   * none.
   */
  const tagged = weightsFromTags(preferenceTags);
  const weights = Object.keys(tagged).length
    ? tagged
    : anchorReason
      ? weightsFromPreference(anchorReason)
      : {};
  const eligible = [...byName.keys()];
  const coords = coordsFrom(candidates);

  const best = new Map<string, { score: number; anchor: string }>();
  for (const from of anchors) {
    // Ask for more than we need per anchor, since the merge below re-sorts
    // across all of them and a per-anchor cut would bias toward the first.
    const matches = findSimilar(from, {
      limit: limit * anchors.length + limit,
      weights,
      exclude: [...hated, ...anchors],
      candidates: eligible,
      coords,
    });
    for (const m of matches) {
      const held = best.get(m.name);
      if (!held || m.score > held.score) best.set(m.name, { score: m.score, anchor: from });
    }
  }

  const merged = [...best.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);

  const picked: AreaCandidate[] = [];
  const matchedAnchor: Record<string, string> = {};
  for (const [name, { anchor: from }] of merged) {
    const candidate = byName.get(name);
    if (candidate && !picked.includes(candidate)) {
      picked.push(candidate);
      matchedAnchor[candidate.neighbourhood] = from;
    }
  }

  // If similarity somehow matched nothing usable, say so rather than
  // returning an empty shortlist the caller would render as "no areas".
  if (picked.length === 0) return null;
  return { anchor, anchors, candidates: picked, matchedAnchor };
}

function coordsFrom(candidates: AreaCandidate[]): Record<string, Coords> {
  const out: Record<string, Coords> = {};
  for (const c of candidates) {
    out[c.stations[0]] = { lat: c.lat, lng: c.lng };
    out[c.neighbourhood] = { lat: c.lat, lng: c.lng };
  }
  return out;
}
