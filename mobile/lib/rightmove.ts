import type {
  ListingChannel,
  PropertyCriteria,
  PropertyFeature,
  Tenure,
} from './types';
import RIGHTMOVE_IDS from '../assets/data/rightmove-ids.json';

/**
 * Builds a Rightmove search URL that actually arrives filtered.
 *
 * Every parameter here was verified against the live site on 2026-09-06 by
 * sending it and reading back Rightmove's own search model from the
 * returned page — not from documentation, which does not exist, and not
 * from the frozen web app, whose version of this shipped broken (Nick:
 * links would "either not have the number of bedrooms in it or wouldn't
 * have the number of bathrooms"). Two findings explain that breakage and
 * are the reason this file is careful:
 *
 *   1. CASE IS NOT COSMETIC. tenureTypes must be UPPERCASE
 *      (FREEHOLD/LEASEHOLD/SHARE_OF_FREEHOLD) while mustHave must be
 *      lowercase (garden/parking). Sending tenureTypes=freehold does not
 *      warn or ignore the filter — it 307-redirects the whole request, and
 *      the user lands on Rightmove with EVERY filter silently gone. A
 *      search that quietly drops its filters looks like it worked, which
 *      is exactly how this stayed broken on the web.
 *
 *   2. The ^ in a location identifier must be percent-encoded as %5E.
 *
 * The tests in __tests__/rightmove.test.ts pin both.
 */

/** Verified accepted values. Ours are camelCase; Rightmove's are not. */
const TENURE_PARAM: Record<Tenure, string> = {
  freehold: 'FREEHOLD',
  leasehold: 'LEASEHOLD',
  shareOfFreehold: 'SHARE_OF_FREEHOLD',
};

const FEATURE_PARAM: Record<PropertyFeature, string> = {
  garden: 'garden',
  parking: 'parking',
};

/** Rightmove splits buy and rent by PATH, not by a query parameter — the
 *  channel in its search model is derived from this. */
const CHANNEL_PATH: Record<ListingChannel, string> = {
  buy: 'property-for-sale',
  rent: 'property-to-rent',
};

/** Miles. Areas are stations, so this is "walkable-ish from the station"
 *  rather than a whole borough — the same reading of an area the rest of
 *  the app uses. */
const SEARCH_RADIUS_MILES = 1.0;

/** 6 = newest first. Someone who has already decided on the area wants to
 *  see what has just come up, not the cheapest thing in it. */
const SORT_NEWEST = 6;

const IDS = RIGHTMOVE_IDS as Record<string, string>;

/**
 * Whether we can build a real search for this area at all.
 *
 * False means the area never resolved to a Rightmove location identifier
 * (see scripts/build-rightmove-ids.mjs), and the button must be HIDDEN
 * rather than sent to a guess. A missing button is a disappointment; a
 * button that searches the wrong county is a broken promise.
 */
export function canSearchRightmove(area: string): boolean {
  return typeof IDS[area] === 'string';
}

/**
 * The search URL for one area, or null if the area has no identifier.
 *
 * Deliberately returns null rather than falling back to a keyword search:
 * Rightmove's own fuzzy matching is what sends "Chessington North" to York
 * (measured), and a plausible-looking wrong answer is worse than no button.
 */
export function rightmoveUrl(area: string, criteria: PropertyCriteria): string | null {
  const locationId = IDS[area];
  if (!locationId) return null;

  const params = new URLSearchParams();
  // URLSearchParams encodes ^ as %5E, which is what Rightmove needs.
  params.set('locationIdentifier', locationId);
  params.set('radius', SEARCH_RADIUS_MILES.toFixed(1));
  params.set('minPrice', String(criteria.minPrice));
  params.set('maxPrice', String(criteria.maxPrice));
  params.set('minBedrooms', String(criteria.minBeds));
  params.set('maxBedrooms', String(criteria.maxBeds));
  params.set('minBathrooms', String(criteria.minBaths));
  params.set('maxBathrooms', String(criteria.maxBaths));

  // Omitted entirely when empty. Rightmove reads an absent tenureTypes as
  // "no tenure filter"; sending an empty one is not the same thing.
  if (criteria.tenures.length > 0) {
    params.set('tenureTypes', criteria.tenures.map((t) => TENURE_PARAM[t]).join(','));
  }
  if (criteria.features.length > 0) {
    params.set('mustHave', criteria.features.map((f) => FEATURE_PARAM[f]).join(','));
  }

  params.set('sortType', String(SORT_NEWEST));

  return `https://www.rightmove.co.uk/${CHANNEL_PATH[criteria.channel]}/find.html?${params.toString()}`;
}

/**
 * The price options for each channel, as Nick specified them (2026-09-06).
 *
 * Buy steps get coarser as they climb — £25k apart where most of London
 * actually sits, and not 194 identical steps to reach £5m. The floors are
 * deliberately below where he first suggested (£500 and £150k rather than
 * £1,000 and £300,000): outer-London studios and ex-council flats sit
 * under both, and someone whose budget cannot be expressed at all is
 * someone the feature simply does not work for.
 */
export const RENT_PRICES: number[] = buildScale([[500, 5_000, 250]]);

export const BUY_PRICES: number[] = buildScale([
  [150_000, 1_000_000, 25_000],
  [1_000_000, 2_000_000, 50_000],
  [2_000_000, 5_000_000, 250_000],
]);

/** Bands are [from, to, step]; each band starts where the last ended, and
 *  the shared boundary value is emitted once. */
function buildScale(bands: [number, number, number][]): number[] {
  const out: number[] = [];
  for (const [from, to, step] of bands) {
    for (let v = from; v <= to; v += step) {
      if (out[out.length - 1] !== v) out.push(v);
    }
  }
  return out;
}

export function pricesFor(channel: ListingChannel): number[] {
  return channel === 'rent' ? RENT_PRICES : BUY_PRICES;
}

/** "£2,500" / "£1.25m" — the compact forms a picker column can hold. */
export function formatPrice(pounds: number): string {
  if (pounds >= 1_000_000) {
    const m = pounds / 1_000_000;
    return `£${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/0$/, '')}m`;
  }
  return `£${pounds.toLocaleString('en-GB')}`;
}
