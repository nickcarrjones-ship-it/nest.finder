import { isFullyChecked, type MustHave } from './mustHaves';

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
  /**
   * Null for a viewing typed in by hand.
   *
   * A pasted listing always brings its own coordinates, which is the whole
   * reason the paste path exists. But there is no geocoder in this app —
   * Nominatim is documented as unusable at scale — so someone entering an
   * address manually genuinely has no point to put on the map. That is a
   * viewing worth keeping in the list and on the calendar without a pin,
   * rather than one to refuse, and far better than inventing a coordinate
   * that someone would then drive to.
   */
  lat: number | null;
  lng: number | null;
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
  /** Where the details came from — a read listing, or typed in by hand. */
  source: 'rightmove' | 'manual';
  /** When they are going, in ms. Null means "want to see it, nothing
   *  booked" — a real and common state, not a missing field. */
  viewingAt: number | null;
  notes: string | null;
  /**
   * What the household found when they stood in it, keyed by must-have id
   * (see lib/mustHaves.ts). Absent on every viewing added before the
   * scorecard existed, and on every one nobody has scored yet — which is
   * why it is optional here rather than defaulted to an empty object: an
   * empty object and a missing one mean the same thing, and only one of
   * them has to be written to Firebase.
   */
  checks?: Record<string, boolean> | null;
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
 *   seen   — a date that has passed, OR every must-have has a tick or a
 *            cross (Nick, 2026-09-25). Scoring every item is only possible
 *            by standing in the place, so a fully scored property has been
 *            viewed whatever its date says — including one never given a
 *            date at all.
 *
 * Still derived, so it has one honest consequence: adding a new must-have
 * makes a property scored only that way un-scored again, and it goes back
 * to where its date puts it until the new item is answered.
 */
export type ViewingStatus = 'idea' | 'booked' | 'seen';

export function viewingStatus(
  viewing: Viewing,
  now = Date.now(),
  mustHaves: MustHave[] = [],
): ViewingStatus {
  if (isFullyChecked(mustHaves, viewing.checks)) return 'seen';
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
 * Build a viewing someone typed in themselves, because the link could not
 * be read (or they never had one).
 *
 * No coordinates, and that is the honest outcome rather than a degraded
 * one: it goes in the list and on the calendar, and the map simply has
 * nothing to draw for it. See the note on `lat` for why guessing is worse.
 */
export function viewingFromManual(
  fields: { address: string; priceText?: string | null; listingUrl?: string | null },
  opts: { createdBy: string; viewingAt?: number | null; notes?: string | null; now?: number },
): Viewing {
  const now = opts.now ?? Date.now();
  const priceText = fields.priceText?.trim() || null;
  return {
    id: newViewingId(),
    address: fields.address.trim(),
    postcode: null,
    lat: null,
    lng: null,
    pinAccurate: false,
    priceText,
    priceValue: priceText ? parsePriceText(priceText) : null,
    bedrooms: null,
    bathrooms: null,
    propertyType: null,
    channel: null,
    listingUrl: fields.listingUrl?.trim() || null,
    source: 'manual',
    viewingAt: opts.viewingAt ?? null,
    notes: opts.notes ?? null,
    createdAt: now,
    createdBy: opts.createdBy,
  };
}

/** Same reading as the server's, for a price someone typed rather than one
 *  a listing stated. Null, never 0, when there is no number in it. */
export function parsePriceText(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
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
export function sortViewings(viewings: Viewing[], now = Date.now(), mustHaves: MustHave[] = []): Viewing[] {
  const rank: Record<ViewingStatus, number> = { booked: 0, idea: 1, seen: 2 };
  return [...viewings].sort((a, b) => {
    const sa = viewingStatus(a, now, mustHaves);
    const sb = viewingStatus(b, now, mustHaves);
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

export function groupViewings(
  viewings: Viewing[],
  now = Date.now(),
  mustHaves: MustHave[] = [],
): GroupedViewings {
  const sorted = sortViewings(viewings, now, mustHaves);
  return {
    booked: sorted.filter((v) => viewingStatus(v, now, mustHaves) === 'booked'),
    idea: sorted.filter((v) => viewingStatus(v, now, mustHaves) === 'idea'),
    seen: sorted.filter((v) => viewingStatus(v, now, mustHaves) === 'seen'),
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

/** The viewings that can actually be drawn. Narrows the type, so the map
 *  never has to null-check a coordinate it has already filtered for. */
export function mappableViewings(
  viewings: Viewing[],
): (Viewing & { lat: number; lng: number })[] {
  return viewings.filter((v): v is Viewing & { lat: number; lng: number } =>
    typeof v.lat === 'number' && typeof v.lng === 'number');
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
function hasUsableLocation(v: Partial<Viewing>): boolean {
  // Both present and real, or both explicitly absent. HALF a coordinate is
  // the dangerous case: it would place a pin on the equator or the
  // meridian rather than anywhere near the property.
  if (v.lat === null && v.lng === null) return true;
  return (
    typeof v.lat === 'number' && Number.isFinite(v.lat) &&
    typeof v.lng === 'number' && Number.isFinite(v.lng)
  );
}

/**
 * Firebase does not store null — a field saved as null simply is not there
 * when it comes back. So a viewing saved with no date, no notes or (typed
 * in by hand) no coordinates returned with those fields MISSING, failed
 * isValidViewing's "null or a number" test, and was dropped on load. Every
 * "want to see" property vanished the next time the app started, which
 * every OTA update forces (found 2026-09-25).
 *
 * Put the nulls back before validating. This only restores absence as
 * absence; it never invents a value, so the checks that matter — half a
 * coordinate, no address — still reject exactly what they did before.
 */
const NULLABLE_FIELDS = [
  'postcode', 'lat', 'lng', 'priceText', 'priceValue', 'bedrooms', 'bathrooms',
  'propertyType', 'channel', 'listingUrl', 'viewingAt', 'notes',
] as const;

export function fromStored(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const restored: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const field of NULLABLE_FIELDS) {
    if (restored[field] === undefined) restored[field] = null;
  }
  if (restored.pinAccurate === undefined) restored.pinAccurate = false;
  return restored;
}

export function isValidViewing(candidate: unknown): candidate is Viewing {
  if (!candidate || typeof candidate !== 'object') return false;
  const v = candidate as Partial<Viewing>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.address === 'string' &&
    v.address.trim().length > 0 &&
    hasUsableLocation(v) &&
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
