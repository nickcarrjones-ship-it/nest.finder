import { mapsLink } from '../itinerary';
import { walkMinutes } from './amenities';
import type { FriendTopic } from './friend';

/**
 * The swipeable place cards under a friend-style answer (Nick, 2026-10-01:
 * the old full-width cards were "basic" and too big), plus the TikTok and
 * Instagram hand-offs. PURE, so it is testable under Node.
 */
export interface PlaceCard {
  placeId: string;
  name: string;
  rating: number | null;
  ratingCount: number | null;
  /** "Indian", "Pub", "Café" — from Google's own place type. */
  label: string | null;
  /** On foot from the station, never just "6 min walk" (Nick: "that could be anywhere"). */
  walkMins: number;
  station: string;
  photoUrl: string | null;
  mapsUrl: string;
}

/** "indian_restaurant" -> "Indian", "coffee_shop" -> "Café", "pub" -> "Pub". */
export function typeLabel(primaryType: string | null): string | null {
  if (!primaryType) return null;
  const special: Record<string, string> = {
    cafe: 'Café', coffee_shop: 'Café', pub: 'Pub', bar: 'Bar', wine_bar: 'Wine bar',
    cocktail_bar: 'Cocktail bar', restaurant: 'Restaurant', brunch_restaurant: 'Brunch',
    breakfast_restaurant: 'Breakfast', fine_dining_restaurant: 'Fine dining', bakery: 'Bakery',
  };
  if (special[primaryType]) return special[primaryType];
  const base = primaryType.replace(/_restaurant$/, '').replace(/_/g, ' ');
  return base ? base[0].toUpperCase() + base.slice(1) : null;
}

export function toPlaceCard(
  place: {
    id: string; name: string; rating: number | null; ratingCount: number | null;
    primaryType: string | null; lat: number | null; lng: number | null;
  },
  station: { name: string; lat: number; lng: number },
  photoUrl: string | null,
): PlaceCard {
  return {
    placeId: place.id,
    name: place.name,
    rating: place.rating,
    ratingCount: place.ratingCount,
    label: typeLabel(place.primaryType),
    walkMins:
      typeof place.lat === 'number' && typeof place.lng === 'number'
        ? walkMinutes(station, { lat: place.lat, lng: place.lng })
        : 0,
    station: station.name,
    photoUrl,
    mapsUrl: mapsLink(place.id, place.name),
  };
}

/** "Clapham Common" -> "claphamcommon": an area as an Instagram hashtag. */
export function areaTag(area: string): string {
  return area.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

/**
 * The area's own hashtag page, for the map's area card (Nick, 2026-10-01:
 * #earlsfield "is just reels about the area and gives people a really good
 * feeling of what the area is like"). Instagram's app claims every
 * instagram.com link, so this opens in the app.
 */
export function instagramAreaUrl(area: string): string {
  return `https://www.instagram.com/explore/tags/${areaTag(area)}/`;
}

/**
 * Where "See it on TikTok / Instagram" go under an Ask Maloca answer. Kept
 * here, together, because these are the bits most likely to need tweaking
 * after testing on a phone.
 *
 * Both follow the TOPIC (Nick, 2026-10-01): "earlsfield pubs", "earlsfield
 * coffee", "earlsfield pizza". A hashtag cannot hold a space and combined
 * tags (#earlsfieldpubs) are mostly empty, so Instagram gets its keyword
 * search for those words; a broad "what's it like" question gets the area's
 * own hashtag, which is the strong one. UNTESTED ON A PHONE: if keyword
 * search does not open in the Instagram app, swap the instagram line below to
 * `explore/tags/${areaTag(area)}${word}/`.
 *
 * TikTok: a search for the same words. TikTok's app does not claim search
 * links (its apple-app-site-association, checked 2026-10-01), so this opens
 * TikTok search in the browser.
 */
export function topicWord(topic: FriendTopic, cuisine: string | null = null): string | null {
  if (cuisine) return cuisine;
  return { drink: 'pubs', food: 'food', cafe: 'coffee', shops: 'shops', general: null }[topic];
}

export function socialLinks(
  area: string,
  topic: FriendTopic,
  cuisine: string | null = null,
): { tiktok: string; instagram: string } {
  const word = topicWord(topic, cuisine);
  const words = word ? `${area} ${word}` : `${area} London`;
  return {
    tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(words)}`,
    instagram: word
      ? `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(`${area} ${word}`.toLowerCase())}`
      : instagramAreaUrl(area),
  };
}
