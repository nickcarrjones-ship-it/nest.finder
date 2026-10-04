/**
 * "South East" is not an area (Nick, 2026-10-04).
 *
 * Max was asked which areas he was looking at and answered "South East".
 * The app holds data for neighbourhoods, not compass points, so an answer
 * like that anchored to nothing and every suggestion after it was a guess.
 * Instead, a region answer is turned into buttons: the neighbourhoods a
 * Londoner would name in that part of town, and they pick their favourite
 * three.
 *
 * Three, not "as many as fit" (Nick): making them choose is the point.
 * Picking every button is the same as saying "South East" again.
 */

import { normaliseName } from './ranking/normaliseName';
import { resolveAreaName } from './ranking/anchor';
import { areasNamedIn } from './namedAreas';
import type { AreaCards } from './types';

export type RegionKey =
  | 'central' | 'north' | 'northEast' | 'east' | 'southEast'
  | 'south' | 'southWest' | 'west' | 'northWest';

/**
 * How many areas they may love going in - from a region, or from a list
 * that ran long (Nick, 2026-10-04: "they can only name 3 areas"). The
 * first question says so.
 */
export const MAX_REGION_PICKS = 3;

/**
 * The names a Londoner would say for each part of town, best known first.
 *
 * Hand-picked rather than drawn from the station list by compass bearing:
 * a bearing puts Brixton in "south east" and Fulham in "south west", and
 * nobody who lives there would agree. These follow how people actually
 * talk about London, which is roughly by postcode.
 *
 * Every name resolves to an area the app holds data for (see the test), so
 * a pick always becomes a real anchor. Where a bare name could mean
 * several places the label decides, the same way it does when somebody
 * types it - "Peckham" is Peckham Rye, "Tooting" is the Broadway.
 */
export const REGION_AREAS: Record<RegionKey, string[]> = {
  central: [
    'Marylebone', 'Angel', 'Farringdon', 'Borough', 'Bermondsey', 'Pimlico',
    'Kennington', 'Shoreditch', "King's Cross", 'Barbican', 'Bloomsbury', 'Fitzrovia',
  ],
  north: [
    'Islington', 'Highbury', 'Crouch End', 'Muswell Hill', 'Stoke Newington', 'Hampstead',
    'Kentish Town', 'Camden Town', 'Highgate', 'Tufnell Park', 'Finsbury Park', 'West Hampstead',
    'Kilburn', 'Walthamstow',
  ],
  northEast: [
    'Walthamstow', 'Stoke Newington', 'Clapton', 'Leyton', 'Leytonstone', 'Wanstead',
    'Harringay', 'Tottenham', 'Seven Sisters', 'Woodford',
  ],
  east: [
    'Hackney', 'Dalston', 'Shoreditch', 'Bethnal Green', 'London Fields', 'Hackney Wick',
    'Clapton', 'Bow', 'Stratford', 'Walthamstow', 'Leyton', 'Mile End', 'Limehouse', 'Canary Wharf',
  ],
  southEast: [
    'Peckham', 'East Dulwich', 'Brockley', 'Greenwich', 'Blackheath', 'Herne Hill',
    'Camberwell', 'Forest Hill', 'Crystal Palace', 'Nunhead', 'Lewisham', 'Deptford',
    'Honor Oak', 'Sydenham', 'Bermondsey', 'Catford',
  ],
  south: [
    'Clapham Common', 'Brixton', 'Balham', 'Peckham', 'East Dulwich', 'Tooting',
    'Battersea', 'Herne Hill', 'Wandsworth', 'Streatham', 'Brockley', 'Greenwich',
    'Kennington', 'Crystal Palace', 'Stockwell',
  ],
  southWest: [
    'Clapham Common', 'Battersea', 'Wandsworth', 'Putney', 'Balham', 'Tooting',
    'Earlsfield', 'Wimbledon', 'Southfields', 'Clapham Junction', 'Fulham', 'Barnes',
    'Raynes Park', 'Richmond',
  ],
  west: [
    'Chiswick', 'Notting Hill', 'Fulham', 'Hammersmith', 'Ealing', "Shepherd's Bush",
    'Kensington', 'Acton', 'Ravenscourt Park', 'Turnham Green', 'Ladbroke Grove', 'Holland Park',
    'Kew', 'Hanwell',
  ],
  northWest: [
    'West Hampstead', 'Kilburn', "Queen's Park", 'Kensal Rise', 'Hampstead', 'Belsize Park',
    'Swiss Cottage', 'Maida Vale', "St John's Wood", 'Willesden Green', 'Kensal Green', 'Kentish Town',
  ],
};

/** A region named in what somebody typed. */
export interface RegionMention {
  /** Their words, as typed - "South East", "north of the river". */
  said: string;
  keys: RegionKey[];
}

const COMPASS = '(north|south|east|west)(?: ?(east|west))?';

/**
 * What may follow a compass word for it to mean a part of town rather than
 * the start of a place name. "South East" and "south east London" are
 * regions; "East Dulwich" and "West Hampstead" are not, because a place
 * name follows. Listing what MAY follow, rather than what may not, means a
 * station added later can never be mistaken for a region.
 */
const AFTER =
  '(?=$|[,.;:!?)\\/&]|\\s+(?:and|or|but|maybe|probably|ish|side|somewhere|area|areas|way|really|too|i|we|im|i\'m|because|cos|as|for|like|is|would|generally|mostly|please|preferably|ideally|though|anywhere|zones?|near|around|in|of\\s+london|\\d))';

/** "up north" and "from the north" are about where they are moving FROM. */
const BEFORE_NOT = /(?:\bup|\bfrom(?: the)?|\boop)\s*$/;

