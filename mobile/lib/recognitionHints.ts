import identities from '../assets/data/area-identities.json';

/**
 * London place names, handed to speech recognition as contextual hints.
 *
 * Recognition was mishearing answers (Nick, 2026-08-26), and place names are
 * the obvious culprit: "Nunhead", "Ladywell" and "Tooting Bec" sit well
 * outside a general English model's vocabulary, yet they are exactly what
 * the first two questions ask for. The app already knows all of them.
 *
 * CAPPED, deliberately. The full map yields ~800 names, and the platforms
 * treat this as a hint list rather than a dictionary — iOS recommends
 * keeping it small, and an oversized list can make recognition worse rather
 * than better. So this takes the areas covering the most stations first,
 * which is a decent proxy for the ones people actually say out loud, then
 * fills the remainder alphabetically for stability.
 *
 * If recognition gets WORSE rather than better, this cap is the first thing
 * to reduce — it is the one change here that could cut either way.
 */
const MAX_HINTS = 100;

const map = identities as Record<string, string>;

// How many stations resolve to each neighbourhood — bigger areas are the
// better-known ones, and the ones most likely to be named.
const weight = new Map<string, number>();
for (const neighbourhood of Object.values(map)) {
  weight.set(neighbourhood, (weight.get(neighbourhood) ?? 0) + 1);
}

const byLikelihood = [...weight.entries()]
  .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
  .map(([name]) => name);

const rest = Object.keys(map).sort();

export const RECOGNITION_HINTS: string[] = [
  ...new Set([...byLikelihood, ...rest]),
].slice(0, MAX_HINTS);
