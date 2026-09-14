import type { Profile } from './types';
import { PREFERENCE_TAGS, type PreferenceTag } from './similarity/tags';

/**
 * A morning out in an area someone is thinking about.
 *
 * The app tells people to go and stand in a place and then gives them
 * nothing to do when they get there. This turns what they already told us
 * they like — "the common and being able to walk to a decent pub" — into
 * two or three real places to go, with a Maps link to each.
 *
 * See docs/explore-itinerary.md for why this cannot be built the way every
 * other dataset here is built. The short version: Google's terms permit
 * caching a place_id indefinitely and essentially nothing else, so venue
 * NAMES cannot be stored and must be re-fetched on every view.
 *
 * This file holds the part that is ours: turning preferences into
 * searches, and the reasoning attached to a stop. Both are our own content
 * and both are storable. Nothing Google returns belongs in here.
 */

/** What we ask Places for, and what kind of stop it makes. */
export interface StopPlan {
  /** The Places text query. */
  query: string;
  /** Which of their stated preferences this is serving. */
  because: PreferenceTag;
  /** Our own words about why this stop is here — ours to store. */
  reason: string;
}

/**
 * The searches a household's own preferences justify.
 *
 * Driven off `preferenceTags`, which is a FIXED vocabulary
 * (lib/similarity/tags.ts) the Agent already extracts and the ranking
 * already weights — so an itinerary is built from the same answers that
 * chose the area, not from a second interpretation of them. A free-text
 * reading would let the itinerary and the ranking disagree about what
 * someone said, which is the kind of quiet inconsistency nobody can debug.
 *
 * Tags with no sensible outing are deliberately absent: "period_property"
 * and "spacious_homes" are about housing stock, and there is nothing to go
 * and do about them on a Saturday.
 */
const OUTINGS: Partial<Record<PreferenceTag, Omit<StopPlan, 'because'>>> = {
  cafe_culture: {
    query: 'independent coffee shop',
    reason: 'You said the cafés matter — this is the one to try first.',
  },
  independent_shops: {
    query: 'independent shop',
    reason: 'Independent rather than chains, which is what you said you liked.',
  },
  nightlife: {
    query: 'bar',
    reason: 'Somewhere to see what the evening actually feels like here.',
  },
  good_restaurants: {
    query: 'restaurant',
    reason: 'Worth booking if you want to judge the food scene properly.',
  },
  cosmopolitan: {
    query: 'restaurant',
    reason: 'A taste of how varied the food gets around here.',
  },
  big_park_nearby: {
    query: 'park',
    reason: 'The green space you said you wanted within walking distance.',
  },
  lots_of_green: {
    query: 'park',
    reason: 'Somewhere to see whether the green really is on the doorstep.',
  },
  weekend_destination: {
    query: 'market',
    reason: 'Where the area is at its busiest — go on a Saturday.',
  },
  local_and_lowkey: {
    query: 'pub',
    reason: 'A local rather than a destination, which is what you described.',
  },
  quiet: {
    query: 'pub',
    reason: 'Somewhere to sit and hear how quiet it actually is.',
  },
  family_area: {
    query: 'playground',
    reason: 'Worth seeing who is around on a weekend afternoon.',
  },
};

/**
 * A real day out for a household who told us nothing we can act on.
 *
 * It used to be a single pub, which produced a "day" of one stop and the
 * line "a first look at who actually spends time here" — words that read
 * as filler because they were (Nick, 2026-09-14). Coffee, a park and a
 * pub is an actual Sunday anywhere in London, and each stop says
 * something true about why it is there.
 *
 * Only reached when no preference tag maps to an outing. The tags come
 * from the Agent conversation and are saved through a change card, so an
 * unconfirmed card is enough to land a household here.
 */
const FALLBACK: StopPlan[] = [
  {
    query: 'independent coffee shop',
    because: 'cafe_culture',
    reason: 'Somewhere to start the morning and watch the place wake up.',
  },
  {
    query: 'park',
    because: 'big_park_nearby',
    reason: 'The nearest green space — worth seeing who uses it on a Sunday.',
  },
  {
    query: 'pub',
    because: 'local_and_lowkey',
    reason: 'A proper local, which tells you more about an area than any number we hold.',
  },
];

/** How many stops. Three is a morning; five is a schedule nobody keeps. */
export const MAX_STOPS = 3;

export function planItinerary(profile: Profile | null): StopPlan[] {
  const tags = (profile?.lifestyle?.preferenceTags ?? []) as PreferenceTag[];

  const stops: StopPlan[] = [];
  const usedQueries = new Set<string>();
  for (const tag of tags) {
    const outing = OUTINGS[tag];
    if (!outing) continue;
    // Two tags can point at the same outing — cafe_culture and
    // independent_shops both lead to independents. One stop, not two
    // versions of the same walk.
    if (usedQueries.has(outing.query)) continue;
    usedQueries.add(outing.query);
    stops.push({ ...outing, because: tag });
    if (stops.length >= MAX_STOPS) break;
  }

  return stops.length > 0 ? stops : FALLBACK.slice(0, MAX_STOPS);
}

/** Every tag that could produce an outing — for tests, and so the list
 *  above cannot silently drift from the real vocabulary. */
export function outingTags(): PreferenceTag[] {
  return Object.keys(OUTINGS) as PreferenceTag[];
}

/**
 * A stop as it is STORED: a place id, and our own sentence.
 *
 * The venue's name is deliberately absent. It is Google's content, it has
 * no caching exception, and it is re-fetched on every view. Putting it here
 * would be the one mistake that turns a compliant feature into a
 * redistribution of someone else's database.
 */
export interface StoredStop {
  placeId: string;
  reason: string;
  because: PreferenceTag;
}

/** A Maps link for a place. Needs no API key and no billing — this half of
 *  the feature is free however the rest is paid for. */
export function mapsLink(placeId: string, name?: string): string {
  const q = name ? `&query=${encodeURIComponent(name)}` : '';
  return `https://www.google.com/maps/search/?api=1${q}&query_place_id=${encodeURIComponent(placeId)}`;
}

/** Guards what a stop plan may become, so an empty query never reaches a
 *  paid API call. */
export function isUsableStop(s: StopPlan): boolean {
  return s.query.trim().length > 0 && Boolean(PREFERENCE_TAGS[s.because]);
}
