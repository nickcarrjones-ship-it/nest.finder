/**
 * An area's measured character, as a vector.
 *
 * This is the heart of anchor-and-expand. Someone names an area they already
 * love; we work out what that area actually IS from data, then find others
 * whose numbers look like it. The model's job further downstream is only to
 * put the answer into words — the matching itself never consults its
 * recollection of London, which is the whole point.
 *
 * Provenance for every dimension is in docs/data-sources.md. Two facts
 * shape the design here:
 *
 *  - Rhythm covers TUBE ONLY — 242 of 570 areas. The other 328 have no
 *    entry, and an area with no data must never be compared as though it
 *    scored zero, because "unmeasured" and "dead quiet" would then look
 *    identical. Every dimension is therefore nullable, and comparisons run
 *    only over the dimensions both areas actually have.
 *  - Shares hide intensity. The food data supplies both proportions and raw
 *    counts, and both are carried here, because an area can have a low pub
 *    SHARE while having twice as many pubs as somewhere else (the City).
 */

import rhythmData from '../../assets/data/area-rhythm.json';
import foodData from '../../assets/data/area-food.json';
import peopleData from '../../assets/data/area-people.json';
import footfallData from '../../assets/data/area-footfall.json';
import venueData from '../../assets/data/area-venues.json';
import homeData from '../../assets/data/area-homes.json';
import stationData from '../../assets/data/stations.json';

/** One measured dimension. null means we have no data — never zero. */
export type Dim = number | null;

export interface AreaFeatures {
  name: string;
  /** How busy at its busiest, comparable between areas. */
  peak: Dim;
  /** Saturday 22:00–02:00. The nightlife signal. */
  satNight: Dim;
  /** Saturday and Sunday afternoons — a daytime destination. */
  weekendDay: Dim;
  /** Weekday 07:00–10:00 — commuter outflow, the dormitory signal. */
  weekdayMorning: Dim;
  /** Share of its own peak that survives to Saturday night. */
  nightlifeRatio: Dim;
  /** Weekend busyness over weekday-morning busyness. Above 1 = destination. */
  weekendLean: Dim;
  /** Food composition, as proportions of all venues. */
  sitdownShare: Dim;
  takeawayShare: Dim;
  drinkShare: Dim;
  /** Proportion whose name appears nowhere else in London. */
  independentShare: Dim;
  /** Absolute venue count — the intensity the shares hide. */
  venues: Dim;
  /** Absolute pubs and bars, for the same reason. */
  drinkCount: Dim;

  /**
   * Life stage, from Census 2021. Added after the engine matched Clapham
   * Common with Chiswick Park and Nick rejected it: Clapham is 42% aged
   * 20–34, Chiswick 23%, and nothing in the data could see the difference.
   *
   * DELIBERATELY EXCLUDED: social rented share. It is the most direct
   * deprivation proxy in the Census and correlates strongly with race in
   * London, so matching on it would quietly sort people towards areas like
   * the one they came from and entrench segregation while appearing to work
   * (see docs/learning-loop.md). Age structure and the rent/own split
   * describe life stage; social tenure describes class, and the engine has
   * no business matching on that.
   */
  share20to34: Dim;
  shareUnder15: Dim;
  share65plus: Dim;
  sharePrivateRent: Dim;
  shareOwned: Dim;

  /**
   * Annual entries and exits (ORR). How busy a place is, for the 330 areas
   * TfL's tube-only crowding data never reached — which took any busyness
   * signal at all from 42% of areas to 93%. Annual, so it says how much and
   * never when; `peak` and `satNight` remain the only source of timing.
   */
  annualFootfall: Dim;

  /**
   * Venue TYPE, from OpenStreetMap — the split the FSA register cannot make.
   *
   * FSA files a gastropub and a nightclub as one category, so the engine
   * could not tell Chiswick from Clapham on the thing Nick actually meant.
   * OSM separates them: Clapham Common has 19 bars to 34 pubs, Chiswick Park
   * 5 to 14, Richmond none at all. barToPub orders these the way a Londoner
   * would, and cuisineCount is the measure of cosmopolitan (Shoreditch 94,
   * Richmond 15).
   */
  cafeShare: Dim;
  restaurantShare: Dim;
  barShare: Dim;
  /** Bars per pub. High means cocktails and going out; low means locals. */
  barToPub: Dim;
  /** Distinct cuisines within a mile. */
  cuisineCount: Dim;

