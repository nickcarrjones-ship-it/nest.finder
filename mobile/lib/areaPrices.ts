import priceData from '../assets/data/area-prices.json';
import identities from '../assets/data/area-identities.json';

/**
 * What an area costs, said in terms of somewhere they already know.
 *
 * A median on its own is a number people have to do arithmetic on.
 * "£85,000 dearer than Tooting" is the same fact already compared to the
 * thing they were comparing it to anyway — and the areas they named as
 * loved are the reference point the whole app is built around.
 *
 * Source is HM Land Registry Price Paid Data under the Open Government
 * Licence; the attribution travels in the JSON and has to appear wherever
 * these numbers are shown.
 */

export interface PriceBand { median: number; sales: number }

interface AreaPriceFile {
  neighbourhoods: Record<string, Record<string, PriceBand>>;
  areas: Record<string, Record<string, PriceBand>>;
  trend?: Record<string, TrendEntry>;
}

export interface TrendEntry {
  /** Percent change between the earlier and recent windows. */
  changePct: number;
  direction: 'up' | 'down' | 'flat';
}

const DATA = priceData as unknown as AreaPriceFile;
const IDENT = identities as Record<string, string>;

const HOOD_SIZE = new Map<string, number>();
for (const hood of Object.values(IDENT)) HOOD_SIZE.set(hood, (HOOD_SIZE.get(hood) ?? 0) + 1);

/**
 * The key an area's prices live under — the neighbourhood where one exists,
 * the station where it is its own neighbourhood.
 *
 * Mirrors candidates.ts's group-of-one rule, so prices answer to the names
 * the map shows. Without it, Angel would be filed under the ONS ward name
 * "St Peter's & Canalside" and never found.
 */
export function priceKey(area: string): string {
  const hood = IDENT[area] ?? area;
  return (HOOD_SIZE.get(hood) ?? 1) === 1 ? area : hood;
}

/** Median sold price for an area, at the level people discuss. */
export function medianFor(area: string): PriceBand | undefined {
  const key = priceKey(area);
  const bands = DATA.neighbourhoods[key] ?? DATA.neighbourhoods[area] ?? DATA.areas[area];
  return bands?.all;
}

export function trendFor(area: string): TrendEntry | undefined {
  return DATA.trend?.[priceKey(area)] ?? DATA.trend?.[area];
}

export interface PriceComparison {
  median: number;
  /** The loved area it is being measured against. */
  against: string;
  againstMedian: number;
  /** Positive means dearer than the area they love. */
  differencePct: number;
  /** How it reads on a card. */
  label: string;
}

/**
 * Under 8% apart is "about the same".
 *
 * Two medians drawn from a few hundred sales each are not precise enough to
 * call a 3% gap a real difference, and saying "£12,000 dearer" about
 * £600,000 homes invites a confidence the number does not carry. The band
 * is deliberately wide enough that anything it DOES call dearer or cheaper
 * is worth acting on.
 */
const SAME_WITHIN_PCT = 8;

/**
 * How this area's price compares to the areas they said they love.
 *
 * Measured against the CHEAPEST loved area, not an average of them.
 * Someone who loves Tooting and Hampstead has a reference point at each
 * end, and averaging invents a third place they never mentioned — while
 * the cheapest is the one that tells them whether this is a step up in
 * cost, which is the thing a budget cares about.
 */
export function compareToLoved(area: string, loved: string[]): PriceComparison | null {
  const here = medianFor(area);
  if (!here) return null;

  const references = loved
    .filter((l) => priceKey(l) !== priceKey(area))
    .map((l) => ({ name: l, band: medianFor(l) }))
    .filter((r): r is { name: string; band: PriceBand } => r.band !== undefined)
    .sort((a, b) => a.band.median - b.band.median);

  const ref = references[0];
  if (!ref) return null;

  const differencePct = ((here.median - ref.band.median) / ref.band.median) * 100;
  const label = Math.abs(differencePct) < SAME_WITHIN_PCT
    ? `About the same as ${ref.name}`
    : `${formatGap(Math.abs(here.median - ref.band.median))} ${differencePct > 0 ? 'dearer' : 'cheaper'} than ${ref.name}`;

  return {
    median: here.median,
    against: ref.name,
    againstMedian: ref.band.median,
    differencePct,
    label,
  };
}

/** "£85k" / "£1.2m" — a gap, at the precision a median deserves. */
export function formatGap(pounds: number): string {
  if (pounds >= 1_000_000) return `£${(pounds / 1_000_000).toFixed(1)}m`;
  if (pounds >= 10_000) return `£${Math.round(pounds / 1_000)}k`;
  return `£${Math.round(pounds / 1_000)}k`;
}

/** "£610k" — the median itself, for a card that has room for one line. */
export function formatMedian(pounds: number): string {
  if (pounds >= 1_000_000) return `£${(pounds / 1_000_000).toFixed(2).replace(/0$/, '')}m`;
  return `£${Math.round(pounds / 1_000)}k`;
}
