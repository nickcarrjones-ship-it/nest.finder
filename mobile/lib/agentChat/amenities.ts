import type { Place } from '../placesClient';
import { mapsLink } from '../itinerary';
import { distanceKm } from '../ranking/placeLabels';
import { WALK_RADIUS_M, describeRating, type OutingStop } from './outing';

/**
 * "Where are the GP surgeries in Tooting Broadway?" — answered from Google
 * Places, not from the model's memory.
 *
 * WHY THIS EXISTS. Until 2026-09-23 a question like that named an area and
 * looked like a question, so it routed to the area answer — built from a
 * brief that holds no GPs, no gyms and no shops at all. The model then
 * filled the gap from its own knowledge, which is to say it invented
 * surgeries, with street names. That is the one failure the whole brief
 * system exists to prevent, happening in the open (Nick, 2026-09-22).
 *
 * Nothing in the app's own data can answer it: area-places.json holds 812
 * map LABELS, not venues, and no dataset here names a single business. A
 * live lookup is the only honest option, which is also why this is the one
 * feature that cannot be shipped as a JSON file like every other.
 *
 * PURE, so the matching and the wording are testable without a network.
 */

export interface AmenityAsk {
  /** What to send Google. */
  query: string;
  /** How to say it back to somebody: "GP surgeries", "gyms". */
  label: string;
  /**
   * Whether they asked for the BEST one rather than where they are.
   *
   * This decides the billing tier, so it is not cosmetic. Ratings put the
   * request in Places' Enterprise bucket (1,000 free calls a month against
   * Pro's 5,000), so "where is the nearest pharmacy" must not pay for data
   * it is not going to use.
   */
  wantsBest: boolean;
}

/**
 * The categories worth looking up, and deliberately NOT the ones the app
 * already answers better from its own measured data.
 *
 * Schools are the clearest exclusion: we hold every school within reach of
 * all 585 stations with its verbatim Ofsted wording, which is a far better
 * answer than a Places rating. Parks are excluded for the same reason —
 * area-parks.json names the nearest one with its size in hectares.
 * Routing either here would replace a good answer with a worse one.
 */
const CATEGORIES: { match: RegExp; query: string; label: string }[] = [
  { match: /\b(gp|gps|doctors?|surgery|surgeries|medical centre|health centre)\b/i, query: 'GP surgery', label: 'GP surgeries' },
  { match: /\b(dentists?|dental)\b/i, query: 'dentist', label: 'dentists' },
  { match: /\b(pharmac(?:y|ies)|chemists?)\b/i, query: 'pharmacy', label: 'pharmacies' },
  { match: /\b(gyms?|leisure centres?|fitness)\b/i, query: 'gym', label: 'gyms' },
  { match: /\b(swimming pools?|lidos?)\b/i, query: 'swimming pool', label: 'swimming pools' },
  { match: /\b(supermarkets?|tesco|sainsburys?|waitrose|aldi|lidl|asda|morrisons)\b/i, query: 'supermarket', label: 'supermarkets' },
  { match: /\b(takeaways?|takeout)\b/i, query: 'takeaway', label: 'takeaways' },
  { match: /\b(restaurants?|places? to eat)\b/i, query: 'restaurant', label: 'restaurants' },
  { match: /\b(caf[eé]s?|coffee shops?)\b/i, query: 'coffee shop', label: 'cafés' },
  { match: /\b(pubs?|bars?)\b/i, query: 'pub', label: 'pubs' },
  { match: /\b(nurser(?:y|ies)|childcare|creches?|crèches?)\b/i, query: 'nursery', label: 'nurseries' },
  { match: /\b(vets?|veterinary)\b/i, query: 'vet', label: 'vets' },
  { match: /\b(libraries|library)\b/i, query: 'library', label: 'libraries' },
  { match: /\b(post offices?)\b/i, query: 'post office', label: 'post offices' },
];

/**
 * An ask rather than a mention — and the NAME OF THE CATEGORY is the real
 * signal here, not the grammar around it.
 *
 * The first version of this demanded a specific interrogative and was far
 * too narrow: "What gyms are in Balham?", "Tell me about gyms in Balham",
 * "What are the gyms like in Balham?" and "What gyms does Balham have?"
 * all missed, and fell through to the area answer, which is the exact
 * hallucination this file exists to stop (Nick, 2026-09-23 — he asked
 * about gyms twice and got invented ones both times).
 *
 * So a question mark is enough on its own, and the word list is a wide
 * net for the cases people type without one. Being wrong in this
 * direction is cheap: the worst outcome is real gyms in answer to a
 * question that was not quite about gyms. Being wrong the other way
 * invents businesses.
 */
