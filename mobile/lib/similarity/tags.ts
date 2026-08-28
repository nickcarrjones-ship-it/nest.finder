/**
 * What someone said they like, as a small fixed vocabulary.
 *
 * The Agent is already making an API call per turn, and understanding what a
 * person meant is the job models are genuinely good at — far better than the
 * keyword matcher in similar.ts, which can only recognise phrasings somebody
 * thought of in advance. So the model emits TAGS from what it heard, and the
 * mapping from tags to dimension weights lives here in code.
 *
 * That split is deliberate. The model does language; the code does the
 * arithmetic, stays testable, and can be reasoned about when a result looks
 * wrong. Handing the model our 32 raw dimension names would be a large,
 * unstable prompt and would let it invent weightings nobody could audit.
 *
 * EVERY TAG MUST MAP TO REAL DIMENSIONS. Offering the model a tag we cannot
 * act on — "near a park", say, when no park data exists — would mean the
 * preference is heard, recorded and silently dropped. That is the exact
 * failure this project keeps finding, so the list below is deliberately
 * limited to what the six sources can actually answer.
 */

import type { Dimension } from './features';
import type { Weights } from './similar';

/** The vocabulary the Agent may use. Anything else is ignored. */
export const PREFERENCE_TAGS = {
  nightlife: ['satNight', 'nightlifeRatio', 'drinkShare', 'barToPub', 'barShare'],
  quiet: ['satNight', 'nightlifeRatio', 'peak', 'annualFootfall'],
  independent_shops: ['independentShare', 'cafeShare'],
  cafe_culture: ['cafeShare', 'independentShare', 'sitdownShare'],
  good_restaurants: ['restaurantShare', 'cuisineCount', 'venues'],
  cosmopolitan: ['cuisineCount', 'restaurantShare'],
  period_property: ['preWarShare', 'terraceShare', 'newBuildShare'],
  interwar_suburb: ['interwarShare'],
  new_build: ['newBuildShare', 'preWarShare'],
  houses_not_flats: ['houseShare', 'flatShare'],
  flats_not_houses: ['flatShare', 'houseShare'],
  spacious_homes: ['medianFloorArea'],
  low_rise: ['meanStoreys', 'tallShare'],
  high_rise: ['tallShare', 'meanStoreys'],
  family_area: ['shareUnder15', 'shareOwned', 'houseShare'],
  young_crowd: ['share20to34'],
  settled_owners: ['shareOwned', 'sharePrivateRent'],
  weekend_destination: ['weekendDay', 'weekendLean'],
  busy_centre: ['peak', 'annualFootfall', 'venues'],
  local_and_lowkey: ['annualFootfall', 'peak', 'independentShare'],
} as const satisfies Record<string, readonly Dimension[]>;

export type PreferenceTag = keyof typeof PREFERENCE_TAGS;

export const TAG_NAMES = Object.keys(PREFERENCE_TAGS) as PreferenceTag[];

/** How much a tagged dimension outweighs an untagged one. */
const TAG_WEIGHT = 3;

/**
 * Turns the Agent's tags into dimension weights.
 *
 * Unknown tags are dropped rather than guessed at — a model inventing
 * "near_a_park" should change nothing, not silently match on something else.
 */
export function weightsFromTags(tags: readonly string[] | undefined): Weights {
  const w: Weights = {};
  for (const tag of tags ?? []) {
    const dims = PREFERENCE_TAGS[tag as PreferenceTag];
    if (!dims) continue;
    for (const d of dims) w[d] = Math.max(w[d] ?? 0, TAG_WEIGHT);
  }
  return w;
}

/** The vocabulary, written for the Agent's system prompt. */
export function tagVocabularyForPrompt(): string {
  return TAG_NAMES.join(', ');
}
