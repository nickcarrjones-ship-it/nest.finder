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
  /** 1-5, or null when Google holds none. */
  rating: number | null;
  /** How many reviews that rating rests on — a 5.0 from three people is
   *  not the same claim as a 4.5 from two thousand. */
  ratingCount: number | null;
  /** Google's reference to a photo, NOT an image URL. Turning it into one
   *  is a separate billable request — see resolvePhoto. */
  photoName: string | null;
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
 * A radius is a BIAS in Places, not a fence — a search near Queens Park
 * can still return something a mile away if it is the best answer. So
 * "within a ten minute walk" cannot be delegated to this call; the
 * distance is enforced afterwards, against each result's own coordinates
 * (see pickBest in agentChat/outing.ts).
 *
 * `withRating` is not free. Asking for the rating moves the whole request
 * into Google's Enterprise tier, where the monthly allowance is 1,000
 * calls rather than 5,000 — one field changes the price of everything
 * else in the request. It is opt-in for that reason, and the proxy counts
 * the two tiers separately.
 */
export async function searchPlaces(
  query: string,
  at: { lat: number; lng: number },
  { radius = 1200, withRating = false }: { radius?: number; withRating?: boolean } = {},
): Promise<Place[]> {
  const user = auth.currentUser;
  if (!user) throw new NotSignedInError();

  const idToken = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ query, lat: at.lat, lng: at.lng, radius, withRating }),
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
      rating: typeof p?.rating === 'number' ? p.rating : null,
      ratingCount: typeof p?.userRatingCount === 'number' ? p.userRatingCount : null,
      photoName: typeof p?.photos?.[0]?.name === 'string' ? p.photos[0].name : null,
    }))
    .filter((p: Place) => p.id && p.name);
}


/**
 * Turns a photo reference into an image URL the phone can load.
 *
 * A separate request, and a separate charge, so it is made once for the
 * place actually being shown rather than for every search result. Returns
 * null rather than throwing: a missing picture is a plainer card, not a
 * failed itinerary.
 *
 * The URL Google hands back is short-lived. It is rendered and forgotten,
 * never stored — the same rule as the venue's name.
 */
export async function resolvePhoto(photoName: string): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const idToken = await user.getIdToken();
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ photo: photoName }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.photoUri !== 'string') return null;
    return data.photoUri;
  } catch {
    return null;
  }
}
