import namedPlaces from '../../assets/data/area-named-places.json';

/**
 * "What's the high street like in Tooting Broadway?" answered the way a
 * friend who lives there would (Nick, 2026-10-01): the market, the pubs
 * round the station, the M&S, the run of Indian and Pakistani places
 * towards the Broadway. Not "284 places to eat within a mile".
 *
 * The voice is free; the NAMES are not. Every business the answer names
 * must come from the place brief built here: OpenStreetMap's named places
 * around the station, plus Google's rated places for food and drink. That
 * is what stops a friendly answer inventing an M&S.
 *
 * PURE (no network, no React Native), so it is testable under Node. The
 * Google lookup happens in the store and is passed in.
 */

export type FriendTopic = 'general' | 'food' | 'drink' | 'cafe' | 'shops';

/**
 * Cuisines people ask for by name ("I love pizza, any good spots?"). A
 * named cuisine makes it a food question and narrows the Google search to
 * that cuisine (Nick, 2026-10-01).
 */
const CUISINES = [
  'pizza', 'pizzas', 'sushi', 'ramen', 'curry', 'curries', 'indian', 'thai', 'chinese', 'japanese',
  'korean', 'vietnamese', 'italian', 'pasta', 'tapas', 'spanish', 'greek', 'turkish', 'lebanese',
  'mexican', 'tacos', 'burgers?', 'steak', 'seafood', 'fish', 'dim sum', 'noodles', 'brunch',
  'caribbean', 'ethiopian', 'french', 'vegan', 'vegetarian', 'middle eastern', 'sri lankan', 'pakistani',
];