function keyFor(first: string, second: string | undefined): RegionKey {
  if (!second) return first as 'north' | 'south' | 'east' | 'west';
  // "east west" is not a direction anybody means; treat as the first word.
  if (first === 'north') return second === 'east' ? 'northEast' : 'northWest';
  if (first === 'south') return second === 'east' ? 'southEast' : 'southWest';
  return first as 'east' | 'west';
}

/**
 * Every part of town named in the text, in the order they were said.
 *
 * Returns null when there is none, which is nearly always: an answer that
 * names real places ("Clapham and Balham") goes through as it always has.
 * A region alongside real places ("East Dulwich, or anywhere south east")
 * still counts, since "anywhere south east" is the vague half that needs
 * pinning down.
 */
export function regionsInText(text: string): RegionMention | null {
  // Lowercase and hyphens to spaces keep every character where it was, so
  // a match can be cut back out of the original to quote their own words.
  const lower = text.toLowerCase().replace(/[-–]/g, ' ');
  const keys: RegionKey[] = [];
  const said: string[] = [];
  const add = (key: RegionKey, at: number, length: number) => {
    if (!keys.includes(key)) keys.push(key);
    const words = text.slice(at, at + length).trim();
    if (!said.some((s) => s.toLowerCase() === words.toLowerCase())) said.push(words);
  };

  // "south of the river" / "north of the river".
  for (const m of lower.matchAll(/\b(north|south) of the (?:river|thames)\b/g)) {
    add(m[1] as RegionKey, m.index ?? 0, m[0].length);
  }

  // "central london", "central" on its own, "zone 1"-ish answers are left
  // to the Zone 1 question.
  for (const m of lower.matchAll(new RegExp(`\\bcentral(?: london)?${AFTER}`, 'g'))) {
    add('central', m.index ?? 0, m[0].length);
  }

  // "the east end".
  for (const m of lower.matchAll(/\bthe east end\b/g)) add('east', (m.index ?? 0) + 4, 8);

  // "SE London", "NW london". Only with "London" after it: on its own "se"
  // is too short to be sure of.
  for (const m of lower.matchAll(/\b(ne|nw|se|sw)\s+london\b/g)) {
    const map: Record<string, RegionKey> = { ne: 'northEast', nw: 'northWest', se: 'southEast', sw: 'southWest' };
    add(map[m[1]], m.index ?? 0, m[0].length);
  }

  for (const m of lower.matchAll(new RegExp(`\\b${COMPASS}(?: london)?${AFTER}`, 'g'))) {
    const at = m.index ?? 0;
    if (BEFORE_NOT.test(lower.slice(0, at))) continue;
    // Already counted as part of "south of the river".
    if (/^\s*of the (?:river|thames)/.test(lower.slice(at + m[0].length))) continue;
    if (/^east end\b/.test(lower.slice(at))) continue;
    add(keyFor(m[1], m[2]), at, m[0].length);
  }

  return keys.length ? { said: said.join(' or '), keys } : null;
}

/**
 * The buttons for one or more regions: the best known from each, taken in
 * turn so "south east or south west" shows both halves near the top, never
 * the same name twice. Capped so it stays a choice rather than a list.
 */
export function regionOptions(keys: RegionKey[], limit = 16): string[] {
  const lists = keys.map((k) => REGION_AREAS[k]);
  const out: string[] = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const name = list[i];
      if (name && !out.includes(name) && out.length < limit) out.push(name);
    }
  }
  return out;
}

/**
 * Whether a name the model extracted is a region rather than a place -
 * "South East London", "north London". Those never become an area card:
 * nothing can be matched to them, and the buttons are how the region gets
 * pinned down.
 */
export function isRegionName(name: string): boolean {
  const n = normaliseName(name.replace(/[-–]/g, ' '));
  return (
    /^(the )?(north|south|east|west)( (east|west))?( london)?$/.test(n) ||
    /^(the )?central( london)?$/.test(n) ||
    /^(the )?east end$/.test(n) ||
    /^(ne|nw|se|sw) london$/.test(n) ||
    /^(north|south) of the (river|thames)$/.test(n)
  );
}

/** The "pick your favourite 3" screen, if an answer needs one. */
export interface FavouritesAsk {
  /** The places they named, as they would say them. */
  named: string[];
  /** Their words for a region, if they gave one - "South East". */
  region?: string;
  /** The buttons: what they named first, then the region's best known. */
  options: string[];
}

/**
 * Whether the answer to "which areas are you considering?" has to be
 * narrowed down, and to what.
 *
 * Two reasons it would (Nick, 2026-10-04): a region, which matches nothing
 * ("South East"), or more than three places. Either way the same screen:
 * buttons, pick up to three. Three or fewer real places go straight
 * through, as they always have.
 */
export function favouritesFor(text: string): FavouritesAsk | null {
  const region = regionsInText(text);
  const named = areasNamedIn(text);
  if (!region && named.length <= MAX_REGION_PICKS) return null;
  const options = [...named];
  if (region) {
    for (const name of regionOptions(region.keys)) {
      if (options.length >= 18) break;
      if (!options.some((o) => sameArea(o, name))) options.push(name);
    }
  }
  return { named, region: region?.said, options };
}

/**
 * Whether two names are the same place to us: the same words, or the same
 * area once resolved - "Clapham" and "Clapham Common" both are.
 */
export function sameArea(a: string, b: string): boolean {
  if (normaliseName(a) === normaliseName(b)) return true;
  const ra = resolveAreaName(a);
  return ra !== null && ra === resolveAreaName(b);
}

/** Loved areas that are not among their picks, to be let go. */
export function lovedNotPicked(cards: AreaCards | undefined, picks: string[]): string[] {
  return Object.entries(cards ?? {})
    .filter(([name, v]) => v === 'love' && !picks.some((p) => sameArea(p, name)))
    .map(([name]) => name);
}
