import { auth } from './firebase';
import { NotSignedInError } from './ranking/anthropicClient';

/**
 * Asks the Places proxy for real venues near an area.
 *
 * Everything about WHY a stop is on the list is ours and lives in
 * itinerary.ts; this only fetches the places themselves. The split is not
 * tidiness — Google's terms permit caching a place_id indefinitely and
 * essentially nothing else, so a venue's NAME must be re-fetched every
 * time it is shown and can never be stored. See docs/explore-itinerary.md.
 *
 * The proxy holds the key and the spending caps: a per-household ceiling
 * under a global one, because Places bills at the tier of the most
 * expensive field asked for and `rating` alone drops the free allowance
 * from 5,000 calls a month to 1,000.
 */

const PLACES_URL = 'https://europe-west1-nestfinderv3.cloudfunctions.net/placesSearch';

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export class PlacesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlacesUnavailableError';
  }
}

/**
 * One search, biased to the area rather than filtered by it.
 *
 * A radius is a bias in Places, not a fence — a search near Queens Park
 * can still return something a mile away if it is the best answer. That
 * is the right behaviour for "where should I get coffee", and the reason
 * the reply names the place rather than promising it is on the doorstep.
 */
export async function searchPlaces(
  query: string,
  at: { lat: number; lng: number },
  radius = 1200,
): Promise<Place[]> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  const idToken = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      // withRating is deliberately NOT sent. It is the field that moves the
      // whole request into the Enterprise tier, and a name and address is
      // all an itinerary shows.
      body: JSON.stringify({ query, lat: at.lat, lng: at.lng, radius }),
    });
  } catch {
    throw new PlacesUnavailableError('No connection.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'unknown';
    console.warn('[places] refused:', res.status, code);
    throw new PlacesUnavailableError(
      code === 'places_monthly_limit_reached' || code === 'places_globally_unavailable'
        ? "I've looked up a lot of places this month — try again next month."
        : "Couldn't look up places just now.",
    );
  }

  const places = Array.isArray(data?.places) ? data.places : [];
  return places
    .map((p: Record<string, any>): Place => ({
      id: String(p?.id ?? ''),
      name: String(p?.displayName?.text ?? '').trim(),
      address: typeof p?.formattedAddress === 'string' ? p.formattedAddress : null,
      lat: typeof p?.location?.latitude === 'number' ? p.location.latitude : null,
      lng: typeof p?.location?.longitude === 'number' ? p.location.longitude : null,
    }))
    .filter((p: Place) => p.id && p.name);
}
