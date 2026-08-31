import type { Dimension } from './features';

/**
 * What each measured dimension is called, in words a person would use.
 *
 * `sharedTraits` comes out of the engine as raw keys — `satNight`,
 * `independentShare`, `majorParkHa` — and there was nowhere in the app that
 * turned one into English, because until now nothing ever showed them. This
 * is that map (2026-08-31).
 *
 * Two rules carried over from describe.ts, and they matter as much here:
 *
 *  1. NEVER QUOTE THE RAW BUSYNESS FIGURE. TfL's percentageOfBaseLine has
 *     no published definition, so comparisons between areas are honest and
 *     absolute numbers are not. Every busyness phrase below is written to
 *     be completed by a comparison, never by a value.
 *  2. SAY WHAT WAS MEASURED, not what it implies. "How busy it gets on a
 *     Saturday night" is a measurement. "Good nightlife" is a judgement
 *     the number does not support — a station is busy at 10pm whether
 *     people are arriving for a night out or leaving a shift.
 *
 * Phrases are written to follow "both have similar…" or "they share…", so
 * they are noun phrases, lower case, and carry no verb of their own.
 */
export const DIMENSION_LABELS: Record<Dimension, string> = {
  // Busyness — TfL crowding and ORR footfall.
  peak: 'how busy they get at rush hour',
  satNight: 'how busy they get on a Saturday night',
  weekendDay: 'how busy they are at the weekend',
  weekdayMorning: 'the weekday morning rush',
  nightlifeRatio: 'how much of their activity happens after dark',
  weekendLean: 'how much busier they are at weekends than midweek',
  annualFootfall: 'how many people pass through',

  // Food — the FSA register.
  sitdownShare: 'how much of the food is sit-down rather than takeaway',
  takeawayShare: 'how many takeaways there are',
  drinkShare: 'how much of the food and drink is pubs and bars',
  independentShare: 'independent places rather than chains',
  venues: 'how many places there are to eat and drink',
  drinkCount: 'the number of pubs and bars',

  // People — Census 2021.
  share20to34: 'how many people in their twenties and early thirties live there',
  shareUnder15: 'how many children live there',
  share65plus: 'how many older people live there',
  sharePrivateRent: 'how much of the housing is privately rented',
  shareOwned: 'how many people own their home',
  residentsPerVenue: 'the balance between people who live there and places to eat',

  // Venue type — OpenStreetMap.
  cafeShare: 'how many cafés there are',
  restaurantShare: 'how many restaurants there are',
  barShare: 'how many bars there are',
  barToPub: 'whether it leans towards bars or pubs',
  cuisineCount: 'the range of different cuisines',

  // Built form — OSM buildings.
  flatShare: 'how much of the housing is flats',
  houseShare: 'how much of the housing is houses',
  terraceShare: 'how many terraced streets there are',
  meanStoreys: 'how tall the buildings are',
  tallShare: 'how many tall buildings there are',

  // Age and size — EPC certificates.
  preWarShare: 'how much of the housing is pre-war',
  interwarShare: 'how much of the housing is between the wars',
  newBuildShare: 'how much of the housing is new build',
  medianFloorArea: 'how big the homes are',

  // Green space — OSM parks and commons.
  majorParkHa: 'a big park within walking distance',
  greenSpaceHa: 'how much green space is nearby',
};

/** The phrase for a dimension, or null if it is one we have no words for. */
export function labelFor(dimension: string): string | null {
  return DIMENSION_LABELS[dimension as Dimension] ?? null;
}

/**
 * "a big park within walking distance, independent places rather than
 * chains, and how busy they get on a Saturday night"
 *
 * Caps at three. More than three stops being a reason and starts being a
 * readout — and the engine only reports the top three anyway.
 */
export function traitsSentence(traits: readonly string[], max = 3): string {
  const phrases = traits.map(labelFor).filter((p): p is string => p !== null).slice(0, max);
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}
