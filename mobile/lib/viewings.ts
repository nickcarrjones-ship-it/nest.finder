/**
 * A property the household is going to see, or has seen.
 *
 * PURE — no React Native, no Firebase — so it can be tested under plain
 * Node. The Firebase half lives in viewingSync.ts, the same split verdicts
 * and dataGaps already use for the same reason.
 */

export interface Viewing {
  id: string;
  /** As the listing gave it, or as they typed it. Never invented. */
  address: string;
  /** Often partial ("SE2") — Rightmove withholds the incode on plenty of
   *  listings, and a partial postcode is the normal case, not an error. */
  postcode: string | null;
  lat: number;
  lng: number;
  /**
   * Whether the coordinates are the actual property or the middle of a
   * postcode. Carried through from the listing so the map can say which it
   * is, instead of drawing every pin as though it were surveyed.
   */
  pinAccurate: boolean;
  /** What the listing said — "£640,000", "£2,700 pcm". Shown as-is. */
  priceText: string | null;
  /** The same figure as a number, for sorting and totals only. Null rather
   *  than 0 when there is no price: a POA flat is not a free one. */
  priceValue: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  channel: 'buy' | 'rent' | null;
  listingUrl: string | null;
  source: 'rightmove' | 'manual';
  /** When they are going, in ms. Null means "want to see it, nothing
   *  booked" — a real and common state, not a missing field. */
  viewingAt: number | null;
  notes: string | null;
  createdAt: number;
  /** Which member added it, so a household can tell who found what. */
  createdBy: string;
}

/**
 * What the listing lookup hands back, before anyone has said when they are
 * going. Mirrors the Cloud Function's response exactly.
 */
export interface ListingDetails {
  source: 'rightmove';
  listingId: string;
  url: string;
  address: string;
  postcode: string | null;
  priceText: string | null;
  priceValue: number | null;
  priceQualifier: string | null;
  lat: number;
  lng: number;
  pinAccurate: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  channel: 'buy' | 'rent' | null;
}

/**
 * Three states, DERIVED rather than stored.
 *
 * A stored status is a second source of truth that drifts — it has to be
 * updated when a date passes, which means something has to notice, and
 * nothing reliably does. The date already says everything:
 *
 *   idea   — no date yet. They want to see it.
 *   booked — a date in the future.
 *   seen   — a date that has passed.
 */
export type ViewingStatus = 'idea' | 'booked' | 'seen';

export function viewingStatus(viewing: Viewing, now = Date.now()): ViewingStatus {
  if (viewing.viewingAt === null) return 'idea';
  return viewing.viewingAt >= now ? 'booked' : 'seen';
}

export function newViewingId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a viewing from a looked-up listing. Everything the listing knows is
 * carried over; everything it cannot know starts empty for the household to
 * fill in.
 */
export function viewingFromListing(
  listing: ListingDetails,
  opts: { createdBy: string; viewingAt?: number | null; notes?: string | null; now?: number },
): Viewing {
  const now = opts.now ?? Date.now();
  return {
    id: newViewingId(),
    address: listing.address,
    postcode: listing.postcode,
    lat: listing.lat,
    lng: listing.lng,
    pinAccurate: listing.pinAccurate,
    priceText: listing.priceText,
    priceValue: listing.priceValue,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    propertyType: listing.propertyType,
    channel: listing.channel,
    listingUrl: listing.url,
    source: 'rightmove',
    viewingAt: opts.viewingAt ?? null,
    notes: opts.notes ?? null,
    createdAt: now,
    createdBy: opts.createdBy,
  };
}

/**
 * The order the list is read in: what is coming up, soonest first, then
 * the ones with no date, then what has already been seen, most recent
 * first.
 *
 * The reasoning is that this list answers "what is happening" far more
 * often than "what happened" — and once something is seen, the most
 * recent is the one still being talked about.
 */