const ASKING = /\?|\b(where|what|whats|which|nearest|closest|near|nearby|local|any|are there|is there|how many|best|top|good|recommend|find|show|tell me|know)\b/i;

/**
 * Somebody describing themselves, which is a preference to RECORD rather
 * than a request for addresses.
 *
 * This is the half the wide net above would otherwise get wrong: "we love
 * good pubs" trips the word "good", but it is them telling us what they
 * like — and answering it with a list would both talk over them and lose
 * the preference, because the amenity path deliberately skips extraction.
 *
 * Gated on there being no question mark, so "are we near any good pubs?"
 * is still a question however it is phrased.
 */
const DESCRIBING = /\b(?:we|i)\b[^?]*\b(?:go|goes|went|love|loves|like|likes|enjoy|enjoys|work|works|prefer|prefers|use|uses)\b/i;

/** Asked for the best rather than the nearest. Only these pay for ratings. */
const SUPERLATIVE = /\b(best|top|highest[- ]rated|favourite|favorite|good|nicest|recommend)\b/i;

export function asksForAnAmenity(said: string): AmenityAsk | null {
  const hit = CATEGORIES.find((c) => c.match.test(said));
  if (!hit) return null;
  if (!ASKING.test(said)) return null;
  if (!said.includes('?') && DESCRIBING.test(said)) return null;
  return { query: hit.query, label: hit.label, wantsBest: SUPERLATIVE.test(said) };
}

/** How many to show. Enough to be useful, few enough to read on a phone. */
const MAX_SHOWN = 4;

/**
 * Everything within the ten minute walk, best first — the plural of
 * pickBest in outing.ts, which returns one because an itinerary wants one.
 *
 * Same distance rule and the same reason for it: the Places radius is a
 * BIAS, not a fence, so a search near Tooting Broadway will happily return
 * the best answer a mile away. Filtered here against each result's own
 * coordinates.
 */
export function pickNearby(
  places: Place[],
  from: { lat: number; lng: number },
  limit = MAX_SHOWN,
): Place[] {
  return places
    .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'
      && distanceKm(from, { lat: p.lat, lng: p.lng }) * 1000 <= WALK_RADIUS_M)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0))
    .slice(0, limit);
}

/** 800m is the ten minutes, so 80m a minute. Rounded up, and never zero —
 *  "0 min walk" reads as a bug. */
export function walkMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  return Math.max(1, Math.round((distanceKm(from, to) * 1000) / 80));
}

/**
 * Amenities as cards, reusing the itinerary's own card shape.
 *
 * `reason` carries the walk instead of a preference — it is our own
 * arithmetic over coordinates rather than anything of Google's, and it is
 * the thing somebody actually wants to know next after the name.
 */
export function toAmenityStops(
  places: Place[],
  from: { lat: number; lng: number },
): OutingStop[] {
  return places.map((p) => ({
    placeId: p.id,
    name: p.name,
    rating: p.rating,
    ratingCount: p.ratingCount,
    reason: `About ${walkMinutes(from, { lat: p.lat as number, lng: p.lng as number })} min walk`,
    mapsUrl: mapsLink(p.id, p.name),
  }));
}

/**
 * The sentence above the cards.
 *
 * States where it looked and how far, because "the nearest GP" means
 * nothing without a centre and a radius — and an empty result is a real
 * answer about an area, not a failure to report.
 */
export function composeAmenities(area: string, ask: AmenityAsk, places: Place[]): string {
  if (places.length === 0) {
    return `I couldn't find any ${ask.label} within a ten minute walk of ${area}. That is worth knowing in itself, though it is worth a look on a map before you rule it out.`;
  }
  const best = ask.wantsBest && places[0] ? describeRating(places[0]) : null;
  const lead = ask.wantsBest && best
    ? `The best-rated of the ${ask.label} within a ten minute walk of ${area} is ${places[0].name}, at ${best}.`
    : `${places.length === 1 ? 'One' : places.length} ${ask.label} within a ten minute walk of ${area}:`;
  return lead;
}
