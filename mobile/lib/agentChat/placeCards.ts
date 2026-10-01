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

/**
 * Where "See it on TikTok / Instagram" go. Kept here, together, because
 * these are the bits most likely to need tweaking after testing on a phone.
 *
 * TikTok: a search for the exact topic, which is the strong option - search
 * takes any phrase. TikTok's app only claims hashtag and profile links, not
 * search, so this opens TikTok's search in the browser (checked against its
 * apple-app-site-association, 2026-10-01).
 *
 * Instagram: the area's hashtag page. Instagram has no reliable link that
 * searches Reels by phrase, and topic tags (#tootingpubs) are often empty,
 * so the area's own tag is the dependable choice. Instagram's app claims
 * all instagram.com links, so this opens in the app.
 */
export function socialLinks(area: string, topic: FriendTopic): { tiktok: string; instagram: string } {
  const phrase: Record<FriendTopic, string> = {
    drink: `best pubs ${area}`,
    food: `best restaurants ${area}`,
    cafe: `best cafes ${area}`,
    shops: `${area} high street`,
    general: `${area} London`,
  };
  const tag = area.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  return {
    tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(phrase[topic])}`,
    instagram: `https://www.instagram.com/explore/tags/${tag}/`,
  };
}