const TOPICS: { topic: FriendTopic; match: RegExp }[] = [
  // Clubs too (Nick, 2026-10-03: "what's the club scene like in Clapham
  // Common" fell through to the area answer and came back as footfall
  // figures). "Tennis club" and the like are kept out by NOT_NIGHTLIFE.
  { topic: 'drink', match: /\b(pubs?|bars?|pints?|drinks?|drinking|nightlife|night life|going out|nights? out|night ?clubs?|clubs?|clubbing|club scene|dancing|late[- ]night|cocktails?)\b/i },
  { topic: 'cafe', match: /\b(caf[eé]s?|coffee|brunch)\b/i },
  { topic: 'food', match: /\b(restaurants?|eat|eating|food|foodie|dinner|lunch|cuisines?)\b/i },
  { topic: 'food', match: new RegExp(`\\b(${CUISINES.join('|')})\\b`, 'i') },
  { topic: 'shops', match: /\b(shops?|shopping|markets?)\b/i },
  {
    topic: 'general',
    match: /\b(high street|what(?:'s| is)\b.*\blike|vibe|feel|character|atmosphere|worth (?:a )?(?:visit|look)|tell me about|describe|what's there|what is there)\b/i,
  },
];

/** A club that is not a night out. */
const NOT_NIGHTLIFE = /\b(golf|tennis|football|rugby|cricket|book|sports?|running|run|swimming|social|members'?|chess|cycling|rowing|youth|kids'?|breakfast|health) clubs?\b/i;

/** Asking about a night out rather than a pub: clubs, bars, cocktails. */
const NIGHTLIFE = /\b(night ?clubs?|clubs?|clubbing|club scene|dancing|nightlife|night life|late[- ]night|cocktails?|bars?|nights? out|going out)\b/i;

/** The kind of "what's it like" question this is, or null if it is not one. */
export function friendTopic(said: string): FriendTopic | null {
  const cleaned = said.replace(NOT_NIGHTLIFE, '');
  return TOPICS.find((t) => t.match.test(cleaned))?.topic ?? null;
}

/** What Google should be asked for, if anything, per topic. */
/** The cuisine they named, if any: "pizza", "sushi". */
export function cuisineAsked(said: string): string | null {
  const m = new RegExp(`\\b(${CUISINES.join('|')})\\b`, 'i').exec(said);
  return m ? m[1].toLowerCase().replace(/s$/, '') : null;
}

export function googleQueryFor(topic: FriendTopic, said = ''): string | null {
  const cuisine = cuisineAsked(said);
  if (topic === 'food' && cuisine && cuisine !== 'brunch') return `${cuisine} restaurant`;
  if (topic === 'food' || topic === 'general') return 'restaurant';
  if (topic === 'drink') {
    // What a night out actually needs looking up: clubs for clubs, bars for
    // bars and cocktails, pubs otherwise.
    if (/\b(night ?clubs?|clubs?|clubbing|club scene|dancing)\b/i.test(said) && !NOT_NIGHTLIFE.test(said)) return 'night club';
    if (/\bcocktails?\b/i.test(said)) return 'cocktail bar';
    if (NIGHTLIFE.test(said)) return 'bar';
    return 'pub';
  }
  if (topic === 'cafe') return 'cafe';
  return null;
}

/** Google types that are takeaways, never "proper places to eat". */
const TAKEAWAY_TYPES = new Set([
  'fast_food_restaurant', 'meal_takeaway', 'meal_delivery', 'chicken_wings_restaurant',
  'hamburger_restaurant', 'sandwich_shop', 'kebab_shop',
]);
const TAKEAWAY_NAME = /\b(kebab|chicken|fried|peri[ -]?peri|chippy|takeaway|domino'?s|kfc|mcdonald'?s|burger king|subway|greggs|papa john'?s|pizza hut)\b/i;

export interface RatedPlace {
  name: string;
  rating: number | null;
  ratingCount: number | null;
  primaryType: string | null;
}

/** Keep Google's results that are real sit-down places with a real rating. */
export function keepRated<T extends RatedPlace>(places: T[], topic: FriendTopic): T[] {
  return places.filter((p) => {
    if (!p.name || p.rating === null || (p.ratingCount ?? 0) < 30) return false;
    if (topic === 'food' || topic === 'general') {
      if (p.primaryType && TAKEAWAY_TYPES.has(p.primaryType)) return false;
      if (TAKEAWAY_NAME.test(p.name)) return false;
    }
    return true;
  });
}

type Row = [string, string | null, number, number];
interface AreaPlaces {
  stats: {
    restaurants: number; fastFood: number; pubs: number;
    chainShare: number; chainNames: string[]; cuisines: [string, number][];
  };
  restaurant: Row[]; pub: Row[]; bar: Row[]; cafe: Row[];
  market: Row[]; supermarket: Row[]; department: Row[];
}

function placesFor(area: string): AreaPlaces | undefined {
  return (namedPlaces.areas as unknown as Record<string, AreaPlaces>)[area];
}

const names = (rows: Row[], n: number) =>
  rows.slice(0, n).map(([name, cuisine, chain]) =>
    `${name}${cuisine ? ` (${cuisine.replace(/_/g, ' ')})` : ''}${chain ? ' [CHAIN]' : ''}`,
  ).join('; ');

/**
 * A count as a friend would say it. The brief never carries the number
 * itself: a model given "104" quotes "104" (Nick, 2026-10-03).
 */
export function howMany(n: number): string {
  if (n <= 0) return 'none';
  if (n <= 2) return 'one or two';
  if (n <= 9) return 'a handful';
  if (n <= 24) return 'a good few';
  if (n <= 59) return 'plenty';
  return 'loads';
}

/**
 * The facts a friend would draw on, as text for the prompt. Only what the
 * topic needs: a question about pubs gets pubs.
 */
export function placeBrief(area: string, topic: FriendTopic, rated: RatedPlace[] = []): string | null {
  const p = placesFor(area);
  if (!p) return null;
  const s = p.stats;
  const lines: string[] = [`PLACES WITHIN ABOUT 1KM OF ${area.toUpperCase()} STATION (OpenStreetMap):`];
  const wantFood = topic === 'food' || topic === 'general';
  const wantDrink = topic === 'drink' || topic === 'general';
  const wantCafe = topic === 'cafe' || topic === 'general';
  const wantShops = topic === 'shops' || topic === 'general';

  if (wantFood) {
    const chainPct = Math.round(s.chainShare * 100);
    lines.push(
      `Sit-down restaurants: ${howMany(s.restaurants)} (takeaways, separately: ${howMany(s.fastFood)}). ` +
        `${chainPct >= 50 ? 'Most of the restaurants are chains' : chainPct >= 25 ? 'A big share of the restaurants are chains' : 'Mostly independents'}` +
        `${s.chainNames.length && chainPct >= 25 ? ` (${s.chainNames.join(', ')})` : ''}` +
        `${chainPct >= 25 ? ' - say plainly that the food here leans on chains.' : '.'}`,
    );
    if (s.cuisines.length) lines.push(`Most common cuisines, commonest first: ${s.cuisines.map(([c]) => c.replace(/_/g, ' ')).join(', ')}`);
    if (p.restaurant.length) lines.push(`Restaurants, nearest first: ${names(p.restaurant, 12)}`);
  }
  if (wantDrink) {
    lines.push(`Pubs: ${howMany(s.pubs)}. Nearest: ${names(p.pub, 8) || 'none mapped'}`);
    if (p.bar.length) lines.push(`Bars: ${names(p.bar, 4)}`);
  }
  if (wantCafe && p.cafe.length) lines.push(`Cafés: ${names(p.cafe, 5)}`);
  if (wantShops) {
    if (p.market.length) lines.push(`Markets: ${names(p.market, 3)}`);
    if (p.supermarket.length) lines.push(`Supermarkets: ${names(p.supermarket, 4)}`);
    if (p.department.length) lines.push(`Bigger shops: ${names(p.department, 3)}`);
  }
  if (rated.length) {
    lines.push(
      `WELL RATED ON GOOGLE nearby: ${rated
        .map((r) => `${r.name} ${r.rating?.toFixed(1)} (${r.ratingCount} reviews)`)
        .join('; ')}`,
    );
  }
  return lines.join('\n');
}