export function sortViewings(viewings: Viewing[], now = Date.now()): Viewing[] {
  const rank: Record<ViewingStatus, number> = { booked: 0, idea: 1, seen: 2 };
  return [...viewings].sort((a, b) => {
    const sa = viewingStatus(a, now);
    const sb = viewingStatus(b, now);
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
    if (sa === 'booked') return (a.viewingAt ?? 0) - (b.viewingAt ?? 0);
    if (sa === 'seen') return (b.viewingAt ?? 0) - (a.viewingAt ?? 0);
    return b.createdAt - a.createdAt; // newest idea first
  });
}

export interface GroupedViewings {
  booked: Viewing[];
  idea: Viewing[];
  seen: Viewing[];
}

export function groupViewings(viewings: Viewing[], now = Date.now()): GroupedViewings {
  const sorted = sortViewings(viewings, now);
  return {
    booked: sorted.filter((v) => viewingStatus(v, now) === 'booked'),
    idea: sorted.filter((v) => viewingStatus(v, now) === 'idea'),
    seen: sorted.filter((v) => viewingStatus(v, now) === 'seen'),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Mon 14 Sep, 2:30pm".
 *
 * Built from fixed arrays rather than toLocaleDateString, which is not as
 * stable as it looks: en-GB renders September as "Sept" on some ICU
 * versions and "Sep" on others, and the 12-hour time comes back with a
 * non-breaking space before the am/pm. Both vary by device. A viewing time
 * is something people read at a glance and act on, so it renders
 * identically on every phone — and the app is London-only and en-GB by
 * design, so there is no locale flexibility being given up here.
 *
 * Reads in the phone's own timezone, deliberately. Someone checking their
 * viewings from abroad should see the same thing their calendar shows them.
 */
export function formatViewingWhen(at: number): string {
  const date = new Date(at);
  const day = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const hours = date.getHours();
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${day}, ${hour12}:${String(date.getMinutes()).padStart(2, '0')}${suffix}`;
}

/** "3 bed flat" — only what the listing actually said, in the order someone
 *  would say it. Returns null rather than a bare "flat" with no number. */
export function describeProperty(viewing: Viewing): string | null {
  const parts: string[] = [];
  if (viewing.bedrooms !== null) parts.push(`${viewing.bedrooms} bed`);
  if (viewing.propertyType) parts.push(viewing.propertyType.toLowerCase());
  return parts.length ? parts.join(' ') : null;
}

/**
 * Is this a viewing we are willing to trust?
 *
 * Run on everything coming back from Firebase, where a record could have
 * been written by an older build, a half-finished migration, or the other
 * person's phone mid-update. Anything that fails is DROPPED rather than
 * repaired: the two fields checked hardest are the ones a viewing is
 * useless without — somewhere to go, and a point to put on the map — and a
 * pin at a guessed coordinate is worse than no pin, because someone would
 * drive to it.
 */
export function isValidViewing(candidate: unknown): candidate is Viewing {
  if (!candidate || typeof candidate !== 'object') return false;
  const v = candidate as Partial<Viewing>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.address === 'string' &&
    v.address.trim().length > 0 &&
    typeof v.lat === 'number' &&
    Number.isFinite(v.lat) &&
    typeof v.lng === 'number' &&
    Number.isFinite(v.lng) &&
    typeof v.createdAt === 'number' &&
    (v.viewingAt === null || typeof v.viewingAt === 'number')
  );
}

/**
 * Does this look like a Rightmove property link?
 *
 * A deliberately loose check, and only ever used to decide what the paste
 * box says before anything is sent. The real validation is the Cloud
 * Function's, which rebuilds the URL from the id rather than trusting it —
 * duplicating that strictness here would mean two rules to keep in step,
 * and the client's copy is the one that cannot be enforced anyway.
 */
export function looksLikeRightmoveUrl(text: string): boolean {
  return /rightmove\.co\.uk\/properties\/\d{4,12}/i.test(text.trim());
}