  /**
   * What the buildings look like — the gap Canary Wharf exposed.
   *
   * It matched Balham at 56% because their busyness curves are nearly
   * identical, and nothing here could tell glass towers from Victorian
   * terraces. Flats 29% against 5%, and 11% of buildings six storeys or more
   * against 2%, now can.
   *
   * Construction AGE is still missing — only 0.1% of London buildings tag it
   * in OSM, so Victorian-versus-postwar needs the EPC register.
   */
  flatShare: Dim;
  houseShare: Dim;
  terraceShare: Dim;
  meanStoreys: Dim;
  tallShare: Dim;
}

/** The dimensions compared, in a fixed order. */
export const DIMENSIONS = [
  'peak',
  'satNight',
  'weekendDay',
  'weekdayMorning',
  'nightlifeRatio',
  'weekendLean',
  'sitdownShare',
  'takeawayShare',
  'drinkShare',
  'independentShare',
  'venues',
  'drinkCount',
  'share20to34',
  'shareUnder15',
  'share65plus',
  'sharePrivateRent',
  'shareOwned',
  'annualFootfall',
  'cafeShare',
  'restaurantShare',
  'barShare',
  'barToPub',
  'cuisineCount',
  'flatShare',
  'houseShare',
  'terraceShare',
  'meanStoreys',
  'tallShare',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Which source each dimension comes from — and why that has to matter.
 *
 * Canary Wharf exposed this (Nick, 2026-08-28). It matched Balham at 56%
 * despite one being glass towers and the other Victorian terraces, because
 * their busyness curves are nearly identical and SEVEN dimensions describe
 * busyness while only five describe the people. Those seven are not seven
 * independent facts: they all derive from the same curve, so they act as
 * roughly one signal casting seven votes. The food shares are worse —
 * sitdown, takeaway and drink sum to 1, so they are two numbers in three
 * hats.
 *
 * Nobody chose that weighting; it fell out of how many measures each source
 * happened to yield. Weighting each dimension by 1/(size of its family)
 * makes every SOURCE count equally, which is a decision rather than an
 * accident.
 */
export const DIMENSION_FAMILY: Record<Dimension, 'busyness' | 'food' | 'people' | 'venueType' | 'builtForm'> = {
  peak: 'busyness',
  satNight: 'busyness',
  weekendDay: 'busyness',
  weekdayMorning: 'busyness',
  nightlifeRatio: 'busyness',
  weekendLean: 'busyness',
  annualFootfall: 'busyness',
  sitdownShare: 'food',
  takeawayShare: 'food',
  drinkShare: 'food',
  independentShare: 'food',
  venues: 'food',
  drinkCount: 'food',
  share20to34: 'people',
  shareUnder15: 'people',
  share65plus: 'people',
  sharePrivateRent: 'people',
  shareOwned: 'people',
  cafeShare: 'venueType',
  restaurantShare: 'venueType',
  barShare: 'venueType',
  barToPub: 'venueType',
  cuisineCount: 'venueType',
  flatShare: 'builtForm',
  houseShare: 'builtForm',
  terraceShare: 'builtForm',
  meanStoreys: 'builtForm',
  tallShare: 'builtForm',
};

const FAMILY_SIZES = DIMENSIONS.reduce<Record<string, number>>((acc, d) => {
  acc[DIMENSION_FAMILY[d]] = (acc[DIMENSION_FAMILY[d]] ?? 0) + 1;
  return acc;
}, {});

/** A dimension's share of its family, so each source contributes equally. */
export function familyWeight(dim: Dimension): number {
  return 1 / FAMILY_SIZES[DIMENSION_FAMILY[dim]];
}

interface RhythmEntry {
  peak: number;
  satNight: number;
  satAfternoon: number;
  sunAfternoon: number;
  weekdayMorning: number;
  nightlifeRatio: number;
  weekendLean: number;
}
interface HomeEntry {
  shares: Record<string, number>;
  meanStoreys: number | null;
  tallShare: number | null;
}
interface VenueEntry {
  venues: number;
  counts: Record<string, number>;
  shares: Record<string, number>;
  cuisineCount: number;
}
interface FootfallEntry {
  entriesExits: number;
  interchanges: number | null;
  interchangeRatio: number | null;
}
interface PeopleEntry {
  share20to34: number;
  shareUnder15: number;
  share65plus: number;
  sharePrivateRent: number | null;
  shareOwned: number | null;
}
interface FoodEntry {
  venues: number;
  counts: { sitdown: number; takeaway: number; drink: number };
  shares: { sitdown: number; takeaway: number; drink: number };
  independentShare: number;
}

const rhythm = (rhythmData as { areas: Record<string, RhythmEntry> }).areas ?? {};
const food = (foodData as { areas: Record<string, FoodEntry> }).areas ?? {};
const people = (peopleData as { areas: Record<string, PeopleEntry> }).areas ?? {};
const footfall = (footfallData as { areas: Record<string, FootfallEntry> }).areas ?? {};
const venues = (venueData as { areas: Record<string, VenueEntry> }).areas ?? {};
const homes = (homeData as { areas: Record<string, HomeEntry> }).areas ?? {};

const mean = (a: number, b: number) => (a + b) / 2;

/**
 * Rhythm is blended across nearby stations, not read from one.
 *
 * A station's usage mixes three different populations — residents heading
 * out, visitors arriving, and people merely changing trains — and at a big
 * interchange the third swamps the other two. Balham is the case that
 * exposed it (Nick, 2026-08-27): as a neighbourhood it has a lively high
 * road, but as a STATION it is a tube/National Rail interchange with a huge
 * weekday-morning peak and almost nothing at night, so the raw data called
 * it a commuter dormitory and refused to match it with Clapham.
 *
 * Blending every station within BLEND_RADIUS_KM, weighted by closeness,
 * measures the AREA rather than the platform — which is also how the food
 * data already works, so the two signals finally describe the same thing.
 * An interchange is then diluted by its ordinary neighbours instead of
 * defining the neighbourhood single-handed.
 */
const BLEND_RADIUS_KM = 1.2;

const stations = stationData as { name: string; lat: number; lng: number }[];
const coordOf = new Map(stations.map((s) => [s.name, s]));

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cached because every comparison asks for the same areas repeatedly. */
const blendCache = new Map<string, RhythmEntry | undefined>();

function blendedRhythm(name: string): RhythmEntry | undefined {
  if (blendCache.has(name)) return blendCache.get(name);
  const here = coordOf.get(name);
  let result: RhythmEntry | undefined;

  if (!here) {
    result = rhythm[name];
  } else {
    const contributors: { entry: RhythmEntry; weight: number }[] = [];
    for (const station of stations) {
      const entry = rhythm[station.name];
      if (!entry) continue;
      const d = distanceKm(here, station);
      if (d > BLEND_RADIUS_KM) continue;
      // Linear falloff: the area's own station counts fully, one at the
      // edge of the radius barely at all.
      contributors.push({ entry, weight: 1 - d / BLEND_RADIUS_KM });
    }
    if (contributors.length === 0) {
      result = undefined;
    } else {
      const total = contributors.reduce((s, c) => s + c.weight, 0);
      const avg = (pick: (e: RhythmEntry) => number) =>
        contributors.reduce((s, c) => s + c.weight * pick(c.entry), 0) / total;
      result = {
        peak: avg((e) => e.peak),
        satNight: avg((e) => e.satNight),
        satAfternoon: avg((e) => e.satAfternoon),
        sunAfternoon: avg((e) => e.sunAfternoon),
        weekdayMorning: avg((e) => e.weekdayMorning),
        nightlifeRatio: avg((e) => e.nightlifeRatio),
        weekendLean: avg((e) => e.weekendLean),
      };
    }
  }
  blendCache.set(name, result);
  return result;
}

/**
 * How much of this area's station traffic is people changing trains.
 *
 * ORR reports interchanges separately, which finally measures the confound
 * Nick found with Balham: a station whose traffic never reaches the street
 * describes the railway, not the neighbourhood. Clapham Junction reads 46%,
 * East Dulwich 0%.
 *
 * Used to temper CONFIDENCE rather than to discard data — the rhythm is
 * still real, it just says less about the streets around it, and the wording
 * downstream should admit that instead of the engine silently deleting it.
 */
export function interchangeRatio(name: string): number | null {
  return footfall[name]?.interchangeRatio ?? null;
}

/** How many stations fed an area's rhythm — 0 means we have none. */
export function rhythmSources(name: string): number {
  const here = coordOf.get(name);
  if (!here) return rhythm[name] ? 1 : 0;
  return stations.filter((s) => rhythm[s.name] && distanceKm(here, s) <= BLEND_RADIUS_KM).length;
}

/** Assembles one area's vector from whatever sources have it. */
export function featuresFor(name: string): AreaFeatures {
  const r = blendedRhythm(name);
  const f = food[name];
  const p = people[name];
  const ff = footfall[name];
  const v = venues[name];
  const h = homes[name];
  return {
    name,
    peak: r ? r.peak : null,
    satNight: r ? r.satNight : null,
    weekendDay: r ? mean(r.satAfternoon, r.sunAfternoon) : null,
    weekdayMorning: r ? r.weekdayMorning : null,
    nightlifeRatio: r ? r.nightlifeRatio : null,
    weekendLean: r ? r.weekendLean : null,
    sitdownShare: f ? f.shares.sitdown : null,
    takeawayShare: f ? f.shares.takeaway : null,
    drinkShare: f ? f.shares.drink : null,
    independentShare: f ? f.independentShare : null,
    venues: f ? f.venues : null,
    drinkCount: f ? f.counts.drink : null,
    share20to34: p ? p.share20to34 : null,
    shareUnder15: p ? p.shareUnder15 : null,
    share65plus: p ? p.share65plus : null,
    sharePrivateRent: p ? p.sharePrivateRent : null,
    shareOwned: p ? p.shareOwned : null,
    annualFootfall: ff ? ff.entriesExits : null,
    cafeShare: v ? v.shares.cafe : null,
    restaurantShare: v ? v.shares.restaurant : null,
    barShare: v ? v.shares.bar : null,
    // An area with no pubs at all has no ratio to report — null, not
    // infinity, and not zero (which would read as "all pubs, no bars").
    barToPub: v && v.counts.pub > 0 ? v.counts.bar / v.counts.pub : null,
    cuisineCount: v ? v.cuisineCount : null,
    flatShare: h ? h.shares.flats : null,
    houseShare: h ? h.shares.house : null,
    terraceShare: h ? h.shares.terrace : null,
    meanStoreys: h ? h.meanStoreys : null,
    tallShare: h ? h.tallShare : null,
  };
}

/** Every area we hold any measurement at all for. */
export function allAreaNames(): string[] {
  return [...new Set([...Object.keys(rhythm), ...Object.keys(food), ...Object.keys(people), ...Object.keys(footfall), ...Object.keys(venues), ...Object.keys(homes)])].sort();
}

/** Test seam — blending is cached, and the cache outlives a test otherwise. */
export function resetBlendCache(): void {
  blendCache.clear();
}

export interface Stats {
  mean: number;
  sd: number;
}

/**
 * Counts are compressed before comparing; shares and ratios are not.
 *
 * Venue counts run from Barnes's 111 to Liverpool Street's 2,628 — a long
 * right tail where a handful of central areas sit enormously far from the
 * middle. Left raw, that one dimension would swamp every other: two quiet
 * suburbs would look near-identical simply because both are far from
 * Liverpool Street, and the food and rhythm shape would stop mattering.
 *
 * A log makes the meaningful comparison the RATIO rather than the gap —
 * 100 venues to 200 counts the same as 1,000 to 2,000, which is how people
 * actually experience the difference. Shares already sit on 0–1 and ratios
 * are already relative, so they are left alone.
 */
const LOG_SCALED = new Set<Dimension>(['venues', 'drinkCount', 'annualFootfall', 'cuisineCount']);

function transform(dim: Dimension, value: number): number {
  return LOG_SCALED.has(dim) ? Math.log1p(Math.max(0, value)) : value;
}

/**
 * Mean and spread per dimension across London, so dimensions on wildly
 * different scales (a share of 0.17 against a venue count of 641) can be
 * compared. Computed from the data rather than hardcoded, so it stays
 * correct when the datasets are rebuilt.
 */
export function computeStats(all: AreaFeatures[]): Record<Dimension, Stats> {
  const stats = {} as Record<Dimension, Stats>;
  for (const dim of DIMENSIONS) {
    const values = all
      .map((a) => a[dim])
      .filter((v): v is number => v !== null)
      .map((v) => transform(dim, v));
    if (values.length === 0) {
      stats[dim] = { mean: 0, sd: 1 };
      continue;
    }
    const m = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
    // A dimension with no spread would divide by zero and, worse, would
    // silently dominate; treating it as sd 1 makes it contribute nothing.
    stats[dim] = { mean: m, sd: Math.sqrt(variance) || 1 };
  }
  return stats;
}

/** Where this area sits relative to London, in standard deviations. */
export function standardise(
  a: AreaFeatures,
  stats: Record<Dimension, Stats>,
): Record<Dimension, Dim> {
  const out = {} as Record<Dimension, Dim>;
  for (const dim of DIMENSIONS) {
    const v = a[dim];
    out[dim] = v === null ? null : (transform(dim, v) - stats[dim].mean) / stats[dim].sd;
  }
  return out;
}
