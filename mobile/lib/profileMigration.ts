import type { AreaCards, Lifestyle, Profile } from './types';
import { TAG_NAMES } from './similarity/tags';

/**
 * Profiles written by the WEB app carry a preference model this build has
 * outgrown, and carrying it forward actively misleads (Nick, 2026-08-27).
 *
 * Two concrete harms, both seen in real data:
 *
 * 1. Silently ignored answers. The web app stored `nightsOut: "occasional"`,
 *    `schoolsPriority: "notrelevant"`, `safetyPriority: "somewhat"` — none of
 *    which this build's ranking recognises, so they were dropped without a
 *    word and the model never heard them. A preference that is stored but
 *    unused is worse than one that was never collected: the app looks like
 *    it asked and then ignored the answer.
 *
 * 2. Stale loved/hated areas. A profile still said Bermondsey was a "hate"
 *    long after the Agent had been told otherwise — and the ranking prompt
 *    is explicit that a hated area must not appear at all. Recommending a
 *    place someone said they hate destroys trust in every other pick.
 *
 * So a legacy profile keeps what is still true and unambiguous — who lives
 * there, where they work, their commute limits — and drops the preference
 * layer entirely. The Agent conversation collects it again properly, in
 * this build's own vocabulary. That is a better outcome than a translation
 * table: the old answers came from different questions.
 */

/** Bumped when the preference model changes shape. Absent = web-era. */
export const PROFILE_SCHEMA_VERSION = 2;

const LIFESTYLE_ENUMS: Record<string, readonly string[]> = {
  greenSpace: ['essential', 'nice', 'unimportant'],
  streetVibe: ['buzzy', 'quiet', 'village'],
  nightsOut: ['frequent', 'regular', 'rarely'],
  schoolsPriority: ['now', 'someday', 'no'],
  safetyPriority: ['veryimportant', 'important', 'flexible'],
  riverSide: ['north', 'south', 'either'],
  socialCircle: ['N', 'E', 'S', 'W'],
};

/**
 * Drops anything this build wouldn't understand, so a value can never sit
 * in a profile looking collected while being invisible to the ranking.
 */
export function sanitiseLifestyle(input: Lifestyle | undefined): Lifestyle | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, allowed] of Object.entries(LIFESTYLE_ENUMS)) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string' && allowed.includes(value)) out[key] = value;
  }
  if (typeof input.zone1Ok === 'boolean') out.zone1Ok = input.zone1Ok;
  if (Array.isArray(input.dealbreakers)) {
    const list = input.dealbreakers.filter((d) => typeof d === 'string' && d.trim());
    if (list.length) out.dealbreakers = list;
  }
  if (typeof input.freeText === 'string' && input.freeText.trim()) out.freeText = input.freeText.trim();
  // Kept separately from freeText because it does a different job: it is
  // what they like about the areas they named, and it decides which
  // measurements the similarity engine weights. Omitting it here would
  // silently strip it on every profile load.
  if (typeof input.anchorReason === 'string' && input.anchorReason.trim()) {
    out.anchorReason = input.anchorReason.trim();
  }
  /**
   * The tags were being dropped on EVERY load, healthy profile or not —
   * this function rebuilds the lifestyle from an allow-list, and they were
   * simply not on it (found reading Nick's real profile, 2026-08-31).
   *
   * They matter more than anything else here: the ranking prompt calls them
   * "what actually steers the search", and shortlistByAnchor weights the
   * similarity engine from them, falling back to keyword-matching
   * anchorReason only when they are absent. So losing them silently
   * downgraded every anchored search to the fallback path.
   *
   * Filtered against the real vocabulary for the same reason the enums are:
   * a tag the engine does not know is a preference that looks collected and
   * is invisible to the ranking.
   */
  if (Array.isArray(input.preferenceTags)) {
    const known = new Set<string>(TAG_NAMES);
    const tags = input.preferenceTags.filter((t) => typeof t === 'string' && known.has(t));
    if (tags.length) out.preferenceTags = tags;
  }
  return Object.keys(out).length ? (out as Lifestyle) : undefined;
}

function cleanAreaCards(input: AreaCards | undefined): AreaCards | undefined {
  if (!input) return undefined;
  const out: AreaCards = {};
  for (const [name, verdict] of Object.entries(input)) {
    if (name.trim() && (verdict === 'love' || verdict === 'hate')) out[name.trim()] = verdict;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Brings a profile loaded from Firebase up to this build's model. Safe to
 * run on an already-current profile — it is the same shape out.
 */
export function migrateProfile(profile: Profile): Profile {
  const isLegacy = (profile.schemaVersion ?? 0) < PROFILE_SCHEMA_VERSION;

  if (isLegacy) {
    // Keep the facts, drop the preferences — see the note above.
    const { lifestyle, areaCards, ...rest } = profile;
    return { ...rest, schemaVersion: PROFILE_SCHEMA_VERSION };
  }

  const lifestyle = sanitiseLifestyle(profile.lifestyle);
  const areaCards = cleanAreaCards(profile.areaCards);
  const next: Profile = { ...profile, schemaVersion: PROFILE_SCHEMA_VERSION };
  if (lifestyle) next.lifestyle = lifestyle; else delete next.lifestyle;
  if (areaCards) next.areaCards = areaCards; else delete next.areaCards;
  return next;
}
